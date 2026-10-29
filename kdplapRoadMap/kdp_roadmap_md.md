# KDP Lab Roadmap

> Product: AI-assisted medium- and high-content nonfiction books for Amazon KDP.
> Rule: design before code. Each version repeats review → flow → wireframes → final design → code.

## v1 · Write your first real book in KDP Lab
Design: ✅ approved (see `design/`)
Status: ✅ done (E1 to E12, both review gates)

- [x] **E1** Project setup: design files, CLAUDE.md, this roadmap
- [x] **E2** Data model: tables, relations, Row Level Security (SQL migrations)
- [x] **E3** App shell + Books page + New Book + Delete, wired to Supabase
- [x] **E4** Topic Lab + Topic detail + Add topic (market validation scoring)
- [x] **E5** Pen Names + Pen name detail (bio facts, voice profile)
- [x] **E6** Edge Function `generate`: auth, usage limits, prompt templates, token logging
- [x] **E6.5** Import from Amazon page: the user pastes Amazon page 1, AI turns it into a competitor table, counts the 5 market checks, marks each number "Imported", and the user confirms. No scraping.
- [x] **E7** Book wizard shell + 01 Brief + 02 Research
- [x] **E8** 03 Positioning (drift check, lock) + 04 Title
- [x] **PLAN review gate** (after E8): Batches A, B1, B2, C, the ultrareview fixes and C2. Plans and results in `docs/reviews/`.
- [x] **E9** 05 Outline (E9.1 structure and generate, E9.2 AI check and approve). Plan and results in `docs/reviews/2026-10-07-e9-plan.md`.
- [x] **E10** 06 Write: sections, versions, improve menu, checks
  - E10.1 editor, drafts, versions: done (0018, merged 734b849)
  - E10.1 fix: no blank first version (0019, merged 6e919ef)
  - E10.2 Generate section (streaming): done (0020, generate v16, merged 81a2e34)
  - E10.3 Improve menu: done (0021, generate v18, merged ec664c1)
  - E10.4 Checks tab: done (0022, generate v19, merged cd9966f)
- [x] **PRODUCE gate** (after E10): G4 owner walk-through, G1 review, G2 clean-up, G3 fixes (0023, generate v20), G5 severity, Keep as is, Fix, Fix major (0024, generate v21), G6 all suites green on main. Merged bec800e. Results in `docs/reviews/produce-gate-g1.md` to `produce-gate-g5.md` (G4 answers in g1 section 7).
- [x] **E11** Export DOCX + Markdown · Settings + AI usage: Export dialog (DOCX built in the browser with docx 9.5.1, Markdown), Settings, name-only sidebar, Books badge, 0025 live (20261025213500). Merged 1c9b932. Plans and results in `docs/reviews/2026-10-25-e11-plan.md` and `2026-10-25-e11-build-plan.md`.
- [x] **E12** Real test: write one full book, fix what hurts
  - Step 1 AI prompt review: done (report `docs/reviews/2026-10-26-e12-prompt-review.md`)
  - Step 2 fix batch: done (one number rule, point of view, examples, style, previews, `<book_so_far>`, bio, "ends mid-sentence" and "Mentions another part of the book" checks; generate v22 + v23; merged e6c0737). Plans and live checks in `docs/reviews/2026-10-26-e12-fix-batch-plan.md` and `2026-10-26-e12-part3-plan.md`
  - Step 3, the real book: "Micro Study Habits for Busy Adult Learners" (5 chapters, about 11,000 words, DOCX) was written on the owner's account
  - Step 4, fix batch 2 from the real book: done (merged f0f2145, generate v24). The 11 items except item 3 (the Topic Lab note, postponed to v2):
    - competitor BSR read from the page;
    - outline "Let the AI choose" 2 to 5 sections a chapter;
    - Needs review with "Mark as reviewed";
    - "Ready to mark Final" with the owner's rule for a check that still holds (its own Fixes, own edits under 20%);
    - Generate chapter with the cost line;
    - repeats as info, not the section's own topic;
    - no source labels like [S3] (prompts, server strip, Checks row, Export strip);
    - sources named by their citation;
    - a richer `<book_so_far>` and "Also in another section" in Checks and Export.
    - Plan, live checks A and B and the security review: `docs/reviews/2026-10-27-e12-fix-batch-2-plan.md`
  - Step 5, fix batch 3 from finishing the real book: done (merged f46ca03; migration 0026 live as 20261028093000; generate stays v24):
    - the Books card counts the saved words of each section against the section targets (the old card never counted words);
    - "Words this month" counts the words added since the 1st, UTC (0026 `words_month`);
    - "Mark book as completed" in 06 Write (every section Final with text, nothing needs review), Reopen in 06, the book strip and the card menu, and a reopen on its own when the rule breaks (0026 `complete_book`, `books.completed_at`);
    - "Mark all as reviewed" for a chapter or the whole book;
    - Checks: "according to one source" in Source not named, plus two info rows, "Check that the source is named" and "Points back to another part";
    - the card title keeps room for the ⋯ button.
    - Plan, designs 01b and 22f, STOPs and the live check: `docs/reviews/2026-10-28-e12-fix-batch-3-plan.md`, `docs/reviews/e12-fix3-live/results.md`
  - The real book is final, exported and marked completed (Oct 29). Publishing moves to v2, after 09 Cover (owner decision, Oct 28).

### Watch list for the real book
- Practices taught again: a practice from an earlier section is named, but its steps are taught a second time (Part 3 live check; Live check A: 7.1 copied two steps word for word; "Also in another section" now flags it).
- An example given its own subheading ("## A short example", Live check A).
- The same opener across sections, for example "This is common, and it does not mean…" (`<book_so_far>` shows subheadings only).
- AI Verify marks on claims without numbers (H1): the AI rarely marks them, and no check flags them yet.
- Unnamed sources in the Write prompt (fix batch 3, Q6): "research shows", "studies show" and "experts say" are not in the prompt rule yet (v24 names "research suggests" only). The Checks info row shows them. Widen the rule in a later generate version if the real book still has them.
- Test flake: the `write/t-chapter` "done" check fails about 2 in 5 runs, on main too (fix batch 3, STOP 4).

## Next
Rename to NicheInk (nicheink.com), then v2 starting with 09 Cover.

## v2 · KDP-ready files
07 Quality Control · 08 Format · 09 Cover (full wrap) · Print PDF · EPUB ·
image generation · Google Drive export · mobile layout · dark mode.
Design starts after E12.

## v3 · Publish and open to users
10 Metadata (description, 7 keywords, categories, price) · 11 Publish (preflight) ·
new landing page · usage plans and billing · name and trademark check.

## v4 · Business
Research Vault · Templates · Assets · Launch tracker · Analytics (royalty report upload) ·
low-content generators return under KDP Tools.
