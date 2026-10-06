/* generate lib: Small helpers shared by the stages: text, prompt data, reply reading.
   Moved from lib.ts in Batch B1 without changes. lib.ts re-exports the public names. */

import { type PageBook } from "./amazon_import.ts";
import { type BriefSuggestions } from "./brief_help.ts";
import { type DriftFlag } from "./drift_check.ts";
import { type ErrorCode, type PositioningField } from "./limits.ts";
import { type PositioningSuggestions } from "./positioning_help.ts";
import { type Insights } from "./review_insights.ts";
import { type TitleIdea } from "./title_ideas.ts";

const TONES: Record<string, string> = {
  warm: "Warm", encouraging: "Encouraging", practical: "Practical",
  direct: "Direct", humorous: "Humorous", formal: "Formal",
};
const READING: Record<string, string> = { beginner: "Beginner", general: "General", advanced: "Advanced" };
const SENTENCES: Record<string, string> = { short: "Short and simple", mixed: "Mixed", long: "Long and detailed" };

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});


/** Voice as labels. Unknown values are left out. The writing sample is not sent (cost). */
export function readVoice(raw: unknown) {
  const j = obj(raw);
  const tones = Array.isArray(j.tones) ? j.tones.filter((t) => typeof t === "string" && TONES[t]).map((t) => TONES[t as string]) : [];
  const pick = (map: Record<string, string>, v: unknown) => (typeof v === "string" && map[v]) || "";
  return { tones: [...new Set(tones)], reading_level: pick(READING, j.reading_level), sentences: pick(SENTENCES, j.sentences) };
}

/** User text goes inside XML tags. Angle brackets are escaped so it can't close a tag. */
export function asData(s: string): string {
  const t = s.trim();
  return t ? t.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "(not given)";
}

// Same keys and words as js/book-brief.js. Unknown values are left out.
export const BOOK_TYPES: Record<string, string> = {
  beginner_guide: "Beginner guide", how_to: "How-to guide", workbook: "Workbook",
  self_help: "Self-help", cookbook: "Cookbook",
};

export const STRING_LIST = { type: "array", items: { type: "string" } };

export type Outcome = {
  status: "ok" | "failed" | "stopped";
  counted: boolean;
  inputTokens: number;
  outputTokens: number;
  code: ErrorCode | null;   // null = success
  bio?: string;
  missing?: string;
  books?: PageBook[];
  suggestions?: BriefSuggestions;
  insights?: Insights;
  positioning?: PositioningSuggestions;
  unsourced?: Partial<Record<PositioningField | keyof BriefSuggestions, string[]>>;
  flags?: DriftFlag[];
  titles?: TitleIdea[];
};


const tokens = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

/**
 * The provider's reply as parsed JSON, or a failed/stopped Outcome.
 * Failed and stopped calls are not counted (CLAUDE.md §5).
 */
export function readReply(httpOk: boolean, body: unknown): { base: Pick<Outcome, "inputTokens" | "outputTokens">; out?: Record<string, unknown>; fail?: Outcome } {
  const b = obj(body);
  const usage = obj(b.usage);
  const base = { inputTokens: tokens(usage.input_tokens), outputTokens: tokens(usage.output_tokens) };
  const failed = (code: ErrorCode): Outcome => ({ ...base, status: "failed", counted: false, code });

  if (!httpOk) return { base, fail: failed("ai_unavailable") };
  if (b.stop_reason === "refusal") return { base, fail: failed("ai_declined") };
  if (b.stop_reason === "max_tokens") return { base, fail: { ...base, status: "stopped", counted: false, code: "ai_stopped" } };
  if (b.stop_reason !== "end_turn") return { base, fail: failed("ai_unavailable") };

  const content = Array.isArray(b.content) ? b.content : [];
  const text = content.map(obj).filter((c) => c.type === "text").map((c) => str(c.text)).join("");
  try { return { base, out: obj(JSON.parse(text)) }; } catch { return { base, fail: failed("ai_unavailable") }; }
}

export const oneLine = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/** Cut to max characters at a word boundary. */
export function cutWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : s.slice(0, max)).replace(/[\s,;:.-]+$/, "");
}

/** One line, no em or en dashes used as punctuation (UI style rule). */
export const cleanLine = (v: unknown) => oneLine(v, Infinity).replace(/\s+[—–]\s+|—/g, ", ");

/** Whole numbers and decimals in a text, without thousands commas: "1,200" → "1200". */
export function numbersIn(s: string): string[] {
  return [...s.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, ""));
}

/** Numbers in a suggestion that appear nowhere in the author's data. The UI shows "Verify: no source". */
export function unsourcedNumbers(text: string, known: string): string[] {
  const have = new Set(numbersIn(known));
  return [...new Set(numbersIn(text).filter((n) => !have.has(n)))];
}

/**
 * A list from the model: one line each, no repeats (any case), capped.
 * Lines over the limit are cut at a word; a tag over the limit is dropped.
 */
export function cleanList(raw: unknown, max: { items: number; chars: number }, dropLong = false): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= max.items) break;
    const line = cleanLine(item);
    if (dropLong && line.length > max.chars) continue;
    const t = cutWords(line, max.chars);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
