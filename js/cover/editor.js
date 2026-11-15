/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the editor step (E16 Part 4, plan §3, designs 58,
   59, 60, 73, 73c)
   /js/cover/editor.js   (registers window.kdpBookSteps[9]; needs the
                          js/cover/* modules, js/supabase.js and js/ui.js)

   Part 4 builds the whole frame of design 58 and makes these parts work:
   step 09 in the shell, Loading, Locked (no current Print PDF, design 73),
   a load error with Retry, the view bar (undo, redo, zoom, Fit, the KDP
   template layer popover, guide lines, snap, background color), the
   status bar, the Text panel, select, move, resize, rotate, in-place
   editing, the text bar with the font list and the color picker, undo
   (50 steps), autosave with rev and the visit snapshot, Save failed
   (design 73c), the Step D rules and keyboard reach.

   Drawn and inert (aria-disabled, title "Comes in Part N"): the Layouts,
   Book data, Images, Shapes and Layers tools (8, 8, 6, 5, 5), Write blurb
   and Author line (8), Effects (5), the Checks chip's drawer and Preview
   final (9), Export cover (10). The chip label and the header reason are
   live (kdpCover.checks), only the drawer is not built.

   Size: the design is drawn and saved at the size it is laid out for
   (cover_designs.fmt). When the book's size changed in 08, the remap and
   its note come in Part 9; the export guard refuses such a design.

   State lives in E (one object); render functions draw parts of the frame
   from it. The shell (js/book.js) calls init, render, nextNote, nextOff,
   exportInert, leave, flush and retrySave.
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = root.kdpCover;
  const STEP = 9;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inert = (part) => ` aria-disabled="true" title="Comes in Part ${part}" data-inert="${part}"`;
  const ICON = {
    layouts: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6"/></svg>',
    text: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
    images: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>',
    shapes: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="17" r="4"/><rect x="13" y="13" width="8" height="8"/><path d="M12 3l4 7H8z"/></svg>',
    layers: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    undo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    redo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    warn18: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    lock20: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
  };
  const TOOLS = [['layouts', 'Layouts', 8], ['book', 'Book data', 8], ['text', 'Text', 0], ['images', 'Images', 6], ['shapes', 'Shapes', 5], ['layers', 'Layers', 5]];

  let book = null, ctx = null;
  let E = null;          // the open editor (one per visit of step 09)
  let orphan = null;     // a saver whose last save failed while 09 was left: Retry in the sidebar still reaches it
  let keyBound = false;

  /* ── The editor object ── */
  function newEditor(rootEl) {
    return {
      root: rootEl, status: 'loading', data: null, cover: null, rev: 1,
      sel: null, editing: null, act: null, menu: null,
      view: { z: 1, px: 91, py: 47 }, tpl: { op: 100, hide: false, pop: false }, guides: true, snap: true,
      fontQ: '', cat: 'All', fontBusy: null, fontErr: null,
      pk: { target: 'color', hue: 0, sat: 0, val: 0, hexDraft: '#1C1C1A', recent: [] },
      saveState: 'saved', saveInfo: {}, hist: C.history.create(), seq: 0, painted: 0,
      // filled by start(): view, saver
      view_: null, saver: null,
      ...api()
    };
  }

  /* ── Loading ── */
  async function start(el) {
    const me = E = newEditor(el);
    renderLoading();
    let res;
    try { res = await kdp.getCover(book.id); } catch (e) { res = { error: e }; }
    if (me !== E) return;
    if (res.error && res.error.notFound) { ctx.notFound(); return; }
    if (res.error) { renderError(); return; }
    let data = res.data;
    if (!data.pdf || !data.pdf.current || !data.fmt || data.fmt.pages == null) { E.data = data; E.status = 'locked'; renderLocked(); ctx.setGate(); return; }
    let newCover = false;
    if (!data.design) {
      newCover = true;
      try { res = await kdp.ensureCoverDesign(book.id, { fmt: data.fmt, layers: [], bg: '#FFFFFF' }); } catch (e) { res = { error: e }; }
      if (me !== E) return;
      if (res.error || !res.data || !res.data.design) { renderError(); return; }
      data = res.data;
    }
    E.data = data;
    E.cover = C.model.normalize({ fmt: data.design.fmt, bg: data.design.bg, layers: data.design.layers, layout: data.design.layout });
    E.rev = data.design.rev;
    C.fonts.install();
    C.textlayout.setMeasure(C.fonts.measure);
    try { await C.fonts.loadAll(E.cover.layers); } catch (e) {
      if (me !== E) return;
      renderError('We couldn’t load the fonts of your cover', 'Check your connection, then try again.');
      return;
    }
    if (me !== E) return;
    E.status = 'ready';
    E.tpl.pop = newCover || !E.cover.layers.length;
    E.saver = C.save.create({
      bookId: book.id, rev: E.rev,
      snapshot: { layers: E.cover.layers, bg: E.cover.bg, fmt: E.cover.fmt, layout: E.cover.layout },
      read: () => ({ layers: me.cover.layers, bg: me.cover.bg }),
      onState: (st, info) => {
        // The shell's save line (sidebar and rail) shows 09's state too, with Retry (as 08).
        ctx.renderSave(st === 'failed' ? 'error' : st, st === 'failed' ? 'Your last cover change was not saved.' : '', st === 'failed', STEP);
        if (st === 'saved' && orphan === me.saver) orphan = null;
        me.saveState = st; me.saveInfo = info;
        if (me === E) renderSave();
      }
    });
    renderEditor();
    ctx.setGate();
    // The Text panel's presets draw in Source Serif 4 Bold and IBM Plex Sans: load them now, so Add is instant.
    C.fonts.load('Source Serif 4', 700).catch(() => {});
    C.fonts.load('IBM Plex Sans', 600).catch(() => {});
    C.fonts.load('IBM Plex Sans', 400).catch(() => {});
  }

  function renderLoading() {
    E.root.innerHTML = `<div class="cv-root cv-full" data-cover>
      <div class="cv-loading" role="status" aria-label="Loading">
        <div class="cv-loading-bar"></div>
        <div class="cv-loading-body"><div class="cv-loading-sheet"></div>
          <div class="cv-loading-t">Loading your cover…</div>
          <div class="cv-loading-s">Getting your book size from 08 Format, your fonts and pictures.</div></div>
      </div></div>`;
  }

  function renderError(title, text) {
    E.status = 'error';
    E.root.innerHTML = `<div class="cv-root cv-full" data-cover><div class="center-state"><div class="state-box" role="alert">
      <div class="state-icon danger" aria-hidden="true">${ICON.warn18}</div>
      <h2>${esc(title || 'We couldn’t load the cover')}</h2>
      <p>${esc(text || 'Check your connection, then try again.')}</p>
      <div class="state-actions"><button type="button" class="btn btn-primary" data-cv-retry>Retry</button></div></div></div></div>`;
    E.root.querySelector('[data-cv-retry]').addEventListener('click', () => start(E.root));
    ctx.setGate();
  }

  /** Design 73: no current Print PDF, so the spine width is unknown. */
  function renderLocked() {
    E.root.innerHTML = `<div class="cv-root cv-full" data-cover><div class="cv-locked">
      <div class="cv-locked-card">
        <span class="cv-locked-icon">${ICON.lock20}</span>
        <h2>Finish 08 Format first</h2>
        <p class="cv-locked-p">The cover size comes from your interior: trim, page count and paper. This book has no current Print PDF yet, so the spine width is unknown.</p>
        <p class="cv-locked-s">Your cover design is safe. When the Print PDF is ready, the cover opens again and fits the new size.</p>
        <a class="cv-locked-btn" href="?id=${encodeURIComponent(book.id)}&step=8" data-open-08>Open 08 Format</a>
      </div></div></div>`;
    E.root.querySelector('[data-open-08]').addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); ctx.go(8);
    });
  }

  /* ── The frame (design 58) ── */
  function renderEditor() {
    E.root.innerHTML = `<div class="cv-root" data-cover>
      <nav class="cv-tools" aria-label="Cover tools">${TOOLS.map(([k, label, part]) => `<button type="button" class="cv-tool${k === 'text' ? ' is-on' : ''}" data-k="tool-${k}" data-tool="${k}"
        aria-pressed="${k === 'text'}"${part ? inert(part) : ''}>${ICON[k]}${label}</button>`).join('')}</nav>
      <section class="cv-panel" aria-label="Text" data-panel></section>
      <main class="cv-main">
        <div class="cv-viewbar" role="toolbar" aria-label="Cover view" data-viewbar></div>
        <div class="cv-textbar" role="toolbar" aria-label="Selected text" data-textbar hidden></div>
        <div class="cv-alert" role="alert" data-alert hidden></div>
        <div class="cv-wswrap" data-wswrap></div>
        <footer class="cv-foot" data-foot></footer>
      </main>
    </div>`;
    const v = E.view_ = C.view.create(E);
    E.root.querySelector('[data-wswrap]').append(v.el);
    C.text.bindPanel(E.root.querySelector('[data-panel]'), E);
    C.text.bindBar(E.root.querySelector('[data-textbar]'), E);
    bindViewBar(E.root.querySelector('[data-viewbar]'));
    E.root.querySelector('[data-alert]').addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) retrySave(); });
    E.root.querySelector('[data-foot]').addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) retrySave(); });
    renderPanel();
    renderBars();
    renderFoot();
    renderSave();
    // Open at 100 % centered (or Fit when that does not fit), as design 58.
    root.requestAnimationFrame(() => { if (E && E.view_ === v) { v.center(); v.sync(); } });
    bindKeys();
  }

  function renderPanel() {
    const p = E.root.querySelector('[data-panel]');
    keepFocus(p, () => { p.innerHTML = C.text.panelHtml(E); });
  }

  function viewBarHtml() {
    const items = C.checks.run(E.cover);
    const sum = C.checks.summary(items);
    const bad = sum.errors > 0, warn = !bad && sum.warns > 0;
    return `
      <button type="button" class="cv-ib cv-ib-plain" data-k="undo" data-vb="undo" aria-label="Undo" title="Undo (Cmd+Z or Ctrl+Z)"${E.hist.canUndo() ? '' : ' aria-disabled="true"'}>${ICON.undo}</button>
      <button type="button" class="cv-ib cv-ib-plain" data-k="redo" data-vb="redo" aria-label="Redo" title="Redo (Shift+Cmd+Z or Ctrl+Y)"${E.hist.canRedo() ? '' : ' aria-disabled="true"'}>${ICON.redo}</button>
      <span class="cv-sep" aria-hidden="true"></span>
      <button type="button" class="cv-zb" data-k="zout" data-vb="zout" aria-label="Zoom out">−</button>
      <span class="cv-zoom cv-mono" aria-live="polite">${Math.round(E.view.z * 100)}%</span>
      <button type="button" class="cv-zb" data-k="zin" data-vb="zin" aria-label="Zoom in">+</button>
      <button type="button" class="cv-fit" data-k="fit" data-vb="fit">Fit</button>
      <span class="cv-sep" aria-hidden="true"></span>
      <button type="button" class="cv-tplbtn" data-k="tpl" data-vb="tpl" aria-expanded="${E.tpl.pop}">KDP template · ${E.tpl.hide ? 'hidden' : E.tpl.op + '%'}</button>
      <label class="cv-vcheck"><input type="checkbox" data-k="guides" data-vb="guides"${E.guides ? ' checked' : ''}>Guide lines</label>
      <label class="cv-vcheck"><input type="checkbox" data-k="snap" data-vb="snap"${E.snap ? ' checked' : ''}>Snap</label>
      <button type="button" class="cv-bgbtn${E.menu === 'bg' ? ' is-open' : ''}" data-k="bg" data-vb="bg" aria-expanded="${E.menu === 'bg'}"><span class="cv-swatch" style="--sw:${E.cover.bg}"></span>Background</button>
      <span class="cv-grow"></span>
      <button type="button" class="cv-chip-chk${bad ? ' is-bad' : warn ? ' is-warn' : ' is-ok'}" data-k="chk" aria-expanded="false"${inert(9)}>${bad || warn ? ICON.warn : ICON.ok}${esc(sum.chip)}</button>
      <button type="button" class="cv-tb cv-tb-pv" data-k="pv"${inert(9)}>${ICON.eye}Preview final</button>
      ${E.menu === 'bg' ? `<div class="cv-pop cv-pop-bg" role="dialog" aria-label="Background color" data-picker>${C.picker.html(E.pk, { title: 'Background color', cur: E.cover.bg, note: 'The color fills the whole wrap, bleed included. For a photo background, use Images, then Fill whole cover.' })}</div>` : ''}`;
  }

  function bindViewBar(el) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vb]');
      if (!b || b.getAttribute('aria-disabled') === 'true' || b.tagName === 'INPUT') return;
      const a = b.dataset.vb;
      if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'zout') E.view_.zoomAt(1 / 1.25);
      else if (a === 'zin') E.view_.zoomAt(1.25);
      else if (a === 'fit') E.view_.fit();
      else if (a === 'tpl') toggleTpl();
      else if (a === 'bg') toggleMenu('bg');
    });
    el.addEventListener('change', (e) => {
      const a = e.target.dataset.vb;
      if (a === 'guides') { E.guides = e.target.checked; E.view_.sync(); }
      if (a === 'snap') E.snap = e.target.checked;
    });
  }

  /** The view bar and the text bar again, keeping the focused control focused. */
  function renderBars() {
    if (!E || E.status !== 'ready') return;
    const vb = E.root.querySelector('[data-viewbar]');
    keepFocus(vb, () => { vb.innerHTML = viewBarHtml(); });
    const tb = E.root.querySelector('[data-textbar]');
    const html = C.text.barHtml(E);
    keepFocus(tb, () => { tb.innerHTML = html; });
    tb.hidden = !html;
    const pk = E.root.querySelector('[data-picker]');
    if (pk) C.picker.bind(pk, E.pk, pickerApi());
    clampPops();
    if (E.menu === 'fonts') {
      const on = tb.querySelector('.cv-font.is-on');
      if (on && !E.fontScrolled) { on.scrollIntoView({ block: 'nearest' }); E.fontScrolled = true; }
    }
  }

  /** A popover placed at the design's left (380 px, 560 px) stays inside its bar in a narrow window. */
  function clampPops() {
    for (const pop of E.root.querySelectorAll('.cv-viewbar > .cv-pop, .cv-textbar > .cv-pop')) {
      const bar = pop.parentElement.getBoundingClientRect(), r = pop.getBoundingClientRect();
      if (r.right > bar.right - 8) { pop.style.left = Math.max(8, bar.width - r.width - 8) + 'px'; pop.style.right = 'auto'; }
    }
  }

  function keepFocus(el, fn) {
    const a = document.activeElement;
    const k = a && el.contains(a) ? a.getAttribute('data-k') : null;
    const selStart = k && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    fn();
    if (!k) return;
    const n = el.querySelector(`[data-k="${CSS.escape(k)}"]`);
    if (n) { n.focus({ preventScroll: true }); if (selStart && n.setSelectionRange) try { n.setSelectionRange(selStart[0], selStart[1]); } catch (e) { /* not a text field */ } }
  }

  function renderFoot() {
    const f = E.root.querySelector('[data-foot]');
    const L = C.names.labels(C.geo.geo(E.cover.fmt));
    const st = E.saveState;
    const text = st === 'saved' ? '✓ Saved' : st === 'saving' ? 'Saving…' : 'Not saved';
    f.innerHTML = `<span class="cv-specs"><span>${L.trim}</span><span>${L.pages}</span><span>${L.paper}</span><span>${L.spine}</span><span>${L.full}</span></span>
      <span class="cv-grow"></span><span class="cv-savetext is-${st}" data-savetext role="status">${text}</span>
      ${st === 'failed' ? '<button type="button" class="cv-foot-retry" data-k="foot-retry" data-retry-save>Retry</button>' : ''}`;
  }

  /** Design 73c: the bar, the footer "Not saved", and Retry (an ink button). */
  function renderSave() {
    // 09 may have been left (another step draws in the same element): nothing of the editor to update.
    if (!E || E.status !== 'ready' || !E.root.querySelector('[data-cover] [data-alert]')) return;
    const bar = E.root.querySelector('[data-alert]');
    const failed = E.saveState === 'failed';
    bar.hidden = !failed;
    bar.innerHTML = failed ? `${ICON.warn18}<span class="cv-alert-t"><strong>Your last change was not saved.</strong> It is still here on screen. Retry, and do not close this page until it says Saved.</span>
      <button type="button" class="cv-alert-btn" data-k="alert-retry" data-retry-save>Retry</button>` : '';
    keepFocus(E.root.querySelector('[data-foot]'), renderFoot);
    E.view_ && E.view_.paint();
  }

  /* ── Changes ── */
  const textH = (l) => C.textlayout.height(l);

  /** Every change to the layers or the background goes here: undo, save, draw. */
  function commit(layers, bg, act, opt) {
    const prev = { layers: E.cover.layers, bg: E.cover.bg };
    if (layers === prev.layers && bg === prev.bg) return;
    E.hist.change(prev, act || null);
    E.cover = Object.assign({}, E.cover, { layers, bg });
    E.saver.changed();
    afterChange(act, opt);
  }
  /** opt: bars, panel, overlay (false: draw the canvas and move the frame only, e.g. while typing or on a slider). */
  function afterChange(act, opt) {
    const o = opt || {};
    if (act) { E.view_.paint(); return; }   // a drag: the frame moves in view.js; bars wait for the end
    if (o.overlay === false) { E.view_.paint(); E.view_.syncSelBox(); } else E.view_.sync();
    if (o.bars !== false) renderBars();
    if (o.panel !== false) renderPanel();
    ctx.setGate();
  }

  function patchLayer(id, patch, act, opt) {
    const layers = E.cover.layers.map((l) => (l.id === id ? Object.assign({}, l, patch) : l));
    commit(layers, E.cover.bg, act, opt);
  }

  function addLayer(L) {
    commit(E.cover.layers.concat([L]), E.cover.bg, null, { bars: false });
    E.sel = L.id; E.editing = null; E.menu = null;
    E.view_.sync(); renderBars();
    // Focus goes to the new layer's box, so the keyboard can move it at once.
    const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(L.id))}"]`);
    if (hit) hit.focus({ preventScroll: true });
  }

  async function withFace(family, weight) {
    const w = C.fonts.snap(family, weight) || weight;
    const f = C.fonts.face(family, w);
    if (f && C.fonts.loaded(f)) return w;
    E.fontBusy = family; E.fontErr = null; renderBars();
    try { await C.fonts.load(family, w); E.fontBusy = null; return w; }
    catch (e) { E.fontBusy = null; E.fontErr = `Could not load ${family}. Check your connection and try again.`; renderBars(); return null; }
  }

  async function addText(kind) {
    const P = C.model.TEXT_PRESETS[kind];
    const me = E;
    const w = await withFace(P.font, P.weight);
    if (me !== E || w == null) return;
    const L = C.model.newText(kind, E.cover.layers.length, C.geo.geo(E.cover.fmt), C.model.nextId(E.cover.layers));
    L.weight = w;
    addLayer(L);
  }

  function bookWords(key) {
    const b = (E.data && E.data.book) || {};
    return String((key === 'title' ? b.title : key === 'subtitle' ? b.subtitle : b.pen_name) || '').trim();
  }
  async function addBook(key) {
    if (E.cover.layers.some((l) => l.src === key)) return;
    const S = C.model.BOOK_STYLE[key];
    const me = E;
    const w = await withFace(S.font, S.weight);
    if (me !== E || w == null) return;
    const L = C.model.newBookText(key, bookWords(key), C.geo.geo(E.cover.fmt), C.model.nextId(E.cover.layers));
    L.weight = w;
    addLayer(L);
  }

  async function pickFont(family, weight) {
    const l = selLayer(); if (!l) return;
    const me = E, id = l.id;
    const want = weight || l.weight;
    const w = await withFace(family, want);
    if (me !== E || w == null) return;
    const cur = E.cover.layers.find((x) => x.id === id);
    if (!cur) { renderBars(); return; }
    patchLayer(id, { font: family, weight: w });
  }

  function arrange(mode) {
    const l = selLayer(); if (!l) return;
    commit(C.model.arrange(E.cover.layers, l.id, mode, textH), E.cover.bg, null);
    E.menu = null; renderBars();
  }
  function duplicate() {
    const l = selLayer(); if (!l) return;
    const r = C.model.dup(E.cover.layers, l.id, C.model.nextId(E.cover.layers));
    E.sel = r.sel;
    commit(r.layers, E.cover.bg, null);
  }
  function removeSel() {
    if (E.sel == null) return;
    const ids = [E.sel];
    E.sel = null; E.editing = null; E.menu = null;
    commit(C.model.remove(E.cover.layers, ids), E.cover.bg, null);
    E.view_.sync(); renderBars();
    const c = E.root.querySelector('[data-canvas]');
    if (document.activeElement === document.body) { const first = E.root.querySelector('[data-hit]'); (first || c).focus && (first || c).focus({ preventScroll: true }); }
  }

  function select(id, opt) {
    if (E.sel === id) return;
    if (E.editing != null && E.editing !== id) stopEdit(false);
    E.sel = id; E.menu = null; E.fontScrolled = false; E.fontErr = null;
    E.view_.sync();
    renderBars();
    if (opt && opt.keepFocus && id != null) {
      const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`);
      if (hit) hit.focus({ preventScroll: true });
    }
  }
  const selLayer = () => (E && E.cover ? E.cover.layers.find((l) => l.id === E.sel) || null : null);

  function startEdit(id) {
    const l = E.cover.layers.find((x) => x.id === id);
    if (!l || l.type !== 'text' || l.lock) return;
    E.sel = id; E.editing = id; E.menu = null;
    E.view_.sync(); renderBars();
  }
  function setText(id, text) {
    const l = E.cover.layers.find((x) => x.id === id); if (!l) return;
    patchLayer(id, { text: text.slice(0, C.model.CAPS.text) }, null, { bars: false, panel: false, overlay: false });
  }
  function stopEdit(refocus) {
    const id = E.editing;
    if (id == null) return;
    E.editing = null;
    E.view_.sync();
    renderBars(); renderPanel();
    if (refocus) { const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`); if (hit) hit.focus({ preventScroll: true }); }
  }

  function undo() { const s = E.hist.undo({ layers: E.cover.layers, bg: E.cover.bg }); if (s) restore(s); }
  function redo() { const s = E.hist.redo({ layers: E.cover.layers, bg: E.cover.bg }); if (s) restore(s); }
  function restore(s) {
    E.cover = Object.assign({}, E.cover, { layers: s.layers, bg: s.bg });
    const k = C.history.keepSelection(s, E.sel, []);
    E.sel = k.sel; E.editing = null;
    E.saver.changed();
    afterChange(null);
  }

  /* ── Menus and the picker ── */
  function closeMenus() {
    let changed = false;
    if (E.menu) { E.menu = null; changed = true; }
    if (changed) renderBars();
  }
  function toggleMenu(m) {
    E.menu = E.menu === m ? null : m;
    if (E.menu === 'color' || E.menu === 'bg') openPicker(E.menu === 'bg' ? 'bg' : 'color');
    if (E.menu === 'fonts') E.fontScrolled = false;
    renderBars();
    const pop = E.root.querySelector('.cv-pop:not(.cv-tplpop)');
    if (pop) { const f = pop.querySelector('[data-font-q], [data-pk-sv], input, button[role="menuitem"]'); if (f) f.focus({ preventScroll: true }); }
  }
  function toggleTpl(on) {
    E.tpl.pop = on == null ? !E.tpl.pop : on;
    E.view_.sync(); renderBars();
    if (E.tpl.pop) { const r = E.root.querySelector('[data-tpl-op]'); if (r) r.focus({ preventScroll: true }); }
    else { const b = E.root.querySelector('[data-k="tpl"]'); if (b) b.focus({ preventScroll: true }); }
  }
  function colorOf(t) { if (t === 'bg') return E.cover.bg; const l = selLayer(); return l ? l.color : '#1C1C1A'; }
  function openPicker(t) {
    const v = colorOf(t), hsv = C.picker.hexToHsv(v);
    Object.assign(E.pk, { target: t, hexDraft: v, sat: hsv.sat, val: hsv.val, hue: hsv.sat > 0 ? hsv.hue : E.pk.hue });
  }
  function applyColor(hex) {
    const o = { bars: false, panel: false, overlay: false };
    if (E.pk.target === 'bg') { commit(E.cover.layers, hex, null, o); E.view_.sync(); }
    else { const l = selLayer(); if (l) patchLayer(l.id, { color: hex }, null, o); }
  }
  /** While the square or the hue slider is dragged, the picker is updated in place (drawing it again would end the drag). */
  function updatePicker(hex) {
    const pk = E.root.querySelector('[data-picker]');
    if (pk) C.picker.update(pk, E.pk, hex);
    const b = E.root.querySelector(E.pk.target === 'bg' ? '[data-k="bg"]' : '[data-k="color"]');
    if (b) {
      const sw = b.querySelector('.cv-swatch'); if (sw) sw.style.setProperty('--sw', hex);
      const m = b.querySelector('.cv-mono'); if (m) m.textContent = hex;
      if (E.pk.target !== 'bg') b.setAttribute('aria-label', `Text color ${hex}`);
    }
  }
  function pickerApi() {
    return {
      set(hex, keep) {
        hex = hex.toUpperCase();
        const hsv = C.picker.hexToHsv(hex);
        Object.assign(E.pk, { hexDraft: hex, sat: hsv.sat, val: hsv.val }, hsv.sat > 0 ? { hue: hsv.hue } : {});
        if (keep) E.pk.recent = C.picker.remember(E.pk.recent, hex);
        applyColor(hex); renderBars();
      },
      hsv(h, s, v) {
        const hex = C.picker.hsvToHex(h, s, v);
        Object.assign(E.pk, { hue: h, sat: s, val: v, hexDraft: hex });
        applyColor(hex); updatePicker(hex);
      },
      close() { const m = E.menu; E.menu = null; renderBars(); const b = E.root.querySelector(`[data-k="${m === 'bg' ? 'bg' : 'color'}"]`); if (b) b.focus({ preventScroll: true }); }
    };
  }

  /* ── Keyboard (design onKeyEvt) ── */
  function bindKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener('keydown', (e) => {
      if (!E || E.status !== 'ready' || !ctx.isActive(STEP) || !E.root.isConnected) return;
      const t = e.target;
      const mod = e.metaKey || e.ctrlKey, k = e.key;
      if (k === 'Escape') {
        if (E.menu) { const m = E.menu; E.menu = null; renderBars(); const b = E.root.querySelector(`[data-k="${{ fonts: 'font', color: 'color', opacity: 'op', arrange: 'arr', bg: 'bg' }[m]}"]`); if (b) b.focus({ preventScroll: true }); return; }
        if (E.tpl.pop && t && t.closest && t.closest('[data-tplpop]')) { toggleTpl(false); return; }
        if (E.sel != null && !(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT'))) { const id = E.sel; select(null); const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`); if (hit) hit.focus({ preventScroll: true }); }
        return;
      }
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (t && t.closest && t.closest('[data-handle]')) return;   // view.js: arrows resize with a handle focused
      if ((k === 'Delete' || k === 'Backspace') && E.sel != null) { e.preventDefault(); removeSel(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d && E.sel != null && (!t || !t.closest || !t.closest('.cv-viewbar, .cv-textbar, .cv-panel, .cv-tools'))) {
        e.preventDefault();
        commit(C.model.nudge(E.cover.layers, [E.sel], d[0], d[1], e.shiftKey), E.cover.bg, null, { panel: false });
        keepFocusHit();
      }
    });
    root.addEventListener('beforeunload', (e) => {
      const s = E && E.saver && ctx.isActive(STEP) ? E.saver : orphan;
      if (!s) return;
      if (s.pending() || s.state() === 'failed') { e.preventDefault(); e.returnValue = ''; }
    });
  }
  function keepFocusHit() {
    if (E.sel == null) return;
    const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(E.sel))}"]`);
    if (hit && document.activeElement !== hit && (document.activeElement === document.body || !document.activeElement)) hit.focus({ preventScroll: true });
  }

  function retrySave() { const s = E && E.saver ? E.saver : orphan; if (s) s.retry(); }

  /* ── The editor API used by view.js and text.js ── */
  function api() {
    return {
      textH, selLayer, select, startEdit, stopEdit, setText, patchLayer, addText, addBook, bookWords, pickFont,
      arrange, duplicate, removeSel, toggleMenu, toggleTpl, closeMenus,
      refreshBars: renderBars,
      layerName: (l) => C.names.layerName(l),
      viewChanged() { if (E.view_) { E.view_.sync(); renderBars(); } },
      wsResized() { if (E.view_) E.view_.sync(); },
      dragEnded() { renderBars(); renderPanel(); ctx.setGate(); },
      keyEdited(hd) { E.view_.sync(); renderBars(); ctx.setGate(); const n = E.root.querySelector(`[data-handle="${hd.dataset.handle}"][data-c="${hd.dataset.c}"]`); if (n) n.focus({ preventScroll: true }); }
    };
  }

  /* ── The step module ── */
  const step = {
    init(b, c) { book = b; ctx = c; },
    render(rootEl) {
      start(rootEl).catch((e) => { if (E) renderError(); if (root.console) console.error(e); });
    },
    isDone: () => false,   // a current export (Part 10)
    missing: () => '',
    /** The header line beside Next (design exportReason; Part 9 adds the size-change words, Part 10 "Done"). */
    nextNote() {
      if (!E || E.status !== 'ready') return 'Not done yet: export the cover files.';
      const n = C.checks.run(E.cover).filter((c) => c.sev === 'error').length;
      return n ? `Fix ${n} problem${n === 1 ? '' : 's'} before export.` : 'Not done yet: export the cover files.';
    },
    /** Next opens 10 only after a current export (Part 10). */
    nextOff: () => true,
    nextTitle: '10 Metadata',
    exportLabel: 'Export cover',
    exportInert: 10,
    flush() { if (E && E.saver) E.saver.flush(); },
    leave() {
      const me = E;
      if (!me || !me.saver) { E = null; return Promise.resolve(); }
      if (me.editing != null) me.editing = null;
      // A save that fails here stays in the sidebar's save line with Retry (orphan), as 08's do.
      return me.saver.flush().catch(() => {}).then(() => { if (me.saver.state() === 'failed') orphan = me.saver; if (E === me) E = null; });
    },
    retrySave,
    /** Tests only: the editor state. */
    _debug: () => E
  };

  root.kdpBookSteps = root.kdpBookSteps || {};
  root.kdpBookSteps[STEP] = step;
})(globalThis);
