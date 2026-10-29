# Rename KDP Lab to NicheInk: plan

Date: 2026-10-29 · Branch: `claude/rename-nicheink` (from main 5c5703c) · Status: **STOP 1, plan only. Owner answers added (section 14b).**

## Context
v1 is done (roadmap 5c5703c). The next item on the roadmap is the rename to NicheInk on nicheink.com, which the owner already owns. After that, v2 starts with 09 Cover. The rename has four parts: the name the user sees, the logo wordmark, the custom domain (the site moves from `/KDPLap/` to the domain root), and the outside settings in Supabase, Google and GitHub that depend on the address.

## 0. Summary
- 18 files show the name to the user: about 50 lines in all. Every path in the app is relative, so **nothing in the code breaks when the site moves to the root**. The local test server already serves the repo at `/`.
- Only two things build full URLs: Google sign-in (`js/auth.js:65`) and the password reset (`js/supabase.js:108`). Both use the current address, so they follow the new domain without a code change. The Supabase redirect list must allow them.
- generate needs one change: two origins added to `ALLOWED_ORIGINS` (v25). The AI prompts say "Amazon KDP" (the market), never our name, so no prompt changes.
- nicheink.com is still on Namecheap parking records. You replace them with GitHub's records (section 3).
- Side finding: the 48 private screenshots in `KDP referance/` are tracked in git and served publicly (checked: HTTP 200). On the new domain they would be at `nicheink.com/KDP%20referance/...` (section 13, Q5).

## 1. User-facing name: every place, with line counts

### Change (user sees it or it is in the output)
| File | Lines | Where |
|---|---|---|
| `index.html` | 2 | `<title>` (6), redirect link text (9) |
| `login.html` | 5 | title 7, logo aria-label 22, wordmark 24, "New to KDP Lab?" 69, legal 73 |
| `signup.html` | 5 | title 7, aria-label 22, wordmark 24, "Free while KDP Lab is in early testing." 32, legal 101 |
| `forgot-password.html` | 4 | title 7, aria-label 22, wordmark 24, legal 54 |
| `reset-password.html` | 4 | title 7, aria-label 18, wordmark 20, legal 85 |
| `landing/index.html` | 9 | title 7, meta description 8, logo aria-label 21, wordmark 27, status chip 43 (Q4), lead 45, features aria-label 88, © 113, legal 114 |
| `app/book.html`, `dashboard.html`, `pen-name.html`, `pen-names.html`, `settings.html`, `topic-lab.html`, `topic.html` | 1 each (7) | `<title>` "… · KDP Lab" |
| `js/shell.js` | 3 | sidebar logo aria-label 55, wordmark 57, "KDP TOOLS" 62 (Q3) |
| `js/book.js` | 3 | `document.title` 278, 320, 347 |
| `js/pen-name.js` | 1 | `document.title` 224 |
| `js/topic.js` | 1 | `document.title` 220 |
| `js/book-outline.js` | 1 | "Checked by KDP Lab" 613 |
| `js/settings.js` | 2 | "Set by KDP Lab. Read only." 245, and the comment at 14 that quotes it |
| `js/ui.js` | 1 | network error "We couldn't reach KDP Lab." 45 |
| `js/write-improve.js` | 1 | network error 601 |
| `js/export-build.js` | 1 | DOCX metadata `creator: pen name \|\| 'KDP Lab'` 202. This is the only name in the export. The title comes from the book, and Markdown has no name in it. |
| `css/app.css`, `css/auth.css`, `landing/landing.css` | 2 each | wordmark color rules (only if Q7 renames the classes) |
| `design/design-tokens.css` | 2 | comments only: line 1 and `"LAB"` at 62 |
| Parked, approved (Q2, strings only): `app/generators/sudoku.html` | 2 | `<title>` 6, PDF footer "Generated with KDP Lab" 752 |
| Parked, approved (Q2, strings only): `app/generators/word-search.html` | 1 | `<title>` 6 |

Docs, not UI: `README.md` (title, live-site line 5, "formerly KDP Lab"), `CLAUDE.md` (title, product line, the `KDP referance/` row in section 9), roadmap title. These change at the end (step 8).

Auth email templates: **not in the repo** (there is no `supabase/templates/` or `config.toml`). They live in the Supabase dashboard. You check them by hand (section 4).

### Keep (internal), and why
- `window.kdp`, `kdpShell`, `kdpWords`, `kdpExportBuild`, `kdpMarkdown` and the other `kdp*` globals: code names that users never see. Renaming would touch about 45 files and every test for no user gain.
- Storage keys `kdp-name:<id>` and `kdp.notice`, and the CSS highlight `kdp-improve`: these are internal. Changing them only drops a per-tab cache.
- CSS classes, except the 3 wordmark pairs (Q7).
- Repo name `KDPLap`, folder `kdplapRoadMap/`, folder `KDP Lab Design System/`. `app/editor.html` loads a stylesheet from that folder, so renaming it would break the link.
- The "KDP Lab — …" header comments in about 45 JS and CSS files and in the 3 generate files (Q9). Comments are not UI. Keeping them keeps the v25 diff to the CORS list only.
- Migration headers in 0001 to 0026: these migrations are applied. Never edit them.
- `kdplab-pg` (local Postgres temp dir in `supabase/tests/sql/reset.sh`, `tests/README.md`).
- `app/editor.html` (old low-content editor, not linked from anywhere) and its `.kdplab.json` file name: parked code.
- `design/screens/*.html` and `*.png` (about 60 show the old logo or title): approved history. One new screen and a README note cover the change (section 2).
- `docs/reviews/*`: history.
- Every "KDP" that means Amazon's service stays. Examples: "KDP allows 200 characters", "For KDP's AI question", "KDP content guidelines", "Import from Amazon page", and the prompts' "sold on Amazon KDP".

## 2. Logo: DESIGN GAP
The mark (open book with a pen nib cut) stays as it is, and it suits "Ink". `design/logo/*.svg` and the favicon are mark-only, so they don't change. Only the text next to the mark changes. Brand navy #14213D and blue #2E6AE6 stay, and only on the logo, the landing page and the auth pages. Today's wordmark is Plex Sans 700, 19px (18px on the mobile landing), `KDP` in navy and `LAB` in blue.

| Option | Look | For | Against |
|---|---|---|---|
| **A (recommended)** | `Niche` navy + `Ink` blue, mixed case, Plex Sans 700, same size and spacing | Same recipe as today, so only the case changes. The capital I and the color both show the two words. Reads well at 18 px. Uses the existing tokens in light and dark. | Less "blocky" than today's all caps |
| B | `NICHE` navy + `INK` blue, all caps, Plex Sans 700, letter-spacing about 0.04em | Closest to KDP\|LAB | 8 capitals read as one block ("NICHEINK"). About 35% wider. Weaker at 18 px on mobile. |
| C | `niche` navy (Plex Sans 600) + `ink` blue (Source Serif 4 italic 600), lowercase | Ties "ink" to writing and to the nib | **Conflicts with CLAUDE.md §7** (Source Serif 4 is for editor text only), so it needs your exception. Also adds a font download to the auth and landing pages. |

Design file (before any code): `design/screens/40-nicheink-wordmark.html` (+ `.png`).
- Part 1: options A, B and C side by side at 19 px and 18 px, on light and on navy. **STOP 2: you pick one.**
- Part 2, the chosen option in every place: the app sidebar (260 px wide, gray UI), the auth page header in light and dark, and the landing header on desktop and at 390 px, in light and dark. Also the logo link's focus ring (2 px ink outline, 2 px offset) and a 200% zoom check, where the wordmark must not wrap or clip. It also shows the sidebar Tools label (Q3) and the new landing chip and lead (Q4).
- The logo has no empty, loading or error state. The name has no locked or needs-review state.
- `design/README.md` gets one line: "Screens 01 to 39 show the old name KDP LAB. The name is now NicheInk; see 40."

## 3. Domain: nicheink.com on GitHub Pages

### Today (checked 2026-10-29)
- The repo `nanda-1-wq/KDPLap` is public. Pages deploys from the `main` branch root (no workflow, no CNAME). The site is `https://nanda-1-wq.github.io/KDPLap/` (HTTP 200).
- DNS is at Namecheap (`dns1/dns2.registrar-servers.com`). The apex A record is `192.64.119.128` (Namecheap parking). `www` is a CNAME to `parkingpage.namecheap.com`. There are no AAAA and no CAA records.

### DNS records you add (Namecheap → Domain List → nicheink.com → Advanced DNS)
First **delete** the parking records: the `@` A record (or the "URL Redirect Record") and the `www` CNAME to `parkingpage.namecheap.com`. Then add:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | nanda-1-wq.github.io. |
| TXT | `_github-pages-challenge-nanda-1-wq` | the value GitHub shows (domain verification, below) |

- No wildcard `*` record. If you ever add a CAA record, it must allow `letsencrypt.org`.
- MX and email records are not affected.

### GitHub steps (you do them)
1. **Verify the domain first.** Go to github.com → your account Settings → Pages → Add a domain → `nicheink.com`, then add the TXT record above. This stops anyone else from claiming the domain on Pages.
2. Repo Settings → Pages → Custom domain → `nicheink.com` → Save. GitHub commits the `CNAME` file (`nicheink.com`) to `main` for you. **We do not commit CNAME on our branch**, because an early CNAME would send the github.io site to a domain that doesn't work yet.
3. Wait for "DNS check successful" and the certificate. Then tick **Enforce HTTPS**.
4. With `www` pointing at `nanda-1-wq.github.io`, GitHub redirects `www` to the apex and covers both with the certificate.
5. From step 2 on, `https://nanda-1-wq.github.io/KDPLap/*` redirects to `https://nicheink.com/*`, path kept. The redirect is permanent, so browsers may remember it.

### Move from /KDPLap/ to the root: what I checked
- **Absolute paths:** none. No `href="/…"`, `src="/…"`, `url(/…)` or `'/app…'` in any served HTML, JS or CSS. No `<base href>`. Every link is relative: `../login.html`, `${root}app/…` (with `root` '../' or ''), `landing/index.html`, `../design/…`.
- **Hard-coded URLs:** only `README.md:5` (live-site link) and the generate CORS list (`supabase/functions/generate/lib/limits.ts:233`).
- **Places that build links:**
  - Google sign-in: `js/auth.js:65` resolves `app/dashboard.html` against the page. On the new domain that is `https://nicheink.com/app/dashboard.html`.
  - Password reset: `js/supabase.js:108` resolves `reset-password.html`. From Settings, `js/settings.js` passes `../reset-password.html`. Both give `https://nicheink.com/reset-password.html`.
  - Sign-up confirmation and resend (`signUp`, `resend`) pass no redirect, so Supabase uses the **Site URL**. Sign-ups are off.
  - Export: built in the browser as a Blob, so it has no URLs. Its only link is the external KDP guidelines page.
  - Landing: external social links plus relative CSS and favicon. It has no link to sign in (unchanged).
  - Redirect pages: `index.html` uses a relative meta refresh to `landing/index.html`, which works at the root.
- **What does change: the origin.** The Supabase session lives in localStorage per origin, so you sign in once on nicheink.com. Drafts are saved in the database, not the browser, so nothing is lost. sessionStorage is per tab anyway.
- **Already proven:** the local server (`tests/browser/serve.py`, port 5500) serves the repo at `/`. Every browser test already runs the app from a root path.
- **Keep it relative:** root-absolute paths would also work on nicheink.com, but they would break a rollback to github.io/KDPLap/. The new brand test locks this in (section 10).

## 4. Supabase and Google: exact list (you do these by hand)

### Supabase → Authentication → URL Configuration
- **Redirect URLs, add now** (keep every old entry, including `https://nanda-1-wq.github.io/KDPLap/…` and the 127.0.0.1:5500 and 5501 entries):
  - `https://nicheink.com/app/dashboard.html` (Google sign-in return)
  - `https://nicheink.com/reset-password.html` (password reset)
  - `www` entries are not needed: GitHub sends `www` to the apex before any page code runs.
- **Site URL:** first write down what it is today (I expect `https://nanda-1-wq.github.io/KDPLap/`). Change it to `https://nicheink.com` **only at step 7**, after the live check passes.
- **Email templates** (Authentication → Emails): look for "KDP Lab" in Confirm sign up, Reset password, Magic link and Change email. The defaults don't name the app. If you customized one, change it to NicheInk. The sender stays Supabase's built-in mailer. Custom SMTP on nicheink.com waits for v3 (Q10).

### Google Cloud Console → APIs & Services
- **Credentials → OAuth 2.0 Client ID (Web, the one Supabase uses) → Authorized JavaScript origins, add:** `https://nicheink.com` and `https://www.nicheink.com`. Keep `https://nanda-1-wq.github.io`. Origins have no path. The redirect flow does not strictly need these, but they do no harm.
- **Authorized redirect URIs: no change.** It stays `https://hmtxnbgfzwqawfulwwrg.supabase.co/auth/v1/callback`.
- **OAuth consent screen / Branding (step 7):** App name `NicheInk`, App home page `https://nicheink.com`, Authorized domains: add `nicheink.com` (keep `supabase.co`). If you have privacy or terms links on github.io, update them. Google may ask you to prove `nicheink.com` in Search Console (one more TXT record). Don't upload a logo now, because that starts Google's brand review. If Google asks for review after the name change, keep the old name for now: sign-in still works.

## 5. generate v25 (stops for review; Claude chat deploys after you say "deploy")
- `supabase/functions/generate/lib/limits.ts:233` adds `"https://nicheink.com"` and `"https://www.nicheink.com"` to `ALLOWED_ORIGINS`. It keeps `"https://nanda-1-wq.github.io"` and the four local origins. Nothing else in generate changes.
- `lib.test.ts:53-63`: update the expected list and the test name "(Pages, nicheink.com, 5500, 5501)". Add rejected origins: `http://nicheink.com`, `https://nicheink.com.evil.example`, `https://evil-nicheink.com`, `https://app.nicheink.com`, `https://nicheink.com/`.
- `handler.test.ts`: OPTIONS and POST from `https://nicheink.com` get `access-control-allow-origin: https://nicheink.com`.
- Snapshots: no change expected, because `ORIGIN` in `test_fakes.ts` stays `http://127.0.0.1:5500`. If any snapshot moves, stop and explain.
- Run `deno check` and `deno test --allow-read=supabase/functions/generate supabase/functions/generate/`.
- v25 must be live **before** the domain switch (step 3). It only adds origins, so github.io users see no change.

## 6. Order of the switch, rollback, and when to drop github.io

| Step | Who | What | Effect on a signed-in user |
|---|---|---|---|
| 1 | Claude | Design 40 → STOP 2 (you pick) | none |
| 2 | Claude | Code on the branch: name, logo, tests, generate CORS → STOP 3 review | none (branch only) |
| 3 | Claude chat | Deploy generate v25 after you say "deploy" | none (only adds origins) |
| 4 | You | Supabase redirect URLs (add), Google JS origins (add), Namecheap DNS, GitHub domain verification. Wait until `dig nicheink.com` shows the 4 GitHub IPs. | none (site still on github.io) |
| 5 | Claude, after your OK | Merge the rename to `main` (and the Q5 untrack commit). Check it on github.io/KDPLap. | sees the new name; stays signed in |
| 6 | You | Set the custom domain in repo Settings → Pages. Wait for the certificate, then Enforce HTTPS. Don't use the app in this window (usually minutes, at most a few hours). | the next page load goes to nicheink.com and asks for **one sign-in**. A tab that is already open keeps working: Supabase REST allows any origin, and v25 still allows github.io. |
| 7 | Claude + you | Live check on nicheink.com (section 11) → STOP 4. Then you change the Site URL to `https://nicheink.com` and update the Google branding. | none |
| 8 | Claude | `CLAUDE.md`, `README.md`, roadmap, memory | none |
| 9 | Later | Drop the github.io origin (below) | none |

**Rollback**
- The rename itself is wrong: `git revert` the merge on `main`. Pages redeploys in about a minute, on whichever address is live. It doesn't touch the domain.
- The domain or certificate fails: in Settings → Pages, remove the custom domain (GitHub deletes CNAME). The site is back at github.io/KDPLap/. The old origin is still in CORS and in the Supabase and Google lists, so everything works there. A browser that remembered the permanent redirect needs its cache cleared. Today that means only your browsers and the test runner.
- Site URL already changed: set it back to the value you wrote down in section 4.
- generate: v25 only adds origins, so it never needs a rollback. v24 is in git if ever needed.
- Nothing old is removed until the rollback window ends.

**When can github.io be removed?** After step 6, github.io serves only redirects. Only a tab opened before the switch can still call generate from the old origin. Remove `https://nanda-1-wq.github.io` from generate, the old Supabase redirect URLs and the old Google origin when all of these hold:
1. at least 14 days have passed since the switch with no rollback;
2. the generate Edge logs show no requests with a github.io origin or referer for 7 days;
3. no password reset was sent before the switch that is still unused (they expire within 24 h anyway).

Do it in the next generate version that v2 needs anyway (v26), so it doesn't need a deploy of its own. Removing it also stops other `nanda-1-wq.github.io` project sites from passing CORS. The local 5500 and 5501 origins stay.

## 7. Text now that the name has no "KDP"
- **Keep the disclaimer**, because the app names KDP and Amazon on many screens:
  - Auth pages: "KDP is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon."
  - Landing: "Kindle Direct Publishing (KDP) is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon."
- **Sidebar "KDP TOOLS"** (Word Search, Sudoku): next to a logo without "KDP", it can read like Amazon's own tools. Recommend **"PUZZLE TOOLS"**. Then update the roadmap v4 line "return under KDP Tools" to match (Q3).
- **Landing chip and lead:** "BEING REBUILT" and "KDP Lab is being rebuilt…" make no sense for a new name. Recommend:
  - chip "IN EARLY TESTING", which matches the sign-up line;
  - lead "NicheInk helps you validate a topic, plan the book, and write it chapter by chapter, in your own voice. It launches after testing on real books.";
  - meta description "NicheInk is an AI studio that helps you validate a topic, plan the book, and write nonfiction chapter by chapter, in your own voice." (Q4)
- **"for Amazon KDP" in the copy:** recommend **no new KDP line now**. The name no longer says what the app is for, so the v3 landing page should state it, for example "for Amazon KDP authors". With the disclaimer, that use is fine. "Ready for KDP" would overclaim until v2 builds KDP-ready files.
- Simple swaps: "New to NicheInk?", "Free while NicheInk is in early testing.", "Checked by NicheInk", "Set by NicheInk. Read only.", "We couldn't reach NicheInk. …", "© 2026 NicheInk · Built by Adnan", and the titles "Books · NicheInk".
- Screen readers: check how VoiceOver reads "NicheInk" in the aria-labels during the design check. If it slurs, say so at STOP 2. Don't change the spelling.

## 8. Files to change
- Pages: `index.html`, `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html`, `landing/index.html`, the 7 `app/*.html` titles.
- JS: `js/shell.js`, `js/book.js`, `js/pen-name.js`, `js/topic.js`, `js/book-outline.js`, `js/settings.js`, `js/ui.js`, `js/write-improve.js`, `js/export-build.js`.
- CSS: `css/app.css`, `css/auth.css`, `landing/landing.css` (wordmark only), `design/design-tokens.css` (comments).
- Parked (Q2): `app/generators/sudoku.html`, `app/generators/word-search.html`.
- generate: `lib/limits.ts`, `lib.test.ts`, `handler.test.ts`.
- Design: new `design/screens/40-nicheink-wordmark.html` + `.png`, and `design/README.md`.
- New: `robots.txt` (Q6), `tests/brand-name.test.js`, `tests/browser/books/t-brand.js`.
- Tests updated: see section 10.
- Docs at the end: `CLAUDE.md`, `README.md`, `kdplapRoadMap/kdp_roadmap_md.md`, `tests/README.md` (new test commands).
- Not by us: `CNAME`. GitHub writes it in step 6.

## 9. Design states (DESIGN GAP summary)
Design 40 covers the wordmark in the sidebar, auth (light and dark) and landing (desktop and 390 px, light and dark). It also covers the focus ring, 200% zoom with no wrap or clip in the 260 px sidebar, the Tools label (Q3) and the landing chip and lead (Q4). No other screen changes its layout. The name has no empty, loading, error, locked or needs-review state.

## 10. Tests
**Add**
- `tests/brand-name.test.js` (Deno, `--allow-read`):
  - After removing comments, no served page or `js/*.js` file contains "KDP Lab", "KDP LAB" or the `KDP</span><span…>LAB` wordmark. The two generators are in the scan (Q2 yes). `app/editor.html` stays out (not linked, unchanged).
  - Every page `<title>` ends in "NicheInk".
  - The 4 auth pages and the landing keep "independent and not affiliated with Amazon" with NicheInk in the line.
  - No served HTML, JS or CSS contains `/KDPLap/`, `github.io`, `<base`, or a root-absolute `href="/`, `src="/` or `url(/`, so a rollback to github.io/KDPLap/ keeps working.
  - If `CNAME` exists, it is exactly `nicheink.com`.
- `tests/export-build.test.js`: with no pen name, `docProps/core.xml` has `dc:creator` NicheInk. With a pen name, it has the pen name. The test already unzips the DOCX at line 49.
- `tests/browser/books/t-brand.js` (mocked, same harness as `t-badge.js`): the sidebar wordmark reads "NicheInk", the aria-label is "NicheInk, go to Books", the title is "Books · NicheInk", the Tools label matches Q3, and the screenshots are taken at 1280 and 390.
- generate: the `lib.test.ts` and `handler.test.ts` cases in section 5.

**Update** (string changes only)
- `tests/browser/outline/t1.js:39` and `outline/t-check.js:54` ("Checked by NicheInk")
- `tests/browser/positioning/t2.js:70`, `write/t-queue.js:168` and `write/t-improve.js:634` (network message)
- `tests/browser/settings/t-settings.js:39` ("Set by NicheInk")

**Run before STOP 3:** all Deno helper tests (`tests/README.md` list), generate `deno check` + `deno test`, and every browser suite through `tests/browser/run.sh`. Known flake: `write/t-chapter` "done" fails about 2 in 5 runs on main too.

## 11. Live check (test account, after step 6)
1. `curl -I` on `http://nicheink.com`, `https://www.nicheink.com` and `https://nanda-1-wq.github.io/KDPLap/login.html`. Each must end at `https://nicheink.com/…` with the path kept. The certificate is valid.
2. `https://nicheink.com/` opens the landing page: new wordmark, title, footer disclaimer, favicon, light and dark, 390 px.
3. Sign in on `/login.html` with the test account (one sign-in; the credentials are piped to /dev/null). You land on Books: sidebar wordmark, "PUZZLE TOOLS" (if Q3), title "Books · NicheInk".
4. Open the test book → 06 Write → one Improve "Shorten" on one sentence. This proves generate CORS from nicheink.com. Check that one `ai_usage` row and the Edge log show origin `https://nicheink.com`.
5. Export DOCX. In the file properties, Author is the pen name. Settings shows "Set by NicheInk. Read only."
6. You do this yourself: Google sign-in on your own account from nicheink.com lands on `https://nicheink.com/app/dashboard.html`, not on the Site URL.
7. Optional, uses 1 of the 2 emails per hour: Forgot password from nicheink.com. The email link opens `https://nicheink.com/reset-password.html`. You decide whether to run it.
8. Sign out, then confirm `/app/dashboard.html` sends you to `login.html`.
9. Results and screenshots go in `docs/reviews/rename-live/results.md` → STOP 4.

## 12. Cost
- Domain: already owned. GitHub Pages and its certificate: free (public repo). Supabase: no plan change; the v25 deploy is free.
- AI: one small Improve call in the live check, about $0.01 to $0.05. Earlier live checks cost $0.049.
- Total: under $0.10.

## 13. Side findings (not part of the rename, but the domain makes them more visible)
- **`KDP referance/` is public.** The `.gitignore` lists it, but 48 files were committed before that line was added. `https://nanda-1-wq.github.io/KDPLap/KDP%20referance/…png` returns 200. CLAUDE.md §9 says the folder is "Ignored by git", which is not true today. Proposal (Q5): `git rm -r --cached "KDP referance"` in its own commit before step 6. The files stay on your disk. They stay in git history, and I don't propose rewriting history.
- **Pages serves the whole repo**: `docs/reviews/`, `tests/`, `supabase/`, `design/`, `landing/archive/`. I found no secrets. `.env` and `.env.test` are ignored, and `.mcp.json` only holds the public project ref. With a custom domain, a root `robots.txt` becomes possible, which can ask search engines to skip `/docs/`, `/tests/`, `/supabase/`, `/design/`, `/app/`, `/landing/archive/` and `/KDP%20referance/` (Q6). It hides nothing; it only asks crawlers.
- The v3 roadmap item "name and trademark check" still stands. A free search for "NicheInk" on USPTO, EUIPO and WIPO before spending on brand assets is worth doing.

## 14. Questions for you
1. **Wordmark:** A, B or C? I recommend A (`Niche` navy + `Ink` blue, mixed case). C needs a font exception to CLAUDE.md §7.
2. **Parked generators:** CLAUDE.md says not to change them unless asked. Should I change their 3 visible strings (two titles and the PDF footer "Generated with NicheInk"), with no logic change? I recommend yes. I'd leave `app/editor.html` (not linked) as it is.
3. **Sidebar "KDP TOOLS":** rename to "PUZZLE TOOLS" (recommended), use just "TOOLS", or keep it?
4. **Landing:** use the chip "IN EARLY TESTING" and the new lead and description from section 7 (recommended), or only swap the name?
5. **`KDP referance/`:** stop tracking it (files stay on disk) in its own commit before the switch? I recommend yes.
6. **`robots.txt`** at the new root? I recommend yes.
7. **Wordmark classes:** rename `.kdp`/`.lab` and `.wordmark-kdp`/`.wordmark-lab` to `.niche`/`.ink`? Those lines are rewritten anyway, and the old names would mislead. I recommend yes. Everything else internal stays.
8. **Header comments** "KDP Lab — …" in about 45 files: keep them (recommended) or update them in one mechanical commit later?
9. **Site URL:** what is it today? Please confirm it before step 7.
10. **Custom SMTP** on nicheink.com: keep it for v3 as planned (recommended), or do it now?

## 14b. Owner answers (2026-10-29, after Claude chat reviewed the plan)
| Q | Answer | What it means for the plan |
|---|---|---|
| 1 | **A** | `Niche` navy + `Ink` blue, mixed case, Plex Sans 700. Design 40 still shows A, B and C side by side for the record, but part 2 is drawn with A only. |
| 2 | **Yes**, the 3 visible strings only, no logic | Both generator titles and the sudoku PDF footer "Generated with NicheInk". Their header comments stay (Q8). `app/editor.html` stays as it is. |
| 3 | **PUZZLE TOOLS** | `js/shell.js:62`. Also change the roadmap v4 line "low-content generators return under KDP Tools" to "under Puzzle Tools" (step 8). |
| 4 | **Yes** | Landing chip "IN EARLY TESTING", plus the lead and meta description from section 7. |
| 5 | **Yes** | `git rm -r --cached "KDP referance"` in its own commit, merged before step 6. Fix the CLAUDE.md §9 row in step 8. |
| 6 | **Yes** | Root `robots.txt` with the paths from section 13. |
| 7 | **Yes** | Rename `.kdp`/`.lab` to `.niche`/`.ink` (sidebar and auth) and `.wordmark-kdp`/`.wordmark-lab` to `.wordmark-niche`/`.wordmark-ink` (landing). Every other internal name stays. |
| 8 | **Keep the comments** | No mechanical comment commit. The generate v25 diff stays the CORS list and its tests only. |
| 9 | The owner reads the Site URL in the dashboard and tells Claude **before step 7** | Step 7 waits for that value, so the rollback has the exact old URL. |
| 10 | **v3** | No SMTP work in this task. |
| + | **The repo name stays KDPLap** | So do `kdplapRoadMap/` and the local folder. Only the GitHub Pages address changes. |

## 15. STOPs
- STOP 1: this plan (now).
- STOP 2: design 40 (wordmark A chosen in 14b), approve the design.
- STOP 3: code and generate v25 review. You say "deploy", and Claude chat deploys.
- Your outside steps (step 4), then the merge (step 5), then the domain (step 6).
- STOP 4: live check results. Then the Site URL, the docs and the roadmap.

## Verification of this plan
Every claim above was checked on 2026-10-29 from the repo and public endpoints:
- grep over the tracked files for the name, paths, `location.*`, redirects and origins;
- `curl` on the live github.io URLs and the GitHub repo API (public, has_pages);
- `dig` on nicheink.com (Namecheap parking, no AAAA or CAA).

`.env` and `.env.test` were not opened. The Supabase CLI was not run.
