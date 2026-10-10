-- 0020 generate section: section_runs (server only, the user's stop), the run
-- RPCs (begin, beat, finish, recover), the usage row and tokens_estimated, a
-- stale run (rule A), a partial counts as writing only while current, the
-- marker is not words, the restore label, and heartbeats and stops are not
-- AI calls (rule C).
-- Run: supabase/tests/sql/run.sh t0020.sql
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
create function pg_temp.run(s uuid) returns public.section_runs language sql security definer as $$
  select * from public.section_runs where section_id = s $$;
create function pg_temp.usage(i bigint) returns public.ai_usage language sql security definer as $$
  select * from public.ai_usage where id = i $$;
create function pg_temp.nusage() returns bigint language sql security definer as $$ select count(*) from public.ai_usage $$;
create function pg_temp.ver(s uuid, n int) returns public.section_versions language sql security definer as $$
  select * from public.section_versions where section_id = s and version_no = n $$;
create function pg_temp.cur(s uuid) returns uuid language sql security definer as $$
  select current_version_id from public.sections where id = s $$;
create function pg_temp.sect(s uuid) returns public.sections language sql security definer as $$
  select * from public.sections where id = s $$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.outline(n int) returns jsonb language sql as $$
  select jsonb_build_object('intro_words', 1000, 'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object('title', 'Chapter ' || i, 'objective', 'Reader can do the moves of chapter ' || i || '.',
                  'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450))) order by i)
                 from generate_series(1, n) i)) $$;
grant execute on function pg_temp.outline(int) to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3)) is not null as o1 \gset
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000002';
select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(1)) is not null as o2 \gset
reset role;
\set S11 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 1)'
\set S12 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 2)'
\set S21 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 2, 1)'
\set S22 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 2, 2)'
\set S31 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 3, 1)'
\set SB 'pg_temp.sec(''b0000000-0000-4000-8000-000000000002'', 1, 1)'
\set R1 '''f0000000-0000-4000-8000-000000000001'''
\set R2 '''f0000000-0000-4000-8000-000000000002'''
\set R3 '''f0000000-0000-4000-8000-000000000003'''
\set R4 '''f0000000-0000-4000-8000-000000000004'''
\set R5 '''f0000000-0000-4000-8000-000000000005'''
\set R6 '''f0000000-0000-4000-8000-000000000006'''
\set R7 '''f0000000-0000-4000-8000-000000000007'''
\set R8 '''f0000000-0000-4000-8000-000000000008'''
\set R9 '''f0000000-0000-4000-8000-000000000009'''

-- A real-length generated section (design 22, 4.2), with a marker.
create function pg_temp.gen_text() returns text language sql as $$
  select 'Shoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%. [Verify: no source]'
      || E'\n\n' || 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level.'
      || E'\n\n' || '- Sit near the front of your chair' || E'\n' || '- Keep both feet flat on the floor' $$;
grant execute on function pg_temp.gen_text() to public;

-- ── Words and joining ──
select pg_temp.chk('words: the marker is not words', public.md_word_count('Studies show 40% less pain. [Verify: no source]') = 5);
select pg_temp.chk('words: marker between sentences', public.md_word_count('One two. [Verify: no source] Three.') = 3);
select pg_temp.chk('words: the 0018 rule otherwise', public.md_word_count(E'## Title\n\n- one **two**') = 3);
set role service_role;
select pg_temp.chk('join: blank base', public.write_join('', E'  New text.\n') = 'New text.');
select pg_temp.chk('join: finished sentence → new paragraph', public.write_join('Sit tall.', 'Breathe out.') = E'Sit tall.\n\nBreathe out.');
select pg_temp.chk('join: mid-sentence → a space', public.write_join('Lift your shoulders up toward', 'your ears, then roll them back.') = 'Lift your shoulders up toward your ears, then roll them back.');
select pg_temp.chk('join: after a list item → new paragraph', public.write_join(E'Steps:\n\n- Sit near the front', 'Next, breathe.') = E'Steps:\n\n- Sit near the front\n\nNext, breathe.');
select pg_temp.chk('join: blank addition keeps the base', public.write_join('Sit tall.', '  ') = 'Sit tall.');
reset role;

-- ── The browser cannot write runs or call the server RPCs ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('user: insert a run refused', format($q$insert into public.section_runs (section_id, user_id, book_id, run_id, state) values (%s, '00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %L, 'running')$q$, :'S11', :R1), '42501%');
select pg_temp.expect('user: section_run_begin refused', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 1000, 'm')$q$, :'S11', :R1), '42501%');
select pg_temp.expect('user: section_run_beat refused', format($q$select public.section_run_beat(%L, 'x', 1, 1)$q$, :R1), '42501%');
select pg_temp.expect('user: section_run_finish refused', format($q$select public.section_run_finish(%L, 'x', false, 'complete', 'ok', true, 1, 1, false)$q$, :R1), '42501%');
select pg_temp.expect('user: write_join refused', $q$select public.write_join('a', 'b')$q$, '42501%');
reset role;
set role anon;
select pg_temp.expect('anon: request_section_stop refused', format($q$select public.request_section_stop(%L)$q$, :R1), '42501%');
reset role;

-- ── Begin (claim) ──
set role service_role;
select pg_temp.nusage() as u0 \gset
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S11, :R1, null, 7400, 'claude-sonnet-5-5') as b1 \gset
select pg_temp.chk('begin: a usage row, failed, not counted, estimated, 0 tokens',
  (pg_temp.usage((:'b1'::jsonb ->> 'usage_id')::bigint)).status = 'failed' and not (pg_temp.usage((:'b1'::jsonb ->> 'usage_id')::bigint)).counted
  and (pg_temp.usage((:'b1'::jsonb ->> 'usage_id')::bigint)).tokens_estimated and (pg_temp.usage((:'b1'::jsonb ->> 'usage_id')::bigint)).input_tokens = 0
  and (pg_temp.usage((:'b1'::jsonb ->> 'usage_id')::bigint)).stage = 'section_write' and pg_temp.nusage() = :u0 + 1, :'b1');
select pg_temp.chk('begin: the run is running, reserve kept, nothing recovered',
  (pg_temp.run(:S11)).state = 'running' and (pg_temp.run(:S11)).reserved_tokens = 7400 and :'b1'::jsonb -> 'recovered' = 'null'::jsonb);
select pg_temp.expect('begin again while fresh: run_in_progress', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 7400, 'm')$q$, :'S11', :R2), 'P0001 run_in_progress%');
select pg_temp.chk('run_in_progress: no new usage row', pg_temp.nusage() = :u0 + 1);
select pg_temp.expect('begin: another user''s section is not found', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 1, 'm')$q$, :'SB', :R2), 'P0002 section_not_found%');
select pg_temp.expect('begin: the wrong book is not found', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', %s, %L, null, 1, 'm')$q$, :'S12', :R2), 'P0002 section_not_found%');

-- ── Beat and the user's stop ──
select public.section_run_beat(:R1, 'Shoulder rolls ease the stiffness', 4321, 9) as beat1 \gset
select pg_temp.chk('beat: running, no stop', :'beat1'::jsonb = '{"running": true, "stop": false}'::jsonb, :'beat1');
select pg_temp.chk('beat: crash copy and tokens on the run and the usage row',
  (pg_temp.run(:S11)).content = 'Shoulder rolls ease the stiffness' and (pg_temp.run(:S11)).input_tokens = 4321
  and (pg_temp.usage((pg_temp.run(:S11)).usage_id)).input_tokens = 4321 and (pg_temp.usage((pg_temp.run(:S11)).usage_id)).output_tokens = 9);
select pg_temp.chk('beat: not an AI call (no usage row)', pg_temp.nusage() = :u0 + 1);
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('stop: another user cannot stop it', not public.request_section_stop(:R1));
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('stop: a direct update by the user refused', format($q$update public.section_runs set stop_requested_at = now() where run_id = %L$q$, :R1), '42501 runs_server_only%');
select pg_temp.expect('stop: the user cannot change the content', format($q$update public.section_runs set content = 'mine' where run_id = %L$q$, :R1), '42501 runs_server_only%');
select pg_temp.expect('stop: the user cannot delete a run', format($q$delete from public.section_runs where run_id = %L$q$, :R1), '42501%');
select pg_temp.chk('stop: the owner stops it', public.request_section_stop(:R1));
select pg_temp.chk('stop: only stop_requested_at changed', (pg_temp.run(:S11)).stop_requested_at is not null and (pg_temp.run(:S11)).state = 'running'
  and (pg_temp.run(:S11)).content = 'Shoulder rolls ease the stiffness');
select pg_temp.chk('stop: the user reads their run', (select count(*) from public.section_runs) = 1);
select pg_temp.chk('stop: not an AI call (no usage row)', pg_temp.nusage() = :u0 + 1);
reset role;
set role service_role;
select pg_temp.chk('beat after stop: stop true', (public.section_run_beat(:R1, 'Shoulder rolls ease the stiffness that', 4321, 10) ->> 'stop')::boolean);

-- ── Finish: stopped by the user → partial, not current, counted, estimated ──
select public.section_run_finish(:R1, 'Shoulder rolls ease the stiffness that builds up after long hours of', true, 'user_stop', 'stopped', true, 4321, 20, true) as f1 \gset
select pg_temp.chk('stop: a partial version, not current',
  (:'f1'::jsonb ->> 'partial')::boolean and not (:'f1'::jsonb ->> 'current')::boolean and pg_temp.cur(:S11) is null
  and (pg_temp.ver(:S11, 1)).partial and (pg_temp.ver(:S11, 1)).source = 'generate' and (pg_temp.ver(:S11, 1)).label is null, :'f1');
select pg_temp.chk('stop: usage stopped, counted, estimated, tokens',
  (pg_temp.usage((pg_temp.run(:S11)).usage_id)).status = 'stopped' and (pg_temp.usage((pg_temp.run(:S11)).usage_id)).counted
  and (pg_temp.usage((pg_temp.run(:S11)).usage_id)).tokens_estimated and (pg_temp.usage((pg_temp.run(:S11)).usage_id)).output_tokens = 20);
select pg_temp.chk('stop: the run ended, content cleared, version linked', (pg_temp.run(:S11)).state = 'ended' and (pg_temp.run(:S11)).end_reason = 'user_stop'
  and (pg_temp.run(:S11)).content = '' and (pg_temp.run(:S11)).version_id = (pg_temp.ver(:S11, 1)).id);
select pg_temp.chk('stop: the section stays Not started', (pg_temp.sect(:S11)).status = 'not_started');
select pg_temp.expect('finish twice: run_not_running', format($q$select public.section_run_finish(%L, 'x', false, 'complete', 'ok', true, 1, 1, false)$q$, :R1), 'P0001 run_not_running%');
select pg_temp.chk('a partial not kept is not writing (answer 2)', not public.section_has_writing(:S11));
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('stop on an ended run: false', not public.request_section_stop(:R1));
reset role;

-- ── Finish complete, first draft ──
set role service_role;
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S12, :R2, null, 5000, 'claude-sonnet-5-5') is not null as b2 \gset
select public.section_run_finish(:R2, pg_temp.gen_text(), false, 'complete', 'ok', true, 4500, 120, false) as f2 \gset
select pg_temp.chk('complete: v1, current, not partial, First draft (no label)',
  (:'f2'::jsonb ->> 'current')::boolean and not (:'f2'::jsonb ->> 'partial')::boolean and not (:'f2'::jsonb ->> 'conflict')::boolean
  and pg_temp.cur(:S12) = (pg_temp.ver(:S12, 1)).id and (pg_temp.ver(:S12, 1)).label is null and not (pg_temp.ver(:S12, 1)).partial, :'f2');
select pg_temp.chk('complete: the text as sent, the marker kept', (pg_temp.ver(:S12, 1)).content = pg_temp.gen_text());
select pg_temp.chk('complete: words without the marker', (pg_temp.ver(:S12, 1)).word_count = public.md_word_count(pg_temp.gen_text())
  and (:'f2'::jsonb ->> 'word_count')::int = (pg_temp.ver(:S12, 1)).word_count);
select pg_temp.chk('complete: Not started → Draft', (pg_temp.sect(:S12)).status = 'draft' and not (pg_temp.sect(:S12)).needs_review);
select pg_temp.chk('complete: usage ok, counted, exact', (pg_temp.usage((pg_temp.run(:S12)).usage_id)).status = 'ok'
  and (pg_temp.usage((pg_temp.run(:S12)).usage_id)).counted and not (pg_temp.usage((pg_temp.run(:S12)).usage_id)).tokens_estimated
  and (pg_temp.usage((pg_temp.run(:S12)).usage_id)).input_tokens = 4500 and (pg_temp.usage((pg_temp.run(:S12)).usage_id)).output_tokens = 120);
select pg_temp.chk('complete: writing', public.section_has_writing(:S12));

-- ── Generate the rest: base text + join + new text, "Continued" ──
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S12, :R3, pg_temp.cur(:S12), 5000, 'm') is not null as b3 \gset
select public.section_run_finish(:R3, 'Next, breathe out slowly as you lower your shoulders.', false, 'complete', 'ok', true, 5000, 30, false) as f3 \gset
select pg_temp.chk('continue: v2 Continued, current', (pg_temp.ver(:S12, 2)).label = 'Continued' and pg_temp.cur(:S12) = (pg_temp.ver(:S12, 2)).id);
select pg_temp.chk('continue: the old text, a blank line, the new text',
  (pg_temp.ver(:S12, 2)).content = pg_temp.gen_text() || E'\n\nNext, breathe out slowly as you lower your shoulders.');
select pg_temp.chk('continue: v1 unchanged', (pg_temp.ver(:S12, 1)).content = pg_temp.gen_text());

-- ── The base changed while the AI wrote (another tab saved): saved, not current, conflict ──
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S12, :R4, pg_temp.cur(:S12), 5000, 'm') is not null as b4 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 2), 'Typed in another tab.', pg_temp.cur(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 2))) is not null as typed \gset
reset role;
set role service_role;
select public.section_run_finish(:R4, 'Keep your elbows soft.', false, 'complete', 'ok', true, 5000, 10, false) as f4 \gset
select pg_temp.chk('conflict: saved, not current, conflict true', (:'f4'::jsonb ->> 'conflict')::boolean and not (:'f4'::jsonb ->> 'current')::boolean
  and (pg_temp.ver(:S12, 4)).content like '%Keep your elbows soft.' and pg_temp.cur(:S12) = (pg_temp.ver(:S12, 3)).id, :'f4');

-- ── Blank text: no version, the usage row still ends ──
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S21, :R5, null, 5000, 'm') is not null as b5 \gset
select public.section_run_finish(:R5, E'  \n ', true, 'user_stop', 'stopped', true, 4300, 0, true) as f5 \gset
select pg_temp.chk('blank: no version, run ended', :'f5'::jsonb -> 'version_id' = 'null'::jsonb and (pg_temp.run(:S21)).state = 'ended'
  and (select count(*) from public.section_versions where section_id = :S21) = 0, :'f5');
select pg_temp.chk('stop before any text: the input counts (answer 3)', (pg_temp.usage((pg_temp.run(:S21)).usage_id)).counted
  and (pg_temp.usage((pg_temp.run(:S21)).usage_id)).input_tokens = 4300 and (pg_temp.usage((pg_temp.run(:S21)).usage_id)).status = 'stopped');

-- ── Over 100,000 characters: cut and partial ──
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S22, :R6, null, 5000, 'm') is not null as b6 \gset
select public.section_run_finish(:R6, repeat('word ', 20500), false, 'complete', 'ok', true, 1, 1, false) as f6 \gset
select pg_temp.chk('too long: cut at 100,000, partial, not current', char_length((pg_temp.ver(:S22, 1)).content) = 100000 and (pg_temp.ver(:S22, 1)).partial
  and pg_temp.cur(:S22) is null, :'f6');

-- ── Base check and drafts at the claim ──
select pg_temp.expect('base: an old base is a conflict', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 1, 'm')$q$, :'S12', :R7), 'P0001 version_conflict%');
insert into public.section_drafts (section_id, user_id, content) values (:S31, '00000000-0000-4000-8000-00000000000a', 'Typed and not saved.');
select pg_temp.expect('draft: unsaved typing refuses the claim', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 1, 'm')$q$, :'S31', :R7), 'P0001 unsaved_draft%');
update public.section_drafts set content = E' \n' where section_id = :S31;
select pg_temp.expect('draft: a blank draft does not block (0019 case)', format($q$select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', %s, %L, null, 1, 'm')$q$, :'S31', :R7), 'OK 1');
select public.section_run_finish(:R7, 'Sit tall without strain.', false, 'complete', 'ok', true, 1, 1, false) is not null as f7 \gset
select pg_temp.chk('complete: the blank draft goes (no false conflict on the next open)', not exists (select 1 from public.section_drafts where section_id = :S31));

-- ── Rule A: a stale run is a server failure; its text becomes a partial version ──
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S31, :R8, pg_temp.cur(:S31), 6000, 'm') as b8 \gset
select public.section_run_beat(:R8, 'Then breathe in as you lift your', 4400, 9) is not null as beat8 \gset
update public.section_runs set heartbeat_at = now() - interval '25 seconds' where run_id = :R8;
select pg_temp.chk('stale: not fresh any more', not public.section_run_fresh(pg_temp.run(:S31)));
select public.section_run_begin('00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', :S31, :R9, pg_temp.cur(:S31), 6000, 'm') as b9 \gset
select pg_temp.chk('stale: the next claim recovers v2', (:'b9'::jsonb ->> 'recovered')::int = 2, :'b9');
select pg_temp.chk('stale: the crash copy is a partial, Continued, not current',
  (pg_temp.ver(:S31, 2)).partial and (pg_temp.ver(:S31, 2)).label = 'Continued'
  and (pg_temp.ver(:S31, 2)).content = 'Sit tall without strain.' || E'\n\n' || 'Then breathe in as you lift your'
  and pg_temp.cur(:S31) = (pg_temp.ver(:S31, 1)).id);
select pg_temp.chk('stale: its usage is failed, not counted, estimated, with the last beat',
  (pg_temp.usage((:'b8'::jsonb ->> 'usage_id')::bigint)).status = 'failed' and not (pg_temp.usage((:'b8'::jsonb ->> 'usage_id')::bigint)).counted
  and (pg_temp.usage((:'b8'::jsonb ->> 'usage_id')::bigint)).tokens_estimated and (pg_temp.usage((:'b8'::jsonb ->> 'usage_id')::bigint)).input_tokens = 4400);
select pg_temp.chk('stale: the new run has its own usage row', (:'b9'::jsonb ->> 'usage_id')::bigint <> (:'b8'::jsonb ->> 'usage_id')::bigint
  and (pg_temp.run(:S31)).run_id = 'f0000000-0000-4000-8000-000000000009' and (pg_temp.run(:S31)).state = 'running');
select pg_temp.chk('stale: the old run''s beat says taken over', public.section_run_beat(:R8, 'x', 1, 1) = '{"running": false, "stop": true}'::jsonb);
select pg_temp.expect('stale: the old run cannot finish', format($q$select public.section_run_finish(%L, 'x', false, 'complete', 'ok', true, 1, 1, false)$q$, :R8), 'P0001 run_not_running%');
update public.section_runs set started_at = now() - interval '170 seconds', heartbeat_at = now() where run_id = :R9;
select pg_temp.chk('stale: older than 160 s even with a fresh beat', not public.section_run_fresh(pg_temp.run(:S31)));
update public.section_runs set started_at = now() where run_id = :R9;

-- ── Needs review when the positioning was unlocked during the run ──
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.unlock_positioning('b0000000-0000-4000-8000-000000000001') is not null as unl \gset
reset role;
set role service_role;
select public.section_run_finish(:R9, 'Hold the pose for a slow breath.', false, 'complete', 'ok', true, 1, 1, false) is not null as f9 \gset
select pg_temp.chk('unlocked during the run: current, marked Needs review', pg_temp.cur(:S31) = (pg_temp.ver(:S31, 3)).id and (pg_temp.sect(:S31)).needs_review);
reset role;

-- ── Answer 2: a partial counts as writing only while current ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('partial not kept: S22 (only a cut partial) has no writing', not public.section_has_writing(:S22));
select pg_temp.chk('outline_json: has_writing false for a partial not kept',
  not (jsonb_path_query_first(public.outline_json('b0000000-0000-4000-8000-000000000001'), '$[1].sections[0]') ->> 'has_writing')::boolean);
select pg_temp.expect('partial not kept: Remove the section is allowed', format($q$delete from public.sections where id = %s$q$, :'S22'), 'OK 1');
-- Keep partial text = restore_version: a new current version, the partial row unchanged.
select (public.restore_version(:S11, (pg_temp.ver(:S11, 1)).id, null)) as kept \gset
select pg_temp.chk('keep partial: "Kept partial text from v1", current', (pg_temp.ver(:S11, 2)).label = 'Kept partial text from v1'
  and pg_temp.cur(:S11) = (pg_temp.ver(:S11, 2)).id and not (pg_temp.ver(:S11, 2)).partial and (pg_temp.ver(:S11, 1)).partial, :'kept');
select pg_temp.chk('keep partial: now writing', public.section_has_writing(:S11));
select pg_temp.chk('restore of a full version keeps the 0018 label', (pg_temp.ver(:S12, 5)) is null);
select (public.restore_version(:S12, (pg_temp.ver(:S12, 1)).id, pg_temp.cur(:S12))) is not null as r12 \gset
select pg_temp.chk('restore of a full version: "Restored from v1"', (pg_temp.ver(:S12, 5)).label = 'Restored from v1');

-- ── RLS: B sees nothing of A's runs ──
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('B reads none of A''s runs', (select count(*) from public.section_runs) = 0);
select pg_temp.expect('B updates 0 of A''s runs (RLS)', $q$update public.section_runs set stop_requested_at = now()$q$, 'OK 0');
reset role;

-- ── Book delete removes runs ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('delete the book', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;
select pg_temp.chk('book delete: no runs left for it', (select count(*) from public.section_runs where book_id = 'b0000000-0000-4000-8000-000000000001') = 0);
select pg_temp.chk('book delete: usage rows keep their history', (select count(*) from public.ai_usage where stage = 'section_write') >= 9);
