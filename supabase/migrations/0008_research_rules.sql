-- 0008_research_rules.sql
-- KDP Lab · E7.2 · Research rules.
--
-- Step 02 Research writes competitors, research_sources and research_insights
-- directly under Row Level Security, so the database enforces the same limits
-- as the browser (js/book-research.js) and the generate function (lib.ts).
--
-- 1. competitors
--      title          1 to 300 characters after trim
--      author         null or at most 200 characters
--      bsr            null or 1 to 100,000,000       (same as topic_page_books, 0006)
--      reviews        null or 0 to 10,000,000        (same as topic_page_books, 0006)
--      toc            null or at most 2,000 characters
--      low_reviews    null or at most 4,000 characters
--      high_reviews   null or at most 4,000 characters
--    At most 10 competitors per book (trigger). The trigger locks the book
--    row, so two inserts at the same time cannot pass the cap together.
-- 2. research_sources
--      body       1 to 2,000 characters after trim
--      citation   null or 1 to 500 characters after trim
--      a row of kind 'source' must have a citation (a note may not)
-- 3. research_insights: loves, hates and gaps keep their JSON shape.
--    STRUCTURE only, like 0005 and 0007:
--      [ { "text": text 1 to 160, "from": [ title 1 to 300, … 1 to 10 ], "edited": bool }, … ]
--    at most 6 items per list, exactly these three keys per item.
--
-- Checked before writing (read-only, 2026-09-30): competitors, research_sources
-- and research_insights each have 0 rows, so no row can fail a check.

-- ---------------------------------------------------------------------------
-- 1. competitors
-- ---------------------------------------------------------------------------
alter table public.competitors
  add constraint competitors_title_length_check
  check (char_length(btrim(title)) between 1 and 300);

alter table public.competitors
  add constraint competitors_author_length_check
  check (author is null or char_length(author) <= 200);

alter table public.competitors
  add constraint competitors_bsr_range_check
  check (bsr is null or bsr between 1 and 100000000);

alter table public.competitors
  add constraint competitors_reviews_range_check
  check (reviews is null or reviews <= 10000000);

alter table public.competitors
  add constraint competitors_toc_length_check
  check (toc is null or char_length(toc) <= 2000);

alter table public.competitors
  add constraint competitors_low_reviews_length_check
  check (low_reviews is null or char_length(low_reviews) <= 4000);

alter table public.competitors
  add constraint competitors_high_reviews_length_check
  check (high_reviews is null or char_length(high_reviews) <= 4000);

-- At most 10 competitors per book. SECURITY INVOKER: the count and the lock
-- run under the caller's Row Level Security, so they only see the caller's
-- own book and rows (another user's book fails the insert policy anyway).
-- Row-level BEFORE triggers see rows inserted earlier in the same statement,
-- so a bulk insert ("Copy from Topic Lab") is capped too.
create or replace function public.competitors_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.book_id = old.book_id then
    return new;
  end if;
  perform 1 from public.books b where b.id = new.book_id for update;
  if (select count(*) from public.competitors c where c.book_id = new.book_id) >= 10 then
    raise exception 'competitor_limit'
      using errcode = 'P0001',
            detail = 'A book can have at most 10 competitors.';
  end if;
  return new;
end;
$$;

comment on function public.competitors_limit() is
  'Trigger: at most 10 competitors per book (E7.2). Raises P0001 "competitor_limit".';

create trigger competitors_limit
  before insert or update of book_id on public.competitors
  for each row execute function public.competitors_limit();

revoke execute on function public.competitors_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. research_sources
-- ---------------------------------------------------------------------------
alter table public.research_sources
  add constraint research_sources_body_length_check
  check (char_length(btrim(body)) between 1 and 2000);

alter table public.research_sources
  add constraint research_sources_citation_length_check
  check (citation is null or char_length(btrim(citation)) between 1 and 500);

alter table public.research_sources
  add constraint research_sources_source_needs_citation_check
  check (kind <> 'source' or citation is not null);

-- ---------------------------------------------------------------------------
-- 3. research_insights JSON structure
-- ---------------------------------------------------------------------------
create or replace function public.research_insight_item_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and
  -- jsonb_object_keys / jsonb_array_length raise an error on the wrong type.
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['edited', 'from', 'text'] then false
    when jsonb_typeof(e -> 'text') <> 'string'
      or jsonb_typeof(e -> 'from') <> 'array'
      or jsonb_typeof(e -> 'edited') <> 'boolean' then false
    when char_length(e ->> 'text') > 160 or char_length(btrim(e ->> 'text')) < 1 then false
    when jsonb_array_length(e -> 'from') not between 1 and 10 then false
    else not exists (
      select 1 from jsonb_array_elements(e -> 'from') f
       where case
               when jsonb_typeof(f) <> 'string' then true
               else char_length(f #>> '{}') > 300 or char_length(btrim(f #>> '{}')) < 1
             end)
  end;
$$;

create or replace function public.research_insight_list_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'array' then false
    when jsonb_array_length(j) > 6 then false
    else not exists (
      select 1 from jsonb_array_elements(j) e
       where not public.research_insight_item_ok(e))
  end;
$$;

comment on function public.research_insight_item_ok(jsonb) is
  'Structure check for one research_insights line: { text <= 160, from: 1 to 10 titles <= 300, edited bool }.';
comment on function public.research_insight_list_ok(jsonb) is
  'Structure check for research_insights.loves/hates/gaps: an array of at most 6 lines.';

alter table public.research_insights
  add constraint research_insights_loves_shape_check
  check (public.research_insight_list_ok(loves));

alter table public.research_insights
  add constraint research_insights_hates_shape_check
  check (public.research_insight_list_ok(hates));

alter table public.research_insights
  add constraint research_insights_gaps_shape_check
  check (public.research_insight_list_ok(gaps));
