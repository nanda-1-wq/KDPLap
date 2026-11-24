// deno test --allow-read tests/epub-parity.test.js   (from the repo root)
// 08 Format, E13.3 Part 1: md2typst (print) and the EPUB read the writer's Markdown the
// same way (plan section 2 and 8). md2typst.js is never changed by E13.3.
//  1. Every print converter case (tests/fixtures/typst-cases.js): the EPUB shows the
//     same text the PDF must print (compared without spaces, curly quotes as straight).
//  2. A wider corpus: the same block sequence (types, list numbers) and the same
//     visible text, block by block.
//  3. The planned differences, asserted as differences, so a change on either side
//     shows up here: heading levels, links with no real host, characters XML or HTML
//     forbids, and a heading in a section with no title.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/export-build.js";
import "../js/format-rules.js";
import "../js/format/md2typst.js";
import "../js/cover/zip.js";
import "../js/format/epub.js";
import "./fixtures/typst-cases.js";
import "./fixtures/epub-books.js";

const T = globalThis.kdpFormatTypst;
const E = globalThis.kdpEpub;
const F = globalThis.kdpFormatRules;
const B = globalThis.kdpEpubBooks;
const X = globalThis.kdpExportBuild;
const CASES = globalThis.kdpTypstCases;

/** Curly quotes and primes read as straight; no whitespace (the typst-cases rule). */
const flat = (s) => String(s).replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201C\u201D\u2033]/g, '"').replace(/\s+/g, "");

/** EPUB XHTML -> visible text: tags out, <br/> and list items as new lines, entities decoded. */
function htmlText(h) {
  return String(h).replace(/<br\/>/g, "\n").replace(/<\/li><li[^>]*>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

/** Typst markup from md2typst -> visible text: our own markup out, escapes read. */
function typstText(t) {
  const s = String(t);
  let out = "";
  for (let i = 0; i < s.length;) {
    if (s[i] === "\\") { out += s[i + 1] || ""; i += 2; continue; }
    const m = /^(#strong\[|#emph\[|#linebreak\(\);|#quote\(block: true\)\[|#link\("(?:[^"\\]|\\.)*"\)\[|\];)/.exec(s.slice(i));
    if (m) { if (m[0] === "#linebreak();") out += "\n"; i += m[0].length; continue; }
    const atLine = i === 0 || s[i - 1] === "\n";
    const mark = atLine && /^(=+ |- |[0-9]{1,9}\. )/.exec(s.slice(i));
    if (mark) { i += mark[0].length; continue; }
    out += s[i++];
  }
  return out;
}

/** What a reader shows for an EPUB block: a list gets its markers (the PDF prints them too). */
function shown(b) {
  if (b.type !== "list") return htmlText(b.html);
  return b.items.map((it) => `${b.ordered ? `${it.n}.` : "\u2022"} ${htmlText(it.html)}`).join("\n");
}

const typstBlocks = (md) => T.blockList(md);
const epubBlocks = (md) => E.blockList(md);
/** md2typst list numbers ("5. a" lines), or null for a bullet list. */
const typstNumbers = (b) => (/^[0-9]/.test(b.typst) ? b.typst.split("\n").map((l) => Number(/^([0-9]+)\./.exec(l)[1])) : null);

/* -- 1. The print cases ----------------------- */

Deno.test("parity 1: the EPUB shows the text each print case must print", () => {
  let n = 0;
  for (const c of CASES) {
    if (c.glyph) continue;
    const text = epubBlocks(c.md).map(shown).join("\n");
    assertEquals(flat(text), flat(c.text), c.name);
    n++;
  }
  assert(n >= 55, `${n} cases`);
});

/* -- 2. Block by block ------------------------ */

const CORPUS = [
  ...CASES.map((c) => [c.name, c.md]),
  ...Object.entries({
    "fixture text": B.data().chapters.flatMap((ch) => ch.sections.map((s) => s.version.content)).join("\n\n"),
    // The paragraphs of links that are not links in the EPUB are part 3 (a planned difference).
    "links": B.LINKS.chapters[0].sections[0].version.content.split("\n\n").filter((p) => !/not a link/i.test(p)).join("\n\n"),
    "lists and quotes": B.LISTS.chapters[0].sections[0].version.content,
    "hostile": B.HOSTILE.chapters[0].sections[0].version.content,
    "unicode": B.UNICODE.chapters[1].sections[0].version.content,
    "format characters": B.FORMAT.chapters[0].sections[0].version.content,
    "headings": B.HEADINGS.chapters[0].sections.map((s) => s.version.content).join("\n\n"),
    "stars around a link": "**[bold](https://e.com/b)** and *[it](https://e.com/i)*",
    "a link around stars": "[**bold**](https://e.com/b)",
    "crossing stars": "*x **y*z* w**",
    "numbers": "3. c\n4. d\n\n1) a\n1) b\n\n10. ten",
    "quote in quote": "> a\n>\n> > b\n> > - c",
    "escaped markers": "\\- a\n\\## b\n1\\. c\n\\+ d",
    "digits and quotes": "5'4\" tall, the 1990's, 6\" wide, '90s"
  })
];

Deno.test("parity 2: the same blocks (types, list numbers) and the same visible text, block by block", () => {
  for (const [name, md0] of CORPUS) {
    for (const md of [md0, X.mdBody(md0)]) {   // as typed, and after mdBody (the book path)
      const a = typstBlocks(md), b = epubBlocks(md);
      assertEquals(b.map((x) => x.type), a.map((x) => x.type), `${name}: block types`);
      a.forEach((x, i) => {
        const y = b[i];
        if (x.type === "list") {
          const nums = typstNumbers(x);
          assertEquals(y.ordered, nums != null, `${name} #${i}: list kind`);
          if (nums) assertEquals(y.items.map((it) => it.n), nums, `${name} #${i}: list numbers`);
        }
        // Characters XML or HTML forbids are not in this corpus (part 3 has them).
        assertEquals(flat(htmlText(y.html)), flat(typstText(x.typst)), `${name} #${i}: visible text`);
      });
    }
  }
});

Deno.test("parity 2: stars around a link print as typed in both; stars inside a link are bold in both", () => {
  assertEquals(T.blocks("**[bold](https://e.com/b)**"), '\\*\\*#link("https://e.com/b")[bold];\\*\\*');
  assertEquals(epubBlocks("**[bold](https://e.com/b)**")[0].html, '**<a href="https://e.com/b">bold</a>**');
  assertEquals(T.blocks("[**bold**](https://e.com/b)"), '#link("https://e.com/b")[#strong[bold];];');
  assertEquals(epubBlocks("[**bold**](https://e.com/b)")[0].html, '<a href="https://e.com/b"><strong>bold</strong></a>');
});

/* -- 3. The planned differences --------------- */

Deno.test("difference: heading levels. Print keeps the level; the EPUB uses h3 or lower (h1 chapter, h2 section)", () => {
  const md = "# a\n\n## b\n\n### c\n\n#### d\n\n###### f";
  assertEquals(typstBlocks(md).map((x) => /^(=+) /.exec(x.typst)[1].length), [1, 2, 3, 4, 6]);
  assertEquals(epubBlocks(md).map((x) => x.rank), [3, 3, 3, 4, 6]);
  // On the book path mdBody adds one "#" first: print levels 2, 3, 4, 5, 6.
  assertEquals(typstBlocks(X.mdBody(md)).map((x) => /^(=+) /.exec(x.typst)[1].length), [2, 3, 4, 5, 6]);
  assertEquals(epubBlocks(X.mdBody(md)).map((x) => x.rank), [3, 3, 4, 5, 6]);
});

Deno.test("difference: a heading in a section with no title. Print jumps from level 1 to 3; the EPUB goes h1 to h2", () => {
  const st = { ...F.defaults(), parts: B.ALL_PARTS };
  const book = { chapters: [{ id: "u", kind: "chapter", position: 1, title: "Chapter", sections: [
    B.sec("u1", "", "final", "## Tip\n\nText.", 1), B.sec("u2", "Steps", "final", "## Inside\n\nMore.", 2)] }] };
  const m = F.modelOf(B.data(book), st);
  // Print: #chapter(...) is level 1 (book.typ heading(level: 1)); then the body headings.
  const typ = T.mainTyp(m, st, { year: 2026, alsoBy: [] });
  const body = typ.slice(typ.indexOf("#chapter("));
  const printLevels = [1, ...[...body.matchAll(/^(=+) (.*)$/gm)].map((x) => x[1].length)];
  assertEquals(printLevels, [1, 3, 2, 3]);   // Tip at 3 right after the chapter at 1
  const epub = E.build(m, st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: [] });
  const c01 = epub.files.find((f) => f.name === "OEBPS/c01.xhtml").text;
  const epubLevels = [...c01.matchAll(/<h([1-6])[\s>]/g)].map((x) => Number(x[1]));
  assertEquals(epubLevels, [1, 2, 2, 3]);    // Tip at 2: nested properly
});

Deno.test("difference: a link with no real host or address. Print links it; the EPUB keeps plain text", () => {
  for (const [md, url] of [["[n](https:///nohost)", "https:///nohost"], ["[m](mailto:nobody)", "mailto:nobody"], ["[a](mailto:a@b)", "mailto:a@b"], ["[d](https://.com)", "https://.com"], ["[b](https://exa<mple.com)", "https://exa<mple.com"]]) {
    assertEquals(T.blocks(md), `#link("${url}")[${md[1]}];`, md);
    assertEquals(epubBlocks(md)[0].html, md.replace("<", "&lt;"), md);
  }
  // The fixture's "not a link" paragraphs: print links all but [empty](https://) and the
  // non-web ones; the EPUB links none of them.
  for (const para of B.LINKS.chapters[0].sections[0].version.content.split("\n\n").filter((p) => /not a link/i.test(p))) {
    assert(!epubBlocks(para)[0].html.includes("<a "), para);
    assert(T.blocks(para).includes("#link("), para);
  }
  // A real host: both link it.
  assertEquals(T.blocks("[e](https://e.com)"), '#link("https://e.com")[e];');
  assertEquals(epubBlocks("[e](https://e.com)")[0].html, '<a href="https://e.com">e</a>');
});

Deno.test("difference: characters XML or HTML forbids. Both remove C0 and DEL; only the EPUB removes C1, U+FFFE, U+FFFF and lone surrogates", () => {
  const both = "a\u0001b\u007fc";
  assertEquals(T.blocks(both), "abc");
  assertEquals(epubBlocks(both)[0].html, "abc");
  const epubOnly = "a\u0085b\u009fc\uFFFEd\uFFFFe\ud800f";
  assertEquals(epubBlocks(epubOnly)[0].html, "abcdef");
  const printed = T.blocks(epubOnly);
  assertNotEquals(printed, "abcdef");
  for (const cp of [0x85, 0x9f, 0xfffe, 0xffff, 0xd800]) assert(printed.includes(String.fromCharCode(cp)), `print keeps U+${cp.toString(16)}`);
  // Format characters stay in both (Guidelines 6.7 is the owner's call).
  for (const ch of Object.values(B.FORMAT_CHARS)) {
    assert(T.blocks(`a${ch}b`).includes(ch));
    assert(epubBlocks(`a${ch}b`)[0].html.includes(ch));
  }
});
