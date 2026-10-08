// generate handler tests: the outline_check stage (E9.2).
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { BOOK_ID, checkReply, cid, json, LOCKED, ocid, outlineCheckCtx, outlineRows, posRow, post, quiet, setup, USER } from "./test_fakes.ts";

const content = (calls: { init: RequestInit }[]) => JSON.parse(String(calls[0].init.body)).messages[0].content as string;

Deno.test("outline_check success: the server saves the findings with the key it read, counted", quiet(async () => {
  const { handle, logged, calls, checkSaves } = setup({ provider: checkReply() });
  const r = await handle(post(ocid));
  const j = await json(r);
  assertEquals(r.status, 200);
  const key = L.outlineKey(outlineRows(), LOCKED.locked_at);
  assertEquals(j.stage, "outline_check");
  assertEquals(j.findings.length, 4);
  assertEquals(j.findings[0].chapters, [cid(3), cid(6)]);
  assertEquals([j.inputs_key, j.checked_at], [key, "2026-09-29T12:00:00+00:00"]);
  assertEquals(checkSaves, [{ bookId: BOOK_ID, userId: USER, findings: j.findings, inputsKey: key, checkedAt: "2026-09-29T12:00:00.000Z" }]);
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "outline_check", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  const sent = JSON.parse(String(calls[0].init.body));
  assertEquals(sent.max_tokens, 1500);
  const c = content(calls);
  assert(c.includes("<outline>") && c.includes('<chapter number="8">'));
  assert(c.includes("<reader_promise>After finishing this book, you can follow a safe 15-minute chair routine at home, every day, without help.</reader_promise>"));
}));

Deno.test("outline_check: no problems is saved and counted (the check ran)", quiet(async () => {
  const { handle, logged, checkSaves } = setup({ provider: checkReply({ findings: [] }) });
  const j = await json(await handle(post(ocid)));
  assertEquals(j.findings, []);
  assertEquals([checkSaves.length, logged[0].counted], [1, true]);
}));

Deno.test("outline_check: unlocked, nothing titled, or not visible: no call, nothing saved", quiet(async () => {
  const untitled = outlineRows().map((c) => ({ ...c, title: null }));
  const cases: [ReturnType<typeof outlineCheckCtx> | null, number, string][] = [
    [outlineCheckCtx({ positioning: posRow() }), 409, "positioning_not_locked"],
    [outlineCheckCtx({ positioning: null }), 409, "positioning_not_locked"],
    [outlineCheckCtx({ outline: [] }), 422, "nothing_to_check"],
    [outlineCheckCtx({ outline: untitled }), 422, "nothing_to_check"],
    [null, 404, "not_found"],
  ];
  for (const [check, status, code] of cases) {
    const { handle, calls, logged, checkSaves } = setup({ check, provider: checkReply() });
    const r = await handle(post(ocid));
    assertEquals([r.status, (await json(r)).error], [status, code], code);
    assertEquals([calls.length, logged.length, checkSaves.length], [0, 0, 0], code);
  }
}));

Deno.test("outline_check: a failed save is 500, logged, not counted", quiet(async () => {
  const { handle, logged } = setup({ provider: checkReply(), checkSaveThrows: true });
  const r = await handle(post(ocid));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals([logged.length, logged[0].status, logged[0].counted], [1, "ok", false]);
}));

Deno.test("outline_check: stopped by max_tokens is not counted and not saved", quiet(async () => {
  const { handle, logged, checkSaves } = setup({ provider: () => Promise.resolve(new Response(JSON.stringify({ stop_reason: "max_tokens", usage: { input_tokens: 9, output_tokens: 1500 }, content: [{ type: "text", text: '{"findings":[{"ki' }] }))) });
  const r = await handle(post(ocid));
  assertEquals([r.status, (await json(r)).error], [502, "ai_stopped"]);
  assertEquals([logged[0].status, logged[0].counted, checkSaves.length], ["stopped", false, 0]);
}));

Deno.test("outline_check: the body takes exactly { stage, bookId }", quiet(async () => {
  for (const body of [{ ...ocid, prompt: "x" }, { stage: "outline_check" }, { ...ocid, bookId: "nope" }, { ...ocid, sectionsPerChapter: 3 }]) {
    const { handle, calls } = setup({ provider: checkReply() });
    const r = await handle(post(body));
    assertEquals([r.status, calls.length], [400, 0], JSON.stringify(body));
  }
  assertEquals(L.parseInput(JSON.stringify({ stage: "outline_check", bookId: BOOK_ID.toUpperCase() })), { stage: "outline_check", bookId: BOOK_ID });
}));
