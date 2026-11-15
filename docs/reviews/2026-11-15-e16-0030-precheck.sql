-- NicheInk · E16 Part 3 · pre-check before migration 0030 (owner Q-11).
-- Read-only: one SELECT, one result table. Claude chat runs it on the live
-- project BEFORE applying 0030, and the owner reads the numbers back.
-- It changes nothing (no insert, update, delete or DDL).
--
-- What 0030 drops: the tables book_covers and cover_images (and their rows).
-- What 0030 keeps: cover_exports rows (they read as "changed" until the next
-- export) and the files in bucket "covers" (SQL never deletes Storage files).
-- Expected (plan §2): test rows only. The E15 test folder was proved empty on Nov 12.
-- RESULT (Claude chat, Nov 15): NOT test rows. The owner's real account and real
-- book 919ca117 (E15 trial, Nov 12): book_covers 1 (template/stack), cover_images 1
-- (front/upload), cover_exports 1 (kindle), 1 file in bucket covers, cover_blurbs 0.
-- Owner: 0030 unchanged; the old photo file stays in the bucket (STOP 3 report §11).
--
-- Columns: item, n (count), users (distinct user ids), newest (latest time), detail.
select 'book_covers rows' as item, count(*)::text as n,
       coalesce(string_agg(distinct user_id::text, ', '), '') as users,
       coalesce(max(updated_at)::text, '') as newest,
       coalesce(string_agg(distinct mode || '/' || template, ', '), '') as detail
  from public.book_covers
union all
select 'cover_images rows', count(*)::text,
       coalesce(string_agg(distinct user_id::text, ', '), ''),
       coalesce(max(created_at)::text, ''),
       coalesce(string_agg(distinct kind || '/' || source, ', '), '')
  from public.cover_images
union all
select 'cover_exports rows', count(*)::text,
       coalesce(string_agg(distinct user_id::text, ', '), ''),
       coalesce(max(created_at)::text, ''),
       'print ' || count(*) filter (where kind = 'print') || ', kindle ' || count(*) filter (where kind = 'kindle')
  from public.cover_exports
union all
select 'objects in bucket covers', count(*)::text,
       coalesce(string_agg(distinct (storage.foldername(name))[1], ', '), ''),
       coalesce(max(created_at)::text, ''),
       coalesce(left(string_agg(name, ' | ' order by created_at), 2000), '')
  from storage.objects
 where bucket_id = 'covers'
union all
select 'cover_blurbs rows (kept by 0030)', count(*)::text,
       coalesce(string_agg(distinct user_id::text, ', '), ''),
       coalesce(max(created_at)::text, ''),
       ''
  from public.cover_blurbs
union all
select 'last migration', '1', '',
       (select version from supabase_migrations.schema_migrations order by version desc limit 1),
       (select coalesce(name, '') from supabase_migrations.schema_migrations order by version desc limit 1);
