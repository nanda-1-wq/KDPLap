-- NicheInk · E16.1 · step E3 · who owns the rows written in the live check.
-- Read-only: one SELECT, one result table. Claude chat reads this file from the
-- owner's Mac and runs it on the live project itself (owner, Nov 18).
-- It changes nothing (no insert, update, delete or DDL).
--
-- Live window (E3, test account, Chrome headless from 127.0.0.1:5500, branch at 9fef68b):
--   2026-11-18 13:06:42Z to 13:11:03Z
-- Test user: id starts with 1e117c74. The owner's account must have no row here.
-- Expected (E3 as run, from the test user's own reads):
--   stock_calls 5 (3 Pixabay searches: the open + 2 scroll pages; 2 Pixabay picks: the
--   1st answered 503 stock_busy, the retry 200; purged 2 h after each call: from about
--   15:07Z they start to vanish), cover_assets 1 (pixabay "woman", a stored copy),
--   objects in bucket covers 1 (that copy), cover_designs 1 (a5224e83: autosave; the
--   design ends as it began, after Undo), cover_design_history 0 or more (a visit
--   snapshot), book_briefs 1 (a5224e83: topic set to "study habits" for the seed),
--   ai_usage 0, cover_my_layouts 0, cover_exports 0, books 0, sections 0,
--   section_versions 0, book_exports 0, positioning 0.
--
-- Columns: item, n (rows in the window), test_rows (rows of the test user),
-- other_rows (rows of anyone else: must be 0), detail.
with w as (select timestamptz '2026-11-18 13:06:42+00' as t0, timestamptz '2026-11-18 13:11:03+00' as t1)
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
select 'book_briefs (updated)', count(*)::text,
       count(*) filter (where user_id::text like '1e117c74%')::text,
       count(*) filter (where user_id::text not like '1e117c74%')::text,
       coalesce(string_agg(left(book_id::text, 8), ', '), '')
  from public.book_briefs, w where updated_at between w.t0 and w.t1
union all
select 'last migration', '1', '', '',
       (select version || ' ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 1);
