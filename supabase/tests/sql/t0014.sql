-- 0014: book_briefs.target_words (2000 to 150000, never with length_range)
-- and research_insights.inputs_key (hex fingerprint), both sides, plus RLS.
-- Run: supabase/tests/sql/run.sh t0014.sql
\ir helpers.sql

insert into auth.users values ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b');
insert into public.books (id, user_id, title) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Book A'),
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Book B');
-- Rows like the live ones before 0014: one with a range, one empty.
insert into public.book_briefs (book_id, user_id, topic_text, length_range, chapter_count) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Topic A', '5-8k', 5),
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Topic B', null, null);
insert into public.research_insights (book_id, user_id, analyzed_at) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', now());

select pg_temp.chk('existing brief keeps its range, target null',
  (select length_range = '5-8k' and target_words is null from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000001'));
select pg_temp.chk('existing insights row has a null key',
  (select inputs_key is null from public.research_insights where book_id = 'a3000000-0000-4000-8000-000000000001'));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- target_words range
select pg_temp.expect('target 2000 with range cleared is saved',
  $q$update public.book_briefs set length_range = null, target_words = 2000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('target 150000 is saved',
  $q$update public.book_briefs set target_words = 150000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('target 15000 is saved',
  $q$update public.book_briefs set target_words = 15000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('target 1999 is refused',
  $q$update public.book_briefs set target_words = 1999 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%target_words_range%');
select pg_temp.expect('target 150001 is refused',
  $q$update public.book_briefs set target_words = 150001 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%target_words_range%');
select pg_temp.expect('target 0 is refused',
  $q$update public.book_briefs set target_words = 0 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('target -5000 is refused',
  $q$update public.book_briefs set target_words = -5000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');

-- one value at a time
select pg_temp.expect('range while a target is set is refused',
  $q$update public.book_briefs set length_range = '8-12k' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%length_one_value%');
select pg_temp.expect('range plus target cleared in one update is saved',
  $q$update public.book_briefs set length_range = '8-12k', target_words = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('target while a range is set is refused',
  $q$update public.book_briefs set target_words = 20000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%length_one_value%');
select pg_temp.expect('both null is saved',
  $q$update public.book_briefs set length_range = null, target_words = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');

-- chapters: the 0001 range still holds (i1 "Other" uses 3 to 30)
select pg_temp.expect('chapters 3 is saved', $q$update public.book_briefs set chapter_count = 3 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('chapters 30 is saved', $q$update public.book_briefs set chapter_count = 30 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('chapters 2 is refused', $q$update public.book_briefs set chapter_count = 2 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('chapters 31 is refused', $q$update public.book_briefs set chapter_count = 31 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');

-- inputs_key format
select pg_temp.expect('key of 8 hex is saved',
  $q$update public.research_insights set inputs_key = '0a1b2c3d' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('key of 32 hex is saved',
  $q$update public.research_insights set inputs_key = repeat('f', 32) where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('key of 33 hex is refused',
  $q$update public.research_insights set inputs_key = repeat('f', 33) where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%inputs_key_format%');
select pg_temp.expect('key of 7 hex is refused',
  $q$update public.research_insights set inputs_key = 'abcdef0' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('upper case key is refused',
  $q$update public.research_insights set inputs_key = 'ABCDEF01' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('non-hex key is refused',
  $q$update public.research_insights set inputs_key = 'hello world' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('empty key is refused',
  $q$update public.research_insights set inputs_key = '' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%');
select pg_temp.expect('null key is saved',
  $q$update public.research_insights set inputs_key = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
-- the browser upsert shape (a new analysis)
select pg_temp.expect('upsert with lines, analyzed_at and key is saved',
  $q$insert into public.research_insights (book_id, loves, hates, gaps, analyzed_at, inputs_key)
     values ('a3000000-0000-4000-8000-000000000001', '[]', '[]', '[]', now(), '1234abcd5678ef90')
     on conflict (book_id) do update set loves = excluded.loves, analyzed_at = excluded.analyzed_at, inputs_key = excluded.inputs_key$q$, 'OK 1');
reset role;

-- RLS: user B cannot change user A's new columns
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('B cannot set A''s target_words',
  $q$update public.book_briefs set target_words = 9000 where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.expect('B cannot set A''s inputs_key',
  $q$update public.research_insights set inputs_key = 'deadbeef' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.chk('B sees no target of A', (select count(*) = 0 from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000001'));
select pg_temp.expect('B sets own target', $q$update public.book_briefs set target_words = 9000 where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;

select pg_temp.chk('A''s key unchanged by B',
  (select inputs_key = '1234abcd5678ef90' from public.research_insights where book_id = 'a3000000-0000-4000-8000-000000000001'));
select pg_temp.chk('A''s target unchanged by B',
  (select target_words is null from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000001'));
