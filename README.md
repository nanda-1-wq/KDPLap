# KDP Lab

KDP Lab is being rebuilt as an AI studio for nonfiction books. It will help you validate a topic, plan the book, and write it chapter by chapter. The old low-content features (puzzle books, journals, planners) are archived, and the notes below describe that archived version.

> Live site: [https://nanda-1-wq.github.io/KDPLap/](https://nanda-1-wq.github.io/KDPLap/)

---

## What is KDP Lab?

KDP Lab is a SaaS platform that lets anyone — without design or technical skills — generate puzzle books, journals, planners, coloring books, and activity books, then export them as KDP-ready PDFs and publish directly to Amazon Kindle Direct Publishing.

Currently in **open beta — free to use.**

---

## Features

- **Puzzle Generator** — word search, sudoku, crossword with adjustable difficulty and auto-generated solution pages
- **Journal & Notebook Builder** — lined, dot grid, blank, and graph pages with KDP bleed-ready margins
- **Planner Builder** — daily, weekly, and monthly planner layouts
- **Cover Designer** — drag-and-drop cover builder with KDP template sizes built in
- **Coloring Pages** — line-art collections sized for print
- **Kids Activity Books** — mazes, connect-the-dots, tracing pages
- **Niche Keyword Tool** — find low-competition niches using Amazon BSR data
- **PDF Export** — KDP-ready 8.5×11 PDFs with bleed and correct margins
- **KDP Publishing Guide** — step-by-step checklist to submit on Amazon

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML + CSS + JavaScript |
| Auth & DB | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | GitHub Pages (landing) · Vercel (app) |
| Payments | Stripe (planned) |

---

## Project Structure

```
KDPLAP/
├── index.html                    # Root redirect → landing/
├── landing/
│   ├── index.html                # Marketing landing page
│   ├── css/styles.css            # Design tokens + all components
│   └── js/main.js                # Scroll, nav, theme interactions
├── KDP Lab Design System/
│   ├── README.md                 # Full design system docs
│   ├── colors_and_type.css       # CSS custom properties / tokens
│   ├── assets/                   # Logo SVGs
│   ├── fonts/                    # JetBrains Mono variable font
│   ├── preview/                  # HTML previews for colors, type, components
│   └── ui_kits/web_app/          # React component kit (Nav, Hero, Dashboard, etc.)
├── kdplapRoadMap/                # Product roadmap
├── KDP referance/                # Competitor & inspiration screenshots
└── Inspriations/                 # Design inspiration assets
```

---

## Design System

The `KDP Lab Design System/` folder contains the full visual language for the project:

- **Colors:** violet-based palette (`#7C3AED` primary) with full dark mode support
- **Typography:** JetBrains Mono (headings) + DM Sans (body)
- **Components:** buttons, cards, nav, badges, inputs — all previewed in `preview/`
- **UI Kit:** React components in `ui_kits/web_app/` (Hero, Nav, Dashboard, Features, Generator)

---

## Roadmap

| Phase | Status |
|---|---|
| Landing page + design system | Done |
| Core generators (puzzle, journal, planner) | In progress |
| Cover designer | Planned |
| Keyword tool + niche research | Planned |
| Stripe billing (Free / Pro $9/mo / Team $29/mo) | Planned |

See [`kdplapRoadMap/`](./kdplapRoadMap/) for the full roadmap.

---

## How to run the tests

From the repo root. No test touches the live project.

```sh
deno test --allow-read=supabase/functions/generate supabase/functions/generate/   # Edge Function
deno test --allow-read tests/                                                      # browser helpers, limits parity
supabase/tests/sql/run.sh                                                          # database (local Postgres)
tests/browser/run.sh title t1.js                                                   # browser (mocked, port 5500)
```

Details, suites, and setup: [tests/README.md](tests/README.md).

## Status

Beta — all features free, no credit card required.  
&copy; 2026 KDP Lab. All rights reserved.
