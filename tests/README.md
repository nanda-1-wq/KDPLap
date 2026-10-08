# Tests

All commands run from the repo root. None of them touch the live project.

## Edge Function `generate` (Deno)

```sh
deno check supabase/functions/generate/index.ts
deno test --allow-read=supabase/functions/generate supabase/functions/generate/
```

- `lib.test.ts`: prompts, parsing, limits. `lib.outline.test.ts`: the
  outline_ideas number rule, word target, contents budget and reply cleaning.
- `handler.test.ts`: the shared request flow. `handler.<stage>.test.ts`: one file per stage.
- `stages.test.ts`: the stage table.
- `snapshot.test.ts`: the exact provider request for every stage, and every
  reply and error shape. A refactor must leave
  `__snapshots__/snapshot.test.ts.snap` unchanged. Re-record only for an
  intended change, and review the diff:
  `deno test --allow-read --allow-write supabase/functions/generate/snapshot.test.ts -- --update`
- Shared fakes: `test_fakes.ts`.

## Browser helpers (Deno)

```sh
deno test tests/title-checks.test.js
deno test tests/outline-checks.test.js
deno test --allow-read tests/limits-parity.test.js
```

- `outline-checks.test.js`: the step 05 code checks and the shared words and
  pages helper (`js/word-budget.js`, about 250 words a page).
- `limits-parity.test.js`: the same limits in the browser files,
  `generate/lib/limits.ts` and the migrations (title 200, Brief lengths,
  positioning sizes, competitor caps, insight and title-option caps, Brief
  chapters 3 to 30 and custom word target 2,000 to 150,000, book types and
  the 40-character Other label, competitor import page text, outline limits
  (0016), the Brief length ranges, and one page estimate helper). It fails
  when a value disagrees or can no longer be found.

## Database (local Postgres 18)

```sh
supabase/tests/sql/run.sh                 # every suite, each on a fresh database
supabase/tests/sql/run.sh t0010.sql       # one suite
supabase/tests/sql/reset.sh stop          # stop the test cluster
```

A throwaway cluster on `127.0.0.1:55432` (data in `$TMPDIR/kdplab-pg`).
It never uses port 5432. `stub.sql` adds the parts of Supabase the
migrations need (roles, `auth.uid()`, default grants). Suites:
`t0010` positioning, `t0011` title, `t0012` safety, `t0013` guard function,
`t0014` custom word target and insights fingerprint, `t0015` book types and Other label,
`t0016` outline rules (limits, caps, the "has writing" guard, replace_outline, add_chapter, reorder_chapters),
`rls_cross_user` (user B against user A's rows in every table).

## Browser (mocked, playwright-cli)

```sh
tests/browser/run.sh title t1.js
```

Needs the static server on port 5500. Every Supabase call is answered by
the suite's `mock.js` with a fake session, so no account or real data is
used. Suites: `brief` (t-chapters, t-length, t-missing, t-accept-all, t-partial,
t-book-type, t-help-more, t-references), `research` (t-stale, t-missing, t-from, t-import), `positioning` (t1, t2, t-drift,
t-accept-all, t-missing, t-save-owner), `title` (t1, t-note, t-hyphen, t-missing),
`delete` (t-dialog), `outline` (t1, t-struct, t-generate). The runner caches supabase-js (checked
against the app's SRI hash) and two old file versions from git in
`tests/browser/.cache/`. Screenshots go to `tests/browser/shots/`. Both
folders are ignored by git.
