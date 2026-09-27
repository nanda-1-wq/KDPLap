# KDP Platform Roadmap

> **Timeline:** ~9 months | **Phases:** 4 | **Total Features:** 20

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Supabase (Auth + PostgreSQL + Storage) |
| Hosting | Vercel |
| Payments | Stripe (Phase 3) |

---

## Phase 1 — Foundation & MVP
> **Months 1–2** · Build the core web app skeleton and your first working generator.

- [ ] **Project setup** `MVP` — HTML/CSS + Supabase auth, domain, hosting on Vercel.
- [ ] **User auth** `MVP` — Sign up, login, password reset. Free tier users only.
- [ ] **Word search generator** `MVP` — Input words → auto-layout grid → export as PDF (KDP-ready 8.5×11).
- [ ] **Sudoku generator** `MVP` — Easy/medium/hard difficulty. Auto-fill solution page.
- [ ] **Basic dashboard** `MVP` — List of user's generated books. Download button per book.

---

## Phase 2 — Core Generators
> **Months 3–5** · Expand to all book types. Add templates and customization.

- [ ] **Crossword generator** `Core` — Clue/answer input → auto-layout crossword grid → PDF export.
- [ ] **Journal & notebook builder** `Core` — Choose line spacing, dot grid, blank. Set margins for KDP bleed.
- [ ] **Coloring page generator** `Core` — Upload or pick from preset line-art. Package into PDF book.
- [ ] **Kids activity book** `Core` — Combine mazes, connect-the-dots, and tracing in one book.
- [ ] **Cover designer** `Core` — Drag-and-drop cover builder. KDP cover template sizes built-in.
- [ ] **Template library** `Core` — 20+ starter templates per book type. One-click apply.

---

## Phase 3 — Monetization
> **Months 6–7** · Turn traffic into revenue. Launch subscriptions and premium features.

- [ ] **Subscription tiers** `Growth` — Free (3 books/mo), Pro ($9/mo unlimited), Team ($29/mo).
- [ ] **Stripe integration** `Growth` — Payments, upgrade/downgrade, invoice emails.
- [ ] **Bulk export** `Growth` — Download all books as ZIP. Pro feature.
- [ ] **KDP uploader helper** `Growth` — Checklist + guide to submit directly to Amazon KDP.
- [ ] **Niche keyword tool** `Growth` — Search Amazon BSR data to find low-competition niches.

---
## Phase 4 — Growth & Scale
> **Months 8–9** · Compete head-on with Book Bolt. Add AI and community features.

- [ ] **AI prompt-to-book** `Growth` — Type a theme → AI generates full word list, clues, or content.
- [ ] **Interior marketplace** `Growth` — Sell/share interiors. Creators earn commission.
- [ ] **Puzzle pack bundles** `Growth` — Seasonal bundles (Christmas, Halloween) ready to publish.
- [ ] **Analytics dashboard** `Growth` — Track which books you've published and estimated royalties.

---

## Notes
- Check off items with `- [x]` as you complete them
- Tags: `MVP` = must ship · `Core` = core feature · `Growth` = revenue driver
