# E13.1 Part 2 · step 1 · worker spike · results

Status: STOPPED (Nov 4, 2026). The worker fails in Safari for books over about 160 pages.
Owner decision needed before anything else in Part 2 is built (owner rule: "Do not build
the fallback without my OK").
Branch `claude/e13-1-format`. Plan: `docs/reviews/2026-11-03-e13-1-plan.md` (Part 2, Q1).

## Setup
- Apple M4, 16 GB, macOS (Darwin 27.0.0).
- Chrome 156.0.8078.80, headless (playwright-core 1.64.0-alpha), a fresh profile per run.
- Safari 27.0.1, real Safari driven by safaridriver (WebDriver).
- Engine: the E13.0 files unchanged (typst.ts 0.7.0, Typst 0.14.2, Source Serif 4,
  same SRI hashes), loaded in a module worker (`new Worker(…, { type: 'module' })`),
  the engine module imported from a blob URL of the checked text, as in E13.0.
- Spike code: `proof/spike/` (local only, `proof/` is ignored by git).
- Books: "test book" is the test account's export from E13.0 (`proof/typst/input/`,
  not committed). Every other book is generated placeholder text (E13.0
  `make-sample.js`, fixed seed). No real book. Numbers only here.
- Main-thread block = the longest gap between ticks of a 10 ms timer on the main
  thread (works in both browsers; Safari has no Long Tasks API).
- One template change in the spike: `set document(date: none)`. Without it the PDF
  holds `/CreationDate` and `/ModDate` to the second, so two builds of the same book
  differed in those bytes only. The real template will do the same, so the same
  inputs always give the same bytes.

## Pass rule (plan Q1)
The test book compiles in a worker in Chrome and Safari; page count and bytes equal the
main-thread build; longest main-thread task during the compile under 50 ms.

| Book | Browser | Pages worker / main | Bytes worker / main | Identical | Main-thread block during worker build (first / 2 rebuilds) | Main-thread block, same build on main thread | Pass |
|---|---|---|---|---|---|---|---|
| test book | Chrome | 36 / 36 | 246,428 / 246,428 | yes | 12 / 11 / 8 ms | 151 ms | **yes** |
| sample | Chrome | 52 / 52 | 269,964 / 269,964 | yes | 11 / 11 / 11 ms | 199 ms | **yes** |
| large | Chrome | 406 / 406 | 2,342,676 / 2,342,676 | yes | 11 / 11 / 11 ms | 1,916 ms | **yes** |
| test book | Safari | 36 / 36 | 246,428 / 246,428 | yes | 14 / 9 / 10 ms | 199 ms | **yes** |
| sample | Safari | 52 / 52 | 269,964 / 269,964 | yes | 13 / 11 / 11 ms | 238 ms | **yes** |
| large | Safari | fails / 406 | none / built | no | n/a | 1,889 ms | **no** |

Worker build times (first, then 2 rebuilds of the same text), Chrome: test book
279 / 9 / 8 ms, sample 192 / 11 / 10 ms, large 2,047 / 86 / 84 ms. Safari: test book
221 ms, sample 316 ms first build.
Engine load in the worker, main-thread block: 11 to 12 ms (Chrome), 11 to 46 ms
(Safari; 46 ms on the first cold load). Cold load 1.4 s (Chrome), 9.5 s (Safari, cold
jsdelivr); cached about 120 ms (Chrome), 58 ms (Safari).

The pass rule as written (the test book) passes in both browsers. The large book does not.

## The Safari failure
Error: `Maximum call stack size exceeded`, inside the wasm, always in the PDF step.
Layout (`compile`) and `query` finish in the worker for every book; only `pdf()` fails.
Safari gives worker threads a smaller stack than the main thread. Safari's main thread
builds every book below (788 pages too). Chrome's worker builds every book (788 pages too).

What it depends on: the number of pages, nothing else.

| Book (placeholder) | Shape | Pages | Safari worker | Safari main thread |
|---|---|---|---|---|
| c12 to c32 | 12 to 32 chapters x 3 sections | 74 to 152 | builds | builds |
| plain800 | 1 chapter, paragraphs only, no headings | 154 | builds | builds (553 ms) |
| plain850 | same, 50 more paragraphs | 164 | **fails** | builds (586 ms) |
| tiny80 | 80 near-empty chapters | 166 | **fails** | builds (628 ms) |
| tiny90 | 90 near-empty chapters | 186 | **fails** | builds (769 ms) |
| one | 1 chapter, 150 sections | 194 | **fails** | builds |
| c40 / c48 / c56 | chapters x 3 sections | 198 / 220 / 270 | **fails** | builds |
| plain | 1 chapter, no headings | 172 | **fails** | builds |
| large | 30 chapters x 10 sections | 406 | **fails** | builds (1,889 ms) |
| big | 60 chapters x 10 sections | 788 | **fails** | builds (5,059 ms) |

Tried, no change: PDF bookmarks off (`set heading(bookmarked: false)`), the whole body
as a PDF artifact (`pdf.artifact`, out of the tag tree). typst.ts 0.7.0 exposes no PDF
option (no page ranges, no "no tags"), and a worker's stack size cannot be set from JS.

Limit: Safari's worker makes the PDF up to about 155 pages; from about 160 pages it fails.
Our publish book is 48 pages; KDP allows up to 828.

## Options (owner decides)
A. **Worker first, main thread when Safari's worker overflows** (recommended).
   Chrome, Edge and Firefox: always the worker, no freeze. Safari: the worker for books
   up to about 155 pages (most v2a books). A book over that: the overflow is caught, the
   same build runs on the main thread (the "Making your PDF" state painted first), and
   08 remembers it for the session so later builds of that book go straight to the main
   thread (no wasted worker try). Safari freeze for those books: about 0.6 s at 160 pages,
   1.9 s at 400 pages, 5 s at 800 pages, once per preview rebuild (600 ms after the last
   change) and once per export.
B. **Main thread everywhere** (the plan's fallback). One code path. Freeze in every
   browser: about 0.15 to 0.25 s for 36 to 52 pages, 1.9 s at 400 pages, 5 s at 800.
C. **Worker everywhere, Safari over about 155 pages gets no PDF** and a message to use
   Chrome. Not recommended: a writer on Safari with a long book cannot export.

With A or B, the worker question for long Safari books can go back to E13.2 (typst.ts
0.8 may expose PDF options; it is still a release candidate).
