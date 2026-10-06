// generate handler tests: the brief_help stage.
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { anthropic, BOOK_ID, briefCtx, help, helpReply, json, ORIGIN, post, quiet, setup, three, TOPIC_ID, USER } from "./test_fakes.ts";

Deno.test("brief_help success: 200 suggestions only, one counted row with book_id, escaped data", quiet(async () => {
  const { handle, calls, logged } = setup({ provider: helpReply() });
  const r = await handle(post(help));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(await json(r), {
    stage: "brief_help",
    suggestions: { target_reader: three.target_reader, reader_problem: three.reader_problem, promise_draft: three.promise_draft },
    unsourced: {},   // 60 is in the Brief
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

Deno.test("brief_help: numbers without a source come back in unsourced", quiet(async () => {
  const out = { ...three, reader_problem: "Most books have 184 reviews but skip 30 minutes of warm-up.", promise_draft: "A plan for 5 days." };
  const { handle } = setup({ provider: helpReply(out) });
  const j = await json(await handle(post(help)));
  // 184 is a page-1 book; 30 is nowhere; 5 is only in a sponsored book, which the model never sees.
  assertEquals(j.unsourced, { reader_problem: ["30"], promise_draft: ["5"] });
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
