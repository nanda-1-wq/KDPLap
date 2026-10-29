# Rename to NicheInk: live check on nicheink.com (STOP 4)

Date: 2026-10-29. `main` at `02758b8` (GitHub's CNAME commit after 3306bce). generate v25 is live. Plan: `docs/reviews/2026-10-29-rename-nicheink-plan.md`, section 11.

- **Account:** test account only, user `1e117c74-49db-4c1e-bee6-6c324c2ecae4`.
- **Sign-in:** a new in-memory browser session (`kdp-live`) with no saved session. The values from `.env.test` were passed by the shell into the page. They were never printed, and the command output was sent to `/dev/null`. The session was closed after the check.
- **Data reads:** through the page's own signed-in client (RLS, as the test user). No Supabase CLI.
- **Privacy:** the Settings shot has the email field masked. No other shot shows an "@".
- **Skipped:** steps 6 (Google sign-in, owner) and 7 (password reset email), as asked.

## Results
| Step | Check | Result | Notes |
|---|---|---|---|
| 1 | http, www and github.io end at https://nicheink.com, path kept | **Pass** | `http://nicheink.com/login.html`, `https://www.nicheink.com/login.html` and `http://www.nicheink.com/app/dashboard.html` each take 1 redirect. `https://nanda-1-wq.github.io/KDPLap/login.html` takes 2 (301 to `http://nicheink.com/login.html`, then https). All end on the same path over https, status 200. |
| 1 | Certificate | **Pass** | Let's Encrypt (YR1), CN nicheink.com, SAN nicheink.com and www.nicheink.com, valid until Jan 27, 2027. Verify result 0. |
| 2 | Landing, light, 1440 | **Pass** | `/` sends you to `/landing/index.html`. Title "NicheInk · An AI studio for nonfiction books". Wordmark NicheInk ("Niche" #14213D, "Ink" #2E6AE6), chip IN EARLY TESTING, the new lead and footer. The X link goes to x.com/3Desso. Favicon and robots.txt return 200. |
| 2 | Landing, dark and 390 | **Pass** | Dark: background #0C1424, "Niche" white, "Ink" #7FA6F2. At 390: 18 px wordmark, no sideways scroll. |
| 3 | Sign in with the test account | **Pass** | Lands on `https://nicheink.com/app/dashboard.html`. This is the first sign-in on the new origin, as expected. |
| 3 | Books and sidebar | **Pass** | Title "Books · NicheInk". Wordmark NicheInk in navy and blue, link "NicheInk, go to Books", label PUZZLE TOOLS. The 4 test books are listed. No "@" on the page. |
| 4 | One Improve "Shorten" from nicheink.com | **Pass** | Book `4e2dde85` "Somatic Healing for Anxiety", section 7.1 (shown as 6.1). The sentence "The day's demands stop, … finally has space to be felt." went from 22 to 16 words. The POST to generate carried `Origin: https://nicheink.com` and got 200 with `access-control-allow-origin: https://nicheink.com`. The preflight is not visible to the page, but the call would have been blocked without it. |
| 4 | ai_usage row | **Pass** | **id 335**: section_improve, claude-sonnet-5-5, 3,364 in / 38 out, status ok, counted, 2026-10-29 18:58:53 UTC, book 4e2dde85. It is the only new row for this user (the one before was 301). Cost: about **$0.007**. |
| 4 | The section afterwards | **Pass** | The suggestion was **rejected**, not accepted, so nothing needed restoring. 7.1 is still on v3 (`b6450f3a`, 307 words), with 3 versions, no draft, status Draft, and the original sentence in the editor. |
| 5 | Export DOCX | **Pass** | From the Books card menu. File `somatic-healing-for-anxiety.docx` (34 KB). `docProps/core.xml`: `dc:creator` Elena Vance (the pen name), `dc:title` Somatic Healing for Anxiety. The export is recorded, so the card now shows a fresh "DOCX exported". |
| 5 | Settings | **Pass** | Title "Settings · NicheInk". "MONTHLY LIMIT 2,000,000 · Set by NicheInk. Read only." |
| 8 | Sign out, then the guard | **Pass** | Log out goes to `https://nicheink.com/login.html`, and the session token is gone. Opening `/app/dashboard.html` sends you to `login.html` ("Sign in · NicheInk"). |
| 6, 7 | Google sign-in, password reset | Skipped | The owner does these. |

All checked steps pass. No bug was found.

## Notes
- github.io redirects first to `http://nicheink.com`, then GitHub sends you to https: 2 hops, same end. The site sends no HSTS header. Neither is a problem; both are how GitHub Pages works.
- The test book changed in two ways, both expected: one unused Shorten suggestion is stored (as for any rejected suggestion), and the export record updates the card badge.
- Next (plan section 6, step 7): the owner gives the old Site URL, then changes it to `https://nicheink.com` and updates the Google branding. The github.io origin can be removed no earlier than 14 days after the switch, in v26.

## Screenshots (this folder)
| File | Step |
|---|---|
| `2-landing-1440.png`, `2-landing-1440-dark.png` | 2, desktop light and dark |
| `2-landing-390.png`, `2-landing-390-dark.png` | 2, phone light and dark |
| `3-books-1440.png`, `3-sidebar-1440.png` | 3, Books and the sidebar |
| `4-shorten-result-1440.png` | 4, the Shorten result before Reject |
| `5-export-done-1440.png`, `5-settings-1440.png` | 5, export done; Settings (email masked) |
| `8-signed-out-login-1440.png` | 8, signed out, sent to Sign in |
