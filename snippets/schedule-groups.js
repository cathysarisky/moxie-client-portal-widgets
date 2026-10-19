/* MoxiePortal snippet: schedule groups.
 * Sorts the booking links on Meetings > Schedule now into groups by the start of their
 * names, for example "Developer time:" and "Meeting:", A to Z inside each group.
 * Paste below the MoxiePortal parent script. */
(function () {
  // The groups, in the order they should appear. `starts` is how the names of the links
  // in that group begin: a link whose name begins with it goes under that heading with
  // the start removed, so "Developer time: 1h" shows as "1h" under "Developer time".
  // `text` is an optional explanation shown under the heading. `onlyFor` optionally
  // limits the group to clients whose custom fields match, e.g. { ClientType: 'Retainer' },
  // in the same way as ONLY_FOR below, and `notFor` hides it from clients whose fields
  // match; a client who may not see a group sees neither the group nor its links.
  // `hide: true` hides the group and its links from everyone, which keeps a set of links
  // out of the portal without turning off "Show in portal" on each one in Moxie.
  // Matching ignores case; the heading is `starts` without its trailing ":" or "-".
  // A plain string such as 'Meeting:' is a group with no text and no filter.
  var GROUPS = [
    {
      starts: 'Developer time:',
      text: "Developer time is asynchronous time that you can reserve on my schedule for me to do your work. " +
        "When possible, choose a day when you'll be available for questions (via email) and to provide feedback, " +
        "but this work will be primarily asynchronous. If you'd like a kick-off call (included in this time), " +
        "just leave a note when booking."
    },
    {
      starts: 'Meeting:',
      text: "Meetings are synchronous calls (typically Google Meet, which will be attached when you book). " +
        "Use a meeting booking if you need to talk through something. They're not for writing code. " +
        "Meeting time is billed time, so please consider whether a straightforward request could be added " +
        "as a task or ticket instead."
    }
  ];
  // Heading for links that match none of GROUPS. They keep their full names and come
  // last. '' shows them last without a heading.
  var OTHER_LABEL = 'Other';
  // Booking links to hide from everyone, by their full names as shown in Moxie, for example
  // ['Developer time: 4 hours']. Matching ignores case and surrounding spaces. A hidden link
  // never shows, whether its name matches a group or not.
  var HIDE_LINKS = [];
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;
  // Skip clients whose custom fields match, e.g. { ClientType: 'Retainer' }. null skips nobody.
  var NOT_FOR = null;

  MoxiePortal.ready(function (portal) {
    var ID = 'mp-schedule-groups';
    var live = true;
    var lastKey = null;

    portal.style([
      '#' + ID + ' { display: flex; flex-direction: column; gap: 28px; }',
      '#' + ID + ' .mp-group-title { margin: 0 0 8px; font-size: 15px; font-weight: 650; color: var(--portal-text); text-align: left; }',
      '#' + ID + ' .mp-group-text { max-width: 720px; margin: 0 0 14px; font-size: 14px; line-height: 1.5; color: var(--portal-muted); text-align: left; }',
      '#' + ID + ' .mp-schedule-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 350px)); gap: 16px; }',
      '#' + ID + ' .mp-scheduler { display: flex; flex-direction: column; min-width: 250px; max-width: 350px; min-height: 190px; text-align: left; border: 1px solid var(--portal-border); border-radius: var(--portal-radius-md); background: var(--portal-surface); box-sizing: border-box; padding: 20px; }',
      '#' + ID + ' .mp-scheduler:hover { background-color: var(--v-gray_10-base); border-color: var(--v-primary-base); }',
      '#' + ID + ' .mp-scheduler-name { margin-bottom: 8px; font-weight: 500; }',
      '#' + ID + ' .mp-scheduler-duration { margin-bottom: 8px; font-size: 14px; text-transform: capitalize; }',
      '#' + ID + ' .mp-book { margin-top: auto; }',
      '#' + ID + ' .mp-empty { color: var(--portal-muted); text-align: left; }',
      '@media (max-width: 600px) { #' + ID + ' .mp-schedule-grid { grid-template-columns: 1fr; } #' + ID + ' .mp-scheduler { max-width: none; } }'
    ].join('\n'));

    // True when the client's custom fields satisfy a filter such as { ClientType: 'TNC' };
    // a missing filter matches everyone.
    function allowed(filter) {
      if (!filter) return true;
      var values = portal.clientValues();
      return Object.keys(filter).every(function (key) {
        return portal.norm(values[key]) === portal.norm(filter[key]);
      });
    }

    var groups = GROUPS.map(function (g) {
      var spec = g && typeof g === 'object' ? g : { starts: g };
      var prefix = String(spec.starts == null ? '' : spec.starts).trim();
      return {
        prefix: prefix, key: portal.norm(prefix),
        heading: prefix.replace(/[\s:\-\u2013]+$/, ''),
        text: spec.text ? String(spec.text).trim() : '',
        visible: spec.hide !== true && allowed(spec.onlyFor) && !(spec.notFor && allowed(spec.notFor))
      };
    }).filter(function (g) { return g.key; });

    var hiddenLinks = (Array.isArray(HIDE_LINKS) ? HIDE_LINKS : []).map(function (name) {
      return portal.norm(name);
    }).filter(Boolean);

    function onPage() { return portal.router.currentRoute.path === '/meetings/schedulers'; }

    // The portal's own list page: its Vue instance holds the links and the booking action.
    function findPage() {
      var page = document.querySelector('.scheduler-page');
      var grid = page && page.querySelector('.scheduler-grid');
      var vm = page && page.parentElement && page.parentElement.__vue__;
      if (!grid || !vm || !Array.isArray(vm.schedulers)) return null;
      return { page: page, grid: grid, vm: vm };
    }

    function text(vm, key, fallback) {
      try { var s = vm.$t && vm.$t(key); return s && s !== key ? s : fallback; } catch (e) { return fallback; }
    }

    // Sorts links into { heading, text, items: [{ scheduler, label }] } buckets, dropping the
    // links of groups this client may not see and the links in HIDE_LINKS; null when no link
    // matches any group and none is hidden, so the page is left as the portal made it.
    function arrange(schedulers) {
      var buckets = groups.map(function (g) { return { heading: g.heading, text: g.text, visible: g.visible, items: [] }; });
      var other = { heading: OTHER_LABEL, items: [] };
      var matched = 0;
      var hidden = 0;
      schedulers.forEach(function (s) {
        var name = String(s.name == null ? '' : s.name).trim();
        var lower = name.toLowerCase();
        if (hiddenLinks.indexOf(portal.norm(name)) >= 0) { hidden++; return; }
        for (var i = 0; i < groups.length; i++) {
          if (lower.indexOf(groups[i].key) === 0) {
            var rest = name.slice(groups[i].prefix.length).trim();
            buckets[i].items.push({ scheduler: s, label: rest || name });
            matched++;
            return;
          }
        }
        other.items.push({ scheduler: s, label: name });
      });
      if (!matched && !hidden) return null;
      var out = buckets.filter(function (b) { return b.visible && b.items.length; });
      if (other.items.length) out.push(other);
      out.forEach(function (b) {
        b.items.sort(function (a, c) { return a.label.localeCompare(c.label); });
      });
      return out;
    }

    function card(item, vm) {
      var s = item.scheduler;
      var node = portal.el('div', 'mp-scheduler');
      node.appendChild(portal.el('div', 'mp-scheduler-name', item.label));
      var len = s.meetingLength || {};
      var duration = text(vm, 'meetings.duration', 'Duration:') + ' ' + (len.duration != null ? len.duration : '') +
        ' ' + String(len.timeUnit || '').toLowerCase();
      node.appendChild(portal.el('div', 'mp-scheduler-duration', duration.replace(/\s+/g, ' ').trim()));
      var btn = portal.button('v-btn v-btn--has-bg theme--light v-size--large primary-action mp-book', function () {
        if (typeof vm.bookNow === 'function') vm.bookNow(s);
      });
      btn.appendChild(portal.el('span', 'v-btn__content', text(vm, 'meetings.schedule.book-now', 'Book now')));
      node.appendChild(btn);
      return node;
    }

    function build(arranged, vm) {
      var block = portal.el('div');
      block.id = ID;
      if (!arranged.length) {
        block.appendChild(portal.el('p', 'mp-empty', text(vm, 'meetings.no-schedulers', 'No meeting schedulers available')));
      }
      arranged.forEach(function (b) {
        var section = portal.el('section', 'mp-group');
        if (b.heading) section.appendChild(portal.el('h2', 'mp-group-title', b.heading));
        if (b.text) section.appendChild(portal.el('p', 'mp-group-text', b.text));
        var grid = portal.el('div', 'mp-schedule-grid');
        b.items.forEach(function (item) { grid.appendChild(card(item, vm)); });
        section.appendChild(grid);
        block.appendChild(section);
      });
      return block;
    }

    function remove() {
      var block = document.getElementById(ID);
      if (block) block.remove();
      var grid = document.querySelector('.scheduler-page .scheduler-grid');
      if (grid) grid.style.display = '';
      lastKey = null;
    }

    // Cheap and idempotent: rebuilds only when the page's list of links changes.
    function sync() {
      if (!live) return;
      var found = onPage() ? findPage() : null;
      if (!found) { lastKey = null; return; }
      var block = document.getElementById(ID);
      var key = found.vm.schedulers.map(function (s) { return s.id + '\u0001' + s.name; }).join('\u0002');
      if (block && block.parentNode === found.page && key === lastKey) return;
      var arranged = arrange(found.vm.schedulers);
      if (!arranged) {
        if (block) block.remove();
        found.grid.style.display = '';
      } else {
        var fresh = build(arranged, found.vm);
        if (block) block.parentNode.replaceChild(fresh, block); else found.grid.after(fresh);
        found.grid.style.display = 'none';
      }
      lastKey = key;
    }

    sync();
    portal.onDom(sync);
    portal.onRoute(sync);

    return function () {
      live = false;
      remove();
    };
  }, { onlyFor: ONLY_FOR, notFor: NOT_FOR });
})();
