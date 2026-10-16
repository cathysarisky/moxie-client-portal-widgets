'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, tick, plain } = require('./helpers');

test('a snippet registered after the app is found runs once', () => {
  const t = boot();
  let runs = 0;
  t.MoxiePortal.ready(() => { runs++; });
  assert.equal(runs, 1);
});

test('a snippet registered before the app is found runs once it appears', async () => {
  const t = boot({ attachLater: true });
  let runs = 0;
  t.MoxiePortal.ready(() => { runs++; });
  assert.equal(runs, 0);
  t.attach();
  await tick(250);
  assert.equal(runs, 1);
});

test('the client filter blocks a client until its custom values match, ignoring case', () => {
  const t = boot({ customValues: [] });
  let runs = 0;
  t.MoxiePortal.ready(() => { runs++; });
  assert.equal(runs, 0);
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: ' test ' }];
  t.store.notify();
  assert.equal(runs, 1);
});

test('a null filter runs for every client', () => {
  const t = boot({ filter: null, customValues: [] });
  let runs = 0;
  t.MoxiePortal.ready(() => { runs++; });
  assert.equal(runs, 1);
});

test('a client change runs cleanup, then runs snippets again for a matching client', () => {
  const t = boot();
  const log = [];
  t.MoxiePortal.ready((portal) => { log.push('run ' + portal.clientId()); return () => log.push('cleanup'); });
  t.store.getters.getClientId = 'client-2';
  t.store.notify();
  assert.deepEqual(log, ['run client-1', 'cleanup', 'run client-2']);
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'Other' }];
  t.store.notify();
  assert.deepEqual(log, ['run client-1', 'cleanup', 'run client-2', 'cleanup']);
});

test('a throwing snippet is reported and does not stop the next one', () => {
  const t = boot();
  let ran = false;
  t.MoxiePortal.ready(() => { throw new Error('boom'); });
  t.MoxiePortal.ready(() => { ran = true; });
  assert.equal(ran, true);
  assert.equal(t.warns.length, 1);
  assert.match(String(t.warns[0][0]), /\[MoxiePortal\] snippet failed/);
});

test('loading the parent twice is a no-op the second time', () => {
  const t = boot();
  const first = t.MoxiePortal;
  t.window.eval(t.source);
  assert.equal(t.window.MoxiePortal, first);
  let runs = 0;
  t.MoxiePortal.ready(() => { runs++; });
  assert.equal(runs, 1);
});

test('portal exposes the app and client basics', () => {
  const t = boot();
  let seen;
  t.MoxiePortal.ready((portal) => { seen = portal; });
  assert.equal(seen.store, t.store);
  assert.equal(seen.router, t.router);
  assert.deepEqual(plain(seen.clientValues()), { ClientType: 'TEST' });
  assert.equal(seen.user().id, 'me');
  assert.equal(seen.features().projectsEnabled, true);
  seen.go('/requests');
  assert.equal(t.router.currentRoute.path, '/requests');
});

test('portal.style adds a stylesheet that disappears when the client changes', () => {
  const t = boot();
  t.MoxiePortal.ready((portal) => { portal.style('.x { color: red; }'); });
  const styles = () => [...t.document.head.querySelectorAll('style')].filter((s) => s.textContent.includes('.x {'));
  assert.equal(styles().length, 1);
  t.store.getters.getClientId = 'client-2';
  t.store.notify();
  assert.equal(styles().length, 1, 'the new activation added its own copy');
  t.store.state.clientPortalContext.client.customValues = [];
  t.store.notify();
  assert.equal(styles().length, 0);
});

test('onDom fires once per frame after DOM changes and stops after deactivation', async () => {
  const t = boot();
  let calls = 0;
  t.MoxiePortal.ready((portal) => { portal.onDom(() => { calls++; }); });
  t.document.body.appendChild(t.document.createElement('p'));
  t.document.body.appendChild(t.document.createElement('p'));
  await tick();
  assert.equal(calls, 1);
  t.store.state.clientPortalContext.client.customValues = [];
  t.store.notify();
  t.document.body.appendChild(t.document.createElement('p'));
  await tick();
  assert.equal(calls, 1);
});

test('onRoute fires after navigation with to and from', async () => {
  const t = boot();
  const seen = [];
  t.MoxiePortal.ready((portal) => { portal.onRoute((to, from) => { seen.push(from.path + '>' + to.path); }); });
  t.router.push('/projects');
  await tick();
  assert.deepEqual(seen, ['/welcome>/projects']);
});

test('a throwing hook is reported and does not stop other hooks', async () => {
  const t = boot();
  let ok = 0;
  t.MoxiePortal.ready((portal) => {
    portal.onRoute(() => { throw new Error('bad hook'); });
    portal.onRoute(() => { ok++; });
  });
  t.router.push('/projects');
  await tick();
  assert.equal(ok, 1);
  assert.match(String(t.warns[0][0]), /onRoute hook failed/);
});

test('portal.api fetches the portal endpoint with the bearer token and rejects on errors', async () => {
  const t = boot({ responses: { '/projects': [{ id: 'p1' }] } });
  let portal;
  t.MoxiePortal.ready((p) => { portal = p; });
  const projects = await portal.api('/projects');
  assert.deepEqual(plain(projects), [{ id: 'p1' }]);
  assert.equal(t.calls[0], 'https://pod.test/api/v1/42/portal/client-1/projects');
  await assert.rejects(portal.api('/nope'), /HTTP 404/);
});

const fixtures = () => ({
  '/projects': [
    { id: 'p1', name: 'Beta site', active: true, portalAccess: 'Full access', lifecycleStatus: 'ACTIVE' },
    { id: 'p2', name: 'Alpha site', active: true, portalAccess: 'Overview', lifecycleStatus: 'ACTIVE' },
    { id: 'p3', name: 'Old', active: false, portalAccess: 'Full access', lifecycleStatus: 'ACTIVE' },
    { id: 'p4', name: 'Assigned only', active: true, portalAccess: 'Read only', lifecycleStatus: 'ACTIVE', portalAccessAssignedOnly: true }
  ],
  '/projectTypes': [
    { id: 't1', statusList: [{ id: 's1', label: 'Wait on client', hexColor: '#f00' }, { id: 's2', label: 'In progress', hexColor: '#0f0' }] }
  ],
  '/deliverables?projectTypeId=t1': [
    { id: 'd1', name: 'Zed task', projectId: 'p1', statusId: 's1', dueDate: '2026-11-02' },
    { id: 'd2', name: 'Able task', projectId: 'p1', statusId: 's1' },
    { id: 'd3', name: 'Done', projectId: 'p1', statusId: 's2' },
    { id: 'd4', name: 'Hidden project', projectId: 'p2', statusId: 's1' },
    { id: 'd5', name: 'Archived', projectId: 'p1', statusId: 's1', archived: true },
    { id: 'd6', name: 'Mine', projectId: 'p4', statusId: 's1', assignedToList: ['me'] },
    { id: 'd7', name: 'Not mine', projectId: 'p4', statusId: 's1', assignedToList: ['someone'] }
  ],
  '/tickets?open=true': [
    { id: 'k1', subject: 'Older', updated: '2026-10-01T00:00:00Z' },
    { id: 'k2', subject: 'Newer', updated: '2026-10-10T00:00:00Z' },
    { id: 'k3', subject: 'Closed', open: false, updated: '2026-10-12T00:00:00Z' },
    { id: 'k4', subject: 'Archived', archived: true, updated: '2026-10-12T00:00:00Z' }
  ],
  '/tickets/settings': [{ id: 'tt1', statusColors: [] }]
});

function withPortal(opts) {
  const t = boot(opts);
  t.MoxiePortal.ready((p) => { t.portal = p; });
  return t;
}

test('data getters fetch once until refresh', async () => {
  const t = withPortal({ responses: fixtures() });
  const a = await t.portal.data.projects();
  const b = await t.portal.data.projects();
  assert.equal(a, b);
  assert.equal(t.calls.filter((u) => u.endsWith('/projects')).length, 1);
  t.portal.data.refresh();
  await t.portal.data.projects();
  assert.equal(t.calls.filter((u) => u.endsWith('/projects')).length, 2);
});

test('a failed fetch is not cached', async () => {
  const t = withPortal({ responses: {} });
  await assert.rejects(t.portal.data.projects(), /HTTP 404/);
  await assert.rejects(t.portal.data.projects(), /HTTP 404/);
  assert.equal(t.calls.length, 2);
});

test('tasks joins deliverables with project and status, applying the portal visibility rules', async () => {
  const t = withPortal({ responses: fixtures() });
  const items = await t.portal.data.tasks();
  assert.deepEqual(plain(items.map((i) => i.task.id).sort()), ['d1', 'd2', 'd3', 'd6']);
  const d1 = items.find((i) => i.task.id === 'd1');
  assert.equal(d1.project.name, 'Beta site');
  assert.equal(d1.status.label, 'Wait on client');
  assert.equal(d1.statusList.length, 2);
});

test('waitingTasks keeps WAITING_STATUSES only, due dates first then by name', async () => {
  const t = withPortal({ responses: fixtures() });
  const waiting = await t.portal.data.waitingTasks();
  assert.deepEqual(plain(waiting.map((i) => i.task.id)), ['d1', 'd2', 'd6']);
});

test('tickets are open, unarchived, newest first; settings are passed through', async () => {
  const t = withPortal({ responses: fixtures() });
  const tickets = await t.portal.data.tickets();
  assert.deepEqual(plain(tickets.map((k) => k.id)), ['k2', 'k1']);
  assert.equal((await t.portal.data.ticketSettings())[0].id, 'tt1');
});

test('disabled features resolve to empty lists without fetching', async () => {
  const t = withPortal({ responses: fixtures(), features: { projectsEnabled: false, ticketsEnabled: false } });
  assert.deepEqual(plain(await t.portal.data.projects()), []);
  assert.deepEqual(plain(await t.portal.data.tasks()), []);
  assert.deepEqual(plain(await t.portal.data.tickets()), []);
  assert.deepEqual(plain(await t.portal.data.ticketSettings()), []);
  assert.equal(t.calls.length, 0);
});

test('the cache is cleared when the client changes', async () => {
  const t = withPortal({ responses: fixtures() });
  await t.portal.data.projects();
  t.store.getters.getClientId = 'client-2';
  t.store.notify();
  await t.portal.data.projects();
  assert.equal(t.calls.filter((u) => u.endsWith('/projects')).length, 2);
  assert.match(t.calls[t.calls.length - 1], /client-2\/projects$/);
});

test('tasks.visible follows the portal rule and tasks.open opens the side panel', async () => {
  const t = withPortal({ responses: Object.assign(fixtures(), { '/deliverables/d1': { id: 'd1', full: true } }) });
  assert.equal(t.portal.tasks.visible({ active: true, portalAccess: 'Read only', lifecycleStatus: 'ACTIVE' }), true);
  assert.equal(t.portal.tasks.visible({ active: true, portalAccess: 'Overview', lifecycleStatus: 'ACTIVE' }), false);
  assert.equal(t.portal.tasks.visible({ active: true, portalAccess: 'Full access', lifecycleStatus: 'PAUSED' }), false);
  const opened = [];
  t.store.state.globalModalController.openModal = (...args) => { opened.push(args); return Promise.resolve(); };
  const item = { task: { id: 'd1' }, project: { id: 'p1' }, statusList: [] };
  await t.portal.tasks.open(item);
  assert.equal(opened[0][0].name, 'DeliverableDetail');
  assert.deepEqual(plain(opened[0][1]), { origDeliverable: { id: 'd1', full: true }, project: { id: 'p1' }, statusList: [], subtasks: [] });
  assert.deepEqual(opened[0].slice(2), [true, false, 'right-panel']);
});

test('tasks.open falls back to the project board when the panel cannot open', async () => {
  const t = withPortal({ responses: fixtures() });
  await t.portal.tasks.open({ task: { id: 'missing' }, project: { id: 'p1' }, statusList: [] });
  assert.equal(t.router.currentRoute.path, '/projects/p1');
  assert.equal(t.router.currentRoute.query.v, 'tasks');
});

test('card builds a header with icon, title, count and optional open arrow', () => {
  const t = withPortal();
  const p = t.portal;
  const card = p.card({ title: 'Requests', icon: p.icons.ticket, count: 3, openPath: '/requests' });
  assert.equal(card.tagName, 'SECTION');
  assert.equal(card.className, 'mp-card');
  assert.equal(card.querySelector('.mp-head h3').textContent, 'Requests');
  assert.equal(card.querySelector('.mp-count').textContent, '3');
  assert.equal(card.querySelector('.mp-icon svg path').getAttribute('d'), 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z');
  card.querySelector('.mp-open').click();
  assert.equal(t.router.currentRoute.path, '/requests');
  const plainCard = p.card({ title: 'Waiting', icon: p.icons.tasks, count: 0 });
  assert.equal(plainCard.querySelector('.mp-open'), null);
});

test('row, empty and footer build the portal-styled pieces', () => {
  const t = withPortal();
  const p = t.portal;
  let clicked = 0;
  const r = p.row('Fix nav', 'Wait on client · Beta', '#ff0000', () => { clicked++; });
  assert.equal(r.tagName, 'BUTTON');
  assert.equal(r.type, 'button');
  assert.equal(r.className, 'portal-action-row');
  assert.equal(r.querySelector('strong').textContent, 'Fix nav');
  assert.equal(r.querySelector('small').textContent, 'Wait on client · Beta');
  assert.equal(r.querySelector('.mp-dot').style.background, 'rgb(255, 0, 0)');
  r.click();
  assert.equal(clicked, 1);
  assert.equal(p.row('No meta', null, null, () => {}).querySelector('small'), null);
  assert.equal(p.empty('Nothing').outerHTML, '<p class="mp-empty">Nothing</p>');
  const f = p.footer('View board', () => { clicked++; });
  assert.equal(f.className, 'mp-footer');
  assert.equal(f.querySelector('span').textContent, 'View board');
  f.click();
  assert.equal(clicked, 2);
});

test('timeAgo and formatDue', () => {
  const t = withPortal();
  const p = t.portal;
  const now = Date.now();
  assert.equal(p.timeAgo(now), 'just now');
  assert.equal(p.timeAgo(now - 5 * 60000), '5 min ago');
  assert.equal(p.timeAgo(now - 60 * 60000), '1 hour ago');
  assert.equal(p.timeAgo(now - 3 * 3600000), '3 hours ago');
  assert.equal(p.timeAgo(now - 26 * 3600000), 'yesterday');
  assert.equal(p.timeAgo(now - 72 * 3600000), '3 days ago');
  assert.equal(p.formatDue('2026-11-02T00:00:00'), 'Due Nov 2');
  assert.equal(p.formatDue(null), null);
  assert.equal(p.formatDue('garbage'), null);
});

test('shared card CSS is injected once with mp- names and nothing swc', () => {
  const t = boot();
  const style = t.document.getElementById('mp-shared-style');
  assert.ok(style);
  assert.match(style.textContent, /\.mp-card \{/);
  assert.match(style.textContent, /\[data-mp-hidden\]/);
  assert.doesNotMatch(t.source, /swc/i);
});
