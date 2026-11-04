// deno test --allow-read tests/font-cmap.test.js   (from the repo root)
// 08 Format, E13.1: which characters a font has (js/format/font-cmap.js).
// Small TrueType files built here byte by byte: a format 4 cmap (with an
// idDelta segment and an idRangeOffset segment) and a format 12 cmap (an
// emoji above U+FFFF), then collect() and missing() on an export model.
// tests/browser/format/t-engine-real.mjs runs the same reader on the five
// real font families.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import "../js/markdown-lite.js";
import "../js/word-budget.js";
import "../js/sentences.js";
import "../js/text-checks.js";
import "../js/export-rules.js";
import "../js/format/font-cmap.js";

const C = globalThis.kdpFontCmap;
const R = globalThis.kdpExportRules;

/** Big-endian writer. */
function bytes(parts) {
  const out = [];
  for (const [size, v] of parts) {
    if (size === 2) out.push((v >> 8) & 255, v & 255);
    else if (size === 4) out.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
    else out.push(...v);   // raw bytes
  }
  return out;
}

/** A font file with one table, "cmap", holding the given subtables [{ platform, encoding, data }]. */
function font(subs, extraTables = []) {
  let cmap = bytes([[2, 0], [2, subs.length]]);
  let at = 4 + subs.length * 8;
  const records = [];
  for (const s of subs) { records.push(...bytes([[2, s.platform], [2, s.encoding], [4, at]])); at += s.data.length; }
  cmap = [...cmap, ...records, ...subs.flatMap((s) => s.data)];
  const tables = [...extraTables, { tag: "cmap", data: cmap }];
  const head = bytes([[4, 0x00010000], [2, tables.length], [2, 0], [2, 0], [2, 0]]);
  let off = 12 + tables.length * 16;
  const dir = [];
  for (const t of tables) {
    dir.push(...[...t.tag].map((c) => c.charCodeAt(0)), ...bytes([[4, 0], [4, off], [4, t.data.length]]));
    off += t.data.length;
  }
  return new Uint8Array([...head, ...dir, ...tables.flatMap((t) => t.data)]);
}

/** Format 4: segments [start, end, delta, glyphs | null]; the last must be 0xFFFF. */
function format4(segs) {
  const n = segs.length;
  const glyphArrays = [];
  const ends = [], starts = [], deltas = [], ranges = [];
  // idRangeOffset is from its own slot to the glyph in glyphIdArray (after the ranges array).
  let glyphAt = 0;
  segs.forEach(([start, end, delta, glyphs], i) => {
    ends.push(end); starts.push(start); deltas.push(delta & 0xFFFF);
    if (glyphs) {
      ranges.push((n - i) * 2 + glyphAt * 2);
      glyphArrays.push(...glyphs);
      glyphAt += glyphs.length;
    } else ranges.push(0);
  });
  const body = [
    [2, 4], [2, 0], [2, 0], [2, n * 2], [2, 0], [2, 0], [2, 0],
    ...ends.map((x) => [2, x]), [2, 0], ...starts.map((x) => [2, x]), ...deltas.map((x) => [2, x]),
    ...ranges.map((x) => [2, x]), ...glyphArrays.map((x) => [2, x])
  ];
  const data = bytes(body);
  data[2] = (data.length >> 8) & 255;
  data[3] = data.length & 255;
  return data;
}

function format12(groups) {
  return bytes([[2, 12], [2, 0], [4, 16 + groups.length * 12], [4, 0], [4, groups.length], ...groups.flatMap(([a, b, g]) => [[4, a], [4, b], [4, g]])]);
}

// A–Z by idDelta (glyphs 1 to 26); "é" (U+00E9) and "ê" by idRangeOffset, "ê" maps to glyph 0 (missing).
const F4 = font([{ platform: 3, encoding: 1, data: format4([[0x41, 0x5A, -0x40, null], [0xE9, 0xEA, 0, [30, 0]], [0xFFFF, 0xFFFF, 1, null]]) }]);
// "a" to "z" and the grinning face U+1F600.
const F12 = font([
  { platform: 1, encoding: 0, data: bytes([[2, 0], [2, 262], [2, 0], [0, new Array(256).fill(0)]]) },   // a Mac table, ignored
  { platform: 3, encoding: 10, data: format12([[0x61, 0x7A, 1], [0x1F600, 0x1F600, 40]]) }
]);

Deno.test("format 4: idDelta and idRangeOffset segments", () => {
  const c = C.parse(F4);
  assertEquals(c.format, 4);
  assert(c.has(0x41) && c.has(0x5A) && c.has("M".codePointAt(0)));
  assert(!c.has(0x40) && !c.has(0x5B) && !c.has(0x61));
  assert(c.has(0xE9), "é by the glyph array");
  assert(!c.has(0xEA), "ê maps to glyph 0: missing");
  assert(!c.has(0x1F600), "format 4 has nothing above U+FFFF");
});

Deno.test("format 12 is preferred; supplementary planes; the Mac table is ignored", () => {
  const c = C.parse(F12);
  assertEquals(c.format, 12);
  assert(c.has(0x61) && c.has(0x7A) && c.has(0x1F600));
  assert(!c.has(0x41) && !c.has(0x1F601) && !c.has(0x60));
});

Deno.test("format 12 wins over format 4 in the same font", () => {
  const both = font([
    { platform: 3, encoding: 1, data: format4([[0x41, 0x5A, -0x40, null], [0xFFFF, 0xFFFF, 1, null]]) },
    { platform: 3, encoding: 10, data: format12([[0x61, 0x7A, 1]]) }
  ]);
  const c = C.parse(both);
  assertEquals(c.format, 12);
  assert(c.has(0x61) && !c.has(0x41));
});

Deno.test("a font with no cmap or no Unicode cmap is refused", () => {
  const noCmap = new Uint8Array(bytes([[4, 0x00010000], [2, 1], [2, 0], [2, 0], [2, 0], [0, [...'head'].map((c) => c.charCodeAt(0))], [4, 0], [4, 28], [4, 4], [4, 0]]));
  assertThrows(() => C.parse(noCmap), Error, "no cmap");
  const macOnly = font([{ platform: 1, encoding: 0, data: bytes([[2, 0], [2, 262], [2, 0], [0, new Array(256).fill(0)]]) }]);
  assertThrows(() => C.parse(macOnly), Error, "no Unicode cmap");
});

/* ── collect() and missing() on an export model ── */

const DATA = {
  book: { id: "b", title: "Café Habits", subtitle: "Small steps", pen_name: "Zoë Hale", bio: "Zoë writes.", trim: "6x9" },
  known: {}, now: "2026-11-04T12:00:00Z",
  chapters: [
    { id: "c1", kind: "chapter", position: 1, title: "Start", sections: [
      { id: "s1", position: 1, title: "One", status: "final", version: { id: "v1", version_no: 1, content: "Save €10 😀 now. [Verify: no source]" } },
      { id: "s2", position: 2, title: "Two ½", status: "final", version: { id: "v2", version_no: 1, content: "Plain text." } }] }
  ]
};

Deno.test("collect: every printed character, where it is, spaces and marks left out", () => {
  const m = R.model(DATA, { include: "final", format: "docx", parts: {} });
  const got = C.collect(m, { about: true, copyright: "Copyright © 2026", alsoBy: [{ title: "Ünder", subtitle: null }], headerTitle: "Hdr" });
  assertEquals(got.get("😀").where, ["1.1 One"]);
  assertEquals(got.get("€").kind, "body");
  assertEquals(got.get("½").kind, "head");
  assertEquals(got.get("½").where, ["1.2 Two ½"]);
  assertEquals(got.get("é").where, ["Book title"]);
  assertEquals(got.get("ë").where, ["Pen name", "About the author"]);
  assertEquals(got.get("©").where, ["Copyright page"]);
  assertEquals(got.get("Ü").where, ["Also by"]);
  assert(got.has("’") && got.has("…") && got.has("“"), "the characters Typst adds");
  assert(!got.has(" ") && !got.has("\n"));
  assert(!got.has("["), "the Verify mark is removed before the check");
});

Deno.test("missing: per face, body text against the body faces, titles against the head faces too", () => {
  const m = R.model(DATA, { include: "final", format: "docx", parts: {} });
  const all = { has: () => true };
  const noEmoji = { has: (cp) => cp !== 0x1F600 };
  const noHalf = { has: (cp) => cp !== 0xBD };
  const miss = C.missing(C.collect(m), {
    body: [{ name: "Body Regular", cmap: noEmoji }, { name: "Body Bold", cmap: all }],
    head: [{ name: "Head Bold", cmap: noHalf }]
  });
  assertEquals(miss.map((x) => [x.char, x.code, x.faces, x.where]), [
    ["½", "U+00BD", ["Head Bold"], ["1.2 Two ½"]],
    ["😀", "U+1F600", ["Body Regular"], ["1.1 One"]]
  ]);
  // Real faces built here: F4 has A–Z only, so lower case letters are missing.
  const real = C.missing(C.collect(m), { body: [{ name: "F4", cmap: C.parse(F4) }] });
  assert(real.some((x) => x.char === "a" && x.faces[0] === "F4"));
  assert(!real.some((x) => x.char === "S"));
});
