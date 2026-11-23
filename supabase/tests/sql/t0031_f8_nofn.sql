-- 0031 F8 (E16 Part 7): the stock function's signed-in path works on the
-- grants 0031 writes itself, never on Supabase's default privileges.
-- run.sh builds this file's database without the default EXECUTE on new
-- functions for anon, authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- As A: log a call, keep a cache answer (the triggers run), add a named stock
-- picture. (0033) stock_usage is gone and A's direct insert is refused, so the
-- call goes through stock_reserve (0032's own grant) and A counts its own rows.
-- Run: supabase/tests/sql/run.sh t0031_f8_nofn.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'

select pg_temp.chk('no default function grants in public (KDP_PG_NO_FN_DEFAULTS)', not exists (
  select 1 from pg_default_acl d where d.defaclobjtype = 'f' and d.defaclnamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE')));

insert into auth.users values (:A);

:ASA
select pg_temp.expect('(0033) F8 stock_usage is gone', $q$select public.stock_usage()$q$, '42883%');
select pg_temp.expect('(0033) F8 A''s direct insert is refused', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'pick', 2)$q$, '42501 permission denied%');
select pg_temp.chk('(0033) F8 A logs a call through stock_reserve (guard and purge triggers run)', (public.stock_reserve('unsplash', 'pick', 2::smallint) ->> 'ok') = 'true');
select pg_temp.chk('F8 the call counts (A''s own rows: 1 pick, 2 Unsplash calls)', (select count(*) = 1 and sum(provider_calls) = 2 and bool_and(action = 'pick') from public.stock_calls));
select pg_temp.expect('F8 A keeps a cache answer (guard and purge triggers run)', format($q$insert into public.stock_cache (key, body) values (%L, '{"results": []}') on conflict (user_id, key) do update set body = excluded.body$q$, repeat('a', 64)), 'OK 1');
select pg_temp.expect('F8 A adds a named Pixabay picture (cover_assets_guard runs)', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, credit, name)
  values ('1a000000-0000-4000-8000-000000000001', 'pixabay', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', 1280, 853, 200000,
          '{"id": 1, "author": "Ann", "authorUrl": "https://pixabay.com/users/ann-1/", "pageUrl": "https://pixabay.com/photos/x-1/"}', 'green leaf')$q$, 'OK 1');
:ANON
select pg_temp.expect('(0033) F8 anon: stock_usage is gone', $q$select public.stock_usage()$q$, '42883%');
select pg_temp.expect('F8 anon cannot run stock_reserve', $q$select public.stock_reserve('pixabay', 'search', 1::smallint)$q$, '42501%');
