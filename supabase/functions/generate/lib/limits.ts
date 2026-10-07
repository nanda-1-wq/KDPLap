/* generate lib: Stages, models, limits, error codes, CORS and input checks.
   Moved from lib.ts in Batch B1 without changes. lib.ts re-exports the public names. */

/* ── Stages and models ───────────────────── */

export const STAGES = ["bio", "amazon_import", "brief_help", "review_insights", "positioning_help", "drift_check", "title_ideas", "competitor_import"] as const;
export type Stage = (typeof STAGES)[number];

// Model IDs from https://platform.claude.com/docs/en/models/overview (checked 2026-09-29).
// Haiku 4.5 was removed from the map: it may retire from October 15, 2026.
export const MODELS = {
  sonnet: "claude-sonnet-5-5",
} as const;

export const MODEL_FOR_STAGE: Record<Stage, string> = {
  bio: MODELS.sonnet,
  amazon_import: MODELS.sonnet,
  brief_help: MODELS.sonnet,
  review_insights: MODELS.sonnet,
  positioning_help: MODELS.sonnet,
  drift_check: MODELS.sonnet,
  title_ideas: MODELS.sonnet,
  competitor_import: MODELS.sonnet,
};

/* ── Limits ──────────────────────────────── */

// The request reader stops at the largest stage cap; each stage then checks its own.
export const BODY_BYTES: Record<Stage, number> = { bio: 2048, amazon_import: 262_144, brief_help: 2048, review_insights: 2048, positioning_help: 2048, drift_check: 2048, title_ideas: 2048, competitor_import: 262_144 };
export const MAX_BODY_BYTES = Math.max(...Object.values(BODY_BYTES));
export const CALLS_PER_MINUTE = 10;
export const DEFAULT_MONTHLY_LIMIT = 2_000_000; // user_settings default (0001)
export const TIMEOUT_MS: Record<Stage, number> = { bio: 60_000, amazon_import: 120_000, brief_help: 60_000, review_insights: 120_000, positioning_help: 90_000, drift_check: 60_000, title_ideas: 90_000, competitor_import: 120_000 };
export const MAX_TOKENS: Record<Stage, number> = { bio: 600, amazon_import: 8000, brief_help: 1200, review_insights: 2000, positioning_help: 2000, drift_check: 1200, title_ideas: 3000, competitor_import: 4000 };
export const MAX_BIO_CHARS = 3000; // same as the browser (js/pen-name-common.js)

// Amazon import: pasted page text and extracted books (same caps as js/topic-import.js and 0006).
export const MIN_PAGE_CHARS = 200;
export const MAX_PAGE_CHARS = 60_000;
export const MAX_BOOKS = 100;
export const MAX_TITLE_CHARS = 300;
export const MAX_AUTHOR_CHARS = 200;
export const MAX_BSR = 100_000_000;
export const MAX_REVIEWS = 10_000_000;

// Brief help: field limits (same as js/book-brief.js and migration 0007; stance
// and stand-out live in book_briefs.options) and how many of the topic's
// page-1 books go into the prompt.
export const BRIEF_MAX = { target_reader: 300, reader_problem: 1000, promise_draft: 1000, stance: 500, standout: 500 } as const;
// The "Other" book type label (same as js/book-brief.js and migration 0015).
export const MAX_TYPE_LABEL = 40;
export const MAX_PROMPT_BOOKS = 20;

// Review insights: competitor limits (same as js/book-research.js and migration 0008).
export const MAX_COMPETITORS = 10;
export const MIN_REVIEWED_BOOKS = 3;
export const MAX_REVIEW_BOX = 4000;
export const MAX_TOC = 2000;
export const MAX_INSIGHTS = 6;           // per list
export const MAX_INSIGHT_CHARS = 160;
export const COPY_MIN_CHARS = 30;
// Competitor import (one product page): reviews kept per box.
export const MAX_IMPORT_REVIEWS = 5;
export const MIN_IMPORT_REVIEW_CHARS = 10;   // a shorter "review" is a fragment, not a review        // a line this long found word for word in the reviews is dropped

// Positioning: field limits (same as js/book-positioning.js and migration 0010).
export const POSITIONING_FIELDS = ["one_sentence", "reader_promise", "lacks", "approach", "selling_points", "focus_tags"] as const;
export type PositioningField = (typeof POSITIONING_FIELDS)[number];
export const POS_TEXT_MAX = { one_sentence: 400, reader_promise: 600, approach: 1200 } as const;
export const POS_LIST_MAX = {
  lacks: { items: 6, chars: 200 },
  selling_points: { items: 8, chars: 160 },
  focus_tags: { items: 8, chars: 40 },
} as const;
export const MAX_FLAGS = 6;
export const MAX_FLAG_QUOTE = 300;
export const MAX_FLAG_WHY = 300;
export const MAX_KEPT_REASON = 200;
// Research that goes into a positioning prompt.
export const MAX_PROMPT_SOURCES = 20;
export const MAX_PROMPT_SOURCE_CHARS = 12_000;   // all source and note text together
export const MAX_SOURCE_BODY = 2000;             // same as 0008

// Title: limits (same as js/title-checks.js, js/book-title.js and migration 0011).
// KDP counts title + subtitle; we count it as the screen shows it: title + ": " + subtitle.
export const TITLE_MAX = 200;                     // title, subtitle, and the two together
export const MAX_TITLE_EXAMPLES = 3;
export const MAX_EXAMPLE_CHARS = 250;
export const MAX_TITLE_OPTIONS = 40;              // per book (0011 trigger)
export const TITLE_IDEAS_PER_CALL = 10;
export const MAX_TITLE_REASON = 300;
export const MAX_TITLE_KEYWORDS = { items: 5, chars: 60 } as const;
export const MAX_UNSOURCED = 10;

/* ── Error codes (the UI maps these to messages) ── */

export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  not_enough_facts: 422,
  not_amazon_page: 422,
  not_product_page: 422,
  not_enough_books: 422,
  nothing_to_check: 422,
  positioning_locked: 409,
  positioning_changed: 409,
  positioning_not_locked: 409,
  options_full: 409,
  monthly_limit: 429,
  rate_limited: 429,
  server_error: 500,
  ai_unavailable: 502,
  ai_stopped: 502,
  ai_declined: 502,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

/* ── CORS ────────────────────────────────── */

export const ALLOWED_ORIGINS = [
  "https://nanda-1-wq.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
];

/** CORS headers. Allow-Origin is set only for an allowed origin. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

/* ── Input ───────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GenerateInput =
  | { stage: "bio"; penNameId: string }
  | { stage: "amazon_import"; topicId: string; text: string }
  | { stage: "brief_help"; bookId: string }
  | { stage: "review_insights"; bookId: string }
  | { stage: "positioning_help"; bookId: string; field: PositioningField | null }
  | { stage: "drift_check"; bookId: string }
  | { stage: "title_ideas"; bookId: string }
  | { stage: "competitor_import"; bookId: string; text: string };

const sameKeys = (o: Record<string, unknown>, want: string[]) =>
  JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...want].sort());

/**
 * Parse and check the raw body. Each stage takes exactly its own keys:
 *   bio:           { stage, penNameId }            at most 2 KB
 *   amazon_import: { stage, topicId, text }        at most 256 KB, text 200 to 60,000 characters
 *   brief_help:    { stage, bookId }               at most 2 KB
 *   review_insights: { stage, bookId }             at most 2 KB
 *   positioning_help: { stage, bookId } or { stage, bookId, field }   at most 2 KB
 *                    (field = one of POSITIONING_FIELDS: redraft one card)
 *   drift_check:     { stage, bookId }             at most 2 KB
 *   title_ideas:     { stage, bookId }             at most 2 KB
 *   competitor_import: { stage, bookId, text }     at most 256 KB, text 200 to 60,000 characters
 * Anything else is null.
 */
export function parseInput(raw: string): GenerateInput | null {
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > MAX_BODY_BYTES) return null;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (typeof o.stage !== "string" || !(STAGES as readonly string[]).includes(o.stage)) return null;
  const stage = o.stage as Stage;
  if (bytes > BODY_BYTES[stage]) return null;

  if (stage === "bio") {
    if (!sameKeys(o, ["stage", "penNameId"])) return null;
    if (typeof o.penNameId !== "string" || !UUID_RE.test(o.penNameId)) return null;
    return { stage, penNameId: o.penNameId.toLowerCase() };
  }

  if (stage === "positioning_help") {
    const hasField = "field" in o;
    if (!sameKeys(o, hasField ? ["stage", "bookId", "field"] : ["stage", "bookId"])) return null;
    if (typeof o.bookId !== "string" || !UUID_RE.test(o.bookId)) return null;
    if (hasField && (typeof o.field !== "string" || !(POSITIONING_FIELDS as readonly string[]).includes(o.field))) return null;
    return { stage, bookId: o.bookId.toLowerCase(), field: hasField ? o.field as PositioningField : null };
  }

  if (stage === "brief_help" || stage === "review_insights" || stage === "drift_check" || stage === "title_ideas") {
    if (!sameKeys(o, ["stage", "bookId"])) return null;
    if (typeof o.bookId !== "string" || !UUID_RE.test(o.bookId)) return null;
    return { stage, bookId: o.bookId.toLowerCase() };
  }

  // amazon_import (a topic's search page) and competitor_import (one book's page): pasted text.
  const idKey = stage === "competitor_import" ? "bookId" : "topicId";
  if (!sameKeys(o, ["stage", idKey, "text"])) return null;
  const id = o[idKey];
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  if (typeof o.text !== "string") return null;
  const len = o.text.trim().length;
  if (len < MIN_PAGE_CHARS || o.text.length > MAX_PAGE_CHARS) return null;
  return stage === "competitor_import"
    ? { stage, bookId: id.toLowerCase(), text: o.text }
    : { stage, topicId: id.toLowerCase(), text: o.text };
}

/* ── Limits ──────────────────────────────── */

/** The 1st of the month, 00:00 UTC, as ISO. */
export function monthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** A limit code when the call must not run, or null. Monthly is checked first. */
export function limitError(u: { monthTokens: number; monthlyLimit: number; callsLastMinute: number }): ErrorCode | null {
  if (u.monthTokens >= u.monthlyLimit) return "monthly_limit";
  if (u.callsLastMinute >= CALLS_PER_MINUTE) return "rate_limited";
  return null;
}
