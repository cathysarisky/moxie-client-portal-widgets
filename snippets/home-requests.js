/* MoxiePortal snippet: "Requests" Home card.
 * Replaces the portal's own Requests card, which lists only the viewer's tickets, with
 * every open ticket for the client, newest activity first. Paste below the parent script. */
(function () {
  var TITLE = 'Requests';
  var EMPTY = 'No open requests.';
  var MAX_ROWS = 5;
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      name: 'requests',
      replaces: 'Tickets',
      render: function () {
        if (!portal.features().ticketsEnabled) return false;
        return Promise.all([portal.data.tickets(), portal.data.ticketSettings()]).then(function (res) {
          var tickets = res[0];
          var types = res[1];
          var card = portal.card({ title: TITLE, icon: portal.icons.ticket, count: tickets.length, openPath: '/requests' });
          if (!tickets.length) {
            card.appendChild(portal.empty(EMPTY));
            return card;
          }
          var list = portal.el('div', 'mp-list');
          tickets.slice(0, MAX_ROWS).forEach(function (t) {
            var updated = Date.parse(t.updated);
            var meta = ['#' + t.ticketNumber, t.status, t.unreadClient ? 'New reply' : null, updated ? 'updated ' + portal.timeAgo(updated) : null]
              .filter(Boolean).join(' · ');
            list.appendChild(portal.row(t.subject, meta, portal.tickets.statusColor(t, types), function () { portal.go('/requests/' + t.id); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  }, { onlyFor: ONLY_FOR });
})();
