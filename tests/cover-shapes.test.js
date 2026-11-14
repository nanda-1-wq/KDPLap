// deno test --allow-read tests/cover-shapes.test.js   (from the repo root)
// E16 Part 1: the 27 shapes. Paths are string-equal to the design's shapePath(); new
// shapes get the design's addShape() fields; the SVG → Typst curve converter keeps
// every point (arcs become cubics that stay on the ellipse) and closes straight.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { K, GOLDEN, near, fk } from "./lib/cover-load.js";

const S = () => K.shapes;

for (const c of GOLDEN.shapes) {
  Deno.test(`path ${c.l.kind} ${c.l.w}×${c.l.h} ${JSON.stringify({ r: c.l.radius, p: c.l.points, d: c.l.depth, hd: c.l.head, t: c.l.thick })} equals the design`, () => {
    assertEquals(S().path(c.l), c.d);
  });
}

for (const c of GOLDEN.addShape) {
  Deno.test(`new ${c.kind} at ${fk(c.fmt)}: the design's addShape fields`, () => {
    const L = Object.assign({}, S().defaults(c.kind, K.geo.geo(c.fmt)), K.model.common());
    near(L, c.layer, c.kind);
  });
}

Deno.test("27 shapes in the panel order, with the design's names", () => {
  assertEquals(S().LIST.length, 27);
  assertEquals(S().KINDS.slice(0, 6), ["rect", "rounded", "ellipse", "semicircle", "triangle", "diamond"]);
  assertEquals(S().LIST.find((x) => x[0] === "burst")[1], "Badge");
  assertEquals(S().LIST.find((x) => x[0] === "parallelogram")[1], "Slant");
  assertEquals(S().path({ kind: "nope", w: 10, h: 10 }), "");
});

Deno.test("swapping the kind: the design's rules (rounded radius, burst and star points, line height)", () => {
  const sq = K.model.shapeLayer(1, { x: 0, y: 0, w: 160, h: 160 });
  assertEquals(S().swapKind(sq, "rounded").radius, 16);
  assertEquals(S().swapKind(Object.assign({}, sq, { radius: 30 }), "rounded").radius, 30);
  assertEquals(S().swapKind(Object.assign({}, sq, { radius: 30 }), "rect").radius, 0);
  assertEquals(S().swapKind(sq, "burst").points, 14);
  assertEquals(S().swapKind(sq, "burst").depth, 82);
  assertEquals(S().swapKind(Object.assign({}, sq, { points: 9 }), "star").points, 5);
  const ln = S().swapKind(sq, "line");
  assertEquals([ln.fillMode, ln.sw, ln.h], ["none", 3, 24]);
  const back = S().swapKind(Object.assign({}, sq, { kind: "line", fillMode: "none", w: 200, h: 24, sw: 3 }), "ellipse");
  assertEquals([back.fillMode, back.h], ["solid", 120]);
});

const sample = (segs) => segs;
Deno.test("parse: absolute and relative commands, implicit repeats, packed arc flags", () => {
  const p = S().parse("M10 10 l5 0 5 5 h-10 v-5 z m1 1 a2 2 0 011 1");
  assertEquals(p.map((s) => s.op), ["M", "L", "L", "L", "L", "Z", "M", "A"]);
  assertEquals(p[2].pts[0], [20, 15]);
  assertEquals(p[4].pts[0], [10, 10]);
  assertEquals(p[6].pts[0], [11, 11]);
  assertEquals([p[7].large, p[7].sweep, p[7].pts[0]], [0, 1, [12, 12]]);
  assertEquals(sample(S().parse("M0 0 C1 1 2 2 3 3 S5 5 6 6").map((s) => s.pts)), [[[0, 0]], [[1, 1], [2, 2], [3, 3]], [[4, 4], [5, 5], [6, 6]]]);
  assertEquals(S().parse("M0 0 Q1 1 2 0 T4 0").map((s) => s.pts), [[[0, 0]], [[1, 1], [2, 0]], [[3, -1], [4, 0]]]);
  assertThrows(() => S().parse("10 10"));
  assertThrows(() => S().parse("M0 0 Z 5 5"));
  assertThrows(() => S().parse("M0 0 X1 1"));
});

const onEllipse = (cx, cy, rx, ry, p) => Math.abs(((p[0] - cx) / rx) ** 2 + ((p[1] - cy) / ry) ** 2 - 1);
const bez = (p0, c) => (t) => [0, 1].map((k) => (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * c[0][k] + 3 * (1 - t) * t ** 2 * c[1][k] + t ** 3 * c[2][k]);

Deno.test("arcs → cubics: the ellipse and the circle stay on their curve (within 0.03%) and end where the arc ends", () => {
  for (const [w, h] of [[160, 160], [310, 310], [240, 90]]) {
    const segs = S().toCurves(S().path({ kind: "ellipse", w, h }));
    let at = segs[0].pts[0];
    for (const s of segs.slice(1)) {
      if (s.op !== "C") continue;
      const f = bez(at, s.pts);
      for (const t of [0.25, 0.5, 0.75]) assert(onEllipse(w / 2, h / 2, w / 2, h / 2, f(t)) < 6e-4, `${w}×${h} t=${t}`);
      at = s.pts[2];
    }
    near(at, [0, h / 2], "back at the start");
    assertEquals(segs.filter((s) => s.op === "C").length, 4, "two half arcs = four quarter cubics");
  }
});

Deno.test("arcs → cubics: rounded corners, the half circle, the moon and the cloud end on the path's own points", () => {
  for (const l of [{ kind: "rounded", w: 200, h: 120, radius: 24 }, { kind: "semicircle", w: 200, h: 100 }, { kind: "moon", w: 160, h: 160 }, { kind: "cloud", w: 200, h: 140 }, { kind: "ring", w: 200, h: 140, thick: 18 }]) {
    const raw = S().parse(S().path(l)), cur = S().toCurves(S().path(l));
    const ends = raw.filter((s) => s.op !== "Z").map((s) => s.pts[s.pts.length - 1]);
    const curEnds = [];
    let i = 0;
    for (const s of raw) {
      if (s.op === "Z") { i++; continue; }
      if (s.op !== "A") { curEnds.push(cur[i].pts[cur[i].pts.length - 1]); i++; continue; }
      while (cur[i] && cur[i].op === "C" && i < cur.length) { const last = cur[i].pts[2]; i++; if (Math.hypot(last[0] - s.pts[0][0], last[1] - s.pts[0][1]) < 1e-9) { curEnds.push(last); break; } }
    }
    near(curEnds, ends, l.kind);
  }
});

Deno.test("arcs: a zero radius is a straight line; a start equal to the end is skipped", () => {
  assertEquals(S().arcToCubics(0, 0, 0, 5, 0, 0, 1, 9, 0), [[[3, 0], [6, 0], [9, 0]]]);
  assertEquals(S().arcToCubics(4, 4, 5, 5, 0, 0, 1, 4, 4), []);
  // radii too small are scaled up (SVG rule): a half circle from (0,0) to (10,0) with r = 1
  const c = S().arcToCubics(0, 0, 1, 1, 0, 0, 1, 10, 0);
  near(c[c.length - 1][2], [10, 0]);
  const f = bez([0, 0], c[0]);
  assert(onEllipse(5, 0, 5, 5, f(0.5)) < 6e-4);
});

Deno.test("Typst curve: px → pt (72 / 70), offsets, straight closes, no arcs left", () => {
  const t = S().typstCurve("M0 0 L70 0 L70 35 Z", { dx: 7, dy: 0 });
  assertEquals(t, 'curve.move((7.2pt, 0pt)), curve.line((79.2pt, 0pt)), curve.line((79.2pt, 36pt)), curve.close(mode: "straight")');
  for (const [kind] of S().LIST) {
    const l = Object.assign({ w: 160, h: 120 }, S().defaults(kind, K.geo.geo({ trim: "6x9", pages: 54, paper: "white" })), { w: 160, h: 120 });
    const out = S().typstCurve(S().path(l));
    assert(out.startsWith("curve.move("), kind);
    assert(!/[A-Za-z]{2,}\(\(NaN/.test(out) && !out.includes("NaN"), kind);
    const closes = (S().path(l).match(/Z/g) || []).length;
    assertEquals((out.match(/curve\.close\(mode: "straight"\)/g) || []).length, closes, kind);
  }
  assertEquals(S().typstCurve("M0 0 Q35 70 70 0"), "curve.move((0pt, 0pt)), curve.quad((36pt, 72pt), (72pt, 0pt))");
  assertEquals(S().typstCurve("M0 0 C7 7 14 14 70 0"), "curve.move((0pt, 0pt)), curve.cubic((7.2pt, 7.2pt), (14.4pt, 14.4pt), (72pt, 0pt))");
});

Deno.test("frame and ring have two subpaths (the hole), drawn even-odd", () => {
  for (const kind of ["frame", "ring"]) {
    const segs = S().toCurves(S().path({ kind, w: 200, h: 140, thick: 18 }));
    assertEquals(segs.filter((s) => s.op === "M").length, 2, kind);
    assertEquals(segs.filter((s) => s.op === "Z").length, 2, kind);
  }
});

Deno.test("arcs bulge the right way: a rounded corner bends outward, the half circle tops out at (w/2, 0)", () => {
  // rounded 200 × 120, radius 24: the first arc is the top right corner, from (176, 0) to (200, 24)
  const segs = S().toCurves(S().path({ kind: "rounded", w: 200, h: 120, radius: 24 }));
  const i = segs.findIndex((s) => s.op === "C");
  const mid = bez(segs[i - 1].pts[segs[i - 1].pts.length - 1], segs[i].pts)(0.5);
  near(mid.map((v) => +v.toFixed(3)), [176 + 24 * Math.SQRT1_2, 24 - 24 * Math.SQRT1_2].map((v) => +v.toFixed(3)));
  assert(mid[0] > 188 && mid[1] < 12, "outside the chord, toward the corner");
  // semicircle 200 × 100: from (0, 100) over the top to (200, 100)
  const sc = S().toCurves(S().path({ kind: "semicircle", w: 200, h: 100 }));
  const top = bez(sc[0].pts[0], sc[1].pts)(1);
  near(top, [100, 0]);
  const q1 = bez(sc[0].pts[0], sc[1].pts)(0.5);
  assert(q1[1] < 50, "above the middle, not below the base");
});
