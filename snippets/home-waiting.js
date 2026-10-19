/* MoxiePortal snippet: "Waiting on you" Home card.
 * Lists tasks whose status is one of the parent's WAITING_STATUSES and open tickets whose
 * status is one of its TICKET_WAITING_STATUSES, with a link to each project's task board.
 * Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Waiting on you';
  var EMPTY = 'Nothing is waiting on you right now.';
  var BOARD_LINK = 'View whole task board';
  var TICKET_PREFIX = 'Request #';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;
  // Skip clients whose custom fields match, e.g. { ClientType: 'Retainer' }. null skips nobody.
  var NOT_FOR = null;

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      name: 'waiting',
      render: function () {
        var features = portal.features();
        if (!features.projectsEnabled && !features.ticketsEnabled) return false;
        return Promise.all([
          features.projectsEnabled ? portal.data.waitingTasks() : [],
          features.projectsEnabled ? portal.data.projects() : [],
          portal.data.waitingTickets(), // resolves [] when tickets are off
          portal.data.ticketSettings() // resolves [] when tickets are off
        ]).then(function (res) {
          var waiting = res[0];
          var boards = res[1].filter(portal.tasks.visible);
          var tickets = res[2];
          var types = res[3];
          boards.sort(function (a, b) { return a.name.localeCompare(b.name); });

          var total = waiting.length + tickets.length;
          var card = portal.card({ title: TITLE, icon: portal.icons.tasks, count: total });
          if (!total) {
            card.appendChild(portal.empty(EMPTY));
          } else {
            var list = portal.el('div', 'mp-list');
            // Tickets first (newest activity first), then tasks (soonest due first).
            tickets.forEach(function (t) {
              var meta = TICKET_PREFIX + t.ticketNumber + ' · ' + t.status;
              list.appendChild(portal.row(t.subject, meta, portal.tickets.statusColor(t, types), function () { portal.go('/requests/' + t.id); }));
            });
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
  }, { onlyFor: ONLY_FOR, notFor: NOT_FOR });
})();
