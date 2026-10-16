-- 0024_kept_findings.sql
-- KDP Lab · PRODUCE gate G5 · Step 06 Write: "Keep as is" on an AI check
-- finding (design 22d, owner answers G4 Q2 and G5 Q2, Q4).
--
-- The writer keeps a finding as it is. Our code hides it in the Checks tab
-- (js/finding-rules.js); the AI prompt does not change and the generate
-- function never reads this table. Advice only, like 0022: nothing here
-- changes a section, a version, a status, "Needs review" or a gate.
--
-- 1. kept_findings (one row per kept finding, owned by the writer):
--      section_id  the section; the row goes with it (cascade).
--      type        "objective" | "voice" | "drift" (as 0022).
--      message     1 to 300 characters, not blank (as 0022): the kept list
--                  shows it, and it tells two gaps of one check apart.
--      quote       1 to 300 characters, not blank: the exact quote. A later
--                  check hides a finding with the same type and quote.
--                  Or "" for an objective gap only (as 0022): a gap has no
--                  quote to match, so it is kept for one check only.
--      check_at    only for a gap (and required there): the checked_at of
--                  the section's check it was kept from.
--    Row Level Security: a user reads, adds and removes only their own rows,
--    on their own sections. No update: a keep is added or undone, never
--    changed (privileges revoked).
--    A guard trigger, for every role (the service role bypasses RLS):
--      a. user_id is the section's owner (P0001 "kept_owner"; a section the
--         caller cannot see is left to the insert policy, 42501);
--      b. a gap is in the section's current check: check_at is its
--         checked_at and it holds an objective gap with this exact message
--         (P0001 "kept_gap_not_in_check");
--      c. gaps kept from older checks of the section are removed ("for this
--         check only", so they never pile up);
--      d. at most 50 kept rows per section (P0001 "kept_limit"), with the
--         section row locked so two tabs cannot pass the cap together.
--    Unique: one row per section, type and quote; one per section, check and
--    message for a gap. A second keep of the same finding (a double click,
--    another tab) fails with 23505, which the browser reads as "kept".
--
-- Checked before writing (read-only, 2026-10-16): last migration
-- 20261015222000 (0023), 20 public tables, no kept_findings table,
-- public.text_is_blank exists (0019). A new table: no existing row can fail it.

-- ---------------------------------------------------------------------------
-- kept_findings
-- ---------------------------------------------------------------------------
create table public.kept_findings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section_id  uuid not null references public.sections (id) on delete cascade,
  type        text not null,
  message     text not null,
  quote       text not null,
  check_at    timestamptz,
  created_at  timestamptz not null default now(),
  constraint kept_findings_type_check check (type in ('objective', 'voice', 'drift')),
  constraint kept_findings_message_check check (char_length(message) <= 300 and not public.text_is_blank(message)),
  constraint kept_findings_quote_length_check check (char_length(quote) <= 300),
  -- An empty quote: an objective gap only (as 0022 decision 1).
  constraint kept_findings_quote_check check (case when quote = '' then type = 'objective' else not public.text_is_blank(quote) end),
  -- check_at: required for a gap, none for a quote.
  constraint kept_findings_check_at_check check ((quote = '') = (check_at is not null))
);

create index kept_findings_user_id_idx on public.kept_findings (user_id);
create unique index kept_findings_quote_key on public.kept_findings (section_id, type, quote) where quote <> '';
create unique index kept_findings_gap_key on public.kept_findings (section_id, check_at, message) where quote = '';

comment on table public.kept_findings is
  'PRODUCE G5: AI check findings the writer kept as they are ("Keep as is", design 22d). Hidden by the browser: a quote on later checks (same type and quote), a gap for its own check only.';
comment on column public.kept_findings.check_at is
  'A gap only: section_checks.checked_at of the check it was kept from. Null for a finding with a quote.';

alter table public.kept_findings enable row level security;

create policy "kept_findings_select_own" on public.kept_findings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "kept_findings_insert_own" on public.kept_findings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sections s
                where s.id = section_id and s.user_id = (select auth.uid()))
  );

create policy "kept_findings_delete_own" on public.kept_findings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A keep is added or undone, never changed.
revoke update, truncate on public.kept_findings from anon, authenticated;

-- SECURITY INVOKER: the reads, the clean-up and the count run under the
-- caller's Row Level Security, so they only see the caller's own rows (another
-- user's section fails the insert policy anyway). The service role bypasses
-- RLS, so the owner is checked here too.
create or replace function public.kept_findings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_check timestamptz;
begin
  -- d. One keep at a time per section (the section row is locked).
  select s.user_id into v_owner from public.sections s where s.id = new.section_id for update;
  -- A section the caller cannot see (another user's, or none): the insert
  -- policy (42501) or the foreign key (23503) refuses the row.
  if v_owner is null then
    return new;
  end if;
  -- a. The section's owner.
  if v_owner <> new.user_id then
    raise exception 'kept_owner'
      using errcode = 'P0001',
            detail = 'A kept finding belongs to the owner of its section.';
  end if;
  select c.checked_at into v_check from public.section_checks c where c.section_id = new.section_id;
  -- b. A gap: in the section's current check, with this exact message.
  -- (A wrong shape is left to the table checks, which run after this trigger.)
  if new.quote = '' and new.type = 'objective' and new.check_at is not null
     and (v_check is null or new.check_at <> v_check
          or not exists (select 1 from public.section_checks c, jsonb_array_elements(c.findings) e
                          where c.section_id = new.section_id
                            and e ->> 'type' = 'objective' and e ->> 'quote' = '' and e ->> 'message' = new.message)) then
    raise exception 'kept_gap_not_in_check'
      using errcode = 'P0001',
            detail = 'A gap can be kept only from the section''s current check.';
  end if;
  -- c. Gaps kept from older checks are gone with their check.
  delete from public.kept_findings k
   where k.section_id = new.section_id and k.quote = '' and k.check_at is distinct from v_check;
  -- d. At most 50 per section.
  if (select count(*) from public.kept_findings k where k.section_id = new.section_id) >= 50 then
    raise exception 'kept_limit'
      using errcode = 'P0001',
            detail = 'A section can keep at most 50 findings.';
  end if;
  return new;
end;
$$;

comment on function public.kept_findings_guard() is
  'Trigger (PRODUCE G5): kept_findings.user_id is the section''s owner (P0001 "kept_owner"); a gap is in the section''s current check (P0001 "kept_gap_not_in_check"); gaps from older checks are removed; at most 50 per section (P0001 "kept_limit").';

create trigger kept_findings_guard
  before insert on public.kept_findings
  for each row execute function public.kept_findings_guard();

revoke execute on function public.kept_findings_guard() from public, anon, authenticated;
