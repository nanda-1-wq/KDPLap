# KDP Lab Design System

## Overview
**KDP Lab** is a SaaS platform for creating and publishing low-content books on Amazon KDP (Kindle Direct Publishing). It enables anyone — without design skills — to generate puzzle books, journals, planners, coloring books, and activity books, then export them as KDP-ready PDFs and publish to Amazon.

**Current status:** In beta, free to use. Planning subscription tiers (Free / Pro $9/mo / Team $29/mo) in Phase 3.

**Tech Stack:** HTML + CSS + JavaScript frontend · Supabase (Auth + PostgreSQL + Storage) · Vercel hosting · Stripe (planned)

## Sources
- **Codebase:** `nanda-1-wq/KDPLap` on GitHub (main branch)
  - `landing/index.html` — full marketing landing page
  - `landing/css/styles.css` — complete design token + component stylesheet
  - `landing/js/main.js` — scroll/nav interactions
  - `kdplapRoadMap/` — product roadmap (HTML + Markdown)
- **Reference screenshots:** `KDP referance/` folder (competitor/inspiration screenshots)

## Products / Surfaces
1. **Marketing Landing Page** — hero, how-it-works, features, templates, blog, pricing, footer
2. **Web App (planned)** — dashboard, generators (word search, sudoku, crossword, journal, planner, coloring, kids activity), cover designer, keyword tool, analytics

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Direct and encouraging.** Speaks to aspiring self-publishers; assumes they are non-technical.
- **"You" not "I."** Always user-facing. E.g. "Create your first book", "Start publishing today".
- **Outcome-first copy.** Headlines lead with the benefit, not the feature. "Create Low-Content Books in Minutes" not "Word Search Generator".
- **Short, punchy sentences.** Paragraphs rarely exceed 2–3 lines. Description text hovers around 14–16px, kept minimal.
- **Action verbs in CTAs:** "Get Started Free", "See how it works", "Start creating", "Publish to KDP".
- **No emoji.** Zero emoji usage across the UI. Clean, professional.
- **Numeric credibility:** Small specific numbers used for authenticity ("47 books created", "4s generation time", "8.5×11").
- **Casing:** Title case for headings. Sentence case for body copy. ALL CAPS only for small labels/badges (e.g. "BETA", "MOST POPULAR", "HOW IT WORKS").
- **Ampersand** (&) used in nav and short labels ("Journals & Notebooks"), spelled out in body copy.
- **Dash style:** Em dashes (—) used in body copy and badges ("Now in Beta — Free to use").
- **Vibe:** Confident, builder-friendly, approachable. Not overly corporate. Hints of indie-hacker energy.

### Examples
- Headline: *"Create Low-Content Books in Minutes"*
- Sub: *"Generate puzzle books, journals, planners & coloring books ready for Amazon KDP. No design skills required."*
- CTA: *"Get Started Free →"*
- Badge: *"Now in Beta — Free to use"*
- Section label: *"HOW IT WORKS"*

---

## VISUAL FOUNDATIONS

### Colors
- **Primary violet:** `#7C3AED` — buttons, accents, active states, icons
- **Violet mid:** `#9D6FEC` — gradient endpoint, secondary violet elements
- **Violet light:** `#A78BFA` — gradient highlights, dark-mode primary
- **Violet pale:** `#EDE9FE` — icon backgrounds, tag pills, hover fills
- **Violet glow:** `rgba(124,58,237,0.22)` — button drop shadows
- **Violet dim:** `rgba(124,58,237,0.08)` — hover background on nav items
- **Text dark:** `#1A0A3C` — primary text (deep purple-black)
- **Text mid:** `#5B4B8A` — secondary text, nav links
- **Text muted:** `#9585C0` — captions, timestamps, disabled states
- **White:** `#FFFFFF`
- **Off-white:** `#F8F7FF` — page background, alt sections (very slightly purple-tinted)
- **Border:** `rgba(124,58,237,0.12)` — default card/nav borders
- **Border strong:** `rgba(124,58,237,0.25)` — hover/focus borders

**Dark mode:** Full dark mode support via `[data-theme="dark"]`. Background flips to `#0F0B1A` / `#140F22`, violet shifts to `#A78BFA`, text to `#F0ECF9`.

### Typography
- **Display / headings:** `JetBrains Mono` — monospace, weight 700–800. Used for all h1–h3, section titles, numbers, logo. Letter-spacing: -1.5px to -2px for large sizes.
- **Body:** `DM Sans` — variable, weights 300/400/500. Used for all body copy, nav, buttons, labels.
- **Minimum size:** 12px (labels/timestamps). Body typically 13–16px. Hero h1: clamp(36px, 5vw, 64px). Section titles: clamp(28px, 4vw, 44px).
- **Line heights:** 1.1 (headings) · 1.6–1.7 (body) · 1.35 (card titles)

### Spacing & Layout
- **Max content width:** 1080–1140px, centered
- **Section padding:** `6rem 2rem` vertical
- **Nav height:** 70px (fixed)
- **Base radius:** `--radius: 12px`. Cards: 12–20px. Buttons: 10–12px. Icon boxes: 9–14px. Pills/badges: 20px (fully rounded).
- **Grid:** 48×48px subtle grid pattern on hero (violet tinted, radial masked)

### Cards
- **Background:** white (or off-white for alt sections)
- **Border:** 1px solid `rgba(124,58,237,0.12)`
- **Border-radius:** 16px typical (12–20px range)
- **Shadow:** `0 8px 40px rgba(124,58,237,0.14)` (medium), `0 24px 80px rgba(124,58,237,0.18)` (large)
- **Hover:** `translateY(-2px)` + stronger border + shadow upgrade
- **No left-border accent** — uses full border + shadow instead

### Buttons
- **Primary CTA:** violet gradient `linear-gradient(135deg, #7C3AED 0%, #9D6FEC 100%)`, white text, `border-radius: 10–12px`, `box-shadow: 0 4–8px 20–32px rgba(124,58,237,0.35)`. Hover: `translateY(-1 to -2px)` + stronger shadow. Active: `translateY(0)`. Shimmer overlay via `::before` pseudo-element.
- **Ghost/Alt button:** semi-transparent white bg, `border: 1px solid --border-strong`, text-mid color. Hover: white bg + violet text.
- **Animated pulse:** Primary nav CTA has a `ctaPulse` box-shadow animation (3s infinite).

### Backgrounds & Gradients
- **Hero:** `linear-gradient(170deg, #EDE9FE 0%, #F8F7FF 45%, #FFFFFF 100%)` + animated orbs + grid pattern
- **CTA section:** `linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)` — full violet
- **Gradient text:** `linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)` via `background-clip: text`
- **No photography** — no real background images; placeholder gradient fills used for blog cards
- **Orbs:** Two radial-gradient blurred orbs (filter: blur(80px)) drift via `orbDrift` animation

### Animations & Motion
- **Entry:** `fadeUp` — `opacity: 0 + translateY(18px)` → visible (0.5–0.8s, staggered with delay)
- **Scroll reveal:** `.fade-in` class + IntersectionObserver; staggered children via nth-child delay
- **Floating badges:** `floatA / floatB` — `translateY(0 ↔ ±6px)`, 4s ease-in-out infinite
- **Orb drift:** `orbDrift` — `translate(30px, 20px)`, 12–15s alternate infinite
- **Shimmer:** gradient `background-position` animation on mock-card top bar, 3s linear infinite
- **Hover easing:** `0.2–0.25s ease` — fast, snappy. No bounce or spring.
- **No page-transition animations.**

### Iconography
See ICONOGRAPHY section below.

### Borders & Shadows
- **Shadows are violet-tinted** (not neutral black). Small: `0 2px 16px rgba(124,58,237,0.08)`. Medium: `0 8px 40px rgba(124,58,237,0.14)`. Large: `0 24px 80px rgba(124,58,237,0.18)`.
- **Blur/glass:** Navbar on scroll uses `backdrop-filter: blur(24px) saturate(180%)`. Mobile menu also uses blur. No other blur instances in current UI.
- **Border style:** Very subtle 1px, rgba violet. Strengthens on hover.

### Color of Imagery
- No real photography in current UI. Blog card images are gradient placeholders (violet-pale range).
- Illustrations: none currently. Placeholder SVG icons only.

---

## ICONOGRAPHY

### Approach
- **Custom inline SVGs** throughout. No icon font, no external icon library.
- **Style:** Outlined, 1.5–1.8px stroke width, `stroke-linecap: round`, `stroke-linejoin: round`. Minimalist geometric forms.
- **Sizes:** 16px (nav/social), 18px (logo), 20px (dropdown items), 22px (feature cards), 32px (template cards, larger feature icons)
- **Fills vs Strokes:** Logo icon uses filled rects. All other icons are stroke-only.
- **Icon containers:** Squared with rounded corners (9–14px radius), `background: var(--violet-pale)`. On hover: bg turns violet, icon stroke turns white.
- **No emoji used.** No unicode chars as icons. No icon font.
- **CDN substitute:** Since icons are inline SVG, no CDN needed. All icons are embedded in HTML.

### Logo
- **Mark:** Three overlapping rectangles (stacked/layered metaphor for book pages/layers), in a `linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)` square (36×36px, border-radius: 10px), with a white shimmer overlay `::after`.
- **Wordmark:** "KDP " in `var(--text)` + "Lab" in `var(--violet)`, `JetBrains Mono`, 19px, weight 700, letter-spacing: -0.4px.
- Logo SVG is stored in `assets/logo-icon.svg`.

---

## File Index

```
README.md                    ← This file
SKILL.md                     ← Agent skill definition
colors_and_type.css          ← All CSS custom properties (tokens)
assets/
  logo-icon.svg              ← KDP Lab logo mark (violet gradient)
  logo-full.svg              ← KDP Lab full logo (mark + wordmark)
preview/
  colors-primary.html        ← Primary violet color scale
  colors-neutral.html        ← Neutral/text color scale
  colors-semantic.html       ← Semantic colors (borders, shadows)
  colors-dark.html           ← Dark mode palette
  type-display.html          ← JetBrains Mono display specimens
  type-body.html             ← DM Sans body specimens
  type-scale.html            ← Full type scale reference
  spacing-tokens.html        ← Spacing, radius, shadow tokens
  components-buttons.html    ← Button variants and states
  components-cards.html      ← Card variants
  components-nav.html        ← Navbar + dropdown
  components-badges.html     ← Badges, pills, tags, labels
  components-inputs.html     ← Form inputs and fields
ui_kits/
  web_app/
    README.md                ← UI kit usage notes
    index.html               ← Interactive landing page prototype
    Nav.jsx                  ← Navbar component
    Hero.jsx                 ← Hero section
    Features.jsx             ← Features + steps sections
    Dashboard.jsx            ← App dashboard (post-login)
    Generator.jsx            ← Book generator screen
```
