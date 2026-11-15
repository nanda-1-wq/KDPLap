-- 0030_cover_layers.sql
-- NicheInk · E16 · 09 Cover free-layer editor (data). Plan: docs/reviews/2026-11-13-e16-plan.md
-- (§2 "Migration 0030", row E16-3; owner answers Q-3b, Q-5, Q-10, Q-11).
--
-- 0029 stored fixed template settings (book_covers) and per-book JPEG
-- pictures (cover_images). The new editor stores free layers, so:
--
-- 1. Shapes: cover_trim_ok now takes the 6 trims 09 draws (adds 8x10 and
--    8.5x11, the same strings as kdpCover.geo.TRIMS); cover_fmt_ok (the
--    {trim, pages, paper} a design is laid out for) and cover_layers_ok
--    (the layer caps: 200 layers, 524,288 bytes of layers::text, 2,000
--    characters a text, each layer an object with an id and a type).
--    cover_hex_ok, cover_recent_ok, cover_words, cover_paper and cover_pdf
--    are kept from 0029 unchanged.
-- 2. Drops (owner Q-11, after the pre-check query): the functions that read
--    the old tables (cover_marks, cover_json, cover_key(uuid, text),
--    cover_book_key), then book_covers, cover_images, their guard functions
--    and the old storage insert policy. Plain DROP, never CASCADE: anything
--    else that still used them would stop the migration.
-- 3. cover_designs: the one current design of a book (layers, bg, fmt,
--    layout, last_remap). rev counts saves: the trigger sets it, and an
--    autosave that names an old rev updates 0 rows (another tab saved).
-- 4. cover_design_history: the last 20 full snapshots per book (visit,
--    layout, remap, export). Read and add only.
-- 5. cover_assets: the user's pictures (per user, so My layouts carry them
--    across books): upload, pdf, pixabay or unsplash. Upload and pdf need
--    the rights tick (server clock). Unsplash is a hotlink, never a copy.
-- 6. cover_my_layouts: one saved layout per book, replaced on each export
--    (Q-3b), at most 100 per user.
-- 7. cover_fmt(book), cover_key(book).
-- 8. cover_exports: kind adds 'image' (its 300 DPI px must equal the wrap);
--    the guard reads cover_designs, checks the design is laid out for
--    today's size, the key, the rights of every picture in use and the 6 trims.
-- 9. cover_marks(book default null), cover_json(book).
-- 10. Storage: the "covers" bucket takes JPEG and PNG; uploads go to
--    <user id>/assets/<asset id>.jpg|png.
--
-- Old rows that stay: cover_blurbs (unchanged) and cover_exports. An old
-- cover_exports row keeps its 0029 snapshot and key; no design key equals
-- it, so it reads as "changed" until the next export.
-- Files in the bucket under the old <user>/<book>/<id>.jpg paths are not
-- touched by SQL; the owner can still read and delete them (select and
-- delete policies on the own folder are kept).

-- ---------------------------------------------------------------------------
-- 1. Shapes
-- ---------------------------------------------------------------------------
-- The 6 trims 09 draws, the same strings as kdpCover.geo.TRIMS (limits-parity test).
-- 08 still makes a Print PDF for group A only (E13.2b adds the two wide trims there).
create or replace function public.cover_trim_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p in ('5x8', '5.25x8', '5.5x8.5', '6x9', '8x10', '8.5x11'), false)
$$;

comment on function public.cover_trim_ok(text) is
  'E16: a trim 09 draws (5x8, 5.25x8, 5.5x8.5, 6x9, 8x10, 8.5x11; kdpCover.geo.TRIMS). Null and every other value are false.';

-- A size a design is laid out for: exactly {trim, pages, paper} (kdpCover.geo.normalizeFmt).
create or replace function public.cover_fmt_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  -- case: the object and number tests run before the calls that throw on other types
  select case when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'pages') = 'number' then
    (select count(*) from jsonb_object_keys(p)) = 3
    and public.cover_trim_ok(p ->> 'trim')
    and (p ->> 'pages')::numeric between 1 and 828
    and (p ->> 'pages')::numeric = trunc((p ->> 'pages')::numeric)
    and coalesce(p ->> 'paper' in ('white', 'cream'), false)
  else false end
$$;

comment on function public.cover_fmt_ok(jsonb) is
  'E16: a cover size {trim, pages, paper}: a 09 trim, whole pages 1 to 828, white or cream, no other keys. Null is false.';

-- The layer caps (kdpCover.model.CAPS and fits): an array of at most 200
-- objects, each with an id (number or string) and a type; a text layer's
-- text at most 2,000 characters; layers::text at most 524,288 bytes.
-- The byte measure is the jsonb text form ("a": 1, b), which
-- kdpCover.model.pgBytes counts the same way in the browser.
create or replace function public.cover_layers_ok(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  -- case: the array test runs before the calls that throw on other types
  select case when jsonb_typeof(p) = 'array' then
    jsonb_array_length(p) <= 200
    and octet_length(p::text) <= 524288
    and not exists (
      select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(jsonb_typeof(e -> 'id'), '') not in ('number', 'string')
          or coalesce(e ->> 'type', '') not in ('text', 'image', 'shape')
          or (e ->> 'type' = 'text' and char_length(coalesce(e ->> 'text', '')) > 2000))
  else false end
$$;

comment on function public.cover_layers_ok(jsonb) is
  'E16: cover layers: an array of at most 200 objects with an id (number or string) and a type (text, image, shape); text at most 2,000 characters; layers::text at most 524,288 bytes. Null is false.';

-- ---------------------------------------------------------------------------
-- 2. Drops (owner Q-11). The pre-check query ran first (STOP 3 report).
-- ---------------------------------------------------------------------------
-- The functions that read the old tables (their bodies are not tracked as dependencies).
drop function public.cover_marks(uuid);
drop function public.cover_json(uuid);
drop function public.cover_key(uuid, text);
drop function public.cover_book_key(uuid);
-- book_covers first: it points at cover_images.
drop table public.book_covers;
drop function public.book_covers_guard();
drop table public.cover_images;
drop function public.cover_images_guard();
-- The old upload rule (<user>/<book>/<id>.jpg). Select and delete on the own folder stay.
drop policy "covers_insert_own" on storage.objects;

-- ---------------------------------------------------------------------------
-- 3. cover_designs
-- ---------------------------------------------------------------------------
create table public.cover_designs (
  book_id     uuid primary key references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  layers      jsonb not null default '[]',
  bg          text not null default '#FFFFFF',
  fmt         jsonb not null,
  layout      text,
  last_remap  jsonb,
  rev         int not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cover_designs_layers_check check (public.cover_layers_ok(layers)),
  constraint cover_designs_bg_check check (public.cover_hex_ok(bg)),
  constraint cover_designs_fmt_check check (public.cover_fmt_ok(fmt)),
  -- a ready layout key (kdpCover.layouts.KEYS) or a My layout ("my:<id>")
  constraint cover_designs_layout_check check (layout is null
    or layout in ('blank', 'band', 'center', 'stack', 'corner', 'picfull', 'picband', 'framed', 'arch', 'circle', 'stripes', 'ribbon', 'bold')
    or layout ~ '^my:[A-Za-z0-9_-]{1,64}$'),
  -- the size note: {from, to, moved[], spineFrom, spineTo, at, seen}
  constraint cover_designs_remap_check check (last_remap is null or case when jsonb_typeof(last_remap -> 'moved') = 'array'
    then public.cover_fmt_ok(last_remap -> 'from') and public.cover_fmt_ok(last_remap -> 'to')
         and jsonb_array_length(last_remap -> 'moved') <= 200 and octet_length(last_remap::text) <= 16384
    else false end),
  constraint cover_designs_rev_check check (rev >= 1)
);

create index cover_designs_user_id_idx on public.cover_designs (user_id);

comment on table public.cover_designs is
  'E16: the 09 Cover design of a book, one row: layers (the editor model), bg, the fmt they are laid out for, the layout applied, the last size remap. rev counts saves. Plan docs/reviews/2026-11-13-e16-plan.md §2.';
comment on column public.cover_designs.rev is
  'Set by the trigger: 1 on insert, old + 1 on every update. Autosave updates "where rev = <the rev it read>"; 0 rows means another tab saved first.';
comment on column public.cover_designs.fmt is
  '{trim, pages, paper} the layers are laid out for. 09 compares it with cover_fmt(book) on open and remaps when they differ.';
comment on column public.cover_designs.last_remap is
  'The size note: {from, to, moved[], spineFrom, spineTo, at, seen}. Null when no remap is pending.';

create trigger cover_designs_set_updated_at before update on public.cover_designs
  for each row execute function public.set_updated_at();

alter table public.cover_designs enable row level security;

create policy "cover_designs_select_own" on public.cover_designs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_designs_insert_own" on public.cover_designs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "cover_designs_update_own" on public.cover_designs
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));

-- The row goes with its book (cascade), never by hand.
revoke delete, truncate on public.cover_designs from anon, authenticated;

create or replace function public.cover_designs_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_op = 'UPDATE' and (new.book_id is distinct from old.book_id or new.user_id is distinct from old.user_id) then
    raise exception 'cover_fixed' using errcode = 'P0001',
      detail = 'A cover design stays with its book and its owner.';
  end if;
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.created_at := now();
  else
    new.rev := old.rev + 1;
    new.created_at := old.created_at;
  end if;
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;   -- the foreign key or the policy refuses it
  end if;
  if v_owner <> new.user_id then
    raise exception 'cover_owner' using errcode = 'P0001',
      detail = 'A cover design belongs to the owner of its book.';
  end if;
  return new;
end $$;

comment on function public.cover_designs_guard() is
  'Trigger (E16): book_id and user_id never change (P0001 "cover_fixed"); rev is 1 on insert and old + 1 on each update; created_at is the server clock; user_id is the book''s owner (P0001 "cover_owner").';

create trigger cover_designs_guard before insert or update on public.cover_designs
  for each row execute function public.cover_designs_guard();

revoke execute on function public.cover_designs_guard() from public, anon, authenticated;

-- A cover edit moves the book to the top of Books (0009). Not on insert:
-- the row is made when 09 first opens, which is not an edit.
create trigger cover_designs_touch_book after update on public.cover_designs
  for each row execute function public.touch_book_from_child();

-- ---------------------------------------------------------------------------
-- 4. cover_design_history (owner Q-5: the current row + 20 snapshots)
-- ---------------------------------------------------------------------------
create table public.cover_design_history (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text not null,
  layers      jsonb not null,
  bg          text not null,
  fmt         jsonb not null,
  layout      text,
  created_at  timestamptz not null default now(),
  constraint cover_design_history_reason_check check (reason in ('visit', 'layout', 'remap', 'export')),
  constraint cover_design_history_layers_check check (public.cover_layers_ok(layers)),
  constraint cover_design_history_bg_check check (public.cover_hex_ok(bg)),
  constraint cover_design_history_fmt_check check (public.cover_fmt_ok(fmt)),
  constraint cover_design_history_layout_check check (layout is null
    or layout in ('blank', 'band', 'center', 'stack', 'corner', 'picfull', 'picband', 'framed', 'arch', 'circle', 'stripes', 'ribbon', 'bold')
    or layout ~ '^my:[A-Za-z0-9_-]{1,64}$')
);

create index cover_design_history_book_created_idx on public.cover_design_history (book_id, created_at desc, id desc);
create index cover_design_history_user_id_idx on public.cover_design_history (user_id);

comment on table public.cover_design_history is
  'E16: full snapshots of a cover design at visit start, layout apply, size remap and export. The newest 20 are kept per book. Read and add only.';

alter table public.cover_design_history enable row level security;

create policy "cover_design_history_select_own" on public.cover_design_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_design_history_insert_own" on public.cover_design_history
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));

revoke update, delete, truncate on public.cover_design_history from anon, authenticated;

-- SECURITY DEFINER: it removes the oldest snapshots past 20, which the writer cannot.
create or replace function public.cover_design_history_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  if v_owner <> new.user_id then
    raise exception 'cover_owner' using errcode = 'P0001',
      detail = 'A cover snapshot belongs to the owner of its book.';
  end if;
  new.created_at := now();
  delete from public.cover_design_history x
   where x.book_id = new.book_id
     and x.id not in (select y.id from public.cover_design_history y where y.book_id = new.book_id
                       order by y.created_at desc, y.id desc limit 19);
  return new;
end $$;

comment on function public.cover_design_history_guard() is
  'Trigger (E16): user_id is the book''s owner (P0001 "cover_owner"); created_at is the server clock; keeps the newest 19 older snapshots, so a book has at most 20.';

create trigger cover_design_history_guard before insert on public.cover_design_history
  for each row execute function public.cover_design_history_guard();

revoke execute on function public.cover_design_history_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. cover_assets (per user)
-- ---------------------------------------------------------------------------
create table public.cover_assets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source          text not null,
  mime            text not null,
  path            text,
  remote          jsonb,
  width           int not null,
  height          int not null,
  bytes           int,
  transparent     boolean not null default false,
  rights_at       timestamptz,
  credit          jsonb,
  origin_book_id  uuid references public.books (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint cover_assets_source_check check (source in ('upload', 'pdf', 'pixabay', 'unsplash')),
  constraint cover_assets_mime_check check (mime in ('image/jpeg', 'image/png')),
  -- A copy in the bucket at <user id>/assets/<id>.jpg|png, except Unsplash (a hotlink, never a copy).
  -- (coalesce: a null in a check passes, so each branch says false itself)
  constraint cover_assets_path_check check (case when source = 'unsplash' then path is null
    else coalesce(path = user_id::text || '/assets/' || id::text || case mime when 'image/png' then '.png' else '.jpg' end, false) end),
  -- Unsplash: the raw hotlink URL (images.unsplash.com); the others have none.
  constraint cover_assets_remote_check check (case when source = 'unsplash'
    then coalesce(jsonb_typeof(remote) = 'object' and remote ->> 'url' ~ '^https://images\.unsplash\.com/' and octet_length(remote::text) <= 2000, false)
    else remote is null end),
  constraint cover_assets_px_check check (width between 1 and 12000 and height between 1 and 12000),
  -- The bucket's file size limit. Unsplash has no copy, so no size.
  constraint cover_assets_bytes_check check (case when source = 'unsplash' then bytes is null else coalesce(bytes between 1 and 10485760, false) end),
  constraint cover_assets_transparent_check check (not transparent or mime = 'image/png'),
  -- "I have the rights to use this image" comes first for an upload or a PDF page.
  constraint cover_assets_rights_check check (source not in ('upload', 'pdf') or rights_at is not null),
  -- Stock credit: provider id, author, author link, page link.
  constraint cover_assets_credit_check check (case when source in ('pixabay', 'unsplash')
    then coalesce(jsonb_typeof(credit) = 'object' and jsonb_typeof(credit -> 'id') in ('string', 'number')
         and jsonb_typeof(credit -> 'author') = 'string' and jsonb_typeof(credit -> 'authorUrl') = 'string'
         and jsonb_typeof(credit -> 'pageUrl') = 'string' and octet_length(credit::text) <= 2000, false)
    else credit is null end)
);

create index cover_assets_user_created_idx on public.cover_assets (user_id, created_at desc);
create index cover_assets_origin_book_idx on public.cover_assets (origin_book_id);

comment on table public.cover_assets is
  'E16: the user''s cover pictures (Uploads), per user so My layouts carry them across books. upload and pdf: a copy in the bucket "covers" and the rights tick. pixabay: a copy and the credit. unsplash: a hotlink (remote) and the credit, no copy. No update: delete the row, then the file through the Storage API.';
comment on column public.cover_assets.rights_at is
  'When the writer ticked "I have the rights to use this image" (server clock). Required for upload and pdf.';
comment on column public.cover_assets.origin_book_id is
  'The book the picture was first added in (null when that book is deleted).';

alter table public.cover_assets enable row level security;

create policy "cover_assets_select_own" on public.cover_assets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_assets_insert_own" on public.cover_assets
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (origin_book_id is null
         or exists (select 1 from public.books b where b.id = origin_book_id and b.user_id = (select auth.uid()))));
create policy "cover_assets_delete_own" on public.cover_assets
  for delete to authenticated using (user_id = (select auth.uid()));

revoke update, truncate on public.cover_assets from anon, authenticated;

create or replace function public.cover_assets_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- The rights tick and the time: the server clock.
  if new.rights_at is not null then new.rights_at := now(); end if;
  new.created_at := now();
  return new;
end $$;

comment on function public.cover_assets_guard() is
  'Trigger (E16): rights_at (when ticked) and created_at take the server clock.';

create trigger cover_assets_guard before insert on public.cover_assets
  for each row execute function public.cover_assets_guard();

revoke execute on function public.cover_assets_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. cover_my_layouts (Q-3: saved on export; Q-3b: one per book, replaced)
-- ---------------------------------------------------------------------------
create table public.cover_my_layouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  from_book_id  uuid references public.books (id) on delete set null,
  from_title    text,
  fmt           jsonb not null,
  bg            text not null,
  layers        jsonb not null,
  thumb         text,
  exported_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint cover_my_layouts_name_check check (char_length(name) between 1 and 80 and name = btrim(name)),
  constraint cover_my_layouts_from_title_check check (from_title is null or char_length(from_title) between 1 and 200),
  constraint cover_my_layouts_fmt_check check (public.cover_fmt_ok(fmt)),
  constraint cover_my_layouts_bg_check check (public.cover_hex_ok(bg)),
  constraint cover_my_layouts_layers_check check (public.cover_layers_ok(layers)),
  constraint cover_my_layouts_thumb_check check (thumb is null or (char_length(thumb) <= 20000 and thumb like 'data:image/jpeg;base64,%')),
  -- One entry per book (Q-3b). An entry whose book was deleted keeps from_book_id null.
  constraint cover_my_layouts_book_key unique (user_id, from_book_id)
);

create index cover_my_layouts_from_book_idx on public.cover_my_layouts (from_book_id);

comment on table public.cover_my_layouts is
  'E16: My layouts. Saved on each cover export, one per book (replaced: upsert on user_id, from_book_id), at most 100 per user. The remove button deletes one.';

alter table public.cover_my_layouts enable row level security;

create policy "cover_my_layouts_select_own" on public.cover_my_layouts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_my_layouts_insert_own" on public.cover_my_layouts
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = from_book_id and b.user_id = (select auth.uid())));
create policy "cover_my_layouts_update_own" on public.cover_my_layouts
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (from_book_id is null
         or exists (select 1 from public.books b where b.id = from_book_id and b.user_id = (select auth.uid()))));
create policy "cover_my_layouts_delete_own" on public.cover_my_layouts
  for delete to authenticated using (user_id = (select auth.uid()));

revoke truncate on public.cover_my_layouts from anon, authenticated;

create or replace function public.cover_my_layouts_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.from_book_id is null then
      raise exception 'my_layout_book' using errcode = 'P0001',
        detail = 'A layout is saved from a book''s export.';
    end if;
    -- 100 per user. An export of a book that already has an entry replaces it
    -- (the upsert's insert trigger runs before the conflict is found), so it never counts.
    if not exists (select 1 from public.cover_my_layouts m where m.user_id = new.user_id and m.from_book_id = new.from_book_id)
       and (select count(*) from public.cover_my_layouts m where m.user_id = new.user_id) >= 100 then
      raise exception 'my_layouts_full' using errcode = 'P0001',
        detail = 'You have 100 saved layouts. Remove one first.';
    end if;
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
  'Trigger (E16): an entry comes from a book (P0001 "my_layout_book"); at most 100 per user, a replace never counts (P0001 "my_layouts_full"); owner and book never change, the book may go to null (P0001 "my_layout_fixed"); exported_at is the server clock on every export write (a rename or the book going to null keeps it).';

create trigger cover_my_layouts_guard before insert or update on public.cover_my_layouts
  for each row execute function public.cover_my_layouts_guard();

revoke execute on function public.cover_my_layouts_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The size and the key
-- ---------------------------------------------------------------------------
-- Today's size of the book: trim (Brief), pages (the current Print PDF, else
-- null), paper (one rule). Null for a book that is not the caller's.
create or replace function public.cover_fmt(p_book_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'trim', br.trim_size,
           'pages', (select c.page_count from public.cover_pdf(b.id) c where c.current),
           'paper', public.cover_paper(f.paper))
    from public.books b
    left join public.book_briefs br on br.book_id = b.id
    left join public.book_formats f on f.book_id = b.id
   where b.id = p_book_id
$$;

comment on function public.cover_fmt(uuid) is
  'E16: today''s size of a book, {trim, pages, paper}: the Brief trim, the current Print PDF''s page count (null without one), the paper (cover_paper). Under the caller''s RLS.';

-- md5 of what the cover files are built from: the design's layers, bg and the
-- fmt they are laid out for. Not the Print PDF row id, so downloading an
-- unchanged Print PDF again does not stale the cover.
create or replace function public.cover_key(p_book_id uuid)
returns text language sql stable set search_path = '' as $$
  select md5(jsonb_build_object('layers', d.layers, 'bg', d.bg, 'fmt', d.fmt)::text)
    from public.cover_designs d
   where d.book_id = p_book_id
$$;

comment on function public.cover_key(uuid) is
  'E16: md5 of the design''s layers, bg and fmt (the inputs of every cover file). Null without a design row or for a book that is not the caller''s.';

-- ---------------------------------------------------------------------------
-- 8. cover_exports (from 0029): kind 'image', the new key and guard
-- ---------------------------------------------------------------------------
alter table public.cover_exports drop constraint cover_exports_kind_check;
alter table public.cover_exports add constraint cover_exports_kind_check check (kind in ('print', 'image', 'kindle'));
-- A superset of 0029's rule (print and kindle rows are unchanged), so old rows still pass.
alter table public.cover_exports drop constraint cover_exports_fields_check;
alter table public.cover_exports add constraint cover_exports_fields_check check (case kind
  when 'print' then width_in is not null and height_in is not null and spine_in is not null and width_px is null and height_px is null
  when 'image' then width_px is not null and height_px is not null and width_in is null and height_in is null and spine_in is null
                    and thumb is null
  else width_px = 1600 and height_px = 2560 and width_in is null and height_in is null and spine_in is null
       and page_count is null and pdf_export_id is null and thumb is null end);

comment on table public.cover_exports is
  'E15/E16: one row per exported cover file: print (the wrap PDF), image (the full 300 DPI PNG or JPG) or kindle (the 1600 x 2560 JPG). The guard sets page_count, pdf_export_id and snapshot. 20 kept per book and kind.';
comment on column public.cover_exports.settings_key is
  'The cover_key(book) the file was built from. The guard refuses a key that is not today''s.';

-- SECURITY DEFINER: it reads the keys and the assets, and removes the oldest rows past 20.
create or replace function public.cover_exports_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid; v_book public.books%rowtype; v_design public.cover_designs%rowtype;
  v_pdf record; v_trim text; v_paper text; v_pen text;
  v_w numeric; v_h numeric; v_k numeric;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  if v_owner <> new.user_id then
    raise exception 'export_owner' using errcode = 'P0001',
      detail = 'An export belongs to the owner of its book.';
  end if;
  -- One export at a time per book; edits that touch the book wait.
  select * into v_book from public.books b where b.id = new.book_id for update;
  select * into v_design from public.cover_designs d where d.book_id = new.book_id;
  if not found then
    raise exception 'cover_missing' using errcode = 'P0001', detail = 'Open 09 Cover before you export.';
  end if;
  select * into v_pdf from public.cover_pdf(new.book_id);
  if not found or not v_pdf.current then
    raise exception 'cover_pdf_missing' using errcode = 'P0001',
      detail = 'Export the Print PDF in 08 first.';
  end if;
  -- A 09 trim: a missing Brief row or another trim never reaches the size check.
  select br.trim_size into v_trim from public.book_briefs br where br.book_id = new.book_id;
  if not public.cover_trim_ok(v_trim) then
    raise exception 'cover_trim' using errcode = 'P0001',
      detail = 'Pick a trim size of 5 x 8, 5.25 x 8, 5.5 x 8.5, 6 x 9, 8 x 10 or 8.5 x 11 in.';
  end if;
  -- One paper rule: no format row or no value is white.
  select f.paper into v_paper from public.book_formats f where f.book_id = new.book_id;
  v_paper := public.cover_paper(v_paper);
  -- The layers must be laid out for today's size (09 remaps on open).
  if v_design.fmt is distinct from jsonb_build_object('trim', v_trim, 'pages', v_pdf.page_count, 'paper', v_paper) then
    raise exception 'cover_resized' using errcode = 'P0001',
      detail = 'The book size changed. Open 09 Cover again so the layers move to the new size.';
  end if;
  if new.settings_key is distinct from public.cover_key(new.book_id) then
    raise exception 'cover_stale' using errcode = 'P0001',
      detail = 'Your cover changed while the file was made. Make it again.';
  end if;
  -- Every picture that prints is the owner's, with the rights tick or a stock source.
  -- Hidden and excluded layers do not print; a layer without a picture (null asset) has none to check.
  if exists (
       select 1 from jsonb_array_elements(v_design.layers) l
        where l ->> 'type' = 'image'
          and coalesce(l -> 'hidden', 'false'::jsonb) <> 'true'::jsonb
          and coalesce(l -> 'noExport', 'false'::jsonb) <> 'true'::jsonb
          and coalesce(l ->> 'asset', '') <> ''
          and not exists (select 1 from public.cover_assets a
                           where a.id::text = l ->> 'asset' and a.user_id = new.user_id
                             and (a.rights_at is not null or a.source in ('pixabay', 'unsplash')))) then
    raise exception 'cover_rights' using errcode = 'P0001',
      detail = 'Every picture needs your rights tick or a stock source. A picture removed from Uploads cannot print.';
  end if;
  select p.name into v_pen from public.pen_names p where p.id = v_book.pen_name_id;
  v_w := split_part(v_trim, 'x', 1)::numeric;
  v_h := split_part(v_trim, 'x', 2)::numeric;
  v_k := case when v_paper = 'cream' then 0.0025 else 0.002252 end;
  if new.kind = 'print' then
    new.page_count := v_pdf.page_count;
    new.pdf_export_id := v_pdf.export_id;
    if new.spine_in is null or new.width_in is null or new.height_in is null
       or abs(new.spine_in - round(v_pdf.page_count * v_k, 4)) > 0.0001
       or abs(new.width_in - round(0.25 + 2 * v_w + v_pdf.page_count * v_k, 4)) > 0.0001
       or abs(new.height_in - round(v_h + 0.25, 4)) > 0.0001 then
      raise exception 'cover_size' using errcode = 'P0001',
        detail = 'The cover size does not match the trim, page count and paper.';
    end if;
  elsif new.kind = 'image' then
    new.page_count := v_pdf.page_count;
    new.pdf_export_id := v_pdf.export_id;
    -- The full wrap at 300 DPI, rounded up (kdpCover.geo.px300, D16).
    if new.width_px is distinct from ceil((0.25 + 2 * v_w + v_pdf.page_count * v_k) * 300)::int
       or new.height_px is distinct from ceil((v_h + 0.25) * 300)::int then
      raise exception 'cover_size' using errcode = 'P0001',
        detail = 'The image size does not match the trim, page count and paper at 300 DPI.';
    end if;
  end if;
  new.created_at := now();
  new.snapshot := jsonb_build_object('title', v_book.title, 'subtitle', v_book.subtitle, 'pen_name', v_pen,
    'trim', v_trim, 'paper', v_paper, 'page_count', v_pdf.page_count,
    'layout', v_design.layout, 'rev', v_design.rev);
  delete from public.cover_exports e
   where e.book_id = new.book_id and e.kind = new.kind
     and e.id not in (select e2.id from public.cover_exports e2
                       where e2.book_id = new.book_id and e2.kind = new.kind
                       order by e2.created_at desc, e2.id desc limit 19);
  return new;
end $$;

comment on function public.cover_exports_guard() is
  'Trigger (E16): user_id is the book''s owner (P0001 "export_owner"); one export at a time (the book row is locked); a design row ("cover_missing"), a current Print PDF ("cover_pdf_missing"), a 09 trim ("cover_trim"), layers laid out for today''s size ("cover_resized"), today''s key ("cover_stale"), every printed picture the owner''s with the rights tick or a stock source ("cover_rights"), and the computed size for print (inches) and image (300 DPI px) ("cover_size"); sets page_count, pdf_export_id (print, image), created_at and the snapshot; keeps 20 per book and kind.';

-- ---------------------------------------------------------------------------
-- 9. cover_marks, cover_json
-- ---------------------------------------------------------------------------
-- One row per caller's book with a Print PDF or a cover export. Under RLS.
-- "changed": the file's key is not today's, or the design is laid out for
-- another size than the book has today (it moves when 09 opens again).
create or replace function public.cover_marks(p_book_id uuid default null)
returns table (book_id uuid, pdf_current boolean,
               print_at timestamptz, print_changed boolean,
               image_at timestamptz, image_changed boolean,
               kindle_at timestamptz, kindle_changed boolean, thumb text)
language sql stable set search_path = '' as $$
  with ids as (
    select e.book_id from public.book_exports e where e.format = 'pdf' and (p_book_id is null or e.book_id = p_book_id)
    union
    select c.book_id from public.cover_exports c where (p_book_id is null or c.book_id = p_book_id)
  )
  select i.book_id, coalesce(pdf.current, false),
         pr.created_at, case when pr.id is not null then pr.settings_key is distinct from now_.k or now_.resized end,
         im.created_at, case when im.id is not null then im.settings_key is distinct from now_.k or now_.resized end,
         ki.created_at, case when ki.id is not null then ki.settings_key is distinct from now_.k or now_.resized end,
         pr.thumb
    from ids i
    left join lateral (select * from public.cover_pdf(i.book_id)) pdf on true
    cross join lateral (select public.cover_key(i.book_id) as k,
                               coalesce((select d.fmt from public.cover_designs d where d.book_id = i.book_id)
                                        is distinct from public.cover_fmt(i.book_id), true) as resized) now_
    left join lateral (select e.id, e.created_at, e.settings_key, e.thumb from public.cover_exports e
                        where e.book_id = i.book_id and e.kind = 'print'
                        order by e.created_at desc, e.id desc limit 1) pr on true
    left join lateral (select e.id, e.created_at, e.settings_key from public.cover_exports e
                        where e.book_id = i.book_id and e.kind = 'image'
                        order by e.created_at desc, e.id desc limit 1) im on true
    left join lateral (select e.id, e.created_at, e.settings_key from public.cover_exports e
                        where e.book_id = i.book_id and e.kind = 'kindle'
                        order by e.created_at desc, e.id desc limit 1) ki on true
$$;

comment on function public.cover_marks(uuid) is
  'E16: per book with a Print PDF or a cover export (or one book): whether the Print PDF is current, the last print, image and kindle export times, "changed" for each (the key is not today''s, or the design is laid out for another size than cover_fmt), and the print thumbnail. The 09 mark and the Books card. Under the caller''s RLS.';

-- Everything 09 reads. Null for a book that is not the caller's.
create or replace function public.cover_json(p_book_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'book', jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle,
      'pen_name_id', b.pen_name_id, 'pen_name', p.name, 'bio_text', p.bio_text,
      'trim', br.trim_size, 'paper', public.cover_paper(f.paper)),
    'fmt', public.cover_fmt(b.id),
    'pdf', (select to_jsonb(x) from public.cover_pdf(b.id) x),
    'design', (select to_jsonb(d) - 'user_id' from public.cover_designs d where d.book_id = b.id),
    -- the pictures the design uses (Uploads lists them all with its own read)
    'assets', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at, a.id)
                          from public.cover_assets a
                         where a.id::text in (select l ->> 'asset' from public.cover_designs d, jsonb_array_elements(d.layers) l
                                               where d.book_id = b.id and l ->> 'type' = 'image')), '[]'::jsonb),
    'blurb', (select jsonb_build_object('id', x.id, 'body', x.body, 'source', x.source, 'created_at', x.created_at)
                from public.cover_blurbs x where x.book_id = b.id order by x.created_at desc, x.id desc limit 1),
    -- My layouts without their layers (fetched on apply): newest export first
    'my_layouts', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'from_book_id', m.from_book_id,
                              'from_title', m.from_title, 'fmt', m.fmt, 'bg', m.bg, 'thumb', m.thumb, 'exported_at', m.exported_at)
                              order by m.exported_at desc, m.id desc)
                              from public.cover_my_layouts m), '[]'::jsonb),
    'key', public.cover_key(b.id),
    'last', jsonb_build_object(
      'print', (select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'settings_key', e.settings_key,
                  'page_count', e.page_count, 'width_in', e.width_in, 'height_in', e.height_in, 'spine_in', e.spine_in,
                  'snapshot', e.snapshot)
                  from public.cover_exports e where e.book_id = b.id and e.kind = 'print'
                  order by e.created_at desc, e.id desc limit 1),
      'image', (select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'settings_key', e.settings_key,
                  'page_count', e.page_count, 'width_px', e.width_px, 'height_px', e.height_px, 'snapshot', e.snapshot)
                  from public.cover_exports e where e.book_id = b.id and e.kind = 'image'
                  order by e.created_at desc, e.id desc limit 1),
      'kindle', (select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'settings_key', e.settings_key,
                  'snapshot', e.snapshot)
                  from public.cover_exports e where e.book_id = b.id and e.kind = 'kindle'
                  order by e.created_at desc, e.id desc limit 1)),
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  left join public.book_formats f on f.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.cover_json(uuid) is
  'E16: everything 09 Cover reads, under the caller''s RLS (null when the book is not the caller''s): book (title, subtitle, pen name, bio, trim, paper), fmt (cover_fmt), pdf (cover_pdf), design, the assets the design uses, the current blurb, my_layouts (without layers), key (cover_key), the last export of each kind, now.';

-- ---------------------------------------------------------------------------
-- 10. Storage: "covers" takes JPEG and PNG at <user id>/assets/<asset id>.jpg|png
-- ---------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png'] where id = 'covers';

create policy "covers_insert_asset" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$');
-- No update policy: a picture is never overwritten (upsert off, a new path each time).
-- covers_select_own and covers_delete_own (0029, the own folder) are kept.

-- ---------------------------------------------------------------------------
-- Grants. Supabase gives anon EXECUTE on new functions by default.
-- The shape helpers run inside table checks, so the signed-in role needs
-- them; no one else does (F6, F8: explicit, never the default privileges).
-- cover_trim_ok keeps its 0029 grants (create or replace keeps them); they are
-- written again here so this file states every grant it relies on.
-- ---------------------------------------------------------------------------
revoke execute on function public.cover_trim_ok(text) from public, anon;
revoke execute on function public.cover_fmt_ok(jsonb) from public, anon;
revoke execute on function public.cover_layers_ok(jsonb) from public, anon;
revoke execute on function public.cover_fmt(uuid) from public, anon;
revoke execute on function public.cover_key(uuid) from public, anon;
revoke execute on function public.cover_marks(uuid) from public, anon;
revoke execute on function public.cover_json(uuid) from public, anon;
grant execute on function public.cover_trim_ok(text) to authenticated;
grant execute on function public.cover_fmt_ok(jsonb) to authenticated;
grant execute on function public.cover_layers_ok(jsonb) to authenticated;
grant execute on function public.cover_fmt(uuid) to authenticated;
grant execute on function public.cover_key(uuid) to authenticated;
grant execute on function public.cover_marks(uuid) to authenticated;
grant execute on function public.cover_json(uuid) to authenticated;
