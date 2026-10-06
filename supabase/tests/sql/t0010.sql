-- 0010 positioning rules: field limits, drift flag shape, the guard trigger
-- (new rows, server-only drift results, text edits clear the check, lock
-- rules, locked rows are read-only) and unlock_positioning().
-- Rebuilt in Batch B1 (the E8.1 suite was lost with its scratchpad).
-- Run: supabase/tests/sql/run.sh t0010.sql
\ir helpers.sql

-- User A owns book 1 (titled, 2 chapters, 1 written section) and book 2 (no
-- title, nothing built on it). User B owns nothing.
\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
insert into auth.users values (:A), (:B);
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors');
insert into public.books (id, user_id) values (:BOOK2, :A);
insert into public.chapters (id, user_id, book_id, position) values
  ('c0000000-0000-4000-8000-000000000001', :A, :BOOK1, 1),
  ('c0000000-0000-4000-8000-000000000002', :A, :BOOK1, 2);
insert into public.sections (id, user_id, chapter_id, position) values
  ('50000000-0000-4000-8000-000000000001', :A, 'c0000000-0000-4000-8000-000000000001', 1),
  ('50000000-0000-4000-8000-000000000002', :A, 'c0000000-0000-4000-8000-000000000001', 2),
  ('50000000-0000-4000-8000-000000000003', :A, 'c0000000-0000-4000-8000-000000000002', 1);
insert into public.section_versions (id, user_id, section_id, version_no, content, source) values
  ('70000000-0000-4000-8000-000000000001', :A, '50000000-0000-4000-8000-000000000001', 1, 'Some writing.', 'manual');
update public.sections set current_version_id = '70000000-0000-4000-8000-000000000001'
 where id = '50000000-0000-4000-8000-000000000001';

-- Read helpers (security definer, so they see the row whatever the role).
create function pg_temp.pos(b uuid) returns public.positioning language sql security definer as $$
  select * from public.positioning where book_id = b $$;
grant execute on function pg_temp.pos(uuid) to public;
create function pg_temp.flag(st text, reason text default '') returns jsonb language sql as $$
  select jsonb_build_object('id', 'd1', 'field', 'one_sentence', 'quote', 'chair yoga', 'why', 'Not in the Brief.', 'status', st, 'reason', reason) $$;
grant execute on function pg_temp.flag(text, text) to public;

-- ── Function privileges ──
select pg_temp.chk('positioning_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.positioning_guard()', 'execute'));
select pg_temp.chk('positioning_guard(): no EXECUTE for anon', not has_function_privilege('anon', 'public.positioning_guard()', 'execute'));
select pg_temp.chk('unlock_positioning(): authenticated may run it', has_function_privilege('authenticated', 'public.unlock_positioning(uuid)', 'execute'));
select pg_temp.chk('unlock_positioning(): anon may not', not has_function_privilege('anon', 'public.unlock_positioning(uuid)', 'execute'));

-- ── New rows (as user A) ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('new row: locked_at refused', $q$insert into public.positioning (book_id, locked_at) values ('b0000000-0000-4000-8000-000000000001', now())$q$, 'P0001 positioning_new_row%');
select pg_temp.expect('new row: drift_checked_at refused', $q$insert into public.positioning (book_id, drift_checked_at) values ('b0000000-0000-4000-8000-000000000001', now())$q$, 'P0001 positioning_new_row%');
select pg_temp.expect('new row: flags refused', $q$insert into public.positioning (book_id, drift_flags) values ('b0000000-0000-4000-8000-000000000001', jsonb_build_array(pg_temp.flag('open')))$q$, 'P0001 positioning_new_row%');
select pg_temp.expect('new row: plain insert works', $q$insert into public.positioning (book_id, one_sentence) values ('b0000000-0000-4000-8000-000000000001', 'A chair yoga guide.')$q$, 'OK 1');

-- ── Field limits ──
select pg_temp.expect('one_sentence 400 ok', $q$update public.positioning set one_sentence = repeat('a', 400)$q$, 'OK 1');
select pg_temp.expect('one_sentence 401 refused', $q$update public.positioning set one_sentence = repeat('a', 401)$q$, '23514%positioning_one_sentence_length_check%');
select pg_temp.expect('one_sentence blank refused', $q$update public.positioning set one_sentence = '   '$q$, '23514%positioning_one_sentence_length_check%');
select pg_temp.expect('one_sentence null ok', $q$update public.positioning set one_sentence = null$q$, 'OK 1');
select pg_temp.expect('reader_promise 600 ok', $q$update public.positioning set reader_promise = repeat('a', 600)$q$, 'OK 1');
select pg_temp.expect('reader_promise 601 refused', $q$update public.positioning set reader_promise = repeat('a', 601)$q$, '23514%positioning_reader_promise_length_check%');
select pg_temp.expect('approach 1200 ok', $q$update public.positioning set approach = repeat('a', 1200)$q$, 'OK 1');
select pg_temp.expect('approach 1201 refused', $q$update public.positioning set approach = repeat('a', 1201)$q$, '23514%positioning_approach_length_check%');
select pg_temp.expect('lacks 6 items ok', $q$update public.positioning set lacks = '["a","b","c","d","e","f"]'$q$, 'OK 1');
select pg_temp.expect('lacks 7 items refused', $q$update public.positioning set lacks = '["a","b","c","d","e","f","g"]'$q$, '23514%positioning_lacks_shape_check%');
select pg_temp.expect('lacks item of 201 refused', $q$update public.positioning set lacks = jsonb_build_array(repeat('a', 201))$q$, '23514%positioning_lacks_shape_check%');
select pg_temp.expect('lacks blank item refused', $q$update public.positioning set lacks = '[" "]'$q$, '23514%positioning_lacks_shape_check%');
select pg_temp.expect('lacks non-string item refused', $q$update public.positioning set lacks = '[1]'$q$, '23514%positioning_lacks_shape_check%');
select pg_temp.expect('lacks not an array refused', $q$update public.positioning set lacks = '{"a":1}'$q$, '23514%positioning_lacks_shape_check%');
select pg_temp.expect('selling_points 8 items ok', $q$update public.positioning set selling_points = '["a","b","c","d","e","f","g","h"]'$q$, 'OK 1');
select pg_temp.expect('selling_points 9 items refused', $q$update public.positioning set selling_points = '["a","b","c","d","e","f","g","h","i"]'$q$, '23514%positioning_selling_points_shape_check%');
select pg_temp.expect('selling_points item of 161 refused', $q$update public.positioning set selling_points = jsonb_build_array(repeat('a', 161))$q$, '23514%positioning_selling_points_shape_check%');
select pg_temp.expect('focus_tags 8 ok', $q$update public.positioning set focus_tags = array['a','b','c','d','e','f','g','h']$q$, 'OK 1');
select pg_temp.expect('focus_tags 9 refused', $q$update public.positioning set focus_tags = array['a','b','c','d','e','f','g','h','i']$q$, '23514%positioning_focus_tags_check%');
select pg_temp.expect('focus_tags tag of 41 refused', $q$update public.positioning set focus_tags = array[repeat('a', 41)]$q$, '23514%positioning_focus_tags_check%');
select pg_temp.expect('focus_tags repeat (any case) refused', $q$update public.positioning set focus_tags = array['Large print', 'large PRINT']$q$, '23514%positioning_focus_tags_check%');
select pg_temp.expect('focus_tags null refused (not null)', $q$update public.positioning set focus_tags = null$q$, '23502%focus_tags%');

-- ── Server-only drift results (browser = authenticated) ──
select pg_temp.expect('browser cannot set drift_checked_at', $q$update public.positioning set drift_checked_at = now()$q$, 'P0001 drift_check_server_only%');
select pg_temp.expect('browser cannot add a flag', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open'))$q$, 'P0001 drift_flags_server_only%');
reset role;

-- Fill the row and save a drift check as the server (service_role).
set role service_role;
select pg_temp.expect('server writes text', $q$update public.positioning set one_sentence = 'A chair yoga guide.', reader_promise = 'You can move safely.', approach = 'Seated poses.', lacks = '["No seated plan"]', selling_points = '["Safe for knees"]', focus_tags = '{}' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('server saves flags and the check time', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open')), drift_checked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('flag shape: open with a reason refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open', 'x'))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: kept without a reason refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('kept', ' '))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: kept reason of 201 refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('kept', repeat('a', 201)))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: unknown status refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('done'))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: unknown field refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open') || '{"field":"title"}')$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: extra key refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open') || '{"x":1}')$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: quote of 301 refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open') || jsonb_build_object('quote', repeat('a', 301)))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: id of 41 refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open') || jsonb_build_object('id', repeat('a', 41)))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: repeated ids refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open'), pg_temp.flag('open'))$q$, '23514%positioning_drift_flags_shape_check%');
select pg_temp.expect('flag shape: 7 flags refused', $q$update public.positioning set drift_flags = (select jsonb_agg(pg_temp.flag('open') || jsonb_build_object('id', 'd' || i)) from generate_series(1, 7) i)$q$, '23514%positioning_drift_flags_shape_check%');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('browser cannot change a flag quote', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open') || '{"quote":"yoga"}')$q$, 'P0001 drift_flags_server_only%');
select pg_temp.expect('browser cannot remove a flag', $q$update public.positioning set drift_flags = '[]'$q$, 'P0001 drift_flags_server_only%');
select pg_temp.expect('browser cannot change drift_checked_at', $q$update public.positioning set drift_checked_at = now() - interval '1 day'$q$, 'P0001 drift_check_server_only%');

-- ── Lock rules ──
select pg_temp.expect('lock with an open flag refused', $q$update public.positioning set locked_at = now()$q$, 'P0001 positioning_not_ready | Resolve the drift flags first.');
select pg_temp.expect('browser keeps a flag with a reason', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('kept', 'It is the point of the book.'))$q$, 'OK 1');
select pg_temp.chk('keeping a flag keeps the drift check', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).drift_checked_at is not null);
select pg_temp.expect('browser undoes keep', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open'))$q$, 'OK 1');
select pg_temp.expect('browser keeps it again', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('kept', 'It is the point of the book.'))$q$, 'OK 1');
select pg_temp.expect('text edit works', $q$update public.positioning set approach = 'Seated poses, with photos.'$q$, 'OK 1');
select pg_temp.chk('text edit clears the drift check', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).drift_checked_at is null);
select pg_temp.expect('lock without a current drift check refused', $q$update public.positioning set locked_at = now()$q$, 'P0001 positioning_not_ready | Run the drift check first.');
reset role;
set role service_role;
select pg_temp.expect('server saves a new check', $q$update public.positioning set drift_checked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('lock with missing fields refused, all listed', $q$update public.positioning set one_sentence = null, reader_promise = null, approach = null, lacks = '[]', selling_points = '[]', locked_at = now()$q$,
  'P0001 positioning_not_ready | Missing: one_sentence, reader_promise, approach, lacks, selling_points.');
select pg_temp.expect('lock with an empty lacks list refused', $q$update public.positioning set lacks = '[]', locked_at = now()$q$, 'P0001 positioning_not_ready | Missing: lacks.');
select pg_temp.expect('lock with focus_tags empty works (tags optional)', $q$update public.positioning set locked_at = '2000-01-01'$q$, 'OK 1');
select pg_temp.chk('locked_at comes from the server clock', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).locked_at > '2020-01-01');

-- ── A locked row is read-only ──
select pg_temp.expect('locked: text edit refused', $q$update public.positioning set approach = 'New.'$q$, 'P0001 positioning_locked%');
select pg_temp.expect('locked: flag edit refused', $q$update public.positioning set drift_flags = jsonb_build_array(pg_temp.flag('open'))$q$, 'P0001 positioning_locked%');
select pg_temp.expect('locked: unlock by direct update refused', $q$update public.positioning set locked_at = null$q$, 'P0001 positioning_unlock_rpc%');
select x from (select (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).locked_at::text x) s \gset before_
select pg_temp.expect('locked: a new locked_at is ignored', $q$update public.positioning set locked_at = '2001-01-01'$q$, 'OK 1');
select pg_temp.chk('locked: locked_at unchanged', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).locked_at::text = :'before_x');
reset role;
set role service_role;
select pg_temp.expect('locked: server cannot change the drift check', $q$update public.positioning set drift_checked_at = now() + interval '1 hour' where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 positioning_locked%');
reset role;

-- ── unlock_positioning() ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('user B cannot unlock A''s book (reads as not locked)', $q$select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')$q$, 'P0002 positioning_not_locked%');
reset role;
select pg_temp.chk('A''s book is still locked', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).locked_at is not null);
set role anon;
select pg_temp.expect('anon cannot run unlock', $q$select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')$q$, '42501%');
reset role;

select count(*) as n from public.section_versions \gset rows_
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')::text as x \gset unlock_
select pg_temp.chk('unlock returns what was marked', :'unlock_x' = '{"title": true, "chapters": 2, "written_chapters": 1}', :'unlock_x');
reset role;
select pg_temp.chk('unlock clears locked_at', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).locked_at is null);
select pg_temp.chk('unlock keeps the drift check (text did not change)', (pg_temp.pos('b0000000-0000-4000-8000-000000000001')).drift_checked_at is not null);
select pg_temp.chk('unlock marks the title', (select title_needs_review from public.books where id = 'b0000000-0000-4000-8000-000000000001'));
select pg_temp.chk('unlock marks every chapter', (select bool_and(needs_review) from public.chapters where book_id = 'b0000000-0000-4000-8000-000000000001'));
select pg_temp.chk('unlock marks the written section', (select needs_review from public.sections where id = '50000000-0000-4000-8000-000000000001'));
select pg_temp.chk('unlock leaves unwritten sections', (select not bool_or(needs_review) from public.sections where current_version_id is null));
select pg_temp.chk('unlock deletes nothing', (select count(*) from public.section_versions) = :rows_n and (select count(*) from public.chapters) = 2 and (select count(*) from public.sections) = 3);
select pg_temp.chk('the unlock flag is off after the call', coalesce(current_setting('kdp.positioning_unlock', true), '') = '');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('unlock again: not locked', $q$select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')$q$, 'P0002 positioning_not_locked%');

-- Re-lock and unlock in one transaction: the unlock flag does not leak to a later direct update.
begin;
select pg_temp.expect('re-lock works (check still current)', $q$update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('unlock in a transaction', $q$select public.unlock_positioning('b0000000-0000-4000-8000-000000000001')$q$, 'OK 1');
select pg_temp.expect('re-lock in the same transaction', $q$update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('then a direct unlock is still refused', $q$update public.positioning set locked_at = null where book_id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 positioning_unlock_rpc%');
commit;

-- A book with no title and nothing built on it.
reset role;
insert into public.positioning (book_id, user_id, one_sentence, reader_promise, approach, lacks, selling_points)
  values ('b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'S.', 'P.', 'A.', '["L"]', '["S"]');
set role service_role;
update public.positioning set drift_checked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000002';
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000002';
select public.unlock_positioning('b0000000-0000-4000-8000-000000000002')::text as x \gset unlock2_
select pg_temp.chk('no title: unlock marks nothing', :'unlock2_x' = '{"title": false, "chapters": 0, "written_chapters": 0}', :'unlock2_x');
reset role;
select pg_temp.chk('no title: title_needs_review stays false', not (select title_needs_review from public.books where id = 'b0000000-0000-4000-8000-000000000002'));

-- ── Positioning edits move the book to the top of Books (0009) ──
update public.books set updated_at = '2020-01-01' where id = 'b0000000-0000-4000-8000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set approach = 'Seated poses only.' where book_id = 'b0000000-0000-4000-8000-000000000002';
reset role;
select pg_temp.chk('an edit touches the book', (select updated_at from public.books where id = 'b0000000-0000-4000-8000-000000000002') > '2020-01-02');
