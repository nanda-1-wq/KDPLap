# E13.0 Typst proof: results

Date: Oct 31, 2026. Branch `claude/e13-0-typst-proof` (never merged).
Machine: Apple M4, 16 GB, macOS (Darwin 27.0.0). Chrome 156.0.8078.73, headless,
driven by playwright-core 1.64.0-alpha. Node 25.1.0. Deno for the converter test.

Books used (all in `input/`, not committed):

| Book | What | Words | Chapters |
|---|---|---|---|
| test book | the test account's Markdown export (E11 live check) | 8,881 | 7 |
| sample | generated placeholder text full of special characters | 11,154 | 11 |
| large | generated placeholder text | 119,327 | 33 |

**Verdict: every check passes.** The engine works in Chrome, the PDF is
KDP-shaped, and the counts match. The real costs are the first download
(9.5 MB) and a page freeze during the compile. See the risks at the end.

## Real books (owner's exports, Nov 2, 2026)

Same machine and setup, `run.mjs --only=books,checks --books=my-book`. Each
export was removed from the repo after its run, and its PDF was deleted. Numbers only.
"publish book" is the book the owner will publish. "real book 2" is another of the owner's books.

| Book | Words | Chapters | Pages before padding | Pages after padding | Spine (white paper) | KDP inside-margin tier | 17 layout checks | First compile | After a one-word edit |
|---|---|---|---|---|---|---|---|---|---|
| publish book | 11,617 | 8 | 47 | 48 (1 blank added) | 0.1081 in | 24 to 150 pages (0.375 in; ours is 0.75 in) | 17 of 17 pass | 189 ms (page frozen 190 ms) | 18 ms |
| real book 2 (other title) | 8,096 | 9 | 34 | 34 (no blank added) | 0.0766 in | 24 to 150 pages (0.375 in; ours is 0.75 in) | 17 of 17 pass | 149 ms (page frozen 151 ms) | 15 ms |

Also checked on both: the page count is the same from the engine, the PDF
reader (Chrome and Node) and pdf.js (48 and 34); every page `[0 0 432 648]`, no
other boxes; 4 embedded Source Serif 4 fonts; no Typst warnings. Peak renderer
memory: 725 MB for the publish book (+298 MB over the idle page), 749 MB for real
book 2 (+321 MB).

## Versions and CDN URLs (SRI sha384)

- typst.ts **0.7.0** (latest stable, June 1, 2026; 0.8.0 is still rc3).
- It bundles **Typst 0.14.2** (read from `sys.version` and from the PDF Creator field).

| File | URL (all `https://cdn.jsdelivr.net/npm/…`) | SRI |
|---|---|---|
| engine JS | `@myriaddreamin/typst.ts@0.7.0/dist/esm/main.bundle.js` | `sha384-ti3p6Aop/bL76GOJxe8C3WL2Imx9nlAeSVcGjghEO++WVj/4Yzg38goFRlWWIick` |
| engine wasm | `@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm` | `sha384-YB32Rpk4pOvEGytOZweRBgdbuwNueLVpzJUQojjit/A8AveMWxDW8eT9ROz98jDo` |
| Regular | `@expo-google-fonts/source-serif-4@0.4.2/400Regular/SourceSerif4_400Regular.ttf` | `sha384-Jlt+K7yeFCc67xw3+C+XDZSmk/5NVYJzzuqiHf9FEn7EYjxW4k7CtsAY3nLz/znC` |
| Italic | `…/400Regular_Italic/SourceSerif4_400Regular_Italic.ttf` | `sha384-Y6peJRFDO0JNUXW9tDh0KdoPI0bCyQcAdDGWASLNjeyESYn0fIOf9Z6W0yv4t1t1` |
| Bold | `…/700Bold/SourceSerif4_700Bold.ttf` | `sha384-9p3FI88EsdgXkS/uWM6PZC6fR6VDQSoJbqlUcmsc7YcFUXIA7Tinsc9j1aNvj+6p` |
| Bold Italic | `…/700Bold_Italic/SourceSerif4_700Bold_Italic.ttf` | `sha384-GAZZ4PPQdHyCqej4dJn6MHk8u7cfiatViSSRmye4zudmAZvlsYgcb0v7YE9gxpvj` |
| pdf.js (checks only) | `pdfjs-dist@6.4.299/build/pdf.min.mjs` | `sha384-QCvhu/UPp22U/TNLVbQNONL82ES2yY717GAiqP9VVu37Y7+m9VPKvadGx9XlFvcp` |
| pdf.js worker (checks only) | `pdfjs-dist@6.4.299/build/pdf.worker.min.mjs` | `sha384-NfW/OTMWezITv4oaALvfH7MFLwzPxEvpySmDpoALa1mtTY8MC200l0ZNFD+SOlrM` |

How SRI is applied (`engine.js`): our code fetches every file with
`fetch(url, { integrity })`. The two ES modules are imported from a blob URL
of the checked text. The wasm and the fonts go to typst.ts as data, and
`loadFonts(…, { assets: false })` stops its default font download. The network
log of every run shows no other request to any CDN.

The fonts come from the npm package above because the Adobe repo is too big
for jsdelivr (50 MB limit). The CDN files are byte-identical to the npm tarballs.

## 1. Book shape (6 x 9 in)

Settings in `book.typ`: inside margin 0.75 in, outside 0.5 in, top and bottom
0.75 in, mirrored. Source Serif 4, 11 pt, justified, hyphenated.
KDP minimum is 0.375 in inside for 24 to 150 pages and 0.25 in outside.
0.75 in inside covers every count up to 700 pages.

17 layout checks, read back from the PDF with pdf.js, page by page:

| Check | test book | sample | large |
|---|---|---|---|
| Page size 6 x 9 in (pdf.js) | pass | pass | pass |
| Text block starts at the mirrored margin (most common left edge per side) | pass | pass | pass |
| Text inside the mirrored margins (only punctuation hangs, at most 4 pt) | pass | pass | pass |
| All text inside the KDP minimum margins | pass | pass | pass |
| Chapters start on a right-hand (odd) page | pass | pass | pass |
| Body page 1 is a right-hand (odd) page | pass | pass | pass |
| No header on front matter, chapter first pages, blanks | pass | pass | pass |
| No page number on front matter, chapter first pages, blanks | pass | pass | pass |
| Blank pages are empty | pass | pass | pass |
| Page number = body page (body starts at 1) | pass | pass | pass |
| Page number centred | pass | pass | pass |
| Header: book title on left-hand pages | pass | pass | pass |
| Header left-aligned on left-hand pages | pass | pass | pass |
| Header: chapter title on right-hand pages | pass | pass | pass |
| Header right-aligned on right-hand pages | pass | pass | pass |
| No heading as the last line of a page (owner add 2) | pass | pass | pass |
| Corners white, no crop marks (every page rendered) | pass | pass | pass |

Page counts behind the checks:

| | test book | sample | large |
|---|---|---|---|
| Pages | 36 | 52 | 406 |
| Front matter pages (title, copyright, contents) | 3 | 3 | 4 (contents runs 2 pages) |
| Body page 1 is physical page | 5 | 5 | 5 |
| Chapter first pages | 7 | 11 | 33 |
| Blank pages | 4 | 7 | 19 |
| Pages with header and number | 22 | 31 | 350 |
| Headings checked (level 2 and 3) | 63 | 32 | 420 |
| Left edge on odd pages at 54 pt (0.75 in) | 9 of 9 | 13 of 13 | 168 of 168 |
| Left edge on even pages at 36 pt (0.5 in) | 13 of 13 | 17 of 18 (1) | 182 of 182 |

(1) Sample page 6 holds only a short list, so every line is indented. Listed as a note.

Mirroring in numbers: odd pages run from 54 pt to 396 pt, even pages from 36 pt to 378 pt.
Typst hangs end-of-line punctuation up to 2.66 pt into the margin (its default
`overhang`). That is good typography and stays far inside KDP's minimum.

Contents page: chapters with body page numbers and dot leaders. Title page and
copyright page as planned. OFL font embedded (see 6).

## 2. Even page count and spine

| | test book | sample | large |
|---|---|---|---|
| Last page with content | 36 | 51 (odd) | 405 (odd) |
| Final count | **36** (no blank added) | **52** (1 blank added) | **406** (1 blank added) |
| Spine (pages x 0.002252 in, white paper) | **0.0811 in** | **0.1171 in** | **0.9143 in** |
| KDP inside-margin tier | 24 to 150 (0.375 in) | 24 to 150 (0.375 in) | 301 to 500 (0.625 in) |

The padding rule is in `book.typ`. A first version tested `here().page()` and
added a page even when the count was already even: once it adds the break, its
own position moves to the new odd page and confirms itself. It now tests the
page of a marker placed before it. Checked on 1, 2 and 3 page documents
(2, 2, 4 pages) and on the books above.

## 3. Markdown to Typst conversion

Rule: every Typst markup character in the writer's text gets a backslash
(`\ # $ * _ ` < > @ [ ] ~ = - + /`, plus `.` after a digit or before a dot).
Our own calls (`#strong`, `#emph`, `#link`, `#quote`, `#linebreak`) end with `;`,
so text right after them (`.` or `(`) can never continue the call. Without the
`;`, `**bold**.next` failed to compile. Curly quotes stay on, except right after
a digit: Typst prints a prime there (`5'` as `5′`, `1990's` as `1990′s`), so those
quotes are escaped and print as typed.

| Run | Result |
|---|---|
| Deno, `deno test proof/typst/md2typst.test.js` | **68 passed, 0 failed** (62 cases, fuzz, the checker, string literals, the export split, main.typ) |
| Chrome, every case compiled and read back from the PDF | **62 of 62 pass** (text, and bold, italic, plain font, link checks) |
| Chrome, 300 seeded fuzz strings (printable ASCII and accents) | **300 of 300 print exactly as typed** |
| Hostile cases (owner add 1): `#read("x")`, `#while true {}`, `#import "x"`, `#set page(width: 1pt)`, `#let x = 1`, `#{ "a" * 99999 }` | **6 of 6 print as plain text** |
| Typst warnings or errors | none |

The 62 cases cover: `save $20`, `$5 and $10`, `#1 habit`, `email me @home`,
`5 * 3 = 15`, `snake_case_name`, `C:\notes\new`, `<tag>`, `<b>hi</b>`, `[1]`,
backticks, a code fence, `~`, `%`, `//`, `/* */`, a bare URL, `^ { } |`, `--`,
`...`, a line that starts with `=`, `+`, `/`, `1.`, `-` or `##` (the app's
escapes), `\*`, quotes, `5'4" and the 1990's`, an unclosed star, Unicode,
`$ x $`, `\u{1F600}`, `]; #panic("x")`, text right after bold, an emoji, then real
Markdown: three heading levels, bold, italic, both nestings, `***both***`,
`-` and `*` lists, a numbered list, a quote, a web link, a mail link, a
`javascript:` link (stays text), a mixed line, two paragraphs, a line break.

The first Chrome run found 11 fuzz misses, all the digit-quote prime. Fixed as above.

## 4. Load size and time (Chrome)

Downloads, first visit:

| What | On the wire | Decoded |
|---|---|---|
| engine JS (`main.bundle.js`) | 24.3 KB | 153.4 KB |
| engine wasm | **9.12 MB** | **28.3 MB** |
| 4 font files | 327.6 KB | 1.08 MB |
| **Total engine + fonts** | **9.47 MB** | **29.6 MB** |

All brotli from jsdelivr, cached for one year (`immutable`). pdf.js is used only
by the proof's checks and is not counted.

Times from navigation start, test book:

| Case | Engine ready | First PDF |
|---|---|---|
| First visit, empty profile, 6 runs | 2.4, 6.9, 8.0, 8.8, 9.8, 19.1 s (median 8.0 s) | 2.6, 7.1, 8.2, 9.0, 10.0, 19.3 s |
| Next visit (Chrome closed and opened, disk cache), 5 runs | median **148 ms** (135 to 173) | median **299 ms** (285 to 327) |
| First visit at 10 Mbps, 40 ms (throttled) | 14.6 s | 14.9 s |

On a first visit the wasm download is almost all of the time: it ends 50 ms
before the engine is ready. The spread (2.4 to 19.1 s) is jsdelivr on this
connection. On a next visit nothing is downloaded (0 bytes for the engine and fonts).

Compile time, engine already loaded (5 recompiles each, median):

| Book | Pages | First compile | of which layout / PDF | Same text again | After a one-word edit | Page frozen |
|---|---|---|---|---|---|---|
| test book | 36 | **147 ms** | 109 / 36 ms | 7 ms | 14 ms | 148 ms |
| sample | 52 | **156 ms** | 139 / 17 ms | 9 ms | 17 ms | 157 ms |
| large | 406 | **1,933 ms** | 1,789 / 143 ms | 83 ms | 164 ms | 1,934 ms |
| test book, CPU slowed 4x | 36 | **464 ms** | 410 / 53 ms | 28 ms | 54 ms | 467 ms |

Markdown to Typst conversion: 1.2 ms (test book), 6.5 ms (large).
"Page frozen" is the longest gap of a 10 ms timer during the first compile.
The Long Tasks API agrees (147, 156, 1,933, 467 ms). The compile runs on the
main thread and the page does not respond until it ends.

Memory (approximate, macOS RSS of Chrome's renderer process, sampled every 200 ms):

| | Peak renderer | Over the idle page |
|---|---|---|
| The same page without the engine | 428 MB | 0 |
| Engine + test book | 691 MB | +263 MB |
| Engine + sample | 758 MB | +330 MB |
| Engine + large (406 pages) | 885 MB | +457 MB |

The JS heap stays small (4 to 15 MB). The memory is in the wasm.

## 5. Page count read back

| | test book | sample | large |
|---|---|---|---|
| Engine (`<last-page>` marker, typst.ts query) | 36 | 52 | 406 |
| `pdf-check.js` in Chrome: page tree / root `/Count` / Page objects | 36 / 36 / 36 | 52 / 52 / 52 | 406 / 406 / 406 |
| `pdf-check.js` in Node, saved file | 36 / 36 / 36 | 52 / 52 / 52 | 406 / 406 / 406 |
| pdf.js `numPages` | 36 | 52 | 406 |
| **All match** | **yes** | **yes** | **yes** |

## 6. PDF check

| | test book | sample | large |
|---|---|---|---|
| File size | 247 KB | 270 KB | 2.34 MB |
| PDF version, Creator | 1.7, Typst 0.14.2 | 1.7, Typst 0.14.2 | 1.7, Typst 0.14.2 |
| MediaBox on every page | `[0 0 432 648]` | `[0 0 432 648]` | `[0 0 432 648]` |
| = 6.000 x 9.000 in | yes | yes | yes |
| CropBox, TrimBox, BleedBox, ArtBox | none | none | none |
| Fonts | 4, all embedded | 4, all embedded | 4, all embedded |
| Corners white (crop marks would show there) | 36 of 36 pages | 52 of 52 | 406 of 406 |

Fonts in every file: `SourceSerif4-Regular`, `-Italic`, `-Bold`, `-BoldItalic`,
each a subset with its own `FontFile2` (TrueType). No other font, no Type 3 font.
Bonus: Typst writes a tagged PDF (structure tree, `/Lang (en)`).

## Licences

| Part | Licence | Note |
|---|---|---|
| typst.ts (`@myriaddreamin/typst.ts`, `typst-ts-web-compiler`) | Apache-2.0 | The npm package has no LICENSE or NOTICE file |
| Typst 0.14.2 (inside the wasm) | Apache-2.0 | The wasm also holds many Rust crates; no third-party notice ships with it |
| Source Serif 4 | SIL OFL 1.1 | Package is "MIT AND OFL-1.1" (MIT for its code, OFL for the fonts, `LICENSE_FONT`). Embedding in PDFs is allowed |
| pdf.js 6.4.299 | Apache-2.0 | Proof checks only |
| playwright-core 1.64.0-alpha | Apache-2.0 | Proof runner only |

## Risks

1. **First download.** 9.47 MB, 2.4 to 19.1 s on this connection, 14.6 s at
   10 Mbps. Ideas for E13.x: start the download in the background when the
   book opens, show progress, keep a self-hosted copy on GitHub Pages as a
   fallback (the wasm is 28 MB, under the 100 MB file limit).
2. **One CDN.** jsdelivr failed one request ("Failed to fetch") during this
   work (not in the measured runs). The app needs a retry and a clear error.
3. **Page freeze.** The compile blocks the page: 148 ms for the test book,
   1.9 s for 406 pages, 467 ms on a 4x slower CPU. A Web Worker should fix it.
4. **Memory.** +263 MB for a short book, +457 MB for 406 pages. Risky on
   phones and iPads. Only Chrome on a Mac was measured.
5. **Browser support.** Only Chrome 156. The code needs WebAssembly, ES module
   import from a blob URL, regex lookbehind (Safari 16.4 and later) and
   `DecompressionStream` (the PDF reader only). WebKit is E13.1.
6. **SRI with ES modules.** A `<script integrity>` tag does not cover modules
   the bundle would import, so we fetch and import from a blob URL. A future
   Content Security Policy must allow `blob:` scripts.
7. **Missing glyphs are silent.** An emoji prints an empty box (`.notdef`) and
   Typst gives no warning. The app should check the text for characters the
   font lacks before export.
8. **Licence notices.** The wasm ships without a NOTICE or third-party list.
   Before launch we should add one (from the typst.ts and Typst sources).
9. **Version pinning.** `book.typ` is written for Typst 0.14.2. Pin typst.ts
   0.7.0 and test the template before any upgrade (0.8.0 is in rc).
10. **Gutter tiers.** 0.75 in inside covers up to 700 pages. 701 to 828 pages
    need 0.875 in.
11. **Typography choices.** `--`, `---` and `...` print as typed (no dash or
    ellipsis). Curly quotes are on. Decide before 08 Format.

## Found in passing

- **Editor gap (app, not fixed):** `**bold *x* y**` (italic inside bold) shows
  literal `**` in the editor (`js/markdown-lite.js` toHtml). The converter
  formats it. `*a **b** c*` and `***both***` work in both.
- **Line breaks:** a single newline inside a paragraph is a line break, as in
  the DOCX export (the plan said a space).
- **Test book text:** one paragraph in the test book ends mid-word (a stopped
  generation). The PDF prints it as stored. 07 Quality Control could flag it.
- **pdf.js quirk:** in the header, pdf.js reads `BUILT-UP` as `BUILT UP`. The
  PDF shows the hyphen. The header check compares letters only.

## Changes from the plan

- Cold loads: 6 runs, not 3, because the spread was wide.
- Two more files: `engine.js` (shared loader) and `cases-page.js`.
- Font source: the npm package above, not the Adobe repo (jsdelivr limit).
- The margin check allows hanging punctuation (at most 4 pt) and adds a
  strict check against KDP's minimum margins.
- The "starts at the margin" check uses the most common left edge per side,
  since a page of only list items is indented.
- The heading check tells a heading with no text after it at a chapter end
  (content) apart from a heading pushed to the bottom (layout). None occurred
  in the final books.
