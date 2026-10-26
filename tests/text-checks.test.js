// deno test --allow-read tests/text-checks.test.js   (from the repo root)
// The Checks tab's code checks (js/text-checks.js, E10.4): the number rule
// against the server's markUnsourced (the E10.2 marker rows, read from
// lib.section_write.test.ts as data, and more), the known text against the
// server's writeKnown, then repeated phrases, the same opener, words vs the
// target, open marks, and the speed on a 16,000-word section.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { completeEnd, endsMidSentence, markUnsourced, writeKnown } from "../supabase/functions/generate/lib/section_write.ts";
import { writeCtx } from "../supabase/functions/generate/test_fakes.ts";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";

const T = globalThis.kdpTextChecks;
const M = " [Verify: no source]";
const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));

/** MARK_ROWS from the server test file: [name, model text, saved text], read as data (as tests/sentences.test.js). */
function markRows() {
  const src = read("supabase/functions/generate/lib.section_write.test.ts");
  const body = src.match(/const MARK_ROWS: \[string, string, string\]\[\] = \[\n([\s\S]*?)\n\];/);
  if (!body) throw new Error("MARK_ROWS not found");
  const MM = JSON.parse(src.match(/const M = ("[^"]*");/)[1]);
  const STR = /"(?:[^"\\]|\\.)*"/y;
  return body[1].split("\n").map((line) => {
    const row = [];
    let cur = "", i = line.indexOf("[") + 1;
    for (;;) {
      while (/[\s+]/.test(line[i])) i++;
      if (line[i] === '"') { STR.lastIndex = i; const m = STR.exec(line); cur += JSON.parse(m[0]); i = STR.lastIndex; }
      else if (line[i] === "M") { cur += MM; i++; }
      else if (line[i] === ",") { row.push(cur); cur = ""; i++; }
      else if (line[i] === "]") { row.push(cur); break; }
      else throw new Error(`MARK_ROWS: cannot read ${line}`);
    }
    return row;
  });
}

const ctx = writeCtx();
const KNOWN = writeKnown(ctx);
const browserKnown = () => T.knownOf(ctx.brief, { insights: ctx.insights, competitors: ctx.competitors, sources: ctx.sources }, ctx.outline);

const EXTRA = [
  "Studies show shoulder rolls cut neck pain by 40%.",
  "About 3 in 4 adults over 60 feel stiff each morning.",
  "Adults 65 and older should do balance training 3 days a week.",
  "It costs $25 a month, or 30 dollars at the door.",
  "In 1998 a survey found 12 benefits. Then rest.",
  "See section 4.2 and chapter 3.1 for more. Work 9-to-5? Try it 24/7.",
  "- Do 40-50% of the routine on day one\n1. Then 2.5 times more",
  "## 75% of readers\nHeadings are never marked, 75% of the time.",
  "Wake at 6:30 or 9 a.m. and stretch for 10 minutes.",
  "Already marked: 60% of people." + M + " Next 70% here.",
  // E12 M1: the shared rule (book parts, units with and without a result word, proven, "times").
  "Hold the pose for 120 seconds. Follow the 100-day plan. Rest for 2.5 minutes.",
  "Hold a 5 lb weight. Some readers lose 10 pounds in a month. Burn 300 calories.",
  "It is proven to help in 11 weeks. Falls are 2.5 times more likely at night.",
  "Walk 1.5 miles a day. Cut 12 kg of body weight. Since 2019, 7 out of 10 readers stretch.",
];

Deno.test("mark: the same text as the server's markUnsourced (E10.2 marker rows and more)", () => {
  const rows = markRows();
  assert(rows.length >= 30, `rows: ${rows.length}`);
  for (const text of [...rows.map((r) => r[1]), ...rows.map((r) => r[2]), ...EXTRA, rows.map((r) => r[1]).join("\n\n")]) {
    assertEquals(T.mark(text, KNOWN), markUnsourced(text, KNOWN), text.slice(0, 60));
    assertEquals(T.mark(text, ""), markUnsourced(text, ""), text.slice(0, 60));
  }
});

Deno.test("knownOf: the same text as the server's writeKnown", () => {
  assertEquals(browserKnown(), KNOWN);
  assertEquals(T.knownOf({}, {}, []), writeKnown({ ...ctx, brief: { topic_text: null, book_type: null, target_reader: null, reader_problem: null, promise_draft: null, options: null }, insights: null, competitors: [], sources: [], outline: [] }));
});

Deno.test("numbers row: exactly the sentences mark() marks, with their offsets", () => {
  const rows = markRows();
  const md = [...rows.map((r) => r[1]), ...EXTRA].join("\n\n");
  const marked = T.mark(md, KNOWN).flagged - (md.split(M).length - 1);
  const r = T.check(md, { known: KNOWN }).rows.find((x) => x.code === "number");
  assertEquals(r.ranges.length, marked);
  for (const g of r.ranges) assert(/\d/.test(md.slice(g.start, g.end)) && !md.slice(g.start, g.end).includes(M.trim()), md.slice(g.start, g.end));
  // One number: named with its sign; Research numbers are not flagged.
  const one = T.check("Studies show shoulder rolls cut neck pain by 40%. Adults 65 and older should do balance training 3 days a week.", { known: KNOWN });
  const n = one.rows.find((x) => x.code === "number");
  assertEquals([n.text, n.sub, n.sents.length], ['"40%" has no source', "Add a source in 02 Research, or mark it.", 0]);
  assertEquals(one.rows.filter((x) => x.code === "number").length, 1);
  assertEquals(T.check("It costs $25 a month.", { known: "" }).rows[0].text, '"$25" has no source');
  assertEquals(T.check("About 3 in 4 adults feel stiff.", { known: "" }).rows[0].text, '"3 in 4" has no source');
  // A sentence that already has a mark is an open mark, never also a number.
  const both = T.check("Already marked: 60% of people." + M, { known: "" });
  assertEquals(both.rows.map((x) => x.code), ["marks"]);
});

Deno.test("open marks: one row, each sentence listed with its place", () => {
  const md = "## Shoulder rolls\n\nShoulder rolls ease the stiffness. Most people feel looser within a week." + M + "\n\n- Sit tall. Studies show it helps." + M;
  const r = T.check(md, { known: "" }).rows.find((x) => x.code === "marks");
  assertEquals(r.text, "2 claims need a source");
  assertEquals(r.sents.map((s) => s.text), ["Most people feel looser within a week.", "Studies show it helps."]);
  for (const s of r.sents) assert(md.slice(s.start, s.end).endsWith(M.trim()));
  assertEquals(T.check("Most people feel looser." + M, { known: "" }).rows[0].text, "1 claim needs a source");
});

Deno.test("repeated phrases: 3+ words, 3+ times, the longest, never common words only", () => {
  const md = [
    "Roll your shoulders back. Then roll your shoulders forward. Now roll your shoulders slowly.",
    "Keep it in the chair. Sit in the chair. Rest in the chair.",
    "You can do it. You can do it today. You can do it now.",
  ].join("\n\n");
  const reps = T.check(md, { known: "" }).rows.filter((x) => x.code === "repeat");
  assertEquals(reps.map((r) => r.text), ['"roll your shoulders" used 3 times', '"in the chair" used 3 times']);
  assertEquals(reps[0].ranges.map((g) => md.slice(g.start, g.end)), ["Roll your shoulders", "roll your shoulders", "roll your shoulders"]);
  // Two times is not a repeat.
  assertEquals(T.check("Roll your shoulders back. Roll your shoulders forward.", { known: "" }).rows, []);
  // The longest phrase with the same count, not its parts.
  const long = "Keep your neck long now. Keep your neck long again. Keep your neck long here.";
  assertEquals(T.check(long, { known: "" }).rows.filter((x) => x.code === "repeat").map((r) => r.text), ['"Keep your neck long" used 3 times']);
  // Never across sentences; markers are not words; case aside.
  assertEquals(T.check("Sit tall and. Breathe slowly now. Sit tall and. Breathe slowly then. Sit tall and. Breathe slowly.", { known: "" }).rows.filter((x) => x.code === "repeat").map((r) => r.text),
    ['"Sit tall and" used 3 times']);   // "breathe slowly" is 2 words: not a phrase
  assertEquals(T.check(`One.${M} Two.${M} Three.${M}`, { known: "" }).rows.filter((x) => x.code === "repeat"), []);
  // Overlapping uses count once: "go go go go go" holds "go go go" only once without overlap.
  assertEquals(T.check("Go go go go go go go.", { known: "" }).rows.filter((x) => x.code === "repeat").length, 0);
  // At most 5 rows.
  const many = Array.from({ length: 8 }, (_, i) => `Word${i} alpha${i} beta${i}.`).flatMap((s) => [s, s, s]).join(" ");
  assertEquals(T.check(many, { known: "" }).rows.filter((x) => x.code === "repeat").length, 5);
});

Deno.test("same opener: 3 in a row in paragraphs; a heading or a list resets", () => {
  const three = "You sit tall. You breathe out. You roll back.";
  const r = T.check(three, { known: "" }).rows;
  assertEquals(r.map((x) => x.text), ['3 sentences in a row start with "You".']);
  assertEquals(three.slice(r[0].ranges[0].start, r[0].ranges[0].end), three);
  assertEquals(T.check("You sit tall. You breathe out. Then roll back.", { known: "" }).rows, []);
  // A paragraph break does not reset the run.
  assertEquals(T.check("You sit tall.\n\nYou breathe out.\n\nYou roll back. You rest.", { known: "" }).rows[0].text, '4 sentences in a row start with "You".');
  assertEquals(T.check("You sit tall. You breathe out.\n\n## Next\n\nYou roll back.", { known: "" }).rows, []);
  assertEquals(T.check("You sit tall. You breathe out.\n\n- You roll back.\n\nYou rest.", { known: "" }).rows, []);
  // List items are not checked.
  assertEquals(T.check("- Keep it slow.\n- Keep it small.\n- Keep it safe.", { known: "" }).rows, []);
});

Deno.test("words vs target: under 80% and over 120% only; info, never counted", () => {
  const w = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";   // a full stop: no "ends mid-sentence" row (E12 M9)
  const at = (n) => T.check(w(n), { known: "", target: 100 }).rows.filter((x) => x.code === "words");
  assertEquals(at(79).map((x) => [x.kind, x.text, x.sub]), [["info", "79 of 100 words", "Under 80% of the target."]]);
  assertEquals(at(80), []);
  assertEquals(at(120), []);
  assertEquals(at(121).map((x) => x.sub), ["Over 120% of the target."]);
  assertEquals(T.check(w(10), { known: "" }).rows.filter((x) => x.code === "words"), []);
  // The tab count never includes it (decision 6).
  assertEquals(T.check(w(10), { known: "", target: 450 }).warnings, 0);
});

Deno.test("empty text and all clear", () => {
  assertEquals(T.check("", { known: "" }), { rows: [], warnings: 0, empty: true });
  assertEquals(T.check("  \n\n ", { known: "" }).empty, true);
  const fine = T.check("Sit near the front of your chair. Keep both feet flat on the floor.", { known: "" });
  assertEquals([fine.rows, fine.warnings, fine.empty], [[], 0, false]);
});

Deno.test("speed: under 30 ms on a 16,000-word section", () => {
  const para = "Shoulder rolls ease the stiffness that builds up after long hours of sitting. Lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**, and keep your neck long. Studies show 40% feel looser." + M;
  const md = Array.from({ length: 160 }, (_, i) => `## Part ${i + 1}\n\n${para} ${para}\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor`).join("\n\n");
  const words = globalThis.kdpWords.count(md);
  assert(words >= 16000, String(words));
  T.check(md, { known: KNOWN, target: 450 });   // warm up
  const times = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); T.check(md, { known: KNOWN, target: 450 }); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  assert(times[2] < 30, `median ${times[2].toFixed(1)} ms for ${words} words`);
});

// E12 M4/M9: the browser's ending() and the server's endsMidSentence and completeEnd are one rule.
const ENDINGS = [
  "Done.", "Done", 'She said "stop."', "**Bold end.**", "Really?!", "Wait…", "A claim." + M, "Cut mid sen", "Then do this:",
  "(see below)", "## Heading", "- an item with no period", "1. an item", "Text.\n\n", "", "Para.\n\nmessages of saf",
  "One.\n\n[Verify: no source]", "That is real progress. In the next", "Para one.\n\nAlso done. Then half",
];

Deno.test("ending row (E12 M9): a warning with Show on the cut piece, counted; none when the text ends complete", () => {
  const md = "## Rest\n\nIf your body stays tight, be patient with it. Stored tension needs gentle messages of saf";
  const out = T.check(md, {});
  const row = out.rows.find((r) => r.code === "ending");
  assertEquals([row.kind, row.text, row.sub], ["warn", "The section ends mid-sentence.", "Finish the last sentence or cut it."]);
  assertEquals(md.slice(row.ranges[0].start, row.ranges[0].end), "Stored tension needs gentle messages of saf");
  assertEquals(row.sents, []);
  assertEquals(out.warnings, 1);
  assertEquals(T.check("## Rest\n\nBe patient with it.", {}).rows.some((r) => r.code === "ending"), false);
  assertEquals(T.check("- Breathe in\n- Breathe out", {}).rows.some((r) => r.code === "ending"), false);
  // The order: open marks, numbers, then the ending, then repeats.
  const both = T.check("Studies show 40% sit all day." + M + " Then sit and", {});
  assertEquals(both.rows.map((r) => r.code), ["marks", "ending"]);
});

Deno.test("ending: the same answer as the server's endsMidSentence, and the cut piece completeEnd removes", () => {
  for (const md of ENDINGS) {
    const e = T.ending(md);
    assertEquals(e !== null, endsMidSentence(md), JSON.stringify(md));
    if (!e) continue;
    assertEquals(md.slice(e.start, e.end), e.text, JSON.stringify(md));
    // What is left before the cut piece is what the server keeps.
    assertEquals(md.slice(0, e.start).replace(/\s+$/, ""), completeEnd(md), JSON.stringify(md));
  }
  assertEquals(T.ending("That is real progress. In the next"), { start: 23, end: 34, text: "In the next" });
});
