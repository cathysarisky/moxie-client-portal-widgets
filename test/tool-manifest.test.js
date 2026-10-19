'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBundle } = require('../tool/lib/bundle.js');
const manifest = require('../tool/manifest.js');

const bundle = buildBundle();

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
