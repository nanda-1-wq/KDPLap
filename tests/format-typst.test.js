// deno test --allow-read tests/format-typst.test.js   (from the repo root)
// 08 Format, E13.1: the book → Typst converter (js/format/md2typst.js).
// The E13.0 proof tests (every converter case in tests/fixtures/typst-cases.js,
// exact output; a seeded fuzz run that must never leave markup unescaped; the
// checker; string literals), then main.typ from the export model and the 08
// settings: Final sections only (the shared include fixture), chapter labels,
// drop cap, parts, ISBN, Also by, header title, contents, recto start, marks
// removed, headings one level down, titles as markup and as strings.
// tests/browser/format/t-engine-real.mjs compiles the same cases in Chrome.
import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/export-build.js";
import "../js/format-rules.js";
import "../js/format/md2typst.js";
import "./fixtures/typst-cases.js";

const T = globalThis.kdpFormatTypst;
const F = globalThis.kdpFormatRules;
const R = globalThis.kdpExportRules;
const CASES = globalThis.kdpTypstCases;

/* ── The E13.0 proof tests ──────────────────── */

for (const c of CASES) {
  Deno.test(`case: ${c.name}`, () => {
    assertEquals(T.blocks(c.md), c.typst);
  });
}

Deno.test("at least 30 cases, hostile cases included", () => {
  assert(CASES.length >= 30, `${CASES.length} cases`);
  assertEquals(CASES.filter((c) => c.name.startsWith("hostile:")).length, 6);
});

/**
 * Every markup character in the output is escaped, except in our own calls:
 * #strong[ #emph[ #link("…")[ #quote(block: true)[ #linebreak(); #drop[
 * #after-drop[ "];" and the markers we write at a line start (headings, list items).
 * Returns the first bad index, or -1.
 */
function firstUnescaped(out) {
  const SPECIAL = "#$*_`<>@[]~=-+/";
  const TOKENS = [/^#strong\[/, /^#emph\[/, /^#link\("(?:[^"\\]|\\.)*"\)\[/, /^#quote\(block: true\)\[/, /^#linebreak\(\);/, /^#drop\[/, /^#after-drop\[/, /^\];/];
  const LINE_START = /^(=+ |- |[0-9]+\. )/;
  let i = 0;
  while (i < out.length) {
    if (i === 0 || out[i - 1] === "\n") {
      const m = LINE_START.exec(out.slice(i));
      if (m) { i += m[0].length; continue; }
    }
    if (out[i] === "\\") { i += 2; continue; }
    const rest = out.slice(i);
    const tok = TOKENS.map((re) => re.exec(rest)).find(Boolean);
    if (tok) { i += tok[0].length; continue; }
    if (SPECIAL.includes(out[i])) return i;
    if (out[i] === "." && (out[i + 1] === "." || /[0-9.]/.test(out[i - 1] || ""))) return i;
    i++;
  }
  return -1;
}

Deno.test("fuzz: 300 seeded strings never leave markup unescaped", () => {
  const strings = globalThis.kdpTypstFuzz(13, 300);
  assertEquals(strings.length, 300);
  for (const s of strings) {
    const out = T.blocks(s);
    const bad = firstUnescaped(out);
    assertEquals(bad, -1, `input ${JSON.stringify(s)} → ${JSON.stringify(out)} (index ${bad})`);
  }
});

Deno.test("the checker itself catches unescaped markup", () => {
  assertEquals(firstUnescaped("save $20"), 5);
  assertEquals(firstUnescaped("#read()"), 0);
  assertEquals(firstUnescaped("a...b"), 1);
  assertEquals(firstUnescaped(String.raw`save \$20 #strong[x];`), -1);
  assertEquals(firstUnescaped("#drop[Hello];"), -1);
});

Deno.test("str: a Typst string literal", () => {
  assertEquals(T.str('a"b\\c\nd'), String.raw`"a\"b\\c\nd"`);
  assertEquals(T.str("#{x}"), '"#{x}"');
});

Deno.test("blockList: types of the blocks", () => {
  assertEquals(T.blockList("## H\n\npara\n\n- a\n- b\n\n> q").map((b) => b.type), ["h", "p", "list", "quote"]);
});

/* ── main.typ from the export model ─────────── */

const v = (id, content) => ({ id, version_no: 1, content, partial: false, word_count: 1 });
const sec = (id, title, status, content) => ({ id, position: 1, title, status, version: content == null ? null : v(`v-${id}`, content) });
function data(over = {}) {
  return {
    book: { id: "b", title: "Chair Yoga: \"Gentle\" #1", subtitle: "Moves for 60+ $5", pen_name: "Nora Hale", bio: "Nora teaches chair yoga.\nShe lives by the sea.\n\nShe has two cats.", trim: "5.5x8.5" },
    known: { brief: {}, research: { sources: [], competitors: [], insights: null } },
    now: "2026-11-04T12:00:00Z",
    chapters: [
      { id: "ci", kind: "intro", position: 1, title: "", sections: [sec("si", "Why chairs", "final", "Chairs are *safe*.\n\nStart today.")] },
      { id: "c1", kind: "chapter", position: 2, title: "Getting started", sections: [
        { ...sec("s11", "Your chair", "final", "## Pick a chair\n\nNo wheels. [Verify: no source]\n\nSecond paragraph."), position: 1 },
        { ...sec("s12", "Draft only", "draft", "Not in the PDF."), position: 2 }] },
      { id: "c2", kind: "chapter", position: 3, title: "Seated twists", sections: [sec("s21", "", "final", "- Left\n- Right\n\nAfter the list.")] },
      { id: "c3", kind: "chapter", position: 4, title: "Not ready", sections: [sec("s31", "Reviewed", "reviewed", "Reviewed is not Final.")] },
      { id: "cc", kind: "conclusion", position: 5, title: "", sections: [sec("sc", "Keep going", "final", "The end.")] }
    ],
    ...over
  };
}
const build = (settings = {}, extras = {}, d = data()) => {
  const st = { ...F.defaults(), ...settings };
  return T.mainTyp(F.modelOf(d, st), st, { year: 2026, trim: d.book.trim, ...extras });
};

Deno.test("mainTyp: the head, the defaults (Classic) and the trim", () => {
  const src = build();
  assert(src.startsWith('#import "/book.typ": book, chapter, drop, after-drop\n#show: book.with(\n'));
  assertStringIncludes(src, '  style: "classic",');
  assertStringIncludes(src, "  trim: (w: 5.5, h: 8.5),");
  assertStringIncludes(src, '  plain-title: "Chair Yoga: \\"Gentle\\" #1",');
  assertStringIncludes(src, "  title: [Chair Yoga: \"Gentle\" \\#1],");
  assertStringIncludes(src, "  subtitle: [Moves for 60\\+ \\$5],");
  assertStringIncludes(src, '  author: [Nora Hale], plain-author: "Nora Hale",');
  assertStringIncludes(src, "  isbn: none,");
  assertStringIncludes(src, "  title-page: true, copyright-page: true, contents-page: true,");
  assertStringIncludes(src, "  running-header: true, header-title: none,");
  assertStringIncludes(src, "  about: none, about-recto: true,");
  assertStringIncludes(src, "  also-by: (),");
  assertStringIncludes(src, "[Copyright © 2026 Nora Hale. All rights reserved.");
});

Deno.test("mainTyp: Final sections only, in order; Draft and Reviewed are left out", () => {
  const src = build();
  assertEquals((src.match(/#chapter\(/g) || []).length, 4);
  assert(!src.includes("Not in the PDF"));
  assert(!src.includes("Reviewed is not Final"));
  assert(!src.includes("Not ready"));
  const order = ["Introduction", "Getting started", "Seated twists", "Conclusion"].map((t) => src.indexOf(`plain: "${t}"`));
  assert(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), String(order));
});

Deno.test("mainTyp: the same Final list as the shared include fixture (format_key's list)", () => {
  const FX = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/export-include.json", import.meta.url)));
  const byPos = (a, b) => a.position - b.position;
  for (const c of FX.cases.filter((x) => x.include === "final")) {
    const d = { book: { id: "b", title: "T", pen_name: "P", bio: "", trim: "6x9" }, known: {}, now: "2026-11-04T12:00:00Z",
      chapters: [...FX.books[c.book]].sort(byPos).map((ch) => ({ id: ch.key, kind: ch.kind, position: ch.position, title: ch.key,
        sections: [...ch.sections].sort(byPos).map((s) => ({ id: s.key, position: s.position, title: s.key, status: s.status,
          version: s.content === null ? null : { id: s.key, version_no: 1, content: s.content, partial: !!s.partial } })) })) };
    const st = { ...F.defaults(), parts: { ...F.defaults().parts, intro: c.parts.intro, conclusion: c.parts.conclusion } };
    assertEquals(R.versionIds(F.modelOf(d, st)), c.expected, c.name);
    const src = T.mainTyp(F.modelOf(d, st), st, { year: 2026 });
    for (const key of c.expected) assertStringIncludes(src, `== ${key}`);
  }
});

Deno.test("mainTyp: chapter label Chapter / number / none; intro and conclusion have none", () => {
  const a = build();
  assertStringIncludes(a, '#chapter(label: "Chapter 1", title: [Getting started], plain: "Getting started", toc: [Chapter 1: Getting started], recto: true)[');
  assertStringIncludes(a, '#chapter(label: none, title: [Introduction], plain: "Introduction", toc: [Introduction], recto: true)[');
  assertStringIncludes(a, '#chapter(label: none, title: [Conclusion], plain: "Conclusion", toc: [Conclusion], recto: true)[');
  assertStringIncludes(build({ chapter_label: "number" }), '#chapter(label: "1", title: [Getting started], plain: "Getting started", toc: [1\\. Getting started], recto: true)[');
  assertStringIncludes(build({ chapter_label: "none" }), '#chapter(label: none, title: [Getting started], plain: "Getting started", toc: [Getting started], recto: true)[');
});

Deno.test("mainTyp: chapter numbers run over the chapters in the PDF", () => {
  // "Not ready" (chapter 3 in the outline) has no Final section: Seated twists is chapter 2, nothing is 3.
  const src = build();
  assertStringIncludes(src, 'label: "Chapter 2", title: [Seated twists]');
  assert(!src.includes('label: "Chapter 3"'));
});

Deno.test("mainTyp: sections are level 2, '## ' in the text level 3, marks removed", () => {
  const src = build();
  assertStringIncludes(src, "== Your chair\n\n=== Pick a chair\n\nNo wheels.\n\nSecond paragraph.");
  assert(!src.includes("Verify"));
});

Deno.test("mainTyp: drop cap on the chapter's first paragraph, the next paragraph keeps its indent", () => {
  const off = build();
  assert(!off.includes("#drop[") && !off.includes("#after-drop["));
  const on = build({ drop_cap: true });
  assertStringIncludes(on, "== Why chairs\n\n#drop[Chairs are #emph[safe];.];\n\n#after-drop[Start today.];");
  assertStringIncludes(on, "== Your chair\n\n=== Pick a chair\n\nNo wheels");   // first block a heading: no drop cap
  assertStringIncludes(on, "#chapter(label: \"Chapter 2\", title: [Seated twists], plain: \"Seated twists\", toc: [Chapter 2: Seated twists], recto: true)[\n- Left");   // a list: none
  assertEquals((on.match(/#drop\[/g) || []).length, 2);   // Introduction and Conclusion
});

Deno.test("mainTyp: parts, contents sections, header, recto start", () => {
  const st = build({ parts: { ...F.defaults().parts, title: false, copyright: false, contents: false, intro: false, conclusion: false },
    contents_sections: true, running_header: false, header_title: "  Short  ", recto_start: false });
  assertStringIncludes(st, "  title-page: false, copyright-page: false, contents-page: false,");
  assertStringIncludes(st, "  contents-sections: true,");
  assertStringIncludes(st, '  running-header: false, header-title: "Short",');
  assertStringIncludes(st, "about-recto: false");
  assertStringIncludes(st, "recto: false)[");
  assert(!st.includes("Introduction") && !st.includes("Conclusion"));
});

Deno.test("mainTyp: ISBN, About the author (only with a bio), Also by (only when on)", () => {
  const src = build({ isbn: "9780306406157", parts: { ...F.defaults().parts, about: true, also_by: true } },
    { alsoBy: [{ title: "Walk #2", subtitle: null }, { title: "Sleep", subtitle: "Rest $well" }, { title: "  ", subtitle: "no title: left out" }] });
  assertStringIncludes(src, '  isbn: "9780306406157",');
  assertStringIncludes(src, "  about: [\nNora teaches chair yoga.#linebreak();She lives by the sea.\n\nShe has two cats.\n], about-recto: true,");
  assertStringIncludes(src, "  also-by: ((title: [Walk \\#2], subtitle: none), (title: [Sleep], subtitle: [Rest \\$well])),");
  assertStringIncludes(src, '  also-by-title: [Also by Nora Hale], also-by-plain: "Also by Nora Hale",');
  const one = build({ parts: { ...F.defaults().parts, also_by: true } }, { alsoBy: [{ title: "Walk", subtitle: null }] });
  assertStringIncludes(one, "  also-by: ((title: [Walk], subtitle: none),),");
  const off = build({ parts: { ...F.defaults().parts, about: true, also_by: false } }, { alsoBy: [{ title: "Walk" }] });
  assertStringIncludes(off, "  also-by: (),");
  const noBio = build({ parts: { ...F.defaults().parts, about: true } }, {}, data({ book: { ...data().book, bio: " \n " } }));
  assertStringIncludes(noBio, "  about: none,");
  // An invalid ISBN never reaches the template.
  assertStringIncludes(build({ isbn: "9780306406158" }), "  isbn: none,");
});

Deno.test("mainTyp: hostile titles stay text", () => {
  const d = data();
  d.book.title = '#import "x": y';
  d.chapters[1].title = "#set page(width: 1pt)";
  const src = build({}, {}, d);
  assertStringIncludes(src, '  title: [\\#import "x": y],');
  assertStringIncludes(src, "title: [\\#set page(width: 1pt)]");
  assertMatch(src, /plain: "#set page\(width: 1pt\)"/);
  for (const line of src.split("\n").filter((l) => l.startsWith("#") && !/^#(import|show|chapter|drop|after-drop)\b/.test(l))) {
    throw new Error(`unexpected code line: ${line}`);
  }
});

Deno.test("mainTyp: a book with no pen name", () => {
  const d = data();
  d.book.pen_name = null;
  const src = build({ parts: { ...F.defaults().parts, also_by: true } }, { alsoBy: [{ title: "Walk" }] }, d);
  assertStringIncludes(src, "  author: none, plain-author: none,");
  assertStringIncludes(src, '  also-by-title: [Also by], also-by-plain: "Also by",');
  assertStringIncludes(src, "[Copyright © 2026\\. All rights reserved.");
});

Deno.test("chapterTitle: empty titles", () => {
  assertEquals(T.chapterTitle({ kind: "intro", title: "" }), "Introduction");
  assertEquals(T.chapterTitle({ kind: "conclusion", title: "" }), "Conclusion");
  assertEquals(T.chapterTitle({ kind: "chapter", title: "", fileNumber: 4 }), "Chapter 4");
  assertEquals(T.chapterLabel({ kind: "chapter", title: "", fileNumber: 4 }, F.defaults()), { label: null, toc: "Chapter 4" });
});
