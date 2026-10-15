// generate handler tests: the section_improve stage (E10.3). Success saves the
// suggestion with the service role and logs one counted row with the exact
// tokens; "no changes" saves nothing and is counted; a failed save, an AI
// error or a timeout is not counted; the refusals before any AI call write no
// row and never call the AI; Cancel (the browser aborts) does not stop the
// server, which saves and counts the exact tokens.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import {
  anthropic, BOOK_ID, iid, IMPROVE_SEL, IMPROVED, improveCtx, improveReply, json, post, quiet, SECTION_ID, setup, USER, V_ID,
} from "./test_fakes.ts";

const SUG = "5a000001-0000-4000-8000-000000000000";

Deno.test("section_improve success: the suggestion saved (service role), one counted row with the exact tokens", quiet(async () => {
  const t = setup({ write: improveCtx(), provider: improveReply() });
  const r = await t.handle(post(iid));
  assertEquals(r.status, 200);
  assertEquals(await json(r), {
    stage: "section_improve", suggestionId: SUG, action: "improve", text: IMPROVED,
    words: { before: 36, after: L.mdWords(IMPROVED) }, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null },
  });
  assertEquals(t.suggestionSaves, [{
    userId: USER, bookId: BOOK_ID, sectionId: SECTION_ID, action: "improve", instruction: null, baseVersionId: V_ID,
    selection: IMPROVE_SEL, output: IMPROVED, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null },
  }]);
  assertEquals(t.logged, [{ user_id: USER, book_id: BOOK_ID, stage: "section_improve", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  // One call, not streamed, with the job's max_tokens and the passage.
  assertEquals(t.calls.length, 1);
  const sent = JSON.parse(String(t.calls[0].init.body));
  assertEquals([sent.max_tokens, "stream" in sent, sent.output_config.format.type], [L.improveMaxTokens("improve", 36), false, "json_schema"]);
  assert(sent.messages[0].content.includes(`<passage>${IMPROVE_SEL}</passage>`));
}));

Deno.test("section_improve Custom: the instruction is saved (trimmed) and sent as data", quiet(async () => {
  const t = setup({ write: improveCtx(), provider: improveReply() });
  const r = await t.handle(post({ ...iid, action: "custom", instruction: "  Use shorter sentences.  " }));
  assertEquals(r.status, 200);
  assertEquals([t.suggestionSaves[0].action, t.suggestionSaves[0].instruction], ["custom", "Use shorter sentences."]);
  assert(JSON.parse(String(t.calls[0].init.body)).messages[0].content.includes("<instruction>Use shorter sentences.</instruction>"));
}));

Deno.test("section_improve no changes: no row saved, counted (decision 9)", quiet(async () => {
  const t = setup({ write: improveCtx(), provider: improveReply(IMPROVE_SEL + "\n") });
  const r = await t.handle(post({ ...iid, action: "edit_format" }));
  assertEquals([r.status, await json(r)], [200, { stage: "section_improve", action: "edit_format", unchanged: true }]);
  assertEquals(t.suggestionSaves, []);
  assertEquals(t.logged.map((u) => [u.stage, u.status, u.counted, u.input_tokens, u.output_tokens]), [["section_improve", "ok", true, 520, 190]]);
}));

Deno.test("section_improve notes: a new claim number flagged, a new name, markers lost", quiet(async () => {
  const sel = "Most people feel looser within a week. [Verify: no source] Do this five times.";
  const ctx = improveCtx({ current: { id: V_ID, content: `Shoulder rolls help. ${sel} Then rest.` } });
  const t = setup({ write: ctx, provider: improveReply("Most people feel looser within a week, as Ruth found. Studies show 52% feel better. Do this five times.") });
  const r = await json(await t.handle(post({ ...iid, selection: sel, before: "Shoulder rolls help. ", after: " Then rest." })));
  assertEquals(r.text, "Most people feel looser within a week, as Ruth found. Studies show 52% feel better. [Verify: no source] Do this five times.");
  assertEquals([r.flagged, r.notes], [1, { markersLost: 0, newNames: ["Ruth"], structureChanged: null }]);
}));

Deno.test("section_improve save fails: 500 server_error, not counted (the writer gets nothing)", quiet(async () => {
  const t = setup({ write: improveCtx(), provider: improveReply(), suggestionSaveThrows: true });
  const r = await t.handle(post(iid));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(t.suggestionSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted, u.input_tokens, u.output_tokens]), [["ok", false, 520, 190]]);
}));

Deno.test("section_improve AI errors: not counted, nothing saved", quiet(async () => {
  const cases: [string, () => Promise<Response>, number, string][] = [
    ["HTTP 529", () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 })), 502, "ai_unavailable"],
    ["timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 502, "ai_unavailable"],
    ["max_tokens", () => Promise.resolve(anthropic("max_tokens", '{"text":"Now lift')), 502, "ai_stopped"],
    ["refusal", () => Promise.resolve(anthropic("refusal", "")), 502, "ai_declined"],
    ["empty text", improveReply(""), 502, "ai_stopped"],
    ["too long", improveReply("Sit tall. ".repeat(2600)), 502, "ai_stopped"],
  ];
  for (const [name, provider, status, code] of cases) {
    const t = setup({ write: improveCtx(), provider });
    const r = await t.handle(post(iid));
    assertEquals([r.status, (await json(r)).error], [status, code], name);
    assertEquals(t.suggestionSaves, [], name);
    assert(t.logged.every((u) => !u.counted && u.stage === "section_improve"), name);
  }
}));

Deno.test("section_improve refusals before the call: the AI is never called and no usage row", quiet(async () => {
  const ctx = improveCtx();
  const now = Date.now();
  // The most this call can use: the input estimate + max_tokens (about 2,000 tokens here).
  const job = L.stageDef("section_improve").check(L.parseInput(JSON.stringify(iid))!, ctx) as L.ImproveJob;
  const room = 2_000_000 - job.reserve;   // the highest month total this call still fits in
  const fresh = { state: "running", heartbeat_at: new Date(now - 1000).toISOString(), started_at: new Date(now - 5000).toISOString() };
  const cases: [string, Parameters<typeof setup>[0], unknown, number, Record<string, unknown>][] = [
    ["outline_not_approved", { write: { ...ctx, book: { ...ctx.book, outline_approved_at: null }, outline: ctx.outline.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, has_writing: false })) })) } }, iid, 409, { error: "outline_not_approved" }],
    ["positioning_not_locked", { write: { ...ctx, positioning: { ...ctx.positioning!, locked_at: null } } }, iid, 409, { error: "positioning_not_locked" }],
    ["version_conflict", { write: ctx }, { ...iid, baseVersionId: null }, 409, { error: "version_conflict" }],
    ["run_in_progress", { write: { ...ctx, run: fresh } }, iid, 409, { error: "run_in_progress" }],
    ["selection_too_short", { write: ctx }, { ...iid, selection: "Sit up." }, 422, { error: "selection_too_short", words: 2 }],
    ["selection_too_long (Expand over 1,000)", { write: ctx }, { ...iid, action: "expand", selection: "Sit tall. ".repeat(501) }, 422, { error: "selection_too_long", words: 1002 }],
    ["selection_not_in_text (G3 P9)", { write: ctx }, { ...iid, selection: "Roll your hips in a slow circle, five times each way." }, 409, { error: "selection_not_in_text" }],
    ["bad_request (instruction on Improve)", { write: ctx }, { ...iid, instruction: "Shorter." }, 400, { error: "bad_request" }],
    ["bad_request (unknown action)", { write: ctx }, { ...iid, action: "poem" }, 400, { error: "bad_request" }],
    ["another user's section", { write: null }, iid, 404, { error: "not_found" }],
    // The reserve: under the limit, but not with what this call can use.
    ["monthly_limit with the reserve", { write: ctx, monthTokens: room + 1 }, iid, 429, { error: "monthly_limit" }],
    ["monthly_limit with a running Generate run's reserve", { write: ctx, monthTokens: room - 100, running: 7400 }, iid, 429, { error: "monthly_limit" }],
    ["rate_limited", { write: ctx, recent: 10 }, iid, 429, { error: "rate_limited" }],
  ];
  for (const [name, s, body, status, reply] of cases) {
    const t = setup({ ...s, provider: improveReply() });
    const r = await t.handle(post(body));
    assertEquals([r.status, await json(r)], [status, reply], name);
    assertEquals([t.calls.length, t.logged.length, t.suggestionSaves.length], [0, 0, 0], name);
  }
  // Control: the highest month total passes without a running run.
  assert(job.reserve > 1500 && job.reserve < 3000, String(job.reserve));
  const ok = setup({ write: ctx, monthTokens: room, provider: improveReply() });
  assertEquals((await ok.handle(post(iid))).status, 200);
}));

Deno.test("section_improve Cancel: the browser aborts, the server finishes, saves and counts the exact tokens (decision 4)", quiet(async () => {
  const abort = new AbortController();
  const t = setup({
    write: improveCtx(),
    provider: () => { abort.abort(); return Promise.resolve(anthropic("end_turn", { text: IMPROVED })); },
  });
  const req = new Request(post(iid), { signal: abort.signal });
  const r = await t.handle(req);
  assert(abort.signal.aborted);
  assertEquals(r.status, 200);
  assertEquals(t.suggestionSaves.length, 1);
  assertEquals(t.logged.map((u) => [u.status, u.counted, u.input_tokens, u.output_tokens]), [["ok", true, 520, 190]]);
  // The provider call never used the request's signal (only the stage timeout).
  assert(t.calls[0].init.signal !== abort.signal);
}));
