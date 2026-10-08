-- 0017_outline_approve.sql
-- KDP Lab · E9.2 · Step 05 Outline: AI outline check results and Approve.
--
-- 1. outline_checks (one row per book): the last AI outline check.
--      findings    JSON array of at most 8 findings:
--        { "kind": "overlap" | "promise_gap" | "drift",
--          "chapters": [chapter id, ...]  overlap: exactly 2 different ids,
--                                          drift: exactly 1, promise_gap: none,
--          "quote": ""  (promise_gap: 1 to 300 characters of the reader promise),
--          "why": 1 to 300 characters,
--          "unsourced": at most 10 numbers of 1 to 20 characters }
--        STRUCTURE only, like 0005 and 0010. The generate function (stage
--        outline_check) decides what is kept: chapters that exist, a quote
--        really in the reader promise.
--      inputs_key  16 hex: a fingerprint of the outline the check read and the
--                  positioning lock time. The browser computes the same key
--                  for the outline on screen; when they differ the result is
--                  "Out of date". Not a security feature.
--      checked_at  server clock, set by the function.
--    Row Level Security: a user reads only their own rows. No insert, update
--    or delete policy, and those privileges are revoked from anon and
--    authenticated: only the service role (the generate function) writes.
--    A guard trigger keeps user_id equal to the book's owner, because the
--    service role bypasses RLS.
-- 2. approve_outline(book_id) → the approval time. SECURITY INVOKER (RLS as
--    the caller), one transaction. Needs a locked positioning (P0001
--    "positioning_not_locked"), at least one chapter of kind 'chapter' (P0001
--    "outline_empty") and a title on every chapter (P0001 "chapter_untitled").
--    Clears chapters.needs_review (sections keep theirs, for E10) and sets
--    books.outline_approved_at from the server clock. Approval with warnings
--    is allowed: the code checks and the AI check are advice (owner, E9).
--    P0002 "book_not_found" for a book the caller cannot see.
-- 3. Guard trigger on books: outline_approved_at can be set to a value only by
--    approve_outline() (transaction-local setting, like unlock_positioning in
--    0010), for every role. Clearing it is always allowed.
-- 4. Any outline edit clears the approval (trigger outline_clear_approval):
--    a chapter or section added or deleted, or a change to an outline column:
--      chapters  position, title, objective, include_examples, include_exercise, book_id
--      sections  position, title, word_target, chapter_id
--    Writing does NOT clear it (owner, E9.2): sections.status,
--    current_version_id and needs_review, chapters.needs_review and
--    unsourced, and section_versions rows. E10 decides what Write shows after
--    an outline edit.
-- 5. unlock_positioning(book_id) (0010) also clears the approval. Its reply
--    adds "outline": true when an approval was cleared. Nothing is deleted:
--    the check result stays and shows "Out of date" (its key holds the old
--    lock time).
--
-- Checked before writing (read-only, 2026-10-08): 4 books, 0 with
-- outline_approved_at; 7 chapters and 17 sections (one outline), 0 chapters
-- with needs_review, 0 section versions; 1 locked positioning; no
-- outline_checks table; last migration 20261008155436 (0016). Triggers on
-- books: books_reset_topic_after_delete, books_set_updated_at,
-- books_title_review_guard. No row can fail the new rules.

-- ---------------------------------------------------------------------------
-- 1. outline_checks
-- ---------------------------------------------------------------------------
create or replace function public.outline_finding_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and the
  -- jsonb functions raise an error on the wrong type.
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['chapters', 'kind', 'quote', 'unsourced', 'why'] then false
    when jsonb_typeof(e -> 'kind') <> 'string'
      or jsonb_typeof(e -> 'chapters') <> 'array'
      or jsonb_typeof(e -> 'quote') <> 'string'
      or jsonb_typeof(e -> 'why') <> 'string'
      or jsonb_typeof(e -> 'unsourced') <> 'array' then false
    when exists (select 1 from jsonb_array_elements(e -> 'chapters') c
                  where case when jsonb_typeof(c) <> 'string' then true
                             else (c #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' end) then false
    when (select count(distinct c) from jsonb_array_elements(e -> 'chapters') c) <> jsonb_array_length(e -> 'chapters') then false
    when char_length(e ->> 'why') > 300 or char_length(btrim(e ->> 'why')) < 1 then false
    when char_length(e ->> 'quote') > 300 then false
    when jsonb_array_length(e -> 'unsourced') > 10 then false
    when exists (select 1 from jsonb_array_elements(e -> 'unsourced') u
                  where case when jsonb_typeof(u) <> 'string' then true
                             else char_length(u #>> '{}') not between 1 and 20 end) then false
    when e ->> 'kind' = 'overlap' then jsonb_array_length(e -> 'chapters') = 2 and e ->> 'quote' = ''
    when e ->> 'kind' = 'drift' then jsonb_array_length(e -> 'chapters') = 1 and e ->> 'quote' = ''
    when e ->> 'kind' = 'promise_gap' then jsonb_array_length(e -> 'chapters') = 0
                                           and char_length(btrim(e ->> 'quote')) >= 1
    else false
  end;
$$;

create or replace function public.outline_findings_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'array' then false
    when jsonb_array_length(j) > 8 then false
    else not exists (select 1 from jsonb_array_elements(j) e where not public.outline_finding_ok(e))
  end;
$$;

comment on function public.outline_finding_ok(jsonb) is
  'Structure check for one AI outline finding: { kind overlap|promise_gap|drift, chapters, quote, why, unsourced }.';
comment on function public.outline_findings_ok(jsonb) is
  'Structure check for outline_checks.findings: at most 8 findings.';

create table public.outline_checks (
  book_id     uuid primary key references public.books (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  findings    jsonb not null default '[]',
  inputs_key  text not null,
  checked_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint outline_checks_findings_shape_check check (public.outline_findings_ok(findings)),
  constraint outline_checks_inputs_key_format_check check (inputs_key ~ '^[0-9a-f]{16}$')
);

create index outline_checks_user_id_idx on public.outline_checks (user_id);

comment on table public.outline_checks is
  'E9.2: the last AI outline check per book (stage outline_check). Written by the service role only.';
comment on column public.outline_checks.inputs_key is
  'Fingerprint of the checked outline and the positioning lock time (js/outline-key.js, generate lib/outline_check.ts).';

create trigger outline_checks_set_updated_at
  before update on public.outline_checks
  for each row execute function public.set_updated_at();

alter table public.outline_checks enable row level security;

create policy "outline_checks_select_own" on public.outline_checks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only the service role writes (it bypasses RLS). Supabase grants every new
-- table to the API roles by default, so take the write privileges back.
-- anon keeps the default select grant, like every other table: with no anon
-- policy, RLS shows it no rows.
revoke insert, update, delete, truncate on public.outline_checks from anon, authenticated;

-- The service role bypasses RLS, so the owner is checked here.
create or replace function public.outline_checks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.books b where b.id = new.book_id and b.user_id = new.user_id) then
    raise exception 'outline_check_owner'
      using errcode = 'P0001',
            detail = 'An outline check belongs to the owner of its book.';
  end if;
  return new;
end;
$$;

comment on function public.outline_checks_guard() is
  'Trigger (E9.2): outline_checks.user_id is the book''s owner (P0001 "outline_check_owner").';

create trigger outline_checks_guard
  before insert or update on public.outline_checks
  for each row execute function public.outline_checks_guard();

revoke execute on function public.outline_checks_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. approve_outline
-- ---------------------------------------------------------------------------
create or replace function public.approve_outline(p_book_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_untitled int;
  v_at       timestamptz;
begin
  perform public.outline_lock_book(p_book_id);

  if not exists (select 1 from public.positioning p
                  where p.book_id = p_book_id and p.locked_at is not null) then
    raise exception 'positioning_not_locked'
      using errcode = 'P0001',
            detail = 'Lock the positioning in 03 first.';
  end if;

  if not exists (select 1 from public.chapters c
                  where c.book_id = p_book_id and c.kind = 'chapter') then
    raise exception 'outline_empty'
      using errcode = 'P0001',
            detail = 'Add at least one chapter first.';
  end if;

  select n into v_untitled
    from (select row_number() over (order by c.position) n, c.title
            from public.chapters c
           where c.book_id = p_book_id and c.kind = 'chapter') x
   where x.title is null or btrim(x.title) = ''
   order by n
   limit 1;
  if v_untitled is not null then
    raise exception 'chapter_untitled'
      using errcode = 'P0001',
            detail = 'Chapter ' || v_untitled || ' has no title.';
  end if;

  -- Approving is the review: the chapters lose their "Needs review" mark.
  -- needs_review is not an outline column, so this keeps any approval.
  update public.chapters
     set needs_review = false
   where book_id = p_book_id
     and needs_review;

  -- Transaction-local: lets the books guard accept this one approval.
  perform set_config('kdp.outline_approve', 'on', true);
  update public.books
     set outline_approved_at = now()
   where id = p_book_id
  returning outline_approved_at into v_at;
  perform set_config('kdp.outline_approve', '', true);

  return v_at;
end;
$$;

comment on function public.approve_outline(uuid) is
  'E9.2: approve a book''s outline (step 05 done). Needs a locked positioning, at least one chapter and every chapter titled. Clears chapters.needs_review. Raises P0001 positioning_not_locked, outline_empty, chapter_untitled; P0002 book_not_found.';

revoke execute on function public.approve_outline(uuid) from public, anon;
grant execute on function public.approve_outline(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Books guard: approval only through approve_outline()
-- ---------------------------------------------------------------------------
create or replace function public.books_outline_approve_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.outline_approved_at is not null
     and (tg_op = 'INSERT' or new.outline_approved_at is distinct from old.outline_approved_at)
     and coalesce(current_setting('kdp.outline_approve', true), '') <> 'on' then
    raise exception 'outline_approve_rpc'
      using errcode = 'P0001',
            detail = 'Approve the outline with approve_outline(), which checks it first.';
  end if;
  return new;
end;
$$;

comment on function public.books_outline_approve_guard() is
  'Trigger (E9.2): books.outline_approved_at gets a value only through approve_outline() (P0001 "outline_approve_rpc"). Clearing it is allowed.';

create trigger books_outline_approve_guard
  before insert or update of outline_approved_at on public.books
  for each row execute function public.books_outline_approve_guard();

revoke execute on function public.books_outline_approve_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Outline edits clear the approval
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: the update runs under the caller's RLS (their own book).
-- During a book delete the book is already gone, so it matches nothing.
create or replace function public.outline_clear_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_books uuid[];
begin
  if tg_table_name = 'chapters' then
    if tg_op = 'UPDATE'
       and (new.position, new.title, new.objective, new.include_examples, new.include_exercise, new.book_id)
           is not distinct from
           (old.position, old.title, old.objective, old.include_examples, old.include_exercise, old.book_id) then
      return null;
    end if;
    v_books := array[case when tg_op = 'DELETE' then old.book_id else new.book_id end,
                     case when tg_op = 'UPDATE' then old.book_id end];
  else
    if tg_op = 'UPDATE'
       and (new.position, new.title, new.word_target, new.chapter_id)
           is not distinct from
           (old.position, old.title, old.word_target, old.chapter_id) then
      return null;
    end if;
    select array_agg(c.book_id) into v_books
      from public.chapters c
     where c.id in (case when tg_op = 'DELETE' then old.chapter_id else new.chapter_id end,
                    case when tg_op = 'UPDATE' then old.chapter_id end);
  end if;

  update public.books b
     set outline_approved_at = null
   where b.id = any (v_books)
     and b.outline_approved_at is not null;
  return null;
end;
$$;

comment on function public.outline_clear_approval() is
  'Trigger (E9.2): adding, deleting or editing an outline column of a chapter or section clears books.outline_approved_at. Writing columns (status, versions, needs_review, unsourced) do not.';

create trigger chapters_clear_approval
  after insert or update or delete on public.chapters
  for each row execute function public.outline_clear_approval();

create trigger sections_clear_approval
  after insert or update or delete on public.sections
  for each row execute function public.outline_clear_approval();

revoke execute on function public.outline_clear_approval() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Unlock also clears the approval (0010, body unchanged otherwise)
-- ---------------------------------------------------------------------------
create or replace function public.unlock_positioning(p_book_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_title    boolean;
  v_outline  boolean;
  v_chapters int;
  v_written  int;
begin
  -- Transaction-local: lets the guard trigger accept this one unlock.
  perform set_config('kdp.positioning_unlock', 'on', true);
  update public.positioning
     set locked_at = null
   where book_id = p_book_id
     and locked_at is not null;
  if not found then
    raise exception 'positioning_not_locked'
      using errcode = 'P0002',
            detail = 'This book has no locked positioning.';
  end if;
  perform set_config('kdp.positioning_unlock', '', true);

  update public.books
     set title_needs_review = true
   where id = p_book_id
     and title is not null;
  v_title := found;

  -- E9.2: step 05 is no longer done. The outline itself is kept.
  update public.books
     set outline_approved_at = null
   where id = p_book_id
     and outline_approved_at is not null;
  v_outline := found;

  update public.chapters
     set needs_review = true
   where book_id = p_book_id;
  get diagnostics v_chapters = row_count;

  update public.sections s
     set needs_review = true
    from public.chapters c
   where c.id = s.chapter_id
     and c.book_id = p_book_id
     and s.current_version_id is not null;

  select count(distinct s.chapter_id)
    into v_written
    from public.sections s
    join public.chapters c on c.id = s.chapter_id
   where c.book_id = p_book_id
     and s.current_version_id is not null;

  return jsonb_build_object('title', v_title, 'outline', v_outline, 'chapters', v_chapters, 'written_chapters', v_written);
end;
$$;

comment on function public.unlock_positioning(uuid) is
  'E8.1, E9.2: unlock a book''s positioning, mark the title, chapters and written sections "Needs review", and clear the outline approval. Nothing is deleted. Raises P0002 "positioning_not_locked".';

revoke execute on function public.unlock_positioning(uuid) from public, anon;
grant execute on function public.unlock_positioning(uuid) to authenticated;
