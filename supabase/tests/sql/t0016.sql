-- 0016 outline rules: chapter and section limits, one Introduction and one
-- Conclusion, the chapter cap (30) and section cap (12, or 1 for the
-- Introduction and Conclusion), the "has writing" delete guard, unsourced
-- numbers, the touch trigger, and the RPCs replace_outline, add_chapter and
-- reorder_chapters (as the user, under RLS).
-- Run: supabase/tests/sql/run.sh t0016.sql
\ir helpers.sql

-- User A owns book 1 (locked positioning), book 2 (unlocked positioning) and
-- book 3 (no positioning). User B owns book 4.
\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
insert into auth.users values (:A), (:B);
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :A, null), (:BOOK3, :A, null), (:BOOK4, :B, null);
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points) values
  (:BOOK1, :A, 'A chair yoga guide for adults over 60 with stiff joints.', 'After this book, you can follow a safe 15-minute chair routine.', 'Seated poses only, a 4-week plan.', '["Poses too hard for sore knees"]', '["Safe for stiff knees"]'),
  (:BOOK2, :A, 'A chair yoga guide.', 'A routine.', 'Seated.', '["Too hard"]', '["Safe"]');
set role service_role;
update public.positioning set drift_checked_at = now() where book_id = :BOOK1;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
reset role;

-- Read helpers (security definer, so they see the rows whatever the role).
create function pg_temp.nch(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.chapters where book_id = b $$;
create function pg_temp.nsec(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.sections s join public.chapters c on c.id = s.chapter_id where c.book_id = b $$;
create function pg_temp.order_of(b uuid) returns text language sql security definer as $$
  select string_agg(coalesce(kind || ':' || coalesce(title, '-'), ''), ' | ' order by position) from public.chapters where book_id = b $$;
create function pg_temp.ch(b uuid, p int) returns uuid language sql security definer as $$
  select id from public.chapters where book_id = b and position = p $$;
create function pg_temp.chk_by_title(b uuid, t text) returns uuid language sql security definer as $$
  select id from public.chapters where book_id = b and title = t $$;
create function pg_temp.touched(b uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.books where id = b $$;
grant execute on all functions in schema pg_temp to public;

-- A real-length outline (design 20): 3 chapters of 3 sections, then an 8-chapter version.
create function pg_temp.outline(n int, per int default 3) returns jsonb language sql as $$
  select jsonb_build_object(
    'intro_words', 1000,
    'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object(
        'title', (array['Why Chair Yoga Works After 60', 'Setting Up: Your Chair, Space, and Safety Checks', 'Breathing and Posture Basics',
                        'Upper Body: Neck, Shoulders, and Arms', 'Lower Body: Hips, Knees, and Ankles', 'Breathing for Calm and Better Sleep',
                        'Your 4-Week Plan: From 5 to 15 Minutes', 'Staying With It'])[1 + (i - 1) % 8] || case when i > 8 then ' ' || i else '' end,
        'objective', 'Reader can do ' || i || ' things after this chapter, seated and without pain.',
        'unsourced', case when i = 1 then '["30%"]'::jsonb else '[]'::jsonb end,
        'sections', (select jsonb_agg(jsonb_build_object('title', 'Section ' || i || '.' || j || ': what changes in our joints after 60', 'words', 350 + 50 * j) order by j)
                     from generate_series(1, per) j)) order by i)
      from generate_series(1, n) i)) $$;
grant execute on function pg_temp.outline(int, int) to public;

-- ── Function privileges ──
select pg_temp.chk('chapters_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.chapters_guard()', 'execute'));
select pg_temp.chk('sections_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.sections_guard()', 'execute'));
select pg_temp.chk('outline_delete_guard(): no EXECUTE for anon', not has_function_privilege('anon', 'public.outline_delete_guard()', 'execute'));
select pg_temp.chk('touch_book_from_section(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.touch_book_from_section()', 'execute'));
select pg_temp.chk('replace_outline(): authenticated may run it', has_function_privilege('authenticated', 'public.replace_outline(uuid, jsonb)', 'execute'));
select pg_temp.chk('replace_outline(): anon may not', not has_function_privilege('anon', 'public.replace_outline(uuid, jsonb)', 'execute'));
select pg_temp.chk('add_chapter(): authenticated may run it, anon may not', has_function_privilege('authenticated', 'public.add_chapter(uuid)', 'execute') and not has_function_privilege('anon', 'public.add_chapter(uuid)', 'execute'));
select pg_temp.chk('reorder_chapters(): authenticated may run it, anon may not', has_function_privilege('authenticated', 'public.reorder_chapters(uuid, uuid[])', 'execute') and not has_function_privilege('anon', 'public.reorder_chapters(uuid, uuid[])', 'execute'));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- ── replace_outline ──
select pg_temp.expect('replace: no positioning refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000003', pg_temp.outline(3))$q$, 'P0001 positioning_not_locked%');
select pg_temp.expect('replace: unlocked positioning refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000002', pg_temp.outline(3))$q$, 'P0001 positioning_not_locked%');
select pg_temp.expect('replace: another user''s book reads as not found', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000004', pg_temp.outline(3))$q$, 'P0002 book_not_found%');
select pg_temp.expect('replace: no chapters refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', '{"intro_words":100,"conclusion_words":100,"chapters":[]}')$q$, '22023 bad_outline%');
select pg_temp.expect('replace: 31 chapters refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(31))$q$, '22023 bad_outline%');
select pg_temp.expect('replace: a chapter with 0 sections refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', jsonb_set(pg_temp.outline(2), '{chapters,1,sections}', '[]'))$q$, '22023 bad_outline%');
select pg_temp.expect('replace: 13 sections refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(2, 13))$q$, '22023 bad_outline%');
select pg_temp.expect('replace: not an object refused', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', '[]')$q$, '22023 bad_outline%');
select pg_temp.chk('replace: refused calls left nothing', pg_temp.nch('b0000000-0000-4000-8000-000000000001') = 0);
select pg_temp.expect('replace: 8 chapters of 3 sections saved', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(8))$q$, 'OK 1');
select pg_temp.chk('replace: Intro + 8 + Conclusion', pg_temp.nch('b0000000-0000-4000-8000-000000000001') = 10, pg_temp.nch('b0000000-0000-4000-8000-000000000001')::text);
select pg_temp.chk('replace: 8 x 3 + 2 sections', pg_temp.nsec('b0000000-0000-4000-8000-000000000001') = 26, pg_temp.nsec('b0000000-0000-4000-8000-000000000001')::text);
select pg_temp.chk('replace: Introduction first, Conclusion last',
  pg_temp.order_of('b0000000-0000-4000-8000-000000000001') like 'intro:- | chapter:Why Chair Yoga Works After 60 | chapter:Setting Up%| chapter:Staying With It | conclusion:-',
  pg_temp.order_of('b0000000-0000-4000-8000-000000000001'));
select pg_temp.chk('replace: intro and conclusion words live on their one section',
  (select array_agg(s.word_target order by c.position) from public.chapters c join public.sections s on s.chapter_id = c.id where c.book_id = 'b0000000-0000-4000-8000-000000000001' and c.kind <> 'chapter') = array[1000, 700]);
select pg_temp.chk('replace: chapter word_target stays null (the total is the sum of sections)',
  not exists (select 1 from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000001' and word_target is not null));
select pg_temp.chk('replace: section words and titles kept',
  (select string_agg(s.title || '=' || s.word_target, '; ' order by s.position) from public.sections s where s.chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1))
  = 'Section 1.1: what changes in our joints after 60=400; Section 1.2: what changes in our joints after 60=450; Section 1.3: what changes in our joints after 60=500');
select pg_temp.chk('replace: unsourced kept on the chapter', (select unsourced = array['30%'] from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)));
select pg_temp.chk('replace: returns the outline, in order, with sections',
  (select jsonb_array_length(o) = 10 and o -> 0 ->> 'kind' = 'intro' and o -> 9 ->> 'kind' = 'conclusion'
          and jsonb_array_length(o -> 1 -> 'sections') = 3 and (o -> 1 -> 'sections' -> 0 ->> 'word_target')::int = 400
          and o -> 1 ->> 'title' = 'Why Chair Yoga Works After 60' and o -> 1 -> 'unsourced' = '["30%"]'
     from (select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(8)) o) x));
select pg_temp.chk('replace again: the old outline is replaced, not added to', pg_temp.nch('b0000000-0000-4000-8000-000000000001') = 10);
reset role;
-- 0017: the approval is set only through approve_outline(); this test sets it directly.
select set_config('kdp.outline_approve', 'on', false) is not null;
update public.books set outline_approved_at = now() where id = 'b0000000-0000-4000-8000-000000000001';
select set_config('kdp.outline_approve', '', false) is not null;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3)) is not null;
select pg_temp.chk('replace: clears the outline approval', (select outline_approved_at is null from public.books where id = 'b0000000-0000-4000-8000-000000000001'));

-- ── Field limits ──
select pg_temp.expect('chapter title 150 ok', $q$update public.chapters set title = repeat('a', 150) where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'OK 1');
select pg_temp.expect('chapter title 151 refused', $q$update public.chapters set title = repeat('a', 151) where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, '23514%chapters_title_length_check%');
select pg_temp.expect('chapter title blank refused', $q$update public.chapters set title = '  ' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, '23514%chapters_title_length_check%');
select pg_temp.expect('chapter title null ok (shows "Untitled")', $q$update public.chapters set title = null where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'OK 1');
select pg_temp.expect('objective 300 ok', $q$update public.chapters set objective = repeat('a', 300) where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'OK 1');
select pg_temp.expect('objective 301 refused', $q$update public.chapters set objective = repeat('a', 301) where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, '23514%chapters_objective_length_check%');
select pg_temp.expect('objective blank refused', $q$update public.chapters set objective = ' ' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, '23514%chapters_objective_length_check%');
select pg_temp.expect('chapter word_target refused (sections hold the words)', $q$update public.chapters set word_target = 1000 where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, '23514%chapters_word_target_unused_check%');
select pg_temp.expect('section title 150 ok', $q$update public.sections set title = repeat('a', 150) where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, 'OK 1');
select pg_temp.expect('section title 151 refused', $q$update public.sections set title = repeat('a', 151) where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, '23514%sections_title_length_check%');
select pg_temp.expect('section title blank refused', $q$update public.sections set title = '' where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, '23514%sections_title_length_check%');
select pg_temp.expect('section words 10000 ok', $q$update public.sections set word_target = 10000 where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, 'OK 1');
select pg_temp.expect('section words 10001 refused', $q$update public.sections set word_target = 10001 where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, '23514%sections_word_target_max_check%');
select pg_temp.expect('section words -1 refused', $q$update public.sections set word_target = -1 where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, '23514%sections_word_target_check%');
select pg_temp.expect('section words null ok', $q$update public.sections set word_target = null where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 1$q$, 'OK 1');

-- ── unsourced: the server writes it; an edit of that title or objective clears it ──
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3)) is not null;
select pg_temp.expect('unsourced: the user cannot add numbers', $q$update public.chapters set unsourced = array['5'] where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)$q$, 'P0001 unsourced_read_only%');
select pg_temp.expect('unsourced: an Examples tick keeps it', $q$update public.chapters set include_examples = false where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'OK 1');
select pg_temp.chk('unsourced: still there', (select unsourced = array['30%'] from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)));
select pg_temp.expect('unsourced: a title edit', $q$update public.chapters set title = 'Why Seated Yoga Works' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'OK 1');
select pg_temp.chk('unsourced: cleared by the title edit', (select unsourced = '{}' from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)));
reset role;
select pg_temp.chk('unsourced: 11 items refused by the check', pg_temp.err($q$update public.chapters set unsourced = array['1','2','3','4','5','6','7','8','9','10','11'] where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$) like '23514%chapters_unsourced_check%');
update public.chapters set unsourced = array['12'] where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('unsourced: an objective edit', $q$update public.chapters set objective = 'Reader can set up a safe spot in under 5 minutes' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)$q$, 'OK 1');
select pg_temp.chk('unsourced: cleared by the objective edit', (select unsourced = '{}' from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)));

-- ── Kinds: one Introduction, one Conclusion, kind fixed ──
select pg_temp.expect('a second Introduction refused', $q$insert into public.chapters (book_id, position, kind) values ('b0000000-0000-4000-8000-000000000001', 50, 'intro')$q$, '23505%chapters_one_intro_conclusion_key%');
select pg_temp.expect('a second Conclusion refused', $q$insert into public.chapters (book_id, position, kind) values ('b0000000-0000-4000-8000-000000000001', 51, 'conclusion')$q$, '23505%chapters_one_intro_conclusion_key%');
select pg_temp.expect('kind cannot change', $q$update public.chapters set kind = 'conclusion' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, 'P0001 chapter_kind_fixed%');
select pg_temp.expect('Introduction: a second section refused', $q$insert into public.sections (chapter_id, position) values (pg_temp.ch('b0000000-0000-4000-8000-000000000001', 0), 2)$q$, 'P0001 sections_full%');

-- ── add_chapter ──
select pg_temp.chk('add_chapter: first chapter on an empty book also adds the Introduction and Conclusion',
  public.add_chapter('b0000000-0000-4000-8000-000000000003') = pg_temp.ch('b0000000-0000-4000-8000-000000000003', 1));
select pg_temp.chk('add_chapter: empty book now Intro, chapter, Conclusion', pg_temp.order_of('b0000000-0000-4000-8000-000000000003') = 'intro:- | chapter:- | conclusion:-', pg_temp.order_of('b0000000-0000-4000-8000-000000000003'));
select pg_temp.chk('add_chapter: each has one section', pg_temp.nsec('b0000000-0000-4000-8000-000000000003') = 3);
select pg_temp.chk('add_chapter: goes before the Conclusion', public.add_chapter('b0000000-0000-4000-8000-000000000001') = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 4));
select pg_temp.chk('add_chapter: Conclusion still last', pg_temp.order_of('b0000000-0000-4000-8000-000000000001') like 'intro:- | %| chapter:- | conclusion:-', pg_temp.order_of('b0000000-0000-4000-8000-000000000001'));
select pg_temp.expect('add_chapter: another user''s book reads as not found', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000004')$q$, 'P0002 book_not_found%');

-- ── Caps: 30 chapters, 12 sections ──
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(30, 1)) is not null;
select pg_temp.expect('30 chapters: one more refused', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000001')$q$, 'P0001 outline_full%');
select pg_temp.expect('30 chapters: a plain insert refused too', $q$insert into public.chapters (book_id, position) values ('b0000000-0000-4000-8000-000000000001', 99)$q$, 'P0001 outline_full%');
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(2, 12)) is not null;
select pg_temp.expect('12 sections: one more refused', $q$insert into public.sections (chapter_id, position) values (pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), 13)$q$, 'P0001 sections_full%');
select pg_temp.expect('11 sections: one more ok', $q$delete from public.sections where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 12$q$, 'OK 1');
select pg_temp.expect('11 sections: add the 12th', $q$insert into public.sections (chapter_id, position) values (pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), 12)$q$, 'OK 1');

-- ── reorder_chapters ──
select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(4)) is not null;
select pg_temp.expect('reorder: 4,1,2,3 saved', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001',
  array[pg_temp.ch('b0000000-0000-4000-8000-000000000001', 4), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3)])$q$, 'OK 1');
select pg_temp.chk('reorder: new order, Introduction and Conclusion stay put',
  pg_temp.order_of('b0000000-0000-4000-8000-000000000001') = 'intro:- | chapter:Upper Body: Neck, Shoulders, and Arms | chapter:Why Chair Yoga Works After 60 | chapter:Setting Up: Your Chair, Space, and Safety Checks | chapter:Breathing and Posture Basics | conclusion:-',
  pg_temp.order_of('b0000000-0000-4000-8000-000000000001'));
select pg_temp.expect('reorder: a missing chapter refused', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001',
  array[pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3)])$q$, 'P0001 outline_changed%');
select pg_temp.expect('reorder: a repeat refused', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001',
  array[pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3)])$q$, 'P0001 outline_changed%');
select pg_temp.expect('reorder: the Introduction cannot move', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001',
  array[pg_temp.ch('b0000000-0000-4000-8000-000000000001', 0), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 4)])$q$, 'P0001 outline_changed%');
select pg_temp.expect('reorder: another user''s book reads as not found', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000004', array[]::uuid[])$q$, 'P0002 book_not_found%');

-- ── Delete: nothing written yet, so deletes work; writing blocks them ──
select pg_temp.expect('delete a chapter with no writing', $q$delete from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 4)$q$, 'OK 1');
select pg_temp.chk('its 3 sections went too', pg_temp.nsec('b0000000-0000-4000-8000-000000000001') = 3 * 3 + 2);
select pg_temp.expect('delete a section with no writing', $q$delete from public.sections where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1) and position = 3$q$, 'OK 1');
insert into public.section_versions (user_id, section_id, version_no, content, source)
  select '00000000-0000-4000-8000-00000000000a', s.id, 1, 'Partial text kept after a stop.', 'generate'
    from public.sections s where s.chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2) and s.position = 1;
select pg_temp.expect('delete: a section with a version (even not current) refused', $q$delete from public.sections where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2) and position = 1$q$, 'P0001 has_writing%');
select pg_temp.expect('delete: its chapter refused', $q$delete from public.chapters where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)$q$, 'P0001 has_writing%');
select pg_temp.expect('delete: an empty sibling section still works', $q$delete from public.sections where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2) and position = 3$q$, 'OK 1');
select pg_temp.expect('replace: refused once any section has writing', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3))$q$, 'P0001 has_writing%');
select pg_temp.chk('replace refused: the outline is unchanged', pg_temp.nch('b0000000-0000-4000-8000-000000000001') = 5);
select pg_temp.expect('reorder still works with writing', $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001',
  array[pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)])$q$, 'OK 1');

-- ── Touch: outline edits move the book up on Books ──
reset role;
update public.books set updated_at = now() - interval '1 day' where id = 'b0000000-0000-4000-8000-000000000003';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.sections set word_target = 900 where chapter_id = pg_temp.ch('b0000000-0000-4000-8000-000000000003', 1);
select pg_temp.chk('touch: a section edit touches the book', pg_temp.touched('b0000000-0000-4000-8000-000000000003') > now() - interval '1 minute');
reset role;
update public.books set updated_at = now() - interval '1 day' where id = 'b0000000-0000-4000-8000-000000000003';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.chapters set objective = 'Reader can breathe with each move' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000003', 1);
select pg_temp.chk('touch: a chapter edit touches the book', pg_temp.touched('b0000000-0000-4000-8000-000000000003') > now() - interval '1 minute');

-- ── User B sees and changes nothing of A's ──
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('B: add_chapter on A''s book', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000003')$q$, 'P0002 book_not_found%');
select pg_temp.expect('B: replace A''s outline', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(3))$q$, 'P0002 book_not_found%');
select pg_temp.expect('B: deletes none of A''s chapters', $q$delete from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000003'$q$, 'OK 0');
reset role;
select pg_temp.chk('B changed nothing', pg_temp.nch('b0000000-0000-4000-8000-000000000003') = 3);

-- ── Deleting a book still removes everything, writing included ──
select pg_temp.expect('book delete cascades past the writing guard', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('no chapters left for the deleted book', pg_temp.nch('b0000000-0000-4000-8000-000000000001') = 0);
