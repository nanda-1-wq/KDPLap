// deno test --allow-read tests/cover-model.test.js   (from the repo root)
// E16 Part 1: the cover model. New layers (text presets, book texts, pictures), duplicate,
// align, distribute, arrange forward and back, the size buttons, layer names and My layouts
// against the design; then normalize (defaults, unknown fields, ranges) and the caps.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, pos, designTextH, DESIGN_BOOK, fk, G6 } from "./lib/cover-load.js";

const M = () => K.model;

for (const c of GOLDEN.adds) {
  Deno.test(`add ${c.what}${c.n != null ? " (" + c.n + " layers before)" : ""} at ${fk(c.fmt)} equals the design`, () => {
    const g = K.geo.geo(c.fmt);
    let L;
    if (c.what.startsWith("text:")) L = M().newText(c.what.slice(5), c.n, g, 7);
    else if (c.what.startsWith("book:")) { const k = c.what.slice(5); L = M().newBookText(k, DESIGN_BOOK[k], g, 1); }
    else { const [natW, natH] = c.what.slice(6).split("x").map(Number); L = M().newImage({ name: "p.jpg", natW, natH, transparent: false }, g, 1); delete L.asset; }
    near(L, c.layer);
  });
}

for (const c of GOLDEN.align) {
  Deno.test(`align ${c.how} to ${c.alignTo} (${c.ids.join(", ")}) equals the design`, () => {
    const b = K.layouts.build("band", DESIGN_BOOK, G6, 1, undefined, { textH: designTextH });
    const ids = c.ids.map((k) => b.layers.find((l) => l.src === k).id);
    const out = M().align(b.layers, ids, c.how, c.alignTo, K.geo.geo(G6), designTextH);
    near(out.map(pos), c.layers);
  });
}

for (const c of GOLDEN.distribute) {
  Deno.test(`distribute ${c.axis === "h" ? "across" : "down"} equals the design`, () => {
    const b = K.layouts.build("band", DESIGN_BOOK, G6, 1, undefined, { textH: designTextH });
    const ids = ["title", "subtitle", "pen", "blurb"].map((k) => b.layers.find((l) => l.src === k).id);
    near(M().distribute(b.layers, ids, c.axis, designTextH).map(pos), c.layers);
  });
}

for (const c of GOLDEN.arrange) {
  Deno.test(`arrange ${c.mode} layer ${c.id} equals the design`, () => {
    const b = K.layouts.build("band", DESIGN_BOOK, G6, 1, undefined, { textH: designTextH });
    assertEquals(M().arrange(b.layers, c.id, c.mode, designTextH).map((l) => l.id), c.order);
  });
}

Deno.test("duplicate: the copy is just above, 14 px down and right, not tied to the book (design dupId)", () => {
  const b = K.layouts.build("band", DESIGN_BOOK, G6, 1, undefined, { textH: designTextH });
  const r = M().dup(b.layers, 2, b.nextId);
  near(r.layers.map(pos), GOLDEN.dup);
  assertEquals(r.sel, b.nextId);
  assertEquals(r.layers[2].src, null);
  assertEquals(M().dup(b.layers, 999, 7), { layers: b.layers, sel: null });
});

Deno.test("the size buttons equal the design (1 pt steps under 24, 2 pt from 24, 6 to 160)", () => {
  for (const c of GOLDEN.sizeSteps) assertEquals([M().sizeStep(c.size, -1), M().sizeStep(c.size, 1)], [c.down, c.up], String(c.size));
});

Deno.test("layer names equal the design (first 26 characters, file name, shape name, label)", () => {
  for (const c of GOLDEN.layerNames) assertEquals(K.names.layerName(c.l), c.name, JSON.stringify(c.l));
});

for (const c of GOLDEN.applyMy) {
  Deno.test(`My layout (band from another book) on ${fk(c.fmt)}: positions and words equal the design`, () => {
    // as the design's sampleMy(): band built for the design's book, then the other book's title and subtitle put in
    const swap = { title: "Deep Focus for Night Students", subtitle: "Study Smarter When the Day Is Done" };
    const built = K.layouts.build("band", DESIGN_BOOK, c.entryFmt, 1, undefined, { textH: designTextH }).layers.map((l) => (swap[l.src] ? Object.assign({}, l, { text: swap[l.src] }) : l));
    const entry = { id: "m1", name: "Band, navy", bg: "#F2EDE4", fmt: c.entryFmt, layers: built };
    const r = K.layouts.applyMy(entry, DESIGN_BOOK, c.fmt, 1, undefined, { textH: designTextH });
    assertEquals(r.bg, c.bg);
    near(r.layers.map((l) => Object.assign(pos(l), { text: l.text })), c.layers);
  });
}

Deno.test("D2: a My layout's spine text gets this book's words; left out when this book is too thin", () => {
  const A = { trim: "6x9", pages: 200, paper: "white" };
  const old = { title: "Old Book", subtitle: "Old", pen: "Old Pen" };
  const b = K.layouts.build("band", old, A, 1);
  const entry = { id: "x", name: "Band", bg: b.bg, fmt: A, layers: b.layers.concat([K.layouts.spineLayer(b.nextId, A, old)]) };
  const thick = K.layouts.applyMy(entry, DESIGN_BOOK, { trim: "6x9", pages: 240, paper: "white" }, 1);
  assertEquals(thick.layers.find((l) => l.src === "spine").text, DESIGN_BOOK.title + "    " + DESIGN_BOOK.pen);
  assertEquals(thick.layers.find((l) => l.src === "title").text, DESIGN_BOOK.title);
  const thin = K.layouts.applyMy(entry, DESIGN_BOOK, { trim: "6x9", pages: 54, paper: "white" }, 1);
  assertEquals(thin.layers.some((l) => l.src === "spine"), false);
  assertEquals(thin.layers.map((l) => l.id), [1, 2, 3, 4, 5]);
});

Deno.test("a stacked title keeps its stacked form on the new book", () => {
  const b = K.layouts.build("stack", { title: "One Two Three Four", subtitle: "s", pen: "p" }, G6, 1);
  const r = K.layouts.applyMy({ bg: b.bg, fmt: G6, layers: b.layers }, DESIGN_BOOK, G6, 1);
  assertEquals(r.layers.find((l) => l.src === "title").text, "MICRO\nSTUDY\nHABITS");
});

Deno.test("nudge (1 px, 10 with Shift), remove, select all skip locked and hidden layers", () => {
  const L = [M().shapeLayer(1, { x: 0, y: 0, w: 1, h: 1 }), M().shapeLayer(2, { x: 0, y: 0, w: 1, h: 1, lock: true }), Object.assign(M().shapeLayer(3, { x: 0, y: 0, w: 1, h: 1 }), { hidden: true })];
  assertEquals(M().nudge(L, [1, 2], 1, 0, false).map((l) => l.x), [1, 0, 0]);
  assertEquals(M().nudge(L, [1], 0, -1, true)[0].y, -10);
  assertEquals(M().remove(L, [2]).map((l) => l.id), [1, 3]);
  assertEquals(M().selectAll(L), [1]);
});

Deno.test("locked layers do not align or distribute", () => {
  const g = K.geo.geo(G6);
  const L = [M().shapeLayer(1, { x: 500, y: 100, w: 10, h: 10 }), M().shapeLayer(2, { x: 600, y: 100, w: 10, h: 10, lock: true })];
  assertEquals(M().align(L, [1, 2], "left", "front", g).map((l) => l.x), [g.liveFront.x0, 600]);
  assertEquals(M().distribute(L, [1, 2], "h"), L, "fewer than 3: no change");
});

Deno.test("pictures: cover fit fills the frame, keeps the shape, centered; DPI = natural width × 70 / drawn width", () => {
  const l = { w: 300, h: 330, natW: 6000, natH: 4000 };
  const f = M().coverFit(l, {});
  near(f, { pw: 495, ph: 330, px: -97.5, py: 0 });
  assertEquals(M().dpi({ natW: 6000, pw: 495 }), 848);
  assertEquals(M().dpi({ natW: 1280, pw: 420 }), 213);
  const c = M().clampPic({ w: 100, h: 100, pw: 200, ph: 150, px: 30, py: -80 });
  assertEquals([c.px, c.py], [0, -50]);
});

Deno.test("a layer's box: text height from textlayout, rotation gives the bounding box", () => {
  const t = M().textLayer(1, { text: "Hello", x: 10, y: 20, w: 200, size: 12 });
  assertEquals(M().bbox(t), { x: 10, y: 20, w: 200, h: K.textlayout.height(t) });
  const r = M().bbox(Object.assign(M().shapeLayer(2, { x: 0, y: 0, w: 100, h: 20 }), { rot: 90 }));
  near(r, { x: 40, y: -40, w: 20, h: 100 });
  const full = M().bbox(Object.assign(M().shapeLayer(3, { x: 0, y: 0, w: 100, h: 20 }), { rot: 360 }));
  assertEquals(full, { x: 0, y: 0, w: 100, h: 20 });
});

// ---------- normalize ----------
Deno.test("normalize: a design layer passes through unchanged except the new hidden flag", () => {
  for (const c of GOLDEN.layoutsFull) {
    const b = K.layouts.build(c.key, DESIGN_BOOK, G6, 1);
    for (const l of b.layers) {
      const n = M().normalizeLayer(l);
      const want = Object.assign({}, l, { hidden: false });
      assertEquals(n, want, c.key + " " + l.id);
    }
  }
});

Deno.test("normalize: unknown fields dropped, missing ones filled", () => {
  const n = M().normalizeLayer({ id: 5, type: "text", text: "Hi", evil: "<script>", fx: { style: "glow", junk: 1 } });
  assertEquals(n.evil, undefined);
  assertEquals(n.fx, Object.assign({}, M().FX_DEF, { style: "glow" }));
  assertEquals([n.font, n.size, n.weight, n.color, n.align, n.caps, n.ls, n.curve, n.rot, n.op, n.lock, n.noExport, n.hidden], ["IBM Plex Sans", 12, 400, "#1C1C1A", "center", false, 0, 0, 0, 100, false, false, false]);
  assertEquals(n.dist, M().freshDist());
});

Deno.test("normalize: ranges clamped to the design's controls", () => {
  const t = M().normalizeLayer({ id: 1, type: "text", text: "x", size: 500, rot: 400, op: -3, curve: 140, ls: 9, fx: { int: 0, dist: 99, dir: 720, blur: -1, width: 50, depth: 0, pad: 0, round: 90 }, dist: { top: 80, bottom: -90, mode: "free", on: true, q: [[1, 2], [3, "x"], null, [4, 5]] } });
  assertEquals([t.size, t.rot, t.op, t.curve, t.ls], [160, 180, 0, 100, 1]);
  assertEquals(t.fx, { style: "none", color: "#1C1C1A", int: 10, dist: 30, dir: 359, blur: 0, width: 10, depth: 1, pad: 2, round: 30 });
  assertEquals(t.dist, { on: true, mode: "free", top: 50, bottom: -50, q: [[1, 2], [3, 0], [0, 0], [4, 5]] });
  const s = M().normalizeLayer({ id: 2, type: "shape", kind: "star", x: 0, y: 0, w: 10, h: 10, points: 99.6, depth: 5, head: 100, thick: 1, radius: -5, sw: 30, gAngle: 400 });
  assertEquals([s.points, s.depth, s.head, s.thick, s.radius, s.sw, s.gAngle], [24, 20, 80, 4, 0, 20, 359]);
  const i = M().normalizeLayer({ id: 3, type: "image", x: 0, y: 0, w: 10, h: 10, natW: 99999, natH: 0, bri: 10, con: 999, sat: -1, blur: 50, dark: 61, bw: 21 });
  assertEquals([i.natW, i.natH, i.bri, i.con, i.sat, i.blur, i.dark, i.bw], [12000, 1, 50, 150, 0, 10, 60, 20]);
});

Deno.test("normalize: colors must be #RRGGBB (upper-cased), lists must be known values", () => {
  const t = M().normalizeLayer({ id: 1, type: "text", text: "x", color: "#abcdef", align: "justify", weight: 450, src: "back", fx: { style: "neon", color: "red" } });
  assertEquals([t.color, t.align, t.weight, t.src, t.fx.style, t.fx.color], ["#ABCDEF", "center", 400, null, "none", "#1C1C1A"]);
  const s = M().normalizeLayer({ id: 2, type: "shape", kind: "blob", fillMode: "pattern", dash: "wave", fill: "#12345", x: 0, y: 0, w: 1, h: 1 });
  assertEquals([s.kind, s.fillMode, s.dash, s.fill, s.name], ["rect", "solid", "solid", "#1F3A5F", "rect"]);
  const i = M().normalizeLayer({ id: 3, type: "image", look: "neon", mask: "star", asset: 7, x: 0, y: 0, w: 1, h: 1 });
  assertEquals([i.look, i.mask, i.asset], ["none", "none", null]);
});

Deno.test("normalize: a layer needs an id (positive integer or short safe string) and a known type", () => {
  for (const bad of [null, 5, "x", {}, { type: "text" }, { id: 0, type: "text" }, { id: -1, type: "shape" }, { id: 1.5, type: "shape" }, { id: "a b", type: "shape" }, { id: "x".repeat(65), type: "shape" }, { id: 1, type: "video" }]) assertEquals(M().normalizeLayer(bad), null, JSON.stringify(bad));
  assert(M().normalizeLayer({ id: "L_1-a", type: "shape" }));
});

Deno.test("normalize: text at most 2,000 characters; a label at most 80; non-number numbers become defaults", () => {
  const t = M().normalizeLayer({ id: 1, type: "text", text: "a".repeat(2500), label: "b".repeat(100), x: "12", y: null, w: true, size: "" });
  assertEquals([t.text.length, t.label.length, t.x, t.y, t.w, t.size], [2000, 80, 12, 0, 100, 12]);
  assertEquals(M().normalizeLayer({ id: 1, type: "text", text: 5 }).text, "");
  assertEquals(M().normalizeLayer({ id: 1, type: "text", text: "x", label: "  " }).label, undefined);
});

Deno.test("normalize: a picture without a drawn size gets a cover fit", () => {
  const i = M().normalizeLayer({ id: 1, type: "image", x: 0, y: 0, w: 300, h: 330, natW: 6000, natH: 4000 });
  near([i.pw, i.ph, i.px, i.py], [495, 330, -97.5, 0]);
});

Deno.test("normalize: a whole cover (fmt, bg, at most 200 layers, unique ids, known layout)", () => {
  const layers = Array.from({ length: 230 }, (_, i) => ({ id: (i % 210) + 1, type: "shape", x: 0, y: 0, w: 1, h: 1 }));
  const n = M().normalize({ fmt: { trim: "9x9", pages: 30 }, bg: "nope", layers, layout: "band" });
  assertEquals(n.fmt, { trim: "6x9", pages: 30, paper: "white" });
  assertEquals(n.bg, "#FFFFFF");
  assertEquals(n.layers.length, 200);
  assertEquals(new Set(n.layers.map((l) => l.id)).size, 200);
  assertEquals(n.layout, "band");
  assertEquals(M().normalize({ layout: "my:abc-1" }).layout, "my:abc-1");
  assertEquals(M().normalize({ layout: "fancy" }).layout, null);
  assertEquals(M().normalize(null), { fmt: { trim: "6x9", pages: 24, paper: "white" }, bg: "#FFFFFF", layers: [], layout: null });
});

Deno.test("caps: 200 layers, 2,000 characters a text, 512 KB of layers", () => {
  assertEquals(M().CAPS.layers, 200);
  assert(M().fits({ layers: K.layouts.build("band", DESIGN_BOOK, G6, 1).layers }).ok);
  assertEquals(M().fits({ layers: Array.from({ length: 201 }, (_, i) => ({ id: i + 1, type: "shape" })) }).reason, "layers");
  assertEquals(M().fits({ layers: [{ id: 1, type: "text", text: "a".repeat(2001) }] }).reason, "text");
  const big = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, type: "text", text: "é".repeat(1400) }));
  const r = M().fits({ layers: big });
  assertEquals(r.reason, "bytes");
  assert(r.bytes > 512 * 1024);
});

Deno.test("next free id", () => {
  assertEquals(M().nextId([]), 1);
  assertEquals(M().nextId([{ id: 3 }, { id: 9 }, { id: "x" }]), 10);
});
