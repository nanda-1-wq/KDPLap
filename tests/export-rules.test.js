// deno test --allow-read tests/export-rules.test.js   (from the repo root)
// The Export dialog's rules (js/export-rules.js, E11, design 24b): the include
// rule (the same cases as supabase/tests/sql/t_export_include.sql, so the
// dialog and export_badges agree), counts and notes, run freshness, the AI
// note, Verify marks (counted and removed, the old v15 places too), the
// copyright text and the file name.
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";

const R = globalThis.kdpExportRules;
const FX = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/export-include.json", import.meta.url)));
const NOW = "2026-10-25T12:00:00.000Z";
const ago = (s) => new Date(Date.parse(NOW) - s * 1000).toISOString();

/** export_json's shape from a fixture book: sorted by position, version id = the section key. */
function dataOf(book) {
  const byPos = (a, b) => a.position - b.position;
  return {
    book: { id: "b", title: "Chair Yoga", subtitle: null, pen_name: "Nora Hale", bio: "Nora teaches.", trim: "6x9" },
    known: { brief: {}, research: { sources: [], competitors: [], insights: null } },
    now: NOW,
    chapters: [...FX.books[book]].sort(byPos).map((c) => ({
      id: c.key, kind: c.kind, position: c.position, title: c.key, objective: null, needs_review: false,
      sections: [...c.sections].sort(byPos).map((s) => ({
        id: s.key, position: s.position, title: s.key, status: s.status, needs_review: false, ai: "none", unsaved: false,
        version: s.content === null ? null : { id: s.key, version_no: 1, content: s.content, partial: !!s.partial, word_count: 1 },
        run: s.running ? { started_at: ago(30), heartbeat_at: ago(5) } : null
      }))
    }))
  };
}

for (const c of FX.cases) {
  Deno.test(`include rule (shared with export_badges): ${c.name}`, () => {
    const m = R.model(dataOf(c.book), { include: c.include, parts: c.parts, format: "docx" });
    assertEquals(R.versionIds(m), c.expected);
  });
}

Deno.test("the fixture covers partial, running, blank, no-text, nbsp, Final only, parts off and order", () => {
  const all = FX.books.main.flatMap((ch) => ch.sections);
  assert(all.some((s) => s.partial) && all.some((s) => s.running) && all.some((s) => s.content === null));
  assert(all.some((s) => s.content !== null && /^[ \t\n\r]+$/.test(s.content)), "a blank version");
  assert(all.some((s) => s.content === " "), "a no-break space is text (as text_is_blank)");
  assert(FX.cases.some((c) => c.include === "final") && FX.cases.some((c) => !c.parts.intro) && FX.cases.some((c) => c.book === "shuffled"));
});

Deno.test("isBlank = text_is_blank (0019): spaces, tabs and line breaks only", () => {
  for (const t of [null, undefined, "", " ", "\n\t\r", " \f\v "]) assertEquals(R.isBlank(t), true, JSON.stringify(t));
  for (const t of ["a", " ", " ", " . "]) assertEquals(R.isBlank(t), false, JSON.stringify(t));
});

/* ── A richer book for the counts and notes ── */

const v = (id, content, extra = {}) => ({ id, version_no: 3, content, partial: false, word_count: 1, ...extra });
const BOOK = {
  book: { id: "b", title: "Chair Yoga for Seniors Over 60", subtitle: "Gentle moves", pen_name: "Nora Hale", bio: "Nora teaches chair yoga.", trim: "6x9" },
  known: { brief: { topic_text: "Chair yoga" }, research: { sources: [{ kind: "source", body: "A study of 300 adults.", citation: "Smith" }], competitors: [], insights: null } },
  now: NOW,
  chapters: [
    { id: "ci", kind: "intro", position: 1, title: "Introduction", needs_review: false, sections: [
      { id: "si", position: 1, title: "Why chair yoga", status: "final", ai: "draft", version: v("vi", "Intro words here now.") }] },
    { id: "c1", kind: "chapter", position: 2, title: "Getting started", needs_review: true, sections: [
      { id: "s11", position: 1, title: "Your chair", status: "final", ai: "edits", version: v("v11", "Sit tall. [Verify: no source] Breathe out. [Verify: no source]") },
      { id: "s12", position: 2, title: "Breathing", status: "draft", ai: "none", unsaved: true, version: v("v12", "In 2019, 45 percent of adults said it helped.", { version_no: 6 }) },
      { id: "s13", position: 3, title: "Rest", status: "reviewed", ai: "none", version: v("v13", "Rest well.", { partial: true }) }] },
    { id: "c2", kind: "chapter", position: 3, title: "Seated twists", needs_review: false, sections: [
      { id: "s21", position: 1, title: "Twist one", status: "draft", ai: "none", version: null },
      { id: "s22", position: 2, title: "Twist two", status: "draft", ai: "none", version: v("v22", "Turn slowly.", { version_no: 4 }), run: { started_at: ago(40), heartbeat_at: ago(3) } }] },
    { id: "c3", kind: "chapter", position: 4, title: "Standing", needs_review: false, sections: [
      { id: "s31", position: 1, title: "With support", status: "reviewed", ai: "none", version: v("v31", "Hold the chair.") }] },
    { id: "cc", kind: "conclusion", position: 5, title: "", needs_review: false, sections: [
      { id: "sc", position: 1, title: "Keep going", status: "final", ai: "edits", version: v("vc", "The end.") }] }
  ]
};

Deno.test("model: counts by status, labels, notes, AI split", () => {
  const m = R.model(BOOK, { include: "all", format: "docx" });
  assertEquals(m.withText, 7);
  assertEquals(m.status, { final: 3, reviewed: 2, draft: 2 });
  assertEquals(m.sections.map((s) => s.label), ["Introduction", "1.1 Your chair", "1.2 Breathing", "1.3 Rest", "2.2 Twist two", "3.1 With support", "Conclusion"]);
  assertEquals(m.noText.map((s) => s.label), ["2.1 Twist one"]);
  assertEquals(m.unsaved.map((s) => [s.label, s.versionNo]), [["1.2 Breathing", 6]]);
  assertEquals(m.partial.map((s) => s.label), ["1.3 Rest"]);
  assertEquals(m.running.map((s) => [s.label, s.versionNo]), [["2.2 Twist two", 4]]);
  assertEquals(m.needsReview.map((x) => x.label), ["chapter 1"]);
  assertEquals(m.ai.draft + m.ai.edits + m.ai.own, 7);
  assertEquals([m.ai.draft, m.ai.edits, m.ai.own], [1, 2, 4]);
  assertEquals(m.chapters.map((c) => [c.kind, c.fileNumber || null]), [["intro", null], ["chapter", 1], ["chapter", 2], ["chapter", 3], ["conclusion", null]]);
  assertEquals(m.empty, false);
});

Deno.test("model: Verify marks and numbers with no source", () => {
  const m = R.model(BOOK, { include: "all", format: "docx" });
  assertEquals(m.marks.total, 2);
  assertEquals(m.marks.numbers, 1, "2019 and 45 percent: one sentence with a claim number");
  assertEquals(m.marks.sections.map((x) => [x.label, x.marks, x.numbers]), [["1.1 Your chair", 2, 0], ["1.2 Breathing", 0, 1]]);
  assertEquals(m.openMarks, 3);
});

Deno.test("model: sections that end mid-sentence (E12 M9), in the file only, a note that never blocks", () => {
  assertEquals(R.model(BOOK, { include: "all", format: "docx" }).cut, []);
  const cut = structuredClone(BOOK);
  cut.chapters[1].sections[2].version.content = "Rest well. Then lie down and let the";   // 1.3, partial and cut
  cut.chapters[3].sections[0].version.content = "Hold the chair. Then do this:";           // 3.1, a colon is not an end
  cut.chapters[4].sections[0].version.content = "The end. [Verify: no source]";            // a mark after a full sentence is complete
  cut.chapters[2].sections[0].version = v("v21", "Twist and");                              // 2.1 is Draft, still in the file
  const m = R.model(cut, { include: "all", format: "docx" });
  assertEquals(m.cut.map((x) => x.label), ["1.3 Rest", "2.1 Twist one", "3.1 With support"]);
  assertEquals(m.partial.map((x) => x.label), ["1.3 Rest"]);   // the partial note stays
  // Final only: the cut sections that are not Final are not in the file, so no note.
  assertEquals(R.model(cut, { include: "final", format: "docx" }).cut, []);
});

Deno.test("model: Final only leaves out the rest, and chapters with no Final section", () => {
  const m = R.model(BOOK, { include: "final", format: "docx" });
  assertEquals(R.versionIds(m), ["vi", "v11", "vc"]);
  assertEquals(m.notFinal.map((x) => [x.label, x.status]), [["1.2 Breathing", "draft"], ["1.3 Rest", "reviewed"], ["2.2 Twist two", "draft"], ["3.1 With support", "reviewed"]]);
  assertEquals(m.droppedChapters.map((c) => c.label), ["Chapter 2", "Chapter 3"]);
  assertEquals(m.chapters.filter((c) => c.kind === "chapter").map((c) => c.fileNumber), [1]);
  assertEquals(m.running, [], "a running Draft section is not in a Final-only file");
});

Deno.test("model: an empty book, and a book with nothing Final", () => {
  const empty = { ...BOOK, chapters: BOOK.chapters.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, version: null })) })) };
  assertEquals(R.model(empty, { include: "all" }).empty, true);
  const drafts = { ...BOOK, chapters: BOOK.chapters.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, status: "draft" })) })) };
  const m = R.model(drafts, { include: "final" });
  assertEquals([m.empty, m.withText], [true, 7]);
});

Deno.test("run freshness: the 0020 rule with the server's now", () => {
  const at = (hb, st) => ({ ...BOOK, chapters: [{ id: "c", kind: "chapter", position: 1, title: "C", sections: [
    { id: "s", position: 1, title: "S", status: "draft", version: v("x", "Text."), run: { heartbeat_at: ago(hb), started_at: ago(st) } }] }] });
  assertEquals(R.model(at(19, 100), {}).running.length, 1);
  assertEquals(R.model(at(21, 100), {}).running.length, 0, "heartbeat older than 20 s");
  assertEquals(R.model(at(5, 161), {}).running.length, 0, "started more than 160 s ago");
});

Deno.test("defaults and available parts", () => {
  assertEquals(R.defaults(BOOK), { format: "docx", include: "all", parts: { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: false } });
  assertEquals(R.available(BOOK), { intro: true, conclusion: true, about: true });
  const bare = { ...BOOK, book: { ...BOOK.book, bio: "  " }, chapters: BOOK.chapters.filter((c) => c.kind === "chapter") };
  assertEquals(R.available(bare), { intro: false, conclusion: false, about: false });
  assertEquals(R.defaults(bare).parts.intro, false);
});

Deno.test("strip: every mark goes, the sentences stay (the old v15 places too)", () => {
  assertEquals(R.strip("Sit tall. [Verify: no source] Breathe."), "Sit tall. Breathe.");
  assertEquals(R.strip("It has 45 percent. [Verify: no source]"), "It has 45 percent.");
  // Book 4e2dde85, v15: after a list number, mid-word, before a number.
  assertEquals(R.strip("1. [Verify: no source] Sit tall."), "1. Sit tall.");
  assertEquals(R.strip("At 2 p. [Verify: no source]m. we rest."), "At 2 p.m. we rest.");
  assertEquals(R.strip("See section 3. [Verify: no source]1 again."), "See section 3.1 again.");
  assertEquals(R.strip("## Head [Verify: no source]\n\n- Item [Verify: no source]"), "## Head\n\n- Item");
  assertEquals(R.markCount("a [Verify: no source] b [Verify: no source]m."), 2);
  assertEquals(R.strip("No marks here.\n\nTwo  spaces stay  as one."), "No marks here.\n\nTwo spaces stay as one.");
});

Deno.test("strip: source labels go too (E12 fix batch 2, item 9)", () => {
  assertEquals(R.strip("You can always do more than the minimum. [S3]"), "You can always do more than the minimum.");
  assertEquals(R.strip("Fogg [S2, S4] says start tiny. [Verify: no source]\n\n- [S1] An item"), "Fogg says start tiny.\n\n- An item");
  assertEquals(R.strip("Rest for [2] minutes."), "Rest for [2] minutes.");
});

Deno.test("model: the same sentence in more than one section (E12 fix batch 2, item 11 A), in the file only, never blocking", () => {
  assertEquals(R.model(BOOK, { include: "all", format: "docx" }).repeats, []);
  const s1 = "Starting is often the hardest part, and you can always do more than the minimum.";
  const s2 = "Write one flashcard before you open your phone each morning.";
  const rep = structuredClone(BOOK);
  rep.chapters[0].sections[0].version.content = `Welcome. ${s1}`;                  // Introduction, Final
  rep.chapters[1].sections[0].version.content = `${s1} [Verify: no source] ${s2}`; // 1.1, Final
  rep.chapters[3].sections[0].version.content = `${s2}\n\n- ${s1}`;               // 3.1, Reviewed
  rep.chapters[4].sections[0].version.content = `${s1.toLowerCase()}`;            // Conclusion, Final
  const m = R.model(rep, { include: "all", format: "docx" });
  assertEquals(m.repeats.map((r) => [r.text, r.items.map((x) => x.label)]), [
    [s1, ["Introduction", "1.1 Your chair", "3.1 With support", "Conclusion"]],
    [s2, ["1.1 Your chair", "3.1 With support"]],
  ]);
  // Final only: 3.1 is not in the file, so s2 is in one section only.
  assertEquals(R.model(rep, { include: "final", format: "docx" }).repeats.map((r) => r.items.length), [3]);
});

Deno.test("copyright: the owner's text, year and pen name", () => {
  assertEquals(R.copyright("Nora Hale", 2026),
    "Copyright © 2026 Nora Hale. All rights reserved. No part of this book may be reproduced without written permission from the author, except for short quotes in reviews. The information in this book is for general education only. It is not medical, legal or financial advice. Talk to a qualified professional before you act on it.");
  assert(R.copyright("", 2027).startsWith("Copyright © 2027. All rights reserved."));
});

Deno.test("file name: a slug of the title", () => {
  assertEquals(R.fileName("Chair Yoga for Seniors Over 60", "docx"), "chair-yoga-for-seniors-over-60.docx");
  assertEquals(R.fileName("Café: Déjà vu!", "md"), "cafe-deja-vu.md");
  assertEquals(R.fileName("", "docx"), "book.docx");
  assert(R.fileName("x".repeat(200), "docx").length <= 85);
});
