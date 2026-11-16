-- 0031 stock pictures (E16 Part 7): cover_assets.name (fill, trim, plain
-- names by source, 200 cap, control characters, still no update, cover_json),
-- stock_cache (shape, server clock, fixed key, upsert, 24 h purge, 500 cap,
-- RLS both ways, anon), stock_calls (shape, server clock, no update or delete,
-- 2 h purge of the caller's rows only, RLS, anon), stock_usage (the counts
-- on the database clock, per user), the grants and the trigger functions.
-- Run: supabase/tests/sql/run.sh t0031.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set K1 '''1111111111111111111111111111111111111111111111111111111111111111'''
\set K2 '''2222222222222222222222222222222222222222222222222222222222222222'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B);
insert into public.pen_names (id, user_id, name) values ('e0000000-0000-4000-8000-000000000001', :A, 'Nora Hale');
insert into public.books (id, user_id, pen_name_id, title) values (:BOOK1, :A, 'e0000000-0000-4000-8000-000000000001', 'Chair Yoga for Seniors');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');

-- ── 1. Shape and grants ──
select pg_temp.chk('cover_assets.name is text, not null', (select data_type = 'text' and is_nullable = 'NO'
  from information_schema.columns where table_schema = 'public' and table_name = 'cover_assets' and column_name = 'name'));
select pg_temp.chk('RLS on stock_cache and stock_calls', (select bool_and(relrowsecurity) from pg_class
  where oid in ('public.stock_cache'::regclass, 'public.stock_calls'::regclass)));
select pg_temp.chk('stock_cache has 4 own policies, stock_calls 2', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stock_cache') = 4
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stock_calls') = 2);
select pg_temp.chk('no one can update, delete or truncate stock_calls', not has_table_privilege('anon', 'public.stock_calls', 'update')
  and not has_table_privilege('anon', 'public.stock_calls', 'delete') and not has_table_privilege('anon', 'public.stock_calls', 'truncate'));
select pg_temp.chk('authenticated cannot update or delete stock_calls', not has_table_privilege('authenticated', 'public.stock_calls', 'update')
  and not has_table_privilege('authenticated', 'public.stock_calls', 'delete') and not has_table_privilege('authenticated', 'public.stock_calls', 'truncate'));
select pg_temp.chk('no one can truncate stock_cache', not has_table_privilege('authenticated', 'public.stock_cache', 'truncate') and not has_table_privilege('anon', 'public.stock_cache', 'truncate'));
select pg_temp.chk('stock_usage: authenticated yes, anon no', has_function_privilege('authenticated', 'public.stock_usage()', 'execute')
  and not has_function_privilege('anon', 'public.stock_usage()', 'execute'));
select pg_temp.chk(g || ': no one runs the trigger function', not has_function_privilege('authenticated', g, 'execute') and not has_function_privilege('anon', g, 'execute'))
  from unnest(array['public.cover_assets_guard()', 'public.stock_cache_guard()', 'public.stock_cache_purge()', 'public.stock_calls_guard()', 'public.stock_calls_purge()']) g order by g;
select pg_temp.chk('only stock_calls_purge is a definer, and every new function has search_path empty',
  (select array_agg(proname::text order by proname) from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
     and proname in ('stock_cache_guard', 'stock_cache_purge', 'stock_calls_guard', 'stock_calls_purge', 'stock_usage', 'cover_assets_guard')) = array['stock_calls_purge']
  and (select bool_and(proconfig = array['search_path=""']) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('stock_cache_guard', 'stock_cache_purge', 'stock_calls_guard', 'stock_calls_purge', 'stock_usage', 'cover_assets_guard')));

-- ── 2. cover_assets.name ──
:ASA
select pg_temp.expect('an upload with its file name', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000001', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now(), '  desk-sunrise.jpg ')$q$, 'OK 1');
select pg_temp.chk('the name is trimmed', (select name = 'desk-sunrise.jpg' from public.cover_assets where id = '1a000000-0000-4000-8000-000000000001'));
select pg_temp.expect('an upload with no name', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at)
  values ('1a000000-0000-4000-8000-000000000002', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000002.jpg', 10, 10, 10, now())$q$, 'OK 1');
select pg_temp.expect('a PDF page with a blank name', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000003', 'pdf', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000003.jpg', 10, 10, 10, now(), '   ')$q$, 'OK 1');
select pg_temp.expect('a Pixabay copy with no name', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, credit)
  values ('1a000000-0000-4000-8000-000000000004', 'pixabay', 'image/png', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000004.png', 10, 10, 10,
          '{"id": 1, "author": "Ann", "authorUrl": "https://pixabay.com/users/ann-1/", "pageUrl": "https://pixabay.com/photos/x-1/"}')$q$, 'OK 1');
select pg_temp.expect('an Unsplash link with null name', $q$insert into public.cover_assets (id, source, mime, width, height, remote, credit, name)
  values ('1a000000-0000-4000-8000-000000000005', 'unsplash', 'image/jpeg', 10, 10, '{"url": "https://images.unsplash.com/photo-1?ixid=a"}',
          '{"id": "a", "author": "Bo", "authorUrl": "https://unsplash.com/@bo", "pageUrl": "https://unsplash.com/photos/a"}', null)$q$, 'OK 1');
select pg_temp.chk('plain names by source: Picture, PDF page, Pixabay picture, Unsplash photo',
  (select array_agg(name order by id) from public.cover_assets where id in ('1a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000003',
     '1a000000-0000-4000-8000-000000000004', '1a000000-0000-4000-8000-000000000005')) = array['Picture', 'PDF page', 'Pixabay picture', 'Unsplash photo'],
  (select string_agg(name, ', ' order by id) from public.cover_assets));
select pg_temp.expect('a name of 200 characters', format($q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000006', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000006.jpg', 10, 10, 10, now(), %L)$q$, repeat('é', 200)), 'OK 1');
select pg_temp.expect('a name of 201 characters refused', format($q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), %L)$q$, repeat('a', 201)), '23514%');
select pg_temp.expect('a name with a line break inside refused', $q$insert into public.cover_assets (id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000009', 'upload', 'image/jpeg', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000009.jpg', 10, 10, 10, now(), E'a\nb')$q$, '23514%');
select pg_temp.expect('the name cannot be changed (no update on cover_assets)', $q$update public.cover_assets set name = 'x' where id = '1a000000-0000-4000-8000-000000000001'$q$, '42501%');
select pg_temp.chk('the 0030 clocks still work (rights_at, created_at)', (select rights_at > now() - interval '1 minute' and created_at > now() - interval '1 minute'
  from public.cover_assets where id = '1a000000-0000-4000-8000-000000000001'));
:OWNER
insert into public.cover_designs (book_id, user_id, fmt, layers) values (:BOOK1, :A, '{"trim": "6x9", "pages": 54, "paper": "white"}',
  '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000001"}]');
:ASA
select pg_temp.chk('cover_json lists the name of a picture in use', (select public.cover_json(:BOOK1) -> 'assets' -> 0 ->> 'name') = 'desk-sunrise.jpg',
  (select (public.cover_json(:BOOK1) -> 'assets')::text));

-- ── 3. stock_cache ──
select pg_temp.expect('A keeps a search answer', format($q$insert into public.stock_cache (key, body, fetched_at) values (%L, '{"results": []}', '2001-01-01')$q$, :K1), 'OK 1');
select pg_temp.chk('fetched_at is the server clock, user A', (select fetched_at > now() - interval '1 minute' and user_id = :A from public.stock_cache where key = :K1));
select pg_temp.expect('a key that is not sha256 hex refused', $q$insert into public.stock_cache (key, body) values ('ABC', '{}')$q$, '23514%');
select pg_temp.expect('an upper-case hex key refused', format($q$insert into public.stock_cache (key, body) values (%L, '{}')$q$, repeat('A', 64)), '23514%');
select pg_temp.expect('a body that is not an object refused', format($q$insert into public.stock_cache (key, body) values (%L, '[]')$q$, :K2), '23514%');
select pg_temp.expect('a body over 64 KB refused', format($q$insert into public.stock_cache (key, body) values (%L, jsonb_build_object('x', repeat('a', 65536)))$q$, :K2), '23514%');
select pg_temp.expect('a body of exactly 65,536 bytes kept', format($q$insert into public.stock_cache (key, body) values (%L, jsonb_build_object('x', repeat('a', 65536 - 9)))$q$, :K2), 'OK 1');
select pg_temp.chk('the 65,536 body is 65,536 bytes as text', (select octet_length(body::text) = 65536 from public.stock_cache where key = :K2),
  (select octet_length(body::text)::text from public.stock_cache where key = :K2));
select pg_temp.expect('the function''s upsert replaces the answer', format($q$insert into public.stock_cache (key, body) values (%L, '{"results": [1]}') on conflict (user_id, key) do update set body = excluded.body$q$, :K1), 'OK 1');
select pg_temp.chk('one row for the key, the new body', (select count(*) = 1 and min(body::text) = '{"results": [1]}' from public.stock_cache where key = :K1));
select pg_temp.expect('the key cannot change', format($q$update public.stock_cache set key = %L where key = %L$q$, repeat('3', 64), :K1), '23514%');
:ASB
select pg_temp.chk('B sees none of A''s answers', (select count(*) from public.stock_cache) = 0);
select pg_temp.expect('B cannot add an answer as A', format($q$insert into public.stock_cache (user_id, key, body) values ('00000000-0000-4000-8000-00000000000a', %L, '{}')$q$, repeat('4', 64)), '42501%');
select pg_temp.expect('B cannot change A''s answer', format($q$update public.stock_cache set body = '{"x": 1}' where key = %L$q$, :K1), 'OK 0');
select pg_temp.expect('B cannot remove A''s answer', format($q$delete from public.stock_cache where key = %L$q$, :K1), 'OK 0');
select pg_temp.expect('B keeps its own answer under the same key', format($q$insert into public.stock_cache (key, body) values (%L, '{"b": 1}')$q$, :K1), 'OK 1');
:ANON
select pg_temp.expect('anon reads no stock_cache row', $q$select * from public.stock_cache$q$, 'OK 0');
select pg_temp.expect('anon cannot add a stock_cache row', format($q$insert into public.stock_cache (user_id, key, body) values ('00000000-0000-4000-8000-00000000000a', %L, '{}')$q$, repeat('9', 64)), '42501%');
:OWNER
select pg_temp.chk('A''s answer is unchanged by B', (select body::text = '{"results": [1]}' from public.stock_cache where user_id = :A and key = :K1));

-- 24 h purge: old rows put in by the owner with the triggers off.
set session_replication_role = replica;
insert into public.stock_cache (user_id, key, body, fetched_at) values
  (:A, repeat('5', 64), '{}', now() - interval '25 hours'),
  (:A, repeat('6', 64), '{}', now() - interval '23 hours'),
  (:B, repeat('5', 64), '{}', now() - interval '25 hours');
set session_replication_role = origin;
:ASA
select pg_temp.expect('A writes an answer', format($q$insert into public.stock_cache (key, body) values (%L, '{}')$q$, repeat('7', 64)), 'OK 1');
:OWNER
select pg_temp.chk('A''s row over 24 hours is purged, the 23-hour row stays', not exists (select 1 from public.stock_cache where user_id = :A and key = repeat('5', 64))
  and exists (select 1 from public.stock_cache where user_id = :A and key = repeat('6', 64)));
select pg_temp.chk('B''s old row is untouched by A''s write', exists (select 1 from public.stock_cache where user_id = :B and key = repeat('5', 64)));

-- 500 cap: 510 recent rows for A, then one write.
set session_replication_role = replica;
insert into public.stock_cache (user_id, key, body, fetched_at)
  select :A, encode(sha256(convert_to('k' || n, 'UTF8')), 'hex'), '{}', now() - make_interval(secs => n) from generate_series(1, 510) n;
set session_replication_role = origin;
:ASA
select pg_temp.expect('A writes one more answer', format($q$insert into public.stock_cache (key, body) values (%L, '{}')$q$, repeat('8', 64)), 'OK 1');
:OWNER
select pg_temp.chk('A keeps the newest 500', (select count(*) from public.stock_cache where user_id = :A) = 500,
  (select count(*)::text from public.stock_cache where user_id = :A));
select pg_temp.chk('the new answer is kept, the oldest went', exists (select 1 from public.stock_cache where user_id = :A and key = repeat('8', 64))
  and not exists (select 1 from public.stock_cache where user_id = :A and key = encode(sha256(convert_to('k510', 'UTF8')), 'hex')));
select pg_temp.chk('B keeps its rows (2)', (select count(*) from public.stock_cache where user_id = :B) = 2);

-- ── 4. stock_calls ──
:ASA
select pg_temp.expect('A logs a search', $q$insert into public.stock_calls (source, action, provider_calls, at) values ('pixabay', 'search', 1, '2001-01-01')$q$, 'OK 1');
select pg_temp.chk('at is the server clock, user A', (select bool_and(at > now() - interval '1 minute' and user_id = :A) from public.stock_calls));
select pg_temp.expect('an unknown source refused', $q$insert into public.stock_calls (source, action, provider_calls) values ('google', 'search', 1)$q$, '23514%');
select pg_temp.expect('an unknown action refused', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'download', 1)$q$, '23514%');
select pg_temp.expect('3 provider calls refused', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'pick', 3)$q$, '23514%');
select pg_temp.expect('a chosen id refused (generated always)', $q$insert into public.stock_calls (id, source, action, provider_calls) values (99, 'pixabay', 'search', 1)$q$, '428C9%');
select pg_temp.expect('A cannot change a call', $q$update public.stock_calls set at = now() - interval '1 day'$q$, '42501%');
select pg_temp.expect('A cannot remove a call', $q$delete from public.stock_calls$q$, '42501%');
:ASB
select pg_temp.chk('B sees none of A''s calls', (select count(*) from public.stock_calls) = 0);
select pg_temp.expect('B cannot log a call as A', $q$insert into public.stock_calls (user_id, source, action, provider_calls) values ('00000000-0000-4000-8000-00000000000a', 'pixabay', 'search', 1)$q$, '42501%');
:ANON
select pg_temp.expect('anon cannot log a call', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'search', 1)$q$, '42501%');
select pg_temp.expect('anon reads no call', $q$select * from public.stock_calls$q$, 'OK 0');

-- ── 5. stock_usage ──
:OWNER
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at) values
  (:A, 'pixabay', 'search', 0, now() - interval '20 seconds'),
  (:A, 'unsplash', 'search', 1, now() - interval '50 seconds'),
  (:A, 'pixabay', 'search', 1, now() - interval '2 minutes'),
  (:A, 'pixabay', 'pick', 1, now() - interval '10 seconds'),
  (:A, 'unsplash', 'pick', 2, now() - interval '30 minutes'),
  (:A, 'unsplash', 'search', 1, now() - interval '61 minutes'),
  (:A, 'unsplash', 'search', 1, now() - interval '3 hours'),
  (:B, 'unsplash', 'search', 1, now() - interval '3 hours'),
  (:B, 'unsplash', 'search', 1, now() - interval '10 seconds');
set session_replication_role = origin;
:ASA
-- in the last minute: the search logged above + 2 seeded searches; 1 pick. Unsplash in the hour: 1 + 2.
select pg_temp.chk('A: 3 searches and 1 pick a minute, 3 Unsplash calls an hour', public.stock_usage() = '{"searches": 3, "picks": 1, "unsplash_hour": 3}'::jsonb,
  public.stock_usage()::text);
:ASB
select pg_temp.chk('B counts only its own (1 Unsplash search)', public.stock_usage() = '{"searches": 1, "picks": 0, "unsplash_hour": 1}'::jsonb, public.stock_usage()::text);
select pg_temp.expect('B logs a call', $q$insert into public.stock_calls (source, action, provider_calls) values ('unsplash', 'search', 1)$q$, 'OK 1');
:OWNER
select pg_temp.chk('B''s insert purged B''s 3-hour-old call', (select count(*) from public.stock_calls where user_id = :B) = 2);
select pg_temp.chk('A''s 3-hour-old call is untouched by B''s insert', exists (select 1 from public.stock_calls where user_id = :A and at < now() - interval '2 hours'));
:ASA
select pg_temp.expect('A logs a call', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'pick', 1)$q$, 'OK 1');
:OWNER
select pg_temp.chk('A''s insert purged A''s call over 2 hours, the 61-minute call stays', not exists (select 1 from public.stock_calls where user_id = :A and at < now() - interval '2 hours')
  and exists (select 1 from public.stock_calls where user_id = :A and at < now() - interval '1 hour'));
:ASA
select pg_temp.chk('A: 2 picks in the minute now', (public.stock_usage() ->> 'picks')::int = 2, public.stock_usage()::text);
:ANON
select pg_temp.expect('anon cannot run stock_usage', $q$select public.stock_usage()$q$, '42501%');

-- ── 6. The user delete cascade ──
:OWNER
delete from auth.users where id = :B;
select pg_temp.chk('deleting B removes B''s cache and calls', not exists (select 1 from public.stock_cache where user_id = :B)
  and not exists (select 1 from public.stock_calls where user_id = :B));
