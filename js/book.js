/* ═══════════════════════════════════════════════════
   KDP Lab — Book page (design 05)
   /js/book.js   (used by app/book.html)

   URL: book.html?id=<book uuid>&step=<1..6>. The step stays in the URL,
   so a reload keeps it. Next writes books.current_step when it moves past
   the furthest step reached; Back and the sidebar never write it.

   Steps with a screen register in window.kdpBookSteps (E7.1: 01 Brief in
   js/book-brief.js; E7.2: 02 Research in js/book-research.js; E8.1:
   03 Positioning in js/book-positioning.js; E8.2: 04 Title in
   js/book-title.js):
   init(book, ctx) once, render(root) on each visit,
   isDone(book) for the sidebar mark, blockers() for the Next button,
   optional doneMark: 'lock' (03 shows a lock instead of a check).
   A title marked "Needs review" (books.title_needs_review, set by an
   unlock of 03) shows a warning on 04.
   Other steps show a "Coming in" placeholder.
═══════════════════════════════════════════════════ */

(async function () {
  const TOTAL_STEPS = 11;
  const LAST_V1_STEP = 6;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const STEPS = {
    1: { group: 'Plan', name: 'Brief', task: 'E7', text: 'Define the reader, their problem, and the promise of the book.' },
    2: { group: 'Plan', name: 'Research', task: 'E7', text: 'Collect sources and competitor books. The AI quotes facts only from these.' },
    3: { group: 'Plan', name: 'Positioning', task: 'E8', text: 'Choose and lock the angle that makes this book different.' },
    4: { group: 'Plan', name: 'Title', task: 'E8', text: 'Pick a title and subtitle that match the positioning.' },
    5: { group: 'Produce', name: 'Outline', task: 'E9', text: 'Plan the chapters and their word targets.' },
    6: { group: 'Produce', name: 'Write', task: 'E10', text: 'Write the book one section at a time, with AI help.' }
  };

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

  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const SAVE_WARN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
  const LOCK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const WARN = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const pad = (n) => String(n).padStart(2, '0');

  const params = new URLSearchParams(location.search);
  const bookId = params.get('id') || '';
  let step = readStep(params.get('step'));
  let book = null;
  let saveView = { state: 'idle', message: '', canRetry: false, owner: 1 };

  function readStep(value) {
    const n = parseInt(value, 10);
    return n >= 1 && n <= LAST_V1_STEP ? n : 1;
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

  function savedText(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'Saved just now';
    if (mins < 60) return `Saved ${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `Saved ${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `Saved ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  /* ── Rendering ───────────────────────────── */

  function stepLink(n) {
    const s = STEPS[n];
    const current = n === step ? ' aria-current="step"' : '';
    const done = isDone(n);
    const lock = done && MODULES[n].doneMark === 'lock';
    const review = n === 4 && book.title_needs_review;
    const mark = lock ? LOCK : (done && n !== step ? CHECK : '');
    const state = lock ? ', locked' : (done ? ', done' : '');
    return `<a class="step-link${done ? ' is-done' : ''}${lock ? ' is-locked' : ''}" href="?id=${encodeURIComponent(bookId)}&step=${n}" data-step="${n}"${current}>
        <span class="step-mark" aria-hidden="true">${mark}</span><span class="step-num">${pad(n)}</span>${s.name}${state ? `<span class="sr-only">${state}</span>` : ''}${review ? `<span class="step-flag">${SAVE_WARN}Needs review</span>` : ''}</a>`;
  }

  function renderNav() {
    const title = workingTitle(book);
    const pen = one(book.pen_names);
    nav.innerHTML = `
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
        ${[5, 6].map(stepLink).join('')}
        <div class="step-link is-future" aria-disabled="true">
          <span class="step-mark" aria-hidden="true"></span><span class="step-num">07</span>Quality Control
          <span class="version-tag">v2</span>
        </div>
      </div>
      <div class="step-group">
        <div class="group-row"><span class="group-name">PACKAGE</span><span class="version-tag">Coming in v2</span></div>
        <div class="group-row"><span class="group-name">RELEASE</span><span class="version-tag">Coming in v3</span></div>
      </div>
      <div class="sidebar-spacer"></div>
      <div class="saved-line" data-saved-line aria-live="polite"></div>`;
    renderSaveLine();
  }

  /** The sidebar save line: time of the last save, Saving…, or an error with Retry. */
  function renderSaveLine() {
    const el = nav.querySelector('[data-saved-line]');
    if (!el) return;
    const v = saveView;
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

  /** Next is blocked while the step has required fields left (design 16). */
  function setGate() {
    const m = MODULES[step];
    const left = m && m.blockers ? m.blockers() : 0;
    nextBtn.disabled = step === LAST_V1_STEP || left > 0;
    nextNote.textContent = left ? `${left} required field${left === 1 ? '' : 's'} left` : '';
    nextNote.hidden = !left;
  }

  const ctx = {
    content: () => content,
    isActive: (n) => n === step,
    setGate,
    refresh() {
      renderNav();
      setGate();
      document.title = `${STEPS[step].name} · ${workingTitle(book)} · KDP Lab`;
    },
    /** owner = the step number that saves (default 1, the Brief). */
    renderSave(state, message, canRetry, owner = 1) {
      saveView = { state, message, canRetry, owner };
      renderSaveLine();
    },
    notFound() { renderNotFound(); }
  };

  function renderStep(moveFocus) {
    const s = STEPS[step];
    stepLabel.textContent = `${s.group.toUpperCase()} · STEP ${step} OF ${TOTAL_STEPS}`;
    stepTitle.textContent = s.name;
    backBtn.disabled = step === 1;
    renderNav();
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
    document.title = `${s.name} · ${workingTitle(book)} · KDP Lab`;
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
    document.title = 'Book not found · KDP Lab';
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

  function go(n, moveFocus = true) {
    if (n < 1 || n > LAST_V1_STEP || n === step) return;
    step = n;
    history.pushState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}`);
    renderStep(moveFocus);
  }

  backBtn.addEventListener('click', () => go(step - 1));
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
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
    const link = e.target.closest('a[data-step]');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;   // let "open in new tab" work
    e.preventDefault();
    go(Number(link.dataset.step));
  });
  window.addEventListener('popstate', () => {
    step = readStep(new URLSearchParams(location.search).get('step'));
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
    history.replaceState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}`);
    renderStep(false);
  }

  const user = await kdp.requireAuth('../login.html');
  if (!user) return;
  load();
})();
