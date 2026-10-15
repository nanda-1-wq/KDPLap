-- 0023 G3 fixes: the book-level "has writing" the generate function now reads
-- (outline_json, P1) and the optional "unsourced" list on an AI section finding (P4).
-- Run: supabase/tests/sql/run.sh t0023.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
insert into auth.users values (:A);
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors Over 60');
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
values (:BOOK1, :A, 'A chair yoga guide for adults over 60.', 'After this book, you can follow a safe 15-minute chair routine at home.',
        'Seated poses only.', '["Too hard"]', '["Safe"]');
set role service_role;
update public.positioning set drift_checked_at = now();
reset role;

create function pg_temp.sec(b uuid, p int, s int) returns uuid language sql security definer as $$
  select x.id from public.sections x join public.chapters c on c.id = x.chapter_id where c.book_id = b and c.position = p and x.position = s $$;
create function pg_temp.ver(s uuid, n int) returns public.section_versions language sql security definer as $$
  select * from public.section_versions where section_id = s and version_no = n $$;
create function pg_temp.cur(s uuid) returns uuid language sql security definer as $$
  select current_version_id from public.sections where id = s $$;
-- What the generate function reads for outline_ideas (G3 P1): any section of outline_json with has_writing.
create function pg_temp.book_writing(b uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.outline_json(b)) c, jsonb_array_elements(c -> 'sections') s
                  where (s ->> 'has_writing')::boolean) $$;
grant execute on all functions in schema pg_temp to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
select public.replace_outline('b0000000-0000-4000-8000-000000000001', jsonb_build_object('intro_words', 1000, 'conclusion_words', 700,
  'chapters', jsonb_build_array(jsonb_build_object('title', 'Chapter 1', 'objective', 'Reader can do the moves.',
    'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450)))))) is not null as o1 \gset
reset role;
\set S11 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 1)'
\set S12 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 2)'
\set R1 '''f0000000-0000-4000-8000-000000000001'''
\set R2 '''f0000000-0000-4000-8000-000000000002'''
\set R3 '''f0000000-0000-4000-8000-000000000003'''
\set R4 '''f0000000-0000-4000-8000-000000000004'''
\set R5 '''f0000000-0000-4000-8000-000000000005'''

-- ── P1: book-level "has writing", the database rule ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('P1: a new outline has no writing', not pg_temp.book_writing(:BOOK1));
reset role;
-- A stopped first Generate: a partial version that is not current (discarded).
set role service_role;
select public.section_run_begin(:A, :BOOK1, :S11, :R1, null, 5000, 'm') is not null as b1 \gset
select public.section_run_finish(:R1, 'Lift your shoulders up toward', true, 'user_stop', 'stopped', true, 10, 5, true) is not null as f1 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('P1: setup: one partial version, not current', (pg_temp.ver(:S11, 1)).partial and pg_temp.cur(:S11) is null);
select pg_temp.chk('P1: only a discarded partial: no writing (Regenerate allowed, owner Q5)', not pg_temp.book_writing(:BOOK1));
-- A blank draft (typed and deleted) is not writing.
insert into public.section_drafts (section_id, user_id, content) values (:S12, '00000000-0000-4000-8000-00000000000a', E' \n ');
select pg_temp.chk('P1: a blank draft: no writing', not pg_temp.book_writing(:BOOK1));
-- A draft with text, never saved as a version, is writing.
update public.section_drafts set content = 'Typed and not saved.' where section_id = :S12;
select pg_temp.chk('P1: only a draft: writing (refused before the AI call)', pg_temp.book_writing(:BOOK1));
delete from public.section_drafts where section_id = :S12;
select pg_temp.chk('P1: the draft gone: no writing again', not pg_temp.book_writing(:BOOK1));
reset role;
-- A fresh Generate run is writing.
set role service_role;
select public.section_run_begin(:A, :BOOK1, :S12, :R2, null, 5000, 'm') is not null as b2 \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('P1: a fresh run: writing', pg_temp.book_writing(:BOOK1));
reset role;
set role service_role;
select public.section_run_finish(:R2, '', true, 'user_stop', 'stopped', true, 1, 0, true) is not null as f2 \gset
reset role;

-- ── P4: an AI section finding may carry "unsourced" ──
select pg_temp.chk('P4: the 0022 shape (3 keys) still passes',
  public.section_finding_ok('{"type": "drift", "message": "Off the positioning.", "quote": "Lose weight fast."}'));
select pg_temp.chk('P4: with unsourced passes',
  public.section_finding_ok('{"type": "drift", "message": "Studies show 45% skip it.", "quote": "Lose weight fast.", "unsourced": ["45"]}'));
select pg_temp.chk('P4: an objective gap with unsourced passes',
  public.section_finding_ok('{"type": "objective", "message": "Say 3 in 4 readers.", "quote": "", "unsourced": ["3 in 4"]}'));
select pg_temp.chk('P4: 10 numbers of 20 characters pass',
  public.section_finding_ok(jsonb_build_object('type', 'voice', 'message', 'm', 'quote', 'q', 'unsourced', (select jsonb_agg(lpad(i::text, 20, '0')) from generate_series(1, 10) i))));
select pg_temp.chk('P4: unsourced as a string refused',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "unsourced": "45"}'));
select pg_temp.chk('P4: an empty list refused (the key is left out instead)',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "unsourced": []}'));
select pg_temp.chk('P4: 11 numbers refused',
  not public.section_finding_ok(jsonb_build_object('type', 'voice', 'message', 'm', 'quote', 'q', 'unsourced', (select jsonb_agg(i::text) from generate_series(1, 11) i))));
select pg_temp.chk('P4: a number item refused',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "unsourced": [45]}'));
select pg_temp.chk('P4: an empty string refused',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "unsourced": [""]}'));
select pg_temp.chk('P4: 21 characters refused',
  not public.section_finding_ok(jsonb_build_object('type', 'drift', 'message', 'm', 'quote', 'q', 'unsourced', jsonb_build_array(repeat('1', 21)))));
select pg_temp.chk('P4: a fifth key refused',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "unsourced": ["45"], "severity": "major"}'));
select pg_temp.chk('P4: another fourth key refused',
  not public.section_finding_ok('{"type": "drift", "message": "m", "quote": "q", "severity": "major"}'));
select pg_temp.chk('P4: the old rules still hold with unsourced (blank message refused)',
  not public.section_finding_ok('{"type": "drift", "message": "  ", "quote": "q", "unsourced": ["45"]}'));
-- The service role saves a check whose finding has unsourced (the table check uses the new rule).
set role service_role;
select pg_temp.expect('P4: a section check with unsourced saves',
  format($q$insert into public.section_checks (section_id, user_id, book_id, version_id, findings, areas, words, inputs_key, checked_at)
            values (%s, '00000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', null,
                    '[{"type": "drift", "message": "Studies show 45%% skip it.", "quote": "Sit tall.", "unsourced": ["45"]}]',
                    '{"objective": "pass", "voice": "pass", "drift": "issues"}', 60, '0123456789abcdef', now())$q$, :'S12'), 'OK 1');
reset role;
