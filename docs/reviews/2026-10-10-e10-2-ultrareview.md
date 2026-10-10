# E10.2 ultrareview (2026-10-10)

Status: fixed in 35b1527, all suites pass. Pushed to claude/e10-2-generate.
0020 was edited in place (it was never applied). No apply, no deploy, no Supabase CLI.

Run: /ultrareview, locally, on `claude/e10-2-generate` at `b134a93` (E10.2 STOP 1).
Findings 1 to 6 came from the review. 7 and 8 came from the owner's own reading.

| # | Finding | Outcome |
|---|---|---|
| 1 | A section could be deleted while Generate writes it | fixed in 35b1527 |
| 2 | Pressing Back twice skipped "Stop and leave?" | fixed in 35b1527 |
| 3 | `afterRun` set `has_writing` with no saved version | fixed in 35b1527 |
| 4 | Over the 100,000 cap the screen showed the conflict message | fixed in 35b1527 |
| 5 | `sumRunningReserves` had its own 20 s / 160 s | fixed in 35b1527 |
| 6 | `getWriteContext` read the book, then the outline, one after the other | fixed in 35b1527 |
| 7 | Lock order: begin locked section then run, finish run then section | fixed in 35b1527 |
| 8 | Monthly limit race (check before begin, two sections at once) | known, not fixed |

## 1. Delete while writing (normal)
`section_has_writing` ignored a running run, so 05 or another tab could delete the section or
its chapter mid-stream. The cascade removed the run row and the text was lost.

Fix (0020 §5): `section_has_writing` is also true while the section has a fresh running run.
The fresh rule is written inline (`state = 'running'`, heartbeat under 20 s, started under 160 s),
because `section_run_fresh` is not executable by the user and the delete guard runs as the user.
The delete guard (sections and chapters), `replace_outline`, `unlock_positioning` and
`outline_json` all call it as the user. The user reads their own run row through RLS.

Tests:
- `t0020`: as the user, a fresh run means has writing, `outline_json` has_writing true, and
  Remove is refused (`has_writing`). A stale run (heartbeat 30 s old) means no writing, and
  Remove works. Every other suite that uses these functions still passes (t0016 to t0019,
  rls_cross_user).
- Browser `outline/t-running.js` (9 checks): the Remove dialog says "has writing" with only
  Close; a run that starts after 05 loaded makes the server refuse, and the section stays.
- On the old 0020 the new SQL checks fail (has writing false, Remove `OK 1`).

## 2. Double Back skipped "Stop and leave?" (normal)
A second `confirmDialog` while the first was open replaced its resolver (Chromium) or threw
(the review's case). With a throw, `mayLeave` caught it and left without stopping the run.

Fix: `confirmDialog` returns the pending promise when it is already open, so both callers get
the same answer. `mayLeave` (`js/book.js`) stays on any error, and leaves only on `true`.

Tests (`write/t-gen-ends.js`, 6 new checks): double Back and double Exit show one question;
"Keep writing" keeps you on 06 with the run going and no stop call; two callers both get
`false`; a failing question means stay. On the old code the run hangs at the "Leave site?"
prompt (it left mid-run).

## 3. has_writing without a version (nit)
`afterRun` marked the section as writing after a stop, a failure or a lost stream with nothing
saved. It now does that only when the run saved a new current version. A partial counts as
writing only once kept (0020), and the next outline read says so.

## 4. The 100,000 cap showed as a conflict (nit)
`section_run_finish` returns `capped: true` when it cut the text. The `saved` event carries it.
The screen says "This section reached its length limit. The text is saved in Versions." (warning,
Close, no Try again). Tests: `t0020` (capped, partial, not current, not a conflict), Deno
`handler.section_write` (the `saved` event).

## 5. Stale times in two places (nit)
`sumRunningReserves` uses `RUN_STALE` (lib/limits.ts). `limits-parity` checks the browser's
`RUN_FRESH` equals `RUN_STALE`, that `index.ts` uses `RUN_STALE` with no numbers of its own, and
both places in 0020 (`section_run_fresh`, `section_has_writing`).

## 6. Two reads in a row (nit)
`getWriteContext` reads the book and `outline_json` with `Promise.all`.

## 7. Lock order (owner)
`section_run_begin` locked the section, then the run row (and a stale takeover locks the run row
under the section lock). `section_run_finish` locked the run row, then the section. A finish
and a takeover of the same section could deadlock.

Fix: finish reads the run's section id without a lock, locks the section, then the run row,
then checks again that the run is still running with the same section (else
`run_not_running`). Beat and request_section_stop lock only the run row; recover runs inside
begin, under the section lock.

Test (`t0020`, two connections through `dblink`): connection x holds the section lock (a
claim's first step); y finishes the run; x then locks the run row (a takeover's next step). Now
y waits on the section and x gets the run row at once, and finish then ends the run normally.
With the old order the same test fails with "deadlock detected". The test needs the `dblink`
extension (in Postgres contrib, also in Homebrew `postgresql@18`).

## 8. Monthly limit race (owner: known, not fixed)
The limit check (counted tokens plus running reserves) runs before `section_run_begin`. Two
sections started at the same instant can both pass it. Worst case: one extra call, about
$0.04, for a single user. Written in the plan doc under Known.

## Counts, before (b134a93) → after

| Suite | Before | After |
|---|---|---|
| `deno check` generate | clean | clean |
| Deno `generate` | 219 | 220 (+1: capped) |
| Helper tests | 54 | 54 |
| SQL (all, PG 16) | 735 | 743 (t0020 77 → 85) |
| Browser (mocked) | 959 | 974 (outline `t-running` 9 new; write `t-gen-ends` 37 → 43) |
| `deno lint` generate | 17 | 17 |

## Existing checks changed
- `limits-parity` "Generate section…": the 0020 stale times are checked in both places (were
  one); plus `RUN_FRESH` and `index.ts` (review 5).
- `handler.section_write` complete and "Stop before any text": the `saved` event has
  `capped: false`.
- `handler.test.ts` fake store and `test_fakes.ts` fake finish return `capped: false`.
- No snapshot changed.
