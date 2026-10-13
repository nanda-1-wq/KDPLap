-- 0022 section checks (E10.4 Checks tab): the table (server only, RLS, the
-- owner, book and version guard), the findings shape (at most 8; an empty
-- quote only for objective, at most 2: decision 1), the areas shape, the
-- fingerprint format, the upsert, the cascades, and "advice only" (the
-- section is never changed).
-- Run: supabase/tests/sql/run.sh t0022.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
insert into auth.users values (:A), (:B);
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :B, 'Walking After 70');
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
select b, u, 'A chair yoga guide for adults over 60.', 'After this book, you can follow a safe 15-minute chair routine at home.',
       'Seated poses only.', '["Too hard"]', '["Safe"]'
  from (values (:BOOK1::uuid, :A::uuid), (:BOOK2, :B)) v(b, u);
set role service_role;
update public.positioning set drift_checked_at = now();
reset role;

create function pg_temp.sec(b uuid, p int, s int) returns uuid language sql security definer as $$
  select x.id from public.sections x join public.chapters c on c.id = x.chapter_id where c.book_id = b and c.position = p and x.position = s $$;
create function pg_temp.ver(s uuid, n int) returns public.section_versions language sql security definer as $$
  select * from public.section_versions where section_id = s and version_no = n $$;
create function pg_temp.sect(s uuid) returns public.sections language sql security definer as $$
  select * from public.sections where id = s $$;
create function pg_temp.chk_row(s uuid) returns public.section_checks language sql security definer as $$
  select * from public.section_checks where section_id = s $$;
create function pg_temp.nchecks() returns bigint language sql security definer as $$ select count(*) from public.section_checks $$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.outline(n int) returns jsonb language sql as $$
  select jsonb_build_object('intro_words', 1000, 'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object('title', 'Chapter ' || i, 'objective', 'Reader can do the moves of chapter ' || i || '.',
                  'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450))) order by i)
                 from generate_series(1, n) i)) $$;
-- One finding of each kind (real length, design 22): an objective gap with an empty quote.
create function pg_temp.f(t text, m text, q text) returns jsonb language sql as $$
  select jsonb_build_object('type', t, 'message', m, 'quote', q) $$;
create function pg_temp.good() returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.f('voice', 'This sentence is long and formal. Split it and speak to the reader as "you".', 'This gentle yet powerful movement serves as a wonderful foundation for everything that follows.'),
    pg_temp.f('drift', 'Weight loss is not in the Brief or the locked positioning. Cut it or tie it to moving safely.', 'Chair yoga also helps you lose weight fast.'),
    pg_temp.f('objective', 'The objective asks for both directions, but the text never shows the forward roll.', '')) $$;
create function pg_temp.areas(o text, v text, d text) returns jsonb language sql as $$
  select jsonb_build_object('objective', o, 'voice', v, 'drift', d) $$;
grant execute on all functions in schema pg_temp to public;

-- The server's upsert (index.ts saveSectionCheck), as one statement.
create function pg_temp.save(s uuid, u uuid, b uuid, v uuid, fnd jsonb, a jsonb, k text default '0123456789abcdef', w int default 310) returns text language sql as $$
  select format($q$insert into public.section_checks (section_id, user_id, book_id, version_id, findings, areas, words, inputs_key, checked_at)
    values (%L, %L, %L, %L, %L, %L, %s, %L, now())
    on conflict (section_id) do update set user_id = excluded.user_id, book_id = excluded.book_id, version_id = excluded.version_id,
      findings = excluded.findings, areas = excluded.areas, words = excluded.words, inputs_key = excluded.inputs_key, checked_at = excluded.checked_at$q$,
    s, u, b, v, fnd, a, w, k) $$;
grant execute on all functions in schema pg_temp to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(2)) is not null as o1 \gset
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000002';
select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(1)) is not null as o2 \gset
reset role;
select pg_temp.sec(:BOOK1, 1, 1) as s11, pg_temp.sec(:BOOK1, 1, 2) as s12, pg_temp.sec(:BOOK1, 2, 1) as s21,
       pg_temp.sec(:BOOK1, 2, 2) as s22, pg_temp.sec(:BOOK2, 1, 1) as sb \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(:'s11', 'Shoulder rolls ease the stiffness that builds up after long hours of sitting.', null) is not null as v \gset
select public.save_version(:'s12', 'Arm circles below the shoulder.', null) is not null as v \gset
select public.save_version(:'s21', 'Hips and knees.', null) is not null as v \gset
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select public.save_version(:'sb', 'Walk to the corner and back.', null) is not null as v \gset
reset role;
select (pg_temp.ver(:'s11', 1)).id as v11, (pg_temp.ver(:'s12', 1)).id as v12, (pg_temp.ver(:'s21', 1)).id as v21,
       (pg_temp.ver(:'sb', 1)).id as vb \gset
select row_to_json(pg_temp.sect(:'s11'))::text as sect_before \gset

-- ── The table ──
select pg_temp.chk('RLS on', (select relrowsecurity from pg_class where oid = 'public.section_checks'::regclass));
select pg_temp.chk('indexes on user_id, book_id and version_id',
  (select count(*) from pg_indexes where tablename = 'section_checks' and indexname like '%\_idx') = 3);
select pg_temp.chk('guard function: not executable by the API roles',
  not has_function_privilege('authenticated', 'public.section_checks_guard()', 'execute')
  and not has_function_privilege('anon', 'public.section_checks_guard()', 'execute'));

-- ── The server saves checks (service role) ──
set role service_role;
select pg_temp.expect('server: a check with an objective gap (empty quote) works',
  pg_temp.save(:'s11', :A, :BOOK1, :'v11', pg_temp.good(), pg_temp.areas('issues', 'issues', 'issues')), 'OK 1');
select pg_temp.expect('server: no findings, all pass works', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass')), 'OK 1');
select pg_temp.expect('server: voice skipped (no voice set) works', pg_temp.save(:'s21', :A, :BOOK1, :'v21', '[]', pg_temp.areas('pass', 'skipped', 'unclear')), 'OK 1');
select pg_temp.expect('server: B''s own check works', pg_temp.save(:'sb', :B, :BOOK2, :'vb', '[]', pg_temp.areas('pass', 'pass', 'pass')), 'OK 1');
reset role;
select pg_temp.chk('server: the row is saved as sent', (pg_temp.chk_row(:'s11')).version_id = :'v11'
  and jsonb_array_length((pg_temp.chk_row(:'s11')).findings) = 3 and (pg_temp.chk_row(:'s11')).words = 310
  and (pg_temp.chk_row(:'s11')).inputs_key = '0123456789abcdef');
select pg_temp.chk('advice only: the section row is unchanged', row_to_json(pg_temp.sect(:'s11'))::text = :'sect_before', row_to_json(pg_temp.sect(:'s11'))::text);

set role service_role;
-- The upsert replaces the last check (one row per section).
select pg_temp.expect('server: a new check replaces the last one', pg_temp.save(:'s11', :A, :BOOK1, :'v11', '[]', pg_temp.areas('pass', 'pass', 'pass'), 'fedcba9876543210', 320), 'OK 1');
reset role;
select pg_temp.chk('upsert: one row per section, the new values', pg_temp.nchecks() = 4
  and (pg_temp.chk_row(:'s11')).inputs_key = 'fedcba9876543210' and (pg_temp.chk_row(:'s11')).findings = '[]'::jsonb
  and (pg_temp.chk_row(:'s11')).words = 320);

set role service_role;
-- The guard: owner, book, version.
select pg_temp.expect('guard: another user''s section refused', pg_temp.save(:'s11', :B, :BOOK1, :'v11', '[]', pg_temp.areas('pass', 'pass', 'pass')), 'P0001 section_check_owner%');
select pg_temp.expect('guard: the wrong book refused', pg_temp.save(:'s11', :A, :BOOK2, :'v11', '[]', pg_temp.areas('pass', 'pass', 'pass')), 'P0001 section_check_owner%');
select pg_temp.expect('guard: a version of another section refused', pg_temp.save(:'s11', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass')), 'P0001 version_other_section%');
select pg_temp.expect('guard: update to another user refused', format($q$update public.section_checks set user_id = %L where section_id = %L$q$, :B, :'s11'), 'P0001 section_check_owner%');
select pg_temp.expect('guard: update to another section''s version refused', format($q$update public.section_checks set version_id = %L where section_id = %L$q$, :'v12', :'s11'), 'P0001 version_other_section%');
select pg_temp.expect('guard: a missing section refused', pg_temp.save('d0000000-0000-4000-8000-000000000001', :A, :BOOK1, null, '[]', pg_temp.areas('pass', 'pass', 'pass')), 'P0001 section_check_owner%');

-- Findings shape (decision 1: an empty quote only for objective, at most 2).
select pg_temp.expect('findings: 8 work', pg_temp.save(:'s12', :A, :BOOK1, :'v12',
  (select jsonb_agg(pg_temp.f('voice', 'Too formal here.', 'Arm circles')) from generate_series(1, 8)), pg_temp.areas('pass', 'issues', 'pass')), 'OK 1');
select pg_temp.expect('findings: 9 refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12',
  (select jsonb_agg(pg_temp.f('voice', 'Too formal here.', 'Arm circles')) from generate_series(1, 9)), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: not an array refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '{}', pg_temp.areas('pass', 'pass', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: an unknown type refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('grammar', 'Fix it.', 'Arm circles')), pg_temp.areas('pass', 'pass', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a missing quote key refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[{"type": "voice", "message": "Too formal."}]', pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: an extra key refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', 'Too formal.', 'Arm circles') || '{"why": "x"}'), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a quote that is not a string refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[{"type": "voice", "message": "Too formal.", "quote": 3}]', pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a message of 300 characters works', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', repeat('x', 300), 'Arm circles')), pg_temp.areas('pass', 'issues', 'pass')), 'OK 1');
select pg_temp.expect('findings: a message of 301 characters refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', repeat('x', 301), 'Arm circles')), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a blank message refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', E' \n ', 'Arm circles')), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a quote of 300 characters works', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('drift', 'Off the promise.', repeat('y', 300))), pg_temp.areas('pass', 'pass', 'issues')), 'OK 1');
select pg_temp.expect('findings: a quote of 301 characters refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('drift', 'Off the promise.', repeat('y', 301))), pg_temp.areas('pass', 'pass', 'issues')), '23514%findings_shape%');
select pg_temp.expect('findings: a blank message (tab) refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', E'\t', 'Arm circles')), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: a blank quote (line break) refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('drift', 'Off the promise.', E'\n')), pg_temp.areas('pass', 'pass', 'issues')), '23514%findings_shape%');
select pg_temp.expect('findings: a blank quote (spaces) refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('objective', 'Missing the forward roll.', '   ')), pg_temp.areas('issues', 'pass', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: an empty quote on voice refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('voice', 'Too formal.', '')), pg_temp.areas('pass', 'issues', 'pass')), '23514%findings_shape%');
select pg_temp.expect('findings: an empty quote on drift refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', jsonb_build_array(pg_temp.f('drift', 'Off the promise.', '')), pg_temp.areas('pass', 'pass', 'issues')), '23514%findings_shape%');
select pg_temp.expect('findings: 2 objective gaps work', pg_temp.save(:'s12', :A, :BOOK1, :'v12',
  jsonb_build_array(pg_temp.f('objective', 'Missing the forward roll.', ''), pg_temp.f('objective', 'Missing how to breathe.', ''), pg_temp.f('voice', 'Too formal.', 'Arm circles')), pg_temp.areas('issues', 'issues', 'pass')), 'OK 1');
select pg_temp.expect('findings: 3 objective gaps refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12',
  jsonb_build_array(pg_temp.f('objective', 'Missing the forward roll.', ''), pg_temp.f('objective', 'Missing how to breathe.', ''), pg_temp.f('objective', 'Missing the count.', '')), pg_temp.areas('issues', 'pass', 'pass')), '23514%findings_shape%');

-- Areas shape.
select pg_temp.expect('areas: a missing key refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', '{"objective": "pass", "voice": "pass"}'), '23514%areas_shape%');
select pg_temp.expect('areas: an extra key refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass') || '{"grammar": "pass"}'), '23514%areas_shape%');
select pg_temp.expect('areas: an unknown value refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('matches', 'pass', 'pass')), '23514%areas_shape%');
select pg_temp.expect('areas: skipped only for voice (objective refused)', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('skipped', 'pass', 'pass')), '23514%areas_shape%');
select pg_temp.expect('areas: skipped only for voice (drift refused)', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'skipped')), '23514%areas_shape%');
select pg_temp.expect('areas: not an object refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', '[]'), '23514%areas_shape%');

-- Fingerprint and words.
select pg_temp.expect('inputs_key: upper case refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass'), '0123456789ABCDEF'), '23514%inputs_key_format%');
select pg_temp.expect('inputs_key: 15 characters refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass'), '0123456789abcde'), '23514%inputs_key_format%');
select pg_temp.expect('words: negative refused', pg_temp.save(:'s12', :A, :BOOK1, :'v12', '[]', pg_temp.areas('pass', 'pass', 'pass'), '0123456789abcdef', -1), '23514%');
reset role;

-- ── The browser cannot write checks ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('user: reads own checks only', (select count(*) from public.section_checks) = 3
  and not exists (select 1 from public.section_checks where user_id <> '00000000-0000-4000-8000-00000000000a'));
select pg_temp.expect('user: insert refused', pg_temp.save(:'s21', :A, :BOOK1, :'v21', '[]', pg_temp.areas('pass', 'pass', 'pass')), '42501%');
select pg_temp.expect('user: update refused', format($q$update public.section_checks set findings = '[]' where section_id = %L$q$, :'s11'), '42501%');
select pg_temp.expect('user: delete refused', format($q$delete from public.section_checks where section_id = %L$q$, :'s11'), '42501%');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('user B: reads only B''s check', (select count(*) from public.section_checks) = 1
  and (select section_id from public.section_checks) = :'sb');
reset role;
set role anon;
select pg_temp.chk('anon: reads no checks', (select count(*) from public.section_checks) = 0);
reset role;

-- ── Cascades ──
-- A section removed in 05 takes its check with it (a section with no writing:
-- 0016 keeps sections with writing; a check row with no version is allowed).
set role service_role;
select pg_temp.expect('server: a check with no version link works', pg_temp.save(:'s22', :A, :BOOK1, null, '[]', pg_temp.areas('pass', 'pass', 'pass')), 'OK 1');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('cascade: delete the section with no writing (as its owner)', format($q$delete from public.sections where id = %L$q$, :'s22'), 'OK 1');
reset role;
select pg_temp.chk('cascade: the section''s check is gone', (pg_temp.chk_row(:'s22')).section_id is null and pg_temp.nchecks() = 4);
-- A book delete takes every check of the book.
set role authenticated;
select pg_temp.expect('cascade: delete the book (as its owner)', format($q$delete from public.books where id = %L$q$, :BOOK1), 'OK 1');
reset role;
select pg_temp.chk('cascade: the book''s checks are gone, B''s stays', pg_temp.nchecks() = 1 and (pg_temp.chk_row(:'sb')).section_id = :'sb');
