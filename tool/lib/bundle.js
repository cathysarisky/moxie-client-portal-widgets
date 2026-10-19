'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseSource, topLevelDataVars, evaluateVars, extractFile } = require('./extract.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HIDDEN_ICONS = ['chevron', 'arrow'];

function names(settings) {
  return settings.map((s) => s.name);
}

function buildBundle(rootDir, manifest) {
  const root = rootDir || REPO_ROOT;
  const m = manifest || require('../manifest.js');
  const problems = [];

  function run(file, def) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const result = extractFile(source, { settings: names(def.settings), internal: def.internal });
    result.missing.forEach((n) => problems.push(path.basename(file) + ': missing ' + n));
    result.unlisted.forEach((n) => problems.push(path.basename(file) + ': unlisted ' + n));
    return { source, result };
  }

  const parentRun = run('core/moxie-portal.js', m.parent);
  const bundle = {
    format: 1,
    parent: { template: parentRun.result.template, defaults: parentRun.result.defaults },
    snippets: {},
    icons: []
  };
  m.snippets.forEach((s) => {
    const { result } = run('snippets/' + s.id + '.js', s);
    bundle.snippets[s.id] = { template: result.template, defaults: result.defaults };
  });
  if (problems.length) throw new Error(problems.join('\n'));

  const vars = topLevelDataVars(parseSource(parentRun.source).ast);
  const icons = evaluateVars(parentRun.source, vars).ICONS;
  bundle.icons = Object.keys(icons).filter((k) => !HIDDEN_ICONS.includes(k));
  return bundle;
}

module.exports = { buildBundle };
