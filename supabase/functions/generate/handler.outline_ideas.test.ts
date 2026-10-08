// generate handler tests: the outline_ideas stage (E9.1).
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { BOOK_ID, json, OUTLINE_OUT, oid, outlineCtx, outlineReply, posRow, post, quiet, setup, USER } from "./test_fakes.ts";

const words = (o: { intro_words: number; conclusion_words: number; chapters: { sections: { words: number }[] }[] }) =>
  o.intro_words + o.conclusion_words + o.chapters.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.words, 0), 0);
const content = (calls: { init: RequestInit }[]) => JSON.parse(String(calls[0].init.body)).messages[0].content as string;

Deno.test("outline_ideas success: saved outline returned, one counted row with book_id", quiet(async () => {
  const { handle, logged, calls, outlineSaves } = setup({ provider: outlineReply() });
  const r = await handle(post(oid));
  const j = await json(r);
  assertEquals(r.status, 200);
  assertEquals(j.stage, "outline_ideas");
  assertEquals(j.chapters.length, 10);   // Introduction + 8 + Conclusion
  assertEquals([j.chapters[0].kind, j.chapters[9].kind], ["intro", "conclusion"]);
  assertEquals(j.chapters[1].title, "Why Chair Yoga Works After 60");
  assertEquals(j.rescaled, false);
  assertEquals(j.target, { min: 8000, max: 12000, aim: 10000, source: "range" });
  assertEquals(j.aiPickedChapters, false);
  assertEquals(outlineSaves.length, 1);
  assertEquals(words(outlineSaves[0]), 11_100);   // design 20, inside 8K to 12K: kept as the AI wrote it
  assertEquals(outlineSaves[0].chapters[7].objective, null);   // "" from the AI: no objective (the code check flags it)
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "outline_ideas", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  const c = content(calls);
  assert(c.includes("Chapter 7: Seated Cat and Cow for the Spine"), "competitor contents are in the prompt");
  assert(c.includes("<book_title>Chair Yoga for Seniors Over 60</book_title>"));
  assert(c.includes("<locked_positioning>"));
  assert(c.includes("<gaps>\n<item>A plan that gets harder each week</item>"));
  assert(c.includes("Gentle &lt;Chair&gt; Yoga"), "data is escaped");
  assert(c.endsWith("Write 8 chapters with 3 sections each. Aim for about 10,000 words in all, with the Introduction and the Conclusion. Follow the rules."));
}));

Deno.test("outline_ideas: positioning not locked is 409, no call, no row", quiet(async () => {
  const { handle, calls, logged } = setup({ outline: outlineCtx({ positioning: posRow() }) });
  const r = await handle(post(oid));
  assertEquals([r.status, (await json(r)).error, calls.length, logged.length], [409, "positioning_not_locked", 0, 0]);
}));

Deno.test("outline_ideas: a book with writing is 409 has_writing, no call", quiet(async () => {
  const { handle, calls, logged } = setup({ outline: outlineCtx({ hasWriting: true }) });
  const r = await handle(post(oid));
  assertEquals([r.status, (await json(r)).error, calls.length, logged.length], [409, "has_writing", 0, 0]);
}));

Deno.test("outline_ideas: no topic is 422, no call", quiet(async () => {
  const ctx = outlineCtx();
  ctx.brief = { ...ctx.brief, topic_text: " " };
  const { handle, calls } = setup({ outline: ctx });
  const r = await handle(post(oid));
  assertEquals([r.status, (await json(r)).error, calls.length], [422, "not_enough_facts", 0]);
}));

Deno.test("outline_ideas: someone else's book is 404, no call", quiet(async () => {
  const { handle, calls } = setup({ outline: null });
  const r = await handle(post(oid));
  assertEquals([r.status, calls.length], [404, 0]);
}));

Deno.test("outline_ideas: sectionsPerChapter must be a whole number from 1 to 6", quiet(async () => {
  for (const bad of [0, 7, 2.5, "3", null]) {
    const { handle, calls } = setup({ provider: outlineReply() });
    const r = await handle(post({ ...oid, sectionsPerChapter: bad }));
    assertEquals([r.status, (await json(r)).error, calls.length], [400, "bad_request", 0], String(bad));
  }
  const { handle } = setup({ provider: outlineReply() });
  const { sectionsPerChapter: _, ...noCount } = oid;
  assertEquals((await handle(post(noCount))).status, 400);
  const one = setup({ provider: outlineReply() });
  await one.handle(post({ ...oid, sectionsPerChapter: 1 }));
  assert(content(one.calls).includes("Write 8 chapters with 1 section each."));
  assertEquals(one.outlineSaves[0].chapters.every((c) => c.sections.length === 1), true, "extra sections are cut");
}));

Deno.test("outline_ideas: the wrong number of chapters fails, logged, not counted, nothing saved", quiet(async () => {
  const { handle, logged, outlineSaves } = setup({ provider: outlineReply({ ...OUTLINE_OUT, chapters: OUTLINE_OUT.chapters.slice(0, 7) }) });
  const r = await handle(post(oid));
  assertEquals([r.status, (await json(r)).error], [502, "ai_unavailable"]);
  assertEquals([logged[0].status, logged[0].counted, outlineSaves.length], ["failed", false, 0]);
}));

Deno.test("outline_ideas: no chapter count in the Brief lets the AI pick 6 to 10", quiet(async () => {
  const { handle, calls } = setup({ outline: outlineCtx({ plan: { length_range: null, target_words: null, chapter_count: null } }), provider: outlineReply() });
  const r = await handle(post(oid));
  const j = await json(r);
  assertEquals(r.status, 200);
  assertEquals([j.aiPickedChapters, j.target], [true, { min: 8000, max: 12000, aim: 10000, source: "default" }]);
  assert(content(calls).endsWith("Choose 6 to 10 chapters with 3 sections each. Aim for about 10,000 words in all, with the Introduction and the Conclusion. Follow the rules."));
}));

Deno.test("outline_ideas: words far from the target are scaled to it", quiet(async () => {
  const small = { ...OUTLINE_OUT, intro_words: 100, conclusion_words: 100, chapters: OUTLINE_OUT.chapters.map((c: { sections: { words: number }[] }) => ({ ...c, sections: c.sections.map((s) => ({ ...s, words: 100 })) })) };
  const { handle, outlineSaves } = setup({ outline: outlineCtx({ plan: { length_range: null, target_words: 15000, chapter_count: 8 } }), provider: outlineReply(small) });
  const j = await json(await handle(post(oid)));
  assertEquals(j.rescaled, true);
  assertEquals(j.target, { min: 13500, max: 16500, aim: 15000, source: "custom" });
  const total = words(outlineSaves[0]);
  assert(total >= 13_500 && total <= 16_500, `total ${total}`);
  assert(outlineSaves[0].chapters.every((c) => c.sections.every((s) => s.words % 50 === 0)), "rounded to 50 words");
}));

Deno.test("outline_ideas: unsourced numbers are marked per chapter, plain counts are not", quiet(async () => {
  const out = structuredClone(OUTLINE_OUT);
  out.chapters[0].objective = "Reader can lose 10 pounds in 4 weeks";
  out.chapters[1].sections[0].title = "Why 30% of falls happen at home";
  const { handle, outlineSaves } = setup({ provider: outlineReply(out) });
  await handle(post(oid));
  assertEquals(outlineSaves[0].chapters.map((c) => c.unsourced), [["10"], ["30"], [], [], [], [], [], []]);
}));

Deno.test("outline_ideas: a save refused for writing is 409, logged, not counted", quiet(async () => {
  for (const [code, status, want] of [["has_writing", 409, "has_writing"], ["positioning_not_locked", 409, "positioning_not_locked"], ["22023", 500, "server_error"]] as const) {
    const { handle, logged } = setup({ provider: outlineReply(), outlineSaveError: { code } });
    const r = await handle(post(oid));
    assertEquals([r.status, (await json(r)).error], [status, want], code);
    assertEquals([logged[0].status, logged[0].counted], ["ok", false], code);
  }
}));
