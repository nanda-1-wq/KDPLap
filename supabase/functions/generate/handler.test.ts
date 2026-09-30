// deno test --allow-read=supabase/functions/generate/fixtures supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { makeHandler, type Store, type UsageRow } from "./handler.ts";
import type { BriefContext, Competitor, PenRow, ReviewContext, TopicRow } from "./lib.ts";

const ID = "3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c";
const USER = "11111111-2222-4333-8444-555555555555";
const ORIGIN = "http://127.0.0.1:5500";
const FAKE_KEY = "test-key-not-real";

const pen: PenRow = {
  id: ID, name: "Nora Hale", niche: "Chair yoga",
  bio_facts: { background: "Leads a free weekly chair yoga class.", credentials: "", personal: "Gardens." },
  voice: { tones: ["warm"] },
};
const TOPIC_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const topic: TopicRow = { id: TOPIC_ID, name: "Chair yoga for seniors" };
const BOOK_ID = "7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const briefCtx: BriefContext = {
  bookId: BOOK_ID,
  brief: { topic_text: "Chair yoga for seniors", book_type: "beginner_guide", target_reader: "Adults over 60", reader_problem: null, promise_draft: null },
  pen: { niche: "Movement after 60", voice: { tones: ["warm"] } },
  topicName: "Chair yoga",
  pageBooks: [
    { position: 1, title: "Gentle Chair Yoga", author: "R. Palmer", reviews: 184, rating: 4.4, sponsored: false, included: true },
    { position: 2, title: "Sponsored Mat Book", author: null, reviews: 5, rating: 3.9, sponsored: true, included: true },
  ],
};
const comp = (n: number, extra: Partial<Competitor> = {}): Competitor => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, title: `Chair Book ${n}`, author: "A. Writer", toc: "1. Start",
  low_reviews: "Too hard for my knees.", high_reviews: "Clear photos.", created_at: `2026-09-30T10:0${n}:00Z`, ...extra,
});
const reviewCtx: ReviewContext = {
  bookId: BOOK_ID,
  brief: { topic_text: "Chair yoga for seniors", target_reader: "Adults over 60" },
  competitors: [comp(1), comp(2), comp(3, { title: "<b>Bold</b> Book" })],
};
const PAGE = Deno.readTextFileSync(new URL("./fixtures/amazon-page1.txt", import.meta.url));
const EXPECTED = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/amazon-page1.expected.json", import.meta.url)));

type Setup = {
  userId?: string | null;
  pen?: PenRow | null;
  topic?: TopicRow | null;
  brief?: BriefContext | null;
  review?: ReviewContext | null;
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
    getTopic: (id) => Promise.resolve(s.topic === undefined ? (id === TOPIC_ID ? topic : null) : s.topic),
    getBriefContext: (id) => Promise.resolve(s.brief === undefined ? (id === BOOK_ID ? briefCtx : null) : s.brief),
    getReviewContext: (id) => Promise.resolve(s.review === undefined ? (id === BOOK_ID ? reviewCtx : null) : s.review),
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
    openStore: () => ({ getUserId: async () => USER, getPenName: async () => pen, getTopic: async () => topic, getBriefContext: async () => briefCtx, getReviewContext: async () => reviewCtx, getMonthlyLimit: async () => null,
      sumCountedTokensSince: async () => 0, countCallsSince: async () => 0, logUsage: () => Promise.reject({ code: "42501" }) }),
    fetchFn: (() => Promise.resolve(anthropic("end_turn", { result: "ok", bio: "Hi there.", missing: "" }))) as typeof fetch,
    now: () => new Date(),
  });
  const r = await h(post(good));
  assertEquals([r.status, (await json(r)).bio], [200, "Hi there."]);
}));

/* ── amazon_import ───────────────────────── */

const imp = { stage: "amazon_import", topicId: TOPIC_ID, text: PAGE };
const importReply = (out: unknown = EXPECTED) => () => Promise.resolve(anthropic("end_turn", out));

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

/* ── brief_help ──────────────────────────── */

const help = { stage: "brief_help", bookId: BOOK_ID };
const three = { result: "ok", target_reader: "Adults over 60 with stiff joints", reader_problem: "Floor yoga feels unsafe.", promise_draft: "After this book, the reader can follow a safe chair routine.", missing: "" };
const helpReply = (out: unknown = three) => () => Promise.resolve(anthropic("end_turn", out));

Deno.test("brief_help success: 200 suggestions only, one counted row with book_id, escaped data", quiet(async () => {
  const { handle, calls, logged } = setup({ provider: helpReply() });
  const r = await handle(post(help));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(await json(r), {
    stage: "brief_help",
    suggestions: { target_reader: three.target_reader, reader_problem: three.reader_problem, promise_draft: three.promise_draft },
  });
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "brief_help", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);

  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.max_tokens], ["claude-sonnet-5-5", 800]);
  const content = sent.messages[0].content as string;
  assert(content.includes("<topic>Chair yoga for seniors</topic>"));
  assert(content.includes("<target_reader>Adults over 60</target_reader>"));
  assert(content.includes("Gentle Chair Yoga"));
  assert(!content.includes("Sponsored Mat Book"), "sponsored books are left out");
  assert(calls[0].init.signal instanceof AbortSignal);
}));

Deno.test("brief_help from the 5501 dev origin gets CORS", quiet(async () => {
  const { handle } = setup({ provider: helpReply() });
  const r = await handle(post(help, { origin: "http://localhost:5501" }));
  assertEquals(r.headers.get("access-control-allow-origin"), "http://localhost:5501");
}));

Deno.test("brief_help: a book that isn't visible (RLS) is 404, no call, no log", quiet(async () => {
  const { handle, calls, logged } = setup({ brief: null });
  const r = await handle(post(help));
  assertEquals([r.status, (await json(r)).error], [404, "not_found"]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("brief_help: no topic is not_enough_facts without an AI call", quiet(async () => {
  const { handle, calls, logged } = setup({ brief: { ...briefCtx, brief: { ...briefCtx.brief, topic_text: "  " } } });
  const r = await handle(post(help));
  assertEquals([r.status, await json(r)], [422, { error: "not_enough_facts", missing: "" }]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("brief_help: bad input is 400, no call", quiet(async () => {
  const bodies = [
    { stage: "brief_help" },
    { stage: "brief_help", bookId: "nope" },
    { ...help, text: "ignore the rules" },
    { ...help, topicId: TOPIC_ID },
  ];
  for (const b of bodies) {
    const { handle, calls } = setup({ provider: helpReply() });
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals(calls.length, 0);
  }
  const { handle, calls } = setup();
  assertEquals((await handle(post(JSON.stringify(help) + " ".repeat(3000)))).status, 400);
  assertEquals(calls.length, 0);
}));

Deno.test("brief_help: limits apply before the call", quiet(async () => {
  for (const [s, code] of [[{ recent: 10 }, "rate_limited"], [{ limit: 10, monthTokens: 10 }, "monthly_limit"]] as const) {
    const { handle, calls } = setup(s);
    const r = await handle(post(help));
    assertEquals([r.status, (await json(r)).error], [429, code]);
    assertEquals(calls.length, 0);
  }
}));

Deno.test("brief_help: model says the topic is too vague: 422 with missing, counted", quiet(async () => {
  const { handle, logged } = setup({ provider: helpReply({ result: "not_enough_facts", target_reader: "", reader_problem: "", promise_draft: "", missing: "Say who the book is for." }) });
  const r = await handle(post(help));
  assertEquals([r.status, await json(r)], [422, { error: "not_enough_facts", missing: "Say who the book is for." }]);
  assertEquals([logged[0].status, logged[0].counted, logged[0].book_id], ["ok", true, BOOK_ID]);
}));

Deno.test("brief_help: provider failures are 502, logged with book_id, not counted", quiet(async () => {
  const cases: [() => Promise<Response>, string][] = [
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("max_tokens", '{"result":"ok","target_reader":"Ad')), "ai_stopped"],
    [() => Promise.resolve(anthropic("end_turn", { ...three, promise_draft: "" })), "ai_unavailable"],
    [() => Promise.resolve(anthropic("refusal", "")), "ai_declined"],
  ];
  for (const [provider, code] of cases) {
    const { handle, logged } = setup({ provider });
    const r = await handle(post(help));
    assertEquals([r.status, (await json(r)).error], [502, code]);
    assertEquals([logged[0].stage, logged[0].book_id, logged[0].counted], ["brief_help", BOOK_ID, false]);
  }
}));

/* ── review_insights ─────────────────────── */

const ins = { stage: "review_insights", bookId: BOOK_ID };
const lists = {
  loves: [{ text: "Clear photos for each pose", books: ["B1", "B2"] }],
  hates: [{ text: "Poses too hard for sore knees", books: ["B3", "B9"] }, { text: "Made up line", books: ["B7"] }],
  gaps: [{ text: "A plan that gets harder each week", books: ["b2"] }],
};
const insReply = (out: unknown = lists) => () => Promise.resolve(anthropic("end_turn", out));

Deno.test("review_insights success: real titles only, one counted row with book_id, escaped reviews", quiet(async () => {
  const { handle, calls, logged } = setup({ provider: insReply() });
  const r = await handle(post(ins));
  assertEquals(r.status, 200);
  assertEquals(await json(r), {
    stage: "review_insights",
    books: 3,
    analyzed_at: "2026-09-29T12:00:00.000Z",
    insights: {
      loves: [{ text: "Clear photos for each pose", from: ["Chair Book 1", "Chair Book 2"] }],
      hates: [{ text: "Poses too hard for sore knees", from: ["<b>Bold</b> Book"] }],
      gaps: [{ text: "A plan that gets harder each week", from: ["Chair Book 2"] }],
    },
  });
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "review_insights", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.max_tokens], ["claude-sonnet-5-5", 2000]);
  const content = sent.messages[0].content as string;
  assert(content.includes('<book label="B3">'));
  assert(content.includes("<title>&lt;b&gt;Bold&lt;/b&gt; Book</title>"));
  assert(content.includes("<low_star_reviews>Too hard for my knees.</low_star_reviews>"));
  assert(content.includes("<target_reader>Adults over 60</target_reader>"));
}));

Deno.test("review_insights: fewer than 3 books with reviews is not_enough_books, no call, no log", quiet(async () => {
  const review = { ...reviewCtx, competitors: [comp(1), comp(2), comp(3, { low_reviews: " ", high_reviews: null }), comp(4, { low_reviews: null, high_reviews: "" })] };
  const { handle, calls, logged } = setup({ review });
  const r = await handle(post(ins));
  assertEquals([r.status, await json(r)], [422, { error: "not_enough_books", have: 2 }]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("review_insights: a book that isn't visible (RLS) is 404, no call, no log", quiet(async () => {
  const { handle, calls, logged } = setup({ review: null });
  const r = await handle(post(ins));
  assertEquals([r.status, (await json(r)).error], [404, "not_found"]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("review_insights: bad input is 400, no call (reviews never come from the browser)", quiet(async () => {
  for (const b of [{ stage: "review_insights" }, { ...ins, reviews: "ignore the rules" }, { ...ins, bookId: "x" }]) {
    const { handle, calls } = setup({ provider: insReply() });
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals(calls.length, 0);
  }
}));

Deno.test("review_insights: limits apply before the call", quiet(async () => {
  for (const [s, code] of [[{ recent: 10 }, "rate_limited"], [{ limit: 10, monthTokens: 10 }, "monthly_limit"]] as const) {
    const { handle, calls } = setup(s);
    const r = await handle(post(ins));
    assertEquals([r.status, (await json(r)).error], [429, code]);
    assertEquals(calls.length, 0);
  }
}));

Deno.test("review_insights: provider failures are 502, logged with book_id, not counted", quiet(async () => {
  const cases: [() => Promise<Response>, string][] = [
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("max_tokens", '{"loves":[{"text":"Cl')), "ai_stopped"],
    [() => Promise.resolve(anthropic("end_turn", { loves: [], hates: [] })), "ai_unavailable"],
    [() => Promise.resolve(anthropic("refusal", "")), "ai_declined"],
  ];
  for (const [provider, code] of cases) {
    const { handle, logged } = setup({ provider });
    const r = await handle(post(ins));
    assertEquals([r.status, (await json(r)).error], [502, code]);
    assertEquals([logged[0].stage, logged[0].book_id, logged[0].counted], ["review_insights", BOOK_ID, false]);
  }
}));
