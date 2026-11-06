// generate handler tests: the promise_check stage (E14.5, plan 4 and 8.3).
// Success saves the check with the service role (one row per chapter) and logs
// one counted row with the exact tokens; a failed save, an AI error or a timeout
// is not counted; the refusals before the call write no row and never call the
// AI. Advice only: the stage never saves a version. Fixtures are made-up text.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { anthropic, BOOK_ID, CHAPTER_ID, json, LOCKED, pid, post, PROMISE_OUT, PROMISE_QUOTE, promiseCtx, promiseReply, quiet, SECTION_ID, setup, USER, V0_ID, V_ID } from "./test_fakes.ts";

const job = () => L.stageDef("promise_check").check(L.parseInput(JSON.stringify(pid))!, promiseCtx()) as L.PromiseJob;

Deno.test("promise_check drifts: the row saved (service role), one counted usage row, the reply in the plan's shape", quiet(async () => {
  const t = setup({ provider: promiseReply() });
  const r = await t.handle(post(pid));
  assertEquals(r.status, 200);
  const j = job();
  const body = await json(r);
  assertEquals(body, {
    stage: "promise_check", chapter_id: CHAPTER_ID, verdict: "drifts", reason: PROMISE_OUT.reason, quote: PROMISE_QUOTE, section_id: SECTION_ID,
    unsourced: [], words: j.words, versions: [V0_ID, V_ID], inputs_key: j.key, checked_at: "2026-09-29T12:00:00+00:00",
  });
  assertEquals(Object.keys(body), ["stage", "chapter_id", "verdict", "reason", "quote", "section_id", "unsourced", "words", "versions", "checked_at", "inputs_key"]);
  assertEquals(t.promiseSaves, [{
    chapterId: CHAPTER_ID, bookId: BOOK_ID, userId: USER, verdict: "drifts", reason: PROMISE_OUT.reason, quote: PROMISE_QUOTE, sectionId: SECTION_ID,
    unsourced: [], versions: [V0_ID, V_ID], words: j.words, inputsKey: j.key, checkedAt: "2026-09-29T12:00:00.000Z",
  }]);
  assertEquals(t.logged, [{ user_id: USER, book_id: BOOK_ID, stage: "promise_check", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  // One call, not streamed, the stage cap, the text from the server's read, the stage's timeout.
  assertEquals(t.calls.length, 1);
  const sent = JSON.parse(String(t.calls[0].init.body));
  assertEquals([sent.max_tokens, "stream" in sent, sent.output_config.format.type, sent.output_config.effort], [500, false, "json_schema", "low"]);
  assert(sent.messages[0].content.includes('<section number="4.2" title="Shoulder rolls, both ways">\nShoulder rolls ease the stiffness'));
  // Advice only: no version, no suggestion, no section check.
  assertEquals([t.finishes.length, t.begins.length, t.suggestionSaves.length, t.sectionCheckSaves.length], [0, 0, 0, 0]);
}));

Deno.test("promise_check keeps: saved with no quote and no section, counted", quiet(async () => {
  const t = setup({ provider: promiseReply({ verdict: "keeps", reason: "Every move stays seated and safe.", quote: PROMISE_QUOTE }) });
  const r = await json(await t.handle(post(pid)));
  assertEquals([r.verdict, r.quote, r.section_id], ["keeps", "", null]);
  assertEquals([t.promiseSaves[0].quote, t.promiseSaves[0].sectionId], ["", null]);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
}));

Deno.test("promise_check: a number with no source is saved and sent back", quiet(async () => {
  const t = setup({ provider: promiseReply({ ...PROMISE_OUT, reason: "It promises 72% will lose weight, a bigger promise than the book makes." }) });
  assertEquals((await json(await t.handle(post(pid)))).unsourced, ["72"]);
  assertEquals(t.promiseSaves[0].unsourced, ["72"]);
}));

Deno.test("promise_check: a quote the text does not have is saved with no spot, the verdict stays", quiet(async () => {
  const t = setup({ provider: promiseReply({ ...PROMISE_OUT, quote: "Lose ten pounds in a week." }) });
  const r = await json(await t.handle(post(pid)));
  assertEquals([r.verdict, r.quote, r.section_id], ["drifts", "", null]);
  assertEquals(t.logged.map((u) => u.counted), [true]);
}));

Deno.test("promise_check save fails: 500 server_error, not counted (the author gets nothing)", quiet(async () => {
  const t = setup({ provider: promiseReply(), promiseSaveThrows: true });
  const r = await t.handle(post(pid));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(t.promiseSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted, u.input_tokens, u.output_tokens]), [["ok", false, 520, 190]]);
}));

Deno.test("promise_check AI errors: not counted, nothing saved, one usage row", quiet(async () => {
  const cases: [string, () => Promise<Response>, number, string][] = [
    ["HTTP 529", () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 })), 502, "ai_unavailable"],
    ["timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 502, "ai_unavailable"],
    ["max_tokens", () => Promise.resolve(anthropic("max_tokens", '{"verdict":"dri')), 502, "ai_stopped"],
    ["refusal", () => Promise.resolve(anthropic("refusal", "")), 502, "ai_declined"],
    ["bad verdict", promiseReply({ ...PROMISE_OUT, verdict: "maybe" }), 502, "ai_unavailable"],
    ["blank reason", promiseReply({ ...PROMISE_OUT, reason: "  " }), 502, "ai_unavailable"],
    ["not our JSON", promiseReply({ findings: [] }), 502, "ai_unavailable"],
  ];
  for (const [name, provider, status, code] of cases) {
    const t = setup({ provider });
    const r = await t.handle(post(pid));
    assertEquals([r.status, (await json(r)).error], [status, code], name);
    assertEquals(t.promiseSaves, [], name);
    assert(t.logged.length === 1 && t.logged.every((u) => !u.counted && u.stage === "promise_check" && u.book_id === BOOK_ID), name);
  }
}));

Deno.test("promise_check refusals before the call: the AI is never called and no usage row", quiet(async () => {
  const j = job();
  const reserve = L.callReserve(L.buildRequest(j));
  const room = 2_000_000 - reserve;   // the highest month total this call still fits in
  const now = Date.now();
  const fresh = { state: "running", heartbeat_at: new Date(now - 1000).toISOString(), started_at: new Date(now - 5000).toISOString() };
  const cases: [string, Parameters<typeof setup>[0], unknown, number, Record<string, unknown>][] = [
    ["another user's book or chapter", {}, { ...pid, chapterId: "c0000099-0000-4000-8000-000000000000" }, 404, { error: "not_found" }],
    ["read gives null", { promise: null }, pid, 404, { error: "not_found" }],
    ["the Introduction", { promise: promiseCtx() }, { ...pid, chapterId: "c0000000-0000-4000-8000-000000000000" }, 404, { error: "not_found" }],
    ["positioning_not_locked", { promise: promiseCtx({ positioning: { ...LOCKED, locked_at: null } }) }, pid, 409, { error: "positioning_not_locked" }],
    ["nothing_to_check", { promise: promiseCtx({ versions: [] }) }, pid, 422, { error: "nothing_to_check" }],
    ["run_in_progress", { promise: promiseCtx({ runs: [fresh] }) }, pid, 409, { error: "run_in_progress" }],
    ["check_too_short", { promise: promiseCtx({ versions: [{ id: V_ID, content: "Sit tall and roll your shoulders back. ".repeat(6) }] }) }, pid, 422, { error: "check_too_short", words: 42 }],
    ["check_too_long", { promise: promiseCtx({ versions: [{ id: V_ID, content: "Sit tall and roll. ".repeat(1501) }] }) }, pid, 422, { error: "check_too_long", words: 6004 }],
    ["bad_request: text from the browser", {}, { ...pid, text: "Check this instead." }, 400, { error: "bad_request" }],
    ["bad_request: over 2 KB", {}, JSON.stringify(pid) + " ".repeat(2100), 400, { error: "bad_request" }],
    // The reserve: under the limit, but not with what this call can use.
    ["monthly_limit with the reserve", { monthTokens: room + 1 }, pid, 429, { error: "monthly_limit" }],
    ["monthly_limit at the limit", { limit: 1000, monthTokens: 1000 }, pid, 429, { error: "monthly_limit" }],
    ["monthly_limit with a running Generate run's reserve", { monthTokens: room - 100, running: 7400 }, pid, 429, { error: "monthly_limit" }],
    ["rate_limited", { recent: 10 }, pid, 429, { error: "rate_limited" }],
  ];
  for (const [name, s, body, status, reply] of cases) {
    const t = setup({ ...s, provider: promiseReply() });
    const r = await t.handle(post(body as Record<string, unknown>));
    assertEquals([r.status, await json(r)], [status, reply], name);
    assertEquals([t.calls.length, t.logged.length, t.promiseSaves.length], [0, 0, 0], name);
  }
  // Control: the highest month total passes, with 9 calls in the last minute.
  assert(reserve > 1500 && reserve < 4000, String(reserve));
  const ok = setup({ monthTokens: room, recent: 9, provider: promiseReply() });
  assertEquals((await ok.handle(post(pid))).status, 200);
}));

Deno.test("promise_check: the stage's 60 s timeout is the one used", quiet(async () => {
  const seen: number[] = [];
  const orig = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { seen.push(ms); return orig.call(AbortSignal, ms); };
  try {
    await setup({ provider: promiseReply() }).handle(post(pid));
  } finally {
    AbortSignal.timeout = orig;
  }
  assertEquals(seen, [60_000]);
}));

Deno.test("promise_check: the usage log fails, the result is still returned", quiet(async () => {
  const t = setup({ provider: promiseReply(), logThrows: true });
  assertEquals((await t.handle(post(pid))).status, 200);
  assertEquals(t.promiseSaves.length, 1);
}));

Deno.test("promise_check leave during the call: the server finishes, saves and counts", quiet(async () => {
  const abort = new AbortController();
  const t = setup({ provider: () => { abort.abort(); return promiseReply()(); } });
  const r = await t.handle(new Request(post(pid), { signal: abort.signal }));
  assertEquals(r.status, 200);
  assertEquals(t.promiseSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
  assert(t.calls[0].init.signal !== abort.signal);
}));
