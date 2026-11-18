# E16 Part 11 · live check · numbers only

Branch `e16-09-cover-design` (70344c7), served from this Mac on http://127.0.0.1:5500, against the live
Supabase project (0031, generate v28, stock v1). No deploy, no migration, no Supabase CLI. No book text here.

## A. Test account (Nov 18, 2026, Chrome headless via playwright-cli, user 1e117c74)

Live window: **07:53:42Z to 08:18:27Z**. Sign-in: the page's user id was checked first. The password is in 0 of
the browser tool's log files.

### A1 · Pre-checks
| What | Result |
|---|---|
| CORS, source | `http://127.0.0.1:5500` is in `ALLOWED_ORIGINS` of `stock/lib.ts` and `generate/lib/limits.ts` (7 entries each, held equal by `stock/lib.test.ts`) |
| CORS, live | stock answered `access-control-allow-origin: http://127.0.0.1:5500` on every call; generate answered 200 |
| Book a5224e83 | 8 × 10, white, Classic; current Print PDF 40 pages (Nov 17); title yes, subtitle no |
| Positioning | **none** (no row), so A2 ran |
| Pen name bio | none, so the author line is off ("Add a bio in Pen Names first") |
| Test user's cover data before | 0 cover_assets, 0 files in `<user>/assets/`, 1 cover_designs row (a5224e83, rev 1), 0 cover_exports, 0 My layouts |

### A2 · Positioning (owner allowed one drift_check)
| What | Result |
|---|---|
| Cards | filled by hand with placeholder words (one sentence, promise, approach, 1 lack, 1 selling point, 1 tag) |
| drift_check | 1 call, 4.3 s, **1 flag**, kept with the reason "Test book for the E16 live check: placeholder text." |
| Lock | locked |

### A3 · The 8 × 10 cover (a5224e83)
| What | Result |
|---|---|
| 09 opens | not Locked; the first open took 184 s (cold fonts and engine from the CDN); a reload took 4.8 s |
| Status bar | 8 × 10 in · 40 pages · white paper · spine 0.090 in · full 16.340 × 10.25 in (as planned) |
| Blank cover | "3 to fix" |
| Layout | Picture band (photo on top). After it: "2 to fix" (C16 sample photo, C17 sample blurb) |
| Stock search, Unsplash | 1 call on Enter (N10: no call before), 3.0 s, 200, 24 of 480 results. Result fields: id, source, name, thumb, preview, width, height, type, transparent, author, authorUrl, pageUrl (no color value in a result) |
| Stock pick, Unsplash | 1 call, 5.2 s, 200: 6000 × 4000, a hotlink (path null, `remote` set, bytes null), credit stored. It replaced the sample photo (Replace). DPI badge 738 |
| Stock search, Pixabay | **2 calls, not 1** (my script's fault: a Pixabay tab with words in the box searches on its own, and my fallback also pressed Enter before that reply came). Both 200, 24 of 480 results, the same fields |
| Stock pick, Pixabay | 1st try: **503 `stock_busy`** (in the code: Pixabay itself answered 429). The app said "Pixabay is not answering right now. Try again in a minute, or use your own uploads." Retry after 65 s: 200, 5.1 s, 1280 × 853 JPEG, 202,078 bytes, stored as a copy, credit stored |
| Pixabay placement | first 299 DPI "may print soft"; made smaller to **316 DPI**, then moved to the back cover |
| Credits (More menu) | "Pixabay, by janeb13" and "Photo by Thought Catalog on Unsplash", each with 2 links; Unsplash links carry `utm_source=nicheink&utm_medium=referral` |
| Blurb | 1 call, 5.5 s, 200; request `{ stage: cover_blurb, length: medium, tone: warm, authorLine: false }`; reply keys stage, blurb, words, unsourced (v28: no headline); 136 words, 0 unsourced; "Fits the back cover at 11 pt, above the barcode." |
| Checks | **Ready** (0 Must fix, 0 to check) |
| "Used on", live | both Uploads × questions read "Used on 1 cover (this one)"; 4 reads of `layers=cs.[{"asset":…}]` (cover_designs and cover_my_layouts) all 200; Cancel; 0 deletes |
| Orphan sweep, live | Storage `list` 200, 1 file; reply keys name, version, id, updated_at, created_at, last_accessed_at, metadata, archived_at, is_delete_marker, is_versioned; created_at on every file; the name is `<uuid>.jpg`; 0 removes |
| Export | 8.0 s for PDF + PNG + Kindle; then rows, My layouts and a history snapshot |
| Records | `cover_key` 200; **one insert** of `print`, `image`, `kindle` (201, 3 rows); My layouts 201; history 201 (reasons: visit, visit, export) |
| Header | "Done: cover files exported."; Next on, with the tip "10 Metadata comes in v3" |
| PDF | 1,094,924 bytes; PDF 1.7, 1 page; 1176.487 × 738 pt = **16.340 × 10.25 in**; 3 fonts embedded (FontFile2, subset: Source Serif 4 Bold, IBM Plex Sans Regular, SemiBold); 1 ICCBased; 0 DeviceCMYK, 0 SMask, 0 alpha, 0 Encrypt; 2 images |
| PNG | 4903 × 3075, 300 DPI, sRGB IEC61966-2.1; 6,139,756 bytes |
| Kindle JPG | 1600 × 2560, sRGB; 357,645 bytes |
| Zip | 4 files saved; `unzip -t`: no errors (3 files) |
| cover_exports rows | image 40 p 4903 × 3075 "browser canvas"; kindle 1600 × 2560; print 40 p 16.3401 × 10.25 in, spine 0.0901, "typst 0.14.2 · c2" |

### A4 · The 120-page spine book (new, e5209d67)
| What | Result |
|---|---|
| Book | "E16 Spine Test Book", pen name E13.2 Live Pen, 6 × 9, white, Classic; built only with `window.kdp` calls; no AI |
| Text | `placeholder.js` seeds 116, 117, 118: Introduction + 8 chapters + Conclusion, 31 sections, all Final, **37,778 words** |
| Page count tuning | 26 sections, 31,381 words: 104 pages → + 4 sections: 116 → + 1 section: 122 → a shorter 2nd version of that section: **120** |
| 08 | "120 pages · Spine 0.270 in"; margin note 0.375 in KDP minimum, 0.75 in inside, 0.5 in outside |
| Interior Print PDF | 3.4 s; `e16-spine-test-book-print-6x9.pdf`, 625,934 bytes, 120 pages, 432 × 648 pt (6 × 9 in); row "Exported Nov 18 · 120 pages" |
| 09 | status bar 6 × 9 in · 120 pages · white paper · spine 0.270 in · full 12.520 × 9.25 in |
| My layouts, live | "Picture band, from E13.2 Live Test Book, exported Nov 18" applied: both pictures came; the blurb went back to the sample (C17) |
| Spine text | Book data: "On for this book: 120 pages gives a 0.270 in spine." Add spine text: title + pen name; **C3, C4, C5 clear** |
| Blurb | the dialog lets you type only after a first AI draft, so the sample blurb layer was deleted (the check's other choice). No 3rd AI call |
| Checks | Ready |
| Export | 6.6 s; one insert 3 rows (201); My layouts 201; history 201 |
| PDF | 823,930 bytes; 1 page; 901.454 × 666 pt = **12.520 × 9.25 in**; 2 fonts embedded (Source Serif 4 Bold, IBM Plex Sans SemiBold); 1 ICCBased; 0 CMYK, 0 SMask, 0 alpha, 0 Encrypt; 2 images |
| PNG | 3757 × 2775, 300 DPI, sRGB; Kindle 1600 × 2560, sRGB; zip: no errors |
| cover_exports rows | print 120 p 12.5202 × 9.25 in, spine 0.2702; image 3757 × 2775; kindle 1600 × 2560 |

Files for the owner (outside git): `~/Documents/nicheink-private/e16-live/a3/` and `…/a4/`. The spine sheet pair is
`a4/e16-spine-test-book-print-6x9.pdf` (interior) and `a4/e16-spine-test-book_6x9_120p_white_cover.pdf` (cover).

### AI usage (test user's ai_usage rows in the window)
| Stage | Model | In | Out | Counted | Cost at plan §12 rates ($2 / M in, $10 / M out) |
|---|---|---|---|---|---|
| drift_check | claude-sonnet-5-5 | 1,411 | 61 | yes | $0.0034 |
| cover_blurb | claude-sonnet-5-5 | 1,306 | 229 | yes | $0.0049 |
| **Total** | | 2,717 | 290 | | **$0.0083** |

### Stock calls (test user's stock_calls rows; purged 2 h after each call)
| At (UTC) | Source | Action | Provider calls |
|---|---|---|---|
| 08:02:09 | unsplash | search | 1 |
| 08:02:28 | unsplash | pick | 2 (the photo, then the download ping) |
| 08:03:23 | pixabay | search | 1 |
| 08:03:23 | pixabay | search | 1 (the extra one, my script) |
| 08:03:41 | pixabay | pick | 1 (the 503 `stock_busy`) |
| 08:07:32 | pixabay | pick | 1 (the retry, 200) |

### A5 · Row ownership
`docs/reviews/e16-live/rows.sql` is read-only. Claude chat ran it on live (Nov 18).
- Result: other_rows = 0 in all 13 items.
- Counts: cover_designs 2, cover_design_history 5, cover_assets 2, cover_my_layouts 2, cover_exports 6, ai_usage 2, stock_calls 6, objects in bucket covers 1, books 1, sections 31, section_versions 32, book_exports 1, positioning 1.
- Last migration: 20261116150000 "stock".

### A6 · Spine sheet in the KDP Previewer (owner, throwaway draft)
**PASS.** 6 × 9, white, no bleed, the 120-page interior and the 12.520 × 9.25 in cover.
- No issue listed.
- The spine text sits inside the spine lines.
- The barcode is in our box.

## B. The owner's real book 919ca117 (Nov 18, 2026; the owner drove, numbers read back)

| What | Result |
|---|---|
| 08 | Print PDF "Exported Nov 12 · 50 pages"; interior downloaded |
| 09 status bar | 6 × 9 in · 50 pages · white · spine 0.113 in · full 12.363 × 9.25 in |
| Completed note on 09 | none, after a hard reload |
| Layout | Picture band; own picture (rights ticked); pink background |
| AI | 1 cover_blurb call (owner's account) |
| Checks | 1 to check (picture 249 DPI), kept |
| PNG | 3709 × 2775 at 300 DPI |
| Kindle JPG | 1600 × 2560, RGB; not uploaded to KDP (no EPUB yet) |
| KDP Print Previewer | PASS on the real draft (6 × 9, white, 50 pages): no issue, barcode in our box; draft only |

## E3. E16.1 live check (Nov 18, 2026, Chrome headless via playwright-cli, user 1e117c74, branch at 9fef68b)

Live window: **13:06:42Z to 13:11:03Z**. CORS first: `http://127.0.0.1:5500` is in both allow-lists, and E16.1 changed nothing under `supabase/`. The page's user id was checked before any write. The password is in 0 of the browser tool's log files. No AI call.

| What | Result |
|---|---|
| 09 opens (a5224e83, 8 × 10) | ready in 1.9 s (warm CDN) |
| Seed words | the Brief topic was the placeholder "E13.2 Live Test Book" (20 characters), which would find no pictures, so the test book's Brief topic was set to "study habits" (test account only; put back on request). Reload: seed "study habits" |
| Template | on the cover only "Barcode area 2.0 × 1.2 in"; one fill, the barcode wash rgba(255, 243, 92, 0.45); popover: 5 notes |
| Pixabay open | **1 call**, 3.9 s to the tiles, 200, page 1, 24 of 480, `cached: false`, CORS `http://127.0.0.1:5500`; the box reads "study habits"; the topic line shows; the end of the box is watched |
| 2 scroll pages | **2 calls** (pages 2 and 3), 70 pictures (Pixabay sent 2 pictures twice across pages; they show once). Server log times 13:07:48.18 and 13:07:51.05: 2.87 s apart on the server clock. The app waits 3 s between its own starts; the server writes its time after its own checks, so a slower first request makes the gap look shorter there |
| Snap, title | the center lands exactly on the front center; lit guide 2 px; the magnet holds at +10 px and lets go at +22 px; one Undo puts it back |
| Snap, picture | the back Pixabay picture lands exactly on the back live-area corner, both guides lit; one Undo puts it back |
| Replace on a Pixabay picture | the layer "computer" given a typed name "man", then Replace with the Pixabay result "woman": 1st pick **503 `stock_busy`** (Pixabay answered 429, as in A3); retry after 65 s: 200, 1,280 px, a stored copy. The layer reads "woman", the typed name is gone, the Layers row "woman". Undo: "man" and the old picture; Undo again: "computer". The cover ends as it began |

### Stock calls (test user's stock_calls rows; purged 2 h after each call)
| At (UTC) | Source | Action | Provider calls |
|---|---|---|---|
| 13:07:32 | pixabay | search | 1 (open, the topic) |
| 13:07:48 | pixabay | search | 1 (page 2) |
| 13:07:51 | pixabay | search | 1 (page 3) |
| 13:09:23 | pixabay | pick | 1 (503 `stock_busy`) |
| 13:10:47 | pixabay | pick | 1 (the retry, 200) |

Changed on the test account: a5224e83's Brief topic is "study habits" (it was "E13.2 Live Test Book"), and 1 new cover_assets row ("woman", Pixabay, with its file in `covers/<test user>/assets/`). The cover design is as before.
Row check: `docs/reviews/e16-live/rows-e3.sql` (read-only) for Claude chat.
