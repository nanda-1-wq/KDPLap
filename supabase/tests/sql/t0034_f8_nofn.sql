-- 0034 grants (E13.3 Part 2): the EPUB path works on the grants 0027 and
-- 0034 write themselves, never on Supabase's default privileges. run.sh
-- builds this file's database without the default EXECUTE on new functions
-- for anon, authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- As A: read epub_key, format_json and epub_marks, record an EPUB (the guard
-- runs). As anon: epub_key and epub_marks are refused.
-- Run: supabase/tests/sql/run.sh t0034_f8_nofn.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''

select pg_temp.chk('no default function grants in public (KDP_PG_NO_FN_DEFAULTS)', not exists (
  select 1 from pg_default_acl d where d.defaclobjtype = 'f' and d.defaclnamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE')));

insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name) values ('e0000000-0000-4000-8000-000000000001', :A, 'Nora Hale');
insert into public.books (id, user_id, pen_name_id, title) values (:BOOK1, :A, 'e0000000-0000-4000-8000-000000000001', 'Chair Yoga');
insert into public.chapters (id, user_id, book_id, position, kind, title) values ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1, 'chapter', 'One');
insert into public.sections (id, user_id, chapter_id, position, title, status) values ('d0000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1, 'S', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values ('f0000000-0000-4000-8000-000000000001', :A, 'd0000000-0000-4000-8000-000000000001', 1, 'Text.', 'manual');
update public.sections set current_version_id = 'f0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';

:ASA
select pg_temp.expect('F8 A makes the format row', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK1), 'OK 1');
select pg_temp.chk('F8 A reads epub_key (0034 grant)', public.epub_key(:BOOK1) ~ '^[0-9a-f]{32}$');
select pg_temp.chk('F8 A reads format_json with the EPUB keys (0027 grant kept by create or replace)',
  public.format_json(:BOOK1) ->> 'epub_key' = public.epub_key(:BOOK1) and public.format_json(:BOOK1) ? 'last_epub' and public.format_json(:BOOK1) ? 'epub_changed');
select pg_temp.expect('F8 A records an EPUB (the guard runs, epub_key and pdf_version_ids inside it)',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions, settings_key, engine) values (%L, 'epub', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', public.pdf_version_ids(%L), public.epub_key(%L), 'epub3 · e1')$q$, :BOOK1, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.chk('F8 A reads epub_marks (0034 grant): current', (select not changed from public.epub_marks(:BOOK1)));
select pg_temp.chk('F8 format_json: last_epub and epub_changed false', (select j -> 'last_epub' ->> 'engine' = 'epub3 · e1' and j ->> 'epub_changed' = 'false' from (select public.format_json(:BOOK1) j) s));
:ANON
select pg_temp.expect('F8 anon cannot run epub_key', format($q$select public.epub_key(%L)$q$, :BOOK1), '42501%');
select pg_temp.expect('F8 anon cannot run epub_marks', $q$select * from public.epub_marks()$q$, '42501%');
select pg_temp.expect('F8 anon cannot run format_json', format($q$select public.format_json(%L)$q$, :BOOK1), '42501%');
