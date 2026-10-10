-- 0019 empty version fix: no blank first version (save_version), blank
-- versions and drafts are not writing (section_has_writing, the delete guard,
-- replace_outline, outline_json, unlock_positioning). Nothing else changes.
-- Run: supabase/tests/sql/run.sh t0019.sql
\ir helpers.sql

-- User A owns book 1 (the live case: an Introduction with only a blank v1),
-- book 2 (a blank v1, a blank draft and one real section) and book 3 (unlock).
\set A '''00000000-0000-4000-8000-00000000000a'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
insert into auth.users values (:A);
insert into public.books (id, user_id, title) values
  (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :A, 'Sleep Better After 50'), (:BOOK3, :A, 'Walking for Stiff Knees');
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
select b, :A, 'A chair yoga guide for adults over 60 with stiff joints.', 'After this book, you can follow a safe 15-minute chair routine at home.',
       'Seated poses only, a 4-week plan.', '["Poses too hard for sore knees"]', '["Safe for stiff knees"]'
  from (values (:BOOK1::uuid), (:BOOK2), (:BOOK3)) v(b);
set role service_role;
update public.positioning set drift_checked_at = now();
reset role;

create function pg_temp.sec(b uuid, p int, s int) returns uuid language sql security definer as $$
  select x.id from public.sections x join public.chapters c on c.id = x.chapter_id where c.book_id = b and c.position = p and x.position = s $$;
create function pg_temp.nver(s uuid) returns bigint language sql security definer as $$
  select count(*) from public.section_versions where section_id = s $$;
create function pg_temp.cur(s uuid) returns uuid language sql security definer as $$
  select current_version_id from public.sections where id = s $$;
create function pg_temp.nch(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.chapters where book_id = b $$;
grant execute on all functions in schema pg_temp to public;
create function pg_temp.outline(n int) returns jsonb language sql as $$
  select jsonb_build_object('intro_words', 1000, 'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object('title', 'Chapter ' || i, 'objective', 'Reader can do the moves of chapter ' || i || '.',
                  'sections', jsonb_build_array(jsonb_build_object('title', 'First part', 'words', 400), jsonb_build_object('title', 'Second part', 'words', 450))) order by i)
                 from generate_series(1, n) i)) $$;
grant execute on function pg_temp.outline(int) to public;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now();
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3)) is not null as o1 \gset
select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(3)) is not null as o2 \gset
select public.replace_outline('b0000000-0000-4000-8000-000000000003', pg_temp.outline(2)) is not null as o3 \gset
\set INTRO1 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 0, 1)'
\set S11 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 1)'
\set S12 'pg_temp.sec(''b0000000-0000-4000-8000-000000000001'', 1, 2)'

-- ── Blank text ──
select pg_temp.chk('blank: empty', public.text_is_blank(''));
select pg_temp.chk('blank: null', public.text_is_blank(null));
select pg_temp.chk('blank: spaces, tabs, line breaks', public.text_is_blank(E'  \n\t\r\n '));
select pg_temp.chk('blank: a word is not blank', not public.text_is_blank(E'\n A \n'));
select pg_temp.chk('blank: a Markdown marker alone is text', not public.text_is_blank('##'));

-- ── save_version: no blank first version ──
select pg_temp.expect('first version: empty refused', format($q$select public.save_version(%s, '', null)$q$, :'INTRO1'), 'P0001 empty_first_version%');
select pg_temp.expect('first version: whitespace and line breaks refused', format($q$select public.save_version(%s, E'  \n\n\t ', null)$q$, :'INTRO1'), 'P0001 empty_first_version%');
select pg_temp.expect('first version: refused when not made current too', format($q$select public.save_version(%s, '', null, false)$q$, :'INTRO1'), 'P0001 empty_first_version%');
select pg_temp.chk('first version: nothing written, still not started', pg_temp.nver(:INTRO1) = 0 and pg_temp.cur(:INTRO1) is null
  and (select status from public.sections where id = :INTRO1) = 'not_started');
select pg_temp.expect('first version: null text is still bad_content (0018)', format($q$select public.save_version(%s, null, null)$q$, :'INTRO1'), '22023 bad_content%');
select pg_temp.expect('first version: real text saves', format($q$select public.save_version(%s, 'Most yoga books start on the floor. This one starts in your chair.', null)$q$, :'S11'), 'OK 1');
select pg_temp.expect('after a real version: clearing the text is allowed (on purpose)', format($q$select public.save_version(%s, '', %L)$q$, :'S11', pg_temp.cur(:S11)), 'OK 1');
select pg_temp.chk('after a real version: v2 is blank and current', pg_temp.nver(:S11) = 2
  and (select content from public.section_versions where id = pg_temp.cur(:S11)) = '');
select pg_temp.chk('a blank current version after text: still writing (v1 has text)', public.section_has_writing(:S11));

-- ── The live case: a blank v1 saved before 0019 (the server writes it here) ──
reset role;
set role service_role;
insert into public.section_versions (user_id, section_id, version_no, content, source)
  values ('00000000-0000-4000-8000-00000000000a', pg_temp.sec('b0000000-0000-4000-8000-000000000001', 0, 1), 1, '', 'manual');
update public.sections set current_version_id = (select id from public.section_versions where section_id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 0, 1))
 where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 0, 1);
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('live case: a blank v1 is not writing', not public.section_has_writing(:INTRO1));
select pg_temp.chk('live case: outline_json has_writing false',
  not (jsonb_path_query_first(public.outline_json('b0000000-0000-4000-8000-000000000001'), '$[0].sections[0]') ->> 'has_writing')::boolean);
select pg_temp.chk('live case: the blank v1 is kept (nothing deleted by 0019)', pg_temp.nver(:INTRO1) = 1);
select pg_temp.expect('live case: the next save is not a "first version" (v1 exists)', format($q$select public.save_version(%s, 'Most yoga books start on the floor.', %L)$q$, :'INTRO1', pg_temp.cur(:INTRO1)), 'OK 1');

-- ── Blank drafts are not writing; drafts with text are ──
insert into public.section_drafts (section_id, content) values (:S12, E' \n ');
select pg_temp.chk('draft: blank is not writing', not public.section_has_writing(:S12));
update public.section_drafts set content = 'A chair makes yoga safer.' where section_id = :S12;
select pg_temp.chk('draft: text is writing', public.section_has_writing(:S12));

-- ── Book 2: only blank writing → Regenerate (replace_outline) and Remove work ──
reset role;
set role service_role;
insert into public.section_versions (user_id, section_id, version_no, content, source)
  values ('00000000-0000-4000-8000-00000000000a', pg_temp.sec('b0000000-0000-4000-8000-000000000002', 1, 1), 1, '', 'manual');
update public.sections set current_version_id = (select id from public.section_versions where section_id = pg_temp.sec('b0000000-0000-4000-8000-000000000002', 1, 1))
 where id = pg_temp.sec('b0000000-0000-4000-8000-000000000002', 1, 1);
insert into public.section_drafts (section_id, user_id, content)
  values (pg_temp.sec('b0000000-0000-4000-8000-000000000002', 2, 1), '00000000-0000-4000-8000-00000000000a', '   ');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('remove: a section with only a blank draft', $q$delete from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000002', 2, 1)$q$, 'OK 1');
select pg_temp.expect('regenerate: allowed when the only version is blank', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(4))$q$, 'OK 1');
select pg_temp.chk('regenerate: the new outline is there', pg_temp.nch('b0000000-0000-4000-8000-000000000002') = 6);
-- Real text still blocks, as in 0018.
select pg_temp.expect('regenerate: real text still blocks', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(2))$q$, 'P0001 has_writing%');
select pg_temp.expect('remove: a section with text still refused', format($q$delete from public.sections where id = %s$q$, :'S11'), 'P0001 has_writing%');

-- ── Book 3: unlock marks and counts only sections with text ──
select public.save_version(pg_temp.sec('b0000000-0000-4000-8000-000000000003', 1, 1), 'Walk slowly for five minutes.', null) is not null as w1 \gset
insert into public.section_drafts (section_id, content) values (pg_temp.sec('b0000000-0000-4000-8000-000000000003', 2, 1), '');
select public.unlock_positioning('b0000000-0000-4000-8000-000000000003') as unlock \gset
select pg_temp.chk('unlock: only the chapter with text counts', (:'unlock'::jsonb ->> 'written_chapters')::int = 1, :'unlock');
select pg_temp.chk('unlock: the blank draft section is not marked',
  (select needs_review from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000003', 1, 1))
  and not (select needs_review from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000003', 2, 1)));
