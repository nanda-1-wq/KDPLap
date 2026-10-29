# NicheInk logo at 22 px (design 40c)

Date: 2026-10-29 · Branch: `claude/logo-22` (from main 94ca628) · Status: STOP, waiting for the owner. Not merged.

## Owner request
- 22 px wordmark everywhere (sidebar, auth pages, landing desktop), 21 px on the landing at 900 px and below.
- Keep the 2 px gap and weight 700 (IBM Plex Sans has no 900; a logo font may come in v2).
- New rule for 200% text: the mark never shrinks (`flex-shrink: 0`, keeps 30 px / 28 px). If the row has no room, the logo wraps: the mark on one line, the wordmark under it (`flex-wrap: wrap`). Never a squeezed mark, never sideways scroll.

## What changed
| File | Change |
|---|---|
| `css/app.css` | `--app-logo-text: 22px`; `.sidebar-logo` wraps; the mark has `flex-shrink: 0` |
| `css/auth.css` | `--auth-logo-text: 22px`; `.auth-logo` wraps; the mark has `flex-shrink: 0` |
| `landing/landing.css` | `--lp-wordmark-size: 22px`, 21 px at 900 px and below; `.brand` wraps; `.brand-mark` has `flex-shrink: 0` |
| `design/screens/40-nicheink-wordmark.html` + 3 PNGs | The page shows 22 px; new section 40c (before/after at 100% and 200%); 6a to 6d and the size rows use the new numbers; 40b keeps its 19 px frames |
| `tests/brand-name.test.js` | 40b/40c sizes; new test: the three rows wrap and the three marks never shrink |
| `tests/browser/books/t-brand.js` | 22 px and 21 px checks; wrap rule on all three; at 200% the sidebar logo wraps, the mark stays 30 px, no sideways scroll |
| `CLAUDE.md` §7 | The wordmark line said 19 px. Now 22 px / 21 px and the wrap rule. **Please check this line.** |
| `tests/README.md`, `design/README.md` | One line each for 40c |

## Measured in the browser (real fonts)
"NicheInk" with the gap: 98 px at 22 px, 94 px at 21 px (85 px at 19 px before).

| Place | Room | Row at 100% | Row at 200% text | Result at 200% |
|---|---|---|---|---|
| App sidebar (260 px) | 227 px | 154 px | 250 px | **Wraps**: mark 30 px on top, wordmark (210 px) under it, 16 px to spare, no sideways scroll |
| Auth at 390 | 342 px | 138 px | 234 px | One line, 107 px to spare, mark 30 px |
| Landing header at 390 | 232 px | 132 px | 224 px | One line beside the buttons, 8 px to spare, mark 28 px |

At 100% nothing wraps anywhere.

## Tests
- `deno test --allow-read tests/brand-name.test.js`: 11 passed, 0 failed.
- `tests/browser/run.sh books t-brand.js`: 33 passed, 0 failed (30 before; 3 new wrap-rule checks).
- Note: in the test browser the landing page sometimes gets the fallback font (Google Fonts is slow there). The landing numbers above were measured again with the real font loaded.

## Screenshots (this folder, mocked data)
| Before (19 px) | After (22 px) | What |
|---|---|---|
| `before-sidebar-1440.png` | `after-sidebar-1440.png` | App sidebar at 1440 |
| `before-sidebar-200.png` | `after-sidebar-200.png` | Sidebar at 200% text (the logo has focus) |
| `before-signin-1440.png` | `after-signin-1440.png` | Sign in at 1440 |
| `before-signin-390.png` | `after-signin-390.png` | Sign in at 390 |
| `before-landing-1440.png` | `after-landing-1440.png` | Landing at 1440 |
| `before-landing-390.png` | `after-landing-390.png` | Landing at 390 |
| `before-landing-390-200.png` | `after-landing-390-200.png` | Landing at 390, 200% text |
| `before-logo-*.png` | `after-logo-*.png` | The logo alone: sidebar, auth, landing |

The app has no phone layout (v2), so the sidebar is shown at 1440 only.

Design: `design/screens/40-nicheink-wordmark.html`, section 40c, and its PNGs at 1440, 900 and 390.
