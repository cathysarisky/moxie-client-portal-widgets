# Moxie portal snippets

Drop-in customisations for the [Moxie](https://www.withmoxie.com) client portal. One parent script does the plumbing; small snippets add the widgets and restyling you want on top. Everything is plain JavaScript pasted into Moxie's portal settings. There is no build step and nothing to host.

| Snippet | What it does |
|---|---|
| `sidebar-restyle` | Recolours the left menu and optionally hides the workspace logo. |
| `nav-tasks-link` | Adds a **Tasks** menu item that opens the client's task board. |
| `home-waiting` | Home card listing the tasks that are waiting on the client. |
| `home-recent` | Home card showing the latest comment or change on each task. |
| `home-requests` | Replaces the Home Requests card with every open ticket for the client. |
| `home-projects` | Replaces the Home "Projects" card with the client's actual projects. |

## Requirements

- A Moxie workspace whose client portal settings include the **JavaScript embed code** box (Settings > Client Portal > Advanced).
- A way to look at the portal as a client: sign in as a portal contact, or use **Preview as contact** on a client's Portal access tab.

## Install

1. Open `core/moxie-portal.js` and edit the two settings at the top (see [Parent settings](#parent-settings)).
2. In Moxie, go to **Settings > Client Portal > Advanced > JavaScript embed code**.
3. Paste the whole parent script.
4. Below it, paste each snippet you want from `snippets/`. Order among snippets does not matter, but the parent must come first.
5. Save, then open the portal as a client to check.

To paste one file instead of several, build it:

```sh
./build.sh > dist/portal.js                                                  # parent + every snippet
./build.sh snippets/sidebar-restyle.js snippets/home-requests.js > dist/portal.js
```

## Parent settings

Both live at the top of `core/moxie-portal.js`.

**`CLIENT_FILTER`** decides which clients see the snippets. It maps client custom-field *mapping keys* to required values. A client passes when every entry matches; case and surrounding spaces are ignored.

```js
var CLIENT_FILTER = null;                                   // every client
var CLIENT_FILTER = { ClientType: 'Retainer' };             // one field
var CLIENT_FILTER = { ClientType: 'Retainer', Tier: 'A' };  // several fields, all must match
```

The mapping key is the field's identifier in Moxie's client custom-field settings. It is the same name merge tags use, so a field you reference as `{{Client.Custom.ClientType}}` has the mapping key `ClientType`.

**`WAITING_STATUSES`** lists the task status labels that mean "the client needs to act". The Waiting on you card shows those tasks and the Projects card counts them. Labels must match the status names in your project types, apart from case.

```js
var WAITING_STATUSES = ['Wait on client', 'Ready for approval'];
```

## Snippets

Each snippet has its editable text and settings at the top of its file.

### sidebar-restyle

Recolours the left menu, and the brand area above it on wider screens, and optionally hides the logo.

| Setting | Default | Meaning |
|---|---|---|
| `SIDEBAR_COLOR` | `'#1B5E20'` | Menu background |
| `ACTIVE_STRIPE` | `'#A5D6A7'` | Marker beside the selected menu item |
| `HIDE_LOGO` | `true` | Hide the workspace logo above the menu |

### nav-tasks-link

Adds a **Tasks** item right after **Projects** in the left menu. It opens the task board of the client's first active project, follows the menu's collapsed mode, and is highlighted while the board is showing, with the Projects item un-highlighted at the same time. Nothing is added when the client has no active project.

| Setting | Default | Meaning |
|---|---|---|
| `TASKS_LABEL` | `'Tasks'` | Menu text and tooltip |

### home-waiting

Top row of Home. Lists tasks whose status is in `WAITING_STATUSES`, soonest due first, each with its status colour, project and due date. Clicking a task opens the task side panel, and the cards refresh when it closes. A footer links to each project's task board. Hidden when projects are turned off for the client.

| Setting | Default |
|---|---|
| `TITLE` | `'Waiting on you'` |
| `EMPTY` | `'Nothing is waiting on you right now.'` |
| `BOARD_LINK` | `'View whole task board'` |

### home-recent

Top row of Home, beside Waiting on you. For each task, the newest public comment or change made by someone other than the viewer within the last `DAYS` days, newest first. Clicking opens the task side panel.

| Setting | Default |
|---|---|
| `TITLE` | `'Recently updated'` |
| `DAYS` | `14` |
| `EMPTY` | `'No updates in the last 14 days.'` |
| `MAX_ROWS` | `5` |

### home-requests

Replaces Moxie's own Requests card, which lists only tickets the viewer filed, is assigned to or is copied on, with every open ticket for the client, most recently updated first. Each row shows the ticket number, its status with the status colour, "New reply" when there is an unread reply, and when it was last updated. The arrow in the header opens the Requests page. Hidden when tickets are turned off for the client.

| Setting | Default |
|---|---|
| `TITLE` | `'Requests'` |
| `EMPTY` | `'No open requests.'` |
| `MAX_ROWS` | `5` |

### home-projects

Replaces Moxie's own "Projects" card, which actually lists tasks awaiting approval, with the client's active projects in alphabetical order. Each row shows the lifecycle when it is not Active, the due date, and how many tasks are waiting on the client. Clicking opens the project, on its task board when the client can see tasks. Hidden when the client has no active project.

| Setting | Default |
|---|---|
| `TITLE` | `'Projects'` |
| `MAX_ROWS` | `5` |

**How Home cards are placed.** Top-row cards sit side by side above Moxie's own dashboard. Main cards take the place of the built-in card they name when that card is showing; otherwise they form a row of their own. A card appears only once its data has loaded, so nothing shows half-filled, and the cards are rendered again each time the viewer arrives on Home.

## Writing your own snippet

A snippet is a self-contained function registered with `MoxiePortal.ready`. It runs when the viewer's client passes `CLIENT_FILTER`, and runs again whenever the viewer switches to another client that passes. Styles, hooks and Home cards registered during a run are removed automatically when that happens; return a function if there is anything else to undo.

```js
(function () {
  var GREETING = 'Welcome back';

  MoxiePortal.ready(function (portal) {
    portal.home.mount({
      id: 'mp-hello',
      slot: 'top',
      render: function () {
        var card = portal.card({ title: GREETING, icon: portal.icons.folder });
        card.appendChild(portal.empty('Signed in as ' + (portal.user().email || 'you')));
        return card;
      }
    });
  });
})();
```

Register styles, hooks and cards while your function runs, or from a promise that resolves soon after. A registration that arrives after the viewer has already switched to a different client is dropped rather than carried over, so nothing from one client leaks into another.

The bundled files stick to ES5 (`var`, `function`) so they paste anywhere without a build step. Your own snippets can use whatever JavaScript your clients' browsers support. A snippet that throws is logged to the browser console as `[MoxiePortal] snippet failed` and does not stop the others.

### The `portal` object

**App access**

| Member | Meaning |
|---|---|
| `portal.store`, `portal.router` | The portal's Vuex store and Vue router |
| `portal.go(path)` | Navigate, e.g. `portal.go('/requests')` |
| `portal.clientId()` | The current client's id |
| `portal.clientValues()` | Client custom fields as `{ mappingKey: value }` |
| `portal.user()` | The signed-in contact: `id`, `firstName`, `lastName`, `email` |
| `portal.features()` | Portal feature flags such as `projectsEnabled` and `ticketsEnabled` |
| `portal.api(path)` | GET a portal API path for the current client, e.g. `portal.api('/projects')`. Resolves the JSON; rejects with `HTTP <status>` |

**Hooks** (removed automatically when the client changes)

| Member | Meaning |
|---|---|
| `portal.onRoute(fn)` | `fn(to, from)` after each navigation |
| `portal.onDom(fn)` | `fn()` at most once per frame after the page changes |

**Styling**

| Member | Meaning |
|---|---|
| `portal.style(css)` | Adds a stylesheet; removed automatically |

**Data** (cached per client; each returns a Promise)

| Member | Meaning |
|---|---|
| `portal.data.projects()` | All projects |
| `portal.data.projectTypes()` | Project types with their status lists |
| `portal.data.tasks()` | Tasks the viewer may see, as `{ task, project, status, statusList }` |
| `portal.data.waitingTasks()` | Tasks in a `WAITING_STATUSES` status, soonest due first |
| `portal.data.tickets()` | Open tickets, newest activity first |
| `portal.data.ticketSettings()` | Ticket types, including status colours |
| `portal.data.refresh()` | Forget cached data |

**Tasks**

| Member | Meaning |
|---|---|
| `portal.tasks.visible(project)` | Whether the portal shows this project's tasks |
| `portal.tasks.open(item)` | Open the side panel for a `tasks()` item; Home cards refresh when it closes |

**UI helpers**

| Member | Meaning |
|---|---|
| `portal.card({ title, icon, count, openPath })` | A card with a header; `openPath` adds an arrow button that navigates there |
| `portal.row(title, meta, dotColor, onClick)` | A clickable list row in the portal's own style |
| `portal.empty(text)` | Muted "nothing here" text |
| `portal.footer(text, onClick)` | Full-width link at the bottom of a card |
| `portal.el(tag, className, text)`, `portal.svg(paths, size)`, `portal.button(className, onClick)` | Element builders |
| `portal.icons` | Lucide icon paths: `tasks`, `folder`, `chevron`, `arrow`, `ticket`, `history`, `listChecks` |
| `portal.timeAgo(ms)`, `portal.formatDue(date)`, `portal.norm(s)` | Formatting helpers |

**Home cards**

| Member | Meaning |
|---|---|
| `portal.home.mount({ id, slot, replaces, render })` | `slot` is `'top'` or `'main'`. `replaces` (main only) names the built-in card to replace: `'Tickets'` or `'Deliverables'`. `render()` returns an element, a Promise of one, or `false` to hide the card |
| `portal.home.refresh()` | Re-fetch data and render every mounted card again |

## How it works, and what could break

The portal is a Vue 2 application. The parent reads its store and router through `#app.__vue__` and fetches data from the same internal endpoints the portal itself uses, under `/api/v1/{account}/portal/{client}/`, with the session's own token. None of this is a documented Moxie API, so a portal update can rename an element, a component or an endpoint and break a snippet. Failures are quiet: the snippet logs a warning in the browser console and the others keep working.

Load the portal sparingly while testing. Moxie's sign-in service blocks an address that loads the portal roughly fifteen times in five minutes, for a couple of minutes, and that includes your own browser.

## Development

```sh
npm install
npm test        # syntax-checks every file, then runs the parent's jsdom tests
./build.sh      # prints parent + snippets to stdout
```

Tests cover the parent script. Snippets are checked by hand in the portal.

## License

MIT. Copyright (c) 2026 Cathy Sarisky, [Spectral Web Services](https://spectralwebservices.com).
