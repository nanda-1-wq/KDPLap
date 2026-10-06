// generate handler tests: the amazon_import stage.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { anthropic, ID, imp, importReply, json, ORIGIN, PAGE, post, quiet, setup, TOPIC_ID, USER } from "./test_fakes.ts";

Deno.test("import success: 200 books, one counted usage row, escaped page text, 8000 tokens", quiet(async () => {
  const { handle, calls, logged } = setup({ provider: importReply() });
  const r = await handle(post(imp));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
  const body = await json(r);
  assertEquals(body.stage, "amazon_import");
  assertEquals(body.books.length, 15);
  assertEquals(Object.keys(body).sort(), ["books", "stage"]);   // no counts, no pass/fail from the server
  assertEquals(logged, [{ user_id: USER, stage: "amazon_import", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);

  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.max_tokens], ["claude-sonnet-5-5", 8000]);
  assert(sent.messages[0].content.startsWith("<page_text>\n"));
  assert(sent.messages[0].content.includes("Chair Yoga After 70"));
  assert(calls[0].init.signal instanceof AbortSignal);
}));

Deno.test("import: not an Amazon page is 422, logged, not counted", quiet(async () => {
  const { handle, logged } = setup({ provider: importReply({ is_amazon_page: false, books: [] }) });
  const r = await handle(post({ ...imp, text: "My grandmother's apple pie recipe. ".repeat(10) }));
  assertEquals([r.status, await json(r)], [422, { error: "not_amazon_page" }]);
  assertEquals([logged.length, logged[0].status, logged[0].counted], [1, "ok", false]);
}));

Deno.test("import: a topic that isn't visible (RLS) is 404, no call", quiet(async () => {
  const { handle, calls, logged } = setup({ topic: null });
  const r = await handle(post(imp));
  assertEquals([r.status, (await json(r)).error], [404, "not_found"]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("import: bad input is 400, no call", quiet(async () => {
  const bodies = [
    { ...imp, text: "too short" },
    { ...imp, text: "a".repeat(60_001) },
    { ...imp, topicId: "x" },
    { ...imp, penNameId: ID },
    { stage: "amazon_import", topicId: TOPIC_ID },
    { stage: "bio", topicId: TOPIC_ID, text: PAGE },
  ];
  for (const b of bodies) {
    const { handle, calls } = setup({ provider: importReply() });
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b).slice(0, 80));
    assertEquals(calls.length, 0);
  }
}));

Deno.test("import: a body over 256 KB is 400 (declared or streamed)", quiet(async () => {
  const { handle, calls } = setup();
  const big = JSON.stringify({ ...imp, text: "x".repeat(59_000) }) + " ".repeat(262_144);
  assertEquals((await handle(post(big))).status, 400);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const r = await handle(new Request("http://x", { method: "POST", headers: { authorization: "Bearer a.b.c" }, body: stream }));
  assertEquals(r.status, 400);
  assertEquals(calls.length, 0);
}));

Deno.test("import: limits apply before the call", quiet(async () => {
  for (const [s, code] of [[{ recent: 10 }, "rate_limited"], [{ limit: 10, monthTokens: 10 }, "monthly_limit"]] as const) {
    const { handle, calls } = setup(s);
    const r = await handle(post(imp));
    assertEquals([r.status, (await json(r)).error], [429, code]);
    assertEquals(calls.length, 0);
  }
}));

Deno.test("import: provider failures are 502, logged, not counted", quiet(async () => {
  const cases: [() => Promise<Response>, string][] = [
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("max_tokens", '{"is_amazon_page":true,"books":[')), "ai_stopped"],
    [() => Promise.resolve(anthropic("end_turn", "not json")), "ai_unavailable"],
  ];
  for (const [provider, code] of cases) {
    const { handle, logged } = setup({ provider });
    const r = await handle(post(imp));
    assertEquals([r.status, (await json(r)).error], [502, code]);
    assertEquals([logged[0].stage, logged[0].counted], ["amazon_import", false]);
  }
}));
