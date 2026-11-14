// deno test --allow-read tests/cover-geo.test.js   (from the repo root)
// E16 Part 1: the board geometry, the size labels and the Kindle numbers for
// 6 trims × 4 page counts (the design's 54, 80, 120, 240) × 2 papers, against the design.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { K, GOLDEN, near, fk, TRIMS } from "./lib/cover-load.js";

// The owner's STOP 1 answers change two design values (labelled planned differences):
// D14 spine text on white from 86 pages (design 84); D16 the 300 DPI image size rounded up (design rounds).
function planned(c) {
  const g = Object.assign({}, c.g), labels = Object.assign({}, c.labels);
  let spineNote = c.spineNote;
  if (c.fmt.paper === "white") {
    g.spineMin = 86; g.spineTextOk = c.fmt.pages >= 86;
    spineNote = spineNote.replace("spine text starts at 84 pages", "spine text starts at 86 pages");
  }
  labels.px = Math.ceil(c.g.W / 70 * 300 - 1e-9) + " × " + Math.ceil(c.g.H / 70 * 300 - 1e-9) + " px";
  return { g, labels, spineNote };
}

for (const c of GOLDEN.geo) {
  Deno.test(`geo ${fk(c.fmt)}: every board number, label and Kindle line equals the design (D14, D16 applied)`, () => {
    const g = K.geo.geo(c.fmt), want = planned(c);
    const { f, ...rest } = g;
    assertEquals(f, c.fmt);
    near(rest, want.g, "geo");
    const L = K.names.labels(g);
    near({ trim: L.trim, pages: L.pages, paper: L.paper, spine: L.spine, full: L.full, line: L.line, wrap: L.wrap, px: L.px,
      fullText: L.fullText, fullMm: L.fullMm, spineText: L.spineText, spineMm: L.spineMm, spineCaps: L.spineCaps }, want.labels, "labels");
    assertEquals(K.names.kindleCut(g), c.kindleCut);
    assertEquals(K.names.spineNote(g), want.spineNote);
    assertEquals(K.kindle.transform(g, 200, 320), c.pvKindle);
    assertEquals(K.kindle.transform(g, 75, 120), c.pvThumb);
  });
}

Deno.test("the 6 trims, in the design's order; 08's group A is a subset", () => {
  assertEquals(K.geo.TRIMS, TRIMS);
  for (const t of globalThis.kdpFormatRules.TRIMS) assert(K.geo.TRIMS.includes(t), t);
});

Deno.test("the spine per page comes from 08 (one source of truth) and is not rounded", () => {
  const g = K.geo.geo({ trim: "6x9", pages: 54, paper: "white" });
  assertEquals(g.sp, 54 * globalThis.kdpFormatRules.SPINE_PER_PAGE.white);
  assertEquals(K.geo.geo({ trim: "6x9", pages: 333, paper: "cream" }).sp, 333 * globalThis.kdpFormatRules.SPINE_PER_PAGE.cream);
  // 08's label rounds to 4 decimals; the board does not
  assert(g.sp !== globalThis.kdpFormatRules.spine(54, "white") || g.sp === Math.round(g.sp * 1e4) / 1e4);
});

Deno.test("full wrap = 0.25 + 2 × trim + spine by trim + 0.25 (in), every trim and paper", () => {
  for (const trim of TRIMS) for (const paper of ["white", "cream"]) for (const pages of [24, 100, 828]) {
    const g = K.geo.geo({ trim, pages, paper }), [tw, th] = trim.split("x").map(Number);
    const w = K.geo.wrapIn(g);
    assert(Math.abs(w.w - (0.25 + 2 * tw + pages * globalThis.kdpFormatRules.SPINE_PER_PAGE[paper])) < 1e-9);
    assert(Math.abs(w.h - (th + 0.25)) < 1e-9);
  }
});

Deno.test("D16: 300 DPI image size of the design's book is 3712 × 2775 px (rounded up from 3711.48, never narrower than the wrap)", () => {
  assertEquals(K.geo.px300(K.geo.geo({ trim: "6x9", pages: 54, paper: "white" })), { w: 3712, h: 2775 });
  for (const trim of TRIMS) for (const pages of [24, 54, 120, 333, 828]) for (const paper of ["white", "cream"]) {
    const g = K.geo.geo({ trim, pages, paper }), p = K.geo.px300(g);
    assert(p.w / 300 >= g.W / 70 - 1e-9 && (p.w - 1) / 300 < g.W / 70, "w");
    assert(p.h / 300 >= g.H / 70 - 1e-9 && (p.h - 1) / 300 < g.H / 70, "h");
  }
  assertEquals(K.names.labels(K.geo.geo({ trim: "6x9", pages: 54, paper: "white" })).wrap, "12.372 × 9.25 in");
});

Deno.test("D14: spine text from 86 pages on white (owner STOP 1, N1), 80 on cream (owner Q-9)", () => {
  assertEquals(K.geo.SPINE_MIN, { white: 86, cream: 80 });
  for (const trim of TRIMS) {
    assertEquals(K.geo.geo({ trim, pages: 85, paper: "white" }).spineTextOk, false);
    assertEquals(K.geo.geo({ trim, pages: 86, paper: "white" }).spineTextOk, true);
    assertEquals(K.geo.geo({ trim, pages: 79, paper: "cream" }).spineTextOk, false);
    assertEquals(K.geo.geo({ trim, pages: 80, paper: "cream" }).spineTextOk, true);
  }
});

Deno.test("Kindle fit: only the wide trims (8 × 10, 8.5 × 11) add background instead of cutting", () => {
  for (const trim of TRIMS) assertEquals(K.geo.geo({ trim, pages: 120, paper: "white" }).kFit, trim === "8x10" || trim === "8.5x11", trim);
  assertEquals(+K.geo.geo({ trim: "6x9", pages: 54, paper: "white" }).kCut.toFixed(4), 0.1875);
  assertEquals(K.geo.geo({ trim: "5x8", pages: 54, paper: "white" }).kCut, 0);
});

Deno.test("normalizeFmt: unknown trims become 6 × 9, pages are whole 1 to 828, paper white unless cream", () => {
  assertEquals(K.geo.normalizeFmt({ trim: "7x10", pages: 120.4, paper: "Cream" }), { trim: "6x9", pages: 120, paper: "white" });
  assertEquals(K.geo.normalizeFmt({ trim: "8.5x11", pages: 0, paper: "cream" }), { trim: "8.5x11", pages: 1, paper: "cream" });
  assertEquals(K.geo.normalizeFmt({ trim: "5x8", pages: 5000 }), { trim: "5x8", pages: 828, paper: "white" });
  assertEquals(K.geo.normalizeFmt({ pages: "abc" }), { trim: "6x9", pages: 24, paper: "white" });
  assertEquals(K.geo.normalizeFmt(null), { trim: "6x9", pages: 24, paper: "white" });
  assertEquals(K.geo.normalizeFmt({ trim: "6x9", pages: "120", paper: "cream" }), { trim: "6x9", pages: 120, paper: "cream" });
});

Deno.test("geo needs 08's format-rules (no second copy of the spine numbers)", () => {
  const fr = globalThis.kdpFormatRules;
  try { delete globalThis.kdpFormatRules; assertThrows(() => K.geo.geo({ trim: "6x9", pages: 54 }), Error, "format-rules"); }
  finally { globalThis.kdpFormatRules = fr; }
});

Deno.test("align regions are KDP's live areas (front, back, spine, cover) or the selection box", () => {
  const g = K.geo.geo({ trim: "6x9", pages: 120, paper: "white" });
  near(K.geo.region(g, "front"), { x: g.liveFront.x0, y: 17.5, w: g.liveFront.x1 - g.liveFront.x0, h: g.H - 35 });
  near(K.geo.region(g, "back"), { x: 17.5, y: 17.5, w: g.foldL - 8.75 - 17.5, h: g.H - 35 });
  near(K.geo.region(g, "spine"), { x: g.foldL, y: 17.5, w: g.spine, h: g.H - 35 });
  near(K.geo.region(g, "cover"), { x: 17.5, y: 17.5, w: g.liveFront.x1 - 17.5, h: g.H - 35 });
  near(K.geo.region(g, "sel", [{ x: 10, y: 20, w: 5, h: 5 }, { x: 30, y: 5, w: 10, h: 10 }]), { x: 10, y: 5, w: 30, h: 20 });
});

for (const c of GOLDEN.quad) {
  Deno.test(`distortion ${c.dist.mode} ${JSON.stringify(c.dist.mode === "basic" ? [c.dist.top, c.dist.bottom] : c.dist.q)}: corners and matrix equal the design`, () => {
    const q = K.geo.quadOf({ w: c.w, dist: c.dist }, c.h);
    near(q, c.q, "corners");
    const H = K.geo.homography(c.w, c.h, q);
    const m = "matrix3d(" + [H.a / c.w, H.d / c.w, 0, H.g / c.w, H.b / c.h, H.e / c.h, 0, H.hh / c.h, 0, 0, 1, 0, H.c, H.f, 0, 1].map((n) => +n.toFixed(6)).join(",") + ")";
    assertEquals(m, c.matrix);
    // the map sends the box corners onto the 4 corners
    near([H.map(0, 0), H.map(c.w, 0), H.map(c.w, c.h), H.map(0, c.h)].map((p) => p.map((v) => +v.toFixed(4))), q.map((p) => p.map((v) => +v.toFixed(4))), "map");
  });
}
