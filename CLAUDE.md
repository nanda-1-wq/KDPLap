# CLAUDE.md · NicheInk

Read this file fully before any task in this repository.

## 1. Product
NicheInk (formerly KDP Lab; the repo keeps the name `KDPLap`) is a web app that
helps one author plan, validate, and write medium- and high-content nonfiction
books for Amazon KDP, with AI assistance. Live at https://nicheink.com.
v1 is done (Oct 29, 2026); next is v2. The first user is the owner (Adnan). Other users come in v3.

v1 flow: Topic Lab (market validation) → Book Wizard steps 01 to 06 → DOCX export.
Low-content generators (Word Search, Sudoku in `app/generators/`, under "Puzzle Tools" in the sidebar) are **parked**.
Keep them working. Do not change them unless asked.

## 2. How we work (mandatory)
1. Before editing any file, explain the plan in plain words and **wait for approval**.
2. One task at a time. Finish, show the result, wait for approval, then continue.
3. Never start the next roadmap task on your own.
4. Small commits with clear messages. Never commit secrets.
5. If a request conflicts with this file, say so and ask.

## 3. Stack
| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript. No frameworks, no build step. |
| Database | Supabase PostgreSQL. SQL migrations kept in `supabase/migrations/`. |
| Auth | Supabase Auth |
| Backend | Supabase Edge Functions in TypeScript (AI calls, prompts, usage limits) |
| AI | Anthropic API, called **only** from Edge Functions |
| Export (v1) | DOCX generated in the browser |
| Hosting | GitHub Pages from `main`, custom domain https://nicheink.com. GitHub writes `CNAME`; never edit it. Keep every path relative (no `/KDPLap/`, no root-absolute paths), so a rollback to github.io still works. |

## 4. Security rules (never break)
- The Anthropic API key lives only in Supabase Edge Function secrets. Never in frontend code, never in git.
- Only the Supabase anon key may appear in frontend code.
- Every table has Row Level Security. A user reads and writes only their own rows.
- Prompt templates live server-side. The browser sends `{ stage, bookId, ... }`, never raw prompts.
- Validate and limit every Edge Function input. Return clear errors.
- Log input and output tokens for every AI call in an `ai_usage` table.
- Never run the Supabase CLI. Claude chat deploys after the owner says deploy.

## 5. AI rules
- One section or one step per AI call. Never a full book in one call.
- Every generation reads the **approved Brief and locked Positioning**. New angles not found in Brief or Research are flagged for the user ("drift check").
- The AI may quote facts only from the user's Research sources. Any number or claim without a source gets a "Verify: no source" flag.
- Bios use only facts the user entered. No invented credentials.
- A failed or stopped generation keeps the partial text as a version. A failed generation, or one stopped by the server, is not counted in usage. One stopped by the user (Stop, a closed tab or a lost connection) counts the tokens used.

## 6. Data rules
- **One source of truth** for each value. Example: trim size lives in the Brief; Export only reads it.
- **Never overwrite writing.** Every AI action or manual save creates a new version.
- Locking: Positioning can be approved and locked. Unlocking marks Title, Outline, and written chapters as "Needs review". Nothing is deleted.
- Section status: Not started → Draft → Reviewed → Final.
- Topic status: Idea → Researching → Validated → Book started, or Rejected → Archived.

## 7. Design system (mandatory)
- All styles use tokens from `design/design-tokens.css`. **No hardcoded colors, sizes, or fonts.**
- App UI is "ink on paper": grays only.
- Functional colors carry meaning only: `--danger` (errors, delete), `--success` (pass, done), `--warning` (check this). Always with an icon and a word. Small areas only.
- Filled red button only at the final destructive step. In menus, delete is red text.
- Brand navy and blue are allowed on the logo, the landing page, and the public auth pages only. Never on app buttons or cards.
- Fonts: IBM Plex Sans (UI), IBM Plex Mono (small labels), Source Serif 4 (editor text only).
- Minimum 44 px for anything clickable. Visible focus ring: 2 px ink outline, 2 px offset.
  Accepted exception: the Write editor (4 px) and the Improve menu items (2 px) draw the ring inside, because the scrolling card clips an outside ring.
- Every screen designs its states: empty, loading or generating, error with retry, locked, needs review.
- Reference screens: `design/screens/*.html` (open in a browser) and `*.png`. Match them.
- Logo files: `design/logo/`. Wordmark (design 40, 40b): "Niche" in navy + "Ink" in blue, with a
  `--wordmark-gap` margin before "Ink" (never a space), 19 px (18 px on the landing at 900 px and below).
- The name is NicheInk. Keep the Amazon disclaimer on the auth pages and the landing
  ("… NicheInk is independent and not affiliated with Amazon.").
- Do not use the words "PMA" in the UI. Say "market validation" or "market checks".

## 8. v1 screens
Books (dashboard) · New Book dialog · Delete dialog · Topic Lab · Topic detail · Add topic ·
Pen Names · Pen name detail · Book wizard shell · 01 Brief · 02 Research · 03 Positioning ·
04 Title · 05 Outline · 06 Write · Export dialog · Settings.
Steps 07 to 11 show "Coming in v2 / v3" in the book sidebar.

## 9. Repository map
| Path | Contents |
|---|---|
| `index.html`, `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html` | Public and auth pages |
| `app/` | Signed-in app pages |
| `app/generators/` | Parked low-content generators |
| `js/supabase.js` | Single Supabase client. All data access goes through it (`window.kdp`). |
| `landing/` | Current landing page (the owner redesigns it after v2) |
| `design/` | Approved design: tokens, screens (40 = the NicheInk wordmark), logo |
| `kdplapRoadMap/` | Roadmap. `kdp_roadmap_md.md` is the current plan. |
| `CNAME`, `robots.txt` | Pages custom domain (written by GitHub) and the crawler rules for the site root |
| `KDP referance/`, `Inspriations/` | Private reference screenshots. Local only: not tracked, ignored by git. Never copy from them. |

## 10. Writing style for UI text
Clear, simple words. Short sentences. Active voice. No em dashes.
