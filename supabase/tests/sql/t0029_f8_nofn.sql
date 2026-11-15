-- 0029 F8 (E15 Part 1): the signed-in path of 09 Cover works on the grants
-- 0029 writes itself, never on Supabase's default privileges. run.sh builds
-- this file's database without the default EXECUTE on new functions for
-- anon, authenticated and service_role (reset.sh, KDP_PG_NO_FN_DEFAULTS=1).
-- After 0030 (E16 Part 3) the 0029 objects left are the blurbs, cover_pdf
-- and the shape helpers; t0030_f8_nofn.sql covers the 0030 path.
-- As A: add a blurb, read cover_pdf, run the kept shape helpers.
-- As anon: every kept 0029 function is refused.
-- Run: supabase/tests/sql/run.sh t0029_f8_nofn.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''

-- ── The run is real: no default EXECUTE on new functions ──
select pg_temp.chk('no default function grants in public (KDP_PG_NO_FN_DEFAULTS)', not exists (
  select 1 from pg_default_acl d where d.defaclobjtype = 'f' and d.defaclnamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE')));
create function public.f8_probe() returns int language sql as $$ select 1 $$;
revoke execute on function public.f8_probe() from public;
select pg_temp.chk('control: a new function with PUBLIC revoked is not executable by authenticated', not has_function_privilege('authenticated', 'public.f8_probe()', 'execute'));
drop function public.f8_probe();

-- ── Seed (as the owner) ──
insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name, bio_text) values ('e0000000-0000-4000-8000-000000000001', :A, 'Nora Hale', 'Nora teaches adults.');
insert into public.books (id, user_id, pen_name_id, title, subtitle) values (:BOOK1, :A, 'e0000000-0000-4000-8000-000000000001', 'Chair Yoga for Seniors', 'Gentle moves');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A);
insert into public.chapters (id, user_id, book_id, position, kind, title) values ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1, 'chapter', 'One');
insert into public.sections (id, user_id, chapter_id, position, title, status) values ('d0000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1, 'Start', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values ('f0000000-0000-4000-8000-000000000001', :A, 'd0000000-0000-4000-8000-000000000001', 1, 'Some text.', 'manual');
update public.sections set current_version_id = 'f0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';
insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine) values
  (:A, :BOOK1, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
   public.pdf_version_ids(:BOOK1), 54, public.format_key(:BOOK1), 'typst 0.14.2 · t1');

-- ── As A, with only 0029's explicit grants ──
:ASA
select pg_temp.expect('F8 A adds a blurb', $q$insert into public.cover_blurbs (book_id, body, source) values ('b0000000-0000-4000-8000-000000000001', 'A blurb.', 'manual')$q$, 'OK 1');
select pg_temp.expect('F8 A reads the blurb', $q$select 1 from public.cover_blurbs where body = 'A blurb.'$q$, 'OK 1');
select pg_temp.expect('F8 cover_pdf reads (54 pages, current)', $q$select 1 from public.cover_pdf('b0000000-0000-4000-8000-000000000001') where page_count = 54 and current$q$, 'OK 1');
select pg_temp.expect('F8 kept shape helpers run for A', $q$select 1 where public.cover_paper(null) = 'white' and public.cover_hex_ok('#FFFFFF') and public.cover_words(' a ') = 'a' and public.cover_recent_ok('{}')$q$, 'OK 1');

-- ── As anon: every kept 0029 function refused ──
:ANON
select pg_temp.expect('anon: cover_hex_ok', $q$select public.cover_hex_ok('#FFFFFF')$q$, '42501%');
select pg_temp.expect('anon: cover_recent_ok', $q$select public.cover_recent_ok('{}'::text[])$q$, '42501%');
select pg_temp.expect('anon: cover_words', $q$select public.cover_words('a')$q$, '42501%');
select pg_temp.expect('anon: cover_paper', $q$select public.cover_paper('white')$q$, '42501%');
select pg_temp.expect('anon: cover_pdf', $q$select * from public.cover_pdf('b0000000-0000-4000-8000-000000000001')$q$, '42501%');
:OWNER
