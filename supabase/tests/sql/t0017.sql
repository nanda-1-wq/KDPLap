-- 0017 outline approve: approve_outline (locked positioning, at least one
-- chapter, every chapter titled), the books guard (approval only through the
-- RPC), approval cleared by any outline edit but not by writing, unlock clears
-- it, and outline_checks (service role writes only, shape, owner, RLS).
-- Run: supabase/tests/sql/run.sh t0017.sql
\ir helpers.sql

-- User A owns book 1 (locked, 8-chapter outline), book 2 (unlocked, outline),
-- book 3 (locked, no outline), book 5 (no positioning, outline) and book 6
-- (locked, outline, deleted at the end). User B owns book 4 (locked, outline).
\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOK4 '''b0000000-0000-4000-8000-000000000004'''
\set BOOK5 '''b0000000-0000-4000-8000-000000000005'''
\set BOOK6 '''b0000000-0000-4000-8000-000000000006'''
insert into auth.users values (:A), (:B);
insert into public.books (id, user_id, title) values
  (:BOOK1, :A, 'Chair Yoga for Seniors Over 60'), (:BOOK2, :A, null), (:BOOK3, :A, null),
  (:BOOK4, :B, null), (:BOOK5, :A, null), (:BOOK6, :A, null);
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
select b, u, 'A chair yoga guide for adults over 60 with stiff joints.', 'After this book, you can follow a safe 15-minute chair routine at home.',
       'Seated poses only, a 4-week plan.', '["Poses too hard for sore knees"]', '["Safe for stiff knees"]'
  from (values (:BOOK1::uuid, :A::uuid), (:BOOK2, :A), (:BOOK3, :A), (:BOOK4, :B), (:BOOK6, :A)) v(b, u);
set role service_role;
update public.positioning set drift_checked_at = now();
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id in ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000006');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000004';
reset role;

-- Read helpers (security definer, so they see the rows whatever the role).
create function pg_temp.approved(b uuid) returns timestamptz language sql security definer as $$
  select outline_approved_at from public.books where id = b $$;
create function pg_temp.ch(b uuid, p int) returns uuid language sql security definer as $$
  select id from public.chapters where book_id = b and position = p $$;
create function pg_temp.sec(b uuid, p int, s int) returns uuid language sql security definer as $$
  select x.id from public.sections x join public.chapters c on c.id = x.chapter_id where c.book_id = b and c.position = p and x.position = s $$;
create function pg_temp.review_count(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.chapters where book_id = b and needs_review $$;
create function pg_temp.ids(b uuid) returns uuid[] language sql security definer as $$
  select array_agg(id order by position) from public.chapters where book_id = b and kind = 'chapter' $$;
create function pg_temp.nchecks(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.outline_checks where book_id = b $$;
grant execute on all functions in schema pg_temp to public;

-- A real-length outline (design 20): 8 chapters of 3 sections.
create function pg_temp.outline(n int, per int default 3) returns jsonb language sql as $$
  select jsonb_build_object(
    'intro_words', 1000,
    'conclusion_words', 700,
    'chapters', (select jsonb_agg(jsonb_build_object(
        'title', (array['Why Chair Yoga Works After 60', 'Setting Up: Your Chair, Space, and Safety Checks', 'Breathing and Posture Basics',
                        'Upper Body: Neck, Shoulders, and Arms', 'Lower Body: Hips, Knees, and Ankles', 'Breathing for Calm and Better Sleep',
                        'Your 4-Week Plan: From 5 to 15 Minutes', 'Staying With It'])[1 + (i - 1) % 8],
        'objective', 'Reader can do the moves of chapter ' || i || ' seated, slowly and without pain in the knees or hips.',
        'unsourced', '[]'::jsonb,
        'sections', (select jsonb_agg(jsonb_build_object('title', 'Section ' || i || '.' || j || ': what changes in our joints after 60', 'words', 350 + 50 * j) order by j)
                     from generate_series(1, per) j)) order by i)
      from generate_series(1, n) i)) $$;
grant execute on function pg_temp.outline(int, int) to public;

-- Approve, run one statement, then say whether the approval is gone.
-- Runs as the caller (no security definer), so RLS applies to the statement.
create function pg_temp.clears(name text, b uuid, q text, want boolean default true) returns text language plpgsql as $$
declare got text;
begin
  perform public.approve_outline(b);
  if pg_temp.approved(b) is null then return pg_temp.chk(name, false, 'approve did not set it'); end if;
  got := pg_temp.err(q);
  if got not like 'OK%' then return pg_temp.chk(name, false, got); end if;
  return pg_temp.chk(name, (pg_temp.approved(b) is null) = want, got || ' approved=' || coalesce(pg_temp.approved(b)::text, 'null'));
end $$;
grant execute on function pg_temp.clears(text, uuid, text, boolean) to public;

-- ── Privileges ──
select pg_temp.chk('approve_outline(): authenticated may run it', has_function_privilege('authenticated', 'public.approve_outline(uuid)', 'execute'));
select pg_temp.chk('approve_outline(): anon may not', not has_function_privilege('anon', 'public.approve_outline(uuid)', 'execute'));
select pg_temp.chk('books_outline_approve_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.books_outline_approve_guard()', 'execute'));
select pg_temp.chk('outline_clear_approval(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.outline_clear_approval()', 'execute'));
select pg_temp.chk('outline_checks_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.outline_checks_guard()', 'execute'));
select pg_temp.chk('outline_checks: RLS on', (select relrowsecurity from pg_class where oid = 'public.outline_checks'::regclass));
select pg_temp.chk('outline_checks: authenticated may read', has_table_privilege('authenticated', 'public.outline_checks', 'select'));
select pg_temp.chk('outline_checks: authenticated may not insert, update or delete',
  not has_table_privilege('authenticated', 'public.outline_checks', 'insert')
  and not has_table_privilege('authenticated', 'public.outline_checks', 'update')
  and not has_table_privilege('authenticated', 'public.outline_checks', 'delete'));
select pg_temp.chk('outline_checks: anon may not write', not has_table_privilege('anon', 'public.outline_checks', 'insert')
  and not has_table_privilege('anon', 'public.outline_checks', 'update') and not has_table_privilege('anon', 'public.outline_checks', 'delete'));

-- Outlines: book 1 (8 chapters), book 6 (3), book 2 and book 5 by hand (add_chapter needs no lock).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('setup: book 1 outline', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(8))$q$, 'OK 1');
select pg_temp.expect('setup: book 6 outline', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000006', pg_temp.outline(3))$q$, 'OK 1');
select pg_temp.expect('setup: book 2 chapter', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000002')$q$, 'OK 1');
update public.chapters set title = 'Why Chair Yoga Works After 60' where book_id = 'b0000000-0000-4000-8000-000000000002' and kind = 'chapter';
select pg_temp.expect('setup: book 5 chapter', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000005')$q$, 'OK 1');
update public.chapters set title = 'Why Chair Yoga Works After 60' where book_id = 'b0000000-0000-4000-8000-000000000005' and kind = 'chapter';
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('setup: book 4 outline (B)', $q$select public.replace_outline('b0000000-0000-4000-8000-000000000004', pg_temp.outline(3))$q$, 'OK 1');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- ── approve_outline: refusals ──
select pg_temp.expect('approve: unlocked positioning refused', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000002')$q$, 'P0001 positioning_not_locked%');
select pg_temp.expect('approve: no positioning refused', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000005')$q$, 'P0001 positioning_not_locked%');
select pg_temp.expect('approve: no outline refused', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000003')$q$, 'P0001 outline_empty%');
select pg_temp.expect('approve: another user''s book reads as not found', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000004')$q$, 'P0002 book_not_found%');
select pg_temp.chk('approve: B''s book not approved by A', pg_temp.approved('b0000000-0000-4000-8000-000000000004') is null);
select pg_temp.expect('approve: an untitled chapter (added by hand) refused', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');
select pg_temp.expect('approve: ... is refused with chapter_untitled', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000001')$q$, 'P0001 chapter_untitled%Chapter 9%');
select pg_temp.chk('approve: refused calls left no approval', pg_temp.approved('b0000000-0000-4000-8000-000000000001') is null);
select pg_temp.expect('approve: delete the untitled chapter', $q$delete from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000001' and kind = 'chapter' and title is null$q$, 'OK 1');
-- Book 3: Introduction and Conclusion only (its one chapter deleted) is still "no outline".
select pg_temp.expect('approve: book 3 gets a chapter', $q$select public.add_chapter('b0000000-0000-4000-8000-000000000003')$q$, 'OK 1');
select pg_temp.expect('approve: ... and loses it', $q$delete from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000003' and kind = 'chapter'$q$, 'OK 1');
select pg_temp.expect('approve: Introduction and Conclusion only refused', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000003')$q$, 'P0001 outline_empty%');

-- ── approve_outline: success ──
reset role;
update public.chapters set needs_review = true where book_id = 'b0000000-0000-4000-8000-000000000001';
update public.sections set needs_review = true where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('approve: 10 rows marked Needs review before', pg_temp.review_count('b0000000-0000-4000-8000-000000000001') = 10, pg_temp.review_count('b0000000-0000-4000-8000-000000000001')::text);
select pg_temp.chk('approve: returns the time it set',
  (select public.approve_outline('b0000000-0000-4000-8000-000000000001')) = pg_temp.approved('b0000000-0000-4000-8000-000000000001'));
select pg_temp.chk('approve: server clock', pg_temp.approved('b0000000-0000-4000-8000-000000000001') between clock_timestamp() - interval '1 minute' and clock_timestamp());
select pg_temp.chk('approve: chapters'' Needs review cleared (Introduction and Conclusion too)', pg_temp.review_count('b0000000-0000-4000-8000-000000000001') = 0, pg_temp.review_count('b0000000-0000-4000-8000-000000000001')::text);
select pg_temp.chk('approve: sections keep their Needs review (E10)',
  (select needs_review from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1)));
select pg_temp.expect('approve: approving again is fine', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');

-- ── The books guard: approval only through the RPC ──
select pg_temp.expect('guard: the browser cannot set the approval', $q$update public.books set outline_approved_at = now() where id = 'b0000000-0000-4000-8000-000000000006'$q$, 'P0001 outline_approve_rpc%');
select pg_temp.expect('guard: nor move it', $q$update public.books set outline_approved_at = now() - interval '1 day' where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 outline_approve_rpc%');
select pg_temp.expect('guard: a new book cannot start approved', $q$insert into public.books (title, outline_approved_at) values ('New', now())$q$, 'P0001 outline_approve_rpc%');
select pg_temp.expect('guard: other book fields still save', $q$update public.books set subtitle = 'Gentle 15-Minute Routines' where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.chk('guard: ... and keep the approval', pg_temp.approved('b0000000-0000-4000-8000-000000000001') is not null);
select pg_temp.expect('guard: the browser may clear it', $q$update public.books set outline_approved_at = null where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;
set role service_role;
select pg_temp.expect('guard: the service role cannot set it either', $q$update public.books set outline_approved_at = now() where id = 'b0000000-0000-4000-8000-000000000006'$q$, 'P0001 outline_approve_rpc%');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- ── Outline edits clear the approval ──
select pg_temp.clears('clears: chapter title', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set title = 'Why Chair Yoga Is Safe After 60' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$);
select pg_temp.clears('clears: chapter objective', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set objective = 'Reader can explain why seated yoga is safe for stiff joints.' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$);
select pg_temp.clears('clears: objective removed', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set objective = null where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 8)$q$);
select pg_temp.clears('clears: Examples box', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set include_examples = false where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)$q$);
select pg_temp.clears('clears: Exercise box', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set include_exercise = false where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 2)$q$);
select pg_temp.clears('clears: section title', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.sections set title = 'What changes in your joints after 60' where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1)$q$);
select pg_temp.clears('clears: section words', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.sections set word_target = 550 where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 2)$q$);
select pg_temp.clears('clears: Introduction words', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.sections set word_target = 900 where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 0, 1)$q$);
select pg_temp.clears('clears: add a section', 'b0000000-0000-4000-8000-000000000001',
  $q$insert into public.sections (chapter_id, position) values (pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3), 4)$q$);
select pg_temp.clears('clears: remove a section', 'b0000000-0000-4000-8000-000000000001',
  $q$delete from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 3, 4)$q$);
select pg_temp.clears('clears: reorder (Alt + arrow or drag)', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001', (select array[x[2], x[1]] || x[3:] from (select pg_temp.ids('b0000000-0000-4000-8000-000000000001') x) t))$q$);
select pg_temp.clears('clears: add chapter', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.add_chapter('b0000000-0000-4000-8000-000000000001')$q$);
update public.chapters set title = 'Questions Readers Ask' where book_id = 'b0000000-0000-4000-8000-000000000001' and kind = 'chapter' and title is null;
select pg_temp.clears('clears: delete chapter', 'b0000000-0000-4000-8000-000000000001',
  $q$delete from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000001' and title = 'Questions Readers Ask'$q$);
select pg_temp.clears('clears: regenerate (replace_outline)', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.replace_outline('b0000000-0000-4000-8000-000000000001', pg_temp.outline(8))$q$);

-- ── What does not clear it ──
select pg_temp.clears('keeps: a save with no change (same title)', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set title = title where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, false);
select pg_temp.clears('keeps: same reorder', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.reorder_chapters('b0000000-0000-4000-8000-000000000001', pg_temp.ids('b0000000-0000-4000-8000-000000000001'))$q$, false);
select pg_temp.clears('keeps: chapter Needs review', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set needs_review = false where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, false);
select pg_temp.clears('keeps: unsourced cleared by the author', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set unsourced = '{}' where id = pg_temp.ch('b0000000-0000-4000-8000-000000000001', 1)$q$, false);
select pg_temp.clears('keeps: a version written (E10, through save_version since 0018)', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.save_version(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1), 'Our joints change as we age. Cartilage gets thinner and the fluid that keeps a knee moving smoothly drops.', null)$q$, false);
select pg_temp.clears('keeps: a second version made current (E10 writing)', 'b0000000-0000-4000-8000-000000000001',
  $q$select public.save_version(pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1), 'Our joints change as we age, and a chair makes the moves safe.', (select current_version_id from public.sections where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1)))$q$, false);
select pg_temp.clears('keeps: section status (E10 writing)', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.sections set status = 'reviewed' where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1)$q$, false);
select pg_temp.clears('keeps: a draft saved (E10.1)', 'b0000000-0000-4000-8000-000000000001',
  $q$insert into public.section_drafts (section_id, content) values (pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 2), 'A first line.')$q$, false);
select pg_temp.clears('keeps: section Needs review', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.sections set needs_review = false where id = pg_temp.sec('b0000000-0000-4000-8000-000000000001', 1, 1)$q$, false);
select pg_temp.clears('keeps: an edit to another book', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.chapters set title = 'Breathing and Posture Basics' where book_id = 'b0000000-0000-4000-8000-000000000002' and kind = 'chapter'$q$, false);
select pg_temp.clears('keeps: a book field', 'b0000000-0000-4000-8000-000000000001',
  $q$update public.books set series_name = 'Gentle Moves' where id = 'b0000000-0000-4000-8000-000000000001'$q$, false);

-- ── outline_checks: the browser cannot write ──
select pg_temp.expect('checks: the browser cannot insert', $q$insert into public.outline_checks (book_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000001', '[]', '0123456789abcdef', now())$q$, '42501%');
reset role;
set role service_role;
select pg_temp.expect('checks: the service role saves a real-length result', format($q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', %L, '0123456789abcdef', now())$q$,
  jsonb_build_array(
    jsonb_build_object('kind', 'overlap', 'chapters', jsonb_build_array(pg_temp.ch('b0000000-0000-4000-8000-000000000001', 3), pg_temp.ch('b0000000-0000-4000-8000-000000000001', 6)), 'quote', '', 'why', 'Both chapters teach the same seated breathing, so readers meet the same moves twice and the book feels padded.', 'unsourced', '[]'::jsonb),
    jsonb_build_object('kind', 'drift', 'chapters', jsonb_build_array(pg_temp.ch('b0000000-0000-4000-8000-000000000001', 8)), 'quote', '', 'why', 'Moving with a group is a new angle. The Brief and the research are about safe routines at home.', 'unsourced', '[]'::jsonb),
    jsonb_build_object('kind', 'promise_gap', 'chapters', '[]'::jsonb, 'quote', 'at home', 'why', 'No chapter shows how to set up the routine at home without help, which the reader promise says.', 'unsourced', '["30"]'::jsonb))::text), 'OK 1');
select pg_temp.expect('checks: one row per book (upsert)', $q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', '[]', 'fedcba9876543210', now()) on conflict (book_id) do update set findings = excluded.findings, inputs_key = excluded.inputs_key, checked_at = excluded.checked_at$q$, 'OK 1');
select pg_temp.chk('checks: the upsert replaced the row', (select inputs_key = 'fedcba9876543210' and findings = '[]' from public.outline_checks where book_id = 'b0000000-0000-4000-8000-000000000001'));
select pg_temp.expect('checks: the owner must be the book''s owner', $q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now())$q$, 'P0001 outline_check_owner%');
select pg_temp.expect('checks: B''s own row is fine', $q$insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000b', '[]', '0123456789abcdef', now())$q$, 'OK 1');
select pg_temp.expect('checks: moving a row to another owner refused', $q$update public.outline_checks set user_id = '00000000-0000-4000-8000-00000000000a' where book_id = 'b0000000-0000-4000-8000-000000000004'$q$, 'P0001 outline_check_owner%');

-- Shape (structure only, like 0005 and 0010).
create function pg_temp.bad(name text, f jsonb) returns text language sql as $$
  select pg_temp.expect(name, format($q$update public.outline_checks set findings = %L where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, f::text), '23514%outline_checks_findings_shape_check%') $$;
grant execute on function pg_temp.bad(text, jsonb) to public;
\set C1 '"c0000000-0000-4000-8000-000000000001"'
\set C2 '"c0000000-0000-4000-8000-000000000002"'
select pg_temp.bad('shape: not an array', '{}');
select pg_temp.bad('shape: 9 findings', (select jsonb_agg(jsonb_build_object('kind', 'drift', 'chapters', jsonb_build_array('c0000000-0000-4000-8000-00000000000' || i), 'quote', '', 'why', 'Off the positioning.', 'unsourced', '[]'::jsonb)) from generate_series(1, 9) i));
select pg_temp.bad('shape: unknown kind', format('[{"kind":"style","chapters":[%s],"quote":"","why":"x","unsourced":[]}]', :'C1')::jsonb);
select pg_temp.bad('shape: overlap names one chapter', format('[{"kind":"overlap","chapters":[%s],"quote":"","why":"x","unsourced":[]}]', :'C1')::jsonb);
select pg_temp.bad('shape: overlap names the same chapter twice', format('[{"kind":"overlap","chapters":[%s,%s],"quote":"","why":"x","unsourced":[]}]', :'C1', :'C1')::jsonb);
select pg_temp.bad('shape: drift names two chapters', format('[{"kind":"drift","chapters":[%s,%s],"quote":"","why":"x","unsourced":[]}]', :'C1', :'C2')::jsonb);
select pg_temp.bad('shape: a chapter that is not an id', '[{"kind":"drift","chapters":["3"],"quote":"","why":"x","unsourced":[]}]');
select pg_temp.bad('shape: promise gap names a chapter', format('[{"kind":"promise_gap","chapters":[%s],"quote":"at home","why":"x","unsourced":[]}]', :'C1')::jsonb);
select pg_temp.bad('shape: promise gap with no quote', '[{"kind":"promise_gap","chapters":[],"quote":" ","why":"x","unsourced":[]}]');
select pg_temp.bad('shape: overlap with a quote', format('[{"kind":"overlap","chapters":[%s,%s],"quote":"at home","why":"x","unsourced":[]}]', :'C1', :'C2')::jsonb);
select pg_temp.bad('shape: empty why', format('[{"kind":"drift","chapters":[%s],"quote":"","why":"  ","unsourced":[]}]', :'C1')::jsonb);
select pg_temp.bad('shape: why over 300', format('[{"kind":"drift","chapters":[%s],"quote":"","why":"%s","unsourced":[]}]', :'C1', repeat('a', 301))::jsonb);
select pg_temp.bad('shape: quote over 300', format('[{"kind":"promise_gap","chapters":[],"quote":"%s","why":"x","unsourced":[]}]', repeat('a', 301))::jsonb);
select pg_temp.bad('shape: 11 unsourced numbers', format('[{"kind":"drift","chapters":[%s],"quote":"","why":"x","unsourced":["1","2","3","4","5","6","7","8","9","10","11"]}]', :'C1')::jsonb);
select pg_temp.bad('shape: an extra key', format('[{"kind":"drift","chapters":[%s],"quote":"","why":"x","unsourced":[],"chapter":3}]', :'C1')::jsonb);
select pg_temp.bad('shape: a missing key', format('[{"kind":"drift","chapters":[%s],"why":"x","unsourced":[]}]', :'C1')::jsonb);
select pg_temp.expect('shape: 8 findings fit', format($q$update public.outline_checks set findings = %L where book_id = 'b0000000-0000-4000-8000-000000000001'$q$,
  (select jsonb_agg(jsonb_build_object('kind', 'drift', 'chapters', jsonb_build_array('c0000000-0000-4000-8000-00000000000' || i), 'quote', '', 'why', repeat('a', 300), 'unsourced', '[]'::jsonb)) from generate_series(1, 8) i)::text), 'OK 1');
select pg_temp.expect('shape: inputs_key must be 16 hex', $q$update public.outline_checks set inputs_key = 'not-a-key' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%');
reset role;

-- ── RLS: each user reads only their own result ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.chk('rls: A reads A''s result', (select count(*) from public.outline_checks) = 1);
select pg_temp.expect('rls: A cannot update it', $q$update public.outline_checks set inputs_key = '0000000000000000'$q$, '42501%');
select pg_temp.expect('rls: A cannot delete it', $q$delete from public.outline_checks$q$, '42501%');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.chk('rls: B reads only B''s result', (select count(*) from public.outline_checks where book_id = 'b0000000-0000-4000-8000-000000000001') = 0 and (select count(*) from public.outline_checks) = 1);

-- ── unlock_positioning clears the approval ──
select pg_temp.chk('unlock: B''s book with no approval: outline false',
  (select public.unlock_positioning('b0000000-0000-4000-8000-000000000004')) ->> 'outline' = 'false');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('unlock: approve book 1 first', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');
select pg_temp.chk('unlock: reply says the approval went',
  (select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')) @> '{"outline": true, "chapters": 10}');
select pg_temp.chk('unlock: the approval is gone', pg_temp.approved('b0000000-0000-4000-8000-000000000001') is null);
select pg_temp.chk('unlock: chapters marked Needs review again', pg_temp.review_count('b0000000-0000-4000-8000-000000000001') = 10, pg_temp.review_count('b0000000-0000-4000-8000-000000000001')::text);
select pg_temp.chk('unlock: the check result stays (nothing deleted)', pg_temp.nchecks('b0000000-0000-4000-8000-000000000001') = 1);
select pg_temp.expect('unlock: approve now refused', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000001')$q$, 'P0001 positioning_not_locked%');

-- ── Deleting a book removes its check result; the cascade is not blocked ──
reset role;
set role service_role;
insert into public.outline_checks (book_id, user_id, findings, inputs_key, checked_at) values ('b0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000000a', '[]', '0123456789abcdef', now());
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('delete: approve book 6', $q$select public.approve_outline('b0000000-0000-4000-8000-000000000006')$q$, 'OK 1');
select pg_temp.expect('delete: an approved book with a check result', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000006'$q$, 'OK 1');
select pg_temp.chk('delete: its check result went too', pg_temp.nchecks('b0000000-0000-4000-8000-000000000006') = 0);
reset role;
