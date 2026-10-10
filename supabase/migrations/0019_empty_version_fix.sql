-- 0019_empty_version_fix.sql
-- KDP Lab · E10.1 fix: no blank first version; blank text is not writing.
--
-- Live bug (E10.1 on main): a writer typed one character in an empty section,
-- deleted it, and left the section. The browser saved the blank text as v1,
-- so the section counted as "has writing" and 05 Regenerate was blocked. The
-- browser no longer does that (js/book-write.js). This migration makes the
-- server refuse it too, and stops blank text from counting as writing.
--
-- 1. text_is_blank(t): true for null, '' or whitespace only (spaces, tabs,
--    line breaks). Stricter than btrim(t) = '', which keeps line breaks.
-- 2. save_version (0018) raises P0001 "empty_first_version" when the text is
--    blank and the section has no current version. Everything else is as in
--    0018: a blank version after a real one is still allowed (the writer
--    cleared the section on purpose), and restore_version is unchanged.
-- 3. section_has_writing (0018) counts only versions and drafts whose text is
--    not blank. The delete guard and replace_outline (0018) call it, so a
--    section whose only version or draft is blank can be removed, and
--    Regenerate is allowed. outline_json's has_writing (0018) follows.
-- 4. unlock_positioning (0018) marks and counts a section as written with the
--    same rule (section_has_writing).
--
-- No data is changed or deleted here. Live blank versions stay until the
-- owner removes them; from this migration on they no longer count as writing.
-- Nothing else from 0018 changes.

-- ---------------------------------------------------------------------------
-- 1. Blank text
-- ---------------------------------------------------------------------------
create or replace function public.text_is_blank(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(t, '') ~ '^[ \t\n\r\f\v]*$';
$$;

comment on function public.text_is_blank(text) is
  '0019: null, empty or whitespace only (spaces, tabs, line breaks).';

-- ---------------------------------------------------------------------------
-- 2. save_version: no blank first version
-- ---------------------------------------------------------------------------
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

  -- 0019: a section's first version is never blank (a typed-and-deleted
  -- character once saved an empty v1 when the writer left the section).
  if v_current is null and public.text_is_blank(p_content) then
    raise exception 'empty_first_version'
      using errcode = 'P0001',
            detail = 'There is no text to save yet.';
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
  'E10.1, 0019: save a section''s text as a new manual version (made current unless p_make_current is false) and delete its draft. Raises P0001 version_conflict, section_too_long, empty_first_version (blank text and no version yet); P0002 section_not_found.';

revoke execute on function public.save_version(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.save_version(uuid, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. section_has_writing: only text counts
-- ---------------------------------------------------------------------------
create or replace function public.section_has_writing(p_section_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.section_versions v
                  where v.section_id = p_section_id and not public.text_is_blank(v.content))
      or exists (select 1 from public.section_drafts d
                  where d.section_id = p_section_id and not public.text_is_blank(d.content));
$$;

comment on function public.section_has_writing(uuid) is
  'E10.1, 0019: a section has writing when it has a version or a draft with text (not blank).';

-- ---------------------------------------------------------------------------
-- 4. unlock_positioning: written = section_has_writing
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
     and public.section_has_writing(s.id);

  select count(distinct s.chapter_id)
    into v_written
    from public.sections s
    join public.chapters c on c.id = s.chapter_id
   where c.book_id = p_book_id
     and public.section_has_writing(s.id);

  return jsonb_build_object('title', v_title, 'outline', v_outline, 'chapters', v_chapters, 'written_chapters', v_written);
end;
$$;

comment on function public.unlock_positioning(uuid) is
  'E8.1, E9.2, E10.1, 0019: unlock a book''s positioning, mark the title, chapters and written sections (a version or a draft with text) "Needs review", and clear the outline approval. Nothing is deleted. Raises P0002 "positioning_not_locked".';
