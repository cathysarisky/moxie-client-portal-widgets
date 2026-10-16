/* MoxiePortal snippet: "Recently updated" Home card.
 * Shows the newest comment or change made by someone other than the viewer on each task,
 * within the last DAYS days. Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Recently updated';
  var DAYS = 14;
  var EMPTY = 'No updates in the last ' + DAYS + ' days.';
  var MAX_ROWS = 5;
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    // Let the longer "who did what" line wrap to two lines.
    portal.style('#mp-recent .action-row-copy small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal; }');

    // Activity names look like "Fake  Cathy" or "someone@example.com null".
    function tidyName(s) { return String(s || '').replace(/\s+/g, ' ').replace(/ null$/, '').trim(); }

    // Comment bodies can be HTML; DOMParser documents never run scripts or load images.
    function plainText(html) {
      var text = new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }

    function truncate(s, max) { return s.length > max ? s.slice(0, max - 1).replace(/\s+$/, '') + '…' : s; }

    // Newest comment or change on a task made by someone other than the viewer.
    function latestActivity(task, me) {
      var cutoff = Date.now() - DAYS * 864e5;
      var myNames = [tidyName((me.firstName || '') + ' ' + (me.lastName || '')), tidyName(me.email)].map(portal.norm);
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
        if (myNames.indexOf(portal.norm(who)) !== -1) return;
        var what = (e.events || []).map(function (text) {
          text = tidyName(text);
          if (text.indexOf(who + ' ') === 0) text = text.slice(who.length + 1);
          return text.charAt(0).toLowerCase() + text.slice(1);
        }).join(', ');
        consider(e.timestamp, who, what);
      });
      return best;
    }

    portal.home.mount({
      name: 'recent',
      render: function () {
        if (!portal.features().projectsEnabled) return false;
        return portal.data.tasks().then(function (items) {
          var me = portal.user();
          var recent = [];
          items.forEach(function (item) {
            var activity = latestActivity(item.task, me);
            if (activity) recent.push({ item: item, activity: activity });
          });
          recent.sort(function (a, b) { return b.activity.time - a.activity.time; });

          var card = portal.card({ title: TITLE, icon: portal.icons.history, count: recent.length });
          if (!recent.length) {
            card.appendChild(portal.empty(EMPTY));
            return card;
          }
          var list = portal.el('div', 'mp-list');
          recent.slice(0, MAX_ROWS).forEach(function (r) {
            var a = r.activity;
            var meta = a.who + ' ' + a.what + ' · ' + portal.timeAgo(a.time);
            list.appendChild(portal.row(r.item.task.name, meta, null, function () { portal.tasks.open(r.item); }));
          });
          card.appendChild(list);
          return card;
        });
      }
    });
  }, { onlyFor: ONLY_FOR });
})();
