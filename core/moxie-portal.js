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

  function warn(what, err) { console.warn('[MoxiePortal] ' + what, err); }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

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

  // A clickable list row in the portal's own style, with an optional status dot.
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

  // ---------------------------------------------------------------------------
  // Registration. Works before the portal's app has been found.
  // ---------------------------------------------------------------------------

  var snippets = [];   // every fn passed to ready()
  var active = null;   // { cleanups: [], styles: [] } while a matching client is active
  var portal = null;   // built in start()

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

    // Full-width link at the bottom of a card, e.g. "View whole task board".
    function footer(text, onClick) {
      var node = button('mp-footer', onClick);
      node.appendChild(el('span', null, text));
      node.appendChild(svg(ICONS.arrow, 18));
      return node;
    }

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
      el: el, svg: svg, button: button, card: card, row: row, empty: empty, footer: footer,
      norm: norm, timeAgo: timeAgo, formatDue: formatDue, icons: ICONS
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
