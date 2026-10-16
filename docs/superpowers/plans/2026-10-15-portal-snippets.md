# Portal Snippets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three ad-hoc Moxie portal scripts with one parent script (`MoxiePortal`) plus six independent paste-in snippets, with tests for the parent and a README for other Moxie users.

**Architecture:** `core/moxie-portal.js` waits for the portal's Vue app, gates on a client filter, and exposes a `portal` object (API fetch, cached data, DOM helpers, change hooks, home-page card mounting) to snippets registered through `MoxiePortal.ready(fn)`. Each snippet is a self-contained IIFE with its constants on top. The parent is tested in jsdom against a fake Vue store and router; snippets are syntax-checked and verified by hand in the portal.

**Tech Stack:** Plain ES5 browser JavaScript (the portal injects it inline, no bundler). Node 22 with `node --test` and jsdom 30 for tests. POSIX sh for the build script.

**Spec:** `docs/superpowers/specs/2026-10-15-portal-snippets-design.md`

## Global Constraints

- Browser code is ES5 (`var`, `function`, no arrow functions, no template literals, no `let`/`const`) so it pastes into Moxie's embed box without any build step.
- One global only: `window.MoxiePortal`. CSS classes and ids use the `mp-` prefix; html attributes use `data-mp-*`. No `swc` remains anywhere.
- Parent settings are exactly `CLIENT_FILTER` (object of mapping key to value, or `null`) and `WAITING_STATUSES` (array of status labels), at the top of `core/moxie-portal.js`.
- A failing snippet, hook, cleanup or card render logs `console.warn('[MoxiePortal] ...', err)` and never stops the others.
- Widget behaviour matches the current scripts except the two documented changes: `HIDE_LOGO` flag in sidebar-restyle; `render()` returns the card element instead of filling a given one (spec is updated in Task 5).
- Credit and license: MIT, Cathy Sarisky, Spectral Web Services, in `LICENSE`, `package.json` and the parent's header comment.
- Never load the live portal more than a handful of times in five minutes while verifying by hand (auth.withmoxie.com firewall).

## Review Focus

1. **Custom values arrive after the client id.** The portal context loads asynchronously, so the first filter check can fail with empty values; the watch must activate once values appear. Test in Task 1.
2. **A render resolving after the viewer left Home** must not insert a card into whatever page is now showing. Test in Task 5.
3. **One failed deliverables fetch** rejects `data.tasks()`; the rejection must not be cached, so the next Home visit retries. Test in Task 3.
4. **The parent pasted twice** (someone pastes the built file and the parent) must be a no-op the second time, with snippets still running once. Test in Task 1.
5. **Home with no action dashboard** (nothing needs attention) must still show main cards, in a grid after the top row. Test in Task 5.

---

### Task 1: Scaffold, test harness, and the parent's registration lifecycle

**Files:**
- Create: `package.json`, `LICENSE`, `test/helpers.js`, `test/core.test.js`, `core/moxie-portal.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `window.MoxiePortal.ready(fn)`; `fn(portal)` runs on activation and may return a cleanup; `portal` for now has `store`, `router`, `go`, `clientId()`, `clientValues()`, `user()`, `features()`; test helper `boot(opts)` returning `{ window, document, store, router, calls, warns, MoxiePortal, attach() }` and `tick(ms)`.

- [ ] **Step 1: Scaffold**

`.gitignore` (replace contents):
```
ghost/
.env
.env*
node_modules/
dist/
```

`package.json`:
```json
{
  "name": "moxie-portal-snippets",
  "version": "0.1.0",
  "private": true,
  "description": "Drop-in customisations for the Moxie client portal: one parent script plus pick-and-choose snippets.",
  "author": "Cathy Sarisky, Spectral Web Services",
  "license": "MIT",
  "scripts": {
    "pretest": "for f in core/*.js snippets/*.js; do node --check \"$f\" || exit 1; done",
    "test": "node --test"
  },
  "devDependencies": {
    "jsdom": "^30.1.3"
  }
}
```

`LICENSE`: the MIT text with `Copyright (c) 2026 Cathy Sarisky, Spectral Web Services`.

Run: `npm install`

- [ ] **Step 2: Write the test harness `test/helpers.js`**

```js
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CORE_PATH = path.join(__dirname, '..', 'core', 'moxie-portal.js');

function fakeStore(opts) {
  const watchers = [];
  return {
    state: {
      accessToken: 'token',
      locale: 'en-US',
      loggedInUser: { id: 'me', firstName: 'Pat', lastName: 'Viewer', email: 'pat@example.com' },
      clientPortalContext: { client: { customValues: opts.customValues || [{ mappingKey: 'ClientType', value: 'TEST' }] } },
      globalModalController: { openModal: () => Promise.resolve() }
    },
    getters: {
      getClientId: opts.clientId || 'client-1',
      getPodUrl: 'https://pod.test/',
      getAccountId: '42',
      getFeatures: Object.assign({ projectsEnabled: true, ticketsEnabled: true }, opts.features)
    },
    watch(getter, cb) { watchers.push({ getter, cb, last: getter() }); },
    // Call after changing state or getters, as Vuex would do reactively.
    notify() {
      watchers.forEach((w) => {
        const value = w.getter();
        if (value !== w.last) { const old = w.last; w.last = value; w.cb(value, old); }
      });
    }
  };
}

function parseRoute(to) {
  const [p, qs] = String(to).split('?');
  const query = {};
  (qs || '').split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); query[k] = v; });
  return { path: p, query };
}

function fakeRouter(start) {
  const hooks = [];
  const router = {
    currentRoute: parseRoute(start || '/welcome'),
    afterEach(fn) { hooks.push(fn); },
    push(to) {
      const from = router.currentRoute;
      router.currentRoute = parseRoute(to);
      hooks.forEach((fn) => fn(router.currentRoute, from));
      return Promise.resolve();
    }
  };
  return router;
}

// Boots core/moxie-portal.js inside jsdom with a fake Vue app on #app.
// opts: html (inside #app), route, customValues, clientId, features, responses ({ '/projects': [...] }),
//       filter (replaces CLIENT_FILTER; default { ClientType: 'TEST' }), attachLater (leave #app without __vue__).
function boot(opts = {}) {
  const warns = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('warn', (...args) => warns.push(args));
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body><div id="app">${opts.html || ''}</div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://portal.test/', virtualConsole }
  );
  const { window } = dom;
  const store = fakeStore(opts);
  const router = fakeRouter(opts.route);
  const calls = [];
  const responses = opts.responses || {};
  window.fetch = (url) => {
    calls.push(url);
    const tail = url.slice(url.indexOf('/portal/') + '/portal/'.length);
    const key = tail.slice(tail.indexOf('/'));
    const ok = Object.prototype.hasOwnProperty.call(responses, key);
    return Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(responses[key]) });
  };
  const attach = () => { window.document.querySelector('#app').__vue__ = { $store: store, $router: router }; };
  if (!opts.attachLater) attach();

  const filter = 'filter' in opts ? opts.filter : { ClientType: 'TEST' };
  let source = fs.readFileSync(CORE_PATH, 'utf8');
  source = source.replace(/var CLIENT_FILTER = [^;]*;/, 'var CLIENT_FILTER = ' + JSON.stringify(filter) + ';');
  window.eval(source);
  return { window, document: window.document, store, router, calls, warns, attach, MoxiePortal: window.MoxiePortal, source };
}

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { boot, tick };
```

- [ ] **Step 3: Write the failing lifecycle tests in `test/core.test.js`**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, tick } = require('./helpers');

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
  assert.deepEqual(seen.clientValues(), { ClientType: 'TEST' });
  assert.equal(seen.user().id, 'me');
  assert.equal(seen.features().projectsEnabled, true);
  seen.go('/requests');
  assert.equal(t.router.currentRoute.path, '/requests');
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: pretest fails because `core/` has no files, or tests fail with `Cannot read properties of undefined (reading 'ready')`.

- [ ] **Step 5: Write the parent skeleton `core/moxie-portal.js`**

```js
/*!
 * MoxiePortal - shared plumbing for Moxie client-portal snippets.
 *
 * Paste this first in Moxie under Settings > Client Portal > Advanced >
 * JavaScript embed code, then paste the snippets you want below it.
 * Snippets register with MoxiePortal.ready(function (portal) { ... }).
 *
 * Copyright (c) 2026 Cathy Sarisky, Spectral Web Services. MIT License.
 */
(function () {
  if (window.MoxiePortal) return;

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  // Run snippets only for clients whose custom fields match every entry here.
  // Keys are the custom field's mapping key; values are compared ignoring case.
  // Set to null to run for every client.
  var CLIENT_FILTER = { ClientType: 'TEST' };

  // Task status labels that mean the client has to do something.
  var WAITING_STATUSES = ['Wait on client', 'Ready for approval'];

  // ---------------------------------------------------------------------------
  // Registration. Works before the portal's app has been found.
  // ---------------------------------------------------------------------------

  var snippets = [];   // every fn passed to ready()
  var active = null;   // { cleanups: [], styles: [] } while a matching client is active
  var portal = null;   // built in start()

  function warn(what, err) { console.warn('[MoxiePortal] ' + what, err); }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  function ready(fn) {
    if (typeof fn !== 'function') return;
    snippets.push(fn);
    if (active) runSnippet(fn);
  }

  function runSnippet(fn) {
    var activation = active;
    try {
      var cleanup = fn(portal);
      if (typeof cleanup === 'function' && activation === active) activation.cleanups.push(cleanup);
    } catch (err) {
      warn('snippet failed', err);
    }
  }

  window.MoxiePortal = { ready: ready };

  // ---------------------------------------------------------------------------
  // Find the portal's Vue app (Vue 2 exposes it on #app.__vue__).
  // ---------------------------------------------------------------------------

  (function whenReady(tries) {
    var app = document.querySelector('#app');
    var vm = app && app.__vue__;
    if (vm && vm.$store && vm.$router && vm.$store.getters.getClientId) return start(vm.$store, vm.$router);
    if (tries < 100) setTimeout(function () { whenReady(tries + 1); }, 100);
  })(0);

  function start(store, router) {
    function go(path) { router.push(path).catch(function () {}); }
    function clientId() { return store.getters.getClientId; }
    function clientValues() {
      var ctx = store.state.clientPortalContext;
      var out = {};
      ((ctx && ctx.client && ctx.client.customValues) || []).forEach(function (cv) { out[cv.mappingKey] = cv.value; });
      return out;
    }
    function user() { return store.state.loggedInUser || {}; }
    function features() { return store.getters.getFeatures || {}; }

    portal = {
      store: store, router: router, go: go,
      clientId: clientId, clientValues: clientValues, user: user, features: features,
      norm: norm
    };

    // --- lifecycle -----------------------------------------------------------
    function passes() {
      if (!CLIENT_FILTER) return true;
      var values = clientValues();
      return Object.keys(CLIENT_FILTER).every(function (key) {
        return norm(values[key]) === norm(CLIENT_FILTER[key]);
      });
    }

    function activate() {
      active = { cleanups: [], styles: [] };
      snippets.slice().forEach(function (fn) { runSnippet(fn); });
    }

    function deactivate() {
      if (!active) return;
      var finished = active;
      active = null;
      finished.cleanups.forEach(function (fn) {
        try { fn(); } catch (err) { warn('cleanup failed', err); }
      });
      finished.styles.forEach(function (node) { node.remove(); });
    }

    function sync() {
      deactivate();
      if (passes()) activate();
    }

    store.watch(function () { return clientId() + '|' + JSON.stringify(clientValues()); }, sync);
    sync();
  }
})();
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: 8 passing.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json LICENSE test/ core/
git commit -m "Add MoxiePortal parent skeleton with snippet lifecycle and jsdom harness"
```

---

### Task 2: Scoped styles, change hooks, and the portal API fetch

**Files:**
- Modify: `core/moxie-portal.js` (inside `start`)
- Test: `test/core.test.js`

**Interfaces:**
- Produces: `portal.style(css)` returns the `<style>` node; `portal.onRoute(fn)`, `portal.onDom(fn)`; `portal.api(path)` resolves JSON. All three registrations are dropped on deactivation. Internals `place()` and `refreshHome()` are referenced by the observer and router hook here and defined in Task 5; until then use the stubs shown.

- [ ] **Step 1: Write the failing tests** (append to `test/core.test.js`)

```js
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
  assert.deepEqual(projects, [{ id: 'p1' }]);
  assert.equal(t.calls[0], 'https://pod.test/api/v1/42/portal/client-1/projects');
  await assert.rejects(portal.api('/nope'), /HTTP 404/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the five new tests fail with `portal.style is not a function` and similar.

- [ ] **Step 3: Implement**

Inside `start`, after `features()`, add:

```js
    function api(path) {
      var g = store.getters;
      return fetch(g.getPodUrl + 'api/v1/' + g.getAccountId + '/portal/' + g.getClientId + path, {
        headers: { Authorization: 'Bearer ' + store.state.accessToken }
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }

    // --- styles and hooks, all dropped on deactivation ------------------------
    var routeHooks = [];
    var domHooks = [];

    function style(css) {
      var node = document.createElement('style');
      node.textContent = css;
      document.head.appendChild(node);
      if (active) active.styles.push(node);
      return node;
    }
    function onRoute(fn) { routeHooks.push(fn); }
    function onDom(fn) { domHooks.push(fn); }
    function runHooks(list, what, args) {
      list.slice().forEach(function (fn) {
        try { fn.apply(null, args || []); } catch (err) { warn(what + ' hook failed', err); }
      });
    }

    // Replaced in the home-page section.
    function place() {}
    function refreshHome() {}
```

Add `api: api, style: style, onRoute: onRoute, onDom: onDom,` to the `portal` object. In `deactivate()`, after removing styles, add:

```js
      routeHooks = [];
      domHooks = [];
```

Before the `store.watch` line, install the single observer and router hook:

```js
    // --- one observer and one route hook for everyone ------------------------
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        place();
        runHooks(domHooks, 'onDom');
      });
    }).observe(document.body, { childList: true, subtree: true });

    router.afterEach(function (to, from) {
      setTimeout(function () {
        if (to.path === '/welcome') refreshHome(); else place();
        runHooks(routeHooks, 'onRoute', [to, from]);
      }, 0);
    });
```

Note: `fetch` with the headers option needs `fetch` defined on the window; the harness supplies it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 13 passing.

- [ ] **Step 5: Commit**

```bash
git add core/moxie-portal.js test/core.test.js
git commit -m "MoxiePortal: scoped styles, route and DOM hooks, portal API fetch"
```

---

### Task 3: Cached data layer and task helpers

**Files:**
- Modify: `core/moxie-portal.js` (inside `start`)
- Test: `test/core.test.js`

**Interfaces:**
- Produces: `portal.data.{projects, projectTypes, tasks, waitingTasks, tickets, ticketSettings, refresh}`; `portal.tasks.visible(project)`, `portal.tasks.open(item)` where `item = { task, project, status, statusList }`. `tasks.open` calls `refreshHome()` after the side panel closes.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
  assert.deepEqual(items.map((i) => i.task.id).sort(), ['d1', 'd2', 'd3', 'd6']);
  const d1 = items.find((i) => i.task.id === 'd1');
  assert.equal(d1.project.name, 'Beta site');
  assert.equal(d1.status.label, 'Wait on client');
  assert.equal(d1.statusList.length, 2);
});

test('waitingTasks keeps WAITING_STATUSES only, due dates first then by name', async () => {
  const t = withPortal({ responses: fixtures() });
  const waiting = await t.portal.data.waitingTasks();
  assert.deepEqual(waiting.map((i) => i.task.id), ['d1', 'd2', 'd6']);
});

test('tickets are open, unarchived, newest first; settings are passed through', async () => {
  const t = withPortal({ responses: fixtures() });
  const tickets = await t.portal.data.tickets();
  assert.deepEqual(tickets.map((k) => k.id), ['k2', 'k1']);
  assert.equal((await t.portal.data.ticketSettings())[0].id, 'tt1');
});

test('disabled features resolve to empty lists without fetching', async () => {
  const t = withPortal({ responses: fixtures(), features: { projectsEnabled: false, ticketsEnabled: false } });
  assert.deepEqual(await t.portal.data.projects(), []);
  assert.deepEqual(await t.portal.data.tasks(), []);
  assert.deepEqual(await t.portal.data.tickets(), []);
  assert.deepEqual(await t.portal.data.ticketSettings(), []);
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
  assert.deepEqual(opened[0][1], { origDeliverable: { id: 'd1', full: true }, project: { id: 'p1' }, statusList: [], subtasks: [] });
  assert.deepEqual(opened[0].slice(2), [true, false, 'right-panel']);
});

test('tasks.open falls back to the project board when the panel cannot open', async () => {
  const t = withPortal({ responses: fixtures() });
  await t.portal.tasks.open({ task: { id: 'missing' }, project: { id: 'p1' }, statusList: [] });
  assert.equal(t.router.currentRoute.path, '/projects/p1');
  assert.equal(t.router.currentRoute.query.v, 'tasks');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: new tests fail with `Cannot read properties of undefined (reading 'projects')`.

- [ ] **Step 3: Implement** (inside `start`, after the hooks section)

```js
    // --- cached data, per client ---------------------------------------------
    var cache = {};

    function cached(key, make) {
      if (!cache[key]) {
        cache[key] = make().then(null, function (err) {
          delete cache[key];
          throw err;
        });
      }
      return cache[key];
    }

    function statusOf(type, statusId) {
      var list = type.statusList || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === statusId) return list[i];
      return null;
    }

    var tasks = {
      // Same rule the portal uses before it shows a project's task views.
      visible: function (project) {
        return !!project.active &&
          (project.portalAccess === 'Full access' || project.portalAccess === 'Read only') &&
          project.lifecycleStatus !== 'PAUSED' && project.lifecycleStatus !== 'CANCELED';
      },
      // Opens the task side panel; resolves when it closes. Falls back to the board.
      open: function (item) {
        return api('/deliverables/' + item.task.id).then(function (detail) {
          return store.state.globalModalController.openModal(
            { name: 'DeliverableDetail' },
            { origDeliverable: detail, project: item.project, statusList: item.statusList, subtasks: [] },
            true, false, 'right-panel'
          );
        }).then(function () { refreshHome(); }, function () {
          go('/projects/' + item.project.id + '?v=tasks');
        });
      }
    };

    var data = {
      refresh: function () { cache = {}; },
      projects: function () {
        return cached('projects', function () {
          return features().projectsEnabled ? api('/projects') : Promise.resolve([]);
        });
      },
      projectTypes: function () {
        return cached('projectTypes', function () {
          return features().projectsEnabled ? api('/projectTypes') : Promise.resolve([]);
        });
      },
      // Every task the viewer may see, as { task, project, status, statusList }.
      tasks: function () {
        return cached('tasks', function () {
          return Promise.all([data.projects(), data.projectTypes()]).then(function (res) {
            var me = user();
            var visible = {};
            res[0].forEach(function (p) { if (tasks.visible(p)) visible[p.id] = p; });
            return Promise.all(res[1].map(function (type) {
              return api('/deliverables?projectTypeId=' + encodeURIComponent(type.id)).then(function (list) {
                return list.filter(function (t) {
                  var p = visible[t.projectId];
                  if (!p || t.archived || t.isDeleted) return false;
                  if (p.portalAccessAssignedOnly && (t.assignedToList || []).indexOf(me.id) === -1) return false;
                  return true;
                }).map(function (t) {
                  return { task: t, project: visible[t.projectId], status: statusOf(type, t.statusId), statusList: type.statusList };
                });
              });
            }));
          }).then(function (groups) { return [].concat.apply([], groups); });
        });
      },
      waitingTasks: function () {
        return data.tasks().then(function (items) {
          var wanted = WAITING_STATUSES.map(norm);
          var waiting = items.filter(function (item) {
            return item.status && wanted.indexOf(norm(item.status.label)) !== -1;
          });
          waiting.sort(function (a, b) {
            var da = a.task.dueDate || '9999', db = b.task.dueDate || '9999';
            return da < db ? -1 : da > db ? 1 : a.task.name.localeCompare(b.task.name);
          });
          return waiting;
        });
      },
      tickets: function () {
        return cached('tickets', function () {
          if (!features().ticketsEnabled) return Promise.resolve([]);
          return api('/tickets?open=true').then(function (list) {
            var open = list.filter(function (t) { return t.open !== false && !t.archived; });
            open.sort(function (a, b) { return (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0); });
            return open;
          });
        });
      },
      ticketSettings: function () {
        return cached('ticketSettings', function () {
          return features().ticketsEnabled ? api('/tickets/settings') : Promise.resolve([]);
        });
      }
    };
```

Add `data: data, tasks: tasks,` to the `portal` object, and `cache = {};` at the end of `deactivate()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 22 passing.

- [ ] **Step 5: Commit**

```bash
git add core/moxie-portal.js test/core.test.js
git commit -m "MoxiePortal: cached data getters and task helpers"
```

---

### Task 4: DOM and formatting helpers, shared card CSS

**Files:**
- Modify: `core/moxie-portal.js`
- Test: `test/core.test.js`

**Interfaces:**
- Produces: `portal.el(tag, className, text)`, `portal.svg(paths, size)`, `portal.button(className, onClick)`, `portal.card({ title, icon, count, openPath })`, `portal.row(title, meta, dotColor, onClick)`, `portal.empty(text)`, `portal.footer(text, onClick)`, `portal.timeAgo(ms)`, `portal.formatDue(value)`, `portal.icons.{tasks, folder, chevron, arrow, ticket, history, listChecks}`. A `<style id="mp-shared-style">` is added once at load.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
  const plain = p.card({ title: 'Waiting', icon: p.icons.tasks, count: 0 });
  assert.equal(plain.querySelector('.mp-open'), null);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: four new failures (`p.card is not a function`, missing `mp-shared-style`).

- [ ] **Step 3: Implement**

At module level, right after the Settings block and before "Registration", add:

```js
  // ---------------------------------------------------------------------------
  // Shared look and feel
  // ---------------------------------------------------------------------------

  // Lucide icon paths, the same stroke style as the portal's own icons.
  var ICONS = {
    tasks: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'
  };

  var shared = document.createElement('style');
  shared.id = 'mp-shared-style';
  shared.textContent = [
    '.mp-card { overflow: hidden; border: 1px solid var(--portal-border); border-radius: var(--portal-radius-md); background: var(--portal-surface); box-shadow: 0 1px 2px rgba(16, 17, 15, .04); }',
    '.mp-card .mp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 16px 13px; border-bottom: 1px solid var(--portal-border); }',
    '.mp-card .mp-title { min-width: 0; display: flex; align-items: center; gap: 11px; }',
    '.mp-card .mp-icon { width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center; border-radius: 11px; background: var(--v-blue_5-base); color: var(--v-primary-base); }',
    '.mp-card h3 { overflow: hidden; margin: 0; color: var(--portal-text); font-size: 16px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }',
    '.mp-card .mp-count { min-width: 24px; height: 24px; display: grid; place-items: center; padding: 0 7px; border-radius: 99px; background: var(--v-gray_20-base); color: var(--portal-muted); font-size: 12px; font-weight: 600; }',
    '.mp-card .mp-open { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border: 0; border-radius: var(--brand-button-radius, 10px); background: transparent; color: var(--portal-muted); cursor: pointer; }',
    '.mp-card .mp-open:hover { background: var(--v-gray_20-base); color: var(--portal-text); }',
    '.mp-card .mp-list { display: grid; }',
    '.mp-card .mp-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; vertical-align: 0; }',
    '.mp-card .mp-empty { margin: 0; padding: 16px; color: var(--portal-muted); font-size: 14px; }',
    '.mp-card .mp-footer { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border: 0; border-top: 1px solid var(--portal-border); background: transparent; color: var(--v-primary-base); font-size: 14px; font-weight: 500; text-align: left; cursor: pointer; }',
    '.mp-card .mp-footer:hover { background: var(--v-gray_10-base); }',
    '#mp-top, #mp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 18px; margin-bottom: 28px; }',
    '#mp-grid { align-items: start; }',
    // Side-by-side cards share a height; lists grow so footers sit at the bottom.
    '#mp-top > .mp-card { display: flex; flex-direction: column; }',
    '#mp-top .mp-list, #mp-top .mp-empty { flex: 1; align-content: start; }',
    '@media (max-width: 599px) {',
    '  #mp-top, #mp-grid { gap: 14px; margin-bottom: 20px; }',
    '}',
    '[data-mp-hidden] { display: none !important; }'
  ].join('\n');
  document.head.appendChild(shared);

  // ---------------------------------------------------------------------------
  // Helpers that need nothing from the app
  // ---------------------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svg(paths, size) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('width', size);
    node.setAttribute('height', size);
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.75');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('class', 'portal-icon');
    node.innerHTML = paths;
    return node;
  }

  function button(className, onClick) {
    var node = el('button', className);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function row(title, meta, dotColor, onClick) {
    var node = button('portal-action-row', onClick);
    var copy = el('span', 'action-row-copy');
    copy.appendChild(el('strong', null, title));
    if (meta) {
      var small = el('small');
      if (dotColor) {
        var dot = el('span', 'mp-dot');
        dot.style.background = dotColor;
        small.appendChild(dot);
      }
      small.appendChild(document.createTextNode(meta));
      copy.appendChild(small);
    }
    node.appendChild(copy);
    node.appendChild(svg(ICONS.chevron, 18));
    return node;
  }

  function empty(text) { return el('p', 'mp-empty', text); }

  function timeAgo(time) {
    var mins = Math.round((Date.now() - time) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }
```

Move the existing `warn` and `norm` definitions up into this helpers block (they are module-level already; just keep them together). Inside `start`, after `features()`, add the helpers that need the router or store:

```js
    function formatDue(value) {
      if (!value) return null;
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      var date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
      if (isNaN(date)) return null;
      return 'Due ' + date.toLocaleDateString(store.state.locale || undefined, { month: 'short', day: 'numeric' });
    }

    // A card shell: header with icon, title, count badge and optional arrow to openPath.
    function card(opts) {
      var node = el('section', 'mp-card');
      var head = el('header', 'mp-head');
      var title = el('div', 'mp-title');
      var icon = el('span', 'mp-icon');
      icon.appendChild(svg(opts.icon || ICONS.folder, 20));
      title.appendChild(icon);
      title.appendChild(el('h3', null, opts.title));
      if (opts.count != null) title.appendChild(el('span', 'mp-count', String(opts.count)));
      head.appendChild(title);
      if (opts.openPath) {
        var open = button('mp-open', function () { go(opts.openPath); });
        open.setAttribute('aria-label', opts.title);
        open.appendChild(svg(ICONS.arrow, 18));
        head.appendChild(open);
      }
      node.appendChild(head);
      return node;
    }

    function footer(text, onClick) {
      var node = button('mp-footer', onClick);
      node.appendChild(el('span', null, text));
      node.appendChild(svg(ICONS.arrow, 18));
      return node;
    }
```

Add to the `portal` object: `el: el, svg: svg, button: button, card: card, row: row, empty: empty, footer: footer, timeAgo: timeAgo, formatDue: formatDue, icons: ICONS`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 26 passing.

- [ ] **Step 5: Commit**

```bash
git add core/moxie-portal.js test/core.test.js
git commit -m "MoxiePortal: card, row and formatting helpers with shared CSS"
```

---

### Task 5: Home-page card mounting

**Files:**
- Modify: `core/moxie-portal.js` (replace the `place`/`refreshHome` stubs)
- Modify: `docs/superpowers/specs/2026-10-15-portal-snippets-design.md` (render signature)
- Test: `test/core.test.js`

**Interfaces:**
- Produces: `portal.home.mount({ id, slot: 'top' | 'main', replaces?, render })` where `render()` returns an element (or a promise of one), or `false` to hide; `portal.home.refresh()` clears the cache and re-renders mounted cards when on Home.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
  portal.home.mount({ id: 'mp-waiting', slot: 'top', render: make('Waiting') });
  portal.home.mount({ id: 'mp-recent', slot: 'top', render: make('Recent') });
  portal.home.mount({ id: 'mp-requests', slot: 'main', replaces: 'Tickets', render: make('Requests') });
  portal.home.mount({ id: 'mp-projects', slot: 'main', replaces: 'Deliverables', render: make('Projects') });
}

const ids = (parent) => [...parent.children].map((c) => c.id);

test('top cards sit in a row before the dashboard; main cards replace their built-ins', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  const home = t.document.querySelector('.welcome-page');
  assert.deepEqual([...home.children].map((c) => c.id || c.className), ['', 'mp-top', 'action-dashboard']);
  assert.deepEqual(ids(t.document.getElementById('mp-top')), ['mp-waiting', 'mp-recent']);
  assert.deepEqual(ids(home.querySelector('.action-dashboard')), ['builtin-tickets', 'mp-requests', 'builtin-deliverables', 'mp-projects']);
  assert.ok(t.document.getElementById('builtin-tickets').hasAttribute('data-mp-hidden'));
  assert.ok(t.document.getElementById('builtin-deliverables').hasAttribute('data-mp-hidden'));
  assert.equal(t.document.getElementById('mp-grid'), null);
});

test('without a dashboard, main cards go into a grid after the top row', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  const home = t.document.querySelector('.welcome-page');
  assert.deepEqual([...home.children].map((c) => c.id || c.className), ['', 'mp-top', 'mp-grid', 'upcoming-dashboard']);
  assert.deepEqual(ids(t.document.getElementById('mp-grid')), ['mp-requests', 'mp-projects']);
});

test('a main card whose built-in is missing goes first; the next one follows it', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD.replace('<div class="portal-action-card" id="builtin-tickets"></div>', '') });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  assert.deepEqual(ids(t.document.querySelector('.action-dashboard')), ['mp-requests', 'builtin-deliverables', 'mp-projects']);
});

test('a render that returns false hides the card and empty rows are removed', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ id: 'mp-waiting', slot: 'top', render: () => false });
    portal.home.mount({ id: 'mp-requests', slot: 'main', render: () => Promise.reject(new Error('nope')) });
  });
  await tick();
  assert.equal(t.document.getElementById('mp-waiting'), null);
  assert.equal(t.document.getElementById('mp-top'), null);
  assert.equal(t.document.getElementById('mp-grid'), null);
  assert.match(String(t.warns[0][0]), /card mp-requests failed/);
});

test('cards are re-inserted after the portal re-renders the page', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD });
  tagBuiltIns(t);
  t.MoxiePortal.ready((portal) => { mountAll(portal); });
  await tick();
  t.document.getElementById('mp-top').remove();
  t.document.getElementById('mp-requests').remove();
  t.document.getElementById('builtin-tickets').removeAttribute('data-mp-hidden');
  await tick();
  assert.deepEqual(ids(t.document.getElementById('mp-top')), ['mp-waiting', 'mp-recent']);
  assert.deepEqual(ids(t.document.querySelector('.action-dashboard')), ['builtin-tickets', 'mp-requests', 'builtin-deliverables', 'mp-projects']);
  assert.ok(t.document.getElementById('builtin-tickets').hasAttribute('data-mp-hidden'));
});

test('leaving Home removes cards and unhides built-ins; returning re-renders with fresh data', async () => {
  const t = boot({ html: WELCOME_WITH_DASHBOARD, responses: fixtures() });
  tagBuiltIns(t);
  let renders = 0;
  t.MoxiePortal.ready((portal) => {
    portal.home.mount({ id: 'mp-requests', slot: 'main', replaces: 'Tickets', render: () => {
      renders++;
      return portal.data.tickets().then(() => portal.card({ title: 'Requests', icon: portal.icons.ticket, count: 0 }));
    } });
  });
  await tick();
  assert.equal(renders, 1);
  t.router.push('/projects');
  await tick();
  assert.equal(t.document.getElementById('mp-requests'), null);
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
  assert.equal(t.document.getElementById('mp-waiting'), null);
  assert.equal(t.document.getElementById('mp-top'), null);
});

test('a client change removes mounted cards and drops in-flight renders', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD });
  let portalRef;
  t.MoxiePortal.ready((portal) => { portalRef = portal; mountAll(portal, 60); });
  t.store.state.clientPortalContext.client.customValues = [];
  t.store.notify();
  await tick(120);
  assert.equal(t.document.querySelector('.mp-card'), null);
  assert.equal(t.document.getElementById('mp-top'), null);
});

test('home.refresh and tasks.open re-render mounted cards', async () => {
  const t = boot({ html: WELCOME_WITHOUT_DASHBOARD, responses: Object.assign(fixtures(), { '/deliverables/d1': {} }) });
  let renders = 0;
  let portalRef;
  t.MoxiePortal.ready((portal) => {
    portalRef = portal;
    portal.home.mount({ id: 'mp-waiting', slot: 'top', render: () => { renders++; return portal.card({ title: 'W', icon: portal.icons.tasks, count: 0 }); } });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: new tests fail with `Cannot read properties of undefined (reading 'mount')`.

- [ ] **Step 3: Implement** (inside `start`, replacing the two stubs; keep this block after the data layer because `refreshHome` clears `cache`)

```js
    // --- home page cards -------------------------------------------------------
    var mounts = [];   // { id, slot, replaces, render, node, seq }

    function onHomeRoute() { return router.currentRoute.path === '/welcome'; }

    // Finds one of the portal's own Home cards by Vue component name. "Tickets" is the
    // built-in Requests card; "Deliverables" without taskMode is the built-in "Projects"
    // card (tasks awaiting approval).
    function builtInCard(dashboard, componentName) {
      var cards = dashboard.querySelectorAll(':scope > .portal-action-card');
      for (var i = 0; i < cards.length; i++) {
        for (var vm = cards[i].__vue__; vm && vm.$el === cards[i]; vm = vm.$parent) {
          if (vm.$options.name === componentName && !vm.taskMode) return cards[i];
        }
      }
      return null;
    }

    function setHidden(wanted) {
      var current = document.querySelectorAll('[data-mp-hidden]');
      for (var i = 0; i < current.length; i++) {
        if (wanted.indexOf(current[i]) === -1) current[i].removeAttribute('data-mp-hidden');
      }
      wanted.forEach(function (node) {
        if (!node.hasAttribute('data-mp-hidden')) node.setAttribute('data-mp-hidden', '');
      });
    }

    function unplace(m) {
      if (m.node) { m.node.remove(); m.node = null; }
    }

    function clearHome() {
      mounts.forEach(function (m) { m.seq++; unplace(m); });
      ['mp-top', 'mp-grid'].forEach(function (id) {
        var node = document.getElementById(id);
        if (node) node.remove();
      });
      setHidden([]);
    }

    // Puts rendered cards where they belong. Cheap and idempotent; runs after every DOM change.
    function place() {
      if (!onHomeRoute()) { clearHome(); return; }
      var root = document.querySelector('.welcome-page');
      if (!root) return;
      var anchor = root.querySelector(':scope > .action-dashboard, :scope > .dashboard-loading, :scope > .dashboard-state, :scope > .upcoming-dashboard');
      var dashboard = root.querySelector(':scope > .action-dashboard');
      var hidden = [];

      var topCards = mounts.filter(function (m) { return m.slot === 'top' && m.node; });
      var top = document.getElementById('mp-top');
      if (!topCards.length) {
        if (top) top.remove();
        top = null;
      } else {
        if (!top) { top = el('div'); top.id = 'mp-top'; }
        if (top.parentElement !== root) root.insertBefore(top, anchor);
        topCards.forEach(function (m, i) {
          if (top.children[i] !== m.node) top.insertBefore(m.node, top.children[i] || null);
        });
      }

      var mainCards = mounts.filter(function (m) { return m.slot === 'main' && m.node; });
      var grid = document.getElementById('mp-grid');
      if (dashboard || !mainCards.length) {
        if (grid) grid.remove();
        grid = null;
      }
      if (dashboard) {
        var prev = null;
        mainCards.forEach(function (m) {
          var builtIn = m.replaces ? builtInCard(dashboard, m.replaces) : null;
          if (builtIn) {
            hidden.push(builtIn);
            if (builtIn.nextElementSibling !== m.node) builtIn.after(m.node);
          } else if (prev) {
            if (prev.nextElementSibling !== m.node) prev.after(m.node);
          } else if (dashboard.firstElementChild !== m.node) {
            dashboard.prepend(m.node);
          }
          prev = m.node;
        });
      } else if (mainCards.length) {
        if (!grid) { grid = el('div'); grid.id = 'mp-grid'; }
        if (top) {
          if (top.nextElementSibling !== grid) top.after(grid);
        } else if (grid.parentElement !== root) {
          root.insertBefore(grid, anchor);
        }
        mainCards.forEach(function (m, i) {
          if (grid.children[i] !== m.node) grid.insertBefore(m.node, grid.children[i] || null);
        });
      }
      setHidden(hidden);
    }

    // Renders a card off-screen, then swaps it in, so cards never show half-filled.
    function renderCard(m) {
      var seq = ++m.seq;
      Promise.resolve().then(function () { return m.render(); }).then(function (node) {
        if (seq !== m.seq) return;
        if (!node) { unplace(m); place(); return; }
        node.id = m.id;
        node.classList.add('mp-card');
        var old = m.node;
        m.node = node;
        if (old && old.parentNode) old.parentNode.replaceChild(node, old);
        place();
      }, function (err) {
        if (seq !== m.seq) return;
        warn('card ' + m.id + ' failed', err);
        unplace(m);
        place();
      });
    }

    function renderHome() { if (onHomeRoute()) mounts.forEach(renderCard); }
    function refreshHome() { cache = {}; renderHome(); }

    var home = {
      mount: function (spec) {
        var m = {
          id: spec.id,
          slot: spec.slot === 'top' ? 'top' : 'main',
          replaces: spec.replaces || null,
          render: spec.render,
          node: null,
          seq: 0
        };
        mounts.push(m);
        if (active && onHomeRoute()) renderCard(m);
      },
      refresh: refreshHome
    };
```

Add `home: home,` to the `portal` object. In `deactivate()`, before `cache = {}`, add `clearHome(); mounts = [];`.

Because `place` and `refreshHome` are now function declarations defined later in `start` than the observer code that calls them, hoisting makes the earlier stubs unnecessary: delete the two stub lines.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 35 passing.

- [ ] **Step 5: Update the spec's render signature**

In `docs/superpowers/specs/2026-10-15-portal-snippets-design.md`, replace

```
  - `render(card)`: fills the given empty `<section class="mp-card">`. May return a
    Promise. Resolving to `false` means "do not show this card".
```
with
```
  - `render()`: returns the card element (normally built with `portal.card`), or a
    Promise of one. Returning `false` means "do not show this card". The parent sets
    the element's id and `mp-card` class.
```
and in the mounting behaviour paragraph replace "creates a fresh detached section, calls `render`, and on resolution swaps it into place of the previous node" with "calls `render`, and on resolution swaps the returned element into place of the previous node". Also replace the `card({ title, icon, count, openPath })` description "returns `<section class="mp-card">` with a header" (unchanged in meaning; leave it).

- [ ] **Step 6: Commit**

```bash
git add core/moxie-portal.js test/core.test.js docs/superpowers/specs/2026-10-15-portal-snippets-design.md
git commit -m "MoxiePortal: home-page card mounting with slots and built-in replacement"
```

---

### Task 6: Sidebar restyle and Tasks menu snippets; remove the old scripts

**Files:**
- Create: `snippets/sidebar-restyle.js`, `snippets/nav-tasks-link.js`
- Delete: `portal-custom.js`, `portal-tasks-link.js`

**Interfaces:**
- Consumes: `MoxiePortal.ready`, `portal.style`, `portal.data.projects`, `portal.onDom`, `portal.onRoute`, `portal.router`, `portal.icons.listChecks`.

- [ ] **Step 1: Write `snippets/sidebar-restyle.js`**

```js
/* MoxiePortal snippet: sidebar restyle.
 * Recolours the left menu and, optionally, hides the workspace logo above it.
 * Paste below the MoxiePortal parent script. */
(function () {
  var SIDEBAR_COLOR = '#1B5E20';   // left menu background
  var ACTIVE_STRIPE = '#A5D6A7';   // marker beside the selected menu item
  var HIDE_LOGO = true;            // hide the logo above the menu

  MoxiePortal.ready(function (portal) {
    var css = [
      '#left-nav { background-color: ' + SIDEBAR_COLOR + ' !important; }',
      '#left-nav .portal-nav-link.is-active::before { border-left-color: ' + ACTIVE_STRIPE + ' !important; }',
      '@media (min-width: 600px) { .brand-zone { background: ' + SIDEBAR_COLOR + ' !important; } }'
    ];
    if (HIDE_LOGO) css.push('.brand-logo { display: none !important; }');
    portal.style(css.join('\n'));
  });
})();
```

- [ ] **Step 2: Write `snippets/nav-tasks-link.js`**

```js
/* MoxiePortal snippet: Tasks menu link.
 * Adds a "Tasks" item under Projects in the left menu that opens the task board of the
 * client's first active project. Paste below the MoxiePortal parent script. */
(function () {
  var TASKS_LABEL = 'Tasks';

  MoxiePortal.ready(function (portal) {
    var projectId = null;
    var live = true;

    // While on the Tasks view, un-highlight the built-in Projects item.
    portal.style([
      'html[data-mp-tasks-active] #left-nav .portal-nav-link.is-active:not(.mp-tasks-link) {',
      '  background: transparent; color: var(--portal-nav-muted); font-weight: inherit;',
      '}',
      'html[data-mp-tasks-active] #left-nav .portal-nav-link.is-active:not(.mp-tasks-link)::before { display: none; }'
    ].join('\n'));

    function onTasksView() {
      var route = portal.router.currentRoute;
      return !!projectId && route.path === '/projects/' + projectId && route.query.v === 'tasks';
    }

    function findProjectsButton() {
      var links = document.querySelectorAll('#left-nav .portal-nav-link:not(.mp-tasks-link)');
      for (var i = 0; i < links.length; i++) {
        if ((links[i].getAttribute('aria-label') || '').trim() === 'Projects') return links[i];
      }
      return null;
    }

    function buildButton(projectsBtn) {
      var btn = projectsBtn.cloneNode(true);
      btn.classList.add('mp-tasks-link');
      btn.classList.remove('is-active');
      btn.removeAttribute('aria-current');
      btn.removeAttribute('data-tippy-directive');
      btn.setAttribute('aria-label', TASKS_LABEL);
      btn.setAttribute('content', TASKS_LABEL);
      btn.setAttribute('title', TASKS_LABEL);
      var svg = btn.querySelector('svg');
      if (svg) svg.innerHTML = portal.icons.listChecks;
      var label = btn.querySelector('.nav-label');
      if (label) label.textContent = TASKS_LABEL;
      btn.addEventListener('click', function () {
        if (projectId) portal.go('/projects/' + projectId + '?v=tasks');
      });
      return btn;
    }

    function remove() {
      var btn = document.querySelector('.mp-tasks-link');
      if (btn) btn.remove();
      document.documentElement.removeAttribute('data-mp-tasks-active');
    }

    function sync() {
      var projectsBtn = findProjectsButton();
      if (!live || !projectId || !projectsBtn) { remove(); return; }
      var btn = document.querySelector('.mp-tasks-link') || buildButton(projectsBtn);
      if (projectsBtn.nextElementSibling !== btn) projectsBtn.after(btn);

      // Follow the sidebar's collapsed (icon-only) mode.
      var collapsed = projectsBtn.classList.contains('is-collapsed');
      btn.classList.toggle('is-collapsed', collapsed);
      var label = btn.querySelector('.nav-label');
      if (label) label.style.display = collapsed ? 'none' : '';

      var activeNow = onTasksView();
      btn.classList.toggle('is-active', activeNow);
      if (activeNow) {
        btn.setAttribute('aria-current', 'page');
        document.documentElement.setAttribute('data-mp-tasks-active', '');
      } else {
        btn.removeAttribute('aria-current');
        document.documentElement.removeAttribute('data-mp-tasks-active');
      }
    }

    portal.data.projects().then(function (projects) {
      var activeProjects = projects.filter(function (p) { return p.active; });
      projectId = activeProjects.length ? activeProjects[0].id : null;
      sync();
    }, function () {});

    portal.onDom(sync);
    portal.onRoute(sync);

    return function () {
      live = false;
      remove();
    };
  });
})();
```

- [ ] **Step 3: Remove the old scripts and check syntax**

```bash
git rm -q portal-custom.js portal-tasks-link.js
npm test
```
Expected: pretest passes for both snippets; 35 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add snippets/
git commit -m "Add sidebar-restyle and nav-tasks-link snippets; remove old portal scripts"
```

---

### Task 7: The four Home card snippets

**Files:**
- Create: `snippets/home-waiting.js`, `snippets/home-recent.js`, `snippets/home-requests.js`, `snippets/home-projects.js`
- Delete: `portal-home.js`

**Interfaces:**
- Consumes: `portal.home.mount`, `portal.data.*`, `portal.tasks.*`, `portal.card/row/empty/footer/el`, `portal.formatDue/timeAgo`, `portal.user/features/go`, `portal.icons`.

- [ ] **Step 1: Write `snippets/home-waiting.js`**

```js
/* MoxiePortal snippet: "Waiting on you" Home card.
 * Lists tasks whose status is one of the parent's WAITING_STATUSES, with a link to each
 * project's task board. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Waiting on you';
  var EMPTY = 'Nothing is waiting on you right now.';
  var BOARD_LINK = 'View whole task board';

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      id: 'mp-waiting',
      slot: 'top',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return Promise.all([portal.data.waitingTasks(), portal.data.projects()]).then(function (res) {
          var waiting = res[0];
          var boards = res[1].filter(portal.tasks.visible);
          boards.sort(function (a, b) { return a.name.localeCompare(b.name); });

          var card = portal.card({ title: TITLE, icon: portal.icons.tasks, count: waiting.length });
          if (!waiting.length) {
            card.appendChild(portal.empty(EMPTY));
          } else {
            var list = portal.el('div', 'mp-list');
            waiting.forEach(function (item) {
              var meta = [item.status.label, item.project.name, portal.formatDue(item.task.dueDate)].filter(Boolean).join(' · ');
              list.appendChild(portal.row(item.task.name, meta, item.status.hexColor, function () { portal.tasks.open(item); }));
            });
            card.appendChild(list);
          }
          // One board link per project; name the project only when there is more than one.
          var several = boards.length > 1;
          boards.forEach(function (p) {
            var text = several ? BOARD_LINK + ' (' + p.name + ')' : BOARD_LINK;
            card.appendChild(portal.footer(text, function () { portal.go('/projects/' + p.id + '?v=tasks'); }));
          });
          return card;
        });
      }
    });
  });
})();
```

- [ ] **Step 2: Write `snippets/home-recent.js`**

```js
/* MoxiePortal snippet: "Recently updated" Home card.
 * Shows the newest comment or change made by someone other than the viewer on each task,
 * within the last DAYS days. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Recently updated';
  var DAYS = 14;
  var EMPTY = 'No updates in the last ' + DAYS + ' days.';
  var MAX_ROWS = 5;

  MoxiePortal.ready(function (portal) {
    // Let the longer "who did what" line wrap to two lines.
    portal.style('#mp-recent .action-row-copy small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }');

    // Activity names look like "Fake  Cathy" or "someone@example.com null".
    function tidyName(s) { return String(s || '').replace(/\s+/g, ' ').replace(/ null$/, '').trim(); }

    // Comment bodies can be HTML; DOMParser documents never run scripts or load images.
    function plainText(html) {
      var text = new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }

    function truncate(s, max) { return s.length > max ? s.slice(0, max - 1).replace(/\s+$/, '') + '…' : s; }

    // Newest comment or change on a task made by someone other than the viewer.
    function latestActivity(task, me) {
      var cutoff = Date.now() - DAYS * 864e5;
      var myNames = [tidyName((me.firstName || '') + ' ' + (me.lastName || '')), tidyName(me.email)].map(portal.norm);
      var best = null;
      function consider(timestamp, who, what) {
        var time = Date.parse(timestamp);
        if (!time || time < cutoff || (best && best.time >= time)) return;
        best = { time: time, who: tidyName(who), what: what };
      }
      (task.comments || []).forEach(function (c) {
        if (c.privateComment || String(c.authorId) === String(me.id)) return;
        var quote = truncate(plainText(c.comment), 80);
        consider(c.timestamp, c.author, quote ? 'commented: “' + quote + '”' : 'commented');
      });
      (task.events || []).forEach(function (e) {
        var who = tidyName(e.user);
        if (myNames.indexOf(portal.norm(who)) !== -1) return;
        var what = (e.events || []).map(function (text) {
          text = tidyName(text);
          if (text.indexOf(who + ' ') === 0) text = text.slice(who.length + 1);
          return text.charAt(0).toLowerCase() + text.slice(1);
        }).join(', ');
        consider(e.timestamp, who, what);
      });
      return best;
    }

    portal.home.mount({
      id: 'mp-recent',
      slot: 'top',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return portal.data.tasks().then(function (items) {
          var me = portal.user();
          var recent = [];
          items.forEach(function (item) {
            var activity = latestActivity(item.task, me);
            if (activity) recent.push({ item: item, activity: activity });
          });
          recent.sort(function (a, b) { return b.activity.time - a.activity.time; });

          var card = portal.card({ title: TITLE, icon: portal.icons.history, count: recent.length });
          if (!recent.length) {
            card.appendChild(portal.empty(EMPTY));
            return card;
          }
          var list = portal.el('div', 'mp-list');
          recent.slice(0, MAX_ROWS).forEach(function (r) {
            var a = r.activity;
            var meta = a.who + ' ' + a.what + ' · ' + portal.timeAgo(a.time);
            list.appendChild(portal.row(r.item.task.name, meta, null, function () { portal.tasks.open(r.item); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  });
})();
```

- [ ] **Step 3: Write `snippets/home-requests.js`**

```js
/* MoxiePortal snippet: "Requests" Home card.
 * Replaces the portal's own Requests card, which lists only the viewer's tickets, with
 * every open ticket for the client, newest activity first. Paste below the parent script. */
(function () {
  var TITLE = 'Requests';
  var EMPTY = 'No open requests.';
  var MAX_ROWS = 5;

  MoxiePortal.ready(function (portal) {
    // Same colour lookup the portal uses for ticket status dots.
    function statusColor(ticket, types) {
      var type = types.filter(function (x) { return String(x.id) === String(ticket.type); })[0];
      var match = type && (type.statusColors || []).filter(function (c) { return c && c.status === ticket.status; })[0];
      return match && /^#[0-9a-f]{3,8}$/i.test(match.hexColor) ? match.hexColor : 'var(--v-accent-base)';
    }

    portal.home.mount({
      id: 'mp-requests',
      slot: 'main',
      replaces: 'Tickets',
      render: function () {
        if (!portal.features().ticketsEnabled) return false;
        return Promise.all([portal.data.tickets(), portal.data.ticketSettings()]).then(function (res) {
          var tickets = res[0];
          var types = res[1];
          var card = portal.card({ title: TITLE, icon: portal.icons.ticket, count: tickets.length, openPath: '/requests' });
          if (!tickets.length) {
            card.appendChild(portal.empty(EMPTY));
            return card;
          }
          var list = portal.el('div', 'mp-list');
          tickets.slice(0, MAX_ROWS).forEach(function (t) {
            var updated = Date.parse(t.updated);
            var meta = ['#' + t.ticketNumber, t.status, t.unreadClient ? 'New reply' : null, updated ? 'updated ' + portal.timeAgo(updated) : null]
              .filter(Boolean).join(' · ');
            list.appendChild(portal.row(t.subject, meta, statusColor(t, types), function () { portal.go('/requests/' + t.id); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  });
})();
```

- [ ] **Step 4: Write `snippets/home-projects.js`**

```js
/* MoxiePortal snippet: "Projects" Home card.
 * Replaces the portal's own "Projects" card (really tasks awaiting approval) with the
 * client's active projects. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Projects';
  var MAX_ROWS = 5;

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      id: 'mp-projects',
      slot: 'main',
      replaces: 'Deliverables',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return Promise.all([portal.data.projects(), portal.data.waitingTasks()]).then(function (res) {
          var projects = res[0].filter(function (p) { return p.active; });
          if (!projects.length) return false;
          projects.sort(function (a, b) { return a.name.localeCompare(b.name); });
          var waiting = res[1];

          var card = portal.card({ title: TITLE, icon: portal.icons.folder, count: projects.length, openPath: '/projects' });
          var list = portal.el('div', 'mp-list');
          projects.slice(0, MAX_ROWS).forEach(function (p) {
            var count = waiting.filter(function (item) { return item.project.id === p.id; }).length;
            var lifecycle = p.lifecycleStatus && p.lifecycleStatus !== 'ACTIVE'
              ? p.lifecycleStatus.charAt(0) + p.lifecycleStatus.slice(1).toLowerCase() : null;
            var meta = [lifecycle, portal.formatDue(p.dueDate), count ? count + ' waiting on you' : null].filter(Boolean).join(' · ');
            var path = '/projects/' + p.id + (portal.tasks.visible(p) ? '?v=tasks' : '');
            list.appendChild(portal.row(p.name, meta, null, function () { portal.go(path); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  });
})();
```

- [ ] **Step 5: Remove the old home script, check syntax, commit**

```bash
git rm -q portal-home.js
npm test
git add snippets/
git commit -m "Add the four Home card snippets; remove portal-home.js"
```
Expected before commit: pretest passes for all six snippets; 35 tests pass.

---

### Task 8: Build script, README

**Files:**
- Create: `build.sh`, `README.md`

- [ ] **Step 1: Write `build.sh`**

```sh
#!/bin/sh
# Concatenates the MoxiePortal parent script and snippets into one file for pasting.
# Usage: ./build.sh [snippet.js ...] > dist/portal.js      (default: every snippet)
set -e
cd "$(dirname "$0")"
cat core/moxie-portal.js
if [ "$#" -eq 0 ]; then set -- snippets/*.js; fi
for f in "$@"; do
  printf '\n'
  cat "$f"
done
```

Run: `chmod +x build.sh && mkdir -p dist && ./build.sh > dist/portal.js && node --check dist/portal.js && ./build.sh snippets/sidebar-restyle.js | node --check -`
Expected: no output, exit 0 for both.

- [ ] **Step 2: Write `README.md`**

Audience: Moxie users who want to drop these into their own portal, some of whom will write snippets. Content, in this order:

1. Title "Moxie portal snippets", one paragraph: drop-in customisations for the Moxie client portal, a parent script plus pick-and-choose snippets, plain JavaScript pasted into Moxie, no build step or hosting.
2. A table of the six snippets with one line each.
3. "Requirements": a Moxie workspace whose client portal settings include the JavaScript embed code box; a portal contact to sign in as, or "Preview as contact" from a client's Portal access tab.
4. "Install": edit the settings at the top of `core/moxie-portal.js`; in Moxie open Settings > Client Portal > Advanced > JavaScript embed code; paste the parent; paste each wanted snippet below it in any order; save; check in the portal. Then the `build.sh` alternative with both command forms.
5. "Parent settings": `CLIENT_FILTER` with three examples (null, one key, two keys) and how to find a mapping key (Settings > Custom fields > Clients); `WAITING_STATUSES` with the note that labels must match the task status names used in project types.
6. "Snippets": a subsection per snippet (what it shows, which built-in it replaces where relevant, its constants in a short table).
7. "Writing your own snippet": the template below, then a reference table of the `portal` object grouped as App access, Hooks, Styling, Data, Tasks, UI helpers, Home cards, matching the spec's names exactly; the lifecycle paragraph (runs on activation per matching client, return a cleanup, styles/hooks/cards removed automatically).

```js
(function () {
  var GREETING = 'Welcome back';

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      id: 'mp-hello',
      slot: 'top',
      render: function () {
        var card = portal.card({ title: GREETING, icon: portal.icons.folder });
        card.appendChild(portal.empty('Signed in as ' + (portal.user().email || 'you')));
        return card;
      }
    });
  });
})();
```

8. "How it works, and what could break": the portal is a Vue 2 app and the parent reads its store and router through `#app.__vue__`; data comes from the portal's internal `/api/v1/{account}/portal/{client}/...` endpoints with the session's bearer token; none of this is a documented Moxie API, so a portal update can break it; the firewall note (about fifteen loads in five minutes blocks your address for a couple of minutes).
9. "Development": `npm install`, `npm test`, `./build.sh`; tests cover the parent only.
10. "License": MIT, copyright 2026 Cathy Sarisky, Spectral Web Services, with a link to spectralwebservices.com.

- [ ] **Step 3: Commit**

```bash
git add build.sh README.md
git commit -m "Add build script and README for Moxie portal snippets"
```

---

### Task 9: Final checks and hand-off

- [ ] **Step 1: Full verification**

```bash
npm test
grep -rn "swc" core snippets README.md build.sh || echo "no swc left"
git status --short
```
Expected: 35 passing; "no swc left"; clean tree apart from `dist/` (ignored).

- [ ] **Step 2: Manual verification list for Cathy** (in the final message, not a file)

Paste `./build.sh > dist/portal.js` output into Settings > Client Portal > Advanced > JavaScript embed code, then with one or two portal loads at most check: green sidebar and no logo for a TEST client and the normal look for another client; the Tasks menu item appears under Projects, follows collapse, highlights on the board; Home shows Waiting on you and Recently updated side by side above the dashboard, Requests in place of the built-in Requests card, Projects in place of the built-in Projects card; clicking a waiting task opens the side panel and the cards refresh when it closes.
