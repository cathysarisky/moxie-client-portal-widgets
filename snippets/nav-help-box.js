/* MoxiePortal snippet: "Need help?" box in the left menu.
 * Adds a small frosted block under the menu links: a title, a line about response times, a
 * link to the help desk and, when the welcome-tour snippet is pasted too, a link that replays
 * the tour. Hidden while the menu is collapsed to icons.
 * Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Need help?';
  var TEXT = 'We reply within one business day. Something urgent? Open a request and mark it urgent.';
  var LINK = 'Open a request →';
  var LINK_PATH = '/requests';
  // Shown only when the welcome-tour snippet is pasted too (in any order); '' hides it.
  var TOUR_LINK = 'Replay the welcome tour';
  // Link colour. The default follows the menu's own text colour, so it works on light and
  // dark menus; set e.g. '#F4B4A8' for a coloured link.
  var LINK_COLOR = 'var(--portal-nav-text, currentColor)';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;
  // Skip clients whose custom fields match, e.g. { ClientType: 'Retainer' }. null skips nobody.
  var NOT_FOR = null;

  var CSS = [
    '.mp-help { box-sizing: border-box; margin: 8px 12px 12px; padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); box-shadow: inset 0 1px 0 rgba(255,255,255,.14); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--portal-nav-text, inherit); display: flex; flex-direction: column; gap: 8px; text-align: left; }',
    '.mp-help-title { font-size: 15px; font-weight: 700; }',
    '.mp-help-text { font-size: 13px; line-height: 1.5; color: var(--portal-nav-muted, inherit); }',
    '.mp-help-link { margin-top: 4px; padding: 0; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; color: ' + LINK_COLOR + '; text-align: left; cursor: pointer; }',
    '.mp-help-link:hover { text-decoration: underline; }',
    '.mp-help[data-collapsed] { display: none; }'
  ].join('\n');

  MoxiePortal.ready(function (portal) {
    // The link goes to the help desk by default; with tickets off there is nothing to open.
    if (LINK_PATH.indexOf('/requests') === 0 && !portal.features().ticketsEnabled) return;
    portal.style(CSS);
    var live = true;

    function build() {
      var box = portal.el('aside', 'mp-help');
      box.appendChild(portal.el('div', 'mp-help-title', TITLE));
      box.appendChild(portal.el('div', 'mp-help-text', TEXT));
      var link = portal.button('mp-help-link', function () { portal.go(LINK_PATH); });
      link.textContent = LINK;
      box.appendChild(link);
      return box;
    }

    // The tour link follows window.MoxiePortalTour, which welcome-tour sets up whether it is
    // pasted above or below this snippet.
    function syncTour(box) {
      var tour = box.querySelector('.mp-help-tour');
      var want = !!(TOUR_LINK && window.MoxiePortalTour);
      if (want && !tour) {
        tour = portal.button('mp-help-link mp-help-tour', function () { if (window.MoxiePortalTour) window.MoxiePortalTour.open(); });
        tour.textContent = TOUR_LINK;
        box.appendChild(tour);
      } else if (!want && tour) {
        tour.remove();
      }
    }

    function remove() { var b = document.querySelector('.mp-help'); if (b) b.remove(); }

    function sync() {
      var group = document.querySelector('#left-nav .rail-navigation .navigation-group');
      if (!live || !group) { remove(); return; }
      var box = document.querySelector('.mp-help') || build();
      if (group.nextElementSibling !== box) group.after(box);
      syncTour(box);
      // Follow the menu's collapsed (icon-only) mode. Attributes are only written when they
      // change, because DOM changes wake the parent's hook.
      var anyLink = group.querySelector('.portal-nav-link');
      var collapsed = !!(anyLink && anyLink.classList.contains('is-collapsed'));
      if (box.hasAttribute('data-collapsed') !== collapsed) {
        if (collapsed) box.setAttribute('data-collapsed', ''); else box.removeAttribute('data-collapsed');
      }
    }

    portal.onDom(sync);
    portal.onRoute(sync);
    sync();

    return function () { live = false; remove(); };
  }, { onlyFor: ONLY_FOR, notFor: NOT_FOR });
})();
