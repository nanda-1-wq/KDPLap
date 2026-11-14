/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: geometry (E16 Part 1)
   /js/cover/geo.js   (pure, no DOM; tested by tests/cover-geo.test.js)

   Ported from design/screens/58-09-cover-new.html, geo(), regionBox(),
   quadOf() and quadMatrix(). The board is 70 px per inch, with the origin
   at the top left of the full wrap with bleed. 1 pt = 70/72 px.

   The spine per page comes from 08 (kdpFormatRules.SPINE_PER_PAGE), so
   js/format-rules.js must be loaded first. The spine is NOT rounded here
   (the design does not round; 08's spine() rounds to 4 decimals for its
   label only).

   kdpCover.geo.TRIMS            → the 6 trims 09 draws (08 has group A only)
   kdpCover.geo.normalizeFmt(f)  → { trim, pages, paper } with safe values
   kdpCover.geo.geo(f)           → every board number for one size (design names)
   kdpCover.geo.region(g, key, boxes) → an align target (front, back, spine, cover, sel)
   kdpCover.geo.quadOf(l, h)     → the 4 distortion corners of a text box
   kdpCover.geo.homography(w, h, P) → the 3 × 3 map from the box to 4 corners
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const I = 70;                 // board px per inch
  const PT = 70 / 72;           // board px per pt
  const BLEED = 8.75;           // 0.125 in
  const TRIMS = ['5x8', '5.25x8', '5.5x8.5', '6x9', '8x10', '8.5x11'];
  const PAPERS = ['white', 'cream'];
  const PAGES_MAX = 828;        // KDP paperback limit
  // spine text from: cream 80 (E15 rule, owner Q-9); white 86, where 7 pt IBM Plex Sans capitals fit inside
  // the 0.0625 in fold margins (owner STOP 1, N1; the design says 84)
  const SPINE_MIN = { white: 86, cream: 80 };

  const perPage = (paper) => {
    const fr = root.kdpFormatRules;
    if (!fr || !fr.SPINE_PER_PAGE) throw new Error('kdpCover.geo needs js/format-rules.js (SPINE_PER_PAGE)');
    return fr.SPINE_PER_PAGE[paper === 'cream' ? 'cream' : 'white'];
  };

  /** A size the board can draw: a known trim, whole pages 1 to 828, white or cream. */
  function normalizeFmt(f) {
    const o = f || {};
    const trim = TRIMS.includes(o.trim) ? o.trim : '6x9';
    const n = Math.round(Number(o.pages));
    const pages = Number.isFinite(n) ? Math.min(PAGES_MAX, Math.max(1, n)) : 24;
    const paper = o.paper === 'cream' ? 'cream' : 'white';
    return { trim, pages, paper };
  }

  /** The design's geo(f), field for field. */
  function geo(fIn) {
    const f = normalizeFmt(fIn);
    const [tw, th] = f.trim.split('x').map(Number);
    const b = BLEED, sp = f.pages * perPage(f.paper);
    const trimW = tw * I, trimH = th * I, spine = sp * I;
    const foldL = b + trimW, foldR = foldL + spine, W = foldR + trimW + b, H = trimH + 2 * b;
    const kW = Math.min(trimW, trimH / 1.6);
    const spineMin = SPINE_MIN[f.paper];
    return {
      f, tw, th, sp, I, b, trimW, trimH, spine, foldL, foldR, W, H, frontCX: foldR + trimW / 2,
      liveBack: { x0: 2 * b, x1: foldL - b, y0: 2 * b, y1: H - 2 * b },
      liveFront: { x0: foldR + b, x1: W - 2 * b, y0: 2 * b, y1: H - 2 * b },
      barcode: { x: foldL - 17.5 - 140, y: H - b - 17.5 - 84, w: 140, h: 84 },
      kx: foldR + (trimW - kW) / 2, ky: b, kW, kH: trimH, kCut: (trimW - kW) / 2 / I,
      // wide trims: cutting the sides would reach the safe area, so the Kindle cover adds background above and below
      kFit: (trimW - kW) / 2 / I > 0.375,
      spineMin, spineTextOk: f.pages >= spineMin
    };
  }

  /** Full wrap in inches and the 300 DPI image size. */
  const wrapIn = (g) => ({ w: g.W / I, h: g.H / I });
  // rounded up, so the image is never narrower than the wrap (owner STOP 1, N5; the design rounds: 3711 for 6 × 9 / 54)
  const up = (v) => Math.ceil(v - 1e-9);
  const px300 = (g) => ({ w: up(g.W / I * 300), h: up(g.H / I * 300) });

  /** The design's regionBox(): align targets are KDP's live areas, or the selection's own box. */
  function region(g, key, boxes) {
    const lf = g.liveFront, lb = g.liveBack;
    if (key === 'front') return { x: lf.x0, y: lf.y0, w: lf.x1 - lf.x0, h: lf.y1 - lf.y0 };
    if (key === 'back') return { x: lb.x0, y: lb.y0, w: lb.x1 - lb.x0, h: lb.y1 - lb.y0 };
    if (key === 'spine') return { x: g.foldL, y: lb.y0, w: g.spine, h: lb.y1 - lb.y0 };
    if (key === 'cover') return { x: lb.x0, y: lb.y0, w: lf.x1 - lb.x0, h: lb.y1 - lb.y0 };
    const x0 = Math.min(...boxes.map((q) => q.x)), y0 = Math.min(...boxes.map((q) => q.y));
    const x1 = Math.max(...boxes.map((q) => q.x + q.w)), y1 = Math.max(...boxes.map((q) => q.y + q.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** The design's quadOf(): TL, TR, BR, BL in the box's own px. h = the text height. */
  function quadOf(l, h) {
    const w = l.w, D = l.dist;
    if (D.mode === 'basic') {
      const t = D.top / 100 * w / 2, bt = D.bottom / 100 * w / 2;
      return [[-t, 0], [w + t, 0], [w + bt, h], [-bt, h]];
    }
    const q = D.q;
    return [[q[0][0], q[0][1]], [w + q[1][0], q[1][1]], [w + q[2][0], h + q[2][1]], [q[3][0], h + q[3][1]]];
  }

  /**
   * The design's quadMatrix() as numbers: maps (u, v) in the w × h box to
   * x = (a·u/w + b·v/h + c) / (g·u/w + hh·v/h + 1), y likewise with d, e, f.
   * → { a, b, c, d, e, f, g, hh, w, h, map(u, v) → [x, y] }
   */
  function homography(w, h, P) {
    const [x0, y0] = P[0], [x1, y1] = P[1], [x2, y2] = P[2], [x3, y3] = P[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = 0; hh = 0; }
    else {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    const map = (u, v) => {
      const s = u / w, t = v / h, z = g * s + hh * t + 1;
      return [(a * s + b * t + c) / z, (d * s + e * t + f) / z];
    };
    return { a, b, c, d, e, f, g, hh, w, h, map };
  }

  C.geo = { I, PT, BLEED, TRIMS, PAPERS, PAGES_MAX, SPINE_MIN, normalizeFmt, geo, wrapIn, px300, region, quadOf, homography };
})(globalThis);
