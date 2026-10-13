-- 0021_section_suggestions.sql
-- KDP Lab · E10.3 · Step 06 Write: the Improve menu (stage section_improve).
--
-- The generate function (service role) saves each AI suggestion here. The
-- browser shows it and the writer accepts or rejects it. Accept goes through
-- apply_suggestion(), which saves a new version (source = the action) and
-- makes it current. Nothing is overwritten.
--
-- 1. section_suggestions: one row per suggestion.
--      action           edit_format | improve | expand | shorten | humanize | custom
--      instruction      the Custom instruction (1 to 300 characters), only for custom
--      base_version_id  the version current at the request (null: none yet)
--      selection        the passage the writer selected (1 to 15,000 characters)
--      output           the AI's passage after our clean-up (1 to 25,000 characters)
--      flagged, notes   "[Verify: no source]" marks in the output, and the
--                       notes the browser shows (markers lost, new names,
--                       structure changed)
--      used_at, version_id  set once, by apply_suggestion (the version Accept made)
--    RLS: a user reads only their own rows. Insert, delete and truncate are
--    the service role's only. A user update passes only inside
--    apply_suggestion (transaction-local setting kdp.suggestion_use, like
--    0018 and 0020), changes only used_at and version_id, and only on an
--    unused row (42501 "suggestions_server_only"). For every role the guard
--    keeps user_id and book_id equal to the section's owner and book, and
--    base_version_id and version_id null or a version of the same section
--    (the service role bypasses RLS). created_at is the server clock.
-- 2. section_versions_guard (0018) replaced: anon and authenticated insert a
--    version only with kdp.version_write = 'on' and source manual or restore
--    (unchanged, save_version and restore_version), or with
--    kdp.suggestion_apply = 'on' and source one of the six improve actions
--    (apply_suggestion). The owner check and the word count are unchanged.
-- 3. apply_suggestion(suggestion, base_version, full_text) → { id, version_no,
--    word_count, created_at, source }. SECURITY INVOKER, the section row
--    locked. Refuses (in this order): P0002 suggestion_not_found (missing or
--    another user's), P0001 suggestion_used (usable once), suggestion_expired
--    (older than 1 hour), version_conflict (the base is not a version of this
--    section, is older than the suggestion's base, or is not the current
--    version), unsaved_draft (a draft with text that differs from the current
--    version), run_in_progress (a fresh Generate run), suggestion_mismatch
--    (full_text is not the text of the base version with the selection
--    replaced by the output, at one place), section_too_long (over 100,000).
--    The base at Accept may be newer than the suggestion's base: the browser
--    saves the writer's unsaved typing as a manual version first, so the
--    check uses the text of p_base_version_id. The version keeps Reviewed and
--    Final, moves Not started to Draft, and is marked Needs review when the
--    positioning is no longer locked (as section_run_finish, 0020). The draft
--    is deleted. Never an AI call; writes no ai_usage row.
--
-- Checked before writing (read-only): fill in at the owner's live check.
-- Expected: no section_suggestions table, last migration 0020; 0021 adds the
-- table and apply_suggestion and replaces only section_versions_guard.

-- ---------------------------------------------------------------------------
-- 1. section_suggestions
-- ---------------------------------------------------------------------------
create table public.section_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  book_id          uuid not null references public.books (id) on delete cascade,
  section_id       uuid not null references public.sections (id) on delete cascade,
  action           text not null check (action in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom')),
  instruction      text check (instruction is null or (char_length(instruction) <= 300 and not public.text_is_blank(instruction))),
  base_version_id  uuid references public.section_versions (id) on delete set null,
  selection        text not null check (char_length(selection) between 1 and 15000),
  output           text not null check (char_length(output) between 1 and 25000),
  flagged          int not null default 0 check (flagged >= 0),
  notes            jsonb not null default '{}' check (jsonb_typeof(notes) = 'object'),
  created_at       timestamptz not null default now(),
  used_at          timestamptz,
  version_id       uuid references public.section_versions (id) on delete set null,
  -- An instruction for Custom, and only for Custom.
  constraint section_suggestions_custom_check check ((action = 'custom') = (instruction is not null)),
  -- A version is linked only when the suggestion was used.
  constraint section_suggestions_used_check check (version_id is null or used_at is not null)
);

create index section_suggestions_user_id_idx on public.section_suggestions (user_id);
create index section_suggestions_book_id_idx on public.section_suggestions (book_id);
create index section_suggestions_section_id_idx on public.section_suggestions (section_id);
create index section_suggestions_base_version_id_idx on public.section_suggestions (base_version_id);
create index section_suggestions_version_id_idx on public.section_suggestions (version_id);

comment on table public.section_suggestions is
  'E10.3: AI suggestions from the Improve menu (stage section_improve). Written by the service role; the user applies one once, within 1 hour, through apply_suggestion().';

alter table public.section_suggestions enable row level security;

create policy "section_suggestions_select_own" on public.section_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only through apply_suggestion (the guard checks the setting and the columns).
create policy "section_suggestions_update_own" on public.section_suggestions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke insert, delete, truncate on public.section_suggestions from anon, authenticated;

create or replace function public.section_suggestions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- Only apply_suggestion, only used_at and version_id, only once.
    if tg_op <> 'UPDATE'
       or coalesce(current_setting('kdp.suggestion_use', true), '') <> 'on'
       or old.used_at is not null
       or old.version_id is not null
       or new.used_at is null
       or (to_jsonb(new) - 'used_at' - 'version_id') <> (to_jsonb(old) - 'used_at' - 'version_id') then
      raise exception 'suggestions_server_only'
        using errcode = '42501',
              detail = 'Suggestions are written by the server. Use apply_suggestion() to accept one.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  -- Checked on insert, and on an update only when the column changes (a
  -- cascade that sets a version link to null passes; its section may be gone).
  if (tg_op = 'INSERT' or (new.section_id, new.user_id, new.book_id) is distinct from (old.section_id, old.user_id, old.book_id))
     and not exists (select 1 from public.sections s join public.chapters c on c.id = s.chapter_id
                      where s.id = new.section_id and s.user_id = new.user_id and c.book_id = new.book_id) then
    raise exception 'suggestion_owner'
      using errcode = 'P0001',
            detail = 'A suggestion belongs to the owner and the book of its section.';
  end if;
  if new.base_version_id is not null
     and (tg_op = 'INSERT' or new.base_version_id is distinct from old.base_version_id)
     and not exists (select 1 from public.section_versions v
                      where v.id = new.base_version_id and v.section_id = new.section_id) then
    raise exception 'version_other_section'
      using errcode = 'P0001',
            detail = 'A suggestion starts from a version of its own section.';
  end if;
  if new.version_id is not null
     and (tg_op = 'INSERT' or new.version_id is distinct from old.version_id)
     and not exists (select 1 from public.section_versions v
                      where v.id = new.version_id and v.section_id = new.section_id) then
    raise exception 'version_other_section'
      using errcode = 'P0001',
            detail = 'An applied suggestion links a version of its own section.';
  end if;
  return new;
end;
$$;

comment on function public.section_suggestions_guard() is
  'Trigger (E10.3): users only mark a suggestion used through apply_suggestion() (42501 "suggestions_server_only"); user_id and book_id match the section (P0001 "suggestion_owner"); base_version_id and version_id belong to the same section (P0001 "version_other_section"); created_at is the server clock.';

create trigger section_suggestions_guard
  before insert or update on public.section_suggestions
  for each row execute function public.section_suggestions_guard();

revoke execute on function public.section_suggestions_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. section_versions_guard: the improve sources through apply_suggestion
-- ---------------------------------------------------------------------------
create or replace function public.section_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if not ((coalesce(current_setting('kdp.version_write', true), '') = 'on'
             and new.source in ('manual', 'restore'))
            or (coalesce(current_setting('kdp.suggestion_apply', true), '') = 'on'
                and new.source in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom'))) then
      raise exception 'versions_rpc_only'
        using errcode = '42501',
              detail = 'Save writing with save_version(), restore_version() or apply_suggestion().';
    end if;
  end if;
  if not exists (select 1 from public.sections s where s.id = new.section_id and s.user_id = new.user_id) then
    raise exception 'version_owner'
      using errcode = 'P0001',
            detail = 'A version belongs to the owner of its section.';
  end if;
  new.word_count := public.md_word_count(new.content);
  return new;
end;
$$;

comment on function public.section_versions_guard() is
  'Trigger (E10.1, E10.3): browsers insert versions only through save_version() / restore_version() (manual, restore) or apply_suggestion() (the six improve sources) (42501 "versions_rpc_only"); user_id is the section''s owner (P0001 "version_owner"); word_count from md_word_count.';

-- ---------------------------------------------------------------------------
-- 3. apply_suggestion (Accept)
-- ---------------------------------------------------------------------------
create or replace function public.apply_suggestion(p_suggestion_id uuid, p_base_version_id uuid, p_full_text text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s          public.section_suggestions;
  v_current  uuid;
  v_base     public.section_versions;
  v_draft    text;
  v_from     int := 1;
  v_at       int;
  v_ok       boolean := false;
  v_row      public.section_versions;
  v_new      int;
begin
  if p_full_text is null then
    raise exception 'bad_content'
      using errcode = '22023',
            detail = 'Send the section text.';
  end if;

  -- 1. Read through RLS: another user's suggestion reads as missing.
  select * into s from public.section_suggestions x where x.id = p_suggestion_id;
  if not found then
    raise exception 'suggestion_not_found'
      using errcode = 'P0002',
            detail = 'This suggestion does not exist, or it belongs to another account.';
  end if;

  -- 2. Lock the section, then read the suggestion again under the lock.
  v_current := public.write_lock_section(s.section_id);
  select * into s from public.section_suggestions x where x.id = p_suggestion_id for update;
  if not found then
    raise exception 'suggestion_not_found'
      using errcode = 'P0002',
            detail = 'This suggestion does not exist, or it belongs to another account.';
  end if;

  -- 3. Once, within 1 hour (owner, decision 5).
  if s.used_at is not null then
    raise exception 'suggestion_used'
      using errcode = 'P0001',
            detail = 'This suggestion was already applied.';
  end if;
  if s.created_at < now() - interval '1 hour' then
    raise exception 'suggestion_expired'
      using errcode = 'P0001',
            detail = 'This suggestion is too old. Ask again.';
  end if;

  -- 4. The base: a version of this section, not older than the suggestion's
  -- base, and the current version (decision 6).
  select * into v_base from public.section_versions v
   where v.id = p_base_version_id and v.section_id = s.section_id;
  if not found
     or v_base.version_no < coalesce((select v.version_no from public.section_versions v where v.id = s.base_version_id), 0)
     or v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This section was saved in another tab.';
  end if;

  -- 5. Typed text is never lost. A draft equal to the current version (or
  -- blank) is not typing; it is deleted below.
  select d.content into v_draft from public.section_drafts d where d.section_id = s.section_id;
  if not public.text_is_blank(v_draft) and v_draft is distinct from v_base.content then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed first.';
  end if;

  -- 6. A fresh Generate run (the rule of section_run_fresh, 0020).
  if exists (select 1 from public.section_runs r
              where r.section_id = s.section_id and r.state = 'running'
                and r.heartbeat_at > now() - interval '20 seconds'
                and r.started_at > now() - interval '160 seconds') then
    raise exception 'run_in_progress'
      using errcode = 'P0001',
            detail = 'This section is being written in another tab or window.';
  end if;

  -- 7. Only the passage changed: at one place where the output occurs, the
  -- text before it + the selection + the text after it is the base text.
  if char_length(p_full_text) - char_length(s.output) = char_length(v_base.content) - char_length(s.selection) then
    loop
      v_at := strpos(substr(p_full_text, v_from), s.output);
      exit when v_at = 0;
      v_at := v_from + v_at - 1;
      if substr(v_base.content, v_at, char_length(s.selection)) = s.selection
         and left(p_full_text, v_at - 1) || s.selection || substr(p_full_text, v_at + char_length(s.output)) = v_base.content then
        v_ok := true;
        exit;
      end if;
      v_from := v_at + 1;
    end loop;
  end if;
  if not v_ok then
    raise exception 'suggestion_mismatch'
      using errcode = 'P0001',
            detail = 'The text does not match this suggestion.';
  end if;

  -- 8. Length and the next number.
  v_new := public.write_next_version(s.section_id, p_full_text);

  -- 9. The version (source = the action), made current. Reviewed and Final
  -- stay (decision 7); Needs review when the positioning is no longer locked.
  perform set_config('kdp.suggestion_apply', 'on', true);
  insert into public.section_versions (user_id, section_id, version_no, content, source)
  select x.user_id, x.id, v_new, p_full_text, s.action
    from public.sections x where x.id = s.section_id
  returning * into v_row;
  perform set_config('kdp.suggestion_apply', '', true);

  perform set_config('kdp.version_write', 'on', true);
  update public.sections
     set current_version_id = v_row.id,
         status = case when status = 'not_started' then 'draft' else status end,
         needs_review = needs_review or not exists (
           select 1 from public.positioning p join public.chapters c on c.book_id = p.book_id
            where c.id = sections.chapter_id and p.locked_at is not null)
   where id = s.section_id;
  perform set_config('kdp.version_write', '', true);

  delete from public.section_drafts d where d.section_id = s.section_id;

  perform set_config('kdp.suggestion_use', 'on', true);
  update public.section_suggestions
     set used_at = now(), version_id = v_row.id
   where id = s.id;
  perform set_config('kdp.suggestion_use', '', true);

  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'source', v_row.source);
end;
$$;

comment on function public.apply_suggestion(uuid, uuid, text) is
  'E10.3: accept an Improve suggestion: a new current version with source = the action, the draft deleted, the suggestion used. Raises P0002 suggestion_not_found, section_not_found; P0001 suggestion_used, suggestion_expired, version_conflict, unsaved_draft, run_in_progress, suggestion_mismatch, section_too_long.';

revoke execute on function public.apply_suggestion(uuid, uuid, text) from public, anon;
grant execute on function public.apply_suggestion(uuid, uuid, text) to authenticated;
