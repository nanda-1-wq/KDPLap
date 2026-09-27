/* ═══════════════════════════════════════════════════
   KDP Lab — Shared helpers for the public auth pages
   /js/auth.js

   Load AFTER js/supabase.js. All Supabase calls stay in window.kdp;
   this file only handles page behavior (UI states, validation, messages).
═══════════════════════════════════════════════════ */

(function () {
  const DASHBOARD = 'app/dashboard.html';
  const MIN_PASSWORD = 8;

  const ICONS = {
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    smallError: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  const PANEL_HTML = `
    <div class="covers">
      <div class="cover-pos left"><div class="cover sleep">
        <div class="cover-title">SLEEP<br>BETTER</div><div class="cover-sub">After 50</div>
        <div class="moon"></div><div class="cover-author">NORA HALE</div></div></div>
      <div class="cover-pos mid"><div class="cover yoga">
        <div class="cover-title">CHAIR<br>YOGA</div><div class="cover-sub">for Seniors Over 60</div>
        <div class="sun"></div><div class="cover-author">NORA HALE</div></div></div>
      <div class="cover-pos right"><div class="cover budget">
        <div class="cover-title">BUDGET<br>SMART</div><div class="cover-sub">for College Students</div>
        <div class="bar b1"></div><div class="bar b2"></div><div class="bar b3"></div><div class="bar b4"></div>
        <div class="cover-author">SAM CARTER</div></div></div>
    </div>
    <div class="auth-panel-copy">
      <div class="auth-panel-title">Validate first. Then write.</div>
      <div class="auth-panel-text">Score each topic with real market data, then build the book step by step, in your own voice.</div>
    </div>`;

  /* ── Page setup ───────────────────────────────── */

  function fillPanel() {
    const panel = document.querySelector('[data-auth-panel]');
    if (panel) panel.innerHTML = PANEL_HTML;
  }

  function initPasswordToggles() {
    document.querySelectorAll('.pw-toggle').forEach((btn) => {
      const input = document.getElementById(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
  }

  function initGoogle(onError) {
    const btn = document.getElementById('googleBtn');
    if (!btn) return;
    if (!kdp.googleEnabled) {
      document.querySelectorAll('[data-google]').forEach((el) => { el.hidden = true; });
      return;
    }
    btn.addEventListener('click', async () => {
      setLoading(btn, true, 'Opening Google…');
      const redirectTo = new URL(DASHBOARD, location.href).href;
      const { error } = await kdp.signInWithGoogle(redirectTo);
      if (error) {
        setLoading(btn, false);
        onError(networkMessage(error) || "Google sign-in didn't start. Try again.");
      }
    });
  }

  /** Already signed in: skip the form. */
  async function redirectIfSignedIn() {
    const session = await kdp.getSession();
    if (session) location.replace(DASHBOARD);
  }

  /* ── UI states ────────────────────────────────── */

  /** Loading state: disable the button and show a spinner with a label. */
  function setLoading(btn, loading, label) {
    if (loading) {
      if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${label}</span>`;
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
    }
  }

  /**
   * Show an alert. `parts` is a list of strings and { strong: '...' } items,
   * set as text (never HTML) so user input such as an email is safe.
   * Returns the body element so callers can append actions.
   */
  function showAlert(el, type, parts) {
    el.className = `alert alert-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = ICONS[type];
    const body = document.createElement('div');
    body.className = 'alert-body';
    const text = document.createElement('span');
    [].concat(parts).forEach((part) => {
      if (typeof part === 'string') text.append(part);
      else {
        const s = document.createElement('strong');
        s.textContent = part.strong;
        text.append(s);
      }
    });
    body.append(text);
    el.append(body);
    el.hidden = false;
    return body;
  }

  function hideAlert(el) {
    el.hidden = true;
    el.innerHTML = '';
  }

  /** Field error under an input. Pass an empty message to clear. */
  function setFieldError(input, message) {
    const errEl = document.getElementById(`${input.id}-error`);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      errEl.innerHTML = ICONS.smallError;
      errEl.append(message);
      errEl.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      errEl.hidden = true;
      errEl.textContent = '';
    }
  }

  /* ── Validation and error text ────────────────── */

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function checkEmail(input) {
    const ok = isEmail(input.value.trim());
    setFieldError(input, ok ? '' : 'Enter a valid email, like you@example.com.');
    return ok;
  }

  function checkPassword(input) {
    const ok = input.value.length >= MIN_PASSWORD;
    setFieldError(input, ok ? '' : `Use ${MIN_PASSWORD} or more characters.`);
    return ok;
  }

  function isRateLimit(error) {
    return error.status === 429 || /rate_limit/.test(error.code || '');
  }

  function isNetwork(error) {
    return error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status >= 500;
  }

  /** Text for errors that are not about the user's input, or null. */
  function networkMessage(error) {
    if (isRateLimit(error)) return 'Too many tries. Wait a minute, then try again.';
    if (isNetwork(error)) return "We couldn't reach the server. Check your connection and try again.";
    return null;
  }

  window.kdpAuth = {
    DASHBOARD,
    fillPanel,
    initPasswordToggles,
    initGoogle,
    redirectIfSignedIn,
    setLoading,
    showAlert,
    hideAlert,
    setFieldError,
    checkEmail,
    checkPassword,
    isRateLimit,
    networkMessage
  };
})();
