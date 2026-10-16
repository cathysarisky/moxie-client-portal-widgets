/* MoxiePortal snippet: sidebar restyle.
 * Recolours the left menu and, optionally, hides the workspace logo above it.
 * Paste below the MoxiePortal parent script. */
(function () {
  var SIDEBAR_COLOR = '#1B5E20';   // left menu background
  var ACTIVE_STRIPE = '#A5D6A7';   // marker beside the selected menu item
  var HIDE_LOGO = true;            // hide the logo above the menu

  MoxiePortal.ready(function (portal) {
    var css = [
      '#left-nav { background-color: ' + SIDEBAR_COLOR + ' !important; }',
      '#left-nav .portal-nav-link.is-active::before { border-left-color: ' + ACTIVE_STRIPE + ' !important; }',
      '@media (min-width: 600px) { .brand-zone { background: ' + SIDEBAR_COLOR + ' !important; } }'
    ];
    if (HIDE_LOGO) css.push('.brand-logo { display: none !important; }');
    portal.style(css.join('\n'));
  });
})();
