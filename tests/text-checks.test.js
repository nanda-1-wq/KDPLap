// deno test --allow-read tests/text-checks.test.js   (from the repo root)
// The Checks tab's code checks (js/text-checks.js, E10.4): the number rule
// against the server's markUnsourced (the E10.2 marker rows, read from
// lib.section_write.test.ts as data, and more), the known text against the
// server's writeKnown, then repeated phrases, the same opener, words vs the
// target, open marks, and the speed on a 16,000-word section. E12 fix batch 2:
// repeats as info, never the section's own topic (item 7); "Source not named"
// and the label strip against the server's (items 9, 10); the same sentence
// in another section (item 11 A). E12 fix batch 3: "according to … source"
// in the Source row (5a), the "Check that the source is named" info row (D2,
// D3) and the "Points back to another part" info row (5b).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { completeEnd, endsMidSentence, markUnsourced, SOURCE_LABEL, stripSourceLabels, writeKnown } from "../supabase/functions/generate/lib/section_write.ts";
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

Deno.test("mention row (E12 Part 3): every listed phrase, any case and spacing, in paragraphs and list items", () => {
  const FLAGGED = [
    "The next section shows you how to start.",
    "In the next chapter, you will build the routine.",
    "In the following section, we try it in bed.",
    "The following chapter covers the evening.",
    "You will learn more later in this book.",
    "This comes back later in the book.",
    "We return to it later in this chapter.",
    "In section 3.1, you met four quick practices.",
    "Section 2 shows the steps.",
    "Chapter 5.2 will show you where they fit.",
    "See chapter 4 for the full routine.",
    "THE NEXT  SECTION has more.",
    "Read the next\tchapter first.",
  ];
  for (const t of FLAGGED) {
    const row = T.check(t, {}).rows.find((r) => r.code === "mention");
    assert(row, t);
    assertEquals([row.kind, row.text, row.sub], ["warn", "Mentions another part of the book", "Cut it, or say what that part covers."], t);
    assertEquals(row.sents.map((x) => x.text), [t.replace(/\s+/g, " ")], t);
  }
  const ALLOWED = [
    "You met this earlier in this book.", "Go back to the breathing practice earlier in this chapter.", "Take the next step slowly.",
    "The next morning, try it again.", "Do the following steps in order.", "Rest for a section of the routine.", "This chapter is short.",
    "The next sections are short.", "Later in the day, rest.", "Step 2 is the long exhale.",
  ];
  for (const t of ALLOWED) assertEquals(T.check(t, {}).rows.some((r) => r.code === "mention"), false, t);
  // A list item is checked; a heading is not.
  const item = T.check("- Then read the next section.", {}).rows.find((r) => r.code === "mention");
  assertEquals(item.sents.length, 1);
  assertEquals(T.check("## What the next chapter covers\n\nRest well.", {}).rows.some((r) => r.code === "mention"), false);
});

Deno.test("mention row (E12 Part 3): one entry per sentence, Show on the sentence, counted, after the ending row", () => {
  const md = "Breathe out slowly. The next section, like the next chapter, shows more.\n\nRest well. In section 3.1 you met it. Then stop and";
  const out = T.check(md, {});
  const row = out.rows.find((r) => r.code === "mention");
  assertEquals(row.sents.map((x) => x.text), ["The next section, like the next chapter, shows more.", "In section 3.1 you met it."]);
  for (const x of row.sents) assertEquals(md.slice(x.start, x.end), x.text);
  assertEquals(row.ranges, row.sents.map((x) => ({ start: x.start, end: x.end })));
  assertEquals(out.rows.map((r) => r.code), ["ending", "mention"]);
  assertEquals(out.warnings, 2);
  // A marked sentence is matched on its words, without the mark.
  const marked = T.check("The next chapter proves it." + M, {}).rows.find((r) => r.code === "mention");
  assertEquals(marked.sents[0].text, "The next chapter proves it.");
});

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

Deno.test("ending (fix batch 2, item 9): source labels are not text; the server's rule on the text without labels", () => {
  const cases = ["You can always do more than the minimum. [S3]", "Done.[S12]", "Done. [S3, S5]\n\n[S2]", "Cut mid sen [S3]", "Para one.\n\nHalf a sent (S2)"];
  for (const md of cases) assertEquals(T.ending(md) !== null, endsMidSentence(stripSourceLabels(md)), JSON.stringify(md));
  assertEquals(T.ending("You can always do more than the minimum. [S3]"), null);
  assertEquals(T.ending("Cut mid sen [S3]").text, "Cut mid sen [S3]");
});

/* ── E12 fix batch 2 ── */

Deno.test("repeated phrases (fix batch 2, item 7): info and never counted; the section title and its own subheadings are not repeats", () => {
  // The real book: "five-minute habit" in "Five-minute habits for your emptiest days" (singular or plural).
  const md = "Pick one five-minute habit. A five-minute habit is small. Any five-minute habit counts.";
  assertEquals(T.check(md, { title: "Five-minute habits for your emptiest days" }).rows.filter((r) => r.code === "repeat"), []);
  // Without the title it shows, as info, and the tab does not count it.
  const out = T.check(md, {});
  const row = out.rows.find((r) => r.code === "repeat");
  assertEquals([row.kind, row.text, out.warnings], ["info", '"five-minute habit" used 3 times', 0]);
  // "look and touch" is one of the section's subheadings; the heading is not a use either.
  const sub = "## Look and touch\n\nLook and touch the cup. Then look and touch the table. Now look and touch the door.";
  assertEquals(T.check(sub, {}).rows.filter((r) => r.code === "repeat"), []);
  assertEquals(T.check(sub.replace("## Look and touch\n\n", ""), {}).rows.filter((r) => r.code === "repeat").map((r) => r.text), ['"look and touch the" used 3 times']);   // the longest phrase
  // A phrase with a word outside the topic still shows; touches / touch match both ways.
  const mixed = "Build morning habits early. Then build morning habits again. Always build morning habits.";
  assertEquals(T.check(mixed, { title: "Morning habits" }).rows.filter((r) => r.code === "repeat").map((r) => r.text), ['"build morning habits" used 3 times']);
  assertEquals(T.check("A light touch now. One light touch again. Only light touch here.", { title: "Light touches" }).rows.filter((r) => r.code === "repeat"), []);
  // Only headings: nothing to count.
  assertEquals(T.check("## Roll your shoulders\n\n## Roll your shoulders\n\n## Roll your shoulders", {}).rows.filter((r) => r.code === "repeat"), []);
});

Deno.test("source labels (fix batch 2, item 9): the same pattern and strip as the server", () => {
  assertEquals(T.SOURCE_LABEL.source, SOURCE_LABEL.source);
  assertEquals(T.SOURCE_LABEL.flags, SOURCE_LABEL.flags);
  const cases = [
    "You can always do more than the minimum. [S3]", "Fogg [S3] says start small.", "Start small [S3, S5].", "Start small [S3; S4] today (S2).",
    "Start small [S3-S5].", "Done.[S12]", "[S3] Fogg says so.", "- [S1] a list item", "  Indented [S2]", "Habits stick. [Verify: no source]",
    "Rest for [2] minutes and see [the guide] or (S) or [S] or SS3.", "One. [S1]\nTwo. [S2]\n\n## Three [S3]", "",
  ];
  for (const c of cases) assertEquals(T.stripLabels(c), stripSourceLabels(c), c);
});

Deno.test("source row (fix batch 2, items 9 and 10): labels and sources with no name; counted", () => {
  const md = "Start small, Fogg says. You can always do more than the minimum. [S3]\n\nAnother source suggests a timer. A source of stress is noise.\n\n- Fogg [S2, S4] says start tiny.\n\nOne source puts it this way: rest.";
  const out = T.check(md, {});
  const row = out.rows.find((r) => r.code === "source");
  assertEquals([row.kind, row.text, row.sub], ["warn", "Source not named", "Name the author or the title, or cut it."]);
  // Show selects just the label, or the whole sentence for a source with no name.
  assertEquals(row.ranges.map((g) => md.slice(g.start, g.end)), ["[S3]", "Another source suggests a timer.", "[S2, S4]", "One source puts it this way: rest."]);
  assertEquals(row.sents.map((x) => x.text), ["You can always do more than the minimum. [S3]", "Another source suggests a timer.", "Fogg [S2, S4] says start tiny.", "One source puts it this way: rest."]);
  assertEquals(out.warnings, 1);
  // Other sources, the other source; never "a source of", "the source" or a named one.
  for (const t of ["Other sources agree on this.", "The other source puts it simply.", "Some sources say so."]) assert(T.check(t, {}).rows.some((r) => r.code === "source"), t);
  // A label right after a sentence, then more text: shown with the sentence it ends; a source
  // with no name after it is shown and selected without the label.
  const md2 = "You can always do more. [S3] Another source suggests a timer.";
  const r2 = T.check(md2, {}).rows.find((r) => r.code === "source");
  assertEquals(r2.sents.map((x) => [x.text, md2.slice(x.start, x.end)]), [["You can always do more. [S3]", "[S3]"], ["Another source suggests a timer.", "Another source suggests a timer."]]);
  for (const t of ["Sleep is a source of energy.", "The source of the problem is time.", "BJ Fogg says start small.", "## Another source\n\nRest."]) assertEquals(T.check(t, {}).rows.filter((r) => r.code === "source"), [], t);
});

Deno.test("source row (fix batch 3, 5a): \"according to a / one / another / some source(s)\" is counted", () => {
  for (const t of ["According to one source, ten minutes is enough.", "According to a source, sleep helps.", "Rest more, according to some sources.", "according to another source it works."]) {
    const out = T.check(t, {});
    assert(out.rows.some((r) => r.code === "source"), t);
    assertEquals(out.rows.some((r) => r.code === "named"), false, t);   // one row per sentence
    assertEquals(out.warnings, 1, t);
  }
  assertEquals(T.check("According to Smith, ten minutes is enough.", {}).rows.some((r) => r.code === "source"), false);
});

Deno.test("named row (fix batch 3, D2 and D3): research or experts with no name; info, never counted", () => {
  const flagged = [
    "Recent research shows that short breaks work.", "Studies show that habits form slowly.", "A study found a link.", "Science says rest matters.",
    "The evidence suggests otherwise.", "Research has shown this twice.", "Studies have shown this.", "Research tells us to rest.", "One study confirms it.",
    "Experts agree that posture matters less than movement.", "Scientists say sleep helps.", "Researchers recommend short walks.", "Doctors suggest rest.",
    "- Research shows lists help.",
  ];
  for (const t of flagged) {
    const out = T.check(t, {});
    const row = out.rows.find((r) => r.code === "named");
    assert(row, t);
    assertEquals([row.kind, row.text, row.sub], ["info", "Check that the source is named", "Name the author or the title in this sentence or the one before. Not counted."], t);
    assertEquals(out.warnings, 0, t);
    assertEquals(out.rows.some((r) => r.code === "source"), false, t);
  }
  // D2: the source is named nearby.
  const lally = "Lally's study followed 96 people. This research shows the habit took 66 days.";
  assertEquals(T.check(lally, {}).rows.filter((r) => r.code === "named" || r.code === "source"), [], lally);
  const named = [
    "This study found a link.", "That research suggests a walk.", "These studies show the same.", "Those studies found it too.", "The same research shows it.",
    "Smith's research shows it too.", "Smith’s study found it.", "Their studies found the same.", "His research says so.", "Her study shows it.", "Its evidence suggests rest.",
    "Research by Lally shows it.", "Research matters.", "Do your own research and see.", "## Research shows\n\nRest.", "Experts on sleep agree.",
  ];
  for (const t of named) assertEquals(T.check(t, {}).rows.some((r) => r.code === "named"), false, t);
  // Show selects each sentence; the order is source, named.
  const md = "Another source suggests a timer. Recent research shows that short breaks work.\n\nExperts agree on it.";
  const out = T.check(md, {});
  const row = out.rows.find((r) => r.code === "named");
  assertEquals(row.ranges.map((g) => md.slice(g.start, g.end)), ["Recent research shows that short breaks work.", "Experts agree on it."]);
  assertEquals(out.rows.map((r) => r.code), ["source", "named"]);
  assertEquals(out.warnings, 1);
  // A sentence with an open Verify mark is in the marks row only.
  assertEquals(T.check("Studies show rest helps." + M, {}).rows.map((r) => r.code), ["marks"]);
});

Deno.test("backref row (fix batch 3, 5b): points back to another part; info, never counted; previews stay in mention", () => {
  const flagged = ["As covered earlier in this chapter, breathe out slowly.", "We met this earlier in the book.", "Earlier in this section you tried it.",
    "Go back to the box breath in the previous chapter.", "In the last section you set a timer.", "As mentioned earlier, rest.", "As described earlier, sit tall.", "As shown earlier, it helps."];
  for (const t of flagged) {
    const out = T.check(t, {});
    const row = out.rows.find((r) => r.code === "backref");
    assert(row, t);
    assertEquals([row.kind, row.text, row.sub], ["info", "Points back to another part", "Check that it points to the right place. Not counted."], t);
    assertEquals(out.warnings, 0, t);
  }
  for (const t of ["Do it earlier in the day.", "Sit tall, as you did before.", "The last chapter of your day is sleep.", "## Earlier in this chapter\n\nRest."]) {
    assertEquals(T.check(t, {}).rows.some((r) => r.code === "backref"), false, t);
  }
  // Q5: a preview stays a counted warning, and is not listed again as a back reference.
  const md = "Later in this chapter you will try it. As covered earlier in this chapter, breathe out slowly.";
  const out = T.check(md, {});
  assertEquals(out.rows.map((r) => r.code), ["mention", "backref"]);
  assertEquals(out.rows[1].sents.map((x) => x.text), ["As covered earlier in this chapter, breathe out slowly."]);
  assertEquals(out.warnings, 1);
  const both = "Later in this book, and earlier in this chapter too, we rest.";
  assertEquals(T.check(both, {}).rows.map((r) => r.code), ["mention"]);
});

Deno.test("again row (fix batch 2, item 11 A): sentences of 8+ words that another section has, with where", () => {
  const s1 = "Starting is often the hardest part, and you can always do more than the minimum.";
  const md = `Pick a time. ${s1}${M}\n\nKeep going with this small step every single day.\n\nShort lines are fine here.`;
  const others = [
    { label: "2.3", text: `Intro. ${s1.replace(",", "").toUpperCase()}` },
    { label: "4.1", text: `## Starting\n\n- ${s1} [S3]` },
    { label: "1.1", text: "Short lines are fine here. Nothing else is the same in this one at all." },
    { label: "Conclusion", text: "## Keep going with this small step every single day." },
  ];
  const out = T.check(md, { others });
  const row = out.rows.find((r) => r.code === "again");
  assertEquals([row.kind, row.text, row.sub], ["warn", "1 sentence is also in another section", "Rewrite it here or cut it."]);
  assertEquals(row.sents.map((x) => [x.text, x.where]), [[s1, ["2.3", "4.1"]]]);   // a 5-word sentence and a heading do not count
  assertEquals(md.slice(row.ranges[0].start, row.ranges[0].end), `${s1}${M}`);
  assertEquals(out.warnings, 2);   // the open mark and this row
  assertEquals(out.rows.map((r) => r.code), ["marks", "again"]);
  // No other sections, or the same sentence twice in this section only: no row.
  assertEquals(T.check(md, {}).rows.some((r) => r.code === "again"), false);
  assertEquals(T.bookRepeats(`${s1} ${s1}`, [{ label: "2.1", text: "Nothing alike here at all in these many words." }]), []);
  // The plural: two sentences.
  const s2 = "Write one flashcard before you open your phone each morning.";
  assertEquals(T.check(`${s1} ${s2}`, { others: [{ label: "3.2", text: `${s2} ${s1}` }] }).rows.find((r) => r.code === "again").text, "2 sentences are also in another section");
});

Deno.test("sentenceKeys: 8+ words in paragraphs and list items; marks, labels, ** and punctuation left out", () => {
  const md = "## A heading with many words in it today now\n\n- **Open** the book to the page you left, and read one line. [S3]\n\nToo short to count here." + M;
  const keys = T.sentenceKeys(md);
  assertEquals(keys.map((k) => k.key), ["open the book to the page you left and read one line"]);
  assertEquals(keys[0].text, "**Open** the book to the page you left, and read one line. [S3]");
});
