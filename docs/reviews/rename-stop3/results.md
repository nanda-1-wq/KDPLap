# Rename to NicheInk: step 2 results (STOP 3)

Date: 2026-10-29 · Branch: `claude/rename-nicheink` · Plan: `docs/reviews/2026-10-29-rename-nicheink-plan.md` · Design: `design/screens/40-nicheink-wordmark.html`

Nothing is deployed. There is no CNAME file. generate v25 waits for "deploy".

## Commits
| Commit | What |
|---|---|
| 16b319d | Stop tracking `KDP referance/` (48 files). The files stay on disk and stay ignored. |
| 660ab23 | The name, the wordmark (`.niche`/`.ink`, `.wordmark-niche`/`.wordmark-ink`, `white-space: nowrap`), PUZZLE TOOLS, the landing text, the generator strings, `robots.txt`, and the new and updated tests |
| 2be7fca | generate v25: `ALLOWED_ORIGINS` adds `https://nicheink.com` and `https://www.nicheink.com`, plus its tests |
| 6a8b318 | Roadmap: the landing page redesign after v2 (owner) |

## Suites
| Suite | Result |
|---|---|
| Deno helpers (`deno test --allow-read tests/`, 19 files, with the new `brand-name.test.js`) | 173 passed, 0 failed |
| generate `deno check` (all `.ts` files) | exit 0 |
| generate `deno test --allow-read=supabase/functions/generate supabase/functions/generate/` | 318 passed, 0 failed. Snapshots unchanged. |
| Browser, all 11 suites (58 files, `tests/browser/run.sh`) | 1,842 passed, 1 failed |

The one browser failure is the known flake on the watch list: `write/t-chapter.js`, the "done" check. On this branch the file passed fully in 1 of 4 runs. On `main` (5c5703c) the same check failed in 2 of 3 runs, so it comes from before the rename.

`brand-name.test.js` fails 3 of its 9 tests when the old `js/shell.js` is put back, so it catches the old name.

## generate diff against v24 (d220dd2)
```
 supabase/functions/generate/handler.test.ts | 13 +++++++++++++
 supabase/functions/generate/lib.test.ts     |  6 ++++--
 supabase/functions/generate/lib/limits.ts   |  2 ++
 3 files changed, 19 insertions(+), 2 deletions(-)
```
The only function change is 2 lines in `lib/limits.ts`. The rest are tests.

## Screenshots (mocked data, real fonts)
| File | What |
|---|---|
| `brand-sidebar-1440.png` | App sidebar: NicheInk, PUZZLE TOOLS |
| `brand-sidebar-focus.png` | Sidebar logo with the 2 px ink focus ring |
| `brand-sidebar-200.png` | Sidebar wordmark at 200% text: one line |
| `brand-books-1440.png` | Books page, whole window |
| `brand-signin-1440.png`, `brand-signin-1440-dark.png` | Sign in, signed out, light and dark |
| `brand-landing-1440.png`, `brand-landing-1440-dark.png` | Landing at 1440, light and dark |
| `brand-landing-390.png`, `brand-landing-390-dark.png` | Landing at 390, light and dark |
| `brand-landing-390-200.png` | Landing header at 390 with 200% text |

## Notes
- `robots.txt` blocks `/design/screens/`, not all of `/design/`. The landing page loads its tokens and favicon from `/design/`, and crawlers need them to render the page. It also blocks `/Inspriations/` (1 tracked screenshot) and `/CLAUDE`.
- `Inspriations/` holds one tracked screenshot that is publicly served, like `KDP referance/` was. I did not untrack it, because that was not asked. Say if it should go the same way.
- `app/editor.html` (not linked) keeps its old title, as planned.
- Next (plan section 6): the owner says "deploy" for generate v25. Then the owner does the outside steps (Supabase redirect URLs, Google origins, Namecheap DNS, GitHub domain verification). After that comes the merge to `main`.
