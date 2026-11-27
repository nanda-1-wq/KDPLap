// deno test --allow-read tests/format-epub.test.js   (from the repo root)
// 08 Format, E13.3 Part 1: the book -> EPUB 3 (js/format/epub.js, plan section 2 and section 8).
// The files and their order, the OPF, the spine, nav, NCX and the contents page
// (the same entries); parts on and off; chapter labels; escaping (& < > " ' and
// control characters); the Markdown cases; curly quotes as print; what is left
// out (Verify flags, source labels, drop cap, ISBN, cover, running header,
// drafts); fixed bytes for fixed inputs; the CSS against the Kindle text rules;
// a 200-chapter book; no pen name. The md2typst parity is tests/epub-parity.test.js.
import { assert, assertEquals, assertFalse, assertMatch, assertNotMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
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
import "./fixtures/part-cases.js";
import { wellFormed } from "./lib/xml-strict.js";

const E = globalThis.kdpEpub;
const F = globalThis.kdpFormatRules;
const B = globalThis.kdpEpubBooks;
const enc = new TextEncoder();
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Build a book: settings over the defaults, data over the fixture book, extras over the fixed ones. */
function build(settings = {}, dataOver = {}, extras = {}) {
  const st = { ...F.defaults(), ...settings };
  const d = B.data(dataOver);
  return E.build(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY, ...extras });
}
const file = (b, name) => (b.files.find((f) => f.name === name) || {}).text;
const allText = (b) => b.files.map((f) => f.text).join("\n");
const ALL = { parts: B.ALL_PARTS };

/* -- Hash and identifier ------------------- */

Deno.test("sha256: the standard test vectors", () => {
  assertEquals(hex(E.sha256(enc.encode(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(hex(E.sha256(enc.encode("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assertEquals(hex(E.sha256(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assertEquals(hex(E.sha256(new Uint8Array(1000).fill(0x61))), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
});

Deno.test("uuid: stable, version 8, never the raw book id", () => {
  const u = E.uuid(B.BOOK_ID);
  assertEquals(u, E.uuid(B.BOOK_ID));
  assertMatch(u, /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert(u !== E.uuid("other-book"));
  const b = build(ALL);
  assertFalse(allText(b).includes(B.BOOK_ID), "the raw book id is in the file");
  assertEquals(b.meta.identifier, u);
});

/* -- Files, OPF, spine --------------------- */

Deno.test("files: the fixed order, mimetype first, one XHTML per part", () => {
  const b = build(ALL);
  assertEquals(b.files.map((f) => f.name), [
    "mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/toc.ncx", "OEBPS/style.css",
    "OEBPS/title.xhtml", "OEBPS/copyright.xhtml", "OEBPS/contents.xhtml",
    "OEBPS/c01.xhtml", "OEBPS/c02.xhtml", "OEBPS/c03.xhtml", "OEBPS/c04.xhtml", "OEBPS/c05.xhtml",
    "OEBPS/about.xhtml", "OEBPS/also-by.xhtml"
  ]);
  assertEquals(file(b, "mimetype"), "application/epub+zip");
  assertStringIncludes(file(b, "META-INF/container.xml"), '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>');
  assertEquals(b.spine.map((x) => x.href), ["title.xhtml", "copyright.xhtml", "contents.xhtml", "c01.xhtml", "c02.xhtml", "c03.xhtml", "c04.xhtml", "c05.xhtml", "about.xhtml", "also-by.xhtml"]);
  assertEquals(b.spine.map((x) => x.title), ["Micro Study Habits", "Copyright", "Contents", "Introduction", "One habit at a time", "Time and place", "Chapter 3", "What comes next", "About the author", "Also by Ada Haroun"]);
});

Deno.test("every XML file is well formed (strict checker)", () => {
  for (const g of B.golden.filter((x) => x.name !== "long-200")) {
    const st = { ...F.defaults(), ...g.settings };
    const d = B.data(g.data || {});
    const b = E.build(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    for (const f of b.files) {
      if (!/\.(xhtml|opf|ncx|xml)$/.test(f.name)) continue;
      assertEquals(wellFormed(f.name, f.text), true, `${g.name} ${f.name}`);
    }
  }
});

Deno.test("OPF: metadata, manifest = files, spine = parts, nav not in the spine, NCX as spine toc, guide toc", () => {
  const b = build(ALL);
  const opf = file(b, "OEBPS/content.opf");
  assertStringIncludes(opf, '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">');
  assertStringIncludes(opf, `<dc:identifier id="book-id">${E.uuid(B.BOOK_ID)}</dc:identifier>`);
  assertStringIncludes(opf, '<dc:title id="title">Micro Study Habits</dc:title>\n<meta refines="#title" property="title-type">main</meta>');
  assertStringIncludes(opf, '<dc:title id="subtitle">Small Steps for Busy Adult Learners</dc:title>\n<meta refines="#subtitle" property="title-type">subtitle</meta>');
  assertStringIncludes(opf, '<dc:creator id="creator">Ada Haroun</dc:creator>\n<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>');
  assertStringIncludes(opf, "<dc:language>en</dc:language>");
  assertStringIncludes(opf, '<meta property="dcterms:modified">2026-11-23T10:00:00Z</meta>');
  const hrefs = [...opf.matchAll(/<item id="[^"]+" href="([^"]+)"/g)].map((m) => `OEBPS/${m[1]}`);
  assertEquals(hrefs.sort(), b.files.map((f) => f.name).filter((n) => n.startsWith("OEBPS/") && n !== "OEBPS/content.opf").sort());
  assertStringIncludes(opf, '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  assertStringIncludes(opf, '<spine toc="ncx">');
  assertNotMatch(opf, /idref="nav"/);
  assertEquals([...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((m) => m[1]), b.spine.map((x) => x.id));
  assertStringIncludes(opf, '<reference type="toc" title="Contents" href="contents.xhtml"/>');
});

Deno.test("modified: the server time without a fraction; a bad date throws", () => {
  assertEquals(build({}, {}, { now: "2026-01-02T03:04:05.678Z" }).meta.modified, "2026-01-02T03:04:05Z");
  assertThrows(() => build({}, {}, { now: "not a date" }), Error, "bad date");
});

/* -- Parts --------------------------------- */

Deno.test("parts: intro, conclusion, about and Also by follow their switches; contents is always on", () => {
  const off = build({ parts: { title: true, copyright: true, contents: false, intro: false, conclusion: false, about: false, also_by: false } });
  assertEquals(off.spine.map((x) => x.href), ["title.xhtml", "copyright.xhtml", "contents.xhtml", "c01.xhtml", "c02.xhtml", "c03.xhtml"]);
  assertEquals(off.nav.map((e) => e.label), ["Chapter 1: One habit at a time", "Chapter 2: Time and place", "Chapter 3"]);
  const on = build(ALL);
  assertEquals(on.nav.map((e) => e.label), ["Introduction", "Chapter 1: One habit at a time", "Chapter 2: Time and place", "Chapter 3", "What comes next", "About the author"]);
  // Also by is never in the contents (print: toc none); About the author is.
  assertFalse(on.nav.some((e) => e.label.startsWith("Also by")));
  // About on with no bio: no About page.
  const noBio = build(ALL, { book: { bio: "  \n " } });
  assertFalse(noBio.spine.some((x) => x.id === "about"));
  // Also by on with no books: no page.
  const noAlso = build(ALL, {}, { alsoBy: [] });
  assertFalse(noAlso.spine.some((x) => x.id === "also-by"));
});

Deno.test("parts: drafts and empty sections are left out (Final only, as the Print PDF)", () => {
  const t = allText(build(ALL));
  assertFalse(t.includes("never in the file"));
  assertFalse(t.includes("Not ready yet"));
});

Deno.test("about and Also by: the bio's paragraphs and line breaks; the books in order, italic titles", () => {
  const b = build(ALL);
  assertStringIncludes(file(b, "OEBPS/about.xhtml"), '<h1>About the author</h1>\n<p class="bio">Ada writes about learning.<br/>She lives by the sea.</p>\n<p class="bio">She has two cats.</p>');
  const a = file(b, "OEBPS/also-by.xhtml");
  assertStringIncludes(a, "<h1>Also by Ada Haroun</h1>");
  assertStringIncludes(a, '<p class="also-by"><em>Deep Work for Students</em><br/><span class="also-sub">Focus in a Noisy World</span></p>\n<p class="also-by"><em>The \u201CFive Card\u201D Method</em></p>');
});

/* -- Labels and headings ------------------- */

Deno.test("chapter labels: Chapter 2 / 2 / none, as print; Introduction and an untitled chapter have no label", () => {
  const c02 = (label) => file(build({ ...ALL, chapter_label: label }), "OEBPS/c02.xhtml");
  assertStringIncludes(c02("chapter"), '<p class="chapter-label">Chapter 1</p>\n<h1 class="after-label">One habit at a time</h1>');
  assertStringIncludes(c02("number"), '<p class="chapter-label">1</p>\n<h1 class="after-label">One habit at a time</h1>');
  assertStringIncludes(c02("none"), '<section epub:type="chapter">\n<h1>One habit at a time</h1>');
  const nav = (label) => build({ ...ALL, chapter_label: label }).nav.map((e) => e.label);
  assertEquals(nav("chapter").slice(1, 4), ["Chapter 1: One habit at a time", "Chapter 2: Time and place", "Chapter 3"]);
  assertEquals(nav("number").slice(1, 4), ["1. One habit at a time", "2. Time and place", "Chapter 3"]);
  assertEquals(nav("none").slice(1, 4), ["One habit at a time", "Time and place", "Chapter 3"]);
  const b = build(ALL);
  assertStringIncludes(file(b, "OEBPS/c01.xhtml"), '<section epub:type="introduction">\n<h1>Introduction</h1>');
  assertStringIncludes(file(b, "OEBPS/c04.xhtml"), '<section epub:type="chapter">\n<h1>Chapter 3</h1>');
  assertStringIncludes(file(b, "OEBPS/c05.xhtml"), '<section epub:type="conclusion">\n<h1>What comes next</h1>');
});

Deno.test("headings: section title = h2 with an id; a heading in the text = h3 or lower (marks one level down, as print)", () => {
  const c02 = file(build(ALL), "OEBPS/c02.xhtml");
  assertStringIncludes(c02, '<h2 id="s1">Pick one</h2>');
  assertStringIncludes(c02, '<h2 id="s2">A daily plan</h2>');
  assertStringIncludes(c02, "<h3>A quick test</h3>");
  // A section with no title has no h2 and takes no id number.
  const c03 = file(build(ALL), "OEBPS/c03.xhtml");
  assertStringIncludes(c03, '<h1 class="after-label">Time and place</h1>\n<ol><li>Choose a time</li>');
  assertStringIncludes(c03, '<h2 id="s1">Focus</h2>');
  assertEquals(E.blockList("# a\n\n## b\n\n### c\n\n###### f").map((x) => x.html), ["<h3>a</h3>", "<h3>b</h3>", "<h3>c</h3>", "<h6>f</h6>"]);
});

Deno.test("headings nested properly: with no section title yet, a heading in the text moves up one level (never h1 \u2192 h3)", () => {
  // Unit: top 1 (right under the chapter h1) moves every heading up one; equal headings stay equal.
  assertEquals(E.blockList("# a\n\n## b\n\n### c\n\n###### f", 1).map((x) => x.html), ["<h2>a</h2>", "<h2>b</h2>", "<h2>c</h2>", "<h5>f</h5>"]);
  assertEquals(E.blockList("## x\n\ntext\n\n## y", 1).map((x) => x.rank), [2, undefined, 2]);
  assertEquals(E.blockList("> ## in a quote", 1)[0].html, '<blockquote><h2>in a quote</h2>\n</blockquote>');
  // The book: an untitled first section, then a titled one, then an untitled one.
  const b = build(ALL, B.HEADINGS);
  const c = file(b, "OEBPS/c01.xhtml");
  const hs = [...c.matchAll(/<(h[1-6])[^>]*>([^<]+)<\/h[1-6]>/g)].map((m) => `${m[1]} ${m[2]}`);
  assertEquals(hs, ["h1 Untitled first section", "h2 A big heading", "h2 A small heading", "h2 Steps", "h3 Inside Steps", "h3 After Steps"]);
  // Each heading is at most one level below the one before it, in every golden book.
  for (const g of B.golden) {
    const st = { ...F.defaults(), ...g.settings };
    const gb = E.build(F.modelOf(B.data(g.data || {}), st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    for (const f of gb.files.filter((x) => x.name.endsWith(".xhtml") && x.name !== "OEBPS/nav.xhtml")) {
      let last = 0;
      for (const m of f.text.matchAll(/<h([1-6])[\s>]/g)) {
        const n = Number(m[1]);
        assert(n <= last + 1, `${g.name} ${f.name}: h${last} then h${n}`);
        last = n;
      }
    }
  }
});

Deno.test("first paragraphs: no indent after a heading, a list, a quote or at the start (Typst's rule)", () => {
  const c02 = file(build(ALL), "OEBPS/c02.xhtml");
  assertStringIncludes(c02, '<h2 id="s1">Pick one</h2>\n<p class="first">Pick one habit.');
  assertStringIncludes(c02, "<p>It\u2019s easier than it looks.");
  assertStringIncludes(c02, '</ul>\n<p class="first">That is the whole plan.</p>');
  const c03 = file(build(ALL), "OEBPS/c03.xhtml");
  assertStringIncludes(c03, '</blockquote>\n<p class="first">Then keep going.</p>');
});

/* -- Contents: nav, NCX, contents page ----- */

Deno.test("contents: nav, NCX and the contents page have the same entries; sections on adds level 2", () => {
  for (const sections of [false, true]) {
    const b = build({ ...ALL, contents_sections: sections });
    const nav = file(b, "OEBPS/nav.xhtml");
    const ncx = file(b, "OEBPS/toc.ncx");
    const page = file(b, "OEBPS/contents.xhtml");
    const flat = b.nav.flatMap((e) => [{ l: 1, label: e.label, href: e.href }, ...e.children.map((k) => ({ l: 2, label: k.label, href: k.href }))]);
    assertEquals(flat.length, sections ? 6 + 5 : 6);   // 5 titled sections (2 have no title)
    const fromNav = [...nav.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
    const fromNcx = [...ncx.matchAll(/<text>([^<]+)<\/text><\/navLabel><content src="([^"]+)"\/>/g)].map((m) => [m[2], m[1]]);
    const fromPage = [...page.matchAll(/<p class="toc-([12])"><a href="([^"]+)">([^<]+)<\/a><\/p>/g)].map((m) => [m[2], m[3]]);
    const want = flat.map((x) => [x.href, x.label.replace(/&/g, "&amp;")]);
    assertEquals(fromNav, want);
    assertEquals(fromNcx, want);
    assertEquals(fromPage, want);
    assertStringIncludes(ncx, `<meta name="dtb:depth" content="${sections ? 2 : 1}"/>`);
    assertStringIncludes(ncx, `<meta name="dtb:uid" content="${b.meta.identifier}"/>`);
  }
  const b = build({ ...ALL, contents_sections: true });
  assertEquals(b.nav[1].children, [{ label: "Pick one", href: "c02.xhtml#s1" }, { label: "A daily plan", href: "c02.xhtml#s2" }]);
  assertStringIncludes(file(b, "OEBPS/nav.xhtml"), '<nav epub:type="landmarks" id="landmarks" hidden="hidden">\n<h2>Guide</h2>\n<ol>\n<li><a epub:type="toc" href="contents.xhtml">Contents</a></li>');
});

Deno.test("contents: no page numbers anywhere", () => {
  const t = allText(build({ ...ALL, contents_sections: true }));
  assertFalse(/pageList|page-list|pagebreak/.test(t));
});

/* -- Escaping ------------------------------ */

Deno.test("escaping: & < > \" ' in titles, the pen name and the text; only our tags", () => {
  const b = build(ALL, B.HOSTILE);
  const t = file(b, "OEBPS/title.xhtml");
  assertStringIncludes(t, '<h1 class="book-title">&lt;script&gt;alert(\u201Cx\u201D)&lt;/script&gt; &amp; ]]&gt; #title</h1>');
  assertStringIncludes(t, '<p class="subtitle">\u2018single\u2019 &amp; \u201Cdouble\u201D &lt;b&gt;</p>');
  assertStringIncludes(t, '<p class="author">A &amp; B &lt;C&gt;</p>');
  const opf = file(b, "OEBPS/content.opf");
  assertStringIncludes(opf, '<dc:title id="title">&lt;script&gt;alert("x")&lt;/script&gt; &amp; ]]&gt; #title</dc:title>');
  assertStringIncludes(opf, '<dc:creator id="creator">A &amp; B &lt;C&gt;</dc:creator>');
  const c = file(b, "OEBPS/c01.xhtml");
  assertStringIncludes(c, '<h1 class="after-label">&lt;/h1&gt;&lt;h1&gt;Fake</h1>');
  assertStringIncludes(c, '<h2 id="s1">&lt;img src=x onerror=alert(1)&gt;</h2>');
  assertStringIncludes(c, "&lt;p&gt;Not HTML&lt;/p&gt; &amp;amp; &amp;lt; &amp;#x41; ]]&gt; &lt;!-- not a comment --&gt; &lt;?xml?&gt;");
  for (const f of b.files) {
    if (!f.name.endsWith(".xhtml")) continue;
    const tags = new Set([...f.text.matchAll(/<\/?([a-zA-Z][\w:]*)/g)].map((m) => m[1]));
    for (const tag of tags) assert(["html", "head", "meta", "title", "link", "body", "section", "nav", "ol", "ul", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "em", "strong", "span", "blockquote"].includes(tag), `${f.name}: <${tag}>`);
  }
});

Deno.test("escaping: control characters, C1, U+FFFF and lone surrogates are removed; emoji and combining marks stay", () => {
  const b = build(ALL, B.UNICODE);
  const c = file(b, "OEBPS/c01.xhtml");
  assertStringIncludes(c, "Control characters  are removed, so is a lone  surrogate and .");
  assertStringIncludes(c, "<h1 class=\"after-label\">Emoji \uD83D\uDC4D\uD83C\uDFFD and flags \uD83C\uDDEF\uD83C\uDDF5</h1>");
  assertStringIncludes(c, "Family \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66");
  assertStringIncludes(c, "e\u0301 a\u0308 n\u0303");
  // Section text goes through mdBody (markdown-lite normalize): a no-break space becomes a space, as print.
  assertStringIncludes(c, "Non-breaking space");
  assertFalse(c.includes("\u00a0"));
  assertStringIncludes(file(b, "OEBPS/content.opf"), "<dc:title id=\"title\">Caf\u00E9 Notes \uD83D\uDCDA: Lernen, \u5B66\u4E60, \u062A\u0639\u0644\u0651\u0645</dc:title>");
  assertStringIncludes(file(b, "OEBPS/about.xhtml"), "Zo\u00EB \uD83D\uDC69\u200D\uD83C\uDFEB teaches in Krak\u00F3w.<br/>She likes \u00BD cups of tea.");
});

Deno.test("control input: the fixture really holds C0, C1, a lone surrogate and U+FFFF (escapes, not dropped)", () => {
  const t = B.UNICODE.chapters[0].sections[0].version.content;
  for (const cp of [0x0001, 0x0007, 0x0085, 0x009f, 0xd800, 0xffff]) assert(t.includes(String.fromCharCode(cp)), `U+${cp.toString(16).toUpperCase().padStart(4, "0")} is missing from the input`);
  const c = file(build(ALL, B.UNICODE), "OEBPS/c01.xhtml");
  for (const cp of [0x0001, 0x0007, 0x0085, 0x009f, 0xd800, 0xffff]) assertFalse(c.includes(String.fromCharCode(cp)), `U+${cp.toString(16)} is in the file`);
});

Deno.test("format characters: never removed or changed (owner decides, Guidelines 6.7); only what XML or HTML forbids goes", () => {
  const b = build(ALL, B.FORMAT);
  const all = allText(b);
  for (const [name, ch] of Object.entries(B.FORMAT_CHARS)) {
    const n = [...B.FORMAT.book.title + B.FORMAT.book.bio + JSON.stringify(B.FORMAT.chapters)].filter((x) => x === ch).length;
    assert(n > 0, `${name} is not in the input`);
    const k = [...all].filter((x) => x === ch).length;
    assert(k >= n, `${name}: ${n} in the input, ${k} in the files`);
  }
  // The emoji sequences stay whole: ZWJ family and the England flag (tag characters).
  const c = file(b, "OEBPS/c01.xhtml");
  assertStringIncludes(c, B.FORMAT_SAMPLES.family);
  assertStringIncludes(c, B.FORMAT_SAMPLES.england);
  assertStringIncludes(c, B.FORMAT_SAMPLES.softHyphen);
});

Deno.test("E20006: exactly one main dc:title; the subtitle is a second dc:title refined as subtitle; none without one", () => {
  const C = globalThis.kdpEpubCheck;
  for (const g of B.golden) {
    const st = { ...F.defaults(), ...g.settings };
    const d = B.data(g.data || {});
    const gb = E.build(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    const meta = C.parseXml(file(gb, "OEBPS/content.opf")).children.find((n) => n.name === "metadata");
    const kids = meta.children.filter((n) => typeof n !== "string");
    const titles = kids.filter((n) => n.name === "dc:title");
    const typeOf = (t) => kids.filter((n) => n.name === "meta" && n.attrs.refines === `#${t.attrs.id}` && n.attrs.property === "title-type").map((n) => n.children.join(""));
    assertEquals(titles.map(typeOf), d.book.subtitle && d.book.subtitle.trim() ? [["main"], ["subtitle"]] : [["main"]], g.name);
    assertEquals(titles[0].children.join(""), (d.book.title || "").trim() || "Untitled book", g.name);
  }
});

Deno.test("E24010: no contents link (nav, NCX, contents page) lands on an id on <body> or on hidden text", () => {
  const C = globalThis.kdpEpubCheck;
  const els = (n) => n.children.filter((x) => typeof x !== "string");
  const pathTo = (n, id, up = []) => { const here = [...up, n]; if (n.attrs.id === id) return here; for (const k of els(n)) { const p = pathTo(k, id, here); if (p) return p; } return null; };
  const hidden = (n) => n.attrs.hidden != null || /display|visibility/.test(n.attrs.style || "");
  const walk = function* (n) { yield n; for (const k of els(n)) yield* walk(k); };
  for (const g of B.golden) {
    const st = { ...F.defaults(), ...g.settings };
    const gb = E.build(F.modelOf(B.data(g.data || {}), st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
    assertNotMatch(file(gb, "OEBPS/style.css"), /display|visibility/, g.name);
    const nav = C.parseXml(file(gb, "OEBPS/nav.xhtml"));
    const toc = [...walk(nav)].find((n) => n.name === "nav" && n.attrs["epub:type"] === "toc");
    assertFalse(hidden(toc), `${g.name}: the toc nav is hidden`);
    const hrefs = [
      ...[...walk(toc)].filter((n) => n.name === "a").map((n) => n.attrs.href),
      ...[...walk(C.parseXml(file(gb, "OEBPS/toc.ncx")))].filter((n) => n.name === "content").map((n) => n.attrs.src),
      ...[...walk(C.parseXml(file(gb, "OEBPS/contents.xhtml")))].filter((n) => n.name === "a").map((n) => n.attrs.href)
    ];
    assert(hrefs.length >= 3, g.name);
    for (const h of hrefs) {
      const [f, id] = h.split("#");
      const tree = C.parseXml(file(gb, `OEBPS/${f}`));
      const body = [...walk(tree)].find((n) => n.name === "body");
      assertEquals(body.attrs.id, undefined, `${g.name}: ${f} has an id on body`);
      const chain = id ? pathTo(tree, id) : [tree, body];
      assert(chain, `${g.name}: ${h} does not land`);
      if (id) assert(chain[chain.length - 1].name !== "body", `${g.name}: ${h} lands on an id on body`);
      assertFalse(chain.some(hidden), `${g.name}: ${h} lands on hidden text`);
    }
  }
});

/* -- Markdown ------------------------------ */

Deno.test("markdown: emphasis, \\* stars, escaped markers, line breaks", () => {
  const h = (md) => E.blockList(md).map((x) => x.html);
  assertEquals(h("**bold** and *italic*"), ["<strong>bold</strong> and <em>italic</em>"]);
  assertEquals(h("**bold with *italic* inside**"), ["<strong>bold with <em>italic</em> inside</strong>"]);
  assertEquals(h("*a **b** c*"), ["<em>a <strong>b</strong> c</em>"]);
  assertEquals(h("***both***"), ["<em><strong>both</strong></em>"]);
  assertEquals(h("\\*not italic\\*"), ["*not italic*"]);
  assertEquals(h("an *unclosed star"), ["an *unclosed star"]);
  assertEquals(h("\\- not a list"), ["- not a list"]);
  assertEquals(h("\\## not a heading"), ["## not a heading"]);
  assertEquals(h("1\\. Not a list"), ["1. Not a list"]);
  assertEquals(h("line one\nline two"), ["line one<br/>line two"]);
  assertEquals(h("one\n\ntwo"), ["one", "two"]);
  // A crossing pair closes the most recent tag, as Typst's "];" does.
  assertEquals(h("*x **y*z* w**"), ["<em>x <strong>y</strong>z* w</em>"]);
});

Deno.test("markdown: lists keep their numbers (start and value), quotes nest", () => {
  const h = (md) => E.blockList(md).map((x) => x.html);
  assertEquals(h("- one\n- two"), ["<ul><li>one</li><li>two</li></ul>"]);
  assertEquals(h("* one\n+ two"), ["<ul><li>one</li><li>two</li></ul>"]);
  assertEquals(h("1. a\n2. b"), ["<ol><li>a</li><li>b</li></ol>"]);
  assertEquals(h("5. a\n6. b\n9. c"), ['<ol start="5"><li>a</li><li>b</li><li value="9">c</li></ol>']);
  assertEquals(h("1) a\n1) b"), ['<ol><li>a</li><li value="1">b</li></ol>']);
  assertEquals(h("- a\n1. b"), ["<ul><li>a</li></ul>", "<ol><li>b</li></ol>"]);
  assertEquals(h("> a quote\n> - with\n> - list\n>\n> > nested"),
    ['<blockquote><p class="first">a quote</p>\n<ul><li>with</li><li>list</li></ul>\n<blockquote><p class="first">nested</p>\n</blockquote>\n</blockquote>']);
});

Deno.test("links: https with a real host and mailto with a real address only, percent-encoded; anything else stays text", () => {
  const h = (md) => E.blockList(md).map((x) => x.html)[0];
  assertEquals(h("[NicheInk](https://nicheink.com)"), '<a href="https://nicheink.com">NicheInk</a>');
  assertEquals(h("[mail](mailto:a@b.co)"), '<a href="mailto:a@b.co">mail</a>');
  assertEquals(h("[s](https://e.com/s?q=a&r=b#res)"), '<a href="https://e.com/s?q=a&amp;r=b#res">s</a>');
  assertEquals(h("[c](https://e.com/caf\u00E9)"), '<a href="https://e.com/caf%C3%A9">c</a>');
  assertEquals(h("[p](https://e.com/50%off)"), '<a href="https://e.com/50%25off">p</a>');
  assertEquals(h("[h](https://e.com/a#b#c)"), '<a href="https://e.com/a#b%23c">h</a>');
  assertEquals(h("[click](javascript:alert(1))"), "[click](javascript:alert(1))");
  assertEquals(h("[f](file:///etc/passwd)"), "[f](file:///etc/passwd)");
  // No real host or address in the text as typed: plain text (the URL parser alone
  // would read https:///nohost as the host "nohost").
  assertEquals(h("[n](https:///nohost)"), "[n](https:///nohost)");
  assertEquals(h("[n](https://)"), "[n](https://)");
  assertEquals(h("[n](https://.com)"), "[n](https://.com)");
  assertEquals(h("[n](https://-a.com)"), "[n](https://-a.com)");
  assertEquals(h("[n](https://a..com)"), "[n](https://a..com)");
  assertEquals(h("[n](https://@e.com)"), "[n](https://@e.com)");
  assertEquals(h("[m](mailto:)"), "[m](mailto:)");
  assertEquals(h("[m](mailto:nobody)"), "[m](mailto:nobody)");
  assertEquals(h("[m](mailto:a@b)"), "[m](mailto:a@b)");
  assertEquals(h("[m](mailto:@b.co)"), "[m](mailto:@b.co)");
  assertEquals(h("[b](https://exa<mple.com)"), "[b](https://exa&lt;mple.com)");
  // Real hosts and addresses: a port, a user, a bare host, Unicode, an address with a subject.
  assertEquals(h("[p](https://e.com:8443/x)"), '<a href="https://e.com:8443/x">p</a>');
  assertEquals(h("[u](https://me@e.com/)"), '<a href="https://me@e.com/">u</a>');
  assertEquals(h("[l](http://localhost)"), '<a href="http://localhost">l</a>');
  assertEquals(h("[q](https://e.com?x=1)"), '<a href="https://e.com?x=1">q</a>');
  assertEquals(h("[i](https://b\u00FCcher.de/a)"), '<a href="https://b%C3%BCcher.de/a">i</a>');
  assertEquals(h("[m](mailto:a.b@mail.e.co?subject=Hi)"), '<a href="mailto:a.b@mail.e.co?subject=Hi">m</a>');
  // Stars around a link: print splits out the link before emphasis, so the stars
  // print as typed around the link (md2typst: \*\*#link(...)[bold];\*\*). The EPUB
  // does the same (tests/epub-parity.test.js checks the two).
  assertEquals(h("**[bold](https://e.com/b)**"), '**<a href="https://e.com/b">bold</a>**');
  assertEquals(h("[**bold**](https://e.com/b)"), '<a href="https://e.com/b"><strong>bold</strong></a>');
});

/* -- Curly quotes -------------------------- */

Deno.test("curly quotes: Typst's rule, as print; after a digit they stay straight", () => {
  const h = (md) => E.blockList(md).map((x) => x.html)[0];
  assertEquals(h(`"Quotes" and it's`), "\u201CQuotes\u201D and it\u2019s");
  assertEquals(h(`5'4" and the 1990's`), `5'4" and the 1990's`);
  assertEquals(h(`She said "it's 5 o'clock"`), "She said \u201Cit\u2019s 5 o\u2019clock\u201D");
  assertEquals(h(`"Nested 'single' quotes"`), "\u201CNested \u2018single\u2019 quotes\u201D");
  assertEquals(h(`("Bracketed") and ['square']`), "(\u201CBracketed\u201D) and [\u2018square\u2019]");
  assertEquals(h(`'tis the 'season'`), "\u2018tis the \u2018season\u2019");
  assertEquals(h(`**5**"`), "<strong>5</strong>\u2033");
  assertEquals(h(`""`), "\u201C\u201D");
  assertEquals(h(`a\n"b"`), "a<br/>\u201Cb\u201D");
  assertEquals(h(`*"x"* and "y"`), "<em>\u201Cx\u201D</em> and \u201Cy\u201D");
  // Titles and labels too (the toc, the nav, the h1), never the metadata.
  const b = build(ALL, { book: { title: `It's "Here"` } });
  assertStringIncludes(file(b, "OEBPS/title.xhtml"), "<h1 class=\"book-title\">It\u2019s \u201CHere\u201D</h1>");
  assertStringIncludes(file(b, "OEBPS/content.opf"), `<dc:title id="title">It's "Here"</dc:title>`);
  assertStringIncludes(file(b, "OEBPS/toc.ncx"), `<docTitle><text>It's "Here"</text></docTitle>`);
});

/* -- Left out ------------------------------ */

Deno.test("left out: Verify flags and source labels; no drop cap, ISBN, cover, running header or trim", () => {
  const b = build({ ...ALL, drop_cap: true, isbn: "9781234567897", running_header: true, header_title: "My Header", recto_start: true, paper: "cream" }, {
    chapters: [{ id: "x", kind: "chapter", position: 1, title: "T", sections: [B.sec("x1", "S", "final", "Claim one [Verify: no source] and a source [S3].\n\nMore.")] }]
  });
  const t = allText(b);
  assertFalse(t.includes("Verify"));
  assertFalse(t.includes("[S3]"));
  assertStringIncludes(file(b, "OEBPS/c01.xhtml"), '<p class="first">Claim one and a source.</p>');
  assertFalse(/9781234567897|978-1|ISBN|isbn/i.test(t));
  assertFalse(/drop|dropcap/i.test(t));
  assertFalse(t.includes("My Header"));
  assertFalse(/cover|<img|image\//i.test(t));
  assertFalse(/cream|6x9|inch|\bpt\b|\bpx\b/.test(t));
  // The same file as with every print-only option off.
  const plain = build({ ...ALL }, { chapters: [{ id: "x", kind: "chapter", position: 1, title: "T", sections: [B.sec("x1", "S", "final", "Claim one [Verify: no source] and a source [S3].\n\nMore.")] }] });
  assertEquals(b.files, plain.files);
});

Deno.test("print-only settings never change the EPUB: drop cap, recto start, running header, header title, ISBN, paper, trim", () => {
  const base = build(ALL);
  const variants = [{ drop_cap: true }, { recto_start: false }, { running_header: false }, { header_title: "X" }, { isbn: "9781234567897" }, { paper: "cream" }];
  for (const v of variants) assertEquals(build({ ...ALL, ...v }).files, base.files, JSON.stringify(v));
  assertEquals(build(ALL, { book: { trim: "8.5x11" } }).files, base.files);
  assertEquals(build(ALL, { book: { trim: "7x10" } }).files, base.files);
});

/* -- No pen name, empty book --------------- */

Deno.test("no pen name: no creator, no author line, 'Also by', the copyright without a name", () => {
  const b = build(ALL, { book: { pen_name: "", subtitle: "  " } });
  const opf = file(b, "OEBPS/content.opf");
  assertFalse(opf.includes("dc:creator"));
  assertFalse(opf.includes('id="subtitle"'));
  assertFalse(file(b, "OEBPS/toc.ncx").includes("docAuthor"));
  assertFalse(file(b, "OEBPS/title.xhtml").includes('class="author"'));
  assertFalse(file(b, "OEBPS/title.xhtml").includes('class="subtitle"'));
  assertStringIncludes(file(b, "OEBPS/also-by.xhtml"), "<h1>Also by</h1>");
  assertStringIncludes(file(b, "OEBPS/copyright.xhtml"), "Copyright \u00A9 2026. All rights reserved.");
  assertEquals(b.meta.author, null);
});

Deno.test("copyright: the same text as print", () => {
  assertStringIncludes(file(build(ALL), "OEBPS/copyright.xhtml"), `<p class="copyright">${globalThis.kdpExportRules.copyright("Ada Haroun", 2026)}</p>`);
});

Deno.test("nothing Final: build throws (the export and the preview show their own state)", () => {
  const st = F.defaults();
  const d = B.data({ chapters: [{ id: "x", kind: "chapter", position: 1, title: "T", sections: [B.sec("x1", "S", "draft", "Draft.")] }] });
  assertThrows(() => E.build(F.modelOf(d, st), st, { bookId: "b", now: B.NOW }), Error, "nothing to build");
});

Deno.test("untitled book: 'Untitled book' as print", () => {
  const b = build(ALL, { book: { title: "  " } });
  assertEquals(b.meta.title, "Untitled book");
  assertStringIncludes(file(b, "OEBPS/content.opf"), '<dc:title id="title">Untitled book</dc:title>');
});

/* -- Fixed bytes --------------------------- */

Deno.test("fixed bytes: the same inputs give the same zip; mimetype first and stored; entry times are UTC", () => {
  const st = { ...F.defaults(), ...ALL };
  const run = () => E.make(F.modelOf(B.data(), st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
  const a = run(), b = run();
  assertEquals(a, b);
  const dv = new DataView(a.buffer, a.byteOffset, a.byteLength);
  assertEquals(dv.getUint32(0, true), 0x04034b50);
  assertEquals(dv.getUint16(8, true), 0);              // stored
  assertEquals(dv.getUint16(28, true), 0);             // no extra field
  assertEquals(new TextDecoder().decode(a.subarray(30, 38)), "mimetype");
  assertEquals(new TextDecoder().decode(a.subarray(38, 58)), "application/epub+zip");
  // 2026-11-23T10:00:00Z -> DOS time 10:00:00, date 2026-11-23, whatever the machine's time zone.
  assertEquals(dv.getUint16(10, true), (10 << 11));
  assertEquals(dv.getUint16(12, true), ((2026 - 1980) << 9) | (11 << 5) | 23);
  // Another time gives other bytes.
  const c = E.make(F.modelOf(B.data(), st), st, { year: 2026, bookId: B.BOOK_ID, now: "2026-11-24T10:00:00Z", alsoBy: B.ALSO_BY });
  assert(hex(E.sha256(c)) !== hex(E.sha256(a)));
});

/* -- CSS and the Kindle text rules --------- */

Deno.test("css: body text keeps the Kindle defaults; em and % only; headings aligned; Modern headings sans-serif", () => {
  for (const style of F.STYLES) {
    const c = E.css(style);
    assertEquals(file(build({ ...ALL, style }), "OEBPS/style.css"), c);
    assertNotMatch(c, /[0-9.]+(px|pt)\b/, `${style}: px or pt`);
    assertNotMatch(c, /line-height|color|position|height|float/, `${style}: a forced property`);
    assertMatch(c, /^body \{ margin: 0; padding: 0; \}$/m);
    assertNotMatch(c, /^body[^}]*font/m);
    assertNotMatch(c, /^p \{[^}]*font/m);
    assertNotMatch(c, /[:\s]-[0-9.]/, `${style}: a negative value`);
    for (const m of c.matchAll(/text-indent: ([0-9.]+)em/g)) assert(Number(m[1]) <= 4, `${style}: indent ${m[1]}em`);
    for (const m of c.matchAll(/margin-(left|right): ([^;]+);/g)) assertMatch(m[2], /^(0|[0-9.]+%)$/, `${style}: ${m[0]}`);
    for (const m of c.matchAll(/(?:^|\n)([^{\n]+)\{([^}]*)\}/g)) {
      if (!/margin:/.test(m[2])) continue;
      const v = /margin: ([^;]+);/.exec(m[2])[1].split(/\s+/);
      if (v.length === 4) for (const side of [v[1], v[3]]) assertMatch(side, /^(0|[0-9.]+%)$/, `${style}: ${m[1]} sides ${side}`);
      else assertEquals(v, ["0"], `${style}: ${m[1]}`);
    }
    for (const h of ["h1", "h2", "h3", "h4, h5, h6", "p.chapter-label"]) assertMatch(c, new RegExp(`^${h} \\{[^}]*text-align: (left|center)`, "m"), `${style} ${h}`);
    assertStringIncludes(c, `font-family: ${style === "modern" ? "sans-serif" : "serif"};`);
  }
});

Deno.test("xhtml: one stylesheet, the XML declaration, xml:lang en, a title in every head", () => {
  const b = build(ALL);
  for (const f of b.files.filter((x) => x.name.endsWith(".xhtml"))) {
    assert(f.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">'), f.name);
    assertMatch(f.text, /<title>[^<]+<\/title>/, f.name);
    if (f.name !== "OEBPS/nav.xhtml") assertStringIncludes(f.text, '<link rel="stylesheet" type="text/css" href="style.css"/>');
    assertNotMatch(f.text, /<body[^>]* id=/, `${f.name}: an id on body (Kindle E24010)`);
  }
});

/* -- Size ---------------------------------- */

Deno.test("a 200-chapter book: 205 parts, 801 contents entries with sections, built fast", () => {
  const st = { ...F.defaults(), ...ALL, contents_sections: true };
  const d = B.data(B.longBook());
  const t0 = performance.now();
  const b = E.build(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
  const bytes = E.zip(b);
  const ms = performance.now() - t0;
  assertEquals(b.spine.length, 3 + 200 + 2);
  assertEquals(b.spine[202].href, "c200.xhtml");
  assertEquals(b.nav.length, 201);
  assertEquals(b.nav.reduce((s, e) => s + 1 + e.children.length, 0), 801);
  assert(ms < 2000, `${ms} ms`);
  assert(bytes.length < 2_000_000, `${bytes.length} bytes`);
});

Deno.test("fileName: the title slug with -ebook.epub", () => {
  assertEquals(E.fileName("Chair Yoga for Seniors: Over 60!"), "chair-yoga-for-seniors-over-60-ebook.epub");
  assertEquals(E.fileName("Caf\u00E9 \u00DCn\u00EFcode"), "cafe-unicode-ebook.epub");
  assertEquals(E.fileName(""), "book-ebook.epub");
  assertEquals(E.ENGINE_ID, "epub3 \u00B7 e1");
});

/* -- E17 book parts ------------------------ */

const PC = globalThis.kdpPartCases;
const C = globalThis.kdpEpubCheck;
/** Like build(), with data.book_parts (the fixture's data() keeps only the keys it knows). null: no book_parts key. */
function withParts(parts = PC.all(), settings = ALL, over = {}) {
  const st = { ...F.defaults(), ...settings };
  const d = { ...B.data(over), ...(parts === null ? {} : { book_parts: parts }) };
  return E.build(F.modelOf(d, st), st, { year: 2026, bookId: B.BOOK_ID, now: B.NOW, alsoBy: B.ALSO_BY });
}

Deno.test("E17: every part on → docs in book order, epub:type per part, all well formed", () => {
  const b = withParts();
  const order = b.spine.map((d) => d.href);
  const want = ["title.xhtml", "copyright.xhtml", "dedication.xhtml", "epigraph.xhtml", "contents.xhtml", "foreword.xhtml", "preface.xhtml"];
  assertEquals(order.slice(0, 7), want);
  assertEquals(order.slice(-4), ["acknowledgments.xhtml", "about.xhtml", "review.xhtml", "also-by.xhtml"]);
  for (const [href, type] of [["dedication", "dedication"], ["epigraph", "epigraph"], ["foreword", "foreword"], ["preface", "preface"], ["acknowledgments", "acknowledgments"]]) {
    assertStringIncludes(file(b, `OEBPS/${href}.xhtml`), `<section epub:type="${type}"`, href);
  }
  for (const f of b.files.filter((x) => /\.(xhtml|opf|ncx)$/.test(x.name))) assertEquals(wellFormed(f.name, f.text), true, f.name);
  assertStringIncludes(file(b, "OEBPS/style.css"), "section.centered");
  for (const href of order) assertStringIncludes(file(b, "OEBPS/content.opf"), `href="${href}"`);
});

Deno.test("E17 Q-5: nav, NCX and contents list foreword, preface, acknowledgments, about only", () => {
  const b = withParts();
  const labels = b.nav.map((e) => e.label);
  assertEquals(labels.slice(0, 2), ["Foreword", "Preface"]);
  assertEquals(labels.slice(-2), ["Acknowledgments", "About the author"]);
  for (const no of ["Dedication", "Epigraph", "A short request", "Also by"]) assert(!labels.some((l) => l.startsWith(no)), no);
  const ncx = file(b, "OEBPS/toc.ncx"), navDoc = file(b, "OEBPS/nav.xhtml"), contents = file(b, "OEBPS/contents.xhtml");
  for (const doc of [ncx, navDoc, contents]) {
    for (const href of ["foreword.xhtml", "preface.xhtml", "acknowledgments.xhtml", "about.xhtml"]) assertStringIncludes(doc, `"${href}"`);
    for (const href of ["dedication.xhtml", "epigraph.xhtml", "review.xhtml", "also-by.xhtml"]) assertNotMatch(doc, new RegExp(`"${href}"`));
  }
});

Deno.test("E17: About from the part, Also by titles only, the review request words", () => {
  const b = withParts();
  assertStringIncludes(file(b, "OEBPS/about.xhtml"), "<h1>About the author</h1>");
  assertStringIncludes(file(b, "OEBPS/about.xhtml"), "She lives by the sea.");
  const also = file(b, "OEBPS/also-by.xhtml");
  assertStringIncludes(also, "<em>Chair Yoga for Seniors</em>");
  assertNotMatch(also, /Subtitle|also-sub/);
  const review = file(b, "OEBPS/review.xhtml");
  assertStringIncludes(review, "<h1>A short request</h1>");
  assertStringIncludes(review, "If this book helped you, please think about leaving an honest review on Amazon. A few words about what worked for you, or what did not, help other readers decide if this book is right for them.");
  assertStringIncludes(review, "Thank you for reading <em>");
  assertEquals((review.match(/<p class="bio">/g) || []).length, 3, "three separate paragraphs (p.bio: 0.75em above)");
  assertEquals(file(withParts([{ kind: "review_request" }]), "OEBPS/style.css"), file(build(ALL), "OEBPS/style.css"), "no review CSS");
});

Deno.test("E17: no book_parts → the old EPUB, byte for byte; book_parts [] → no About, no Also by", () => {
  const old = build(ALL);
  assertEquals(withParts(null).files, old.files);
  const none = withParts([]);
  assert(!none.files.some((f) => /about|also-by|dedication|review/.test(f.name)));
  assertNotMatch(file(none, "OEBPS/style.css"), /centered/);
  assertEquals(file(none, "OEBPS/style.css"), file(old, "OEBPS/style.css"));
});

Deno.test("E17 hostile text (C4): every part kind and every typed Also by title is escaped XHTML", () => {
  const b = withParts();
  for (const href of ["dedication", "epigraph", "foreword", "preface", "acknowledgments", "about"]) {
    const t = file(b, `OEBPS/${href}.xhtml`);
    assertStringIncludes(t, "&amp;", href);
    assertStringIncludes(t, "&lt;b&gt;not bold&lt;/b&gt;", href);
    assertNotMatch(t, /<b>/, href);
    assertStringIncludes(t, "# $ @ * _ &amp; &lt; &gt;", href);
  }
  const also = file(b, "OEBPS/also-by.xhtml");
  assertStringIncludes(also, "<em>Typed # $ @ * _ &amp; &lt; &gt;");
  assertStringIncludes(also, "<em>1. Looks like a list</em>");
  const hostile = withParts(PC.all(), ALL, { book: { title: `T ${PC.HOSTILE}`, pen_name: `P ${PC.HOSTILE}` } });
  for (const f of hostile.files.filter((x) => x.name.endsWith(".xhtml") || x.name.endsWith(".ncx"))) assertEquals(wellFormed(f.name, f.text), true, f.name);
  assertStringIncludes(file(hostile, "OEBPS/review.xhtml"), "<em>T # $ @ * _ &amp; &lt; &gt;");
});

Deno.test("E17: the 3 checks before download pass with every part on", () => {
  const b = withParts();
  const d = B.data();
  const list = C.checks(C.read(E.zip(b)), { expect: { title: d.book.title, subtitle: d.book.subtitle, author: d.book.pen_name, isbn: null }, wellFormed });
  assertEquals(C.ok(list), true, JSON.stringify(list));
});
