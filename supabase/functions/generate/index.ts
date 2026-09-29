/* ═══════════════════════════════════════════════════
   KDP Lab — Edge Function "generate"
   supabase/functions/generate/index.ts

   POST { stage, penNameId } → { stage, bio, words } or { error: <code> }.
   Deploy with verify_jwt ON (the default; never --no-verify-jwt).
   Secret: ANTHROPIC_API_KEY. SUPABASE_URL, SUPABASE_ANON_KEY and
   SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

   Reads use a client built from the caller's Authorization header, so
   RLS applies as that user. Only the ai_usage insert uses the service role.
═══════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler, type Store, type UsageRow } from "./handler.ts";
import type { PenRow } from "./lib.ts";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function openStore(authHeader: string): Store {
  const url = need("SUPABASE_URL");
  const asUser: SupabaseClient = createClient(url, need("SUPABASE_ANON_KEY"), {
    ...noSession,
    global: { headers: { Authorization: authHeader } },
  });
  const jwt = authHeader.slice("Bearer ".length);

  return {
    async getUserId() {
      const { data, error } = await asUser.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },

    async getPenName(id) {
      const { data, error } = await asUser
        .from("pen_names")
        .select("id, name, niche, bio_facts, voice")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as PenRow | null;
    },

    async getMonthlyLimit() {
      const { data, error } = await asUser.from("user_settings").select("monthly_token_limit").maybeSingle();
      if (error) throw error;
      return data ? data.monthly_token_limit as number : null;
    },

    async sumCountedTokensSince(userId, iso) {
      let sum = 0;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await asUser
          .from("ai_usage")
          .select("input_tokens, output_tokens")
          .eq("user_id", userId)
          .eq("counted", true)
          .gte("created_at", iso)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data) sum += r.input_tokens + r.output_tokens;
        if (data.length < PAGE) return sum;
      }
    },

    async countCallsSince(userId, iso) {
      const { count, error } = await asUser
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", iso);
      if (error) throw error;
      return count ?? 0;
    },

    async logUsage(row: UsageRow) {
      const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), noSession);
      const { error } = await admin.from("ai_usage").insert(row);
      if (error) throw error;
    },
  };
}

Deno.serve(makeHandler({
  env: (name) => Deno.env.get(name),
  openStore,
  fetchFn: fetch,
  now: () => new Date(),
}));
