// generate handler tests: the drift_check stage.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { PositioningContext } from "./lib.ts";
import { anthropic, BOOK_ID, dc, dcReply, json, posCtx, posRow, post, quiet, setup, USER } from "./test_fakes.ts";

Deno.test("drift_check: server saves the checked flags, counted, reply has the saved times", quiet(async () => {
  const { handle, calls, logged, saves } = setup({ provider: dcReply() });
  const r = await handle(post(dc));
  assertEquals(r.status, 200);
  const flags = [
    { id: "d1", field: "one_sentence", quote: "Chair yoga for weight loss", why: "Weight loss is not in your Brief or Research, it may attract the wrong readers.", status: "open", reason: "" },
    { id: "d2", field: "approach", quote: "a 4-week plan grows", why: "Repeat, other case.", status: "open", reason: "" },
  ];
  assertEquals(await json(r), { stage: "drift_check", flags, drift_checked_at: "2026-09-29T12:00:00.000Z", updated_at: "2026-09-30T12:00:01.000001+00:00" });
  assertEquals(saves, [{ bookId: BOOK_ID, userId: USER, flags, checkedAt: "2026-09-29T12:00:00.000Z", readUpdatedAt: "2026-09-30T10:00:00.123456+00:00" }]);
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "drift_check", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals(sent.max_tokens, 1200);
  assert((sent.messages[0].content as string).includes("<positioning>\n<one_sentence>"));
}));

Deno.test("drift_check: a kept flag stays kept with its reason", quiet(async () => {
  const kept = [{ id: "d4", field: "one_sentence", quote: "chair yoga  for weight loss", why: "Old.", status: "kept", reason: "Gentle weight care is part of the promise." }];
  const { handle } = setup({ pos: posCtx(posRow({ drift_flags: kept })), provider: dcReply() });
  const j = await json(await handle(post(dc)));
  assertEquals([j.flags[0].status, j.flags[0].reason, j.flags[1].status], ["kept", "Gentle weight care is part of the promise.", "open"]);
}));

Deno.test("drift_check: no drift is an empty, saved, counted answer", quiet(async () => {
  const { handle, saves, logged } = setup({ provider: dcReply({ flags: [] }) });
  const j = await json(await handle(post(dc)));
  assertEquals(j.flags, []);
  assertEquals([saves.length, logged[0].counted], [1, true]);
}));

Deno.test("drift_check: text changed during the check: 409, not counted, nothing saved", quiet(async () => {
  const { handle, logged } = setup({ provider: dcReply(), saveResult: null });
  const r = await handle(post(dc));
  assertEquals([r.status, (await json(r)).error], [409, "positioning_changed"]);
  assertEquals([logged[0].status, logged[0].counted], ["ok", false]);
}));

Deno.test("drift_check: a failed save is 500, logged, not counted", quiet(async () => {
  const { handle, logged } = setup({ provider: dcReply(), saveThrows: true });
  const r = await handle(post(dc));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals([logged.length, logged[0].counted], [1, false]);
}));

Deno.test("drift_check: nothing written is 422, locked is 409, no call, no save", quiet(async () => {
  const blank = posRow({ one_sentence: " ", reader_promise: null, approach: null, lacks: [], selling_points: [], focus_tags: [] });
  const cases: [PositioningContext, number, string][] = [
    [posCtx(null), 422, "nothing_to_check"],
    [posCtx(blank), 422, "nothing_to_check"],
    [posCtx(posRow({ locked_at: "2026-09-30T11:00:00Z" })), 409, "positioning_locked"],
  ];
  for (const [pos, status, code] of cases) {
    const { handle, calls, logged, saves } = setup({ pos, provider: dcReply() });
    const r = await handle(post(dc));
    assertEquals([r.status, (await json(r)).error], [status, code]);
    assertEquals([calls.length, logged.length, saves.length], [0, 0, 0]);
  }
}));

Deno.test("drift_check: bad input is 400 (flags and text never come from the browser)", quiet(async () => {
  for (const b of [{ ...dc, flags: [] }, { ...dc, field: "approach" }, { ...dc, bookId: "x" }]) {
    const { handle, calls } = setup({ provider: dcReply() });
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals(calls.length, 0);
  }
}));

Deno.test("drift_check: provider failures are 502, not counted, nothing saved", quiet(async () => {
  const cases: [() => Promise<Response>, string][] = [
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("max_tokens", '{"flags":[{"fi')), "ai_stopped"],
    [() => Promise.resolve(anthropic("end_turn", { nope: [] })), "ai_unavailable"],
  ];
  for (const [provider, code] of cases) {
    const { handle, logged, saves } = setup({ provider });
    const r = await handle(post(dc));
    assertEquals([r.status, (await json(r)).error], [502, code]);
    assertEquals([logged[0].stage, logged[0].counted, saves.length], ["drift_check", false, 0]);
  }
}));
