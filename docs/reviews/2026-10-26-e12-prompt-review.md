# E12 step 1: AI prompt review

Date: 2026-10-26. Branch: `claude/e12` (from main 7084195). Report only. Nothing was fixed.

## 0. Scope and method

I read every AI stage in `supabase/functions/generate` as one system:

- the 13 prompts in `lib/*.ts`;
- the shared prompt parts (`lib/common.ts`, `lib/context.ts`, the shared parts in `lib/section_write.ts`);
- the stage table (`lib/stages.ts`), the limits and `max_tokens` (`lib/limits.ts`), the write run (`lib/write_run.ts`) and `handler.ts`.

To check the code against real output, I used only read-only steps:

- SELECT queries on the test book 4e2dde85 ("Somatic Healing for Anxiety") and the second test book aeec9a0c ("The Anxiety Reset Workbook"). I also queried `ai_usage`, `section_runs`, `section_suggestions`, `section_checks` and `pen_names`.
- The E11 export of the test book (`docs/reviews/e11-live/somatic-healing-for-anxiety.md`, not committed).
- One `deno eval` run of today's `markUnsourced` on that exported text. It wrote no files.

There were no AI calls, no Supabase writes and no code changes. Prices: Sonnet 5.5 costs $2 per million input tokens and $10 per million output tokens (cache reads $0.20).

## 1. Summary

The prompts are safe. Every stage treats user text as data, and our code (not the model) decides what is kept. Most rules match between stages. A real book still has three high risks:

1. **Claims without a number go unmarked (H1).** Nothing reliably flags a claim about the world that has no number. Since v16, Generate wrote 23 versions (about 15,000 words) in two anxiety books and added no mark of its own. The only mark the AI made itself in the test book is on a sentence the Research supports.
2. **Point of view (H2).** The pen name says "third person". Generate writes "you". The AI check then flags every section for it.
3. **Invented example people (H3).** Every section gets "An example" with a made-up person, name, age and job. The same names come back with different jobs.

There are 3 high, 10 medium and 8 low findings. Most fixes are prompt changes that need one generate deploy. H1 also needs a migration and browser work. M9 needs browser work only.

## 2. Short answers to the 7 questions

| # | Question | Answer | Findings |
|---|---|---|---|
| 1 | Does every stage keep to its facts? | Mostly yes. The import stages copy only what is on the page, and our code checks numbers against the page. The weak points are the bio (adds phrases about the author's books), Generate (invents example people and ages) and claims without numbers. | H1, H3, M6, L6 |
| 2 | Is the Verify rule the same? | The mark text is the same everywhere (`[Verify: no source]`). **The rule that decides when to mark is not.** There are four rules. Only Write and Improve put marks into the text, with no cap. The other stages show capped lists (at most 10). The 82 marks are all left over from generate v15 (section 4.1). | M1, H1, L5, L6 |
| 3 | Are voice and style the same in Generate, Improve and Check? | No. Point of view clashes (H2). "Short sentences" is a fixed rule in Generate, missing from Improve, and reversed by Humanize ("vary sentence length"). The stock-phrase list exists only in Humanize. | H2, M2, L1 |
| 4 | Length | Generate uses about **1.7 tokens per word** (20 runs since v16: 1.54 to 1.85), not 1.37. The formula assumes 1.6. Improve output measured 1.76, and its formula also assumes 1.6. Expand still lands at about 165 to 175% (aim 150%). Shorten lands at 75 to 85% (aim 70%), but those runs are from before or around the v18 fix. | M5, M10 |
| 5 | Safety | Pass. All 13 stages put user text in escaped XML tags and say it is data. No stage follows instructions inside user text, except the Custom edit's `<instruction>`, which is the author's own request and is kept within the rules on purpose. Two tags are missing from their prompt's list. | L4, section 7 |
| 6 | Cost of one book | About **$2.2** and **0.8 million tokens** for a 12,000-word book (40% of the 2,000,000 monthly default). A lean book costs about $1.1. A heavy 15,000-word book costs about $4.1 and uses about 1.6 million tokens (80%). | section 6, L7 |
| 7 | What would hurt a real book | Template sections ("An example" ×8, "Try it now" ×3), the same advice repeated across sections, references to section numbers that the printed book does not show, picture placeholders in the file, and partial sections marked Final that end mid-word. | H3, M3, M4, M7, M8, M9 |

## 3. Findings

Each finding has the same parts: **where**, **what I saw**, **why it matters for a real book**, **fix**, **deploy**. "Deploy" means a generate deploy by Claude chat after the owner says deploy. CLAUDE.md §4 does not allow me to run the Supabase CLI.

### High

#### H1. Claims about the world without a number are almost never marked

- **Where:** `lib/section_write.ts:163-165` (the AI rule), `lib/section_write.ts:335-358` (`claimNumbers`: numbers only), `lib/section_check.ts:154` ("Do not report ... numbers, sources or source marks. The app checks those.").
- **What I saw:**
  - Our code marks only sentences that have a claim number (%, money, decimals, 100 or more, ratios, or any number in a sentence that says study, research, survey, data or evidence).
  - A claim with no number depends on the AI marking itself. That almost never happens. Since v16 (2026-10-12), Generate wrote 23 versions in the two anxiety books. Not one new mark was added. (The 22 marks in the test book's "Continued" versions are old v15 text carried forward.)
  - The AI's only self-made mark in the test book is in 4.2: "...women may store chronic stress in the pelvic floor and jaw...". The Research supports that sentence (source 2).
  - Meanwhile, sentences like these have no mark: "Your body releases stress chemicals, adrenaline among them... Digestion slows" (1.1), "When your body reads a situation as a threat, it prepares to fight or brace" (4.1) and "Most women have a few favorites" (2.2).
  - The AI check is told to skip sources, and "the app" checks only numbers.
- **Why it matters:** CLAUDE.md §5 says "Any number or claim without a source gets a Verify flag". In a health book, unsourced body claims are what reviewers and KDP content review care about most. Today the Export dialog would say "No open Verify marks" for a book full of them.
- **Fix:** keep marking honest without flooding the text (the 82-mark book shows how flooding feels).
  1. Add a 4th AI check type, `source`: "a sentence that states a fact about the world (body, health, money, law, history, research) that `<research>` does not support". It gives an exact quote (our code keeps only quotes found in the text), at most 4 per check. The Checks tab gets an action, "Add Verify mark", and a "Keep: common knowledge" choice, like drift flags.
  2. Make the Write rule sharper with 2 short examples (one to mark, one not to mark).
  3. Run the check at effort `medium` if `low` misses too much (`lib/stages.ts:477`).
- **Deploy:** yes. It also needs a **migration** (0022 allows only the types objective, voice and drift; `0022_section_checks.sql:59,92`) and **browser** work (Checks tab, areas). Plan it as its own task.

#### H2. Point of view: Generate and the AI check disagree

- **Where:** `lib/section_write.ts:169` ("Follow `<voice>`: ... point of view"), `lib/section_check.ts:143` (voice includes "point of view"), `lib/bio.ts:34` (the bio is always third person), `js/pen-name.js:157` (the field is labelled only "Perspective").
- **What I saw:**
  - Two of the three pen names have Perspective set to "Third person", Elena Vance among them. Most likely it was set with the bio in mind.
  - Generate wrote the whole test book in "you". It followed the reader promise ("After finishing this book, you can"), the exercises and how-to habit, not the voice setting.
  - All 3 saved AI checks of the book report a voice problem, for example "Voice is third person, but this passage speaks directly to the reader as 'you'. Rewrite it in third person."
- **Why it matters:** a how-to book in third person reads badly. So the author either ignores the voice area of every check (and misses real voice problems), or "fixes" good text into third person.
- **Fix:**
  1. Owner decision: what Perspective means. My suggestion is that it means the point of view **in the books**. Relabel it "Point of view in your books" with a short help line: "The bio is always third person."
  2. One shared point-of-view rule in Generate, Improve and Check. Steps and exercises may always speak to the reader as "you".
  3. Tell the owner to recheck the setting of each pen name before E12.
- **Deploy:** yes (prompts), plus a small browser change (the label).

#### H3. Invented example people: a template, with names and facts that clash

- **Where:** `lib/section_write.ts:159` ("use one short, concrete example"), `:163` ("Never invent ... a name"), `:241` (`<examples>yes` goes to **every** section of the chapter), `lib/section_improve.ts:125` (Expand: 'An example says "a reader who...", never a name'), `lib/section_write.ts:327-334` (small numbers such as "Ruth, 68" are not marks, by design).
- **What I saw in the test book:**
  - 7 examples follow the same formula: "Maya, a 34-year-old project coordinator", "Daniela, a 41-year-old nurse", "Marisol, a 34-year-old project manager", "Dana, a 41-year-old nurse", "Priya, a 36-year-old project manager", "Dana, a 41-year-old teacher", "Maya, a 34-year-old office worker".
  - **Dana is a nurse in 3.2 and a teacher in 4.2. Maya is a project coordinator in 2.1 and an office worker in 5.1.**
  - The subheading "An example" appears 8 times.
- **Why it matters:**
  - Readers notice the same template in every section.
  - A made-up person with a precise age and job reads as a real case study. In a health book that is a trust problem, and the ages are numbers without a source that no rule marks.
  - Clashing facts make the book look careless.
  - Each call sees only the last 2,000 characters of the previous section, so the model cannot know that Dana already exists.
- **Fix:**
  1. Use the same example rule in Generate and Expand. Owner choice:
     - (A) no names: "a reader who..." or "picture a morning when...";
     - (B) names allowed, but no age and job formula, one person per book used again and again, and a line in the front matter saying the names and details are made up.
  2. No subheading called "An example". Vary the form (a scenario, a before and after, a "you might notice...").
  3. Examples in one section per chapter, the way the exercise goes only in the last section (`:242`). Owner choice which section.
- **Deploy:** yes.

### Medium

#### M1. The Verify rule is not the same across stages

- **Where:** see the table in section 4.1.
- **What I saw:** there are four different rules for "a number with no source" and five different lists of "sources". Examples:
  - "a 15-minute routine" in a title: the Title prompt says it is fine (`lib/title_ideas.ts:40`), but `unsourcedNumbers` flags "15".
  - "a 34-year-old": flagged in Positioning and Brief help, not flagged in Write.
  - "120 seconds": flagged in Write (100 or more), skipped in the outline ("seconds" is a book part).
- **Why it matters:** the author sees "Verify: no source" for the same kind of number in one step and not in the next. They learn to ignore the badge, which is the opposite of what the badge is for.
- **Fix:** one shared number rule in `common.ts`, with one list of book-part words and one list of claim words, used by every stage. Claims (H1) stay separate. The "sources" list should be what the prompt really sent (L5).
- **Deploy:** yes.

#### M2. The house style fights the voice settings

- **Where:** `lib/section_write.ts:170` ("Clear, simple words. **Short sentences.** Active voice. No em dashes."), `lib/section_improve.ts:109` (same line **without** "Short sentences"), `:129` (Humanize: "Vary sentence length and openings", plus the only stock-phrase list), `lib/section_check.ts:143` (voice judged only against `<voice>`).
- **What I saw:**
  - A pen name can choose "Mixed" or "Long and detailed" sentences and an "Advanced" reading level. Generate still always says "Short sentences" and "simple words".
  - Humanize then varies sentence length, the next Generate goes back to short, and Check judges only `<voice>`.
  - The stock-phrase list ("it's important to note", "delve", "unlock"...) is only in Humanize, so Generate writes the phrases and Humanize removes them.
- **Why it matters:** each tool pulls the text a different way, so a section edited with Improve and continued with Generate changes style in the middle. The author pays for a Humanize pass that Generate could have avoided.
- **Fix:** one shared `STYLE` text used by Write and Improve, and named in Check:
  - sentence length follows `<voice>` (short when none is set);
  - clear words at the chosen reading level;
  - active voice and no em dashes;
  - the stock-phrase list and "no empty openers or closers".
- **Deploy:** yes.

#### M3. The text refers to section numbers and previews the next part

- **Where:** `lib/section_write.ts:237-239` (`<section_number>4.2</section_number>` and "4.1 Title" items), `:230` (numbered outline). No rule says how to refer to other parts.
- **What I saw:** "In section 3.1, you met four quick practices." (3.2), "Chapter 5.2 will show you where those signals fit into your day." (5.1, which is also the wrong word), and sections that end with "In the next chapter..." or "Before you move on" (×3).
- **Why it matters:** the exported book numbers chapters only ("Chapters in the file are numbered 1 to N"). Section headings have no numbers, so "section 3.1" points to nothing. Previews at every section end are filler.
- **Fix:** add to Write: "Never mention section numbers. Refer to another part by what it covers ('the breathing practices earlier in this chapter'). Do not end with a preview of the next section." Keep the numbers in the prompt for the model's own sense of order.
- **Deploy:** yes.

#### M4. A section can start by finishing the previous section's sentence

- **Where:** `lib/section_write.ts:157` ("If it stops in the middle of a sentence, finish that sentence first", meant for `<section_so_far>`), `:158` ("If `<previous_section_end>` has text, this section follows it"), `:223`/`:244` (`tailText` keeps the end even when it stops mid-sentence).
- **What I saw:** section 2.2 starts with "it grows with practice. Some days the signals are loud." (lower case). It was generated on 2026-10-10, right after 2.1 was saved as a partial that stopped mid-sentence.
- **Why it matters:** partials are common while writing (Stop, closed tab, time limit). The next section then opens with half a sentence, and the author may not notice it in a long book.
- **Fix:**
  - Line 158: "This section starts with a new sentence of its own. Never finish a sentence from `<previous_section_end>`."
  - In code, cut `<previous_section_end>` back to its last full sentence before sending it.
- **Deploy:** yes.

#### M5. Generate and Improve need more tokens per word than the formulas assume (idea i20)

- **Where:** `lib/section_write.ts:94` and `lib/limits.ts:121-124` (`max_tokens = min(4,200, ceil(aim × 2.0) + 200)`, "1.6 tokens a word"), `lib/section_improve.ts:53` and `lib/limits.ts:155-159` (`ceil(words × growth × 1.6) + 200`).
- **What I saw:** see section 5.
  - Generate uses 1.54 to 1.85 tokens per word (median 1.69, 20 runs since v16).
  - The Improve Expand recheck used 1.76 (3,006 tokens for 1,710 words, JSON included).
- **Why it matters:**
  - Generate: at aim 2,000, the 4,200 cap now allows about 2,450 words at 1.7. That is still OK, because Generate writes about 80% of a 2,000-word aim. But the cushion is smaller than planned. Sections 3.1 and 4.1 of the test book were cut by `max_tokens` under the old formula, and that is how they became mid-word partials (M9).
  - Improve: a long Shorten or Edit can now hit its cap. A 1,500-word Shorten that lands at 85% needs about 2,240 tokens, exactly its cap of 2,240. A 1,500-word Improve that grows 15% needs about 3,040, over its cap of 2,960. The author gets "AI stopped" (not counted) and has to try again.
- **Fix:**
  - Generate factor 2.2, cap 4,600. At 1.85 that allows about 2,000 words × 124%. 4,600 tokens takes about 50 to 77 s, under the 100 s soft deadline.
  - Improve per-word factor 1.6 → 1.9 (JSON adds a little).
  - Only the reserve for the monthly limit grows. The real cost does not change.
- **Deploy:** yes. Same numbers in `js/book-write.js` (it mirrors `WRITE`).

#### M6. The bio adds phrases that are not in the facts

- **Where:** `lib/bio.ts:31` (pronoun "he/she"), `:33` ("You may say the author writes about it"), `:35` (80 to 150 words), `:36` (match the voice).
- **What I saw:** the Elena Vance bio says "**Her books keep things short, clear and practical, so they fit into a full day.**" No fact says that. It also says "**Her niche is** somatic self-regulation..." (the app's word, not a reader's), and it turns "experience helping women" into "She writes about helping women".
  - Her facts are about 57 words, so the 80-word minimum forces the model to add words.
  - A warm, practical voice invites claims about her books.
  - The pronoun was picked from the name, because the facts do not say.
- **Why it matters:** the bio is public (About the author in the book, and later the Amazon author page). CLAUDE.md §5 says "Bios use only facts the user entered".
- **Fix:**
  - Minimum 40 words: "A short bio is better than an added phrase."
  - "Do not describe the author's books, their style or what they do for readers, beyond 'writes about [niche]'. Do not use the word niche."
  - "Use he, she or they only when the facts show it. Otherwise use the first name."
  - Optional code note, like Improve's new-names note: list bio sentences whose main words are not in the facts.
- **Deploy:** yes.

#### M7. Picture placeholders ship in the exported file

- **Where:** no rule in `WRITE_SYSTEM`. The prompts suggest pictures as a fine book choice: `lib/positioning_help.ts:22`, `lib/drift_check.ts:23` and `lib/outline_check.ts:88` ("photos, large print").
- **What I saw:** a reader wish in the Research insights (pictures) became part of the positioning, then the subtitle ("...With Clear Steps and Pictures"), then 4 lines in 3.1 like "*Picture: a seated figure, one hand on the belly...*". The export keeps them as text. Nothing flags them.
- **Why it matters:** v1 has no images. A book that promises pictures in its subtitle and ships stage directions instead gets bad reviews.
- **Fix:** owner choice:
  - (A) Write rule: "No picture notes or placeholders."
  - (B) A fixed form "[Picture: ...]" that Export counts and warns about, like Verify marks.
  - Either way, Positioning and Title should promise pictures only when the Brief says the book has them.
- **Deploy:** yes. (B) also needs browser work.

#### M8. The same advice repeats across sections

- **Where:** `lib/section_write.ts:213-250`. Each call sees the outline titles, the last 2,000 characters of the previous section and this section's own text. It never sees what other sections said.
- **What I saw:** in about 8,900 words: "you do not need" ×8, "something you already do" ×3 (the same habit-stacking tip in 2.1, 4.1 and 5.2), "Before you move on" ×3, "Try it now" ×3, and the same section shape every time (explain, example, try it, short wrap-up).
- **Why it matters:** in a 12,000 to 15,000-word book the reader meets the same tip and the same shape again and again. That is the "generic AI book" feel.
- **Fix:** send a short `<book_so_far>` with the subheadings of every written section (about 300 to 600 tokens), plus "Do not repeat advice or subheadings from `<book_so_far>`". This needs the store to read other sections' headings (`getWriteContext`, `index.ts`).
- **Deploy:** yes.

#### M9. A partial version can be Final and ship cut off mid-word (outside the prompts)

- **Where:** Export and Checks (browser). Not a prompt issue.
- **What I saw:** 3.1 ends "...In the next" and 4.1 ends "...gentle messages of saf". Both are "Kept partial text from v1" versions, cut by `max_tokens` under the old v15 formula (850-word aim → 1,560 tokens, 650 → 1,240). Both are Final and both are in the E11 export.
- **Why it matters:** a published book with a sentence that stops mid-word.
- **Fix:** a code check in the browser: a section whose text does not end with `.`, `!`, `?` or a closing quote gets "Ends mid-sentence" in the Checks tab and a warning in the Export dialog, like the Verify marks warning.
- **Deploy:** no (browser only).

#### M10. Expand and Shorten still miss their length limits

- **Where:** `lib/section_improve.ts:125` (Expand: about 1.5×, never more than 1.7×), `:127` (Shorten: about 0.7×, never more than 0.8×).
- **What I saw:** see section 5.3. The 4 Expand runs known to be after the v18 fix landed at 163 to 176%, and 2 of 4 were over 170%. The 4 Shorten runs (all on 2026-10-13, at least one before v18) landed at 75 to 85%, and 3 of 4 were over 80%. The model overshoots by about 10 to 15 points in both directions.
- **Why it matters:** small for one passage. Across a book, "Shorten" that removes only 15 to 20% means more calls and more cost.
- **Fix:** ask for less, so the result lands on the real aim: Expand "about 1.4×, never more than 1.6×", Shorten "about 0.6×, never more than 0.72×". Measure again during E12. The card already shows "46 → 44 words".
- **Deploy:** yes.

### Low

#### L1. The intro and conclusion purpose is only in Check

- **Where:** `lib/section_check.ts:142` ("For the introduction or the conclusion, the purpose is to open or close the book around the reader promise"). `WRITE_SYSTEM` has no such line.
- **Why it matters:** Check judges the intro by a rule Generate never got.
- **Fix:** add one line to Write. Intro: who it is for, the promise, how to use the book. Conclusion: what the reader can now do, and one next step.
- **Deploy:** yes.

#### L2. Expand asks for "a concrete step" but bans every new number

- **Where:** `lib/section_improve.ts:101` and `:125`. Generate allows "Counts of the book's own parts" (`lib/section_write.ts:164`).
- **Why it matters:** in a practice book a concrete step usually has a count ("breathe out for a count of 6"). Expand then writes vague steps or breaks its own rule.
- **Fix:** use the same allowance as Generate.
- **Deploy:** yes.

#### L3. Two promise templates

- **Where:** Brief "After this book, the reader can" (`lib/brief_help.ts:34`) and positioning "After finishing this book, you can" (`lib/positioning_help.ts:14`). The positioning line is sent to every Write call.
- **Why it matters:** the intro and conclusion tend to repeat the promise sentence word for word.
- **Fix:** add to Write: "Do not copy the reader promise word for word."
- **Deploy:** yes.

#### L4. Two tags are missing from their prompt's data list

- **Where:** `<topic_lab_name>` is sent (`lib/brief_help.ts:88`) but not named in `BRIEF_SYSTEM` (`:29`). `<book_subtitle>` is sent (`lib/outline_ideas.ts:174`) but not named in `OUTLINE_SYSTEM` (`:113`).
- **Why it matters:** low. The text is still escaped and inside tags, and both values are typed by the author.
- **Fix:** name both tags.
- **Deploy:** yes.

#### L5. "Sources" include text the AI never saw

- **Where:** `lib/context.ts:165-174` (`knownText`: all sources and the Brief "references") vs `:86-100` (the prompt sends at most 20 sources and 12,000 characters, and never sends references).
- **Why it matters:** a number in a source that was left out of the prompt counts as sourced. The AI could not have used it correctly.
- **Fix:** build "known" from the same `promptSources` list that the prompt uses.
- **Deploy:** yes.

#### L6. Brief help suggestions become sources once accepted

- **Where:** `lib/context.ts:160-164` (the positioning is "not a source", on purpose), `lib/brief_help.ts:148-155` (the Brief **is** a source).
- **Why it matters:** a number from Help me fill is flagged when suggested. Once the author accepts it, every later stage treats it as sourced.
- **Fix:** document it in the Brief UI help line, or keep a "from AI" flag on accepted Brief fields (larger change).
- **Deploy:** no for the help line.

#### L7. Prompt caching could save a little

- **Where:** `lib/section_write.ts:226-230` and `lib/section_check.ts:183-185`. The Brief, Research, voice, positioning and outline come first and stay the same for a whole book. That is a good order for caching.
- **Why it matters:** input is about two thirds of the cost (section 6). With a cache breakpoint after the stable part, the calls made within 5 minutes of each other would read it at 0.1×. Estimate: $0.2 to $0.5 saved per book.
- **Fix:** not now. Revisit if cost matters in v3.
- **Deploy:** yes, when done.

#### L8. The 82 old marks in book 4e2dde85

- **Where:** the book's data, not the prompts.
- **Fix:** E12 should start a new book, so no action is needed. Cleaning the old book (Restore or manual edit) is the owner's choice, as decided on 2026-10-12.
- **Deploy:** no.

## 4. Verify marks

### 4.1 The four rules

The mark text is the same everywhere: `[Verify: no source]` (`MARKER`, `lib/section_write.ts:66`; `normalizeMarkers` fixes other spellings in Improve). What decides a mark is not the same:

| Rule | Where | What counts as "no source" | Used by | Puts marks in the text? |
|---|---|---|---|---|
| AI rule | `section_write.ts:165` | "a number, a study or a claim about the world" not in Brief or Research (the AI decides) | section_write | yes, rarely (H1) |
| `claimNumbers` | `section_write.ts:335-358` | %, money, decimals, numbers of 100 or more, ratios, any number in a sentence with study, research, survey, data or evidence. Never list numbers, section numbers, times or small counts ("Ruth, 68") | section_write (whole new text), section_improve (output) | yes, no cap |
| `unsourcedNumbers` | `common.ts:137-141` | any number not in the sources, except figures of speech (24/7, 9 to 5) | brief_help, positioning_help, title_ideas | no, a list per field (titles: at most 10) |
| `outlineUnsourced` | `outline_ideas.ts:89-107` | any number except counts of book parts ("6 moves", "Week 3"). Units (%, kg, $) and claim words always count | outline_ideas, outline_check (why), section_check (message) | no, a list per item (at most 10) |

What counts as a source also differs:

- brief_help uses the Brief, the topic name and the page-1 books.
- positioning_help and title_ideas use `knownText`: the Brief, references, insights, competitor titles and all sources.
- outline_check adds the outline and the chapter numbers.
- Write and Improve add the outline (`writeKnown`).
- section_check adds the checked text.

**Which stages can make many marks:** only section_write and section_improve, because they put marks into the section text sentence by sentence, with no limit. Every other stage returns short lists.

### 4.2 Why the test book has 82 marks

Every mark was already in the version 1 texts written on 2026-10-10 by generate v15. Its `markUnsourced` cut sentences at every "." and flagged almost any number (see `e10-2-stop2` notes). Every later version of those sections kept the same count, and the Expand, Improve and Continue runs since v16 added none.

| Kind of mark (where it sits) | Count | Today's rule |
|---|---:|---|
| After a list number ("1." to "7.") | 65 | not marked |
| After a split time ("2 a." / "2 p.") | 2 | not marked |
| Inside a split section number ("section 3." + "1, you met") | 2 | not marked |
| After a section reference ("Chapter 5.2 will show you") | 1 | not marked |
| After an invented age ("Maya, a 34-year-old...") | 7 | not marked (small number) |
| After a scale ("0 to 10", "1 to 5", "a 6") | 4 | not marked |
| After a real claim with no number (4.2, pelvic floor; the Research supports it) | 1 | AI only |
| **Total** | **82** | |

Per section: 1.2: 5, 2.1: 9, 2.2: 8, 3.1: 20, 3.2: 8, 4.1: 16, 4.2: 9, 5.1: 2, 5.2: 5. The Introduction, 1.1 and the Conclusion have 0.

**Replay:** today's `markUnsourced`, run on the whole exported book with no sources at all, adds **0** marks. So the 82 are leftovers, not today's behavior. Today the risk is the opposite: too few marks (H1).

## 5. Length

### 5.1 Generate: tokens per word

These figures are output tokens divided by the new words in the saved version (the `md_word_count` rule, which counts neither Markdown marks nor Verify marks). They come from `section_runs` and `section_versions` (26 runs with exact tokens).

| Runs | Tokens per word |
|---|---|
| 6 runs on 2026-10-10 (v15, many marks in the text) | 1.59 to 1.88 |
| 20 runs since v16 | 1.54 to 1.85 (one 39-word run: 1.92), **median 1.69** |
| G3 P6 run (2,000-word aim, one of the 20) | 1.63 |
| Plan value (E10.2) | 1.37 (too low) |
| Formula assumes | 1.6 |

### 5.2 Generate: words written vs aim (first runs on the test book)

| Aim | Written | % |
|---:|---:|---:|
| 300 | 296 | 99% |
| 400 (intro) | 277 | 69% |
| 400 | 417 | 104% |
| 500 | 495 | 99% |
| 500 | 515 | 103% |
| 550 | 544 | 99% |
| 550 | 602 | 109% |
| 650 | 608 | 94% |
| 650 | 671 | 103% |
| 2,000 (G3) | 1,606 | 80% |

Generate is accurate from 300 to 650 words and writes short at 2,000 words. The intro was short on its first run.

### 5.3 Improve: Expand and Shorten (from `section_suggestions`, words by spaces)

| Action | Aim / limit | Results |
|---|---|---|
| Expand | 150% / 170% | before v18: 199%. Known after v18: 173%, 176%, 168%, 163%. One more on 2026-10-13: 161% |
| Shorten | 70% / 80% | 81%, 85%, 82%, 75% (all 2026-10-13, at least the first before v18) |
| Improve, Edit, Humanize | 90 to 110% | mostly 88 to 106%. Very short passages (11 to 20 words) up to 125% |

## 6. Cost of one book

Real averages from `ai_usage` (all Sonnet 5.5 calls so far), at $2 per million input tokens and $10 per million output tokens. The book has 12,000 words and about 22 sections.

| Stage | Calls | Avg in | Avg out | $ per call | $ total |
|---|---:|---:|---:|---:|---:|
| amazon_import | 2 | 12,375 | 2,808 | 0.053 | 0.106 |
| competitor_import | 5 | 2,526 | 302 | 0.008 | 0.040 |
| review_insights | 2 | 5,254 | 428 | 0.015 | 0.030 |
| bio | 1 | 1,062 | 122 | 0.003 | 0.003 |
| brief_help | 2 | 2,256 | 194 | 0.006 | 0.013 |
| positioning_help | 3 | 2,821 | 274 | 0.008 | 0.025 |
| drift_check | 2 | 2,497 | 90 | 0.006 | 0.012 |
| title_ideas | 2 | 3,435 | 1,282 | 0.020 | 0.039 |
| outline_ideas | 2 | 5,666 | 604 | 0.017 | 0.035 |
| outline_check | 2 | 3,961 | 59 | 0.009 | 0.017 |
| **Plan stages** | | | | | **0.32** (106k tokens) |
| section_write (22 sections + 50% redo or continue = 33 calls; 18,000 words written at 1.7 tokens a word) | 33 | 4,539 | 927 | 0.018 | **0.61** (180k tokens) |
| section_check (2 per section) | 44 | 4,697 | 267 | 0.012 | **0.53** (218k tokens) |
| section_improve (4 per section) | 88 | 3,017 | 206 | 0.008 | **0.71** (284k tokens) |
| **Total** | | | | | **about $2.2, about 0.79M tokens** |

- **Lean book** (10,000 words, one Generate per section, one check, one Improve each): about **$1.1** and 0.38M tokens.
- **Heavy book** (15,000 words, full Research: about 8,000 input tokens per Write and Check call, two passes, 6 Improves per section): about **$4.1** and 1.6M tokens.
- **Monthly limit:** the default is 2,000,000 tokens (`lib/limits.ts:37`). A normal book uses about 40% and a heavy one about 80%. Two heavy books in one month would hit the limit. Input tokens are about 90% of the token count and about two thirds of the cost. Most of that input is the same Brief, Research, positioning and outline, sent again on every call (L7).
- Write, Check and Improve are about 85% of the cost. The plan stages are cheap.

## 7. Safety check

| Stage | User text in escaped tags (`asData`) | "Data, never instructions" line | Tags named in the prompt | Follows text inside the data? |
|---|---|---|---|---|
| bio | yes | yes | all | no |
| amazon_import | yes (`<page_text>`) | yes, "untrusted data from a web page" | all | no |
| competitor_import | yes | yes | all | no |
| brief_help | yes | yes | misses `<topic_lab_name>` (L4) | no |
| review_insights | yes | yes, "untrusted data from the web" | all | no |
| positioning_help | yes | yes | all | no |
| drift_check | yes | yes | all | no |
| title_ideas | yes | yes | all | no |
| outline_ideas | yes | yes | misses `<book_subtitle>` (L4) | no |
| outline_check | yes | yes | all | no |
| section_write | yes | yes | all | no |
| section_improve | yes | yes | all | only the Custom `<instruction>`, by design, "only within these rules" |
| section_check | yes | yes | all | no |

- Values that skip `asData` are numbers and app labels only: review counts, ratings, the B1 labels, `kind`, chapter and section numbers, part, `examples` and `exercise` yes or no, and the word aim. None of them is user text.
- Third-party text (Amazon pages and reviews) enters only amazon_import, competitor_import and review_insights. Later prompts get only model-written results that our code has cleaned: book rows, and insight lines of at most 160 characters with a copy check. They are escaped again.
- After each reply, our code decides what is kept:
  - quotes must really be in the text (drift_check, outline_check, section_check);
  - numbers must be on the pasted page (competitor_import);
  - labels must be real (review_insights);
  - links, HTML and tables are removed (Write, Improve);
  - new names, structure changes and lost marks are noted (Improve).

## 8. What works well (keep)

- One section per call, and the server reads all the data itself. The browser sends ids only.
- The positioning is not a source (`context.ts:160-164`), so an accepted unsourced number cannot launder itself.
- Drift flags the author kept stay kept on the next check.
- The AI check and the outline check keep only quotes that are really in the text.
- Generate's word accuracy at normal section sizes (section 5.2).
- Generate wrote no em dashes in the whole test book.

## 9. Suggested fix order (owner decides)

1. **Before E12 starts (no deploy):** check each pen name's Perspective setting (H2). Start a new book (L8).
2. **One prompt batch, one deploy:** H2 (prompt part), H3, M2, M3, M4, M5, M6, M10, L1, L2, L3, L4. M1 and L5 can go in the same batch (code in `common.ts` and `context.ts`, plus tests).
3. **Browser only:** M9 (ends mid-sentence warning), the H2 label, and M7 (B) if chosen.
4. **Own task:** H1 (`source` check type: migration, deploy, browser). Then M8 (`<book_so_far>`: store read and deploy).
5. **Later:** L6 and L7.

Owner choices needed: H2 (what Perspective means), H3 (names: A or B; examples in which section), M7 (A or B).
