-- 0012_safety_rules.sql
-- KDP Lab · Batch A · Safety: the monthly AI limit, competitor numbers.
--
-- 1. user_settings.monthly_token_limit
--      The browser can read the limit but never change it. For the roles
--      anon and authenticated:
--        insert   the limit is set to the default (2000000), whatever is sent
--        update   changing the limit raises "token_limit_locked"
--        delete   not allowed (policy user_settings_delete_own is dropped), so
--                 delete + insert cannot reset a lowered limit. The row still
--                 goes when the auth user is deleted (on delete cascade).
--      service_role (Edge Functions, dashboard) and postgres are not limited.
--      Known gap: a SECURITY DEFINER function owned by postgres passes the
--      guard. No function writes this column today; keep it that way.
-- 2. competitors
--      Drop the 0001 checks competitors_bsr_check (bsr >= 0) and
--      competitors_reviews_check (reviews >= 0). The 0008 range checks cover
--      them, after competitors_reviews_range_check gains its lower bound 0.
--      competitors_rating_check (0001) stays: it is the only rating rule.
--
-- Checked before writing (read-only, 2026-10-05): the constraint and policy
-- names above exist live. Live rows: none can fail the new reviews check,
-- because competitors_reviews_check already required reviews >= 0.

-- ---------------------------------------------------------------------------
-- 1. user_settings.monthly_token_limit
-- ---------------------------------------------------------------------------
create or replace function public.user_settings_guard_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Same value as the column default (0001). The local test checks they match.
    new.monthly_token_limit := 2000000;
  elsif new.monthly_token_limit is distinct from old.monthly_token_limit then
    raise exception 'token_limit_locked'
      using errcode = '42501',
            detail = 'Only the service can change the monthly AI limit.';
  end if;
  return new;
end;
$$;

comment on function public.user_settings_guard_limit() is
  'Users cannot set or change monthly_token_limit. Only service_role or postgres can.';

create trigger user_settings_guard_limit
  before insert or update on public.user_settings
  for each row execute function public.user_settings_guard_limit();

drop policy "user_settings_delete_own" on public.user_settings;

-- ---------------------------------------------------------------------------
-- 2. competitors
-- ---------------------------------------------------------------------------
alter table public.competitors drop constraint competitors_bsr_check;
alter table public.competitors drop constraint competitors_reviews_check;

alter table public.competitors drop constraint competitors_reviews_range_check;
alter table public.competitors
  add constraint competitors_reviews_range_check
  check (reviews is null or reviews between 0 and 10000000);
