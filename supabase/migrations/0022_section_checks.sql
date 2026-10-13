-- 0022_section_checks.sql
-- KDP Lab · E10.4 · Step 06 Write: the AI check of one section (stage section_check).
--
-- The generate function (service role) saves the last AI check of each
-- section here. The browser reads it in the Checks tab. Checks are advice
-- only (owner, E10.4 decision 6): nothing here changes a section, a version,
-- a status, "Needs review" or a gate.
--
-- 1. section_checks (one row per section): the last AI check.
--      version_id  the version the check read (null only after a cascade)
--      findings    JSON array of at most 8 findings:
--        { "type":    "objective" | "voice" | "drift",
--          "message": 1 to 300 characters (not blank),
--          "quote":   1 to 300 characters (not blank), copied from the text;
--                     or "" only for type objective (a gap with nothing to
--                     quote), at most 2 per check (owner, decision 1) }
--      areas       { "objective", "voice", "drift" }, each "pass", "issues",
--                  "unclear" or "skipped" ("skipped" only for voice: the pen
--                  name has no voice).
--      STRUCTURE only, like 0017. The generate function decides what is kept
--      (a quote really in the version text, the areas).
--      words       the version's words (md_word_count rule) when checked.
--      inputs_key  16 hex: a fingerprint of what the check read (the version,
--                  the section and chapter, the positioning lock time, the
--                  pen name and its voice). The browser computes the same key;
--                  when they differ the result is "Out of date". Not a
--                  security feature.
--      checked_at  the function's clock.
--    Row Level Security: a user reads only their own rows. No insert, update
--    or delete policy, and those privileges are revoked from anon and
--    authenticated: only the service role writes (an upsert on section_id).
--    A guard trigger, for every role (the service role bypasses RLS), keeps
--    user_id and book_id equal to the section's owner and book (P0001
--    "section_check_owner") and version_id null or a version of the same
--    section (P0001 "version_other_section").
--
-- Checked before writing (read-only, 2026-10-13): last migration
-- 20261013092716 (0021), 19 public tables, no section_checks table,
-- public.set_updated_at exists. A new table: no existing row can fail it.

-- ---------------------------------------------------------------------------
-- Structure checks
-- ---------------------------------------------------------------------------
create or replace function public.section_finding_ok(e jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- case, not "and": SQL does not promise left-to-right order, and the
  -- jsonb functions raise an error on the wrong type.
  select case
    when jsonb_typeof(e) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(e) k)
         is distinct from array['message', 'quote', 'type'] then false
    when jsonb_typeof(e -> 'type') <> 'string'
      or jsonb_typeof(e -> 'message') <> 'string'
      or jsonb_typeof(e -> 'quote') <> 'string' then false
    when e ->> 'type' not in ('objective', 'voice', 'drift') then false
    when char_length(e ->> 'message') > 300 or public.text_is_blank(e ->> 'message') then false
    when char_length(e ->> 'quote') > 300 then false
    -- An empty quote: an objective gap only (decision 1).
    when e ->> 'quote' = '' then e ->> 'type' = 'objective'
    else not public.text_is_blank(e ->> 'quote')
  end;
$$;

create or replace function public.section_findings_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(j) is distinct from 'array' then false
    when jsonb_array_length(j) > 8 then false
    when exists (select 1 from jsonb_array_elements(j) e where not public.section_finding_ok(e)) then false
    -- At most 2 objective gaps (an empty quote) per check (decision 1).
    else (select count(*) from jsonb_array_elements(j) e where e ->> 'quote' = '') <= 2
  end;
$$;

create or replace function public.section_check_areas_ok(a jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(a) is distinct from 'object' then false
    when (select array_agg(k order by k) from jsonb_object_keys(a) k)
         is distinct from array['drift', 'objective', 'voice'] then false
    when jsonb_typeof(a -> 'objective') <> 'string'
      or jsonb_typeof(a -> 'voice') <> 'string'
      or jsonb_typeof(a -> 'drift') <> 'string' then false
    when a ->> 'objective' not in ('pass', 'issues', 'unclear') then false
    when a ->> 'drift' not in ('pass', 'issues', 'unclear') then false
    else a ->> 'voice' in ('pass', 'issues', 'unclear', 'skipped')
  end;
$$;

comment on function public.section_finding_ok(jsonb) is
  'Structure check for one AI section finding: { type objective|voice|drift, message, quote } (an empty quote only for objective).';
comment on function public.section_findings_ok(jsonb) is
  'Structure check for section_checks.findings: at most 8 findings, at most 2 with an empty quote.';
comment on function public.section_check_areas_ok(jsonb) is
  'Structure check for section_checks.areas: { objective, voice, drift } each pass|issues|unclear (voice also skipped).';

-- ---------------------------------------------------------------------------
-- section_checks
-- ---------------------------------------------------------------------------
create table public.section_checks (
  section_id  uuid primary key references public.sections (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  version_id  uuid references public.section_versions (id) on delete set null,
  findings    jsonb not null default '[]',
  areas       jsonb not null,
  words       int not null check (words between 0 and 1000000),
  inputs_key  text not null,
  checked_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint section_checks_findings_shape_check check (public.section_findings_ok(findings)),
  constraint section_checks_areas_shape_check check (public.section_check_areas_ok(areas)),
  constraint section_checks_inputs_key_format_check check (inputs_key ~ '^[0-9a-f]{16}$')
);

create index section_checks_user_id_idx on public.section_checks (user_id);
create index section_checks_book_id_idx on public.section_checks (book_id);
create index section_checks_version_id_idx on public.section_checks (version_id);

comment on table public.section_checks is
  'E10.4: the last AI check per section (stage section_check). Written by the service role only. Advice only: it never changes the section.';
comment on column public.section_checks.inputs_key is
  'Fingerprint of what the check read (generate lib/section_check.ts sectionCheckKey; the browser computes the same).';

create trigger section_checks_set_updated_at
  before update on public.section_checks
  for each row execute function public.set_updated_at();

alter table public.section_checks enable row level security;

create policy "section_checks_select_own" on public.section_checks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Only the service role writes (it bypasses RLS). Supabase grants every new
-- table to the API roles by default, so take the write privileges back.
-- anon keeps the default select grant, like every other table: with no anon
-- policy, RLS shows it no rows.
revoke insert, update, delete, truncate on public.section_checks from anon, authenticated;

-- The service role bypasses RLS, so the owner, the book and the version are checked here.
create or replace function public.section_checks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Checked on insert, and on an update only when the column changes (a
  -- cascade that sets version_id to null passes).
  if (tg_op = 'INSERT' or (new.section_id, new.user_id, new.book_id) is distinct from (old.section_id, old.user_id, old.book_id))
     and not exists (select 1 from public.sections s join public.chapters c on c.id = s.chapter_id
                      where s.id = new.section_id and s.user_id = new.user_id and c.book_id = new.book_id) then
    raise exception 'section_check_owner'
      using errcode = 'P0001',
            detail = 'A section check belongs to the owner and the book of its section.';
  end if;
  if new.version_id is not null
     and (tg_op = 'INSERT' or new.version_id is distinct from old.version_id)
     and not exists (select 1 from public.section_versions v
                      where v.id = new.version_id and v.section_id = new.section_id) then
    raise exception 'version_other_section'
      using errcode = 'P0001',
            detail = 'A section check reads a version of its own section.';
  end if;
  return new;
end;
$$;

comment on function public.section_checks_guard() is
  'Trigger (E10.4): section_checks.user_id and book_id match the section (P0001 "section_check_owner"); version_id belongs to the same section (P0001 "version_other_section").';

create trigger section_checks_guard
  before insert or update on public.section_checks
  for each row execute function public.section_checks_guard();

revoke execute on function public.section_checks_guard() from public, anon, authenticated;
