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

/* ── E15: the cover checks (inspect, coverChecks), plan §1b and Q-a ── */

const PT = 72;
/**
 * A one-page cover as Typst 0.14.2 writes it (owner Q-a, option 2): one
 * [/ICCBased] sRGB color space (objects 36 and 37, /N 3), named /c0 in the
 * resources, set with cs / sc. Content stream (plain or Flate), resources,
 * extra objects, catalog and trailer extras. srgb: false leaves the ICC out.
 */
const SRGB = { 36: "[/ICCBased 37 0 R]", 37: { dict: "<< /Length LEN /N 3 >>", stream: "icc-srgb" } };
const SRGB_RES = " /ColorSpace << /c0 36 0 R >>";
async function cover({ w = 12.3716, h = 9.25, content = "/c0 cs 0.12 0.23 0.37 sc 0 0 10 10 re f BT /F1 12 Tf <0012> Tj ET", flate = false,
  res = "", pageExtra = "", extra = {}, catalogExtra = "", trailerExtra = "", pages = 1, fonts = ttf(20, "ABCDEF+SourceSerif4-Bold"), srgb = true } = {}) {
  if (srgb) { extra = { ...SRGB, ...extra }; res = SRGB_RES + res; }
  let stream = content;
  let filter = "";
  if (flate) {
    const z = new Uint8Array(await new Response(new Blob([enc(content)]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    stream = String.fromCharCode(...z);
    filter = " /Filter /FlateDecode";
  }
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ");
  const objs = { 1: `<< /Type /Catalog /Pages 2 0 R${catalogExtra} >>`, 2: `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>` };
  for (let i = 0; i < pages; i++) {
    objs[3 + i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w * PT} ${h * PT}]${pageExtra} /Contents 10 0 R /Resources << /Font << /F1 20 0 R >>${res} >> >>`;
  }
  objs[10] = { dict: `<< /Length LEN${filter} >>`, stream };
  let s = "%PDF-1.7\n";
  for (const [n, o] of Object.entries({ ...objs, ...fonts, ...extra })) {
    if (typeof o === "string") s += `${n} 0 obj\n${o}\nendobj\n`;
    else s += `${n} 0 obj\n${o.dict.replace("LEN", String(o.stream.length))}\nstream\n${o.stream}\nendstream\nendobj\n`;
  }
  s += `trailer\n<< /Size 40 /Root 1 0 R${trailerExtra} >>\n%%EOF\n`;
  return enc(s);
}
const coverKeyed = async (bytes, size = { widthIn: 12.3716, heightIn: 9.25 }) => {
  const list = P.coverChecks(await P.read(bytes), await P.inspect(bytes), size);
  return { list, k: keyed(list) };
};
const ALL = { size: true, pages: true, fonts: true, color: true, profile: true, transparency: true, security: true };

Deno.test("cover: a Typst-shaped sRGB cover passes every check (plain and Flate content)", async () => {
  for (const flate of [false, true]) {
    const { k, list } = await coverKeyed(await cover({ flate }));
    assertEquals(k, ALL, JSON.stringify(list));
    const deep = await P.inspect(await cover({ flate }));
    assertEquals(deep.colorSpaces, ["ICCBased"]);
    assertEquals(deep.profiles, [{ obj: 37, n: 3 }]);
    assertEquals(deep.contentStreams, 1);
    assertEquals(deep.ops.rg, 0);
  }
  const { list } = await coverKeyed(await cover());
  assertEquals(list[0].detail, "12.372 x 9.25 in");
  assertEquals(list.find((c) => c.key === "color").detail, "ICC sRGB (N 3)");
  assertEquals(list.find((c) => c.key === "profile").detail, "1 ICC (ICC sRGB (N 3))");
  // The JPEG passed through on the same sRGB object (case B of the spike).
  const withImg = { res: " /XObject << /Im0 30 0 R >>", content: "/c0 cs 0.1 0.2 0.3 sc q 100 0 0 100 0 0 cm /Im0 Do Q",
    extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 1838 /Height 2775 /ColorSpace 36 0 R /BitsPerComponent 8 /Filter /DCTDecode /Length LEN >>", stream: "jpegbytes" } } };
  const img = await coverKeyed(await cover(withImg));
  assertEquals(img.k, ALL, JSON.stringify(img.list));
  // E15 plan §19: the picture uses the cover's one profile (the reference is followed one step: 36 → [/ICCBased 37 0 R]).
  const deep = await P.inspect(await cover(withImg));
  assertEquals([deep.images[0].colorSpace, deep.images[0].profile, deep.profiles], ["36 0 R", 37, [{ obj: 37, n: 3 }]]);
  // An inline array names the profile itself.
  const inline = await P.inspect(await cover({ ...withImg, extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace [/ICCBased 37 0 R] /BitsPerComponent 8 /Filter /DCTDecode /Length LEN >>", stream: "jpegbytes" } } }));
  assertEquals(inline.images[0].profile, 37);
});

Deno.test("cover: DeviceRGB alone, or no color at all, fails the one-space rule (option 2)", async () => {
  const rgb = await coverKeyed(await cover({ srgb: false, content: "0.12 0.23 0.37 rg 0 0 10 10 re f" }));
  assertEquals([rgb.k.color, rgb.k.profile], [false, false]);
  assertEquals(rgb.list.find((c) => c.key === "color").detail, "DeviceRGB");
  assertEquals(rgb.list.find((c) => c.key === "profile").detail, "no ICC profile");
  // sRGB plus a DeviceRGB operator: two spaces.
  const mix = await coverKeyed(await cover({ content: "/c0 cs 0.1 0.2 0.3 sc 0.12 0.23 0.37 rg" }));
  assertEquals([mix.k.color, mix.k.profile], [false, true]);
  assertEquals(mix.list.find((c) => c.key === "color").detail, "DeviceRGB, ICC sRGB (N 3)");
  assertEquals((await coverKeyed(await cover({ srgb: false, content: "0 0 10 10 re f" }))).k.color, false);
});

Deno.test("cover: the size to 0.001 in, one page, no other page box", async () => {
  assertEquals((await coverKeyed(await cover({ w: 12.3716 + 0.0009 }))).k.size, true);
  assertEquals((await coverKeyed(await cover({ w: 12.3716 + 0.002 }))).k.size, false);
  assertEquals((await coverKeyed(await cover({ h: 9 }))).k.size, false);
  assertEquals((await coverKeyed(await cover({ pageExtra: " /TrimBox [9 9 100 100]" }))).k.size, false);
  assertEquals((await coverKeyed(await cover({ pageExtra: " /BleedBox [0 0 100 100]" }))).k.size, false);
  const two = await coverKeyed(await cover({ pages: 2 }));
  assertEquals([two.k.pages, two.k.size], [false, false]);
});

Deno.test("cover: gray and CMYK operators, ICC gray, ICC CMYK, a second profile, a CMYK image, OutputIntents each fail", async () => {
  const gray = await coverKeyed(await cover({ content: "0.5 g 0 0 10 10 re f /c0 cs 0.1 0.2 0.3 sc" }));
  assertEquals(gray.k.color, false);
  assertEquals(gray.list.find((c) => c.key === "color").detail, "DeviceGray, ICC sRGB (N 3)");
  assertEquals((await coverKeyed(await cover({ content: "0 0 0 1 k 0 0 10 10 re f /c0 cs 1 0 0 sc" }))).k.color, false);
  assertEquals((await coverKeyed(await cover({ content: "0 0 0 1 K /c0 cs 1 0 0 sc" }))).k.color, false);
  // An ICC gray (luma(), spike F) or an ICC CMYK (a raw CMYK JPEG, spike D) next to sRGB: two profiles.
  for (const [n, kind] of [[1, "gray"], [4, "CMYK"]]) {
    const two = await coverKeyed(await cover({ res: " /ColorSpace << /c1 30 0 R >>", content: "/c0 cs 0.1 0.2 0.3 sc /c1 cs 0.5 sc",
      extra: { 30: "[/ICCBased 31 0 R]", 31: { dict: `<< /Length LEN /N ${n} >>`, stream: "icc" } } }));
    assertEquals([two.k.color, two.k.profile], [false, false], kind);
    assertEquals(two.list.find((c) => c.key === "profile").detail, `2 ICC (ICC ${kind} (N ${n}), ICC sRGB (N 3))`);   // listed by object number
  }
  // Only an ICC CMYK or only an ICC gray: one profile, but not sRGB.
  for (const n of [1, 4]) {
    const one = await coverKeyed(await cover({ srgb: false, res: " /ColorSpace << /c0 30 0 R >>", content: "/c0 cs 0.5 sc",
      extra: { 30: "[/ICCBased 31 0 R]", 31: { dict: `<< /Length LEN /N ${n} >>`, stream: "icc" } } }));
    assertEquals([one.k.color, one.k.profile], [false, false], `N ${n}`);
  }
  // A picture that brings its own profile (a JPEG's ICC kept as a second /ICCBased): its profile is not the cover's, and the profile check fails.
  const own = await P.inspect(await cover({ res: " /XObject << /Im0 30 0 R >>", content: "/c0 cs 0.1 0.2 0.3 sc q 100 0 0 100 0 0 cm /Im0 Do Q",
    extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace 32 0 R /BitsPerComponent 8 /Filter /DCTDecode /Length LEN >>", stream: "jpegbytes" },
             32: "[/ICCBased 33 0 R]", 33: { dict: "<< /Length LEN /N 3 >>", stream: "icc-own" } } }));
  assertEquals([own.images[0].profile, own.profiles.map((p) => p.obj)], [33, [33, 37]]);
  // A second sRGB profile is still a second profile.
  const second = await coverKeyed(await cover({ res: " /ColorSpace << /c1 30 0 R >>", content: "/c0 cs 0.1 0.2 0.3 sc /c1 cs 1 0 0 sc",
    extra: { 30: "[/ICCBased 31 0 R]", 31: { dict: "<< /Length LEN /N 3 >>", stream: "icc2" } } }));
  assertEquals([second.k.color, second.k.profile], [false, false]);
  const img = await coverKeyed(await cover({ res: " /XObject << /Im0 30 0 R >>", content: "q 100 0 0 100 0 0 cm /Im0 Do Q /c0 cs 0.1 0.2 0.3 sc",
    extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode /Length LEN >>", stream: "jpegbytes" } } }));
  assertEquals(img.k.color, false);
  const deep = await P.inspect(await cover({ res: " /XObject << /Im0 30 0 R >>",
    extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 1838 /Height 2775 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length LEN >>", stream: "jpegbytes" } } }));
  assertEquals(deep.images.map((i) => [i.width, i.height, i.colorSpace, i.filter, i.bytes, i.profile]), [[1838, 2775, "/DeviceRGB", "/DCTDecode", 9, null]]);
  assertEquals(deep.colorSpaces, ["DeviceRGB", "ICCBased"]);
  const oi = await coverKeyed(await cover({ catalogExtra: " /OutputIntents [30 0 R]", extra: { 30: "<< /Type /OutputIntent /S /GTS_PDFX >>" } }));
  assertEquals([oi.k.color, oi.k.profile], [true, false]);
});

Deno.test("cover: a soft mask, a transparency group and alpha below 1 fail; alpha 1 passes", async () => {
  const sm = await coverKeyed(await cover({ res: " /XObject << /Im0 30 0 R >>",
    extra: { 30: { dict: "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace 36 0 R /SMask 31 0 R /Length LEN >>", stream: "x" },
             31: { dict: "<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /Length LEN >>", stream: "y" } } }));
  assertEquals([sm.k.transparency, sm.k.color], [false, false]);   // the SMask is DeviceGray too (spike E)
  assertEquals((await coverKeyed(await cover({ pageExtra: " /Group << /S /Transparency /CS 36 0 R >>" }))).k.transparency, false);
  const a = await coverKeyed(await cover({ res: " /ExtGState << /G0 30 0 R >>", content: "/G0 gs /c0 cs 0.1 0.2 0.3 sc", extra: { 30: "<< /Type /ExtGState /ca 0.72 >>" } }));
  assertEquals(a.k.transparency, false);
  assertEquals((await coverKeyed(await cover({ res: " /ExtGState << /G0 30 0 R >>", extra: { 30: "<< /Type /ExtGState /ca 1 /CA 1 >>" } }))).k.transparency, true);
});

Deno.test("cover: encryption fails; fonts as the 08 rule", async () => {
  assertEquals((await coverKeyed(await cover({ trailerExtra: " /Encrypt 30 0 R", extra: { 30: "<< /Filter /Standard >>" } }))).k.security, false);
  const base14 = { 20: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" };
  assertEquals((await coverKeyed(await cover({ fonts: base14 }))).k.fonts, false);
});

Deno.test("cover: operators inside text strings are not colors", async () => {
  const ops = P.contentOps("BT (0 0 0 1 k and 0.5 g) Tj <30302e3520672030> Tj ET 0.1 0.2 0.3 rg");
  assertEquals(ops.ops, { rg: 1, RG: 0, g: 0, G: 0, k: 0, K: 0 });
  assertEquals(P.contentOps("/CS0 cs 1 sc /G1 gs").named, ["CS0"]);
});
