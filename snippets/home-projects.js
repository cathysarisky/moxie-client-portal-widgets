/* MoxiePortal snippet: "Projects" Home card.
 * Replaces the portal's own "Projects" card (really tasks awaiting approval) with the
 * client's active projects. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Projects';
  var MAX_ROWS = 5;

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      name: 'projects',
      replaces: 'Deliverables',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return Promise.all([portal.data.projects(), portal.data.waitingTasks()]).then(function (res) {
          var projects = res[0].filter(function (p) { return p.active; });
          if (!projects.length) return false;
          projects.sort(function (a, b) { return a.name.localeCompare(b.name); });
          var waiting = res[1];

          var card = portal.card({ title: TITLE, icon: portal.icons.folder, count: projects.length, openPath: '/projects' });
          var list = portal.el('div', 'mp-list');
          projects.slice(0, MAX_ROWS).forEach(function (p) {
            var count = waiting.filter(function (item) { return item.project.id === p.id; }).length;
            var lifecycle = p.lifecycleStatus && p.lifecycleStatus !== 'ACTIVE'
              ? p.lifecycleStatus.charAt(0) + p.lifecycleStatus.slice(1).toLowerCase() : null;
            var meta = [lifecycle, portal.formatDue(p.dueDate), count ? count + ' waiting on you' : null].filter(Boolean).join(' · ');
            var path = '/projects/' + p.id + (portal.tasks.visible(p) ? '?v=tasks' : '');
            list.appendChild(portal.row(p.name, meta, null, function () { portal.go(path); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  });
})();
