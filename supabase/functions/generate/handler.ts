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
  getMonthlyLimit(): Promise<number | null>;          // null = no settings row yet
  sumCountedTokensSince(userId: string, iso: string): Promise<number>;
  countCallsSince(userId: string, iso: string): Promise<number>;
  logUsage(row: UsageRow): Promise<void>;
}

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

      const out = L.interpretResponse(input.stage, httpOk, body, job.stage === "review_insights" ? job.books : []);
      if (httpOk && out.code && out.code !== "not_enough_facts" && out.code !== "not_amazon_page") {
        console.error(`generate: provider result ${out.code} stop_reason=${(body as { stop_reason?: string } | null)?.stop_reason ?? "none"}`);
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
