(function () {
  'use strict';
  var bundle = window.MoxiePortalToolBundle;
  var manifest = window.MoxiePortalToolManifest;
  var gen = window.MoxiePortalToolGenerate;
  // Placeholder: Task 5 replaces this with the real form and its own emptyConfig.
  var emptyConfig = {
    moxiePortalTool: 1,
    parent: gen.fillDefaults({}, manifest.parent.settings, bundle.parent.defaults),
    snippets: []
  };
  document.getElementById('mp-output').value = gen.generate(emptyConfig, bundle, manifest);
}());
