(function () {
  'use strict';

  var bundle = window.MoxiePortalToolBundle;
  var manifest = window.MoxiePortalToolManifest;
  var gen = window.MoxiePortalToolGenerate;

  var STORAGE_KEY = 'moxiePortalTool.config';
  var README_URL = 'https://github.com/cathysarisky/moxie-client-portal-widgets#';

  // ---------------------------------------------------------------------------
  // State and storage
  // ---------------------------------------------------------------------------

  // state.config is always full: every setting is present for the parent and every copy.
  var state = { config: null, problems: [] };
  // While true, save() leaves storage alone: set when the stored settings came from a newer tool.
  var holdSave = false;
  var storageNoted = false;

  function addMessage(text) {
    document.getElementById('mp-messages').appendChild(el('p', null, text));
  }

  // The storage note (data-mp-lasting) stays for the whole visit; action messages come and go.
  function clearMessages() {
    var box = document.getElementById('mp-messages');
    Array.prototype.slice.call(box.children).forEach(function (node) {
      if (!node.hasAttribute('data-mp-lasting')) box.removeChild(node);
    });
  }

  // An action's message replaces the last action's.
  function showMessage(text) {
    clearMessages();
    addMessage(text);
  }

  // Said once per visit, the first time storage fails.
  function noteStorageFailure() {
    if (storageNoted) return;
    storageNoted = true;
    var note = el('p', null, 'This browser won\'t remember your settings between visits. '
      + 'To keep them, use the Save settings file button.');
    note.setAttribute('data-mp-lasting', '');
    document.getElementById('mp-messages').appendChild(note);
  }

  function snippetDef(id) {
    for (var i = 0; i < manifest.snippets.length; i++) {
      if (manifest.snippets[i].id === id) return manifest.snippets[i];
    }
    return null;
  }

  function defaultOf(def, defaults) {
    return def.formDefault !== undefined ? def.formDefault : defaults[def.name];
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Values are JSON data. fillDefaults hands back the bundle's and manifest's own objects,
  // so every value that enters state.config is cloned and editors may change it in place.
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function strings(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(function (item) { return typeof item === 'string'; });
  }

  // Text that is empty or only spaces counts as left out.
  function filled(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  // A group as the snippet reads it: starts first, the optional parts only when filled in.
  function tidyGroup(group) {
    var out = { starts: typeof group.starts === 'string' ? group.starts : '' };
    if (filled(group.text)) out.text = group.text;
    if (group.onlyFor) out.onlyFor = group.onlyFor;
    if (group.notFor) out.notFor = group.notFor;
    return out;
  }

  function tidyRename(spec) {
    var out = {};
    if (filled(spec.label)) out.label = spec.label;
    if (filled(spec.icon)) out.icon = spec.icon;
    return out;
  }

  // The value shape of each type. A value of the wrong type (a hand-edited file,
  // damaged storage) becomes the type's empty value, so the form can always show it.
  var shapes = {
    text: function (value) { return typeof value === 'string' ? value : ''; },
    // An unreadable number stays as its text, so the problem shows again after a reload.
    number: function (value) {
      if (typeof value === 'number') return value;
      return typeof value === 'string' ? readNumber(value) : '';
    },
    stringList: strings,
    cssLines: strings,
    size: function (value) { return typeof value === 'number' || typeof value === 'string' ? value : ''; },
    filter: function (value) {
      if (!isPlainObject(value)) return null;
      var out = null;
      Object.keys(value).forEach(function (key) {
        var v = value[key];
        if (!key.trim() || (typeof v !== 'string' && typeof v !== 'number')) return;
        out = out || {};
        out[key] = String(v);
      });
      return out;
    },
    // 'none' hides the logo, a web address shows that image, '' keeps Moxie's, null follows the other logo.
    logo: function (value) { return typeof value === 'string' || value === null ? value : 'none'; },
    renames: function (value) {
      var out = {};
      if (!isPlainObject(value)) return out;
      Object.keys(value).forEach(function (name) {
        if (!name.trim()) return;
        out[name.trim()] = tidyRename(isPlainObject(value[name]) ? value[name] : {});
      });
      return out;
    },
    // A plain string is a group with only a start, as the snippet allows.
    groups: function (value) {
      if (!Array.isArray(value)) return [];
      var out = [];
      value.forEach(function (entry) {
        if (typeof entry === 'string') out.push({ starts: entry });
        else if (isPlainObject(entry)) {
          out.push(tidyGroup({ starts: entry.starts, text: entry.text,
            onlyFor: shapes.filter(entry.onlyFor), notFor: shapes.filter(entry.notFor) }));
        }
      });
      return out;
    },
    homeCards: function (value) { return Array.isArray(value) ? value : []; }
  };

  function shapeAll(defs, values) {
    defs.forEach(function (def) {
      if (shapes[def.type]) values[def.name] = shapes[def.type](values[def.name]);
    });
    return values;
  }

  function emptyConfig() {
    return {
      moxiePortalTool: gen.CONFIG_VERSION,
      parent: clone(gen.fillDefaults({}, manifest.parent.settings, bundle.parent.defaults)),
      snippets: []
    };
  }

  function newCopy(def) {
    return { id: def.id, settings: clone(gen.fillDefaults({}, def.settings, bundle.snippets[def.id].defaults)) };
  }

  // Takes the output of normalizeConfig and fills every missing setting with its default.
  function fullConfig(config) {
    var parentDefs = manifest.parent.settings;
    return {
      moxiePortalTool: gen.CONFIG_VERSION,
      parent: shapeAll(parentDefs, clone(gen.fillDefaults(config.parent, parentDefs, bundle.parent.defaults))),
      snippets: config.snippets.map(function (copy) {
        var defs = snippetDef(copy.id).settings;
        var settings = clone(gen.fillDefaults(copy.settings, defs, bundle.snippets[copy.id].defaults));
        return { id: copy.id, settings: shapeAll(defs, settings) };
      })
    };
  }

  function save() {
    if (holdSave) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch (e) {
      // Storage blocked or full: the page keeps working for this visit.
      noteStorageFailure();
    }
  }

  function storageReadable() {
    try {
      window.localStorage.getItem(STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    try {
      var text = window.localStorage.getItem(STORAGE_KEY);
      if (text) return fullConfig(gen.normalizeConfig(JSON.parse(text), manifest).config);
    } catch (e) {
      if (e && e.code === 'NEWER_VERSION') {
        holdSave = true;
        addMessage('Your saved settings were made by a newer version of this tool. Reload the page to update it.');
      } else if (!storageReadable()) {
        noteStorageFailure();
      }
      // Otherwise the saved settings are unreadable: start from a blank form.
    }
    return emptyConfig();
  }

  // ---------------------------------------------------------------------------
  // Editors: one per setting type. Each returns its root element, which carries
  // data-mp-field, and calls onChange(value) with the setting's new value.
  // ---------------------------------------------------------------------------

  var uid = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function nextId() {
    uid += 1;
    return 'mp-f' + uid;
  }

  function helpFor(def, root) {
    if (!def.help) return null;
    var help = el('p', 'mp-help', def.help);
    help.id = nextId();
    root.appendChild(help);
    return help;
  }

  // A field with one control: label, control, help underneath.
  function labelled(def, control) {
    var root = el('div', 'mp-field');
    root.setAttribute('data-mp-field', def.name);
    control.id = nextId();
    var label = el('label', 'mp-label', def.label);
    label.htmlFor = control.id;
    root.appendChild(label);
    root.appendChild(control);
    var help = helpFor(def, root);
    if (help) control.setAttribute('aria-describedby', help.id);
    return root;
  }

  // A field made of several controls: a fieldset with the label as its legend.
  function grouped(def, body) {
    var root = el('fieldset', 'mp-field');
    root.setAttribute('data-mp-field', def.name);
    root.appendChild(el('legend', 'mp-label', def.label));
    root.appendChild(body);
    helpFor(def, root);
    return root;
  }

  function textInput(value, type) {
    var input = el('input');
    input.type = type || 'text';
    input.value = value === null || value === undefined ? '' : String(value);
    return input;
  }

  // One entry per line; surrounding spaces and blank lines dropped.
  function lines(text) {
    return text.split(/\r?\n/).map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ''; });
  }

  function linesArea(list, onChange) {
    var area = el('textarea');
    area.rows = Math.max(3, list.length + 1);
    area.value = list.join('\n');
    area.addEventListener('input', function () { onChange(lines(area.value)); });
    return area;
  }

  // A number stays a number; an empty or unreadable entry is kept as text and flagged by checks.
  function readNumber(text) {
    var trimmed = text.trim();
    if (trimmed === '') return '';
    var n = Number(trimmed);
    return isNaN(n) ? trimmed : n;
  }

  // A plain integer is a number of pixels; anything else (80%, 10rem) stays text.
  function readSize(text) {
    var trimmed = text.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  }

  function filterRow(key, value, emit, remove) {
    var row = el('div', 'mp-filter-row');
    var keyInput = textInput(key);
    keyInput.className = 'mp-filter-key';
    keyInput.placeholder = 'e.g. ClientType';
    keyInput.setAttribute('aria-label', 'Custom field mapping key');
    var valueInput = textInput(value);
    valueInput.className = 'mp-filter-value';
    valueInput.placeholder = 'e.g. TNC';
    valueInput.setAttribute('aria-label', 'Value');
    var removeButton = el('button', 'mp-small', 'Remove');
    removeButton.type = 'button';
    keyInput.addEventListener('input', emit);
    valueInput.addEventListener('input', emit);
    removeButton.addEventListener('click', function () { remove(row); });
    row.appendChild(keyInput);
    row.appendChild(el('span', 'mp-filter-is', 'is'));
    row.appendChild(valueInput);
    row.appendChild(removeButton);
    return row;
  }

  function button(text) {
    var node = el('button', 'mp-small', text);
    node.type = 'button';
    return node;
  }

  // One control inside a row or choice, with its own small label.
  function part(text, control, className) {
    var box = el('div', className);
    control.id = nextId();
    var label = el('label', 'mp-sublabel', text);
    label.htmlFor = control.id;
    box.appendChild(label);
    box.appendChild(control);
    return box;
  }

  // Up and down buttons for row i of n; move(by) moves it by -1 or 1. what names the row.
  function moveButtons(i, n, what, move) {
    var box = el('div', 'mp-row-buttons');
    [['up', '↑', -1], ['down', '↓', 1]].forEach(function (spec) {
      var node = button(spec[1]);
      node.setAttribute('data-mp-move', spec[0]);
      node.setAttribute('aria-label', 'Move ' + what + ' ' + spec[0]);
      node.disabled = spec[2] < 0 ? i === 0 : i === n - 1;
      node.addEventListener('click', function () { move(spec[2]); });
      box.appendChild(node);
    });
    return box;
  }

  // After a move, focus goes to the moved row's same button, or its other one at the top or bottom.
  function moveFocus(row, by) {
    var same = row.querySelector('[data-mp-move="' + (by < 0 ? 'up' : 'down') + '"]');
    return same.disabled ? row.querySelector('[data-mp-move="' + (by < 0 ? 'down' : 'up') + '"]') : same;
  }

  // Repeatable rows over opts.drafts, one plain object per row that the editor owns and edits.
  // opts.draw(draft, i, buttons) builds a row; buttons(what, movable) makes its move and remove
  // buttons. Adding, moving or removing a row redraws the rows, reports the value with
  // opts.emit(), and focuses the nearest row's control matching opts.first, or the add button.
  function rowList(opts) {
    var drafts = opts.drafts;
    var body = el('div');
    var rows = el('div', 'mp-rows');
    var add = button(opts.addText);
    add.setAttribute('data-mp-add-row', '');
    function changed(focus) {
      draw();
      opts.emit();
      focus().focus();
    }
    function firstIn(row) {
      return row ? row.querySelector(opts.first) : add;
    }
    function buttonsFor(i) {
      return function (what, movable) {
        var box = movable ? moveButtons(i, drafts.length, what, function (by) {
          var moved = drafts[i];
          drafts[i] = drafts[i + by];
          drafts[i + by] = moved;
          changed(function () { return moveFocus(rows.children[i + by], by); });
        }) : el('div', 'mp-row-buttons');
        var remove = button('Remove');
        remove.setAttribute('data-mp-remove-row', '');
        remove.setAttribute('aria-label', 'Remove ' + what);
        remove.addEventListener('click', function () {
          drafts.splice(i, 1);
          changed(function () { return firstIn(rows.children[i] || rows.children[i - 1]); });
        });
        box.appendChild(remove);
        return box;
      };
    }
    function draw() {
      clear(rows);
      drafts.forEach(function (draft, i) {
        var row = opts.draw(draft, i, buttonsFor(i));
        row.setAttribute('data-mp-row', '');
        rows.appendChild(row);
      });
    }
    add.addEventListener('click', function () {
      drafts.push(opts.blank());
      changed(function () { return firstIn(rows.lastChild); });
    });
    draw();
    body.appendChild(rows);
    body.appendChild(add);
    return body;
  }

  var BUILT_IN_LINKS = ['Home', 'Projects', 'Meetings', 'Requests', 'Invoices', 'Files', 'Time'];
  // The icon select's value for "Custom SVG": never an icon name, which is a plain identifier.
  var CUSTOM_ICON = '(custom)';

  // 'listChecks' reads as 'List checks'.
  function iconName(icon) {
    var words = icon.replace(/([A-Z])/g, ' $1').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function cardName(card) {
    for (var i = 0; i < manifest.snippets.length; i++) {
      if (manifest.snippets[i].card === card) return manifest.snippets[i].name;
    }
    return card;
  }

  // Each editor first puts its value into its type's shape, so a wrong type never throws.
  var editors = {
    text: function (def, value, onChange) {
      var input = textInput(shapes.text(value));
      input.addEventListener('input', function () { onChange(input.value); });
      return labelled(def, input);
    },

    number: function (def, value, onChange) {
      var input = textInput(shapes.number(value), 'number');
      input.step = '1';
      input.className = 'mp-short';
      input.addEventListener('input', function () { onChange(readNumber(input.value)); });
      return labelled(def, input);
    },

    stringList: function (def, value, onChange) {
      return labelled(def, linesArea(shapes.stringList(value), onChange));
    },

    // No soft wrapping, so each visible line is one rule.
    cssLines: function (def, value, onChange) {
      var area = linesArea(shapes.cssLines(value), onChange);
      area.className = 'mp-code';
      area.wrap = 'off';
      return labelled(def, area);
    },

    size: function (def, value, onChange) {
      var input = textInput(shapes.size(value));
      input.className = 'mp-short';
      input.addEventListener('input', function () { onChange(readSize(input.value)); });
      return labelled(def, input);
    },

    // Rows of custom field + value. No row with a field name means every client (null).
    filter: function (def, value, onChange) {
      var body = el('div', 'mp-filter');
      var rows = el('div', 'mp-filter-rows');
      function collect() {
        var out = null;
        Array.prototype.forEach.call(rows.children, function (row) {
          var key = row.querySelector('.mp-filter-key').value.trim();
          if (!key) return;
          out = out || {};
          out[key] = row.querySelector('.mp-filter-value').value.trim();
        });
        onChange(out);
      }
      function remove(row) {
        if (rows.children.length > 1) rows.removeChild(row);
        else rows.replaceChild(filterRow('', '', collect, remove), row);
        collect();
      }
      var filter = shapes.filter(value) || {};
      var keys = Object.keys(filter);
      if (!keys.length) rows.appendChild(filterRow('', '', collect, remove));
      keys.forEach(function (key) { rows.appendChild(filterRow(key, filter[key], collect, remove)); });
      var add = el('button', 'mp-small', 'Add another field');
      add.type = 'button';
      add.addEventListener('click', function () {
        var row = filterRow('', '', collect, remove);
        rows.appendChild(row);
        row.querySelector('.mp-filter-key').focus();
      });
      body.appendChild(rows);
      body.appendChild(add);
      return grouped(def, body);
    },

    // Hide, show an image from a web address, keep Moxie's, or (with sameAs) follow the other logo.
    // checks.logo flags an address that is not a full one.
    logo: function (def, value, onChange) {
      var current = shapes.logo(value);
      var chosen = current === null ? (def.sameAs ? 'same' : 'keep')
        : current === 'none' ? 'hide' : current === '' ? 'keep' : 'image';
      var body = el('div', 'mp-choices');
      var group = nextId();
      var radios = {};
      var url = textInput(chosen === 'image' ? current : '', 'url');
      url.placeholder = 'https://example.com/logo.png';
      var urlBox = part('Web address of the image', url, 'mp-logo-url');
      urlBox.setAttribute('data-mp-part', 'url');
      urlBox.hidden = chosen !== 'image';
      // An image with no address yet keeps Moxie's logo ('') until one is typed.
      function emit() {
        urlBox.hidden = !radios.image.checked;
        if (radios.hide.checked) onChange('none');
        else if (radios.image.checked) onChange(url.value.trim());
        else if (radios.keep.checked) onChange('');
        else onChange(null);
      }
      var choices = [['hide', 'Hide it'], ['image', 'Show my own image'], ['keep', 'Keep Moxie\'s own image']];
      if (def.sameAs) choices.unshift(['same', 'Same as the expanded logo']);
      choices.forEach(function (choice) {
        var input = el('input');
        input.type = 'radio';
        input.name = group;
        input.value = choice[0];
        input.checked = choice[0] === chosen;
        input.addEventListener('change', emit);
        radios[choice[0]] = input;
        var label = el('label', 'mp-choice');
        label.appendChild(input);
        label.appendChild(document.createTextNode(choice[1]));
        body.appendChild(label);
        if (choice[0] === 'image') body.appendChild(urlBox);
      });
      url.addEventListener('input', emit);
      return grouped(def, body);
    },

    // Rows of built-in link, new name and icon. A row with no link name is left out.
    renames: function (def, value, onChange, ctx) {
      var icons = ctx.bundle.icons;
      var renames = shapes.renames(value);
      var drafts = Object.keys(renames).map(function (name) {
        var icon = renames[name].icon || '';
        return { name: name, label: renames[name].label || '', icon: icon, custom: icon !== '' && icons.indexOf(icon) < 0 };
      });
      var suggestions = el('datalist');
      suggestions.id = nextId();
      BUILT_IN_LINKS.forEach(function (name) {
        var option = el('option');
        option.value = name;
        suggestions.appendChild(option);
      });
      var options = [['', 'Keep Moxie\'s icon']]
        .concat(icons.map(function (icon) { return [icon, iconName(icon)]; }), [[CUSTOM_ICON, 'Custom SVG']]);
      function emit() {
        var out = {};
        drafts.forEach(function (d) {
          if (filled(d.name)) out[d.name.trim()] = tidyRename(d);
        });
        onChange(out);
      }
      function draw(d, i, buttons) {
        var row = el('div', 'mp-row mp-rename-row');
        var name = textInput(d.name);
        name.className = 'mp-rename-name';
        name.setAttribute('list', suggestions.id);
        name.addEventListener('input', function () { d.name = name.value; emit(); });
        var label = textInput(d.label);
        label.className = 'mp-rename-label';
        label.addEventListener('input', function () { d.label = label.value; emit(); });
        var select = el('select');
        options.forEach(function (o) {
          var option = el('option', null, o[1]);
          option.value = o[0];
          select.appendChild(option);
        });
        select.value = d.custom ? CUSTOM_ICON : d.icon;
        var svg = el('textarea', 'mp-code');
        svg.rows = 2;
        svg.value = d.custom ? d.icon : '';
        svg.placeholder = '<circle cx="12" cy="12" r="9"/>';
        var svgBox = part('SVG code for the icon', svg, 'mp-wide');
        svgBox.hidden = !d.custom;
        select.addEventListener('change', function () {
          d.custom = select.value === CUSTOM_ICON;
          d.icon = d.custom ? svg.value : select.value;
          svgBox.hidden = !d.custom;
          emit();
        });
        svg.addEventListener('input', function () { d.icon = svg.value; emit(); });
        row.appendChild(part('Built-in link', name));
        row.appendChild(part('New name', label));
        row.appendChild(part('Icon', select));
        row.appendChild(buttons('menu link ' + (i + 1), false));
        row.appendChild(svgBox);
        return row;
      }
      var body = rowList({
        drafts: drafts, draw: draw, emit: emit, first: '.mp-rename-name', addText: 'Add a menu link',
        blank: function () { return { name: '', label: '', icon: '', custom: false }; }
      });
      body.appendChild(suggestions);
      return grouped(def, body);
    },

    // Groups in page order, each with its own client filters. checks.groups flags an empty start.
    groups: function (def, value, onChange) {
      var drafts = shapes.groups(value).map(function (g) {
        return { starts: g.starts, text: g.text || '', onlyFor: g.onlyFor || null, notFor: g.notFor || null };
      });
      function emit() { onChange(drafts.map(tidyGroup)); }
      function filterPart(g, key, label) {
        return editors.filter({ name: key, label: label }, g[key], function (v) { g[key] = v; emit(); });
      }
      function draw(g, i, buttons) {
        var row = el('fieldset', 'mp-row');
        row.appendChild(el('legend', 'mp-sublabel', 'Group ' + (i + 1)));
        var grid = el('div', 'mp-group-row');
        var starts = textInput(g.starts);
        starts.className = 'mp-group-starts';
        starts.placeholder = 'e.g. Developer time:';
        starts.addEventListener('input', function () { g.starts = starts.value; emit(); });
        var startsBox = part('Link names start with', starts);
        startsBox.setAttribute('data-mp-part', String(i));
        var text = el('textarea');
        text.rows = 2;
        text.value = g.text;
        text.addEventListener('input', function () { g.text = text.value; emit(); });
        grid.appendChild(startsBox);
        grid.appendChild(buttons('group ' + (i + 1), true));
        grid.appendChild(part('Explanation under the heading', text, 'mp-wide'));
        grid.appendChild(filterPart(g, 'onlyFor', 'Only for clients whose…'));
        grid.appendChild(filterPart(g, 'notFor', 'Hidden from clients whose…'));
        row.appendChild(grid);
        return row;
      }
      return grouped(def, rowList({
        drafts: drafts, draw: draw, emit: emit, first: '.mp-group-starts', addText: 'Add group',
        blank: function () { return { starts: '', text: '', onlyFor: null, notFor: null }; }
      }));
    },

    // The Home cards that are on (ctx.enabledCards), in page order. Moving swaps two cards'
    // places; each place keeps its "share a row" tick, so the rows keep their shape.
    homeCards: function (def, value, onChange, ctx) {
      var layout = gen.homeCardsToLayout(shapes.homeCards(value), ctx.enabledCards);
      var list = el('ol', 'mp-rows mp-layout');
      function emit() { onChange(gen.layoutToHomeCards(layout)); }
      function draw() {
        clear(list);
        layout.forEach(function (item, i) {
          var row = el('li', 'mp-row mp-layout-row');
          row.setAttribute('data-mp-card', item.card);
          var name = cardName(item.card);
          row.appendChild(el('span', 'mp-layout-name', name));
          var share = el('input');
          share.type = 'checkbox';
          share.checked = !item.newRow;
          share.disabled = i === 0;
          share.addEventListener('change', function () { item.newRow = !share.checked; emit(); });
          var label = el('label', 'mp-choice');
          label.appendChild(share);
          label.appendChild(document.createTextNode('Share a row with the card above'));
          row.appendChild(label);
          row.appendChild(moveButtons(i, layout.length, name, function (by) {
            var card = item.card;
            item.card = layout[i + by].card;
            layout[i + by].card = card;
            draw();
            emit();
            moveFocus(list.children[i + by], by).focus();
          }));
          list.appendChild(row);
        });
      }
      draw();
      return grouped(def, list);
    }
  };

  // ---------------------------------------------------------------------------
  // Structure: the parent section and one card per snippet, rebuilt by renderAll().
  // ---------------------------------------------------------------------------

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Renders defs into container, editing values in place. path prefixes data-mp-path for problems.
  function renderFields(container, defs, values, path) {
    var nodes = {};
    var ctx = { values: values, bundle: bundle, manifest: manifest };

    function build(def) {
      var node = editors[def.type](def, values[def.name], function (value) { update(def, value); }, ctx);
      node.setAttribute('data-mp-path', path + '.' + def.name);
      return node;
    }

    // A setting with defaultFrom follows its sources until the user gives it their own value.
    function update(def, value) {
      var before = {};
      Object.keys(values).forEach(function (name) { before[name] = values[name]; });
      values[def.name] = value;
      defs.forEach(function (other) {
        if (other === def || !other.defaultFrom) return;
        if (!same(values[other.name], other.defaultFrom(before))) return;
        values[other.name] = other.defaultFrom(values);
        var fresh = build(other);
        container.replaceChild(fresh, nodes[other.name]);
        nodes[other.name] = fresh;
      });
      onChange();
    }

    defs.forEach(function (def) {
      nodes[def.name] = build(def);
      container.appendChild(nodes[def.name]);
    });
  }

  function renderParent() {
    var root = document.getElementById('mp-parent');
    clear(root);
    root.appendChild(el('h2', null, 'Everyone or some clients'));
    root.appendChild(el('p', 'mp-intro', 'These settings apply to every snippet you turn on below.'));
    // HOME_CARDS has its own section, #mp-home-layout.
    var defs = manifest.parent.settings.filter(function (def) { return def.type !== 'homeCards'; });
    renderFields(root, defs, state.config.parent, 'parent');
  }

  function copiesOf(id) {
    return state.config.snippets.filter(function (copy) { return copy.id === id; });
  }

  function renderCopy(def, copy, number, total) {
    var section = el('section', 'mp-copy');
    section.setAttribute('data-mp-snippet', def.id);
    if (total > 1) section.appendChild(el('h4', null, 'Copy ' + number));
    renderFields(section, def.settings, copy.settings, 'snippets.' + state.config.snippets.indexOf(copy));
    var remove = el('button', 'mp-small', 'Remove this copy');
    remove.type = 'button';
    remove.setAttribute('data-mp-remove', '');
    remove.hidden = total < 2;
    remove.addEventListener('click', function () { removeCopy(copy); });
    section.appendChild(remove);
    return section;
  }

  function renderCard(def) {
    var copies = copiesOf(def.id);
    var card = el('div', 'mp-card' + (copies.length ? ' mp-on' : ''));
    var heading = el('h3');
    var label = el('label');
    var toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = copies.length > 0;
    toggle.setAttribute('data-mp-toggle', def.id);
    toggle.addEventListener('change', function () { setSnippetOn(def, toggle); });
    label.appendChild(toggle);
    label.appendChild(document.createTextNode(def.name));
    heading.appendChild(label);
    card.appendChild(heading);
    var desc = el('p', 'mp-desc', def.description + ' ');
    var link = el('a', null, 'Details in the README');
    link.href = README_URL + def.readme.replace(/^#/, '');
    link.target = '_blank';
    link.rel = 'noopener';
    desc.appendChild(link);
    card.appendChild(desc);
    if (!copies.length) return card;
    copies.forEach(function (copy, i) { card.appendChild(renderCopy(def, copy, i + 1, copies.length)); });
    var add = el('button', null, 'Add another copy for different clients');
    add.type = 'button';
    add.setAttribute('data-mp-add-copy', def.id);
    add.addEventListener('click', function () { addCopy(def); });
    card.appendChild(add);
    return card;
  }

  function renderSnippets() {
    var root = document.getElementById('mp-snippets');
    clear(root);
    root.appendChild(el('h2', null, 'Snippets'));
    root.appendChild(el('p', 'mp-intro', 'Turn on the snippets you want and fill in their settings. '
      + 'To give different clients different settings, add another copy and fill in its client filter.'));
    manifest.snippets.forEach(function (def) { root.appendChild(renderCard(def)); });
  }

  // The Home cards of the snippets that are on, each once, in manifest order.
  function enabledCards() {
    var cards = [];
    manifest.snippets.forEach(function (def) {
      if (def.card && cards.indexOf(def.card) < 0 && copiesOf(def.id).length) cards.push(def.card);
    });
    return cards;
  }

  // The layout lists exactly the cards that are on, so every rebuild first brings the setting
  // up to date: a card just turned on joins at the end in its own row, one turned off drops out.
  function renderHomeLayout() {
    var root = document.getElementById('mp-home-layout');
    var def = manifest.parent.settings.filter(function (d) { return d.type === 'homeCards'; })[0];
    var values = state.config.parent;
    var cards = enabledCards();
    values[def.name] = gen.layoutToHomeCards(gen.homeCardsToLayout(shapes.homeCards(values[def.name]), cards));
    clear(root);
    root.hidden = !cards.length;
    if (!cards.length) return;
    var field = editors.homeCards(def, values[def.name], function (value) {
      values[def.name] = value;
      onChange();
    }, { values: values, bundle: bundle, manifest: manifest, enabledCards: cards });
    // The section heading is the field's legend, so the section has one heading, not two.
    var legend = field.querySelector('legend');
    clear(legend);
    legend.appendChild(el('h2', null, 'Home page layout'));
    root.appendChild(field);
  }

  function renderAll() {
    renderParent();
    renderSnippets();
    renderHomeLayout();
  }

  function focusOn(focus) {
    var target = focus && focus();
    if (target) target.focus();
  }

  // Structural actions change the list of copies and rebuild the form. The control the user
  // just used is gone after the rebuild, so focus moves to what focus() returns.
  function restructure(focus) {
    renderAll();
    onChange();
    focusOn(focus);
  }

  // Shows the settings make() returns. Settings the form cannot show (an editor throws on
  // them) must not leave a blank page, so fallback()'s are shown instead. Saves nothing;
  // returns whether make()'s settings are the ones showing.
  function showConfig(make, fallback) {
    try {
      state.config = make();
      renderAll();
      refreshOutput();
      return true;
    } catch (e) {
      state.config = fallback();
      renderAll();
      refreshOutput();
      return false;
    }
  }

  function first(selector) {
    return document.querySelector(selector);
  }

  function setSnippetOn(def, toggle) {
    if (toggle.checked) {
      state.config.snippets.push(newCopy(def));
    } else {
      var copies = copiesOf(def.id);
      if (copies.length > 1 && !window.confirm('Turn off ' + def.name + ' and remove all '
        + copies.length + ' copies with their settings?')) {
        toggle.checked = true;
        return;
      }
      state.config.snippets = state.config.snippets.filter(function (copy) { return copy.id !== def.id; });
    }
    restructure(function () { return first('[data-mp-toggle="' + def.id + '"]'); });
  }

  // A new copy goes right after the snippet's last copy, so a snippet's copies stay together.
  function addCopy(def) {
    var copies = copiesOf(def.id);
    var at = state.config.snippets.indexOf(copies[copies.length - 1]) + 1;
    state.config.snippets.splice(at, 0, newCopy(def));
    restructure(function () {
      var section = document.querySelectorAll('[data-mp-snippet="' + def.id + '"]')[copies.length];
      return section.querySelector('input, textarea, select');
    });
  }

  function removeCopy(copy) {
    state.config.snippets = state.config.snippets.filter(function (c) { return c !== copy; });
    restructure(function () { return first('[data-mp-add-copy="' + copy.id + '"]'); });
  }

  // ---------------------------------------------------------------------------
  // Output and problems
  // ---------------------------------------------------------------------------

  // Checks per type: report(message, part) records a problem, optionally with one part of the
  // field (its data-mp-part); the return value goes in the paste.
  var checks = {
    number: function (value, fallback, report) {
      if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value) return value;
      report('Needs a whole number; using the default ' + fallback);
      return fallback;
    },
    // Kept as typed: the snippet just shows a broken image.
    logo: function (value, fallback, report) {
      if (typeof value === 'string' && value !== 'none' && value !== '' && value.indexOf('http') !== 0) {
        report('Needs a full web address starting with https://', 'url');
      }
      return value;
    },
    // Kept as typed: the snippet skips a group with no start.
    groups: function (value, fallback, report) {
      shapes.groups(value).forEach(function (group, i) {
        if (!filled(group.starts)) report('Needs the start of the link names', i);
      });
      return value;
    }
  };

  // Returns the config to paste (problem values replaced) and the problems found.
  function checkConfig(config) {
    var problems = [];
    var paste = JSON.parse(JSON.stringify(config));
    function checkAll(defs, values, defaults, path) {
      defs.forEach(function (def) {
        var check = checks[def.type];
        if (!check) return;
        var fieldPath = path + '.' + def.name;
        values[def.name] = check(values[def.name], defaultOf(def, defaults), function (message, part) {
          problems.push({ path: fieldPath, part: part, message: message });
        });
      });
    }
    checkAll(manifest.parent.settings, paste.parent, bundle.parent.defaults, 'parent');
    paste.snippets.forEach(function (copy, i) {
      checkAll(snippetDef(copy.id).settings, copy.settings, bundle.snippets[copy.id].defaults, 'snippets.' + i);
    });
    return { config: paste, problems: problems };
  }

  function showProblems() {
    var n = state.problems.length;
    var summary = n === 1 ? '1 thing to check' : n + ' things to check';
    document.getElementById('mp-problems').textContent = n ? summary : '';
    Array.prototype.forEach.call(document.querySelectorAll('.mp-problem'), function (node) {
      var control = node.parentNode.querySelector('input, textarea');
      if (control) {
        control.removeAttribute('aria-invalid');
        var rest = (control.getAttribute('aria-describedby') || '').split(' ')
          .filter(function (id) { return id && id !== node.id; }).join(' ');
        if (rest) control.setAttribute('aria-describedby', rest);
        else control.removeAttribute('aria-describedby');
      }
      node.parentNode.removeChild(node);
    });
    var fields = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-mp-path]'), function (node) {
      fields[node.getAttribute('data-mp-path')] = node;
    });
    state.problems.forEach(function (problem) {
      var field = fields[problem.path];
      if (!field) return;
      // A problem with one part of a field (a group, the logo's address) shows at that part.
      var at = problem.part === undefined ? field
        : field.querySelector('[data-mp-part="' + problem.part + '"]') || field;
      var note = el('p', 'mp-problem', problem.message);
      note.id = nextId();
      at.appendChild(note);
      var control = at.querySelector('input, textarea');
      if (!control) return;
      control.setAttribute('aria-invalid', 'true');
      var described = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', described ? described + ' ' + note.id : note.id);
    });
  }

  function refreshOutput() {
    var checked = checkConfig(state.config);
    state.problems = checked.problems;
    document.getElementById('mp-output').value = gen.generate(checked.config, bundle, manifest);
    showProblems();
  }

  function onChange() {
    holdSave = false;
    save();
    refreshOutput();
  }

  // ---------------------------------------------------------------------------
  // Actions: settings file, paste from Moxie, start over, copy and download
  // ---------------------------------------------------------------------------

  var NOT_SETTINGS_FILE = 'That file isn\'t a settings file from this tool.';
  var NEWER_FILE = 'This file was made by a newer version of the tool. Reload the page and try again.';
  var NEWER_PASTE = 'That paste was made by a newer version of the tool. Reload the page and try again.';
  var NOT_TOOL_PASTE = 'This doesn\'t look like a paste made by this tool.';
  var NOT_LOADED = 'Those settings couldn\'t be loaded.';
  var EDITED_PASTE = 'The box contains changes made outside this tool. They won\'t be in the new paste. '
    + 'Load the settings anyway?';
  var START_OVER = 'Start over with a blank form? Your saved settings in this browser will be cleared.';

  var copyButton = document.getElementById('mp-copy');
  var copyLabel = copyButton.textContent;
  var copyTimer = null;
  var loadInput = document.getElementById('mp-load-json');
  var pasteArea = document.getElementById('mp-paste');
  var pasteText = document.getElementById('mp-paste-text');

  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var link = el('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Once the click has started the download; Safari needs a moment.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copied() {
    copyButton.textContent = 'Copied';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { copyButton.textContent = copyLabel; }, 2000);
  }

  // For a browser without the clipboard API, or one that refuses it.
  function copyBySelecting() {
    var output = document.getElementById('mp-output');
    output.focus();
    output.select();
    var done = false;
    try {
      done = document.execCommand('copy');
    } catch (e) {
      // Not copied: the script is selected, so the user can copy it themselves.
    }
    if (done) copied();
    else showMessage('This browser wouldn\'t copy the script. It\'s selected now: copy it with your keyboard or menu.');
  }

  function copyOutput() {
    var text = document.getElementById('mp-output').value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(copied, copyBySelecting);
    } else {
      copyBySelecting();
    }
  }

  // Replaces the form with normalizeConfig's result, shared by the settings file and the paste.
  // Settings the form cannot show leave the form and storage as they were.
  // Returns whether the settings were loaded.
  function useConfig(normalized, focus) {
    var previous = state.config;
    var loaded = showConfig(function () { return fullConfig(normalized.config); },
      function () { return previous; });
    if (!loaded) {
      showMessage(NOT_LOADED);
      return false;
    }
    holdSave = false;
    save();
    focusOn(focus);
    if (normalized.dropped.length) {
      addMessage('Ignored settings this version doesn\'t know: ' + normalized.dropped.join(', '));
    }
    return true;
  }

  function loadConfigText(text) {
    clearMessages();
    var normalized;
    try {
      normalized = gen.normalizeConfig(JSON.parse(text), manifest);
    } catch (e) {
      addMessage(e && e.code === 'NEWER_VERSION' ? NEWER_FILE : NOT_SETTINGS_FILE);
      return Promise.resolve();
    }
    useConfig(normalized);
    return Promise.resolve();
  }

  // The settings line rebuilds the form. A box whose script differs from what those settings
  // make was edited by hand, and the new paste would lose the edits, so the user decides.
  // Saying no to the warning changes nothing, messages included.
  function applyPaste(text) {
    var normalized;
    var regenerated;
    try {
      normalized = gen.normalizeConfig(gen.parseSettingsLine(text), manifest);
      regenerated = gen.generate(fullConfig(normalized.config), bundle, manifest);
    } catch (e) {
      showMessage(e && e.code === 'NEWER_VERSION' ? NEWER_PASTE : NOT_TOOL_PASTE);
      return Promise.resolve();
    }
    if (!gen.bodyMatches(text, regenerated) && !window.confirm(EDITED_PASTE)) return Promise.resolve();
    clearMessages();
    if (useConfig(normalized, function () { return first('#mp-paste-open'); })) {
      pasteArea.hidden = true;
      pasteText.value = '';
    }
    return Promise.resolve();
  }

  function startOver() {
    if (!window.confirm(START_OVER)) return;
    state.config = emptyConfig();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Storage blocked: there is nothing saved to clear.
    }
    clearMessages();
    restructure();
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  document.getElementById('mp-load-json-button').addEventListener('click', function () { loadInput.click(); });
  loadInput.addEventListener('change', function () {
    var file = loadInput.files && loadInput.files[0];
    // Cleared, so choosing the same file again loads it again.
    loadInput.value = '';
    if (!file) return;
    readText(file).then(loadConfigText, function () {
      showMessage('That file couldn\'t be opened. Try choosing it again.');
    });
  });
  document.getElementById('mp-save-json').addEventListener('click', function () {
    download('moxie-portal-settings.json', JSON.stringify(state.config, null, 2), 'application/json');
  });
  document.getElementById('mp-paste-open').addEventListener('click', function () {
    pasteArea.hidden = false;
    pasteText.focus();
  });
  document.getElementById('mp-paste-apply').addEventListener('click', function () { applyPaste(pasteText.value); });
  document.getElementById('mp-reset').addEventListener('click', startOver);
  copyButton.addEventListener('click', copyOutput);
  document.getElementById('mp-download-js').addEventListener('click', function () {
    download('moxie-portal-embed.js', document.getElementById('mp-output').value, 'text/javascript');
  });

  // For the tests, which cannot use a real file dialog.
  window.__mpTool = { loadConfigText: loadConfigText, applyPaste: applyPaste };

  // Saved settings that cannot be shown must not leave a blank page on every visit: fall back
  // to a blank form. Storage keeps the saved settings until the user changes something.
  showConfig(load, emptyConfig);
}());
