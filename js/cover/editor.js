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

   Part 5 (designs 61, 64, 65, 66) adds: text effects (js/cover/effects.js),
   the Shapes panel with the Tabler icons and the shape bar
   (shapes-ui.js), several layers selected (multi.js; E.multi beside E.sel,
   as the design's selectIds), the Layers panel and its ⋮ menu
   (layers-panel.js), and the free distortion corners on the cover (view.js).
   The one color picker now serves the text color, the effect color, the
   fill and gradient ends, the border and the background (E.pk.target).

   Part 6 (design 62) adds pictures (js/cover/images.js): the Images panel
   (Uploads: the rights tick, Upload image, Upload PDF, Paste, Cmd/Ctrl+V),
   the picture bar and crop mode (E.cropping, the design's cropping; view.js
   draws the crop handles), and the picture store (E.pics) behind the
   renderer's images callback. A picture removed from Uploads is a Must fix
   (C15, kdpCover.checks with opt.missing).

   Part 7 (design 63) adds stock pictures (js/cover/stock.js): the Pixabay
   and Unsplash tabs of the Images panel and the wide picker over the panel
   and the cover ([data-stock-host]; Escape closes it, the cover's keys rest
   while it is open).

   Part 8 (designs 67, 68) adds the Layouts panel (layouts-panel.js: My
   layouts, the 6 series colors, 12 ready layouts + Blank; a layout applies
   at once, with the 6 s Undo note), the Book data panel (bookdata.js) and
   the back blurb dialog (blurb.js; generate cover_blurb v28). A layout, a
   palette and a blurb put on the cover are each one Undo step
   (history.step). The pressed layout is saved in cover_designs.layout. A
   layout's sample photo is a Must fix (C16, STOP 6 N2 rec, opt.samples).

   Drawn and inert (aria-disabled, title "Comes in Part N"): the Checks
   chip's drawer and Preview final (9), Export cover (10). The chip label
   and the header reason are live (kdpCover.checks), only the drawer is not
   built.

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
  const TOOLS = [['layouts', 'Layouts', 0], ['book', 'Book data', 0], ['text', 'Text', 0], ['images', 'Images', 0], ['shapes', 'Shapes', 0], ['layers', 'Layers', 0]];
  const PANEL_LABEL = { layouts: 'Layouts', book: 'Book data', text: 'Text', images: 'Images', shapes: 'Shapes', layers: 'Layers' };
  const TOAST_MS = 6000;
  // The checks the editor runs: C15 (a removed picture) and C16 (a layout's sample photo, STOP 6 N2 rec).
  const checkOpt = () => ({ missing: C.images.missing(E), samples: true });
  // A menu → the bar button that opened it (Escape gives focus back there).
  const MENU_BTN = { fonts: 'font', color: 'color', opacity: 'op', arrange: 'arr', bg: 'bg', effects: 'fx', shape: 'shape', sfill: 'sfill', stroke: 'stroke', more: 'more',
    ifill: 'ifill', iadjust: 'iadjust', iborder: 'iborder', imask: 'imask' };
  // A picker target → the bar button that shows that color.
  const PK_BTN = { color: 'color', bg: 'bg', fxcolor: 'fx', fill: 'sfill', fill2: 'sfill', scolor: 'stroke', bcolor: 'iborder' };

  let book = null, ctx = null;
  let E = null;          // the open editor (one per visit of step 09)
  let orphan = null;     // a saver whose last save failed while 09 was left: Retry in the sidebar still reaches it
  let keyBound = false;

  /* ── The editor object ── */
  function newEditor(rootEl) {
    const ed = {
      root: rootEl, status: 'loading', data: null, cover: null, rev: 1,
      sel: null, multi: [], editing: null, act: null, menu: null,
      panel: 'text', layerMenu: null, renaming: null, rowDrag: null, fxSnap: null, alignTo: 'sel',
      iconQ: '', iconN: 48, icons: 'idle',
      // Part 6: the Images panel, Uploads, Replace, crop mode, the picture store
      img: { rights: false, err: '', busy: '', pdf: null, tab: 'up' }, uploads: null, replaceId: null, cropping: null, pics: new Map(), bookId: null,
      // Part 8: the Layouts panel (busy: the layout being applied; fonts: the 12 layouts' faces are loaded), My layouts, the note, the blurb dialog
      lay: { busy: null, err: '', fonts: false }, my: [], toast: null, blurb: null,
      view: { z: 1, px: 91, py: 47 }, tpl: { op: 100, hide: false, pop: false }, guides: true, snap: true,
      fontQ: '', cat: 'All', fontBusy: null, fontErr: null,
      pk: { target: 'color', hue: 0, sat: 0, val: 0, hexDraft: '#1C1C1A', recent: [] },
      saveState: 'saved', saveInfo: {}, hist: C.history.create(), seq: 0, painted: 0,
      // filled by start(): view, saver
      view_: null, saver: null,
      ...api()
    };
    ed.live = () => E === ed;   // async work (uploads, picture loads) checks it is still this visit's editor
    return ed;
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
    E.bookId = book.id;
    E.cover = C.model.normalize({ fmt: data.design.fmt, bg: data.design.bg, layers: data.design.layers, layout: data.design.layout });
    E.rev = data.design.rev;
    E.my = Array.isArray(data.my_layouts) ? data.my_layouts.slice() : [];
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
      read: () => ({ layers: me.cover.layers, bg: me.cover.bg, layout: me.cover.layout == null ? null : me.cover.layout }),
      onState: (st, info) => {
        // The shell's save line (sidebar and rail) shows 09's state too, with Retry (as 08).
        ctx.renderSave(st === 'failed' ? 'error' : st, st === 'failed' ? 'Your last cover change was not saved.' : '', st === 'failed', STEP);
        if (st === 'saved' && orphan === me.saver) orphan = null;
        me.saveState = st; me.saveInfo = info;
        if (me === E) renderSave();
      }
    });
    renderEditor();
    C.images.loadUsed(E);
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
      <nav class="cv-tools" aria-label="Cover tools" data-tools>${toolsHtml()}</nav>
      <section class="cv-panel" aria-label="${PANEL_LABEL[E.panel]}" data-panel></section>
      <main class="cv-main">
        <div class="cv-viewbar" role="toolbar" aria-label="Cover view" data-viewbar></div>
        <div class="cv-textbar" role="toolbar" aria-label="Selected text" data-textbar hidden></div>
        <div class="cv-alert" role="alert" data-alert hidden></div>
        <div class="cv-capnote" role="status" data-capnote hidden></div>
        <div class="cv-wswrap" data-wswrap></div>
        <footer class="cv-foot" data-foot></footer>
      </main>
      <div class="cv-lmenu-host" data-lmenu-host></div>
      <div class="cv-stock-host" data-stock-host></div>
      <div class="cv-toast-host" data-toast-host></div>
      <div class="cv-blurb-host" data-blurb-host></div>
    </div>`;
    const v = E.view_ = C.view.create(E);
    E.root.querySelector('[data-wswrap]').append(v.el);
    const panel = E.root.querySelector('[data-panel]'), bar = E.root.querySelector('[data-textbar]');
    C.text.bindPanel(panel, E);
    C.shapesUi.bindPanel(panel, E);
    C.layersPanel.bind(panel, E);
    C.images.bindPanel(panel, E);
    C.text.bindBar(bar, E);
    C.images.bindBar(bar, E);
    C.effects.bind(bar, E);
    C.shapesUi.bindBar(bar, E);
    C.multi.bind(bar, E);
    C.layersPanel.bindMenu(E.root.querySelector('[data-lmenu-host]'), E);
    C.stock.bindPanel(panel, E);
    C.stock.bindHost(E.root.querySelector('[data-stock-host]'), E);
    C.layoutsPanel.bind(panel, E);
    C.bookData.bind(panel, E);
    C.blurb.bindHost(E.root.querySelector('[data-blurb-host]'), E);
    E.root.querySelector('[data-toast-host]').addEventListener('click', (e) => {
      if (e.target.closest('[data-toast-undo]')) toastUndo();
      else if (e.target.closest('[data-toast-x]')) hideToast(true);
    });
    E.root.querySelector('[data-tools]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      // Part 7: the tool rail stays in view beside the wide picker; a tool closes it
      if (E.stock && E.stock.open) { E.stock.open = false; E.stock.prev = null; renderStock(); }
      showPanel(b.dataset.tool);
    });
    bindViewBar(E.root.querySelector('[data-viewbar]'));
    E.root.querySelector('[data-alert]').addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) retrySave(); });
    E.root.querySelector('[data-capnote]').addEventListener('click', (e) => { if (e.target.closest('[data-cap-x]')) capNote(null); });
    E.root.querySelector('[data-foot]').addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) retrySave(); });
    renderPanel();
    renderBars();
    renderFoot();
    renderSave();
    // Open at 100 % centered (or Fit when that does not fit), as design 58.
    root.requestAnimationFrame(() => { if (E && E.view_ === v) { v.center(); v.sync(); } });
    bindKeys();
  }

  function toolsHtml() {
    return TOOLS.map(([k, label, part]) => `<button type="button" class="cv-tool${k === E.panel ? ' is-on' : ''}" data-k="tool-${k}" data-tool="${k}"
        aria-pressed="${k === E.panel}"${part ? inert(part) : ''}>${ICON[k]}${label}</button>`).join('');
  }
  function renderPanel() {
    const p = E.root.querySelector('[data-panel]');
    const top = p.scrollTop;
    p.setAttribute('aria-label', PANEL_LABEL[E.panel]);
    p.dataset.kind = E.panel;
    keepFocus(p, () => {
      p.innerHTML = E.panel === 'shapes' ? C.shapesUi.panelHtml(E) : E.panel === 'layers' ? C.layersPanel.html(E) : E.panel === 'images' ? C.images.panelHtml(E)
        : E.panel === 'layouts' ? C.layoutsPanel.html(E) : E.panel === 'book' ? C.bookData.html(E) : C.text.panelHtml(E);
    });
    if (E.panel === 'layouts') C.layoutsPanel.paint(p, E);
    p.scrollTop = top;
  }
  /** The tool rail: Text, Shapes or Layers (the design's showPanel). */
  function showPanel(k) {
    if (!PANEL_LABEL[k]) return;
    E.panel = k; E.layerMenu = null; E.renaming = null;
    if (k !== 'images') E.replaceId = null;
    const t = E.root.querySelector('[data-tools]');
    keepFocus(t, () => { t.innerHTML = toolsHtml(); });
    E.root.querySelector('[data-panel]').scrollTop = 0;
    renderPanel(); renderMenu();
    if (k === 'shapes') openIcons();
    if (k === 'images') C.images.loadUploads(E);
    if (k === 'layouts') loadLayoutFonts();
  }
  /** The icon set loads the first time the Shapes panel opens. */
  function openIcons() {
    if (C.iconSet) { E.icons = 'ready'; renderPanel(); return; }
    const me = E;
    E.icons = 'loading'; renderPanel();
    C.shapesUi.loadIcons().then(() => { if (me === E) { E.icons = 'ready'; if (E.panel === 'shapes') renderPanel(); } },
      () => { if (me === E) { E.icons = 'error'; if (E.panel === 'shapes') renderPanel(); } });
  }
  /** Part 7: the wide stock picker over the panel and the cover (design 63). */
  function renderStock() {
    const host = E.root.querySelector('[data-stock-host]');
    if (!host) return;
    // the results keep their scroll place over a redraw (a filter, a pick starting, More results)
    const body = host.querySelector('[data-sd-body]'), top = body ? body.scrollTop : 0;
    keepFocus(host, () => { host.innerHTML = C.stock.hostHtml(E); });
    const nb = host.querySelector('[data-sd-body]');
    if (nb && body) nb.scrollTop = top;
  }
  /** The Layers panel's ⋮ menu, to the right of the panel (design 66). */
  function renderMenu() {
    const host = E.root.querySelector('[data-lmenu-host]');
    if (!host) return;
    host.innerHTML = E.panel === 'layers' ? C.layersPanel.menuHtml(E) : '';
  }

  function viewBarHtml() {
    const items = C.checks.run(E.cover, checkOpt());
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
    const l = selLayer();
    const kind = E.multi.length > 1 ? 'multi' : l && l.type === 'text' ? 'text' : l && l.type === 'shape' ? 'shape' : l && l.type === 'image' ? 'image' : null;
    const html = kind === 'multi' ? C.multi.barHtml(E) : kind === 'text' ? C.text.barHtml(E) : kind === 'shape' ? C.shapesUi.barHtml(E) : kind === 'image' ? C.images.barHtml(E) : '';
    // A popover drawn again keeps where it was scrolled (Text effects is taller than a small window).
    const scrolled = [...tb.querySelectorAll('.cv-pop, .cv-fx-tiles')].map((n) => [[...n.classList].find((c) => /^cv-(pop-|fx-tiles)/.test(c)), n.scrollTop, n.scrollLeft]);
    keepFocus(tb, () => { tb.innerHTML = html; });
    tb.hidden = !html;
    tb.setAttribute('aria-label', kind === 'multi' ? 'Several layers selected' : kind === 'shape' ? 'Selected shape' : kind === 'image' ? (E.cropping === E.sel ? 'Crop the picture' : 'Selected image') : 'Selected text');
    const pk = E.root.querySelector('[data-picker]');
    if (pk) C.picker.bind(pk, E.pk, pickerApi());
    if (E.menu === 'effects') C.effects.paintTiles(tb);
    clampPops();
    for (const [cls, top, left] of scrolled) { const n = cls && tb.querySelector('.' + cls); if (n) { n.scrollTop = top; n.scrollLeft = left; } }
    renderMenu();
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
      // A tall popover (Text effects, Fill, Border) stays inside the window height too; it scrolls inside.
      const room = root.innerHeight - r.top - 12;
      if (r.bottom > root.innerHeight - 8 && room > 160) { pop.style.maxHeight = room + 'px'; pop.style.overflowY = 'auto'; }
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
    if (layers === prev.layers && bg === prev.bg) return false;
    // The caps 0030 checks (200 layers, 512 KB): a change that adds layers past them is refused here with a plain
    // note, so a save never fails on them (its Retry could never pass).
    if (layers.length > prev.layers.length) {
      const f = C.model.fits({ layers });
      if (!f.ok) { capNote(f.reason); return false; }
    }
    if (E.capMsg) capNote(null);
    // Part 8: the layout note's Undo is for the layout only: any later change closes it (replaceAll shows its own after).
    if (E.toast && !act) hideToast(false);
    E.hist.change(prev, act || null);
    E.cover = Object.assign({}, E.cover, { layers, bg });
    E.saver.changed();
    afterChange(act, opt);
    return true;
  }
  /** The "cover is full" note (a warning with its icon and words), or none. */
  function capNote(reason) {
    E.capMsg = reason === 'layers' ? `The cover is full: it holds ${C.model.CAPS.layers} layers at most. Delete a layer, then add again.`
      : reason ? 'The cover is full: its layers hold 512 KB of drawing at most. Delete a layer, then add again.' : null;
    const n = E.root.querySelector('[data-capnote]'); if (!n) return;
    n.hidden = !E.capMsg;
    n.innerHTML = E.capMsg ? `${ICON.warn}<span>${esc(E.capMsg)}</span><button type="button" class="cv-x" data-k="cap-x" data-cap-x aria-label="Close">×</button>` : '';
  }
  /** opt: bars, panel, overlay (false: draw the canvas and move the frame only, e.g. while typing or on a slider). */
  function afterChange(act, opt) {
    const o = opt || {};
    // Crop mode ends when its picture is locked, hidden or gone (from the Layers panel or the ⋮ menu too).
    if (E.cropping != null) { const c = E.cover.layers.find((l) => l.id === E.cropping); if (!c || c.lock || c.hidden) { E.cropping = null; if (!act) o.bars = true; } }
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
  /** A whole new layer list (align, distribute, reorder, several at once). act: a drag in progress. */
  function commitLayers(layers, act) {
    if (layers.length > E.cover.layers.length && !C.model.fits({ layers }).ok) return commit(layers, E.cover.bg, act || null);   // refused: the note shows
    const ids = layers.map((l) => l.id);
    E.multi = E.multi.filter((id) => ids.includes(id));
    if (E.sel != null && !ids.includes(E.sel)) E.sel = null;
    return commit(layers, E.cover.bg, act || null);
  }
  const setLayer = (id, patch) => patchLayer(id, patch, null);
  /** The ids the bar and the keys act on: several, or the one selected. */
  const selIds = () => (E.multi.length ? E.multi.slice() : E.sel != null ? [E.sel] : []);
  function nudgeSel(dx, dy, shift) {
    const ids = selIds(); if (!ids.length) return;
    commit(C.model.nudge(E.cover.layers, ids, dx, dy, shift), E.cover.bg, null, { panel: false });
  }

  async function addShape(kind) {
    const L = Object.assign({ id: C.model.nextId(E.cover.layers) }, C.shapes.defaults(kind, C.geo.geo(E.cover.fmt)), C.model.common());
    addLayer(C.model.shapeLayer(L.id, L));
  }
  function addIcon(row) {
    const id = C.model.nextId(E.cover.layers);
    addLayer(C.model.shapeLayer(id, Object.assign({}, C.shapes.iconDefaults(row, C.geo.geo(E.cover.fmt)), C.model.common())));
  }

  function addLayer(L) {
    if (!commit(E.cover.layers.concat([L]), E.cover.bg, null, { bars: false })) return;
    E.sel = L.id; E.multi = []; E.editing = null; E.menu = null; E.cropping = null;
    C.images.ensure(E, L);
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
  function arrangeId(id, mode) { commit(C.model.arrange(E.cover.layers, id, mode, textH), E.cover.bg, null); }
  function duplicate() {
    const l = selLayer(); if (!l) return;
    dupId(l.id);
  }
  /** The design's dupId: the copy just above, 14 px down and right, selected. */
  function dupId(id) {
    const r = C.model.dup(E.cover.layers, id, C.model.nextId(E.cover.layers));
    if (!C.model.fits({ layers: r.layers }).ok) { commit(r.layers, E.cover.bg, null); return; }   // refused: the note shows
    E.sel = r.sel; E.multi = []; E.layerMenu = null; E.menu = null; E.cropping = null;
    commit(r.layers, E.cover.bg, null);
  }
  function removeSel() { removeIds(selIds()); }
  function removeIds(ids) {
    if (!ids.length) return;
    E.sel = null; E.multi = []; E.editing = null; E.menu = null; E.layerMenu = null; E.renaming = null; E.cropping = null;
    if (ids.includes(E.replaceId)) E.replaceId = null;
    commit(C.model.remove(E.cover.layers, ids), E.cover.bg, null);
    E.view_.sync(); renderBars();
    const c = E.root.querySelector('[data-canvas]');
    if (document.activeElement === document.body) { const first = E.root.querySelector('[data-hit]'); (first || c).focus && (first || c).focus({ preventScroll: true }); }
  }

  function select(id, opt) {
    if (E.sel === id && !E.multi.length) return;
    if (E.editing != null && E.editing !== id) stopEdit(false);
    E.sel = id; E.multi = []; E.menu = null; E.fontScrolled = false; E.fontErr = null;
    if (E.cropping != null && E.cropping !== id) E.cropping = null;
    E.view_.sync();
    renderBars(); syncPanelSel();
    if (opt && opt.keepFocus && id != null) {
      const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`);
      if (hit) hit.focus({ preventScroll: true });
    }
  }
  const selLayer = () => (E && E.cover ? E.cover.layers.find((l) => l.id === E.sel) || null : null);
  /** The design's selectIds: one id → that layer; two or more → several (no single selection). */
  function selectIds(ids) {
    const list = [...new Set(ids)].filter((id) => E.cover.layers.some((l) => l.id === id));
    if (E.editing != null) stopEdit(false);
    if (list.length === 1) { E.sel = list[0]; E.multi = []; }
    else { E.sel = null; E.multi = list.length > 1 ? list : []; }
    if (E.cropping != null && E.cropping !== E.sel) E.cropping = null;
    E.menu = null; E.fontScrolled = false; E.fontErr = null;
    E.view_.sync(); renderBars(); syncPanelSel();
  }
  /** The Layers rows follow the selection in place; other panels do not show it. */
  function syncPanelSel() {
    if (E.panel === 'layers' && E.renaming == null && !E.layerMenu) C.layersPanel.syncSel(E.root.querySelector('[data-panel]'), E);
    else if (E.panel === 'layers') renderPanel();
  }
  /** Shift- or Cmd-click: add or take away one layer. */
  function toggleSel(id) {
    const cur = selIds(), i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1); else cur.push(id);
    selectIds(cur);
  }

  /* ── Layers panel actions ── */
  function startRename(id) {
    if (E.panel !== 'layers') showPanel('layers');
    E.renaming = id; E.layerMenu = null;
    renderPanel(); renderMenu();
    const n = E.root.querySelector(`[data-rename="${CSS.escape(String(id))}"]`);
    if (n) { n.focus({ preventScroll: true }); n.select(); }
  }
  /** value: the new name (empty: back to the automatic name), null: keep the old one. */
  function endRename(value, refocus) {
    const id = E.renaming; if (id == null) return;
    E.renaming = null;
    const l = E.cover.layers.find((x) => x.id === id);
    if (l && value != null) {
      const v = String(value).replace(/\s+/g, ' ').trim().slice(0, C.model.CAPS.label);
      const auto = C.names.layerName(Object.assign({}, l, { label: null }));
      const label = v && v !== auto ? v : undefined;
      if (label !== l.label) {
        const layers = E.cover.layers.map((x) => { if (x.id !== id) return x; const y = Object.assign({}, x); if (label) y.label = label; else delete y.label; return y; });
        commit(layers, E.cover.bg, null);
      } else renderPanel();
    } else renderPanel();
    if (refocus) { const n = E.root.querySelector(`[data-pick="${CSS.escape(String(id))}"]`); if (n) n.focus({ preventScroll: true }); }
  }
  /** The ⋮ menu opens to the right of the Layers panel, above everything (design 66: button right + 22 px). */
  function openLayerMenu(id, btn) {
    if (E.layerMenu && E.layerMenu.id === id) { closeLayerMenu(true); return; }
    const R = E.root.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const h = 430, y = Math.max(8, Math.min(R.height - h - 8, b.top - R.top - 8));
    E.layerMenu = { id, x: Math.round(b.right - R.left + 22), y: Math.round(y) };
    E.menu = null;
    renderBars(); renderPanel();
    const f = E.root.querySelector('[data-lmenu-pop] [role="menuitem"]'); if (f) f.focus({ preventScroll: true });
  }
  function closeLayerMenu(refocus) {
    const m = E.layerMenu; if (!m) return;
    E.layerMenu = null;
    renderMenu(); renderPanel();
    if (refocus) { const b = E.root.querySelector(`[data-lmenu="${CSS.escape(String(m.id))}"]`); if (b) b.focus({ preventScroll: true }); }
  }

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

  /* ── Crop mode (design 62: cropping) ── */
  function startCrop(id) {
    const l = E.cover.layers.find((x) => x.id === id);
    if (!l || l.type !== 'image' || l.lock) return;
    if (E.editing != null) stopEdit(false);
    E.sel = id; E.multi = []; E.menu = null; E.cropping = id;
    E.view_.sync(); renderBars();
    const b = E.root.querySelector('.cv-textbar [data-k="crop-zoom"]'); if (b) b.focus({ preventScroll: true });
  }
  function endCrop(refocus) {
    if (E.cropping == null) return;
    E.cropping = null;
    E.view_.sync(); renderBars();
    if (refocus) { const b = E.root.querySelector('.cv-textbar [data-k="crop"]'); if (b) b.focus({ preventScroll: true }); }
  }
  /** Arrow keys in crop mode move the picture inside its box (the design's drag of the picture). */
  function movePic(dx, dy) {
    const l = selLayer(); if (!l || l.type !== 'image') return;
    const r = (l.rot || 0) * Math.PI / 180;
    const lx = dx * Math.cos(r) + dy * Math.sin(r), ly = -dx * Math.sin(r) + dy * Math.cos(r);
    const c = C.model.clampPic(Object.assign({}, l, { px: l.px + lx, py: l.py + ly }));
    patchLayer(l.id, { px: c.px, py: c.py }, null, { panel: false });
  }

  function undo() { const s = E.hist.undo({ layers: E.cover.layers, bg: E.cover.bg }); if (s) restore(s); }
  function redo() { const s = E.hist.redo({ layers: E.cover.layers, bg: E.cover.bg }); if (s) restore(s); }
  function restore(s) {
    E.cover = Object.assign({}, E.cover, { layers: s.layers, bg: s.bg });
    const k = C.history.keepSelection(s, E.sel, E.multi);
    E.sel = k.sel; E.multi = k.multi.length > 1 ? k.multi : []; E.editing = null; E.cropping = null;
    for (const l of s.layers) C.images.ensure(E, l);
    E.saver.changed();
    afterChange(null);
  }

  /* ── Part 8: layouts, series colors, book data (designs 67, 68) ── */
  /** The book's own words for the layouts (layouts.js book). */
  const layoutBook = () => ({ title: bookWords('title'), subtitle: bookWords('subtitle'), pen: bookWords('pen') });
  /** The blurb a layout carries: the cover's own (not the placeholder), else the newest saved version, else none (the placeholder). */
  function currentBlurb() {
    const real = C.bookData.realBlurb(E.cover.layers);
    if (real) return real.text;
    return E.data && E.data.blurb && E.data.blurb.body ? E.data.blurb.body : null;
  }
  const bioText = () => String((E && E.data && E.data.book && E.data.book.bio_text) || '').trim();

  /** The 12 layouts' faces, loaded when the Layouts panel opens; the small covers are drawn once they are in. */
  function loadLayoutFonts() {
    if (E.lay.fonts || E.lay.fontLoad) return;
    const me = E;
    E.lay.fontLoad = Promise.all(C.layoutsPanel.FONTS.map(([f, w]) => C.fonts.load(f, C.fonts.snap(f, w) || w)))
      .then(() => { if (me === E) { E.lay.fonts = true; if (E.panel === 'layouts') renderPanel(); } })
      .catch(() => { if (me === E) E.lay.fontLoad = null; });   // the small covers stay plain; opening the panel again tries again
  }

  /**
   * One layout (ready or My) in place of the cover: one Undo step of its own (the toast's Undo takes back
   * only this), the pressed layout saved with the design, the selection cleared.
   */
  function replaceAll(r, layoutKey, text) {
    const prevLayout = E.cover.layout == null ? null : E.cover.layout;
    if (E.editing != null) stopEdit(false);
    E.sel = null; E.multi = []; E.cropping = null; E.menu = null; E.replaceId = null; E.layerMenu = null;
    E.cover.layout = layoutKey;
    E.hist.step();
    if (!commit(r.layers, r.bg, null)) { E.cover.layout = prevLayout; renderPanel(); return; }
    E.hist.step();
    for (const l of r.layers) C.images.ensure(E, l);
    E.view_.sync(); renderBars();
    if (text) showToast(text, prevLayout); else hideToast(false);
  }

  /** A ready layout (or Blank) at once (design applyLayout); the note offers Undo when it replaced layers. */
  async function applyLayout(key) {
    if (E.lay.busy || !C.layouts.KEYS.includes(key)) return;
    const me = E;
    const r = C.layouts.build(key, layoutBook(), E.cover.fmt, C.model.nextId(E.cover.layers), currentBlurb());
    E.lay.busy = key; E.lay.err = ''; renderPanel();
    try { await C.fonts.loadAll(r.layers); } catch (e) {
      if (me !== E) return;
      E.lay.busy = null; E.lay.err = 'We couldn’t load the fonts of this layout. Check your connection, then try again.'; renderPanel();
      return;
    }
    if (me !== E) return;
    E.lay.busy = null;
    const had = E.cover.layers.length > 0;
    const name = (C.layouts.LIST.find((x) => x[0] === key) || ['', 'Layout'])[1];
    replaceAll(r, key, had ? `${name} applied. Your old design is one Undo away.` : null);
  }

  /** A My layout on this book (design applyMy): its layers remapped, this book's words (plan D2), its own photos. */
  async function applyMy(id) {
    const m = (E.my || []).find((x) => x.id === id);
    if (E.lay.busy || !m) return;
    const me = E;
    E.lay.busy = 'my:' + id; E.lay.err = ''; renderPanel();
    let res;
    try { res = await root.kdp.getMyLayout(id); } catch (e) { res = { error: e }; }
    if (me !== E) return;
    const fail = (msg) => { E.lay.busy = null; E.lay.err = msg; renderPanel(); };
    if (res.error || !res.data) { fail('We couldn’t open this layout. Check your connection, then try again.'); return; }
    const r = C.layouts.applyMy(res.data, layoutBook(), E.cover.fmt, C.model.nextId(E.cover.layers), currentBlurb());
    // Its photos are in Uploads: read the list first, so they load (and a removed one shows as missing, C15).
    if (r.layers.some((l) => l.type === 'image' && l.asset) && !Array.isArray(E.uploads)) await C.images.loadUploads(E, true);
    try { await C.fonts.loadAll(r.layers); } catch (e) {
      if (me === E) fail('We couldn’t load the fonts of this layout. Check your connection, then try again.');
      return;
    }
    if (me !== E) return;
    E.lay.busy = null;
    const had = E.cover.layers.length > 0;
    replaceAll(r, 'my:' + id, `"${m.name}" applied with this book’s title, subtitle and pen name.${had ? ' Undo brings back what you had.' : ''}`);
  }

  /** The × on a My layout (design: at once, no question; the design file stays as it is). */
  async function removeMy(id) {
    const i = (E.my || []).findIndex((x) => x.id === id);
    if (i < 0 || E.lay.busy) return;
    const me = E;
    let res;
    try { res = await root.kdp.removeMyLayout(id); } catch (e) { res = { error: e }; }
    if (me !== E) return;
    if (res && res.error && !res.error.notFound) { E.lay.err = 'We couldn’t remove this layout. Check your connection, then try again.'; renderPanel(); return; }
    E.lay.err = '';
    E.my = E.my.filter((x) => x.id !== id);
    renderPanel();
    // Focus goes to the next row's ×, else the previous one, else the first ready layout.
    const p = E.root.querySelector('[data-panel]');
    const xs = p.querySelectorAll('[data-my-x]');
    const n = xs[Math.min(i, xs.length - 1)] || p.querySelector('[data-lay]');
    if (n) n.focus({ preventScroll: true });
  }

  /** Series colors (design swapPalette): one Undo step; the layout stays pressed. */
  function swapPalette(i) {
    const row = C.palettes.PALETTES[i]; if (!row) return;
    const r = C.palettes.swap(E.cover.layers, E.cover.bg, row[1]);
    const same = r.bg === E.cover.bg && r.layers.every((l, j) => JSON.stringify(l) === JSON.stringify(E.cover.layers[j]));
    if (same) return;
    E.hist.step();
    commit(r.layers, r.bg, null);
    E.hist.step();
  }

  /** Book data, Add all to the cover: the title, subtitle and pen name that are not on it yet, selected together. */
  async function addAllBook() {
    const keys = ['title', 'subtitle', 'pen'].filter((k) => !E.cover.layers.some((l) => l.src === k) && bookWords(k));
    if (!keys.length) return;
    const me = E, weights = {};
    for (const k of keys) {
      const S = C.model.BOOK_STYLE[k];
      const w = await withFace(S.font, S.weight);
      if (me !== E || w == null) return;
      weights[k] = w;
    }
    const keep = keys.filter((k) => !E.cover.layers.some((l) => l.src === k));
    if (!keep.length) return;
    const g = C.geo.geo(E.cover.fmt);
    let id = C.model.nextId(E.cover.layers);
    const add = keep.map((k) => { const L = C.model.newBookText(k, bookWords(k), g, id++); L.weight = weights[k]; return L; });
    if (!commit(E.cover.layers.concat(add), E.cover.bg, null, { bars: false })) return;
    selectIds(add.map((a) => a.id));
  }

  /** Book data, Add spine text (the full title and the pen name, plan D13): only on a thick enough book. */
  async function addSpine() {
    if (E.cover.layers.some((l) => l.src === 'spine') || !C.geo.geo(E.cover.fmt).spineTextOk) return;
    const me = E;
    const w = await withFace('IBM Plex Sans', 600);
    if (me !== E || w == null) return;
    const L = C.layouts.spineLayer(C.model.nextId(E.cover.layers), E.cover.fmt, layoutBook());
    if (L) addLayer(L);
  }

  /* ── The note with Undo (design toast, 6 s) ── */
  function renderToast() {
    const host = E.root.querySelector('[data-toast-host]'); if (!host) return;
    const t = E.toast;
    keepFocus(host, () => {
      host.innerHTML = t ? `<div class="cv-toast" role="status"><span>${esc(t.text)}</span>
        <button type="button" class="cv-toast-undo" data-k="toast-undo" data-toast-undo>Undo</button>
        <button type="button" class="cv-toast-x" data-k="toast-x" data-toast-x aria-label="Close">×</button></div>` : '';
    });
  }
  function showToast(text, prevLayout) {
    if (E.toast) clearTimeout(E.toast.timer);
    const me = E;
    E.toast = { text, prevLayout, timer: setTimeout(() => { if (me === E && E.toast) hideToast(false); }, TOAST_MS) };
    renderToast();
  }
  function hideToast(refocus) {
    if (!E.toast) return;
    clearTimeout(E.toast.timer);
    const had = E.root.querySelector('[data-toast-host]').contains(document.activeElement);
    E.toast = null; renderToast();
    if (refocus || had) { const c = E.root.querySelector('[data-canvas]'); if (c) c.focus({ preventScroll: true }); }
  }
  /** Undo from the note: the layout's step, and the pressed layout as it was. */
  function toastUndo() {
    const t = E.toast; if (!t) return;
    hideToast(true);
    undo();
    E.cover.layout = t.prevLayout;
    E.saver.changed();
    renderPanel();
  }

  /* ── The back blurb dialog (design 68) ── */
  function renderBlurb() {
    const host = E.root.querySelector('[data-blurb-host]'); if (!host) return;
    const ta = host.querySelector('[data-bl-text]'), caret = ta && document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd] : null;
    const scroll = ta ? ta.scrollTop : 0;
    keepFocus(host, () => { host.innerHTML = C.blurb.hostHtml(E); });
    const nt = host.querySelector('[data-bl-text]');
    if (nt) { nt.scrollTop = scroll; if (caret) try { nt.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ } }
  }
  /** opener: the button that opened it (focus goes back there); opt.author: tick the author line (Text panel, Author line). */
  function openBlurb(opener, opt) {
    const prev = E.blurb, real = C.bookData.realBlurb(E.cover.layers);
    const draft = real ? real.text : E.data && E.data.blurb && E.data.blurb.body ? E.data.blurb.body : '';
    const bio = !!bioText();
    E.blurb = {
      open: true, len: prev ? prev.len : 'medium', tone: prev ? prev.tone : 'warm',
      author: bio && (opt && opt.author != null ? !!opt.author : prev ? prev.author : true),
      draft, shown: !!draft, aiText: null, unsourced: [], busy: false, err: '', saving: false, saveErr: '', seq: 0,
      opener: opener && opener.getAttribute ? opener.getAttribute('data-k') : null
    };
    E.menu = null; renderBars();
    renderBlurb();
    const f = E.root.querySelector('[data-blurb-host] .cv-bl-seg.is-on');
    if (f) f.focus({ preventScroll: true });
  }
  function closeBlurb() {
    const B = E.blurb; if (!B || !B.open) return;
    B.open = false; B.seq++;   // a reply that comes after this is let go (the server still counts a finished call)
    renderBlurb();
    const o = B.opener && E.root.querySelector(`[data-k="${CSS.escape(B.opener)}"]`);
    if (o) o.focus({ preventScroll: true });
  }
  async function writeBlurb() {
    const B = E.blurb; if (!B || !B.open || B.busy) return;
    const me = E, seq = ++B.seq;
    B.busy = true; B.err = ''; B.saveErr = '';
    renderBlurb();
    let res;
    try { res = await root.kdp.generate({ stage: 'cover_blurb', bookId: book.id, length: B.len, tone: B.tone, authorLine: !!(B.author && bioText()) }); } catch (e) { res = { error: { code: 'network' } }; }
    if (me !== E || E.blurb !== B || !B.open || seq !== B.seq) return;
    B.busy = false;
    if (res.error || !res.data || typeof res.data.blurb !== 'string' || !res.data.blurb.trim()) {
      B.err = C.blurb.errorText(res.error || {});
      renderBlurb();
      const w = E.root.querySelector('[data-blurb-host] [data-bl-write]'); if (w) w.focus({ preventScroll: true });
      return;
    }
    B.draft = res.data.blurb; B.aiText = res.data.blurb; B.shown = true;
    B.unsourced = Array.isArray(res.data.unsourced) ? res.data.unsourced.filter((x) => typeof x === 'string') : [];
    renderBlurb();
    const t = E.root.querySelector('[data-blurb-host] [data-bl-text]'); if (t) t.focus({ preventScroll: true });
  }
  /**
   * Put on the back cover: the version is saved first (0029 cover_blurbs; 'ai' when the AI's draft goes on
   * unchanged, else 'manual'); only then the one blurb layer gets the words (or a new one is placed, from the
   * layouts' 6 × 9 place, remapped). A failed save keeps the dialog open and the cover as it was.
   */
  async function putBlurb() {
    const B = E.blurb; if (!B || !B.open || B.busy || B.saving) return;
    const body = B.draft.trim();
    if (!body || C.blurb.fit(body).key === 'long') return;
    const me = E;
    B.saving = true; B.saveErr = ''; renderBlurb();
    const ex = E.cover.layers.find((l) => l.src === 'blurb');
    const w = ex ? ex.weight : await withFace('IBM Plex Sans', 400);
    if (me !== E || E.blurb !== B) return;
    if (w == null) { B.saving = false; B.saveErr = 'We couldn’t load the blurb’s font. Check your connection, then try again.'; renderBlurb(); return; }
    const source = B.aiText != null && body === B.aiText.trim() ? 'ai' : 'manual';
    let res;
    try { res = await root.kdp.addCoverBlurb(book.id, body, source); } catch (e) { res = { error: e }; }
    if (me !== E || E.blurb !== B) return;
    B.saving = false;
    if (res.error || !res.data) { B.saveErr = 'We couldn’t save the blurb. Check your connection, then try again. Your cover did not change.'; renderBlurb(); return; }
    E.data.blurb = res.data;
    B.open = false; B.seq++;
    renderBlurb();
    if (E.editing != null) stopEdit(false);
    E.hist.step();
    let id;
    if (ex) { id = ex.id; E.sel = id; E.multi = []; E.cropping = null; patchLayer(id, { text: body.slice(0, C.model.CAPS.text) }); }
    else {
      const L0 = C.model.textLayer(C.model.nextId(E.cover.layers), { src: 'blurb', text: body, x: 60, y: 120, w: 310, font: 'IBM Plex Sans', size: 11, weight: w, align: 'left', color: '#1C1C1A' });
      const L = C.remap.remap([L0], C.geo.geo(C.layouts.AUTHORED), C.geo.geo(E.cover.fmt)).layers[0];
      id = L.id;
      addLayer(L);
    }
    E.hist.step();
    E.view_.sync(); renderBars(); renderPanel();
    const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`); if (hit) hit.focus({ preventScroll: true });
  }

  /* ── Menus and the picker ── */
  function closeMenus() {
    let changed = false;
    if (E.menu) { E.menu = null; E.fxSnap = null; changed = true; }
    if (E.layerMenu) { E.layerMenu = null; renderPanel(); changed = true; }
    if (changed) renderBars();
  }
  function toggleMenu(m) {
    E.menu = E.menu === m ? null : m;
    E.layerMenu = null;
    const l = selLayer();
    if (E.menu === 'color' || E.menu === 'bg') openPicker(E.menu === 'bg' ? 'bg' : 'color');
    if (E.menu === 'effects' && l) { E.fxSnap = { id: l.id, fx: l.fx, curve: l.curve, dist: l.dist }; openPicker('fxcolor'); }
    if (E.menu === 'sfill' && l) openPicker(E.pk.target === 'fill2' && l.fillMode === 'grad' ? 'fill2' : 'fill');
    if (E.menu === 'stroke') openPicker('scolor');
    if (E.menu === 'iborder') openPicker('bcolor');
    if (E.menu !== 'effects') E.fxSnap = null;
    if (E.menu === 'fonts') E.fontScrolled = false;
    renderBars(); if (E.panel === 'layers') renderPanel();
    const pop = E.root.querySelector('.cv-pop:not(.cv-tplpop)');
    if (pop) { const f = pop.querySelector('.cv-fx-tile.is-on, [data-font-q], [data-pk-sv], input, button[role="menuitem"], .cv-segb.is-on, .cv-swap.is-on'); if (f) f.focus({ preventScroll: true }); }
  }
  /** Text effects OK (keep) or Cancel (back to { fx, curve, dist } from when the popover opened). */
  function fxDone(keep) {
    const sn = E.fxSnap;
    E.menu = null; E.fxSnap = null;
    if (!keep && sn && E.cover.layers.some((l) => l.id === sn.id)) patchLayer(sn.id, { fx: sn.fx, curve: sn.curve, dist: sn.dist });
    else renderBars();
    E.view_.sync();
    const b = E.root.querySelector('[data-k="fx"]'); if (b) b.focus({ preventScroll: true });
  }
  function toggleTpl(on) {
    E.tpl.pop = on == null ? !E.tpl.pop : on;
    E.view_.sync(); renderBars();
    if (E.tpl.pop) { const r = E.root.querySelector('[data-tpl-op]'); if (r) r.focus({ preventScroll: true }); }
    else { const b = E.root.querySelector('[data-k="tpl"]'); if (b) b.focus({ preventScroll: true }); }
  }
  /** The color of a picker target: text color, effect color, fill, gradient end, border, or the background. */
  function colorOf(t) {
    if (t === 'bg') return E.cover.bg;
    const l = selLayer(); if (!l) return '#1C1C1A';
    if (t === 'fxcolor') return l.fx ? l.fx.color : '#1C1C1A';
    return l[t] || '#1C1C1A';
  }
  function openPicker(t, hex) {
    const v = hex || colorOf(t), hsv = C.picker.hexToHsv(v);
    Object.assign(E.pk, { target: t, hexDraft: v, sat: hsv.sat, val: hsv.val, hue: hsv.sat > 0 ? hsv.hue : E.pk.hue });
  }
  function applyColor(hex) {
    const o = { bars: false, panel: false, overlay: false };
    const t = E.pk.target;
    if (t === 'bg') { commit(E.cover.layers, hex, null, o); E.view_.sync(); if (E.panel === 'layers') renderPanel(); return; }
    const l = selLayer(); if (!l) return;
    if (t === 'fxcolor') patchLayer(l.id, { fx: Object.assign({}, l.fx, { color: hex }) }, null, o);
    else patchLayer(l.id, { [t]: hex }, null, o);
  }
  /** While the square or the hue slider is dragged, the picker is updated in place (drawing it again would end the drag). */
  function updatePicker(hex) {
    const pk = E.root.querySelector('[data-picker]');
    if (pk) C.picker.update(pk, E.pk, hex);
    const t = E.pk.target;
    const b = E.root.querySelector(`.cv-viewbar [data-k="${PK_BTN[t]}"], .cv-textbar [data-k="${PK_BTN[t]}"]`);
    if (!b || t === 'fxcolor') return;
    if (t === 'scolor') { const ic = b.querySelector('.cv-strokeic'); if (ic) ic.style.setProperty('--sw', hex); return; }
    const sw = b.querySelector('.cv-swatch');
    if (sw) sw.style.setProperty(t === 'fill2' ? '--sw2' : '--sw', hex);
    if (t === 'color') { const m = b.querySelector('.cv-mono'); if (m) m.textContent = hex; b.setAttribute('aria-label', `Text color ${hex}`); }
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
      close() { const m = E.menu; E.menu = null; renderBars(); const b = E.root.querySelector(`[data-k="${MENU_BTN[m] || 'color'}"]`); if (b) b.focus({ preventScroll: true }); }
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
      // Part 8: while the blurb dialog is open the cover's keys rest; Escape closes it.
      if (E.blurb && E.blurb.open) { if (k === 'Escape') { e.preventDefault(); closeBlurb(); } return; }
      if (k === 'Escape') {
        if (C.stock.escape(E)) return;   // Part 7: the wide picker (its preview first)
        if (E.layerMenu) { closeLayerMenu(true); return; }
        if (E.menu) { const m = E.menu; E.menu = null; E.fxSnap = null; renderBars(); E.view_.sync(); const b = E.root.querySelector(`[data-k="${MENU_BTN[m]}"]`); if (b) b.focus({ preventScroll: true }); return; }
        if (E.tpl.pop && t && t.closest && t.closest('[data-tplpop]')) { toggleTpl(false); return; }
        if (E.cropping != null) { endCrop(true); return; }   // also from the Zoom slider of the crop bar
        if (E.multi.length && !(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT'))) { selectIds([]); return; }
        if (E.sel != null && !(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT'))) { const id = E.sel; select(null); const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(id))}"]`); if (hit) hit.focus({ preventScroll: true }); }
        return;
      }
      // Part 7: inside the wide picker the cover's keys (undo, select all, delete, arrows) do nothing.
      if (t && t.closest && t.closest('[data-stockdlg]')) return;
      // Undo and redo also work from a slider or a check box (the crop Zoom, Adjust); typing fields keep their own.
      const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type)));
      if (typing || (t && t.tagName === 'INPUT' && !(mod && /^[zZyY]$/.test(k)))) return;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (t && t.closest && t.closest('[data-handle]')) return;   // view.js: arrows resize with a handle focused
      if (mod && (k === 'a' || k === 'A') && !(t && t.closest && t.closest('.cv-textbar, .cv-viewbar'))) { e.preventDefault(); selectIds(C.model.selectAll(E.cover.layers)); return; }
      if ((k === 'Delete' || k === 'Backspace') && selIds().length && (!t || !t.closest || !t.closest('.cv-viewbar, .cv-textbar, .cv-tools'))) { e.preventDefault(); removeSel(); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d && selIds().length && (!t || !t.closest || !t.closest('.cv-viewbar, .cv-textbar, .cv-panel, .cv-tools'))) {
        e.preventDefault();
        if (E.cropping != null && E.cropping === E.sel) movePic(d[0] * (e.shiftKey ? 10 : 1), d[1] * (e.shiftKey ? 10 : 1));
        else nudgeSel(d[0], d[1], e.shiftKey);
        keepFocusHit();
      }
    });
    // Paste a picture (Cmd or Ctrl + V) while 09 is open (design onPaste).
    document.addEventListener('paste', (e) => {
      if (!E || E.status !== 'ready' || !ctx.isActive(STEP) || !E.root.isConnected) return;
      if (E.blurb && E.blurb.open) return;   // Part 8: a paste into the blurb draft is text
      C.images.onPaste(E, e);
    });
    // A press outside the Layers ⋮ menu closes it (as a click on the gray does for the bar popovers).
    document.addEventListener('pointerdown', (e) => {
      if (!E || E.status !== 'ready' || !E.layerMenu || !ctx.isActive(STEP)) return;
      if (e.target.closest && e.target.closest('[data-lmenu-pop], [data-lmenu]')) return;
      closeLayerMenu(false);
    }, true);
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
      // Part 5
      commitLayers, setLayer, selIds, selectIds, toggleSel, nudgeSel, removeIds, dupId, arrangeId, addShape, addIcon, openIcons, showPanel,
      startRename, endRename, openLayerMenu, closeLayerMenu, fxDone,
      // Part 6
      addLayer, startCrop, endCrop, movePic, gate: () => ctx.setGate(),
      // Part 8
      applyLayout, applyMy, removeMy, swapPalette, addAllBook, addSpine, openBlurb, closeBlurb, writeBlurb, putBlurb, bioText,
      refreshBlurb: renderBlurb,
      pickerTo(t, hex) { openPicker(t, hex); },
      refreshPanel: renderPanel,
      refreshStock: renderStock,
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
      const n = C.checks.run(E.cover, checkOpt()).filter((c) => c.sev === 'error').length;
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
