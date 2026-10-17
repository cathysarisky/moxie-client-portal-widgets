# "Billing" Home card for the Moxie client portal

Date: 2026-10-17
Status: design written by Claude from a conversation with Cathy; to be built by an agent
that can sign in to the portal. Decisions marked **(Claude's call)** were not discussed
with Cathy and may be overridden; decisions marked **(Cathy)** are hers.

## Intent

Clients should see, on the portal Home page, where they stand with Cathy financially
without opening the Invoices page and doing arithmetic. Today the portal's
Invoices > Reports tab shows lifetime totals (invoiced, paid, deposits) and the
Time > Time entries tab shows hours flagged "Not invoiced", but nothing combines them.
A client with a deposit on account and a week of unbilled work cannot tell whether
they still have credit or already owe money.

The card has three parts **(Cathy)**:

1. the numbers the Reports tab already shows, so the card agrees with that tab;
2. "hours not yet invoiced", from the Time worked tab's entries with no invoice;
3. "the real situation": the Reports tab's "Balance remaining" corrected for unpaid
   invoices and unbilled work, labelled as a credit when positive and as money owed
   when negative.

## Goals

- One more paste-in snippet, `snippets/home-billing.js`, in the style of the existing
  `home-*.js` cards, registered with `portal.home.mount({ name: 'billing', ... })`.
- Numbers that match what the client sees on Invoices > Reports and Time > Time entries
  for the same data, so the card never contradicts Moxie's own pages.
- Works for a client with no deposit account, no time entries, or no invoices: each
  part degrades to "none" rather than breaking the card.
- Usable by other Moxie users (the repo's audience): settings at the top of the file,
  no Spectral-specific text, ES5, `mp-` prefix, jsdom test.

## Non-goals

- Payment plans, subscriptions, retainer periods and late fees. The card reads
  invoices, deposits and time entries only.
- A date range picker. The card is lifetime, like the Reports tab with no filter.
- Replacing a built-in Home card. The portal has no billing card to replace.
- Changing Moxie's rounding rules. The unbilled amount is an estimate and is labelled
  as one.
- Any change to the Invoices or Time pages themselves.

## Anti-goals (what would make this a failure)

- Showing a client "Balance due" when Moxie would not actually bill them, e.g. counting
  draft invoices, voided invoices, or non-billable time. When in doubt, leave it out
  and say so in the explanation line.
- Double counting deposits: an unpaid invoice's amount due in Moxie is already net of
  any deposit credit applied to it, and the deposit balance is already net of those
  credits. Subtract each once.
- A card that renders half-filled or flashes. Use the parent's render contract (return
  a promise of the finished node, or `false` to render nothing).

## What is known about the data (bundle read 2026-10-17, live JSON captured the same day)

All paths are relative to `pod01.withmoxie.com/api/v1/{accountId}/portal/{clientId}`,
which is what `portal.api(path)` prepends. Field names were first read from
`https://clients.spectralwebservices.com/js/app.e5b05a06.js` and then confirmed with
live JSON for the test client (contact -64 on `6ac7a884eb72740f3f5d08f9`), saved at
`/tmp/claude-1000/-home-cathy-moxie-ticket/a89e3054-8d3f-4bc8-a67e-5c0244da73ab/scratchpad/billing_data.json`.
Use that file to build the jsdom fixtures.

| Source | Call | Fields that matter |
|---|---|---|
| Invoices page | `GET /invoices` (no query string; the portal filters by `dateSent` client-side) | `status` (bundle knows DRAFT, PENDING, SENT, PARTIAL, PAID, VOIDED, WRITE-OFF), `total` (already net of deposit credit), `creditAmount` (deposit credit applied), `itemSubtotal`, `paymentTotal`, `amountDue`, `fullyPaid`, `dateSent`, `dateDue`, `daysPastDue`, `payments[].datePaid`, `invoiceNumberFormatted`, `id`, `currency` |
| Reports tab deposits | `GET /deposits` | `liabilities` ("Deposits collected"), `credits` ("Deposits applied"), `balance` ("Balance remaining"), plus a `transactions` ledger (type LIABILITY or CREDIT, invoiceNumber, amount) the card does not need |
| Time entries tab | `GET /timer` (no query string returns everything; `earliest`/`latest` ISO params are optional) | `billable`, `billingStatus` (`UN-BILLED` or `BILLED`), `billingReason` (seen `CLIENT_HOURLY`, `INVOICED`), `billingRate` (number while un-billed, null once billed), `billingCurrency`, `unbilledSeconds`, `duration` (seconds), `wasRounded`, `invoiceId`, `invoiceNumber`, `timerStart`, `projectId`, `projectName`, `deliverableName`, `ticketId`, `ticketName`, `notes` |
| Projects | `GET /projects` (already `portal.data.projects()`) | `feeSchedule { feeType: 'Hourly' \| 'Fixed Price' \| 'Retainer' \| 'Per Item', amount, ... }`, `showTimeWorkedInPortal`, `id`, `name` |

Live sample that the fixtures and tests should reproduce: deposit invoice TCW-2026-11
for $100, PAID by bank transfer; hourly invoice TCW-2026-13 with one HOURS item of 0.32
h at $100 (subtotal $32) fully covered by deposit credit, so `creditAmount` 32,
`total` 0, `amountDue` 0, status PAID with no payments; deposits `liabilities` 100,
`credits` 32, `balance` 68; one BILLED entry (1140 s, `billingRate` null) and one
UN-BILLED billable entry (300 s, `billingRate` 100, `billingReason` CLIENT_HOURLY).
Expected card: Total invoiced $100.00, Total paid $100.00, no unpaid invoices,
Deposits collected $100.00, applied $32.00, Balance remaining $68.00; Not yet invoiced
0:05 (1 entry), about $8.33; Credit remaining $59.67.

How the Reports tab computes its tiles (component `invoice-charts`):

- It only exists when `features.summaryFinancialsEnabled` is true for the client.
- Total invoiced = sum of `total`; Total payments = sum of `paymentTotal`; both over
  invoices with status in `SENT, PARTIAL, PAID, WRITE-OFF`.
- Deposit tiles come straight from the deposits object and are shown only when it is
  non-null.
- Money is formatted with the store's `defaultCurrency` (default `"USD"`; `locale`
  defaults to `"en-US"`). Invoices carry their own `currency`, but the Reports tab sums
  `total` in the default currency, so the card does the same.

How the Time entries tab decides "Not invoiced": `invoiced = !!entry.invoiceId`.
It displays durations as `h:mm:ss`. The portal's own pages never show a rate, but the
entries carry one: Moxie stamps every un-billed entry with `billingRate` (resolved from
the client's or project's hourly settings, `billingReason` says which) and
`unbilledSeconds`. That is exactly what Moxie will put on the next invoice, so the card
uses it and needs no rate setting of its own.

Deposit timing, confirmed live: the deposit credit was applied when the invoice was
sent, lowering the invoice `total` and `amountDue` and the deposit `balance` at the
same moment. An unpaid invoice's `amountDue` is therefore already net of any credit,
and the net formula below subtracts each amount once.

Feature flags in `portal.features()`: `invoicesEnabled`, `timeEnabled`,
`summaryFinancialsEnabled`, plus the existing `projectsEnabled`, `ticketsEnabled`.

## The card

Title "Billing" **(Claude's call; a `TITLE` setting)**, icon: a receipt, added to the
parent's `ICONS` as `receipt` the same way `calendar` was added for schedule-groups.
The header arrow opens `/invoices?v=list`. No count badge.

Body is three stacked sections. Each is a short label list, not clickable rows (there is
nothing to open per line). Add a small `.mp-stats` style in the snippet via
`portal.style()` for a two-column label/value grid, muted labels, right-aligned values.

### 1. "Invoices" (mirrors the Reports tab)

Shown when `features.invoicesEnabled`. Rows, in order:

- Total invoiced: same formula as the Reports tab.
- Total paid: same formula.
- Unpaid invoices: count and sum of `amountDue` over status `SENT` or `PARTIAL`. If
  `amountDue` turns out not to exist, use `total - paymentTotal`.
- Deposits collected, Deposits applied, Balance remaining: only when the deposits
  object is non-null and `liabilities > 0`; values straight from it.

**(Claude's call)** Show the first two rows even when `summaryFinancialsEnabled` is false,
because the raw invoice list is visible to the client anyway and the sums are the same
numbers they could add up. If Cathy would rather hide them when Moxie hides the Reports
tab, gate the whole section on `summaryFinancialsEnabled` instead; this is a one-line
change and a `SHOW_TOTALS` setting could expose it.

### 2. "Not yet invoiced"

Shown when `features.timeEnabled`. Over time entries with `billingStatus === 'UN-BILLED'`
and `billable !== false` (fall back to "no `invoiceId`" if `billingStatus` is missing):

- Hours: total of `unbilledSeconds` (fall back to `duration`) as `h:mm`; the Time tab
  shows `h:mm:ss`, the card drops the seconds.
- Entries: count, and "since <date of the oldest>" when there is at least one.
- Estimated amount: sum over priced entries of `unbilledSeconds / 3600 * billingRate`,
  rounded to cents at the end, shown as "about $X". When some unbilled hours could not
  be priced, add "(+ h:mm not priced)"; when none could, the row reads "not priced yet".

When there are no unbilled entries the section shows one line, "Nothing waiting to be
invoiced." **(Claude's call on wording; make it a setting.)**

### 3. "Where you stand"

Always shown when at least one of the sections above rendered. One big number and one
explanation line.

```
net = depositBalance - unpaidInvoices - unbilledEstimate
```

- `depositBalance` is `deposits.balance`, or 0 with no deposit account.
- `unpaidInvoices` is the "Unpaid invoices" sum from section 1 (0 if invoices are off).
- `unbilledEstimate` is the priced part of section 2 (0 if time is off or nothing could
  be priced; any not-priced hours are named in the explanation line as not included).

Label and sign **(Claude's call, Cathy asked what to call it)**:

| net | Big number | Label |
|---|---|---|
| > 0 | net | "Credit remaining" |
| = 0 | $0.00 | "All settled" |
| < 0 | abs(net) | "Balance due" |

"Balance due" is the phrase Moxie already prints on every invoice the client sees, so
it needs no explaining. The alternative Cathy may prefer is "Amount owed". Both labels
are settings (`CREDIT_LABEL`, `DUE_LABEL`, `SETTLED_LABEL`).

Explanation line, built from the parts that are non-zero, e.g.
"Deposit balance $500.00 − unpaid invoices $120.00 − unbilled work about $210.00 (2:48 at
$75/hr)". When the rate is unknown and there are unbilled hours, append "· 2:48 of
unbilled time not included".

Footer links (parent `portal.footer`): "View invoices" → `/invoices?v=list` when invoices
are on; "View time worked" → `/time?v=list` when time is on.

### Rate for unbilled hours **(settled by the live data)**

An entry is priced when its `billingRate` is a number greater than zero: amount =
`unbilledSeconds / 3600 * billingRate`. Anything else (null rate, which is what Moxie
gives time on fixed-price or retainer projects, or an unknown `billingReason`) is "not
priced": its hours still count in section 2's hour total and entry count, but it stays
out of the net and the explanation line in section 3 names it, so the client knows the
net is incomplete. Non-billable entries (`billable === false`) are left out entirely.
There is no rate setting in the snippet; Moxie's own rate resolution is the source of
truth, and a card that disagreed with the next invoice would be worse than one that
says "not priced".

### Date range

Lifetime: call `/invoices` and `/timer` with no query string, as the portal itself can.
This also keeps `test/helpers.js` simple, since its `responses` map matches the full
path including any query. If live testing shows either endpoint truncates without a
range, add a `SINCE` setting (default two years) and say "since <date>" in the section
headings. **(Claude's call.)**

### Currency and number formatting

Add `portal.money(amount)` to the parent: `Intl.NumberFormat(store.state.locale,
{ style: 'currency', currency: store.state.defaultCurrency || 'USD' })`, with a plain
`'$' + amount.toFixed(2)` fallback when `Intl` throws on an unknown code. Add
`portal.hours(seconds)` returning `h:mm`. Both are generic enough to belong in the parent
(the precedent is `timeAgo` and `formatDue`), and both get a test in `test/core.test.js`.

### Caching

Fetch inside the snippet with `portal.api()`; the parent's `cached()` helper is private
and only one snippet needs these calls. Fetch `/deposits`, `/invoices…`, `/timer…` and
`portal.data.projects()` in one `Promise.all`. Treat a 404 or a null body from
`/deposits` as "no deposit account", not as an error; any other failure rejects, and the
parent's `renderCard` logs it and drops the card (existing behaviour).

## Files to touch

```
core/moxie-portal.js          add ICONS.receipt, portal.money, portal.hours
snippets/home-billing.js      the card (new)
test/core.test.js             tests for money and hours
test/home-billing.test.js     jsdom test of the card via loadSnippet (new)
README.md                     "home-billing" section under "## Snippets", list the
                              settings, and mention 'billing' as a HOME_CARDS name
```

`HOME_CARDS` in the parent keeps its default; a pasted `billing` card not named there
appears after the named rows, one per row, as the parent already does. README tells
users to add `'billing'` to `HOME_CARDS` to position it.

## Still unverified (the live capture covered one client with two invoices)

1. Deposits: the response when a client has no deposit account (null, `{}` or 404).
   Treat all three as "no account".
2. Whether DRAFT or PENDING invoices are ever returned to the portal. The status filter
   handles them either way.
3. A SENT or PARTIAL invoice with a non-zero `amountDue` (the live sample had none).
   The filter `status in (SENT, PARTIAL)` and `amountDue` are both confirmed to exist.
4. `billingReason` values other than `CLIENT_HOURLY` and `INVOICED`, e.g. for time on
   a fixed-price project; the rule above only needs `billingRate` to be null for them.

A helper for capturing the JSON without a browser is at
`/tmp/claude-1000/-home-cathy-moxie-ticket/a89e3054-8d3f-4bc8-a67e-5c0244da73ab/scratchpad/fetch_billing.py`.
Run once with a magic link (single-use); it saves `session.json` (a 7-day refresh
token) beside itself, after which running it with no token refreshes the session and
extra arguments name further paths to fetch, e.g. `invoices timer`.

Keep portal loads few and spaced: `auth.withmoxie.com` sits behind a firewall that
blocks the whole IP after roughly 15 loads in 5 minutes (see memory notes). Test layout
in jsdom; use the live portal only for the final look.

## Build notes

- Branch `feature/home-billing` off `main`; follow the repo's conventions (ES5 browser
  code, `mp-` prefix, settings at the top with comments written for non-programmers,
  `npm test` green, `node --check` on every file via `pretest`).
- Test via `test/helpers.js` `loadSnippet(t, 'home-billing', settings)`; check whether
  its `responses` map matches on exact path or prefix, because the invoice and timer
  calls carry query strings.
- Commit with the usual attribution; do not push unless Cathy asks.
- Gate first with `ONLY_FOR = { ClientType: 'TEST' }` in the live portal, as Cathy does
  for her other experiments, then set it to `null` for the shipped file.

## Open decisions for Cathy (change the design, not just the wording)

1. Hide the invoice totals when Moxie hides the Reports tab (`summaryFinancialsEnabled`
   false), or show them anyway as designed?
2. "Balance due" versus "Amount owed" for the negative case.
