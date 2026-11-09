# E13.2 Part 5 · live check · numbers only

Branch `claude/e13-2-format` served from this Mac by `tests/browser/serve.py` on http://127.0.0.1:5500,
against the live Supabase project. No deploy, no migration (0027 has been live since Nov 3), no AI call.
No book text in this file.

## A. Test account (Nov 9, 2026, Chrome 156 headless through playwright-cli, user 1e117c74)
Fresh test book (owner Q9) made from placeholder text (fixed seed 132), only with the app's own data calls:
book `a5224e83`, Introduction + 5 chapters × 3 sections + Conclusion = 17 sections, all Final, 9,620 words;
two more books with the same pen name ("E13.2 Live Pen") for Also by: `f1870c31`, `973763de`.

| What | Result |
|---|---|
| Cold first visit (engine + Classic, empty browser cache): engine ready / first pages | **125.8 s / 126.8 s** (the CDN was slow: see the note) |
| Default (Classic, 6 × 9) | 42 pages · made even (41 + 1 blank); spine 0.095 in · no spine text under 80 pages |
| Margin note at 42 pages | "KDP minimum 0.375 in inside for 24 to 150 pages. We use 0.75 in inside and 0.5 in outside, mirrored." |
| Modern / Clean / Warm (6 × 9) | 42 / 42 / 42 pages; builds 154 / 169 / 132 ms in the worker |
| Classic 5.5 × 8.5 / 5.25 × 8 / 5 × 8 / back to 6 × 9 | 44 / 54 / 54 / 42 pages (spine 0.099 / 0.122 / 0.122 / 0.095 in); margin note 0.375 in every time; trim dialog wrote the Brief each time; 6 × 9 put back |
| Ready box | "1 thing to check: 18 claims have no source yet (Verify). The marks are not printed." (the placeholder text has numbers such as "save $20" and "50% off": the E12 number rule) |
| Also by | Dialog: both books with "In progress" from Books; ticked: "Choose books (2)", the book grows to 44 pages |
| ISBN "978-0-306-40615-7" | saved as 9780306406157 |
| Export (Export files → Print PDF) | 1,057 ms; file `e13-2-live-test-book-print-6x9.pdf`; row "Exported Nov 9 · 44 pages" |
| The downloaded PDF, read back | 219,911 bytes; 44 pages; 6 × 9 in; fonts EB Garamond Regular, Italic, Bold, Bold Italic, all FontFile2 (embedded); checks size, fonts, pages: all pass |
| The record (0027) | 2 rows `pdf`, `final`, 44 pages, engine "typst 0.14.2 · t1"; `pdf_marks` changed = false after each export |
| 08 mark after the export | rail: the check on 08 (rule D); note "Coming next" |
| A change (Chapter label → 2) | note "Not done yet: changed since your last PDF. Export it again."; Books card "Print PDF changed"; panel row "Changed since export. Last PDF Nov 9 · 44 pages." |
| Export again | "Exported Nov 9 · 44 pages"; Books card "Print PDF" |
| Next visits (3, same browser session) | engine ready 5.9 / 7.5 / 20.9 s: the 9.1 MB wasm was fetched again each time (see the note) |
| Safari 27.0.1 (safaridriver, cold) | first pages 35.4 s; 44 pages built in the worker (under Safari's ~155-page worker limit); export 1,029 ms; PDF 44 pages, checks size, fonts, pages: all pass |
| Sign-in data in the browser tool's logs | the password in 0 files; the email in 52 files, all from Sep 28 (none from this run) |

Notes:
- **Cold first visit 125.8 s.** Same as Nov 8's 142 s: jsdelivr was slow tonight. The bar showed the download moving.
  Owner decision Nov 9: keep jsdelivr first, no self-host now.
- **The wasm is not kept in an in-memory browser cache.** playwright-cli's session keeps its cache in memory; there
  the JS and fonts came from the cache (0 bytes) but the 9.1 MB wasm was downloaded on every visit. In a normal
  (disk) profile all 12 files come from the cache and the engine is ready in about 118 ms (t-engine-real, Nov 8).
  So in a private / incognito window a writer downloads the 9 MB on every visit to 08. Not changed now.

## B. The owner's real book (Nov 9, 2026; the owner signed in and exported; Claude Code did not, change A)
Numbers as read back by the owner. No book text.

| What | Result |
|---|---|
| Style, trim | Classic, 6 × 9 in |
| Pages | **54** (53 + 1 blank, made even) |
| Spine | **0.122 in** (54 × 0.002252 in, white paper) |
| KDP Print Previewer, interior | **Passed**: every page inside the guides |
| KDP Print Previewer, other | The only error is the old cover file on that KDP draft. KDP expects a cover of **12.372 × 9.25 in**, which matches our spine: 2 × 6 + 0.122 + 2 × 0.125 bleed = 12.372 in wide, 9 + 2 × 0.125 = 9.25 in high. The new cover comes from 09 Cover (E15) |
| Not read back | the margin note, the Ready box, the file name, the 08 check and the Books card mark |

The E13.0 proof's 48 pages were Modern; the owner chose Classic (12 pt, a larger body), so 54 is in line.
