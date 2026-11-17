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

Deno.test("trims: group A in the 08 order, then 8 x 10 and 8.5 x 11 (E13.2b); anything else reads as 6 x 9", () => {
  assertEquals(F.TRIMS, ["6x9", "5.5x8.5", "5.25x8", "5x8", "8x10", "8.5x11"]);
  assertEquals(F.LARGE, ["8x10", "8.5x11"]);
  assertEquals(F.trimSize("5.25x8"), { w: 5.25, h: 8 });
  assertEquals(F.trimSize("5.5x8.5"), { w: 5.5, h: 8.5 });
  assertEquals(F.trimSize("8x10"), { w: 8, h: 10 });
  assertEquals(F.trimSize("8.5x11"), { w: 8.5, h: 11 });
  assert(F.isGroupA("5x8") && F.isGroupA("8x10") && F.isGroupA("8.5x11") && !F.isGroupA("7x10") && !F.isGroupA(null));
  assert(F.isLarge("8x10") && F.isLarge("8.5x11") && !F.isLarge("6x9") && !F.isLarge("7x10") && !F.isLarge(null));
  assertEquals(F.trimSize("7x10"), { w: 6, h: 9 });
});

Deno.test("E13.2b layout: today's margins up to 6 x 9; large trims 5.5 in wide, type x 1.1 (STOP 1, layout A)", () => {
  const base = { margin: { inside: 0.75, outside: 0.5, top: 0.75, bottom: 0.75 }, scale: 1 };
  for (const t of ["6x9", "5.5x8.5", "5.25x8", "5x8", "7x10", null]) assertEquals(F.layout(t), base, String(t));
  assertEquals(F.layout("8x10"), { margin: { inside: 1.125, outside: 1.375, top: 0.875, bottom: 0.875 }, scale: 1.1 });
  assertEquals(F.layout("8.5x11"), { margin: { inside: 1.25, outside: 1.75, top: 1, bottom: 1 }, scale: 1.1 });
  for (const t of F.LARGE) {
    const l = F.layout(t);
    assertEquals(F.trimSize(t).w - l.margin.inside - l.margin.outside, 5.5, t);
    // Every margin is above KDP's minimum at every page count (inside 0.875 in at most; others 0.25 in).
    assert(l.margin.inside >= F.kdpMargin(828).inside && Math.min(l.margin.outside, l.margin.top, l.margin.bottom) >= 0.25, t);
  }
  F.layout("8x10").margin.inside = 9;   // a copy: the rule cannot be changed from outside
  assertEquals(F.layout("8x10").margin.inside, 1.125);
});

Deno.test("E13.2b trimsText: every Print PDF trim in one phrase (T1 to T3)", () => {
  assertEquals(F.trimsText("or"), "6 × 9, 5.5 × 8.5, 5.25 × 8, 5 × 8, 8 × 10 or 8.5 × 11 in");
  assertEquals(F.trimsText("and"), "6 × 9, 5.5 × 8.5, 5.25 × 8, 5 × 8, 8 × 10 and 8.5 × 11 in");
  assertEquals(F.trimsText(), F.trimsText("or"));
});

Deno.test("E13.2b maxPages: KDP's page limits by trim and paper (black ink)", () => {
  for (const t of ["6x9", "5.5x8.5", "5.25x8", "5x8", "8x10"]) assertEquals([F.maxPages(t, "white"), F.maxPages(t, "cream")], [828, 776], t);
  assertEquals([F.maxPages("8.5x11", "white"), F.maxPages("8.5x11", "cream")], [590, 550]);
  assertEquals(F.maxPages("6x9", undefined), 828);
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
  assertEquals(F.fileName("T", "8.5x11"), "t-print-8.5x11.pdf");
  assertEquals(F.fileName("T", "8x10"), "t-print-8x10.pdf");
});

Deno.test("E13.2 MARGIN equals the template's margins (js/format/book.typ)", () => {
  const typ = Deno.readTextFileSync(new URL("../js/format/book.typ", import.meta.url));
  const m = /#let MARGIN = \(inside: ([0-9.]+)in, outside: ([0-9.]+)in, top: ([0-9.]+)in, bottom: ([0-9.]+)in\)/.exec(typ);
  assertEquals([Number(m[1]), Number(m[2])], [F.MARGIN.inside, F.MARGIN.outside]);
  // E13.2b: the template's default page is layout('6x9').
  assertEquals({ inside: Number(m[1]), outside: Number(m[2]), top: Number(m[3]), bottom: Number(m[4]) }, F.layout("6x9").margin);
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
  assertEquals(F.marginNote(900), `KDP prints up to 828 pages at 6 × 9 in on white paper. ${fixed}`);
  // E13.2b: the trim's margins (T4) and KDP's limit for the trim and paper (T5).
  assertEquals(F.marginNote(48, "5x8"), `KDP minimum 0.375 in inside for 24 to 150 pages. ${fixed}`);
  assertEquals(F.marginNote(48, "8x10"), "KDP minimum 0.375 in inside for 24 to 150 pages. We use 1.125 in inside and 1.375 in outside, mirrored.");
  assertEquals(F.marginNote(0, "8.5x11"), "KDP's minimum inside margin depends on the page count. We use 1.25 in inside and 1.75 in outside, mirrored.");
  assertEquals(F.marginNote(776, "6x9", "cream"), `KDP minimum 0.875 in inside for 701 to 828 pages. ${fixed}`);
  assertEquals(F.marginNote(777, "6x9", "cream"), `KDP prints up to 776 pages at 6 × 9 in on cream paper. ${fixed}`);
  assertEquals(F.marginNote(590, "8.5x11", "white"), "KDP minimum 0.75 in inside for 501 to 700 pages. We use 1.25 in inside and 1.75 in outside, mirrored.");
  assertEquals(F.marginNote(591, "8.5x11", "white"), "KDP prints up to 590 pages at 8.5 × 11 in on white paper. We use 1.25 in inside and 1.75 in outside, mirrored.");
  assertEquals(F.marginNote(551, "8.5x11", "cream"), "KDP prints up to 550 pages at 8.5 × 11 in on cream paper. We use 1.25 in inside and 1.75 in outside, mirrored.");
  assertEquals(F.marginNote(829, "8x10", "white"), "KDP prints up to 828 pages at 8 × 10 in on white paper. We use 1.125 in inside and 1.375 in outside, mirrored.");
});

const v3 = (id, content, extra = {}) => ({ id, version_no: 1, content, ...extra });
const book3 = (sections) => ({ book: { id: "b", title: "T", pen_name: "P", bio: "", trim: "6x9" }, known: {}, now: "2026-11-04T12:00:00Z",
  chapters: [{ id: "c", kind: "chapter", position: 1, title: "C", sections }] });

Deno.test("E13.2 pageInfo and spineText (design 41 chips)", () => {
  assertEquals(F.pageInfo({ lastPage: 48, contentEnd: 47 }), { pages: 48, blanks: 1, content: 47 });
  assertEquals(F.pageInfo({ lastPage: 48, contentEnd: 48 }), { pages: 48, blanks: 0, content: 48 });
  assertEquals(F.pageInfo(null), { pages: 0, blanks: 0, content: 0 });
  assertEquals(F.spineText(48, "white"), "Spine 0.108 in · no spine text under 80 pages");
  assertEquals(F.spineText(80, "cream"), "Spine 0.200 in");
});

Deno.test("E13.2 ready: all Final, nothing missing → no warnings (no ISBN note, no v2a note)", () => {
  const m = F.modelOf(book3([{ id: "a", position: 1, title: "", status: "final", version: v3("va", "Plain words here.") }]), {});
  const r = F.ready({ model: m, missing: [], pages: 48 });
  assertEquals(r, { warnings: [], finals: 1 });
});

Deno.test("E13.2 ready: every warning, in order, with the section to open in 06", () => {
  const run = { started_at: "2026-11-04T11:59:50Z", heartbeat_at: "2026-11-04T11:59:58Z" };
  const d = book3([
    { id: "a", position: 1, title: "", status: "draft", version: v3("va", "x") },
    { id: "b", position: 2, title: "", status: "draft", version: null },
    { id: "e", position: 3, title: "", status: "final", version: null },
    { id: "r", position: 4, title: "", status: "final", needs_review: true, version: v3("vr", "x") },
    { id: "m", position: 5, title: "", status: "final", version: v3("vm", "A claim. [Verify: no source]") },
    { id: "u", position: 6, title: "", status: "final", unsaved: true, version: v3("vu", "x") },
    { id: "w", position: 7, title: "Seven", status: "final", run, version: v3("vw", "x") }]);
  const m = F.modelOf(d, {});
  const missing = [{ char: "😀", code: "U+1F600", faces: ["Lora"], where: ["1.7 Seven"] }];
  const r = F.ready({ model: m, missing, pages: 20, dropped: 2 });
  assertEquals(r.warnings.map((w) => w.key), ["not-final", "final-empty", "review", "marks", "unsaved", "running", "chars", "short", "also-by"]);
  const t = Object.fromEntries(r.warnings.map((w) => [w.key, w]));
  // 41c "WARNINGS · NEVER BLOCK" wording.
  assertEquals(t["not-final"].text, "2 sections are not Final. They are left out.");
  assertEquals(t["final-empty"].text, "1 Final section has no text. It is left out.");
  assertEquals([t.review.text, t.review.sectionId], ["1 section needs review.", "r"]);
  assertEquals([t.marks.text, t.marks.sectionId], ["1 claim has no source yet (Verify). The marks are not printed.", "m"]);
  assertEquals([t.unsaved.sectionId, t.running.sectionId], ["u", "w"]);
  assertEquals([t.chars.text, t.chars.sectionId], ["1 character is not in the font (an emoji in 1.7 Seven). It prints as a box.", "w"]);
  assertEquals(t.short.text, "20 pages. KDP needs at least 24 pages for a paperback.");
  assertEquals(t["also-by"].text, "2 Also by books were left out. They no longer have this pen name.");
});

Deno.test("E13.2b ready: KDP's page limit by trim and paper (T6, T7)", () => {
  const m = F.modelOf(book3([{ id: "a", position: 1, title: "", status: "final", version: v3("va", "x") }]), {});
  const w = (pages, trim, paper) => F.ready({ model: m, missing: [], pages, trim, paper }).warnings.map((x) => x.text);
  // Group A on white: as before (701 to 828 the margin, over 828 too long).
  assertEquals(w(828, "6x9", "white"), ["Over 700 pages. KDP asks for 0.875 in inside. This book uses 0.75 in."]);
  assertEquals(w(829, "5x8", "white"), ["829 pages. KDP prints up to 828 pages at 5 × 8 in on white paper."]);
  // Group A on cream: KDP stops at 776.
  assertEquals(w(776, "6x9", "cream"), ["Over 700 pages. KDP asks for 0.875 in inside. This book uses 0.75 in."]);
  assertEquals(w(777, "6x9", "cream"), ["777 pages. KDP prints up to 776 pages at 6 × 9 in on cream paper."]);
  // Large trims: the inside margin is wide enough at every count, so no margin warning.
  assertEquals(w(828, "8x10", "white"), []);
  assertEquals(w(829, "8x10", "white"), ["829 pages. KDP prints up to 828 pages at 8 × 10 in on white paper."]);
  assertEquals(w(777, "8x10", "cream"), ["777 pages. KDP prints up to 776 pages at 8 × 10 in on cream paper."]);
  assertEquals(w(590, "8.5x11", "white"), []);
  assertEquals(w(591, "8.5x11", "white"), ["591 pages. KDP prints up to 590 pages at 8.5 × 11 in on white paper."]);
  assertEquals(w(550, "8.5x11", "cream"), []);
  assertEquals(w(551, "8.5x11", "cream"), ["551 pages. KDP prints up to 550 pages at 8.5 × 11 in on cream paper."]);
  // No trim or paper given: 6 x 9 on white (the 08 callers before E13.2b Part 3).
  assertEquals(F.ready({ model: m, missing: [], pages: 777 }).warnings.map((x) => x.key), ["margin"]);
});

Deno.test("E13.2 ready: page limits (owner Q8: a warning only), several characters, a chapter, not checked yet", () => {
  const d = book3([{ id: "a", position: 1, title: "", status: "final", version: v3("va", "x") }]);
  d.chapters[0].needs_review = true;
  const m = F.modelOf(d, {});
  assertEquals(F.ready({ model: m, missing: [], pages: 702 }).warnings.map((w) => w.text),
    ["Chapter 1 needs review in 05 Outline.", "Over 700 pages. KDP asks for 0.875 in inside. This book uses 0.75 in."]);
  assertEquals(F.ready({ model: m, missing: [], pages: 830 }).warnings.map((w) => w.key), ["review-chapter", "long"]);
  assertEquals(F.ready({ model: m, missing: [], pages: 830 }).warnings[1].text, "830 pages. KDP prints up to 828 pages at 6 × 9 in on white paper.");
  const many = [{ char: "✓", code: "U+2713", where: ["1.1"] }, { char: "😀", code: "U+1F600", where: [] }, { char: "→", code: "U+2192", where: [] }, { char: "⅞", code: "U+215E", where: [] }];
  assertEquals(F.ready({ model: m, missing: many, pages: 48 }).warnings.find((w) => w.key === "chars").text,
    "4 characters are not in the font (“✓” (U+2713), an emoji, “→” (U+2192) and more, first in 1.1). They print as a box.");
  assertEquals(F.ready({ model: m, missing: null, pages: 0 }).warnings.map((w) => w.key), ["review-chapter"]);
});
