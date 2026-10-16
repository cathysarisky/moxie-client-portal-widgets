/* MoxiePortal snippet: custom CSS.
 * Adds your own style rules to the portal, for every client or only for the clients you
 * name. Paste below the MoxiePortal parent script. */
(function () {
  // One rule per line, each inside quotes and ending with a comma. Use double quotes
  // inside a rule, e.g. url("https://example.com/bg.png"). The lines below recolour the
  // left menu; replace them with your own.
  var CSS = [
    '#left-nav { background-color: #1B5E20 !important; }',
    '#left-nav .portal-nav-link.is-active::before { border-left-color: #A5D6A7 !important; }',
    '@media (min-width: 600px) { .brand-zone { background: #1B5E20 !important; } }'
  ];
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    portal.style(CSS.join('\n'));
  }, { onlyFor: ONLY_FOR });
})();
