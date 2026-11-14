// deno test --allow-read tests/cover-fonts.test.js   (from the repo root)
// 09 Cover, E16 Part 2: the font catalog (js/cover/font-catalog.js, made by tools/cover-fonts.mjs) and
// the one place that picks a font file (js/cover/fonts.js, plan §8 and D5). Licences OFL 1.1 or
// Apache 2.0 only, every file pinned, the 20 design fonts with the design's groups, weights only
// where a file exists, the names Typst selects by, the sprite and the notices list.
// tools/check-cover-fonts.mjs --check re-hashes the files; t-engine-real.mjs section E compiles each face.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, withCatalog } from "./lib/cover-engine-load.js";
import { typstFamily } from "../tools/cover-fonts.mjs";

const ROWS = K.fontCatalog, Fo = K.fonts;
const DESIGN = [["Source Serif 4", "Serif"], ["EB Garamond", "Serif"], ["Lora", "Serif"], ["Playfair Display", "Serif"], ["Merriweather", "Serif"], ["Libre Baskerville", "Serif"], ["Roboto Slab", "Serif"],
  ["IBM Plex Sans", "Sans"], ["Inter", "Sans"], ["Montserrat", "Sans"], ["Poppins", "Sans"], ["Raleway", "Sans"],
  ["Oswald", "Display"], ["Bebas Neue", "Display"], ["Abril Fatface", "Display"], ["Anton", "Display"],
  ["Pacifico", "Script"], ["Dancing Script", "Script"], ["Great Vibes", "Script"], ["Space Mono", "Mono"]];

Deno.test("catalog: 300 families, unique, OFL 1.1 or Apache 2.0 only, 5 groups", () => {
  assertEquals(ROWS.length, 300);
  assertEquals(new Set(ROWS.map((r) => r[0])).size, 300);
  for (const r of ROWS) {
    assert(["OFL-1.1", "Apache-2.0"].includes(r[2]), `${r[0]}: ${r[2]}`);
    assert(["Serif", "Sans", "Display", "Script", "Mono"].includes(r[1]), `${r[0]}: ${r[1]}`);
  }
});

Deno.test("catalog: every file is pinned (package@version, path, size, sha384), at most 2 MB, and only 400, 600, 700", () => {
  let n = 0;
  for (const [family, , , pkg, faces] of ROWS) {
    assert(/^@expo-google-fonts\/[a-z0-9-]+@\d+\.\d+\.\d+$/.test(pkg), `${family}: ${pkg}`);
    const ws = Object.keys(faces);
    assert(ws.length >= 1 && ws.every((w) => ["400", "600", "700"].includes(w)), `${family}: ${ws}`);
    for (const [w, f] of Object.entries(faces)) {
      n++;
      assert(f[0].endsWith(".ttf") && f[0].startsWith({ 400: "400Regular/", 600: "600SemiBold/", 700: "700Bold/" }[w]), f[0]);
      assert(Number.isInteger(f[1]) && f[1] > 1000 && f[1] <= 2097152, `${family} ${w} bytes ${f[1]} (owner STOP 2, F5: at most 2 MB)`);
      assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(f[2]), `${family} ${w} sri`);
      assert(typeof f[3] === "string" && f[3].length > 0 && typeof f[4] === "string" && f[4].length > 0, `${family} ${w} names`);
      assert(f[6] > 0.5 && f[6] < 2.5 && f[7] >= 0 && f[7] < 1.5, `${family} ${w} hhea`);
      assert(f[5] === null || (f[5] > 0.3 && f[5] < 1.2), `${family} ${w} cap ${f[5]}`);
      assert(Number.isInteger(f[8]) && f[8] >= 100 && f[8] <= 1000 && Number.isInteger(f[9]) && f[9] >= 1 && f[9] <= 9, `${family} ${w} classes`);
    }
  }
  assertEquals(n, 692);
});

Deno.test("catalog: the 20 design fonts, with the design's groups", () => {
  for (const [f, g] of DESIGN) {
    const r = ROWS.find((x) => x[0] === f);
    assert(r, f);
    assertEquals(r[1], g, f);
  }
});

Deno.test("catalog: no two faces Typst cannot tell apart; the 3 colliding families are out (owner STOP 2, F4)", () => {
  for (const f of ["Roboto Condensed", "Archivo Black", "Archivo Narrow"]) assert(!ROWS.some((r) => r[0] === f), f);
  const seen = new Map();
  for (const [family, , , , faces] of ROWS) for (const [w, f] of Object.entries(faces)) {
    const k = `${f[4].toLowerCase()}|${f[8]}|${f[9]}`;
    assert(!seen.has(k), `${family} ${w} = ${seen.get(k)}`);
    seen.set(k, `${family} ${w}`);
  }
});

Deno.test("typstFamily: Typst's trimming of style words from the family name", () => {
  assertEquals(typstFamily("Roboto Condensed SemiBold"), "Roboto");
  assertEquals(typstFamily("Archivo Black"), "Archivo");
  assertEquals(typstFamily("Shadows Into Light"), "Shadows Into");
  assertEquals(typstFamily("IBM Plex Sans Condensed"), "IBM Plex Sans");
  assertEquals(typstFamily("Rounded Mplus 1c Bold"), "Rounded Mplus 1c");
  assertEquals(typstFamily("Source Serif 4"), "Source Serif 4");
  assertEquals(typstFamily("Montserrat SemiBold"), "Montserrat");
  assertEquals(typstFamily("Lato ExtraBold"), "Lato");
  assertEquals(typstFamily("Playfair Display"), "Playfair Display");
});

Deno.test("snap: the weight that has a file (D5: no fake bold); heavier first from 500", () => {
  assertEquals(Fo.snap("Montserrat", 600), 600);
  assertEquals(Fo.snap("Bebas Neue", 700), 400);
  assertEquals(Fo.snap("Space Mono", 600), 700);      // 400 and 700: 600 goes up
  assertEquals(Fo.snap("Space Mono", 450), 400);
  assertEquals(Fo.snap("Space Mono", 500), 400);      // nearest wins before the tie rule
  assertEquals(Fo.snap("Space Mono", 550), 700);
  assertEquals(Fo.snap("Space Mono", 900), 700);
  assertEquals(Fo.snap("Nope Sans", 400), null);
  assertEquals(Fo.face("Nope Sans", 400), null);
});

Deno.test("face: file, names Typst selects by, metrics; IBM Plex Sans 600 cap equals Part 1's 0.698", () => {
  const f = Fo.face("IBM Plex Sans", 600);
  assertEquals([f.family, f.weight, f.typst, f.typstWeight, f.typstStretch, f.ps], ["IBM Plex Sans", 600, "IBM Plex Sans", 600, 100, "IBMPlexSans-SemiBold"]);
  assertEquals(f.file.pkg, "@expo-google-fonts/ibm-plex-sans@0.4.1");
  assertEquals([f.cap, f.asc, f.desc], [0.698, 1.025, 0.275]);
  assertEquals(K.textlayout.METRICS["IBM Plex Sans"], { cap: 0.698, asc: 1.025, desc: 0.275 });
  const c = Fo.face("IBM Plex Sans Condensed", 400);
  assertEquals([c.typst, c.typstStretch], ["IBM Plex Sans", 75]);
  // A file with no cap height gets the fallback, and says so.
  const nocap = ROWS.find((r) => Object.values(r[4]).some((x) => x[5] === null));
  if (nocap) { const g = Fo.face(nocap[0], Number(Object.keys(nocap[4])[0])); assertEquals(g.cap, Fo.FALLBACK_CAP); assertEquals(g.capMeasured, false); }
});

Deno.test("used and fontSet: printed text layers only, unique, a stable key", () => {
  const M = K.model;
  const L = [M.textLayer(1, { text: "a", font: "Inter", weight: 600 }), M.textLayer(2, { text: "b", font: "Inter", weight: 600 }),
    M.textLayer(3, { text: "c", font: "Lora", weight: 700, hidden: true }), M.textLayer(4, { text: "  ", font: "Lora" }), M.textLayer(5, { text: "d", font: "Bebas Neue", weight: 700 })];
  const u = Fo.used(L);
  assertEquals(u.map((f) => `${f.family} ${f.weight}`).sort(), ["Bebas Neue 400", "Inter 600"]);
  const s = Fo.fontSet(u);
  assertEquals(s.files.length, 2);
  assertEquals(s.key, Fo.fontSet(Fo.used(L.slice().reverse())).key);
  assertEquals(Fo.fontSet([]).key, "none");
});

Deno.test("install: textlayout reads the catalog's metrics, and can go back to Part 1's table", () => {
  withCatalog(() => assertEquals(K.textlayout.metricsOf("Great Vibes", 400), Fo.metrics("Great Vibes", 400)));
  assertEquals(K.textlayout.metricsOf("Great Vibes", 400), K.textlayout.FALLBACK);
});

Deno.test("sprite: img/cover-fonts.png has one 56 px row per family, 600 px wide", () => {
  const b = Deno.readFileSync(new URL("../img/cover-fonts.png", import.meta.url));
  const dv = new DataView(b.buffer, b.byteOffset);
  assertEquals([...b.subarray(1, 4)].map((c) => String.fromCharCode(c)).join(""), "PNG");
  assertEquals([dv.getUint32(16), dv.getUint32(20)], [600, 300 * 56]);
});

Deno.test("notices: THIRD-PARTY-NOTICES.md lists every catalog family with its licence", () => {
  const t = Deno.readTextFileSync(new URL("../THIRD-PARTY-NOTICES.md", import.meta.url));
  const block = t.slice(t.indexOf("<!-- cover-fonts:start"), t.indexOf("<!-- cover-fonts:end -->"));
  for (const [family, , lic, pkg] of ROWS) {
    assert(block.includes(`- ${family}: ${lic === "OFL-1.1" ? "SIL Open Font License 1.1" : "Apache License 2.0"}; \`${pkg}\``), family);
  }
});
