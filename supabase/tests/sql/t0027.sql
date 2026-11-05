-- 0027 format and Print PDF (E13.1 Part 1): book_formats (shape, defaults,
-- RLS, the guard: fixed row, owner, Also by), the touch, pdf_sections and
-- pdf_version_ids (Final only), also_by_valid, format_key (what changes it and
-- what does not), book_exports PDF rows (fields, the guard: format_missing,
-- export_pdf_final, export_stale, export_pdf_versions, parts and snapshot from
-- the database), pdf_marks, format_json and the grants.
-- Run: supabase/tests/sql/run.sh t0027.sql
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
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
\set BOOK5 '''b0000000-0000-4000-8000-000000000005'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''
\set CI '''c0000000-0000-4000-8000-000000000001'''
\set C1 '''c0000000-0000-4000-8000-000000000002'''
\set C2 '''c0000000-0000-4000-8000-000000000003'''
\set CC '''c0000000-0000-4000-8000-000000000004'''
\set SI '''d0000000-0000-4000-8000-000000000001'''
\set S11 '''d0000000-0000-4000-8000-000000000002'''
\set S12 '''d0000000-0000-4000-8000-000000000003'''
\set S21 '''d0000000-0000-4000-8000-000000000004'''
\set S22 '''d0000000-0000-4000-8000-000000000005'''
\set SC '''d0000000-0000-4000-8000-000000000006'''
\set VI '''f0000000-0000-4000-8000-000000000001'''
\set V11 '''f0000000-0000-4000-8000-000000000002'''
\set V12 '''f0000000-0000-4000-8000-000000000003'''
\set V21 '''f0000000-0000-4000-8000-000000000004'''
\set V22 '''f0000000-0000-4000-8000-000000000005'''
\set VC '''f0000000-0000-4000-8000-000000000006'''
\set V11B '''f0000000-0000-4000-8000-000000000007'''
\set V12B '''f0000000-0000-4000-8000-000000000008'''
\set PARTS6 '''{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}'''
\set ENGINE '''typst 0.14.2 · t1'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B);
insert into public.pen_names (id, user_id, name, bio_text) values
  (:P1, :A, 'Nora Hale', 'Bio one.'), (:P2, :A, 'Other Pen', null), (:PB, :B, 'Pen B', null);
insert into public.books (id, user_id, pen_name_id, title, subtitle, created_at) values
  (:BOOK1, :A, :P1, 'Chair Yoga for Seniors', 'Gentle moves', '2026-10-01 10:00+00'),
  (:BOOK2, :A, :P1, 'Second Book', 'Part two', '2026-10-02 10:00+00'),
  (:BOOK3, :A, :P1, 'Third Book', null, '2026-10-03 10:00+00'),
  (:BOOK4, :A, :P2, 'Other Pen Book', null, '2026-10-04 10:00+00'),
  (:BOOK5, :A, null, 'No Pen Book', null, '2026-10-05 10:00+00'),
  (:BOOKB, :B, :PB, 'B Book', null, '2026-10-06 10:00+00');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
insert into public.chapters (id, user_id, book_id, position, kind, title) values
  (:CI, :A, :BOOK1, 1, 'intro', 'Introduction'),
  (:C1, :A, :BOOK1, 2, 'chapter', 'Getting started'),
  (:C2, :A, :BOOK1, 3, 'chapter', 'Seated twists'),
  (:CC, :A, :BOOK1, 4, 'conclusion', 'Conclusion');
insert into public.sections (id, user_id, chapter_id, position, title, status) values
  (:SI, :A, :CI, 1, 'Why chair yoga', 'final'),
  (:S11, :A, :C1, 1, 'The chair', 'final'),
  (:S12, :A, :C1, 2, 'Breathing', 'draft'),
  (:S21, :A, :C2, 2, 'Twist two', 'final'),
  (:S22, :A, :C2, 1, 'Blank final', 'final'),
  (:SC, :A, :CC, 1, 'The end', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  (:VI, :A, :SI, 1, 'Intro text.', 'manual'),
  (:V11, :A, :S11, 1, 'Chair text.', 'manual'),
  (:V12, :A, :S12, 1, 'Breathing text.', 'manual'),
  (:V21, :A, :S21, 1, 'Twist text.', 'manual'),
  (:V22, :A, :S22, 1, E' \n\t ', 'manual'),
  (:VC, :A, :SC, 1, 'The end text.', 'manual');
update public.sections set current_version_id = :VI where id = :SI;
update public.sections set current_version_id = :V11 where id = :S11;
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set current_version_id = :V21 where id = :S21;
update public.sections set current_version_id = :V22 where id = :S22;
update public.sections set current_version_id = :VC where id = :SC;

-- ── 1. book_formats: table, RLS, defaults ──
select pg_temp.chk('RLS on book_formats', (select relrowsecurity from pg_class where oid = 'public.book_formats'::regclass));
select pg_temp.chk('three policies: select, insert, update', (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'book_formats') = array['INSERT', 'SELECT', 'UPDATE'],
  (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'book_formats')::text);
select pg_temp.chk('authenticated has no DELETE on book_formats', not has_table_privilege('authenticated', 'public.book_formats', 'delete'));
select pg_temp.chk('anon has no DELETE on book_formats', not has_table_privilege('anon', 'public.book_formats', 'delete'));

:ASA
select pg_temp.expect('format_key: null before the row', format($q$select 1 where public.format_key(%L) is null$q$, :BOOK1), 'OK 1');
select pg_temp.expect('pdf_sections: none before the row', format($q$select 1 from public.pdf_sections(%L)$q$, :BOOK1), 'OK 0');
select pg_temp.expect('format_json: settings null before the row', format($q$select 1 where public.format_json(%L) -> 'settings' = 'null'::jsonb$q$, :BOOK1), 'OK 1');
select pg_temp.expect('A makes the row with defaults', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK1), 'OK 1');
select pg_temp.chk('defaults: classic, chapter label, recto, header on, white, no drop cap',
  (select style = 'classic' and chapter_label = 'chapter' and recto_start and running_header and paper = 'white' and not drop_cap
          and not contents_sections and header_title is null and isbn is null and also_by = '{}' and user_id = :A
     from public.book_formats where book_id = :BOOK1));
select pg_temp.chk('default parts: about and also_by off, the rest on',
  (select parts = '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false, "also_by": false}'::jsonb from public.book_formats where book_id = :BOOK1));
select pg_temp.expect('a second row for the same book refused', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK1), '23505%');
select pg_temp.expect('A cannot delete the row', format($q$delete from public.book_formats where book_id = %L$q$, :BOOK1), '42501%');

-- ── 2. Shape checks ──
select pg_temp.expect('style outside the list refused', $q$update public.book_formats set style = 'fancy'$q$, '23514%book_formats_style_check%');
select pg_temp.expect('each style passes', $q$update public.book_formats set style = s from unnest(array['modern', 'clean', 'warm', 'classic']) s$q$, 'OK 1');
select pg_temp.expect('parts: a missing key refused', $q$update public.book_formats set parts = parts - 'also_by'$q$, '23514%book_formats_parts_check%');
select pg_temp.expect('parts: an extra key refused', $q$update public.book_formats set parts = parts || '{"dedication": true}'$q$, '23514%book_formats_parts_check%');
select pg_temp.expect('parts: a string value refused', $q$update public.book_formats set parts = parts || '{"title": "yes"}'$q$, '23514%book_formats_parts_check%');
select pg_temp.expect('parts: an array refused', $q$update public.book_formats set parts = '[]'$q$, '23514%book_formats_parts_check%');
select pg_temp.expect('chapter_label outside the list refused', $q$update public.book_formats set chapter_label = 'roman'$q$, '23514%book_formats_chapter_label_check%');
select pg_temp.expect('chapter_label number passes', $q$update public.book_formats set chapter_label = 'number'$q$, 'OK 1');
select pg_temp.expect('chapter_label none passes', $q$update public.book_formats set chapter_label = 'none'$q$, 'OK 1');
select pg_temp.expect('header_title empty refused', $q$update public.book_formats set header_title = ''$q$, '23514%book_formats_header_title_check%');
select pg_temp.expect('header_title with a space at the start refused', $q$update public.book_formats set header_title = ' Chair'$q$, '23514%book_formats_header_title_check%');
select pg_temp.expect('header_title with a space at the end refused', $q$update public.book_formats set header_title = 'Chair '$q$, '23514%book_formats_header_title_check%');
select pg_temp.expect('header_title 1 character passes', $q$update public.book_formats set header_title = 'C'$q$, 'OK 1');
select pg_temp.expect('header_title 80 characters passes', $q$update public.book_formats set header_title = repeat('é', 80)$q$, 'OK 1');
select pg_temp.expect('header_title 81 characters refused', $q$update public.book_formats set header_title = repeat('é', 81)$q$, '23514%book_formats_header_title_check%');
select pg_temp.expect('header_title back to null passes', $q$update public.book_formats set header_title = null$q$, 'OK 1');
select pg_temp.expect('paper outside the list refused', $q$update public.book_formats set paper = 'grey'$q$, '23514%book_formats_paper_check%');
select pg_temp.expect('paper cream passes', $q$update public.book_formats set paper = 'cream'$q$, 'OK 1');
select pg_temp.expect('ISBN 978 with a valid check digit passes', $q$update public.book_formats set isbn = '9780306406157'$q$, 'OK 1');
select pg_temp.expect('ISBN 979 with a valid check digit passes', $q$update public.book_formats set isbn = '9798000000007'$q$, 'OK 1');
select pg_temp.expect('ISBN with a wrong check digit refused', $q$update public.book_formats set isbn = '9780306406158'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN-10 refused', $q$update public.book_formats set isbn = '0306406152'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN with hyphens refused (stored without)', $q$update public.book_formats set isbn = '978-0-306-40615-7'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN with spaces refused (stored without)', $q$update public.book_formats set isbn = '978 0306406157'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN with a letter refused', $q$update public.book_formats set isbn = '97803064061X7'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN 977 prefix refused', $q$update public.book_formats set isbn = '9770306406157'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN 14 digits refused', $q$update public.book_formats set isbn = '97803064061570'$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN empty refused', $q$update public.book_formats set isbn = ''$q$, '23514%book_formats_isbn_check%');
select pg_temp.expect('ISBN back to null passes', $q$update public.book_formats set isbn = null$q$, 'OK 1');
select pg_temp.chk('isbn_ok: null is false', not public.isbn_ok(null));
select pg_temp.chk('also_by_shape_ok: 20 distinct ids pass', public.also_by_shape_ok((select array_agg(gen_random_uuid()) from generate_series(1, 20))));
select pg_temp.chk('also_by_shape_ok: 21 ids fail', not public.also_by_shape_ok((select array_agg(gen_random_uuid()) from generate_series(1, 21))));
select pg_temp.chk('also_by_shape_ok: a repeat fails', not public.also_by_shape_ok(array[:BOOK2, :BOOK2]::uuid[]));
select pg_temp.chk('also_by_shape_ok: a null fails', not public.also_by_shape_ok(array[:BOOK2, null]::uuid[]));
select pg_temp.chk('also_by_shape_ok: empty passes', public.also_by_shape_ok('{}'));
:OWNER
update public.book_formats set style = 'classic', chapter_label = 'chapter', paper = 'white' where book_id = :BOOK1;

-- ── 3. The guard: fixed row, owner ──
:ASA
select pg_temp.expect('book_id cannot change', format($q$update public.book_formats set book_id = %L where book_id = %L$q$, :BOOK2, :BOOK1), 'P0001 format_fixed%');
select pg_temp.expect('user_id cannot change', format($q$update public.book_formats set user_id = %L where book_id = %L$q$, :B, :BOOK1), 'P0001 format_fixed%');
select pg_temp.expect('A cannot make a row for B''s book', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOKB), '42501%');
-- A's own book in B's name: the guard answers first (as export_owner in 0025).
select pg_temp.expect('A cannot make a row in B''s name', format($q$insert into public.book_formats (book_id, user_id) values (%L, %L)$q$, :BOOK2, :B), 'P0001 format_owner%');
:OWNER
select pg_temp.expect('a row in another user''s name refused (no RLS)', format($q$insert into public.book_formats (book_id, user_id) values (%L, %L)$q$, :BOOK2, :B), 'P0001 format_owner%');
set role service_role;
select pg_temp.expect('the service role: owner checked too', format($q$insert into public.book_formats (book_id, user_id) values (%L, %L)$q$, :BOOK2, :B), 'P0001 format_owner%');
select pg_temp.expect('the service role: Also by checked too', format($q$update public.book_formats set also_by = array[%L]::uuid[] where book_id = %L$q$, :BOOKB, :BOOK1), 'P0001 also_by_not_allowed%');
:OWNER
select pg_temp.expect('a row for a book that does not exist refused', $q$insert into public.book_formats (book_id, user_id) values ('b0000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-00000000000a')$q$, '23503%');

-- ── 4. Also by ──
:ASA
select pg_temp.expect('Also by: two books with the same pen name pass', format($q$update public.book_formats set also_by = array[%L, %L]::uuid[] where book_id = %L$q$, :BOOK3, :BOOK2, :BOOK1), 'OK 1');
select pg_temp.chk('also_by_valid keeps the print order', public.also_by_valid(:BOOK1) = array[:BOOK3, :BOOK2]::uuid[], public.also_by_valid(:BOOK1)::text);
select pg_temp.expect('Also by: another pen name refused', format($q$update public.book_formats set also_by = also_by || %L::uuid where book_id = %L$q$, :BOOK4, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: a book with no pen name refused', format($q$update public.book_formats set also_by = also_by || %L::uuid where book_id = %L$q$, :BOOK5, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: the book itself refused', format($q$update public.book_formats set also_by = also_by || %L::uuid where book_id = %L$q$, :BOOK1, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: another user''s book refused', format($q$update public.book_formats set also_by = also_by || %L::uuid where book_id = %L$q$, :BOOKB, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: a book that does not exist refused', format($q$update public.book_formats set also_by = also_by || 'b0000000-0000-4000-8000-0000000000ff'::uuid where book_id = %L$q$, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: a repeat refused', format($q$update public.book_formats set also_by = also_by || %L::uuid where book_id = %L$q$, :BOOK2, :BOOK1), '23514%book_formats_also_by_check%');
select pg_temp.expect('Also by: a null refused', format($q$update public.book_formats set also_by = also_by || null::uuid where book_id = %L$q$, :BOOK1), '23514%book_formats_also_by_check%');
select pg_temp.expect('Also by: 21 ids refused', format($q$update public.book_formats set also_by = (select array_agg(gen_random_uuid()) from generate_series(1, 21)) where book_id = %L$q$, :BOOK1), 'P0001 also_by_not_allowed%');
select pg_temp.expect('Also by: reorder passes (nothing new)', format($q$update public.book_formats set also_by = array[%L, %L]::uuid[] where book_id = %L$q$, :BOOK2, :BOOK3, :BOOK1), 'OK 1');
select pg_temp.expect('a book with no pen name: ticks refused', format($q$insert into public.book_formats (book_id, also_by) values (%L, array[%L]::uuid[])$q$, :BOOK5, :BOOK2), 'P0001 also_by_not_allowed%');
select pg_temp.expect('a book with no pen name: empty Also by passes', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK5), 'OK 1');
select pg_temp.expect('insert with valid ticks passes', format($q$insert into public.book_formats (book_id, also_by) values (%L, array[%L]::uuid[])$q$, :BOOK2, :BOOK1), 'OK 1');
-- A pen name change on BOOK3: it drops from the PDF, not from the row.
:OWNER
update public.books set pen_name_id = :P2 where id = :BOOK3;
:ASA
select pg_temp.chk('pen name change: also_by_valid drops the book', public.also_by_valid(:BOOK1) = array[:BOOK2]::uuid[], public.also_by_valid(:BOOK1)::text);
select pg_temp.chk('pen name change: the row keeps it', (select also_by from public.book_formats where book_id = :BOOK1) = array[:BOOK2, :BOOK3]::uuid[]);
select pg_temp.expect('a stale tick is not checked again on another edit', format($q$update public.book_formats set drop_cap = true where book_id = %L$q$, :BOOK1), 'OK 1');
select pg_temp.expect('a stale tick added again is checked', format($q$update public.book_formats set also_by = array[%L]::uuid[] where book_id = %L$q$, :BOOK2, :BOOK1), 'OK 1');
select pg_temp.expect('... and refused', format($q$update public.book_formats set also_by = array[%L, %L]::uuid[] where book_id = %L$q$, :BOOK2, :BOOK3, :BOOK1), 'P0001 also_by_not_allowed%');
:OWNER
update public.books set pen_name_id = :P1 where id = :BOOK3;
update public.book_formats set drop_cap = false where book_id = :BOOK1;
:ASA
select pg_temp.chk('format_json: candidates are the other books with the same pen name, by age',
  (select array_agg((x ->> 'id')::uuid order by o) from jsonb_array_elements(public.format_json(:BOOK1) -> 'candidates') with ordinality j(x, o)) = array[:BOOK2, :BOOK3]::uuid[],
  (public.format_json(:BOOK1) -> 'candidates')::text);
select pg_temp.chk('format_json: candidate shape (id, title, subtitle)',
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1) -> 'candidates' -> 0) k) = array['id', 'subtitle', 'title']);
select pg_temp.chk('format_json: no candidates without a pen name', public.format_json(:BOOK5) -> 'candidates' = '[]'::jsonb);

-- ── 5. The touch: a format edit moves the book to the top of Books ──
-- (books_set_updated_at always writes now(), so the test compares with the stored time.)
:OWNER
select updated_at as t0 from public.books where id = :BOOK1 \gset
:ASA
update public.book_formats set contents_sections = true where book_id = :BOOK1;
:OWNER
select pg_temp.chk('touch: an edit sets books.updated_at', (select updated_at > :'t0' from public.books where id = :BOOK1));
select updated_at as t0 from public.books where id = :BOOK3 \gset
:ASA
insert into public.book_formats (book_id) values (:BOOK3);
:OWNER
select pg_temp.chk('touch: making the row is not an edit', (select updated_at = :'t0' from public.books where id = :BOOK3));
select updated_at as t0 from public.books where id = :BOOK1 \gset
update public.book_formats set contents_sections = false where book_id = :BOOK1;
select pg_temp.chk('touch: an edit by the owner role too', (select updated_at > :'t0' from public.books where id = :BOOK1));

-- ── 6. What goes in the PDF: Final sections only ──
:ASA
select pg_temp.chk('pdf_version_ids: Final with text, in order (draft and blank left out)',
  public.pdf_version_ids(:BOOK1) = array[:VI, :V11, :V21, :VC]::uuid[], public.pdf_version_ids(:BOOK1)::text);
select pg_temp.chk('pdf_sections: section position orders within a chapter',
  (select array_agg(section_id order by ord) from public.pdf_sections(:BOOK1)) = array[:SI, :S11, :S21, :SC]::uuid[]);
select pg_temp.chk('pdf_sections: chapter fields',
  (select chapter_id = :C1 and chapter_kind = 'chapter' and chapter_title = 'Getting started' and section_title = 'The chair' from public.pdf_sections(:BOOK1) where ord = 2));
update public.book_formats set parts = parts || '{"intro": false}' where book_id = :BOOK1;
select pg_temp.chk('intro off: the intro leaves', public.pdf_version_ids(:BOOK1) = array[:V11, :V21, :VC]::uuid[], public.pdf_version_ids(:BOOK1)::text);
update public.book_formats set parts = parts || '{"intro": true, "conclusion": false}' where book_id = :BOOK1;
select pg_temp.chk('conclusion off: the conclusion leaves', public.pdf_version_ids(:BOOK1) = array[:VI, :V11, :V21]::uuid[], public.pdf_version_ids(:BOOK1)::text);
update public.book_formats set parts = parts || '{"conclusion": true}' where book_id = :BOOK1;
select pg_temp.chk('pdf_version_ids: a book with no Final section is empty', public.pdf_version_ids(:BOOK2) = '{}'::uuid[]);

-- ── 7. format_key: what changes it ──
select public.format_key(:BOOK1) as k \gset
select pg_temp.chk('key: 32 hex characters', :'k' ~ '^[0-9a-f]{32}$', :'k');
select pg_temp.chk('key: the same twice', public.format_key(:BOOK1) = :'k');
:ASA
update public.book_formats set style = 'warm' where book_id = :BOOK1;
select pg_temp.chk('key changes: style', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set parts = parts || '{"contents": false}' where book_id = :BOOK1;
select pg_temp.chk('key changes: a part', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set contents_sections = true where book_id = :BOOK1;
select pg_temp.chk('key changes: Show sections too', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set chapter_label = 'number' where book_id = :BOOK1;
select pg_temp.chk('key changes: chapter label', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set drop_cap = true where book_id = :BOOK1;
select pg_temp.chk('key changes: drop cap', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set recto_start = false where book_id = :BOOK1;
select pg_temp.chk('key changes: right-hand start', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set header_title = 'Chair Yoga' where book_id = :BOOK1;
select pg_temp.chk('key changes: header title (header on)', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set running_header = false where book_id = :BOOK1;
select pg_temp.chk('key changes: running header', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set header_title = 'Chair' where book_id = :BOOK1;
select pg_temp.chk('key same: header title while the header is off', public.format_key(:BOOK1) = :'k');
update public.book_formats set running_header = true where book_id = :BOOK1;
select public.format_key(:BOOK1) as k \gset
update public.book_formats set isbn = '9780306406157' where book_id = :BOOK1;
select pg_temp.chk('key changes: ISBN', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set paper = 'cream' where book_id = :BOOK1;
select pg_temp.chk('key same: paper (owner, Q5)', public.format_key(:BOOK1) = :'k');
-- Also by counts only when its part is on.
update public.book_formats set also_by = array[:BOOK2]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('key same: Also by ticks while the part is off', public.format_key(:BOOK1) = :'k');
update public.book_formats set parts = parts || '{"also_by": true}' where book_id = :BOOK1;
select pg_temp.chk('key changes: Also by on', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set also_by = array[:BOOK2, :BOOK3]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('key changes: an Also by tick (part on)', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_formats set also_by = array[:BOOK3, :BOOK2]::uuid[] where book_id = :BOOK1;
select pg_temp.chk('key changes: Also by order', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
:OWNER
update public.books set title = 'Second Book, new' where id = :BOOK2;
select pg_temp.chk('key changes: an Also by book''s title (part on)', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.books set subtitle = 'Part two, new' where id = :BOOK2;
select pg_temp.chk('key changes: an Also by book''s subtitle (part on)', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.books set pen_name_id = :P2 where id = :BOOK3;
select pg_temp.chk('key changes: an Also by book leaves the pen name', public.format_key(:BOOK1) <> :'k');
update public.books set pen_name_id = :P1 where id = :BOOK3;
-- The book.
select public.format_key(:BOOK1) as k \gset
update public.books set title = 'Chair Yoga for Seniors Over 60' where id = :BOOK1;
select pg_temp.chk('key changes: title', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.books set subtitle = 'Gentle moves at home' where id = :BOOK1;
select pg_temp.chk('key changes: subtitle', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.pen_names set name = 'Nora B. Hale' where id = :P1;
select pg_temp.chk('key changes: pen name', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.book_briefs set trim_size = '5.25x8' where book_id = :BOOK1;
select pg_temp.chk('key changes: trim (in the Brief)', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.pen_names set bio_text = 'Bio two.' where id = :P1;
select pg_temp.chk('key same: bio while About the author is off', public.format_key(:BOOK1) = :'k');
update public.book_formats set parts = parts || '{"about": true}' where book_id = :BOOK1;
select public.format_key(:BOOK1) as k \gset
update public.pen_names set bio_text = 'Bio three.' where id = :P1;
select pg_temp.chk('key changes: bio while About the author is on', public.format_key(:BOOK1) <> :'k');
-- The text.
select public.format_key(:BOOK1) as k \gset
update public.chapters set title = 'Getting set up' where id = :C1;
select pg_temp.chk('key changes: a chapter title', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.sections set title = 'Your chair' where id = :S11;
select pg_temp.chk('key changes: a section title', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
:ASA
select pg_temp.expect('A saves a new version of a Final section', format($q$select public.save_version(%L, 'Chair text, better.', %L)$q$, :S11, :V11), 'OK 1');
select pg_temp.chk('key changes: a new version of a Final section', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
select pg_temp.expect('A saves a new version of a Draft section', format($q$select public.save_version(%L, 'Breathing text, better.', %L)$q$, :S12, :V12), 'OK 1');
select pg_temp.chk('key same: a new version of a Draft section', public.format_key(:BOOK1) = :'k');
update public.sections set status = 'final' where id = :S12;
select pg_temp.chk('key changes: a section moved to Final', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.sections set status = 'reviewed' where id = :S12;
select pg_temp.chk('key changes: a section moved back from Final', public.format_key(:BOOK1) <> :'k');
select public.format_key(:BOOK1) as k \gset
update public.sections set status = 'draft' where id = :S12;
select pg_temp.chk('key same: Reviewed to Draft (neither is in the PDF)', public.format_key(:BOOK1) = :'k');
update public.book_formats set parts = parts || '{"intro": false}' where book_id = :BOOK1;
select pg_temp.chk('key changes: intro part off', public.format_key(:BOOK1) <> :'k');
update public.book_formats set parts = parts || '{"intro": true}' where book_id = :BOOK1;
select pg_temp.chk('key: back to the same settings gives the same key', public.format_key(:BOOK1) = :'k');

-- ── 8. book_exports: Print PDF rows ──
:OWNER
select pg_temp.chk('format check lists pdf', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'book_exports_format_check') like '%pdf%');
:ASA
select pg_temp.expect('PDF: no format row refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, array[%L]::uuid[], 36, '0123456789abcdef0123456789abcdef', %L)$q$, :BOOK4, :PARTS6, :VI, :ENGINE), 'P0001%');
select pg_temp.expect('PDF: include all refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'all', %L, public.pdf_version_ids(%L), 36, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), 'P0001 export_pdf_final%');
select pg_temp.expect('PDF: a stale key refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 36, '0123456789abcdef0123456789abcdef', %L)$q$, :BOOK1, :PARTS6, :BOOK1, :ENGINE), 'P0001 export_stale%');
select pg_temp.expect('PDF: a missing key refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 36, %L)$q$, :BOOK1, :PARTS6, :BOOK1, :ENGINE), 'P0001 export_stale%');
select pg_temp.expect('PDF: versions not the Final list refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, array[%L]::uuid[], 36, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :VI, :BOOK1, :ENGINE), 'P0001 export_pdf_versions%');
select pg_temp.expect('PDF: the Final list in another order refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, (select array_agg(x order by x desc) from unnest(public.pdf_version_ids(%L)) x), 36, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), 'P0001 export_pdf_versions%');
select pg_temp.expect('PDF: a Draft version refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L) || %L::uuid, 36, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :V12, :BOOK1, :ENGINE), 'P0001 export_pdf_versions%');
select pg_temp.expect('PDF: no page count refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), '23514%book_exports_pdf_fields_check%');
select pg_temp.expect('PDF: an odd page count refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 37, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), '23514%book_exports_page_count_check%');
select pg_temp.expect('PDF: page count 0 refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 0, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), '23514%book_exports_page_count_check%');
select pg_temp.expect('PDF: page count 2,002 refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 2002, public.format_key(%L), %L)$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), '23514%book_exports_page_count_check%');
select pg_temp.expect('PDF: no engine refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 36, public.format_key(%L))$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1), '23514%book_exports_pdf_fields_check%');
select pg_temp.expect('PDF: an engine of 41 characters refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 36, public.format_key(%L), repeat('x', 41))$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1), '23514%book_exports_engine_check%');
select pg_temp.expect('DOCX: a page count refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count) values (%L, 'docx', 'all', %L, array[%L]::uuid[], 36)$q$, :BOOK1, :PARTS6, :VI), '23514%book_exports_pdf_fields_check%');
select pg_temp.expect('DOCX: a settings key refused', format($q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key) values (%L, 'docx', 'all', %L, array[%L]::uuid[], public.format_key(%L))$q$, :BOOK1, :PARTS6, :VI, :BOOK1), '23514%book_exports_pdf_fields_check%');
select pg_temp.expect('PDF: page count 2 passes', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine, created_at) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 2, public.format_key(%L), %L, '2030-01-01 00:00+00')$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), 'OK 1');
select pg_temp.expect('PDF: a good row passes (parts sent wrong on purpose)', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine, created_at) values (%L, 'pdf', 'final', '{"title": false, "copyright": false, "contents": false, "intro": false, "conclusion": false, "about": false}', public.pdf_version_ids(%L), 36, public.format_key(%L), %L, '2030-01-02 00:00+00')$q$, :BOOK1, :BOOK1, :BOOK1, :ENGINE), 'OK 1');
select pg_temp.chk('PDF: parts come from the format row (six keys)',
  (select e.parts = (f.parts - 'also_by') from public.book_exports e join public.book_formats f on f.book_id = e.book_id where e.format = 'pdf' and e.page_count = 36),
  (select parts::text from public.book_exports where format = 'pdf' and page_count = 36));
select pg_temp.chk('PDF: the snapshot adds style and paper',
  (select snapshot ->> 'style' = 'warm' and snapshot ->> 'paper' = 'cream' and snapshot ->> 'trim' = '5.25x8' and snapshot ->> 'include' = 'final'
     from public.book_exports where format = 'pdf' and page_count = 36));
select pg_temp.chk('PDF: the stored key is today''s key', (select settings_key = public.format_key(:BOOK1) from public.book_exports where format = 'pdf' and page_count = 36));

-- ── 9. pdf_marks and format_json ──
select pg_temp.chk('pdf_marks: the last PDF, not changed, 36 pages',
  (select page_count = 36 and not changed and exported_at = '2030-01-02 00:00+00' from public.pdf_marks() where book_id = :BOOK1),
  (select row(m.*)::text from public.pdf_marks() m where book_id = :BOOK1));
select pg_temp.chk('pdf_marks: one row per book with a PDF', (select count(*) from public.pdf_marks()) = 1);
select pg_temp.chk('pdf_marks(book): the same row', (select page_count from public.pdf_marks(:BOOK1)) = 36);
select pg_temp.chk('pdf_marks(another book): no row', not exists (select 1 from public.pdf_marks(:BOOK2)));
select pg_temp.chk('format_json: last_pdf and changed',
  (select (j -> 'last_pdf' ->> 'page_count')::int = 36 and j ->> 'changed' = 'false' and j ->> 'key' = (j -> 'last_pdf' ->> 'settings_key')
          and j -> 'last_pdf' ->> 'engine' = 'typst 0.14.2 · t1' from (select public.format_json(:BOOK1) j) s));
select pg_temp.chk('format_json: top-level keys',
  (select array_agg(k order by k) from jsonb_object_keys(public.format_json(:BOOK1)) k) = array['also_by_valid', 'book', 'candidates', 'changed', 'key', 'last_pdf', 'now', 'settings']);
select pg_temp.chk('format_json: book fields',
  (select j -> 'book' ->> 'trim' = '5.25x8' and j -> 'book' ->> 'pen_name' = 'Nora B. Hale' and (j -> 'book' ->> 'pen_name_id')::uuid = :P1 from (select public.format_json(:BOOK1) j) s));
select pg_temp.chk('format_json: settings without user_id', not (public.format_json(:BOOK1) -> 'settings' ? 'user_id') and public.format_json(:BOOK1) -> 'settings' ->> 'style' = 'warm');
select pg_temp.chk('format_json: no PDF yet: last_pdf and changed null', (select j -> 'last_pdf' = 'null'::jsonb and j -> 'changed' = 'null'::jsonb from (select public.format_json(:BOOK2) j) s));
select pg_temp.expect('export_badges: a PDF row is not a DOCX badge', format($q$select 1 from public.export_badges() where book_id = %L$q$, :BOOK1), 'OK 0');
-- A change: changed. A new export: not changed.
update public.book_formats set style = 'clean' where book_id = :BOOK1;
select pg_temp.chk('pdf_marks: a setting change reads as changed', (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.chk('format_json: changed too', public.format_json(:BOOK1) ->> 'changed' = 'true');
update public.book_formats set paper = 'white', style = 'warm' where book_id = :BOOK1;
select pg_temp.chk('pdf_marks: back to the settings it was built from (paper aside): not changed', not (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.expect('A saves a new Final version', format($q$select public.save_version(%L, 'The end text, better.', %L)$q$, :SC, :VC), 'OK 1');
select pg_temp.chk('pdf_marks: a new Final version reads as changed', (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.expect('A records a DOCX export', format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'docx', 'all', %L, array[%L]::uuid[], '2030-01-03 00:00+00')$q$, :BOOK1, :PARTS6, :VI), 'OK 1');
select pg_temp.chk('pdf_marks: a DOCX export does not clear "changed"', (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.expect('A records a new PDF (40 pages)', format($q$insert into public.book_exports (book_id, format, include, parts, versions, page_count, settings_key, engine, created_at) values (%L, 'pdf', 'final', %L, public.pdf_version_ids(%L), 40, public.format_key(%L), %L, '2030-01-04 00:00+00')$q$, :BOOK1, :PARTS6, :BOOK1, :BOOK1, :ENGINE), 'OK 1');
select pg_temp.chk('pdf_marks: the new PDF, not changed, 40 pages', (select page_count = 40 and not changed from public.pdf_marks(:BOOK1)));
select pg_temp.chk('format_json: last_pdf is the newest (the browser warns on a new page count)', (public.format_json(:BOOK1) -> 'last_pdf' ->> 'page_count')::int = 40);

-- Keep 20 per format: 22 more PDFs leave 20 PDFs and the DOCX row.
:OWNER
do $$ begin
  for i in 1..22 loop
    insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine, created_at)
      values ('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'pdf', 'final',
              '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
              public.pdf_version_ids('b0000000-0000-4000-8000-000000000001'), 40,
              public.format_key('b0000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · t1', '2030-02-01 00:00+00'::timestamptz + make_interval(mins => i));
  end loop;
end $$;
select pg_temp.chk('prune: 20 PDFs kept', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'pdf') = 20,
  (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'pdf')::text);
select pg_temp.chk('prune: the DOCX row stays', (select count(*) from public.book_exports where book_id = :BOOK1 and format = 'docx') = 1);

-- ── 10. A deleted Also by book ──
:ASA
select pg_temp.expect('A deletes BOOK3', format($q$delete from public.books where id = %L$q$, :BOOK3), 'OK 1');
select pg_temp.chk('deleted book: also_by_valid drops it', public.also_by_valid(:BOOK1) = array[:BOOK2]::uuid[], public.also_by_valid(:BOOK1)::text);
select pg_temp.chk('deleted book: the PDF reads as changed (Also by on)', (select changed from public.pdf_marks(:BOOK1)));
select pg_temp.expect('deleted book: other edits still save', format($q$update public.book_formats set drop_cap = false where book_id = %L$q$, :BOOK1), 'OK 1');

-- ── 11. User B ──
:ASB
select pg_temp.expect('B reads none of A''s format rows', $q$select 1 from public.book_formats$q$, 'OK 0');
select pg_temp.expect('B updates none of A''s format rows', $q$update public.book_formats set style = 'modern'$q$, 'OK 0');
select pg_temp.expect('B: format_json of A''s book is null', format($q$select 1 where public.format_json(%L) is null$q$, :BOOK1), 'OK 1');
select pg_temp.expect('B: no pdf_marks', $q$select 1 from public.pdf_marks()$q$, 'OK 0');
select pg_temp.expect('B makes a row for B''s book', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOKB), 'OK 1');
select pg_temp.expect('B cannot tick A''s book', format($q$update public.book_formats set also_by = array[%L]::uuid[]$q$, :BOOK2), 'P0001 also_by_not_allowed%');

-- ── 12. Grants ──
:OWNER
select pg_temp.chk(f || ': authenticated may execute', has_function_privilege('authenticated', f, 'execute'))
  from unnest(array['public.format_json(uuid)', 'public.format_key(uuid)', 'public.pdf_marks(uuid)', 'public.pdf_version_ids(uuid)', 'public.pdf_sections(uuid)', 'public.also_by_valid(uuid)']) f order by f;
select pg_temp.chk(f || ': anon may not execute', not has_function_privilege('anon', f, 'execute'))
  from unnest(array['public.format_json(uuid)', 'public.format_key(uuid)', 'public.pdf_marks(uuid)', 'public.pdf_version_ids(uuid)', 'public.pdf_sections(uuid)', 'public.also_by_valid(uuid)']) f order by f;
select pg_temp.chk(f || ': no API role may execute the trigger', not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
  from unnest(array['public.book_formats_guard()', 'public.book_exports_guard()']) f order by f;
select pg_temp.chk('functions: search_path is empty',
  (select bool_and(p.proconfig = array['search_path=""']) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('format_parts_ok', 'isbn_ok', 'also_by_shape_ok', 'book_formats_guard', 'pdf_sections', 'pdf_version_ids',
                        'also_by_valid', 'format_key', 'book_exports_guard', 'pdf_marks', 'format_json')));
select pg_temp.chk('only book_exports_guard is SECURITY DEFINER',
  (select array_agg(p.proname::text) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('format_parts_ok', 'isbn_ok', 'also_by_shape_ok', 'book_formats_guard', 'pdf_sections', 'pdf_version_ids',
                        'also_by_valid', 'format_key', 'book_exports_guard', 'pdf_marks', 'format_json')) = array['book_exports_guard']);
set role anon;
select pg_temp.expect('anon reads no format rows', $q$select 1 from public.book_formats$q$, 'OK 0');
