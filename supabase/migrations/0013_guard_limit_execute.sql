-- ═══════════════════════════════════════════════════
-- KDP Lab · 0013 · lock down user_settings_guard_limit()
--
-- 0012 added the trigger function public.user_settings_guard_limit().
-- Nobody calls it directly, so no API role needs EXECUTE. Supabase grants
-- EXECUTE on new functions to anon and authenticated by default, so revoke
-- it, the same as positioning_guard() in 0010.
--
-- The trigger still fires: Postgres checks EXECUTE on a trigger function
-- only at CREATE TRIGGER, not when the trigger runs.
-- ═══════════════════════════════════════════════════

revoke execute on function public.user_settings_guard_limit() from public, anon, authenticated;
