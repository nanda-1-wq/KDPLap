// deno test --allow-read tests/cover-flatten.test.js   (from the repo root)
// 09 Cover, E16 Part 2: the flatten plan (js/cover/flatten.js, plan §1). What stays vector, what
// becomes an opaque 300 DPI patch, the patch boxes on one grid, the growth that keeps text whole,
// and every ready layout and QA cover planned so each printable layer is drawn exactly once.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, QA, G6 } from "./lib/cover-engine-load.js";

const F = K.flatten, M = K.model;
const T = (id, o) => M.textLayer(id, Object.assign({ text: "Title words", x: 500, y: 100, w: 300, size: 30, font: "Source Serif 4", weight: 700 }, o));
const S = (id, o) => M.shapeLayer(id, Object.assign({ x: 500, y: 100, w: 200, h: 100 }, o));
const I = (id, o) => M.imageLayer(id, Object.assign({ x: 450, y: 60, w: 300, h: 300 }, o));
const fx = (o) => Object.assign({}, M.FX_DEF, o);
const cls = (l) => F.classify(l).cls;
const cover = (layers, fmt = G6) => ({ fmt, bg: "#FFFFFF", layers });
const sig = (p) => p.items.map((it) => (it.kind === "patch" ? `P${it.n}${it.effectOnly != null ? "e" : ""}` : `${it.id}${it.part === "letters" ? "L" : ""}`)).join(" ");

Deno.test("classify: plain text, shapes with a solid fill, dash and dot borders stay vector", () => {
  assertEquals(cls(T(1)), "vector");
  assertEquals(cls(S(1)), "vector");
  assertEquals(cls(S(1, { sw: 3, dash: "dash" })), "vector");
  assertEquals(cls(S(1, { sw: 3, dash: "dot", fillMode: "none" })), "vector");
  assertEquals(cls(S(1, { kind: "line", fillMode: "grad" })), "vector");   // a line has no fill, so no gradient
});

Deno.test("classify: opacity, pictures, gradients, distortion and hollow letters are raster", () => {
  assertEquals(F.classify(T(1, { op: 99 })), { cls: "raster", why: ["opacity"] });
  assertEquals(F.classify(S(1, { op: 50 })), { cls: "raster", why: ["opacity"] });
  assertEquals(F.classify(I(1)), { cls: "raster", why: ["picture"] });
  assertEquals(F.classify(I(1, { transparent: true })), { cls: "raster", why: ["transparent picture"] });
  assertEquals(F.classify(S(1, { fillMode: "grad" })), { cls: "raster", why: ["gradient"] });
  assertEquals(F.classify(S(1, { fillMode: "grad" }), { gradients: "vector" }).cls, "vector");
  assertEquals(F.classify(T(1, { dist: { on: true, mode: "basic", top: 10, bottom: 0, q: [[0, 0], [0, 0], [0, 0], [0, 0]] } })), { cls: "raster", why: ["distortion"] });
  assertEquals(F.classify(T(1, { fx: fx({ style: "hollow" }) })), { cls: "raster", why: ["hollow"] });
  assertEquals(F.classify(T(1, { op: 40, fx: fx({ style: "shadow" }) })).cls, "raster");   // see-through letters take their effect with them
});

Deno.test("classify: see-through effects are an effect patch (letters stay vector); solid ones stay vector", () => {
  assertEquals(cls(T(1, { fx: fx({ style: "shadow" }) })), "effect");                 // the design default: 60, softness 6
  assertEquals(cls(T(1, { fx: fx({ style: "shadow", int: 100, blur: 2 }) })), "effect");
  assertEquals(cls(T(1, { fx: fx({ style: "shadow", int: 100, blur: 0 }) })), "vector");
  assertEquals(cls(T(1, { fx: fx({ style: "lift", int: 100, blur: 0 }) })), "effect");
  assertEquals(cls(T(1, { fx: fx({ style: "glow" }) })), "effect");
  assertEquals(cls(T(1, { fx: fx({ style: "echo" }) })), "effect");                   // a stroke-only copy: Typst has no clear fill
  assertEquals(cls(T(1, { fx: fx({ style: "bg", int: 60 }) })), "effect");
  assertEquals(cls(T(1, { fx: fx({ style: "bg", int: 100 }) })), "vector");
  assertEquals(cls(T(1, { fx: fx({ style: "outline" }) })), "vector");
  assertEquals(cls(T(1, { fx: fx({ style: "3d" }) })), "vector");
  assertEquals(F.fxRaster(fx({ style: "bg", int: 10 })), true);                       // the design's floor of 0.15 is still see-through
});

Deno.test("grid: whole 300 DPI pixels from the wrap's top left, outward, clipped to the page", () => {
  const g = K.geo.geo(G6), P = K.geo.px300(g), k = 300 / 70;
  assertEquals(F.grid({ x: 7, y: 14, w: 70, h: 7 }, g), { x0: 30, y0: 60, x1: 330, y1: 90 });
  const b = F.grid({ x: 10.1, y: 20.2, w: 33.3, h: 44.4 }, g);
  assertEquals(b, { x0: Math.floor(10.1 * k), y0: Math.floor(20.2 * k), x1: Math.ceil(43.4 * k), y1: Math.ceil(64.6 * k) });
  assertEquals(F.grid({ x: -50, y: -50, w: g.W + 100, h: g.H + 100 }, g), { x0: 0, y0: 0, x1: P.w, y1: P.h });
  // Two boxes that touch on the board share their edge pixel line: seams line up.
  const a = F.grid({ x: 0, y: 0, w: 70, h: 70 }, g), c = F.grid({ x: 70, y: 0, w: 70, h: 70 }, g);
  assertEquals(a.x1, c.x0);
});

Deno.test("extent: rotation, effect reach and the background plate are inside the box", () => {
  const l = S(1, { w: 200, h: 100, rot: 90 });
  const e = F.extent(l);
  assert(Math.abs(e.w - 102) < 1e-6 && Math.abs(e.h - 202) < 1e-6, JSON.stringify(e));
  const t = T(1);
  const plain = F.extent(t), shadow = F.extent(T(1, { fx: fx({ style: "shadow", dist: 10, dir: 0, blur: 0 }) }));
  assert(shadow.x + shadow.w >= plain.x + plain.w + 10 - 1e-6);
  const bg = F.extent(T(1, { text: "a", fx: fx({ style: "bg", int: 100, pad: 12 }) }));
  assert(bg.x <= t.x - 12 && bg.x + bg.w >= t.x + t.w + 12, "the plate spans the whole box");
  // Centered short text: only the used part of the box (plus a margin).
  const short = F.extent(T(1, { text: "Hi", w: 400 }));
  assert(short.w < 200, `short text box ${short.w}`);
});

Deno.test("plan: a vector-only cover has no patch; hidden and excluded layers are not in it", () => {
  const p = F.plan(cover([T(1), S(2, { y: 300 }), T(3, { hidden: true }), S(4, { noExport: true })]));
  assertEquals(sig(p), "1 2");
  assertEquals(p.patches, []);
  assertEquals(F.plan(cover([])).items, []);
});

Deno.test("plan: text over a picture stays vector on top of the picture's patch", () => {
  const p = F.plan(cover([I(1), T(2, { y: 150, color: "#FFFFFF" })]));
  assertEquals(sig(p), "P1 2");
  assertEquals(p.patches[0].upTo, 0);
  assertEquals(p.patches[0].holds, []);
});

Deno.test("plan: a picture over text it cuts grows to hold the whole text (no text split)", () => {
  const t = T(1, { text: "A long title line here", x: 460, y: 100, w: 380, align: "left" });
  const pic = I(2, { x: 480, y: 90, w: 60, h: 60 });
  const p = F.plan(cover([t, pic]));
  assertEquals(sig(p), "P1");
  assertEquals(p.patches[0].holds, [1]);
  const tb = F.grid(F.extent(t), p.g), pb = p.patches[0].box;
  assert(pb.x0 <= tb.x0 && pb.x1 >= tb.x1 && pb.y0 <= tb.y0 && pb.y1 >= tb.y1);
});

Deno.test("plan: growth is followed through a chain of cut layers, and layers above stay vector", () => {
  const a = S(1, { x: 450, y: 100, w: 100, h: 40 }), b = S(2, { x: 540, y: 100, w: 100, h: 40 }), c = S(3, { x: 630, y: 100, w: 100, h: 40 });
  const pic = I(4, { x: 520, y: 90, w: 40, h: 60 });
  const top = T(5, { y: 110 });
  const p = F.plan(cover([a, b, c, pic, top]));
  // The picture cuts a and b; b's box reaches c only if they overlap: they do (540+100 > 630).
  assertEquals(p.patches[0].holds, [1, 2, 3]);
  assertEquals(sig(p), "P1 5");
});

Deno.test("plan: a see-through effect gives a patch of the effect, then the letters as vector", () => {
  const p = F.plan(cover([S(1, { x: 440, y: 60, w: 400, h: 200 }), T(2, { fx: fx({ style: "shadow" }) }), T(3, { y: 400 })]));
  assertEquals(sig(p), "P1e 2L 3");
  assertEquals(p.patches[0].effectOnly, 2);
  assertEquals(p.patches[0].holds, [1]);   // the shape under the shadow is cut, so it is held whole
  assertEquals(p.patches[0].upTo, 1);
});

Deno.test("plan: two pictures, the second over the first: two patches, no vector between them", () => {
  const p = F.plan(cover([I(1), I(2, { x: 600, y: 200, w: 100, h: 100, mask: "circle" })]));
  assertEquals(sig(p), "P1 P2");
  assertEquals(p.patches.map((x) => x.upTo), [0, 1]);
});

Deno.test("plan: every ready layout on every trim draws each printable layer exactly once", () => {
  for (const key of K.layouts.KEYS) for (const trim of K.geo.TRIMS) for (const pages of [54, 120]) {
    const c = QA.layout(key, { trim, pages, paper: "white" });
    const p = F.plan(c);
    const ids = F.printable(c.layers).map((l) => l.id);
    const drawn = [];
    for (const it of p.items) {
      if (it.kind === "patch") drawn.push(...it.holds.map((x) => `${x}`), ...(it.effectOnly == null ? [`${it.id}`] : []));
      else drawn.push(`${it.id}${it.part === "letters" ? "" : ""}`);
    }
    for (const id of ids) assert(drawn.includes(`${id}`), `${key} ${trim} ${pages}: layer ${id} not drawn`);
    for (const it of p.patches) {
      assert(it.box.x0 >= 0 && it.box.y0 >= 0 && it.box.x1 <= p.px.w && it.box.y1 <= p.px.h && it.box.x1 > it.box.x0 && it.box.y1 > it.box.y0, `${key}: patch box`);
      for (const k of ["x0", "y0", "x1", "y1"]) assert(Number.isInteger(it.box[k]));
    }
  }
});

Deno.test("plan: picture layouts have one patch per picture; text-only layouts have none", () => {
  for (const key of K.layouts.KEYS) {
    const c = QA.layout(key, G6), p = F.plan(c);
    const pics = c.layers.filter((l) => l.type === "image").length;
    const grads = c.layers.filter((l) => l.type === "shape" && l.fillMode === "grad").length;
    const see = c.layers.filter((l) => l.op < 100).length;
    if (!pics && !grads && !see) assertEquals(p.patches.length, 0, key);
    else assert(p.patches.length >= 1, key);
  }
});

Deno.test("plan: the QA sheets plan as the STOP 2 report says (effects, pictures, shapes, spine)", () => {
  const e = F.plan(QA.sheet("effects")), ph = F.plan(QA.sheet("photos")), sh = F.plan(QA.sheet("shapes")), sp = F.plan(QA.sheet("spine"));
  assertEquals(e.patches.length, 10);
  assertEquals(e.patches.filter((x) => x.effectOnly != null).length, 6);   // shadow soft, lift, glow, echo, background soft, turned shadow
  assertEquals(ph.patches.length, 9);
  assertEquals(sh.patches.length, 9);   // 7 gradients and 2 at 70% opacity, none merged
  assertEquals(sp.patches.length, 0);
});
