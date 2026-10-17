'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

function link(label) {
  return '<button class="portal-nav-link" type="button" aria-label="' + label + '" content="' + label + '">' +
    '<span class="nav-icon-shell"><svg class="portal-icon nav-icon" viewBox="0 0 24 24"><path d="M1 1"/></svg></span>' +
    '<span class="nav-label">' + label + '</span></button>';
}
const SIDEBAR = '<aside id="left-nav">' + link('Projects') + link('Meetings') + link('Requests') + '</aside>';
const TITLE = '<div class="tabs-component"><button class="row-format align-center module-title" type="button"><div><span>Meetings</span></div></button>' +
  '<div class="tabs-wrapper"><button class="tab-item selected">Schedule now</button></div></div>';

const RENAME = { Meetings: { label: 'Schedule time', icon: 'calendar' } };

function start(settings, route = '/meetings/schedulers') {
  const t = boot({ html: SIDEBAR + TITLE, route });
  t.MoxiePortal.ready((portal) => { t.portal = portal; });
  loadSnippet(t, 'nav-rename', settings);
  return t;
}
// How the browser serialises SVG markup once it has been parsed into an element.
function markup(t, paths) {
  const svg = t.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.innerHTML = paths;
  return svg.innerHTML;
}
function navButton(t, label) {
  return Array.from(t.document.querySelectorAll('#left-nav .portal-nav-link'))
    .find((b) => b.querySelector('.nav-label').textContent === label);
}

test('renames the menu label and its tooltip', () => {
  const t = start({ RENAMES: RENAME });
  const btn = navButton(t, 'Schedule time');
  assert.ok(btn, 'renamed button present');
  assert.equal(btn.getAttribute('aria-label'), 'Schedule time');
  assert.equal(btn.getAttribute('content'), 'Schedule time');
  assert.equal(navButton(t, 'Meetings'), undefined);
});

test('swaps the icon for a parent icon by name', () => {
  const t = start({ RENAMES: RENAME });
  const svg = navButton(t, 'Schedule time').querySelector('svg');
  assert.equal(svg.innerHTML, markup(t, t.portal.icons.calendar));
  assert.ok(/<rect/.test(svg.innerHTML), 'calendar icon has a frame');
});

test('accepts raw SVG markup as the icon', () => {
  const t = start({ RENAMES: { Meetings: { label: 'Schedule time', icon: '<circle cx="12" cy="12" r="9"/>' } } });
  assert.equal(navButton(t, 'Schedule time').querySelector('svg').innerHTML, markup(t, '<circle cx="12" cy="12" r="9"/>'));
});

test('an entry with only a label keeps the icon, and one with only an icon keeps the label', () => {
  const t = start({ RENAMES: { Meetings: { label: 'Schedule time' }, Projects: { icon: 'folder' } } });
  assert.equal(navButton(t, 'Schedule time').querySelector('svg').innerHTML, '<path d="M1 1"></path>');
  assert.equal(navButton(t, 'Projects').querySelector('svg').innerHTML, markup(t, t.portal.icons.folder));
});

test('renames the page heading to match', () => {
  const t = start({ RENAMES: RENAME });
  assert.equal(t.document.querySelector('.module-title span').textContent, 'Schedule time');
  assert.equal(t.document.querySelector('.tab-item').textContent, 'Schedule now');
});

test('other links are left alone', () => {
  const t = start({ RENAMES: RENAME });
  const projects = navButton(t, 'Projects');
  assert.equal(projects.getAttribute('aria-label'), 'Projects');
  assert.equal(projects.querySelector('svg').innerHTML, '<path d="M1 1"></path>');
});

test('re-applies after the portal redraws the label, as when the menu expands again', async () => {
  const t = start({ RENAMES: RENAME });
  const btn = navButton(t, 'Schedule time');
  const fresh = t.document.createElement('span');
  fresh.className = 'nav-label';
  fresh.textContent = 'Meetings';
  btn.querySelector('.nav-label').replaceWith(fresh);
  await tick();
  assert.equal(btn.querySelector('.nav-label').textContent, 'Schedule time');
});

test('puts everything back on cleanup', () => {
  const t = start({ RENAMES: RENAME });
  t.store.getters.getClientId = 'client-2';
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'Other' }];
  t.store.notify();
  const btn = navButton(t, 'Meetings');
  assert.ok(btn, 'original label restored');
  assert.equal(btn.getAttribute('aria-label'), 'Meetings');
  assert.equal(btn.getAttribute('content'), 'Meetings');
  assert.equal(btn.querySelector('svg').innerHTML, '<path d="M1 1"></path>');
  assert.equal(t.document.querySelector('.module-title span').textContent, 'Meetings');
});

test('cleanup leaves alone text the portal has since changed itself', async () => {
  const t = start({ RENAMES: RENAME });
  const heading = t.document.querySelector('.module-title span');
  heading.textContent = 'Projects';   // the portal moved to another page
  await tick();
  t.store.getters.getClientId = 'client-2';
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'Other' }];
  t.store.notify();
  assert.equal(heading.textContent, 'Projects');
});

test('the calendar icon works even with a parent script that has no calendar icon', () => {
  const t = boot({ html: SIDEBAR + TITLE, route: '/meetings/schedulers' });
  t.MoxiePortal.ready((portal) => { t.portal = portal; delete portal.icons.calendar; });
  loadSnippet(t, 'nav-rename', { RENAMES: RENAME });
  const svg = navButton(t, 'Schedule time').querySelector('svg');
  assert.ok(/<rect/.test(svg.innerHTML), 'calendar frame drawn');
  assert.equal(svg.querySelectorAll('path, rect').length > 3, true);
});

test('an unknown icon name keeps the portal icon', () => {
  const t = start({ RENAMES: { Meetings: { label: 'Schedule time', icon: 'no-such-icon' } } });
  assert.equal(navButton(t, 'Schedule time').querySelector('svg').innerHTML, '<path d="M1 1"></path>');
  assert.equal(t.warns.length, 0);
});
