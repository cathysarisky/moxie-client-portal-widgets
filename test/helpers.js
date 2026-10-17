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
//       filter (replaces CLIENT_FILTER; default { ClientType: 'TEST' }), homeCards (replaces HOME_CARDS),
//       attachLater (leave #app without __vue__).
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
  if ('homeCards' in opts) {
    source = source.replace(/var HOME_CARDS = [\s\S]*?\];/, 'var HOME_CARDS = ' + JSON.stringify(opts.homeCards) + ';');
  }
  window.eval(source);
  return { window, document: window.document, store, router, calls, warns, attach, MoxiePortal: window.MoxiePortal, source };
}

const SNIPPETS = path.join(__dirname, '..', 'snippets');

// Runs snippets/<name>.js inside a booted window, with its top-level `var` settings replaced.
function loadSnippet(t, name, settings = {}) {
  let source = fs.readFileSync(path.join(SNIPPETS, name + '.js'), 'utf8');
  Object.keys(settings).forEach((key) => {
    const re = new RegExp('var ' + key + ' = [\\s\\S]*?;(?=\\n)');
    if (!re.test(source)) throw new Error('no setting ' + key + ' in ' + name);
    source = source.replace(re, 'var ' + key + ' = ' + JSON.stringify(settings[key]) + ';');
  });
  t.window.eval(source);
  return source;
}

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

// Values built inside the jsdom window have that window's prototypes; strip them for deep comparison.
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { boot, loadSnippet, tick, plain };
