-- NicheInk · E16 Part 11 · step A5 · who owns the rows written in the live check.
-- Read-only: one SELECT, one result table. Claude chat reads this file from the
-- owner's Mac and runs it on the live project itself (owner, Nov 18).
-- It changes nothing (no insert, update, delete or DDL).
--
-- Live window (step A, test account, Chrome headless from 127.0.0.1:5500):
--   2026-11-18 07:53:42Z to 08:18:27Z
-- Test user: id starts with 1e117c74. The owner's account must have no row here.
-- Expected (A as run, numbers from the test user's own reads):
--   cover_designs 2 (a5224e83, e5209d67), cover_design_history 2 or more
--   (visit and export snapshots), cover_assets 2 (1 pixabay copy, 1 unsplash link),
--   cover_my_layouts 1 or 2 (one per book, replaced), cover_exports 6 (3 per book),
--   ai_usage 2 (drift_check, cover_blurb), stock_calls 6 (purged 2 h after each call:
--   from about 10:02Z they start to vanish, so a lower count after that is expected),
--   objects in bucket covers 1 (the Pixabay copy), books 1 (e5209d67),
--   sections 31 and section_versions 32 (e5209d67), book_exports 1 (e5209d67, 120 pages),
--   positioning 1 (a5224e83, locked in the window).
--
-- Columns: item, n (rows in the window), test_rows (rows of the test user),
-- other_rows (rows of anyone else: must be 0), detail.
with w as (select timestamptz '2026-11-18 07:53:42+00' as t0, timestamptz '2026-11-18 08:18:27+00' as t1)
select 'cover_designs (created or updated)' as item, count(*)::text as n,
       count(*) filter (where user_id::text like '1e117c74%')::text as test_rows,
       count(*) filter (where user_id::text not like '1e117c74%')::text as other_rows,
       coalesce(string_agg(left(book_id::text, 8), ', '), '') as detail
  from public.cover_designs, w where greatest(created_at, updated_at) between w.t0 and w.t1
union all
select 'cover_design_history', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.cover_design_history, w where created_at between w.t0 and w.t1
union all
select 'cover_assets', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(source, ', '), '')
  from public.cover_assets, w where created_at between w.t0 and w.t1
union all
select 'cover_my_layouts', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.cover_my_layouts, w where created_at between w.t0 and w.t1
union all
select 'cover_exports', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(book_id::text, 8) || ' ' || kind, ', ' order by created_at), '')
  from public.cover_exports, w where created_at between w.t0 and w.t1
union all
select 'ai_usage', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(stage || ' ' || input_tokens || '/' || output_tokens, ', ' order by created_at), '')
  from public.ai_usage, w where created_at between w.t0 and w.t1
union all
select 'stock_calls (purged after 2 h)', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(source || ' ' || action, ', ' order by at), '')
  from public.stock_calls, w where at between w.t0 and w.t1
union all
select 'objects in bucket covers', count(*)::text,
       count(*) filter (where (storage.foldername(name))[1] like '1e117c74%')::text,
       count(*) filter (where (storage.foldername(name))[1] not like '1e117c74%')::text, ''
  from storage.objects, w where bucket_id = 'covers' and created_at between w.t0 and w.t1
union all
select 'books', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(id::text, 8), ', '), '')
  from public.books, w where created_at between w.t0 and w.t1
union all
select 'sections', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.sections, w where created_at between w.t0 and w.t1
union all
select 'section_versions', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text, ''
  from public.section_versions, w where created_at between w.t0 and w.t1
union all
select 'book_exports', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(book_id::text, 8) || ' ' || page_count, ', '), '')
  from public.book_exports, w where created_at between w.t0 and w.t1
union all
select 'positioning (locked in the window)', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(book_id::text, 8), ', '), '')
  from public.positioning, w where locked_at between w.t0 and w.t1
union all
select 'last migration', '1', '', '',
       (select version || ' ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 1);
