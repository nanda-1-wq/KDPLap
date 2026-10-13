// generate handler tests: the section_check stage (E10.4). Success saves the
// check with the service role (one row per section) and logs one counted row
// with the exact tokens; a failed save, an AI error or a timeout is not
// counted; the refusals before any AI call write no row and never call the
// AI. Advice only: the stage never saves a version.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { anthropic, BOOK_ID, CHECK_TEXT, checkCtx, chkid, json, post, quiet, SECTION_ID, sectionCheckReply, setup, USER, V_ID } from "./test_fakes.ts";

const KEPT = [
  { type: "voice", message: "This sentence is long and formal. Split it and speak to the reader as you.", quote: "This gentle yet powerful movement serves as a wonderful foundation for everything that follows." },
  { type: "drift", message: "Weight loss is not in the Brief or the locked positioning. Cut it or tie it to moving safely.", quote: "Chair yoga also helps you lose weight fast, so you can drop a dress size by summer." },
  { type: "objective", message: "The title promises both ways, but the text never says how to breathe during the forward roll.", quote: "" },
  { type: "voice", message: "Too vague, say how many rolls.", quote: "Keep the count under 10 < 12 rolls a day." },
];
const AREAS = { objective: "issues", voice: "issues", drift: "issues" };

Deno.test("section_check success: the check saved (service role), one counted row with the exact tokens", quiet(async () => {
  const t = setup({ write: checkCtx(), provider: sectionCheckReply() });
  const r = await t.handle(post(chkid));
  assertEquals(r.status, 200);
  const key = L.checkKeyOf(checkCtx());
  const words = L.mdWords(CHECK_TEXT);
  assertEquals(await json(r), { stage: "section_check", findings: KEPT, areas: AREAS, words, version_id: V_ID, checked_at: "2026-09-29T12:00:00+00:00", inputs_key: key });
  assertEquals(t.sectionCheckSaves, [{ sectionId: SECTION_ID, bookId: BOOK_ID, userId: USER, versionId: V_ID, findings: KEPT, areas: AREAS, words, inputsKey: key, checkedAt: "2026-09-29T12:00:00.000Z" }]);
  assertEquals(t.logged, [{ user_id: USER, book_id: BOOK_ID, stage: "section_check", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  // One call, not streamed, the stage cap, the text from the server's read.
  assertEquals(t.calls.length, 1);
  const sent = JSON.parse(String(t.calls[0].init.body));
  assertEquals([sent.max_tokens, "stream" in sent, sent.output_config.format.type, sent.output_config.effort], [1500, false, "json_schema", "low"]);
  assert(sent.messages[0].content.includes("<section_text>Shoulder rolls ease the stiffness"));
  // Advice only: no suggestion, no version.
  assertEquals([t.suggestionSaves.length, t.finishes.length, t.begins.length], [0, 0, 0]);
}));

Deno.test("section_check no problems: saved with every area pass, counted", quiet(async () => {
  const t = setup({ write: checkCtx(), provider: sectionCheckReply({ findings: [] }) });
  const r = await json(await t.handle(post(chkid)));
  assertEquals([r.findings, r.areas], [[], { objective: "pass", voice: "pass", drift: "pass" }]);
  assertEquals(t.sectionCheckSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
}));

Deno.test("section_check no voice: voice skipped, and the prompt says so", quiet(async () => {
  const t = setup({ write: checkCtx({ pen: { niche: null, voice: {} } }), provider: sectionCheckReply() });
  const r = await json(await t.handle(post(chkid)));
  assertEquals(r.areas.voice, "skipped");
  assert(r.findings.every((x: { type: string }) => x.type !== "voice"));
}));

Deno.test("section_check save fails: 500 server_error, not counted (the writer gets nothing)", quiet(async () => {
  const t = setup({ write: checkCtx(), provider: sectionCheckReply(), sectionCheckSaveThrows: true });
  const r = await t.handle(post(chkid));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(t.sectionCheckSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted, u.input_tokens, u.output_tokens]), [["ok", false, 520, 190]]);
}));

Deno.test("section_check AI errors: not counted, nothing saved", quiet(async () => {
  const cases: [string, () => Promise<Response>, number, string][] = [
    ["HTTP 529", () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 })), 502, "ai_unavailable"],
    ["timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 502, "ai_unavailable"],
    ["max_tokens", () => Promise.resolve(anthropic("max_tokens", '{"findings":[{"type":"voi')), 502, "ai_stopped"],
    ["refusal", () => Promise.resolve(anthropic("refusal", "")), 502, "ai_declined"],
    ["not our JSON", sectionCheckReply({ problems: [] }), 502, "ai_unavailable"],
  ];
  for (const [name, provider, status, code] of cases) {
    const t = setup({ write: checkCtx(), provider });
    const r = await t.handle(post(chkid));
    assertEquals([r.status, (await json(r)).error], [status, code], name);
    assertEquals(t.sectionCheckSaves, [], name);
    assert(t.logged.length === 1 && t.logged.every((u) => !u.counted && u.stage === "section_check"), name);
  }
}));

Deno.test("section_check refusals before the call: the AI is never called and no usage row", quiet(async () => {
  const ctx = checkCtx();
  const now = Date.now();
  const j = L.stageDef("section_check").check(L.parseInput(JSON.stringify(chkid))!, ctx) as L.CheckJob;
  const room = 2_000_000 - j.reserve;   // the highest month total this call still fits in
  const fresh = { state: "running", heartbeat_at: new Date(now - 1000).toISOString(), started_at: new Date(now - 5000).toISOString() };
  const short = "Sit tall and roll your shoulders back. ".repeat(6);   // 42 words
  const long = "Sit tall and roll. ".repeat(1501);                     // 6,004 words
  const cases: [string, Parameters<typeof setup>[0], unknown, number, Record<string, unknown>][] = [
    ["not_found (section not in the outline)", { write: { ...ctx, sectionId: "50000099-0000-4000-8000-000000000000" } }, chkid, 404, { error: "not_found" }],
    ["outline_not_approved", { write: { ...ctx, book: { ...ctx.book, outline_approved_at: null }, outline: ctx.outline.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, has_writing: false })) })) } }, chkid, 409, { error: "outline_not_approved" }],
    ["positioning_not_locked (decision 5)", { write: { ...ctx, positioning: { ...ctx.positioning!, locked_at: null } } }, chkid, 409, { error: "positioning_not_locked" }],
    ["nothing_to_check (no version)", { write: { ...ctx, current: null } }, chkid, 422, { error: "nothing_to_check" }],
    ["version_conflict", { write: ctx }, { ...chkid, baseVersionId: "70000009-0000-4000-8000-000000000000" }, 409, { error: "version_conflict" }],
    ["unsaved_draft", { write: { ...ctx, draft: CHECK_TEXT + " Typed." } }, chkid, 409, { error: "unsaved_draft" }],
    ["run_in_progress", { write: { ...ctx, run: fresh } }, chkid, 409, { error: "run_in_progress" }],
    ["check_too_short", { write: { ...ctx, current: { id: V_ID, content: short } } }, chkid, 422, { error: "check_too_short", words: 42 }],
    ["check_too_long", { write: { ...ctx, current: { id: V_ID, content: long } } }, chkid, 422, { error: "check_too_long", words: 6004 }],
    ["bad_request (null base)", { write: ctx }, { ...chkid, baseVersionId: null }, 400, { error: "bad_request" }],
    ["bad_request (text from the browser)", { write: ctx }, { ...chkid, text: "Check this instead." }, 400, { error: "bad_request" }],
    ["another user's section", { write: null }, chkid, 404, { error: "not_found" }],
    // The reserve: under the limit, but not with what this call can use.
    ["monthly_limit with the reserve", { write: ctx, monthTokens: room + 1 }, chkid, 429, { error: "monthly_limit" }],
    ["monthly_limit with a running Generate run's reserve", { write: ctx, monthTokens: room - 100, running: 7400 }, chkid, 429, { error: "monthly_limit" }],
    ["rate_limited", { write: ctx, recent: 10 }, chkid, 429, { error: "rate_limited" }],
  ];
  for (const [name, s, body, status, reply] of cases) {
    const t = setup({ ...s, provider: sectionCheckReply() });
    const r = await t.handle(post(body));
    assertEquals([r.status, await json(r)], [status, reply], name);
    assertEquals([t.calls.length, t.logged.length, t.sectionCheckSaves.length], [0, 0, 0], name);
  }
  // Control: the highest month total passes without a running run.
  assert(j.reserve > 3000 && j.reserve < 6000, String(j.reserve));
  const ok = setup({ write: ctx, monthTokens: room, provider: sectionCheckReply() });
  assertEquals((await ok.handle(post(chkid))).status, 200);
}));

Deno.test("section_check leave during the call: the server finishes, saves and counts", quiet(async () => {
  const abort = new AbortController();
  const t = setup({ write: checkCtx(), provider: () => { abort.abort(); return sectionCheckReply()(); } });
  const r = await t.handle(new Request(post(chkid), { signal: abort.signal }));
  assertEquals(r.status, 200);
  assertEquals(t.sectionCheckSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted]), [["ok", true]]);
  assert(t.calls[0].init.signal !== abort.signal);
}));
