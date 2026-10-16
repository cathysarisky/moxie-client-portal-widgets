/* MoxiePortal snippet: logo.
 * Hides the workspace logo above the left menu, or shows a different image in its place.
 * The portal shows a separate small image while the menu is collapsed; that one can be
 * set too. Paste below the MoxiePortal parent script. */
(function () {
  // Logo while the menu is expanded: 'none' hides it, a URL such as
  // 'https://example.com/logo.png' shows that image instead, '' leaves the workspace logo alone.
  var LOGO_CHANGE = 'none';
  // Small logo while the menu is collapsed: null does the same as LOGO_CHANGE, 'none'
  // hides it, a URL shows that image, '' leaves the portal's own small image alone.
  var LOGO_COLLAPSED = null;
  // Optional size for the expanded logo, replacement or original. A plain number means
  // pixels; '80%' and other CSS sizes work too. '' keeps the portal's sizing.
  var LOGO_WIDTH = '';
  var LOGO_HEIGHT = '';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    var EXPANDED = '.brand-zone:not(.is-collapsed) .brand-logo';
    var COLLAPSED = '.brand-zone.is-collapsed .brand-logo';
    var collapsedChange = LOGO_COLLAPSED === null ? LOGO_CHANGE : LOGO_COLLAPSED;
    function isUrl(v) { return !!v && v !== 'none'; }

    var css = [];
    if (LOGO_CHANGE === 'none') css.push(EXPANDED + ' { display: none !important; }');
    if (collapsedChange === 'none') css.push(COLLAPSED + ' { display: none !important; }');

    // Sizing: stay inside the sidebar, and keep the image's proportions when only one side is given.
    function size(v) { return /^\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : v; }
    var width = size(LOGO_WIDTH), height = size(LOGO_HEIGHT);
    if (LOGO_CHANGE !== 'none' && (width || height)) {
      var rules = [];
      if (width) rules.push('width: ' + width + ' !important', 'max-width: 100% !important');
      if (height) rules.push('height: ' + height + ' !important', 'max-height: none !important');
      if (width && height) rules.push('object-fit: contain');
      else rules.push(width ? 'height: auto !important' : 'width: auto !important');
      css.push(EXPANDED + ' { ' + rules.join('; ') + '; }');
    }
    if (css.length) portal.style(css.join('\n'));

    if (!isUrl(LOGO_CHANGE) && !isUrl(collapsedChange)) return;

    // Swap the image for the current menu state, and keep it swapped when the portal
    // re-renders the sidebar or the menu is collapsed or expanded.
    var originals = {};
    function state() {
      var zone = document.querySelector('.brand-zone');
      return zone && zone.classList.contains('is-collapsed') ? 'collapsed' : 'expanded';
    }
    function swapLogo() {
      var logo = document.querySelector('img.brand-logo');
      if (!logo) return;
      var now = state();
      var want = now === 'collapsed' ? collapsedChange : LOGO_CHANGE;
      var src = logo.getAttribute('src') || '';
      if (src !== LOGO_CHANGE && src !== collapsedChange) originals[now] = src;   // the portal's own image
      if (isUrl(want) && src !== want) logo.setAttribute('src', want);
    }
    swapLogo();
    portal.onDom(swapLogo);

    return function () {
      var logo = document.querySelector('img.brand-logo');
      var original = originals[state()];
      if (logo && original) logo.setAttribute('src', original);
    };
  }, { onlyFor: ONLY_FOR });
})();
