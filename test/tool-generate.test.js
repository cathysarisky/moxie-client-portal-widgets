'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, tick } = require('./helpers');
const { buildBundle } = require('../tool/lib/bundle');
const { parseSource } = require('../tool/lib/extract');
const manifest = require('../tool/manifest');
const gen = require('../tool/src/generate');

const bundle = buildBundle();

const TWO_CSS = {
  moxiePortalTool: 1,
  parent: { CLIENT_FILTER: null },
  snippets: [
    { id: 'custom-css', settings: { ONLY_FOR: { ClientType: 'TNC' }, CSS: ['#app { --v-sidebar-base: #1B5E20 !important; }'] } },
    { id: 'custom-css', settings: { ONLY_FOR: { ClientType: 'Agency' }, CSS: ['#app { --v-sidebar-base: #0D47A1 !important; }'] } }
  ]
};

const styleText = (document) => Array.from(document.querySelectorAll('style')).map((s) => s.textContent).join('\n');

test('the paste parses, has one comment, and round-trips', () => {
  const out = gen.generate(TWO_CSS, bundle, manifest);
  assert.equal(parseSource(out).comments.length, 1);
  assert.deepEqual(gen.parseSettingsLine(out), TWO_CSS);
  assert.ok(out.startsWith(gen.SETTINGS_PREFIX));
  const green = out.indexOf('var CSS = ["#app { --v-sidebar-base: #1B5E20 !important; }"];');
  const blue = out.indexOf('var CSS = ["#app { --v-sidebar-base: #0D47A1 !important; }"];');
  const filter = out.indexOf('var CLIENT_FILTER = null;');
  assert.ok(filter > 0 && green > filter && blue > green);
});

test('hostile text survives', () => {
  const title = 'It\'s "done" */ line\nnext end \u2028 and \u2029';
  const config = { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'home-waiting', settings: { TITLE: title } }] };
  const out = gen.generate(config, bundle, manifest);
  assert.equal(parseSource(out).comments.length, 1);
  assert.equal(gen.parseSettingsLine(out).snippets[0].settings.TITLE, title);
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'));
});

test('missing settings get defaults, formDefault first', () => {
  const config = { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'schedule-groups', settings: {} }, { id: 'home-recent', settings: {} }] };
  const out = gen.generate(config, bundle, manifest);
  assert.ok(out.includes('Asynchronous work on your site'));
  assert.ok(!out.includes('reserve on my schedule'));
  assert.ok(out.includes('var DAYS = 14;'));
  assert.ok(out.includes('"No updates in the last 14 days."'));
  assert.ok(out.includes('var HOME_CARDS = [["waiting","recent"],["requests","projects"]];'));
});

test('the generated paste runs in the portal harness', async () => {
  const source = gen.generate(TWO_CSS, bundle, manifest);
  const tnc = boot({ source, customValues: [{ mappingKey: 'ClientType', value: 'TNC' }] });
  await tick();
  assert.ok(styleText(tnc.document).includes('#1B5E20'));
  assert.ok(!styleText(tnc.document).includes('#0D47A1'));
  const agency = boot({ source, customValues: [{ mappingKey: 'ClientType', value: 'Agency' }] });
  await tick();
  assert.ok(styleText(agency.document).includes('#0D47A1'));
  assert.ok(!styleText(agency.document).includes('#1B5E20'));
});

test('normalizeConfig drops unknowns and reports them', () => {
  const raw = {
    moxiePortalTool: 1,
    parent: { CLIENT_FILTER: null, BOGUS: 1 },
    snippets: [{ id: 'nope', settings: {} }, { id: 'custom-css', settings: { CSS: [], FOO: 1 } }]
  };
  const { config, dropped } = gen.normalizeConfig(raw, manifest);
  assert.deepEqual(dropped, ['parent: BOGUS', 'snippet: nope', 'custom-css: FOO']);
  assert.equal(config.snippets.length, 1);
  assert.deepEqual(config.snippets[0].settings, { CSS: [] });
  assert.equal(raw.parent.BOGUS, 1);
});

test('normalizeConfig rejects non-configs and newer versions', () => {
  [[], null, { a: 1 }].forEach((raw) => {
    assert.throws(() => gen.normalizeConfig(raw, manifest), { code: 'NOT_CONFIG' });
  });
  assert.throws(() => gen.normalizeConfig({ moxiePortalTool: 2 }, manifest), { code: 'NEWER_VERSION' });
});

test('parseSettingsLine tolerates wrapping and rejects other text', () => {
  const parsed = gen.parseSettingsLine('  /* MoxiePortal settings: {"moxiePortalTool":1,\n"parent":{}} */\nrest');
  assert.deepEqual(parsed, { moxiePortalTool: 1, parent: {} });
  assert.throws(() => gen.parseSettingsLine('(function(){})();'), { code: 'NOT_TOOL_PASTE' });
  assert.throws(() => gen.parseSettingsLine('/* MoxiePortal settings: {oops */'), { code: 'BAD_JSON' });
});

test('generate rejects an unknown snippet id', () => {
  const config = { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'nope', settings: {} }] };
  assert.throws(() => gen.generate(config, bundle, manifest), /nope/);
});

test('home card layout conversions', () => {
  const enabled = ['waiting', 'recent', 'requests', 'billing'];
  const layout = gen.homeCardsToLayout([['waiting', 'recent'], 'requests'], enabled);
  assert.deepEqual(layout, [
    { card: 'waiting', newRow: true }, { card: 'recent', newRow: false },
    { card: 'requests', newRow: true }, { card: 'billing', newRow: true }
  ]);
  assert.equal(gen.homeCardsToLayout([['waiting', 'waiting']], ['waiting']).length, 1);
  assert.deepEqual(gen.layoutToHomeCards(layout), [['waiting', 'recent'], ['requests'], ['billing']]);
});

test('bodyMatches ignores whitespace and the settings line', () => {
  const out = gen.generate(TWO_CSS, bundle, manifest);
  const other = gen.settingsLine({ moxiePortalTool: 1, parent: {}, snippets: [] }) + '\n\n' + out.slice(out.indexOf('\n') + 1).replace(/\n/g, '\n\n');
  assert.ok(gen.bodyMatches(other, out));
  assert.ok(!gen.bodyMatches(out + '\n(function(){ alert(1); })();', out));
});
