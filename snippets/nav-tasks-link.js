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
