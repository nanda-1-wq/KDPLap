/* generate lib: part_improve (E17 Part 6): the Improve menu on a book part in
   step 06 Write (dedication, foreword, preface, acknowledgments, About the
   author). The same actions, limits, reply rules and notes as section_improve
   (lib/section_improve.ts): this file holds only what a part changes. The
   context is the Brief and the locked Positioning (no chapter text); the
   suggestion goes to part_suggestions (0035) and the writer applies it with
   apply_part_suggestion. About the author keeps only the facts already in its
   text: the prompt says so, and our code drops a reply with a new number or a
   new name (aboutNewFacts). The stage entry is in lib/stages.ts.
   lib.ts re-exports the public names. */

import { asData, type Outcome, str } from "./common.ts";
import { knownText, type PositioningContext, positioningBlock, positioningValues } from "./context.ts";
import type { ImproveAction } from "./limits.ts";
import { MARKER, numbersIn, sentencesOf, withoutFigures } from "./numbers.ts";
import { voiceBlock, writeVoice } from "./section_write.ts";
import { improveSystem, improveTask, interpretImproveWith, namesNotIn } from "./section_improve.ts";

/** The part row, read through RLS (0035 book_parts). */
export type PartRow = {
  id: string;
  book_id: string;
  kind: string;
  enabled: boolean;
  status: string | null;
  current_version_id: string | null;
};

/**
 * What part_improve reads through RLS: the Brief, the pen name (picked in the
 * Brief) and its voice, the positioning, and the part with its current version
 * and draft. Research is read only as the number sources (knownText), never sent.
 */
export type PartContext = PositioningContext & {
  penName: string | null;
  part: PartRow;
  current: { id: string; content: string } | null;
  draft: string | null;
};

export type PartImproveJob = {
  stage: "part_improve";
  ctx: PartContext;
  bookId: string;
  partId: string;
  kind: string;
  baseVersionId: string | null;
  action: ImproveAction;
  instruction: string | null;
  selection: string;
  before: string;
  after: string;
  words: number;
  maxTokens: number;
  user: string;
  inputEstimate: number;
  reserve: number;
};

/** The part's name in the prompt. */
export const PART_NAME: Record<string, string> = {
  dedication: "Dedication",
  foreword: "Foreword",
  preface: "Preface",
  acknowledgments: "Acknowledgments",
  about_author: "About the author",
};

/* ── Prompt ── */

const PART_FIT = `Stay on what this part is for (<kind> in <part>) and on the locked positioning: its reader, reader promise and approach. No new audience, goal or angle. A book part is not a chapter: no new teaching, steps or exercises. Keep the point of view the passage has (an About the author page in the third person stays in the third person), even when <perspective> says another. Where the task says "section", it means this part.`;

const ABOUT_FACTS = `- This part is About the author. Keep only the facts about the author that are already in <passage>, <before> or <after>. Never add a degree, job, title, award, number, year, place, name, employer, client, book or credential, even one that seems likely. Never make a fact bigger ("for years" never becomes "for 20 years", "a teacher" never becomes "a leading expert"). Expand explains the facts already there; it adds no new ones.`;

export const PART_IMPROVE_SYSTEM = improveSystem({ what: "a book part (front or back matter) of a nonfiction book", tag: "<part>", fit: PART_FIT });
export const ABOUT_IMPROVE_SYSTEM = improveSystem({ what: "a book part (front or back matter) of a nonfiction book", tag: "<part>", fit: PART_FIT, facts: ABOUT_FACTS });

/** The system text for a part kind: About the author has the extra Facts rule. */
export const partImproveSystem = (kind: string) => (kind === "about_author" ? ABOUT_IMPROVE_SYSTEM : PART_IMPROVE_SYSTEM);

export function partImproveUserMessage(job: Pick<PartImproveJob, "ctx" | "kind" | "action" | "instruction" | "selection" | "before" | "after" | "words">): string {
  const ctx = job.ctx;
  const b = ctx.brief;
  return [
    // A short Brief block, as section_improve (CLAUDE.md §5). No chapter text.
    "<brief>",
    `<topic>${asData(b.topic_text ?? "")}</topic>`,
    `<target_reader>${asData(b.target_reader ?? "")}</target_reader>`,
    `<reader_problem>${asData(b.reader_problem ?? "")}</reader_problem>`,
    "</brief>",
    ...voiceBlock(ctx.pen?.voice),
    ...positioningBlock("locked_positioning", positioningValues(ctx.positioning)),
    "<part>",
    `<kind>${PART_NAME[job.kind] ?? "Book part"}</kind>`,
    `<pen_name>${asData(str(ctx.penName))}</pen_name>`,
    "</part>",
    `<before>${job.before.trim() ? asData(job.before) : "(start of the part)"}</before>`,
    `<passage>${asData(job.selection)}</passage>`,
    `<after>${job.after.trim() ? asData(job.after) : "(end of the part)"}</after>`,
    ...(job.action === "custom" ? [`<instruction>${asData(job.instruction ?? "")}</instruction>`] : []),
    "",
    improveTask(job.action, job.words),
  ].join("\n");
}

/* ── After the reply ── */

/**
 * The number sources for the source marks: the Brief and Research (as
 * sections). About the author adds what the author wrote about themselves
 * (the passage, before and after): those facts are the author's own (§5).
 */
export function partKnown(job: Pick<PartImproveJob, "ctx" | "kind" | "selection" | "before" | "after">): string {
  const own = job.kind === "about_author" ? [job.selection, job.before, job.after] : [];
  return [knownText(job.ctx), ...own].join("\n");
}

/** Words the name note knows: what was sent (the passage and its context, the Brief, the positioning, the voice sample) and the pen name. */
function partNameKnown(job: Pick<PartImproveJob, "ctx" | "selection" | "before" | "after">): string {
  const ctx = job.ctx;
  const p = positioningValues(ctx.positioning);
  return [job.selection, job.before, job.after, knownText(ctx), p.one_sentence, p.reader_promise, p.approach, ...p.lacks, ...p.selling_points, ...p.focus_tags,
    str(ctx.pen?.niche), writeVoice(ctx.pen?.voice).sample, str(ctx.penName)].join("\n");
}

// Number words a new fact may use ("ten years", "a dozen clients"). Not "one": it is a common word ("one of the").
const NUMBER_WORDS = /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|hundreds|thousand|thousands|million|millions|billion|dozen|dozens)\b/gi;

/**
 * About the author (§5: no invented credentials): the numbers and names of
 * the output that are not in the input. The input is what the AI saw of the
 * author: the passage, before, after and the pen name. Numbers: digits (not
 * figures of speech such as 24/7) and number words. Names: capitalized words
 * not at a sentence start (as the name note), and here also acronyms (MBA,
 * PhD, NYU), anywhere in a sentence. Each once, in order.
 */
export function aboutNewFacts(output: string, job: Pick<PartImproveJob, "ctx" | "selection" | "before" | "after">): { numbers: string[]; names: string[] } {
  const input = [job.selection, job.before, job.after, str(job.ctx.penName)].join("\n");
  const text = output.split(MARKER).join(" ");
  const have = new Set(numbersIn(withoutFigures(input)));
  const haveWords = new Set((input.match(NUMBER_WORDS) ?? []).map((w) => w.toLowerCase()));
  const numbers: string[] = [];
  for (const n of numbersIn(withoutFigures(text))) if (!have.has(n) && !numbers.includes(n)) numbers.push(n);
  for (const w of text.match(NUMBER_WORDS) ?? []) {
    const k = w.toLowerCase();
    if (!haveWords.has(k) && !numbers.includes(k)) numbers.push(k);
  }
  const names = namesNotIn(text, input, { acronyms: true, max: Infinity });
  // An acronym at a sentence start ("MBA in hand, she..."): namesNotIn skips sentence starts.
  const known = new Set((input.match(/[\p{L}\p{M}]+/gu) ?? []).map((w) => w.toLowerCase()));
  for (const line of text.split("\n")) {
    for (const s of sentencesOf(line.replace(/^\s*(?:##|-|[0-9]{1,9}[.)])\s+/, ""))) {
      const first = s.match(/[\p{L}\p{M}]+/u)?.[0] ?? "";
      if (first.length >= 2 && /^\p{Lu}[\p{Lu}\p{Ll}]*\p{Lu}[\p{L}]*$/u.test(first) && !known.has(first.toLowerCase()) && !names.includes(first)) names.push(first);
    }
  }
  return { numbers, names };
}

/**
 * The reply as an Outcome: the section_improve rules (interpretImproveWith)
 * with the part's own number sources and name note. Then, for About the
 * author only: a new number or a new name drops the suggestion (status
 * failed, not counted, code ai_new_facts; `dropped` says how many of each,
 * for the log). "No changes" is never dropped.
 */
export function interpretPartImprove(job: PartImproveJob, httpOk: boolean, body: unknown): Outcome & { dropped?: { numbers: number; names: number } } {
  const out = interpretImproveWith(job, httpOk, body, { known: partKnown(job), names: (text) => namesNotIn(text, partNameKnown(job)) });
  if (job.kind !== "about_author" || out.code || !out.improve || out.improve.unchanged) return out;
  const added = aboutNewFacts(out.improve.text, job);
  if (!added.numbers.length && !added.names.length) return out;
  const { improve: _drop, ...rest } = out;
  return { ...rest, status: "failed", counted: false, code: "ai_new_facts", dropped: { numbers: added.numbers.length, names: added.names.length } };
}
