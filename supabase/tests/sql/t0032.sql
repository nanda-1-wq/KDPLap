-- 0032 E16.2: stock v2 limits and My layouts up to 5 per book.
-- stock_calls.released_at (cleared on insert) and the Unsplash index; stock_reserve (shape, exactly 3
-- arguments and none for a budget (B1), signed out, bad input, the per-user minute limits, a cache hit
-- counts as a search, the Unsplash per-user cap of 30 and the shared 45, rows older than the window);
-- stock_release (frees a minute slot, never Unsplash budget; refused for another user's row, an old row,
-- a row already released, the 6th in an hour); RLS; the v1 path (direct insert + stock_usage) still
-- works and counts; My layouts (5 kept, the 6th drops that book's oldest, a rename keeps its place, a
-- bulk insert, other books, null-book entries, pictures and files untouched (B5), the 100 cap with the
-- trim, B cannot trim A's); anon. The race proof is race_0032.sh.
-- Run: supabase/tests/sql/run.sh t0032.sql
\ir helpers.sql

\set A '''00000000-0000-4000-8000-00000000000a'''
\set B '''00000000-0000-4000-8000-00000000000b'''
\set C '''00000000-0000-4000-8000-00000000000c'''
\set ASA 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000a'';'
\set ASB 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000b'';'
\set ASC 'set role authenticated; set request.jwt.claim.sub = ''00000000-0000-4000-8000-00000000000c'';'
\set NOSUB 'set role authenticated; reset request.jwt.claim.sub;'
\set ANON 'reset request.jwt.claim.sub; set role anon;'
\set OWNER 'reset role; reset request.jwt.claim.sub;'
\set BOOK1 '''b0000000-0000-4000-8000-000000000001'''
\set BOOK2 '''b0000000-0000-4000-8000-000000000002'''
\set BOOK3 '''b0000000-0000-4000-8000-000000000003'''
\set BOOKB '''b0000000-0000-4000-8000-00000000000b'''

-- ── Seed (as the owner of the database: no RLS) ──
insert into auth.users values (:A), (:B), (:C);
insert into public.books (id, user_id, title) values
  (:BOOK1, :A, 'Chair Yoga for Seniors'), (:BOOK2, :A, 'Second Book'), (:BOOK3, :A, 'Book To Delete'), (:BOOKB, :B, 'B Book');
insert into public.book_briefs (book_id, user_id, trim_size) values (:BOOK1, :A, '6x9');
-- A's picture (in Uploads, with its file): the layouts below use it.
insert into public.cover_assets (id, user_id, source, mime, path, width, height, bytes, rights_at, name)
  values ('1a000000-0000-4000-8000-000000000001', :A, 'upload', 'image/jpeg',
          '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', 10, 10, 10, now(), 'leaf.jpg');
insert into storage.objects (bucket_id, name, owner)
  values ('covers', '00000000-0000-4000-8000-00000000000a/assets/1a000000-0000-4000-8000-000000000001.jpg', :A);

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
-- release_list: stock_release on each id in order; the answers joined.
create function pg_temp.release_list(ids bigint[]) returns text language plpgsql as $$
declare i bigint; out text[] := '{}';
begin
  foreach i in array ids loop out := out || public.stock_release(i)::text; end loop;
  return array_to_string(out, ',');
end $$;
-- fp: a fingerprint of a query's rows (run as the owner to see every row).
create function pg_temp.fp(q text) returns text language plpgsql as $$
declare r text;
begin
  execute format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from (%s) x', ',', 'none', q) into r;
  return r;
end $$;
-- lay: one My layouts export of a book, as the current user (one statement, so its own server time).
create function pg_temp.lay(p_id text, p_book text, p_name text) returns text language plpgsql as $$
begin
  return pg_temp.err(format($f$insert into public.cover_my_layouts (id, name, from_book_id, fmt, bg, layers)
    values (%L, %L, %L, '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF',
            '[{"id": 1, "type": "image", "asset": "1a000000-0000-4000-8000-000000000001"}]')$f$, p_id, p_name, p_book));
end $$;
-- book1: the ids of A's BOOK1 entries, newest first, as their last 2 hex digits ("L06,L05,...").
create function pg_temp.book1() returns text language sql as $$
  select string_agg('L' || right(m.id::text, 2), ',' order by m.exported_at desc, m.id desc)
    from public.cover_my_layouts m where m.from_book_id = 'b0000000-0000-4000-8000-000000000001' $$;
grant execute on all functions in schema pg_temp to public;

-- ── 1. Shape and grants ──
select pg_temp.chk('stock_calls.released_at: timestamptz, null allowed', (select data_type = 'timestamp with time zone' and is_nullable = 'YES'
  from information_schema.columns where table_schema = 'public' and table_name = 'stock_calls' and column_name = 'released_at'));
select pg_temp.chk('the Unsplash rows have a partial index on at', (select indexdef like '%(at) WHERE (source = ''unsplash''::text)'
  from pg_indexes where schemaname = 'public' and indexname = 'stock_calls_unsplash_at_idx'));
select pg_temp.chk(f || ': authenticated may run it; anon and PUBLIC may not',
  has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = f::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  from unnest(array['public.stock_reserve(text,text,smallint)', 'public.stock_release(bigint)']) f order by f;
select pg_temp.chk('stock_reserve and stock_release: definers, volatile, search_path empty',
  (select count(*) = 2 and bool_and(prosecdef and provolatile = 'v' and proconfig = array['search_path=""'])
     from pg_proc where pronamespace = 'public'::regnamespace and proname in ('stock_reserve', 'stock_release')));
select pg_temp.chk('(B1) stock_reserve: one function, exactly 3 arguments (source, action, provider calls), none for a limit or budget',
  (select count(*) = 1 and min(pronargs) = 3
     and min(array_to_string(proargnames, ',')) = 'p_source,p_action,p_provider_calls'
     and min(oid::regprocedure::text) = 'stock_reserve(text,text,smallint)'
     and not bool_or(array_to_string(proargnames, ',') ~* '(budget|limit|max|cap|hour)')
     from pg_proc where pronamespace = 'public'::regnamespace and proname = 'stock_reserve'));
select pg_temp.chk('stock_release: one function, one bigint argument',
  (select count(*) = 1 and min(oid::regprocedure::text) = 'stock_release(bigint)'
     from pg_proc where pronamespace = 'public'::regnamespace and proname = 'stock_release'));
select pg_temp.chk(g || ': still invoker; no one runs the trigger function', not has_function_privilege('authenticated', g, 'execute')
  and not has_function_privilege('anon', g, 'execute') and not (select prosecdef from pg_proc where oid = g::regprocedure))
  from unnest(array['public.cover_my_layouts_guard()', 'public.stock_calls_guard()']) g order by g;
select pg_temp.chk('stock v1 kept: stock_calls has its 2 own policies, stock_usage runs for authenticated (invoker), no update or delete',
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stock_calls') = 2
  and has_function_privilege('authenticated', 'public.stock_usage()', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.stock_usage()'::regprocedure)
  and not has_table_privilege('authenticated', 'public.stock_calls', 'update')
  and not has_table_privilege('authenticated', 'public.stock_calls', 'delete'));
select pg_temp.chk('cover_my_layouts: the one-per-book key is gone; the primary key is the only unique index',
  not exists (select 1 from pg_constraint where conname = 'cover_my_layouts_book_key')
  and (select array_agg(c.relname::text) from pg_index i join pg_class c on c.oid = i.indexrelid
        where i.indrelid = 'public.cover_my_layouts'::regclass and i.indisunique) = array['cover_my_layouts_pkey']);
select pg_temp.chk('cover_my_layouts: the book order index (user, book, newest export first)',
  (select indexdef like '%(user_id, from_book_id, exported_at DESC, id DESC)'
     from pg_indexes where schemaname = 'public' and indexname = 'cover_my_layouts_book_order_idx'));

-- ── 2. stock_reserve: who may call it, and with what ──
:ANON
select pg_temp.expect('anon cannot run stock_reserve', $q$select public.stock_reserve('pixabay', 'search', 1::smallint)$q$, '42501%');
select pg_temp.expect('anon cannot run stock_release', $q$select public.stock_release(1)$q$, '42501%');
:NOSUB
select pg_temp.expect('signed out (no user id): stock_reserve refused', $q$select public.stock_reserve('pixabay', 'search', 1::smallint)$q$, '42501 stock_reserve: sign in first%');
select pg_temp.expect('signed out (no user id): stock_release refused', $q$select public.stock_release(1)$q$, '42501 stock_release: sign in first%');
:ASA
select pg_temp.expect('an unknown source refused', $q$select public.stock_reserve('google', 'search', 1::smallint)$q$, '22023 stock_reserve: bad input%');
select pg_temp.expect('an unknown action refused', $q$select public.stock_reserve('pixabay', 'download', 1::smallint)$q$, '22023%');
select pg_temp.expect('a search with 2 calls refused', $q$select public.stock_reserve('unsplash', 'search', 2::smallint)$q$, '22023%');
select pg_temp.expect('a search with -1 calls refused', $q$select public.stock_reserve('unsplash', 'search', (-1)::smallint)$q$, '22023%');
select pg_temp.expect('a Pixabay pick with 2 calls refused', $q$select public.stock_reserve('pixabay', 'pick', 2::smallint)$q$, '22023%');
select pg_temp.expect('a Pixabay pick with 0 calls refused', $q$select public.stock_reserve('pixabay', 'pick', 0::smallint)$q$, '22023%');
select pg_temp.expect('an Unsplash pick with 1 call refused (it makes 2)', $q$select public.stock_reserve('unsplash', 'pick', 1::smallint)$q$, '22023%');
select pg_temp.expect('an Unsplash pick with 0 calls refused', $q$select public.stock_reserve('unsplash', 'pick', 0::smallint)$q$, '22023%');
select pg_temp.expect('a null source refused', $q$select public.stock_reserve(null, 'search', 1::smallint)$q$, '22023%');
select pg_temp.expect('a null action refused', $q$select public.stock_reserve('pixabay', null, 1::smallint)$q$, '22023%');
select pg_temp.expect('null calls refused', $q$select public.stock_reserve('pixabay', 'search', null::smallint)$q$, '22023%');
select pg_temp.expect('(B1) a direct call cannot raise the budget: a 4th argument is refused', $q$select public.stock_reserve('unsplash', 'search', 1::smallint, 1000)$q$, '42883%');
select pg_temp.expect('(B1) a named budget argument is refused', $q$select public.stock_reserve(p_source => 'unsplash', p_action => 'search', p_provider_calls => 1::smallint, p_budget => 1000)$q$, '42883%');
select pg_temp.expect('(B1) a user id argument is refused (the row is always the caller''s)', $q$select public.stock_reserve('pixabay', 'search', 1::smallint, '00000000-0000-4000-8000-00000000000b'::uuid)$q$, '42883%');
select pg_temp.chk('no refused call wrote a row', (select count(*) from public.stock_calls) = 0);

-- ── 3. The per-user minute limits ──
select public.stock_reserve('pixabay', 'search', 1::smallint) as r \gset s1_
select pg_temp.chk('a Pixabay search: {ok: true, id} with the row''s id, and nothing else in the answer',
  (:'s1_r'::jsonb ->> 'ok') = 'true' and (:'s1_r'::jsonb ->> 'id')::bigint = (select id from public.stock_calls)
  and (select array_agg(k order by k) from jsonb_object_keys(:'s1_r'::jsonb) k) = array['id', 'ok'], :'s1_r');
select pg_temp.chk('the row: A''s, server clock, pixabay search, 1 call, not released',
  (select user_id = :A and at > now() - interval '1 minute' and at <= now() and source = 'pixabay' and action = 'search'
          and provider_calls = 1 and released_at is null from public.stock_calls));
select pg_temp.is('29 more searches pass, the 31st is refused (rate_limited)', pg_temp.reserve_n(30, 'pixabay', 'search', 1), 'ok 29, rate_limited 1, stock_busy 0');
select pg_temp.chk('30 search rows; a refusal writes none', (select count(*) from public.stock_calls) = 30, (select count(*) from public.stock_calls)::text);
select r as refused from (select public.stock_reserve('unsplash', 'search', 0::smallint) r) x \gset
select pg_temp.chk('the refusal: {ok: false, code: rate_limited} (an Unsplash cache hit too: both sources share the limit)',
  :'refused'::jsonb = '{"ok": false, "code": "rate_limited"}'::jsonb, :'refused');
select pg_temp.is('picks are counted apart: 10 pass, the 11th is refused', pg_temp.reserve_n(11, 'pixabay', 'pick', 1), 'ok 10, rate_limited 1, stock_busy 0');
select pg_temp.is('…an Unsplash pick is refused too (10 picks a minute, both sources)', pg_temp.reserve_n(1, 'unsplash', 'pick', 2), 'ok 0, rate_limited 1, stock_busy 0');
:ASC
select pg_temp.is('C: 30 cache hits (0 calls) pass', pg_temp.reserve_n(30, 'unsplash', 'search', 0), 'ok 30, rate_limited 0, stock_busy 0');
select pg_temp.is('…a cache hit counts as a search: C''s 31st search is refused', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 0, rate_limited 1, stock_busy 0');
select pg_temp.chk('…and 30 cache hits used no Unsplash budget', (select coalesce(sum(provider_calls), 0) from public.stock_calls) = 0);
:ASB
select pg_temp.is('B is not limited by A''s or C''s rows', pg_temp.reserve_n(1, 'pixabay', 'pick', 1), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
update public.stock_calls set at = at - interval '61 seconds' where user_id = :A;
:ASA
select pg_temp.is('a minute later A searches again', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
select pg_temp.is('…and picks again', pg_temp.reserve_n(1, 'pixabay', 'pick', 1), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
delete from public.stock_calls;

-- ── 4. The Unsplash budget: 30 an hour per user, 45 for all users (B1) ──
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at)
  select :A, 'unsplash', 'pick', 2, now() - interval '10 minutes' from generate_series(1, 14);
set session_replication_role = origin;
:ASA
select pg_temp.is('A (28 Unsplash calls this hour) makes 2 more searches: 30', pg_temp.reserve_n(2, 'unsplash', 'search', 1), 'ok 2, rate_limited 0, stock_busy 0');
select r as refused from (select public.stock_reserve('unsplash', 'search', 1::smallint) r) x \gset
select pg_temp.chk('(B1) A reaches the per-user cap of 30 while the shared total is 30 of 45: {ok: false, code: stock_busy}',
  :'refused'::jsonb = '{"ok": false, "code": "stock_busy"}'::jsonb, :'refused');
select pg_temp.is('…an Unsplash pick too', pg_temp.reserve_n(1, 'unsplash', 'pick', 2), 'ok 0, rate_limited 0, stock_busy 1');
:OWNER
select pg_temp.chk('…the shared total is 30', (select sum(provider_calls) from public.stock_calls where source = 'unsplash') = 30);
:ASA
select pg_temp.is('A at the cap: an Unsplash cache hit still passes (no Unsplash call)', pg_temp.reserve_n(1, 'unsplash', 'search', 0), 'ok 1, rate_limited 0, stock_busy 0');
select pg_temp.is('A at the cap: a Pixabay search still passes', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at)
  select :B, 'unsplash', 'search', 1, now() - interval '10 minutes' from generate_series(1, 14);
set session_replication_role = origin;
:ASB
select pg_temp.is('A 30, B 14: B''s 2-call pick at 44 is refused (46 > 45, B''s own 16 is under 30)', pg_temp.reserve_n(1, 'unsplash', 'pick', 2), 'ok 0, rate_limited 0, stock_busy 1');
select pg_temp.is('A 30, B 14: B''s 1-call search is allowed (45)', pg_temp.reserve_n(1, 'unsplash', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
select pg_temp.is('…B''s next call is refused by the shared budget (B''s own 15 is under 30)', pg_temp.reserve_n(1, 'unsplash', 'search', 1), 'ok 0, rate_limited 0, stock_busy 1');
:OWNER
select pg_temp.chk('…B has 15, the total is 45', (select sum(provider_calls) from public.stock_calls where source = 'unsplash' and user_id = :B) = 15
  and (select sum(provider_calls) from public.stock_calls where source = 'unsplash') = 45);
:ASC
select pg_temp.is('the shared budget refuses C too, who made no Unsplash call', pg_temp.reserve_n(1, 'unsplash', 'search', 1), 'ok 0, rate_limited 0, stock_busy 1');
select pg_temp.is('…C''s Pixabay search passes', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
update public.stock_calls set at = at - interval '61 minutes' where source = 'unsplash';
:ASC
select pg_temp.is('an hour later the budget is back', pg_temp.reserve_n(1, 'unsplash', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
:ASA
select pg_temp.is('…for A too (calls over an hour old do not count)', pg_temp.reserve_n(1, 'unsplash', 'pick', 2), 'ok 1, rate_limited 0, stock_busy 0');
:OWNER
delete from public.stock_calls;

-- ── 5. stock_release ──
:ASA
select (public.stock_reserve('pixabay', 'pick', 1::smallint) ->> 'id')::bigint as id \gset p1_
select pg_temp.chk('A releases A''s fresh pick: true', public.stock_release(:p1_id));
select pg_temp.chk('…released_at is the server clock', (select released_at > now() - interval '1 minute' and released_at <= now() from public.stock_calls where id = :p1_id));
select pg_temp.chk('…a second release of the same row: false', not public.stock_release(:p1_id));
select pg_temp.chk('a null id: false', not public.stock_release(null));
select pg_temp.chk('an id that does not exist: false', not public.stock_release(999999999));
select pg_temp.is('a released pick frees its minute slot: 10 more picks pass, the 11th is refused', pg_temp.reserve_n(11, 'pixabay', 'pick', 1), 'ok 10, rate_limited 1, stock_busy 0');
:ASB
select pg_temp.chk('B (who sees none of A''s rows) cannot release A''s row: false', (select count(*) from public.stock_calls) = 0 and not public.stock_release(:p1_id + 1));
:OWNER
select pg_temp.chk('…A''s row stays counted', (select released_at is null from public.stock_calls where id = :p1_id + 1));
update public.stock_calls set at = now() - interval '3 minutes' where id = :p1_id + 2;
:ASA
select pg_temp.chk('a row older than 2 minutes: false', not public.stock_release(:p1_id + 2));
select pg_temp.is('the 6th release in an hour: false (A has 1; 4 more pass)',
  pg_temp.release_list(array[:p1_id + 3, :p1_id + 4, :p1_id + 5, :p1_id + 6, :p1_id + 7]), 'true,true,true,true,false');
select pg_temp.chk('…5 rows released in all', (select count(*) from public.stock_calls where released_at is not null) = 5);
select pg_temp.expect('A cannot set released_at by hand (no update right)', $q$update public.stock_calls set released_at = now()$q$, '42501%');
select pg_temp.expect('a hand insert with released_at set', $q$insert into public.stock_calls (source, action, provider_calls, released_at) values ('pixabay', 'search', 1, now() - interval '1 minute')$q$, 'OK 1');
select pg_temp.chk('…comes in counted (released_at cleared by the guard)', (select released_at is null from public.stock_calls order by id desc limit 1));
:OWNER
delete from public.stock_calls;
set session_replication_role = replica;
insert into public.stock_calls (user_id, source, action, provider_calls, at)
  select :A, 'unsplash', 'pick', 2, now() - interval '10 minutes' from generate_series(1, 14);
set session_replication_role = origin;
:ASA
select (public.stock_reserve('unsplash', 'pick', 2::smallint) ->> 'id')::bigint as id \gset u1_
select pg_temp.chk('A''s Unsplash pick at 28 passes (30) and is released', :u1_id is not null and public.stock_release(:u1_id));
select pg_temp.is('…the release gives no Unsplash budget back: the next Unsplash search is refused', pg_temp.reserve_n(1, 'unsplash', 'search', 1), 'ok 0, rate_limited 0, stock_busy 1');
select pg_temp.is('…but the minute slot is free: 10 picks pass (Pixabay)', pg_temp.reserve_n(10, 'pixabay', 'pick', 1), 'ok 10, rate_limited 0, stock_busy 0');
:OWNER
delete from public.stock_calls;

-- ── 6. RLS ──
:ASA
select (public.stock_reserve('pixabay', 'search', 1::smallint) ->> 'id')::bigint as id \gset a1_
:ASB
select (public.stock_reserve('pixabay', 'search', 1::smallint) ->> 'id')::bigint as id \gset b1_
select pg_temp.chk('B sees only B''s row', (select array_agg(id) from public.stock_calls) = array[:b1_id::bigint]);
select pg_temp.chk('B cannot release A''s row', not public.stock_release(:a1_id));
select pg_temp.expect('B cannot change A''s row', format('update public.stock_calls set released_at = now() where id = %s', :a1_id), '42501%');
:OWNER
select pg_temp.chk('every row is its caller''s; A''s row is not released', (select user_id from public.stock_calls where id = :a1_id) = :A
  and (select user_id from public.stock_calls where id = :b1_id) = :B and (select released_at is null from public.stock_calls where id = :a1_id));
delete from public.stock_calls;

-- ── 7. The stock v1 path still works, and its rows count for v2 ──
:ASA
select pg_temp.expect('v1: A logs a pick by a direct insert', $q$insert into public.stock_calls (source, action, provider_calls) values ('pixabay', 'pick', 1)$q$, 'OK 1');
select pg_temp.chk('v1: stock_usage counts it', public.stock_usage() = '{"searches": 0, "picks": 1, "unsplash_hour": 0}'::jsonb, public.stock_usage()::text);
select pg_temp.expect('v1: 9 more picks by direct insert', $q$insert into public.stock_calls (source, action, provider_calls) select 'pixabay', 'pick', 1 from generate_series(1, 9)$q$, 'OK 9');
select pg_temp.is('v1 rows count for stock_reserve (the deploy gap): the 11th pick is refused', pg_temp.reserve_n(1, 'pixabay', 'pick', 1), 'ok 0, rate_limited 1, stock_busy 0');
select pg_temp.is('v2: a search by stock_reserve', pg_temp.reserve_n(1, 'pixabay', 'search', 1), 'ok 1, rate_limited 0, stock_busy 0');
select pg_temp.chk('…v2 rows count for stock_usage (v1 reads them after a rollback)', public.stock_usage() = '{"searches": 1, "picks": 10, "unsplash_hour": 0}'::jsonb, public.stock_usage()::text);
:OWNER
delete from public.stock_calls;

-- ── 8. My layouts: the last 5 per book ──
:ASA
select pg_temp.is('A: a layout from BOOK2', pg_temp.lay('2c000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000002', 'Two'), 'OK 1');
select pg_temp.is('A: a layout from BOOK3', pg_temp.lay('2c000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000003', 'Three'), 'OK 1');
select pg_temp.expect('A deletes BOOK3: its entry stays with a null book', $q$delete from public.books where id = 'b0000000-0000-4000-8000-000000000003'$q$, 'OK 1');
:ASB
select pg_temp.is('B: a layout from BOOKB', pg_temp.lay('2c000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'B one'), 'OK 1');
:OWNER
select pg_temp.chk('the null-book entry is there', (select from_book_id is null from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000030'));
select pg_temp.fp($q$select * from public.cover_my_layouts where from_book_id is distinct from 'b0000000-0000-4000-8000-000000000001'$q$) as fp \gset others_
select pg_temp.fp('select * from public.cover_assets') as fp \gset assets_
select pg_temp.fp('select * from storage.objects') as fp \gset files_
:ASA
select pg_temp.is('export 1 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Yoga 1'), 'OK 1');
select pg_temp.is('export 2 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Yoga 2'), 'OK 1');
select pg_temp.is('export 3 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'Yoga 3'), 'OK 1');
select pg_temp.is('export 4 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'Yoga 4'), 'OK 1');
select pg_temp.is('export 5 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'Yoga 5'), 'OK 1');
select pg_temp.is('5 kept, newest first', pg_temp.book1(), 'L05,L04,L03,L02,L01');
select pg_temp.expect('the old front end''s upsert now fails (42P10, no unique key: the deploy gap, B3)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('Old', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')
  on conflict (user_id, from_book_id) do update set name = excluded.name$q$, '42P10%');
select pg_temp.is('export 6 of BOOK1', pg_temp.lay('2c000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'Yoga 6'), 'OK 1');
select pg_temp.is('…still 5: the oldest of BOOK1 went', pg_temp.book1(), 'L06,L05,L04,L03,L02');
:OWNER
select pg_temp.chk('…other books'' entries and the null-book entry are untouched (A''s and B''s)',
  pg_temp.fp($q$select * from public.cover_my_layouts where from_book_id is distinct from 'b0000000-0000-4000-8000-000000000001'$q$) = :'others_fp');
select pg_temp.chk('(B5) …the trim leaves every cover_assets row as it was', pg_temp.fp('select * from public.cover_assets') = :'assets_fp');
select pg_temp.chk('(B5) …and every storage.objects row', pg_temp.fp('select * from storage.objects') = :'files_fp');
select (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000002') as t \gset l2_
:ASA
select pg_temp.expect('rename the oldest entry (L02)', $q$update public.cover_my_layouts set name = 'Yoga renamed' where id = '2c000000-0000-4000-8000-000000000002'$q$, 'OK 1');
select pg_temp.chk('…the rename keeps its export time', (select exported_at from public.cover_my_layouts where id = '2c000000-0000-4000-8000-000000000002') = :'l2_t'::timestamptz);
select pg_temp.is('…and its place: export 7 drops the renamed L02 as the oldest', pg_temp.lay('2c000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'Yoga 7') || ' ' || pg_temp.book1(), 'OK 1 L07,L06,L05,L04,L03');
select pg_temp.expect('a write of the layout fields in place (the UPDATE branch, unchanged)', $q$update public.cover_my_layouts set layers = layers, bg = bg where id = '2c000000-0000-4000-8000-000000000003'$q$, 'OK 1');
select pg_temp.is('…is an export: L03 moves to the front', pg_temp.book1(), 'L03,L07,L06,L05,L04');
select pg_temp.is('export 8 drops L04, now the oldest', pg_temp.lay('2c000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'Yoga 8') || ' ' || pg_temp.book1(), 'OK 1 L08,L03,L07,L06,L05');
select pg_temp.expect('3 exports in one statement (a bulk insert: same server time)', $q$insert into public.cover_my_layouts (id, name, from_book_id, fmt, bg, layers) values
  ('2c000000-0000-4000-8000-000000000009', 'Yoga 9', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]'),
  ('2c000000-0000-4000-8000-000000000010', 'Yoga 10', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]'),
  ('2c000000-0000-4000-8000-000000000011', 'Yoga 11', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'OK 3');
select pg_temp.is('…each row trims before it: still 5, the 3 oldest went', pg_temp.book1(), 'L11,L10,L09,L08,L03');
select pg_temp.chk('cover_json lists the 5 of BOOK1 and the 2 others, newest export first',
  jsonb_array_length(public.cover_json(:BOOK1) -> 'my_layouts') = 7
  and (select string_agg(right(m ->> 'id', 2), ',' order by o) from jsonb_array_elements(public.cover_json(:BOOK1) -> 'my_layouts') with ordinality e(m, o) where o <= 5) = '11,10,09,08,03');
select pg_temp.expect('a layout without a book is still refused', $q$insert into public.cover_my_layouts (name, fmt, bg, layers) values ('X', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, 'P0001 my_layout_book%');
:OWNER
select pg_temp.chk('…other books, the null-book entry, pictures and files: still untouched',
  pg_temp.fp($q$select * from public.cover_my_layouts where from_book_id is distinct from 'b0000000-0000-4000-8000-000000000001'$q$) = :'others_fp'
  and pg_temp.fp('select * from public.cover_assets') = :'assets_fp' and pg_temp.fp('select * from storage.objects') = :'files_fp');

-- The 100 cap with the trim: A has 5 (BOOK1) + 1 (BOOK2) + 1 (null book); 93 more books with one entry each.
insert into public.books (id, user_id, title)
  select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, :A, 'Cap ' || n from generate_series(1, 94) n;
:ASA
select pg_temp.expect('93 more layouts in one statement (100 in all)', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers)
  select 'Cap', b.id, '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]' from public.books b where b.title like 'Cap %' and b.title <> 'Cap 94'$q$, 'OK 93');
select pg_temp.chk('A has 100 layouts', (select count(*) from public.cover_my_layouts) = 100, (select count(*) from public.cover_my_layouts)::text);
select pg_temp.is('at 100, an export of BOOK1 (5 there) passes: the trim makes room', pg_temp.lay('2c000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'Yoga 12'), 'OK 1');
select pg_temp.chk('…still 100, BOOK1 still 5', (select count(*) from public.cover_my_layouts) = 100 and pg_temp.book1() = 'L12,L11,L10,L09,L08', pg_temp.book1());
select pg_temp.is('at 100, a 2nd export of BOOK2 (1 there) is refused', pg_temp.lay('2c000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000002', 'Two again'), 'P0001 my_layouts_full%');
select pg_temp.is('at 100, a first export of a new book is refused', pg_temp.lay('2c000000-0000-4000-8000-000000000094', 'c0000000-0000-4000-8000-000000000094', 'New'), 'P0001 my_layouts_full%');
select pg_temp.expect('the × removes one', $q$delete from public.cover_my_layouts where from_book_id = 'c0000000-0000-4000-8000-000000000001'$q$, 'OK 1');
select pg_temp.is('then the 2nd export of BOOK2 fits (100)', pg_temp.lay('2c000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000002', 'Two again'), 'OK 1');
select pg_temp.chk('…BOOK2 keeps both entries', (select count(*) from public.cover_my_layouts where from_book_id = :BOOK2) = 2);
:OWNER
delete from public.cover_my_layouts where name = 'Cap' or id = '2c000000-0000-4000-8000-000000000021';
delete from public.books where title like 'Cap %';

-- B cannot trim A's entries.
select pg_temp.fp($q$select * from public.cover_my_layouts where user_id = '00000000-0000-4000-8000-00000000000a'$q$) as fp \gset a_
:ASB
select pg_temp.expect('B''s insert with A''s user id from A''s BOOK1 (5 there) is refused', $q$insert into public.cover_my_layouts (user_id, name, from_book_id, fmt, bg, layers) values ('00000000-0000-4000-8000-00000000000a', 'X', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.expect('B''s insert with A''s user id from B''s own book is refused', $q$insert into public.cover_my_layouts (user_id, name, from_book_id, fmt, bg, layers) values ('00000000-0000-4000-8000-00000000000a', 'X', 'b0000000-0000-4000-8000-00000000000b', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.is('B exports BOOKB 5 more times (6 in all)',
  pg_temp.lay('2c000000-0000-4000-8000-0000000000b2', 'b0000000-0000-4000-8000-00000000000b', 'B') || pg_temp.lay('2c000000-0000-4000-8000-0000000000b3', 'b0000000-0000-4000-8000-00000000000b', 'B')
  || pg_temp.lay('2c000000-0000-4000-8000-0000000000b4', 'b0000000-0000-4000-8000-00000000000b', 'B') || pg_temp.lay('2c000000-0000-4000-8000-0000000000b5', 'b0000000-0000-4000-8000-00000000000b', 'B')
  || pg_temp.lay('2c000000-0000-4000-8000-0000000000b6', 'b0000000-0000-4000-8000-00000000000b', 'B'), 'OK 1OK 1OK 1OK 1OK 1');
select pg_temp.chk('…B keeps 5 of BOOKB', (select count(*) from public.cover_my_layouts) = 5);
:OWNER
select pg_temp.chk('…and every one of A''s entries is as it was', pg_temp.fp($q$select * from public.cover_my_layouts where user_id = '00000000-0000-4000-8000-00000000000a'$q$) = :'a_fp');

-- ── 9. anon ──
:ANON
select pg_temp.expect('anon cannot save a layout', $q$insert into public.cover_my_layouts (name, from_book_id, fmt, bg, layers) values ('X', 'b0000000-0000-4000-8000-000000000001', '{"trim": "6x9", "pages": 54, "paper": "white"}', '#FFFFFF', '[]')$q$, '42501%');
select pg_temp.expect('anon reads no stock call', $q$select * from public.stock_calls$q$, 'OK 0');
