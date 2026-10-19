'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openTool, STORAGE_KEY } = require('./tool-helpers.js');
const manifest = require('../tool/manifest.js');

function output(t) {
  return t.$('#mp-output').value;
}

function count(text, part) {
  return text.split(part).length - 1;
}

function type(t, input, value) {
  input.value = value;
  input.dispatchEvent(new t.window.Event('input', { bubbles: true }));
}

function stored(t) {
  return JSON.parse(t.window.localStorage.getItem(STORAGE_KEY));
}

async function twoCssCopies() {
  const t = await openTool();
  t.$('[data-mp-toggle="custom-css"]').click();
  t.$('[data-mp-add-copy="custom-css"]').click();
  const second = t.$$('[data-mp-snippet="custom-css"]')[1];
  type(t, second.querySelector('[data-mp-field="ONLY_FOR"] .mp-filter-key'), 'ClientType');
  type(t, second.querySelector('[data-mp-field="ONLY_FOR"] .mp-filter-value'), 'Agency');
  return t;
}

test('a fresh page generates the parent only', async () => {
  const t = await openTool();
  const out = output(t);
  assert.ok(out.startsWith('/* MoxiePortal settings:'));
  assert.ok(out.includes('var CLIENT_FILTER = null;'));
  assert.ok(!out.includes('MoxiePortal.ready('));
  assert.equal(t.$$('[data-mp-snippet]').length, 0);
  assert.deepEqual(t.errors, []);
});

test('turning a snippet on adds its block, with its defaults', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  assert.ok(output(t).includes('var TASKS_LABEL = "Tasks";'));
  assert.equal(t.$$('[data-mp-snippet="nav-tasks-link"]').length, 1);
  assert.deepEqual(t.errors, []);
});

test('each snippet card shows its name, description and README link', async () => {
  const t = await openTool();
  const toggle = t.$('[data-mp-toggle="nav-tasks-link"]');
  const card = toggle.closest('.mp-card');
  assert.match(card.querySelector('h3').textContent, /Tasks menu link/);
  assert.match(card.textContent, /opens the client's task board/);
  const link = card.querySelector('a');
  assert.equal(link.getAttribute('href'), 'https://github.com/cathysarisky/moxie-client-portal-widgets#nav-tasks-link');
  assert.equal(t.$$('[data-mp-toggle]').length, manifest.snippets.length);
});

test('labels use plain words, never setting names', async () => {
  const t = await openTool();
  manifest.snippets.forEach((s) => t.$('[data-mp-toggle="' + s.id + '"]').click());
  const names = [];
  manifest.parent.settings.concat(...manifest.snippets.map((s) => s.settings))
    .forEach((d) => names.push(d.name));
  const texts = t.$$('label, legend, .mp-label').map((n) => n.textContent);
  assert.ok(texts.length > 20);
  texts.forEach((text) => {
    names.forEach((name) => assert.ok(!text.includes(name), name + ' in label "' + text + '"'));
  });
  assert.equal(t.$('#mp-parent [data-mp-field="HOME_CARDS"]'), null);
  assert.deepEqual(t.errors, []);
});

test('editing a text field updates the output and storage', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  type(t, t.$('[data-mp-field="TASKS_LABEL"] input'), 'To do');
  assert.ok(output(t).includes('"To do"'));
  assert.equal(stored(t).snippets[0].settings.TASKS_LABEL, 'To do');
});

test('adding a copy adds a second block with its own filter', async () => {
  const t = await twoCssCopies();
  assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 2);
  const out = output(t);
  assert.equal(count(out, 'var CSS = '), 2);
  assert.equal(count(out, 'var ONLY_FOR = {"ClientType":"Agency"};'), 1);
  assert.equal(count(out, 'var ONLY_FOR = null;'), 1);
  t.$$('[data-mp-snippet="custom-css"] [data-mp-remove]').forEach((b) => assert.equal(b.hidden, false));
  assert.deepEqual(t.errors, []);
});

test('removing a copy', async () => {
  const t = await twoCssCopies();
  t.$$('[data-mp-snippet="custom-css"]')[1].querySelector('[data-mp-remove]').click();
  const sections = t.$$('[data-mp-snippet="custom-css"]');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].querySelector('[data-mp-remove]').hidden, true);
  const out = output(t);
  assert.equal(count(out, 'var CSS = '), 1);
  assert.ok(!out.includes('Agency'));
  assert.equal(stored(t).snippets.length, 1);
});

test('turning a snippet off asks first when it has more than one copy', async () => {
  const t = await twoCssCopies();
  const asked = [];
  t.window.confirm = (msg) => { asked.push(msg); return false; };
  t.$('[data-mp-toggle="custom-css"]').click();
  assert.equal(asked.length, 1);
  assert.equal(t.$('[data-mp-toggle="custom-css"]').checked, true);
  assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 2);
  t.window.confirm = (msg) => { asked.push(msg); return true; };
  t.$('[data-mp-toggle="custom-css"]').click();
  assert.equal(asked.length, 2);
  assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 0);
  assert.equal(count(output(t), 'var CSS = '), 0);
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  assert.equal(asked.length, 2);
  assert.equal(t.$$('[data-mp-snippet]').length, 0);
});

test('focus stays on the control the user just used', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="custom-css"]').click();
  assert.equal(t.document.activeElement, t.$('[data-mp-toggle="custom-css"]'));
  t.$('[data-mp-add-copy="custom-css"]').click();
  const second = t.$$('[data-mp-snippet="custom-css"]')[1];
  assert.equal(t.document.activeElement, second.querySelector('textarea'));
  second.querySelector('[data-mp-remove]').click();
  assert.equal(t.document.activeElement, t.$('[data-mp-add-copy="custom-css"]'));
});

test('stringList and filter shapes', async () => {
  const t = await openTool();
  type(t, t.$('[data-mp-field="WAITING_STATUSES"] textarea'), 'A\n\nB ');
  assert.ok(output(t).includes('var WAITING_STATUSES = ["A","B"];'));
  const filter = t.$('[data-mp-field="CLIENT_FILTER"]');
  type(t, filter.querySelector('.mp-filter-key'), 'Tier');
  type(t, filter.querySelector('.mp-filter-value'), 'A');
  assert.ok(output(t).includes('var CLIENT_FILTER = {"Tier":"A"};'));
  type(t, filter.querySelector('.mp-filter-key'), '');
  assert.ok(output(t).includes('var CLIENT_FILTER = null;'));
});

test('size emits numbers for integers and strings otherwise', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="logo"]').click();
  const input = t.$('[data-mp-field="LOGO_WIDTH"] input');
  type(t, input, '160');
  assert.ok(output(t).includes('var LOGO_WIDTH = 160;'));
  type(t, input, '80%');
  assert.ok(output(t).includes('var LOGO_WIDTH = "80%";'));
  type(t, input, '');
  assert.ok(output(t).includes('var LOGO_WIDTH = "";'));
});

test('a cleared number falls back to the default and is counted', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="home-projects"]').click();
  const field = t.$('[data-mp-field="MAX_ROWS"]');
  type(t, field.querySelector('input'), '3');
  assert.ok(output(t).includes('var MAX_ROWS = 3;'));
  assert.equal(t.$('#mp-problems').textContent, '');
  type(t, field.querySelector('input'), '');
  assert.ok(output(t).includes('var MAX_ROWS = 5;'));
  assert.match(t.$('#mp-problems').textContent, /1 /);
  assert.match(field.querySelector('.mp-problem').textContent, /whole number/);
});

test('defaultFrom follows its source until edited', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="home-recent"]').click();
  type(t, t.$('[data-mp-field="DAYS"] input'), '7');
  assert.ok(output(t).includes('"No updates in the last 7 days."'));
  assert.equal(t.$('[data-mp-field="EMPTY"] input').value, 'No updates in the last 7 days.');
  type(t, t.$('[data-mp-field="EMPTY"] input'), 'Quiet.');
  type(t, t.$('[data-mp-field="DAYS"] input'), '3');
  assert.ok(output(t).includes('"Quiet."'));
  assert.ok(!output(t).includes('last 3 days'));
});

test('a formDefault wins over the snippet file in a new copy', async () => {
  const t = await openTool();
  const toggle = () => t.$('[data-mp-toggle="schedule-groups"]').click();
  for (let round = 0; round < 2; round++) {
    toggle();
    const out = output(t);
    assert.ok(out.includes('Asynchronous work on your site'), 'round ' + round);
    assert.ok(out.includes('"starts":"Developer time:"'), 'round ' + round);
    assert.ok(!out.includes('reserve on my schedule'), 'round ' + round);
    toggle();
  }
  const groups = t.window.MoxiePortalToolManifest.snippets
    .find((s) => s.id === 'schedule-groups').settings.find((d) => d.name === 'GROUPS');
  assert.equal(groups.formDefault[0].starts, 'Developer time:');
});

// Any input event regenerates the output from state.config.
function refresh(t) {
  type(t, t.$('[data-mp-field="CLIENT_FILTER"] .mp-filter-key'), '');
}

// Uses settings with no value shape (HOME_CARDS, GROUPS, RENAMES): shaping a list already
// builds a new array, which would hide a missing clone.
test('settings never share objects with the built-in defaults', async () => {
  const fresh = await openTool();
  fresh.$('[data-mp-toggle="schedule-groups"]').click();
  fresh.window.MoxiePortalToolBundle.parent.defaults.HOME_CARDS.push(['shared-parent-default']);
  fresh.window.MoxiePortalToolManifest.snippets.find((s) => s.id === 'schedule-groups')
    .settings.find((d) => d.name === 'GROUPS').formDefault[0].starts = 'Shared form default';
  refresh(fresh);
  assert.ok(!output(fresh).includes('shared-parent-default'), 'emptyConfig');
  assert.ok(!output(fresh).includes('Shared form default'), 'newCopy');

  const loaded = await openTool({
    storage: { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'nav-rename', settings: {} }] }
  });
  loaded.window.MoxiePortalToolBundle.snippets['nav-rename'].defaults.RENAMES.Meetings.label = 'Shared label';
  loaded.window.MoxiePortalToolBundle.parent.defaults.HOME_CARDS.push(['shared-loaded-default']);
  refresh(loaded);
  assert.ok(!output(loaded).includes('Shared label'), 'fullConfig snippet');
  assert.ok(!output(loaded).includes('shared-loaded-default'), 'fullConfig parent');
});

test('stored settings of the wrong type still render', async () => {
  const t = await openTool({ storage: { moxiePortalTool: 1, parent: { WAITING_STATUSES: 'A' }, snippets: [] } });
  assert.equal(t.$$('[data-mp-toggle]').length, manifest.snippets.length);
  assert.ok(output(t).length > 0);
  assert.ok(output(t).includes('var WAITING_STATUSES = [];'));
  assert.equal(t.$('[data-mp-field="WAITING_STATUSES"] textarea').value, '');
  assert.deepEqual(t.errors, []);
});

test('every simple editor turns a wrong-typed value into its empty value', async () => {
  const t = await openTool({
    storage: {
      moxiePortalTool: 1,
      parent: { CLIENT_FILTER: ['x'], TICKET_WAITING_STATUSES: { a: 1 } },
      snippets: [
        { id: 'custom-css', settings: { CSS: 'body {}', ONLY_FOR: 'TNC' } },
        { id: 'home-projects', settings: { TITLE: { a: 1 }, MAX_ROWS: [3] } },
        { id: 'logo', settings: { LOGO_WIDTH: { w: 1 }, ONLY_FOR: { ClientType: { nested: 1 }, Tier: 'A' } } }
      ]
    }
  });
  assert.deepEqual(t.errors, []);
  const out = output(t);
  assert.ok(out.includes('var CLIENT_FILTER = null;'));
  assert.ok(out.includes('var TICKET_WAITING_STATUSES = [];'));
  assert.ok(out.includes('var CSS = [];'));
  assert.ok(out.includes('var TITLE = "";'));
  assert.ok(out.includes('var MAX_ROWS = 5;'));
  assert.ok(out.includes('var LOGO_WIDTH = "";'));
  assert.ok(out.includes('var ONLY_FOR = {"Tier":"A"};'));
  assert.equal(count(out, 'var ONLY_FOR = null;'), 2);
  assert.equal(t.$('[data-mp-field="MAX_ROWS"] input').value, '');
  assert.match(t.$('#mp-problems').textContent, /1 /);
});

test('a form that fails to render falls back to a blank one', async () => {
  const seed = { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'nav-tasks-link', settings: { TASKS_LABEL: 'Kept' } }] };
  const t = await openTool({
    storage: seed,
    beforeParse(w) {
      // The first textarea the app creates throws, as a broken editor would.
      const create = w.document.createElement;
      let failed = false;
      w.document.createElement = function (tag) {
        if (tag === 'textarea' && !failed) {
          failed = true;
          throw new Error('editor failed');
        }
        return create.apply(this, arguments);
      };
    }
  });
  assert.deepEqual(t.errors, []);
  assert.equal(t.$$('[data-mp-toggle]').length, manifest.snippets.length);
  assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, false);
  assert.ok(output(t).startsWith('/* MoxiePortal settings:'));
  assert.ok(!output(t).includes('Kept'));
  assert.deepEqual(stored(t), seed, 'the stored settings are not overwritten');
});

test('state survives a reload', async () => {
  const t = await openTool({
    storage: {
      moxiePortalTool: 1,
      parent: {},
      snippets: [{ id: 'nav-tasks-link', settings: { TASKS_LABEL: 'Later' } }]
    }
  });
  assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, true);
  assert.ok(output(t).includes('var TASKS_LABEL = "Later";'));
  assert.equal(t.$('[data-mp-field="TASKS_LABEL"] input').value, 'Later');
  assert.deepEqual(t.errors, []);
});

test('a browser that blocks storage still works', async () => {
  const t = await openTool({
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
    }
  });
  assert.deepEqual(t.errors, []);
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  assert.ok(output(t).includes('var TASKS_LABEL ='));
  assert.match(t.$('#mp-messages').textContent, /remember/);
  assert.equal(t.$$('#mp-messages p').length, 1);
  assert.deepEqual(t.errors, []);
});

test('a non-numeric number is reported inline and linked to its control', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="home-projects"]').click();
  const field = t.$('[data-mp-field="MAX_ROWS"]');
  const input = field.querySelector('input');
  type(t, input, 'abc');
  const problem = field.querySelector('.mp-problem');
  assert.match(problem.textContent, /whole number/);
  assert.match(t.$('#mp-problems').textContent, /1 /);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.ok(input.getAttribute('aria-describedby').split(' ').includes(problem.id));
  type(t, input, '3');
  assert.equal(field.querySelector('.mp-problem'), null);
  assert.equal(t.$('#mp-problems').textContent, '');
  assert.equal(input.hasAttribute('aria-invalid'), false);
  assert.ok(!(input.getAttribute('aria-describedby') || '').includes(problem.id));
});

test('settings from a newer tool are kept until the user changes something', async () => {
  const t = await openTool({ storage: { moxiePortalTool: 2 } });
  assert.deepEqual(t.errors, []);
  assert.match(t.$('#mp-messages').textContent, /newer version/);
  assert.deepEqual(stored(t), { moxiePortalTool: 2 });
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  assert.equal(stored(t).moxiePortalTool, 1);
});
