'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

const PAGE = '<div class="welcome-page"><h1>Hello</h1><div class="action-dashboard"></div></div>';

// Trimmed from the live capture of 2026-10-17 (test client, contact -64).
const DEPOSIT_INVOICE = { id: 'inv-11', invoiceNumberFormatted: 'TCW-2026-11', status: 'PAID', total: 100, itemSubtotal: 100, creditAmount: 0, paymentTotal: 100, amountDue: 0, dateSent: '2026-10-17', payments: [{ amount: 100, datePaid: '2026-10-17' }] };
const HOURS_INVOICE = { id: 'inv-13', invoiceNumberFormatted: 'TCW-2026-13', status: 'PAID', total: 0, itemSubtotal: 32, creditAmount: 32, paymentTotal: 0, amountDue: 0, dateSent: '2026-10-17', payments: [] };
const SENT_INVOICE = { id: 'inv-14', invoiceNumberFormatted: 'TCW-2026-14', status: 'SENT', total: 120, itemSubtotal: 120, creditAmount: 0, paymentTotal: 0, amountDue: 120, dateSent: '2026-10-18', payments: [] };
const PARTIAL_INVOICE = { id: 'inv-15', invoiceNumberFormatted: 'TCW-2026-15', status: 'PARTIAL', total: 200, itemSubtotal: 200, creditAmount: 0, paymentTotal: 50, amountDue: 150, dateSent: '2026-10-18', payments: [{ amount: 50, datePaid: '2026-10-19' }] };
const DRAFT_INVOICE = { id: 'inv-16', status: 'DRAFT', total: 999, paymentTotal: 0, amountDue: 999, dateSent: null, payments: [] };
const VOIDED_INVOICE = { id: 'inv-17', status: 'VOIDED', total: 500, paymentTotal: 0, amountDue: 500, dateSent: '2026-10-01', payments: [] };
const DEPOSITS = { liabilities: 100, credits: 32, balance: 68 };
const BILLED = { id: 't-billed', billable: true, billingStatus: 'BILLED', billingReason: 'INVOICED', billingRate: null, unbilledSeconds: 0, duration: 1140, invoiceId: 'inv-13', timerStart: '2026-10-17T13:50:59.697Z' };
const UNBILLED = { id: 't-open', billable: true, billingStatus: 'UN-BILLED', billingReason: 'CLIENT_HOURLY', billingRate: 100, unbilledSeconds: 300, duration: 300, invoiceId: null, timerStart: '2026-10-17T13:54:30.624Z' };

// fakeStore only sets projectsEnabled/ticketsEnabled, so turn invoices and time on unless a test says otherwise.
async function start(responses, opts = {}, settings = {}) {
  const features = Object.assign({ invoicesEnabled: true, timeEnabled: true }, opts.features);
  const t = boot(Object.assign({ html: PAGE, route: '/welcome', responses }, opts, { features }));
  loadSnippet(t, 'home-billing', settings);
  await tick();
  return t;
}
const card = (t) => t.document.getElementById('mp-billing');
const section = (t, key) => card(t).querySelector('[data-mp-section="' + key + '"]');
function stats(t, key) {
  const out = {};
  section(t, key).querySelectorAll('.mp-stat').forEach((row) => {
    out[row.querySelector('.mp-stat-label').textContent] = row.querySelector('.mp-stat-value').textContent;
  });
  return out;
}

test('mirrors the Reports tab for the live sample', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, HOURS_INVOICE], '/deposits': DEPOSITS, '/timer': [BILLED, UNBILLED] });
  assert.ok(card(t));
  assert.equal(card(t).querySelector('h3').textContent, 'Billing');
  assert.equal(section(t, 'invoices').querySelector('.mp-section-title').textContent, 'Invoices');
  assert.deepEqual(stats(t, 'invoices'), {
    'Total invoiced': '$100.00',
    'Total paid': '$100.00',
    'Unpaid invoices': 'None',
    'Deposits collected': '$100.00',
    'Deposits applied': '$32.00',
    'Balance remaining': '$68.00'
  });
});

test('counts only sent and partial invoices as unpaid and ignores draft and voided ones', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, SENT_INVOICE, PARTIAL_INVOICE, DRAFT_INVOICE, VOIDED_INVOICE], '/deposits': null, '/timer': [] });
  const s = stats(t, 'invoices');
  assert.equal(s['Total invoiced'], '$420.00');
  assert.equal(s['Total paid'], '$150.00');
  assert.equal(s['Unpaid invoices'], '2 · $270.00');
  assert.equal(s['Deposits collected'], undefined);
});

test('a failed or empty deposits call just drops the deposit rows', async () => {
  for (const deposits of [undefined, {}, { liabilities: 0, credits: 0, balance: 0 }]) {
    const responses = { '/invoices': [DEPOSIT_INVOICE], '/timer': [] };
    if (deposits !== undefined) responses['/deposits'] = deposits;
    const t = await start(responses);
    assert.ok(card(t), 'card renders');
    assert.equal(stats(t, 'invoices')['Balance remaining'], undefined);
    assert.equal(t.warns.length, 0);
  }
});

test('hides the invoices section when invoices are off, and the whole card when time is off too', async () => {
  const t = await start({ '/timer': [] }, { features: { invoicesEnabled: false, timeEnabled: true } });
  assert.ok(card(t));
  assert.equal(section(t, 'invoices'), null);
  const none = await start({}, { features: { invoicesEnabled: false, timeEnabled: false } });
  assert.equal(card(none), null);
});
