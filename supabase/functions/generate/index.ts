/* ═══════════════════════════════════════════════════
   KDP Lab — Edge Function "generate"
   supabase/functions/generate/index.ts

   POST { stage: "bio", penNameId }             → { stage, bio, words }
   POST { stage: "amazon_import", topicId, text } → { stage, books }
   POST { stage: "brief_help", bookId }         → { stage, suggestions }
   POST { stage: "review_insights", bookId }    → { stage, insights, books, analyzed_at }
   POST { stage: "positioning_help", bookId[, field] } → { stage, suggestions, unsourced }
   POST { stage: "drift_check", bookId }        → { stage, flags, drift_checked_at, updated_at }
   or { error: <code> }.
   Deploy with verify_jwt ON (the default; never --no-verify-jwt).
   Secret: ANTHROPIC_API_KEY. SUPABASE_URL, SUPABASE_ANON_KEY and
   SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

   Reads use a client built from the caller's Authorization header, so
   RLS applies as that user. Only the ai_usage insert and the drift check
   save use the service role; the save filters by the caller's user id.
═══════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler, type Store, type UsageRow } from "./handler.ts";
import type { BriefContext, Competitor, PenRow, PositioningContext, ReviewContext, TopicRow } from "./lib.ts";

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

    async getTopic(id) {
      const { data, error } = await asUser
        .from("topics")
        .select("id, name")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as TopicRow | null;
    },

    // One read: the Brief, the pen name, and the topic with its page-1 books.
    // A book that is not the caller's reads as null (RLS).
    async getBriefContext(bookId) {
      const { data, error } = await asUser
        .from("books")
        .select(`id,
                 book_briefs ( topic_text, book_type, target_reader, reader_problem, promise_draft ),
                 pen_names ( niche, voice ),
                 topics ( name, topic_page_books ( position, title, author, reviews, rating, sponsored, included ) )`)
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // A to-one embed can come back as an object or a one-item array.
      const one = (v: unknown): unknown => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      const brief = one(data.book_briefs) as BriefContext["brief"] | null;
      if (!brief) return null;
      const topic = one(data.topics) as { name: string; topic_page_books: BriefContext["pageBooks"] } | null;
      return {
        bookId: data.id as string,
        brief,
        pen: one(data.pen_names) as BriefContext["pen"],
        topicName: topic?.name ?? null,
        pageBooks: topic?.topic_page_books ?? [],
      };
    },

    // One read: the Brief and the book's competitors with their pasted reviews.
    // A book that is not the caller's reads as null (RLS).
    async getReviewContext(bookId) {
      const { data, error } = await asUser
        .from("books")
        .select(`id,
                 book_briefs ( topic_text, target_reader ),
                 competitors ( id, title, author, toc, low_reviews, high_reviews, created_at )`)
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const one = (v: unknown): unknown => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      const brief = one(data.book_briefs) as ReviewContext["brief"] | null;
      return {
        bookId: data.id as string,
        brief: brief ?? { topic_text: null, target_reader: null },
        competitors: (data.competitors ?? []) as Competitor[],
      };
    },

    // One read: the Brief, pen voice, Research (insights, competitors, sources
    // and notes) and the saved positioning. A book that is not the caller's
    // reads as null (RLS).
    async getPositioningContext(bookId) {
      const { data, error } = await asUser
        .from("books")
        .select(`id,
                 book_briefs ( topic_text, book_type, target_reader, reader_problem, promise_draft, options ),
                 pen_names ( niche, voice ),
                 research_insights ( loves, hates, gaps ),
                 competitors ( title, author, created_at ),
                 research_sources ( kind, body, citation, created_at ),
                 positioning ( one_sentence, reader_promise, approach, lacks, selling_points, focus_tags,
                               drift_flags, drift_checked_at, locked_at, updated_at )`)
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const one = (v: unknown): unknown => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      const brief = one(data.book_briefs) as PositioningContext["brief"] | null;
      if (!brief) return null;
      return {
        bookId: data.id as string,
        brief,
        pen: one(data.pen_names) as PositioningContext["pen"],
        insights: one(data.research_insights) as PositioningContext["insights"],
        competitors: (data.competitors ?? []) as PositioningContext["competitors"],
        sources: (data.research_sources ?? []) as PositioningContext["sources"],
        positioning: one(data.positioning) as PositioningContext["positioning"],
      };
    },

    // Service role (bypasses RLS), so it filters by the caller's user id. The
    // updated_at and locked_at filters make it a no-op when the author edited
    // or locked the positioning while the check ran. Migration 0010 lets only
    // this role write drift_checked_at and the flag text.
    async saveDriftFlags({ bookId, userId, flags, checkedAt, readUpdatedAt }) {
      const admin = createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), noSession);
      const { data, error } = await admin
        .from("positioning")
        .update({ drift_flags: flags, drift_checked_at: checkedAt })
        .eq("book_id", bookId)
        .eq("user_id", userId)
        .eq("updated_at", readUpdatedAt)
        .is("locked_at", null)
        .select("drift_checked_at, updated_at");
      if (error) throw error;
      return data.length ? data[0] as { drift_checked_at: string; updated_at: string } : null;
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
