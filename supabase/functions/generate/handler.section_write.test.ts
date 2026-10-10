// generate handler tests: the section_write stage (E10.2). The whole run with
// a fake streamed provider: each end, what it saves and what it counts, the
// refusals before any AI call, the save retry, rule A (stale run recovered)
// and rule C (heartbeats and Stop are not AI calls).
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import {
  aev, anthropicEvents, BOOK_ID, FAST, json, post, quiet, readEvents, SECTION_ID, setup, streamReply, USER, V_ID, wid, writeCtx,
} from "./test_fakes.ts";

const RUN = "f0000000-0000-4000-8000-000000000001";
const TEXT = ["Roll your shoulders back in a slow circle. ", "Then roll them forward. ", "Studies show this cuts neck pain by 40%."];

/** The Anthropic stream with a wait before each text chunk (and before the end). */
function slow(chunks: string[], ms: number, o: { input?: number; output?: number; stop?: string } = {}) {
  const ev = anthropicEvents(chunks, o);
  const n = chunks.length;
  return streamReply([...ev.slice(0, 2), ...ev.slice(2, 2 + n).map((e) => [e, ms] as [string, number]), [ev[2 + n], ms], ...ev.slice(3 + n)]);
}
const last = <T>(a: T[]) => a[a.length - 1];
// deno-lint-ignore no-explicit-any
const find = (out: { event: string; data: any }[], name: string) => out.find((e) => e.event === name)?.data;

/** Runs one Generate: the response's events, after the run has saved. */
async function run(s: Parameters<typeof setup>[0], body: unknown = wid) {
  const t = setup(s);
  const r = await t.handle(post(body));
  const { out, text } = r.headers.get("content-type")?.startsWith("text/event-stream") ? await readEvents(r) : { out: [], text: "" };
  await t.settle();
  return { ...t, r, out, text };
}

Deno.test("section_write complete: streamed text, a normal version, counted with the exact tokens", quiet(async () => {
  const { r, out, begins, finishes, logged, calls, beats } = await run({ streamProvider: slow(TEXT, 15) });
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assertEquals(r.headers.get("cache-control"), "no-cache, no-transform");
  assertEquals(out[0], { event: "start", data: { runId: RUN, aim: 450, target: 450, mode: "write", recovered: null } });
  const streamed = out.filter((e) => e.event === "text").map((e) => (e.data as { t: string }).t).join("");
  assertEquals(streamed, TEXT.join(""));
  assertEquals(find(out, "done"), { reason: "complete", partial: false, counted: true });
  assertEquals(last(out).event, "saved");
  // words comes from the save (the fake store splits on spaces; 0020 md_word_count skips the marker).
  assertEquals(find(out, "saved"), { versionId: "70000002-0000-4000-8000-000000000000", versionNo: 2, words: 23, current: true, partial: false, conflict: false, flagged: 1 });
  // The claim: the reserve is the input estimate plus max_tokens.
  assertEquals(begins.length, 1);
  const job = begins[0];
  assertEquals([job.userId, job.bookId, job.sectionId, job.runId, job.baseVersionId, job.model], [USER, BOOK_ID, SECTION_ID, RUN, null, "claude-sonnet-5-5"]);
  assert(job.reserved > 920 && job.reserved < 8000, String(job.reserved));
  // One save: the source marker added to the unsourced number; exact tokens.
  assertEquals(finishes.length, 1);
  assertEquals(finishes[0], {
    runId: RUN, text: "Roll your shoulders back in a slow circle. Then roll them forward. Studies show this cuts neck pain by 40%. [Verify: no source]",
    partial: false, endReason: "complete", status: "ok", counted: true, input: 4512, output: 612, estimated: false,
  });
  // The request: streamed, max_tokens from 450 words.
  const sent = JSON.parse(String(calls[0].init.body));
  assertEquals([sent.stream, sent.max_tokens, sent.output_config], [true, 920, { effort: "low" }]);
  assert(!("format" in sent.output_config));
  // Rule C: the usage row is the run's own (begin and finish); heartbeats add none.
  assertEquals(logged, []);
  assert(beats.every((b) => b.runId === RUN));
  assertEquals(L.openRunCount(), 0);
}));

Deno.test("section_write Stop before any text: input tokens counted, no version (answer 3)", quiet(async () => {
  const ev = anthropicEvents(["late"]);
  const { out, finishes } = await run({ stopAtBeat: 1, streamProvider: streamReply([ev[0], ev[1], [ev[2], 300]]) });
  assertEquals(find(out, "done"), { reason: "user_stop", partial: true, counted: true });
  assertEquals(finishes.length, 1);
  assertEquals(finishes[0], { runId: RUN, text: "", partial: true, endReason: "user_stop", status: "stopped", counted: true, input: 4512, output: 1, estimated: true });
  assertEquals(find(out, "saved"), { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
}));

Deno.test("section_write Stop right after the first token: a partial version, counted, estimated", quiet(async () => {
  const ev = anthropicEvents(["Roll", " your shoulders."]);
  const { out, finishes } = await run({ stopAtBeat: 1, streamProvider: streamReply([ev[0], ev[1], ev[2], [ev[3], 300]]) });
  assertEquals(find(out, "done"), { reason: "user_stop", partial: true, counted: true });
  assertEquals(finishes[0], { runId: RUN, text: "Roll", partial: true, endReason: "user_stop", status: "stopped", counted: true, input: 4512, output: 2, estimated: true });
  assertEquals(find(out, "saved").partial, true);
  assertEquals(find(out, "saved").current, false);
}));

Deno.test("section_write Stop mid-text: the text so far is kept; heartbeats carry the crash copy (rule C: no usage rows)", quiet(async () => {
  const chunks = Array.from({ length: 30 }, (_, i) => `Sentence ${String.fromCharCode(97 + (i % 26))} is here. `);
  const { out, finishes, beats, logged } = await run({ stopAtBeat: 3, streamProvider: slow(chunks, 20) });
  assertEquals(find(out, "done").reason, "user_stop");
  const kept = finishes[0].text;
  assert(kept.length > 0 && chunks.join("").startsWith(kept), kept);
  assert(kept.length < chunks.join("").trim().length);
  assertEquals(beats.length >= 3, true);
  assert(beats.some((b) => b.content.length > 0), "a beat carries the text");
  assertEquals(logged, []);
}));

Deno.test("section_write closed tab: cancelling the response counts like Stop (answer 4)", quiet(async () => {
  const t = setup({ streamProvider: slow(Array(40).fill("Breathe out slowly. "), 20) });
  const r = await t.handle(post(wid));
  const reader = r.body!.getReader();
  await reader.read();                                     // the start event
  await new Promise((res) => setTimeout(res, 80));
  await reader.cancel();
  await t.settle();
  assertEquals(t.finishes.length, 1);
  assertEquals([t.finishes[0].endReason, t.finishes[0].status, t.finishes[0].counted, t.finishes[0].partial], ["disconnect", "stopped", true, true]);
  assert(t.finishes[0].text.startsWith("Breathe out slowly."));
}));

Deno.test("section_write lost connection: the request's signal aborts, counts like Stop (answer 4)", quiet(async () => {
  const t = setup({ streamProvider: slow(Array(40).fill("Breathe out slowly. "), 20) });
  const ac = new AbortController();
  const req = new Request(post(wid), { signal: ac.signal });
  const r = await t.handle(req);
  const reader = r.body!.getReader();
  await reader.read();
  setTimeout(() => ac.abort(), 60);
  await t.settle();
  await reader.cancel().catch(() => {});
  assertEquals(t.finishes[0].endReason, "disconnect");
  assertEquals(t.finishes[0].counted, true);
}));

Deno.test("section_write soft deadline: stopped by the server, partial saved, not counted", quiet(async () => {
  const { out, finishes } = await run({ timing: { ...FAST, softDeadlineMs: 150 }, streamProvider: slow(Array(40).fill("Sit tall. "), 20) });
  assertEquals(find(out, "done"), { reason: "timeout", partial: true, counted: false });
  assertEquals([finishes[0].status, finishes[0].counted, finishes[0].estimated], ["stopped", false, true]);
  assert(finishes[0].text.startsWith("Sit tall."));
}));

Deno.test("section_write no first text in time: a failure, not counted, no version", quiet(async () => {
  const ev = anthropicEvents(["late"]);
  const { out, finishes } = await run({ timing: { ...FAST, firstTextMs: 100 }, streamProvider: streamReply([ev[0], ev[1], [ev[2], 600]]) });
  assertEquals(find(out, "done"), { reason: "ai_error", partial: true, counted: false });
  assertEquals([finishes[0].text, finishes[0].status, finishes[0].counted], ["", "failed", false]);
}));

Deno.test("section_write the stream goes quiet: idle timeout, partial saved, not counted", quiet(async () => {
  const ev = anthropicEvents(["Sit tall and breathe.", " More."]);
  const { out, finishes } = await run({ timing: { ...FAST, idleMs: 100 }, streamProvider: streamReply([ev[0], ev[1], ev[2], [ev[3], 600]]) });
  assertEquals(find(out, "done").reason, "ai_error");
  assertEquals([finishes[0].text, finishes[0].status, finishes[0].counted, finishes[0].partial], ["Sit tall and breathe.", "failed", false, true]);
}));

Deno.test("section_write an error event mid-stream: the partial is saved, failed, not counted", quiet(async () => {
  const ev = anthropicEvents(["Sit tall. "]);
  const err = aev("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
  const { out, finishes } = await run({ streamProvider: streamReply([ev[0], ev[1], ev[2], [err, 20], [ev[3], 300]]) });
  assertEquals(find(out, "done"), { reason: "ai_error", partial: true, counted: false });
  assertEquals([finishes[0].text, finishes[0].status], ["Sit tall.", "failed"]);
}));

Deno.test("section_write HTTP 529 before the stream: JSON ai_unavailable, the run ends failed, not counted", quiet(async () => {
  const provider = () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error" } }), { status: 529 }));
  const { r, finishes, logged } = await run({ streamProvider: provider });
  assertEquals(r.status, 502);
  assertEquals(await json(r), { error: "ai_unavailable" });
  assertEquals(finishes, [{ runId: RUN, text: "", partial: true, endReason: "ai_error", status: "failed", counted: false, input: 0, output: 0, estimated: false }]);
  assertEquals(logged, []);
}));

Deno.test("section_write refusal and max_tokens: exact tokens, not counted", quiet(async () => {
  const refused = await run({ streamProvider: slow(["I can't write that."], 5, { stop: "refusal", output: 9 }) });
  assertEquals(find(refused.out, "done"), { reason: "refusal", partial: true, counted: false });
  assertEquals([refused.finishes[0].status, refused.finishes[0].output, refused.finishes[0].estimated], ["failed", 9, false]);
  const cut = await run({ streamProvider: slow(["Sit tall. Breathe out and"], 5, { stop: "max_tokens", output: 920 }) });
  assertEquals(find(cut.out, "done"), { reason: "max_tokens", partial: true, counted: false });
  assertEquals([cut.finishes[0].status, cut.finishes[0].output, cut.finishes[0].estimated], ["stopped", 920, false]);
}));

Deno.test("section_write over 100,000 characters: too_long, the text capped, not counted", quiet(async () => {
  const big = "Breathe out slowly and sit tall. ".repeat(3100);      // 102,300 characters
  const { out, finishes } = await run({ streamProvider: slow([big.slice(0, 60_000), big.slice(60_000)], 5) });
  assertEquals(find(out, "done"), { reason: "too_long", partial: true, counted: false });
  assert(finishes[0].text.length <= L.SECTION_MAX_CHARS, String(finishes[0].text.length));
  assertEquals(finishes[0].status, "stopped");
}));

Deno.test("section_write shutdown: every open run stops and saves, failed, not counted", quiet(async () => {
  const t = setup({ streamProvider: slow(Array(40).fill("Sit tall. "), 20) });
  const r = await t.handle(post(wid));
  const read = readEvents(r);
  await new Promise((res) => setTimeout(res, 70));
  assertEquals(L.openRunCount(), 1);
  L.stopAllRuns("shutdown");
  const { out } = await read;
  await t.settle();
  assertEquals(find(out, "done"), { reason: "shutdown", partial: true, counted: false });
  assertEquals([t.finishes[0].status, t.finishes[0].counted], ["failed", false]);
  assertEquals(L.openRunCount(), 0);
}));

Deno.test("section_write the save is tried again; failing for good shows save_failed, the usage row untouched", quiet(async () => {
  const retried = await run({ finishFails: 2, streamProvider: slow(TEXT, 5) });
  assertEquals(retried.finishes.length, 3);
  assertEquals(last(retried.out).event, "saved");
  const lost = await run({ finishFails: Infinity, streamProvider: slow(TEXT, 5) });
  assertEquals(lost.finishes.length, 3);
  assertEquals(last(lost.out), { event: "error", data: { error: "save_failed" } });
  assertEquals(lost.logged, []);
  // The text reached the browser before the save, so it can show it read-only (answer 9).
  assertEquals(lost.out.filter((e) => e.event === "text").map((e) => (e.data as { t: string }).t).join(""), TEXT.join(""));
}));

Deno.test("section_write the base changed while writing: saved, not current, conflict shown", quiet(async () => {
  const { out } = await run({ saved: { current: false, conflict: true }, streamProvider: slow(TEXT, 5) });
  assertEquals(find(out, "saved").conflict, true);
  assertEquals(find(out, "saved").current, false);
}));

Deno.test("section_write a run taken over (stale, rule A): stops, no save, server_error", quiet(async () => {
  const { out, finishes } = await run({ takenAtBeat: 1, streamProvider: slow(Array(20).fill("Sit tall. "), 20) });
  assertEquals(finishes, []);
  assertEquals(last(out), { event: "error", data: { error: "server_error" } });
}));

Deno.test("section_write rule A: the claim recovered a stale run; the start event says so", quiet(async () => {
  const { out } = await run({ recovered: 3, streamProvider: slow(TEXT, 5) });
  assertEquals(find(out, "start").recovered, { versionNo: 3 });
}));

Deno.test("section_write generate the rest: mode continue, the base sent, aim from what is left", quiet(async () => {
  const own = "## Warm up\n\n" + "Sit tall and roll slowly. ".repeat(60);   // 302 words
  const { out, begins, calls } = await run({ write: writeCtx({ current: { id: V_ID, content: own } }), streamProvider: slow(TEXT, 5) }, { ...wid, baseVersionId: V_ID });
  assertEquals(find(out, "start"), { runId: RUN, aim: 148, target: 450, mode: "continue", recovered: null });
  assertEquals(begins[0].baseVersionId, V_ID);
  assertStringIncludes(JSON.parse(String(calls[0].init.body)).messages[0].content, "Write about 148 words to continue this section.");
}));

Deno.test("section_write rule B: at the target it asks first; more: true writes 300 words", quiet(async () => {
  const own = "Sit tall and roll slowly. ".repeat(90);                   // 450 words
  const ctx = writeCtx({ current: { id: V_ID, content: own } });
  const asked = await run({ write: ctx, streamProvider: slow(TEXT, 5) }, { ...wid, baseVersionId: V_ID });
  assertEquals(asked.r.status, 422);
  assertEquals(await json(asked.r), { error: "target_reached", words: 450, target: 450 });
  assertEquals([asked.calls.length, asked.begins.length], [0, 0]);
  const more = await run({ write: ctx, streamProvider: slow(TEXT, 5) }, { ...wid, baseVersionId: V_ID, more: true });
  assertEquals(find(more.out, "start").aim, 300);
}));

Deno.test("section_write refusals before any AI call: no claim, no call, nothing logged", quiet(async () => {
  const now = new Date().toISOString();
  const unapproved = writeCtx({ book: { title: "T", subtitle: null, outline_approved_at: null } });
  unapproved.outline = unapproved.outline.map((c) => ({ ...c, sections: c.sections.map((x) => ({ ...x, has_writing: false })) }));
  const cases: [Parameters<typeof setup>[0], unknown, number, Record<string, unknown>][] = [
    [{}, { ...wid, baseVersionId: V_ID }, 409, { error: "version_conflict" }],
    [{ write: writeCtx({ draft: "Typed but not saved." }) }, wid, 409, { error: "unsaved_draft" }],
    [{ write: writeCtx({ run: { state: "running", heartbeat_at: now, started_at: now } }) }, wid, 409, { error: "run_in_progress" }],
    [{ write: unapproved }, wid, 409, { error: "outline_not_approved" }],
    // Not approved, but a section has writing (answer 4 of E10): Write stays open.
    [{ write: writeCtx({ current: { id: V_ID, content: "x".repeat(99_000) } }) }, { ...wid, baseVersionId: V_ID }, 422, { error: "section_too_long" }],
    [{ write: null }, wid, 404, { error: "not_found" }],
    [{ write: writeCtx({ sectionId: "5000ffff-0000-4000-8000-000000000000" }) }, wid, 404, { error: "not_found" }],
    [{ monthTokens: 1_999_000 }, wid, 429, { error: "monthly_limit" }],                                  // the reserve does not fit
    [{ monthTokens: 1_000_000, running: 1_000_000 }, wid, 429, { error: "monthly_limit" }],              // other running reserves count
    [{ recent: 10 }, wid, 429, { error: "rate_limited" }],
  ];
  for (const [s, body, status, err] of cases) {
    const { r, calls, begins, logged } = await run({ ...s, streamProvider: slow(TEXT, 5) }, body);
    assertEquals([r.status, await json(r)], [status, err], JSON.stringify(err));
    assertEquals([calls.length, begins.length, logged.length], [0, 0, 0], JSON.stringify(err));
  }
}));

Deno.test("section_write the claim refuses (another tab won the race): no AI call", quiet(async () => {
  for (const [code, status, err] of [["run_in_progress", 409, "run_in_progress"], ["version_conflict", 409, "version_conflict"], ["unsaved_draft", 409, "unsaved_draft"], ["section_not_found", 404, "not_found"]] as const) {
    const { r, calls, finishes } = await run({ beginError: { code }, streamProvider: slow(TEXT, 5) });
    assertEquals([r.status, await json(r)], [status, { error: err }]);
    assertEquals([calls.length, finishes.length], [0, 0]);
  }
}));

Deno.test("section_write keep-alive: a ping comment when nothing was sent for a while", quiet(async () => {
  const ev = anthropicEvents(["Sit tall."]);
  const { text } = await run({ streamProvider: streamReply([ev[0], ev[1], ev[2], [ev[3], 150], ...ev.slice(4)]) });
  assertStringIncludes(text, ": ping\n\n");
}));
