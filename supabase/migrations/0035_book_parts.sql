-- 0035_book_parts.sql
-- E17: the eight book parts (dedication, epigraph, foreword, preface,
-- acknowledgments, about the author, review request, Also by).
-- Plan: docs/reviews/2026-11-25-e17-plan.md (A, B, C1 to C5, Q-1, Q-11).
-- Additive for the live front end. 0036 removes the old 0027 columns after
-- the merge (book_formats.parts.about / .also_by, book_formats.also_by).
--
-- 1. Tables: book_parts, book_part_versions, book_part_drafts, book_also_by,
--    part_suggestions. RLS and guards on each.
-- 2. Every new book gets its 8 parts (trigger). Q-11: a new pen name moves
--    About the author from Final to Draft.
-- 3. RPCs: save_part_version, restore_part_version, copy_bio_to_about,
--    set_also_by, apply_part_suggestion. No limit or budget inputs.
-- 4. Backfill, then the touch triggers (so no book moves on the Books page).
-- 5. What goes in the files: part_file_list and the readers built on it.
-- 6. Replaced: format_key, epub_key, book_exports_guard, export_badges,
--    export_json, format_json, qc_rule_ok, qc_json, qc_inputs_key, and one
--    qc_dismissed constraint.
--
-- Not checked against the live database. Built and tested on a local
-- Postgres 18 with 0001 to 0034 (34 public tables).

-- ---------------------------------------------------------------------------
-- 1.1 book_parts: one row per kind per book
-- ---------------------------------------------------------------------------

-- The fixed order of the parts, front to back.
create or replace function public.part_kind_ord(p_kind text)
returns int
language sql
immutable
set search_path = ''
as $$
  select array_position(array['dedication', 'epigraph', 'foreword', 'preface',
                              'acknowledgments', 'about_author', 'review_request', 'also_by'], p_kind)
$$;

comment on function public.part_kind_ord(text) is
  'E17: the fixed book order of a part kind (1 to 8); null for an unknown kind.';

create table public.book_parts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id             uuid not null references public.books (id) on delete cascade,
  kind                text not null,
  enabled             boolean not null default false,
  status              text,
  current_version_id  uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint book_parts_book_kind_key unique (book_id, kind),
  constraint book_parts_kind_check check (kind in ('dedication', 'epigraph', 'foreword', 'preface',
                                                   'acknowledgments', 'about_author', 'review_request', 'also_by')),
  constraint book_parts_status_check check (status in ('draft', 'final')),
  -- Text parts have a status; the review request page and Also by have no text.
  constraint book_parts_status_kind_check check ((status is null) = (kind in ('review_request', 'also_by'))),
  constraint book_parts_version_kind_check check (current_version_id is null or kind not in ('review_request', 'also_by'))
);

create index book_parts_user_id_idx on public.book_parts (user_id);
create index book_parts_current_version_id_idx on public.book_parts (current_version_id);

comment on table public.book_parts is
  'E17: the 8 parts of a book, one row each, made by the books trigger. Users change only enabled and status. The current version changes through the part RPCs.';

-- ---------------------------------------------------------------------------
-- 1.2 book_part_versions: insert-only (as section_versions, 0018)
-- ---------------------------------------------------------------------------
create table public.book_part_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  part_id     uuid not null references public.book_parts (id) on delete cascade,
  version_no  int not null,
  content     text not null default '',
  word_count  int not null default 0 check (word_count >= 0),
  source      text not null,
  label       text,
  partial     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint book_part_versions_part_version_key unique (part_id, version_no),
  constraint book_part_versions_content_length_check check (char_length(content) <= 20000),
  constraint book_part_versions_source_check check (source in ('manual', 'restore', 'bio_copy', 'edit_format',
                                                               'improve', 'expand', 'shorten', 'humanize', 'custom'))
);

create index book_part_versions_user_id_idx on public.book_part_versions (user_id);
-- part_id is covered by the leading column of book_part_versions_part_version_key.

comment on table public.book_part_versions is
  'E17: every saved text of a book part. Never updated. At most 20,000 characters (epigraph 1,000, checked by the guard).';

alter table public.book_parts
  add constraint book_parts_current_version_id_fkey
  foreign key (current_version_id) references public.book_part_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 1.3 book_part_drafts: autosave (as section_drafts, 0018)
-- ---------------------------------------------------------------------------
-- The same limits as the versions: 20,000, the epigraph 1,000 (the guard).
create table public.book_part_drafts (
  part_id          uuid primary key references public.book_parts (id) on delete cascade,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content          text not null default '',
  base_version_id  uuid references public.book_part_versions (id) on delete set null,
  saved_at         timestamptz not null default now(),
  constraint book_part_drafts_content_length_check check (char_length(content) <= 20000)
);

create index book_part_drafts_user_id_idx on public.book_part_drafts (user_id);
create index book_part_drafts_base_version_id_idx on public.book_part_drafts (base_version_id);

comment on table public.book_part_drafts is
  'E17: the text being typed in a book part (autosave). One row per part.';

-- ---------------------------------------------------------------------------
-- 1.4 book_also_by: the Also by list, written only by set_also_by
-- ---------------------------------------------------------------------------
create table public.book_also_by (
  book_id        uuid not null references public.books (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position       int not null,
  other_book_id  uuid references public.books (id) on delete cascade,
  title          text,
  subtitle       text,
  created_at     timestamptz not null default now(),
  primary key (book_id, position),
  constraint book_also_by_other_key unique (book_id, other_book_id),
  -- At most 20 entries per book.
  constraint book_also_by_position_check check (position between 1 and 20),
  -- Exactly one of the two: a ticked book, or a typed title.
  constraint book_also_by_one_check check ((other_book_id is null) <> (title is null)),
  constraint book_also_by_title_check check (title is null or (char_length(title) between 1 and 200 and not public.text_is_blank(title))),
  constraint book_also_by_subtitle_check check (subtitle is null or (title is not null and char_length(subtitle) <= 200))
);

create index book_also_by_user_id_idx on public.book_also_by (user_id);
create index book_also_by_other_book_id_idx on public.book_also_by (other_book_id);

comment on table public.book_also_by is
  'E17: the Also by list in print order: another of the writer''s books (ticked) or a typed title. Written only through set_also_by(). A pen name change drops ticks at read time (also_by_entries).';

-- ---------------------------------------------------------------------------
-- 1.5 part_suggestions: Improve on parts (as section_suggestions, 0021)
-- ---------------------------------------------------------------------------
create table public.part_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  book_id          uuid not null references public.books (id) on delete cascade,
  part_id          uuid not null references public.book_parts (id) on delete cascade,
  action           text not null check (action in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom')),
  instruction      text check (instruction is null or (char_length(instruction) <= 300 and not public.text_is_blank(instruction))),
  base_version_id  uuid references public.book_part_versions (id) on delete set null,
  selection        text not null check (char_length(selection) between 1 and 15000),
  output           text not null check (char_length(output) between 1 and 25000),
  flagged          int not null default 0 check (flagged >= 0),
  notes            jsonb not null default '{}' check (jsonb_typeof(notes) = 'object'),
  created_at       timestamptz not null default now(),
  used_at          timestamptz,
  version_id       uuid references public.book_part_versions (id) on delete set null,
  constraint part_suggestions_custom_check check ((action = 'custom') = (instruction is not null)),
  constraint part_suggestions_used_check check (version_id is null or used_at is not null)
);

create index part_suggestions_user_id_idx on public.part_suggestions (user_id);
create index part_suggestions_book_id_idx on public.part_suggestions (book_id);
create index part_suggestions_part_id_idx on public.part_suggestions (part_id);
create index part_suggestions_base_version_id_idx on public.part_suggestions (base_version_id);
create index part_suggestions_version_id_idx on public.part_suggestions (version_id);

comment on table public.part_suggestions is
  'E17: AI suggestions for a book part. Written by the service role; the user applies one once, within 1 hour, through apply_part_suggestion(). Never for the epigraph.';

-- ---------------------------------------------------------------------------
-- 1.6 RLS, policies and table privileges
-- ---------------------------------------------------------------------------
alter table public.book_parts         enable row level security;
alter table public.book_part_versions enable row level security;
alter table public.book_part_drafts   enable row level security;
alter table public.book_also_by       enable row level security;
alter table public.part_suggestions   enable row level security;

-- book_parts: no insert policy (C2). Rows come from the books trigger and the
-- backfill.
create policy "book_parts_select_own" on public.book_parts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_parts_update_own" on public.book_parts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
  );

create policy "book_part_versions_select_own" on public.book_part_versions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_part_versions_insert_own" on public.book_part_versions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.book_parts p
                where p.id = part_id and p.user_id = (select auth.uid()))
  );

create policy "book_part_drafts_select_own" on public.book_part_drafts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_part_drafts_insert_own" on public.book_part_drafts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.book_parts p
                where p.id = part_id and p.user_id = (select auth.uid()))
  );

create policy "book_part_drafts_update_own" on public.book_part_drafts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "book_part_drafts_delete_own" on public.book_part_drafts
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "book_also_by_select_own" on public.book_also_by
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "book_also_by_insert_own" on public.book_also_by
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.books b
                where b.id = book_id and b.user_id = (select auth.uid()))
    and (other_book_id is null
         or exists (select 1 from public.books o
                    where o.id = other_book_id and o.user_id = (select auth.uid())))
  );

create policy "book_also_by_delete_own" on public.book_also_by
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "part_suggestions_select_own" on public.part_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "part_suggestions_update_own" on public.part_suggestions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.book_parts, public.book_part_versions, public.book_part_drafts,
              public.book_also_by, public.part_suggestions from anon;
revoke insert, delete, truncate on public.book_parts from authenticated;
revoke update, delete, truncate on public.book_part_versions from authenticated;
-- Drafts keep delete (as section_drafts): saving a version removes the draft.
revoke truncate on public.book_part_drafts from authenticated;
-- Also by keeps insert and delete for set_also_by (SECURITY INVOKER); the
-- guard refuses any direct write.
revoke update, truncate on public.book_also_by from authenticated;
revoke insert, delete, truncate on public.part_suggestions from authenticated;

-- ---------------------------------------------------------------------------
-- 1.7 Guards. SECURITY INVOKER. The service role bypasses RLS, so every guard
--     checks the owner itself.
-- ---------------------------------------------------------------------------
create or replace function public.book_parts_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old uuid;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.books b where b.id = new.book_id and b.user_id = new.user_id) then
      raise exception 'part_owner'
        using errcode = 'P0001',
              detail = 'A book part belongs to the owner of its book.';
    end if;
  else
    v_old := old.current_version_id;
    if new.id is distinct from old.id or new.book_id is distinct from old.book_id
       or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
       or new.created_at is distinct from old.created_at
       or (current_user in ('anon', 'authenticated') and new.updated_at is distinct from old.updated_at) then
      raise exception 'part_fixed'
        using errcode = 'P0001',
              detail = 'Only a part''s on or off and its status can change.';
    end if;
  end if;
  if new.current_version_id is not distinct from v_old then
    return new;
  end if;
  if new.current_version_id is null then
    -- Only when the version is gone (on delete set null during a cascade).
    if exists (select 1 from public.book_part_versions v where v.id = v_old)
       and current_user in ('anon', 'authenticated')
       and coalesce(current_setting('kdp.part_write', true), '') <> 'on' then
      raise exception 'part_versions_rpc_only'
        using errcode = '42501',
              detail = 'The current version changes only through the part version functions.';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.book_part_versions v
                  where v.id = new.current_version_id and v.part_id = new.id) then
    raise exception 'version_other_part'
      using errcode = 'P0001',
            detail = 'The current version must be a version of this part.';
  end if;
  if current_user in ('anon', 'authenticated')
     and coalesce(current_setting('kdp.part_write', true), '') <> 'on' then
    raise exception 'part_versions_rpc_only'
      using errcode = '42501',
            detail = 'The current version changes only through the part version functions.';
  end if;
  return new;
end;
$$;

comment on function public.book_parts_guard() is
  'Trigger (E17): book, owner and kind never change (P0001 "part_fixed"); user_id is the book''s owner (P0001 "part_owner"); current_version_id changes only through the part RPCs (42501 "part_versions_rpc_only"), to a version of this part (P0001 "version_other_part").';

create trigger book_parts_guard
  before insert or update on public.book_parts
  for each row execute function public.book_parts_guard();

create trigger book_parts_set_updated_at
  before update on public.book_parts
  for each row execute function public.set_updated_at();

create or replace function public.book_part_versions_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kind text;
begin
  if current_user in ('anon', 'authenticated') then
    if not ((coalesce(current_setting('kdp.part_write', true), '') = 'on'
             and new.source in ('manual', 'restore', 'bio_copy'))
            or (coalesce(current_setting('kdp.part_suggestion_apply', true), '') = 'on'
                and new.source in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom'))) then
      raise exception 'part_versions_rpc_only'
        using errcode = '42501',
              detail = 'Save a part with save_part_version(), restore_part_version() or apply_part_suggestion().';
    end if;
  end if;
  select p.kind into v_kind from public.book_parts p where p.id = new.part_id and p.user_id = new.user_id;
  if not found then
    raise exception 'version_owner'
      using errcode = 'P0001',
            detail = 'A version belongs to the owner of its part.';
  end if;
  if v_kind in ('review_request', 'also_by') then
    raise exception 'part_no_text'
      using errcode = 'P0001',
            detail = 'This part has no text.';
  end if;
  if v_kind = 'epigraph' and char_length(new.content) > 1000 then
    raise exception 'part_too_long'
      using errcode = 'P0001',
            detail = 'An epigraph holds at most 1,000 characters.';
  end if;
  new.word_count := public.md_word_count(new.content);
  return new;
end;
$$;

comment on function public.book_part_versions_guard() is
  'Trigger (E17): browsers insert part versions only through the part RPCs (42501 "part_versions_rpc_only"); user_id is the part''s owner (P0001 "version_owner"); text parts only ("part_no_text"); epigraph at most 1,000 characters ("part_too_long"); word_count from md_word_count.';

create trigger book_part_versions_guard
  before insert on public.book_part_versions
  for each row execute function public.book_part_versions_guard();

create or replace function public.book_part_drafts_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.part_id is distinct from old.part_id or new.user_id is distinct from old.user_id) then
    raise exception 'draft_owner'
      using errcode = 'P0001',
            detail = 'A draft stays with its part.';
  end if;
  -- On insert only: a cascade that nulls base_version_id may run after the
  -- part is gone.
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.book_parts p where p.id = new.part_id and p.user_id = new.user_id) then
      raise exception 'draft_owner'
        using errcode = '42501',
              detail = 'A draft belongs to the owner of its part.';
    end if;
    if exists (select 1 from public.book_parts p where p.id = new.part_id and p.kind in ('review_request', 'also_by')) then
      raise exception 'part_no_text'
        using errcode = 'P0001',
              detail = 'This part has no text.';
    end if;
  end if;
  if char_length(new.content) > 1000
     and exists (select 1 from public.book_parts p where p.id = new.part_id and p.kind = 'epigraph') then
    raise exception 'part_too_long'
      using errcode = 'P0001',
            detail = 'An epigraph holds at most 1,000 characters.';
  end if;
  if new.base_version_id is not null
     and not exists (select 1 from public.book_part_versions v
                      where v.id = new.base_version_id and v.part_id = new.part_id) then
    raise exception 'version_other_part'
      using errcode = 'P0001',
            detail = 'A draft starts from a version of its own part.';
  end if;
  new.saved_at := now();
  return new;
end;
$$;

comment on function public.book_part_drafts_guard() is
  'Trigger (E17): a draft belongs to the owner of its part and stays with it ("draft_owner"); text parts only ("part_no_text"); an epigraph draft is at most 1,000 characters ("part_too_long"); base_version_id is a version of the same part ("version_other_part"); saved_at is the server clock.';

create trigger book_part_drafts_guard
  before insert or update on public.book_part_drafts
  for each row execute function public.book_part_drafts_guard();

-- Cascades (a book delete, a ticked book delete) run as the table owner, so
-- they pass the API-role check.
create or replace function public.book_also_by_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and coalesce(current_setting('kdp.also_by_write', true), '') <> 'on' then
    raise exception 'also_by_rpc_only'
      using errcode = '42501',
            detail = 'Change the Also by list with set_also_by().';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.book_id is distinct from old.book_id or new.user_id is distinct from old.user_id) then
    raise exception 'also_by_owner'
      using errcode = 'P0001',
            detail = 'An Also by entry stays with its book and its owner.';
  end if;
  if not exists (select 1 from public.books b where b.id = new.book_id and b.user_id = new.user_id) then
    raise exception 'also_by_owner'
      using errcode = 'P0001',
            detail = 'An Also by entry belongs to the owner of its book.';
  end if;
  if new.other_book_id is not null
     and not exists (select 1 from public.books o
                      where o.id = new.other_book_id and o.user_id = new.user_id and o.id <> new.book_id) then
    raise exception 'also_by_not_allowed'
      using errcode = 'P0001',
            detail = 'Also by lists only your other books with the same pen name.';
  end if;
  return new;
end;
$$;

comment on function public.book_also_by_guard() is
  'Trigger (E17): users write the Also by list only through set_also_by() (42501 "also_by_rpc_only"); user_id is the book''s owner ("also_by_owner"); a ticked book is another book of the same user ("also_by_not_allowed"). set_also_by checks the pen name.';

create trigger book_also_by_guard
  before insert or update or delete on public.book_also_by
  for each row execute function public.book_also_by_guard();

create or replace function public.part_suggestions_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    -- Only apply_part_suggestion, only used_at and version_id, only once.
    if tg_op <> 'UPDATE'
       or coalesce(current_setting('kdp.part_suggestion_use', true), '') <> 'on'
       or old.used_at is not null
       or old.version_id is not null
       or new.used_at is null
       or (to_jsonb(new) - 'used_at' - 'version_id') <> (to_jsonb(old) - 'used_at' - 'version_id') then
      raise exception 'suggestions_server_only'
        using errcode = '42501',
              detail = 'Suggestions are written by the server. Use apply_part_suggestion() to accept one.';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  if tg_op = 'INSERT' or (new.part_id, new.user_id, new.book_id) is distinct from (old.part_id, old.user_id, old.book_id) then
    if not exists (select 1 from public.book_parts p
                    where p.id = new.part_id and p.user_id = new.user_id and p.book_id = new.book_id) then
      raise exception 'suggestion_owner'
        using errcode = 'P0001',
              detail = 'A suggestion belongs to the owner and the book of its part.';
    end if;
    if exists (select 1 from public.book_parts p
                where p.id = new.part_id and p.kind in ('epigraph', 'review_request', 'also_by')) then
      raise exception 'part_no_improve'
        using errcode = 'P0001',
              detail = 'This part has no AI suggestions.';
    end if;
  end if;
  if new.base_version_id is not null
     and (tg_op = 'INSERT' or new.base_version_id is distinct from old.base_version_id)
     and not exists (select 1 from public.book_part_versions v
                      where v.id = new.base_version_id and v.part_id = new.part_id) then
    raise exception 'version_other_part'
      using errcode = 'P0001',
            detail = 'A suggestion starts from a version of its own part.';
  end if;
  if new.version_id is not null
     and (tg_op = 'INSERT' or new.version_id is distinct from old.version_id)
     and not exists (select 1 from public.book_part_versions v
                      where v.id = new.version_id and v.part_id = new.part_id) then
    raise exception 'version_other_part'
      using errcode = 'P0001',
            detail = 'An applied suggestion links a version of its own part.';
  end if;
  return new;
end;
$$;

comment on function public.part_suggestions_guard() is
  'Trigger (E17): users only mark a suggestion used through apply_part_suggestion() (42501 "suggestions_server_only"); user_id and book_id match the part ("suggestion_owner"); never epigraph or a part with no text ("part_no_improve"); versions belong to the same part ("version_other_part"); created_at is the server clock.';

create trigger part_suggestions_guard
  before insert or update on public.part_suggestions
  for each row execute function public.part_suggestions_guard();

-- ---------------------------------------------------------------------------
-- 2. Triggers on books
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: book_parts has no insert policy (C2). It writes only the
-- 8 rows of the book that was just inserted (which passed the books policy).
create or replace function public.books_create_parts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.book_parts (user_id, book_id, kind, status)
  select new.user_id, new.id, k.kind, case when k.kind in ('review_request', 'also_by') then null else 'draft' end
    from unnest(array['dedication', 'epigraph', 'foreword', 'preface',
                      'acknowledgments', 'about_author', 'review_request', 'also_by']) k(kind);
  return null;
end;
$$;

comment on function public.books_create_parts() is
  'Trigger (E17): every new book gets its 8 book_parts rows, all off.';

create trigger books_create_parts
  after insert on public.books
  for each row execute function public.books_create_parts();

-- Q-11. The About text was written for the old pen name: it leaves the files
-- until the writer marks it Final again. Nothing is deleted.
create or replace function public.books_pen_about_draft()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.book_parts
     set status = 'draft'
   where book_id = new.id and kind = 'about_author' and status = 'final';
  return null;
end;
$$;

comment on function public.books_pen_about_draft() is
  'Trigger (E17, Q-11): a new pen name moves About the author from Final to Draft.';

create trigger books_pen_about_draft
  after update of pen_name_id on public.books
  for each row when (old.pen_name_id is distinct from new.pen_name_id)
  execute function public.books_pen_about_draft();

-- ---------------------------------------------------------------------------
-- 3. RPCs. SECURITY INVOKER, the part row locked. Caps are constants inside.
-- ---------------------------------------------------------------------------
-- Locks the caller's text part and returns its current version.
create or replace function public.part_lock(p_part_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid;
  v_kind text;
begin
  select p.current_version_id, p.kind into v_current, v_kind
    from public.book_parts p
   where p.id = p_part_id
     for update;
  if not found then
    raise exception 'part_not_found'
      using errcode = 'P0002',
            detail = 'This part does not exist, or it belongs to another account.';
  end if;
  if v_kind in ('review_request', 'also_by') then
    raise exception 'part_no_text'
      using errcode = 'P0001',
            detail = 'This part has no text.';
  end if;
  return v_current;
end;
$$;

-- The length check and the next version number (the part row is locked).
create or replace function public.part_next_version(p_part_id uuid, p_content text)
returns int
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_max int;
begin
  select case when p.kind = 'epigraph' then 1000 else 20000 end into v_max
    from public.book_parts p where p.id = p_part_id;
  if char_length(p_content) > v_max then
    raise exception 'part_too_long'
      using errcode = 'P0001',
            detail = 'This part holds at most ' || to_char(v_max, 'FM99,999') || ' characters.';
  end if;
  return coalesce((select max(v.version_no) from public.book_part_versions v where v.part_id = p_part_id), 0) + 1;
end;
$$;

create or replace function public.save_part_version(p_part_id uuid, p_content text, p_base_version_id uuid,
                                                    p_make_current boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid := public.part_lock(p_part_id);
  v_cur     public.book_part_versions;
  v_row     public.book_part_versions;
  v_new     int;
begin
  if p_content is null then
    raise exception 'bad_content'
      using errcode = '22023',
            detail = 'Send the part text.';
  end if;
  if v_current is null and public.text_is_blank(p_content) then
    raise exception 'empty_first_version'
      using errcode = 'P0001',
            detail = 'There is no text to save yet.';
  end if;

  if p_make_current then
    if v_current is distinct from p_base_version_id then
      raise exception 'version_conflict'
        using errcode = 'P0001',
              detail = 'This part was saved in another tab.';
    end if;
    select * into v_cur from public.book_part_versions v where v.id = v_current;
    if found and v_cur.content = p_content then
      delete from public.book_part_drafts d where d.part_id = p_part_id;
      return jsonb_build_object('id', v_cur.id, 'version_no', v_cur.version_no, 'word_count', v_cur.word_count,
                                'created_at', v_cur.created_at, 'created', false);
    end if;
  end if;

  v_new := public.part_next_version(p_part_id, p_content);
  perform set_config('kdp.part_write', 'on', true);
  insert into public.book_part_versions (user_id, part_id, version_no, content, source)
  select p.user_id, p.id, v_new, p_content, 'manual'
    from public.book_parts p where p.id = p_part_id
  returning * into v_row;
  if p_make_current then
    update public.book_parts set current_version_id = v_row.id where id = p_part_id;
  end if;
  perform set_config('kdp.part_write', '', true);
  delete from public.book_part_drafts d where d.part_id = p_part_id;
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.save_part_version(uuid, text, uuid, boolean) is
  'E17: save a part''s text as a new manual version (made current unless p_make_current is false) and delete its draft. The status does not change. Raises P0001 version_conflict, empty_first_version, part_too_long, part_no_text; P0002 part_not_found.';

create or replace function public.restore_part_version(p_part_id uuid, p_version_id uuid, p_base_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid := public.part_lock(p_part_id);
  v_old     public.book_part_versions;
  v_cur     text;
  v_draft   text;
  v_row     public.book_part_versions;
  v_new     int;
begin
  if v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This part was saved in another tab.';
  end if;
  select * into v_old from public.book_part_versions v where v.id = p_version_id and v.part_id = p_part_id;
  if not found then
    raise exception 'version_not_found'
      using errcode = 'P0002',
            detail = 'This version does not exist in this part.';
  end if;
  -- Typed text is never lost: the browser saves the draft first.
  select v.content into v_cur from public.book_part_versions v where v.id = v_current;
  select d.content into v_draft from public.book_part_drafts d where d.part_id = p_part_id;
  if v_draft is not null and v_draft is distinct from coalesce(v_cur, '') then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed before you restore.';
  end if;
  delete from public.book_part_drafts d where d.part_id = p_part_id;

  v_new := public.part_next_version(p_part_id, v_old.content);
  perform set_config('kdp.part_write', 'on', true);
  insert into public.book_part_versions (user_id, part_id, version_no, content, source, label)
  select p.user_id, p.id, v_new, v_old.content, 'restore',
         case when v_old.partial then 'Kept partial text from v' else 'Restored from v' end || v_old.version_no
    from public.book_parts p where p.id = p_part_id
  returning * into v_row;
  update public.book_parts set current_version_id = v_row.id where id = p_part_id;
  perform set_config('kdp.part_write', '', true);
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.restore_part_version(uuid, uuid, uuid) is
  'E17: restore an older part version as a new current ''restore'' version. Nothing is overwritten. Raises P0001 version_conflict, unsaved_draft; P0002 part_not_found, version_not_found.';

create or replace function public.copy_bio_to_about(p_book_id uuid, p_base_version_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_part    uuid;
  v_current uuid;
  v_cur     public.book_part_versions;
  v_row     public.book_part_versions;
  v_draft   text;
  v_bio     text;
  v_new     int;
begin
  select p.id into v_part from public.book_parts p where p.book_id = p_book_id and p.kind = 'about_author';
  if not found then
    raise exception 'part_not_found'
      using errcode = 'P0002',
            detail = 'This part does not exist, or it belongs to another account.';
  end if;
  v_current := public.part_lock(v_part);
  if v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This part was saved in another tab.';
  end if;
  select pn.bio_text into v_bio
    from public.books b join public.pen_names pn on pn.id = b.pen_name_id
   where b.id = p_book_id;
  if public.text_is_blank(v_bio) then
    raise exception 'bio_empty'
      using errcode = 'P0001',
            detail = 'The pen name of this book has no bio yet.';
  end if;

  -- Typed text first becomes a version of its own (not made current).
  select * into v_cur from public.book_part_versions v where v.id = v_current;
  select d.content into v_draft from public.book_part_drafts d where d.part_id = v_part;
  if not public.text_is_blank(v_draft) and v_draft is distinct from coalesce(v_cur.content, '') then
    perform public.save_part_version(v_part, v_draft, v_current, false);
  end if;
  delete from public.book_part_drafts d where d.part_id = v_part;

  if v_cur.content = v_bio then
    return jsonb_build_object('id', v_cur.id, 'version_no', v_cur.version_no, 'word_count', v_cur.word_count,
                              'created_at', v_cur.created_at, 'created', false);
  end if;
  v_new := public.part_next_version(v_part, v_bio);
  perform set_config('kdp.part_write', 'on', true);
  insert into public.book_part_versions (user_id, part_id, version_no, content, source)
  select p.user_id, p.id, v_new, v_bio, 'bio_copy'
    from public.book_parts p where p.id = v_part
  returning * into v_row;
  update public.book_parts set current_version_id = v_row.id where id = v_part;
  perform set_config('kdp.part_write', '', true);
  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'created', true);
end;
$$;

comment on function public.copy_bio_to_about(uuid, uuid) is
  'E17: copy the pen name bio into About the author as a new current ''bio_copy'' version; unsaved typed text becomes a manual version first. Raises P0001 version_conflict, bio_empty, part_too_long; P0002 part_not_found.';

create or replace function public.apply_part_suggestion(p_suggestion_id uuid, p_base_version_id uuid, p_full_text text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s          public.part_suggestions;
  v_current  uuid;
  v_base     public.book_part_versions;
  v_draft    text;
  v_from     int := 1;
  v_at       int;
  v_ok       boolean := false;
  v_row      public.book_part_versions;
  v_new      int;
begin
  if p_full_text is null then
    raise exception 'bad_content'
      using errcode = '22023',
            detail = 'Send the part text.';
  end if;

  -- 1. Read through RLS: another user's suggestion reads as missing.
  select * into s from public.part_suggestions x where x.id = p_suggestion_id;
  if not found then
    raise exception 'suggestion_not_found'
      using errcode = 'P0002',
            detail = 'This suggestion does not exist, or it belongs to another account.';
  end if;

  -- 2. Lock the part, then read the suggestion again under the lock.
  v_current := public.part_lock(s.part_id);
  select * into s from public.part_suggestions x where x.id = p_suggestion_id for update;
  if not found then
    raise exception 'suggestion_not_found'
      using errcode = 'P0002',
            detail = 'This suggestion does not exist, or it belongs to another account.';
  end if;

  -- 3. Once, within 1 hour (as 0021).
  if s.used_at is not null then
    raise exception 'suggestion_used'
      using errcode = 'P0001',
            detail = 'This suggestion was already applied.';
  end if;
  if s.created_at < now() - interval '1 hour' then
    raise exception 'suggestion_expired'
      using errcode = 'P0001',
            detail = 'This suggestion is too old. Ask again.';
  end if;

  -- 4. The base: a version of this part, not older than the suggestion's base,
  -- and the current version.
  select * into v_base from public.book_part_versions v where v.id = p_base_version_id and v.part_id = s.part_id;
  if not found
     or v_base.version_no < coalesce((select v.version_no from public.book_part_versions v where v.id = s.base_version_id), 0)
     or v_current is distinct from p_base_version_id then
    raise exception 'version_conflict'
      using errcode = 'P0001',
            detail = 'This part was saved in another tab.';
  end if;

  -- 5. Typed text is never lost.
  select d.content into v_draft from public.book_part_drafts d where d.part_id = s.part_id;
  if not public.text_is_blank(v_draft) and v_draft is distinct from v_base.content then
    raise exception 'unsaved_draft'
      using errcode = 'P0001',
            detail = 'Save the text you typed first.';
  end if;

  -- 6. Only the passage changed (as 0021).
  if char_length(p_full_text) - char_length(s.output) = char_length(v_base.content) - char_length(s.selection) then
    loop
      v_at := strpos(substr(p_full_text, v_from), s.output);
      exit when v_at = 0;
      v_at := v_from + v_at - 1;
      if substr(v_base.content, v_at, char_length(s.selection)) = s.selection
         and left(p_full_text, v_at - 1) || s.selection || substr(p_full_text, v_at + char_length(s.output)) = v_base.content then
        v_ok := true;
        exit;
      end if;
      v_from := v_at + 1;
    end loop;
  end if;
  if not v_ok then
    raise exception 'suggestion_mismatch'
      using errcode = 'P0001',
            detail = 'The text does not match this suggestion.';
  end if;

  -- 7. The version (source = the action), made current. The status stays.
  v_new := public.part_next_version(s.part_id, p_full_text);
  perform set_config('kdp.part_suggestion_apply', 'on', true);
  insert into public.book_part_versions (user_id, part_id, version_no, content, source)
  select p.user_id, p.id, v_new, p_full_text, s.action
    from public.book_parts p where p.id = s.part_id
  returning * into v_row;
  perform set_config('kdp.part_suggestion_apply', '', true);

  perform set_config('kdp.part_write', 'on', true);
  update public.book_parts set current_version_id = v_row.id where id = s.part_id;
  perform set_config('kdp.part_write', '', true);

  delete from public.book_part_drafts d where d.part_id = s.part_id;

  perform set_config('kdp.part_suggestion_use', 'on', true);
  update public.part_suggestions set used_at = now(), version_id = v_row.id where id = s.id;
  perform set_config('kdp.part_suggestion_use', '', true);

  return jsonb_build_object('id', v_row.id, 'version_no', v_row.version_no, 'word_count', v_row.word_count,
                            'created_at', v_row.created_at, 'source', v_row.source);
end;
$$;

comment on function public.apply_part_suggestion(uuid, uuid, text) is
  'E17: accept an Improve suggestion on a part: a new current version with source = the action, the draft deleted, the suggestion used. Raises P0002 suggestion_not_found, part_not_found; P0001 suggestion_used, suggestion_expired, version_conflict, unsaved_draft, suggestion_mismatch, part_too_long.';

-- The Also by list in print order, with the titles of today and "valid": the
-- one read rule. A typed title is always valid; a ticked book only while it is
-- the same user's, with the same pen name, and not the book itself.
create or replace function public.also_by_entries(p_book_id uuid)
returns table (list_position int, other_book_id uuid, title text, subtitle text, valid boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.position,
         a.other_book_id,
         case when a.other_book_id is null then a.title else o.title end,
         case when a.other_book_id is null then a.subtitle else o.subtitle end,
         a.other_book_id is null
           or coalesce(b.pen_name_id is not null and o.pen_name_id = b.pen_name_id
                       and o.user_id = b.user_id and o.id <> b.id, false)
    from public.book_also_by a
    join public.books b on b.id = a.book_id
    left join public.books o on o.id = a.other_book_id
   where a.book_id = p_book_id
   order by a.position
$$;

comment on function public.also_by_entries(uuid) is
  'E17: a book''s Also by list in print order with today''s titles and whether each entry is still valid. Under the caller''s RLS.';

create or replace function public.book_parts_json(p_book_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'kind', p.kind,
               'enabled', p.enabled,
               'status', p.status,
               'version_id', p.current_version_id,
               'version_no', v.version_no,
               'words', coalesce(v.word_count, 0),
               'has_draft', coalesce(btrim(d.content) <> btrim(coalesce(v.content, '')), false))
             order by public.part_kind_ord(p.kind))
        from public.book_parts p
        left join public.book_part_versions v on v.id = p.current_version_id
        left join public.book_part_drafts d on d.part_id = p.id
       where p.book_id = b.id), '[]'::jsonb),
    'also_by', coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', e.list_position,
               'book_id', e.other_book_id,
               'title', e.title,
               'subtitle', e.subtitle,
               'valid', e.valid) order by e.list_position)
        from public.also_by_entries(b.id) e), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'subtitle', o.subtitle) order by o.created_at, o.id)
        from public.books o
       where b.pen_name_id is not null
         and o.pen_name_id = b.pen_name_id
         and o.user_id = b.user_id
         and o.id <> b.id
         and not exists (select 1 from public.book_also_by a where a.book_id = b.id and a.other_book_id = o.id)), '[]'::jsonb),
    'now', now())
  from public.books b
  where b.id = p_book_id
$$;

comment on function public.book_parts_json(uuid) is
  'E17: one read for 06, 07 and 08: the 8 parts (on, status, words, version, unsaved draft), the Also by list and the books that can still be ticked. Null when the book is not the caller''s.';

-- Replaces the whole list in one step. p_entries: an array of
-- {"book_id": uuid} or {"title": text, "subtitle": text}.
create or replace function public.set_also_by(p_book_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_max_entries  constant int := 20;
  c_max_title    constant int := 200;
  c_max_subtitle constant int := 200;
  c_space        constant text := E' \t\n\r\f\u000B';
  v_user  uuid;
  v_pen   uuid;
  v_old   uuid[];
  v_new   uuid[] := '{}';
  v_id    uuid;
  v_title text;
  v_sub   text;
  r       record;
begin
  select p.user_id into v_user
    from public.book_parts p
   where p.book_id = p_book_id and p.kind = 'also_by'
     for update;
  if not found then
    raise exception 'book_not_found'
      using errcode = 'P0002',
            detail = 'This book does not exist, or it belongs to another account.';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'also_by_bad' using errcode = '22023', detail = 'Send the list of books.';
  end if;
  if jsonb_array_length(p_entries) > c_max_entries then
    raise exception 'also_by_bad' using errcode = '22023', detail = 'Also by lists at most 20 books.';
  end if;
  select b.pen_name_id into v_pen from public.books b where b.id = p_book_id;
  -- A book ticked before stays allowed (it is hidden at read time when its pen
  -- name no longer matches). Only newly ticked books must match.
  v_old := array(select a.other_book_id from public.book_also_by a
                  where a.book_id = p_book_id and a.other_book_id is not null);

  perform set_config('kdp.also_by_write', 'on', true);
  delete from public.book_also_by a where a.book_id = p_book_id;
  for r in select x.e, x.n from jsonb_array_elements(p_entries) with ordinality x(e, n) order by x.n loop
    if jsonb_typeof(r.e) <> 'object' then
      raise exception 'also_by_bad' using errcode = '22023', detail = 'Each entry is a book or a typed title.';
    end if;
    if r.e ? 'book_id' then
      if r.e - 'book_id' <> '{}'::jsonb or not public.qc_uuid_ok(r.e -> 'book_id') then
        raise exception 'also_by_bad' using errcode = '22023', detail = 'A ticked entry has a book only.';
      end if;
      v_id := (r.e ->> 'book_id')::uuid;
      if v_id = any (v_new) then
        raise exception 'also_by_bad' using errcode = '22023', detail = 'A book is listed once.';
      end if;
      v_new := v_new || v_id;
      if not (v_id = any (v_old))
         and not exists (select 1 from public.books o
                          where o.id = v_id and o.user_id = v_user and o.id <> p_book_id
                            and v_pen is not null and o.pen_name_id = v_pen) then
        raise exception 'also_by_not_allowed'
          using errcode = 'P0001',
                detail = 'Also by lists only your other books with the same pen name.';
      end if;
      insert into public.book_also_by (book_id, user_id, position, other_book_id)
      values (p_book_id, v_user, r.n, v_id);
    else
      if r.e - 'title' - 'subtitle' <> '{}'::jsonb
         or jsonb_typeof(r.e -> 'title') is distinct from 'string'
         or coalesce(jsonb_typeof(r.e -> 'subtitle'), 'null') not in ('string', 'null') then
        raise exception 'also_by_bad' using errcode = '22023', detail = 'A typed entry has a title and can have a subtitle.';
      end if;
      v_title := btrim(r.e ->> 'title', c_space);
      v_sub := nullif(btrim(coalesce(r.e ->> 'subtitle', ''), c_space), '');
      if char_length(v_title) not between 1 and c_max_title then
        raise exception 'also_by_bad' using errcode = '22023', detail = 'A title has 1 to 200 characters.';
      end if;
      if char_length(v_sub) > c_max_subtitle then
        raise exception 'also_by_bad' using errcode = '22023', detail = 'A subtitle has at most 200 characters.';
      end if;
      insert into public.book_also_by (book_id, user_id, position, title, subtitle)
      values (p_book_id, v_user, r.n, v_title, v_sub);
    end if;
  end loop;
  perform set_config('kdp.also_by_write', '', true);
  return public.book_parts_json(p_book_id) -> 'also_by';
end;
$$;

comment on function public.set_also_by(uuid, jsonb) is
  'E17: replace a book''s Also by list (at most 20: ticked books with the same pen name, or typed titles). Returns the new list. Raises P0002 book_not_found; 22023 also_by_bad; P0001 also_by_not_allowed.';

-- ---------------------------------------------------------------------------
-- 4. Backfill, then the touch triggers
-- ---------------------------------------------------------------------------
-- 8 parts per existing book; About and Also by on as in 08.
insert into public.book_parts (user_id, book_id, kind, enabled, status)
select b.user_id, b.id, k.kind,
       case k.kind
         when 'about_author' then coalesce((f.parts ->> 'about')::boolean, false)
         when 'also_by' then coalesce((f.parts ->> 'also_by')::boolean, false)
         else false
       end,
       case when k.kind in ('review_request', 'also_by') then null else 'draft' end
  from public.books b
  left join public.book_formats f on f.book_id = b.id
 cross join unnest(array['dedication', 'epigraph', 'foreword', 'preface',
                         'acknowledgments', 'about_author', 'review_request', 'also_by']) k(kind);

-- Also by: every listed book that still exists (a deleted book's id can stay in
-- the old array; it has nothing to point to).
insert into public.book_also_by (book_id, user_id, position, other_book_id)
select f.book_id, b.user_id, u.o, u.x
  from public.book_formats f
  join public.books b on b.id = f.book_id
 cross join lateral unnest(f.also_by) with ordinality u(x, o)
  join public.books ob on ob.id = u.x and ob.user_id = b.user_id and ob.id <> b.id;

-- Q-1: a book with About on gets the pen name bio as its Final About text.
with seeded as (
  insert into public.book_part_versions (user_id, part_id, version_no, content, source)
  select p.user_id, p.id, 1, pn.bio_text, 'bio_copy'
    from public.book_parts p
    join public.books b on b.id = p.book_id
    join public.pen_names pn on pn.id = b.pen_name_id
   where p.kind = 'about_author' and p.enabled and coalesce(pn.bio_text, '') <> ''
  returning id, part_id
)
update public.book_parts p
   set current_version_id = s.id, status = 'final'
  from seeded s
 where p.id = s.part_id;

-- A part or Also by change moves the book to the top of Books (0009). Made
-- after the backfill, so the backfill moves no book. Not on insert of a part:
-- the rows are made with the book.
create trigger book_parts_touch_book
  after update on public.book_parts
  for each row execute function public.touch_book_from_child();

create trigger book_also_by_touch_book
  after insert or delete on public.book_also_by
  for each row execute function public.touch_book_from_child();

-- ---------------------------------------------------------------------------
-- 5. What goes in the files
-- ---------------------------------------------------------------------------
-- The one rule for "in the file": on, and a Final text part with text, or the
-- review request page, or Also by with at least one valid entry.
create or replace function public.part_file_list(p_book_id uuid)
returns table (ord bigint, kind text, version_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select row_number() over (order by public.part_kind_ord(p.kind)), p.kind, p.current_version_id
    from public.book_parts p
    left join public.book_part_versions v on v.id = p.current_version_id
   where p.book_id = p_book_id
     and p.enabled
     and ((p.status = 'final' and not public.text_is_blank(v.content))
          or p.kind = 'review_request'
          or (p.kind = 'also_by' and exists (select 1 from public.also_by_entries(p.book_id) e where e.valid)))
   order by public.part_kind_ord(p.kind)
$$;

comment on function public.part_file_list(uuid) is
  'E17: the parts in the files, in book order (version_id null for the review request page and Also by). Under the caller''s RLS.';

-- The key addition for the six parts that are new in E17. {} when none is on,
-- so the keys of every other book stay as before.
create or replace function public.part_key_extra(p_book_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('book_parts',
             jsonb_agg(jsonb_build_array(p.kind, p.enabled, x.version_id) order by public.part_kind_ord(p.kind)))
      from public.book_parts p
      left join public.part_file_list(p_book_id) x on x.kind = p.kind
     where p.book_id = p_book_id
       and p.enabled
       and p.kind not in ('about_author', 'also_by')
    having count(*) > 0), '{}'::jsonb)
$$;

comment on function public.part_key_extra(uuid) is
  'E17: the book_parts entry of format_key and epub_key: [kind, on, version in the file] for each new part that is on; {} when none is.';

-- The About text the "changed" mark of a DOCX compares: the part's current
-- text, or the pen name bio while the part has none.
create or replace function public.about_text(p_book_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(v.content, pn.bio_text, '')
    from public.books b
    left join public.pen_names pn on pn.id = b.pen_name_id
    left join public.book_parts p on p.book_id = b.id and p.kind = 'about_author'
    left join public.book_part_versions v on v.id = p.current_version_id
   where b.id = p_book_id
$$;

comment on function public.about_text(uuid) is
  'E17: About the author''s current text, or the pen name bio while the part has no version.';

-- The part list an export snapshot keeps: [[kind, version_id], …].
-- p_about false: a DOCX made without About the author.
create or replace function public.export_part_list(p_book_id uuid, p_about boolean)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_array(x.kind, x.version_id) order by x.ord), '[]'::jsonb)
    from public.part_file_list(p_book_id) x
   where x.kind <> 'about_author' or coalesce(p_about, false)
$$;

comment on function public.export_part_list(uuid, boolean) is
  'E17: [[kind, version_id]] of the parts in a file, for book_exports.snapshot and export_badges.';

-- The parts with their text, for the file builders.
create or replace function public.book_parts_files(p_book_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('kind', x.kind, 'version_id', x.version_id, 'content', v.content)
           || case when x.kind = 'also_by' then jsonb_build_object('entries', (
                     select jsonb_agg(jsonb_build_object('title', e.title, 'subtitle', e.subtitle) order by e.list_position)
                       from public.also_by_entries(p_book_id) e where e.valid))
                   else '{}'::jsonb end
           order by x.ord), '[]'::jsonb)
    from public.part_file_list(p_book_id) x
    left join public.book_part_versions v on v.id = x.version_id
$$;

comment on function public.book_parts_files(uuid) is
  'E17: the parts in the files with their Final text (Also by with its valid entries), in book order.';

-- ---------------------------------------------------------------------------
-- 6. Replaced functions
-- ---------------------------------------------------------------------------
-- 6.1 format_key (0027). Changed: "parts" is built key by key, about and
-- also_by from book_parts; also_by lists [id, title] from book_also_by (no
-- subtitle); bio_md5 is of the Final About text; part_key_extra is added.
create or replace function public.format_key(p_book_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5((jsonb_build_object(
           'style', f.style,
           'parts', jsonb_build_object(
                      'title', f.parts -> 'title',
                      'copyright', f.parts -> 'copyright',
                      'contents', f.parts -> 'contents',
                      'intro', f.parts -> 'intro',
                      'conclusion', f.parts -> 'conclusion',
                      'about', coalesce(ab.enabled, false),
                      'also_by', coalesce(al.enabled, false)),
           'contents_sections', f.contents_sections,
           'chapter_label', f.chapter_label,
           'drop_cap', f.drop_cap,
           'recto_start', f.recto_start,
           'running_header', f.running_header,
           'header_title', case when f.running_header then f.header_title end,
           'isbn', f.isbn,
           'also_by', case when al.enabled then coalesce((
                        select jsonb_agg(jsonb_build_array(e.other_book_id, e.title) order by e.list_position)
                          from public.also_by_entries(b.id) e where e.valid), '[]'::jsonb) end,
           'title', b.title,
           'subtitle', b.subtitle,
           'pen_name', p.name,
           'trim', br.trim_size,
           'bio_md5', case when ab.enabled then md5(coalesce((
                        select v.content from public.part_file_list(b.id) x
                          join public.book_part_versions v on v.id = x.version_id
                         where x.kind = 'about_author'), '')) end,
           'sections', coalesce((
             select jsonb_agg(jsonb_build_array(x.chapter_id, x.chapter_kind, x.chapter_title,
                                                x.section_id, x.section_title, x.version_id) order by x.ord)
               from public.pdf_sections(b.id) x), '[]'::jsonb))
         || public.part_key_extra(b.id))::text)
    from public.books b
    join public.book_formats f on f.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
    left join public.book_parts ab on ab.book_id = b.id and ab.kind = 'about_author'
    left join public.book_parts al on al.book_id = b.id and al.kind = 'also_by'
   where b.id = p_book_id
$$;

comment on function public.format_key(uuid) is
  'E13.1, E17: md5 of every input that changes the Print PDF. Null without a format row. The only "changed since export" rule (pdf_marks, the book_exports guard).';

-- 6.2 epub_key (0034). The same changes as format_key.
create or replace function public.epub_key(p_book_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5((jsonb_build_object(
           'style', f.style,
           'parts', jsonb_build_object(
                      'intro', f.parts -> 'intro',
                      'conclusion', f.parts -> 'conclusion',
                      'about', coalesce(ab.enabled, false),
                      'also_by', coalesce(al.enabled, false)),
           'contents_sections', f.contents_sections,
           'chapter_label', f.chapter_label,
           'also_by', case when al.enabled then coalesce((
                        select jsonb_agg(jsonb_build_array(e.other_book_id, e.title) order by e.list_position)
                          from public.also_by_entries(b.id) e where e.valid), '[]'::jsonb) end,
           'title', b.title,
           'subtitle', b.subtitle,
           'pen_name', p.name,
           'bio_md5', case when ab.enabled then md5(coalesce((
                        select v.content from public.part_file_list(b.id) x
                          join public.book_part_versions v on v.id = x.version_id
                         where x.kind = 'about_author'), '')) end,
           'sections', coalesce((
             select jsonb_agg(jsonb_build_array(x.chapter_id, x.chapter_kind, x.chapter_title,
                                                x.section_id, x.section_title, x.version_id) order by x.ord)
               from public.pdf_sections(b.id) x), '[]'::jsonb))
         || public.part_key_extra(b.id))::text)
    from public.books b
    join public.book_formats f on f.book_id = b.id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_parts ab on ab.book_id = b.id and ab.kind = 'about_author'
    left join public.book_parts al on al.book_id = b.id and al.kind = 'also_by'
   where b.id = p_book_id
$$;

-- 6.3 book_exports_guard (0034). Changed only where marked E17.
create or replace function public.book_exports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_book public.books%rowtype;
  v_fmt public.book_formats%rowtype;
  v_pen text;
  v_trim text;
  v_about boolean;
  v_parts jsonb;
begin
  select b.user_id into v_owner from public.books b where b.id = new.book_id;
  -- A book that does not exist: the foreign key (23503) refuses the row.
  -- Another user's book, for a signed-in caller: the insert policy (42501)
  -- refuses the row, as if the book did not exist. Nothing is read or locked.
  if v_owner is null or (v_owner <> (select auth.uid()) and (select auth.uid()) is not null) then
    return new;
  end if;
  -- a. The book's owner (the service role bypasses RLS, so it is checked here).
  if v_owner <> new.user_id then
    raise exception 'export_owner'
      using errcode = 'P0001',
            detail = 'An export belongs to the owner of its book.';
  end if;
  -- d. One export at a time per book (the book row is locked). A format edit
  -- touches the book row (0009 touch), so it waits too.
  select * into v_book from public.books b where b.id = new.book_id for update;
  -- b. Every version: a version of a section of this book, the same owner, no repeats.
  -- (A wrong shape is left to the table checks, which run after this trigger.)
  if new.versions is not null and cardinality(new.versions) > 0 and array_position(new.versions, null) is null
     and ((select count(distinct x) from unnest(new.versions) x) <> cardinality(new.versions)
          or (select count(*)
                from public.section_versions v
                join public.sections s on s.id = v.section_id
                join public.chapters c on c.id = s.chapter_id
               where v.id = any (new.versions)
                 and c.book_id = new.book_id
                 and v.user_id = new.user_id) <> cardinality(new.versions)) then
    raise exception 'export_version_not_in_book'
      using errcode = 'P0001',
            detail = 'Every exported version must belong to a section of this book.';
  end if;
  -- E17. About on or off comes from book_parts.
  v_about := coalesce((select p.enabled from public.book_parts p
                        where p.book_id = new.book_id and p.kind = 'about_author'), false);
  -- E13.1. A Print PDF: built from today's settings and today's Final sections.
  if new.format = 'pdf' then
    select * into v_fmt from public.book_formats f where f.book_id = new.book_id;
    if not found then
      raise exception 'format_missing'
        using errcode = 'P0001',
              detail = 'Open 08 Format before you export a Print PDF.';
    end if;
    if new.include is distinct from 'final' then
      raise exception 'export_pdf_final'
        using errcode = 'P0001',
              detail = 'A Print PDF has Final sections only.';
    end if;
    if new.settings_key is distinct from public.format_key(new.book_id) then
      raise exception 'export_stale'
        using errcode = 'P0001',
              detail = 'Your book changed while the PDF was made. Make it again.';
    end if;
    if new.versions is distinct from public.pdf_version_ids(new.book_id) then
      raise exception 'export_pdf_versions'
        using errcode = 'P0001',
              detail = 'A Print PDF has exactly the Final sections of the book, in order.';
    end if;
    -- The parts come from the database, never from the browser.
    new.parts := (v_fmt.parts - 'also_by') || jsonb_build_object('about', v_about);   -- E17
  end if;
  -- E13.3. An EPUB: built from today's EPUB settings and today's Final sections.
  if new.format = 'epub' then
    select * into v_fmt from public.book_formats f where f.book_id = new.book_id;
    if not found then
      raise exception 'format_missing'
        using errcode = 'P0001',
              detail = 'Open 08 Format before you export an EPUB.';
    end if;
    if new.include is distinct from 'final' then
      raise exception 'export_epub_final'
        using errcode = 'P0001',
              detail = 'An EPUB has Final sections only.';
    end if;
    if new.settings_key is distinct from public.epub_key(new.book_id) then
      raise exception 'export_stale'
        using errcode = 'P0001',
              detail = 'Your book changed while the EPUB was made. Make it again.';
    end if;
    if new.versions is distinct from public.pdf_version_ids(new.book_id) then
      raise exception 'export_epub_versions'
        using errcode = 'P0001',
              detail = 'An EPUB has exactly the Final sections of the book, in order.';
    end if;
    -- The parts come from the database, never from the browser. The contents
    -- is always on in an EPUB (KDP needs it).
    new.parts := (v_fmt.parts - 'also_by')
                 || jsonb_build_object('about', v_about, 'contents', true);           -- E17
  end if;
  -- c. The snapshot, from the database.
  select p.name into v_pen from public.pen_names p where p.id = v_book.pen_name_id;
  select br.trim_size into v_trim from public.book_briefs br where br.book_id = new.book_id;
  new.snapshot := jsonb_build_object(
    'title', v_book.title,
    'subtitle', v_book.subtitle,
    'pen_name', v_pen,
    'trim', v_trim,
    'bio_md5', md5(coalesce(public.about_text(new.book_id), '')),                      -- E17
    'include', new.include,
    'parts', new.parts)
    || case when new.format = 'pdf' then jsonb_build_object('style', v_fmt.style, 'paper', v_fmt.paper) else '{}'::jsonb end;
  -- E13.3. An EPUB's snapshot adds its style (paper is print only).
  if new.format = 'epub' then
    new.snapshot := new.snapshot || jsonb_build_object('style', v_fmt.style);
  end if;
  -- E17. The book parts in this file; no key when there are none. A DOCX
  -- chooses About in its own dialog.
  v_parts := public.export_part_list(new.book_id,
               new.format <> 'docx' or coalesce(new.parts -> 'about' = 'true'::jsonb, false));
  if v_parts <> '[]'::jsonb then
    new.snapshot := new.snapshot || jsonb_build_object('book_parts', v_parts);
  end if;
  -- d. Keep the newest 19 older rows of this format, so the book has at most
  -- 20 per format with this one.
  delete from public.book_exports e
   where e.book_id = new.book_id
     and e.format = new.format
     and e.user_id = new.user_id
     and e.id not in (select e2.id from public.book_exports e2
                       where e2.book_id = new.book_id
                         and e2.format = new.format
                       order by e2.created_at desc, e2.id desc
                       limit 19);
  return new;
end;
$$;

-- 6.4 export_badges (0025). Changed: About compares about_text; the parts
-- are compared too. An export made before the book had parts (before 0035)
-- has no list: only a part that did not exist then makes it "changed".
create or replace function public.export_badges()
returns table (book_id uuid, exported_at timestamptz, changed boolean)
language sql
stable
set search_path = ''
as $$
  with last as (
    select distinct on (e.book_id) e.book_id, e.created_at, e.include, e.parts, e.versions, e.snapshot
      from public.book_exports e
     where e.format = 'docx'
     order by e.book_id, e.created_at desc, e.id desc
  )
  select l.book_id,
         l.created_at,
         (b.title is distinct from l.snapshot ->> 'title')
         or (b.subtitle is distinct from l.snapshot ->> 'subtitle')
         or (p.name is distinct from l.snapshot ->> 'pen_name')
         or (br.trim_size is distinct from l.snapshot ->> 'trim')
         or ((l.parts ->> 'about')::boolean and md5(coalesce(public.about_text(b.id), '')) is distinct from l.snapshot ->> 'bio_md5')
         or (coalesce((
               select array_agg(v.id order by c.position, s.position)
                 from public.chapters c
                 join public.sections s on s.chapter_id = c.id
                 join public.section_versions v on v.id = s.current_version_id
                where c.book_id = l.book_id
                  and not public.text_is_blank(v.content)
                  and (l.include = 'all' or s.status = 'final')
                  and (c.kind = 'chapter'
                       or (c.kind = 'intro' and (l.parts ->> 'intro')::boolean)
                       or (c.kind = 'conclusion' and (l.parts ->> 'conclusion')::boolean))
             ), '{}'::uuid[]) is distinct from l.versions)
         or case
              when l.created_at >= (select min(bp.created_at) from public.book_parts bp where bp.book_id = l.book_id)
                then coalesce(l.snapshot -> 'book_parts', '[]'::jsonb)
                     is distinct from public.export_part_list(l.book_id, (l.parts ->> 'about')::boolean)
              else exists (select 1 from public.part_file_list(l.book_id) x
                            where x.kind not in ('about_author', 'also_by'))
            end
    from last l
    join public.books b on b.id = l.book_id
    left join public.pen_names p on p.id = b.pen_name_id
    left join public.book_briefs br on br.book_id = b.id
$$;

comment on function public.export_badges() is
  'E11, E17: per book, the last DOCX export time and whether the book changed since (design 24b, state 10). Under the caller''s RLS.';

-- 6.5 export_json (0028). Added: the key book_parts. Nothing else changed.
create or replace function public.export_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'book', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'subtitle', b.subtitle,
      'pen_name', p.name,
      'bio', p.bio_text,
      'trim', br.trim_size),
    'known', jsonb_build_object(
      'brief', jsonb_build_object(
        'topic_text', br.topic_text,
        'target_reader', br.target_reader,
        'reader_problem', br.reader_problem,
        'promise_draft', br.promise_draft,
        'options', coalesce(br.options, '{}'::jsonb)),
      'research', jsonb_build_object(
        'insights', (select jsonb_build_object('loves', i.loves, 'hates', i.hates, 'gaps', i.gaps)
                       from public.research_insights i where i.book_id = b.id),
        'competitors', coalesce((select jsonb_agg(jsonb_build_object('title', co.title) order by co.created_at, co.id)
                                   from public.competitors co where co.book_id = b.id), '[]'::jsonb),
        'sources', coalesce((select jsonb_agg(jsonb_build_object('kind', rs.kind, 'body', rs.body, 'citation', rs.citation) order by rs.created_at, rs.id)
                               from public.research_sources rs where rs.book_id = b.id), '[]'::jsonb))),
    'chapters', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'kind', c.kind,
               'position', c.position,
               'title', c.title,
               'objective', c.objective,
               'needs_review', c.needs_review,
               'sections', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', s.id,
                          'position', s.position,
                          'title', s.title,
                          'word_target', s.word_target,
                          'status', s.status,
                          'needs_review', s.needs_review,
                          'version', case when v.id is null then null else jsonb_build_object(
                                       'id', v.id,
                                       'version_no', v.version_no,
                                       'content', v.content,
                                       'partial', v.partial,
                                       'word_count', v.word_count) end,
                          'ai', case
                                  when exists (select 1 from public.section_versions h
                                                where h.section_id = s.id and h.source = 'generate') then 'draft'
                                  when exists (select 1 from public.section_versions h
                                                where h.section_id = s.id
                                                  and h.source in ('edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom')) then 'edits'
                                  else 'none' end,
                          'unsaved', coalesce(btrim(d.content) <> btrim(coalesce(v.content, '')), false),
                          'run', case when r.state = 'running' then jsonb_build_object(
                                   'started_at', r.started_at,
                                   'heartbeat_at', r.heartbeat_at) end)
                        order by s.position)
                   from public.sections s
                   left join public.section_versions v on v.id = s.current_version_id
                   left join public.section_drafts d on d.section_id = s.id
                   left join public.section_runs r on r.section_id = s.id
                  where s.chapter_id = c.id), '[]'::jsonb))
             order by c.position)
        from public.chapters c
       where c.book_id = b.id), '[]'::jsonb),
    'book_parts', public.book_parts_files(b.id),
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.export_json(uuid) is
  'E11, E14, E17: everything the Export dialog and 07 Quality Control read for one book, under the caller''s RLS (null when the book is not the caller''s). See 0025 for the shape; 0028 adds word_target per section; 0035 adds book_parts.';

-- 6.6 format_json (0034). Added: the key book_parts. Nothing else changed.
create or replace function public.format_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with last as (
    select e.id, e.created_at, e.page_count, e.settings_key, e.engine
      from public.book_exports e
     where e.book_id = p_book_id and e.format = 'pdf'
     order by e.created_at desc, e.id desc
     limit 1
  ), k as (
    select public.format_key(p_book_id) as key
  ), last_epub as (
    select e.id, e.created_at, e.settings_key, e.engine
      from public.book_exports e
     where e.book_id = p_book_id and e.format = 'epub'
     order by e.created_at desc, e.id desc
     limit 1
  ), ek as (
    select public.epub_key(p_book_id) as key
  )
  select jsonb_build_object(
    'book', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'subtitle', b.subtitle,
      'pen_name_id', b.pen_name_id,
      'pen_name', p.name,
      'trim', br.trim_size),
    'settings', (select to_jsonb(f) - 'user_id' from public.book_formats f where f.book_id = b.id),
    'also_by_valid', to_jsonb(public.also_by_valid(b.id)),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'subtitle', o.subtitle) order by o.created_at, o.id)
        from public.books o
       where b.pen_name_id is not null
         and o.pen_name_id = b.pen_name_id
         and o.user_id = b.user_id
         and o.id <> b.id), '[]'::jsonb),
    'key', (select k.key from k),
    'last_pdf', (select to_jsonb(l) from last l),
    'changed', (select (select k.key from k) is distinct from l.settings_key from last l),
    'epub_key', (select ek.key from ek),
    'last_epub', (select to_jsonb(l) from last_epub l),
    'epub_changed', (select (select ek.key from ek) is distinct from l.settings_key from last_epub l),
    'book_parts', public.book_parts_files(b.id),
    'now', now())
  from public.books b
  left join public.pen_names p on p.id = b.pen_name_id
  left join public.book_briefs br on br.book_id = b.id
  where b.id = p_book_id
$$;

comment on function public.format_json(uuid) is
  'E13.1, E13.3, E17: everything 08 Format reads besides export_json, under the caller''s RLS (null when the book is not the caller''s). See 0027 for the shape; 0034 adds the EPUB keys; 0035 adds book_parts.';

-- 6.7 qc_rule_ok (0028). Added: part_empty, part_not_final.
create or replace function public.qc_rule_ok(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p = any (array[
    'not_final', 'no_text', 'needs_review', 'chapter_review', 'under_target', 'stopped_run', 'cut_off',
    'verify_mark', 'number_no_source', 'source_not_named',
    'same_sentence', 'same_sentence_here', 'same_paragraph', 'overused_word',
    'chapter_missing', 'section_number', 'preview', 'leftover',
    'two_spellings', 'us_uk',
    'web_link', 'emoji', 'missing_char', 'length', 'disclaimer',
    'part_empty', 'part_not_final']), false)
$$;

-- qc_dismissed uses qc_rule_ok, and a part item has no Mark as OK (Plan 2, 07).
alter table public.qc_dismissed drop constraint qc_dismissed_rule_check;
alter table public.qc_dismissed add constraint qc_dismissed_rule_check
  check ((public.qc_rule_ok(rule) and rule not in ('part_empty', 'part_not_final')) or rule = 'promise_drift');

-- 6.8 qc_json (0028). Added: the key book_parts (the part states).
create or replace function public.qc_json(p_book_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with today as (
    select public.qc_versions(p_book_id) as versions, public.qc_inputs_key(p_book_id) as inputs_key
  ), last as (
    select r.id, r.created_at, r.versions, r.inputs_key, r.results, r.sections, r.words, r.style
      from public.qc_runs r
     where r.book_id = p_book_id
     order by r.created_at desc, r.id desc
     limit 1
  )
  select jsonb_build_object(
    'data', public.export_json(b.id),
    'versions', to_jsonb(t.versions),
    'inputs_key', t.inputs_key,
    'format', (select jsonb_build_object('style', f.style, 'parts', f.parts, 'chapter_label', f.chapter_label)
                 from public.book_formats f where f.book_id = b.id),
    'positioning', (select jsonb_build_object(
                             'locked_at', po.locked_at,
                             'one_sentence', po.one_sentence,
                             'reader_promise', po.reader_promise,
                             'approach', po.approach,
                             'lacks', po.lacks,
                             'selling_points', po.selling_points,
                             'focus_tags', po.focus_tags)
                      from public.positioning po where po.book_id = b.id),
    'last_run', (select to_jsonb(l) from last l),
    'current', coalesce((select l.versions = t.versions and l.inputs_key = t.inputs_key from last l), false),
    'dismissed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id,
               'section_id', d.section_id,
               'rule', d.rule,
               'issue_key', d.issue_key,
               'label', d.label,
               'created_at', d.created_at) order by d.created_at desc, d.id desc)
        from public.qc_dismissed d where d.book_id = b.id), '[]'::jsonb),
    'promise', coalesce((
      select jsonb_agg(to_jsonb(k) - 'user_id' order by c.position)
        from public.book_checks k
        join public.chapters c on c.id = k.chapter_id
       where k.book_id = b.id), '[]'::jsonb),
    'book_parts', public.book_parts_json(b.id) -> 'parts',
    'now', now())
  from public.books b
  cross join today t
  where b.id = p_book_id
$$;

-- 6.9 qc_inputs_key (0028). Added: the parts that are on. A book with About or
-- Also by on reads as out of date in 07 once after this migration (owner,
-- STOP 1). Saved runs are not rewritten.
create or replace function public.qc_inputs_key(p_book_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5((jsonb_build_object(
           'title', b.title,
           'subtitle', b.subtitle,
           'trim', br.trim_size,
           'topic_text', br.topic_text,
           'target_reader', br.target_reader,
           'reader_problem', br.reader_problem,
           'promise_draft', br.promise_draft,
           'stance', br.options -> 'stance',
           'standout', br.options -> 'standout',
           'references', br.options -> 'references',
           'loves', coalesce(i.loves, '[]'::jsonb),
           'hates', coalesce(i.hates, '[]'::jsonb),
           'gaps', coalesce(i.gaps, '[]'::jsonb),
           'competitors', coalesce((
             select jsonb_agg(co.title order by co.created_at, co.id)
               from public.competitors co where co.book_id = b.id), '[]'::jsonb),
           'sources', coalesce((
             select jsonb_agg(jsonb_build_array(rs.kind, rs.body, rs.citation) order by rs.created_at, rs.id)
               from public.research_sources rs where rs.book_id = b.id), '[]'::jsonb),
           'locked_at', extract(epoch from po.locked_at),
           'one_sentence', po.one_sentence,
           'reader_promise', po.reader_promise,
           'style', coalesce(f.style, 'classic'),
           'copyright', coalesce((f.parts ->> 'copyright')::boolean, true),
           'chapters', coalesce((
             select jsonb_agg(jsonb_build_array(
                      c.id, c.kind, c.title, c.objective, c.needs_review,
                      coalesce((
                        select jsonb_agg(jsonb_build_array(s.id, s.title, s.word_target, s.status, s.needs_review) order by s.position)
                          from public.sections s where s.chapter_id = c.id), '[]'::jsonb))
                    order by c.position)
               from public.chapters c where c.book_id = b.id), '[]'::jsonb))
         -- E17. [kind, status, current version] of every part that is on; no
         -- key when none is.
         || coalesce((
              select jsonb_build_object('book_parts',
                       jsonb_agg(jsonb_build_array(bp.kind, bp.status, bp.current_version_id)
                                 order by public.part_kind_ord(bp.kind)))
                from public.book_parts bp
               where bp.book_id = b.id and bp.enabled
              having count(*) > 0), '{}'::jsonb))::text)
    from public.books b
    left join public.book_briefs br on br.book_id = b.id
    left join public.research_insights i on i.book_id = b.id
    left join public.positioning po on po.book_id = b.id
    left join public.book_formats f on f.book_id = b.id
   where b.id = p_book_id
$$;

comment on function public.qc_inputs_key(uuid) is
  'E14: md5 of every input the free 07 rules read besides the text (plan 3.2, owner Q3). E17: plus kind, status and current version of every book part that is on. Null for a book the caller cannot see. Under the caller''s RLS.';

-- ---------------------------------------------------------------------------
-- 7. Grants. Supabase gives anon EXECUTE on new functions by default.
-- The replaced functions keep their grants.
-- ---------------------------------------------------------------------------
-- Trigger functions: nobody calls them.
revoke execute on function public.book_parts_guard() from public, anon, authenticated;
revoke execute on function public.book_part_versions_guard() from public, anon, authenticated;
revoke execute on function public.book_part_drafts_guard() from public, anon, authenticated;
revoke execute on function public.book_also_by_guard() from public, anon, authenticated;
revoke execute on function public.part_suggestions_guard() from public, anon, authenticated;
revoke execute on function public.books_create_parts() from public, anon, authenticated;
revoke execute on function public.books_pen_about_draft() from public, anon, authenticated;

revoke execute on function public.part_kind_ord(text) from public, anon;
revoke execute on function public.part_lock(uuid) from public, anon;
revoke execute on function public.part_next_version(uuid, text) from public, anon;
revoke execute on function public.save_part_version(uuid, text, uuid, boolean) from public, anon;
revoke execute on function public.restore_part_version(uuid, uuid, uuid) from public, anon;
revoke execute on function public.copy_bio_to_about(uuid, uuid) from public, anon;
revoke execute on function public.apply_part_suggestion(uuid, uuid, text) from public, anon;
revoke execute on function public.also_by_entries(uuid) from public, anon;
revoke execute on function public.book_parts_json(uuid) from public, anon;
revoke execute on function public.set_also_by(uuid, jsonb) from public, anon;
revoke execute on function public.part_file_list(uuid) from public, anon;
revoke execute on function public.part_key_extra(uuid) from public, anon;
revoke execute on function public.about_text(uuid) from public, anon;
revoke execute on function public.export_part_list(uuid, boolean) from public, anon;
revoke execute on function public.book_parts_files(uuid) from public, anon;
grant execute on function public.part_kind_ord(text) to authenticated;
grant execute on function public.part_lock(uuid) to authenticated;
grant execute on function public.part_next_version(uuid, text) to authenticated;
grant execute on function public.save_part_version(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.restore_part_version(uuid, uuid, uuid) to authenticated;
grant execute on function public.copy_bio_to_about(uuid, uuid) to authenticated;
grant execute on function public.apply_part_suggestion(uuid, uuid, text) to authenticated;
grant execute on function public.also_by_entries(uuid) to authenticated;
grant execute on function public.book_parts_json(uuid) to authenticated;
grant execute on function public.set_also_by(uuid, jsonb) to authenticated;
grant execute on function public.part_file_list(uuid) to authenticated;
grant execute on function public.part_key_extra(uuid) to authenticated;
grant execute on function public.about_text(uuid) to authenticated;
grant execute on function public.export_part_list(uuid, boolean) to authenticated;
grant execute on function public.book_parts_files(uuid) to authenticated;
