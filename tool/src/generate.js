(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoxiePortalToolGenerate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG_VERSION = 1;
  var SETTINGS_PREFIX = '/* MoxiePortal settings: ';

  function fail(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function escapeLineSeparators(text) {
    return text.replace(/[\u2028\u2029]/g, function (ch) {
      return ch === '\u2028' ? '\\u2028' : '\\u2029';
    });
  }

  // A literal closing tag would end an inline script element early, so it is written as <\/,
  // which JSON and JavaScript both read back as </.
  function escapeClosingTags(text) {
    return text.replace(/<\//g, '<\\/');
  }

  function serializeSettings(config) {
    return escapeClosingTags(escapeLineSeparators(JSON.stringify(config))).replace(/\*\//g, '*\\/');
  }

  function settingsLine(config) {
    return SETTINGS_PREFIX + serializeSettings(config) + ' */';
  }

  function parseSettingsLine(text) {
    var body = String(text).replace(/^\s+/, '');
    if (body.indexOf(SETTINGS_PREFIX) !== 0) {
      throw fail('NOT_TOOL_PASTE', 'This does not start with a MoxiePortal settings line.');
    }
    var end = body.indexOf('*/', SETTINGS_PREFIX.length);
    if (end < 0) throw fail('BAD_JSON', 'The settings line is not closed.');
    try {
      return JSON.parse(body.slice(SETTINGS_PREFIX.length, end));
    } catch (e) {
      throw fail('BAD_JSON', 'The settings line is not valid JSON.');
    }
  }

  function fillDefaults(settings, defs, defaults) {
    var out = {};
    var own = settings || {};
    defs.forEach(function (def) {
      if (has(own, def.name)) out[def.name] = own[def.name];
      else if (def.formDefault !== undefined) out[def.name] = def.formDefault;
      else out[def.name] = defaults[def.name];
    });
    return out;
  }

  function renderTemplate(template, values) {
    return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (all, name) {
      return escapeClosingTags(escapeLineSeparators(JSON.stringify(values[name])));
    });
  }

  function findSnippetDef(manifest, id) {
    for (var i = 0; i < manifest.snippets.length; i++) {
      if (manifest.snippets[i].id === id) return manifest.snippets[i];
    }
    return null;
  }

  function generate(config, bundle, manifest) {
    var blocks = [];
    var parentValues = fillDefaults(config.parent, manifest.parent.settings, bundle.parent.defaults);
    blocks.push(renderTemplate(bundle.parent.template, parentValues).trim());
    (config.snippets || []).forEach(function (copy) {
      var def = findSnippetDef(manifest, copy.id);
      if (!def || !has(bundle.snippets, copy.id)) throw new Error('Unknown snippet: ' + copy.id);
      var built = bundle.snippets[copy.id];
      var values = fillDefaults(copy.settings, def.settings, built.defaults);
      blocks.push(renderTemplate(built.template, values).trim());
    });
    return settingsLine(config) + '\n' + blocks.join('\n\n') + '\n';
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeConfig(raw, manifest) {
    if (!isPlainObject(raw) || typeof raw.moxiePortalTool !== 'number') {
      throw fail('NOT_CONFIG', 'This is not a MoxiePortal settings file.');
    }
    if (raw.moxiePortalTool > CONFIG_VERSION) {
      throw fail('NEWER_VERSION', 'These settings were saved by a newer version of the tool.');
    }
    var copy = JSON.parse(JSON.stringify(raw));
    var dropped = [];
    var parentNames = manifest.parent.settings.map(function (s) { return s.name; });
    var parent = {};
    var rawParent = isPlainObject(copy.parent) ? copy.parent : {};
    Object.keys(rawParent).forEach(function (name) {
      if (parentNames.indexOf(name) < 0) dropped.push('parent: ' + name);
      else parent[name] = rawParent[name];
    });
    var snippets = [];
    (Array.isArray(copy.snippets) ? copy.snippets : []).forEach(function (entry) {
      var def = isPlainObject(entry) ? findSnippetDef(manifest, entry.id) : null;
      if (!def) {
        dropped.push('snippet: ' + (isPlainObject(entry) ? entry.id : entry));
        return;
      }
      var names = def.settings.map(function (s) { return s.name; });
      var settings = {};
      var rawSettings = isPlainObject(entry.settings) ? entry.settings : {};
      Object.keys(rawSettings).forEach(function (name) {
        if (names.indexOf(name) < 0) dropped.push(def.id + ': ' + name);
        else settings[name] = rawSettings[name];
      });
      snippets.push({ id: def.id, settings: settings });
    });
    copy.parent = parent;
    copy.snippets = snippets;
    return { config: copy, dropped: dropped };
  }

  function homeCardsToLayout(homeCards, enabledCards) {
    var layout = [];
    var seen = {};
    function add(card, newRow) {
      if (enabledCards.indexOf(card) < 0 || has(seen, card)) return false;
      seen[card] = true;
      layout.push({ card: card, newRow: newRow });
      return true;
    }
    (homeCards || []).forEach(function (row) {
      var first = true;
      (Array.isArray(row) ? row : [row]).forEach(function (card) {
        if (add(card, first)) first = false;
      });
    });
    enabledCards.forEach(function (card) { add(card, true); });
    return layout;
  }

  function layoutToHomeCards(layout) {
    var rows = [];
    layout.forEach(function (item) {
      if (item.newRow || !rows.length) rows.push([item.card]);
      else rows[rows.length - 1].push(item.card);
    });
    return rows;
  }

  function stripSettings(text) {
    var body = String(text).replace(/^\s+/, '');
    if (body.indexOf(SETTINGS_PREFIX) === 0) {
      var end = body.indexOf('*/', SETTINGS_PREFIX.length);
      if (end >= 0) body = body.slice(end + 2);
    }
    return body.replace(/\s+/g, '');
  }

  function bodyMatches(pasteText, regenerated) {
    return stripSettings(pasteText) === stripSettings(regenerated);
  }

  return {
    CONFIG_VERSION: CONFIG_VERSION,
    SETTINGS_PREFIX: SETTINGS_PREFIX,
    serializeSettings: serializeSettings,
    settingsLine: settingsLine,
    parseSettingsLine: parseSettingsLine,
    fillDefaults: fillDefaults,
    renderTemplate: renderTemplate,
    generate: generate,
    normalizeConfig: normalizeConfig,
    homeCardsToLayout: homeCardsToLayout,
    layoutToHomeCards: layoutToHomeCards,
    bodyMatches: bodyMatches
  };
}));
