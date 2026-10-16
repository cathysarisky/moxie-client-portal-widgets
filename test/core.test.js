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
  assert.match(style.textContent, /#mp-home \.mp-row \{/);
  assert.doesNotMatch(t.source, /swc/i);
});

const WELCOME_WITH_DASHBOARD = `
  <div class="welcome-page">
    <h1>Hello</h1>
    <div class="action-dashboard">
      <div class="portal-action-card" id="builtin-tickets"></div>
      <div class="portal-action-card" id="builtin-deliverables"></div>
    </div>
  </div>`;

const WELCOME_WITHOUT_DASHBOARD = `
  <div class="welcome-page">
    <h1>Hello</h1>
    <div class="upcoming-dashboard"></div>
  </div>`;

function tagBuiltIns(t) {
  const tickets = t.document.getElementById('builtin-tickets');
  if (tickets) tickets.__vue__ = { $el: tickets, $options: { name: 'Tickets' }, taskMode: false, $parent: null };
  const deliverables = t.document.getElementById('builtin-deliverables');
  if (deliverables) deliverables.__vue__ = { $el: deliverables, $options: { name: 'Deliverables' }, taskMode: false, $parent: null };
}

function mountAll(portal, delay) {
  const make = (text) => () => {
    const node = portal.card({ title: text, icon: portal.icons.tasks, count: 0 });
    return delay ? new Promise((r) => setTimeout(() => r(node), delay)) : node;
  };
  portal.home.mount({ name: 'waiting', render: make('Waiting') });
  portal.home.mount({ name: 'recent', render: make('Recent') });
  portal.home.mount({ name: 'requests', replaces: 'Tickets', render: make('Requests') });
  portal.home.mount({ name: 'projects', replaces: 'Deliverables', render: make('Projects') });
}

const ids = (parent) => [...parent.children].map((c) => c.id);
const rows = (t) => [...t.document.querySelectorAll('#mp-home > .mp-row')].map(ids);
const pageOrder = (t) => [...t.document.querySelector('.welcome-page').children].map((c) => c.id || c.className);

test('cards form the rows named in HOME_CARDS above the dashboard, and replaced built-ins are hidden', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  assert.deepEqual(pageOrder(t), ['', 'mp-home', 'action-dashboard']);
  assert.deepEqual(rows(t), [['mp-waiting', 'mp-recent'], ['mp-requests', 'mp-projects']]);
  assert.deepEqual(ids(t.document.querySelector('.action-dashboard')), ['builtin-tickets', 'builtin-deliverables']);
  assert.ok(t.document.getElementById('builtin-tickets').hasAttribute('data-mp-hidden'));
  assert.ok(t.document.getElementById('builtin-deliverables').hasAttribute('data-mp-hidden'));
});

test('without a dashboard the block still sits above the rest of the page', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  assert.deepEqual(pageOrder(t), ['', 'mp-home', 'upcoming-dashboard']);
  assert.equal(t.warns.length, 0);
});

test('HOME_CARDS controls order and rows; a bare name is a row by itself; unlisted cards follow one per row', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD, homeCards: ['recent', ['projects', 'waiting']] });
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  assert.deepEqual(rows(t), [['mp-recent'], ['mp-projects', 'mp-waiting'], ['mp-requests']]);
});

test('a listed card with no snippet is skipped and a duplicate name is used once', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD, homeCards: [['waiting', 'nonexistent'], ['projects'], ['waiting']] });
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ name: 'waiting', render: () => portal.card({ title: 'W', icon: portal.icons.tasks }) });
    portal.home.mount({ name: 'recent', render: () => portal.card({ title: 'R', icon: portal.icons.tasks }) });
  });
  await tick();
  assert.deepEqual(rows(t), [['mp-waiting'], ['mp-recent']]);
});

test('a render that returns false hides the card and its row shrinks; a rejected render is reported', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ name: 'waiting', render: () => false });
    portal.home.mount({ name: 'recent', render: () => portal.card({ title: 'R', icon: portal.icons.tasks }) });
    portal.home.mount({ name: 'requests', render: () => Promise.reject(new Error('nope')) });
  });
  await tick();
  assert.deepEqual(rows(t), [['mp-recent']]);
  assert.equal(t.warns.length, 1);
  assert.match(String(t.warns[0][0]), /card mp-requests failed/);
});

test('when every card is hidden there is no block at all', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => { portal.home.mount({ name: 'waiting', render: () => false }); });
  await tick();
  assert.equal(t.document.getElementById('mp-home'), null);
});

test('cards are re-inserted after the portal re-renders the page', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  t.document.getElementById('mp-home').remove();
  t.document.getElementById('builtin-tickets').removeAttribute('data-mp-hidden');
  await tick();
  assert.deepEqual(rows(t), [['mp-waiting', 'mp-recent'], ['mp-requests', 'mp-projects']]);
  assert.ok(t.document.getElementById('builtin-tickets').hasAttribute('data-mp-hidden'));
});

test('the block moves back above the dashboard if the page re-renders around it', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  t.document.querySelector('.welcome-page').appendChild(t.document.getElementById('mp-home'));
  await tick();
  assert.deepEqual(pageOrder(t), ['', 'mp-home', 'action-dashboard']);
});

test('leaving Home removes cards and unhides built-ins; returning re-renders with fresh data', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD, responses: fixtures() });
  tagBuiltIns(t);
  let renders = 0;
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ name: 'requests', replaces: 'Tickets', render: () => {
      renders++;
      return portal.data.tickets().then(() => portal.card({ title: 'Requests', icon: portal.icons.ticket, count: 0 }));
    } });
  });
  await tick();
  assert.equal(renders, 1);
  t.router.push('/projects');
  await tick();
  assert.equal(t.document.getElementById('mp-requests'), null);
  assert.equal(t.document.getElementById('mp-home'), null);
  assert.equal(t.document.getElementById('builtin-tickets').hasAttribute('data-mp-hidden'), false);
  t.router.push('/welcome');
  await tick();
  assert.equal(renders, 2);
  assert.ok(t.document.getElementById('mp-requests'));
  assert.equal(t.calls.filter((u) => u.includes('/tickets?open=true')).length, 2, 'cache was cleared on return');
});

test('a render that resolves after leaving Home is discarded', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => { mountAll(portal, 60); });
  t.router.push('/projects');
  await tick(120);
  assert.equal(t.warns.length, 0);
  assert.equal(t.document.getElementById('mp-waiting'), null);
  assert.equal(t.document.getElementById('mp-home'), null);
});

test('a client change removes mounted cards and drops in-flight renders', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => { mountAll(portal, 60); });
  t.store.state.clientPortalContext.client.customValues = [];
  t.store.notify();
  await tick(120);
  assert.equal(t.warns.length, 0);
  assert.equal(t.document.querySelector('.mp-card'), null);
  assert.equal(t.document.getElementById('mp-home'), null);
});

test('home.refresh and tasks.open re-render mounted cards', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD, responses: Object.assign(fixtures(), { '/deliverables/d1': {} }) });
  let renders = 0;
  let portalRef;
  t.MoxiePortal.ready((portal) => {
    portalRef = portal;
    portal.home.mount({ name: 'waiting', render: () => { renders++; return portal.card({ title: 'W', icon: portal.icons.tasks, count: 0 }); } });
  });
  await tick();
  assert.equal(renders, 1);
  portalRef.home.refresh();
  await tick();
  assert.equal(renders, 2);
  await portalRef.tasks.open({ task: { id: 'd1' }, project: { id: 'p1' }, statusList: [] });
  await tick();
  assert.equal(renders, 3);
});

test('a render that resolves to something other than an element is reported and leaves no card', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ name: 'bad', render: () => 'not an element' });
  });
  await tick();
  assert.equal(t.document.getElementById('mp-bad'), null);
  assert.equal(t.document.getElementById('mp-home'), null);
  assert.equal(t.warns.length, 1);
  assert.match(String(t.warns[0][0]), /card mp-bad failed/);
});

test('a mount without a name is reported and ignored', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ render: () => portal.card({ title: 'X', icon: portal.icons.tasks }) });
  });
  await tick();
  assert.equal(t.document.getElementById('mp-home'), null);
  assert.match(String(t.warns[0][0]), /home.mount needs a name/);
});

test('registrations made after the client stopped matching are dropped', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  let portalRef;
  t.MoxiePortal.ready((portal) => { portalRef = portal; });
  t.store.state.clientPortalContext.client.customValues = [];
  t.store.notify();
  let domCalls = 0;
  portalRef.style('.late { color: red; }');
  portalRef.onDom(() => { domCalls++; });
  portalRef.home.mount({ name: 'late', render: () => portalRef.card({ title: 'Late', icon: portalRef.icons.tasks }) });
  t.router.push('/projects');
  t.router.push('/welcome');
  t.document.body.appendChild(t.document.createElement('p'));
  await tick();
  assert.equal([...t.document.head.querySelectorAll('style')].some((s) => s.textContent.includes('.late')), false);
  assert.equal(domCalls, 0);
  assert.equal(t.document.getElementById('mp-late'), null);
  assert.equal(t.warns.length, 0);
});
