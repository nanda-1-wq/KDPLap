-- 0028 quality control (E14.1): export_json word_target, qc_versions,
-- qc_inputs_key (what changes it and what does not), qc_runs (shape, RLS, the
-- guard: owner, stale, newest 5), qc_dismissed (shape, RLS, the guard: owner,
-- section, limit), book_checks (server only, the guard, shape, cascades),
-- qc_mark, qc_json and the grants.
-- Run: supabase/tests/sql/run.sh t0028.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set C '''00000000-0000-4000-8000-00000000000c'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set SVC 'reset request.jwt.claim.sub; set role service_role;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''
\set BOOKC '''b0000000-0000-4000-8000-00000000000c'''
\set CI '''c0000000-0000-4000-8000-000000000001'''
\set C1 '''c0000000-0000-4000-8000-000000000002'''
\set C2 '''c0000000-0000-4000-8000-000000000003'''
\set CX '''c0000000-0000-4000-8000-000000000004'''
\set C3 '''c0000000-0000-4000-8000-000000000005'''
\set C4 '''c0000000-0000-4000-8000-000000000006'''
\set CB '''c0000000-0000-4000-8000-00000000000b'''
\set CC '''c0000000-0000-4000-8000-00000000000c'''
\set SI '''d0000000-0000-4000-8000-000000000001'''
\set S11 '''d0000000-0000-4000-8000-000000000002'''
\set S12 '''d0000000-0000-4000-8000-000000000003'''
\set S13 '''d0000000-0000-4000-8000-000000000004'''
\set S21 '''d0000000-0000-4000-8000-000000000005'''
\set S22 '''d0000000-0000-4000-8000-000000000006'''
\set SX '''d0000000-0000-4000-8000-000000000007'''
\set S31 '''d0000000-0000-4000-8000-000000000008'''
\set S41 '''d0000000-0000-4000-8000-000000000009'''
\set S42 '''d0000000-0000-4000-8000-00000000000a'''
\set SB '''d0000000-0000-4000-8000-00000000000b'''
\set SC '''d0000000-0000-4000-8000-00000000000c'''
\set VI '''f0000000-0000-4000-8000-000000000001'''
\set V11 '''f0000000-0000-4000-8000-000000000002'''
\set V12 '''f0000000-0000-4000-8000-000000000003'''
\set V21 '''f0000000-0000-4000-8000-000000000004'''
\set V22 '''f0000000-0000-4000-8000-000000000005'''
\set VX '''f0000000-0000-4000-8000-000000000006'''
\set V31 '''f0000000-0000-4000-8000-000000000007'''
\set V41 '''f0000000-0000-4000-8000-000000000008'''
\set VB '''f0000000-0000-4000-8000-00000000000b'''
\set VC '''f0000000-0000-4000-8000-00000000000c'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B), (:C);
insert into public.books (id, user_id, title, subtitle) values
  (:BOOK1, :A, 'Chair Yoga for Seniors', 'Gentle moves'),
  (:BOOK2, :A, 'Second Book', null),
  (:BOOK3, :A, 'Empty Book', null),
  (:BOOK4, :A, 'Nothing here', null),
  (:BOOKB, :B, 'B Book', null),
  (:BOOKC, :C, 'C Book', null);
insert into public.book_briefs (book_id, user_id, topic_text, target_reader, reader_problem, promise_draft, trim_size, options) values
  (:BOOK1, :A, 'Chair yoga', 'Seniors', 'Stiff joints', 'Move with ease', '6x9', '{"stance": "s", "standout": "t", "references": "r"}');
insert into public.research_insights (book_id, user_id, loves, hates, gaps) values
  (:BOOK1, :A, '[{"text": "Clear photos", "from": ["A review"], "edited": false}]', '[]', '[]');
insert into public.competitors (user_id, book_id, title) values (:A, :BOOK1, 'Yoga Now');
insert into public.research_sources (user_id, book_id, kind, body, citation) values
  (:A, :BOOK1, 'source', 'Half of adults sit too long.', 'Smith 2021');
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points) values
  (:BOOK1, :A, 'A gentle guide.', 'Move with ease.', 'Short daily moves.', '["Photos"]', '["Large print"]');
insert into public.chapters (id, user_id, book_id, position, kind, title, objective) values
  (:CI, :A, :BOOK1, 1, 'intro', 'Introduction', null),
  (:C1, :A, :BOOK1, 2, 'chapter', 'Getting started', 'Set up the chair.'),
  (:C2, :A, :BOOK1, 3, 'chapter', 'Seated twists', 'Learn two twists.'),
  (:CX, :A, :BOOK1, 4, 'conclusion', 'Conclusion', null),
  (:C3, :A, :BOOK2, 1, 'chapter', 'Other', null),
  (:C4, :A, :BOOK2, 2, 'chapter', 'Other two', null),
  (:CB, :B, :BOOKB, 1, 'chapter', 'B chapter', null),
  (:CC, :C, :BOOKC, 1, 'chapter', 'C chapter', null);
insert into public.sections (id, user_id, chapter_id, position, title, status, word_target) values
  (:SI, :A, :CI, 1, 'Why chair yoga', 'final', null),
  (:S11, :A, :C1, 1, 'The chair', 'final', 500),
  (:S12, :A, :C1, 2, 'Breathing', 'draft', null),
  (:S13, :A, :C1, 3, 'Not written', 'not_started', null),
  (:S21, :A, :C2, 2, 'Twist two', 'reviewed', null),
  (:S22, :A, :C2, 1, 'Blank text', 'final', null),
  (:SX, :A, :CX, 1, 'The end', 'final', null),
  (:S31, :A, :C3, 1, 'Other one', 'draft', null),
  (:S41, :A, :C4, 1, 'Other two', 'draft', null),
  (:S42, :A, :C4, 2, 'No version', 'not_started', null),
  (:SB, :B, :CB, 1, 'B section', 'draft', null),
  (:SC, :C, :CC, 1, 'C section', 'draft', null);
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  (:VI, :A, :SI, 1, 'Intro text.', 'manual'),
  (:V11, :A, :S11, 1, 'Chair text.', 'manual'),
  (:V12, :A, :S12, 1, 'Breathing text.', 'manual'),
  (:V21, :A, :S21, 1, 'Twist text.', 'manual'),
  (:V22, :A, :S22, 1, E' \n\t ', 'manual'),
  (:VX, :A, :SX, 1, 'The end text.', 'manual'),
  (:V31, :A, :S31, 1, 'Other text.', 'manual'),
  (:V41, :A, :S41, 1, 'Other two text.', 'manual'),
  (:VB, :B, :SB, 1, 'B text.', 'manual'),
  (:VC, :C, :SC, 1, 'C text.', 'manual');
update public.sections set current_version_id = :VI where id = :SI;
update public.sections set current_version_id = :V11 where id = :S11;
update public.sections set current_version_id = :V12 where id = :S12;
update public.sections set current_version_id = :V21 where id = :S21;
update public.sections set current_version_id = :V22 where id = :S22;
update public.sections set current_version_id = :VX where id = :SX;
update public.sections set current_version_id = :V31 where id = :S31;
update public.sections set current_version_id = :V41 where id = :S41;
update public.sections set current_version_id = :VB where id = :SB;
update public.sections set current_version_id = :VC where id = :SC;

-- Runs q, then compares the key of book 1 with the key before it.
create function pg_temp.key() returns text language sql as $$
  select public.qc_inputs_key('b0000000-0000-4000-8000-000000000001') $$;
create function pg_temp.vers() returns uuid[] language sql as $$
  select public.qc_versions('b0000000-0000-4000-8000-000000000001') $$;
-- The key changes.
create function pg_temp.changes(name text, q text) returns text language plpgsql as $$
declare k0 text := pg_temp.key(); got text;
begin
  got := pg_temp.err(q);
  return pg_temp.chk('key changes on: ' || name, got like 'OK%' and got <> 'OK 0' and pg_temp.key() is distinct from k0, got);
end $$;
-- Neither the key nor the version list changes.
create function pg_temp.stays(name text, q text) returns text language plpgsql as $$
declare k0 text := pg_temp.key(); v0 uuid[] := pg_temp.vers(); got text;
begin
  got := pg_temp.err(q);
  return pg_temp.chk('key stays on: ' || name, got like 'OK%' and got <> 'OK 0' and pg_temp.key() is not distinct from k0 and pg_temp.vers() = v0,
                     got || ' key ' || (pg_temp.key() is not distinct from k0)::text || ' versions ' || (pg_temp.vers() = v0)::text);
end $$;
-- A run row for a book, with today's list and key.
create function pg_temp.ins(results jsonb default '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}',
                            book uuid default 'b0000000-0000-4000-8000-000000000001') returns text language sql as $$
  select format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, %L, %L, %L, 5, 100, 'classic')$q$,
                book, public.qc_versions(book), public.qc_inputs_key(book), results::text) $$;
-- results with one item, the good item with a patch; d removes one key.
create function pg_temp.item(patch jsonb default '{}', d text default null) returns jsonb language sql as $$
  select jsonb_build_object('items', jsonb_build_array((
           '{"g": 1, "rule": "not_final", "key": "s|v", "section_id": "d0000000-0000-4000-8000-000000000002",
             "version_id": "f0000000-0000-4000-8000-000000000002", "start": 0, "end": 5, "message": "Not Final yet", "quote": "Chair"}'::jsonb || patch) - coalesce(d, '')),
           'more', '{}'::jsonb, 'sources', '[]'::jsonb, 'notes', '{"unsaved": 0, "running": 0}'::jsonb) $$;
-- results with the good empty shape, patched at the top level.
create function pg_temp.res(patch jsonb default '{}', d text default null) returns jsonb language sql as $$
  select ('{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}'::jsonb || patch) - coalesce(d, '') $$;
-- A book_checks insert: the good row with a patch.
create function pg_temp.bc(patch jsonb default '{}', tail text default '') returns text language sql as $$
  select format($q$insert into public.book_checks (chapter_id, user_id, book_id, verdict, reason, quote, section_id, unsourced, versions, words, inputs_key, checked_at)
                   select chapter_id, user_id, book_id, verdict, reason, quote, section_id, unsourced, versions, words, inputs_key, checked_at
                     from jsonb_populate_record(null::public.book_checks, %L::jsonb) %s$q$,
                ('{"chapter_id": "c0000000-0000-4000-8000-000000000002", "user_id": "00000000-0000-4000-8000-00000000000a",
                   "book_id": "b0000000-0000-4000-8000-000000000001", "verdict": "drifts", "reason": "It adds a new audience.",
                   "quote": "Chair text", "section_id": "d0000000-0000-4000-8000-000000000002", "unsourced": [],
                   "versions": ["f0000000-0000-4000-8000-000000000002", "f0000000-0000-4000-8000-000000000003"],
                   "words": 100, "inputs_key": "0123456789abcdef", "checked_at": "2026-11-05T10:00:00+00:00"}'::jsonb || patch)::text, tail) $$;
grant execute on all functions in schema pg_temp to public;

-- ── 1. Tables: RLS, policies, privileges ──
select pg_temp.chk(t || ': RLS on', (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass))
  from unnest(array['qc_runs', 'qc_dismissed', 'book_checks']) t order by t;
select pg_temp.chk('qc_runs: select and insert policies', (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'qc_runs') = array['INSERT', 'SELECT']);
select pg_temp.chk('qc_dismissed: select, insert and delete policies', (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'qc_dismissed') = array['DELETE', 'INSERT', 'SELECT']);
select pg_temp.chk('book_checks: a select policy only', (select array_agg(cmd::text order by cmd) from pg_policies where tablename = 'book_checks') = array['SELECT']);
select pg_temp.chk(r || ' has no ' || p || ' on qc_runs', not has_table_privilege(r, 'public.qc_runs', p))
  from unnest(array['anon', 'authenticated']) r, unnest(array['update', 'delete', 'truncate']) p order by r, p;
select pg_temp.chk('anon has no insert on qc_runs', not has_table_privilege('anon', 'public.qc_runs', 'insert'));
select pg_temp.chk('authenticated may insert into qc_runs', has_table_privilege('authenticated', 'public.qc_runs', 'insert'));
select pg_temp.chk(r || ' has no ' || p || ' on qc_dismissed', not has_table_privilege(r, 'public.qc_dismissed', p))
  from unnest(array['anon', 'authenticated']) r, unnest(array['update', 'truncate']) p order by r, p;
select pg_temp.chk(r || ' has no ' || p || ' on book_checks', not has_table_privilege(r, 'public.book_checks', p))
  from unnest(array['anon', 'authenticated']) r, unnest(array['insert', 'update', 'delete', 'truncate']) p order by r, p;

-- ── 2. export_json: word_target ──
:ASA
select pg_temp.chk('export_json: the section keys are the 0025 keys plus word_target',
  (select array_agg(k order by k) from jsonb_object_keys(public.export_json(:BOOK1) -> 'chapters' -> 1 -> 'sections' -> 0) k)
  = array['ai', 'id', 'needs_review', 'position', 'run', 'status', 'title', 'unsaved', 'version', 'word_target']);
select pg_temp.chk('export_json: top keys unchanged',
  (select array_agg(k order by k) from jsonb_object_keys(public.export_json(:BOOK1)) k) = array['book', 'chapters', 'known', 'now']);
select pg_temp.chk('export_json: chapter keys unchanged',
  (select array_agg(k order by k) from jsonb_object_keys(public.export_json(:BOOK1) -> 'chapters' -> 1) k)
  = array['id', 'kind', 'needs_review', 'objective', 'position', 'sections', 'title']);
select pg_temp.chk('export_json: word_target 500', public.export_json(:BOOK1) #>> '{chapters,1,sections,0,word_target}' = '500');
select pg_temp.chk('export_json: word_target null when not set', public.export_json(:BOOK1) #> '{chapters,1,sections,1,word_target}' = 'null'::jsonb);
select pg_temp.chk('export_json: every section has the key',
  (select bool_and(s ? 'word_target') from jsonb_array_elements(public.export_json(:BOOK1) -> 'chapters') c, jsonb_array_elements(c -> 'sections') s));

-- ── 3. qc_versions ──
select pg_temp.chk('qc_versions: book order, blank and unwritten out, every kind, any status',
  public.qc_versions(:BOOK1) = array[:VI, :V11, :V12, :V21, :VX]::uuid[], public.qc_versions(:BOOK1)::text);
select pg_temp.chk('qc_versions: empty for a book with no text', public.qc_versions(:BOOK3) = '{}'::uuid[]);
select pg_temp.chk('qc_versions: empty for another user''s book', public.qc_versions(:BOOKB) = '{}'::uuid[]);
:OWNER
update public.sections set position = case when id = :S11 then 2 else 1 end where id in (:S11, :S12);
select pg_temp.chk('qc_versions: follows the section position', pg_temp.vers() = array[:VI, :V12, :V11, :V21, :VX]::uuid[], pg_temp.vers()::text);
update public.sections set position = case when id = :S11 then 1 else 2 end where id in (:S11, :S12);
update public.chapters set position = case when id = :C1 then 3 else 2 end where id in (:C1, :C2);
select pg_temp.chk('qc_versions: follows the chapter position', pg_temp.vers() = array[:VI, :V21, :V11, :V12, :VX]::uuid[], pg_temp.vers()::text);
update public.chapters set position = case when id = :C1 then 2 else 3 end where id in (:C1, :C2);

-- ── 4. qc_inputs_key: what changes it ──
select pg_temp.chk('qc_inputs_key: md5', pg_temp.key() ~ '^[0-9a-f]{32}$', pg_temp.key());
:ASB
select pg_temp.expect('qc_inputs_key: null for another user''s book', format($q$select 1 where public.qc_inputs_key(%L) is null$q$, :BOOK1), 'OK 1');
:OWNER
select pg_temp.expect('qc_inputs_key: null for no book', $q$select 1 where public.qc_inputs_key('b0000000-0000-4000-8000-0000000000ff') is null$q$, 'OK 1');
select pg_temp.changes('a status', format($q$update public.sections set status = 'final' where id = %L$q$, :S12));
select pg_temp.changes('a section needs_review', format($q$update public.sections set needs_review = true where id = %L$q$, :S12));
select pg_temp.changes('a chapter needs_review', format($q$update public.chapters set needs_review = true where id = %L$q$, :C1));
select pg_temp.changes('a book title', format($q$update public.books set title = 'New title' where id = %L$q$, :BOOK1));
select pg_temp.changes('a book subtitle', format($q$update public.books set subtitle = 'New subtitle' where id = %L$q$, :BOOK1));
select pg_temp.changes('a chapter title', format($q$update public.chapters set title = 'New chapter' where id = %L$q$, :C1));
select pg_temp.changes('a chapter objective (knownOf reads it)', format($q$update public.chapters set objective = 'New aim' where id = %L$q$, :C1));
select pg_temp.changes('a section title', format($q$update public.sections set title = 'New section' where id = %L$q$, :S11));
select pg_temp.changes('a word target', format($q$update public.sections set word_target = 900 where id = %L$q$, :S11));
select pg_temp.changes('a word target cleared', format($q$update public.sections set word_target = null where id = %L$q$, :S11));
select pg_temp.changes('a new section', format($q$insert into public.sections (user_id, chapter_id, position, title) values (%L, %L, 9, 'Added')$q$, :A, :C1));
select pg_temp.changes('a new chapter', format($q$insert into public.chapters (user_id, book_id, position, kind, title) values (%L, %L, 9, 'chapter', 'Added')$q$, :A, :BOOK1));
select pg_temp.changes('a chapter order', format($q$update public.chapters set position = case when id = %L then 3 else 2 end where id in (%L, %L)$q$, :C1, :C1, :C2));
select pg_temp.changes('a section order', format($q$update public.sections set position = case when id = %L then 2 else 1 end where id in (%L, %L)$q$, :S11, :S11, :S12));
select pg_temp.changes('trim', format($q$update public.book_briefs set trim_size = '5x8' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief topic', format($q$update public.book_briefs set topic_text = 'Chair yoga two' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief reader', format($q$update public.book_briefs set target_reader = 'Older adults' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief problem', format($q$update public.book_briefs set reader_problem = 'Stiff hips' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief promise', format($q$update public.book_briefs set promise_draft = 'Move more' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief stance', format($q$update public.book_briefs set options = options || '{"stance": "s2"}' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief stand-out', format($q$update public.book_briefs set options = options || '{"standout": "t2"}' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('Brief references', format($q$update public.book_briefs set options = options || '{"references": "r2"}' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('a research source added', format($q$insert into public.research_sources (user_id, book_id, kind, body) values (%L, %L, 'note', 'A note')$q$, :A, :BOOK1));
select pg_temp.changes('a research source body', format($q$update public.research_sources set body = 'Edited' where book_id = %L and kind = 'note'$q$, :BOOK1));
select pg_temp.changes('a research source citation', format($q$update public.research_sources set citation = 'Jones 2020' where book_id = %L and kind = 'source'$q$, :BOOK1));
select pg_temp.changes('a research source kind', format($q$update public.research_sources set kind = 'note' where book_id = %L and citation = 'Jones 2020'$q$, :BOOK1));
select pg_temp.changes('a research source removed', format($q$delete from public.research_sources where book_id = %L and citation is null$q$, :BOOK1));
select pg_temp.changes('an insight: loves', format($q$update public.research_insights set loves = '[{"text": "Big print", "from": ["A review"], "edited": false}]' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('an insight: hates', format($q$update public.research_insights set hates = '[{"text": "Small print", "from": ["A review"], "edited": false}]' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('an insight: gaps', format($q$update public.research_insights set gaps = '[{"text": "No plan", "from": ["A review"], "edited": false}]' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('a competitor title', format($q$update public.competitors set title = 'Yoga Later' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('a competitor added', format($q$insert into public.competitors (user_id, book_id, title) values (%L, %L, 'Second')$q$, :A, :BOOK1));
select pg_temp.changes('the positioning sentence', format($q$update public.positioning set one_sentence = 'A kind guide.' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('the reader promise', format($q$update public.positioning set reader_promise = 'Feel better.' where book_id = %L$q$, :BOOK1));
update public.positioning set drift_checked_at = now() where book_id = :BOOK1;
select pg_temp.changes('a lock', format($q$update public.positioning set locked_at = now() where book_id = %L$q$, :BOOK1));
create temp table tz_key as select pg_temp.key() as k;
grant select on tz_key to public;
set time zone 'Asia/Tokyo';
select pg_temp.chk('qc_inputs_key: the same in another session time zone, with a lock time', pg_temp.key() = (select k from tz_key));
set time zone 'UTC';
:ASA
select pg_temp.changes('an unlock', format($q$select public.unlock_positioning(%L)$q$, :BOOK1));
:OWNER
select pg_temp.stays('the first 08 row, with defaults', format($q$insert into public.book_formats (book_id, user_id) values (%L, %L)$q$, :BOOK1, :A));
select pg_temp.changes('08 style', format($q$update public.book_formats set style = 'modern' where book_id = %L$q$, :BOOK1));
select pg_temp.changes('08 copyright part', format($q$update public.book_formats set parts = parts || '{"copyright": false}' where book_id = %L$q$, :BOOK1));

-- ── 5. qc_inputs_key: what does not change it ──
:ASA
select pg_temp.stays('a draft', format($q$insert into public.section_drafts (section_id, content, base_version_id) values (%L, 'Typing', %L)$q$, :S11, :V11));
:OWNER
select pg_temp.stays('a Generate run', format($q$insert into public.section_runs (section_id, user_id, book_id, run_id, state, base_version_id) values (%L, %L, %L, 'a7000000-0000-4000-8000-000000000001', 'running', %L)$q$, :S21, :A, :BOOK1, :V21));
select pg_temp.stays('a run heartbeat', format($q$update public.section_runs set heartbeat_at = now() + interval '1 second' where section_id = %L$q$, :S21));
select pg_temp.stays('a kept finding', format($q$insert into public.kept_findings (user_id, section_id, type, message, quote) values (%L, %L, 'drift', 'Kept', 'Chair text')$q$, :A, :S11));
select pg_temp.stays('a dismissal', format($q$insert into public.qc_dismissed (user_id, book_id, rule, issue_key, label) values (%L, %L, 'length', 'length', 'Short book')$q$, :A, :BOOK1));
select pg_temp.stays('a book_checks upsert', pg_temp.bc());
select pg_temp.stays('an ai_usage row', format($q$insert into public.ai_usage (user_id, book_id, stage, model, input_tokens, output_tokens, status, counted) values (%L, %L, 'promise_check', 'm', 1, 1, 'ok', true)$q$, :A, :BOOK1));
select pg_temp.stays('an export', format($q$insert into public.book_exports (user_id, book_id, format, include, parts, versions) values (%L, %L, 'md', 'all', '{"title": true, "copyright": true, "contents": true, "intro": true, "conclusion": true, "about": false}', array[%L]::uuid[])$q$, :A, :BOOK1, :V11));
select pg_temp.stays('a books touch', format($q$update public.books set updated_at = now() where id = %L$q$, :BOOK1));
select pg_temp.stays('books.current_step', format($q$update public.books set current_step = 7 where id = %L$q$, :BOOK1));
select pg_temp.stays('the positioning approach', format($q$update public.positioning set approach = 'Other approach.' where book_id = %L$q$, :BOOK1));
select pg_temp.stays('08 chapter label', format($q$update public.book_formats set chapter_label = 'none' where book_id = %L$q$, :BOOK1));
select pg_temp.stays('08 paper', format($q$update public.book_formats set paper = 'cream' where book_id = %L$q$, :BOOK1));
select pg_temp.stays('08 About part', format($q$update public.book_formats set parts = parts || '{"about": true}' where book_id = %L$q$, :BOOK1));
:ASA
select pg_temp.stays('a saved version that is not made current', format($q$select public.save_version(%L, 'Side copy.', %L, false)$q$, :S11, :V11));

-- A new version: the list moves. The key moves only when the status does.
create function pg_temp.vmoved(name text, q text, key_moves boolean) returns text language plpgsql as $$
declare k0 text := pg_temp.key(); v0 uuid[] := pg_temp.vers(); got text;
begin
  got := pg_temp.err(q);
  return pg_temp.chk(name, got like 'OK%' and pg_temp.vers() <> v0 and (pg_temp.key() is distinct from k0) = key_moves, got);
end $$;
grant execute on function pg_temp.vmoved(text, text, boolean) to public;
select pg_temp.vmoved('a new version on a Final section: the list moves, the key stays', format($q$select public.save_version(%L, 'Chair text again.', (select current_version_id from public.sections where id = %L))$q$, :SI, :SI), false);
select pg_temp.vmoved('the first version of a section: the list moves and the key moves (Not started to Draft)', format($q$select public.save_version(%L, 'First words.', null)$q$, :S13), true);
select pg_temp.vmoved('a section goes blank: the list moves', format($q$select public.save_version(%L, '   ', (select current_version_id from public.sections where id = %L))$q$, :S13, :S13), false);

-- ── 6. qc_runs ──
select pg_temp.expect('a run on your own book', pg_temp.ins(), 'OK 1');
select pg_temp.chk('user_id defaults to the caller', (select bool_and(user_id = :A) from public.qc_runs));
select pg_temp.expect('wrong key: stale', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, %L, '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 5, 100, 'classic')$q$, :BOOK1, pg_temp.vers()), 'P0001 qc_stale | Your book changed while the checks ran. Run again.');
select pg_temp.expect('wrong version list: stale', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, %L, %L, '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 5, 100, 'classic')$q$, :BOOK1, array[:VI]::uuid[], pg_temp.key()), 'P0001 qc_stale%');
select pg_temp.expect('the same list in another order: stale', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, %L, %L, '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 5, 100, 'classic')$q$, :BOOK1, (select array_agg(x order by x desc) from unnest(pg_temp.vers()) x), pg_temp.key()), 'P0001 qc_stale%');
select pg_temp.ins() as stale_sql \gset
select public.save_version(:SI, 'Text changed during the run.', (select current_version_id from public.sections where id = :SI)) is not null as saved \gset
select pg_temp.expect('a save during the run: stale', :'stale_sql', 'P0001 qc_stale%');
select pg_temp.expect('after the run again: fine', pg_temp.ins(), 'OK 1');
select pg_temp.expect('a book with no text: no run', pg_temp.ins(pg_temp.res(), :BOOK3), '23514%qc_runs_versions_check%');
select pg_temp.expect('another user''s book refused', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values (%L, array[%L]::uuid[], '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 1, 'classic')$q$, :BOOKB, :VB), '42501%');
select pg_temp.expect('a run as another user on your book refused', replace(replace(pg_temp.ins(), '(book_id,', '(user_id, book_id,'), 'values (', format('values (%L, ', :B)), 'P0001 qc_owner%');
select pg_temp.expect('a book that does not exist refused', format($q$insert into public.qc_runs (book_id, versions, inputs_key, results, sections, words, style) values ('b0000000-0000-4000-8000-0000000000ff', array[%L]::uuid[], '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 1, 'classic')$q$, :V11), '42501%');
select pg_temp.expect('A cannot update a run', $q$update public.qc_runs set words = 1$q$, '42501%');
select pg_temp.expect('A cannot delete a run', $q$delete from public.qc_runs$q$, '42501%');
select pg_temp.expect('A cannot truncate runs', $q$truncate public.qc_runs$q$, '42501%');
select pg_temp.expect('sections 0 refused', replace(pg_temp.ins(), ', 5, 100,', ', 0, 100,'), '23514%qc_runs_sections_check%');
select pg_temp.expect('sections 2,001 refused', replace(pg_temp.ins(), ', 5, 100,', ', 2001, 100,'), '23514%qc_runs_sections_check%');
select pg_temp.expect('words -1 refused', replace(pg_temp.ins(), ', 5, 100,', ', 5, -1,'), '23514%qc_runs_words_check%');
select pg_temp.expect('words 1,000,001 refused', replace(pg_temp.ins(), ', 5, 100,', ', 5, 1000001,'), '23514%qc_runs_words_check%');
select pg_temp.expect('a style outside the list refused', replace(pg_temp.ins(), '''classic''', '''fancy'''), '23514%qc_runs_style_check%');
select pg_temp.expect(s || ': style passes', replace(pg_temp.ins(), '''classic''', quote_literal(s)), 'OK 1') from unnest(array['modern', 'clean', 'warm']) s order by s;

-- results: good shapes
select pg_temp.expect('a good item', pg_temp.ins(pg_temp.item()), 'OK 1');
select pg_temp.expect('item: book-wide, no ids, no spot', pg_temp.ins(pg_temp.item('{"section_id": null, "version_id": null, "start": null, "end": null, "quote": ""}')), 'OK 1');
select pg_temp.expect('item: start = end', pg_temp.ins(pg_temp.item('{"start": 7, "end": 7}')), 'OK 1');
select pg_temp.expect('item: 300 characters', pg_temp.ins(pg_temp.item(jsonb_build_object('key', repeat('k', 300), 'message', repeat('m', 300), 'quote', repeat('q', 300)))), 'OK 1');
select pg_temp.expect('group ' || g || ' passes', pg_temp.ins(pg_temp.item(jsonb_build_object('g', g))), 'OK 1') from unnest(array[1, 2, 3, 4, 5, 7]) g order by g;
select pg_temp.expect('more, per group', pg_temp.ins(pg_temp.res('{"more": {"1": 12, "7": 3}}')), 'OK 1');
select pg_temp.expect('sources: a good line', pg_temp.ins(pg_temp.res('{"sources": [{"citation": "Smith 2021", "sections": ["d0000000-0000-4000-8000-000000000002"]}]}')), 'OK 1');
select pg_temp.expect('sources: no sections listed', pg_temp.ins(pg_temp.res('{"sources": [{"citation": "Smith 2021", "sections": []}]}')), 'OK 1');
select pg_temp.expect('400 items', pg_temp.ins(pg_temp.res(jsonb_build_object('items', (select jsonb_agg(pg_temp.item() -> 'items' -> 0) from generate_series(1, 400))))), 'OK 1');
select pg_temp.expect('50 sources', pg_temp.ins(pg_temp.res(jsonb_build_object('sources', (select jsonb_agg('{"citation": "x", "sections": []}'::jsonb) from generate_series(1, 50))))), 'OK 1');
select pg_temp.expect('400 sections in a source', pg_temp.ins(pg_temp.res(jsonb_build_object('sources', jsonb_build_array(jsonb_build_object('citation', 'x', 'sections', (select jsonb_agg(:S11::text) from generate_series(1, 400))))))), 'OK 1');
select pg_temp.chk('every free rule id passes', (select bool_and(public.qc_rule_ok(r)) from unnest(array[
  'not_final', 'no_text', 'needs_review', 'chapter_review', 'under_target', 'stopped_run', 'cut_off', 'verify_mark', 'number_no_source',
  'source_not_named', 'same_sentence', 'same_sentence_here', 'same_paragraph', 'overused_word', 'chapter_missing', 'section_number', 'preview',
  'leftover', 'two_spellings', 'us_uk', 'web_link', 'emoji', 'missing_char', 'length', 'disclaimer']) r));
select pg_temp.chk('promise_drift is not a free rule', not public.qc_rule_ok('promise_drift'));
select pg_temp.chk('a null rule is not a rule', not public.qc_rule_ok(null));

-- results: bad items
select pg_temp.expect('bad item: ' || name, pg_temp.ins(pg_temp.item(patch)), '23514%qc_runs_results_shape_check%')
  from (values
    ('group 6 (AI, never in a run)', '{"g": 6}'::jsonb),
    ('group 0', '{"g": 0}'), ('group 8', '{"g": 8}'), ('group as a string', '{"g": "1"}'), ('group 1.5', '{"g": 1.5}'), ('group null', '{"g": null}'),
    ('an unknown rule', '{"rule": "nope"}'), ('rule promise_drift', '{"rule": "promise_drift"}'), ('rule as a number', '{"rule": 1}'),
    ('an empty key', '{"key": ""}'), ('key as a number', '{"key": 1}'),
    ('section_id not a uuid', '{"section_id": "nope"}'), ('section_id a number', '{"section_id": 1}'),
    ('version_id not a uuid', '{"version_id": "nope"}'), ('version_id upper case', '{"version_id": "F0000000-0000-4000-8000-000000000002"}'),
    ('start negative', '{"start": -1}'), ('start after end', '{"start": 6, "end": 5}'), ('start 1.5', '{"start": 1.5}'), ('start as a string', '{"start": "0"}'),
    ('start with no end', '{"end": null}'), ('end with no start', '{"start": null}'), ('end too large for an int', '{"end": 99999999999}'),
    ('an empty message', '{"message": ""}'), ('a blank message', '{"message": "   "}'), ('message null', '{"message": null}'),
    ('quote null', '{"quote": null}'), ('an extra key', '{"extra": 1}')) t(name, patch)
  order by name;
select pg_temp.expect('bad item: key of 301', pg_temp.ins(pg_temp.item(jsonb_build_object('key', repeat('k', 301)))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad item: message of 301', pg_temp.ins(pg_temp.item(jsonb_build_object('message', repeat('m', 301)))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad item: quote of 301', pg_temp.ins(pg_temp.item(jsonb_build_object('quote', repeat('q', 301)))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad item: no ' || k, pg_temp.ins(pg_temp.item('{}', k)), '23514%qc_runs_results_shape_check%')
  from unnest(array['g', 'rule', 'key', 'section_id', 'version_id', 'start', 'end', 'message', 'quote']) k order by k;
select pg_temp.expect('bad item: a string, not an object', pg_temp.ins(pg_temp.res('{"items": ["x"]}')), '23514%qc_runs_results_shape_check%');

-- results: bad top level
select pg_temp.expect('bad results: an array', pg_temp.ins('[]'), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad results: a JSON null', pg_temp.ins('null'), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad results: no ' || k, pg_temp.ins(pg_temp.res('{}', k)), '23514%qc_runs_results_shape_check%')
  from unnest(array['items', 'more', 'sources', 'notes']) k order by k;
select pg_temp.expect('bad results: ' || name, pg_temp.ins(pg_temp.res(patch)), '23514%qc_runs_results_shape_check%')
  from (values
    ('an extra key', '{"extra": 1}'::jsonb),
    ('items an object', '{"items": {}}'), ('more an array', '{"more": []}'), ('sources an object', '{"sources": {}}'), ('notes an array', '{"notes": []}'),
    ('more for group 6', '{"more": {"6": 1}}'), ('more for group 8', '{"more": {"8": 1}}'), ('more negative', '{"more": {"1": -1}}'), ('more a string', '{"more": {"1": "2"}}'),
    ('source: no citation', '{"sources": [{"sections": []}]}'), ('source: empty citation', '{"sources": [{"citation": "", "sections": []}]}'),
    ('source: sections not a list', '{"sources": [{"citation": "x", "sections": 1}]}'), ('source: not a uuid', '{"sources": [{"citation": "x", "sections": ["nope"]}]}'),
    ('source: an extra key', '{"sources": [{"citation": "x", "sections": [], "extra": 1}]}'), ('source: a string', '{"sources": ["x"]}'),
    ('notes: no running', '{"notes": {"unsaved": 0}}'), ('notes: an extra key', '{"notes": {"unsaved": 0, "running": 0, "extra": 0}}'),
    ('notes: negative', '{"notes": {"unsaved": -1, "running": 0}}'), ('notes: a string', '{"notes": {"unsaved": "1", "running": 0}}')) t(name, patch)
  order by name;
select pg_temp.expect('bad results: citation of 201', pg_temp.ins(pg_temp.res(jsonb_build_object('sources', jsonb_build_array(jsonb_build_object('citation', repeat('c', 201), 'sections', '[]'::jsonb))))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad results: 401 items', pg_temp.ins(pg_temp.res(jsonb_build_object('items', (select jsonb_agg(pg_temp.item() -> 'items' -> 0) from generate_series(1, 401))))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad results: 51 sources', pg_temp.ins(pg_temp.res(jsonb_build_object('sources', (select jsonb_agg('{"citation": "x", "sections": []}'::jsonb) from generate_series(1, 51))))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('bad results: 401 sections in a source', pg_temp.ins(pg_temp.res(jsonb_build_object('sources', jsonb_build_array(jsonb_build_object('citation', 'x', 'sections', (select jsonb_agg(:S11::text) from generate_series(1, 401))))))), '23514%qc_runs_results_shape_check%');
select pg_temp.expect('results over the size cap (a good shape)', pg_temp.ins(pg_temp.res(jsonb_build_object('items', (select jsonb_agg(pg_temp.item(jsonb_build_object('key', repeat('€', 300), 'message', repeat('€', 300), 'quote', repeat('€', 300))) -> 'items' -> 0) from generate_series(1, 400))))), '23514%qc_runs_results_size_check%');
select pg_temp.expect('a refused run keeps the older runs', $q$select 1 where (select count(*) from public.qc_runs) = 5$q$, 'OK 1');

-- Newest 5, per book. Each statement is its own transaction, so the times differ.
select pg_temp.expect('book 2: first run', pg_temp.ins(pg_temp.res(), :BOOK2), 'OK 1');
select id as oldest from public.qc_runs where book_id = :BOOK1 order by created_at, id limit 1 \gset
select updated_at as book_time from public.books where id = :BOOK1 \gset
select pg_temp.expect('one more run on book 1', pg_temp.ins(), 'OK 1');
select pg_temp.chk('newest 5 kept', (select count(*) from public.qc_runs where book_id = :BOOK1) = 5, (select count(*) from public.qc_runs where book_id = :BOOK1)::text);
select pg_temp.chk('the oldest run went', not exists (select 1 from public.qc_runs where id = :'oldest'));
select pg_temp.chk('the other book keeps its run', (select count(*) from public.qc_runs where book_id = :BOOK2) = 1);
select pg_temp.chk('a run does not touch books.updated_at', (select updated_at from public.books where id = :BOOK1) = :'book_time'::timestamptz);
:SVC
select pg_temp.expect('service role: no user_id refused', pg_temp.ins(pg_temp.res(), :BOOK2), '23502%user_id%');
select pg_temp.expect('service role: a run for the owner', replace(replace(pg_temp.ins(pg_temp.res(), :BOOK2), '(book_id,', '(user_id, book_id,'), 'values (', format('values (%L, ', :A)), 'OK 1');
select pg_temp.expect('service role: wrong owner', replace(replace(pg_temp.ins(pg_temp.res(), :BOOK2), '(book_id,', '(user_id, book_id,'), 'values (', format('values (%L, ', :B)), 'P0001 qc_owner%');
:ASB
select pg_temp.expect('B reads none of A''s runs', $q$select 1 from public.qc_runs$q$, 'OK 0');
select pg_temp.expect('B cannot delete A''s runs', $q$delete from public.qc_runs$q$, '42501%');
select pg_temp.expect('B runs on B''s own book', pg_temp.ins(pg_temp.res(), :BOOKB), 'OK 1');
:OWNER
set role anon;
select pg_temp.expect('anon reads no runs', $q$select 1 from public.qc_runs$q$, 'OK 0');
select pg_temp.expect('anon cannot insert a run', format($q$insert into public.qc_runs (user_id, book_id, versions, inputs_key, results, sections, words, style) values (%L, %L, array[%L]::uuid[], '0123456789abcdef0123456789abcdef', '{"items": [], "more": {}, "sources": [], "notes": {"unsaved": 0, "running": 0}}', 1, 1, 'classic')$q$, :A, :BOOK2, :V31), '42501%');

-- ── 7. qc_dismissed ──
:ASA
select pg_temp.expect('Mark as OK on your own section', format($q$insert into public.qc_dismissed (book_id, section_id, rule, issue_key, label) values (%L, %L, 'verify_mark', 's|abc', 'Verify mark')$q$, :BOOK1, :S11), 'OK 1');
select pg_temp.expect('Mark as OK, book-wide', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'disclaimer', 'disclaimer', 'No disclaimer')$q$, :BOOK1), 'OK 1');
select pg_temp.expect('Mark as OK on a promise drift', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'promise_drift', 'c|0123456789abcdef', 'Chapter 2')$q$, :BOOK1), 'OK 1');
select pg_temp.chk('user_id defaults to the caller', (select bool_and(user_id = :A) from public.qc_dismissed));
select pg_temp.expect('a repeat gives 23505', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'disclaimer', 'disclaimer', 'Again')$q$, :BOOK1), '23505%');
select pg_temp.expect('the same key under another rule is fine', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'disclaimer', 'Other rule')$q$, :BOOK1), 'OK 1');
select pg_temp.expect('the same key on another book is fine', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'disclaimer', 'disclaimer', 'Other book')$q$, :BOOK2), 'OK 1');
select pg_temp.expect('a section of another book refused', format($q$insert into public.qc_dismissed (book_id, section_id, rule, issue_key, label) values (%L, %L, 'length', 'x', 'X')$q$, :BOOK1, :S31), 'P0001 qc_dismissed_section%');
select pg_temp.expect('a section of another user refused', format($q$insert into public.qc_dismissed (book_id, section_id, rule, issue_key, label) values (%L, %L, 'length', 'x', 'X')$q$, :BOOK1, :SB), 'P0001 qc_dismissed_section%');
select pg_temp.expect('another user''s book refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'x', 'X')$q$, :BOOKB), '42501%');
select pg_temp.expect('as another user on your book refused', format($q$insert into public.qc_dismissed (user_id, book_id, rule, issue_key, label) values (%L, %L, 'length', 'x', 'X')$q$, :B, :BOOK1), 'P0001 qc_dismissed_owner%');
select pg_temp.expect('an unknown rule refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'nope', 'x', 'X')$q$, :BOOK1), '23514%qc_dismissed_rule_check%');
select pg_temp.expect('an empty key refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', '', 'X')$q$, :BOOK1), '23514%qc_dismissed_issue_key_check%');
select pg_temp.expect('a blank key refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', '  ', 'X')$q$, :BOOK1), '23514%qc_dismissed_issue_key_check%');
select pg_temp.expect('a key of 301 refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', %L, 'X')$q$, :BOOK1, repeat('k', 301)), '23514%qc_dismissed_issue_key_check%');
select pg_temp.expect('a key of 300 passes', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', %L, 'X')$q$, :BOOK1, repeat('k', 300)), 'OK 1');
select pg_temp.expect('an empty label refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'y', '')$q$, :BOOK1), '23514%qc_dismissed_label_check%');
select pg_temp.expect('a blank label refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'y', '  ')$q$, :BOOK1), '23514%qc_dismissed_label_check%');
select pg_temp.expect('a label of 301 refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'y', %L)$q$, :BOOK1, repeat('l', 301)), '23514%qc_dismissed_label_check%');
select pg_temp.expect('A cannot update a dismissal', $q$update public.qc_dismissed set label = 'Changed'$q$, '42501%');
:ASB
select pg_temp.expect('B reads none of A''s dismissals', $q$select 1 from public.qc_dismissed$q$, 'OK 0');
select pg_temp.expect('B deletes none of A''s dismissals', $q$delete from public.qc_dismissed$q$, 'OK 0');
:ASA
select pg_temp.expect('Undo: delete your own', $q$delete from public.qc_dismissed where rule = 'disclaimer' and label = 'No disclaimer'$q$, 'OK 1');
select pg_temp.expect('after Undo it can be marked again', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'disclaimer', 'disclaimer', 'Again')$q$, :BOOK1), 'OK 1');
:OWNER
insert into public.qc_dismissed (user_id, book_id, rule, issue_key, label) select :A, :BOOK3, 'length', 'k' || n, 'L' from generate_series(1, 500) n;
select pg_temp.chk('500 rows on one book pass', (select count(*) from public.qc_dismissed where book_id = :BOOK3) = 500);
:ASA
select pg_temp.expect('the 501st refused', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'more', 'L')$q$, :BOOK3), 'P0001 qc_dismissed_limit%');
select pg_temp.expect('the limit is per book', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'more', 'L')$q$, :BOOK2), 'OK 1');
select pg_temp.expect('Undo makes room', format($q$delete from public.qc_dismissed where book_id = %L and issue_key = 'k1'$q$, :BOOK3), 'OK 1');
select pg_temp.expect('then it passes', format($q$insert into public.qc_dismissed (book_id, rule, issue_key, label) values (%L, 'length', 'more', 'L')$q$, :BOOK3), 'OK 1');
:SVC
select pg_temp.expect('service role: wrong owner', format($q$insert into public.qc_dismissed (user_id, book_id, rule, issue_key, label) values (%L, %L, 'length', 'svc', 'L')$q$, :B, :BOOK1), 'P0001 qc_dismissed_owner%');
select pg_temp.expect('service role: a section of another book', format($q$insert into public.qc_dismissed (user_id, book_id, section_id, rule, issue_key, label) values (%L, %L, %L, 'length', 'svc', 'L')$q$, :A, :BOOK1, :S31), 'P0001 qc_dismissed_section%');
:OWNER
set role anon;
select pg_temp.expect('anon reads no dismissals', $q$select 1 from public.qc_dismissed$q$, 'OK 0');
select pg_temp.expect('anon cannot insert a dismissal', format($q$insert into public.qc_dismissed (user_id, book_id, rule, issue_key, label) values (%L, %L, 'length', 'anon', 'L')$q$, :A, :BOOK1), '42501%');
select pg_temp.expect('anon deletes no dismissals', $q$delete from public.qc_dismissed$q$, 'OK 0');

-- ── 8. book_checks ──
:OWNER
delete from public.book_checks;
insert into public.section_versions (user_id, section_id, version_no, content, source)
  select :A, :S12, 100 + n, 'Old text.', 'manual' from generate_series(1, 13) n;
:ASA
select pg_temp.expect('A cannot insert a check', pg_temp.bc(), '42501%');
:SVC
select pg_temp.expect('service role: a check', pg_temp.bc(), 'OK 1');
select pg_temp.expect('service role: an upsert replaces it', pg_temp.bc('{"verdict": "keeps", "quote": "", "section_id": null, "reason": "It keeps the promise.", "words": 120}',
  'on conflict (chapter_id) do update set verdict = excluded.verdict, reason = excluded.reason, quote = excluded.quote, section_id = excluded.section_id, words = excluded.words'), 'OK 1');
select pg_temp.chk('one row, the new result', (select count(*) = 1 and bool_and(verdict = 'keeps' and words = 120 and section_id is null) from public.book_checks));
select pg_temp.chk('updated_at moves on an upsert', (select bool_and(updated_at > created_at) from public.book_checks));
select pg_temp.expect('a second chapter', pg_temp.bc(format('{"chapter_id": %s, "section_id": %s, "versions": [%s]}', to_jsonb(:C2::text), to_jsonb(:S21::text), to_jsonb(:V21::text))::jsonb), 'OK 1');
:ASA
select pg_temp.expect('A reads own checks', $q$select 1 from public.book_checks$q$, 'OK 2');
select pg_temp.expect('A cannot update a check', $q$update public.book_checks set verdict = 'drifts'$q$, '42501%');
select pg_temp.expect('A cannot delete a check', $q$delete from public.book_checks$q$, '42501%');
:ASB
select pg_temp.expect('B reads none of A''s checks', $q$select 1 from public.book_checks$q$, 'OK 0');
select pg_temp.expect('B cannot update', $q$update public.book_checks set verdict = 'drifts'$q$, '42501%');
select pg_temp.expect('B cannot delete', $q$delete from public.book_checks$q$, '42501%');
:OWNER
set role anon;
select pg_temp.expect('anon reads no checks', $q$select 1 from public.book_checks$q$, 'OK 0');
:SVC
select pg_temp.expect('guard: another user', pg_temp.bc(jsonb_build_object('user_id', :B::text, 'chapter_id', :C4::text, 'section_id', null, 'quote', '', 'versions', jsonb_build_array(:V41::text))), 'P0001 book_check_owner%');
select pg_temp.expect('guard: another book', pg_temp.bc(jsonb_build_object('book_id', :BOOK1::text, 'chapter_id', :C4::text, 'section_id', null, 'quote', '', 'versions', jsonb_build_array(:V41::text))), 'P0001 book_check_owner%');
select pg_temp.expect('guard: the Introduction is not a chapter', pg_temp.bc(jsonb_build_object('chapter_id', :CI::text, 'section_id', null, 'quote', '', 'versions', jsonb_build_array(:VI::text))), 'P0001 book_check_owner%');
select pg_temp.expect('guard: the Conclusion is not a chapter', pg_temp.bc(jsonb_build_object('chapter_id', :CX::text, 'section_id', null, 'quote', '', 'versions', jsonb_build_array(:VX::text))), 'P0001 book_check_owner%');
select pg_temp.expect('guard: a chapter that does not exist', pg_temp.bc('{"chapter_id": "c0000000-0000-4000-8000-0000000000ff"}'), 'P0001 book_check_owner%');
select pg_temp.expect('guard: a section of another chapter', pg_temp.bc(jsonb_build_object('section_id', :S21::text), 'on conflict (chapter_id) do update set section_id = excluded.section_id'), 'P0001 book_check_section%');
select pg_temp.expect('guard: a section of another book', pg_temp.bc(jsonb_build_object('section_id', :S31::text), 'on conflict (chapter_id) do update set section_id = excluded.section_id'), 'P0001 book_check_section%');
select pg_temp.expect('guard: a version of another chapter', pg_temp.bc(jsonb_build_object('versions', jsonb_build_array(:V11::text, :V21::text)), 'on conflict (chapter_id) do update set versions = excluded.versions'), 'P0001 book_check_version%');
select pg_temp.expect('guard: a version of another user', pg_temp.bc(jsonb_build_object('versions', jsonb_build_array(:VB::text)), 'on conflict (chapter_id) do update set versions = excluded.versions'), 'P0001 book_check_version%');
select pg_temp.expect('guard: a repeat', pg_temp.bc(jsonb_build_object('versions', jsonb_build_array(:V11::text, :V11::text)), 'on conflict (chapter_id) do update set versions = excluded.versions'), 'P0001 book_check_version%');
select pg_temp.expect('guard on update: another user', format($q$update public.book_checks set user_id = %L where chapter_id = %L$q$, :B, :C1), 'P0001 book_check_owner%');
select pg_temp.expect('guard on update: another book', format($q$update public.book_checks set book_id = %L where chapter_id = %L$q$, :BOOK2, :C1), 'P0001 book_check_owner%');
select pg_temp.expect('guard on update: a section of another chapter', format($q$update public.book_checks set quote = 'x', section_id = %L where chapter_id = %L$q$, :S21, :C1), 'P0001 book_check_section%');
select pg_temp.expect('guard on update: a version of another chapter', format($q$update public.book_checks set versions = array[%L]::uuid[] where chapter_id = %L$q$, :V21, :C1), 'P0001 book_check_version%');
select pg_temp.expect('guard on update: moved to a chapter its section and versions do not fit', format($q$update public.book_checks set chapter_id = %L, book_id = %L where chapter_id = %L$q$, :C3, :BOOK2, :C2), 'P0001 book_check_section%');

-- Shapes. Each patch on an upsert of chapter 1, whose row is valid.
create function pg_temp.bcu(patch jsonb) returns text language sql as $$
  select pg_temp.bc(patch, 'on conflict (chapter_id) do update set verdict = excluded.verdict, reason = excluded.reason, quote = excluded.quote, section_id = excluded.section_id, unsourced = excluded.unsourced, versions = excluded.versions, words = excluded.words, inputs_key = excluded.inputs_key') $$;
grant execute on function pg_temp.bcu(jsonb) to public;
select pg_temp.expect('shape: ' || name, pg_temp.bcu(patch), want)
  from (values
    ('verdict outside the list', '{"verdict": "maybe"}'::jsonb, '23514%book_checks_verdict_check%'),
    ('an empty reason', '{"reason": ""}', '23514%book_checks_reason_check%'),
    ('a blank reason', '{"reason": "   "}', '23514%book_checks_reason_check%'),
    ('a blank quote', '{"quote": "   "}', '23514%book_checks_quote_check%'),
    ('a section with no quote', '{"quote": ""}', '23514%book_checks_quote_section_check%'),
    ('words 49', '{"words": 49}', '23514%book_checks_words_check%'),
    ('words 6,001', '{"words": 6001}', '23514%book_checks_words_check%'),
    ('a short key', '{"inputs_key": "abc"}', '23514%book_checks_inputs_key_check%'),
    ('an upper-case key', '{"inputs_key": "0123456789ABCDEF"}', '23514%book_checks_inputs_key_check%'),
    ('no versions', '{"versions": []}', '23514%book_checks_versions_check%'),
    ('a null version', '{"versions": ["f0000000-0000-4000-8000-000000000002", null]}', '23514%book_checks_versions_check%'),
    ('an empty unsourced item', '{"unsourced": [""]}', '23514%book_checks_unsourced_check%'),
    ('an unsourced item of 21', '{"unsourced": ["123456789012345678901"]}', '23514%book_checks_unsourced_check%'),
    ('11 unsourced items', '{"unsourced": ["1","2","3","4","5","6","7","8","9","10","11"]}', '23514%book_checks_unsourced_check%'),
    ('words 50 passes', '{"words": 50}', 'OK 1'),
    ('words 6,000 passes', '{"words": 6000}', 'OK 1'),
    ('10 unsourced items pass', '{"unsourced": ["1","2","3","4","5","6","7","8","9","10"]}', 'OK 1'),
    ('a quote with no section passes (AI quote not found keeps the verdict)', '{"section_id": null}', 'OK 1'),
    ('keeps: no quote, no section passes', '{"verdict": "keeps", "quote": "", "section_id": null}', 'OK 1')) t(name, patch, want)
  order by name;
select pg_temp.expect('shape: a reason of 301', pg_temp.bcu(jsonb_build_object('reason', repeat('r', 301))), '23514%book_checks_reason_check%');
select pg_temp.expect('shape: a reason of 300 passes', pg_temp.bcu(jsonb_build_object('reason', repeat('r', 300))), 'OK 1');
select pg_temp.expect('shape: a quote of 301', pg_temp.bcu(jsonb_build_object('quote', repeat('q', 301))), '23514%book_checks_quote_check%');
select pg_temp.expect('shape: a quote of 300 passes', pg_temp.bcu(jsonb_build_object('quote', repeat('q', 300))), 'OK 1');
select pg_temp.expect('shape: 12 versions pass', pg_temp.bcu(jsonb_build_object('versions', (select jsonb_agg(v.id) from (select id from public.section_versions where section_id = :S12 and version_no > 100 limit 12) v))), 'OK 1');
select pg_temp.expect('shape: 13 versions refused', pg_temp.bcu(jsonb_build_object('versions', (select jsonb_agg(v.id) from public.section_versions v where v.section_id = :S12 and v.version_no > 100))), '23514%book_checks_versions_check%');

-- A section with any version cannot be deleted (0016), so section_id goes to
-- null only inside a book delete. Today the chapter cascade removes the check
-- first, but that order comes from trigger names, which nothing promises. So
-- a row the guard would refuse today (another owner, a section of another
-- chapter, a version that is gone) stands in for that moment: an update that
-- leaves those columns alone must pass.
select pg_temp.expect('section_id can be cleared, and the quote stays', format($q$update public.book_checks set section_id = null, quote = 'Kept quote' where chapter_id = %L$q$, :C2), 'OK 1');
:OWNER
alter table public.book_checks disable trigger book_checks_guard;
update public.book_checks set user_id = :B, section_id = :S31, versions = array['f0000000-0000-4000-8000-0000000000ff']::uuid[] where chapter_id = :C2;
alter table public.book_checks enable trigger book_checks_guard;
:SVC
select pg_temp.expect('an update of other columns skips the guard''s checks', format($q$update public.book_checks set verdict = 'keeps' where chapter_id = %L$q$, :C2), 'OK 1');
select pg_temp.expect('the cascade''s set null passes with its chapter''s rows out of step', format($q$update public.book_checks set section_id = null where chapter_id = %L$q$, :C2), 'OK 1');
:OWNER
alter table public.book_checks disable trigger book_checks_guard;
update public.book_checks set user_id = :A, versions = array[:V21]::uuid[] where chapter_id = :C2;
alter table public.book_checks enable trigger book_checks_guard;
:SVC
select pg_temp.expect('guard on update: moved with no section, its versions do not fit', format($q$update public.book_checks set chapter_id = %L, book_id = %L where chapter_id = %L$q$, :C3, :BOOK2, :C2), 'P0001 book_check_version%');
:OWNER
select pg_temp.expect('fixture: a check on book 2', pg_temp.bc(jsonb_build_object('chapter_id', :C3::text, 'book_id', :BOOK2::text, 'section_id', :S31::text, 'versions', jsonb_build_array(:V31::text))), 'OK 1');
select pg_temp.expect('a dismissal on a section with no version', format($q$insert into public.qc_dismissed (user_id, book_id, section_id, rule, issue_key, label) values (%L, %L, %L, 'no_text', 'sec', 'L')$q$, :A, :BOOK2, :S42), 'OK 1');
select pg_temp.expect('that section is deleted', format($q$delete from public.sections where id = %L$q$, :S42), 'OK 1');
select pg_temp.chk('the dismissal goes with it', not exists (select 1 from public.qc_dismissed where issue_key = 'sec'));

-- ── 9. qc_mark ──
:ASA
select pg_temp.expect('qc_mark: no row before a run', format($q$select 1 from public.qc_mark(%L)$q$, :BOOK3), 'OK 0');
select pg_temp.expect('a run', pg_temp.ins(), 'OK 1');
select pg_temp.chk('qc_mark: current after a matching run', (select current and checked_at is not null from public.qc_mark(:BOOK1)));
select pg_temp.chk('qc_mark: one row, the two columns', (select count(*) = 1 from public.qc_mark(:BOOK1)));
select public.save_version(:SX, 'A new ending.', (select current_version_id from public.sections where id = :SX)) is not null as saved \gset
select pg_temp.chk('qc_mark: not current after a new version', (select not current from public.qc_mark(:BOOK1)));
select pg_temp.expect('run again', pg_temp.ins(), 'OK 1');
select pg_temp.chk('qc_mark: current again, on the newest run', (select current from public.qc_mark(:BOOK1)));
update public.books set title = 'Changed again' where id = :BOOK1;
select pg_temp.chk('qc_mark: not current after an input change', (select not current from public.qc_mark(:BOOK1)));
:ASB
select pg_temp.expect('qc_mark: no row for another user''s book', format($q$select 1 from public.qc_mark(%L)$q$, :BOOK1), 'OK 0');

-- ── 10. qc_json ──
:ASB
select pg_temp.expect('qc_json: null for another user''s book', format($q$select 1 where public.qc_json(%L) is null$q$, :BOOK1), 'OK 1');
:ASA
select pg_temp.expect('qc_json: null for no book', $q$select 1 where public.qc_json('b0000000-0000-4000-8000-0000000000ff') is null$q$, 'OK 1');
select pg_temp.chk('qc_json: the top keys',
  (select array_agg(k order by k) from jsonb_object_keys(public.qc_json(:BOOK1)) k)
  = array['current', 'data', 'dismissed', 'format', 'inputs_key', 'last_run', 'now', 'positioning', 'promise', 'versions']);
select pg_temp.chk('qc_json: data is export_json', (public.qc_json(:BOOK1) -> 'data') - 'now' = public.export_json(:BOOK1) - 'now');
select pg_temp.chk('qc_json: data has word_target', public.qc_json(:BOOK1) #> '{data,chapters,1,sections,0}' ? 'word_target');
select pg_temp.chk('qc_json: versions and key are today''s',
  public.qc_json(:BOOK1) -> 'versions' = to_jsonb(public.qc_versions(:BOOK1)) and public.qc_json(:BOOK1) ->> 'inputs_key' = public.qc_inputs_key(:BOOK1));
select pg_temp.chk('qc_json: not current after a change', public.qc_json(:BOOK1) -> 'current' = 'false'::jsonb);
select pg_temp.expect('run again', pg_temp.ins(pg_temp.item()), 'OK 1');
select pg_temp.chk('qc_json: current after a run', public.qc_json(:BOOK1) -> 'current' = 'true'::jsonb);
select pg_temp.chk('qc_json: last_run keys',
  (select array_agg(k order by k) from jsonb_object_keys(public.qc_json(:BOOK1) -> 'last_run') k)
  = array['created_at', 'id', 'inputs_key', 'results', 'sections', 'style', 'versions', 'words']);
select pg_temp.chk('qc_json: last_run is the newest, with its results', jsonb_array_length(public.qc_json(:BOOK1) #> '{last_run,results,items}') = 1);
select pg_temp.chk('qc_json: format from the 08 row', public.qc_json(:BOOK1) #>> '{format,style}' = 'modern' and public.qc_json(:BOOK1) #>> '{format,chapter_label}' = 'none' and public.qc_json(:BOOK1) -> 'format' ? 'parts');
select pg_temp.chk('qc_json: format keys', (select array_agg(k order by k) from jsonb_object_keys(public.qc_json(:BOOK1) -> 'format') k) = array['chapter_label', 'parts', 'style']);
select pg_temp.chk('qc_json: positioning keys',
  (select array_agg(k order by k) from jsonb_object_keys(public.qc_json(:BOOK1) -> 'positioning') k)
  = array['approach', 'focus_tags', 'lacks', 'locked_at', 'one_sentence', 'reader_promise', 'selling_points']);
select pg_temp.chk('qc_json: dismissed keys',
  (select array_agg(k order by k) from jsonb_object_keys(public.qc_json(:BOOK1) -> 'dismissed' -> 0) k)
  = array['created_at', 'id', 'issue_key', 'label', 'rule', 'section_id']);
select pg_temp.chk('qc_json: dismissed newest first', public.qc_json(:BOOK1) #>> '{dismissed,0,issue_key}' = 'disclaimer', public.qc_json(:BOOK1) #>> '{dismissed,0,issue_key}');
-- Book order: the "chapter order" key test left chapter 2 before chapter 1.
select pg_temp.chk('qc_json: promise in book order, no user_id',
  (select array_agg(e ->> 'chapter_id' order by o) from jsonb_array_elements(public.qc_json(:BOOK1) -> 'promise') with ordinality x(e, o)) = array[:C2, :C1]
  and not (public.qc_json(:BOOK1) -> 'promise' -> 0 ? 'user_id'));
select pg_temp.chk('qc_json: now', public.qc_json(:BOOK1) ? 'now' and (public.qc_json(:BOOK1) ->> 'now')::timestamptz is not null);
select public.save_version(:SX, 'One more ending.', (select current_version_id from public.sections where id = :SX)) is not null as saved \gset
select pg_temp.chk('qc_json: not current after a new version on a Final section (the list moves, the key stays)', public.qc_json(:BOOK1) -> 'current' = 'false'::jsonb);
select pg_temp.chk('qc_json: defaults with no 08 row, no run, nothing dismissed',
  (select j -> 'format' = 'null'::jsonb and j -> 'last_run' = 'null'::jsonb and j -> 'current' = 'false'::jsonb
          and j -> 'positioning' = 'null'::jsonb and j -> 'dismissed' = '[]'::jsonb and j -> 'promise' = '[]'::jsonb
          and j -> 'versions' = '[]'::jsonb and j ->> 'inputs_key' ~ '^[0-9a-f]{32}$'
     from (select public.qc_json(:BOOK4) j) s));
:ASB
select pg_temp.chk('qc_json: B''s own book', public.qc_json(:BOOKB) -> 'dismissed' = '[]'::jsonb and public.qc_json(:BOOKB) -> 'current' = 'true'::jsonb);

-- ── 11. Deletes: a book and a user take every row with them ──
:OWNER
select pg_temp.expect('a dismissal on book 2 remains before the delete', format($q$select 1 from public.qc_dismissed where book_id = %L limit 1$q$, :BOOK2), 'OK 1');
select pg_temp.expect('book 2 is deleted, with a check that points to a section', format($q$delete from public.books where id = %L$q$, :BOOK2), 'OK 1');
select pg_temp.chk('book 2: no check left', not exists (select 1 from public.book_checks where book_id = :BOOK2));
select pg_temp.chk('book 2: no run left', not exists (select 1 from public.qc_runs where book_id = :BOOK2));
select pg_temp.chk('book 2: no dismissal left', not exists (select 1 from public.qc_dismissed where book_id = :BOOK2));
select pg_temp.expect('C: a run', replace(replace(pg_temp.ins(pg_temp.res(), :BOOKC), '(book_id,', '(user_id, book_id,'), 'values (', format('values (%L, ', :C)), 'OK 1');
select pg_temp.expect('C: a dismissal', format($q$insert into public.qc_dismissed (user_id, book_id, section_id, rule, issue_key, label) values (%L, %L, %L, 'length', 'c', 'L')$q$, :C, :BOOKC, :SC), 'OK 1');
select pg_temp.expect('C: a check that points to its section', pg_temp.bc(jsonb_build_object('chapter_id', :CC::text, 'user_id', :C::text, 'book_id', :BOOKC::text, 'section_id', :SC::text, 'versions', jsonb_build_array(:VC::text))), 'OK 1');
select pg_temp.expect('C is deleted', format($q$delete from auth.users where id = %L$q$, :C), 'OK 1');
select pg_temp.chk('C: no rows left', not exists (select 1 from public.qc_runs where user_id = :C) and not exists (select 1 from public.qc_dismissed where user_id = :C) and not exists (select 1 from public.book_checks where user_id = :C));
select pg_temp.expect('A''s book with a check is deleted (the check on a section goes too)', format($q$delete from public.books where id = %L$q$, :BOOK1), 'OK 1');
select pg_temp.chk('A: no check left', not exists (select 1 from public.book_checks where user_id = :A));

-- ── 12. Grants, search_path ──
select pg_temp.chk(f || ': authenticated may execute', has_function_privilege('authenticated', f, 'execute'))
  from unnest(array['public.qc_versions(uuid)', 'public.qc_inputs_key(uuid)', 'public.qc_json(uuid)', 'public.qc_mark(uuid)', 'public.qc_rule_ok(text)',
                    'public.qc_uuid_ok(jsonb)', 'public.qc_count_ok(jsonb)', 'public.qc_item_ok(jsonb)', 'public.qc_source_ok(jsonb)', 'public.qc_results_ok(jsonb)',
                    'public.export_json(uuid)']) f order by f;
select pg_temp.chk(f || ': anon may not execute', not has_function_privilege('anon', f, 'execute'))
  from unnest(array['public.qc_versions(uuid)', 'public.qc_inputs_key(uuid)', 'public.qc_json(uuid)', 'public.qc_mark(uuid)', 'public.qc_rule_ok(text)',
                    'public.qc_uuid_ok(jsonb)', 'public.qc_count_ok(jsonb)', 'public.qc_item_ok(jsonb)', 'public.qc_source_ok(jsonb)', 'public.qc_results_ok(jsonb)',
                    'public.export_json(uuid)']) f order by f;
select pg_temp.chk(f || ': no API role may execute the trigger', not has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
  from unnest(array['public.qc_runs_guard()', 'public.qc_dismissed_guard()', 'public.book_checks_guard()']) f order by f;
select pg_temp.chk(p.proname || ': search_path is empty', p.proconfig = array['search_path=""'], p.proconfig::text)
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('export_json', 'qc_versions', 'qc_inputs_key', 'qc_rule_ok', 'qc_uuid_ok', 'qc_count_ok', 'qc_item_ok', 'qc_source_ok', 'qc_results_ok',
                     'qc_runs_guard', 'qc_dismissed_guard', 'book_checks_guard', 'qc_json', 'qc_mark')
 order by p.proname;
select pg_temp.chk('14 functions in that list', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('export_json', 'qc_versions', 'qc_inputs_key', 'qc_rule_ok', 'qc_uuid_ok', 'qc_count_ok', 'qc_item_ok', 'qc_source_ok', 'qc_results_ok',
                     'qc_runs_guard', 'qc_dismissed_guard', 'book_checks_guard', 'qc_json', 'qc_mark')) = 14);
select pg_temp.chk('only qc_runs_guard is SECURITY DEFINER',
  (select array_agg(p.proname::text) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and (p.proname like 'qc\_%' or p.proname in ('book_checks_guard', 'export_json'))) = array['qc_runs_guard']);
