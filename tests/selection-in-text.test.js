// deno test --allow-read tests/selection-in-text.test.js   (from the repo root)
// G3 P9: the generate function accepts an Improve request only when the
// selection and its before and after come from the section's text
// (selectionInText, lib/section_improve.ts). The browser builds them with
// kdpSentences.snap and kdpSentences.context (js/sentences.js) on the
// editor's Markdown. This test runs the browser's own functions on Markdown
// with bold, italic, list items, headings and a marker, and checks that the
// server rule accepts every result. The browser part (the Markdown read from
// the editor DOM) is tests/browser/write/t-improve.js.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { selectionInText } from "../supabase/functions/generate/lib/section_improve.ts";
import "../js/sentences.js";

const S = globalThis.kdpSentences;
const MARK = "[Verify: no source]";
const MD = [
  "## Before you start",
  `Sit near the front of a **sturdy chair**. Keep your *feet flat* on the floor. Most people feel looser within a week. ${MARK}`,
  "- Sit tall\n- Let your **hands rest** on your thighs\n- Breathe out slowly",
  "## Shoulder rolls",
  "Lift your shoulders toward your ears. Roll them back and down. Do this *five* times.",
  "Next, reverse the direction. " + "Roll your shoulders forward and down, again five times. ".repeat(40).trim(),
].join("\n\n");

/** A drag from the first character of `from` to the last of `to`, as the browser sends it. */
function request(from, to, md = MD) {
  const a = md.indexOf(from), b = md.indexOf(to, a) + to.length;
  assert(a >= 0 && b > a, `${from} … ${to}`);
  const pick = S.snap(md, a, b);
  const ctx = S.context(md, pick.start, pick.end);
  return { selection: pick.text, before: ctx.before, after: ctx.after };
}

Deno.test("selection in text: browser picks across Markdown pass the server rule", () => {
  const cases = [
    ["inside bold", "sturdy", "chair"],
    ["across bold and italic", "front of a **sturdy", "feet flat*"],
    ["across italic and the marker", "*feet", "week."],
    ["the marker at the end", "looser", MARK],
    ["across list items", "Let your", "slowly"],
    ["a list item into the next heading", "Breathe out", "Shoulder rolls"],
    ["a heading into a paragraph", "Shoulder", "ears."],
    ["the paragraph after a heading", "Roll them", "*five* times."],
    ["a long paragraph (context cut)", "Next, reverse", "again five times. Roll your"],
  ];
  for (const [name, from, to] of cases) {
    const r = request(from, to);
    assert(selectionInText([MD], r.selection, r.before, r.after), `${name}: ${JSON.stringify(r).slice(0, 300)}`);
    assert(selectionInText([null, MD], r.selection, r.before, r.after), `${name} (version only)`);
  }
});

Deno.test("selection in text: the whole section passes (empty before and after)", () => {
  const pick = S.snap(MD, 0, MD.length);
  const ctx = S.context(MD, pick.start, pick.end);
  assertEquals([pick.text, ctx.before, ctx.after], [MD, "", ""]);
  assert(selectionInText([MD], pick.text, ctx.before, ctx.after));
  // A section that starts and ends with blank lines: snap trims them, the rule still finds it.
  const padded = `\n\n${MD}\n\n`;
  const p2 = S.snap(padded, 0, padded.length);
  const c2 = S.context(padded, p2.start, p2.end);
  assert(selectionInText([padded], p2.text, c2.before, c2.after));
});

Deno.test("selection in text: a pick from other text, or a changed context, fails", () => {
  const r = request("sturdy", "chair");
  const other = MD.replace("Sit near the front of a **sturdy chair**.", "Sit at the front of a **sturdy chair**.");
  assertEquals(selectionInText([other], r.selection, r.before, r.after), false);
  assertEquals(selectionInText([MD], r.selection, r.before + " extra", r.after), false);
});
