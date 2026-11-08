// deno test --allow-read tests/format-rules.test.js   (from the repo root)
// 08 Format, E13.1: the rules (js/format-rules.js). The styles, chapter
// labels, papers, defaults, header title limit, Also by limit and the ISBN
// rule are read from migration 0027 and must match it. Then normalize, the
// group A trims, the KDP margin tiers, the spine, the Final-only model and
// the file name.
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/format-rules.js";

const F = globalThis.kdpFormatRules;
const R = globalThis.kdpExportRules;
const SQL = Deno.readTextFileSync(new URL("../supabase/migrations/0027_format_print.sql", import.meta.url));
const list = (re) => re.exec(SQL)[1].split(",").map((x) => x.trim().replace(/^'|'$/g, ""));

Deno.test("0027 parity: styles, chapter labels, papers", () => {
  assertEquals(list(/book_formats_style_check check \(style in \(([^)]*)\)\)/), F.STYLES);
  assertEquals(list(/book_formats_chapter_label_check check \(chapter_label in \(([^)]*)\)\)/), F.CHAPTER_LABELS);
  assertEquals(list(/book_formats_paper_check check \(paper in \(([^)]*)\)\)/), F.PAPERS);
});

Deno.test("0027 parity: every default", () => {
  const d = F.defaults();
  const col = (name) => new RegExp(`^\\s*${name}\\s+\\S+.*?default (.+?),?\\s*$`, "m").exec(SQL)[1];
  assertEquals(col("style"), `'${d.style}'`);
  assertEquals(JSON.parse(col("parts").replace(/^'|'$/g, "")), d.parts);
  assertEquals(col("contents_sections"), String(d.contents_sections));
  assertEquals(col("chapter_label"), `'${d.chapter_label}'`);
  assertEquals(col("drop_cap"), String(d.drop_cap));
  assertEquals(col("recto_start"), String(d.recto_start));
  assertEquals(col("running_header"), String(d.running_header));
  assertEquals(col("paper"), `'${d.paper}'`);
  assertEquals(col("also_by"), "'{}'");
  assertEquals(d.header_title, null);
  assertEquals(d.isbn, null);
  assertEquals(Object.keys(d.parts).sort(), list(/is distinct from array\[([^\]]*)\]/));
  assertEquals([...F.PART_KEYS].sort(), Object.keys(d.parts).sort());
});

Deno.test("0027 parity: header title 80, Also by 20, the ISBN pattern", () => {
  assert(SQL.includes(`char_length(header_title) between 1 and ${F.HEADER_TITLE_MAX}`));
  assert(SQL.includes(`cardinality(p) > ${F.ALSO_BY_MAX}`));
  assert(SQL.includes("p !~ '^97[89][0-9]{10}$'"));
  assert(SQL.includes("case when i % 2 = 1 then 1 else 3 end"));
});

// The cases of t0027.sql's ISBN checks, and a few more.
const ISBN = [
  ["9780306406157", true], ["9798000000007", true], ["9780000000002", true],
  ["9780306406158", false], ["978030640615", false], ["97803064061570", false], ["0306406152", false],
  ["9770306406157", false], ["97803064061X7", false], ["978 0306406157", false], ["978-0306406157", false], [" 9780306406157", false], ["", false], [null, false]
];
Deno.test("isbnOk: as public.isbn_ok", () => {
  for (const [x, want] of ISBN) assertEquals(F.isbnOk(x), want, String(x));
});

Deno.test("isbnClean: hyphens and spaces allowed in the input, stored as 13 digits", () => {
  assertEquals(F.isbnClean("978-0-306-40615-7"), "9780306406157");
  assertEquals(F.isbnClean(" 978 0306 40615 7 "), "9780306406157");
  assertEquals(F.isbnClean("978\t0306406157"), "9780306406157");
  assertEquals(F.isbnClean("978-0-306-40615-8"), null);
  assertEquals(F.isbnClean("ISBN 9780306406157"), null);
  assertEquals(F.isbnClean("0-306-40615-2"), null);   // ISBN-10 is not accepted
  assertEquals(F.isbnClean(""), null);
  assertEquals(F.isbnClean(null), null);
});

Deno.test("normalize: missing or wrong values become the defaults", () => {
  assertEquals(F.normalize(null), F.defaults());
  assertEquals(F.normalize({}), F.defaults());
  const n = F.normalize({ style: "fancy", parts: { title: false, about: "yes" }, chapter_label: "roman", drop_cap: 1, paper: "cream",
    header_title: "  My title  ", isbn: "9780306406158", also_by: ["a", "a", 3, "b"] });
  assertEquals(n.style, "classic");
  assertEquals(n.parts, { ...F.defaults().parts, title: false });
  assertEquals(n.chapter_label, "chapter");
  assertEquals(n.drop_cap, false);
  assertEquals(n.paper, "cream");
  assertEquals(n.header_title, "My title");
  assertEquals(n.isbn, null);
  assertEquals(n.also_by, ["a", "b"]);
  assertEquals(F.normalize({ header_title: "x".repeat(81) }).header_title, null);
  assertEquals(F.normalize({ header_title: "x".repeat(80) }).header_title, "x".repeat(80));
  assertEquals(F.normalize({ header_title: "   " }).header_title, null);
  assertEquals(F.normalize({ also_by: Array.from({ length: 25 }, (_, i) => `b${i}`) }).also_by.length, 20);
  for (const s of F.STYLES) assertEquals(F.normalize({ style: s }).style, s);
});

Deno.test("trims: group A only, in the 08 order; anything else reads as 6 x 9", () => {
  assertEquals(F.TRIMS, ["6x9", "5.5x8.5", "5.25x8", "5x8"]);
  assertEquals(F.trimSize("5.25x8"), { w: 5.25, h: 8 });
  assertEquals(F.trimSize("5.5x8.5"), { w: 5.5, h: 8.5 });
  assert(F.isGroupA("5x8") && !F.isGroupA("7x10") && !F.isGroupA("8.5x11") && !F.isGroupA(null));
  assertEquals(F.trimSize("7x10"), { w: 6, h: 9 });
});

Deno.test("kdpMargin: the KDP tiers at their edges", () => {
  const t = (n) => [F.kdpMargin(n).inside, F.kdpMargin(n).ok];
  assertEquals(t(23), [0.375, false]);
  assertEquals(t(24), [0.375, true]);
  assertEquals(t(150), [0.375, true]);
  assertEquals(t(151), [0.5, true]);
  assertEquals(t(300), [0.5, true]);
  assertEquals(t(301), [0.625, true]);
  assertEquals(t(500), [0.625, true]);
  assertEquals(t(501), [0.75, true]);
  assertEquals(t(700), [0.75, true]);
  assertEquals(t(701), [0.875, true]);
  assertEquals(t(828), [0.875, true]);
  assertEquals(t(829), [0.875, false]);
  assertEquals(F.kdpMargin(48).outside, 0.25);
});

Deno.test("spine: pages x 0.002252 in white, 0.0025 in cream", () => {
  assertEquals(F.spine(48, "white"), 0.1081);
  assertEquals(F.spine(48, "cream"), 0.12);
  assertEquals(F.spine(406, "white"), 0.9143);
  assertEquals(F.spine(0, "white"), 0);
});

Deno.test("modelOf: Final sections only; intro and conclusion follow the format parts", () => {
  const v = (id, content) => ({ id, version_no: 1, content });
  const d = { book: { id: "b", title: "T", pen_name: "P", bio: "", trim: "6x9" }, known: {}, now: "2026-11-04T12:00:00Z", chapters: [
    { id: "i", kind: "intro", position: 1, title: "", sections: [{ id: "i1", position: 1, title: "", status: "final", version: v("vi", "x") }] },
    { id: "c", kind: "chapter", position: 2, title: "C", sections: [
      { id: "a", position: 1, title: "", status: "final", version: v("va", "x") },
      { id: "b", position: 2, title: "", status: "reviewed", version: v("vb", "x") },
      { id: "c", position: 3, title: "", status: "draft", version: v("vc", "x") }] },
    { id: "z", kind: "conclusion", position: 3, title: "", sections: [{ id: "z1", position: 1, title: "", status: "final", version: v("vz", "x") }] }] };
  assertEquals(R.versionIds(F.modelOf(d, {})), ["vi", "va", "vz"]);
  assertEquals(R.versionIds(F.modelOf(d, { parts: { intro: false, conclusion: false } })), ["va"]);
  assertEquals(F.modelOf(d, {}).include, "final");
  assertEquals(F.modelOf(d, {}).notFinal.map((s) => s.id), ["b", "c"]);
});

Deno.test("fileName: {title-slug}-print-{trim}.pdf", () => {
  assertEquals(F.fileName("Chair Yoga for Seniors: Over 60!", "6x9"), "chair-yoga-for-seniors-over-60-print-6x9.pdf");
  assertEquals(F.fileName("Café Ünder", "5.25x8"), "cafe-under-print-5.25x8.pdf");
  assertEquals(F.fileName("", "5x8"), "book-print-5x8.pdf");
  assertEquals(F.fileName("T", "7x10"), "t-print-6x9.pdf");
});

Deno.test("E13.2 MARGIN equals the template's margins (js/format/book.typ)", () => {
  const typ = Deno.readTextFileSync(new URL("../js/format/book.typ", import.meta.url));
  const m = /#let MARGIN = \(inside: ([0-9.]+)in, outside: ([0-9.]+)in/.exec(typ);
  assertEquals([Number(m[1]), Number(m[2])], [F.MARGIN.inside, F.MARGIN.outside]);
});

Deno.test("E13.2 PART_ROWS: design 41 order, every switch is a 0027 part key", () => {
  assertEquals(F.PART_ROWS.map((p) => p.key), ["title", "copyright", "contents", "front", "intro", "conclusion", "notes", "about", "also_by"]);
  for (const p of F.PART_ROWS) if (!p.later) assert(F.PART_KEYS.includes(p.key), p.key);
  assertEquals(F.PART_ROWS.filter((p) => p.always).map((p) => p.key), ["title", "copyright"]);
  assertEquals(F.PART_ROWS.find((p) => p.key === "notes").later, "Comes in v2b");
  assertEquals(F.PART_ROWS.find((p) => p.key === "front").later, "Write in 06 · v2b");
});

Deno.test("E13.2 trimText and marginNote", () => {
  assertEquals(F.trimText("6x9"), "6 × 9 in");
  assertEquals(F.trimText("5.25x8"), "5.25 × 8 in");
  const fixed = "We use 0.75 in inside and 0.5 in outside, mirrored.";
  assertEquals(F.marginNote(0), `KDP's minimum inside margin depends on the page count. ${fixed}`);
  assertEquals(F.marginNote(48), `KDP minimum 0.375 in inside for 24 to 150 pages. ${fixed}`);
  assertEquals(F.marginNote(12), `KDP minimum 0.375 in inside for 24 to 150 pages. ${fixed}`);
  assertEquals(F.marginNote(160), `KDP minimum 0.5 in inside for 151 to 300 pages. ${fixed}`);
  assertEquals(F.marginNote(720), `KDP minimum 0.875 in inside for 701 to 828 pages. ${fixed}`);
  assertEquals(F.marginNote(900), `KDP prints up to 828 pages. ${fixed}`);
});
