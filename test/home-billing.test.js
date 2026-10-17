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
  if (opts.beforeLoad) opts.beforeLoad(t);
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

const UNPRICED = { id: 't-fixed', billable: true, billingStatus: 'UN-BILLED', billingReason: 'PROJECT_FIXED', billingRate: null, unbilledSeconds: 1800, duration: 1800, invoiceId: null, timerStart: '2026-10-15T09:00:00.000Z' };
const NON_BILLABLE = { id: 't-free', billable: false, billingStatus: 'UN-BILLED', billingReason: 'NON_BILLABLE', billingRate: 100, unbilledSeconds: 7200, duration: 7200, invoiceId: null, timerStart: '2026-10-16T09:00:00.000Z' };

test('sums un-billed hours and prices them at the rate Moxie stamped on each entry', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [BILLED, UNBILLED] });
  assert.equal(section(t, 'unbilled').querySelector('.mp-section-title').textContent, 'Not yet invoiced');
  assert.deepEqual(stats(t, 'unbilled'), { 'Hours': '0:05', 'Entries': '1 · since Oct 17', 'Estimated amount': 'about $8.33' });
});

test('names un-priced time and leaves non-billable time out', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [UNBILLED, UNPRICED, NON_BILLABLE] });
  assert.deepEqual(stats(t, 'unbilled'), { 'Hours': '0:35', 'Entries': '2 · since Oct 15', 'Estimated amount': 'about $8.33 (+ 0:30 not priced)' });
  const only = await start({ '/invoices': [], '/deposits': null, '/timer': [UNPRICED] });
  assert.equal(stats(only, 'unbilled')['Estimated amount'], 'not priced yet');
});

test('falls back to invoiceId when billingStatus is missing', async () => {
  const legacyOpen = { id: 'l1', billable: true, billingRate: 50, unbilledSeconds: 3600, duration: 3600, invoiceId: null, timerStart: '2026-10-10T09:00:00.000Z' };
  const legacyBilled = { id: 'l2', billable: true, billingRate: 50, unbilledSeconds: 3600, duration: 3600, invoiceId: 'inv-1', timerStart: '2026-10-10T09:00:00.000Z' };
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [legacyOpen, legacyBilled] });
  assert.equal(stats(t, 'unbilled')['Hours'], '1:00');
  assert.equal(stats(t, 'unbilled')['Estimated amount'], 'about $50.00');
});

test('shows the empty line when nothing is un-billed, and no section when time is off', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [BILLED] });
  assert.equal(section(t, 'unbilled').querySelector('.mp-empty').textContent, 'Nothing waiting to be invoiced.');
  assert.equal(section(t, 'unbilled').querySelector('.mp-stat'), null);
  const off = await start({ '/invoices': [DEPOSIT_INVOICE], '/deposits': null }, { features: { timeEnabled: false } });
  assert.equal(section(off, 'unbilled'), null);
});

const netOf = (t) => ({
  value: section(t, 'net').querySelector('.mp-net-value').textContent,
  label: section(t, 'net').querySelector('.mp-net-label').textContent,
  note: section(t, 'net').querySelector('.mp-net-note').textContent
});
const footers = (t) => [...card(t).querySelectorAll('.mp-footer span')].map((s) => s.textContent);

test('credit remaining for the live sample', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, HOURS_INVOICE], '/deposits': DEPOSITS, '/timer': [BILLED, UNBILLED] });
  assert.deepEqual(netOf(t), { value: '$59.67', label: 'Credit remaining', note: 'Deposit balance $68.00 − unbilled work about $8.33 (0:05)' });
  assert.deepEqual(footers(t), ['View invoices', 'View time worked']);
  assert.equal(section(t, 'net').querySelector('.mp-section-title').textContent, 'Where you stand');
});

test('balance due when unpaid invoices and unbilled work exceed the deposit', async () => {
  const t = await start({ '/invoices': [SENT_INVOICE, PARTIAL_INVOICE], '/deposits': DEPOSITS, '/timer': [UNBILLED, UNPRICED] });
  assert.deepEqual(netOf(t), { value: '$210.33', label: 'Balance due', note: 'Deposit balance $68.00 − unpaid invoices $270.00 − unbilled work about $8.33 (0:05) · 0:30 of unbilled time not included' });
});

test('balance due with no deposit reads as a sum', async () => {
  const t = await start({ '/invoices': [SENT_INVOICE], '/deposits': null, '/timer': [UNBILLED] });
  assert.deepEqual(netOf(t), { value: '$128.33', label: 'Balance due', note: 'Unpaid invoices $120.00 + unbilled work about $8.33 (0:05)' });
});

test('all settled when nothing is outstanding', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE], '/deposits': null, '/timer': [BILLED] });
  assert.deepEqual(netOf(t), { value: '$0.00', label: 'All settled', note: 'Nothing outstanding.' });
});

test('net and estimate agree to the cent', async () => {
  const tiny = (id) => ({ id, billable: true, billingStatus: 'UN-BILLED', billingRate: 100, unbilledSeconds: 1, duration: 1, invoiceId: null, timerStart: '2026-10-17T10:00:00.000Z' });
  const t = await start({ '/invoices': [], '/deposits': { liabilities: 10, credits: 0, balance: 10 }, '/timer': [tiny('a'), tiny('b'), tiny('c')] });
  assert.equal(stats(t, 'unbilled')['Estimated amount'], 'about $0.08');
  assert.deepEqual(netOf(t), { value: '$9.92', label: 'Credit remaining', note: 'Deposit balance $10.00 − unbilled work about $0.08 (0:00)' });
});

test('with invoices off the net comes from time alone and the arrow opens the Time page', async () => {
  const t = await start({ '/timer': [UNBILLED] }, { features: { invoicesEnabled: false } });
  assert.deepEqual(netOf(t), { value: '$8.33', label: 'Balance due', note: 'Unbilled work about $8.33 (0:05)' });
  assert.deepEqual(footers(t), ['View time worked']);
  card(t).querySelector('.mp-open').click();
  assert.equal(t.router.currentRoute.path, '/time');
});

test('a deposits call that fails for any reason other than 404 drops the card rather than guessing', async () => {
  const fail500 = (t) => {
    const orig = t.window.fetch;
    t.window.fetch = (url) => url.endsWith('/deposits')
      ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      : orig(url);
  };
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, HOURS_INVOICE], '/deposits': DEPOSITS, '/timer': [BILLED, UNBILLED] }, { beforeLoad: fail500 });
  assert.equal(card(t), null);
  assert.equal(t.warns.length, 1);
  assert.match(String(t.warns[0][0]), /mp-billing/);
});

test('section headings and the net block are left-aligned whatever the portal centres', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE], '/deposits': DEPOSITS, '/timer': [UNBILLED] });
  const css = [...t.document.head.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  assert.match(css, /#mp-billing \.mp-billing-section \{[^}]*text-align: left/);
  assert.match(css, /#mp-billing \.mp-section-title \{[^}]*text-align: left/);
  assert.match(css, /#mp-billing \.mp-net \{[^}]*align-items: flex-start[^}]*text-align: left/);
});
