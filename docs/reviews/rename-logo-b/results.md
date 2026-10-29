# NicheInk logo, option B (design 40b)

Date: 2026-10-29. Owner request: a bigger wordmark and a small gap between "Niche" and "Ink".

## What changed
- A 2 px gap before "Ink": a margin on the Ink span (`--wordmark-gap` in `design/design-tokens.css`), used by the sidebar, the auth pages and the landing. It is not a space character, so the text and the accessible name stay "NicheInk".
- **The size stays 19 px** (18 px on the landing at 900 px and below), because of the owner's rule: the largest size up to 22 px that fits on one line at 200% text in all three places.

## Measured in the browser (real fonts, 2 px gap, 200% text)
| Size | Sidebar 260 px | Auth at 390 | Landing header at 390 (1 px less) |
|---|---|---|---|
| **19 px** | **Fits**, 3 px to spare, mark 30 px | Fits, 134 px | Fits, 41 px |
| 19.5 px | No: the mark shrinks to 29 px | Fits, 130 px | Fits, 37 px |
| 20 px | No: the mark shrinks to 24 px | Fits, 125 px | Fits, 33 px |
| 21 px | No: the mark shrinks to 15 px | Fits, 116 px | Fits, 25 px |
| 22 px | No: the mark shrinks to 7 px | Fits, 108 px | Fits, 17 px |

The text never wraps (nowrap). In the 260 px sidebar, a size above 19 px makes the mark shrink to make room, so 19 px is the largest size that fits. The auth and landing pages alone would allow 22 px. A bigger wordmark needs a change to the rule, for example a wider sidebar, or the 200% check on the auth and landing pages only.

## Tests
- `tests/brand-name.test.js`: 10 passed. New test: one gap token, the three `margin-left: var(--wordmark-gap)` rules, 19 px everywhere and 18 px on the landing at 900 px and below, and no space between the spans.
- `tests/browser/books/t-brand.js`: 30 passed. New checks: the gap on each page, Sign in at 390, 200% text at 390 on the auth page, and the mark keeping its size at 200% text in all three places. Fix: the test now resets the color scheme to light, not to the OS setting.
- Books suite: t-badge 12, t-brand 30, t-words 26 passed, 0 failed.

## Screenshots (this folder, mocked data, real fonts)
| Before | After | What |
|---|---|---|
| `before-sidebar-1440.png` | `after-sidebar-1440.png` | App sidebar |
| `before-signin-1440.png` | `after-signin-1440.png` | Sign in at 1440 |
| `before-signin-390.png` | `after-signin-390.png` | Sign in at 390 |
| `before-landing-1440.png` | `after-landing-1440.png` | Landing at 1440 |
| `before-landing-390.png` | `after-landing-390.png` | Landing at 390 |
| `before-logo-sidebar.png`, `before-logo-auth.png`, `before-logo-landing.png` | `after-logo-*.png` | The logo alone, in each place |

Design: `design/screens/40-nicheink-wordmark.html`, section 40b, and its PNGs at 1440, 900 and 390.
