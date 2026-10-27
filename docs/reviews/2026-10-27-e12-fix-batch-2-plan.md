# E12 step 3: fix batch 2 (from the real book)

Status: STOP 4 (2026-10-27). Part 3 designs 22e and 23b are committed and pushed, for your design review. Results and questions are in "Part 3 results" at the end. No code yet. Branch `claude/e12-fixes`.

## Context
The owner wrote the first real book on their own account: "Micro Study Habits for Busy Adult Learners" (5 chapters, about 11,000 words, DOCX). Claude chat reviewed it, along with the owner's "what hurts" list. That gave 11 items. Today: generate v23, migrations up to 0025. Tests: generate 307, helpers 137, browser 1,567 (write 684).

Rules for this batch: design before code (items 5/8 and 6; item 3 is postponed to v2), and test account only (`.env.test`, user 1e117c74). Never sign in to the owner's account. The owner's saved data (3 wrong competitor BSRs, the `[S3]` in the book) is fixed by the owner in the app, not by us.

## Answer to the open question
**Does editing a source in 02 Research unlock the positioning? No.** Nothing in Research touches the lock. `0008_research_rules.sql` has no lock rule, and `js/book-research.js` has no lock code. The only caller of `unlock_positioning()` (latest version `0019_empty_version_fix.sql:135`) is the "Unlock to edit" button on 03 (`js/book-positioning.js:1056`). Unlock marks every chapter and every section with writing "Needs review" (`0019:173-183`). A Generate or Improve save made while the positioning is unlocked also marks its section (`0020:503`, `0021:315`, `0023:165`). So the marks in the real book came from an unlock on 03, not from Research.

**A real bug found while checking this (item 4):** nothing ever clears a section's mark. `approve_outline` clears chapters only (`0017:214-219`). The banner says "then set its status" (`js/book-write.js:884`), but `setStatus` sends only `status` (`js/book-write.js:486`). The Export note "Needs review: …" (`js/export-dialog.js:244`) then shows forever.

## Recommended order and STOPs
| Part | Items | Needs | STOP |
|---|---|---|---|
| 1 Server | 1, 2 (server), 9 (server), 10, 11 B | deploy v24, no migration | STOP 2: review, "deploy" |
| 2 Browser, no new design | 2 (dialog), 4, 7, 9 (Checks, Export), 10 (Checks), 11 A | none | STOP 3 |
| Live check A | 1, 2, 9, 10, 11, 4, 7 | test account | STOP |
| 3 Design | 5/8, 6 | 2 new screen files + PNGs | STOP 4: design review |
| 4 Build | 5/8 Ready state | browser only | STOP 5 |
| 5 Build | 6 Generate chapter | browser only | STOP 6 |
| Live check B | 5/8, 6 | test account | STOP for merge |

Each part is committed and pushed on `claude/e12-fixes`. Main stays untouched until the merge.

**Postpone or drop:**
- **Item 3: postponed to v2** (owner, D9). It is out of this batch and out of Live B. The notes below stay for v2.
- **Item 8 is item 5.** One design covers both.
- **Drop item 11 option C** (AI key points for each section). It costs more, needs a migration and adds parts that can break.
- **Postpone** the optional item 8 server tweak (a re-check that reports only new major problems). Add it only if the Ready state is not enough.
- **Postpone** the same BSR guard for Topic Lab's `amazon_import`. The bug was not seen there.

---

## Part 1: server (one deploy, generate v24; no migration)

### Item 1. Competitor import saves a category rank as the BSR
- **Cause:** The prompt already asks for the overall rank (`lib/competitor_import.ts:26`), but the model returned 343. Our code check `pageNumber` (`:81-85`, used at `:128`) only asks whether the number appears somewhere on the page. "#343 in College Guides" is on the page, so 343 passes.
- **Fix:** A new pure function `overallRank(pageText)` in `lib/competitor_import.ts`. It finds `#N in Books | Kindle Store | Kindle eBooks` (commas allowed, on one line or across lines) and returns N. The code value wins over the AI's. When the page has no overall rank and the AI's number is a category rank ("#N in <anything else>"), the BSR is null. The prompt does not change.
- **Tests:** `handler.competitor_import.test.ts`:
  - fixture `amazon-product1.txt` with an AI reply of bsr 12 → 45210;
  - an inline "#765,893 in Books (See Top 100 in Books) #343 in College Guides" → 765893;
  - category ranks only → null;
  - a Kindle Store rank → its number;
  - no rank at all → the AI's null stays null.
- **Migration:** no. **Deploy:** yes. **Owner data:** retype the 3 BSRs in 02 Research (765,893 and the other two).

### Item 2 (server). Outline: "Let the AI choose" (2 to 5 sections per chapter)
- **Cause:** `sectionsPerChapter` must be a number from 1 to 6 (`lib/limits.ts:105`, checked at `:323-327`). The prompt's last line says "N sections each" (`lib/outline_ideas.ts:128`), and interpret cuts to `job.per` (`:173`).
- **Fix:**
  - The input also accepts `sectionsPerChapter: "auto"`.
  - The last line becomes "Give each chapter 2 to 5 sections, as many as it needs: fewer for one simple idea, more for a chapter that teaches several steps."
  - Interpret keeps at most 5 sections per chapter. It keeps a chapter with 1 section rather than failing the whole reply (decision D2). The number path is unchanged.
- **Tests:** `limits` input check ("auto" accepted; "x", 0 and 7 refused); `lib.outline.test.ts` (last line, the cut at 5); `handler.outline_ideas.test.ts`; a new snapshot case "outline_ideas auto". The existing outline snapshot stays the same apart from the item 9 label change.

### Item 9 (server). Source ids such as `[S3]` in the book text
- **Cause:** `briefAndResearch` labels each source `<source label="S${i + 1}" …>` (`lib/context.ts:116`). No output uses these labels; only `review_insights` uses its own `B1` labels. The Write prompt never says not to print them (`lib/section_write.ts:191-198`). The labels are not even stable, because they are built from the sorted, cut list (`promptSources`, `lib/context.ts:86-100`).
- **Fix (3 layers):**
  1. Remove the `label` attribute: the AI cannot print what it never sees.
  2. A Write Facts rule: "Never write a source label or a bracket reference such as [S3] or [1]."
  3. A server strip in `cleanSubset` (`lib/section_write.ts:368`), which Write and Improve both use. It removes `[S3]`, `[S3, S5]`, `[S3; S4]` and `(S2)`, and tidies the spaces. `[Verify: no source]` is never touched. The rule is a shared pattern `SOURCE_LABEL` with a browser copy (Part 2).
- **Tests:** `lib.section_write.test.ts` (strip cases, marks kept, no change to "S3 class" style words); the snapshot shows no `label=` in any stage. Prompts that change: brief_help, positioning_help, title_ideas, outline_ideas, drift_check, section_write and section_check (only the label attribute, plus the Write rule lines). Unchanged: amazon_import, competitor_import, review_insights, bio and section_improve.

### Item 10. "Another source suggests…" instead of naming the author
- **Cause:** The Write Facts rules (`lib/section_write.ts:191`) say to take facts only from `<research>`, but never how to name a source. Every source has a citation ("Where it comes from", required: `js/book-research.js:524`, `0008:106`). Notes have none.
- **Fix:** A new Write Facts line: "When you use a fact from a source, name it the way its <citation> does: the author, or the book, study or website. Never write 'a source', 'another source', 'one source' or 'research suggests' without a name. A <source kind="note"> is the author's own knowledge: say it in your own words and never call it a source." Improve does not see Research (`improveUserMessage` sends no `<research>`), so it gets no rule. The Part 2 Checks row catches what slips through.
- **Tests:** prompt lines in `lib.section_write.test.ts`; snapshot.

### Item 11 B. `<book_so_far>` shows subheadings only
- **Cause:** `index.ts:331-333` sends `{ sectionId, headings }` only, and `bookSoFar` (`lib/section_write.ts:277-302`) writes "Title: heading; heading" (300 characters an item, 3,000 in all, `lib/limits.ts:133-134`). So the AI cannot see the closing line it used 7 times, the menu items, or that BJ Fogg was already explained.
- **Fix:**
  - `soFar` becomes `{ sectionId, text }`. `index.ts` already reads every current version in one query, so there is no new read. A pure `soFarItem(title, text, sources)` builds: `Title: headings | Items: first 6 words of each list item | Names: sources it names (the citation's lead words found in the text) | Opens: "first sentence" | Ends: "last sentence"`.
  - Caps: 600 characters an item (was 300), 9,000 in all (was 3,000), nearest sections first, as today.
  - New Content rules: "Do not reuse an opening or closing sentence that <book_so_far> shows, or one close to it." and "If <book_so_far> names a source, the reader has already met it: refer back to it in one sentence, do not explain it again." The practice rule (`:184`) also covers the Items.
- **Cost:** at most about +1,500 input tokens a Write call (9,000 vs 3,000 characters). For the 33 Write calls of a 12,000-word book, that is about **+$0.06 to $0.10 a book, and +30,000 to 50,000 tokens** (about 2% of the 2M monthly default). This uses the price in `js/usage-rules.js:26`: $2 per million input tokens and $10 per million output. Last live row 222 matches it exactly.
- **Tests:** `lib.section_write.test.ts` (each part of the item, caps, nearest-first, escaping, empty text); `handler.section_write.test.ts` and `test_fakes.ts` (the new `soFar` shape); snapshot.

**Part 1 verification:** `deno check supabase/functions/generate/index.ts`; `deno test --allow-read=supabase/functions/generate supabase/functions/generate/`; all helper tests; read the snapshot diff line by line. No SQL change.

---

## Part 2: browser, no new design (no migration, no deploy)
These follow existing row and note patterns (like the E12 "ends mid-sentence" and "mentions" rows and the Export "cut" note). Screenshots at 1440 and 900 at STOP 3.

### Item 2 (browser). The Generate outline dialog
`js/book-outline.js:1106` has one "Sections per chapter" field. It becomes two radios:
- "Let the AI choose for each chapter (2 to 5)";
- "The same for every chapter", with the number field (1 to 6), which is off unless that radio is chosen.

The call at `:1193` sends `"auto"` or the number. The default is decision D1. Tests: outline suite `t-generate.js` (both radios, the request body, the error text); full outline suite green.

### Item 4. "Needs review" says how to clear it
- **Outline note** (`js/book-outline.js:377`): add "Approving the outline clears these marks." Both are true (`0017:214`).
- **Section banner** (`js/book-write.js:884`): "This section was written before the positioning was unlocked. Check it against 03 Positioning, then choose Mark as reviewed." A new **Mark as reviewed** button sits next to Run AI check and sends `updateSection(id, { needs_review: false })`. Setting the status to Reviewed or Final also clears it (`setStatus`, `:486`). RLS allows this: the only sections guard is on `current_version_id` (`0018:211-254`), and approval ignores writing columns (`0017:312`), so approval stays.
- **Export note** (`js/export-dialog.js:244`): add "Mark it as reviewed in 06 Write."
- **Tests:** write suite (the button, the request, the pill and the note go, a failure keeps the mark with an error); outline `t-approve.js` (note text); export `t-export.js`. A SQL regression in the suite: an authenticated user can clear `sections.needs_review`, and the outline approval is kept (no migration).

### Item 7. Repeated-phrase check flags the section's own topic
- **Cause:** `repeats()` (`js/text-checks.js:198-259`) counts heading lines as uses (`:207`) and knows nothing about the section title. Repeat rows are `kind: 'warn'` (`:253`), so they count in the tab (`:363`).
- **Fix:**
  - `check(md, { known, target, title })`: `js/write-checks.js:80` passes `hit.s.title` and adds it to the memo key.
  - Headings no longer count as uses.
  - A phrase is ignored when every word in it that is not a common word (singular or plural: "habit" and "habits") is a word of the section title or of one of its own `## ` subheadings. "five-minute habit" in "Five-minute habits for your emptiest days" is ignored, and so is "look and touch" when it is a subheading.
  - Repeat rows become `kind: 'info'`: shown, never counted.
- **Tests:** `tests/text-checks.test.js` (the two real cases, a heading not counted, `warnings` without repeats, a real repeat still shown); write `t-checks.js` (row icon and tab count).

### Item 9 and item 10 (browser). Checks row and Export strip
- **Checks:** a new warn row `source`, "Source not named". It lists sentences with a source label (`[S3]`, the server's `SOURCE_LABEL` copy) or "a/another/one source" with no name. The sub reads "Name the author or the title, or cut the label." Show selects them. The AI check already skips sources (`lib/section_check.ts:158`), so only code checks this.
- **Export:** `kdpExportRules.strip` (`js/export-rules.js:100-105`) also removes source labels, so the DOCX never has `[S3]`. The model notes also count them.
- **Tests:** a parity test of the browser pattern against the server's `cleanSubset` strip (like `ending`); `tests/export-rules.test.js`; export `t-export.js` (no `[S3]` in the built document text); write `t-checks.js`.

### Item 11 A. A book-wide repeated-sentence check (no AI)
- **Rule** (pure, in `js/text-checks.js`): `bookRepeats(current, others)`. A sentence of 8 or more words that matches a sentence in another section is a repeat. To match, both sentences are compared in lower case, without marks or punctuation, and with spaces made the same.
- **Checks tab:** a warn row "Also in another section", with each sentence and where else it appears ("2.3, 3.1 and 4.2"). Show selects it in this section. The other sections' texts come from a new read, `kdp.getSectionTexts(versionIds)` (`section_versions` by the current ids already in the outline, through RLS). It is read when step 06 opens and again each time a section is opened.
- **Export:** `model().repeats`, and a warning note like "cut" that never blocks. For example: "7 sentences appear in more than one section, such as "Starting is often the hardest part…" (1.2, 2.3, 3.1…)".
- **Cost:** $0, no tokens.
- **Tests:** `tests/text-checks.test.js` (`bookRepeats`: the 8-word floor, marks ignored, places listed); `tests/export-rules.test.js`; write and export browser tests.

**Part 2 verification:** every helper suite; every browser suite (`tests/browser/run.sh`): write, export, outline and the rest stay green; screenshots in `docs/reviews/e12-fix2-stop3/`.

---

## Part 3: design first (STOP 4 before any code)
New files in `design/screens/`, each with PNGs at 1440 and 900, shot in a clean session with the real fonts.

### Items 5 and 8. "Ready to mark Final" (`22e-checks-ready-states.html`)
- **Cause of the loop:** a fix makes a new version. The check's key has the version id (`lib/section_check.ts:71-81`, `js/section-check-key.js`), so the check shows "Out of date" (`js/write-checks.js:102`) and the tab count drops its majors (`js/finding-rules.js:108-110`). The author runs it again, and the AI finds new things. Nothing ever says "good enough".
- **Proposed rule** (a pure `kdpFindingRules.ready()`):
  - a section is ready when "In your text" has no warn rows;
  - it has no Needs review mark;
  - an AI check has run on it at least once (decision D7);
  - every major finding of the last check is fixed (its quote is no longer in the text) or kept;
  - minor (voice) findings never block.
- **The loop breaker (owner rule, 2026-10-27):** an old AI check stays valid only when both of these are true:
  1. **Only the text changed.** The key computed with the check's `version_id` matches `inputs_key`; `section_checks.version_id` exists (0022). A change to the objective, the title, the positioning, the voice or the target makes it "Out of date", as today.
  2. **Every change since the check is allowed.** Walk the versions after the checked one, in order:
     - **allowed:** the result of a Fix or an Accept of that check's own findings. That is a used suggestion (0021 `section_suggestions`, `version_id` = this version) whose `selection` holds the quote of one of that check's findings.
     - **counted:** a manual edit (version source `manual`, and unsaved typing against the last version). Its changed words (`js/word-diff.js`) add to one manual total.
     - **out of date:** anything else, such as a Generate (new or continue), an Improve that is not from the check, or a Restore.
     
     The check stays valid only while the manual total is **under 20% of the checked version's words**. A bigger rewrite makes it "Out of date", as today.
  
  When it stays valid, it shows "Fixed 3 of 3" instead of "Out of date". There is no migration: the version `source`, the suggestion's `selection` and `version_id`, and the finding quotes are already saved. Design 22e draws each case. A pure `kdpFindingRules.stillValid()` holds the rule, and `tests/finding-rules.test.js` covers it: a Fix only; a Fix plus a 10% edit; a 25% edit; several small edits that add up past 20%; a Generate continue; an Improve not from the check; a Restore; a voice change.
- **States to draw:**
  1. Ready: a success row with an icon and the word "Ready to mark Final. No open problems. You do not need another AI check." and a "Mark Final" button;
  2. Almost: "2 things left", listed;
  3. Code checks clean but no AI check yet;
  4. Fixed N of N after Fix major;
  5. A Final section;
  6. The repeat rows as info (item 7), with the source and "Also in another section" rows from Part 2 in context.
- **Build (Part 4):** browser only, `js/finding-rules.js` and `js/write-checks.js`. Tests: `tests/finding-rules.test.js` (`ready`, `textOnlyChange`) and write `t-checks.js` / `t-fix.js`.
- **Also in Part 4 (owner, after Live check A):** the Checks rows show each sentence as plain text, without Markdown marks ("Feel your contact points.", not "**Feel your contact points.**"). Show still selects the real text.

### Item 6. "Generate chapter" (`23b-generate-chapter-states.html`)
- **Cause:** Generate works on the open section only (`js/write-generate.js`, one `gen` run).
- **Proposed behavior** (browser only; each step is the existing `section_write` call, so there is no server change):
  - The queue holds the chapter's sections that have **no text** (decision D8), in order, one at a time. Each call reads the one before it through `<previous_section_end>` and `<book_so_far>`.
  - The section being written opens in the editor.
  - **Stop** ends the current run (the existing partial-version rules) and cancels the rest.
  - A failure stops the queue, with "Try again from 4.3".
  - Leaving step 06 works as Stop does today.
- **Cost line before it starts:**
  - Formula: sections × (this month's average Write input, from `usage_month` `by_stage`, or 6,500 when there is none) + Σ target × 1.7 output, priced with `kdpUsage.PRICES`.
  - Example line: "4 sections, about 2,000 words. About $0.09 and 31,000 tokens. You have 1.2M tokens left this month."
  - It warns when the estimate is over the tokens left.
- **States to draw:**
  1. the button and where it lives (the chapter row in the manuscript list, or the head);
  2. the confirm dialog with the cost line;
  3. running, with progress "Writing 2 of 4" and Stop;
  4. done;
  5. stopped;
  6. failed with Try again;
  7. off: every section has text, or another run is going.
- **Build (Part 5):** a new `js/write-chapter.js` (a queue like Fix major in `js/write-improve.js`) and `js/book-write.js` wiring. Tests: a new write `t-chapter.js` (order, skip, Stop, failure, the cost line math, the limit warning) and `tests/usage-rules.test.js` for the estimate.

### Item 3. Topic Lab: imported value kept next to a manual edit (POSTPONED to v2, owner D9)
Not built in this batch. The notes stay for v2.
- **Cause:** typing a count makes it Manual and replaces the number (`js/topic.js:447-451`; trigger `topics_count_source`, 0006). The imported value is lost from view.
- **Proposed:**
  - **No new column for the imported number:** recompute it from the saved import books with `bookCounts()` (`js/topics.js:94`), which already uses the same rule as `save_topic_import`.
  - **A new note for each count:** migration **0026**, `winning_note`, `dead_note` and `authority_note`, null or 1 to 200 characters. It is structure only, like 0005. The trigger clears a note when a new import replaces the count.
  - **The card:** "Manual: 3 · Import said 0 (Oct 20)" and a short "Why did you change it?" field when the manual value differs from the import (decision D9: asked, not required).
- **Draw these states (v2):** imported, manual with no import, manual over an import (note empty, note filled), and a re-import.
- **Build (v2):** `0026_topic_count_notes.sql` (or the next free number), a new SQL test, `js/topic.js`, `js/supabase.js`, and a new browser suite `topic` (like `pen`).

---

## Live checks (test account only: `.env.test`, user 1e117c74)
Before signing in, check that the localStorage user id is 1e117c74. Note the `ai_usage` max id before and after. Results go into this doc and `docs/reviews/e12-fix2-live/`, with no email visible in the screenshots.

**Live A (after v24 is deployed and STOP 3 is OK)**
1. **Competitor import** (1 call): paste a product page with "#N in Books" and category ranks into test book 4e2dde85's Add competitor. Expect the Books rank. Cancel, do not save.
2. **Outline "AI chooses"** (2 calls): book 4e2dde85 has writing, so Generate is refused there. Use a new throwaway test book: Brief, 1 source, a typed title and the positioning, all by hand; a drift check (1 call), lock; Generate outline with "Let the AI choose" (1 call). Expect 2 to 5 sections, not the same in every chapter. Delete the book after (it has no writing).
3. **Write** (2 calls): in 4e2dde85, a new chapter "Live check: Morning reset", 2 sections of 300 words, approve again, Generate both. Expect no `[S#]`, sources named by citation, no "another source", and no closing sentence copied from other sections. Input tokens should be about 1,000 to 1,500 higher than row 222.
4. **Checks and Export** (no AI): repeat rows are info and not counted; the title and subheading phrases are not flagged; a typed `[S3]` and "another source" show the Source row; a copied sentence shows "Also in another section"; Mark as reviewed clears a Needs review mark if one exists; Export DOCX has no `[S3]` and shows the repeat note.

**Expected cost: 5 calls, about $0.08** (competitor $0.01, drift $0.006, outline $0.015, 2 Writes $0.042). Ceiling about $0.15.

**Live B (after Parts 4 and 5)**
1. **Generate chapter** (3 calls, plus 1 for the Stop test): a new chapter of 3 sections of 300 words. The cost line should be within about 30% of the real rows. Stop on a second chapter's first section.
2. **Ready state** (1 AI check + 1 or 2 Improves): run the check, use Fix major, then see Ready with no re-check. Then a manual edit over 20% (no AI) shows "Out of date".

**Expected cost: about 6 calls, about $0.10.** Ceiling about $0.18. **Both checks together: about $0.18.**

## Decisions (owner, STOP 1, 2026-10-27)
- **D1.** The Outline dialog defaults to "Let the AI choose".
- **D2.** In auto mode, a chapter the AI gives 1 section is kept, not refused.
- **D3.** Needs review is cleared by the Mark as reviewed button **and** by setting Reviewed or Final.
- **D4.** The `S1` labels are removed from every prompt.
- **D5.** Item 11: A (code check) + B (richer `<book_so_far>`). C is dropped.
- **D6.** A repeated sentence means the same words after cleanup, 8 words or more. It counts in Checks and does not block Export.
- **D7.** Ready needs at least one AI check on the section.
- **D8.** Generate chapter skips sections that already have text.
- **D9.** Item 3 (Topic Lab note) is postponed to v2. It is out of this batch and out of Live B.
- **Items 5/8 change:** an old AI check stays valid only when every change since it is a Fix or Accept of that check's own findings, or a small manual edit (under 20% of the words changed in total since the check). Anything else makes it "Out of date" as today. The rule goes in design 22e and its tests (see the loop breaker above).

## Part 1 results (STOP 2, 2026-10-27)
Commit d220dd2 on `claude/e12-fixes`. Server only: no migration, no SQL change, no browser change, no AI calls, no Supabase writes.

**Tests:**
- `deno check` is clean.
- Generate: 307 → 317 passed, 0 failed.
- Helpers: 137 passed, unchanged. The `text-checks` and `sentences` parity tests still match the server.
- `deno lint` finds 17 problems, all in `handler.test.ts`, which this commit does not touch. They were there before.

**Prompts that changed** (snapshot re-recorded, each entry compared with the old one by a script, then the rest read line by line):

| Prompt | What changed |
|---|---|
| positioning_help, drift_check, title_ideas, outline_ideas, outline_check, section_check | Only `<source label="S1" kind=…>` → `<source kind=…>` (item 9). Every other changed line in their handler entries is a request hash (`bodySha`). |
| section_write (system) | 1 line reworded and 5 new lines: see below. |
| section_write (user message) | No labels; each `<book_so_far>` item now adds `Ends`, `Opens`, `Names` and `Items`. |
| outline_ideas (only with "auto") | The last line: "Write 8 chapters. Give each chapter 2 to 5 sections, as many as it needs: fewer for one simple idea, more for a chapter that teaches several steps. …". The number path's last line is byte for byte the same. |

**Unchanged:** bio, brief_help, amazon_import, competitor_import (its prompt; only one reply changed, see below), review_insights and section_improve. In the plan I expected brief_help to change, but it has no Research sources, so it does not.

**The new Write system lines:**
- Reworded: "<book_so_far> lists the other written sections of the book: their subheadings, how they end and open, the sources they name and their list items. Do not repeat advice, tips or subheadings it shows."
- "Do not reuse an opening or closing sentence that <book_so_far> shows, or one close to it."
- "If <book_so_far> names a source, the reader has already met it: refer back to it in one sentence, do not explain it again."
- "When you use a fact from a <source>, name it the way its <citation> does: the author, or the book, study or website. Never write "a source", "another source", "one source" or "research suggests" without a name."
- "A <source kind="note"> is the author's own knowledge: say it in your own words and never call it a source."
- "Never write a reference mark such as [S3] or [1]."

**Other snapshot changes:**
- `handler competitor_import numbers not in page`: `bsr` null → 45210. The page has "#45,210 in Books", and our code now reads it.
- Two new entries: `buildRequest outline_ideas (auto sections)` and `handler outline_ideas auto success`. The second differs from `outline_ideas success` only in its request hash.

**Behavior changes to know:**
- **Item 1:** the BSR is the page's first "#N in Books / Kindle Store / Kindle eBooks", also on one line ("#765,893 in Books (See Top 100 in Books) #343 in College Guides" → 765,893). With no overall rank on the page, a model number that is a category rank becomes empty.
- **Item 2:** the input takes `"auto"` (exactly that word). In auto mode, sections past 5 are cut, and a chapter with 1 section is kept (D2).
- **Item 9:** `[S3]`, `[S3, S5]`, `[S3; S4]`, `[S3-S5]` and `(S2)` are removed from what Write and Improve save, and from the earlier text Write reads (`<previous_section_end>`, `<section_so_far>` and `<book_so_far>`). Already saved text keeps its labels until the Part 2 Checks row and Export strip.
- **Item 11 B:** each item is "Title: headings | Ends: "…" | Opens: "…" | Names: … | Items: …". It holds at most 600 characters a section and 9,000 in all, nearest sections first. Names are the author's sources that the text mentions: the citation's lead ("BJ Fogg"), or its capitalized last word ("Fogg's idea").

**Prompt size and cost:**
- The Write system prompt goes from 4,839 to 5,493 characters: about +165 tokens a call, or about $0.01 for a 33-call book.
- `<book_so_far>` can grow by up to 6,000 characters (about +1,500 tokens a call) once the book has many written sections.
- Together that is about **+$0.07 to $0.11 a book**, in line with the plan.
- Check, Positioning, Title and Outline prompts lose about 4 tokens per source (the label).

## Part 2 results (STOP 3, 2026-10-27)
Commit 5995dc5 (code and tests); docs and screenshots b388931. Browser only: no server change (generate stays v24), no migration, no AI calls, no Supabase writes.

**What changed:**
- **Item 2, Outline dialog** (`js/book-outline.js`, `css/app.css`):
  - "Sections per chapter" is now two radio cards: "Let the AI choose for each chapter" (2 to 5 sections, as each chapter needs) and "The same for every chapter".
  - Below them, the "Sections in each chapter" number (1 to 6) is on only for "The same for every chapter".
  - The AI choosing is the default (D1). The dialog remembers your last choice while the page is open.
  - It sends `sectionsPerChapter: "auto"` or the number. `AUTO_SECTIONS` is checked against the server in `tests/limits-parity.test.js`.
- **Item 4, Needs review:**
  - 06 Write's banner now reads: "Check it against 03 Positioning, then choose Mark as reviewed. Setting the status to Reviewed or Final also clears this mark."
  - **Mark as reviewed** sends only `needs_review: false`, so the status stays.
  - Setting Reviewed or Final sends `{ status, needs_review: false }`. Draft and Not started keep the mark.
  - A failed save keeps the mark and shows an error.
  - The outline note adds "Approving the outline clears these marks."
  - The Export note adds how each mark clears: "Mark the section(s) as reviewed in 06 Write." and/or "Approve the outline in 05 to clear the chapter(s)."
- **Item 7, repeats** (`js/text-checks.js`):
  - Repeat rows are info: the gray info icon, and never counted in the tab.
  - Headings are no longer uses.
  - A phrase whose other words (singular or plural) are all words of the section title or of its own subheadings is ignored.
- **Items 9 and 10, "Source not named":** a warn row, counted.
  - It lists each source label (Show selects just the label, and the list shows it with its sentence).
  - It also lists each sentence with a source that has no name: "another source", "the other source", "other sources", and "a/one/some source" before a reporting word ("a source of stress" is fine).
  - The label pattern is the server's `SOURCE_LABEL`, with a parity test.
  - The Export `strip` takes labels out of the .docx and .md.
- **Item 11 A, "Also in another section":** a warn row, counted.
  - It lists each sentence of 8 or more words that another section's saved text has, with where, for example "Also in 1.1 and 4.1".
  - The other texts come from a new read, `kdp.getSectionTexts(versionIds)`, when a section opens. A failed read shows no row. A read for a section you have already left is ignored.
  - Export adds a warning note like "ends mid-sentence", for example "1 sentence appears in more than one section, such as "…" (2.1 and 4.2).". It never blocks and needs no tick.

**Found and fixed while testing (not in the plan):**
1. **A label at the end of a section showed as "ends mid-sentence".** A section ending "…the minimum. [S3]" (as in your book) got that row and Export note. Now `ending()` ignores source labels. That is the server's rule on text without labels, since the server no longer saves labels, and a parity test runs it.
2. **No "Ready." next to the repeat warning.** The Export summary line is neutral (the info icon, no "Ready.") while the repeated-sentence note shows. This is the same rule you set for "ends mid-sentence" at the last STOP 3.
3. **The Export test data repeated one sentence in every section.** `tests/browser/shared/e11.js` repeated "Breathe in slowly, … settle into the chair." in all 10 sections, so the new check flagged it. The sentence now ends with the section's topic word ("…settle into the roll."), with the same word count.

**Tests:**

| Suite | Before | After |
|---|---:|---:|
| Deno generate | 317 | 317 (no server change) |
| Deno helpers | 137 | 145 (`text-checks` +6, `export-rules` +2, `limits-parity` +1 assert) |
| Browser write | 684 | 714 (new `t-batch2` 28, `t-checks` +2) |
| Browser export | 75 | 91 (new `t-repeats` 16) |
| Browser outline | 226 | 235 (`t-generate`) |
| Other browser suites (books 12, brief 161, delete 1, pen 9, positioning 159, research 77, settings 88, title 75) | 582 | 582 |
| **Browser total** | **1,567** | **1,622**, 0 fails, no page errors |

`t-selection`'s 10 server-rule lines pass too (counted apart, as before). In `t-checks`, the typed repeat changed from "roll your shoulders" to "lift your arms", because "roll your shoulders" is now the section's own topic ("Shoulder rolls, both ways").

The code checks take about 1 to 2 ms more on a 16,000-word section: a median of 13 ms before and 14 to 15 ms after, against the 30 ms limit.

**Screenshots** (`docs/reviews/e12-fix2-stop3/`):

| File | What it shows |
|---|---|
| `outline-dialog-auto-1440.png`, `-900.png` | Generate an outline: "Let the AI choose" picked, the number off |
| `outline-dialog-same-error-1440.png`, `-900.png` | Replace the outline: "The same for every chapter", 9 is refused |
| `outline-review-note-1440.png` | 05 with the "Needs review" note and its new last sentence |
| `write-needs-review-1440.png`, `-900.png` | 06 banner with Mark as reviewed and Run AI check |
| `write-checks-rows-1440.png`, `-900.png` | Checks tab: "Source not named" (Show on [S3]), "Also in another section" with "Also in 1.1 and 4.1", the repeat as info, tab count 3 |
| `export-repeats-1440.png`, `-900.png` | Export dialog: the repeated-sentence note and the neutral summary line |

**Seen, not changed:** at 900 px the page header ("PRODUCE · STEP 5 OF 11") wraps into narrow lines. It did before this batch too (`docs/reviews/e12-stop3/checks-ending-900.png`); the app has no narrow layout yet (v2).

## Live check A results (2026-10-27, test account 1e117c74, generate v24)
**Sign-in:**
- Before sign-in, localStorage held no saved session.
- I signed in from `.env.test` (the values were passed by the shell, never written down or printed).
- After sign-in, localStorage held user `1e117c74-49db-4c1e-bee6-6c324c2ecae4`. The sidebar shows "Your account", and no "@" appears on any page shot.
- The browser session was closed after the check.

**`ai_usage` max id: 290 before, 295 after.** All 5 calls are the test user's, ok and counted.

| Row | Stage | In | Out | Cost |
|---:|---|---:|---:|---:|
| 291 | competitor_import (book 4e2dde85) | 2,512 | 302 | $0.0080 |
| 292 | drift_check (throwaway book) | 1,539 | 78 | $0.0039 |
| 293 | outline_ideas (throwaway book) | 1,968 | 791 | $0.0118 |
| 294 | section_write 7.1 | 8,405 | 584 | $0.0227 |
| 295 | section_write 7.2 | 8,524 | 591 | $0.0230 |
| | **Total** | 22,948 | 2,346 | **$0.0694** (plan: about $0.08) |

Rows 292 and 293 have no book id now: the book they were for is deleted (`on delete set null`).

| Step | Expected | Result | Evidence |
|---|---|---|---|
| 1 | Competitor import takes the Books rank | **Pass** | Page text (the synthetic fixture) with "Best Sellers Rank: #765,893 in Books (See Top 100 in Books) #343 in College Guides #652 in Time Management" on one line → the form's BSR is **765893**. Cancelled: competitors 4 before, 4 after. |
| 2 | Outline "Let the AI choose": 2 to 5 sections, not the same everywhere | **Pass** | The dialog opened with "Let the AI choose" picked and the number off. Result: "Outline ready: 5 chapters, 9,950 words. Word counts were scaled to your target." Sections per chapter: **3, 4, 5, 4, 4** ("Why Short Sessions Work for a Busy Life" 3, "Tie Study to Routines You Already Have" 4, "The 5, 10 and 15 Minute Study Menus" 5, "Keep Going on Busy Days" 4, "Track Progress and Build Your Own System" 4). |
| 2 | Throwaway book deleted | **Done** | Throwaway book `995f1e5f` ("Live Check: Micro Study Habits"; Brief, 1 source "BJ Fogg, Tiny Habits (2019)", positioning; its 1 drift flag kept with a reason, no AI), deleted from its own Books menu ("Delete "Live Check: Micro Study Habits"?" listed "The Brief", "1 research note", "Positioning", "7 chapters"). After: 0 rows in books, chapters, research_sources, positioning and book_briefs; the test user has 4 books, as before. |
| 3 | New chapter, 2 sections of 300 words, approved again | Pass | Chapter 7 "Live check: Morning reset": 7.1 "A two-minute body scan before you get up", 7.2 "Calm cues for the busy first hour" (Examples and Exercise on). Approved at 12:04:54 UTC. |
| 3 | No `[S#]` in either section | **Pass** | 0 labels in 7.1 (320 words) and 7.2 (328 words). |
| 3 | Sources named by citation | **Not shown** | Neither section uses a fact from a source: no source is named, and there is no "a source" or "another source" either. 0 Verify marks. The rule could not be seen at work in these two sections. |
| 3 | No "another source" | **Pass** | None in either section. |
| 3 | No closing sentence copied from other sections | **Pass** | 7.1 ends "A body that has been noticed, even briefly, often meets the morning with a little more ease."; 7.2 ends "Keep that one for sure." Neither is in any other section. Neither previews the next section. |
| 3 | Input about 1,000 to 1,500 tokens more than row 222 (6,304) | **Higher** | 8,405 (+2,101) and 8,524 (+2,220). The book now has 16 other written sections in `<book_so_far>` (12 at row 222), each with a longer item. That is about +$0.004 a Write call against the plan's +$0.003. |
| 4 | Repeat rows are info and not counted | **Pass** | Introduction: three repeat rows with the info icon ("your body is" used 5 times, "You do not need to" used 3 times, "why your body" used 3 times). The tab says "Checks 3": the mention row and two opener rows. |
| 4 | The section's own title and subheading phrases are not flagged | **Pass** | Ignored now: 2.1 "A two-minute check-in to read your body": "the check-in" (used 7 times); 2.2 "Finding your safe spot…": "your safe spot" (4 times); 4.2 "Soothing the pelvic floor and belly": "the pelvic floor" (3 times); 3.1: "into the floor" (3 times, a subheading word). 2.1's Checks tab has no repeat row. |
| 4 | Typed `[S3]` and "another source" show "Source not named" | **Pass** | Typed in 7.2: "…You can always do more than the minimum. [S3] Another source suggests starting small." Row: "Source not named · Name the author or the title, or cut the label." with "You can always do more than the minimum. [S3]" and "Another source suggests starting small." Show selects just "[S3]". |
| 4 | A copied sentence shows "Also in another section" | **Pass** | Typed 7.1's last sentence into 7.2: "1 sentence is also in another section … A body that has been noticed, even briefly, often meets the morning with a little more ease. Also in 7.1". Tab: "Checks 2". |
| 4 | Mark as reviewed clears a Needs review mark | **Pass** | The Introduction (Final, marked by the old unlock): the banner showed the new text. Mark as reviewed made the banner and the pill go, and the status stayed **Final**: before this fix that mark could never clear, because the status was already Final. Book sections with the mark: 12 → 11. |
| 4 | Export: no `[S3]` in the .docx, the repeat note | **Pass** | 7.2 was saved as v2 with the typed text, then exported (open-marks box ticked: the book has 82 old v15 marks). The .docx text has no "[S3]" and no `[S…]` label at all, and the sentence is kept: "…You can always do more than the minimum. Another source suggests starting small." Notes: "Needs review: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2 and Conclusion. … Mark the sections as reviewed in 06 Write." and "4 sentences appear in more than one section, such as "Breathe in through your nose for a count of four." (3.1, 4.2 and 6.2)." |
| 4 | Clean-up | Done | 7.2 restored to its generated text: v3 = v1, no "[S3]", no draft. v2 (the typed test) stays in Versions, as every version does. |

**What the live text showed (not planned checks):**
1. **The same steps taught again.** 7.1 says "It is the same check-in you learned earlier in the book, made smaller and slower", but still copies two steps word for word: "**Feel your contact points.** Notice where your body meets the bed." (also in 6.4) and "**Scan from the top down.** Start with your forehead and eyes." (also in 2.1). The new "Also in another section" row catches both. The richer `<book_so_far>` (item 11 B) did not stop it. Its Items part holds only the first 6 words of each list item.
2. **The example got its own subheading.** 7.2 has "## A short example" over its example, which the E12 step 2 rule ("Do not give the example its own subheading") forbids. The example itself has no name, age or job.
3. **Real repeats in the test book.** "Breathe in through your nose for a count of four." is in 3.1, 4.2 and 6.2. Export now reports 4 such sentences.
4. **Raw Markdown in the Checks list.** The sentence list shows raw Markdown ("**Feel your contact points.**"). The older rows (marks, mention) show it the same way, so this is not new.

**State after the check:**
- Test book 4e2dde85 has a new chapter 7 "Live check: Morning reset". Its 7.1 and 7.2 have writing, so the chapter cannot be deleted and stays.
- The Introduction is no longer marked "Needs review".
- There is 1 new export row (the .docx check).
- The throwaway book is gone.
- Nothing on your account was read through the app or changed. The only reads beyond the test user were `max(id)` on `ai_usage`, and 5 rows of it, all the test user's.

## Owner decisions after Live check A (2026-10-27)
- Live check A accepted.
- **Watch list, with no prompt change now:**
  - Write copies practice steps word for word from earlier sections (7.1 from 2.1 and 6.4);
  - Write gives an example its own subheading (7.2 "## A short example").
- Part 4 adds plain-text sentences in the Checks rows (above).
- Next: Part 3, designs 22e and 23b only, then STOP 4.

## Part 3 results (STOP 4, 2026-10-27): designs only
New files in `design/screens/`, built on 22c, 22d and 23 (tokens only, the 280 px Checks panel, 44 px buttons, no em dashes). PNGs are full page at 1440 and 900, shot in a clean session (no mocks) after checking that IBM Plex Sans, IBM Plex Mono and Source Serif 4 had loaded. Neither width scrolls sideways.

### 22e · Ready to mark Final (`22e-checks-ready-states.html`, `-1440.png`, `-900.png`)
1. **Ready:** a block at the top of the Checks tab with the success check and "Ready to mark Final. No open problems. You do not need another AI check." It has a **Mark Final** button (it sets the status, the same as the select). The AI check shows "Fixed 3 of 3 major findings", and the tab has no count.
2. **Almost:** "2 things left" lists what still blocks, in this order: Needs review, code warnings, open major findings, open objective gaps. Each has Show. "You can still mark it Final now." The tab count is unchanged.
3. **Text clean, no AI check yet** (D7): "Run the AI check once" with the button.
4. **Still valid after Fixes and small edits:** "Fixed 3 of 3", plus a meter "Your own edits since this check: 6% of the words" on a 0 to 20% scale. The meter shows only after manual edits.
5. **Out of date, edits over 20%:** "You changed 24% of the words since this check. Up to 20% keeps a check."
6. **Out of date, a change not from this check:** one line each for Generate, an Improve that was not a Fix, Restore, and "the plan changed" (today's line). When several apply, the first in that order shows.
7. **Needs review blocks "ready":** Show goes to the banner's Mark as reviewed.
8. **After Mark Final:** "Final. This section is marked Final and has no open problems." If it is edited later: "Final, 1 thing left. Its status stays Final."
9. **An objective gap:** it stays open until it is kept, or a new check no longer finds it. Writing the missing part counts toward the 20%.
10. **In your text** with every Part 2 row, and the Part 4 change: each sentence as plain text, without Markdown marks.
11. **The rule table** (your rule) and how the app knows. There is no migration: the check's `version_id` and fingerprint (0022), each version's `source`, and a used suggestion's passage and version (0021). The rule is one pure `kdpFindingRules.stillValid()`.

### 23b · Generate chapter (`23b-generate-chapter-states.html`, `-1440.png`, `-900.png`)
- **1A, the button (recommended):** "Generate chapter" in the 06 head next to "Generate section", with the help line "Writes the 3 sections of this chapter that have no text, in order."
- **1B, the option:** a "More" menu on each chapter row of the manuscript list ("Generate empty sections (3)").
- **2, the confirm:**
  - It lists the sections to write with their word targets, and a skipped one ("Has text, so it is skipped.").
  - Its cost line reads "3 AI calls, about 1,000 words. About $0.07 and 27,000 tokens. You have 1.21M tokens left this month."
  - The formula: this month's average Write input (6,500 when there is none) plus each target × 1.7 output tokens, priced at $2 and $10 a million.
- **2b, near the limit:** a warning that never blocks: "This may pass your monthly AI allowance. You have about 20,000 tokens left. Writing stops at the limit, and the sections written so far stay."
- **3, running:** "Generate chapter · 2 of 3", with each section Written, Writing now or Waiting. The current section streams with its progress bar, and one Stop ends that section's writing and cancels the rest. The open section follows the queue.
- **4, done:** "Chapter 7 is written", the words per section, "Next, read each one and run its AI check."
- **5, stopped by you:** today's stopped wording, then "Generate the rest (2)". It counts the stopped section again, because its partial text is not current yet.
- **6a, failed:** "Try again from 7.2" and Stop. **6b, month limit:** no Try again.
- **7, off:** with today's reasons ("Every section in this chapter has text.", "Wait for the section to finish writing.", "Lock the positioning in 03 to generate.", "Approve the outline in 05 to generate."). There is no button on the Introduction or the Conclusion.
- **8, leaving 06 while it runs:** "Stop and leave? The text written so far in 7.2 is saved in Versions. 7.3 is not written."

### Questions for your review
1. **23b button:** A (in the head, recommended) or B (the chapter row menu)?
2. **22e Mark Final button:** keep a Mark Final button in the Ready block (my pick), or point to the status select only?
3. **22e meter:** show the 0 to 20% meter after manual edits (my pick), or text only ("Your own edits since this check: 6% of the words")?
4. **23b after Stop:** "Generate the rest" also writes the stopped section again (my pick), unless you kept its partial text first.
