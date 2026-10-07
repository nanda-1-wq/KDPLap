// Snapshot of what the generate function sends and returns (Batch B1, recorded before the lib split).
// Check:  deno test --allow-read supabase/functions/generate/snapshot.test.ts
// Record: deno test --allow-read --allow-write supabase/functions/generate/snapshot.test.ts -- --update
// A refactor must leave __snapshots__/snapshot.test.ts.snap unchanged.
import { assertSnapshot } from "jsr:@std/testing@1/snapshot";
import * as L from "./lib.ts";
import {
  BOOK_ID, briefCtx, cimp, cimpReply, comp, dc, dcReply, draft, good, help, helpReply, IDEA, imp, importReply, ins, insReply,
  LOCKED, ORIGIN, pen, ph, phReply, posCtx, posRow, post, PRODUCT, PRODUCT_OUT, reviewCtx, type Setup, setup, three, titleCtx, titleReply, anthropic,
} from "./test_fakes.ts";

/* ── buildRequest: the full provider request for every stage ── */

const jobs: [string, L.Job][] = [
  ["bio", { stage: "bio", pen }],
  ["amazon_import", { stage: "amazon_import", text: imp.text }],
  ["brief_help", { stage: "brief_help", ctx: briefCtx }],
  ["review_insights", { stage: "review_insights", ctx: reviewCtx, books: L.reviewedBooks(reviewCtx) }],
  ["positioning_help (all fields)", { stage: "positioning_help", ctx: posCtx(), field: null }],
  ["positioning_help (field approach)", { stage: "positioning_help", ctx: posCtx(), field: "approach" }],
  ["drift_check", { stage: "drift_check", ctx: posCtx() }],
  ["title_ideas", { stage: "title_ideas", ctx: titleCtx(), want: 10 }],
  ["competitor_import", { stage: "competitor_import", text: PRODUCT }],
];

Deno.test("snapshot: buildRequest for every stage", async (t) => {
  for (const [name, job] of jobs) await assertSnapshot(t, L.buildRequest(job), { name: `buildRequest ${name}` });
});

/* ── Replies and errors through the handler ── */

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Run one request and record everything the outside world can see. */
async function run(s: Setup, req: Request) {
  const timeouts: number[] = [];
  const origTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { timeouts.push(ms); return origTimeout.call(AbortSignal, ms); };
  const logs: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const f = setup(s);
    const r = await f.handle(req);
    const text = await r.text();
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    return {
      status: r.status,
      headers,
      body: text ? JSON.parse(text) : null,
      usage: f.logged,
      driftSaves: f.saves,
      titleSaves: f.titleSaves,
      provider: await Promise.all(f.calls.map(async (c) => ({
        url: c.url,
        headers: c.init.headers,
        bodySha: await sha(String(c.init.body)),
      }))),
      timeouts,
      logs,
    };
  } finally {
    console.error = origErr;
    AbortSignal.timeout = origTimeout;
  }
}

const reject = (e: unknown) => () => Promise.reject(e);
const reply = (stop: string, out: unknown, status = 200) => () => Promise.resolve(anthropic(stop, out, status));
const overloaded = () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }), { status: 529, headers: { "request-id": "req_1" } }));
const timeout = reject(new DOMException("timed out", "TimeoutError"));
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Saved Title ${i}`, subtitle: null }));
const noTopicPos = () => { const c = posCtx(); c.brief = { ...c.brief, topic_text: "  " }; return c; };
const blank = posRow({ one_sentence: " ", reader_promise: null, approach: null, lacks: [], selling_points: [], focus_tags: [] });
const tid = { stage: "title_ideas", bookId: BOOK_ID };

const cases: [string, Setup, () => Request][] = [
  // Shared flow
  ["OPTIONS allowed origin", {}, () => new Request("http://x", { method: "OPTIONS", headers: { origin: ORIGIN } })],
  ["OPTIONS other origin", {}, () => new Request("http://x", { method: "OPTIONS", headers: { origin: "https://evil.example" } })],
  ["GET", {}, () => new Request("http://x", { method: "GET", headers: { origin: ORIGIN } })],
  ["no auth", {}, () => post(good, { authorization: "" })],
  ["no user", { userId: null }, () => post(good)],
  ["bad json", {}, () => post("{")],
  ["unknown stage", {}, () => post({ stage: "title", penNameId: pen.id })],
  ["body over 2 KB", {}, () => post(JSON.stringify(good) + " ".repeat(3000))],
  ["missing API key", { env: {} }, () => post(good)],
  ["database error", { storeThrows: true }, () => post(good)],
  ["monthly limit", { limit: 1000, monthTokens: 1000 }, () => post(good)],
  ["no settings row, over default", { limit: null, monthTokens: 2_000_000 }, () => post(good)],
  ["rate limited", { recent: 10 }, () => post(good)],
  ["usage log fails", { logThrows: true }, () => post(good)],

  // bio
  ["bio success", {}, () => post(good)],
  ["bio not visible", { pen: null }, () => post(good)],
  ["bio no facts", { pen: { ...pen, bio_facts: { background: " ", credentials: "", personal: "" } } }, () => post(good)],
  ["bio model thin facts", { provider: reply("end_turn", { result: "not_enough_facts", bio: "", missing: "Say what you do." }) }, () => post(good)],
  ["bio provider 529", { provider: overloaded }, () => post(good)],
  ["bio timeout", { provider: timeout }, () => post(good)],
  ["bio network", { provider: reject(new TypeError("network")) }, () => post(good)],
  ["bio max_tokens", { provider: reply("max_tokens", '{"result":"ok","bio":"Nora') }, () => post(good)],
  ["bio refusal", { provider: reply("refusal", "") }, () => post(good)],
  ["bio not json", { provider: reply("end_turn", "not json") }, () => post(good)],

  // amazon_import
  ["import success", { provider: importReply() }, () => post(imp)],
  ["import not visible", { topic: null }, () => post(imp)],
  ["import not an Amazon page", { provider: importReply({ is_amazon_page: false, books: [] }) }, () => post({ ...imp, text: "My grandmother's apple pie recipe. ".repeat(10) })],
  ["import max_tokens", { provider: reply("max_tokens", '{"is_amazon_page":true,"books":[') }, () => post(imp)],
  ["import text too short", {}, () => post({ ...imp, text: "too short" })],

  // brief_help
  ["brief_help success", { provider: helpReply() }, () => post(help)],
  ["brief_help unsourced", { provider: helpReply({ ...three, reader_problem: "Most books have 184 reviews but skip 30 minutes of warm-up.", promise_draft: "A plan for 5 days." }) }, () => post(help)],
  ["brief_help 5501 origin", { provider: helpReply() }, () => post(help, { origin: "http://localhost:5501" })],
  ["brief_help not visible", { brief: null }, () => post(help)],
  ["brief_help no topic", { brief: { ...briefCtx, brief: { ...briefCtx.brief, topic_text: "  " } } }, () => post(help)],
  ["brief_help model vague", { provider: helpReply({ result: "not_enough_facts", target_reader: "", reader_problem: "", promise_draft: "", missing: "Say who the book is for." }) }, () => post(help)],
  ["brief_help empty field", { provider: helpReply({ ...three, promise_draft: "" }) }, () => post(help)],
  ["brief_help refusal", { provider: reply("refusal", "") }, () => post(help)],

  // review_insights
  ["review_insights success", { provider: insReply() }, () => post(ins)],
  ["review_insights not enough books", { review: { ...reviewCtx, competitors: [comp(1), comp(2), comp(3, { low_reviews: " ", high_reviews: null })] } }, () => post(ins)],
  ["review_insights not visible", { review: null }, () => post(ins)],
  ["review_insights bad reply", { provider: insReply({ loves: [], hates: [] }) }, () => post(ins)],
  ["review_insights max_tokens", { provider: reply("max_tokens", '{"loves":[{"text":"Cl') }, () => post(ins)],

  // positioning_help
  ["positioning_help success", { provider: phReply() }, () => post(ph)],
  ["positioning_help field", { provider: phReply() }, () => post({ ...ph, field: "approach" })],
  ["positioning_help no row yet", { pos: posCtx(null), provider: phReply() }, () => post(ph)],
  ["positioning_help locked", { pos: posCtx(posRow({ locked_at: "2026-09-30T11:00:00Z" })) }, () => post(ph)],
  ["positioning_help no topic", { pos: noTopicPos() }, () => post(ph)],
  ["positioning_help not visible", { pos: null }, () => post(ph)],
  ["positioning_help empty reply", { provider: phReply({ ...draft, one_sentence: "", reader_promise: "", lacks: [], approach: "", selling_points: [], focus_tags: [] }) }, () => post({ ...ph, field: "approach" })],
  ["positioning_help bad field", {}, () => post({ ...ph, field: "title" })],

  // drift_check
  ["drift_check success", { provider: dcReply() }, () => post(dc)],
  ["drift_check kept flag", { pos: posCtx(posRow({ drift_flags: [{ id: "d4", field: "one_sentence", quote: "chair yoga  for weight loss", why: "Old.", status: "kept", reason: "Gentle weight care is part of the promise." }] })), provider: dcReply() }, () => post(dc)],
  ["drift_check no drift", { provider: dcReply({ flags: [] }) }, () => post(dc)],
  ["drift_check changed", { provider: dcReply(), saveResult: null }, () => post(dc)],
  ["drift_check save fails", { provider: dcReply(), saveThrows: true }, () => post(dc)],
  ["drift_check no row", { pos: posCtx(null) }, () => post(dc)],
  ["drift_check blank", { pos: posCtx(blank) }, () => post(dc)],
  ["drift_check locked", { pos: posCtx(LOCKED) }, () => post(dc)],
  ["drift_check not visible", { pos: null }, () => post(dc)],
  ["drift_check bad reply", { provider: dcReply({ nope: [] }) }, () => post(dc)],
  ["drift_check timeout", { provider: timeout }, () => post(dc)],
  ["drift_check flags from browser", {}, () => post({ ...dc, flags: [] })],

  // title_ideas
  ["title_ideas success", { provider: titleReply([IDEA, { ...IDEA, title: "Seated Yoga Made Simple", subtitle: "A 6-Week Plan for Seniors With Stiff Joints" }]) }, () => post(tid)],
  ["title_ideas not locked", { title: titleCtx({ ...posCtx(posRow()) }) }, () => post(tid)],
  ["title_ideas full", { title: titleCtx({ options: many(40) }) }, () => post(tid)],
  ["title_ideas 35 saved", { title: titleCtx({ options: many(35) }), provider: titleReply([IDEA]) }, () => post(tid)],
  ["title_ideas save full", { provider: titleReply([IDEA]), titleSaveError: { code: "options_full" } }, () => post(tid)],
  ["title_ideas save fails", { provider: titleReply([IDEA]), titleSaveError: { code: "23514" } }, () => post(tid)],
  ["title_ideas not visible", { title: null }, () => post(tid)],
  ["title_ideas empty reply", { provider: titleReply([]) }, () => post(tid)],
  ["title_ideas refusal", { provider: reply("refusal", "") }, () => post(tid)],

  // competitor_import (Batch C2)
  ["competitor_import success", { provider: cimpReply() }, () => post(cimp)],
  ["competitor_import numbers not in page", { provider: cimpReply({ ...PRODUCT_OUT, bsr: 999, reviews: 4321, rating: 4.9 }) }, () => post(cimp)],
  ["competitor_import not a product page", { provider: cimpReply({ ...PRODUCT_OUT, is_product_page: false }) }, () => post(cimp)],
  ["competitor_import not visible", { book: null }, () => post(cimp)],
  ["competitor_import text too short", {}, () => post({ ...cimp, text: "too short" })],
  ["competitor_import max_tokens", { provider: reply("max_tokens", '{"is_product_page":true,"ti') }, () => post(cimp)],
];

Deno.test("snapshot: replies and errors for every stage", async (t) => {
  for (const [name, s, req] of cases) await assertSnapshot(t, await run(s, req()), { name: `handler ${name}` });
});

/* ── interpretResponse for the stages that work without the job ── */

Deno.test("snapshot: interpretResponse", async (t) => {
  const bio = anthropic("end_turn", { result: "ok", bio: "Hi.", missing: "" });
  const b = await bio.json();
  await assertSnapshot(t, {
    bio: L.interpretResponse("bio", true, b),
    amazon_import: L.interpretResponse("amazon_import", true, b),
    brief_help: L.interpretResponse("brief_help", true, b),
    review_insights: L.interpretResponse("review_insights", true, b, L.reviewedBooks(reviewCtx)),
  });
});
