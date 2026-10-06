# Batch B2 plan: browser cleanup

Date: 2026-10-06. Status: approved with one change (below), built, not committed.
Scope: browser JS, app pages, one new test, README. No migration. No server change.
Rule: no behavior change. Browser suites run once before and once after; same counts.

## 0. Before-run

Run all 7 browser tests (`positioning` t1, t2, t-drift; `title` t1, t-note, t-hyphen;
`delete` t-dialog) plus `deno test tests/title-checks.test.js` and the `generate`
Deno suite. Record pass/fail counts here before any edit.

## 1. `js/ui.js` (new): `window.kdpUi = { esc, ICON }`

- `esc`: the one shared escape function.
- `ICON`: the union of the two existing sets. Both sets are identical where they
  overlap (check, x, warn, close, plus, more, rename, trash). Pens adds `sparkle`,
  Topics adds `search` and `archive`. So every icon renders exactly as now.

Copies removed (6 found, not 5; the 6th is inline in `app/dashboard.html`):

| File | Change |
|---|---|
| `js/pen-name-common.js` | Drop own `svg`, `ICON`, `esc`. Keep exporting `ICON` and `esc` as `kdpUi.ICON` / `kdpUi.esc` |
| `js/topics.js` | Same: drop own copies, re-export from `kdpUi` |
| `js/book-actions.js`, `js/book.js`, `js/new-book.js` | `const { esc } = kdpUi;` |
| `app/dashboard.html` (inline script) | `const { esc } = kdpUi;` |
| `js/book-brief.js`, `book-research.js`, `book-positioning.js`, `book-title.js` | Take `ICON, esc` from `kdpUi`, not `kdpPens`. Brief still takes `one`, `voiceSummary` from `kdpPens` |

Why `kdpPens` / `kdpTopics` keep re-exporting `ICON` and `esc`:
- Pen-name and topic modules keep their current one-line imports (smaller diff).
- Two browser tests load **old** versions of `book-brief.js` and
  `book-positioning.js` from git (commit 32f9dfa). Those old files read
  `ICON, esc` from `kdpPens`. Removing them would break `title/t1` and
  `positioning/t-drift`.

Script order: add `<script src="../js/ui.js"></script>` right after `supabase.js`
on `book.html`, `dashboard.html`, `pen-name.html`, `pen-names.html`,
`settings.html`, `topic-lab.html`, `topic.html`. Not `editor.html` (parked
generator page, uses neither). `LOCK_ICON` and `REDO_ICON` in positioning stay
where they are (only used there).

## 2. `js/supabase.js`: not-found helpers

There are 21 such lines, in two shapes:
- 17 x `if (!data.length) return { data: null, error: <Error + notFound> }`, then `return { data: data[0], error: null }`
- 6 x `if (!count) return { error: <Error + notFound> }` (deletes)

Plan: two small private helpers at the top of the file.

```js
const notFound = (msg) => Object.assign(new Error(msg), { notFound: true });
// update/select that must hit one row: 0 rows means not found.
function oneRow({ data, error }, msg) {
  if (error) return { data: null, error };
  if (!data.length) return { data: null, error: notFound(msg) };
  return { data: data[0], error: null };
}
// delete with count: 'exact': 0 rows means not found.
function counted({ error, count }, msg) { ... }
```

Each call site becomes `return oneRow(await ..., 'Book not found.');`. Every
message text and the `notFound` flag stay the same. Only sites whose current
code matches the helper exactly are changed. The two "not created" lines
(topic, pen name) have no `notFound` flag and stay as they are. Any site that
does more work after the check also stays.

## 3. Limits parity test: `tests/limits-parity.test.js` (Deno)

Imports `supabase/functions/generate/lib/limits.ts` directly. Reads browser files
and migrations as text and pulls numbers out with small, exact regexes. If a
regex finds nothing, the test fails (so a moved constant cannot pass silently).

| Limit | Browser | Server (`limits.ts`) | SQL |
|---|---|---|---|
| Book title 200 | `book-actions.js` MAX_TITLE, `title-checks.js` MAX | TITLE_MAX | 0003, 0011 (x2) |
| Brief lengths (target_reader 300, reader_problem 1000, promise_draft 1000; plus topic_text, stance, standout, references, series_name browser vs SQL) | `book-brief.js` MAX | BRIEF_MAX | 0007 |
| Positioning text (400 / 600 / 1200) | `book-positioning.js` MAX | POS_TEXT_MAX | 0010 |
| Positioning lists (lacks 6x200, selling_points 8x160, focus_tags 8x40) | `book-positioning.js` LIST_MAX | POS_LIST_MAX | 0010 |
| Kept reason 200 | `book-positioning.js` MAX_REASON | MAX_KEPT_REASON | 0010 |
| Competitors cap 10, review boxes 4000, TOC 2000, source body 2000 | `book-research.js` | MAX_COMPETITORS, MAX_REVIEW_BOX, MAX_TOC, MAX_SOURCE_BODY | 0008 |
| Insights 6 per list, 160 chars | `book-research.js` MAX.line | MAX_INSIGHTS, MAX_INSIGHT_CHARS | 0008 |
| Title options 40, examples 3x250, keywords 5x60, unsourced 10 | `book-title.js` | MAX_TITLE_OPTIONS, MAX_TITLE_EXAMPLES, MAX_EXAMPLE_CHARS, MAX_TITLE_KEYWORDS, MAX_UNSOURCED | 0011 |

Run: `deno test --allow-read tests/limits-parity.test.js`. If any pair
disagrees today, I stop and report it. I do not fix limits in this batch
(that would be a behavior change).

Also add it to `tests/README.md` under "Browser helpers (Deno)".

## 4. Root `README.md`

Add a short "How to run the tests" section: one line per test kind and a link to
`tests/README.md`.

## 5. After-run and stop

- Same browser suites, same Deno tests, plus the new parity test.
- At most two screenshots (Brief step and Positioning step, where `ICON` now
  comes from `kdpUi`).
- Report: file list, before and after counts. Then stop. No commit until you say so.

## Files touched

New: `js/ui.js`, `tests/limits-parity.test.js`.
Changed: `js/pen-name-common.js`, `js/topics.js`, `js/book-actions.js`,
`js/book.js`, `js/new-book.js`, `js/book-brief.js`, `js/book-research.js`,
`js/book-positioning.js`, `js/book-title.js`, `js/supabase.js`, 7 pages in
`app/` (script tag, plus the dashboard inline `esc`), `tests/README.md`,
`README.md`, this plan.

## Approval change (2026-10-06)

`kdpPens` and `kdpTopics` no longer export `ICON` or `esc`. Every production
module takes them from `kdpUi` (grep confirmed 11 readers, all moved). The two
bug-proof tests (`title/t1`, `positioning/t-drift`) add a shim only while the
old file from git runs: they route `js/pen-name-common.js` and append
`kdpPens.ICON = kdpUi.ICON; kdpPens.esc = kdpUi.esc;`, then unroute.

## Results

| Suite | Before | After |
|---|---|---|
| positioning t1 | 78 pass, 0 fail | 78 pass, 0 fail |
| positioning t2 | 40 / 0 | 40 / 0 |
| positioning t-drift | 5 / 0 | 5 / 0 |
| title t1 | 52 / 0 | 52 / 0 |
| title t-note | 8 / 0 | 8 / 0 |
| title t-hyphen | 4 / 0 | 4 / 0 |
| delete t-dialog | 1 / 0 | 1 / 0 |
| Browser total | 188 / 0 | 188 / 0 (output identical line by line) |
| Deno title-checks | 6 / 0 | 6 / 0 |
| Deno generate | 117 / 0 | 117 / 0 |
| Deno limits-parity (new) | n/a | 6 / 0 (fails when a value is changed: checked with MAX_OPTIONS 41) |

Extra smoke load (mocked) of dashboard, pen-names, pen-name, topic-lab, topic,
settings: no page errors. One screenshot: Topic Lab empty state.

Notes:
- `supabase.js`: 12 `oneRow` and 6 `counted` call sites. Left as they were: 2
  "not created" lines (no notFound flag) and Settings (returns one field); the
  Settings line uses `notFound()`.
- `book-actions.js` keeps its own small icon set (`open` icon, and `warn` drawn
  at a fixed 18 px with stroke 2, not 2.2). Merging it would change how it looks, so it stays.
- No limit disagreed, so no limit was changed.
