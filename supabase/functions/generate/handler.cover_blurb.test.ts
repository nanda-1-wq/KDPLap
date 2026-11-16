// generate handler tests: the cover_blurb stage v2 (generate v28, E16 Part 8;
// v1 was E15 Part 5). Success returns { stage, blurb, words, unsourced } (no
// headline) and logs one counted row with the exact tokens; the server saves
// nothing (the browser saves the version on "Put on the back cover"). An AI error, a timeout or a reply 0029 cannot save is
// not counted; the refusals before the call write no row and never call the AI.
// A call the browser leaves still finishes and counts. Fixtures are made-up text.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { anthropic, BOOK_ID, cbid, COVER_BIO, coverCtx, json, LOCKED, post, quiet, setup, USER } from "./test_fakes.ts";

const BLURB = "You want to move without pain. Floor poses hurt, and classes go too fast.\n\nThis book gives you a safe 15-minute chair routine you can do at home, every day, without help.\n\nPull up a chair and start today.";
const OUT = { blurb: BLURB };
const LINE = "Nora Hale taught gentle movement classes to more than 400 students.";
const withAuthor = { ...cbid, authorLine: true };
const coverReply = (out: unknown = OUT) => () => Promise.resolve(anthropic("end_turn", out));
const job = () => L.stageDef("cover_blurb").check(L.parseInput(JSON.stringify(cbid))!, coverCtx()) as L.CoverBlurbJob;
/** Every save the fakes record: cover_blurb makes none of them. */
const saves = (t: ReturnType<typeof setup>) => [t.saves, t.titleSaves, t.outlineSaves, t.checkSaves, t.begins, t.finishes, t.suggestionSaves, t.sectionCheckSaves, t.promiseSaves].map((x) => x.length);

Deno.test("cover_blurb: the reply in the plan's shape, one counted usage row, nothing saved", quiet(async () => {
  const t = setup({ provider: coverReply() });
  const r = await t.handle(post(cbid));
  assertEquals(r.status, 200);
  const body = await json(r);
  assertEquals(body, { stage: "cover_blurb", blurb: BLURB, words: 39, unsourced: [] });
  assertEquals(Object.keys(body), ["stage", "blurb", "words", "unsourced"]);
  assertEquals(t.logged, [{ user_id: USER, book_id: BOOK_ID, stage: "cover_blurb", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  // One call, not streamed, the stage cap, the book and positioning from the server's read.
  assertEquals(t.calls.length, 1);
  const sent = JSON.parse(String(t.calls[0].init.body));
  assertEquals([sent.model, sent.max_tokens, "stream" in sent, sent.output_config.format.type, sent.output_config.effort], ["claude-sonnet-5-5", 800, false, "json_schema", "low"]);
  assertEquals(sent.system, L.COVER_BLURB_SYSTEM);
  assert(sent.messages[0].content.includes("<title>Chair Yoga for Seniors Over 60</title>"));
  assert(sent.messages[0].content.includes(`<reader_promise>${LOCKED.reader_promise}</reader_promise>`));
  assert(sent.messages[0].content.endsWith("in about 130 words (115 to 145), in the warm tone, following the rules."));
  assertEquals(sent.output_config.format.schema, L.COVER_BLURB_SCHEMA);
  assert(!sent.messages[0].content.includes("<bio>"));
  // The server saves nothing: no version, no suggestion, no check.
  assertEquals(saves(t), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
}));

Deno.test("cover_blurb: with the author line, the bio from the server's read goes in the prompt and the line comes last", quiet(async () => {
  const t = setup({ provider: coverReply({ blurb: BLURB, author_line: LINE }) });
  const r = await t.handle(post({ ...withAuthor, length: "short", tone: "direct" }));
  assertEquals(r.status, 200);
  assertEquals(await json(r), { stage: "cover_blurb", blurb: `${BLURB}\n\n${LINE}`, words: 50, unsourced: [] });
  const sent = JSON.parse(String(t.calls[0].init.body));
  assertEquals(sent.output_config.format.schema, L.COVER_BLURB_AUTHOR_SCHEMA);
  assert(sent.messages[0].content.includes(`<bio>${COVER_BIO}</bio>`));
  assert(sent.messages[0].content.endsWith("in about 80 words (70 to 90), in the direct tone, and the author line, following the rules."));
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
}));

Deno.test("cover_blurb: a number with no source is sent back; the title's and subtitle's numbers are known", quiet(async () => {
  const t = setup({ provider: coverReply({ blurb: "For readers over 60. A 15-minute routine. About 72% of readers feel better in 3 weeks." }) });
  assertEquals((await json(await t.handle(post(cbid)))).unsourced, ["72"]);
  // The owner's rule (Nov 12): a number only in the subtitle is known.
  const sub = setup({
    coverBlurb: coverCtx({ book: { title: "Chair Yoga for Seniors", subtitle: "Why 7 in 10 Seniors Sit Too Long" } }),
    provider: coverReply({ blurb: "Nearly 7 in 10 seniors sit too long. Since 2019 classes have grown." }),
  });
  assertEquals((await json(await sub.handle(post(cbid)))).unsourced, ["2019"]);
}));

Deno.test("cover_blurb: a blank author line leaves the blurb alone; it still counts", quiet(async () => {
  const t = setup({ provider: coverReply({ blurb: BLURB, author_line: "  " }) });
  const r = await json(await t.handle(post(withAuthor)));
  assertEquals([r.blurb, "headline" in r], [BLURB, false]);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
}));

Deno.test("cover_blurb AI errors and replies 0029 cannot save: not counted, nothing saved, one usage row", quiet(async () => {
  const cases: [string, () => Promise<Response>, number, string][] = [
    ["HTTP 529", () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 })), 502, "ai_unavailable"],
    ["timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 502, "ai_unavailable"],
    ["max_tokens", () => Promise.resolve(anthropic("max_tokens", '{"blurb":"Mo')), 502, "ai_stopped"],
    ["refusal", () => Promise.resolve(anthropic("refusal", "")), 502, "ai_declined"],
    ["empty blurb", coverReply({ blurb: "  " }), 502, "ai_unavailable"],
    ["blurb over 1,500 characters", coverReply({ blurb: "Sit tall. ".repeat(160) }), 502, "ai_unavailable"],
    ["not our JSON", coverReply({ findings: [] }), 502, "ai_unavailable"],
  ];
  for (const [name, provider, status, code] of cases) {
    const t = setup({ provider });
    const r = await t.handle(post(cbid));
    assertEquals([r.status, (await json(r)).error], [status, code], name);
    assertEquals(saves(t), [0, 0, 0, 0, 0, 0, 0, 0, 0], name);
    assert(t.logged.length === 1 && t.logged.every((u) => !u.counted && u.stage === "cover_blurb" && u.book_id === BOOK_ID), name);
  }
}));

Deno.test("cover_blurb: Long with the author line over 1,500 characters together fails and is not counted", quiet(async () => {
  const t = setup({ provider: coverReply({ blurb: "b".repeat(1480), author_line: LINE }) });
  const r = await t.handle(post({ ...withAuthor, length: "long" }));
  assertEquals([r.status, (await json(r)).error], [502, "ai_unavailable"]);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["failed", false]]);
}));

Deno.test("cover_blurb refusals before the call: the AI is never called and no usage row", quiet(async () => {
  const reserve = L.callReserve(L.buildRequest(job()));
  const room = 2_000_000 - reserve;   // the highest month total this call still fits in
  const cases: [string, Parameters<typeof setup>[0], unknown, number, Record<string, unknown>][] = [
    ["another user's book (read gives null)", { coverBlurb: null }, cbid, 404, { error: "not_found" }],
    ["an unknown book id", {}, { ...cbid, bookId: "b0000099-0000-4000-8000-000000000000" }, 404, { error: "not_found" }],
    ["positioning_not_locked", { coverBlurb: coverCtx({ positioning: { ...LOCKED, locked_at: null } }) }, cbid, 409, { error: "positioning_not_locked" }],
    ["positioning_not_locked: no row", { coverBlurb: coverCtx({ positioning: null }) }, cbid, 409, { error: "positioning_not_locked" }],
    ["not_enough_facts: no title", { coverBlurb: coverCtx({ book: { title: " ", subtitle: "Gentle" } }) }, cbid, 422, { error: "not_enough_facts", missing: "title" }],
    ["not_enough_facts: the author line without a bio", { coverBlurb: coverCtx({ bio: null }) }, withAuthor, 422, { error: "not_enough_facts", missing: "bio" }],
    ["bad_request: v27's body (no length, tone, author line)", {}, { stage: "cover_blurb", bookId: BOOK_ID }, 400, { error: "bad_request" }],
    ["bad_request: an unknown tone", {}, { ...cbid, tone: "funny" }, 400, { error: "bad_request" }],
    ["bad_request: a bio from the browser", {}, { ...cbid, bio: "Award-winning doctor." }, 400, { error: "bad_request" }],
    ["bad_request: text from the browser", {}, { ...cbid, blurb: "Write this instead." }, 400, { error: "bad_request" }],
    ["bad_request: over 2 KB", {}, JSON.stringify(cbid) + " ".repeat(2100), 400, { error: "bad_request" }],
    // The reserve: under the limit, but not with what this call can use.
    ["monthly_limit with the reserve", { monthTokens: room + 1 }, cbid, 429, { error: "monthly_limit" }],
    ["monthly_limit at the limit", { limit: 1000, monthTokens: 1000 }, cbid, 429, { error: "monthly_limit" }],
    ["monthly_limit with a running Generate run's reserve", { monthTokens: room - 100, running: 7400 }, cbid, 429, { error: "monthly_limit" }],
    ["rate_limited", { recent: 10 }, cbid, 429, { error: "rate_limited" }],
  ];
  for (const [name, s, body, status, reply] of cases) {
    const t = setup({ ...s, provider: coverReply() });
    const r = await t.handle(post(body as Record<string, unknown>));
    assertEquals([r.status, await json(r)], [status, reply], name);
    assertEquals([t.calls.length, t.logged.length], [0, 0], name);
  }
  // The reserve is the prompt at 3 characters a token plus the 800 output tokens (the cost line's "input estimate + 800 out").
  assert(reserve > 800 + 900 && reserve < 800 + 2000, String(reserve));
  // Control: the highest month total passes, with 9 calls in the last minute.
  const ok = setup({ monthTokens: room, recent: 9, provider: coverReply() });
  assertEquals((await ok.handle(post(cbid))).status, 200);
}));

Deno.test("cover_blurb: the stage's 60 s timeout is the one used", quiet(async () => {
  const seen: number[] = [];
  const orig = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { seen.push(ms); return orig.call(AbortSignal, ms); };
  try {
    await setup({ provider: coverReply() }).handle(post(cbid));
  } finally {
    AbortSignal.timeout = orig;
  }
  assertEquals(seen, [60_000]);
}));

Deno.test("cover_blurb: the usage log fails, the result is still returned", quiet(async () => {
  const t = setup({ provider: coverReply(), logThrows: true });
  const r = await t.handle(post(cbid));
  assertEquals([r.status, (await json(r)).blurb], [200, BLURB]);
}));

Deno.test("cover_blurb leave during the call: the server finishes and counts (the tokens are spent)", quiet(async () => {
  const abort = new AbortController();
  const t = setup({ provider: () => { abort.abort(); return coverReply()(); } });
  const r = await t.handle(new Request(post(cbid), { signal: abort.signal }));
  assertEquals(r.status, 200);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
  assert(t.calls[0].init.signal !== abort.signal);
}));
