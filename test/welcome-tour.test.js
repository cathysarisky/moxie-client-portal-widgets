'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

const HOOK = 'https://hook.example/abc';

function start(opts = {}, settings = {}) {
  const t = boot(Object.assign({ route: '/welcome' }, opts));
  t.sent = [];
  const portalFetch = t.window.fetch;
  t.window.fetch = (url, init) => {
    if (url === HOOK) { t.sent.push(JSON.parse(init.body)); return Promise.resolve({ ok: true }); }
    return portalFetch(url, init);
  };
  if (opts.beforeLoad) opts.beforeLoad(t);
  loadSnippet(t, 'welcome-tour', Object.assign({ WEBHOOK_URL: HOOK }, settings));
  return t;
}
const modal = (t) => t.document.querySelector('.mp-tour-backdrop');
const ONBOARDED = [{ mappingKey: 'ClientType', value: 'TEST' }, { mappingKey: 'AccessedPortal', value: 'Yes' }];

test('first visit: opens the modal and sends first_login', () => {
  const t = start();
  assert.ok(modal(t));
  assert.equal(t.document.querySelector('.mp-tour h2').textContent, 'Welcome to your client portal');
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].event, 'first_login');
  assert.equal(t.sent[0].clientId, 'client-1');
  assert.equal(t.sent[0].email, 'pat@example.com');
});

test('closing marks the tour done, fires mp:tour-done, and does not reopen on the next load', () => {
  const t = start();
  let fired = null;
  t.window.addEventListener('mp:tour-done', (e) => { fired = e.detail.clientId; });
  t.document.querySelector('.mp-tour-btn').click();
  assert.equal(modal(t), null);
  assert.equal(fired, 'client-1');
  assert.equal(t.window.localStorage.getItem('mp-tour-done:client-1'), '1');
  assert.equal(t.window.localStorage.getItem('mp-tour-seen:client-1'), '1');
});

test('Escape and a click on the backdrop close the modal', () => {
  const t = start();
  t.document.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(modal(t), null);
  t.window.MoxiePortalTour.open();
  modal(t).dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
  assert.equal(modal(t), null);
});

test('an onboarded client gets no modal, only a login event', () => {
  const t = start({ customValues: ONBOARDED });
  assert.equal(modal(t), null);
  assert.deepEqual(t.sent.map((e) => e.event), ['login']);
});

test('events go out once per browser session', () => {
  const t = start({ customValues: ONBOARDED, beforeLoad: (x) => x.window.sessionStorage.setItem('mp-login-sent:client-1', '1') });
  assert.equal(t.sent.length, 0);
});

test('no webhook URL sends nothing but still shows the modal', () => {
  const t = start({}, { WEBHOOK_URL: '' });
  assert.ok(modal(t));
  assert.equal(t.sent.length, 0);
});

test('the video frame uses the URL, the ratio, and sends the page origin', () => {
  const t = start({}, { VIDEO_URL: 'https://www.tella.tv/video/abc/embed', VIDEO_RATIO: '49.0625%' });
  const frame = t.document.querySelector('.mp-tour-video iframe');
  assert.equal(frame.getAttribute('src'), 'https://www.tella.tv/video/abc/embed');
  assert.equal(frame.getAttribute('referrerpolicy'), 'origin');
  const css = [...t.document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  assert.match(css, /\.mp-tour-video \{ position: relative; padding-top: 49\.0625%;/);
});

test('SHOW_TOUR false: no modal, but the welcome still counts as done', () => {
  const t = start({}, { SHOW_TOUR: false });
  assert.equal(modal(t), null);
  assert.equal(t.window.localStorage.getItem('mp-tour-done:client-1'), '1');
  assert.deepEqual(t.sent.map((e) => e.event), ['first_login']);
});

test('switching to a client that does not match removes the modal and the replay hook', async () => {
  const t = start();
  assert.ok(t.window.MoxiePortalTour);
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'OTHER' }];
  t.store.notify();
  await tick();
  assert.equal(modal(t), null);
  assert.equal(t.window.MoxiePortalTour, undefined);
});
