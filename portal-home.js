(function () {
  if (window.__swcHome) return;
  window.__swcHome = true;

  var CLIENT_TYPE = 'TEST';
  var STATUS_LABELS = ['Wait on client', 'Ready for approval']; //change these to your client status labels
  var WAITING_TITLE = 'Waiting on you';
  var WAITING_EMPTY = 'Nothing is waiting on you right now.';
  var BOARD_LINK = 'View whole task board';
  var PROJECTS_TITLE = 'Projects';
  var MAX_PROJECT_ROWS = 5;
  var RECENT_TITLE = 'Recently updated';
  var RECENT_DAYS = 14;
  var RECENT_EMPTY = 'No updates in the last ' + RECENT_DAYS + ' days.';
  var MAX_RECENT_ROWS = 5;
  var REQUESTS_TITLE = 'Requests';
  var REQUESTS_EMPTY = 'No open requests.';
  var MAX_REQUEST_ROWS = 5;

  var WAITING_ID = 'swc-waiting-widget';
  var PROJECTS_ID = 'swc-projects-card';
  var RECENT_ID = 'swc-recent-card';
  var REQUESTS_ID = 'swc-requests-card';
  var GRID_ID = 'swc-home-grid';
  var TOP_ID = 'swc-top-grid';

  // Lucide icons, same stroke style as the portal's own.
  var ICON_TASKS = '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>';
  var ICON_FOLDER = '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>';
  var ICON_CHEVRON = '<path d="m9 18 6-6-6-6"/>';
  var ICON_ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
  var ICON_TICKET = '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>';
  var ICON_HISTORY = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>';

  var style = document.createElement('style');
  style.textContent = [
    '.swc-card { overflow: hidden; border: 1px solid var(--portal-border); border-radius: var(--portal-radius-md); background: var(--portal-surface); box-shadow: 0 1px 2px rgba(16, 17, 15, .04); }',
    '.swc-card .swc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 16px 13px; border-bottom: 1px solid var(--portal-border); }',
    '.swc-card .swc-title { min-width: 0; display: flex; align-items: center; gap: 11px; }',
    '.swc-card .swc-icon { width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center; border-radius: 11px; background: var(--v-blue_5-base); color: var(--v-primary-base); }',
    '.swc-card h3 { overflow: hidden; margin: 0; color: var(--portal-text); font-size: 16px; font-weight: 600; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }',
    '.swc-card .swc-count { min-width: 24px; height: 24px; display: grid; place-items: center; padding: 0 7px; border-radius: 99px; background: var(--v-gray_20-base); color: var(--portal-muted); font-size: 12px; font-weight: 600; }',
    '.swc-card .swc-open { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border: 0; border-radius: var(--brand-button-radius, 10px); background: transparent; color: var(--portal-muted); cursor: pointer; }',
    '.swc-card .swc-open:hover { background: var(--v-gray_20-base); color: var(--portal-text); }',
    '.swc-card .swc-list { display: grid; }',
    '.swc-card .swc-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; vertical-align: 0; }',
    '.swc-card .swc-empty { margin: 0; padding: 16px; color: var(--portal-muted); font-size: 14px; }',
    '.swc-card .swc-footer { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border: 0; border-top: 1px solid var(--portal-border); background: transparent; color: var(--v-primary-base); font-size: 14px; font-weight: 500; text-align: left; cursor: pointer; }',
    '.swc-card .swc-footer:hover { background: var(--v-gray_10-base); }',
    '#' + TOP_ID + ', #' + GRID_ID + ' { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 18px; margin-bottom: 28px; }',
    '#' + GRID_ID + ' { align-items: start; }',
    // Side-by-side cards share a height; lists grow so the board link sits at the bottom.
    '#' + TOP_ID + ' > .swc-card { display: flex; flex-direction: column; }',
    '#' + TOP_ID + ' .swc-list, #' + TOP_ID + ' .swc-empty { flex: 1; align-content: start; }',
    '#' + RECENT_ID + ' .action-row-copy small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }',
    '@media (max-width: 599px) {',
    '  #' + TOP_ID + ', #' + GRID_ID + ' { gap: 14px; margin-bottom: 20px; }',
    '}',
    '[data-swc-hidden] { display: none !important; }'
  ].join('\n');
  document.head.appendChild(style);

  function whenReady(cb) {
    var tries = 0;
    (function check() {
      var app = document.querySelector('#app');
      var vm = app && app.__vue__;
      if (vm && vm.$store && vm.$router && vm.$store.getters.getClientId) return cb(vm.$store, vm.$router);
      if (++tries < 100) setTimeout(check, 100);
    })();
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

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, onClick) {
    var node = el('button', className);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  // Activity names look like "Fake  Cathy" or "someone@example.com null".
  function tidyName(s) { return String(s || '').replace(/\s+/g, ' ').replace(/ null$/, '').trim(); }

  // Comment bodies can be HTML; DOMParser documents never run scripts or load images.
  function plainText(html) {
    var text = new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function truncate(s, max) { return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; }

  function timeAgo(time) {
    var mins = Math.round((Date.now() - time) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    return days === 1 ? 'yesterday' : days + ' days ago';
  }

  whenReady(function (store, router) {
    var data = null;

    function go(path) { router.push(path).catch(function () {}); }

    function clientType() {
      var ctx = store.state.clientPortalContext;
      var values = (ctx && ctx.client && ctx.client.customValues) || [];
      for (var i = 0; i < values.length; i++) if (values[i].mappingKey === 'ClientType') return values[i].value;
      return null;
    }

    // Everything below applies only to clients whose "Client type" matches CLIENT_TYPE.
    function isTargetClient() { return norm(clientType()) === norm(CLIENT_TYPE); }

    function api(path) {
      var g = store.getters;
      return fetch(g.getPodUrl + 'api/v1/' + g.getAccountId + '/portal/' + g.getClientId + path, {
        headers: { Authorization: 'Bearer ' + store.state.accessToken }
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }

    // Same rule the portal uses before it shows a project's task views.
    function tasksVisible(project) {
      return project.active &&
        (project.portalAccess === 'Full access' || project.portalAccess === 'Read only') &&
        project.lifecycleStatus !== 'PAUSED' && project.lifecycleStatus !== 'CANCELED';
    }

    function statusOf(type, statusId) {
      var list = type.statusList || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === statusId) return list[i];
      return null;
    }

    // Newest comment or change on a task made by someone other than the viewer.
    function latestActivity(task, me) {
      var cutoff = Date.now() - RECENT_DAYS * 864e5;
      var myNames = [tidyName((me.firstName || '') + ' ' + (me.lastName || '')), tidyName(me.email)].map(norm);
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
        if (myNames.indexOf(norm(who)) !== -1) return;
        var what = (e.events || []).map(function (text) {
          text = tidyName(text);
          if (text.indexOf(who + ' ') === 0) text = text.slice(who.length + 1);
          return text.charAt(0).toLowerCase() + text.slice(1);
        }).join(', ');
        consider(e.timestamp, who, what);
      });
      return best;
    }

    function loadProjectData() {
      var wanted = STATUS_LABELS.map(norm);
      var me = store.state.loggedInUser || {};
      return Promise.all([api('/projects'), api('/projectTypes')]).then(function (res) {
        var projects = res[0].filter(function (p) { return p.active; });
        projects.sort(function (a, b) { return a.name.localeCompare(b.name); });
        var taskProjects = {};
        projects.filter(tasksVisible).forEach(function (p) { taskProjects[p.id] = p; });

        return Promise.all(res[1].map(function (type) {
          return api('/deliverables?projectTypeId=' + encodeURIComponent(type.id)).then(function (tasks) {
            return tasks.filter(function (t) {
              var p = taskProjects[t.projectId];
              if (!p || t.archived || t.isDeleted) return false;
              if (p.portalAccessAssignedOnly && (t.assignedToList || []).indexOf(me.id) === -1) return false;
              return true;
            }).map(function (t) {
              return { task: t, project: taskProjects[t.projectId], status: statusOf(type, t.statusId), statusList: type.statusList };
            });
          });
        })).then(function (groups) {
          var items = [].concat.apply([], groups);

          var waiting = items.filter(function (item) {
            return item.status && wanted.indexOf(norm(item.status.label)) !== -1;
          });
          waiting.sort(function (a, b) {
            var da = a.task.dueDate || '9999', db = b.task.dueDate || '9999';
            return da < db ? -1 : da > db ? 1 : a.task.name.localeCompare(b.task.name);
          });

          var recent = [];
          items.forEach(function (item) {
            var activity = latestActivity(item.task, me);
            if (activity) recent.push(Object.assign({ activity: activity }, item));
          });
          recent.sort(function (a, b) { return b.activity.time - a.activity.time; });

          var boardProjects = projects.filter(tasksVisible);
          return { waiting: waiting, recent: recent, projects: projects, boardProjects: boardProjects };
        });
      });
    }

    function load() {
      var features = store.getters.getFeatures || {};
      return Promise.all([
        features.projectsEnabled ? loadProjectData() : null,
        features.ticketsEnabled ? Promise.all([api('/tickets?open=true'), api('/tickets/settings')]) : null
      ]).then(function (res) {
        var result = res[0] || { waiting: [], recent: [], projects: [], boardProjects: [] };
        result.projectsEnabled = !!res[0];
        result.tickets = null;
        result.ticketTypes = [];
        if (res[1]) {
          // Every open ticket for the client, as on the Requests page; newest activity first.
          result.tickets = res[1][0].filter(function (t) { return t.open !== false && !t.archived; });
          result.tickets.sort(function (a, b) { return (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0); });
          result.ticketTypes = res[1][1] || [];
        }
        return result;
      });
    }

    function formatDue(value) {
      if (!value) return null;
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      var date = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
      if (isNaN(date)) return null;
      return 'Due ' + date.toLocaleDateString(store.state.locale || undefined, { month: 'short', day: 'numeric' });
    }

    function openTask(item) {
      api('/deliverables/' + item.task.id).then(function (detail) {
        return store.state.globalModalController.openModal(
          { name: 'DeliverableDetail' },
          { origDeliverable: detail, project: item.project, statusList: item.statusList, subtasks: [] },
          true, false, 'right-panel'
        );
      }).then(refresh, function () {
        go('/projects/' + item.project.id + '?v=tasks');
      });
    }

    function header(card, title, icon, count, openPath) {
      var head = el('header', 'swc-head');
      var titleBox = el('div', 'swc-title');
      var iconBox = el('span', 'swc-icon');
      iconBox.appendChild(svg(icon, 20));
      titleBox.appendChild(iconBox);
      titleBox.appendChild(el('h3', null, title));
      titleBox.appendChild(el('span', 'swc-count', String(count)));
      head.appendChild(titleBox);
      if (openPath) {
        var open = button('swc-open', function () { go(openPath); });
        open.setAttribute('aria-label', title);
        open.appendChild(svg(ICON_ARROW, 18));
        head.appendChild(open);
      }
      card.appendChild(head);
    }

    function row(title, metaText, dotColor, onClick) {
      var r = button('portal-action-row', onClick);
      var copy = el('span', 'action-row-copy');
      copy.appendChild(el('strong', null, title));
      if (metaText) {
        var meta = el('small');
        if (dotColor) {
          var dot = el('span', 'swc-dot');
          dot.style.background = dotColor;
          meta.appendChild(dot);
        }
        meta.appendChild(document.createTextNode(metaText));
        copy.appendChild(meta);
      }
      r.appendChild(copy);
      r.appendChild(svg(ICON_CHEVRON, 18));
      return r;
    }

    function renderWaiting(card) {
      card.textContent = '';
      header(card, WAITING_TITLE, ICON_TASKS, data.waiting.length, null);
      if (!data.waiting.length) {
        card.appendChild(el('p', 'swc-empty', WAITING_EMPTY));
      } else {
        var list = el('div', 'swc-list');
        data.waiting.forEach(function (item) {
          var meta = [item.status.label, item.project.name, formatDue(item.task.dueDate)].filter(Boolean).join(' · ');
          list.appendChild(row(item.task.name, meta, item.status.hexColor, function () { openTask(item); }));
        });
        card.appendChild(list);
      }
      // One board link per project; name the project only when there is more than one.
      var several = data.boardProjects.length > 1;
      data.boardProjects.forEach(function (p) {
        var footer = button('swc-footer', function () { go('/projects/' + p.id + '?v=tasks'); });
        footer.appendChild(el('span', null, several ? BOARD_LINK + ' (' + p.name + ')' : BOARD_LINK));
        footer.appendChild(svg(ICON_ARROW, 18));
        card.appendChild(footer);
      });
    }

    function renderRecent(card) {
      card.textContent = '';
      header(card, RECENT_TITLE, ICON_HISTORY, data.recent.length, null);
      if (!data.recent.length) {
        card.appendChild(el('p', 'swc-empty', RECENT_EMPTY));
        return;
      }
      var list = el('div', 'swc-list');
      data.recent.slice(0, MAX_RECENT_ROWS).forEach(function (item) {
        var a = item.activity;
        var meta = [a.who + ' ' + a.what, timeAgo(a.time)].join(' · ');
        list.appendChild(row(item.task.name, meta, null, function () { openTask(item); }));
      });
      card.appendChild(list);
    }

    // Same color lookup the portal uses for ticket status dots.
    function ticketColor(t) {
      var type = data.ticketTypes.filter(function (x) { return String(x.id) === String(t.type); })[0];
      var match = type && (type.statusColors || []).filter(function (c) { return c && c.status === t.status; })[0];
      return match && /^#[0-9a-f]{3,8}$/i.test(match.hexColor) ? match.hexColor : 'var(--v-accent-base)';
    }

    function renderRequests(card) {
      card.textContent = '';
      header(card, REQUESTS_TITLE, ICON_TICKET, data.tickets.length, '/requests');
      if (!data.tickets.length) {
        card.appendChild(el('p', 'swc-empty', REQUESTS_EMPTY));
        return;
      }
      var list = el('div', 'swc-list');
      data.tickets.slice(0, MAX_REQUEST_ROWS).forEach(function (t) {
        var updated = Date.parse(t.updated);
        var meta = ['#' + t.ticketNumber, t.status, t.unreadClient ? 'New reply' : null, updated ? 'updated ' + timeAgo(updated) : null]
          .filter(Boolean).join(' · ');
        list.appendChild(row(t.subject, meta, ticketColor(t), function () { go('/requests/' + t.id); }));
      });
      card.appendChild(list);
    }

    function renderProjects(card) {
      card.textContent = '';
      header(card, PROJECTS_TITLE, ICON_FOLDER, data.projects.length, '/projects');
      var list = el('div', 'swc-list');
      data.projects.slice(0, MAX_PROJECT_ROWS).forEach(function (p) {
        var waitingCount = data.waiting.filter(function (item) { return item.project.id === p.id; }).length;
        var lifecycle = p.lifecycleStatus && p.lifecycleStatus !== 'ACTIVE'
          ? p.lifecycleStatus.charAt(0) + p.lifecycleStatus.slice(1).toLowerCase() : null;
        var meta = [lifecycle, formatDue(p.dueDate), waitingCount ? waitingCount + ' waiting on you' : null].filter(Boolean).join(' · ');
        var path = '/projects/' + p.id + (tasksVisible(p) ? '?v=tasks' : '');
        list.appendChild(row(p.name, meta, null, function () { go(path); }));
      });
      card.appendChild(list);
    }

    // Find one of the portal's own Home cards by its component: "Tickets" is the Requests card
    // (only the viewer's own tickets); "Deliverables" without taskMode is the "Projects" card
    // (tasks awaiting approval).
    function builtInCard(dashboard, componentName) {
      var cards = dashboard.querySelectorAll(':scope > .portal-action-card');
      for (var i = 0; i < cards.length; i++) {
        for (var vm = cards[i].__vue__; vm && vm.$el === cards[i]; vm = vm.$parent) {
          if (vm.$options.name === componentName && !vm.taskMode) return cards[i];
        }
      }
      return null;
    }

    function ensure(id, className) {
      var node = document.getElementById(id);
      if (node) return { node: node, isNew: false };
      node = el('section', className);
      node.id = id;
      return { node: node, isNew: true };
    }

    function removeById(id) {
      var node = document.getElementById(id);
      if (node) node.remove();
    }

    // Keep the cards on the Home page; the portal re-renders it often.
    function sync(forceRender) {
      var home = router.currentRoute.path === '/welcome' ? document.querySelector('.welcome-page') : null;
      if (!home || !data || !isTargetClient()) {
        [TOP_ID, REQUESTS_ID, PROJECTS_ID, GRID_ID].forEach(removeById);
        var hidden = document.querySelectorAll('[data-swc-hidden]');
        for (var i = 0; i < hidden.length; i++) hidden[i].removeAttribute('data-swc-hidden');
        return;
      }

      var anchor = home.querySelector(':scope > .action-dashboard, :scope > .dashboard-loading, :scope > .dashboard-state, :scope > .upcoming-dashboard');
      var top = null;
      if (data.projectsEnabled) {
        top = ensure(TOP_ID, null);
        if (top.node.parentElement !== home) home.insertBefore(top.node, anchor);

        var waiting = ensure(WAITING_ID, 'swc-card');
        if (top.node.firstElementChild !== waiting.node) top.node.prepend(waiting.node);
        if (forceRender || waiting.isNew) renderWaiting(waiting.node);

        var recent = ensure(RECENT_ID, 'swc-card');
        if (waiting.node.nextElementSibling !== recent.node) waiting.node.after(recent.node);
        if (forceRender || recent.isNew) renderRecent(recent.node);
      } else {
        removeById(TOP_ID);
      }

      // Our Requests and Projects cards take the place of the portal's own.
      var cards = [];
      if (data.tickets) cards.push({ id: REQUESTS_ID, builtIn: 'Tickets', render: renderRequests });
      else removeById(REQUESTS_ID);
      if (data.projects.length) cards.push({ id: PROJECTS_ID, builtIn: 'Deliverables', render: renderProjects });
      else removeById(PROJECTS_ID);

      var dashboard = home.querySelector(':scope > .action-dashboard');
      var grid = null;
      if (dashboard || !cards.length) {
        removeById(GRID_ID);
      } else {
        // No portal cards to sit beside (nothing needs attention), so use our own row.
        grid = ensure(GRID_ID, null).node;
        if (top) {
          if (grid.previousElementSibling !== top.node) top.node.after(grid);
        } else if (grid.parentElement !== home) {
          home.insertBefore(grid, anchor);
        }
      }

      cards.forEach(function (c, i) {
        var card = ensure(c.id, 'swc-card');
        if (dashboard) {
          var builtIn = builtInCard(dashboard, c.builtIn);
          if (builtIn) {
            builtIn.setAttribute('data-swc-hidden', '');
            if (builtIn.nextElementSibling !== card.node) builtIn.after(card.node);
          } else if (card.node.parentElement !== dashboard) {
            if (c.id === REQUESTS_ID) dashboard.prepend(card.node);
            else dashboard.appendChild(card.node);
          }
        } else if (grid.children[i] !== card.node) {
          grid.insertBefore(card.node, grid.children[i] || null);
        }
        if (forceRender || card.isNew) c.render(card.node);
      });
    }

    function refresh() {
      if (!isTargetClient()) {
        data = null;
        sync(false);
        return;
      }
      var clientId = store.getters.getClientId;
      load().then(function (result) {
        if (clientId !== store.getters.getClientId) return;
        data = result;
        sync(true);
      }).catch(function () {
        data = null;
        sync(false);
      });
    }

    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; sync(false); });
    }).observe(document.body, { childList: true, subtree: true });

    router.afterEach(function (to) {
      if (to.path === '/welcome') refresh();
      else setTimeout(function () { sync(false); }, 0);
    });
    store.watch(function () { return store.getters.getClientId + '|' + clientType(); }, refresh);

    refresh();
  });
})();
