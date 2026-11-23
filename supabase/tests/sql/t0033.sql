-- 0033 E16.3 (B2): the stock v1 write path is closed.
-- Shape (one policy left on stock_calls, select own; no insert, update, delete or truncate for anon
-- or authenticated; stock_usage gone; stock_reserve, stock_release, the guard, the purge and
-- stock_cache kept); a direct insert refused as A, as B with A's id, signed out and as anon, and
-- none of them writes a row; stock_usage refused as gone (42883); stock_reserve still answers and
-- writes the caller's row (server clock, not released); the minute limit; stock_release; the
-- Unsplash caps through stock_reserve; the guard is still the second wall (table owner, service
-- role); the 2-hour purge on stock_reserve's insert; select own both ways.
-- Run: supabase/tests/sql/run.sh t0033.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set NOSUB 'set role authenticated; reset request.jwt.claim.sub;'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'

insert into auth.users values (:A), (:B);

create function pg_temp.is(name text, got text, want text) returns text language sql as $$
  select pg_temp.chk(name, got like want, got) $$;
-- reserve_n: n calls of stock_reserve as the current user; the answers counted.
create function pg_temp.reserve_n(n int, src text, act text, calls int) returns text language plpgsql as $$
declare r jsonb; ok int := 0; rl int := 0; busy int := 0;
begin
  for i in 1..n loop
    r := public.stock_reserve(src, act, calls::smallint);
    if (r ->> 'ok')::boolean then ok := ok + 1;
    elsif r ->> 'code' = 'rate_limited' then rl := rl + 1;
    elsif r ->> 'code' = 'stock_busy' then busy := busy + 1;
    end if;
  end loop;
  return format('ok %s, rate_limited %s, stock_busy %s', ok, rl, busy);
end $$;
grant execute on all functions in schema pg_temp to public;

-- ── 1. Shape ──
select pg_temp.chk('stock_calls keeps one policy: stock_calls_select_own, select, authenticated',
  (select array_agg(policyname::text || ' ' || cmd || ' ' || array_to_string(roles, ',')) from pg_policies
    where schemaname = 'public' and tablename = 'stock_calls') = array['stock_calls_select_own SELECT authenticated'],
  (select string_agg(policyname::text || ' ' || cmd, ', ') from pg_policies where schemaname = 'public' and tablename = 'stock_calls'));
select pg_temp.chk(r || ': no insert, update, delete or truncate on stock_calls',
  not has_table_privilege(r, 'public.stock_calls', 'insert') and not has_table_privilege(r, 'public.stock_calls', 'update')
  and not has_table_privilege(r, 'public.stock_calls', 'delete') and not has_table_privilege(r, 'public.stock_calls', 'truncate'))
  from unnest(array['anon', 'authenticated']) r order by r;
select pg_temp.chk('no column-level insert on stock_calls for anon or authenticated',
  not exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'stock_calls'
               and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated')));
select pg_temp.chk('authenticated still reads stock_calls (select own)', has_table_privilege('authenticated', 'public.stock_calls', 'select'));
select pg_temp.chk('RLS stays on stock_calls', (select relrowsecurity from pg_class where oid = 'public.stock_calls'::regclass));
select pg_temp.chk('stock_usage is gone (no function of that name in any schema)', not exists (select 1 from pg_proc where proname = 'stock_usage'));
select pg_temp.chk('kept: stock_reserve and stock_release, definers, authenticated yes, anon no',
  (select count(*) = 2 and bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('stock_reserve', 'stock_release'))
  and has_function_privilege('authenticated', 'public.stock_reserve(text,text,smallint)', 'execute')
  and has_function_privilege('authenticated', 'public.stock_release(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.stock_reserve(text,text,smallint)', 'execute')
  and not has_function_privilege('anon', 'public.stock_release(bigint)', 'execute'));
select pg_temp.chk('kept: the guard (definer, fix A constants) before insert and the purge after insert, both enabled',
  (select prosecdef and prosrc like '%c_unsplash_hour_all     constant int := 45;%' and prosrc like '%c_unsplash_hour_user    constant int := 30;%'
     from pg_proc where oid = 'public.stock_calls_guard()'::regprocedure)
  and (select array_agg(tgname::text order by tgname) from pg_trigger where tgrelid = 'public.stock_calls'::regclass and not tgisinternal and tgenabled = 'O')
      = array['stock_calls_guard', 'stock_calls_purge']);
select pg_temp.chk('kept: stock_cache with its 4 own policies', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stock_cache') = 4);
select pg_temp.chk('the table comment says there is no direct insert', obj_description('public.stock_calls'::regclass, 'pg_class') like '%since 0033 there is no direct insert%');

-- ── 2. A direct insert is refused for every API role, and writes nothing ──
:ASA
select pg_temp.expect('A: a direct insert (a Pixabay search) is refused', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'search', 1)$q$, '42501 permission denied for table stock_calls%');
select pg_temp.expect('A: …with A''s own user id too', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'pick', 1)$q$, '42501 permission denied%');
select pg_temp.expect('A: …an Unsplash pick', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'pick', 2)$q$, '42501 permission denied%');
select pg_temp.expect('A: …a cache hit (0 calls)', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'search', 0)$q$, '42501 permission denied%');
select pg_temp.expect('A: …many rows in one statement', $q$insert into public.stock_calls (source, action, provider_calls) select 'pixabay', 'search', 1 from generate_series(1, 5)$q$, '42501 permission denied%');
select pg_temp.expect('A: …a row with released_at set', $q$insert into public.stock_calls (source, action, provider_calls, released_at) values ('pixabay', 'pick', 1, now())$q$, '42501 permission denied%');
select pg_temp.expect('A: stock_usage is gone', $q$select public.stock_usage()$q$, '42883%');
:ASB
select pg_temp.expect('B: a direct insert with A''s user id is refused', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'unsplash', 'search', 1)$q$, '42501 permission denied%');
:NOSUB
select pg_temp.expect('signed out (no user id): a direct insert is refused', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'search', 1)$q$, '42501 permission denied%');
:ANON
select pg_temp.expect('anon: a direct insert is refused', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'search', 1)$q$, '42501 permission denied%');
select pg_temp.expect('anon: stock_usage is gone', $q$select public.stock_usage()$q$, '42883%');
:OWNER
select pg_temp.chk('no refused insert wrote a row', (select count(*) from public.stock_calls) = 0);

-- ── 3. stock_reserve still writes the caller's row ──
:ASA
select public.stock_reserve('pixabay', 'search', 1::smallint) as r \gset s1_
select pg_temp.chk('A: stock_reserve answers {ok: true, id} with the row''s id',
  (:'s1_r'::jsonb ->> 'ok') = 'true' and (:'s1_r'::jsonb ->> 'id')::bigint = (select id from public.stock_calls), :'s1_r');
select pg_temp.chk('…the row: A''s, server clock, pixabay search, 1 call, not released (select own)',
  (select count(*) = 1 and bool_and(user_id = :A and at > now() - interval '1 minute' and at <= now() and source = 'pixabay'
          and action = 'search' and provider_calls = 1 and released_at is null) from public.stock_calls));
select pg_temp.is('the minute limit holds: 10 picks pass, the 11th is rate_limited', pg_temp.reserve_n(11, 'pixabay', 'pick', 1), 'ok 10, rate_limited 1, stock_busy 0');
select pg_temp.chk('stock_release frees A''s newest pick: true', public.stock_release((select max(id) from public.stock_calls where action = 'pick')));
select pg_temp.is('…so one more pick passes, the next is refused', pg_temp.reserve_n(2, 'pixabay', 'pick', 1), 'ok 1, rate_limited 1, stock_busy 0');
select pg_temp.expect('A still cannot change a row', $q$update public.stock_calls set released_at = now()$q$, '42501%');
select pg_temp.expect('A still cannot remove a row', $q$delete from public.stock_calls$q$, '42501%');

-- ── 4. Select own, both ways ──
:ASB
select pg_temp.chk('B sees none of A''s rows', (select count(*) from public.stock_calls) = 0);
select public.stock_reserve('pixabay', 'search', 1::smallint) as r \gset b1_
select pg_temp.chk('B: stock_reserve writes B''s row, and B sees only it',
  (select array_agg(id) from public.stock_calls) = array[(:'b1_r'::jsonb ->> 'id')::bigint]
  and (select bool_and(user_id = :B) from public.stock_calls), :'b1_r');
select pg_temp.chk('B cannot release A''s row', not public.stock_release((:'s1_r'::jsonb ->> 'id')::bigint));
:ASA
select pg_temp.chk('A sees 12 rows, none of B''s', (select count(*) = 12 and bool_and(user_id = :A) from public.stock_calls),
  (select count(*)::text from public.stock_calls));
:OWNER
delete from public.stock_calls;

-- ── 5. The Unsplash caps through stock_reserve ──
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at)
  select :A, 'unsplash', 'pick', 2, now() - interval '10 minutes' from generate_series(1, 14);
set session_replication_role = origin;
:ASA
select pg_temp.is('A at 28: 2 Unsplash searches pass (30), the 3rd gets stock_busy as an answer', pg_temp.reserve_n(3, 'unsplash', 'search', 1), 'ok 2, rate_limited 0, stock_busy 1');
select pg_temp.is('A at 30: a Pixabay search still passes', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');

-- ── 6. The guard is still the second wall (the paths that can still insert) ──
:OWNER
select pg_temp.expect('the table owner, no user id: A''s Unsplash row at 30 is refused by the guard',
  $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'unsplash', 'search', 1)$q$, 'P0001 stock_busy | Unsplash: 30 calls an hour per user.');
set request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
select pg_temp.expect('the table owner with B''s user id writing A''s row: own rows only (42501, before any count)',
  $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'search', 1)$q$, '42501 stock_calls: own rows only%');
reset request.jwt.claim.sub;
set role service_role;
select pg_temp.expect('the service role keeps its insert, and is held to the caps: A''s row at 30',
  $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'unsplash', 'search', 1)$q$, 'P0001 stock_busy%');
reset role;
select pg_temp.expect('the table owner: a row with released_at set comes in…',
  $q$insert into public.stock_calls (user_id, source, action, provider_calls, released_at, at) values ('00000000-0000-4000-8000-00000000000b', 'pixabay', 'search', 1, now() - interval '1 minute', '2001-01-01')$q$, 'OK 1');
select pg_temp.chk('…counted, at the server clock (the guard cleared released_at and set at)',
  (select released_at is null and at > now() - interval '1 minute' from public.stock_calls where user_id = :B order by id desc limit 1));
select pg_temp.chk('the refused inserts wrote nothing: A 30 Unsplash calls', (select sum(provider_calls) from public.stock_calls where user_id = :A and source = 'unsplash') = 30);
delete from public.stock_calls;

-- ── 7. The 2-hour purge still runs on stock_reserve's insert ──
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at) values
  (:A, 'pixabay', 'search', 1, now() - interval '3 hours'),
  (:A, 'pixabay', 'search', 1, now() - interval '61 minutes'),
  (:B, 'pixabay', 'search', 1, now() - interval '3 hours');
set session_replication_role = origin;
:ASA
select pg_temp.is('A: a search by stock_reserve', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
select pg_temp.chk('…purged A''s row over 2 hours, kept the 61-minute row and the new one',
  (select count(*) from public.stock_calls where user_id = :A) = 2 and not exists (select 1 from public.stock_calls where user_id = :A and at < now() - interval '2 hours'));
select pg_temp.chk('…B''s old row is untouched', exists (select 1 from public.stock_calls where user_id = :B and at < now() - interval '2 hours'));
