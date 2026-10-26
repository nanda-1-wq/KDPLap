/* generate lib: the number rule (E12 step 2, M1). One rule for every stage:
   the source markers in Write and Improve (markUnsourced) and the "Verify: no
   source" lists of Brief help, Positioning, Title, Outline, the outline check
   and the AI section check (unsourcedNumbers). Moved here from lib/common.ts
   (numbersIn, withoutFigures) and lib/section_write.ts (MARKER, sentencesOf,
   claimNumbers, markUnsourced); the old outline rule (outlineUnsourced) is
   gone. js/text-checks.js has the same rule (tests/text-checks.test.js).
   lib.ts re-exports the public names. */

import { MAX_UNSOURCED } from "./limits.ts";

export const MARKER = "[Verify: no source]";

/** Whole numbers and decimals in a text, without thousands commas: "1,200" → "1200". */
export function numbersIn(s: string): string[] {
  return [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, ""));
}

/**
 * Figures of speech written with digits. They are not facts, so the number
 * check skips them: "9-to-5", "9 to 5", "24/7", "24/7/365", "24-7", "1-on-1",
 * "50/50", "20/20". ("one-on-one" has no digits, so it is never flagged.)
 * Only whole phrases count: "19-to-50", "9 to 50", "1-on-10" and "250/50"
 * are still read as numbers.
 */
const FIGURES_OF_SPEECH = /(?<![\d.,/])(?:9(?:-to-| to )5|24\/7\/365|24\/7|24-7|1-on-1|50\/50|20\/20)(?![\d/]|[.,]\d)/gi;
export const withoutFigures = (s: string) => s.replace(FIGURES_OF_SPEECH, " ");

/* ── Sentences ── */

// A possible sentence end: . ! or ? with closing quotes and an existing
// marker, then a space and a capital letter, or the line end.
const SENTENCE_END = /[.!?]+["”’)\]]*(?:\s*\[Verify: no source\])?(?=\s+["“‘(]?[A-Z]|\s*$)/g;
// Words a period follows without ending the sentence ("Dr. Lee", "etc.").
const ABBREVIATIONS = new Set("mr mrs ms dr prof st jr sr vs etc approx no fig vol inc ltd co ca".split(" "));

/** False for a period after an abbreviation ("a.m.", "e.g.", "Dr.", "J.") or a list number at the line start ("1."). */
function endsSentence(line: string, at: number): boolean {
  if (line[at] !== ".") return true;
  const word = (line.slice(0, at).match(/\S+$/)?.[0] ?? "");
  const bare = word.replace(/^["“‘(]+/, "");
  if (/^\d+$/.test(bare)) return !/^\s*(?:[-*]\s+)?$/.test(line.slice(0, at - word.length));
  return !(/^[A-Za-z](?:\.[A-Za-z])*$/.test(bare) || ABBREVIATIONS.has(bare.toLowerCase()));
}

/** A line cut into sentences; joined back they give the line exactly. Spaces between sentences start the next one. Also used by section_improve (new names). */
export function sentencesOf(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of line.matchAll(SENTENCE_END)) {
    const end = m.index! + m[0].length;
    if (line.slice(end).trim() && !endsSentence(line, m.index!)) continue;
    out.push(line.slice(start, end));
    start = end;
  }
  if (start < line.length) out.push(line.slice(start));
  return out;
}

/* ── The rule ── */

// A decimal after these words, or alone in brackets, is a section number ("see 2.1", "Sections 2.1 and 2.3", "(4.2)").
const SECTION_WORDS = /(?:\b(?:sections?|chapters?|parts?|steps?|see)|§)\s*(?:\d+(?:\.\d+)*\s*(?:,|and|or|to|-|–)\s*)*$/i;

// A sentence with these words makes every number in it a claim.
const CLAIM_WORDS = /\b(?:stud(?:y|ies)|research(?:ers?)?|surveys?|data|evidence|proven|proves?)\b/i;

// A unit of weight, size, energy or a body measure is a claim only in a sentence
// with a result word (owner, STOP 1 decision 1): "lose 10 pounds" is, "hold a 5 lb weight" is not.
const UNITS = new Set(("pound pounds lb lbs kg kgs kilo kilos kilogram kilograms gram grams oz ounce ounces stone "
  + "inch inches cm centimeter centimeters centimetre centimetres mm foot feet ft meter meters metre metres mile miles km "
  + "kilometer kilometers calorie calories kcal mg ml liter liters litre litres bmi mmhg bpm").split(" "));
const RESULT_WORDS = /\b(?:los(?:e|es|ing|t)|drop(?:s|ped|ping)?|cut(?:s|ting)?|reduc(?:e|es|ed|ing)|lower(?:s|ed|ing)?|burn(?:s|ed|t|ing)?|gain(?:s|ed|ing)?|shed(?:s|ding)?|boost(?:s|ed|ing)?|improv(?:e|es|ed|ing)|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing))\b/i;

// Book parts (the E9 outline list): a decimal or a number of 100 or more that
// counts these is a plan, not a fact ("120 seconds", "a 100-day plan", "Day 100").
// "time" and "times" are left out: "1.5 times more common" is a claim.
const PART_WORDS = new Set(("move moves step steps week weeks day days minute minutes chapter chapters month months hour hours "
  + "second seconds pose poses exercise exercises routine routines stretch stretches pattern patterns breath breaths "
  + "habit habits lesson lessons tip tips way ways part parts session sessions rule rules question questions set sets "
  + "rep reps recipe recipes tool tools worksheet worksheets plan plans level levels phase phases stage stages "
  + "check checks idea ideas").split(" "));

/**
 * Claim numbers in one sentence that the author's sources (have) do not have.
 *   Always: percentages, money, ratios ("3 in 4", "2 out of 5"), and any
 *     number in a sentence that says study, research, survey, data, evidence
 *     or proven.
 *   A unit of weight, size, energy or a body measure, only in a sentence with
 *     a result word (lose, drop, cut, reduce, lower, burn, gain, shed, boost,
 *     improve, increase, decrease).
 *   A decimal or a number of 100 or more (years too), unless it counts the
 *     book's own parts ("120 seconds", "a 100-day plan").
 *   Never: a list number at the line start, a section number ("see 2.1"), a
 *     time ("9 a.m.", "10:30"), a figure of speech ("24/7") or a small plain
 *     count ("Ruth, 68", "3 days a week", "a 15-minute routine").
 */
export function claimNumbers(sentence: string, have: Set<string>): string[] {
  const s = withoutFigures(sentence).replace(/^(\s*(?:[-*]\s+)?)\d+[.)](?=\s)/, "$1");
  const claim = CLAIM_WORDS.test(s);
  const result = RESULT_WORDS.test(s);
  const out: string[] = [];
  for (const m of s.matchAll(/(?<![A-Za-z\d.,])([$£€]\s*)?(\d+(?:[.,]\d+)*)/g)) {
    const n = m[2].replace(/,(?=\d{3}\b)/g, "");
    const before = s.slice(0, m.index);
    const after = s.slice(m.index! + m[0].length);
    // A ratio is sourced only when the sources have the same ratio, not just its numbers.
    const of = after.match(/^\s+(?:in|out of)\s+(\d+(?:,\d{3})*)\b/i)?.[1]?.replace(/,/g, "");
    if (of && !have.has(`${n} in ${of}`)) { out.push(`${n} in ${of}`); continue; }
    if (have.has(n) || out.includes(n)) continue;
    const rest = after.replace(/^\s*(?:to|-|–)\s*[$£€]?\d+(?:[.,]\d+)*/i, "");   // "40-50%": look past the range
    const percent = /^\s*(?:%|percent\b|per cent\b)/i.test(rest);
    const money = !!m[1] || /^\s*(?:dollars?|usd|euros?|cents?)\b/i.test(rest);
    const decimal = /[.,]/.test(n);
    if (!percent && !money) {
      if (/^\s*(?:[ap]\.?m\b|o'clock)/i.test(after) || /^:\d/.test(after) || /\d:$/.test(before)) continue;   // a time
      if (decimal && (SECTION_WORDS.test(before) || (/\(\s*$/.test(before) && /^\s*\)/.test(after)))) continue;
    }
    const unit = UNITS.has((rest.match(/^[\s-]*([A-Za-z]+)/)?.[1] ?? "").toLowerCase());
    const words = (rest.match(/[A-Za-z]+/g) ?? []).slice(0, 2).map((w) => w.toLowerCase());
    const part = words.some((w) => PART_WORDS.has(w)) || PART_WORDS.has((before.match(/([A-Za-z]+)[\s-]*$/)?.[1] ?? "").toLowerCase());
    if (claim || percent || money || (unit && result) || ((decimal || Number(n) >= 100) && !part)) out.push(n);
  }
  return out;
}

/** The author's numbers and ratios ("1 in 4", also written "1 out of 4"), for claimNumbers. */
function haveOf(known: string): Set<string> {
  const ratios = [...known.matchAll(/(?<![\d.,])(\d+(?:,\d{3})*)\s+(?:in|out of)\s+(\d+(?:,\d{3})*)\b/gi)]
    .map((m) => `${m[1].replace(/,/g, "")} in ${m[2].replace(/,/g, "")}`);
  return new Set([...numbersIn(known), ...ratios]);
}

/**
 * The number check on the new text (owner, E9 rule; STOP 2 rules): a
 * sentence with a claim number the Brief, Research and outline do not have
 * gets " [Verify: no source]" after the whole sentence, at most once, and
 * never when the AI already put one there. Nothing is inserted inside a word
 * or a number: removing every " [Verify: no source]" gives back the text.
 * Returns the text and how many markers it has (the AI's and ours).
 */
export function markUnsourced(text: string, known: string): { text: string; flagged: number } {
  const have = haveOf(known);
  const out = String(text || "").split("\n").map((line) => {
    if (!line.trim() || /^##\s/.test(line)) return line;
    return sentencesOf(line).map((p) => {
      if (p.includes(MARKER) || !/\d/.test(p) || !claimNumbers(p, have).length) return p;
      const sentence = p.replace(/\s+$/, "");
      return `${sentence} ${MARKER}${p.slice(sentence.length)}`;
    }).join("");
  }).join("\n");
  return { text: out, flagged: out.split(MARKER).length - 1 };
}

/** The claim numbers of a text with no source, sentence by sentence, each once, in order. The UI shows "Verify: no source". */
export function unsourcedNumbers(text: string, known: string): string[] {
  const have = haveOf(known);
  const out: string[] = [];
  for (const line of String(text || "").split("\n")) {
    for (const p of sentencesOf(line)) {
      for (const n of claimNumbers(p, have)) if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** unsourcedNumbers for a saved list: at most MAX_UNSOURCED numbers of at most 20 characters (0011, 0016, 0017, 0023). */
export const unsourcedList = (text: string, known: string) =>
  unsourcedNumbers(text, known).filter((n) => n.length <= 20).slice(0, MAX_UNSOURCED);
