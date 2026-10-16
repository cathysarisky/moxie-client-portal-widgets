# Moxie portal customisations as a parent script plus snippets

Date: 2026-10-15
Status: approved in conversation, awaiting review of this document

## Goal

Turn the three portal scripts in this repo (`portal-custom.js`, `portal-tasks-link.js`,
`portal-home.js`) into something other Moxie users can adopt piecemeal: one parent
script that every user pastes, plus independent snippets they paste only if they want
that widget or restyle. New snippets will be added over time, so the parent must carry
everything two or more snippets would otherwise duplicate.

Moxie exposes a single custom-JavaScript box per workspace at
Settings > Client Portal > Advanced > JavaScript embed code. Its contents are injected
as one inline `<script>` after a contact signs in. "Pasting" therefore means appending
text to that box; the parent goes first, snippets follow in any order.

## Non-goals

- Hosting the scripts on a CDN or loading them remotely.
- Supporting a parent pasted *after* a snippet. The README says parent first.
- A test harness for the snippets themselves. They are verified by hand in the portal.
- Any change to what the current widgets show. Behaviour is preserved except where
  this document says otherwise.

## Current duplication (what moves into the parent)

| Concern | custom | tasks-link | home |
|---|---|---|---|
| Poll for `#app.__vue__` store and router | yes | yes | yes |
| Read client custom values, gate on `ClientType === 'TEST'` | yes | yes | yes |
| `norm()` helper | yes | yes | yes |
| Store watch on client id + type | yes | yes | yes |
| `router.afterEach` + MutationObserver debounced to a frame | | yes | yes |
| Portal API fetch with pod URL, account, client, bearer token | | yes | yes |
| Style injection | yes | yes | yes |
| DOM helpers `el`, `svg`, `button`, Lucide paths, `timeAgo` | | | yes |
| Load projects, project types, deliverables, tickets | | partly | yes |
| Place cards on Home, hide built-in cards, survive re-renders | | | yes |

## Architecture

```
core/moxie-portal.js          the parent; defines window.MoxiePortal
snippets/sidebar-restyle.js   green sidebar, hidden logo (was portal-custom.js)
snippets/nav-tasks-link.js    Tasks menu item (was portal-tasks-link.js)
snippets/home-waiting.js      "Waiting on you" card
snippets/home-recent.js       "Recently updated" card
snippets/home-requests.js     "Requests" card with every open ticket
snippets/home-projects.js     real "Projects" card
build.sh                      concatenates parent + chosen snippets to stdout
test/core.test.js             jsdom tests for the parent
package.json                  devDependency jsdom, `npm test` runs node --test
README.md                     for other Moxie users
```

The three existing root-level scripts are deleted; git history keeps them.
`dist/` is added to `.gitignore` for build output.

Naming: the global is `MoxiePortal`. CSS classes and element ids use the prefix
`mp-`; html attributes use `data-mp-*`. The `swc` prefix disappears.

## Parent script: `core/moxie-portal.js`

### Configuration (top of file)

```js
var CLIENT_FILTER = { ClientType: 'TEST' }; // null = every client
var WAITING_STATUSES = ['Wait on client', 'Ready for approval'];
```

`CLIENT_FILTER` maps client custom-field mapping keys to required values. A client
passes when every listed key matches after trimming and lower-casing. `null` passes
everyone. `WAITING_STATUSES` is the list of task status labels that mean "the client
has to act"; it lives here because two cards use it.

### Start-up

1. Guard: `if (window.MoxiePortal) return;`
2. Inject the shared card CSS (section "Shared CSS") once.
3. Define `window.MoxiePortal = { ready: fn }` immediately, so snippets pasted below
   can register even before the app is found.
4. Poll every 100 ms, up to 100 tries, for `document.querySelector('#app').__vue__`
   having `$store`, `$router` and a truthy `$store.getters.getClientId`.
5. Install one `router.afterEach` and one `MutationObserver` on `document.body`
   (childList, subtree) debounced with `requestAnimationFrame`.
6. Watch `store.getters.getClientId + '|' + JSON.stringify(customValues)`. On change
   run the deactivate/activate cycle below. Run it once at start.

### Activation lifecycle

A snippet registers with `MoxiePortal.ready(fn)`. The parent keeps the list.

- **Activate** happens when the app is found and the current client passes
  `CLIENT_FILTER`, and again after every client change that passes. For each registered
  `fn`, the parent calls `fn(portal)` inside try/catch (a failing snippet logs
  `console.warn('[MoxiePortal] snippet failed', err)` and does not stop the others).
  If `fn` returns a function it is stored as that snippet's cleanup.
- **Deactivate** happens on every client change and when the client stops passing the
  filter. The parent calls each stored cleanup, then removes everything registered
  during the activation: styles added with `portal.style`, hooks added with
  `portal.onRoute` / `portal.onDom`, and cards mounted with `portal.home.mount`.
  Then it clears the data cache.
- `ready(fn)` called while already active runs `fn` immediately as part of the current
  activation, so order among snippets does not matter.

Snippets therefore never check the filter or watch the client themselves.

### The `portal` object

One object, passed to every snippet. Grouped by purpose.

**App access**
- `store`, `router`: the Vue instances.
- `go(path)`: `router.push(path)` with the rejection swallowed.
- `clientId()`: `store.getters.getClientId`.
- `clientValues()`: `{ mappingKey: value }` from `store.state.clientPortalContext.client.customValues`.
- `user()`: `store.state.loggedInUser || {}`.
- `features()`: `store.getters.getFeatures || {}`.
- `api(path)`: GET `getPodUrl + 'api/v1/' + getAccountId + '/portal/' + getClientId + path`
  with `Authorization: Bearer <store.state.accessToken>`; resolves JSON, rejects on
  non-2xx with `Error('HTTP <status>')`.

**Change hooks** (removed automatically on deactivation)
- `onRoute(fn)`: `fn(to, from)` after each navigation, in a `setTimeout(0)` so the
  portal has rendered.
- `onDom(fn)`: `fn()` at most once per animation frame after any DOM mutation.

**Styling**
- `style(css)`: appends a `<style>` to `<head>`; removed on deactivation.

**Cached data** (`portal.data.*`, each returns a Promise, memoised per activation)
- `projects()`: raw array from `/projects`. `[]` when `features().projectsEnabled` is false.
- `projectTypes()`: raw array from `/projectTypes`. `[]` when projects disabled.
- `tasks()`: items `{ task, project, status, statusList }` for every deliverable across
  all project types where the project passes `portal.tasks.visible`, the task is not
  archived or deleted, and, when the project is `portalAccessAssignedOnly`, the viewer is
  in `assignedToList`. Deliverables are fetched per type from
  `/deliverables?projectTypeId=<id>`.
- `waitingTasks()`: `tasks()` whose status label is in `WAITING_STATUSES`
  (case-insensitive), sorted by due date ascending (missing dates last) then name.
- `tickets()`: `/tickets?open=true` filtered to `open !== false && !archived`, sorted by
  `updated` descending. `[]` when `features().ticketsEnabled` is false.
- `ticketSettings()`: raw array from `/tickets/settings` (ticket types with
  `statusColors`). `[]` when tickets disabled.
- `refresh()`: clears the cache so the next call refetches.

A rejected fetch rejects the getter; the cached rejection is dropped so the next call
retries.

**Tasks** (`portal.tasks.*`)
- `visible(project)`: the portal's own rule, `project.active` and `portalAccess` of
  "Full access" or "Read only" and lifecycle not PAUSED or CANCELED.
- `open(item)`: fetches `/deliverables/<id>` and opens the side panel via
  `store.state.globalModalController.openModal({ name: 'DeliverableDetail' },
  { origDeliverable, project, statusList, subtasks: [] }, true, false, 'right-panel')`.
  Resolves when the panel closes. If the fetch or modal fails it navigates to
  `/projects/<projectId>?v=tasks` instead. After the panel closes the parent calls
  `data.refresh()` and re-renders mounted home cards.

**DOM and formatting helpers** (flat on `portal`)
- `el(tag, className, text)`, `svg(paths, size)`, `button(className, onClick)`:
  as in today's `portal-home.js`.
- `card({ title, icon, count, openPath })`: returns `<section class="mp-card">` with a
  header containing the icon, title, count badge and, when `openPath` is given, an arrow
  button that navigates there.
- `row(title, meta, dotColor, onClick)`: a `portal-action-row` button with title,
  optional meta line and optional status dot.
- `empty(text)`: `<p class="mp-empty">`.
- `footer(text, onClick)`: the full-width footer button used for "View whole task board".
- `norm(s)`, `timeAgo(ms)`, `formatDue(value)` (returns `'Due Mon D'` using
  `store.state.locale`, or `null`).
- `icons`: `{ tasks, folder, chevron, arrow, ticket, history, listChecks }` Lucide path
  strings.

**Home page** (`portal.home.*`)
- `mount({ id, slot, replaces, render })`
  - `id`: element id, unique per card, e.g. `mp-waiting`.
  - `slot`: `'top'` (the side-by-side row above the dashboard) or `'main'` (inside the
    portal's dashboard, or in a fallback grid when the portal shows none).
  - `replaces` (main only, optional): the Vue component name of a built-in card to
    hide and sit after: `'Tickets'` (built-in Requests card) or `'Deliverables'`
    (built-in "Projects" card, which is really tasks awaiting approval).
  - `render()`: returns the card element (normally built with `portal.card`), or a
    Promise of one. Returning `false` means "do not show this card". The parent sets
    the element's id and `mp-card` class.

Mounting behaviour, owned by the parent:

- Home is `router.currentRoute.path === '/welcome'` with a `.welcome-page` element.
  Off Home, all mounted cards are removed and hidden built-ins unhidden.
- A **home refresh** happens on activation while on Home, on navigation to Home, and
  after `tasks.open` resolves. It calls `data.refresh()`, then for every mounted card
  calls `render`, and on resolution swaps the returned element into place of the
  previous node (or drops the card if `render` resolved `false` or
  rejected, logging a warning). Cards never show empty or half-filled.
- The `top` row is `<div id="mp-top">` inserted before the first of
  `.action-dashboard, .dashboard-loading, .dashboard-state, .upcoming-dashboard`
  (appended to `.welcome-page` when none is present). Cards sit in registration order. The row is removed when it has no cards.
- `main` cards: when `:scope > .action-dashboard` exists, a card whose `replaces`
  built-in is found gets that built-in marked `data-mp-hidden` and sits right after it;
  otherwise it sits after the previously mounted main card, or at the start of the
  dashboard when it is the first. When there is no dashboard, main cards go into
  `<div id="mp-grid">` placed after the top row (or before the anchor when there is no
  top row), in registration order. The grid is removed when it has no cards.
- Built-in cards are found as today: walk `.portal-action-card` children of the
  dashboard and match `vm.$options.name === replaces && !vm.taskMode`.
- The `onDom` observer re-asserts placement (re-insert detached cards, re-hide
  built-ins) without re-rendering.

### Shared CSS

The `.swc-card` rules from `portal-home.js` move to the parent as `.mp-card`,
`.mp-head`, `.mp-title`, `.mp-icon`, `.mp-count`, `.mp-open`, `.mp-list`, `.mp-dot`,
`.mp-empty`, `.mp-footer`, plus the `#mp-top` / `#mp-grid` grid rules and
`[data-mp-hidden] { display: none !important; }`. The two-line clamp for the recent
card's meta stays in that snippet.

## Snippets

Every snippet is an IIFE with its editable constants at the top, then
`MoxiePortal.ready(function (portal) { ... })`. Behaviour is identical to today unless
noted.

**sidebar-restyle.js** (constants `SIDEBAR_COLOR`, `ACTIVE_STRIPE`, `HIDE_LOGO`)
Calls `portal.style` with the sidebar background, active-stripe colour, hidden
`.brand-logo`, and the `.brand-zone` background at `min-width: 600px`. Because
activation already implies the client matches, no html attribute gate is needed.
Change: `HIDE_LOGO` becomes a boolean so users who only want the colour can keep their logo.

**nav-tasks-link.js** (constants `TASKS_LABEL`)
On activation loads `data.projects()`, picks the first `active` project, and keeps a
cloned Projects nav button labelled Tasks (icon `icons.listChecks`) inserted after the
Projects button, following collapsed mode, active when on `/projects/<id>?v=tasks`.
Registers `onDom` and `onRoute` to re-sync. Its "un-highlight Projects while on Tasks"
CSS is added with `portal.style` using `html[data-mp-tasks-active]`. Returns a cleanup
that removes the button and attribute.

**home-waiting.js** (constants `TITLE`, `EMPTY`, `BOARD_LINK`)
Mounts in `top`. Render: `data.waitingTasks()` and `data.projects()`; header with
`icons.tasks` and the count, no open arrow; rows with meta `status · project · due`
and the status colour dot, clicking calls `tasks.open(item)`; a footer per visible
project linking to its board, naming the project only when there is more than one.
Resolves `false` when `features().projectsEnabled` is false.

**home-recent.js** (constants `TITLE`, `DAYS`, `EMPTY`, `MAX_ROWS`)
Mounts in `top`. Render: `data.tasks()` and `user()`; the `latestActivity`,
`tidyName`, `plainText`, `truncate` logic stays here; rows show `who what · ago`
and open the task panel. Resolves `false` when projects are disabled.

**home-requests.js** (constants `TITLE`, `EMPTY`, `MAX_ROWS`)
Mounts in `main`, `replaces: 'Tickets'`. Render: `data.tickets()` and
`data.ticketSettings()`; header arrow to `/requests`; rows with meta
`#number · status · New reply · updated ago`, status dot colour from ticket settings
(falls back to `var(--v-accent-base)`), clicking goes to `/requests/<id>`. Resolves
`false` when tickets are disabled.

**home-projects.js** (constants `TITLE`, `MAX_ROWS`)
Mounts in `main`, `replaces: 'Deliverables'`. Render: `data.projects()` filtered to
active and sorted by name, plus `data.waitingTasks()` for the per-project waiting
count; header arrow to `/projects`; rows with meta `lifecycle · due · N waiting on you`,
clicking goes to `/projects/<id>` with `?v=tasks` when `tasks.visible(p)`. Resolves
`false` when there are no active projects or projects are disabled.

## build.sh

```sh
#!/bin/sh
# Usage: ./build.sh [snippet files...] > dist/portal.js   (default: all snippets)
```
Concatenates `core/moxie-portal.js` then the given snippet files (default
`snippets/*.js`) to stdout, separated by a blank line. No minification.

## Testing

- `npm test` runs `node --test test/` after `node --check` on every file in `core/`
  and `snippets/`.
- `test/core.test.js` loads `core/moxie-portal.js` into a jsdom window
  (`runScripts: 'outside-only'`, `pretendToBeVisual: true`) whose `#app` element has a
  fake `__vue__` with `$store` (state, getters, `watch` that the test can trigger) and
  `$router` (`currentRoute`, `push`, `afterEach`), and a stub `fetch` that records URLs
  and returns canned JSON. It asserts:
  - a snippet registered before and after the app is found both run once;
  - a client that fails `CLIENT_FILTER` never activates; passing after a change does;
  - `data.projects()` called twice fetches once; `refresh()` fetches again;
  - client change runs cleanup, removes a `portal.style` element and a mounted card;
  - `home.mount` places a `top` card before the dashboard anchor, a `main` card with
    `replaces` after the hidden built-in, and drops a card whose render resolves `false`;
  - a snippet that throws does not prevent the next snippet from running.
- Snippets are checked by hand on the live portal using "Preview as contact", keeping
  loads few and spaced out because auth.withmoxie.com blocks an address after roughly
  fifteen loads in five minutes.

## README outline

Audience: Moxie users who want to drop these into their own portal, some of whom will
write snippets.

1. What this is, in a paragraph, with a list of the snippets.
2. Requirements: a Moxie workspace whose client portal settings include the JavaScript
   embed box.
3. Install: Settings > Client Portal > Advanced > JavaScript embed code; paste the
   parent first, then each wanted snippet; or run `build.sh` and paste the output.
4. Configure the parent: `CLIENT_FILTER` and `WAITING_STATUSES`, with examples.
5. One section per snippet: what it shows, its constants.
6. Writing your own snippet: the `portal` API reference and a ten-line example.
7. How it works and caveats: uses undocumented portal internals (Vue 2 store, internal
   `/api/v1/.../portal/...` endpoints) that Moxie may change; test with
   "Preview as contact"; the portal's firewall rate limit.
8. Development: `npm install`, `npm test`, `build.sh`.
