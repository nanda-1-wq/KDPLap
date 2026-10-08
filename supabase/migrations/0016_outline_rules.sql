-- 0016_outline_rules.sql
-- KDP Lab · E9.1 · Step 05 Outline: chapter and section rules.
--
-- 1. Field limits
--      chapters.title       null or 1 to 150 characters (not blank)
--      chapters.objective   null or 1 to 300 characters (not blank)
--      sections.title       null or 1 to 150 characters (not blank)
--      sections.word_target null or 0 to 10,000
--      chapters.word_target must stay null. One source of truth: a section's
--        word_target is the only stored number. A chapter's total is the sum
--        of its sections. The Introduction and the Conclusion each hold one
--        section that carries their words.
-- 2. chapters.unsourced text[] (at most 10 items of 1 to 20 characters)
--      Numbers in a title or objective that the Brief and Research do not
--      have. The server writes them when it saves a generated outline. The
--      user cannot add any; editing that title or objective clears them.
-- 3. Kinds and caps (trigger chapters_guard, sections_guard)
--      At most one Introduction and one Conclusion per book (unique index).
--      A chapter's kind never changes. At most 30 chapters of kind 'chapter'
--      per book (P0001 "outline_full"), at most 12 sections per chapter and
--      1 for the Introduction and the Conclusion (P0001 "sections_full").
-- 4. "Has writing" delete guard (trigger outline_delete_guard)
--      A section with any section_versions row (a stopped generation keeps
--      its partial text as a version too) cannot be deleted, nor its chapter
--      (P0001 "has_writing"). Deleting the book still removes everything:
--      during that cascade the parent row is already gone, so the guard lets
--      it through.
-- 5. Outline edits move the book to the top of Books (see 0009).
-- 6. RPCs, SECURITY INVOKER (every statement runs under the caller's RLS):
--      replace_outline(book_id, outline jsonb) → the saved outline (jsonb)
--        The generate function calls it as the user after an outline_ideas
--        call. Needs a locked positioning (P0001 "positioning_not_locked")
--        and no writing (P0001 "has_writing"). One transaction: deletes the
--        old outline, inserts Introduction, chapters and Conclusion with
--        their sections, clears books.outline_approved_at.
--        Shape: { intro_words, conclusion_words,
--                 chapters: [{ title, objective, unsourced: [text],
--                              sections: [{ title, words }] }] }
--        1 to 30 chapters, 1 to 12 sections each, else 22023 "bad_outline".
--      add_chapter(book_id) → the new chapter id. Adds an untitled chapter
--        with one section before the Conclusion. On an empty book it adds
--        the Introduction and the Conclusion too.
--      reorder_chapters(book_id, ids uuid[]) → void. ids = the book's
--        chapters of kind 'chapter', each once, in the new order (else P0001
--        "outline_changed"). The Introduction stays first, the Conclusion last.
--      All three raise P0002 "book_not_found" for a book the caller cannot see.
--
-- Checked before writing (read-only, 2026-10-08): 4 books, 0 chapters,
-- 0 sections, 0 section versions, 0 approved outlines. No row can fail the
-- new checks. Triggers on chapters and sections: only *_set_updated_at.

-- ---------------------------------------------------------------------------
-- 1. Field limits
-- ---------------------------------------------------------------------------
alter table public.chapters
  add constraint chapters_title_length_check
  check (title is null or (char_length(title) <= 150 and char_length(btrim(title)) >= 1));

alter table public.chapters
  add constraint chapters_objective_length_check
  check (objective is null or (char_length(objective) <= 300 and char_length(btrim(objective)) >= 1));

alter table public.chapters
  add constraint chapters_word_target_unused_check
  check (word_target is null);

comment on column public.chapters.word_target is
  'Unused (0016): a chapter total is the sum of its sections'' word_target.';

alter table public.sections
  add constraint sections_title_length_check
  check (title is null or (char_length(title) <= 150 and char_length(btrim(title)) >= 1));

alter table public.sections
  add constraint sections_word_target_max_check
  check (word_target is null or word_target <= 10000);

-- ---------------------------------------------------------------------------
-- 2. Unsourced numbers
-- ---------------------------------------------------------------------------
alter table public.chapters add column unsourced text[] not null default '{}';

alter table public.chapters
  add constraint chapters_unsourced_check
  check (public.text_items_ok(unsourced, 10, 20));

comment on column public.chapters.unsourced is
  'Numbers in the title or objective with no source in the Brief or Research (server). Cleared when the user edits either.';

-- ---------------------------------------------------------------------------
-- 3. Kinds and caps
-- ---------------------------------------------------------------------------
create unique index chapters_one_intro_conclusion_key
  on public.chapters (book_id, kind)
  where kind in ('intro', 'conclusion');

-- SECURITY INVOKER: the count and the lock run under the caller's RLS (the
-- insert policy already requires the caller to own the book).
create or replace function public.chapters_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind then
      raise exception 'chapter_kind_fixed'
        using errcode = 'P0001',
              detail = 'A chapter cannot become the Introduction or the Conclusion.';
    end if;
    if current_user in ('anon', 'authenticated') then
      if new.unsourced is distinct from old.unsourced and cardinality(new.unsourced) > 0 then
        raise exception 'unsourced_read_only'
          using errcode = 'P0001',
                detail = 'Only the server marks numbers with no source.';
      end if;
    end if;
    -- An edited title or objective is the author's own text now.
    if new.title is distinct from old.title or new.objective is distinct from old.objective then
      new.unsourced := '{}';
    end if;
    if new.book_id = old.book_id then
      return new;
    end if;
  end if;

  if new.kind = 'chapter' then
    perform 1 from public.books b where b.id = new.book_id for update;
    if (select count(*) from public.chapters c
         where c.book_id = new.book_id and c.kind = 'chapter' and c.id <> new.id) >= 30 then
      raise exception 'outline_full'
        using errcode = 'P0001',
              detail = 'A book can have at most 30 chapters.';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.chapters_guard() is
  'Trigger (E9.1): kind is fixed; at most 30 chapters per book (P0001 "outline_full"); unsourced is server-only and cleared by a title or objective edit.';

create trigger chapters_guard
  before insert or update on public.chapters
  for each row execute function public.chapters_guard();

revoke execute on function public.chapters_guard() from public, anon, authenticated;

create or replace function public.sections_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_cap  int;
begin
  if tg_op = 'UPDATE' and new.chapter_id = old.chapter_id then
    return new;
  end if;
  select c.kind into v_kind from public.chapters c where c.id = new.chapter_id for update;
  v_cap := case when v_kind = 'chapter' then 12 else 1 end;
  if (select count(*) from public.sections s where s.chapter_id = new.chapter_id and s.id <> new.id) >= v_cap then
    raise exception 'sections_full'
      using errcode = 'P0001',
            detail = 'A chapter can have at most 12 sections. The Introduction and the Conclusion have one.';
  end if;
  return new;
end;
$$;

comment on function public.sections_guard() is
  'Trigger (E9.1): at most 12 sections per chapter, 1 for the Introduction and the Conclusion (P0001 "sections_full").';

create trigger sections_guard
  before insert or update of chapter_id on public.sections
  for each row execute function public.sections_guard();

revoke execute on function public.sections_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. "Has writing" delete guard
-- ---------------------------------------------------------------------------
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
                 join public.section_versions v on v.section_id = s.id
                where s.chapter_id = old.id) then
      raise exception 'has_writing'
        using errcode = 'P0001',
              detail = 'This chapter has writing, so it cannot be deleted.';
    end if;
  else
    if not exists (select 1 from public.chapters c where c.id = old.chapter_id) then
      return old;
    end if;
    if exists (select 1 from public.section_versions v where v.section_id = old.id) then
      raise exception 'has_writing'
        using errcode = 'P0001',
              detail = 'This section has writing, so it cannot be deleted.';
    end if;
  end if;
  return old;
end;
$$;

comment on function public.outline_delete_guard() is
  'Trigger (E9.1): a chapter or section with any section version cannot be deleted (P0001 "has_writing"), except when its book is deleted.';

create trigger chapters_delete_guard
  before delete on public.chapters
  for each row execute function public.outline_delete_guard();

create trigger sections_delete_guard
  before delete on public.sections
  for each row execute function public.outline_delete_guard();

revoke execute on function public.outline_delete_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Outline edits move the book to the top of Books (see 0009)
-- ---------------------------------------------------------------------------
create trigger chapters_touch_book
  after insert or update or delete on public.chapters
  for each row execute function public.touch_book_from_child();

-- Sections have no book_id: find it through the chapter. During a book
-- delete the chapter is gone, so this matches no book and does nothing.
create or replace function public.touch_book_from_section()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.books b
     set updated_at = now()
   where b.updated_at < now()
     and b.id in (select c.book_id from public.chapters c
                   where c.id in (case when tg_op = 'DELETE' then old.chapter_id else new.chapter_id end,
                                  case when tg_op = 'UPDATE' then old.chapter_id end));
  return null;
end;
$$;

comment on function public.touch_book_from_section() is
  'Trigger: a section change sets books.updated_at (through its chapter), so the book moves to the top of Books.';

create trigger sections_touch_book
  after insert or update or delete on public.sections
  for each row execute function public.touch_book_from_section();

revoke execute on function public.touch_book_from_section() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------------

-- The book's outline as jsonb, in order: what replace_outline returns and the
-- same shape the browser reads (js/supabase.js getOutline).
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
                                'current_version_id', s.current_version_id) order by s.position), '[]'::jsonb)
                          from public.sections s where s.chapter_id = c.id))
           order by c.position), '[]'::jsonb)
    from public.chapters c
   where c.book_id = p_book_id;
$$;

comment on function public.outline_json(uuid) is
  'E9.1: a book''s chapters (in order) with their sections, as jsonb. Runs under the caller''s RLS.';

revoke execute on function public.outline_json(uuid) from public, anon;
grant execute on function public.outline_json(uuid) to authenticated;

-- Locks the caller's book row, or raises book_not_found (RLS hides others).
create or replace function public.outline_lock_book(p_book_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.books b where b.id = p_book_id for update;
  if not found then
    raise exception 'book_not_found'
      using errcode = 'P0002',
            detail = 'This book does not exist, or it belongs to another account.';
  end if;
end;
$$;

revoke execute on function public.outline_lock_book(uuid) from public, anon;
grant execute on function public.outline_lock_book(uuid) to authenticated;

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
               join public.section_versions v on v.section_id = s.id
              where c.book_id = p_book_id) then
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
  'E9.1: replace a book''s outline in one transaction (generate, stage outline_ideas). Needs a locked positioning and no writing. Clears the outline approval.';

revoke execute on function public.replace_outline(uuid, jsonb) from public, anon;
grant execute on function public.replace_outline(uuid, jsonb) to authenticated;

create or replace function public.add_chapter(p_book_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id   uuid;
  v_pos  int;
  v_end  uuid;
begin
  perform public.outline_lock_book(p_book_id);

  if not exists (select 1 from public.chapters c where c.book_id = p_book_id) then
    insert into public.chapters (book_id, position, kind) values (p_book_id, 0, 'intro') returning id into v_end;
    insert into public.sections (chapter_id, position) values (v_end, 1);
    insert into public.chapters (book_id, position, kind) values (p_book_id, 2, 'conclusion') returning id into v_end;
    insert into public.sections (chapter_id, position) values (v_end, 1);
    v_pos := 1;
  else
    select c.id, c.position into v_end, v_pos
      from public.chapters c where c.book_id = p_book_id and c.kind = 'conclusion';
    if v_end is null then
      select coalesce(max(c.position), 0) + 1 into v_pos from public.chapters c where c.book_id = p_book_id;
    else
      update public.chapters set position = position + 1 where id = v_end;
    end if;
  end if;

  insert into public.chapters (book_id, position, kind) values (p_book_id, v_pos, 'chapter') returning id into v_id;
  insert into public.sections (chapter_id, position) values (v_id, 1);
  return v_id;
end;
$$;

comment on function public.add_chapter(uuid) is
  'E9.1: add an untitled chapter with one section before the Conclusion (adds the Introduction and Conclusion on an empty book). Returns its id.';

revoke execute on function public.add_chapter(uuid) from public, anon;
grant execute on function public.add_chapter(uuid) to authenticated;

create or replace function public.reorder_chapters(p_book_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int := coalesce(cardinality(p_ids), 0);
begin
  perform public.outline_lock_book(p_book_id);

  if (select array_agg(c.id order by c.id) from public.chapters c
       where c.book_id = p_book_id and c.kind = 'chapter')
     is distinct from
     (select array_agg(x order by x) from (select distinct unnest(p_ids) x) d)
     or v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'outline_changed'
      using errcode = 'P0001',
            detail = 'The chapters changed. Reload the outline and try again.';
  end if;

  -- The position key is deferred, so the swaps are checked at commit.
  update public.chapters c
     set position = case c.kind when 'intro' then 0
                                when 'conclusion' then v_n + 1
                                else array_position(p_ids, c.id) end
   where c.book_id = p_book_id;
end;
$$;

comment on function public.reorder_chapters(uuid, uuid[]) is
  'E9.1: set the order of a book''s chapters. The Introduction stays first, the Conclusion last. Raises P0001 "outline_changed".';

revoke execute on function public.reorder_chapters(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_chapters(uuid, uuid[]) to authenticated;
