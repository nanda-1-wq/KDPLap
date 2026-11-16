-- 0031 F8 (E16 Part 7): the stock function's signed-in path works on the
-- grants 0031 writes itself, never on Supabase's default privileges.
-- run.sh builds this file's database without the default EXECUTE on new
-- functions for anon, authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- As A: read stock_usage, log a call, keep a cache answer (the triggers run),
-- add a named stock picture. As anon: stock_usage is refused.
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
select pg_temp.chk('F8 A reads stock_usage', public.stock_usage() = '{"searches": 0, "picks": 0, "unsplash_hour": 0}'::jsonb, public.stock_usage()::text);
select pg_temp.expect('F8 A logs a call (guard and purge triggers run)', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'pick', 2)$q$, 'OK 1');
select pg_temp.chk('F8 the call counts', public.stock_usage() = '{"searches": 0, "picks": 1, "unsplash_hour": 2}'::jsonb, public.stock_usage()::text);
select pg_temp.expect('F8 A keeps a cache answer (guard and purge triggers run)', format($q$insert into public.stock_cache (key, body) values (%L, '{"results": []}') on conflict (user_id, key) do update set body = excluded.body$q$, repeat('a', 64)), 'OK 1');
select pg_temp.expect('F8 A adds a named Pixabay picture (cover_assets_guard runs)', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, credit, name)
  values ('1a000000-0000-4000-8000-000000000001', 'pixabay', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', 1280, 853, 200000,
          '{"id": 1, "author": "Ann", "authorUrl": "https://pixabay.com/users/ann-1/", "pageUrl": "https://pixabay.com/photos/x-1/"}', 'green leaf')$q$, 'OK 1');
:ANON
select pg_temp.expect('F8 anon cannot run stock_usage', $q$select public.stock_usage()$q$, '42501%');
