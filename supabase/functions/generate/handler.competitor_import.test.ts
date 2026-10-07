// generate handler tests: the competitor_import stage (Batch C2).
// deno test --allow-read=supabase/functions/generate supabase/functions/generate/  (from the repo root)
import { assert, assertEquals } from "jsr:@std/assert@1";
import { anthropic, BOOK_ID, cimp, cimpReply, json, ORIGIN, post, PRODUCT, PRODUCT_OUT, quiet, setup, TOPIC_ID, USER } from "./test_fakes.ts";

Deno.test("competitor_import success: 200 with the form values only, one counted row with book_id", quiet(async () => {
  const { handle, calls, logged } = setup({ provider: cimpReply() });
  const r = await handle(post(cimp));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(await json(r), {
    stage: "competitor_import",
    competitor: {
      title: PRODUCT_OUT.title, author: "Dana Whitfield", bsr: 45210, reviews: 1284, rating: 4.4,
      low_reviews: PRODUCT_OUT.low_reviews,
      high_reviews: [PRODUCT_OUT.high_reviews[0]],   // the made-up review is not in the page
    },
  });
  assertEquals(logged, [{ user_id: USER, book_id: BOOK_ID, stage: "competitor_import", model: "claude-sonnet-5-5", input_tokens: 520, output_tokens: 190, status: "ok", counted: true }]);
  const sent = JSON.parse(calls[0].init.body as string);
  assertEquals([sent.model, sent.max_tokens], ["claude-sonnet-5-5", 4000]);
  assert(sent.messages[0].content.startsWith("<page_text>\n"));
  assert(sent.messages[0].content.includes("Dana Whitfield"));
  assert(calls[0].init.signal instanceof AbortSignal);
}));

Deno.test("competitor_import: numbers the page does not have come back empty", quiet(async () => {
  const { handle } = setup({ provider: cimpReply({ ...PRODUCT_OUT, bsr: 999, reviews: 4321, rating: 4.9 }) });
  const c = (await json(await handle(post(cimp)))).competitor;
  assertEquals([c.bsr, c.reviews, c.rating], [null, null, null]);
}));

Deno.test("competitor_import: not a product page is 422, logged with book_id, not counted", quiet(async () => {
  const { handle, logged } = setup({ provider: cimpReply({ ...PRODUCT_OUT, is_product_page: false }) });
  const r = await handle(post({ ...cimp, text: "My grandmother's apple pie recipe. ".repeat(10) }));
  assertEquals([r.status, await json(r)], [422, { error: "not_product_page" }]);
  assertEquals([logged.length, logged[0].status, logged[0].counted, logged[0].book_id], [1, "ok", false, BOOK_ID]);
}));

Deno.test("competitor_import: a book that isn't visible (RLS) is 404, no call, no log", quiet(async () => {
  const { handle, calls, logged } = setup({ book: null });
  const r = await handle(post(cimp));
  assertEquals([r.status, (await json(r)).error], [404, "not_found"]);
  assertEquals([calls.length, logged.length], [0, 0]);
}));

Deno.test("competitor_import: bad input is 400, no call", quiet(async () => {
  const bodies = [
    { ...cimp, text: "too short" },
    { ...cimp, text: "a".repeat(60_001) },
    { ...cimp, bookId: "x" },
    { stage: "competitor_import", topicId: TOPIC_ID, text: PRODUCT },
    { stage: "competitor_import", bookId: BOOK_ID },
    { ...cimp, fill: true },
  ];
  for (const b of bodies) {
    const { handle, calls } = setup({ provider: cimpReply() });
    const r = await handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b).slice(0, 80));
    assertEquals(calls.length, 0);
  }
}));

Deno.test("competitor_import: limits apply before the call", quiet(async () => {
  for (const [s, code] of [[{ recent: 10 }, "rate_limited"], [{ limit: 10, monthTokens: 10 }, "monthly_limit"]] as const) {
    const { handle, calls } = setup(s);
    const r = await handle(post(cimp));
    assertEquals([r.status, (await json(r)).error], [429, code]);
    assertEquals(calls.length, 0);
  }
}));

Deno.test("competitor_import: provider failures are 502, logged with book_id, not counted", quiet(async () => {
  const cases: [() => Promise<Response>, string][] = [
    [() => Promise.reject(new DOMException("timed out", "TimeoutError")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("max_tokens", '{"is_product_page":true,"title":"Ch')), "ai_stopped"],
    [() => Promise.resolve(anthropic("end_turn", "not json")), "ai_unavailable"],
    [() => Promise.resolve(anthropic("refusal", "")), "ai_declined"],
  ];
  for (const [provider, code] of cases) {
    const { handle, logged } = setup({ provider });
    const r = await handle(post(cimp));
    assertEquals([r.status, (await json(r)).error], [502, code]);
    assertEquals([logged[0].stage, logged[0].book_id, logged[0].counted], ["competitor_import", BOOK_ID, false]);
  }
}));
