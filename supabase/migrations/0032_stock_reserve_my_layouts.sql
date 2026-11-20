-- 0032_stock_reserve_my_layouts.sql
-- NicheInk · E16.2 · stock v2 limits (atomic reserve and release) and My layouts up to 5 per book.
-- Plan: docs/reviews/2026-11-20-e16-2-plan.md (v2, approved Nov 20; Item 2 and Item 3, B1, B5).
--
-- 1. stock_calls.released_at: the time a failed request gave its minute slot back (null = not released).
--    The guard clears it on insert, so no one can insert a released row. stock v1 never writes it.
--    A partial index on the Unsplash rows serves the shared hourly sum.
--    The guard also applies the Unsplash per-user cap (30) and the shared budget (45) to every insert,
--    direct or through stock_reserve (STOP 2, fix A). It becomes a security definer for the shared sum.
-- 2. stock_reserve(source, action, provider_calls): checks the limits and writes the stock_calls row in
--    ONE transaction, under advisory locks, so parallel requests cannot all pass the last slot (the
--    E16 Part 11 race). Security definer: it reads every user's Unsplash rows for the shared budget.
--    It takes NO limit or budget input (B1): the limits are constants here, and a new number needs a
--    migration. The user can call it by hand with their own JWT; the worst they can do is fill their
--    own limits, and the per-user cap keeps 15 of the 45 shared Unsplash calls for everyone else.
--    That holds for a direct insert into stock_calls too, because the guard applies the same cap.
-- 3. stock_release(id): gives a minute slot back after a failed upstream call. Only the caller's own
--    row, not released yet, younger than 2 minutes, and at most 5 releases an hour. Unsplash budget is
--    never given back (Unsplash was really called).
-- 4. cover_my_layouts: up to 5 entries per book (owner choice B). The unique (user_id, from_book_id)
--    goes; the insert guard trims the book's oldest entries under a per-user advisory lock. Other
--    books, entries whose book was deleted (from_book_id null) and every file stay as they are (B5:
--    a layout owns no Storage file; its pictures are the user's cover_assets).
--
-- Unchanged for stock v1 (it keeps working on 0032): stock_usage(), the direct insert policy on
-- stock_calls, RLS on stock_calls and stock_cache, no update or delete grant to authenticated.
-- One change v1 can see: at 30 Unsplash calls an hour (or 45 for all users) its insert now fails
-- (P0001 stock_busy), and v1 answers 500, as it does for any call it cannot log (fail closed).
-- Open item B2: after stock v2 is live and checked, drop the direct insert policy and stock_usage()
-- (0033 or its own migration, on the owner's word).
-- After 0032 the old front end's My layouts upsert fails (42P10, no unique key); the front end goes
-- live right after (B3).

-- ---------------------------------------------------------------------------
-- 1. stock_calls.released_at
-- ---------------------------------------------------------------------------
alter table public.stock_calls add column released_at timestamptz;

comment on column public.stock_calls.released_at is
  'E16.2 (0032): when stock_release gave this request''s minute slot back after a failed upstream call (server clock). Null = counted. A released row still counts toward the Unsplash budget. Cleared on insert.';

comment on table public.stock_calls is
  'E16 Part 7, E16.2: one row per stock request (written before the provider is called), for the limits. stock v2 writes it through stock_reserve (atomic); stock v1 inserts it directly. Insert and select own; update and delete revoked, so a user cannot clear a limit. at is the server clock. Rows older than 2 hours are purged on insert.';

-- 0031's guard plus: no one inserts a released row, and every Unsplash row obeys the per-user cap and
-- the shared budget (STOP 2, fix A). stock_reserve checks first and answers {ok: false}; this is the
-- second wall for every path: stock v1's direct insert and stock_reserve's own insert. So a direct
-- insert can neither take a user past 30 nor push the shared total past 45.
-- Security definer: the shared total needs every user's rows, and RLS shows a direct insert only its
-- own. It is safe because a trigger function cannot be called on its own (0A000) and no one has
-- execute on it; it takes no input but the new row; search_path is empty; the limits are constants.
-- A row for another user is refused before any count (42501), so the error never tells one user
-- anything about another (RLS would refuse that row after this trigger anyway). Same locks, in the
-- same order, as stock_reserve (user, then Unsplash); inside stock_reserve they are already held.
-- Keep the two Unsplash constants in step with stock_reserve (t0032 checks both).
create or replace function public.stock_calls_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c_unsplash_hour_all     constant int := 45;
  c_unsplash_hour_user    constant int := 30;
  uid  uuid := auth.uid();
  n    int;
begin
  new.at := now();
  new.released_at := null;
  if uid is not null and new.user_id is distinct from uid then
    raise exception 'stock_calls: own rows only' using errcode = '42501';
  end if;
  if new.source = 'unsplash' and new.provider_calls > 0 and new.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('nicheink.stock.user:' || new.user_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('nicheink.stock.unsplash', 0));
    -- Released rows count (Unsplash was really called), as in stock_reserve.
    select coalesce(sum(c.provider_calls), 0) into n from public.stock_calls c
     where c.user_id = new.user_id and c.source = 'unsplash' and c.at > now() - interval '1 hour';
    if n + new.provider_calls > c_unsplash_hour_user then
      raise exception 'stock_busy' using errcode = 'P0001',
        detail = 'Unsplash: 30 calls an hour per user.';
    end if;
    select coalesce(sum(c.provider_calls), 0) into n from public.stock_calls c
     where c.source = 'unsplash' and c.at > now() - interval '1 hour';
    if n + new.provider_calls > c_unsplash_hour_all then
      raise exception 'stock_busy' using errcode = 'P0001',
        detail = 'Unsplash: 45 calls an hour for all users.';
    end if;
  end if;
  return new;
end $$;

comment on function public.stock_calls_guard() is
  'Trigger (E16 Part 7, 0032, definer): at takes the server clock; released_at starts null (only stock_release sets it); a signed-in caller inserts only their own row (42501); an Unsplash row with calls, under the per-user and the shared Unsplash advisory locks, is refused (P0001 "stock_busy") when it would take the user past 30 calls an hour or all users past 45 (released rows included). The second wall behind stock_reserve, for direct inserts too.';

revoke execute on function public.stock_calls_guard() from public, anon, authenticated;

create index stock_calls_unsplash_at_idx on public.stock_calls (at) where source = 'unsplash';

-- ---------------------------------------------------------------------------
-- 2. stock_reserve: check the limits and write the row, in one step
-- ---------------------------------------------------------------------------
-- Limits (constants, B1; a new number needs a migration):
--   30 searches per user per minute, 10 picks per user per minute (both sources together, as v1);
--   Unsplash: 45 provider calls an hour for all users together, 30 an hour per user.
-- Answers: {ok: true, id} | {ok: false, code: 'rate_limited'} | {ok: false, code: 'stock_busy'}.
create or replace function public.stock_reserve(p_source text, p_action text, p_provider_calls smallint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c_searches_per_minute   constant int := 30;
  c_picks_per_minute      constant int := 10;
  c_unsplash_hour_all     constant int := 45;
  c_unsplash_hour_user    constant int := 30;
  uid   uuid := auth.uid();
  n     int;
  lim   int;
  new_id bigint;
begin
  if uid is null then
    raise exception 'stock_reserve: sign in first' using errcode = '42501';
  end if;
  -- One provider call for a search (0 for a cache hit), 1 for a Pixabay pick, 2 for an Unsplash pick
  -- (the photo, then the download ping).
  if p_source is null or p_action is null or p_provider_calls is null
     or p_source not in ('pixabay', 'unsplash') or p_action not in ('search', 'pick')
     or (p_action = 'search' and p_provider_calls not in (0, 1))
     or (p_action = 'pick' and p_source = 'pixabay' and p_provider_calls <> 1)
     or (p_action = 'pick' and p_source = 'unsplash' and p_provider_calls <> 2) then
    raise exception 'stock_reserve: bad input' using errcode = '22023',
      detail = 'source pixabay or unsplash; action search (0 or 1 call) or pick (1 for pixabay, 2 for unsplash).';
  end if;

  -- One lock per user (the minute limits cover both sources), then, for an Unsplash call, the shared
  -- Unsplash lock. Always in this order, so two requests never wait on each other in a circle.
  -- Both end with the transaction, after the insert. Each statement below takes a new snapshot
  -- (volatile, read committed), so it sees the rows of a request that held the lock before.
  perform pg_advisory_xact_lock(hashtextextended('nicheink.stock.user:' || uid::text, 0));
  if p_source = 'unsplash' and p_provider_calls > 0 then
    perform pg_advisory_xact_lock(hashtextextended('nicheink.stock.unsplash', 0));
  end if;

  -- The minute limits: released rows do not count.
  select count(*) into n from public.stock_calls c
   where c.user_id = uid and c.action = p_action and c.released_at is null
     and c.at > now() - interval '1 minute';
  lim := case p_action when 'search' then c_searches_per_minute else c_picks_per_minute end;
  if n >= lim then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- The Unsplash budget: released rows count (Unsplash was really called).
  if p_source = 'unsplash' and p_provider_calls > 0 then
    select coalesce(sum(c.provider_calls), 0) into n from public.stock_calls c
     where c.user_id = uid and c.source = 'unsplash' and c.at > now() - interval '1 hour';
    if n + p_provider_calls > c_unsplash_hour_user then
      return jsonb_build_object('ok', false, 'code', 'stock_busy');
    end if;
    select coalesce(sum(c.provider_calls), 0) into n from public.stock_calls c
     where c.source = 'unsplash' and c.at > now() - interval '1 hour';
    if n + p_provider_calls > c_unsplash_hour_all then
      return jsonb_build_object('ok', false, 'code', 'stock_busy');
    end if;
  end if;

  insert into public.stock_calls (user_id, source, action, provider_calls)
  values (uid, p_source, p_action, p_provider_calls)
  returning id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

comment on function public.stock_reserve(text, text, smallint) is
  'E16.2 (0032, definer): checks the stock limits and writes the caller''s stock_calls row in one transaction, under a per-user advisory lock (and a shared Unsplash lock). Limits are constants: 30 searches and 10 picks per user a minute (released rows excluded); Unsplash 45 calls an hour for all users, 30 per user (released rows included). No limit input. {ok, id} or {ok: false, code: rate_limited | stock_busy}. 42501 signed out; 22023 bad input.';

revoke execute on function public.stock_reserve(text, text, smallint) from public, anon;
grant execute on function public.stock_reserve(text, text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. stock_release: give a minute slot back after a failed upstream call
-- ---------------------------------------------------------------------------
create or replace function public.stock_release(p_id bigint)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  c_release_window      constant interval := interval '2 minutes';
  c_releases_per_hour   constant int := 5;
  uid  uuid := auth.uid();
  n    int;
begin
  if uid is null then
    raise exception 'stock_release: sign in first' using errcode = '42501';
  end if;
  if p_id is null then return false; end if;
  -- The same per-user lock as stock_reserve, so the 5-an-hour count cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('nicheink.stock.user:' || uid::text, 0));
  select count(*) into n from public.stock_calls c
   where c.user_id = uid and c.released_at > now() - interval '1 hour';
  if n >= c_releases_per_hour then return false; end if;
  update public.stock_calls c set released_at = now()
   where c.id = p_id and c.user_id = uid and c.released_at is null
     and c.at > now() - c_release_window;
  return found;
end $$;

comment on function public.stock_release(bigint) is
  'E16.2 (0032, definer): marks one of the caller''s stock_calls rows released, so it no longer counts toward the minute limits. Only the caller''s own row, not released yet, younger than 2 minutes, and at most 5 releases an hour. Unsplash budget is never given back. true when released. 42501 signed out.';

revoke execute on function public.stock_release(bigint) from public, anon;
grant execute on function public.stock_release(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. cover_my_layouts: up to 5 per book
-- ---------------------------------------------------------------------------
alter table public.cover_my_layouts drop constraint cover_my_layouts_book_key;

create index cover_my_layouts_book_order_idx
  on public.cover_my_layouts (user_id, from_book_id, exported_at desc, id desc);

comment on table public.cover_my_layouts is
  'E16, E16.2 (0032): My layouts. A new entry on each cover export, the last 5 per book (the 6th drops that book''s oldest), at most 100 per user. The remove button deletes one. An entry whose book was deleted keeps from_book_id null and is never trimmed.';

-- 0030's guard with a new INSERT branch. The UPDATE branch is 0030's, unchanged.
-- Stays invoker: the user already has delete on their own rows, and RLS keeps the trim to them.
create or replace function public.cover_my_layouts_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  c_per_book   constant int := 5;
  c_per_user   constant int := 100;
begin
  if tg_op = 'INSERT' then
    if new.from_book_id is null then
      raise exception 'my_layout_book' using errcode = 'P0001',
        detail = 'A layout is saved from a book''s export.';
    end if;
    -- One export at a time per user: two tabs exporting the same book at once end with 5, not 6.
    perform pg_advisory_xact_lock(hashtextextended('nicheink.my_layouts:' || new.user_id::text, 0));
    -- 100 per user. A book that already has 5 makes room for its new entry (the trim below), so
    -- only an export of a book with fewer than 5 can be refused.
    if (select count(*) from public.cover_my_layouts m where m.user_id = new.user_id) >= c_per_user
       and (select count(*) from public.cover_my_layouts m
             where m.user_id = new.user_id and m.from_book_id = new.from_book_id) < c_per_book then
      raise exception 'my_layouts_full' using errcode = 'P0001',
        detail = 'You have 100 saved layouts. Remove one first.';
    end if;
    -- Keep this book's newest 4, so the new entry makes 5. Only this user's entries of this book:
    -- never another book, never a null book, never a file.
    delete from public.cover_my_layouts m
     where m.user_id = new.user_id and m.from_book_id = new.from_book_id
       and m.id in (select k.id from public.cover_my_layouts k
                     where k.user_id = new.user_id and k.from_book_id = new.from_book_id
                     order by k.exported_at desc, k.id desc
                     offset c_per_book - 1);
    new.exported_at := now();
    new.created_at := now();
    return new;
  end if;
  -- UPDATE: the owner stays; the book only goes (deleted book: set null).
  if new.user_id is distinct from old.user_id
     or (new.from_book_id is distinct from old.from_book_id and new.from_book_id is not null) then
    raise exception 'my_layout_fixed' using errcode = 'P0001',
      detail = 'A saved layout stays with its owner and its book.';
  end if;
  new.created_at := old.created_at;
  -- A rename or the book going to null keeps the export time; any other write is an export.
  if (new.layers, new.fmt, new.bg, new.thumb, new.from_title) is not distinct from (old.layers, old.fmt, old.bg, old.thumb, old.from_title)
     and (new.name is distinct from old.name or new.from_book_id is distinct from old.from_book_id) then
    new.exported_at := old.exported_at;
  else
    new.exported_at := now();
  end if;
  return new;
end $$;

comment on function public.cover_my_layouts_guard() is
  'Trigger (E16, 0032): an entry comes from a book (P0001 "my_layout_book"); on insert, under a per-user advisory lock, the book keeps its newest 4 so the new entry makes 5 (other books, null books and files untouched); at most 100 per user, refused only when the book has fewer than 5 (P0001 "my_layouts_full"); owner and book never change, the book may go to null (P0001 "my_layout_fixed"); exported_at is the server clock on every export write (a rename or the book going to null keeps it).';

revoke execute on function public.cover_my_layouts_guard() from public, anon, authenticated;
