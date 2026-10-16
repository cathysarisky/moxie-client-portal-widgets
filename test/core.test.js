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
