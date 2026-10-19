'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBundle } = require('../tool/lib/bundle.js');
const manifest = require('../tool/manifest.js');

const SNIPPETS_DIR = path.join(__dirname, '..', 'snippets');

let bundle;
before(() => { bundle = buildBundle(); });

test('every manifest setting exists in its source and nothing is unlisted', () => {
  manifest.snippets.forEach((s) => {
    const defaults = bundle.snippets[s.id].defaults;
    s.settings.forEach((def) => {
      assert.ok(def.name in defaults, s.id + ' lacks ' + def.name);
    });
    assert.ok('ONLY_FOR' in defaults, s.id + ' lacks ONLY_FOR');
  });
});

test('formDefault overrides have the file\'s shape', () => {
  manifest.snippets.forEach((s) => {
    s.settings.filter((d) => 'formDefault' in d).forEach((d) => {
      const fileValue = bundle.snippets[s.id].defaults[d.name];
      assert.equal(Array.isArray(d.formDefault), Array.isArray(fileValue), s.id + ' ' + d.name);
      assert.equal(typeof d.formDefault, typeof fileValue, s.id + ' ' + d.name);
    });
  });
  const groups = manifest.snippets.find((s) => s.id === 'schedule-groups')
    .settings.find((d) => d.name === 'GROUPS');
  assert.equal(groups.formDefault.length, 2);
  assert.equal(groups.formDefault[0].starts, 'Developer time:');
  assert.notEqual(bundle.snippets['schedule-groups'].defaults.GROUPS[0].text, groups.formDefault[0].text);
});

test('defaultFrom recomputes from the other values', () => {
  const recent = manifest.snippets.find((s) => s.id === 'home-recent');
  const empty = recent.settings.find((d) => d.name === 'EMPTY');
  assert.equal(empty.defaultFrom({ DAYS: 7 }), 'No updates in the last 7 days.');
  const defaults = bundle.snippets['home-recent'].defaults;
  assert.equal(empty.defaultFrom(defaults), defaults.EMPTY);
});

test('icons come from the parent', () => {
  assert.deepEqual(bundle.icons, ['tasks', 'folder', 'ticket', 'history', 'listChecks', 'calendar', 'receipt']);
});

test('parent defaults match the file', () => {
  assert.deepEqual(bundle.parent.defaults.HOME_CARDS, [['waiting', 'recent'], ['requests', 'projects']]);
  assert.equal(bundle.parent.defaults.CLIENT_FILTER, null);
});

test('a bogus manifest entry is reported by name', () => {
  const bogus = {
    parent: manifest.parent,
    snippets: manifest.snippets.map((s) => (s.id === 'logo'
      ? Object.assign({}, s, { settings: s.settings.concat([{ name: 'NOPE', type: 'text', label: 'x' }]) })
      : s)),
    cardNames: manifest.cardNames
  };
  assert.throws(() => buildBundle(undefined, bogus), /logo\.js: missing NOPE/);
});

test('a manifest omitting a real setting is reported by name', () => {
  const short = {
    parent: manifest.parent,
    snippets: manifest.snippets.map((s) => (s.id === 'logo'
      ? Object.assign({}, s, { settings: s.settings.filter((d) => d.name !== 'LOGO_WIDTH') })
      : s)),
    cardNames: manifest.cardNames
  };
  assert.throws(() => buildBundle(undefined, short), /logo\.js: unlisted LOGO_WIDTH/);
});

test('snippet names are plain language, not file ids', () => {
  manifest.snippets.forEach((s) => {
    assert.notEqual(s.name, s.id);
    assert.ok(!/[a-z]-[a-z]/.test(s.name), s.name);
  });
});

// Values from the bundle come from another realm, so plain objects are told apart by tag, not prototype.
const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const FITS_TYPE = {
  text: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number',
  stringList: isStringArray,
  cssLines: isStringArray,
  size: (v) => typeof v === 'number' || typeof v === 'string',
  filter: (v) => v === null || isPlainObject(v),
  logo: (v) => typeof v === 'string' || v === null,
  renames: isPlainObject,
  groups: Array.isArray,
  homeCards: Array.isArray,
  boolean: (v) => typeof v === 'boolean',
  pair: (v) => isStringArray(v) && v.length === 2,
  stringMap: (v) => isPlainObject(v) && Object.keys(v).every((k) => typeof v[k] === 'string')
};

test('every file default fits its field type', () => {
  const all = [['parent', manifest.parent.settings, bundle.parent.defaults]]
    .concat(manifest.snippets.map((s) => [s.id, s.settings, bundle.snippets[s.id].defaults]));
  all.forEach(([id, defs, defaults]) => {
    defs.forEach((def) => {
      assert.ok(def.type in FITS_TYPE, id + ' ' + def.name + ': no check for type ' + def.type);
      assert.ok(FITS_TYPE[def.type](defaults[def.name]), id + ' ' + def.name + ' is not a ' + def.type
        + ': ' + JSON.stringify(defaults[def.name]));
    });
  });
});

test('every snippet file has a manifest entry', () => {
  const ids = manifest.snippets.map((s) => s.id);
  fs.readdirSync(SNIPPETS_DIR).filter((f) => f.endsWith('.js')).forEach((file) => {
    assert.ok(ids.includes(path.basename(file, '.js')), file + ' is not in the manifest');
  });
});

test('a snippet\'s card matches the name it mounts', () => {
  manifest.snippets.forEach((s) => {
    const source = fs.readFileSync(path.join(SNIPPETS_DIR, s.id + '.js'), 'utf8');
    const mount = /portal\.home\.mount\(\{[^}]*?\bname:\s*'([^']*)'/.exec(source);
    assert.equal(mount ? mount[1] : null, s.card, s.id + ' mounts ' + (mount && mount[1]) + ' but its card is ' + s.card);
    assert.equal(manifest.cardNames[s.id], s.card || undefined, s.id + ' in cardNames');
  });
  assert.deepEqual(Object.keys(manifest.cardNames).sort(),
    manifest.snippets.filter((s) => s.card).map((s) => s.id).sort());
});
