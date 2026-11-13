-- 0029_cover.sql
-- NicheInk · E15 · 09 Cover (data only). Plan: docs/reviews/2026-11-10-e15-plan.md (§6, §11).
-- The cover never stores book text besides its own headline and blurb.
--
-- 1. Shapes: cover_hex_ok, cover_recent_ok, cover_words, cover_trim_ok
--    (group A, the same strings as kdpFormatRules.TRIMS) and cover_paper
--    (one paper rule: 'cream', else 'white', a missing format row too).
--    They run inside table checks and the key functions, so authenticated
--    gets EXECUTE explicitly (F8); public and anon do not (F6).
-- 2. cover_images: pictures the writer uploaded for the front or the Kindle
--    cover. The file lives in the private bucket "covers" at
--    <user id>/<book id>/<image id>.jpg (the path check). rights_at is set
--    from the server clock when the writer ticks "I have the rights";
--    a new picture needs a new tick. source: 'upload' (E15) or 'ai' (the
--    later AI cover images, no UI yet). RLS: own rows, own books.
-- 3. book_covers: the 09 settings, one row per book. Front text is never
--    stored here (it comes from 04 Title and the pen name); title_breaks
--    holds the same words as the title with line breaks (checked when it
--    changes). RLS: own rows, own books, no delete (the row goes with its book).
-- 4. cover_blurbs: blurb versions, newest is current, 20 kept per book.
--    Versions never change. RLS: own rows, read and add only.
-- 5. cover_pdf(book): the last Print PDF and whether it is current.
--    cover_book_key(book), cover_key(book, kind): the Out of date and
--    "changed since export" rules (plan Q-f).
-- 6. cover_exports: one row per exported file. The guard checks a group A
--    trim, the current Print PDF, today's key, the rights ticks (front, and
--    the Kindle version in upload mode) and the computed size, and sets the
--    page count, the Print PDF id and the snapshot itself.
-- 7. cover_marks(book default null), cover_json(book).
-- 8. Storage: the private bucket "covers" and its policies.
--
-- Checked before writing (read-only, 2026-11-10): last migration 20261105120500
-- (0028); book_briefs.trim_size is not null, values '6x9' and '5.5x8.5'
-- (format <w>x<h>, as kdpFormatRules.TRIMS); book_formats.paper 'white' only;
-- 8 books have no format row; no storage buckets, no storage policies;
-- storage.buckets and storage.objects have RLS on; storage.foldername is the
-- plpgsql helper (every segment but the last).

-- ---------------------------------------------------------------------------
-- 1. Shapes
-- ---------------------------------------------------------------------------
create or replace function public.cover_hex_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and p ~ '^#[0-9A-F]{6}$'
$$;

comment on function public.cover_hex_ok(text) is
  'E15: a cover color, "#" and 6 upper-case hex digits.';

create or replace function public.cover_recent_ok(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p is null then false
    when cardinality(p) > 5 or array_position(p, null) is not null then false
    when exists (select 1 from unnest(p) x where not public.cover_hex_ok(x)) then false
    else (select count(distinct x) from unnest(p) x) = cardinality(p)
  end
$$;

comment on function public.cover_recent_ok(text[]) is
  'E15: book_covers.recent_colors, at most 5 colors, no nulls, no repeats.';

-- Words of a text, one space between them (title_breaks vs title).
create or replace function public.cover_words(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')
$$;

comment on function public.cover_words(text) is
  'E15: the words of a text with one space between them (js/cover-math.js words).';

-- Group A trims, the same strings as kdpFormatRules.TRIMS (limits-parity test).
create or replace function public.cover_trim_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p in ('6x9', '5.5x8.5', '5.25x8', '5x8'), false)
$$;

comment on function public.cover_trim_ok(text) is
  'E15: a group A trim (5x8, 5.25x8, 5.5x8.5, 6x9). Null and every other value are false.';

-- One paper rule (JS: kdpCoverMath.paperOf): 'cream', else 'white' (a missing format row too).
create or replace function public.cover_paper(p text)
returns text language sql immutable set search_path = '' as $$
  select case when p = 'cream' then 'cream' else 'white' end
$$;

comment on function public.cover_paper(text) is
  'E15: the cover''s paper: cream when book_formats.paper is cream, else white (null and a missing row too).';

-- ---------------------------------------------------------------------------
-- 2. cover_images
-- ---------------------------------------------------------------------------
create table public.cover_images (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null,
  source      text not null default 'upload',
  path        text not null,
  width       int not null,
  height      int not null,
  bytes       int not null,
  rights_at   timestamptz,
  created_at  timestamptz not null default now(),
  constraint cover_images_kind_check check (kind in ('front', 'kindle')),
  -- 'ai' is for the later AI cover images (v2); E15 writes 'upload' only.
  constraint cover_images_source_check check (source in ('upload', 'ai')),
  constraint cover_images_path_check check (path = user_id::text || '/' || book_id::text || '/' || id::text || '.jpg'),
  constraint cover_images_px_check check (width between 1 and 4096 and height between 1 and 4096),
  constraint cover_images_kindle_check check (kind <> 'kindle' or (width >= 1600 and height >= 2560)),
  constraint cover_images_bytes_check check (bytes between 1 and 10485760)
);

create index cover_images_user_id_idx on public.cover_images (user_id);
create index cover_images_book_id_idx on public.cover_images (book_id);

comment on table public.cover_images is
  'E15: pictures uploaded for the 09 front (kind front) or the Kindle cover (kind kindle). The file is in the private bucket "covers" at path. Plan docs/reviews/2026-11-10-e15-plan.md §5.';
comment on column public.cover_images.path is
  '<user id>/<book id>/<image id>.jpg in the bucket "covers". The browser makes the id, uploads, then adds the row.';
comment on column public.cover_images.rights_at is
  'When the writer ticked "I have the rights to use this image" (server clock). Null: not ticked. Export needs it.';
comment on column public.cover_images.source is
  'upload (E15) or ai (later AI cover images, no UI yet).';

alter table public.cover_images enable row level security;

create policy "cover_images_select_own" on public.cover_images
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_images_insert_own" on public.cover_images
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "cover_images_update_own" on public.cover_images
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "cover_images_delete_own" on public.cover_images
  for delete to authenticated using (user_id = (select auth.uid()));

revoke truncate on public.cover_images from anon, authenticated;

create or replace function public.cover_images_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid;
begin
  if tg_op = 'UPDATE' and (new.id, new.book_id, new.user_id, new.kind, new.source, new.path, new.width, new.height, new.bytes)
       is distinct from (old.id, old.book_id, old.user_id, old.kind, old.source, old.path, old.width, old.height, old.bytes) then
    raise exception 'cover_image_fixed' using errcode = 'P0001',
      detail = 'Only the rights tick of a picture can change.';
  end if;
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;   -- the foreign key or the policy refuses it
  end if;
  if v_owner <> new.user_id then
    raise exception 'cover_owner' using errcode = 'P0001',
      detail = 'A cover picture belongs to the owner of its book.';
  end if;
  -- The rights tick: the server clock, set once per tick.
  if new.rights_at is not null and (tg_op = 'INSERT' or old.rights_at is null) then
    new.rights_at := now();
  elsif tg_op = 'UPDATE' and new.rights_at is not null then
    new.rights_at := old.rights_at;
  end if;
  return new;
end $$;

comment on function public.cover_images_guard() is
  'Trigger (E15): only rights_at changes (P0001 "cover_image_fixed"); user_id is the book''s owner (P0001 "cover_owner"); rights_at takes the server clock when ticked and keeps it while ticked.';

create trigger cover_images_guard before insert or update on public.cover_images
  for each row execute function public.cover_images_guard();

revoke execute on function public.cover_images_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. book_covers
-- ---------------------------------------------------------------------------
create table public.book_covers (
  book_id          uuid primary key references public.books (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode             text not null default 'template',
  template         text not null default 'band',
  font_pair        text not null default 'serif',
  main_color       text not null default '#1F3A5F',
  title_color      text not null default '#FFFFFF',
  paper_color      text not null default '#F2EDE4',
  recent_colors    text[] not null default '{}',
  title_breaks     text,
  title_position   text not null default 'top',
  dark_layer       boolean not null default true,
  headline         text,
  author_line      boolean not null default true,
  front_image_id   uuid references public.cover_images (id) on delete set null,
  kindle_image_id  uuid references public.cover_images (id) on delete set null,
  kindle_crop      numeric(4,3) not null default 0.5,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint book_covers_mode_check check (mode in ('template', 'template_image', 'upload')),
  constraint book_covers_template_check check (template in ('band', 'center', 'stack', 'corner')),
  constraint book_covers_font_pair_check check (font_pair in ('serif', 'garamond', 'sans')),
  constraint book_covers_colors_check check (public.cover_hex_ok(main_color) and public.cover_hex_ok(title_color) and public.cover_hex_ok(paper_color)),
  constraint book_covers_recent_check check (public.cover_recent_ok(recent_colors)),
  constraint book_covers_breaks_check check (title_breaks is null or (char_length(title_breaks) between 1 and 300
    and title_breaks = btrim(title_breaks) and array_length(string_to_array(title_breaks, E'\n'), 1) <= 4)),
  constraint book_covers_position_check check (title_position in ('top', 'middle', 'bottom')),
  constraint book_covers_headline_check check (headline is null or (char_length(headline) between 1 and 80
    and headline = btrim(headline) and position(E'\n' in headline) = 0)),
  constraint book_covers_crop_check check (kindle_crop between 0 and 1)
);

create index book_covers_user_id_idx on public.book_covers (user_id);
create index book_covers_front_image_idx on public.book_covers (front_image_id);
create index book_covers_kindle_image_idx on public.book_covers (kindle_image_id);

comment on table public.book_covers is
  'E15: the 09 Cover settings, one row per book. Title, subtitle and pen name are read from 04 and Pen Names, never stored here. Plan docs/reviews/2026-11-10-e15-plan.md.';
comment on column public.book_covers.title_breaks is
  'The 04 title with line breaks for the cover only (same words, at most 4 lines). Ignored by the browser when the 04 title changed (F4).';
comment on column public.book_covers.kindle_crop is
  'Upload front: where the Kindle crop sits across the front, 0 (left) to 1 (right).';

create trigger book_covers_set_updated_at before update on public.book_covers
  for each row execute function public.set_updated_at();

alter table public.book_covers enable row level security;

create policy "book_covers_select_own" on public.book_covers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "book_covers_insert_own" on public.book_covers
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));
create policy "book_covers_update_own" on public.book_covers
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));

-- The row goes with its book (cascade), never by hand.
revoke delete, truncate on public.book_covers from anon, authenticated;

create or replace function public.book_covers_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_owner uuid; v_title text;
begin
  if tg_op = 'UPDATE' and (new.book_id is distinct from old.book_id or new.user_id is distinct from old.user_id) then
    raise exception 'cover_fixed' using errcode = 'P0001',
      detail = 'A cover row stays with its book and its owner.';
  end if;
  select b.user_id, b.title into v_owner, v_title from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  if v_owner <> new.user_id then
    raise exception 'cover_owner' using errcode = 'P0001',
      detail = 'A cover row belongs to the owner of its book.';
  end if;
  -- Pictures: of this book and owner, and of the right kind.
  if (new.front_image_id is not null and (tg_op = 'INSERT' or new.front_image_id is distinct from old.front_image_id)
        and not exists (select 1 from public.cover_images i where i.id = new.front_image_id
                          and i.book_id = new.book_id and i.user_id = new.user_id and i.kind = 'front'))
     or (new.kindle_image_id is not null and (tg_op = 'INSERT' or new.kindle_image_id is distinct from old.kindle_image_id)
        and not exists (select 1 from public.cover_images i where i.id = new.kindle_image_id
                          and i.book_id = new.book_id and i.user_id = new.user_id and i.kind = 'kindle')) then
    raise exception 'cover_image_not_allowed' using errcode = 'P0001',
      detail = 'A cover uses only pictures uploaded for this book.';
  end if;
  -- Title breaks: the same words as the 04 title, checked when they change.
  if new.title_breaks is not null and (tg_op = 'INSERT' or new.title_breaks is distinct from old.title_breaks)
     and public.cover_words(new.title_breaks) is distinct from public.cover_words(v_title) then
    raise exception 'cover_breaks_words' using errcode = 'P0001',
      detail = 'Use the same words as 04 Title. Only the line breaks change.';
  end if;
  return new;
end $$;

comment on function public.book_covers_guard() is
  'Trigger (E15): book_id and user_id never change (P0001 "cover_fixed"); user_id is the book''s owner (P0001 "cover_owner"); pictures are this book''s, of the right kind (P0001 "cover_image_not_allowed"); new title breaks hold the 04 title''s words (P0001 "cover_breaks_words").';

create trigger book_covers_guard before insert or update on public.book_covers
  for each row execute function public.book_covers_guard();

revoke execute on function public.book_covers_guard() from public, anon, authenticated;

-- A cover edit moves the book to the top of Books (0009). Not on insert:
-- the row is made when 09 first opens, which is not an edit.
create trigger book_covers_touch_book after update on public.book_covers
  for each row execute function public.touch_book_from_child();

-- ---------------------------------------------------------------------------
-- 4. cover_blurbs (versions)
-- ---------------------------------------------------------------------------
create table public.cover_blurbs (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body        text not null,
  source      text not null,
  created_at  timestamptz not null default now(),
  constraint cover_blurbs_body_check check (char_length(body) between 1 and 1500 and body = btrim(body)),
  constraint cover_blurbs_source_check check (source in ('manual', 'ai'))
);

create index cover_blurbs_book_created_idx on public.cover_blurbs (book_id, created_at desc, id desc);
create index cover_blurbs_user_id_idx on public.cover_blurbs (user_id);

comment on table public.cover_blurbs is
  'E15: back cover blurb versions (CLAUDE.md §6: never overwrite writing). The newest is current; 20 kept per book. Every Save (manual) and every Accept (ai) is a version.';

alter table public.cover_blurbs enable row level security;

create policy "cover_blurbs_select_own" on public.cover_blurbs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_blurbs_insert_own" on public.cover_blurbs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));

revoke update, delete, truncate on public.cover_blurbs from anon, authenticated;

-- SECURITY DEFINER: it removes the oldest versions past 20, which the writer cannot.
create or replace function public.cover_blurbs_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  if v_owner <> new.user_id then
    raise exception 'cover_owner' using errcode = 'P0001',
      detail = 'A blurb belongs to the owner of its book.';
  end if;
  new.created_at := now();
  delete from public.cover_blurbs x
   where x.book_id = new.book_id
     and x.id not in (select y.id from public.cover_blurbs y where y.book_id = new.book_id
                       order by y.created_at desc, y.id desc limit 19);
  return new;
end $$;

comment on function public.cover_blurbs_guard() is
  'Trigger (E15): user_id is the book''s owner (P0001 "cover_owner"); created_at is the server clock; keeps the newest 19 older versions, so a book has at most 20.';

create trigger cover_blurbs_guard before insert on public.cover_blurbs
  for each row execute function public.cover_blurbs_guard();

revoke execute on function public.cover_blurbs_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The Print PDF, the keys
-- ---------------------------------------------------------------------------
-- The last Print PDF of the book and whether it is current (0027 format_key).
create or replace function public.cover_pdf(p_book_id uuid)
returns table (export_id uuid, page_count int, created_at timestamptz, current boolean)
language sql stable set search_path = '' as $$
  select e.id, e.page_count, e.created_at, e.settings_key is not distinct from public.format_key(p_book_id)
    from public.book_exports e
   where e.book_id = p_book_id and e.format = 'pdf'
   order by e.created_at desc, e.id desc
   limit 1
$$;

comment on function public.cover_pdf(uuid) is
  'E15: the last Print PDF of the book (id, page count, time) and whether it is current (format_key). No row before the first. Under the caller''s RLS.';

-- Out of date (owner list): page count of the current Print PDF, trim, paper,
-- title, subtitle, pen name. Null pages when there is no current Print PDF.
create or replace function public.cover_book_key(p_book_id uuid)
returns text language sql stable set search_path = '' as $$
  select md5(jsonb_build_object(
           'pages', (select c.page_count from public.cover_pdf(b.id) c where c.current),
           'trim', br.trim_size,
           'paper', public.cover_paper(f.paper),
           'title', b.title,
           'subtitle', b.subtitle,
           'pen_name', p.name)::text)
    from public.books b
    left join public.book_formats f on f.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
   where b.id = p_book_id
$$;

comment on function public.cover_book_key(uuid) is
  'E15: md5 of what makes a cover Out of date: the current Print PDF''s page count, trim, paper, title, subtitle, pen name (plan Q-f). Null for a book that is not the caller''s.';

-- Changed since export, per file. Null without a cover row or for another kind.
create or replace function public.cover_key(p_book_id uuid, p_kind text)
returns text language sql stable set search_path = '' as $$
  select md5((case p_kind
    when 'print' then jsonb_build_object(
      'book', public.cover_book_key(b.id),
      'front', fr.front,
      'headline', c.headline,
      'blurb', (select x.id from public.cover_blurbs x where x.book_id = b.id order by x.created_at desc, x.id desc limit 1),
      'author_line', c.author_line,
      'bio_md5', case when c.author_line then md5(coalesce(p.bio_text, '')) end)
    when 'kindle' then jsonb_build_object(
      'title', b.title, 'subtitle', b.subtitle, 'pen_name', p.name, 'trim', br.trim_size,
      'front', fr.front,
      'kindle_image', case when c.mode = 'upload' then c.kindle_image_id end,
      'kindle_crop', case when c.mode = 'upload' then c.kindle_crop end)
    end)::text)
    from public.books b
    join public.book_covers c on c.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
    cross join lateral (select jsonb_build_object(
      'mode', c.mode, 'template', c.template, 'font_pair', c.font_pair,
      'main', c.main_color, 'title_color', c.title_color, 'paper_color', c.paper_color,
      'breaks', c.title_breaks, 'position', c.title_position,
      'dark_layer', case when c.mode = 'template_image' then c.dark_layer end,
      'front_image', case when c.mode <> 'template' then c.front_image_id end) as front) fr
   where b.id = p_book_id and p_kind in ('print', 'kindle')
$$;

comment on function public.cover_key(uuid, text) is
  'E15: md5 of every input of one cover file. print: cover_book_key, the front settings, headline, current blurb, author line (and the bio when on). kindle: title, subtitle, pen name, trim, the front settings, the Kindle picture and crop (upload). Null without a cover row or for another kind.';

-- ---------------------------------------------------------------------------
-- 6. cover_exports
-- ---------------------------------------------------------------------------
create table public.cover_exports (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.books (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null,
  settings_key   text not null,
  engine         text not null,
  page_count     int,
  pdf_export_id  uuid references public.book_exports (id) on delete set null,
  width_in       numeric(7,4),
  height_in      numeric(7,4),
  spine_in       numeric(6,4),
  width_px       int,
  height_px      int,
  thumb          text,
  snapshot       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  constraint cover_exports_kind_check check (kind in ('print', 'kindle')),
  constraint cover_exports_key_check check (settings_key ~ '^[0-9a-f]{32}$'),
  constraint cover_exports_engine_check check (char_length(engine) between 1 and 40 and engine = btrim(engine)),
  constraint cover_exports_fields_check check (case when kind = 'print'
    then width_in is not null and height_in is not null and spine_in is not null and width_px is null and height_px is null
    else width_px = 1600 and height_px = 2560 and width_in is null and height_in is null and spine_in is null
         and page_count is null and pdf_export_id is null and thumb is null end),
  constraint cover_exports_thumb_check check (thumb is null or (char_length(thumb) <= 20000 and thumb like 'data:image/jpeg;base64,%'))
);

create index cover_exports_user_id_idx on public.cover_exports (user_id);
create index cover_exports_book_kind_idx on public.cover_exports (book_id, kind, created_at desc, id desc);
create index cover_exports_pdf_idx on public.cover_exports (pdf_export_id);

comment on table public.cover_exports is
  'E15: one row per exported cover file: print (the wrap PDF) or kindle (the 1600 x 2560 JPG). The guard sets page_count, pdf_export_id and snapshot. 20 kept per book and kind.';
comment on column public.cover_exports.settings_key is
  'The cover_key(book, kind) the file was built from. The guard refuses a key that is not today''s.';
comment on column public.cover_exports.thumb is
  'Print only: a 160 px JPEG of the front as a data URL (at most 20,000 characters), for the Books card (owner Q-m).';

alter table public.cover_exports enable row level security;

create policy "cover_exports_select_own" on public.cover_exports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "cover_exports_insert_own" on public.cover_exports
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = (select auth.uid())));

revoke update, delete, truncate on public.cover_exports from anon, authenticated;

-- SECURITY DEFINER: it reads the keys and removes the oldest rows past 20.
create or replace function public.cover_exports_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid; v_book public.books%rowtype; v_cover public.book_covers%rowtype;
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
  select * into v_cover from public.book_covers c where c.book_id = new.book_id;
  if not found then
    raise exception 'cover_missing' using errcode = 'P0001', detail = 'Open 09 Cover before you export.';
  end if;
  select * into v_pdf from public.cover_pdf(new.book_id);
  if not found or not v_pdf.current then
    raise exception 'cover_pdf_missing' using errcode = 'P0001',
      detail = 'Export the Print PDF in 08 first.';
  end if;
  if new.settings_key is distinct from public.cover_key(new.book_id, new.kind) then
    raise exception 'cover_stale' using errcode = 'P0001',
      detail = 'Your cover changed while the file was made. Make it again.';
  end if;
  -- Rights: the front picture in both image modes; the Kindle version too when one is used (F3).
  if (v_cover.mode <> 'template' and not exists (
        select 1 from public.cover_images i where i.id = v_cover.front_image_id and i.rights_at is not null))
     or (v_cover.mode = 'upload' and v_cover.kindle_image_id is not null and not exists (
        select 1 from public.cover_images i where i.id = v_cover.kindle_image_id and i.rights_at is not null)) then
    raise exception 'cover_rights' using errcode = 'P0001',
      detail = 'Tick "I have the rights to use this image" for every picture first.';
  end if;
  -- A group A trim (F2): a missing Brief row or another trim never reaches the size check.
  select br.trim_size into v_trim from public.book_briefs br where br.book_id = new.book_id;
  if not public.cover_trim_ok(v_trim) then
    raise exception 'cover_trim' using errcode = 'P0001',
      detail = 'Pick a trim size of 5 x 8, 5.25 x 8, 5.5 x 8.5 or 6 x 9 in.';
  end if;
  -- One paper rule: no format row or no value is white.
  select f.paper into v_paper from public.book_formats f where f.book_id = new.book_id;
  v_paper := public.cover_paper(v_paper);
  select p.name into v_pen from public.pen_names p where p.id = v_book.pen_name_id;
  if new.kind = 'print' then
    new.page_count := v_pdf.page_count;
    new.pdf_export_id := v_pdf.export_id;
    v_w := split_part(v_trim, 'x', 1)::numeric;
    v_h := split_part(v_trim, 'x', 2)::numeric;
    v_k := case when v_paper = 'cream' then 0.0025 else 0.002252 end;
    if abs(new.spine_in - round(v_pdf.page_count * v_k, 4)) > 0.0001
       or abs(new.width_in - round(0.25 + 2 * v_w + v_pdf.page_count * v_k, 4)) > 0.0001
       or abs(new.height_in - round(v_h + 0.25, 4)) > 0.0001 then
      raise exception 'cover_size' using errcode = 'P0001',
        detail = 'The cover size does not match the trim, page count and paper.';
    end if;
  end if;
  new.created_at := now();
  new.snapshot := jsonb_build_object('title', v_book.title, 'subtitle', v_book.subtitle, 'pen_name', v_pen,
    'trim', v_trim, 'paper', v_paper, 'page_count', v_pdf.page_count,
    'mode', v_cover.mode, 'template', v_cover.template);
  delete from public.cover_exports e
   where e.book_id = new.book_id and e.kind = new.kind
     and e.id not in (select e2.id from public.cover_exports e2
                       where e2.book_id = new.book_id and e2.kind = new.kind
                       order by e2.created_at desc, e2.id desc limit 19);
  return new;
end $$;

comment on function public.cover_exports_guard() is
  'Trigger (E15): user_id is the book''s owner (P0001 "export_owner"); one export at a time (the book row is locked); a cover row ("cover_missing"), a current Print PDF ("cover_pdf_missing"), today''s key ("cover_stale"), every picture''s rights tick ("cover_rights"), a group A trim ("cover_trim") and, for print, the computed size ("cover_size"); sets page_count, pdf_export_id, created_at and the snapshot; keeps 20 per book and kind.';

create trigger cover_exports_guard before insert on public.cover_exports
  for each row execute function public.cover_exports_guard();

revoke execute on function public.cover_exports_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. cover_marks, cover_json
-- ---------------------------------------------------------------------------
-- One row per caller's book with a Print PDF or a cover export. Under RLS.
create or replace function public.cover_marks(p_book_id uuid default null)
returns table (book_id uuid, pdf_current boolean, print_at timestamptz, print_changed boolean,
               kindle_at timestamptz, kindle_changed boolean, thumb text)
language sql stable set search_path = '' as $$
  with ids as (
    select e.book_id from public.book_exports e where e.format = 'pdf' and (p_book_id is null or e.book_id = p_book_id)
    union
    select c.book_id from public.cover_exports c where (p_book_id is null or c.book_id = p_book_id)
  )
  select i.book_id, coalesce(pdf.current, false),
         pr.created_at, case when pr.id is not null then pr.settings_key is distinct from public.cover_key(i.book_id, 'print') end,
         ki.created_at, case when ki.id is not null then ki.settings_key is distinct from public.cover_key(i.book_id, 'kindle') end,
         pr.thumb
    from ids i
    left join lateral (select * from public.cover_pdf(i.book_id)) pdf on true
    left join lateral (select e.id, e.created_at, e.settings_key, e.thumb from public.cover_exports e
                        where e.book_id = i.book_id and e.kind = 'print'
                        order by e.created_at desc, e.id desc limit 1) pr on true
    left join lateral (select e.id, e.created_at, e.settings_key from public.cover_exports e
                        where e.book_id = i.book_id and e.kind = 'kindle'
                        order by e.created_at desc, e.id desc limit 1) ki on true
$$;

comment on function public.cover_marks(uuid) is
  'E15: per book with a Print PDF or a cover export (or one book): whether the Print PDF is current, the last print and kindle export times, "changed" for each (cover_key), and the print thumbnail. The 09 mark and the Books card. Under the caller''s RLS.';

-- Everything 09 reads. Null for a book that is not the caller's.
create or replace function public.cover_json(p_book_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'book', jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle,
      'pen_name_id', b.pen_name_id, 'pen_name', p.name, 'bio_text', p.bio_text,
      'trim', br.trim_size, 'paper', public.cover_paper(f.paper)),
    'pdf', (select to_jsonb(x) from public.cover_pdf(b.id) x),
    'settings', (select to_jsonb(c) - 'user_id' from public.book_covers c where c.book_id = b.id),
    'images', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.created_at)
                          from public.cover_images i where i.book_id = b.id), '[]'::jsonb),
    'blurb', (select jsonb_build_object('id', x.id, 'body', x.body, 'source', x.source, 'created_at', x.created_at)
                from public.cover_blurbs x where x.book_id = b.id order by x.created_at desc, x.id desc limit 1),
    'keys', jsonb_build_object('book', public.cover_book_key(b.id),
              'print', public.cover_key(b.id, 'print'), 'kindle', public.cover_key(b.id, 'kindle')),
    'last', jsonb_build_object(
      'print', (select jsonb_build_object('id', e.id, 'created_at', e.created_at, 'settings_key', e.settings_key,
                  'page_count', e.page_count, 'width_in', e.width_in, 'height_in', e.height_in, 'spine_in', e.spine_in,
                  'snapshot', e.snapshot)
                  from public.cover_exports e where e.book_id = b.id and e.kind = 'print'
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
  'E15: everything 09 Cover reads, under the caller''s RLS (null when the book is not the caller''s): book (title, subtitle, pen name, bio, trim, paper), pdf (cover_pdf), settings, images, the current blurb, keys (book, print, kindle), the last export of each kind, now.';

-- ---------------------------------------------------------------------------
-- 8. Storage: private bucket "covers", <user id>/<book id>/<image id>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "covers_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "covers_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 2
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and exists (select 1 from public.books b
                 where b.id::text = (storage.foldername(name))[2] and b.user_id = (select auth.uid())));
create policy "covers_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No update policy: a picture is never overwritten (upsert off, a new path each time).

-- ---------------------------------------------------------------------------
-- Grants. Supabase gives anon EXECUTE on new functions by default.
-- The shape helpers run inside table checks and the key functions, so the
-- signed-in role needs them; no one else does (F6, F8: explicit, never the
-- default privileges).
-- ---------------------------------------------------------------------------
revoke execute on function public.cover_hex_ok(text) from public, anon;
revoke execute on function public.cover_recent_ok(text[]) from public, anon;
revoke execute on function public.cover_words(text) from public, anon;
revoke execute on function public.cover_trim_ok(text) from public, anon;
revoke execute on function public.cover_paper(text) from public, anon;
revoke execute on function public.cover_pdf(uuid) from public, anon;
revoke execute on function public.cover_book_key(uuid) from public, anon;
revoke execute on function public.cover_key(uuid, text) from public, anon;
revoke execute on function public.cover_marks(uuid) from public, anon;
revoke execute on function public.cover_json(uuid) from public, anon;
grant execute on function public.cover_hex_ok(text) to authenticated;
grant execute on function public.cover_recent_ok(text[]) to authenticated;
grant execute on function public.cover_words(text) to authenticated;
grant execute on function public.cover_trim_ok(text) to authenticated;
grant execute on function public.cover_paper(text) to authenticated;
grant execute on function public.cover_pdf(uuid) to authenticated;
grant execute on function public.cover_book_key(uuid) to authenticated;
grant execute on function public.cover_key(uuid, text) to authenticated;
grant execute on function public.cover_marks(uuid) to authenticated;
grant execute on function public.cover_json(uuid) to authenticated;
