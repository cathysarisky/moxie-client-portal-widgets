(function () {
  var CLIENT_TYPE = 'TEST';
  var SIDEBAR_GREEN = '#1B5E20';
  var ACTIVE_STRIPE = '#A5D6A7';

  if (document.getElementById('swc-portal-overrides')) return;

  // Rules apply only while <html data-swc-styled> is set, i.e. for matching clients.
  var on = 'html[data-swc-styled] ';
  var css = [
    on + '.brand-logo { display: none !important; }',
    on + '#left-nav { background-color: ' + SIDEBAR_GREEN + ' !important; }',
    on + '#left-nav .portal-nav-link.is-active::before { border-left-color: ' + ACTIVE_STRIPE + ' !important; }',
    '@media (min-width: 600px) {',
    '  ' + on + '.brand-zone { background: ' + SIDEBAR_GREEN + ' !important; }',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'swc-portal-overrides';
  style.textContent = css;
  document.head.appendChild(style);

  function norm(s) { return String(s || '').trim().toLowerCase(); }

  (function waitForApp(tries) {
    var app = document.querySelector('#app');
    var store = app && app.__vue__ && app.__vue__.$store;
    if (!store) {
      if (tries < 100) setTimeout(function () { waitForApp(tries + 1); }, 100);
      return;
    }
    function clientType() {
      var ctx = store.state.clientPortalContext;
      var values = (ctx && ctx.client && ctx.client.customValues) || [];
      for (var i = 0; i < values.length; i++) if (values[i].mappingKey === 'ClientType') return values[i].value;
      return null;
    }
    function apply() {
      if (norm(clientType()) === norm(CLIENT_TYPE)) document.documentElement.setAttribute('data-swc-styled', '');
      else document.documentElement.removeAttribute('data-swc-styled');
    }
    store.watch(clientType, apply);
    apply();
  })(0);
})();
