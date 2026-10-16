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
