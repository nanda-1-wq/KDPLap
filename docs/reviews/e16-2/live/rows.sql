-- NicheInk · E16.2 Part 4 · live check rows (test account only).
-- Read-only: one SELECT, one result table. Claude chat reads this file from the owner's Mac
-- and runs it on the live project itself. It changes nothing (no insert, update, delete or DDL).
--
-- Live window (Chrome headless from 127.0.0.1:5500, main c0a0ce0, 0032, stock v2):
--   2026-11-20 14:59:00Z to 15:14:00Z
-- Test user: id starts with 1e117c74. The owner's account must have no row here (other_rows 0).
-- stock_calls rows are purged 2 h after each call: run this before about 16:59Z.
--
-- Expected (from the test user's own reads at 15:13:30Z):
--   stock_calls 4: 19 pixabay search 1 call (14:59:21Z); 20 pixabay pick 1 (14:59:24Z, not released);
--     21 pixabay pick 1 (15:02:44Z, released 15:02:46.8Z: the stock_busy pick); 22 pixabay search 0
--     (15:13:07Z, the curl stock_reserve check). Unsplash 0.
--   cover_assets 1 (pixabay "man", 1280 x 905, 71,266 bytes, 591e9490); objects in covers 1 (its copy).
--   cover_exports 15 (5 exports of a5224e83 x print, image, kindle).
--   cover_design_history 6 (1 visit, 5 export).
--   cover_my_layouts, all of the test user's rows now: a5224e83 4 (85045862, 89ed3e73, 117e3c56,
--     a0cfae01; bfce00e5 removed with x at 15:12:25Z; f8ec3e95 of Nov 18 trimmed by the 5th export),
--     e5209d67 1 (ea75f6e3, exported_at 2026-11-18 08:18:10.560665Z, unchanged).
--   ai_usage 0. Last migration 20261120144600.
with w as (select timestamptz '2026-11-20 14:59:00+00' as t0, timestamptz '2026-11-20 15:14:00+00' as t1)
select 'stock_calls (purged after 2 h)' as item, count(*)::text as n,
       count(*) filter (where user_id::text like '1e117c74%')::text as test_rows,
       count(*) filter (where user_id::text not like '1e117c74%')::text as other_rows,
       coalesce(string_agg(id || ' ' || source || ' ' || action || ' ' || provider_calls
         || ' ' || to_char(at at time zone 'UTC', 'HH24:MI:SS')
         || coalesce(' released ' || to_char(released_at at time zone 'UTC', 'HH24:MI:SS.MS'), ''), ', ' order by id), '') as detail
  from public.stock_calls, w where at between w.t0 and w.t1
union all
select 'cover_assets', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(id::text, 8) || ' ' || source || ' ' || width || 'x' || height || ' ' || coalesce(bytes::text, '-'), ', '), '')
  from public.cover_assets, w where created_at between w.t0 and w.t1
union all
select 'objects in bucket covers', count(*)::text,
       count(*) filter (where (storage.foldername(name))[1] like '1e117c74%')::text,
       count(*) filter (where (storage.foldername(name))[1] not like '1e117c74%')::text, ''
  from storage.objects, w where bucket_id = 'covers' and created_at between w.t0 and w.t1
union all
select 'cover_exports', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(distinct left(book_id::text, 8) || ' ' || kind, ', '), '')
  from public.cover_exports, w where created_at between w.t0 and w.t1
union all
select 'cover_design_history', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(reason, ', ' order by created_at), '')
  from public.cover_design_history, w where created_at between w.t0 and w.t1
union all
select 'cover_my_layouts (all of the test user''s rows now)', count(*)::text,
       count(*)::text, '-',
       coalesce(string_agg(left(from_book_id::text, 8) || ' ' || left(id::text, 8) || ' '
         || to_char(exported_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), ', ' order by from_book_id, exported_at desc, id desc), '')
  from public.cover_my_layouts where user_id::text like '1e117c74%'
union all
select 'cover_my_layouts (other users, written in the window)', count(*)::text, '-', count(*)::text, ''
  from public.cover_my_layouts, w where user_id::text not like '1e117c74%' and exported_at between w.t0 and w.t1
union all
select 'ai_usage', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.ai_usage, w where created_at between w.t0 and w.t1
union all
select 'last migration', '1', '', '',
       (select version || ' ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 1);
