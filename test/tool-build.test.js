'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildPage } = require('../tool/build.js');
const { openTool } = require('./tool-helpers.js');

test('buildPage inlines everything', () => {
  const { html, bundle } = buildPage();
  assert.ok(html.includes('window.MoxiePortalToolBundle = '));
  assert.ok(!/<script[^>]*\ssrc=/.test(html));
  assert.ok(!html.includes('<link rel="stylesheet"'));
  assert.ok(!/<!-- inline:/.test(html));
  const marker = '<script>window.MoxiePortalToolBundle = ';
  const start = html.indexOf(marker) + marker.length;
  const end = html.indexOf(';</script>', start);
  const json = html.slice(start, end);
  assert.ok(!json.includes('</'));
  assert.deepEqual(JSON.parse(json.replace(/<\\\//g, '</')), bundle);
});

test('the page boots in jsdom without errors', async () => {
  const t = await openTool();
  assert.match(t.$('h1').textContent, /Moxie/);
  assert.ok(t.$('header a[href*="github.com"]'), 'the header links to the repository');
  assert.ok(t.$('footer').textContent.includes('Created by Cathy Sarisky (Spectral Web Services), with contributions from molli-beep and TaKenda'), 'credit line in the footer');
  assert.ok(t.$('#mp-output'));
  ['mp-settings-bar', 'mp-messages', 'mp-parent', 'mp-snippets', 'mp-home-layout',
    'mp-output-section', 'mp-problems', 'mp-load-json', 'mp-save-json', 'mp-paste-open',
    'mp-reset', 'mp-copy', 'mp-download-js'].forEach((id) => assert.ok(t.$('#' + id), id));
  assert.ok(t.$('#mp-output').value.length > 0);
  assert.deepEqual(t.errors, []);
});

test('the built file passes the syntax check', () => {
  execFileSync('node', [path.join(__dirname, '..', 'tool', 'build.js')], { stdio: 'pipe' });
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'tool', 'dist', 'index.html')));
});
