# Design files check: `design/screens/`

Read-only check of `design/screens/` on `main` at `e9b07af`. No file was changed except this report.
Branch `claude/e13-1-format` was not touched (its tree was only read in the search for numbers 41 to 57).

## Summary

- **109 files:** 49 HTML and 60 PNG. Numbers used: 01 to 40 (with letter variants 01b, 22b to 22f, 23b, 24b, 25b).
- **10 commits** added them, all by Adnan, from 2026-09-27 to 2026-10-29. 18 files (6 screens) were changed later.
- **No script makes the files.** The PNGs were shot by hand with playwright-cli. Only one doc, the E11 plan, writes down the method.
- **All 49 HTML files open on their own.** None needs `./support.js`, a canvas runtime, or a bundler. Two kinds:
  - 39 older files (01 to 39 base screens) use inline styles with hardcoded hex colors and no link to the tokens file.
  - 10 newer files (01b, 22b to 22f, 23b, 24b, 25b, 40) link `../design-tokens.css`. They render correctly only when opened from inside `design/screens/`.
  - All 49 load Google Fonts online. Without network they fall back to system fonts.
- **41 to 57 are free.** No file uses those numbers on `main` or on any of the 15 other remote branches, and no doc reserves them.

## 1. Every file

Sizes are bytes in the `main` tree. PNG sizes were read from the PNG header (IHDR).
"Added in" is the oldest commit from `git log --follow`. "Later changes" are newer commits that changed the file, oldest first.

| # | File | No. | Type | Bytes | PNG W x H | Added in | Later changes |
|---|---|---|---|---|---|---|---|
| 1 | `01-books.html` | 01 | html | 21,025 | — | `b5bdc00` | — |
| 2 | `01-books.png` | 01 | png | 118,027 | 1440 x 900 | `b5bdc00` | — |
| 3 | `01b-books-words-states-1440.png` | 01b | png | 397,083 | 1440 x 2116 | `8cebf67` | `25423ae` |
| 4 | `01b-books-words-states-900.png` | 01b | png | 440,999 | 900 x 3946 | `8cebf67` | `25423ae` |
| 5 | `01b-books-words-states.html` | 01b | html | 25,713 | — | `8cebf67` | `25423ae` |
| 6 | `02-books-empty.html` | 02 | html | 8,549 | — | `b5bdc00` | — |
| 7 | `02-books-empty.png` | 02 | png | 55,238 | 1440 x 900 | `b5bdc00` | — |
| 8 | `03-new-book.html` | 03 | html | 12,350 | — | `b5bdc00` | — |
| 9 | `03-new-book.png` | 03 | png | 81,128 | 1440 x 900 | `b5bdc00` | — |
| 10 | `04-new-book-no-topic.html` | 04 | html | 13,420 | — | `b5bdc00` | — |
| 11 | `04-new-book-no-topic.png` | 04 | png | 100,339 | 1440 x 900 | `b5bdc00` | — |
| 12 | `05-inside-a-book-shell.html` | 05 | html | 9,236 | — | `b5bdc00` | — |
| 13 | `05-inside-a-book-shell.png` | 05 | png | 51,613 | 1440 x 900 | `b5bdc00` | — |
| 14 | `06-delete-book-dialog.html` | 06 | html | 2,775 | — | `b5bdc00` | — |
| 15 | `06-delete-book-dialog.png` | 06 | png | 24,969 | 560 x 360 | `b5bdc00` | — |
| 16 | `07-batch1-states.html` | 07 | html | 16,321 | — | `b5bdc00` | — |
| 17 | `07-batch1-states.png` | 07 | png | 103,298 | 1440 x 1000 | `b5bdc00` | — |
| 18 | `08-topic-lab.html` | 08 | html | 24,196 | — | `b5bdc00` | — |
| 19 | `08-topic-lab.png` | 08 | png | 131,282 | 1440 x 900 | `b5bdc00` | — |
| 20 | `09-topic-detail.html` | 09 | html | 19,619 | — | `b5bdc00` | — |
| 21 | `09-topic-detail.png` | 09 | png | 162,720 | 1440 x 1040 | `b5bdc00` | — |
| 22 | `10-add-topic-dialog.html` | 10 | html | 3,313 | — | `b5bdc00` | — |
| 23 | `10-add-topic-dialog.png` | 10 | png | 30,801 | 560 x 420 | `b5bdc00` | — |
| 24 | `11-pen-names.html` | 11 | html | 12,130 | — | `b5bdc00` | — |
| 25 | `11-pen-names.png` | 11 | png | 75,242 | 1440 x 900 | `b5bdc00` | — |
| 26 | `12-pen-name-detail.html` | 12 | html | 20,769 | — | `b5bdc00` | `1f74964` |
| 27 | `12-pen-name-detail.png` | 12 | png | 184,403 | 1440 x 1260 | `b5bdc00` | `1f74964` |
| 28 | `13-batch2-states.html` | 13 | html | 12,292 | — | `b5bdc00` | — |
| 29 | `13-batch2-states.png` | 13 | png | 73,025 | 1440 x 900 | `b5bdc00` | — |
| 30 | `14-step01-brief.html` | 14 | html | 18,325 | — | `b5bdc00` | — |
| 31 | `14-step01-brief.png` | 14 | png | 144,737 | 1440 x 1420 | `b5bdc00` | — |
| 32 | `15-step02-research.html` | 15 | html | 21,882 | — | `b5bdc00` | — |
| 33 | `15-step02-research.png` | 15 | png | 178,693 | 1440 x 1000 | `b5bdc00` | — |
| 34 | `16-batch3-states.html` | 16 | html | 9,879 | — | `b5bdc00` | — |
| 35 | `16-batch3-states.png` | 16 | png | 99,880 | 1440 x 1060 | `b5bdc00` | — |
| 36 | `17-step03-positioning.html` | 17 | html | 24,090 | — | `b5bdc00` | — |
| 37 | `17-step03-positioning.png` | 17 | png | 210,163 | 1440 x 1320 | `b5bdc00` | — |
| 38 | `18-step03-positioning-locked.html` | 18 | html | 10,814 | — | `b5bdc00` | — |
| 39 | `18-step03-positioning-locked.png` | 18 | png | 80,487 | 1440 x 760 | `b5bdc00` | — |
| 40 | `19-step04-title.html` | 19 | html | 20,132 | — | `b5bdc00` | — |
| 41 | `19-step04-title.png` | 19 | png | 192,417 | 1440 x 1080 | `b5bdc00` | — |
| 42 | `20-step05-outline.html` | 20 | html | 32,466 | — | `b5bdc00` | — |
| 43 | `20-step05-outline.png` | 20 | png | 236,299 | 1440 x 1340 | `b5bdc00` | — |
| 44 | `21-batch4-states.html` | 21 | html | 9,705 | — | `b5bdc00` | — |
| 45 | `21-batch4-states.png` | 21 | png | 93,515 | 1440 x 760 | `b5bdc00` | — |
| 46 | `22-step06-write.html` | 22 | html | 30,197 | — | `b5bdc00` | — |
| 47 | `22-step06-write.png` | 22 | png | 203,780 | 1440 x 960 | `b5bdc00` | — |
| 48 | `22b-improve-states-1440.png` | 22b | png | 513,369 | 1440 x 2914 | `7d5b2cf` | `395e306` |
| 49 | `22b-improve-states-900.png` | 22b | png | 512,851 | 900 x 4302 | `7d5b2cf` | `395e306` |
| 50 | `22b-improve-states.html` | 22b | html | 32,105 | — | `7d5b2cf` | `395e306` |
| 51 | `22c-checks-states-1440.png` | 22c | png | 596,888 | 1440 x 3386 | `3ea5983` | — |
| 52 | `22c-checks-states-900.png` | 22c | png | 597,156 | 900 x 5549 | `3ea5983` | — |
| 53 | `22c-checks-states.html` | 22c | html | 32,734 | — | `3ea5983` | — |
| 54 | `22d-fix-states-1440.png` | 22d | png | 1,083,174 | 1440 x 5064 | `f31ebe6` | — |
| 55 | `22d-fix-states-900.png` | 22d | png | 1,068,220 | 900 x 7987 | `f31ebe6` | — |
| 56 | `22d-fix-states.html` | 22d | html | 57,652 | — | `f31ebe6` | — |
| 57 | `22e-checks-ready-states-1440.png` | 22e | png | 646,178 | 1440 x 3093 | `af1e3d1` | — |
| 58 | `22e-checks-ready-states-900.png` | 22e | png | 639,121 | 900 x 4673 | `af1e3d1` | — |
| 59 | `22e-checks-ready-states.html` | 22e | html | 36,159 | — | `af1e3d1` | — |
| 60 | `22f-review-complete-states-1440.png` | 22f | png | 971,276 | 1440 x 4913 | `8cebf67` | `25423ae` |
| 61 | `22f-review-complete-states-900.png` | 22f | png | 944,674 | 900 x 7621 | `8cebf67` | `25423ae` |
| 62 | `22f-review-complete-states.html` | 22f | html | 46,067 | — | `8cebf67` | `25423ae` |
| 63 | `23-step06-write-states.html` | 23 | html | 10,830 | — | `b5bdc00` | — |
| 64 | `23-step06-write-states.png` | 23 | png | 153,545 | 1440 x 1060 | `b5bdc00` | — |
| 65 | `23b-generate-chapter-states-1440.png` | 23b | png | 571,458 | 1440 x 3107 | `af1e3d1` | — |
| 66 | `23b-generate-chapter-states-900.png` | 23b | png | 591,127 | 900 x 4127 | `af1e3d1` | — |
| 67 | `23b-generate-chapter-states.html` | 23b | html | 30,010 | — | `af1e3d1` | — |
| 68 | `24-export-dialog.html` | 24 | html | 7,690 | — | `b5bdc00` | — |
| 69 | `24-export-dialog.png` | 24 | png | 77,929 | 640 x 860 | `b5bdc00` | — |
| 70 | `24b-export-states-1440.png` | 24b | png | 825,489 | 1440 x 5161 | `03319f8` | `02a09db`, `b2c88a2` |
| 71 | `24b-export-states-900.png` | 24b | png | 811,350 | 900 x 8091 | `03319f8` | `02a09db`, `b2c88a2` |
| 72 | `24b-export-states.html` | 24b | html | 51,921 | — | `03319f8` | `02a09db`, `b2c88a2` |
| 73 | `25-settings.html` | 25 | html | 17,487 | — | `b5bdc00` | — |
| 74 | `25-settings.png` | 25 | png | 107,841 | 1440 x 960 | `b5bdc00` | — |
| 75 | `25b-settings-states-1440.png` | 25b | png | 524,042 | 1440 x 2966 | `03319f8` | — |
| 76 | `25b-settings-states-900.png` | 25b | png | 533,141 | 900 x 4555 | `03319f8` | — |
| 77 | `25b-settings-states.html` | 25b | html | 38,770 | — | `03319f8` | — |
| 78 | `26-coming-soon-desktop-light.html` | 26 | html | 10,572 | — | `4309513` | — |
| 79 | `26-coming-soon-desktop-light.png` | 26 | png | 119,697 | 1440 x 900 | `4309513` | — |
| 80 | `27-coming-soon-desktop-dark.html` | 27 | html | 10,571 | — | `4309513` | — |
| 81 | `27-coming-soon-desktop-dark.png` | 27 | png | 119,342 | 1440 x 900 | `4309513` | — |
| 82 | `28-coming-soon-mobile-light.html` | 28 | html | 10,160 | — | `4309513` | — |
| 83 | `28-coming-soon-mobile-light.png` | 28 | png | 99,956 | 390 x 1180 | `4309513` | — |
| 84 | `29-coming-soon-mobile-dark.html` | 29 | html | 10,159 | — | `4309513` | — |
| 85 | `29-coming-soon-mobile-dark.png` | 29 | png | 99,858 | 390 x 1180 | `4309513` | — |
| 86 | `30-sign-in-light.html` | 30 | html | 8,897 | — | `b589cd2` | — |
| 87 | `30-sign-in-light.png` | 30 | png | 89,930 | 1440 x 900 | `b589cd2` | — |
| 88 | `31-sign-in-dark.html` | 31 | html | 8,896 | — | `b589cd2` | — |
| 89 | `31-sign-in-dark.png` | 31 | png | 91,254 | 1440 x 900 | `b589cd2` | — |
| 90 | `32-sign-in-error.html` | 32 | html | 9,394 | — | `b589cd2` | — |
| 91 | `32-sign-in-error.png` | 32 | png | 97,270 | 1440 x 900 | `b589cd2` | — |
| 92 | `33-sign-up.html` | 33 | html | 9,425 | — | `b589cd2` | — |
| 93 | `33-sign-up.png` | 33 | png | 98,448 | 1440 x 900 | `b589cd2` | — |
| 94 | `34-check-email.html` | 34 | html | 7,301 | — | `b589cd2` | — |
| 95 | `34-check-email.png` | 34 | png | 88,415 | 1440 x 900 | `b589cd2` | — |
| 96 | `35-reset-request.html` | 35 | html | 7,116 | — | `b589cd2` | — |
| 97 | `35-reset-request.png` | 35 | png | 84,431 | 1440 x 900 | `b589cd2` | — |
| 98 | `36-reset-link-sent-dark.html` | 36 | html | 6,859 | — | `b589cd2` | — |
| 99 | `36-reset-link-sent-dark.png` | 36 | png | 87,708 | 1440 x 900 | `b589cd2` | — |
| 100 | `37-set-new-password.html` | 37 | html | 8,810 | — | `b589cd2` | — |
| 101 | `37-set-new-password.png` | 37 | png | 89,066 | 1440 x 900 | `b589cd2` | — |
| 102 | `38-sign-in-mobile-light.html` | 38 | html | 4,685 | — | `b589cd2` | — |
| 103 | `38-sign-in-mobile-light.png` | 38 | png | 32,089 | 390 x 844 | `b589cd2` | — |
| 104 | `39-sign-in-mobile-dark.html` | 39 | html | 4,684 | — | `b589cd2` | — |
| 105 | `39-sign-in-mobile-dark.png` | 39 | png | 33,392 | 390 x 844 | `b589cd2` | — |
| 106 | `40-nicheink-wordmark-1440.png` | 40 | png | 1,244,420 | 1440 x 8356 | `7d36c01` | `d6d7a72`, `eeb99d3` |
| 107 | `40-nicheink-wordmark-390.png` | 40 | png | 87,524 | 390 x 1244 | `7d36c01` | `d6d7a72`, `eeb99d3` |
| 108 | `40-nicheink-wordmark-900.png` | 40 | png | 1,260,336 | 900 x 12161 | `7d36c01` | `d6d7a72`, `eeb99d3` |
| 109 | `40-nicheink-wordmark.html` | 40 | html | 54,243 | — | `7d36c01` | `d6d7a72`, `eeb99d3` |

**Counts by number**

| Numbers | HTML | PNG | Note |
|---|---|---|---|
| 01 to 39 (base screens) | 39 | 39 | One PNG per HTML. Mostly 1440 x 900. Dialogs: 560 x 360, 560 x 420, 640 x 860. Mobile: 390 x 844 and 390 x 1180. |
| 01b, 22b, 22c, 22d, 22e, 22f, 23b, 24b, 25b (state sheets) | 9 | 18 | Two PNGs each: `-1440.png` (1440 wide) and `-900.png` (900 wide), full page height. |
| 40 (NicheInk wordmark) | 1 | 3 | `-1440`, `-900` and `-390` PNGs. |
| **Total** | **49** | **60** | **109 files** |

Biggest files: `40-nicheink-wordmark-900.png` (1,260,336 B), `40-nicheink-wordmark-1440.png` (1,244,420 B), `22d-fix-states-1440.png` (1,083,174 B). Tallest PNG: `40-nicheink-wordmark-900.png` at 900 x 12161.

## 2. Where the files came from

### Commits that added them

| Commit | Date | Message (first line) | Files added |
|---|---|---|---|
| `b5bdc00` | 2026-09-27 | E1: CLAUDE.md, v1 design package, new roadmap | 01 to 25 base screens (25 HTML + 25 PNG), plus `design/README.md`, `design-tokens.css`, `logo/` |
| `4309513` | 2026-09-27 | Temporary coming-soon landing page (light and dark), old landing archived | 26 to 29 (4 + 4) |
| `b589cd2` | 2026-09-27 | E3.0: rebuild auth pages from the approved design, turn sign-in back on | 30 to 39 (10 + 10) |
| `7d5b2cf` | 2026-10-12 | E10.3: plan decisions and Improve states design (22b) | 22b (1 + 2) |
| `3ea5983` | 2026-10-13 | E10.4: design 22c, the Checks tab states | 22c (1 + 2) |
| `f31ebe6` | 2026-10-16 | G5 design: 22d Fix states | 22d (1 + 2) |
| `03319f8` | 2026-10-25 | Design E11: 24b export states and 25b settings states | 24b, 25b (2 + 4) |
| `af1e3d1` | 2026-10-27 | design: 22e Ready to mark Final and 23b Generate chapter | 22e, 23b (2 + 4) |
| `8cebf67` | 2026-10-28 | design: E12 fix batch 3 Part 1, 01b Books words and Reopen, 22f ... | 01b, 22f (2 + 4) |
| `7d36c01` | 2026-10-29 | design: 40 NicheInk wordmark, option A | 40 (1 + 3) |

Later changes (no file was renamed; `--follow` found no older names):

| Commit | Date | Files changed |
|---|---|---|
| `395e306` | 2026-10-13 | 22b HTML and both PNGs (owner fixes) |
| `02a09db`, `b2c88a2` | 2026-10-25 | 24b HTML and both PNGs (copyright text, AI note) |
| `1f74964` | 2026-10-26 | `12-pen-name-detail.html` and `.png` (point of view label) |
| `25423ae` | 2026-10-28 | 01b and 22f HTML and PNGs (review fixes) |
| `d6d7a72`, `eeb99d3` | 2026-10-29 | 40 HTML and all three PNGs (option B gap, 22 px logo) |

### Scripts and docs (search for `design/screens` on `main`)

**No script makes these files.** No file in the repo writes to `design/screens/`. No shot list for them exists in `tests/browser/` (its shots go to `tests/browser/shots/`, ignored by git).

The only doc that explains how the PNGs were made:

- `docs/reviews/2026-10-25-e11-plan.md:153`: "Open both HTML files at 1440 and 900 with playwright-cli (port 5500 server), save the four PNGs, check no horizontal scroll at 900, no hex colors in the new files (...), every button ≥ 44 px."

Other docs give only the widths ("screenshots at 1440 and 900 px") or list the files: the E10.3, E10.4, G5, E12 fix batch 2 and 3, and NicheInk plans, plus `design/README.md`. The commit messages for 22e and 40 add "real fonts" and "PNGs at 1440, 900 and 390".

For 01 to 39 there is no doc. `design/README.md` only says "The `.png` files are quick previews." The 01 to 25 HTML files look like an export from a design tool: `<head>` holds only charset and title, and the font link and `<style>` sit inside `<body>`. Nothing in the repo names that tool.

Every reference to `design/screens` on `main`:

| File | What it says |
|---|---|
| `CLAUDE.md` | Reference screens are `design/screens/*.html` and `*.png`; match them. |
| `design/README.md` | File index (01 to 25, 22b, 40). Says 01 to 39 show the old name KDP LAB. Does not list 01b, 22c to 22f, 23b, 24b, 25b or 26 to 39. |
| `css/app.css:6` | "Reference: design/screens/01, 02, 07." |
| `css/auth.css:7` | "Reference: design/screens/30 to 39." |
| `js/shell.js:10` | "Reference: design/screens/01 and 07." |
| `robots.txt:10` | `Disallow: /design/screens/` |
| `tests/brand-name.test.js:132` | Checks that robots.txt blocks `/design/screens/`. |
| `docs/reviews/2026-10-07-e9-plan.md` and 8 later plans (E10, E10.3, E10.4, E11, E12 fix batch 1 to 3, NicheInk rename) | Name the screen each task builds from, or the screens the task adds. |
| `docs/reviews/logo-22/results.md`, `rename-logo-b/results.md`, `rename-stop3/results.md`, `produce-gate-g5.md` | Name screen 40 or 22d as the design reference. |

## 3. Does each HTML file open on its own?

Checked every `src=` and `href=` value, `url(...)` and `<img>` in all 49 files, and searched for `support.js`, `__bundler`, `canvas`, `deck-stage` and `<script`.

- **No file needs `./support.js`, a canvas runtime, a bundler or any local script.** No `<img>` and no `url(...)` outside `data:`. Icons are inline SVG.
- **One inline script:** `22b-improve-states.html:393` places the mock floating button under the selection. The page renders without it; only that button's position changes.
- **Fonts:** all 49 link Google Fonts (`fonts.googleapis.com`). This is the only network dependency.

| Group | Files | Needs | Opens on its own? |
|---|---|---|---|
| Inline styles | 39: `01` to `39` base screens (`01-books` ... `39-sign-in-mobile-dark`) | Google Fonts only. Colors are hex values inside the file. | **Yes.** Fully self-contained. |
| Linked tokens | 10: `01b`, `22b`, `22c`, `22d`, `22e`, `22f`, `23b`, `24b`, `25b`, `40` | Google Fonts and `../design-tokens.css` (4,681 B, present on `main`). | **Yes, from inside the repo.** Copied alone, they lose every color, size and spacing token. |

Other notes:

- `40-nicheink-wordmark.html` names `css/app.css`, `css/auth.css` and `landing/landing.css` only in a comment. It does not link them. It has a `#m390` view for the 390 px preview.
- `26` to `29` link out to LinkedIn and X (plain links, not needed to render).
- The 39 older files use hex colors, so they do not follow the current rule "No hardcoded colors". This is expected for exported mockups, but they will not follow token changes.

## 4. Are 41 to 57 free?

**Yes.**

- `main`: highest number is 40. No file starts with 41 to 57.
- All 16 remote branches (after `git fetch --prune`), `claude/e13-1-format` included: no `design/screens/` file numbered 41 to 57. The highest on any branch is 40.
- Docs on every branch: no mention of `design/screens/41` to `57`, "design 41" to "design 57", or a planned range. The only hits for those numbers were test counts (for example "57" Deno handler tests).
- Nothing local outside git: the working tree has no `design/screens/4[1-9]*` or `5[0-7]*` file.

Watch out: "40b" and "40c" are used as **section names inside** `40-nicheink-wordmark.html`, not as files. If a new screen should be "40b", use a new number instead.

## Method

```
git ls-tree -r -l origin/main design/screens/          # names and sizes
python: struct.unpack('>II', png[16:24])                # PNG width x height
git log --follow --name-status -- design/screens/<f>    # commits per file
git grep "design/screens" origin/main                   # references
grep -oE '(src|href)="..."' + support.js/canvas/script  # dependencies
git ls-tree / git grep on every origin/* branch         # 41 to 57
```
