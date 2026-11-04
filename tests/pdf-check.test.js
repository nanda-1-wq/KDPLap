// deno test --allow-read tests/pdf-check.test.js   (from the repo root)
// 08 Format, E13.1: the PDF reader and the checks before a Print PDF
// download (js/format/pdf-check.js). Small PDFs are written here by hand:
// page boxes (own and inherited), the three page counts, simple, Type0,
// Type3 and not-embedded fonts, a compressed object stream, a cross-reference
// stream instead of a trailer, and strings that hold ">>" or "(".
// tests/browser/format/t-engine-real.mjs runs the reader on real Typst PDFs.
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/format/pdf-check.js";

const P = globalThis.kdpPdfCheck;
const enc = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** objs: { n: "<< … >>" | { dict, stream } } → PDF bytes with a classic trailer (or none). */
function pdf(objs, { root = 1, trailer = true } = {}) {
  let s = "%PDF-1.7\n";
  for (const [n, o] of Object.entries(objs)) {
    if (typeof o === "string") s += `${n} 0 obj\n${o}\nendobj\n`;
    else s += `${n} 0 obj\n${o.dict.replace("LEN", String(o.stream.length))}\nstream\n${o.stream}\nendstream\nendobj\n`;
  }
  if (trailer) s += `trailer\n<< /Size ${Object.keys(objs).length + 1} /Root ${root} 0 R >>\n%%EOF\n`;
  return enc(s);
}

const W = 432, H = 648;   // 6 x 9 in
const ttf = (n, name) => ({
  [n]: `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FontDescriptor ${n + 1} 0 R >>`,
  [n + 1]: `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontFile2 ${n + 2} 0 R >>`,
  [n + 2]: { dict: "<< /Length LEN >>", stream: "fontbytes" }
});
function book({ pages = 2, count = pages, box = `[0 0 ${W} ${H}]`, pageExtra = "", fonts = ttf(20, "ABCDEF+Serif-Regular") } = {}) {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objs = { 1: "<< /Type /Catalog /Pages 2 0 R >>", 2: `<< /Type /Pages /Kids [${kids}] /Count ${count} >>` };
  for (let i = 0; i < pages; i++) objs[3 + i] = `<< /Type /Page /Parent 2 0 R /MediaBox ${box}${i === 0 ? pageExtra : ""} /Resources << /Font << /F1 20 0 R >> >> >>`;
  return { ...objs, ...fonts };
}
const check = async (bytes, trim = "6x9", pages = 2) => P.checks(await P.read(bytes), { trim, pages });
const keyed = (list) => Object.fromEntries(list.map((c) => [c.key, c.pass]));

Deno.test("a good 6 x 9 PDF: every check passes", async () => {
  const info = await P.read(pdf(book()));
  assertEquals(info.version, "1.7");
  assertEquals(info.pageCount, { tree: 2, rootCount: 2, pageObjects: 2 });
  assertEquals(info.pages[0].mediaBox, [0, 0, W, H]);
  assertEquals(info.fonts, [{ name: "ABCDEF+Serif-Regular", subtype: "descriptor", embedded: true, file: "FontFile2" }]);
  const list = P.checks(info, { trim: "6x9", pages: 2 });
  assertEquals(keyed(list), { size: true, fonts: true, pages: true });
  assert(P.ok(list));
});

Deno.test("page size: a wrong size, a different trim, and another page box fail", async () => {
  assertEquals(keyed(await check(pdf(book({ box: "[0 0 612 792]" }))))["size"], false);
  assertEquals(keyed(await check(pdf(book()), "5x8"))["size"], false);
  assertEquals(keyed(await check(pdf(book({ box: "[0 0 360 576]" })), "5x8"))["size"], true);
  const crop = await check(pdf(book({ pageExtra: ` /CropBox [0 0 ${W} ${H}]` })));
  assertEquals(keyed(crop).size, false);
  assert(crop[0].detail.includes("other page boxes on pages 1"));
  assertEquals(keyed(await check(pdf(book({ pageExtra: ` /TrimBox [9 9 ${W - 9} ${H - 9}]` }))))["size"], false);
});

Deno.test("page boxes are inherited from the page tree", async () => {
  const objs = book();
  objs[2] = `<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 ${W} ${H}] >>`;
  objs[3] = "<< /Type /Page /Parent 2 0 R >>";
  objs[4] = "<< /Type /Page /Parent 2 0 R >>";
  const info = await P.read(pdf(objs));
  assertEquals(info.pages.map((p) => p.mediaBox), [[0, 0, W, H], [0, 0, W, H]]);
});

Deno.test("page count: odd, a different engine count, and counts that disagree fail", async () => {
  assertEquals(keyed(await check(pdf(book({ pages: 3 })), "6x9", 3)).pages, false);   // odd
  assertEquals(keyed(await check(pdf(book()), "6x9", 4)).pages, false);              // engine said 4
  assertEquals(keyed(await check(pdf(book({ count: 4 })), "6x9", 2)).pages, false);  // /Count says 4
  assertEquals(keyed(await check(pdf(book({ pages: 4 })), "6x9", 4)).pages, true);
});

Deno.test("fonts: Type0 with a FontFile2 descendant passes; Type3, base 14 and FontFile3 fail", async () => {
  const type0 = {
    20: "<< /Type /Font /Subtype /Type0 /BaseFont /X+Serif /DescendantFonts [21 0 R] >>",
    21: "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /X+Serif /FontDescriptor 22 0 R >>",
    22: "<< /Type /FontDescriptor /FontName /X+Serif /FontFile2 23 0 R >>",
    23: { dict: "<< /Length LEN >>", stream: "f" }
  };
  assertEquals(keyed(await check(pdf(book({ fonts: type0 })))).fonts, true);
  const t3 = { ...ttf(20, "A+Serif"), 30: "<< /Type /Font /Subtype /Type3 /Name /T3 /FontBBox [0 0 1 1] >>" };
  assertEquals(keyed(await check(pdf(book({ fonts: t3 })))).fonts, false);
  const base14 = { ...ttf(20, "A+Serif"), 30: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" };
  const b = await check(pdf(book({ fonts: base14 })));
  assertEquals(keyed(b).fonts, false);
  assert(b[1].detail.includes("Helvetica"));
  const cff = { 20: "<< /Type /Font /Subtype /Type1 /BaseFont /A+Sans /FontDescriptor 21 0 R >>", 21: "<< /Type /FontDescriptor /FontName /A+Sans /FontFile3 22 0 R >>", 22: { dict: "<< /Length LEN >>", stream: "f" } };
  assertEquals(keyed(await check(pdf(book({ fonts: cff })))).fonts, false);
  assertEquals(keyed(await check(pdf(book({ fonts: {} })))).fonts, false);   // no font at all
});

Deno.test("strings with '>>' and '(' inside a dictionary do not break the reader", async () => {
  const objs = book();
  objs[1] = "<< /Type /Catalog /Pages 2 0 R /Lang (en>>x\\)(y)) >>";
  const info = await P.read(pdf(objs));
  assertEquals(info.pageCount.tree, 2);
});

Deno.test("compressed object stream and a cross-reference stream (no trailer)", async () => {
  // The page tree and pages inside an /ObjStm, deflated; the root in an /XRef stream.
  const inner = [
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] >>`
  ];
  let head = "", body = "";
  [2, 3, 4].forEach((n, i) => { head += `${n} ${body.length} `; body += inner[i] + " "; });
  const plain = head + body;
  const z = new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const zs = String.fromCharCode(...z);
  const objs = { 1: "<< /Type /Catalog /Pages 2 0 R >>", 9: { dict: `<< /Type /ObjStm /N 3 /First ${head.length} /Filter /FlateDecode /Length LEN >>`, stream: zs }, ...ttf(20, "A+Serif"), 30: { dict: "<< /Type /XRef /Root 1 0 R /Length LEN >>", stream: "x" } };
  const bytes = pdf(objs, { trailer: false });
  const info = await P.read(bytes, { inflate: P.inflate });
  assertEquals(info.objectStreams, 1);
  assertEquals(info.pageCount, { tree: 2, rootCount: 2, pageObjects: 2 });
  assert(P.ok(P.checks(info, { trim: "6x9", pages: 2 })));
  let threw = false;
  try { await P.read(bytes); } catch { threw = true; }
  assert(threw, "an object stream needs inflate");
});
