// generate handler tests: the bio stage.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { type UsageRow } from "./handler.ts";
import { anthropic, FAKE_KEY, good, json, ORIGIN, pen, post, quiet, setup, USER } from "./test_fakes.ts";

Deno.test("a pen name that isn't visible (RLS) is 404", quiet(async () => {
  const { handle, calls } = setup({ pen: null });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [404, "not_found"]);
  assertEquals(calls.length, 0);
}));

Deno.test("no facts at all: not_enough_facts without an AI call", quiet(async () => {
  const { handle, calls, logged } = setup({ pen: { ...pen, bio_facts: { background: " ", credentials: "", personal: "" } } });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [422, "not_enough_facts"]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));
Deno.test("success: 200 bio, CORS, one counted usage row, correct provider request", quiet(async () => {
  const { handle, calls, logged } = setup();
  const r = await handle(post(good));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(await json(r), { stage: "bio", bio: "Nora Hale leads a class.", words: 5 });
  assertEquals(logged, [{ user_id: USER, stage: "bio", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);

  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://api.anthropic.com/v1/messages");
  const h = calls[0].init.headers as Record<string, string>;
  assertEquals([h["x-api-key"], h["anthropic-version"]], [FAKE_KEY, "2023-06-01"]);
  assert(calls[0].init.signal instanceof AbortSignal);
  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.max_tokens], ["claude-sonnet-5-5", 600]);
  assert(sent.messages[0].content.includes("<background>Leads a free weekly chair yoga class.</background>"));
}));

Deno.test("model says facts are thin: 422 with missing, counted", quiet(async () => {
  const { handle, logged } = setup({ provider: () => Promise.resolve(anthropic("end_turn", { result: "not_enough_facts", bio: "", missing: "Say what you do." })) });
  const r = await handle(post(good));
  assertEquals([r.status, await json(r)], [422, { error: "not_enough_facts", missing: "Say what you do." }]);
  assertEquals([logged[0].status, logged[0].counted], ["ok", true]);
}));

Deno.test("provider failures: short code, logged, not counted, no raw error returned", quiet(async () => {
  const cases: [() => Promise<Response>, string, string, number, number][] = [
    [() => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded sk-ant-xyz" } }), { status: 529 })), "ai_unavailable", "failed", 0, 0],
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable", "failed", 0, 0],
    [() => Promise.reject(new TypeError("network")), "ai_unavailable", "failed", 0, 0],
    [() => Promise.resolve(anthropic("max_tokens", '{"result":"ok","bio":"Nora')), "ai_stopped", "stopped", 520, 190],
    [() => Promise.resolve(anthropic("refusal", "")), "ai_declined", "failed", 520, 190],
    [() => Promise.resolve(anthropic("end_turn", "not json")), "ai_unavailable", "failed", 520, 190],
  ];
  for (const [provider, code, status, inT, outT] of cases) {
    const { handle, logged } = setup({ provider });
    const r = await handle(post(good));
    const text = await r.text();
    assertEquals([r.status, JSON.parse(text)], [502, { error: code }], code);
    assert(!text.includes("Overloaded") && !text.includes("sk-ant"));
    assertEquals(logged, [{ user_id: USER, stage: "bio", model: "claude-sonnet-5-5", input_tokens: inT, output_tokens: outT, status: status as UsageRow["status"], counted: false }]);
  }
}));
