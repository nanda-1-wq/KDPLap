-- 0010_positioning_rules.sql
-- KDP Lab · E8.1 · Positioning rules: limits, drift check, lock, unlock.
--
-- Step 03 Positioning writes public.positioning directly under Row Level
-- Security. The drift check (generate stage drift_check) saves its flags
-- with the service role. This migration makes the database enforce the
-- same rules as the browser (js/book-positioning.js) and lib.ts.
--
-- 1. New columns
--      books.title_needs_review     set by unlock_positioning() when the book
--                                   has a title; step 04 (E8.2) clears it.
--      positioning.drift_checked_at when the last drift check ran. Cleared by
--                                   the guard trigger whenever the text changes.
-- 2. Limits
--      one_sentence     null, or 1 to 400 characters
--      reader_promise   null, or 1 to 600 characters
--      approach         null, or 1 to 1,200 characters
--      lacks            JSON array of at most 6 strings, 1 to 200 characters
--      selling_points   JSON array of at most 8 strings, 1 to 160 characters
--      focus_tags       at most 8 tags, 1 to 40 characters, no repeats (any case)
--      drift_flags      JSON array of at most 6 flags, unique ids:
--        { "id": text 1 to 40, "field": one of the six fields above,
--          "quote": text 1 to 300, "why": text 1 to 300,
--          "status": "open" | "kept",
--          "reason": "" when open, 1 to 200 characters when kept }
--    STRUCTURE only, like 0005, 0007 and 0008.
-- 3. Guard trigger (BEFORE INSERT OR UPDATE on positioning)
--    - A new row starts unlocked, with no flags and no drift check.
--    - A locked row is read-only. Only unlock_positioning() can unlock it.
--    - The browser (roles authenticated and anon) cannot set drift_checked_at
--      or change a flag's id, field, quote or why. It may only change a
--      flag's status and reason ("Keep it" with a reason, or undo that).
--      The drift check runs server-side and saves with the service role.
--    - Any change to the six text fields clears drift_checked_at.
--    - Locking (locked_at from null to a value) needs: one_sentence,
--      reader_promise and approach filled, at least 1 lacks item, at least
--      1 selling point, a current drift check, and no open flag.
--      locked_at is set from the server clock.
-- 4. unlock_positioning(book_id): one transaction. Clears locked_at, marks the
--    title (when the book has one), every chapter, and every section with
--    writing as "Needs review". Nothing is deleted. The drift check stays
--    valid: the text did not change.
-- 5. Positioning edits move the book to the top of Books (0009 trigger).
--
-- Checked before writing (read-only, 2026-09-30): positioning has 0 rows
-- (0 locked, 0 with flags); 0 books have a title; 0 chapters. No row can
-- fail a check.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
alter table public.books
  add column title_needs_review boolean not null default false;

alter table public.positioning
  add column drift_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Limits
-- ---------------------------------------------------------------------------
alter table public.positioning
  add constraint positioning_one_sentence_length_check
  check (one_sentence is null
         or (char_length(one_sentence) <= 400 and char_length(btrim(one_sentence)) >= 1));

alter table public.positioning
  add constraint positioning_reader_promise_length_check
  check (reader_promise is null
         or (char_length(reader_promise) <= 600 and char_length(btrim(reader_promise)) >= 1));

alter table public.positioning
  add constraint positioning_approach_length_check
  check (approach is null
         or (char_length(approach) <= 1200 and char_length(btrim(approach)) >= 1));

create or replace function public.positioning_text_list_ok(j jsonb, max_items int, max_chars int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and
  -- jsonb_array_length raises an error on a non-array.
  select case
    when jsonb_typeof(j) is distinct from 'array' then false
    when jsonb_array_length(j) > max_items then false
    else not exists (
      select 1 from jsonb_array_elements(j) e
       where case
               when jsonb_typeof(e) <> 'string' then true
               else char_length(e #>> '{}') > max_chars or char_length(btrim(e #>> '{}')) < 1
             end)
  end;
$$;

create or replace function public.positioning_tags_ok(t text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when t is null then false
    when cardinality(t) > 8 then false
    when exists (select 1 from unnest(t) x
                  where x is null or char_length(x) > 40 or char_length(btrim(x)) < 1) then false
    else (select count(distinct lower(btrim(x))) from unnest(t) x) = cardinality(t)
  end;
$$;

create or replace function public.positioning_flag_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['field', 'id', 'quote', 'reason', 'status', 'why'] then false
    when jsonb_typeof(e -> 'id') <> 'string'
      or jsonb_typeof(e -> 'field') <> 'string'
      or jsonb_typeof(e -> 'quote') <> 'string'
      or jsonb_typeof(e -> 'why') <> 'string'
      or jsonb_typeof(e -> 'status') <> 'string'
      or jsonb_typeof(e -> 'reason') <> 'string' then false
    when char_length(e ->> 'id') not between 1 and 40 then false
    when e ->> 'field' not in ('one_sentence', 'reader_promise', 'lacks',
                                'approach', 'selling_points', 'focus_tags') then false
    when char_length(e ->> 'quote') > 300 or char_length(btrim(e ->> 'quote')) < 1 then false
    when char_length(e ->> 'why') > 300 or char_length(btrim(e ->> 'why')) < 1 then false
    when e ->> 'status' = 'open' then e ->> 'reason' = ''
    when e ->> 'status' = 'kept' then char_length(e ->> 'reason') <= 200
                                      and char_length(btrim(e ->> 'reason')) >= 1
    else false
  end;
$$;

create or replace function public.positioning_flags_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'array' then false
    when jsonb_array_length(j) > 6 then false
    when exists (select 1 from jsonb_array_elements(j) e
                  where not public.positioning_flag_ok(e)) then false
    else (select count(distinct e ->> 'id') from jsonb_array_elements(j) e) = jsonb_array_length(j)
  end;
$$;

comment on function public.positioning_text_list_ok(jsonb, int, int) is
  'Structure check for positioning.lacks and selling_points: an array of at most max_items strings of 1 to max_chars.';
comment on function public.positioning_tags_ok(text[]) is
  'Structure check for positioning.focus_tags: at most 8 tags of 1 to 40 characters, no repeats.';
comment on function public.positioning_flag_ok(jsonb) is
  'Structure check for one drift flag: { id, field, quote, why, status open|kept, reason }.';
comment on function public.positioning_flags_ok(jsonb) is
  'Structure check for positioning.drift_flags: at most 6 flags with unique ids.';

alter table public.positioning
  add constraint positioning_lacks_shape_check
  check (public.positioning_text_list_ok(lacks, 6, 200));

alter table public.positioning
  add constraint positioning_selling_points_shape_check
  check (public.positioning_text_list_ok(selling_points, 8, 160));

alter table public.positioning
  add constraint positioning_focus_tags_check
  check (public.positioning_tags_ok(focus_tags));

alter table public.positioning
  add constraint positioning_drift_flags_shape_check
  check (public.positioning_flags_ok(drift_flags));

-- ---------------------------------------------------------------------------
-- 3. Guard trigger
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default): current_user is the caller's role, so the
-- browser (authenticated) and the drift check (service_role) are told apart.
-- Errors are P0001 with a short code as the message; the browser maps them.
create or replace function public.positioning_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_browser boolean := current_user in ('authenticated', 'anon');
  text_changed boolean;
  missing text[] := '{}';
begin
  if tg_op = 'INSERT' then
    if new.locked_at is not null or new.drift_checked_at is not null
       or new.drift_flags is distinct from '[]'::jsonb then
      raise exception 'positioning_new_row'
        using errcode = 'P0001',
              detail = 'A new positioning starts unlocked, with no drift check and no flags.';
    end if;
    return new;
  end if;

  text_changed := (new.one_sentence, new.reader_promise, new.approach,
                   new.lacks, new.selling_points, new.focus_tags)
                  is distinct from
                  (old.one_sentence, old.reader_promise, old.approach,
                   old.lacks, old.selling_points, old.focus_tags);

  -- A locked row is read-only. Unlocking goes through unlock_positioning().
  if old.locked_at is not null then
    if text_changed
       or new.drift_flags is distinct from old.drift_flags
       or new.drift_checked_at is distinct from old.drift_checked_at then
      raise exception 'positioning_locked'
        using errcode = 'P0001',
              detail = 'The positioning is locked. Unlock it to edit.';
    end if;
    if new.locked_at is null then
      if coalesce(current_setting('kdp.positioning_unlock', true), '') <> 'on' then
        raise exception 'positioning_unlock_rpc'
          using errcode = 'P0001',
                detail = 'Unlock with unlock_positioning(), which marks the steps built on it.';
      end if;
    else
      new.locked_at := old.locked_at;
    end if;
    return new;
  end if;

  -- Only the server writes a drift check result and the AI text of a flag.
  if from_browser then
    if new.drift_checked_at is not null
       and new.drift_checked_at is distinct from old.drift_checked_at then
      raise exception 'drift_check_server_only'
        using errcode = 'P0001',
              detail = 'Only the drift check can set drift_checked_at.';
    end if;
    if new.drift_flags is distinct from old.drift_flags and (
         jsonb_typeof(new.drift_flags) is distinct from 'array'
         or jsonb_array_length(new.drift_flags) <> jsonb_array_length(old.drift_flags)
         or exists (
           select 1
             from jsonb_array_elements(old.drift_flags) with ordinality o(e, i)
             join jsonb_array_elements(new.drift_flags) with ordinality n(e, i) using (i)
            where (o.e - 'status' - 'reason') is distinct from (n.e - 'status' - 'reason'))) then
      raise exception 'drift_flags_server_only'
        using errcode = 'P0001',
              detail = 'The browser can only keep a flag with a reason, or undo that.';
    end if;
  end if;

  -- New text: the last drift check no longer applies.
  if text_changed then
    new.drift_checked_at := null;
  end if;

  -- Lock.
  if new.locked_at is not null then
    if coalesce(btrim(new.one_sentence), '') = '' then missing := array_append(missing, 'one_sentence'); end if;
    if coalesce(btrim(new.reader_promise), '') = '' then missing := array_append(missing, 'reader_promise'); end if;
    if coalesce(btrim(new.approach), '') = '' then missing := array_append(missing, 'approach'); end if;
    if jsonb_typeof(new.lacks) is distinct from 'array' or jsonb_array_length(new.lacks) < 1 then
      missing := array_append(missing, 'lacks');
    end if;
    if jsonb_typeof(new.selling_points) is distinct from 'array' or jsonb_array_length(new.selling_points) < 1 then
      missing := array_append(missing, 'selling_points');
    end if;
    if cardinality(missing) > 0 then
      raise exception 'positioning_not_ready'
        using errcode = 'P0001',
              detail = 'Missing: ' || array_to_string(missing, ', ') || '.';
    end if;
    if new.drift_checked_at is null then
      raise exception 'positioning_not_ready'
        using errcode = 'P0001',
              detail = 'Run the drift check first.';
    end if;
    if exists (select 1 from jsonb_array_elements(new.drift_flags) e where e ->> 'status' = 'open') then
      raise exception 'positioning_not_ready'
        using errcode = 'P0001',
              detail = 'Resolve the drift flags first.';
    end if;
    new.locked_at := now();
  end if;

  return new;
end;
$$;

comment on function public.positioning_guard() is
  'Trigger (E8.1): new rows start unlocked; locked rows are read-only; only the server writes drift results; text edits clear the drift check; lock needs the required fields, a current check and no open flag.';

-- "positioning_guard" sorts before "positioning_set_updated_at" (0001), so it runs first.
create trigger positioning_guard
  before insert or update on public.positioning
  for each row execute function public.positioning_guard();

revoke execute on function public.positioning_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Unlock
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: every update runs under the caller's Row Level Security,
-- so another user's book reads as "not locked".
create or replace function public.unlock_positioning(p_book_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_title    boolean;
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

  return jsonb_build_object('title', v_title, 'chapters', v_chapters, 'written_chapters', v_written);
end;
$$;

comment on function public.unlock_positioning(uuid) is
  'E8.1: unlock a book''s positioning and mark the title, chapters and written sections "Needs review". Nothing is deleted. Raises P0002 "positioning_not_locked".';

revoke execute on function public.unlock_positioning(uuid) from public, anon;
grant execute on function public.unlock_positioning(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Positioning edits move the book to the top of Books (see 0009)
-- ---------------------------------------------------------------------------
create trigger positioning_touch_book
  after insert or update or delete on public.positioning
  for each row execute function public.touch_book_from_child();
