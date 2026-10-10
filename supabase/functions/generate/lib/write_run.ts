/* generate lib: the section_write run (E10.2).

   The run is one promise (the AI stream, heartbeats, Stop, the save, the
   usage row), handed to waitUntil, so it ends and saves after the browser is
   gone. The response only passes the run's events on (SSE):
     start  { runId, aim, target, mode: "write" | "continue", recovered }
     text   { t }       new text since the last event (batched)
     done   { reason, partial, counted }
     saved  { versionId, versionNo, words, current, partial, conflict, flagged }
     error  { error: "save_failed" | "server_error" }       instead of saved
     ": ping"           a comment when nothing else was sent for a while
   How each end is counted (owner, E10.2):
     complete            normal version, current unless the base changed  ok       counted
     user_stop, disconnect (Stop, closed tab, lost connection)           stopped  counted, estimated
     timeout (soft deadline), too_long                                   stopped  not counted
     max_tokens                                                          stopped  not counted (exact)
     ai_error, shutdown                                                  failed   not counted
     refusal                                                             failed   not counted (exact)
   Every end but complete saves the text so far as a partial version (none
   when there is no text). A run another claim took over (stale, rule A)
   stops without saving. */

import type { Store } from "./types.ts";
import { WRITE_TIMING } from "./limits.ts";
import { capText, cleanSubset, estimateTokens, markUnsourced, mdWords, writeKnown, type WriteContext } from "./section_write.ts";
import { sseEvent, ssePing, sseReader } from "./sse.ts";

export type EndReason = "complete" | "user_stop" | "disconnect" | "timeout" | "max_tokens" | "ai_error" | "refusal" | "too_long" | "shutdown";
export type WriteTiming = { beatMs: number; flushMs: number; pingMs: number; firstTextMs: number; idleMs: number; softDeadlineMs: number; saveRetryMs: readonly number[] };

/** Every open run, so the shutdown event can stop and save them all. */
const OPEN_RUNS = new Set<(reason: EndReason) => void>();
export function stopAllRuns(reason: EndReason = "shutdown") {
  for (const stop of OPEN_RUNS) stop(reason);
}
export const openRunCount = () => OPEN_RUNS.size;

export type WriteJob = {
  stage: "section_write";
  ctx: WriteContext;
  bookId: string;
  sectionId: string;
  baseVersionId: string | null;
  aim: number;
  target: number | null;
  maxTokens: number;
  user: string;
  title: string | null;
  inputEstimate: number;
  reserve: number;
};

export type RunOptions = {
  store: Store;
  job: WriteJob;
  userId: string;
  runId: string;
  request: Record<string, unknown>;
  fetchFn: typeof fetch;
  apiKey: string;
  url: string;
  signal: AbortSignal | null;
  headers: Record<string, string>;
  timing?: Partial<WriteTiming>;
  waitUntil: (p: Promise<unknown>) => void;
};

/** What each end means for the saved version and the usage row. */
export function endPolicy(reason: EndReason) {
  switch (reason) {
    case "complete": return { partial: false, status: "ok" as const, counted: true };
    case "user_stop":
    case "disconnect": return { partial: true, status: "stopped" as const, counted: true };
    case "timeout":
    case "too_long":
    case "max_tokens": return { partial: true, status: "stopped" as const, counted: false };
    default: return { partial: true, status: "failed" as const, counted: false };
  }
}

type Begun = { usageId: number | null; recovered: number | null };

/**
 * Claim the section and call the AI. Errors before the stream come back as
 * { fail } (JSON for the browser, like every stage); otherwise the SSE response.
 */
export async function startWriteRun(o: RunOptions): Promise<{ fail: string; extra?: Record<string, unknown> } | { response: Response }> {
  const t: WriteTiming = { ...WRITE_TIMING, ...o.timing };
  const started = Date.now();
  const { job, store } = o;

  let begun: Begun;
  try {
    begun = await store.beginSectionRun({
      userId: o.userId, bookId: job.bookId, sectionId: job.sectionId, runId: o.runId,
      baseVersionId: job.baseVersionId, reserved: job.reserve, model: String(o.request.model),
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "version_conflict" || code === "unsaved_draft" || code === "run_in_progress") return { fail: code };
    if (code === "section_not_found") return { fail: "not_found" };
    throw err;
  }

  // The AI call. Headers must come within firstTextMs, or it counts as a failure.
  const ai = new AbortController();
  const headerTimer = setTimeout(() => ai.abort(), t.firstTextMs);
  let res: Response | null = null;
  try {
    res = await o.fetchFn(o.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(o.request),
      signal: ai.signal,
    });
  } catch (err) {
    console.error(`generate: section_write provider call failed: ${(err as Error)?.name ?? "Error"}`);
  } finally {
    clearTimeout(headerTimer);
  }
  if (!res || !res.ok || !res.body) {
    if (res) {
      const body = await res.json().catch(() => null) as { error?: { type?: string } } | null;
      console.error(`generate: section_write provider HTTP ${res.status} ${body?.error?.type ?? "unknown"} request-id=${res.headers.get("request-id") ?? "none"}`);
    }
    // Nothing was written and the AI said no: not counted, no tokens.
    await finishWithRetry(store, t, { runId: o.runId, text: "", partial: true, endReason: "ai_error", status: "failed", counted: false, input: 0, output: 0, estimated: false })
      .catch(() => null);
    return { fail: "ai_unavailable" };
  }

  return { response: streamRun(o, t, res, begun, started, ai) };
}

function streamRun(o: RunOptions, t: WriteTiming, res: Response, begun: Begun, started: number, ai: AbortController): Response {
  const { job, store } = o;
  const enc = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let clientGone = false;
  let lastSent = Date.now();
  const send = (s: string) => {
    if (clientGone || !ctrl) return;
    try { ctrl.enqueue(enc.encode(s)); lastSent = Date.now(); } catch { clientGone = true; }
  };

  let text = "";
  let sent = 0;
  let input: number | null = null;
  let outputSeen = 0;
  let outputFinal: number | null = null;
  let stopReason: string | null = null;
  let ended: EndReason | null = null;
  let takenOver = false;
  let gotText = false;
  let lastEvent = Date.now();

  const end = (reason: EndReason) => {
    if (ended) return;
    ended = reason;
    ai.abort();
  };

  const body = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c; },
    // The browser closed the tab or lost the connection: like Stop (answer 4).
    cancel() { clientGone = true; end("disconnect"); },
  });
  o.signal?.addEventListener("abort", () => { clientGone = true; end("disconnect"); });

  const run = (async () => {
    OPEN_RUNS.add(end);
    send(sseEvent("start", { runId: o.runId, aim: job.aim, target: job.target, mode: job.ctx.current && job.ctx.current.content.trim() ? "continue" : "write", recovered: begun.recovered ? { versionNo: begun.recovered } : null }));

    // Text to the browser in batches; the watchdog; heartbeats.
    let beating = false;
    let lastBeat = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      if (text.length > sent) { send(sseEvent("text", { t: text.slice(sent) })); sent = text.length; }
      else if (now - lastSent >= t.pingMs) send(ssePing);
      if (now - started >= t.softDeadlineMs) end("timeout");
      else if (!gotText && now - started >= t.firstTextMs) end("ai_error");
      else if (now - lastEvent >= t.idleMs) end("ai_error");
      if (!beating && now - lastBeat >= t.beatMs) {
        beating = true;
        lastBeat = now;
        store.beatSectionRun(o.runId, text, input ?? 0, Math.max(outputSeen, estimateTokens(text.length)))
          .then((b) => {
            if (!b.running) { takenOver = true; end("ai_error"); }
            else if (b.stop) end("user_stop");
          })
          .catch((err) => console.error(`generate: section_write beat failed: ${(err as { code?: string })?.code ?? "unknown"}`))
          .finally(() => { beating = false; });
      }
    }, t.flushMs);

    const reader = sseReader((e) => {
      lastEvent = Date.now();
      // deno-lint-ignore no-explicit-any
      const d = e.data as any;
      if (e.event === "message_start") {
        const u = d?.message?.usage ?? {};
        if (Number.isInteger(u.input_tokens)) input = u.input_tokens;
        if (Number.isInteger(u.output_tokens)) outputSeen = Math.max(outputSeen, u.output_tokens);
      } else if (e.event === "content_block_delta" && d?.delta?.type === "text_delta" && typeof d.delta.text === "string") {
        text += d.delta.text;
        gotText = gotText || d.delta.text.length > 0;
        if (text.length > 100_000) end("too_long");
      } else if (e.event === "message_delta") {
        if (typeof d?.delta?.stop_reason === "string") stopReason = d.delta.stop_reason;
        if (Number.isInteger(d?.usage?.output_tokens)) { outputSeen = d.usage.output_tokens; outputFinal = d.usage.output_tokens; }
      } else if (e.event === "error") {
        console.error(`generate: section_write stream error ${d?.error?.type ?? "unknown"}`);
        end("ai_error");
      }
    });

    try {
      const r = res.body!.getReader();
      const dec = new TextDecoder();
      while (!ended) {
        const { done, value } = await r.read();
        if (done) break;
        reader.push(dec.decode(value, { stream: true }));
      }
      reader.end();
      if (ended) await r.cancel().catch(() => {});
    } catch {
      // Aborted (Stop, deadline, disconnect) or the connection to the AI broke.
      if (!ended) end("ai_error");
    }
    clearInterval(tick);
    OPEN_RUNS.delete(end);
    if (!ended) {
      ended = stopReason === "end_turn" ? "complete" : stopReason === "max_tokens" ? "max_tokens" : stopReason === "refusal" ? "refusal" : "ai_error";
    }
    const reason = ended as EndReason;
    if (text.length > sent) { send(sseEvent("text", { t: text.slice(sent) })); sent = text.length; }

    const policy = endPolicy(reason);
    const estOut = Math.max(outputSeen, estimateTokens(text.length));
    const exact = reason === "complete" || reason === "max_tokens" || reason === "refusal";
    const inTokens = input ?? job.inputEstimate;
    const outTokens = exact && outputFinal !== null ? outputFinal : estOut;
    const estimated = !(exact && outputFinal !== null && input !== null);
    send(sseEvent("done", { reason, partial: policy.partial, counted: policy.counted }));

    console.log(`generate: section_write end=${reason} chars=${text.length} in=${inTokens} out=${outTokens} estimated=${estimated} ms=${Date.now() - started}`);

    if (takenOver) {
      // Another claim took this run over (stale): its crash copy was saved there.
      send(sseEvent("error", { error: "server_error" }));
      close();
      return;
    }

    const clean = capText(cleanSubset(text, job.title));
    const marked = markUnsourced(clean, writeKnown(job.ctx));
    try {
      const saved = await finishWithRetry(store, t, {
        runId: o.runId, text: marked.text, partial: policy.partial, endReason: reason, status: policy.status,
        counted: policy.counted, input: inTokens, output: outTokens, estimated,
      });
      send(sseEvent("saved", {
        versionId: saved.version_id, versionNo: saved.version_no, words: saved.word_count ?? mdWords(marked.text),
        current: saved.current, partial: saved.partial, conflict: saved.conflict, flagged: saved.version_id ? marked.flagged : 0,
      }));
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "unknown";
      console.error(`generate: section_write save failed: ${code}`);
      send(sseEvent("error", { error: code === "run_not_running" ? "server_error" : "save_failed" }));
    }
    close();
  })();

  function close() {
    if (clientGone || !ctrl) return;
    try { ctrl.close(); } catch { /* already closed */ }
  }

  o.waitUntil(run.catch((err) => console.error(`generate: section_write run failed: ${(err as Error)?.name ?? "Error"}`)));

  return new Response(body, {
    status: 200,
    headers: { ...o.headers, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

export type FinishArgs = {
  runId: string; text: string; partial: boolean; endReason: string; status: "ok" | "stopped" | "failed";
  counted: boolean; input: number; output: number; estimated: boolean;
};

/** The save, tried again after saveRetryMs. A taken-over run is not retried. */
async function finishWithRetry(store: Store, t: WriteTiming, a: FinishArgs) {
  let last: unknown = null;
  for (let i = 0; i <= t.saveRetryMs.length; i++) {
    try {
      return await store.finishSectionRun(a);
    } catch (err) {
      last = err;
      if ((err as { code?: string })?.code === "run_not_running") break;
      if (i < t.saveRetryMs.length) await new Promise((r) => setTimeout(r, t.saveRetryMs[i]));
    }
  }
  throw last;
}
