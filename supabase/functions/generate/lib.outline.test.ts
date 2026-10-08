// generate lib tests: outline_ideas (E9.1): unsourced numbers, the word target,
// the competitor contents in the prompt, and how a reply is cleaned.
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { OUTLINE_OUT, outlineCtx, TOCS } from "./test_fakes.ts";

// Known: "Adults over 60 ..." (Brief), "15-minute" (Brief), "65", "3", "2023" (a source).
const known = L.knownText(outlineCtx());
const flags = (s: string) => L.outlineUnsourced(s, known);

Deno.test("outline numbers: plain counts of book parts are not flagged (owner rule, E9)", () => {
  for (const s of [
    "Reader can do 6 upper-body moves, none overhead",
    "Your 4-Week Plan: From 5 to 15 Minutes",
    "Reader can use 4 breathing patterns before bed",
    "A 12-chapter path in 30 days",
    "7 steps to a safe chair",
    "Week 1 and 2: five gentle minutes",
    "Reader can set up a safe spot in under 5 minutes",
    "8 gentle seated stretches",
    "Two 10-minute routines a day",
  ]) assertEquals(flags(s), [], s);
});

Deno.test("outline numbers: %, money, weight and measurements are flagged", () => {
  assertEquals(flags("Why 30% of falls happen at home"), ["30"]);
  assertEquals(flags("Cut stiffness by 40 percent"), ["40"]);
  assertEquals(flags("Save $20 a month on classes"), ["20"]);
  assertEquals(flags("Lose 10 pounds in 4 weeks"), ["10"]);   // 4 weeks is a count
  assertEquals(flags("Drop 5 kg without a gym"), ["5"]);
  assertEquals(flags("Gain 2 inches of reach"), ["2"]);
  assertEquals(flags("Burn 120 calories a session"), ["120"]);
});

Deno.test("outline numbers: any number near study, research or proven is flagged, counts too", () => {
  assertEquals(flags("A study of 300 adults found 4 moves help"), ["300", "4"]);
  assertEquals(flags("Research shows 20 minutes is enough"), ["20"]);
  assertEquals(flags("Proven in 8 weeks"), ["8"]);
  assertEquals(flags("Studies show 9 poses work. Then 9 more moves."), ["9"]);   // the second sentence alone would pass
});

Deno.test("outline numbers: other numbers follow the usual rule (flag unless the Brief or Research has them)", () => {
  assertEquals(flags("Why Chair Yoga Works After 60"), []);    // 60 is in the Brief
  assertEquals(flags("Why Chair Yoga Works After 70"), ["70"]);
  assertEquals(flags("Balance work 3 days a week, as the CDC advises"), []);
  assertEquals(flags("Moving like you did at 40"), ["40"]);
  assertEquals(flags("Safe at 9 to 5 desks and 24/7 care homes"), []);   // figures of speech
});

Deno.test("outline target: a range, 30K+, a custom target, or the default", () => {
  assertEquals(L.outlineTarget({ length_range: "8-12k", target_words: null, chapter_count: 8 }), { min: 8000, max: 12000, aim: 10000, source: "range" });
  assertEquals(L.outlineTarget({ length_range: "5-8k", target_words: null, chapter_count: null }), { min: 5000, max: 8000, aim: 6500, source: "range" });
  assertEquals(L.outlineTarget({ length_range: "30k+", target_words: null, chapter_count: null }), { min: 30000, max: null, aim: 33000, source: "range" });
  assertEquals(L.outlineTarget({ length_range: null, target_words: 15000, chapter_count: null }), { min: 13500, max: 16500, aim: 15000, source: "custom" });
  assertEquals(L.outlineTarget({ length_range: null, target_words: null, chapter_count: null }), { min: 8000, max: 12000, aim: 10000, source: "default" });
  assertEquals(L.outlineTarget({ length_range: "nope", target_words: null, chapter_count: null }).source, "default");
});

Deno.test("outline prompt: competitor contents oldest first, at most 12,000 characters, a contents that does not fit is left out whole", () => {
  assertEquals(L.promptTocs(outlineCtx()).map((t) => t.toc), TOCS.map((t) => t.trim()));
  const big = (n: number, size: number) => ({ title: `Book ${n}`, toc: `${n}`.repeat(size), created_at: `2026-09-30T09:${String(n).padStart(2, "0")}:00Z` });
  const tocs = [big(1, 2000), big(2, 2000), big(3, 2000), big(4, 2000), big(5, 2000), big(6, 1500), big(7, 2000), big(8, 400), big(9, 100), { ...big(1, 1), title: "Book 10", created_at: "2026-09-30T09:59:00Z" }];
  const kept = L.promptTocs(outlineCtx({ tocs: [...tocs].reverse() })).map((t) => t.title);
  // 12,000 exactly: Book 7 (2,000) does not fit after Book 6, Book 8 and 9 do, then not even 1 more character.
  assertEquals(kept, ["Book 1", "Book 2", "Book 3", "Book 4", "Book 5", "Book 6", "Book 8", "Book 9"]);
  assertEquals(L.promptTocs(outlineCtx({ tocs: [{ title: "Blank", toc: "  ", created_at: "2026-09-30T09:00:00Z" }] })), []);
});

const ctx = outlineCtx();
const job = (per = 3, c = ctx) => ({ stage: "outline_ideas" as const, ctx: c, per, target: L.outlineTarget(c.plan), chapters: c.plan.chapter_count });
const read = (out: unknown, per = 3) => L.interpretJob(job(per), true,
  { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify(out) }] });

Deno.test("outline reply: numbering is taken off titles, but a title that starts with a number keeps it", () => {
  const out = structuredClone(OUTLINE_OUT);
  out.chapters[0].title = "Chapter 1: Why Chair Yoga Works After 60";
  out.chapters[1].title = "2. Setting Up";
  out.chapters[2].title = "15 Minutes a Day";
  out.chapters[0].sections[0].title = "1.1 What changes in our joints";
  out.chapters[0].sections[1].title = "Section 1.2: Why a chair makes yoga safer";
  const o = read(out).outline!;
  assertEquals(o.chapters.slice(0, 3).map((c) => c.title), ["Why Chair Yoga Works After 60", "Setting Up", "15 Minutes a Day"]);
  assertEquals(o.chapters[0].sections.slice(0, 2).map((s) => s.title), ["What changes in our joints", "Why a chair makes yoga safer"]);
});

Deno.test("outline reply: long text is cut at a word, dashes become commas, blank sections are dropped", () => {
  const out = structuredClone(OUTLINE_OUT);
  out.chapters[0].title = "Seated ".repeat(30).trim();
  out.chapters[0].objective = "Reader can move — gently — every day";
  out.chapters[1].sections = [{ title: " ", words: 300 }, ...out.chapters[1].sections];
  const o = read(out).outline!;
  assert(o.chapters[0].title.length <= L.OUTLINE_MAX.chapterTitle && o.chapters[0].title.endsWith("Seated"));
  assertEquals(o.chapters[0].objective, "Reader can move, gently, every day");
  assertEquals(o.chapters[1].sections.length, 3);
  assertEquals(o.chapters[1].sections[0].title, "Choosing a sturdy chair with no wheels");
});

Deno.test("outline reply: a chapter with no title or no sections fails the whole reply", () => {
  const noTitle = structuredClone(OUTLINE_OUT);
  noTitle.chapters[3].title = "";
  assertEquals(read(noTitle).code, "ai_unavailable");
  const noSections = structuredClone(OUTLINE_OUT);
  noSections.chapters[3].sections = [{ title: "", words: 400 }];
  assertEquals(read(noSections).code, "ai_unavailable");
  assertEquals(read({ nope: [] }).code, "ai_unavailable");
});

Deno.test("outline reply: section, introduction and conclusion words stay inside 0 to 10,000", () => {
  const out = structuredClone(OUTLINE_OUT);
  out.intro_words = -50;
  out.conclusion_words = "a lot";
  out.chapters[0].sections[0].words = 40_000;
  const o = read(out).outline!;
  assert(o.intro_words >= 0 && o.conclusion_words >= 0);
  assert(o.chapters.every((c) => c.sections.every((s) => s.words >= 0 && s.words <= L.OUTLINE_MAX.sectionWords)));
});
