-- 0034 EPUB (E13.3 Part 2): the book_exports shapes (format 'epub',
-- book_exports_file_fields_check), the guard's EPUB branch (format_missing,
-- export_epub_final, export_stale, export_epub_versions, parts from the
-- format row with contents on, the snapshot with style), epub_key (each EPUB
-- input changes it, each print-only input does not), epub_marks, the
-- format_json keys, 20 rows per format, the other readers (export_badges,
-- pdf_marks, cover_pdf) unchanged, user B, and the grants.
-- Run: supabase/tests/sql/run.sh t0034.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set P2 '''e0000000-0000-4000-8000-000000000002'''
\set PB '''e0000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK5 '''b0000000-0000-4000-8000-000000000005'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''
\set CI '''c0000000-0000-4000-8000-000000000001'''
\set C1 '''c0000000-0000-4000-8000-000000000002'''
\set C2 '''c0000000-0000-4000-8000-000000000003'''
\set CC '''c0000000-0000-4000-8000-000000000004'''
\set CX '''c0000000-0000-4000-8000-000000000005'''
\set SI '''d0000000-0000-4000-8000-000000000001'''
\set S11 '''d0000000-0000-4000-8000-000000000002'''
\set S12 '''d0000000-0000-4000-8000-000000000003'''
\set S21 '''d0000000-0000-4000-8000-000000000004'''
\set SC '''d0000000-0000-4000-8000-000000000006'''
\set SX '''d0000000-0000-4000-8000-000000000007'''
\set VI '''f0000000-0000-4000-8000-000000000001'''
\set V11 '''f0000000-0000-4000-8000-000000000002'''
\set V12 '''f0000000-0000-4000-8000-000000000003'''
\set V21 '''f0000000-0000-4000-8000-000000000004'''
\set VC '''f0000000-0000-4000-8000-000000000006'''
\set VX '''f0000000-0000-4000-8000-000000000007'''
\set PARTS6 '''{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}'''

-- The insert statements, as text for pg_temp.expect (run under the caller's role).
-- k and vers are SQL expressions; the defaults are today's key and Final list.
create function pg_temp.epub_sql(b uuid, inc text default 'final', vers text default null, k text default null,
                                 eng text default 'epub3 · e1', pc int default null, at text default null, parts text default null)
returns text language sql as $$
  select format($f$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine, created_at) values (%L, 'epub', %L, %L, %s, %L, %s, %L, coalesce(%L::timestamptz, now()))$f$,
    b, inc, coalesce(parts, '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}'),
    coalesce(vers, format('public.pdf_version_ids(%L)', b)), pc, coalesce(k, format('public.epub_key(%L)', b)), eng, at) $$;
create function pg_temp.pdf_sql(b uuid, pc int, at text)
returns text language sql as $$
  select format($f$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine, created_at) values (%L, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', public.pdf_version_ids(%L), %s, public.format_key(%L), 'typst 0.14.2 · t1', %L::timestamptz)$f$,
    b, b, pc, b, at) $$;
grant execute on all functions in schema pg_temp to public;

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B);
insert into public.pen_names (id, user_id, name, bio_text) values
  (:P1, :A, 'Nora Hale', 'Bio one.'), (:P2, :A, 'Other Pen', null), (:PB, :B, 'Pen B', null);
insert into public.books (id, user_id, pen_name_id, title, subtitle, created_at) values
  (:BOOK1, :A, :P1, 'Chair Yoga for Seniors', 'Gentle moves', '2026-10-01 10:00+00'),
  (:BOOK2, :A, :P1, 'Second Book', 'Part two', '2026-10-02 10:00+00'),
  (:BOOK3, :A, :P1, 'Third Book', null, '2026-10-03 10:00+00'),
  (:BOOK5, :A, null, 'No Pen Book', null, '2026-10-05 10:00+00'),
  (:BOOKB, :B, :PB, 'B Book', null, '2026-10-06 10:00+00');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
insert into public.chapters (id, user_id, book_id, position, kind, title) values
  (:CI, :A, :BOOK1, 1, 'intro', 'Introduction'),
  (:C1, :A, :BOOK1, 2, 'chapter', 'Getting started'),
  (:C2, :A, :BOOK1, 3, 'chapter', 'Seated twists'),
  (:CC, :A, :BOOK1, 4, 'conclusion', 'Conclusion'),
  (:CX, :A, :BOOK2, 1, 'chapter', 'Other book chapter');
insert into public.sections (id, user_id, chapter_id, position, title, status) values
  (:SI, :A, :CI, 1, 'Why chair yoga', 'final'),
  (:S11, :A, :C1, 1, 'The chair', 'final'),
  (:S12, :A, :C1, 2, 'Breathing', 'draft'),
  (:S21, :A, :C2, 1, 'Twist two', 'final'),
  (:SC, :A, :CC, 1, 'The end', 'final'),
  (:SX, :A, :CX, 1, 'Other', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  (:VI, :A, :SI, 1, 'Intro text.', 'manual'),
  (:V11, :A, :S11, 1, 'Chair text.', 'manual'),
  (:V12, :A, :S12, 1, 'Breathing text.', 'manual'),
  (:V21, :A, :S21, 1, 'Twist text.', 'manual'),
  (:VC, :A, :SC, 1, 'The end text.', 'manual'),
  (:VX, :A, :SX, 1, 'Other book text.', 'manual');
update public.sections set current_version_id = :VI where id = :SI;
update public.sections set current_version_id = :V11 where id = :S11;
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set current_version_id = :V21 where id = :S21;
update public.sections set current_version_id = :VC where id = :SC;
update public.sections set current_version_id = :VX where id = :SX;

-- ── 1. Shapes ──
select pg_temp.chk('format check: docx, md, pdf, epub',
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'book_exports_format_check')
    = $c$CHECK ((format = ANY (ARRAY['docx'::text, 'md'::text, 'pdf'::text, 'epub'::text])))$c$,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'book_exports_format_check'));
select pg_temp.chk('book_exports_pdf_fields_check is gone', not exists (select 1 from pg_constraint where conname = 'book_exports_pdf_fields_check'));
select pg_temp.chk('book_exports_file_fields_check: pdf, epub, else',
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'book_exports_file_fields_check' and conrelid = 'public.book_exports'::regclass)
    like '%WHEN (format = ''pdf''::text) THEN ((page_count IS NOT NULL) AND (settings_key IS NOT NULL) AND (engine IS NOT NULL))%WHEN (format = ''epub''::text) THEN ((page_count IS NULL) AND (settings_key IS NOT NULL) AND (engine IS NOT NULL))%ELSE ((page_count IS NULL) AND (settings_key IS NULL) AND (engine IS NULL))%',
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'book_exports_file_fields_check'));
select pg_temp.chk('the other book_exports checks are unchanged (page count, key, engine, include, parts, versions)',
  (select array_agg(conname::text order by conname) from pg_constraint where conrelid = 'public.book_exports'::regclass and contype = 'c')
    = array['book_exports_engine_check', 'book_exports_file_fields_check', 'book_exports_format_check', 'book_exports_include_check',
            'book_exports_page_count_check', 'book_exports_parts_check', 'book_exports_settings_key_check', 'book_exports_versions_check'],
  (select array_agg(conname::text order by conname) from pg_constraint where conrelid = 'public.book_exports'::regclass and contype = 'c')::text);
select pg_temp.chk('one trigger on book_exports: the guard, before insert',
  (select array_agg(tgname::text) from pg_trigger where tgrelid = 'public.book_exports'::regclass and not tgisinternal) = array['book_exports_guard']
  and (select tgtype from pg_trigger where tgname = 'book_exports_guard' and tgrelid = 'public.book_exports'::regclass) = 7);

-- ── 2. Before the format row ──
:ASA
select pg_temp.expect('epub_key: null before the format row', format($q$select 1 where public.epub_key(%L) is null$q$, :BOOK1), 'OK 1');
select pg_temp.expect('format_json: epub_key, last_epub and epub_changed null before the row',
  format($q$select 1 where public.format_json(%L) -> 'epub_key' = 'null'::jsonb and public.format_json(%L) -> 'last_epub' = 'null'::jsonb and public.format_json(%L) -> 'epub_changed' = 'null'::jsonb$q$, :BOOK1, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.expect('EPUB: no format row refused (format_missing)', pg_temp.epub_sql(:BOOK1, k => quote_literal(md5('x'))),
  'P0001 format_missing | Open 08 Format before you export an EPUB.');
select pg_temp.expect('A makes the format row', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK1), 'OK 1');
select pg_temp.chk('epub_key: 32 hex characters', public.epub_key(:BOOK1) ~ '^[0-9a-f]{32}$', public.epub_key(:BOOK1));
select pg_temp.chk('epub_key: the same twice', public.epub_key(:BOOK1) = public.epub_key(:BOOK1));
select pg_temp.chk('epub_key is not format_key', public.epub_key(:BOOK1) <> public.format_key(:BOOK1));
select pg_temp.expect('epub_key: a book without a format row is null', format($q$select 1 where public.epub_key(%L) is null$q$, :BOOK2), 'OK 1');
select pg_temp.expect('epub_key: a book that does not exist is null', $q$select 1 where public.epub_key('b0000000-0000-4000-8000-0000000000ff') is null$q$, 'OK 1');

-- The format row: contents off (the EPUB turns it on), about on.
update public.book_formats set parts = parts || '{"contents": false, "about": true}' where book_id = :BOOK1;
-- A DOCX and a Print PDF first, so the other readers have rows to compare.
select pg_temp.expect('A records a DOCX export', format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'docx', 'all', %L, array[%L, %L]::uuid[], '2030-01-01 00:00+00')$q$, :BOOK1, :PARTS6, :V11, :V12), 'OK 1');
select pg_temp.expect('A records a Print PDF (36 pages)', pg_temp.pdf_sql(:BOOK1, 36, '2030-01-02 00:00+00'), 'OK 1');
select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') as pm from public.pdf_marks() m \gset
select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') as eb from public.export_badges() m \gset
select coalesce(jsonb_agg(to_jsonb(m)), '[]') as cp from public.cover_pdf(:BOOK1) m \gset
select public.format_json(:BOOK1) - array['epub_key', 'last_epub', 'epub_changed', 'now'] as fj \gset

-- ── 3. The guard: EPUB errors ──
select pg_temp.expect('EPUB: include all refused (export_epub_final)', pg_temp.epub_sql(:BOOK1, inc => 'all'), 'P0001 export_epub_final | An EPUB has Final sections only.');
select pg_temp.expect('EPUB: a stale key refused (export_stale)', pg_temp.epub_sql(:BOOK1, k => quote_literal(md5('old'))),
  'P0001 export_stale | Your book changed while the EPUB was made. Make it again.');
select pg_temp.expect('EPUB: the Print PDF key is refused (export_stale)', pg_temp.epub_sql(:BOOK1, k => format('public.format_key(%L)', :BOOK1)), 'P0001 export_stale%');
select pg_temp.expect('EPUB: no key refused (export_stale, before the table check)', pg_temp.epub_sql(:BOOK1, k => 'null'), 'P0001 export_stale%');
select pg_temp.expect('EPUB: versions not the Final list refused (export_epub_versions)', pg_temp.epub_sql(:BOOK1, vers => format('array[%L]::uuid[]', :V11)),
  'P0001 export_epub_versions | An EPUB has exactly the Final sections of the book, in order.');
select pg_temp.expect('EPUB: the Final list in another order refused', pg_temp.epub_sql(:BOOK1, vers => format('array[%L, %L, %L, %L]::uuid[]', :V11, :VI, :V21, :VC)), 'P0001 export_epub_versions%');
select pg_temp.expect('EPUB: a Draft version added refused', pg_temp.epub_sql(:BOOK1, vers => format('public.pdf_version_ids(%L) || %L::uuid', :BOOK1, :V12)), 'P0001 export_epub_versions%');
select pg_temp.expect('EPUB: a version of another book refused (export_version_not_in_book)', pg_temp.epub_sql(:BOOK1, vers => format('array[%L]::uuid[]', :VX)), 'P0001 export_version_not_in_book%');
select pg_temp.expect('EPUB: a page count refused (file fields)', pg_temp.epub_sql(:BOOK1, pc => 36), '23514%book_exports_file_fields_check%');
select pg_temp.expect('EPUB: no engine refused (file fields)', pg_temp.epub_sql(:BOOK1, eng => null), '23514%book_exports_file_fields_check%');
select pg_temp.expect('EPUB: an engine of 41 characters refused', pg_temp.epub_sql(:BOOK1, eng => repeat('e', 41)), '23514%book_exports_engine_check%');
select pg_temp.expect('a format outside the list refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'mobi', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :PARTS6, :V11), '23514%book_exports_format_check%');
select pg_temp.expect('DOCX: a settings key refused (file fields)', format($q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key) values (%L, 'docx', 'all', %L, array[%L]::uuid[], public.epub_key(%L))$q$, :BOOK1, :PARTS6, :V11, :BOOK1), '23514%book_exports_file_fields_check%');
select pg_temp.expect('Markdown: an engine refused (file fields)', format($q$insert into public.book_exports (book_id, format, include, parts, versions, engine) values (%L, 'md', 'all', %L, array[%L]::uuid[], 'epub3 · e1')$q$, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('PDF: no page count still refused (file fields)', format($q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), public.format_key(%L), 'typst 0.14.2 · t1')$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1), '23514%book_exports_file_fields_check%');
select pg_temp.expect('PDF: the EPUB key still refused for a PDF', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 36, public.epub_key(%L), 'typst 0.14.2 · t1')$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1), 'P0001 export_stale | Your book changed while the PDF was made. Make it again.');
:OWNER
select pg_temp.expect('EPUB: a row for another user than the book''s owner refused (export_owner)',
  format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, settings_key, engine) values (%L, %L, 'epub', 'final', %L, public.pdf_version_ids(%L), public.epub_key(%L), 'epub3 · e1')$q$, :B, :BOOK1, :PARTS6, :BOOK1, :BOOK1),
  'P0001 export_owner%');
select pg_temp.chk('no EPUB row was saved by the refused inserts', not exists (select 1 from public.book_exports where format = 'epub'));

-- ── 4. A good EPUB row: parts and snapshot from the database ──
:ASA
select pg_temp.expect('EPUB: a good row passes (parts sent wrong on purpose)',
  pg_temp.epub_sql(:BOOK1, at => '2030-01-03 00:00+00', parts => '{"title": false, "copyright": false, "contents": false, "intro": false, "conclusion": false, "about": false}'), 'OK 1');
select pg_temp.chk('EPUB parts: the format row''s parts without also_by, contents forced on',
  (select e.parts = (f.parts - 'also_by') || '{"contents": true}' and (f.parts ->> 'contents')::boolean = false
     from public.book_exports e join public.book_formats f on f.book_id = e.book_id where e.format = 'epub'),
  (select parts::text from public.book_exports where format = 'epub'));
select pg_temp.chk('EPUB parts: exactly the six export keys',
  (select array_agg(k order by k) from public.book_exports e, jsonb_object_keys(e.parts) k where e.format = 'epub') = array['about', 'conclusion', 'contents', 'copyright', 'intro', 'title']);
select pg_temp.chk('EPUB snapshot: title, subtitle, pen name, trim, bio md5, include, parts, style (no paper)',
  (select array_agg(k order by k) from public.book_exports e, jsonb_object_keys(e.snapshot) k where e.format = 'epub')
    = array['bio_md5', 'include', 'parts', 'pen_name', 'style', 'subtitle', 'title', 'trim'],
  (select snapshot::text from public.book_exports where format = 'epub'));
select pg_temp.chk('EPUB snapshot values from the database',
  (select e.snapshot ->> 'style' = f.style and e.snapshot ->> 'title' = 'Chair Yoga for Seniors' and e.snapshot ->> 'pen_name' = 'Nora Hale'
          and e.snapshot ->> 'trim' = '6x9' and e.snapshot ->> 'bio_md5' = md5('Bio one.') and e.snapshot ->> 'include' = 'final'
          and e.snapshot -> 'parts' = e.parts
     from public.book_exports e join public.book_formats f on f.book_id = e.book_id where e.format = 'epub'));
select pg_temp.chk('EPUB row: key is today''s epub_key, no page count, the engine as sent',
  (select settings_key = public.epub_key(:BOOK1) and page_count is null and engine = 'epub3 · e1' and user_id = :A and versions = array[:VI, :V11, :V21, :VC]::uuid[]
     from public.book_exports where format = 'epub'));

-- ── 5. The other readers are unchanged by an EPUB row ──
select pg_temp.chk('pdf_marks(): the same rows as before the EPUB', (select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') from public.pdf_marks() m)::text = :'pm',
  (select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') from public.pdf_marks() m)::text);
select pg_temp.chk('export_badges(): the same rows as before the EPUB (DOCX only)', (select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') from public.export_badges() m)::text = :'eb',
  (select coalesce(jsonb_agg(to_jsonb(m) order by m.book_id), '[]') from public.export_badges() m)::text);
select pg_temp.chk('cover_pdf(book): the same row as before the EPUB', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.cover_pdf(:BOOK1) m)::text = :'cp',
  (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.cover_pdf(:BOOK1) m)::text);
select pg_temp.chk('cover_pdf: still the 36-page PDF, an EPUB is never a Print PDF', (select page_count = 36 from public.cover_pdf(:BOOK1)));
select pg_temp.chk('format_json: every 0027 key holds the same value as before the EPUB',
  (public.format_json(:BOOK1) - array['epub_key', 'last_epub', 'epub_changed', 'now']) = :'fj'::jsonb);
-- A Print PDF after the EPUB still follows the 0027 rules: its parts as the row (contents off), paper in the snapshot.
select pg_temp.expect('A records a Print PDF after the EPUB (40 pages)', pg_temp.pdf_sql(:BOOK1, 40, '2030-01-04 00:00+00'), 'OK 1');
select pg_temp.chk('PDF parts: the row''s parts without also_by (contents not forced)',
  (select e.parts = f.parts - 'also_by' and not (e.parts ->> 'contents')::boolean
     from public.book_exports e join public.book_formats f on f.book_id = e.book_id where e.format = 'pdf' and e.page_count = 40));
select pg_temp.chk('PDF snapshot: style and paper, as 0027',
  (select snapshot ? 'paper' and snapshot ? 'style' from public.book_exports where format = 'pdf' and page_count = 40));
select pg_temp.chk('DOCX snapshot: no style and no paper, as 0025',
  (select not (snapshot ? 'paper') and not (snapshot ? 'style') from public.book_exports where format = 'docx'));
update public.book_formats set parts = parts || '{"contents": true, "about": false}' where book_id = :BOOK1;

-- ── 6. epub_key: what changes it and what does not ──
-- "KEY no": a print-only input; the EPUB key stays, and format_key moves (the edit is real).
-- "KEY yes": an EPUB input; the EPUB key moves.
select public.epub_key(:BOOK1) as e0 \gset
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set drop_cap = true where book_id = :BOOK1;
select pg_temp.chk('KEY no: drop cap', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: drop cap)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set recto_start = false where book_id = :BOOK1;
select pg_temp.chk('KEY no: right-hand start (recto_start)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: recto_start)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set header_title = 'Chair Yoga' where book_id = :BOOK1;
select pg_temp.chk('KEY no: header title (header on)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: header title)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set running_header = false where book_id = :BOOK1;
select pg_temp.chk('KEY no: running header', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: running header)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set isbn = '9780306406157' where book_id = :BOOK1;
select pg_temp.chk('KEY no: ISBN', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: ISBN)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set paper = 'cream' where book_id = :BOOK1;
select pg_temp.chk('KEY no: paper', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (paper is in neither key: format_key same, owner Q5)', public.format_key(:BOOK1) = :'k');
select pg_temp.chk('     (the paper edit is real)', (select paper = 'cream' from public.book_formats where book_id = :BOOK1));
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_briefs set trim_size = '5.25x8' where book_id = :BOOK1;
select pg_temp.chk('KEY no: trim (in the Brief)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: trim)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set parts = parts || '{"contents": false}' where book_id = :BOOK1;
select pg_temp.chk('KEY no: parts.contents (always on in the EPUB)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: parts.contents)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set parts = parts || '{"title": false}' where book_id = :BOOK1;
select pg_temp.chk('KEY no: parts.title (always on in the EPUB)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: parts.title)', public.format_key(:BOOK1) <> :'k');
select public.epub_key(:BOOK1) as e, public.format_key(:BOOK1) as k \gset
update public.book_formats set parts = parts || '{"copyright": false}' where book_id = :BOOK1;
select pg_temp.chk('KEY no: parts.copyright (always on in the EPUB)', public.epub_key(:BOOK1) = :'e');
select pg_temp.chk('     (format_key changes: parts.copyright)', public.format_key(:BOOK1) <> :'k');
select pg_temp.chk('KEY no: all ten print-only edits together leave the first key', public.epub_key(:BOOK1) = :'e0');
update public.book_formats set parts = parts || '{"title": true, "copyright": true, "contents": true}', running_header = true where book_id = :BOOK1;
select pg_temp.chk('     (the always-on parts back on: still the first key)', public.epub_key(:BOOK1) = :'e0');
-- EPUB inputs.
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set style = 'warm' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: style', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set contents_sections = true where book_id = :BOOK1;
select pg_temp.chk('KEY yes: Show sections too (contents_sections)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set chapter_label = 'number' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: chapter label (chapter to number)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set chapter_label = 'none' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: chapter label (number to none)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set parts = parts || '{"intro": false}' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: parts.intro', public.epub_key(:BOOK1) <> :'e');
update public.book_formats set parts = parts || '{"intro": true}' where book_id = :BOOK1;
select pg_temp.chk('     (intro back on: the key before)', public.epub_key(:BOOK1) = :'e');
update public.book_formats set parts = parts || '{"conclusion": false}' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: parts.conclusion', public.epub_key(:BOOK1) <> :'e');
update public.book_formats set parts = parts || '{"conclusion": true}' where book_id = :BOOK1;
select public.epub_key(:BOOK1) as e \gset
:OWNER
update public.pen_names set bio_text = 'Bio two.' where id = :P1;
select pg_temp.chk('KEY no: bio while About the author is off', public.epub_key(:BOOK1) = :'e');
:ASA
update public.book_formats set parts = parts || '{"about": true}' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: parts.about', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
:OWNER
update public.pen_names set bio_text = 'Bio three.' where id = :P1;
select pg_temp.chk('KEY yes: bio while About the author is on', public.epub_key(:BOOK1) <> :'e');
:ASA
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set also_by = array[:BOOK2]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('KEY no: Also by ticks while the part is off', public.epub_key(:BOOK1) = :'e');
update public.book_formats set parts = parts || '{"also_by": true}' where book_id = :BOOK1;
select pg_temp.chk('KEY yes: parts.also_by', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set also_by = array[:BOOK2, :BOOK3]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('KEY yes: an Also by tick (part on)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.book_formats set also_by = array[:BOOK3, :BOOK2]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('KEY yes: Also by order', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
:OWNER
update public.books set title = 'Second Book, new' where id = :BOOK2;
select pg_temp.chk('KEY yes: an Also by book''s title (part on)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.books set subtitle = 'Part two, new' where id = :BOOK2;
select pg_temp.chk('KEY yes: an Also by book''s subtitle (part on)', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.books set pen_name_id = :P2 where id = :BOOK3;
select pg_temp.chk('KEY yes: an Also by book leaves the pen name', public.epub_key(:BOOK1) <> :'e');
update public.books set pen_name_id = :P1 where id = :BOOK3;
select public.epub_key(:BOOK1) as e \gset
update public.books set title = 'Chair Yoga for Seniors Over 60' where id = :BOOK1;
select pg_temp.chk('KEY yes: title', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.books set subtitle = 'Gentle moves at home' where id = :BOOK1;
select pg_temp.chk('KEY yes: subtitle', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.pen_names set name = 'Nora B. Hale' where id = :P1;
select pg_temp.chk('KEY yes: pen name', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.chapters set title = 'Getting set up' where id = :C1;
select pg_temp.chk('KEY yes: a chapter title', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.sections set title = 'Your chair' where id = :S11;
select pg_temp.chk('KEY yes: a section title', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
:ASA
select pg_temp.expect('A saves a new version of a Final section', format($q$select public.save_version(%L, 'Chair text, better.', %L)$q$, :S11, :V11), 'OK 1');
select pg_temp.chk('KEY yes: a new version of a Final section', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
select pg_temp.expect('A saves a new version of a Draft section', format($q$select public.save_version(%L, 'Breathing text, better.', %L)$q$, :S12, :V12), 'OK 1');
select pg_temp.chk('KEY no: a new version of a Draft section', public.epub_key(:BOOK1) = :'e');
update public.sections set status = 'final' where id = :S12;
select pg_temp.chk('KEY yes: a section moved to Final', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.sections set status = 'reviewed' where id = :S12;
select pg_temp.chk('KEY yes: a section moved back from Final', public.epub_key(:BOOK1) <> :'e');
select public.epub_key(:BOOK1) as e \gset
update public.sections set status = 'draft' where id = :S12;
select pg_temp.chk('KEY no: Reviewed to Draft (neither is in the EPUB)', public.epub_key(:BOOK1) = :'e');
update public.book_formats set style = 'classic' where book_id = :BOOK1;
update public.book_formats set style = 'warm' where book_id = :BOOK1;
select pg_temp.chk('KEY: back to the same settings gives the same key', public.epub_key(:BOOK1) = :'e');

-- ── 7. epub_marks and format_json ──
select pg_temp.expect('epub_marks: the first EPUB is now stale (the book changed)', format($q$select 1 from public.epub_marks(%L) where changed$q$, :BOOK1), 'OK 1');
select pg_temp.expect('A records a new EPUB', pg_temp.epub_sql(:BOOK1, at => '2030-01-05 00:00+00'), 'OK 1');
select pg_temp.chk('epub_marks: the newest EPUB, not changed',
  (select not changed and exported_at = '2030-01-05 00:00+00' from public.epub_marks() where book_id = :BOOK1),
  (select row(m.*)::text from public.epub_marks() m where book_id = :BOOK1));
select pg_temp.chk('epub_marks: input p_book_id; columns book_id, exported_at, changed',
  (select array_agg(n order by o) from unnest((select proargnames from pg_proc where proname = 'epub_marks')) with ordinality u(n, o)) = array['p_book_id', 'book_id', 'exported_at', 'changed']
  and pg_get_function_result('public.epub_marks(uuid)'::regprocedure) = 'TABLE(book_id uuid, exported_at timestamp with time zone, changed boolean)',
  pg_get_function_result('public.epub_marks(uuid)'::regprocedure));
select pg_temp.chk('epub_marks: one row per book with an EPUB', (select count(*) from public.epub_marks()) = 1);
select pg_temp.chk('epub_marks(book): the same row', (select exported_at from public.epub_marks(:BOOK1)) = '2030-01-05 00:00+00');
select pg_temp.chk('epub_marks(another book): no row', not exists (select 1 from public.epub_marks(:BOOK2)));
select pg_temp.chk('format_json: top-level keys (the 0027 keys and the 3 EPUB keys)',
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1)) k)
    = array['also_by_valid', 'book', 'candidates', 'changed', 'epub_changed', 'epub_key', 'key', 'last_epub', 'last_pdf', 'now', 'settings'],
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1)) k)::text);
select pg_temp.chk('format_json: epub_key is today''s epub_key, key is still format_key',
  public.format_json(:BOOK1) ->> 'epub_key' = public.epub_key(:BOOK1) and public.format_json(:BOOK1) ->> 'key' = public.format_key(:BOOK1));
select pg_temp.chk('format_json: last_epub fields (id, created_at, settings_key, engine)',
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1) -> 'last_epub') k) = array['created_at', 'engine', 'id', 'settings_key']);
select pg_temp.chk('format_json: last_epub is the newest EPUB row, epub_changed false',
  (select (j -> 'last_epub' ->> 'id')::uuid = (select id from public.book_exports where format = 'epub' order by created_at desc limit 1)
          and j -> 'last_epub' ->> 'engine' = 'epub3 · e1' and j -> 'epub_changed' = 'false'::jsonb
     from (select public.format_json(:BOOK1) j) s));
select pg_temp.chk('format_json: last_pdf fields unchanged (id, created_at, page_count, settings_key, engine)',
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1) -> 'last_pdf') k) = array['created_at', 'engine', 'id', 'page_count', 'settings_key']);
select pg_temp.chk('format_json: no EPUB yet: last_epub and epub_changed null (book 2 has no format row)',
  (select j -> 'last_epub' = 'null'::jsonb and j -> 'epub_changed' = 'null'::jsonb and j -> 'epub_key' = 'null'::jsonb from (select public.format_json(:BOOK2) j) s));
-- Print-only edits: the EPUB stays current, the PDF changes.
select public.format_key(:BOOK1) as k \gset
select pg_temp.expect('A records a Print PDF of today (44 pages)', pg_temp.pdf_sql(:BOOK1, 44, '2030-01-06 00:00+00'), 'OK 1');
update public.book_formats set drop_cap = false, isbn = null where book_id = :BOOK1;
select pg_temp.chk('print-only edit: the EPUB is still current', not (select changed from public.epub_marks(:BOOK1)) and public.format_json(:BOOK1) ->> 'epub_changed' = 'false');
select pg_temp.chk('print-only edit: the PDF reads as changed', (select changed from public.pdf_marks(:BOOK1)) and public.format_json(:BOOK1) ->> 'changed' = 'true');
update public.book_formats set chapter_label = 'chapter' where book_id = :BOOK1;
select pg_temp.chk('chapter label: the EPUB reads as changed', (select changed from public.epub_marks(:BOOK1)) and public.format_json(:BOOK1) ->> 'epub_changed' = 'true');
select pg_temp.expect('A records a DOCX export', format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'docx', 'all', %L, array[%L]::uuid[], '2030-01-07 00:00+00')$q$, :BOOK1, :PARTS6, :V11), 'OK 1');
select pg_temp.chk('a DOCX export does not clear the EPUB "changed"', (select changed from public.epub_marks(:BOOK1)));
select pg_temp.expect('A records a Print PDF of today (46 pages)', pg_temp.pdf_sql(:BOOK1, 46, '2030-01-08 00:00+00'), 'OK 1');
select pg_temp.chk('a Print PDF does not clear the EPUB "changed"', (select changed from public.epub_marks(:BOOK1)));
select pg_temp.chk('...and the PDF is current again', not (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.expect('A records a new EPUB', pg_temp.epub_sql(:BOOK1, at => '2030-01-09 00:00+00'), 'OK 1');
select pg_temp.chk('the new EPUB is current', not (select changed from public.epub_marks(:BOOK1)) and (select exported_at from public.epub_marks(:BOOK1)) = '2030-01-09 00:00+00');
select pg_temp.chk('the EPUB does not touch the PDF mark', (select page_count = 46 and not changed and exported_at = '2030-01-08 00:00+00' from public.pdf_marks(:BOOK1)));

-- ── 8. Keep 20 per format: 22 more EPUBs leave 20 EPUBs and every PDF and DOCX row ──
:OWNER
select count(*) as npdf from public.book_exports where book_id = :BOOK1 and format = 'pdf' \gset
select count(*) as ndocx from public.book_exports where book_id = :BOOK1 and format = 'docx' \gset
do $$ begin
  for i in 1..22 loop
    insert into public.book_exports (user_id, book_id, format, include, parts, versions, settings_key, engine, created_at)
      values ('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'epub', 'final',
              '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
              public.pdf_version_ids('b0000000-0000-4000-8000-000000000001'),
              public.epub_key('b0000000-0000-4000-8000-000000000001'), 'epub3 · e1', '2030-02-01 00:00+00'::timestamptz + make_interval(mins => i));
  end loop;
end $$;
select pg_temp.chk('prune: 20 EPUBs kept', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'epub') = 20,
  (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'epub')::text);
select pg_temp.chk('prune: the newest 20 EPUBs are the ones kept', (select min(created_at) from public.book_exports where book_id = :BOOK1 and format = 'epub') = '2030-02-01 00:03+00');
select pg_temp.chk('prune: the PDF rows stay', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'pdf') = :npdf);
select pg_temp.chk('prune: the DOCX rows stay', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'docx') = :ndocx);
do $$ begin
  for i in 1..22 loop
    insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine, created_at)
      values ('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'pdf', 'final',
              '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
              public.pdf_version_ids('b0000000-0000-4000-8000-000000000001'), 40,
              public.format_key('b0000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · t1', '2030-03-01 00:00+00'::timestamptz + make_interval(mins => i));
  end loop;
end $$;
select pg_temp.chk('prune: 22 more PDFs leave 20 PDFs', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'pdf') = 20);
select pg_temp.chk('prune: ...and the 20 EPUBs stay', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'epub') = 20);

-- ── 9. The new check holds over DOCX, Markdown, PDF and EPUB rows ──
-- Adding a check validates every row already in the table (as the live apply does).
insert into public.book_exports (user_id, book_id, format, include, parts, versions)
  values (:A, :BOOK1, 'md', 'all', :PARTS6, array[:V11]::uuid[]);
select pg_temp.chk('rows of every format are present', (select array_agg(distinct format order by format) from public.book_exports) = array['docx', 'epub', 'md', 'pdf']);
select pg_temp.expect('file fields check: dropped and added again over every row',
  $q$alter table public.book_exports drop constraint book_exports_file_fields_check, add constraint book_exports_file_fields_check check (
  case when format = 'pdf' then page_count is not null and settings_key is not null and engine is not null
       when format = 'epub' then page_count is null and settings_key is not null and engine is not null
       else page_count is null and settings_key is null and engine is null end)$q$, 'OK 0');
select pg_temp.expect('format check: dropped and added again over every row',
  $q$alter table public.book_exports drop constraint book_exports_format_check, add constraint book_exports_format_check check (format in ('docx', 'md', 'pdf', 'epub'))$q$, 'OK 0');
-- The check itself, without the guard (replica mode skips triggers, never checks).
set session_replication_role = replica;
select pg_temp.expect('check only: an EPUB without a key refused', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, engine) values (%L, %L, 'epub', 'final', %L, array[%L]::uuid[], 'epub3 · e1')$q$, :A, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('check only: an EPUB with a page count refused', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, %L, 'epub', 'final', %L, array[%L]::uuid[], 36, md5('x'), 'epub3 · e1')$q$, :A, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('check only: an EPUB without an engine refused', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, settings_key) values (%L, %L, 'epub', 'final', %L, array[%L]::uuid[], md5('x'))$q$, :A, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('check only: a PDF without a key refused', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, engine) values (%L, %L, 'pdf', 'final', %L, array[%L]::uuid[], 36, 't')$q$, :A, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('check only: a DOCX with a page count refused', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count) values (%L, %L, 'docx', 'all', %L, array[%L]::uuid[], 36)$q$, :A, :BOOK1, :PARTS6, :V11), '23514%book_exports_file_fields_check%');
select pg_temp.expect('check only: an EPUB with key and engine passes', format($q$insert into public.book_exports (id, user_id, book_id, format, include, parts, versions, settings_key, engine) values ('9e000000-0000-4000-8000-000000000001', %L, %L, 'epub', 'final', %L, array[%L]::uuid[], md5('x'), 'epub3 · e1')$q$, :A, :BOOK1, :PARTS6, :V11), 'OK 1');
reset session_replication_role;
delete from public.book_exports where id = '9e000000-0000-4000-8000-000000000001';

-- ── 10. User B ──
:ASB
select pg_temp.expect('B: epub_key of A''s book is null', format($q$select 1 where public.epub_key(%L) is null$q$, :BOOK1), 'OK 1');
select pg_temp.expect('B: no epub_marks', $q$select 1 from public.epub_marks()$q$, 'OK 0');
select pg_temp.expect('B: epub_marks(A''s book) gives no row', format($q$select 1 from public.epub_marks(%L)$q$, :BOOK1), 'OK 0');
select pg_temp.expect('B: format_json of A''s book is null', format($q$select 1 where public.format_json(%L) is null$q$, :BOOK1), 'OK 1');
select pg_temp.expect('B reads none of A''s EPUB rows', $q$select 1 from public.book_exports where format = 'epub'$q$, 'OK 0');
select pg_temp.expect('B cannot record an EPUB of A''s book', pg_temp.epub_sql(:BOOK1, k => quote_literal(md5('x'))), '42501%');
select pg_temp.expect('B makes a format row for B''s book', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOKB), 'OK 1');
select pg_temp.expect('B cannot put A''s version in B''s EPUB', pg_temp.epub_sql(:BOOKB, vers => format('array[%L]::uuid[]', :V11)), 'P0001 export_version_not_in_book%');
select pg_temp.expect('B cannot update A''s EPUB rows', $q$update public.book_exports set engine = 'x' where format = 'epub'$q$, '42501%');
select pg_temp.expect('B cannot delete A''s EPUB rows', $q$delete from public.book_exports where format = 'epub'$q$, '42501%');
:ASA
select pg_temp.expect('A cannot update A''s own EPUB rows (recorded once)', $q$update public.book_exports set engine = 'x' where format = 'epub'$q$, '42501%');
select pg_temp.expect('A cannot delete A''s own EPUB rows', $q$delete from public.book_exports where format = 'epub'$q$, '42501%');

-- ── 11. Grants, security, no limits, RLS as 0025 ──
:OWNER
select pg_temp.chk(f || ': authenticated may execute', has_function_privilege('authenticated', f, 'execute'))
  from unnest(array['public.epub_key(uuid)', 'public.epub_marks(uuid)', 'public.format_json(uuid)']) f order by f;
select pg_temp.chk(f || ': anon may not execute', not has_function_privilege('anon', f, 'execute'))
  from unnest(array['public.epub_key(uuid)', 'public.epub_marks(uuid)', 'public.format_json(uuid)']) f order by f;
select pg_temp.chk(f || ': PUBLIC may not execute', not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0))
  from unnest(array['public.epub_key(uuid)', 'public.epub_marks(uuid)', 'public.format_json(uuid)']) f order by f;
select pg_temp.chk('book_exports_guard(): no API role may execute the trigger',
  not has_function_privilege('authenticated', 'public.book_exports_guard()', 'execute') and not has_function_privilege('anon', 'public.book_exports_guard()', 'execute'));
select pg_temp.chk('epub_key, epub_marks, format_json: SECURITY INVOKER; the guard stays SECURITY DEFINER',
  (select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and p.proname in ('epub_key', 'epub_marks', 'format_json', 'book_exports_guard')) = array['book_exports_guard']);
select pg_temp.chk('epub_key, epub_marks, format_json, the guard: search_path is empty',
  (select bool_and(p.proconfig = array['search_path=""']) and count(*) = 4 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('epub_key', 'epub_marks', 'format_json', 'book_exports_guard')));
select pg_temp.chk('epub_key, epub_marks, format_json: stable', (select bool_and(provolatile = 's') from pg_proc where pronamespace = 'public'::regnamespace and proname in ('epub_key', 'epub_marks', 'format_json')));
select pg_temp.chk('no limit or budget input: each new or replaced function takes one book id only',
  (select bool_and(pronargs = 1 and proargtypes[0] = 'uuid'::regtype) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('epub_key', 'epub_marks', 'format_json')));
select pg_temp.chk('one function of each name (no overloads)',
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('epub_key', 'epub_marks', 'format_json', 'book_exports_guard')) = 4);
select pg_temp.chk('book_exports: RLS on, the two 0025 policies only',
  (select relrowsecurity from pg_class where oid = 'public.book_exports'::regclass)
  and (select array_agg(policyname::text order by policyname) from pg_policies where schemaname = 'public' and tablename = 'book_exports') = array['book_exports_insert_own', 'book_exports_select_own']);
select pg_temp.chk('book_exports: no update, delete or truncate for the API roles',
  not has_table_privilege('authenticated', 'public.book_exports', 'update') and not has_table_privilege('authenticated', 'public.book_exports', 'delete')
  and not has_table_privilege('anon', 'public.book_exports', 'update') and not has_table_privilege('anon', 'public.book_exports', 'delete')
  and not has_table_privilege('authenticated', 'public.book_exports', 'truncate'));
select pg_temp.chk('no new table: 34 public tables', (select count(*) from pg_tables where schemaname = 'public') = 34,
  (select count(*) from pg_tables where schemaname = 'public')::text);
set role anon;
select pg_temp.expect('anon: epub_key refused', format($q$select public.epub_key(%L)$q$, :BOOK1), '42501%');
select pg_temp.expect('anon: epub_marks refused', $q$select * from public.epub_marks()$q$, '42501%');
select pg_temp.expect('anon reads no export rows', $q$select 1 from public.book_exports$q$, 'OK 0');
