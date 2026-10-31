# E13.0 Typst proof: plan

## Context
v2 step B chose Typst in the browser (typst.ts WebAssembly from jsdelivr) for
08 Format Print PDF, 09 Cover PDF and the Kindle JPG. Before we build on it, this
throwaway proof shows with numbers that Typst can make a KDP-ready 6 x 9 interior
in the browser, safely, at an acceptable load size and speed.
The branch is never merged. No app files change. No Supabase calls.

## What I found (read-only checks today)
- typst.ts latest stable is **0.7.0** (June 1, 2026). 0.8.0 is still rc3. I pin 0.7.0.
  Licence Apache-2.0. I will report the Typst version it bundles.
- Engine files on jsdelivr (0.7.0):
  - `@myriaddreamin/typst.ts/dist/esm/contrib/all-in-one-lite.bundle.js` 211 KB
  - `@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm`
    **28.3 MB decoded, 9.1 MB brotli on the wire**, cached 1 year (immutable).
  - The renderer wasm is not needed for PDF. I check that it is never fetched.
- Fonts: the Adobe repo is too big for jsdelivr (50 MB limit). Static TTFs of
  Source Serif 4 are on npm in `@expo-google-fonts/source-serif-4@0.4.2`
  (MIT AND OFL-1.1): Regular 330 KB, Italic 208 KB, Bold 330 KB, Bold Italic 208 KB.
- The test book export is `docs/reviews/e11-live/somatic-healing-for-anxiety.md`
  (untracked; 594 lines). Its shape comes from `toMarkdown` in
  `js/export-build.js:47`: `# Title`, `*subtitle*`, `by Name`, copyright
  paragraph, `# Contents` list, `# Chapter`, `## section`, `### heading inside text`,
  `# About the author`. Text uses the subset in `js/markdown-lite.js`
  (`**bold**`, `*italic*`, `- ` and `1. ` lists, `\*` for a literal star,
  `\- ` and `1\. ` at a line start).
- No qpdf, pdfinfo or pypdf here. So I write a small PDF reader, and cross-check with pdf.js.
- Playwright: `playwright-core` ships inside the global `@playwright/cli`. I drive
  the installed Chrome with it from a Node script (full control: fresh profile,
  CDP network bytes, file writes). Firefox and WebKit are not installed.

## Files (all in `proof/typst/`)
| File | What it does |
|---|---|
| `.gitignore` | ignores `input/` and `out/` (no change to the root `.gitignore`) |
| `README.md` | what this is, how to run it, "throwaway, never merged" |
| `md2typst.js` | the converter. Same style as `js/*.js` (an IIFE on `globalThis`), so it runs in the browser and in Deno |
| `md2typst.test.js` | Deno test, 40+ cases plus a seeded fuzz run |
| `book.typ` | the Typst book template (page rules, header, footer, chapters, contents) |
| `pdf-check.js` | reads PDF bytes: page count, page boxes, fonts and whether embedded. Runs in Node and in the browser |
| `bench.html`, `bench.js` | the browser page: loads engine and fonts with SRI, converts, compiles, pads, reads back, reports JSON |
| `cases.html` | renders every converter case to PDF and checks the printed text with pdf.js |
| `make-sample.js` | writes `input/sample.md` (tricky text, about 60 pages) and `input/large.md` (about 400 pages) from placeholder text |
| `run.mjs` | Node + playwright-core + Chrome: runs every measurement, saves PDFs to `out/`, writes `out/results.json` |
| `RESULTS.md` | the numbers and pass/fail tables. No book text in it |
| `PLAN.md` | a copy of this plan |

Inputs: I copy the test book export to `input/test-book.md`. You can drop your
real export in `input/` later and run the same command. Outputs (PDFs, page
images) go to `out/`, also ignored. The repo is public, so I run `git status`
before each commit to confirm nothing from `input/` or `out/` is staged.

## Steps
0. `git switch -c claude/e13-0-typst-proof` from main. The three untracked
   `docs/reviews/e11-live/` files stay as they are.
1. **Converter** (`md2typst.js`).
   - Plain text is escaped with a backslash before each Typst markup character:
     `\ # $ * _ ` < > @ [ ] ~ = - + / ' "` (quotes only where Typst would read them as
     markup; smart quotes stay on for the book look). `--` and `...` print as typed.
   - Real Markdown becomes Typst calls: headings, `**bold**` to `#strong[...]`,
     `*italic*` to `#emph[...]`, `- `/`* `/`+ ` lists, `1. ` lists, `> ` quotes,
     `[text](https://...)` to `#link("...")[...]` (only http, https, mailto;
     anything else prints as plain text). A single newline inside a paragraph is a space.
   - Like the app, only `*` makes emphasis, so `snake_case` stays plain.
     Backticks print as plain text (the app has no code spans).
   - The app escapes (`\*`, `\- `, `1\. `) are read back as plain characters.
   - `parseBook(md)` splits the export into title, subtitle, author, copyright,
     chapters (the `# Contents` list is dropped; Typst builds its own with page numbers).
2. **Tests** (`md2typst.test.js`, `deno test proof/typst/md2typst.test.js`).
   At least 30 cases (planned about 44), each with the exact Typst output:
   - Special text: `save $20`, `$5 and $10`, `#1 habit`, `email me @home`,
     `5 * 3 = 15`, `snake_case`, `C:\notes\new`, `<tag>`, `<b>hi</b>`, `[1]`,
     `see [note]`, backticks, `a ~ b`, `50% off`, `a // b`, `/* x */`,
     `http://example.com`, `x^2`, `{braces}`, `a | b`, `--` and `---`, a line
     starting with `= `, `+ `, `/ `, `1. ` (app-escaped), `\*`, quotes and
     apostrophes, an unclosed `*`, Unicode (é, “ ”, …), an emoji.
   - Real Markdown: `#`, `##`, `###` headings, bold, italic, bold with italic
     inside, `- ` and `* ` lists, numbered list, quote, a safe link, a
     `javascript:` link (plain text), a mixed paragraph, paragraph breaks.
   - Fuzz: 300 seeded random strings of printable ASCII plus some Unicode.
     They must never produce unescaped markup.
   - Then `cases.html` compiles every case in Chrome and reads the printed text
     back with pdf.js. Pass = the text matches (quotes normalised), and bold or
     italic cases use the Bold or Italic font. Fuzz strings must compile and print as typed.
   I show both pass/fail tables.
3. **Template** (`book.typ`), 6 x 9 in:
   - Margins: inside 0.75 in, outside 0.5 in, top 0.75 in, bottom 0.75 in,
     mirrored (`inside`/`outside`, binding left). Above the KDP minimum for any
     count up to 700 pages (0.375 in inside for 24 to 150 pages, 0.25 in outside).
   - Body: Source Serif 4, 11 pt, justified, hyphenated (English), first-line
     indent 0.25 in except after a heading.
   - Front matter, no page numbers: title page (recto), copyright (verso),
     contents (recto, `outline()` with body page numbers), blank verso if needed.
   - Body starts at page 1 on a recto. Every chapter starts on a recto
     (`pagebreak(to: "odd")`).
   - Running header: left (even) pages show the book title at the left;
     right (odd) pages show the current chapter title at the right.
   - Page number centred in the footer. No header and no number on front matter,
     chapter first pages and blank pages. Blank pages are found with markers at
     each chapter end and start.
   - Even total: a final rule adds one blank page when the count is odd. If
     Typst cannot do it cleanly in one pass, `bench.js` compiles a second time
     with one blank page added. I test both an odd and an even book.
   - Engine page count: a `metadata` marker on the last page, read with the
     typst.ts query call.
4. **PDF reader** (`pdf-check.js`): finds objects (also inside compressed object
   streams; inflate by `node:zlib` or the browser `DecompressionStream`). Reports
   page count (counted Page objects and the root `/Count`), MediaBox, TrimBox,
   BleedBox, ArtBox per page, each font with its name and FontFile2/FontFile3.
5. **Bench page and runner**: `python3 tests/browser/serve.py` serves the repo on
   port 5500 (proof files only, local, no-store). The engine and fonts come
   from jsdelivr, pinned versions, SRI on the script tag, and the wasm and fonts
   fetched by my own code with `fetch(url, { integrity })` and handed to typst.ts.
   SRI hashes are sha384, computed with `openssl` from the CDN files.
6. **RESULTS.md**, then STOP for your review.
7. Commit in small steps on the branch (converter + tests; template; reader;
   bench + runner; results). Push only when you say so.

## How I measure (Chrome via playwright-core, `node proof/typst/run.mjs`)
- **Download size**: CDP network events per request: bytes on the wire and
  decoded size, for the script, the wasm, each font. I also list every request
  the page makes, to catch hidden fetches (default fonts, renderer wasm).
- **First load**: a new, empty profile. Times from navigation start to: script
  loaded, wasm downloaded, compiler ready, fonts ready, first PDF done.
  3 runs, median and range.
- **Cached load**: same profile, page reloaded, 5 runs, median. Shows the HTTP
  cache and Chrome's wasm code cache.
- **Slow network**: one cold run with CDP throttled to 10 Mbps down, 40 ms RTT.
- **Slow laptop**: compile with CDP CPU throttling 4x.
- **Compile time** for the full test book, `sample.md` and `large.md`: first
  compile and warm recompile (5 runs, median). Also the longest main-thread
  block (Long Tasks API), since the compile freezes the page.
- **Memory**: peak renderer process RSS (pid from CDP `SystemInfo.getProcessInfo`,
  sampled with `ps` every 200 ms) and JS heap from CDP. Labelled as approximate.
- **Page count**: engine count vs `pdf-check.js` count vs pdf.js `numPages`.
  All three must match. Final count and spine = pages x 0.002252 in, plus the
  KDP inside-margin tier for that count.
- **PDF check**: every page MediaBox exactly `[0 0 432 648]` (6 x 9 in at 72 pt);
  no TrimBox, BleedBox or ArtBox that differ; every font has an embedded file
  (Source Serif 4, subset); no fallback fonts. For crop marks: the boxes above,
  plus pdf.js renders every page and the four 0.2 in corner squares must be white.
- **Layout check** with pdf.js text per page: chapters start on odd pages, the
  header text per page matches the rule, no number on front matter, chapter
  first pages or blanks, body page 1 is a recto.
- Machine, Chrome version and date go at the top of RESULTS.md.

## Risks I will check and report
- Load size: 9.1 MB on the wire, 28 MB wasm in memory, before any font.
- SRI only covers what we fetch ourselves. I confirm the bundle fetches nothing else.
- One CDN: jsdelivr was slow in past test runs (see test notes). Self-hosting
  the wasm on GitHub Pages is a fallback (28 MB file in git).
- Main-thread compile freezes the UI. A Web Worker is the likely fix in E13.x.
- Memory on phones and iPads (Safari limits). Only Chrome is measured here.
- Glyph coverage: emoji or other scripts are not in Source Serif 4; Typst
  warnings are captured.
- Licences: typst.ts and Typst Apache-2.0; Source Serif 4 OFL-1.1 (embedding in
  PDFs allowed); pdf.js Apache-2.0 (proof only).
- KDP inside margin must grow with page count (tiers at 150, 300, 500, 700).

## Out of scope
Cover PDF and Kindle JPG (a later proof), any app UI, Supabase, the real book
(you run it yourself with `input/`).

## Owner adds at approval (Oct 31)
1. Hostile Typst cases in `md2typst.test.js` and `cases.html`, all printed as
   plain text: `#read("x")`, `#while true {}`, `#import "x"`,
   `#set page(width: 1pt)`, `#let x = 1`, `#{ "a" * 99999 }`.
2. Layout check: no heading as the last line of a page.
3. RESULTS.md lists the Typst version bundled in typst.ts 0.7.0 and every
   licence: typst.ts, Typst, Source Serif 4, pdf.js, playwright-core.
4. Copy the test book export into `input/` only. Before every commit,
   `git status` must show nothing from `input/`, `out/` or `docs/reviews/e11-live/`.

## Decided
- Body font: Source Serif 4.
- Chrome only. WebKit later in E13.1.
- Page number centred in the footer.
- Build, then STOP with RESULTS.md. Do not push until the owner says so.
