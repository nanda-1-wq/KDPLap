-- 0027_format_print.sql
-- NicheInk · E13.1 · 08 Format + Print PDF, Part 1 (data only).
-- Plan: docs/reviews/2026-11-03-e13-1-plan.md (owner changes, Nov 3).
-- No AI call reads or writes anything here; 08 Format never calls the AI.
--
-- 1. book_formats: the 08 settings, one row per book, owned by the writer.
--      style              'classic' (EB Garamond, the default), 'modern'
--                         (Source Sans 3 + Source Serif 4), 'clean' (Literata),
--                         'warm' (Lora).
--      parts              the book parts that are on: title, copyright,
--                         contents, intro, conclusion, about, also_by
--                         (all seven keys, booleans only).
--      contents_sections  the Contents lists sections too (off: chapters only).
--      chapter_label      'chapter' ("Chapter 2"), 'number' ("2") or 'none'.
--      drop_cap           print only, off by default.
--      recto_start        chapters start on a right-hand page (on).
--      running_header     on; header_title: null (the book title) or 1 to 80
--                         characters, no space at either end.
--      paper              'white' (default) or 'cream'. Not in the PDF key:
--                         the interior PDF is the same; 09 Cover reads it.
--      isbn               null or 13 digits, 978 or 979, a valid check digit.
--                         The browser removes hyphens and spaces first.
--      also_by            the writer's other books with the same pen name,
--                         in print order: at most 20, no repeats, no nulls.
--    Trim lives in the Brief (book_briefs.trim_size); 08 edits it there.
--    Margins are fixed in the template (0.75 in inside, 0.5 in outside).
--    Row Level Security: a user reads, adds and changes only their own rows,
--    on their own books. No delete (the row goes with its book).
--    A guard trigger (book_formats_guard), for every role:
--      a. book_id and user_id never change (P0001 "format_fixed");
--      b. user_id is the book's owner (P0001 "format_owner"; a book the
--         caller cannot see is left to the policy, 42501);
--      c. every book newly added to also_by is another book of the same user
--         with the same pen name, and this book has a pen name
--         (P0001 "also_by_not_allowed"). Books already in the list are not
--         checked again: a later pen name change drops them from the PDF
--         (also_by_valid), not from the row.
--    A format edit moves the book to the top of Books (touch, as 0009).
-- 2. pdf_sections(book), pdf_version_ids(book): what goes in the PDF. A
--    section is in when it is Final, its current version has text
--    (text_is_blank, 0019), and its chapter is a chapter, or an intro or
--    conclusion whose part is on. Order: chapter position, section position.
--    The same rule as export_badges (0025) with include "final".
-- 3. also_by_valid(book): the ticked books that are still valid today.
-- 4. format_key(book): the md5 of every input that changes the PDF (plan,
--    Q3). The only "changed since export" rule. Null without a format row.
-- 5. book_exports: format 'pdf', with page_count (even, 2 to 2,000),
--    settings_key (the format_key it was built from) and engine (for
--    example "typst 0.14.2 · t1"). A PDF row needs all three; DOCX and
--    Markdown rows have none. The guard (replaced) adds for PDF rows:
--      the book has a format row (P0001 "format_missing");
--      include is 'final' (P0001 "export_pdf_final");
--      settings_key equals format_key today (P0001 "export_stale");
--      versions equal pdf_version_ids today (P0001 "export_pdf_versions");
--      parts are set from the format row (six keys), the snapshot adds
--      style and paper.
-- 6. pdf_marks(book default null): the last PDF export per book, its page
--    count and "changed" (the stepper's 08 mark and the Books card).
-- 7. format_json(book): everything 08 reads besides export_json (0025).
--
-- Checked before writing (read-only, 2026-11-03): last migration
-- 20261028093000 (0026 book_complete_words), 22 public tables, no
-- book_formats table. New table, new nullable columns, a wider format
-- check: no existing row can fail them.

-- ---------------------------------------------------------------------------
-- 1. book_formats
-- ---------------------------------------------------------------------------

-- parts: exactly the seven keys, each a boolean.
create or replace function public.format_parts_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and" (as 0025): jsonb_object_keys raises an error on a non-object.
  select case
    when jsonb_typeof(p) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(p) k)
         is distinct from array['about', 'also_by', 'conclusion', 'contents', 'copyright', 'intro', 'title'] then false
    else not exists (select 1 from jsonb_each(p) e(k, v) where jsonb_typeof(v) <> 'boolean')
  end
$$;

comment on function public.format_parts_ok(jsonb) is
  'E13.1: book_formats.parts has exactly title, copyright, contents, intro, conclusion, about and also_by, each a boolean.';

-- ISBN-13: 978 or 979, 13 digits, the check digit (weights 1, 3, 1, 3, …).
create or replace function public.isbn_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or p !~ '^97[89][0-9]{10}$' then false
    else (select sum(substr(p, i, 1)::int * case when i % 2 = 1 then 1 else 3 end)
            from generate_series(1, 13) i) % 10 = 0
  end
$$;

comment on function public.isbn_ok(text) is
  'E13.1: a valid ISBN-13 (978 or 979, 13 digits, no hyphens or spaces, a valid check digit).';

-- also_by: at most 20, no nulls, no repeats.
create or replace function public.also_by_shape_ok(p uuid[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then false
    when cardinality(p) > 20 or array_position(p, null) is not null then false
    else (select count(distinct x) from unnest(p) x) = cardinality(p)
  end
$$;

comment on function public.also_by_shape_ok(uuid[]) is
  'E13.1: book_formats.also_by has at most 20 ids, no nulls and no repeats.';

create table public.book_formats (
  book_id            uuid primary key references public.books (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  style              text not null default 'classic',
  parts              jsonb not null default '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false, "also_by": false}',
  contents_sections  boolean not null default false,
  chapter_label      text not null default 'chapter',
  drop_cap           boolean not null default false,
  recto_start        boolean not null default true,
  running_header     boolean not null default true,
  header_title       text,
  paper              text not null default 'white',
  isbn               text,
  also_by            uuid[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint book_formats_style_check check (style in ('classic', 'modern', 'clean', 'warm')),
  constraint book_formats_parts_check check (public.format_parts_ok(parts)),
  constraint book_formats_chapter_label_check check (chapter_label in ('chapter', 'number', 'none')),
  constraint book_formats_header_title_check check (header_title is null or (char_length(header_title) between 1 and 80 and header_title = btrim(header_title))),
  constraint book_formats_paper_check check (paper in ('white', 'cream')),
  constraint book_formats_isbn_check check (isbn is null or public.isbn_ok(isbn)),
  constraint book_formats_also_by_check check (public.also_by_shape_ok(also_by))
);

create index book_formats_user_id_idx on public.book_formats (user_id);

comment on table public.book_formats is
  'E13.1: the 08 Format settings, one row per book (plan docs/reviews/2026-11-03-e13-1-plan.md). Trim lives in book_briefs. The PDF key is format_key().';
comment on column public.book_formats.paper is
  'White or cream. Not in format_key: the interior PDF does not change. 09 Cover reads it for the spine.';
comment on column public.book_formats.also_by is
  'The writer''s other books with the same pen name, in print order. also_by_valid() drops any that no longer match.';

create trigger book_formats_set_updated_at
  before update on public.book_formats
  for each row execute function public.set_updated_at();

alter table public.book_formats enable row level security;

create policy "book_formats_select_own" on public.book_formats
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_formats_insert_own" on public.book_formats
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "book_formats_update_own" on public.book_formats
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

-- The row goes with its book (cascade), never by hand.
revoke delete, truncate on public.book_formats from anon, authenticated;

-- SECURITY INVOKER: the also_by check reads books under the caller's RLS, so
-- another user's book is never found. The service role bypasses RLS, so the
-- owner and the user of every listed book are checked here too.
create or replace function public.book_formats_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_pen uuid;
  v_added uuid[];
begin
  -- a. The row stays with its book and owner.
  if tg_op = 'UPDATE' and (new.book_id is distinct from old.book_id or new.user_id is distinct from old.user_id) then
    raise exception 'format_fixed'
      using errcode = 'P0001',
            detail = 'A format row stays with its book and its owner.';
  end if;
  select b.user_id, b.pen_name_id into v_owner, v_pen from public.books b where b.id = new.book_id;
  -- A book that does not exist: the foreign key (23503). Another user's
  -- book, for a signed-in caller: the policy (42501), as if it did not exist.
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  -- b. The book's owner.
  if v_owner <> new.user_id then
    raise exception 'format_owner'
      using errcode = 'P0001',
            detail = 'A format row belongs to the owner of its book.';
  end if;
  -- c. Books newly added to Also by. (A wrong shape is left to the table check.)
  if new.also_by is not null then
    if tg_op = 'INSERT' then
      v_added := array(select distinct x from unnest(new.also_by) x where x is not null);
    else
      v_added := array(select distinct x from unnest(new.also_by) x
                        where x is not null and not (x = any (coalesce(old.also_by, '{}'::uuid[]))));
    end if;
    if cardinality(v_added) > 0
       and (v_pen is null
            or (select count(*) from public.books o
                 where o.id = any (v_added)
                   and o.user_id = new.user_id
                   and o.id <> new.book_id
                   and o.pen_name_id = v_pen) <> cardinality(v_added)) then
      raise exception 'also_by_not_allowed'
        using errcode = 'P0001',
              detail = 'Also by lists only your other books with the same pen name.';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.book_formats_guard() is
  'Trigger (E13.1): book_id and user_id never change (P0001 "format_fixed"); user_id is the book''s owner (P0001 "format_owner"); every book added to also_by is another book of the same user with the same pen name (P0001 "also_by_not_allowed").';

create trigger book_formats_guard
  before insert or update on public.book_formats
  for each row execute function public.book_formats_guard();

revoke execute on function public.book_formats_guard() from public, anon, authenticated;

-- A format edit moves the book to the top of Books (0009). Not on insert:
-- the row is made when 08 first opens, which is not an edit.
create trigger book_formats_touch_book
  after update on public.book_formats
  for each row execute function public.touch_book_from_child();

-- ---------------------------------------------------------------------------
-- 2. What goes in the PDF
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: under the caller's RLS. No rows without a format row
-- (the parts live there).
create or replace function public.pdf_sections(p_book_id uuid)
returns table (ord bigint, chapter_id uuid, chapter_kind text, chapter_title text,
               section_id uuid, section_title text, version_id uuid)
language sql
stable
set search_path = ''
as $$
  select row_number() over (order by c.position, s.position),
         c.id, c.kind, c.title, s.id, s.title, v.id
    from public.book_formats f
    join public.chapters c on c.book_id = f.book_id
    join public.sections s on s.chapter_id = c.id
    join public.section_versions v on v.id = s.current_version_id
   where f.book_id = p_book_id
     and s.status = 'final'
     and not public.text_is_blank(v.content)
     and (c.kind = 'chapter'
          or (c.kind = 'intro' and (f.parts ->> 'intro')::boolean)
          or (c.kind = 'conclusion' and (f.parts ->> 'conclusion')::boolean))
   order by c.position, s.position
$$;

comment on function public.pdf_sections(uuid) is
  'E13.1: the sections in the Print PDF, in order: Final, text not blank, a chapter or an intro or conclusion whose part is on. Under the caller''s RLS.';

create or replace function public.pdf_version_ids(p_book_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(x.version_id order by x.ord), '{}'::uuid[]) from public.pdf_sections(p_book_id) x
$$;

comment on function public.pdf_version_ids(uuid) is
  'E13.1: the current version ids of the sections in the Print PDF, in book order (pdf_sections).';

-- ---------------------------------------------------------------------------
-- 3. also_by_valid(book)
-- ---------------------------------------------------------------------------
create or replace function public.also_by_valid(p_book_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(u.x order by u.o), '{}'::uuid[])
    from public.book_formats f
    join public.books b on b.id = f.book_id
    cross join lateral unnest(f.also_by) with ordinality u(x, o)
    join public.books ob on ob.id = u.x
   where f.book_id = p_book_id
     and b.pen_name_id is not null
     and ob.pen_name_id = b.pen_name_id
     and ob.user_id = b.user_id
     and ob.id <> b.id
$$;

comment on function public.also_by_valid(uuid) is
  'E13.1: the Also by books that are still valid today (same user, same pen name, not the book itself), in print order. Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 4. format_key(book): the "changed since export" rule
-- ---------------------------------------------------------------------------
-- Every input that changes the PDF. Not in it: paper, the copyright year,
-- the template version (owner, Q5 and Q7). Inputs that print only when a part
-- or option is on count only then (Also by, About the author, header title).
create or replace function public.format_key(p_book_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(jsonb_build_object(
           'style', f.style,
           'parts', f.parts,
           'contents_sections', f.contents_sections,
           'chapter_label', f.chapter_label,
           'drop_cap', f.drop_cap,
           'recto_start', f.recto_start,
           'running_header', f.running_header,
           'header_title', case when f.running_header then f.header_title end,
           'isbn', f.isbn,
           'also_by', case when (f.parts ->> 'also_by')::boolean then coalesce((
                        select jsonb_agg(jsonb_build_array(ob.id, ob.title, ob.subtitle) order by u.o)
                          from unnest(public.also_by_valid(b.id)) with ordinality u(x, o)
                          join public.books ob on ob.id = u.x), '[]'::jsonb) end,
           'title', b.title,
           'subtitle', b.subtitle,
           'pen_name', p.name,
           'trim', br.trim_size,
           'bio_md5', case when (f.parts ->> 'about')::boolean then md5(coalesce(p.bio_text, '')) end,
           'sections', coalesce((
             select jsonb_agg(jsonb_build_array(x.chapter_id, x.chapter_kind, x.chapter_title,
                                                x.section_id, x.section_title, x.version_id) order by x.ord)
               from public.pdf_sections(b.id) x), '[]'::jsonb))::text)
    from public.books b
    join public.book_formats f on f.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
   where b.id = p_book_id
$$;

comment on function public.format_key(uuid) is
  'E13.1: md5 of every input that changes the Print PDF (plan Q3). Null without a format row. The only "changed since export" rule (pdf_marks, the book_exports guard).';

-- ---------------------------------------------------------------------------
-- 5. book_exports: Print PDF rows
-- ---------------------------------------------------------------------------
alter table public.book_exports drop constraint book_exports_format_check;
alter table public.book_exports add constraint book_exports_format_check check (format in ('docx', 'md', 'pdf'));

alter table public.book_exports add column page_count int;
alter table public.book_exports add column settings_key text;
alter table public.book_exports add column engine text;

alter table public.book_exports add constraint book_exports_pdf_fields_check check (
  case when format = 'pdf' then page_count is not null and settings_key is not null and engine is not null
       else page_count is null and settings_key is null and engine is null end);
alter table public.book_exports add constraint book_exports_page_count_check check (
  page_count is null or (page_count between 2 and 2000 and page_count % 2 = 0));
alter table public.book_exports add constraint book_exports_settings_key_check check (
  settings_key is null or settings_key ~ '^[0-9a-f]{32}$');
alter table public.book_exports add constraint book_exports_engine_check check (
  engine is null or (char_length(engine) between 1 and 40 and engine = btrim(engine)));

comment on column public.book_exports.page_count is
  'E13.1, PDF only: the page count from the engine, even (one blank page pads an odd count).';
comment on column public.book_exports.settings_key is
  'E13.1, PDF only: the format_key the PDF was built from. The guard refuses a key that is not today''s.';
comment on column public.book_exports.engine is
  'E13.1, PDF only: the engine and template that built it, for example "typst 0.14.2 · t1".';

-- The 0025 guard, with the PDF rules added (marked E13.1). Everything else is unchanged.
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
  'Trigger (E11, E13.1): book_exports.user_id is the book''s owner (P0001 "export_owner"); every version belongs to this book (P0001 "export_version_not_in_book"); a Print PDF needs a format row ("format_missing"), include final ("export_pdf_final"), today''s format_key ("export_stale") and today''s Final list ("export_pdf_versions"), and takes its parts from the format row; sets the snapshot from the database; keeps the newest 20 exports per book and format.';

revoke execute on function public.book_exports_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. pdf_marks(book): the stepper's 08 mark and the Books card
-- ---------------------------------------------------------------------------
-- The last PDF export of each of the caller's books (or of one book), its
-- page count, and "changed": format_key today differs from the key it was
-- built from. Under the caller's RLS.
create or replace function public.pdf_marks(p_book_id uuid default null)
returns table (book_id uuid, exported_at timestamptz, page_count int, changed boolean)
language sql
stable
set search_path = ''
as $$
  with last as (
    select distinct on (e.book_id) e.book_id, e.created_at, e.page_count, e.settings_key
      from public.book_exports e
     where e.format = 'pdf'
       and (p_book_id is null or e.book_id = p_book_id)
     order by e.book_id, e.created_at desc, e.id desc
  )
  select l.book_id, l.created_at, l.page_count, public.format_key(l.book_id) is distinct from l.settings_key
    from last l
$$;

comment on function public.pdf_marks(uuid) is
  'E13.1: per book (or one book), the last Print PDF export time, its page count and whether the book changed since (format_key). Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 7. format_json(book): what 08 reads besides export_json
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER. Null for a book that is not the caller's.
--   book        id, title, subtitle, pen_name_id, pen_name, trim
--   settings    the format row (without user_id), or null before 08 made it
--   also_by_valid  the ticked books still valid (ids, in print order)
--   candidates  the caller's other books with the same pen name:
--               id, title, subtitle (none when the book has no pen name)
--   key         format_key today (null without a format row)
--   last_pdf    the last PDF export: id, created_at, page_count,
--               settings_key, engine; or null
--   changed     key differs from last_pdf.settings_key (null without a PDF)
--   now         the server time
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
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.format_json(uuid) is
  'E13.1: everything 08 Format reads besides export_json, under the caller''s RLS (null when the book is not the caller''s). See 0027 for the shape.';

-- ---------------------------------------------------------------------------
-- Grants. Supabase gives anon EXECUTE on new functions by default.
-- ---------------------------------------------------------------------------
revoke execute on function public.pdf_sections(uuid) from public, anon;
revoke execute on function public.pdf_version_ids(uuid) from public, anon;
revoke execute on function public.also_by_valid(uuid) from public, anon;
revoke execute on function public.format_key(uuid) from public, anon;
revoke execute on function public.pdf_marks(uuid) from public, anon;
revoke execute on function public.format_json(uuid) from public, anon;
grant execute on function public.pdf_sections(uuid) to authenticated;
grant execute on function public.pdf_version_ids(uuid) to authenticated;
grant execute on function public.also_by_valid(uuid) to authenticated;
grant execute on function public.format_key(uuid) to authenticated;
grant execute on function public.pdf_marks(uuid) to authenticated;
grant execute on function public.format_json(uuid) to authenticated;
