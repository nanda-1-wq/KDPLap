// deno test --allow-read tests/qc-rules.test.js   (from the repo root)
// 07 Quality Control, E14.2: the free checks (js/qc-rules.js, plan section 5).
// A hit and a near miss for every rule, keys, spots, caps, US/UK, the disclaimer,
// sources named, the verdict and the 120,000-word timing. run() below checks EVERY
// output against the qc_results_ok shape (tests/lib/qc-shape.js). Every book here
// is made up (tests/fixtures/qc-books.js).
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/section-check-key.js";
import "../js/qc-promise-key.js";
import "../js/qc-lists.js";
import "../js/qc-glyphs.js";
import "../js/qc-rules.js";
import { big, book, BOOKS, chapter, section } from "./fixtures/qc-books.js";
import { resultsProblem } from "./lib/qc-shape.js";

const Q = globalThis.kdpQcRules;
const L = globalThis.kdpQcLists;
const T = globalThis.kdpTextChecks;
const R = globalThis.kdpExportRules;

function run(qc) {
  const r = Q.run(qc);
  assertEquals(resultsProblem(Q.results(r), Q.RULES), null);
  return r;
}
const one = (...sections) => book({ chapters: [chapter("Paths", sections)] });
const text = (md, o) => run(one(section(md, o)));
const hits = (r, rule) => r.items.filter((x) => x.rule === rule);
const has = (md, rule, o) => hits(text(md, o), rule).length > 0;
const spot = (x, sec) => sec.version.content.slice(x.start, x.end);

/* ── Group 1 ── */

Deno.test("not_final: Draft and Reviewed with text; never Final", () => {
  assertEquals(hits(text("Plain text here.", { status: "draft" }), "not_final")[0].message, "Draft, not Final. Only Final sections go into the book in 08.");
  assert(hits(text("Plain text here.", { status: "reviewed" }), "not_final")[0].message.startsWith("Reviewed, not Final."));
  assertEquals(has("Plain text here.", "not_final"), false);
});

Deno.test("no_text: no version or a blank one; a key with none; sections with text are not listed", () => {
  const a = section(null), b = section(" \n\t ");
  const r = run(one(a, b, section("Plain text here.")));
  assertEquals(hits(r, "no_text").map((x) => x.key), [`${a.id}|none`, `${b.id}|none`]);
  assertEquals(hits(r, "no_text")[0].version_id, null);
  assertEquals(r.sections, 1);
});

Deno.test("needs_review and stopped_run: the section's flags, keyed by version", () => {
  const s = section("Plain text here.", { review: true, partial: true });
  const r = run(one(s));
  assertEquals(hits(r, "needs_review")[0].key, `${s.id}|${s.version.id}`);
  assertEquals(hits(r, "stopped_run")[0].key, `${s.id}|${s.version.id}`);
  assertEquals(has("Plain text here.", "needs_review"), false);
  assertEquals(has("Plain text here.", "stopped_run"), false);
});

Deno.test("chapter_review: any chapter kind, text or not; the chapter id leads the key; no section", () => {
  const c = chapter("Paths", [section(null)], { review: true });
  const i = chapter("Introduction", [section("Plain text here.")], { kind: "intro", review: true });
  const r = run(book({ chapters: [i, c, chapter("Borders", [section("Plain text here too.")])] }));
  const rows = hits(r, "chapter_review");
  assertEquals(rows.map((x) => x.key), [`${i.id}|review`, `${c.id}|review`]);
  assert(rows[0].message.startsWith("The Introduction needs review"));
  assert(rows[1].message.startsWith("Chapter 1 needs review"));
  assertEquals([rows[0].section_id, rows[0].start], [null, null]);
});

Deno.test("under_target: under 80% only, the 06 rule", () => {
  const words = (n) => `${"word ".repeat(n).trim()}.`;
  assertEquals(hits(text(words(79), { target: 100 }), "under_target")[0].message, "79 of 100 words, under 80% of its target.");
  assertEquals(has(words(80), "under_target", { target: 100 }), false);
  assertEquals(has(words(150), "under_target", { target: 100 }), false);
  assertEquals(has(words(5), "under_target"), false);
});

Deno.test("cut_off: the 06 ending rule; the spot is the cut piece", () => {
  const s = section("A full sentence. Then this one stops");
  const x = hits(run(one(s)), "cut_off")[0];
  assertEquals(spot(x, s), "Then this one stops");
  assertEquals(has("A full sentence.", "cut_off"), false);
});

/* ── Group 2 ── */

Deno.test("verify_mark: the sentence with the mark", () => {
  const s = section("First part. A claim here. [Verify: no source] Last part.");
  const x = hits(run(one(s)), "verify_mark")[0];
  assertEquals(spot(x, s), "A claim here. [Verify: no source]");
  assertEquals(has("A claim here.", "verify_mark"), false);
});

Deno.test("number_no_source: the spot is the number; a sourced number is fine; the 06 row agrees", () => {
  const s = section("Sit down. A survey found 37% of people wake early. Stand up. A study of 200 cats and 41% of owners agrees.");
  const r = run(one(s));
  const rows = hits(r, "number_no_source");
  assertEquals(rows.map((x) => spot(x, s)), ["37%", "200"]);
  assertEquals(rows.length, T.check(s.version.content, { known: "" }).rows.find((x) => x.code === "number").ranges.length);
  const sourced = book({ chapters: [chapter("Paths", [section("A survey found 37% of people wake early.")])], sources: [{ kind: "source", body: "37% wake early.", citation: "Example survey" }] });
  assertEquals(hits(run(sourced), "number_no_source"), []);
});

Deno.test("source_not_named: labels and sources with no name; a source of stress is fine", () => {
  const s = section("Rest is good. [S3] Another source says tea helps.");
  const rows = hits(run(one(s)), "source_not_named");
  assertEquals(rows.map((x) => spot(x, s)), ["[S3]", "Another source says tea helps."]);
  assertEquals(has("A source of stress is noise.", "source_not_named"), false);
});

/* ── Group 3 ── */

const LONG = "Rake the gravel flat before the rain arrives tonight";

Deno.test("same_sentence: 8+ words in 2+ sections, each place, one key; 7 words is fine; the Export agrees", () => {
  const a = section(`${LONG}. Then rest.`), b = section(`First a thing. ${LONG}!`), c = section(`${LONG}?`);
  const qc = one(a, b, c);
  const rows = hits(run(qc), "same_sentence");
  assertEquals(rows.map((x) => x.section_id), [a.id, b.id, c.id]);
  assertEquals(new Set(rows.map((x) => x.key)).size, 1);
  assertEquals(spot(rows[1], b), `${LONG}!`);
  assert(rows[0].message.includes("and 1 more place"));
  const model = R.model(qc.data, { include: "all", parts: { intro: true, conclusion: true } });
  assertEquals(model.repeats.length, 1);
  assertEquals(rows.length, model.repeats[0].items.length);
  const short = "Rake the gravel flat before the rain";
  assertEquals(hits(run(one(section(`${short}.`), section(`${short}.`))), "same_sentence"), []);
});

Deno.test("same_sentence_here: the 2nd place in one section", () => {
  const s = section(`${LONG}. Rest now. ${LONG}.`);
  const rows = hits(run(one(s)), "same_sentence_here");
  assertEquals(rows.length, 1);
  assertEquals(rows[0].start, s.version.content.lastIndexOf("Rake"));
  assertEquals(rows[0].key.split("|")[0], s.id);
  assertEquals(has(`${LONG}. Rest now.`, "same_sentence_here"), false);
});

Deno.test("same_paragraph: grouped once, its sentences not listed again; a short one is fine; a sentence also elsewhere stays", () => {
  const para = `${LONG}. Then sweep the short path clean again today.`;
  const a = section(`Start here.\n\n${para}`), b = section(`${para}\n\nEnd here.`);
  const r = run(one(a, b));
  assertEquals(hits(r, "same_paragraph").length, 2);
  assertEquals(new Set(hits(r, "same_paragraph").map((x) => x.key)).size, 1);
  assertEquals(spot(hits(r, "same_paragraph")[0], a), para);
  assertEquals(hits(r, "same_sentence"), []);
  assertEquals(hits(r, "same_sentence_here"), []);
  assertEquals(hits(run(one(section("Rest well now."), section("Rest well now."))), "same_paragraph"), []);
  // The same sentence in a third place, outside the paragraph, is still a repeat.
  const c = section(`${LONG}. A new thought follows.`);
  assert(hits(run(one(a, b, c)), "same_sentence").length > 0);
});

const filler = (n) => Array.from({ length: n }, (_, i) => `w${(i * 7).toString(36)}x`).join(" ");
const uses = (word, n) => Array.from({ length: n }, (_, i) => `${word} ${(i + 1) * 3}a`).join(" ");

Deno.test("overused_word: 20+ uses AND 25+ per 10,000 words; spot in the section with most uses", () => {
  const a = section(`${uses("lantern", 6)}.`), b = section(`Plain words. ${uses("lantern", 14)}.`);
  const rows = hits(run(one(a, b)), "overused_word");
  assertEquals(rows.map((x) => [x.key, x.section_id]), [["lantern", b.id]]);
  assertEquals(spot(rows[0], b), "lantern");
  assertEquals(rows[0].start, b.version.content.indexOf("lantern"));
  // 19 uses is not enough, and neither is 20 uses at 24 per 10,000 words.
  assertEquals(has(`${uses("lantern", 19)}.`, "overused_word"), false);
  assertEquals(has(`${uses("lantern", 20)} ${filler(8300)}.`, "overused_word"), false);
  assert(has(`${uses("lantern", 20)} ${filler(7900)}.`, "overused_word"));
});

Deno.test("overused_word: not a common word, under 4 letters, in the titles, or in a heading", () => {
  assertEquals(has(`${uses("people", 30)}.`, "overused_word"), false);
  assertEquals(has(`${uses("oak", 30)}.`, "overused_word"), false);
  assertEquals(hits(run(book({ title: "The Lantern Book", chapters: [chapter("Paths", [section(`${uses("lanterns", 30)}.`)])] })), "overused_word"), []);
  assertEquals(hits(run(book({ subtitle: "Lanterns at dusk", chapters: [chapter("Paths", [section(`${uses("lantern", 30)}.`)])] })), "overused_word"), []);
  assertEquals(hits(run(book({ chapters: [chapter("Lanterns", [section(`${uses("lantern", 30)}.`)])] })), "overused_word"), []);
  assertEquals(has(`## lantern lantern lantern\n\n${uses("lantern", 19)}.`, "overused_word"), false);
});

Deno.test("overused_word: at most 5 words, most used first", () => {
  const trees = ["alder", "birch", "cedar", "dogwood", "hazel", "linden", "ginkgo"];
  const md = trees.map((w, i) => `${uses(w, 30 + i)}.`).join(" ");
  assertEquals(hits(text(md), "overused_word").map((x) => x.key).sort(), ["cedar", "dogwood", "ginkgo", "hazel", "linden"]);
});

/* ── Group 4 ── */

const chapters = (n, md) => book({ chapters: [
  chapter("Introduction", [section("Plain text here.")], { kind: "intro" }),
  ...Array.from({ length: n }, (_, i) => chapter(`Part ${i + 1}`, [section(i === 0 ? md : "Plain text here.")])),
  chapter("Conclusion", [section("Plain text here.")], { kind: "conclusion" }),
] });

Deno.test("chapter_missing: Chapter 3 of 8 ok, Chapter 9 flagged, Chapter 0 flagged, the spot is the match", () => {
  const ok = run(chapters(8, "See Chapter 3 for more. Go back to chapter 8 now."));
  assertEquals(hits(ok, "chapter_missing"), []);
  const qc = chapters(8, "Plain start. See Chapter 9 for more. Try chapter 0 too.");
  const rows = hits(run(qc), "chapter_missing");
  assertEquals(rows.map((x) => x.quote), ["Chapter 9", "chapter 0"]);
  assertEquals(rows[0].message, '"Chapter 9" does not exist. This book has 8 chapters.');
  // The Introduction and the Conclusion have no number: a book of 2 chapters has no chapter 3.
  assertEquals(hits(run(chapters(2, "See Chapter 3.")), "chapter_missing").length, 1);
});

Deno.test("section_number and preview: always flagged, with their spots; other words are fine", () => {
  const s = section("Plain start. Section 2.3 shows it. Chapter 5.2 shows it too. The next chapter covers it. Later in this book we rest.");
  const r = run(one(s));
  assertEquals(hits(r, "section_number").map((x) => x.quote), ["Section 2.3", "Chapter 5.2"]);
  assertEquals(hits(r, "preview").map((x) => x.quote), ["The next chapter covers it.", "Later in this book we rest."]);
  assertEquals(has("This section is short. The next morning is calm.", "section_number"), false);
  assertEquals(has("This section is short. The next morning is calm.", "preview"), false);
  // One sentence, two mentions: one issue per mention, the 06 row lists the sentence once.
  const both = section("Plain start. See section 4 and the next chapter.");
  const r2 = run(one(both));
  assertEquals([hits(r2, "section_number").length, hits(r2, "preview").length], [1, 1]);
  assertEquals(T.check(both.version.content, { chapters: 5 }).rows.find((x) => x.code === "mention").sents.length, 1);
});

Deno.test("leftover: one note at one spot is one row, two notes are two (E14.7 live)", () => {
  assertEquals(hits(text("Rest [TODO: add a photo here.] well."), "leftover").map((x) => x.quote), ["[TODO: add a photo here.]"]);
  assertEquals(hits(text("Rest [TODO: one] well. Sit TODO: two now."), "leftover").map((x) => x.quote), ["[TODO: one]", "TODO:"]);
  assertEquals(hits(text("Rest TBD and [TODO] now."), "leftover").map((x) => x.quote).sort(), ["TBD", "[TODO]"]);
});

Deno.test("leftover: every listed form; small letters and plain words are fine", () => {
  for (const [md, match] of [["Rest now [TODO] well.", "[TODO]"], ["Rest. TODO: add a photo.", "TODO:"], ["The date is TBD for now.", "TBD"], ["Call XXX for help.", "XXX"],
    ["See [insert photo of a gate] here.", "[insert photo of a gate]"], ["Dear {{reader name}}, hello.", "{{reader name}}"], ["Tea helps [citation needed] a lot.", "[citation needed]"], ["Lorem ipsum dolor sit.", "Lorem ipsum"]]) {
    assertEquals(hits(text(md), "leftover").map((x) => x.quote), [match], md);
  }
  for (const md of ["Make a todo list.", "The tbd note stays.", "Insert the key slowly.", "A xxx is small.", "Rest. [Verify: no source]", "Roman XX is twenty."]) assertEquals(has(md, "leftover"), false, md);
});

/* ── Group 5 ── */

Deno.test("two_spellings: the minority form at its first use; each form once", () => {
  const a = section("Check your email first. Then your email again."), b = section("Plain words. Send an e-mail. Send another e-mail.");
  const rows = hits(run(one(a, b)), "two_spellings");
  assertEquals(rows.length, 1);
  assertEquals(rows[0].key, `${b.id}|e-mail`);
  assertEquals(rows[0].start, b.version.content.indexOf("e-mail"));
  assertEquals(rows[0].message, '"e-mail" here, "email" 2 times in the book. Pick one.');
});

Deno.test("two_spellings: a tie keeps the form that comes first; space variants from the list", () => {
  assertEquals(hits(text("Use e-mail. Use email."), "two_spellings")[0].quote, "email");
  assertEquals(hits(text("Good healthcare helps. More healthcare helps. Health care helps."), "two_spellings")[0].quote, "Health care");
  assertEquals(hits(text("Good well-being helps. More well-being helps. Well being helps."), "two_spellings")[0].quote, "Well being");
  assertEquals(has("Good healthcare helps. More healthcare helps.", "two_spellings"), false);
});

Deno.test("two_spellings: noun/verb pairs skipped; words that only look alike skipped", () => {
  for (const md of ["Warm up first. Then a warm-up.", "Set up the bed. The set-up is easy.", "Log in now. The log-in is easy.", "Work out. A work-out.", "Check in here. The check-in desk."]) assertEquals(has(md, "two_spellings"), false, md);
  for (const md of ["I resign today. I re-sign the form.", "We recover the chair. We re-cover the chair.", "Press release. Re-lease the flat."]) assertEquals(has(md, "two_spellings"), false, md);
  const spaced = new Set(L.SPACE_VARIANTS.map(([s]) => s));
  for (const v of L.NOUN_VERB) assertEquals(spaced.has(v), false, v);
});

const US_OF = new Map(), ALL_US = new Set(), ALL_UK = new Set();
for (const [us, uk, suf] of L.US_UK) for (const x of suf.split(" ")) { const e = x === "-" ? "" : x; ALL_US.add(us + e); ALL_UK.add(uk + e); US_OF.set(uk + e, us + e); }

Deno.test("us_uk: the list has about 200 base pairs, no ambiguous pair, no word on both sides", () => {
  assert(L.US_UK.length >= 200, `${L.US_UK.length} base pairs`);
  for (const w of ["practice", "practise", "program", "programme", "meter", "metre", "license", "licence", "check", "cheque", "tire", "tyre", "story", "storey", "analyses", "paralyses"]) {
    assertEquals(ALL_US.has(w) || ALL_UK.has(w), false, w);
  }
  for (const w of ALL_US) assertEquals(ALL_UK.has(w), false, w);
});

Deno.test("us_uk: the majority wins; each minority word, per section, first use", () => {
  const a = section("The color of the wall. The color of the door. The honor is ours. A theater and a center."), b = section("Plain text. The colour here. The colour there."), c = section("A favourite and a colour.");
  const rows = hits(run(one(a, b, c)), "us_uk");
  assertEquals(rows.map((x) => x.key).sort(), [`${b.id}|colour`, `${c.id}|colour`, `${c.id}|favourite`].sort());
  assertEquals(rows[0].start, b.version.content.indexOf("colour"));
  assertEquals(rows[0].message, '"colour" is the UK spelling. This book mostly uses US spelling ("color").');
  const uk = text("The colour of the wall. The colour of the door. The favourite one. A color.");
  assertEquals(hits(uk, "us_uk").map((x) => x.quote), ["color"]);
  assert(hits(uk, "us_uk")[0].message.includes("mostly uses UK spelling"));
});

Deno.test("us_uk: a tie is one book-wide issue; one spelling only is fine; ambiguous pairs never count", () => {
  const tie = hits(text("The colour stays. Then the color goes."), "us_uk");
  assertEquals(tie.length, 1);
  assertEquals([tie[0].key, tie[0].section_id, tie[0].start], ["tie", null, null]);
  assertEquals(has("The colour and the honour.", "us_uk"), false);
  assertEquals(has("Practice daily. We practise. A program. A programme. A tyre and a tire.", "us_uk"), false);
  assertEquals(has("Discoloration is fine and a colorist too.", "us_uk"), false);
  // A possessive and a capital are the same word; a link is not text.
  assertEquals(hits(text("The Colour's depth. The color. The color."), "us_uk")[0].key.split("|")[1], "colour");
  assertEquals(has("The color. Visit https://colour.example/colour now.", "us_uk"), false);
});

/* ── Group 7 ── */

Deno.test("web_link: every form; a bare domain and slashes in words are fine", () => {
  for (const [md, match] of [["See https://example.com/a?b=1.", "https://example.com/a?b=1"], ["See http://example.org today.", "http://example.org"], ["Visit www.example.com, please.", "www.example.com"],
    ["Go to example.com/sleep now.", "example.com/sleep"], ["Write to help@example.co.uk today.", "help@example.co.uk"], ["See [the site](https://example.com/x) now.", "https://example.com/x"]]) {
    assertEquals(hits(text(md), "web_link").map((x) => x.quote), [match], md);
  }
  for (const md of ["Visit example.com some day.", "Use and/or here.", "Take 3.5/5 of it.", "Meet at a.m./p.m. hours.", "Awww. That is nice.", "Roughly 1.5 mg/dL here."]) assertEquals(has(md, "web_link"), false, md);
});

Deno.test("emoji: presentation, a pictograph + FE0F, keycaps, flags, joined as one; © ® ™ and marks are not", () => {
  for (const [md, n] of [["Hi 😀 there.", 1], ["Love ❤️ it.", 1], ["Step 1️⃣ now.", 1], ["Go 🇺🇸 now.", 1], ["Good 👍🏽 work.", 1], ["A family 👨‍👩‍👧 here.", 1], ["Marked ©️ here.", 1], ["Two 😀😀 here.", 2]]) {
    assertEquals(hits(text(md), "emoji").length, n, md);
  }
  for (const md of ["Copyright © 2026, Brand® and Name™.", "A ✓ mark, a → arrow and a # sign.", "Step 1 and step 2."]) assertEquals(has(md, "emoji"), false, md);
  assertEquals(hits(text("Hi 😀 there."), "emoji")[0].quote, "😀");
});

Deno.test("missing_char: the style's font, no 08 row is classic; first use per section; spaces, format characters and emoji skipped", () => {
  const s = section("Plain 語 then 語 and ツ here.");
  const r = run(one(s));
  assertEquals(r.style, "classic");
  const rows = hits(r, "missing_char");
  assertEquals(rows.map((x) => [x.key, x.quote]), [[`${s.id}|U+8A9E`, "語"], [`${s.id}|U+30C4`, "ツ"]]);
  assert(rows[0].message.includes("EB Garamond"));
  assertEquals(has("Café “naïve” text — fine… a\u00A0b\u00ADc\u200Bd\uFEFFe.", "missing_char"), false);
  // Neither is in any font: a space and a format character are skipped, not reported.
  assertEquals(globalThis.kdpQcGlyphs.has("classic", 0x3000) || globalThis.kdpQcGlyphs.has("classic", 0xFFF9), false);
  assertEquals(has("A\u3000wide space and a\uFFF9format mark.", "missing_char"), false);
  // Emoji are listed once, as emoji: no second row for the emoji or its parts.
  assertEquals(has("Good 👍🏽 and ❤️ here.", "missing_char"), false);
  // A character only in Classic: U+0483 is in EB Garamond's table or not, but the style decides.
  const G = globalThis.kdpQcGlyphs;
  let only = null;
  for (let cp = 0x80; cp < 0x3000 && only === null; cp++) if (G.has("classic", cp) && !G.has("warm", cp) && !/[\s\p{Cf}]/u.test(String.fromCodePoint(cp))) only = cp;
  const md = `A ${String.fromCodePoint(only)} here.`;
  assertEquals(hits(run(book({ chapters: [chapter("Paths", [section(md)])], format: { style: "warm", parts: {} } })), "missing_char").length, 1);
  assertEquals(hits(run(book({ chapters: [chapter("Paths", [section(md)])], format: { style: "classic", parts: {} } })), "missing_char").length, 0);
  assertEquals(run(book({ chapters: [chapter("Paths", [section(md)])], format: { style: "warm", parts: {} } })).style, "warm");
  assertEquals(run(book({ chapters: [chapter("Paths", [section(md)])], format: { style: "odd", parts: {} } })).style, "classic");
});

Deno.test("missing_char: book, chapter and section titles print too", () => {
  const s = section("Plain text here.", { title: "庭 path" });
  const r = run(book({ title: "語 Garden", chapters: [chapter("ツ Paths", [s])] }));
  const rows = hits(r, "missing_char");
  assertEquals(rows.map((x) => x.key).sort(), [`${s.id}|U+5EAD`, "book|U+30C4", "book|U+8A9E"].sort());
  assert(rows.every((x) => x.start === null));
});

Deno.test("length: the page estimate around 24 pages and past 828; the trim counts", () => {
  const md = (n) => `${"word ".repeat(n).trim()}.`;
  // pages() rounds to the nearest 5: 5,624 words is 20 pages, 5,625 is 25.
  const r = text(md(5624));
  assertEquals(hits(r, "length")[0].message, "About 20 pages. KDP needs at least 24 for a paperback.");
  assertEquals([hits(r, "length")[0].key, hits(r, "length")[0].section_id], ["length", null]);
  assertEquals(has(md(5625), "length"), false);
  const trim = (t, n) => run(book({ trim: t, chapters: [chapter("Paths", [section(md(n))])] }));
  assertEquals(hits(trim("8.5x11", 7000), "length").length, 1);
  assertEquals(hits(trim("5x8", 7000), "length").length, 0);
  assertEquals(hits(run(book({ chapters: [chapter("Paths", [section(md(207000))])] })), "length")[0].message, "About 830 pages. KDP takes at most 828 for a paperback.");
  assertEquals(hits(run(book({ chapters: [chapter("Paths", [section(md(206000))])] })), "length"), []);
});

Deno.test("disclaimer: topic yes or no × the copyright part on or off × a phrase in the text", () => {
  const off = { style: "classic", parts: { copyright: false }, chapter_label: "chapter" };
  const on = { style: "classic", parts: { copyright: true }, chapter_label: "chapter" };
  const cases = [
    ["health, copyright off", { title: "Calm Sleep Tonight", format: off }, "Plain text here.", "The topic is close to health, and the book has no disclaimer."],
    ["money, copyright off", { topic: "paying off debt", format: off }, "Plain text here.", "The topic is close to money, and the book has no disclaimer."],
    ["both", { title: "Health and Money", format: off }, "Plain text here.", "The topic is close to health and money, and the book has no disclaimer."],
    ["health, copyright on", { title: "Calm Sleep Tonight", format: on }, "Plain text here.", null],
    ["health, no 08 row: on by default", { title: "Calm Sleep Tonight" }, "Plain text here.", null],
    ["health, parts without copyright: on by default", { title: "Calm Sleep Tonight", format: { style: "classic", parts: {} } }, "Plain text here.", null],
    ["health, a phrase", { title: "Calm Sleep Tonight", format: off }, "This is not medical advice at all.", null],
    ["health, another phrase over a line", { title: "Calm Sleep Tonight", format: off }, "Please talk to\nyour doctor first.", null],
    ["health, a heading", { title: "Calm Sleep Tonight", format: off }, "## Disclaimer\n\nPlain text here.", null],
    ["other topic", { title: "Quiet Garden Paths", format: off }, "Plain text here.", null],
    ["near misses: painting, taxi, wealthy", { title: "Painting a Taxi", problem: "wealthy clients", format: off }, "Plain text here.", null],
    ["reader problem", { problem: "poor sleep", format: off }, "Plain text here.", "The topic is close to health, and the book has no disclaimer."],
    ["chapter title", { format: off, chapter: "Weight and Balance" }, "Plain text here.", "The topic is close to health, and the book has no disclaimer."],
    ["positioning promise", { format: off, positioning: { reader_promise: "Less debt in a year" } }, "Plain text here.", "The topic is close to money, and the book has no disclaimer."],
  ];
  for (const [name, o, md, want] of cases) {
    const r = run(book({ ...o, chapters: [chapter(o.chapter ?? "Paths", [section(md)])] }));
    assertEquals(hits(r, "disclaimer").map((x) => x.message), want ? [want] : [], name);
    if (want) assertEquals([hits(r, "disclaimer")[0].key, hits(r, "disclaimer")[0].section_id], ["disclaimer", null], name);
  }
  const titled = run(book({ title: "Calm Sleep", format: off, chapters: [chapter("Paths", [section("Plain text here.", { title: "Disclaimer" })])] }));
  assertEquals(hits(titled, "disclaimer"), []);
});

/* ── Sources named in the text ── */

const named = (citation, md) => run(book({ sources: [{ kind: "source", body: "A fact.", citation }], chapters: [chapter("Paths", [section(md)])] })).sources;

Deno.test("sources named: the surname, the title words, none", () => {
  for (const c of ["Walker, M. (2017). Why We Sleep. Scribner.", "Matthew Walker, Why We Sleep (2017)", "M. Walker et al. A paper.", "Why We Sleep by Matthew Walker", "Walker (2017)"]) {
    assertEquals(named(c, "Walker says the room should be dark.").length, 1, c);
  }
  assertEquals(named("World Health Organization, Guidelines 2020", "The World Health Organization says so.").length, 1);
  assertEquals(named("Sleep, A. (2001). Night Garden Walking Paths. A Press.", "We tried night garden walking on a warm day.").length, 1);
  assertEquals(named("Walker, M. (2017). Why We Sleep. Scribner.", "A walker needs rest.").length, 0);
  assertEquals(named("Walker, M. (2017). Why We Sleep. Scribner.", "Nothing here names it.").length, 0);
  // Three common words in a row are not a title; a surname that is a common word is not a name.
  assertEquals(named("A. Other. Some of the most helpful things.", "Some of the most people came.").length, 0);
  assertEquals(named("Young, A. (2001). A Note.", "Young people and their rest.").length, 0);
});

Deno.test("sources named: sections in book order; the shape's limits; notes have no citation", () => {
  const a = section("Plain text here."), b = section("Walker says rest."), c = section("We read Night Garden Walking Paths.");
  const cite = "Walker, M. (2017). Night Garden Walking Paths. Scribner.";
  const sources = [{ kind: "note", body: "A note.", citation: null }, { kind: "source", body: "A.", citation: cite }, { kind: "source", body: "B.", citation: cite }];
  const r = run(book({ sources, chapters: [chapter("Paths", [a, c, b])] }));
  assertEquals(r.sources, [{ citation: cite, sections: [c.id, b.id] }]);
  assertEquals(hits(r, "source_not_named"), []);
  const long = `Walker, ${"Z".repeat(300)}`;
  assertEquals(named(long, "Walker says rest.")[0].citation.length, 200);
  const many = Array.from({ length: 60 }, (_, i) => ({ kind: "source", body: "A.", citation: `Walker${"abcdefghij"[i % 10]}${"klmnopqrst"[(i / 10) | 0]}, A.` }));
  const names = many.map((m) => m.citation.split(",")[0]).join(" says. ");
  assertEquals(run(book({ sources: many, chapters: [chapter("Paths", [section(names)])] })).sources.length, 50);
});

/* ── Keys and spots ── */

Deno.test("keys: the same on another run and after a spot moves; they change with the text at the spot", () => {
  const md = (lead) => `${lead}A survey found 37% of people wake early. Rest. [Verify: no source]\n\nSee Chapter 9 now. Visit https://example.com/a today. TODO: fix this.`;
  const s1 = section(md("")), s2 = { ...section(md("A new first sentence. ")), id: s1.id };
  const keys = (s) => { const r = run(one(s)); return r.items.filter((x) => x.section_id).map((x) => `${x.rule} ${x.key}`).sort(); };
  assertEquals(keys(s1), keys(s1));
  assertEquals(keys(s1), keys(s2));
  const moved = run(one(s2)).items.find((x) => x.rule === "number_no_source");
  assertNotEquals(moved.start, run(one(s1)).items.find((x) => x.rule === "number_no_source").start);
  const changed = { ...section(md("").replace("37%", "38%")), id: s1.id };
  assertNotEquals(hits(run(one(changed)), "number_no_source")[0].key, hits(run(one(s1)), "number_no_source")[0].key);
  // Spaces and case do not change a key.
  const spaced = { ...section("A  survey found 37%   of people wake early."), id: s1.id }, plain = { ...section("a survey found 37% of people wake early."), id: s1.id };
  assertEquals(hits(run(one(spaced)), "number_no_source")[0].key, hits(run(one(plain)), "number_no_source")[0].key);
});

Deno.test("keys: a new version of the section brings the section-level issues back", () => {
  const s = section("Plain text here.", { status: "draft" });
  const v2 = { ...s, version: { ...s.version, id: "b0000000-0000-4000-8000-000000000000" } };
  assertNotEquals(hits(run(one(s)), "not_final")[0].key, hits(run(one(v2)), "not_final")[0].key);
});

Deno.test("spots: every item's offsets hold its quote in the version's Markdown; long sentences fit", () => {
  const qc = BOOKS.messy();
  const bySection = new Map(qc.data.chapters.flatMap((c) => c.sections.map((s) => [s.id, s])));
  const r = run(qc);
  for (const x of r.items) {
    if (x.start === null) { assertEquals(x.quote, "", x.rule); continue; }
    const s = bySection.get(x.section_id);
    assertEquals(x.version_id, s.version.id, x.rule);
    assertEquals(s.version.content.slice(x.start, x.end), x.quote, x.rule);
  }
  const long = `${"Word ".repeat(120)}and 37% more.`;
  const row = hits(text(`${long} ${long}`), "same_sentence_here");
  assert(row[0].key.length <= 300);
  // The 300 falls inside an emoji: never half of one (jsonb refuses it).
  const cutOff = hits(text(`a${"😀".repeat(200)}`), "cut_off")[0];
  assert(cutOff.quote.isWellFormed());
  assertEquals(cutOff.quote.length, 299);
  const tall = hits(text(`${"語".repeat(400)} with no end`), "cut_off")[0];
  assert([...tall.quote].length <= 300);
  const word = hits(text(`Use ${"long-".repeat(100)}word here. Use ${"long".repeat(100)}word too.`), "two_spellings");
  assert(word.length === 1 && word[0].key.length <= 300);
});

/* ── Run, notes, caps ── */

Deno.test("run: QC checks every kind and status with text; notes; words and sections", () => {
  const i = section("One two three.", { status: "draft", unsaved: true });
  const c = section("Four five.", { run: { started_at: "2026-11-05T09:59:59+00:00", heartbeat_at: "2026-11-05T09:59:59+00:00" } });
  const e = section("Six.");
  const qc = book({ chapters: [chapter("Introduction", [i], { kind: "intro" }), chapter("Paths", [c, section(null)]), chapter("Conclusion", [e], { kind: "conclusion" })] });
  const r = run(qc);
  assertEquals([r.sections, r.words], [3, 6]);
  assertEquals(r.notes, { unsaved: 1, running: 1 });
  assertEquals(Object.keys(r).sort(), ["items", "more", "notes", "sections", "sources", "style", "words"]);
});

Deno.test("run: no text anywhere gives no length or disclaimer issue; no data gives no crash", () => {
  const r = run(one(section(null)));
  assertEquals(r.sections, 0);
  assertEquals(hits(r, "length"), []);
  assertEquals(run(book({ chapters: [] })).items, []);
  assertEquals(Q.run(null).sections, 0);
  assertEquals(Q.run({ data: null }).items, []);
});

Deno.test("steps: a pause between groups, then the same result as run", () => {
  const qc = BOOKS.messy();
  const it = Q.steps(qc);
  const seen = [];
  let s = it.next();
  for (; !s.done; s = it.next()) seen.push(s.value.group);
  assertEquals(seen, [0, 1, 2, 3, 4, 5, 7]);
  assertEquals(s.value, Q.run(qc));
});

const links = (n) => Array.from({ length: n }, (_, i) => `See https://example.com/p${i} here.`).join(" ");
const drafts = (n) => Array.from({ length: n }, (_, i) => section(`Plain text ${i}.`, { status: "draft" }));

Deno.test("caps: 100 per group, the rest in more; book-wide issues stay", () => {
  const r = run(book({ title: "Calm Sleep", format: { style: "classic", parts: { copyright: false } }, chapters: [chapter("Paths", [section(links(150))])] }));
  const g7 = r.items.filter((x) => x.g === 7);
  assertEquals(g7.length, 100);
  assertEquals(r.more, { 7: 52 });
  assertEquals(g7.slice(0, 2).map((x) => x.rule).sort(), ["disclaimer", "length"]);
});

Deno.test("caps: one rule never fills a group; 400 in all, and every group keeps a share", () => {
  const notFinal = drafts(150);
  notFinal[149] = section("A piece that stops", { status: "draft" });
  const r = run(book({ title: "Calm Sleep", format: { style: "classic", parts: { copyright: false } }, chapters: [chapter("Paths", notFinal)] }));
  assert(hits(r, "cut_off").length === 1);
  assert(hits(r, "not_final").length <= 100);
  // Six full groups: more than 400 issues.
  const verify = (n) => Array.from({ length: n }, (_, i) => `A claim with word${i}. [Verify: no source]`).join(" ");
  const pointers = (n) => Array.from({ length: n }, (_, i) => `Look at section ${i + 1} today.`).join(" ");
  const repeat = (n) => Array.from({ length: n }, (_, i) => `The word${i} line of this long sentence stays exactly the same.`).join(" ");
  const consistency = (n) => Array.from({ length: n }, (_, i) => `Good wo${"abcdefghij"[i % 10]}${"klmnopqrst"[(i / 10) | 0]}rd and good wo-${"abcdefghij"[i % 10]}${"klmnopqrst"[(i / 10) | 0]}rd.`).join(" ");
  const secs = [...drafts(110), section(verify(110)), section(pointers(110)), section(repeat(110)), section(`A different first line. ${repeat(110)}`), section(consistency(110)), section(links(110))];
  const full = run(book({ title: "Calm Sleep", format: { style: "classic", parts: { copyright: false } }, chapters: [chapter("Paths", secs)] }));
  assertEquals(full.items.length, 400);
  const counts = {};
  for (const x of full.items) counts[x.g] = (counts[x.g] || 0) + 1;
  for (const g of Q.GROUPS) assert(counts[g] >= 60, `group ${g}: ${counts[g]}`);
  assertEquals(full.items.filter((x) => x.g === 7).map((x) => x.rule).slice(0, 2).sort(), ["disclaimer", "length"]);
  for (const g of Q.GROUPS) assert(full.more[g] > 0, `more ${g}`);
  assertEquals(Q.verdict(Q.results(full), { dismissed: [] }).open, full.items.length + Object.values(full.more).reduce((a, b) => a + b, 0));
});

Deno.test("caps: a dismissed issue never takes an open issue's place, and is never counted in more", () => {
  const s = section(links(130));
  const first = run(one(s));
  const dismissed = hits(first, "web_link").map((x) => ({ rule: x.rule, issue_key: x.key }));
  assertEquals(dismissed.length, 99);   // the length issue takes the 100th place
  const again = run(book({ chapters: [chapter("Paths", [s])], dismissed }));
  const off = new Set(dismissed.map((d) => d.issue_key));
  const open = hits(again, "web_link").filter((x) => !off.has(x.key));
  assertEquals(open.length, 31);
  assertEquals(again.more, {});
  assertEquals(hits(again, "web_link").length, 99);
  assertEquals(Q.verdict(Q.results(again), { dismissed }).open, 31 + 1);
});

/** Five full groups, each quote 300 three-byte characters: over the size check until fit() cuts them. */
const heavyBook = () => {
  const w = "語".repeat(40);
  const words = (i) => Array.from({ length: 8 }, (_, j) => `${w}${i}${j}`).join(" ");
  const secs = Array.from({ length: 110 }, (_, i) => {
    const long = "語".repeat(290) + i;
    return section(`${long}. [Verify: no source]\n\n${long} the next chapter.\n\n${words(i)}.\n\nSee https://example.com/${long} here.\n\n${long} and no end`);
  });
  return book({ chapters: [chapter("Paths", [...secs, ...secs.slice(0, 110).map((s) => section(s.version.content))])] });
};

Deno.test("size: heavy quotes stay under 0028's size check, and nothing is lost from the counts", () => {
  const r = run(heavyBook());
  const bytes = new TextEncoder().encode(JSON.stringify(Q.results(r))).length;
  assert(bytes <= Q.CAPS.bytes, `${bytes} bytes`);
  assertEquals(r.items.length, 400);
  assert(r.items.every((x) => [...x.quote].length <= 120), "quotes were cut");
  assert(r.items.some((x) => x.quote.length > 0));
  assert(Object.values(r.more).reduce((a, b) => a + b, 0) > 0);
});

/* ── Verdict ── */

Deno.test("verdict: 0 is Ready for Format; else with N warnings; 1 warning", () => {
  assertEquals(Q.verdict({ items: [], more: {} }, {}), { open: 0, marked: 0, ready: true, title: "Ready for Format" });
  const full = run(one(section("Plain text here.", { status: "draft" }), section("More plain text here.", { status: "draft" })));
  const r = { items: hits(full, "not_final"), more: {} };
  assertEquals(Q.verdict(r, {}).title, "Ready for Format, with 2 warnings");
  assertEquals(Q.verdict(full, {}).open, 3);   // and the length issue
  const x = r.items[0];
  const v = Q.verdict(r, { dismissed: [{ rule: x.rule, issue_key: x.key }] });
  assertEquals(v, { open: 1, marked: 1, ready: false, title: "Ready for Format, with 1 warning" });
  // All marked as OK: ready, with the count for the line under it.
  assertEquals(Q.verdict(r, { dismissed: r.items.map((y) => ({ rule: y.rule, issue_key: y.key })) }), { open: 0, marked: 2, ready: true, title: "Ready for Format" });
  // One key in two places is one mark.
  const twice = run(one(section(`${LONG}. Rest.`), section(`Go. ${LONG}.`)));
  const same = { items: hits(twice, "same_sentence"), more: {} };
  assertEquals(Q.verdict(same, { dismissed: [{ rule: "same_sentence", issue_key: same.items[0].key }] }), { open: 0, marked: 1, ready: true, title: "Ready for Format" });
  // A dismissal of the same key under another rule does not match.
  assertEquals(Q.verdict(r, { dismissed: [{ rule: "needs_review", issue_key: x.key }] }).open, 2);
});

Deno.test("verdict: issues past the caps stay open", () => {
  assertEquals(Q.verdict({ items: [], more: { 7: 12, 1: 3 } }, {}).open, 15);
  assertEquals(Q.verdict({ items: [], more: { 7: 12 } }, {}).ready, false);
});

Deno.test("verdict: a drift counts while its check is current and until it is marked as OK", () => {
  const K = globalThis.kdpQcPromiseKey;
  const c = chapter("Paths", [section("Plain text here.")]);
  const qc = book({ chapters: [c], positioning: { locked_at: "2026-10-01T09:00:00+00:00" } });
  const key = K.ofChapter(qc.data.chapters[0], qc.positioning);
  const row = { chapter_id: c.id, verdict: "drifts", inputs_key: key };
  const res = { items: [], more: {} };
  assertEquals(Q.verdict(res, { ...qc, promise: [row] }).open, 1);
  assertEquals(Q.verdict(res, { ...qc, promise: [{ ...row, verdict: "keeps" }] }).open, 0);
  assertEquals(Q.verdict(res, { ...qc, promise: [{ ...row, inputs_key: "0".repeat(16) }] }).open, 0);
  assertEquals(Q.verdict(res, { ...qc, promise: [{ ...row, chapter_id: "gone" }] }).open, 0);
  assertEquals(Q.driftKey(row), `${c.id}|${key}`);
  const marked = Q.verdict(res, { ...qc, promise: [row], dismissed: [{ rule: "promise_drift", issue_key: Q.driftKey(row) }] });
  assertEquals([marked.open, marked.marked], [0, 1]);
});

/* ── The fixture books and the timing ── */

Deno.test("fixture books: each passes the shape; the clean book is all clear", () => {
  for (const [name, make] of Object.entries(BOOKS)) {
    const r = run(make());
    assert(r.sections >= 1, name);
  }
  const clean = run(BOOKS.clean());
  assertEquals(clean.items, []);
  assertEquals(Q.verdict(clean, {}).title, "Ready for Format");
});

Deno.test("a 120,000-word book runs in under 1 s", () => {
  const qc = big(120000);
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    Q.run(qc);
    times.push(performance.now() - t0);
  }
  const r = run(qc);
  assert(r.words >= 120000, `${r.words} words`);
  const best = Math.min(...times);
  console.log(`120,000 words: ${r.words} words, ${r.sections} sections, ${times.map((t) => Math.round(t)).join(" / ")} ms`);
  assert(times[0] < 1000 && best < 1000, `${times}`);
});
