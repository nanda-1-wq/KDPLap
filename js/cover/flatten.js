/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the flatten plan (E16 Part 2, plan §1)
   /js/cover/flatten.js   (pure, no DOM; needs geo.js, textlayout.js, model.js;
                           tested by tests/cover-flatten.test.js)

   Says, for one cover, what the Print PDF draws as vector and what becomes
   an opaque 300 DPI picture ("patch"). KDP takes one sRGB color space and no
   transparency (coverChecks), so anything see-through, any picture and any
   gradient is baked into a patch with what is under it.

   Flattened (plan §1, the B2 change, S4b, S6; STOP 2 findings):
   - opacity under 100 (any layer);
   - an image of any kind (crop, filters, darken, mask, border, flip baked in;
     a transparent PNG with what shows through it);
   - text distortion;
   - glow, lift and echo (echo is a stroke-only copy, see below);
   - a shadow or background effect with strength under 100 or softness over 0;
   - a gradient fill: Typst 0.14.2 writes a gradient as a /Pattern color space
     (a second color space; STOP 2 spike), so R7 applies;
   - hollow text (D17, owner STOP 2): Typst cannot draw letters without a fill
     (fill none does not compile; a clear fill is transparency); echo (a
     stroke-only copy) is an effect patch for the same reason.
   What a patch holds: only the raster part and what is under it.
   - For a text effect the patch holds the effect alone; the letters stay
     vector on top (the "effect" class).
   - The letters are raster only when the text's opacity is under 100, it is
     distorted, or hollow (the "raster" class).
   - The patch box grows to hold any whole vector layer under it that it cuts,
     so no text is split; that layer is then drawn inside the patch only.
     Layers above stay vector.
   Boxes are whole pixels of one 300 DPI grid from the top left of the full
   wrap with bleed, so every seam falls on the same pixel lines.

   kdpCover.flatten.DPI                     → 300
   kdpCover.flatten.classify(l)             → { cls: 'vector' | 'effect' | 'raster', why: [reason] }
   kdpCover.flatten.extent(l, textH)        → the board box that holds every pixel the layer paints (rotation, effects)
   kdpCover.flatten.grid(box, g)            → { x0, y0, x1, y1 } 300 DPI pixels, on the page
   kdpCover.flatten.printable(layers)       → the layers that print (not hidden, not excluded)
   kdpCover.flatten.plan(cover, opt)        → { items, patches, layers, px }
       items in paint order: { kind: 'vector', id, part: 'all' | 'letters' } and
       { kind: 'patch', n, box (grid px), upTo (index in layers), effectOnly (id or null), holds: [ids] }
       opt.textH(l) (default textlayout.height), opt.gradients: 'flatten' (default) | 'vector'
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const DPI = 300;

  const printable = (layers) => (layers || []).filter((l) => !l.hidden && !l.noExport);

  /** The effect is see-through (strength under 100, or a blur). */
  function fxRaster(fx) {
    if (!fx) return false;
    if (fx.style === 'glow' || fx.style === 'lift' || fx.style === 'echo') return true;
    if (fx.style === 'shadow') return fx.int < 100 || fx.blur > 0;
    if (fx.style === 'bg') return Math.max(0.15, fx.int / 100) < 1;
    return false;
  }

  function classify(l, opt) {
    const why = [];
    const o = opt || {};
    if (l.op < 100) why.push('opacity');
    if (l.type === 'image') why.push(l.transparent ? 'transparent picture' : 'picture');
    if (l.type === 'shape' && l.fillMode === 'grad' && l.kind !== 'line' && o.gradients !== 'vector') why.push('gradient');
    if (l.type === 'text') {
      if (l.dist && l.dist.on) why.push('distortion');
      if (l.fx && l.fx.style === 'hollow') why.push('hollow');
      if (why.length) return { cls: 'raster', why };
      if (fxRaster(l.fx)) return { cls: 'effect', why: [`effect ${l.fx.style}`] };
      return { cls: 'vector', why };
    }
    return { cls: why.length ? 'raster' : 'vector', why };
  }

  /** Rotate a box's corners around its center; the bounding box. */
  function rotBox(b, cx, cy, deg) {
    if (!deg || Math.abs(deg % 360) < 1e-9) return b;
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** How far a text effect reaches outside the box, board px. */
  function fxReach(fx) {
    if (!fx || fx.style === 'none') return { l: 0, r: 0, t: 0, b: 0 };
    const rad = fx.dir * Math.PI / 180, ox = Math.cos(rad) * fx.dist, oy = Math.sin(rad) * fx.dist;
    const around = (dx, dy, spread) => ({ l: Math.max(0, -dx) + spread, r: Math.max(0, dx) + spread, t: Math.max(0, -dy) + spread, b: Math.max(0, dy) + spread });
    switch (fx.style) {
      case 'shadow': return around(ox, oy, fx.blur * 1.5);
      case 'lift': return around(0, fx.dist * 0.6, Math.max(4, fx.blur * 2) * 1.5);
      case 'glow': return around(0, 0, fx.blur * 3);
      case 'outline': return around(0, 0, fx.width);
      case 'hollow': return around(0, 0, fx.width / 2);
      case '3d': return around(Math.cos(rad) * fx.depth, Math.sin(rad) * fx.depth, 0);
      case 'echo': return around(ox, oy, Math.max(1, fx.width * 0.6));
      case 'bg': return { l: fx.pad, r: fx.pad, t: fx.pad * 0.5, b: fx.pad * 0.5 };
      default: return { l: 0, r: 0, t: 0, b: 0 };
    }
  }

  /** Every pixel the layer paints, board px (a safe box: letters may reach past the line box). */
  function extent(l, textH) {
    const th = textH || ((x) => C.textlayout.height(x));
    if (l.type === 'text') {
      const TL = C.textlayout, h = th(l), px = l.size * C.geo.PT;
      // Letters reach past the line box: the font's ascender and descender (CSS centers them in the 1.15 line),
      // plus side bearings and swashes. A safe margin, not the exact ink.
      const m = TL.metricsOf(l.font, l.weight);
      const inkY = Math.max(0, ((m.asc + m.desc) * px - TL.lineH(l)) / 2) + 0.15 * px + 2;
      const inkX = 0.3 * px + 2;
      // Plain text: only the part of the box the lines use (centered text leaves the sides empty).
      let x0 = 0, x1 = l.w;
      if (!l.curve && !(l.dist && l.dist.on) && !(l.fx && l.fx.style === 'bg')) {   // the background plate spans the whole box
        const runs = TL.lines(l).map((ln) => ({ x: l.align === 'center' ? (l.w - ln.width) / 2 : l.align === 'right' ? l.w - ln.width : 0, w: ln.width }));
        if (runs.length) { x0 = Math.min(...runs.map((r) => r.x)); x1 = Math.max(...runs.map((r) => r.x + r.w)); }
      }
      const r = fxReach(l.fx);
      const ink = Math.max(inkX, inkY);
      let b = { x: l.x + x0 - r.l - inkX, y: l.y - r.t - inkY, w: x1 - x0 + r.l + r.r + 2 * inkX, h: h + r.t + r.b + 2 * inkY };
      if (l.dist && l.dist.on) {
        const q = C.geo.quadOf(l, h);
        const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
        const qb = { x: l.x + Math.min(...xs), y: l.y + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const k = Math.max(qb.w / Math.max(1, l.w), qb.h / Math.max(1, h), 1);
        const m = (Math.max(r.l, r.r, r.t, r.b) + ink) * k;
        b = { x: Math.min(b.x, qb.x - m), y: Math.min(b.y, qb.y - m), w: 0, h: 0, x1: Math.max(b.x + b.w, qb.x + qb.w + m), y1: Math.max(b.y + b.h, qb.y + qb.h + m) };
        b.w = b.x1 - b.x; b.h = b.y1 - b.y; delete b.x1; delete b.y1;
      }
      return rotBox(b, l.x + l.w / 2, l.y + h / 2, l.rot);
    }
    const sw = l.type === 'shape' ? (l.sw || 0) * C.geo.PT : 0;
    const pad = sw / 2 + 1;
    return rotBox({ x: l.x - pad, y: l.y - pad, w: l.w + 2 * pad, h: l.h + 2 * pad }, l.x + l.w / 2, l.y + l.h / 2, l.rot);
  }

  /** A board box → whole 300 DPI pixels, clipped to the page. */
  function grid(b, g) {
    const k = DPI / C.geo.I, P = C.geo.px300(g);
    const x0 = Math.max(0, Math.floor(b.x * k)), y0 = Math.max(0, Math.floor(b.y * k));
    const x1 = Math.min(P.w, Math.ceil((b.x + b.w) * k)), y1 = Math.min(P.h, Math.ceil((b.y + b.h) * k));
    return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  }
  const cuts = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const inside = (a, b) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
  const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

  function plan(cover, opt) {
    const o = opt || {};
    const g = C.geo.geo(cover.fmt);
    const layers = printable(cover.layers);
    const textH = o.textH || ((x) => C.textlayout.height(x));
    const boxes = layers.map((l) => grid(extent(l, textH), g));
    const items = [];
    const patches = [];
    layers.forEach((l, i) => {
      const c = classify(l, o);
      if (c.cls === 'vector') { items.push({ kind: 'vector', id: l.id, idx: i, part: 'all' }); return; }
      let box = boxes[i];
      // Grow until no vector part under the patch is cut; those parts move into the patch.
      for (let changed = true; changed;) {
        changed = false;
        for (const it of items) {
          if (it.kind !== 'vector' || it.held) continue;
          const b = boxes[it.idx];
          if (cuts(b, box) && !inside(b, box)) { box = union(box, b); changed = true; }
        }
      }
      const holds = [];
      for (const it of items) {
        if (it.kind === 'vector' && !it.held && cuts(boxes[it.idx], box)) { it.held = true; holds.push(it.id); }
      }
      const p = { kind: 'patch', n: patches.length + 1, box, upTo: i, id: l.id, effectOnly: c.cls === 'effect' ? l.id : null, why: c.why, holds };
      patches.push(p);
      items.push(p);
      if (c.cls === 'effect') items.push({ kind: 'vector', id: l.id, idx: i, part: 'letters' });
    });
    const out = items.filter((it) => !(it.kind === 'vector' && it.held)).map((it) => {
      const { held, ...rest } = it;
      return rest;
    });
    return { items: out, patches, layers, px: C.geo.px300(g), g };
  }

  C.flatten = { DPI, classify, fxRaster, fxReach, extent, rotBox, grid, printable, plan };
})(globalThis);
