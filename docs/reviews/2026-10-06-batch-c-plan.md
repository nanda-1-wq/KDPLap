# Batch C plan: features (i1 to i5, i10)

Date: 2026-10-06. Status: done. 0014 applied, generate v10 deployed, live check passed, committed and pushed as 631d48d (2026-10-06).

Owner decisions: A. custom target 2,000 to 150,000 words. B. the note next to
Next shows on 02 to 04 too, neutral style, for example "Not done yet: needs 1
source." Only 01 Brief blocks Next. C. Accept all skips suggestions with a
Verify flag, with the proposed note.
Scope: browser JS, a few CSS lines, one server helper, migration file 0014.
Files only: no deploy, no apply, no commit.
Rule: reuse existing patterns and classes. No new visual styles.

## 0. Live check (read-only, done 2026-10-06)

- 4 briefs. `length_range`: one `5-8k`, three null. `chapter_count`: one `5`, three null.
- 1 `research_insights` row, 4 competitors.
- `book_briefs` and `research_insights` have no column for i2 or i4 yet.
- Last applied migration: `20261006111850` (0013).

So 0014 can add two nullable columns and checks. No live row can fail them.

## Before-run

Run every suite before any edit and record counts below:
browser `positioning` (t1, t2, t-drift), `title` (t1, t-note, t-hyphen),
`delete` (t-dialog); Deno `generate`, `title-checks`, `limits-parity`;
SQL `supabase/tests/sql/run.sh` (all suites).

---

## i1. 01 Brief: chapters "Other"

Where: the **Chapters** field in the "Size, trim, and voice" card.

UI:
- Chips stay: `5 6 7 8 9 10 12`, then a new chip **Other** (same `.tone-chip`).
- Pressing **Other** marks it pressed and shows, right under the chips:
  label "Number of chapters", a number input (`.text-input`, narrow, like
  "Book number"), hint "From 3 to 30."
- Typing saves after the usual delay (800 ms), leaving the field saves now.
- Bad value: inline `.field-error` with the x icon: "Use a whole number from 3 to 30."
  Nothing is saved while it shows (same as Book number today).
- Pressing **Other** again (or a number chip) hides the input. A number chip
  saves that number. Pressing **Other** again clears the value (same as
  pressing a pressed chip today).
- Loading a book whose count is not a chip value (for example 11 or 4):
  **Other** is pressed and the input shows the number. This replaces today's
  trick of adding an extra chip for it.
- Empty input with Other pressed: saves null ("Not set"), no error.

Data: `chapter_count` (already `between 3 and 30` in 0001). No migration.

## i2. 01 Brief: custom word target

Where: the **Length** field, same card.

UI:
- Chips stay: `5K to 8K words · 8K to 12K · 12K to 20K · 20K to 30K · 30K+`,
  then a new chip **Custom**.
- **Custom** shows under the chips: label "Target words", a number input,
  hint "One number, for example 15000. From 2,000 to 150,000."
- Error: "Use a whole number from 2,000 to 150,000." Not saved while it shows.
- The page hint above the chips uses it: "About 110 pages at 6 × 9 in"
  (one number, not a range). Empty custom field: "Enter a word target to see an estimate of pages."
- Picking a range chip clears the custom target, and entering a custom
  target clears the range. One value at a time (one source of truth).
- Books page card: "Target 15,000 words" for a custom target (today it shows
  the range text). Same line, same style.

Data: **migration 0014** (file only):

```sql
alter table public.book_briefs add column target_words integer;
alter table public.book_briefs
  add constraint book_briefs_target_words_range_check
  check (target_words is null or target_words between 2000 and 150000);
alter table public.book_briefs
  add constraint book_briefs_length_one_value_check
  check (length_range is null or target_words is null);
```

The browser sends both fields in one save (the new one, and null for the
other), so the "one value" check never fails mid-way. `getBook` and
`listBooks` read `target_words`. Limits parity test gets 2000/150000 and
chapters 3/30 (browser vs SQL).

Open question A: is 2,000 to 150,000 the right range? (Answered: yes.
Correction found in testing: the app's own estimate puts 150,000 words at
about 1,130 pages at 6 × 9 in, not 828. The 0014 comment no longer claims it.)

## i3. Every step: what is missing

Same done rules as today. Only the reasons are new. Each step module gets
`missing()` → a short sentence, or '' when done.

| Step | Done rule (unchanged) | Reason text |
|---|---|---|
| 01 Brief | topic, target reader, reader problem | "Fill the topic", "Fill the reader problem", or joined: "Fill the target reader and the reader problem" |
| 02 Research | 3+ competitors, 1+ source | "Needs 2 more competitors", "Needs 1 source", or "Needs 1 more competitor and 1 source" |
| 03 Positioning | locked | First that applies: "Fill your approach" (missing cards, joined), "Run the drift check", "Resolve 2 drift flags", "Approve and lock" |
| 04 Title | title, subtitle, no Needs review | "Pick a title", "Add a subtitle". With Needs review: no reason (the existing "Needs review" flag already says it) |
| 05, 06 | placeholders | nothing |

Where it shows:
- **Sidebar:** under the step name of every not-done step 01 to 04, one line
  in the step-number style (IBM Plex Mono is not used; plain `--text-xs`,
  `--graphite`, no icon, no color, so it reads as info, not a warning).
  The step link grows from a fixed 44 px to a 44 px minimum to fit it.
  This is the only CSS change in the batch (3 lines, tokens only).
  Screen readers hear it as part of the link: "02 Research, Needs 1 source".
- **Next to Next:** the existing `.next-note` text. Today it says
  "N required fields left" on the Brief only. New: the reason of the current
  step, on steps 01 to 04. Next stays disabled only on 01 Brief (as today);
  on 02 to 04 Next stays enabled and the note just informs.
- Updates live: the sidebar and note re-render on the same `ctx.refresh()` /
  `setGate()` calls as today (typing in the Brief, adding a competitor, lock).

Open question B: on 02 to 04 the note shows while Next is enabled. OK, or
show it there only in the sidebar?

## i4. 02 Research: insights out of date

Where: the "What competitors miss" side panel, under "Analyzed 3 min ago".

UI (when the analysis is out of date):
- Under the subtitle, the same line the drift check uses (`.posn-stale`,
  warning icon + words): "Out of date. Competitors or their reviews changed
  after this analysis."
- The button already reads "Analyze again". It stays where it is. If there are
  fewer than 3 reviewed competitors now, the existing hint shows instead
  ("Add 1 more book with pasted reviews to analyze again.").
- Edited lines: Analyze again still asks first (existing confirm).
- After a new analysis the line goes away.

How it knows (needs a column, in **0014**):
- `research_insights.inputs_key text`, check `inputs_key is null or inputs_key ~ '^[0-9a-f]{8,32}$'`.
- At Analyze, the browser computes a short fingerprint (a plain hash, not a
  security feature) of what the AI reads: each competitor **with pasted
  reviews**, by id, with title, author, contents, low and high reviews.
  It is saved with the lines (`saveInsights`).
- Out of date = the fingerprint of the current competitors differs. So it
  catches add, edit, delete, and pasting or clearing reviews. Adding a
  competitor with no reviews does not make it out of date (the AI would not
  read it).
- Rows from before 0014 have no fingerprint: no "Out of date" line until the
  next Analyze (we cannot tell). The live data has 1 such row.
- No server change. (A server-side fingerprint would be more exact; not worth
  a new stage reply in v1.)

## i5. "Accept all" (01 Brief, 03 Positioning)

Where: the existing note "Suggestions are ready under target reader, reader
problem and reader promise. Nothing changes until you accept." Brief: under
"Help me fill this". Positioning: in the lock panel help area.

UI:
- A secondary button **Accept all** after the note text, shown only when
  2 or more suggestions are waiting.
- Each field goes through the same path as its own Accept: model, input,
  `saver.edit(field, 0)`. The edits leave in one save, like typing in two
  fields quickly. Positioning: the database clears the drift check on a text
  edit (0010), so the panel shows "Out of date" as with a single Accept.
- **Suggestions with a "Verify: no source" flag are skipped**, so the flag is
  never lost without a look. They stay with their own Accept and Discard.
  Note after: "Accepted 2 suggestions. 1 with a Verify flag is still waiting
  below." With none skipped the note goes away (as after the last single Accept).
- Focus goes to the first accepted field (Brief) or card (Positioning).
- Locked positioning: no suggestions exist, so no button.

Open question C: skip flagged suggestions (my recommendation), or accept
everything?

## i10. Server number check: figures of speech

File: `supabase/functions/generate/lib/common.ts`, `unsourcedNumbers`.
Before numbers are read from the **AI text**, remove these phrases
(case-insensitive, not inside a longer number):

| Phrase | Forms |
|---|---|
| 9-to-5 | `9-to-5`, `9 to 5` |
| 24/7 | `24/7`, `24/7/365`, `24-7` |
| one-on-one | `1-on-1` (the word form has no digits, so it is never flagged today) |
| 50/50 | `50/50` |
| 20/20 | `20/20` (hindsight, vision) |

Applies to all three stages that use it (brief_help, positioning_help,
title_ideas). The author's own text is unchanged.

Deno tests (`lib.test.ts`), both sides:
- Not flagged: "a 9-to-5 job", "support 24/7", "1-on-1 coaching", "a 50/50 split".
- Still flagged: "19-to-50", "24 hours", "9 to 50 minutes", "1-on-10",
  "250/50", "lose 12 pounds in 24/7 days" flags 12 only.
- One handler test (positioning_help) that a reply with "24/7" has no `unsourced`.
- Snapshot: **unchanged**. No existing snapshot case contains these phrases,
  so `__snapshots__/snapshot.test.ts.snap` must stay byte-identical.

---

## Tests

New browser suites (mocked, real-length text: full Brief fields near their
limits, competitors with long multi-paragraph reviews):
- `tests/browser/brief/` (new mock.js + t-chapters.js, t-length.js,
  t-missing.js, t-accept-all.js): i1, i2, i3 step 01, i5 Brief. Checks what
  each save sends, errors, reload state, screenshots.
- `tests/browser/research/` (new mock.js + t-stale.js, t-missing.js): i4
  (add, edit reviews, delete, add without reviews, old row without key), i3 step 02.
- `positioning/t-accept-all.js`, `positioning/t-missing.js`, `title/t-missing.js`.
- Existing suites re-run. Some current checks read "N required fields left"
  and will be updated to the new reason text (listed in the report).

Deno: i10 tests; limits-parity adds target words and chapters.
SQL: `supabase/tests/sql/t0014.sql` on local Postgres (55432): both checks,
both sides, RLS cross-user row for the new columns, upgrade from 0013 with
rows like the live ones.
End: re-run **all** suites in `tests/`, `supabase/tests/sql/` and the
`generate` Deno suite. STOP with the file list, the 0014 SQL, and before and
after counts.

## Files

New: `supabase/migrations/0014_brief_length_and_insights_key.sql`,
`supabase/tests/sql/t0014.sql`, `tests/browser/brief/*`, `tests/browser/research/*`,
`tests/browser/positioning/t-accept-all.js`, `t-missing.js`, `tests/browser/title/t-missing.js`.
Changed: `js/book-brief.js`, `js/book-research.js`, `js/book-positioning.js`,
`js/book-title.js`, `js/book.js`, `js/supabase.js`, `app/dashboard.html`,
`css/app.css` (step link, 3 lines), `supabase/functions/generate/lib/common.ts`,
`lib.test.ts`, `handler.positioning_help.test.ts`, `tests/limits-parity.test.js`,
`tests/browser/run.sh` (suite list comment), `tests/README.md`, this plan.

## Results

| Suite | Before | After |
|---|---|---|
| Deno generate | 117 / 0 | 120 / 0 (+3 i10 tests; snapshot unchanged) |
| Deno title-checks | 6 / 0 | 6 / 0 |
| Deno limits-parity | 6 / 0 | 7 / 0 (+ chapters 3-30, target words 2000-150000) |
| SQL t0010, t0011, t0012, t0013, rls_cross_user | 265 / 0 | 265 / 0 |
| SQL t0014 (new) | n/a | 32 / 0 |
| Browser positioning t1, t2, t-drift | 78, 40, 5 | 78, 40, 5 |
| Browser title t1, t-note, t-hyphen | 52, 8, 4 | 52, 8, 4 |
| Browser delete t-dialog | 1 | 1 |
| Browser brief (new) t-chapters, t-length, t-missing, t-accept-all | n/a | 24, 31, 12, 15 |
| Browser research (new) t-stale, t-missing | n/a | 19, 16 |
| Browser positioning t-accept-all, t-missing (new) | n/a | 21, 10 |
| Browser title t-missing (new) | n/a | 11 |
| **Browser total** | 188 / 0 | 347 / 0 |

Notes:
- No existing browser check needed a change (none read the old "N required
  fields left" text).
- Built as planned, with these small differences:
  - Positioning "Accept all" note says "still waiting on its card" (the
    help note is in the side panel, so "below" would be wrong). Brief says
    "still waiting below" as proposed.
  - Sidebar and note reasons for 3 missing Brief fields or 3+ missing
    positioning cards are counted ("Fill 3 required fields", "Add 5 required
    cards") so the note next to Next stays one short line.
  - CSS: 2 lines for the sidebar reason, 1 line for the number field width
    (reuses `--app-series-num-w`, the Book number width).
- Mock-only artifact: in the positioning and brief mocks the competitor list
  loads empty, so the sidebar shows step 02 as "Needs 3 competitors". Live
  data is not affected.

## Live check (2026-10-06, after 0014 applied and generate v10)

Read-only first: `target_words`, `inputs_key` and the three 0014 checks exist
live (last migration `20261006225951`). Owner had 4 books; ai_usage up to id 39.

New test book `c6af4a80…` (topic "Batch C live test: chair yoga…"), test account:
- Reasons: sidebar 01 "Fill the target reader and the reader problem" (note
  the same, Next blocked), 02 "Needs 3 competitors and 1 source", 03 "Add 5
  required cards", 04 "Pick a title". On 03: "Not done yet: add 5 required
  cards." with Next on.
- Other chapters 11 and Custom 15000 saved live (range null); estimate "About
  110 pages at 6 × 9 in"; 1999 shows the error and is not saved; the 12K to 20K
  chip replaced the target live (one-value rule held, no refused save);
  reload showed Other 11 and Custom 15000. Books page: "Target 15,000 words".
- Brief help (1 call): 3 suggestions. The AI flagged "65" in the target
  reader ("Adults over 65 …", not in the Brief). Accept all took reader
  problem and promise in one save and skipped the flagged target reader:
  "Accepted 2 suggestions. 1 with a Verify flag is still waiting below."
  Because the skipped one was a required field, Next stayed blocked and the
  reason became "Fill the target reader". That is the approved behavior; my
  script had expected the promise to be the flagged one (1 scripted FAIL,
  not an app bug).
- Research: 3 competitors + 1 source, step 02 done (no reason, no note).
  Analyze (1 call) saved inputs_key `a5ea1327b28a2dc2`; no stale line. A
  review edit on competitor 2 showed "Out of date. Competitors or their
  reviews changed after this analysis."; still shown after reload.
- ai_usage: id 40 brief_help (1242 in / 182 out, ok, counted) and id 41
  review_insights (1654 in / 263 out, ok, counted), both with the book id.
- Deleted the test book through the app. After: book, brief, competitors,
  sources and insights rows 0; ai_usage 40 and 41 book_id now null (on
  delete set null). The owner's 4 books are unchanged.
