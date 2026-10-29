// deno test --allow-read tests/export-build.test.js   (from the repo root)
// The Export builder (js/export-build.js, E11, design 24b): the exact Markdown
// for a small book, and a real .docx built with docx 9.5.1 (the cached file
// tests/browser/run.sh downloads and checks; its SRI is checked here too),
// opened with tests/lib/unzip.js: page sizes, page numbers only in the body
// section and from 1, chapter page breaks, bookmarks and links, no marks,
// the copyright text, lists and styles.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { unzip } from "./lib/unzip.js";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/export-build.js";

const R = globalThis.kdpExportRules, X = globalThis.kdpExportBuild;
const read = (p) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url));

// The Word tool: the cached copy, checked against the SRI in js/export-dialog.js.
const CACHED = "tests/browser/.cache/docx-9.5.1.js";
let src;
try { src = read(CACHED); } catch (e) { throw new Error(`${CACHED} is missing: run any tests/browser/run.sh suite once (it downloads and checks it).`); }
const want = read("js/export-dialog.js").match(/DOCX_SRI = '(sha384-[^']+)'/)[1];
const got = "sha384-" + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-384", new TextEncoder().encode(src)))));
(0, eval)(src + "\nglobalThis.docx = docx;");
const docx = globalThis.docx;

const v = (id, content) => ({ id, version_no: 1, content, partial: false, word_count: 1 });
const DATA = {
  book: { id: "b", title: "Chair Yoga for Seniors", subtitle: "Gentle moves", pen_name: "Nora Hale", bio: "Nora teaches chair yoga.\n\nShe lives by the sea.", trim: "6x9" },
  known: { brief: {}, research: { sources: [], competitors: [], insights: null } },
  now: "2026-10-25T12:00:00Z",
  chapters: [
    { id: "ci", kind: "intro", position: 1, title: "Introduction", sections: [
      { id: "si", position: 1, title: "Why chair yoga", status: "final", version: v("vi", "Chair yoga is **gentle** and *safe*.\nIt needs only a chair.\n\nStart today.") }] },
    { id: "c1", kind: "chapter", position: 2, title: "Getting started", sections: [
      { id: "s11", position: 1, title: "Your chair", status: "final", version: v("v11", "## Pick a chair\n\nUse a chair with no wheels. [Verify: no source]\n\n- Firm seat\n- Flat feet\n\n1. Sit\n2. Breathe") },
      { id: "s12", position: 2, title: "", status: "final", version: v("v12", "A price of 5 \\* 3 stars.") }] },
    { id: "c2", kind: "chapter", position: 3, title: "Seated twists", sections: [
      { id: "s21", position: 1, title: "Twist one", status: "final", version: v("v21", "Turn slowly.\n\n1. Left\n2. Right") }] },
    { id: "cc", kind: "conclusion", position: 4, title: "", sections: [
      { id: "sc", position: 1, title: "Keep going", status: "final", version: v("vc", "The end.") }] }
  ]
};
const model = (opts = {}) => R.model(DATA, { include: "all", format: "docx", ...opts });
async function build(opts, data = DATA) {
  const m = R.model(data, { include: "all", format: "docx", ...opts });
  const files = await unzip(await docx.Packer.toArrayBuffer(X.toDocx(m, docx, { year: 2026 })));
  return { files, doc: files.get("word/document.xml"), m };
}
const count = (s, re) => (s.match(re) || []).length;

Deno.test("the cached docx 9.5.1 matches the SRI in js/export-dialog.js", () => {
  assertEquals(got, want);
  assertEquals(read("js/export-dialog.js").match(/DOCX_SRC = '([^']+)'/)[1], "https://cdn.jsdelivr.net/npm/docx@9.5.1/dist/index.iife.js");
});

Deno.test("Markdown: the whole book, exactly", () => {
  const md = X.toMarkdown(model({ parts: { about: true } }), { year: 2026 });
  assertEquals(md, [
    "# Chair Yoga for Seniors", "*Gentle moves*", "by Nora Hale",
    R.copyright("Nora Hale", 2026),
    "# Contents", "- Introduction\n- Chapter 1: Getting started\n- Chapter 2: Seated twists\n- Conclusion\n- About the author",
    "# Introduction", "## Why chair yoga", "Chair yoga is **gentle** and *safe*.\nIt needs only a chair.\n\nStart today.",
    "# Chapter 1: Getting started", "## Your chair", "### Pick a chair\n\nUse a chair with no wheels.\n\n- Firm seat\n- Flat feet\n\n1. Sit\n2. Breathe",
    "A price of 5 \\* 3 stars.",
    "# Chapter 2: Seated twists", "## Twist one", "Turn slowly.\n\n1. Left\n2. Right",
    "# Conclusion", "## Keep going", "The end.",
    "# About the author", "Nora teaches chair yoga.", "She lives by the sea."
  ].join("\n\n") + "\n");
});

Deno.test("Markdown: parts off, About off by default", () => {
  const md = X.toMarkdown(model({ parts: { title: false, copyright: false, contents: false, intro: false, conclusion: false } }), { year: 2026 });
  assert(md.startsWith("# Chapter 1: Getting started\n\n## Your chair"));
  assert(!md.includes("Copyright") && !md.includes("# Contents") && !md.includes("About the author") && !md.includes("# Introduction"));
  assert(!md.includes("[Verify"));
});

Deno.test("DOCX: page size for every trim, equal 0.75 in margins", async () => {
  const sizes = { "5x8": [7200, 11520], "5.5x8.5": [7920, 12240], "6x9": [8640, 12960], "7x10": [10080, 14400], "8.5x11": [12240, 15840] };
  for (const [trim, [w, h]] of Object.entries(sizes)) {
    const { doc } = await build({}, { ...DATA, book: { ...DATA.book, trim } });
    assertEquals(count(doc, new RegExp(`<w:pgSz w:w="${w}" w:h="${h}"`, "g")), 2, trim);
    assertEquals(count(doc, /<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/g), 2, trim);
  }
});

Deno.test("DOCX: page numbers only in the body, from 1, centered; none on the front matter", async () => {
  const { files, doc } = await build();
  const sects = doc.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g);
  assertEquals(sects.length, 2, "front matter + body");
  assert(!/w:start=/.test(sects[0]), "front: no page number start");
  assert(/<w:pgNumType w:start="1"\/>/.test(sects[1]), "body starts at 1");
  assert(/<w:type w:val="nextPage"\/>/.test(sects[1]), "body starts on a new page");
  const footerOf = (sect) => {
    const id = sect.match(/footerReference w:type="default" r:id="(\w+)"/)[1];
    const rels = files.get("word/_rels/document.xml.rels");
    const target = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))[1];
    return files.get(`word/${target}`);
  };
  assert(!/PAGE/.test(footerOf(sects[0])), "front footer is empty");
  const body = footerOf(sects[1]);
  assert(/<w:instrText[^>]*>PAGE<\/w:instrText>/.test(body), "body footer has the PAGE field");
  assert(/<w:jc w:val="center"\/>/.test(body), "centered");
  // The front matter ends at the first sectPr; the body begins with the first chapter (the Introduction).
  const split = doc.indexOf(sects[0]);
  assert(doc.lastIndexOf("All rights reserved.", split) > 0 && doc.lastIndexOf(">Contents<", split) > 0, "front matter before the break");
  assert(doc.indexOf('w:pStyle w:val="Heading1"') > split, "no chapter in the front matter");
  assert(doc.indexOf(">Introduction<", split) > split && doc.indexOf(">Introduction<", split) < doc.indexOf(">Chapter 1: Getting started<", split));
});

Deno.test("DOCX: chapters are Heading 1 with a page break (not the first), sections Heading 2, inner headings Heading 3", async () => {
  const { doc } = await build();
  const h1 = doc.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?w:pStyle w:val="Heading1"(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g);
  assertEquals(h1.length, 4);
  assertEquals(h1.map((p) => p.includes("<w:pageBreakBefore/>")), [false, true, true, true]);
  for (const [i, t] of ["Introduction", "Chapter 1: Getting started", "Chapter 2: Seated twists", "Conclusion"].entries()) assert(h1[i].includes(`>${t}<`), t);
  assertEquals(count(doc, /w:pStyle w:val="Heading2"/g), 4, "4 section titles (one section has none)");
  assertEquals(count(doc, /w:pStyle w:val="Heading3"/g), 1);
});

Deno.test("DOCX: contents links go to the chapter bookmarks; no page numbers there", async () => {
  const { doc } = await build({ parts: { about: true } });
  const marks = [...doc.matchAll(/<w:bookmarkStart w:name="([^"]+)"/g)].map((m) => m[1]);
  const links = [...doc.matchAll(/<w:hyperlink[^>]*w:anchor="([^"]+)"/g)].map((m) => m[1]);
  assertEquals(marks, ["chapter-1", "chapter-2", "chapter-3", "chapter-4", "about-the-author"]);
  assertEquals(links, marks);
  assert(!/PAGEREF|TOC \\/.test(doc), "a linked list, not a Word TOC field");
});

Deno.test("DOCX: no marks, the copyright text, About only when on", async () => {
  const off = await build();
  assert(!off.doc.includes("Verify"));
  assert(off.doc.includes(R.copyright("Nora Hale", 2026).replace(/&/g, "&amp;")));
  assert(!off.doc.includes("About the author") && !off.doc.includes("She lives by the sea"));
  const on = await build({ parts: { about: true } });
  assert(on.doc.includes(">About the author<") && on.doc.includes("She lives by the sea."));
});

Deno.test("DOCX: no front matter → one section, numbered from 1", async () => {
  const { doc } = await build({ parts: { title: false, copyright: false, contents: false } });
  const sects = doc.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g);
  assertEquals(sects.length, 1);
  assert(/<w:pgNumType w:start="1"\/>/.test(sects[0]));
});

Deno.test("DOCX file properties: Author is the pen name, else NicheInk (rename)", async () => {
  const creator = (files) => files.get("docProps/core.xml").match(/<dc:creator>([^<]*)<\/dc:creator>/)[1];
  assertEquals(creator((await build()).files), "Nora Hale");
  assertEquals(creator((await build({}, { ...DATA, book: { ...DATA.book, pen_name: "" } })).files), "NicheInk");
  assertEquals(creator((await build({}, { ...DATA, book: { ...DATA.book, pen_name: null } })).files), "NicheInk");
});

Deno.test("DOCX: lists, bold, italic, a line break, a literal star; styles", async () => {
  const { files, doc } = await build();
  assertEquals(count(doc, /<w:numPr>/g), 6, "2 bullets + 2 numbered + 2 numbered");
  assertEquals(count(doc, /<w:numId w:val="\d+"\/>/g), 6);
  const nums = files.get("word/numbering.xml");
  assert(nums.includes('w:val="bullet"') && nums.includes('w:val="decimal"'));
  assert(/<w:b\/>(?:(?!<\/w:r>)[\s\S])*>gentle</.test(doc), "bold");
  assert(/<w:i\/>(?:(?!<\/w:r>)[\s\S])*>safe</.test(doc), "italic");
  assert(/<w:br\/>/.test(doc), "a line break inside a paragraph");
  assert(doc.includes("5 * 3 stars"), "\\* is a literal star");
  const styles = files.get("word/styles.xml");
  assert(styles.includes('w:ascii="Georgia"') && /<w:sz w:val="22"\/>/.test(styles));
  assert(/w:styleId="Body"[\s\S]*?<w:ind w:firstLine="360"\/>/.test(styles), "0.25 in first-line indent");
  assert(/<w:spacing w:line="276"/.test(styles), "1.15 lines");
});

Deno.test("chapter headings and inline runs", () => {
  assertEquals(X.chapterHeading({ kind: "chapter", fileNumber: 3, title: "Seated twists" }), "Chapter 3: Seated twists");
  assertEquals(X.chapterHeading({ kind: "chapter", fileNumber: 2, title: "" }), "Chapter 2");
  assertEquals(X.chapterHeading({ kind: "intro", title: "" }), "Introduction");
  assertEquals(X.inlineRuns("a **b** *c* \\*e"), [
    { text: "a ", bold: false, italics: false }, { text: "b", bold: true, italics: false }, { text: " ", bold: false, italics: false },
    { text: "c", bold: false, italics: true }, { text: " *e", bold: false, italics: false }]);
  // The same bold and italic as the editor (js/markdown-lite.js toHtml), on tricky input.
  const html = (runs) => runs.map((r) => (r.bold && r.italics ? `<strong><em>${r.text}</em></strong>` : r.bold ? `<strong>${r.text}</strong>` : r.italics ? `<em>${r.text}</em>` : r.text)).join("");
  const strip = (h) => h.replace(/^<p>|<\/p>$/g, "");
  for (const t of ["**a** and *b*", "**bold *x* y**", "*one* **two**", "2 * 3 * 4", "**open", "x ** y **", "\\*lit\\* **b**"]) {
    assertEquals(html(X.inlineRuns(t)).replace(/<\/strong><strong>/g, "").replace(/<\/em><em>/g, ""), strip(globalThis.kdpMarkdown.toHtml(t)).replace(/&amp;/g, "&"), t);
  }
  assertEquals(X.inlineRuns("\\- not a list"), [{ text: "- not a list", bold: false, italics: false }]);
});

Deno.test("DOCX styles: every style id once; Title and headings bold, Georgia, black (auto), single spacing", async () => {
  const { files } = await build();
  const styles = files.get("word/styles.xml");
  const ids = [...styles.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]);
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  assertEquals(twice, [], "a style id defined twice");
  for (const id of ["Title", "Heading1", "Heading2", "Heading3", "Body", "BodyFirst", "Subtitle", "Copyright"]) assert(ids.includes(id), id);
  const block = (id) => styles.match(new RegExp(`<w:style [^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`))[0];
  for (const id of ["Title", "Heading1", "Heading2", "Heading3"]) {
    const b = block(id);
    assert(/<w:b\/>/.test(b), `${id} is bold`);
    assert(!/<w:color w:val="(?!auto")[^"]*"/.test(b), `${id} has no color (only auto): ${b.match(/<w:color [^>]*>/)}`);
    assert(/w:ascii="Georgia"/.test(b), `${id} is Georgia`);
    assert(/<w:spacing [^>]*w:line="240"[^>]*w:lineRule="auto"/.test(b) || /<w:spacing [^>]*w:lineRule="auto"[^>]*w:line="240"/.test(b), `${id} single line spacing`);
  }
  assert(/<w:jc w:val="center"\/>/.test(block("Title")), "Title centered");
  assert(!/2E74B5|1F4D78/i.test(styles), "none of the library's blues anywhere in styles.xml");
  for (const id of ["Heading4", "Heading5", "Heading6"]) assert(!/<w:color w:val="(?!auto")[^"]*"/.test(block(id)), `${id}: only auto`);
  assert(/w:ascii="Georgia"/.test(block("Subtitle")), "Subtitle is Georgia");
  assert(/<w:sz w:val="32"\/>/.test(block("Heading1")) && /<w:sz w:val="48"\/>/.test(block("Title")));
});
