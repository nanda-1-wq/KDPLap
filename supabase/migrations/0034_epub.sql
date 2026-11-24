-- 0034_epub.sql
-- NicheInk · E13.3 · EPUB + Kindle preview, Part 2 (data only).
-- Plan: docs/reviews/2026-11-23-e13-3-plan.md (section 4; owner answers Nov 23).
-- No AI call reads or writes anything here; 08 Format never calls the AI.
--
-- 1. epub_key(book): the md5 of every input that changes the EPUB: style,
--    the parts intro, conclusion, about and also_by, contents_sections,
--    chapter_label, the valid Also by books (ids, titles, subtitles; part on),
--    title, subtitle, pen name, the bio md5 (About the author on), and the
--    sections (pdf_sections, the same list as format_key). Not in it, because
--    the EPUB never uses them: drop_cap, recto_start, running_header,
--    header_title, isbn, paper, trim, and the parts title, copyright and
--    contents (always on in the EPUB). Null without a format row.
-- 2. book_exports: format 'epub'. book_exports_pdf_fields_check is replaced by
--    book_exports_file_fields_check: a PDF row has page_count, settings_key
--    and engine (as before); an EPUB row has settings_key and engine, and no
--    page_count; DOCX and Markdown rows have none of the three (as before).
--    Every existing row passes (no EPUB row exists yet).
-- 3. book_exports_guard() is replaced. It is the 0027 function with two
--    blocks added (marked E13.3); every 0027 line, the PDF branch included,
--    is unchanged. For EPUB rows:
--      the book has a format row (P0001 "format_missing");
--      include is 'final' (P0001 "export_epub_final");
--      settings_key equals epub_key today (P0001 "export_stale");
--      versions equal pdf_version_ids today (P0001 "export_epub_versions");
--      parts are set from the format row (six keys), contents forced on;
--      the snapshot adds style.
--    The book row lock (one export at a time) and the newest 20 rows per
--    book and format apply to EPUB rows unchanged.
-- 4. epub_marks(book default null): the last EPUB export per book and
--    "changed" (the Books card and the 08 Export files panel). SECURITY
--    INVOKER. A new function, so pdf_marks keeps its shape.
-- 5. format_json(book): the same signature and every 0027 key; it adds
--    epub_key, last_epub (id, created_at, settings_key, engine) and
--    epub_changed. Additive: the live front end ignores them.
-- 6. Grants: execute on epub_key and epub_marks is revoked from public and
--    anon and granted to authenticated (as 0027). No user-callable function
--    takes a limit or a budget. No new table, so Row Level Security stays
--    the 0025 policies (select own, insert own book).
--
-- Checked before writing (read-only, 2026-11-24): last live migration
-- 20261123172100 (0033 stock_cleanup). book_exports_guard and format_json
-- were last created in 0027 (20261103210500 format_print); their bodies on a
-- local database at 0033 (pg_get_functiondef) equal the 0027 text.

-- ---------------------------------------------------------------------------
-- 1. epub_key(book): the EPUB's "changed since export" rule
-- ---------------------------------------------------------------------------
-- The format_key (0027) inputs that the EPUB uses, and no other. Inputs that
-- show only when a part is on count only then (Also by, About the author).
create or replace function public.epub_key(p_book_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(jsonb_build_object(
           'style', f.style,
           'parts', jsonb_build_object(
                      'intro', f.parts -> 'intro',
                      'conclusion', f.parts -> 'conclusion',
                      'about', f.parts -> 'about',
                      'also_by', f.parts -> 'also_by'),
           'contents_sections', f.contents_sections,
           'chapter_label', f.chapter_label,
           'also_by', case when (f.parts ->> 'also_by')::boolean then coalesce((
                        select jsonb_agg(jsonb_build_array(ob.id, ob.title, ob.subtitle) order by u.o)
                          from unnest(public.also_by_valid(b.id)) with ordinality u(x, o)
                          join public.books ob on ob.id = u.x), '[]'::jsonb) end,
           'title', b.title,
           'subtitle', b.subtitle,
           'pen_name', p.name,
           'bio_md5', case when (f.parts ->> 'about')::boolean then md5(coalesce(p.bio_text, '')) end,
           'sections', coalesce((
             select jsonb_agg(jsonb_build_array(x.chapter_id, x.chapter_kind, x.chapter_title,
                                                x.section_id, x.section_title, x.version_id) order by x.ord)
               from public.pdf_sections(b.id) x), '[]'::jsonb))::text)
    from public.books b
    join public.book_formats f on f.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
   where b.id = p_book_id
$$;

comment on function public.epub_key(uuid) is
  'E13.3: md5 of every input that changes the EPUB (plan section 4.1). Print-only settings (drop cap, right-hand start, running header, header title, ISBN, paper, trim) and the always-on parts are not in it. Null without a format row. The EPUB''s "changed since export" rule (epub_marks, the book_exports guard).';

-- ---------------------------------------------------------------------------
-- 2. book_exports: EPUB rows
-- ---------------------------------------------------------------------------
alter table public.book_exports drop constraint book_exports_format_check;
alter table public.book_exports add constraint book_exports_format_check check (format in ('docx', 'md', 'pdf', 'epub'));

alter table public.book_exports drop constraint book_exports_pdf_fields_check;
alter table public.book_exports add constraint book_exports_file_fields_check check (
  case when format = 'pdf' then page_count is not null and settings_key is not null and engine is not null
       when format = 'epub' then page_count is null and settings_key is not null and engine is not null
       else page_count is null and settings_key is null and engine is null end);

comment on column public.book_exports.settings_key is
  'E13.1 PDF, E13.3 EPUB: the key the file was built from (format_key for a PDF, epub_key for an EPUB). The guard refuses a key that is not today''s.';
comment on column public.book_exports.engine is
  'E13.1 PDF, E13.3 EPUB: the engine and template that built it, for example "typst 0.14.2 · t1" or "epub3 · e1".';

-- The 0027 guard, with the EPUB rules added (marked E13.3). Everything else,
-- the PDF branch included, is unchanged.
create or replace function public.book_exports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_book public.books%rowtype;
  v_fmt public.book_formats%rowtype;
  v_pen text;
  v_bio text;
  v_trim text;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  -- A book that does not exist: the foreign key (23503) refuses the row.
  -- Another user's book, for a signed-in caller: the insert policy (42501)
  -- refuses the row, as if the book did not exist. Nothing is read or locked.
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  -- a. The book's owner (the service role bypasses RLS, so it is checked here).
  if v_owner <> new.user_id then
    raise exception 'export_owner'
      using errcode = 'P0001',
            detail = 'An export belongs to the owner of its book.';
  end if;
  -- d. One export at a time per book (the book row is locked). A format edit
  -- touches the book row (0009 touch), so it waits too.
  select * into v_book from public.books b where b.id = new.book_id for update;
  -- b. Every version: a version of a section of this book, the same owner, no repeats.
  -- (A wrong shape is left to the table checks, which run after this trigger.)
  if new.versions is not null and cardinality(new.versions) > 0 and array_position(new.versions, null) is null
     and ((select count(distinct x) from unnest(new.versions) x) <> cardinality(new.versions)
          or (select count(*)
                from public.section_versions v
                join public.sections s on s.id = v.section_id
                join public.chapters c on c.id = s.chapter_id
               where v.id = any (new.versions)
                 and c.book_id = new.book_id
                 and v.user_id = new.user_id) <> cardinality(new.versions)) then
    raise exception 'export_version_not_in_book'
      using errcode = 'P0001',
            detail = 'Every exported version must belong to a section of this book.';
  end if;
  -- E13.1. A Print PDF: built from today's settings and today's Final sections.
  if new.format = 'pdf' then
    select * into v_fmt from public.book_formats f where f.book_id = new.book_id;
    if not found then
      raise exception 'format_missing'
        using errcode = 'P0001',
              detail = 'Open 08 Format before you export a Print PDF.';
    end if;
    if new.include is distinct from 'final' then
      raise exception 'export_pdf_final'
        using errcode = 'P0001',
              detail = 'A Print PDF has Final sections only.';
    end if;
    if new.settings_key is distinct from public.format_key(new.book_id) then
      raise exception 'export_stale'
        using errcode = 'P0001',
              detail = 'Your book changed while the PDF was made. Make it again.';
    end if;
    if new.versions is distinct from public.pdf_version_ids(new.book_id) then
      raise exception 'export_pdf_versions'
        using errcode = 'P0001',
              detail = 'A Print PDF has exactly the Final sections of the book, in order.';
    end if;
    -- The parts come from the format row, never from the browser.
    new.parts := v_fmt.parts - 'also_by';
  end if;
  -- E13.3. An EPUB: built from today's EPUB settings and today's Final sections.
  if new.format = 'epub' then
    select * into v_fmt from public.book_formats f where f.book_id = new.book_id;
    if not found then
      raise exception 'format_missing'
        using errcode = 'P0001',
              detail = 'Open 08 Format before you export an EPUB.';
    end if;
    if new.include is distinct from 'final' then
      raise exception 'export_epub_final'
        using errcode = 'P0001',
              detail = 'An EPUB has Final sections only.';
    end if;
    if new.settings_key is distinct from public.epub_key(new.book_id) then
      raise exception 'export_stale'
        using errcode = 'P0001',
              detail = 'Your book changed while the EPUB was made. Make it again.';
    end if;
    if new.versions is distinct from public.pdf_version_ids(new.book_id) then
      raise exception 'export_epub_versions'
        using errcode = 'P0001',
              detail = 'An EPUB has exactly the Final sections of the book, in order.';
    end if;
    -- The parts come from the format row, never from the browser. The
    -- contents is always on in an EPUB (KDP needs it).
    new.parts := (v_fmt.parts - 'also_by') || '{"contents": true}'::jsonb;
  end if;
  -- c. The snapshot, from the database.
  select p.name, p.bio_text into v_pen, v_bio from public.pen_names p where p.id = v_book.pen_name_id;
  select br.trim_size into v_trim from public.book_briefs br where br.book_id = new.book_id;
  new.snapshot := jsonb_build_object(
    'title', v_book.title,
    'subtitle', v_book.subtitle,
    'pen_name', v_pen,
    'trim', v_trim,
    'bio_md5', md5(coalesce(v_bio, '')),
    'include', new.include,
    'parts', new.parts)
    || case when new.format = 'pdf' then jsonb_build_object('style', v_fmt.style, 'paper', v_fmt.paper) else '{}'::jsonb end;
  -- E13.3. An EPUB's snapshot adds its style (paper is print only).
  if new.format = 'epub' then
    new.snapshot := new.snapshot || jsonb_build_object('style', v_fmt.style);
  end if;
  -- d. Keep the newest 19 older rows of this format, so the book has at most
  -- 20 per format with this one.
  delete from public.book_exports e
   where e.book_id = new.book_id
     and e.format = new.format
     and e.user_id = new.user_id
     and e.id not in (select e2.id from public.book_exports e2
                       where e2.book_id = new.book_id
                         and e2.format = new.format
                       order by e2.created_at desc, e2.id desc
                       limit 19);
  return new;
end;
$$;

comment on function public.book_exports_guard() is
  'Trigger (E11, E13.1, E13.3): book_exports.user_id is the book''s owner (P0001 "export_owner"); every version belongs to this book (P0001 "export_version_not_in_book"); a Print PDF needs a format row ("format_missing"), include final ("export_pdf_final"), today''s format_key ("export_stale") and today''s Final list ("export_pdf_versions"), and takes its parts from the format row; an EPUB needs a format row ("format_missing"), include final ("export_epub_final"), today''s epub_key ("export_stale") and today''s Final list ("export_epub_versions"), and takes its parts from the format row with contents on; sets the snapshot from the database; keeps the newest 20 exports per book and format.';

revoke execute on function public.book_exports_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. epub_marks(book): the Books card and the Export files panel
-- ---------------------------------------------------------------------------
-- The last EPUB export of each of the caller's books (or of one book), and
-- "changed": epub_key today differs from the key it was built from. Under
-- the caller's RLS.
create or replace function public.epub_marks(p_book_id uuid default null)
returns table (book_id uuid, exported_at timestamptz, changed boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with last as (
    select distinct on (e.book_id) e.book_id, e.created_at, e.settings_key
      from public.book_exports e
     where e.format = 'epub'
       and (p_book_id is null or e.book_id = p_book_id)
     order by e.book_id, e.created_at desc, e.id desc
  )
  select l.book_id, l.created_at, public.epub_key(l.book_id) is distinct from l.settings_key
    from last l
$$;

comment on function public.epub_marks(uuid) is
  'E13.3: per book (or one book), the last EPUB export time and whether the book changed since (epub_key). Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 5. format_json(book): what 08 reads besides export_json
-- ---------------------------------------------------------------------------
-- The 0027 function with the EPUB keys added (the CTEs last_epub and ek, and
-- three keys before "now"). SECURITY INVOKER. Null for a book that is not
-- the caller's. Every 0027 key is unchanged; added:
--   epub_key      epub_key today (null without a format row)
--   last_epub     the last EPUB export: id, created_at, settings_key,
--                 engine; or null
--   epub_changed  epub_key differs from last_epub.settings_key (null
--                 without an EPUB)
create or replace function public.format_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with last as (
    select e.id, e.created_at, e.page_count, e.settings_key, e.engine
      from public.book_exports e
     where e.book_id = p_book_id and e.format = 'pdf'
     order by e.created_at desc, e.id desc
     limit 1
  ), k as (
    select public.format_key(p_book_id) as key
  ), last_epub as (
    select e.id, e.created_at, e.settings_key, e.engine
      from public.book_exports e
     where e.book_id = p_book_id and e.format = 'epub'
     order by e.created_at desc, e.id desc
     limit 1
  ), ek as (
    select public.epub_key(p_book_id) as key
  )
  select jsonb_build_object(
    'book', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'subtitle', b.subtitle,
      'pen_name_id', b.pen_name_id,
      'pen_name', p.name,
      'trim', br.trim_size),
    'settings', (select to_jsonb(f) - 'user_id' from public.book_formats f where f.book_id = b.id),
    'also_by_valid', to_jsonb(public.also_by_valid(b.id)),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'subtitle', o.subtitle) order by o.created_at, o.id)
        from public.books o
       where b.pen_name_id is not null
         and o.pen_name_id = b.pen_name_id
         and o.user_id = b.user_id
         and o.id <> b.id), '[]'::jsonb),
    'key', (select k.key from k),
    'last_pdf', (select to_jsonb(l) from last l),
    'changed', (select (select k.key from k) is distinct from l.settings_key from last l),
    'epub_key', (select ek.key from ek),
    'last_epub', (select to_jsonb(l) from last_epub l),
    'epub_changed', (select (select ek.key from ek) is distinct from l.settings_key from last_epub l),
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.format_json(uuid) is
  'E13.1, E13.3: everything 08 Format reads besides export_json, under the caller''s RLS (null when the book is not the caller''s). See 0027 for the shape; 0034 adds epub_key, last_epub and epub_changed.';

-- ---------------------------------------------------------------------------
-- Grants. Supabase gives anon EXECUTE on new functions by default.
-- ---------------------------------------------------------------------------
revoke execute on function public.epub_key(uuid) from public, anon;
revoke execute on function public.epub_marks(uuid) from public, anon;
grant execute on function public.epub_key(uuid) to authenticated;
grant execute on function public.epub_marks(uuid) to authenticated;
