// stock handler tests: the whole flow with fakes (no network, no database, fake keys only).
// CORS, method, auth, input, not_configured per source, the limits through stock_reserve (refusals,
// errors, answers not understood, 15 parallel picks against an atomic fake and a naive control), the
// cache (hit, miss, poisoned, errors), provider errors, the Unsplash budget, the Pixabay pick (lookup
// by id, file choice, 10 MB cap, magic bytes, redirects, storage and row), the Pixabay retry (E16.2:
// header waits, backoff, the shared 2 retries, the 20 s wait budget, the 45 s deadline, the step that
// failed only), stock_release (when and when not), the User-Agent and Accept on every Pixabay request,
// the D3 log line, the Unsplash pick (hotlink, ping), and the keys never leaving: not in a log line,
// not in a reply.
// deno test --allow-read=supabase/functions supabase/functions/stock/  (from the repo root)
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  BOOK, type Clock, FAKE_PIXABAY, FAKE_UNSPLASH, file, jpeg, json, NEW_ID, ORIGIN, pixabayAnswer, pixabayHit, pixabayRoutes, png, post, pxSearch,
  reply, type Route, setup, unSearch, unsplashAnswer, unsplashPhoto, unsplashRoutes, USER,
} from "./test_fakes.ts";
import { cacheKey, normalizeSearch, parseInput, type SearchInput } from "./lib.ts";

const pxPick = (over: Record<string, unknown> = {}) => ({ action: "pick", source: "pixabay", id: "1000", ...over });
const unPick = (over: Record<string, unknown> = {}) => ({ action: "pick", source: "unsplash", id: "p0", ...over });
const noKeys = (lines: string[], text = "") => {
  for (const l of [...lines, text]) assert(!l.includes(FAKE_PIXABAY) && !l.includes(FAKE_UNSPLASH), `a key leaked: ${l.slice(0, 200)}`);
};

/* ── Request basics ── */
Deno.test("OPTIONS: 204 with CORS for a listed origin only", async () => {
  const { handle } = setup();
  const ok = await handle(new Request("http://x", { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assertEquals([ok.status, ok.headers.get("access-control-allow-origin")], [204, ORIGIN]);
  const other = await handle(new Request("http://x", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assertEquals(other.headers.get("access-control-allow-origin"), null);
});
Deno.test("GET is 405", async () => {
  const { handle } = setup();
  const r = await handle(new Request("http://x", { method: "GET" }));
  assertEquals([r.status, (await json(r)).error], [405, "method_not_allowed"]);
});
Deno.test("no or bad auth is 401, and nothing is called", async () => {
  for (const [headers, userId] of [[{ authorization: "" }, USER], [{ authorization: "Basic x" }, USER], [{}, null]] as const) {
    const w = setup({ userId, routes: pixabayRoutes() });
    const r = await w.handle(post(pxSearch(), headers as Record<string, string>));
    assertEquals([r.status, (await json(r)).error], [401, "unauthorized"]);
    assertEquals([w.calls.length, w.reserves.length], [0, 0]);
  }
});
Deno.test("bad input is 400, and nothing is called", async () => {
  for (const b of ["{", "[]", pxSearch({ q: "" }), pxSearch({ page: 21 }), pxSearch({ extra: 1 }), pxPick({ id: "x" }), pxPick({ url: "https://pixabay.com/get/x.jpg" })]) {
    const w = setup({ routes: pixabayRoutes() });
    const r = await w.handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals([w.calls.length, w.reserves.length], [0, 0]);
  }
});
Deno.test("a body over 2 KB is 400 (declared or streamed)", async () => {
  const big = JSON.stringify(pxSearch()) + " ".repeat(2100);
  const w = setup({ routes: pixabayRoutes() });
  assertEquals((await w.handle(post(big))).status, 400);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const r = await w.handle(new Request("http://x", { method: "POST", headers: { authorization: "Bearer a.b.c" }, body: stream }));
  assertEquals(r.status, 400);
  assertEquals(w.calls.length, 0);
});
Deno.test("a reply carries CORS on errors too", async () => {
  const { handle } = setup();
  const r = await handle(post(pxSearch({ q: "" })));
  assertEquals(r.headers.get("access-control-allow-origin"), ORIGIN);
});

/* ── Keys ── */
Deno.test("a missing key is 503 not_configured for that source only, after auth", async () => {
  const w = setup({ env: { PIXABAY_API_KEY: undefined }, routes: { ...pixabayRoutes(), ...unsplashRoutes() } });
  const r = await w.handle(post(pxSearch()));
  assertEquals([r.status, (await json(r)).error], [503, "not_configured"]);
  assertEquals(w.calls.length, 0);
  assertEquals((await w.handle(post(unSearch()))).status, 200);
  const u = setup({ env: { UNSPLASH_ACCESS_KEY: "" } });
  assertEquals((await json(await u.handle(post(unPick())))).error, "not_configured");
  const anon = setup({ userId: null, env: { PIXABAY_API_KEY: undefined } });
  assertEquals((await json(await anon.handle(post(pxSearch())))).error, "unauthorized");
});

/* ── Limits: stock_reserve (0032) decides; the function only asks, before any provider call ── */
Deno.test("(0032) a refused search (rate_limited) is 429, nothing called, the reserve asked for 1 call", async () => {
  const w = setup({ usage: { searches: 30 }, routes: pixabayRoutes() });
  const r = await w.handle(post(pxSearch()));
  assertEquals([r.status, await json(r)], [429, { error: "rate_limited" }]);
  assertEquals([w.calls.length, w.reserves], [0, [{ source: "pixabay", action: "search", provider_calls: 1 }]]);
  assertEquals(w.releases, []);
  assertEquals((await setup({ usage: { searches: 29 }, routes: pixabayRoutes() }).handle(post(pxSearch()))).status, 200);
});
Deno.test("(0032) a refused pick is 429 with nothing called; searches do not count against picks", async () => {
  const w = setup({ usage: { picks: 10, searches: 0 }, routes: pixabayRoutes() });
  assertEquals((await json(await w.handle(post(pxPick())))).error, "rate_limited");
  assertEquals([w.calls.length, w.reserves], [0, [{ source: "pixabay", action: "pick", provider_calls: 1 }]]);
  assertEquals((await setup({ usage: { picks: 9, searches: 30 }, routes: pixabayRoutes() }).handle(post(pxPick()))).status, 200);
});
Deno.test("(0032) the Unsplash budget comes from stock_reserve: a search asks for 1 call, a pick for 2; stock_busy has no retry_after_s", async () => {
  const s = setup({ usage: { unsplash_hour: 30 }, routes: unsplashRoutes() });
  const r = await s.handle(post(unSearch()));
  assertEquals([r.status, await json(r)], [503, { error: "stock_busy" }]);
  assertEquals([s.calls.length, s.reserves], [0, [{ source: "unsplash", action: "search", provider_calls: 1 }]]);
  const shared = setup({ usage: { unsplash_hour: 0, unsplash_all: 44 }, routes: unsplashRoutes() });
  assertEquals((await json(await shared.handle(post(unPick())))).error, "stock_busy");
  assertEquals([shared.calls.length, shared.reserves[0].provider_calls], [0, 2]);
  assertEquals((await setup({ usage: { unsplash_all: 44 }, routes: unsplashRoutes() }).handle(post(unSearch()))).status, 200);
});
Deno.test("(0032) STOCK_UNSPLASH_HOURLY is no longer read: a new budget needs a migration", async () => {
  const w = setup({ usage: { unsplash_all: 45 }, env: { STOCK_UNSPLASH_HOURLY: "4500" }, routes: unsplashRoutes() });
  assertEquals([(await json(await w.handle(post(unSearch())))).error, w.calls.length], ["stock_busy", 0]);
});
Deno.test("the Unsplash budget does not touch Pixabay", async () => {
  assertEquals((await setup({ usage: { unsplash_hour: 999, unsplash_all: 999 }, routes: pixabayRoutes() }).handle(post(pxSearch()))).status, 200);
});
Deno.test("(0032) a reserve that fails is 500 server_error with no provider call (fail closed)", async () => {
  for (const body of [pxSearch(), pxPick(), unSearch(), unPick()]) {
    const w = setup({ failReserve: true, routes: { ...pixabayRoutes(), ...unsplashRoutes() } });
    const r = await w.handle(post(body));
    assertEquals([r.status, (await json(r)).error, w.calls.length, w.releases.length], [500, "server_error", 0, 0]);
    assertEquals(w.logged, ["stock: unexpected Error 42501"]);
  }
});
Deno.test("(0032) a reserve answer that is not understood is 500 with no provider call", async () => {
  for (const answer of [null, {}, { ok: true }, { ok: true, id: "7" }, { ok: true, id: 0 }, { ok: true, id: 1.5 }, { ok: false, code: "other" }, [true], "ok"]) {
    const w = setup({ reserveAnswer: answer, routes: pixabayRoutes() });
    const r = await w.handle(post(pxPick()));
    assertEquals([r.status, (await json(r)).error, w.calls.length], [500, "server_error", 0], JSON.stringify(answer));
    assertEquals(w.logged, ["stock: reserve answer not understood"]);
  }
});
Deno.test("(0032) 15 parallel picks against the atomic fake: 10 pass, 5 rate_limited", async () => {
  const w = setup({ routes: pixabayRoutes() });
  const rs = await Promise.all(Array.from({ length: 15 }, () => w.handle(post(pxPick()))));
  const codes = await Promise.all(rs.map(async (r) => r.status === 200 ? (await r.body?.cancel(), "ok") : (await json(r)).error));
  assertEquals([codes.filter((c) => c === "ok").length, codes.filter((c) => c === "rate_limited").length], [10, 5]);
  assertEquals(w.calls.filter((c) => /[?&]id=/.test(c.url)).length, 10);
});
Deno.test("(0032) the control: the same 15 picks against a naive fake (check, wait, write) let more than 10 through", async () => {
  const w = setup({ naive: true, routes: pixabayRoutes() });
  const rs = await Promise.all(Array.from({ length: 15 }, () => w.handle(post(pxPick()))));
  assert(rs.filter((r) => r.status === 200).length > 10, "the harness must see a race");
  await Promise.all(rs.map((r) => r.body?.cancel()));
});

/* ── Search ── */
Deno.test("Pixabay search: logged first, the key in the query, 24 results, cached for next time", async () => {
  const w = setup({ routes: pixabayRoutes() });
  const r = await w.handle(post(pxSearch({ filters: { color: "transparent" } })));
  const b = await json(r);
  assertEquals(r.status, 200);
  assertEquals([b.source, b.q, b.page, b.perPage, b.total, b.results.length, b.cached], ["pixabay", "green leaf", 1, 24, 480, 24, false]);
  assertEquals(b.results[0], {
    id: "1000", source: "pixabay", name: "green leaf", thumb: "https://pixabay.com/get/g1000_640.png", preview: "https://pixabay.com/get/g1000_1280.png",
    width: 1280, height: 853, type: "vector", transparent: true, author: "Ann Lee", authorUrl: "https://pixabay.com/users/ann-lee-42/",
    pageUrl: "https://pixabay.com/illustrations/leaf-1000/",
  });
  assertEquals(w.reserves, [{ source: "pixabay", action: "search", provider_calls: 1 }]);
  assertEquals(w.calls.length, 1);
  assertEquals(w.calls[0].init.headers, { "User-Agent": "NicheInk-stock/3 (+https://nicheink.com)", "Accept": "application/json" });
  const u = new URL(w.calls[0].url);
  assertEquals([u.host, u.searchParams.get("key"), u.searchParams.get("q"), u.searchParams.get("colors"), u.searchParams.get("safesearch")], ["pixabay.com", FAKE_PIXABAY, "green leaf", "transparent", "true"]);
  assertEquals(w.calls[0].init.redirect, "error");
  assertEquals(w.cacheWrites.length, 1);
  assertMatch(w.cacheWrites[0].key, /^[0-9a-f]{64}$/);
  assertEquals((w.cacheWrites[0].body as { results: unknown[] }).results.length, 24);
  noKeys(w.logged, JSON.stringify(b));
});
Deno.test("the cache is read with a 24-hour window on the function's clock", async () => {
  const w = setup({ routes: pixabayRoutes() });
  await w.handle(post(pxSearch()));
  assertEquals(w.cacheReads[0].since, "2026-11-15T12:00:00.000Z");
});
Deno.test("a cached answer: no provider call, logged as 0 calls, cached true", async () => {
  const w = setup({ routes: pixabayRoutes() });
  await w.handle(post(pxSearch()));
  const again = await w.handle(post(pxSearch({ q: "GREEN   leaf" })));
  const b = await json(again);
  assertEquals([again.status, b.cached, b.results.length, b.q], [200, true, 24, "GREEN leaf"]);
  assertEquals(w.calls.length, 1);
  assertEquals(w.reserves.map((c) => c.provider_calls), [1, 0]);
});
Deno.test("a cached Unsplash answer does not spend the hourly budget", async () => {
  const w = setup({ routes: unsplashRoutes() });
  await w.handle(post(unSearch()));
  const busy = setup({ cache: w.cache, usage: { unsplash_hour: 45 }, routes: unsplashRoutes() });
  const r = await busy.handle(post(unSearch()));
  assertEquals([r.status, (await json(r)).cached, busy.calls.length], [200, true, 0]);
});
Deno.test("a poisoned cache row (off-host link) is not used: the provider is asked again", async () => {
  const i = parseInput(JSON.stringify(pxSearch())) as SearchInput;
  const good = normalizeSearch(i, pixabayAnswer(3), false)!;
  const bad = JSON.parse(JSON.stringify(good));
  bad.results[0].thumb = "https://evil.example/track.png";
  const cache = new Map([[await cacheKey(i), bad]]);
  const w = setup({ cache, routes: pixabayRoutes() });
  const b = await json(await w.handle(post(pxSearch())));
  assertEquals([b.cached, w.calls.length], [false, 1]);
  assert(!JSON.stringify(b).includes("evil.example"));
});
Deno.test("a cache read or write that fails does not stop the search", async () => {
  const r1 = setup({ failCacheRead: true, routes: pixabayRoutes() });
  assertEquals((await r1.handle(post(pxSearch()))).status, 200);
  const r2 = setup({ failCacheWrite: true, routes: pixabayRoutes() });
  assertEquals((await r2.handle(post(pxSearch()))).status, 200);
  assert(r2.logged.some((l) => l.startsWith("stock: cache write failed")));
});
Deno.test("(0032) a cache hit is reserved too (0 calls): a refused one is 429 and sends no answer", async () => {
  const w = setup({ routes: pixabayRoutes() });
  await w.handle(post(pxSearch()));
  const full = setup({ cache: w.cache, usage: { searches: 30 }, routes: pixabayRoutes() });
  const r = await full.handle(post(pxSearch()));
  assertEquals([r.status, await json(r), full.calls.length, full.reserves[0].provider_calls], [429, { error: "rate_limited" }, 0, 0]);
});
Deno.test("Unsplash search: the key only in the header, content_filter high, 24 results", async () => {
  const w = setup({ routes: unsplashRoutes() });
  const b = await json(await w.handle(post(unSearch({ filters: { color: "blue" } }))));
  assertEquals([b.source, b.results.length, b.total, b.results[0].author], ["unsplash", 24, 480, "Bo Kim"]);
  const u = new URL(w.calls[0].url);
  assertEquals([u.host, u.searchParams.get("content_filter"), u.searchParams.get("color"), u.searchParams.has("client_id")], ["api.unsplash.com", "high", "blue", false]);
  assert(!w.calls[0].url.includes(FAKE_UNSPLASH));
  assertEquals((w.calls[0].init.headers as Record<string, string>)["Authorization"], `Client-ID ${FAKE_UNSPLASH}`);
  noKeys(w.logged, JSON.stringify(b));
});
Deno.test("no results is a normal answer", async () => {
  const w = setup({ routes: pixabayRoutes({ search: { total: 0, totalHits: 0, hits: [] } }) });
  const b = await json(await w.handle(post(pxSearch())));
  assertEquals([b.total, b.results], [0, []]);
});

/* ── Provider errors ── */
Deno.test("provider errors map to our codes: 429 busy, 401 not configured, 500 unavailable", async () => {
  for (const [status, code, http] of [[429, "stock_busy", 503], [401, "not_configured", 503], [500, "stock_unavailable", 502], [400, "stock_unavailable", 502]] as const) {
    const w = setup({ routes: { "https://pixabay.com/api/": () => reply(`[ERROR ${status}] bad key=${FAKE_PIXABAY}`, status) } });
    const r = await w.handle(post(pxSearch()));
    const text = await r.text();
    assertEquals([r.status, JSON.parse(text).error], [http, code], String(status));
    assert(w.logged.some((l) => l === `stock: pixabay search HTTP ${status}`));
    noKeys(w.logged, text);
  }
});
Deno.test("an Unsplash 403 with no calls left is busy; another 403 is unavailable", async () => {
  const busy = setup({ routes: { "https://api.unsplash.com/": () => reply("Rate Limit Exceeded", 403, { "x-ratelimit-remaining": "0" }) } });
  assertEquals((await json(await busy.handle(post(unSearch())))).error, "stock_busy");
  const other = setup({ routes: { "https://api.unsplash.com/": () => reply("no", 403, { "x-ratelimit-remaining": "12" }) } });
  assertEquals((await json(await other.handle(post(unSearch())))).error, "stock_unavailable");
});
Deno.test("a timeout or a network error is stock_unavailable; only the error name is logged", async () => {
  for (const err of [new DOMException(`timed out https://pixabay.com/api/?key=${FAKE_PIXABAY}`, "TimeoutError"), new TypeError(`error sending request for url (https://pixabay.com/api/?key=${FAKE_PIXABAY})`)]) {
    const w = setup({ routes: { "https://pixabay.com/api/": () => { throw err; } } });
    const r = await w.handle(post(pxSearch()));
    const text = await r.text();
    assertEquals([r.status, JSON.parse(text).error], [502, "stock_unavailable"]);
    assertEquals(w.logged, [`stock: pixabay search failed: ${err.name}`]);
    noKeys(w.logged, text);
  }
});
Deno.test("an answer that is not JSON, or not a search answer, is stock_unavailable", async () => {
  for (const body of ["<html>", JSON.stringify({ hits: "x" })]) {
    const w = setup({ routes: { "https://pixabay.com/api/": () => new Response(body, { status: 200 }) } });
    assertEquals((await json(await w.handle(post(pxSearch())))).error, "stock_unavailable");
  }
});
Deno.test("an error inside the store is 500 server_error, and its message is not logged", async () => {
  const w = setup({ failUser: true });
  const r = await w.handle(post(pxSearch()));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(w.logged, ["stock: unexpected Error"]);
  noKeys(w.logged);
});

/* ── Pixabay pick ── */
Deno.test("Pixabay pick: looked up by id, the 1,280 file stored, the row built from the file's bytes", async () => {
  const bytes = jpeg(1280, 853);
  const w = setup({ routes: pixabayRoutes({ file: bytes }) });
  const r = await w.handle(post(pxPick({ bookId: BOOK })));
  const b = await json(r);
  assertEquals(r.status, 200);
  assertEquals(w.calls.map((c) => new URL(c.url).host + new URL(c.url).pathname), ["pixabay.com/api/", "pixabay.com/get/g1000_1280.png"]);
  assertEquals(Object.fromEntries(new URL(w.calls[0].url).searchParams), { key: FAKE_PIXABAY, id: "1000" });
  assertEquals(w.calls[1].init.redirect, "manual");
  assert(!JSON.stringify(w.calls[1].init.headers).includes(FAKE_PIXABAY));
  assertEquals(w.calls.map((c) => c.init.headers), [
    { "User-Agent": "NicheInk-stock/3 (+https://nicheink.com)", "Accept": "application/json" },
    { "User-Agent": "NicheInk-stock/3 (+https://nicheink.com)", "Accept": "image/jpeg, image/png" },
  ]);
  assertEquals(w.uploads.map((u) => [u.path, u.mime, u.bytes.length]), [[`${USER}/assets/${NEW_ID}.jpg`, "image/jpeg", bytes.length]]);
  assertEquals(w.inserted, [{
    id: NEW_ID, source: "pixabay", mime: "image/jpeg", path: `${USER}/assets/${NEW_ID}.jpg`, remote: null, width: 1280, height: 853,
    bytes: bytes.length, transparent: false, origin_book_id: BOOK, name: "green leaf",
    credit: { id: 1000, author: "Ann Lee", authorUrl: "https://pixabay.com/users/ann-lee-42/", pageUrl: "https://pixabay.com/illustrations/leaf-1000/" },
  }]);
  assertEquals(b.asset.id, NEW_ID);
  assertEquals([w.reserves, w.releases, w.slept, w.logged], [[{ source: "pixabay", action: "pick", provider_calls: 1 }], [], [], []]);
  noKeys(w.logged, JSON.stringify(b));
});
Deno.test("Pixabay pick: the size comes from the file, not from Pixabay's numbers", async () => {
  const w = setup({ routes: pixabayRoutes({ file: jpeg(1100, 700) }) });
  await w.handle(post(pxPick()));
  assertEquals([w.inserted[0].width, w.inserted[0].height], [1100, 700]);
});
Deno.test("Pixabay pick: a see-through PNG is stored as .png and marked transparent", async () => {
  const w = setup({ routes: pixabayRoutes({ file: png(1280, 1280, 6) }) });
  await w.handle(post(pxPick()));
  assertEquals([w.uploads[0].path.endsWith(".png"), w.inserted[0].mime, w.inserted[0].transparent], [true, "image/png", true]);
  const flat = setup({ routes: pixabayRoutes({ file: png(1280, 1280, 2) }) });
  await flat.handle(post(pxPick()));
  assertEquals(flat.inserted[0].transparent, false);
});
Deno.test("Pixabay pick: an id Pixabay does not know is 404, nothing downloaded", async () => {
  const w = setup({ routes: pixabayRoutes({ lookup: { totalHits: 0, hits: [] } }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, (await json(r)).error, w.calls.length, w.uploads.length], [404, "not_found", 1, 0]);
});
Deno.test("Pixabay pick: a hit with an off-host file link is never fetched", async () => {
  const w = setup({ routes: pixabayRoutes({ lookup: { totalHits: 1, hits: [pixabayHit(1000, { largeImageURL: "https://evil.example/x.jpg" })] } }) });
  const r = await w.handle(post(pxPick()));
  assertEquals((await json(r)).error, "stock_unavailable");
  assert(w.calls.every((c) => !c.url.includes("evil.example")));
});
Deno.test("Pixabay pick: a file over 10 MB (declared) is too_large, nothing stored", async () => {
  const big = () => new Response(new Uint8Array(16) as Uint8Array<ArrayBuffer>, { status: 200, headers: { "content-length": "10485761" } });
  const w = setup({ routes: pixabayRoutes({ fileRoute: big }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, (await json(r)).error, w.uploads.length, w.inserted.length], [422, "too_large", 0, 0]);
});
Deno.test("Pixabay pick: a file that streams past 10 MB is cut off and too_large", async () => {
  let sent = 0;
  const stream = () => new Response(new ReadableStream({
    pull(c) { if (sent > 11_000_000) { c.close(); return; } const n = 1 << 20; sent += n; c.enqueue(new Uint8Array(n)); },
  }), { status: 200 });
  const w = setup({ routes: pixabayRoutes({ fileRoute: stream }) });
  assertEquals((await json(await w.handle(post(pxPick())))).error, "too_large");
  assert(sent <= 11 << 20, `read ${sent}`);
  assertEquals(w.uploads.length, 0);
});
Deno.test("Pixabay pick with full access: the original when it fits, else Full HD", async () => {
  const hit = pixabayHit(1000, { imageURL: "https://pixabay.com/get/orig.jpg", fullHDURL: "https://pixabay.com/get/hd.jpg", imageWidth: 6000, imageHeight: 4000, imageSize: 9_000_000 });
  const routes = (origRoute: () => Response) => ({
    "https://pixabay.com/api/": () => reply({ totalHits: 1, hits: [hit] }),
    "https://pixabay.com/get/orig.jpg": origRoute,
    "https://pixabay.com/get/hd.jpg": () => file(jpeg(1920, 1280)),
    "https://pixabay.com/get/g1000_1280.png": () => file(jpeg(1280, 853)),
  });
  const a = setup({ env: { PIXABAY_FULL: "1" }, routes: routes(() => file(jpeg(6000, 4000))) });
  await a.handle(post(pxPick()));
  assertEquals([a.inserted[0].width, a.calls.length], [6000, 2]);
  const b = setup({ env: { PIXABAY_FULL: "1" }, routes: routes(() => new Response(new Uint8Array(4) as Uint8Array<ArrayBuffer>, { headers: { "content-length": "20000000" } })) });
  await b.handle(post(pxPick()));
  assertEquals([b.inserted[0].width, b.calls.map((c) => c.url.split("/").pop())], [1920, ["?key=fake-pixabay-key-0000&id=1000", "orig.jpg", "hd.jpg"]]);
  const c = setup({ routes: routes(() => file(jpeg(6000, 4000))) });
  await c.handle(post(pxPick()));
  assertEquals(c.inserted[0].width, 1280);
});
Deno.test("Pixabay pick: a file that is not a JPEG or PNG is bad_image, nothing stored", async () => {
  const w = setup({ routes: pixabayRoutes({ file: new TextEncoder().encode("GIF89a................") }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, (await json(r)).error, w.uploads.length], [422, "bad_image", 0]);
});
Deno.test("Pixabay pick: a file over 12,000 px is too_large", async () => {
  const w = setup({ routes: pixabayRoutes({ file: png(12001, 100, 2) }) });
  assertEquals((await json(await w.handle(post(pxPick())))).error, "too_large");
  assertEquals(w.uploads.length, 0);
});
Deno.test("Pixabay pick: a redirect to a Pixabay host is followed; to any other host it is not", async () => {
  const hop = (to: string) => ({
    ...pixabayRoutes(),
    "https://pixabay.com/get/": () => new Response(null, { status: 302, headers: { location: to } }),
    "https://cdn.pixabay.com/": () => file(jpeg(1280, 853)),
  });
  const ok = setup({ routes: hop("https://cdn.pixabay.com/photo/x_1280.jpg") });
  assertEquals((await ok.handle(post(pxPick()))).status, 200);
  assertEquals(ok.calls.length, 3);
  const bad = setup({ routes: hop("https://evil.example/x.jpg") });
  assertEquals((await json(await bad.handle(post(pxPick())))).error, "stock_unavailable");
  assert(bad.calls.every((c) => !c.url.includes("evil.example")));
  const loop = setup({ routes: hop("https://pixabay.com/get/again.jpg") });
  assertEquals((await json(await loop.handle(post(pxPick())))).error, "stock_unavailable");
  assertEquals(loop.calls.length, 5);
});
Deno.test("(E16.2) Pixabay pick: a download that times out is stock_unavailable and not retried", async () => {
  const fail = setup({ routes: pixabayRoutes({ fileRoute: () => { throw new DOMException("x", "TimeoutError"); } }) });
  assertEquals((await json(await fail.handle(post(pxPick())))).error, "stock_unavailable");
  assertEquals([fail.calls.length, fail.slept], [2, []]);
  assertEquals(fail.logged, ["stock: pixabay download failed: TimeoutError"]);
});
Deno.test("(E16.2) Pixabay pick: a 429 that stays is busy after 2 retries, with retry_after_s 20 (no header)", async () => {
  const busy = setup({ routes: pixabayRoutes({ fileRoute: () => reply("x", 429) }) });
  const r = await busy.handle(post(pxPick()));
  assertEquals([r.status, await json(r)], [503, { error: "stock_busy", retry_after_s: 20 }]);
  assertEquals(busy.calls.map((c) => new URL(c.url).pathname), ["/api/", "/get/g1000_1280.png", "/get/g1000_1280.png", "/get/g1000_1280.png"]);
});
Deno.test("Pixabay pick: an upload that fails is server_error and no row is added", async () => {
  const w = setup({ failUpload: true, routes: pixabayRoutes() });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, w.inserted.length], [500, 0]);
});
Deno.test("Pixabay pick: a row that fails removes the stored file again", async () => {
  const w = setup({ failInsert: true, routes: pixabayRoutes() });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, (await json(r)).error], [500, "server_error"]);
  assertEquals(w.removed, [`${USER}/assets/${NEW_ID}.jpg`]);
  assert(w.logged.includes("stock: asset row failed: 23514"));
});

/* ── Unsplash pick ── */
Deno.test("Unsplash pick: the photo by id, then the download ping, then a linked row (no copy)", async () => {
  const w = setup({ routes: unsplashRoutes() });
  const r = await w.handle(post(unPick({ bookId: BOOK })));
  const b = await json(r);
  assertEquals(r.status, 200);
  assertEquals(w.calls.map((c) => c.url), ["https://api.unsplash.com/photos/p0", "https://api.unsplash.com/photos/p0/download?ixid=abc"]);
  for (const c of w.calls) assertEquals((c.init.headers as Record<string, string>)["Authorization"], `Client-ID ${FAKE_UNSPLASH}`);
  assertEquals(w.uploads, []);
  assertEquals(w.inserted, [{
    id: NEW_ID, source: "unsplash", mime: "image/jpeg", path: null, remote: { url: "https://images.unsplash.com/photo-p0?ixid=abc", width: 6000, height: 4000 },
    width: 6000, height: 4000, bytes: null, transparent: false, origin_book_id: BOOK, name: "a calm sea at dusk",
    credit: { id: "p0", author: "Bo Kim", authorUrl: "https://unsplash.com/@bokim", pageUrl: "https://unsplash.com/photos/p0" },
  }]);
  assertEquals(w.reserves, [{ source: "unsplash", action: "pick", provider_calls: 2 }]);
  for (const c of w.calls) assert(!("User-Agent" in (c.init.headers as Record<string, string>)), "the NicheInk User-Agent is for Pixabay only");
  assertEquals(b.asset.source, "unsplash");
  noKeys(w.logged, JSON.stringify(b));
});
Deno.test("Unsplash pick: a ping that fails stops the pick (no row)", async () => {
  const w = setup({ routes: unsplashRoutes({ ping: () => reply("x", 500) }) });
  const r = await w.handle(post(unPick()));
  assertEquals([r.status, (await json(r)).error, w.inserted.length], [502, "stock_unavailable", 0]);
});
Deno.test("Unsplash pick: a ping link off api.unsplash.com is never called", async () => {
  const photo = unsplashPhoto("p0", { links: { html: "https://unsplash.com/photos/p0", download_location: "https://evil.example/ping" } });
  const w = setup({ routes: unsplashRoutes({ photo }) });
  assertEquals((await json(await w.handle(post(unPick())))).error, "stock_unavailable");
  assertEquals(w.calls.length, 1);
});
Deno.test("Unsplash pick: an unknown id is 404", async () => {
  const w = setup({ routes: { "https://api.unsplash.com/photos/": () => reply({ errors: ["Couldn't find Photo"] }, 404) } });
  assertEquals((await json(await w.handle(post(unPick())))).error, "not_found");
  assertEquals(w.inserted.length, 0);
});
Deno.test("Unsplash pick: a photo over 12,000 px is linked at 12,000 px", async () => {
  const w = setup({ routes: unsplashRoutes({ photo: unsplashPhoto("p0", { width: 16000, height: 9000 }) }) });
  await w.handle(post(unPick()));
  assertEquals([w.inserted[0].remote, w.inserted[0].width, w.inserted[0].height],
    [{ url: "https://images.unsplash.com/photo-p0?ixid=abc&w=12000", width: 12000, height: 6750 }, 12000, 6750]);
});
Deno.test("Unsplash pick: a row that fails is server_error, nothing to remove", async () => {
  const w = setup({ failInsert: true, routes: unsplashRoutes() });
  assertEquals((await w.handle(post(unPick()))).status, 500);
  assertEquals(w.removed, []);
});

/* ── Keys never leave ── */
Deno.test("the keys never appear in a log line or a reply, whatever fails", async () => {
  const cases: [unknown, Record<string, (u: string) => Response>][] = [
    [pxSearch(), { "https://pixabay.com/api/": () => { throw new Error(`fetch https://pixabay.com/api/?key=${FAKE_PIXABAY}`); } }],
    [pxSearch(), { "https://pixabay.com/api/": () => reply(`{"error":"key ${FAKE_PIXABAY}"}`, 500) }],
    [pxPick(), { "https://pixabay.com/api/": () => reply({ totalHits: 1, hits: [pixabayHit(1000, { largeImageURL: `https://pixabay.com/get/x.jpg?k=${FAKE_PIXABAY}` })] }), "https://pixabay.com/get/": () => { throw new Error(FAKE_PIXABAY); } }],
    [unSearch(), { "https://api.unsplash.com/": () => { throw new Error(`Client-ID ${FAKE_UNSPLASH}`); } }],
    [unPick(), { "https://api.unsplash.com/": () => reply(`bad ${FAKE_UNSPLASH}`, 401) }],
  ];
  for (const [body, routes] of cases) {
    const w = setup({ routes });
    const r = await w.handle(post(body));
    noKeys(w.logged, await r.text());
    assert(r.status >= 400);
  }
});
Deno.test("the search answer for the browser has no provider-only fields", async () => {
  const w = setup({ routes: unsplashRoutes({ search: unsplashAnswer(1) }) });
  const b = await json(await w.handle(post(unSearch())));
  assertEquals(Object.keys(b.results[0]).sort(), ["author", "authorUrl", "height", "id", "name", "pageUrl", "preview", "source", "thumb", "transparent", "type", "width"]);
  assert(!JSON.stringify(b).includes("download_location"));
});

/* ── E16.2: the Pixabay pick retry (STOP 1 inputs: 2 retries for the pick, 20 s of waiting, 45 s in all) ── */
const UA = "NicheInk-stock/3 (+https://nicheink.com)";
/** A route that answers each call with the next response (the last one repeats). */
const seq = (...rs: Route[]): Route => { let n = 0; return (u, i) => rs[Math.min(n++, rs.length - 1)](u, i); };
const okFile: Route = () => file(jpeg(1280, 853));
const r429 = (h: Record<string, string> = {}): Route => () => reply("x", 429, h);
const lookupOk = { totalHits: 1, hits: [pixabayHit(1000)] };
const downloads = (w: { calls: { url: string }[] }) => w.calls.filter((c) => c.url.includes("/get/")).map((c) => c.url);
const lookups = (w: { calls: { url: string }[] }) => w.calls.filter((c) => /[?&]id=/.test(c.url)).length;
/** No log line carries a URL, a query or a key. */
const clean = (lines: string[]) => {
  noKeys(lines);
  for (const l of lines) assert(!l.includes("://") && !l.includes("key=") && !l.includes("?"), `a URL in the log: ${l}`);
};

Deno.test("(E16.2) a download 429 with Retry-After 3: waits 3 s, then retries the download only, at the same link", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(r429({ "retry-after": "3" }), okFile) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals(r.status, 200);
  assertEquals([lookups(w), downloads(w).length, new Set(downloads(w)).size, w.slept, w.releases], [1, 2, 1, [3000], []]);
  assertEquals(w.logged, ["stock: pixabay download HTTP 429 (try 1 of 3, hop 0 pixabay.com, server -, cf-mitigated -, type json, bytes 1, wait 3 s, retry-after 3, reset -, remaining -)"]);
});
Deno.test("(E16.2) a Retry-After over the wait budget is not waited: stock_busy with retry_after_s (capped at 120)", async () => {
  for (const [ra, want] of [["25", 25], ["500", 120]] as const) {
    const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "retry-after": ra }) }) });
    const r = await w.handle(post(pxPick()));
    assertEquals([r.status, await json(r)], [503, { error: "stock_busy", retry_after_s: want }]);
    assertEquals([downloads(w).length, w.slept, w.releases], [1, [], [1]]);
    assert(w.logged[0].includes(`wait 0 s, retry-after ${ra},`), w.logged[0]);
  }
});
Deno.test("(E16.2) Retry-After as an HTTP-date is waited (minus the function's clock)", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(r429({ "retry-after": "Mon, 16 Nov 2026 12:00:04 GMT" }), okFile) }) });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals(w.slept, [4000]);
});
Deno.test("(E16.2) X-RateLimit-Reset only is waited", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(r429({ "x-ratelimit-reset": "7", "x-ratelimit-remaining": "0" }), okFile) }) });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals(w.slept, [7000]);
  assert(w.logged[0].endsWith("wait 7 s, retry-after 7, reset 7, remaining 0)"), w.logged[0]);
});
Deno.test("(E16.2) no header: 2 quick retries (1.5 to 2.5 s, then 4 to 6 s), then stock_busy with retry_after_s 20", async () => {
  for (const [rand, waits] of [[0, [1500, 4000]], [0.9999999, [2499, 5999]]] as const) {
    const w = setup({ rand, routes: pixabayRoutes({ fileRoute: r429() }) });
    const r = await w.handle(post(pxPick()));
    assertEquals([r.status, await json(r)], [503, { error: "stock_busy", retry_after_s: 20 }]);
    assertEquals([downloads(w).length, w.slept], [3, waits]);
    assertEquals(w.logged.map((l) => l.match(/try \d of \d|wait [\d.]+ s/g)!.join(", ")),
      [`try 1 of 3, wait ${Math.round(waits[0] / 100) / 10} s`, `try 2 of 3, wait ${Math.round(waits[1] / 100) / 10} s`, "try 3 of 3, wait 0 s"]);
  }
});
Deno.test("(E16.2) a 502, 503 or 504 then success: one quick retry", async () => {
  for (const status of [502, 503, 504]) {
    const w = setup({ routes: pixabayRoutes({ fileRoute: seq(() => reply("x", status), okFile) }) });
    assertEquals((await w.handle(post(pxPick()))).status, 200, String(status));
    assertEquals([downloads(w).length, w.slept], [2, [2000]]);
  }
});
Deno.test("(E16.2) a 503 that stays is stock_unavailable (today's code), with no retry_after_s", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: () => reply("x", 503) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, await json(r), downloads(w).length], [502, { error: "stock_unavailable" }, 3]);
});
Deno.test("(E16.2) a network error then success: retried; only the error name is logged", async () => {
  const boom: Route = () => { throw new TypeError(`error sending request for url (https://pixabay.com/get/g1000_1280.png?key=${FAKE_PIXABAY})`); };
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(boom, okFile) }) });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals(w.logged, ["stock: pixabay download failed: TypeError (try 1 of 3, hop 0 pixabay.com, wait 2 s)"]);
  clean(w.logged);
});
Deno.test("(E16.2) another 4xx is not retried", async () => {
  for (const status of [400, 403, 404, 410]) {
    const w = setup({ routes: pixabayRoutes({ fileRoute: () => reply("x", status) }) });
    assertEquals((await json(await w.handle(post(pxPick())))).error, "stock_unavailable");
    assertEquals([downloads(w).length, w.slept, w.logged], [1, [], [`stock: pixabay download HTTP ${status}`]]);
  }
});
Deno.test("(E16.2) a lookup 429 is retried (the lookup only), then the download runs once", async () => {
  const w = setup({ routes: { "https://pixabay.com/api/?": seq(r429(), () => reply(lookupOk)), "https://pixabay.com/get/": okFile } });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals([lookups(w), downloads(w).length, w.slept], [2, 1, [2000]]);
  assert(w.logged[0].startsWith("stock: pixabay lookup HTTP 429 (try 1 of 3, hop 0 pixabay.com,"), w.logged[0]);
});
Deno.test("(E16.2) a lookup 429 with X-RateLimit-Reset 41 (the API window) is not waited: retry_after_s 41", async () => {
  const w = setup({ routes: { "https://pixabay.com/api/?": r429({ "x-ratelimit-reset": "41", "x-ratelimit-remaining": "0" }), "https://pixabay.com/get/": okFile } });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), lookups(w), downloads(w).length, w.slept], [{ error: "stock_busy", retry_after_s: 41 }, 1, 0, []]);
});
Deno.test("(E16.2) the 2 retries are shared by the pick: a lookup retry leaves 1 for the download", async () => {
  const w = setup({ routes: { "https://pixabay.com/api/?": seq(r429(), () => reply(lookupOk)), "https://pixabay.com/get/": r429() } });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), lookups(w), downloads(w).length, w.slept], [{ error: "stock_busy", retry_after_s: 20 }, 2, 2, [2000, 5000]]);
  assertEquals(w.logged.map((l) => l.match(/(lookup|download) HTTP 429 \(try \d of \d/)![0]),
    ["lookup HTTP 429 (try 1 of 3", "download HTTP 429 (try 1 of 2", "download HTTP 429 (try 2 of 2"]);
});
Deno.test("(E16.2) the 20 s wait budget: a second Retry-After of 12 s is not waited", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "retry-after": "12" }) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), downloads(w).length, w.slept], [{ error: "stock_busy", retry_after_s: 12 }, 2, [12000]]);
});
Deno.test("(E16.2) the 45 s deadline cuts a slow try: each try's timeout is the time left", async () => {
  const clock: Clock = { t: 0 };
  const slowLookup: Route = () => { clock.t += 30_000; return reply(lookupOk); };
  const w = setup({ clock, routes: { "https://pixabay.com/api/?": slowLookup, "https://pixabay.com/get/": seq(r429({ "retry-after": "3" }), okFile) } });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  // (E16.3) Retry-After 3 (was 1: under 2 s it is now no header, see the E16.3 tests below)
  assertEquals([w.timeouts, w.slept], [[10_000, 15_000, 12_000], [3000]]);
});
Deno.test("(E16.2) no wait is taken when it leaves no time for a try before the deadline", async () => {
  const clock: Clock = { t: 0 };
  const w = setup({ clock, routes: { "https://pixabay.com/api/?": () => { clock.t += 42_000; return reply(lookupOk); }, "https://pixabay.com/get/": r429() } });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), downloads(w).length, w.slept, w.releases], [{ error: "stock_busy", retry_after_s: 20 }, 1, [], [1]]);
  assert(w.logged[0].includes("try 1 of 3") && w.logged[0].includes("wait 0 s"), w.logged[0]);
});
Deno.test("(E16.2) no try starts with under 2 s left: stock_unavailable, released", async () => {
  const clock: Clock = { t: 0 };
  const w = setup({ clock, routes: { "https://pixabay.com/api/?": () => { clock.t += 44_000; return reply(lookupOk); }, "https://pixabay.com/get/": okFile } });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), downloads(w).length, w.releases, w.logged], [{ error: "stock_unavailable" }, 0, [1], ["stock: pixabay download deadline reached"]]);
});
Deno.test("(E16.2) D3: a redirect hop's 429 logs its hop, host, server, cf-mitigated, type and size; the retry starts at the same first link", async () => {
  const blocked: Route = () => new Response("<html>blocked</html>", { status: 429, headers: { server: "cloudflare", "cf-mitigated": "challenge", "content-type": "text/html; charset=UTF-8" } });
  const w = setup({ routes: {
    ...pixabayRoutes(),
    "https://pixabay.com/get/": () => new Response(null, { status: 302, headers: { location: "https://cdn.pixabay.com/photo/x_1280.jpg" } }),
    "https://cdn.pixabay.com/": seq(blocked, okFile),
  } });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals(w.calls.map((c) => new URL(c.url).host), ["pixabay.com", "pixabay.com", "cdn.pixabay.com", "pixabay.com", "cdn.pixabay.com"]);
  assertEquals(w.logged, ["stock: pixabay download HTTP 429 (try 1 of 3, hop 1 cdn.pixabay.com, server cloudflare, cf-mitigated challenge, type html, bytes 20, wait 2 s, retry-after -, reset -, remaining -)"]);
  for (const c of w.calls.slice(1)) assertEquals(c.init.headers, { "User-Agent": UA, "Accept": "image/jpeg, image/png" });
  clean(w.logged);
});
Deno.test("(E16.2) D3: the body size comes from Content-Length, or is counted up to 64 KB; the body is never logged", async () => {
  const declared = setup({ routes: pixabayRoutes({ fileRoute: seq(() => new Response("tiny", { status: 429, headers: { "content-length": "5120" } }), okFile) }) });
  await declared.handle(post(pxPick()));
  assert(declared.logged[0].includes("bytes 5120,"), declared.logged[0]);
  const big = setup({ routes: pixabayRoutes({ fileRoute: seq(() => new Response("secret body ".repeat(6000), { status: 429 }), okFile) }) });
  await big.handle(post(pxPick()));
  assert(big.logged[0].includes("bytes >65536,") && !big.logged[0].includes("secret"), big.logged[0]);
});
Deno.test("(E16.2) a key echoed in a header or an error never reaches a log line", async () => {
  const echo: Route = () => reply("x", 429, { server: `nginx ${FAKE_PIXABAY}`, "cf-mitigated": FAKE_UNSPLASH, "retry-after": "1" });
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(echo, okFile) }) });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  clean(w.logged);
  assert(w.logged[0].includes("server nginx [key], cf-mitigated [key]"), w.logged[0]);
});
Deno.test("(E16.2) the NicheInk User-Agent and Accept go on every Pixabay request: search, lookup, each download try", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: seq(r429(), okFile) }) });
  await w.handle(post(pxSearch()));
  await w.handle(post(pxPick()));
  assertEquals(w.calls.map((c) => (c.init.headers as Record<string, string>)["User-Agent"]), [UA, UA, UA, UA]);
  assertEquals(w.calls.map((c) => (c.init.headers as Record<string, string>)["Accept"]), ["application/json", "application/json", "image/jpeg, image/png", "image/jpeg, image/png"]);
});
Deno.test("(E16.2) searches and Unsplash are never retried", async () => {
  const px = setup({ routes: { "https://pixabay.com/api/": r429() } });
  assertEquals([(await json(await px.handle(post(pxSearch())))).error, px.calls.length, px.slept], ["stock_busy", 1, []]);
  const un = setup({ routes: { "https://api.unsplash.com/": () => { throw new TypeError("net"); } } });
  assertEquals([(await json(await un.handle(post(unPick())))).error, un.calls.length, un.slept], ["stock_unavailable", 1, []]);
});

/* ── E16.2: stock_release, after a reserved request fails ── */
Deno.test("(E16.2) release on stock_busy, stock_unavailable and server_error; the reply is unchanged", async () => {
  const cases: [unknown, Parameters<typeof setup>[0], string][] = [
    [pxPick(), { routes: pixabayRoutes({ fileRoute: r429() }) }, "stock_busy"],
    [pxPick(), { routes: { "https://pixabay.com/api/": () => reply("x", 500) } }, "stock_unavailable"],
    [pxPick(), { routes: pixabayRoutes({ fileRoute: () => reply("x", 403) }) }, "stock_unavailable"],
    [pxPick(), { failUpload: true, routes: pixabayRoutes() }, "server_error"],
    [pxPick(), { failInsert: true, routes: pixabayRoutes() }, "server_error"],
    [pxSearch(), { routes: { "https://pixabay.com/api/": () => reply("x", 500) } }, "stock_unavailable"],
    [pxSearch(), { routes: { "https://pixabay.com/api/": () => new Response("<html>", { status: 200 }) } }, "stock_unavailable"],
    [unSearch(), { routes: { "https://api.unsplash.com/": () => reply("x", 429) } }, "stock_busy"],
    [unPick(), { routes: unsplashRoutes({ ping: () => reply("x", 500) }) }, "stock_unavailable"],
    [unPick(), { failInsert: true, routes: unsplashRoutes() }, "server_error"],
  ];
  for (const [body, opts, code] of cases) {
    const w = setup(opts);
    const r = await w.handle(post(body));
    assertEquals([(await json(r)).error, w.releases], [code, [1]], `${JSON.stringify(body)} ${code}`);
  }
});
Deno.test("(E16.2) no release on success, too_large, bad_image, not_found, not_configured, a refusal or a cache hit", async () => {
  const big = () => new Response(new Uint8Array(4) as Uint8Array<ArrayBuffer>, { headers: { "content-length": "20000000" } });
  const cases: [unknown, Parameters<typeof setup>[0]][] = [
    [pxPick(), { routes: pixabayRoutes() }],
    [pxPick(), { routes: pixabayRoutes({ fileRoute: big }) }],
    [pxPick(), { routes: pixabayRoutes({ file: new TextEncoder().encode("GIF89a........") }) }],
    [pxPick(), { routes: pixabayRoutes({ lookup: { totalHits: 0, hits: [] } }) }],
    [unPick(), { routes: { "https://api.unsplash.com/photos/": () => reply("x", 401) } }],
    [pxPick(), { usage: { picks: 10 }, routes: pixabayRoutes() }],
    [unSearch(), { usage: { unsplash_all: 45 }, routes: unsplashRoutes() }],
    [pxSearch(), { routes: pixabayRoutes() }],
  ];
  for (const [body, opts] of cases) {
    const w = setup(opts);
    await (await w.handle(post(body))).body?.cancel();
    assertEquals(w.releases, [], JSON.stringify(body));
  }
  const w = setup({ routes: pixabayRoutes() });
  await w.handle(post(pxSearch()));
  await w.handle(post(pxSearch()));
  assertEquals([w.reserves.map((r) => r.provider_calls), w.releases], [[1, 0], []]);
});
Deno.test("(E16.2) a released pick gives its minute slot back: the next pick passes", async () => {
  const w = setup({ usage: { picks: 9 }, routes: pixabayRoutes({ fileRoute: seq(() => reply("x", 403), okFile) }) });
  assertEquals((await json(await w.handle(post(pxPick())))).error, "stock_unavailable");
  assertEquals([w.releases, w.db.pick], [[1], 9]);
  assertEquals((await w.handle(post(pxPick()))).status, 200);
});
Deno.test("(E16.2) a release that fails or is refused does not change the reply, and is logged without a message", async () => {
  const f = setup({ failRelease: true, routes: pixabayRoutes({ fileRoute: r429({ "retry-after": "60" }) }) });
  assertEquals(await json(await f.handle(post(pxPick()))), { error: "stock_busy", retry_after_s: 60 });
  assertEquals(f.logged.at(-1), "stock: release failed: PGRST301");
  const n = setup({ releaseAnswer: false, routes: pixabayRoutes({ fileRoute: () => reply("x", 403) }) });
  assertEquals((await json(await n.handle(post(pxPick())))).error, "stock_unavailable");
  assertEquals(n.logged.at(-1), "stock: release refused");
});

/* ── E16.3: a provider wait under 2 s counts as no header (live, Nov 20: Cloudflare's 429 with "Retry-After: 0", 3 times) ── */
const LIVE_429 = (h: Record<string, string>): Route => () =>
  new Response("Too Many Requests", { status: 429, headers: { server: "cloudflare", "content-type": "text/plain; charset=UTF-8", ...h } });
Deno.test("(E16.3) Retry-After \"0\" on every try: the quick backoff (1.5 to 2.5 s, then 4 to 6 s), then stock_busy with retry_after_s 20; the log keeps retry-after 0", async () => {
  for (const [rand, waits] of [[0, [1500, 4000]], [0.5, [2000, 5000]], [0.9999999, [2499, 5999]]] as const) {
    const w = setup({ rand, routes: pixabayRoutes({ fileRoute: LIVE_429({ "retry-after": "0" }) }) });
    const r = await w.handle(post(pxPick()));
    assertEquals([r.status, await json(r)], [503, { error: "stock_busy", retry_after_s: 20 }]);
    assertEquals([lookups(w), downloads(w).length, w.slept, w.releases], [1, 3, waits, [1]]);
    assertEquals(w.logged.length, 3);
    for (const l of w.logged) assert(l.includes("server cloudflare, cf-mitigated -, type text, bytes 17,") && l.includes("retry-after 0, reset -"), l);
    clean(w.logged);
  }
});
Deno.test("(E16.3) X-RateLimit-Reset \"0\" (no Retry-After): the same as no header", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "x-ratelimit-reset": "0" }) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), downloads(w).length, w.slept], [{ error: "stock_busy", retry_after_s: 20 }, 3, [2000, 5000]]);
  assert(w.logged[0].includes("retry-after 0, reset 0,"), w.logged[0]);
});
Deno.test("(E16.3) Retry-After \"1\" and \"1.5\": under 2 s, the same as no header", async () => {
  for (const ra of ["1", "1.5", " 0 "]) {
    const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "retry-after": ra }) }) });
    const r = await w.handle(post(pxPick()));
    assertEquals([await json(r), w.slept], [{ error: "stock_busy", retry_after_s: 20 }, [2000, 5000]], ra);
  }
});
Deno.test("(E16.3) a Retry-After HTTP-date 1 s ahead (under 2 s): the same as no header", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "retry-after": "Mon, 16 Nov 2026 12:00:01 GMT" }) }) });
  assertEquals([await json(await w.handle(post(pxPick()))), w.slept], [{ error: "stock_busy", retry_after_s: 20 }, [2000, 5000]]);
});
Deno.test("(E16.3) Retry-After \"2\" is a header: waits 2 s and 2 s, then stock_busy with retry_after_s 2", async () => {
  const w = setup({ routes: pixabayRoutes({ fileRoute: r429({ "retry-after": "2" }) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([await json(r), downloads(w).length, w.slept], [{ error: "stock_busy", retry_after_s: 2 }, 3, [2000, 2000]]);
  assert(w.logged[0].includes("wait 2 s, retry-after 2,"), w.logged[0]);
});
Deno.test("(E16.3) Retry-After \"0\" once, then the file: one backoff of 1.5 s or more, the picture stored, not released", async () => {
  const w = setup({ rand: 0, routes: pixabayRoutes({ fileRoute: seq(LIVE_429({ "retry-after": "0" }), okFile) }) });
  const r = await w.handle(post(pxPick()));
  assertEquals([r.status, downloads(w).length, w.slept, w.releases, w.inserted.length], [200, 2, [1500], [], 1]);
  assertEquals(w.logged, ["stock: pixabay download HTTP 429 (try 1 of 3, hop 0 pixabay.com, server cloudflare, cf-mitigated -, type text, bytes 17, wait 1.5 s, retry-after 0, reset -, remaining -)"]);
});
Deno.test("(E16.3) a lookup 429 with Retry-After 0: retried after the backoff, then the download runs once", async () => {
  const w = setup({ routes: { "https://pixabay.com/api/?": seq(r429({ "retry-after": "0" }), () => reply(lookupOk)), "https://pixabay.com/get/": okFile } });
  assertEquals((await w.handle(post(pxPick()))).status, 200);
  assertEquals([lookups(w), downloads(w).length, w.slept], [2, 1, [2000]]);
});
