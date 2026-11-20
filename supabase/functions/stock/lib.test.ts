// stock lib tests: input checks, provider URLs, hosts, names, sizes, the normalized results,
// the cached answer check, the pick helpers, the picture header reader and the error map;
// E16.2: the limits are no longer in TypeScript, the Pixabay headers, the retry rules (header
// waits, backoff, retry_after_s), the D3 log line and the stock_reserve answer.
// deno test --allow-read=supabase/functions supabase/functions/stock/  (from the repo root)
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import * as L from "./lib.ts";
import { ALLOWED_ORIGINS as GENERATE_ORIGINS } from "../generate/lib/limits.ts";
import { jpeg, pixabayAnswer, pixabayHit, png, unsplashAnswer, unsplashPhoto } from "./test_fakes.ts";

const P = (o: Record<string, unknown> = {}) => JSON.stringify({ action: "search", source: "pixabay", q: "leaf", ...o });
const U = (o: Record<string, unknown> = {}) => JSON.stringify({ action: "search", source: "unsplash", q: "sea", ...o });
const PICK = (o: Record<string, unknown> = {}) => JSON.stringify({ action: "pick", source: "pixabay", id: "1000", ...o });

/* ── CORS ── */
Deno.test("the CORS list is the same as generate's", () => {
  assertEquals(L.ALLOWED_ORIGINS, GENERATE_ORIGINS);
});
Deno.test("corsHeaders: allow-origin only for a listed origin", () => {
  assertEquals(L.corsHeaders("https://nicheink.com")["Access-Control-Allow-Origin"], "https://nicheink.com");
  assertEquals(L.corsHeaders("https://evil.example")["Access-Control-Allow-Origin"], undefined);
  assertEquals(L.corsHeaders(null)["Access-Control-Allow-Origin"], undefined);
  assertEquals(L.corsHeaders(null)["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

/* ── parseInput: search ── */
Deno.test("search: Pixabay defaults (any type and color, no Editors' Choice, safe search on, page 1)", () => {
  assertEquals(L.parseInput(P()), { action: "search", source: "pixabay", q: "leaf", page: 1, filters: { type: "all", color: "any", editors: false, safe: true } });
});
Deno.test("search: Unsplash defaults (any color)", () => {
  assertEquals(L.parseInput(U({ page: 3 })), { action: "search", source: "unsplash", q: "sea", page: 3, filters: { color: "any" } });
});
Deno.test("search: Pixabay filters are kept", () => {
  const i = L.parseInput(P({ filters: { type: "vector", color: "transparent", editors: true, safe: false } }));
  assertEquals(i && i.action === "search" ? i.filters : null, { type: "vector", color: "transparent", editors: true, safe: false });
});
Deno.test("search: the words are trimmed and inner spaces folded", () => {
  const i = L.parseInput(P({ q: "  study \t  desk  " }));
  assertEquals(i && "q" in i ? i.q : null, "study desk");
});
Deno.test("search: 100 characters pass, 101 do not (counted as characters, not bytes)", () => {
  assert(L.parseInput(P({ q: "é".repeat(100) })));
  assert(L.parseInput(P({ q: "😀".repeat(100) })));
  assertEquals(L.parseInput(P({ q: "a".repeat(101) })), null);
});
Deno.test("search: tabs and line breaks fold into one space", () => {
  const i = L.parseInput(P({ q: "study\n\ndesk" }));
  assertEquals(i && "q" in i ? i.q : null, "study desk");
});
Deno.test("search: empty, blank, control characters and non-strings are refused", () => {
  for (const q of ["", "   ", " \n\t ", "a\u0000b", "a\u0007b", "a\u0085b", 5, null, ["a"]]) assertEquals(L.parseInput(P({ q })), null, String(q));
});
Deno.test("search: page 1 to 20, whole numbers only", () => {
  for (const page of [1, 20]) assert(L.parseInput(P({ page })), String(page));
  for (const page of [0, 21, 1.5, "2", -1, null]) assertEquals(L.parseInput(P({ page })), null, String(page));
});
Deno.test("search: unknown keys are refused (top level and filters)", () => {
  assertEquals(L.parseInput(P({ url: "https://evil.example/x.jpg" })), null);
  assertEquals(L.parseInput(P({ filters: { type: "all", order: "latest" } })), null);
  assertEquals(L.parseInput(U({ filters: { color: "blue", content_filter: "low" } })), null);
});
Deno.test("search: bad filter values are refused", () => {
  for (const f of [{ type: "photos" }, { color: "teal" }, { editors: "yes" }, { safe: 1 }, []]) assertEquals(L.parseInput(P({ filters: f })), null, JSON.stringify(f));
  for (const f of [{ color: "transparent" }, { color: "gray" }, "blue"]) assertEquals(L.parseInput(U({ filters: f })), null, JSON.stringify(f));
});
Deno.test("search: every listed color passes for its source", () => {
  for (const color of L.PIXABAY_COLORS) assert(L.parseInput(P({ filters: { color } })), color);
  for (const color of L.UNSPLASH_COLORS) assert(L.parseInput(U({ filters: { color } })), color);
});

/* ── parseInput: pick and the rest ── */
Deno.test("pick: Pixabay id as a string or a number; bookId lower-cased", () => {
  assertEquals(L.parseInput(PICK()), { action: "pick", source: "pixabay", id: "1000", bookId: null });
  assertEquals(L.parseInput(PICK({ id: 1000, bookId: "B0000000-0000-4000-8000-000000000001" })), { action: "pick", source: "pixabay", id: "1000", bookId: "b0000000-0000-4000-8000-000000000001" });
});
Deno.test("pick: bad ids, bad book ids and extra keys are refused", () => {
  for (const id of ["0", "01", "abc", "1".repeat(13), 1.5, -3, "", null]) assertEquals(L.parseInput(PICK({ id })), null, String(id));
  for (const id of ["a/b", "a b", "x".repeat(41), "..%2f"]) assertEquals(L.parseInput(PICK({ source: "unsplash", id })), null, id);
  assert(L.parseInput(PICK({ source: "unsplash", id: "Abc-12_x" })));
  assertEquals(L.parseInput(PICK({ bookId: "nope" })), null);
  assertEquals(L.parseInput(PICK({ url: "https://pixabay.com/get/x.jpg" })), null);
});
Deno.test("not JSON, not an object, an unknown action or source is refused", () => {
  for (const raw of ["{", "[]", "null", "1", JSON.stringify({ action: "search", source: "google", q: "a" }), JSON.stringify({ action: "download", source: "pixabay", id: "1" }), JSON.stringify({ source: "pixabay", q: "a" })]) {
    assertEquals(L.parseInput(raw), null, raw);
  }
});
Deno.test("(0032) the limits live in SQL only: no limit or budget in lib.ts", () => {
  for (const name of ["SEARCHES_PER_MINUTE", "PICKS_PER_MINUTE", "UNSPLASH_HOURLY_DEFAULT", "unsplashBudget"]) assert(!(name in L), name);
});

/* ── Cache key ── */
Deno.test("cacheKey: sha256 hex; the same for the same search in any letter case", async () => {
  const a = L.parseInput(P({ q: "Green Leaf" })) as L.SearchInput, b = L.parseInput(P({ q: "green leaf" })) as L.SearchInput;
  const k = await L.cacheKey(a);
  assertMatch(k, /^[0-9a-f]{64}$/);
  assertEquals(k, await L.cacheKey(b));
});
Deno.test("cacheKey: differs by source, page and each filter", async () => {
  const base = await L.cacheKey(L.parseInput(P()) as L.SearchInput);
  const others = [U({ q: "leaf" }), P({ page: 2 }), P({ filters: { type: "photo" } }), P({ filters: { color: "transparent" } }), P({ filters: { editors: true } }), P({ filters: { safe: false } })];
  const keys = await Promise.all(others.map((r) => L.cacheKey(L.parseInput(r) as L.SearchInput)));
  for (const k of keys) assertNotEquals(k, base);
  assertEquals(new Set(keys).size, keys.length);
});

/* ── Provider URLs ── */
Deno.test("pixabaySearchUrl: key, words, page, 24 a page, safe search, only the filters set", () => {
  const u = new URL(L.pixabaySearchUrl("K", L.parseInput(P({ q: "study desk & lamp", page: 2 })) as Extract<L.SearchInput, { source: "pixabay" }>));
  assertEquals(u.origin + u.pathname, "https://pixabay.com/api/");
  assertEquals(Object.fromEntries(u.searchParams), { key: "K", q: "study desk & lamp", page: "2", per_page: "24", safesearch: "true" });
  const f = new URL(L.pixabaySearchUrl("K", L.parseInput(P({ filters: { type: "vector", color: "transparent", editors: true, safe: false } })) as Extract<L.SearchInput, { source: "pixabay" }>));
  assertEquals([f.searchParams.get("image_type"), f.searchParams.get("colors"), f.searchParams.get("editors_choice"), f.searchParams.get("safesearch")], ["vector", "transparent", "true", "false"]);
});
Deno.test("pixabayLookupUrl: by id only", () => {
  assertEquals(Object.fromEntries(new URL(L.pixabayLookupUrl("K", "1000")).searchParams), { key: "K", id: "1000" });
});
Deno.test("unsplashSearchUrl: content_filter=high always, no key in the URL", () => {
  const u = new URL(L.unsplashSearchUrl(L.parseInput(U({ filters: { color: "black_and_white" } })) as Extract<L.SearchInput, { source: "unsplash" }>));
  assertEquals(u.origin + u.pathname, "https://api.unsplash.com/search/photos");
  assertEquals(Object.fromEntries(u.searchParams), { query: "sea", page: "1", per_page: "24", content_filter: "high", color: "black_and_white" });
  assertEquals(new URL(L.unsplashSearchUrl(L.parseInput(U()) as Extract<L.SearchInput, { source: "unsplash" }>)).searchParams.has("color"), false);
  assertEquals(L.unsplashHeaders("K"), { "Authorization": "Client-ID K", "Accept-Version": "v1" });
  assertEquals(L.unsplashPhotoUrl("Abc-1"), "https://api.unsplash.com/photos/Abc-1");
});

/* ── Hosts ── */
Deno.test("safeUrl: https on a listed host only", () => {
  assertEquals(L.safeUrl("https://images.unsplash.com/photo-1?ixid=a", L.HOSTS.unsplashImage), "https://images.unsplash.com/photo-1?ixid=a");
  for (const u of ["http://images.unsplash.com/x", "https://evil.example/x", "https://images.unsplash.com.evil.example/x", "https://a:b@images.unsplash.com/x",
    "https://images.unsplash.com:444/x", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://images.unsplash.com/" + "x".repeat(1000), 5, null]) {
    assertEquals(L.safeUrl(u, L.HOSTS.unsplashImage), null, String(u).slice(0, 60));
  }
  assertEquals(L.safeUrl("https://cdn.pixabay.com/x.png", L.HOSTS.pixabayImage), "https://cdn.pixabay.com/x.png");
  assertEquals(L.safeUrl("https://cdn.pixabay.com/x", L.HOSTS.pixabayPage), null);
});

/* ── Names ── */
Deno.test("cleanName: control characters out, spaces folded, 200 characters at most, fallback when empty", () => {
  assertEquals(L.cleanName(" a\u0000b\n\tc  d ", "F"), "a b c d");
  assertEquals([...L.cleanName("é".repeat(250), "F")].length, 200);
  assertEquals(L.cleanName("  ", "F"), "F");
  assertEquals(L.cleanName(null, "F"), "F");
});
Deno.test("pixabayName: the first tag; unsplashName: alt text, then description, then a plain name", () => {
  assertEquals(L.pixabayName("green leaf, nature, plant"), "green leaf");
  assertEquals(L.pixabayName(""), "Pixabay picture");
  assertEquals(L.unsplashName({ alt_description: "a calm sea", description: "x" }), "a calm sea");
  assertEquals(L.unsplashName({ alt_description: null, description: "Sea" }), "Sea");
  assertEquals(L.unsplashName({}), "Unsplash photo");
});
Deno.test("pixabayUserUrl: pixabay.com/users/<slug>-<id>/", () => {
  assertEquals(L.pixabayUserUrl("Ann Lee", 42), "https://pixabay.com/users/ann-lee-42/");
  assertEquals(L.pixabayUserUrl("Ann", "x"), null);
  assertEquals(L.pixabayUserUrl(5, 42), null);
});

/* ── Sizes ── */
Deno.test("fitLong: the long side down to the limit, never up", () => {
  assertEquals(L.fitLong(2400, 1600, 1280), { width: 1280, height: 853 });
  assertEquals(L.fitLong(1600, 2400, 1280), { width: 853, height: 1280 });
  assertEquals(L.fitLong(800, 600, 1280), { width: 800, height: 600 });
});
Deno.test("pixabayFiles without full access: the 1,280 px file only", () => {
  const f = L.pixabayFiles(pixabayHit(1, { imageURL: "https://pixabay.com/get/orig.jpg", fullHDURL: "https://pixabay.com/get/hd.jpg" }), false);
  assertEquals(f.map((x) => [x.kind, x.width, x.height]), [["large", 1280, 853]]);
});
Deno.test("pixabayFiles with full access: the original when it fits 10 MB and 12,000 px, then Full HD, then 1,280", () => {
  const hit = pixabayHit(1, { imageURL: "https://pixabay.com/get/orig.jpg", fullHDURL: "https://pixabay.com/get/hd.jpg", imageWidth: 6000, imageHeight: 4000, imageSize: 9_000_000 });
  assertEquals(L.pixabayFiles(hit, true).map((x) => [x.kind, x.width, x.height]), [["original", 6000, 4000], ["fullhd", 1920, 1280], ["large", 1280, 853]]);
  const big = { ...hit, imageSize: 10_485_761 };
  assertEquals(L.pixabayFiles(big, true).map((x) => x.kind), ["fullhd", "large"]);
  const huge = { ...hit, imageWidth: 13000, imageHeight: 4000 };
  assertEquals(L.pixabayFiles(huge, true)[0].kind, "fullhd");
  const offHost = { ...hit, imageURL: "https://evil.example/orig.jpg" };
  assertEquals(L.pixabayFiles(offHost, true)[0].kind, "fullhd");
  assertEquals(L.pixabayFiles({ ...hit, imageWidth: 0 }, true), []);
});
Deno.test("unsplashRemote: up to 12,000 px unchanged; larger gets w= or h= 12000", () => {
  assertEquals(L.unsplashRemote("https://images.unsplash.com/p?ixid=a", 6000, 4000), { url: "https://images.unsplash.com/p?ixid=a", width: 6000, height: 4000 });
  assertEquals(L.unsplashRemote("https://images.unsplash.com/p?ixid=a", 15000, 10000), { url: "https://images.unsplash.com/p?ixid=a&w=12000", width: 12000, height: 8000 });
  assertEquals(L.unsplashRemote("https://images.unsplash.com/p", 9000, 13500), { url: "https://images.unsplash.com/p?h=12000", width: 8000, height: 12000 });
});

/* ── Results ── */
Deno.test("pixabayResult: the normalized shape, with the size the pick will store", () => {
  assertEquals(L.pixabayResult(pixabayHit(7), true, false), {
    id: "7", source: "pixabay", name: "green leaf", thumb: "https://pixabay.com/get/g7_640.png", preview: "https://pixabay.com/get/g7_1280.png",
    width: 1280, height: 853, type: "vector", transparent: true, author: "Ann Lee", authorUrl: "https://pixabay.com/users/ann-lee-42/",
    pageUrl: "https://pixabay.com/illustrations/leaf-7/",
  });
  assertEquals(L.pixabayResult(pixabayHit(7, { type: "illustration" }), false, false)?.type, "illustration");
  assertEquals(L.pixabayResult(pixabayHit(7, { type: "photo" }), false, false)?.type, "photo");
});
Deno.test("pixabayResult: a missing or off-host piece drops the hit", () => {
  for (const over of [{ pageURL: "https://evil.example/x" }, { webformatURL: "https://evil.example/x.png" }, { largeImageURL: null }, { user: null }, { id: "7" }, { imageWidth: "2400" }]) {
    assertEquals(L.pixabayResult(pixabayHit(7, over), false, false), null, JSON.stringify(over));
  }
});
Deno.test("unsplashResult: the normalized shape; off-host or missing pieces drop it", () => {
  assertEquals(L.unsplashResult(unsplashPhoto("Ab1")), {
    id: "Ab1", source: "unsplash", name: "a calm sea at dusk", thumb: "https://images.unsplash.com/photo-Ab1?w=400", preview: "https://images.unsplash.com/photo-Ab1?w=1080",
    width: 6000, height: 4000, type: "photo", transparent: false, author: "Bo Kim", authorUrl: "https://unsplash.com/@bokim", pageUrl: "https://unsplash.com/photos/Ab1",
  });
  assertEquals(L.unsplashResult(unsplashPhoto("Ab1", { width: 15000, height: 10000 }))?.width, 12000);
  for (const over of [{ urls: { raw: "https://evil.example/x", small: "https://images.unsplash.com/s", regular: "https://images.unsplash.com/r" } }, { links: { html: "https://evil.example" } }, { user: { name: "x" } }, { id: "a/b" }]) {
    assertEquals(L.unsplashResult(unsplashPhoto("Ab1", over)), null, JSON.stringify(over));
  }
});
Deno.test("normalizeSearch: 24 results at most, total capped at 480, bad hits dropped", () => {
  const i = L.parseInput(P()) as L.SearchInput;
  const body = pixabayAnswer(30, 500);
  (body.hits as Record<string, unknown>[])[0].pageURL = "https://evil.example/x";
  const r = L.normalizeSearch(i, body, false)!;
  assertEquals([r.results.length, r.total, r.perPage, r.page, r.source, r.q], [23, 480, 24, 1, "pixabay", "leaf"]);
  const u = L.normalizeSearch(L.parseInput(U()) as L.SearchInput, unsplashAnswer(3, 7), false)!;
  assertEquals([u.results.length, u.total], [3, 7]);
});
Deno.test("normalizeSearch: an answer that is not one is null", () => {
  const i = L.parseInput(P()) as L.SearchInput;
  for (const b of [null, [], { hits: "x", totalHits: 1 }, { hits: [] }, { results: [], total: 1 }]) assertEquals(L.normalizeSearch(i, b, false), null, JSON.stringify(b));
  assertEquals(L.normalizeSearch(i, { hits: [], totalHits: 0 }, false)?.results, []);
});
Deno.test("normalizeSearch: transparent is set from the No background filter (Pixabay)", () => {
  const i = L.parseInput(P({ filters: { color: "transparent" } })) as L.SearchInput;
  assert(L.normalizeSearch(i, pixabayAnswer(2), false)!.results.every((r) => r.transparent));
  assert(L.normalizeSearch(L.parseInput(P()) as L.SearchInput, pixabayAnswer(2), false)!.results.every((r) => !r.transparent));
});

/* ── Cached answers ── */
Deno.test("checkCached: a stored answer reads back the same", () => {
  const i = L.parseInput(P()) as L.SearchInput;
  const r = L.normalizeSearch(i, pixabayAnswer(5), false)!;
  assertEquals(L.checkCached(i, JSON.parse(JSON.stringify(r))), r);
});
Deno.test("checkCached: another source or page, an off-host link, too many results or a bad field → not used", () => {
  const i = L.parseInput(P()) as L.SearchInput;
  const r = L.normalizeSearch(i, pixabayAnswer(5), false)!;
  // deno-lint-ignore no-explicit-any
  const bad = (f: (x: any) => void) => { const c = JSON.parse(JSON.stringify(r)); f(c); return L.checkCached(i, c); };
  assertEquals(bad((c) => { c.page = 2; }), null);
  assertEquals(bad((c) => { c.source = "unsplash"; }), null);
  assertEquals(bad((c) => { c.results[0].thumb = "https://evil.example/x.png"; }), null);
  assertEquals(bad((c) => { c.results[0].preview = "javascript:alert(1)"; }), null);
  assertEquals(bad((c) => { c.results[0].authorUrl = "https://evil.example/"; }), null);
  assertEquals(bad((c) => { c.results[0].width = 13000; }), null);
  assertEquals(bad((c) => { c.results[0].type = "gif"; }), null);
  assertEquals(bad((c) => { c.results[0].id = "x"; }), null);
  assertEquals(bad((c) => { c.total = 9999; }), null);
  assertEquals(bad((c) => { c.results = Array(25).fill(c.results[0]); }), null);
  assertEquals(L.checkCached(i, "x"), null);
});
Deno.test("checkCached: names and authors are cleaned again", () => {
  const i = L.parseInput(P()) as L.SearchInput;
  const r = JSON.parse(JSON.stringify(L.normalizeSearch(i, pixabayAnswer(1), false)!));
  r.results[0].name = "a\u0000<b>"; r.results[0].author = "";
  const c = L.checkCached(i, r)!;
  assertEquals([c.results[0].name, c.results[0].author], ["a <b>", "Unknown"]);
});

/* ── Pick helpers ── */
Deno.test("pixabayHit and pixabayCredit", () => {
  const hit = L.pixabayHit({ totalHits: 1, hits: [pixabayHit(1000)] }, "1000")!;
  assertEquals(L.pixabayCredit(hit), { id: 1000, author: "Ann Lee", authorUrl: "https://pixabay.com/users/ann-lee-42/", pageUrl: "https://pixabay.com/illustrations/leaf-1000/" });
  assertEquals(L.pixabayHit({ totalHits: 0, hits: [] }, "1000"), null);
  assertEquals(L.pixabayHit({ totalHits: 1, hits: [pixabayHit(2000)] }, "1000"), null);
  assertEquals(L.pixabayCredit(pixabayHit(1, { pageURL: "https://evil.example/" })), null);
});
Deno.test("unsplashPick: the hotlink, size, name, credit and the ping URL", () => {
  assertEquals(L.unsplashPick(unsplashPhoto("Ab1"), "Ab1"), {
    remote: { url: "https://images.unsplash.com/photo-Ab1?ixid=abc", width: 6000, height: 4000 }, width: 6000, height: 4000, name: "a calm sea at dusk",
    credit: { id: "Ab1", author: "Bo Kim", authorUrl: "https://unsplash.com/@bokim", pageUrl: "https://unsplash.com/photos/Ab1" },
    ping: "https://api.unsplash.com/photos/Ab1/download?ixid=abc",
  });
});
Deno.test("unsplashPick: another id, an off-host raw or ping, or a missing credit → null", () => {
  assertEquals(L.unsplashPick(unsplashPhoto("Ab1"), "Ab2"), null);
  assertEquals(L.unsplashPick(unsplashPhoto("Ab1", { links: { html: "https://unsplash.com/photos/Ab1", download_location: "https://evil.example/ping" } }), "Ab1"), null);
  assertEquals(L.unsplashPick(unsplashPhoto("Ab1", { urls: { raw: "https://evil.example/raw" } }), "Ab1"), null);
  assertEquals(L.unsplashPick(unsplashPhoto("Ab1", { user: { name: "Bo", links: {} } }), "Ab1"), null);
});

/* ── Picture header reader ── */
Deno.test("readImage: JPEG baseline and progressive, size from the frame header", () => {
  assertEquals(L.readImage(jpeg(1280, 853)), { mime: "image/jpeg", width: 1280, height: 853, transparent: false });
  assertEquals(L.readImage(jpeg(640, 4000, { progressive: true })), { mime: "image/jpeg", width: 640, height: 4000, transparent: false });
});
Deno.test("readImage: PNG size and transparency (alpha channel or tRNS)", () => {
  assertEquals(L.readImage(png(1280, 1280, 6)), { mime: "image/png", width: 1280, height: 1280, transparent: true });
  assertEquals(L.readImage(png(300, 200, 4))?.transparent, true);
  assertEquals(L.readImage(png(300, 200, 2))?.transparent, false);
  assertEquals(L.readImage(png(300, 200, 3, true))?.transparent, true);
  assertEquals(L.readImage(png(70000, 200, 2))?.width, 70000);
});
Deno.test("readImage: GIF, WebP, SVG, cut-off files and empty bytes → null", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  for (const b of [enc("GIF89a............"), enc("RIFF....WEBPVP8 ...."), enc("<svg xmlns='http://www.w3.org/2000/svg'/>"), new Uint8Array(0),
    jpeg(10, 10).slice(0, 12), png(10, 10, 2).slice(0, 20), new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])]) {
    assertEquals(L.readImage(b), null);
  }
});
Deno.test("assetPath and extFor follow 0030's path rule", () => {
  assertEquals(L.assetPath("u", "i", "image/png"), "u/assets/i.png");
  assertEquals(L.assetPath("u", "i", "image/jpeg"), "u/assets/i.jpg");
});

/* ── Errors ── */
Deno.test("providerError: 429 and an Unsplash 403 with no calls left are busy; 401 not configured; 404 not found", () => {
  assertEquals([L.providerError(429, null), L.providerError(403, "0"), L.providerError(403, null), L.providerError(401, null), L.providerError(404, null), L.providerError(500, null)],
    ["stock_busy", "stock_busy", "stock_unavailable", "not_configured", "not_found", "stock_unavailable"]);
});
Deno.test("the error codes and their statuses", () => {
  assertEquals(L.ERROR_STATUS, { bad_request: 400, unauthorized: 401, not_found: 404, method_not_allowed: 405, too_large: 422, bad_image: 422, rate_limited: 429,
    server_error: 500, stock_unavailable: 502, not_configured: 503, stock_busy: 503 });
});
Deno.test("the caps match 0030 and 0031", () => {
  assertEquals([L.MAX_FILE_BYTES, L.MAX_SIDE, L.NAME_MAX, L.CREDIT_MAX_BYTES, L.MAX_BODY_BYTES, L.PER_PAGE * L.MAX_PAGE], [10485760, 12000, 200, 2000, 2048, 480]);
});

/* ── E16.2: Pixabay headers (D1) ── */
Deno.test("pixabayHeaders: the NicheInk User-Agent (no personal data) and an Accept per kind", () => {
  assertEquals(L.PIXABAY_UA, "NicheInk-stock/2 (+https://nicheink.com)");
  assertEquals(L.pixabayHeaders("json"), { "User-Agent": L.PIXABAY_UA, "Accept": "application/json" });
  assertEquals(L.pixabayHeaders("image"), { "User-Agent": L.PIXABAY_UA, "Accept": "image/jpeg, image/png" });
});

/* ── E16.2: the retry rules (STOP 1 inputs) ── */
Deno.test("the pick budget: 2 retries, 20 s of waiting, a 45 s deadline; retried statuses", () => {
  assertEquals([L.PICK_RETRIES, L.PICK_WAIT_MS, L.PICK_DEADLINE_MS, L.BUSY_RETRY_DEFAULT_S, L.RETRY_AFTER_MAX_S], [2, 20_000, 45_000, 20, 120]);
  assertEquals(L.RETRY_STATUSES, [429, 502, 503, 504]);
});
const H = (o: Record<string, string>) => new Headers(o);
const NOW = Date.parse("2026-11-16T12:00:00Z");
Deno.test("retryAfterSeconds: Retry-After in seconds (whole or decimal)", () => {
  assertEquals([L.retryAfterSeconds(H({ "retry-after": "12" }), NOW), L.retryAfterSeconds(H({ "retry-after": " 0 " }), NOW), L.retryAfterSeconds(H({ "retry-after": "1.5" }), NOW)], [12, 0, 1.5]);
});
Deno.test("retryAfterSeconds: Retry-After as an HTTP-date, minus the clock, never below 0", () => {
  assertEquals(L.retryAfterSeconds(H({ "retry-after": "Mon, 16 Nov 2026 12:00:41 GMT" }), NOW), 41);
  assertEquals(L.retryAfterSeconds(H({ "retry-after": "Mon, 16 Nov 2026 11:59:00 GMT" }), NOW), 0);
});
Deno.test("retryAfterSeconds: X-RateLimit-Reset when there is no Retry-After (0 to 86,400)", () => {
  assertEquals(L.retryAfterSeconds(H({ "x-ratelimit-reset": "41" }), NOW), 41);
  assertEquals(L.retryAfterSeconds(H({ "retry-after": "soon", "x-ratelimit-reset": "7" }), NOW), 7);
  assertEquals(L.retryAfterSeconds(H({ "retry-after": "3", "x-ratelimit-reset": "41" }), NOW), 3);
  assertEquals(L.retryAfterSeconds(H({ "x-ratelimit-reset": "1800000000" }), NOW), null);
});
Deno.test("retryAfterSeconds: anything else is null", () => {
  for (const h of [{}, { "retry-after": "" }, { "retry-after": "-5" }, { "retry-after": "soon" }, { "x-ratelimit-reset": "x" }, { "x-ratelimit-reset": "-1" }] as Record<string, string>[]) {
    assertEquals(L.retryAfterSeconds(H(h), NOW), null, JSON.stringify(h));
  }
});
Deno.test("backoffMs: retry 1 waits 1.5 to 2.5 s, retry 2 waits 4 to 6 s (full jitter)", () => {
  assertEquals([L.backoffMs(1, 0), L.backoffMs(1, 0.5), L.backoffMs(1, 0.9999999)], [1500, 2000, 2499]);
  assertEquals([L.backoffMs(2, 0), L.backoffMs(2, 0.9999999)], [4000, 5999]);
  assertEquals([L.backoffMs(0, 0), L.backoffMs(9, 0), L.backoffMs(1, -1), L.backoffMs(1, 7)], [1500, 4000, 1500, 2499]);
  for (let i = 0; i < 200; i++) { const r = Math.random(); const a = L.backoffMs(1, r), b = L.backoffMs(2, r); assert(a >= 1500 && a < 2500 && b >= 4000 && b < 6000); }
});
Deno.test("busyRetryAfter: the header rounded up, 1 to 120; 20 with no header", () => {
  assertEquals([L.busyRetryAfter(null), L.busyRetryAfter(0), L.busyRetryAfter(3.2), L.busyRetryAfter(41), L.busyRetryAfter(500)], [20, 1, 4, 41, 120]);
});

/* ── E16.2: the D3 log line ── */
Deno.test("logValue: at most 40 characters of [A-Za-z0-9 ._/-]; absent or empty is -", () => {
  assertEquals([L.logValue(null), L.logValue(""), L.logValue("cloudflare"), L.logValue("?&=:"), L.logValue("x".repeat(60)).length], ["-", "-", "cloudflare", "-", 40]);
  assertEquals(L.logValue("https://pixabay.com/get/a?key=k&x=1"), "https//pixabay.com/get/akeykx1");
});
Deno.test("bodyType: html, json, text, other or -", () => {
  assertEquals(["text/html; charset=utf-8", "application/json", "text/plain", "image/jpeg", null].map(L.bodyType), ["html", "json", "text", "other", "-"]);
});
Deno.test("failLine: an HTTP failure, every field, never a URL", () => {
  const f: L.FailInfo = { status: 429, hop: 1, host: "cdn.pixabay.com", bytes: "5120",
    headers: H({ server: "cloudflare", "cf-mitigated": "challenge", "content-type": "text/html", "retry-after": "41", "x-ratelimit-reset": "41", "x-ratelimit-remaining": "0" }) };
  assertEquals(L.failLine("download", f, 1, 3, 0, 41),
    "stock: pixabay download HTTP 429 (try 1 of 3, hop 1 cdn.pixabay.com, server cloudflare, cf-mitigated challenge, type html, bytes 5120, wait 0 s, retry-after 41, reset 41, remaining 0)");
  const bare: L.FailInfo = { status: 503, hop: 0, host: "pixabay.com", bytes: "-", headers: H({}) };
  assertEquals(L.failLine("lookup", bare, 2, 3, 4000, null),
    "stock: pixabay lookup HTTP 503 (try 2 of 3, hop 0 pixabay.com, server -, cf-mitigated -, type -, bytes -, wait 4 s, retry-after -, reset -, remaining -)");
  assertEquals(L.failLine("download", f, 1, 3, 1500, 0.4).includes("wait 1.5 s, retry-after 1,"), true);
});
Deno.test("failLine: a network error names the error only", () => {
  assertEquals(L.failLine("download", { status: null, errName: "TypeError", hop: 0, host: "pixabay.com", bytes: "-", headers: null }, 1, 3, 2000, null),
    "stock: pixabay download failed: TypeError (try 1 of 3, hop 0 pixabay.com, wait 2 s)");
});

/* ── E16.2: the stock_reserve answer ── */
Deno.test("parseReserve: a slot, a refusal, or null", () => {
  assertEquals(L.parseReserve({ ok: true, id: 7 }), { ok: true, id: 7 });
  assertEquals(L.parseReserve({ ok: false, code: "rate_limited" }), { ok: false, code: "rate_limited" });
  assertEquals(L.parseReserve({ ok: false, code: "stock_busy" }), { ok: false, code: "stock_busy" });
  for (const v of [null, undefined, "ok", [], {}, { ok: true }, { ok: true, id: "7" }, { ok: true, id: 0 }, { ok: true, id: -1 }, { ok: true, id: 1.5 },
    { ok: false }, { ok: false, code: "server_error" }, { ok: "true", id: 1 }]) assertEquals(L.parseReserve(v), null, JSON.stringify(v));
});
Deno.test("RELEASE_ON: busy, unavailable and server_error only", () => {
  assertEquals(L.RELEASE_ON, ["stock_busy", "stock_unavailable", "server_error"]);
});
