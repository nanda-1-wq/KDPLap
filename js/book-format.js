/* ═══════════════════════════════════════════════════
   NicheInk · Step 08 Format (E13.2)
   /js/book-format.js   (used by app/book.html, loaded before js/book.js;
                         needs js/format-rules.js, js/export-rules.js,
                         js/autosave.js)

   Designs: 41 (08 Format), 43 (Also by and trim dialogs), 51b (rail, 32 px
   rows). Plan: docs/reviews/2026-11-08-e13-2-plan.md.
   Part 2: the settings column with autosave, the Also by and trim dialogs.
   The preview, the engine states and the Ready box come in Part 3, the
   Export files panel and the 08 marks in Part 4.

   Registers kdpBookSteps[8]. js/book.js calls init() once after the book
   loads, render() on each visit (reads format_json and export_json again),
   leave() when another step opens, focusOn('copyright') from 07's
   "How to add one".

   - Settings autosave to book_formats (0027). The row is made on the first
     open (kdp.ensureFormat).
   - Title page and Copyright are always on (design 41). A stored false is
     saved as on (owner Q10): the copyright page carries the disclaimer.
   - Trim lives in the Brief (one source of truth): a change opens the trim
     dialog, then writes book_briefs.trim_size. The yellow box shows only
     when a Print PDF exists (owner Q5).
   - Introduction and Conclusion switches show only when the book has them.
     Notes and references: off, "Comes in v2b" (owner Q3).
   - Also by lists the other books with this pen name and their status from
     Books (owner Q6).
═══════════════════════════════════════════════════ */

(function () {
  const { esc, ICON } = kdpUi;
  const F = () => window.kdpFormatRules;
  const R = () => window.kdpExportRules;
  const STEP = 8;
  // [name, font] on the style cards. Modern shows its body font (owner Q4).
  const STYLE_NAMES = { classic: ['Classic', 'EB Garamond'], modern: ['Modern', 'Source Serif 4'], clean: ['Clean', 'Literata'], warm: ['Warm', 'Lora'] };
  const LABELS = [['chapter', 'Chapter 2'], ['number', '2'], ['none', 'None']];
  const STATUS = { in_progress: 'In progress', completed: 'Completed' };
  const TEXT_DELAY = 700;           // header title and ISBN: save after typing stops

  const svg = (body, size = 16, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const IC = {
    tick: svg('<path d="M5 12l5 5 9-10"/>', 10, 3.5),
    x: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', 18, 2.2)
  };

  let ctx = null, book = null;
  let saver = null;
  let root = null;                  // the step's element while 08 is open
  let load = { state: 'idle' };     // idle | loading | ready | error
  let fmt = null, exp = null;       // format_json, export_json
  let settings = null;              // normalized, local
  let marks = null;                 // { exported_at, page_count, changed } of the last Print PDF, or null
  let marksRead = false;
  let isbnError = '';
  let pendingFocus = null;          // focusOn() before the settings are drawn
  let openToken = 0;                // a newer render() makes older loads stale

  /* ── Values ──────────────────────────────── */

  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const bookTrim = () => (fmt && fmt.book && fmt.book.trim) || (one(book.book_briefs) || {}).trim_size || '6x9';
  const groupA = () => F().isGroupA(bookTrim());
  const candidates = () => (fmt && fmt.candidates) || [];
  const validAlsoBy = () => { const ok = new Set(candidates().map((c) => c.id)); return settings.also_by.filter((id) => ok.has(id)); };
  const hasPdf = () => !!(fmt && fmt.last_pdf);

  function marksFrom(f) {
    return f && f.last_pdf ? { exported_at: f.last_pdf.created_at, page_count: f.last_pdf.page_count, changed: !!f.changed } : null;
  }

  /* ── Data ────────────────────────────────── */

  /** The 08 reason line on any step: is there a Print PDF, and did the book change since? */
  async function readMarks() {
    let res;
    try { res = await kdp.getFormat(book.id); } catch (e) { return; }
    if (res.error) return;   // no mark, no error (as the Books badge)
    marks = marksFrom(res.data);
    marksRead = true;
    ctx.refresh();
  }

  async function loadData() {
    const token = ++openToken;
    load = { state: 'loading' };
    paint();
    let f, x;
    try { [f, x] = await Promise.all([kdp.ensureFormat(book.id), kdp.getExportData(book.id)]); } catch (e) { f = { error: e }; }
    if (token !== openToken) return;
    // A reply without the book (or the chapters) is a load error, never a broken screen.
    if (!f || f.error || !f.data || !f.data.book || !x || x.error || !x.data || !x.data.book) { load = { state: 'error' }; paint(); return; }
    fmt = f.data;
    exp = x.data;
    // Local edits not saved yet win over the read (a failed save keeps them for Retry).
    const local = saver && saver.hasUnsaved() && settings ? settings : null;
    settings = local || F().normalize(fmt.settings);
    marks = marksFrom(fmt);
    marksRead = true;
    load = { state: 'ready' };
    // Title page and Copyright are always on (design 41, owner Q10).
    if (!settings.parts.title || !settings.parts.copyright) {
      settings.parts.title = true;
      settings.parts.copyright = true;
      saver.edit('parts', 0);
    }
    paint();
    ctx.refresh();
    applyFocus();
  }

  /* ── Saving ──────────────────────────────── */

  function readField(f) {
    if (f === 'header_title') {
      const t = (settings.header_title || '').trim();
      if ([...t].length > F().HEADER_TITLE_MAX) return { error: `use ${F().HEADER_TITLE_MAX} characters or fewer for the header title.` };
      return t || null;
    }
    if (f === 'parts') return { ...settings.parts };
    if (f === 'also_by') return settings.also_by.slice();
    return settings[f];
  }

  function onSaved() {
    readMarks();   // "changed since your last PDF" comes from the database (format_key)
  }

  /* ── Rendering ───────────────────────────── */

  const sel = (q) => root && root.querySelector(q);

  function paint() {
    if (!root) return;
    if (load.state === 'loading' || load.state === 'idle') {
      root.innerHTML = '<div class="fmt-loading" role="status"><span class="spinner" aria-hidden="true"></span>Loading 08 Format…</div>';
      return;
    }
    if (load.state === 'error') {
      root.innerHTML = `
        <div class="center-state"><div class="state-box" role="alert">
          <div class="state-icon danger" aria-hidden="true">${IC.x}</div>
          <h2>We couldn't load 08 Format</h2>
          <p>Check your connection, then try again.</p>
          <div class="state-actions"><button type="button" class="btn btn-primary" data-fmt-retry-load>Retry</button></div>
        </div></div>`;
      return;
    }
    root.innerHTML = `
      <div class="fmt">
        <section class="fmt-settings" aria-label="Format settings">${settingsHtml()}</section>
        <section class="fmt-preview" aria-label="Preview">
          <div class="fmt-bar">
            <div class="fmt-seg" role="group" aria-label="Preview mode">
              <button type="button" class="fmt-seg-btn" aria-pressed="true" data-fmt-mode="print">Print</button>
              <button type="button" class="fmt-seg-btn" aria-pressed="false" data-fmt-mode="kindle">Kindle</button>
            </div>
          </div>
          <div class="fmt-stage" data-fmt-stage>
            <p class="fmt-stage-note">The page preview comes in the next build step.</p>
          </div>
        </section>
      </div>`;
  }

  function settingsHtml() {
    const st = settings;
    const styleCard = (key) => {
      const [name, font] = STYLE_NAMES[key];
      const on = st.style === key;
      return `<label class="fmt-style${on ? ' is-on' : ''}">
        <input type="radio" name="fmtStyle" value="${key}"${on ? ' checked' : ''} data-fmt-style />
        <span class="fmt-style-tick" aria-hidden="true">${IC.tick}</span>
        <img src="format/style-${key}.png" alt="" width="48" height="32" />
        <span class="fmt-style-name">${name}</span><span class="fmt-style-font">${font}</span></label>`;
    };
    const check = (attr, label, on, { disabled = false, cls = '', after = '' } = {}) => `
      <label class="fmt-row fmt-check${cls ? ` ${cls}` : ''}${disabled ? ' is-off' : ''}"><span>${label}</span>
        <input type="checkbox" ${attr}${on ? ' checked' : ''}${disabled ? ' disabled' : ''} /></label>${after}`;
    const avail = R().available(exp);
    const bioBlank = R().isBlank(exp.book && exp.book.bio);
    const trim = bookTrim();
    const trims = F().TRIMS.includes(trim) ? F().TRIMS : [...F().TRIMS, trim];
    const n = validAlsoBy().length;
    const parts = F().PART_ROWS.map((p) => {
      if (p.key === 'copyright') {
        return `<div class="fmt-row" id="fmtCopyright" tabindex="-1" data-fmt-copyright><span>Copyright</span><span class="fmt-quiet">Always on</span></div>
          <div class="fmt-isbn">
            <div class="fmt-isbn-line">
              <label class="fmt-isbn-label" for="fmtIsbn">ISBN</label>
              <input id="fmtIsbn" class="fmt-input" type="text" inputmode="numeric" autocomplete="off" placeholder="Optional"
                value="${esc(st.isbn || '')}" aria-describedby="fmtIsbnNote fmtIsbnErr" aria-invalid="${isbnError ? 'true' : 'false'}" data-fmt-isbn />
            </div>
            <span class="fmt-hint" id="fmtIsbnNote">Add it when KDP gives it, then export again.</span>
            <span class="field-error" id="fmtIsbnErr" data-fmt-isbn-err${isbnError ? '' : ' hidden'}>${ICON.warn(13)}<span>${esc(isbnError)}</span></span>
          </div>`;
      }
      if (p.always) return `<div class="fmt-row"><span>${p.name}</span><span class="fmt-quiet">Always on</span></div>`;
      if (p.key === 'contents') {
        return check('data-fmt-part="contents"', 'Contents', st.parts.contents)
          + check('data-fmt-flag="contents_sections"', 'Show sections too', st.contents_sections, { disabled: !st.parts.contents, cls: 'is-sub' })
          + '<span class="fmt-row fmt-note is-sub">Kindle: always on (KDP needs it)</span>';
      }
      if (p.key === 'front') return `<div class="fmt-row is-later"><span>${p.name}</span><span class="fmt-later">${p.later}</span></div>`;
      if (p.key === 'notes') {
        return `<div class="fmt-row is-later"><span>${p.name}</span><span class="fmt-later-wrap"><span class="fmt-later">${p.later}</span>
          <input type="checkbox" disabled aria-label="Notes and references, at the back. Comes in v2b" /></span></div>`;
      }
      if (p.needs && !avail[p.needs]) return '';
      if (p.key === 'about') {
        return check('data-fmt-part="about"', 'About the author', st.parts.about,
          { after: st.parts.about && bioBlank ? '<p class="fmt-hint fmt-hint-row">Your pen name has no bio yet, so this page is left out.</p>' : '' });
      }
      if (p.key === 'also_by') {
        if (!candidates().length) return '<div class="fmt-row"><span>Also by</span><span class="fmt-quiet">No other books with this pen name</span></div>';
        return `<div class="fmt-row"><span>Also by</span><button type="button" class="fmt-link" data-fmt-alsoby aria-haspopup="dialog">Choose books (${n})</button></div>`;
      }
      return check(`data-fmt-part="${p.key}"`, p.name, st.parts[p.key]);
    }).join('');

    return `
      <fieldset class="fmt-group">
        <legend class="chip-label fmt-legend">TEXT STYLE</legend>
        <div class="fmt-styles">${F().STYLES.map(styleCard).join('')}</div>
        <p class="fmt-hint">Changing style can change the page count.</p>
        <div class="fmt-pair">
          <label class="fmt-field">Chapter label
            <select class="fmt-select" data-fmt-select="chapter_label">${LABELS.map(([v, t]) => `<option value="${v}"${st.chapter_label === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          ${check('data-fmt-flag="drop_cap"', 'Drop cap · print', st.drop_cap, { cls: 'is-end' })}
        </div>
      </fieldset>
      <fieldset class="fmt-group fmt-parts">
        <legend class="chip-label fmt-legend">BOOK PARTS · FIXED ORDER</legend>
        ${parts}
      </fieldset>
      <fieldset class="fmt-group">
        <legend class="chip-label fmt-legend">PAGE · PRINT</legend>
        <div class="fmt-page-row">
          <div class="fmt-pair">
            <label class="fmt-field">Trim size
              <select class="fmt-select" data-fmt-trim>${trims.map((t) => `<option value="${t}"${t === trim ? ' selected' : ''}>${F().trimText(t)}</option>`).join('')}</select></label>
            <label class="fmt-field">Paper
              <select class="fmt-select" data-fmt-select="paper"><option value="white"${st.paper === 'white' ? ' selected' : ''}>White</option><option value="cream"${st.paper === 'cream' ? ' selected' : ''}>Cream</option></select></label>
          </div>
          <div class="fmt-trim-pic" role="img" aria-label="Trim drawing, ${esc(F().trimText(trim).replace(' × ', ' by ').replace(' in', ' inches'))}" style="--trim-ratio: ${trimRatio(trim)}">${esc(trim.replace('x', '×'))}</div>
        </div>
        ${groupA() ? '' : `<p class="field-error fmt-trim-off" role="note">${ICON.warn(13)}<span>Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8 or 5 × 8 in. Pick one of these.</span></p>`}
        <label class="fmt-field">Header title, left pages
          <input class="fmt-input" type="text" maxlength="200" value="${esc(st.header_title || '')}" placeholder="${esc((fmt.book.title || '').trim() || 'Book title')}"
            aria-describedby="fmtHeaderHint" data-fmt-header${st.running_header ? '' : ' disabled'} />
          <span class="fmt-hint" id="fmtHeaderHint">Long titles are cut with "…".</span></label>
        ${check('data-fmt-flag="running_header"', 'Running header', st.running_header)}
        ${check('data-fmt-flag="recto_start"', 'Chapters start on a right-hand page', st.recto_start)}
        <p class="fmt-hint fmt-margin" data-fmt-margin>${esc(F().marginNote(0))}</p>
      </fieldset>`;
  }

  /** The small trim drawing keeps the page's shape: width ÷ height. */
  function trimRatio(trim) {
    const [w, h] = String(trim).split('x').map(Number);
    return w && h ? (w / h).toFixed(4) : '0.6667';
  }

  /** Re-render the settings column (keeps focus on the same control). */
  function rerenderSettings(focusSel) {
    const col = sel('.fmt-settings');
    if (!col) return;
    col.innerHTML = settingsHtml();
    const f = focusSel && col.querySelector(focusSel);
    if (f) f.focus();
  }

  /* ── Events ──────────────────────────────── */

  /** A setting changed on screen: save it. Part 3 rebuilds the preview here. */
  function edit(field, delay = 0) {
    saver.edit(field, delay);
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-fmt-style]')) {
      settings.style = t.value;
      root.querySelectorAll('.fmt-style').forEach((c) => c.classList.toggle('is-on', c.querySelector('input').checked));
      edit('style');
      return;
    }
    if (t.matches('[data-fmt-part]')) {
      const k = t.dataset.fmtPart;
      settings.parts[k] = t.checked;
      if (k === 'contents') { const s = sel('[data-fmt-flag="contents_sections"]'); if (s) { s.disabled = !t.checked; s.closest('.fmt-row').classList.toggle('is-off', !t.checked); } }
      edit('parts');
      if (k === 'about') rerenderSettings('[data-fmt-part="about"]');
      return;
    }
    if (t.matches('[data-fmt-flag]')) {
      const f = t.dataset.fmtFlag;
      settings[f] = t.checked;
      if (f === 'running_header') sel('[data-fmt-header]').disabled = !t.checked;
      edit(f);
      return;
    }
    if (t.matches('[data-fmt-select]')) {
      settings[t.dataset.fmtSelect] = t.value;
      edit(t.dataset.fmtSelect);
      return;
    }
    if (t.matches('[data-fmt-trim]')) {
      const to = t.value;
      t.value = bookTrim();      // nothing changes until the dialog says so
      if (to !== bookTrim()) openTrimDialog(to, t);
      return;
    }
    if (t.matches('[data-fmt-isbn]')) isbnInput(t, true);
  }

  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-fmt-header]')) {
      settings.header_title = t.value;
      edit('header_title', TEXT_DELAY);
      return;
    }
    if (t.matches('[data-fmt-isbn]')) isbnInput(t, false);
  }

  /** ISBN: blank = none; 13 digits with hyphens or spaces = saved as digits; else an error. */
  function isbnInput(t, done) {
    const raw = t.value.trim();
    const clean = F().isbnClean(raw);
    const digits = raw.replace(/[\s-]/g, '');
    let err = '';
    if (raw && !clean && (done || digits.length >= 13)) err = 'Use a 13-digit ISBN that starts with 978 or 979. Hyphens and spaces are fine.';
    isbnError = err;
    const box = sel('[data-fmt-isbn-err]');
    box.hidden = !err;
    box.querySelector('span').textContent = err;
    t.setAttribute('aria-invalid', err ? 'true' : 'false');
    if (raw && !clean) return;              // keep the last good value until it is valid
    const value = raw ? clean : null;
    if (value === settings.isbn) {
      if (done && saver.isDirty('isbn')) saver.edit('isbn', 0);   // leaving the field saves now
      return;
    }
    settings.isbn = value;
    edit('isbn', done ? 0 : TEXT_DELAY);
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-fmt-retry-load]')) { loadData(); return; }
    if (t.closest('[data-fmt-alsoby]')) { openAlsoBy(t.closest('[data-fmt-alsoby]')); return; }
    const mode = t.closest('[data-fmt-mode]');
    if (mode) setMode(mode.dataset.fmtMode);
  }

  /** Print or Kindle (design 41b). Kindle preview comes with the EPUB (owner Q1): a quiet state. */
  function setMode(m) {
    root.querySelectorAll('[data-fmt-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmtMode === m)));
    const stage = sel('[data-fmt-stage]');
    stage.innerHTML = m === 'kindle'
      ? '<div class="fmt-state" role="status"><strong>Kindle preview comes with the EPUB.</strong><span>The Kindle file reflows: no page numbers and no running header.</span></div>'
      : '<p class="fmt-stage-note">The page preview comes in the next build step.</p>';
  }

  /** 07 "How to add one": the Copyright row, once the settings are drawn. */
  function applyFocus() {
    if (!pendingFocus || load.state !== 'ready') return;
    const what = pendingFocus;
    pendingFocus = null;
    if (what === 'copyright') {
      const row = sel('[data-fmt-copyright]');
      if (row) { row.scrollIntoView({ block: 'center' }); row.focus({ preventScroll: true }); }
    }
  }

  /* ── Dialogs (design 43) ─────────────────── */

  let dlg = null;
  function dialog(html, { alert = false, opener } = {}) {
    if (dlg) dlg.remove();
    const el = document.createElement('dialog');
    dlg = el;
    el.className = 'dialog dialog-sm fmt-dialog';
    if (alert) el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-labelledby', 'fmtDlgTitle');
    el.innerHTML = `<div class="dialog-inner">${html}</div>`;
    document.body.append(el);
    // Each dialog removes only itself: a late close event never takes a newer dialog with it.
    el.addEventListener('close', () => {
      el.remove();
      if (dlg !== el) return;
      dlg = null;
      if (opener && opener.isConnected) opener.focus();
    });
    el.showModal();
    return el;
  }

  async function openAlsoBy(opener) {
    const pen = (fmt.book.pen_name || '').trim();
    const ticked = new Set(validAlsoBy());
    const row = (c, status) => `
      <label class="fmt-pick"><input type="checkbox" value="${esc(c.id)}"${ticked.has(c.id) ? ' checked' : ''} />
        <span class="fmt-pick-text"><span class="fmt-pick-title">${esc((c.title || '').trim() || 'Untitled book')}</span><span class="fmt-quiet" data-fmt-status="${esc(c.id)}">${esc(status)}</span></span></label>`;
    const d = dialog(`
      <div class="dialog-head"><h2 id="fmtDlgTitle">Also by ${esc(pen)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      <p class="fmt-dlg-text">Tick only books that are live on Amazon. Completed in NicheInk does not mean published.</p>
      <fieldset class="fmt-picks"><legend class="sr-only">Books with this pen name</legend>${candidates().map((c) => row(c, '')).join('')}</fieldset>
      <p class="fmt-hint">None ticked: the Also by page is left out.</p>
      <div class="dialog-foot"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="button" class="btn btn-primary" data-save>Save</button></div>`, { opener });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { d.close(); return; }
      if (!e.target.closest('[data-save]')) return;
      const ids = [...d.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
      // Keep the print order of books already ticked; new ones go at the end, in list order.
      const order = [...settings.also_by.filter((id) => ids.includes(id)), ...ids.filter((id) => !settings.also_by.includes(id))];
      settings.also_by = order.slice(0, F().ALSO_BY_MAX);
      settings.parts.also_by = settings.also_by.length > 0;
      saver.edit('also_by', 0);
      edit('parts');
      d.close();
      rerenderSettings('[data-fmt-alsoby]');
    });
    // The status line from Books (owner Q6). A failed read leaves it empty.
    let res;
    try { res = await kdp.listBookStatus(candidates().map((c) => c.id)); } catch (e) { return; }
    if (res.error || !d.isConnected) return;
    for (const b of res.data) {
      const el = d.querySelector(`[data-fmt-status="${CSS.escape(b.id)}"]`);
      if (el) el.textContent = STATUS[b.status] || '';
    }
  }

  function openTrimDialog(to, opener) {
    const from = bookTrim();
    // The cover warning only when a Print PDF exists (owner Q5).
    const warn = hasPdf()
      ? `<div class="alert alert-warning">${ICON.warn(18)}<p class="alert-text"><strong>Your cover will be Out of date.</strong> The page count and spine change. Export the Print PDF and the cover again.</p></div>`
      : '';
    const d = dialog(`
      <h2 id="fmtDlgTitle" class="fmt-dlg-title">Change trim to ${esc(F().trimText(to))}?</h2>
      ${warn}
      <p class="fmt-dlg-text">Your text does not change. The Brief updates too, so every step uses one trim size.</p>
      <p class="field-error" data-err hidden></p>
      <div class="dialog-foot"><button type="button" class="btn btn-secondary" data-close>Keep ${esc(F().trimText(from))}</button><button type="button" class="btn btn-primary" data-change>Change trim</button></div>`, { alert: true, opener });
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) { d.close(); return; }
      const btn = e.target.closest('[data-change]');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
      let res;
      try { res = await kdp.updateBrief(book.id, { trim_size: to }); } catch (err) { res = { error: err }; }
      if (res.error) {
        btn.disabled = false;
        btn.textContent = 'Change trim';
        const er = d.querySelector('[data-err]');
        er.hidden = false;
        er.innerHTML = `${ICON.warn(13)}<span>We couldn't change the trim. Check your connection, then try again.</span>`;
        return;
      }
      setTrim(to, res.data && res.data.updated_at);
      d.close();
    });
  }

  /** Trim lives in the Brief: one value for every step. */
  function setTrim(t, updatedAt) {
    const br = one(book.book_briefs);
    if (br) { br.trim_size = t; if (updatedAt) br.updated_at = updatedAt; }
    if (fmt) fmt.book.trim = t;
    if (exp && exp.book) exp.book.trim = t;
    const brief = window.kdpBookSteps && window.kdpBookSteps[1];
    if (brief && brief.trimChanged) brief.trimChanged(t);
    rerenderSettings('[data-fmt-trim]');
    readMarks();
  }

  /* ── Step API for js/book.js ─────────────── */

  function render(el) {
    root = document.createElement('div');
    root.className = 'fmt-root';
    el.innerHTML = '';
    el.append(root);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);
    loadData();
  }

  /** Leaving 08: edits keep saving. */
  function leave() {
    openToken++;
    root = null;
    pendingFocus = null;
    if (dlg) dlg.close();
    return saver ? saver.flush() : Promise.resolve();
  }

  const isDone = () => !!marks && !marks.changed;

  function missingText() {
    if (!marksRead) return '';
    if (!marks) return 'Export the Print PDF';
    if (marks.changed) return 'Changed since your last PDF. Export it again';
    return '';
  }

  function init(b, c) {
    ctx = c;
    book = b;
    saver = kdpAutosave.create({
      read: readField,
      save: (fields) => kdp.saveFormat(book.id, fields),
      onSaved,
      render: (state, message, canRetry) => ctx.renderSave(state, message, canRetry, STEP)
    });
    readMarks();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[STEP] = {
    init,
    render,
    leave,
    isDone,
    missing: missingText,
    blockers: () => 0,
    focusOn(what) { pendingFocus = what; applyFocus(); },
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle'),
    /** Tests: the open settings. */
    _debug: () => ({ settings, fmt, marks })
  };
})();
