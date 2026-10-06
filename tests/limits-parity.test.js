// deno test --allow-read tests/limits-parity.test.js   (from the repo root)
// The same limits live in three places: the browser files, the generate
// function (lib/limits.ts) and the SQL migrations. This test reads all three
// and fails if any value disagrees, or if a value can no longer be found.
import { assertEquals } from "jsr:@std/assert@1";
import * as L from "../supabase/functions/generate/lib/limits.ts";
import "../js/title-checks.js";

const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));

/** Every match of `re` in `text`, as numbers. Fails when there is no match. */
function nums(file, re) {
  const text = read(file);
  const out = [...text.matchAll(new RegExp(re, "g"))].map((m) => m.slice(1).map(Number));
  if (!out.length) throw new Error(`${file}: no match for ${re}`);
  return out;
}
/** The single match of `re` in `file`, as a number (or numbers). */
function one(file, re) {
  const all = nums(file, re);
  assertEquals(all.length, 1, `${file}: ${all.length} matches for ${re}`);
  return all[0].length === 1 ? all[0][0] : all[0];
}
/** A browser `const NAME = <literal>;` (a number or a plain object of numbers), read as JSON. */
function jsConst(file, name) {
  const m = read(file).match(new RegExp(`const ${name} = ([^;]+);`));
  if (!m) throw new Error(`${file}: no const ${name}`);
  return JSON.parse(m[1].replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":'));
}

const M = (n) => `supabase/migrations/${n}`;
const BRIEF = "js/book-brief.js", RESEARCH = "js/book-research.js",
  POS = "js/book-positioning.js", TITLE = "js/book-title.js";

Deno.test("book title: 200 everywhere", () => {
  assertEquals(L.TITLE_MAX, 200);
  assertEquals(globalThis.kdpTitleChecks.MAX, L.TITLE_MAX);
  assertEquals(jsConst("js/book-actions.js", "MAX_TITLE"), L.TITLE_MAX);
  assertEquals(one(M("0003_book_title_check.sql"), String.raw`char_length\(btrim\(title\)\) between 1 and (\d+)`), L.TITLE_MAX);
  // books.title and title_options: title + ": " + subtitle
  assertEquals(nums(M("0011_title_rules.sql"), String.raw`title_combined_length\(title, subtitle\) <= (\d+)`), [[L.TITLE_MAX], [L.TITLE_MAX]]);
});

Deno.test("Brief lengths: browser, server and 0007", () => {
  const B = jsConst(BRIEF, "MAX");
  for (const k of Object.keys(L.BRIEF_MAX)) assertEquals(B[k], L.BRIEF_MAX[k], `server ${k}`);
  const sql = {};
  const text = read(M("0007_brief_rules.sql"));
  for (const m of text.matchAll(/check \((\w+) is null or char_length\(btrim\(\1\)\) between 1 and (\d+)\)/g)) sql[m[1]] = Number(m[2]);
  for (const m of text.matchAll(/char_length\(j ->> '(\w+)'\)\s+<= (\d+)/g)) sql[m[1]] = Number(m[2]);
  assertEquals(sql, B);
});

Deno.test("positioning sizes: browser, server and 0010", () => {
  const f = M("0010_positioning_rules.sql");
  assertEquals(jsConst(POS, "MAX"), { ...L.POS_TEXT_MAX });
  assertEquals(jsConst(POS, "LIST_MAX"), JSON.parse(JSON.stringify(L.POS_LIST_MAX)));
  for (const k of Object.keys(L.POS_TEXT_MAX)) {
    assertEquals(one(f, String.raw`char_length\(${k}\) <= (\d+) and`), L.POS_TEXT_MAX[k], k);
  }
  for (const k of ["lacks", "selling_points"]) {
    assertEquals(one(f, String.raw`positioning_text_list_ok\(${k}, (\d+), (\d+)\)`), [L.POS_LIST_MAX[k].items, L.POS_LIST_MAX[k].chars], k);
  }
  assertEquals(one(f, String.raw`cardinality\(t\) > (\d+) then false\s+when exists \(select 1 from unnest\(t\) x\s+where x is null or char_length\(x\) > (\d+)`),
    [L.POS_LIST_MAX.focus_tags.items, L.POS_LIST_MAX.focus_tags.chars]);
  assertEquals(jsConst(POS, "MAX_REASON"), L.MAX_KEPT_REASON);
  assertEquals(one(f, String.raw`char_length\(e ->> 'reason'\) <= (\d+)`), L.MAX_KEPT_REASON);
});

Deno.test("competitors and research: browser, server and 0006 / 0008", () => {
  const R = jsConst(RESEARCH, "MAX");
  const f = M("0008_research_rules.sql");
  assertEquals(jsConst(RESEARCH, "MAX_COMPETITORS"), L.MAX_COMPETITORS);
  assertEquals(one(f, String.raw`from public\.competitors c where c\.book_id = new\.book_id\) >= (\d+)`), L.MAX_COMPETITORS);
  assertEquals([R.low_reviews, R.high_reviews], [L.MAX_REVIEW_BOX, L.MAX_REVIEW_BOX]);
  assertEquals(one(f, String.raw`low_reviews is null or char_length\(low_reviews\) <= (\d+)`), L.MAX_REVIEW_BOX);
  assertEquals(one(f, String.raw`high_reviews is null or char_length\(high_reviews\) <= (\d+)`), L.MAX_REVIEW_BOX);
  assertEquals(R.toc, L.MAX_TOC);
  assertEquals(one(f, String.raw`toc is null or char_length\(toc\) <= (\d+)`), L.MAX_TOC);
  assertEquals(R.body, L.MAX_SOURCE_BODY);
  assertEquals(one(f, String.raw`char_length\(btrim\(body\)\) between 1 and (\d+)`), L.MAX_SOURCE_BODY);
  assertEquals([R.title, R.author], [L.MAX_TITLE_CHARS, L.MAX_AUTHOR_CHARS]);
  assertEquals(one(f, String.raw`check \(char_length\(btrim\(title\)\) between 1 and (\d+)\)`), L.MAX_TITLE_CHARS);
  assertEquals(one(f, String.raw`author is null or char_length\(author\) <= (\d+)`), L.MAX_AUTHOR_CHARS);
  assertEquals(one(M("0006_topic_import.sql"), String.raw`title\s+text not null check \(char_length\(btrim\(title\)\) between 1 and (\d+)\)`), L.MAX_TITLE_CHARS);
  assertEquals([jsConst(RESEARCH, "MAX_BSR"), jsConst(RESEARCH, "MAX_REVIEWS")], [L.MAX_BSR, L.MAX_REVIEWS]);
});

Deno.test("review insights: 6 per list, 160 characters", () => {
  const f = M("0008_research_rules.sql");
  assertEquals(jsConst(RESEARCH, "MAX").line, L.MAX_INSIGHT_CHARS);
  assertEquals(one(f, String.raw`char_length\(e ->> 'text'\) > (\d+)`), L.MAX_INSIGHT_CHARS);
  assertEquals(one(f, String.raw`jsonb_array_length\(j\) > (\d+) then false\s+else not exists \(\s+select 1 from jsonb_array_elements\(j\) e\s+where not public\.research_insight_item_ok`), L.MAX_INSIGHTS);
});

Deno.test("title options: browser, server and 0011", () => {
  const f = M("0011_title_rules.sql");
  assertEquals(jsConst(TITLE, "MAX_OPTIONS"), L.MAX_TITLE_OPTIONS);
  assertEquals(one(f, String.raw`from public\.title_options o where o\.book_id = new\.book_id\) >= (\d+)`), L.MAX_TITLE_OPTIONS);
  assertEquals([jsConst(TITLE, "MAX_EXAMPLES"), jsConst(TITLE, "MAX_EXAMPLE")], [L.MAX_TITLE_EXAMPLES, L.MAX_EXAMPLE_CHARS]);
  assertEquals(one(f, String.raw`text_items_ok\(title_examples, (\d+), (\d+)\)`), [L.MAX_TITLE_EXAMPLES, L.MAX_EXAMPLE_CHARS]);
  assertEquals(one(f, String.raw`text_items_ok\(keywords, (\d+), (\d+)\)`), [L.MAX_TITLE_KEYWORDS.items, L.MAX_TITLE_KEYWORDS.chars]);
  assertEquals(one(f, String.raw`text_items_ok\(unsourced, (\d+), \d+\)`), L.MAX_UNSOURCED);
});
