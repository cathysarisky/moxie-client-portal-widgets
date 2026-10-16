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

    portal = {
      store: store, router: router, go: go,
      clientId: clientId, clientValues: clientValues, user: user, features: features,
      api: api, style: style, onRoute: onRoute, onDom: onDom,
      data: data, tasks: tasks,
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
      routeHooks = [];
      domHooks = [];
      cache = {};
    }

    function sync() {
      deactivate();
      if (passes()) activate();
    }

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

    store.watch(function () { return clientId() + '|' + JSON.stringify(clientValues()); }, sync);
    sync();
  }
})();
