/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: pictures (E16 Part 6, plan §3 "Images", design 62)
   /js/cover/images.js   (browser; needs model, geo, picker, image-prep, js/supabase.js)

   The Images panel (Uploads; the Pixabay and Unsplash tabs are js/cover/stock.js, Part 7):
   the rights tick first, Upload image (JPG or PNG up to 10 MB and 12,000 px
   a side, stored as sent), Upload PDF (up to 25 MB; one page is drawn by
   pdf.js 6.4.299 as a 300 DPI picture and stored as a JPEG), Paste from
   clipboard, and Cmd/Ctrl+V on the cover. YOUR UPLOADS lists every picture
   of the user (cover_assets, per user); a tile adds it, or replaces the
   selected picture after Replace.

   The picture bar of design 62: Replace, Crop, Fill (front, back, whole),
   Adjust (brightness, contrast, saturation, blur, darken, black and white,
   sepia), Border (pt, follows the mask), Mask (none, rounded, circle,
   arch), Opacity, flip left to right, the DPI badge, Arrange, duplicate,
   lock, More (rotation, flip top to bottom, exclude from export), delete.
   Crop mode (the design's cropping): the bar shows Zoom 100 to 300 %, the
   DPI, Reset and Done; js/cover/view.js draws the 4 bars, the 4 corners and
   the whole picture faded behind the box.

   Pictures on screen (the store, one per editor visit):
   - a layout's sample (asset null): the design's sample photo, a gradient;
   - an upload, a PDF page or a Pixabay pick: its file from the private
     bucket, kept as a copy of at most 4,096 px a side for the screen (the
     export reads the file again);
   - an Unsplash pick (Part 7): linked, never copied; the screen loads it
     from images.unsplash.com at 4,096 px on the long side;
   - loading, did not load (Retry in the bar), or missing: an asset id that
     is not in Uploads any more (plan R13). The layer keeps its box and
     shows a placeholder with words; a missing picture is a Must fix (C15).

   kdpCover.images.panelHtml(E) / bindPanel(el, E) / barHtml(E) / bindBar(el, E)
   kdpCover.images.state(E, l)    → 'sample' | 'ready' | 'loading' | 'failed' | 'missing'
   kdpCover.images.source(E, l)   → a canvas or bitmap to draw, or null (render.js draws its stand-in)
   kdpCover.images.missing(E)     → the asset ids that are gone (for kdpCover.checks C15)
   kdpCover.images.loadUsed(E)    → load the pictures the design uses (on open)
   kdpCover.images.loadUploads(E) → the Uploads list (when the panel opens)
   kdpCover.images.takeFile(E, file, fallbackName) → upload a picked or pasted file, then add or replace
   kdpCover.images.adopt(E, row)  → a stock pick's cover_assets row: into Uploads, then add or replace
   kdpCover.images.onPaste(E, event) / pasteNow(E)
   kdpCover.images.dpiBadge(l)    → the badge's HTML
   kdpCover.images.SAMPLE         → the design's sample photo (CSS gradient)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    crop: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
    flip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M9 7L4 17h5z"/><path d="M15 7l5 10h-5z"/></svg>',
    dup: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    del: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></svg>'
  };
  // The design's sample photo (imageLayer bg): a layout's picture before the writer picks one.
  const SAMPLE = { deg: 165, stops: [[0, '#F7E1B5'], [0.38, '#EDA46F'], [0.70, '#B5596A'], [1, '#3E3557']] };
  const LOOKS = [['none', 'Normal'], ['bw', 'Black and white'], ['sepia', 'Sepia']];
  const MASKS = [['none', 'None'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['arch', 'Arch']];
  const P = () => C.imagePrep;
  const T = (k) => P().E16_TEXT[k] || P().E16_TEXT.unreadable;

  /* ── The store ── */
  function store(E) {
    if (!E.pics) E.pics = new Map();     // asset id → { st, src, thumb, row }
    return E.pics;
  }
  let sampleCanvas = null;
  /** The sample gradient as CSS draws linear-gradient(165deg, …) on a 3 : 2 picture (the layer scales it). */
  function sample() {
    if (sampleCanvas) return sampleCanvas;
    const w = 600, h = 400, c = P().makeCanvas(w, h, true), g = c.getContext('2d');
    const a = SAMPLE.deg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    const gr = g.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
    for (const [o, col] of SAMPLE.stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    sampleCanvas = c;
    return c;
  }
  function state(E, l) {
    if (!l || l.type !== 'image') return null;
    if (l.asset == null) return 'sample';
    const p = store(E).get(l.asset);
    return !p || p.st === 'listed' ? 'loading' : p.st;
  }
  function source(E, l) {
    if (l.asset == null) return sample();
    const p = store(E).get(l.asset);
    return p && p.st === 'ready' ? p.src : null;
  }
  function missing(E) {
    const out = [];
    for (const [id, p] of store(E)) if (p.st === 'missing') out.push(id);
    return out;
  }

  /** The rows Uploads knows (cover_json's assets on open, then the full list), by id. */
  function rowOf(E, id) {
    if (Array.isArray(E.uploads)) { const r = E.uploads.find((x) => x.id === id); if (r) return r; }
    return ((E.data && E.data.assets) || []).find((x) => x.id === id) || null;
  }

  /**
   * Reads one stored picture. screen true (a layer uses it): a screen copy (4,096 px at most a side) and a
   * thumbnail, state 'ready'. screen false (an Uploads tile only): the thumbnail alone, state 'listed'; the
   * decoded file is let go at once, so a long Uploads list never holds big pictures in memory.
   */
  async function loadOne(E, row, screen = true) {
    const S = store(E), me = E;
    const cur = S.get(row.id);
    if (cur && (cur.st === 'ready' || (cur.st === 'loading' && (cur.screen || !screen)) || (cur.st === 'listed' && !screen))) return cur.p;
    const ent = { st: 'loading', src: null, thumb: cur && cur.thumb ? cur.thumb : null, row, screen };
    S.set(row.id, ent);
    ent.p = (async () => {
      try {
        let blob;
        if (row.path) {
          const res = await root.kdp.downloadCoverAsset(row.path);
          if (res.error || !res.data) throw res.error || new Error('no file');
          blob = res.data;
        } else {
          // An Unsplash pick: the hotlink (images.unsplash.com sends CORS *), sized for the screen or the tile.
          const url = C.stock.remoteUrl(row, screen ? 4096 : 480);
          if (!url) throw new Error('no link');
          const res = await root.fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          blob = await res.blob();
        }
        const bmp = await P().decode(blob);
        if (screen) {
          const src = P().screenCopy(bmp);
          if (src !== bmp && bmp.close) bmp.close();
          ent.src = src; ent.thumb = ent.thumb || P().thumb(src, 240, row.transparent); ent.st = 'ready';
        } else {
          ent.thumb = P().thumb(bmp, 240, row.transparent);
          if (bmp.close) bmp.close();
          // a layer may have asked for the picture while the tile loaded
          ent.st = E.cover.layers.some((l) => l.type === 'image' && l.asset === row.id) ? 'loading' : 'listed';
          if (ent.st === 'loading') { S.delete(row.id); S.set(row.id, Object.assign(ent, { st: 'listed' })); return loadOne(E, row, true); }
        }
      } catch (e) {
        ent.st = 'failed';
      }
      if (me.live()) changed(me);
    })();
    return ent.p;
  }
  function changed(E) {
    if (!E.view_) return;
    E.view_.sync();
    E.refreshBars();
    if (E.panel === 'images' || E.panel === 'layers') E.refreshPanel();
    E.gate();
  }

  /** On open: every picture the design uses. An asset id with no row is missing (R13). */
  function loadUsed(E) {
    const S = store(E);
    const ids = [...new Set(E.cover.layers.filter((l) => l.type === 'image' && l.asset).map((l) => l.asset))];
    for (const id of ids) {
      const row = rowOf(E, id);
      if (!row) { S.set(id, { st: 'missing', src: null, thumb: null, row: null }); continue; }
      loadOne(E, row);
    }
  }
  /** A layer that points at an asset not loaded yet (undo, a duplicate, an Uploads tile). */
  function ensure(E, l) {
    if (!l || l.type !== 'image' || !l.asset) return;
    const cur = store(E).get(l.asset);
    if (cur && cur.st !== 'listed') return;
    const row = rowOf(E, l.asset);
    if (row) loadOne(E, row, true); else store(E).set(l.asset, { st: 'missing', src: null, thumb: null, row: null });
  }

  /** The Uploads list: every picture of the user, newest first. Thumbnails load a few at a time. */
  async function loadUploads(E, force) {
    if (!force && (Array.isArray(E.uploads) || E.uploads === 'loading')) return;
    const me = E;
    E.uploads = 'loading'; E.refreshPanel();
    let res;
    try { res = await root.kdp.listCoverAssets(); } catch (e) { res = { error: e }; }
    if (!me.live()) return;
    if (res.error) { E.uploads = 'error'; if (E.panel === 'images') E.refreshPanel(); return; }
    E.uploads = res.data;
    // The list is the truth now: a picture the design uses that is not in it is missing.
    const S = store(E), have = new Set(res.data.map((r) => r.id));
    for (const l of E.cover.layers) if (l.type === 'image' && l.asset && !have.has(l.asset)) S.set(l.asset, { st: 'missing', src: null, thumb: null, row: null });
    for (const [id, p] of S) if (p.st === 'missing' && have.has(id)) S.delete(id);
    changed(E);
    // Thumbnails two at a time (each file is decoded once, then let go).
    const todo = res.data.filter((r) => (r.path || r.remote) && !S.has(r.id));
    let i = 0;
    const next = async () => { while (i < todo.length && me.live()) { const r = todo[i++]; await loadOne(E, r, false); } };
    await Promise.all([next(), next()]);
  }

  /* ── Adding ── */
  /** Design addImage: a new layer, or the picture of the layer being replaced (its box kept). */
  function place(E, img) {
    if (E.replaceId != null) {
      const old = E.cover.layers.find((l) => l.id === E.replaceId);
      E.replaceId = null;
      if (old) {
        const next = Object.assign({}, old, { asset: img.asset, natW: img.natW, natH: img.natH, name: img.name, transparent: !!img.transparent });
        Object.assign(next, C.model.coverFit(next, {}));
        ensure(E, next);
        E.patchLayer(old.id, { asset: next.asset, natW: next.natW, natH: next.natH, name: next.name, transparent: next.transparent, px: next.px, py: next.py, pw: next.pw, ph: next.ph });
        E.select(old.id);
        E.refreshPanel();
        return;
      }
    }
    const L = C.model.newImage(img, C.geo.geo(E.cover.fmt), C.model.nextId(E.cover.layers));
    E.addLayer(L);
    E.refreshPanel();
  }
  const fromRow = (row, name) => ({ asset: row.id, name: [...String(name || 'Picture')].slice(0, C.model.CAPS.name).join(''), natW: row.width, natH: row.height, transparent: !!row.transparent });
  /** The name a picture was added under (0031 cover_assets.name: the file name, "<file> p.<n>", or the stock words). */
  function nameOf(row) {
    return row.name || (row.source === 'pdf' ? 'PDF page' : row.source === 'unsplash' ? 'Unsplash photo' : row.source === 'pixabay' ? 'Pixabay picture' : 'Picture');
  }

  function setErr(E, k) { E.img.err = k ? T(k) : ''; E.img.busy = ''; E.img.note = ''; E.refreshPanel(); }

  /** Design takeImageFile: the rights tick first, then the checks, then the upload, then add or replace. */
  async function takeFile(E, file, fallbackName) {
    if (!file) return;
    if (E.img.busy) return;
    if (!E.img.rights) {
      if (E.panel !== 'images') E.showPanel('images');
      E.img.tab = 'up';
      setErr(E, 'rights');
      return;
    }
    const me = E, name = file.name || fallbackName || 'pasted-image.png';
    E.img.err = ''; E.img.busy = `Reading ${name}…`; E.refreshPanel();
    const r = await P().readPicture(file);
    if (!me.live()) return;
    if (!r.ok) { setErr(E, r.error); return; }
    await store1(E, r, { name, source: 'upload' });
  }
  /** The bytes → the bucket and a cover_assets row → the picture on the cover. */
  async function store1(E, r, { name, source }) {
    const me = E;
    E.img.busy = `Saving ${name} to your uploads…`; E.refreshPanel();
    let up;
    try {
      up = await root.kdp.uploadCoverAsset({ bytes: r.bytes, mime: r.mime, width: r.w, height: r.h, transparent: r.transparent, source, rightsTicked: true, originBookId: E.bookId, name });
    } catch (e) { up = { error: e }; }
    if (!me.live()) return;
    if (up.error || !up.data) { setErr(E, 'upload'); return; }
    const row = up.data;
    store(E).set(row.id, { st: 'ready', src: r.screen, thumb: P().thumb(r.screen, 240, row.transparent), row });
    remember(E, row);
    E.img.busy = ''; E.img.err = '';
    place(E, fromRow(row, nameOf(row)));
  }
  /** A new row joins Uploads (newest first), or the rows cover_json gave when Uploads is not listed yet. */
  function remember(E, row) {
    if (Array.isArray(E.uploads)) E.uploads = [row].concat(E.uploads.filter((x) => x.id !== row.id));
    else if (E.data) E.data.assets = ((E.data.assets) || []).filter((x) => x.id !== row.id).concat([row]);
  }
  /** A stock pick (Part 7): the server stored the row (and, for Pixabay, the file). Add or replace as an upload does. */
  function adopt(E, row) {
    if (!row || !row.id) return;
    remember(E, row);
    place(E, fromRow(row, nameOf(row)));
  }

  /* ── PDF (design onPdf / placePdf; the real page through pdf.js) ── */
  async function takePdf(E, file) {
    if (!file) return;
    if (!E.img.rights) { setErr(E, 'pdfRights'); return; }
    if (E.img.busy) return;
    const me = E;
    let head;
    try { head = new Uint8Array(await file.slice(0, 5).arrayBuffer()); } catch (e) { setErr(E, 'pdfOpen'); return; }
    if (String.fromCharCode(...head) !== '%PDF-') { setErr(E, 'pdfType'); return; }
    if (file.size > P().E16.pdfBytes) { setErr(E, 'pdfBytes'); return; }
    E.img.err = ''; E.img.busy = `Opening ${file.name || 'the PDF'}…`; E.refreshPanel();
    let lib;
    try { lib = await root.kdpTypstRun.loadPdfjs(); } catch (e) { if (me.live()) setErr(E, 'pdfEngine'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await P().pdfPage(lib, bytes, null);
    if (!me.live()) return;
    if (!r.ok) { setErr(E, r.error); return; }
    E.img.busy = '';
    E.img.pdf = { name: file.name || 'document.pdf', pages: r.pages, page: 1, bytes };
    E.refreshPanel();
    const n = E.root.querySelector('[data-pdf-page]'); if (n) n.focus({ preventScroll: true });
  }
  async function placePdf(E) {
    const pdf = E.img.pdf; if (!pdf || E.img.busy) return;
    const me = E;
    E.img.err = ''; E.img.busy = `Drawing page ${pdf.page} at 300 DPI…`; E.refreshPanel();
    let lib;
    try { lib = await root.kdpTypstRun.loadPdfjs(); } catch (e) { if (me.live()) setErr(E, 'pdfEngine'); return; }
    const r = await P().pdfPage(lib, pdf.bytes, pdf.page);
    if (!me.live()) return;
    if (!r.ok) { setErr(E, r.error); return; }
    let screen;
    try { screen = P().screenCopy(await P().decode(new Blob([r.bytes], { type: r.mime }))); } catch (e) { setErr(E, 'pdfPage'); return; }
    E.img.pdf = null;
    await store1(E, { bytes: r.bytes, mime: r.mime, w: r.w, h: r.h, transparent: false, screen }, { name: `${pdf.name} p.${pdf.page}`, source: 'pdf' });
  }

  /* ── Paste ── */
  function onPaste(E, e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        e.preventDefault();
        const f = items[i].getAsFile();
        takeFile(E, f, 'pasted-image.' + (items[i].type === 'image/jpeg' ? 'jpg' : 'png'));
        return;
      }
    }
  }
  async function pasteNow(E) {
    if (!E.img.rights) { setErr(E, 'pdfRights'); return; }
    const cb = root.navigator && root.navigator.clipboard;
    if (!cb || !cb.read) { setErr(E, 'pasteBlocked'); return; }
    let items;
    try { items = await cb.read(); } catch (e) { setErr(E, 'pasteBlocked'); return; }
    for (const it of items) {
      const t = it.types.find((x) => x === 'image/png' || x === 'image/jpeg');
      if (t) {
        const blob = await it.getType(t);
        takeFile(E, new File([blob], 'pasted-image.' + (t === 'image/png' ? 'png' : 'jpg'), { type: t }));
        return;
      }
    }
    setErr(E, 'pasteNone');
  }

  /**
   * E16 Part 10: the pictures of an export at full size (the screen keeps 4,096 px copies): each stored file
   * read again, an Unsplash photo at its own size. A picture with no row, or one that does not load, stops the
   * export (it never prints a placeholder). check(): throws when the export was stopped.
   * → { get(layer) → the picture to draw, close() } (close lets the big pictures go).
   */
  async function full(E, layers, check) {
    const out = new Map();
    const close = () => { for (const b of out.values()) if (b && b.close) b.close(); out.clear(); };
    try {
      for (const l of C.flatten.printable(layers)) {
        if (l.type !== 'image' || l.asset == null || out.has(l.asset)) continue;
        const row = rowOf(E, l.asset);
        const bad = () => Object.assign(new Error('picture'), { exKind: 'picture', name: l.name || (row ? nameOf(row) : 'Picture') });
        if (!row) throw bad();
        let blob;
        try {
          if (row.path) {
            const res = await root.kdp.downloadCoverAsset(row.path);
            if (res.error || !res.data) throw res.error || new Error('no file');
            blob = res.data;
          } else {
            const url = C.stock.remoteUrl(row, Math.max(Number(row.width) || 0, Number(row.height) || 0) || 4096);
            if (!url) throw new Error('no link');
            const res = await root.fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            blob = await res.blob();
          }
        } catch (e) { if (check) check(); throw bad(); }
        if (check) check();
        let bmp;
        try { bmp = await P().decode(blob); } catch (e) { throw bad(); }
        out.set(l.asset, bmp);
        if (check) check();
      }
    } catch (e) { close(); throw e; }
    return { get: (l) => (l.asset == null ? sample() : out.get(l.asset) || null), close, size: () => out.size };
  }

  /*
   * E16 Part 10 (owner, STOP 6 N6): the × on an Uploads tile. It first asks, with how many covers use the
   * picture (the user's saved designs, this cover as it is now, and My layouts). Remove deletes the row,
   * then the file (a file left behind goes in the next sweep). A cover that used it shows "Picture missing"
   * (C15, a Must fix) until it gets a new picture.
   */
  async function askRemove(E, id) {
    const row = Array.isArray(E.uploads) && E.uploads.find((r) => r.id === id);
    if (!row) return;
    const me = E;
    E.img.note = '';
    E.img.rm = { id, name: nameOf(row), st: 'counting', books: 0, layouts: 0, err: '' };
    E.refreshPanel(); focusRm(E);
    let res;
    try { res = await root.kdp.coverAssetUse(id); } catch (e) { res = { error: e }; }
    if (!me.live() || !E.img.rm || E.img.rm.id !== id) return;
    if (res.error || !res.data) { E.img.rm.st = 'ask'; E.img.rm.err = 'We couldn’t check which covers use it. Check your connection, then try again.'; E.img.rm.unknown = true; }
    else {
      const books = new Set(res.data.books || []);
      books.delete(E.bookId);
      if (E.cover.layers.some((l) => l.type === 'image' && l.asset === id)) books.add(E.bookId);
      Object.assign(E.img.rm, { st: 'ask', books: books.size, here: books.has(E.bookId), layouts: res.data.layouts || 0, unknown: false });
    }
    E.refreshPanel(); focusRm(E);
  }
  function rmText(rm) {
    if (rm.unknown) return 'We couldn’t check which covers use this picture. If one does, it will show “Picture missing”.';
    const n = rm.books, m = rm.layouts;
    if (!n && !m) return 'It is not used on any cover.';
    const a = n ? `Used on ${n} cover${n === 1 ? '' : 's'}${rm.here ? (n === 1 ? ' (this one)' : ', this one too') : ''}.` : '';
    const b = m ? `${n ? 'Also in' : 'In'} ${m} of My layouts.` : '';
    const c = n ? 'Those covers will show “Picture missing” and need a new picture before you export.' : 'Those layouts will show “Picture missing” when you use them.';
    return [a, b, c].filter(Boolean).join(' ');
  }
  function rmHtml(E) {
    const rm = E.img.rm;
    if (!rm) return '';
    if (rm.st === 'counting') return `<div class="cv-uprm" role="status" data-uprm><p class="cv-uprm-t">Remove ${esc(rm.name)} from Uploads?</p><p class="cv-help">Checking which covers use it…</p><div class="cv-uprm-btns"><button type="button" class="cv-sbtn" data-k="uprm-cancel" data-uprm-cancel>Cancel</button></div></div>`;
    return `<div class="cv-uprm" role="alertdialog" aria-labelledby="cv-uprm-t" aria-describedby="cv-uprm-p" data-uprm>
      <p class="cv-uprm-t" id="cv-uprm-t">Remove ${esc(rm.name)} from Uploads?</p>
      <p class="cv-uprm-p" id="cv-uprm-p">${rm.books || rm.layouts ? `<span class="cv-uprm-w">${I.warn}<span>${esc(rmText(rm))}</span></span>` : esc(rmText(rm))} The file is deleted. This cannot be undone.</p>
      ${rm.err ? `<p class="cv-uperr" role="alert">${I.warn}<span>${esc(rm.err)}</span></p>` : ''}
      <div class="cv-uprm-btns"><button type="button" class="cv-uprm-go" data-k="uprm-go" data-uprm-go${rm.st === 'removing' ? ' aria-disabled="true"' : ''}>${rm.st === 'removing' ? 'Removing…' : 'Remove'}</button><button type="button" class="cv-sbtn" data-k="uprm-cancel" data-uprm-cancel>Cancel</button></div>
    </div>`;
  }
  function focusRm(E) {
    const b = E.root.querySelector('[data-panel] [data-uprm-go]') || E.root.querySelector('[data-panel] [data-uprm-cancel]');
    if (b) b.focus({ preventScroll: true });
  }
  async function doRemove(E) {
    const rm = E.img.rm; if (!rm || rm.st !== 'ask') return;
    const me = E, id = rm.id;
    rm.st = 'removing'; rm.err = ''; E.refreshPanel(); focusRm(E);
    let res;
    try { res = await root.kdp.deleteCoverAsset(id); } catch (e) { res = { error: e }; }
    if (!me.live() || E.img.rm !== rm) return;
    if (res.error && !res.error.notFound) { rm.st = 'ask'; rm.err = 'We couldn’t remove the picture. Check your connection, then try again.'; E.refreshPanel(); focusRm(E); return; }
    const i = Array.isArray(E.uploads) ? E.uploads.findIndex((r) => r.id === id) : -1;
    if (Array.isArray(E.uploads)) E.uploads = E.uploads.filter((r) => r.id !== id);
    E.img.rm = null;
    // A layer that uses it: the picture is gone now (C15). Otherwise the store forgets it.
    if (E.cover.layers.some((l) => l.type === 'image' && l.asset === id)) store(E).set(id, { st: 'missing', src: null, thumb: null, row: null });
    else store(E).delete(id);
    E.img.note = `${rm.name} was removed from Uploads.`;
    changed(E);
    E.refreshPanel();
    const p = E.root.querySelector('[data-panel]');
    const xs = p ? p.querySelectorAll('[data-up-x]') : [];
    const n = xs[Math.min(Math.max(0, i), xs.length - 1)] || (p && p.querySelector('[data-up-file]')) || null;
    if (n) n.focus({ preventScroll: true });
  }
  function cancelRemove(E) {
    const rm = E.img.rm; if (!rm || rm.st === 'removing') return;
    E.img.rm = null; E.refreshPanel();
    const x = E.root.querySelector(`[data-panel] [data-up-x="${CSS.escape(rm.id)}"]`); if (x) x.focus({ preventScroll: true });
  }

  /* ── Panel (design 62's Images panel, Uploads tab) ── */
  function sizeText(r) { return `${Number(r.width).toLocaleString('en-US')} × ${Number(r.height).toLocaleString('en-US')}`; }
  function tile(E, r) {
    const p = store(E).get(r.id);
    const thumb = p && p.thumb ? `<img class="cv-uptile-img${r.transparent ? ' is-clear' : ''}" src="${p.thumb}" alt="">`
      : `<span class="cv-uptile-img cv-uptile-wait">${p && p.st === 'failed' ? 'Did not load' : 'Loading…'}</span>`;
    const what = E.replaceId != null ? 'Replace with' : 'Add';
    const stock = r.source === 'pixabay' ? 'Pixabay' : r.source === 'unsplash' ? 'Unsplash' : '';
    const label = `${what} ${nameOf(r)}${stock ? ` (${stock})` : ''}, ${sizeText(r)} px${r.transparent ? ', see-through' : ''}`;
    // Part 10 (N6): the × beside the tile (a button cannot hold a button), over its top right corner.
    return `<div class="cv-uptile-w"><button type="button" class="cv-uptile" data-k="up-${esc(r.id)}" data-add-asset="${esc(r.id)}" aria-label="${esc(label)}">${thumb}<span class="cv-uptile-s cv-mono">${sizeText(r)}</span>${stock ? `<span class="cv-uptile-src">${stock}</span>` : ''}</button>`
      + `<button type="button" class="cv-uptile-x" data-k="upx-${esc(r.id)}" data-up-x="${esc(r.id)}" aria-label="Remove ${esc(nameOf(r))} from Uploads" title="Remove from Uploads"${E.img.rm ? ' aria-disabled="true"' : ''}>${I.x}</button></div>`;
  }
  /**
   * The Uploads help line (owner, STOP 6): the full-cover size in px comes from this book's size at 300 DPI,
   * with geo.px300's rounding (up, never narrower than the wrap): 3,712 × 2,775 px for the design's 6 × 9 book.
   */
  function helpText(fmt) {
    const px = C.geo.px300(C.geo.geo(fmt));
    const n = (v) => v.toLocaleString('en-US');
    return `JPG or PNG up to 10 MB, PDF up to 25 MB. A full cover for this book needs at least ${n(px.w)} × ${n(px.h)} px. You can also press Cmd+V or Ctrl+V.`;
  }
  function panelHtml(E) {
    const im = E.img, rights = im.rights;
    const off = rights ? '' : ' disabled';
    const tabs = [['up', 'Uploads'], ['pixabay', 'Pixabay'], ['unsplash', 'Unsplash']];
    const list = E.uploads, tab = im.tab || 'up';
    const head = `
      <div class="cv-cap">IMAGES</div>
      <div class="cv-srctabs" role="tablist" aria-label="Image source">${tabs.map(([k, label]) => `<button type="button" role="tab" class="cv-srctab${k === tab ? ' is-on' : ''}" data-k="tab-${k}" data-srctab="${k}" aria-selected="${k === tab}">${label}</button>`).join('')}</div>
      ${E.replaceId != null ? `<div class="cv-replacing"><span>Pick a picture to replace the selected one.</span><button type="button" class="cv-sbtn" data-k="rep-cancel" data-rep-cancel>Cancel</button></div>` : ''}`;
    if (tab !== 'up') return head + C.stock.panelHtml(E);
    return `${head}
      <label class="cv-check cv-rights"><input type="checkbox" data-k="rights" data-rights${rights ? ' checked' : ''}>I own this picture or PDF, or I have the right to use it on a book cover I sell.</label>
      <div class="cv-upbtns">
        <label class="cv-upbtn${rights ? '' : ' is-off'}"><input type="file" accept="image/jpeg,image/png" data-k="up-file" data-up-file${off}>Upload image</label>
        <label class="cv-upbtn${rights ? '' : ' is-off'}"><input type="file" accept="application/pdf" data-k="up-pdf" data-up-pdf${off}>Upload PDF</label>
      </div>
      <button type="button" class="cv-sbtn cv-paste${rights ? '' : ' is-off'}" data-k="paste" data-paste>Paste from clipboard</button>
      <p class="cv-help cv-help-sm" data-up-help>${esc(helpText(E.cover.fmt))}</p>
      ${im.err ? `<p class="cv-uperr" role="alert">${I.warn}<span>${esc(im.err)}</span></p>` : ''}
      ${im.busy ? `<p class="cv-help" role="status" data-up-busy>${esc(im.busy)}</p>` : ''}
      ${im.note ? `<p class="cv-help" role="status" data-up-note>${esc(im.note)}</p>` : ''}
      ${im.pdf ? `<div class="cv-pdfbox" data-pdfbox>
          <div class="cv-pdf-name">${esc(im.pdf.name)}</div>
          <div class="cv-mono cv-pdf-pages">${im.pdf.pages} ${im.pdf.pages === 1 ? 'page' : 'pages'}</div>
          <label class="cv-field-in">Page<input type="number" class="cv-num" min="1" max="${im.pdf.pages}" step="1" value="${im.pdf.page}" data-k="pdf-page" data-pdf-page></label>
          <div class="cv-pdf-btns"><button type="button" class="cv-sbtn cv-sbtn-ink" data-k="pdf-place" data-pdf-place${im.busy ? ' aria-disabled="true"' : ''}>Place page</button><button type="button" class="cv-sbtn" data-k="pdf-cancel" data-pdf-cancel>Cancel</button></div>
          <p class="cv-help cv-help-sm">The page lands as a 300 DPI picture.</p>
        </div>` : ''}
      <div class="cv-cap">YOUR UPLOADS</div>
      ${list === 'loading' || list == null ? '<p class="cv-help" role="status">Loading your uploads…</p>' : ''}
      ${list === 'error' ? `<div class="cv-iconerr" role="alert"><p>We couldn’t load your uploads. Check your connection, then try again.</p><button type="button" class="cv-sbtn" data-k="up-retry" data-up-retry>Retry</button></div>` : ''}
      ${Array.isArray(list) && !list.length ? '<p class="cv-help">No pictures yet. Tick the box, then upload a picture or a PDF page.</p>' : ''}
      ${rmHtml(E)}
      ${Array.isArray(list) && list.length ? `<div class="cv-uptiles" data-uptiles>${list.map((r) => tile(E, r)).join('')}</div>` : ''}`;
  }

  function bindPanel(el, E) {
    el.addEventListener('click', (e) => {
      if (E.panel !== 'images') return;
      // Part 10 (N6): the remove × and its question.
      const ux = e.target.closest('[data-up-x]');
      if (ux) { if (ux.getAttribute('aria-disabled') !== 'true') askRemove(E, ux.dataset.upX); return; }
      if (e.target.closest('[data-uprm-go]')) { doRemove(E); return; }
      if (e.target.closest('[data-uprm-cancel]')) { cancelRemove(E); return; }
      const t = e.target.closest('[data-add-asset]');
      if (t) {
        const row = Array.isArray(E.uploads) && E.uploads.find((r) => r.id === t.dataset.addAsset);
        if (!row) return;
        place(E, fromRow(row, nameOf(row)));
        return;
      }
      if (e.target.closest('[data-rep-cancel]')) { E.replaceId = null; E.refreshPanel(); return; }
      const tb = e.target.closest('[data-srctab]');
      if (tb) {
        E.img.tab = tb.dataset.srctab; E.img.err = '';
        // A stock tab shows its last answer for the words in the box, or searches them now (stock.js).
        if (tb.dataset.srctab !== 'up') C.stock.show(E, tb.dataset.srctab); else E.refreshPanel();
        return;
      }
      if (e.target.closest('[data-up-retry]')) { loadUploads(E, true); return; }
      if (e.target.closest('[data-paste]')) { pasteNow(E); return; }
      if (e.target.closest('[data-pdf-place]')) { placePdf(E); return; }
      if (e.target.closest('[data-pdf-cancel]')) { E.img.pdf = null; E.refreshPanel(); return; }
      // a click on a turned-off upload button (rights not ticked) says why
      const lab = e.target.closest('.cv-upbtn.is-off');
      if (lab) { e.preventDefault(); setErr(E, lab.querySelector('[data-up-pdf]') ? 'pdfRights' : 'rights'); }
    });
    el.addEventListener('change', (e) => {
      if (E.panel !== 'images') return;
      const t = e.target;
      if (t.matches('[data-rights]')) { E.img.rights = t.checked; E.img.err = ''; E.refreshPanel(); return; }
      if (t.matches('[data-up-file]')) { const f = t.files && t.files[0]; t.value = ''; takeFile(E, f); return; }
      if (t.matches('[data-up-pdf]')) { const f = t.files && t.files[0]; t.value = ''; takePdf(E, f); return; }
      if (t.matches('[data-pdf-page]') && E.img.pdf) {
        const n = Math.max(1, Math.round(Number(t.value) || 1));
        E.img.pdf.page = Math.min(n, E.img.pdf.pages);
        t.value = E.img.pdf.page;
      }
    });
  }

  /* ── The DPI badge (design dpiLabel; an icon with each word, CLAUDE.md §7) ── */
  function dpiBadge(l) {
    const d = C.model.dpi(l);
    const cls = d >= 300 ? 'is-ok' : d >= 200 ? 'is-warn' : 'is-bad';
    const words = d >= 300 ? `${d} DPI` : d >= 200 ? `${d} DPI · may print soft` : `${d} DPI · too low`;
    return `<span class="cv-dpi ${cls} cv-mono" data-dpi title="KDP asks for 300 DPI or more. DPI drops when you make the picture bigger or crop into it.">${d >= 300 ? I.ok : I.warn}${words}</span>`;
  }

  /* ── Picture bar (design 62) ── */
  const btn = (k, on, label, icon, extra) => `<button type="button" class="cv-ib${on ? ' is-on' : ''}" data-k="${k}" aria-label="${label}" aria-pressed="${on}"${extra || ''}>${icon}</button>`;
  function range(k, label, min, max, v, unit, step) {
    return `<label class="cv-fx-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step || 1}" value="${v}" data-k="i-${k}" data-ik="${k}"><span class="cv-mono cv-fx-v" data-iv="${k}">${v}${unit || ''}</span></label>`;
  }
  const UNIT = { dark: '%', bw: ' pt', op: '%' };
  function minK(l) { return Math.max(l.w / l.natW, l.h / l.natH); }
  const cropPct = (l) => Math.round(l.pw / l.natW / minK(l) * 100);

  function barHtml(E) {
    const l = E.selLayer();
    if (!l || l.type !== 'image' || E.multi.length > 1) return '';
    const m = E.menu, R = C.model.RANGE, st = state(E, l);
    const note = st === 'missing' ? `<span class="cv-picnote" role="status">${I.warn}Picture missing</span>`
      : st === 'failed' ? `<span class="cv-picnote" role="status">${I.warn}The picture did not load</span><button type="button" class="cv-tb" data-k="pic-retry" data-iact="retry">Retry</button>`
        : st === 'loading' ? '<span class="cv-status" role="status">Loading the picture…</span>' : '';
    if (E.cropping === l.id) {
      return `
        <strong class="cv-crop-t">Crop</strong>
        <span class="cv-crop-help">Drag the black handles to cut the edges. Drag the picture to move it.</span>
        <label class="cv-cropzoom">Zoom<input type="range" min="100" max="300" step="5" value="${cropPct(l)}" data-k="crop-zoom" data-crop-zoom><span class="cv-mono" data-crop-pct>${cropPct(l)}%</span></label>
        ${dpiBadge(l)}
        <span class="cv-grow"></span>
        <button type="button" class="cv-tb" data-k="crop-reset" data-iact="crop-reset">Reset</button>
        <button type="button" class="cv-tb cv-tb-ink" data-k="crop-done" data-iact="crop-done">Done</button>`;
    }
    const pk = `<div class="cv-pk-embed" data-picker>${C.picker.html(E.pk, { cur: l.bcolor, embed: true })}</div>`;
    return `
      <button type="button" class="cv-tb" data-k="replace" data-iact="replace">Replace</button>
      <button type="button" class="cv-tb" data-k="crop" data-iact="crop"${l.lock ? ' aria-disabled="true" title="Unlock the picture first"' : ''}>${I.crop}Crop</button>
      <button type="button" class="cv-tb${m === 'ifill' ? ' is-open' : ''}" data-k="ifill" data-iact="ifill" aria-expanded="${m === 'ifill'}">Fill ▾</button>
      <button type="button" class="cv-tb${m === 'iadjust' ? ' is-open' : ''}" data-k="iadjust" data-iact="iadjust" aria-expanded="${m === 'iadjust'}">Adjust</button>
      <button type="button" class="cv-tb${m === 'iborder' ? ' is-open' : ''}" data-k="iborder" data-iact="iborder" aria-expanded="${m === 'iborder'}">Border</button>
      <button type="button" class="cv-tb${m === 'imask' ? ' is-open' : ''}" data-k="imask" data-iact="imask" aria-expanded="${m === 'imask'}">Mask</button>
      <button type="button" class="cv-tb${m === 'opacity' ? ' is-open' : ''}" data-k="op" data-iact="opacity" aria-expanded="${m === 'opacity'}" aria-label="Opacity ${l.op}%">Opacity ${l.op}%</button>
      ${btn('flipH', !!l.flipH, 'Flip left to right', I.flip, ' data-iact="flipH"')}
      ${st === 'missing' || st === 'failed' ? note : dpiBadge(l) + note}
      <span class="cv-grow"></span>
      <button type="button" class="cv-tb${m === 'arrange' ? ' is-open' : ''}" data-k="arr" data-iact="arrange" aria-expanded="${m === 'arrange'}">Arrange ▾</button>
      <button type="button" class="cv-ib" data-k="dup" data-iact="dup" aria-label="Duplicate">${I.dup}</button>
      ${btn('lock', !!l.lock, l.lock ? 'Unlock' : 'Lock', I.lock, ' data-iact="lock"')}
      <button type="button" class="cv-ib${m === 'more' ? ' is-on' : ''}" data-k="more" data-iact="more" aria-label="More" aria-expanded="${m === 'more'}">⋯</button>
      <button type="button" class="cv-ib cv-ib-del" data-k="del" data-iact="del" aria-label="Delete">${I.del}</button>
      ${m === 'ifill' ? `<div class="cv-pop cv-pop-ifill" role="menu" aria-label="Fill">
          <button type="button" role="menuitem" class="cv-mi" data-k="f-front" data-ifill="front">Fill front cover</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="f-back" data-ifill="back">Fill back cover</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="f-cover" data-ifill="cover">Fill whole cover</button>
          <p class="cv-pop-p cv-pop-p-sm">Fill reaches into the bleed, so no white edge shows after the cut.</p></div>` : ''}
      ${m === 'iadjust' ? `<div class="cv-pop cv-pop-iadjust" role="dialog" aria-label="Adjust">
          <div class="cv-pop-head"><span class="cv-pop-cap">Adjust</span><button type="button" class="cv-sbtn" data-k="adj-reset" data-iact="adj-reset">Reset</button></div>
          ${range('bri', 'Brightness', R.bri[0], R.bri[1], l.bri)}
          ${range('con', 'Contrast', R.con[0], R.con[1], l.con)}
          ${range('sat', 'Saturation', R.sat[0], R.sat[1], l.sat)}
          ${range('blur', 'Blur', R.blur[0], R.blur[1], l.blur)}
          ${range('dark', 'Darken', R.dark[0], R.dark[1], l.dark, '%', 5)}
          <div class="cv-seg">${LOOKS.map(([k, label]) => `<button type="button" class="cv-segb${l.look === k ? ' is-on' : ''}" data-k="look-${k}" data-look="${k}" aria-pressed="${l.look === k}">${label}</button>`).join('')}</div>
          <p class="cv-pop-p cv-pop-p-sm">Changes are baked into the picture when you export.</p></div>` : ''}
      ${m === 'iborder' ? `<div class="cv-pop cv-pop-iborder" role="dialog" aria-label="Border">
          ${range('bw', 'Width', R.bw[0], R.bw[1], l.bw, ' pt')}
          ${pk}
          <p class="cv-pop-p cv-pop-p-sm">The border follows the mask shape.</p></div>` : ''}
      ${m === 'imask' ? `<div class="cv-pop cv-pop-imask" role="dialog" aria-label="Mask">
          <span class="cv-pop-cap">Mask shape</span>
          <div class="cv-masks">${MASKS.map(([k, label]) => `<button type="button" class="cv-mask${l.mask === k ? ' is-on' : ''}" data-k="mask-${k}" data-mask="${k}" aria-pressed="${l.mask === k}"><span class="cv-mask-s cv-mask-${k}" aria-hidden="true"></span>${label}</button>`).join('')}</div></div>` : ''}
      ${m === 'opacity' ? `<div class="cv-pop cv-pop-iop" role="dialog" aria-label="Opacity">
          <label class="cv-range"><span class="cv-range-row"><strong>Opacity</strong><span class="cv-mono" data-iv="op">${l.op}%</span></span>
          <input type="range" min="0" max="100" step="1" value="${l.op}" data-k="op-range" data-ik="op"></label>
          <p class="cv-pop-p cv-pop-p-sm">When you export, NicheInk merges see-through parts with what is under them into one flat 300 DPI picture. KDP gets a flat file.</p></div>` : ''}
      ${m === 'arrange' ? `<div class="cv-pop cv-pop-arr" role="menu" aria-label="Arrange">
          <button type="button" role="menuitem" class="cv-mi" data-k="a-front" data-iarr="front">Bring to front</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-fwd" data-iarr="forward">Bring forward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-bwd" data-iarr="backward">Send backward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-back" data-iarr="back">Send to back</button>
          <p class="cv-pop-p cv-pop-p-sm">Forward and backward jump past the next layer this one covers.</p></div>` : ''}
      ${m === 'more' ? `<div class="cv-pop cv-pop-more" role="dialog" aria-label="More">
          <div class="cv-morerow"><label class="cv-field-in">Rotation<input type="number" class="cv-num" min="-180" max="180" step="1" value="${Math.round(l.rot || 0)}" data-k="rot-n" data-irot>°</label>
            <button type="button" class="cv-linkbtn" data-k="rot-reset" data-iact="rot-reset">Reset</button></div>
          <label class="cv-check"><input type="checkbox" data-k="flipV" data-icheck="flipV"${l.flipV ? ' checked' : ''}>Flip top to bottom</label>
          <label class="cv-check"><input type="checkbox" data-k="noExport" data-icheck="noExport"${l.noExport ? ' checked' : ''}>Exclude from export</label>
          <p class="cv-pop-p cv-pop-p-sm">Use it for a reference picture you trace over. It stays on the canvas but is left out of your files.</p>
          ${credit(E, l)}</div>` : ''}`;
  }

  /** A stock picture's credit in More (plan §7: picker, panel and the layer's More menu). */
  function credit(E, l) {
    const row = l.asset ? rowOf(E, l.asset) : null;
    const html = row ? C.stock.creditHtml(row) : '';
    return html ? `<p class="cv-pop-p cv-pop-p-sm cv-credit" data-credit>${html}</p>` : '';
  }

  /** Design fillFront / fillBack / fillCover: the box fills the part, into the bleed, unturned; the picture covers it. */
  function fillPatch(l, part, g) {
    const box = part === 'front' ? { x: g.foldR, y: 0, w: g.W - g.foldR, h: g.H } : part === 'back' ? { x: 0, y: 0, w: g.foldL, h: g.H } : { x: 0, y: 0, w: g.W, h: g.H };
    return Object.assign({ x: box.x, y: box.y, w: box.w, h: box.h, rot: 0 }, C.model.coverFit(l, { w: box.w, h: box.h }));
  }
  /** Design onCropZoom: 100 to 300 % of the fill size, around the middle of the box. */
  function zoomPatch(l, pct) {
    const k = minK(l) * pct / 100, pw = l.natW * k, ph = l.natH * k;
    const rx = (l.w / 2 - l.px) / l.pw, ry = (l.h / 2 - l.py) / l.ph;
    const c = C.model.clampPic(Object.assign({}, l, { pw, ph, px: l.w / 2 - rx * pw, py: l.h / 2 - ry * ph }));
    return { pw: c.pw, ph: c.ph, px: c.px, py: c.py };
  }

  function bindBar(el, E) {
    const L = () => { const l = E.selLayer(); return l && l.type === 'image' && E.multi.length < 2 ? l : null; };
    const quiet = { bars: false, panel: false, overlay: false };
    el.addEventListener('click', (e) => {
      const l = L(); if (!l) return;
      const b = e.target.closest('[data-iact], [data-ifill], [data-look], [data-mask], [data-iarr]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.dataset.ifill) { E.menu = null; E.patchLayer(l.id, fillPatch(l, b.dataset.ifill, C.geo.geo(E.cover.fmt))); focusBar(E, 'ifill'); return; }
      if (b.dataset.look) { E.patchLayer(l.id, { look: b.dataset.look }); return; }
      if (b.dataset.mask) { E.patchLayer(l.id, { mask: b.dataset.mask }); return; }
      if (b.dataset.iarr) { E.arrange(b.dataset.iarr); return; }
      const a = b.dataset.iact;
      if (a === 'replace') { E.replaceId = l.id; E.menu = null; E.showPanel('images'); E.refreshBars(); const f = E.root.querySelector('[data-uptiles] [data-add-asset], [data-rights]'); if (f) f.focus({ preventScroll: true }); }
      else if (a === 'crop') E.startCrop(l.id);
      else if (a === 'crop-done') E.endCrop(true);
      else if (a === 'crop-reset') E.patchLayer(l.id, C.model.coverFit(l, {}));
      else if (a === 'ifill' || a === 'iadjust' || a === 'imask' || a === 'opacity' || a === 'arrange' || a === 'more') E.toggleMenu(a);
      else if (a === 'iborder') E.toggleMenu('iborder');
      else if (a === 'flipH') E.patchLayer(l.id, { flipH: !l.flipH });
      else if (a === 'adj-reset') E.patchLayer(l.id, { bri: 100, con: 100, sat: 100, blur: 0, dark: 0, look: 'none' });
      else if (a === 'dup') E.duplicate();
      else if (a === 'lock') { E.endCrop(false); E.patchLayer(l.id, { lock: !l.lock }); }
      else if (a === 'del') E.removeSel();
      else if (a === 'rot-reset') E.patchLayer(l.id, { rot: 0 });
      else if (a === 'retry') { const row = rowOf(E, l.asset); if (row) { store(E).delete(l.asset); loadOne(E, row); E.refreshBars(); } }
    });
    el.addEventListener('input', (e) => {
      const l = L(); if (!l) return;
      const t = e.target;
      if (t.matches('[data-crop-zoom]')) {
        E.patchLayer(l.id, zoomPatch(l, Number(t.value)), null, quiet);
        const out = el.querySelector('[data-crop-pct]'); if (out) out.textContent = t.value + '%';
        const d = el.querySelector('[data-dpi]'); if (d) d.outerHTML = dpiBadge(E.selLayer());
        return;
      }
      if (!t.dataset.ik) return;
      const k = t.dataset.ik, v = Number(t.value);
      E.patchLayer(l.id, { [k]: v }, null, quiet);
      const out = el.querySelector(`[data-iv="${k}"]`);
      if (out) out.textContent = v + (UNIT[k] || '');
      if (k === 'op') { const ob = el.querySelector('[data-k="op"]'); if (ob) { ob.textContent = `Opacity ${v}%`; ob.setAttribute('aria-label', `Opacity ${v}%`); } }
    });
    el.addEventListener('change', (e) => {
      const l = L(); if (!l) return;
      const t = e.target;
      if (t.dataset.icheck) { E.patchLayer(l.id, { [t.dataset.icheck]: t.checked }); return; }
      if (t.matches('[data-irot]')) { const v = Math.round(Math.min(180, Math.max(-180, Number(t.value) || 0))); E.patchLayer(l.id, { rot: v }); return; }
      if (t.dataset.ik || t.matches('[data-crop-zoom]')) E.refreshBars();
    });
  }
  function focusBar(E, k) { E.refreshBars(); const b = E.root.querySelector(`.cv-textbar [data-k="${k}"]`); if (b) b.focus({ preventScroll: true }); }

  C.images = { SAMPLE, panelHtml, bindPanel, barHtml, bindBar, state, source, missing, sample, loadUsed, loadUploads, ensure, takeFile, takePdf, placePdf,
    onPaste, pasteNow, dpiBadge, helpText, fillPatch, zoomPatch, cropPct, rowOf, adopt, nameOf,
    // Part 10
    full, askRemove, doRemove, cancelRemove, rmText };
})(globalThis);
