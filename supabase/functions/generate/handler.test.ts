// generate handler tests: Shared request flow: CORS, method, auth, input, body cap, limits, secrets, database and log errors..
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assertEquals } from "jsr:@std/assert@1";
import { makeHandler } from "./handler.ts";
import { anthropic, briefCtx, FAKE_KEY, good, ID, json, ORIGIN, pen, posCtx, post, quiet, reviewCtx, setup, topic, USER } from "./test_fakes.ts";

Deno.test("OPTIONS preflight: 204 with CORS for an allowed origin only", quiet(async () => {
  const { handle } = setup();
  const ok = await handle(new Request("http://x", { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), ORIGIN);
  const other = await handle(new Request("http://x", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assertEquals(other.headers.get("access-control-allow-origin"), null);
}));

Deno.test("GET is 405", quiet(async () => {
  const { handle } = setup();
  const r = await handle(new Request("http://x", { method: "GET" }));
  assertEquals([r.status, (await json(r)).error], [405, "method_not_allowed"]);
}));

Deno.test("no or bad auth is 401, and nothing is called", quiet(async () => {
  for (const [headers, userId] of [[{ authorization: "" }, USER], [{ authorization: "Basic x" }, USER], [{}, null]] as const) {
    const { handle, calls, logged } = setup({ userId });
    const r = await handle(post(good, headers as Record<string, string>));
    assertEquals([r.status, (await json(r)).error], [401, "unauthorized"]);
    assertEquals([calls.length, logged.length], [0, 0]);
  }
}));

Deno.test("bad input is 400, and nothing is called", quiet(async () => {
  const bodies = ["{", "[]", { stage: "title", penNameId: ID }, { stage: "bio", penNameId: "x" }, { ...good, extra: 1 }];
  for (const b of bodies) {
    const { handle, calls } = setup();
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals(calls.length, 0);
  }
}));

Deno.test("a body over 2 KB is 400 (declared or streamed)", quiet(async () => {
  const { handle, calls } = setup();
  const big = JSON.stringify(good) + " ".repeat(3000);
  assertEquals((await handle(post(big))).status, 400);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const r = await handle(new Request("http://x", { method: "POST", headers: { authorization: "Bearer a.b.c" }, body: stream }));
  assertEquals(r.status, 400);
  assertEquals(calls.length, 0);
}));
Deno.test("monthly limit reached is 429 monthly_limit", quiet(async () => {
  const { handle, calls } = setup({ limit: 1000, monthTokens: 1000 });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [429, "monthly_limit"]);
  assertEquals(calls.length, 0);
}));

Deno.test("no settings row uses the 2,000,000 default", quiet(async () => {
  const under = setup({ limit: null, monthTokens: 1_999_999 });
  assertEquals((await under.handle(post(good))).status, 200);
  const over = setup({ limit: null, monthTokens: 2_000_000 });
  assertEquals((await json(await over.handle(post(good)))).error, "monthly_limit");
}));

Deno.test("10 calls in the last minute is 429 rate_limited", quiet(async () => {
  const { handle, calls } = setup({ recent: 10 });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [429, "rate_limited"]);
  assertEquals(calls.length, 0);
  assertEquals((await setup({ recent: 9 }).handle(post(good))).status, 200);
}));
Deno.test("missing API key secret: 500 server_error, no call", quiet(async () => {
  const { handle, calls } = setup({ env: {} });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(calls.length, 0);
}));

Deno.test("database error: 500 server_error", quiet(async () => {
  const { handle } = setup({ storeThrows: true });
  const r = await handle(post(good));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
}));

Deno.test("a failed usage log still returns the bio", quiet(async () => {
  const h = makeHandler({
    env: () => FAKE_KEY,
    openStore: () => ({ getUserId: async () => USER, getPenName: async () => pen, getTopic: async () => topic, getBriefContext: async () => briefCtx, getBook: async () => null, getReviewContext: async () => reviewCtx,
      getPositioningContext: async () => posCtx(), saveDriftFlags: async () => null,
      getTitleContext: async () => null, saveTitleOptions: async () => [], getOutlineContext: async () => null, replaceOutline: async () => [], getMonthlyLimit: async () => null,
      sumCountedTokensSince: async () => 0, countCallsSince: async () => 0, logUsage: () => Promise.reject({ code: "42501" }) }),
    fetchFn: (() => Promise.resolve(anthropic("end_turn", { result: "ok", bio: "Hi there.", missing: "" }))) as typeof fetch,
    now: () => new Date(),
  });
  const r = await h(post(good));
  assertEquals([r.status, (await json(r)).bio], [200, "Hi there."]);
}));
