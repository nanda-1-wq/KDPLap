-- 0013: nobody but the owner can execute user_settings_guard_limit(),
-- and the 0012 limit rules still hold.
-- Run: supabase/tests/sql/run.sh t0013.sql
\ir helpers.sql

create function pg_temp.lim() returns int language sql security definer as $$
  select monthly_token_limit from public.user_settings where user_id = '00000000-0000-4000-8000-000000000001' $$;
grant execute on function pg_temp.lim() to public;
insert into auth.users values ('00000000-0000-4000-8000-000000000001');

select pg_temp.chk('anon has no EXECUTE', not has_function_privilege('anon', 'public.user_settings_guard_limit()', 'execute'));
select pg_temp.chk('authenticated has no EXECUTE', not has_function_privilege('authenticated', 'public.user_settings_guard_limit()', 'execute'));
select pg_temp.chk('PUBLIC has no EXECUTE', not exists (
  select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.user_settings_guard_limit()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'));
select pg_temp.chk('trigger still attached', exists (
  select 1 from pg_trigger where tgname = 'user_settings_guard_limit' and tgrelid = 'public.user_settings'::regclass));

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select x from (select pg_temp.err($q$select public.user_settings_guard_limit()$q$) x) s \gset
select pg_temp.chk('direct call as authenticated is refused', :'x' like '42501%', :'x');
select pg_temp.chk('user insert with high limit runs', pg_temp.err($q$insert into public.user_settings (user_id, monthly_token_limit) values ('00000000-0000-4000-8000-000000000001', 99999999)$q$) = 'OK 1');
select pg_temp.chk('trigger still forces the default on insert', pg_temp.lim() = 2000000, pg_temp.lim()::text);
select x from (select pg_temp.err($q$update public.user_settings set monthly_token_limit = 99999999$q$) x) s \gset
select pg_temp.chk('trigger still locks the limit on update', :'x' like '42501 token_limit_locked%', :'x');
reset role;
set role anon;
select x from (select pg_temp.err($q$select public.user_settings_guard_limit()$q$) x) s \gset
select pg_temp.chk('direct call as anon is refused', :'x' like '42501%', :'x');
reset role;
set role service_role;
select pg_temp.chk('service role still changes the limit', pg_temp.err($q$update public.user_settings set monthly_token_limit = 500000$q$) = 'OK 1');
