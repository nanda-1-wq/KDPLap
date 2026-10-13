// deno test tests/markdown-lite.test.js   (from the repo root)
// The section text format (js/markdown-lite.js). Deno has no DOM, so fromDom
// runs on small fake nodes with the same fields the code reads (nodeType,
// nodeName, nodeValue, childNodes). The browser suite (tests/browser/write)
// runs it on the real editor.
import { assertEquals } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";

const M = globalThis.kdpMarkdown;
const t = (text) => ({ nodeType: 3, nodeName: "#text", nodeValue: text, childNodes: [] });
const el = (tag, ...children) => ({ nodeType: 1, nodeName: tag.toUpperCase(), childNodes: children.map((c) => (typeof c === "string" ? t(c) : c)) });
const root = (...children) => el("div", ...children);

// A real-length section (design 22, 4.2 Shoulder rolls).
const SECTION = [
  "## Shoulder rolls, both ways",
  "",
  "Shoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.",
  "",
  "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level.",
  "",
  "- Sit near the front of your chair",
  "- Keep both feet flat on the floor",
  "",
  "1. Breathe in as you lift",
  "2. Breathe out as you roll back",
].join("\n");

Deno.test("toHtml: headings, paragraphs, lists, bold and italic", () => {
  assertEquals(M.toHtml(SECTION),
    "<h2>Shoulder rolls, both ways</h2>" +
    "<p>Shoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.</p>" +
    "<p>Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this <strong>five times</strong>. Keep your neck long and your <em>chin</em> level.</p>" +
    "<ul><li>Sit near the front of your chair</li><li>Keep both feet flat on the floor</li></ul>" +
    "<ol><li>Breathe in as you lift</li><li>Breathe out as you roll back</li></ol>");
});

Deno.test("toHtml: everything is escaped, so stored text cannot add markup", () => {
  assertEquals(M.toHtml('<script>alert(1)</script> & "quotes" <img src=x onerror=alert(1)>'),
    "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot; &lt;img src=x onerror=alert(1)&gt;</p>");
  assertEquals(M.toHtml("**<b>x</b>**"), "<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>");
});

Deno.test("toHtml: other heading levels show as H2, soft line breaks, bold inside italic", () => {
  assertEquals(M.toHtml("# One\n\n### Three"), "<h2>One</h2><h2>Three</h2>");
  assertEquals(M.toHtml("Line one\nline two"), "<p>Line one<br>line two</p>");
  assertEquals(M.toHtml("*a **b** c*"), "<p><em>a <strong>b</strong> c</em></p>");
  assertEquals(M.toHtml("***both***"), "<p><em><strong>both</strong></em></p>");
  assertEquals(M.toHtml("2 * 3 = 6 and 5 \\* 4"), "<p>2 * 3 = 6 and 5 * 4</p>");
});

Deno.test("fromDom: the editor's markup becomes the Markdown subset", () => {
  const dom = root(
    el("h2", "Shoulder rolls, both ways"),
    el("p", "Shoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%."),
    el("p", "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this ", el("strong", "five times"), ". Keep your neck long and your ", el("em", "chin"), " level."),
    el("ul", el("li", "Sit near the front of your chair"), el("li", "Keep both feet flat on the floor")),
    el("ol", el("li", "Breathe in as you lift"), el("li", "Breathe out as you roll back")),
  );
  assertEquals(M.fromDom(dom), SECTION);
});

Deno.test("round trip: Markdown → HTML → Markdown keeps the text", () => {
  // A tiny HTML reader for our own toHtml output (tags and text only).
  const read = (html) => {
    const top = root();
    const stack = [top];
    for (const m of html.matchAll(/<(\/?)(\w+)>|([^<]+)/g)) {
      const cur = stack[stack.length - 1];
      if (m[3]) cur.childNodes.push(t(m[3].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")));
      else if (m[1]) stack.pop();
      else if (m[2] === "br") cur.childNodes.push(el("br"));
      else { const n = el(m[2]); cur.childNodes.push(n); stack.push(n); }
    }
    return top;
  };
  for (const md of [SECTION, "Plain text only.", "*a **b** c*", "5 \\* 4 is 20", "\\- not a list\n\n1\\. not numbered", "Line one\nline two"]) {
    assertEquals(M.fromDom(read(M.toHtml(md))), md, md);
  }
});

Deno.test("fromDom: pasted or unknown markup is read as text only", () => {
  const dom = root(
    el("p", el("span", "Keep "), el("u", "this"), " ", el("a", "link text"), el("script", "alert(1)"), el("font", " words")),
    el("style", "p { color: red }"),
    el("img"),
    el("table", el("tr", el("td", "Cell"))),
  );
  assertEquals(M.fromDom(dom), "Keep this link text words\n\nCell");
});

Deno.test("fromDom: browser quirks (div lines, br, NBSP, empty bold, edge spaces, nested lists)", () => {
  assertEquals(M.fromDom(root("First line", el("div", "Second line"), el("div", el("br")))), "First line\n\nSecond line");
  assertEquals(M.fromDom(root(el("p", "Soft", el("br"), "break"))), "Soft\nbreak");
  assertEquals(M.fromDom(root(el("p", "No break space"))), "No break space");
  assertEquals(M.fromDom(root(el("p", "Empty ", el("b", " "), "bold"))), "Empty bold");
  assertEquals(M.fromDom(root(el("p", "Do", el("strong", " five times "), "now"))), "Do **five times** now");
  assertEquals(M.fromDom(root(el("p", el("b", "Bold ", el("i", "and italic"))))), "**Bold *and italic***");
  assertEquals(M.fromDom(root(el("ul", el("li", "One", el("ul", el("li", "Inner"))), el("li", "Two")))), "- One\n- Inner\n- Two");
  assertEquals(M.fromDom(root(el("h3", "Small ", el("b", "heading")))), "## Small **heading**");
  assertEquals(M.fromDom(root(el("p", "2 * 3 = 6"))), "2 \\* 3 = 6");
});

Deno.test("fromDom: a paragraph that looks like a list or heading stays a paragraph", () => {
  const md = M.fromDom(root(el("p", "- not a list"), el("p", "## not a heading"), el("p", "1. not numbered")));
  assertEquals(md, "\\- not a list\n\n\\## not a heading\n\n1\\. not numbered");
  assertEquals(M.toHtml(md), "<p>- not a list</p><p>## not a heading</p><p>1. not numbered</p>");
  assertEquals(M.parse(md).map((b) => b.type), ["p", "p", "p"]);
});

Deno.test("toPlain and normalize", () => {
  assertEquals(M.toPlain("## Title\n\nDo **this** *now*.\n\n- One\n- Two\n\n5 \\* 4"), "Title\n\nDo this now.\n\nOne\nTwo\n\n5 * 4");
  assertEquals(M.normalize("  A  \r\n\r\n\r\n\r\nB c  "), "A\n\nB c");
});

/* ── The source flag (E10.2) ── */

const FLAGGED = "Shoulder rolls ease it. Studies show shoulder rolls cut neck pain by 40%. [Verify: no source]";
const pillOf = () => ({ nodeType: 1, nodeName: "SPAN", getAttribute: (k) => (k === "data-flag" ? "1" : null), childNodes: [el("svg"), t("Verify: no source")] });

Deno.test("flag: a pill (not editable) and the sentence before it underlined", () => {
  const html = M.toHtml(FLAGGED);
  assertEquals(html.replace(/<svg[\s\S]*?<\/svg>/, "<svg/>"),
    '<p>Shoulder rolls ease it. <span class="md-unsourced">Studies show shoulder rolls cut neck pain by 40%.</span> ' +
    '<span class="md-flag" contenteditable="false" data-flag="1"><svg/>Verify: no source</span></p>');
  // A sentence with markup of its own: the pill only, so the tags nest.
  assertEquals(M.toHtml("It is **40%** less. [Verify: no source]").includes("md-unsourced"), false);
  // Two flags in one paragraph: each its own sentence.
  assertEquals((M.toHtml("A 5. [Verify: no source] B 6. [Verify: no source]").match(/md-unsourced">([^<]*)</g) || []).length, 2);
});

Deno.test("flag: read back from the editor; deleting the pill deletes the flag", () => {
  const kept = root(el("p", t("Shoulder rolls ease it. "), el("span", "Studies show shoulder rolls cut neck pain by 40%."), t(" "), pillOf()));
  assertEquals(M.fromDom(kept), FLAGGED);
  const removed = root(el("p", t("Shoulder rolls ease it. "), el("span", "Studies show shoulder rolls cut neck pain by 40%.")));
  assertEquals(M.fromDom(removed), "Shoulder rolls ease it. Studies show shoulder rolls cut neck pain by 40%.");
  // A pasted element that only looks like a pill (no data-flag) is plain text.
  assertEquals(M.fromDom(root(el("p", el("span", "Verify: no source")))), "Verify: no source");
});

Deno.test("flag: escaped like any text; never a way in for markup", () => {
  assertEquals(M.toHtml("<b>5</b>. [Verify: no source]").includes("&lt;b&gt;5&lt;/b&gt;."), true);
  assertEquals(M.toHtml("<b>5</b>. [Verify: no source]").includes("<b>"), false);
});

/* ── fromDomMap (E10.3, the Improve menu) ── */

/** Our own toHtml output as fake nodes, with the pill (data-flag) and parent links. */
const readHtml = (html) => {
  const top = root();
  const stack = [top];
  for (const m of html.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const cur = stack[stack.length - 1];
    if (m[5]) { cur.childNodes.push(t(m[5].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"))); continue; }
    if (m[1]) { stack.pop(); continue; }
    const n = el(m[2]);
    if (/data-flag="1"/.test(m[3])) n.getAttribute = (k) => (k === "data-flag" ? "1" : null);
    cur.childNodes.push(n);
    if (m[2] !== "br" && !m[4]) stack.push(n);
  }
  return link(top);
};
const link = (n, parent = null) => { n.parentNode = parent; for (const k of n.childNodes) link(k, n); return n; };
const textNodes = (n, out = []) => { if (n.nodeType === 3) out.push(n); else n.childNodes.forEach((k) => textNodes(k, out)); return out; };

const MAPPED = [
  SECTION,
  FLAGGED,
  "Plain text only.",
  "*a **b** c*",
  "5 \\* 4 is 20",
  "\\- not a list\n\n1\\. not numbered",
  "Line one\nline two",
  "## Shoulder rolls\n\nDo this **five times**. Studies show rolls cut pain by 40%. [Verify: no source] Then rest.\n\n- Sit tall\n- Breathe out. [Verify: no source]",
];

Deno.test("fromDomMap: the same Markdown as fromDom, for every tree here", () => {
  const trees = [
    ...MAPPED.map((md) => readHtml(M.toHtml(md))),
    link(root(el("p", el("span", "Keep "), el("u", "this"), " ", el("a", "link text"), el("script", "alert(1)"), el("font", " words")), el("style", "p { color: red }"), el("img"), el("table", el("tr", el("td", "Cell"))))),
    link(root("First line", el("div", "Second line"), el("div", el("br")))),
    link(root(el("p", "Soft", el("br"), "break"))),
    link(root(el("p", "No break space"))),
    link(root(el("p", "Tabs\tand\n\nnew lines"))),
    link(root(el("p", "Empty ", el("b", " "), "bold"))),
    link(root(el("p", "Do", el("strong", " five times "), "now"))),
    link(root(el("p", el("b", "Bold ", el("i", "and italic"))))),
    link(root(el("ul", el("li", "One", el("ul", el("li", "Inner"))), el("li", "Two"), " loose ", el("ol", el("li", "Deep"))))),
    link(root(el("h3", "Small ", el("b", "heading")))),
    link(root(el("p", "2 * 3 = 6"), el("p", "- not a list"), el("p", "## not a heading"), el("p", "1. not numbered"))),
    link(root(el("p", t("Shoulder rolls ease it. "), el("span", "Studies show shoulder rolls cut neck pain by 40%."), t(" "), pillOf()))),
    link(root(el("p", "  "), el("p", "Only this.  "), el("div", el("p", "Nested "), "tail"))),
    link(root()),
  ];
  for (const tree of trees) assertEquals(M.fromDomMap(tree).md, M.fromDom(tree));
});

Deno.test("fromDomMap: DOM → Markdown offsets land on the same character, and back", () => {
  for (const md of MAPPED) {
    const tree = readHtml(M.toHtml(md));
    const map = M.fromDomMap(tree);
    assertEquals(map.md, md);
    // The pill's own text is one unit (its edges are checked below).
    const inPill = (n) => { for (let x = n.parentNode; x; x = x.parentNode) if (x.getAttribute) return true; return false; };
    for (const n of textNodes(tree).filter((x) => !inPill(x))) {
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        const at = map.mdOffset(n, i);
        const want = v[i] === "*" ? "\\" : v[i];
        assertEquals(map.md[at], want, `${JSON.stringify(md)} @ ${JSON.stringify(v)}[${i}]`);
        const back = map.domPoint(at, "start");
        assertEquals(back.node.nodeValue[back.offset], v[i]);
        const end = map.domPoint(at + (v[i] === "*" ? 2 : 1), "end");
        assertEquals(end.node === n && end.offset === i + 1, true, `end of ${JSON.stringify(v)}[${i}]`);
      }
    }
  }
});

Deno.test("fromDomMap: element boundaries, the pill, the text edges", () => {
  const tree = readHtml(M.toHtml(FLAGGED));
  const map = M.fromDomMap(tree);
  const p = tree.childNodes[0];
  const pill = p.childNodes.find((k) => k.getAttribute);
  const iPill = p.childNodes.indexOf(pill);
  // Before the pill: the flag's first character; after it: the end.
  assertEquals(map.mdOffset(p, iPill), FLAGGED.length - M.FLAG.length);
  assertEquals(map.mdOffset(p, iPill + 1), FLAGGED.length);
  assertEquals(map.mdOffset(tree, 0), 0);
  assertEquals(map.mdOffset(tree, tree.childNodes.length), FLAGGED.length);
  // The flag as a passage end: just after the pill.
  assertEquals(map.domPoint(FLAGGED.length, "end"), { node: p, offset: iPill + 1 });
  assertEquals(map.domPoint(FLAGGED.length - M.FLAG.length, "start"), { node: p, offset: iPill });
  // Markers we add ("## ", "- ") map to the text after them.
  const sec = M.fromDomMap(readHtml(M.toHtml(SECTION)));
  const at = SECTION.indexOf("- Sit near");
  assertEquals(sec.domPoint(at, "start").node.nodeValue, "Sit near the front of your chair");
  assertEquals(sec.domPoint(0, "start").node.nodeValue, "Shoulder rolls, both ways");
});

Deno.test("round trip of Improve outputs is stable (toHtml → DOM → Markdown)", () => {
  const outputs = [
    "Now lift your shoulders up toward your ears, then roll them back and down. Do this five times, then rest.",
    "Most people feel looser within a week. [Verify: no source] Ruth likes to pair this with slow breathing.",
    "## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness. **Do this five times.**\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor",
    "1. Breathe in as you lift\n2. Breathe out as you roll back. [Verify: no source]",
    "A cost of $15.50 a week, or 2 \\* 3 sessions.",
  ];
  for (const md of outputs) {
    const tree = readHtml(M.toHtml(md));
    assertEquals(M.fromDom(tree), md);
    assertEquals(M.fromDomMap(tree).md, md);
  }
});
