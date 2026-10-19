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

  // The value shape of each simple type. A value of the wrong type (a hand-edited file,
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
    }
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
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch (e) {
      // Storage blocked or full: the page keeps working for this visit.
    }
  }

  function load() {
    try {
      var text = window.localStorage.getItem(STORAGE_KEY);
      if (text) return fullConfig(gen.normalizeConfig(JSON.parse(text), manifest).config);
    } catch (e) {
      // Unreadable or blocked storage: start from a blank form.
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
    }
  };

  // Types without an editor yet: the setting keeps its value and the form says so.
  function noEditor(def) {
    var root = el('div', 'mp-field');
    root.setAttribute('data-mp-field', def.name);
    root.appendChild(el('p', 'mp-label', def.label));
    root.appendChild(el('p', 'mp-help', 'This setting can\'t be edited here yet. The paste keeps its current value.'));
    return root;
  }

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
      var editor = editors[def.type] || noEditor;
      var node = editor(def, values[def.name], function (value) { update(def, value); }, ctx);
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

  function renderAll() {
    renderParent();
    renderSnippets();
  }

  // Structural actions change the list of copies and rebuild the form. The control the user
  // just used is gone after the rebuild, so focus moves to what focus() returns.
  function restructure(focus) {
    renderAll();
    onChange();
    var target = focus && focus();
    if (target) target.focus();
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

  // Checks per type: report(message) records a problem; the return value goes in the paste.
  var checks = {
    number: function (value, fallback, report) {
      if (typeof value === 'number' && isFinite(value) && Math.floor(value) === value) return value;
      report('Needs a whole number; using the default ' + fallback);
      return fallback;
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
        values[def.name] = check(values[def.name], defaultOf(def, defaults), function (message) {
          problems.push({ path: fieldPath, message: message });
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
      node.parentNode.removeChild(node);
    });
    var fields = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-mp-path]'), function (node) {
      fields[node.getAttribute('data-mp-path')] = node;
    });
    state.problems.forEach(function (problem) {
      var field = fields[problem.path];
      if (field) field.appendChild(el('p', 'mp-problem', problem.message));
    });
  }

  function refreshOutput() {
    var checked = checkConfig(state.config);
    state.problems = checked.problems;
    document.getElementById('mp-output').value = gen.generate(checked.config, bundle, manifest);
    showProblems();
  }

  function onChange() {
    save();
    refreshOutput();
  }

  // Saved settings that cannot be shown must not leave a blank page on every visit: fall back
  // to a blank form. Storage keeps the saved settings until the user changes something.
  state.config = load();
  try {
    renderAll();
    refreshOutput();
  } catch (e) {
    state.config = emptyConfig();
    renderAll();
    refreshOutput();
  }
}());
