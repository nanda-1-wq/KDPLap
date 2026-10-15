# Tests

All commands run from the repo root. None of them touch the live project.

## Edge Function `generate` (Deno)

```sh
deno check supabase/functions/generate/index.ts
deno test --allow-read=supabase/functions/generate supabase/functions/generate/
```

- `lib.test.ts`: prompts, parsing, limits. `lib.outline.test.ts`: the
  outline_ideas number rule, word target, contents budget and reply cleaning.
  `lib.outline_check.test.ts`: which AI outline findings are kept (real
  chapters, a quote really in the reader promise), the prompt, and the outline
  fingerprint (inputs_key).
- `handler.test.ts`: the shared request flow. `handler.<stage>.test.ts`: one file per stage.
- `lib.section_write.test.ts` and `handler.section_write.test.ts` (E10.2,
  Generate section): the input, words per call and max_tokens, the prompt,
  the clean-up and source markers, the SSE reader, and the whole streamed run
  with a fake Anthropic stream (`streamReply` in `test_fakes.ts`, small timers
  `FAST`): each end (complete, Stop, closed tab, deadline, idle, AI error,
  HTTP 529, refusal, max_tokens, too long, shutdown), what it saves and
  counts, the save retry, the refusals before any AI call, rule A (a stale
  run recovered) and rule C (heartbeats and Stop are not AI calls).
- `lib.section_improve.test.ts` and `handler.section_improve.test.ts` (E10.3,
  Improve menu, not streamed): the input per action (instruction only for
  Custom), the word limits (Expand 1,000), max_tokens per action, the prompt
  (Brief block, voice, data tags, injections, the six task blocks), reading
  the reply, the source markers on the output, the notes (markers lost, new
  names, structure), the saved suggestion and its counted row, the refusals
  before any AI call (with the reserve), and Cancel (the server finishes).
- `lib.section_check.test.ts` and `handler.section_check.test.ts` (E10.4, the
  AI check in the Checks tab, not streamed): the input (no text from the
  browser), the checks before the call (50 to 6,000 words, the saved version,
  unsaved typing, a fresh run), the fingerprint (inputs_key), the prompt (data
  tags, escaping, injections, intro and conclusion, voice), which findings are
  kept (a quote really in the text; an empty quote only for at most 2
  objective gaps), the areas, the saved check and its counted row, the
  refusals before any AI call (with the reserve).
- `stages.test.ts`: the stage table.
- `snapshot.test.ts`: the exact provider request for every stage, and every
  reply and error shape. A refactor must leave
  `__snapshots__/snapshot.test.ts.snap` unchanged. Re-record only for an
  intended change, and review the diff:
  `deno test --allow-read --allow-write supabase/functions/generate/snapshot.test.ts -- --update`
- Shared fakes: `test_fakes.ts`.

## Browser helpers (Deno)

```sh
deno test tests/title-checks.test.js
deno test tests/outline-checks.test.js
deno test --allow-read tests/limits-parity.test.js
deno test --allow-read tests/outline-key.test.js
deno test tests/markdown-lite.test.js
deno test tests/word-diff.test.js
deno test --allow-read tests/word-count.test.js
deno test tests/sse-read.test.js
deno test --allow-read tests/sentences.test.js
deno test --allow-read tests/text-checks.test.js
deno test --allow-read tests/section-check-key.test.js
deno test --allow-read tests/selection-in-text.test.js
```

- `outline-checks.test.js`: the step 05 code checks and the shared words and
  pages helper (`js/word-budget.js`, about 250 words a page).
- `limits-parity.test.js`: the same limits in the browser files,
  `generate/lib/limits.ts` and the migrations (title 200, Brief lengths,
  positioning sizes, competitor caps, insight and title-option caps, Brief
  chapters 3 to 30 and custom word target 2,000 to 150,000, book types and
  the 40-character Other label, competitor import page text, outline limits
  (0016), the Brief length ranges, one page estimate helper, and Generate
  section: 2,000 words a call, max_tokens, the 100 s deadline, the 20 s and
  160 s stale run and 100,000 characters in 0020; the Improve menu: actions,
  text sizes, the stale run and the 1-hour life in 0021, the word limits and
  max_tokens; the AI section check: types, findings, message and quote sizes,
  empty quotes and words in 0022). It fails
  when a value disagrees or can no longer be found.
- `markdown-lite.test.js`: the step 06 text format (`js/markdown-lite.js`): the
  Markdown subset to HTML (everything escaped) and back from the editor's DOM
  (only an allowlist is read; pasted markup and scripts are dropped), the
  "[Verify: no source]" pill both ways (E10.2), and `fromDomMap` (E10.3): the
  same Markdown as `fromDom`, DOM positions to Markdown offsets and back, the
  pill's edges, and Improve outputs that read back the same.
- `sentences.test.js`: the Improve menu's sentence rule (`js/sentences.js`) cuts
  lines exactly like the server's `sentencesOf` (the E10.2 marker rows, read
  from `lib.section_write.test.ts` as data, and more); snapping a selection to
  whole sentences (markers, list and heading lines, blank edges); the context
  on each side (about 300 words, 2,500 characters).
- `text-checks.test.js`: the Checks tab's code checks (`js/text-checks.js`,
  E10.4): the number rule gives the same text as the server's
  `markUnsourced` (the E10.2 marker rows, read as data, and more), the
  known text is the server's `writeKnown`, the numbers row holds exactly the
  sentences that rule marks; open marks, repeated phrases (3 to 6 words, 3+
  times, the longest, never common words only), the same opener (paragraphs
  only; a heading or a list resets), words vs the target (under 80%, over
  120%, never counted), and under 30 ms on a 16,000-word section.
- `section-check-key.test.js`: the section check fingerprint in the browser
  (`js/section-check-key.js`) and in the function (`lib/section_check.ts`)
  give the same key, and a pinned value.
- `selection-in-text.test.js` (G3 P9): the browser's own selection and context
  (`js/sentences.js` snap and context) on Markdown with bold, italic, list
  items, headings and a marker, and the whole section, all pass the
  function's check that an Improve passage is part of the section
  (`selectionInText`, `lib/section_improve.ts`).
- `word-diff.test.js`: Compare versions (`js/word-diff.js`), design 23, and a
  10,000-word section.
- `word-count.test.js`: `kdpWords.count` gives the same counts as
  `md_word_count` (0018, and 0020: the source flag is not words); it checks
  that `t0018.sql` and `t0020.sql` have the same cases.
- `sse-read.test.js`: the browser's stream reader (`js/sse-read.js`), the same
  rules as the server's: split chunks, comments, several data lines, a body
  split inside a character, a broken stream.
- `outline-key.test.js`: the outline fingerprint in the browser
  (`js/outline-key.js`) and in the function (`lib/outline_check.ts`) give the
  same key (real-length outline, quotes, emoji), a pinned value, and the AI
  check caps against 0017.

## Database (local Postgres 18)

```sh
supabase/tests/sql/run.sh                 # every suite, each on a fresh database
supabase/tests/sql/run.sh t0010.sql       # one suite
supabase/tests/sql/reset.sh stop          # stop the test cluster
```

A throwaway cluster on `127.0.0.1:55432` (data in `$TMPDIR/kdplab-pg`).
It never uses port 5432. `stub.sql` adds the parts of Supabase the
migrations need (roles, `auth.uid()`, default grants). Suites:
`t0010` positioning, `t0011` title, `t0012` safety, `t0013` guard function,
`t0014` custom word target and insights fingerprint, `t0015` book types and Other label,
`t0016` outline rules (limits, caps, the "has writing" guard, replace_outline, add_chapter, reorder_chapters),
`t0017` outline approve (approve_outline, the approval guard, every edit that clears it and the writing that does not, unlock, outline_checks shape, owner and RLS),
`t0019` empty version fix (no blank first version; blank versions and drafts are not writing, so Remove and Regenerate work; unlock counts text only),
`t0018` write versions (word count, versions only through save_version / restore_version or the server, the 100,000 limit, drafts, the current version guard, "has writing" with drafts, unlock, outline_json),
`t0020` Generate section (section_runs: claim, refusals, heartbeat, Stop, the guard, finish for each end, conflict, 100,000 cut, rule A stale recovery, the usage row, a partial counts as writing only while current, the marker is not a word, the "Kept partial text" label, RLS),
`t0022` section checks (server only, the owner, book and version guard, the findings shape with objective gaps, the areas shape, the fingerprint, the upsert, the cascades, advice only),
`t0021` Improve suggestions (server only, the owner and version guards, the checks, the replaced version guard, apply_suggestion: once, 1 hour, the base rules, save_version then apply_suggestion, the draft, a fresh run, the text check, 100,000, Needs review, Reviewed and Final kept, a book delete),
`t0023` G3 fixes (the book-level "has writing" outline_ideas reads: a discarded partial is not writing, a draft and a fresh run are; write_cut and the 100,000 cut in finish and recover, never inside a word or a marker, the same cases as cutText; an AI section finding with the optional unsourced list; the grants),
`rls_cross_user` (user B against user A's rows in every table).

## Browser (mocked, playwright-cli)

```sh
tests/browser/run.sh title t1.js
```

Needs the static server on port 5500: `run.sh` starts `tests/browser/serve.py`
when nothing listens there (`python3 -m http.server` queues only 5
connections, so pages lose scripts: "kdpAutosave is not defined"). Every Supabase call is answered by
the suite's `mock.js` with a fake session, so no account or real data is
used. Suites: `brief` (t-chapters, t-length, t-missing, t-accept-all, t-partial,
t-book-type, t-help-more, t-references), `research` (t-stale, t-missing, t-from, t-import), `positioning` (t1, t2, t-drift,
t-accept-all, t-missing, t-save-owner), `title` (t1, t-note, t-hyphen, t-missing),
`delete` (t-dialog), `outline` (t1, t-struct, t-generate, t-check, t-approve, t-blank, t-running),
`write` (t1, t-draft, t-versions, t-idle, t-fixes, t-empty, t-generate, t-gen-ends, t-improve, t-checks,
t-timing). `t-timing` (G2) types 50 characters into a 16,000-word section at normal and 4x slower
CPU, with the Versions and the Checks tab open. It prints the time per keystroke as INFO lines
(never a pass or fail) and checks only that the typing arrives and the panel stays right. The write
mock answers Generate section through the page's own `fetch` with a stream
the test drives (`window.__gen.send(event, data)`), because `route.fulfill`
sends a body all at once. Improve (E10.3) goes the same way so Cancel can
abort it: the test answers each request with `window.__imp.reply(status,
body)`, and the mock's `apply_suggestion` runs the checks of 0021. The AI
section check (E10.4) is answered the same way: `window.__chk.reply(status,
body)`; `__store.checks` holds the saved checks, `__store.research` the
Research rows, `__store.penVoice` the pen voice, and `__store.timeline` the
times of version and draft writes (to check that autosave waits). The runner caches supabase-js (checked
against the app's SRI hash) and two old file versions from git in
`tests/browser/.cache/`. Screenshots go to `tests/browser/shots/`. Both
folders are ignored by git.

A test must not end with unsaved typing: the page then asks "Leave site?" on
the next navigation, and playwright-cli stops at that prompt (the run prints
nothing). The same holds while Generate is writing: a Generate test ends its
run first. If that happens, close the session: `playwright-cli -s=kdp-<suite> close`.
