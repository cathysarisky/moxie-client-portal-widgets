/* MoxiePortal snippet: "Requests" Home card.
 * Replaces the portal's own Requests card, which lists only the viewer's tickets, with
 * every open ticket for the client, newest activity first. Paste below the parent script. */
(function () {
  var TITLE = 'Requests';
  var EMPTY = 'No open requests.';
  var MAX_ROWS = 5;

  MoxiePortal.ready(function (portal) {
    // Same colour lookup the portal uses for ticket status dots.
    function statusColor(ticket, types) {
      var type = types.filter(function (x) { return String(x.id) === String(ticket.type); })[0];
      var match = type && (type.statusColors || []).filter(function (c) { return c && c.status === ticket.status; })[0];
      return match && /^#[0-9a-f]{3,8}$/i.test(match.hexColor) ? match.hexColor : 'var(--v-accent-base)';
    }

    portal.home.mount({
      id: 'mp-requests',
      slot: 'main',
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
            list.appendChild(portal.row(t.subject, meta, statusColor(t, types), function () { portal.go('/requests/' + t.id); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  });
})();
