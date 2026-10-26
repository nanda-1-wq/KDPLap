# E12 step 2: prompt fix batch plan

Status: STOP 2 reached 2026-10-26. Part 1 committed 83d1b02 and pushed on `claude/e12`. Waiting for the owner's review and "deploy" (generate v22, by Claude chat). Part 2 starts only after that.

## Context
The step 1 review (`docs/reviews/2026-10-26-e12-prompt-review.md`, 91e8901) found prompt and rule problems that would hurt a real book. The owner accepted it and chose:

- **H2:** Perspective means the point of view in the books.
- **H3:** option A. Examples have no names, ages or jobs, and there is no "An example" subheading. There is one example per chapter, in its 2nd section (the 1st if the chapter has one section).
- **M7:** option A. No picture notes.
- **H1:** sharper Write wording only.

This batch covers H2, H3, M1 to M8, M10, L1 to L4, the H1 wording and M9 (browser). L5 to L8 stay as notes. Everything stays on branch `claude/e12`.

**No migration is needed.** No SQL checks max_tokens, the reserve or prompt text. Section check types, suggestion actions and the shapes of saved `unsourced` lists do not change. `getWriteContext` reads `section_versions` through RLS, as it does now.

One correction to the report: `js/book-write.js` holds no copy of the max_tokens numbers. The only copy of a number rule in the browser is `js/text-checks.js`.

## Order and STOPs
1. Save this plan as `docs/reviews/2026-10-26-e12-fix-batch-plan.md`, with a Status line updated at each STOP.
2. **Part 1, server and shared rules:** every prompt and rule change below, the `js/text-checks.js` rule copy, and their Deno tests. Run `deno check` and all Deno suites, re-record the snapshot and review its diff. Commit and push, then **STOP 2**: you review, then say "deploy", and Claude chat deploys generate v22.
3. **Part 2, browser:** the pen-name label (H2), the "Ends mid-sentence" row in Checks and the note in Export (M9), plus the browser suites and screenshots at 1440 and 900. Commit and push, then **STOP 3**.
4. **Live check** after v22 and your OK (section 5). Then STOP for merge.

## 1. Changes (Part 1, server)

Shared prompt parts live in `lib/section_write.ts` (the "parts shared by section_write, section_improve and section_check" block).

| ID | Change | Files |
|---|---|---|
| H2 | New shared `POINT_OF_VIEW` text: write in the point of view in `<perspective>`. Steps, exercises and instructions may always speak to the reader as "you". **When it is not set, speak to the reader as "you"** (my default; say if you want another). Used in the Write and Improve Voice sections and in Check's `voice` definition, so Check no longer flags "you" in steps. | `lib/section_write.ts`, `lib/section_improve.ts`, `lib/section_check.ts` |
| H3 | Write: "examples: yes → one short concrete example: a situation, or 'a reader who...'. Never a name, an age or a job. No subheading for it." "examples: no → no example story; a short 'for example' inside a sentence is fine." In code, `<examples>yes` goes only to section index 1 (index 0 when the chapter has one section) of a chapter with Examples on (`writeUserMessage`, line 241). Expand's rule becomes "never a name, an age or a job". | `lib/section_write.ts`, `lib/section_improve.ts` |
| H1 | Sharper Write Facts rule: mark a sentence that states a fact about the world (how the body, mind, money or law works, what most people do or feel, what research shows) that `<brief>` and `<research>` do not support. Do not mark a sentence a `<source>` supports. Two examples: one to mark ("Slow breathing lowers your heart rate within a minute.") and one not to mark ("Breathe out slowly and notice your shoulders."). | `lib/section_write.ts` |
| M1 | **One number rule** in a new `lib/numbers.ts` (see 1.1). It moves `numbersIn`, `withoutFigures`, `sentencesOf`, `claimNumbers`, `markUnsourced` and `MARKER` there, with re-exports from `common.ts` and `section_write.ts` so existing imports keep working. `unsourcedNumbers` becomes "claim numbers in any sentence of the text". `outlineUnsourced` is removed, and its 3 callers use `unsourcedNumbers` (outline_ideas, outline_check, section_check). The existing caps stay: titles and outlines keep at most 10 numbers of at most 20 characters. | `lib/numbers.ts` (new), `lib/common.ts`, `lib/section_write.ts`, `lib/outline_ideas.ts`, `lib/outline_check.ts`, `lib/section_check.ts`, `lib.ts` |
| M1 (browser copy) | Same rule in the copy in `js/text-checks.js` (logic only, no UI). | `js/text-checks.js` |
| M2 | New shared `STYLE` text used by Write and Improve, and named in Check's voice definition. Sentence length follows `<sentences>` (short when not set). Words fit `<reading_level>`. Active voice, no em dashes. It also holds the stock-phrase list and "no empty openers or closers, no needless lists of three", moved from Humanize. Humanize now says "apply the style rules strictly; vary sentence openings". The fixed "Short sentences" line goes. | `lib/section_write.ts`, `lib/section_improve.ts`, `lib/section_check.ts` |
| M3 | Write Content: "Never write section or chapter numbers in the text. Refer to another part by what it covers. Do not end with a preview of the next section." Improve Fit gets the same first sentence. | `lib/section_write.ts`, `lib/section_improve.ts` |
| M4 | Line 158 becomes: "This section starts with a new sentence of its own. Never finish a sentence from `<previous_section_end>`." New `completeEnd(text)` cuts a text that ends mid-sentence back to its last full sentence. `<previous_section_end>` uses it before `tailText`. One shared "ends mid-sentence" rule (1.2) with a browser copy for M9. | `lib/section_write.ts` (or `lib/numbers.ts` next to `sentencesOf`) |
| M5 | Write: `max_tokens = min(4,600, ceil(aim × 2.2) + 200)`, so `MAX_TOKENS.section_write` goes from 4,200 to 4,600. Improve: per-word factor 1.6 → 1.9, and `MAX_TOKENS.section_improve` goes from 4,096 to 4,800. That way Custom at 1,500 words (4,760) and Expand at 1,000 (4,380) fit, while Expand at 1,500 still does not, so the 1,000-word Expand limit keeps its reason. Timeouts stay: about 77 s at 60 tokens a second, under 100 s and 120 s. | `lib/limits.ts`, `lib/section_write.ts`, `lib/section_improve.ts` |
| M6 | Bio: 40 to 150 words, and the thin-facts rule at 40. "Do not describe the author's books, their style or what they do for readers, beyond saying the author writes about the niche. Never use the word niche." "Use the first name after the first sentence. Use he, she or they only when the facts show which one fits." | `lib/bio.ts` |
| M7 | Write and Improve Format: "No picture notes, image descriptions or placeholders. The book has no images." Also, unless you say no: Positioning and Title get "Promise pictures or photos only when the Brief says the book has them", and "photos" leaves their examples of fine book choices. | `lib/section_write.ts`, `lib/section_improve.ts`, `lib/positioning_help.ts`, `lib/title_ideas.ts` |
| M8 | `getWriteContext(bookId, sectionId, { soFar })`: for section_write only, one read of every section's current version, which also covers current and previous. It returns `soFar: { title, headings }[]` for the other written sections, in reading order. The new prompt tag `<book_so_far>` lists them as items "Title: heading; heading", nearest sections first, up to 3,000 characters, then put back in reading order. New Content rule: "Do not repeat advice, tips or subheadings that `<book_so_far>` shows." Improve and Check keep today's smaller read. | `index.ts`, `lib/types.ts`, `lib/stages.ts`, `lib/section_write.ts`, `test_fakes.ts` |
| M10 | Expand: "about 1.4×, never more than 1.6×". Shorten: "about 0.6×, never more than 0.72×". | `lib/section_improve.ts` |
| L1 | Write: the Introduction opens the book (who it is for, their problem, the promise in fresh words, how to use the book). The Conclusion closes it (what the reader can do now, one next step, no new material). | `lib/section_write.ts` |
| L2 | Improve Facts: "No new number about the world... Counts of the book's own parts in a step are fine (3 breaths, 5 times)." Expand also gets "no new numbers about the world". | `lib/section_improve.ts` |
| L3 | Write: "Do not copy the reader promise word for word." | `lib/section_write.ts` |
| L4 | Name `<topic_lab_name>` in BRIEF_SYSTEM and `<book_subtitle>` in OUTLINE_SYSTEM. | `lib/brief_help.ts`, `lib/outline_ideas.ts` |

### 1.1 The shared number rule (M1)
A number is "no source" when the author's sources do not have it **and** it is a claim:
- **always:** %, money, a ratio ("3 in 4", "2 out of 5"), or any number in a sentence with study, research, researcher, survey, data, evidence, proven or proves;
- **a weight, size, calorie or body unit** (pounds, kg, calories, mg, bpm, mmHg, BMI and so on) **only in a sentence with a result word** (lose, drop, cut, reduce, lower, burn, gain, shed, boost, improve, increase);
- **a decimal, or a number of 100 or more** (years too), unless it counts the book's own parts (the outline's part words: minutes, days, weeks, steps, reps...);
- **never:** list numbers at the start of a line, section numbers ("see 2.1"), times ("9 a.m.", "6:30"), figures of speech ("24/7"), or small plain counts under 100.

| Phrase | Brief, Positioning, Title today | Outline and checks today | Write and Improve today | New (every stage) |
|---|---|---|---|---|
| "a 15-minute routine" | flagged | not flagged | not flagged | not flagged |
| "for women over 50" | flagged | flagged | not flagged | not flagged |
| "lose 10 pounds" | flagged | flagged | not flagged | **flagged** |
| "hold a 5 lb weight" | flagged | flagged | not flagged | not flagged |
| "hold for 120 seconds" | flagged | not flagged | flagged | not flagged |
| "in 2019", "40%", "$25", "3 in 4 adults" | flagged | flagged | flagged | flagged |

**Your choice (the units row):** two of your earlier rules conflict. The E9 outline rule says "body weight always", which would flag "a 5 lb weight" in every strength-training section. The STOP 2 Write rule says "lose 10 pounds is a small count", which flags nothing. I recommend the middle rule above: units count only with a result word. Saved Title and Outline badges keep their old numbers until the next Generate.

### 1.2 "Ends mid-sentence" (M4 server, M9 browser)
Look at the last non-blank line, with Verify marks removed. A heading or a list item counts as complete. A paragraph is complete when it ends with `.`, `!`, `?` or `…`, optionally followed by closing quotes, brackets or `*`/`_`. Otherwise it ends mid-sentence. A colon at the end counts as mid-sentence. The server version (`completeEnd`) and the browser version (`kdpTextChecks.ending`) are tested against each other.

## 2. Changes (Part 2, browser)
- **H2:** `js/pen-name.js`: the label becomes "Point of view in your books" and the help line "The bio is always third person." (`selectField` gets an optional hint with `aria-describedby`). The option labels stay. Same text in `design/screens/12-pen-name-detail.html`, and its PNG is shot again.
- **M9 Checks:** `js/text-checks.js` adds a row `ending` (warn, counted): "The section ends mid-sentence." with the sub "Finish the last sentence or cut it." "Show" selects the cut fragment. Rows render generically, so `js/write-checks.js` needs no change unless a test shows otherwise.
- **M9 Export:** `js/export-rules.js` `model()` adds `cut: [item]`. `js/export-dialog.js` `notesHtml` adds a warning row like "Needs review": "3.1 and 4.1 end mid-sentence. Finish or cut the last sentence before you publish." It does not block and needs no tick. The existing "partial text" info row stays.

## 3. Tests
**Deno, generate** (now 293):
- `lib.section_write.test.ts`:
  - prompt rules: H1, H2, H3, M2, M3, M4, M7, M8, L1, L3;
  - examples go to the 2nd section only, or the 1st when the chapter has one section, never the intro or conclusion;
  - the new `writeAim` table (aim 50 → 310, 300 → 860, 500 → 1,300, 2,000 → 4,600);
  - `completeEnd` cases;
  - `<book_so_far>`: order, nearest first, the 3,000-character cap, escaping, empty.
- A new `lib.numbers.test.ts`: the table in 1.1 run through every stage's path (Brief, Positioning, Title, Outline, Outline check, Section check message, `markUnsourced`), so every stage gives the same answer. Update `MARK_ROWS` where the rule changes, because they also feed the browser parity test.
- Update `lib.outline.test.ts` (outlineUnsourced cases move to the new rule), `lib.test.ts` (bio prompt, Brief, Positioning and Title unsourced, L4 tags, M7 lines) and `lib.section_improve.test.ts` (POV, STYLE, M3, M7, L2, the Expand and Shorten numbers, the max_tokens table at 1.9 and 4,800).
- `lib.section_check.test.ts`: POV and STYLE in the voice definition, and message numbers under the new rule.
- `handler.section_write.test.ts` and `test_fakes.ts`: the store is called with `soFar`, and `<book_so_far>` is in the request.
- `snapshot.test.ts`: re-record. These prompts change: bio, brief_help, positioning_help, title_ideas, outline_ideas, section_write, section_improve, section_check. These must stay as they are: amazon_import, competitor_import, review_insights, drift_check, outline_check.

**Deno, helpers** (now 132):
- `tests/limits-parity.test.js`: 2.2 and 4,600; 1.9 and 4,800, with the Expand and Custom fit asserts.
- `tests/text-checks.test.js`: the parity with `markUnsourced` gets new EXTRA cases (parts, units with and without a result word, "proven"), plus the `ending` row and parity with the server's `completeEnd`.
- `tests/export-rules.test.js`: `cut` in `model()`.

**Browser** (mocked, `tests/browser/run.sh`):
- write `t-checks.js`: the ending row, Show, and the count. Update any number rows the new rule changes.
- export: the new note row.
- A short pen-name check of the label and help line at 1440 and 900 (there is no pen-name suite yet, so it goes in `tests/browser/shots/`).
- The full write (650), export (63), outline, title, brief and positioning suites stay green.

## 4. Verification before each STOP
- `deno check supabase/functions/generate/index.ts`; `deno test --allow-read=supabase/functions/generate supabase/functions/generate/`; every helper test in `tests/README.md`; the SQL suite unchanged (no SQL change).
- Review the snapshot diff: only the intended prompt lines change.
- `git diff 91e8901 --stat` lists only the files named above.

## 5. Live check (after v22 is deployed and you OK STOP 3)
This runs on the test account only (`.env.test`, user 1e117c74). Never sign in to the owner's account. The book is test book 4e2dde85 ("Somatic Healing for Anxiety"). That leaves the real E12 book untouched.
0. Note the `ai_usage` max id. I set Elena Vance's point of view to "Second person (you)" in the app (owner decision). That is a pen-name save and no AI.
1. **Bio** (1 call): generate Elena Vance's bio. Expect no claim about her books, no word "niche", 40 to 150 words. Accept nothing, so the old bio stays.
2. **05 Outline** (no AI): add a chapter "Live check" with 2 sections of 300 words each, Examples on. Approve the outline again.
3. **Generate both sections** (2 calls). Expect:
   - no example in section 1;
   - one example in section 2, with no name, age, job or "An example" heading;
   - "you" throughout;
   - no section or chapter numbers;
   - no "Picture:" lines;
   - no closing preview;
   - `<book_so_far>` in effect (no repeat of earlier subheadings);
   - count any AI Verify marks.
4. **AI check** on section 2 (1 call): expect no point-of-view voice finding.
5. **Improve** on a passage of about 80 words (3 calls): Expand (expect 130 to 160%), Shorten (expect 55 to 75%), Humanize. Reject all three.
6. **Checks tab and Export** (no AI): 3.1 and 4.1 show "Ends mid-sentence", and the Export dialog shows the new note. Close it without exporting.
7. Clean up: delete the "Live check" chapter if the app allows it, otherwise leave it in this test book. Note the `ai_usage` rows.

**Expected cost: 7 calls, about $0.08** (bio $0.004, 2 Generates $0.033, check $0.013, 3 Improves $0.025). The ceiling is about $0.15 if one call is repeated.

## Decisions (owner, STOP 1, 2026-10-26)
1. Units: the middle rule (a unit counts only with a result word).
2. Point of view when not set: "you".
3. Keep the picture line in Positioning and Title.
4. The M9 Export note is a warning that does not block and needs no tick.
5. The live check runs on the test account (`.env.test`, user 1e117c74), never on the owner's account.

## 6. Part 1 results (STOP 2, 2026-10-26)

Commit 83d1b02 on `claude/e12`. No migration, no SQL change, no AI calls, no Supabase writes.

**Tests:** `deno check` is clean. Generate: 293 → 307 passed, 0 failed (new: `lib.numbers.test.ts`, plus the prompt, examples, mid-sentence, `completeEnd` and `<book_so_far>` tests). Helpers: 132 → 133 passed (new `ending` parity, and more parity cases). `deno lint` reports nothing new: the 2 problems in `js/text-checks.js` were there before.

**Prompts that changed** (snapshot re-recorded, diff reviewed line by line): bio, brief_help, positioning_help, title_ideas, outline_ideas, section_write, section_improve and section_check. **Unchanged, as planned:** amazon_import, competitor_import, review_insights, drift_check and outline_check (its findings use the shared number rule, but its prompt is the same). Every other changed snapshot line is one of three things: max_tokens (Write 1,100 → 1,190 at 450 words, and the Improve values at 1.9), a request hash (`bodySha`), or an `unsourced` list under the new rule.

**Prompt size and cost:**

| Prompt | Before (characters) | After (characters) | Extra tokens per call |
|---|---:|---:|---:|
| Write system | 2,610 | 4,726 | about 700, plus up to about 1,000 for `<book_so_far>` |
| Improve system | 2,187 | 3,312 | about 375 |
| Check system | 2,101 | 3,057 | about 320 |
| Bio, Brief, Positioning, Title, Outline systems | | | 6 to 60 each |

For the 12,000-word book in the review (33 Write, 88 Improve and 44 Check calls), that is about **+$0.17 a book (about 8%) and +0.08M tokens**.

**Changes in behavior to know:**
- Small plain numbers are no longer flagged anywhere: "over 50", "a 4-week plan", "a 15-minute routine".
- Units now count only with a result word. "Lose 10 pounds" gets a Verify mark in Write, which it did not before. "A 5 lb weight" gets none in Outline, Brief, Positioning and Title, which flagged it before.
- A section number ("section 9.9") never gets a Verify badge in an AI check message, even when that section does not exist. G5 note 4 flagged that case before.
- Saved Title options and Outline chapters keep their old `unsourced` badges until the next Generate.
- `js/text-checks.js` already has `ending()` (with its parity test). The Checks row and the Export note that use it come in Part 2.
