/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the cover model (E16 Part 1)
   /js/cover/model.js   (pure, no DOM; tested by tests/cover-model.test.js)

   A cover = { fmt: { trim, pages, paper }, bg, layers[], layout }.
   Layers keep the design's shapes exactly (design/screens/58-09-cover-new.html):
   board px at 70 px per inch from the top left of the full wrap with bleed,
   size / sw / bw in pt, z-order = array order, text has no stored height
   (kdpCover.textlayout gives it).

   One change from the design's data: an image layer names its picture by
   `asset` (a cover_assets id, or null for a layout's sample) instead of the
   design's CSS `bg` (plan D0, real data).

   Load order: geo.js, textlayout.js, shapes.js, names.js, model.js.

   kdpCover.model.textLayer / shapeLayer / imageLayer(id, o) → a layer with the design's defaults
   kdpCover.model.newText(kind, count, g, id)  → a preset text (design addText)
   kdpCover.model.newBookText(key, text, g, id) → Title, Subtitle or Pen name from the book (design addBook)
   kdpCover.model.newImage(img, g, id)         → a picture added from Uploads (design addImage)
   kdpCover.model.coverFit(l, frame) / clampPic(l) / dpi(l)
   kdpCover.model.bbox(l, textH)               → the box on the board (rotated: its bounding box)
   kdpCover.model.overlaps / arrange / dup / align / distribute / nudge / remove
   kdpCover.model.sizeStep(size, dir)          → the text bar's − and + (6 to 160 pt)
   kdpCover.model.normalizeLayer(l) / normalize(cover) → defaults filled, unknown fields dropped, ranges clamped
   kdpCover.model.fits(cover)                  → { ok, reason } against the caps (200 layers, 512 KB, 2,000 characters)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const PT = 70 / 72;
  const FONTS = [
    ['Source Serif 4', 'Serif'], ['EB Garamond', 'Serif'], ['Lora', 'Serif'], ['Playfair Display', 'Serif'],
    ['Merriweather', 'Serif'], ['Libre Baskerville', 'Serif'], ['Roboto Slab', 'Serif'],
    ['IBM Plex Sans', 'Sans'], ['Inter', 'Sans'], ['Montserrat', 'Sans'], ['Poppins', 'Sans'], ['Raleway', 'Sans'],
    ['Oswald', 'Display'], ['Bebas Neue', 'Display'], ['Abril Fatface', 'Display'], ['Anton', 'Display'],
    ['Pacifico', 'Script'], ['Dancing Script', 'Script'], ['Great Vibes', 'Script'], ['Space Mono', 'Mono']
  ];
  const PRESETS = ['#1C1C1A', '#FFFFFF', '#1F3A5F', '#2F4A3A', '#7A2E2E', '#F2C14E', '#E07A5F', '#F2EDE4'];
  const FX_DEF = { style: 'none', color: '#1C1C1A', int: 60, dist: 6, dir: 45, blur: 6, width: 2, depth: 6, pad: 8, round: 6 };
  const FX_STYLES = [['none', 'None', '#1C1C1A'], ['shadow', 'Shadow', '#1C1C1A'], ['lift', 'Lift', '#1C1C1A'], ['glow', 'Glow', '#F2C14E'], ['outline', 'Outline', '#F2C14E'],
    ['hollow', 'Hollow', '#1C1C1A'], ['3d', '3D', '#E07A5F'], ['echo', 'Echo', '#E07A5F'], ['bg', 'Background', '#F2C14E']];
  const SRC = ['title', 'subtitle', 'pen', 'blurb', 'spine'];
  const CAPS = { layers: 200, text: 2000, bytes: 512 * 1024, label: 80, name: 200, natPx: 12000 };
  // The design's control ranges (sliders and number boxes).
  const RANGE = {
    size: [6, 160], rot: [-180, 180], op: [0, 100], ls: [-0.1, 1], curve: [-100, 100], distTB: [-50, 50],
    fx: { int: [10, 100], dist: [0, 30], dir: [0, 359], blur: [0, 30], width: [1, 10], depth: [1, 20], pad: [2, 30], round: [0, 30] },
    gAngle: [0, 359], sw: [0, 20], radius: [0, 120], points: [3, 24], depth: [20, 95], head: [15, 80], thick: [4, 90],
    bri: [50, 150], con: [50, 150], sat: [0, 200], blur: [0, 10], dark: [0, 60], bw: [0, 20]
  };
  const TEXT_PRESETS = {
    heading: { text: 'Your heading', w: 340, font: 'Source Serif 4', size: 36, weight: 700 },
    sub: { text: 'Your subheading', w: 320, font: 'IBM Plex Sans', size: 20, weight: 600 },
    body: { text: 'Your text', w: 300, font: 'IBM Plex Sans', size: 12, weight: 400 }
  };
  // "From your book" (design BOOK, without the sample words).
  const BOOK_STYLE = {
    title: { y: 110, w: 360, font: 'Source Serif 4', size: 34, weight: 700, color: '#1C1C1A', align: 'center', caps: false },
    subtitle: { y: 300, w: 330, font: 'IBM Plex Sans', size: 14, weight: 400, color: '#3D3D39', align: 'center', caps: false },
    pen: { y: 560, w: 300, font: 'IBM Plex Sans', size: 12, weight: 600, color: '#1C1C1A', align: 'center', caps: true }
  };

  const textH0 = (l) => C.textlayout.height(l);
  const freshDist = () => ({ on: false, mode: 'basic', top: 0, bottom: 0, q: [[0, 0], [0, 0], [0, 0], [0, 0]] });
  const common = () => ({ rot: 0, op: 100, lock: false, noExport: false });

  // ---------- factories (the design's textLayer, shapeLayer, imageLayer) ----------
  function textLayer(id, o) {
    return Object.assign({ id, type: 'text', src: null, ls: o.caps ? 0.12 : 0, fx: Object.assign({}, FX_DEF), curve: 0,
      dist: freshDist(), align: 'center', caps: false, weight: 400, color: '#1C1C1A' }, common(), o);
  }
  function shapeLayer(id, o) {
    return Object.assign({ id, type: 'shape', kind: 'rect', fillMode: 'solid', fill: '#1F3A5F', fill2: '#E07A5F', gAngle: 90, sw: 0, scolor: '#1C1C1A', dash: 'solid', radius: 0,
      points: 5, depth: 45, head: 40, thick: 18, flipH: false, flipV: false, name: 'rect' }, common(), o);
  }
  function imageLayer(id, o) {
    const L = Object.assign({ id, type: 'image', name: 'Sample photo (replace it)', asset: null, natW: 6000, natH: 4000, transparent: false,
      px: 0, py: 0, pw: 0, ph: 0, flipH: false, flipV: false, bri: 100, con: 100, sat: 100, blur: 0, dark: 0, look: 'none', bw: 0, bcolor: '#1C1C1A', mask: 'none' }, common(), o);
    return Object.assign(L, coverFit(L, {}));
  }

  /** The design's addLayer(): a new text centered on the front. */
  function placeText(base, src, g, id) {
    const L = Object.assign({ id, type: 'text', src: src || null, ls: base.caps ? 0.12 : 0, fx: Object.assign({}, FX_DEF), curve: 0, dist: freshDist() }, common(), base);
    L.x = g.frontCX - L.w / 2;
    return L;
  }
  /** Design addText(kind): count = layers.length (the design steps y by count % 5). */
  function newText(kind, count, g, id) {
    const n = count % 5;
    return placeText(Object.assign({ y: 230 + n * 18, color: '#1C1C1A', align: 'center', caps: false }, TEXT_PRESETS[kind]), null, g, id);
  }
  /** Design addBook(key) with the book's own words. */
  function newBookText(key, text, g, id) {
    return placeText(Object.assign({ text: String(text || '') }, BOOK_STYLE[key]), key, g, id);
  }
  /** Design addImage(img) for a new layer: 300 px on the long side, centered on the front. */
  function newImage(img, g, id) {
    const side = 300;
    const w = img.natW >= img.natH ? side : side * img.natW / img.natH;
    const h = w * img.natH / img.natW;
    return Object.assign({ id, type: 'image', name: img.name, asset: img.asset == null ? null : img.asset, natW: img.natW, natH: img.natH, transparent: !!img.transparent,
      x: g.frontCX - w / 2, y: Math.max(0, g.H / 2 - h / 2), w, h, px: 0, py: 0, pw: w, ph: h, flipH: false, flipV: false,
      bri: 100, con: 100, sat: 100, blur: 0, dark: 0, look: 'none', bw: 0, bcolor: '#1C1C1A', mask: 'none' }, common());
  }

  // ---------- pictures ----------
  /** Fill the frame (cover): the picture keeps its shape, centered. */
  function coverFit(l, frame) {
    const f = Object.assign({}, l, frame || {});
    const k = Math.max(f.w / l.natW, f.h / l.natH);
    const pw = l.natW * k, ph = l.natH * k;
    return Object.assign(frame || {}, { pw, ph, px: (f.w - pw) / 2, py: (f.h - ph) / 2 });
  }
  const clampPic = (l) => Object.assign({}, l, { px: Math.min(0, Math.max(l.w - l.pw, l.px)), py: Math.min(0, Math.max(l.h - l.ph, l.py)) });
  const dpi = (l) => Math.round(l.natW * 70 / l.pw);

  // ---------- boxes ----------
  function bbox(l, textH) {
    if (l.rot && Math.abs(l.rot % 360) > 0.5) {
      const b0 = bbox(Object.assign({}, l, { rot: 0 }), textH), cx = b0.x + b0.w / 2, cy = b0.y + b0.h / 2, a = l.rot * Math.PI / 180;
      const w = Math.abs(b0.w * Math.cos(a)) + Math.abs(b0.h * Math.sin(a)), h = Math.abs(b0.w * Math.sin(a)) + Math.abs(b0.h * Math.cos(a));
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }
    if (l.type !== 'text') return { x: l.x, y: l.y, w: l.w, h: l.h };
    return { x: l.x, y: l.y, w: l.w, h: (textH || textH0)(l) };
  }
  function overlaps(a, b, textH) {
    const p = bbox(a, textH), q = bbox(b, textH);
    return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
  }

  // ---------- layer list operations (return new arrays) ----------
  /** front / forward / backward / back. Forward and backward jump past the next layer this one really covers. */
  function arrange(layers, id, mode, textH) {
    const a = layers.slice();
    const i = a.findIndex((l) => l.id === id); if (i < 0) return a;
    const L = a[i]; a.splice(i, 1);
    let j = i;
    if (mode === 'front') j = a.length;
    else if (mode === 'back') j = 0;
    else if (mode === 'forward') { let k = i; while (k < a.length && !overlaps(L, a[k], textH)) k++; j = k < a.length ? k + 1 : a.length; }
    else if (mode === 'backward') { let k = i - 1; while (k >= 0 && !overlaps(L, a[k], textH)) k--; j = k >= 0 ? k : 0; }
    a.splice(j, 0, L);
    return a;
  }
  /** Design dupId(): the copy goes just above, 14 px down and right, unlocked, not tied to the book. */
  function dup(layers, id, nextId) {
    const L = layers.find((l) => l.id === id); if (!L) return { layers: layers.slice(), sel: null };
    const i = layers.indexOf(L), a = layers.slice();
    a.splice(i + 1, 0, Object.assign({}, L, { id: nextId, src: null, lock: false, label: L.label ? L.label + ' copy' : L.label, x: L.x + 14, y: L.y + 14 }));
    return { layers: a, sel: nextId };
  }
  /** Design alignMulti(): one layer aligned "to the selection" goes to the front. */
  function align(layers, ids, how, alignTo, g, textH) {
    const L = layers.filter((l) => ids.includes(l.id));
    if (!L.length) return layers.slice();
    const T = C.geo.region(g, L.length === 1 && alignTo === 'sel' ? 'front' : alignTo, L.map((l) => bbox(l, textH)));
    return layers.map((l) => {
      if (!ids.includes(l.id) || l.lock) return l;
      const b = bbox(l, textH), p = {};
      if (how === 'left') p.x = T.x; if (how === 'hcenter') p.x = T.x + T.w / 2 - b.w / 2; if (how === 'right') p.x = T.x + T.w - b.w;
      if (how === 'top') p.y = T.y; if (how === 'vcenter') p.y = T.y + T.h / 2 - b.h / 2; if (how === 'bottom') p.y = T.y + T.h - b.h;
      return Object.assign({}, l, p);
    });
  }
  /** Design distribute(): equal gaps, 3 or more layers. */
  function distribute(layers, ids, axis, textH) {
    const L = layers.filter((l) => ids.includes(l.id));
    if (L.length < 3) return layers.slice();
    const key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
    const items = L.map((l) => ({ id: l.id, b: bbox(l, textH) })).sort((a, b) => a.b[key] - b.b[key]);
    const first = items[0].b, last = items[items.length - 1].b;
    const span = last[key] + last[size] - first[key], used = items.reduce((n, it) => n + it.b[size], 0);
    const gap = (span - used) / (items.length - 1);
    const pos = {}; let at = first[key];
    items.forEach((it) => { pos[it.id] = at; at += it.b[size] + gap; });
    return layers.map((l) => (pos[l.id] != null && !l.lock ? Object.assign({}, l, { [key]: pos[l.id] }) : l));
  }
  /** Arrow keys: 1 px, 10 px with Shift; locked layers stay. */
  function nudge(layers, ids, dx, dy, shift) {
    const n = shift ? 10 : 1;
    return layers.map((l) => (ids.includes(l.id) && !l.lock ? Object.assign({}, l, { x: l.x + dx * n, y: l.y + dy * n }) : l));
  }
  const remove = (layers, ids) => layers.filter((l) => !ids.includes(l.id));
  /** Cmd+A: every layer that is not locked or hidden. */
  const selectAll = (layers) => layers.filter((l) => !l.lock && !l.hidden).map((l) => l.id);

  /** The text bar's size buttons: 1 pt steps under 24, 2 pt from 24, 6 to 160. */
  function sizeStep(size, dir) {
    return dir < 0 ? Math.max(RANGE.size[0], size - (size > 24 ? 2 : 1)) : Math.min(RANGE.size[1], size + (size >= 24 ? 2 : 1));
  }

  // ---------- normalize (on load) ----------
  const HEX = /^#[0-9A-F]{6}$/;
  const hex = (v, d) => { const s = typeof v === 'string' ? v.trim().toUpperCase() : ''; return HEX.test(s) ? s : d; };
  const numIn = (v, r, d) => { const n = Number(v); return v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n) ? d : Math.min(r[1], Math.max(r[0], n)); };
  const fin = (v, d) => { const n = Number(v); return v === null || v === '' || typeof v === 'boolean' || !Number.isFinite(n) ? d : n; };
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const str = (v, max, d) => (typeof v === 'string' ? v.slice(0, max) : d);
  const okId = (v) => (Number.isInteger(v) && v > 0) || (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v));

  function normCommon(l, out) {
    out.x = fin(l.x, 0); out.y = fin(l.y, 0); out.w = Math.max(1, fin(l.w, 100));
    out.rot = numIn(l.rot, RANGE.rot, 0); out.op = numIn(l.op, RANGE.op, 100);
    out.lock = bool(l.lock, false); out.noExport = bool(l.noExport, false); out.hidden = bool(l.hidden, false);
    if (typeof l.label === 'string' && l.label.trim()) out.label = l.label.slice(0, CAPS.label);
    return out;
  }
  function normFx(f) {
    const o = f && typeof f === 'object' ? f : {};
    const r = { style: oneOf(o.style, FX_STYLES.map((x) => x[0]), 'none'), color: hex(o.color, FX_DEF.color) };
    Object.keys(RANGE.fx).forEach((k) => { r[k] = numIn(o[k], RANGE.fx[k], FX_DEF[k]); });
    return r;
  }
  function normDist(d) {
    const o = d && typeof d === 'object' ? d : {};
    const q0 = Array.isArray(o.q) && o.q.length === 4 ? o.q : null;
    const q = [0, 1, 2, 3].map((i) => { const p = q0 && Array.isArray(q0[i]) ? q0[i] : [0, 0]; return [fin(p[0], 0), fin(p[1], 0)]; });
    return { on: bool(o.on, false), mode: oneOf(o.mode, ['basic', 'free'], 'basic'), top: numIn(o.top, RANGE.distTB, 0), bottom: numIn(o.bottom, RANGE.distTB, 0), q };
  }

  /** One layer → a clean layer, or null (no valid id or type). */
  function normalizeLayer(l) {
    if (!l || typeof l !== 'object' || !okId(l.id)) return null;
    if (l.type === 'text') {
      const caps = bool(l.caps, false);
      const o = { id: l.id, type: 'text', src: oneOf(l.src, SRC, null), text: str(l.text, CAPS.text, ''),
        font: str(l.font, 80, '').trim() || 'IBM Plex Sans', size: numIn(l.size, RANGE.size, 12),
        weight: oneOf(Number(l.weight), [100, 200, 300, 400, 500, 600, 700, 800, 900], 400), color: hex(l.color, '#1C1C1A'),
        align: oneOf(l.align, ['left', 'center', 'right'], 'center'), caps, ls: numIn(l.ls, RANGE.ls, caps ? 0.12 : 0),
        fx: normFx(l.fx), curve: numIn(l.curve, RANGE.curve, 0), dist: normDist(l.dist) };
      return normCommon(l, o);
    }
    if (l.type === 'shape') {
      const o = { id: l.id, type: 'shape', kind: oneOf(l.kind, C.shapes.KINDS, 'rect'), h: Math.max(1, fin(l.h, 100)),
        fillMode: oneOf(l.fillMode, ['solid', 'grad', 'none'], 'solid'), fill: hex(l.fill, '#1F3A5F'), fill2: hex(l.fill2, '#E07A5F'),
        gAngle: numIn(l.gAngle, RANGE.gAngle, 90), sw: numIn(l.sw, RANGE.sw, 0), scolor: hex(l.scolor, '#1C1C1A'), dash: oneOf(l.dash, ['solid', 'dash', 'dot'], 'solid'),
        radius: numIn(l.radius, RANGE.radius, 0), points: Math.round(numIn(l.points, RANGE.points, 5)), depth: numIn(l.depth, RANGE.depth, 45),
        head: numIn(l.head, RANGE.head, 40), thick: numIn(l.thick, RANGE.thick, 18), flipH: bool(l.flipH, false), flipV: bool(l.flipV, false) };
      o.name = str(l.name, 40, o.kind);
      return normCommon(l, o);
    }
    if (l.type === 'image') {
      const natW = Math.round(numIn(l.natW, [1, CAPS.natPx], 1000)), natH = Math.round(numIn(l.natH, [1, CAPS.natPx], 1000));
      const o = { id: l.id, type: 'image', name: str(l.name, CAPS.name, 'Picture'), asset: typeof l.asset === 'string' && l.asset ? l.asset.slice(0, 64) : null,
        natW, natH, transparent: bool(l.transparent, false), h: Math.max(1, fin(l.h, 100)),
        px: fin(l.px, 0), py: fin(l.py, 0), pw: fin(l.pw, 0), ph: fin(l.ph, 0), flipH: bool(l.flipH, false), flipV: bool(l.flipV, false),
        bri: numIn(l.bri, RANGE.bri, 100), con: numIn(l.con, RANGE.con, 100), sat: numIn(l.sat, RANGE.sat, 100), blur: numIn(l.blur, RANGE.blur, 0),
        dark: numIn(l.dark, RANGE.dark, 0), look: oneOf(l.look, ['none', 'bw', 'sepia'], 'none'), bw: numIn(l.bw, RANGE.bw, 0), bcolor: hex(l.bcolor, '#1C1C1A'),
        mask: oneOf(l.mask, ['none', 'rounded', 'circle', 'arch'], 'none') };
      normCommon(l, o);
      if (!(o.pw > 0) || !(o.ph > 0)) Object.assign(o, coverFit(o, {}));   // a picture must cover its box
      return o;
    }
    return null;
  }

  /** A whole cover: fmt, bg, at most 200 layers with unique ids, layout key. */
  function normalize(cover) {
    const c = cover && typeof cover === 'object' ? cover : {};
    const seen = new Set(), layers = [];
    for (const raw of Array.isArray(c.layers) ? c.layers : []) {
      const l = normalizeLayer(raw);
      if (!l || seen.has(l.id)) continue;
      seen.add(l.id); layers.push(l);
      if (layers.length >= CAPS.layers) break;
    }
    const known = (k) => (C.layouts && C.layouts.KEYS.includes(k)) || /^my:[A-Za-z0-9_-]{1,64}$/.test(k);
    const layout = typeof c.layout === 'string' && known(c.layout) ? c.layout : null;
    return { fmt: C.geo.normalizeFmt(c.fmt), bg: hex(c.bg, '#FFFFFF'), layers, layout };
  }

  /** The caps the database also checks (0030): 200 layers, 512 KB of layers, 2,000 characters a text. */
  function fits(cover) {
    const layers = (cover && cover.layers) || [];
    if (layers.length > CAPS.layers) return { ok: false, reason: 'layers' };
    if (layers.some((l) => l.type === 'text' && String(l.text).length > CAPS.text)) return { ok: false, reason: 'text' };
    const bytes = new TextEncoder().encode(JSON.stringify(layers)).length;
    if (bytes > CAPS.bytes) return { ok: false, reason: 'bytes', bytes };
    return { ok: true, bytes };
  }

  /** The next free number id. */
  const nextId = (layers) => layers.reduce((m, l) => (Number.isInteger(l.id) && l.id >= m ? l.id + 1 : m), 1);

  C.model = {
    PT, FONTS, PRESETS, FX_DEF, FX_STYLES, SRC, CAPS, RANGE, TEXT_PRESETS, BOOK_STYLE,
    common, freshDist, textLayer, shapeLayer, imageLayer, placeText, newText, newBookText, newImage,
    coverFit, clampPic, dpi, bbox, overlaps, arrange, dup, align, distribute, nudge, remove, selectAll, sizeStep,
    normalizeLayer, normalize, fits, nextId
  };
})(globalThis);
