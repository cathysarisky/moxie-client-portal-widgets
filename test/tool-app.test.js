'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openTool, STORAGE_KEY } = require('./tool-helpers.js');
const manifest = require('../tool/manifest.js');
const gen = require('../tool/src/generate.js');
const { buildBundle } = require('../tool/lib/bundle');

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

// Uses values that reach the form state unshaped (the blank form's WAITING_STATUSES, a new
// copy's GROUPS): shaping builds a new value, and the Home layout rebuilds HOME_CARDS, either
// of which would hide a missing clone. Loaded settings are all shaped; that half guards
// against a shape that hands its input back.
test('settings never share objects with the built-in defaults', async () => {
  const fresh = await openTool();
  fresh.$('[data-mp-toggle="schedule-groups"]').click();
  fresh.window.MoxiePortalToolBundle.parent.defaults.WAITING_STATUSES.push('shared-parent-default');
  fresh.window.MoxiePortalToolManifest.snippets.find((s) => s.id === 'schedule-groups')
    .settings.find((d) => d.name === 'GROUPS').formDefault[0].starts = 'Shared form default';
  refresh(fresh);
  assert.ok(!output(fresh).includes('shared-parent-default'), 'emptyConfig');
  assert.ok(!output(fresh).includes('Shared form default'), 'newCopy');

  const loaded = await openTool({
    storage: { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'nav-rename', settings: {} }] }
  });
  loaded.window.MoxiePortalToolBundle.snippets['nav-rename'].defaults.RENAMES.Meetings.label = 'Shared label';
  loaded.window.MoxiePortalToolBundle.parent.defaults.WAITING_STATUSES.push('shared-loaded-default');
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

// Records the page's console.error calls instead of printing them.
function recordConsoleErrors(logged) {
  return (w) => { w.console.error = (...args) => { logged.push(args); }; };
}

test('a form that fails to render falls back to a blank one', async () => {
  const seed = { moxiePortalTool: 1, parent: {}, snippets: [{ id: 'nav-tasks-link', settings: { TASKS_LABEL: 'Kept' } }] };
  const logged = [];
  const t = await openTool({
    storage: seed,
    beforeParse(w) {
      recordConsoleErrors(logged)(w);
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
  assert.equal(logged.length, 1, 'the failure is logged for support');
  assert.equal(logged[0][0], '[MoxiePortal tool] settings could not be loaded');
  assert.equal(logged[0][1].message, 'editor failed');
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

function radio(field, choice) {
  return field.querySelector('input[type="radio"][value="' + choice + '"]');
}

function choose(t, select, value) {
  select.value = value;
  select.dispatchEvent(new t.window.Event('change', { bubbles: true }));
}

test('logo radios map to the snippet\'s values', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="logo"]').click();
  const field = t.$('[data-mp-field="LOGO_CHANGE"]');
  const url = field.querySelector('input[type="url"]');
  assert.equal(radio(field, 'hide').checked, true);
  assert.ok(output(t).includes('var LOGO_CHANGE = "none";'));
  assert.notEqual(url.closest('[hidden]'), null, 'the address box waits for "image"');
  assert.equal(radio(field, 'same'), null);
  radio(field, 'image').click();
  assert.equal(url.closest('[hidden]'), null);
  type(t, url, 'https://x.test/l.png');
  assert.ok(output(t).includes('var LOGO_CHANGE = "https://x.test/l.png";'));
  assert.equal(t.$('#mp-problems').textContent, '');
  type(t, url, 'logo.png');
  assert.match(t.$('#mp-problems').textContent, /1 /);
  assert.ok(output(t).includes('var LOGO_CHANGE = "logo.png";'));
  assert.match(field.querySelector('.mp-problem').textContent, /starting with https:\/\//);
  assert.equal(url.getAttribute('aria-invalid'), 'true');
  radio(field, 'keep').click();
  assert.ok(output(t).includes('var LOGO_CHANGE = "";'));
  assert.equal(t.$('#mp-problems').textContent, '');
  const collapsed = t.$('[data-mp-field="LOGO_COLLAPSED"]');
  assert.equal(radio(collapsed, 'same').checked, true);
  assert.ok(output(t).includes('var LOGO_COLLAPSED = null;'));
  radio(collapsed, 'hide').click();
  assert.ok(output(t).includes('var LOGO_COLLAPSED = "none";'));
  assert.deepEqual(t.errors, []);
});

test('renames rows build the object', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-rename"]').click();
  const field = t.$('[data-mp-field="RENAMES"]');
  const rows = () => field.querySelectorAll('[data-mp-row]');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].querySelector('.mp-rename-name').value, 'Meetings');
  assert.equal(rows()[0].querySelector('.mp-rename-label').value, 'Schedule time');
  assert.equal(rows()[0].querySelector('select').value, 'calendar');
  field.querySelector('[data-mp-add-row]').click();
  const added = rows()[1];
  const name = added.querySelector('.mp-rename-name');
  assert.equal(t.document.activeElement, name);
  const suggestions = t.document.getElementById(name.getAttribute('list'));
  assert.deepEqual(Array.from(suggestions.options).map((o) => o.value),
    ['Home', 'Projects', 'Meetings', 'Requests', 'Invoices', 'Files', 'Time']);
  type(t, name, 'Requests');
  type(t, added.querySelector('.mp-rename-label'), 'Help desk');
  assert.equal(added.querySelector('select').value, '');
  assert.ok(output(t).includes(
    'var RENAMES = {"Meetings":{"label":"Schedule time","icon":"calendar"},"Requests":{"label":"Help desk"}};'));

  const select = added.querySelector('select');
  const svg = added.querySelector('textarea');
  assert.notEqual(svg.closest('[hidden]'), null);
  choose(t, select, select.options[select.options.length - 1].value);
  assert.equal(svg.closest('[hidden]'), null);
  type(t, svg, '<circle cx="12" cy="12" r="9"/>');
  assert.ok(output(t).includes('"Requests":{"label":"Help desk","icon":"<circle cx=\\"12\\" cy=\\"12\\" r=\\"9\\"/>"}'));

  rows()[0].querySelector('[data-mp-remove-row]').click();
  assert.equal(rows().length, 1);
  assert.equal(t.document.activeElement, rows()[0].querySelector('.mp-rename-name'));
  assert.ok(output(t).includes('var RENAMES = {"Requests":'));
  assert.equal(rows()[0].querySelector('select').value, select.value, 'the custom choice survives a redraw');
  assert.deepEqual(t.errors, []);
});

test('groups rows build the array and flag empty starts', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="schedule-groups"]').click();
  assert.ok(output(t).includes('Asynchronous work on your site'));
  const field = t.$('[data-mp-field="GROUPS"]');
  const rows = () => field.querySelectorAll('[data-mp-row]');
  assert.equal(rows().length, 2);
  field.querySelector('[data-mp-add-row]').click();
  let row = rows()[2];
  const starts = row.querySelector('.mp-group-starts');
  assert.equal(t.document.activeElement, starts);
  type(t, starts, 'Retainer:');
  type(t, row.querySelector('[data-mp-field="onlyFor"] .mp-filter-key'), 'ClientType');
  type(t, row.querySelector('[data-mp-field="onlyFor"] .mp-filter-value'), 'Retainer');
  assert.ok(output(t).includes('{"starts":"Retainer:","onlyFor":{"ClientType":"Retainer"}}'));
  assert.equal(t.$('#mp-problems').textContent, '');
  type(t, starts, '');
  assert.match(t.$('#mp-problems').textContent, /1 /);
  assert.match(row.querySelector('.mp-problem').textContent, /start of the link names/);
  assert.equal(starts.getAttribute('aria-invalid'), 'true');

  row.querySelector('[data-mp-move="up"]').click();
  row = rows()[1];
  assert.equal(t.document.activeElement, row.querySelector('[data-mp-move="up"]'));
  assert.equal(row.querySelector('.mp-group-starts').value, '');
  assert.notEqual(row.querySelector('.mp-problem'), null, 'the problem moves with its group');
  const out = output(t);
  assert.ok(out.indexOf('{"starts":"","onlyFor":{"ClientType":"Retainer"}}') < out.indexOf('"starts":"Meeting:"'));
  assert.equal(rows()[0].querySelector('[data-mp-move="up"]').disabled, true);
  assert.equal(rows()[2].querySelector('[data-mp-move="down"]').disabled, true);

  row.querySelector('[data-mp-remove-row]').click();
  assert.equal(rows().length, 2);
  assert.equal(t.document.activeElement, rows()[1].querySelector('.mp-group-starts'));
  assert.equal(t.$('#mp-problems').textContent, '');
  assert.ok(!output(t).includes('Retainer'));
  assert.deepEqual(t.errors, []);
});

test('home layout follows the cards that are on, and lists a card once', async () => {
  const t = await openTool();
  const section = t.$('#mp-home-layout');
  const layout = () => t.$$('#mp-home-layout [data-mp-card]').map((n) => n.getAttribute('data-mp-card'));
  const item = (card) => t.$('#mp-home-layout [data-mp-card="' + card + '"]');
  const share = (card) => item(card).querySelector('input[type="checkbox"]');
  const homeCards = (text) => assert.ok(output(t).includes('var HOME_CARDS = ' + text + ';'), text);
  assert.equal(section.hidden, true);

  t.$('[data-mp-toggle="home-waiting"]').click();
  t.$('[data-mp-add-copy="home-waiting"]').click();
  assert.equal(section.hidden, false);
  assert.deepEqual(layout(), ['waiting']);
  assert.match(item('waiting').textContent, /Waiting on you card/);
  const headings = t.$$('#mp-home-layout h2, #mp-home-layout h3, #mp-home-layout legend');
  assert.deepEqual(headings.map((n) => n.textContent), ['Home page layout', 'Home page layout'],
    'one heading, which is also the legend');
  assert.equal(t.$('#mp-home-layout legend > h2').textContent, 'Home page layout');
  homeCards('[["waiting"]]');

  t.$('[data-mp-toggle="home-billing"]').click();
  assert.deepEqual(layout(), ['waiting', 'billing']);
  homeCards('[["waiting"],["billing"]]');
  assert.equal(share('waiting').disabled, true);
  share('billing').click();
  homeCards('[["waiting","billing"]]');

  item('billing').querySelector('[data-mp-move="up"]').click();
  homeCards('[["billing","waiting"]]');
  assert.deepEqual(layout(), ['billing', 'waiting']);
  assert.equal(share('billing').disabled, true);
  assert.equal(share('billing').checked, false);
  assert.equal(share('waiting').checked, true);
  assert.equal(t.document.activeElement, item('billing').querySelector('[data-mp-move="down"]'));
  assert.deepEqual(stored(t).parent.HOME_CARDS, [['billing', 'waiting']]);

  t.window.confirm = () => true;
  t.$('[data-mp-toggle="home-waiting"]').click();
  homeCards('[["billing"]]');
  assert.deepEqual(layout(), ['billing']);
  t.$('[data-mp-toggle="home-billing"]').click();
  assert.equal(section.hidden, true);
  homeCards('[]');
  assert.deepEqual(t.errors, []);
});

test('structured settings load from storage and survive wrong types', async () => {
  const t = await openTool({
    storage: {
      moxiePortalTool: 1,
      parent: { HOME_CARDS: [['recent', 'nope'], 'waiting'] },
      snippets: [
        { id: 'logo', settings: { LOGO_CHANGE: 'https://x.test/a.png', LOGO_COLLAPSED: { a: 1 } } },
        { id: 'schedule-groups', settings: { GROUPS: ['Meeting:', 5, { starts: 'A', text: 7, notFor: 'TNC' }] } },
        { id: 'nav-rename', settings: { RENAMES: { Time: { icon: 'history', label: 3 }, ' ': {} } } },
        { id: 'home-waiting', settings: {} },
        { id: 'home-recent', settings: {} }
      ]
    }
  });
  assert.deepEqual(t.errors, []);
  const out = output(t);
  assert.ok(out.includes('var LOGO_CHANGE = "https://x.test/a.png";'));
  assert.ok(out.includes('var LOGO_COLLAPSED = "none";'));
  assert.equal(t.$('[data-mp-field="LOGO_CHANGE"] input[type="url"]').value, 'https://x.test/a.png');
  assert.equal(radio(t.$('[data-mp-field="LOGO_CHANGE"]'), 'image').checked, true);
  assert.equal(radio(t.$('[data-mp-field="LOGO_COLLAPSED"]'), 'hide').checked, true);
  assert.ok(out.includes('var GROUPS = [{"starts":"Meeting:"},{"starts":"A"}];'));
  assert.equal(t.$$('[data-mp-field="GROUPS"] [data-mp-row]').length, 2);
  assert.ok(out.includes('var RENAMES = {"Time":{"icon":"history"}};'));
  assert.ok(out.includes('var HOME_CARDS = [["recent"],["waiting"]];'));
  assert.equal(t.$('#mp-problems').textContent, '');
});

// Records downloads instead of navigating: the Blob given to URL.createObjectURL, the link
// clicked and the URL revoked.
function recordDownloads(downloads) {
  return function (w) {
    w.URL.createObjectURL = (blob) => { downloads.blobs.push(blob); return 'blob:fake'; };
    w.URL.revokeObjectURL = (url) => downloads.revoked.push(url);
    w.HTMLAnchorElement.prototype.click = function () {
      downloads.links.push({ name: this.download, href: this.getAttribute('href') });
    };
  };
}

function messages(t) {
  return t.$('#mp-messages').textContent;
}

const TWO_CSS = {
  moxiePortalTool: 1,
  parent: { CLIENT_FILTER: null },
  snippets: [
    { id: 'custom-css', settings: { ONLY_FOR: { ClientType: 'TNC' }, CSS: ['#app { --v-sidebar-base: #1B5E20 !important; }'] } },
    { id: 'custom-css', settings: { ONLY_FOR: { ClientType: 'Agency' }, CSS: ['#app { --v-sidebar-base: #0D47A1 !important; }'] } }
  ]
};
const TWO_CSS_PASTE = gen.generate(TWO_CSS, buildBundle(), manifest);
const EDITED = 'The script in the box isn\'t what this tool makes from its settings line: either it was edited by hand, '
  + 'or the snippets have been updated since. Hand edits won\'t be in the new paste. Load the settings anyway?';
const START_OVER = 'Start over with a blank form? Your saved settings in this browser will be cleared.';

test('a saved file round-trips', async () => {
  const downloads = { blobs: [], links: [], revoked: [] };
  const t = await openTool({ beforeParse: recordDownloads(downloads) });
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  type(t, t.$('[data-mp-field="TASKS_LABEL"] input'), 'X');
  t.$('#mp-save-json').click();
  await t.tick(10);
  assert.equal(downloads.blobs.length, 1);
  assert.deepEqual(downloads.links, [{ name: 'moxie-portal-settings.json', href: 'blob:fake' }]);
  assert.deepEqual(downloads.revoked, [], 'kept until the browser has surely started the download');
  assert.equal(t.$$('a[download]').length, 0, 'the temporary link is removed');
  const text = await downloads.blobs[0].text();
  assert.equal(text, JSON.stringify(stored(t), null, 2));

  const fresh = await openTool();
  await fresh.window.__mpTool.loadConfigText(text);
  assert.ok(output(fresh).includes('"X"'));
  assert.equal(fresh.$('[data-mp-field="TASKS_LABEL"] input').value, 'X');
  assert.equal(stored(fresh).snippets[0].settings.TASKS_LABEL, 'X');
  assert.equal(messages(fresh), '');
  assert.deepEqual(t.errors, []);
  assert.deepEqual(fresh.errors, []);
});

test('the script downloads as a file', async () => {
  const downloads = { blobs: [], links: [], revoked: [] };
  const t = await openTool({ beforeParse: recordDownloads(downloads) });
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  t.$('#mp-download-js').click();
  await t.tick(10);
  assert.deepEqual(downloads.links, [{ name: 'moxie-portal-embed.js', href: 'blob:fake' }]);
  assert.equal(await downloads.blobs[0].text(), output(t));
  assert.deepEqual(downloads.revoked, [], 'kept until the browser has surely started the download');
  await t.tick(1000);
  assert.deepEqual(downloads.revoked, ['blob:fake']);
  assert.deepEqual(t.errors, []);
});

test('random JSON is refused without changing the form', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  const before = output(t);
  for (const text of ['[1,2]', '{"a":1}', 'not json']) {
    await t.window.__mpTool.loadConfigText(text);
    assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, true, text);
    assert.equal(messages(t), 'That file isn\'t a settings file from this tool.', text);
    assert.equal(t.$$('#mp-messages p').length, 1, 'each action replaces the last message');
  }
  assert.equal(output(t), before);
  assert.equal(stored(t).snippets.length, 1);
  assert.deepEqual(t.errors, []);
});

test('unknown settings are named', async () => {
  const t = await openTool();
  await t.window.__mpTool.loadConfigText(JSON.stringify({
    moxiePortalTool: 1,
    parent: {},
    snippets: [{ id: 'custom-css', settings: { FOO: 1 } }]
  }));
  assert.equal(messages(t), 'Ignored settings this version doesn\'t know: custom-css: FOO');
  assert.equal(t.$('[data-mp-toggle="custom-css"]').checked, true);
  assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 1);
  assert.deepEqual(t.errors, []);
});

test('a newer version is explained', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  await t.window.__mpTool.loadConfigText('{"moxiePortalTool":2}');
  assert.equal(messages(t), 'This file was made by a newer version of the tool. Reload the page and try again.');
  assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, true);
  assert.equal(stored(t).moxiePortalTool, 1);
  assert.deepEqual(t.errors, []);
});

test('paste from Moxie rebuilds the form', async () => {
  const t = await openTool();
  const asked = [];
  t.window.confirm = (msg) => { asked.push(msg); return true; };
  assert.equal(t.$('#mp-paste').hidden, true);
  t.$('#mp-paste-open').click();
  assert.equal(t.$('#mp-paste').hidden, false);
  assert.equal(t.document.activeElement, t.$('#mp-paste-text'));
  t.$('#mp-paste-text').value = TWO_CSS_PASTE;
  t.$('#mp-paste-apply').click();
  await t.tick();
  assert.deepEqual(asked, []);
  const sections = t.$$('[data-mp-snippet="custom-css"]');
  assert.equal(sections.length, 2);
  assert.equal(sections[1].querySelector('[data-mp-field="ONLY_FOR"] .mp-filter-value').value, 'Agency');
  const out = output(t);
  assert.equal(count(out, 'var ONLY_FOR = {"ClientType":"TNC"};'), 1);
  assert.equal(count(out, 'var ONLY_FOR = {"ClientType":"Agency"};'), 1);
  assert.equal(stored(t).snippets.length, 2);
  assert.equal(t.$('#mp-paste').hidden, true);
  assert.equal(t.$('#mp-paste-text').value, '', 'the old paste is not left in the box');
  assert.equal(messages(t), '');
  assert.deepEqual(t.errors, []);
});

test('an edited box warns first', async () => {
  const t = await openTool();
  const asked = [];
  t.window.confirm = (msg) => { asked.push(msg); return false; };
  await t.window.__mpTool.applyPaste(TWO_CSS_PASTE + '\n(function(){})();');
  assert.deepEqual(asked, [EDITED]);
  assert.equal(t.$$('[data-mp-snippet]').length, 0);
  assert.equal(t.window.localStorage.getItem(STORAGE_KEY), null);
  t.window.confirm = (msg) => { asked.push(msg); return true; };
  await t.window.__mpTool.applyPaste(TWO_CSS_PASTE + '\n(function(){})();');
  assert.equal(asked.length, 2);
  assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 2);
  assert.deepEqual(t.errors, []);
});

test('saying no to the edited-box warning changes nothing, messages included', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  await t.window.__mpTool.loadConfigText('not json');
  const before = { messages: messages(t), output: output(t), stored: stored(t) };
  t.window.confirm = () => false;
  t.$('#mp-paste-open').click();
  const edited = TWO_CSS_PASTE + '\n(function(){})();';
  t.$('#mp-paste-text').value = edited;
  t.$('#mp-paste-apply').click();
  await t.tick();
  assert.equal(messages(t), before.messages);
  assert.equal(output(t), before.output);
  assert.deepEqual(stored(t), before.stored);
  assert.equal(t.$('#mp-paste').hidden, false);
  assert.equal(t.$('#mp-paste-text').value, edited);
  assert.deepEqual(t.errors, []);
});

test('a paste from a newer tool says paste, not file', async () => {
  const t = await openTool();
  await t.window.__mpTool.applyPaste('/* MoxiePortal settings: {"moxiePortalTool":2} */');
  assert.equal(messages(t), 'That paste was made by a newer version of the tool. Reload the page and try again.');
  assert.equal(t.$$('[data-mp-snippet]').length, 0);
  assert.deepEqual(t.errors, []);
});

// After the page is up, the next textarea the app creates throws, as a broken editor would.
function breakNextTextarea(t) {
  const create = t.document.createElement;
  let failed = false;
  t.document.createElement = function (tag) {
    if (tag === 'textarea' && !failed) {
      failed = true;
      throw new Error('editor failed');
    }
    return create.apply(this, arguments);
  };
}

test('settings that cannot be shown leave the form as it was', async () => {
  const logged = [];
  const t = await openTool({ beforeParse: recordConsoleErrors(logged) });
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  type(t, t.$('[data-mp-field="TASKS_LABEL"] input'), 'Before');
  const before = { output: output(t), stored: stored(t) };
  const load = (text) => t.window.__mpTool.loadConfigText(text);
  const paste = (text) => t.window.__mpTool.applyPaste(text);
  for (const [name, action] of [['file', load], ['paste', paste]]) {
    t.$('#mp-paste-open').click();
    t.$('#mp-paste-text').value = TWO_CSS_PASTE;
    breakNextTextarea(t);
    await action(name === 'file' ? JSON.stringify(TWO_CSS) : TWO_CSS_PASTE);
    assert.equal(messages(t), 'Those settings couldn\'t be loaded.', name);
    assert.equal(t.$$('[data-mp-snippet="custom-css"]').length, 0, name);
    assert.equal(t.$('[data-mp-field="TASKS_LABEL"] input').value, 'Before', name);
    assert.equal(output(t), before.output, name);
    assert.deepEqual(stored(t), before.stored, name);
    assert.equal(t.$('#mp-paste-text').value, TWO_CSS_PASTE, name + ': the paste stays to try again');
  }
  assert.deepEqual(logged.map((args) => [args[0], args[1].message]), [
    ['[MoxiePortal tool] settings could not be loaded', 'editor failed'],
    ['[MoxiePortal tool] settings could not be loaded', 'editor failed']
  ]);
  assert.deepEqual(t.errors, []);
});

test('the storage note stays while other messages come and go', async () => {
  const t = await openTool({
    beforeParse(w) {
      Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
    }
  });
  const note = 'This browser won\'t remember your settings between visits. To keep them, use the Save settings file button.';
  assert.equal(t.$('#mp-save-json').textContent, 'Save settings file');
  const texts = () => t.$$('#mp-messages p').map((p) => p.textContent);
  assert.deepEqual(texts(), [note]);
  await t.window.__mpTool.loadConfigText('not json');
  assert.deepEqual(texts(), [note, 'That file isn\'t a settings file from this tool.']);
  await t.window.__mpTool.applyPaste('var x = 1;');
  assert.deepEqual(texts(), [note, 'This doesn\'t look like a paste made by this tool.']);
  await t.window.__mpTool.applyPaste(TWO_CSS_PASTE);
  assert.deepEqual(texts(), [note]);
  t.window.confirm = () => true;
  t.$('#mp-reset').click();
  assert.deepEqual(texts(), [note]);
  assert.deepEqual(t.errors, []);
});

test('a box that is not a paste from this tool is refused', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  for (const text of ['var x = 1;', '/* MoxiePortal settings: {nope} */']) {
    await t.window.__mpTool.applyPaste(text);
    assert.equal(messages(t), 'This doesn\'t look like a paste made by this tool.', text);
    assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, true, text);
  }
  assert.deepEqual(t.errors, []);
});

test('start over clears', async () => {
  const t = await openTool();
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  const asked = [];
  t.window.confirm = (msg) => { asked.push(msg); return false; };
  t.$('#mp-reset').click();
  assert.equal(t.$$('[data-mp-snippet]').length, 1, 'no change when the user says no');
  t.window.confirm = (msg) => { asked.push(msg); return true; };
  t.$('#mp-reset').click();
  assert.deepEqual(asked, [START_OVER, START_OVER]);
  assert.equal(t.$$('[data-mp-snippet]').length, 0);
  assert.equal(t.$('[data-mp-toggle="nav-tasks-link"]').checked, false);
  const fresh = await openTool();
  assert.equal(output(t), output(fresh));
  const saved = t.window.localStorage.getItem(STORAGE_KEY);
  if (saved !== null) assert.deepEqual(JSON.parse(saved), gen.parseSettingsLine(output(fresh)));
  assert.deepEqual(t.errors, []);
});

test('copy writes the output', async () => {
  let recorded = null;
  const timers = [];
  const t = await openTool({
    beforeParse(w) {
      Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: (text) => { recorded = text; return Promise.resolve(); } }
      });
      // Timers are recorded, so the test runs the two-second one without waiting for it.
      w.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
      w.clearTimeout = () => {};
    }
  });
  t.$('[data-mp-toggle="nav-tasks-link"]').click();
  const button = t.$('#mp-copy');
  button.click();
  await t.tick();
  assert.equal(recorded, output(t));
  assert.equal(button.textContent, 'Copied');
  assert.deepEqual(timers.map((timer) => timer.ms), [2000]);
  timers[0].fn();
  assert.equal(button.textContent, 'Copy script');
  assert.deepEqual(t.errors, []);
});

test('choosing a settings file loads it', async () => {
  const t = await openTool();
  const input = t.$('#mp-load-json');
  let opened = 0;
  input.click = () => { opened += 1; };
  t.$('#mp-load-json-button').click();
  assert.equal(opened, 1);
  const text = JSON.stringify({
    moxiePortalTool: 1,
    parent: {},
    snippets: [{ id: 'nav-tasks-link', settings: { TASKS_LABEL: 'From file' } }]
  });
  const file = new t.window.File([text], 'moxie-portal-settings.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new t.window.Event('change'));
  await t.tick(10);
  assert.ok(output(t).includes('var TASKS_LABEL = "From file";'));
  assert.deepEqual(t.errors, []);
});

test('a settings file dropped on the load button loads it', async () => {
  const t = await openTool();
  const button = t.$('#mp-load-json-button');
  const over = new t.window.Event('dragover', { bubbles: true, cancelable: true });
  button.dispatchEvent(over);
  assert.ok(over.defaultPrevented, 'the button accepts a drop');
  assert.ok(button.classList.contains('mp-drop-ready'));
  button.dispatchEvent(new t.window.Event('dragleave', { bubbles: true }));
  assert.ok(!button.classList.contains('mp-drop-ready'));
  button.dispatchEvent(new t.window.Event('dragover', { bubbles: true, cancelable: true }));
  const text = JSON.stringify({
    moxiePortalTool: 1,
    parent: {},
    snippets: [{ id: 'nav-tasks-link', settings: { TASKS_LABEL: 'Dropped' } }]
  });
  const drop = new t.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', {
    value: { files: [new t.window.File([text], 'x.json', { type: 'application/json' })] }
  });
  button.dispatchEvent(drop);
  assert.ok(drop.defaultPrevented, 'the browser does not open the file itself');
  assert.ok(!button.classList.contains('mp-drop-ready'));
  await t.tick(10);
  assert.ok(output(t).includes('var TASKS_LABEL = "Dropped";'));
  assert.equal(stored(t).snippets[0].settings.TASKS_LABEL, 'Dropped');
  assert.deepEqual(t.errors, []);
});
