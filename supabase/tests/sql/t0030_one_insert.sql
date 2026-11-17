-- E16 Part 10: the export records its files in ONE insert (js/supabase.js recordCoverExports), as PostgREST
-- runs a bulk insert: one statement over the JSON array (json_to_recordset, the columns are the union of the
-- rows' keys, a key a row lacks is null). Proves against the real 0030 guard that the rows go in together or
-- not at all: a refused row (cover_stale, cover_size, a CHECK) leaves none of the others.
-- Run: supabase/tests/sql/run.sh t0030_one_insert.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''

insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name) values (:P1, :A, 'Nora Hale');
insert into public.books (id, user_id, pen_name_id, title) values (:BOOK1, :A, :P1, 'Chair Yoga for Seniors');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A);
do $$
declare c uuid; s uuid; v uuid; b uuid := 'b0000000-0000-4000-8000-000000000001'; u uuid := '00000000-0000-4000-8000-00000000000a';
begin
  insert into public.chapters (user_id, book_id, position, kind, title) values (u, b, 1, 'chapter', 'One') returning id into c;
  insert into public.sections (user_id, chapter_id, position, title, status) values (u, c, 1, 'Start', 'final') returning id into s;
  insert into public.section_versions (user_id, section_id, version_no, content, source) values (u, s, 1, 'Some text.', 'manual') returning id into v;
  update public.sections set current_version_id = v where id = s;
end $$;

create function pg_temp.is(name text, got text, want text) returns text language sql as $$
  select pg_temp.chk(name, got like want, got) $$;

-- The browser's rows (recordCoverExports) → the statement PostgREST runs for them.
create function pg_temp.bulk(rows jsonb) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.cover_exports (book_id, kind, settings_key, engine, width_in, height_in, spine_in, thumb, width_px, height_px)
    select book_id, kind, settings_key, engine, width_in, height_in, spine_in, thumb, width_px, height_px
      from json_to_recordset(%L::json) as x(book_id uuid, kind text, settings_key text, engine text, width_in numeric, height_in numeric,
                                            spine_in numeric, thumb text, width_px int, height_px int)$f$, rows::text));
end $$;
-- print, image, kindle as js/cover/export-dialog.js sends them (6 × 9, 54 pages, white: 12.3716 × 9.25, spine 0.1216, 3712 × 2775).
create function pg_temp.three(k text, kindle_key text default null, image_w int default 3712, kindle_w int default 1600) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('book_id', 'b0000000-0000-4000-8000-000000000001', 'kind', 'print', 'settings_key', k, 'engine', 'typst 0.14.2 · cover',
                       'width_in', 12.3716, 'height_in', 9.25, 'spine_in', 0.1216, 'thumb', 'data:image/jpeg;base64,/9j/4AAQ'),
    jsonb_build_object('book_id', 'b0000000-0000-4000-8000-000000000001', 'kind', 'image', 'settings_key', k, 'engine', 'browser canvas',
                       'width_px', image_w, 'height_px', 2775),
    jsonb_build_object('book_id', 'b0000000-0000-4000-8000-000000000001', 'kind', 'kindle', 'settings_key', coalesce(kindle_key, k), 'engine', 'browser canvas',
                       'width_px', kindle_w, 'height_px', 2560)) $$;
create function pg_temp.n() returns int language sql as $$ select count(*)::int from public.cover_exports $$;

:ASA
select pg_temp.is('a Print PDF of 54 pages', pg_temp.err(format($f$insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine)
    values (%L, %L, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
            public.pdf_version_ids(%L), 54, public.format_key(%L), 'typst 0.14.2 · t1')$f$, :A, :BOOK1, :BOOK1, :BOOK1)), 'OK 1');
select pg_temp.is('a design for today''s size', pg_temp.err(format('insert into public.cover_designs (book_id, fmt, layers, bg) values (%L, public.cover_fmt(%L), %L, %L)',
  :BOOK1, :BOOK1, '[{"id": 1, "type": "text", "text": "Chair Yoga"}]', '#FFFFFF')), 'OK 1');

-- One bad row refuses the statement: nothing of the three is kept.
select pg_temp.is('the Kindle row with an old key: cover_stale', pg_temp.bulk(pg_temp.three(public.cover_key(:BOOK1), '0123456789abcdef0123456789abcdef')), 'P0001 cover_stale%');
select pg_temp.chk('…and the print and image rows before it are not kept', pg_temp.n() = 0, pg_temp.n()::text);
select pg_temp.is('the image 1 px narrow: cover_size', pg_temp.bulk(pg_temp.three(public.cover_key(:BOOK1), null, 3711)), 'P0001 cover_size%');
select pg_temp.chk('…none kept', pg_temp.n() = 0, pg_temp.n()::text);
select pg_temp.is('the Kindle JPG 1599 px wide: the fields CHECK', pg_temp.bulk(pg_temp.three(public.cover_key(:BOOK1), null, 3712, 1599)), '23514%');
select pg_temp.chk('…none kept', pg_temp.n() = 0, pg_temp.n()::text);
select pg_temp.is('every row with an old key: cover_stale', pg_temp.bulk(pg_temp.three('0123456789abcdef0123456789abcdef')), 'P0001 cover_stale%');

-- The three rows as the browser sends them.
select pg_temp.is('print, image and kindle in one insert', pg_temp.bulk(pg_temp.three(public.cover_key(:BOOK1))), 'OK 3');
select pg_temp.chk('the guard set page count, the Print PDF id and the snapshot on print and image; none on kindle',
  (select bool_and(case when kind = 'kindle' then page_count is null and pdf_export_id is null
                        else page_count = 54 and pdf_export_id is not null end and snapshot ? 'rev') from public.cover_exports));
select pg_temp.chk('the null keys a row lacks pass the fields CHECK (thumb only on print)',
  (select count(*) = 1 from public.cover_exports where thumb is not null and kind = 'print'));
select pg_temp.chk('cover_marks: the three are today''s', (select print_changed = false and image_changed = false and kindle_changed = false from public.cover_marks(:BOOK1)));
select pg_temp.chk('cover_json last: the print row', (select (public.cover_json(:BOOK1) -> 'last' -> 'print' ->> 'settings_key') = public.cover_key(:BOOK1)));
select pg_temp.is('print alone (image and Kindle off)', pg_temp.bulk(jsonb_build_array(pg_temp.three(public.cover_key(:BOOK1)) -> 0)), 'OK 1');
-- 20 kept per book and kind, inside one statement too.
do $$ begin for i in 1..20 loop perform pg_temp.bulk(pg_temp.three(public.cover_key('b0000000-0000-4000-8000-000000000001'))); end loop; end $$;
select pg_temp.chk('20 kept per kind after 22 exports', (select bool_and(n = 20) from (select count(*) n from public.cover_exports group by kind) x)
  and (select count(distinct kind) = 3 from public.cover_exports), (select string_agg(kind || '=' || n, ' ') from (select kind, count(*) n from public.cover_exports group by kind) x));
