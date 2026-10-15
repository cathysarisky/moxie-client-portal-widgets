(function () {
  if (window.__swcTasksLink) return;
  window.__swcTasksLink = true;

  var CLIENT_TYPE = 'TEST';
  var TASKS_LABEL = 'Tasks';
  // Lucide "list-checks", same stroke style as the built-in menu icons.
  var TASKS_ICON = '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>';

  var style = document.createElement('style');
  style.textContent = [
    // While on the Tasks view, un-highlight the built-in Projects item.
    'html[data-swc-tasks-active] #left-nav .portal-nav-link.is-active:not(.swc-tasks-link) {',
    '  background: transparent; color: var(--portal-nav-muted); font-weight: inherit;',
    '}',
    'html[data-swc-tasks-active] #left-nav .portal-nav-link.is-active:not(.swc-tasks-link)::before { display: none; }'
  ].join('\n');
  document.head.appendChild(style);

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  function whenReady(cb) {
    var tries = 0;
    (function check() {
      var app = document.querySelector('#app');
      var vm = app && app.__vue__;
      if (vm && vm.$store && vm.$router && vm.$store.getters.getClientId) return cb(vm.$store, vm.$router);
      if (++tries < 100) setTimeout(check, 100);
    })();
  }

  whenReady(function (store, router) {
    var projectId = null;
    var loadedForClient = null;

    // Client custom fields by mapping key, e.g. { ClientType: 'TNC' }.
    function clientCustomValues() {
      var ctx = store.state.clientPortalContext;
      var values = {};
      ((ctx && ctx.client && ctx.client.customValues) || []).forEach(function (cv) {
        values[cv.mappingKey] = cv.value;
      });
      return values;
    }

    // Exposes the value as <html data-client-type="TNC"> for CSS and other scripts.
    function applyClientType() {
      var type = clientCustomValues().ClientType;
      if (type) document.documentElement.setAttribute('data-client-type', type);
      else document.documentElement.removeAttribute('data-client-type');
    }

    // Everything below applies only to clients whose "Client type" matches CLIENT_TYPE.
    function isTargetClient() {
      return norm(clientCustomValues().ClientType) === norm(CLIENT_TYPE);
    }

    function loadProject() {
      var clientId = store.getters.getClientId;
      if (!clientId || clientId === loadedForClient) return;
      loadedForClient = clientId;
      projectId = null;
      syncNav();
      var url = store.getters.getPodUrl + 'api/v1/' + store.getters.getAccountId + '/portal/' + clientId + '/projects';
      fetch(url, { headers: { Authorization: 'Bearer ' + store.state.accessToken } })
        .then(function (res) { return res.ok ? res.json() : []; })
        .then(function (projects) {
          if (clientId !== store.getters.getClientId) return;
          var active = projects.filter(function (p) { return p.active; });
          projectId = active.length ? active[0].id : null;
          syncNav();
        })
        .catch(function () { loadedForClient = null; });
    }

    function onTasksView() {
      var route = router.currentRoute;
      return !!projectId && route.path === '/projects/' + projectId && route.query.v === 'tasks';
    }

    function findProjectsButton() {
      var links = document.querySelectorAll('#left-nav .portal-nav-link:not(.swc-tasks-link)');
      for (var i = 0; i < links.length; i++) {
        if ((links[i].getAttribute('aria-label') || '').trim() === 'Projects') return links[i];
      }
      return null;
    }

    function buildTasksButton(projectsBtn) {
      var btn = projectsBtn.cloneNode(true);
      btn.classList.add('swc-tasks-link');
      btn.classList.remove('is-active');
      btn.removeAttribute('aria-current');
      btn.removeAttribute('data-tippy-directive');
      btn.setAttribute('aria-label', TASKS_LABEL);
      btn.setAttribute('content', TASKS_LABEL);
      btn.setAttribute('title', TASKS_LABEL);
      var svg = btn.querySelector('svg');
      if (svg) svg.innerHTML = TASKS_ICON;
      var label = btn.querySelector('.nav-label');
      if (label) label.textContent = TASKS_LABEL;
      btn.addEventListener('click', function () {
        if (projectId) router.push('/projects/' + projectId + '?v=tasks').catch(function () {});
      });
      return btn;
    }

    function syncNav() {
      var btn = document.querySelector('.swc-tasks-link');
      var projectsBtn = findProjectsButton();
      if (!projectId || !projectsBtn || !isTargetClient()) {
        if (btn) btn.remove();
        document.documentElement.removeAttribute('data-swc-tasks-active');
        return;
      }
      if (!btn) btn = buildTasksButton(projectsBtn);
      if (projectsBtn.nextElementSibling !== btn) projectsBtn.after(btn);

      // Follow the sidebar's collapsed (icon-only) mode.
      var collapsed = projectsBtn.classList.contains('is-collapsed');
      btn.classList.toggle('is-collapsed', collapsed);
      var label = btn.querySelector('.nav-label');
      if (label) label.style.display = collapsed ? 'none' : '';

      var active = onTasksView();
      btn.classList.toggle('is-active', active);
      if (active) {
        btn.setAttribute('aria-current', 'page');
        document.documentElement.setAttribute('data-swc-tasks-active', '');
      } else {
        btn.removeAttribute('aria-current');
        document.documentElement.removeAttribute('data-swc-tasks-active');
      }
    }

    // The portal re-renders the menu (route changes, collapsing, client switch); put the item back.
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; syncNav(); });
    }).observe(document.body, { childList: true, subtree: true });

    router.afterEach(function () { setTimeout(syncNav, 0); });
    function update() {
      applyClientType();
      if (isTargetClient()) loadProject();
      syncNav();
    }
    store.watch(function () { return store.getters.getClientId + '|' + clientCustomValues().ClientType; }, update);
    update();
  });
})();
