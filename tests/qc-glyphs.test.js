// deno test --allow-read tests/qc-glyphs.test.js   (from the repo root)
// 07 Quality Control, E14.2: the table of characters per 08 style (js/qc-glyphs.js,
// made by tools/qc-glyphs.mjs). Range lookup and the characters every book
// needs. tests/browser/format/t-engine-real.mjs reads the real fonts; to compare
// the table with them: deno run --allow-read --allow-write --allow-net tools/qc-glyphs.mjs --check
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/format/files.js";
import "../js/format/font-cmap.js";
import "../js/format-rules.js";
import "../js/qc-glyphs.js";

const G = globalThis.kdpQcGlyphs;
const cps = (s) => [...s].map((c) => c.codePointAt(0));

Deno.test("the styles are the 08 styles, each with a font name", () => {
  assertEquals(G.STYLES, globalThis.kdpFormatRules.STYLES);
  assertEquals(Object.keys(globalThis.kdpFormatFiles.STYLE_FAMILIES), G.STYLES);
  for (const s of G.STYLES) assert(G.FONT[s], s);
  assertEquals(G.FONT.classic, "EB Garamond");
});

Deno.test("ASCII, curly quotes, dashes, ellipsis and what Typst adds are in every style", () => {
  const needed = [];
  for (let cp = 0x20; cp < 0x7F; cp++) needed.push(cp);
  needed.push(...cps("‘’“”–—…©®™é"), ...cps(globalThis.kdpFontCmap.TYPST_ADDS));
  for (const s of G.STYLES) for (const cp of needed) assert(G.has(s, cp), `${s} U+${cp.toString(16)}`);
});

Deno.test("CJK, emoji and a private use character are in no style", () => {
  for (const s of G.STYLES) for (const cp of [...cps("語ヨ한😀"), 0xE000, 0x10FFFF]) assertEquals(G.has(s, cp), false, `${s} U+${cp.toString(16)}`);
});

Deno.test("range lookup: the first and last code points, an edge on each side of a range", () => {
  for (const s of G.STYLES) {
    assertEquals(G.has(s, 0x1F), false, s);
    assertEquals(G.has(s, 0x20), true, s);
    assertEquals(G.has(s, 0x7E), true, s);
    assertEquals(G.has(s, -1), false, s);
    assertEquals(G.has(s, 0x110000), false, s);
    let last = false, edges = 0;
    for (let cp = 0; cp < 0x3000; cp++) { const h = G.has(s, cp); if (h !== last) edges++; last = h; }
    assert(edges >= 4, `${s}: ${edges} edges`);
  }
});

Deno.test("a style the table does not know reads as classic; the file stays small", () => {
  assertEquals(G.has("nope", 0x20), true);
  assertEquals(G.has("nope", 0x8A9E), false);
  const size = Deno.statSync(new URL("../js/qc-glyphs.js", import.meta.url)).size;
  assert(size < 15 * 1024, `${size} bytes`);
});
