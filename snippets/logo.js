/* MoxiePortal snippet: logo.
 * Hides the workspace logo above the left menu, or shows a different image in its place.
 * Paste below the MoxiePortal parent script. */
(function () {
  // 'none' hides the logo, a URL such as 'https://example.com/logo.png' shows that image
  // instead, and '' leaves the workspace logo alone (useful with only a size change).
  var LOGO_CHANGE = 'none';
  // Optional logo size, applied to the replacement or to the original logo. A plain
  // number means pixels; '80%' and other CSS sizes work too. '' keeps the portal's sizing.
  var LOGO_WIDTH = '';
  var LOGO_HEIGHT = '';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    var css = [];
    if (LOGO_CHANGE === 'none') css.push('.brand-logo { display: none !important; }');

    // Sizing: stay inside the sidebar, and keep the image's proportions when only one side is given.
    function size(v) { return /^\d+(\.\d+)?$/.test(String(v)) ? v + 'px' : v; }
    var width = size(LOGO_WIDTH), height = size(LOGO_HEIGHT);
    if (LOGO_CHANGE !== 'none' && (width || height)) {
      var rules = [];
      if (width) rules.push('width: ' + width + ' !important', 'max-width: 100% !important');
      if (height) rules.push('height: ' + height + ' !important', 'max-height: none !important');
      if (width && height) rules.push('object-fit: contain');
      else rules.push(width ? 'height: auto !important' : 'width: auto !important');
      css.push('.brand-logo { ' + rules.join('; ') + '; }');
    }
    if (css.length) portal.style(css.join('\n'));

    if (!LOGO_CHANGE || LOGO_CHANGE === 'none') return;

    // Swap the logo image, and keep it swapped when the portal re-renders the sidebar.
    var originalSrc = null;
    var swapLogo = function () {
      var logo = document.querySelector('img.brand-logo');
      if (!logo) return;
      if (originalSrc === null) originalSrc = logo.getAttribute('src') || '';
      if (logo.getAttribute('src') !== LOGO_CHANGE) logo.setAttribute('src', LOGO_CHANGE);
    };
    swapLogo();
    portal.onDom(swapLogo);

    return function () {
      var logo = document.querySelector('img.brand-logo');
      if (logo && originalSrc) logo.setAttribute('src', originalSrc);
    };
  }, { onlyFor: ONLY_FOR });
})();
