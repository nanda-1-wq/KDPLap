-- 0032 F8 (E16.2): stock v2's signed-in path and the My layouts trim work on the grants 0032 writes
-- itself, never on Supabase's default privileges. run.sh builds this file's database without the
-- default EXECUTE on new functions for anon, authenticated and service_role (KDP_PG_NO_FN_DEFAULTS=1).
-- As A: stock_reserve (ok, then the minute limit), stock_release, the guard clears released_at, a 6th
-- My layouts export trims the oldest (the guard runs). As anon: both functions refused.
-- Run: supabase/tests/sql/run.sh t0032_f8_nofn.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'

select pg_temp.chk('no default function grants in public (KDP_PG_NO_FN_DEFAULTS)', not exists (
  select 1 from pg_default_acl d where d.defaclobjtype = 'f' and d.defaclnamespace = 'public'::regnamespace
     and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee in ('anon'::regrole, 'authenticated'::regrole) and a.privilege_type = 'EXECUTE')));

insert into auth.users values (:A);
insert into public.books (id, user_id, title) values (:BOOK1, :A, 'Chair Yoga for Seniors');

:ASA
select public.stock_reserve('pixabay', 'pick', 1::smallint) as r \gset p1_
select pg_temp.chk('F8 A runs stock_reserve: ok, with the row id', (:'p1_r'::jsonb ->> 'ok') = 'true'
  and (:'p1_r'::jsonb ->> 'id')::bigint = (select id from public.stock_calls), :'p1_r');
select pg_temp.chk('F8 A runs stock_release on it: true', public.stock_release((:'p1_r'::jsonb ->> 'id')::bigint));
select pg_temp.chk('F8 10 more picks pass (the released one is free), the 11th is refused',
  (select count(*) filter (where (r ->> 'ok')::boolean) = 10 and count(*) filter (where r ->> 'code' = 'rate_limited') = 1
     from (select public.stock_reserve('pixabay', 'pick', 1::smallint) r from generate_series(1, 11)) x));
select pg_temp.expect('F8 a hand insert with released_at (guard runs)', $q$insert into public.stock_calls (source, action, provider_calls, released_at) values ('pixabay', 'search', 1, now())$q$, 'OK 1');
select pg_temp.chk('F8 …released_at cleared', (select released_at is null from public.stock_calls order by id desc limit 1));
select pg_temp.chk('F8 stock_usage still runs (v1)', (public.stock_usage() ->> 'picks')::int = 11, public.stock_usage()::text);

select pg_temp.expect('F8 export 1', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y1', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.expect('F8 export 2', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y2', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.expect('F8 export 3', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y3', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.expect('F8 export 4', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y4', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.expect('F8 export 5', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y5', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.expect('F8 export 6', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Y6', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 1');
select pg_temp.chk('F8 …5 kept, the oldest (Y1) went', (select string_agg(name, ',' order by exported_at desc, id desc) from public.cover_my_layouts) = 'Y6,Y5,Y4,Y3,Y2',
  (select string_agg(name, ',' order by exported_at desc, id desc) from public.cover_my_layouts));

:ANON
select pg_temp.expect('F8 anon cannot run stock_reserve', $q$select public.stock_reserve('pixabay', 'search', 1::smallint)$q$, '42501%');
select pg_temp.expect('F8 anon cannot run stock_release', $q$select public.stock_release(1)$q$, '42501%');
