'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

const PAGE = '<div class="welcome-page"><header class="welcome-heading"><h1>Hello</h1></header><div class="action-dashboard"></div></div>';

const PROJECT = { id: 'p1', name: 'Website', active: true, portalAccess: 'Full access', lifecycleStatus: 'ACTIVE', projectTypeId: 'pt1' };
const TYPE = { id: 'pt1', name: 'Build', statusList: [{ id: 's1', label: 'Ready for approval' }, { id: 's2', label: 'Done', complete: true }] };
const APPROVE = { id: 't1', name: 'Approve the homepage', projectId: 'p1', statusId: 's1', dueDate: null };
const DONE = { id: 't2', name: 'Kickoff call', projectId: 'p1', statusId: 's2' };
const TICKET = { id: 'k1', subject: 'Domain question', status: 'Waiting on client', ticketNumber: 7, updated: '2026-10-17T10:00:00Z' };

function responses(extra) {
  return Object.assign({
    '/projects': [PROJECT],
    '/projectTypes': [TYPE],
    '/deliverables?projectTypeId=pt1': [APPROVE, DONE],
    '/tickets?open=true': [TICKET],
    '/tickets/settings': []
  }, extra);
}

async function start(opts = {}, settings = {}) {
  const t = boot(Object.assign({ html: PAGE, route: '/welcome', responses: responses() }, opts));
  t.MoxiePortal.ready((portal) => { t.portal = portal; });
  loadSnippet(t, 'home-greeting', settings);
  await tick();
  return t;
}
const band = (t) => t.document.getElementById('mp-greeting');
const text = (t, sel) => band(t).querySelector(sel).textContent;

test('greets the viewer and counts what is waiting, by verb', async () => {
  const t = await start();
  assert.ok(band(t));
  assert.equal(text(t, 'h2'), 'Hi Pat, here\'s where things stand.');
  assert.equal(text(t, '.mp-g-text'), '2 items need something from you: 1 to approve and 1 request reply.');
  assert.equal(band(t).querySelector('.mp-g-btn').textContent, 'See what\'s waiting');
  assert.match(text(t, '.mp-g-status'), /^1 project active · nothing overdue/);
});

test('with no meeting booked, Next up shows the first waiting task and a pick-a-time link', async () => {
  const t = await start();
  assert.equal(text(t, '.mp-g-next strong'), 'Approve the homepage');
  assert.match(text(t, '.mp-g-next small'), /No call booked/);
  band(t).querySelector('.mp-g-next small button').click();
  await tick();
  assert.equal(t.router.currentRoute.path, '/meetings/schedulers');
});

test('a project with no due date gets a tasks-done bar', async () => {
  const t = await start();
  const bars = band(t).querySelectorAll('.mp-g-bar');
  assert.equal(bars.length, 1);
  assert.equal(bars[0].querySelector('.mp-g-bar-head span').textContent, 'Website');
  assert.equal(bars[0].querySelector('.mp-g-bar-head b').textContent, '1 of 2 done');
  assert.equal(bars[0].querySelector('.mp-g-fill').style.width, '50%');
});

test('nothing waiting: the empty headline, and the button opens projects', async () => {
  const t = await start({ responses: responses({ '/deliverables?projectTypeId=pt1': [DONE], '/tickets?open=true': [] }) });
  assert.equal(text(t, 'h2'), 'Hi Pat, nothing needs you right now.');
  const btn = band(t).querySelector('.mp-g-btn');
  assert.equal(btn.textContent, 'See your projects');
  btn.click();
  await tick();
  assert.equal(t.router.currentRoute.path, '/projects');
});

test('the next booked meeting replaces the task in Next up', async () => {
  const soon = new Date(Date.now() + 3 * 864e5).toISOString();
  const t = await start({ responses: responses({ '/meetings': [{ name: 'Monthly review', startTime: soon }, { name: 'Old', startTime: '2020-01-01T10:00:00Z' }] }) });
  assert.equal(text(t, '.mp-g-next strong'), 'Monthly review');
  assert.equal(band(t).querySelector('.mp-g-next small'), null);
});

test('retainer projects show hours used against the client\'s cap', async () => {
  const now = new Date().toISOString();
  const t = await start({
    customValues: [{ mappingKey: 'ClientType', value: 'TEST' }, { mappingKey: 'RetainerHours', value: '10' }],
    features: { timeEnabled: true },
    responses: responses({ '/timer': [{ timerStart: now, duration: 7200 }, { timerStart: '2020-01-01T00:00:00Z', duration: 9999 }] })
  }, { RETAINER_TYPES: ['build'] });
  const bar = band(t).querySelector('.mp-g-bar');
  assert.equal(bar.querySelector('.mp-g-bar-head span').textContent, 'Website · retainer');
  assert.equal(bar.querySelector('.mp-g-bar-head b').textContent, '2 of 10 h');
  assert.equal(bar.querySelector('.mp-g-fill').style.width, '20%');
});

test('HIDE_HEADING and HIDE_WELCOME are off by default', async () => {
  const t = await start();
  const css = [...t.document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  assert.doesNotMatch(css, /welcome-heading \{ display: none/);
  const hidden = await start({}, { HIDE_HEADING: true });
  const css2 = [...hidden.document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  assert.match(css2, /welcome-heading \{ display: none/);
});

test('tasks and projects without a due date are never overdue', async () => {
  const t = await start();
  assert.match(text(t, '.mp-g-status'), /nothing overdue/);
  assert.doesNotMatch(band(t).querySelector('.mp-g-bar-head b').textContent, /over/);
});
