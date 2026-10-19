/* MoxiePortal snippet: first-login welcome tour + login webhook.
 * On a client's FIRST visit it opens a welcome modal with an optional video (Tella, Loom,
 * YouTube: any embed URL). "First visit" is judged by a client custom field that your
 * automation sets after the first login, plus a localStorage marker so the modal does not
 * repeat before the field is set.
 * Optionally, once per browser session, it POSTs a small JSON event to a webhook (Make,
 * Zapier, anything that accepts JSON): "first_login" on the first visit, "login" after that.
 * The automation side is two steps: Webhook, then Moxie "Update client" setting the field
 * named in ONBOARDED_FIELD to "Yes". The portal reads custom fields at sign-in, so the flag
 * takes effect on the client's next visit.
 * Other snippets can reopen the modal with window.MoxiePortalTour.open() (present while
 * SHOW_TOUR is on), and can listen for the "mp:tour-done" window event, fired when the client
 * closes it.
 * Paste below the MoxiePortal parent script. */
(function () {
  // Webhook that receives the login events, e.g. 'https://hook.us1.make.com/xxxxxxxx'.
  // Empty sends nothing.
  var WEBHOOK_URL = '';
  // Client custom-field mapping key your automation sets to "Yes" after the first login.
  var ONBOARDED_FIELD = 'AccessedPortal';
  // Video embed URL, e.g. 'https://www.tella.tv/video/XXXXXXXX/embed'. Empty gives a
  // text-only modal.
  var VIDEO_URL = '';
  // The video's height as a percentage of its width: '56.25%' for 16:9. Tella and Loom embed
  // codes include it as the wrapper's padding-bottom.
  var VIDEO_RATIO = '56.25%';
  var EYEBROW = 'First time here?';
  var TITLE = 'Welcome to your client portal';
  var TEXT = 'A quick look at where everything lives: what is waiting on you, where your projects stand, and how to reach us.';
  var BUTTON = 'Got it, let\'s go';
  var SKIP = 'Skip for now';
  // false = webhook events only, never the modal.
  var SHOW_TOUR = true;
  // Run only for clients whose custom fields match, e.g. { ClientType: 'TNC' }.
  // null means every client the parent script allows.
  var ONLY_FOR = null;
  // Skip clients whose custom fields match, e.g. { ClientType: 'Retainer' }. null skips nobody.
  var NOT_FOR = null;

  var CSS = [
    '.mp-tour-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.5); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }',
    '.mp-tour { box-sizing: border-box; width: 100%; max-width: 720px; max-height: calc(100vh - 48px); overflow: auto; border-radius: 18px; background: var(--portal-surface, #fff); border: 1px solid var(--portal-border, #e5e5e5); box-shadow: 0 16px 40px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.08); color: var(--portal-text, #222); text-align: left; }',
    '.mp-tour-band { padding: 22px 28px 18px; background: var(--v-sidebar-base, #263238); color: #fff; border-radius: 18px 18px 0 0; }',
    '.mp-tour-eyebrow { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .75; }',
    '.mp-tour h2 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: #fff; }',
    '.mp-tour-video { position: relative; padding-top: ' + VIDEO_RATIO + '; background: #111; }',
    '.mp-tour-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }',
    '.mp-tour-body { padding: 20px 28px 24px; display: flex; flex-direction: column; gap: 16px; }',
    '.mp-tour-body p { margin: 0; font-size: 16px; line-height: 1.6; }',
    '.mp-tour-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }',
    '.mp-tour-btn { padding: 11px 22px; border: 0; border-radius: var(--brand-button-radius, 8px); background: var(--brand-primary, #66298E); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }',
    '.mp-tour-btn:hover { filter: brightness(.92); }',
    '.mp-tour-skip { padding: 0; border: 0; background: none; font: inherit; font-size: 14px; font-weight: 600; color: var(--brand-primary, #66298E); cursor: pointer; }',
    '@media (max-width: 599px) { .mp-tour-band, .mp-tour-body { padding-left: 18px; padding-right: 18px; } }'
  ].join('\n');

  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { window.localStorage.setItem(key, value); } catch (e) {} }
  function sessionGet(key) { try { return window.sessionStorage.getItem(key); } catch (e) { return null; } }
  function sessionSet(key, value) { try { window.sessionStorage.setItem(key, value); } catch (e) {} }

  MoxiePortal.ready(function (portal) {
    portal.style(CSS);
    var clientId = portal.clientId();
    var user = portal.user();
    var sessionKey = 'mp-login-sent:' + clientId;

    function send(event) {
      if (!WEBHOOK_URL) return;
      var body = {
        event: event,
        clientId: clientId,
        contactId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        when: new Date().toISOString(),
        page: location.pathname
      };
      try {
        fetch(WEBHOOK_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
          .catch(function () {});
      } catch (e) {}
    }

    // "Done" means the client has been through the welcome (modal closed, or no modal to show).
    function markDone() {
      storageSet('mp-tour-done:' + clientId, '1');
      try { window.dispatchEvent(new CustomEvent('mp:tour-done', { detail: { clientId: clientId } })); } catch (e) {}
    }

    // The page's own overflow, put back when the modal goes.
    var pageOverflow = '';
    function removeTour(backdrop) {
      backdrop.remove();
      document.documentElement.style.overflow = pageOverflow;
    }
    function closeTour(backdrop) {
      removeTour(backdrop);
      markDone();
    }

    function openTour() {
      if (document.querySelector('.mp-tour-backdrop')) return;
      var backdrop = portal.el('div', 'mp-tour-backdrop');
      var modal = portal.el('div', 'mp-tour');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', TITLE);

      var band = portal.el('div', 'mp-tour-band');
      band.appendChild(portal.el('p', 'mp-tour-eyebrow', EYEBROW));
      band.appendChild(portal.el('h2', null, TITLE));
      modal.appendChild(band);

      if (VIDEO_URL) {
        var wrap = portal.el('div', 'mp-tour-video');
        var frame = document.createElement('iframe');
        frame.src = VIDEO_URL;
        frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
        frame.setAttribute('allowfullscreen', '');
        // Video hosts that limit embedding to certain domains check this page's origin.
        frame.setAttribute('referrerpolicy', 'origin');
        frame.setAttribute('title', TITLE);
        wrap.appendChild(frame);
        modal.appendChild(wrap);
      }

      var body = portal.el('div', 'mp-tour-body');
      body.appendChild(portal.el('p', null, TEXT));
      var actions = portal.el('div', 'mp-tour-actions');
      var ok = portal.button('mp-tour-btn', function () { closeTour(backdrop); });
      ok.textContent = BUTTON;
      actions.appendChild(ok);
      var skip = portal.button('mp-tour-skip', function () { closeTour(backdrop); });
      skip.textContent = SKIP;
      actions.appendChild(skip);
      body.appendChild(actions);
      modal.appendChild(body);

      backdrop.appendChild(modal);
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeTour(backdrop); });
      document.body.appendChild(backdrop);
      pageOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      ok.focus();
    }

    function onKey(e) {
      var b = document.querySelector('.mp-tour-backdrop');
      if (b && e.key === 'Escape') closeTour(b);
    }
    document.addEventListener('keydown', onKey);

    // Lets other snippets (such as nav-help-box) replay the tour.
    if (SHOW_TOUR) window.MoxiePortalTour = { open: openTour };

    // The portal can know the client id before the client record (and its custom fields) has
    // loaded. Judged against an empty record, every visit would look like the first, so wait
    // for the record (briefly) before deciding.
    var waiting = null;
    (function whenClientLoaded(tries) {
      var ctx = portal.store.state.clientPortalContext;
      if ((ctx && ctx.client) || tries >= 100) return decide();
      waiting = setTimeout(function () { whenClientLoaded(tries + 1); }, 100);
    })(0);

    function decide() {
      if (sessionGet(sessionKey)) return;
      sessionSet(sessionKey, '1');
      var onboarded = portal.norm(portal.clientValues()[ONBOARDED_FIELD]) === 'yes' || storageGet('mp-tour-seen:' + clientId) === '1';
      if (!onboarded) {
        send('first_login');
        storageSet('mp-tour-seen:' + clientId, '1');
        if (SHOW_TOUR) openTour(); else markDone();
      } else {
        send('login');
      }
    }

    // A client switch takes the modal away without counting as the client having seen it.
    return function () {
      clearTimeout(waiting);
      document.removeEventListener('keydown', onKey);
      var b = document.querySelector('.mp-tour-backdrop');
      if (b) removeTour(b);
      if (window.MoxiePortalTour && window.MoxiePortalTour.open === openTour) delete window.MoxiePortalTour;
    };
  }, { onlyFor: ONLY_FOR, notFor: NOT_FOR });
})();
