/* ═══════════════════════════════════════════════════
   KDP Lab — generate: pure logic (no I/O)
   supabase/functions/generate/lib.ts

   Re-exports the lib/ files, so handler.ts, index.ts and the tests have
   one import. Batch B1 split the old single file:
     lib/limits.ts     stages, models, limits, error codes, CORS, parseInput
     lib/common.ts     small shared helpers (text, prompt data, reply reading)
     lib/context.ts    the positioning context shared by three stages
     lib/<stage>.ts    one file per stage: prompt and reply
     lib/stages.ts     the stage table, buildRequest, interpretJob
     lib/types.ts      the Store types (re-exported by handler.ts)
   Tests: lib.test.ts, handler*.test.ts, snapshot.test.ts.
═══════════════════════════════════════════════════ */

export {
  ALLOWED_ORIGINS, BODY_BYTES, BRIEF_MAX, CALLS_PER_MINUTE, COPY_MIN_CHARS, corsHeaders, DEFAULT_MONTHLY_LIMIT, ERROR_STATUS, type ErrorCode, type GenerateInput, limitError, MAX_AUTHOR_CHARS, MAX_BIO_CHARS, MAX_BODY_BYTES, MAX_BOOKS, MAX_BSR, MAX_COMPETITORS, MAX_EXAMPLE_CHARS, MAX_FLAG_QUOTE, MAX_FLAG_WHY, MAX_FLAGS, MAX_INSIGHT_CHARS, MAX_INSIGHTS, MAX_KEPT_REASON, MAX_PAGE_CHARS, MAX_PROMPT_BOOKS, MAX_PROMPT_SOURCE_CHARS, MAX_PROMPT_SOURCES, MAX_REVIEW_BOX, MAX_REVIEWS, MAX_SOURCE_BODY, MAX_TITLE_CHARS, MAX_TITLE_EXAMPLES, MAX_TITLE_KEYWORDS, MAX_TITLE_OPTIONS, MAX_TITLE_REASON, MAX_TOC, MAX_TOKENS, MAX_UNSOURCED, MIN_PAGE_CHARS, MIN_REVIEWED_BOOKS, MODEL_FOR_STAGE, MODELS, monthStartUtc, parseInput, POS_LIST_MAX, POS_TEXT_MAX, POSITIONING_FIELDS, type PositioningField, type Stage, STAGES, TIMEOUT_MS, TITLE_IDEAS_PER_CALL, TITLE_MAX,
} from "./lib/limits.ts";
export {
  asData, numbersIn, type Outcome, readVoice, unsourcedNumbers, withoutFigures, wordCount,
} from "./lib/common.ts";
export {
  BIO_SCHEMA, BIO_SYSTEM, bioUserMessage, hasAnyFact, interpretBio, type PenRow, readFacts,
} from "./lib/bio.ts";
export {
  cleanBooks, IMPORT_SCHEMA, IMPORT_SYSTEM, importUserMessage, interpretImport, type PageBook, type TopicRow,
} from "./lib/amazon_import.ts";
export {
  BRIEF_SCHEMA, BRIEF_SYSTEM, type BriefContext, briefKnownText, type BriefSuggestions, briefUserMessage, hasTopic, interpretBriefHelp, promptBooks,
} from "./lib/brief_help.ts";
export {
  bookLabel, cleanInsightList, type Competitor, type InsightLine, type Insights, interpretReviewInsights, REVIEW_SCHEMA, REVIEW_SYSTEM, type ReviewContext, reviewedBooks, reviewUserMessage,
} from "./lib/review_insights.ts";
export {
  hasPositioningText, knownText, type PositioningContext, positioningHasTopic, type PositioningRow, type PositioningValues, positioningValues, promptSources,
} from "./lib/context.ts";
export {
  helpFields, interpretPositioningHelp, POSITIONING_SCHEMA, POSITIONING_SYSTEM, type PositioningSuggestions, positioningUserMessage,
} from "./lib/positioning_help.ts";
export {
  DRIFT_SCHEMA, DRIFT_SYSTEM, type DriftFlag, driftUserMessage, interpretDriftCheck,
} from "./lib/drift_check.ts";
export {
  interpretTitleIdeas, TITLE_SCHEMA, TITLE_SYSTEM, type TitleContext, type TitleIdea, titleIdeasWanted, titleLength, titleUserMessage,
} from "./lib/title_ideas.ts";
export {
  buildRequest, interpretJob, interpretResponse, isFail, type Job, type RunInfo, STAGE_TABLE, type StageDef, stageDef, type StageFail,
} from "./lib/stages.ts";
