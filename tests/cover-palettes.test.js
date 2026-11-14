// deno test --allow-read tests/cover-palettes.test.js   (from the repo root)
// E16 Part 1: series colors (12 layouts × 6 palettes against the design's swapPalette)
// and the color helpers (luminance, contrast, HSV, the picker's CMYK read-out, recent colors).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, DESIGN_BOOK, G6 } from "./lib/cover-load.js";

const P = () => K.palettes;
const colorsOf = (l) => {
  const o = {};
  for (const k of ["color", "fill", "fill2", "scolor", "bcolor"]) if (l[k] !== undefined) o[k] = l[k];
  if (l.fx) o.fx = l.fx.color;
  return o;
};

for (const c of GOLDEN.palettes) {
  Deno.test(`series colors: ${c.key} with ${c.name} equals the design`, () => {
    const b = K.layouts.build(c.key, DESIGN_BOOK, G6, 1);
    const pal = P().PALETTES.find((x) => x[0] === c.name)[1];
    const r = P().swap(b.layers, b.bg, pal);
    assertEquals(r.bg, c.bg);
    near(r.layers.map(colorsOf), c.layers);
  });
}

Deno.test("6 palettes of 4 colors; white and near-black never change", () => {
  assertEquals(P().PALETTES.map((x) => x[0]), ["Navy and coral", "Forest", "Plum", "Teal", "Brick", "Charcoal"]);
  P().PALETTES.forEach((x) => assertEquals(x[1].length, 4));
  const L = [K.model.textLayer(1, { text: "a", x: 0, y: 0, w: 10, color: "#ffffff" }), K.model.shapeLayer(2, { x: 0, y: 0, w: 1, h: 1, fill: "#1C1C1A" })];
  const r = P().swap(L, "#000000", P().PALETTES[0][1]);
  assertEquals([r.bg, r.layers[0].color, r.layers[1].fill], ["#000000", "#ffffff", "#1C1C1A"]);
});

Deno.test("light colors go to the palette's light color; dark ones to main, accent, extra in use order", () => {
  const pal = ["#111111", "#222222", "#EEEEEE", "#333333"];
  const L = [K.model.shapeLayer(1, { x: 0, y: 0, w: 1, h: 1, fill: "#7A2E2E" }), K.model.shapeLayer(2, { x: 0, y: 0, w: 1, h: 1, fill: "#7A2E2E" }),
    K.model.textLayer(3, { text: "a", x: 0, y: 0, w: 10, color: "#2F4A3A" }), K.model.textLayer(4, { text: "a", x: 0, y: 0, w: 10, color: "#3E3557" })];
  const r = P().swap(L, "#F2EDE4", pal);
  assertEquals(r.bg, "#EEEEEE");
  assertEquals(r.layers.map((l) => l.fill || l.color), ["#111111", "#111111", "#222222", "#333333"]);
});

Deno.test("contrast and luminance: WCAG numbers", () => {
  assertEquals(+P().contrast("#000000", "#FFFFFF").toFixed(2), 21);
  assertEquals(P().contrast("#777777", "#777777"), 1);
  assertEquals(+P().contrast("#FFFFFF", "#1F3A5F").toFixed(1), 11.5);
  assert(P().lum("#F2C14E") > 0.55 && P().lum("#E07A5F") < 0.55);
});

Deno.test("HSV round trip and the picker's CMYK read-out", () => {
  for (const hex of ["#1C1C1A", "#FFFFFF", "#1F3A5F", "#F2C14E", "#000000", "#FF0000"]) {
    const h = P().hexToHsv(hex);
    assertEquals(P().hsvToHex(h.hue, h.sat, h.val), hex);
  }
  // the design rounds the hue to whole degrees, so a few colors move by 1 in one channel (port as is)
  const h = P().hexToHsv("#E07A5F");
  assertEquals(P().hsvToHex(h.hue, h.sat, h.val), "#E07B5F");
  assertEquals(P().cmyk("#000000"), [0, 0, 0, 100]);
  assertEquals(P().cmyk("#FFFFFF"), [0, 0, 0, 0]);
  assertEquals(P().cmyk("#1F3A5F"), [67, 39, 0, 63]);
  assertEquals(P().rgbToHex(31.4, 58, 95), "#1F3A5F");
});

Deno.test("recent colors: newest first, no repeats, 5 kept", () => {
  let r = [];
  for (const c of ["#111111", "#222222", "#333333", "#111111", "#444444", "#555555", "#666666"]) r = P().recent(r, c);
  assertEquals(r, ["#666666", "#555555", "#444444", "#111111", "#333333"]);
});
