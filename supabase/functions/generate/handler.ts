/* ═══════════════════════════════════════════════════
   KDP Lab — generate: request flow
   supabase/functions/generate/handler.ts

   Database access and fetch come in as dependencies, so tests run the
   whole flow with fakes (handler.test.ts). index.ts passes the real ones.
═══════════════════════════════════════════════════ */

import * as L from "./lib.ts";

export type UsageRow = {
  user_id: string;
  book_id?: string;                                  // only for stages that work on a book
  stage: L.Stage;
  model: string;
  input_tokens: number;
  output_tokens: number;
  status: "ok" | "failed" | "stopped";
  counted: boolean;
};

/** Reads run as the caller (RLS). logUsage runs with the service role. Errors throw. */
export interface Store {
  getUserId(): Promise<string | null>;
  getPenName(id: string): Promise<L.PenRow | null>;
  getTopic(id: string): Promise<L.TopicRow | null>;
  getBriefContext(bookId: string): Promise<L.BriefContext | null>;
  getReviewContext(bookId: string): Promise<L.ReviewContext | null>;
  getPositioningContext(bookId: string): Promise<L.PositioningContext | null>;
  /**
   * Save a drift check (service role). Writes only when the row is still
   * unlocked and unchanged since it was read (same updated_at). null = changed.
   */
  saveDriftFlags(s: DriftSave): Promise<{ drift_checked_at: string; updated_at: string } | null>;
  getTitleContext(bookId: string): Promise<L.TitleContext | null>;
  /** Insert title options as the user (RLS). 0011 caps them at 40 per book: that error has code "options_full". */
  saveTitleOptions(bookId: string, ideas: L.TitleIdea[]): Promise<SavedTitleOption[]>;
  getMonthlyLimit(): Promise<number | null>;          // null = no settings row yet
  sumCountedTokensSince(userId: string, iso: string): Promise<number>;
  countCallsSince(userId: string, iso: string): Promise<number>;
  logUsage(row: UsageRow): Promise<void>;
}

export type SavedTitleOption = L.TitleIdea & { id: string; shortlisted: boolean; created_at: string };

export type DriftSave = { bookId: string; userId: string; flags: L.DriftFlag[]; checkedAt: string; readUpdatedAt: string };

export type Deps = {
  env: (name: string) => string | undefined;
  openStore: (authHeader: string) => Store;
  fetchFn: typeof fetch;
  now: () => Date;
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Read the body, stopping as soon as it passes the byte cap. null = too large. */
async function readCapped(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return new TextDecoder().decode(all);
}

export function makeHandler(deps: Deps) {
  return async function handle(req: Request): Promise<Response> {
    const cors = L.corsHeaders(req.headers.get("origin"));
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    const fail = (code: L.ErrorCode, extra: Record<string, unknown> = {}) =>
      reply(L.ERROR_STATUS[code], { error: code, ...extra });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return fail("method_not_allowed");

    try {
      // The API key is only checked for presence. It is never logged or returned.
      if (!deps.env("ANTHROPIC_API_KEY")) {
        console.error("generate: missing secret ANTHROPIC_API_KEY");
        return fail("server_error");
      }

      // 1. Who is calling (the gateway also verifies the JWT: verify_jwt on).
      const auth = req.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(auth)) return fail("unauthorized");
      const store = deps.openStore(auth);
      const userId = await store.getUserId();
      if (!userId) return fail("unauthorized");

      // 2. Input.
      const raw = await readCapped(req, L.MAX_BODY_BYTES);
      if (raw === null) return fail("bad_request");
      const input = L.parseInput(raw);
      if (!input) return fail("bad_request");

      // 3. The parent row, read through RLS. Someone else's id reads as missing.
      let job: L.Job;
      if (input.stage === "bio") {
        const pen = await store.getPenName(input.penNameId);
        if (!pen) return fail("not_found");
        if (!L.hasAnyFact(pen.bio_facts)) return fail("not_enough_facts");
        job = { stage: "bio", pen };
      } else if (input.stage === "amazon_import") {
        const topic = await store.getTopic(input.topicId);
        if (!topic) return fail("not_found");
        job = { stage: "amazon_import", text: input.text };
      } else if (input.stage === "brief_help") {
        const ctx = await store.getBriefContext(input.bookId);
        if (!ctx) return fail("not_found");
        if (!L.hasTopic(ctx)) return fail("not_enough_facts", { missing: "" });
        job = { stage: "brief_help", ctx };
      } else if (input.stage === "title_ideas") {
        // The server reads the locked positioning, Brief, Research, examples and saved options.
        const ctx = await store.getTitleContext(input.bookId);
        if (!ctx) return fail("not_found");
        if (!ctx.positioning?.locked_at) return fail("positioning_not_locked");
        const want = L.titleIdeasWanted(ctx.options.length);
        if (!want) return fail("options_full");
        job = { stage: "title_ideas", ctx, want };
      } else if (input.stage === "positioning_help" || input.stage === "drift_check") {
        // The server reads the Brief, Research and the SAVED positioning; the browser sends only ids.
        const ctx = await store.getPositioningContext(input.bookId);
        if (!ctx) return fail("not_found");
        if (ctx.positioning?.locked_at) return fail("positioning_locked");
        if (input.stage === "positioning_help") {
          if (!L.positioningHasTopic(ctx)) return fail("not_enough_facts", { missing: "" });
          job = { stage: "positioning_help", ctx, field: input.field };
        } else {
          if (!L.hasPositioningText(ctx.positioning)) return fail("nothing_to_check");
          job = { stage: "drift_check", ctx };
        }
      } else {
        // The server reads the pasted reviews itself; the browser sends only the id.
        const ctx = await store.getReviewContext(input.bookId);
        if (!ctx) return fail("not_found");
        const books = L.reviewedBooks(ctx);
        if (books.length < L.MIN_REVIEWED_BOOKS) return fail("not_enough_books", { have: books.length });
        job = { stage: "review_insights", ctx, books };
      }

      // 4. Limits, before any money is spent.
      const now = deps.now();
      const [limit, monthTokens, recent] = await Promise.all([
        store.getMonthlyLimit(),
        store.sumCountedTokensSince(userId, L.monthStartUtc(now)),
        store.countCallsSince(userId, new Date(now.getTime() - 60_000).toISOString()),
      ]);
      const limitCode = L.limitError({
        monthTokens,
        monthlyLimit: limit ?? L.DEFAULT_MONTHLY_LIMIT,
        callsLastMinute: recent,
      });
      if (limitCode) return fail(limitCode);

      // 5. The AI call.
      const request = L.buildRequest(job);
      let httpOk = false;
      let body: unknown = null;
      try {
        const res = await deps.fetchFn(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": deps.env("ANTHROPIC_API_KEY")!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(L.TIMEOUT_MS[input.stage]),
        });
        httpOk = res.ok;
        body = await res.json().catch(() => null);
        if (!res.ok) {
          const type = (body as { error?: { type?: string } } | null)?.error?.type ?? "unknown";
          console.error(`generate: provider HTTP ${res.status} ${type} request-id=${res.headers.get("request-id") ?? "none"}`);
        }
      } catch (err) {
        // Timeout (TimeoutError) or network failure. Only the error name is logged.
        console.error(`generate: provider call failed: ${(err as Error)?.name ?? "Error"}`);
      }

      let out = L.interpretJob(job, httpOk, body);
      if (httpOk && out.code && out.code !== "not_enough_facts" && out.code !== "not_amazon_page") {
        console.error(`generate: provider result ${out.code} stop_reason=${(body as { stop_reason?: string } | null)?.stop_reason ?? "none"}`);
      }

      // 5b. The drift check saves its own flags (service role), so the browser
      // cannot write a check result. The user gets nothing when the save does
      // not happen, so that call is not counted.
      let saved: { drift_checked_at: string; updated_at: string } | null = null;
      if (job.stage === "drift_check" && !out.code) {
        try {
          saved = await store.saveDriftFlags({
            bookId: job.ctx.bookId,
            userId,
            flags: out.flags!,
            checkedAt: now.toISOString(),
            readUpdatedAt: job.ctx.positioning!.updated_at,
          });
          if (!saved) out = { ...out, counted: false, code: "positioning_changed" };
        } catch (err) {
          console.error(`generate: drift save failed: ${(err as { code?: string })?.code ?? "unknown"}`);
          out = { ...out, counted: false, code: "server_error" };
        }
      }

      // 5c. Title options are saved by the server, so "More ideas" only adds.
      // When the save fails the author gets nothing, so the call is not counted.
      let options: SavedTitleOption[] = [];
      if (job.stage === "title_ideas" && !out.code) {
        try {
          options = await store.saveTitleOptions(job.ctx.bookId, out.titles!);
        } catch (err) {
          const full = (err as { code?: string })?.code === "options_full";
          if (!full) console.error(`generate: title save failed: ${(err as { code?: string })?.code ?? "unknown"}`);
          out = { ...out, counted: false, code: full ? "options_full" : "server_error" };
        }
      }

      // 6. Log every call that reached the provider.
      try {
        await store.logUsage({
          user_id: userId,
          ...("bookId" in input ? { book_id: input.bookId } : {}),
          stage: input.stage,
          model: request.model,
          input_tokens: out.inputTokens,
          output_tokens: out.outputTokens,
          status: out.status,
          counted: out.counted,
        });
      } catch (err) {
        // The tokens are already spent, so the result is still returned.
        console.error(`generate: usage log failed: ${(err as { code?: string })?.code ?? "unknown"}`);
      }

      if (out.code === "not_enough_facts") return fail("not_enough_facts", { missing: out.missing ?? "" });
      if (out.code) return fail(out.code);
      if (input.stage === "amazon_import") return reply(200, { stage: input.stage, books: out.books });
      if (input.stage === "brief_help") return reply(200, { stage: input.stage, suggestions: out.suggestions });
      if (input.stage === "positioning_help") return reply(200, { stage: input.stage, suggestions: out.positioning, unsourced: out.unsourced });
      if (input.stage === "drift_check") return reply(200, { stage: input.stage, flags: out.flags, ...saved });
      if (input.stage === "title_ideas") return reply(200, { stage: input.stage, options });
      // analyzed_at comes from the server clock; the browser saves it with the lines.
      if (job.stage === "review_insights") return reply(200, { stage: input.stage, insights: out.insights, books: job.books.length, analyzed_at: now.toISOString() });
      return reply(200, { stage: input.stage, bio: out.bio, words: L.wordCount(out.bio!) });
    } catch (err) {
      // Database and config errors carry no secrets. Provider errors never reach here.
      console.error(`generate: unexpected ${(err as Error)?.name ?? "Error"}: ${String((err as Error)?.message ?? "").slice(0, 200)}`);
      return fail("server_error");
    }
  };
}
