/* ═══════════════════════════════════════════════════
   KDP Lab — Settings (design 25b)
   /js/settings.js   (used by app/settings.html; needs js/supabase.js,
                      js/ui.js, js/shell.js, js/autosave.js, js/usage-rules.js)

   Account: Name (user_settings.display_name, 1 to 60 characters, saved as
   you type; empty = the Google name, else "Your account"), the email (read
   only, shown only here), Change password (the reset email; hidden for an
   account that signs in only with Google), Log out.
   Defaults for new books: pen name (user_settings.default_pen_name_id, the
   same field as the "Default" tag on Pen Names) and trim size (default_trim,
   the Brief's five sizes). Language: English, read only.
   AI usage this month: usage_month() (0025) and the last 10 calls. The
   monthly limit is set by NicheInk and read only. At 80% or more a warning,
   at 100% "AI is paused" (this page only, owner decision 4).
═══════════════════════════════════════════════════ */

(async function () {
  const NAME_MAX = 60;
  const TRIMS = ['5x8', '5.5x8.5', '6x9', '7x10', '8.5x11'];
  const { esc, ICON } = kdpUi;
  const fmt = (v) => Number(v || 0).toLocaleString('en-US');
  const trimText = (t) => `${t.replace('x', ' × ')} in`;
  const SVG = (body, size = 16, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const INFO = SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  const PAUSE = SVG('<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>');

  const user = await kdpShell.init({ active: 'settings' });
  if (!user) return;

  const $ = (sel) => document.querySelector(sel);
  const nameInput = $('#nameInput');
  const nameCount = $('[data-name-count]');
  const nameHelp = $('#nameHelp');
  const nameError = $('#nameError');
  const penSelect = $('#penSelect');
  const trimSelect = $('#trimSelect');
  let settings = null;

  /* ── Save line (as js/topic.js renderSave) ── */

  function renderSave(el, state, message, canRetry, onRetry) {
    if (!el) return;
    el.dataset.state = state;
    if (state === 'saving') el.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    else if (state === 'saved') el.innerHTML = `<span class="save-ok">${ICON.check(14)}</span>Saved`;
    else if (state === 'error') {
      el.innerHTML = `<span class="save-error">${ICON.warn(14)}<span></span></span>${canRetry ? '<button type="button" class="link-btn" data-retry-save>Retry</button>' : ''}`;
      el.querySelector('.save-error span').textContent = message || "Couldn't save.";
      const b = el.querySelector('[data-retry-save]');
      if (b) b.addEventListener('click', onRetry);
    } else el.textContent = '';
  }

  /* ── Account: Name ─────────────────────── */

  const profile = kdpShell.nameOf(null, user);   // the name used when the field is empty

  function nameHint(value) {
    if (value) return 'Shown in the sidebar. Leave it empty to use your Google name.';
    return profile.fallback
      ? 'Empty. The sidebar shows "Your account".'
      : `Empty. The sidebar shows your Google name, "${profile.name}".`;
  }

  function setNameError(msg) {
    nameError.hidden = !msg;
    nameError.innerHTML = msg ? `${ICON.warn(14)}<span></span>` : '';
    if (msg) nameError.querySelector('span').textContent = msg;
    if (msg) nameInput.setAttribute('aria-invalid', 'true'); else nameInput.removeAttribute('aria-invalid');
    nameInput.classList.toggle('is-error', !!msg);
  }

  function syncName() {
    const v = nameInput.value.trim();
    const over = v.length > NAME_MAX;
    nameCount.textContent = `${v.length} / ${NAME_MAX}`;
    nameCount.classList.toggle('is-over', over);
    nameHelp.textContent = nameHint(v);
    setNameError(over ? `Error: use ${NAME_MAX} characters or fewer.` : '');
    return !over;
  }

  const nameSaver = kdpAutosave.create({
    read: () => nameInput.value.trim() || null,
    save: (fields) => kdp.updateSettings(user.id, fields),
    onSaved(res) { settings = res.data; kdpShell.setName(settings); },
    async onError(res) {
      if (res.error && res.error.code === '23514') { setNameError(`Error: use 1 to ${NAME_MAX} characters.`); return true; }
      return false;
    },
    render: (state, message, canRetry) => renderSave($('[data-name-save]'), state, message, canRetry, () => nameSaver.retry())
  });

  nameInput.addEventListener('input', () => {
    // Too long: nothing is saved and the text is not cut, so a paste is not lost.
    if (syncName()) nameSaver.edit('display_name', 800);
    else nameSaver.drop('display_name');
  });
  nameInput.addEventListener('blur', () => { if (nameSaver.isDirty('display_name')) nameSaver.flush(); });

  /* ── Account: email, password ─────────── */

  $('[data-email]').textContent = user.email || '';
  const providers = (user.app_metadata && (user.app_metadata.providers || [user.app_metadata.provider])) || [];
  const pwRow = $('[data-password-row]');
  pwRow.hidden = !providers.includes('email');
  const pwBtn = $('[data-password]');
  const pwNote = $('[data-password-note]');
  pwBtn.addEventListener('click', async () => {
    pwBtn.disabled = true;
    pwBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Sending…';
    let res;
    try { res = await kdp.resetPassword(user.email, '../reset-password.html'); } catch (e) { res = { error: e }; }
    pwBtn.disabled = false;
    pwBtn.textContent = 'Change password';
    const err = res && res.error;
    pwNote.hidden = false;
    pwNote.className = err ? 'set-note is-error' : 'set-note';
    pwNote.innerHTML = err ? ICON.warn(14) : `<span class="save-ok">${ICON.check(14)}</span>`;
    const span = document.createElement('span');
    span.textContent = !err ? 'We sent a reset link to your email.'
      : (err.status === 429 || /rate/i.test(err.message || '')) ? 'You can ask for 2 reset emails an hour. Try again later.'
        : "We couldn't send the email. Try again.";
    pwNote.append(span);
  });

  const logoutBtn = $('#logoutBtn');
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Logging out…';
    await kdp.signOut();
    location.replace('../login.html');
  });

  /* ── Defaults for new books ────────────── */

  let lastDefault = 'pen';
  const defaultsSaver = kdpAutosave.create({
    read: (f) => (f === 'default_pen_name_id' ? (penSelect.value || null) : trimSelect.value),
    save: (fields) => kdp.updateSettings(user.id, fields),
    onSaved(res) { settings = res.data; },
    render(state, message, canRetry) {
      renderSave($('[data-pen-save]'), lastDefault === 'pen' ? state : 'idle', message, canRetry, () => defaultsSaver.retry());
      renderSave($('[data-trim-save]'), lastDefault === 'trim' ? state : 'idle', message, canRetry, () => defaultsSaver.retry());
    }
  });
  penSelect.addEventListener('change', () => { lastDefault = 'pen'; defaultsSaver.edit('default_pen_name_id', 0); });
  trimSelect.addEventListener('change', () => { lastDefault = 'trim'; defaultsSaver.edit('default_trim', 0); });

  trimSelect.innerHTML = TRIMS.map((t) => `<option value="${t}">${trimText(t)}</option>`).join('');

  async function loadAccount() {
    const [res, pens] = await Promise.all([kdp.ensureUserSettings(user.id), kdp.listPenNameOptions().catch((e) => ({ error: e }))]);
    const card = $('[data-account]');
    if (res.error || !res.data) {
      card.querySelector('[data-account-error]').hidden = false;
      nameInput.disabled = true;
      penSelect.disabled = true;
      trimSelect.disabled = true;
      return;
    }
    settings = res.data;
    nameInput.value = settings.display_name || '';
    nameInput.placeholder = profile.fallback ? '' : profile.name;
    syncName();
    const list = (pens && !pens.error && pens.data) || [];
    const none = !list.length;
    penSelect.innerHTML = '<option value="">None</option>' + list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    penSelect.value = settings.default_pen_name_id && list.some((p) => p.id === settings.default_pen_name_id) ? settings.default_pen_name_id : '';
    penSelect.disabled = none;
    $('[data-pen-link]').textContent = none ? 'Add a pen name' : 'Manage pen names';
    $('[data-pen-label]').textContent = none ? 'Pen name · no pen names yet' : 'Pen name';
    trimSelect.value = TRIMS.includes(settings.default_trim) ? settings.default_trim : '6x9';
  }

  /* ── AI usage this month ───────────────── */

  const usageBody = $('[data-usage-body]');
  const resetsEl = $('[data-resets]');

  function usageSkeleton() {
    usageBody.setAttribute('aria-busy', 'true');
    usageBody.innerHTML = `<p class="sr-only" role="status">Loading your AI usage…</p>
      <div class="skel set-skel-big"></div><div class="skel skel-bar"></div>
      <div class="skel skel-line skel-w70"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div>`;
  }

  function usageError() {
    usageBody.removeAttribute('aria-busy');
    usageBody.innerHTML = `<div class="alert alert-error" role="alert">${ICON.x(16)}<div class="alert-text">
      <p><strong>Error: we couldn't load your usage.</strong> Check your connection and try again.</p>
      <div class="set-acts"><button type="button" class="btn btn-secondary btn-sm" data-usage-retry>Try again</button></div></div></div>`;
    const b = usageBody.querySelector('[data-usage-retry]');
    b.addEventListener('click', () => loadUsage(true));
    return b;
  }

  function stageTable(s) {
    const max = Math.max(1, ...s.stages.map((r) => r.tokens));
    return `<table class="set-table" aria-label="By stage this month">
      <thead><tr><th scope="col">By stage</th><th scope="col" class="num">Calls</th><th scope="col" class="num">Tokens</th><th scope="col" class="share">Share</th></tr></thead>
      <tbody>${s.stages.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(r.calls)}</td><td class="num">${fmt(r.tokens)}</td>
        <td class="share"><div class="bar" aria-hidden="true"><span style="width: ${Math.max(1, Math.round((r.tokens / max) * 100))}%"></span></div></td></tr>`).join('')}</tbody>
    </table>`;
  }

  function callsTable(rows) {
    if (rows === null) return '<p class="field-hint" data-calls-error>Last calls are not available right now.</p>';
    if (!rows.length) return '';
    const now = new Date();
    return `<table class="set-table" aria-label="Last calls">
      <thead><tr><th scope="col">Last calls</th><th scope="col"><span class="sr-only">Stage and book</span></th><th scope="col" class="num">Tokens</th></tr></thead>
      <tbody>${rows.map((row) => {
        const c = kdpUsage.call(row, now);
        const tag = c.tag ? ` <span class="set-tag">${c.tag === 'Not counted' ? INFO.replace('width="16" height="16"', 'width="11" height="11"') : ''}${c.tag}</span>` : '';
        const dim = c.tag === 'Not counted';
        return `<tr><td class="when">${esc(c.when)}</td><td class="what">${esc(c.name)}${tag}<span class="bk">${esc(c.where)}</span></td>
          <td class="num${dim ? ' dim' : ''}"${dim ? ` aria-label="${fmt(c.tokens)}, not counted"` : ''}>${fmt(c.tokens)}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <p class="field-hint">Showing the last ${rows.length === 1 ? 'call' : `${rows.length} calls`}. Counted: calls that finished, or that you stopped. Not counted: calls that failed or that the server stopped.</p>`;
  }

  function usageView(u, calls) {
    const s = kdpUsage.summary(u);
    usageBody.removeAttribute('aria-busy');
    resetsEl.textContent = `Resets ${s.resets} (UTC)`;
    let alert = '';
    if (s.level === 'warn') {
      const more = s.sectionsLeft !== null ? `, roughly ${fmt(s.sectionsLeft)} more section${s.sectionsLeft === 1 ? '' : 's'}` : '';
      alert = `<div class="alert alert-warning" role="status">${ICON.warn(16)}<div class="alert-text"><p><strong>Warning: ${s.pct}% used.</strong> About ${fmt(s.left)} tokens are left${more}. AI stops at the limit until ${esc(s.resets)}.</p></div></div>`;
    } else if (s.level === 'full') {
      alert = `<div class="alert alert-warning" role="status">${PAUSE}<div class="alert-text"><p><strong>AI is paused until ${esc(s.resets)}.</strong> Your writing is safe. You can still write, edit and export.</p></div></div>`;
    }
    const top = `<div class="set-big"><span class="set-big-n">${fmt(s.shown)}</span><span class="set-big-of">of ${fmt(s.limit)} tokens</span><span class="set-big-pct">${s.pct}%</span></div>
      <div class="bar set-bar" role="img" aria-label="${s.pct}% of this month's AI allowance used"><span style="width: ${s.pct}%"></span></div>`;
    if (s.level === 'none') {
      usageBody.innerHTML = `${top}<p class="set-empty">${INFO}<span>No AI calls this month yet. Writing a section uses the most; checks and ideas use little.</span></p>`;
      return;
    }
    usageBody.innerHTML = `${top}${alert}
      <div class="set-stats">
        <div class="set-stat"><span class="chip-label">COST SO FAR</span><span class="set-stat-v">${kdpUsage.costText(s.cost)}</span><span class="field-hint">${s.cost === null ? 'A model here has no price yet' : 'Estimate at Sonnet 5.5 prices'}</span></div>
        <div class="set-stat"><span class="chip-label">MONTHLY LIMIT</span><span class="set-stat-v">${fmt(s.limit)}</span><span class="field-hint">Set by NicheInk. Read only.</span></div>
      </div>
      ${stageTable(s)}
      ${callsTable(calls)}`;
  }

  async function loadUsage(focusAfter) {
    usageSkeleton();
    let u, calls;
    try {
      [u, calls] = await Promise.all([kdp.getUsageMonth(), kdp.listLastCalls(10).catch((e) => ({ error: e }))]);
    } catch (e) { u = { error: e }; }
    if (!u || u.error || !u.data) {
      const b = usageError();
      if (focusAfter) b.focus();
      return;
    }
    usageView(u.data, calls && !calls.error ? calls.data : null);
    if (focusAfter) $('#useTitle').focus();
  }

  loadAccount();
  loadUsage(false);

})();
