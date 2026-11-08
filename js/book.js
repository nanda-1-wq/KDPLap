/* ═══════════════════════════════════════════════════
   KDP Lab — Book page (design 05)
   /js/book.js   (used by app/book.html)

   URL: book.html?id=<book uuid>&step=<1..6>. The step stays in the URL,
   so a reload keeps it. Next writes books.current_step when it moves past
   the furthest step reached; Back and the sidebar never write it.

   Steps with a screen register in window.kdpBookSteps (E7.1: 01 Brief in
   js/book-brief.js; E7.2: 02 Research in js/book-research.js; E8.1:
   03 Positioning in js/book-positioning.js; E8.2: 04 Title in
   js/book-title.js; E9.1: 05 Outline in js/book-outline.js):
   init(book, ctx) once, render(root) on each visit,
   isDone(book) for the sidebar mark, blockers() for the Next button,
   missing() for what is still needed (one short sentence, '' when done),
   optional doneMark: 'lock' (03 shows a lock instead of a check),
   optional needsReview(book) for the "Needs review" flag.
   The reason shows under each step in the sidebar and next to Next. Only
   01 Brief blocks Next; on 02 to 04 the note only informs.
   A title marked "Needs review" (books.title_needs_review, set by an
   unlock of 03) shows a warning on 04, chapters marked "Needs review"
   (chapters.needs_review, same unlock) one on 05.
   E10.1: 06 Write in js/book-write.js. On step 06 the sidebar folds to a
   narrow rail (design 22) with a button to open it. A step may define
   leave(): called when another step opens or on Exit to Books (Write saves
   the typed text as a version there; Exit waits for it, at most 4 s).
   E10.2: a step may define confirmLeave(): resolves false to stay (Write
   asks "Stop and leave?" while the AI writes). go, Exit and Back/Forward
   wait for it.
   Other steps show a "Coming in" placeholder.
   E12 fix batch 3 (design 22f, 13): a completed book shows a strip above
   every step with "Reopen book". ctx.setStatus(fields) updates the book's
   status (Write's Mark book as completed); ctx.reloadStatus() reads it again.
   Opening a step of a completed book reads the status again, because a
   change elsewhere (an outline edit, an unlock of 03) reopens it (0026).
   E14.3 (designs 51, 51b, 57): one sidebar lists 01 to 09, and the rail on
   wide steps lists them one by one. 07 Quality Control is js/book-qc.js. Its
   mark comes from qc_mark: read at load, on every step change, after a run
   (ctx.readQcMark) and 2 s after 06 saves (ctx.refresh, debounced; a draft
   passes { draft: true } and is left out: a draft is not in the run's key).
   E13.2 (designs 41, 51b): 08 Format is js/book-format.js, a wide step (the
   rail). On 08 the header button reads "Export files" and opens the 08
   panel when the step has one (openExport); other steps keep the E11
   dialog. 08 is the last step with a screen: Next is off with the
   "Coming next" tip, and the note says what 08 still needs. 09 Cover shows
   a lock and "Coming next" and is not a link until E15.
   ctx.go(n, { focus }) opens a step and asks it to focus one control
   (07 "How to add one" → 08 at the Copyright row).
═══════════════════════════════════════════════════ */

(async function () {
  const TOTAL_STEPS = 11;
  const LAST_STEP = 8;                  // the last step with a screen; 09 Cover is next (E15)
  const WIDE_STEPS = new Set([6, 8]);   // these fold the sidebar to the rail (09 joins them)
  const FORMAT_STEP = 8;
  const QC_STEP = 7;
  const MARK_DELAY = 2000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const STEPS = {
    1: { group: 'Plan', name: 'Brief', task: 'E7', text: 'Define the reader, their problem, and the promise of the book.' },
    2: { group: 'Plan', name: 'Research', task: 'E7', text: 'Collect sources and competitor books. The AI quotes facts only from these.' },
    3: { group: 'Plan', name: 'Positioning', task: 'E8', text: 'Choose and lock the angle that makes this book different.' },
    4: { group: 'Plan', name: 'Title', task: 'E8', text: 'Pick a title and subtitle that match the positioning.' },
    5: { group: 'Produce', name: 'Outline', task: 'E9', text: 'Plan the chapters and their word targets.' },
    6: { group: 'Produce', name: 'Write', task: 'E10', text: 'Write the book one section at a time, with AI help.' },
    7: { group: 'Produce', name: 'Quality Control', task: 'E14', text: 'Check the whole book before you format it.' },
    8: { group: 'Package', name: 'Format', task: 'E13', text: 'Choose the look of the pages and export the Print PDF.' }
  };
  const COMING = { 9: 'Cover' };

  const nav = document.querySelector('[data-book-nav]');
  const head = document.querySelector('[data-book-head]');
  const content = document.querySelector('[data-book-content]');
  const backBtn = document.querySelector('[data-back]');
  const nextBtn = document.querySelector('[data-next]');
  const nextNote = document.querySelector('[data-next-note]');
  const MODULES = window.kdpBookSteps || {};
  const PLAN_STEPS = [1, 2, 3, 4];
  const stepLabel = document.querySelector('[data-step-label]');
  const stepTitle = document.querySelector('[data-step-title]');
  const strip = document.querySelector('[data-book-strip]');

  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const REOPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>';
  const LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const LOCK_SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const WARN = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';

  const { esc, ICON } = kdpUi;
  const SAVE_WARN = ICON.warn(16);
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const pad = (n) => String(n).padStart(2, '0');

  const params = new URLSearchParams(location.search);
  const bookId = params.get('id') || '';
  let step = readStep(params.get('step'));
  let book = null;
  const saves = {};   // step number → its last save state { state, message, canRetry, at }
  const layout = document.querySelector('.book-layout');
  let railOpen = false;   // on a wide step the sidebar is a rail until the writer opens it
  let saveSeq = 0;
  let qcMark = null;      // { checked_at, current } of the last run, null before the first
  let markSeq = 0, markTimer = null;
  let leaving = Promise.resolve();   // the version 06 saves when it is left

  function readStep(value) {
    const n = parseInt(value, 10);
    return n >= 1 && n <= LAST_STEP ? n : 1;
  }

  function workingTitle(b) {
    const brief = one(b.book_briefs);
    return (b.title || (brief && brief.topic_text) || '').trim() || 'Untitled book';
  }

  /** The newest save time: the book row, its Brief or its positioning. */
  function lastSaved(b) {
    const brief = one(b.book_briefs);
    const pos = one(b.positioning);
    const times = [b.updated_at, brief && brief.updated_at, pos && pos.updated_at].filter(Boolean);
    return times.sort().pop();
  }

  const isDone = (n) => !!(MODULES[n] && MODULES[n].isDone && MODULES[n].isDone(book));
  /** What step n still needs, or '' (done, or no reason to show). */
  const missing = (n) => (!isDone(n) && MODULES[n] && MODULES[n].missing ? MODULES[n].missing() : '');
  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  function savedText(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'Saved just now';
    if (mins < 60) return `Saved ${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `Saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `Saved ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  /* ── Rendering ───────────────────────────── */

  let reopening = false, reopenErr = false;

  /** Design 22f, 13: the strip on every step of a completed book. */
  function renderStrip() {
    if (!strip) return;
    const done = !!book && book.status === 'completed';
    strip.hidden = !done;
    if (!done) { strip.innerHTML = ''; return; }
    strip.classList.toggle('is-error', reopenErr);
    strip.setAttribute('role', reopenErr ? 'alert' : 'note');
    strip.innerHTML = reopenErr
      ? `<span class="book-strip-text">${ICON.x(16)}<span>We couldn’t reopen the book. Try again.</span></span>
         <button type="button" class="btn btn-secondary btn-sm" data-strip-reopen>Retry</button>`
      : `<span class="book-strip-text">${CHECK}<span><strong>This book is marked completed.</strong> You can still edit it. A new version keeps it completed.</span></span>
         <button type="button" class="btn btn-secondary btn-sm" data-strip-reopen${reopening ? ' disabled' : ''}>${reopening ? '<span class="spinner" aria-hidden="true"></span>Saving…' : `${REOPEN}Reopen book`}</button>`;
  }

  async function reopenFromStrip() {
    if (reopening) return;
    reopening = true;
    reopenErr = false;
    renderStrip();
    let res;
    try { res = await kdp.reopenBook(bookId); } catch (e) { res = { error: e }; }
    reopening = false;
    if (res.error) { reopenErr = true; renderStrip(); const b = strip.querySelector('[data-strip-reopen]'); if (b) b.focus(); return; }
    ctx.setStatus({ status: res.data.status, completed_at: res.data.completed_at, updated_at: res.data.updated_at });
    stepTitle.focus();
  }

  /** A completed book may have been reopened elsewhere: read its status again (no error shown). */
  async function readStatus() {
    let res;
    try { res = await kdp.getBookStatus(bookId); } catch (e) { return; }
    if (!res.error && res.data) ctx.setStatus(res.data);
  }

  function stepLink(n) {
    if (n === QC_STEP) return qcLink();
    const s = STEPS[n];
    const current = n === step ? ' aria-current="step"' : '';
    const done = isDone(n);
    const lock = done && MODULES[n].doneMark === 'lock';
    const review = (n === 4 && book.title_needs_review) || !!(MODULES[n] && MODULES[n].needsReview && MODULES[n].needsReview(book));
    const mark = lock ? LOCK : (done && n !== step ? CHECK : '');
    const state = lock ? ', locked' : (done ? ', done' : '');
    const need = missing(n);
    const name = need
      ? `<span class="step-name">${s.name}<span class="sr-only">, </span><span class="step-missing" data-step-missing>${esc(need)}</span></span>`
      : s.name;
    return `<a class="step-link${done ? ' is-done' : ''}${lock ? ' is-locked' : ''}${need ? ' has-missing' : ''}" href="?id=${encodeURIComponent(bookId)}&step=${n}" data-step="${n}"${current}>
        <span class="step-mark" aria-hidden="true">${mark}</span><span class="step-num">${pad(n)}</span>${name}${state ? `<span class="sr-only">${state}</span>` : ''}${review ? `<span class="step-flag">${SAVE_WARN}Needs review</span>` : ''}</a>`;
  }

  /**
   * 07 in the sidebar and the rail (design 57). A run with warnings is still
   * done. Open on the screen, the row shows its check when done (design 53).
   * "Out of date" takes a second line: the row has no room for it beside the name.
   */
  function qcLink() {
    const done = !!(qcMark && qcMark.current);
    const stale = !!qcMark && !qcMark.current;
    const label = `07 ${STEPS[QC_STEP].name}, ${done ? 'done' : stale ? 'out of date' : 'not run'}`;
    const name = stale
      ? `<span class="step-name">${STEPS[QC_STEP].name}<span class="step-flag is-tag">${SAVE_WARN}Out of date</span></span><span class="step-dot" aria-hidden="true"></span>`
      : STEPS[QC_STEP].name;
    return `<a class="step-link${done ? ' is-done has-check' : ''}${stale ? ' has-missing' : ''}" href="?id=${encodeURIComponent(bookId)}&step=${QC_STEP}" data-step="${QC_STEP}" aria-label="${label}"${step === QC_STEP ? ' aria-current="step"' : ''}>
        <span class="step-mark" aria-hidden="true">${done ? CHECK : ''}</span><span class="step-num">${pad(QC_STEP)}</span>${name}</a>`;
  }

  /** 09: a lock, not a link until its screen lands (approved difference V9, E13.2 F5). */
  function comingRow(n) {
    return `<div class="step-link is-future is-locked" role="link" aria-disabled="true" title="${pad(n)} ${COMING[n]}, coming next" data-coming="${n}">
        <span class="step-mark" aria-hidden="true">${LOCK_SM}</span><span class="step-num">${pad(n)}</span>${COMING[n]}<span class="sr-only">, </span><span class="version-tag">Coming next</span></div>`;
  }

  /** A wide step folds the sidebar to a rail (designs 22, 51b); the button opens it again. */
  function applyRail() {
    const wide = WIDE_STEPS.has(step);
    const rail = wide && !railOpen;
    layout.classList.toggle('is-rail', rail);
    const btn = nav.querySelector('[data-rail-toggle]');
    if (btn) {
      btn.hidden = !wide;
      btn.setAttribute('aria-expanded', String(!rail));
      btn.setAttribute('aria-label', rail ? 'Open the steps sidebar' : 'Fold the steps sidebar');
    }
    // The rail has no word for the 07 mark: hover shows the full name (design 57).
    const qc = nav.querySelector(`[data-step="${QC_STEP}"]`);
    if (qc) {
      if (rail) qc.title = qc.getAttribute('aria-label');
      else qc.removeAttribute('title');
    }
  }

  /** Reads the 07 mark. A failed read keeps the mark on screen. */
  async function readMark() {
    clearTimeout(markTimer);
    const seq = ++markSeq;
    let res;
    try { res = await kdp.getQcMark(bookId); } catch (e) { return; }
    if (seq !== markSeq || res.error) return;
    const was = qcMark;
    qcMark = res.data;
    if (!was === !qcMark && (!was || was.current === qcMark.current)) return;
    const row = nav.querySelector(`[data-step="${QC_STEP}"]`);
    if (!row) return;
    const focused = document.activeElement === row;
    row.outerHTML = qcLink();
    applyRail();
    if (focused) nav.querySelector(`[data-step="${QC_STEP}"]`).focus();
  }

  /** After a version 06 is still saving: then the mark sees it. */
  function markAfterLeave() {
    const at = leaving;
    at.then(() => { if (at === leaving) readMark(); });
  }

  function markSoon() {
    clearTimeout(markTimer);
    markTimer = setTimeout(readMark, MARK_DELAY);
  }

  function renderNav() {
    const title = workingTitle(book);
    const pen = one(book.pen_names);
    nav.innerHTML = `
      <button type="button" class="rail-toggle" data-rail-toggle hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
      </button>
      <div class="book-id">
        <div class="cover-ph mini" aria-hidden="true">
          <div class="cover-ph-title">${esc(title)}</div><div class="cover-ph-rule"></div>
          <div class="cover-ph-pen">${esc(pen ? pen.name : '')}</div>
        </div>
        <div>
          <div class="book-id-title">${esc(title)}</div>
          <div class="book-id-pen${pen ? '' : ' none'}">${esc(pen ? pen.name : 'No pen name yet')}</div>
        </div>
      </div>
      <div class="step-group">
        <div class="step-group-head"><span class="group-name">PLAN</span><span class="group-count">${PLAN_STEPS.filter(isDone).length} of 4 done</span></div>
        ${[1, 2, 3, 4].map(stepLink).join('')}
      </div>
      <div class="step-group">
        <div class="step-group-head"><span class="group-name">PRODUCE</span></div>
        ${[5, 6, QC_STEP].map(stepLink).join('')}
      </div>
      <div class="step-group">
        <div class="step-group-head"><span class="group-name">PACKAGE</span></div>
        ${stepLink(FORMAT_STEP)}${comingRow(9)}
      </div>
      <div class="step-group">
        <div class="group-row"><span class="group-name">RELEASE</span><span class="version-tag">Coming in v3</span></div>
      </div>
      <div class="sidebar-spacer"></div>
      <div class="saved-line" data-saved-line aria-live="polite"></div>`;
    renderSaveLine();
    applyRail();
  }

  /**
   * What the shared save line shows. An error with Retry (edits still unsaved)
   * stays until its own step saves, so a save on another step cannot hide it;
   * the newest such error wins. Otherwise Saving… while any step saves, else
   * the newest state.
   */
  function saveView() {
    const all = Object.keys(saves).map((k) => ({ ...saves[k], owner: Number(k) })).sort((a, b) => b.at - a.at);
    return all.find((v) => v.state === 'error' && v.canRetry)
      || all.find((v) => v.state === 'saving')
      || all[0]
      || { state: 'idle', message: '', canRetry: false, owner: 1 };
  }

  /** The sidebar save line: time of the last save, Saving…, or an error with Retry. */
  function renderSaveLine() {
    const el = nav.querySelector('[data-saved-line]');
    if (!el) return;
    const v = saveView();
    el.dataset.state = v.state;
    if (v.state === 'saving') {
      el.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Saving…</span>';
    } else if (v.state === 'error') {
      el.innerHTML = `<span class="save-error">${SAVE_WARN}<span></span></span>${v.canRetry ? '<button type="button" class="link-btn" data-retry-save>Retry</button>' : ''}`;
      el.querySelector('.save-error span').textContent = v.message || "Couldn't save.";
      const retry = el.querySelector('[data-retry-save]');
      // Retry goes to the step whose save failed.
      if (retry) retry.addEventListener('click', () => MODULES[v.owner] && MODULES[v.owner].retrySave());
    } else {
      el.innerHTML = `${CHECK}<span>${savedText(lastSaved(book))}</span>`;
    }
  }

  /**
   * Next is blocked while the step has required fields left (design 16; only
   * 01 Brief has them). The note says what is missing: on a blocking step the
   * reason itself, otherwise "Not done yet: …" (Next stays on).
   */
  function setGate() {
    const m = MODULES[step];
    const left = m && m.blockers ? m.blockers() : 0;
    const last = step === LAST_STEP;
    nextBtn.disabled = !last && left > 0;
    // The last step: Next stays focusable with the "Coming next" tip (shell pattern), and does nothing.
    nextBtn.classList.toggle('has-tip', last);
    if (last) nextBtn.setAttribute('aria-disabled', 'true'); else nextBtn.removeAttribute('aria-disabled');
    let tip = nextBtn.querySelector('.tip');
    if (last && !tip) {
      tip = document.createElement('span');
      tip.className = 'tip';
      tip.id = 'nextTip';
      tip.setAttribute('role', 'tooltip');
      tip.textContent = 'Coming next';
      nextBtn.append(tip);
    } else if (!last && tip) tip.remove();
    const need = m && m.missing ? m.missing() : '';
    let note = '';
    if (left) note = need || `${left} required field${left === 1 ? '' : 's'} left`;
    else if (need && !isDone(step)) note = `Not done yet: ${lowerFirst(need)}.`;
    else if (last) note = 'Coming next';
    nextNote.textContent = note;
    nextNote.hidden = !note;
    nextBtn.setAttribute('aria-describedby', last ? 'nextNote nextTip' : 'nextNote');
  }

  const ctx = {
    content: () => content,
    isActive: (n) => n === step,
    setGate,
    /** opts.draft: only a draft was saved, which never moves the 07 mark. */
    refresh(opts) {
      renderNav();
      setGate();
      document.title = `${STEPS[step].name} · ${workingTitle(book)} · NicheInk`;
      if (step === 6 && !(opts && opts.draft)) markSoon();
    },
    /** The 07 mark: { checked_at, current }, or null before the first run. */
    qcMark: () => qcMark,
    readQcMark: () => readMark(),
    /** Resolves when the version 06 saves on leaving is in, at most 4 s (as Exit). */
    settled: () => Promise.race([leaving, new Promise((r) => setTimeout(r, 4000))]),
    /** owner = the step number that saves (default 1, the Brief). */
    renderSave(state, message, canRetry, owner = 1) {
      saves[owner] = { state, message, canRetry, at: ++saveSeq };
      renderSaveLine();
    },
    notFound() { renderNotFound(); },
    /** E12 fix batch 3: the book's status changed (status, completed_at, updated_at). */
    setStatus(fields) {
      const was = book.status;
      Object.assign(book, fields);
      if (book.status !== 'completed') reopenErr = false;
      renderStrip();
      renderNav();
      if (was !== book.status && MODULES[step] && MODULES[step].statusChanged) MODULES[step].statusChanged();
    },
    reloadStatus: () => readStatus(),
    /**
     * Open another step, as a sidebar link does (Brief "Open 02 Research").
     * opts.focus: a control the step focuses once it is drawn (step's focusOn).
     */
    go: (n, opts) => go(n, true, opts)
  };

  function renderStep(moveFocus) {
    const s = STEPS[step];
    stepLabel.textContent = `${s.group.toUpperCase()} · STEP ${step} OF ${TOTAL_STEPS}`;
    stepTitle.textContent = s.name;
    backBtn.disabled = step === 1;
    const exportLabel = document.querySelector('[data-export-label]');
    if (exportLabel) exportLabel.textContent = step === FORMAT_STEP ? 'Export files' : 'Export';
    renderNav();
    renderStrip();
    if (book.status === 'completed') readStatus();
    markAfterLeave();
    if (MODULES[step]) {
      content.classList.add('has-step');
      MODULES[step].render(content);
    } else {
      content.classList.remove('has-step');
      content.innerHTML = `
        <div class="step-placeholder">
          <div class="chip-label">COMING IN ${s.task}</div>
          <div>${esc(s.text)}</div>
        </div>`;
    }
    setGate();
    document.title = `${s.name} · ${workingTitle(book)} · NicheInk`;
    if (moveFocus) stepTitle.focus();
  }

  function renderLoading() {
    head.hidden = true;
    nav.innerHTML = `<div class="book-id" aria-hidden="true"><div class="cover-ph mini skel"></div>
      <div class="skel-stack"><div class="skel skel-title"></div><div class="skel skel-line skel-w40"></div></div></div>`;
    content.innerHTML = '<p class="sr-only" role="status">Loading the book…</p>';
  }

  function renderMessage({ title, text, action, danger }) {
    head.hidden = true;
    if (strip) strip.hidden = true;
    nav.innerHTML = '';
    content.innerHTML = `
      <div class="center-state">
        <div class="state-box"${danger ? ' role="alert"' : ''}>
          <div class="state-icon${danger ? ' danger' : ''}" aria-hidden="true">${WARN}</div>
          <h2>${title}</h2>
          <p>${text}</p>
          <div class="state-actions">${action}</div>
        </div>
      </div>`;
  }

  function renderNotFound() {
    document.title = 'Book not found · NicheInk';
    renderMessage({
      title: 'Book not found',
      text: 'This book does not exist, or it belongs to another account.',
      action: '<a class="btn btn-primary" href="dashboard.html">Go to Books</a>'
    });
  }

  function renderError() {
    renderMessage({
      title: "We couldn't load this book",
      text: 'Check your connection, then try again.',
      action: '<button type="button" class="btn btn-primary" data-retry>Retry</button>',
      danger: true
    });
    content.querySelector('[data-retry]').addEventListener('click', load);
  }

  /* ── Navigation between steps ────────────── */

  /** True when the open step lets us leave (Write asks while the AI writes). */
  async function mayLeave() {
    const m = book && MODULES[step];
    if (!m || !m.confirmLeave) return true;
    // Any error while asking means stay: leaving must never skip "Stop and leave?".
    try { return (await m.confirmLeave()) === true; } catch (e) { return false; }
  }

  async function go(n, moveFocus = true, opts) {
    if (n < 1 || n > LAST_STEP || n === step) return;
    if (!(await mayLeave())) return;
    // Write keeps the typed text as a draft; leaving makes it a version. Errors show on the save line.
    if (MODULES[step] && MODULES[step].leave) leaving = MODULES[step].leave().catch(() => {});
    step = n;
    history.pushState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}`);
    renderStep(moveFocus);
    if (opts && opts.focus && MODULES[n] && MODULES[n].focusOn) MODULES[n].focusOn(opts.focus);
  }

  backBtn.addEventListener('click', () => go(step - 1));
  if (strip) strip.addEventListener('click', (e) => { if (e.target.closest('[data-strip-reopen]')) reopenFromStrip(); });
  // Export (design 24b): on every step. Typed text is saved as a draft first;
  // the dialog exports saved versions and says when a section has unsaved edits.
  const exportBtn = document.querySelector('[data-export]');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (!book) return;
    // 08 (design 42): "Export files" opens the 08 panel once the step has it.
    if (MODULES[step] && MODULES[step].openExport) { MODULES[step].openExport(exportBtn); return; }
    if (!window.kdpExport) return;
    if (MODULES[step] && MODULES[step].flush) MODULES[step].flush();
    kdpExport.open(bookId, { opener: exportBtn });
  });
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') return;
    const n = step + 1;
    // Edits keep saving in the background; an error shows in the sidebar with Retry.
    if (MODULES[step] && MODULES[step].flush) MODULES[step].flush();
    go(n);
    if (n > book.current_step) {
      // Only a bookmark for the Books page. If it fails, the next Next tries again.
      kdp.setCurrentStep(bookId, n)
        .then((r) => { if (!r.error && n > book.current_step) book.current_step = n; })
        .catch(() => {});
    }
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('[data-rail-toggle]')) {
      railOpen = !railOpen;
      applyRail();
      nav.querySelector('[data-rail-toggle]').focus();
      return;
    }
    const link = e.target.closest('a[data-step]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;   // let "open in new tab" work
    e.preventDefault();
    go(Number(link.dataset.step));
  });
  // Exit to Books: let the step save first (Write: the typed text as a version), at most 4 s.
  const exit = document.querySelector('.exit-link');
  if (exit) exit.addEventListener('click', (e) => {
    const m = book && MODULES[step];
    if (!m || !m.leave || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    mayLeave().then((ok) => {
      if (!ok) return;
      Promise.race([m.leave().catch(() => {}), new Promise((r) => setTimeout(r, 4000))])
        .then(() => { location.href = exit.href; });
    });
  });
  window.addEventListener('popstate', async () => {
    const to = readStep(new URLSearchParams(location.search).get('step'));
    if (book && to !== step && !(await mayLeave())) {
      // Stay: put this step's address back.
      history.pushState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}${step === 6 && MODULES[6] && MODULES[6].sectionQuery ? MODULES[6].sectionQuery() : ''}`);
      return;
    }
    if (book && MODULES[step] && MODULES[step].leave) leaving = MODULES[step].leave().catch(() => {});
    step = to;
    if (book) renderStep(false);
  });

  /* ── Data ────────────────────────────────── */

  async function load() {
    if (!UUID.test(bookId)) { renderNotFound(); return; }
    renderLoading();
    let res;
    try { res = await kdp.getBook(bookId); } catch (e) { res = { error: e }; }
    if (res.error) { renderError(); return; }
    if (!res.data) { renderNotFound(); return; }
    book = res.data;
    Object.values(MODULES).forEach((m) => m.init && m.init(book, ctx));
    head.hidden = false;
    // Normalise the URL (for example a missing or bad step) without a new history entry.
    // Step 06 keeps the open section (?section=, js/book-write.js).
    const section = step === 6 ? params.get('section') : null;
    history.replaceState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}${section && UUID.test(section) ? `&section=${encodeURIComponent(section)}` : ''}`);
    renderStep(false);
  }

  const user = await kdp.requireAuth('../login.html');
  if (!user) return;
  load();
})();
