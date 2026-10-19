'use strict';
// Assembles tool/src into one self-contained page: tool/dist/index.html.
const fs = require('fs');
const path = require('path');
const { buildBundle } = require('./lib/bundle.js');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

function read(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8');
}

// Source for a script that is inlined verbatim. A literal closing tag would end the element early.
function inlineScript(name, text) {
  if (/<\/script/i.test(text)) throw new Error(name + ' contains a literal </script and cannot be inlined');
  return '<script>\n' + text.replace(/\s+$/, '') + '\n</script>';
}

function bundleScript(bundle) {
  const json = JSON.stringify(bundle)
    .replace(/<\//g, '<\\/')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
  return '<script>window.MoxiePortalToolBundle = ' + json + ';</script>';
}

function buildPage() {
  const bundle = buildBundle();
  const css = read('styles.css');
  if (/<\/style/i.test(css)) throw new Error('styles.css contains a literal </style');
  const pieces = {
    'styles.css': '<style>\n' + css.replace(/\s+$/, '') + '\n</style>',
    'bundle': bundleScript(bundle),
    'manifest.js': inlineScript('manifest.js', fs.readFileSync(path.join(__dirname, 'manifest.js'), 'utf8')),
    'generate.js': inlineScript('generate.js', read('generate.js')),
    'app.js': inlineScript('app.js', read('app.js'))
  };
  let html = read('index.html');
  Object.keys(pieces).forEach((key) => {
    const marker = '<!-- inline:' + key + ' -->';
    if (html.indexOf(marker) < 0) throw new Error('index.html is missing the marker ' + marker);
    html = html.split(marker).join(pieces[key]);
  });
  return { html: html, bundle: bundle };
}

module.exports = { buildPage };

if (require.main === module) {
  const { html } = buildPage();
  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, 'index.html');
  fs.writeFileSync(out, html);
  console.log('Wrote ' + out + ' (' + Buffer.byteLength(html) + ' bytes)');
}
