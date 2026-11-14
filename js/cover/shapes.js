/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: shapes (E16 Part 1)
   /js/cover/shapes.js   (pure, no DOM; tested by tests/cover-shapes.test.js)

   The 27 shapes are our own path code, ported unchanged from the design's
   shapePath() (design/screens/58-09-cover-new.html). Paths are in the
   layer's own px (w × h), so corners and strokes never stretch.

   For the print PDF (Part 2) an SVG path becomes a Typst curve: arcs turn
   into cubic Béziers, every subpath closes straight (Typst's default close
   is smooth), and the fill rule is even-odd, as the design's SVG draws it
   (frame and ring need it for their holes).

   kdpCover.shapes.LIST            → [[kind, label]] in the panel order (27)
   kdpCover.shapes.path(l)         → SVG path d (the design's string, exactly)
   kdpCover.shapes.defaults(kind, g) → a new shape layer's fields (design addShape)
   kdpCover.shapes.swapKind(l, kind) → the patch when the user picks another shape
   kdpCover.shapes.parse(d)        → absolute segments [{ op, pts }]
   kdpCover.shapes.toCurves(d)     → subpaths of move / line / cubic / quad / close (no arcs)
   kdpCover.shapes.typstCurve(d, o) → 'curve.move((…pt, …pt)), …' for Typst's curve()
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const LIST = [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['ellipse', 'Circle'], ['semicircle', 'Half circle'], ['triangle', 'Triangle'], ['diamond', 'Diamond'],
    ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['parallelogram', 'Slant'], ['trapezoid', 'Trapezoid'], ['heart', 'Heart'],
    ['star', 'Star'], ['burst', 'Badge'], ['seal', 'Seal'], ['shield', 'Shield'], ['moon', 'Moon'], ['cloud', 'Cloud'],
    ['frame', 'Frame'], ['ring', 'Ring'], ['speech', 'Speech'], ['plus', 'Plus'], ['cross', 'Cross'], ['chevron', 'Chevron'],
    ['arrow', 'Arrow'], ['ribbon', 'Ribbon'], ['line', 'Line']];
  const KINDS = LIST.map((x) => x[0]);

  // ---- the design's shapePath(), unchanged ----
  function path(l) {
    const w = l.w, h = l.h, f = (n) => +n.toFixed(2);
    const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join(' L') + ' Z';
    switch (l.kind) {
      case 'rect': case 'rounded': {
        const r = Math.min(l.radius || 0, w / 2, h / 2);
        if (!r) return poly([[0, 0], [w, 0], [w, h], [0, h]]);
        return 'M' + r + ' 0 H' + f(w - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + f(w) + ' ' + r + ' V' + f(h - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + f(w - r) + ' ' + f(h) + ' H' + r + ' A' + r + ' ' + r + ' 0 0 1 0 ' + f(h - r) + ' V' + r + ' A' + r + ' ' + r + ' 0 0 1 ' + r + ' 0 Z';
      }
      case 'ellipse': return 'M0 ' + f(h / 2) + ' A' + f(w / 2) + ' ' + f(h / 2) + ' 0 1 0 ' + f(w) + ' ' + f(h / 2) + ' A' + f(w / 2) + ' ' + f(h / 2) + ' 0 1 0 0 ' + f(h / 2) + ' Z';
      case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
      case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case 'star': case 'burst': {
        const n = l.points || 5, inner = (l.depth || 50) / 100, pts = [];
        for (let i = 0; i < n * 2; i++) {
          const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? inner : 1;
          pts.push([w / 2 + Math.cos(a) * rr * w / 2, h / 2 + Math.sin(a) * rr * h / 2]);
        }
        return poly(pts);
      }
      case 'arrow': { const hd = Math.min(w * 0.9, (l.head || 40) / 100 * w), t = h * 0.32; return poly([[0, t], [w - hd, t], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, h - t], [0, h - t]]); }
      case 'ribbon': { const n2 = Math.min(w / 4, h * 0.6); return poly([[0, 0], [w, 0], [w - n2, h / 2], [w, h], [0, h], [n2, h / 2]]); }
      case 'line': return 'M0 ' + f(h / 2) + ' H' + f(w);
      case 'semicircle': return 'M0 ' + f(h) + ' A' + f(w / 2) + ' ' + f(h) + ' 0 0 1 ' + f(w) + ' ' + f(h) + ' Z';
      case 'pentagon': return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
      case 'hexagon': return poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]);
      case 'octagon': { const c = 0.29; return poly([[w * c, 0], [w * (1 - c), 0], [w, h * c], [w, h * (1 - c)], [w * (1 - c), h], [w * c, h], [0, h * (1 - c)], [0, h * c]]); }
      case 'parallelogram': return poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]]);
      case 'trapezoid': return poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]]);
      case 'chevron': return poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]]);
      case 'plus': { const a = 0.35, b = 0.65; return poly([[a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b], [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a]].map((q) => [q[0] * w, q[1] * h])); }
      case 'cross': { const t = 0.18; return poly([[t, 0], [0.5, 0.5 - t], [1 - t, 0], [1, t], [0.5 + t, 0.5], [1, 1 - t], [1 - t, 1], [0.5, 0.5 + t], [t, 1], [0, 1 - t], [0.5 - t, 0.5], [0, t]].map((q) => [q[0] * w, q[1] * h])); }
      case 'heart': {
        const P = (x, y) => f(x * w) + ' ' + f(y * h);
        return 'M' + P(0.5, 0.95) + ' C' + P(0.12, 0.66) + ' ' + P(0, 0.45) + ' ' + P(0, 0.28) + ' C' + P(0, 0.1) + ' ' + P(0.14, 0) + ' ' + P(0.28, 0) + ' C' + P(0.38, 0) + ' ' + P(0.46, 0.06) + ' ' + P(0.5, 0.16) + ' C' + P(0.54, 0.06) + ' ' + P(0.62, 0) + ' ' + P(0.72, 0) + ' C' + P(0.86, 0) + ' ' + P(1, 0.1) + ' ' + P(1, 0.28) + ' C' + P(1, 0.45) + ' ' + P(0.88, 0.66) + ' ' + P(0.5, 0.95) + ' Z';
      }
      case 'seal': {
        const pts = [], n = 12;
        for (let i = 0; i < 144; i++) { const a = i / 144 * Math.PI * 2, rr = 0.9 + 0.1 * Math.cos(n * a); pts.push([w / 2 + Math.cos(a) * rr * w / 2, h / 2 + Math.sin(a) * rr * h / 2]); }
        return poly(pts);
      }
      case 'shield': return 'M0 0 H' + f(w) + ' V' + f(h * 0.45) + ' C' + f(w) + ' ' + f(h * 0.75) + ' ' + f(w * 0.7) + ' ' + f(h * 0.9) + ' ' + f(w / 2) + ' ' + f(h) + ' C' + f(w * 0.3) + ' ' + f(h * 0.9) + ' 0 ' + f(h * 0.75) + ' 0 ' + f(h * 0.45) + ' Z';
      case 'moon': return 'M' + f(w / 2) + ' 0 A' + f(w / 2) + ' ' + f(h / 2) + ' 0 1 0 ' + f(w / 2) + ' ' + f(h) + ' A' + f(w * 0.3) + ' ' + f(h / 2) + ' 0 0 1 ' + f(w / 2) + ' 0 Z';
      case 'cloud': {
        const P = (x, y) => f(x * w) + ' ' + f(y * h);
        return 'M' + P(0.22, 0.9) + ' A' + f(0.2 * w) + ' ' + f(0.22 * h) + ' 0 0 1 ' + P(0.18, 0.48) + ' A' + f(0.24 * w) + ' ' + f(0.3 * h) + ' 0 0 1 ' + P(0.6, 0.28) + ' A' + f(0.22 * w) + ' ' + f(0.25 * h) + ' 0 0 1 ' + P(0.9, 0.55) + ' A' + f(0.18 * w) + ' ' + f(0.2 * h) + ' 0 0 1 ' + P(0.8, 0.9) + ' Z';
      }
      case 'speech': {
        const hb = h * 0.78, r = Math.min(w, hb) * 0.1;
        return 'M' + f(r) + ' 0 H' + f(w - r) + ' Q' + f(w) + ' 0 ' + f(w) + ' ' + f(r) + ' V' + f(hb - r) + ' Q' + f(w) + ' ' + f(hb) + ' ' + f(w - r) + ' ' + f(hb) + ' H' + f(w * 0.42) + ' L' + f(w * 0.22) + ' ' + f(h) + ' L' + f(w * 0.26) + ' ' + f(hb) + ' H' + f(r) + ' Q0 ' + f(hb) + ' 0 ' + f(hb - r) + ' V' + f(r) + ' Q0 0 ' + f(r) + ' 0 Z';
      }
      case 'frame': {
        const t = Math.max(2, (l.thick || 18) / 100 * Math.min(w, h) / 2);
        return poly([[0, 0], [w, 0], [w, h], [0, h]]) + ' ' + poly([[t, t], [w - t, t], [w - t, h - t], [t, h - t]]);
      }
      case 'ring': {
        const t = Math.max(2, (l.thick || 18) / 100 * Math.min(w, h) / 2), rx = w / 2, ry = h / 2, ix = Math.max(1, rx - t), iy = Math.max(1, ry - t);
        const el = (ax, ay) => 'M' + f(w / 2 - ax) + ' ' + f(h / 2) + ' A' + f(ax) + ' ' + f(ay) + ' 0 1 0 ' + f(w / 2 + ax) + ' ' + f(h / 2) + ' A' + f(ax) + ' ' + f(ay) + ' 0 1 0 ' + f(w / 2 - ax) + ' ' + f(h / 2) + ' Z';
        return el(rx, ry) + ' ' + el(ix, iy);
      }
      default: return '';
    }
  }

  /** The design's addShape() fields (without id and the common fields). g = kdpCover.geo.geo(fmt). */
  function defaults(kind, g) {
    const line = kind === 'line';
    const wide = ['arrow', 'ribbon', 'parallelogram', 'chevron'].includes(kind);
    const w = line ? 260 : wide ? 240 : kind === 'semicircle' ? 200 : 160, h = line ? 24 : wide ? 90 : kind === 'semicircle' ? 100 : 160;
    return { type: 'shape', kind, x: g.frontCX - w / 2, y: g.H / 2 - h / 2, w, h,
      fillMode: line ? 'none' : 'solid', fill: '#1F3A5F', fill2: '#E07A5F', gAngle: 90,
      sw: line ? 3 : 0, scolor: '#1C1C1A', dash: 'solid', radius: kind === 'rounded' ? 24 : 0,
      points: kind === 'burst' ? 14 : 5, depth: kind === 'burst' ? 82 : 45, head: 40, thick: 18, flipH: false, flipV: false, name: kind };
  }

  /** The design's swap: the patch when the selected shape becomes another kind. */
  function swapKind(L0, kind) {
    return { kind, radius: kind === 'rounded' ? Math.max(L0.radius, 16) : kind === 'rect' ? 0 : L0.radius,
      points: kind === 'burst' ? 14 : kind === 'star' ? 5 : L0.points, depth: kind === 'burst' ? 82 : kind === 'star' ? 45 : L0.depth,
      fillMode: kind === 'line' ? 'none' : L0.fillMode === 'none' && L0.kind === 'line' ? 'solid' : L0.fillMode,
      sw: kind === 'line' && !L0.sw ? 3 : L0.sw, h: kind === 'line' ? 24 : L0.kind === 'line' ? L0.w * 0.6 : L0.h };
  }

  // ---- SVG path → absolute segments ----
  const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

  /** Arc flags may be written without separators ("a1 1 0 011 1"): read them one digit at a time. */
  function parse(d) {
    const src = String(d);
    const segs = [];
    let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lastC = null, lastQ = null;
    const re = /\s*,?\s*/y;
    const numRe = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
    const flagRe = /[01]/y;
    const skip = () => { re.lastIndex = i; re.exec(src); i = re.lastIndex; };
    const num = () => { skip(); numRe.lastIndex = i; const m = numRe.exec(src); if (!m) throw new Error('bad path number at ' + i); i = numRe.lastIndex; return Number(m[0]); };
    const flag = () => { skip(); flagRe.lastIndex = i; const m = flagRe.exec(src); if (!m) throw new Error('bad arc flag at ' + i); i = flagRe.lastIndex; return Number(m[0]); };
    for (;;) {
      skip();
      if (i >= src.length) break;
      const ch = src[i];
      if (/[A-Za-z]/.test(ch)) { if (!(ch.toUpperCase() in ARGS)) throw new Error('bad path command ' + ch); cmd = ch; i++; }
      else if (cmd === null || cmd === 'Z' || cmd === 'z') throw new Error('path: a number without a command at ' + i);
      else if (cmd === 'M') cmd = 'L';
      else if (cmd === 'm') cmd = 'l';
      const rel = cmd === cmd.toLowerCase(), U = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (U === 'Z') { segs.push({ op: 'Z', pts: [] }); x = sx; y = sy; lastC = lastQ = null; continue; }
      if (U === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; segs.push({ op: 'M', pts: [[x, y]] }); lastC = lastQ = null; }
      else if (U === 'L') { x = ox + num(); y = oy + num(); segs.push({ op: 'L', pts: [[x, y]] }); lastC = lastQ = null; }
      else if (U === 'H') { x = (rel ? x : 0) + num(); segs.push({ op: 'L', pts: [[x, y]] }); lastC = lastQ = null; }
      else if (U === 'V') { y = (rel ? y : 0) + num(); segs.push({ op: 'L', pts: [[x, y]] }); lastC = lastQ = null; }
      else if (U === 'C') { const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); segs.push({ op: 'C', pts: [p1, p2, [x, y]] }); lastC = p2; lastQ = null; }
      else if (U === 'S') { const p1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]; const p2 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); segs.push({ op: 'C', pts: [p1, p2, [x, y]] }); lastC = p2; lastQ = null; }
      else if (U === 'Q') { const p1 = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); segs.push({ op: 'Q', pts: [p1, [x, y]] }); lastQ = p1; lastC = null; }
      else if (U === 'T') { const p1 = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]; x = ox + num(); y = oy + num(); segs.push({ op: 'Q', pts: [p1, [x, y]] }); lastQ = p1; lastC = null; }
      else if (U === 'A') { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(); const x0 = x, y0 = y; x = ox + num(); y = oy + num(); segs.push({ op: 'A', from: [x0, y0], rx, ry, rot, large, sweep, pts: [[x, y]] }); lastC = lastQ = null; }
    }
    return segs;
  }

  /** One SVG arc (endpoint form) → cubic Béziers, each at most 90°. */
  function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if (x1 === x2 && y1 === y2) return [];
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return [[[x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3], [x1 + 2 * (x2 - x1) / 3, y1 + 2 * (y2 - y1) / 3], [x2, y2]]];   // SVG: a zero radius is a line
    const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), spn = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cp * dx + spn * dy, y1p = -spn * dx + cp * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num / den));
    if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cp * cxp - spn * cyp + (x1 + x2) / 2, cy = spn * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI;
    if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
    const step = dt / n, k = 4 / 3 * Math.tan(step / 4);
    const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * spn, cy + rx * Math.cos(t) * spn + ry * Math.sin(t) * cp];
    const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * spn, -rx * Math.sin(t) * spn + ry * Math.cos(t) * cp];
    const out = [];
    for (let j = 0; j < n; j++) {
      const a = t1 + j * step, b = a + step;
      const p0 = pt(a), p3 = j === n - 1 ? [x2, y2] : pt(b), d0 = dv(a), d3 = dv(b);
      out.push([[p0[0] + k * d0[0], p0[1] + k * d0[1]], [p3[0] - k * d3[0], p3[1] - k * d3[1]], p3]);
    }
    return out;
  }

  /** Subpaths with move, line, cubic, quad and close only. */
  function toCurves(d) {
    const out = [];
    for (const s of parse(d)) {
      if (s.op === 'A') arcToCubics(s.from[0], s.from[1], s.rx, s.ry, s.rot, s.large, s.sweep, s.pts[0][0], s.pts[0][1]).forEach((c) => out.push({ op: 'C', pts: c }));
      else out.push({ op: s.op, pts: s.pts });
    }
    return out;
  }

  const num3 = (n) => { const v = +n.toFixed(3); return (Object.is(v, -0) ? 0 : v) + 'pt'; };

  /**
   * Typst curve components. o.scale: px → pt (default 72 / 70), o.dx / o.dy
   * added in px before scaling. Every close is straight.
   */
  function typstCurve(d, o) {
    const k = (o && o.scale) || 72 / 70, dx = (o && o.dx) || 0, dy = (o && o.dy) || 0;
    const P = (p) => '(' + num3((p[0] + dx) * k) + ', ' + num3((p[1] + dy) * k) + ')';
    return toCurves(d).map((s) => {
      if (s.op === 'M') return 'curve.move(' + P(s.pts[0]) + ')';
      if (s.op === 'L') return 'curve.line(' + P(s.pts[0]) + ')';
      if (s.op === 'C') return 'curve.cubic(' + P(s.pts[0]) + ', ' + P(s.pts[1]) + ', ' + P(s.pts[2]) + ')';
      if (s.op === 'Q') return 'curve.quad(' + P(s.pts[0]) + ', ' + P(s.pts[1]) + ')';
      return 'curve.close(mode: "straight")';
    }).join(', ');
  }

  C.shapes = { LIST, KINDS, path, defaults, swapKind, parse, arcToCubics, toCurves, typstCurve };
})(globalThis);
