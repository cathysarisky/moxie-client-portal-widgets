(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoxiePortalToolManifest = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ONLY_FOR_HELP = 'Run this only for clients whose custom fields match, for example ClientType is TNC. '
    + 'It works on top of the main client filter. Leave it empty to run for every client the main filter allows.';

  var NAMES = {
    'logo': 'Logo',
    'custom-css': 'Custom styles',
    'nav-tasks-link': 'Tasks menu link',
    'nav-rename': 'Rename menu links',
    'schedule-groups': 'Schedule groups',
    'home-waiting': 'Waiting on you card',
    'home-recent': 'Recently updated card',
    'home-requests': 'Requests card',
    'home-projects': 'Projects card',
    'home-billing': 'Billing card'
  };

  function snippet(id, description, card, settings, internal) {
    return {
      id: id,
      name: NAMES[id],
      description: description,
      readme: '#' + id,
      card: card,
      internal: internal || [],
      settings: settings.concat([
        { name: 'ONLY_FOR', type: 'filter', label: 'Only for clients whose…', help: ONLY_FOR_HELP }
      ])
    };
  }

  var snippets = [
    snippet('logo', 'Hides the workspace logo above the menu, or shows a different image in its place.', null, [
      { name: 'LOGO_CHANGE', type: 'logo', label: 'Logo while the menu is open',
        help: 'Hide the logo, show your own image from a web address, or leave the workspace logo alone.' },
      { name: 'LOGO_COLLAPSED', type: 'logo', sameAs: 'LOGO_CHANGE', label: 'Small logo while the menu is collapsed',
        help: 'Hide it, show a different image such as a square icon, leave the portal\'s own small image alone, or use the same as the open-menu logo.' },
      { name: 'LOGO_WIDTH', type: 'size', label: 'Logo width',
        help: 'In pixels, or a percentage such as 80%. Leave empty to keep the portal\'s sizing.' },
      { name: 'LOGO_HEIGHT', type: 'size', label: 'Logo height',
        help: 'In pixels. Leave empty to keep the portal\'s sizing. When only one side is given the image keeps its proportions.' }
    ]),
    snippet('custom-css', 'Adds your own style rules, for every client or only for the clients you name.', null, [
      { name: 'CSS', type: 'cssLines', label: 'Style rules',
        help: 'One rule per line. Use double quotes inside a rule, as in url("https://...").' }
    ]),
    snippet('nav-tasks-link', 'Adds a Tasks menu item that opens the client\'s task board for their first project.', null, [
      { name: 'TASKS_LABEL', type: 'text', label: 'Menu text', help: 'The menu text and its tooltip.' }
    ]),
    snippet('nav-rename', 'Gives built-in menu links a different name and icon, and renames the page heading to match.', null, [
      { name: 'RENAMES', type: 'renames', label: 'Menu links to rename',
        help: 'Pick a built-in link by the name Moxie shows, then give it a new name and icon. Leave the name or icon empty to keep the portal\'s own.' }
    ]),
    snippet('schedule-groups', 'Sorts the booking links on Meetings > Schedule now into groups by the start of their names.', null, [
      { name: 'GROUPS', type: 'groups', label: 'Booking link groups',
        help: 'Name your booking links in Moxie with a shared start, such as "Developer time: 1 hour". Each group is that start, an optional explanation shown under the heading, and optionally which clients see it.',
        formDefault: [
          { starts: 'Developer time:', text: 'Asynchronous work on your site. Leave a note when booking if you\'d like a kick-off call.' },
          { starts: 'Meeting:', text: 'Synchronous calls. Meeting time is billed, so consider a task or ticket for simple requests.' }
        ] },
      { name: 'OTHER_LABEL', type: 'text', label: 'Heading for other links',
        help: 'Heading for booking links that match no group. Leave empty to show them last without a heading.' }
    ]),
    snippet('home-waiting', 'Home card listing the tasks and requests that are waiting on the client.', 'waiting', [
      { name: 'TITLE', type: 'text', label: 'Card title' },
      { name: 'EMPTY', type: 'text', label: 'Text when nothing is waiting' },
      { name: 'BOARD_LINK', type: 'text', label: 'Task board link text' },
      { name: 'TICKET_PREFIX', type: 'text', label: 'Text before each request number',
        help: 'Shown before the ticket number in each request row.' }
    ]),
    snippet('home-recent', 'Home card showing the latest comment or change on each task.', 'recent', [
      { name: 'TITLE', type: 'text', label: 'Card title' },
      { name: 'DAYS', type: 'number', label: 'Days to look back',
        help: 'Only updates from the last this-many days are shown.' },
      { name: 'EMPTY', type: 'text', label: 'Text when there are no updates',
        help: 'Follows the number of days until you change it.',
        defaultFrom: function (v) { return 'No updates in the last ' + v.DAYS + ' days.'; } },
      { name: 'MAX_ROWS', type: 'number', label: 'Most rows to show' }
    ]),
    snippet('home-requests', 'Replaces the Home Requests card with every open ticket for the client.', 'requests', [
      { name: 'TITLE', type: 'text', label: 'Card title' },
      { name: 'EMPTY', type: 'text', label: 'Text when there are no open requests' },
      { name: 'MAX_ROWS', type: 'number', label: 'Most rows to show' }
    ]),
    snippet('home-projects', 'Replaces the Home Projects card with the client\'s actual projects.', 'projects', [
      { name: 'TITLE', type: 'text', label: 'Card title' },
      { name: 'MAX_ROWS', type: 'number', label: 'Most rows to show' }
    ]),
    snippet('home-billing', 'Home card showing where the client stands with you: invoices, time not yet invoiced, and the net balance.', 'billing', [
      { name: 'TITLE', type: 'text', label: 'Card title' },
      { name: 'INVOICES_HEADING', type: 'text', label: 'Invoices heading' },
      { name: 'UNBILLED_HEADING', type: 'text', label: 'Not yet invoiced heading' },
      { name: 'NET_HEADING', type: 'text', label: 'Where you stand heading' },
      { name: 'CREDIT_LABEL', type: 'text', label: 'Label when credit remains' },
      { name: 'DUE_LABEL', type: 'text', label: 'Label when a balance is due' },
      { name: 'SETTLED_LABEL', type: 'text', label: 'Label when all is settled' },
      { name: 'EMPTY_UNBILLED', type: 'text', label: 'Text when nothing is waiting to be invoiced' },
      { name: 'INVOICES_LINK', type: 'text', label: 'Invoices link text' },
      { name: 'TIME_LINK', type: 'text', label: 'Time link text' }
    ], ['COUNTED', 'UNPAID', 'CSS'])
  ];

  return {
    parent: {
      internal: ['ICONS', 'snippets', 'active', 'portal'],
      settings: [
        { name: 'CLIENT_FILTER', type: 'filter', label: 'Only for clients whose…',
          help: 'Decides which clients see any of the snippets. A client passes when every field matches; case and surrounding spaces are ignored. Leave it empty for every client.' },
        { name: 'WAITING_STATUSES', type: 'stringList', label: 'Task statuses that mean the client needs to act',
          help: 'The Waiting on you card shows these tasks and the Projects card counts them. Must match your project status names, apart from case.' },
        { name: 'TICKET_WAITING_STATUSES', type: 'stringList', label: 'Request statuses that mean the client needs to act',
          help: 'The Waiting on you card shows these requests above its tasks. Must match your ticket status names, apart from case.' },
        { name: 'HOME_CARDS', type: 'homeCards', label: 'Home card layout',
          help: 'Each row holds one or more cards that sit side by side and stack on a phone. Order here is order on the page.' }
      ]
    },
    snippets: snippets,
    cardNames: {
      'home-waiting': 'waiting',
      'home-recent': 'recent',
      'home-requests': 'requests',
      'home-projects': 'projects',
      'home-billing': 'billing'
    }
  };
}));
