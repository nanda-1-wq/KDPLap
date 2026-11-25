-- 0035 grants (E17 Part 1): the part paths work on the grants the migrations
-- write themselves, never on Supabase's default privileges. run.sh builds this
-- file's database without the default EXECUTE on new functions for anon,
-- authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- Run: supabase/tests/sql/run.sh t0035_f8_nofn.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''

select pg_temp.chk('no default function grants in public (KDP_PG_NO_FN_DEFAULTS)', not exists (
  select 1 from pg_default_acl d where d.defaclobjtype = 'f' and d.defaclnamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE')));

insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name, bio_text) values
  ('e0000000-0000-4000-8000-000000000001', :A, 'Nora Hale', 'Bio.'), ('e0000000-0000-4000-8000-000000000002', :A, 'Two', null);

:ASA
select pg_temp.expect('A makes books (the parts trigger runs)', format($q$insert into public.books (id, pen_name_id, title) values (%L, 'e0000000-0000-4000-8000-000000000001', 'One'), (%L, 'e0000000-0000-4000-8000-000000000001', 'Two')$q$, :BOOK1, :BOOK2), 'OK 2');
select pg_temp.expect('A makes the format row', format($q$insert into public.book_formats (book_id) values (%L)$q$, :BOOK1), 'OK 1');
reset role; -- the section is seeded as the database owner
insert into public.chapters (id, user_id, book_id, position, kind, title) values ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1, 'chapter', 'One');
insert into public.sections (id, user_id, chapter_id, position, title, status) values ('d0000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1, 'S', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values ('f0000000-0000-4000-8000-000000000001', :A, 'd0000000-0000-4000-8000-000000000001', 1, 'Text.', 'manual');
update public.sections set current_version_id = 'f0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';
:ASA
select pg_temp.expect('A turns parts on', format($q$update public.book_parts set enabled = true where book_id = %L$q$, :BOOK1), 'OK 8');
select id as pid from public.book_parts where book_id = :BOOK1 and kind = 'preface' \gset
select pg_temp.expect('A saves', format($q$select public.save_part_version(%L, 'Hello there.', null)$q$, :'pid'), 'OK 1');
select current_version_id as v1 from public.book_parts where id = :'pid' \gset
select pg_temp.expect('A restores', format($q$select public.restore_part_version(%L, %L, %L)$q$, :'pid', :'v1', :'v1'), 'OK 1');
select pg_temp.expect('A copies the bio', format($q$select public.copy_bio_to_about(%L, null)$q$, :BOOK1), 'OK 1');
select pg_temp.expect('A sets Also by (ticked and typed)', format($q$select public.set_also_by(%L, '[{"book_id": "%s"}, {"title": "T"}]')$q$, :BOOK1, :BOOK2), 'OK 1');
select pg_temp.expect('A drafts', format($q$insert into public.book_part_drafts (part_id, content) values (%L, 'x')$q$, :'pid'), 'OK 1');
delete from public.book_part_drafts;
select current_version_id as v2 from public.book_parts where id = :'pid' \gset
reset role;
insert into public.part_suggestions (id, user_id, book_id, part_id, action, base_version_id, selection, output)
values ('99000000-0000-4000-8000-000000000001', :A, :BOOK1, :'pid', 'improve', :'v2', 'there', 'you');
:ASA
select pg_temp.expect('A accepts a suggestion', format($q$select public.apply_part_suggestion('99000000-0000-4000-8000-000000000001', %L, 'Hello you.')$q$, :'v2'), 'OK 1');
select pg_temp.chk('A reads ' || f.name, f.ok)
  from (values
    ('book_parts_json', public.book_parts_json(:BOOK1) -> 'parts' is not null),
    ('format_key', public.format_key(:BOOK1) ~ '^[0-9a-f]{32}$'),
    ('epub_key', public.epub_key(:BOOK1) ~ '^[0-9a-f]{32}$'),
    ('format_json', public.format_json(:BOOK1) ? 'book_parts'),
    ('export_json', public.export_json(:BOOK1) ? 'book_parts'),
    ('qc_json', public.qc_json(:BOOK1) ? 'book_parts')) f(name, ok);
select pg_temp.expect('A records an export (the guard runs)', format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": true}', public.pdf_version_ids(%L))$q$, :BOOK1, :BOOK1), 'OK 1');
select pg_temp.chk('A reads export_badges', (select count(*) from public.export_badges()) = 1);
select pg_temp.expect('A changes the pen name (the Q-11 trigger runs)', format($q$update public.books set pen_name_id = 'e0000000-0000-4000-8000-000000000002' where id = %L$q$, :BOOK1), 'OK 1');
select pg_temp.expect('A deletes a ticked book', format($q$delete from public.books where id = %L$q$, :BOOK2), 'OK 1');
:ANON
select pg_temp.expect('anon cannot run ' || f, format('select public.%s(%L)', f, :BOOK1), '42501%')
  from unnest(array['book_parts_json', 'part_file_list', 'also_by_entries', 'book_parts_files', 'about_text', 'part_key_extra']) f;
