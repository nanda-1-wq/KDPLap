-- 0026_book_complete_words.sql
-- KDP Lab · E12 fix batch 3 · items 2 and 3 (designs 01b and 22f).
-- Plan: docs/reviews/2026-10-28-e12-fix-batch-3-plan.md (owner answers Q1, Q3,
-- D1 and R3). No AI call reads or writes anything here.
--
-- 1. books.completed_at: when the book was marked completed (R3). Set only by
--    complete_book(); null whenever the book is not completed (a check keeps
--    the two together).
-- 2. complete_book(book_id) → completed_at. SECURITY INVOKER (RLS as the
--    caller), one transaction, the book row locked. The rule (owner, Q4):
--      the outline is approved           P0001 "outline_not_approved"
--      the book has at least one section P0001 "book_empty"
--      every section is Final            P0001 "section_not_final"
--      every section has text            P0001 "section_no_text"
--        (a current version that is not blank, public.text_is_blank)
--      no section or chapter needs review P0001 "needs_review"
--    The detail says how many, for the browser (design 22f, state 11). Open
--    Verify marks do not block it (owner, Q4). A book that is already
--    completed returns its completed_at again (a double click is not an
--    error). P0002 "book_not_found" for a book the caller cannot see.
-- 3. Guard trigger on books (books_status_guard), for every role:
--      a. status becomes 'completed', or completed_at changes on a completed
--         book, only through complete_book() (transaction-local setting, as
--         approve_outline in 0017): P0001 "complete_rpc". A new row is never
--         completed.
--      b. Reopen on its own when the outline approval is cleared on a
--         completed book (an outline edit, a section or chapter added or
--         deleted, an unlock of 03: all of them clear it, 0017).
--      c. A book that is not completed has completed_at null, so Reopen
--         (a plain update to 'in_progress', allowed by RLS) clears it.
-- 4. Reopen on its own (trigger book_reopen_on_change, after insert or update
--    on sections and chapters). A completed book goes back to 'in_progress'
--    when the rule breaks:
--      a section leaves Final;
--      needs_review is set on a section or a chapter;
--      a section or a chapter is added.
--    A new version on a Final section does NOT reopen it (owner, D1):
--    save_version, restore_version, a Generate finish and an Improve apply
--    change current_version_id, and a Final status stays Final. (A Generate
--    finish that sets needs_review, while the positioning is unlocked,
--    reopens the book through the needs_review rule.)
-- 5. words_month(): words added this month (owner, Q1, rule 1). For each of
--    the caller's sections: the words of its current version now, minus the
--    words of its newest version made before the 1st of the month at 00:00
--    UTC (0 when it has none), never below 0. Summed on the server.
--    { month_start, words }.
--
-- Checked before writing: the repository only (migrations 0001 to 0025). The
-- live database was not read (owner rule: Claude chat applies). Before
-- applying, Claude chat runs, read-only:
--   select count(*) from public.books where status = 'completed';
-- Any such rows get completed_at = updated_at below, so the new check holds.

-- ---------------------------------------------------------------------------
-- 1. books.completed_at
-- ---------------------------------------------------------------------------
alter table public.books add column completed_at timestamptz;

-- A book marked completed before 0026 (none is expected: nothing set the
-- status) keeps its status, with its last change time.
update public.books
   set completed_at = updated_at
 where status = 'completed';

alter table public.books add constraint books_completed_at_check
  check ((status = 'completed') = (completed_at is not null));

comment on column public.books.completed_at is
  'E12 fix batch 3: when complete_book() marked the book completed. Null whenever status is not completed (Reopen, or a reopen on its own).';

-- ---------------------------------------------------------------------------
-- 2. complete_book
-- ---------------------------------------------------------------------------
create or replace function public.complete_book(p_book_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_book      public.books%rowtype;
  v_sections  int;
  v_not_final int;
  v_no_text   int;
  v_review    int;
  v_ch_review int;
  v_at        timestamptz;
begin
  perform public.outline_lock_book(p_book_id);
  select * into v_book from public.books b where b.id = p_book_id;

  if v_book.status = 'completed' then
    return v_book.completed_at;
  end if;

  if v_book.outline_approved_at is null then
    raise exception 'outline_not_approved'
      using errcode = 'P0001',
            detail = 'Approve the outline in 05 first.';
  end if;

  select count(*),
         count(*) filter (where s.status <> 'final'),
         count(*) filter (where v.id is null or public.text_is_blank(v.content)),
         count(*) filter (where s.needs_review)
    into v_sections, v_not_final, v_no_text, v_review
    from public.sections s
    join public.chapters c on c.id = s.chapter_id
    left join public.section_versions v on v.id = s.current_version_id
   where c.book_id = p_book_id;

  select count(*) into v_ch_review
    from public.chapters c
   where c.book_id = p_book_id and c.needs_review;

  if v_sections = 0 then
    raise exception 'book_empty'
      using errcode = 'P0001',
            detail = 'The book has no sections yet.';
  end if;
  if v_not_final > 0 then
    raise exception 'section_not_final'
      using errcode = 'P0001',
            detail = case when v_not_final = 1 then '1 section is not Final.'
                          else v_not_final || ' sections are not Final.' end;
  end if;
  if v_no_text > 0 then
    raise exception 'section_no_text'
      using errcode = 'P0001',
            detail = case when v_no_text = 1 then '1 section has no text.'
                          else v_no_text || ' sections have no text.' end;
  end if;
  if v_review > 0 or v_ch_review > 0 then
    raise exception 'needs_review'
      using errcode = 'P0001',
            detail = case when v_review = 0 then 'Approve the outline in 05 to clear the chapter marks.'
                          when v_review = 1 then '1 section needs review.'
                          else v_review || ' sections need review.' end;
  end if;

  -- Transaction-local: lets the books guard accept this one change.
  perform set_config('kdp.book_complete', 'on', true);
  update public.books
     set status = 'completed',
         completed_at = now()
   where id = p_book_id
  returning completed_at into v_at;
  perform set_config('kdp.book_complete', '', true);

  return v_at;
end;
$$;

comment on function public.complete_book(uuid) is
  'E12 fix batch 3: mark a book completed (design 22f). Needs the outline approved, at least one section, every section Final with text, and no section or chapter marked "Needs review". Sets completed_at. A completed book returns its completed_at. Raises P0001 outline_not_approved, book_empty, section_not_final, section_no_text, needs_review; P0002 book_not_found.';

revoke execute on function public.complete_book(uuid) from public, anon;
grant execute on function public.complete_book(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Books guard: completed only through complete_book(); reopen when the
--    outline approval is cleared; completed_at only while completed
-- ---------------------------------------------------------------------------
create or replace function public.books_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rpc boolean := coalesce(current_setting('kdp.book_complete', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      raise exception 'complete_rpc'
        using errcode = 'P0001',
              detail = 'Mark a book completed with complete_book(), which checks it first.';
    end if;
    new.completed_at := null;
    return new;
  end if;

  -- b. The outline approval was cleared: the book is no longer done.
  if old.status = 'completed' and old.outline_approved_at is not null and new.outline_approved_at is null then
    new.status := 'in_progress';
  end if;

  -- a. Becoming completed, or a new completed_at on a completed book.
  if new.status = 'completed' and not v_rpc
     and (old.status <> 'completed' or new.completed_at is distinct from old.completed_at) then
    raise exception 'complete_rpc'
      using errcode = 'P0001',
            detail = 'Mark a book completed with complete_book(), which checks it first.';
  end if;

  -- c. Not completed: no completed_at.
  if new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

comment on function public.books_status_guard() is
  'Trigger (E12 fix batch 3): books.status becomes completed, and completed_at changes on a completed book, only through complete_book() (P0001 "complete_rpc"); clearing the outline approval reopens a completed book; a book that is not completed has completed_at null.';

create trigger books_status_guard
  before insert or update on public.books
  for each row execute function public.books_status_guard();

revoke execute on function public.books_status_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reopen on its own when a section or chapter breaks the rule
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: the update runs under the caller's RLS (their own book);
-- the service role (the generate function) bypasses RLS. The books guard
-- clears completed_at.
create or replace function public.book_reopen_on_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_book uuid;
begin
  if tg_table_name = 'chapters' then
    if tg_op = 'UPDATE' and not (new.needs_review and not old.needs_review) then
      return null;
    end if;
    v_book := new.book_id;
  else
    -- D1: a new current version, or any other change, leaves the book as it is.
    if tg_op = 'UPDATE'
       and not (old.status = 'final' and new.status <> 'final')
       and not (new.needs_review and not old.needs_review) then
      return null;
    end if;
    select c.book_id into v_book from public.chapters c where c.id = new.chapter_id;
  end if;

  update public.books b
     set status = 'in_progress'
   where b.id = v_book
     and b.status = 'completed';
  return null;
end;
$$;

comment on function public.book_reopen_on_change() is
  'Trigger (E12 fix batch 3): a completed book goes back to in_progress when a section leaves Final, a section or chapter gets needs_review, or a section or chapter is added. A new version on a Final section does not reopen it (owner, D1).';

create trigger sections_reopen_book
  after insert or update of status, needs_review on public.sections
  for each row execute function public.book_reopen_on_change();

create trigger chapters_reopen_book
  after insert or update of needs_review on public.chapters
  for each row execute function public.book_reopen_on_change();

revoke execute on function public.book_reopen_on_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. words_month(): words added this month (Books stat)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: every read runs under the caller's RLS; the user filters
-- are there for the indexes (sections_user_id_idx, section_versions_user_id_idx).
-- "Newest version before the 1st" is the highest version_no made before it.
create or replace function public.words_month()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (
    select (date_trunc('month', now() at time zone 'utc') at time zone 'utc') as start
  ), cur as (
    select s.id, coalesce(v.word_count, 0) as words
      from public.sections s
      left join public.section_versions v on v.id = s.current_version_id
     where s.user_id = (select auth.uid())
  ), prev as (
    select distinct on (v.section_id) v.section_id, v.word_count as words
      from public.section_versions v, m
     where v.user_id = (select auth.uid())
       and v.created_at < m.start
     order by v.section_id, v.version_no desc
  )
  select jsonb_build_object(
    'month_start', m.start,
    'words', coalesce((select sum(greatest(c.words - coalesce(b.words, 0), 0))
                         from cur c left join prev b on b.section_id = c.id), 0))
  from m
$$;

comment on function public.words_month() is
  'E12 fix batch 3: words added this month (from the 1st, UTC) across the caller''s sections: per section, current version words minus the words of its newest version before the 1st, never below 0. { month_start, words }.';

revoke execute on function public.words_month() from public, anon;
grant execute on function public.words_month() to authenticated;
