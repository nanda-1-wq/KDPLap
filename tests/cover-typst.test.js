// deno test --allow-read tests/cover-typst.test.js   (from the repo root)
// 09 Cover, E16 Part 2: the Typst writer (js/cover/typst.js, template c2 in js/cover/cover.typ).
// The source is checked as text here (one color space, no alpha, no gradient, the page size, the
// places from kdpCover.textlayout, the faces Typst selects by); tests/browser/cover/t-engine-real.mjs
// compiles it for real and checks the PDF.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { K, QA, G6, withCatalog } from "./lib/cover-engine-load.js";

const Y = K.typst, M = K.model, F = K.flatten;
const T = (id, o) => M.textLayer(id, Object.assign({ text: "Title words", x: 500, y: 100, w: 300, size: 30, font: "Source Serif 4", weight: 700 }, o));
const S = (id, o) => M.shapeLayer(id, Object.assign({ x: 500, y: 100, w: 200, h: 100 }, o));
const fx = (o) => Object.assign({}, M.FX_DEF, o);
const src = (layers, fmt = G6, bg = "#F2EDE4") => withCatalog(() => { const c = { fmt, bg, layers }; return Y.source(c, F.plan(c)); });
const COVER_TYP = Deno.readTextFileSync(new URL("../js/cover/cover.typ", import.meta.url));

Deno.test("str: a Typst string literal; markup characters stay plain text", () => {
  assertEquals(Y.str('He said "hi"'), '"He said \\"hi\\""');
  assertEquals(Y.str("a\\b"), '"a\\\\b"');
  assertEquals(Y.str("line\nnext\tx\r"), '"line\\nnext\\tx\\r"');
  assertEquals(Y.str("bell\u0007"), '"bell\\u{7}"');
  assertEquals(Y.str("#set *bold* _x_ $m$ @ref <l> // c"), '"#set *bold* _x_ $m$ @ref <l> // c"');
  assertEquals(Y.str("Café 😀"), '"Café 😀"');
});

Deno.test("cover.typ: one color space only (no luma, no named color, no gradient, no alpha)", () => {
  const code = COVER_TYP.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const bad of [/luma\(/, /gradient/, /\bblack\b|\bwhite\b|\bred\b/, /rgb\([^)]*,[^)]*,[^)]*,/, /cmyk\(/]) assert(!bad.test(code), String(bad));
  assertMatch(code, /stroke: none/);
});

Deno.test("source: page = the full wrap with bleed for every trim and paper; background rgb", () => {
  for (const trim of K.geo.TRIMS) for (const paper of K.geo.PAPERS) {
    const fmt = { trim, pages: 120, paper };
    const s = src([], fmt);
    const w = K.geo.wrapIn(K.geo.geo(fmt));
    const m = /#set page\(width: ([\d.]+)in, height: ([\d.]+)in, margin: 0pt, fill: rgb\("#F2EDE4"\)\)/.exec(s.mainTyp);
    assert(m, `${trim} ${paper}`);
    assert(Math.abs(Number(m[1]) - w.w) < 1e-4 && Math.abs(Number(m[2]) - w.h) < 1e-4);
    assertEquals(s.size, { wIn: K.geo.geo(fmt).W / 70, hIn: K.geo.geo(fmt).H / 70 });
  }
});

Deno.test("source: every QA cover and ready layout has only rgb(\"#RRGGBB\") colors, no alpha, no gradient", () => {
  const covers = [...QA.SHEETS.map((k) => QA.sheet(k)), ...K.layouts.KEYS.map((k) => QA.layout(k, G6))];
  for (const c of covers) {
    const s = withCatalog(() => Y.source(c, F.plan(c)));
    for (const m of s.mainTyp.matchAll(/rgb\(([^)]*)\)/g)) assertMatch(m[1], /^"#[0-9A-F]{6}"$/);
    const code = s.mainTyp.replace(/"(?:\\.|[^"\\])*"/g, '""');   // words inside the cover's own texts do not count
    assert(!/gradient|luma|cmyk|opacity/.test(code));
    assertEquals(s.missingFonts, []);
  }
});

Deno.test("source: each plain line is a #run at the textlayout place, with a fit marker and our width", () => {
  const l = T(7, { text: "Micro Study Habits for Busy Adult Learners", w: 260, align: "center" });
  const s = src([l]);
  const runs = [...s.mainTyp.matchAll(/#run\(([-\d.]+), ([-\d.]+), "([^"]+)", (\d+), ([\d.]+), rgb\("#1C1C1A"\), ([-\d.]+), "([^"]*)"/g)];
  const lines = withCatalog(() => K.textlayout.lines(l));
  assertEquals(runs.length, lines.length);
  assertEquals(s.lines.length, lines.length);
  withCatalog(() => {
    const base = Y.baseOf(l), lh = K.textlayout.lineH(l);
    runs.forEach((m, i) => {
      assert(Math.abs(Number(m[1]) - (l.w - lines[i].width) / 2) < 1e-3, "centered x");
      assert(Math.abs(Number(m[2]) - (i * lh + base)) < 1e-3, "baseline y");
      assertEquals(m[3], "Source Serif 4");
      assertEquals(m[4], "700");
      assertEquals(m[7], lines[i].text.replace(/ +$/, ""));
    });
  });
  assertEquals((s.mainTyp.match(/#fit\(/g) || []).length, lines.length);
  assertMatch(s.mainTyp, /#layer\(500, 100, 260, [\d.]+, 0\)\[/);
});

Deno.test("source: Typst selects by the family Typst gives the file, its weight class and width", () => {
  // Bebas Neue has only a 400 file: 700 snaps to 400 (D5, no fake bold).
  const s = src([T(1, { font: "Bebas Neue", weight: 700 })]);
  assertMatch(s.mainTyp, /#run\([^\n]*"Bebas Neue", 400,/);
  assertEquals(s.faces.map((f) => `${f.family} ${f.weight}`), ["Bebas Neue 400"]);
  // IBM Plex Sans Condensed is "IBM Plex Sans" at 75% width in the file.
  const c = src([T(1, { font: "IBM Plex Sans Condensed", weight: 600 })]);
  assertMatch(c.mainTyp, /#run\([^\n]*"IBM Plex Sans", 600, [^\n]*stretch: 75%\)/);
  assertMatch(c.mainTyp, /#fit\([^\n]*stretch: 75%\)/);
});

Deno.test("source: letter spacing becomes tracking (ls × size pt); our width leaves out the last spacing", () => {
  const l = T(1, { text: "SPACED", caps: false, ls: 0.12, size: 20, w: 400 });
  const s = src([l]);
  assertMatch(s.mainTyp, /#run\([^\n]*, 2\.4, "SPACED"\)/);
  withCatalog(() => {
    const full = K.textlayout.runW(l, "SPACED") / (70 / 72);
    assert(Math.abs(s.lines[0].w - (full - 0.12 * 20)) < 1e-9);
  });
});

Deno.test("source: curved text is one #curve-char a character and no fit marker", () => {
  const l = T(1, { text: "Curved up", curve: 60 });
  const s = src([l]);
  assertEquals((s.mainTyp.match(/#curve-char\(/g) || []).length, Array.from("Curved up").length);
  assertEquals(s.lines.length, 0);
  assertMatch(s.mainTyp, /#curve-char\([^)]*, true, "Source Serif 4"/);
  assertMatch(src([T(1, { text: "Down", curve: -40 })]).mainTyp, /#curve-char\([^)]*, false, /);
});

Deno.test("source: vector effects: outline (stroke under the fill), 3D copies, a hard shadow, a solid plate", () => {
  const o = src([T(1, { fx: fx({ style: "outline", color: "#F2C14E", width: 2 }) })]).mainTyp;
  assertMatch(o, /#run\([^\n]*rgb\("#F2C14E"\)[^\n]*stroke: \(paint: rgb\("#F2C14E"\), thickness: 4\.1143pt, join: "round", cap: "round"\)\)/);
  assert(o.indexOf('stroke: (paint') < o.lastIndexOf('rgb("#1C1C1A"), 0, "Title words")'), "the stroke copy is under the fill");
  const d = src([T(1, { fx: fx({ style: "3d", depth: 4, color: "#E07A5F" }) })]).mainTyp;
  assertEquals((d.match(/rgb\("#E07A5F"\)/g) || []).length, 4);
  const h = src([T(1, { fx: fx({ style: "shadow", int: 100, blur: 0, dist: 3, dir: 0, color: "#7A2E2E" }) })]).mainTyp;
  const xs = [...h.matchAll(/#run\(([-\d.]+), [\d.]+, "Source Serif 4", 700, 30, rgb\("(#[0-9A-F]{6})"\)/g)].map((m) => [Number(m[1]), m[2]]);
  assertEquals(xs.map((x) => x[1]), ["#7A2E2E", "#1C1C1A"]);   // the shadow copy first, under the letters
  assert(Math.abs(xs[0][0] - xs[1][0] - 3) < 1e-3, "3 px to the right");
  const b = src([T(1, { fx: fx({ style: "bg", int: 100, pad: 8, round: 6, color: "#1F3A5F" }) })]).mainTyp;
  assertMatch(b, /#plate\(-8, -4, 316, [\d.]+, 6, rgb\("#1F3A5F"\)\)/);
});

Deno.test("source: an effect patch is a #patch before the letters; the letters carry no effect", () => {
  const s = src([T(1, { fx: fx({ style: "shadow" }) })]);
  const p = s.mainTyp.indexOf("#patch("), r = s.mainTyp.indexOf("#run(");
  assert(p > 0 && r > p);
  assertEquals((s.mainTyp.match(/#run\(/g) || []).length, 1);
  assertMatch(s.mainTyp, /#patch\("\/p\/1\.jpg", \d+, \d+, \d+, \d+\)/);
  assertEquals(s.patches.length, 1);
});

Deno.test("source: shapes are curves: even-odd, flips, dash and dot, no fill for a line", () => {
  const solid = src([S(1, { kind: "star", sw: 3, dash: "dash", scolor: "#1C1C1A", flipH: true, rot: 15 })]).mainTyp;
  assertMatch(solid, /#shape-box\(500, 100, 200, 100, 15, -1, 1\)\[#place\(top \+ left, curve\(fill: rgb\("#1F3A5F"\), fill-rule: "even-odd", stroke: \(paint: rgb\("#1C1C1A"\), thickness: 3pt, cap: "round", join: "round", dash: \(9pt, 6pt\)\), curve\.move/);
  const dot = src([S(1, { kind: "ellipse", sw: 2, dash: "dot" })]).mainTyp;
  assertMatch(dot, /dash: \(0pt, 4pt\)/);
  const line = src([S(1, { kind: "line", h: 10, sw: 4, fillMode: "solid" })]).mainTyp;
  assertMatch(line, /curve\(fill: none,/);
  assertMatch(src([S(1, { fillMode: "none", sw: 1 })]).mainTyp, /curve\(fill: none,/);
  assert(!/curve\(/.test(src([S(1, { fillMode: "grad" })]).mainTyp), "a gradient is a patch");
});

Deno.test("source: split patches keep their grid boxes; faces are only the vector text's", () => {
  const c = { fmt: G6, bg: "#FFFFFF", layers: [M.imageLayer(1, { x: 0, y: 0, w: 866, h: 647.5 }), T(2, { op: 50 }), T(3, { y: 400, font: "Inter", weight: 600 })] };
  const s = withCatalog(() => Y.source(c, F.plan(c), { patches: [{ n: 1, box: { x0: 0, y0: 0, x1: 100, y1: 50 }, path: "/p/1.jpg" }, { n: 1, box: { x0: 0, y0: 50, x1: 100, y1: 90 }, path: "/p/1-1.jpg" }] }));
  assertMatch(s.mainTyp, /#patch\("\/p\/1\.jpg", 0, 0, 100, 50\)\n#patch\("\/p\/1-1\.jpg", 0, 50, 100, 90\)/);
  assertEquals(s.faces.map((f) => `${f.family} ${f.weight}`), ["Inter 600"]);   // the 50% text is inside a patch
});

Deno.test("source: a font that is not in the catalog is reported, never written", () => {
  const s = src([T(1, { font: "Comic Sans MS" })]);
  assertEquals(s.missingFonts, [{ id: 1, font: "Comic Sans MS" }]);
  assert(!/Comic/.test(s.mainTyp));
});

Deno.test("source: empty and hidden texts write nothing; a turned text keeps its box and angle", () => {
  assert(!/#run/.test(src([T(1, { text: "   " }), T(2, { hidden: true }), T(3, { noExport: true })]).mainTyp));
  assertMatch(src([T(1, { rot: -12 })]).mainTyp, /#layer\(500, 100, 300, [\d.]+, -12\)\[/);
});
