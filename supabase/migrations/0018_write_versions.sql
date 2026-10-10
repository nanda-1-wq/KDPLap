-- 0018_write_versions.sql
-- KDP Lab · E10.1 · Step 06 Write: drafts and versions (no AI yet).
--
-- 1. section_versions stay insert-only (0001) and are closed to direct
--    inserts from the browser. A BEFORE INSERT guard refuses anon and
--    authenticated unless the transaction-local setting kdp.version_write is
--    'on'. Only save_version() and restore_version() set it, and through it
--    only the sources 'manual' and 'restore' pass. set_config is not exposed
--    through the API, so a browser cannot set it (same idea as 0006, 0010 and
--    0017). The INSERT grant and policy stay: the RPCs are SECURITY INVOKER
--    and run as the user, so a revoke would break them. The service role (the
--    generate function, E10.2: 'generate', 'improve', ...) and the owner
--    bypass the setting; for every role the guard keeps user_id equal to the
--    section's owner, because the service role bypasses RLS. Update and delete
--    have no policy (0001) and are also revoked from anon and authenticated.
--    The guard raises 42501 "versions_rpc_only" (like an RLS refusal).
-- 2. Text limit: content at most 100,000 characters (owner, E10). word_count
--    is set by the same guard from md_word_count(content): one source of
--    truth, whatever the caller sends. md_word_count is the rule of
--    kdpWords.count (js/word-budget.js): Markdown markers at the start of a
--    line (#..######, -, +, 1. or 1)) and every * are not words; the rest is
--    split on ASCII whitespace.
-- 3. section_drafts: one row per section, the text being typed. Autosave
--    updates it; it never touches a version. RLS: a user reads and writes
--    only their own rows. A guard keeps user_id equal to the section's owner
--    and base_version_id null or a version of the same section. saved_at is
--    the server clock (set on every write). A draft is deleted when its text
--    is saved as a version.
-- 4. sections.current_version_id changes only inside the RPCs (the setting)
--    or by the service role / owner, and always to a version of the same
--    section. Clearing it is allowed only when that version is gone (the
--    foreign key's "on delete set null" during a cascade). P0001
--    "version_other_section", 42501 "versions_rpc_only".
-- 5. RPCs, SECURITY INVOKER (RLS as the caller), one transaction, the section
--    row locked:
--      save_version(section, content, base_version, make_current default true)
--        → { id, version_no, word_count, created_at, created }
--        A 'manual' version. When make_current, base_version must be the
--        current version (else P0001 "version_conflict": another tab saved),
--        the same text as the current version adds nothing (created false),
--        and a 'not_started' section becomes 'draft'. make_current false
--        keeps a draft as a version that is not current ("Keep saved
--        version" after a conflict). The draft is deleted either way.
--      restore_version(section, version, base_version)
--        → { id, version_no, word_count, created_at, created }
--        A new 'restore' version, labelled "Restored from vN", made current.
--        The old row never changes. Refused while a draft holds text that is
--        not saved (P0001 "unsaved_draft"): the browser saves it first.
--      Both raise P0002 "section_not_found", P0001 "section_too_long"; restore
--      P0002 "version_not_found".
-- 6. "Has writing" counts a draft too: the delete guard (0016),
--    replace_outline (0016) and unlock_positioning (0017) treat a section
--    with a draft as written, so typed text is never deleted with the
--    outline and is marked "Needs review" on an unlock.
-- 7. outline_json (0016) adds per section: has_writing (any version or a
--    draft), words (current version), version_at, has_draft, draft_words,
--    draft_at. Additive keys only.
--
-- Checked before writing (read-only): fill in at the owner's live check.
-- Expected: 0 section_versions rows, no section_drafts table, last migration
-- 20261008223030 (0017).

-- ---------------------------------------------------------------------------
-- 1. Word count (same rule as kdpWords.count in js/word-budget.js)
-- ---------------------------------------------------------------------------
create or replace function public.md_word_count(t text)
returns int
language sql
immutable
set search_path = ''
as $$
  select count(*)::int
    from regexp_split_to_table(
           replace(regexp_replace(coalesce(t, ''), '^[ \t]*(#{1,6}|[-+]|[0-9]{1,9}[.)])[ \t]+', '', 'gn'), '*', ''),
           '[ \t\n\r\f\v]+') w
   where w <> '';
$$;

comment on function public.md_word_count(text) is
  'E10.1: words in a section''s Markdown text. Same rule as kdpWords.count (js/word-budget.js).';

-- ---------------------------------------------------------------------------
-- 2. section_versions: limit, word count and the insert guard
-- ---------------------------------------------------------------------------
alter table public.section_versions
  add constraint section_versions_content_length_check
  check (char_length(content) <= 100000);

create or replace function public.section_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if coalesce(current_setting('kdp.version_write', true), '') <> 'on'
       or new.source not in ('manual', 'restore') then
      raise exception 'versions_rpc_only'
        using errcode = '42501',
              detail = 'Save writing with save_version() or restore_version().';
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
  'Trigger (E10.1): browsers insert versions only through save_version() / restore_version() (42501 "versions_rpc_only"); user_id is the section''s owner (P0001 "version_owner"); word_count from md_word_count.';

create trigger section_versions_guard
  before insert on public.section_versions
  for each row execute function public.section_versions_guard();

revoke execute on function public.section_versions_guard() from public, anon, authenticated;

-- Insert-only (0001 has no update or delete policy). Take the privileges
-- back too; foreign-key cascades still remove versions with their section.
revoke update, delete, truncate on public.section_versions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. section_drafts
-- ---------------------------------------------------------------------------
create table public.section_drafts (
  section_id       uuid primary key references public.sections (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content          text not null default '',
  base_version_id  uuid references public.section_versions (id) on delete set null,
  saved_at         timestamptz not null default now(),
  constraint section_drafts_content_length_check check (char_length(content) <= 100000)
);

create index section_drafts_user_id_idx on public.section_drafts (user_id);
create index section_drafts_base_version_id_idx on public.section_drafts (base_version_id);

comment on table public.section_drafts is
  'E10.1: the text being typed in a section (autosave). One row per section. Saved as a version on Save version, leaving the section, 10 minutes idle, or before an AI action or restore.';
comment on column public.section_drafts.base_version_id is
  'The version the draft started from. When it is not the section''s current version, another tab saved meanwhile.';

alter table public.section_drafts enable row level security;

create policy "section_drafts_select_own" on public.section_drafts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "section_drafts_insert_own" on public.section_drafts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sections s
                where s.id = section_id and s.user_id = (select auth.uid()))
  );

create policy "section_drafts_update_own" on public.section_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "section_drafts_delete_own" on public.section_drafts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- The service role bypasses RLS, so the owner is checked here (like 0017).
create or replace function public.section_drafts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.section_id is distinct from old.section_id then
    raise exception 'draft_owner'
      using errcode = 'P0001',
            detail = 'A draft stays with its section.';
  end if;
  if not exists (select 1 from public.sections s where s.id = new.section_id and s.user_id = new.user_id) then
    -- 42501, like an RLS refusal: the section is not the caller's.
    raise exception 'draft_owner'
      using errcode = '42501',
            detail = 'A draft belongs to the owner of its section.';
  end if;
  if new.base_version_id is not null
     and not exists (select 1 from public.section_versions v
                      where v.id = new.base_version_id and v.section_id = new.section_id) then
    raise exception 'version_other_section'
      using errcode = 'P0001',
            detail = 'A draft starts from a version of its own section.';
  end if;
  new.saved_at := now();
  return new;
end;
$$;

comment on function public.section_drafts_guard() is
  'Trigger (E10.1): section_drafts.user_id is the section''s owner (42501 "draft_owner"; P0001 when the section changes), base_version_id is a version of the same section (P0001 "version_other_section"), saved_at is the server clock.';

create trigger section_drafts_guard
  before insert or update on public.section_drafts
  for each row execute function public.section_drafts_guard();

revoke execute on function public.section_drafts_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. sections.current_version_id guard
-- ---------------------------------------------------------------------------
create or replace function public.sections_version_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old uuid := case when tg_op = 'UPDATE' then old.current_version_id end;
begin
  if new.current_version_id is not distinct from v_old then
    return new;
  end if;
  if new.current_version_id is null then
    -- Only when the version is gone (on delete set null during a cascade).
    if exists (select 1 from public.section_versions v where v.id = v_old)
       and current_user in ('anon', 'authenticated')
       and coalesce(current_setting('kdp.version_write', true), '') <> 'on' then
      raise exception 'versions_rpc_only'
        using errcode = '42501',
              detail = 'The current version changes only through save_version() or restore_version().';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.section_versions v
                  where v.id = new.current_version_id and v.section_id = new.id) then
    raise exception 'version_other_section'
      using errcode = 'P0001',
            detail = 'The current version must be a version of this section.';
  end if;
  if current_user in ('anon', 'authenticated')
     and coalesce(current_setting('kdp.version_write', true), '') <> 'on' then
    raise exception 'versions_rpc_only'
      using errcode = '42501',
            detail = 'The current version changes only through save_version() or restore_version().';
  end if;
  return new;
end;
$$;

comment on function public.sections_version_guard() is
  'Trigger (E10.1): sections.current_version_id changes only through the version RPCs (or the service role), to a version of the same section.';

create trigger sections_version_guard
  before insert or update of current_version_id on public.sections
  for each row execute function public.sections_version_guard();

revoke execute on function public.sections_version_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------
-- Locks the caller's section row and returns its current version, or raises
-- section_not_found (RLS hides other users' sections).
create or replace function public.write_lock_section(p_section_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid;
begin
  select s.current_version_id into v_current
    from public.sections s
   where s.id = p_section_id
     for update;
  if not found then
    raise exception 'section_not_found'
      using errcode = 'P0002',
            detail = 'This section does not exist, or it belongs to another account.';
  end if;
  return v_current;
end;
$$;

revoke execute on function public.write_lock_section(uuid) from public, anon;
grant execute on function public.write_lock_section(uuid) to authenticated;

-- The length check and the next version number (the section row is locked).
-- Read-only, so it is safe to expose; the insert itself stays inside the RPCs
-- below, so no other function can reach the setting.
create or replace function public.write_next_version(p_section_id uuid, p_content text)
returns int
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if char_length(p_content) > 100000 then
    raise exception 'section_too_long'
      using errcode = 'P0001',
            detail = 'A section holds at most 100,000 characters.';
  end if;
  return coalesce((select max(v.version_no) from public.section_versions v where v.section_id = p_section_id), 0) + 1;
end;
$$;

revoke execute on function public.write_next_version(uuid, text) from public, anon;
grant execute on function public.write_next_version(uuid, text) to authenticated;

create or replace function public.save_version(p_section_id uuid, p_content text, p_base_version_id uuid,
                                               p_make_current boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid := public.write_lock_section(p_section_id);
  v_cur     public.section_versions;
  v_row     public.section_versions;
  v_new     int;
begin
  if p_content is null then
    raise exception 'bad_content'
      using errcode = '22023',
            detail = 'Send the section text.';
  end if;

  if p_make_current then
    if v_current is distinct from p_base_version_id then
      raise exception 'version_conflict'
        using errcode = 'P0001',
              detail = 'This section was saved in another tab.';
    end if;
    select * into v_cur from public.section_versions v where v.id = v_current;
    if found and v_cur.content = p_content then
      -- Nothing new to keep: no new row, and the draft (same text) goes.
      delete from public.section_drafts d where d.section_id = p_section_id;
      return jsonb_build_object('id', v_cur.id, 'version_no', v_cur.version_no, 'word_count', v_cur.word_count,
                                'created_at', v_cur.created_at, 'created', false);
    end if;
  end if;

  v_new := public.write_next_version(p_section_id, p_content);
  -- Transaction-local: lets the guards accept this one version (section 1, 4).
  perform set_config('kdp.version_write', 'on', true);
  insert into public.section_versions (user_id, section_id, version_no, content, source)
  select s.user_id, s.id, v_new, p_content, 'manual'
    from public.sections s where s.id = p_section_id
  returning * into v_row;
  if p_make_current then
    update public.sections
       set current_version_id = v_row.id,
           status = case when status = 'not_started' then 'draft' else status end
     where id = p_section_id;
  end if;
  perform set_config('kdp.version_write', '', true);
  delete from public.section_drafts d where d.section_id = p_section_id;
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.save_version(uuid, text, uuid, boolean) is
  'E10.1: save a section''s text as a new manual version (made current unless p_make_current is false) and delete its draft. Raises P0001 version_conflict, section_too_long; P0002 section_not_found.';

revoke execute on function public.save_version(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.save_version(uuid, text, uuid, boolean) to authenticated;

create or replace function public.restore_version(p_section_id uuid, p_version_id uuid, p_base_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid := public.write_lock_section(p_section_id);
  v_old     public.section_versions;
  v_cur     text;
  v_draft   text;
  v_row     public.section_versions;
  v_new     int;
begin
  if v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This section was saved in another tab.';
  end if;

  select * into v_old from public.section_versions v
   where v.id = p_version_id and v.section_id = p_section_id;
  if not found then
    raise exception 'version_not_found'
      using errcode = 'P0002',
            detail = 'This version does not exist in this section.';
  end if;

  -- Typed text is never lost: the browser saves the draft first.
  select v.content into v_cur from public.section_versions v where v.id = v_current;
  select d.content into v_draft from public.section_drafts d where d.section_id = p_section_id;
  if v_draft is not null and v_draft is distinct from coalesce(v_cur, '') then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed before you restore.';
  end if;
  delete from public.section_drafts d where d.section_id = p_section_id;

  v_new := public.write_next_version(p_section_id, v_old.content);
  perform set_config('kdp.version_write', 'on', true);
  insert into public.section_versions (user_id, section_id, version_no, content, source, label)
  select s.user_id, s.id, v_new, v_old.content, 'restore', 'Restored from v' || v_old.version_no
    from public.sections s where s.id = p_section_id
  returning * into v_row;
  update public.sections
     set current_version_id = v_row.id,
         status = case when status = 'not_started' then 'draft' else status end
   where id = p_section_id;
  perform set_config('kdp.version_write', '', true);
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.restore_version(uuid, uuid, uuid) is
  'E10.1: restore an older version as a new current ''restore'' version. Nothing is overwritten. Raises P0001 version_conflict, unsaved_draft; P0002 section_not_found, version_not_found.';

revoke execute on function public.restore_version(uuid, uuid, uuid) from public, anon;
grant execute on function public.restore_version(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. "Has writing" counts drafts too
-- ---------------------------------------------------------------------------
create or replace function public.section_has_writing(p_section_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.section_versions v where v.section_id = p_section_id)
      or exists (select 1 from public.section_drafts d where d.section_id = p_section_id);
$$;

comment on function public.section_has_writing(uuid) is
  'E10.1: a section has writing when it has any version or a draft.';

revoke execute on function public.section_has_writing(uuid) from public, anon;
grant execute on function public.section_has_writing(uuid) to authenticated;

-- 0016, now with drafts. Otherwise unchanged.
create or replace function public.outline_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'chapters' then
    -- The book is gone during a book delete: let the cascade through.
    if not exists (select 1 from public.books b where b.id = old.book_id) then
      return old;
    end if;
    if exists (select 1 from public.sections s
                where s.chapter_id = old.id and public.section_has_writing(s.id)) then
      raise exception 'has_writing'
        using errcode = 'P0001',
              detail = 'This chapter has writing, so it cannot be deleted.';
    end if;
  else
    if not exists (select 1 from public.chapters c where c.id = old.chapter_id) then
      return old;
    end if;
    if public.section_has_writing(old.id) then
      raise exception 'has_writing'
        using errcode = 'P0001',
              detail = 'This section has writing, so it cannot be deleted.';
    end if;
  end if;
  return old;
end;
$$;

comment on function public.outline_delete_guard() is
  'Trigger (E9.1, E10.1): a chapter or section with any section version or a draft cannot be deleted (P0001 "has_writing"), except when its book is deleted.';

-- 0016, now with drafts. Otherwise unchanged.
create or replace function public.replace_outline(p_book_id uuid, p_outline jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chapters jsonb := case when jsonb_typeof(p_outline) = 'object' then p_outline -> 'chapters' end;
  v_n        int;
  v_ch       jsonb;
  v_i        bigint;
  v_id       uuid;
  v_kind     text;
  v_words    int;
begin
  perform public.outline_lock_book(p_book_id);

  if not exists (select 1 from public.positioning p
                  where p.book_id = p_book_id and p.locked_at is not null) then
    raise exception 'positioning_not_locked'
      using errcode = 'P0001',
            detail = 'Lock the positioning before making an outline.';
  end if;

  if exists (select 1 from public.chapters c
               join public.sections s on s.chapter_id = c.id
              where c.book_id = p_book_id and public.section_has_writing(s.id)) then
    raise exception 'has_writing'
      using errcode = 'P0001',
            detail = 'Some sections have writing. Edit the outline by hand.';
  end if;

  v_n := case when jsonb_typeof(v_chapters) = 'array' then jsonb_array_length(v_chapters) else 0 end;
  if v_n not between 1 and 30
     or exists (select 1 from jsonb_array_elements(v_chapters) e
                 where jsonb_typeof(e) <> 'object'
                    or jsonb_typeof(e -> 'sections') is distinct from 'array'
                    or jsonb_array_length(e -> 'sections') not between 1 and 12) then
    raise exception 'bad_outline'
      using errcode = '22023',
            detail = 'An outline has 1 to 30 chapters with 1 to 12 sections each.';
  end if;

  delete from public.chapters c where c.book_id = p_book_id;

  -- Introduction (position 0), the chapters (1..n), the Conclusion (n + 1).
  foreach v_kind in array array['intro', 'conclusion'] loop
    v_words := (p_outline ->> (v_kind || '_words'))::int;
    insert into public.chapters (book_id, position, kind)
    values (p_book_id, case when v_kind = 'intro' then 0 else v_n + 1 end, v_kind)
    returning id into v_id;
    insert into public.sections (chapter_id, position, word_target) values (v_id, 1, v_words);
  end loop;

  for v_ch, v_i in select e, o from jsonb_array_elements(v_chapters) with ordinality as t(e, o) loop
    insert into public.chapters (book_id, position, kind, title, objective, unsourced)
    values (p_book_id, v_i, 'chapter',
            nullif(btrim(v_ch ->> 'title'), ''),
            nullif(btrim(v_ch ->> 'objective'), ''),
            coalesce(array(select jsonb_array_elements_text(
                             case when jsonb_typeof(v_ch -> 'unsourced') = 'array' then v_ch -> 'unsourced' else '[]'::jsonb end)), '{}'))
    returning id into v_id;
    insert into public.sections (chapter_id, position, title, word_target)
    select v_id, o, nullif(btrim(s ->> 'title'), ''), (s ->> 'words')::int
      from jsonb_array_elements(v_ch -> 'sections') with ordinality as t(s, o);
  end loop;

  update public.books set outline_approved_at = null where id = p_book_id;

  return public.outline_json(p_book_id);
end;
$$;

comment on function public.replace_outline(uuid, jsonb) is
  'E9.1, E10.1: replace a book''s outline in one transaction (generate, stage outline_ideas). Needs a locked positioning and no writing (versions or drafts). Clears the outline approval.';

-- 0017, now with drafts: a section with only a draft is marked and counted too.
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
     and (s.current_version_id is not null
          or exists (select 1 from public.section_drafts d where d.section_id = s.id));

  select count(distinct s.chapter_id)
    into v_written
    from public.sections s
    join public.chapters c on c.id = s.chapter_id
   where c.book_id = p_book_id
     and (s.current_version_id is not null
          or exists (select 1 from public.section_drafts d where d.section_id = s.id));

  return jsonb_build_object('title', v_title, 'outline', v_outline, 'chapters', v_chapters, 'written_chapters', v_written);
end;
$$;

comment on function public.unlock_positioning(uuid) is
  'E8.1, E9.2, E10.1: unlock a book''s positioning, mark the title, chapters and written sections (a version or a draft) "Needs review", and clear the outline approval. Nothing is deleted. Raises P0002 "positioning_not_locked".';

-- ---------------------------------------------------------------------------
-- 7. outline_json: words written per section (additive keys)
-- ---------------------------------------------------------------------------
create or replace function public.outline_json(p_book_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'position', c.position, 'kind', c.kind, 'title', c.title,
           'objective', c.objective, 'include_examples', c.include_examples,
           'include_exercise', c.include_exercise, 'needs_review', c.needs_review,
           'unsourced', to_jsonb(c.unsourced),
           'sections', (select coalesce(jsonb_agg(jsonb_build_object(
                                'id', s.id, 'position', s.position, 'title', s.title,
                                'word_target', s.word_target, 'status', s.status,
                                'needs_review', s.needs_review,
                                'current_version_id', s.current_version_id,
                                'has_writing', public.section_has_writing(s.id),
                                'words', coalesce(v.word_count, 0),
                                'version_at', v.created_at,
                                'has_draft', d.section_id is not null,
                                'draft_words', case when d.section_id is not null then public.md_word_count(d.content) end,
                                'draft_at', d.saved_at) order by s.position), '[]'::jsonb)
                          from public.sections s
                          left join public.section_versions v on v.id = s.current_version_id
                          left join public.section_drafts d on d.section_id = s.id
                         where s.chapter_id = c.id))
           order by c.position), '[]'::jsonb)
    from public.chapters c
   where c.book_id = p_book_id;
$$;

comment on function public.outline_json(uuid) is
  'E9.1, E10.1: a book''s chapters (in order) with their sections and words written (current version, draft), as jsonb. Runs under the caller''s RLS.';
