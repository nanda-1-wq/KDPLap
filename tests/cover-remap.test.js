// deno test --allow-read tests/cover-remap.test.js   (from the repo root)
// E16 Part 1: the size remap against the design. 4 layouts (band, picfull, stripes, corner)
// from each trim at 120 white to each trim at 240 cream (144 cases), the size note (F72),
// and the rules the plan ports as is (crops reset X5, spine text stays X3, moved = x, y, w).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, pos, designTextH, DESIGN_BOOK, fk, G6 } from "./lib/cover-load.js";

const same = (a, b) => a.trim === b.trim && a.pages === b.pages && a.paper === b.paper;
const inputOf = (key, fmt) => GOLDEN.layouts.find((c) => c.key === key && same(c.fmt, fmt));

for (const c of GOLDEN.remap) {
  Deno.test(`remap ${c.key}: ${fk(c.from)} → ${fk(c.to)} equals the design`, () => {
    const b = K.layouts.build(c.key, DESIGN_BOOK, c.from, 1, undefined, { textH: designTextH });
    near(b.layers.map(pos), inputOf(c.key, c.from).layers, "input");
    const r = K.remap.remap(b.layers, K.geo.geo(c.from), K.geo.geo(c.to), { textH: designTextH });
    near(r.layers.map(pos), c.layers, "layers");
    assertEquals(r.moved, c.moved);
  });
}

for (const n of GOLDEN.notes) {
  Deno.test(`size note ${fk(n.from)} → ${fk(n.to)}: words, moved layers and spine offer equal the design`, () => {
    const b = K.layouts.build("band", DESIGN_BOOK, n.from, 1, undefined, { textH: designTextH });
    const r = K.remap.changeFormat({ fmt: n.from, bg: b.bg, layers: b.layers, layout: "band" }, n.to, { textH: designTextH });
    near(r.cover.layers.map(pos), n.layers, "layers");
    assertEquals(r.lastRemap.moved, n.moved);
    assertEquals(K.remap.noteText(r.lastRemap), n.text);
    assertEquals(K.remap.noteSub(r.lastRemap), n.sub);
    assertEquals(K.remap.spineNew(r.lastRemap, r.cover.layers), n.spineNew);
    assertEquals(r.cover.fmt, n.to);
    assertEquals(r.cover.layout, "band");
  });
}

Deno.test("F72 words exactly (6 × 9, 54 → 120 pages, white)", () => {
  const n = GOLDEN.notes[0];
  assertEquals(n.text, "Your book changed in 08 Format: 54 → 120 pages. Spine 0.122 → 0.270 in. NicheInk moved your design to fit.");
  assertEquals(n.sub, "4 layers moved. Check them, then export again: your old files no longer fit.");
  assertEquals(n.spineNew, true);
});

Deno.test("the same size: no change, no note", () => {
  const b = K.layouts.build("band", DESIGN_BOOK, G6, 1);
  assertEquals(K.remap.changeFormat({ fmt: G6, bg: b.bg, layers: b.layers }, Object.assign({}, G6)), null);
  const r = K.remap.remap(b.layers, K.geo.geo(G6), K.geo.geo(G6));
  assertEquals(r.moved, []);
  assertEquals(r.layers, b.layers);
  assert(r.layers[0] !== b.layers[0], "copies, not the same objects");
});

Deno.test("nothing moved: the note says so", () => {
  assertEquals(K.remap.noteSub({ moved: [] }), "Nothing needed to move. Export again: your old files no longer fit.");
  assertEquals(K.remap.noteSub({ moved: [3] }), "1 layer moved. Check them, then export again: your old files no longer fit.");
});

Deno.test("paper only: the note names the paper, every layer keeps its panel", () => {
  const A = { trim: "6x9", pages: 240, paper: "white" }, B = { trim: "6x9", pages: 240, paper: "cream" };
  const b = K.layouts.build("corner", DESIGN_BOOK, A, 1);
  const r = K.remap.changeFormat({ fmt: A, bg: b.bg, layers: b.layers }, B);
  assertEquals(K.remap.noteText(r.lastRemap), "Your book changed in 08 Format: white → cream paper. Spine 0.540 → 0.600 in. NicheInk moved your design to fit.");
  const gA = K.geo.geo(A), gB = K.geo.geo(B);
  r.cover.layers.forEach((l, i) => {
    const a = b.layers[i], ca = K.model.bbox(a).x + K.model.bbox(a).w / 2, cb = K.model.bbox(l).x + K.model.bbox(l).w / 2;
    assertEquals(ca < gA.foldL, cb < gB.foldL, "same side of the spine");
  });
});

Deno.test("X5 (port as is): a remap resets a picture's crop to cover the frame", () => {
  const b = K.layouts.build("picband", DESIGN_BOOK, G6, 1);
  const img = b.layers.find((l) => l.type === "image");
  img.px -= 40; img.pw += 80; img.ph += 80 * img.natH / img.natW;
  const r = K.remap.remap(b.layers, K.geo.geo(G6), K.geo.geo({ trim: "8x10", pages: 120, paper: "white" }));
  const out = r.layers.find((l) => l.type === "image");
  near(out.px, (out.w - out.pw) / 2); near(out.py, (out.h - out.ph) / 2);
  assert(out.pw >= out.w - 1e-9 && out.ph >= out.h - 1e-9);
});

Deno.test("X3 (port as is): spine text stays when the page count drops; C5 then flags it", () => {
  const A = { trim: "6x9", pages: 120, paper: "white" }, B = { trim: "6x9", pages: 54, paper: "white" };
  const b = K.layouts.build("band", DESIGN_BOOK, A, 1);
  b.layers.push(K.layouts.spineLayer(b.nextId, A, DESIGN_BOOK));
  const r = K.remap.changeFormat({ fmt: A, bg: b.bg, layers: b.layers }, B);
  const sp = r.cover.layers.find((l) => l.src === "spine");
  assert(sp, "spine layer kept");
  const items = K.checks.run(r.cover).filter((x) => x.id === sp.id);
  assertEquals(items.map((x) => x.code), ["C5"]);
  assertEquals(items[0].msg, '"Micro Study Habits for Bus…" is on the spine. Spine text needs at least 86 pages on white paper; this book has 54.');
});

Deno.test("moved counts x, y and w only (more than 0.5 px)", () => {
  const A = K.geo.geo({ trim: "6x9", pages: 54, paper: "white" }), B = K.geo.geo({ trim: "6x9", pages: 60, paper: "white" });
  const L = [K.model.shapeLayer(1, { x: 10, y: 10, w: 100, h: 50 }), K.model.shapeLayer(2, { x: 700, y: 10, w: 50, h: 50 })];
  const r = K.remap.remap(L, A, B);
  assertEquals(r.moved, [2]);   // the back shape stays; the front one moves with the spine
});

Deno.test("text on the front never leaves the live area with our 0.375 in margin", () => {
  for (const to of ["5x8", "8.5x11"]) {
    const B = { trim: to, pages: 240, paper: "cream" }, g = K.geo.geo(B);
    for (const key of ["band", "stack", "bold", "corner"]) {
      const b = K.layouts.build(key, DESIGN_BOOK, B, 1);
      for (const l of b.layers.filter((x) => x.type === "text" && x.x > g.foldR)) {
        assert(l.x >= g.liveFront.x0 + 17.5 - 1e-9 && l.x + l.w <= g.liveFront.x1 - 17.5 + 1e-9, key + " " + l.src);
      }
    }
  }
});

Deno.test("the default text height is the built textlayout (not the design estimate)", () => {
  const l = K.model.textLayer(1, { text: "One two three four five six seven eight nine ten", x: 500, y: 300, w: 100, size: 20, font: "IBM Plex Sans" });
  assertEquals(Math.round(designTextH(l) / K.textlayout.lineH(l)), 5);
  assertEquals(Math.round(K.textlayout.height(l) / K.textlayout.lineH(l)), 6);
  // the text keeps its center, so y differs by (height difference) × (sy − k) / 2: use a trim where k ≠ sy
  const A = K.geo.geo(G6), B = K.geo.geo({ trim: "5x8", pages: 120, paper: "white" });
  const a = K.remap.remap([l], A, B).layers[0], d = K.remap.remap([l], A, B, { textH: designTextH }).layers[0];
  const front = (B.W - B.foldR) / (A.W - A.foldR), sy = B.H / A.H, k = Math.min(front, sy);
  near(a.y - d.y, -(K.textlayout.height(l) - designTextH(l)) * k / 2 + (K.textlayout.height(l) - designTextH(l)) / 2 * sy);
  assert(Math.abs(a.y - d.y) > 0.5, "planned: textlayout replaces the estimate, so text y differs");
});
