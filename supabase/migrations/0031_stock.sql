-- 0031_stock.sql
-- NicheInk · E16 · 09 Cover stock pictures (Pixabay and Unsplash). Plan:
-- docs/reviews/2026-11-13-e16-plan.md (§2 "Migration 0031_stock.sql", §7, row E16-7;
-- owner STOP 6, N9: cover_assets.name).
--
-- The Edge Function "stock" works with the caller's JWT only (no service-role
-- key), so everything it keeps is per user, under RLS (CLAUDE.md §4):
--
-- 1. cover_assets.name: the name a picture was added under (1 to 200
--    characters): the file name on upload, "<file> p.<n>" for a PDF page, the
--    provider's words on a stock pick. Rows that exist get a plain name by
--    source. When a caller sends no name (or only spaces), the guard fills
--    the same plain name; the app always sends one.
-- 2. stock_cache: one search answer per user and key (the sha256 of source,
--    query, filters and page), kept 24 hours (Pixabay's cache rule). The
--    function reads only rows younger than 24 hours; every write purges the
--    user's older rows and keeps at most 500.
-- 3. stock_calls: one row per stock request, for the rate limits (30 searches
--    and 10 picks a minute; the Unsplash hourly budget). Insert and select
--    own only: update and delete are revoked, so the browser cannot clear its
--    own limit. The time is the server clock. Rows older than 2 hours are
--    purged on insert by a definer trigger that touches only the caller's rows.
-- 4. stock_usage(): the caller's counts for the limits, on the database clock.
--
-- Limits are per user in v2 (one user). A shared counter comes with v3 users.

-- ---------------------------------------------------------------------------
-- 1. cover_assets.name
-- ---------------------------------------------------------------------------
alter table public.cover_assets add column name text;

update public.cover_assets
   set name = case source when 'pdf' then 'PDF page' when 'pixabay' then 'Pixabay picture'
                          when 'unsplash' then 'Unsplash photo' else 'Picture' end
 where name is null;

alter table public.cover_assets alter column name set not null;
alter table public.cover_assets add constraint cover_assets_name_check
  check (char_length(name) between 1 and 200 and name !~ '[[:cntrl:]]');

comment on column public.cover_assets.name is
  'E16 Part 7 (STOP 6, N9): the name the picture was added under, 1 to 200 characters, no control characters. Upload: the file name; PDF: "<file> p.<n>"; stock: the provider''s words. A missing or blank name becomes a plain word by source (cover_assets_guard).';

-- 0030's guard plus the name: trimmed; blank or missing gets the plain name.
create or replace function public.cover_assets_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- The rights tick and the time: the server clock.
  if new.rights_at is not null then new.rights_at := now(); end if;
  new.created_at := now();
  new.name := coalesce(nullif(btrim(new.name), ''),
    case new.source when 'pdf' then 'PDF page' when 'pixabay' then 'Pixabay picture'
                    when 'unsplash' then 'Unsplash photo' else 'Picture' end);
  return new;
end $$;

comment on function public.cover_assets_guard() is
  'Trigger (E16): rights_at (when ticked) and created_at take the server clock; name is trimmed, and a blank or missing name becomes a plain word by source (0031).';

revoke execute on function public.cover_assets_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. stock_cache (per user, 24 hours)
-- ---------------------------------------------------------------------------
create table public.stock_cache (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null,
  body        jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (user_id, key),
  -- sha256 hex of source, query, filters and page (stock/lib.ts cacheKey)
  constraint stock_cache_key_check check (key ~ '^[0-9a-f]{64}$'),
  -- one normalized answer: 24 results of short fields fit in a few KB
  constraint stock_cache_body_check check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 65536)
);

create index stock_cache_user_fetched_idx on public.stock_cache (user_id, fetched_at);

comment on table public.stock_cache is
  'E16 Part 7: a stock search answer per user and key, as the function normalized it. Rows older than 24 hours are ignored by the function and purged on the next write (Pixabay''s cache rule). Per user, so no service-role key is needed.';

alter table public.stock_cache enable row level security;

create policy "stock_cache_select_own" on public.stock_cache
  for select to authenticated using (user_id = (select auth.uid()));
create policy "stock_cache_insert_own" on public.stock_cache
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "stock_cache_update_own" on public.stock_cache
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "stock_cache_delete_own" on public.stock_cache
  for delete to authenticated using (user_id = (select auth.uid()));

-- anon has no policy, so RLS gives it nothing (as every table since 0001).
revoke truncate on public.stock_cache from anon, authenticated;

-- The time is the server clock; the owner and the key never change.
create or replace function public.stock_cache_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.key <> old.key) then
    raise exception 'stock_cache: user_id and key are fixed' using errcode = '23514';
  end if;
  new.fetched_at := now();
  return new;
end $$;

comment on function public.stock_cache_guard() is
  'Trigger (E16 Part 7): fetched_at takes the server clock; user_id and key are fixed on update.';

create trigger stock_cache_guard before insert or update on public.stock_cache
  for each row execute function public.stock_cache_guard();

-- After each write: drop the user's rows older than 24 hours, then keep the newest 500.
create or replace function public.stock_cache_purge()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.stock_cache c
   where c.user_id = new.user_id and c.fetched_at < now() - interval '24 hours';
  delete from public.stock_cache c
   where c.user_id = new.user_id
     and c.key in (select k.key from public.stock_cache k where k.user_id = new.user_id
                    order by k.fetched_at desc, k.key offset 500);
  return null;
end $$;

comment on function public.stock_cache_purge() is
  'Trigger (E16 Part 7): after a write, removes the same user''s rows older than 24 hours and keeps the newest 500.';

create trigger stock_cache_purge after insert or update on public.stock_cache
  for each row execute function public.stock_cache_purge();

revoke execute on function public.stock_cache_guard() from public, anon, authenticated;
revoke execute on function public.stock_cache_purge() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. stock_calls (per user, for the rate limits)
-- ---------------------------------------------------------------------------
create table public.stock_calls (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source          text not null,
  action          text not null,
  -- calls this request makes to the provider: 0 for a cache hit, 1 for a search or a
  -- Pixabay pick, 2 for an Unsplash pick (the photo, then the download ping)
  provider_calls  smallint not null,
  at              timestamptz not null default now(),
  constraint stock_calls_source_check check (source in ('pixabay', 'unsplash')),
  constraint stock_calls_action_check check (action in ('search', 'pick')),
  constraint stock_calls_provider_calls_check check (provider_calls between 0 and 2)
);

create index stock_calls_user_at_idx on public.stock_calls (user_id, at desc);

comment on table public.stock_calls is
  'E16 Part 7: one row per stock request (written before the provider is called), for the per-user limits. Insert and select own; update and delete revoked, so a user cannot clear a limit. at is the server clock. Rows older than 2 hours are purged on insert.';

alter table public.stock_calls enable row level security;

create policy "stock_calls_select_own" on public.stock_calls
  for select to authenticated using (user_id = (select auth.uid()));
create policy "stock_calls_insert_own" on public.stock_calls
  for insert to authenticated with check (user_id = (select auth.uid()));

-- anon has no policy, so RLS gives it nothing; no one may change or remove a call.
revoke update, delete, truncate on public.stock_calls from anon, authenticated;

create or replace function public.stock_calls_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.at := now();
  return new;
end $$;

comment on function public.stock_calls_guard() is
  'Trigger (E16 Part 7): at takes the server clock.';

create trigger stock_calls_guard before insert on public.stock_calls
  for each row execute function public.stock_calls_guard();

-- The caller has no delete right, so the purge runs as the table owner and
-- removes only the inserting user's rows older than 2 hours.
create or replace function public.stock_calls_purge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.stock_calls c
   where c.user_id = new.user_id and c.at < now() - interval '2 hours';
  return null;
end $$;

comment on function public.stock_calls_purge() is
  'Trigger (E16 Part 7, definer): after an insert, removes that user''s rows older than 2 hours. Touches no other user.';

create trigger stock_calls_purge after insert on public.stock_calls
  for each row execute function public.stock_calls_purge();

revoke execute on function public.stock_calls_guard() from public, anon, authenticated;
revoke execute on function public.stock_calls_purge() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. stock_usage(): the caller's counts, on the database clock
-- ---------------------------------------------------------------------------
create or replace function public.stock_usage()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'searches', count(*) filter (where c.action = 'search' and c.at > now() - interval '1 minute'),
    'picks', count(*) filter (where c.action = 'pick' and c.at > now() - interval '1 minute'),
    'unsplash_hour', coalesce(sum(c.provider_calls) filter (where c.source = 'unsplash' and c.at > now() - interval '1 hour'), 0))
  from public.stock_calls c
  where c.user_id = (select auth.uid()) and c.at > now() - interval '1 hour'
$$;

comment on function public.stock_usage() is
  'E16 Part 7: the caller''s stock requests (RLS own): searches and picks in the last minute, and Unsplash provider calls in the last hour. {searches, picks, unsplash_hour}.';

revoke execute on function public.stock_usage() from public, anon;
grant execute on function public.stock_usage() to authenticated;
