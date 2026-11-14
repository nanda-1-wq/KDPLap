/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Kindle front (E16 Part 1)
   /js/cover/kindle.js   (pure, no DOM; tested by tests/cover-kindle.test.js)

   The Kindle eBook cover is made from the print front (owner A2): cut at
   the trim, then to 1 : 1.6 by trimming the sides. For wide trims (8 × 10,
   8.5 × 11) that cut would pass the 0.375 in safe margin (geo kFit), so the
   front is scaled to the width and the background color fills above and
   below instead (design S13, Nov 13).

   kdpCover.kindle.SIZE          → { w: 1600, h: 2560 }
   kdpCover.kindle.plan(g, box)  → how to paint the front into a box (default 1600 × 2560):
       { mode: 'cut' | 'fit', scale, src: {x, y, w, h} board px, dst: {x, y, w, h} box px, pad }
   kdpCover.kindle.transform(g, w, h) → the design's preview CSS transform for a w × h box
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const SIZE = { w: 1600, h: 2560 };

  function plan(g, box) {
    const B = box || SIZE;
    if (g.kFit) {
      const scale = B.w / g.trimW, h = g.trimH * scale, pad = (B.h - h) / 2;
      return { mode: 'fit', scale, src: { x: g.foldR, y: g.b, w: g.trimW, h: g.trimH }, dst: { x: 0, y: pad, w: B.w, h }, pad };
    }
    const scale = B.h / g.kH;
    return { mode: 'cut', scale, src: { x: g.kx, y: g.ky, w: g.kW, h: g.kH }, dst: { x: 0, y: 0, w: g.kW * scale, h: B.h }, pad: 0 };
  }

  /** The design's pvKindleInner (200 × 320) and pvThumbInner (75 × 120) transforms, as strings. */
  function transform(g, w, h) {
    return g.kFit ? 'translate(0px,' + (h - g.trimH * w / g.trimW) / 2 + 'px) scale(' + w / g.trimW + ') translate(' + -g.foldR + 'px,' + -g.b + 'px)'
      : 'scale(' + (h / g.kH) + ') translate(' + -g.kx + 'px,' + -g.ky + 'px)';
  }

  C.kindle = { SIZE, plan, transform };
})(globalThis);
