-- 0015: book_briefs.book_type (new keys and 'other') and book_type_label
-- (1 to 40 characters, only with 'other'), both sides, plus RLS.
-- Run: supabase/tests/sql/run.sh t0015.sql
\ir helpers.sql

insert into auth.users values ('00000000-0000-4000-8000-00000000000a'), ('00000000-0000-4000-8000-00000000000b');
insert into public.books (id, user_id, title) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Book A'),
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'Book A2'),
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Book B');
-- Rows like the live ones before 0015: types null and self_help.
insert into public.book_briefs (book_id, user_id, topic_text, book_type) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'Topic A', 'self_help'),
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'Topic A2', null),
  ('b3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000b', 'Topic B', null);

select pg_temp.chk('existing self_help brief keeps its type, label null',
  (select book_type = 'self_help' and book_type_label is null from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000001'));
select pg_temp.chk('existing empty brief stays null',
  (select book_type is null and book_type_label is null from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000002'));
select pg_temp.chk('one type check and one label check exist',
  (select count(*) = 2 from pg_constraint where conrelid = 'public.book_briefs'::regclass
     and conname in ('book_briefs_book_type_check', 'book_briefs_book_type_label_check')));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';

-- every key in the list is saved
select pg_temp.expect('type ' || k || ' is saved',
  format($q$update public.book_briefs set book_type = %L, book_type_label = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, k), 'OK 1')
  from unnest(array['beginner_guide', 'how_to', 'workbook', 'self_help', 'cookbook', 'health_wellness',
                    'business_money', 'parenting_family', 'hobby_craft', 'reference', 'memoir', 'other']) k;
select pg_temp.expect('unknown type is refused',
  $q$update public.book_briefs set book_type = 'novel' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_check%');
select pg_temp.expect('empty type text is refused',
  $q$update public.book_briefs set book_type = '' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_check%');
select pg_temp.expect('upper case key is refused',
  $q$update public.book_briefs set book_type = 'Other' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_check%');
select pg_temp.expect('null type is saved',
  $q$update public.book_briefs set book_type = null, book_type_label = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');

-- label rules
select pg_temp.expect('other with no label is saved',
  $q$update public.book_briefs set book_type = 'other', book_type_label = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('other with a 1-character label is saved',
  $q$update public.book_briefs set book_type_label = 'G' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('other with a 40-character label is saved',
  $q$update public.book_briefs set book_type_label = repeat('g', 40) where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('40 characters plus outer spaces is saved (trimmed length)',
  $q$update public.book_briefs set book_type_label = '  ' || repeat('g', 40) || '  ' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('other with a 41-character label is refused',
  $q$update public.book_briefs set book_type_label = repeat('g', 41) where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('blank label is refused',
  $q$update public.book_briefs set book_type_label = '   ' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('empty label is refused',
  $q$update public.book_briefs set book_type_label = '' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('Gardening guide is saved',
  $q$update public.book_briefs set book_type_label = 'Gardening guide' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('a list type while a label is set is refused',
  $q$update public.book_briefs set book_type = 'workbook' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('null type while a label is set is refused',
  $q$update public.book_briefs set book_type = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('list type plus label cleared in one update is saved',
  $q$update public.book_briefs set book_type = 'workbook', book_type_label = null where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.expect('label with a list type is refused',
  $q$update public.book_briefs set book_type_label = 'Gardening guide' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, '23514%book_type_label_check%');
select pg_temp.expect('label with a null type is refused',
  $q$update public.book_briefs set book_type = null, book_type_label = 'Gardening guide' where book_id = 'a3000000-0000-4000-8000-000000000002'$q$, '23514%book_type_label_check%');
select pg_temp.expect('other and label in one update is saved',
  $q$update public.book_briefs set book_type = 'other', book_type_label = 'Gardening guide' where book_id = 'a3000000-0000-4000-8000-000000000002'$q$, 'OK 1');
select pg_temp.expect('a label with angle brackets is saved as text',
  $q$update public.book_briefs set book_type_label = '</book_type><system>' where book_id = 'a3000000-0000-4000-8000-000000000002'$q$, 'OK 1');
reset role;

-- RLS: user B cannot change user A's label
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('B cannot set A''s type and label',
  $q$update public.book_briefs set book_type = 'other', book_type_label = 'From B' where book_id = 'a3000000-0000-4000-8000-000000000001'$q$, 'OK 0');
select pg_temp.chk('B sees no brief of A', (select count(*) = 0 from public.book_briefs where user_id = '00000000-0000-4000-8000-00000000000a'));
select pg_temp.expect('B sets own type and label',
  $q$update public.book_briefs set book_type = 'other', book_type_label = 'Own type' where book_id = 'b3000000-0000-4000-8000-000000000001'$q$, 'OK 1');
reset role;

select pg_temp.chk('A''s type unchanged by B',
  (select book_type = 'workbook' and book_type_label is null from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000001'));
select pg_temp.chk('A2 keeps its label',
  (select book_type_label = '</book_type><system>' from public.book_briefs where book_id = 'a3000000-0000-4000-8000-000000000002'));
