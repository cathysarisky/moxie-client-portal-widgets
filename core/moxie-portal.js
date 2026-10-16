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
