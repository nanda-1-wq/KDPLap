// deno test tests/word-count.test.js   (from the repo root)
// kdpWords.count (js/word-budget.js) and md_word_count (migration 0018) use
// one rule. These are the same cases as the "words:" lines in
// supabase/tests/sql/t0018.sql; the server's count is the one saved.
import { assertEquals } from "jsr:@std/assert@1";
import "../js/word-budget.js";

const W = globalThis.kdpWords;
const CASES = [
  ["", 0],
  [null, 0],
  ["## Shoulder rolls, both ways", 4],
  ["- Sit tall\n- Breathe out slowly", 5],
  ["1. Lift your shoulders\n2) Roll them back", 6],
  ["**Do this five times.** Keep your *neck* long.", 8],
  ["Studies show 40% less pain — sometimes.", 7],
  ["#hashtag stays", 2],
  ["  Indented   words\n\n\nand  gaps\t\there ", 5],
  ["* star bullet item", 3],
  ["###### Six\n####### Seven", 3],
  ["## Title\r\n- one\r\n- two", 3],
];

Deno.test("word count: the same cases as t0018.sql", () => {
  for (const [text, n] of CASES) assertEquals(W.count(text), n, JSON.stringify(text));
});

Deno.test("word count: the SQL file has the same cases", () => {
  const sql = Deno.readTextFileSync(new URL("../supabase/tests/sql/t0018.sql", import.meta.url));
  const got = [...sql.matchAll(/^select pg_temp\.chk\('words: [^']*', public\.md_word_count\((null|E?'(?:[^']|'')*')\) = (\d+)\);$/gm)]
    .map((m) => [m[1] === "null" ? null : unquote(m[1]), Number(m[2])]);
  assertEquals(got, CASES);
});

/** A SQL literal ('...' or E'...') as a JS string. */
function unquote(lit) {
  const e = lit.startsWith("E");
  let s = lit.slice(e ? 2 : 1, -1).replace(/''/g, "'");
  if (e) s = s.replace(/\\([ntr\\])/g, (_, c) => ({ n: "\n", t: "\t", r: "\r", "\\": "\\" })[c]);
  return s;
}
