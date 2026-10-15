# PRODUCE gate G3: fixes that change behaviour

Status: 2026-10-15, branch `claude/produce-gate`. STOP 2 done: the server part is committed and pushed, and the owner applied 0023 (through Claude chat). STOP 3 done: the browser part is built, every suite is green, and it is committed and pushed after "commit and push". The owner deployed generate v20 (from `ed15fde`). **Live check done** (section 7): 2 AI calls, ai_usage rows 215 and 216, about $0.049 of the $0.15 budget. All checks that could run passed.
Plan: `docs/reviews/2026-10-15-g3-plan.md` (with the owner's 3 changes at the top).
Source: `docs/reviews/produce-gate-g1.md` (P1, P3 to P10, section 7 owner answers) and `docs/reviews/produce-gate-g2.md`.

## 1. STOP 2: what the owner does now

1. Review the commits below and migration 0023.
2. **Apply 0023 only** (owner change 1). generate v20 is deployed at STOP 3, right before the live check, after the browser part is built.
   - 0023 is safe for the live generate v19: `section_finding_ok` accepts more than before, and `section_run_finish` and `section_run_recover` keep their signatures. Their only change is a cut at a word instead of a hard cut.
   - Fill in the "Checked before writing" line at the top of 0023. Expected: last migration 0022, no function `public.write_cut`.
3. Then say so, and I build the browser part (STOP 3).

| Item | Value |
|---|---|
| `supabase/migrations/0023_g3_fixes.sql` SHA-256 | `11fd085ca9c53898d5e93c16c78526716fa4ade897a03c630245cf2d936ba74e` |
| 0023 replaces | `section_run_recover(uuid)`, `section_run_finish(uuid, text, boolean, text, text, boolean, int, int, boolean)`, `section_finding_ok(jsonb)` |
| 0023 adds | `write_cut(text, int)` (service role only) |
| Last server commit | `02bcd60` (P10). The docs commit with this report follows it. |

## 2. Commits (server part)

| Commit | Finding | What changed |
|---|---|---|
| `12f4c0a` | P1 | `getOutlineContext` reads `outline_json` and uses `outlineHasWriting` (the 0020 rule). The 3 inline `anyWriting` copies use the same helper. |
| `b64c15c` | P4 server | The number rule on each AI check message (`outlineUnsourced`, sources from `checkKnown`). 0023 part 3: the optional `unsourced` list. |
| `6bc03df` | P5 | `cutText` (TS) and `write_cut` (SQL) use the same rule. 0023 parts 1 and 2: finish and recover use `write_cut`. |
| `5f190dd` | P6 | `max_tokens = min(4,200, ceil(aim × 2.0) + 200)`. No prompt change. |
| `9437b11` | P7 | Every stage reserves its input estimate + `max_tokens` (`callReserve`), plus the running Generate runs. |
| `ce706e6` | P9 server | `selection_not_in_text` (409) unless the passage and its context are in the draft or the current version. |
| `02bcd60` | P10 server | The check key adds the word target and the other sections (`siblingParts`). The pure browser twin `js/section-check-key.js` changes with it (see 4.7). |

Commits that share a file (`stages.ts`, `lib.ts`, `limits.ts` and some tests) were staged hunk by hunk. Each commit's tree was type-checked and its Deno tests run alone before the commit: 280, 282, 284, 284, 286, 289, 290, all passing. The SQL tests were run on the P4 and P5 trees as well.
In the P4 commit, 0023 and t0023 hold only their P4 (and P1) parts. P5 completes them.

## 3. Suites at STOP 2

| Suite | Before (G2) | Now | Change |
|---|---|---|---|
| Deno `generate` (`deno check` + test) | 277 | **290** | +13 new tests (list below) |
| Helpers | 80 (11 files) | **84** (12 files) | +1 in `section-check-key`, +3 in the new `selection-in-text` |
| SQL | 885 | **924** | +39 in the new `t0023` |
| Browser write (10 tests) + t-timing | 479 + 11 | 479 + 11 | unchanged (no browser change yet) |
| Browser outline (7 tests) | 226 | 226 | unchanged |

All pass, 0 failed.

### New tests (+13 Deno, +4 helpers, +39 SQL)

- P1: `handler.outline_ideas` "only a discarded partial is not writing, Regenerate runs" and "only a draft is writing, 409 before the AI call" (G1 gap 2). `lib.outline` `outlineHasWriting`. In `t0023`: 7 P1 checks on `outline_json`, covering a new outline, a discarded partial, a blank draft, a draft, the draft gone and a fresh run (G1 gap 1).
- P4: `lib.section_check`: 2 tests (unsourced and known numbers, the cap of 10). In `t0023`: 14 shape checks plus a saved check with `unsourced`.
- P5: `lib.section_write`: `cutText` (8 cases) and `capText` at 7 offsets. In `t0023`: the same 8 `write_cut` cases, plus a vertical tab and null, finish and recover cuts, the grants, and SECURITY INVOKER with `search_path` (G1 gap 6).
- P7: `handler.outline_ideas` and `handler.outline_check`: refused at the limit before the AI call (to the token for outline_check).
- P9: `lib.section_improve`: 3 tests. One covers passages across bold, italic, list items, a heading and a marker, and the whole section, each with full and short context (owner change 2). One covers the rule cases. One covers `check()` refusing. New helper file `tests/selection-in-text.test.js` (3 tests). `handler.section_improve`: one more refusal case in the existing table (409, no call, no usage row; the test count does not change) (G1 gap 7).
- P10: `lib.section_check` checkKeyOf wiring (sibling rename, move, target, another chapter does not count). `section-check-key`: siblings parity (G1 gap 8).

### Changed tests (same count, with the reason)

| Test | Change | Reason |
|---|---|---|
| `t0020.sql` "too long: cut at 100,000" | expects `rtrim(repeat('word ', 20000))` (99,999 characters) | P5: the cut is at a word, so the trailing space goes |
| `lib.section_write` `writeAim` values, `MAX_TOKENS` 4,200 | 1100, 480, 300, 4200, 1200, 800 | P6 factor 2.0, cap 4,200 |
| `handler.section_write` request `max_tokens` | 920 → 1100 | P6 |
| `tests/limits-parity.test.js:195` | × 1.6 → × 2.0 | P6 |
| `handler.test.ts` "no settings row uses the 2,000,000 default" | 1,999,999 → 1,990,000 | P7: bio now reserves about 600 + input |
| `lib.section_write` limitError comment | "other stages: no reserve" → "no reserve given" | P7 (comment only) |
| `lib.section_improve` `check()` and `job()` helpers, and the markers test's context | the default context's text is the body's before + selection + after | P9: made-up passages (`words(1500)`, injections) must be in the section |
| `lib.section_check` "word target" assertion and the pinned part list | the target now changes the key; 2 parts added | P10 reverses the old rule on purpose |
| `section-check-key` pinned value | `9693357c0bef14d1` → `b9d39da34ee8fb03` | P10: the parts changed |
| `section-check-key` parity and "each part" cases | + target and siblings | P10 |

### Snapshot re-record (`snapshot.test.ts`)

8 lines. **No prompt text changed.**
- `writeRequest section_write`: `max_tokens: 920` → `1100` (P6).
- `handler section_check success`, `no problems`, `no voice`, `save fails`: the `inputs_key` value only (`35801b1cf28156e3` → `8e57a6157fdcc05a`, `519cf8c19e15554e` → `4b9d43b92122adb6`) (P10).

## 4. Per finding (server part)

### 4.1 P1

`getOutlineContext` reads the book and `outline_json` in parallel. `hasWriting = outlineHasWriting(rows)`, which is true when any section has `has_writing` (0020 `section_has_writing`). A discarded partial no longer blocks Regenerate (owner Q5). A draft or a fresh run is refused before the AI call. The `section_versions(count)` embed is gone.

### 4.2 P4 (server)

- Each kept finding runs `outlineUnsourced(message, known)`. `known` is the Brief, the Research, the outline and the checked text, so a message that quotes the text's own number is not flagged again.
- `unsourced` is added only when it is not empty (at most 10 numbers of at most 20 characters). The test findings have no numbers, so their shape and the snapshot findings are unchanged.
- 0023 must be in place before v20, which it will be under the new order.

### 4.3 P5

The rule, the same in both places:
1. At most 100,000 characters: the text is unchanged.
2. Inside a word: back to the last whitespace. With none at all, the hard cut stays.
3. A marker that spans the cut: back to its start.
4. Trailing whitespace is trimmed.

The same 8 strings are tested in TS and SQL. One SQL detail: `E''` strings have no `\v`, so `write_cut` uses `chr(11)` for the trim set and a plain-string regex (as `md_word_count` does). A test checks that a vertical tab counts as a space and the letter v does not. `section_run_beat` still uses `left()` for the raw crash copy, which `section_run_recover` cuts when it saves it.

### 4.4 P6

| Aim | Old max_tokens | New |
|---|---|---|
| 50 | 280 | 300 |
| 300 (Write more) | 680 | 800 |
| 450 | 920 | 1,100 |
| 500 (no target) | 1,000 | 1,200 |
| 2,000 | 3,400 | 4,200 |

A 2,000-word reply 25% long (2,500 words) needs about 3,425 tokens at the measured 1.37 tokens a word. It fits in 4,200 even at 1.6 tokens a word. Worst case per run (Sonnet 5.5 at $2 in and $10 out per million): input about 8,300 tokens = $0.017, plus output 4,200 = $0.042, total ≈ $0.059 (was ≈ $0.051). At about 60 tokens a second, 4,200 tokens take about 70 s, under the 100 s soft deadline.

### 4.5 P7

`handler.ts` builds the request before the limit check. `reserve` is `job.reserve` (section_write, improve and check), otherwise `callReserve(request)` (system + user characters / 3, + `max_tokens`). `sumRunningReserves` now runs for every stage, which adds one small read per call.

### 4.6 P9 (server)

`selectionInText([draft, current], selection, before, after)` is true when there is one place where the selection occurs, the trimmed text before it ends with the trimmed `before`, and the trimmed text after it starts with the trimmed `after`. The check comes after the word limits. **Owner change 2:**
- Every Markdown case passed the server rule as written, so the rule did not change: bold, italic, list items, a heading, a marker and the whole section.
- Two test sets show it: hand-built cases in `lib.section_improve`, and the browser's own `snap` and `context` in `tests/selection-in-text.test.js`.
- The browser DOM part (the Markdown the editor builds) is tested at STOP 3 in `t-improve.js`.

### 4.7 P10 (server)

- `sectionCheckKey` takes `wordTarget` and `siblings`, which are appended to the parts. `siblingParts(kind, sections, ownId)` gives `"<n> <title>"` for the other sections of a chapter, as the prompt numbers them, and nothing for the introduction or the conclusion.
- `js/section-check-key.js` is changed in the same commit because `tests/section-check-key.test.js` compares the two functions. It now takes the same parts, and `kdpSectionCheckKey.siblings` is the browser copy of `siblingParts`.
- The page does not pass the new parts yet: `keyNow` comes at STOP 3. Until then, a check saved by v20 would show "Out of date" on a page without the STOP 3 change. Under the new deploy order, v20 goes out after the browser part, so this only affects the live site (main) until the branch is merged.
- Every saved check shows "Out of date" once after the deploy.
- Known gap, not in G3: the chapter number is still not in the key (the prompt sends it).

## 5. STOP 3: the browser part

### 5.1 Per finding

| ID | Files | What changed |
|---|---|---|
| P3 | `js/book-write.js`, `js/write-checks.js` | The `pauseDrafts` host entry calls `hold(on ? 2 : 0)`, the same hold Accept uses. From "Save and check" until the check request is sent, the editor is read only (`contenteditable=false`, `aria-readonly=true`, the existing grey style) and autosave is paused. Typing in that window does nothing, so nothing can be lost. Every exit path of `run()` calls `pauseDrafts(false)`. |
| P4 | `js/write-checks.js`, `css/app.css` (1 rule) | A finding with `unsourced` shows the step 05 badge: `<span class="check-badge warn">⚠ Verify: no source for 45</span>`, after the message. `.check-badge` does not wrap, so one rule lets it wrap inside the narrow panel: `.wr-chk-find .check-badge { white-space: normal; }`, the same as `.ttl-chips .check-badge` in step 04. |
| P8 | `js/write-checks.js`, `js/write-improve.js` | After a `network` error. AI check: "The AI service did not respond." / "If the AI had already finished, this call may still count." Improve: "We couldn’t reach KDP Lab. Check your connection." / "Your text is safe. If the AI had already finished, this call may still count." Other codes are unchanged. |
| P9 | `js/write-improve.js`, `js/book-write.js` | Before the Improve call, unsaved typing is saved as the draft (the `flush` host entry; nothing is sent when nothing is unsaved). The new code shows a warning card with Try again: "We couldn’t find the selected text in your saved section. Try again." / "Your text is safe. This attempt was not counted in your usage." |
| P10 | `js/write-checks.js` | `keyNow` passes `wordTarget` and `siblings` (`kdpSectionCheckKey.siblings`). The browser outline comes from `outline_json`, the same source the server reads. |

### 5.2 Owner change 2: selections made in the real editor

New browser test `tests/browser/write/t-selection.js`, with `tests/browser/write/selection-check.ts`, which runs the function's own `selectionInText` on each request the page sent:
`tests/browser/run.sh write t-selection.js | deno run tests/browser/write/selection-check.ts`

| Case (selected in the editor) | Request sent | Part of the saved text | Server rule |
|---|---|---|---|
| inside bold | PASS | PASS | PASS |
| across bold and italic | PASS | PASS | PASS |
| across the marker into a list item | PASS | PASS | PASS |
| across list items | PASS | PASS | PASS |
| a list item into a heading | PASS | PASS | PASS |
| a heading into a paragraph | PASS | PASS | PASS |
| italic at the end of the section | PASS | PASS | PASS |
| the whole section (first to last character) | PASS | PASS | PASS |
| the whole section with Ctrl+A | PASS | PASS | PASS |
| typed just before Improve (also: the draft is saved before the request) | PASS (+1) | PASS | PASS |

Every case passed, so the rule did not change. One note: a test range set on the editor element itself (`selectNodeContents`) gets no floating Improve button. A real Ctrl+A does get one (the Ctrl+A row above), so this is not a bug a writer meets.

### 5.3 Suites at STOP 3

| Suite | G2 | STOP 2 | STOP 3 |
|---|---|---|---|
| Deno `generate` | 277 | 290 | 290 |
| Helpers (12 files) | 80 | 84 | 84 |
| SQL | 885 | 924 | 924 |
| Browser write (10 tests) | 479 | 479 | **491** (t-checks 85 → 95, t-improve 118 → 120) |
| t-timing | 11 | 11 | 11 |
| t-selection + server rule (new) | n/a | n/a | **31** (21 browser + 10 server rule) |
| Browser outline (7 tests) | 226 | 226 | 226 |

All pass, 0 failed.

New browser checks:
- t-checks +10: P3 read only during the save, typing then adds nothing, editable again after the send; P8 network; P10 current with the new parts, a sibling renamed, a new target; P4 badge, no badge, no sideways scroll.
- t-improve +2: P8 network, P9 message.

Changed (same count, with the reason):
- `t-checks` section 6: "the typing during the save is sent as a draft after the call" becomes "typing after the call is sent goes out as a draft". P3: typing during the save is not possible any more, so the test types after the send.
- `t-checks` `keyOf` helper: passes the target and the siblings (P10).
- `write/mock.js`: `__chk` and `__imp` get `fail()` (a lost connection). `__chk.pending` holds `{ resolve, reject }`, a helper change.

Screenshots: `tests/browser/shots/write/t-checks-verify-badge-*.png`, `t-improve-not-in-text-*.png`.

### 5.4 Commits (browser part)

| Commit | Finding | Files |
|---|---|---|
| `26dde34` | P3 | `js/book-write.js`, `js/write-checks.js`, `t-checks.js` |
| `bda3682` | P4 browser | `js/write-checks.js`, `css/app.css`, `t-checks.js` |
| `bc87212` | P8 | `js/write-checks.js`, `js/write-improve.js`, `write/mock.js`, `t-checks.js`, `t-improve.js` |
| `7d0073e` | P9 browser | `js/write-improve.js`, `js/book-write.js`, `t-improve.js`, `t-selection.js` (new), `selection-check.ts` (new), `tests/README.md` |
| `5709f1d` | P10 browser | `js/write-checks.js`, `t-checks.js` |

Files shared by several findings were staged hunk by hunk. The mixed blocks in `t-checks.js` and `t-improve.js` were built by hand for the in-between commits. Every staged JS file passed `node --check`. The browser suites ran on the final tree (all green, section 5.3), not on each in-between commit, because the test server on port 5500 serves the working tree.

## 6. Next: deploy and the live check

1. Done: "commit and push".
2. The owner deploys generate v20 from the Mac (index.ts and lib as on the branch).
3. After "live", on the test account, test book 4e2dde85, $0.15 at most:
   - P1: Regenerate after a discarded partial.
   - P4: an AI check with a number in a message, if one appears.
   - P6: Generate one section with a 2,000-word aim and read `end_reason`.
   - P10: an old check shows "Out of date" once.
   The report will list the `ai_usage` rows used.

## 7. Live check (2026-10-15, generate v20 from `ed15fde`, 0023 applied)

Test account, signed in by loading `.env.test` into the login form in the shell, with output discarded (never read or printed). Book 4e2dde85, local site on port 5500 from `ed15fde`. ai_usage max id before: 214.

| Step | What ran | Result |
|---|---|---|
| P10, old checks | Opened 1.2 and the Introduction, which have checks saved before G3. The checked version = the current version and there is no draft, so only the key could have changed. | **Pass.** Both show "Out of date". |
| P4 + P10 once | "Check again" on 1.2: one AI check (row **215**). Then a reload. | **Pass.** 3 findings, none with a number in its message, so no badge and the saved row has the 3-key shape (as designed: "if one appears"). After the reload the new check is current: "Out of date" showed once. |
| P1 | `outline_ideas` sent directly (the 05 button is off on this book: every section has writing). | **Pass (refusal half).** 409 `has_writing`, no AI call, no usage row. v20 reads "has writing" from `outline_json` without error. The positive half (Regenerate runs after a discarded partial) needs a book whose only writing is a discarded partial, which this book cannot be. The owner chose to keep the refusal check, plus the unit test (handler) and the SQL test (`t0023`, `outline_json` gives `has_writing` false for a discarded partial). |
| P6 | Owner's choice: 7.1 (Conclusion) target 300 → 2,400 in 05, so the aim is 2,000. Then one Generate (row **216**). | **Pass.** `end_reason = complete`, exact tokens (5,257 in, 2,610 out), 27 s. `reserved_tokens = 9,284` = input estimate + **4,200** (the new cap is live). It wrote 1,606 new words (343 → 1,949), v6 "Continued". |

Cleanup (no AI calls): 7.1 restored to its v5 text as v7 "Restored from v5" (343 words, the same text as v5; nothing overwritten). Target back to 300. Status still Final. The target edit had cleared the outline approval, so the outline was approved again (`approve_outline`).

| ai_usage row | Stage | Tokens in / out | Counted | Cost (Sonnet 5.5, $2 in / $10 out per million) |
|---|---|---|---|---|
| 215 | section_check | 4,838 / 280 | yes | $0.0125 |
| 216 | section_write | 5,257 / 2,610 | yes | $0.0366 |
| **Total** | | | | **$0.0491** |

**Observation for P6:** this reply used **1.63 tokens a word** (2,610 tokens for 1,606 words by the `md_word_count` rule, which counts neither the Markdown marks nor the markers). E10.2 measured 1.37. The factor 2.0 assumes at most 1.6 tokens a word for a reply 25% over the aim. At 1.63 tokens a word, a 2,500-word reply needs about 4,075 tokens: still under 4,200, but only about 125 to spare. If more runs show 1.6 or more, the next step would be a factor of 2.1 (cap 4,400). It stays a watch item, not a fix: this run ended "complete" well under the cap.

Left as is: the Introduction and 1.1 still show their pre-G3 checks as "Out of date" (expected, per P10). 1.2 now has a current check.
