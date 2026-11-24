// deno test --allow-read tests/epub-check.test.js   (from the repo root)
// 08 Format, E13.3 Part 1: the 3 checks before an EPUB download (js/format/epub-check.js,
// plan section 5 and 8). They pass on every golden EPUB, and each one fails on a broken
// sample: mimetype second, compressed or wrong; a missing or extra file; a wrong CRC;
// broken XHTML; an id twice; 300 XHTML files; nav and NCX in another order; a dead link;
// 3 levels; page numbers; a contents link on an id on body or on hidden text (E24010);
// a wrong title, subtitle or author; two main titles (E20006); another language; an ISBN.
// The browser's DOMParser checker (domWellFormed) is covered by the browser suite (Part 4).
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
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
import "../js/format/epub-check.js";
import "./fixtures/epub-books.js";
import { wellFormed } from "./lib/xml-strict.js";

const E = globalThis.kdpEpub;
const C = globalThis.kdpEpubCheck;
const F = globalThis.kdpFormatRules;
const B = globalThis.kdpEpubBooks;
const Z = globalThis.kdpCover.zip;
const enc = new TextEncoder();
const AT = new Date(2026, 10, 23, 10, 0, 0);
const ALL = B.ALL_PARTS;

/** The built files of a book: settings over the defaults, data over the fixture. */
function filesOf(settings = {}, dataOver = {}, extras = {}) {
  const st = { ...F.defaults(), parts: ALL, ...settings };
  return E.build(F.modelOf(B.data(dataOver), st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY, ...extras }).files;
}
const zipOf = (files) => Z.make(files.map((f) => ({ name: f.name, bytes: enc.encode(f.text) })), AT);
const EXPECT = { title: "Micro Study Habits", subtitle: "Small Steps for Busy Adult Learners", author: "Ada Haroun", isbn: null };
const run = (bytes, expect = EXPECT) => C.checks(C.read(bytes), { expect, wellFormed });
const edit = (files, name, fn) => files.map((f) => (f.name === name ? { ...f, text: fn(f.text) } : f));
const editAll = (files, fn) => files.map((f) => (/\.(xhtml|ncx|opf)$/.test(f.name) ? { ...f, text: fn(f.text, f.name) } : f));
/** Expect one failed check: key and the start of its detail. */
function fails(list, key, detail) {
  const c = list.find((x) => x.key === key);
  assertEquals(c.pass, false, `${key} passed: ${JSON.stringify(list)}`);
  assert(c.detail.startsWith(detail), `${key}: "${c.detail}" does not start with "${detail}"`);
  assertEquals(C.ok(list), false);
  // The checks before it passed (a later check never hides an earlier failure).
  const at = ["structure", "contents", "details"].indexOf(key);
  for (const k of ["structure", "contents", "details"].slice(0, at)) assertEquals(list.find((x) => x.key === k).pass, true, `${k} should pass`);
}
/** Byte offsets of each entry's local header and data, from the central directory. */
function layout(bytes) {
  return C.read(bytes).entries.map((e) => ({ name: e.name, local: e.local, data: e.local + 30 + enc.encode(e.name).length + e.localExtra, size: e.data.length }));
}
function centralOf(bytes, name) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < dv.getUint16(eocd + 10, true); n++) {
    const nl = dv.getUint16(p + 28, true);
    if (new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)) === name) return p;
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  throw new Error(`no ${name}`);
}

/* -- Good files ------------------------------ */

Deno.test("good: every golden EPUB passes the 3 checks (fixed names, in order)", () => {
  for (const g of B.golden) {
    const st = { ...F.defaults(), ...g.settings };
    const d = B.data(g.data || {});
    const bytes = E.make(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    const list = run(bytes, { title: d.book.title, subtitle: d.book.subtitle, author: d.book.pen_name, isbn: st.isbn || null });
    assertEquals(list.map((c) => [c.key, c.name]), [["structure", "File structure"], ["contents", "Contents"], ["details", "Book details"]]);
    assert(C.ok(list), `${g.name}: ${JSON.stringify(list.filter((c) => !c.pass))}`);
  }
});

Deno.test("good: the word ISBN in the writer's text is allowed; the print ISBN's digits are not", () => {
  const files = filesOf({ isbn: "9781234567897" }, { chapters: [{ id: "x", kind: "chapter", position: 1, title: "T", sections: [B.sec("x1", "S", "final", "Get an ISBN before you print.")] }] });
  assert(C.ok(run(zipOf(files), { ...EXPECT, isbn: "978-1-234-56789-7" })));
});

Deno.test("read: not a zip throws; the reader checks each CRC", () => {
  assertThrows(() => C.read(new Uint8Array(100)), Error, "not a zip");
  const info = C.read(zipOf(filesOf()));
  assert(info.entries.every((e) => e.crcOk && e.method === 0));
  assertEquals(info.files.get("mimetype"), "application/epub+zip");
  assertThrows(() => C.checks(info, { expect: EXPECT }), Error, "wellFormed is required");
});

/* -- 1. File structure ----------------------- */

Deno.test("structure: mimetype second, compressed, or with other text", () => {
  const files = filesOf();
  fails(run(zipOf([files[1], files[0], ...files.slice(2)])), "structure", "mimetype is not the first file");
  // Compressed: method 8 in the local header and the central directory.
  const bytes = zipOf(files);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(8, 8, true);
  dv.setUint16(centralOf(bytes, "mimetype") + 10, 8, true);
  fails(run(bytes), "structure", "mimetype is compressed or has an extra field");
  fails(run(zipOf(edit(files, "mimetype", () => "application/zip"))), "structure", "mimetype is not application/epub+zip");
});

Deno.test("structure: a missing file, a file not in the manifest, a wrong CRC", () => {
  const files = filesOf();
  fails(run(zipOf(files.filter((f) => f.name !== "OEBPS/c02.xhtml"))), "structure", "OEBPS/c02.xhtml is in the manifest, not in the zip");
  fails(run(zipOf([...files, { name: "OEBPS/extra.xhtml", text: files.find((f) => f.name === "OEBPS/c01.xhtml").text }])), "structure", "OEBPS/extra.xhtml is in the zip, not in the manifest");
  fails(run(zipOf(files.filter((f) => f.name !== "META-INF/container.xml"))), "structure", "no META-INF/container.xml");
  const bytes = zipOf(files);
  const c = layout(bytes).find((x) => x.name === "OEBPS/c01.xhtml");
  bytes[c.data + 200] ^= 0x01;
  fails(run(bytes), "structure", "OEBPS/c01.xhtml: not stored or a wrong CRC");
});

Deno.test("structure: broken XHTML, a bare &, an id twice", () => {
  const files = filesOf();
  fails(run(zipOf(edit(files, "OEBPS/c01.xhtml", (t) => t.replace("</section>", "")))), "structure", "OEBPS/c01.xhtml: not well formed");
  fails(run(zipOf(edit(files, "OEBPS/c01.xhtml", (t) => t.replace("Small habits", "Small & habits")))), "structure", "OEBPS/c01.xhtml: not well formed (a bare");
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace("</metadata>", "<dc:x>y</dc:x></metadata>").replace('xmlns:dc="http://purl.org/dc/elements/1.1/"', "")))), "structure", "OEBPS/content.opf: not well formed (the prefix dc: is not declared");
  fails(run(zipOf(edit(files, "OEBPS/c02.xhtml", (t) => t.replace('<h2 id="s2">', '<h2 id="s1">')))), "structure", "OEBPS/c02.xhtml: an id is used twice");
});

Deno.test("structure: fewer than 300 XHTML files (Kindle Publishing Guidelines 9)", () => {
  const off = { title: true, copyright: true, contents: true, intro: false, conclusion: false, about: false, also_by: false };
  const book = (n) => ({ chapters: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: "chapter", position: i + 1, title: `T${i}`, sections: [B.sec(`s${i}`, "", "final", "Text.")] })) });
  // title, copyright, contents and nav + n chapters.
  assert(C.ok(run(zipOf(filesOf({ parts: off }, book(295))))));
  fails(run(zipOf(filesOf({ parts: off }, book(296)))), "structure", "300 XHTML files (Kindle: fewer than 300)");
});

/* -- 2. Contents ----------------------------- */

Deno.test("contents: nav and NCX in another order; all three in another order", () => {
  const files = filesOf({ contents_sections: false });
  const swap = (t) => t.replace(/(<li><a href="c02\.xhtml">[^\n]*\n)(<li><a href="c03\.xhtml">[^\n]*\n)/, "$2$1");
  fails(run(zipOf(edit(files, "OEBPS/nav.xhtml", swap))), "contents", "nav and NCX entries differ");
  // The same new order everywhere (nav, NCX and the page): out of book order.
  const page = (t) => t.replace(/(<p class="toc-1"><a href="c02\.xhtml">[^\n]*\n)(<p class="toc-1"><a href="c03\.xhtml">[^\n]*\n)/, "$2$1");
  let f2 = edit(files, "OEBPS/nav.xhtml", swap);
  f2 = edit(f2, "OEBPS/toc.ncx", (t) => {
    // Swap the two navPoints whole (labels and links), keep playOrder 1, 2, 3.
    const pts = [...t.matchAll(/<navPoint id="np(\d+)" playOrder="\d+">.*?<\/navPoint>/g)].map((m) => m[0]);
    const strip = (p) => p.replace(/<navPoint id="np\d+" playOrder="\d+">/, "");
    const order = [pts[0], pts[2], pts[1], ...pts.slice(3)].map(strip);
    let k = 0;
    return t.replace(/<navMap>[\s\S]*<\/navMap>/, `<navMap>\n${order.map((p) => `<navPoint id="np${++k}" playOrder="${k}">${p}`).join("\n")}\n</navMap>`);
  });
  f2 = edit(f2, "OEBPS/contents.xhtml", page);
  fails(run(zipOf(f2)), "contents", "out of book order: Chapter 1: One habit at a time");
});

Deno.test("contents: the page and the nav differ; a playOrder gap; the NCX uid", () => {
  const files = filesOf();
  fails(run(zipOf(edit(files, "OEBPS/contents.xhtml", (t) => t.replace(">Introduction<", ">Intro<")))), "contents", "the contents page and the nav differ");
  fails(run(zipOf(edit(files, "OEBPS/toc.ncx", (t) => t.replace('playOrder="2"', 'playOrder="7"')))), "contents", "NCX playOrder is not 1, 2, 3");
  fails(run(zipOf(edit(files, "OEBPS/toc.ncx", (t) => t.replace(/name="dtb:uid" content="[^"]+"/, 'name="dtb:uid" content="urn:uuid:00000000-0000-8000-8000-000000000000"')))), "contents", "the NCX uid is not the book identifier");
});

Deno.test("contents: a dead contents link; a dead link in the text", () => {
  const files = filesOf({ contents_sections: true });
  fails(run(zipOf(editAll(files, (t) => t.split("c02.xhtml#s1").join("c02.xhtml#nope")))), "contents", "a contents link does not land: OEBPS/c02.xhtml#nope");
  fails(run(zipOf(edit(files, "OEBPS/c01.xhtml", (t) => t.replace("Small habits", '<a href="c09.xhtml">Small</a> habits')))), "contents", "a link in OEBPS/c01.xhtml does not land: c09.xhtml");
});

Deno.test("contents: 3 levels; page numbers", () => {
  const files = filesOf({ contents_sections: true });
  fails(run(zipOf(edit(files, "OEBPS/nav.xhtml", (t) => t.replace('<li><a href="c02.xhtml#s1">Pick one</a></li>', '<li><a href="c02.xhtml#s1">Pick one</a>\n<ol>\n<li><a href="c02.xhtml#s2">Deep</a></li>\n</ol></li>')))), "contents", "more than 2 levels");
  fails(run(zipOf(edit(files, "OEBPS/toc.ncx", (t) => t.replace("</ncx>", "<pageList><navLabel><text>Pages</text></navLabel></pageList>\n</ncx>")))), "contents", "the NCX has a page list");
  fails(run(zipOf(edit(files, "OEBPS/c01.xhtml", (t) => t.replace("<section", '<span epub:type="pagebreak" id="p1"></span><section')))), "contents", "OEBPS/c01.xhtml has page numbers");
});

Deno.test("contents (E24010): a contents link on an id on body, on hidden text; a style sheet that hides", () => {
  const files = filesOf({ contents_sections: true });
  // The chapter link points to an id on body.
  const onBody = editAll(edit(files, "OEBPS/c02.xhtml", (t) => t.replace("<body>", '<body id="top">')), (t, n) => (n === "OEBPS/c02.xhtml" ? t : t.split('"c02.xhtml"').join('"c02.xhtml#top"')));
  fails(run(zipOf(onBody)), "contents", "a contents link lands on the body: OEBPS/c02.xhtml#top");
  fails(run(zipOf(edit(files, "OEBPS/c02.xhtml", (t) => t.replace('<h2 id="s1">', '<h2 id="s1" hidden="hidden">')))), "contents", "a contents link lands on hidden text: OEBPS/c02.xhtml#s1");
  fails(run(zipOf(edit(files, "OEBPS/c02.xhtml", (t) => t.replace('<section epub:type="chapter">', '<section epub:type="chapter" style="display: none">')))), "contents", "a contents link lands on hidden text: OEBPS/c02.xhtml#s1");
  fails(run(zipOf(edit(files, "OEBPS/style.css", (t) => `${t}h2 { display: none; }\n`))), "contents", "OEBPS/style.css hides text");
});

/* -- 3. Book details ------------------------- */

Deno.test("details: title, subtitle and author against 04 Title and the pen name", () => {
  const bytes = zipOf(filesOf());
  fails(run(bytes, { ...EXPECT, title: "Another title" }), "details", "the title is not 04 Title");
  fails(run(bytes, { ...EXPECT, subtitle: "Another subtitle" }), "details", "the subtitle is not 04 Title");
  fails(run(bytes, { ...EXPECT, subtitle: "" }), "details", "a title too many or too few");
  fails(run(bytes, { ...EXPECT, author: "Someone Else" }), "details", "the author is not the pen name");
  fails(run(bytes, { ...EXPECT, author: "" }), "details", "the author is not the pen name");
  const noPen = zipOf(filesOf({}, { book: { pen_name: "", subtitle: "" } }));
  assert(C.ok(run(noPen, { title: EXPECT.title, subtitle: "", author: "", isbn: null })));
  fails(run(noPen, EXPECT), "details", "a title too many or too few");
});

Deno.test("details (E20006): two main titles, or a title with no title-type", () => {
  const files = filesOf();
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace('<meta refines="#subtitle" property="title-type">subtitle</meta>', '<meta refines="#subtitle" property="title-type">main</meta>')))), "details", "not one main title (E20006)");
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace('<meta refines="#title" property="title-type">main</meta>', "")))), "details", "not one main title (E20006)");
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace("<dc:language>", "<dc:title>Extra</dc:title>\n<dc:language>")))), "details", "not one main title (E20006)");
});

Deno.test("details: language, identifier, modified date", () => {
  const files = filesOf();
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace("<dc:language>en</dc:language>", "<dc:language>fr</dc:language>")))), "details", "the language is not en");
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace(/<meta property="dcterms:modified">[^<]+<\/meta>/, "")))), "details", "no modified date");
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace("</metadata>", "<dc:identifier>other</dc:identifier>\n</metadata>")))), "details", "not one urn:uuid identifier");
});

Deno.test("details: an ISBN in the file (Q2): urn:isbn, or the print ISBN's digits, with or without hyphens", () => {
  const files = filesOf({ isbn: "9781234567897" });
  const withIsbn = { ...EXPECT, isbn: "978-1-234-56789-7" };
  assert(C.ok(run(zipOf(files), withIsbn)));
  fails(run(zipOf(edit(files, "OEBPS/content.opf", (t) => t.replace("</metadata>", '<meta property="belongs-to-collection">urn:isbn:9781234567897</meta>\n</metadata>'))), withIsbn), "details", "OEBPS/content.opf names an ISBN");
  for (const shown of ["9781234567897", "978-1-234-56789-7", "978 1 234 56789 7"]) {
    fails(run(zipOf(edit(files, "OEBPS/copyright.xhtml", (t) => t.replace("</section>", `<p>ISBN ${shown}</p>\n</section>`))), withIsbn), "details", "OEBPS/copyright.xhtml holds the print ISBN");
  }
});

/* -- The strict test checker ----------------- */

Deno.test("xml-strict: the test stand-in for DOMParser rejects what XML rejects", () => {
  const ok = '<?xml version="1.0" encoding="UTF-8"?>\n<a xmlns:x="u"><x:b c="1">t &amp; &#x41;</x:b></a>';
  assertEquals(wellFormed("t.xml", ok), true);
  const bad = {
    "a bare &": "<a>&</a>",
    "an unknown entity": "<a>&nbsp;</a>",
    "a mismatched tag": "<a><b></a></b>",
    "two roots": "<a/><b/>",
    "an undeclared prefix": "<x:a/>",
    "a duplicate attribute": '<a b="1" b="2"/>',
    "an unquoted attribute": "<a b=1/>",
    "a < in an attribute": '<a b="<"/>',
    "]]> in text": "<a>]]></a>",
    "-- in a comment": "<a><!-- a -- b --></a>",
    "an illegal character": "<a>\u0001</a>",
    "a reference to an illegal character": "<a>&#1;</a>",
    "U+FFFF": "<a>\uFFFF</a>",
    "a misplaced XML declaration": '<a/><?xml version="1.0"?>'
  };
  for (const [why, x] of Object.entries(bad)) assert(wellFormed("t.xml", x) !== true, why);
});
