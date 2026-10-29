# E12 fix batch 3: live check results (STOP 5)

Date: 2026-10-29. Branch `claude/e12-fixes-3` at `dc221b0` (Part 3), served from `127.0.0.1:5500`. The database has 0026 applied (`20261028093000 book_complete_words`), and generate is v24.

- **Account:** test account only, user `1e117c74-49db-4c1e-bee6-6c324c2ecae4`.
- **Sign-in:** a new in-memory browser session (kdp-livefix3) with no saved session. The values from `.env.test` were passed by the shell into the page, never written down or printed, and the session was closed after the check.
- **Privacy:** no "@" on any page shot.
- **Data reads:** through the page's own signed-in client (RLS, as the test user). No Supabase CLI.
- **Cost:** 0 AI calls, **$0**. No export was made: the Export dialog was opened and closed twice, only to read its notes.
- **Book:** test book `4e2dde85` "Somatic Healing for Anxiety", 23 sections.
- **Labels:** positions are used below (7.1 = chapter position 7, section 1). The app numbers chapters 1 to n, so position 7 shows as "6" on screen.

## Results
| Step | Check | Result | Notes |
|---|---|---|---|
| 1 | Card words = sum of the current versions | **Pass** | Card "11,416 of 9,900 words", bar 100%. The current versions add up to 11,416 and the section targets to 9,900. |
| 1 | Same as the 06 manuscript | **Pass** | 06 shows "11,416 / 9,900". The one saved draft (9.2) is older than its version, so 06 does not count it either. |
| 1 | "Needs review" badge from sections (Q7) | **Pass** | The badge shows: 11 sections are marked and 0 chapters. |
| 1 | 900 px, no "@" | **Pass** | No sideways scroll. |
| 2 | Words this month after an edit | **Pass** | 11,416 → 11,438 after saving 7.1 with 22 more words (v2, 307 → 329 words). |
| 2 | After restoring 7.1's v1 | **Pass** | Back to 11,416 (7.1 v3 = v1 text, still Draft). |
| 2 | Rule 1 vs a plain total | Not shown | Every version of this account is from October, so "words added since Oct 1" equals the total. The month edge is covered by `t0026.sql` (8 cases). |
| 3 | The box and the chapter button | **Pass** | "11 sections need review / Mark all as reviewed". The open chapter shows "Mark chapter as reviewed (2)". No unlock of 03 was needed: the 11 marks were already there. |
| 3 | Chapter confirm and result | **Pass** | "Mark 2 sections in chapter 1 as reviewed?", with "“Why Your Body Stays on Alert”: 1.1 and 1.2. …". Then "Marked 2 sections as reviewed." and the box says 9. |
| 3 | Book confirm and result | **Pass** | "Mark 9 sections as reviewed?" lists the first 8, then "and 1 more". Then "Marked 9 sections as reviewed." The box is gone, and so is the 06 "Needs review" flag in the sidebar. |
| 3 | Server | **Pass** | 0 sections and 0 chapters marked. Every status is the same as before (sorted compare with the first snapshot). |
| 3 | Card badge and Export note | **Pass** | Before: the badge and "Needs review: …" in Export. After: no badge and no note. |
| 4 | Not ready | **Pass** | "Mark book as completed" is off, with "11 sections are not Final yet · 2 sections have no text" (the needs-review line went with step 3). |
| 4 | Ready | **Pass** | After text in 10.1 and 10.2 and Final on 11 sections: "Every section is Final and nothing needs review." The button is on. |
| 4 | Mark book as completed | **Pass** | Server: completed, completed_at 2026-10-29 08:04:08 UTC. The foot shows "Completed / Marked Oct 29. You can still edit it.", with focus on Reopen book. 900 px: no sideways scroll. |
| 4 | The strip | **Pass** | "This book is marked completed. You can still edit it. A new version keeps it completed. Reopen book", on 06 and on 01 Brief. |
| 4 | Books | **Pass** | The card shows "Completed · 11,507 words", and the book is in the Completed tab. |
| 4 | Reopen on its own (7.1 Final → Draft) | **Pass** | Note: "Status saved. The book is no longer marked completed, because 6.1 is not Final." The strip goes. Server: in_progress, completed_at null. |
| 4 | Reopen from the card menu | **Pass** | Completed again (08:04:15 UTC). The menu shows "Open, Rename, Export, Reopen book, Delete", then "Reopened “Somatic Healing for Anxiety”." The card shows its step again. Server: in_progress, completed_at null. |
| 5 | "According to one source, rest is enough." | **Pass** | Source not named (counted). |
| 5 | "Research shows that sleep helps." | **Pass** | Check that the source is named (info, not counted). Show selects the sentence. |
| 5 | "Smith's research shows it too." and "Lally's study followed many people. This research shows the habit took time." | **Pass** | Not flagged (D2). |
| 5 | "As covered earlier in this chapter, breathe slowly." | **Pass** | Points back to another part (info, not counted). |
| 5 | "Later in this chapter you will try it." | **Pass** | Mentions another part of the book (counted, Q5). |
| 5 | Tab count | **Pass** | 1 → 3. Only the two new warnings count. The section's own "Also in another section" row was there before. |
| 5 | Put back | **Pass** | Saved as v2, then restored v1: 7.2 v3 = v1 text, no draft left. |

All planned checks pass. No bug was found.

## The test book after the check (restored)
- **Statuses:** the same as before, per section.
  - 0.1, 1.1 to 5.2 and 11.1: Final.
  - 7.1 to 9.3: Draft.
  - 10.1 and 10.2: Not started.
- **"Needs review":** put back on the same 11 sections (1.1 to 5.2, 11.1), in one update through the app's client as the test user. 0 chapters marked, as before.
- **Unchanged:** the book is in progress with completed_at null. outline_approved_at is 2026-10-27 16:36:15 UTC, as before. The positioning is locked with a current drift check. title_needs_review is false. The 9.2 draft (Oct 27) is untouched.
- **New versions** (insert-only; they cannot be removed; owner decision for step 4):
  - 7.1: v2 manual, then v3 restore = v1 text.
  - 7.2: v2 manual, then v3 restore = v1 text.
  - 10.1: v2 restore of its partial v1 ("Keep partial text", 63 words), now current.
  - 10.2: v1 manual (28 words), now current.
- **Words:** 11,416 → 11,507 (+63 for 10.1, +28 for 10.2). Words this month is also 11,507.
- **Book:** `updated_at` moved to 2026-10-29. Its last DOCX export now reads "Changed since export" (it did before as well).

## Screenshots (this folder)
- **1:** `1-books-1440.png`, `1-books-900.png`, `1-write-1440.png`
- **2:** `2-stat-after-edit-1440.png`
- **3:** `3-buttons-1440.png`, `3-chapter-confirm-1440.png`, `3-chapter-done-1440.png`, `3-book-confirm-1440.png`, `3-book-done-1440.png`, `3-books-after-1440.png`
- **4:**
  - `4-not-ready-1440.png`, `4-ready-1440.png`
  - `4-completed-1440.png`, `4-completed-900.png`
  - `4-strip-brief-1440.png`, `4-books-completed-1440.png`
  - `4-reopened-own-1440.png`, `4-card-menu-1440.png`, `4-reopened-card-1440.png`
- **5:** `5-checks-1440.png`
