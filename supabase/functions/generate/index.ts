/* ═══════════════════════════════════════════════════
   KDP Lab — Edge Function "generate"
   supabase/functions/generate/index.ts

   POST { stage: "bio", penNameId }             → { stage, bio, words }
   POST { stage: "amazon_import", topicId, text } → { stage, books }
   POST { stage: "brief_help", bookId }         → { stage, suggestions }
   POST { stage: "review_insights", bookId }    → { stage, insights, books, analyzed_at }
   POST { stage: "positioning_help", bookId[, field] } → { stage, suggestions, unsourced }
   POST { stage: "drift_check", bookId }        → { stage, flags, drift_checked_at, updated_at }
   POST { stage: "title_ideas", bookId }        → { stage, options }   (the saved title_options rows)
   POST { stage: "competitor_import", bookId, text } → { stage, competitor }
   POST { stage: "outline_ideas", bookId, sectionsPerChapter } → { stage, chapters, rescaled, target, aiPickedChapters }
                                                  (chapters = the saved outline, as replace_outline returns it)
   POST { stage: "outline_check", bookId }      → { stage, findings, checked_at, inputs_key }
   POST { stage: "section_write", bookId, sectionId, baseVersionId[, more] }
                                                → text/event-stream (E10.2, lib/write_run.ts):
                                                  start, text…, done, saved | error
   or { error: <code> }.
   Deploy with verify_jwt ON (the default; never --no-verify-jwt).
   Secret: ANTHROPIC_API_KEY. SUPABASE_URL, SUPABASE_ANON_KEY and
   SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

   Reads use a client built from the caller's Authorization header, so
   RLS applies as that user, and so do the title options insert and the
   outline save (replace_outline, 0016). Only the
   ai_usage insert, the drift check save, the outline check save (0017) and
   the section_write run (0020 section_run_begin, _beat, _finish) use the
   service role; they filter by, or write, the caller's user id (the run RPCs
   check the section's owner and book themselves).
   section_write keeps its run alive with EdgeRuntime.waitUntil; on shutdown
   (beforeunload) every open run stops and saves its text as a partial version.
═══════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { makeHandler, type SavedTitleOption, type Store, type UsageRow } from "./handler.ts";
import type { BriefContext, Competitor, OutlineContext, OutlineRow, PenRow, PositioningContext, ReviewContext, TitleContext, TopicRow, WriteChapterRow, WriteContext } from "./lib.ts";
import { stopAllRuns, WRITE_TIMING } from "./lib.ts";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// A to-one embed can come back as an object or a one-item array.
const one = (v: unknown): unknown => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// What both positioning stages and title_ideas read about a book.
const POSITIONING_SELECT = `id,
  book_briefs ( topic_text, book_type, book_type_label, target_reader, reader_problem, promise_draft, options ),
  pen_names ( niche, voice ),
  research_insights ( loves, hates, gaps ),
  competitors ( title, author, created_at ),
  research_sources ( kind, body, citation, created_at ),
  positioning ( one_sentence, reader_promise, approach, lacks, selling_points, focus_tags,
                drift_flags, drift_checked_at, locked_at, updated_at )`;

// deno-lint-ignore no-explicit-any
function positioningContext(data: any): PositioningContext | null {
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
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function openStore(authHeader: string): Store {
  const url = need("SUPABASE_URL");
  const asUser: SupabaseClient = createClient(url, need("SUPABASE_ANON_KEY"), {
    ...noSession,
    global: { headers: { Authorization: authHeader } },
  });
  const jwt = authHeader.slice("Bearer ".length);

  /** The service-role client (bypasses RLS), built once and only when needed. */
  let adminClient: SupabaseClient | null = null;
  const admin = () => (adminClient ??= createClient(url, need("SUPABASE_SERVICE_ROLE_KEY"), noSession));

  /** One book with the given embeds, through RLS. Someone else's book reads as null. */
  async function readBook(bookId: string, select: string) {
    const { data, error } = await asUser.from("books").select(select).eq("id", bookId).maybeSingle();
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return data as any;
  }

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
                 book_briefs ( topic_text, book_type, book_type_label, target_reader, reader_problem, promise_draft, options ),
                 pen_names ( niche, voice ),
                 topics ( name, topic_page_books ( position, title, author, reviews, rating, sponsored, included ) )`)
        .eq("id", bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
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

    // The book row only (competitor_import). A book that is not the caller's reads as null (RLS).
    async getBook(bookId) {
      const { data, error } = await asUser.from("books").select("id").eq("id", bookId).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string } : null;
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
      const data = await readBook(bookId, POSITIONING_SELECT);
      return data && positioningContext(data);
    },

    // The same read, plus the title examples and the saved title options.
    async getTitleContext(bookId) {
      const data = await readBook(bookId, `${POSITIONING_SELECT}, title_examples, title_options ( title, subtitle )`);
      const ctx = data && positioningContext(data);
      if (!ctx) return null;
      return {
        ...ctx,
        examples: (data.title_examples ?? []) as string[],
        options: (data.title_options ?? []) as TitleContext["options"],
      };
    },

    // As the user (RLS): the insert policy checks the book is theirs, and the
    // 0011 trigger caps the options at 40 per book (P0001 "title_options_full").
    async saveTitleOptions(bookId, ideas) {
      const { data, error } = await asUser
        .from("title_options")
        .insert(ideas.map((t) => ({ book_id: bookId, ...t })))
        .select("id, title, subtitle, reason, keywords, unsourced, shortlisted, created_at");
      if (error) throw error.message === "title_options_full" ? { code: "options_full" } : error;
      return data as SavedTitleOption[];
    },

    // Service role (bypasses RLS), so it filters by the caller's user id. The
    // updated_at and locked_at filters make it a no-op when the author edited
    // or locked the positioning while the check ran. Migration 0010 lets only
    // this role write drift_checked_at and the flag text.
    async saveDriftFlags({ bookId, userId, flags, checkedAt, readUpdatedAt }) {
      const { data, error } = await admin()
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

    // The positioning read, plus what the outline needs: the book title, the
    // Brief's length and chapter count, the competitors' tables of contents
    // (a second, aliased embed) and whether any section has a version.
    async getOutlineContext(bookId) {
      const data = await readBook(bookId, `${POSITIONING_SELECT}, title, subtitle,
        plan:book_briefs ( length_range, target_words, chapter_count ),
        tocs:competitors ( title, toc, created_at ),
        chapters ( sections ( section_versions!section_versions_section_id_fkey ( count ) ) )`);
      const ctx = data && positioningContext(data);
      if (!ctx) return null;
      const plan = one(data.plan) as OutlineContext["plan"] | null;
      // deno-lint-ignore no-explicit-any
      const versions = (data.chapters ?? []).flatMap((c: any) => c.sections ?? []).reduce((n: number, s: any) => n + (s.section_versions?.[0]?.count ?? 0), 0);
      return {
        ...ctx,
        book: { title: data.title ?? null, subtitle: data.subtitle ?? null },
        plan: plan ?? { length_range: null, target_words: null, chapter_count: null },
        tocs: (data.tocs ?? []) as OutlineContext["tocs"],
        hasWriting: versions > 0,
      };
    },

    // As the user (RLS), one transaction (0016). The function raises
    // "has_writing" or "positioning_not_locked" (P0001) when it refuses.
    async replaceOutline(bookId, outline) {
      const { data, error } = await asUser.rpc("replace_outline", { p_book_id: bookId, p_outline: outline });
      if (error) {
        throw error.message === "has_writing" || error.message === "positioning_not_locked" ? { code: error.message } : error;
      }
      return (data ?? []) as unknown[];
    },

    // The positioning read, plus the saved outline in order (0016
    // outline_json, as the user). A book that is not the caller's reads as null.
    async getOutlineCheckContext(bookId) {
      const data = await readBook(bookId, POSITIONING_SELECT);
      const ctx = data && positioningContext(data);
      if (!ctx) return null;
      const { data: outline, error } = await asUser.rpc("outline_json", { p_book_id: bookId });
      if (error) throw error;
      return { ...ctx, outline: (outline ?? []) as OutlineRow[] };
    },

    // Service role (0017 lets only this role write outline_checks). The book
    // was read through RLS as the caller first, and the 0017 trigger checks
    // that user_id owns the book. One row per book: a new check replaces it.
    async saveOutlineCheck({ bookId, userId, findings, inputsKey, checkedAt }) {
      const { data, error } = await admin()
        .from("outline_checks")
        .upsert({ book_id: bookId, user_id: userId, findings, inputs_key: inputsKey, checked_at: checkedAt }, { onConflict: "book_id" })
        .select("checked_at, inputs_key")
        .single();
      if (error) throw error;
      return data as { checked_at: string; inputs_key: string };
    },

    // section_write (E10.2), all through RLS as the caller: the positioning
    // read, the approval, the outline (0016 outline_json), the section's
    // current version and draft, the previous section's current version (in
    // reading order) and the section's last run. null = not the caller's book
    // or a section that is not in it.
    async getWriteContext(bookId, sectionId) {
      const data = await readBook(bookId, `${POSITIONING_SELECT}, title, subtitle, outline_approved_at`);
      const ctx = data && positioningContext(data);
      if (!ctx) return null;
      const { data: outline, error } = await asUser.rpc("outline_json", { p_book_id: bookId });
      if (error) throw error;
      const rows = (outline ?? []) as WriteChapterRow[];
      const order = rows.flatMap((c) => c.sections);
      const at = order.findIndex((x) => x.id === sectionId);
      if (at < 0) return null;
      const ids = [order[at].current_version_id, at > 0 ? order[at - 1].current_version_id : null].filter((x): x is string => !!x);
      const [versions, draft, run] = await Promise.all([
        ids.length ? asUser.from("section_versions").select("id, content").in("id", ids) : Promise.resolve({ data: [], error: null }),
        asUser.from("section_drafts").select("content").eq("section_id", sectionId).maybeSingle(),
        asUser.from("section_runs").select("state, heartbeat_at, started_at").eq("section_id", sectionId).maybeSingle(),
      ]);
      for (const r of [versions, draft, run]) if (r.error) throw r.error;
      const text = (id: string | null) => ((versions.data ?? []) as { id: string; content: string }[]).find((v) => v.id === id)?.content ?? null;
      const cur = order[at].current_version_id;
      return {
        ...ctx,
        book: { title: data.title ?? null, subtitle: data.subtitle ?? null, outline_approved_at: data.outline_approved_at ?? null },
        outline: rows,
        sectionId,
        current: cur && text(cur) !== null ? { id: cur, content: text(cur)! } : null,
        draft: (draft.data as { content: string } | null)?.content ?? null,
        previous: at > 0 ? text(order[at - 1].current_version_id) ?? "" : "",
        run: (run.data as WriteContext["run"]) ?? null,
      } satisfies WriteContext;
    },

    // Fresh running runs only: a stale one's reserve is released (rule A).
    async sumRunningReserves(userId) {
      const fresh = new Date(Date.now() - 20_000).toISOString();
      const young = new Date(Date.now() - 160_000).toISOString();
      const { data, error } = await asUser
        .from("section_runs")
        .select("reserved_tokens")
        .eq("user_id", userId)
        .eq("state", "running")
        .gt("heartbeat_at", fresh)
        .gt("started_at", young);
      if (error) throw error;
      return (data ?? []).reduce((n, r) => n + (r.reserved_tokens as number), 0);
    },

    // The run RPCs (0020) are executable by the service role only. Refusals
    // come back as { code } with the exception name.
    async beginSectionRun(a) {
      const { data, error } = await admin().rpc("section_run_begin", {
        p_user_id: a.userId, p_book_id: a.bookId, p_section_id: a.sectionId, p_run_id: a.runId,
        p_base_version_id: a.baseVersionId, p_reserved: a.reserved, p_model: a.model,
      });
      if (error) {
        const known = ["version_conflict", "unsaved_draft", "run_in_progress", "section_not_found"];
        throw known.includes(error.message) ? { code: error.message } : error;
      }
      const d = data as { usage_id: number | null; recovered: number | null };
      return { usageId: d.usage_id ?? null, recovered: d.recovered ?? null };
    },

    async beatSectionRun(runId, content, input, output) {
      const { data, error } = await admin().rpc("section_run_beat", { p_run_id: runId, p_content: content, p_input: input, p_output: output });
      if (error) throw error;
      return data as { running: boolean; stop: boolean };
    },

    async finishSectionRun(a) {
      const { data, error } = await admin().rpc("section_run_finish", {
        p_run_id: a.runId, p_text: a.text, p_partial: a.partial, p_end_reason: a.endReason, p_status: a.status,
        p_counted: a.counted, p_input: a.input, p_output: a.output, p_estimated: a.estimated,
      });
      if (error) throw error.message === "run_not_running" ? { code: "run_not_running" } : error;
      return data as { version_id: string | null; version_no: number | null; word_count: number | null; current: boolean; partial: boolean; conflict: boolean };
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
      const { error } = await admin().from("ai_usage").insert(row);
      if (error) throw error;
    },
  };
}

// section_write (E10.2): keep a run alive after its response, and stop and
// save every open run when the platform shuts the worker down.
// deno-lint-ignore no-explicit-any
const edge = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
addEventListener("beforeunload", (e) => {
  // deno-lint-ignore no-explicit-any
  console.error(`generate: shutdown ${(e as any)?.detail?.reason ?? "unknown"}`);
  stopAllRuns("shutdown");
});

Deno.serve(makeHandler({
  env: (name) => Deno.env.get(name),
  openStore,
  fetchFn: fetch,
  now: () => new Date(),
  waitUntil: edge?.waitUntil ? (p) => edge.waitUntil!(p) : undefined,
  writeTiming: WRITE_TIMING,
}));
