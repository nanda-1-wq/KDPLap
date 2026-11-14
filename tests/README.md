# Tests

All commands run from the repo root. None of them touch the live project.

## Edge Function `generate` (Deno)

```sh
deno check supabase/functions/generate/index.ts
deno test --allow-read=supabase/functions/generate supabase/functions/generate/
```

- `lib.test.ts`: prompts, parsing, limits. `lib.outline.test.ts`: the
  outline_ideas number rule, word target, contents budget and reply cleaning.
  `lib.outline_check.test.ts`: which AI outline findings are kept (real
  chapters, a quote really in the reader promise), the prompt, and the outline
  fingerprint (inputs_key).
- `handler.test.ts`: the shared request flow. `handler.<stage>.test.ts`: one file per stage.
- `lib.section_write.test.ts` and `handler.section_write.test.ts` (E10.2,
  Generate section): the input, words per call and max_tokens, the prompt,
  the clean-up and source markers, the SSE reader, and the whole streamed run
  with a fake Anthropic stream (`streamReply` in `test_fakes.ts`, small timers
  `FAST`): each end (complete, Stop, closed tab, deadline, idle, AI error,
  HTTP 529, refusal, max_tokens, too long, shutdown), what it saves and
  counts, the save retry, the refusals before any AI call, rule A (a stale
  run recovered) and rule C (heartbeats and Stop are not AI calls).
- `lib.section_improve.test.ts` and `handler.section_improve.test.ts` (E10.3,
  Improve menu, not streamed): the input per action (instruction only for
  Custom), the word limits (Expand 1,000), max_tokens per action, the prompt
  (Brief block, voice, data tags, injections, the six task blocks), reading
  the reply, the source markers on the output, the notes (markers lost, new
  names, structure), the saved suggestion and its counted row, the refusals
  before any AI call (with the reserve), and Cancel (the server finishes).
- `lib.promise_check.test.ts` and `handler.promise_check.test.ts` (E14.5, the promise check of
  one chapter: input, the checks before the call in order, prompt, reply, save, usage).
- `lib.cover_blurb.test.ts` and `handler.cover_blurb.test.ts` (E15 Part 5, the back cover
  headline and blurb of 09, not streamed): the input (stage and bookId only, 2 KB), the checks
  before the call in order (positioning locked, a 04 title), the prompt (data tags, escaping,
  nothing from the Brief or Research), the number rule (the locked Positioning, the 04 title and
  subtitle are sources, owner Nov 12; the pen name is not), reading the reply (plain text,
  paragraphs, the headline at 12 words and 80 characters, a blurb 0029 cannot save is not
  counted), the refusals before any AI call (with the reserve), and leaving mid-call (counted).
  The server saves nothing.
- `lib.section_check.test.ts` and `handler.section_check.test.ts` (E10.4, the
  AI check in the Checks tab, not streamed): the input (no text from the
  browser), the checks before the call (50 to 6,000 words, the saved version,
  unsaved typing, a fresh run), the fingerprint (inputs_key), the prompt (data
  tags, escaping, injections, intro and conclusion, voice), which findings are
  kept (a quote really in the text; an empty quote only for at most 2
  objective gaps), the areas, the saved check and its counted row, the
  refusals before any AI call (with the reserve).
- `lib.numbers.test.ts` (E12 step 2): the one number rule. A table of
  phrases runs through every stage's own path (the Write and Improve
  markers, Brief help, Positioning, Title, Outline, the outline check and the
  AI section check), and every path gives the same answer.
- `stages.test.ts`: the stage table.
- `snapshot.test.ts`: the exact provider request for every stage, and every
  reply and error shape. A refactor must leave
  `__snapshots__/snapshot.test.ts.snap` unchanged. Re-record only for an
  intended change, and review the diff:
  `deno test --allow-read --allow-write supabase/functions/generate/snapshot.test.ts -- --update`
- Shared fakes: `test_fakes.ts`.

## Browser helpers (Deno)

```sh
deno test tests/title-checks.test.js
deno test tests/outline-checks.test.js
deno test --allow-read tests/limits-parity.test.js
deno test --allow-read tests/outline-key.test.js
deno test tests/markdown-lite.test.js
deno test tests/word-diff.test.js
deno test --allow-read tests/word-count.test.js
deno test --allow-read tests/book-words.test.js
deno test tests/sse-read.test.js
deno test --allow-read tests/sentences.test.js
deno test --allow-read tests/text-checks.test.js
deno test --allow-read tests/section-check-key.test.js
deno test --allow-read tests/selection-in-text.test.js
deno test --allow-read tests/finding-rules.test.js
deno test --allow-read tests/export-rules.test.js
deno test --allow-read tests/export-build.test.js
deno test --allow-read tests/usage-rules.test.js
deno test --allow-read tests/user-name.test.js
deno test --allow-read tests/brand-name.test.js
deno test --allow-read tests/qc-rules.test.js
deno test --allow-read tests/qc-glyphs.test.js
deno test --allow-read tests/qc-promise-key.test.js
deno test --allow-read tests/format-typst.test.js
deno test --allow-read tests/font-cmap.test.js
deno test --allow-read tests/pdf-check.test.js
deno test --allow-read tests/format-rules.test.js
```

- Rename to NicheInk (design 40): `brand-name.test.js` scans every served
  page, script and style (comments left out): no "KDP Lab" where a user sees
  it, every title names NicheInk, the Amazon disclaimer, the wordmark spans
  and their no-wrap rule, the 40c sizes (22 px, 21 px on the landing at 900 px
  and below) and the wrapping logo row with a mark that never shrinks, "PUZZLE TOOLS", the landing text, relative links only
  (no `/KDPLap/`, `github.io`, `<base>` or root-absolute paths, so a rollback
  to github.io keeps working), `robots.txt`, and `CNAME` once GitHub writes it.
  `export-build.test.js` also checks the .docx Author: the pen name, else NicheInk.

- E11 (designs 24b and 25b): `export-rules.test.js` is the Export dialog's
  include rule (the cases in `tests/fixtures/export-include.json`, shared with
  the SQL test `t_export_include`), counts, notes, run freshness, the AI note,
  Verify marks (the old v15 places too), the sections that end mid-sentence
  (E12 M9, a note only), the same sentence in more than one section (E12 fix
  batch 2, a note only), the copyright text and the file name. `strip` takes
  out source labels too.
  `export-build.test.js` checks the exact Markdown and opens a real .docx
  (docx 9.5.1 from `tests/browser/.cache/`, its SRI checked; unzipped by
  `tests/lib/unzip.js`): page sizes, page numbers only in the body and from 1,
  chapter page breaks, bookmarks and links, no marks, lists and styles. Run any
  browser suite once first, so the cache holds docx. `usage-rules.test.js` is
  the Settings usage card (and, E12 fix batch 2, the Generate chapter cost
  line: `chapterEstimate`, `tokensText`); `user-name.test.js` the sidebar name rule.

- `finding-rules.test.js` (G5, design 22d): severity from the type, Keep as is
  matching (type + exact quote; a gap by message on its own check, timestamps
  compared to the microsecond), what the Checks tab shows, the Fix major N
  rule and the tab count. E12 fix batch 2 (design 22e): a check's own Fixes
  (`isCheckFix`), words changed, the owner's rule for a check that still holds
  (`stillValid`, every case of the 22e table), the fixed findings of a still
  valid check, the "Ready to mark Final" block (`ready`), and the AI edit list
  against Export's and 0021.

- `outline-checks.test.js`: the step 05 code checks and the shared words and
  pages helper (`js/word-budget.js`, about 250 words a page).
- `limits-parity.test.js`: the same limits in the browser files,
  `generate/lib/limits.ts` and the migrations (title 200, Brief lengths,
  positioning sizes, competitor caps, insight and title-option caps, Brief
  chapters 3 to 30 and custom word target 2,000 to 150,000, book types and
  the 40-character Other label, competitor import page text, outline limits
  (0016), the Brief length ranges, one page estimate helper, and Generate
  section: 2,000 words a call, max_tokens, the 100 s deadline, the 20 s and
  160 s stale run and 100,000 characters in 0020; the Improve menu: actions,
  text sizes, the stale run and the 1-hour life in 0021, the word limits and
  max_tokens; the AI section check: types, findings, message and quote sizes,
  empty quotes and words in 0022). It fails
  when a value disagrees or can no longer be found.
- `qc-rules.test.js`: 07 Quality Control's free checks (`js/qc-rules.js`, `js/qc-lists.js`,
  plan section 5, E14.2): a hit and a near miss for each of the 25 rules, keys, spots, the
  caps and `more`, US/UK majority and tie, noun/verb pairs, © ® ™ not emoji, "Chapter N",
  the disclaimer cases, sources named, the verdict with dismissals and drifts, and a
  120,000-word book under 1 s. Every output is checked by `tests/lib/qc-shape.js`, a copy of
  `qc_results_ok` (0028) whose numbers and rule ids `limits-parity.test.js` reads from the
  migration. Books come from `tests/fixtures/qc-books.js`: generated or made up, never real
  book text.
- `qc-glyphs.test.js`: the table of characters per 08 style (`js/qc-glyphs.js`, made by
  `tools/qc-glyphs.mjs` from the pinned fonts, sha384 checked). To compare it with the real
  fonts: `deno run --allow-read --allow-write --allow-net tools/qc-glyphs.mjs --check`.
- `qc-promise-key.test.js`: `promiseKey` (`js/qc-promise-key.js`) against the fixed values in
  `tests/fixtures/qc-promise-key.json`, and the server twin (`lib/promise_check.ts`, E14.5) on the
  same file. Also: both list the same versions (the 0019 blank rule).
- `markdown-lite.test.js`: the step 06 text format (`js/markdown-lite.js`): the
  Markdown subset to HTML (everything escaped) and back from the editor's DOM
  (only an allowlist is read; pasted markup and scripts are dropped), the
  "[Verify: no source]" pill both ways (E10.2), and `fromDomMap` (E10.3): the
  same Markdown as `fromDom`, DOM positions to Markdown offsets and back, the
  pill's edges, and Improve outputs that read back the same.
- `sentences.test.js`: the Improve menu's sentence rule (`js/sentences.js`) cuts
  lines exactly like the server's `sentencesOf` (the E10.2 marker rows, read
  from `lib.section_write.test.ts` as data, and more); snapping a selection to
  whole sentences (markers, list and heading lines, blank edges); the context
  on each side (about 300 words, 2,500 characters).
- `text-checks.test.js`: the Checks tab's code checks (`js/text-checks.js`,
  E10.4): the number rule gives the same text as the server's
  `markUnsourced` (the E10.2 marker rows, read as data, and more), the
  known text is the server's `writeKnown`, the numbers row holds exactly the
  sentences that rule marks; text that ends mid-sentence (E12 M9: the row,
  Show on the cut piece, and the same answer as the server's
  `endsMidSentence` and `completeEnd`); mentions of another part of the book
  (E12 Part 3: "next section", "next chapter", "following section", "following
  chapter", "later in this book", "later in the book", "later in this chapter",
  and "section" or "chapter" with a number; back references are allowed); open marks, repeated phrases (3 to 6 words, 3+
  times, the longest, never common words only; E12 fix batch 2: info and never
  counted, never the words of the section title or its own subheadings, headings
  are not uses), "Source not named" (a label such as `[S3]`, Show on the label,
  and "another source" with no name; the label pattern and strip against the
  server's `SOURCE_LABEL` and `stripSourceLabels`; a label at the end is not a
  cut sentence; E12 fix batch 3: "according to one source"), "Check that the
  source is named" (info: "research shows", "experts say"; not after "this",
  "that", "these", "those", "the same", a name's "'s" or a possessive; never a
  sentence with an open mark), "Points back to another part" (info: "earlier
  in this chapter"; a preview stays in the mention row), "Also in another section" (sentences of 8+ words another
  section has, with where; `sentenceKeys`, `bookRepeats`), the same opener (paragraphs
  only; a heading or a list resets), words vs the target (under 80%, over
  120%, never counted), and under 30 ms on a 16,000-word section.
- `section-check-key.test.js`: the section check fingerprint in the browser
  (`js/section-check-key.js`) and in the function (`lib/section_check.ts`)
  give the same key, and a pinned value; the word target and the other
  sections of the chapter are parts of it (G3 P10).
- `selection-in-text.test.js` (G3 P9): the browser's own selection and context
  (`js/sentences.js` snap and context) on Markdown with bold, italic, list
  items, headings and a marker, and the whole section, all pass the
  function's check that an Improve passage is part of the section
  (`selectionInText`, `lib/section_improve.ts`).
- `word-diff.test.js`: Compare versions (`js/word-diff.js`), design 23, and a
  10,000-word section.
- `word-count.test.js`: `kdpWords.count` gives the same counts as
  `md_word_count` (0018, and 0020: the source flag is not words); it checks
  that `t0018.sql` and `t0020.sql` have the same cases.
- `book-words.test.js`: the Books card word bar (`kdpWords.bookProgress`, E12 fix batch 3,
  design 01b): section targets, the Brief's custom target or range (bar against the low end),
  no target, over the target, completed, and today's "Target …" texts with no saved words.
- `sse-read.test.js`: the browser's stream reader (`js/sse-read.js`), the same
  rules as the server's: split chunks, comments, several data lines, a body
  split inside a character, a broken stream.
- `outline-key.test.js`: the outline fingerprint in the browser
  (`js/outline-key.js`) and in the function (`lib/outline_check.ts`) give the
  same key (real-length outline, quotes, emoji), a pinned value, and the AI
  check caps against 0017.
- E13.1 (08 Format, print engine): `format-typst.test.js` is the book →
  Typst converter (`js/format/md2typst.js`): every case of the E13.0 proof
  (`tests/fixtures/typst-cases.js`, exact output), 300 seeded fuzz strings
  that must never leave markup unescaped, and `main.typ` from the export
  model and the 08 settings (Final sections only, against the shared include
  fixture; chapter labels; drop cap and the indent after it; parts; ISBN;
  About the author; Also by; header title; recto start; hostile titles).
  `font-cmap.test.js`: the TrueType cmap reader (format 4 and 12 fonts built
  byte by byte) and the missing-character list with where each one is.
  `pdf-check.test.js`: the PDF reader and the checks before a Print PDF
  download, on small PDFs written by hand. `format-rules.test.js`: the 08
  rules (`js/format-rules.js`); styles, labels, papers, every default, the
  header and Also by limits and the ISBN rule are read from 0027 and must match.

## 09 Cover model (E16 Part 1, Deno)

```sh
deno test --allow-read tests/cover-*.test.js
deno run --allow-read tools/cover-golden.mjs --check       # the fixture still equals the design
deno run --allow-read --allow-write tools/cover-golden.mjs # re-freeze, only if design 58 changes (review the diff)
```

- The pure 09 code in `js/cover/` (geo, textlayout, shapes, names, model,
  remap, history, palettes, kindle, checks, layouts), loaded in browser order
  by `tests/lib/cover-load.js` (with `js/format-rules.js` for the spine).
- The oracle is the design itself: `tools/cover-golden.mjs` runs the
  `<script>` class of `design/screens/58-09-cover-new.html` headless
  (`tests/lib/design-cover.js`) and freezes its answers in
  `tests/fixtures/cover-golden.json`. It never reads `js/cover`.
  `cover-golden.test.js` checks the file still equals a fresh run.
- Port proof: with the design's own text-height estimate, every layer number
  and check message equals the design (48 sizes, 288 layouts, 24 Blank, 144
  remaps, 106 shape paths, 72 palette swaps, 22 check scenarios, curves,
  distortion, align, distribute, arrange, adds, My layouts, undo).
- Built: with `kdpCover.textlayout` (a stub measure of 0.55 em a character,
  not real font metrics) the 288 layouts have no check problem and each Blank
  has exactly the 3 missing Must fix items. Spine text by cap height (owner
  Q-9) on every trim, paper and page count to 828.

## Print engine (E13.1 and E13.2, real CDN, Node + playwright-core)

```sh
FORMAT_OUT=<a scratch folder> node tests/browser/format/t-engine-real.mjs   # Chrome: sizes, times, SRI on both CDNs, 5 fonts, 07 glyph table, 4 styles x 4 trims, 17 checks
FORMAT_OUT=<a scratch folder> node tests/browser/format/t-fallback.mjs      # Chrome: the main-thread fallback, forced with the test-only flag
FORMAT_OUT=<a scratch folder> node tests/browser/format/t-safari.mjs        # real Safari: a 212-page book falls back by itself
FORMAT_OUT=<a scratch folder> node tests/browser/format/t-cdn.mjs           # Chrome: jsdelivr down (then unpkg first), a wrong file, both CDNs down
node tools/check-format-cdn.mjs               # every pinned file on jsdelivr, unpkg and in the npm tarball
deno run --allow-read --allow-write --allow-net tools/qc-glyphs.mjs --check   # the 07 glyph table equals the real font files, every code point
node tools/make-style-samples.mjs             # once: app/format/style-*.png
```

- They load the real engine (typst.ts 0.7.0, Typst 0.14.2) and fonts from the
  CDNs on `tests/browser/format/engine.html` (no app UI, no Supabase), served
  by `tests/browser/serve.py` on port 5500 (started if nothing answers).
  Books are placeholder text from a fixed seed (`placeholder.js`), never a
  real book. Results (numbers only) go to `FORMAT_OUT` when it is set, else to
  `tests/browser/format/out/` (ignored).
- `t-engine-real.mjs`: a cold first visit (bytes on the wire and decoded per
  file and family, the worker's requests too), compile times, three next
  visits (engine ready, style switch), the main thread during a worker build
  (164 pages, longest timer gap under 50 ms), every file's hash on jsdelivr and
  unpkg, the characters of a test text each face lacks, per style the 07 glyph
  table (`js/qc-glyphs.js`) against the real fonts' cmaps (E13.2), and each
  style on each group A trim (plus two option sets): PDF checks, fonts
  embedded as FontFile2 and only the style's families, no Typst warning, the
  17 layout checks (`layout-checks.js`, from the E13.0 bench), words per page
  within 10% across styles; then the converter cases printed and read back.
- `t-fallback.mjs` checks the owner's rules for the fallback (Nov 4):
  the worker ended after a crash and a new one started only when a build
  needs it (no idle worker); the fallback chosen by the error (an overflow in
  the PDF step), never the browser; the book remembered for the session
  (after a reload too, and a remembered book starts no worker); preview delay
  1,500 ms and "Updating preview" painted before the compile. The test-only
  flag is `kdpFormatEngine.create({ test: { overflowPdfFor: [bookId] } })`.
- `t-safari.mjs` needs Safari > Settings > Developer > "Allow remote
  automation" (it starts `safaridriver -p 4567`). No test flag: Safari's
  worker overflows on its own from about 160 pages (the test uses 212, clearly
  over). The PDF must equal Chrome's worker PDF byte for byte.
- `t-cdn.mjs`: after jsdelivr fails both tries of a file, later downloads in
  that worker go to unpkg first (E13.2), so a style switch makes no jsdelivr try.

## Database (local Postgres 18)

```sh
supabase/tests/sql/run.sh                 # every suite, each on a fresh database
supabase/tests/sql/run.sh t0010.sql       # one suite
supabase/tests/sql/reset.sh stop          # stop the test cluster
```

A throwaway cluster on `127.0.0.1:55432` (data in `$TMPDIR/kdplab-pg`).
It never uses port 5432. `stub.sql` adds the parts of Supabase the
migrations need (roles, `auth.uid()`, default grants). Suites:
`t0010` positioning, `t0011` title, `t0012` safety, `t0013` guard function,
`t0014` custom word target and insights fingerprint, `t0015` book types and Other label,
`t0016` outline rules (limits, caps, the "has writing" guard, replace_outline, add_chapter, reorder_chapters),
`t0017` outline approve (approve_outline, the approval guard, every edit that clears it and the writing that does not, unlock, outline_checks shape, owner and RLS),
`t0019` empty version fix (no blank first version; blank versions and drafts are not writing, so Remove and Regenerate work; unlock counts text only),
`t0018` write versions (word count, versions only through save_version / restore_version or the server, the 100,000 limit, drafts, the current version guard, "has writing" with drafts, unlock, outline_json),
`t0020` Generate section (section_runs: claim, refusals, heartbeat, Stop, the guard, finish for each end, conflict, 100,000 cut, rule A stale recovery, the usage row, a partial counts as writing only while current, the marker is not a word, the "Kept partial text" label, RLS),
`t0022` section checks (server only, the owner, book and version guard, the findings shape with objective gaps, the areas shape, the fingerprint, the upsert, the cascades, advice only),
`t0021` Improve suggestions (server only, the owner and version guards, the checks, the replaced version guard, apply_suggestion: once, 1 hour, the base rules, save_version then apply_suggestion, the draft, a fresh run, the text check, 100,000, Needs review, Reviewed and Final kept, a book delete),
`t0023` G3 fixes (the book-level "has writing" outline_ideas reads: a discarded partial is not writing, a draft and a fresh run are; write_cut and the 100,000 cut in finish and recover, never inside a word or a marker, the same cases as cutText; an AI section finding with the optional unsourced list; the grants),
`t0024` kept findings (Keep as is: own select, insert and delete, no update; type, message, quote and check_at shape; a gap only from the current check; older gaps removed; at most 50 per section; the unique keys; the cascades; advice only),
`t0025` export and settings (display_name, book_exports with its guard and the newest 20 per book and format, export_json, export_badges and its "changed" rule, usage_month),
`t0026` book complete and words this month (completed_at, complete_book and each refusal, the books guard, the reopen on its own for each event, D1: a new version on a Final section keeps the book completed, words_month rule 1 with the UTC month edge),
`t0027` format and Print PDF (E13.1: book_formats shape, defaults, the guard with Also by, the touch, Final-only pdf_version_ids, what changes format_key and what does not, PDF export rows and their guard, pdf_marks, format_json, grants),
`t0029` cover (E15: the shapes and their grants, the four cover tables, the guards, the rights clock, blurb versions, what moves each key, the export guard with every refusal and the size for every group A trim × paper × 24, 54, 80, 400 pages, cover_marks, cover_json, the "covers" bucket and its storage policies),
`t0029_f8_nofn` (E15 F8: the signed-in cover path on 0029's own grants; run.sh builds it without the default function grants, see below),
`t_export_include` (E11: the fixture cases from `tests/fixtures/export-include.json`, recorded with the dialog's own list, read as not changed by export_badges; E13.1: the "final" cases give the same list from pdf_version_ids; run from the repo root),
`rls_cross_user` (user B against user A's rows in every table; E15: the cover tables, functions and A's file in the "covers" bucket).

E15: `stub.sql` also copies the parts of Supabase Storage 0029 uses
(`storage.buckets`, `storage.objects` with RLS on, `storage.foldername`,
`filename`, `extension`, as they are live; not the live
`protect_objects_delete` trigger). A file named `*_nofn.sql` runs on a
database without the default `EXECUTE` on new functions
(`KDP_PG_NO_FN_DEFAULTS=1` in `reset.sh`), so it sees only the grants a
migration writes itself.

## Browser (mocked, playwright-cli)

```sh
tests/browser/run.sh title t1.js
```

Needs the static server on port 5500: `run.sh` starts `tests/browser/serve.py`
when nothing listens there (`python3 -m http.server` queues only 5
connections, so pages lose scripts: "kdpAutosave is not defined"). Every Supabase call is answered by
the suite's `mock.js` with a fake session, so no account or real data is
used. Suites: `brief` (t-chapters, t-length, t-missing, t-accept-all, t-partial,
t-book-type, t-help-more, t-references), `research` (t-stale, t-missing, t-from, t-import), `positioning` (t1, t2, t-drift,
t-accept-all, t-missing, t-save-owner), `title` (t1, t-note, t-hyphen, t-missing),
`delete` (t-dialog), `outline` (t1, t-struct, t-generate, t-check, t-approve, t-blank, t-running),
`write` (t1, t-draft, t-versions, t-idle, t-fixes, t-empty, t-generate, t-gen-ends, t-improve, t-checks,
t-timing, t-selection, t-fix, t-queue, and t-batch2 for E12 fix batch 2: Mark as reviewed and the
status clearing Needs review, "Source not named" and "Also in another section"; t-ready for design 22e:
"Ready to mark Final", Mark Final, the owner's rule for a check that still holds (its own Fix, small
edits with the meter, a big edit, Generate, another Improve, Restore, a plan change, a failed read),
"things left" with Show, no check yet, plain-text sentences; t-chapter for design 23b: Generate chapter,
the head button and its line, the confirm with the cost line, the limit warning, running, Stop and
"Generate the rest", done, a failure with "Try again from", the month limit, leaving while it runs;
t-review-all and t-complete for E12 fix batch 3, design 22f: Mark all as reviewed for a chapter and
the book (the confirm with the count, Cancel, one update, Saving…, an error with Retry, the server's
count, the chapter marks line, off while the AI writes), and Mark book as completed (what is left,
Saving…, errors with Retry or Reload, the strip on every step, Reopen from the strip and from the
manuscript, a status change that reopens the book)), for E11 `settings` (t-settings, t-footer), `export`
(t-export, t-cut for E12 M9: the "ends mid-sentence" note never blocks, and t-repeats for E12 fix
batch 2: the repeated-sentence note, the Needs review hint, no `[S3]` in the .docx or .md) and `books` (t-badge; t-words for E12 fix batch 3, design 01b:
the card word bar for each target kind, "Needs review" from a section, the "Words this month" stat,
"Reopen book" in the card menu, the title room; t-brand for the rename to NicheInk, design 40: the
sidebar wordmark, its label, colors and focus ring, "PUZZLE TOOLS", the titles, 200% text, Sign in
signed out and the landing page in light and dark at 1440 and 390, the root redirect, and for 40b the
2 px gap before "Ink" and the mark keeping its size at 200% text; for 40c the 22 px and 21 px sizes, and
at 200% text the sidebar logo wrapping, the wordmark under the mark with no sideways scroll; it loads the
real Google Fonts for its own screenshots, with an 8 s cap),
and for E12 `pen` (t-label: the "Point of view in your books" field and its help line),
and for E14.3 `qc` (07 Quality Control and the shared shell, designs 51, 51b, 52, 53, 55, 57): t-first (52), t-run
(55 A to 53, the row sent, the first group open, Open in 06), t-states (55 B, C, E, qc_stale, the save
and load errors, a removed section), t-ok (55 F, Undo, 23505, the limit, an issue back after a text
change), t-marks (the sidebar and the rail, 01 to 09, 08 a link and 09 Coming next since E13.2, the mark 2 s after a save),
t-a11y (keyboard, focus rings, 44 px, 900 px with no sideways scroll), and for E14.6 t-promise (designs 54,
55 D, group 6: the cost, the skipped list, the monthly room, Esc and the focus trap, progress and Stop, the
chips and counts, Check again, Mark as OK, Open in 06, every error, a lost connection with a fresh read).
`t-shots`, `t-shots-56` and `t-shots-e146` make the compare images of plan section 8.5 in
`docs/reviews/e14-*-stop*/` with the real fonts; they are not checks, and they overwrite tracked images. The
qc mock answers as 0028 does (the qc_stale guard, the unique key, the results shape) and as generate v26
does for promise_check. `write t-ms-head` holds the 06 manuscript head at 900 px, and at 1440 px pixel for
pixel with and without its fix. `qc t-to08` (E13.2): "How to add one" opens 08 with the Copyright row
focused, "Go to 08 Format" (55 E) opens 08.
For E13.2 `format` (08 Format, designs 41, 43, 51b; the qc-style mock answers as 0027 does: book_formats made on
the first open, its update checks, format_json): t-screen (the settings column, every control saved, ISBN, header
title, Title page and Copyright always on, Introduction and Conclusion only when the book has them, the bio note,
Kindle state, load and save errors, keyboard, 32 px rows, 900 px), t-dialogs (Also by with the status from Books,
the print order, Cancel and Escape; the trim warning with and without a Print PDF, Keep, a failed write, Change
trim into the Brief; an old 7 × 10 trim), t-shell (header, the reason line, Next off with the "Coming next" tip,
the rail, 09 Coming next, 07 Next to 08, Export files, the E11 row link), and for Part 3 (the real print engine,
served from `tests/browser/.cache/format/` after `cache-files.mjs` checks each sha384) t-preview (the spread,
page buttons and arrow keys, the chips, the margin note = `marginNote(pages)`, a rebuild, paper with no rebuild,
the Ready box and its 07 line, the engine ending on leave, warnings, Kindle, 900 px) and t-states (41c: first visit
with the bar moving, engine error and Try again, jsdelivr down, a failed rebuild, nothing Final, a trim outside
group A, a trim change), and for Part 4 t-export (design 42: the panel, export, the PDF read back from the
download, the row sent to 0027, the 08 mark, changed since the PDF, "Page count changed", export_stale, a failed
record with Try again, a failed check, Cancel, Word to the E11 dialog, Escape, 900 px, a trim outside group A).
For D2 (owner, Nov 9, plan F13): `format t-full` (the spread fills the box, sharp, after a resize; the full
screen view: modal, focus kept and given back, Previous / Next, arrow keys, Esc and Close, a rebuild while open,
900 px) and `format t-trim` (the trim label under the drawing, inside its box, for every trim at 1440 and 900 px);
`t-shots-d2` makes `docs/reviews/e13-2-d2/` (not a check). For D3: `format t-tall` (the gray area takes the whole height under the preview bar at 1440 × 900, 1440 × 1100 and 900 px; the Ready box below the screen, reached by scrolling; the head unchanged); `format t-tocheck` (owner, Nov 10: the warning chip in the preview bar, shown with warnings or a failed rebuild, hidden when green, click and Enter scroll to the Ready box and focus it, 44 px, 900 px); `t-shots-d3` makes `docs/reviews/e13-2-d3/` (not a check). `books t-badge` also checks the Books card Print PDF mark (design 50: "Print PDF", "Print PDF changed", a failed
pdf_marks read). `format t-shots` (STOP 2), `t-shots3` (STOP 3) and `t-shots4` (STOP 4; run `books t-badge` first)
make the compare images in `docs/reviews/e13-2-stop<n>/`; they are not checks, they overwrite tracked images: never
run them in a sweep.
The E11 suites and `pen` share `tests/browser/shared/e11.js`
(a suite's `mock.js` that starts with `// shared: e11` gets it first); it serves the Books page,
Settings, the book page and the Export dialog, routes docx 9.5.1 to the cache and keeps every
downloaded Blob in `window.__blobs`. `t-export` covers 24b states 1 to 9 and the header entry,
opens the real download, and records the fixture cases through the dialog. `t-footer` checks the
name-only footer on four pages. `t-fix` (G5, design 22d) covers severity, the minor fold,
Keep as is and Undo, a kept gap (its check_at sent exactly as read, to the microsecond) and Fix
on Custom; `t-queue` the Fix major queue, every state from 6 to 10b. `t-selection` (G3 P9) makes Improve selections in the real editor across
bold, italic, list items, headings and a marker, the whole section (also with Ctrl+A), and right
after typing (the draft is saved first). Pipe it into the function's own rule:
`tests/browser/run.sh write t-selection.js | deno run tests/browser/write/selection-check.ts`
(one more PASS per case; exit 1 on a FAIL). `t-timing` (G2) types 50 characters into a 16,000-word section at normal and 4x slower
CPU, with the Versions and the Checks tab open. It prints the time per keystroke as INFO lines
(never a pass or fail) and checks only that the typing arrives and the panel stays right. The write
mock answers Generate section through the page's own `fetch` with a stream
the test drives (`window.__gen.send(event, data)`), because `route.fulfill`
sends a body all at once. Improve (E10.3) goes the same way so Cancel can
abort it: the test answers each request with `window.__imp.reply(status,
body)`, and the mock's `apply_suggestion` runs the checks of 0021. The AI
section check (E10.4) is answered the same way: `window.__chk.reply(status,
body)`; `__store.checks` holds the saved checks, `__store.research` the
Research rows, `__store.penVoice` the pen voice, and `__store.timeline` the
times of version and draft writes (to check that autosave waits). The runner caches supabase-js (checked
against the app's SRI hash), docx 9.5.1 (checked against the SRI in `js/export-dialog.js`) and two old file versions from git in
`tests/browser/.cache/`. Screenshots go to `tests/browser/shots/`. Both
folders are ignored by git.

A test must not end with unsaved typing: the page then asks "Leave site?" on
the next navigation, and playwright-cli stops at that prompt (the run prints
nothing). The same holds while Generate is writing: a Generate test ends its
run first. If that happens, close the session: `playwright-cli -s=kdp-<suite> close`.
