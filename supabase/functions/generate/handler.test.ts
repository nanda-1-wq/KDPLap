// deno test supabase/functions/generate/  (no network, no real Anthropic call)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { makeHandler, type Store, type UsageRow } from "./handler.ts";
import type { PenRow } from "./lib.ts";

const ID = "3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";
const USER = "11111111-2222-4333-8444-555555555555";
const ORIGIN = "http://127.0.0.1:5500";
const FAKE_KEY = "test-key-not-real";

const pen: PenRow = {
  id: ID, name: "Nora Hale", niche: "Chair yoga",
  bio_facts: { background: "Leads a free weekly chair yoga class.", credentials: "", personal: "Gardens." },
  voice: { tones: ["warm"] },
};

type Setup = {
  userId?: string | null;
  pen?: PenRow | null;
  limit?: number | null;
  monthTokens?: number;
  recent?: number;
  env?: Record<string, string>;
  provider?: () => Promise<Response>;
  storeThrows?: boolean;
};

function setup(s: Setup = {}) {
  const logged: UsageRow[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const store: Store = {
    getUserId: () => Promise.resolve(s.userId === undefined ? USER : s.userId),
    getPenName: (id) => s.storeThrows ? Promise.reject(new Error("db down")) : Promise.resolve(s.pen === undefined ? (id === ID ? pen : null) : s.pen),
    getMonthlyLimit: () => Promise.resolve(s.limit === undefined ? 2_000_000 : s.limit),
    sumCountedTokensSince: () => Promise.resolve(s.monthTokens ?? 0),
    countCallsSince: () => Promise.resolve(s.recent ?? 0),
    logUsage: (row) => { logged.push(row); return Promise.resolve(); },
  };
  const env = s.env ?? { ANTHROPIC_API_KEY: FAKE_KEY };
  const handle = makeHandler({
    env: (n) => env[n],
    openStore: () => store,
    fetchFn: ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return s.provider ? s.provider() : Promise.resolve(anthropic("end_turn", { result: "ok", bio: "Nora Hale leads a class.", missing: "" }));
    }) as typeof fetch,
    now: () => new Date("2026-09-29T12:00:00Z"),
  });
  return { handle, logged, calls };
}

function anthropic(stop: string, out: unknown, status = 200) {
  return new Response(JSON.stringify({
    stop_reason: stop, usage: { input_tokens: 520, output_tokens: 190 },
    content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }],
  }), { status, headers: { "content-type": "application/json" } });
}

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/generate", {
  method: "POST",
  headers: { authorization: "Bearer a.b.c", origin: ORIGIN, "content-type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const good = { stage: "bio", penNameId: ID };

async function json(res: Response) { return await res.json(); }

// Keep test output quiet; errors are logged by design.
const quiet = <T>(fn: () => Promise<T>) => async () => {
  const orig = console.error;
  const lines: string[] = [];
  console.error = (...a: unknown[]) => { lines.push(a.join(" ")); };
  try { await fn(); } finally { console.error = orig; }
  for (const l of lines) assert(!l.includes(FAKE_KEY), "a log line contains the key");
};

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
    openStore: () => ({ getUserId: async () => USER, getPenName: async () => pen, getMonthlyLimit: async () => null,
      sumCountedTokensSince: async () => 0, countCallsSince: async () => 0, logUsage: () => Promise.reject({ code: "42501" }) }),
    fetchFn: (() => Promise.resolve(anthropic("end_turn", { result: "ok", bio: "Hi there.", missing: "" }))) as typeof fetch,
    now: () => new Date(),
  });
  const r = await h(post(good));
  assertEquals([r.status, (await json(r)).bio], [200, "Hi there."]);
}));
