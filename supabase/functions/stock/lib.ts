/* ═══════════════════════════════════════════════════
   NicheInk — Edge Function "stock": pure rules (E16 Part 7, plan §7)
   supabase/functions/stock/lib.ts

   No network, no database, no env: input checks, provider URLs, the
   normalized result shape, the cache key, the picture header reader, names
   and credits. handler.ts runs the flow with injected dependencies.
   The file stands alone (no import from generate), so it deploys alone;
   lib.test.ts holds ALLOWED_ORIGINS equal to generate's.
═══════════════════════════════════════════════════ */

/* ── Limits ──────────────────────────────── */
export const MAX_BODY_BYTES = 2048;
export const PER_PAGE = 24;
export const MAX_PAGE = 20;              // Pixabay returns at most 500 hits a query: 20 × 24 = 480
export const MAX_TOTAL = MAX_PAGE * PER_PAGE;
export const Q_MAX = 100;
export const SEARCHES_PER_MINUTE = 30;
export const PICKS_PER_MINUTE = 10;
export const UNSPLASH_HOURLY_DEFAULT = 45; // the demo allows 50 an hour for the whole app (plan §7)
export const CACHE_MS = 24 * 3600_000;   // Pixabay: cache search answers for 24 hours
export const API_TIMEOUT_MS = 10_000;
export const DOWNLOAD_TIMEOUT_MS = 20_000;
/** The "covers" bucket's file size limit and 0030's cover_assets.bytes cap (10 MB). */
export const MAX_FILE_BYTES = 10_485_760;
/** 0030's cover_assets width and height cap. */
export const MAX_SIDE = 12_000;
export const PIXABAY_LARGE = 1280;       // largeImageURL, every key
export const PIXABAY_FULLHD = 1920;      // fullHDURL, full API access only
export const NAME_MAX = 200;             // 0031 cover_assets.name
export const CREDIT_MAX_BYTES = 2000;    // 0030 cover_assets credit check
export const URL_MAX = 1000;

export const SOURCES = ["pixabay", "unsplash"] as const;
export type Source = typeof SOURCES[number];

export const PIXABAY_TYPES = ["all", "photo", "illustration", "vector"] as const;
export const PIXABAY_COLORS = ["any", "transparent", "grayscale", "black", "white", "gray", "red", "orange", "yellow", "green",
  "turquoise", "blue", "lilac", "pink", "brown"] as const;
export const UNSPLASH_COLORS = ["any", "black_and_white", "black", "white", "yellow", "orange", "red", "purple", "magenta",
  "green", "teal", "blue"] as const;

/* ── Errors ──────────────────────────────── */
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  too_large: 422,
  bad_image: 422,
  rate_limited: 429,
  server_error: 500,
  stock_unavailable: 502,
  not_configured: 503,
  stock_busy: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

/* ── CORS (the same list as generate; lib.test.ts holds them equal) ── */
export const ALLOWED_ORIGINS = [
  "https://nicheink.com",
  "https://www.nicheink.com",
  "https://nanda-1-wq.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

/* ── Input ───────────────────────────────── */
export type PixabayFilters = { type: typeof PIXABAY_TYPES[number]; color: typeof PIXABAY_COLORS[number]; editors: boolean; safe: boolean };
export type UnsplashFilters = { color: typeof UNSPLASH_COLORS[number] };
export type SearchInput =
  | { action: "search"; source: "pixabay"; q: string; page: number; filters: PixabayFilters }
  | { action: "search"; source: "unsplash"; q: string; page: number; filters: UnsplashFilters };
export type PickInput = { action: "pick"; source: Source; id: string; bookId: string | null };
export type StockInput = SearchInput | PickInput;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIXABAY_ID_RE = /^[1-9][0-9]{0,11}$/;
const UNSPLASH_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
// deno-lint-ignore no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** The search words: white space (tabs and line breaks too) folded and trimmed, 1 to 100 characters, no other control characters. */
export function cleanQuery(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const q = v.replace(/\s+/g, " ").trim();
  if (CONTROL_RE.test(q)) return null;
  const n = [...q].length;
  return n >= 1 && n <= Q_MAX ? q : null;
}

function pixabayFilters(v: unknown): PixabayFilters | null {
  if (v === undefined) return { type: "all", color: "any", editors: false, safe: true };
  if (!isObj(v) || !onlyKeys(v, ["type", "color", "editors", "safe"])) return null;
  const f = { type: v.type ?? "all", color: v.color ?? "any", editors: v.editors ?? false, safe: v.safe ?? true };
  if (!oneOf(PIXABAY_TYPES, f.type) || !oneOf(PIXABAY_COLORS, f.color) || typeof f.editors !== "boolean" || typeof f.safe !== "boolean") return null;
  return f as PixabayFilters;
}
function unsplashFilters(v: unknown): UnsplashFilters | null {
  if (v === undefined) return { color: "any" };
  if (!isObj(v) || !onlyKeys(v, ["color"])) return null;
  const color = v.color ?? "any";
  return oneOf(UNSPLASH_COLORS, color) ? { color } : null;
}

/** The request body (already capped at 2 KB) → a checked input, or null. Unknown keys are refused. */
export function parseInput(raw: string): StockInput | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObj(v) || !oneOf(SOURCES, v.source)) return null;
  if (v.action === "search") {
    if (!onlyKeys(v, ["action", "source", "q", "page", "filters"])) return null;
    const q = cleanQuery(v.q);
    const page = "page" in v ? v.page : 1;
    if (q === null || typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null;
    if (v.source === "pixabay") {
      const filters = pixabayFilters(v.filters);
      return filters ? { action: "search", source: "pixabay", q, page, filters } : null;
    }
    const filters = unsplashFilters(v.filters);
    return filters ? { action: "search", source: "unsplash", q, page, filters } : null;
  }
  if (v.action === "pick") {
    if (!onlyKeys(v, ["action", "source", "id", "bookId"])) return null;
    const id = typeof v.id === "number" ? String(v.id) : v.id;
    if (typeof id !== "string" || !(v.source === "pixabay" ? PIXABAY_ID_RE : UNSPLASH_ID_RE).test(id)) return null;
    const bookId = v.bookId ?? null;
    if (bookId !== null && (typeof bookId !== "string" || !UUID_RE.test(bookId))) return null;
    return { action: "pick", source: v.source, id, bookId: bookId === null ? null : bookId.toLowerCase() };
  }
  return null;
}

/** The Unsplash hourly budget from env STOCK_UNSPLASH_HOURLY (1 to 5,000), else 45. */
export function unsplashBudget(v: string | undefined): number {
  const n = Number(v);
  return v && Number.isInteger(n) && n >= 1 && n <= 5000 ? n : UNSPLASH_HOURLY_DEFAULT;
}

/* ── Cache key ───────────────────────────── */
/** sha256 hex of source, query (lower case), filters (fixed order) and page: the stock_cache key. */
export async function cacheKey(i: SearchInput): Promise<string> {
  const f = i.source === "pixabay"
    ? [i.filters.type, i.filters.color, i.filters.editors, i.filters.safe]
    : [i.filters.color];
  const text = JSON.stringify(["v1", i.source, i.q.toLowerCase(), f, i.page]);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Provider URLs (the Pixabay key goes in the query: never log a URL) ── */
export const PIXABAY_API = "https://pixabay.com/api/";
export const UNSPLASH_API = "https://api.unsplash.com";

export function pixabaySearchUrl(key: string, i: Extract<SearchInput, { source: "pixabay" }>): string {
  const p = new URLSearchParams({ key, q: i.q, page: String(i.page), per_page: String(PER_PAGE) });
  if (i.filters.type !== "all") p.set("image_type", i.filters.type);
  if (i.filters.color !== "any") p.set("colors", i.filters.color);
  if (i.filters.editors) p.set("editors_choice", "true");
  p.set("safesearch", i.filters.safe ? "true" : "false");
  return `${PIXABAY_API}?${p}`;
}
export function pixabayLookupUrl(key: string, id: string): string {
  return `${PIXABAY_API}?${new URLSearchParams({ key, id })}`;
}
export function unsplashSearchUrl(i: Extract<SearchInput, { source: "unsplash" }>): string {
  const p = new URLSearchParams({ query: i.q, page: String(i.page), per_page: String(PER_PAGE), content_filter: "high" });
  if (i.filters.color !== "any") p.set("color", i.filters.color);
  return `${UNSPLASH_API}/search/photos?${p}`;
}
export function unsplashPhotoUrl(id: string): string {
  return `${UNSPLASH_API}/photos/${encodeURIComponent(id)}`;
}
export function unsplashHeaders(key: string): Record<string, string> {
  return { "Authorization": `Client-ID ${key}`, "Accept-Version": "v1" };
}

/* ── Hosts ───────────────────────────────── */
export const HOSTS = {
  pixabayImage: ["pixabay.com", "cdn.pixabay.com"],
  pixabayPage: ["pixabay.com"],
  unsplashImage: ["images.unsplash.com"],
  unsplashPage: ["unsplash.com"],
  unsplashApi: ["api.unsplash.com"],
};

/** An https URL on one of the hosts (no user or password, at most 1,000 characters), else null. */
export function safeUrl(v: unknown, hosts: string[]): string | null {
  if (typeof v !== "string" || v.length > URL_MAX) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !hosts.includes(u.hostname)) return null;
  return u.href;
}

/* ── Names and credits ───────────────────── */
/** Control characters out, spaces folded, trimmed, at most 200 characters; empty → fallback. */
export function cleanName(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  // deno-lint-ignore no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return fallback;
  const cps = [...s];
  return cps.length > NAME_MAX ? cps.slice(0, NAME_MAX).join("").trim() : s;
}
/** Pixabay tags "green leaf, nature, plant" → "green leaf". */
export function pixabayName(tags: unknown): string {
  return cleanName(typeof tags === "string" ? tags.split(",")[0] : "", "Pixabay picture");
}
export function unsplashName(p: Record<string, unknown>): string {
  return cleanName(p.alt_description || p.description || "", "Unsplash photo");
}
/** A Pixabay profile link (pixabay.com/users/<name>-<id>/). */
export function pixabayUserUrl(user: unknown, userId: unknown): string | null {
  if (typeof user !== "string" || !(typeof userId === "number" || typeof userId === "string") || !/^\d{1,12}$/.test(String(userId))) return null;
  const slug = user.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
  return `https://pixabay.com/users/${slug}-${userId}/`;
}

/* ── Sizes ───────────────────────────────── */
/** w × h scaled so the long side is at most `long` (never up). */
export function fitLong(w: number, h: number, long: number): { width: number; height: number } {
  const m = Math.max(w, h);
  if (m <= long) return { width: w, height: h };
  const k = long / m;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
const posInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/**
 * Which Pixabay file a pick stores (settled in Part 7: the stored file must fit the 10 MB bucket).
 * - Full API access (PIXABAY_FULL=1) and the original is at most 10 MB and 12,000 px: imageURL.
 * - Full access, otherwise: fullHDURL (1,920 px on the long side).
 * - Every key: largeImageURL (1,280 px on the long side).
 * The size is what the file will be; the pick reads the real size from the file's bytes.
 */
export type PixabayFile = { url: string; width: number; height: number; kind: "original" | "fullhd" | "large" };
export function pixabayFiles(hit: Record<string, unknown>, full: boolean): PixabayFile[] {
  const out: PixabayFile[] = [];
  const w = hit.imageWidth, h = hit.imageHeight;
  if (!posInt(w) || !posInt(h)) return out;
  if (full) {
    const orig = safeUrl(hit.imageURL, HOSTS.pixabayImage);
    if (orig && posInt(hit.imageSize) && hit.imageSize <= MAX_FILE_BYTES && Math.max(w, h) <= MAX_SIDE) out.push({ url: orig, width: w, height: h, kind: "original" });
    const hd = safeUrl(hit.fullHDURL, HOSTS.pixabayImage);
    if (hd) out.push({ url: hd, ...fitLong(w, h, PIXABAY_FULLHD), kind: "fullhd" });
  }
  const large = safeUrl(hit.largeImageURL, HOSTS.pixabayImage);
  if (large) out.push({ url: large, ...fitLong(w, h, PIXABAY_LARGE), kind: "large" });
  return out;
}

/** The Unsplash raw link, with ?w= or ?h= 12,000 when the photo is bigger than 0030 allows. */
export function unsplashRemote(raw: string, w: number, h: number): { url: string; width: number; height: number } {
  if (Math.max(w, h) <= MAX_SIDE) return { url: raw, width: w, height: h };
  const s = fitLong(w, h, MAX_SIDE);
  return { url: `${raw}${raw.includes("?") ? "&" : "?"}${w >= h ? "w" : "h"}=${MAX_SIDE}`, ...s };
}

/* ── Normalized results ──────────────────── */
export type StockResult = {
  id: string; source: Source; name: string; thumb: string; preview: string;
  width: number; height: number; type: "photo" | "illustration" | "vector"; transparent: boolean;
  author: string; authorUrl: string; pageUrl: string;
};
export type SearchReply = { source: Source; q: string; page: number; perPage: number; total: number; results: StockResult[] };

function pixabayType(t: unknown): StockResult["type"] {
  const s = String(t || "");
  return s.startsWith("vector") ? "vector" : s === "illustration" ? "illustration" : "photo";
}

/** One Pixabay hit → a result, or null when a piece is missing or off its hosts. */
export function pixabayResult(hit: unknown, transparent: boolean, full: boolean): StockResult | null {
  if (!isObj(hit) || !posInt(hit.id)) return null;
  const files = pixabayFiles(hit, full);
  const thumb = safeUrl(hit.webformatURL, HOSTS.pixabayImage);
  const preview = safeUrl(hit.largeImageURL, HOSTS.pixabayImage) ?? thumb;
  const pageUrl = safeUrl(hit.pageURL, HOSTS.pixabayPage);
  const authorUrl = pixabayUserUrl(hit.user, hit.user_id);
  if (!files.length || !thumb || !preview || !pageUrl || !authorUrl || typeof hit.user !== "string") return null;
  return {
    id: String(hit.id), source: "pixabay", name: pixabayName(hit.tags), thumb, preview,
    width: files[0].width, height: files[0].height, type: pixabayType(hit.type), transparent,
    author: cleanName(hit.user, "Pixabay user"), authorUrl, pageUrl,
  };
}
/** One Unsplash photo → a result, or null. */
export function unsplashResult(p: unknown): StockResult | null {
  if (!isObj(p) || typeof p.id !== "string" || !UNSPLASH_ID_RE.test(p.id) || !posInt(p.width) || !posInt(p.height)) return null;
  const urls = isObj(p.urls) ? p.urls : {}, links = isObj(p.links) ? p.links : {};
  const user = isObj(p.user) ? p.user : {}, ulinks = isObj(user.links) ? user.links : {};
  const thumb = safeUrl(urls.small, HOSTS.unsplashImage);
  const preview = safeUrl(urls.regular, HOSTS.unsplashImage) ?? thumb;
  const pageUrl = safeUrl(links.html, HOSTS.unsplashPage);
  const authorUrl = safeUrl(ulinks.html, HOSTS.unsplashPage);
  if (!thumb || !preview || !pageUrl || !authorUrl || typeof user.name !== "string" || !safeUrl(urls.raw, HOSTS.unsplashImage)) return null;
  const size = fitLong(p.width, p.height, MAX_SIDE);
  return {
    id: p.id, source: "unsplash", name: unsplashName(p), thumb, preview, ...size,
    type: "photo", transparent: false, author: cleanName(user.name, "Unsplash photographer"), authorUrl, pageUrl,
  };
}

/** A provider's search answer → the reply (at most 24 results; the total capped at 480). null = not an answer. */
export function normalizeSearch(i: SearchInput, body: unknown, full: boolean): SearchReply | null {
  if (!isObj(body)) return null;
  let list: unknown, total: unknown;
  if (i.source === "pixabay") { list = body.hits; total = body.totalHits; }
  else { list = body.results; total = body.total; }
  if (!Array.isArray(list) || typeof total !== "number" || !Number.isFinite(total)) return null;
  const transparent = i.source === "pixabay" && i.filters.color === "transparent";
  const results = list.slice(0, PER_PAGE)
    .map((h) => (i.source === "pixabay" ? pixabayResult(h, transparent, full) : unsplashResult(h)))
    .filter((r): r is StockResult => r !== null);
  return { source: i.source, q: i.q, page: i.page, perPage: PER_PAGE, total: Math.max(0, Math.min(Math.floor(total), MAX_TOTAL)), results };
}

/**
 * A cached answer read back from stock_cache (a table the user can write): every result is checked
 * again with the same host rules, and the answer must be for this search. null = do not use it.
 */
export function checkCached(i: SearchInput, body: unknown): SearchReply | null {
  if (!isObj(body) || body.source !== i.source || body.page !== i.page || !Array.isArray(body.results) || body.results.length > PER_PAGE) return null;
  if (typeof body.total !== "number" || !Number.isInteger(body.total) || body.total < 0 || body.total > MAX_TOTAL) return null;
  const imgHosts = i.source === "pixabay" ? HOSTS.pixabayImage : HOSTS.unsplashImage;
  const pageHosts = i.source === "pixabay" ? HOSTS.pixabayPage : HOSTS.unsplashPage;
  const results: StockResult[] = [];
  for (const r of body.results) {
    if (!isObj(r) || r.source !== i.source || typeof r.id !== "string" || !(i.source === "pixabay" ? PIXABAY_ID_RE : UNSPLASH_ID_RE).test(r.id)) return null;
    const thumb = safeUrl(r.thumb, imgHosts), preview = safeUrl(r.preview, imgHosts);
    const pageUrl = safeUrl(r.pageUrl, pageHosts), authorUrl = safeUrl(r.authorUrl, pageHosts);
    if (!thumb || !preview || !pageUrl || !authorUrl || !posInt(r.width) || !posInt(r.height) || r.width > MAX_SIDE || r.height > MAX_SIDE) return null;
    if (!oneOf(["photo", "illustration", "vector"] as const, r.type) || typeof r.transparent !== "boolean") return null;
    results.push({ id: r.id, source: i.source, name: cleanName(r.name, "Picture"), thumb, preview, width: r.width, height: r.height,
      type: r.type, transparent: r.transparent, author: cleanName(r.author, "Unknown"), authorUrl, pageUrl });
  }
  return { source: i.source, q: i.q, page: i.page, perPage: PER_PAGE, total: body.total, results };
}

/* ── Pick ────────────────────────────────── */
export type Credit = { id: string | number; author: string; authorUrl: string; pageUrl: string };

/** The Pixabay lookup answer (?id=) → the hit, or null when there is none. */
export function pixabayHit(body: unknown, id: string): Record<string, unknown> | null {
  if (!isObj(body) || !Array.isArray(body.hits)) return null;
  const hit = body.hits.find((h) => isObj(h) && String(h.id) === id);
  return isObj(hit) ? hit : null;
}
export function pixabayCredit(hit: Record<string, unknown>): Credit | null {
  const pageUrl = safeUrl(hit.pageURL, HOSTS.pixabayPage), authorUrl = pixabayUserUrl(hit.user, hit.user_id);
  if (!posInt(hit.id) || !pageUrl || !authorUrl || typeof hit.user !== "string") return null;
  const c = { id: hit.id, author: cleanName(hit.user, "Pixabay user"), authorUrl, pageUrl };
  return JSON.stringify(c).length <= CREDIT_MAX_BYTES ? c : null;
}

export type UnsplashPick = { remote: { url: string; width: number; height: number }; width: number; height: number; name: string; credit: Credit; ping: string };
/** GET /photos/:id → what the row needs and the download ping URL (api.unsplash.com only). */
export function unsplashPick(p: unknown, id: string): UnsplashPick | null {
  if (!isObj(p) || p.id !== id || !posInt(p.width) || !posInt(p.height)) return null;
  const urls = isObj(p.urls) ? p.urls : {}, links = isObj(p.links) ? p.links : {};
  const user = isObj(p.user) ? p.user : {}, ulinks = isObj(user.links) ? user.links : {};
  const raw = safeUrl(urls.raw, HOSTS.unsplashImage);
  const ping = safeUrl(links.download_location, HOSTS.unsplashApi);
  const pageUrl = safeUrl(links.html, HOSTS.unsplashPage), authorUrl = safeUrl(ulinks.html, HOSTS.unsplashPage);
  if (!raw || !ping || !pageUrl || !authorUrl || typeof user.name !== "string") return null;
  const remote = unsplashRemote(raw, p.width, p.height);
  if (remote.url.length > URL_MAX) return null;
  const credit = { id, author: cleanName(user.name, "Unsplash photographer"), authorUrl, pageUrl };
  if (JSON.stringify(credit).length > CREDIT_MAX_BYTES) return null;
  return { remote, width: remote.width, height: remote.height, name: unsplashName(p), credit, ping };
}

/* ── Picture bytes ───────────────────────── */
export type ImageInfo = { mime: "image/jpeg" | "image/png"; width: number; height: number; transparent: boolean };

/**
 * The kind by magic bytes, and the size from the header (JPEG: the SOF marker; PNG: IHDR).
 * transparent: a PNG with an alpha channel (color type 4 or 6) or a tRNS chunk before IDAT.
 * null = not a JPEG or PNG we can read.
 */
export function readImage(b: Uint8Array): ImageInfo | null {
  if (b.length >= 33 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== "IHDR") return null;
    const width = dv.getUint32(16), height = dv.getUint32(20), colorType = b[25];
    if (!width || !height) return null;
    let transparent = colorType === 4 || colorType === 6;
    let at = 8;
    while (!transparent && at + 8 <= b.length) {
      const len = dv.getUint32(at), type = String.fromCharCode(b[at + 4], b[at + 5], b[at + 6], b[at + 7]);
      if (type === "IDAT" || type === "IEND") break;
      if (type === "tRNS") transparent = true;
      at += 12 + len;
    }
    return { mime: "image/png", width, height, transparent };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let at = 2;
    while (at + 4 <= b.length) {
      if (b[at] !== 0xff) return null;
      const m = b[at + 1];
      if (m === 0xff) { at++; continue; }                         // fill byte
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { at += 2; continue; } // no length
      if (m === 0xd9 || m === 0xda) return null;                   // end or scan before a frame header
      const len = (b[at + 2] << 8) | b[at + 3];
      if (len < 2) return null;
      const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (sof) {
        if (at + 9 > b.length) return null;
        const height = (b[at + 5] << 8) | b[at + 6], width = (b[at + 7] << 8) | b[at + 8];
        return width && height ? { mime: "image/jpeg", width, height, transparent: false } : null;
      }
      at += 2 + len;
    }
  }
  return null;
}

export const extFor = (mime: ImageInfo["mime"]) => (mime === "image/png" ? "png" : "jpg");
/** <user id>/assets/<asset id>.jpg|png (0030's path check and the bucket insert rule). */
export const assetPath = (uid: string, id: string, mime: ImageInfo["mime"]) => `${uid}/assets/${id}.${extFor(mime)}`;

/* ── Provider replies → our codes ────────── */
/** A non-2xx provider reply: 429 (or an Unsplash 403 with no calls left) = busy; 401 = the key was refused. */
export function providerError(status: number, remaining: string | null): ErrorCode {
  if (status === 429 || (status === 403 && remaining === "0")) return "stock_busy";
  if (status === 401) return "not_configured";
  if (status === 404) return "not_found";
  return "stock_unavailable";
}
