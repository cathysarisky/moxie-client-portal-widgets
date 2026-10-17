# "Billing" Home Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paste-in Home card that mirrors the portal's Invoices > Reports tiles, adds the hours Moxie has not yet invoiced, and shows the client's net position as a credit or a balance due.

**Architecture:** One new snippet, `snippets/home-billing.js`, registered through `portal.home.mount({ name: 'billing' })` like the other `home-*.js` cards. It fetches `/invoices`, `/deposits` and `/timer` with `portal.api()`, does the arithmetic in plain functions inside the snippet's IIFE, and renders three stacked sections with a small `.mp-stats` grid style. The parent gains a receipt icon and two formatters, `money` and `hours`, that any later snippet can reuse.

**Tech Stack:** ES5 browser JavaScript (no build step), Node `node:test` + jsdom via `test/helpers.js`.

**Spec:** `docs/superpowers/specs/2026-10-17-home-billing-card-design.md`

## Global Constraints

- Browser files are ES5: `var`, `function`, no arrow functions, no template literals, no `const`/`let`, no `Promise.prototype.finally`.
- CSS classes and element ids use the `mp-` prefix; HTML attributes use `data-mp-*`.
- Snippet settings are top-level `var NAME = value;` lines at the top of the IIFE, each on its own line (that is what `loadSnippet` rewrites), with comments written for non-programmers.
- Every snippet ends with `MoxiePortal.ready(fn, { onlyFor: ONLY_FOR })` and `var ONLY_FOR = null;`.
- `npm test` runs `node --check` on every `core/` and `snippets/` file, then all `test/*.test.js`; it must stay green at every commit.
- Money is formatted in `store.state.defaultCurrency` (default `'USD'`) with `store.state.locale` (default `'en-US'`); the card never mixes per-invoice currencies.
- Invoice totals use the Reports tab's status set: `SENT`, `PARTIAL`, `PAID`, `WRITE-OFF`. Unpaid means status `SENT` or `PARTIAL`.
- Un-billed time means `billingStatus === 'UN-BILLED'` (fallback: no `invoiceId` when `billingStatus` is absent) and `billable !== false`. Priced means `billingRate` is a finite number greater than 0.
- The unbilled estimate is rounded to cents once, after summing; the net uses the rounded estimate so the displayed numbers add up.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not push.

## Review Focus

1. A `/deposits` call that fails (404 or 500) or returns `null`/`{}`: the card must still render the invoice and time sections with no deposit rows. Test in Task 2.
2. An invoice with status `DRAFT`, `PENDING` or `VOIDED`: excluded from every total and from the unpaid count, even when `amountDue` is non-zero. Test in Task 2.
3. A time entry with `billable: false` or with `billingStatus` missing but `invoiceId` set: never counted as unbilled. Test in Task 3.
4. A client with time on but invoices off (or the reverse): the missing section is skipped, the net still renders from what is left, and the header arrow points at a page the client can open. Test in Task 4.
5. Rounding drift: three entries of 1 s at $100/h must display an estimate and a net that agree to the cent with each other. Test in Task 4.

---

### Task 1: Parent helpers `money`, `hours` and the receipt icon

**Files:**
- Modify: `core/moxie-portal.js` (ICONS block near line 44; helper functions near `timeAgo`; the `portal = { ... }` object near line 541)
- Modify: `README.md` ("UI helpers" table under "### The `portal` object": the `portal.icons` row and the formatting-helpers row)
- Test: `test/core.test.js`

**Interfaces:**
- Produces: `portal.money(amount)` → string, e.g. `'$68.00'`; `portal.hours(seconds)` → `'h:mm'` string, e.g. `'0:05'`; `portal.icons.receipt` → Lucide `receipt-text` path string.

- [ ] **Step 1: Start the branch and commit the spec**

```bash
git checkout -b feature/home-billing
git add docs/superpowers/specs/2026-10-17-home-billing-card-design.md docs/superpowers/plans/2026-10-17-home-billing-card.md
git commit -m "Add design and plan for the Billing Home card"
```

- [ ] **Step 2: Write the failing tests** (append to `test/core.test.js`, after the `timeAgo and formatDue` test)

```js
test('money formats in the store currency and locale', () => {
  const t = withPortal();
  const p = t.portal;
  assert.equal(p.money(68), '$68.00');
  assert.equal(p.money(1234.5), '$1,234.50');
  assert.equal(p.money(0), '$0.00');
  assert.equal(p.money(-5), '-$5.00');
  t.store.state.defaultCurrency = 'EUR';
  assert.equal(p.money(68), '€68.00');
  t.store.state.defaultCurrency = 'NOT_A_CODE';
  assert.equal(p.money(68), '$68.00');
});

test('hours formats seconds as h:mm, rounding to the minute', () => {
  const p = withPortal().portal;
  assert.equal(p.hours(300), '0:05');
  assert.equal(p.hours(1140), '0:19');
  assert.equal(p.hours(5400), '1:30');
  assert.equal(p.hours(36000), '10:00');
  assert.equal(p.hours(29), '0:00');
  assert.equal(p.hours(31), '0:01');
  assert.equal(p.hours(0), '0:00');
  assert.equal(p.hours(null), '0:00');
});

test('the receipt icon exists', () => {
  const p = withPortal().portal;
  assert.match(p.icons.receipt, /<path/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/core.test.js`
Expected: the three new tests FAIL with `p.money is not a function`, `p.hours is not a function`, and an `undefined` match.

- [ ] **Step 4: Implement in `core/moxie-portal.js`**

Add to `ICONS`:
```js
receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>'
```

Inside `start(store, router)`, next to `formatDue`, add `function money(amount)`: `new Intl.NumberFormat(store.state.locale || undefined, { style: 'currency', currency: store.state.defaultCurrency || 'USD' }).format(Number(amount) || 0)` inside `try`, falling back to `'$' + (Number(amount) || 0).toFixed(2)` on any throw.

Next to it, outside `start` (it needs nothing from the app), add `function hours(seconds)`: `var mins = Math.round((Number(seconds) || 0) / 60)`, then `Math.floor(mins / 60) + ':' + (two-digit mins % 60)`.

Add `money: money, hours: hours` to the `portal = { ... }` object on the line with `timeAgo`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, including the three new ones.

- [ ] **Step 6: Document the helpers in `README.md`**

In the "UI helpers" table: add `receipt` to the `portal.icons` list, and change the formatting row to `portal.timeAgo(ms)`, `portal.formatDue(date)`, `portal.money(amount)`, `portal.hours(seconds)`, `portal.norm(s)` with one phrase each: money is "in the workspace currency", hours is "seconds as `h:mm`".

- [ ] **Step 7: Commit**

```bash
git add core/moxie-portal.js test/core.test.js README.md
git commit -m "Add money, hours and receipt icon to the parent script"
```

---

### Task 2: Snippet skeleton with the "Invoices" section

**Files:**
- Create: `snippets/home-billing.js`
- Test: `test/home-billing.test.js`

**Interfaces:**
- Consumes: `portal.api`, `portal.features`, `portal.home.mount`, `portal.card`, `portal.el`, `portal.empty`, `portal.style`, `portal.money`, `portal.icons.receipt`, `loadSnippet(t, 'home-billing', settings)` from `test/helpers.js`.
- Produces, for Tasks 3 and 4: inside the IIFE, `function load(portal)` returning a Promise of `{ invoices: [], deposits: object|null, entries: [] }` (arrays empty and deposits `null` when the matching feature is off); `function invoiceStats(invoices, deposits)` returning `{ invoiced, paid, unpaidCount, unpaidDue, deposits }` (numbers; `deposits` is the object only when `deposits && deposits.liabilities > 0`, else `null`); `function section(portal, key, heading)` returning a `section.mp-billing-section` element with `data-mp-section="<key>"` and an `h4.mp-section-title`; `function stat(portal, list, label, value)` appending a `.mp-stat` row with `.mp-stat-label` and `.mp-stat-value` spans to a `.mp-stats` element.
- DOM contract (tests rely on it): card id `mp-billing`; sections `[data-mp-section="invoices"]`, `"unbilled"`, `"net"` in that order; rows `.mp-stats > .mp-stat > .mp-stat-label + .mp-stat-value`.

- [ ] **Step 1: Write the failing tests**

Create `test/home-billing.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, loadSnippet, tick } = require('./helpers');

const PAGE = '<div class="welcome-page"><h1>Hello</h1><div class="action-dashboard"></div></div>';

// Trimmed from the live capture of 2026-10-17 (test client, contact -64).
const DEPOSIT_INVOICE = { id: 'inv-11', invoiceNumberFormatted: 'TCW-2026-11', status: 'PAID', total: 100, itemSubtotal: 100, creditAmount: 0, paymentTotal: 100, amountDue: 0, dateSent: '2026-10-17', payments: [{ amount: 100, datePaid: '2026-10-17' }] };
const HOURS_INVOICE = { id: 'inv-13', invoiceNumberFormatted: 'TCW-2026-13', status: 'PAID', total: 0, itemSubtotal: 32, creditAmount: 32, paymentTotal: 0, amountDue: 0, dateSent: '2026-10-17', payments: [] };
const SENT_INVOICE = { id: 'inv-14', invoiceNumberFormatted: 'TCW-2026-14', status: 'SENT', total: 120, itemSubtotal: 120, creditAmount: 0, paymentTotal: 0, amountDue: 120, dateSent: '2026-10-18', payments: [] };
const PARTIAL_INVOICE = { id: 'inv-15', invoiceNumberFormatted: 'TCW-2026-15', status: 'PARTIAL', total: 200, itemSubtotal: 200, creditAmount: 0, paymentTotal: 50, amountDue: 150, dateSent: '2026-10-18', payments: [{ amount: 50, datePaid: '2026-10-19' }] };
const DRAFT_INVOICE = { id: 'inv-16', status: 'DRAFT', total: 999, paymentTotal: 0, amountDue: 999, dateSent: null, payments: [] };
const VOIDED_INVOICE = { id: 'inv-17', status: 'VOIDED', total: 500, paymentTotal: 0, amountDue: 500, dateSent: '2026-10-01', payments: [] };
const DEPOSITS = { liabilities: 100, credits: 32, balance: 68 };
const BILLED = { id: 't-billed', billable: true, billingStatus: 'BILLED', billingReason: 'INVOICED', billingRate: null, unbilledSeconds: 0, duration: 1140, invoiceId: 'inv-13', timerStart: '2026-10-17T13:50:59.697Z' };
const UNBILLED = { id: 't-open', billable: true, billingStatus: 'UN-BILLED', billingReason: 'CLIENT_HOURLY', billingRate: 100, unbilledSeconds: 300, duration: 300, invoiceId: null, timerStart: '2026-10-17T13:54:30.624Z' };

// fakeStore only sets projectsEnabled/ticketsEnabled, so turn invoices and time on unless a test says otherwise.
async function start(responses, opts = {}, settings = {}) {
  const features = Object.assign({ invoicesEnabled: true, timeEnabled: true }, opts.features);
  const t = boot(Object.assign({ html: PAGE, route: '/welcome', responses }, opts, { features }));
  loadSnippet(t, 'home-billing', settings);
  await tick();
  return t;
}
const card = (t) => t.document.getElementById('mp-billing');
const section = (t, key) => card(t).querySelector('[data-mp-section="' + key + '"]');
function stats(t, key) {
  const out = {};
  section(t, key).querySelectorAll('.mp-stat').forEach((row) => {
    out[row.querySelector('.mp-stat-label').textContent] = row.querySelector('.mp-stat-value').textContent;
  });
  return out;
}

test('mirrors the Reports tab for the live sample', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, HOURS_INVOICE], '/deposits': DEPOSITS, '/timer': [BILLED, UNBILLED] });
  assert.ok(card(t));
  assert.equal(card(t).querySelector('h3').textContent, 'Billing');
  assert.equal(section(t, 'invoices').querySelector('.mp-section-title').textContent, 'Invoices');
  assert.deepEqual(stats(t, 'invoices'), {
    'Total invoiced': '$100.00',
    'Total paid': '$100.00',
    'Unpaid invoices': 'None',
    'Deposits collected': '$100.00',
    'Deposits applied': '$32.00',
    'Balance remaining': '$68.00'
  });
});

test('counts only sent and partial invoices as unpaid and ignores draft and voided ones', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, SENT_INVOICE, PARTIAL_INVOICE, DRAFT_INVOICE, VOIDED_INVOICE], '/deposits': null, '/timer': [] });
  const s = stats(t, 'invoices');
  assert.equal(s['Total invoiced'], '$420.00');
  assert.equal(s['Total paid'], '$150.00');
  assert.equal(s['Unpaid invoices'], '2 · $270.00');
  assert.equal(s['Deposits collected'], undefined);
});

test('a failed or empty deposits call just drops the deposit rows', async () => {
  for (const deposits of [undefined, {}, { liabilities: 0, credits: 0, balance: 0 }]) {
    const responses = { '/invoices': [DEPOSIT_INVOICE], '/timer': [] };
    if (deposits !== undefined) responses['/deposits'] = deposits;
    const t = await start(responses);
    assert.ok(card(t), 'card renders');
    assert.equal(stats(t, 'invoices')['Balance remaining'], undefined);
    assert.equal(t.warns.length, 0);
  }
});

test('hides the invoices section when invoices are off, and the whole card when time is off too', async () => {
  const t = await start({ '/timer': [] }, { features: { invoicesEnabled: false, timeEnabled: true } });
  assert.ok(card(t));
  assert.equal(section(t, 'invoices'), null);
  const none = await start({}, { features: { invoicesEnabled: false, timeEnabled: false } });
  assert.equal(card(none), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/home-billing.test.js`
Expected: FAIL at `loadSnippet` with `ENOENT ... snippets/home-billing.js`.

- [ ] **Step 3: Write `snippets/home-billing.js`**

Header comment in the style of `snippets/home-requests.js`. Settings, one per line:

```js
var TITLE = 'Billing';
var INVOICES_HEADING = 'Invoices';
var UNBILLED_HEADING = 'Not yet invoiced';
var NET_HEADING = 'Where you stand';
var CREDIT_LABEL = 'Credit remaining';
var DUE_LABEL = 'Balance due';
var SETTLED_LABEL = 'All settled';
var EMPTY_UNBILLED = 'Nothing waiting to be invoiced.';
var INVOICES_LINK = 'View invoices';
var TIME_LINK = 'View time worked';
var ONLY_FOR = null;
```

Functions inside the IIFE, with the signatures from the Interfaces block:

- `load(portal)`: `Promise.all` of `invoicesEnabled ? portal.api('/invoices') : []`, `invoicesEnabled ? portal.api('/deposits').then(null, function () { return null; }) : null`, `timeEnabled ? portal.api('/timer') : []`; resolve `{ invoices, deposits, entries }` with non-arrays coerced to `[]`.
- `invoiceStats(invoices, deposits)`: the Global Constraints status sets; `deposits` kept only when `liabilities > 0`.
- `section`, `stat` as specified; the Invoices section rows in the order the first test asserts, with `'None'` for zero unpaid and `count + ' · ' + money` otherwise.
- `render(portal)`: returns `false` when neither feature is on; otherwise `load(portal).then(...)` building `portal.card({ title: TITLE, icon: portal.icons.receipt, openPath: invoicesEnabled ? '/invoices?v=list' : '/time?v=list' })`, appending the Invoices section when invoices are on. (Tasks 3 and 4 add the other sections.)
- One `portal.style(...)` call for `.mp-billing-section`, `.mp-section-title`, `.mp-stats`, `.mp-stat`, `.mp-stat-label` (muted), `.mp-stat-value` (right-aligned, tabular numbers), using the parent's `--portal-*` variables; keep it under 15 lines.
- `MoxiePortal.ready(function (portal) { portal.home.mount({ name: 'billing', render: function () { return render(portal); } }); }, { onlyFor: ONLY_FOR });`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (the Task 2 tests plus everything from before).

- [ ] **Step 5: Commit**

```bash
git add snippets/home-billing.js test/home-billing.test.js
git commit -m "Add home-billing snippet with the Invoices section"
```

---

### Task 3: "Not yet invoiced" section

**Files:**
- Modify: `snippets/home-billing.js`
- Test: `test/home-billing.test.js`

**Interfaces:**
- Consumes: `load`, `section`, `stat` from Task 2; `portal.hours`, `portal.money`, `portal.empty`.
- Produces: `function unbilledStats(entries)` returning `{ count, seconds, pricedSeconds, unpricedSeconds, estimate, oldest }` where `estimate` is rounded to cents and `oldest` is the earliest `timerStart` string or `null`; `function sinceDate(portal, iso)` returning e.g. `'Oct 17'` via `toLocaleDateString(store.state.locale, { month: 'short', day: 'numeric' })`.

- [ ] **Step 1: Write the failing tests** (append; add the fixtures `UNPRICED` and `NON_BILLABLE` beside the others)

```js
const UNPRICED = { id: 't-fixed', billable: true, billingStatus: 'UN-BILLED', billingReason: 'PROJECT_FIXED', billingRate: null, unbilledSeconds: 1800, duration: 1800, invoiceId: null, timerStart: '2026-10-15T09:00:00.000Z' };
const NON_BILLABLE = { id: 't-free', billable: false, billingStatus: 'UN-BILLED', billingReason: 'NON_BILLABLE', billingRate: 100, unbilledSeconds: 7200, duration: 7200, invoiceId: null, timerStart: '2026-10-16T09:00:00.000Z' };

test('sums un-billed hours and prices them at the rate Moxie stamped on each entry', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [BILLED, UNBILLED] });
  assert.equal(section(t, 'unbilled').querySelector('.mp-section-title').textContent, 'Not yet invoiced');
  assert.deepEqual(stats(t, 'unbilled'), { 'Hours': '0:05', 'Entries': '1 · since Oct 17', 'Estimated amount': 'about $8.33' });
});

test('names un-priced time and leaves non-billable time out', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [UNBILLED, UNPRICED, NON_BILLABLE] });
  assert.deepEqual(stats(t, 'unbilled'), { 'Hours': '0:35', 'Entries': '2 · since Oct 15', 'Estimated amount': 'about $8.33 (+ 0:30 not priced)' });
  const only = await start({ '/invoices': [], '/deposits': null, '/timer': [UNPRICED] });
  assert.equal(stats(only, 'unbilled')['Estimated amount'], 'not priced yet');
});

test('falls back to invoiceId when billingStatus is missing', async () => {
  const legacyOpen = { id: 'l1', billable: true, billingRate: 50, unbilledSeconds: 3600, duration: 3600, invoiceId: null, timerStart: '2026-10-10T09:00:00.000Z' };
  const legacyBilled = { id: 'l2', billable: true, billingRate: 50, unbilledSeconds: 3600, duration: 3600, invoiceId: 'inv-1', timerStart: '2026-10-10T09:00:00.000Z' };
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [legacyOpen, legacyBilled] });
  assert.equal(stats(t, 'unbilled')['Hours'], '1:00');
  assert.equal(stats(t, 'unbilled')['Estimated amount'], 'about $50.00');
});

test('shows the empty line when nothing is un-billed, and no section when time is off', async () => {
  const t = await start({ '/invoices': [], '/deposits': null, '/timer': [BILLED] });
  assert.equal(section(t, 'unbilled').querySelector('.mp-empty').textContent, 'Nothing waiting to be invoiced.');
  assert.equal(section(t, 'unbilled').querySelector('.mp-stat'), null);
  const off = await start({ '/invoices': [DEPOSIT_INVOICE], '/deposits': null }, { features: { timeEnabled: false } });
  assert.equal(section(off, 'unbilled'), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/home-billing.test.js`
Expected: the four new tests FAIL because `section(t, 'unbilled')` is `null`.

- [ ] **Step 3: Implement `unbilledStats`, `sinceDate`, and the section in `snippets/home-billing.js`**

`unbilledStats` filters with the Global Constraints rule (`billingStatus` when present, else `!invoiceId`; `billable !== false`), uses `unbilledSeconds` when it is a number and `duration` otherwise, prices entries whose `billingRate` is a finite number > 0 as `seconds / 3600 * billingRate`, and rounds the summed estimate with `Math.round(x * 100) / 100`. The section appends `portal.empty(EMPTY_UNBILLED)` when `count === 0`; otherwise the three rows in the order the tests assert, with the estimate text: `'about ' + money(estimate)` plus `' (+ ' + hours(unpricedSeconds) + ' not priced)'` when `unpricedSeconds > 0`, or `'not priced yet'` when `pricedSeconds === 0`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add snippets/home-billing.js test/home-billing.test.js
git commit -m "Add the Not yet invoiced section to home-billing"
```

---

### Task 4: "Where you stand" net, footers, and README

**Files:**
- Modify: `snippets/home-billing.js`
- Modify: `README.md` (new `### home-billing` section after `### home-projects`, before the "How Home cards are placed" paragraph; mention `'billing'` as a `HOME_CARDS` name)
- Test: `test/home-billing.test.js`

**Interfaces:**
- Consumes: `invoiceStats` (Task 2), `unbilledStats` (Task 3), `portal.footer`, `portal.go`.
- Produces: `function net(inv, un)` returning `{ value, label, note }` where `value = depositBalance - inv.unpaidDue - un.estimate` (deposit balance is `inv.deposits ? inv.deposits.balance : 0`), `label` is `CREDIT_LABEL` / `SETTLED_LABEL` / `DUE_LABEL` for positive / zero / negative, and `note` is the explanation string below.
- DOM: `[data-mp-section="net"]` holds `.mp-net-value` (always the absolute amount), `.mp-net-label`, `.mp-net-note`. Footers are `.mp-footer` buttons after the sections.

Note rules (exact copy):
- Parts: `'unpaid invoices ' + money(unpaidDue)` when `unpaidDue > 0`; `'unbilled work about ' + money(estimate) + ' (' + hours(pricedSeconds) + ')'` when `estimate > 0`.
- With `depositBalance > 0`: `'Deposit balance ' + money(depositBalance)` followed by `' − '` + each part (U+2212 minus).
- Without: the parts joined by `' + '`, first letter upper-cased; when there are no parts, `'Nothing outstanding.'`.
- When `unpricedSeconds > 0`, append `' · ' + hours(unpricedSeconds) + ' of unbilled time not included'`.

- [ ] **Step 1: Write the failing tests** (append)

```js
const netOf = (t) => ({
  value: section(t, 'net').querySelector('.mp-net-value').textContent,
  label: section(t, 'net').querySelector('.mp-net-label').textContent,
  note: section(t, 'net').querySelector('.mp-net-note').textContent
});
const footers = (t) => [...card(t).querySelectorAll('.mp-footer span')].map((s) => s.textContent);

test('credit remaining for the live sample', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE, HOURS_INVOICE], '/deposits': DEPOSITS, '/timer': [BILLED, UNBILLED] });
  assert.deepEqual(netOf(t), { value: '$59.67', label: 'Credit remaining', note: 'Deposit balance $68.00 − unbilled work about $8.33 (0:05)' });
  assert.deepEqual(footers(t), ['View invoices', 'View time worked']);
  assert.equal(section(t, 'net').querySelector('.mp-section-title').textContent, 'Where you stand');
});

test('balance due when unpaid invoices and unbilled work exceed the deposit', async () => {
  const t = await start({ '/invoices': [SENT_INVOICE, PARTIAL_INVOICE], '/deposits': DEPOSITS, '/timer': [UNBILLED, UNPRICED] });
  assert.deepEqual(netOf(t), { value: '$210.33', label: 'Balance due', note: 'Deposit balance $68.00 − unpaid invoices $270.00 − unbilled work about $8.33 (0:05) · 0:30 of unbilled time not included' });
});

test('balance due with no deposit reads as a sum', async () => {
  const t = await start({ '/invoices': [SENT_INVOICE], '/deposits': null, '/timer': [UNBILLED] });
  assert.deepEqual(netOf(t), { value: '$128.33', label: 'Balance due', note: 'Unpaid invoices $120.00 + unbilled work about $8.33 (0:05)' });
});

test('all settled when nothing is outstanding', async () => {
  const t = await start({ '/invoices': [DEPOSIT_INVOICE], '/deposits': null, '/timer': [BILLED] });
  assert.deepEqual(netOf(t), { value: '$0.00', label: 'All settled', note: 'Nothing outstanding.' });
});

test('net and estimate agree to the cent', async () => {
  const tiny = (id) => ({ id, billable: true, billingStatus: 'UN-BILLED', billingRate: 100, unbilledSeconds: 1, duration: 1, invoiceId: null, timerStart: '2026-10-17T10:00:00.000Z' });
  const t = await start({ '/invoices': [], '/deposits': { liabilities: 10, credits: 0, balance: 10 }, '/timer': [tiny('a'), tiny('b'), tiny('c')] });
  assert.equal(stats(t, 'unbilled')['Estimated amount'], 'about $0.08');
  assert.deepEqual(netOf(t), { value: '$9.92', label: 'Credit remaining', note: 'Deposit balance $10.00 − unbilled work about $0.08 (0:00)' });
});

test('with invoices off the net comes from time alone and the arrow opens the Time page', async () => {
  const t = await start({ '/timer': [UNBILLED] }, { features: { invoicesEnabled: false } });
  assert.deepEqual(netOf(t), { value: '$8.33', label: 'Balance due', note: 'Unbilled work about $8.33 (0:05)' });
  assert.deepEqual(footers(t), ['View time worked']);
  card(t).querySelector('.mp-open').click();
  assert.equal(t.router.currentRoute.path, '/time');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/home-billing.test.js`
Expected: the six new tests FAIL because `section(t, 'net')` is `null`.

- [ ] **Step 3: Implement `net` and the section and footers in `snippets/home-billing.js`**

`render` appends the net section after the others whenever the card renders, then `portal.footer(INVOICES_LINK, ...)` → `portal.go('/invoices?v=list')` when invoices are on and `portal.footer(TIME_LINK, ...)` → `portal.go('/time?v=list')` when time is on. `.mp-net-value` shows `money(Math.abs(value))`; treat `Math.abs(value) < 0.005` as zero. Add `.mp-net`, `.mp-net-value` (large, bold) and `.mp-net-note` (muted, small) to the snippet's style block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write the README section**

Under `### home-billing`, in the voice of the neighbouring sections: one paragraph on what the card shows (the three parts, that the estimate uses the rate Moxie stamped on each entry, that un-priced time is named rather than guessed, that the card hides when both invoices and time are off), a settings table listing every `var` from Task 2 with its default, and one sentence: add `'billing'` to `HOME_CARDS` to choose its row.

- [ ] **Step 6: Run the whole suite one last time and commit**

Run: `npm test`
Expected: PASS.

```bash
git add snippets/home-billing.js test/home-billing.test.js README.md
git commit -m "Add the Where you stand net and footers to home-billing; document it"
```

- [ ] **Step 7: Live check (Cathy's hands)**

Paste `core/moxie-portal.js` then `snippets/home-billing.js` with `ONLY_FOR = { ClientType: 'TEST' }` into Settings > Client Portal > Advanced > JavaScript embed code, open the portal as the test contact once, and compare the card with the expected numbers in the spec's "Live sample" paragraph. Keep loads few (auth firewall). Set `ONLY_FOR` back to `null` in the shipped file.
