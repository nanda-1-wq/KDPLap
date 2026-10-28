# E12 step 4: fix batch 3 (from finishing the real book)

Status: STOP 1 answered (2026-10-28). Part 1 (designs DG1 to DG4) is next, then STOP 2.

## Decisions (owner, 2026-10-28)
| Q | Answer |
|---|---|
| Q1 | **Rule 1**: `words_month()` in migration 0026. |
| Q2 | Yes. A Brief range fills the bar against its low end. |
| Q3 | **B**: a completed book stays editable and reopens on its own. **Changed, see D1.** |
| Q4 | No. Open Verify marks do not block "Mark book as completed". |
| Q5 | Yes. "later in this chapter" stays in the counted `mention` row. The new info row covers back references only. |
| Q6 | No v25. "research shows / studies show / experts say" goes on the watch list for the Write prompt. |
| Q7 | Yes. The card's "Needs review" badge also counts sections. |
| Q8 | Yes. The card counts saved versions only. |

**D1 (Q3 change).** A new version on a Final section does **not** reopen a completed book. That covers save_version, restore_version, a Generate finish and an Improve apply. Only these events reopen it:
- a section leaves Final;
- `needs_review` is set on a section or a chapter;
- a section or a chapter is added;
- the outline approval is cleared.

A Generate finish that sets `needs_review` (the positioning is unlocked) reopens the book through the second event, not through the new version. New SQL test: a `save_version` on a Final section of a completed book keeps `books.status = 'completed'` (and the same for `restore_version`).

**D2 (item 5a change).** "research", "study", "studies", "science" and "evidence" are **not** flagged when "this", "that", "these", "those" or "the same" comes right before them. The source is usually named in the sentence before. Test: "Lally's study followed 96 people. This research shows the habit took 66 days." is not flagged.

**D3 (the owner's question: does "Source not named" block "Ready to mark Final"?).** **Yes.** `kdpFindingRules.ready()` lists every counted warn row as something left to do (`js/finding-rules.js:194`), and `write-checks.js:800-803` passes all warn rows to it. So today a false alarm keeps the section out of "Ready to mark Final". It never blocks the status itself: the status select still sets Final (`js/book-write.js:478`, no Ready check). It does count toward "Mark book as completed" only through the status, never through Checks.

**Proposal: the new phrases are info only. No "Keep as is" for code rows.**
- "Source not named" (warn, counted, blocks Ready) keeps what it has today, plus "according to (a|one|another|some) source(s)". Those phrases have no name by their wording, so a false alarm is very rare.
- A new info row **"Check that the source is named"** gets the guessed phrases: "research/studies/science/evidence shows…" and "experts/scientists/researchers/doctors say…", with the D2 rule. Sub text: "Name the author or the title in this sentence or the one before." It is not counted, does not block Ready, and Show selects each sentence. It sits right after the Source row.
- Why not "Keep as is": `kept_findings` (0024) holds AI findings only ("objective" / "voice" / "drift", matched by quote). Code rows are worked out again on every keystroke. Keeping one would need a new type in 0026, a quote match on code rows, and Undo in the kept list. That is more parts for a row that an info row solves. It can still come later if the info row turns out too noisy.

## Context
The owner is finishing the real book. That surfaced 5 gaps. The Books card always shows 0 words written. "Words this month" is fixed at 0. Nothing marks a book completed. Clearing "Needs review" means one click per section. And Checks miss some vague sources and back references.

Today: generate v24, migrations up to 0025. Suites: helpers 153, browser 1,704 (write 796), generate 317.

## Findings while planning (facts, with places)
- **F1, a real bug in item 1.** `chapters.word_target` is always null. Since 0016 a check keeps it null (`0016_outline_rules.sql:64-68`: "a chapter total is the sum of its sections"). `wordsText()` sums chapter targets (`app/dashboard.html:103`), so `planned` is always 0 and the card always falls back to the Brief. 06 Write sums `sections.word_target` (`js/book-write.js:790`). The card must use the same sum.
- **F2.** `section_versions.word_count` is set on the server from `md_word_count` (`0018:108`, `0021:184`). That makes it the one source of truth for saved words. `kdpWords.count` matches it, and a parity test exists (`tests/word-count.test.js`).
- **F3.** The card's "Needs review" badge reads `chapters.needs_review` only (`app/dashboard.html:164`). 06 Write reads the sections (`js/book-write.js:798`). Only `approve_outline` clears chapters. Sections are cleared by Mark as reviewed or by a Reviewed or Final status (`js/book-write.js:478-532`).
- **F4.** RLS lets the owner update `books.status` directly. `books_update_own` checks only `user_id`, the topic and the pen name (`0001:446-461`). No column grant or trigger guards `status`. The only books guards are the title review guard (0011) and the outline approval guard (0017).
- **F5.** The Write prompt already has the source rule, since v24 (`supabase/functions/generate/lib/section_write.ts:194`): *"Never write "a source", "another source", "one source" or "research suggests" without a name."* Item 5 does not need a new prompt rule.
- **F6.** "Source not named" exists (`js/text-checks.js:184` `VAGUE_SOURCE`). It catches "another source", "the other source(s)" and "other sources" always. It catches "a / one / some source(s)" only before a reporting word. It misses "according to a source", "research shows", "studies show" and "experts say".
- **F7.** "Mentions another part of the book" exists (`js/text-checks.js:175` `MENTION`, a counted warn row). It already flags "later in this chapter" and "later in this/the book", plus "next/following section/chapter" and "chapter 4". Back references ("earlier in this chapter", "earlier in this book") are allowed on purpose (`:174`). The prompt even suggests them (`section_write.ts:154`). Nothing checks them today.
- **F8.** Export reads only the `number` row from Checks (`js/export-rules.js:91-97`). New Checks rows do not change Export.

## Order and STOPs
| Part | What | Needs | STOP |
|---|---|---|---|
| 0 | This plan | — | **STOP 1**: owner answers Q1 to Q8 |
| 1 Design | DESIGN GAPs DG1 to DG4 (2 screen files + PNGs) | — | **STOP 2**: design review |
| 2 Server | Migration 0026 (only if Q1 = rule 1 and/or Q3 needs it) + SQL tests | Claude chat applies 0026 | **STOP 3**: review, then "apply" |
| 3 Browser | Items 1 to 5 | 0026 live | **STOP 4**: review + screenshots |
| Live check | Test account | $0 (no AI calls) | **STOP 5**: merge |

Generate stays v24 unless Q6 = yes. Then a v25 Part is added before Part 3, with its own STOP and a "deploy".

---

## Item 1. Books card word bar
- **Rule:** written = the sum of `word_count` over each section's **current version** (saved words only; an unsaved draft is not counted, see Q8). Target = the sum of `sections.word_target` (F1). If that is 0, the Brief's custom `target_words`. If there is none, the Brief's `length_range` (bar against the low end, Q2). If there is none, "No word target yet" with the written words alone.
- **Text:** "4,210 of 11,000 words". "4,210 of 8,000 to 12,000 words". "4,210 words · no target yet". The bar is capped at 100%. A completed book keeps 100% (existing code).
- **Load in one query, no migration.** Extend the embed in `kdp.listBooks()` (`js/supabase.js:157`):
  `chapters ( needs_review, sections ( word_target, needs_review, status, current:section_versions!sections_current_version_id_fkey ( word_count, created_at ) ) )`.
  The FK hint is needed because two FKs join sections and section_versions. It returns a to-one object, or null when the section has no version yet. RLS on all three tables limits it to the owner's own rows. Item 2 rule 2 and item 3 (the "Mark completed" state on the card) reuse this data.
- **F3 fix (Q7):** the badge shows when any chapter **or** any section needs review.
- **Files:** `app/dashboard.html` (`wordsText`, `cardHtml`, a helper `bookWords(book)`), `js/supabase.js` (`listBooks`).
- **Migration:** no. **Generate:** no.

## Item 2. "Words this month" (owner chooses)
| | Rule 1: words added this month (recommended) | Rule 2: words in sections saved this month |
|---|---|---|
| Counts | For each section: current version words now, minus the words of its newest version made before the 1st (UTC). Below 0 counts as 0, so a cut never subtracts. A section new this month counts all its words. | The sum of current version words where that version was made on or after the 1st (UTC). |
| Meaning | Real progress this month | Overstates: one changed word in an old 2,000-word section counts 2,000 |
| Cost | **Migration 0026**: `words_month()` (security invoker, RLS, returns `{ month_start, words }`), SQL test suite `t0026`, **1 RPC per Books load** (runs alongside `usage_month`, same pattern as `loadUsage`) | **No migration, 0 extra queries.** It uses item 1's embed (`current.created_at`). Browser only. |
| Limits | "Newest version before the 1st" can be a version saved aside ("Keep saved version") and not the current one. That case is rare and only shifts the number a little. Sections of deleted books are not counted. | — |
- **States:** loading (skeleton, as the usage card), value + "since Oct 1, across all books", error "–" + "Not available right now" (as usage, `app/dashboard.html:132-139`).
- **Files:** `app/dashboard.html` (`statsHtml`, `load`); rule 1 also `js/supabase.js` (`getWordsMonth`) and `supabase/migrations/0026_…sql`.

## Item 3. "Mark book as completed" and "Reopen"
- **When it is allowed (recommended, Q4):** the outline is approved (`outline_approved_at` set), the book has at least 1 section, **every** section is Final and has text, and no section or chapter needs review. Open Verify marks do not block it, because Export already warns about them.
- **RLS:** the owner can already set `status` (F4), so a browser-only version would work. **Recommended:** migration 0026 adds `complete_book(p_book_id)`, which checks the rule on the server. A guard trigger then lets `status` become `completed` only through that RPC. This is the same pattern as `approve_outline` in 0017, so the rule cannot be skipped by a stale tab. "Reopen" is a plain `updateBook(id, { status: 'in_progress' })`, allowed by RLS and the guard.
- **What a completed book looks like (Q3, recommended option B: editable, stays honest):**
  - Everything stays editable. A trigger reopens the book on its own when the rule stops being true: a section leaves Final, a section gets "Needs review", a section or chapter is added, a chapter gets "Needs review" (an unlock of 03), or the outline approval is cleared. "Completed" then always means the rule holds (one source of truth). **D1:** a new version on a Final section does not reopen it.
  - Books card: a "Completed" pill instead of the step (exists, `app/dashboard.html:95`), a full bar, the Completed filter tab (exists). The ⋯ menu gets "Reopen book".
  - Book shell (`js/book.js`): a gray info strip on every step: "This book is marked completed." plus a "Reopen book" button.
  - 06 Write manuscript panel: a "Mark book as completed" button under the word count. When the rule fails, the button is disabled and a line says why: "6 sections are not Final yet · 2 need review". No confirm dialog, because Reopen undoes it.
  - Other options: **A, read-only** (Write, Generate, Improve and steps 01 to 05 locked until Reopen). That needs a generate change (v25) and server guards on save_version, so it is much bigger. **C, label only** (no auto-reopen). That needs no trigger, but a completed book can drift.
- **Files:** `js/book-write.js` (button + rule state), `js/book.js` (strip), `js/book-actions.js` (menu item), `js/supabase.js` (`completeBook`, `reopenBook`), `app/dashboard.html` (menu callback), `supabase/migrations/0026_…sql`.
- **Migration:** yes (recommended). **Generate:** no (B or C).

## Item 4. "Mark all as reviewed" (one chapter, whole book)
- **Same rule as the per-section action** (`js/book-write.js:507-532`): only `needs_review` is cleared, and the status stays. Chapters' `needs_review` is not touched (approving the outline still owns that, `0017:214-219`).
- **Data:** a new `kdp.markSectionsReviewed(chapterIds)` sends one update: `sections.update({ needs_review: false }).in('chapter_id', ids).eq('needs_review', true).select('id, updated_at')`. That is at most 30 chapter ids, so the URL stays short. It is one statement (all or nothing) and is allowed by RLS. **Migration:** no.
- **Confirm dialog** (reuse `host.confirm` in book-write.js): "Mark 7 sections as reviewed?" / "Check them against 03 Positioning first. Their status stays the same." / [Cancel] [Mark 7 as reviewed]. For a chapter: "Mark 3 sections in Chapter 2 as reviewed?". After saving, the message uses the count the server returned ("Marked 7 sections as reviewed."), because another tab may have changed some.
- **Where:** the book level goes in the manuscript panel head ("7 sections need review" + button), shown only when the count is above 0. The chapter level is a small button at the top of the open chapter's list, shown only when that chapter has a section that needs review. Both are disabled while Generate chapter runs or the open section is mid-apply (`locked()`).
- **Files:** `js/book-write.js`, `js/supabase.js`.

## Item 5. Checks rows
- **5a, extend the existing "Source not named" row, no new row** (F6). Add to `VAGUE_SOURCE` in `js/text-checks.js`:
  - "according to (a|one|another|some) source(s)";
  - "(research|studies|science|evidence) (shows|suggests|says|finds|found|has shown|have shown|tells us|confirms)" when no name comes before it. "Recent research shows" is flagged. "Smith's research shows", "her/his/their research shows" and "research by …" are not;
  - "(experts|scientists|researchers|doctors) (say|agree|recommend|suggest)".
  - The rule for "a source" / "one source" stays as it is ("a source of stress" is fine). The sub text becomes "Name the author or the title, or cut it."
  - **Changed by D2 and D3:** only "according to … source(s)" joins the Source row. The research/studies and experts phrases go to the new info row "Check that the source is named", and "this/that/these/those/the same" before the noun is not flagged.
- **5b, a new info row** `backref`: "Points back to another part" / "Check that it points to the right place." It is info, so it is never counted, and Show selects each sentence. It matches "earlier in (this|the) (chapter|book|section)", "in the (previous|last) (chapter|section)" and "as (mentioned|described|covered|shown) earlier". It goes right after the `mention` row.
  - "later in this chapter" stays in the counted `mention` row (E12 Part 3 rule: no previews), so it does not move. See Q5.
- **Write prompt:** no change needed (F5). The rule has been there since v24. Q6: optionally widen it in v25 to also say "research shows" / "studies show" / "experts say".
- **Files:** `js/text-checks.js` (header comment: ten rows), `tests/text-checks.test.js`. `js/write-checks.js` needs no change, because info rows already render (the `repeat` row).

---

## Design first: DESIGN GAPs
- **DG1, Books card and stats** (`design/screens/01b-books-words-states.html` + PNGs at 1440 and 900). Card: target from sections, Brief custom target, Brief range, no target, 0 words, over target, completed, Needs review from a section. Stat "Words this month": value, loading, error, start of the month (0).
- **DG2, Completed** (in `design/screens/22f-review-complete-states.html`). The Write panel button enabled. Disabled with reasons. Saving. Error with Retry. Done. The book shell "marked completed" strip. Reopen saving and error. The card ⋯ menu with "Reopen book".
- **DG3, Mark all as reviewed** (same file). The book-level head line + button. The chapter-level button. Both confirm dialogs (book, chapter) with counts. Saving. Error with Retry. Done (the message, the head line gone). None left (hidden).
- **DG4, Checks rows** (same file, 1 panel). The new info row "Points back to another part", the new info row "Check that the source is named" (D3), and the Source row with "according to a source", in the 22c row style. Plus the Ready block when only info rows are left (Ready). Wording only, no new parts.

## Tests to add
- **Helpers** (`tests/*.test.js`, deno):
  - `text-checks.test.js`: D2 ("Lally's study followed 96 people. This research shows…" not flagged; "this/that/these/those/the same study" not flagged). D3: the new phrases are in the info row, not the Source row, and do not count. Each new 5a phrase flagged, each named case not flagged ("Smith's research shows", "their research shows", "a source of stress"), the backref row is info and not counted, its order, and "later in this chapter" still in `mention`.
  - A new `book-words.test.js`, if `bookWords()` moves to a shared file (`js/word-budget.js` gets `kdpWords.bookProgress(book)`): section sums, the Brief fallbacks, null versions, the cap at 100%, and rule 2 if chosen.
- **SQL** (`supabase/tests/sql/t0026.sql`):
  - `words_month`: a new section, an old section edited, a cut floored at 0, the month start in UTC, RLS cross-user.
  - `complete_book`: refusals for each failed rule, a direct `status = 'completed'` refused by the guard, Reopen allowed.
  - The auto-reopen triggers: status, needs_review, add section, chapter review, outline approval cleared.
  - D1: a `save_version` and a `restore_version` on a Final section keep the book completed.
  - Add to `rls_cross_user.sql`.
- **Browser** (`tests/browser/`):
  - `books/t-words.js`: card texts for each target kind, the stat, the section badge. Mocks in `shared/e11.js` get `sections`/`current`.
  - `write/t-review-all.js`: counts, both dialogs, Cancel, saving, error and retry, the returned count, disabled while Generate chapter runs.
  - `write/t-complete.js`: disabled reasons, done, the shell strip, Reopen.
  - `books/t-badge.js`: the Reopen menu item.
- Every existing suite stays green: helpers 153, browser 1,704, generate 317, SQL.

## Live check (test account, `.env.test`, user 1e117c74; after "live")
No AI calls: **$0**. If v25 is chosen: +2 Write calls, about $0.04 (Live B was $0.018 per call).
1. **Books:** test book 4e2dde85. The card words equal the sum of the current versions (read through the test session's REST, as in live.sh). They match the 06 Write manuscript total when no draft is open.
2. **Words this month:** note the value. Save a manual edit that adds about 20 words in 7.1. Reload: the value grows by that much (rule 1) or by all of 7.1's words (rule 2).
3. **Mark all reviewed:** Unlock 03, then lock it again, then approve 05 again (this clears the chapters). 06 shows the sections as "Needs review". Mark one chapter (check the count in the dialog and the message), then the whole book. The card badge goes, and the Export "Needs review" note goes.
4. **Completed:** the button is disabled with reasons. Set every section Final (Playwright, status select). Mark completed: the card shows Completed, the Completed tab, the shell strip. Set one section to Draft: the book reopens on its own (option B). Reopen from the card menu works. Afterwards the statuses are put back to what they were before (noted in the results).
5. **Checks:** in 7.2, type "Research shows that sleep helps.", "Smith's research shows it too.", "As covered earlier in this chapter, breathe slowly." and "Later in this chapter you will try it.". The results should be: the Source row (1 sentence), no flag for Smith, the backref info row (not counted), and the mention warn. Then restore the version (as in E10.4: v3 = v1).
6. Results and screenshots go to `docs/reviews/e12-fix3-live/`.

## Questions for the owner
- **Q1:** Words this month: rule 1 (words added, migration 0026, 1 RPC) or rule 2 (sections saved this month, no migration)? Recommended: **rule 1**.
- **Q2:** Brief range target: fill the bar against the **low end** (8,000 of "8,000 to 12,000")? Recommended: yes.
- **Q3:** A completed book: **B, editable and reopens on its own** (recommended), A read-only, or C label only?
- **Q4:** The rule: outline approved, every section Final and with text, nothing needs review. Should open Verify marks also block it? Recommended: no.
- **Q5:** "later in this chapter" stays a counted warn (no previews), and the new info row covers back references only? Recommended: yes.
- **Q6:** Generate v25 to widen the prompt rule to "research shows / studies show / experts say"? Recommended: **no for now**. The rule exists since v24 and the Checks row catches the rest. Add it to the watch list.
- **Q7:** The card's "Needs review" badge should also come from sections (F3)? Recommended: yes.
- **Q8:** The card counts saved versions only, so it can be lower than 06 Write while a draft is unsaved. Is that OK? Recommended: yes (that is "current version", as asked).
