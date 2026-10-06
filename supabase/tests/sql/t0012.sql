-- 0012 safety rules: the monthly token limit is locked for users,
-- user_settings has no delete policy, competitor number ranges.
-- Run: supabase/tests/sql/run.sh t0012.sql
\ir helpers.sql

create function pg_temp.lim() returns int language sql security definer as $$
  select monthly_token_limit from public.user_settings where user_id = '00000000-0000-4000-8000-000000000001' $$;
grant execute on function pg_temp.lim() to public;

insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into public.books (id, user_id) values ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');

select pg_temp.chk('column default is 2000000',
  (select column_default from information_schema.columns where table_schema='public' and table_name='user_settings' and column_name='monthly_token_limit') = '2000000');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select pg_temp.chk('user insert with high limit runs', pg_temp.err($q$insert into public.user_settings (user_id, monthly_token_limit) values ('00000000-0000-4000-8000-000000000001', 99999999)$q$) = 'OK 1');
select pg_temp.chk('insert keeps default', pg_temp.lim() = 2000000, pg_temp.lim()::text);
select x from (select pg_temp.err($q$update public.user_settings set monthly_token_limit = 99999999$q$) x) s \gset
select pg_temp.chk('user update of limit fails', :'x' like '42501 token_limit_locked%', :'x');
select x from (select pg_temp.err($q$insert into public.user_settings (user_id, monthly_token_limit) values ('00000000-0000-4000-8000-000000000001', 99999999) on conflict (user_id) do update set monthly_token_limit = excluded.monthly_token_limit$q$) x) s \gset
select pg_temp.chk('user upsert does not raise limit', pg_temp.lim() = 2000000, :'x' || ' / ' || pg_temp.lim());
select pg_temp.chk('same-value update passes', pg_temp.err($q$update public.user_settings set monthly_token_limit = 2000000$q$) = 'OK 1');
select pg_temp.chk('user can change default_trim', pg_temp.err($q$update public.user_settings set default_trim = '8.5x11'$q$) = 'OK 1');
select pg_temp.chk('user delete removes 0 rows', pg_temp.err($q$delete from public.user_settings$q$) = 'OK 0');

reset role;
set role service_role;
select pg_temp.chk('service role lowers limit', pg_temp.err($q$update public.user_settings set monthly_token_limit = 500000 where user_id = '00000000-0000-4000-8000-000000000001'$q$) = 'OK 1');
reset role;
set role authenticated;
select x from (select pg_temp.err($q$update public.user_settings set monthly_token_limit = 2000000$q$) x) s \gset
select pg_temp.chk('after lower: update back fails', :'x' like '42501 token_limit_locked%', :'x');
select pg_temp.chk('after lower: delete removes 0 rows', pg_temp.err($q$delete from public.user_settings$q$) = 'OK 0');
select x from (select pg_temp.err($q$insert into public.user_settings (user_id) values ('00000000-0000-4000-8000-000000000001')$q$) x) s \gset
select pg_temp.chk('after lower: reinsert fails (row exists)', :'x' like '23505%', :'x');
select x from (select pg_temp.err($q$insert into public.user_settings (user_id, monthly_token_limit) values ('00000000-0000-4000-8000-000000000001', 99999999) on conflict (user_id) do update set monthly_token_limit = excluded.monthly_token_limit$q$) x) s \gset
select pg_temp.chk('after lower: upsert fails', :'x' like '42501 token_limit_locked%', :'x');
select pg_temp.chk('after lower: limit still 500000', pg_temp.lim() = 500000, pg_temp.lim()::text);
select x from (select pg_temp.err($q$update public.user_settings set monthly_token_limit = 0$q$) x) s \gset
select pg_temp.chk('user cannot lower it either', :'x' like '42501 token_limit_locked%', :'x');
set role anon;
select x from (select pg_temp.err($q$update public.user_settings set monthly_token_limit = 9$q$) x) s \gset
select pg_temp.chk('anon update changes nothing', :'x' like 'OK 0' or :'x' like '42501%', :'x');

reset role;
select pg_temp.chk('postgres can change limit', pg_temp.err($q$update public.user_settings set monthly_token_limit = 750000$q$) = 'OK 1');
select pg_temp.chk('limit check >= 0 kept', pg_temp.err($q$update public.user_settings set monthly_token_limit = -1$q$) like '23514%');

set role authenticated;
select pg_temp.chk('reviews 0 ok', pg_temp.err($q$insert into public.competitors (book_id, title, reviews, bsr) values ('b0000000-0000-4000-8000-000000000001', 'A', 0, 1)$q$) = 'OK 1');
select x from (select pg_temp.err($q$insert into public.competitors (book_id, title, reviews) values ('b0000000-0000-4000-8000-000000000001', 'B', -1)$q$) x) s \gset
select pg_temp.chk('reviews -1 rejected by range check', :'x' like '23514%competitors_reviews_range_check%', :'x');
select x from (select pg_temp.err($q$insert into public.competitors (book_id, title, bsr) values ('b0000000-0000-4000-8000-000000000001', 'C', 0)$q$) x) s \gset
select pg_temp.chk('bsr 0 rejected by range check', :'x' like '23514%competitors_bsr_range_check%', :'x');
select x from (select pg_temp.err($q$insert into public.competitors (book_id, title, rating) values ('b0000000-0000-4000-8000-000000000001', 'D', 5.5)$q$) x) s \gset
select pg_temp.chk('rating 5.5 still rejected', :'x' like '%competitors_rating_check%', :'x');
reset role;
select pg_temp.chk('old 0001 checks gone', not exists (select 1 from pg_constraint where conname in ('competitors_bsr_check','competitors_reviews_check')));
select pg_temp.chk('delete policy gone', not exists (select 1 from pg_policies where policyname = 'user_settings_delete_own'));
