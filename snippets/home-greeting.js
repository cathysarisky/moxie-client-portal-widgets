/* MoxiePortal snippet: "Where things stand" greeting band on Home.
 * A full-width band at the top of Home, in the left menu's colour. Left: "Hi {first name},
 * here's where things stand.", a sentence counting what is waiting on the client ("3 items
 * need something from you: 2 to approve and 1 request reply."), two buttons and a status
 * line. Right: a "Next up" panel with the next booked meeting (or the soonest-due waiting
 * task when nothing is booked) and one progress bar per active project: retainer hours used
 * this month for retainer projects, otherwise time until the due date, otherwise tasks done.
 * Put 'greeting' first in the parent's HOME_CARDS so the band opens the page.
 * Paste below the MoxiePortal parent script. */
(function () {
  var HEADLINE = 'Hi {name}, here\'s where things stand.';
  var EMPTY_HEADLINE = 'Hi {name}, nothing needs you right now.';
  var EMPTY_TEXT = 'Nothing is waiting on you. When something does, it shows up here first.';
  var PRIMARY = 'See what\'s waiting';   // scrolls to the Waiting on you card
  var PRIMARY_EMPTY = 'See your projects';
  var SECONDARY = 'Book a call';
  // Where the secondary button and the "pick a time" link go.
  var SCHEDULE_PATH = '/meetings/schedulers';
  var PANEL_TITLE = 'Next up';
  var NO_CALL = 'No call booked';
  var PICK_TIME = 'pick a time';
  // How each waiting task status reads in the sentence: "2 to approve, 1 to send".
  // Keys are status labels from the parent's WAITING_STATUSES (case is ignored).
  var VERBS = { 'Ready for approval': 'to approve', 'Wait on client': 'to send' };
  var VERB_DEFAULT = 'to look at';
  var TICKET_NOUN = ['request reply', 'request replies'];
  // Client custom-field mapping key holding a monthly retainer cap in hours. Clients without
  // a value get no hours bar.
  var RETAINER_FIELD = 'RetainerHours';
  // Project type names whose projects show the hours bar (when the client has a cap).
  var RETAINER_TYPES = [];
  // Hide the portal's own Home heading and welcome banner, so the band opens the page.
  var HIDE_HEADING = false;
  var HIDE_WELCOME = false;
  // Colours. The defaults follow the portal's menu colour and accent.
  var BAND_BACKGROUND = 'var(--v-sidebar-base, #263238)';
  var BAND_TEXT = '#ffffff';
  var ACCENT = 'var(--brand-accent, #ffd5ff)';
  var ACCENT_TEXT = '#1d1d1f';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  var CSS = [
    '#mp-greeting { --mp-g-bg: ' + BAND_BACKGROUND + '; --mp-g-text: ' + BAND_TEXT + '; --mp-g-accent: ' + ACCENT + '; --mp-g-accent-text: ' + ACCENT_TEXT + '; }',
    // The parent lays every card out as a column; this one has its own layout, so the overrides are !important.
    '#mp-home #mp-greeting { display: flex !important; flex-direction: column !important; gap: 22px; box-sizing: border-box; padding: 32px 36px; border: 0 !important; border-radius: 18px !important; background: var(--mp-g-bg) !important; color: var(--mp-g-text); box-shadow: none !important; text-align: left; }',
    '#mp-greeting .mp-g-row { display: flex; flex-wrap: wrap; align-items: stretch; justify-content: space-between; gap: 28px; }',
    '#mp-greeting .mp-g-left { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 28px; padding-right: 8px; }',
    '#mp-greeting .mp-g-top { display: flex; flex-direction: column; gap: 12px; }',
    '#mp-greeting .mp-g-eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }',
    '#mp-greeting h2 { margin: 10px 0 0; font-size: 26px; font-weight: 700; line-height: 1.25; letter-spacing: -0.015em; color: var(--mp-g-text); max-width: 560px; }',
    '#mp-greeting .mp-g-text { margin: 0; font-size: 16px; line-height: 1.65; opacity: .85; max-width: 520px; }',
    '#mp-greeting .mp-g-buttons { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }',
    '#mp-greeting .mp-g-btn { display: inline-flex; align-items: center; padding: 11px 22px; border: 1.5px solid var(--mp-g-accent); border-radius: var(--brand-button-radius, 8px); background: var(--mp-g-accent); color: var(--mp-g-accent-text); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }',
    '#mp-greeting .mp-g-btn:hover { filter: brightness(.95); }',
    '#mp-greeting .mp-g-btn.is-ghost { background: transparent; color: var(--mp-g-text); }',
    '#mp-greeting .mp-g-btn.is-ghost:hover { background: rgba(255,255,255,.1); filter: none; }',
    '#mp-greeting .mp-g-status { padding-top: 16px; border-top: 1px solid rgba(255,255,255,.2); font-size: 14px; opacity: .7; }',
    // The frosted panel.
    '#mp-greeting .mp-g-panel { flex: 1 1 320px; max-width: 440px; min-width: 0; box-sizing: border-box; padding: 18px 22px 10px; border-radius: 14px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); box-shadow: inset 0 1px 0 rgba(255,255,255,.14); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); display: flex; flex-direction: column; gap: 6px; }',
    '#mp-greeting .mp-g-next { display: flex; flex-direction: column; gap: 4px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,.14); }',
    '#mp-greeting .mp-g-next strong { font-size: 16px; font-weight: 700; }',
    '#mp-greeting .mp-g-next span { font-size: 14px; opacity: .75; }',
    '#mp-greeting .mp-g-next small { font-size: 13px; opacity: .75; margin-top: 2px; }',
    '#mp-greeting .mp-g-next button { color: var(--mp-g-accent); background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }',
    '#mp-greeting .mp-g-bar { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 4px; }',
    '#mp-greeting .mp-g-bar-head { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }',
    '#mp-greeting .mp-g-bar-head span { opacity: .75; }',
    '#mp-greeting .mp-g-bar-head b { font-weight: 600; white-space: nowrap; }',
    '#mp-greeting .mp-g-track { height: 6px; border-radius: 9999px; background: rgba(255,255,255,.14); overflow: hidden; }',
    '#mp-greeting .mp-g-fill { height: 100%; border-radius: 9999px; background: var(--mp-g-accent); }',
    '#mp-greeting .mp-g-bar small { font-size: 13px; opacity: .65; }',
    '@media (max-width: 599px) { #mp-home #mp-greeting { padding: 24px 20px; } #mp-greeting .mp-g-panel { max-width: none; } }'
  ].join('\n');

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // "4 items need something from you: 2 to approve, 1 to send and 1 request reply."
  function sentence(portal, waiting, tickets) {
    var byVerb = {};
    var order = [];
    waiting.forEach(function (item) {
      var label = portal.norm(item.status.label);
      var verb = VERB_DEFAULT;
      Object.keys(VERBS).forEach(function (k) { if (portal.norm(k) === label) verb = VERBS[k]; });
      if (!byVerb[verb]) { byVerb[verb] = 0; order.push(verb); }
      byVerb[verb]++;
    });
    var parts = order.map(function (verb) { return byVerb[verb] + ' ' + verb; });
    if (tickets.length) parts.push(plural(tickets.length, TICKET_NOUN[0], TICKET_NOUN[1]));
    var total = waiting.length + tickets.length;
    var list = parts.length > 1 ? parts.slice(0, -1).join(', ') + (parts.length > 2 ? ',' : '') + ' and ' + parts[parts.length - 1] : parts[0];
    return plural(total, 'item needs', 'items need') + ' something from you: ' + list + '.';
  }

  // A date is its calendar day: "2026-10-31" and "2026-10-31T00:00:00.000Z" both mean Oct 31
  // (the same prefix match as the parent's formatDue; parsing the latter as UTC would put it on
  // Oct 30 west of Greenwich). No value is no date (new Date(null) would be 1970, which reads
  // as long overdue).
  function toDate(value) {
    if (!value) return null;
    var m = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(value);
    return isNaN(d) ? null : d;
  }
  function fmtDate(portal, value, style) {
    var date = value instanceof Date ? value : toDate(value);
    if (!date) return null;
    var opts = style === 'time' ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' };
    return date.toLocaleString(portal.store.state.locale || undefined, opts);
  }

  // Next booked meeting. The endpoint shape is not documented, so this is defensive: any
  // array whose items carry a start time works; anything else falls back to the next task.
  function nextMeeting(portal) {
    return portal.api('/meetings').then(function (list) {
      if (!Array.isArray(list)) return null;
      var now = Date.now();
      var next = null;
      list.forEach(function (m) {
        var start = m.startTime || m.start || m.dateStart || m.scheduledStart;
        var t = start ? new Date(start).getTime() : NaN;
        if (isNaN(t) || t < now) return;
        if (!next || t < next.t) next = { t: t, name: m.name || m.title || m.meetingTypeName || 'Meeting' };
      });
      return next;
    }, function () { return null; });
  }

  // Hours logged this calendar month (billable or not), for the retainer bar.
  function hoursThisMonth(entries) {
    var start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    var secs = 0;
    (Array.isArray(entries) ? entries : []).forEach(function (e) {
      var when = new Date(e.timerStart || e.date || 0);
      if (when >= start) secs += Number(e.duration) || 0;
    });
    return Math.round(secs / 360) / 10;
  }

  function daysBetween(from, to) { return Math.round((to - from) / 86400000); }
  function mondayOf(date) {
    var monday = new Date(date);
    monday.setDate(date.getDate() - (date.getDay() + 6) % 7);
    return monday;
  }

  function isDone(item) { return !!(item.task.completed || (item.status && item.status.complete)); }

  function bar(portal, panel, name, value, pct, caption) {
    var block = portal.el('div', 'mp-g-bar');
    var head = portal.el('div', 'mp-g-bar-head');
    head.appendChild(portal.el('span', null, name));
    head.appendChild(portal.el('b', null, value));
    block.appendChild(head);
    var track = portal.el('div', 'mp-g-track');
    var fill = portal.el('div', 'mp-g-fill');
    fill.style.width = Math.max(0, Math.min(100, Math.round(pct))) + '%';
    track.appendChild(fill);
    block.appendChild(track);
    if (caption) block.appendChild(portal.el('small', null, caption));
    panel.appendChild(block);
  }

  MoxiePortal.ready(function (portal) {
    portal.style(CSS);
    if (HIDE_HEADING) portal.style('.welcome-page > header.welcome-heading { display: none !important; } .welcome-page #mp-home { margin-top: 8px; }');
    if (HIDE_WELCOME) {
      portal.style('.welcome-page section.welcome-message[data-mp-greeting-hidden] { display: none !important; }');
      portal.onDom(function () {
        document.querySelectorAll('.welcome-page section.welcome-message').forEach(function (sec) {
          if (!sec.hasAttribute('data-mp-greeting-hidden')) sec.setAttribute('data-mp-greeting-hidden', '');
        });
      });
    }
    portal.home.mount({
      name: 'greeting',
      render: function () {
        var f = portal.features();
        var cap = Number(portal.clientValues()[RETAINER_FIELD]);
        return Promise.all([
          f.projectsEnabled ? portal.data.waitingTasks() : [],
          portal.data.waitingTickets(), // resolves [] when tickets are off
          f.projectsEnabled ? portal.data.projects() : [],
          f.projectsEnabled ? portal.data.tasks() : [],
          f.projectsEnabled ? portal.data.projectTypes() : [],
          (f.timeEnabled && cap > 0 && RETAINER_TYPES.length) ? portal.api('/timer').then(null, function () { return []; }) : [],
          f.meetingsEnabled === false ? null : nextMeeting(portal)
        ]).then(function (res) {
          var waiting = res[0], tickets = res[1];
          var projects = res[2].filter(portal.tasks.visible);
          var allTasks = res[3];
          var typeName = {};
          res[4].forEach(function (t) { typeName[t.id] = t.name; });
          var meeting = res[6];
          var total = waiting.length + tickets.length;
          var name = (portal.user().firstName || '').trim() || 'there';
          var today = new Date(); today.setHours(0, 0, 0, 0);
          var overdue = waiting.filter(function (i) { var d = toDate(i.task.dueDate); return d && d < today; }).length;

          var band = portal.el('section');
          var row = portal.el('div', 'mp-g-row');

          // Left column
          var left = portal.el('div', 'mp-g-left');
          var top = portal.el('div', 'mp-g-top');
          top.appendChild(portal.el('p', 'mp-g-eyebrow', 'Week of ' + fmtDate(portal, mondayOf(today))));
          top.appendChild(portal.el('h2', null, (total ? HEADLINE : EMPTY_HEADLINE).replace('{name}', name)));
          top.appendChild(portal.el('p', 'mp-g-text', total ? sentence(portal, waiting, tickets) : EMPTY_TEXT));
          var buttons = portal.el('div', 'mp-g-buttons');
          var primary = portal.button('mp-g-btn', function () {
            var card = total && document.getElementById('mp-waiting');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else portal.go('/projects');
          });
          primary.textContent = total ? PRIMARY : PRIMARY_EMPTY;
          buttons.appendChild(primary);
          var ghost = portal.button('mp-g-btn is-ghost', function () { portal.go(SCHEDULE_PATH); });
          ghost.textContent = SECONDARY;
          buttons.appendChild(ghost);
          top.appendChild(buttons);
          left.appendChild(top);
          var status = [plural(projects.length, 'project active', 'projects active'), overdue ? plural(overdue, 'item overdue', 'items overdue') : 'nothing overdue', 'updated just now'].join(' · ');
          left.appendChild(portal.el('div', 'mp-g-status', status));
          row.appendChild(left);

          // Right: the frosted panel
          var panel = portal.el('div', 'mp-g-panel');
          panel.appendChild(portal.el('p', 'mp-g-eyebrow', PANEL_TITLE));
          var next = portal.el('div', 'mp-g-next');
          if (meeting) {
            next.appendChild(portal.el('strong', null, meeting.name));
            next.appendChild(portal.el('span', null, fmtDate(portal, new Date(meeting.t), 'time')));
          } else if (waiting.length) {
            var first = waiting[0];
            next.appendChild(portal.el('strong', null, first.task.name));
            next.appendChild(portal.el('span', null, [first.task.dueDate ? 'Due ' + fmtDate(portal, first.task.dueDate, 'day') : null, first.project.name].filter(Boolean).join(' · ')));
          } else {
            next.appendChild(portal.el('strong', null, 'Nothing waiting on you'));
          }
          if (!meeting) {
            var small = portal.el('small');
            small.appendChild(document.createTextNode(NO_CALL + ' · '));
            var pick = portal.button(null, function () { portal.go(SCHEDULE_PATH); });
            pick.textContent = PICK_TIME;
            small.appendChild(pick);
            next.appendChild(small);
          }
          panel.appendChild(next);

          // The cap is per client and the time entries are the client's, so retainer projects
          // share one hours bar.
          var retainerTypes = RETAINER_TYPES.map(portal.norm);
          var retainers = cap > 0 ? projects.filter(function (p) {
            return retainerTypes.indexOf(portal.norm(typeName[p.projectTypeId] || '')) !== -1;
          }) : [];
          if (retainers.length) {
            var used = hoursThisMonth(res[5]);
            var reset = new Date(today.getFullYear(), today.getMonth() + 1, 1);
            var label = retainers.length === 1 ? retainers[0].name + ' · retainer' : 'Retainer';
            bar(portal, panel, label, used + ' of ' + cap + ' h', used / cap * 100, 'Hours used this month · resets ' + fmtDate(portal, reset));
          }
          projects.forEach(function (p) {
            if (retainers.indexOf(p) !== -1) return;
            var mine = allTasks.filter(function (i) { return i.project.id === p.id; });
            var done = mine.filter(isDone).length;
            var tasksCaption = mine.length ? done + ' of ' + mine.length + ' tasks done' : null;
            var due = toDate(p.dueDate);
            if (due) {
              var start = toDate(p.startDate) || toDate(p.created) || today;
              var span = Math.max(1, daysBetween(start, due));
              var elapsed = daysBetween(start, today);
              var daysLeft = daysBetween(today, due);
              var value = daysLeft < 0 ? plural(-daysLeft, 'day over', 'days over') : daysLeft === 0 ? 'due today' : plural(daysLeft, 'day left', 'days left');
              var caption = [fmtDate(portal, start) + ' to ' + fmtDate(portal, due), tasksCaption].filter(Boolean).join(' · ');
              bar(portal, panel, p.name, value, elapsed / span * 100, caption);
            } else if (mine.length) {
              bar(portal, panel, p.name, done + ' of ' + mine.length + ' done', done / mine.length * 100, null);
            }
          });
          row.appendChild(panel);
          band.appendChild(row);
          return band;
        });
      }
    });
  }, { onlyFor: ONLY_FOR });
})();
