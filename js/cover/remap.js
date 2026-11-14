/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: size remap (E16 Part 1)
   /js/cover/remap.js   (pure, no DOM; tested by tests/cover-remap.test.js)

   The design's remap(), unchanged: each layer keeps its place on its own
   panel (back, spine, front). Layers that span a whole panel or the whole
   wrap stretch with it; the rest keep their shape and scale with the panel.
   Text stays inside the live area with our 0.375 in margin. Picture crops
   reset (coverFit), as in the design (plan X5). "Moved" counts x, y and w.

   Text heights come from opt.textH (default kdpCover.textlayout.height).

   kdpCover.remap.remap(layers, A, B, opt)    → { layers, moved: [ids] }   (A, B = kdpCover.geo.geo(fmt))
   kdpCover.remap.changeFormat(cover, fmt, opt) → { cover, lastRemap } or null when the size is the same
   kdpCover.remap.noteText(n) / noteSub(n)    → the amber note's words (design F72)
   kdpCover.remap.spineNew(n, layers)         → true when the change makes spine text possible and there is none
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  function remap(layers, A, B, opt) {
    const textH = (opt && opt.textH) || ((l) => C.textlayout.height(l));
    const M = C.model;
    if (A.W === B.W && A.H === B.H && A.foldL === B.foldL && A.foldR === B.foldR) return { layers: layers.map((l) => Object.assign({}, l)), moved: [] };
    const sy = B.H / A.H, moved = [];
    const out = layers.map((l) => {
      const c = Object.assign({}, l), bb = M.bbox(l, textH), cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
      const full = bb.w >= A.W * 0.9;
      const panel = cx < A.foldL ? 'back' : cx > A.foldR ? 'front' : 'spine';
      const pA = panel === 'back' ? { x: 0, w: A.foldL } : panel === 'front' ? { x: A.foldR, w: A.W - A.foldR } : null;
      const pB = panel === 'back' ? { x: 0, w: B.foldL } : panel === 'front' ? { x: B.foldR, w: B.W - B.foldR } : null;
      const sx = full ? B.W / A.W : pA ? pB.w / pA.w : 1;
      const spanX = full || (pA && l.w >= pA.w * 0.9), spanY = l.type !== 'text' && (l.h || 0) >= A.H * 0.9;
      const k = Math.min(sx, sy);
      const mapX = (x) => (full ? x * sx : pA ? pB.x + (x - pA.x) * sx : x + (B.foldL + B.foldR) / 2 - (A.foldL + A.foldR) / 2);
      if (spanX) { c.x = mapX(l.x); c.w = l.w * sx; } else { c.w = l.w * k; c.x = mapX(cx) - c.w / 2; }
      if (l.type === 'text') {
        const h0 = M.bbox(Object.assign({}, l, { rot: 0 }), textH).h;
        c.size = Math.round(l.size * k * 2) / 2; c.y = cy * sy - (h0 * k) / 2;
        // keep words inside the live area with our 0.375 in margin (the bleed does not scale)
        const lv = panel === 'back' ? B.liveBack : panel === 'front' ? B.liveFront : null;
        if (lv && !l.rot) {
          const x0 = lv.x0 + 17.5, x1 = lv.x1 - 17.5;
          if (c.w > x1 - x0) { const mid = c.x + c.w / 2; c.w = x1 - x0; c.x = mid - c.w / 2; }
          if (c.x < x0) c.x = x0; if (c.x + c.w > x1) c.x = x1 - c.w;
        }
      }
      else if (spanY) { c.y = l.y * sy; c.h = l.h * sy; }
      else { c.h = l.h * (spanX ? sy : k); c.y = cy * sy - c.h / 2; }
      if (l.type === 'image') Object.assign(c, M.coverFit(c, {}));
      if (Math.abs(c.x - l.x) > 0.5 || Math.abs(c.y - l.y) > 0.5 || Math.abs(c.w - l.w) > 0.5) moved.push(l.id);
      return c;
    });
    return { layers: out, moved };
  }

  /** On 09 open: the design moved to the current size, and the note's data. */
  function changeFormat(cover, fmt, opt) {
    const from = C.geo.normalizeFmt(cover.fmt), to = C.geo.normalizeFmt(fmt);
    if (from.trim === to.trim && from.pages === to.pages && from.paper === to.paper) return null;
    const A = C.geo.geo(from), B = C.geo.geo(to);
    const r = remap(cover.layers, A, B, opt);
    const lastRemap = { from, to, moved: r.moved, spineFrom: A.sp, spineTo: B.sp };
    return { cover: Object.assign({}, cover, { fmt: to, layers: r.layers }), lastRemap };
  }

  function noteText(n) {
    const parts = [];
    if (n.from.trim !== n.to.trim) parts.push('trim ' + n.from.trim.replace('x', ' × ') + ' → ' + n.to.trim.replace('x', ' × ') + ' in');
    if (n.from.pages !== n.to.pages) parts.push(n.from.pages + ' → ' + n.to.pages + ' pages');
    if (n.from.paper !== n.to.paper) parts.push(n.from.paper + ' → ' + n.to.paper + ' paper');
    return 'Your book changed in 08 Format: ' + parts.join(', ') + '. Spine ' + n.spineFrom.toFixed(3) + ' → ' + n.spineTo.toFixed(3) + ' in. NicheInk moved your design to fit.';
  }
  function noteSub(n) {
    const m = n.moved.length;
    return m ? m + ' layer' + (m === 1 ? '' : 's') + ' moved. Check them, then export again: your old files no longer fit.' : 'Nothing needed to move. Export again: your old files no longer fit.';
  }
  const spineNew = (n, layers) => C.geo.geo(n.to).spineTextOk && !C.geo.geo(n.from).spineTextOk && !layers.some((l) => l.src === 'spine');

  C.remap = { remap, changeFormat, noteText, noteSub, spineNew };
})(globalThis);
