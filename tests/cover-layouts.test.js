// deno test --allow-read tests/cover-layouts.test.js   (from the repo root)
// E16 Part 1: the 12 ready layouts × 6 trims × 54/120 pages × 2 papers (288) and Blank (24).
// Port proof: with the design's own text-height estimate, every layer number and every
// check equals the design (tests/fixtures/cover-golden.json, made by tools/cover-golden.mjs).
// Built: with kdpCover.textlayout (the stub measure, not real font metrics), the 288 have no
// check problem (no error, no warning) and each Blank has exactly the 3 "missing" Must fix items. Owner STOP 9: with
// the editor's opt.samples, each of the 288 applied with no saved blurb shows C17 (and C16 for a photo layout).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, pos, chk, goldChk, designTextH, DESIGN_BOOK, fk, G6 } from "./lib/cover-load.js";

const run = (fmt, bg, layers, opt) => K.checks.run({ fmt, bg, layers }, opt);

// D15 (owner STOP 1, N4 and STOP 8): Stack and Bold put the title's other words on their own line (src
// titlerest) under the big title; the subtitle moves down only when that line reaches it. The port proof takes
// the rest line out and puts the design's subtitle back (Stack: its words at y 400; Bold: "for Busy Adult
// Learners. " + its words at y 430) before the remap, so every other number is compared with the design.
const DESIGN_SUB = { stack: { text: DESIGN_BOOK.subtitle, y: 400 }, bold: { text: "for Busy Adult Learners. " + DESIGN_BOOK.subtitle, y: 430 } };
const asDesign = (key, layers) => layers.filter((l) => l.src !== "titlerest").map((l) => (l.src === "subtitle" ? Object.assign({}, l, DESIGN_SUB[key]) : l));
function portBuild(key, fmt) {
  if (!DESIGN_SUB[key]) return K.layouts.build(key, DESIGN_BOOK, fmt, 1, undefined, { textH: designTextH });
  const b = K.layouts.base(key, DESIGN_BOOK, 1);
  b.layers = K.remap.remap(asDesign(key, b.layers), K.geo.geo(K.layouts.AUTHORED), K.geo.geo(fmt), { textH: designTextH }).layers;
  return b;
}

for (const c of GOLDEN.layouts) {
  Deno.test(`port: ${c.key} at ${fk(c.fmt)} equals the design${DESIGN_SUB[c.key] ? " (the rest line out, the design's subtitle back, D15)" : ""}`, () => {
    const b = portBuild(c.key, c.fmt);
    assertEquals(b.bg, c.bg);
    near(b.layers.map(pos), c.layers, "layers");
    const items = run(c.fmt, b.bg, b.layers, { textH: designTextH, spineInk: false });
    near(chk(items), goldChk(c.checks), "checks");
    assertEquals(items.map((x) => (x.fix ? x.fix.label : null)), c.checks.map((x) => x.fix));
  });
}

for (const c of GOLDEN.layouts) {
  Deno.test(`built: ${c.key} at ${fk(c.fmt)} has no check problem`, () => {
    const b = K.layouts.build(c.key, DESIGN_BOOK, c.fmt, 1);
    const items = run(c.fmt, b.bg, b.layers);
    assertEquals(items.filter((x) => x.sev !== "tip").map((x) => x.code + " " + x.msg), []);
    assertEquals(K.checks.summary(items).chip, "Ready");
  });
}

// Owner, STOP 9 (C17): the 288 again with the editor's checks (opt.samples). A layout applied with no saved blurb shows
// the sample blurb as a Must fix (C17, one, on the blurb layer), next to C16 for a layout's sample photo; with a saved
// blurb there is no C17 and the rest is as above (no problem but C16).
const PHOTO = ["picfull", "picband", "arch"];
for (const c of GOLDEN.layouts) {
  Deno.test(`samples: ${c.key} at ${fk(c.fmt)} with no saved blurb shows C17${PHOTO.includes(c.key) ? " and C16" : ""}`, () => {
    const b = K.layouts.build(c.key, DESIGN_BOOK, c.fmt, 1);
    const bl = b.layers.filter((l) => l.src === "blurb");
    assertEquals(bl.length, 1, "one blurb layer");
    const items = run(c.fmt, b.bg, b.layers, { samples: true }).filter((x) => x.sev !== "tip");
    const want = (PHOTO.includes(c.key) ? ["C16"] : []).concat(["C17"]).sort();
    assertEquals(items.map((x) => x.code).sort(), want);
    assertEquals(items.find((x) => x.code === "C17").id, bl[0].id);
    const real = K.layouts.build(c.key, DESIGN_BOOK, c.fmt, 1, "You signed up for the course.");
    assertEquals(run(c.fmt, real.bg, real.layers, { samples: true }).filter((x) => x.sev !== "tip").map((x) => x.code), PHOTO.includes(c.key) ? ["C16"] : []);
  });
}

for (const c of GOLDEN.blank) {
  Deno.test(`port: Blank at ${fk(c.fmt)} equals the design`, () => {
    const b = K.layouts.build("blank", DESIGN_BOOK, c.fmt, 1);
    assertEquals(b, { layers: [], bg: "#FFFFFF", nextId: 1 });
    const items = run(c.fmt, b.bg, b.layers, { textH: designTextH, spineInk: false });
    near(chk(items), goldChk(c.checks), "checks");
    assertEquals([K.checks.summary(items).chip, K.checks.summary(items).line], [c.chip, c.summary]);
  });
}

for (const c of GOLDEN.blank) {
  Deno.test(`built: Blank at ${fk(c.fmt)} has exactly the 3 missing Must fix items`, () => {
    const items = run(c.fmt, "#FFFFFF", []);
    const errors = items.filter((x) => x.sev === "error");
    assertEquals(errors.map((x) => x.code), ["C1", "C1", "C1"]);
    assertEquals(errors.map((x) => x.fix), [{ label: "Add it", action: "add", key: "title" }, { label: "Add it", action: "add", key: "subtitle" }, { label: "Add it", action: "add", key: "pen" }]);
    assertEquals(items.filter((x) => x.sev === "warn"), []);
    assertEquals(K.checks.summary(items).chip, "3 to fix");
  });
}

Deno.test("the layout list: 13 in the design's order, Blank first", () => {
  assertEquals(K.layouts.KEYS, ["blank", "band", "center", "stack", "corner", "picfull", "picband", "framed", "arch", "circle", "stripes", "ribbon", "bold"]);
  assertEquals(K.layouts.LIST.length, 13);
});

Deno.test("every layout's full layers at 6 × 9 equal the design (every field; the picture names its asset, not a CSS bg)", () => {
  for (const c of GOLDEN.layoutsFull) {
    const b = K.layouts.build(c.key, DESIGN_BOOK, G6, 1, undefined, { textH: designTextH });
    assertEquals(b.bg, c.bg, c.key);
    // D15: Stack and Bold have one more layer, the rest line, with the next id.
    assertEquals(b.nextId, c.nextId + (DESIGN_SUB[c.key] ? 1 : 0), c.key);
    const gold = c.layers.map((l) => {
      const o = Object.assign({}, l);
      if (o.type === "image") { delete o.bg; o.asset = null; }
      return o;
    });
    near(DESIGN_SUB[c.key] ? asDesign(c.key, b.layers) : b.layers, gold, c.key);
  }
});

Deno.test("Stack and Bold split the title: the first 3 words big, the other words their own line, the subtitle its own (D15, STOP 8)", () => {
  const TL = K.textlayout;
  for (const [key, sub0] of [["stack", 400], ["bold", 430]]) {
    const L = K.layouts.base(key, DESIGN_BOOK, 1).layers;
    const t = L.find((l) => l.src === "title"), r = L.find((l) => l.src === "titlerest"), s = L.find((l) => l.src === "subtitle");
    assertEquals(t.text, key === "stack" ? "MICRO\nSTUDY\nHABITS" : "MICRO STUDY HABITS", key);
    assertEquals(s.text, DESIGN_BOOK.subtitle, key);
    // the rest line: right under the title (8 px), in its box and color, IBM Plex Sans Bold, one line, 12 to 24 pt
    assertEquals([r.text, r.x, r.w, r.color, r.align, r.font, r.weight], ["for Busy Adult Learners", t.x, t.w, t.color, t.align, "IBM Plex Sans", 700], key);
    assertEquals(r.y, t.y + TL.height(t) + 8, key);
    assert(r.size <= 24 && r.size >= 12 && r.size * 2 === Math.round(r.size * 2) && TL.lines(r).length === 1, `${key} ${r.size}`);
    assert(r.size === 24 || TL.lines(Object.assign({}, r, { size: r.size + 0.5 })).length > 1, `${key}: the largest size that fits`);
    // the order: the rest line comes right after the title; it has the next free id
    assertEquals(L.indexOf(r), L.indexOf(t) + 1, key);
    assertEquals(r.id, Math.max(...L.map((l) => l.id)), key);
    // the subtitle stays at the design's place, or moves just below the rest line when that reaches it
    assertEquals(s.y, Math.max(sub0, r.y + TL.height(r) + 10), key);
    assert(s.y >= r.y + TL.height(r), `${key}: no overlap`);
  }
});

Deno.test("Stack and Bold: a long rest of the title steps down, never under 12 pt", () => {
  const TL = K.textlayout;
  const long = { title: "Micro Study Habits for Busy Adult Learners Who Work Nights and Weekends Too", subtitle: "s", pen: "p" };
  const r = K.layouts.base("stack", long, 1).layers.find((l) => l.src === "titlerest");
  assertEquals(r.text, "for Busy Adult Learners Who Work Nights and Weekends Too");
  assert(r.size >= 12 && r.size < 24, String(r.size));
  assert(r.size === 12 || TL.lines(r).length === 1, String(r.size));
});

Deno.test("Stack and Bold with a short title: no rest line, the subtitle stays as it is", () => {
  const book = { title: "Chair Yoga", subtitle: "Ten Minutes a Day", pen: "A. Writer" };
  assertEquals(K.layouts.base("stack", book, 1).layers.find((l) => l.src === "title").text, "CHAIR\nYOGA");
  assertEquals(K.layouts.base("stack", book, 1).layers.find((l) => l.src === "subtitle").text, "Ten Minutes a Day");
  const bold = K.layouts.base("bold", book, 1).layers;
  assertEquals(bold.find((l) => l.src === "title").text, "CHAIR YOGA");
  assertEquals(bold.find((l) => l.src === "subtitle").text, "Ten Minutes a Day");
  for (const key of ["stack", "bold"]) assertEquals(K.layouts.base(key, book, 1).layers.some((l) => l.src === "titlerest"), false, key);
  assertEquals(K.layouts.base("stack", book, 1).layers.find((l) => l.src === "subtitle").y, 400);
});

Deno.test("the blurb: the placeholder until there is a real one", () => {
  const ph = K.layouts.base("band", DESIGN_BOOK, 1).layers.find((l) => l.src === "blurb");
  assertEquals(ph.text, K.layouts.BLURB_PLACEHOLDER);
  assertEquals(K.layouts.base("band", DESIGN_BOOK, 1, "Real words.").layers.find((l) => l.src === "blurb").text, "Real words.");
  assertEquals(K.layouts.base("band", DESIGN_BOOK, 1, K.layouts.BLURB_PLACEHOLDER).layers.find((l) => l.src === "blurb").text, K.layouts.BLURB_PLACEHOLDER);
});

Deno.test("ids start at the next free id and count up", () => {
  const b = K.layouts.build("ribbon", DESIGN_BOOK, G6, 40);
  assertEquals(b.layers.map((l) => l.id), [40, 41, 42, 43, 44, 45]);
  assertEquals(b.nextId, 46);
  assertEquals(K.layouts.build("blank", DESIGN_BOOK, G6, 40).nextId, 40);
});

Deno.test("a layout on a real book: the book's own words on title, subtitle and pen", () => {
  const book = { title: "Budget Meal Prep", subtitle: "Cook Once, Eat All Week", pen: "Sam Lee" };
  for (const key of K.layouts.KEYS.filter((k) => k !== "blank")) {
    const L = K.layouts.build(key, book, G6, 1).layers;
    assert(L.some((l) => l.src === "pen" && l.text === "Sam Lee"), key);
    assert(L.some((l) => l.src === "title"), key);
    assert(L.some((l) => l.src === "subtitle"), key);
  }
});
