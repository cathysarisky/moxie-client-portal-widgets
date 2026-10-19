# Configuration tool for the Moxie portal snippets

Date: 2026-10-18
Status: design written by Claude from a conversation with Cathy; to be planned and built
by an agent. Decisions marked **(Cathy)** are hers. Decisions marked **(Claude's call)**
were not discussed and may be overridden.

## Intent

Today a Moxie user who wants these snippets copies `core/moxie-portal.js` and each
snippet file into Moxie's **JavaScript embed code** box and edits `var` lines by hand.
That works for Cathy and for programmers. It does not work for the repo's wider
audience: Moxie users who are comfortable with a form but not with JavaScript quotes,
brackets and commas, and who will break a paste by leaving out one comma.

The tool is a web page. The user ticks the snippets they want, fills in plain fields
for each one, and gets one block of text to paste into Moxie. They never see a `var`
line. The page remembers their answers in their browser, lets them download and
re-load their answers as a JSON file, and can rebuild the form from a paste they
already put in Moxie **(Cathy)**.

## Goals

- One static page, served by GitHub Pages from this repo, no server, no account.
- Pick snippets, configure each through form fields, copy one paste.
- The paste is the real parent script plus the real snippet source with the settings
  rewritten, with all comments removed, in the order the README prescribes (parent
  first, snippets after) **(Cathy)**.
- The first line of the paste is the only comment: one line holding the settings as
  JSON, so the tool can read a paste back and rebuild the form from it **(Cathy)**.
- A snippet can be added more than once, each copy with its own settings and its own
  `ONLY_FOR` filter, which is how the README gives different client types different
  looks **(Cathy)**.
- Settings persist in `localStorage` as the user types; JSON download and upload of
  the same settings **(Cathy)**.
- The tool is built from the snippet files in the same checkout, so the page and the
  snippets cannot drift apart, and a test proves every field the form offers matches a
  setting that exists in the source **(Cathy agreed to Claude's recommendation)**.
- `home-billing` is included in the tool and added to the README's snippet table; the
  rest of its README section already exists **(Cathy)**.

## Non-goals

- A live preview of the portal. The user checks their work in Moxie, as the README
  already says.
- Editing snippet code, adding new snippets, or writing custom JavaScript in the tool.
  `custom-css` is the escape hatch and it takes CSS, not JS.
- A server, an account, sync between devices, or anything that stores user data
  anywhere but their own browser and the files they download.
- Minifying the output. Comments go; code stays readable.
- Translation of the tool's own text.

## Anti-goals (what would make this a failure)

- A paste that is syntactically broken, or that silently does nothing. Every value the
  user types must be serialised safely into the JavaScript, no matter what characters
  it contains: apostrophes in group descriptions, double quotes in CSS, `*/` in
  anything.
- Losing the user's work: a page reload, a browser crash or a tool update must not
  empty the form. Loading an older saved file must still work after new settings or
  snippets are added.
- A form that leaks the implementation. No field should ask the user to type quotes,
  brackets, `null`, or a JavaScript object. Field labels use the README's plain-language
  names, not the `var` names.
- Drift: a snippet gains, loses or renames a setting and the tool keeps offering the
  old one. The test suite must fail in that case.

## Constraints

- Lives in this repo (`cathysarisky/moxie-client-portal-widgets`) under `tool/`. The
  empty `/home/cathy/moxie/moxie-client-portal-tool` folder is not used; deleting it is
  Cathy's choice **(Claude's call to leave it alone)**.
- No framework. Plain HTML, CSS and browser JavaScript, modern syntax allowed in the
  tool (it runs in the user's current browser, not in the portal). No bundler; the
  build is a Node script **(Claude's call)**.
- The only new dependency is `acorn` as a devDependency, used by the build and tests
  to find comments and setting declarations in the snippet source precisely. The
  snippets themselves stay dependency-free **(Claude's call)**.
- `npm test` stays green; the tool's tests join `test/*.test.js` and run under
  `node:test` and jsdom like the existing ones.
- The generated paste must pass `node --check` and must run under the existing
  `test/helpers.js` harness exactly like hand-pasted files do.
- Snippet files keep their current convention: each setting is a top-level
  `var NAME = value;` statement in the IIFE before `MoxiePortal.ready(`. The tool
  relies on it; nothing about the snippets' runtime behaviour changes.

## How it works

### Repo layout **(Claude's call)**

```
tool/
  manifest.js        what each snippet is called, what it does, which vars are settings and what kind of field each gets
  build.js           node: reads core/ + snippets/, strips comments, cuts setting slots, writes tool/dist/index.html
  src/
    index.html       page shell
    app.js           form rendering, state, localStorage, import/export
    generate.js      config -> paste text, and paste text -> config; shared with tests (UMD-style: works in Node and browser)
    styles.css
  dist/              build output, gitignored (dist/ already is)
.github/workflows/pages.yml   builds on push to main and deploys tool/dist to GitHub Pages
test/tool-build.test.js, test/tool-generate.test.js
```

Published at `https://cathysarisky.github.io/moxie-client-portal-widgets/`. The README's
Install section gets a short "Use the configuration tool" paragraph linking there before
the manual steps, and `home-billing` is added to the snippet table at the top.

### Build

`node tool/build.js`:

1. Reads `core/moxie-portal.js` and every `snippets/*.js` listed in the manifest.
2. Parses each with acorn, collects every comment, and produces a comment-free copy.
   Blank lines left behind are collapsed to at most one. Cathy asked for all comments
   stripped, so the parent's `/*!` copyright banner goes too; the MIT licence is
   satisfied by the repo **(Claude's call; easy to reverse by keeping that banner)**.
3. For each file, finds the `var NAME = …;` declarations named in the manifest and
   replaces the initializer with a slot marker. The result is a template: text with
   `{{NAME}}` slots. The settings region is the run of top-level `var` statements at the
   start of the IIFE body, ending at the first statement that is not a `var` (in the
   snippets that is the `MoxiePortal.ready(` call; the parent never calls `ready`, its
   region ends at the first `var shared = document.createElement(...)` style statement
   and its `internal` list names `ICONS` and anything else found there) **(Claude's
   call)**.
4. Evaluates the file's settings block once (all its setting declarations together, in a
   `new Function`) to get the default value of each setting as data. This keeps defaults
   in one place, the snippet file, with two exceptions. `home-recent`'s `EMPTY` depends
   on `DAYS`, so the manifest can give a setting a `defaultFrom(values)` function that
   recomputes its default from the others until the user edits it. And a manifest
   setting may carry a `formDefault` that replaces the file's default in the form: the
   `schedule-groups` file ships Cathy's own group descriptions, and the tool must show
   neutral starter text instead, the README's short example groups ("Developer time:"
   and "Meeting:" with one-sentence descriptions) **(Cathy)**. The snippet file is not
   changed. The drift test still checks that an overridden setting exists in the source
   and that the override has the same shape as the file's value.
5. Verifies the manifest against the source: every manifest setting was found; every
   top-level `var` before `MoxiePortal.ready(` that is not in the manifest is in the
   snippet's `internal` list (e.g. `home-billing`'s `COUNTED`, `UNPAID`, `CSS`). A
   mismatch fails the build and the test.
6. Inlines `styles.css`, `generate.js`, `app.js`, the manifest and the templates and
   defaults as JSON into `index.html`, writes `tool/dist/index.html`. One file, works
   when opened from disk, no network needed after load.

### Manifest

A JavaScript module listing, per snippet: id (file name), display name, one-paragraph
description (taken from the README table wording), which README section anchor to link
to, the settings in display order with label, help text, field type and any options, the
`internal` var names to ignore, and for Home cards the card name used by `HOME_CARDS`.

The parent has its own entry for `CLIENT_FILTER`, `WAITING_STATUSES`,
`TICKET_WAITING_STATUSES`, `HOME_CARDS`.

Field types the builder must provide **(Claude's call; the set is what the current
settings need)**:

| Type | Used by | Control |
|---|---|---|
| `text` | titles, labels, headings, `TASKS_LABEL`, `OTHER_LABEL`, `TICKET_PREFIX` | single-line input |
| `number` | `MAX_ROWS`, `DAYS` | numeric input |
| `stringList` | `WAITING_STATUSES`, `TICKET_WAITING_STATUSES` | one per line, or chips with add/remove |
| `cssLines` | `custom-css` `CSS` | textarea, one rule per line, no quoting; serialised as an array of lines |
| `logo` | `LOGO_CHANGE`, `LOGO_COLLAPSED` | radio: hide / show this image (URL input) / leave Moxie's; `LOGO_COLLAPSED` adds "same as expanded" |
| `size` | `LOGO_WIDTH`, `LOGO_HEIGHT` | text input with help "160 for pixels, or 80%"; a plain integer is emitted as a number, anything else as a string |
| `filter` | `CLIENT_FILTER`, every `ONLY_FOR`, group `onlyFor`/`notFor` | repeatable rows of field key + value; no rows means every client (`null`) |
| `renames` | `RENAMES` | repeatable rows: built-in menu name (text with suggestions: Home, Projects, Meetings, Requests, Invoices, Files, Time), new label, icon (select from the parent's icon names, plus "custom SVG" revealing a textarea); either label or icon may be empty |
| `groups` | `GROUPS` | repeatable rows: starts, description (multi-line), only for (filter), not for (filter); move up/down |
| `homeCards` | `HOME_CARDS` | see below |

The builder's exact icon list comes from the parent's `ICONS` object at build time, not
from the manifest, minus `chevron` and `arrow`, which are the parent's own UI glyphs and
not menu icons **(Claude's call)**.

### Home card layout

`HOME_CARDS` is nested arrays. The form shows the Home cards the user has turned on
(`waiting`, `recent`, `requests`, `projects`, `billing`), in order, each with move
up/down and a "share a row with the card above" switch. The generator turns that into
the nested-array form the parent expects. Cards that are turned off are left out of the
list. If the user turns a card snippet on, it is appended to the layout in its own row
**(Claude's call)**.

### Page layout **(Claude's call, the usual single-column form)**

1. **Heading and caution.** What the page does, the README's warning that none of this
   is a documented Moxie API, and a link to the repo.
2. **Your settings.** Buttons: Load a saved file, Save as file, Paste from Moxie (opens
   a textarea; accepts the whole box contents or just the first line), Start over
   (confirm first).
3. **Everyone or some clients** (parent settings): client filter, task waiting statuses,
   request waiting statuses. These are explained in the README's words.
4. **Snippets.** One card per snippet with an on/off switch, the description, and the
   fields. When on, an "Add another copy for different clients" button appends a second
   copy with its own fields and its own filter, and a Remove button per copy. Each
   copy's `ONLY_FOR` filter appears last, labelled "Only for clients whose…".
5. **Home page layout**, shown when at least one Home card is on.
6. **Your paste.** Read-only textarea with the full output, a Copy button, a Download
   `.js` button, and the three install steps (open Settings > Client Portal > Advanced,
   paste over the box contents, save). Updated live as fields change.

Light validation, never blocking: numbers must be numbers, group `starts` must not be
empty, a logo URL should start with `http`. Problems show inline next to the field and
as a count above the paste. The paste is still generated.

### Config format (the JSON that is saved, downloaded and embedded)

```json
{
  "moxiePortalTool": 1,
  "parent": { "CLIENT_FILTER": null, "WAITING_STATUSES": ["Wait on client"], "TICKET_WAITING_STATUSES": [], "HOME_CARDS": [["waiting","recent"],["requests","projects"]] },
  "snippets": [
    { "id": "custom-css", "settings": { "CSS": ["#app { --v-sidebar-base: #1B5E20 !important; }"], "ONLY_FOR": { "ClientType": "TNC" } } },
    { "id": "custom-css", "settings": { "CSS": ["#app { --v-sidebar-base: #0D47A1 !important; }"], "ONLY_FOR": { "ClientType": "Agency" } } },
    { "id": "home-waiting", "settings": { "TITLE": "Needs your attention" } }
  ]
}
```

- `snippets` is ordered; order is output order. The same id may appear more than once.
- Setting values are the JavaScript values the snippet expects, as JSON. Settings equal
  to their default may be omitted; the generator fills defaults in.
- `moxiePortalTool` is the format version. Loading a file with a higher version shows a
  message asking the user to reload the page (the tool may be cached) and does nothing.
  Loading a file with unknown snippet ids or setting names drops them and tells the
  user what was dropped, by name, so a renamed setting is visible rather than silent.
- The same object is what goes in `localStorage` under one key, saved on every change,
  and what goes on the first line of the paste.

### Generation

`generate(config, bundle)` where `bundle` is the build's templates and defaults:

1. First line: `/* MoxiePortal settings: {…json…} */` on one line. The JSON is
   serialised with `*/` made safe (JSON allows `\/`, so every `/` that follows a `*` is
   written as `\/`) and with U+2028/U+2029 escaped.
2. The parent template with its four slots filled.
3. Each snippet copy in order, its template with every slot filled from the copy's
   settings, defaults where absent.
4. Slot values are serialised with `JSON.stringify`, which is valid JavaScript for every
   value these settings take (strings, numbers, arrays, plain objects, `null`). The
   output's quoting therefore differs from the source files' single quotes; that is
   fine, the paste is not meant to be hand-edited.
5. Blocks are separated by one blank line.

`parse(text)` reads the settings back: finds `/* MoxiePortal settings: ` at the start
(leading whitespace allowed), takes everything up to the first `*/` after it, across
line breaks in case Moxie's box ever rewraps the line, and `JSON.parse`s it. Anything
else is an error shown to the user ("This doesn't look like a paste made by this tool").

**Text in the box the tool did not generate (Claude's call).** The tool owns the whole
box. After reading the settings line, "Paste from Moxie" regenerates the paste from them
and compares it with the rest of what was pasted, ignoring whitespace. If they differ,
the user is told, before the form changes, that the box contains changes made outside
the tool (a hand-edited setting or an extra hand-written snippet) and that the new paste
will not include them, and may cancel. Nothing is carried through: the audience of this
tool does not hand-write snippets, and people who do can keep their extras below the
tool's output and re-add them after pasting. The README's "Changing or removing a
snippet later" section gains a sentence saying that a paste made by the tool is changed
by going back to the tool.

### Persistence

- `localStorage` key `moxiePortalTool.config`, written on every change (debounced is
  fine), read on load. Wrapped in try/catch; a browser with storage blocked still works
  for the session.
- "Save as file" downloads `moxie-portal-settings.json`. "Load a saved file" accepts a
  file picker or drag and drop onto the button.
- "Download .js" downloads the paste as `moxie-portal-embed.js` for people who prefer
  a file to a clipboard.

### Deployment **(Claude's call)**

A GitHub Actions workflow on push to `main`: `npm ci`, `npm test`, `node tool/build.js`,
upload `tool/dist` with `actions/upload-pages-artifact`, deploy with
`actions/deploy-pages`. Cathy turns on Pages with source "GitHub Actions" once in the
repo settings. The built file is never committed.

### Tests

- `tool-build.test.js`: running the build's extraction over the real `core/` and
  `snippets/` finds every manifest setting; no unlisted settings; defaults evaluate;
  stripped sources contain no comments (re-parse with acorn and assert zero comments);
  every stripped source still passes `node --check`-equivalent parsing.
- `test/helpers.js` gains a `source` option on `boot()` so a whole generated paste can
  be evaluated in place of `core/moxie-portal.js`; the parent's `if (window.MoxiePortal)
  return;` guard means the paste must be the first script in the window.
- `tool-generate.test.js`: a config with two `custom-css` copies and different
  `ONLY_FOR` filters generates a paste that parses, whose first line round-trips to the
  same config, that contains exactly one comment, and that, when loaded into the
  existing jsdom harness with a client matching the first filter, applies the first
  colour and not the second. A paste with apostrophes, double quotes, backslashes and
  `*/` in text settings still parses and round-trips. A config omitting settings gets
  the snippet's defaults. A `homeCards` layout round-trips through the form model to
  the nested-array form and back.
- Form behaviour is tested lightly in jsdom: enabling a snippet adds its block to the
  output; adding a copy adds a second block; loading a config with an unknown setting
  shows the dropped name.

## Left to the builder

- Visual design of the page, within "clean, readable, works on a phone". No design
  system is prescribed.
- Exact help text per field; start from the README's setting tables.
- Whether `stringList` uses chips or a one-per-line textarea.
- How the `renames` row suggests built-in menu names (datalist is enough).
- Debounce timing, file naming, and how the Copy button confirms.
- Whether the build also emits a `dist/tool-bundle.json` for debugging.

## Open questions

None. The builder check of 2026-10-18 raised two: unknown text in the Moxie box
(settled above as Claude's call: warn and regenerate) and the `schedule-groups`
defaults (settled by Cathy: neutral starter text in the tool, file unchanged).
