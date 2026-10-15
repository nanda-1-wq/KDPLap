# PRODUCE gate G1: code review of E9 (05 Outline) and E10 (06 Write)

Status: 2026-10-15, written on branch `claude/produce-gate` (from main `08e722b`).
Read only. No code, migration, test or design file changed. Not committed.

## 1. Summary

- No high findings. Security holds: RLS on every new table, write privileges revoked, every function SECURITY INVOKER with `search_path = ''`, the guards check owner, book and version, and data goes into prompts escaped inside XML tags.
- 3 medium: the server's "has writing" rule for 05 Regenerate differs from the database rule the screen uses (P1), typing in long sections does full-text work several times per keystroke when the Versions tab is open (P2), and typing during "Save and check" can be lost if the tab closes (P3).
- 14 low: small rule gaps (AI check messages are not number-checked, the 100,000 cut, reserves for the outline stages, usage wording after a network error), and clean-up (duplicated prompt and fetch code, raw px in CSS, two large files).
- G4: severity and "Keep as is" both need a migration (0022 allows exactly three finding keys, and users cannot write `section_checks`). "Fix all" with one diff needs a new apply rule (0021 replaces one passage at one place). "Fix with Improve opens Custom" needs no migration and no prompt change.
- Baseline (all green, matches the expected counts): Deno 277 / 0, SQL 885 / 0, helpers 80 / 0, browser write 479 / 0. Also run: browser outline 226 / 0.

### Baseline detail

| Suite | Command | Result |
|---|---|---|
| Deno `generate` | `deno check` + `deno test --allow-read=supabase/functions/generate supabase/functions/generate/` | 277 passed, 0 failed |
| Helpers | the 11 `tests/*.test.js` commands in `tests/README.md` | 80 passed (6+7+16+5+3+16+4+3+8+9+3), 0 failed |
| SQL (port 55432) | `supabase/tests/sql/run.sh` | 885 pass, 0 fail (t0016 90, t0017 103, t0018 83, t0019 27, t0020 85, t0021 73, t0022 56, rls_cross_user 120, others 248) |
| Browser write | `tests/browser/run.sh write <t>` for all 10 tests | 479 PASS, 0 FAIL (t1 56, t-draft 44, t-empty 13, t-fixes 32, t-gen-ends 43, t-generate 48, t-idle 5, t-improve 118, t-versions 35, t-checks 85) |
| Browser outline | `tests/browser/run.sh outline <t>` for all 7 tests | 226 PASS, 0 FAIL |

The two "FAIL" matches in `t-gen-ends` are PASS lines that quote the "FAILED" card text.

### What was read

- In full: migrations 0016 to 0022; `generate/index.ts`, `handler.ts`, `lib/stages.ts`, `lib/limits.ts`, `lib/common.ts`, `lib/context.ts`, `lib/outline_ideas.ts`, `lib/outline_check.ts`, `lib/section_write.ts`, `lib/write_run.ts`, `lib/section_improve.ts`, `lib/section_check.ts`; `js/book-write.js`, `js/write-improve.js`, `js/write-checks.js`, `js/text-checks.js`, `js/autosave.js`, `js/word-diff.js`; the step 05 and 06 parts of `js/supabase.js`.
- In part: `js/book-outline.js` (gates, Generate, AI check, Approve, messages), `js/markdown-lite.js` (escaping and the two DOM readers), `css/app.css` lines 2472 to 3117 (step 05 and 06 rules) and the shared control rules.
- Not read line by line: `js/book.js`, `js/sentences.js`, `js/sse-read.js`, `js/outline-key.js`, `js/section-check-key.js`, `js/outline-checks.js`, `js/word-budget.js`, `lib/sse.ts`, `lib/types.ts`, and the test bodies (names and counts only). Their parity with the server is covered by the helper tests.
- Design 21, 22b and 22c: the state list of each screen was matched to the states in the code (all present, and named in the browser tests). The PNGs were not compared pixel by pixel.

## 2. Findings

Severity: high (data loss, security, money), medium (wrong result or clear cost), low (edge case or clean-up).
Effort: S (under 2 hours), M (half a day), L (more).

| ID | Sev | Area | File:line | Problem | Why it matters | Suggested fix | Effort |
|---|---|---|---|---|---|---|---|
| P1 | medium | Correctness, cost | `supabase/functions/generate/index.ts:238`, `:243`, `:249`; rule in `supabase/migrations/0020_generate_section.sql:192` | `getOutlineContext` sets `hasWriting` from a count of every `section_versions` row. The database rule (`section_has_writing`, 0019 and 0020) skips blank versions and partials that are not current, and counts drafts and fresh runs. 05 uses the database rule (`js/book-outline.js:96`). | A section whose only version is a discarded partial (a stopped first Generate) shows Regenerate on, then the server says "Some sections have writing", which contradicts the screen and owner answer 2 of E10.2. The other way round (only a draft, or a fresh run in another tab), the AI call runs and `replace_outline` refuses: not counted, but paid. | Read "has writing" the same way the database does, for example `any(has_writing)` from `outline_json`, which `getWriteContext` already calls. | S |
| P2 | medium | Performance | `js/book-write.js:1579`, `:1382`; `js/write-checks.js:257`, `:61`, `:263` | With the Versions tab open, every keystroke rebuilds the side panel. That calls `chk.count()`, which runs all code checks (`T.check`) on the full text, so the 400 ms debounce is skipped. Each keystroke also runs `MD.fromDom` (`:1568`) and counts words four times (`:1350`, `:1586` via `:119`, `:1403`). | On 15,000+ word sections typing may lag. **Unsure**: confirm with a browser performance profile while typing in a 16,000-word section with the Versions tab open. `tests/text-checks.test.js` pins one check run under 30 ms, but not the per-keystroke total. | Keep the tab count from the debounced refresh, update only the "Unsaved changes" row while typing, and count the words once per input. | S |
| P3 | medium | Data safety | `js/write-checks.js:180`, `:185`; `js/book-write.js:178`, `:1657` | "Save and check" pauses drafts before the version save. Typing during the pause reaches `save()`, which returns success without sending. Autosave then shows "Saved" and `hasUnsaved()` is false, so closing the tab gives no "Leave site?" prompt. | Typing in that window (the `save_version` call plus the start of the check request) is lost if the tab closes. Accept is safe because its editor is read only. **Unsure** how long the window is in practice. | While held, keep the edit dirty (a "held" result that autosave does not count as saved), or make the editor read only as Accept does. | S |
| P4 | low | AI rules | `supabase/functions/generate/lib/section_check.ts:213`, `:223` | AI check messages are not checked for numbers with no source. Every other output is: `outline_check` marks `why` (`lib/outline_check.ts:196`), and Generate and Improve mark the text. | CLAUDE.md §5: any number with no source gets "Verify: no source". The prompt asks for no numbers (`:99`), but nothing enforces it. | Run the outline number rule on each message and show the same badge as 05. | S |
| P5 | low | Correctness | `supabase/migrations/0020_generate_section.sql:488`, `:334`; `supabase/functions/generate/lib/section_write.ts:371` | At the 100,000-character cap the text is cut with `left()` / `slice()`, which can split a word or a `[Verify: no source]` marker. | A broken marker shows as plain text, is counted as words, and the code checks no longer see it as a mark. **Unsure**: no test cuts inside a marker. A `t0020` case with the cut inside a marker would confirm it. | Cut back to the last space (or sentence end) before the cap, in both places. | S |
| P6 | low | Cost, limits | `supabase/functions/generate/lib/section_write.ts:92`; `lib/limits.ts:39` | `max_tokens = min(3,400, ceil(aim × 1.6) + 200)`. At 2,000 words the cap is 3,400 tokens. English Markdown is about 1.35 tokens a word, so a reply about 20% over the asked length hits the cap. | The run then ends "max_tokens": partial, not counted, but paid. The memory notes already list Expand overshoot for E12. **Unsure**: confirm with live `section_runs.end_reason = 'max_tokens'` counts (owner, read only). | Ask for about 90% of the aim, or raise the factor to 1.8 inside the 3,400 cap. | S |
| P7 | low | Limits | `supabase/functions/generate/handler.ts:97`, `:104`; `lib/limits.ts:400` | Only `section_write`, `section_improve` and `section_check` reserve their size before the call. `outline_ideas` (up to 8,000 output tokens) and `outline_check` check only "month total under the limit". | One call can take the month past the limit by its own size. This is on top of the known race (E10.2 ultrareview #8). | Give every stage a reserve: input estimate + `MAX_TOKENS[stage]`. | S |
| P8 | low | Usage wording | `js/write-improve.js:554`, `:558`; `js/write-checks.js:137`, `:144` | A `network` error says "This attempt was not counted in your usage." A request can reach the server and then lose the reply. The server finishes and counts it, as it does for Cancel (`js/write-improve.js:574`). | The usage line can be wrong. CLAUDE.md §5 counts a lost connection. | For `network`, say the call may count (as 05 says after Stop, `js/book-outline.js:385`). | S |
| P9 | low | Input checks | `supabase/functions/generate/lib/stages.ts:329`, `:339`; `lib/limits.ts:350` | `section_improve` takes `selection`, `before` and `after` from the browser as they are. Nothing checks that they come from the section's current text. | A crafted request can run Improve on any text (the user's own quota) and save a suggestion that `apply_suggestion` will always refuse. Not a cross-user risk. | Before the call, check that `selection` occurs in `ctx.current.content` or the draft, and that `before` and `after` touch it. | S |
| P10 | low | Out of date keys | `supabase/functions/generate/lib/section_check.ts:58`; prompt at `:136`, `:139` | The section check key holds the version, the chapter, the section title, the lock time and the voice, but not the other section titles or the word target, which the prompt sends. | Renaming a sibling section or changing the target leaves the result "current". **Unsure** whether this is on purpose: the comment leaves out only the Brief and Research. | Add both to `sectionCheckKey` and `js/section-check-key.js`. `tests/section-check-key.test.js` pins the value, so it changes with the fix. | S |
| P11 | low | Accessibility | `css/app.css:2782`, `:3006` | The editor's focus ring sits 4 px inside (`outline-offset: -4px`) and the Improve menu items 2 px inside. CLAUDE.md §7 asks for a 2 px offset outside. | Small departure from the rule. **Unsure**: likely on purpose, because the scrolling card clips an outside ring. Confirm with the owner. | Keep it and record the exception in CLAUDE.md §7, or use a box-shadow ring that is not clipped. | S |
| P12 | low | Design system | `css/app.css` lines 2472 to 3117, e.g. `:2492`, `:2531`, `:2580`, `:2581`, `:2996`, `:3014` | About 87 raw px values in the step 05 and 06 rules (gaps 10px, 6px, 18px, padding 22px, 7px). Many are 1 to 3 px optical tweaks. | CLAUDE.md §7: no hardcoded sizes. | Map spacing to `--space-*`. Keep 1 px borders, and give the optical tweaks a named token or a comment. | M |
| P13 | low | Duplication | `js/supabase.js:988`, `:1030`, `:1064` | `generateStream`, `improve` and `sectionCheck` repeat the same session read, fetch headers and error-body parsing. | Three places to change for one rule (for example P8). | One private `postGenerate(input, { signal })` helper. | S |
| P14 | low | Duplication | `lib/section_write.ts:170`, `:184`, `:190`, `:223`; `lib/section_improve.ts:14`, `:122`, `:130`, `:141`; `lib/section_check.ts:123`, `:126`, `:136`, `:142`; `lib/stages.ts:297` | The voice block, the "other sections" list, `PART`, `MARKER` and the "drop the short voice" helper (`isVoiceLine` and `withoutShortVoice`) are written two or three times. `stages.ts:297` writes out `runIsFresh` (`lib/section_improve.ts:60`) inline. | A rule fixed in one copy can be missed in another. | Shared helpers in `lib/section_write.ts`. The snapshot must stay unchanged. | S |
| P15 | low | Duplication | `js/markdown-lite.js:146` to `:233` and `:271` to `:400` | `fromDom` and `fromDomMap` are two parallel DOM walkers (`blocksOf`/`blocksM`, `inlineMd`/`inlineM`, `listItems`/`listItemsM`). A test proves they agree today. | They can drift apart. | Make `fromDom` return `fromDomMap(node).md`, but only if it is not slower on the typing path. **Unsure**: measure first (P2). | M |
| P16 | low | File size | `js/book-write.js` (1,710 lines; Generate is lines 515 to 1005), `js/book-outline.js` (1,423) | Two large files. Improve and Checks were already moved out of `book-write.js`. | Hard to review, and E11 adds more. | Move Generate to `js/write-generate.js` with the same host pattern as `write-improve.js`. | M |
| P17 | low | Dead code | `js/text-checks.js:295` (`plural`, `MARKER`); `js/write-improve.js:963` and `js/write-checks.js:395` (`LIMITS` on the window object); `supabase/migrations/0001_v1_data_model.sql:294` (`section_versions.checks`) | Exports and a column with no reader. `tests/limits-parity.test.js` reads the `LIMITS` constants as file text, not through the window object. | Noise. **Unsure** for the column: no select reads it today. Confirm with a grep before any migration. | Drop the unused exports. Leave the column until E12 decides. | S |

## 3. Split

### G2 clean-up (no behaviour change)

P2 (same results, less work per keystroke), P11 (only if recorded as an exception), P12, P13, P14, P15, P16, P17.

Rule for G2: every suite stays green, the snapshot file stays unchanged, and the browser counts stay the same.

### G3 fixes (behaviour change)

P1, P3, P4, P5, P6, P7, P8, P9, P10.

Order: P1, P3, P4, then the rest.

## 4. Test gaps

1. `generate/index.ts` (the real Store) has no unit tests. Every handler test uses `test_fakes.ts`, so the queries themselves are untested: the `hasWriting` count (P1), the reading order in `getWriteContext`, and the filters in `sumRunningReserves`. A test with a fake PostgREST client, or a SQL test of the same rule, would have caught P1.
2. No test of 05 Regenerate when the only version is a discarded partial, or the only writing is a draft (P1).
3. No timing test of the typing path in a long section: `fromDom`, the word counts and the side panel together (P2). Only `T.check` (16,000 words under 30 ms) and `word-diff` (10,000 words) are timed.
4. `t-checks.js` checks that autosave waits during "Save and check" (the `__store.timeline`), but not that typing in that window stays unsaved and still triggers "Leave site?" (P3).
5. No test that an AI check message with a number gets a Verify badge (P4).
6. `t0020` cuts at 100,000 but never inside a marker or a word (P5).
7. No server test that an Improve selection is part of the section (P9).
8. `tests/section-check-key.test.js` pins the key value but not which inputs must change it, for example a sibling title (P10).
9. Design match is by state names and text. The screenshots in `tests/browser/shots/` are not compared to the design PNGs.

## 5. G4 impact map (owner walk-through, Oct 15)

No fixes designed here. This is what each part touches today.

### Why Note 1 happens ("Fix with Improve never ends")

- Fix with Improve opens the normal action menu (`js/write-checks.js:235` `fix` → `js/write-improve.js:897` `openFor` → `openMenu`). The actions keep the meaning by rule: `improveTask` (`lib/section_improve.ts:104`) says "same meaning", "Same facts", "Same meaning, facts and structure". So a drift or objective finding (a meaning problem) cannot be fixed by these actions, and it comes back.
- The AI check varies run to run. `buildRequest` (`lib/stages.ts:464`) sets no temperature. The findings are not matched to earlier ones (`lib/section_check.ts:199`), and each run replaces the row (`index.ts:393` upsert on `section_id`).

### Part A: severity on findings (major / minor)

- Files and functions: `lib/section_check.ts` (`SECTION_CHECK_SCHEMA`, `SECTION_CHECK_SYSTEM`, `interpretSectionCheck`, type `SectionFinding`); `lib/limits.ts` (`CHECK`, if severity has its own list); `js/write-checks.js` (`findingHtml`, `count`, `TYPE`, maybe a new label); `css/app.css` Checks rules (`:3061` on); design 22c (a new state).
- Migration: yes. `section_finding_ok` (0022 line 54) accepts exactly the keys `message`, `quote` and `type`, so a fourth key fails the check constraint. The 0023 replacement must accept old rows without severity, or a backfill must add it. Postgres does not recheck old rows when the function changes, but the next upsert writes the new shape.
- Prompts: `SECTION_CHECK_SYSTEM` and the schema, unless our code sets severity from the type (open question 1).
- Tests that pin today's behaviour: `t0022.sql` (shape tests, for example "a missing quote key refused"); `lib.section_check.test.ts` and `handler.section_check.test.ts`; `snapshot.test.ts` (`buildRequest section_check`, `handler section_check success` and `no problems`), which needs a re-record; `tests/limits-parity.test.js` lines 260 to 271 (0022 parity); `tests/browser/write/t-checks.js` line 120 (exact finding row text) and the `FINDINGS` data in `write/mock.js`.
- Risks: if the AI sets severity, it varies run to run like the findings do (Note 1). Old saved checks have none, so the screen needs a default.

### Part B: "Keep as is" button

- Files and functions: `js/write-checks.js` (`findingHtml` new button, `handleClick`, `count`, `refresh`, `focusKey`); `js/supabase.js` (a new call); `index.ts` `getWriteContext` or a new Store read, plus `lib/types.ts`, if the server must know what was kept; `lib/section_check.ts` (`interpretSectionCheck` and maybe the prompt).
- Migration: yes. Users have no insert, update or delete on `section_checks` (0022 line 152). Choices: an RPC that writes only a "kept" field (a guard plus a transaction-local setting, as 0020 and 0021 do), or a new user-owned table with RLS. A field on the `section_checks` row is wiped by the next check (upsert, `index.ts:393`), so it would not stop Note 1. Keeping across checks needs its own rows and a match rule (type + exact quote is the only stable key; messages change).
- Prompts: only if kept items go into the prompt ("the author kept these"). They are author and AI text, so they go through `asData` in their own tag.
- Tests that pin today's behaviour: `t0022.sql` "server only" privilege tests; `rls_cross_user.sql` (a new table must be added); `t-checks.js` (counts and rows); `handler.section_check.test.ts`.
- Risks: matching a kept finding to a new one (quote moved or reworded); whether a kept finding still counts in the tab and makes the result "Out of date" (it should not change `inputs_key`).

### Part C: "Fix all" (major findings only, with diff review and Accept)

- Files and functions: `js/write-checks.js` (a new button and flow); `js/write-improve.js` (`request`, `cardHtml` review state, `diffHtml`, `accept`, `ACTIONS`); `js/book-write.js` (`SOURCE_NAME`, `improveApplied`, `replacePassage`, which handles one passage on one line); `lib/section_improve.ts` (`improveTask`, `IMPROVE_SYSTEM`, `improveMaxTokens`, `interpretImprove`, `newNames`, `structureChange`); `lib/limits.ts` (`IMPROVE_ACTIONS`, `IMPROVE_GROWTH`, `IMPROVE`, `MAX_TOKENS.section_improve`); `lib/stages.ts` `sectionImprove`.
- Migration: yes, for any of these. A new action name must be added to `section_suggestions.action` (0021 line 61), `section_versions_guard` (0021 line 173) and the `section_versions.source` check (0001 line 291). One suggestion over several passages fails `apply_suggestion` step 7 (0021 lines 278 to 297: one selection replaced at one place) and the 15,000-character `selection` cap (0021 line 64). A queue of normal one-passage suggestions needs no apply change, but it breaks "one suggestion at a time" (decision 8).
- Prompts: a new task text that may change meaning to fix drift or objective problems inside the locked positioning, which no action allows today. Each fixed passage still needs the number rule, the markers-lost note and the new-names note.
- Limits and cost: one call per finding (N calls, the 10-a-minute limit) or one larger call (`max_tokens` 4,096 covers about 1,500 words; sections can be checked up to 6,000).
- Tests that pin today's behaviour: `lib.section_improve.test.ts` (actions, max_tokens per action, the six task blocks); `handler.section_improve.test.ts`; `snapshot.test.ts`; `t0021.sql` (action list, the one-place rule, `suggestion_mismatch`); `tests/limits-parity.test.js` lines 247 to 256 (actions and names in 0021, `write-improve.js` and `SOURCE_NAME`); `tests/browser/write/t-improve.js` (6 actions plus "Create image", every card state).
- Risks: overlapping quotes; quotes that moved after the check (Accept already refuses a changed passage); one Accept that makes a version, so the check goes "Out of date" and the next check finds new things (Note 1 again); the diff for several passages (`word-diff.js` switches to paragraphs over 2,500 words a side).

### Part D: Fix with Improve opens Custom with the finding text pre-filled

- Files and functions: `js/write-checks.js:235` `fix` (pass the message); `js/write-improve.js:897` `openFor` → `openMenu` → `renderMenu` (open with `menu.custom = true` and `menu.ask` set; the field already keeps `menu.ask`, line 401).
- Migration: no. Prompts: no. Custom already exists end to end (`lib/section_improve.ts:117`, `<instruction>` through `asData`).
- Limits: a message is at most 300 characters (`CHECK.messageChars`) and so is an instruction (`IMPROVE.instructionChars`), so the full message fits only if nothing is added in front of it. The server rejects over 300 after trim (`lib/limits.ts:358`).
- Tests that pin today's behaviour: `tests/browser/write/t-checks.js` lines 129 to 137 and 337 to 338 (the action menu opens at the toolbar button and Esc closes it). With Custom first, Esc goes back to the action menu (`menuKey`, `js/write-improve.js:461`). `t-improve.js` Custom tests.
- Risks: the AI's own message becomes the instruction. That is fine under the Custom rules, but the writer should be able to edit it before Send (pre-filled, not sent). An objective gap has no quote, so still no Fix.

## 6. Open questions

1. Severity: set by the AI (varies run to run), or by our code from the type (for example drift and objective = major, voice = minor)?
2. "Keep as is": for this check only (lost on "Check again"), or remembered across checks? If remembered, is "same type + same quote" the match? Should kept items go into the prompt?
3. "Fix all": one combined suggestion (new apply rule and a multi-passage diff), or a queue of normal suggestions accepted one by one? What happens for sections over 1,500 words?
4. Should the 05 outline AI check get severity and "Keep as is" too, or only 06?
5. P1: after a discarded partial, should 05 Regenerate be allowed? 0020 says a partial the writer did not keep is not writing.
6. P11: is the inside focus ring on the editor an accepted exception? If yes, I will add it to CLAUDE.md §7 in G2.
7. The AI check stops at 6,000 words, but a section can hold 100,000 characters (about 16,000 words). Keep that limit for v1?

## 7. Owner answers (Oct 15)

- Q1: severity is set by our code from the type: drift and objective = major, voice = minor. No AI severity.
- Q2: "Keep as is" is remembered across checks. Match on type + exact quote. Our code hides kept findings. No prompt change.
- Q3: "Fix all" = a queue of normal one-passage suggestions, major findings only, each opened as Custom pre-filled with the finding text (editable), reviewed and accepted one by one, no re-check in between. No new apply rule. A combined rewrite is an idea for later.
- Q4: 06 only. The 05 outline check stays as it is.
- Q5: yes, 05 Regenerate is allowed after a discarded partial (the 0020 rule). Fixed by P1.
- Q6: the inside focus ring is an accepted exception. Record it in CLAUDE.md section 7 during G2.
- Q7: keep the 6,000-word AI check limit for v1.
