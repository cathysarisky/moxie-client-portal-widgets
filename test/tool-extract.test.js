'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseSource, topLevelDataVars, evaluateVars, stripComments, extractFile
} = require('../tool/lib/extract.js');

const FIXTURE = `/* banner */
(function () {
  // which rows
  var TITLE = 'Hi'; // trailing
  var DAYS = 14;
  var EMPTY = 'No updates in the last ' + DAYS + ' days.';
  var LIST = [
    'a', // first
    'b'
  ];
  var INTERNAL = ['x'];
  var node = document.createElement('div');
  MoxiePortal.ready(function (portal) { var inner = 1; /* keep out */ });
})();
`;

test('stripComments removes every comment and collapses blanks', () => {
  const result = stripComments(FIXTURE);
  assert.ok(!result.includes('//'));
  assert.ok(!result.includes('/*'));
  assert.equal(parseSource(result).comments.length, 0);
  assert.ok(!/\n\n\n/.test(result));
});

test('topLevelDataVars finds data vars only', () => {
  const names = topLevelDataVars(parseSource(FIXTURE).ast).map((v) => v.name);
  assert.deepEqual(names, ['TITLE', 'DAYS', 'EMPTY', 'LIST', 'INTERNAL']);
});

test('evaluateVars resolves references between settings', () => {
  const vars = topLevelDataVars(parseSource(FIXTURE).ast);
  const values = evaluateVars(FIXTURE, vars);
  assert.equal(values.EMPTY, 'No updates in the last 14 days.');
  assert.deepEqual(values.LIST, ['a', 'b']);
});

test('extractFile makes slots and reports lists', () => {
  const r = extractFile(FIXTURE, {
    settings: ['TITLE', 'DAYS', 'EMPTY', 'LIST', 'MISSING'],
    internal: []
  });
  assert.ok(r.template.includes('var TITLE = {{TITLE}};'));
  assert.ok(r.template.includes('var LIST = {{LIST}};'));
  assert.ok(!r.template.includes('// first'));
  assert.deepEqual(r.missing, ['MISSING']);
  assert.deepEqual(r.unlisted, ['INTERNAL']);
  assert.equal(r.defaults.TITLE, 'Hi');
  assert.ok(!('INTERNAL' in r.defaults));
});

test('extractFile works on every real file', () => {
  const root = path.join(__dirname, '..');
  const cases = [{
    file: 'core/moxie-portal.js',
    settings: ['CLIENT_FILTER', 'WAITING_STATUSES', 'TICKET_WAITING_STATUSES', 'HOME_CARDS'],
    internal: ['ICONS']
  }];
  fs.readdirSync(path.join(root, 'snippets')).filter((f) => f.endsWith('.js')).forEach((f) => {
    cases.push({ file: 'snippets/' + f, settings: ['ONLY_FOR'], internal: [] });
  });
  cases.forEach((c) => {
    const source = fs.readFileSync(path.join(root, c.file), 'utf8');
    const r = extractFile(source, { settings: c.settings, internal: c.internal });
    assert.deepEqual(r.missing, [], c.file);
    parseSource(r.template.replace(/\{\{\w+\}\}/g, 'null'));
  });
});
