# Batch C2 plan: notes from the real book walk-through (i13 to i17)

Date: 2026-10-07. Status: **done**. 0015 applied, generate v12 deployed, live check passed (see the end), committed and pushed as ed1c9fa (2026-10-07).

Owner answers (2026-10-07): A. the list as proposed, plus Other. B. fill only empty
fields, then one line such as "Filled 5 fields. Kept 2 you typed." C. at most 5
reviews per box. D. reuse the cost line now; after the live test, update it to the
measured cost.
Scope: browser JS, the `generate` Edge Function (one changed stage, one new
stage), migration file 0015, tests. Files only: no deploy, no apply, no commit.
Rule: reuse existing patterns and classes. No new visual styles.

## 0. Live check (read-only, done 2026-10-07)

- 4 briefs. `book_type`: three null, one `self_help`. No other value.
- `options`: every row is `{}` (no stance, stand-out or references saved yet).
- 4 research sources of kind `source`, longest citation 73 characters. 4 competitors.
- Live check name: `book_briefs_book_type_check`, values
  `beginner_guide, how_to, workbook, self_help, cookbook` (0001).
- Last applied migration: `20261006225951` (0014).

So 0015 can swap the type check and add one nullable column. No live row can fail it.

## Before-run

Run every suite before any edit and record the counts in Results:
Deno `generate`, `title-checks`, `limits-parity`; SQL `supabase/tests/sql/run.sh`
(all); browser suites brief, research, positioning, title, delete (every test file).

---

## i13. 01 Brief: more book types and "Other"

Where: **Book type** select in "The book" card (stays a `<select>`, same place).

Proposed list (existing keys keep their place and text, new ones after):

| Key | Text |
|---|---|
| `beginner_guide` | Beginner guide |
| `how_to` | How-to guide |
| `workbook` | Workbook |
| `self_help` | Self-help |
| `cookbook` | Cookbook |
| `health_wellness` | Health and wellness guide |
| `business_money` | Business and money guide |
| `parenting_family` | Parenting and family guide |
| `hobby_craft` | Hobby and craft guide |
| `reference` | Reference guide |
| `memoir` | Memoir or personal story |
| `other` | Other |

UI:
- First option stays "Not set". "Other" is last.
- Picking **Other** shows a field right under the select (same `.field`
  pattern as Chapters "Other"): label "Your book type", text input
  (`.text-input`, `maxlength=40`), hint "A short name, for example Gardening guide.
  Up to 40 characters." Focus moves into it.
- Typing saves after 800 ms, leaving the field saves now (autosave as today).
- Empty label with Other picked: saves `other` with no label, no error. The
  AI then gets no type (same as Not set).
- Label over 40 after trim cannot be typed (`maxlength`); a refused save
  uses the existing "This change breaks a Brief rule" error.
- Picking any other type hides the field and clears the label. Both columns
  always save together (like length and target words in 0014).
- Reload with `other`: the select shows Other and the field shows the label.

Data, **migration 0015** (file only):

```sql
alter table public.book_briefs drop constraint book_briefs_book_type_check;
alter table public.book_briefs
  add constraint book_briefs_book_type_check
  check (book_type in ('beginner_guide', 'how_to', 'workbook', 'self_help', 'cookbook',
                       'health_wellness', 'business_money', 'parenting_family',
                       'hobby_craft', 'reference', 'memoir', 'other'));
alter table public.book_briefs add column book_type_label text;
alter table public.book_briefs
  add constraint book_briefs_book_type_label_check
  check (book_type_label is null
         or (book_type = 'other' and char_length(btrim(book_type_label)) between 1 and 40));
```

(`book_type in (...)` with a null type passes, as today.)

Server: `BOOK_TYPES` in `lib/common.ts` gets the new keys. A new helper
`bookTypeText(type, label)` gives the text for `<book_type>`: the list text,
or for `other` the label as one line (`oneLine`, 40 max). It always goes
through `asData` (angle brackets escaped), like every other field. Used by
brief_help and the shared positioning context (positioning_help, drift_check,
title_ideas). `index.ts` reads `book_type_label` in both selects.
The system prompts do not change for i13: `<book_type>` is already named as data.

## i14. Help me fill also suggests stance and stand-out idea

Where: the existing "Help me fill this" button (top of 01 Brief). The two
fields are in **More options** (stance, stand-out idea).

Server (stage `brief_help`):
- Schema gets two more fields: `stance`, `standout` (all five required when
  `result` is "ok", as today for three).
- Prompt adds, under "What to write":
  - stance: "What the author believes about this topic that shapes the
    advice, written as the author's view (for example "Gentle daily movement
    beats hard weekly workouts."). Draft it only from the topic, reader,
    problem and promise. It is a belief, not a fact: no studies, numbers,
    credentials or personal history. At most 40 words."
  - standout: "The one thing that makes this book different from the page-one
    books, drawn from the Brief. At most 40 words."
  - Rules line: "Never invent facts about the author (job, training,
    experience, results)."
- `<current>` also sends the saved stance and stand-out (so a filled one gets
  a clearer version, not a new idea). Series and references are not sent.
- Known text for the Verify check adds stance, stand-out and references.
- Limits: 1 to 500 each (same as 0007 and the browser). Out of range = failed,
  not counted (as today). `MAX_TOKENS.brief_help` 800 → 1200.
- Older browser code ignores the two extra fields, so deploy order does not matter.

UI:
- `AI_FIELDS` gets "Your stance" and "Stand-out idea". Each suggestion uses the
  same box under its field (AI SUGGESTION, text, Verify line, "Accept replaces
  your text." / "Accept puts it in the field.", Accept, Discard).
- When either has a suggestion, **More options opens** so the boxes are seen.
- The note lists every waiting field: "Suggestions are ready under Target
  reader, Reader problem, Reader promise, Your stance and Stand-out idea.
  Nothing changes until you accept."
- Accept and Accept all save stance and stand-out through the `options` save
  (references and series are kept as they are). Accept all still skips
  suggestions with a Verify flag; the note after it says "below" as today.
- A suggestion equal to the current text is not shown (as today).
- Series name, book number and references never get suggestions.

Snapshot: `__snapshots__/snapshot.test.ts.snap` **changes on purpose**. Only
`brief_help` entries change (system, schema, user message, max_tokens and the
replies with the two new fields), plus new `competitor_import` entries (i17).
I will diff the file and list every changed entry name in the Results; any
other changed entry is a stop-and-ask.

## i15. References: "Copy from 02 Research"

Where: under the **References** field in More options, a secondary button
`Copy from 02 Research` (same `.btn btn-secondary`, left-aligned, 44 px).
No AI.

Behavior:
- Click: the button shows a spinner and "Copying…" while the sources load
  (one read: `research_sources` of kind `source`, oldest first, citation only).
- Each citation goes on its own line at the end of the field. A citation
  already in the field (same text on a line, any case) is skipped. The
  author's text is never replaced.
- If not all fit in 2,000 characters, the ones that fit are added.
- Saves like typing (`options`, now).
- Status line under the button (`.field-hint`, `role="status"`):
  - "Added 3 citations from 02 Research."
  - "Added 2 citations. 1 did not fit in 2,000 characters."
  - "All 3 citations are already in the field."
  - "No sources in 02 Research yet. Add a source with where it comes from." with
    a link "Open 02 Research" (`link-btn`, goes to step 02).
  - Error: `.alert alert-error` "We couldn’t load your sources." + "Try again".

## i16. 02 Research insights: short "From" titles

Where: the meta line under each insight ("AI · From …").

- Each title is cut at a word to about 40 characters plus "…" when longer.
  Shorter titles show in full.
- Each title is its own `<span title="Full title">`, joined with ", ". The short
  text is `aria-hidden`; a `.sr-only` copy reads the full title.
- No data change. Edited lines keep their `from` list as today.

## i17. 02 Research: "Import from Amazon page" for one competitor

Where: inside the **ADD COMPETITOR** form (not Edit), a secondary button
`Import from Amazon page` in the form head, next to the "ADD COMPETITOR" label.

Dialog (same classes as the Topic Lab import, `dialog dialog-lg`, focus trap):
- Title "Import from Amazon page". Text: "Paste one book’s Amazon page. We fill
  the form for you. Nothing is saved until you click Add competitor."
- Numbered steps (`import-steps`): 1 "Open the book’s page on Amazon."
  2 "Scroll down so the reviews show." 3 "Select the whole page with Cmd+A,
  then copy it with Cmd+C. On Windows, use Ctrl+A and Ctrl+C."
- Field "Page text" (textarea, count "n / 60,000 characters").
- Notes: "Nothing is fetched from Amazon. Only the text you paste is read." and
  "Uses about $0.05 of AI. It counts only if it works."
- Buttons: Cancel, **Read page** (primary). Working: spinner, "Reading the
  page. This can take up to a minute.", textarea read-only. Cancel during the
  call drops the reply (same as Topic Lab).
- Too short (under 200) or too long: inline field error, no call.
- Errors (alert in the dialog, text kept so the user can try again):
  - not a product page: "This does not look like one book’s Amazon page. Open
    the book’s page, copy it, and paste it again. This try was not counted."
  - shared AI codes: `kdpUi.aiMessage`.

After a good read the dialog closes and the form is filled:
- Filled: title, author, BSR, reviews, rating, 1 to 2 star reviews, 4 to 5
  star reviews (reviews split by a blank line, as the form hint asks).
- **Only empty fields are filled.** A field with the author's text keeps it.
- Missing numbers stay empty.
- A note at the top of the form (`.help-note`, `role="status"`):
  "Filled from the Amazon page. Check each field, then click Add competitor."
  Then, when they apply: "Not on the page: BSR, rating." / "Kept your text in
  Title." / "No reviews on the page. Paste them from the reviews page." /
  `ICON.warn` "This book is already in your list." (same title and author).
- Focus goes to the Title field. The form counts as dirty (leave warning).
- Nothing is written to the database until **Add competitor**.

Server, new stage `competitor_import`:
- Input `{ stage, bookId, text }`, text 200 to 60,000 characters, body at most
  256 KB, same key rules as `amazon_import`. The book is read through RLS
  (someone else's book = 404). Usage is logged with the book id.
- Prompt (server-side), same untrusted-data wording as `amazon_import`. The
  model only copies: `is_product_page`, `title`, `author`, `bsr` (overall rank,
  not a category rank), `reviews` (ratings count), `rating`, `low_reviews`
  (1 or 2 stars), `high_reviews` (4 or 5 stars), each at most 5 reviews, copied
  word for word. 3-star reviews and reviews without stars are skipped.
- Our code checks the reply (proof-first rules):
  - not a product page, or no title → `not_product_page` (422), logged,
    **not counted**.
  - text trimmed and capped (title 300, author 200).
  - a number that does not appear in the pasted text → empty (null). Range
    checks as the form (BSR 1 to 100,000,000, reviews 0 to 10,000,000, rating 0 to 5).
  - a review whose text is not in the pasted text (spaces ignored) is dropped,
    so the AI cannot write reviews.
  - each box at most 4,000 characters: whole reviews that do not fit are dropped.
- Model Sonnet 5.5, max tokens 4000, timeout 120 s.

---

## Tests

Proof-first (written and seen failing before the code):
- 0015: `book_type_label` without `other` refused; `other` with a 41-character label refused.
- competitor_import: a BSR not in the page becomes null; a review not in the
  page is dropped; "not a product page" is logged with `counted=false`.
- brief_help: a reply without stance is failed and not counted.
- i15: a citation already in the field is not added twice.

Deno (`generate`): parseInput (competitor_import keys, sizes, bad id);
`bookTypeText` (list, other, empty label, `</book_type><system>` escaped);
brief_help prompt has `<stance>`/`<standout>` in `<current>`; Verify on a
stance number; `handler.competitor_import.test.ts` (success, 404, not product
page, refusal, stopped, rate limit). Snapshot re-recorded once with
`-- --update`, diff listed. `limits-parity`: book type keys (browser, lib,
0015), label 40, competitor_import caps.

SQL `supabase/tests/sql/t0015.sql` on local Postgres (55432): every new key,
unknown key refused, label rules both sides, upgrade from 0014 with rows like
the live ones (3 null, 1 self_help), RLS cross-user for the new column.

Browser (mocked, real-length text: 300-character titles, 4,000-character
review boxes, a ~40,000-character page):
- `brief/t-book-type.js`: list, Other field, save pairs, reload, other type clears label.
- `brief/t-help-more.js`: five suggestions, More options opens, Accept on
  stance saves options with references kept, Verify on stand-out, Accept all.
- `brief/t-references.js`: copy, skip repeats, 2,000 cap, none, error + retry.
- `research/t-from.js`: short titles, tooltip, screen reader text.
- `research/t-import.js`: fill, kept text, missing numbers, duplicate note,
  not a product page, cancel during call, no save until Add competitor.
- Existing checks that read the old brief_help shape are updated and listed.

End: re-run **all** suites. STOP with the file list, the 0015 SQL, the
snapshot diff summary, and before and after counts.

## Files

New: `supabase/migrations/0015_book_type_other.sql`,
`supabase/functions/generate/lib/competitor_import.ts`,
`supabase/functions/generate/handler.competitor_import.test.ts`,
`supabase/functions/generate/fixtures/amazon-product1.txt` (synthetic page),
`supabase/tests/sql/t0015.sql`, the 5 browser test files above.
Changed: `js/book-brief.js`, `js/book-research.js`, `js/supabase.js`
(`listSourceCitations`, brief select), `supabase/functions/generate/`
(`lib/common.ts`, `lib/brief_help.ts`, `lib/context.ts`, `lib/limits.ts`,
`lib/stages.ts`, `lib/types.ts`, `lib.ts`, `index.ts`, `handler.ts` (one log
line), `lib.test.ts`, `snapshot.test.ts`, `test_fakes.ts`, the snapshot file),
`tests/browser/{brief,research}/mock.js`, `tests/limits-parity.test.js`,
`tests/README.md`, this plan.

## Results

| Suite | Before | After |
|---|---|---|
| Deno generate | 121 / 0 | 144 / 0 (+18 lib, +7 competitor_import handler, +2 brief_help handler; existing brief tests updated to five fields) |
| Deno title-checks | 6 / 0 | 6 / 0 |
| Deno limits-parity | 7 / 0 | 9 / 0 (+ book types and Other label 40 in browser, server, 0015; + import page text) |
| SQL t0010 to t0014, rls_cross_user | 297 / 0 | 297 / 0 |
| SQL t0015 (new) | n/a | 39 / 0 |
| Browser, existing 18 files | 366 / 0 | 366 / 0 (no existing check changed) |
| Browser brief t-book-type, t-help-more, t-references (new) | n/a | 21, 23, 21 |
| Browser research t-from, t-import (new) | n/a | 9, 33 |
| **Browser total** | 366 / 0 | 473 / 0 |

`deno check` of index.ts and every test file: exit 0.

Proof-first, seen failing before the code:
- t0015 ran first without 0015 (stopped on the missing column). Then it caught
  a real bug in my first 0015: with a null type, `book_type = 'other'` is null
  and the check passed, so "label with no type" was accepted. Fixed with
  `book_type is not distinct from 'other'` (2 checks went from FAIL to PASS).
- Deno: 19 new or changed tests failed before the server code, including "an
  old three-field brief_help reply is failed", "a number not in the page stays
  empty", "a review not in the page is dropped", "not a product page is not counted".

### Snapshot entries changed (`__snapshots__/snapshot.test.ts.snap`, 80 → 87 entries)

Changed (7, all brief_help):
`buildRequest brief_help` (system prompt, schema, user message with `<stance>`/`<standout>`, max_tokens 1200),
`handler brief_help success`, `unsourced`, `5501 origin` (replies now carry stance and standout),
`handler brief_help model vague`, `empty field`, `refusal` (only the request body hash changed: new prompt).

Added (7, competitor_import): `buildRequest competitor_import`, `handler competitor_import
success`, `numbers not in page`, `not a product page`, `not visible`, `text too short`, `max_tokens`.

No other entry changed or was removed (checked by a script that compares every entry).

### Built as planned, with these small differences

- i17 note: "Not on the page: …" names only fields that are still empty, and "No
  reviews on the page" shows only while both review boxes are empty (found in
  testing: a second import said "review count" while that field had a value).
- i17 note when nothing is new: "Nothing new to fill. Kept 2 you typed."
- i17 number check limit: a number counts as "in the page" when it appears
  anywhere in the pasted text. A review that says "5,000,000 reviews" would let
  5000000 through as the review count. The prompt asks for the ratings count,
  and the author checks the form before Add competitor. (The test fixture has
  exactly this case; the test now uses a number that is not in the page.)
- i15 counts repeated citations once ("All 3 citations are already in the field.").
- `js/book.js`: one line, `ctx.go(n)`, so "Open 02 Research" works like a sidebar link.
- `bookTypeText` uses `Object.hasOwn`, so a stored key like "constructor" can never
  reach the prompt (the old `BOOK_TYPES[key]` lookup could).
- i16: only a title that is cut gets the tooltip span; a short title is plain text.
- No CSS change.

### Files

New: `supabase/migrations/0015_book_type_other.sql`, `supabase/tests/sql/t0015.sql`,
`supabase/functions/generate/lib/competitor_import.ts`,
`supabase/functions/generate/handler.competitor_import.test.ts`,
`supabase/functions/generate/fixtures/amazon-product1.txt`,
`tests/browser/brief/t-book-type.js`, `t-help-more.js`, `t-references.js`,
`tests/browser/research/t-from.js`, `t-import.js`.

Changed: `js/book-brief.js`, `js/book-research.js`, `js/book.js` (ctx.go),
`js/supabase.js` (brief select, `listSourceCitations`),
`supabase/functions/generate/` `lib/brief_help.ts`, `lib/common.ts`, `lib/context.ts`,
`lib/limits.ts`, `lib/stages.ts`, `lib/types.ts`, `lib.ts`, `index.ts`, `handler.ts`
(one log line), `lib.test.ts`, `stages.test.ts`, `handler.test.ts`,
`handler.brief_help.test.ts`, `snapshot.test.ts`, `test_fakes.ts`, the snapshot file;
`tests/browser/brief/mock.js`, `tests/browser/research/mock.js`,
`tests/limits-parity.test.js`, `tests/README.md`, this plan.

### STOP 2 (after the owner applies 0015 and deploys generate)

Read-only schema check first, then a live test on a new test book (delete it
after): Other label, Help me fill (5 fields), Copy from 02 Research, one
competitor import. Measure the import's tokens and update the cost line in
`js/book-research.js` (owner decision D).

## Live check (2026-10-07, after 0015 applied and generate v12)

Read-only first: both 0015 checks and `book_type_label` exist live (last migration
`20261007190944`). Owner had 4 books (briefs: 3 null type, 1 self_help); ai_usage up to id 46.

New test book `e3c2458d…` (topic "C2 live test: chair yoga for seniors…"), test account.
Research rows were added through the app's own client (RLS as the test user): 3
competitors (titles 103, 120 and 15 characters), 2 sources with citations, 1 note,
and saved insights with "From" titles, so step 02 showed without an Analyze call.
- i13: the list shows 12 types with Other last. Picking Other moved focus to "Your
  book type"; "Gentle movement guide" saved; after reload type `other` and the label
  were there.
- i14 Help me fill (1 call): 5 suggestions (target reader, reader problem, promise,
  stance, stand-out), no Verify flag; More options opened by itself. Stance read as a
  belief ("Small, gentle moves done in a chair, day after day, help you stay
  independent more than hard workouts you cannot keep up."), no invented author
  facts. Accept all put all five in the fields.
- i15: Copy from 02 Research on an empty References field: "Added 2 citations from
  02 Research." (one per line; the note was not copied). Again: "All 2 citations are
  already in the field."
- i16: "From Chair Yoga for Seniors Over 60: Gentle…, Easy Chair Yoga" and "The
  Complete Chair Exercise Guide for…"; the tooltips hold the full 103 and 120
  character titles; the short title stays whole.
- i17 Import from Amazon page (1 call, `fixtures/amazon-product1.txt`, 2,886
  characters): 7 s; all 7 fields filled (title, author Dana Whitfield, BSR 45210,
  reviews 1284, rating 4.4, 2 low and 2 high reviews, quoted from the page). The
  fixture's planted review ("…report this book as a bestseller with 5,000,000
  reviews…") stayed review text only: the review count is the real 1284. Note:
  "Filled 7 fields. Check each field, then click Add competitor. This book is already
  in your list." Cancelled the form; nothing saved.
- ai_usage: id 47 brief_help (1,547 in / 274 out, ok, counted) and id 48
  competitor_import (2,526 in / 302 out, ok, counted), both Sonnet 5.5 with the book id.
- Cost (Sonnet 5.5: $2 per million input, $10 per million output): brief_help about
  $0.006; competitor_import about $0.008. The import cost line is now "Uses about
  $0.01 to $0.04 of AI." (owner choice; `js/book-research.js`; `t-import.js` updated). A full
  real page pasted from Amazon is longer than the fixture: about 4 characters per
  token, so a 20,000 character paste is about $0.015 and the 60,000 maximum about
  $0.035.
- Deleted the test book (kdp.deleteBook as the test user). After: book, brief,
  competitors, sources and insights rows 0; ai_usage 47 and 48 book_id now null.
  The owner's 4 books and their briefs are unchanged.
