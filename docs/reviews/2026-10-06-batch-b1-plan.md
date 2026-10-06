# Batch B1 (cleanup, server side): plan, approved 2026-10-06

Source: the owner's plan review gate, 2026-10-06. Files only: no deploy, no
apply, no commit until the owner says so.

**Rule: no behavior change.** A snapshot test is written and recorded first,
against today's code. After the refactor the snapshots must be identical.

## Baseline (measured 2026-10-06, before any change)
| Suite | Where today | Count |
|---|---|---|
| Deno `lib.test.ts` | `supabase/functions/generate/` | 52 |
| Deno `handler.test.ts` | `supabase/functions/generate/` | 57 |
| Deno total | | **109 passed, 0 failed** |
| `tests/title-checks.test.js` (deno) | `tests/` | 6 |
| SQL 0012 | old scratchpad `t0012.sql` | 24 checks |
| SQL 0010 | **lost** (old scratchpad cleaned) | was 73 |
| SQL 0011 | **lost** (old scratchpad cleaned) | was 34 |
| Local Postgres reset script `resetdb.sh` | **lost** | |
| Mocked browser: Positioning `e8/t1, t2, t-drift` | old scratchpad 0e46c2ef | 78 + 40 + drift |
| Mocked browser: Title `e82/t1, t-note, t-hyphen` | old scratchpad 0e46c2ef | 52 + note + hyphen |
| Mocked browser: Delete dialog `del.js` | old scratchpad f64f1788 | 3 cases |

Still on disk: `stub.sql` (auth schema and roles), `psql.sh`, the local
supabase-js 2.49.4 copy. The E5, E6 and E7 mocked harnesses are gone, so
they are not part of this batch.

## Step 0. Snapshot baseline (before touching lib.ts)
New `supabase/functions/generate/snapshot.test.ts`, using `jsr:@std/testing@1/snapshot`
(`assertSnapshot`). Fixed clock, fixed fake store, fake fetch.
- `buildRequest` for all 7 stages, plus `positioning_help` with one `field`
  (8 snapshots). Full JSON: model, max_tokens, system, schema, user message.
- Reply and error shapes per stage, through `makeHandler`: HTTP status, JSON
  body, CORS headers, and the `ai_usage` row (or "no row"). Cases per stage:
  success, not visible (404), each stage pre-check error (`not_enough_facts`,
  `not_enough_books`, `positioning_locked`, `positioning_not_locked`,
  `options_full`, `nothing_to_check`), provider failure (502), model refusal
  code (422 where the stage has one), and the two save failures
  (`positioning_changed`, title save `options_full` / `server_error`).
- Shared paths once: OPTIONS, GET, no auth, bad input, body too large,
  missing API key, limits (429 x2).
- Record with `deno test --allow-read --allow-write ... -- --update`, then run
  again without `--update`. The `.snap` file
  (`__snapshots__/snapshot.test.ts.snap`) is the proof: it must not change
  in any later step. Its own small commit, before the refactor.

## Step 1. Split `generate/lib.ts` (1410 lines)
`lib.ts` becomes re-exports only (`export * from "./lib/...ts"`), so
`handler.ts`, `index.ts`, and the tests keep working unchanged.

| New file | Contents |
|---|---|
| `lib/limits.ts` | `STAGES`, `Stage`, `MODELS`, `MODEL_FOR_STAGE`, every constant (body bytes, timeouts, max tokens, field caps), `POSITIONING_FIELDS`, `ERROR_STATUS`, `ErrorCode`, `ALLOWED_ORIGINS`, `corsHeaders`, `GenerateInput`, `parseInput`, `monthStartUtc`, `limitError` |
| `lib/common.ts` | small generic helpers: `str`, `obj`, `asData`, `Outcome`, `readReply`, `tokens`, `oneLine`, `wholeIn`, `cutWords`, `cleanList`, `numbersIn`, `unsourcedNumbers`, `wordCount` |
| `lib/context.ts` | the positioning context shared by 3 stages (`PositioningRow`, `PositioningContext`, `positioningValues`, `promptSources`, `briefAndResearch`, `knownText`) |
| `lib/bio.ts` | facts/voice readers, `BIO_SYSTEM`, schema, user message, `interpretBio` |
| `lib/amazon_import.ts` | import prompt, schema, `cleanBooks`, `interpretImport` |
| `lib/brief_help.ts` | Brief prompt, `briefKnownText`, `hasTopic`, `interpretBriefHelp` |
| `lib/review_insights.ts` | review prompt, `reviewedBooks`, `cleanInsightList`, `interpretReviewInsights` |
| `lib/positioning_help.ts` | positioning prompt, `helpFields`, `interpretPositioningHelp` |
| `lib/drift_check.ts` | drift prompt, `interpretDriftCheck` |
| `lib/title_ideas.ts` | title prompt, `titleLength`, `titleIdeasWanted`, `interpretTitleIdeas` |
| `lib/types.ts` | `Store`, `UsageRow`, `DriftSave`, `SavedTitleOption` moved from handler.ts (types only). handler.ts re-exports them, so test imports do not change. |
| `lib/stages.ts` | the stage table (step 2), `Job`, `buildRequest`, `interpretJob`, `interpretResponse` |

Helpers that were private stay private to their new file unless two files
need them; then they move to `common.ts` (not exported from `lib.ts`, so the
public surface of `lib.ts` stays the same). Code moves as is: no renames,
no rewording of prompts.

## Step 2. One stage table
In `lib/stages.ts`, one entry per stage, typed `Record<Stage, StageDef>` so
the compiler fails if a stage is missing:

| Field | Job |
|---|---|
| `read(store, input)` | read the parent row through RLS; `null` = 404 |
| `check(ctx)` | pre-checks before money is spent; returns an error code (+ extra) or the Job |
| `prompt(job)` | `[system, schema, userMessage]` |
| `interpret(job, httpOk, body)` | the Outcome |
| `save?(store, job, out, ctx)` | only `drift_check` and `title_ideas` (the 5b and 5c blocks today) |
| `reply(job, out, saved, now)` | the 200 body |

- `handler.ts` steps 3, 5b, 5c and 6 become table lookups. Limits, the
  provider call, logging and CORS stay in the handler, in the same order.
- `buildRequest` and `interpretJob` read the table. The `promptFor` switch
  and the `interpretJob` if-chain are removed.
- **Unknown stage fails clearly.** A lookup with no entry throws
  `Error("generate: unknown stage <x>")`. In the handler that ends in the
  existing catch: 500 `server_error`, logged. (parseInput already rejects
  unknown stages with 400, so a real request never gets there.)
- **`interpretResponse` fix.** Today `interpretResponse("drift_check" |
  "positioning_help" | "title_ideas", ...)` falls into the Brief parser.
  After: those three throw "needs the job, use interpretJob". bio, import,
  review_insights and brief_help (with "" as known text) behave as now. The
  handler never calls `interpretResponse`, so this does not change any
  reply. It is the only intended change in this batch, and it has its own
  tests.
- `parseInput` keeps its per-stage checks as they are (owner listed it under
  limits.ts). Moving them into the table is possible later; not in B1.

## Step 3. `index.ts`
Remove the two inner copies of `one()` (in `getBriefContext` and
`getReviewContext`, lines 121 and 146). They shadow the identical top-level
`one()` at line 36. Nothing else changes in index.ts.

## Step 4. Migration 0013 (file only, not applied)
`supabase/migrations/0013_guard_limit_execute.sql`:

```sql
/* 0013: lock down user_settings_guard_limit()

   It is a trigger function (0012). Nobody calls it directly, so no role
   needs EXECUTE. Same as positioning_guard() in 0010. A trigger still
   fires without EXECUTE: Postgres checks it only at CREATE TRIGGER. */

revoke execute on function public.user_settings_guard_limit() from public, anon, authenticated;
```

The test (`t0013.sql`) checks: `has_function_privilege` is false for anon
and authenticated; `select public.user_settings_guard_limit()` as
authenticated is 42501; the 0012 limit rules still hold after 0013 (insert
forces the default, update of the limit is `token_limit_locked`).

## Step 5. Tests into the repo
`supabase/tests/sql/`:
- `reset.sh`: creates (or wipes) a throwaway Postgres 18 cluster on port
  55432, TCP only, data dir under `$TMPDIR/kdplab-pg` (never the owner's
  5432). Loads `stub.sql`, then every file in `supabase/migrations/` in order.
- `run.sh`: reset, then runs each `t*.sql`, prints PASS/FAIL lines and a
  total. Exit code 1 on any FAIL.
- `stub.sql`: roles `anon`, `authenticated`, `service_role`, schema `auth`,
  `auth.users`, `auth.uid()` (from the old scratchpad).
- `t0010.sql`, `t0011.sql`: **rebuilt** from the migrations and the E8 notes
  (lock rules, guard trigger, unlock RPC, title rules, 40 cap, true→false
  needs-review rule). The counts may differ from the old 73 and 34.
- `t0012.sql`: copied (24 checks).
- `t0013.sql`: new (step 4).
- `rls_cross_user.sql`: new. Two users, A owns one row in each of the 15
  tables (ai_usage, book_briefs, books, chapters, competitors, pen_names,
  positioning, research_insights, research_sources, section_versions,
  sections, title_options, topic_page_books, topics, user_settings). As B:
  select sees 0 rows; insert with A's ids fails; update and delete touch 0
  rows; and A's rows are unchanged after (checked as service role). Also: no
  public table has RLS off.

`tests/browser/`:
- `run.sh` (one runner, takes `<harness> <test>`), `positioning/mock.js` +
  `t1.js`, `t2.js`, `t-drift.js`; `title/mock.js` + `t1.js`, `t-note.js`,
  `t-hyphen.js`; `delete/del.js`. Paths made relative to the repo.
- The supabase-js 2.49.4 copy is not committed: `run.sh` downloads it once
  into `tests/browser/.cache/` (gitignored) and checks its SRI hash.
- Mocks use the fake session only. No test account, no `.env.test`, no live
  scripts. `.gitignore` adds `tests/browser/.cache/` and `tests/browser/shots/`.
- `tests/README.md`: how to run deno, SQL, and browser tests.

## Step 6. Split `handler.test.ts` (834 lines, 57 tests)
- `test_fakes.ts`: shared fixtures and fakes (ids, contexts, fake store,
  fake fetch, `msg`, `quiet`, `json`).
- `handler.test.ts`: shared flow only (OPTIONS, GET, auth, bad input, body
  cap, API key, database error, usage log failure, limits).
- `handler.bio.test.ts`, `handler.amazon_import.test.ts`,
  `handler.brief_help.test.ts`, `handler.review_insights.test.ts`,
  `handler.positioning_help.test.ts`, `handler.drift_check.test.ts`,
  `handler.title_ideas.test.ts`.
- Tests move unchanged: the same 57 names, the same asserts.
  `lib.test.ts` stays one file (not in the brief).

## Order and commits (each one only when the owner says commit)
1. Snapshot test + `.snap` (against today's code).
2. lib split (step 1). Snapshots identical, deno 109 + new.
3. Stage table (step 2) + interpretResponse tests.
4. index.ts `one()` (step 3).
5. handler.test.ts split (step 6). Same count.
6. 0013 + `supabase/tests/sql/` (steps 4 and 5).
7. `tests/browser/` + one smoke run (Title `t1.js`, mocked).

Checks after each step: `deno check` on index.ts, `deno test` for the
function folder, and the `.snap` file unchanged (`git diff --exit-code`).

## Expected counts after
| Suite | Before | After |
|---|---|---|
| Deno (generate) | 109 | 109 moved + about 14 new (snapshot ~9, stage table ~5) |
| title-checks | 6 | 6 |
| SQL | 24 (0012 only on disk) | 0010 + 0011 rebuilt, 0012 24, 0013 ~6, RLS ~65 (15 tables x 4 + extra) |
| Browser | 0 in repo | harnesses in repo, 1 smoke run |

Exact numbers are reported at the STOP.

## Owner answers (2026-10-06)
1. `interpretResponse` throws for positioning_help, drift_check and
   title_ideas. **This is the only intended behavior change in B1.**
2. Rebuild t0010 and t0011. Counts may differ, but cover every rule: lock
   rules, unlock_positioning, server-only drift results, the title
   needs-review guard, the title options cap and read-only rule.
3. The shared positioning context goes in its own file, `lib/context.ts`.
   `lib/common.ts` keeps only small generic helpers.

## Status
2026-10-06: plan written and approved.

2026-10-06: built (files only). Not deployed, not applied, not committed. At STOP.
- Snapshot recorded first, against the old lib.ts: 80 snapshots (8 requests,
  71 handler cases, 1 interpretResponse). After the split, the stage table,
  the index.ts cleanup and the test split, the `.snap` file is byte-identical.
- Deno (generate): 117 passed, 0 failed (109 old, all names kept, + 3
  snapshot + 5 stage table). title-checks: 6 passed.
- SQL (local Postgres 18, port 55432): 265 pass, 0 fail. t0010 86 (rebuilt),
  t0011 57 (rebuilt), t0012 24, t0013 10, rls_cross_user 88. Negative
  checks: t0013 without 0013 fails 5 checks; RLS off on competitors fails 7.
- Browser smoke: title t1.js, mocked, 52 PASS, 0 FAIL, no page errors.
- Deviations: the `save` step joins the table (drift_check, title_ideas);
  harness files renamed (mock.js per suite, delete/t-dialog.js); old JS
  versions for the bug-proof tests come from git (32f9dfa), not copies.
- Next: owner applies 0013 and deploys `generate`, then commit.

2026-10-06: live and checked. Not committed yet. At STOP.
- 0013 applied (migration `guard_limit_execute`). EXECUTE on
  `user_settings_guard_limit()`: anon no, authenticated no, service_role yes.
- `generate` deployed as version 9 (the B1 refactor, verify_jwt on;
  confirmed by Claude chat).
- Live check, 1 AI call: new test book "Chair yoga for seniors with knee
  pain" (start without a topic), Help me fill once. HTTP 200, request body
  only `{stage, bookId}`, CORS origin 127.0.0.1:5500, reply shape
  `{stage, suggestions, unsourced}` as in the snapshot. 3 suggestions shown;
  "60" flagged "Verify: no source" under Target reader. One `ai_usage` row
  (id 39, brief_help, claude-sonnet-5-5, 1235 in / 185 out).
- Test book deleted from the Books page (type DELETE). Book and Brief gone;
  `ai_usage` row 39 kept with `book_id` null.
- `.claude/settings.json` deny list now also blocks `bunx supabase`,
  `pnpm dlx supabase`, `yarn supabase`, `/opt/homebrew/bin/supabase` and
  reading `~/.supabase/**`.
- Next: commit and push when the owner says so.
