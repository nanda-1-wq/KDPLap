-- 0018 write versions: the word count rule, versions only through the RPCs
-- (manual and restore) or the server, the 100,000 character limit, drafts
-- (RLS, owner, server clock), the current version guard, save_version and
-- restore_version, "has writing" with drafts, unlock, and outline_json.
-- Run: supabase/tests/sql/run.sh t0018.sql
\ir helpers.sql

-- User A owns book 1 (locked positioning, 3-chapter outline). User B owns book 2.
\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
insert into auth.users values (:A), (:B);
insert into public.books (id, user_id, title) values
  (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :B, null), (:BOOK3, :A, 'Sleep Better After 50');
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
select b, u, 'A chair yoga guide for adults over 60 with stiff joints.', 'After this book, you can follow a safe 15-minute chair routine at home.',
       'Seated poses only, a 4-week plan.', '["Poses too hard for sore knees"]', '["Safe for stiff knees"]'
  from (values (:BOOK1::uuid, :A::uuid), (:BOOK2, :B), (:BOOK3, :A)) v(b, u);
set role service_role;
update public.positioning set drift_checked_at = now();
reset role;

-- Read helpers (security definer, so they see the rows whatever the role).
create function pg_temp.sec(b uuid, p int, s int) returns uuid language sql security definer as $$
  select x.id from public.sections x join public.chapters c on c.id = x.chapter_id where c.book_id = b and c.position = p and x.position = s $$;
create function pg_temp.cur(s uuid) returns uuid language sql security definer as $$
  select current_version_id from public.sections where id = s $$;
create function pg_temp.status(s uuid) returns text language sql security definer as $$
  select status from public.sections where id = s $$;
create function pg_temp.nver(s uuid) returns bigint language sql security definer as $$
  select count(*) from public.section_versions where section_id = s $$;
create function pg_temp.ver(s uuid, n int) returns public.section_versions language sql security definer as $$
  select * from public.section_versions where section_id = s and version_no = n $$;
create function pg_temp.draft(s uuid) returns public.section_drafts language sql security definer as $$
  select * from public.section_drafts where section_id = s $$;
grant execute on all functions in schema pg_temp to public;

-- A real-length section (about 1,200 words): an H2, paragraphs, a bullet
-- list, a numbered list, bold and italic, numbers.
create function pg_temp.section_text() returns text language sql as $$
  select '## Shoulder rolls, both ways' || E'\n\n' || string_agg(
    'Shoulder rolls ease the stiffness that builds up after long hours of sitting. Lift your shoulders up toward your ears, '
    || 'then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level. '
    || 'If anything pinches, make the circle smaller. Round ' || i || ' of the routine takes about 2 minutes.' || E'\n\n'
    || '- Sit near the front of your chair' || E'\n' || '- Keep both feet flat on the floor' || E'\n\n'
    || '1. Breathe in as you lift' || E'\n' || '2. Breathe out as you roll back' || E'\n\n',
    '' order by i)
  from generate_series(1, 14) i $$;
grant execute on function pg_temp.section_text() to public;

-- The outline: 3 chapters of 2 sections, as user A.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');
select public.replace_outline('b0000000-0000-4000-8000-000000000003',
  '{"intro_words": 800, "conclusion_words": 600, "chapters": [{"title": "Why sleep changes after 50", "sections": [{"title": "Lighter sleep", "words": 400}, {"title": "Waking at night", "words": 400}]}, {"title": "A calm evening", "sections": [{"title": "The last hour", "words": 400}]}]}') is not null as outline3 \gset
select public.replace_outline('b0000000-0000-4000-8000-000000000001', jsonb_build_object(
  'intro_words', 1000, 'conclusion_words', 700,
  'chapters', (select jsonb_agg(jsonb_build_object('title', 'Chapter ' || i, 'objective', 'Reader can do the moves of chapter ' || i || '.',
                 'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450))) order by i)
               from generate_series(1, 3) i))) is not null as outline_made \gset
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
\set S1 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 1)'
\set S2 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 2)'
\set S3 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 2, 1)'
\set S4 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 3, 1)'

-- ── Word count: the same cases as tests/word-count.test.js ──
select pg_temp.chk('words: empty', public.md_word_count('') = 0);
select pg_temp.chk('words: null', public.md_word_count(null) = 0);
select pg_temp.chk('words: H2 marker not a word', public.md_word_count('## Shoulder rolls, both ways') = 4);
select pg_temp.chk('words: bullet markers', public.md_word_count(E'- Sit tall\n- Breathe out slowly') = 5);
select pg_temp.chk('words: numbered markers', public.md_word_count(E'1. Lift your shoulders\n2) Roll them back') = 6);
select pg_temp.chk('words: bold and italic', public.md_word_count('**Do this five times.** Keep your *neck* long.') = 8);
select pg_temp.chk('words: numbers and a dash count', public.md_word_count('Studies show 40% less pain — sometimes.') = 7);
select pg_temp.chk('words: a hashtag is a word', public.md_word_count('#hashtag stays') = 2);
select pg_temp.chk('words: spaces, tabs, blank lines', public.md_word_count(E'  Indented   words\n\n\nand  gaps\t\there ') = 5);
select pg_temp.chk('words: star bullet', public.md_word_count('* star bullet item') = 3);
select pg_temp.chk('words: seven hashes are a word', public.md_word_count(E'###### Six\n####### Seven') = 3);
select pg_temp.chk('words: Windows line ends', public.md_word_count(E'## Title\r\n- one\r\n- two') = 3);

-- ── Direct inserts are closed ──
select pg_temp.expect('insert: a manual version refused', format($q$insert into public.section_versions (section_id, version_no, content, source) values (%s, 1, 'Typed text.', 'manual')$q$, :'S1'), '42501 versions_rpc_only%');
select pg_temp.expect('insert: a generate version refused', format($q$insert into public.section_versions (section_id, version_no, content, source) values (%s, 1, 'AI text.', 'generate')$q$, :'S1'), '42501 versions_rpc_only%');
reset role;
set role anon;
select pg_temp.expect('insert: anon refused', $q$insert into public.section_versions (user_id, section_id, version_no, content, source) values ('00000000-0000-4000-8000-00000000000a', pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1), 1, 'X', 'manual')$q$, '42501%');
select pg_temp.expect('rpc: anon cannot call save_version', $q$select public.save_version(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1), 'X', null)$q$, '42501%');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('insert: nothing was written', pg_temp.nver(:S1) = 0);

-- ── save_version ──
select (public.save_version(:S1, pg_temp.section_text(), null)) as v1 \gset
select pg_temp.chk('save: version 1 created', (:'v1'::jsonb ->> 'version_no')::int = 1 and (:'v1'::jsonb ->> 'created')::boolean, :'v1');
select pg_temp.chk('save: it is current', pg_temp.cur(:S1) = (:'v1'::jsonb ->> 'id')::uuid);
select pg_temp.chk('save: Not started becomes Draft', pg_temp.status(:S1) = 'draft', pg_temp.status(:S1));
select pg_temp.chk('save: source manual, not partial', (pg_temp.ver(:S1, 1)).source = 'manual' and not (pg_temp.ver(:S1, 1)).partial);
select pg_temp.chk('save: real-length word count from the server rule',
  (pg_temp.ver(:S1, 1)).word_count = public.md_word_count(pg_temp.section_text()) and (pg_temp.ver(:S1, 1)).word_count between 1150 and 1250,
  (pg_temp.ver(:S1, 1)).word_count::text);
select pg_temp.chk('save: reply words match', (:'v1'::jsonb ->> 'word_count')::int = (pg_temp.ver(:S1, 1)).word_count);
select (public.save_version(:S1, pg_temp.section_text(), (:'v1'::jsonb ->> 'id')::uuid)) as same \gset
select pg_temp.chk('save: same text adds nothing', not (:'same'::jsonb ->> 'created')::boolean and pg_temp.nver(:S1) = 1 and (:'same'::jsonb ->> 'id') = (:'v1'::jsonb ->> 'id'), :'same');
select pg_temp.expect('save: an old base is a conflict (another tab)', format($q$select public.save_version(%s, 'Other text.', null)$q$, :'S1'), 'P0001 version_conflict%');
select (public.save_version(:S1, 'Shoulder rolls ease stiffness. Do this five times.', (:'v1'::jsonb ->> 'id')::uuid)) as v2 \gset
select pg_temp.chk('save: version 2, current', (:'v2'::jsonb ->> 'version_no')::int = 2 and pg_temp.cur(:S1) = (:'v2'::jsonb ->> 'id')::uuid);
select pg_temp.chk('save: version 1 unchanged', (pg_temp.ver(:S1, 1)).content = pg_temp.section_text());
select pg_temp.expect('save: null text refused', format($q$select public.save_version(%s, null, %L)$q$, :'S1', :'v2'::jsonb ->> 'id'), '22023 bad_content%');
select pg_temp.expect('save: unknown section', $q$select public.save_version('00000000-0000-4000-8000-0000000000ff', 'X', null)$q$, 'P0002 section_not_found%');
update public.sections set status = 'reviewed' where id = :S1;
select (public.save_version(:S1, 'Shoulder rolls ease stiffness. Do this five times, slowly.', (:'v2'::jsonb ->> 'id')::uuid)) as v3 \gset
select pg_temp.chk('save: a Reviewed section keeps its status', pg_temp.status(:S1) = 'reviewed', pg_temp.status(:S1));

-- ── Limit: 100,000 characters ──
select pg_temp.expect('limit: 100,001 characters refused', format($q$select public.save_version(%s, repeat('a', 100001), null)$q$, :'S2'), 'P0001 section_too_long%');
select pg_temp.expect('limit: exactly 100,000 saved', format($q$select public.save_version(%s, repeat('ab ', 33333) || 'a', null)$q$, :'S2'), 'OK 1');
select pg_temp.chk('limit: its words', (pg_temp.ver(:S2, 1)).word_count = 33334, (pg_temp.ver(:S2, 1)).word_count::text);
select pg_temp.expect('limit: a draft over 100,000 refused', format($q$insert into public.section_drafts (section_id, content) values (%s, repeat('a', 100001))$q$, :'S3'), '23514%');

-- ── Drafts ──
select pg_temp.expect('draft: insert own', format($q$insert into public.section_drafts (section_id, content, base_version_id, saved_at) values (%s, 'Shoulder rolls ease stiffness. Do this', %L, '2000-01-01')$q$, :'S1', :'v3'::jsonb ->> 'id'), 'OK 1');
select pg_temp.chk('draft: saved_at is the server clock', (pg_temp.draft(:S1)).saved_at > now() - interval '1 minute');
select pg_temp.expect('draft: update own', format($q$update public.section_drafts set content = 'Shoulder rolls ease stiffness. Do this ten times.', saved_at = '2000-01-01' where section_id = %s$q$, :'S1'), 'OK 1');
select pg_temp.chk('draft: update keeps the server clock', (pg_temp.draft(:S1)).saved_at > now() - interval '1 minute');
select pg_temp.expect('draft: a base from another section refused', format($q$update public.section_drafts set base_version_id = %L where section_id = %s$q$, (pg_temp.ver(:S2, 1)).id, :'S1'), 'P0001 version_other_section%');
select pg_temp.expect('draft: moving to another section refused', format($q$update public.section_drafts set section_id = %s where section_id = %s$q$, :'S4', :'S1'), 'P0001 draft_owner%');
select pg_temp.chk('draft: one row per section', pg_temp.err(format($q$insert into public.section_drafts (section_id, content) values (%s, 'Again')$q$, :'S1')) like '23505%');
select pg_temp.expect('restore: refused while a draft holds unsaved text', format($q$select public.restore_version(%s, %L, %L)$q$, :'S1', (pg_temp.ver(:S1, 1)).id, :'v3'::jsonb ->> 'id'), 'P0001 unsaved_draft%');
select (public.save_version(:S1, (pg_temp.draft(:S1)).content, (:'v3'::jsonb ->> 'id')::uuid)) as v4 \gset
select pg_temp.chk('save: deletes the draft', pg_temp.draft(:S1) is null and (pg_temp.ver(:S1, 4)).content = 'Shoulder rolls ease stiffness. Do this ten times.');

-- ── restore_version ──
select (public.restore_version(:S1, (pg_temp.ver(:S1, 1)).id, (:'v4'::jsonb ->> 'id')::uuid)) as v5 \gset
select pg_temp.chk('restore: a new version 5', (:'v5'::jsonb ->> 'version_no')::int = 5 and pg_temp.nver(:S1) = 5, :'v5');
select pg_temp.chk('restore: source restore, label', (pg_temp.ver(:S1, 5)).source = 'restore' and (pg_temp.ver(:S1, 5)).label = 'Restored from v1', (pg_temp.ver(:S1, 5)).label);
select pg_temp.chk('restore: the old text, made current', (pg_temp.ver(:S1, 5)).content = pg_temp.section_text() and pg_temp.cur(:S1) = (:'v5'::jsonb ->> 'id')::uuid);
select pg_temp.chk('restore: version 1 untouched', (pg_temp.ver(:S1, 1)).label is null and (pg_temp.ver(:S1, 1)).source = 'manual');
select pg_temp.expect('restore: an old base is a conflict', format($q$select public.restore_version(%s, %L, %L)$q$, :'S1', (pg_temp.ver(:S1, 2)).id, :'v4'::jsonb ->> 'id'), 'P0001 version_conflict%');
select pg_temp.expect('restore: a version of another section', format($q$select public.restore_version(%s, %L, %L)$q$, :'S1', (pg_temp.ver(:S2, 1)).id, :'v5'::jsonb ->> 'id'), 'P0002 version_not_found%');
insert into public.section_drafts (section_id, content, base_version_id) values (:S1, pg_temp.section_text(), (:'v5'::jsonb ->> 'id')::uuid);
select pg_temp.expect('restore: a draft with the same text is fine', format($q$select public.restore_version(%s, %L, %L)$q$, :'S1', (pg_temp.ver(:S1, 2)).id, :'v5'::jsonb ->> 'id'), 'OK 1');
select pg_temp.chk('restore: that draft is gone', pg_temp.draft(:S1) is null and pg_temp.nver(:S1) = 6);

-- ── Keep saved version: a draft kept as a version that is not current ──
insert into public.section_drafts (section_id, content, base_version_id) values (:S1, 'Typed in an old tab.', (pg_temp.ver(:S1, 2)).id);
select pg_temp.expect('keep: saved, not current, no conflict check', format($q$select public.save_version(%s, 'Typed in an old tab.', %L, false)$q$, :'S1', (pg_temp.ver(:S1, 2)).id), 'OK 1');
select pg_temp.chk('keep: version 7 is not current, draft gone',
  (pg_temp.ver(:S1, 7)).content = 'Typed in an old tab.' and pg_temp.cur(:S1) = (pg_temp.ver(:S1, 6)).id and pg_temp.draft(:S1) is null);

-- ── Versions never change ──
select pg_temp.expect('versions: update refused', format($q$update public.section_versions set content = 'Changed' where section_id = %s$q$, :'S1'), '42501%');
select pg_temp.expect('versions: delete refused', format($q$delete from public.section_versions where section_id = %s$q$, :'S1'), '42501%');

-- ── Current version guard ──
select pg_temp.expect('current: a direct set refused', format($q$update public.sections set current_version_id = %L where id = %s$q$, (pg_temp.ver(:S1, 1)).id, :'S1'), '42501 versions_rpc_only%');
select pg_temp.expect('current: another section''s version refused', format($q$update public.sections set current_version_id = %L where id = %s$q$, (pg_temp.ver(:S2, 1)).id, :'S1'), 'P0001 version_other_section%');
select pg_temp.expect('current: a direct clear refused', format($q$update public.sections set current_version_id = null where id = %s$q$, :'S1'), '42501 versions_rpc_only%');
select pg_temp.expect('current: other columns still save', format($q$update public.sections set status = 'final', title = 'First part, done' where id = %s$q$, :'S1'), 'OK 1');

-- ── The server (service role) writes AI versions, for the owner only ──
reset role;
set role service_role;
select pg_temp.expect('server: a generate version for the owner', format($q$insert into public.section_versions (user_id, section_id, version_no, content, word_count, source, partial) values ('00000000-0000-4000-8000-00000000000a', %s, 1, '## Arm circles' || E'\n\n' || 'Hold your arms out to the sides.', 999, 'generate', true)$q$, :'S3'), 'OK 1');
select pg_temp.chk('server: word count from the rule, not the caller', (pg_temp.ver(:S3, 1)).word_count = 9, (pg_temp.ver(:S3, 1)).word_count::text);
select pg_temp.expect('server: another user''s id refused', format($q$insert into public.section_versions (user_id, section_id, version_no, content, source) values ('00000000-0000-4000-8000-00000000000b', %s, 2, 'X', 'generate')$q$, :'S3'), 'P0001 version_owner%');
select pg_temp.expect('server: a draft for another user refused', format($q$insert into public.section_drafts (section_id, user_id, content) values (%s, '00000000-0000-4000-8000-00000000000b', 'X')$q$, :'S4'), '42501 draft_owner%');
select pg_temp.expect('server: may set the current version', format($q$update public.sections set current_version_id = %L where id = %s$q$, (pg_temp.ver(:S3, 1)).id, :'S3'), 'OK 1');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- ── "Has writing" counts drafts ──
insert into public.section_drafts (section_id, content) values (:S4, 'A first line.');
select pg_temp.expect('writing: a draft-only section cannot be deleted', format($q$delete from public.sections where id = %s$q$, :'S4'), 'P0001 has_writing%');
select pg_temp.expect('writing: nor its chapter', $q$delete from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000001' and position = 3$q$, 'P0001 has_writing%');
select pg_temp.expect('writing: an empty sibling section still goes', $q$delete from public.sections x using public.chapters c where c.id = x.chapter_id and c.book_id = 'b0000000-0000-4000-8000-000000000001' and c.position = 3 and x.position = 2$q$, 'OK 1');
select pg_temp.chk('writing: section_has_writing', public.section_has_writing(:S4) and public.section_has_writing(:S1) and not public.section_has_writing(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 0, 1)));

-- ── outline_json: words written ──
select jsonb_path_query_first(public.outline_json('b0000000-0000-4000-8000-000000000001'), '$[1].sections[0]') as j1 \gset
select pg_temp.chk('outline_json: words of the current version (v6, restored from v2)', (:'j1'::jsonb ->> 'words')::int = (pg_temp.ver(:S1, 6)).word_count and (:'j1'::jsonb ->> 'words')::int = 8, :'j1');
select pg_temp.chk('outline_json: version_at, no draft', :'j1'::jsonb ->> 'version_at' is not null and not (:'j1'::jsonb ->> 'has_draft')::boolean and :'j1'::jsonb -> 'draft_words' = 'null'::jsonb);
select jsonb_path_query_first(public.outline_json('b0000000-0000-4000-8000-000000000001'), '$[3].sections[0]') as j4 \gset
select pg_temp.chk('outline_json: a draft-only section', (:'j4'::jsonb ->> 'has_draft')::boolean and (:'j4'::jsonb ->> 'draft_words')::int = 3
  and (:'j4'::jsonb ->> 'words')::int = 0 and :'j4'::jsonb ->> 'draft_at' is not null and :'j4'::jsonb -> 'current_version_id' = 'null'::jsonb, :'j4');
select pg_temp.chk('outline_json: has_writing (a version, a draft, nothing)', (:'j1'::jsonb ->> 'has_writing')::boolean and (:'j4'::jsonb ->> 'has_writing')::boolean
  and not (jsonb_path_query_first(public.outline_json('b0000000-0000-4000-8000-000000000001'), '$[0].sections[0]') ->> 'has_writing')::boolean);
select pg_temp.chk('outline_json: old keys kept', (select bool_and(s ?& array['id', 'position', 'title', 'word_target', 'status', 'needs_review', 'current_version_id'])
  from jsonb_array_elements(public.outline_json('b0000000-0000-4000-8000-000000000001')) c, jsonb_array_elements(c -> 'sections') s));

-- ── replace_outline and unlock: book 3 has only a draft ──
insert into public.section_drafts (section_id, content) values (pg_temp.sec('b0000000-0000-4000-8000-000000000003', 1, 2), 'I wake at 3 a.m. most nights.');
select pg_temp.expect('replace: refused with only a draft', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000003', '{"intro_words": 1000, "conclusion_words": 700, "chapters": [{"title": "One", "sections": [{"title": "A", "words": 400}]}]}')$q$, 'P0001 has_writing%');
select public.unlock_positioning('b0000000-0000-4000-8000-000000000003') as unlock \gset
select pg_temp.chk('unlock: the draft-only chapter counts as written', (:'unlock'::jsonb ->> 'written_chapters')::int = 1, :'unlock');
select pg_temp.chk('unlock: only the draft-only section is marked',
  (select array_agg(position order by position) from public.sections where chapter_id = (select chapter_id from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000003', 1, 2)) and needs_review) = array[2]);

-- ── B sees and changes nothing of A ──
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('B: reads no drafts or versions', (select count(*) from public.section_drafts) = 0 and (select count(*) from public.section_versions) = 0);
select pg_temp.expect('B: updates 0 drafts', $q$update public.section_drafts set content = 'X'$q$, 'OK 0');
select pg_temp.expect('B: deletes 0 drafts', $q$delete from public.section_drafts$q$, 'OK 0');
select pg_temp.expect('B: save_version on A''s section', format($q$select public.save_version(%s, 'X', null)$q$, :'S4'), 'P0002 section_not_found%');
select pg_temp.expect('B: write_next_version on A''s section reads 1', format($q$select 1 where public.write_next_version(%s, 'X') = 1$q$, :'S4'), 'OK 1');

-- ── Book delete removes versions and drafts ──
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('delete: the books', $q$delete from public.books where id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003')$q$, 'OK 2');
reset role;
select pg_temp.chk('delete: no versions or drafts left', (select count(*) from public.section_versions) = 0 and (select count(*) from public.section_drafts) = 0);
