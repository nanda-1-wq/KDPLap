// stock handler tests: the whole flow with fakes (no network, no database, fake keys only).
// CORS, method, auth, input, not_configured per source, the per-user limits, the cache (hit, miss,
// poisoned, errors), provider errors, the Unsplash budget, the Pixabay pick (lookup by id, file
// choice, 10 MB cap, magic bytes, redirects, storage and row), the Unsplash pick (hotlink, ping),
// and the keys never leaving: not in a log line, not in a reply.
// deno test --allow-read=supabase/functions supabase/functions/stock/  (from the repo root)
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  BOOK, FAKE_PIXABAY, FAKE_UNSPLASH, file, jpeg, json, NEW_ID, ORIGIN, pixabayAnswer, pixabayHit, pixabayRoutes, png, post, pxSearch,
  reply, setup, unSearch, unsplashAnswer, unsplashPhoto, unsplashRoutes, USER,
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
    assertEquals([w.calls.length, w.logCalls.length], [0, 0]);
  }
});
Deno.test("bad input is 400, and nothing is called", async () => {
  for (const b of ["{", "[]", pxSearch({ q: "" }), pxSearch({ page: 21 }), pxSearch({ extra: 1 }), pxPick({ id: "x" }), pxPick({ url: "https://pixabay.com/get/x.jpg" })]) {
    const w = setup({ routes: pixabayRoutes() });
    const r = await w.handle(post(b));
    assertEquals([r.status, (await json(r)).error], [400, "bad_request"], JSON.stringify(b));
    assertEquals([w.calls.length, w.logCalls.length], [0, 0]);
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

/* ── Limits ── */
Deno.test("30 searches in the last minute is 429 rate_limited, nothing called", async () => {
  const w = setup({ usage: { searches: 30 }, routes: pixabayRoutes() });
  const r = await w.handle(post(pxSearch()));
  assertEquals([r.status, (await json(r)).error], [429, "rate_limited"]);
  assertEquals([w.calls.length, w.logCalls.length], [0, 0]);
  assertEquals((await setup({ usage: { searches: 29 }, routes: pixabayRoutes() }).handle(post(pxSearch()))).status, 200);
});
Deno.test("10 picks in the last minute is 429; searches do not count against picks", async () => {
  const w = setup({ usage: { picks: 10, searches: 0 }, routes: pixabayRoutes() });
  assertEquals((await json(await w.handle(post(pxPick())))).error, "rate_limited");
  assertEquals(w.calls.length, 0);
  assertEquals((await setup({ usage: { picks: 9, searches: 30 }, routes: pixabayRoutes() }).handle(post(pxPick()))).status, 200);
});
Deno.test("the Unsplash budget: 45 an hour by default, a search needs 1, a pick needs 2", async () => {
  const s = setup({ usage: { unsplash_hour: 45 }, routes: unsplashRoutes() });
  assertEquals((await json(await s.handle(post(unSearch())))).error, "stock_busy");
  assertEquals([s.calls.length, s.logCalls.length], [0, 0]);
  assertEquals((await setup({ usage: { unsplash_hour: 44 }, routes: unsplashRoutes() }).handle(post(unSearch()))).status, 200);
  const p = setup({ usage: { unsplash_hour: 44 }, routes: unsplashRoutes() });
  assertEquals((await json(await p.handle(post(unPick())))).error, "stock_busy");
  assertEquals(p.calls.length, 0);
  assertEquals((await setup({ usage: { unsplash_hour: 43 }, routes: unsplashRoutes() }).handle(post(unPick()))).status, 200);
  const env = setup({ usage: { unsplash_hour: 60 }, env: { STOCK_UNSPLASH_HOURLY: "4500" }, routes: unsplashRoutes() });
  assertEquals((await env.handle(post(unSearch()))).status, 200);
});
Deno.test("the Unsplash budget does not touch Pixabay", async () => {
  assertEquals((await setup({ usage: { unsplash_hour: 999 }, routes: pixabayRoutes() }).handle(post(pxSearch()))).status, 200);
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
  assertEquals(w.logCalls, [{ source: "pixabay", action: "search", provider_calls: 1 }]);
  assertEquals(w.calls.length, 1);
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
  assertEquals(w.logCalls.map((c) => c.provider_calls), [1, 0]);
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
Deno.test("a call that cannot be logged stops before the provider (fail closed)", async () => {
  const w = setup({ failLog: true, routes: pixabayRoutes() });
  const r = await w.handle(post(pxSearch()));
  assertEquals([r.status, (await json(r)).error, w.calls.length], [500, "server_error", 0]);
  const p = setup({ failLog: true, routes: unsplashRoutes() });
  assertEquals([(await p.handle(post(unPick()))).status, p.calls.length], [500, 0]);
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
  assert(!("headers" in w.calls[1].init) || !JSON.stringify(w.calls[1].init.headers).includes(FAKE_PIXABAY));
  assertEquals(w.uploads.map((u) => [u.path, u.mime, u.bytes.length]), [[`${USER}/assets/${NEW_ID}.jpg`, "image/jpeg", bytes.length]]);
  assertEquals(w.inserted, [{
    id: NEW_ID, source: "pixabay", mime: "image/jpeg", path: `${USER}/assets/${NEW_ID}.jpg`, remote: null, width: 1280, height: 853,
    bytes: bytes.length, transparent: false, origin_book_id: BOOK, name: "green leaf",
    credit: { id: 1000, author: "Ann Lee", authorUrl: "https://pixabay.com/users/ann-lee-42/", pageUrl: "https://pixabay.com/illustrations/leaf-1000/" },
  }]);
  assertEquals(b.asset.id, NEW_ID);
  assertEquals(w.logCalls, [{ source: "pixabay", action: "pick", provider_calls: 1 }]);
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
Deno.test("Pixabay pick: a download that fails or times out is stock_unavailable; a 429 is busy", async () => {
  const fail = setup({ routes: pixabayRoutes({ fileRoute: () => { throw new DOMException("x", "TimeoutError"); } }) });
  assertEquals((await json(await fail.handle(post(pxPick())))).error, "stock_unavailable");
  const busy = setup({ routes: pixabayRoutes({ fileRoute: () => reply("x", 429) }) });
  assertEquals((await json(await busy.handle(post(pxPick())))).error, "stock_busy");
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
  assertEquals(w.logCalls, [{ source: "unsplash", action: "pick", provider_calls: 2 }]);
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
