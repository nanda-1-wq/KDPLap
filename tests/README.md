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


## Edge Function `stock` (Deno, E16 Part 7)

```sh
deno check supabase/functions/stock/index.ts
deno test --allow-read=supabase/functions supabase/functions/stock/
```

- `lib.test.ts`: the input checks (2 KB, words, page, filters, ids, no links),
  the provider links (the Pixabay key in its query, Unsplash's in a header,
  `content_filter=high`), the hosts, names and credits, which Pixabay file a pick
  stores (10 MB and 12,000 px), the normalized results, the cached-answer check,
  the picture header reader, the error map, and the CORS list equal to generate's.
- `handler.test.ts`: the whole flow with fakes (`test_fakes.ts`; fake keys only):
  sign-in, `not_configured` per source, the per-user limits and the Unsplash
  budget, the cache (hit, miss, poisoned row, errors), provider errors, both picks
  (lookup by id, the 10 MB cap while streaming, magic bytes, redirects, storage
  and row, the Unsplash download ping), and no key in any log line or reply.
- No live calls: Pixabay, Unsplash and Supabase are never reached.
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

## 09 Cover data (E16 Part 3)

```sh
deno test --allow-read tests/cover-data.test.js tests/limits-parity.test.js
supabase/tests/sql/run.sh t0030.sql t0030_f8_nofn.sql t0029.sql rls_cross_user.sql
supabase/tests/sql/run.sh t0031.sql t0031_f8_nofn.sql   # E16 Part 7: stock
```
`cover-data.test.js` drives the 09 calls in `js/supabase.js` against a recording stand-in for
supabase-js: every table, column and function they name exists in 0030 (or 0029 for
cover_exports, 0031 for cover_assets.name); the stock calls go to the function "stock" with ids and words only; the rev autosave and its `conflict` marker, the first-open insert, the
row-then-file delete, the per-kind export fields and the My layout insert (0032: no upsert), and E16.2's retry_after_s (1 to 120 only). The 09 checks in
`limits-parity.test.js` read 0030 and t0030: the caps, trims, papers, pages, layout keys,
spine per page, hex rule, the image px (14 sizes pinned in t0030) and the byte measure
(`kdpCover.model.pgBytes` equals Postgres's `octet_length(layers::text)` for the t0030 fixture).

## 09 Cover engine (E16 Part 2)

```sh
deno test --allow-read tests/cover-flatten.test.js tests/cover-typst.test.js tests/cover-fonts.test.js tests/cover-zip.test.js tests/cover-image-prep.test.js
node tools/cover-fonts.mjs                       # re-make js/cover/font-catalog.js + the notices list (network; files cached in tests/browser/.cache/cover-fonts)
node tools/cover-fonts-sprite.mjs                # re-make img/cover-fonts.png from the catalog (headless Chrome)
node tools/check-cover-fonts.mjs --check         # every pinned font: size + sha384; design fonts also on unpkg (--all-cdns: every file on both)
COVER_OUT=<scratch> node tests/browser/cover/t-engine-real.mjs [--quick]   # Chrome: 13 layouts x 6 trims x 2 papers, images, QA sheets, 288 with real metrics, every catalog face
COVER_OUT=<scratch> node tests/browser/cover/t-safari-real.mjs              # real Safari: canvas limit, print + Kindle, round trip, design faces, 288
COVER_OUT=<scratch> node tests/browser/cover/t-icons-real.mjs               # Chrome (Part 5): every icon ours vs the browser's SVG, 96 px and stretched; the icons sheet as a Print PDF
node tools/cover-icons.mjs [--check]             # js/cover/icon-set.js from the pinned Tabler tarball (sha512); --check: the file equals a fresh build
node tests/browser/cover/qa-files.mjs <folder outside git> [--no-safari]   # the KDP Print Previewer files + README.md
```

- Pure (Deno, `tests/lib/cover-engine-load.js`): the flatten plan (what stays
  vector, the 300 DPI patch boxes, growth that keeps text whole), the Typst
  writer (template c2 in `js/cover/cover.typ`: one color space, places from
  `textlayout`, the faces Typst selects by), the font catalog and the weight
  snap (no fake bold), zip + CRC-32, the E15 picture helpers.
- Real engine: `tests/browser/cover/engine.html` + `harness.js` (synthetic
  pictures, `tests/fixtures/cover-qa.js` covers). Chrome serves the CDN files
  from `tests/browser/.cache` (checked against their sha384 in the page);
  Safari loads the real CDNs. Each Print PDF runs the export's own checks
  (coverChecks, glyphs, widths within 0.5%, chosen faces only, no font warning).
- QA files and results go to a scratch or private folder, never into git.

## 09 Cover editor, mocked (E16 Parts 4 to 10, E16.1)

```sh
tests/browser/run.sh cover t-shell.js    # 09 in the shell: header, Next, rail, first open, the inert parts, status bar, 1024
tests/browser/run.sh cover t-locked.js   # design 73 Locked, Loading, a failed read and failed fonts with Retry
tests/browser/run.sh cover t-canvas.js   # template layer, guides, zoom and pan, select, move + snap, width, rotate, shape handles, pixels
tests/browser/run.sh cover t-text.js     # Text panel presets, From your book, typing in place, the text bar, Arrange, duplicate, lock, delete, nudge
tests/browser/run.sh cover t-fonts.js    # the font list: 300, the design 20 first, groups, search, sprite rows, load on pick, real weights, fonts down
tests/browser/run.sh cover t-color.js    # the picker: presets, Recent, hex, the square drag, hue, eyedropper, background color
tests/browser/run.sh cover t-undo.js     # 50 steps, the 500 ms window, keys, background, add and delete
tests/browser/run.sh cover t-save.js     # rev, one save per burst, the visit snapshot, Save failed + Retry, another tab (R11), leaving
tests/browser/run.sh cover t-a11y.js     # Step D: 44 px click areas, focus ring, 12 px text, no blue; Tab front first, Enter, handle keys
tests/browser/run.sh cover t-shots4.js   # STOP 4 compare shots → docs/reviews/e16-stop4/ (never in a sweep)
# Part 5
tests/browser/run.sh cover t-effects.js  # design 61: 9 styles and their controls, effect color, curve, distortion basic and free (the green corners), Cancel, OK, undo
tests/browser/run.sh cover t-shapes.js   # design 64: 27 tiles, the shape bar, Change shape + settings, Fill solid / gradient / none, Border, More, size, saved
tests/browser/run.sh cover t-icons.js    # the Tabler icons: loaded on first open, failed load + Retry, grid, search, no brands, add, recolor, reload without the set
tests/browser/run.sh cover t-multi.js    # design 65: Shift / Cmd-click, box select, Cmd+A, align ×6 to 5 targets, space, duplicate, lock, delete, drag all, keys
tests/browser/run.sh cover t-layers.js   # design 66: rows front first, select, eye, lock, ⋮ menu, rename, drag and keyboard reorder, Background row
tests/browser/run.sh cover t-shots5.js   # STOP 5 compare shots (61, 64, 65, 66) and the icons grid → docs/reviews/e16-stop5/ (never in a sweep)
# Part 6
tests/browser/run.sh cover t-uploads.js  # rights first, JPG/PNG by bytes, 10 MB, 12,000 px, stored as sent, EXIF turn, failures, paste, Uploads, Replace, read back, missing (C15), Retry
tests/browser/run.sh cover t-pdf.js      # a PDF page via pdf.js 6.4.299 (from .cache/format): checks, the page chooser, 300 DPI JPEG, big pages, password, pdf.js down
tests/browser/run.sh cover t-crop.js     # design 62 crop: 8 handles, edge drags (20 px min), move the picture, keys, Zoom, Reset, Done, Escape, the ghost, DPI badge
tests/browser/run.sh cover t-adjust.js   # the picture bar: flip, More, Adjust (one undo step a drag), Border, Mask, Opacity, Fill front/back/whole, Arrange, duplicate, lock, delete
tests/browser/run.sh cover t-images-a11y.js  # Step D on every Part 6 surface, keyboard reach, icon + word on the red and amber parts
tests/browser/run.sh cover t-shots6.js   # STOP 6 compare shot (62) and the Part 6 surfaces → docs/reviews/e16-stop6/ (never in a sweep)
# Part 7
tests/browser/run.sh cover t-stock.js    # design 63: the Pixabay and Unsplash tabs (Unsplash waits for Search, N10), the wide picker, filters, preview, picks (copy and link), Replace, credits, stock down, errors, More results, keys, Step D
tests/browser/run.sh cover t-shots7.js   # STOP 7 compare shot (63) and the Part 7 surfaces → docs/reviews/e16-stop7/ (never in a sweep)
# Part 8
tests/browser/run.sh cover t-layouts.js  # design 67: 13 ready layouts with small covers, apply at once, the 6 s note with Undo (one step), Blank, Stack (D15), another size
tests/browser/run.sh cover t-my.js       # My layouts (Q-3, D2): the list, thumbnail, name, From, date; apply with this book's words and size; the ×; failures
tests/browser/run.sh cover t-palettes.js # series colors: 6 palettes, the color map (swapPalette), one Undo step, keyboard and Step D
tests/browser/run.sh cover t-bookdata.js # design 68: Book data, Add all, On the cover, no subtitle, the Back blurb card, spine text (off under 86 pages on white), Author line
tests/browser/run.sh cover t-blurb.js    # the back blurb dialog: Length, Tone, author line, generate v28 cover_blurb { stage, bookId, length, tone, authorLine }, the fit note, Verify, failures
tests/browser/run.sh cover t-shots8.js   # STOP 8 compare shots (67, 68) and the Part 8 surfaces → docs/reviews/e16-stop8/ (never in a sweep)
# Part 9
tests/browser/run.sh cover t-checks.js   # design 70: the Checks chip and drawer, Must fix / Check / Tip with icon and word, Show me, C1 Add it, C14, Ready, it follows changes
tests/browser/run.sh cover t-preview.js  # design 69: Preview final, As printed / With bleed, black and white, the files' painting (no template), Kindle and search size
tests/browser/run.sh cover t-size.js     # design 72: the book size changed in 08: the remap in one update, the history snapshot, the amber note, Show what moved, Next off
tests/browser/run.sh cover t-offline.js  # design 73b: offline bar and footer, changes kept on this device, AI and Pixabay blocked with no call, saved when back online
tests/browser/run.sh cover t-narrow.js   # designs 74, 74b: 1200 px and up, 900 to 1199 px (panel over the cover), under 900 px the notice
tests/browser/run.sh cover t-shots9.js   # STOP 9 compare shots (69, 70, 72, 73b, 74, 74b) → docs/reviews/e16-stop9/ (never in a sweep)
COVER_OUT=<scratch> node tests/browser/cover/safari-p9.mjs   # real Safari: the Checks drawer, Preview final, 1024 px and 800 px
# Part 10 (run.sh also checks the print engine's file cache for this suite: the export builds with the real Typst engine)
tests/browser/run.sh cover t-export.js   # designs 71, 71b, 73d: ready, blocked (Must fix, offline), steps + Stop (Stop, ×, Escape, leaving 09), done, downloads + zip, Done/Next from data, every failure, My layouts
tests/browser/run.sh cover t-records.js  # Uploads housekeeping: the orphan-file sweep (safety rules, pages, server clock) and the remove × with its "used on N covers" question
tests/browser/run.sh cover t-export-real.js  # the sample book exported for real, KDP checks, files to tests/browser/cover/out/stop10/ (never in a sweep)
tests/browser/run.sh cover t-shots10.js  # STOP 10 compare shots (71, 71b, 73d) and the Part 10 states → docs/reviews/e16-stop10/ (never in a sweep)
supabase/tests/sql/run.sh t0030_one_insert.sql   # the export's one insert against the real 0030 guard: all rows or none
# Nov 17 and E16.1 (owner, Nov 18; designs 75 to 77b, PNG only)
tests/browser/run.sh cover t-strip.js    # no "marked completed" strip on 09 or 08 of a completed book; the editor sits where an in-progress book's does
tests/browser/run.sh cover t-tpl.js      # design 75: the template above the layers, lines and the see-through barcode box only, the notes in the popover (75b), clicks go through
tests/browser/run.sh cover t-snap.js     # design 77: 13 targets across and 7 down, exact, the lit guide, the magnet (holds 16 px), a nearer target takes over, photo resize corners
tests/browser/run.sh cover t-replace-name.js  # Replace takes the new picture's name on every path (upload, tile, PDF, Pixabay, Unsplash), a typed name goes, one Undo step
tests/browser/run.sh cover t-stock-browse.js  # designs 76, 76b: Pixabay searches the topic (else title) on open, once a visit; the end loads more, 3 s apart; errors stop it; Unsplash unchanged
tests/browser/run.sh cover t-shots11.js  # E16.1 after shots → docs/reviews/e16-1/, design/screens/75 and 75b (never in a sweep)
tests/browser/run.sh write t-complete.js # (also) no strip on 01 to 09; Reopen from the 06 foot
# E16.2 Part 3 (plan docs/reviews/2026-11-20-e16-2-plan.md; mock modes pickBusy + pickAfter, the My layouts insert keeps 5 per book)
tests/browser/run.sh cover t-stock-retry.js  # Q-1: "Pixabay is busy. Trying again in N s." in design 63's error slot (grid, preview, panel), said once, one automatic retry; cancel on pick, close, leaving 09; stock v1 and bad values; Unsplash no wait
tests/browser/run.sh cover t-my.js       # (also) Q-2: date and local time, the × label with the time, 5 per book, the 6th drops the oldest of that book only, no Storage call
tests/browser/run.sh cover t-shots-e162.js  # STOP 3 compare shots (63 busy line, 67 with 5 entries, the export line) → docs/reviews/e16-2/ (never in a sweep)
COVER_OUT=<scratch> node tests/browser/cover/safari-p10.mjs   # real Safari, the export: real clicks, the real engine (real CDNs), KDP checks, zip read back, Stop
COVER_OUT=<scratch> node tests/browser/cover/safari-editor.mjs   # real Safari, the editor (text, effects, shapes, images, PDF, crop, undo, save); every Supabase call answered in the page (safari-stub.js), none reaches the host
```

- `tests/browser/cover/mock.js` answers as 0030: `cover_json`, the design insert (rev 1, 23505 on a
  second one), the autosave update "where rev = $rev" (0 rows when the rev moved, rev + 1, the layer
  caps), the history insert. Modes: coverFail, coverSlow, saveFail, saveSlow, otherTab, histFail, fontsDown.
  Part 6: cover_assets (0030's CHECKs) and the bucket (multipart upload, the path rule, JPEG/PNG, download);
  modes uploadFail, rowFail, listFail, downloadFail, uploadSlow, pdfDown. `fixture-pictures.js` (PIC) makes
  pictures and PDFs in the page and hands them to the real file field or a paste event.
  Part 7: the function "stock" (search and pick, as the server answers), the providers' picture links and
  cover_assets.name; modes stockFail/stockCode, pickFail/pickCode, stockNet, stockSlow, pickSlow, stockMany
  (1: 30 results; a number: that many), picDown, E16.2 pickBusy/pickAfter (stock_busy with retry_after_s sent as it is; no pickAfter = stock v1). E16.1: the book's Brief topic and Topic Lab topic come from
  `store.book.topicText` and `store.book.topicName`. `fixture-stock.js` (STK) holds the design's sample results and draws their pictures in the page.
  Part 10: cover_key, cover_exports (one insert, 0030's guard codes), cover_marks, the My layouts insert (E16.2, 0032: keeps the book's newest 4 + the new one, store.myTrimmed; an on_conflict upsert gets 42P10),
  cover_assets delete, the "used on" reads (layers cs), the bucket's folder list; modes keyFail, recFail, recCode,
  myUpFail, useFail, delFail, listFilesFail, recSlow, engineDown, keyHook(n). The Typst files come from
  `tests/browser/.cache/format`.
- `fixture-design-book.js` (run.sh puts a suite's `fixture-*.js` before its mock) is the design's book;
  `FIX.band(page)` builds the Band cover with the warm blurb from `js/cover/layouts.js` itself.
- Fonts come from `tests/browser/.cache/cover-fonts` (the Part 2 cache). The run-code sandbox has no
  TextEncoder. `CV.quiet(page)` before leaving a page keeps a "Leave site?" dialog from blocking the session.

## Print engine (E13.1 and E13.2, real CDN, Node + playwright-core)

```sh
FORMAT_OUT=<a scratch folder> node tests/browser/format/t-engine-real.mjs   # Chrome: sizes, times, SRI on both CDNs, 5 fonts, 07 glyph table, 4 styles x 6 trims, 17 checks, group A golden bytes
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
  17 layout checks (`layout-checks.js`, from the E13.0 bench; the margins from
  `kdpFormatRules.layout(trim)`), words per page within 10% across styles.
  E13.2b: 6 trims; the 16 group A builds (4 styles x 4 trims) must give the
  exact bytes in `golden-group-a.json` (made before E13.2b: the large trims
  never move an old book); on 8 x 10 and 8.5 x 11 a line is within 8% of the
  same style at 6 x 9 and at most 80 characters, and `kdpWords.LARGE_FACTOR`
  is within 5% of the measured words per page. Then the converter cases
  printed and read back. If the Typst version or a font file changes on
  purpose, the golden bytes change too: re-make the file from a run before
  the change and say so in the STOP report.
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
`t0029` cover (E15; after 0030 only what 0029 still owns: the kept shapes and their grants, cover_blurbs with the 20 kept versions, cover_pdf, the cover_exports privileges),
`t0029_f8_nofn` (E15 F8: the blurb and cover_pdf path on 0029's own grants; run.sh builds it without the default function grants, see below),
`t0030` cover layers (E16 Part 3: the 6 trims, cover_fmt_ok, the layer caps with the exact 524,288-byte boundary and the pgBytes fixture, the grants, what 0030 dropped and kept, cover_designs with rev and the stale autosave, cover_design_history with 20 kept, cover_assets (upload, pdf, pixabay, unsplash; rights clock, path, hotlink, credit), cover_my_layouts (one per book, the export's upsert, the 100 cap, set null), what moves cover_key, the export guard with every refusal, the print size for 6 trims × 2 papers × 24, 54, 400 pages, the image px pinned from kdpCover.geo.px300, picture rights, cover_marks, cover_json, the bucket's JPEG + PNG and the assets path rule, a book delete),
`t0030_f8_nofn` (E16 F8: the signed-in editor path on 0030's own grants),
`t0031` stock (E16 Part 7: cover_assets.name with its plain names by source and the 200 cap, stock_cache with the server clock, the 24-hour purge and the 500 cap, stock_calls with no update or delete and the 2-hour purge of the caller's rows only, stock_usage on the database clock, the grants and trigger functions),
`t0031_f8_nofn` (the stock path on 0031's own grants),
`t_export_include` (E11: the fixture cases from `tests/fixtures/export-include.json`, recorded with the dialog's own list, read as not changed by export_badges; E13.1: the "final" cases give the same list from pdf_version_ids; run from the repo root),
`rls_cross_user` (user B against user A's rows in every table; E15 and E16: the cover tables (34 tables after 0031), functions, the rev autosave, the move and give cases, and A's file in the "covers" bucket).

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
For E13.2b (trims 8 × 10 and 8.5 × 11, plan `docs/reviews/2026-11-17-e13-2b-plan.md`): `format t-large` (08 at both
large trims: 6 trims in the select, the margin note with the trim's margins after the real build, the cream note
on and off with no rebuild, the Ready box, the spread at 1440, 900 and full screen, 6 × 9 on cream with no note),
`brief t-trims` (the 6 chips, click and Tab and Space, the save, the page estimates at both trims, the row at 1440
and 900 and at 200% text); `format t-trim`, `t-dialogs`, `t-states`, `t-export`, `brief t-length` and `settings
t-settings` check the 6 trims and the texts built from `kdpFormatRules.trimsText`. The book wizard has no phone
layout, so 390 px is a picture only. `format`, `brief`, `settings` and `qc` `t-shots-e132b` make
`docs/reviews/e13-2b-stop3/` (not checks; never in a sweep; the 08 one builds a 618-page book, about 2 minutes).
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
