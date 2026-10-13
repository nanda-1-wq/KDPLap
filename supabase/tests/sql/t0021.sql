-- 0021 section suggestions (E10.3 Improve menu): the table (server only, RLS,
-- the owner and version guards, the checks), the replaced version guard, and
-- apply_suggestion: success, once, 1 hour, the base rules (decision 6), the
-- draft (decision A: save_version then apply_suggestion), a fresh run, the
-- text check, 100,000 characters, Needs review, Reviewed and Final kept.
-- Run: supabase/tests/sql/run.sh t0021.sql
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
create function pg_temp.nver(s uuid) returns bigint language sql security definer as $$
  select count(*) from public.section_versions where section_id = s $$;
create function pg_temp.sect(s uuid) returns public.sections language sql security definer as $$
  select * from public.sections where id = s $$;
create function pg_temp.sug(i uuid) returns public.section_suggestions language sql security definer as $$
  select * from public.section_suggestions where id = i $$;
create function pg_temp.has_draft(s uuid) returns boolean language sql security definer as $$
  select exists (select 1 from public.section_drafts where section_id = s) $$;
create function pg_temp.nusage() returns bigint language sql security definer as $$ select count(*) from public.ai_usage $$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.outline(n int) returns jsonb language sql as $$
  select jsonb_build_object('intro_words', 1000, 'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object('title', 'Chapter ' || i, 'objective', 'Reader can do the moves of chapter ' || i || '.',
                  'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450))) order by i)
                 from generate_series(1, n) i)) $$;
-- Real-length text (design 22, 4.2): the passage is the middle two sentences.
create function pg_temp.t1() returns text language sql as $$
  select 'Shoulder rolls ease the stiffness that builds up after long hours of sitting. Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this five times. [Verify: no source]'
      || E'\n\n' || 'Keep your neck long and your chin level. Breathe out as you roll back.' $$;
create function pg_temp.sel() returns text language sql as $$
  select 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this five times. [Verify: no source]' $$;
create function pg_temp.out() returns text language sql as $$
  select 'Lift your shoulders toward your ears. Then roll them back and down in a slow circle, five times. [Verify: no source]' $$;
create function pg_temp.full(base text, o text) returns text language sql as $$ select replace(base, pg_temp.sel(), o) $$;
grant execute on all functions in schema pg_temp to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3)) is not null as o1 \gset
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000002';
select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(1)) is not null as o2 \gset
reset role;
select pg_temp.sec(:BOOK1, 1, 1) as s11, pg_temp.sec(:BOOK1, 1, 2) as s12, pg_temp.sec(:BOOK1, 2, 1) as s21,
       pg_temp.sec(:BOOK1, 2, 2) as s22, pg_temp.sec(:BOOK1, 3, 1) as s31, pg_temp.sec(:BOOK1, 3, 2) as s32,
       pg_temp.sec(:BOOK2, 1, 1) as sb \gset

-- First versions, saved by the writer (save_version, 0018).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(:'s11', pg_temp.t1(), null) is not null as v \gset
select public.save_version(:'s12', pg_temp.t1(), null) is not null as v \gset
select public.save_version(:'s21', pg_temp.t1(), null) is not null as v \gset
select public.save_version(:'s32', 'A short other section.', null) is not null as v \gset
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select public.save_version(:'sb', pg_temp.t1(), null) is not null as v \gset
reset role;
select (pg_temp.ver(:'s11', 1)).id as v11, (pg_temp.ver(:'s12', 1)).id as v12, (pg_temp.ver(:'s21', 1)).id as v21,
       (pg_temp.ver(:'s32', 1)).id as v32, (pg_temp.ver(:'sb', 1)).id as vb \gset

-- ── The table ──
select pg_temp.chk('RLS on', (select relrowsecurity from pg_class where oid = 'public.section_suggestions'::regclass));
select pg_temp.chk('indexes on every foreign key and user_id',
  (select count(*) from pg_indexes where tablename = 'section_suggestions' and indexname like '%\_idx') = 5);

-- The server saves suggestions (service role).
set role service_role;
insert into public.section_suggestions (user_id, book_id, section_id, action, base_version_id, selection, output, flagged, notes, created_at)
values (:A, :BOOK1, :'s11', 'improve', :'v11', pg_temp.sel(), pg_temp.out(), 1, '{"markersLost": 0, "newNames": [], "structureChanged": false}', '2000-01-01')
returning id as g1 \gset
select pg_temp.chk('server: insert works, created_at is the server clock', (pg_temp.sug(:'g1')).created_at > now() - interval '1 minute'
  and (pg_temp.sug(:'g1')).used_at is null and (pg_temp.sug(:'g1')).version_id is null);
select pg_temp.expect('server: another user''s section refused (owner guard)', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', 'a b c', 'a b d')$q$, :B, :BOOK1, :'s11'), 'P0001 suggestion_owner%');
select pg_temp.expect('server: the wrong book refused (owner guard)', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', 'a b c', 'a b d')$q$, :A, :BOOK2, :'s11'), 'P0001 suggestion_owner%');
select pg_temp.expect('server: a base from another section refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, base_version_id, selection, output) values (%L, %L, %L, 'improve', %L, 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11', :'v12'), 'P0001 version_other_section%');
select pg_temp.expect('server: an unknown action refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'rewrite', 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: Custom without an instruction refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'custom', 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%custom_check%');
select pg_temp.expect('server: an instruction on Improve refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, instruction, selection, output) values (%L, %L, %L, 'improve', 'Shorter.', 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%custom_check%');
select pg_temp.expect('server: a blank instruction refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, instruction, selection, output) values (%L, %L, %L, 'custom', E' \n ', 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: an instruction of 301 characters refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, instruction, selection, output) values (%L, %L, %L, 'custom', repeat('x', 301), 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: an instruction of 300 characters works', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, instruction, selection, output) values (%L, %L, %L, 'custom', repeat('x', 300), 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), 'OK 1');
select pg_temp.expect('server: an empty selection refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', '', 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: a selection of 15,001 characters refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', repeat('x', 15001), 'a b d')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: a selection of 15,000 characters works', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', repeat('x', 15000), 'a b d')$q$, :A, :BOOK1, :'s11'), 'OK 1');
select pg_temp.expect('server: an output of 25,001 characters refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'expand', 'a b c', repeat('x', 25001))$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: an output of 25,000 characters works', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'expand', 'a b c', repeat('x', 25000))$q$, :A, :BOOK1, :'s11'), 'OK 1');
select pg_temp.expect('server: an empty output refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', 'a b c', '')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: notes must be an object', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output, notes) values (%L, %L, %L, 'improve', 'a b c', 'a b d', '[]')$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: flagged is never negative', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output, flagged) values (%L, %L, %L, 'improve', 'a b c', 'a b d', -1)$q$, :A, :BOOK1, :'s11'), '23514%');
select pg_temp.expect('server: a version link needs used_at', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output, version_id) values (%L, %L, %L, 'improve', 'a b c', 'a b d', %L)$q$, :A, :BOOK1, :'s11', :'v11'), '23514%used_check%');
insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output)
values (:B, :BOOK2, :'sb', 'shorten', pg_temp.sel(), 'Lift and roll your shoulders five times. [Verify: no source]') returning id as gb \gset
reset role;

-- ── The browser cannot write suggestions ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('user: reads own suggestions only', (select count(*) from public.section_suggestions) = 4
  and not exists (select 1 from public.section_suggestions where user_id <> '00000000-0000-4000-8000-00000000000a'));
select pg_temp.expect('user: insert refused', format($q$insert into public.section_suggestions (user_id, book_id, section_id, action, selection, output) values (%L, %L, %L, 'improve', 'a b c', 'a b d')$q$, :A, :BOOK1, :'s11'), '42501%');
select pg_temp.expect('user: set used_at directly refused', format($q$update public.section_suggestions set used_at = now() where id = %L$q$, :'g1'), '42501 suggestions_server_only%');
select pg_temp.expect('user: change the output refused', format($q$update public.section_suggestions set output = 'mine' where id = %L$q$, :'g1'), '42501 suggestions_server_only%');
select pg_temp.expect('user: delete refused', format($q$delete from public.section_suggestions where id = %L$q$, :'g1'), '42501%');
select pg_temp.expect('user: a direct version with source improve refused', format($q$insert into public.section_versions (section_id, version_no, content, source) values (%L, 9, 'x', 'improve')$q$, :'s11'), '42501 versions_rpc_only%');
select pg_temp.expect('user: a direct manual version still refused', format($q$insert into public.section_versions (section_id, version_no, content, source) values (%L, 9, 'x', 'manual')$q$, :'s11'), '42501 versions_rpc_only%');
reset role;
set role anon;
select pg_temp.expect('anon: apply_suggestion refused', format($q$select public.apply_suggestion(%L, %L, 'x')$q$, :'g1', :'v11'), '42501%');
reset role;

-- ── apply_suggestion: refusals ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('another user''s suggestion is not found', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0002 suggestion_not_found%');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('an unknown id is not found', format($q$select public.apply_suggestion(%L, %L, 'x')$q$, '0e000000-0000-4000-8000-000000000000', :'v11'), 'P0002 suggestion_not_found%');
select pg_temp.expect('no text: bad_content', format($q$select public.apply_suggestion(%L, %L, null)$q$, :'g1', :'v11'), '22023 bad_content%');
select pg_temp.expect('a null base: version_conflict', format($q$select public.apply_suggestion(%L, null, %L)$q$, :'g1', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 version_conflict%');
select pg_temp.expect('a base from another section: version_conflict', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v12', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 version_conflict%');
select pg_temp.expect('text without the output: suggestion_mismatch', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.t1() || ' More.'), 'P0001 suggestion_mismatch%');
select pg_temp.expect('the output, but other text changed too: suggestion_mismatch', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', replace(pg_temp.full(pg_temp.t1(), pg_temp.out()), 'chin level', 'chin up')), 'P0001 suggestion_mismatch%');
select pg_temp.expect('the output in the wrong place: suggestion_mismatch', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', replace(pg_temp.t1(), 'Keep your neck long and your chin level.', pg_temp.out())), 'P0001 suggestion_mismatch%');
select pg_temp.expect('only the output (the rest dropped): suggestion_mismatch', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.out()), 'P0001 suggestion_mismatch%');
-- Another tab typed (a draft that differs from the current version).
insert into public.section_drafts (section_id, content, base_version_id) values (:'s11', pg_temp.t1() || ' Typed in tab B.', :'v11');
select pg_temp.expect('a draft with other text: unsaved_draft', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 unsaved_draft%');
update public.section_drafts set content = pg_temp.t1() where section_id = :'s11';
reset role;
-- A fresh Generate run on the section.
set role service_role;
insert into public.section_runs (section_id, user_id, book_id, run_id, state, base_version_id)
values (:'s11', :A, :BOOK1, 'f0000000-0000-4000-8000-000000000001', 'running', :'v11');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('a fresh Generate run: run_in_progress', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 run_in_progress%');
reset role;
update public.section_runs set heartbeat_at = now() - interval '21 seconds' where section_id = :'s11';
-- Older than 1 hour.
update public.section_suggestions set created_at = now() - interval '61 minutes' where id = :'g1';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('older than 1 hour: suggestion_expired', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', :'v11', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 suggestion_expired%');
reset role;
update public.section_suggestions set created_at = now() - interval '59 minutes' where id = :'g1';
update public.sections set status = 'not_started' where id = :'s11';
select pg_temp.chk('nothing was saved by the refusals', pg_temp.nver(:'s11') = 1 and (pg_temp.sug(:'g1')).used_at is null);

-- ── apply_suggestion: success (a stale run, a draft equal to the current version, 59 minutes old) ──
select pg_temp.nusage() as u0 \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.apply_suggestion(:'g1', :'v11', pg_temp.full(pg_temp.t1(), pg_temp.out())) as a1 \gset
reset role;
select pg_temp.chk('apply: v2, source improve, current', (pg_temp.ver(:'s11', 2)).source = 'improve'
  and (pg_temp.sect(:'s11')).current_version_id = (pg_temp.ver(:'s11', 2)).id and pg_temp.nver(:'s11') = 2, :'a1');
select pg_temp.chk('apply: the text as sent, the marker kept', (pg_temp.ver(:'s11', 2)).content = pg_temp.full(pg_temp.t1(), pg_temp.out())
  and (pg_temp.ver(:'s11', 2)).content like '%five times. [Verify: no source]%');
select pg_temp.chk('apply: word count from md_word_count', (pg_temp.ver(:'s11', 2)).word_count = public.md_word_count(pg_temp.full(pg_temp.t1(), pg_temp.out())));
select pg_temp.chk('apply: the reply', :'a1'::jsonb ->> 'id' = (pg_temp.ver(:'s11', 2)).id::text and (:'a1'::jsonb ->> 'version_no')::int = 2
  and (:'a1'::jsonb ->> 'word_count')::int = (pg_temp.ver(:'s11', 2)).word_count and :'a1'::jsonb ->> 'source' = 'improve' and :'a1'::jsonb ? 'created_at', :'a1');
select pg_temp.chk('apply: no label, not partial', (pg_temp.ver(:'s11', 2)).label is null and not (pg_temp.ver(:'s11', 2)).partial);
select pg_temp.chk('apply: Not started → Draft, no Needs review', (pg_temp.sect(:'s11')).status = 'draft' and not (pg_temp.sect(:'s11')).needs_review);
select pg_temp.chk('apply: a draft equal to the current version did not block, and is deleted', not pg_temp.has_draft(:'s11'));
select pg_temp.chk('apply: the suggestion is used, linked to the version', (pg_temp.sug(:'g1')).used_at is not null
  and (pg_temp.sug(:'g1')).version_id = (pg_temp.ver(:'s11', 2)).id);
select pg_temp.chk('apply: a stale run (still running, heartbeat 21 s old) did not block',
  (select state from public.section_runs where section_id = :'s11') = 'running');
select pg_temp.chk('apply: not an AI call (no usage row)', pg_temp.nusage() = :u0);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('apply twice: suggestion_used', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g1', (pg_temp.ver(:'s11', 2)).id, pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 suggestion_used%');
select pg_temp.expect('user: a used suggestion stays closed', format($q$update public.section_suggestions set used_at = null where id = %L$q$, :'g1'), '42501 suggestions_server_only%');
select pg_temp.chk('save_version still saves manual', (public.save_version(:'s11', pg_temp.full(pg_temp.t1(), pg_temp.out()) || ' Rest.', (pg_temp.ver(:'s11', 2)).id) ->> 'version_no')::int = 3);
reset role;
select pg_temp.chk('save_version: source manual', (pg_temp.ver(:'s11', 3)).source = 'manual');

-- ── Decision A: save_version then apply_suggestion in a row (Final kept) ──
set role service_role;
insert into public.section_suggestions (user_id, book_id, section_id, action, base_version_id, selection, output)
values (:A, :BOOK1, :'s12', 'expand', :'v12', pg_temp.sel(),
        'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this five times. [Verify: no source] Move slowly, and stop if anything hurts.')
returning id as g2 \gset
select output as o2 from public.section_suggestions where id = :'g2' \gset
reset role;
update public.sections set status = 'final' where id = :'s12';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
-- While the AI worked, the writer typed elsewhere (autosave wrote a draft).
insert into public.section_drafts (section_id, content, base_version_id) values (:'s12', pg_temp.t1() || E'\n\nRest your hands on your thighs.', :'v12');
select pg_temp.expect('decision A: before the manual save, the typed draft blocks', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g2', :'v12', pg_temp.full(pg_temp.t1(), :'o2')), 'P0001 unsaved_draft%');
-- Accept: the manual version first (its id is the new base), then apply.
select public.save_version(:'s12', pg_temp.t1() || E'\n\nRest your hands on your thighs.', :'v12') ->> 'id' as m2 \gset
select pg_temp.expect('decision 6: text built from the suggestion''s base, not the manual version: suggestion_mismatch', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g2', :'m2', pg_temp.full(pg_temp.t1(), :'o2')), 'P0001 suggestion_mismatch%');
select pg_temp.expect('decision 6: the old base after the manual save: version_conflict', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g2', :'v12', pg_temp.full(pg_temp.t1(), :'o2')), 'P0001 version_conflict%');
select public.apply_suggestion(:'g2', :'m2', pg_temp.full(pg_temp.t1() || E'\n\nRest your hands on your thighs.', :'o2')) as a2 \gset
reset role;
select pg_temp.chk('decision A: passes, no unsaved_draft', :'a2'::jsonb ->> 'source' = 'expand', :'a2');
select pg_temp.chk('decision A: two versions, manual then expand', pg_temp.nver(:'s12') = 3
  and (pg_temp.ver(:'s12', 2)).source = 'manual' and (pg_temp.ver(:'s12', 3)).source = 'expand'
  and (pg_temp.sect(:'s12')).current_version_id = (pg_temp.ver(:'s12', 3)).id);
select pg_temp.chk('decision A: the typed text and the expanded passage are both kept',
  (pg_temp.ver(:'s12', 3)).content like '%Move slowly, and stop if anything hurts.%Rest your hands on your thighs.');
select pg_temp.chk('decision 7: Final kept', (pg_temp.sect(:'s12')).status = 'final');

-- ── A base older than the suggestion's base ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(:'s21', pg_temp.t1() || ' Two.', :'v21') ->> 'id' as v21b \gset
reset role;
set role service_role;
insert into public.section_suggestions (user_id, book_id, section_id, action, base_version_id, selection, output)
values (:A, :BOOK1, :'s21', 'humanize', :'v21b', pg_temp.sel(), pg_temp.out()) returning id as g3 \gset
reset role;
update public.sections set status = 'reviewed' where id = :'s21';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('a base older than the suggestion''s base: version_conflict', format($q$select public.apply_suggestion(%L, %L, %L)$q$, :'g3', :'v21', pg_temp.full(pg_temp.t1(), pg_temp.out())), 'P0001 version_conflict%');
select pg_temp.chk('Humanize applies on the newer base', (public.apply_suggestion(:'g3', :'v21b', pg_temp.full(pg_temp.t1() || ' Two.', pg_temp.out())) ->> 'source') = 'humanize');
reset role;
select pg_temp.chk('decision 7: Reviewed kept', (pg_temp.sect(:'s21')).status = 'reviewed');

-- ── Over 100,000 characters ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(:'s22', repeat('Sit tall. ', 9980) || pg_temp.sel(), null) ->> 'id' as v22 \gset
reset role;
set role service_role;
insert into public.section_suggestions (user_id, book_id, section_id, action, base_version_id, selection, output)
values (:A, :BOOK1, :'s22', 'expand', :'v22', pg_temp.sel(), pg_temp.sel() || repeat(' Breathe out slowly.', 20)) returning id as g4 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('over 100,000 characters: section_too_long', format($q$select public.apply_suggestion(%L, %L, repeat('Sit tall. ', 9980) || (pg_temp.sug(%L)).output)$q$, :'g4', :'v22', :'g4'), 'P0001 section_too_long%');
reset role;
select pg_temp.chk('section_too_long: nothing saved', pg_temp.nver(:'s22') = 1 and (pg_temp.sug(:'g4')).used_at is null);

-- ── A section with no version yet (Custom): the manual version first; unlocked positioning → Needs review ──
set role service_role;
insert into public.section_suggestions (user_id, book_id, section_id, action, instruction, base_version_id, selection, output)
values (:A, :BOOK1, :'s31', 'custom', 'Use shorter sentences.', null, pg_temp.sel(), pg_temp.out()) returning id as g5 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.save_version(:'s31', pg_temp.t1(), null) ->> 'id' as v31 \gset
select public.unlock_positioning(:BOOK1) is not null as u \gset
reset role;
update public.sections set needs_review = false where id = :'s31';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('no base at the request: applies on the first manual version', (public.apply_suggestion(:'g5', :'v31', pg_temp.full(pg_temp.t1(), pg_temp.out())) ->> 'source') = 'custom');
reset role;
select pg_temp.chk('unlocked positioning: Needs review', (pg_temp.sect(:'s31')).needs_review and (pg_temp.ver(:'s31', 2)).source = 'custom');
select pg_temp.chk('Custom: the version has no label (decision 3)', (pg_temp.ver(:'s31', 2)).label is null);

-- ── Deleting a book removes its suggestions (the guard lets the cascade through) ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('a book with suggestions can be deleted', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000002'$q$, 'OK 1');
reset role;
select pg_temp.chk('its suggestions are gone', pg_temp.sug(:'gb') is null);
