# Batch A (safety): plan, approved 2026-10-05

Source: the plan review gate. The earlier review report was lost at /clear,
so this plan was rebuilt from the owner's four points and the code.

## Live state (read-only check, 2026-10-05)
- user_settings: `user_settings_monthly_token_limit_check (>= 0)`; policies
  `_select_own`, `_insert_own`, `_update_own`, `_delete_own`; trigger
  `user_settings_set_updated_at`.
- competitors (0001): `competitors_bsr_check (bsr >= 0)`,
  `competitors_reviews_check (reviews >= 0)`, `competitors_rating_check (0..5)`.
- 0008 `competitors_reviews_range_check` has no lower bound, so dropping the
  0001 reviews check alone would allow negatives. 0012 replaces it with 0..10000000.
  The rating check stays (the only one).

## Risk 1: migration 0012
- BEFORE INSERT OR UPDATE trigger on user_settings for roles anon/authenticated:
  insert forces the default (2000000); an update that changes the limit raises
  `token_limit_locked`. service_role and postgres are not limited.
- Drop policy `user_settings_delete_own` (owner decision), so delete + reinsert
  cannot reset a lowered limit. The row still goes with the auth user (cascade).
- Drop `competitors_bsr_check` and `competitors_reviews_check`; replace
  `competitors_reviews_range_check` with `reviews between 0 and 10000000`.
- Known gap: a SECURITY DEFINER function owned by postgres passes the guard.
  No current function writes the limit.

## Risk 3 (review item 2): knownText
Only the Brief and Research count as sources. The current positioning is no
longer a source (affects positioning_help and title_ideas).

## Risk 4 (review item 3): brief_help "Verify: no source"
- `briefKnownText(ctx)`: Brief fields, topic name, page-1 books (titles and
  numbers). Owner decision: page-1 numbers count as sources.
- `interpretBriefHelp` returns `unsourced` per field; handler passes it on;
  book-brief.js shows the verify line under the suggestion.

## Risk 6 (review item 4): Delete book dialog
List of everything that is deleted (Brief, competitors, research notes,
review insights, positioning, title ideas, chapters and versions), only the
parts that exist, plus "Your topic and pen name are kept." Full list without
numbers if counts fail.

## Tests
- Local Postgres 18 (port 55432): user limit attempts (insert, update, upsert,
  delete + reinsert, after a service-role lower), default match, competitor numbers.
- Deno: knownText without positioning, brief_help flags, handler passes unsourced.
- One mocked Playwright check of the Delete dialog.

## Status
2026-10-05: built (files only). Not applied, not deployed, not committed.
- Local Postgres 18: 24/24 checks pass. A user upsert does not raise and
  does not error: the insert trigger sets `excluded` back to the default
  first. After the service role lowers the limit, the same upsert errors.
- Deno: 109 passed, 0 failed. Two old positioning tests now expect the
  numbers 4 and 5 to be flagged (they were in the positioning only).
- Mocked Playwright: Delete dialog full list, Brief only, and fallback list: PASS.
- Not checked in a browser: the Brief "Verify: no source" line (deno only).
- Next: owner applies 0012 and deploys `generate`, then a live check.

2026-10-05: live. Owner applied 0012 and deployed `generate` (version 8).
Live check as the test user on a new test book (since deleted). Other books untouched.
- Limit: browser update to 99000000 fails with 42501 `token_limit_locked`.
  Upsert returns the row unchanged (2000000). Delete returns 0 rows.
- Brief "Help me fill" (1 AI call, ai_usage 37 to 38, brief_help 1263 in /
  164 out). The Reader problem suggestion said "9-to-5", and the
  "Verify: no source for 9 and 5" line showed. "12-hour" was not flagged
  (12 is in the Brief).
- Delete dialog listed "The Brief" and "1 competitor", plus "Your topic and
  pen name are kept." After the delete: book, Brief, and competitor rows are 0.
- Next: commit and push.

## Batch B notes
- Revoke execute on `user_settings_guard_limit()` from public, anon,
  authenticated, like the other trigger functions. Live it still has
  `PUBLIC: EXECUTE` (the trigger still runs without it).
