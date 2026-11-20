/* ═══════════════════════════════════════════════════
   NicheInk — Edge Function "stock" (E16 Part 7, plan §7; stock v2, E16.2)
   supabase/functions/stock/index.ts

   POST { action: "search", source: "pixabay" | "unsplash", q, page, filters }
        → { source, q, page, perPage, total, results, cached }
   POST { action: "pick", source, id, bookId? } → { asset }
   or { error: <code> }  (bad_request, unauthorized, not_found, method_not_allowed,
   too_large, bad_image, rate_limited, server_error, stock_unavailable,
   not_configured, stock_busy). A Pixabay pick that stays busy after its
   retries also sends retry_after_s (1 to 120).

   Deploy with verify_jwt ON (the default; never --no-verify-jwt).
   Secrets (Supabase dashboard, Edge Functions, Secrets; never in code, git or chat):
     PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY  — a missing key returns not_configured
     PIXABAY_FULL=1                         — only once Pixabay grants full API access
   STOCK_UNSPLASH_HOURLY is no longer read (stock v2): the limits and the
   Unsplash budget are constants in SQL (0032 stock_reserve); a new number
   needs a migration. The secret can be removed.
   SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase.
   Needs migration 0032 (stock_reserve, stock_release). Deploy order (B3,
   owner STOP 1): apply 0032, merge the front end, then deploy this.

   Every database and storage call uses a client built from the caller's
   Authorization header, so RLS applies as that user (0031 stock_cache;
   0032 stock_reserve and stock_release, which write and mark only the
   caller's stock_calls rows; 0030 cover_assets and the "covers" bucket's
   insert rule). No service-role key is used.
═══════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler, type Store } from "./handler.ts";

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
/** The columns js/supabase.js reads (COVER_ASSET_COLS). */
const ASSET_COLS = "id, source, mime, path, remote, width, height, bytes, transparent, rights_at, credit, origin_book_id, name, created_at";

function openStore(authHeader: string): Store {
  const asUser: SupabaseClient = createClient(need("SUPABASE_URL"), need("SUPABASE_ANON_KEY"), {
    ...noSession,
    global: { headers: { Authorization: authHeader } },
  });
  const jwt = authHeader.slice("Bearer ".length);

  return {
    async getUserId() {
      const { data, error } = await asUser.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
    async reserve(row) {
      // p_provider_calls goes as a JSON number; PostgREST types it from the signature (smallint).
      const { data, error } = await asUser.rpc("stock_reserve", { p_source: row.source, p_action: row.action, p_provider_calls: row.provider_calls });
      if (error) throw error;
      return data;
    },
    async release(id) {
      const { data, error } = await asUser.rpc("stock_release", { p_id: id });
      if (error) throw error;
      return data === true;
    },
    async readCache(key, sinceIso) {
      const { data, error } = await asUser.from("stock_cache").select("body").eq("key", key).gt("fetched_at", sinceIso).maybeSingle();
      if (error) throw error;
      return data ? (data as { body: unknown }).body : null;
    },
    async writeCache(key, body) {
      const { error } = await asUser.from("stock_cache").upsert({ key, body }, { onConflict: "user_id,key", defaultToNull: false });
      if (error) throw error;
    },
    async upload(path, bytes, mime) {
      const { error } = await asUser.storage.from("covers").upload(path, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }), { contentType: mime, upsert: false, cacheControl: "3600" });
      if (error) throw error;
    },
    async removeFile(path) {
      const { error } = await asUser.storage.from("covers").remove([path]);
      if (error) throw error;
    },
    async insertAsset(row) {
      const { data, error } = await asUser.from("cover_assets").insert(row).select(ASSET_COLS).single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  };
}

Deno.serve(makeHandler({
  env: (name) => Deno.env.get(name),
  openStore,
  fetchFn: fetch,
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
}));
