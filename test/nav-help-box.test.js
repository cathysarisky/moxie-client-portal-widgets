'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

function link(label) {
  return '<button class="portal-nav-link" type="button" aria-label="' + label + '"><span class="nav-label">' + label + '</span></button>';
}
const SIDEBAR = '<aside id="left-nav"><div class="rail-navigation"><div class="navigation-group">' +
  link('Home') + link('Projects') + '</div></div></aside>';

// An onboarded client, so a pasted welcome-tour offers its replay hook without opening.
const ONBOARDED = [{ mappingKey: 'ClientType', value: 'TEST' }, { mappingKey: 'AccessedPortal', value: 'Yes' }];

function start(opts = {}, settings = {}) {
  const t = boot(Object.assign({ html: SIDEBAR, route: '/welcome', customValues: ONBOARDED }, opts));
  if (opts.withTour) loadSnippet(t, 'welcome-tour');
  loadSnippet(t, 'nav-help-box', settings);
  if (opts.tourAfter) loadSnippet(t, 'welcome-tour');
  return t;
}
const box = (t) => t.document.querySelector('.mp-help');

test('adds the box right after the menu links', () => {
  const t = start();
  assert.ok(box(t));
  assert.equal(t.document.querySelector('.navigation-group').nextElementSibling, box(t));
  assert.equal(box(t).querySelector('.mp-help-title').textContent, 'Need help?');
});

test('the link opens the help desk', async () => {
  const t = start();
  box(t).querySelector('.mp-help-link').click();
  await tick();
  assert.equal(t.router.currentRoute.path, '/requests');
});

test('the replay link appears only when welcome-tour is pasted too, and opens the tour', () => {
  assert.equal(start().document.querySelectorAll('.mp-help-link').length, 1);
  const t = start({ withTour: true });
  const links = t.document.querySelectorAll('.mp-help-link');
  assert.equal(links.length, 2);
  assert.equal(links[1].textContent, 'Replay the welcome tour');
  links[1].click();
  assert.ok(t.document.querySelector('.mp-tour-backdrop'));
});

test('hides itself while the menu is collapsed to icons', async () => {
  const t = start();
  t.document.querySelector('.portal-nav-link').classList.add('is-collapsed');
  await tick();
  assert.ok(box(t).hasAttribute('data-collapsed'));
  t.document.querySelector('.portal-nav-link').classList.remove('is-collapsed');
  await tick();
  assert.equal(box(t).hasAttribute('data-collapsed'), false);
});

test('is removed when the client stops matching', async () => {
  const t = start();
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'OTHER' }];
  t.store.notify();
  await tick();
  assert.equal(box(t), null);
});

test('the replay link also appears when welcome-tour is pasted below the box', async () => {
  const t = start({ tourAfter: true });
  await tick();
  assert.equal(t.document.querySelectorAll('.mp-help-link').length, 2);
});

test('stays out of the menu when the help desk is off and the link points there', () => {
  const t = start({ features: { ticketsEnabled: false } });
  assert.equal(box(t), null);
  const elsewhere = start({ features: { ticketsEnabled: false } }, { LINK_PATH: '/meetings/schedulers' });
  assert.ok(box(elsewhere));
});
