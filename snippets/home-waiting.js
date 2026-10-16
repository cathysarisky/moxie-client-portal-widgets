/* MoxiePortal snippet: "Waiting on you" Home card.
 * Lists tasks whose status is one of the parent's WAITING_STATUSES, with a link to each
 * project's task board. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Waiting on you';
  var EMPTY = 'Nothing is waiting on you right now.';
  var BOARD_LINK = 'View whole task board';

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      name: 'waiting',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return Promise.all([portal.data.waitingTasks(), portal.data.projects()]).then(function (res) {
          var waiting = res[0];
          var boards = res[1].filter(portal.tasks.visible);
          boards.sort(function (a, b) { return a.name.localeCompare(b.name); });

          var card = portal.card({ title: TITLE, icon: portal.icons.tasks, count: waiting.length });
          if (!waiting.length) {
            card.appendChild(portal.empty(EMPTY));
          } else {
            var list = portal.el('div', 'mp-list');
            waiting.forEach(function (item) {
              var meta = [item.status.label, item.project.name, portal.formatDue(item.task.dueDate)].filter(Boolean).join(' · ');
              list.appendChild(portal.row(item.task.name, meta, item.status.hexColor, function () { portal.tasks.open(item); }));
            });
            card.appendChild(list);
          }
          // One board link per project; name the project only when there is more than one.
          var several = boards.length > 1;
          boards.forEach(function (p) {
            var text = several ? BOARD_LINK + ' (' + p.name + ')' : BOARD_LINK;
            card.appendChild(portal.footer(text, function () { portal.go('/projects/' + p.id + '?v=tasks'); }));
          });
          return card;
        });
      }
    });
  });
})();
