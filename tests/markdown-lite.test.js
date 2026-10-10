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
