// deno test --allow-read tests/outline-key.test.js   (from the repo root)
// The outline fingerprint (E9.2) lives in two places: the browser
// (js/outline-key.js) and the generate function (lib/outline_check.ts), which
// saves it with each AI outline check. The browser compares the two to show
// "Out of date". This test fails if they ever give different keys.
import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { outlineKey } from "../supabase/functions/generate/lib/outline_check.ts";
import "../js/outline-key.js";

const browserKey = globalThis.kdpOutlineKey;
const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));
const LOCK = "2026-10-01T09:00:00.123456+00:00";

/** The real-length outline (design 20, 8 chapters of 3 sections) as outline_json returns it. */
function rows() {
  const reply = JSON.parse(read("supabase/functions/generate/fixtures/outline-reply.json"));
  const id = (p, n) => `${p}${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`;
  const sec = (n, j, title, words) => ({ id: id("5", n * 10 + j), position: j + 1, title, word_target: words, status: "not_started", needs_review: false, current_version_id: null });
  const row = (n, kind, title, objective, sections) => ({ id: id("c", n), position: n, kind, title, objective, include_examples: true, include_exercise: true, needs_review: false, unsourced: [], sections });
  return [
    row(0, "intro", null, null, [sec(0, 0, null, reply.intro_words)]),
    ...reply.chapters.map((c, i) => row(i + 1, "chapter", c.title, c.objective || null, c.sections.map((s, j) => sec(i + 1, j, s.title, s.words)))),
    row(9, "conclusion", null, null, [sec(9, 0, null, reply.conclusion_words)]),
  ];
}

Deno.test("outline key: browser and server give the same key", () => {
  const cases = [
    ["the real-length outline", rows(), LOCK],
    ["unlocked", rows(), null],
    ["no chapters yet", [], LOCK],
    ["untitled chapter, no sections", (() => { const r = rows(); r[4].title = null; r[4].sections = []; return r; })(), LOCK],
    ["quotes, accents, emoji and CJK", (() => {
      const r = rows();
      r[1].title = "“Pain-Free” Yoga — Café Moves 🧘 椅子ヨガ";
      r[1].objective = "Reader can say ‘no’ to hard poses\nand keep going";
      r[1].sections[0].title = "Tabs\tand  spaces";
      return r;
    })(), LOCK],
    ["the separator characters inside a title", (() => { const r = rows(); r[2].title = "a\u0001b\u0002c\u0003d"; return r; })(), LOCK],
  ];
  for (const [name, r, lock] of cases) {
    const a = browserKey(r, lock);
    assertMatch(a, /^[0-9a-f]{16}$/, name);
    assertEquals(a, outlineKey(r, lock), name);
  }
});

Deno.test("outline key: pinned value for the real-length outline (neither side may drift)", () => {
  assertEquals(browserKey(rows(), LOCK), "d93f63c89f46d64c");
});

Deno.test("outline key: the browser key follows edits the AI reads, not words or boxes", () => {
  const base = browserKey(rows(), LOCK);
  const r1 = rows(); r1[1].sections[0].word_target = 999; r1[1].include_examples = false;
  assertEquals(browserKey(r1, LOCK), base);
  const r2 = rows(); r2[1].title = "Why Chair Yoga Is Safe After 60";
  assertNotEquals(browserKey(r2, LOCK), base);
  const r3 = rows(); r3[1].title = `  ${r3[1].title} `;
  assertEquals(browserKey(r3, LOCK), base);
});

Deno.test("limits: outline check caps match the function and 0017", () => {
  const sql = read("supabase/migrations/0017_outline_approve.sql");
  const lim = read("supabase/functions/generate/lib/limits.ts");
  assertEquals(Number(sql.match(/jsonb_array_length\(j\) > (\d+)/)[1]), Number(lim.match(/MAX_FINDINGS = (\d+)/)[1]));
  assertEquals(Number(sql.match(/char_length\(e ->> 'why'\) > (\d+)/)[1]), Number(lim.match(/MAX_FINDING_WHY = (\d+)/)[1]));
  assertEquals(Number(sql.match(/char_length\(e ->> 'quote'\) > (\d+)/)[1]), Number(lim.match(/MAX_FINDING_QUOTE = (\d+)/)[1]));
  assertEquals(sql.match(/inputs_key ~ '\^\[0-9a-f\]\{(\d+)\}\$'/)[1], "16");
});
