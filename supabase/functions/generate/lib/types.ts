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
  getMonthlyLimit(): Promise<number | null>;          // null = no settings row yet
  sumCountedTokensSince(userId: string, iso: string): Promise<number>;
  countCallsSince(userId: string, iso: string): Promise<number>;
  logUsage(row: UsageRow): Promise<void>;
}

export type SavedTitleOption = TitleIdea & { id: string; shortlisted: boolean; created_at: string };

export type DriftSave = { bookId: string; userId: string; flags: DriftFlag[]; checkedAt: string; readUpdatedAt: string };
