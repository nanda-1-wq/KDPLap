-- 0011 title rules: book title, subtitle and examples limits, the
-- title_needs_review guard, title_options limits, the 40-option cap and the
-- read-only rule (only the star changes).
-- Rebuilt in Batch B1 (the E8.2 suite was lost with its scratchpad).
-- Run: supabase/tests/sql/run.sh t0011.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
insert into auth.users values (:A);
insert into public.books (id, user_id) values (:BOOK1, :A), (:BOOK2, :A);

create function pg_temp.opts(b uuid) returns bigint language sql security definer as $$
  select count(*) from public.title_options where book_id = b $$;
grant execute on function pg_temp.opts(uuid) to public;

-- ── Function privileges ──
select pg_temp.chk('books_title_review_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.books_title_review_guard()', 'execute'));
select pg_temp.chk('title_options_guard(): no EXECUTE for authenticated', not has_function_privilege('authenticated', 'public.title_options_guard()', 'execute'));
select pg_temp.chk('title_options_guard(): no EXECUTE for anon', not has_function_privilege('anon', 'public.title_options_guard()', 'execute'));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- ── books: examples, subtitle, combined length ──
select pg_temp.expect('examples: 3 ok', $q$update public.books set title_examples = array['a','b','c'] where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('examples: 4 refused', $q$update public.books set title_examples = array['a','b','c','d'] where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_title_examples_check%');
select pg_temp.expect('examples: 250 chars ok', $q$update public.books set title_examples = array[repeat('a', 250)] where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('examples: 251 chars refused', $q$update public.books set title_examples = array[repeat('a', 251)] where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_title_examples_check%');
select pg_temp.expect('examples: blank refused', $q$update public.books set title_examples = array[' '] where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_title_examples_check%');
select pg_temp.expect('subtitle without a title refused', $q$update public.books set subtitle = 'Gentle routines' where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_subtitle_length_check%');
select pg_temp.expect('subtitle blank refused', $q$update public.books set title = 'T', subtitle = '  ' where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_subtitle_length_check%');
select pg_temp.expect('subtitle 201 refused', $q$update public.books set title = 'T', subtitle = repeat('a', 201) where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_subtitle_length_check%');
select pg_temp.expect('title + ": " + subtitle = 200 ok', $q$update public.books set title = repeat('t', 100), subtitle = repeat('s', 98) where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('title + ": " + subtitle = 201 refused', $q$update public.books set title = repeat('t', 100), subtitle = repeat('s', 99) where id = 'b0000000-0000-4000-8000-000000000001'$q$, '23514%books_title_combined_check%');
select pg_temp.expect('title of 200, no subtitle ok', $q$update public.books set title = repeat('t', 200), subtitle = null where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;
select pg_temp.chk('title_combined_length counts ": "', public.title_combined_length('Ab', 'Cd') = 6 and public.title_combined_length('Ab', null) = 2);

-- ── title_needs_review guard ──
update public.books set title = 'Chair Yoga', title_needs_review = true where id = 'b0000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('needs review: no positioning, clear refused', $q$update public.books set title_needs_review = false where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 positioning_not_locked%');
insert into public.positioning (book_id, one_sentence, reader_promise, approach, lacks, selling_points) values ('b0000000-0000-4000-8000-000000000001', 'S.', 'P.', 'A.', '["L"]', '["S"]');
select pg_temp.expect('needs review: unlocked positioning, clear refused', $q$update public.books set title_needs_review = false where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'P0001 positioning_not_locked%');
select pg_temp.expect('needs review: other edits still work', $q$update public.books set title = 'Chair Yoga Made Simple' where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;
set role service_role;
update public.positioning set drift_checked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.positioning set locked_at = now() where book_id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.expect('needs review: locked positioning, clear works', $q$update public.books set title_needs_review = false where id = 'b0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('needs review: false to true always works', $q$update public.books set title_needs_review = true where id = 'b0000000-0000-4000-8000-000000000002'$q$, 'OK 1');
reset role;
select pg_temp.expect('needs review: the guard holds for the owner role too', $q$update public.books set title_needs_review = false where id = 'b0000000-0000-4000-8000-000000000002'$q$, 'P0001 positioning_not_locked%');

-- ── title_options limits ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('option: title 200 ok', $q$insert into public.title_options (book_id, title) values ('b0000000-0000-4000-8000-000000000002', repeat('a', 200))$q$, 'OK 1');
-- 201 characters also break the combined check, which Postgres runs first (name order).
select pg_temp.expect('option: title 201 refused', $q$insert into public.title_options (book_id, title) values ('b0000000-0000-4000-8000-000000000002', repeat('a', 201))$q$, '23514%title_options_%_check%');
select pg_temp.expect('option: blank title refused', $q$insert into public.title_options (book_id, title) values ('b0000000-0000-4000-8000-000000000002', '  ')$q$, '23514%title_options_title_length_check%');
select pg_temp.expect('option: subtitle 201 refused', $q$insert into public.title_options (book_id, title, subtitle) values ('b0000000-0000-4000-8000-000000000002', 'T', repeat('a', 201))$q$, '23514%title_options_%_check%');
select pg_temp.expect('option: blank subtitle refused', $q$insert into public.title_options (book_id, title, subtitle) values ('b0000000-0000-4000-8000-000000000002', 'T', ' ')$q$, '23514%title_options_subtitle_length_check%');
select pg_temp.expect('option: combined 201 refused', $q$insert into public.title_options (book_id, title, subtitle) values ('b0000000-0000-4000-8000-000000000002', repeat('t', 100), repeat('s', 99))$q$, '23514%title_options_combined_check%');
select pg_temp.expect('option: reason 300 ok', $q$insert into public.title_options (book_id, title, reason) values ('b0000000-0000-4000-8000-000000000002', 'T2', repeat('a', 300))$q$, 'OK 1');
select pg_temp.expect('option: reason 301 refused', $q$insert into public.title_options (book_id, title, reason) values ('b0000000-0000-4000-8000-000000000002', 'T', repeat('a', 301))$q$, '23514%title_options_reason_length_check%');
select pg_temp.expect('option: blank reason refused', $q$insert into public.title_options (book_id, title, reason) values ('b0000000-0000-4000-8000-000000000002', 'T', ' ')$q$, '23514%title_options_reason_length_check%');
select pg_temp.expect('option: 5 keywords ok', $q$insert into public.title_options (book_id, title, keywords) values ('b0000000-0000-4000-8000-000000000002', 'T3', array['a','b','c','d','e'])$q$, 'OK 1');
select pg_temp.expect('option: 6 keywords refused', $q$insert into public.title_options (book_id, title, keywords) values ('b0000000-0000-4000-8000-000000000002', 'T', array['a','b','c','d','e','f'])$q$, '23514%title_options_keywords_check%');
select pg_temp.expect('option: keyword of 61 refused', $q$insert into public.title_options (book_id, title, keywords) values ('b0000000-0000-4000-8000-000000000002', 'T', array[repeat('a', 61)])$q$, '23514%title_options_keywords_check%');
select pg_temp.expect('option: 10 unsourced ok', $q$insert into public.title_options (book_id, title, unsourced) values ('b0000000-0000-4000-8000-000000000002', 'T4', array['1','2','3','4','5','6','7','8','9','10'])$q$, 'OK 1');
select pg_temp.expect('option: 11 unsourced refused', $q$insert into public.title_options (book_id, title, unsourced) values ('b0000000-0000-4000-8000-000000000002', 'T', array['1','2','3','4','5','6','7','8','9','10','11'])$q$, '23514%title_options_unsourced_check%');
select pg_temp.expect('option: unsourced item of 21 refused', $q$insert into public.title_options (book_id, title, unsourced) values ('b0000000-0000-4000-8000-000000000002', 'T', array[repeat('1', 21)])$q$, '23514%title_options_unsourced_check%');
select pg_temp.chk('option: unsourced defaults to empty', (select unsourced = '{}' from public.title_options where title = 'T3'));

-- ── Read-only after insert: only the star changes ──
select pg_temp.expect('star: shortlist works', $q$update public.title_options set shortlisted = true where title = 'T3'$q$, 'OK 1');
select pg_temp.expect('star: unshortlist works', $q$update public.title_options set shortlisted = false where title = 'T3'$q$, 'OK 1');
select pg_temp.expect('read-only: title', $q$update public.title_options set title = 'New' where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: subtitle', $q$update public.title_options set subtitle = 'New' where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: reason', $q$update public.title_options set reason = 'New' where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: keywords', $q$update public.title_options set keywords = '{}' where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: unsourced', $q$update public.title_options set unsourced = array['9'] where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: created_at', $q$update public.title_options set created_at = now() - interval '1 day' where title = 'T3'$q$, 'P0001 title_option_read_only%');
select pg_temp.expect('read-only: moving to another book', $q$update public.title_options set book_id = 'b0000000-0000-4000-8000-000000000001' where title = 'T3'$q$, 'P0001 title_option_read_only%');
reset role;
set role service_role;
select pg_temp.expect('read-only: the service role too', $q$update public.title_options set title = 'New' where title = 'T3'$q$, 'P0001 title_option_read_only%');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
select pg_temp.expect('remove is a plain delete', $q$delete from public.title_options where title = 'T4'$q$, 'OK 1');

-- ── At most 40 options per book ──
-- Book 2 has 3 options now (200 a's, T2, T3).
select pg_temp.expect('cap: 37 more in one insert (40 in all) ok', $q$insert into public.title_options (book_id, title) select 'b0000000-0000-4000-8000-000000000002', 'Cap ' || i from generate_series(1, 37) i$q$, 'OK 37');
select pg_temp.chk('cap: 40 saved', pg_temp.opts('b0000000-0000-4000-8000-000000000002') = 40, pg_temp.opts('b0000000-0000-4000-8000-000000000002')::text);
select pg_temp.expect('cap: the 41st refused', $q$insert into public.title_options (book_id, title) values ('b0000000-0000-4000-8000-000000000002', 'One more')$q$, 'P0001 title_options_full%');
select pg_temp.expect('cap: delete one, then one fits', $q$delete from public.title_options where title = 'Cap 1'$q$, 'OK 1');
select pg_temp.expect('cap: one more fits again', $q$insert into public.title_options (book_id, title) values ('b0000000-0000-4000-8000-000000000002', 'One more')$q$, 'OK 1');
select pg_temp.expect('cap: book 1 with 35 options', $q$insert into public.title_options (book_id, title) select 'b0000000-0000-4000-8000-000000000001', 'B1 ' || i from generate_series(1, 35) i$q$, 'OK 35');
select pg_temp.expect('cap: one insert of 10 past the cap is refused whole', $q$insert into public.title_options (book_id, title) select 'b0000000-0000-4000-8000-000000000001', 'Batch ' || i from generate_series(1, 10) i$q$, 'P0001 title_options_full%');
select pg_temp.chk('cap: nothing of that batch was saved', pg_temp.opts('b0000000-0000-4000-8000-000000000001') = 35, pg_temp.opts('b0000000-0000-4000-8000-000000000001')::text);

-- ── Option edits move the book to the top of Books (0009) ──
reset role;
update public.books set updated_at = '2020-01-01' where id = 'b0000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
update public.title_options set shortlisted = true where title = 'B1 1';
reset role;
select pg_temp.chk('a star touches the book', (select updated_at from public.books where id = 'b0000000-0000-4000-8000-000000000001') > '2020-01-02');
