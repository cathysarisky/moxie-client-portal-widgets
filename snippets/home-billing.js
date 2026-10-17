/* MoxiePortal snippet: "Billing" Home card.
 * Shows the same totals as the portal's Invoices > Reports tab, the hours Moxie has not
 * invoiced yet (priced at the rate Moxie stamped on each entry), and the client's net
 * position: a credit remaining, all settled, or a balance due.
 * Paste below the MoxiePortal parent script. */
(function () {
  var TITLE = 'Billing';
  var INVOICES_HEADING = 'Invoices';
  var UNBILLED_HEADING = 'Not yet invoiced';
  var NET_HEADING = 'Where you stand';
  // Label of the big number when the client has credit, owes nothing, or owes money.
  var CREDIT_LABEL = 'Credit remaining';
  var DUE_LABEL = 'Balance due';
  var SETTLED_LABEL = 'All settled';
  var EMPTY_UNBILLED = 'Nothing waiting to be invoiced.';
  var INVOICES_LINK = 'View invoices';
  var TIME_LINK = 'View time worked';
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  // Invoice statuses the Reports tab counts, and the subset that still owes money.
  var COUNTED = ['SENT', 'PARTIAL', 'PAID', 'WRITE-OFF'];
  var UNPAID = ['SENT', 'PARTIAL'];

  var CSS = [
    '#mp-billing .mp-billing-section { padding: 12px 16px; border-bottom: 1px solid var(--portal-border); }',
    '#mp-billing .mp-billing-section:last-of-type { border-bottom: 0; }',
    '#mp-billing .mp-section-title { margin: 0 0 8px; color: var(--portal-muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }',
    '#mp-billing .mp-stats { display: grid; gap: 6px; }',
    '#mp-billing .mp-stat { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }',
    '#mp-billing .mp-stat-label { color: var(--portal-muted); }',
    '#mp-billing .mp-stat-value { color: var(--portal-text); font-variant-numeric: tabular-nums; text-align: right; }',
    '#mp-billing .mp-billing-section .mp-empty { padding: 0; }'
  ].join('\n');

  // Fetches what the card needs; empty when the matching feature is off for the client.
  function load(portal) {
    var f = portal.features();
    return Promise.all([
      f.invoicesEnabled ? portal.api('/invoices') : [],
      f.invoicesEnabled ? portal.api('/deposits').then(null, function () { return null; }) : null,
      f.timeEnabled ? portal.api('/timer') : []
    ]).then(function (res) {
      return {
        invoices: Array.isArray(res[0]) ? res[0] : [],
        deposits: res[1] && typeof res[1] === 'object' ? res[1] : null,
        entries: Array.isArray(res[2]) ? res[2] : []
      };
    });
  }

  function invoiceStats(invoices, deposits) {
    var out = { invoiced: 0, paid: 0, unpaidCount: 0, unpaidDue: 0, deposits: null };
    invoices.forEach(function (inv) {
      if (COUNTED.indexOf(inv.status) === -1) return;
      out.invoiced += Number(inv.total) || 0;
      out.paid += Number(inv.paymentTotal) || 0;
      if (UNPAID.indexOf(inv.status) !== -1) {
        out.unpaidCount++;
        var due = inv.amountDue != null ? Number(inv.amountDue) : (Number(inv.total) || 0) - (Number(inv.paymentTotal) || 0);
        out.unpaidDue += due || 0;
      }
    });
    if (deposits && Number(deposits.liabilities) > 0) out.deposits = deposits;
    return out;
  }

  function section(portal, key, heading) {
    var node = portal.el('section', 'mp-billing-section');
    node.setAttribute('data-mp-section', key);
    node.appendChild(portal.el('h4', 'mp-section-title', heading));
    return node;
  }

  function stat(portal, list, label, value) {
    var row = portal.el('div', 'mp-stat');
    row.appendChild(portal.el('span', 'mp-stat-label', label));
    row.appendChild(portal.el('span', 'mp-stat-value', value));
    list.appendChild(row);
  }

  function invoicesSection(portal, inv) {
    var node = section(portal, 'invoices', INVOICES_HEADING);
    var list = portal.el('div', 'mp-stats');
    stat(portal, list, 'Total invoiced', portal.money(inv.invoiced));
    stat(portal, list, 'Total paid', portal.money(inv.paid));
    stat(portal, list, 'Unpaid invoices', inv.unpaidCount ? inv.unpaidCount + ' · ' + portal.money(inv.unpaidDue) : 'None');
    if (inv.deposits) {
      stat(portal, list, 'Deposits collected', portal.money(inv.deposits.liabilities));
      stat(portal, list, 'Deposits applied', portal.money(inv.deposits.credits));
      stat(portal, list, 'Balance remaining', portal.money(inv.deposits.balance));
    }
    node.appendChild(list);
    return node;
  }

  function render(portal) {
    var f = portal.features();
    if (!f.invoicesEnabled && !f.timeEnabled) return false;
    return load(portal).then(function (data) {
      var card = portal.card({ title: TITLE, icon: portal.icons.receipt, openPath: f.invoicesEnabled ? '/invoices?v=list' : '/time?v=list' });
      var inv = invoiceStats(data.invoices, data.deposits);
      if (f.invoicesEnabled) card.appendChild(invoicesSection(portal, inv));
      return card;
    });
  }

  MoxiePortal.ready(function (portal) {
    portal.style(CSS);
    portal.home.mount({
      name: 'billing',
      render: function () { return render(portal); }
    });
  }, { onlyFor: ONLY_FOR });
})();
