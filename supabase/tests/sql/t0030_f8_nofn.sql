-- 0030 F8 (E16 Part 3): the signed-in path of the 09 Cover editor works on
-- the grants 0030 writes itself, never on Supabase's default privileges.
-- run.sh builds this file's database without the default EXECUTE on new
-- functions for anon, authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- As A: make and autosave a design (the checks call cover_fmt_ok,
-- cover_layers_ok, cover_hex_ok, cover_trim_ok), add a snapshot, a picture
-- and a My layout, read cover_json, cover_fmt and cover_key, export the
-- three files, read cover_marks. As anon: every 0030 function is refused.
-- Run: supabase/tests/sql/run.sh t0030_f8_nofn.sql
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

-- ── Seed (as the owner) ──
insert into auth.users values (:A);
insert into public.pen_names (id, user_id, name) values ('e0000000-0000-4000-8000-000000000001', :A, 'Nora Hale');
insert into public.books (id, user_id, pen_name_id, title) values (:BOOK1, :A, 'e0000000-0000-4000-8000-000000000001', 'Chair Yoga for Seniors');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
insert into public.book_formats (book_id, user_id) values (:BOOK1, :A);
insert into public.chapters (id, user_id, book_id, position, kind, title) values ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1, 'chapter', 'One');
insert into public.sections (id, user_id, chapter_id, position, title, status) values ('d0000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1, 'Start', 'final');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values ('f0000000-0000-4000-8000-000000000001', :A, 'd0000000-0000-4000-8000-000000000001', 1, 'Some text.', 'manual');
update public.sections set current_version_id = 'f0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';
insert into public.book_exports (user_id, book_id, format, include, parts, versions, page_count, settings_key, engine) values
  (:A, :BOOK1, 'pdf', 'final', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}',
   public.pdf_version_ids(:BOOK1), 54, public.format_key(:BOOK1), 'typst 0.14.2 · t1');

-- ── As A, with only 0030's explicit grants ──
:ASA
select pg_temp.expect('F8 cover_fmt reads today''s size', $q$select 1 where public.cover_fmt('b0000000-0000-4000-8000-000000000001') = '{"trim": "6x9", "pages": 54, "paper": "white"}'$q$, 'OK 1');
select pg_temp.expect('F8 A makes the design (checks: cover_fmt_ok, cover_layers_ok, cover_hex_ok, cover_trim_ok)', $q$insert into public.cover_designs (book_id, fmt, layers, bg, layout)
  values ('b0000000-0000-4000-8000-000000000001', public.cover_fmt('b0000000-0000-4000-8000-000000000001'), '[{"id": 1, "type": "text", "text": "Chair Yoga"}]', '#1F3A5F', 'band')$q$, 'OK 1');
select pg_temp.expect('F8 A autosaves at rev 1', $q$update public.cover_designs set layers = '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000001"}]' where book_id = 'b0000000-0000-4000-8000-000000000001' and rev = 1$q$, 'OK 1');
select pg_temp.expect('F8 a bad layer is still refused by the check', $q$update public.cover_designs set layers = '[{"type": "text"}]' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('F8 A adds a snapshot', $q$insert into public.cover_design_history (book_id, reason, layers, bg, fmt)
  select book_id, 'visit', layers, bg, fmt from public.cover_designs where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('F8 A adds a ticked picture', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', 1838, 2775, 900000, now())$q$, 'OK 1');
select pg_temp.expect('F8 A saves the My layout (checks: cover_fmt_ok, cover_layers_ok, cover_hex_ok)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers)
  select 'Chair Yoga', book_id, fmt, bg, layers from public.cover_designs where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('F8 cover_json reads', $q$select 1 where jsonb_array_length(public.cover_json('b0000000-0000-4000-8000-000000000001') -> 'assets') = 1$q$, 'OK 1');
select pg_temp.expect('F8 cover_key reads', $q$select 1 where public.cover_key('b0000000-0000-4000-8000-000000000001') ~ '^[0-9a-f]{32}$'$q$, 'OK 1');
select pg_temp.expect('F8 shape helpers run for A', $q$select 1 where public.cover_trim_ok('8.5x11') and public.cover_fmt_ok('{"trim": "6x9", "pages": 54, "paper": "white"}') and public.cover_layers_ok('[]')$q$, 'OK 1');
select pg_temp.expect('F8 A exports the print cover', $q$insert into public.cover_exports (book_id, kind, settings_key, engine, width_in, height_in, spine_in)
  values ('b0000000-0000-4000-8000-000000000001', 'print', public.cover_key('b0000000-0000-4000-8000-000000000001'), 'typst 0.14.2 · c1', 12.3716, 9.25, 0.1216)$q$, 'OK 1');
select pg_temp.expect('F8 A exports the full image', $q$insert into public.cover_exports (book_id, kind, settings_key, engine, width_px, height_px)
  values ('b0000000-0000-4000-8000-000000000001', 'image', public.cover_key('b0000000-0000-4000-8000-000000000001'), 'canvas png · c1', 3712, 2775)$q$, 'OK 1');
select pg_temp.expect('F8 A exports the Kindle JPG', $q$insert into public.cover_exports (book_id, kind, settings_key, engine, width_px, height_px)
  values ('b0000000-0000-4000-8000-000000000001', 'kindle', public.cover_key('b0000000-0000-4000-8000-000000000001'), 'canvas jpeg · c1', 1600, 2560)$q$, 'OK 1');
select pg_temp.expect('F8 cover_marks: the three files current', $q$select 1 from public.cover_marks() where pdf_current and print_changed = false and image_changed = false and kindle_changed = false$q$, 'OK 1');
select pg_temp.expect('F8 A uploads to A/assets/<id>.png', $q$insert into storage.objects (bucket_id, name) values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000002.png')$q$, 'OK 1');

-- ── As anon: every 0030 function refused ──
:ANON
select pg_temp.expect('anon: cover_trim_ok', $q$select public.cover_trim_ok('6x9')$q$, '42501%');
select pg_temp.expect('anon: cover_fmt_ok', $q$select public.cover_fmt_ok('{}'::jsonb)$q$, '42501%');
select pg_temp.expect('anon: cover_layers_ok', $q$select public.cover_layers_ok('[]'::jsonb)$q$, '42501%');
select pg_temp.expect('anon: cover_fmt', $q$select public.cover_fmt('b0000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('anon: cover_key', $q$select public.cover_key('b0000000-0000-4000-8000-000000000001')$q$, '42501%');
select pg_temp.expect('anon: cover_marks', $q$select * from public.cover_marks()$q$, '42501%');
select pg_temp.expect('anon: cover_json', $q$select public.cover_json('b0000000-0000-4000-8000-000000000001')$q$, '42501%');
:OWNER
