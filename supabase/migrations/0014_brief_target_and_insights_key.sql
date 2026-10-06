-- 0014_brief_target_and_insights_key.sql
-- KDP Lab · Batch C · Custom word target (step 01), insights fingerprint (step 02).
--
-- 1. book_briefs.target_words
--      A custom word target, one number from 2,000 to 150,000 (owner
--      decision, Batch C). A Brief has a length range
--      OR a custom target, never both (one source of truth). The browser
--      sends both columns in one update, so the check never fails mid-way.
-- 2. research_insights.inputs_key
--      A short fingerprint (hex, not a security feature) of what the last
--      Analyze read: each competitor with pasted reviews, by id, with title,
--      author, contents and reviews. The browser computes it and saves it
--      with the lines. When the current competitors give another
--      fingerprint, the insights show "Out of date". Null = an analysis from
--      before 0014: the browser cannot tell, so it shows nothing.
--
-- Both columns are nullable with no default, so existing rows stay valid.
-- RLS is per row (0001), so the new columns follow the existing policies.
--
-- Checked before writing (read-only, 2026-10-06): 4 briefs (length_range:
-- one '5-8k', three null), 1 research_insights row. Neither column exists
-- live. No row can fail the new checks.

-- ---------------------------------------------------------------------------
-- 1. Custom word target
-- ---------------------------------------------------------------------------
alter table public.book_briefs add column target_words integer;

alter table public.book_briefs
  add constraint book_briefs_target_words_range_check
  check (target_words is null or target_words between 2000 and 150000);

alter table public.book_briefs
  add constraint book_briefs_length_one_value_check
  check (length_range is null or target_words is null);

comment on column public.book_briefs.target_words is
  'Custom word target (2000 to 150000). Set only when length_range is null.';

-- ---------------------------------------------------------------------------
-- 2. Insights fingerprint
-- ---------------------------------------------------------------------------
alter table public.research_insights add column inputs_key text;

alter table public.research_insights
  add constraint research_insights_inputs_key_format_check
  check (inputs_key is null or inputs_key ~ '^[0-9a-f]{8,32}$');

comment on column public.research_insights.inputs_key is
  'Fingerprint of the reviewed competitors at the last Analyze (browser). Null before 0014.';
