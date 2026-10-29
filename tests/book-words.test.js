// deno test --allow-read tests/book-words.test.js   (from the repo root)
// The Books card word bar (kdpWords.bookProgress, E12 fix batch 3, item 1;
// design 01b, table 4): saved words of each section's current version,
// against the section targets, else the Brief's custom target or range (bar
// against the low end, owner Q2); a completed book is full; 0 words keeps
// today's "Target …" texts.
import { assertEquals } from "jsr:@std/assert@1";
import "../js/word-budget.js";

const W = globalThis.kdpWords;
const sec = (target, words, extra = {}) => ({ word_target: target, status: "draft", needs_review: false, current: words === null ? null : { word_count: words }, ...extra });
const book = (sections, brief = null, extra = {}) => ({ status: "in_progress", book_briefs: brief, chapters: [{ needs_review: false, sections }], ...extra });

Deno.test("section targets: words of current versions against the sum of section targets (as 06 Write)", () => {
  assertEquals(W.bookProgress(book([sec(5000, 2000), sec(5400, 2120)])), { text: "4,120 of 10,400 words", pct: 4120 / 10400 });
  // Sections in several chapters; a section with no version counts 0; null targets count 0.
  const b = { status: "in_progress", book_briefs: { target_words: 99000 }, chapters: [{ sections: [sec(1000, 300), sec(null, 100)] }, { sections: [sec(1000, null)] }, { sections: [] }, {}] };
  assertEquals(W.bookProgress(b), { text: "400 of 2,000 words", pct: 0.2 });
  // The section targets win over the Brief.
  assertEquals(W.bookProgress(book([sec(1000, 0)], { target_words: 12000 })).text, "0 of 1,000 words");
});

Deno.test("over the target: the real numbers, the bar stops at 100%", () => {
  assertEquals(W.bookProgress(book([sec(10000, 11380)])), { text: "11,380 of 10,000 words", pct: 1 });
});

Deno.test("Brief custom target: \"Target …\" with no words, \"N of …\" once a section has saved words", () => {
  assertEquals(W.bookProgress(book([], { target_words: 12000 })), { text: "Target 12,000 words", pct: 0 });
  assertEquals(W.bookProgress(book([sec(null, 350)], { target_words: 12000 })), { text: "350 of 12,000 words", pct: 350 / 12000 });
  // An embed as an array (to-one relations may come either way).
  assertEquals(W.bookProgress(book([sec(0, 600, { current: [{ word_count: 600 }] })], [{ target_words: 12000 }])).text, "600 of 12,000 words");
});

Deno.test("Brief range: the bar against the low end (owner Q2); 30k+", () => {
  assertEquals(W.bookProgress(book([], { length_range: "8-12k" })), { text: "Target 8,000 to 12,000 words", pct: 0 });
  assertEquals(W.bookProgress(book([sec(null, 2300)], { length_range: "8-12k" })), { text: "2,300 of 8,000 to 12,000 words", pct: 2300 / 8000 });
  assertEquals(W.bookProgress(book([sec(null, 9000)], { length_range: "8-12k" })).pct, 1);
  assertEquals(W.bookProgress(book([], { length_range: "30k+" })).text, "Target 30,000+ words");
  assertEquals(W.bookProgress(book([sec(null, 2300)], { length_range: "30k+" })).text, "2,300 of 30,000+ words");
});

Deno.test("no target anywhere: the words alone, an empty bar", () => {
  assertEquals(W.bookProgress(book([])), { text: "No word target yet", pct: 0 });
  assertEquals(W.bookProgress({}), { text: "No word target yet", pct: 0 });
  assertEquals(W.bookProgress(book([sec(null, 1240)], { length_range: null, target_words: null })), { text: "1,240 words · no target yet", pct: 0 });
});

Deno.test("completed: the words and a full bar, no target", () => {
  assertEquals(W.bookProgress(book([sec(5000, 4820), sec(5000, 4820)], null, { status: "completed" })), { text: "9,640 words", pct: 1 });
  assertEquals(W.bookProgress(book([], null, { status: "completed" })), { text: "0 words", pct: 1 });
});
