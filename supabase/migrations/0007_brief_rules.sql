-- 0007_brief_rules.sql
-- KDP Lab · E7.1 · Brief rules.
--
-- Step 01 Brief writes book_briefs and a few books columns directly under
-- Row Level Security, so the database enforces the same limits as the
-- browser (js/book-brief.js).
--
-- 1. Brief text: null (not filled yet) or 1 to N characters after trim.
--      topic_text      1 to 200   (same as create_book, 0002 and 0005)
--      target_reader   1 to 300
--      reader_problem  1 to 1000
--      promise_draft   1 to 1000
-- 2. book_briefs.options keeps its JSON shape. STRUCTURE only, like 0005:
--      options = { "stance": text <= 500, "standout": text <= 500,
--                  "references": text <= 2000 }        a missing key reads as empty
-- 3. Series lives on books (one source of truth):
--      series_name    null or 1 to 200 characters after trim
--      series_number  null or 1 to 999
--
-- Checked before writing (read-only, 2026-09-30): 3 books and 3 briefs.
-- No row fails a check: every topic_text is 1 to 200 characters, the other
-- text columns are within their limits, every options value is {}, and no
-- book has a series.

-- ---------------------------------------------------------------------------
-- 1. Brief text lengths
-- ---------------------------------------------------------------------------
alter table public.book_briefs
  add constraint book_briefs_topic_text_length_check
  check (topic_text is null or char_length(btrim(topic_text)) between 1 and 200);

alter table public.book_briefs
  add constraint book_briefs_target_reader_length_check
  check (target_reader is null or char_length(btrim(target_reader)) between 1 and 300);

alter table public.book_briefs
  add constraint book_briefs_reader_problem_length_check
  check (reader_problem is null or char_length(btrim(reader_problem)) between 1 and 1000);

alter table public.book_briefs
  add constraint book_briefs_promise_draft_length_check
  check (promise_draft is null or char_length(btrim(promise_draft)) between 1 and 1000);

-- ---------------------------------------------------------------------------
-- 2. options JSON structure
-- ---------------------------------------------------------------------------
create or replace function public.book_brief_options_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and
  -- jsonb_object_keys raises an error on a non-object.
  select case when jsonb_typeof(j) is distinct from 'object' then false else (
         not exists (
           select 1 from jsonb_object_keys(j) k
            where k not in ('stance', 'standout', 'references'))
     and (not j ? 'stance'     or (jsonb_typeof(j -> 'stance')     = 'string' and char_length(j ->> 'stance')     <= 500))
     and (not j ? 'standout'   or (jsonb_typeof(j -> 'standout')   = 'string' and char_length(j ->> 'standout')   <= 500))
     and (not j ? 'references' or (jsonb_typeof(j -> 'references') = 'string' and char_length(j ->> 'references') <= 2000))
  ) end;
$$;

comment on function public.book_brief_options_ok(jsonb) is
  'Structure check for book_briefs.options: stance, standout, references (strings with max lengths).';

alter table public.book_briefs
  add constraint book_briefs_options_shape_check
  check (public.book_brief_options_ok(options));

-- ---------------------------------------------------------------------------
-- 3. Series on books
-- ---------------------------------------------------------------------------
alter table public.books
  add constraint books_series_name_length_check
  check (series_name is null or char_length(btrim(series_name)) between 1 and 200);

alter table public.books
  add constraint books_series_number_range_check
  check (series_number is null or series_number between 1 and 999);
