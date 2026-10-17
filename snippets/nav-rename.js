/* MoxiePortal snippet: rename menu links.
 * Gives Moxie's built-in left-menu links a different name and icon, and renames the
 * matching page heading. Paste below the MoxiePortal parent script. */
(function () {
  // Built-in menu names and what to show instead. `label` is the new menu text, tooltip
  // and page heading. `icon` is a name from the parent's icon set, such as 'calendar',
  // or your own SVG markup such as '<circle cx="12" cy="12" r="9"/>'. Leave either out
  // to keep the portal's own.
  var RENAMES = {
    Meetings: { label: 'Schedule time', icon: 'calendar' }
  };
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;

  MoxiePortal.ready(function (portal) {
    var ATTR = 'data-mp-renamed';
    var live = true;
    var touched = [];   // what we changed, so cleanup can put it back

    // Records the portal's own value the first time we change something, and the value we
    // put there, so cleanup restores only what is still ours.
    function remember(node, kind, value, set) {
      for (var i = 0; i < touched.length; i++) {
        if (touched[i].node === node && touched[i].kind === kind) { touched[i].set = set; return; }
      }
      touched.push({ node: node, kind: kind, value: value, set: set });
    }

    // Icons this snippet brings along, so it also works with an older parent script.
    var LOCAL_ICONS = {
      calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>'
    };

    // An icon name from the parent or the list above, or raw SVG markup. A name nobody
    // knows leaves the portal's own icon in place.
    function iconMarkup(icon) {
      if (!icon) return null;
      var markup = portal.icons[icon] || LOCAL_ICONS[icon] || String(icon);
      return markup.indexOf('<') === -1 ? null : markup;
    }

    function setAttr(node, name, value) {
      if (node.getAttribute(name) === value) return;
      remember(node, 'attr:' + name, node.getAttribute(name), value);
      node.setAttribute(name, value);
    }

    function setText(node, value) {
      if (node.textContent === value) return;
      remember(node, 'text', node.textContent, value);
      node.textContent = value;
    }

    function applyLink(btn, name, spec) {
      var label = spec.label || null;
      var icon = iconMarkup(spec.icon);
      if (btn.getAttribute(ATTR) !== name) btn.setAttribute(ATTR, name);
      if (label) {
        setAttr(btn, 'aria-label', label);
        setAttr(btn, 'content', label);
        var span = btn.querySelector('.nav-label');
        if (span && span.textContent.trim() === name) setText(span, label);
      }
      if (icon) {
        var svg = btn.querySelector('.nav-icon-shell svg');
        if (svg && svg.getAttribute('data-mp-icon') !== name) {
          remember(svg, 'svg', svg.innerHTML, null);
          svg.innerHTML = icon;
          svg.setAttribute('data-mp-icon', name);
        }
      }
    }

    function applyHeading(name, spec) {
      if (!spec.label) return;
      var spans = document.querySelectorAll('.tabs-component .module-title span');
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].textContent.trim() === name) setText(spans[i], spec.label);
      }
    }

    function apply() {
      if (!live) return;
      var btns = document.querySelectorAll('#left-nav .portal-nav-link');
      Object.keys(RENAMES).forEach(function (name) {
        var spec = RENAMES[name] || {};
        for (var i = 0; i < btns.length; i++) {
          var aria = (btns[i].getAttribute('aria-label') || '').trim();
          var ours = btns[i].getAttribute(ATTR) === name && aria === spec.label;
          if (aria === name || ours) applyLink(btns[i], name, spec);
        }
        applyHeading(name, spec);
      });
    }

    apply();
    portal.onDom(apply);
    portal.onRoute(apply);

    return function () {
      live = false;
      touched.reverse().forEach(function (t) {
        if (!t.node.isConnected) return;
        if (t.kind === 'svg') {
          if (t.node.hasAttribute('data-mp-icon')) { t.node.innerHTML = t.value; t.node.removeAttribute('data-mp-icon'); }
        } else if (t.kind === 'text') {
          if (t.node.textContent === t.set) t.node.textContent = t.value;
        } else {
          var attr = t.kind.slice(5);
          if (t.node.getAttribute(attr) !== t.set) return;
          if (t.value == null) t.node.removeAttribute(attr); else t.node.setAttribute(attr, t.value);
        }
      });
      var marked = document.querySelectorAll('[' + ATTR + ']');
      for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(ATTR);
    };
  }, { onlyFor: ONLY_FOR });
})();
