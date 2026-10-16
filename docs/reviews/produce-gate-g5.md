# PRODUCE gate G5: severity, Keep as is, Fix, Fix major (design 22d)

Status: 2026-10-16, branch `claude/produce-g5` (not merged). STOP 2 done: 0024 committed and pushed (`334cf69`), applied by the owner through Claude chat. STOP 3 done and the live check passed (section 5, verified by Claude chat). The owner's 4 notes are fixed (section 6). Committed and pushed after "commit and push". **generate v21** is needed for note 4: deploy from `5b408a6`.
Plan: `docs/reviews/2026-10-16-g5-plan.md`. Design: `design/screens/22d-fix-states.html` (`f31ebe6`).

## 1. Owner decisions used

- G4 Q1 to Q4 (G1 report section 7): severity from the type in our code; Keep as is remembered across checks (type + exact quote); a queue of Custom suggestions, major only; 06 only.
- G5 STOP 1: a type quiet only because of Keep shows its pass row ("No drift found"); out of date, the first major shows and the rest fold ("N more major, M minor (voice)").
- G5 STOP 2: a kept gap sends `check_at` exactly as the database's string (microseconds); wordings "Leave and stop Fix major? Accepted changes stay." and, at STOP 3, "Under 3 words, too short to fix." for a short item

## 2. Files (browser part, not committed)

| File | What changed |
|---|---|
| `js/finding-rules.js` (new) | One shared place for the rules: `severity` (drift, objective major; voice minor), `sameInstant` (two database timestamps compared to the microsecond, never through Date alone), `keptOf` (quote: type + exact quote; gap: type + message + same check), `view` (open major in text order, gaps last; minor; hidden; kept list; pass rows; "No open AI findings"), `fixMajor` (the N rule), `tabCount`, `KEPT_MAX` 50, `QUEUE_MIN` 2. |
| `js/write-checks.js` | Type line "Drift · Major" / "Voice · Minor" (gray info icon); Fix (aria "Fix with AI: drift", pressed while its box is open) and Keep as is; minor fold and kept fold (open state per section while the page is open); kept list with Undo; the out-of-date fold; "No open AI findings"; the help line; "Fix major (N)" with the cost line, off with Improve's reason; the panel during the queue (7a, 8); kept rows loaded with the saved check, with a load error and Try again; Keep errors (save, 50 cap, a replaced check). |
| `js/write-improve.js` | `openFor(start, end, { ask })`: Custom pre-filled, the note, cursor at the end; Back to the action menu; Esc closes when opened by Fix. The Fix major queue (`queueStart`, `queue`, `queueRemove`): item card, Send / Skip / Stop, read only only while a call runs, suggestion with Accept / Reject / Stop, quote-gone and under-3-words skips with no call, no-change and text-changed cards with Next item, failed (Try again / Stop), refused (month limit: Close), end card and Close (focus to the Checks tab), the leave confirm. `refused()` words moved to `errorOf()` (shared, same text). |
| `js/supabase.js` | `listKeptFindings`, `keepFinding` (23505 = already kept; `check_at` passed through as read), `unkeepFinding`. |
| `js/book-write.js` | One host hook: `checksChanged` (the Checks tab follows Improve and the queue). |
| `app/book.html` | Loads `js/finding-rules.js` before `js/write-checks.js`. |
| `css/app.css` | 22d rules only, tokens only: minor icon, Keep as is, fold rows, the ring that hugs the word (`.lbl`), kept list, cost line, queue status, "Fixing now", the pressed Fix, the queue list. |

## 3. Tests

Every suite is green (2026-10-16, all on the browser part as it stands, not committed).

| Suite | Result |
|---|---|
| SQL (`supabase/tests/sql/run.sh`, all files) | 986 pass, 0 fail (t0024 57, rls_cross_user 125) |
| Generate function (deno) | 290 pass |
| Browser helpers (deno, `tests/*.test.js`) | 93 pass (new `finding-rules.test.js` 8; limits-parity 17) |
| Browser `write` | 666 pass, 0 fail: t1 56, t-draft 44, t-versions 35, t-idle 5, t-fixes 32, t-empty 13, t-generate 48, t-gen-ends 43, t-improve 120, t-checks 97, t-timing 11, t-selection 21 (+31 through `selection-check.ts`, exit 0), **t-fix 73 (new)**, **t-queue 68 (new)** |
| Browser `brief` / `research` / `positioning` / `title` / `outline` / `delete` | 161 / 77 / 159 / 75 / 226 / 1, 0 fail |

New tests:
- `tests/finding-rules.test.js`: severity map; timestamps to the microsecond (".123456" and ".123457" differ though Date calls them equal; the same moment in other offsets); kept matching for quotes and gaps; view order, kept list, pass rows, "No open AI findings"; the N rule; the tab count.
- `tests/browser/write/t-fix.js`: 22d states 1, 2, 3a, 3b, 4, 5, 9 (fold), 11, 12; a kept gap's `check_at` is the database's string `2026-10-16T11:22:33.654321+00:00`, not the Date form; the same gap on a check 1 microsecond later comes back; Keep errors; the kept-list load error.
- `tests/browser/write/t-queue.js`: 22d states 6 to 10b; Stop before Send, during the call (aborted, counts) and on the suggestion; Skip; no changes suggested; Keep as is on a waiting item; the writer changing a waiting item's text; the leave confirm.

### Changed tests and why

- `tests/browser/write/t-checks.js`
  - Finding text: "VOICE … Fix with Improve" → "Voice · Minor … Fix Keep as is"; "DRIFT" → "Drift · Major"; the gap "MISSING FROM THE TEXT" → "Missing from the text" and it now has Keep as is (22d labels).
  - Voice is minor and folded: the test opens the fold before reading voice findings (steps 2, 9 P4, 14) and waits for the fold row in 15.
  - Tab count 4 → 3: minor never counts (G5 Q1).
  - Fix opens Custom pre-filled instead of the action menu, and Esc closes it (22d, 5); step 14 presses Back before "Improve".
- `tests/limits-parity.test.js`: a new case for 0024 (types, 300-character caps, the 50 cap in 0024 and `js/finding-rules.js`, the severity map's types).
- `tests/browser/write/mock.js`: `kept_findings` GET, POST (23505, `kept_limit`, `kept_gap_not_in_check` by exact string), DELETE; modes `keepError`, `keptLimit`, `keptLoadError`, `undoError`, `keepDelay`.

## 4. Notes for the owner

- The short item's line is "Under 3 words, too short to fix." (owner, STOP 3), next to "Skipped" in the status column.
- An item whose quote is gone says "Its text changed after an earlier Accept." (22d, 8) only after an Accept in this queue. When the writer changed the text between items and nothing was accepted yet, it says "This text is no longer in the section." (the existing 22c line).
- Not drawn in 22d, built with existing styles: Keep errors, the kept-list load error, the 50 cap message, "No changes suggested" and "The text changed" in the queue (both with "Next item"), Stop during a call (the done card adds "The tokens already used count toward your usage.").
- No server change, no generate deploy. The live check needs only the browser files.

## 5. Live check (2026-10-16, after "live")

Test account, signed in by loading `.env.test` into the login form in the shell, with output discarded (never read or printed). Book 4e2dde85, local site on port 5500 from the uncommitted working tree (STOP 3 + the short-item line). ai_usage max id before: 216. No server change, no deploy.

| Step | What ran | Result |
|---|---|---|
| 1. AI check | Picked 1.1 from the saved checks (2 major with quotes, 1 minor). Check again (row **217**). | The new check found 1 major with a quote, 1 objective gap, 2 minor: "Fix major" rightly hidden (N = 1). The old check had shown as out of date with the new fold first. |
| 2. Keep as is | Kept a minor (voice) finding on 1.1; reload; Undo. | **Pass.** One kept_findings row (voice, `check_at` null); hidden after the reload ("1 kept", the kept list "Kept today"); Undo deleted it and the finding came back. "Kept. It stays hidden on later checks." and "Keep undone. The finding is back." read out. |
| 1 again | Owner's choice: one check on the Introduction (row **218**). | 4 major with quotes, 2 gaps, 1 minor: "Fix major (4)" with "Up to 4 AI calls, about $0.01 to $0.02 each." |
| 3. Fix major | Item 1: Send (row **219**), Accept. Item 2: Send (row **220**), Reject. Item 3: Stop. | **Pass.** Item 1 opened as Custom pre-filled; the editor read only during the call, editable again at the suggestion. Accept saved **v12** (source custom, 852 → 864 words); item 2 opened next; Reject made no version (v12 stayed current); Stop: "1 accepted, 1 rejected, 2 not sent"; items 3 and 4 were never sent. After the end the panel shows Out of date with the first major and "5 more major, 1 minor (voice)". Close put focus on the Checks tab. |
| 4. Restore | Versions tab: Restore v11. | **Pass.** v13 "Restored from v11", 852 words, the same text as v11; v11 and v12 kept. Status still Final; no draft. |

| ai_usage row | Stage | Tokens in / out | Counted | Cost (Sonnet 5.5, $2 in / $10 out per million) |
|---|---|---|---|---|
| 217 | section_check (1.1) | 5,020 / 324 | yes | $0.0133 |
| 218 | section_check (Introduction) | 5,174 / 579 | yes | $0.0161 |
| 219 | section_improve (item 1, accepted) | 2,885 / 58 | yes | $0.0064 |
| 220 | section_improve (item 2, rejected) | 3,119 / 57 | yes | $0.0068 |
| **Total** | | | | **$0.0426** of $0.08 |

kept_findings rows left: **0**. Suggestions: 2 made in the run, 1 used (item 1).
Queue card screenshots (uncommitted): `docs/reviews/g5-live/` (4 item 1, 5 loading, 6 suggestion 1, 7 item 2, 8 suggestion 2, 9 done).

Observations (all fixed after the live check, section 6):
- After Accept in the queue, the screen reader hears only "Fix 2 of 4: objective." The "Saved as version 12" message is replaced at once. A fix would put "Accepted. Saved as a new version." in front.
- After Undo of a minor finding while the minor fold is closed, focus goes to the Checks tab (the finding's button is folded away).
- The Needs review alert's "Run AI check" stays on while a queue runs. A check then would replace the check the queue came from. Not drawn in 22d.
- "Verify: no source for 1.2" on a 1.1 finding: the G3 number rule reads the section number "1.2" in the message as a number with no source.

## 6. Owner's notes after the live check: fixed

| Commit | Note | What changed | Tests |
|---|---|---|---|
| `2f011f6` | (the browser part as planned) | Everything in section 2. | section 3 |
| `04d4cd0` | 1 | After Accept in the queue the screen reader hears "Accepted. Saved as a new version." before the next item's message. | t-queue |
| `1d4b33f` | 2 | After Undo of a minor finding while the minor row is folded, focus goes to that row's Show. | t-fix |
| `b0883e9` | 3 | While a Fix major queue runs, the Needs review "Run AI check" and "Check again" are off with "Finish or stop Fix major first." (`aiWhy` 'queue'; the notes re-render with the queue). | t-queue |
| `5b408a6` | 4 (server, **generate v21**) | `section_check` takes this book's own chapter and section references out of a message before the number rule: "section 1.2", a bare "4.1", "chapter 3". Only numbers the book has ("section 9.9" in an 8-chapter book is still flagged); "1.2 million" and "1.1%" stay numbers. Chapter numbers are **not** added to the known numbers as bare digits: that would also hide a real "3 studies" in a book with a chapter 3. Without the outline (other callers) the rule is unchanged. | lib.section_check.test.ts: sectionRefs, withoutSectionRefs, and the live case ("purpose of section 1.2": no badge; "37 of 83 … chapter 2 … 2.1": 37 and 83 flagged; "45% … section 9.9": 45 and 9.9 flagged) |

Until v21 is deployed, the live function still flags section numbers (the browser shows what the server sends).

### Suites after the fixes (2026-10-16, at `5b408a6`)

| Suite | Result |
|---|---|
| SQL (all files) | 986 pass, 0 fail |
| Generate function (deno) | 293 pass (+3: sectionRefs, withoutSectionRefs, the live case) |
| Browser helpers (deno) | 93 pass |
| Browser `write` | 671 pass, 0 fail (t-fix 75, t-queue 71, t-checks 97, t-improve 120, others unchanged); t-selection through `selection-check.ts`: 31 pass, exit 0 |
| Browser `brief` / `research` / `positioning` / `title` / `outline` / `delete` | 161 / 77 / 159 / 75 / 226 / 1, 0 fail |
