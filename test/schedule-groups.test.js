'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

const PAGE = '<div id="list"><div class="scheduler-page"><div class="scheduler-grid"></div></div></div>';

function scheduler(id, name, minutes) {
  const hours = minutes >= 60 && minutes % 60 === 0;
  return {
    id, name,
    meetingLength: { duration: hours ? minutes / 60 : minutes, timeUnit: hours ? 'HOURS' : 'MINUTES', asMinutes: minutes },
    meetingLink: 'https://hello.test/' + id
  };
}

const LINKS = [
  scheduler('d1', 'Developer time: 1h', 60),
  scheduler('m2', 'Meeting: Sync call', 60),
  scheduler('d3', 'Developer time: 3h', 180),
  scheduler('m1', 'Meeting: Existing client call', 30),
  scheduler('r1', 'Retainer clients - an hour', 60)
];

// Mounts a fake SchedulerList page: the Vue instance sits on the list's root element and
// renders one .scheduler card per link, as the portal does.
function mountPage(t, links) {
  const grid = t.document.querySelector('.scheduler-grid');
  grid.innerHTML = '';
  links.forEach((s) => {
    const card = t.document.createElement('div');
    card.className = 'scheduler';
    card.innerHTML = '<div class="brand-medium mb-2">' + s.name + '</div>';
    grid.appendChild(card);
  });
  const vm = t.document.getElementById('list').__vue__ || { booked: [] };
  vm.schedulers = links;
  vm.bookNow = (s) => vm.booked.push(s.id);
  vm.$t = (key) => ({ 'meetings.duration': 'Duration:', 'meetings.schedule.book-now': 'Book now' })[key] || key;
  t.document.getElementById('list').__vue__ = vm;
  return vm;
}

function start(settings, links = LINKS) {
  const t = boot({ html: PAGE, route: '/meetings/schedulers' });
  const vm = mountPage(t, links);
  loadSnippet(t, 'schedule-groups', settings);
  return { t, vm };
}

function headings(t) {
  return Array.from(t.document.querySelectorAll('#mp-schedule-groups .mp-group-title')).map((h) => h.textContent);
}
function namesUnder(t, heading) {
  const group = Array.from(t.document.querySelectorAll('#mp-schedule-groups .mp-group'))
    .find((g) => g.querySelector('.mp-group-title').textContent === heading);
  return Array.from(group.querySelectorAll('.mp-scheduler-name')).map((n) => n.textContent);
}

test('groups links under headings in the configured order, A to Z inside each, prefix stripped', () => {
  const { t } = start({ GROUPS: ['Developer time:', 'Meeting:'], OTHER_LABEL: '' });
  assert.deepEqual(headings(t), ['Developer time', 'Meeting']);
  assert.deepEqual(namesUnder(t, 'Developer time'), ['1h', '3h']);
  assert.deepEqual(namesUnder(t, 'Meeting'), ['Existing client call', 'Sync call']);
});

test('links that match no prefix go last under the Other heading with their full names', () => {
  const { t } = start({ GROUPS: ['Meeting:', 'Developer time:'] });
  assert.deepEqual(headings(t), ['Meeting', 'Developer time', 'Other']);
  assert.deepEqual(namesUnder(t, 'Other'), ['Retainer clients - an hour']);
});

test('matching ignores case and surrounding spaces', () => {
  const { t } = start({ GROUPS: ['  developer TIME: '] });
  assert.deepEqual(namesUnder(t, 'developer TIME'), ['1h', '3h']);
});

test('each card shows the duration and books through the page', () => {
  const { t, vm } = start({ GROUPS: ['Developer time:'] });
  const card = t.document.querySelector('#mp-schedule-groups .mp-scheduler');
  assert.equal(card.querySelector('.mp-scheduler-duration').textContent, 'Duration: 1 hours');
  const btn = card.querySelector('button');
  assert.equal(btn.textContent.trim(), 'Book now');
  btn.click();
  assert.deepEqual(vm.booked, ['d1']);
});

test('the original grid is hidden while the groups show and comes back on cleanup', () => {
  const { t } = start({ GROUPS: ['Developer time:'] });
  const grid = t.document.querySelector('.scheduler-grid');
  assert.equal(grid.style.display, 'none');
  t.store.getters.getClientId = 'client-2';
  t.store.state.clientPortalContext.client.customValues = [{ mappingKey: 'ClientType', value: 'Other' }];
  t.store.notify();
  assert.equal(grid.style.display, '');
  assert.equal(t.document.getElementById('mp-schedule-groups'), null);
});

test('when no link matches a prefix the page is left alone', () => {
  const { t } = start({ GROUPS: ['Nothing:'] });
  assert.equal(t.document.getElementById('mp-schedule-groups'), null);
  assert.equal(t.document.querySelector('.scheduler-grid').style.display, '');
});

test('groups appear once the page has loaded its links', async () => {
  const { t } = start({ GROUPS: ['Developer time:'] }, []);
  assert.equal(t.document.getElementById('mp-schedule-groups'), null);
  mountPage(t, LINKS);
  await tick();
  assert.deepEqual(namesUnder(t, 'Developer time'), ['1h', '3h']);
  assert.equal(t.document.querySelectorAll('#mp-schedule-groups').length, 1);
});

test('nothing happens on other pages', () => {
  const t = boot({ html: PAGE, route: '/meetings/booked' });
  mountPage(t, LINKS);
  loadSnippet(t, 'schedule-groups', { GROUPS: ['Developer time:'] });
  assert.equal(t.document.getElementById('mp-schedule-groups'), null);
});

test('a group can carry a description shown under its heading, left aligned', () => {
  const { t } = start({ GROUPS: [{ starts: 'Developer time:', text: 'Async work on your site.' }, 'Meeting:'] });
  const groups = Array.from(t.document.querySelectorAll('#mp-schedule-groups .mp-group'));
  assert.equal(groups[0].querySelector('.mp-group-title').textContent, 'Developer time');
  assert.equal(groups[0].querySelector('.mp-group-text').textContent, 'Async work on your site.');
  assert.equal(groups[1].querySelector('.mp-group-text'), null);
  const css = Array.from(t.document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
  assert.match(css, /\.mp-group-title \{[^}]*text-align: left/);
  assert.match(css, /\.mp-group-text \{[^}]*text-align: left/);
});

const RETAINER_LINKS = LINKS.concat([scheduler('t1', 'Retainer: 2h against your balance', 120)]);
const FILTERED = [
  'Developer time:',
  { starts: 'Retainer:', onlyFor: { Tier: 'Retainer' } },
  'Meeting:'
];

test('a group with onlyFor shows only to clients whose custom fields match', () => {
  const t = boot({ html: PAGE, route: '/meetings/schedulers',
    customValues: [{ mappingKey: 'ClientType', value: 'TEST' }, { mappingKey: 'Tier', value: 'retainer' }] });
  mountPage(t, RETAINER_LINKS);
  loadSnippet(t, 'schedule-groups', { GROUPS: FILTERED });
  assert.deepEqual(headings(t), ['Developer time', 'Retainer', 'Meeting', 'Other']);
  assert.deepEqual(namesUnder(t, 'Retainer'), ['2h against your balance']);
});

test('links of a group the client may not see are hidden rather than shown under Other', () => {
  const { t } = start({ GROUPS: FILTERED }, RETAINER_LINKS);
  assert.deepEqual(headings(t), ['Developer time', 'Meeting', 'Other']);
  assert.deepEqual(namesUnder(t, 'Other'), ['Retainer clients - an hour']);
});

test('when filters leave nothing to show, the page says so instead of showing the hidden links', () => {
  const { t } = start({ GROUPS: [{ starts: 'Retainer:', onlyFor: { Tier: 'Retainer' } }] },
    [scheduler('t1', 'Retainer: 2h', 120)]);
  assert.equal(t.document.querySelector('.scheduler-grid').style.display, 'none');
  assert.deepEqual(headings(t), []);
  assert.equal(t.document.querySelector('#mp-schedule-groups .mp-empty').textContent, 'No meeting schedulers available');
});

test('a group with notFor is hidden from clients whose custom fields match it', () => {
  const groups = [{ starts: 'Developer time:', notFor: { Tier: 'Retainer' } }, 'Meeting:'];
  const retainer = boot({ html: PAGE, route: '/meetings/schedulers',
    customValues: [{ mappingKey: 'ClientType', value: 'TEST' }, { mappingKey: 'Tier', value: 'retainer' }] });
  mountPage(retainer, LINKS);
  loadSnippet(retainer, 'schedule-groups', { GROUPS: groups });
  assert.deepEqual(headings(retainer), ['Meeting', 'Other']);
  assert.deepEqual(namesUnder(retainer, 'Other'), ['Retainer clients - an hour']);

  const { t: other } = start({ GROUPS: groups });
  assert.deepEqual(headings(other), ['Developer time', 'Meeting', 'Other']);
});
