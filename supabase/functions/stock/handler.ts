/* ═══════════════════════════════════════════════════
   NicheInk — Edge Function "stock": request flow (E16 Part 7, plan §7; stock v2, E16.2; stock v3, E16.3)
   supabase/functions/stock/handler.ts

   POST { action: "search", source, q, page, filters } → { source, q, page, perPage, total, results, cached }
   POST { action: "pick", source, id, bookId? }         → { asset }   (the new cover_assets row)
   or { error: <code> } (lib.ts ERROR_STATUS); a Pixabay pick that stays busy adds retry_after_s (1 to 120).

   The database and fetch come in as dependencies (handler.test.ts runs the
   whole flow with fakes; index.ts passes the real ones). Every database call
   runs as the caller (the user's JWT): stock_reserve, stock_release,
   stock_cache, the "covers" bucket and cover_assets, all under RLS.

   stock v2 (E16.2, plan v2 Items 1 and 2):
   - The limits: one call to stock_reserve (0032) checks them and writes the
     stock_calls row in one step, before any provider call. A refusal stops
     there; an error stops there too (fail closed, 500).
   - A reserved request that then fails (stock_busy, stock_unavailable,
     server_error) gives its minute slot back with stock_release.
   - A Pixabay pick retries its lookup or its download (only the step that
     failed, D6) on a 429, 502, 503, 504 or a network error: at most 2 retries
     for the pick, 20 s of waiting and a 45 s deadline in all (STOP 1 inputs).
     A timeout and any other 4xx are not retried. Searches and Unsplash are
     never retried (Q-8).
   - Every Pixabay request sends the NicheInk User-Agent and an Accept header (D1).

   stock v3 (E16.3, plan Item 1): a Retry-After or X-RateLimit-Reset under 2 s
   (lib.ts HEADER_MIN_S; live: Cloudflare's "Retry-After: 0") counts as no
   header: the quick backoff (1.5 to 2.5 s, then 4 to 6 s) runs, and a pick
   that stays busy sends retry_after_s 20. The log line keeps the raw value.

   Never logged: a URL (the Pixabay key is in its query), a provider body, an
   error message. Only the source, the step, an HTTP status, an error name, a
   host name, the body's type and size, and short header values (D3).
═══════════════════════════════════════════════════ */

import * as L from "./lib.ts";

export type AssetRow = Record<string, unknown>;
export type NewAsset = {
  id: string; source: L.Source; mime: L.ImageInfo["mime"]; path: string | null;
  remote: { url: string; width: number; height: number } | null;
  width: number; height: number; bytes: number | null; transparent: boolean;
  credit: L.Credit; origin_book_id: string | null; name: string;
};
export type ReserveRow = { source: L.Source; action: "search" | "pick"; provider_calls: number };
export type Store = {
  getUserId(): Promise<string | null>;
  /** rpc stock_reserve: its raw answer (checked here with L.parseReserve). */
  reserve(row: ReserveRow): Promise<unknown>;
  /** rpc stock_release: true when the minute slot was given back. */
  release(id: number): Promise<boolean>;
  readCache(key: string, sinceIso: string): Promise<unknown | null>;
  writeCache(key: string, body: L.SearchReply): Promise<void>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  insertAsset(row: NewAsset): Promise<AssetRow>;
};
export type Deps = {
  env: (name: string) => string | undefined;
  openStore: (authHeader: string) => Store;
  fetchFn: typeof fetch;
  now: () => Date;
  uuid: () => string;
  log?: (line: string) => void;
  /** The wait between tries (default setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** A clock in ms for the pick deadline (default performance.now). */
  clock?: () => number;
  /** For the jitter, in [0, 1) (default Math.random). */
  rand?: () => number;
  /** A timeout signal (default AbortSignal.timeout). */
  timeout?: (ms: number) => AbortSignal;
};

const KEY_ENV: Record<L.Source, string> = { pixabay: "PIXABAY_API_KEY", unsplash: "UNSPLASH_ACCESS_KEY" };
/** How much of a failed answer's body is read to measure it (then dropped). */
const BODY_PEEK = 65_536;

/** Read the body, stopping as soon as it passes the byte cap. null = too large. */
async function readCapped(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const bytes = await readStream(req.body, max);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}
/** A stream's bytes, cancelled as soon as they pass max. null = too large. */
async function readStream(body: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}
/** The size of a failed answer's body: the declared length, or the bytes read (at most 64 KB). Never kept. */
async function bodySize(res: Response): Promise<string> {
  const declared = res.headers.get("content-length");
  if (declared !== null && /^\d{1,12}$/.test(declared)) { await res.body?.cancel().catch(() => {}); return declared; }
  if (!res.body) return "-";
  try {
    const b = await readStream(res.body, BODY_PEEK);
    return b === null ? `>${BODY_PEEK}` : String(b.length);
  } catch { return "-"; }
}
const errName = (err: unknown) => (err as Error)?.name ?? "Error";
const errCode = (err: unknown) => (err as { code?: string })?.code ?? errName(err);
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return "-"; } };

/** A stop with our code; the flow turns it into the reply. */
class Stop extends Error {
  constructor(readonly code: L.ErrorCode, readonly retryAfterS: number | null = null) { super(code); }
}
/** A failed try worth another one (429, 502, 503, 504, a network error); code = what it means if none is left. */
class Retryable extends Error {
  constructor(readonly code: L.ErrorCode, readonly info: L.FailInfo) { super(code); }
}
/** One pick's retry budget: retries left, the time waited, the deadline on deps.clock. */
type Budget = { retriesLeft: number; waitedMs: number; deadline: number };

export function makeHandler(deps: Deps) {
  const rawLog = deps.log ?? ((line: string) => console.error(line));
  /** Every line passes a last filter: a source key never reaches the log, whatever a provider sent back. */
  const log = (line: string) => {
    let out = line;
    for (const name of Object.values(KEY_ENV)) {
      const k = deps.env(name);
      if (k && k.length >= 8) out = out.split(k).join("[key]");
    }
    rawLog(out);
  };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const clock = deps.clock ?? (() => performance.now());
  const rand = deps.rand ?? Math.random;
  const timeout = deps.timeout ?? ((ms: number) => AbortSignal.timeout(ms));

  /** One provider call, never retried (searches, Unsplash): JSON back, or a Stop. Logs the source, step and status only. */
  async function getJson(source: L.Source, step: string, url: string, headers: Record<string, string>): Promise<unknown> {
    let res: Response;
    try {
      res = await deps.fetchFn(url, { headers, redirect: "error", signal: timeout(L.API_TIMEOUT_MS) });
    } catch (err) {
      log(`stock: ${source} ${step} failed: ${errName(err)}`);
      throw new Stop("stock_unavailable");
    }
    if (!res.ok) {
      const code = L.providerError(res.status, res.headers.get("x-ratelimit-remaining"));
      log(`stock: ${source} ${step} HTTP ${res.status}`);
      await res.body?.cancel().catch(() => {});
      throw new Stop(code);
    }
    try {
      return await res.json();
    } catch (err) {
      log(`stock: ${source} ${step} bad JSON: ${errName(err)}`);
      throw new Stop("stock_unavailable");
    }
  }

  /**
   * Run one step of a Pixabay pick, again after a Retryable while the budget allows: a header wait
   * (Retry-After or X-RateLimit-Reset) or a quick backoff, within 20 s of waiting in all, with a try's
   * time left before the deadline. Each failed try logs one line. Out of budget: a Stop with the try's
   * code, and for stock_busy the retry_after_s for the browser.
   */
  async function withRetry<T>(step: "lookup" | "download", budget: Budget, stepMs: number, run: (ms: number) => Promise<T>): Promise<T> {
    for (let tryNo = 1; ; tryNo++) {
      const left = budget.deadline - clock();
      if (left < L.MIN_TRY_MS) { log(`stock: pixabay ${step} deadline reached`); throw new Stop("stock_unavailable"); }
      try {
        return await run(Math.min(stepMs, left));
      } catch (err) {
        if (!(err instanceof Retryable)) throw err;
        const raw = err.info.headers ? L.retryAfterSeconds(err.info.headers, deps.now().getTime()) : null;
        const headerS = L.usableWait(raw);   // E16.3: under 2 s = no header
        const wait = headerS !== null ? headerS * 1000 : L.backoffMs(L.PICK_RETRIES - budget.retriesLeft + 1, rand());
        const again = budget.retriesLeft > 0 && budget.waitedMs + wait <= L.PICK_WAIT_MS && clock() + wait + L.MIN_TRY_MS <= budget.deadline;
        log(L.failLine(step, err.info, tryNo, tryNo + budget.retriesLeft, again ? wait : 0, raw));   // the raw value, as Pixabay sent it
        if (!again) throw new Stop(err.code, err.code === "stock_busy" ? L.busyRetryAfter(headerS) : null);
        budget.retriesLeft--;
        budget.waitedMs += wait;
        await sleep(wait);
      }
    }
  }

  /** One try of the Pixabay lookup by id. */
  async function lookupOnce(url: string, ms: number): Promise<unknown> {
    let res: Response;
    try {
      res = await deps.fetchFn(url, { headers: L.pixabayHeaders("json"), redirect: "error", signal: timeout(ms) });
    } catch (err) {
      if (err instanceof TypeError) throw new Retryable("stock_unavailable", { status: null, errName: "TypeError", hop: 0, host: hostOf(url), headers: null, bytes: "-" });
      log(`stock: pixabay lookup failed: ${errName(err)}`);
      throw new Stop("stock_unavailable");
    }
    if (!res.ok) {
      const code = L.providerError(res.status, res.headers.get("x-ratelimit-remaining"));
      if (L.RETRY_STATUSES.includes(res.status)) {
        throw new Retryable(code, { status: res.status, hop: 0, host: hostOf(url), headers: res.headers, bytes: await bodySize(res) });
      }
      log(`stock: pixabay lookup HTTP ${res.status}`);
      await res.body?.cancel().catch(() => {});
      throw new Stop(code);
    }
    try {
      return await res.json();
    } catch (err) {
      log(`stock: pixabay lookup bad JSON: ${errName(err)}`);
      throw new Stop("stock_unavailable");
    }
  }

  /**
   * One try of a Pixabay file download, at most 10 MB. null = over the cap. A redirect is followed
   * (3 at most) only to an allowed picture host; fetch never follows one by itself. All hops of one try
   * share one timeout. A retry starts again at the same link (seconds old), with no new lookup (D6).
   */
  async function downloadOnce(first: string, hosts: string[], ms: number): Promise<Uint8Array | null> {
    let res: Response | null = null;
    let url = first;
    let hop = 0;
    const signal = timeout(ms);
    for (; hop <= 3; hop++) {
      try {
        res = await deps.fetchFn(url, { headers: L.pixabayHeaders("image"), redirect: "manual", signal });
      } catch (err) {
        if (err instanceof TypeError) throw new Retryable("stock_unavailable", { status: null, errName: "TypeError", hop, host: hostOf(url), headers: null, bytes: "-" });
        log(`stock: pixabay download failed: ${errName(err)}`);
        throw new Stop("stock_unavailable");
      }
      if (res.status < 300 || res.status > 399) break;
      await res.body?.cancel().catch(() => {});
      const loc = res.headers.get("location");
      let next: string | null = null;
      try { next = loc ? L.safeUrl(new URL(loc, url).href, hosts) : null; } catch { next = null; }
      if (!next || hop === 3) { log("stock: pixabay download redirect refused"); throw new Stop("stock_unavailable"); }
      url = next;
    }
    if (!res) throw new Stop("stock_unavailable");
    if (!res.ok || !res.body) {
      if (L.RETRY_STATUSES.includes(res.status)) {
        throw new Retryable(res.status === 429 ? "stock_busy" : "stock_unavailable",
          { status: res.status, hop, host: hostOf(url), headers: res.headers, bytes: await bodySize(res) });
      }
      log(`stock: pixabay download HTTP ${res.status}`);
      await res.body?.cancel().catch(() => {});
      throw new Stop("stock_unavailable");
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > L.MAX_FILE_BYTES) { await res.body.cancel().catch(() => {}); return null; }
    try {
      return await readStream(res.body, L.MAX_FILE_BYTES);
    } catch (err) {
      log(`stock: pixabay download read failed: ${errName(err)}`);
      throw new Stop("stock_unavailable");
    }
  }

  /** The limits (0032): a slot id, or a Stop (rate_limited, stock_busy; server_error for an answer not understood). */
  async function reserve(store: Store, row: ReserveRow): Promise<number> {
    const r = L.parseReserve(await store.reserve(row));
    if (!r) { log("stock: reserve answer not understood"); throw new Stop("server_error"); }
    if (!r.ok) throw new Stop(r.code);
    return r.id;
  }
  /** Run the reserved request; when it fails with a RELEASE_ON code, give the minute slot back. The reply stays the same. */
  async function releasing<T>(store: Store, id: number, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      const code: L.ErrorCode = err instanceof Stop ? err.code : "server_error";
      if (L.RELEASE_ON.includes(code)) {
        try { if (!(await store.release(id))) log("stock: release refused"); }
        catch (e) { log(`stock: release failed: ${errCode(e)}`); }
      }
      throw err;
    }
  }

  async function search(store: Store, i: L.SearchInput, key: string): Promise<Record<string, unknown>> {
    const ck = await L.cacheKey(i);
    // 1. A cached answer under 24 hours (checked again: the user can write that table).
    let cachedBody: unknown = null;
    try { cachedBody = await store.readCache(ck, new Date(deps.now().getTime() - L.CACHE_MS).toISOString()); }
    catch (err) { log(`stock: cache read failed: ${errCode(err)}`); }
    const cached = cachedBody === null ? null : L.checkCached(i, cachedBody);
    // 2. The limits: a cache hit still counts as a search, with 0 provider calls (no Unsplash budget).
    const id = await reserve(store, { source: i.source, action: "search", provider_calls: cached ? 0 : 1 });
    if (cached) return { ...cached, cached: true };
    return await releasing(store, id, async () => {
      const body = i.source === "pixabay"
        ? await getJson("pixabay", "search", L.pixabaySearchUrl(key, i), L.pixabayHeaders("json"))
        : await getJson("unsplash", "search", L.unsplashSearchUrl(i), L.unsplashHeaders(key));
      const reply = L.normalizeSearch(i, body, deps.env("PIXABAY_FULL") === "1");
      if (!reply) { log(`stock: ${i.source} search answer not understood`); throw new Stop("stock_unavailable"); }
      try { await store.writeCache(ck, reply); }
      catch (err) { log(`stock: cache write failed: ${errCode(err)}`); }
      return { ...reply, cached: false };
    });
  }

  /** Store the file, then its row; a row that fails removes the file again. */
  async function keep(store: Store, row: NewAsset, bytes: Uint8Array | null): Promise<AssetRow> {
    if (row.path && bytes) {
      try { await store.upload(row.path, bytes, row.mime); }
      catch (err) { log(`stock: upload failed: ${(err as { statusCode?: string })?.statusCode ?? errName(err)}`); throw new Stop("server_error"); }
    }
    try {
      return await store.insertAsset(row);
    } catch (err) {
      log(`stock: asset row failed: ${errCode(err)}`);
      if (row.path) await store.removeFile(row.path).catch(() => log("stock: file left after a failed row"));
      throw new Stop("server_error");
    }
  }

  async function pickPixabay(store: Store, i: L.PickInput, key: string, userId: string): Promise<AssetRow> {
    const budget: Budget = { retriesLeft: L.PICK_RETRIES, waitedMs: 0, deadline: clock() + L.PICK_DEADLINE_MS };
    // Looked up by id at Pixabay: never a URL from the browser or the cache.
    const answer = await withRetry("lookup", budget, L.API_TIMEOUT_MS, (ms) => lookupOnce(L.pixabayLookupUrl(key, i.id), ms));
    const hit = L.pixabayHit(answer, i.id);
    if (!hit) throw new Stop("not_found");
    const credit = L.pixabayCredit(hit);
    const files = L.pixabayFiles(hit, deps.env("PIXABAY_FULL") === "1");
    if (!credit || !files.length) { log("stock: pixabay hit not understood"); throw new Stop("stock_unavailable"); }
    // The first file that fits 10 MB (the original, then Full HD, then the 1,280 px file).
    let bytes: Uint8Array | null = null;
    for (const f of files) {
      bytes = await withRetry("download", budget, L.DOWNLOAD_TIMEOUT_MS, (ms) => downloadOnce(f.url, L.HOSTS.pixabayImage, ms));
      if (bytes) break;
    }
    if (!bytes) throw new Stop("too_large");
    const info = L.readImage(bytes);
    if (!info) { log("stock: pixabay file is not a JPEG or PNG"); throw new Stop("bad_image"); }
    if (info.width > L.MAX_SIDE || info.height > L.MAX_SIDE) throw new Stop("too_large");
    const id = deps.uuid();
    return keep(store, {
      id, source: "pixabay", mime: info.mime, path: L.assetPath(userId, id, info.mime), remote: null,
      width: info.width, height: info.height, bytes: bytes.length, transparent: info.transparent,
      credit, origin_book_id: i.bookId, name: L.pixabayName(hit.tags),
    }, bytes);
  }

  async function pickUnsplash(store: Store, i: L.PickInput, key: string): Promise<AssetRow> {
    const p = L.unsplashPick(await getJson("unsplash", "photo", L.unsplashPhotoUrl(i.id), L.unsplashHeaders(key)), i.id);
    if (!p) { log("stock: unsplash photo not understood"); throw new Stop("stock_unavailable"); }
    // The download ping (Unsplash rule): the picture is added only after it answers.
    await getJson("unsplash", "ping", p.ping, L.unsplashHeaders(key));
    return keep(store, {
      id: deps.uuid(), source: "unsplash", mime: "image/jpeg", path: null, remote: p.remote,
      width: p.width, height: p.height, bytes: null, transparent: false,
      credit: p.credit, origin_book_id: i.bookId, name: p.name,
    }, null);
  }

  return async function handle(req: Request): Promise<Response> {
    const cors = L.corsHeaders(req.headers.get("origin"));
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const fail = (code: L.ErrorCode, retryAfterS: number | null = null) =>
      reply(L.ERROR_STATUS[code], retryAfterS === null ? { error: code } : { error: code, retry_after_s: retryAfterS });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return fail("method_not_allowed");

    try {
      // 1. Who is calling (the gateway also verifies the JWT: verify_jwt on).
      const auth = req.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(auth)) return fail("unauthorized");
      const store = deps.openStore(auth);
      const userId = await store.getUserId();
      if (!userId) return fail("unauthorized");

      // 2. Input (2 KB at most, every field checked).
      const raw = await readCapped(req, L.MAX_BODY_BYTES);
      if (raw === null) return fail("bad_request");
      const input = L.parseInput(raw);
      if (!input) return fail("bad_request");

      // 3. The source's key: a Supabase secret. Missing = not_configured. Never logged or returned.
      const key = deps.env(KEY_ENV[input.source]);
      if (!key) { log(`stock: ${input.source} key not set`); return fail("not_configured"); }

      // 4. The limits are checked and the call written in one step (stock_reserve), before any provider call.
      if (input.action === "search") return reply(200, await search(store, input, key));
      const slot = await reserve(store, { source: input.source, action: "pick", provider_calls: input.source === "pixabay" ? 1 : 2 });
      const asset = await releasing(store, slot, () => input.source === "pixabay"
        ? pickPixabay(store, input, key, userId)
        : pickUnsplash(store, input, key));
      return reply(200, { asset });
    } catch (err) {
      if (err instanceof Stop) return fail(err.code, err.retryAfterS);
      log(`stock: unexpected ${errName(err)}${(err as { code?: string })?.code ? ` ${(err as { code?: string }).code}` : ""}`);
      return fail("server_error");
    }
  };
}
