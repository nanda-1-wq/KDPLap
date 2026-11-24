/* ═══════════════════════════════════════════════════
   NicheInk · Step 08 Format (E13.2)
   /js/book-format.js   (used by app/book.html, loaded before js/book.js;
                         needs js/format-rules.js, js/export-rules.js,
                         js/autosave.js, js/qc-glyphs.js and js/format/*)

   Designs: 41 (08 Format), 41b (Kindle), 41c (engine and section states),
   43 (Also by and trim dialogs), 51b (rail, 32 px rows).
   Plan: docs/reviews/2026-11-08-e13-2-plan.md.
   Part 2: the settings column with autosave, the Also by and trim dialogs.
   Part 3: the print preview (the real PDF, js/format/preview.js), the page
   and spine chips, the margin note with the KDP minimum for the page count,
   the engine states (first visit with progress, error with Try again), the
   section states (nothing Final, a trim outside group A), the Ready box.
   D2 (owner, Nov 9; plan F13): the settings column is 360 px; the spread
   fills the preview box; "Full screen" shows the spread over the whole
   window (a modal dialog: Previous / Next, arrow keys, Esc and Close, focus
   kept inside and given back). The stage element itself moves into the
   dialog and back, so there is still one PDF and one preview.
   The trim drawing keeps the page's shape; its label is under it, never inside.
   Part 4: the Export files panel (design 42, js/format-export.js) and the
   08 mark from 0027 pdf_marks (design 50), the same read as the Books card.
   - The engine downloads when 08 opens and only when there is something to
     print (a Final section, a group A trim). leave() ends it, so its memory
     goes back.
   - A change rebuilds the preview after 600 ms (1,500 ms when the book builds
     on the main thread). The old pages stay, dimmed, with "Updating preview".
   - Missing characters use the 07 table (js/qc-glyphs.js), so 07 and 08 agree.
   - The Ready box never blocks. It ends with the 07 line from the 07 mark.

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
   E13.3 Part 3 (designs 41d, 41e; plan docs/reviews/2026-11-23-e13-3-plan.md §3):
   Kindle mode shows the EPUB that kdpEpub.build() makes, in a sandboxed
   frame (js/format/kindle-preview.js): the chips, A A A, Full screen, the
   device, "Screen x of y", the caption, and the states building, error,
   nothing Final. Any trim works (an ebook has no trim). A change rebuilds
   after 300 ms; the reader stays on the same part. The Kindle Ready box:
   not Final, needs review, no pen name, links to other ebook stores (Q8).
   The ISBN row is "Print only" (Q2). The 08 done mark stays Print PDF (Q4).
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
  const SLOW_LOAD_MS = 400;         // show the first-visit progress only when loading takes longer
  const MB = (b) => (b / 1e6).toFixed(1);
  const FILES = () => window.kdpFormatFiles;

  const svg = (body, size = 16, stroke = 2) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const IC = {
    tick: svg('<path d="M5 12l5 5 9-10"/>', 10, 3.5),
    check: svg('<path d="M5 12l5 5 9-10"/>', 18, 2.4),
    prev: svg('<path d="M15 6l-6 6 6 6"/>'),
    next: svg('<path d="M9 6l6 6-6 6"/>'),
    full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>', 16),
    x: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', 18, 2.2),
    xBig: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>', 28, 2.2),
    doc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>', 28, 1.8)
  };

  /* E13.3: the Kindle preview (41d, 41e). */
  const KINDLE_DELAY = 300;         // a setting change rebuilds the Kindle preview after this
  const SIZE_NAMES = [['s', 'Small text'], ['m', 'Medium text'], ['l', 'Large text']];
  // Links KDP may remove (Hyperlink Guidelines; Q8: a warning only). Short and fixed; subdomains count.
  const STORE_HOSTS = ['kobo.com', 'barnesandnoble.com', 'books.apple.com', 'smashwords.com', 'scribd.com'];

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
  let mode = 'print';               // the preview switch: print | kindle
  let model = null, modelKey = '';  // the Final-only export model
  let missing = null, missingFor = '';
  let engine = null, engineLoad = null;
  let eng = { state: 'idle', loaded: 0, total: 0, slow: false };   // idle | loading | ready | error
  let pv = null;                    // js/format/preview.js
  let build = { state: 'idle', pages: 0, info: null, error: null }; // idle | waiting | building | ready | error
  let buildTimer = null, building = false, again = false, buildSeq = 0;
  let paused = false;               // the export panel builds: no preview build meanwhile
  let stageEl = null;               // the preview's stage (it moves into the full screen view and back)
  let full = null;                  // the full screen dialog while open: { dlg, opener }
  let idle = [];                    // resolved when the running preview build ends (the export waits for it)
  let kp = null;                    // the Kindle preview (js/format/kindle-preview.js) once Kindle mode has drawn
  let kDev = null;                  // its device (it moves into the full screen view and back)
  let kb = { state: 'idle', key: '', shown: false, error: null, ms: null };   // idle | waiting | building | ready | error
  let kTimer = null, kSeq = 0;
  let kSize = 'm';                  // A A A
  let kRetry = false;               // Try again was pressed: the focus follows the result

  /* ── Values ──────────────────────────────── */

  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const bookTrim = () => (fmt && fmt.book && fmt.book.trim) || (one(book.book_briefs) || {}).trim_size || '6x9';
  const groupA = () => F().isGroupA(bookTrim());
  const candidates = () => (fmt && fmt.candidates) || [];
  const validAlsoBy = () => { const ok = new Set(candidates().map((c) => c.id)); return settings.also_by.filter((id) => ok.has(id)); };
  const hasPdf = () => !!(fmt && fmt.last_pdf);
  const droppedAlsoBy = () => (settings.parts.also_by ? settings.also_by.length - validAlsoBy().length : 0);
  const hasFinal = () => !!model && model.sections.length > 0;
  const canPreview = () => load.state === 'ready' && hasFinal() && groupA();
  const sectionHref = (id) => `book.html?id=${encodeURIComponent(book.id)}&step=6${id ? `&section=${encodeURIComponent(id)}` : ''}`;

  /** What the PDF prints besides the model (md2typst extras). */
  function extrasFor(st) {
    const byId = new Map(candidates().map((c) => [c.id, c]));
    return {
      year: new Date((fmt && fmt.now) || Date.now()).getFullYear(),
      trim: bookTrim(),
      alsoBy: st.parts.also_by ? validAlsoBy().map((id) => byId.get(id)).filter(Boolean).map((c) => ({ title: c.title || '', subtitle: c.subtitle || null })) : []
    };
  }

  /** The export model: Final sections only. Built again only when a part that changes it changes. */
  function ensureModel() {
    const key = `${settings.parts.intro}|${settings.parts.conclusion}|${settings.parts.about}`;
    if (model && key === modelKey) return;
    model = F().modelOf(exp, settings);
    modelKey = key;
    missingFor = '';
  }

  /**
   * Characters the style's fonts lack, with where they are. The 07 table
   * (js/qc-glyphs.js) stands in for the fonts: no download, and 07 and 08
   * always agree (tools/qc-glyphs.mjs --check proves the table = the fonts).
   */
  function checkChars() {
    const ex = extrasFor(settings);
    const head = settings.running_header ? (settings.header_title || '') : '';
    const key = `${settings.style}|${modelKey}|${JSON.stringify(ex.alsoBy)}|${head}|${settings.parts.about}`;
    if (missingFor === key) return;
    const G = window.kdpQcGlyphs;
    const style = settings.style;
    const face = { name: G.FONT[style] || style, cmap: { has: (cp) => G.has(style, cp) } };
    const b = model.book || {};
    const collected = kdpFontCmap.collect(model, {
      about: settings.parts.about, copyright: R().copyright(b.pen_name, ex.year),
      alsoBy: ex.alsoBy, headerTitle: head || null
    });
    missing = kdpFontCmap.missing(collected, { body: [face], head: [] });
    missingFor = key;
  }

  function marksFrom(f) {
    return f && f.last_pdf ? { exported_at: f.last_pdf.created_at, page_count: f.last_pdf.page_count, changed: !!f.changed } : null;
  }

  /* ── Data ────────────────────────────────── */

  /** The 08 reason line on any step: is there a Print PDF, and did the book change since? */
  /** The 08 mark (design 50): the last Print PDF and "changed" from 0027 pdf_marks, as the Books card. */
  async function readMarks() {
    let res;
    try { res = await kdp.listPdfMarks(book.id); } catch (e) { return; }
    if (res.error) return;   // no mark, no error (as the Books badge)
    const row = (res.data || [])[0];
    marks = row ? { exported_at: row.exported_at, page_count: row.page_count, changed: !!row.changed } : null;
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
    model = null;
    ensureModel();
    checkChars();
    paint();
    ctx.refresh();
    applyFocus();
    if (canPreview()) startEngine();
  }

  /* ── Engine and preview ──────────────────── */

  function startEngine() {
    if (!engine) {
      engine = kdpFormatEngine.create({
        onProgress: ({ loaded, total }) => {
          eng.loaded = loaded;
          eng.total = Math.max(total, eng.total);
          if (eng.slow) paintPreview();
        }
      });
    }
    if (eng.state === 'ready') { scheduleBuild(true); return; }
    if (engineLoad) return;
    eng = { state: 'loading', loaded: 0, total: 0, slow: false };
    const slowTimer = setTimeout(() => { if (eng.state === 'loading') { eng.slow = true; paintPreview(); } }, SLOW_LOAD_MS);
    paintPreview();
    const myEngine = engine;
    engineLoad = engine.load(settings.style, book.id).then(() => {
      if (engine !== myEngine) return;
      eng = { ...eng, state: 'ready' };
      scheduleBuild(true);
    }, (e) => {
      if (engine !== myEngine) return;
      eng = { ...eng, state: 'error', error: e };
      paintPreview();
    }).finally(() => { clearTimeout(slowTimer); engineLoad = null; });
  }

  function stopEngine() {
    clearTimeout(buildTimer);
    buildTimer = null;
    buildSeq++;
    closeFull(false);
    if (pv) { pv.destroy(); pv = null; }
    if (engine) { engine.terminate(); engine = null; }
    engineLoad = null;
    eng = { state: 'idle', loaded: 0, total: 0, slow: false };
    build = { state: 'idle', pages: 0, info: null, error: null };
    building = false;
    again = false;
    paused = false;
    idle.forEach((f) => f());
    idle = [];
  }

  /** A change: dim the pages and build again after the delay (600 ms, or 1,500 on the main thread). */
  function scheduleBuild(now) {
    if (!canPreview() || eng.state !== 'ready') return;
    clearTimeout(buildTimer);
    if (build.state !== 'building') build.state = build.pages ? 'waiting' : 'building';
    paintUpdating();
    buildTimer = setTimeout(runBuild, now ? 0 : engine.previewDelay(book.id));
  }

  async function runBuild() {
    buildTimer = null;
    if (building || paused) { again = true; return; }
    if (!canPreview() || !engine) return;
    building = true;
    const seq = ++buildSeq;
    const st = JSON.parse(JSON.stringify(settings));
    ensureModel();
    build.state = 'building';
    paintUpdating();
    let r = null, err = null;
    try {
      r = await engine.build({ bookId: book.id, style: st.style, model, settings: st, extras: extrasFor(st), onMainThread: async () => paintUpdating() });
      if (seq === buildSeq && root) {
        // The stage is shown (and sized) before the first pages are drawn.
        if (!build.pages) { build.pages = r.pages; build.info = F().pageInfo(r.meta); paintPreview(); }
        if (!pv) pv = kdpFormatPreview.create(stageEl, { onChange: paintNav });
        await pv.show(r.pdf, { trim: bookTrim() });
      }
    } catch (e) { err = e; }
    building = false;
    idle.forEach((f) => f());
    idle = [];
    if (seq !== buildSeq) return;
    if (err) build = { ...build, state: 'error', error: err };
    else build = { state: 'ready', pages: r.pages, info: F().pageInfo(r.meta), path: r.path, ms: r.ms, error: null };
    paintPreview();
    if (again) { again = false; scheduleBuild(true); }
  }

  /* ── Kindle preview (E13.3, 41d, 41e) ────── */

  /** What changes the EPUB: the model (Final sections, parts), the style, contents, label, Also by. Never print-only settings. */
  const kindleKey = () => JSON.stringify([modelKey, settings.style, settings.parts, settings.contents_sections, settings.chapter_label, extrasFor(settings).alsoBy]);

  /** Build again: now (first open, Try again) or 300 ms after a change. A change that does not touch the EPUB does nothing. */
  function scheduleKindle(now) {
    if (mode !== 'kindle' || !root || load.state !== 'ready' || !model) return;
    if (!hasFinal()) { clearTimeout(kTimer); kTimer = null; paintPreview(); return; }
    if (!now && kb.state !== 'error' && kindleKey() === kb.key) return;
    clearTimeout(kTimer);
    kb.state = 'waiting';
    paintKindle();
    kTimer = setTimeout(runKindle, now ? 0 : KINDLE_DELAY);
  }

  /** Kindle mode opens: build when nothing is shown yet or the book changed since. */
  function ensureKindle() {
    if (kb.state === 'error' || kTimer) return;
    if (!kp || !kb.shown || kb.key !== kindleKey()) scheduleKindle(true);
  }

  async function runKindle() {
    kTimer = null;
    if (mode !== 'kindle' || !root || !model || !hasFinal()) return;
    const seq = ++kSeq;
    ensureModel();
    const st = JSON.parse(JSON.stringify(settings));
    const key = kindleKey();
    kb.state = 'building';
    const t0 = performance.now();
    let built, r;
    try {
      built = kdpEpub.build(model, st, { ...extrasFor(st), bookId: book.id, now: fmt.now });
      const tBuilt = performance.now();
      if (!kp) kp = kdpKindlePreview.create(kDev.querySelector('[data-kp-host]'), { onChange: paintKindleNav, onEscape: () => { if (full && full.kind === 'kindle') closeFull(true); } });
      kp.size(kSize);
      r = await kp.show(built, st.style);
      if (seq !== kSeq || !root || (r && r.superseded)) return;
      kb = { state: 'ready', key, shown: true, error: null, ms: { build: tBuilt - t0, first: performance.now() - t0 } };
    } catch (e) {
      if (seq !== kSeq || !root) return;
      kindleError(e);
      return;
    }
    paintPreview();
    // Try again worked: its button is gone, so the focus goes to the book's screen (arrow keys page at once).
    if (kRetry) { kRetry = false; const f = root.querySelector('.kp-frame:not(.is-next)'); if (f) f.focus(); }
  }

  /** 41e B: the error box with Try again. The focus moves to it only when it was in the preview column. */
  function kindleError(e) {
    const a = document.activeElement;
    const here = kRetry || !!(a && a.closest && a.closest('.fmt-preview, .kp-full'));
    kRetry = false;
    if (full && full.kind === 'kindle') closeFull(false);
    kb = { ...kb, state: 'error', error: e, key: '' };
    paintPreview();
    const btn = here && sel('[data-kp-retry]');
    if (btn) btn.focus();
  }

  /** A link to another ebook store (Q8): the host from the short list, or null. */
  function storeHost(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    const h = u.hostname.toLowerCase().replace(/\.$/, '');
    if (h === 'play.google.com') return u.pathname.startsWith('/store/books') ? 'play.google.com' : null;
    return STORE_HOSTS.find((s) => h === s || h.endsWith(`.${s}`)) || null;
  }

  /** Sections whose EPUB text links to another ebook store: [{ id, where, host }], in book order (one per section). */
  const storeCache = new WeakMap();
  function storeLinks() {
    if (storeCache.has(model)) return storeCache.get(model);
    const out = [];
    for (const c of model.chapters) {
      const where = c.kind === 'intro' ? 'The Introduction' : c.kind === 'conclusion' ? 'The Conclusion' : `Chapter ${c.fileNumber || c.number}`;
      for (const s of c.sections) {
        // The links the EPUB really carries (kdpEpub's own reading of the text).
        const htmls = kdpEpub.blockList(kdpExportBuild.mdBody(s.content)).map((b) => b.html).join('');
        for (const m of htmls.matchAll(/href="([^"]+)"/g)) {
          const host = storeHost(m[1].replace(/&amp;/g, '&'));
          if (host) { out.push({ id: s.id, where, host }); break; }
        }
      }
    }
    storeCache.set(model, out);
    return out;
  }

  /** The Kindle Ready box lines (41e E), only the true ones, in this order: not Final, needs review, no pen name, store links. */
  function kindleWarnings() {
    const w = [];
    const nf = [...model.notFinal, ...model.noText.filter((s) => s.status !== 'final')];
    if (nf.length) {
      w.push({ text: `${nf.length === 1 ? '1 section is' : `${nf.length} sections are`} not Final. The EPUB leaves ${nf.length === 1 ? 'it' : 'them'} out.`,
        link: { href: sectionHref(nf[0].id), text: nf.length === 1 ? 'Show it' : 'Show them' } });
    }
    const secs = model.needsReview.filter((x) => !x.chapter).length;
    const chs = model.needsReview.length - secs;
    if (secs + chs) {
      const what = [secs ? (secs === 1 ? '1 section' : `${secs} sections`) : '', chs ? (chs === 1 ? '1 chapter' : `${chs} chapters`) : ''].filter(Boolean).join(' and ');
      w.push({ text: `${what} ${secs + chs === 1 ? 'needs' : 'need'} review in 07 Quality Control.`, link: { go: 7, text: 'See results' } });
    }
    if (!String((model.book && model.book.pen_name) || '').trim()) {
      w.push({ text: 'No pen name. The EPUB will have no author, and KDP needs it to match your title setup.', link: { go: 1, text: 'Add a pen name' } });
    }
    const sl = storeLinks();
    if (sl.length) {
      const f = sl[0];
      const text = sl.length === 1
        ? `${f.where} links to another ebook store (${f.host}). KDP may remove links like this.`
        : `${sl.length} sections link to other ebook stores (${[...new Set(sl.map((x) => x.host))].join(', ')}), first in ${f.where}. KDP may remove links like this.`;
      w.push({ text, link: { href: sectionHref(f.id), text: 'Go to the section' } });
    }
    return w;
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
          <div class="fmt-view">
            <div class="fmt-bar">
              <div class="fmt-bar-start">
                <div class="fmt-seg" role="group" aria-label="Preview mode">
                  <button type="button" class="fmt-seg-btn" aria-pressed="${mode === 'print'}" data-fmt-mode="print">Print</button>
                  <button type="button" class="fmt-seg-btn" aria-pressed="${mode === 'kindle'}" data-fmt-mode="kindle">Kindle</button>
                </div>
                <div class="fmt-chips" data-kp-chips hidden><span class="kp-chip"><strong>EPUB 3</strong> · clickable contents</span><span class="kp-chip">No page numbers</span></div>
              </div>
              <div class="fmt-bar-end">
                <button type="button" class="fmt-tocheck" data-fmt-tocheck aria-controls="fmtReady" hidden></button>
                <div class="fmt-chips" data-fmt-chips></div>
                ${sizesHtml(true)}
                <button type="button" class="btn btn-secondary fmt-full-btn" data-fmt-full aria-haspopup="dialog" disabled>${IC.full}Full screen</button>
              </div>
            </div>
            <div class="kp-wrap" data-kp-wrap hidden>
              <div class="kp-dev" data-kp-dev>
                <div class="kp-scr">
                  <div class="kp-text"><div class="kp-host" data-kp-host></div>
                    <div class="kp-skel" data-kp-skel aria-hidden="true" hidden><span class="is-head"></span><span class="is-title"></span>
                      <span></span><span></span><span class="is-short"></span><span></span><span></span><span class="is-half"></span><span class="is-gap"></span><span></span><span></span><span class="is-short"></span></div></div>
                  <p class="kp-loc">Location, not page number</p>
                </div>
              </div>
              <div class="kp-msg" data-kp-msg hidden></div>
              <div class="kp-nav" data-kp-nav hidden>
                <button type="button" class="kp-nav-btn" data-kp-prev aria-label="Previous screen">${IC.prev}</button>
                <span class="kp-nav-label" data-kp-label aria-live="polite"></span>
                <button type="button" class="kp-nav-btn" data-kp-next aria-label="Next screen">${IC.next}</button>
              </div>
              <p class="kp-status" data-kp-status role="status" hidden><span class="spinner" aria-hidden="true"></span>Building the Kindle preview…</p>
              <p class="kp-cap" data-kp-cap hidden>Text reflows. The number of screens changes with the text size. This is NicheInk's preview of your EPUB, not Kindle's own screen: KDP's Previewer is the final check.</p>
            </div>
            <div class="fmt-wrap" data-fmt-wrap>
              <div class="fmt-stage" data-fmt-stage></div>
              <div class="fmt-nav" data-fmt-nav hidden>
                <button type="button" class="fmt-nav-btn" data-fmt-prev aria-label="Previous pages">${IC.prev}</button>
                <span class="fmt-nav-label" data-fmt-label aria-live="polite"></span>
                <button type="button" class="fmt-nav-btn" data-fmt-next aria-label="Next pages">${IC.next}</button>
              </div>
              <div class="fmt-state" data-fmt-state hidden></div>
              <span class="fmt-updating" data-fmt-updating role="status" hidden>Updating preview</span>
            </div>
          </div>
          <div class="fmt-ready" id="fmtReady" tabindex="-1" data-fmt-ready></div>
        </section>
      </div>`;
    closeFull(false);
    if (pv) { pv.destroy(); pv = null; }
    dropKindle();
    stageEl = root.querySelector('[data-fmt-stage]');
    kDev = root.querySelector('[data-kp-dev]');
    paintPreview();
    // A repaint (Retry, a new open) shows the last PDF again once the engine builds.
    if (build.pages && eng.state === 'ready') { build = { state: 'idle', pages: 0, info: null, error: null }; scheduleBuild(true); }
    if (mode === 'kindle') scheduleKindle(true);
  }

  /** The Kindle preview ends (a repaint, leaving 08): a new open builds it again. */
  function dropKindle() {
    clearTimeout(kTimer);
    kTimer = null;
    kSeq++;
    if (kp) { kp.destroy(); kp = null; }
    kb = { state: 'idle', key: '', shown: false, error: null, ms: kb.ms };
  }

  /** A A A (41d). In the bar (hidden in Print mode) and in the full screen view. */
  function sizesHtml(inBar) {
    return `<div class="kp-sizes" role="group" aria-label="Text size" data-kp-sizes${inBar ? ' hidden' : ''}>${SIZE_NAMES.map(([k, n]) =>
      `<button type="button" class="kp-size is-${k}" data-kp-size="${k}" aria-label="${n}" aria-pressed="${kSize === k}">A</button>`).join('')}</div>`;
  }

  /** The page and spine chips, the margin note with the KDP minimum for the page count, the cream note. */
  function paintChips() {
    const m = sel('[data-fmt-margin]');
    if (m) m.textContent = F().marginNote(canPreview() ? build.pages : 0, bookTrim(), settings.paper);
    const pn = sel('[data-fmt-paper-note]');
    if (pn) pn.hidden = !paperNote(bookTrim(), settings.paper);
    const el = sel('[data-fmt-chips]');
    if (!el) return;
    if (!build.pages || !canPreview() || mode !== 'print') { el.innerHTML = ''; return; }
    const i = build.info;
    el.innerHTML = `<span class="fmt-chip"><strong>${i.pages} pages</strong>${i.blanks ? ` · made even (${i.content} + ${i.blanks} blank)` : ''}</span>
      <span class="fmt-chip">${esc(F().spineText(i.pages, settings.paper))}</span>`;
  }

  function paintUpdating() {
    const u = sel('[data-fmt-updating]');
    const wrap = sel('[data-fmt-wrap]');
    if (!u || !wrap) return;
    const on = mode === 'print' && build.pages > 0 && (build.state === 'waiting' || build.state === 'building');
    u.hidden = !on;
    wrap.classList.toggle('is-updating', on);
  }

  function paintNav(s) {
    if (!pv) return;
    const st = s || pv.state();
    // The page buttons below the box, and the same ones in the full screen view.
    const scopes = [root, full && full.dlg].filter(Boolean);
    for (const el of scopes) {
      const label = el.querySelector('[data-fmt-label]');
      if (!label) continue;
      label.textContent = pv.label();
      el.querySelector('[data-fmt-prev]').disabled = st.spread <= 0;
      el.querySelector('[data-fmt-next]').disabled = st.spread >= st.spreads - 1;
    }
  }

  /** The preview area (designs 41, 41b, 41c): a state, or the pages. */
  function paintPreview() {
    const box = sel('[data-fmt-state]');
    const stage = stageEl;
    if (!box || !stage) return;
    const kindle = mode === 'kindle';
    sel('[data-fmt-wrap]').hidden = kindle;
    sel('[data-kp-wrap]').hidden = !kindle;
    sel('.fmt-view').classList.toggle('is-kindle', kindle);
    sel('[data-kp-chips]').hidden = true;
    sel('[data-kp-sizes]').hidden = !kindle;
    if (kindle) {
      if (full && full.kind === 'print') closeFull(true);
      paintKindle();
      paintChips();
      paintReady();
      return;
    }
    let html = '';
    let kind = '';                  // '' | 'quiet' | 'danger'
    let role = 'status';
    if (!hasFinal()) {
      kind = 'quiet';
      html = `<strong class="fmt-state-title">Nothing to format yet</strong>
        <span>Only Final sections go into the book. Mark sections Final in 06 Write.</span>
        <a class="btn btn-secondary" href="${sectionHref(null)}" data-fmt-go="6">Go to 06 Write</a>`;
    } else if (!groupA()) {
      kind = 'quiet';
      html = `<strong class="fmt-state-title">No Print PDF for ${esc(F().trimText(bookTrim()))}</strong>
        <span>The Print PDF works with ${esc(F().trimsText('and'))}. Pick one of these under Trim size. Your text does not change.</span>`;
    } else if (eng.state === 'error') {
      kind = 'danger';
      role = 'alert';
      html = `<strong class="fmt-state-title">${IC.x}The page engine did not load</strong>
        <span>We tried twice, from two servers. Check your connection. Your settings are saved.</span>
        <button type="button" class="btn btn-primary" data-fmt-retry-engine>Try again</button>`;
    } else if (eng.state === 'loading' || eng.state === 'idle') {
      kind = 'quiet';
      if (eng.slow) {
        const wire = FILES().WIRE.engine + (FILES().WIRE[settings.style] || 0);
        const pct = eng.total ? Math.min(100, Math.round((eng.loaded / eng.total) * 100)) : 0;
        html = `<strong class="fmt-state-title">Preparing the page engine</strong>
          <span>First time only. About ${Math.round(wire / 1e6)} MB. Next time it opens at once.</span>
          <span class="fmt-progress" role="progressbar" aria-label="Engine download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width: ${pct}%"></span></span>
          <span class="fmt-quiet">${MB((wire * pct) / 100)} of ${MB(wire)} MB</span>`;
      } else {
        html = '<span class="fmt-wait"><span class="spinner" aria-hidden="true"></span>Getting the preview ready…</span>';
      }
    } else if (build.state === 'error' && !build.pages) {
      kind = 'danger';
      role = 'alert';
      html = `<strong class="fmt-state-title">${IC.x}The preview could not be made</strong>
        <span>Your settings are saved. Try again. If it happens again, try another text style.</span>
        <button type="button" class="btn btn-primary" data-fmt-retry-build>Try again</button>`;
    } else if (!build.pages) {
      html = '<span class="fmt-wait"><span class="spinner" aria-hidden="true"></span>Making the pages…</span>';
    }
    const showPages = !html;
    box.hidden = showPages;
    box.className = `fmt-state${kind ? ` is-${kind}` : ''}`;
    box.setAttribute('role', role);
    if (!showPages) box.innerHTML = html;
    stage.hidden = !showPages;
    sel('[data-fmt-nav]').hidden = !showPages || !pv;
    const fullBtn = sel('[data-fmt-full]');
    if (fullBtn) fullBtn.disabled = !(showPages && pv && build.pages);
    if (!showPages && full) closeFull(true);
    if (showPages && pv) paintNav();
    paintUpdating();
    paintChips();
    paintReady();
  }

  /** Kindle mode (41d, 41e A to D): the device, or the error or nothing-Final box; the pager, the status line, the caption. */
  function paintKindle() {
    const kw = sel('[data-kp-wrap]');
    if (!kw || !kDev) return;
    const msg = sel('[data-kp-msg]');
    const nothing = !hasFinal();
    const err = !nothing && kb.state === 'error';
    const showDev = !nothing && !err;
    const busy = showDev && kb.state !== 'ready';
    const kind = nothing ? 'nothing' : err ? 'error' : '';
    // Drawn again only when the kind changes, so a repaint never takes the focus from Try again.
    if (msg.dataset.kind === kind) { /* unchanged */ } else if (nothing) {
      // 41e C: the built Print words, with "Kindle preview" (G6: the built button, "Go to 06 Write").
      msg.className = 'kp-msg';
      msg.setAttribute('role', 'status');
      msg.innerHTML = `<span class="kp-msg-icon">${IC.doc}</span>
        <strong class="kp-msg-title">Nothing to format yet</strong>
        <span>Only Final sections go into the Kindle preview. Mark sections Final in 06 Write.</span>
        <a class="btn btn-secondary" href="${sectionHref(null)}" data-fmt-go="6">Go to 06 Write</a>`;
    } else if (err) {
      msg.className = 'kp-msg is-danger';
      msg.setAttribute('role', 'alert');
      msg.innerHTML = `<span class="kp-msg-icon">${IC.xBig}</span>
        <strong class="kp-msg-title">The Kindle preview could not be built</strong>
        <span>Nothing in your book changed. Try again. If it keeps failing, your Print PDF is not affected.</span>
        <button type="button" class="btn btn-primary" data-kp-retry>Try again</button>`;
    } else {
      msg.innerHTML = '';
    }
    msg.dataset.kind = kind;
    msg.hidden = showDev;
    kDev.hidden = !showDev;
    if (!showDev && full && full.kind === 'kindle') closeFull(true);
    kDev.querySelector('[data-kp-skel]').hidden = !(busy && !kb.shown);   // inside the device (it may be in Full screen)
    kw.classList.toggle('is-updating', busy && kb.shown);
    sel('[data-kp-status]').hidden = !busy;
    sel('[data-kp-nav]').hidden = !showDev || busy;
    sel('[data-kp-cap]').hidden = !showDev;
    sel('[data-kp-chips]').hidden = !showDev;
    const fullBtn = sel('[data-fmt-full]');
    if (fullBtn) fullBtn.disabled = !(showDev && kb.shown && kp);
    paintKindleNav();
  }

  /** "Screen x of y", the page buttons and A A A, below the box and in the full screen view. */
  function paintKindleNav() {
    if (!root) return;
    const busy = kb.state !== 'ready';
    const st = kp ? kp.state() : { screen: 0, screens: 0 };
    const off = busy || !hasFinal() || kb.state === 'error';
    for (const el of [root, full && full.kind === 'kindle' && full.dlg].filter(Boolean)) {
      const label = el.querySelector('[data-kp-label]');
      if (label) label.textContent = kp ? kp.label() : '';
      const prev = el.querySelector('[data-kp-prev]'), next = el.querySelector('[data-kp-next]');
      if (prev) prev.disabled = off || st.screen <= 0;
      if (next) next.disabled = off || st.screen >= st.screens - 1;
      el.querySelectorAll('[data-kp-size]').forEach((b) => { b.disabled = off; b.setAttribute('aria-pressed', String(b.dataset.kpSize === kSize)); });
    }
  }

  /** The 07 line under the Ready box (design 41), from the 07 mark. */
  function qcLine() {
    const m = ctx.qcMark();
    const link = (text) => `<a href="?id=${encodeURIComponent(book.id)}&step=7" data-fmt-go="7">${text}</a>`;
    if (!m) return `07 Quality Control has not run yet. ${link('Run it')}`;
    if (!m.current) return `07 Quality Control is out of date. ${link('Run it again')}`;
    const day = new Date(m.checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `07 Quality Control ran on ${esc(day)} and is current. ${link('See results')}`;
  }

  /** The Ready box (designs 41, 41c). Never blocks. */
  /** The pointer chip in the preview bar (owner, Nov 10): the Ready box is below the screen (D3), so warnings or a
   *  failed rebuild show a chip there that scrolls to the box and moves the focus to it. None when the box is green. */
  function paintToCheck(text) {
    const chip = sel('[data-fmt-tocheck]');
    if (!chip) return;
    chip.hidden = !text;
    chip.innerHTML = text ? `${ICON.warn(16)}<span>${esc(text)}</span>${IC.down}` : '';
  }

  function paintReady() {
    const el = sel('[data-fmt-ready]');
    if (!el || !model) return;
    paintToCheck('');
    if (mode === 'kindle') { paintKindleReady(el); return; }
    if (!hasFinal() || !groupA()) { el.innerHTML = ''; return; }   // no Print PDF: the preview area says why
    const rebuildError = build.state === 'error' && build.pages
      ? `<div class="alert alert-error fmt-alert" role="alert">${IC.x}<div><p class="alert-text">The preview could not be updated. It shows your last good pages.</p>
          <button type="button" class="link-btn" data-fmt-retry-build>Try again</button></div></div>` : '';
    const r = F().ready({ model, missing, pages: build.pages, dropped: droppedAlsoBy(), trim: bookTrim(), paper: settings.paper });
    const things = r.warnings.length + (rebuildError ? 1 : 0);
    if (things) paintToCheck(r.warnings.length ? `${things === 1 ? '1 thing' : `${things} things`} to check` : 'Preview not updated');
    if (r.warnings.length) {
      const first = r.warnings.find((w) => w.sectionId);
      const link = first ? `<a href="${sectionHref(first.sectionId)}" class="fmt-ready-link">Show in 06 Write</a>` : '';
      el.innerHTML = `${rebuildError}
        <div class="alert alert-warning fmt-alert" role="status">${ICON.warn(18)}
          <div class="fmt-alert-body"><strong>${r.warnings.length === 1 ? '1 thing' : `${r.warnings.length} things`} to check</strong>
          ${r.warnings.map((w) => `<span>${esc(w.text)}</span>`).join('')}${link}</div></div>
        <p class="fmt-note">You can still export.</p>
        <p class="fmt-note fmt-qc-line">${qcLine()}</p>`;
      return;
    }
    if (!build.pages) {
      el.innerHTML = `${rebuildError}<p class="fmt-note"><span class="spinner" aria-hidden="true"></span>Checking the book…</p>`;
      return;
    }
    el.innerHTML = `${rebuildError}
      <div class="alert fmt-alert fmt-alert-ok" role="status">${IC.check}
        <div class="fmt-alert-body"><span><strong>Ready to export.</strong> All ${r.finals} section${r.finals === 1 ? '' : 's'} Final. No characters missing from the font.</span>
        <span class="fmt-qc-line">${qcLine()}</span></div></div>`;
  }

  /** The Kindle Ready box (41d green, 41e E warnings). Never blocks; no font check (the reader picks the font); no trim line. */
  function paintKindleReady(el) {
    if (!hasFinal()) { el.innerHTML = ''; return; }   // 41e C: the preview area says why
    const ws = kindleWarnings();
    const link = (l) => (l.go
      ? `<a href="?id=${encodeURIComponent(book.id)}&step=${l.go}" data-fmt-go="${l.go}" class="fmt-ready-link">${esc(l.text)}</a>`
      : `<a href="${l.href}" class="fmt-ready-link">${esc(l.text)}</a>`);
    if (ws.length) {
      el.innerHTML = `<div class="alert alert-warning fmt-alert" role="status">${ICON.warn(18)}
        <div class="fmt-alert-body"><strong>Check before you export the EPUB.</strong>
          <ul class="kp-warn-list">${ws.map((w) => `<li>${esc(w.text)} ${link(w.link)}</li>`).join('')}</ul>
          <span class="kp-warn-foot">The reader picks the font, so there is no font check.</span></div></div>`;
      return;
    }
    const n = model.sections.length;
    el.innerHTML = `<div class="alert fmt-alert fmt-alert-ok" role="status">${IC.check}
      <div class="fmt-alert-body"><span><strong>Ready for Kindle.</strong> All ${n} section${n === 1 ? '' : 's'} Final. The reader picks the font, so there is no font check.</span>
      <span class="fmt-qc-line">${qcLine()}</span></div></div>`;
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
                value="${esc(st.isbn || '')}" aria-describedby="fmtIsbnTag fmtIsbnNote fmtIsbnErr" aria-invalid="${isbnError ? 'true' : 'false'}" data-fmt-isbn />
              <span class="fmt-tag" id="fmtIsbnTag">Print only</span>
            </div>
            <span class="fmt-hint" id="fmtIsbnNote">Add it when KDP gives it, then export again. The EPUB never carries it: an eBook needs no ISBN.</span>
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
              <select class="fmt-select" data-fmt-select="paper" aria-describedby="fmtPaperNote"><option value="white"${st.paper === 'white' ? ' selected' : ''}>White</option><option value="cream"${st.paper === 'cream' ? ' selected' : ''}>Cream</option></select></label>
          </div>
          <div class="fmt-trim-pic" role="img" aria-label="Trim drawing, ${esc(F().trimText(trim).replace(' × ', ' by ').replace(' in', ' inches'))}">
            <span class="fmt-trim-page" style="--trim-ratio: ${trimRatio(trim)}" aria-hidden="true"></span>
            <span class="fmt-trim-label" aria-hidden="true">${esc(trim.replace('x', '×'))}</span>
          </div>
        </div>
        <p class="fmt-hint fmt-paper-note" id="fmtPaperNote" data-fmt-paper-note${paperNote(trim, st.paper) ? '' : ' hidden'}>KDP's Expanded Distribution needs white paper at this size.</p>
        ${groupA() ? '' : `<p class="field-error fmt-trim-off" role="note">${ICON.warn(13)}<span>Print PDF needs ${esc(F().trimsText('or'))}. Pick one of these.</span></p>`}
        <label class="fmt-field">Header title, left pages
          <input class="fmt-input" type="text" maxlength="200" value="${esc(st.header_title || '')}" placeholder="${esc((fmt.book.title || '').trim() || 'Book title')}"
            aria-describedby="fmtHeaderHint" data-fmt-header${st.running_header ? '' : ' disabled'} />
          <span class="fmt-hint" id="fmtHeaderHint">Long titles are cut with "…".</span></label>
        ${check('data-fmt-flag="running_header"', 'Running header', st.running_header)}
        ${check('data-fmt-flag="recto_start"', 'Chapters start on a right-hand page', st.recto_start)}
        <p class="fmt-hint fmt-margin" data-fmt-margin>${esc(F().marginNote(0, trim, st.paper))}</p>
      </fieldset>`;
  }

  /** E13.2b (T9): on a large trim, KDP's Expanded Distribution takes white paper only (KDP help GQTT4W3T5AYK7L45). */
  const paperNote = (trim, paper) => F().isLarge(trim) && paper === 'cream';

  /** The small trim drawing keeps the page's shape: width ÷ height. Its label sits under it (D2 bug 4). */
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

  /** A setting changed on screen: save it, build the preview again, check the characters again. */
  function edit(field, delay = 0, { rebuild = true } = {}) {
    saver.edit(field, delay);
    if (!model) return;
    ensureModel();
    checkChars();
    if (rebuild) scheduleBuild(false);
    scheduleKindle(false);
    paintReady();
    paintChips();
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
      const f = t.dataset.fmtSelect;
      settings[f] = t.value;
      edit(f, 0, { rebuild: f !== 'paper' });   // paper is not in the interior PDF (0027): only the spine changes
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
    if (t.closest('[data-fmt-retry-engine]')) { eng.state = 'idle'; startEngine(); return; }
    if (t.closest('[data-fmt-tocheck]')) {
      const box = sel('[data-fmt-ready]');
      box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      box.focus({ preventScroll: true });
      return;
    }
    if (t.closest('[data-fmt-retry-build]')) { build.state = build.pages ? 'waiting' : 'building'; scheduleBuild(true); paintPreview(); return; }
    if (t.closest('[data-fmt-prev]')) { if (pv) pv.go(-1); return; }
    if (t.closest('[data-fmt-next]')) { if (pv) pv.go(1); return; }
    if (t.closest('[data-kp-prev]')) { if (kp) kp.go(-1); return; }
    if (t.closest('[data-kp-next]')) { if (kp) kp.go(1); return; }
    const sz = t.closest('[data-kp-size]');
    if (sz) { setSize(sz.dataset.kpSize); return; }
    if (t.closest('[data-kp-retry]')) { kRetry = true; kb.state = 'waiting'; scheduleKindle(true); return; }
    if (t.closest('[data-fmt-alsoby]')) { openAlsoBy(t.closest('[data-fmt-alsoby]')); return; }
    const go = t.closest('[data-fmt-go]');
    if (go && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); ctx.go(Number(go.dataset.fmtGo)); return; }
    const fb = t.closest('[data-fmt-full]');
    if (fb) { if (mode === 'kindle') openKindleFull(fb); else openFull(fb); return; }
    const m = t.closest('[data-fmt-mode]');
    if (m) setMode(m.dataset.fmtMode);
  }

  /* ── Full screen (D2, plan F13) ───────────── */

  /**
   * The spread over the whole window. A modal dialog: the page behind is
   * inert, so the focus stays inside; Esc and Close end it and the focus goes
   * back to the button. The preview's own stage moves in (one PDF, one preview,
   * still only the visible spread and the next one drawn) and moves back.
   */
  function openFull(opener) {
    if (full || !pv || !stageEl) return;
    const d = document.createElement('dialog');
    d.className = 'fmt-full';
    d.setAttribute('aria-labelledby', 'fmtFullTitle');
    d.innerHTML = `
      <div class="fmt-full-bar">
        <h2 class="fmt-full-title" id="fmtFullTitle">Print preview</h2>
        <button type="button" class="btn btn-secondary" data-full-close>${ICON.close}Close</button>
      </div>
      <div class="fmt-full-slot" data-full-slot></div>
      <div class="fmt-nav fmt-full-nav">
        <button type="button" class="fmt-nav-btn" data-fmt-prev aria-label="Previous pages">${IC.prev}</button>
        <span class="fmt-nav-label" data-fmt-label aria-live="polite"></span>
        <button type="button" class="fmt-nav-btn" data-fmt-next aria-label="Next pages">${IC.next}</button>
      </div>`;
    document.body.append(d);
    full = { kind: 'print', el: stageEl, dlg: d, opener, home: stageEl.parentNode, next: stageEl.nextSibling };
    d.querySelector('[data-full-slot]').append(stageEl);
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeFull(true); });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-full-close]')) { closeFull(true); return; }
      if (e.target.closest('[data-fmt-prev]')) { pv.go(-1); return; }
      if (e.target.closest('[data-fmt-next]')) pv.go(1);
    });
    d.addEventListener('keydown', (e) => {
      if (e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') { pv.go(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { pv.go(1); e.preventDefault(); }
    });
    d.showModal();
    d.querySelector('[data-full-close]').focus();
    paintNav();
    pv.refit();
  }

  /**
   * 41e F: Kindle mode in Full screen. The D2 view in the dark look: Exit full
   * screen, A A A, the device, the pager. The device itself moves in and back
   * (its frame loads again and returns to the same screen). Esc, also from
   * inside the frame, ends it; the focus stays inside and goes back.
   */
  function openKindleFull(opener) {
    if (full || !kp || !kDev || !kb.shown) return;
    const d = document.createElement('dialog');
    d.className = 'fmt-full kp-full';
    d.setAttribute('aria-labelledby', 'fmtFullTitle');
    d.innerHTML = `
      <h2 class="sr-only" id="fmtFullTitle">Kindle preview</h2>
      <div class="kp-full-bar">
        <button type="button" class="btn btn-secondary" data-full-close>Exit full screen</button>
        ${sizesHtml(false)}
      </div>
      <div class="kp-full-slot" data-full-slot>
        <div class="kp-nav">
          <button type="button" class="kp-nav-btn" data-kp-prev aria-label="Previous screen">${IC.prev}</button>
          <span class="kp-nav-label" data-kp-label aria-live="polite"></span>
          <button type="button" class="kp-nav-btn" data-kp-next aria-label="Next screen">${IC.next}</button>
        </div>
      </div>`;
    document.body.append(d);
    full = { kind: 'kindle', el: kDev, dlg: d, opener, home: kDev.parentNode, next: kDev.nextSibling };
    d.querySelector('[data-full-slot]').prepend(kDev);   // the device first, the pager under it
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeFull(true); });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-full-close]')) { closeFull(true); return; }
      if (e.target.closest('[data-kp-prev]')) { kp.go(-1); return; }
      if (e.target.closest('[data-kp-next]')) { kp.go(1); return; }
      const sz = e.target.closest('[data-kp-size]');
      if (sz) setSize(sz.dataset.kpSize);
    });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { kp.go(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { kp.go(1); e.preventDefault(); }
    });
    d.showModal();
    d.querySelector('[data-full-close]').focus();
    paintKindleNav();
  }

  /** Close the full screen view: the stage (or the Kindle device) goes home. focus: give the focus back. */
  function closeFull(focus) {
    if (!full) return;
    const f = full;
    full = null;
    if (f.home && f.home.isConnected) f.home.insertBefore(f.el, f.next && f.next.parentNode === f.home ? f.next : null);
    if (f.dlg.open) f.dlg.close();
    f.dlg.remove();
    if (f.kind === 'print' && pv && stageEl && stageEl.isConnected) { pv.refit(); paintNav(); }
    if (f.kind === 'kindle') paintKindleNav();
    if (focus && f.opener && f.opener.isConnected) f.opener.focus();
  }

  /** A A A: the reader size. The reader stays on the same part (kindle-preview.js). */
  function setSize(s) {
    if (!SIZE_NAMES.some(([k]) => k === s)) return;
    kSize = s;
    if (kp) kp.size(s);
    paintKindleNav();
  }

  /** Arrow keys turn the pages (Print) or the screens (Kindle) while the focus is in the preview (not in a field). */
  function onKey(e) {
    if (!root || e.target.closest('input, select, textarea') || !e.target.closest('.fmt-preview')) return;
    const p = mode === 'print' ? pv : (kb.state === 'ready' ? kp : null);
    if (!p) return;
    if (e.key === 'ArrowLeft') { p.go(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { p.go(1); e.preventDefault(); }
  }

  /** Print or Kindle (designs 41, 41d). Kindle builds the EPUB preview (no print engine needed). */
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    root.querySelectorAll('[data-fmt-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmtMode === m)));
    closeFull(false);
    paintPreview();               // shows the area of the mode (the Kindle area even when no engine runs, 41e D)
    if (m === 'kindle') ensureKindle();
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
    // A trim outside group A has no preview; back in group A, the engine starts or rebuilds.
    if (!canPreview()) { if (pv) { pv.destroy(); pv = null; } build = { state: 'idle', pages: 0, info: null, error: null }; paintPreview(); return; }
    if (pv) { pv.destroy(); pv = null; }
    build = { state: 'idle', pages: 0, info: null, error: null };
    paintPreview();
    if (eng.state === 'ready') scheduleBuild(true); else startEngine();
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
    root.addEventListener('keydown', onKey);
    loadData();
  }

  /** Leaving 08: end the engine (its memory goes back) and the preview. Edits keep saving. */
  function leave() {
    openToken++;
    closeFull(false);
    stopEngine();
    dropKindle();
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
    /** js/book.js: the 07 mark changed (the Ready box ends with the 07 line). */
    qcMarkChanged: () => paintReady(),
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle'),
    /** "Export files" in the header (design 42): the 08 panel, js/format-export.js. */
    openExport(opener) {
      window.kdpFormatExport.open({
        bookId: book.id, opener,
        engine: () => {
          if (!engine) engine = kdpFormatEngine.create({ onProgress: () => {} });
          return engine;
        },
        flush: () => (saver ? saver.flush() : Promise.resolve()),
        hasUnsaved: () => !!saver && saver.hasUnsaved(),
        trim: bookTrim,
        /** One build at a time in the engine: wait for the preview's, hold the next. */
        pause: () => {
          paused = true;
          if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; again = true; }
          return building ? new Promise((r) => idle.push(r)) : Promise.resolve();
        },
        resume: () => {
          paused = false;
          if (again) { again = false; scheduleBuild(true); }
        },
        onExported(row) {
          marks = { exported_at: row.created_at, page_count: row.page_count, changed: false };
          marksRead = true;
          if (fmt) { fmt.last_pdf = { created_at: row.created_at, page_count: row.page_count }; fmt.changed = false; }
          ctx.refresh();
        }
      });
    },
    /** Tests: the open settings. */
    _debug: () => ({ settings, fmt, marks, engine, pv, build, eng, missing, full: !!full, fullKind: full ? full.kind : null, kp, kb, kSize, mode })
  };
})();
