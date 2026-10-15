# PRODUCE gate G2: clean-up, no behaviour change

Status: 2026-10-15, on branch `claude/produce-gate` (from 4e8a123). Built, not committed.
Plan: `docs/reviews/2026-10-15-g2-plan.md` (with the owner's 3 changes at the top).
Source: `docs/reviews/produce-gate-g1.md` (P2, P11 to P17, owner answer Q6).

## 1. Per item

| ID | Result | What changed |
|---|---|---|
| P2 | Done | The time was measured first. With the Versions tab open, the median was 37.2 ms at 4x CPU, over the 16 ms rule, so the fix was applied. Words are counted once per text (`curWords()`). With the Versions tab open, typing updates only the word count in the "Unsaved changes" row (`renderUnsavedRow()`); the whole panel renders only when that row must appear or go. The tab count follows 400 ms after typing stops (`chk.onInput`), as G1 proposed. |
| P11 | Done | CLAUDE.md §7 records the exception: the Write editor (4 px) and the Improve menu items (2 px) draw the focus ring inside. No CSS change. |
| P12 | Done (one value) | `.wr-cmp` uses `calc(100vw - var(--space-8))` in place of `calc(100vw - 32px)`. That is the only px value in the 05 and 06 rules with a spacing token of the exact same value. Comments mark the optical values that stay. |
| P13 | Done | `js/supabase.js` has a private `postGenerate(input, { signal, onSent })` and `generateReply(res, body, stage)`. `generateStream`, `improve` and `sectionCheck` keep the same headers, body, signal and return shapes. `onSent` is needed so autosave stays paused until the check request is sent (extra fix A). |
| P14 | Done | `lib/section_write.ts` exports `PART`, `MARKER`, `voiceBlock`, `otherSectionsLine`, `withoutShortVoice` and `runIsFresh`. The improve and check prompts use them. `stages.ts` calls `runIsFresh` in place of its inline copy. `lib.ts` exports `runIsFresh` from `section_write.ts`. |
| P15 | Dropped | fromDomMap does more work per character on the typing path. Not measured (owner). |
| P16 | Done | Generate moved to `js/write-generate.js` (`kdpWriteGenerate.create(host)`, the write-improve pattern). `confirmDialog` and the shared part of `confirmLeave` stay in `book-write.js`. `MAX_CHARS` and `RUN_FRESH` stay there too, because `tests/limits-parity.test.js` reads them as text from that file; they reach the module through the host. `app/book.html` loads the new file before `book-write.js`. Local scripts have no SRI. |
| P17 | Done | `kdpTextChecks` no longer exports `plural` and `MARKER`; `kdpWriteImprove` and `kdpWriteChecks` no longer export `LIMITS`. A grep before the change found no reader in `js/`, `tests/`, `app/`, `landing/`, `index.html` or `supabase/`. `section_versions.checks` is not touched. |

Note on P16: the host has 25 entries (23 functions and 2 constants), a little over the "about 20" in the plan. No test needed a change, so it stays in G2. A smaller host would need the render functions grouped. That is a design choice for later, not a fix.

## 2. P2 timing (tests/browser/write/t-timing.js)

16,128 words in 76,386 characters. 50 keystrokes, 60 ms apart, at the end of a paragraph in the middle of the section. "Input path" means all `input` listeners on the editor for one keystroke.

| Run | Before: median / worst | After: median / worst |
|---|---|---|
| 1x CPU, Versions tab | 14.9 / 26.0 ms | 3.5 / 26.2 ms |
| 1x CPU, Checks tab | 4.3 / 5.5 ms | 3.8 / 5.6 ms |
| 4x CPU, Versions tab | **37.2** / 56.6 ms | **6.8** / 66.6 ms |
| 4x CPU, Checks tab | 8.9 / 14.4 ms | 7.3 / 17.0 ms |

- The worst time after the fix is the first keystroke: the "Unsaved changes" row appears, so the whole panel renders once, as before.
- The 400 ms debounced Checks refresh after typing stops takes 30 to 39 ms. Before the fix it showed about 0.5 ms with the Versions tab open, because each keystroke had already run the checks.
- At 4x CPU, Event Timing still shows many key events over 16 ms from keystroke to the next paint (worst 96 ms). That time is the browser's own layout of a 16,000-word editable text, not our input code. It is the same with either tab.
- The test has no PASS line on time (owner). Its 11 PASS lines check the section size, that all 50 characters arrived, that the draft was sent, and that the Versions panel after typing equals a full render.

## 3. P12 proof

- `design/design-tokens.css:35`: `--space-8: 32px`.
- `getComputedStyle(dialog.wr-cmp).width` with the Compare dialog open, before and after: 1440 → 920px, 900 → 862px, 700 → 662px, 400 → 362px. Same values, and the same box widths. The check was a scratch test, not committed.

## 4. P14 proof

- `snapshot.test.ts` passes, and `__snapshots__/snapshot.test.ts.snap` is unchanged (`git diff --quiet`).
- A scratch script imported the HEAD copies of `section_write.ts`, `section_improve.ts` and `section_check.ts` next to the new ones. It compared 140 outputs: `writeUserMessage` (2 aims), `improveUserMessage` (6 actions, with and without the before and after text) and `checkUserMessage`, over a chapter section, a chapter section with text, the intro, the conclusion, chapter 1.1, no voice, no pen name, a chapter with one section, and no word target. It also compared `runIsFresh` on 5 runs. 0 differ.

## 5. Suites (all at the end, after every item)

| Suite | Count |
|---|---|
| Deno `generate` (`deno check` + test) | 277 passed, 0 failed; snapshot file unchanged |
| Helpers (11 files) | 80 passed, 0 failed |
| SQL | 885 pass, 0 fail |
| Browser write (10 tests) | 479 PASS, 0 FAIL |
| Browser outline (7 tests) | 226 PASS, 0 FAIL |

New test, counted on its own: `tests/browser/write/t-timing.js`, 11 PASS and 12 INFO lines.

## 6. Files

- `js/book-write.js` (P2, P16), `js/write-generate.js` (new, P16), `app/book.html` (P16)
- `js/supabase.js` (P13)
- `js/text-checks.js`, `js/write-improve.js`, `js/write-checks.js` (P17)
- `css/app.css` (P12), `CLAUDE.md` (P11)
- `supabase/functions/generate/lib/section_write.ts`, `section_improve.ts`, `section_check.ts`, `stages.ts`, `lib.ts` (P14)
- `tests/browser/write/t-timing.js` (new), `tests/README.md` (t-timing listed)
- `docs/reviews/2026-10-15-g2-plan.md`, `docs/reviews/produce-gate-g2.md`

## 7. For later

- P12: the 2, 3, 6, 7, 10, 18 and 22 px values need new tokens or new values. That changes the look, so it belongs to a design step.
- P2: the keystroke-to-paint time at 4x CPU on very long sections comes from the browser's layout of the editor. Splitting the editor would be a G3 or E12 question, not a clean-up.
