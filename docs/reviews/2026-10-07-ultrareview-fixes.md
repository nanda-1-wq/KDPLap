# Ultrareview follow-up batch (2026-10-07)

Status: DONE 2026-10-07. Committed c1c2287 (server), 440461b (R1),
af59144 (R2 + R4), 12c24dd (R3) and pushed. `generate` still needs a deploy.

## Results (2026-10-07)
- S2: new test failed on old code (2 cross-item quotes kept), passes now.
- S3, S4: no behavior change; snapshot diff empty.
- R1: `brief/t-partial.js` failed 7 of 14 on old code, 14 of 14 now. It also
  found a wrong message: when the Brief write failed, the page said "That
  pen name is not available". Now the message follows the field that failed.
- R2: `positioning/t-save-owner.js` failed 2 of 5 on old code, 5 of 5 now.
  Only an error with Retry stays on top; a rule error (edits already put
  back, no Retry) is shown like any other newest state.
- R3: `kdpUi.nextMonthUtc` and `kdpUi.aiMessage` in `js/ui.js`; also used by
  `pen-name.js` and `topic-import.js` where the text is word for word the same.
- R4: only `SAVE_WARN` became `ICON.warn(16)`. Follow-up idea, not done:
  `book.js` `LOCK` is identical to `book-positioning.js` `LOCK_ICON(16)`;
  both could share one `ICON.lock` later.
- Suites: generate 121 pass (snapshot unchanged), title-checks 6, parity 7,
  SQL 297, browser: every suite passes (research t-missing timed out once on
  the first load, passed on rerun).
- Clean-up done: both review branches deleted, 4 lines removed from
  `.git/info/exclude`.

Two ultrareview runs, on two local branches cut from `d146b7c` (before E7):
- `review-server` (`0fbd393`): `supabase/functions/generate` code (no tests,
  no snapshots, no `test_fakes.ts`), migrations 0007 to 0014, `js/supabase.js`.
- `review-browser` (`e4d0f7a`): `js/book.js`, `js/autosave.js`, `js/ui.js`,
  `js/book-brief.js`, `js/book-research.js`, `js/book-positioning.js`,
  `js/book-title.js`, `js/title-checks.js`.

## 1. The two reports

As pasted by the owner from the Terminal.

### Server report (review-server)
```
REVIEW 1 (review-server, free run 1 of 3): 11 found, 8 verified,
9 refuted, 4 findings:
1. RED supabase/functions/generate/handler.test.ts:36-44: Store interface
   gained 6 required methods (lib/types.ts) but the test fakes implementing
   Store were not updated. [False alarm: old test files on the branch.]
2. YELLOW lib/drift_check.ts:72-106: quote verification flattens list
   fields with newlines-to-space, so a fabricated quote spanning two
   separate lacks/selling_points/focus_tags items is accepted.
3. YELLOW index.ts:187-189: saveDriftFlags re-implements the service-role
   client bootstrap that logUsage already does.
4. YELLOW lib/context.ts:71: hasPositioningText's ternary has identical
   true/false branches.
```

### Browser report (review-browser)
```
REVIEW 2 (review-browser, free run 2 of 3): 12 found, 15 verified,
3 refuted, 8 findings:
1. RED js/book.js:54: book.html never loads the new scripts. [False alarm]
2. RED js/book.js:43: no [data-next-note] element. [False alarm]
3. RED js/book.js:115-282: ~20 kdp.* methods not defined. [False alarm]
4. RED js/book-positioning.js:151-168: getBook never fetches
   positioning. [False alarm: old supabase.js on the branch]
5. RED js/book-brief.js:115-170: Brief and book fields flush together; on
   partial failure onError reverts all fields, even ones saved. [R1]
6. RED js/book.js:157-197: sidebar save status has no owner guard; a
   later save from another step can hide an unresolved error. [R2]
7. YELLOW js/book-title.js:181: nextMonthUtc and AI error message
   switches copied in 4 step files instead of js/ui.js. [R3]
8. YELLOW js/book.js:49: book.js hand-rolls icons instead of kdpUi.ICON;
   book-positioning.js defines its own LOCK_ICON/REDO_ICON. [R4]
```

Mapping: server 2 = S2, 3 = S3, 4 = S4. Browser 5 = R1, 6 = R2, 7 = R3,
8 = R4.

## 2. False alarms (caused by the review branches, not real bugs)

The branches held only part of the repo, so some findings point at files
that exist on `main` but were left out of the snapshot.

| Report | Finding | Why it is a false alarm |
|---|---|---|
| Server | 1: Store test fakes not updated for the 6 new methods | `test_fakes.ts`, the `*.test.ts` files and `__snapshots__/` were left out on purpose. On `main` they exist and every suite passes. |
| Browser | `app/book.html` missing / step scripts not loaded | `app/book.html` was not on the branch. On `main` it loads `ui.js`, `autosave.js` and the step files in order. |
| Browser | `[data-next-note]` element does not exist | It is in `app/book.html` on `main`, which was not on the branch. |
| Browser | `kdp.*` methods called but not defined | `js/supabase.js` was only on `review-server`. On `main` every called method exists. |
| Browser | `kdp.getBook` does not return the embeds the steps read | Same cause: the `getBook` select on `main` returns them. |

## 3. Real findings and the fix for each

### S2. drift_check: a quote must come from one list item or one text field
- Today (`lib/drift_check.ts` `fieldText`): list fields are joined with
  `\n`, then `norm()` turns the newline into a space. So a quote that runs
  across the end of one item and the start of the next ("…grows No photos")
  passes the check, and the flag shows text the author never wrote.
- Fix: `fieldParts(values, field)` returns the list items, or the one text
  field as a one-item list. A quote is kept when it is inside **one** part.
- Test first in `lib.test.ts`: a quote across two `lacks` items is dropped,
  a quote inside one item is kept, a text field still matches as a whole.
  Fails on today's code, passes after.
- Behavior change (intended), only in which flags are kept. Provider request
  unchanged. The snapshot should stay the same (its drift quotes are each
  inside one item); if it changes I stop and show the diff.

### S3. index.ts: one service-role client
- `saveDriftFlags` and `logUsage` each build their own service-role client.
- Fix: one lazy helper inside `openStore`, `admin()`, that builds the client
  once per request and is used by both. No behavior change.

### S4. lib/context.ts `hasPositioningText`
- `isListField(f) ? v[f].length > 0 : v[f].length > 0`: both sides are the
  same. Fix: `v[f].length > 0`. No behavior change.

### R1. book-brief.js: a half-failed save reverts too much
- Today `save()` writes the Brief, then the book row (pen name, series).
  When the Brief write works and the book write fails with a rule error
  (for example a pen name that is no longer the user's), `onError` puts
  **every** sent field back to its old value. The Brief fields are saved in
  the database, but the page now shows the old text and its saved copy is
  stale. With a network error, Retry also sends the saved Brief fields again.
  When the Brief write fails, the book fields are never tried but are still
  reverted.
- Fix:
  1. `save()` tries both writes, each on its own, and returns which fields
     saved and which failed (`res.saved`, `res.failedFields`).
  2. `onError` first applies the part that saved, the same way `onSaved`
     does (saved copy, `book`, `updated_at`), and drops those fields from
     the edits unless the author changed them again while the save ran.
  3. On a rule error (23514, 42501, 23503) only the failed fields go back to
     their saved values. The message stays as it is.
- Test first: new browser test `tests/browser/brief/t-partial.js` with a new
  mock mode that makes the `books` PATCH fail with 42501 while the
  `book_briefs` PATCH works. Edit the topic and the pen name in one save.
  Expect: the new topic stays on screen and in the saved copy, the pen name
  goes back, the message says the pen name was not saved, and Retry does not
  resend the topic. Also the reverse (Brief fails, book works). It fails on
  today's code, passes after.

### R2. book.js: a save error in the sidebar is hidden by another step's save
- Today the sidebar keeps one `saveView`. If the Brief save fails (error with
  Retry) and the author then edits 03 Positioning, 03's "Saving…" and
  "Saved" replace the Brief error. The unsaved Brief edits are still there,
  but nothing shows it and Retry is gone.
- Fix: keep the save state per step. The sidebar shows an error while any
  step has one (the newest error, its Retry goes to that step). Otherwise
  "Saving…" while any step is saving, otherwise the saved time. A step's own
  good save clears only its own error.
- Test first: new browser test in the positioning suite (its mock serves
  both 01 and 03), with a mode that makes the `book_briefs` PATCH fail.
  Fail a Brief save, go to 03, save a card. Expect the Brief error and
  Retry still in the sidebar, and Retry sends the Brief save. It fails on
  today's code, passes after.

### R3. Shared `nextMonthUtc` and AI messages in js/ui.js
- `nextMonthUtc` is copied in six files. The texts for `monthly_limit`,
  `rate_limited`, `save_first`, `network` and the default "not available"
  are copied in the four step files and `pen-name.js`.
- Fix: `kdpUi.nextMonthUtc()` and `kdpUi.aiMessage(code)` in `js/ui.js`,
  which returns `[kind, text, retry]` for those shared codes. Each file
  keeps its own cases (no_topic, options_full, …) and falls back to the
  shared one. Texts that differ stay in their file: `pen-name.js`
  `save_first` ("…then generate") and the `topic-import.js` default ("Try
  again in a moment"). `topic-import.js` only switches to the shared
  `nextMonthUtc` and the shared texts where they are word for word the same.
- Every page that uses these files already loads `js/ui.js`.
- No behavior change. One note: `book-research.js` has no `save_first`
  case today; that code is never produced on step 02, so the shared
  fallback cannot change what it shows.

### R4. book.js: use `kdpUi.ICON` only where the icon is the same
- `SAVE_WARN` (16 px, stroke 2.2, warning path) is exactly `ICON.warn(16)`:
  replaced.
- `CHECK` (stroke 2.2 vs 2.4 in `ICON.check`), `WARN` (stroke 2 vs 2.2) and
  `LOCK` (not in `ICON`) are different: kept as they are.
- I check the strings are identical before swapping. No behavior change.

## 4. Checks after each change
- `deno check supabase/functions/generate/index.ts`
- `deno test --allow-read=supabase/functions/generate supabase/functions/generate/`
  with `__snapshots__/snapshot.test.ts.snap` unchanged (git diff empty).
- `deno test tests/title-checks.test.js`, `deno test --allow-read tests/limits-parity.test.js`
- `supabase/tests/sql/run.sh` (no SQL changes, run once at the end)
- Every browser suite: brief (t-chapters, t-length, t-missing, t-accept-all,
  t-partial), research (t-stale, t-missing), positioning (t1, t2, t-drift,
  t-accept-all, t-missing, the new R2 test), title (t1, t-note, t-hyphen,
  t-missing), delete (t-dialog).

## 5. Commits (only after the owner says "commit and push")
1. S2 + S4 + S3 (server): one commit, `generate` needs a redeploy after.
2. R1 (test, then fix).
3. R2 (test, then fix).
4. R3 + R4.
5. This doc, Status updated.

## 6. Clean-up
- `git branch -D review-server review-browser` (`-D` because they were never
  merged; both are local only, never pushed).
- Remove the last four lines of `.git/info/exclude` (the comment and the
  three patterns `tests/browser/.cache/`, `tests/browser/shots/`,
  `supabase/.temp/`). `.gitignore` on `main` already covers them.

## 7. After this batch
- Deploy `generate` (S2, S3, S4). Not done by me.
