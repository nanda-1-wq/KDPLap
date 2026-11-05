// Made-up books for tests/qc-rules.test.js. Every word is generated or written
// here by hand: no real book text ever goes in this file.
//
// section(text, opts) and book({ chapters, ... }) build a qc_json() reply.
// BOOKS names the fixture books of the E14.2 report. big(words) makes a book of
// that many words, the same every time.
const hex = (n, width) => n.toString(16).padStart(width, "0");
let next = 1;
export const uuid = () => `${hex(0xa0000000 + next, 8)}-0000-4000-8000-${hex(next++, 12)}`;

export function section(content, o = {}) {
  const id = uuid();
  const has = content !== null && content !== undefined;
  return {
    id, position: 1, title: o.title ?? "A section", word_target: o.target ?? null, status: o.status ?? "final", needs_review: !!o.review,
    version: has ? { id: uuid(), version_no: 1, content, partial: !!o.partial, word_count: 0 } : null,
    ai: "none", unsaved: !!o.unsaved, run: o.run ?? null,
  };
}

export const chapter = (title, sections, o = {}) => ({ id: uuid(), kind: o.kind ?? "chapter", position: 1, title, objective: o.objective ?? null, needs_review: !!o.review, sections });

export function book(o = {}) {
  const chapters = (o.chapters ?? []).map((c, i) => ({ ...c, position: i + 1, sections: c.sections.map((s, j) => ({ ...s, position: j + 1 })) }));
  return {
    data: {
      book: { id: uuid(), title: o.title ?? "Quiet Garden Paths", subtitle: o.subtitle ?? null, pen_name: "Ana Example", bio: null, trim: o.trim ?? "6x9" },
      known: { brief: { topic_text: o.topic ?? "garden paths", target_reader: null, reader_problem: o.problem ?? null, promise_draft: null, options: {} },
        research: { insights: null, competitors: [], sources: o.sources ?? [] } },
      chapters, now: "2026-11-05T10:00:00+00:00",
    },
    versions: [], inputs_key: "0".repeat(32), format: o.format ?? null,
    positioning: o.positioning ?? null, last_run: null, current: false,
    dismissed: o.dismissed ?? [], promise: o.promise ?? [], now: "2026-11-05T10:00:00+00:00",
  };
}

/** A small seeded random: the same book every time. */
function rng(seed) {
  let s = seed >>> 0;
  return (n) => { s = Math.imul(s ^ (s >>> 15), 2654435761) + 0x9e3779b9 >>> 0; return s % n; };
}

const SYL = ["ba", "ven", "lor", "mi", "tas", "ko", "rel", "su", "dan", "pi", "gor", "fen", "ta", "vi", "mar", "ost", "nel", "chu", "bri", "sol"];
const LINK_WORDS = ["with", "from", "near", "under", "over", "after", "before", "around", "beside", "across"];

/** A vocabulary of made-up words. */
function vocabulary(size, rand) {
  const out = new Set();
  while (out.size < size) out.add(`${SYL[rand(SYL.length)]}${SYL[rand(SYL.length)]}${SYL[rand(SYL.length)]}`);
  return [...out];
}

/** Paragraphs of made-up sentences, about `words` words. No numbers, no repeats. */
function prose(words, rand, vocab) {
  const w = () => vocab[rand(vocab.length)];
  const paras = [];
  let n = 0;
  while (n < words) {
    const sents = [];
    for (let i = 0; i < 5; i++) {
      const a = w();
      sents.push(`${a[0].toUpperCase()}${a.slice(1)} ${w()} the ${w()} ${LINK_WORDS[rand(LINK_WORDS.length)]} a ${w()} and ${w()} the ${w()} ${w()}.`);
      n += 12;
    }
    paras.push(sents.join(" "));
  }
  return paras.join("\n\n");
}

export function big(words, o = {}) {
  const rand = rng(o.seed ?? 7);
  const vocab = vocabulary(6000, rand);
  const perSection = o.perSection ?? 1000;
  const perChapter = 4;
  const chapters = [];
  let left = words;
  for (let c = 1; left > 0; c++) {
    const sections = [];
    for (let s = 1; s <= perChapter && left > 0; s++) {
      const n = Math.min(perSection, left);
      sections.push(section(`## ${vocab[c * 10 + s]}\n\n${prose(n, rand, vocab)}`, { title: `Part ${s}`, target: n }));
      left -= n;
    }
    chapters.push(chapter(`Chapter title ${c}`, sections));
  }
  const sources = Array.from({ length: 12 }, (_, i) => ({ kind: "source", body: `A made-up fact number ${i} about ${vocab[i]}, ${100 + i} units.`, citation: `Example${i}, A. (2020). ${vocab[i]} ${vocab[i + 1]} ${vocab[i + 2]}. A Made-up Press.` }));
  return book({ chapters, sources, title: o.title ?? "A Big Book of Made-up Words" });
}

const P = (s) => `${s} Move slowly and pause between each small step on the path. Rake the gravel flat before the rain arrives in the evening.`;

/** The fixture books of the report. */
export const BOOKS = {
  clean: () => big(6500),
  half_written: () => book({ chapters: [
    chapter("Paths", [section(P("Start at the gate."), { status: "draft", target: 900 }), section(null), section("Stones sit best on sand, and sand needs", { status: "reviewed", partial: true })]),
    chapter("Borders", [section(null), section(null)], { review: true }),
  ] }),
  messy: () => book({
    title: "Calm Sleep for Busy People", topic: "sleep", format: { style: "classic", parts: { copyright: false }, chapter_label: "chapter" },
    sources: [{ kind: "source", body: "Adults need rest.", citation: "Walker, M. (2017). Why We Sleep. Scribner." }],
    chapters: [
      chapter("Evenings", [
        section("Walker says the room should be dark. A survey found 37% of people wake early. Another source says tea helps. Rest well. [Verify: no source]\n\nSee Chapter 9 for more. Section 2.3 has the steps. The next chapter covers mornings. TODO: add a photo here.\n\nVisit https://example.com/sleep for the list 😴 and email help@example.com today. The 語 sign means rest.", { status: "draft" }),
        section("Your email can wait. Your e-mail can wait too, and so can your e-mail friends. Good healthcare helps. Health care helps. The colour of the room matters. The color of the room matters. The color of the wall matters. The color of the door matters."),
      ]),
      chapter("Mornings", [
        section("Keep the curtains open a little so the morning light can reach you. Keep the curtains open a little so the morning light can reach you.\n\nThis whole paragraph is the same in two places. It has two short sentences here."),
        section("This whole paragraph is the same in two places. It has two short sentences here."),
      ]),
    ],
  }),
  british: () => book({ chapters: [
    chapter("Colour", [section(`${P("The colour of the bed matters.")} Use a favourite colour and organise the room. Our neighbour likes the theatre.`), section("Pick a color you like. Keep the room simple and the floor clear.")]),
  ] }),
  tied: () => book({ chapters: [chapter("Tie", [section(`${P("The colour stays.")} Then the color goes.`)])] }),
  mixed_words: () => book({ title: "Quiet Rooms", chapters: [chapter("Rooms", [section(Array.from({ length: 24 }, (_, i) => `Lantern light number ${"abcdefghijklmnopqrstuvwx"[i]} falls on the lantern shelf gently.`).join(" "))])] }),
};
