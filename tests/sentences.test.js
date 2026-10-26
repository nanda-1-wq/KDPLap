// deno test --allow-read tests/sentences.test.js   (from the repo root)
// The Improve menu's sentence rule (js/sentences.js) against the server's
// (sentencesOf in generate/lib/numbers.ts since E12 step 2), on the E10.2 marker rows
// (MARK_ROWS in lib.section_write.test.ts, read from that file) and more;
// then snapping a selection to whole sentences, and the context on each side.
import { assertEquals } from "jsr:@std/assert@1";
import { mdWords, sentencesOf } from "../supabase/functions/generate/lib/section_write.ts";
import "../js/sentences.js";
import "../js/word-budget.js";

const S = globalThis.kdpSentences;
const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));

/**
 * MARK_ROWS from the server test file: [name, model text, saved text]. Read
 * as data (string literals joined with + and the constant M), never run.
 */
function markRows() {
  const src = read("supabase/functions/generate/lib.section_write.test.ts");
  const body = src.match(/const MARK_ROWS: \[string, string, string\]\[\] = \[\n([\s\S]*?)\n\];/);
  if (!body) throw new Error("MARK_ROWS not found");
  const M = JSON.parse(src.match(/const M = ("[^"]*");/)[1]);
  const STR = /"(?:[^"\\]|\\.)*"/y;
  return body[1].split("\n").map((line) => {
    const row = [];
    let cur = "", i = line.indexOf("[") + 1;
    for (;;) {
      while (/[\s+]/.test(line[i])) i++;
      if (line[i] === '"') { STR.lastIndex = i; const m = STR.exec(line); cur += JSON.parse(m[0]); i = STR.lastIndex; }
      else if (line[i] === "M") { cur += M; i++; }
      else if (line[i] === ",") { row.push(cur); cur = ""; i++; }
      else if (line[i] === "]") { row.push(cur); break; }
      else throw new Error(`MARK_ROWS: cannot read ${line}`);
    }
    if (row.length !== 3) throw new Error(`MARK_ROWS: ${row.length} cells in ${line}`);
    return row;
  });
}

const EXTRA = [
  "## Shoulder rolls, both ways",
  "- Sit near the front of your chair. Keep both feet flat.",
  "1. Breathe in as you lift. 2. Breathe out.",
  "Now lift your shoulders. Do this **five times**. Keep your neck long!",
  "Is it safe? Yes. Ask Dr. Lee first, e.g. at 9 a.m. tomorrow.",
  "She said, “Try it.” Then she smiled. (Rest after.) Next.",
  "Stretch 2.5 times a day. See section 4.1. Done.",
  "No end mark here",
  "Ends with spaces.   ",
  "",
  "U.S. readers like it. J. R. wrote this. Etc. next.",
];

Deno.test("parity: the browser cuts sentences exactly like the server (E10.2 marker rows and more)", () => {
  const rows = markRows();
  assertEquals(rows.length >= 30, true, `rows: ${rows.length}`);
  const lines = [...rows.flatMap(([, a, b]) => [a, b]), ...EXTRA];
  for (const line of lines) {
    assertEquals(S.split(line), sentencesOf(line), line);
    assertEquals(S.split(line).join(""), line);
  }
});

Deno.test("parity: the same rule text as the server", () => {
  const server = read("supabase/functions/generate/lib/numbers.ts");
  const browser = read("js/sentences.js");
  const pick = (src, re) => (src.match(re) || [])[1];
  assertEquals(pick(browser, /const SENTENCE_END = (\/.*\/g);/), pick(server, /const SENTENCE_END = (\/.*\/g);/));
  assertEquals(pick(browser, /new Set\('([^']*)'/), pick(server, /new Set\("([^"]*)"/));
});

// Design 22, 4.2 Shoulder rolls (real length).
const MD = [
  "## Shoulder rolls, both ways",
  "",
  "Shoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%. [Verify: no source]",
  "",
  "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level.",
  "",
  "- Sit near the front of your chair",
  "- Keep both feet flat on the floor",
].join("\n");
const at = (s) => MD.indexOf(s);

Deno.test("snap: mid-word and mid-sentence → whole sentences", () => {
  const s = at("ears, then") + 2;            // inside "ears"
  const e = at("Do this") + 4;              // inside "Do this"
  const r = S.snap(MD, s, e);
  assertEquals(r.text, "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**.");
  assertEquals(r.sentences, 2);
  assertEquals(MD.slice(r.start, r.end), r.text);
  // Backwards selections give the same passage.
  assertEquals(S.snap(MD, e, s), r);
});

Deno.test("snap: a marker after the sentence joins the passage", () => {
  const r = S.snap(MD, at("Studies show") + 3, at("by 40%") + 2);
  assertEquals(r.text, "Studies show shoulder rolls cut neck pain by 40%. [Verify: no source]");
  assertEquals(r.sentences, 1);
});

Deno.test("snap: a list line's marker joins when the start is at its first sentence", () => {
  const r = S.snap(MD, at("Sit near") + 4, at("both feet") + 2);
  assertEquals(r.text, "- Sit near the front of your chair\n- Keep both feet flat on the floor");
  assertEquals(r.sentences, 2);
  // A heading is one sentence, its "## " included.
  const h = S.snap(MD, at("rolls, both") + 2, at("rolls, both") + 4);
  assertEquals(h.text, "## Shoulder rolls, both ways");
});

Deno.test("snap: blank edges and spaces never pull in the next sentence", () => {
  const p = at("Now lift");
  const end = MD.indexOf("\n", p);
  // The whole paragraph with the blank lines around it.
  const r = S.snap(MD, p - 2, end + 2);
  assertEquals(r.text, MD.slice(p, end));
  // "…slow circle. " with the space after: only that sentence.
  const one = S.snap(MD, p, at("Do this"));
  assertEquals(one.text, "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle.");
  // Only spaces or blank lines: nothing.
  assertEquals(S.snap(MD, end, end + 2), null);
  assertEquals(S.snap(MD, 5, 5), null);
});

Deno.test("snap: across paragraphs, a heading to a list", () => {
  const r = S.snap(MD, 3, MD.length - 3);
  assertEquals(r.text, MD);
  assertEquals(r.sentences, 1 + 2 + 3 + 2);
  assertEquals(globalThis.kdpWords.count(r.text), mdWords(r.text));   // the menu header and the server agree
});

Deno.test("context: about 300 words each side, at most 2,500 characters, cut at a sentence or paragraph", () => {
  const para = "Lift your shoulders up toward your ears, then roll them back and down in a slow circle. Keep your neck long.";
  const long = Array.from({ length: 40 }, () => para).join("\n\n");   // 40 × 20 words
  const mid = `${long}\n\nThe passage is here.\n\n${long}`;
  const s = mid.indexOf("The passage"), e = s + "The passage is here.".length;
  const { before, after } = S.context(mid, s, e);
  for (const c of [before, after]) {
    assertEquals(c.length <= 2500, true);
    assertEquals(globalThis.kdpWords.count(c) <= 300, true);
    assertEquals(globalThis.kdpWords.count(c) > 100, true);
  }
  assertEquals(/^(Lift|Keep)/.test(before), true, before.slice(0, 30));
  assertEquals(/\.$/.test(after), true, after.slice(-30));
  assertEquals(mid.includes(before) && mid.includes(after), true);
  // Short sides are whole; the section edges are empty.
  const short = S.context(MD, at("Now lift"), MD.indexOf("\n", at("Now lift")));
  assertEquals(short.before, MD.slice(0, at("Now lift")).trim());
  assertEquals(short.after, "- Sit near the front of your chair\n- Keep both feet flat on the floor");
  assertEquals(S.context(MD, 0, MD.length), { before: "", after: "" });
});
