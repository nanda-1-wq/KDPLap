/* ═══════════════════════════════════════════════════
   NicheInk — Edge Function "stock": request flow (E16 Part 7, plan §7)
   supabase/functions/stock/handler.ts

   POST { action: "search", source, q, page, filters } → { source, q, page, perPage, total, results, cached }
   POST { action: "pick", source, id, bookId? }         → { asset }   (the new cover_assets row)
   or { error: <code> } (lib.ts ERROR_STATUS).

   The database and fetch come in as dependencies (handler.test.ts runs the
   whole flow with fakes; index.ts passes the real ones). Every database call
   runs as the caller (the user's JWT): stock_usage, stock_calls,
   stock_cache, the "covers" bucket and cover_assets, all under RLS.

   Never logged: a URL (the Pixabay key is in its query), a provider body, an
   error message. Only the source, the step, an HTTP status or an error name.
═══════════════════════════════════════════════════ */

import * as L from "./lib.ts";

export type Usage = { searches: number; picks: number; unsplash_hour: number };
export type AssetRow = Record<string, unknown>;
export type NewAsset = {
  id: string; source: L.Source; mime: L.ImageInfo["mime"]; path: string | null;
  remote: { url: string; width: number; height: number } | null;
  width: number; height: number; bytes: number | null; transparent: boolean;
  credit: L.Credit; origin_book_id: string | null; name: string;
};
export type Store = {
  getUserId(): Promise<string | null>;
  usage(): Promise<Usage>;
  logCall(row: { source: L.Source; action: "search" | "pick"; provider_calls: number }): Promise<void>;
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
};

const KEY_ENV: Record<L.Source, string> = { pixabay: "PIXABAY_API_KEY", unsplash: "UNSPLASH_ACCESS_KEY" };

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

/** A stop with our code; the flow turns it into the reply. */
class Stop extends Error {
  constructor(readonly code: L.ErrorCode) { super(code); }
}

export function makeHandler(deps: Deps) {
  const log = deps.log ?? ((line: string) => console.error(line));

  /** One provider call: JSON back, or a Stop with our code. Logs the source, step and status only. */
  async function getJson(source: L.Source, step: string, url: string, headers: Record<string, string>): Promise<unknown> {
    let res: Response;
    try {
      res = await deps.fetchFn(url, { headers, redirect: "error", signal: AbortSignal.timeout(L.API_TIMEOUT_MS) });
    } catch (err) {
      log(`stock: ${source} ${step} failed: ${(err as Error)?.name ?? "Error"}`);
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
      log(`stock: ${source} ${step} bad JSON: ${(err as Error)?.name ?? "Error"}`);
      throw new Stop("stock_unavailable");
    }
  }

  /**
   * Download one picture file, at most 10 MB. null = over the cap. A redirect is followed (3 at most)
   * only to an allowed picture host; fetch never follows one by itself.
   */
  async function download(source: L.Source, first: string, hosts: string[]): Promise<Uint8Array | null> {
    let res: Response | null = null;
    let url: string | null = first;
    const signal = AbortSignal.timeout(L.DOWNLOAD_TIMEOUT_MS);
    for (let hop = 0; hop <= 3; hop++) {
      if (!url) break;
      try {
        res = await deps.fetchFn(url, { redirect: "manual", signal });
      } catch (err) {
        log(`stock: ${source} download failed: ${(err as Error)?.name ?? "Error"}`);
        throw new Stop("stock_unavailable");
      }
      if (res.status < 300 || res.status > 399) break;
      await res.body?.cancel().catch(() => {});
      const loc = res.headers.get("location");
      let next: string | null = null;
      try { next = loc ? L.safeUrl(new URL(loc, url).href, hosts) : null; } catch { next = null; }
      if (!next || hop === 3) { log(`stock: ${source} download redirect refused`); throw new Stop("stock_unavailable"); }
      url = next;
    }
    if (!res) throw new Stop("stock_unavailable");
    if (!res.ok || !res.body) {
      log(`stock: ${source} download HTTP ${res.status}`);
      await res.body?.cancel().catch(() => {});
      throw new Stop(res.status === 429 ? "stock_busy" : "stock_unavailable");
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > L.MAX_FILE_BYTES) { await res.body.cancel().catch(() => {}); return null; }
    try {
      return await readStream(res.body, L.MAX_FILE_BYTES);
    } catch (err) {
      log(`stock: ${source} download read failed: ${(err as Error)?.name ?? "Error"}`);
      throw new Stop("stock_unavailable");
    }
  }

  async function search(store: Store, i: L.SearchInput, key: string, usage: Usage): Promise<Record<string, unknown>> {
    const ck = await L.cacheKey(i);
    // 1. A cached answer under 24 hours (checked again: the user can write that table).
    let cachedBody: unknown = null;
    try { cachedBody = await store.readCache(ck, new Date(deps.now().getTime() - L.CACHE_MS).toISOString()); }
    catch (err) { log(`stock: cache read failed: ${(err as { code?: string })?.code ?? (err as Error)?.name ?? "Error"}`); }
    const cached = cachedBody === null ? null : L.checkCached(i, cachedBody);
    if (cached) {
      await store.logCall({ source: i.source, action: "search", provider_calls: 0 });
      return { ...cached, cached: true };
    }
    // 2. The Unsplash hourly budget (the demo's 50 an hour is for the whole app).
    if (i.source === "unsplash" && usage.unsplash_hour + 1 > L.unsplashBudget(deps.env("STOCK_UNSPLASH_HOURLY"))) throw new Stop("stock_busy");
    // 3. The call is logged before the provider is called: a failed log stops here.
    await store.logCall({ source: i.source, action: "search", provider_calls: 1 });
    const body = i.source === "pixabay"
      ? await getJson("pixabay", "search", L.pixabaySearchUrl(key, i), {})
      : await getJson("unsplash", "search", L.unsplashSearchUrl(i), L.unsplashHeaders(key));
    const reply = L.normalizeSearch(i, body, deps.env("PIXABAY_FULL") === "1");
    if (!reply) { log(`stock: ${i.source} search answer not understood`); throw new Stop("stock_unavailable"); }
    try { await store.writeCache(ck, reply); }
    catch (err) { log(`stock: cache write failed: ${(err as { code?: string })?.code ?? (err as Error)?.name ?? "Error"}`); }
    return { ...reply, cached: false };
  }

  /** Store the file, then its row; a row that fails removes the file again. */
  async function keep(store: Store, row: NewAsset, bytes: Uint8Array | null): Promise<AssetRow> {
    if (row.path && bytes) {
      try { await store.upload(row.path, bytes, row.mime); }
      catch (err) { log(`stock: upload failed: ${(err as { statusCode?: string })?.statusCode ?? (err as Error)?.name ?? "Error"}`); throw new Stop("server_error"); }
    }
    try {
      return await store.insertAsset(row);
    } catch (err) {
      log(`stock: asset row failed: ${(err as { code?: string })?.code ?? (err as Error)?.name ?? "Error"}`);
      if (row.path) await store.removeFile(row.path).catch(() => log("stock: file left after a failed row"));
      throw new Stop("server_error");
    }
  }

  async function pickPixabay(store: Store, i: L.PickInput, key: string, userId: string): Promise<AssetRow> {
    await store.logCall({ source: "pixabay", action: "pick", provider_calls: 1 });
    // Looked up by id at Pixabay: never a URL from the browser or the cache.
    const hit = L.pixabayHit(await getJson("pixabay", "lookup", L.pixabayLookupUrl(key, i.id), {}), i.id);
    if (!hit) throw new Stop("not_found");
    const credit = L.pixabayCredit(hit);
    const files = L.pixabayFiles(hit, deps.env("PIXABAY_FULL") === "1");
    if (!credit || !files.length) { log("stock: pixabay hit not understood"); throw new Stop("stock_unavailable"); }
    // The first file that fits 10 MB (the original, then Full HD, then the 1,280 px file).
    let bytes: Uint8Array | null = null;
    for (const f of files) { bytes = await download("pixabay", f.url, L.HOSTS.pixabayImage); if (bytes) break; }
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

  async function pickUnsplash(store: Store, i: L.PickInput, key: string, usage: Usage): Promise<AssetRow> {
    if (usage.unsplash_hour + 2 > L.unsplashBudget(deps.env("STOCK_UNSPLASH_HOURLY"))) throw new Stop("stock_busy");
    await store.logCall({ source: "unsplash", action: "pick", provider_calls: 2 });
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
    const fail = (code: L.ErrorCode) => reply(L.ERROR_STATUS[code], { error: code });

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

      // 4. The per-user limits (30 searches, 10 picks a minute), on the database clock.
      const usage = await store.usage();
      if (input.action === "search" && usage.searches >= L.SEARCHES_PER_MINUTE) return fail("rate_limited");
      if (input.action === "pick" && usage.picks >= L.PICKS_PER_MINUTE) return fail("rate_limited");

      if (input.action === "search") return reply(200, await search(store, input, key, usage));
      const asset = input.source === "pixabay"
        ? await pickPixabay(store, input, key, userId)
        : await pickUnsplash(store, input, key, usage);
      return reply(200, { asset });
    } catch (err) {
      if (err instanceof Stop) return fail(err.code);
      log(`stock: unexpected ${(err as Error)?.name ?? "Error"}${(err as { code?: string })?.code ? ` ${(err as { code?: string }).code}` : ""}`);
      return fail("server_error");
    }
  };
}
