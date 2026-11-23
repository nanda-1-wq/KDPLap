-- NicheInk · E16.3 Part 4 · live check rows (test account only), BEFORE 0033.
-- Read-only: one SELECT, one result table. Claude chat reads this file from the owner's Mac
-- and runs it on the live project itself. It changes nothing (no insert, update, delete or DDL).
--
-- Live window (Chrome headless from 127.0.0.1:5500, main 3842994, 0032, stock v3):
--   2026-11-23 17:09:00Z to 17:14:00Z
--   (browser opened 17:09:25Z, sign-in 17:09:3xZ, last read 17:12:12.7Z, browser closed 17:13:02Z)
-- Test user: id starts with 1e117c74. The owner's account must have no row here (other_rows 0).
--
-- stock_calls purge: a row older than 2 h is deleted on that user's NEXT stock_calls insert (0031, the
-- definer trigger). So rows 23 and 24 stay until the test user's next stock call after 19:12Z. The control
-- curl after 0033 (stock_reserve 'pixabay','search',0) is such an insert: run this file BEFORE that curl,
-- or before about 19:10Z, whichever comes first. (Today's search purged rows 19 to 22 of Nov 20, as designed.)
--
-- Expected (from the test user's own reads at 17:09:43Z and 17:12:12Z):
--   stock_calls 2: 23 pixabay search 1 call (17:10:21.442Z, not released);
--     24 pixabay pick 1 call (17:11:51.415Z, released 17:11:58.090Z: the stock_busy pick). Unsplash 0.
--   cover_assets 0 (the pick failed; nothing was stored). Objects in covers 0.
--   cover_exports 0 (no export). cover_design_history 0 (the design never changed, so no save and no
--     'visit' snapshot). cover_my_layouts written in the window 0.
--   ai_usage 0. Last migration still 20261120144600 (0032; 0033 is not applied yet).
with w as (select timestamptz '2026-11-23 17:09:00+00' as t0, timestamptz '2026-11-23 17:14:00+00' as t1)
select 'stock_calls (all sources)' as item, count(*)::text as n,
       count(*) filter (where user_id::text like '1e117c74%')::text as test_rows,
       count(*) filter (where user_id::text not like '1e117c74%')::text as other_rows,
       coalesce(string_agg(id || ' ' || source || ' ' || action || ' ' || provider_calls
         || ' ' || to_char(at at time zone 'UTC', 'HH24:MI:SS.MS')
         || coalesce(' released ' || to_char(released_at at time zone 'UTC', 'HH24:MI:SS.MS'), ''), ', ' order by id), '') as detail
  from public.stock_calls, w where at between w.t0 and w.t1
union all
select 'stock_calls unsplash (expect 0)', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.stock_calls, w where source = 'unsplash' and at between w.t0 and w.t1
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
select 'cover_my_layouts (written in the window)', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.cover_my_layouts, w where exported_at between w.t0 and w.t1
union all
select 'ai_usage', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.ai_usage, w where created_at between w.t0 and w.t1
union all
select 'last migration', '1', '', '',
       (select version || ' ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 1);
