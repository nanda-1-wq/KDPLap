/* generate lib: the stage table.

   One entry per stage. The handler runs every request through it:
     read       the parent row, through RLS (null = 404)
     check      pre-checks before any money is spent; the Job, or an error code
     prompt     [system, schema, user message]
     interpret  the provider reply as an Outcome
     save       optional: drift_check, title_ideas, outline_ideas and outline_check save their own results
     reply      the 200 body
   A stage with no entry throws "generate: unknown stage". */

import { type Outcome, wordCount } from "./common.ts";
import { type ErrorCode, type GenerateInput, MIN_REVIEWED_BOOKS, MODEL_FOR_STAGE, MAX_TOKENS, type PositioningField, type Stage } from "./limits.ts";
import { BIO_SCHEMA, BIO_SYSTEM, bioUserMessage, hasAnyFact, interpretBio, type PenRow } from "./bio.ts";
import { IMPORT_SCHEMA, IMPORT_SYSTEM, importUserMessage, interpretImport, type TopicRow } from "./amazon_import.ts";
import { COMPETITOR_SCHEMA, COMPETITOR_SYSTEM, competitorUserMessage, interpretCompetitorImport } from "./competitor_import.ts";
import { BRIEF_SCHEMA, BRIEF_SYSTEM, type BriefContext, briefKnownText, briefUserMessage, hasTopic, interpretBriefHelp } from "./brief_help.ts";
import { type Competitor, interpretReviewInsights, REVIEW_SCHEMA, REVIEW_SYSTEM, type ReviewContext, reviewedBooks, reviewUserMessage } from "./review_insights.ts";
import { hasPositioningText, knownText, type PositioningContext, positioningHasTopic, positioningValues } from "./context.ts";
import { helpFields, interpretPositioningHelp, POSITIONING_SCHEMA, POSITIONING_SYSTEM, positioningUserMessage } from "./positioning_help.ts";
import { DRIFT_SCHEMA, DRIFT_SYSTEM, driftUserMessage, interpretDriftCheck } from "./drift_check.ts";
import { interpretTitleIdeas, type TitleContext, titleIdeasWanted, TITLE_SCHEMA, TITLE_SYSTEM, titleUserMessage } from "./title_ideas.ts";
import { interpretOutline, OUTLINE_SCHEMA, OUTLINE_SYSTEM, type OutlineContext, type OutlineTarget, outlineTarget, outlineUserMessage } from "./outline_ideas.ts";
import { interpretOutlineCheck, OUTLINE_CHECK_SCHEMA, OUTLINE_CHECK_SYSTEM, type OutlineCheckContext, outlineChapters, outlineCheckKnown, outlineCheckUserMessage, type OutlineRow, outlineKey } from "./outline_check.ts";
import type { SavedTitleOption, Store } from "./types.ts";

export type Job =
  | { stage: "bio"; pen: PenRow }
  | { stage: "amazon_import"; text: string }
  | { stage: "brief_help"; ctx: BriefContext }
  | { stage: "review_insights"; ctx: ReviewContext; books: Competitor[] }
  | { stage: "positioning_help"; ctx: PositioningContext; field: PositioningField | null }
  | { stage: "drift_check"; ctx: PositioningContext }
  | { stage: "title_ideas"; ctx: TitleContext; want: number }
  | { stage: "competitor_import"; text: string }
  | { stage: "outline_ideas"; ctx: OutlineContext; per: number; target: OutlineTarget; chapters: number | null }
  | { stage: "outline_check"; ctx: OutlineCheckContext; chapters: OutlineRow[]; key: string };

/** A pre-check that stops the call: the error code and any extra reply fields. */
export type StageFail = { fail: ErrorCode; extra?: Record<string, unknown> };

/** What the reply step needs besides the job and the outcome. */
export type RunInfo = { userId: string; now: Date };

type JobOf<S extends Stage> = Extract<Job, { stage: S }>;
type InputOf<S extends Stage> = Extract<GenerateInput, { stage: S }>;

export type StageDef<S extends Stage, C> = {
  read(store: Store, input: InputOf<S>): Promise<C | null>;
  check(input: InputOf<S>, ctx: C): JobOf<S> | StageFail;
  prompt(job: JobOf<S>): [string, unknown, string];
  interpret(job: JobOf<S>, httpOk: boolean, body: unknown): Outcome;
  /** For the stages that work without their job's data (interpretResponse). */
  interpretAlone?(httpOk: boolean, body: unknown, books: Competitor[]): Outcome;
  /** Runs only after a successful interpret. Returns the outcome (maybe changed) and what was saved. */
  save?(store: Store, job: JobOf<S>, out: Outcome, run: RunInfo): Promise<{ out: Outcome; saved: unknown }>;
  reply(job: JobOf<S>, out: Outcome, saved: unknown, run: RunInfo): Record<string, unknown>;
};

/** The positioning stages refuse a locked positioning before anything else. */
const lockedFail = (ctx: PositioningContext): StageFail | null =>
  ctx.positioning?.locked_at ? { fail: "positioning_locked" } : null;

const bio: StageDef<"bio", PenRow> = {
  read: (store, input) => store.getPenName(input.penNameId),
  check: (_input, pen) => (hasAnyFact(pen.bio_facts) ? { stage: "bio", pen } : { fail: "not_enough_facts" }),
  prompt: (job) => [BIO_SYSTEM, BIO_SCHEMA, bioUserMessage(job.pen)],
  interpret: (_job, httpOk, body) => interpretBio(httpOk, body),
  interpretAlone: (httpOk, body) => interpretBio(httpOk, body),
  reply: (_job, out) => ({ stage: "bio", bio: out.bio, words: wordCount(out.bio!) }),
};

const amazonImport: StageDef<"amazon_import", TopicRow> = {
  read: (store, input) => store.getTopic(input.topicId),
  check: (input) => ({ stage: "amazon_import", text: input.text }),
  prompt: (job) => [IMPORT_SYSTEM, IMPORT_SCHEMA, importUserMessage(job.text)],
  interpret: (_job, httpOk, body) => interpretImport(httpOk, body),
  interpretAlone: (httpOk, body) => interpretImport(httpOk, body),
  reply: (_job, out) => ({ stage: "amazon_import", books: out.books }),
};

const briefHelp: StageDef<"brief_help", BriefContext> = {
  read: (store, input) => store.getBriefContext(input.bookId),
  check: (_input, ctx) => (hasTopic(ctx) ? { stage: "brief_help", ctx } : { fail: "not_enough_facts", extra: { missing: "" } }),
  prompt: (job) => [BRIEF_SYSTEM, BRIEF_SCHEMA, briefUserMessage(job.ctx)],
  interpret: (job, httpOk, body) => interpretBriefHelp(httpOk, body, briefKnownText(job.ctx)),
  // Without the job's data nothing counts as a source.
  interpretAlone: (httpOk, body) => interpretBriefHelp(httpOk, body, ""),
  reply: (_job, out) => ({ stage: "brief_help", suggestions: out.suggestions, unsourced: out.unsourced }),
};

// The server reads the pasted reviews itself; the browser sends only the id.
const reviewInsights: StageDef<"review_insights", ReviewContext> = {
  read: (store, input) => store.getReviewContext(input.bookId),
  check: (_input, ctx) => {
    const books = reviewedBooks(ctx);
    if (books.length < MIN_REVIEWED_BOOKS) return { fail: "not_enough_books", extra: { have: books.length } };
    return { stage: "review_insights", ctx, books };
  },
  prompt: (job) => [REVIEW_SYSTEM, REVIEW_SCHEMA, reviewUserMessage(job.ctx, job.books)],
  interpret: (job, httpOk, body) => interpretReviewInsights(httpOk, body, job.books),
  interpretAlone: (httpOk, body, books) => interpretReviewInsights(httpOk, body, books),
  // analyzed_at comes from the server clock; the browser saves it with the lines.
  reply: (job, out, _saved, run) => ({ stage: "review_insights", insights: out.insights, books: job.books.length, analyzed_at: run.now.toISOString() }),
};

// The server reads the Brief, Research and the SAVED positioning; the browser sends only ids.
const positioningHelp: StageDef<"positioning_help", PositioningContext> = {
  read: (store, input) => store.getPositioningContext(input.bookId),
  check: (input, ctx) => {
    const locked = lockedFail(ctx);
    if (locked) return locked;
    if (!positioningHasTopic(ctx)) return { fail: "not_enough_facts", extra: { missing: "" } };
    return { stage: "positioning_help", ctx, field: input.field };
  },
  prompt: (job) => [POSITIONING_SYSTEM, POSITIONING_SCHEMA, positioningUserMessage(job.ctx, job.field)],
  interpret: (job, httpOk, body) => interpretPositioningHelp(httpOk, body, helpFields(job.field), knownText(job.ctx)),
  reply: (_job, out) => ({ stage: "positioning_help", suggestions: out.positioning, unsourced: out.unsourced }),
};

const driftCheck: StageDef<"drift_check", PositioningContext> = {
  read: (store, input) => store.getPositioningContext(input.bookId),
  check: (_input, ctx) => {
    const locked = lockedFail(ctx);
    if (locked) return locked;
    if (!hasPositioningText(ctx.positioning)) return { fail: "nothing_to_check" };
    return { stage: "drift_check", ctx };
  },
  prompt: (job) => [DRIFT_SYSTEM, DRIFT_SCHEMA, driftUserMessage(job.ctx)],
  interpret: (job, httpOk, body) =>
    interpretDriftCheck(httpOk, body, positioningValues(job.ctx.positioning), job.ctx.positioning?.drift_flags),
  // The drift check saves its own flags (service role), so the browser
  // cannot write a check result. The user gets nothing when the save does
  // not happen, so that call is not counted.
  save: async (store, job, out, run) => {
    let saved: { drift_checked_at: string; updated_at: string } | null = null;
    try {
      saved = await store.saveDriftFlags({
        bookId: job.ctx.bookId,
        userId: run.userId,
        flags: out.flags!,
        checkedAt: run.now.toISOString(),
        readUpdatedAt: job.ctx.positioning!.updated_at,
      });
      if (!saved) out = { ...out, counted: false, code: "positioning_changed" };
    } catch (err) {
      console.error(`generate: drift save failed: ${(err as { code?: string })?.code ?? "unknown"}`);
      out = { ...out, counted: false, code: "server_error" };
    }
    return { out, saved };
  },
  reply: (_job, out, saved) => ({ stage: "drift_check", flags: out.flags, ...(saved as object | null) }),
};

// The server reads the locked positioning, Brief, Research, examples and saved options.
const titleIdeas: StageDef<"title_ideas", TitleContext> = {
  read: (store, input) => store.getTitleContext(input.bookId),
  check: (_input, ctx) => {
    if (!ctx.positioning?.locked_at) return { fail: "positioning_not_locked" };
    const want = titleIdeasWanted(ctx.options.length);
    if (!want) return { fail: "options_full" };
    return { stage: "title_ideas", ctx, want };
  },
  prompt: (job) => [TITLE_SYSTEM, TITLE_SCHEMA, titleUserMessage(job.ctx, job.want)],
  interpret: (job, httpOk, body) => interpretTitleIdeas(httpOk, body, job.ctx, job.want),
  // Title options are saved by the server, so "More ideas" only adds.
  // When the save fails the author gets nothing, so the call is not counted.
  save: async (store, job, out) => {
    let options: SavedTitleOption[] = [];
    try {
      options = await store.saveTitleOptions(job.ctx.bookId, out.titles!);
    } catch (err) {
      const full = (err as { code?: string })?.code === "options_full";
      if (!full) console.error(`generate: title save failed: ${(err as { code?: string })?.code ?? "unknown"}`);
      out = { ...out, counted: false, code: full ? "options_full" : "server_error" };
    }
    return { out, saved: options };
  },
  reply: (_job, _out, saved) => ({ stage: "title_ideas", options: saved ?? [] }),
};

// One book's product page (Batch C2). The book is read through RLS; nothing is
// saved: the browser fills the Add competitor form. The reply check needs the
// page text, so there is no interpretAlone.
const competitorImport: StageDef<"competitor_import", { id: string }> = {
  read: (store, input) => store.getBook(input.bookId),
  check: (input) => ({ stage: "competitor_import", text: input.text }),
  prompt: (job) => [COMPETITOR_SYSTEM, COMPETITOR_SCHEMA, competitorUserMessage(job.text)],
  interpret: (job, httpOk, body) => interpretCompetitorImport(httpOk, body, job.text),
  reply: (_job, out) => ({ stage: "competitor_import", competitor: out.competitor }),
};

// Step 05 (E9.1). The server reads the locked positioning, Brief, Research,
// the book title and the competitors' tables of contents; the browser sends
// only the id and the sections per chapter. The server saves the outline
// itself (replace_outline, as the user), so a stopped call in the browser
// still leaves a whole outline, never half of one.
const outlineIdeas: StageDef<"outline_ideas", OutlineContext> = {
  read: (store, input) => store.getOutlineContext(input.bookId),
  check: (input, ctx) => {
    if (!ctx.positioning?.locked_at) return { fail: "positioning_not_locked" };
    if (!positioningHasTopic(ctx)) return { fail: "not_enough_facts", extra: { missing: "" } };
    if (ctx.hasWriting) return { fail: "has_writing" };
    return { stage: "outline_ideas", ctx, per: input.sectionsPerChapter, target: outlineTarget(ctx.plan), chapters: ctx.plan.chapter_count };
  },
  prompt: (job) => [OUTLINE_SYSTEM, OUTLINE_SCHEMA, outlineUserMessage(job.ctx, job.per, job.target, job.chapters)],
  interpret: (job, httpOk, body) => interpretOutline(httpOk, body, job, knownText(job.ctx)),
  // When the save does not happen the author gets nothing, so the call is not counted.
  save: async (store, job, out) => {
    let saved: unknown[] = [];
    try {
      saved = await store.replaceOutline(job.ctx.bookId, out.outline!);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const known = code === "has_writing" || code === "positioning_not_locked";
      if (!known) console.error(`generate: outline save failed: ${code ?? "unknown"}`);
      out = { ...out, counted: false, code: known ? code as "has_writing" | "positioning_not_locked" : "server_error" };
    }
    return { out, saved };
  },
  reply: (job, out, saved) => ({
    stage: "outline_ideas",
    chapters: saved ?? [],
    rescaled: !!out.rescaled,
    target: job.target,
    aiPickedChapters: job.chapters === null,
  }),
};

// Step 05 (E9.2). The server reads the saved outline, the locked positioning,
// the Brief and Research; the browser sends only the id. The result is saved
// by the server (service role, 0017), with the fingerprint of the outline it
// read: an edit made during the call shows the result "Out of date" at once.
const outlineCheck: StageDef<"outline_check", OutlineCheckContext> = {
  read: (store, input) => store.getOutlineCheckContext(input.bookId),
  check: (_input, ctx) => {
    if (!ctx.positioning?.locked_at) return { fail: "positioning_not_locked" };
    const chapters = outlineChapters(ctx.outline);
    if (!chapters.some((c) => (c.title ?? "").trim())) return { fail: "nothing_to_check" };
    return { stage: "outline_check", ctx, chapters, key: outlineKey(ctx.outline, ctx.positioning.locked_at) };
  },
  prompt: (job) => [OUTLINE_CHECK_SYSTEM, OUTLINE_CHECK_SCHEMA, outlineCheckUserMessage(job.ctx)],
  interpret: (job, httpOk, body) =>
    interpretOutlineCheck(httpOk, body, job.chapters, positioningValues(job.ctx.positioning).reader_promise, outlineCheckKnown(job.ctx)),
  // When the save does not happen the author gets nothing, so the call is not counted.
  save: async (store, job, out, run) => {
    let saved: { checked_at: string; inputs_key: string } | null = null;
    try {
      saved = await store.saveOutlineCheck({
        bookId: job.ctx.bookId,
        userId: run.userId,
        findings: out.findings!,
        inputsKey: job.key,
        checkedAt: run.now.toISOString(),
      });
    } catch (err) {
      console.error(`generate: outline check save failed: ${(err as { code?: string })?.code ?? "unknown"}`);
      out = { ...out, counted: false, code: "server_error" };
    }
    return { out, saved };
  },
  reply: (_job, out, saved) => ({ stage: "outline_check", findings: out.findings, ...(saved as object | null) }),
};

// deno-lint-ignore no-explicit-any
export const STAGE_TABLE: { [S in Stage]: StageDef<S, any> } = {
  bio,
  amazon_import: amazonImport,
  brief_help: briefHelp,
  review_insights: reviewInsights,
  positioning_help: positioningHelp,
  drift_check: driftCheck,
  title_ideas: titleIdeas,
  competitor_import: competitorImport,
  outline_ideas: outlineIdeas,
  outline_check: outlineCheck,
};

// deno-lint-ignore no-explicit-any
type AnyDef = StageDef<any, any>;

/** The table entry for a stage. A stage with no entry throws. */
export function stageDef(stage: string): AnyDef {
  if (!Object.hasOwn(STAGE_TABLE, stage)) throw new Error(`generate: unknown stage ${stage}`);
  return STAGE_TABLE[stage as Stage] as AnyDef;
}

/** True when a check returned an error instead of a job. */
export const isFail = (r: Job | StageFail): r is StageFail => "fail" in r;

/** The Messages API request body for a job. */
export function buildRequest(job: Job) {
  const stage = job.stage;
  const [system, schema, content] = stageDef(stage).prompt(job);
  return {
    model: MODEL_FOR_STAGE[stage],
    max_tokens: MAX_TOKENS[stage],
    // Sonnet 5.5's lowest thinking setting: no extended thinking for a bio or a copy task.
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  };
}

/** Map a reply for a job. The positioning stages need the job's data to check the reply. */
export function interpretJob(job: Job, httpOk: boolean, body: unknown): Outcome {
  return stageDef(job.stage).interpret(job, httpOk, body);
}

/**
 * Map a reply without the job. Only for bio, amazon_import, brief_help (no
 * sources) and review_insights. positioning_help, drift_check, title_ideas,
 * competitor_import, outline_ideas and outline_check need their job's data: they throw (use interpretJob).
 */
export function interpretResponse(stage: Stage, httpOk: boolean, body: unknown, books: Competitor[] = []): Outcome {
  const def = stageDef(stage);
  if (!def.interpretAlone) throw new Error(`generate: ${stage} needs its job, use interpretJob`);
  return def.interpretAlone(httpOk, body, books);
}
