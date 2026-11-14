// deno test --allow-read tests/cover-layouts.test.js   (from the repo root)
// E16 Part 1: the 12 ready layouts × 6 trims × 54/120 pages × 2 papers (288) and Blank (24).
// Port proof: with the design's own text-height estimate, every layer number and every
// check equals the design (tests/fixtures/cover-golden.json, made by tools/cover-golden.mjs).
// Built: with kdpCover.textlayout (the stub measure, not real font metrics), the 288 have no
// check problem (no error, no warning) and each Blank has exactly the 3 "missing" Must fix items.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, pos, chk, goldChk, designTextH, DESIGN_BOOK, fk, G6 } from "./lib/cover-load.js";

const run = (fmt, bg, layers, opt) => K.checks.run({ fmt, bg, layers }, opt);

// D15 (owner STOP 1, N4): Stack puts the title's other words before the subtitle. The port proof
// puts the design's subtitle words back before the remap, so every number is compared with the design.
function portBuild(key, fmt) {
  if (key !== "stack") return K.layouts.build(key, DESIGN_BOOK, fmt, 1, undefined, { textH: designTextH });
  const b = K.layouts.base(key, DESIGN_BOOK, 1);
  b.layers = b.layers.map((l) => (l.src === "subtitle" ? Object.assign({}, l, { text: DESIGN_BOOK.subtitle }) : l));
  b.layers = K.remap.remap(b.layers, K.geo.geo(K.layouts.AUTHORED), K.geo.geo(fmt), { textH: designTextH }).layers;
  return b;
}

for (const c of GOLDEN.layouts) {
  Deno.test(`port: ${c.key} at ${fk(c.fmt)} equals the design${c.key === "stack" ? " (design subtitle words, D15)" : ""}`, () => {
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
    assertEquals(b.nextId, c.nextId, c.key);
    const gold = c.layers.map((l) => {
      const o = Object.assign({}, l);
      if (o.type === "image") { delete o.bg; o.asset = null; }
      if (c.key === "stack" && o.src === "subtitle") o.text = "for Busy Adult Learners. " + DESIGN_BOOK.subtitle;   // D15
      return o;
    });
    near(b.layers, gold, c.key);
  }
});

Deno.test("Stack and Bold split the title: the first 3 words big, the other words before the subtitle (Stack: D15)", () => {
  const st = K.layouts.base("stack", DESIGN_BOOK, 1).layers;
  assertEquals(st.find((l) => l.src === "title").text, "MICRO\nSTUDY\nHABITS");
  assertEquals(st.find((l) => l.src === "subtitle").text, "for Busy Adult Learners. " + DESIGN_BOOK.subtitle);
  const bold = K.layouts.base("bold", DESIGN_BOOK, 1).layers;
  assertEquals(bold.find((l) => l.src === "title").text, "MICRO STUDY HABITS");
  assertEquals(bold.find((l) => l.src === "subtitle").text, "for Busy Adult Learners. " + DESIGN_BOOK.subtitle);
});

Deno.test("Stack and Bold with a short title: no rest, the subtitle stays as it is", () => {
  const book = { title: "Chair Yoga", subtitle: "Ten Minutes a Day", pen: "A. Writer" };
  assertEquals(K.layouts.base("stack", book, 1).layers.find((l) => l.src === "title").text, "CHAIR\nYOGA");
  assertEquals(K.layouts.base("stack", book, 1).layers.find((l) => l.src === "subtitle").text, "Ten Minutes a Day");
  const bold = K.layouts.base("bold", book, 1).layers;
  assertEquals(bold.find((l) => l.src === "title").text, "CHAIR YOGA");
  assertEquals(bold.find((l) => l.src === "subtitle").text, "Ten Minutes a Day");
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
