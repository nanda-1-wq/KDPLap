/* ═══════════════════════════════════════════════════
   NicheInk · 08 Export files panel (E13.2 Part 4; first built in the
   parked E13.1 Part 3, reviewed here)
   /js/format-export.js   (used by js/book-format.js through the header's
                           "Export files" button on step 08)

   Design 42: one row per file.
   - Print PDF: read the book again, build it, check the PDF (page size =
     the trim on every page and no other page boxes, every font embedded,
     page count even and the same in the engine and the file). A failed
     check: no download, an error with the check's name and Try again.
     Then record the row (0027: the guard refuses a stale key) and
     download {title-slug}-print-{trim}.pdf. A failed record still
     downloads, with a note (as E11). A stale book downloads nothing.
     A page count that differs from the last PDF: "Page count changed.
     Your cover must be made again." (owner Q7, Nov 3).
     Changed since the last PDF (0027 format_key): the row in the warning
     look with a filled "Export again" (design 42).
   - EPUB: "Comes next" (E13.3, owner Q1).
   - Word (.docx): the E11 Export dialog.
   One file at a time. The footer leaves out "The Print PDF opens 09 Cover"
   until E15 (plan F8).

   kdpFormatExport.open({ bookId, opener, engine, flush, hasUnsaved, trim,
                          pause, resume, onExported(row) })
═══════════════════════════════════════════════════ */

(function () {
  const { esc, ICON } = kdpUi;
  const F = () => window.kdpFormatRules;
  const R = () => window.kdpExportRules;
  const svg = (body, size = 16, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const IC = {
    ok: svg('<path d="M5 12l5 5 9-10"/>', 12, 3),
    x: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', 18, 2.2)
  };
  const STEPS = { read: [10, 'Reading the book…'], build: [40, 'Building pages…'], check: [80, 'Checking fonts and page size…'], save: [95, 'Saving the export…'] };
  const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let d = null;
  let st = null;   // { opts, data: { fmt, exp } | null, run, result, error }

  function build() {
    d = document.createElement('dialog');
    d.className = 'dialog fmt-exp';
    d.setAttribute('aria-labelledby', 'fmtExpTitle');
    d.innerHTML = `<div class="dialog-inner">
      <div class="dialog-head"><div><h2 id="fmtExpTitle">Export files</h2><p data-sub></p></div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button></div>
      <div class="fmt-exp-rows" data-rows></div>
      <p class="fmt-hint">Its page count sets the spine of your cover. Each PDF is checked before it downloads: page size, fonts and even count.</p>
    </div>`;
    document.body.append(d);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', onClosed);
    d.addEventListener('click', onClick);
  }

  const $ = (q) => d.querySelector(q);

  function sub() {
    const f = st.data && st.data.fmt;
    if (!f) return '';
    const t = (f.book.title || '').trim() || 'Untitled book';
    const pages = st.result ? st.result.pages : (f.last_pdf && !f.changed ? f.last_pdf.page_count : 0);
    const paper = (f.settings && f.settings.paper) === 'cream' ? 'cream paper' : 'white paper';
    return [t, pages ? `${pages} pages` : '', F().trimText(f.book.trim || '6x9'), paper].filter(Boolean).join(' · ');
  }

  /** Why Print PDF cannot be made now, or ''. */
  function blocked() {
    const { fmt, exp } = st.data;
    if (!F().isGroupA(fmt.book.trim)) return `Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8 or 5 × 8 in. This book is ${F().trimText(fmt.book.trim)}. Change it under Trim size.`;
    const model = F().modelOf(exp, F().normalize(fmt.settings));
    if (model.empty) return 'Nothing to format yet. Mark sections Final in 06 Write.';
    return '';
  }

  function pdfRow() {
    if (!st.data && !st.run) {
      return st.loadError
        ? `<div class="fmt-exp-row is-error" role="alert"><span class="fmt-exp-x">${IC.x}</span><span class="fmt-exp-text"><strong>We couldn't read the book</strong><span>Check your connection, then try again.</span></span>
            <button type="button" class="btn btn-primary" data-load>Try again</button></div>`
        : `<div class="fmt-exp-row" role="status"><span class="fmt-exp-text"><strong>Print PDF</strong><span class="fmt-quiet"><span class="spinner" aria-hidden="true"></span>Reading the book…</span></span></div>`;
    }
    const f = st.data && st.data.fmt;
    if (st.run) {
      const [pct, text] = STEPS[st.run.phase];
      return `<div class="fmt-exp-row" role="status" aria-live="polite"><span class="fmt-exp-text"><strong>Print PDF</strong><span>${text}</span>
          <span class="fmt-progress is-wide" role="progressbar" aria-label="Print PDF progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width: ${pct}%"></span></span></span>
          <button type="button" class="btn btn-secondary" data-cancel>Cancel</button></div>`;
    }
    if (st.error) {
      return `<div class="fmt-exp-row is-error" role="alert"><span class="fmt-exp-x">${IC.x}</span><span class="fmt-exp-text"><strong>${esc(st.error.title)}</strong><span>${esc(st.error.text)}</span></span>
          <button type="button" class="btn btn-primary" data-pdf>Try again</button></div>`;
    }
    const why = blocked();
    const last = f.last_pdf;
    const head = '<strong>Print PDF</strong><span class="fmt-quiet">Paperback interior · fonts embedded · even page count</span>';
    if (why) return `<div class="fmt-exp-row"><span class="fmt-exp-text">${head}<span class="fmt-exp-why">${ICON.warn(13)}<span>${esc(why)}</span></span></span><button type="button" class="btn btn-secondary" disabled>Export</button></div>`;
    if (last && f.changed && !st.result) {
      return `<div class="fmt-exp-row is-changed"><span class="fmt-exp-text">${head}<span class="fmt-exp-why">${ICON.warn(13)}<span>Changed since export. Last PDF ${esc(day(last.created_at))} · ${last.page_count} pages.</span></span></span>
        <button type="button" class="btn btn-primary" data-pdf>Export again</button></div>`;
    }
    if (last || st.result) {
      const at = st.result ? st.result.at : last.created_at;
      const pages = st.result ? st.result.pages : last.page_count;
      return `<div class="fmt-exp-row"><span class="fmt-exp-text">${head}<span class="fmt-pill-ok">${IC.ok}Exported ${esc(day(at || new Date().toISOString()))} · ${pages} pages</span></span>
        <button type="button" class="btn btn-secondary" data-pdf>Export again</button></div>`;
    }
    return `<div class="fmt-exp-row"><span class="fmt-exp-text">${head}</span><button type="button" class="btn btn-primary" data-pdf>Export</button></div>`;
  }

  function notes() {
    const r = st.result;
    if (!r) return '';
    let html = '';
    if (r.prevPages && r.prevPages !== r.pages) {
      html += `<div class="alert alert-warning" role="status">${ICON.warn(16)}<div><p class="alert-text"><strong>Page count changed. Your cover must be made again.</strong></p>
        <p class="alert-text">${r.prevPages} pages before, ${r.pages} now. The spine is now ${F().spine(r.pages, r.paper).toFixed(3)} in.</p></div></div>`;
    }
    if (r.recordError) {
      html += `<div class="alert alert-warning" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn't record this export, so the 08 mark and the Books badge may be missing. Your file downloaded.</p>
        <button type="button" class="link-btn" data-record>Try again</button></div></div>`;
    }
    return html;
  }

  function render() {
    $('[data-sub]').textContent = sub();
    const busy = !!st.run;
    $('[data-rows]').innerHTML = `${pdfRow()}${notes()}
      <div class="fmt-exp-row"><span class="fmt-exp-text"><strong>EPUB</strong><span class="fmt-quiet">Kindle ebook · clickable contents</span></span><span class="version-tag">Comes next</span></div>
      <div class="fmt-exp-row"><span class="fmt-exp-text"><strong>Word (.docx)</strong><span class="fmt-quiet">For editing in other tools</span></span>
        <button type="button" class="btn btn-secondary" data-docx${busy ? ' disabled' : ''}>Export</button></div>
      ${busy ? '<p class="fmt-hint">One file at a time. Other rows wait.</p>' : ''}`;
  }

  async function load() {
    st.data = null;
    st.loadError = false;
    render();
    let f, x;
    try { [f, x] = await Promise.all([kdp.getFormat(st.opts.bookId), kdp.getExportData(st.opts.bookId)]); } catch (e) { f = { error: e }; }
    if (!st) return null;
    if (f.error || !f.data || !f.data.settings || !x || x.error || !x.data) { st.loadError = true; render(); return null; }
    st.data = { fmt: f.data, exp: x.data };
    render();
    return st.data;
  }

  const fail = (title, text) => { st.run = null; st.error = { title, text }; render(); const b = d.querySelector('[data-pdf]'); if (b) b.focus(); };

  async function exportPdf() {
    const o = st.opts;
    const run = { phase: 'read' };
    st.run = run;
    st.error = null;
    st.result = null;
    render();
    const live = () => st && st.run === run;
    // Typed settings go first: the PDF and its record use the saved row.
    await o.flush();
    if (!live()) return;
    if (o.hasUnsaved()) { fail('Your settings are not saved yet', 'Check your connection, then try again. Nothing was downloaded.'); return; }
    const data = await load().then((x) => x, () => null);
    if (!live()) return;
    st.run = run;
    if (!data) { fail('Print PDF could not be built', 'We couldn\'t read the book. Check your connection, then try again.'); return; }
    const why = blocked();
    if (why) { fail('Print PDF could not be built', why); return; }
    const { fmt, exp } = data;
    const settings = F().normalize(fmt.settings);
    const model = F().modelOf(exp, settings);
    const byId = new Map((fmt.candidates || []).map((c) => [c.id, c]));
    const extras = {
      year: new Date(fmt.now || Date.now()).getFullYear(),
      trim: fmt.book.trim,
      alsoBy: settings.parts.also_by ? (fmt.also_by_valid || []).map((id) => byId.get(id)).filter(Boolean).map((c) => ({ title: c.title || '', subtitle: c.subtitle || null })) : []
    };
    run.phase = 'build';
    render();
    let r;
    await o.pause();
    try {
      r = await o.engine().build({ bookId: o.bookId, style: settings.style, model, settings, extras, onMainThread: async () => render() });
    } catch (e) {
      o.resume();
      if (!live()) return;
      const dl = e && e.kind === 'download';
      fail('Print PDF could not be built', dl ? 'The page engine did not load. We tried twice, from two servers. Check your connection. Nothing was downloaded.'
        : 'The page engine stopped. Your settings are saved. Nothing was downloaded.');
      return;
    }
    o.resume();
    if (!live()) return;
    run.phase = 'check';
    render();
    let list;
    try {
      const info = await kdpPdfCheck.read(r.pdf, { inflate: kdpPdfCheck.inflate });
      list = kdpPdfCheck.checks(info, { trim: fmt.book.trim, pages: r.pages });
    } catch (e) { list = [{ key: 'read', name: 'Reading the PDF', pass: false }]; }
    if (!live()) return;
    const bad = list.find((c) => !c.pass);
    if (bad) { fail(`The PDF failed a check: ${bad.name}`, 'Nothing was downloaded. Try again. If it fails again, change the text style and export.'); return; }
    run.phase = 'save';
    render();
    const rec = {
      bookId: o.bookId, versionIds: R().versionIds(model), pageCount: r.pages, settingsKey: fmt.key,
      engine: kdpFormatFiles.ENGINE_ID, parts: { title: true, copyright: true, contents: settings.parts.contents, intro: settings.parts.intro, conclusion: settings.parts.conclusion, about: settings.parts.about }
    };
    let res;
    try { res = await kdp.recordPdfExport(rec); } catch (e) { res = { error: e }; }
    if (!live()) return;
    const code = res.error && String(res.error.message || '');
    if (code === 'export_stale' || code === 'export_pdf_versions') {
      fail('Your book changed while the PDF was made', 'Make it again. Nothing was downloaded.');
      return;
    }
    download(r.pdf, F().fileName(fmt.book.title, fmt.book.trim));
    st.run = null;
    st.result = {
      pages: r.pages, prevPages: fmt.last_pdf ? fmt.last_pdf.page_count : 0, paper: settings.paper,
      at: res.data ? res.data.created_at : null, recordError: !!res.error, rec
    };
    if (!res.error) {
      fmt.last_pdf = { created_at: res.data.created_at, page_count: r.pages };
      fmt.changed = false;
      o.onExported({ created_at: res.data.created_at, page_count: r.pages });
    }
    render();
    const focus = d.querySelector('[data-record]') || d.querySelector('[data-pdf]');
    if (focus) focus.focus();
  }

  async function recordAgain() {
    const r = st.result;
    let res;
    try { res = await kdp.recordPdfExport(r.rec); } catch (e) { res = { error: e }; }
    if (!st) return;
    if (!res.error) {
      r.recordError = false;
      r.at = res.data.created_at;
      st.opts.onExported({ created_at: res.data.created_at, page_count: r.pages });
    }
    render();
  }

  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-close]')) { close(); return; }
    if (t.closest('[data-pdf]')) { exportPdf(); return; }
    if (t.closest('[data-load]')) { load(); return; }
    if (t.closest('[data-cancel]')) { st.run = null; st.error = null; render(); const b = d.querySelector('[data-pdf]'); if (b) b.focus(); return; }
    if (t.closest('[data-record]')) { recordAgain(); return; }
    if (t.closest('[data-docx]')) {
      const { bookId, opener } = st.opts;
      close();
      window.kdpExport.open(bookId, { opener });
    }
  }

  function close() {
    if (!d || !d.open) return;
    if (st) st.run = null;
    d.close();
  }

  function onClosed() {
    const s = st;
    st = null;
    if (s && s.opts.opener && s.opts.opener.isConnected) s.opts.opener.focus();
  }

  function open(opts) {
    if (!d) build();
    if (d.open) return;
    st = { opts, data: null, run: null, result: null, error: null, loadError: false };
    d.showModal();
    load();
  }

  window.kdpFormatExport = { open };
})();
