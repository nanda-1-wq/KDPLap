// deno test tests/outline-checks.test.js   (from the repo root)
// The browser files set globalThis.kdpWords and globalThis.kdpOutlineChecks; Deno runs the same code.
import { assertEquals } from "jsr:@std/assert@1";
import "../js/word-budget.js";
import "../js/outline-checks.js";

const W = globalThis.kdpWords;
const C = globalThis.kdpOutlineChecks;

// Design 20: Introduction 1,000 + 8 chapters + Conclusion 700 = 11,100 words.
const sec = (words, title = "A section") => ({ id: crypto.randomUUID(), title, word_target: words });
const ch = (title, objective, words, extra = {}) => ({ id: crypto.randomUUID(), kind: "chapter", title, objective, sections: words.map((w) => sec(w)), ...extra });
const DESIGN = () => [
  { id: "i", kind: "intro", title: null, objective: null, sections: [sec(1000, null)] },
  ch("Why Chair Yoga Works After 60", "Reader can explain why seated yoga is safe for stiff joints", [400, 350, 350]),
  ch("Setting Up: Your Chair, Space, and Safety Checks", "Reader can set up a safe spot in under 5 minutes", [350, 300, 350]),
  ch("Breathing and Posture Basics", "Reader can sit tall and breathe with each move", [400, 400, 300]),
  ch("Upper Body: Neck, Shoulders, and Arms", "Reader can do 6 upper-body moves, none overhead", [450, 450, 500]),
  ch("Lower Body: Hips, Knees, and Ankles", "Reader can do 6 lower-body moves without pain", [450, 500, 450]),
  ch("Breathing for Calm and Better Sleep", "Reader can use 3 breathing patterns before bed", [350, 350, 300]),
  ch("Your 4-Week Plan: From 5 to 15 Minutes", "Reader can follow the plan day by day", [500, 500, 500]),
  ch("Staying With It", null, [300, 300, 300]),
  { id: "c", kind: "conclusion", title: null, objective: null, sections: [sec(700, null)] },
];
const brief = (o = {}) => ({ length_range: "8-12k", target_words: null, chapter_count: 8, trim_size: "6x9", ...o });
const rows = (r) => r.rows.map((x) => `${x.ok ? "pass" : "warn"}: ${x.text}`);

Deno.test("words per page: one shared estimate, about 250 at 6 x 9 (owner, E9)", () => {
  assertEquals(W.WORDS_PER_PAGE, 250);
  assertEquals(W.pages(11_100, "6x9"), 45);      // 44.4 pages, to the nearest 5 (owner, E9)
  assertEquals(W.pages(15_000, "6x9"), 60);
  assertEquals([W.pages(8000, "6x9"), W.pages(12000, "6x9")], [30, 50]);
  assertEquals(W.pages(150_000, "6x9"), 600);
  assertEquals(W.pages(15_000, "8.5x11"), 35);   // a bigger page holds more words (34.7)
  assertEquals([W.pages(3_100, "6x9"), W.pages(3_200, "6x9")], [10, 15]);   // 12.4 and 12.8: at least 10, then nearest 5
  assertEquals(W.pages(100, "6x9"), 10);         // at least 10
});

Deno.test("word target: a range, 30K+, a custom target with 10% either side, or none", () => {
  assertEquals(W.target(brief()), { kind: "range", min: 8000, max: 12000, label: "8K to 12K" });
  assertEquals(W.target(brief({ length_range: "30k+" })), { kind: "range", min: 30000, max: null, label: "30K+" });
  assertEquals(W.target(brief({ length_range: null, target_words: 15000 })), { kind: "custom", min: 13500, max: 16500, aim: 15000, label: "15,000" });
  assertEquals(W.target(brief({ length_range: null })), null);
  assertEquals(W.target(null), null);
  assertEquals([W.within(11_100, W.target(brief())), W.within(12_001, W.target(brief())), W.within(7_999, W.target(brief()))], [true, false, false]);
  assertEquals(W.within(90_000, W.target(brief({ length_range: "30k+" }))), true);
  assertEquals(W.within(5000, null), false);
  assertEquals([W.short(8000), W.short(12500), W.short(950)], ["8K", "12.5K", "950"]);
});

Deno.test("totals: a chapter total follows its sections; the plan adds Introduction and Conclusion", () => {
  const o = DESIGN();
  assertEquals(C.chapterWords(o[1]), 1100);
  assertEquals(C.chapterWords(o[8]), 900);
  assertEquals(C.planned(o), 11_100);
  o[1].sections[0].word_target = null;   // a blank words box counts as 0
  assertEquals([C.chapterWords(o[1]), C.planned(o)], [700, 10_700]);
});

Deno.test("checks on design 20: within the target, chapter 8 has no objective", () => {
  const r = C.check(DESIGN(), brief());
  assertEquals(rows(r), [
    "pass: Within the word target",
    "warn: Chapter 8 has no objective",
    "pass: Every chapter has a title",
    "pass: Every chapter has a section",
    "pass: Every section has a word target",
    "pass: 8 chapters, as in your Brief",
  ]);
  assertEquals(r.warnings, 1);
  assertEquals(Object.values(r.byChapter).flat().map((p) => p.text), ["No objective"]);
});

Deno.test("checks: over and under the target say by how much", () => {
  const over = DESIGN();
  over[4].sections[0].word_target = 1450;   // +1,000
  assertEquals(rows(C.check(over, brief()))[0], "warn: 100 words over the target (8K to 12K)");
  const under = DESIGN();
  assertEquals(rows(C.check(under, brief({ length_range: "12-20k" })))[0], "warn: 900 words under the target (12K to 20K)");
  assertEquals(rows(C.check(DESIGN(), brief({ length_range: null, target_words: 11000 })))[0], "pass: Within the word target");
  assertEquals(rows(C.check(DESIGN(), brief({ length_range: null })))[0], "warn: No word target yet. Set the length in 01 Brief.");
});

Deno.test("checks: missing titles, empty chapters, sections with no words, chapter count", () => {
  const o = DESIGN();
  o[2].title = "  ";
  o[3].sections = [];
  o[5].sections[1].word_target = 0;
  o[6].sections[2].word_target = null;
  o[7].objective = "";
  const r = C.check(o, brief({ chapter_count: 10 }));
  assertEquals(rows(r).slice(1), [
    "warn: Chapters 7 and 8 have no objective",
    "warn: Chapter 2 has no title",
    "warn: Chapter 3 has no sections",
    "warn: 2 sections have no word target",
    "warn: 8 chapters. Your Brief says 10.",
  ]);
  assertEquals(r.byChapter[o[2].id].map((p) => p.text), ["No title"]);
  assertEquals(r.byChapter[o[3].id].map((p) => p.text), ["No sections"]);
  assertEquals(C.check(o, brief({ chapter_count: null })).rows.some((x) => x.code === "count"), false);
  const three = DESIGN();
  for (const i of [1, 2, 3]) three[i].objective = null;
  assertEquals(rows(C.check(three, brief()))[1], "warn: Chapters 1, 2, 3 and 8 have no objective");
});

Deno.test("checks: an outline with no chapters has nothing to check", () => {
  assertEquals(C.check([], brief()).rows, []);
});
