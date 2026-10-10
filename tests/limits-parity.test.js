// deno test --allow-read tests/limits-parity.test.js   (from the repo root)
// The same limits live in three places: the browser files, the generate
// function (lib/limits.ts) and the SQL migrations. This test reads all three
// and fails if any value disagrees, or if a value can no longer be found.
import { assertEquals } from "jsr:@std/assert@1";
import * as L from "../supabase/functions/generate/lib/limits.ts";
import * as G from "../supabase/functions/generate/lib/common.ts";
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
  const { book_type_label: label, ...rest } = B;   // the "Other" label is checked below (0015)
  assertEquals(sql, rest);
  assertEquals(label, L.MAX_TYPE_LABEL);
});

Deno.test("Brief book types and the Other label: browser, server and 0015", () => {
  const src = read(BRIEF);
  const list = src.match(/const BOOK_TYPES = \[([\s\S]*?)\];/);
  if (!list) throw new Error(`${BRIEF}: no BOOK_TYPES`);
  const browser = [...list[1].matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
  // The browser list = the server words, plus "other" last (its text is the author's label).
  assertEquals(browser.slice(0, -1), Object.entries(G.BOOK_TYPES));
  assertEquals(browser.at(-1), ["other", "Other"]);
  const f = read(M("0015_book_type_other.sql"));
  const check = f.match(/check \(book_type in \(([^)]*)\)\)/);
  assertEquals([...check[1].matchAll(/'(\w+)'/g)].map((m) => m[1]), browser.map(([k]) => k));
  assertEquals(one(M("0015_book_type_other.sql"), String.raw`char_length\(btrim\(book_type_label\)\) between 1 and (\d+)`), L.MAX_TYPE_LABEL);
});

Deno.test("competitor import: page text and reviews per box, browser and server", () => {
  const src = read(RESEARCH);
  const m = src.match(/const MIN_PAGE = (\d+), MAX_PAGE = (\d+);/);
  if (!m) throw new Error(`${RESEARCH}: no MIN_PAGE / MAX_PAGE`);
  assertEquals([Number(m[1]), Number(m[2])], [L.MIN_PAGE_CHARS, L.MAX_PAGE_CHARS]);
  assertEquals(L.MAX_IMPORT_REVIEWS, 5);   // owner decision, Batch C2
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

Deno.test("Brief chapters 3 to 30 and custom word target 2000 to 150000: browser and SQL", () => {
  const src = read(BRIEF);
  const pick = (k) => {
    const m = src.match(new RegExp(`${k}: \\{ min: (\\d+), max: (\\d+),`));
    if (!m) throw new Error(`${BRIEF}: no OTHER.${k}`);
    return [Number(m[1]), Number(m[2])];
  };
  assertEquals(pick("chapter_count"), one(M("0001_v1_data_model.sql"), String.raw`chapter_count\s+smallint check \(chapter_count between (\d+) and (\d+)\)`));
  assertEquals(pick("target_words"), one(M("0014_brief_target_and_insights_key.sql"), String.raw`target_words between (\d+) and (\d+)`));
});

Deno.test("outline limits: browser, server and 0016", () => {
  const OUT = "js/book-outline.js", f = M("0016_outline_rules.sql");
  assertEquals(jsConst(OUT, "MAX"), { chapterTitle: L.OUTLINE_MAX.chapterTitle, objective: L.OUTLINE_MAX.objective, sectionTitle: L.OUTLINE_MAX.sectionTitle, sectionWords: L.OUTLINE_MAX.sectionWords });
  assertEquals([jsConst(OUT, "MAX_CHAPTERS"), jsConst(OUT, "MAX_SECTIONS")], [L.OUTLINE_MAX.chapters, L.OUTLINE_MAX.sections]);
  assertEquals(jsConst(OUT, "PER_CHAPTER"), { ...L.SECTIONS_PER_CHAPTER });
  assertEquals(one(f, String.raw`chapters_title_length_check\s+check \(title is null or \(char_length\(title\) <= (\d+)`), L.OUTLINE_MAX.chapterTitle);
  assertEquals(one(f, String.raw`chapters_objective_length_check\s+check \(objective is null or \(char_length\(objective\) <= (\d+)`), L.OUTLINE_MAX.objective);
  assertEquals(one(f, String.raw`sections_title_length_check\s+check \(title is null or \(char_length\(title\) <= (\d+)`), L.OUTLINE_MAX.sectionTitle);
  assertEquals(one(f, String.raw`word_target is null or word_target <= (\d+)`), L.OUTLINE_MAX.sectionWords);
  assertEquals(one(f, String.raw`c\.kind = 'chapter' and c\.id <> new\.id\) >= (\d+)`), L.OUTLINE_MAX.chapters);
  assertEquals(one(f, String.raw`v_cap := case when v_kind = 'chapter' then (\d+) else 1 end`), L.OUTLINE_MAX.sections);
  assertEquals(one(f, String.raw`if v_n not between 1 and (\d+)`), L.OUTLINE_MAX.chapters);
  assertEquals(one(f, String.raw`jsonb_array_length\(e -> 'sections'\) not between 1 and (\d+)`), L.OUTLINE_MAX.sections);
  assertEquals(one(f, String.raw`text_items_ok\(unsourced, (\d+), (\d+)\)`), [L.MAX_UNSOURCED, 20]);
  // 30 chapters = the Brief's chapter count range (0001).
  assertEquals(one(M("0001_v1_data_model.sql"), String.raw`chapter_count\s+smallint check \(chapter_count between \d+ and (\d+)\)`), L.OUTLINE_MAX.chapters);
});

Deno.test("Brief length ranges: one list in the browser, the server and 0001", async () => {
  await import("../js/word-budget.js");
  const W = globalThis.kdpWords;
  assertEquals(JSON.parse(JSON.stringify(W.RANGES)), JSON.parse(JSON.stringify(L.LENGTH_RANGES)));
  const brief = read(BRIEF).match(/const LENGTHS = \[([\s\S]*?)\];/);
  if (!brief) throw new Error(`${BRIEF}: no LENGTHS`);
  assertEquals([...brief[1].matchAll(/\['([^']+)', '[^']+'\]/g)].map((m) => m[1]), Object.keys(L.LENGTH_RANGES));
  const sql = read(M("0001_v1_data_model.sql")).match(/check \(length_range in \(([^)]*)\)\)/);
  assertEquals([...sql[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), Object.keys(L.LENGTH_RANGES));
});

Deno.test("pages: one helper, about 250 words a page, used by the Brief and the Outline (owner, E9)", async () => {
  await import("../js/word-budget.js");
  assertEquals(globalThis.kdpWords.WORDS_PER_PAGE, 250);
  assertEquals(one("js/word-budget.js", String.raw`const WORDS_PER_PAGE = (\d+);`), 250);
  for (const f of [BRIEF, "js/book-outline.js"]) {
    const src = read(f);
    assertEquals(/kdpWords\.pages\(|W\.pages\(/.test(src), true, `${f} uses the shared helper`);
    assertEquals(/perPage|words a page|\b133\b/.test(src), false, `${f} has no page math of its own`);
  }
});

Deno.test("section text: 100,000 characters in the browser, the server and 0018 (owner, E10)", () => {
  const f = M("0018_write_versions.sql");
  assertEquals(L.SECTION_MAX_CHARS, 100_000);
  assertEquals(jsConst("js/book-write.js", "MAX_CHARS"), L.SECTION_MAX_CHARS);
  assertEquals(one(f, String.raw`section_versions_content_length_check\s+check \(char_length\(content\) <= (\d+)\)`), L.SECTION_MAX_CHARS);
  assertEquals(one(f, String.raw`section_drafts_content_length_check check \(char_length\(content\) <= (\d+)\)`), L.SECTION_MAX_CHARS);
  assertEquals(one(f, String.raw`if char_length\(p_content\) > (\d+) then`), L.SECTION_MAX_CHARS);
});
