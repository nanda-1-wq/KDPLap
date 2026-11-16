// deno-lint-ignore-file require-await
// Fakes for the stock tests: a store, a provider fetch, sample answers and tiny picture files.
// No network, no database. FAKE keys only (never real secrets).
import { makeHandler, type AssetRow, type NewAsset, type Usage } from "./handler.ts";

export const FAKE_PIXABAY = "fake-pixabay-key-0000";
export const FAKE_UNSPLASH = "fake-unsplash-key-1111";
export const USER = "00000000-0000-4000-8000-00000000000a";
export const BOOK = "b0000000-0000-4000-8000-000000000001";
export const NEW_ID = "1a000000-0000-4000-8000-000000000001";
export const ORIGIN = "https://nicheink.com";

/* ── Picture files ── */
export function jpeg(w: number, h: number, opts: { progressive?: boolean; pad?: number } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, opts.progressive ? 0xc2 : 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const body = new Array(opts.pad ?? 16).fill(0);
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xff, ...sof, 0xff, 0xda, 0x00, 0x02, ...body, 0xff, 0xd9]);
}
function chunk(type: string, data: number[]): number[] {
  const n = data.length;
  return [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}
export function png(w: number, h: number, colorType: number, trns = false): Uint8Array {
  const ihdr = [w >>> 24, (w >> 16) & 255, (w >> 8) & 255, w & 255, h >>> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255, 8, colorType, 0, 0, 0];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr),
    ...(trns ? chunk("tRNS", [0, 0, 0, 0, 0, 0]) : []), ...chunk("IDAT", [1, 2, 3]), ...chunk("IEND", [])]);
}

/* ── Provider answers ── */
export function pixabayHit(id: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, pageURL: `https://pixabay.com/illustrations/leaf-${id}/`, type: "vector/svg", tags: "green leaf, nature, plant",
    previewURL: `https://cdn.pixabay.com/photo/2020/01/01/00/00/leaf-${id}_150.png`,
    webformatURL: `https://pixabay.com/get/g${id}_640.png`, largeImageURL: `https://pixabay.com/get/g${id}_1280.png`,
    imageWidth: 2400, imageHeight: 1600, imageSize: 512000, user: "Ann Lee", user_id: 42, ...over,
  };
}
export const pixabayAnswer = (n: number, total = 500) => ({ total: 9999, totalHits: total, hits: Array.from({ length: n }, (_, i) => pixabayHit(1000 + i)) });

export function unsplashPhoto(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, width: 6000, height: 4000, alt_description: "a calm sea at dusk", description: null,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=abc`, regular: `https://images.unsplash.com/photo-${id}?w=1080`, small: `https://images.unsplash.com/photo-${id}?w=400` },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc` },
    user: { name: "Bo Kim", links: { html: "https://unsplash.com/@bokim" } }, ...over,
  };
}
export const unsplashAnswer = (n: number, total = 1000) => ({ total, total_pages: 50, results: Array.from({ length: n }, (_, i) => unsplashPhoto(`p${i}`)) });

/* ── Request helpers ── */
export function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x", {
    method: "POST",
    headers: { authorization: "Bearer a.b.c", "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
// deno-lint-ignore no-explicit-any
export const json = async (r: Response): Promise<any> => JSON.parse(await r.text());
export const pxSearch = (over: Record<string, unknown> = {}) => ({ action: "search", source: "pixabay", q: "green leaf", page: 1, ...over });
export const unSearch = (over: Record<string, unknown> = {}) => ({ action: "search", source: "unsplash", q: "calm sea", page: 1, ...over });

/* ── The fake world ── */
export type Route = (url: string, init: RequestInit) => Response | Promise<Response>;
export type Setup = {
  userId?: string | null;
  usage?: Partial<Usage>;
  env?: Record<string, string | undefined>;
  cache?: Map<string, unknown>;
  routes?: Record<string, Route>;   // key: a URL prefix (longest wins)
  failLog?: boolean; failCacheRead?: boolean; failCacheWrite?: boolean;
  failUpload?: boolean; failInsert?: boolean; failUser?: boolean;
};

export function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
export function file(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { "content-length": String(bytes.length), ...headers } });
}

export function setup(s: Setup = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logged: string[] = [];
  const logCalls: { source: string; action: string; provider_calls: number }[] = [];
  const cacheWrites: { key: string; body: unknown }[] = [];
  const cacheReads: { key: string; since: string }[] = [];
  const uploads: { path: string; bytes: Uint8Array; mime: string }[] = [];
  const removed: string[] = [];
  const inserted: NewAsset[] = [];
  const cache = s.cache ?? new Map<string, unknown>();
  const env: Record<string, string | undefined> = { PIXABAY_API_KEY: FAKE_PIXABAY, UNSPLASH_ACCESS_KEY: FAKE_UNSPLASH, ...(s.env ?? {}) };
  const routes = s.routes ?? {};

  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    const keys = Object.keys(routes).filter((k) => url.startsWith(k)).sort((a, b) => b.length - a.length);
    if (!keys.length) return reply({ error: "no route" }, 500);
    return await routes[keys[0]](url, init);
  }) as typeof fetch;

  const handle = makeHandler({
    env: (n) => env[n],
    now: () => new Date("2026-11-16T12:00:00Z"),
    uuid: () => NEW_ID,
    fetchFn,
    log: (line) => logged.push(line),
    openStore: () => ({
      getUserId: async () => { if (s.failUser) throw new Error(`db down ${FAKE_PIXABAY}`); return s.userId === undefined ? USER : s.userId; },
      usage: async () => ({ searches: 0, picks: 0, unsplash_hour: 0, ...(s.usage ?? {}) }),
      logCall: async (row) => { if (s.failLog) throw Object.assign(new Error("denied"), { code: "42501" }); logCalls.push(row); },
      readCache: async (key, since) => { cacheReads.push({ key, since }); if (s.failCacheRead) throw new Error("read"); return cache.has(key) ? cache.get(key) : null; },
      writeCache: async (key, body) => { if (s.failCacheWrite) throw new Error("write"); cacheWrites.push({ key, body }); cache.set(key, body); },
      upload: async (path, bytes, mime) => { if (s.failUpload) throw new Error("upload"); uploads.push({ path, bytes, mime }); },
      removeFile: async (path) => { removed.push(path); },
      insertAsset: async (row) => {
        if (s.failInsert) throw Object.assign(new Error("check"), { code: "23514" });
        inserted.push(row);
        return { ...row, rights_at: null, created_at: "2026-11-16T12:00:00Z" } as AssetRow;
      },
    }),
  });
  return { handle, calls, logged, logCalls, cacheWrites, cacheReads, uploads, removed, inserted, cache, env };
}

/** Pixabay routes: search, lookup by id and the file. */
export function pixabayRoutes(opts: { search?: unknown; lookup?: unknown; file?: Uint8Array; fileRoute?: Route } = {}): Record<string, Route> {
  return {
    "https://pixabay.com/api/?": (url) => reply(/[?&]id=/.test(url) ? (opts.lookup ?? { totalHits: 1, hits: [pixabayHit(1000)] }) : (opts.search ?? pixabayAnswer(30))),
    "https://pixabay.com/get/": opts.fileRoute ?? (() => file(opts.file ?? jpeg(1280, 853))),
  };
}
export function unsplashRoutes(opts: { search?: unknown; photo?: unknown; ping?: Route } = {}): Record<string, Route> {
  return {
    "https://api.unsplash.com/search/photos": () => reply(opts.search ?? unsplashAnswer(30)),
    "https://api.unsplash.com/photos/": (url) => (/\/download\?/.test(url) ? (opts.ping ? opts.ping(url, {}) : reply({ url: "https://images.unsplash.com/x" })) : reply(opts.photo ?? unsplashPhoto("p0"))),
  };
}
