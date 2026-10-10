/* ═══════════════════════════════════════════════════
   KDP Lab — generate: request flow
   supabase/functions/generate/handler.ts

   Database access and fetch come in as dependencies, so tests run the
   whole flow with fakes (handler*.test.ts). index.ts passes the real ones.
   Each stage runs through the stage table (lib/stages.ts).
═══════════════════════════════════════════════════ */

import * as L from "./lib.ts";

// The Store types live in lib/types.ts (Batch B1); the tests import them from here.
export type { DriftSave, OutlineCheckSave, RunBegin, RunFinish, RunSaved, SavedTitleOption, Store, UsageRow } from "./lib/types.ts";
import type { Store } from "./lib/types.ts";

export type Deps = {
  env: (name: string) => string | undefined;
  openStore: (authHeader: string) => Store;
  fetchFn: typeof fetch;
  now: () => Date;
  /** section_write (E10.2): keeps the run alive after the response (EdgeRuntime.waitUntil). */
  waitUntil?: (p: Promise<unknown>) => void;
  /** section_write: the run's timers (tests pass small ones). */
  writeTiming?: Partial<L.WriteTiming>;
  /** section_write: the run id (tests pass a fixed one). */
  uuid?: () => string;
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
      // Then the stage's own checks, before any money is spent (lib/stages.ts).
      const def = L.stageDef(input.stage);
      const ctx = await def.read(store, input);
      if (!ctx) return fail("not_found");
      const checked: L.Job | L.StageFail = def.check(input, ctx);
      if (L.isFail(checked)) return fail(checked.fail, checked.extra);
      const job = checked;

      // 4. Limits, before any money is spent. section_write (E10.2) also
      // reserves what it can use, plus the user's other running runs.
      const now = deps.now();
      const write = job.stage === "section_write" ? job : null;
      const [limit, monthTokens, recent, running] = await Promise.all([
        store.getMonthlyLimit(),
        store.sumCountedTokensSince(userId, L.monthStartUtc(now)),
        store.countCallsSince(userId, new Date(now.getTime() - 60_000).toISOString()),
        write ? store.sumRunningReserves(userId) : Promise.resolve(0),
      ]);
      const limitCode = L.limitError({
        monthTokens,
        monthlyLimit: limit ?? L.DEFAULT_MONTHLY_LIMIT,
        callsLastMinute: recent,
        reserve: write ? write.reserve + running : 0,
      });
      if (limitCode) return fail(limitCode);

      // 5w. section_write streams (lib/write_run.ts): the claim, the AI call,
      // then the SSE response; the run saves its own version and usage row.
      if (write) {
        const r = await L.startWriteRun({
          store, job: write, userId, runId: deps.uuid ? deps.uuid() : crypto.randomUUID(),
          request: L.writeRequest(L.MODEL_FOR_STAGE.section_write, L.WRITE_SYSTEM, write.user, write.maxTokens), fetchFn: deps.fetchFn, apiKey: deps.env("ANTHROPIC_API_KEY")!,
          url: ANTHROPIC_URL, signal: req.signal ?? null, headers: cors, timing: deps.writeTiming,
          waitUntil: deps.waitUntil ?? ((p) => { p.catch(() => {}); }),
        });
        if ("fail" in r) return fail(r.fail as L.ErrorCode);
        return r.response;
      }

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
      if (httpOk && out.code && out.code !== "not_enough_facts" && out.code !== "not_amazon_page" && out.code !== "not_product_page") {
        console.error(`generate: provider result ${out.code} stop_reason=${(body as { stop_reason?: string } | null)?.stop_reason ?? "none"}`);
      }

      // 5b. drift_check, title_ideas, outline_ideas and outline_check save their own results (see lib/stages.ts).
      // A save that does not happen changes the outcome: not counted.
      let saved: unknown = null;
      if (def.save && !out.code) ({ out, saved } = await def.save(store, job, out, { userId, now }));

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
      return reply(200, def.reply(job, out, saved, { userId, now }));
    } catch (err) {
      // Database and config errors carry no secrets. Provider errors never reach here.
      console.error(`generate: unexpected ${(err as Error)?.name ?? "Error"}: ${String((err as Error)?.message ?? "").slice(0, 200)}`);
      return fail("server_error");
    }
  };
}
