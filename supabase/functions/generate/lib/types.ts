/* generate lib: the Store the handler reads and writes through (types only).
   Moved from handler.ts in Batch B1 without changes. handler.ts re-exports these names. */

import type { Stage } from "./limits.ts";
import type { PenRow } from "./bio.ts";
import type { TopicRow } from "./amazon_import.ts";
import type { BriefContext } from "./brief_help.ts";
import type { ReviewContext } from "./review_insights.ts";
import type { PositioningContext } from "./context.ts";
import type { DriftFlag } from "./drift_check.ts";
import type { TitleContext, TitleIdea } from "./title_ideas.ts";
import type { OutlineContext, OutlineDraft } from "./outline_ideas.ts";
import type { OutlineCheckContext, OutlineFinding } from "./outline_check.ts";
import type { WriteContext } from "./section_write.ts";

export type UsageRow = {
  user_id: string;
  book_id?: string;                                  // only for stages that work on a book
  stage: Stage;
  model: string;
  input_tokens: number;
  output_tokens: number;
  status: "ok" | "failed" | "stopped";
  counted: boolean;
};

/** Reads run as the caller (RLS). logUsage runs with the service role. Errors throw. */
export interface Store {
  getUserId(): Promise<string | null>;
  getPenName(id: string): Promise<PenRow | null>;
  getTopic(id: string): Promise<TopicRow | null>;
  getBriefContext(bookId: string): Promise<BriefContext | null>;
  /** The book row (id only), through RLS. competitor_import reads nothing else. */
  getBook(bookId: string): Promise<{ id: string } | null>;
  getReviewContext(bookId: string): Promise<ReviewContext | null>;
  getPositioningContext(bookId: string): Promise<PositioningContext | null>;
  /**
   * Save a drift check (service role). Writes only when the row is still
   * unlocked and unchanged since it was read (same updated_at). null = changed.
   */
  saveDriftFlags(s: DriftSave): Promise<{ drift_checked_at: string; updated_at: string } | null>;
  getTitleContext(bookId: string): Promise<TitleContext | null>;
  /** Insert title options as the user (RLS). 0011 caps them at 40 per book: that error has code "options_full". */
  saveTitleOptions(bookId: string, ideas: TitleIdea[]): Promise<SavedTitleOption[]>;
  getOutlineContext(bookId: string): Promise<OutlineContext | null>;
  /**
   * Replace the book's outline as the user (RLS), one transaction (0016
   * replace_outline). Returns the saved chapters with their sections, in
   * order. Refusals throw { code: "has_writing" | "positioning_not_locked" }.
   */
  replaceOutline(bookId: string, outline: OutlineDraft): Promise<unknown[]>;
  /** The positioning context and the saved outline (0016 outline_json), through RLS. */
  getOutlineCheckContext(bookId: string): Promise<OutlineCheckContext | null>;
  /**
   * Save an outline check (service role, 0017: only that role writes
   * outline_checks). One row per book: a new check replaces the last one.
   */
  saveOutlineCheck(s: OutlineCheckSave): Promise<{ checked_at: string; inputs_key: string }>;
  /**
   * section_write (E10.2): the positioning context, the outline (0016
   * outline_json), the section's current version and draft, the previous
   * section's current version and the section's last run, through RLS.
   * null = not the caller's book or no such section in it.
   */
  getWriteContext(bookId: string, sectionId: string): Promise<WriteContext | null>;
  /** The reserves of the user's running, fresh Generate runs (0020 section_runs, through RLS). */
  sumRunningReserves(userId: string): Promise<number>;
  /**
   * Claim the section (0020 section_run_begin, service role). Creates the
   * usage row (failed, not counted). Refusals throw { code: "version_conflict"
   * | "unsaved_draft" | "run_in_progress" | "section_not_found" }.
   */
  beginSectionRun(a: RunBegin): Promise<{ usageId: number | null; recovered: number | null }>;
  /** Heartbeat and crash copy (0020 section_run_beat). Not an AI call. */
  beatSectionRun(runId: string, content: string, input: number, output: number): Promise<{ running: boolean; stop: boolean }>;
  /** End the run in one transaction (0020 section_run_finish). Throws { code: "run_not_running" } when taken over. */
  finishSectionRun(a: RunFinish): Promise<RunSaved>;
  getMonthlyLimit(): Promise<number | null>;          // null = no settings row yet
  sumCountedTokensSince(userId: string, iso: string): Promise<number>;
  countCallsSince(userId: string, iso: string): Promise<number>;
  logUsage(row: UsageRow): Promise<void>;
}

export type SavedTitleOption = TitleIdea & { id: string; shortlisted: boolean; created_at: string };

export type OutlineCheckSave = { bookId: string; userId: string; findings: OutlineFinding[]; inputsKey: string; checkedAt: string };

export type DriftSave = { bookId: string; userId: string; flags: DriftFlag[]; checkedAt: string; readUpdatedAt: string };

export type RunBegin = { userId: string; bookId: string; sectionId: string; runId: string; baseVersionId: string | null; reserved: number; model: string };
export type RunFinish = {
  runId: string; text: string; partial: boolean; endReason: string; status: "ok" | "stopped" | "failed";
  counted: boolean; input: number; output: number; estimated: boolean;
};
export type RunSaved = { version_id: string | null; version_no: number | null; word_count: number | null; current: boolean; partial: boolean; conflict: boolean };
