# KDP Lab Roadmap

> Product: AI-assisted medium- and high-content nonfiction books for Amazon KDP.
> Rule: design before code. Each version repeats review → flow → wireframes → final design → code.

## v1 · Write your first real book in KDP Lab
Design: ✅ approved (see `design/`)

- [x] **E1** Project setup: design files, CLAUDE.md, this roadmap
- [x] **E2** Data model: tables, relations, Row Level Security (SQL migrations)
- [x] **E3** App shell + Books page + New Book + Delete, wired to Supabase
- [x] **E4** Topic Lab + Topic detail + Add topic (market validation scoring)
- [x] **E5** Pen Names + Pen name detail (bio facts, voice profile)
- [x] **E6** Edge Function `generate`: auth, usage limits, prompt templates, token logging
- [x] **E6.5** Import from Amazon page: the user pastes Amazon page 1, AI turns it into a competitor table, counts the 5 market checks, marks each number "Imported", and the user confirms. No scraping.
- [x] **E7** Book wizard shell + 01 Brief + 02 Research
- [ ] **E8** 03 Positioning (drift check, lock) + 04 Title
- [ ] **E9** 05 Outline
- [ ] **E10** 06 Write: sections, versions, improve menu, checks
- [ ] **E11** Export DOCX + Markdown · Settings + AI usage
- [ ] **E12** Real test: write one full book, fix what hurts

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
