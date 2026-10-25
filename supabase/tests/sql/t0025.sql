-- 0025 export and settings (E11, designs 24b and 25b): user_settings.display_name,
-- book_exports (RLS: own select and insert only; the guard: owner, versions of
-- this book, the snapshot from the database, the newest 20 per book),
-- export_json (the Export dialog's read), export_badges (the Books badge and
-- its "changed" rule) and usage_month (this month's counted tokens).
-- Run: supabase/tests/sql/run.sh t0025.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set C '''00000000-0000-4000-8000-00000000000c'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set P1 '''e0000000-0000-4000-8000-000000000001'''
\set PB '''e0000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''
\set BOOKC '''b0000000-0000-4000-8000-00000000000c'''
\set CI '''c0000000-0000-4000-8000-000000000001'''
\set C1 '''c0000000-0000-4000-8000-000000000002'''
\set C2 '''c0000000-0000-4000-8000-000000000003'''
\set CC '''c0000000-0000-4000-8000-000000000004'''
\set CX '''c0000000-0000-4000-8000-000000000005'''
\set CB '''c0000000-0000-4000-8000-00000000000b'''
\set CCC '''c0000000-0000-4000-8000-00000000000c'''
\set SI '''d0000000-0000-4000-8000-000000000001'''
\set S11 '''d0000000-0000-4000-8000-000000000002'''
\set S12 '''d0000000-0000-4000-8000-000000000003'''
\set S21 '''d0000000-0000-4000-8000-000000000004'''
\set S22 '''d0000000-0000-4000-8000-000000000005'''
\set SC '''d0000000-0000-4000-8000-000000000006'''
\set SX '''d0000000-0000-4000-8000-000000000007'''
\set SY '''d0000000-0000-4000-8000-000000000008'''
\set SB '''d0000000-0000-4000-8000-00000000000b'''
\set SCC '''d0000000-0000-4000-8000-00000000000c'''
\set VI1 '''f0000000-0000-4000-8000-000000000001'''
\set V11A '''f0000000-0000-4000-8000-000000000002'''
\set V11B '''f0000000-0000-4000-8000-000000000003'''
\set V12 '''f0000000-0000-4000-8000-000000000004'''
\set V22A '''f0000000-0000-4000-8000-000000000005'''
\set V22B '''f0000000-0000-4000-8000-000000000006'''
\set VC '''f0000000-0000-4000-8000-000000000007'''
\set VX '''f0000000-0000-4000-8000-000000000008'''
\set V12R '''f0000000-0000-4000-8000-000000000009'''
\set V21 '''f0000000-0000-4000-8000-00000000000a'''
\set VIN '''f0000000-0000-4000-8000-00000000000d'''
\set VXR '''f0000000-0000-4000-8000-00000000000e'''
\set VY1 '''f0000000-0000-4000-8000-00000000000f'''
\set VY2 '''f0000000-0000-4000-8000-000000000010'''
\set VB '''f0000000-0000-4000-8000-00000000000b'''
\set VCC '''f0000000-0000-4000-8000-00000000000c'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B), (:C);
insert into public.pen_names (id, user_id, name, bio_text) values (:P1, :A, 'Nora Hale', 'Bio one.'), (:PB, :B, 'Pen B', null);
insert into public.books (id, user_id, pen_name_id, title, subtitle) values
  (:BOOK1, :A, :P1, 'Chair Yoga for Seniors Over 60', 'Gentle moves'),
  (:BOOK2, :A, null, 'Second Book', null),
  (:BOOKB, :B, :PB, 'Walking After 70', null),
  (:BOOKC, :C, null, 'C Book', null);
insert into public.book_briefs (book_id, user_id, topic_text, trim_size, options) values
  (:BOOK1, :A, 'Chair yoga for seniors', '6x9', '{"stance": "Gentle first"}'),
  (:BOOKB, :B, 'Walking', '5x8', '{}');
insert into public.research_insights (book_id, user_id, loves) values (:BOOK1, :A, '[{"text": "Clear steps", "from": ["A review"], "edited": false}]');
insert into public.competitors (user_id, book_id, title) values (:A, :BOOK1, 'Chair Yoga Basics');
insert into public.research_sources (user_id, book_id, kind, body, citation, created_at) values
  (:A, :BOOK1, 'source', 'A 2020 study of 300 adults.', 'Smith 2020', '2026-10-01 10:00+00'),
  (:A, :BOOK1, 'note', 'My own note.', null, '2026-10-01 11:00+00');
insert into public.chapters (id, user_id, book_id, position, kind, title, objective) values
  (:CI, :A, :BOOK1, 1, 'intro', 'Introduction', null),
  (:C1, :A, :BOOK1, 2, 'chapter', 'Getting started', 'Set up the chair'),
  (:C2, :A, :BOOK1, 3, 'chapter', 'Seated twists', null),
  (:CC, :A, :BOOK1, 4, 'conclusion', 'Conclusion', null),
  (:CX, :A, :BOOK2, 1, 'chapter', 'Other book chapter', null),
  (:CB, :B, :BOOKB, 1, 'chapter', 'B chapter', null),
  (:CCC, :C, :BOOKC, 1, 'chapter', 'C chapter', null);
insert into public.sections (id, user_id, chapter_id, position, title, status) values
  (:SI, :A, :CI, 1, 'Why chair yoga', 'final'),
  (:S11, :A, :C1, 1, 'Your chair', 'final'),
  (:S12, :A, :C1, 2, 'Breathing', 'draft'),
  (:S21, :A, :C2, 1, 'Twist one', 'draft'),
  (:S22, :A, :C2, 2, 'Twist two', 'reviewed'),
  (:SC, :A, :CC, 1, 'Keep going', 'final'),
  (:SX, :A, :CX, 1, 'Other', 'draft'),
  (:SY, :A, :CX, 2, 'Edited', 'draft'),
  (:SB, :B, :CB, 1, 'B section', 'draft'),
  (:SCC, :C, :CCC, 1, 'C section', 'draft');
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  (:VI1, :A, :SI, 1, 'Intro text.', 'generate'),
  (:V11A, :A, :S11, 1, 'One.', 'manual'),
  (:V11B, :A, :S11, 2, 'One better.', 'improve'),
  (:V12, :A, :S12, 1, 'Two.', 'manual'),
  (:V22A, :A, :S22, 1, 'Real text.', 'manual'),
  (:V22B, :A, :S22, 2, E'  \n ', 'manual'),
  (:VC, :A, :SC, 1, 'The end.', 'custom'),
  (:VX, :A, :SX, 1, 'Other book text.', 'manual'),
  (:VXR, :A, :SX, 2, 'Other book text.', 'restore'),
  (:VY1, :A, :SY, 1, 'Edited text.', 'manual'),
  (:VY2, :A, :SY, 2, 'Edited text, formatted.', 'edit_format'),
  (:VB, :B, :SB, 1, 'B text.', 'manual'),
  (:VCC, :C, :SCC, 1, 'C text.', 'manual');
update public.sections set current_version_id = :VI1 where id = :SI;
update public.sections set current_version_id = :V11B where id = :S11;
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set current_version_id = :V22B where id = :S22;
update public.sections set current_version_id = :VC where id = :SC;
update public.sections set current_version_id = :VX where id = :SX;
update public.sections set current_version_id = :VY2 where id = :SY;
update public.sections set current_version_id = :VB where id = :SB;
update public.sections set current_version_id = :VCC where id = :SCC;
insert into public.section_drafts (section_id, user_id, content, base_version_id) values
  (:S12, :A, 'Two, and more typing.', :V12),
  (:SC, :A, ' The end. ', :VC);
insert into public.section_runs (section_id, user_id, book_id, run_id, state) values
  (:S21, :A, :BOOK1, gen_random_uuid(), 'running');
insert into public.section_runs (section_id, user_id, book_id, run_id, state, end_reason, ended_at) values
  (:S11, :A, :BOOK1, gen_random_uuid(), 'ended', 'complete', now());
insert into public.user_settings (user_id) values (:A), (:B);

create function pg_temp.nexp(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.book_exports where book_id = b $$;
create function pg_temp.nfmt(b uuid, f text) returns bigint language sql security definer as $$
  select count(*) from public.book_exports where book_id = b and format = f $$;
create function pg_temp.badge(b uuid) returns text language sql as $$
  select coalesce((select changed::text from public.export_badges() where book_id = b), 'none') $$;
grant execute on all functions in schema pg_temp to public;
\set ALL '''{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}'''

-- ── 1. user_settings.display_name ──
select pg_temp.chk('display_name: a nullable text column',
  (select data_type = 'text' and is_nullable = 'YES' from information_schema.columns where table_name = 'user_settings' and column_name = 'display_name'));
:ASA
select pg_temp.expect('a name of 1 character', $q$update public.user_settings set display_name = 'A'$q$, 'OK 1');
select pg_temp.expect('a name of 60 characters', format($q$update public.user_settings set display_name = %L$q$, repeat('n', 60)), 'OK 1');
select pg_temp.expect('a name of 61 characters refused', format($q$update public.user_settings set display_name = %L$q$, repeat('n', 61)), '23514%user_settings_display_name_check%');
select pg_temp.expect('an empty name refused (null means "no name")', $q$update public.user_settings set display_name = ''$q$, '23514%user_settings_display_name_check%');
select pg_temp.expect('a blank name refused', $q$update public.user_settings set display_name = '   '$q$, '23514%user_settings_display_name_check%');
select pg_temp.expect('a name with a space at the start refused (the browser trims)', $q$update public.user_settings set display_name = ' Adnan'$q$, '23514%user_settings_display_name_check%');
select pg_temp.expect('a name with a space at the end refused', $q$update public.user_settings set display_name = 'Adnan '$q$, '23514%user_settings_display_name_check%');
select pg_temp.expect('a name with a space inside works', $q$update public.user_settings set display_name = 'Adnan K'$q$, 'OK 1');
select pg_temp.expect('back to null works', $q$update public.user_settings set display_name = null$q$, 'OK 1');
select pg_temp.expect('the name again', $q$update public.user_settings set display_name = 'Adnan'$q$, 'OK 1');
select pg_temp.err($q$update public.user_settings set monthly_token_limit = 5$q$) is not null as tried_limit \gset
:OWNER
select pg_temp.chk('the limit did not change', (select monthly_token_limit from public.user_settings where user_id = :A) = 2000000);
:ASB
select pg_temp.expect('B cannot rename A', format($q$update public.user_settings set display_name = 'Hacked' where user_id = %L$q$, :A), 'OK 0');
select pg_temp.chk('B does not read A''s name', not exists (select 1 from public.user_settings where display_name = 'Adnan'));
:OWNER
select pg_temp.chk('A''s name is "Adnan"', (select display_name from public.user_settings where user_id = :A) = 'Adnan');

-- ── 2. book_exports: the table ──
select pg_temp.chk('RLS on', (select relrowsecurity from pg_class where oid = 'public.book_exports'::regclass));
select pg_temp.chk('two policies: select and insert',
  (select array_agg(cmd::text order by cmd::text) from pg_policies where tablename = 'book_exports') = array['INSERT', 'SELECT']);
select pg_temp.chk('no update or delete privilege for the API roles',
  not has_table_privilege('authenticated', 'public.book_exports', 'update') and not has_table_privilege('authenticated', 'public.book_exports', 'delete')
  and not has_table_privilege('anon', 'public.book_exports', 'update') and not has_table_privilege('anon', 'public.book_exports', 'delete'));
select pg_temp.chk('guard function: not executable by the API roles',
  not has_function_privilege('authenticated', 'public.book_exports_guard()', 'execute')
  and not has_function_privilege('anon', 'public.book_exports_guard()', 'execute'));
select pg_temp.chk('indexes on user_id and (book_id, created_at)',
  (select count(*) from pg_indexes where tablename = 'book_exports' and indexname in ('book_exports_user_id_idx', 'book_exports_book_created_idx')) = 2);
select pg_temp.chk('the three functions: authenticated only',
  has_function_privilege('authenticated', 'public.export_json(uuid)', 'execute') and not has_function_privilege('anon', 'public.export_json(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.export_badges()', 'execute') and not has_function_privilege('anon', 'public.export_badges()', 'execute')
  and has_function_privilege('authenticated', 'public.usage_month()', 'execute') and not has_function_privilege('anon', 'public.usage_month()', 'execute'));
select pg_temp.chk('the ai_usage (user_id, created_at) index', exists (select 1 from pg_indexes where indexname = 'ai_usage_user_created_idx'));

-- ── 3. book_exports: shape ──
:ASA
select pg_temp.expect('format outside the list refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'pdf', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :VI1), '23514%book_exports_format_check%');
select pg_temp.expect('include outside the list refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'some', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :VI1), '23514%book_exports_include_check%');
select pg_temp.expect('parts with a key missing refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true}', array[%L]::uuid[])$q$, :BOOK1, :VI1), '23514%book_exports_parts_check%');
select pg_temp.expect('parts with an extra key refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false, "x": true}', array[%L]::uuid[])$q$, :BOOK1, :VI1), '23514%book_exports_parts_check%');
select pg_temp.expect('parts with a non-boolean refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', '{"title": "yes", "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array[%L]::uuid[])$q$, :BOOK1, :VI1), '23514%book_exports_parts_check%');
select pg_temp.expect('parts as an array refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', '[]', array[%L]::uuid[])$q$, :BOOK1, :VI1), '23514%book_exports_parts_check%');
select pg_temp.expect('no versions refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, '{}')$q$, :BOOK1, :ALL), '23514%book_exports_versions_check%');
select pg_temp.expect('a null in versions refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, null]::uuid[])$q$, :BOOK1, :ALL, :VI1), '23514%book_exports_versions_check%');
select pg_temp.chk('the 2,000 cap is in the check', (select pg_get_constraintdef(oid) like '%<= 2000%' from pg_constraint where conname = 'book_exports_versions_check'));

-- ── 4. book_exports: the guard ──
select pg_temp.expect('a version twice refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, %L]::uuid[])$q$, :BOOK1, :ALL, :VI1, :VI1), 'P0001 export_version_not_in_book%');
select pg_temp.expect('a version of A''s other book refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, %L]::uuid[])$q$, :BOOK1, :ALL, :VI1, :VX), 'P0001 export_version_not_in_book%');
select pg_temp.expect('B''s version refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :VB), 'P0001 export_version_not_in_book%');
select pg_temp.expect('an id that is no version refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :SI), 'P0001 export_version_not_in_book%');
select pg_temp.expect('A records an export for B''s user id: refused',
  format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions) values (%L, %L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :B, :BOOK1, :ALL, :VI1), 'P0001 export_owner%');
select pg_temp.expect('a book that does not exist refused',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values ('b0000000-0000-4000-8000-0000000000ff', 'docx', 'all', %L, array[%L]::uuid[])$q$, :ALL, :VI1), '42501%');
select pg_temp.expect('A records a DOCX export (sections with text, in book order)',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions, snapshot) values (%L, 'docx', 'all', %L, array[%L, %L, %L, %L]::uuid[], '{"title": "Fake"}')$q$, :BOOK1, :ALL, :VI1, :V11B, :V12, :VC), 'OK 1');
select pg_temp.chk('the row is A''s', (select user_id from public.book_exports) = :A);
select pg_temp.chk('the snapshot comes from the database, not the browser',
  (select snapshot from public.book_exports) = jsonb_build_object('title', 'Chair Yoga for Seniors Over 60', 'subtitle', 'Gentle moves', 'pen_name', 'Nora Hale',
     'trim', '6x9', 'bio_md5', md5('Bio one.'), 'include', 'all', 'parts', :ALL::jsonb),
  (select snapshot::text from public.book_exports));
select pg_temp.expect('A cannot change an export', $q$update public.book_exports set format = 'md'$q$, '42501%');
select pg_temp.expect('A cannot delete an export', $q$delete from public.book_exports$q$, '42501%');
:ASB
select pg_temp.chk('B reads none of A''s exports', (select count(*) from public.book_exports) = 0);
select pg_temp.expect('B cannot record an export of A''s book',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :VI1), '42501%');
select pg_temp.expect('B cannot record A''s versions on B''s book',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :BOOKB, :ALL, :VI1), 'P0001 export_version_not_in_book%');
select pg_temp.expect('B records B''s own export',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :BOOKB, :ALL, :VB), 'OK 1');
select pg_temp.chk('B''s export badge: B''s book only', (select count(*) = 1 and bool_and(book_id = :BOOKB) from public.export_badges()));
:OWNER
select pg_temp.chk('A''s book still has 1 export', pg_temp.nexp(:BOOK1) = 1);
set role anon;
select pg_temp.chk('anon sees 0 rows or is refused',
  coalesce((xpath('/row/n/text()', query_to_xml('select count(*) as n from public.book_exports', false, true, '')))[1]::text, 'denied') in ('0', 'denied'));
:OWNER

-- ── 5. export_json ──
:ASA
select public.export_json(:BOOK1) as j \gset
select pg_temp.chk('book: title, subtitle, pen name, bio, trim',
  (:'j'::jsonb -> 'book') = jsonb_build_object('id', :BOOK1, 'title', 'Chair Yoga for Seniors Over 60', 'subtitle', 'Gentle moves', 'pen_name', 'Nora Hale', 'bio', 'Bio one.', 'trim', '6x9'),
  (:'j'::jsonb -> 'book')::text);
select pg_temp.chk('chapters in order: intro, two chapters, conclusion',
  (select array_agg(e ->> 'kind' order by o) from jsonb_array_elements(:'j'::jsonb -> 'chapters') with ordinality x(e, o)) = array['intro', 'chapter', 'chapter', 'conclusion']);
select pg_temp.chk('a chapter has title and objective',
  (:'j'::jsonb -> 'chapters' -> 1 ->> 'title') = 'Getting started' and (:'j'::jsonb -> 'chapters' -> 1 ->> 'objective') = 'Set up the chair');
select pg_temp.chk('sections in order inside a chapter',
  (select array_agg(e ->> 'title' order by o) from jsonb_array_elements(:'j'::jsonb -> 'chapters' -> 1 -> 'sections') with ordinality x(e, o)) = array['Your chair', 'Breathing']);
select pg_temp.chk('a section: its current version (content, number, partial, words)',
  (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 0 -> 'version') = jsonb_build_object('id', :V11B, 'version_no', 2, 'content', 'One better.', 'partial', false, 'word_count', 2),
  (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 0 -> 'version')::text);
select pg_temp.chk('status and needs_review',
  (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 1 ->> 'status') = 'draft' and (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 1 ->> 'needs_review') = 'false');
select pg_temp.chk('no version: version is null', (:'j'::jsonb -> 'chapters' -> 2 -> 'sections' -> 0 -> 'version') = 'null'::jsonb);
select pg_temp.chk('ai: a Generate version in the history is "draft"', (:'j'::jsonb -> 'chapters' -> 0 -> 'sections' -> 0 ->> 'ai') = 'draft');
select pg_temp.chk('ai: Improve with no Generate is "edits"', (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 0 ->> 'ai') = 'edits');
select pg_temp.chk('ai: Custom with no Generate is "edits"', (:'j'::jsonb -> 'chapters' -> 3 -> 'sections' -> 0 ->> 'ai') = 'edits');
select pg_temp.chk('ai: manual only is "none"', (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 1 ->> 'ai') = 'none');
select pg_temp.chk('ai: Edit and format (the Improve menu) is "edits"', (public.export_json(:BOOK2) -> 'chapters' -> 0 -> 'sections' -> 1 ->> 'ai') = 'edits');
select pg_temp.chk('ai: manual and restore only is "none" (not AI)', (public.export_json(:BOOK2) -> 'chapters' -> 0 -> 'sections' -> 0 ->> 'ai') = 'none');
select pg_temp.chk('unsaved: a draft that differs', (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 1 ->> 'unsaved') = 'true');
select pg_temp.chk('unsaved: a draft equal but for spaces is not', (:'j'::jsonb -> 'chapters' -> 3 -> 'sections' -> 0 ->> 'unsaved') = 'false');
select pg_temp.chk('unsaved: no draft is not', (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 0 ->> 'unsaved') = 'false');
select pg_temp.chk('run: a running Generate gives its times',
  (:'j'::jsonb -> 'chapters' -> 2 -> 'sections' -> 0 -> 'run') ?& array['started_at', 'heartbeat_at']);
select pg_temp.chk('run: an ended run is null', (:'j'::jsonb -> 'chapters' -> 1 -> 'sections' -> 0 -> 'run') = 'null'::jsonb);
select pg_temp.chk('known: the Brief fields and options',
  (:'j'::jsonb -> 'known' -> 'brief' ->> 'topic_text') = 'Chair yoga for seniors' and (:'j'::jsonb -> 'known' -> 'brief' -> 'options' ->> 'stance') = 'Gentle first');
select pg_temp.chk('known: insights, competitors, sources and notes',
  (:'j'::jsonb -> 'known' -> 'research' -> 'insights' -> 'loves' -> 0 ->> 'text') = 'Clear steps'
  and (:'j'::jsonb -> 'known' -> 'research' -> 'competitors' -> 0 ->> 'title') = 'Chair Yoga Basics'
  and jsonb_array_length(:'j'::jsonb -> 'known' -> 'research' -> 'sources') = 2
  and (:'j'::jsonb -> 'known' -> 'research' -> 'sources' -> 0 ->> 'citation') = 'Smith 2020');
select pg_temp.chk('now: the server time', (:'j'::jsonb ->> 'now')::timestamptz <= now() + interval '1 second');
select pg_temp.chk('a book with no Brief and no pen name still reads',
  (public.export_json(:BOOK2) -> 'book' ->> 'trim') is null and (public.export_json(:BOOK2) -> 'chapters' -> 0 -> 'sections' -> 0 -> 'version' ->> 'content') = 'Other book text.');
select pg_temp.chk('a book that does not exist: null', public.export_json('b0000000-0000-4000-8000-0000000000ff') is null);
:ASB
select pg_temp.chk('B reads A''s book as null', public.export_json(:BOOK1) is null);
:OWNER
set role anon;
select pg_temp.expect('anon cannot call export_json', format('select public.export_json(%L)', :BOOK1), '42501%');
select pg_temp.expect('anon cannot call export_badges', 'select public.export_badges()', '42501%');
select pg_temp.expect('anon cannot call usage_month', 'select public.usage_month()', '42501%');
:OWNER

-- ── 6. export_badges: the "changed" rule ──
:ASA
select pg_temp.chk('fresh right after the export', pg_temp.badge(:BOOK1) = 'false', pg_temp.badge(:BOOK1));
select pg_temp.chk('a book with no export has no badge', pg_temp.badge(:BOOK2) = 'none');
select pg_temp.chk('exported_at is the export time', (select exported_at from public.export_badges() where book_id = :BOOK1) = (select created_at from public.book_exports where book_id = :BOOK1));
select pg_temp.chk('A sees only A''s badges', (select count(*) from public.export_badges()) = 1);
select pg_temp.expect('a Markdown export later', format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'md', 'all', %L, array[%L]::uuid[])$q$, :BOOK1, :ALL, :VI1), 'OK 1');
select pg_temp.chk('Markdown does not drive the badge (still the DOCX, still fresh)', pg_temp.badge(:BOOK1) = 'false');
:OWNER
-- A new current version.
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values (:V12R, :A, :S12, 2, 'Two.', 'restore');
update public.sections set current_version_id = :V12R where id = :S12;
:ASA
select pg_temp.chk('changed: a new current version (a restore with the same text too)', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set current_version_id = :V12 where id = :S12;
:ASA
select pg_temp.chk('fresh again with the exported version back', pg_temp.badge(:BOOK1) = 'false');
:OWNER
update public.books set title = 'Chair Yoga' where id = :BOOK1;
:ASA
select pg_temp.chk('changed: the title', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.books set title = 'Chair Yoga for Seniors Over 60', subtitle = 'Gentle moves, new' where id = :BOOK1;
:ASA
select pg_temp.chk('changed: the subtitle', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.books set subtitle = 'Gentle moves' where id = :BOOK1;
update public.book_briefs set trim_size = '5x8' where book_id = :BOOK1;
:ASA
select pg_temp.chk('changed: the trim size', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.book_briefs set trim_size = '6x9' where book_id = :BOOK1;
update public.pen_names set name = 'Nora H.' where id = :P1;
:ASA
select pg_temp.chk('changed: the pen name', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.pen_names set name = 'Nora Hale', bio_text = 'Bio two.' where id = :P1;
:ASA
select pg_temp.chk('not changed: the bio, when About the author was off', pg_temp.badge(:BOOK1) = 'false');
:OWNER
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values (:V21, :A, :S21, 1, 'Twist one text.', 'manual');
update public.sections set current_version_id = :V21 where id = :S21;
:ASA
select pg_temp.chk('changed: a section that had no text now has text', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set current_version_id = null where id = :S21;
update public.sections set current_version_id = :V22A where id = :S22;
:ASA
select pg_temp.chk('changed: a blank section gets its text back', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set current_version_id = :V22B where id = :S22;
:ASA
select pg_temp.chk('fresh: everything as exported', pg_temp.badge(:BOOK1) = 'false');

-- About the author on: the bio counts.
select pg_temp.expect('a DOCX export with About the author',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, %L, %L, %L]::uuid[])$q$,
    :BOOK1, '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": true}', :VI1, :V11B, :V12, :VC), 'OK 1');
select pg_temp.chk('the newest DOCX decides: fresh', pg_temp.badge(:BOOK1) = 'false');
:OWNER
update public.pen_names set bio_text = 'Bio three.' where id = :P1;
:ASA
select pg_temp.chk('changed: the bio, when About the author was on', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.pen_names set bio_text = 'Bio two.' where id = :P1;

-- Final only.
:ASA
select pg_temp.expect('a DOCX export of Final sections only',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'final', %L, array[%L, %L, %L]::uuid[])$q$, :BOOK1, :ALL, :VI1, :V11B, :VC), 'OK 1');
select pg_temp.chk('final: fresh', pg_temp.badge(:BOOK1) = 'false');
:OWNER
insert into public.section_versions (user_id, section_id, version_no, content, source) values (:A, :S12, 3, 'Two, rewritten.', 'manual');
update public.sections set current_version_id = (select id from public.section_versions where section_id = :S12 and version_no = 3) where id = :S12;
:ASA
select pg_temp.chk('final: a new version of a Draft section does not change it', pg_temp.badge(:BOOK1) = 'false');
:OWNER
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set status = 'final' where id = :S12;
:ASA
select pg_temp.chk('final: a section turned Final changes it', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set status = 'draft' where id = :S12;
update public.sections set status = 'reviewed' where id = :S11;
:ASA
select pg_temp.chk('final: a Final section that is no longer Final changes it', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set status = 'final' where id = :S11;

-- Introduction off.
:ASA
select pg_temp.expect('a DOCX export without the Introduction',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, %L, %L]::uuid[])$q$,
    :BOOK1, '{"title": true, "copyright": true, "contents": true, "intro": false, "conclusion": true, "about": false}', :V11B, :V12, :VC), 'OK 1');
select pg_temp.chk('intro off: fresh', pg_temp.badge(:BOOK1) = 'false');
:OWNER
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values (:VIN, :A, :SI, 2, 'New intro.', 'manual');
update public.sections set current_version_id = :VIN where id = :SI;
:ASA
select pg_temp.chk('intro off: a new Introduction version does not change it', pg_temp.badge(:BOOK1) = 'false');
:OWNER
update public.sections set current_version_id = :V12R where id = :S12;
:ASA
select pg_temp.chk('intro off: a chapter section still does', pg_temp.badge(:BOOK1) = 'true');
:OWNER
update public.sections set current_version_id = :V12 where id = :S12;

-- ── 7. The newest 20 per book and format ──
select pg_temp.chk('before: book 1 has 4 DOCX and 1 Markdown export', pg_temp.nfmt(:BOOK1, 'docx') = 4 and pg_temp.nfmt(:BOOK1, 'md') = 1,
  pg_temp.nfmt(:BOOK1, 'docx') || ' docx, ' || pg_temp.nfmt(:BOOK1, 'md') || ' md');
:ASA
select pg_temp.expect('book 2: one DOCX export',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions) values (%L, 'docx', 'all', %L, array[%L, %L]::uuid[])$q$, :BOOK2, :ALL, :VX, :VY2), 'OK 1');
select pg_temp.chk('book 2: its badge is fresh', pg_temp.badge(:BOOK2) = 'false', pg_temp.badge(:BOOK2));
select format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'md', 'all', %L, array[%L]::uuid[], %L)$q$,
              :BOOK2, :ALL, :VX, timestamptz '2030-01-01 00:00+00' + n * interval '1 minute')
  from generate_series(1, 20) n \gexec
select pg_temp.chk('book 2: 1 DOCX then 20 Markdown: all 21 kept', pg_temp.nfmt(:BOOK2, 'docx') = 1 and pg_temp.nfmt(:BOOK2, 'md') = 20,
  pg_temp.nfmt(:BOOK2, 'docx') || ' docx, ' || pg_temp.nfmt(:BOOK2, 'md') || ' md');
select pg_temp.chk('book 2: the DOCX badge is still there and fresh', pg_temp.badge(:BOOK2) = 'false', pg_temp.badge(:BOOK2));
select pg_temp.expect('book 2: a 21st Markdown export',
  format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'md', 'all', %L, array[%L]::uuid[], '2031-01-01 00:00+00')$q$, :BOOK2, :ALL, :VX), 'OK 1');
:OWNER
select pg_temp.chk('book 2: Markdown pruned to 20, the oldest Markdown gone, the DOCX kept',
  pg_temp.nfmt(:BOOK2, 'md') = 20 and pg_temp.nfmt(:BOOK2, 'docx') = 1
  and not exists (select 1 from public.book_exports where book_id = :BOOK2 and created_at = timestamptz '2030-01-01 00:01+00'),
  pg_temp.nfmt(:BOOK2, 'docx') || ' docx, ' || pg_temp.nfmt(:BOOK2, 'md') || ' md');
:ASA
select pg_temp.chk('book 2: the badge is still there', pg_temp.badge(:BOOK2) = 'false', pg_temp.badge(:BOOK2));
select format($q$insert into public.book_exports (book_id, format, include, parts, versions, created_at) values (%L, 'docx', 'all', %L, array[%L, %L, %L]::uuid[], %L)$q$,
              :BOOK1, :ALL, :V11B, :V12, :VC, timestamptz '2030-01-01 00:00+00' + n * interval '1 minute')
  from generate_series(1, 17) n \gexec
:OWNER
select pg_temp.chk('book 1: 21 DOCX recorded, 20 kept; its 1 Markdown untouched', pg_temp.nfmt(:BOOK1, 'docx') = 20 and pg_temp.nfmt(:BOOK1, 'md') = 1,
  pg_temp.nfmt(:BOOK1, 'docx') || ' docx, ' || pg_temp.nfmt(:BOOK1, 'md') || ' md');
select pg_temp.chk('book 1: the oldest DOCX was removed',
  not exists (select 1 from public.book_exports where book_id = :BOOK1 and snapshot ->> 'include' = 'all' and format = 'docx' and parts ->> 'about' = 'false' and parts ->> 'intro' = 'true' and created_at < '2030-01-01'));
select pg_temp.chk('B''s export is untouched', pg_temp.nexp(:BOOKB) = 1);

-- ── 8. Cascades ──
insert into public.book_exports (user_id, book_id, format, include, parts, versions) values (:A, :BOOK2, 'docx', 'all', :ALL, array[:VX, :VY2]::uuid[]);
insert into public.book_exports (user_id, book_id, format, include, parts, versions) values (:C, :BOOKC, 'docx', 'all', :ALL, array[:VCC]::uuid[]);
select pg_temp.chk('the owner (no RLS) records exports too, through the same guard', pg_temp.nfmt(:BOOK2, 'docx') = 2 and pg_temp.nexp(:BOOKC) = 1);
select pg_temp.expect('the owner cannot record an export for another user''s book',
  format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions) values (%L, %L, 'docx', 'all', %L, array[%L]::uuid[])$q$, :B, :BOOK2, :ALL, :VX), 'P0001 export_owner%');
delete from public.books where id = :BOOK2;
select pg_temp.chk('a deleted book takes its exports', pg_temp.nexp(:BOOK2) = 0);
delete from auth.users where id = :C;
select pg_temp.chk('a deleted user takes their exports', pg_temp.nexp(:BOOKC) = 0);

-- ── 9. usage_month ──
insert into public.ai_usage (user_id, book_id, stage, model, input_tokens, output_tokens, status, counted, created_at) values
  (:A, :BOOK1, 'section_write', 'claude-sonnet-5-5', 100, 200, 'ok', true, now()),
  (:A, :BOOK1, 'section_write', 'claude-sonnet-5-5', 100, 200, 'stopped', true, now()),
  (:A, :BOOK1, 'section_improve', 'claude-sonnet-5-5', 10, 20, 'ok', true, now()),
  (:A, null, 'bio', 'claude-sonnet-5-5', 1, 2, 'ok', true, now()),
  (:A, :BOOK1, 'section_write', 'claude-sonnet-5-5', 1000, 1000, 'failed', false, now()),
  (:A, :BOOK1, 'section_write', 'claude-sonnet-5-5', 5000, 5000, 'ok', true, date_trunc('month', now() at time zone 'utc') at time zone 'utc' - interval '1 second'),
  (:B, :BOOKB, 'section_write', 'claude-sonnet-5-5', 7, 7, 'ok', true, now());
update public.user_settings set monthly_token_limit = 1000000 where user_id = :A;
:ASA
select public.usage_month() as u \gset
select pg_temp.chk('tokens: counted rows of this month only (630 + 3)', (:'u'::jsonb ->> 'tokens')::bigint = 633, :'u'::jsonb ->> 'tokens');
select pg_temp.chk('limit: the user''s own', (:'u'::jsonb ->> 'limit')::bigint = 1000000);
select pg_temp.chk('month_start: the 1st, 00:00 UTC', (:'u'::jsonb ->> 'month_start')::timestamptz = date_trunc('month', now() at time zone 'utc') at time zone 'utc');
select pg_temp.chk('resets: the 1st of next month, UTC', (:'u'::jsonb ->> 'resets')::timestamptz = (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc');
select pg_temp.chk('by_stage: most tokens first, calls, input and output',
  (:'u'::jsonb -> 'by_stage' -> 0) = '{"stage": "section_write", "model": "claude-sonnet-5-5", "calls": 2, "input": 200, "output": 400}'::jsonb
  and (:'u'::jsonb -> 'by_stage' -> 1 ->> 'stage') = 'section_improve'
  and (:'u'::jsonb -> 'by_stage' -> 2 ->> 'stage') = 'bio'
  and jsonb_array_length(:'u'::jsonb -> 'by_stage') = 3,
  (:'u'::jsonb -> 'by_stage')::text);
:ASB
select pg_temp.chk('B: only B''s tokens', (public.usage_month() ->> 'tokens')::bigint = 14);
:OWNER
delete from public.user_settings where user_id = :B;
:ASB
select pg_temp.chk('no settings row yet: the default limit', (public.usage_month() ->> 'limit')::bigint = 2000000);
:OWNER
set request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000ff';
set role authenticated;
select pg_temp.chk('a user with no rows: 0 tokens and an empty list',
  (public.usage_month() ->> 'tokens')::int = 0 and public.usage_month() -> 'by_stage' = '[]'::jsonb);
:OWNER
