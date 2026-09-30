/* ═══════════════════════════════════════════════════
   KDP Lab — Step 02 Research (designs 15 and 16)
   /js/book-research.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[2]. js/book.js calls init() once after the book
   loads, render() each time step 02 is shown, and isDone() for the sidebar.

   Competitors (with pasted reviews), sources and notes, and the review
   insights (generate stage review_insights). Limits match migration 0008.
   Step 02 is done with at least 3 competitors and 1 source (kind 'source';
   a personal note does not count).

   Insights are saved by the browser after the AI answers (v1). Each line
   keeps the competitor titles it came from and an "edited" flag. Analyze
   again asks before it replaces edited lines.
   v3: move that save to the server so the AI label is set server-side.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpPens;

  // Same limits as migration 0008 and supabase/functions/generate/lib.ts.
  const MAX = { title: 300, author: 200, toc: 2000, low_reviews: 4000, high_reviews: 4000, body: 2000, citation: 500, line: 160 };
  const MAX_COMPETITORS = 10;
  const NEED_COMPETITORS = 3;
  const NEED_REVIEWED = 3;
  const MAX_BSR = 100000000;
  const MAX_REVIEWS = 10000000;
  const LISTS = [
    ['loves', 'READERS LOVE', 'love'],
    ['hates', 'READERS HATE', 'hate'],
    ['gaps', 'GAPS NO BOOK COVERS', 'gap']
  ];
  const EDIT_ICON = ICON.rename;
  const STAR = '★';

  let ctx = null, book = null, els = null;
  let counts = { competitors: 0, sources: 0 };
  let data = null, loadState = 'loading', loadToken = 0;
  let picks = null;                    // included page-1 books of the book's topic
  let form = null;                     // the open Add/Edit form, or null
  let analysis = { state: 'idle' };    // idle | confirm | working | stopped | error
  let analysisToken = 0;
  let pending = null;                  // an analysis that is done but not saved yet
  let lineEdit = null;                 // { list, index, text, error }
  let lineBusy = false;
  let lineError = '';
  let del = null, copy = null;         // dialogs, built on first use

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const num = (n) => Number(n).toLocaleString('en-US');
  const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;
  const countOf = (rel) => {
    const r = Array.isArray(rel) ? rel[0] : rel;
    return r && Number.isInteger(r.count) ? r.count : 0;
  };

  /** One review per paragraph: reviews are separated by a blank line. */
  const reviewCount = (text) => str(text).split(/\n\s*\n/).filter((p) => p.trim()).length;
  const reviewsOf = (c) => reviewCount(c.low_reviews) + reviewCount(c.high_reviews);
  const hasReviews = (c) => !!(str(c.low_reviews).trim() || str(c.high_reviews).trim());
  const reviewedCount = () => (data ? data.competitors.filter(hasReviews).length : 0);
  const bookKey = (title, author) => `${str(title).trim().toLowerCase()}\u0000${str(author).trim().toLowerCase()}`;

  function setCounts() {
    counts = {
      competitors: data.competitors.length,
      sources: data.sources.filter((s) => s.kind === 'source').length
    };
  }

  function agoText(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `on ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  const lists = () => {
    const i = data && data.insights;
    return i ? { loves: i.loves || [], hates: i.hates || [], gaps: i.gaps || [] } : null;
  };
  const hasEditedLines = () => {
    const l = lists();
    return !!l && LISTS.some(([k]) => l[k].some((x) => x.edited));
  };

  /* ── Step API for js/book.js ─────────────── */

  const isDone = () => counts.competitors >= NEED_COMPETITORS && counts.sources >= 1;

  function init(b, c) {
    ctx = c;
    book = b;
    counts = { competitors: countOf(b.competitors), sources: countOf(b.real_sources) };
    load();
    loadPicks();
    window.addEventListener('beforeunload', (e) => {
      if (form && form.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  async function load() {
    const token = ++loadToken;
    loadState = 'loading';
    renderParts();
    let res;
    try { res = await kdp.listResearch(book.id); } catch (err) { res = { error: err }; }
    if (token !== loadToken) return;
    if (res.error) { loadState = 'error'; renderParts(); return; }
    data = res.data;
    loadState = 'ready';
    setCounts();
    ctx.refresh();
    renderParts();
  }

  async function loadPicks() {
    if (!book.topic_id) return;
    let res;
    try { res = await kdp.listTopicPicks(book.topic_id); } catch (err) { res = { error: err }; }
    // Without the list the Copy button just stays hidden; Add competitor still works.
    picks = res.error ? null : (res.data || []);
    renderCompetitors();
  }

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    root.innerHTML = `
      <div class="research">
        <p class="sr-only" role="status" data-announce></p>
        <div class="research-main">
          <section class="panel research-card" aria-labelledby="rsComp">
            <div class="research-card-head">
              <div>
                <h2 class="panel-title" id="rsComp">Competitor books <span class="research-count" data-comp-count></span></h2>
                <p class="panel-hint">The top 3 to 5 books from Amazon page 1.</p>
              </div>
              <div class="research-card-actions" data-comp-actions></div>
            </div>
            <div class="research-list" data-comp-body></div>
          </section>

          <section class="panel research-card" aria-labelledby="rsSrc">
            <div class="research-card-head">
              <div>
                <h2 class="panel-title" id="rsSrc">Your sources and notes</h2>
                <p class="panel-hint">Facts, studies, and your own experience. The AI may quote only what you add here.</p>
              </div>
              <div class="research-card-actions" data-src-actions></div>
            </div>
            <div class="research-sources" data-src-body></div>
          </section>
        </div>
        <aside class="panel research-side" aria-labelledby="rsGaps" data-insights></aside>
      </div>`;
    els = {
      root: root.querySelector('.research'),
      announce: root.querySelector('[data-announce]'),
      compCount: root.querySelector('[data-comp-count]'),
      compActions: root.querySelector('[data-comp-actions]'),
      compBody: root.querySelector('[data-comp-body]'),
      srcActions: root.querySelector('[data-src-actions]'),
      srcBody: root.querySelector('[data-src-body]'),
      insights: root.querySelector('[data-insights]')
    };
    bind();
    renderParts();
    ctx.setGate();
  }

  const active = () => !!els && ctx.isActive(2) && els.root.isConnected;

  function renderParts() {
    renderCompetitors();
    renderSources();
    renderInsights();
  }

  function announce(text) {
    if (!active()) return;
    els.announce.textContent = '';
    setTimeout(() => { if (els) els.announce.textContent = text; }, 50);
  }

  function loadError(label) {
    return `<div class="alert alert-error" role="alert">${ICON.warn(18)}<div>
        <p class="alert-text">We couldn’t load your ${label}.</p>
        <button type="button" class="link-btn" data-reload>Try again</button></div></div>`;
  }

  const skeleton = (n) => Array.from({ length: n }, () => `
      <div class="comp-row" aria-hidden="true"><div class="comp-spine skel"></div>
        <div class="skel-stack skel-grow"><div class="skel skel-line skel-w60"></div><div class="skel skel-line skel-w40"></div></div></div>`).join('');

  /* Competitors ─────────────────────────────── */

  function renderCompetitors() {
    if (!active()) return;
    const ready = loadState === 'ready';
    const list = ready ? data.competitors : [];
    els.compCount.textContent = ready ? String(list.length) : '';
    const full = ready && list.length >= MAX_COMPETITORS;
    const formOpen = !!form;
    const canCopy = ready && picks && picks.length > 0;
    els.compActions.innerHTML = `
      ${canCopy ? `<button type="button" class="btn btn-secondary" data-copy${full || formOpen ? ' disabled' : ''}>Copy from Topic Lab</button>` : ''}
      <button type="button" class="btn btn-secondary" data-add-comp${!ready || full || formOpen ? ' disabled' : ''}>${ICON.plus}Add competitor</button>`;

    if (loadState === 'loading') { els.compBody.innerHTML = skeleton(2); return; }
    if (loadState === 'error') { els.compBody.innerHTML = loadError('research'); return; }

    const rows = list.map((c) => (form && form.type === 'competitor' && form.id === c.id ? competitorForm() : competitorRow(c)));
    if (form && form.type === 'competitor' && !form.id) rows.push(competitorForm());
    let html = rows.join('');
    if (!list.length && !(form && form.type === 'competitor')) {
      html = `<div class="note-box">No competitors yet. Add the top 3 to 5 books from Amazon page 1${canCopy ? ', or copy them from Topic Lab' : ''}.</div>`;
    }
    if (full) html += `<p class="field-hint research-full">${MAX_COMPETITORS} of ${MAX_COMPETITORS} added. Delete one to add another.</p>`;
    els.compBody.innerHTML = html;
    if (form && form.type === 'competitor') fillForm();
  }

  function competitorRow(c) {
    const meta = [
      c.author ? esc(c.author) : '',
      c.bsr != null ? `<span class="meta-item">BSR ${num(c.bsr)}</span>` : '',
      c.reviews != null ? `<span class="meta-item">${plural(num(c.reviews), 'review')}</span>` : '',
      c.rating != null ? `<span class="meta-item">${Number(c.rating).toFixed(1)} <span aria-label="stars">${STAR}</span></span>` : ''
    ].filter(Boolean).join(' · ');
    const n = reviewsOf(c);
    const tags = [
      c.is_authority ? `<span class="badge badge-warning">${ICON.warn(12)}Authority book</span>` : '',
      str(c.toc).trim() ? '<span class="pill research-pill">Contents added</span>' : '',
      `<span class="pill research-pill">${n ? `${plural(n, 'review')} pasted` : 'No reviews pasted'}</span>`
    ].join('');
    return `<div class="comp-row" data-comp="${esc(c.id)}">
        <div class="comp-spine" aria-hidden="true"></div>
        <div class="comp-body">
          <div class="comp-title title-clamp" title="${esc(c.title)}">${esc(c.title)}</div>
          ${meta ? `<div class="comp-meta">${meta}</div>` : ''}
          <div class="comp-tags">${tags}</div>
        </div>
        <button type="button" class="icon-btn" data-edit-comp="${esc(c.id)}" aria-label="Edit ${esc(c.title)}"${form ? ' disabled' : ''}>${EDIT_ICON}</button>
      </div>`;
  }

  function field({ key, label, required, area, rows = 2, placeholder = '', mode, hint }) {
    const id = `rf-${key}`;
    const req = required ? ' <span class="field-optional">(required)</span>' : '';
    const max = MAX[key] ? ` maxlength="${MAX[key]}"` : '';
    const ph = placeholder ? ` placeholder="${esc(placeholder)}"` : '';
    const hintHtml = hint ? `<span class="field-hint" id="${id}-hint">${hint}</span>` : '';
    const described = [hint ? `${id}-hint` : '', `${id}-error`, area && MAX[key] >= 1000 ? `${id}-count` : ''].filter(Boolean).join(' ');
    const control = area
      ? `<textarea class="text-area" id="${id}" rows="${rows}"${max}${ph} data-f="${key}" aria-describedby="${described}"></textarea>`
      : `<input class="text-input" id="${id}" type="text"${max}${ph} autocomplete="off"${mode ? ` inputmode="${mode}"` : ''} data-f="${key}" aria-describedby="${described}"${required ? ' aria-required="true"' : ''} />`;
    const counter = area && MAX[key] >= 1000 ? `<span class="field-hint research-counter" id="${id}-count" data-counter="${key}"></span>` : '';
    return `<div class="field">
        <label for="${id}">${label}${req}</label>
        ${hintHtml}
        ${control}
        ${counter}
        <span class="field-error" id="${id}-error" data-err="${key}" hidden></span>
      </div>`;
  }

  function formFoot(deleteLabel, saveLabel) {
    return `<div class="alert alert-error" role="alert" data-form-error hidden></div>
      <div class="research-form-foot">
        ${form.id ? `<button type="button" class="btn btn-secondary btn-danger-text" data-form-delete>${ICON.trash()}${deleteLabel}</button>` : ''}
        <span class="research-form-spacer"></span>
        <button type="button" class="btn btn-secondary" data-form-cancel>Cancel</button>
        <button type="submit" class="btn btn-primary" data-form-save>${saveLabel}</button>
      </div>`;
  }

  function competitorForm() {
    const title = form.id ? 'EDIT COMPETITOR' : 'ADD COMPETITOR';
    return `<form class="research-form" data-form novalidate aria-labelledby="rfHead">
        <span class="chip-label" id="rfHead">${title}</span>
        <div class="research-grid">
          ${field({ key: 'title', label: 'Title', required: true })}
          ${field({ key: 'author', label: 'Author' })}
          ${field({ key: 'bsr', label: 'BSR', mode: 'numeric' })}
          ${field({ key: 'reviews', label: 'Reviews', mode: 'numeric' })}
          ${field({ key: 'rating', label: 'Rating', mode: 'decimal', hint: '0 to 5 stars' })}
        </div>
        ${field({ key: 'toc', label: 'Table of contents', area: true, placeholder: 'Paste from the Look Inside preview' })}
        <div class="research-grid">
          ${field({ key: 'low_reviews', label: '1 to 2 star reviews', area: true, rows: 4, placeholder: 'What readers hate' })}
          ${field({ key: 'high_reviews', label: '4 to 5 star reviews', area: true, rows: 4, placeholder: 'What readers love' })}
        </div>
        <p class="field-hint research-form-note">Leave a blank line between reviews. Paste reviews as readers wrote them. The AI sums them up in its own words.</p>
        ${formFoot('Delete competitor', form.id ? 'Save changes' : 'Add competitor')}
      </form>`;
  }

  /* Sources ─────────────────────────────────── */

  function renderSources() {
    if (!active()) return;
    const ready = loadState === 'ready';
    els.srcActions.innerHTML = `<button type="button" class="btn btn-secondary" data-add-src${!ready || form ? ' disabled' : ''}>${ICON.plus}Add source or note</button>`;
    if (loadState === 'loading') { els.srcBody.innerHTML = '<div class="skel skel-bar" aria-hidden="true"></div>'; return; }
    if (loadState === 'error') { els.srcBody.innerHTML = ''; return; }
    const cards = data.sources.map((s) => (form && form.type === 'source' && form.id === s.id ? sourceForm() : sourceCard(s)));
    if (form && form.type === 'source' && !form.id) cards.push(sourceForm());
    els.srcBody.innerHTML = cards.length
      ? cards.join('')
      : '<div class="note-box">No sources yet. Add a fact with where it comes from, or a note from your own experience. Step 02 needs at least one source.</div>';
    if (form && form.type === 'source') fillForm();
  }

  function sourceCard(s) {
    const label = s.kind === 'source' ? 'SOURCE' : 'PERSONAL NOTE';
    return `<div class="source-card" data-src="${esc(s.id)}">
        <div class="source-text">
          <span class="chip-label">${label}</span>
          <p class="source-body">${esc(s.body)}</p>
          ${s.citation ? `<p class="source-cite">${esc(s.citation)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-edit-src="${esc(s.id)}" aria-label="Edit ${s.kind === 'source' ? 'source' : 'note'}: ${esc(s.body.slice(0, 60))}"${form ? ' disabled' : ''}>${EDIT_ICON}</button>
      </div>`;
  }

  function sourceForm() {
    const isSource = form.values.kind === 'source';
    const head = form.id ? (form.saved.kind === 'source' ? 'EDIT SOURCE' : 'EDIT NOTE') : 'ADD SOURCE OR NOTE';
    return `<form class="research-form" data-form novalidate aria-labelledby="rfHead">
        <span class="chip-label" id="rfHead">${head}</span>
        <div class="field">
          <span class="field-label" id="rfKind">Type</span>
          <div class="tone-chips" role="group" aria-labelledby="rfKind">
            <button type="button" class="tone-chip" data-kind="source" aria-pressed="${isSource}">Source</button>
            <button type="button" class="tone-chip" data-kind="note" aria-pressed="${!isSource}">Personal note</button>
          </div>
          <span class="field-hint">${isSource ? 'A fact, with where it comes from. The AI may quote it.' : 'Your own experience. The AI treats it as your view, not as a fact.'}</span>
        </div>
        ${field({ key: 'body', label: isSource ? 'Fact' : 'Note', required: true, area: true, rows: 3, placeholder: isSource ? 'Paste a fact' : 'Write a note' })}
        ${isSource ? field({ key: 'citation', label: 'Where it comes from', required: true, hint: 'A book, study, guideline, or website.' }) : ''}
        ${formFoot(form.saved.kind === 'source' ? 'Delete source' : 'Delete note', form.id ? 'Save changes' : (isSource ? 'Add source' : 'Add note'))}
      </form>`;
  }

  /* Form state ──────────────────────────────── */

  const numText = (v) => (v == null ? '' : String(v));

  function openCompetitor(c, opener) {
    const v = c
      ? { title: c.title, author: str(c.author), bsr: numText(c.bsr), reviews: numText(c.reviews), rating: c.rating == null ? '' : Number(c.rating).toFixed(1), toc: str(c.toc), low_reviews: str(c.low_reviews), high_reviews: str(c.high_reviews) }
      : { title: '', author: '', bsr: '', reviews: '', rating: '', toc: '', low_reviews: '', high_reviews: '' };
    form = { type: 'competitor', id: c ? c.id : null, values: v, saved: { ...v }, errors: {}, error: '', busy: false, dirty: false, opener };
    renderParts();
    focusForm();
  }

  function openSource(s, opener) {
    const v = s ? { kind: s.kind, body: s.body, citation: str(s.citation) } : { kind: 'source', body: '', citation: '' };
    form = { type: 'source', id: s ? s.id : null, values: v, saved: { ...v }, errors: {}, error: '', busy: false, dirty: false, opener };
    renderParts();
    focusForm();
  }

  function focusForm() {
    if (!active()) return;
    const f = els.root.querySelector('[data-form] [data-f]');
    if (f) f.focus();
  }

  /** Put the form values, errors and counters into the rendered form. */
  function fillForm() {
    const f = els.root.querySelector('[data-form]');
    if (!f) return;
    f.querySelectorAll('[data-f]').forEach((el) => { el.value = form.values[el.dataset.f]; });
    f.querySelectorAll('[data-counter]').forEach(updateCounter);
    Object.keys(form.errors).forEach((k) => showFieldError(k, form.errors[k]));
    showFormError(form.error);
    setFormBusy(form.busy);
  }

  function updateCounter(el) {
    const k = el.dataset.counter;
    const n = form.values[k].length;
    el.textContent = `${num(n)} of ${num(MAX[k])} characters${k.endsWith('_reviews') && n ? ` · ${plural(reviewCount(form.values[k]), 'review')}` : ''}`;
  }

  function showFieldError(k, msg) {
    const input = els.root.querySelector(`#rf-${k}`);
    const err = els.root.querySelector(`[data-err="${k}"]`);
    if (!input || !err) return;
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      err.innerHTML = ICON.x();
      err.append(msg);
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
    }
  }

  function showFormError(msg) {
    const box = els && els.root.querySelector('[data-form-error]');
    if (!box) return;
    box.hidden = !msg;
    box.innerHTML = msg ? ICON.warn(18) : '';
    if (msg) {
      const p = document.createElement('p');
      p.className = 'alert-text';
      p.textContent = msg;
      box.append(p);
    }
  }

  function setFormBusy(on) {
    const f = els && els.root.querySelector('[data-form]');
    if (!f) return;
    f.querySelectorAll('button').forEach((b) => { b.disabled = on; });
    const save = f.querySelector('[data-form-save]');
    if (on) save.setAttribute('aria-busy', 'true'); else save.removeAttribute('aria-busy');
  }

  /** A whole number in [min, max] from text ("12,400" is 12400), '' for empty, or null when bad. */
  function wholeIn(text, min, max) {
    const t = text.trim().replace(/,/g, '');
    if (!t) return '';
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= min && n <= max ? n : null;
  }

  /** The row to save, or { errors }. */
  function readCompetitor(v) {
    const errors = {};
    const out = {};
    const title = v.title.trim();
    if (!title) errors.title = 'Enter the book title.';
    else if (title.length > MAX.title) errors.title = `Use ${MAX.title} characters or fewer.`;
    out.title = title;
    const author = v.author.trim();
    if (author.length > MAX.author) errors.author = `Use ${MAX.author} characters or fewer.`;
    out.author = author || null;
    const bsr = wholeIn(v.bsr, 1, MAX_BSR);
    if (bsr === null) errors.bsr = 'Use a whole number from 1 to 100,000,000.';
    out.bsr = bsr === '' ? null : bsr;
    const reviews = wholeIn(v.reviews, 0, MAX_REVIEWS);
    if (reviews === null) errors.reviews = 'Use a whole number from 0 to 10,000,000.';
    out.reviews = reviews === '' ? null : reviews;
    const r = v.rating.trim().replace(',', '.');
    const rating = Number(r);
    if (r && (!/^\d(\.\d+)?$/.test(r) || rating > 5)) errors.rating = 'Use a number from 0 to 5.';
    out.rating = r ? Math.round(rating * 10) / 10 : null;
    ['toc', 'low_reviews', 'high_reviews'].forEach((k) => {
      const t = v[k].trim();
      if (t.length > MAX[k]) errors[k] = `Use ${num(MAX[k])} characters or fewer.`;
      out[k] = t || null;
    });
    return Object.keys(errors).length ? { errors } : { row: out };
  }

  function readSource(v) {
    const errors = {};
    const body = v.body.trim();
    if (!body) errors.body = v.kind === 'source' ? 'Enter the fact.' : 'Enter the note.';
    else if (body.length > MAX.body) errors.body = `Use ${num(MAX.body)} characters or fewer.`;
    const citation = v.kind === 'source' ? v.citation.trim() : '';
    if (v.kind === 'source' && !citation) errors.citation = 'Say where this fact comes from.';
    else if (citation.length > MAX.citation) errors.citation = `Use ${MAX.citation} characters or fewer.`;
    return Object.keys(errors).length ? { errors } : { row: { kind: v.kind, body, citation: citation || null } };
  }

  /** [message, reload] for a failed save. */
  function saveMessage(e) {
    if (e && e.code === 'P0001' && /competitor_limit/.test(e.message || '')) return [`A book can have at most ${MAX_COMPETITORS} competitors. Delete one to add another.`, true];
    if (e && e.code === '23514') return ['This breaks a Research rule, so it was not saved. Check the lengths and numbers.', false];
    if (e && (e.notFound || e.code === '42501' || e.code === '23503')) return ['This item is no longer here. It may have been deleted in another tab.', true];
    return ['We couldn’t save. Check your connection, then try again.', false];
  }

  async function submitForm() {
    if (!form || form.busy) return;
    const f = form;
    const read = f.type === 'competitor' ? readCompetitor(f.values) : readSource(f.values);
    f.errors = read.errors || {};
    f.error = '';
    els.root.querySelectorAll('[data-err]').forEach((el) => showFieldError(el.dataset.err, f.errors[el.dataset.err] || ''));
    showFormError('');
    if (read.errors) {
      const first = els.root.querySelector('[data-form] [aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    f.busy = true;
    setFormBusy(true);
    let res;
    try {
      res = f.type === 'competitor'
        ? await (f.id ? kdp.updateCompetitor(f.id, read.row) : kdp.addCompetitor(book.id, read.row))
        : await (f.id ? kdp.updateSource(f.id, read.row) : kdp.addSource(book.id, read.row));
    } catch (err) { res = { error: err }; }
    if (form !== f) return;
    f.busy = false;
    if (res.error) {
      const [msg, reload] = saveMessage(res.error);
      f.error = msg;
      if (!active()) return;
      setFormBusy(false);
      showFormError(msg);
      if (reload) refreshData();
      return;
    }
    const list = f.type === 'competitor' ? data.competitors : data.sources;
    if (f.id) list[list.findIndex((x) => x.id === f.id)] = res.data;
    else list.push(res.data);
    form = null;
    setCounts();
    ctx.refresh();
    renderParts();
    const what = f.type === 'competitor' ? 'Competitor' : (res.data.kind === 'source' ? 'Source' : 'Note');
    announce(`${what} ${f.id ? 'saved' : 'added'}.`);
    focusAfter(f.type, res.data.id);
  }

  function cancelForm() {
    if (!form || form.busy) return;
    const f = form;
    form = null;
    renderParts();
    focusAfter(f.type, f.id);
  }

  /** Focus the row's Edit button, or the section's Add button. */
  function focusAfter(type, id) {
    if (!active()) return;
    const sel = type === 'competitor'
      ? (id ? `[data-edit-comp="${id}"]` : '[data-add-comp]')
      : (id ? `[data-edit-src="${id}"]` : '[data-add-src]');
    const el = els.root.querySelector(sel) || els.root.querySelector(type === 'competitor' ? '[data-add-comp]' : '[data-add-src]');
    if (el && !el.disabled) el.focus();
  }

  /** Reload the lists (after "gone" or limit errors). An open form stays. */
  async function refreshData() {
    let res;
    try { res = await kdp.listResearch(book.id); } catch (err) { return; }
    if (res.error) return;
    data = res.data;
    setCounts();
    ctx.refresh();
    if (!form) renderParts();
    else renderInsights();
  }

  /* ── Delete dialog ───────────────────────── */

  function buildDelete() {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', 'rdTitle');
    d.setAttribute('aria-describedby', 'rdDesc');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="delete-head">
          <span class="delete-icon">${ICON.trash(20)}</span>
          <h2 id="rdTitle"></h2>
        </div>
        <p class="delete-text" id="rdDesc"></p>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-danger" data-confirm></button>
        </div>
      </form>`;
    document.body.append(d);
    del = { d, title: d.querySelector('#rdTitle'), text: d.querySelector('#rdDesc'), error: d.querySelector('[data-error]'), btn: d.querySelector('[data-confirm]'), busy: false, done: false, target: null };
    const close = () => { if (!del.busy) d.close(); };
    d.querySelector('[data-close]').addEventListener('click', close);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => {
      if (del.done) return;
      const b = active() && els.root.querySelector('[data-form-delete]');
      if (b) b.focus();
    });
    d.querySelector('form').addEventListener('submit', onDelete);
  }

  function openDelete() {
    if (!form || !form.id || form.busy) return;
    if (!del) buildDelete();
    const isComp = form.type === 'competitor';
    const item = isComp ? data.competitors.find((c) => c.id === form.id) : data.sources.find((s) => s.id === form.id);
    if (!item) return;
    const noun = isComp ? 'competitor' : (item.kind === 'source' ? 'source' : 'note');
    del.target = { type: form.type, id: form.id, noun };
    del.busy = false;
    del.done = false;
    del.title.textContent = isComp ? `Delete "${item.title}"?` : `Delete this ${noun}?`;
    del.text.textContent = isComp
      ? 'Its contents and pasted reviews will be deleted. Lines in Research gaps keep their text. '
      : `This ${noun} will be deleted. `;
    const strong = document.createElement('strong');
    strong.textContent = 'This cannot be undone.';
    del.text.append(strong);
    del.error.hidden = true;
    del.btn.disabled = false;
    del.btn.textContent = `Delete ${noun}`;
    del.d.showModal();
    del.d.querySelector('[data-close]').focus();
  }

  async function onDelete(e) {
    e.preventDefault();
    if (del.busy) return;
    const t = del.target;
    del.busy = true;
    del.btn.disabled = true;
    del.btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Deleting…';
    let res;
    try { res = await (t.type === 'competitor' ? kdp.deleteCompetitor(t.id) : kdp.deleteSource(t.id)); } catch (err) { res = { error: err }; }
    del.busy = false;
    if (res.error && !res.error.notFound) {
      del.btn.disabled = false;
      del.btn.textContent = `Delete ${t.noun}`;
      del.error.innerHTML = ICON.warn(18);
      const p = document.createElement('div');
      p.textContent = 'We couldn’t delete it. Check your connection, then try again.';
      del.error.append(p);
      del.error.hidden = false;
      return;
    }
    // Deleted now, or already gone: either way it leaves the list.
    const list = t.type === 'competitor' ? data.competitors : data.sources;
    const i = list.findIndex((x) => x.id === t.id);
    if (i >= 0) list.splice(i, 1);
    if (form && form.id === t.id) form = null;
    setCounts();
    ctx.refresh();
    del.done = true;
    del.d.close();
    renderParts();
    announce(`${t.noun[0].toUpperCase()}${t.noun.slice(1)} deleted.`);
    focusAfter(t.type, null);
  }

  /* ── Copy from Topic Lab ─────────────────── */

  function buildCopy() {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.setAttribute('aria-labelledby', 'cpTitle');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="cpTitle">Copy from Topic Lab</h2>
            <p>Pick the page-1 books to add as competitors. This is a one-time copy: later changes in Topic Lab do not change these books.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <fieldset class="copy-list" data-list><legend class="sr-only">Page-1 books</legend></fieldset>
        <p class="field-hint" data-room aria-live="polite"></p>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" data-confirm>Copy books</button>
        </div>
      </form>`;
    document.body.append(d);
    copy = { d, list: d.querySelector('[data-list]'), room: d.querySelector('[data-room]'), error: d.querySelector('[data-error]'), btn: d.querySelector('[data-confirm]'), busy: false, done: false };
    const close = () => { if (!copy.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => {
      const b = active() && els.root.querySelector(copy.done ? '[data-add-comp]' : '[data-copy]');
      if (b && !b.disabled) b.focus();
      else if (active()) { const a = els.root.querySelector('#rsComp'); if (a) { a.tabIndex = -1; a.focus(); } }
    });
    copy.list.addEventListener('change', syncCopy);
    d.querySelector('form').addEventListener('submit', onCopy);
  }

  const room = () => MAX_COMPETITORS - data.competitors.length;

  function openCopy() {
    if (!picks || !picks.length || form) return;
    if (!copy) buildCopy();
    const have = new Set(data.competitors.map((c) => bookKey(c.title, c.author)));
    copy.busy = false;
    copy.done = false;
    copy.error.hidden = true;
    copy.list.querySelectorAll('.copy-row').forEach((x) => x.remove());
    picks.forEach((p, i) => {
      const added = have.has(bookKey(p.title, p.author));
      // Only the author may break inside; "BSR 12,400", "184 reviews" and "4.4 ★" stay whole.
      const meta = [
        p.author ? esc(p.author) : '',
        p.bsr != null ? `<span class="meta-item">BSR ${num(p.bsr)}</span>` : '',
        p.reviews != null ? `<span class="meta-item">${plural(num(p.reviews), 'review')}</span>` : '',
        p.rating != null ? `<span class="meta-item">${Number(p.rating).toFixed(1)} ${STAR}</span>` : ''
      ].filter(Boolean).join(' · ');
      const row = document.createElement('label');
      row.className = `copy-row${added ? ' is-added' : ''}`;
      row.innerHTML = `<input type="checkbox" class="copy-check" value="${i}"${added ? ' disabled' : ''} />
        <span class="copy-text"><span class="copy-title title-clamp"></span><span class="copy-meta"></span></span>
        <span class="copy-tags">${p.sponsored ? '<span class="tag">Sponsored</span>' : ''}${added ? '<span class="tag">Already added</span>' : ''}</span>`;
      row.querySelector('.copy-title').textContent = p.title;
      row.querySelector('.copy-title').title = p.title;
      row.querySelector('.copy-meta').innerHTML = meta;
      copy.list.append(row);
    });
    syncCopy();
    copy.d.showModal();
    const first = copy.list.querySelector('.copy-check:not(:disabled)');
    (first || copy.d.querySelector('[data-close]')).focus();
  }

  function picked() {
    return [...copy.list.querySelectorAll('.copy-check:checked')].map((c) => picks[Number(c.value)]);
  }

  /** At most "room" books can be picked; the rest are disabled while the cap is reached. */
  function syncCopy() {
    const n = picked().length;
    const left = room();
    copy.list.querySelectorAll('.copy-check').forEach((c) => {
      const added = c.closest('.copy-row').classList.contains('is-added');
      c.disabled = copy.busy || added || (!c.checked && n >= left);
    });
    copy.room.textContent = left > 0
      ? `${n} picked. Room for ${plural(left, 'more book')} (${MAX_COMPETITORS} at most).`
      : `This book already has ${MAX_COMPETITORS} competitors.`;
    if (!copy.busy) {
      copy.btn.disabled = n === 0;
      copy.btn.textContent = n ? `Copy ${plural(n, 'book')}` : 'Copy books';
    }
  }

  async function onCopy(e) {
    e.preventDefault();
    const rows = picked().map((p) => ({ title: p.title, author: p.author, bsr: p.bsr, reviews: p.reviews, rating: p.rating }));
    if (copy.busy || !rows.length) return;
    copy.busy = true;
    copy.error.hidden = true;
    copy.btn.disabled = true;
    copy.btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Copying…';
    syncCopy();
    let res;
    try { res = await kdp.copyCompetitors(book.id, rows); } catch (err) { res = { error: err }; }
    copy.busy = false;
    if (res.error) {
      const [msg, reload] = saveMessage(res.error);
      copy.error.innerHTML = ICON.warn(18);
      const p = document.createElement('div');
      p.textContent = msg;
      copy.error.append(p);
      copy.error.hidden = false;
      syncCopy();
      if (reload) refreshData();
      return;
    }
    data.competitors.push(...res.data);
    setCounts();
    ctx.refresh();
    copy.done = true;
    copy.d.close();
    renderParts();
    announce(`${plural(res.data.length, 'book')} copied from Topic Lab.`);
  }

  /* ── Research gaps (stage review_insights) ── */

  const nextMonthUtc = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** [kind, text, retry] for an error code. */
  function analysisMessage(code, have) {
    switch (code) {
      case 'not_enough_books': return ['warning', `Gaps need at least ${NEED_REVIEWED} competitors with pasted reviews. ${have == null ? reviewedCount() : have} of ${NEED_REVIEWED} added.`, false];
      case 'monthly_limit': return ['warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`, false];
      case 'rate_limited': return ['warning', 'Too many requests. Wait a minute, then try again.', true];
      case 'save_failed': return ['error', 'The analysis is done, but we couldn’t save it. Check your connection, then save again.', true];
      case 'network': return ['error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.', true];
      default: return ['error', 'The AI is not available right now. This try was not counted.', true];
    }
  }

  const ICONS = {
    love: ICON.check(15),
    hate: ICON.x(15),
    gap: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>'
  };
  const SPARKLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';

  function renderInsights() {
    if (!active()) return;
    const box = els.insights;
    const l = lists();
    const sub = l && data.insights.analyzed_at ? `Analyzed ${agoText(data.insights.analyzed_at)}` : 'From the reviews you paste above';
    const head = `<div class="research-side-head">
        <span class="chip-label">RESEARCH GAPS</span>
        <h2 class="research-side-title" id="rsGaps" tabindex="-1">What competitors miss</h2>
        <p class="research-side-sub">${esc(sub)}</p>
      </div>`;

    if (loadState !== 'ready') {
      box.innerHTML = head + (loadState === 'loading'
        ? '<div class="skel-stack" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div><div class="skel skel-line skel-w40"></div></div>'
        : '<p class="field-hint">Research gaps show when your research loads.</p>');
      return;
    }

    const have = reviewedCount();
    const missing = Math.max(0, NEED_REVIEWED - have);
    let body = '';

    if (analysis.state === 'working') {
      body = `<div class="research-working" role="status">
          <div class="help-working"><span class="spinner" aria-hidden="true"></span>${analysis.saving ? 'Saving the analysis…' : `Reading reviews from ${plural(analysis.books, 'book')}…`}</div>
          <div class="research-track"><span class="research-track-bar"></span></div>
          <span class="field-hint">About 20 seconds. You can keep editing your research.</span>
          <div><button type="button" class="btn btn-secondary" data-analyze-stop>Stop</button></div>
        </div>`;
      box.innerHTML = head + body;
      return;
    }

    if (!l && missing > 0) {
      const bars = Array.from({ length: NEED_REVIEWED }, (_, i) => `<span class="research-seg${i < have ? ' is-on' : ''}"></span>`).join('');
      body = `<div class="research-empty">
          <div class="research-empty-title">Add ${plural(missing, 'more book')} to see gaps</div>
          <div class="research-segs" aria-hidden="true">${bars}</div>
          <p class="research-empty-text">Gaps need at least ${NEED_REVIEWED} competitors with pasted reviews. ${have} of ${NEED_REVIEWED} added.</p>
        </div>`;
    } else if (!l) {
      body = `<p class="research-empty-text">Find what readers love, what they hate, and what no book covers yet. The AI reads the reviews you pasted for ${plural(have, 'book')}.</p>`;
    } else {
      body = LISTS.map(([k, label, kind]) => listBlock(k, label, kind, l[k])).join('');
      if (LISTS.every(([k]) => !l[k].length)) {
        body = '<p class="research-empty-text">The reviews showed no clear pattern. Paste more reviews, then analyze again.</p>';
      }
      body += '<p class="research-foot">These gaps feed 03 Positioning. Edit or remove any line before you continue.</p>';
    }

    let notice = '';
    if (lineError) notice += alertHtml('error', lineError, false);
    if (analysis.state === 'stopped') {
      notice += '<p class="help-note" role="status">Stopped. If the AI had already finished, this call may still count.</p>';
    } else if (analysis.state === 'error') {
      const [kind, text, retry] = analysisMessage(analysis.code, analysis.have);
      notice += alertHtml(kind, text, retry ? (analysis.code === 'save_failed' ? 'Save again' : 'Try again') : false);
    }

    let action = '';
    if (analysis.state === 'confirm') {
      action = `<div class="alert alert-warning" role="alert">${ICON.warn(18)}<div>
          <p class="alert-text">You edited some lines. Analyzing again replaces all lines, including your edits.</p>
          <div class="research-confirm">
            <button type="button" class="btn btn-secondary" data-analyze-confirm>Replace lines</button>
            <button type="button" class="btn btn-secondary" data-analyze-cancel>Keep my lines</button>
          </div></div></div>`;
    } else if (l && missing > 0) {
      action = `<p class="field-hint">Add ${plural(missing, 'more book')} with pasted reviews to analyze again.</p>`;
    } else if (missing === 0) {
      action = `<button type="button" class="btn btn-secondary btn-block" data-analyze>${SPARKLE}${l ? 'Analyze again' : 'Analyze reviews'}</button>`;
    }

    box.innerHTML = head + notice + body + action;
    if (lineEdit) fillLineEdit();
  }

  function alertHtml(kind, text, retryLabel) {
    return `<div class="alert alert-${kind}" role="alert">${ICON.warn(18)}<div><p class="alert-text">${esc(text)}</p>${retryLabel ? `<button type="button" class="link-btn" data-analyze-retry>${retryLabel}</button>` : ''}</div></div>`;
  }

  function listBlock(k, label, kind, items) {
    const lines = items.map((x, i) => {
      if (lineEdit && lineEdit.list === k && lineEdit.index === i) {
        return `<li class="insight is-editing">
            <label class="sr-only" for="ie-input">Edit line</label>
            <input class="text-input" id="ie-input" type="text" maxlength="${MAX.line}" autocomplete="off" aria-describedby="ie-error" />
            <span class="field-error" id="ie-error" hidden></span>
            <div class="insight-edit-actions">
              <button type="button" class="btn btn-primary btn-sm" data-line-save>Save</button>
              <button type="button" class="btn btn-secondary btn-sm" data-line-cancel>Cancel</button>
            </div>
          </li>`;
      }
      const from = (x.from || []).map((t) => esc(t)).join(', ');
      const busy = lineBusy || !!lineEdit || analysis.state === 'working' ? ' disabled' : '';
      return `<li class="insight">
          <span class="insight-icon is-${kind}">${ICONS[kind]}</span>
          <div class="insight-body">
            <span class="insight-text">${esc(x.text)}</span>
            <span class="insight-meta"><span class="insight-label">${x.edited ? 'EDITED' : 'AI'}</span>From ${from}</span>
          </div>
          <div class="insight-actions">
            <button type="button" class="icon-btn" data-line-edit="${k}:${i}" aria-label="Edit line: ${esc(x.text)}"${busy}>${EDIT_ICON}</button>
            <button type="button" class="icon-btn" data-line-remove="${k}:${i}" aria-label="Remove line: ${esc(x.text)}"${busy}>${ICON.x(16)}</button>
          </div>
        </li>`;
    }).join('');
    return `<div class="insight-block${k === 'gaps' ? ' is-gaps' : ''}" data-list="${k}">
        <div class="chip-label insight-head" id="il-${k}">${label}</div>
        ${items.length ? `<ul class="insight-list" aria-labelledby="il-${k}">${lines}</ul>` : '<p class="field-hint">Nothing clear in the reviews.</p>'}
      </div>`;
  }

  function fillLineEdit() {
    const input = els.insights.querySelector('#ie-input');
    if (!input) return;
    input.value = lineEdit.text;
    const err = els.insights.querySelector('#ie-error');
    if (lineEdit.error) {
      input.setAttribute('aria-invalid', 'true');
      err.innerHTML = ICON.x();
      err.append(lineEdit.error);
      err.hidden = false;
    }
    els.insights.querySelectorAll('[data-line-save], [data-line-cancel]').forEach((b) => { b.disabled = lineBusy; });
  }

  async function runAnalysis(confirmed) {
    if (analysis.state === 'working' || loadState !== 'ready') return;
    if (!confirmed && hasEditedLines()) {
      analysis = { state: 'confirm' };
      renderInsights();
      const b = els.insights.querySelector('[data-analyze-confirm]');
      if (b) b.focus();
      return;
    }
    const token = ++analysisToken;
    analysis = { state: 'working', books: reviewedCount() };
    lineEdit = null;
    lineError = '';
    pending = null;
    renderInsights();
    const stop = els.insights.querySelector('[data-analyze-stop]');
    if (stop) stop.focus();

    let res;
    try { res = await kdp.generate({ stage: 'review_insights', bookId: book.id }); } catch (err) { res = { error: { code: 'network' } }; }
    if (token !== analysisToken) return;   // stopped: the reply is dropped
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code) {
      analysis = { state: 'error', code, have: res.error.have };
      if (code === 'not_enough_books') refreshData();
      renderInsights();
      focusSide();
      return;
    }
    const got = (res.data && res.data.insights) || {};
    const mark = (list) => (Array.isArray(list) ? list : []).map((x) => ({ text: str(x.text), from: Array.isArray(x.from) ? x.from.map(str) : [], edited: false }));
    pending = { lists: { loves: mark(got.loves), hates: mark(got.hates), gaps: mark(got.gaps) }, analyzedAt: res.data.analyzed_at || new Date().toISOString() };
    await savePending(token);
  }

  async function savePending(token) {
    if (!pending) return;
    let res;
    try { res = await kdp.saveInsights(book.id, pending.lists, pending.analyzedAt); } catch (err) { res = { error: err }; }
    if (token !== analysisToken) return;
    if (res.error) {
      analysis = { state: 'error', code: 'save_failed' };
      renderInsights();
      focusSide();
      return;
    }
    data.insights = res.data;
    pending = null;
    analysis = { state: 'idle' };
    renderInsights();
    announce('Research gaps are ready.');
    focusSide();
  }

  function focusSide() {
    if (!active()) return;
    const h = els.insights.querySelector('#rsGaps');
    if (h) h.focus();
  }

  function stopAnalysis() {
    analysisToken++;
    analysis = { state: 'stopped' };
    renderInsights();
    const b = els.insights.querySelector('[data-analyze]');
    (b || els.insights.querySelector('#rsGaps')).focus();
  }

  /** Save the lines after an edit or a removal. On error the old lines come back. */
  async function saveLines(next, focusSel) {
    const before = data.insights;
    lineBusy = true;
    lineError = '';
    data.insights = { ...before, ...next };
    renderInsights();
    let res;
    try { res = await kdp.saveInsights(book.id, next); } catch (err) { res = { error: err }; }
    lineBusy = false;
    if (res.error) {
      data.insights = before;
      lineError = res.error.code === '23514'
        ? 'This line breaks a rule, so it was not saved. Keep it to 160 characters.'
        : 'We couldn’t save your change. Check your connection, then try again.';
      renderInsights();
      return false;
    }
    data.insights = res.data;
    renderInsights();
    if (active()) {
      const el = focusSel && els.insights.querySelector(focusSel);
      (el && !el.disabled ? el : els.insights.querySelector('#rsGaps')).focus();
    }
    return true;
  }

  function startLineEdit(k, i) {
    const l = lists();
    if (!l || !l[k][i] || lineBusy) return;
    lineEdit = { list: k, index: i, text: l[k][i].text, error: '' };
    lineError = '';
    renderInsights();
    const input = els.insights.querySelector('#ie-input');
    if (input) { input.focus(); input.select(); }
  }

  async function saveLineEdit() {
    if (!lineEdit || lineBusy) return;
    const { list: k, index: i } = lineEdit;
    const text = lineEdit.text.replace(/\s+/g, ' ').trim();
    if (!text) { lineEdit.error = 'Enter some text, or remove the line.'; renderInsights(); els.insights.querySelector('#ie-input').focus(); return; }
    if (text.length > MAX.line) { lineEdit.error = `Use ${MAX.line} characters or fewer.`; renderInsights(); els.insights.querySelector('#ie-input').focus(); return; }
    const l = lists();
    const old = l[k][i];
    const edit = lineEdit;
    lineEdit = null;
    if (text === old.text) { renderInsights(); focusLine(k, i); return; }
    const next = { ...l, [k]: l[k].map((x, j) => (j === i ? { text, from: x.from, edited: true } : x)) };
    const ok = await saveLines(next, `[data-line-edit="${k}:${i}"]`);
    if (!ok) { lineEdit = { ...edit, text }; renderInsights(); }
    else announce('Line saved.');
  }

  function cancelLineEdit() {
    if (!lineEdit || lineBusy) return;
    const { list: k, index: i } = lineEdit;
    lineEdit = null;
    renderInsights();
    focusLine(k, i);
  }

  function focusLine(k, i) {
    const b = els.insights.querySelector(`[data-line-edit="${k}:${i}"]`);
    if (b) b.focus();
  }

  async function removeLine(k, i) {
    const l = lists();
    if (!l || !l[k][i] || lineBusy) return;
    const next = { ...l, [k]: l[k].filter((_, j) => j !== i) };
    // Focus moves to the next line in the list, else the previous one.
    const at = Math.min(i, next[k].length - 1);
    const ok = await saveLines(next, at >= 0 ? `[data-line-edit="${k}:${at}"]` : null);
    if (ok) announce('Line removed.');
  }

  /* ── Events ──────────────────────────────── */

  function bind() {
    // On .research, not root: root is the shared step area and outlives this render.
    const r = els.root;
    r.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      const d = t.dataset;
      if ('reload' in d) load();
      else if ('addComp' in d) openCompetitor(null, 'add');
      else if ('editComp' in d) openCompetitor(data.competitors.find((c) => c.id === d.editComp), 'edit');
      else if ('addSrc' in d) openSource(null, 'add');
      else if ('editSrc' in d) openSource(data.sources.find((s) => s.id === d.editSrc), 'edit');
      else if ('copy' in d) openCopy();
      else if ('formCancel' in d) cancelForm();
      else if ('formDelete' in d) openDelete();
      else if ('kind' in d) setKind(d.kind);
      else if ('analyze' in d) runAnalysis(false);
      else if ('analyzeConfirm' in d) runAnalysis(true);
      else if ('analyzeCancel' in d) { analysis = { state: 'idle' }; renderInsights(); const b = els.insights.querySelector('[data-analyze]'); if (b) b.focus(); }
      else if ('analyzeStop' in d) stopAnalysis();
      else if ('analyzeRetry' in d) {
        if (analysis.code === 'save_failed' && pending) { analysis = { state: 'working', books: reviewedCount(), saving: true }; renderInsights(); savePending(analysisToken); }
        else runAnalysis(false);
      }
      else if ('lineEdit' in d) { const [k, i] = d.lineEdit.split(':'); startLineEdit(k, Number(i)); }
      else if ('lineRemove' in d) { const [k, i] = d.lineRemove.split(':'); removeLine(k, Number(i)); }
      else if ('lineSave' in d) saveLineEdit();
      else if ('lineCancel' in d) cancelLineEdit();
    });
    r.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'ie-input' && lineEdit) { lineEdit.text = el.value; return; }
      if (!form || !el.dataset.f) return;
      const k = el.dataset.f;
      form.values[k] = el.value;
      form.dirty = Object.keys(form.values).some((x) => form.values[x] !== form.saved[x]);
      if (form.errors[k]) { delete form.errors[k]; showFieldError(k, ''); }
      const c = r.querySelector(`[data-counter="${k}"]`);
      if (c) updateCounter(c);
    });
    r.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-form]')) return;
      e.preventDefault();
      submitForm();
    });
    r.addEventListener('keydown', (e) => {
      if (e.target.id === 'ie-input') {
        if (e.key === 'Enter') { e.preventDefault(); saveLineEdit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelLineEdit(); }
      } else if (e.key === 'Escape' && form && e.target.closest('[data-form]')) {
        e.preventDefault();
        cancelForm();
      }
    });
  }

  function setKind(kind) {
    if (!form || form.type !== 'source' || form.busy || form.values.kind === kind) return;
    form.values.kind = kind;
    form.dirty = Object.keys(form.values).some((x) => form.values[x] !== form.saved[x]);
    delete form.errors.citation;
    renderSources();
    const b = els.root.querySelector(`[data-kind="${kind}"]`);
    if (b) b.focus();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[2] = {
    init,
    render,
    isDone,
    blockers: () => 0
  };
})();
