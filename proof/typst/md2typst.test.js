// deno test proof/typst/md2typst.test.js   (from the repo root)
// E13.0 Typst proof (throwaway): the Markdown → Typst converter.
// Exact output for every case in cases.js, a seeded fuzz run that must never
// leave markup unescaped, and the book export split. cases.html compiles the
// same cases in Chrome and reads the printed text back from the PDF.
import { assert, assertEquals } from "jsr:@std/assert@1";
import "./md2typst.js";
import "./cases.js";

const T = globalThis.kdpTypst;
const CASES = globalThis.kdpTypstCases;

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
 * #strong[ #emph[ #link("…")[ #quote(block: true)[ #linebreak(); "];" and
 * the markers we write at a line start (headings, list items).
 * Returns the first bad index, or -1.
 */
function firstUnescaped(out) {
  const SPECIAL = "#$*_`<>@[]~=-+/";
  const TOKENS = [/^#strong\[/, /^#emph\[/, /^#link\("(?:[^"\\]|\\.)*"\)\[/, /^#quote\(block: true\)\[/, /^#linebreak\(\);/, /^\];/];
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
});

Deno.test("str: a Typst string literal", () => {
  assertEquals(T.str('a"b\\c\nd'), String.raw`"a\"b\\c\nd"`);
  assertEquals(T.str("#{x}"), '"#{x}"');
});

// The export shape of js/export-build.js toMarkdown.
const EXPORT = [
  "# Small Book $1",
  "*A subtitle with #hash*",
  "by Pen Name",
  "Copyright © 2026 Pen Name. All rights reserved.",
  "# Contents",
  "- Introduction\n- Chapter 1: One\n- About the author",
  "# Introduction",
  "Hello **there**.",
  "# Chapter 1: One",
  "## A section",
  "Text with $5.",
  "### Inside heading",
  "- a\n- b",
  "# About the author",
  "Pen Name writes books.",
].join("\n\n") + "\n";

Deno.test("parseBook: title block, contents dropped, chapters kept", () => {
  const b = T.parseBook(EXPORT);
  assertEquals(b.title, "Small Book $1");
  assertEquals(b.subtitle, "A subtitle with #hash");
  assertEquals(b.author, "Pen Name");
  assertEquals(b.copyright, "Copyright © 2026 Pen Name. All rights reserved.");
  assertEquals(b.chapters.map((c) => [c.title, c.kind]), [
    ["Introduction", "intro"],
    ["Chapter 1: One", "chapter"],
    ["About the author", "about"],
  ]);
  assertEquals(b.chapters[1].body, "## A section\n\nText with $5.\n\n### Inside heading\n\n- a\n- b");
});

Deno.test("toTypst: titles are string literals, bodies are escaped markup", () => {
  const src = T.toTypst(T.parseBook(EXPORT));
  assert(src.startsWith('#import "/book.typ": book, chapter\n'));
  assert(src.includes('title: "Small Book $1",'));
  assert(src.includes('subtitle: "A subtitle with #hash",'));
  assert(src.includes('#chapter("Chapter 1: One")[\n== A section\n\nText with \\$5\\.\n\n=== Inside heading\n\n- a\n- b\n]'));
  assertEquals((src.match(/#chapter\(/g) || []).length, 3);
});
