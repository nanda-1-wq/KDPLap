/* ═══════════════════════════════════════════════════
   KDP Lab — New Book dialog (designs 03 and 04)
   /js/new-book.js

   Load AFTER js/supabase.js and js/shell.js on every app page.
   Any element with [data-new-book] opens it:
     data-new-book=""      pick a validated topic (default)
     data-new-book="none"  start without a validated topic
═══════════════════════════════════════════════════ */

(function () {
  const NONE = '__none';
  const MAX_TOPIC = 200;

  const WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
  const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const SMALL_X = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  let dialog, els, opener = null, busy = false;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', 'nbTitle');
    dialog.setAttribute('aria-describedby', 'nbDesc');
    dialog.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="nbTitle">Start a new book</h2>
            <p id="nbDesc">Pick a validated topic. The Brief opens with it filled in.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <fieldset class="choice-group">
          <legend class="chip-label choice-legend">VALIDATED TOPICS</legend>
          <div class="choice-list" data-topics></div>
          <a class="text-link" data-topic-lab href="topic-lab.html">Browse all topics in Topic Lab</a>
          <div class="or-divider" aria-hidden="true">OR</div>
          <label class="choice">
            <input type="radio" name="nbChoice" value="${NONE}" />
            <span class="choice-body"><span class="choice-title">Start without a validated topic</span></span>
          </label>
          <div data-none-panel hidden>
            <div class="nested-field">
              <label for="nbTopic">Topic</label>
              <input class="text-input" id="nbTopic" type="text" maxlength="${MAX_TOPIC}" autocomplete="off" aria-describedby="nbTopic-error" />
              <span class="field-error" id="nbTopic-error" hidden></span>
            </div>
            <div class="alert alert-warning nested-alert">
              ${WARN}
              <div><strong>This topic has not passed market validation.</strong> You can continue and validate it later in Topic Lab. The book gets an "Unvalidated" tag on the Books page.</div>
            </div>
          </div>
        </fieldset>

        <div class="alert alert-error" data-error role="alert" hidden></div>

        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" data-create>Create book</button>
        </div>
      </form>`;
    document.body.append(dialog);

    els = {
      form: dialog.querySelector('form'),
      topics: dialog.querySelector('[data-topics]'),
      nonePanel: dialog.querySelector('[data-none-panel]'),
      noneRadio: dialog.querySelector(`input[value="${NONE}"]`),
      topicInput: dialog.querySelector('#nbTopic'),
      topicError: dialog.querySelector('#nbTopic-error'),
      error: dialog.querySelector('[data-error]'),
      create: dialog.querySelector('[data-create]')
    };

    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    // Esc closes (native "cancel"), unless a request is running.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // Backdrop click closes only when nothing has been typed in the Topic field.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && !els.topicInput.value.trim()) close();
    });
    dialog.addEventListener('keydown', trapFocus);
    dialog.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
    els.form.addEventListener('change', (e) => { if (e.target.name === 'nbChoice') syncMode(); });
    els.topicInput.addEventListener('input', () => setTopicError(''));
    els.form.addEventListener('submit', onSubmit);
  }

  /* ── Focus trap ─────────────────────────────── */

  function focusables() {
    return [...dialog.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null &&
        !(el.type === 'radio' && !el.checked && dialog.querySelector(`input[name="${el.name}"]:checked`)));
  }
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ── Topics ─────────────────────────────────── */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function topicCard(t, checked) {
    const passed = Math.max(0, Math.min(5, t.checks_passed || 0));
    const dots = Array.from({ length: 5 }, (_, i) => `<span${i < passed ? ' class="on"' : ''}></span>`).join('');
    return `<label class="choice">
        <input type="radio" name="nbChoice" value="${esc(t.id)}" data-name="${esc(t.name)}"${checked ? ' checked' : ''} />
        <span class="choice-body">
          <span class="choice-title">${esc(t.name)}</span>
          <span class="choice-meta"><span class="dots" aria-hidden="true">${dots}</span>${passed} of 5 market checks</span>
        </span>
        <span class="badge badge-success">${CHECK}Validated</span>
      </label>`;
  }

  async function loadTopics(preferNone) {
    els.topics.innerHTML = '<div class="skel skel-choice"></div><div class="skel skel-choice"></div>';
    let res;
    try { res = await kdp.listValidatedTopics(); } catch (e) { res = { error: e }; }
    if (!dialog.open) return;

    if (res.error) {
      els.topics.innerHTML = `<div class="alert alert-error" role="alert">${WARN}
        <div>We couldn't load your topics. <button type="button" class="link-btn" data-retry>Retry</button></div></div>`;
      els.topics.querySelector('[data-retry]').addEventListener('click', () => loadTopics(preferNone));
      if (!currentChoice()) selectNone(false);
      return;
    }

    const topics = res.data || [];
    if (!topics.length) {
      els.topics.innerHTML = `<p class="note-box">No validated topics yet. Score an idea in <a href="${root}app/topic-lab.html">Topic Lab</a> first, or start without one below.</p>`;
      dialog.querySelector('[data-topic-lab]').hidden = true;
      if (!currentChoice()) selectNone(true);
      return;
    }
    dialog.querySelector('[data-topic-lab]').hidden = false;
    const keepNone = preferNone || currentChoice() === NONE;
    els.topics.innerHTML = topics.map((t, i) => topicCard(t, !keepNone && i === 0)).join('');
    if (!keepNone) {
      syncMode();
      dialog.querySelector('input[name="nbChoice"]:checked').focus();
    }
  }

  /* ── Modes ──────────────────────────────────── */

  function currentChoice() {
    const c = dialog.querySelector('input[name="nbChoice"]:checked');
    return c ? c.value : null;
  }
  function selectNone(focusInput) {
    els.noneRadio.checked = true;
    syncMode();
    if (focusInput) els.topicInput.focus();
  }
  function syncMode() {
    els.nonePanel.hidden = currentChoice() !== NONE;
    hideError();
  }

  function setTopicError(msg) {
    if (msg) {
      els.topicInput.setAttribute('aria-invalid', 'true');
      els.topicError.innerHTML = SMALL_X;
      els.topicError.append(msg);
      els.topicError.hidden = false;
    } else {
      els.topicInput.removeAttribute('aria-invalid');
      els.topicError.hidden = true;
    }
  }
  function showError(msg) {
    els.error.innerHTML = WARN;
    const d = document.createElement('div');
    d.textContent = msg;
    els.error.append(d);
    els.error.hidden = false;
  }
  function hideError() { els.error.hidden = true; }

  function setBusy(on) {
    busy = on;
    els.create.disabled = on;
    els.create.setAttribute('aria-busy', String(on));
    els.create.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Creating…' : 'Create book';
  }

  /* ── Create ─────────────────────────────────── */

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    hideError();
    const choice = currentChoice();
    if (!choice) { showError('Pick a topic, or start without one.'); return; }

    let topicId = null, topicText;
    if (choice === NONE) {
      topicText = els.topicInput.value.trim();
      if (!topicText) { setTopicError('Enter a topic for the book.'); els.topicInput.focus(); return; }
      if (topicText.length > MAX_TOPIC) { setTopicError(`Use ${MAX_TOPIC} characters or fewer.`); els.topicInput.focus(); return; }
    } else {
      topicId = choice;
      topicText = dialog.querySelector('input[name="nbChoice"]:checked').dataset.name;
    }

    setBusy(true);
    let res;
    try { res = await kdp.createBook(topicId, topicText); } catch (err) { res = { error: err }; }
    if (!res.error && res.data) {
      location.href = `${root}app/book.html?id=${encodeURIComponent(res.data)}`;
      return;
    }
    setBusy(false);
    const err = res.error || {};
    if (err.code === '42501' && topicId) {
      showError('This topic is no longer one of your validated topics. Pick another one, or start without a topic.');
      loadTopics(false);
    } else if (err.code === '22023') {
      setTopicError('Use 1 to 200 characters.');
      els.topicInput.focus();
    } else {
      showError("We couldn't create the book. Check your connection, then try again.");
    }
  }

  /* ── Open and close ─────────────────────────── */

  let root = '../';

  function open(mode) {
    if (!dialog) build();
    opener = document.activeElement;
    busy = false;
    setBusy(false);
    els.form.reset();
    setTopicError('');
    hideError();
    els.nonePanel.hidden = true;
    dialog.querySelector('[data-topic-lab]').href = `${root}app/topic-lab.html`;
    dialog.showModal();
    const preferNone = mode === 'none';
    if (preferNone) selectNone(true);
    else dialog.querySelector('[data-close]').focus();
    loadTopics(preferNone);
  }

  function close() {
    if (busy || !dialog || !dialog.open) return;
    dialog.close();
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-new-book]');
    if (!trigger) return;
    e.preventDefault();
    open(trigger.dataset.newBook);
  });

  window.kdpNewBook = {
    open,
    setRoot(r) { root = r; }
  };
})();
