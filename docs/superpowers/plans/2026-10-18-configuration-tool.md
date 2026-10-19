# Configuration Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page, built from this repo's snippet files and served by GitHub Pages, where a non-technical Moxie user picks snippets, fills in form fields, and copies one comment-free paste whose first line holds their settings.

**Architecture:** A Node build (`tool/build.js`) uses acorn to strip comments from `core/moxie-portal.js` and `snippets/*.js`, cut each setting's initializer into a `{{NAME}}` slot and evaluate its default, then inlines those templates, the manifest, the generator and the app into one `tool/dist/index.html`. In the browser, `generate.js` turns a JSON config into the paste (and reads it back from the paste's first line) and `app.js` renders the form from `manifest.js`, keeping the config in `localStorage`. The same `generate.js` and manifest run under Node for the tests.

**Tech Stack:** Node 22, `node:test`, jsdom 30 (existing), acorn (new devDependency). Browser side: plain HTML/CSS/JS, no framework, no bundler.

**Spec:** `docs/superpowers/specs/2026-10-18-configuration-tool-design.md`

## Global Constraints

- Work on branch `feature/config-tool` from `main`. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not push.
- `npm test` must stay green at every commit. The existing `pretest` syntax check is extended to `tool/*.js tool/lib/*.js tool/src/*.js`.
- Nothing in `core/` or `snippets/` changes except `test/helpers.js` gaining a `source` option. In particular `snippets/schedule-groups.js` keeps Cathy's default text; the tool shows neutral text through the manifest's `formDefault`.
- Only one new dependency: `acorn` as a devDependency. The browser page loads nothing from the network.
- Files shared between Node and the browser (`tool/manifest.js`, `tool/src/generate.js`) use the UMD pattern: `module.exports` when `module` exists, otherwise a `window` global (`MoxiePortalToolManifest`, `MoxiePortalToolGenerate`).
- Config format: `{ "moxiePortalTool": 1, "parent": { ... }, "snippets": [ { "id", "settings" } ] }`. `localStorage` key: `moxiePortalTool.config`. Download names: `moxie-portal-settings.json`, `moxie-portal-embed.js`.
- The paste's first line is exactly `/* MoxiePortal settings: <json> */` and it is the only comment in the paste. Blocks are separated by one blank line; the parent comes first, then snippet copies in config order.
- Slot values are written with `JSON.stringify`. The settings line escapes `*/` as `*\/` and U+2028/U+2029 as ` `/` `.
- The tool owns the whole Moxie box: "Paste from Moxie" warns when the pasted body differs from what the first line regenerates, and never carries unknown text through.
- Form controls expose stable hooks for tests: `data-mp-snippet="<id>"` on each copy's section, `data-mp-field="<NAME>"` on each field's root element, `data-mp-toggle="<id>"` on each snippet's on/off checkbox, `data-mp-add-copy="<id>"`, `data-mp-remove` on a copy's remove button, and ids `mp-output`, `mp-copy`, `mp-download-js`, `mp-save-json`, `mp-load-json`, `mp-paste-open`, `mp-paste-text`, `mp-paste-apply`, `mp-reset`, `mp-messages`, `mp-problems`, `mp-home-layout`.
- Field labels and help text use the README's words, never `var` names.

## Review Focus

1. The browser blocks storage (private window, blocked site data): reading or writing `localStorage` throws, and the page must still render and generate. Test in Task 6.
2. The user loads a JSON file that is not a config (random JSON, or an array): the form must not change and `#mp-messages` must say what happened. Test in Task 8.
3. A numeric field is cleared or non-numeric (`MAX_ROWS` = ""): the paste must still be valid JavaScript, using the default, and `#mp-problems` must count it. Test in Task 6.
4. The same Home card snippet is on twice (two `home-waiting` copies with different filters): the Home page layout must list `waiting` once and `HOME_CARDS` must contain it once. Test in Task 7.
5. A text setting containing a newline, `*/` or U+2028: the paste must parse, round-trip to the same config, and contain exactly one comment. Test in Task 3.

---

### Task 1: Source extraction with acorn

**Files:**
- Modify: `package.json` (add `acorn` devDependency; extend `pretest`; add `"build:tool": "node tool/build.js"`)
- Create: `tool/lib/extract.js`
- Test: `test/tool-extract.test.js`

**Interfaces:**
- Produces (CommonJS, `tool/lib/extract.js`):
  - `parseSource(source: string) -> { ast, comments: Array<{start,end}> }` using acorn with `{ ecmaVersion: 5, onComment }`. Bump `ecmaVersion` only if a real file fails to parse, and say so in the commit.
  - `isData(node) -> boolean`: `Literal`, `Identifier`, `ArrayExpression` of data, `ObjectExpression` whose values are data, `BinaryExpression` with `+` of data, `UnaryExpression` with `-` of data.
  - `topLevelDataVars(ast) -> Array<{ name, start, end, initStart, initEnd }>`: the `var` declarators in the body of the file's outer IIFE (`ast.body[0]` is an `ExpressionStatement` wrapping a `CallExpression` whose callee is a `FunctionExpression`) whose initializer `isData`. `start`/`end` cover the whole `VariableDeclaration` statement.
  - `evaluateVars(source, vars) -> object`: `new Function(<the declarations' source joined by newlines> + '\nreturn {' + names + '};')()` so `EMPTY` in home-recent sees `DAYS`.
  - `stripComments(source) -> string`: removes every comment range, then trims trailing whitespace per line and collapses runs of blank lines to one.
  - `extractFile(source, { settings: string[], internal: string[] }) -> { template: string, defaults: object, missing: string[], unlisted: string[] }`. The template is the source with comments removed and each listed setting's initializer replaced by `{{NAME}}`; a comment lying inside a replaced initializer is dropped with it. `defaults` holds only the listed settings. `missing` = settings not found as data vars; `unlisted` = data vars in neither list.

- [ ] **Step 1: Add acorn and the scripts**

```sh
npm install --save-dev acorn
```
In `package.json`: `"build:tool": "node tool/build.js"`, and change `pretest` to loop over `core/*.js snippets/*.js tool/*.js tool/lib/*.js tool/src/*.js`.

- [ ] **Step 2: Write the failing tests**

`test/tool-extract.test.js`, with this fixture as a string constant:

```js
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
```

Tests:
- `stripComments removes every comment and collapses blanks`: result contains no `//` or `/*`, `parseSource(result).comments.length === 0`, no two consecutive empty lines.
- `topLevelDataVars finds data vars only`: names deep-equal `['TITLE','DAYS','EMPTY','LIST','INTERNAL']` (not `node`, not `inner`).
- `evaluateVars resolves references between settings`: `EMPTY === 'No updates in the last 14 days.'`, `LIST` deep-equals `['a','b']`.
- `extractFile makes slots and reports lists`: with `settings: ['TITLE','DAYS','EMPTY','LIST','MISSING']`, `internal: []`: template contains `var TITLE = {{TITLE}};` and `var LIST = {{LIST}};` on one line each, contains no `// first`, `missing` deep-equals `['MISSING']`, `unlisted` deep-equals `['INTERNAL']`, `defaults.TITLE === 'Hi'`, `defaults` has no `INTERNAL` key.
- `extractFile works on every real file`: for `core/moxie-portal.js` with settings `CLIENT_FILTER, WAITING_STATUSES, TICKET_WAITING_STATUSES, HOME_CARDS` and internal `ICONS`, and for each `snippets/*.js` with settings `['ONLY_FOR']` and internal `[]`: `missing` is empty and `parseSource(template.replace(/\{\{\w+\}\}/g, 'null'))` throws nothing. (Unlisted is not asserted here; Task 2 does that with the manifest.)

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test test/tool-extract.test.js`
Expected: FAIL, cannot find module `../tool/lib/extract.js`.

- [ ] **Step 4: Implement `tool/lib/extract.js`**

Apply edits (comment removals and slot replacements) as a list of `{start, end, text}` sorted descending by `start` so earlier offsets stay valid; skip a comment edit whose range lies inside a slot range.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: all PASS, including the existing suites.

- [ ] **Step 6: Commit**

```sh
git checkout -b feature/config-tool
git add package.json package-lock.json tool/lib/extract.js test/tool-extract.test.js
git commit -m "tool: extract comment-free templates and defaults from snippets with acorn"
```

---

### Task 2: Manifest and bundle

**Files:**
- Create: `tool/manifest.js` (UMD)
- Create: `tool/lib/bundle.js`
- Test: `test/tool-manifest.test.js`

**Interfaces:**
- Produces `tool/manifest.js` exporting:
  ```js
  {
    parent: { settings: SettingDef[], internal: ['ICONS'] },
    snippets: SnippetDef[],       // display order: logo, custom-css, nav-tasks-link, nav-rename, schedule-groups, home-waiting, home-recent, home-requests, home-projects, home-billing
    cardNames: { 'home-waiting': 'waiting', 'home-recent': 'recent', 'home-requests': 'requests', 'home-projects': 'projects', 'home-billing': 'billing' }
  }
  ```
  `SnippetDef = { id, name, description, readme: '#<id>', card: string|null, internal: string[], settings: SettingDef[] }`. The module appends `{ name: 'ONLY_FOR', type: 'filter', label: 'Only for clients whose…', help }` to every snippet's settings itself, so no snippet can forget it.
  `SettingDef = { name, type, label, help?, formDefault?, defaultFrom?(values) -> value, sameAs? }`. Types: `text`, `number`, `stringList`, `cssLines`, `logo`, `size`, `filter`, `renames`, `groups`, `homeCards`.
  Settings per snippet, in file order (names as in the source): logo `LOGO_CHANGE` (logo), `LOGO_COLLAPSED` (logo, `sameAs: 'LOGO_CHANGE'`), `LOGO_WIDTH`, `LOGO_HEIGHT` (size); custom-css `CSS` (cssLines); nav-tasks-link `TASKS_LABEL`; nav-rename `RENAMES` (renames); schedule-groups `GROUPS` (groups, with `formDefault` = the two README example groups: `{ starts: 'Developer time:', text: "Asynchronous work on your site. Leave a note when booking if you'd like a kick-off call." }` and `{ starts: 'Meeting:', text: 'Synchronous calls. Meeting time is billed, so consider a task or ticket for simple requests.' }`), `OTHER_LABEL`; home-waiting `TITLE, EMPTY, BOARD_LINK, TICKET_PREFIX`; home-recent `TITLE, DAYS (number), EMPTY (defaultFrom: v => 'No updates in the last ' + v.DAYS + ' days.'), MAX_ROWS (number)`; home-requests `TITLE, EMPTY, MAX_ROWS`; home-projects `TITLE, MAX_ROWS`; home-billing `TITLE, INVOICES_HEADING, UNBILLED_HEADING, NET_HEADING, CREDIT_LABEL, DUE_LABEL, SETTLED_LABEL, EMPTY_UNBILLED, INVOICES_LINK, TIME_LINK` with `internal: ['COUNTED','UNPAID','CSS']`. Parent: `CLIENT_FILTER` (filter), `WAITING_STATUSES`, `TICKET_WAITING_STATUSES` (stringList), `HOME_CARDS` (homeCards). Labels and help come from the README's tables.
- Produces `tool/lib/bundle.js` (CommonJS): `buildBundle(rootDir = repo root) -> Bundle` where
  ```js
  Bundle = { format: 1, parent: { template, defaults }, snippets: { [id]: { template, defaults } }, icons: string[] }
  ```
  It reads `core/moxie-portal.js` and `snippets/<id>.js` for every manifest snippet, calls `extractFile`, and throws one `Error` whose message lists every `missing` and `unlisted` name as `<file>: missing X` / `<file>: unlisted Y` if any file has them. `icons` = keys of the parent's `ICONS` (evaluate it as an internal data var) minus `chevron` and `arrow`.

- [ ] **Step 1: Write the failing tests**

`test/tool-manifest.test.js`:
- `every manifest setting exists in its source and nothing is unlisted`: `buildBundle()` does not throw; for each manifest snippet, `bundle.snippets[id].defaults` has a key for every setting name including `ONLY_FOR`.
- `formDefault overrides have the file's shape`: for every setting with `formDefault`, `Array.isArray(formDefault) === Array.isArray(defaults[name])` and `typeof` matches; for `schedule-groups` `GROUPS`, `formDefault.length === 2`, `formDefault[0].starts === 'Developer time:'` and the file default's first `text` differs from the override's (so the override is really in use).
- `defaultFrom recomputes from the other values`: home-recent `EMPTY` def's `defaultFrom({ DAYS: 7 }) === 'No updates in the last 7 days.'` and `defaultFrom(defaults) === defaults.EMPTY`.
- `icons come from the parent`: `bundle.icons` deep-equals `['tasks','folder','ticket','history','listChecks','calendar','receipt']`.
- `parent defaults match the file`: `bundle.parent.defaults.HOME_CARDS` deep-equals `[['waiting','recent'],['requests','projects']]` and `CLIENT_FILTER === null`.
- `a bogus manifest entry is reported by name`: calling `buildBundle` with a manifest whose logo snippet lists setting `NOPE` throws an error whose message matches `/logo\.js: missing NOPE/`. (Give `buildBundle` an optional second argument `manifest` for this.)

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/tool-manifest.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `tool/manifest.js` and `tool/lib/bundle.js`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. If a real snippet reports `unlisted`, add that var to the snippet's `internal` list in the manifest only if it is not a user setting; otherwise add it as a setting.

- [ ] **Step 5: Commit**

```sh
git add tool/manifest.js tool/lib/bundle.js test/tool-manifest.test.js
git commit -m "tool: manifest of snippet settings and the bundle builder that checks it against the source"
```

---

### Task 3: Generator and settings line

**Files:**
- Create: `tool/src/generate.js` (UMD)
- Modify: `test/helpers.js:56-91` (`boot()` gains `opts.source`)
- Test: `test/tool-generate.test.js`

**Interfaces:**
- Consumes `Bundle` and manifest from Task 2.
- Produces `tool/src/generate.js` exporting:
  - `CONFIG_VERSION = 1`, `SETTINGS_PREFIX = '/* MoxiePortal settings: '`
  - `serializeSettings(config) -> string`: `JSON.stringify` then replace `*/` with `*\/` and U+2028/U+2029 with their `\u` escapes.
  - `settingsLine(config) -> string`: prefix + serialized + `' */'`.
  - `parseSettingsLine(text) -> config`: skips leading whitespace, requires the prefix, takes up to the first `*/` after it (across newlines), `JSON.parse`s. Throws `Error` with `code: 'NOT_TOOL_PASTE'` or `'BAD_JSON'`.
  - `fillDefaults(settings, defs, defaults) -> object`: for each def, own value if present, else `def.formDefault` if defined, else `defaults[name]`.
  - `renderTemplate(template, values) -> string`: replaces each `{{NAME}}` with `JSON.stringify(values[NAME])`.
  - `generate(config, bundle, manifest) -> string`: settings line, newline, parent block, then each snippet copy, blocks separated by one blank line, trailing newline. Throws on an unknown snippet id.
  - `normalizeConfig(raw, manifest) -> { config, dropped: string[] }`: throws `code: 'NOT_CONFIG'` unless `raw` is a plain object with a numeric `moxiePortalTool`; throws `code: 'NEWER_VERSION'` if it is greater than `CONFIG_VERSION`. Returns a deep copy with unknown parent settings, unknown snippet ids and unknown setting names removed; `dropped` lists them as `'parent: X'`, `'snippet: foo'`, `'custom-css: FOO'`. Missing `parent` or `snippets` become `{}` and `[]`.
  - `homeCardsToLayout(homeCards, enabledCards: string[]) -> Array<{ card, newRow: boolean }>`: walks the nested-array form (an inner array is a row; a bare name is its own row), drops cards not in `enabledCards`, appends enabled cards that were missing, each with `newRow: true`, and never lists a card twice.
  - `layoutToHomeCards(layout) -> string[][]`: one inner array per row.
  - `bodyMatches(pasteText, regenerated) -> boolean`: true when the two texts are equal after removing the settings comment from each and all whitespace.
- `boot(opts)` in `test/helpers.js`: when `opts.source` is a string it is evaluated instead of the file, and `filter`/`homeCards` are not applied.

- [ ] **Step 1: Write the failing tests**

`test/tool-generate.test.js` (use `buildBundle()` and the real manifest; define `TWO_CSS` as a config with two `custom-css` copies, `ONLY_FOR: { ClientType: 'TNC' }` with CSS `['#app { --v-sidebar-base: #1B5E20 !important; }']` and `ONLY_FOR: { ClientType: 'Agency' }` with `#0D47A1`, and `parent.CLIENT_FILTER: null`):
- `the paste parses, has one comment, and round-trips`: `generate(TWO_CSS, …)`; `parseSource(out).comments.length === 1`; `parseSettingsLine(out)` deep-equals `TWO_CSS`; the output starts with `SETTINGS_PREFIX`; it contains `var CSS = ["#app { --v-sidebar-base: #1B5E20 !important; }"];` and the `#0D47A1` line after it; the parent's `var CLIENT_FILTER = null;` precedes both.
- `hostile text survives`: config with home-waiting `TITLE: 'It\'s "done" */ line\nnext end'`; output parses with exactly one comment; `parseSettingsLine` returns the identical title; the output contains no raw U+2028 character.
- `missing settings get defaults, formDefault first`: config `{ moxiePortalTool: 1, parent: {}, snippets: [{ id: 'schedule-groups', settings: {} }, { id: 'home-recent', settings: {} }] }`; output contains `Asynchronous work on your site` and not `reserve on my schedule`; contains `var DAYS = 14;` and `"No updates in the last 14 days."`; parent block contains `var HOME_CARDS = [["waiting","recent"],["requests","projects"]];`.
- `the generated paste runs in the portal harness`: `const t = boot({ source: generate(TWO_CSS, …), customValues: [{ mappingKey: 'ClientType', value: 'TNC' }] }); await tick();` then the document's `<style>` text includes `#1B5E20` and not `#0D47A1`. Then the same with `Agency`: the reverse.
- `normalizeConfig drops unknowns and reports them`: raw with `parent: { CLIENT_FILTER: null, BOGUS: 1 }` and snippets `[{ id: 'nope', settings: {} }, { id: 'custom-css', settings: { CSS: [], FOO: 1 } }]` returns `dropped` deep-equal `['parent: BOGUS', 'snippet: nope', 'custom-css: FOO']` and a config with one snippet whose settings are `{ CSS: [] }`.
- `normalizeConfig rejects non-configs and newer versions`: `[]`, `null`, `{ a: 1 }` throw `NOT_CONFIG`; `{ moxiePortalTool: 2 }` throws `NEWER_VERSION`.
- `parseSettingsLine tolerates wrapping and rejects other text`: `'  /* MoxiePortal settings: {"moxiePortalTool":1,\n"parent":{}} */\nrest'` parses; `'(function(){})();'` throws `NOT_TOOL_PASTE`; `'/* MoxiePortal settings: {oops */'` throws `BAD_JSON`.
- `home card layout conversions`: `homeCardsToLayout([['waiting','recent'],'requests'], ['waiting','recent','requests','billing'])` deep-equals `[{card:'waiting',newRow:true},{card:'recent',newRow:false},{card:'requests',newRow:true},{card:'billing',newRow:true}]`; `homeCardsToLayout([['waiting','waiting']], ['waiting'])` has length 1; `layoutToHomeCards` of the first result deep-equals `[['waiting','recent'],['requests'],['billing']]`.
- `bodyMatches ignores whitespace and the settings line`: a generated paste with extra blank lines and a different settings line matches; the paste plus `\n(function(){ alert(1); })();` does not.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/tool-generate.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `tool/src/generate.js` and the `boot()` change**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add tool/src/generate.js test/helpers.js test/tool-generate.test.js
git commit -m "tool: generate the paste from a config and read it back from the settings line"
```

---

### Task 4: Build to one HTML file, and the Pages workflow

**Files:**
- Create: `tool/build.js`, `tool/src/index.html`, `tool/src/styles.css`, `tool/src/app.js` (placeholder that renders the heading only)
- Create: `.github/workflows/pages.yml`
- Test: `test/tool-build.test.js`, `test/tool-helpers.js`

**Interfaces:**
- Produces `tool/build.js` (CommonJS): `buildPage() -> { html: string, bundle: Bundle }` and, when run as main, writes `tool/dist/index.html` and prints its size. `index.html` holds the page shell with markers `<!-- inline:styles.css -->`, `<!-- inline:bundle -->`, `<!-- inline:manifest.js -->`, `<!-- inline:generate.js -->`, `<!-- inline:app.js -->` which the build replaces with `<style>`/`<script>` elements. The bundle is written as `<script>window.MoxiePortalToolBundle = <json>;</script>` with every `</` in the JSON written as `<\/`.
- Produces `test/tool-helpers.js`: `openTool({ storage, beforeParse } = {}) -> { window, document, $ (querySelector), $$ , tick }`: builds the page in memory, loads it with `new JSDOM(html, { runScripts: 'dangerously', url: 'https://tool.test/', beforeParse })`; when `storage` is an object, it is written to `localStorage` under `moxiePortalTool.config` (via `beforeParse`) before the scripts run.
- Page shell (index.html) section order and ids: `<header>` with title and the README caution; `#mp-settings-bar` (buttons `mp-load-json` as a hidden `<input type=file>` plus a visible button, `mp-save-json`, `mp-paste-open`, `mp-reset`); `#mp-messages` (aria-live); `#mp-parent`; `#mp-snippets`; `#mp-home-layout`; `#mp-output-section` with `#mp-problems`, `<textarea id=mp-output readonly>`, `mp-copy`, `mp-download-js`, and the three install steps as an ordered list.

- [ ] **Step 1: Write the failing tests**

`test/tool-build.test.js`:
- `buildPage inlines everything`: `html` contains `window.MoxiePortalToolBundle = `, contains no `<script src=` or `<link rel="stylesheet"`, contains no `</script>` inside the bundle JSON (assert the bundle script's text, extracted between its tags, parses back with `JSON.parse` after reversing `<\/` to `</` and deep-equals `bundle`).
- `the page boots in jsdom without errors`: `openTool()` resolves, `document.querySelector('h1')` text contains `Moxie`, `#mp-output` exists, and no `error` events were raised on the window (collect them in `beforeParse`).
- `the built file passes the syntax check`: `node tool/build.js` exits 0 and `tool/dist/index.html` exists.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/tool-build.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the build, the shell, an empty stylesheet with the page's base styles, and a placeholder `app.js` that fills `#mp-output` with `generate(emptyConfig)`**

Also create `.github/workflows/pages.yml`: on push to `main`, `actions/checkout@v4`, `actions/setup-node@v4` with node 22, `npm ci`, `npm test`, `node tool/build.js`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` with `path: tool/dist`, `actions/deploy-pages@v4`; permissions `pages: write`, `id-token: write`, `contents: read`.

- [ ] **Step 4: Run the tests**

Run: `npm test && node tool/build.js`
Expected: PASS; the build prints the output path.

- [ ] **Step 5: Commit**

```sh
git add tool/build.js tool/src .github/workflows/pages.yml test/tool-build.test.js test/tool-helpers.js
git commit -m "tool: build one self-contained page and deploy it to GitHub Pages"
```

---

### Task 5: Form core: parent settings, snippet toggles, copies, simple fields, live output

**Files:**
- Modify: `tool/src/app.js`, `tool/src/styles.css`
- Test: `test/tool-app.test.js`

**Interfaces:**
- Consumes `window.MoxiePortalToolBundle`, `MoxiePortalToolManifest`, `MoxiePortalToolGenerate`.
- Produces, inside `app.js`'s IIFE (not exported, but names the later tasks extend):
  - `state.config` (always a full config: every enabled copy has every setting present).
  - `editors: { [type]: (def, value, onChange, ctx) => HTMLElement }` where the returned element carries `data-mp-field`. This task implements `text`, `number`, `stringList`, `cssLines`, `size`, `filter`. `ctx = { values, bundle, manifest }`.
  - `newCopy(snippetDef) -> { id, settings }` using `fillDefaults({}, def.settings, bundle.snippets[id].defaults)`.
  - `renderAll()`: rebuilds `#mp-parent` and `#mp-snippets` from `state.config`; `refreshOutput()`: regenerates `#mp-output` and `#mp-problems`; `onChange()`: `save()` then `refreshOutput()`; structural actions call `renderAll()` too.
  - `save()` / `load()` wrap `localStorage` in try/catch; `load()` runs `normalizeConfig` and falls back to `emptyConfig()` = `{ moxiePortalTool: 1, parent: fillDefaults({}, manifest.parent.settings, bundle.parent.defaults), snippets: [] }`.
  - `problems: Array<{ path, message }>` recomputed on every change: `number` fields that are empty or `NaN` ("Needs a whole number; using the default N"); shown as `#mp-problems` text `N thing(s) to check` and an inline message beside the field. The paste uses the default for such a field.
  - `defaultFrom` handling: when a field changes, for every sibling def with `defaultFrom`, if the sibling's current value equals `defaultFrom(previousValues)`, set it to `defaultFrom(newValues)` and re-render that field.
- Field value shapes: `stringList` ↔ `string[]` (one per line, blank lines dropped); `cssLines` ↔ `string[]`; `size` ↔ `''`, a number when the input is a plain integer, else the string; `filter` ↔ `null` when no row has a key, else `{ key: value }` with blank-key rows ignored.
- Snippet section per snippet: heading, description, link to `README.md<readme>`, checkbox `data-mp-toggle`. Checked: one copy appended via `newCopy`. Unchecked: all copies removed (`window.confirm` first when more than one copy exists). Each copy: `<section data-mp-snippet=id>` with its fields in manifest order, `ONLY_FOR` last, and a `data-mp-remove` button (hidden when it is the only copy). Below the copies: `data-mp-add-copy` button labelled "Add another copy for different clients".

- [ ] **Step 1: Write the failing tests**

`test/tool-app.test.js` using `openTool`:
- `a fresh page generates the parent only`: `#mp-output` value starts with `/* MoxiePortal settings:` and contains `var CLIENT_FILTER = null;` and no `MoxiePortal.ready(`.
- `turning a snippet on adds its block, with its defaults`: click `[data-mp-toggle="nav-tasks-link"]`; output contains `var TASKS_LABEL = "Tasks";`; one `[data-mp-snippet="nav-tasks-link"]` section exists.
- `editing a text field updates the output and storage`: set the `input` inside `[data-mp-field="TASKS_LABEL"]` to `To do`, dispatch `input`; output contains `"To do"`; `JSON.parse(localStorage.getItem('moxiePortalTool.config')).snippets[0].settings.TASKS_LABEL === 'To do'`.
- `adding a copy adds a second block with its own filter`: turn on `custom-css`, click `[data-mp-add-copy="custom-css"]`; two sections; in the second, fill the filter row key `ClientType` value `Agency`; output contains two `var CSS = ` lines and `var ONLY_FOR = {"ClientType":"Agency"};` once and `var ONLY_FOR = null;` once.
- `removing a copy`: click `[data-mp-remove]` in the second copy; one section and one `var CSS = ` remain.
- `stringList and filter shapes`: set the parent `WAITING_STATUSES` textarea to `"A\n\nB "`; output contains `["A","B"]`; a parent filter row with an empty key emits `var CLIENT_FILTER = null;`.
- `size emits numbers for integers and strings otherwise`: turn on `logo`, set `LOGO_WIDTH` to `160` → `var LOGO_WIDTH = 160;`; to `80%` → `"80%"`.
- `a cleared number falls back to the default and is counted`: turn on `home-projects`, clear `MAX_ROWS` → output has `var MAX_ROWS = 5;`, `#mp-problems` text matches `/1 /`.
- `defaultFrom follows its source until edited`: turn on `home-recent`, set `DAYS` to `7` → output contains `"No updates in the last 7 days."`; then set `EMPTY` to `Quiet.` and `DAYS` to `3` → output contains `"Quiet."`.
- `state survives a reload`: `openTool({ storage: <config with nav-tasks-link TASKS_LABEL 'Later'> })` renders the toggle checked and the output containing `"Later"`.

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/tool-app.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the form core in `app.js` and its styles**

Render structure with `document.createElement`; never `innerHTML` with user text. Keep each editor a small function. Stylesheet: single column, max-width 760px, 16px gutters, system font, cards for snippet sections, works at 360px wide.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add tool/src/app.js tool/src/styles.css test/tool-app.test.js
git commit -m "tool: form with snippet toggles, copies, simple fields and live output"
```

---

### Task 6: Storage failure and problems display

**Files:**
- Modify: `tool/src/app.js`
- Test: `test/tool-app.test.js`

**Interfaces:** none new; hardens Task 5's `save()`/`load()` and `problems`.

- [ ] **Step 1: Write the failing tests**

- `a browser that blocks storage still works`: `openTool({ beforeParse(w) { Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } }); } })`; page boots, toggling `nav-tasks-link` updates `#mp-output`, and `#mp-messages` text includes `remember` (a one-line note that the browser will not remember settings; use "Save as file").
- `a non-numeric number is reported inline`: set `home-projects` `MAX_ROWS` to `abc`; the field's root contains an element with class `mp-problem` whose text includes `whole number`; `#mp-problems` matches `/1 /`; fixing it to `3` clears both.

- [ ] **Step 2: Run to see them fail**, **Step 3: Implement**, **Step 4: `npm test` PASS**

- [ ] **Step 5: Commit**

```sh
git add tool/src/app.js test/tool-app.test.js
git commit -m "tool: work without storage and show field problems inline"
```

---

### Task 7: Structured editors: logo, renames, groups, home layout

**Files:**
- Modify: `tool/src/app.js`, `tool/src/styles.css`
- Test: `test/tool-app.test.js`

**Interfaces:**
- Adds editors `logo`, `renames`, `groups`, `homeCards`.
  - `logo`: radios `hide` / `image` (reveals a URL input) / `keep`, plus `same` ("Same as the expanded logo") when `def.sameAs` is set. Values: `'none'`, the URL string, `''`, `null`. An `image` choice whose URL does not start with `http` is a problem ("Needs a full web address starting with https://"); the value is still emitted as typed.
  - `renames`: rows of (built-in name `<input list>` with a `<datalist>` of `Home, Projects, Meetings, Requests, Invoices, Files, Time`), new label, icon `<select>` with "Keep Moxie's icon", each `bundle.icons` name, and "Custom SVG" revealing a textarea. Value: `{ [name]: { label?, icon? } }` with empty parts omitted and rows with an empty built-in name ignored.
  - `groups`: rows of starts (text), description (textarea), only-for (filter editor), not-for (filter editor), move up/down, remove; "Add group". Value: array of `{ starts, text?, onlyFor?, notFor? }` with empty optional parts omitted. An empty `starts` is a problem ("Needs the start of the link names").
  - `homeCards`: `#mp-home-layout` shows `homeCardsToLayout(config.parent.HOME_CARDS, enabledCards)` where `enabledCards` = card names of snippets with at least one copy, de-duplicated; each row has the card's display name, up/down buttons, and a checkbox "Share a row with the card above" (= `!newRow`, disabled on the first card). Up/down swaps the card names of two adjacent positions; the row flags stay with the positions. Changes write `layoutToHomeCards(layout)` to `config.parent.HOME_CARDS`. Hidden when `enabledCards` is empty. Turning a card snippet on appends it as its own row; turning it off removes it.

- [ ] **Step 1: Write the failing tests**

- `logo radios map to the snippet's values`: turn on `logo`; default radio is `hide` and output has `var LOGO_CHANGE = "none";`; choose `image`, type `https://x.test/l.png` → `"https://x.test/l.png"`; type `logo.png` instead → `#mp-problems` matches `/1 /` and the output still has `"logo.png"`; choose `keep` → `""`; `LOGO_COLLAPSED` default radio is `same` → `var LOGO_COLLAPSED = null;`.
- `renames rows build the object`: turn on `nav-rename`; default row shows `Meetings` / `Schedule time` / `calendar`; add a row `Requests`, label `Help desk`, icon kept → output `var RENAMES = {"Meetings":{"label":"Schedule time","icon":"calendar"},"Requests":{"label":"Help desk"}};`.
- `groups rows build the array and flag empty starts`: turn on `schedule-groups`; output contains `Asynchronous work on your site`; add a group with starts `Retainer:` and only-for `ClientType=Retainer`; output contains `{"starts":"Retainer:","onlyFor":{"ClientType":"Retainer"}}`; clear its starts → `#mp-problems` matches `/1 /`.
- `home layout follows the cards that are on, and lists a card once`: with nothing on, `#mp-home-layout` is hidden; turn on `home-waiting` and add a second copy → the layout has one row `waiting` and output `var HOME_CARDS = [["waiting"]];`; turn on `home-billing` → `[["waiting"],["billing"]]`; tick "share a row" on billing → `[["waiting","billing"]]`; move billing up → `[["billing","waiting"]]` (the first card's share box is disabled and the moved card starts its row); turn `home-waiting` off (confirm stubbed to return true) → `[["billing"]]`.

- [ ] **Step 2: Run to see them fail**, **Step 3: Implement the four editors**, **Step 4: `npm test` PASS**

- [ ] **Step 5: Commit**

```sh
git add tool/src/app.js tool/src/styles.css test/tool-app.test.js
git commit -m "tool: editors for logo, menu renames, schedule groups and the Home layout"
```

---

### Task 8: Save, load, paste from Moxie, start over, copy and download

**Files:**
- Modify: `tool/src/app.js`, `tool/src/index.html`, `tool/src/styles.css`
- Test: `test/tool-app.test.js`

**Interfaces:**
- `mp-save-json`: downloads `moxie-portal-settings.json` (pretty-printed config) via a Blob URL; `mp-download-js`: downloads `moxie-portal-embed.js` with `#mp-output`'s text; `mp-copy`: `navigator.clipboard.writeText`, falling back to selecting the textarea and `document.execCommand('copy')`; the button text reads "Copied" for two seconds.
- `mp-load-json` (`<input type=file accept=".json,application/json">`): reads the file, `JSON.parse`, `normalizeConfig`; on success replaces `state.config` (filling defaults for every copy), `renderAll()`, and when `dropped` is non-empty shows "Ignored settings this version doesn't know: …" in `#mp-messages`; on `NOT_CONFIG`/`BAD JSON` shows "That file isn't a settings file from this tool" and changes nothing; on `NEWER_VERSION` shows "This file was made by a newer version of the tool. Reload the page and try again."
- `mp-paste-open` reveals `#mp-paste-text` (textarea) and `mp-paste-apply`. Apply: `parseSettingsLine` → `normalizeConfig` → if `!bodyMatches(pasted, generate(config))`, `window.confirm("The box contains changes made outside this tool. They won't be in the new paste. Load the settings anyway?")`; on yes (or when bodies match) load as above. Errors: `NOT_TOOL_PASTE` → "This doesn't look like a paste made by this tool."
- `mp-reset`: `window.confirm("Start over with a blank form? Your saved settings in this browser will be cleared.")` then `emptyConfig()`, clear storage, `renderAll()`.
- Hooks for tests: `app.js` exposes `window.__mpTool = { loadConfigText(text) -> Promise, applyPaste(text) }` so tests can drive load and paste without a real file dialog; the file input's `change` handler calls `loadConfigText` with the file's text.

- [ ] **Step 1: Write the failing tests**

- `a saved file round-trips`: build a config in the form (nav-tasks-link `TASKS_LABEL` `X`), capture the Blob passed to `URL.createObjectURL` (stub it in `beforeParse` to record the blob and return `blob:fake`), read its text, `openTool()` fresh and `await window.__mpTool.loadConfigText(text)`; the output contains `"X"`.
- `random JSON is refused without changing the form`: with `nav-tasks-link` on, `loadConfigText('[1,2]')` and `loadConfigText('{"a":1}')` leave the toggle checked and `#mp-messages` text includes `isn't a settings file`.
- `unknown settings are named`: `loadConfigText` of a config with `custom-css` `FOO` → `#mp-messages` text includes `custom-css: FOO`; `custom-css` is on.
- `a newer version is explained`: `{"moxiePortalTool":2}` → message includes `newer version`.
- `paste from Moxie rebuilds the form`: `applyPaste(generate(TWO_CSS…))` → two `custom-css` sections; `confirm` not called.
- `an edited box warns first`: stub `window.confirm` to return false; `applyPaste(paste + '\n(function(){})();')` → confirm called once, form unchanged; stub returns true → form changes.
- `start over clears`: with a snippet on, stub confirm true, click `mp-reset` → no sections, `localStorage.getItem('moxiePortalTool.config')` is null or equals the empty config.
- `copy writes the output`: stub `navigator.clipboard.writeText` in `beforeParse` to record; click `mp-copy` → recorded text equals `#mp-output` value; button text is `Copied`.

- [ ] **Step 2: Run to see them fail**, **Step 3: Implement**, **Step 4: `npm test` PASS**

- [ ] **Step 5: Commit**

```sh
git add tool/src test/tool-app.test.js
git commit -m "tool: save, load, paste-from-Moxie, start over, copy and download"
```

---

### Task 9: README, final build check, hand-check in a browser

**Files:**
- Modify: `README.md` (snippet table near line 7; Install at 41; "Changing or removing a snippet later" at 54; Development at 371; "Writing your own snippet" at 271)
- Modify: `tool/src/index.html` (final copy of the heading, caution and install steps)

- [ ] **Step 1: README edits**

  - Snippet table: add `| \`home-billing\` | Home card with the client's invoice totals, hours not yet invoiced, and whether they have credit or a balance due. |` after `home-projects`.
  - Install: before step 1, a paragraph headed **The easy way: the configuration tool** linking to `https://cathysarisky.github.io/moxie-client-portal-widgets/`: tick the snippets you want, fill in the fields, copy the paste, and paste it into the box described in step 1. The steps below are for doing it by hand.
  - "Changing or removing a snippet later": add "If your paste came from the configuration tool, go back to the tool, choose **Paste from Moxie**, paste what is in the box, change what you want and copy the new paste over the old one."
  - Development: add `npm run build:tool   # writes tool/dist/index.html` and a sentence that the tool is deployed by `.github/workflows/pages.yml` on push to `main`, and that GitHub Pages must be set to the "GitHub Actions" source once.
  - "Writing your own snippet": add a sentence that a snippet appears in the configuration tool once it has an entry in `tool/manifest.js` listing its settings, and that `npm test` fails if the manifest and the file disagree.

- [ ] **Step 2: Build and open the page**

Run: `node tool/build.js` and open `tool/dist/index.html` in a browser (on WSL: `explorer.exe "$(wslpath -w tool/dist/index.html)"`). Check at desktop and 375px width: turn every snippet on, add a copy, fill a group, download the JSON and the JS, reload and see the state kept, Copy works. Note anything wrong and fix it in `app.js`/`styles.css` with a test where behaviour was wrong.

- [ ] **Step 3: Full test run**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add README.md tool/src
git commit -m "docs: point the README at the configuration tool and list home-billing"
```

- [ ] **Step 5: Hand back**

Report: the branch name, the test output's final summary line, the built file's size, and the one manual step left to Cathy (enable Pages with the GitHub Actions source, then merge to `main`).
