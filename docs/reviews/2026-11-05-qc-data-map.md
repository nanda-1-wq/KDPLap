# Step 07 Quality Control: data map

Date: 2026-11-05. Read-only review of `main` at `e9b07af`. No code, migration or
test changed. Sources read: `supabase/migrations/0001` to `0026`,
`supabase/functions/generate` (`index.ts`, `handler.ts`, `lib/*.ts`) and `js/`.

**Scope (owner):** QC reads **every section with text** (current version not
blank, `public.text_is_blank`, 0019), not only Final ones. Same "has text" rule
as Export (`js/export-rules.js:78` `inFile`, `0025:316` `export_badges`).

Size key: **S** = browser-only rule on data we already load, no migration.
**M** = new rule plus a small read or a small migration. **L** = new table,
new Edge Function stage or new AI prompt.

---

## 0. Shared base (all groups)

| Need | What exists | File:line |
|---|---|---|
| Whole book in one read (chapters, sections, status, needs_review, current version text, partial, unsaved draft, run, Brief, Research, pen name, trim) | `export_json(book)` RPC, SECURITY INVOKER | `supabase/migrations/0025_export_settings.sql:222`, client `kdp.getExportData` `js/supabase.js:1321` |
| Book walk: labels, chapter numbers, "in file", notes | `kdpExportRules.model()` (needsReview, unsaved, partial, cut, repeats, marks, numbers, words) | `js/export-rules.js:109` |
| Chapter numbering (outline order) and file numbering (chapters in the file) | `numbers()` and `fileNumber` | `js/export-rules.js:61`, `js/export-rules.js:178` |
| Section labels "2.1 Title" | `labelOf()` | `js/export-rules.js:69` |
| Author's known text (Brief + Research + outline) | `kdpTextChecks.knownOf` (copy of server `writeKnown`) | `js/text-checks.js:136` |
| Per-section code checks (11 rows) | `kdpTextChecks.check(md, { known, target, title, others })` | `js/text-checks.js:383` |
| Sentence split, word count | `kdpSentences.split`, `kdpWords.count` (= `md_word_count`) | `js/sentences.js:40`, `js/word-budget.js:68` |
| Hash for fingerprints | `keyHash` (16 hex) | `js/section-check-key.js:26`, server `lib/outline_check.ts` |

**Recommendation:** QC is a browser screen that calls `export_json` once and
runs pure rules in a new `js/qc-rules.js` (no DOM, tested like
`tests/text-checks.test.js`). Only group 6 calls the AI. This keeps groups 1 to 5
and 7 free and fast, and reuses the exact rules the Checks tab and Export
already use, so the three screens never disagree.

---

## 1. Complete

| Item | Exists | File:line | Gap |
|---|---|---|---|
| Sections not Final | `sections.status` (`not_started`, `draft`, `reviewed`, `final`) | `0001_v1_data_model.sql:267` | None. `export_json` returns it; `model().notFinal` / `status` counts it. |
| Empty sections | `sections.current_version_id` + `text_is_blank`; `model().noText` | `0001:270`, `0019:30`, `js/export-rules.js:139` | None. |
| Open "Needs review" | `sections.needs_review`, `chapters.needs_review`; set by `unlock_positioning`, by a Generate finish or an Improve apply while unlocked | `0001:247`, `0001:269`, `0019:135` (lines 174, 179), `0023:165`, `0021:315` | None for reading (`model().needsReview`). Clear action exists: `kdp.markSectionsReviewed` `js/supabase.js:661`. |
| Far under word target | `sections.word_target` (0 to 10,000; the only stored target, chapters stay null) | `0001:266`, `0016:8`, `0016:64` | `export_json` does **not** return `word_target`. The Checks tab "words" row uses 80% / 120% (`js/text-checks.js:515`). Need: add `word_target` to `export_json` sections (one line in a new migration) and pick the QC threshold (reuse 80%, or "far under" = 50%). |
| Partial / cut text | `section_versions.partial`; `kdpTextChecks.ending()` | `0001:295`, `js/text-checks.js:160` | None. `model().partial`, `model().cut`. |
| Unsaved draft | `section_drafts`; `export_json.unsaved` | `0018:129`, `0025:278` | None. QC reads saved versions only; show "unsaved draft" as a note. |
| Same gate as "Mark book complete" | `complete_book()` rule: Final + text + no needs_review | `0026:74` | None. QC "Complete" should show the same counts so the two never disagree. |

**Reuse from 06 Checks:** `finding-rules.ready()` already builds a per-section
"left to do" list (needs review, code warnings, no AI check, stale check, major
findings) `js/finding-rules.js:191`. QC can roll it up per book.

**Size: S** (plus a one-line `export_json` change, which is a migration).

---

## 2. Sources

| Item | Exists | File:line | Gap |
|---|---|---|---|
| "[Verify: no source]" marks left | Marker constant; count; Checks row `marks` | `lib/numbers.ts:12`, `js/export-rules.js:90` `markCount`, `js/text-checks.js:390` | None. `model().marks.total` / `.sections`. |
| Numbers with no source and no mark | Server `markUnsourced`/`unsourcedList`; browser copy `kdpTextChecks.mark`, row `number` | `lib/numbers.ts:142`, `:168`; `js/text-checks.js:122`, `:398` | None. `model().marks.numbers` (`js/export-rules.js:93`). |
| Source not named, "[S3]" labels, "research shows" | Rows `source`, `named` | `js/text-checks.js:192`, `:196`, `:199`, `:437` | None. |
| Chapter outline numbers with no source | `chapters.unsourced text[]` | `0016:81` | Not in `export_json`. Optional. |
| List of sources the book has | `research_sources` (kind, body, citation); in `export_json.known.research.sources` | `0001:165`, `0025:248`, `kdp.listResearch` `js/supabase.js:378` | None for "sources entered". |
| List of sources **used** in the text | Nothing. The server strips `[S3]` labels before saving (`stripSourceLabels`, `lib/section_write.ts`), so no link from a sentence to a source survives. | — | **Missing.** Options: (a) match each source's `citation` (author / title words) in the text, browser only, approximate (**M**); (b) keep labels in a side table at Generate time (`section_sources`, **L**, changes E10.2). Recommend (a) for v1 with the label "Sources named in the text", plus "Not used anywhere" for sources never matched. |

**Size: S** for marks and numbers. **M** for "sources used" (approximate match).

---

## 3. Repeats

| Item | Exists | File:line | Gap |
|---|---|---|---|
| Same sentence in two sections | `sentenceKeys` (8+ words, lower case, marks and labels out), `bookRepeats`; book-wide in Export `model().repeats` | `js/text-checks.js:325`, `:339`; `js/export-rules.js:190` | None for sentences. Already book-wide. |
| Same sentence twice in **one** section | — | — | **Missing.** `sentenceKeys` + a Map inside one section (**S**). |
| Same paragraph in two places | — | — | **Missing.** Key = normalized paragraph text (same normalizer as `sentenceKeys`). **S**. A repeated paragraph also shows as N repeated sentences today; QC should group them so it is one issue, not N. |
| Repeated phrases | `repeats()`: 3 to 6 words, 3+ uses, per section only, `info`, skips title words | `js/text-checks.js:252` | Per section only. |
| Words overused book-wide | — | — | **Missing.** Word frequency per 10,000 words across all sections, skip `COMMON` set (`js/text-checks.js:243`) and the book's topic words (title, chapter titles). Needs a threshold decision (for example top 10 content words above N per 10k). **S** to build, owner decision on threshold. |

**Size: S** (3 small rules on top of `sentenceKeys`).

---

## 4. Pointers

| Item | Exists | File:line | Gap |
|---|---|---|---|
| "Chapter N" / "Section N.N" mentions | `MENTION` regex, row `mention` (warns on **every** forward or numbered mention: the 06 rule is "the file has no section numbers and no previews") | `js/text-checks.js:183`, `:432` | The rule flags all of them; it does not test N. |
| "earlier in this chapter" back references | `BACKREF`, row `backref` (info) | `js/text-checks.js:186`, `:487` | Not resolved to a place. |
| Valid chapter numbers | `numbers()` (outline) and `fileNumber` (only chapters in the file) | `js/export-rules.js:61`, `:178` | **Missing:** check N against `fileNumber` range, and flag "Section 2.3" (sections have no number in the file, `js/export-build.js:14`). Note: outline number and file number can differ when a chapter has no text (`model().droppedChapters`). QC must use the file number. **S**. |
| Pointer to a missing chapter by title ("see Seated twists") | — | — | Out of scope for v1 (fuzzy). |
| Leftover marks `[TODO]`, `TBD`, `XXX`, `[insert …]`, `{{…}}` | Only `[Verify: no source]` and `[S3]` labels are known | `js/text-checks.js:192` | **Missing:** one regex list (**S**). |
| **Conflict to decide** | 06 says any "Chapter N" mention is a warning. Group 4 says only a wrong or missing one is a problem. | — | Owner: does QC keep the 06 rule (all mentions), or allow a correct "See Chapter 3"? If allowed, the 06 `mention` row should change too, so the two screens agree. |

**Size: S.**

---

## 5. Consistency

| Item | Exists | File:line | Gap |
|---|---|---|---|
| One term spelled two ways ("e-mail" / "email", "warm up" / "warm-up" / "warmup") | — | — | **Missing.** Book-wide: normalize words (drop hyphens and spaces between two words, lower case), group variants with 2+ spellings. **M** (false positives need a small skip list). |
| Mixed US / UK spelling | — | — | **Missing.** A word-pair list (color/colour, organize/organise, center/centre, …, about 200 pairs). The book's choice: majority wins, or a Brief setting. No locale field exists today (`book_briefs` has none, `0001:121`). **M**. |
| Heading differs from the outline | Chapter and section headings in the file come **from the outline** (`chapters.title`, `sections.title`), never from the text (`js/export-build.js:13` to `:16`). The text only has "## " subheadings (`headingsIn` `lib/section_write.ts:120`). | — | So a book heading cannot differ from the outline. Real cases: (a) a "## " subheading that repeats the section title; (b) the section title or chapter objective edited **after** the text was written. For (b) there is no "title changed at" column: `outline_clear_approval` only clears `books.outline_approved_at` (`0017:273`). The section AI check key includes the titles, so its check goes "Out of date" (`js/section-check-key.js:52`), which is a partial signal. Recommend: compare the outline titles with the titles at the time of the current version (needs a stored snapshot, see §9) or skip (b) in v1. (a) is **S**. |

**Size: M.** No data exists for this group.

---

## 6. Promise (AI, paid, separate button)

| Item | Exists | File:line |
|---|---|---|
| Locked positioning (one_sentence, reader_promise, approach, lacks, selling_points, focus_tags, locked_at) | `positioning` | `0001:197` |
| Prompt blocks: Brief + Research, locked positioning, voice | `briefAndResearch`, `positioningBlock`, `positioningValues` | `lib/context.ts:106`, `:147`, `:57` |
| Chapter objective, section list | `chapters.objective`, `otherSectionsLine`, `locateSection` | `0001:243`, `lib/section_write.ts` |
| Stage pattern (read, check, limits, prompt, interpret, save, log) | stage table | `lib/stages.ts` |
| Quote must exist in text, gaps with empty quote | `findQuote`, `interpretSectionCheck` | `lib/section_check.ts:218`, `:241` |
| Book-level saved AI result, per-chapter ids in findings, `inputs_key` | `outline_checks` (findings carry `chapters: [uuid]`) | `0017:59`, `0017:112` |
| Per-section result with areas pass / issues / unclear | `section_checks.areas` | `0022:83`, `0022:112` |
| Usage logging, not counted on failure | `logUsage` into `ai_usage`; `counted` | `index.ts:449`, `handler.ts:158` |
| Limits | `CHECK` (50 to 6,000 words, 8 findings, 2 gaps), monthly tokens, 10 calls a minute | `lib/limits.ts:175`, `:36` |

**Missing:**
- A new stage (name it `book_check`, or `promise_check`) in `lib/limits.ts:6`
  `STAGES`, `MODEL_FOR_STAGE`, `BODY_BYTES`, `TIMEOUT_MS`, `MAX_TOKENS`.
  `ai_usage.stage` has no constraint, so no migration there (`0001:314`).
- A new table `book_checks` (one row per book): `promise` verdict + per-chapter
  rows `{ chapter_id, verdict: on_track | partial | off, message, quote }`,
  `inputs_key`, `checked_at`; service role writes, users read own (copy 0017 / 0022).
- A store read: `getWriteContext` (`index.ts:298`) reads one section. Need a
  book read of every chapter's current texts.
- **Rule question (CLAUDE.md §5 "one section or one step per AI call, never a
  full book in one call"):** a full book is 8,000 to 30,000+ words, over the
  6,000-word check cap. Recommend **one call per chapter** (chapter text vs its
  objective and the reader promise, verdict + max 3 findings), then the book
  verdict is computed by our code from the chapter verdicts. No call reads the
  whole book. The button shows the cost ("N calls"), and each chapter result is
  saved as it arrives, so a stop keeps the done chapters.
- Reuse the 06 per-section `section_checks` where it is current: a section with
  an in-date AI check has `areas.objective` and `areas.drift` already. QC could
  show those for free and only call the AI for the chapter-level promise view.

**Size: L** (stage, prompt, table, tests, design).

---

## 7. KDP rules

| Item | Exists | File:line | Gap |
|---|---|---|---|
| Links in print text | The Generate format forbids links (`FORMAT`, `lib/section_write.ts:150`). `markdown-lite` has no link syntax, so a pasted URL stays plain text in the DOCX. | `js/markdown-lite.js` | **Missing:** a URL / `www.` / email regex over the text (**S**). |
| Emoji | — | — | **Missing:** `\p{Extended_Pictographic}` regex (**S**). |
| Characters missing from the font | DOCX body font is Georgia 11 pt (`js/export-build.js:192`). Editor font (Source Serif 4) is not the print font. | — | **Missing:** an allowed-character set for Georgia (Latin, Latin-1, Latin Extended-A, common punctuation, Greek, Cyrillic). Flag anything outside it (**S**, the set is a fixed table; owner to confirm the print font stays Georgia). |
| Under 24 pages | `pages(words, trim)`: 250 words per 6x9 page, scaled by trim area, min 10, rounded to 5 | `js/word-budget.js:32`, `:40` | Exists, but it is the planning estimate. It ignores front matter (title, copyright, contents), chapter page breaks and headings. **Missing:** a QC page estimate = `pages(words)` + front-matter pages + one page per chapter start. **S**. KDP paperback minimum is 24 pages. |
| Health or money topic without a disclaimer | The copyright page always carries "not medical, legal or financial advice" **when the copyright part is on** | `js/export-rules.js:199` to `:201`, `js/export-dialog.js:167` | No topic category field exists (`book_briefs.book_type` is format only, `0001:128`; `pen_names.niche` is free text). **Missing:** (a) a keyword rule on Brief topic, reader problem, positioning and chapter titles (health, diet, pain, weight, money, invest, debt, tax, …); (b) "has a disclaimer" = Export copyright part on, or a "disclaimer" heading in the intro. The export parts are chosen in the dialog and saved only per export (`book_exports.parts`, `0025:79`). **M**. |

**Size: S** for links, emoji, glyphs, pages. **M** for the disclaimer rule.

---

## 8. Result

| Item | Exists | File:line | Gap |
|---|---|---|---|
| Verdict | `finding-rules.ready()` state model per section (`ready`, `left`, `nocheck`, `stale`, `final`) | `js/finding-rules.js:191` | **Missing** at book level. |
| Last run time | — | — | **Missing:** a `qc_runs` row (one per book): `checked_at`, `counts jsonb` per group, `versions uuid[]`, `inputs_key`. The code groups run in the browser, so the user writes this row (RLS insert / update own), like `book_exports` (`0025:79`). **M**. |
| "Out of date" | See §9. | — | — |

**Size: M.**

---

## "Mark as OK" (per issue, does not come back)

| Exists | File:line | Fit |
|---|---|---|
| `kept_findings` (section_id, type objective/voice/drift, message, quote, check_at for gaps; unique per section+type+quote; 50 per section; RLS own; guard trigger) | `0024_kept_findings.sql:45` to `:149` | Pattern fits; table does not: `type` is limited to the three AI types, rows are per section, and gaps live only for one check. |
| `keptOf`, `view` (hide kept, pass rows), `sameInstant` (microsecond timestamps) | `js/finding-rules.js:71`, `:91`, `:63` | Reuse the logic. |
| `keepFinding` / `unkeepFinding` / `listKeptFindings` (23505 = already kept) | `js/supabase.js:1186` to `:1214` | Copy for QC. |

**Missing:** a new table `qc_dismissed` (book_id, nullable section_id, `rule`
text such as `repeat_sentence`, `pointer_chapter`, `us_uk`, `emoji`, …, and a
stable `issue_key` text: the normalized match, for example the sentence key
from `sentenceKeys` or `"colour|color"`). Unique on (book_id, rule, issue_key).
An issue is hidden while its key still matches; when the text changes so the
key changes, it comes back (same rule as kept quotes today). A cap per book
(for example 500). **M** (one migration, RLS, guard, tests).

Do not reuse `kept_findings` by widening its `type` check: it would mix
section AI advice with book QC rows and break its 50-per-section cap logic.

---

## 9. How to detect "Out of date"

Change keys that exist today:

| Key | What changes it | Good for QC? | File:line |
|---|---|---|---|
| `sections.current_version_id` | Every save, restore, Generate finish, Improve apply (versions are insert-only) | **Yes**: exact text identity | `0001:270`, `0018:311`, `0020:221`, `0021:195` |
| List of current version ids in book order | Any text change, a section added, removed or reordered | **Yes.** Already used by `export_badges` "changed" | `0025:316`, `js/export-rules.js:197` `versionIds` |
| `section_checks.inputs_key` / `kdpSectionCheckKey` | Version, chapter title/objective, section title, lock time, pen voice, word target, sibling titles | Per section, for the AI group only | `0022:120`, `js/section-check-key.js:52` |
| `outline_checks.inputs_key` | Outline + positioning lock time | For outline-level inputs | `0017:116`, `js/outline-key.js` |
| `positioning.locked_at` | Lock / unlock | Yes, for group 6 | `0001:208` |
| `books.updated_at` | Touched by any section, chapter, Brief or Research change (`touch_book_from_section`, `touch_book_from_child`) | **No**: too broad (a status change or a new competitor also moves it), and it is also the Books sort key | `0016:238`, `0009` |
| `sections.updated_at` | Any section column, status included | No: status changes are not text changes | `0001:272` |
| `section_drafts` | Unsaved typing | No: QC reads saved versions only | `0018:129` |

**Recommendation:** two keys, both computed in the browser with `keyHash`, saved
in `qc_runs`:

1. **`text_key`** = hash of the current version ids of every section with text,
   in book order (the exact `export_badges` list). Any text change makes the
   result "Out of date". This needs no new trigger.
2. **`inputs_key`** = hash of what the code rules read besides the text:
   chapter and section titles, word targets, chapter kinds, trim size, the
   known text (`knownOf`) and the positioning `locked_at`. A title edit or a new
   source then also marks it "Out of date".

Group 6 (AI) keeps its own key per chapter (version ids of the chapter +
objective + title + `locked_at` + promise), like `sectionCheckKey`, so a change
in chapter 3 does not make chapters 1 and 2 stale.

The Books card and the 07 sidebar step can show "Out of date" with one SQL
function like `export_badges` that compares `qc_runs.versions` with today's
list (server rule, one source of truth, `0025:316` pattern).

---

## Summary table

| Group | Data exists | Reuse from 06 / Export | Missing | Size |
|---|---|---|---|---|
| 1 Complete | Yes | `model()`, `ready()`, `complete_book` rule | `word_target` in `export_json` | S |
| 2 Sources | Marks, numbers, sources list | `markCount`, `numberCount`, `knownOf`, `source`/`named` rows | Sources used in text (labels are stripped) | S / M |
| 3 Repeats | Sentences across sections | `sentenceKeys`, `bookRepeats`, `model().repeats`, `COMMON` | In-section sentence, paragraph, book-wide word frequency | S |
| 4 Pointers | `MENTION`, `BACKREF`, chapter numbers | `numbers()`, `fileNumber` | Number validation, `[TODO]` list; owner rule on correct mentions | S |
| 5 Consistency | Nothing | `WORD` regex, `headingsIn` | Variant spelling, US/UK list, title-changed signal | M |
| 6 Promise (AI) | Positioning, objectives, check patterns | `section_check`, `outline_checks`, `context.ts`, limits, usage log | Stage, prompt, `book_checks` table, per-chapter calls | L |
| 7 KDP rules | Page estimate, copyright disclaimer | `pages()`, `export-rules` copyright | Links, emoji, glyph set, front-matter pages, health/money rule | S / M |
| 8 Result | Per-section `ready()` | `finding-rules` | `qc_runs` table, verdict | M |
| Mark as OK | `kept_findings` pattern | `keptOf`, `keepFinding` | `qc_dismissed` table | M |

## Open questions for the owner

1. Group 4: keep the 06 rule (every "Chapter N" is a warning) or allow a correct one?
2. Group 6: one AI call per chapter (fits CLAUDE.md §5) instead of one book call?
3. Group 5: US or UK as the book's choice: majority of the text, or a new Brief field?
4. Group 7: is Georgia staying the print font (sets the character list)?
5. Group 1: "far under target" threshold: 80% (as 06) or lower?
6. Group 2: is an approximate "sources named in the text" list good enough for v1?
