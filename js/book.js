/* ═══════════════════════════════════════════════════
   KDP Lab — Book page (design 05)
   /js/book.js   (used by app/book.html)

   URL: book.html?id=<book uuid>&step=<1..6>. The step stays in the URL,
   so a reload keeps it. Read only in E3.3: moving between steps does not
   write books.current_step.
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
  const stepLabel = document.querySelector('[data-step-label]');
  const stepTitle = document.querySelector('[data-step-title]');

  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const WARN = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const pad = (n) => String(n).padStart(2, '0');

  const params = new URLSearchParams(location.search);
  const bookId = params.get('id') || '';
  let step = readStep(params.get('step'));
  let book = null;

  function readStep(value) {
    const n = parseInt(value, 10);
    return n >= 1 && n <= LAST_V1_STEP ? n : 1;
  }

  function workingTitle(b) {
    const brief = one(b.book_briefs);
    return (b.title || (brief && brief.topic_text) || '').trim() || 'Untitled book';
  }

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
    return `<a class="step-link" href="?id=${encodeURIComponent(bookId)}&step=${n}" data-step="${n}"${current}>
        <span class="step-mark" aria-hidden="true"></span><span class="step-num">${pad(n)}</span>${s.name}</a>`;
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
        <div class="step-group-head"><span class="group-name">PLAN</span></div>
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
      <div class="saved-line">${CHECK}<span>${savedText(book.updated_at)}</span></div>`;
  }

  function renderStep(moveFocus) {
    const s = STEPS[step];
    stepLabel.textContent = `${s.group.toUpperCase()} · STEP ${step} OF ${TOTAL_STEPS}`;
    stepTitle.textContent = s.name;
    backBtn.disabled = step === 1;
    nextBtn.disabled = step === LAST_V1_STEP;
    nav.querySelectorAll('[data-step]').forEach((a) => {
      if (Number(a.dataset.step) === step) a.setAttribute('aria-current', 'step');
      else a.removeAttribute('aria-current');
    });
    content.innerHTML = `
      <div class="step-placeholder">
        <div class="chip-label">COMING IN ${s.task}</div>
        <div>${esc(s.text)}</div>
      </div>`;
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
  nextBtn.addEventListener('click', () => go(step + 1));
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
    renderNav();
    head.hidden = false;
    // Normalise the URL (for example a missing or bad step) without a new history entry.
    history.replaceState({ step }, '', `?id=${encodeURIComponent(bookId)}&step=${step}`);
    renderStep(false);
  }

  const user = await kdp.requireAuth('../login.html');
  if (!user) return;
  load();
})();
