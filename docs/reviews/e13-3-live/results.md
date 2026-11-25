# E13.3 Part 5 · live check · numbers only

Branch `claude/e13-3-epub` at 9717a01 (not pushed), served from this Mac by `tests/browser/serve.py` on
http://127.0.0.1:5500, against the live Supabase project. 0034 live since Nov 24 14:10 (applied by Claude chat).
No deploy, no Supabase CLI, no AI call, no stock call, no `.env` file opened. No book text in this file.
Keys are shown as their first 8 characters only.

## A. Test account (Nov 24, 2026, Chrome headless through playwright-cli, 1440 × 900, user 1e117c74)

### Method
- A fresh in-memory playwright-cli session. Before sign-in, a **request guard** on the browser context (the E16.3 D1
  method; the script stays in the scratchpad). It lets through only `127.0.0.1:5500`, the project's `auth/v1` and
  `rest/v1`, jsdelivr and Google Fonts. Everything else is refused in the browser and logged: every `functions/v1`
  call (`generate`, `stock`), Pixabay, Unsplash, any other host.
- Sign-in through `login.html`. The run-code was built by python from the sourced `.env.test` (the file was not
  opened), its output went to `/dev/null`, and the script file was deleted after. The page's user id was checked
  (`1e117c74`). The token stayed in the browser; no curl call.
- Keys and settings were read through the app's own client (`kdp.getFormat` → `format_json`).
- Auto mode turned on during the run (after the "before" read). Under the owner's rule of Nov 24, the run went on;
  nothing else changed.

### Before step 1 (test book a5224e83, 8 × 10)
| What | Value |
|---|---|
| Settings | Classic · white · chapter label `number` · Show sections too off · drop cap off · right-hand start on · running header on · header title none · ISBN set (9780306406157) · Also by on (2 books) · parts: title, copyright, contents, intro, conclusion on; about off |
| Print `format_key` | `d03d8ca9` |
| `epub_key` | `16ed78c7` |
| Last Print PDF | Nov 17 12:12:52 UTC, `settings_key` `d03d8ca9` → `changed` false |
| Last EPUB | none (`last_epub` null, `epub_changed` null) |
| 08 Export files panel | sub "40 pages · 8 × 10 in · white paper"; Print PDF "Exported Nov 17 · 40 pages" + Export again (**current**); EPUB "Not exported yet" + Export; Word "Export" |
| Books card | "Print PDF" mark, "Exported Nov 17", no EPUB mark |

### 1. Kindle preview (08, Kindle mode)
| Case | Result |
|---|---|
| 08 open → Kindle mode | 08 ready 3,861 ms; first Kindle screen 4,298 ms after the Kindle click; "Screen 1 of 81" |
| Bar | chips "EPUB 3 · clickable contents" and "No page numbers"; the caption shows |
| Style Modern / Clean / Warm / Classic (size M) | 81 / 81 / 81 / 81 screens. The frame rebuilt each time: Modern headings `sans-serif`; Clean, Warm, Classic headings in the reader serif (the EPUB has two heading looks only, `epub.js` `css(style)`: Modern sans-serif, the rest serif; body text has no font, Q3) |
| Chapter label Chapter 2 / None / 2 (Classic) | 81 / 81 / 81 screens; the label lines read "Chapter 1, Chapter 2" / none / "1, 2" |
| Show sections too on / off | 82 / 81 screens |
| Text size Small / Large / Medium | 64 / 111 / 81 screens |
| Frame | 11 parts; contents with 7 links (sections off) |
| Paging | Next × 2 → 3; Previous → 2; ArrowRight in the frame → 3; ArrowLeft → 2 |
| Contents jump | the contents are on screen 3 (7 links, all tabbable there); a click on link 4 of 7 → **Screen 37 of 81** |
| Full screen | opens at 1440 × 900 on the same screen (37 of 81), A A A in the view; Next → 38; Large → 49 of 111; Medium → 37 of 81 (the same part kept); Escape closes it, the box shows 37 of 81, focus back on "Full screen" |
| After step 1 | style, chapter label and sections put back; settings equal to "before"; `format_key` `d03d8ca9`, `epub_key` `16ed78c7`, PDF still current |

### 2. EPUB export
| What | Result |
|---|---|
| Export (Export files → EPUB Export) | click **14:38:01.055Z**, download 14:38:01.964Z: **909 ms** |
| File | `e13-2-live-test-book-ebook.epub`, **77,746 bytes**, sha256 `28973f6c` |
| Row after | "Exported Nov 24 · EPUB 3" + Export again, focus on Export again; Print PDF row unchanged ("Exported Nov 17 · 40 pages") |
| `format_json` after | `last_epub` id `5dd66e55`, engine `epub3 · e1`, created 14:38:01.673Z, `settings_key` `16ed78c7` = `epub_key` → `epub_changed` false; `format_key` `d03d8ca9`, PDF `changed` false |
| EPUBCheck 5.4.0 (`node tools/epubcheck.mjs`, zip and jar sha256 pinned, Java 21.0.12.1) | word for word: `EPUBCheck 5.4.0: 0 fatal, 0 errors, 0 warnings, 0 infos, 0 usages (exit 0)` · `RESULT: 0 fatal, 0 errors, 0 warnings` |

### 3. Rows (Claude chat reads `book_exports` and `epub_marks`)
Read by Claude chat on the live DB at 14:41 UTC:

| What | Result |
|---|---|
| `book_exports` row `5dd66e55` | format `epub`, status `final`, no `page_count`, `settings_key` = `epub_key` `16ed78c7`, `format_key` still `d03d8ca9`, engine "epub3 · e1", parts `contents` true, `style` classic in the snapshot, 17 of 17 Final versions, test account |
| `epub_marks` | exported 14:38:01, `changed` false |

### 4. Changes one at a time (keys through the app's own client; each change kept, then the next)
| Change | Saved in | `format_key` before → after | `epub_key` before → after | 08 Print PDF row | 08 EPUB row |
|---|---|---|---|---|---|
| Drop cap off → on | 482 ms | `d03d8ca9` → `d7ab4576` (PDF `changed` false → true) | `16ed78c7` → `16ed78c7` | "Changed since export. Last PDF Nov 17 · 40 pages." (warning look) | "Exported Nov 24 · EPUB 3" (current) |
| ISBN 9780306406157 → blank | 438 ms | `d7ab4576` → `0fc4f30e` | `16ed78c7` → `16ed78c7` | changed | current |
| Running header on → off | 448 ms | `0fc4f30e` → `2d270edc` | `16ed78c7` → `16ed78c7` | changed | current |
| Chapter label `number` → `chapter` | 472 ms | `2d270edc` → `07c1640b` | `16ed78c7` → **`b7f5bdb9`**, `epub_changed` true | changed | **"Changed since export. Last EPUB Nov 24."**: class `is-changed`, warning look (`--warning-bg`, `--warning` border), an icon, a filled (primary) "Export again" |

The PDF row was current before step 4, so the row look and the keys both prove the three print-only changes.

| After the label change | Result |
|---|---|
| Books card | "Print PDF changed" and **"EPUB changed"**, both `badge-warning` with an icon; "Exported Nov 24" |
| Export again (08) | click **14:49:08.857Z**, download 14:49:09.614Z: **757 ms**; `e13-2-live-test-book-ebook.epub`, **77,906 bytes** |
| Row after | "Exported Nov 24 · EPUB 3" + Export again (current), focus on Export again; Print PDF still changed |
| `format_json` after | `last_epub` id `f408ed08`, engine `epub3 · e1`, created 14:49:09.384Z, `settings_key` `b7f5bdb9` = `epub_key` → `epub_changed` false; `format_key` `07c1640b`, last PDF key `d03d8ca9` → PDF `changed` true |
| Books card after | "Print PDF changed" (warning), **"EPUB"** (`badge-success`) |
| EPUBCheck 5.4.0 on the second file | `EPUBCheck 5.4.0: 0 fatal, 0 errors, 0 warnings, 0 infos, 0 usages (exit 0)` · `RESULT: 0 fatal, 0 errors, 0 warnings` |

Rows of the second export, read by Claude chat on the live DB at 14:52 UTC:

| What | Result |
|---|---|
| `book_exports` row `f408ed08` | `settings_key` `b7f5bdb9` = today's `epub_key`, engine "epub3 · e1", parts `contents` true, `style` classic, no `paper`, 17 versions, test account |
| `book_exports` row `5dd66e55` | keeps its old key `16ed78c7` (history) |
| `epub_marks` | reads the newest row: `changed` false |
| EPUB rows in the whole DB | 2, both the test account's |

### 5. Restore (owner choice b: restore, then a third export)
Each setting was put back one at a time (saves 579 to 801 ms):

| Restore | `format_key` | `epub_key` | 08 Print PDF row | 08 EPUB row |
|---|---|---|---|---|
| Drop cap on → off | `07c1640b` → `95e540e8` | `b7f5bdb9` | changed | current |
| ISBN blank → 9780306406157 | → `a2a9a550` | `b7f5bdb9` | changed | current |
| Running header off → on | → `61786b7a` | `b7f5bdb9` | changed | current |
| Chapter label `chapter` → `number` | → **`d03d8ca9`** (PDF `changed` false) | → **`16ed78c7`** (`epub_changed` true against `f408ed08`) | **"Exported Nov 17 · 40 pages"** (current again) | "Changed since export. Last EPUB Nov 24." |

Third export (08, Export files → EPUB Export again):

| What | Result |
|---|---|
| Export | click **15:09:06.724Z**, download 15:09:08.062Z: **1,338 ms**; `e13-2-live-test-book-ebook.epub`, **77,746 bytes**, sha256 `c7b976c1` |
| `format_json` after | `last_epub` id `9ca653f2`, engine `epub3 · e1`, created 15:09:07.555Z, `settings_key` `16ed78c7` = `epub_key` → `epub_changed` false |
| EPUBCheck 5.4.0 on the third file | `EPUBCheck 5.4.0: 0 fatal, 0 errors, 0 warnings, 0 infos, 0 usages (exit 0)` · `RESULT: 0 fatal, 0 errors, 0 warnings` |
| Export 1 vs export 3 (same settings) | the same size (77,746 bytes). Unzipped, one file differs: `OEBPS/content.opf`, only the `dcterms:modified` line (14:38:01Z vs 15:09:06Z) |

**Before and after, side by side**

| What | Before step 1 | After step 5 |
|---|---|---|
| Settings (every column except `updated_at`) | Classic · white · label `number` · sections off · drop cap off · right-hand start on · running header on · header title none · ISBN 9780306406157 · Also by on (2 books) · parts as listed above | **the same** (compared field by field: equal) |
| `updated_at` | Nov 9 18:27:02Z | Nov 24 15:08:53Z (saves write it; not part of either key) |
| Print `format_key` | `d03d8ca9` | `d03d8ca9` |
| Print PDF | last Nov 17 12:12:52Z, `changed` false: **current** | the same row, `changed` false: **current** |
| `epub_key` | `16ed78c7` | `16ed78c7` |
| EPUB | none | **current**: last `9ca653f2` (15:09:07Z), `epub_changed` false. 3 EPUB rows: `5dd66e55`, `f408ed08`, `9ca653f2` (history) |
| 08 Export files panel | Print PDF "Exported Nov 17 · 40 pages"; EPUB "Not exported yet" | Print PDF "Exported Nov 17 · 40 pages"; EPUB "Exported Nov 24 · EPUB 3" |
| Books card | "Print PDF", "Exported Nov 17" | "Print PDF" and "EPUB" (both `badge-success`), "Exported Nov 24" |

### End of the run
- Signed out with the app's client (`sb.auth.signOut`; the script found no button named "Sign out" by role on
  the Books page, so it used the client): `auth/v1/logout` went through the guard, the session key is gone from the browser. The playwright-cli
  session `kdp-live` is closed.
- Sign-in data left in files: the scratchpad has the password in 0 files and the email in 0 files. The repo's
  `.playwright-cli/` (ignored by git) has the password in 0 files and the email in 52 old files (49 from Sep 28, 1 from
  Oct 12, 2 from Oct 15); none from this run.
- Safari: by the owner, by hand, later.

### Request guard log (whole run)
176 logged requests to the project, **0 refused**, **0** `functions/v1` calls, no Pixabay or Unsplash request.
`book_formats` PATCH 24 (step 1: 16, step 4: 4, step 5: 4), `book_exports` POST 3 (the 3 EPUB records),
`auth/v1/token` 1, `auth/v1/logout` 1; the rest are the app's reads.

### Request guard log (to the end of step 4)
124 logged requests to the project, **0 refused**, **0** `functions/v1` calls, no Pixabay or Unsplash request.
New since step 2: `book_formats` PATCH +4 (the step 4 changes), `book_exports` POST +1 (the second EPUB record),
`format_json`, `export_json`, `pdf_marks`, `epub_marks` and the Books page reads.

### Request guard log (to the end of step 2)
63 logged requests to the project, **0 refused**, **0** `functions/v1` calls (no `generate`, no `stock`), no Pixabay
or Unsplash request. Project calls: `auth/v1/token` 1; `rest/v1`: `book_formats` PATCH 16 (the step 1 saves),
`book_exports` POST 1 (the EPUB record), rpc `format_json` 8, `export_json` 5, `pdf_marks` 18, `epub_marks` 1,
`export_badges` 1, `cover_marks` 1, `qc_mark` 1, `outline_json` 1, `usage_month` 1, `words_month` 1; GET `books` 2,
`user_settings`, `pen_names`, `competitors`, `research_sources`, `research_insights` 1 each.

## Part 5 B (owner's real book)

- Safari (owner, by hand, test account): OK (Kindle preview, paging, A A A, Full screen, one EPUB export).
- Owner's book EPUB exported 15:25:45Z. Claude chat read the row: `b73afcc0`, `settings_key` = `epub_key` `b9ca1872`,
  engine "epub3 · e1", `contents` true, `style` modern, 16 of 16 Final versions.
- KDP eBook draft (not published), online Kindle Previewer: converted, 544 locations, title page correct,
  Quality issues: 0 spelling, 0 image. Note: the KDP draft title was a placeholder; for a real publish the KDP title
  setup must match the file's title, subtitle and author.
