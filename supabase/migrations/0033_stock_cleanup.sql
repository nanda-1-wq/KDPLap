-- 0033_stock_cleanup.sql
-- NicheInk · E16.3 · B2: close the stock v1 write path. Plan: docs/reviews/2026-11-20-e16-3-plan.md
-- (Item 3; owner's decision at plan approval, Nov 20: B2 as its own 0033; EPUB, E13.3, moves to 0034).
--
-- stock v2 (live Nov 20) and stock v3 write stock_calls only through stock_reserve and stock_release
-- (0032, security definers: they insert and update as the table owner). 0032 kept the direct insert
-- and stock_usage() only so that stock v1 stayed a rollback target. This migration removes them:
-- 1. No direct insert into stock_calls: the insert policy goes, and anon and authenticated lose the
--    insert grant. A signed-in user can no longer write a row by hand (42501), so every user row now
--    comes from stock_reserve, which checks the minute limits and the Unsplash budget first.
-- 2. stock_usage() goes. No code calls it since stock v2 (the Part 3 caller check is listed in
--    docs/reviews/2026-11-20-e16-3-stop3.md).
--
-- Kept, unchanged: stock_reserve and stock_release (0032); stock_calls_guard with fix A (the second
-- wall: it still checks every insert, stock_reserve's own and any by the service role); select own
-- on stock_calls; no update or delete for anon or authenticated; the 2-hour purge; stock_cache.
--
-- Effect: stock v1 can no longer log a call (it answers 500, fail closed), so it is no rollback
-- target from here on. The rollback is stock v2 (c0a0ce0), which uses only stock_reserve and
-- stock_release. Apply this after the E16.3 live check (plan, deploy order step 4). It is not rolled
-- back: re-adding the policy would only reopen B2.

-- ---------------------------------------------------------------------------
-- 1. No direct insert into stock_calls
-- ---------------------------------------------------------------------------
drop policy "stock_calls_insert_own" on public.stock_calls;
revoke insert on public.stock_calls from anon, authenticated;

comment on table public.stock_calls is
  'E16 Part 7, E16.2, E16.3: one row per stock request (written before the provider is called), for the limits. Written only through stock_reserve (0032, atomic, definer); since 0033 there is no direct insert. Select own; insert, update and delete revoked for anon and authenticated, so a user can neither add nor clear a row by hand. at is the server clock. Rows older than 2 hours are purged on insert.';

comment on function public.stock_calls_guard() is
  'Trigger (E16 Part 7, 0032, definer): at takes the server clock; released_at starts null (only stock_release sets it); a signed-in caller inserts only their own row (42501); an Unsplash row with calls, under the per-user and the shared Unsplash advisory locks, is refused (P0001 "stock_busy") when it would take the user past 30 calls an hour or all users past 45 (released rows included). The second wall behind stock_reserve; since 0033 the only inserts are stock_reserve''s and the service role''s.';

-- ---------------------------------------------------------------------------
-- 2. stock_usage() goes (stock v1 only)
-- ---------------------------------------------------------------------------
drop function public.stock_usage();
