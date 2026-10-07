/* generate lib: The positioning context shared by positioning_help, drift_check and title_ideas.
   Moved from lib.ts in Batch B1 without changes. lib.ts re-exports the public names. */

import { asData, bookTypeText, obj, readVoice, str } from "./common.ts";
import { MAX_COMPETITORS, MAX_PROMPT_SOURCE_CHARS, MAX_PROMPT_SOURCES, MAX_SOURCE_BODY, POSITIONING_FIELDS, type PositioningField } from "./limits.ts";

/** The saved positioning row, as read through RLS. */
export type PositioningRow = {
  one_sentence: string | null;
  reader_promise: string | null;
  approach: string | null;
  lacks: unknown;
  selling_points: unknown;
  focus_tags: unknown;
  drift_flags: unknown;
  drift_checked_at: string | null;
  locked_at: string | null;
  updated_at: string;
};

/** What positioning_help and drift_check read through RLS: Brief, pen voice, Research, positioning. */
export type PositioningContext = {
  bookId: string;
  brief: {
    topic_text: string | null;
    book_type: string | null;
    book_type_label?: string | null;   // 0015: only with book_type "other"
    target_reader: string | null;
    reader_problem: string | null;
    promise_draft: string | null;
    options: unknown;
  };
  pen: { niche: string | null; voice: unknown } | null;
  insights: { loves: unknown; hates: unknown; gaps: unknown } | null;
  competitors: { title: string; author: string | null; created_at: string }[];
  sources: { kind: string; body: string; citation: string | null; created_at: string }[];
  positioning: PositioningRow | null;   // null before the first save
};

export type PositioningValues = {
  one_sentence: string;
  reader_promise: string;
  approach: string;
  lacks: string[];
  selling_points: string[];
  focus_tags: string[];
};

const LIST_FIELDS = ["lacks", "selling_points", "focus_tags"] as const;
export const isListField = (f: PositioningField): f is (typeof LIST_FIELDS)[number] =>
  (LIST_FIELDS as readonly string[]).includes(f);

/** Non-blank strings of a JSON list (or a text[]), trimmed. */
const textList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean);

export function positioningValues(row: PositioningRow | null): PositioningValues {
  return {
    one_sentence: str(row?.one_sentence),
    reader_promise: str(row?.reader_promise),
    approach: str(row?.approach),
    lacks: textList(row?.lacks),
    selling_points: textList(row?.selling_points),
    focus_tags: textList(row?.focus_tags),
  };
}

/** True when at least one of the six fields has text. Checked before a drift check. */
export function hasPositioningText(row: PositioningRow | null): boolean {
  const v = positioningValues(row);
  return POSITIONING_FIELDS.some((f) => v[f].length > 0);
}

/** True when the Brief has a topic. Checked before positioning_help. */
export const positioningHasTopic = (ctx: PositioningContext) => str(ctx.brief.topic_text).length > 0;

/** Insight lines ({ text }) as plain text. */
const insightTexts = (v: unknown): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(obj(x).text)).filter(Boolean);

/**
 * Sources and notes for the prompt: oldest first, at most MAX_PROMPT_SOURCES,
 * and at most MAX_PROMPT_SOURCE_CHARS of text in all. A row that does not
 * fit is left out, so no text is cut in the middle.
 */
export function promptSources(ctx: PositioningContext) {
  const rows = [...ctx.sources]
    .filter((s) => str(s.body))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const out: PositioningContext["sources"] = [];
  let chars = 0;
  for (const s of rows) {
    if (out.length >= MAX_PROMPT_SOURCES) break;
    const size = Math.min(str(s.body).length, MAX_SOURCE_BODY) + str(s.citation).length;
    if (chars + size > MAX_PROMPT_SOURCE_CHARS) continue;
    chars += size;
    out.push(s);
  }
  return out;
}

export const listTag = (tag: string, items: string[]) =>
  items.length ? `<${tag}>\n${items.map((t) => `<item>${asData(t)}</item>`).join("\n")}\n</${tag}>` : `<${tag}>(not given)</${tag}>`;

/** The Brief and the Research as tagged data. Shared by both positioning prompts. */
export function briefAndResearch(ctx: PositioningContext): string[] {
  const b = ctx.brief;
  const o = obj(b.options);
  const v = ctx.pen ? readVoice(ctx.pen.voice) : null;
  const sources = promptSources(ctx);
  const comps = [...ctx.competitors]
    .sort((a, c) => (a.created_at < c.created_at ? -1 : 1))
    .slice(0, MAX_COMPETITORS)
    .map((c) => `<book><title>${asData(c.title)}</title><author>${asData(c.author ?? "")}</author></book>`);
  const srcLines = sources.map((s, i) => [
    `<source label="S${i + 1}" kind="${s.kind === "source" ? "source" : "note"}">`,
    `<text>${asData(str(s.body).slice(0, MAX_SOURCE_BODY))}</text>`,
    `<citation>${asData(s.citation ?? "")}</citation>`,
    "</source>",
  ].join(""));
  return [
    "<brief>",
    `<topic>${asData(b.topic_text ?? "")}</topic>`,
    `<book_type>${asData(bookTypeText(b.book_type, b.book_type_label))}</book_type>`,
    `<target_reader>${asData(b.target_reader ?? "")}</target_reader>`,
    `<reader_problem>${asData(b.reader_problem ?? "")}</reader_problem>`,
    `<promise_draft>${asData(b.promise_draft ?? "")}</promise_draft>`,
    `<stance>${asData(str(o.stance))}</stance>`,
    `<standout>${asData(str(o.standout))}</standout>`,
    "</brief>",
    "<voice>",
    `<tones>${asData(v ? v.tones.join(", ") : "")}</tones>`,
    `<reading_level>${asData(v ? v.reading_level : "")}</reading_level>`,
    `<sentences>${asData(v ? v.sentences : "")}</sentences>`,
    "</voice>",
    "<research>",
    listTag("readers_love", insightTexts(ctx.insights?.loves)),
    listTag("readers_hate", insightTexts(ctx.insights?.hates)),
    listTag("gaps", insightTexts(ctx.insights?.gaps)),
    comps.length ? `<competitors>\n${comps.join("\n")}\n</competitors>` : "<competitors>(not given)</competitors>",
    srcLines.length ? `<sources>\n${srcLines.join("\n")}\n</sources>` : "<sources>(not given)</sources>",
    "</research>",
  ];
}

export function positioningBlock(tag: string, v: PositioningValues): string[] {
  return [
    `<${tag}>`,
    `<one_sentence>${asData(v.one_sentence)}</one_sentence>`,
    `<reader_promise>${asData(v.reader_promise)}</reader_promise>`,
    listTag("lacks", v.lacks),
    `<approach>${asData(v.approach)}</approach>`,
    listTag("selling_points", v.selling_points),
    listTag("focus_tags", v.focus_tags),
    `</${tag}>`,
  ];
}


/**
 * The author's sources: Brief and Research only. Numbers found here are sourced.
 * The positioning is not a source: an unsourced number accepted there must
 * not count as sourced in the next suggestion.
 */
export function knownText(ctx: PositioningContext): string {
  const b = ctx.brief;
  const o = obj(b.options);
  return [
    b.topic_text, b.target_reader, b.reader_problem, b.promise_draft, str(o.stance), str(o.standout), str(o.references),
    ...insightTexts(ctx.insights?.loves), ...insightTexts(ctx.insights?.hates), ...insightTexts(ctx.insights?.gaps),
    ...ctx.competitors.map((c) => c.title),
    ...ctx.sources.flatMap((s) => [s.body, s.citation]),
  ].map((t) => str(t)).join("\n");
}
