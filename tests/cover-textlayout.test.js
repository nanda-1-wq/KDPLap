// deno test --allow-read tests/cover-textlayout.test.js   (from the repo root)
// E16 Part 1: the one line breaker. The CSS rules it copies (line height 1.15, letter spacing,
// pre-wrap spaces, break-word, capitals), the curve against the design's curveChars(), the
// capitals band, and the spine size by cap height (owner Q-9). Widths come from the stub
// measure (0.55 em a character), not real font metrics; Part 4 plugs in ctx.measureText.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near } from "./lib/cover-load.js";

const T = () => K.textlayout;
const em = 34 * 70 / 72;   // 34 pt in board px
const L = (o) => K.model.textLayer(1, Object.assign({ text: "", x: 0, y: 0, w: 360, font: "Source Serif 4", size: 34 }, o));
const texts = (l) => T().lines(l).map((x) => x.text);

Deno.test("line height is 1.15 × size (pt → board px)", () => {
  assertEquals(T().height(L({ text: "One" })), 34 * 70 / 72 * 1.15);
  assertEquals(T().height(L({ text: "" })), T().lineH(L({})), "empty text is one line");
});

Deno.test("words wrap at spaces; a line never passes the box", () => {
  const l = L({ text: "aaa bbb ccc ddd", w: 0.55 * em * 7.5 });   // fits "aaa bbb" (7 characters), not 11
  assertEquals(texts(l), ["aaa bbb ", "ccc ddd"]);
  for (const x of T().lines(l)) assert(x.width <= l.w + 1e-9);
});

Deno.test("explicit line breaks are kept; empty lines count", () => {
  assertEquals(texts(L({ text: "MICRO\nSTUDY\n\nHABITS" })), ["MICRO", "STUDY", "", "HABITS"]);
  assertEquals(T().height(L({ text: "a\n\nb" })) / T().lineH(L({})), 3);
});

Deno.test("trailing spaces hang (not counted in the width); runs of spaces are kept inside a line", () => {
  const l = L({ text: "ab   cd", w: 1000 });
  assertEquals(texts(l), ["ab   cd"]);
  assertEquals(T().lines(l)[0].width, 7 * 0.55 * em);
  assertEquals(T().lines(L({ text: "ab ", w: 1000 }))[0].width, 2 * 0.55 * em);
});

Deno.test("a word longer than the box breaks between characters (break-word)", () => {
  const l = L({ text: "abcdefghij", w: 0.55 * em * 4 });
  assertEquals(texts(l), ["abcd", "efgh", "ij"]);
  assertEquals(texts(L({ text: "xy abcdefghij", w: 0.55 * em * 4 })), ["xy ", "abcd", "efgh", "ij"]);
});

Deno.test("letter spacing adds ls em after every character", () => {
  const a = T().lines(L({ text: "ABCD", w: 1000 }))[0].width, b = T().lines(L({ text: "ABCD", w: 1000, ls: 0.12 }))[0].width;
  near(b - a, 4 * 0.12 * em);
});

Deno.test("capitals: text is upper-cased before measuring and breaking", () => {
  assertEquals(texts(L({ text: "Adnan Haroun", caps: true, w: 1000 })), ["ADNAN HAROUN"]);
});

Deno.test("setMeasure: a real measure replaces the stub; null brings the stub back", () => {
  T().setMeasure((font, weight, px, s) => s.length * px);
  try {
    assertEquals(texts(L({ text: "aa bb", w: em * 2.5 })), ["aa ", "bb"]);
    assertEquals(T().measure("X", 400, 10, "abc"), 30);
  } finally { T().setMeasure(null); }
  assertEquals(T().measure("X", 400, 10, "abc"), 3 * 0.55 * 10);
});

Deno.test("the measure gets the font, the weight and the size in px", () => {
  const seen = [];
  T().setMeasure((font, weight, px, s) => { seen.push([font, weight, px]); return s.length; });
  try { T().lines(L({ text: "a", font: "Anton", weight: 700, size: 72 })); } finally { T().setMeasure(null); }
  assertEquals(seen[0], ["Anton", 700, 70]);
});

for (const c of GOLDEN.curve) {
  Deno.test(`curve ${c.l.curve} ${c.l.caps ? "caps" : "plain"}: character places and height equal the design's curveChars`, () => {
    const l = L({ text: c.l.text, w: c.l.w, size: c.l.size, caps: c.l.caps, ls: c.l.ls, curve: c.l.curve });
    const cv = T().curve(l);
    near(cv.height, c.height, "height");
    near(T().height(l), c.height, "height() of a curved text");
    assertEquals(cv.list.length, c.chars.length);
    cv.list.forEach((x, i) => {
      const g = c.chars[i];
      assertEquals(x.ch, g.ch);
      near(x.x, parseFloat(g.left), `left ${i}`); near(x.top, parseFloat(g.top), `top ${i}`); near(x.w, parseFloat(g.width), `width ${i}`);
      near(x.rot, parseFloat(/rotate\(([-\d.e]+)rad\)/.exec(g.transform)[1]), `rot ${i}`);
      assertEquals(x.origin === "bottom" ? "50% 100%" : "50% 0%", g.origin);
    });
  });
}

Deno.test("metrics: IBM Plex Sans from its pinned file (cap 698, hhea 1025 / 275); others use the fallback until Part 2", () => {
  assertEquals(T().metricsOf("IBM Plex Sans", 600), { cap: 0.698, asc: 1.025, desc: 0.275 });
  assertEquals(T().metricsOf("Lora", 700), T().FALLBACK);
});

Deno.test("the ink band: capitals from the cap top to the last baseline; otherwise ascender to descender (owner STOP 1)", () => {
  const l = L({ text: "SPINE", font: "IBM Plex Sans", size: 10, caps: true });
  const p = 10 * 70 / 72, lh = p * 1.15, base = (lh - 1.3 * p) / 2 + 1.025 * p;
  near(T().inkBand(l), { top: base - 0.698 * p, bottom: base });
  const two = L({ text: "A\nB", font: "IBM Plex Sans", size: 10, caps: true });
  near(T().inkBand(two).bottom - T().inkBand(two).top, lh + 0.698 * p);
  const lw = L({ text: "x\ny", font: "IBM Plex Sans", size: 10, caps: false });
  near(T().inkBand(lw), { top: (lh - 1.3 * p) / 2, bottom: lh + (lh - 1.3 * p) / 2 + 1.3 * p });
  assertEquals(T().inkBand(L({ text: "arc", curve: 40 })), { top: 0, bottom: T().height(L({ text: "arc", curve: 40 })) });
});

// spine size by cap height: room = spine − 2 × 0.0625 in; 7 to 14 pt in half points
const PLEX = { cap: 0.698, asc: 1.025, desc: 0.275 };
const roomOf = (pages, paper) => K.geo.geo({ trim: "6x9", pages, paper }).spine - 8.75;
const TABLE = [
  [84, "white", 7], [85, "white", 7], [86, "white", 7], [100, "white", 10], [110, "white", 12.5], [120, "white", 14], [240, "white", 14],
  [80, "cream", 7.5], [84, "cream", 8.5], [90, "cream", 10], [100, "cream", 12.5], [110, "cream", 14], [240, "cream", 14]
];
for (const [pages, paper, pt] of TABLE) {
  Deno.test(`spine size ${pages} pages ${paper}: ${pt} pt (IBM Plex Sans capitals)`, () => {
    assertEquals(T().spineSize(roomOf(pages, paper), PLEX), pt);
  });
}

Deno.test("spine size: capitals fill the room exactly or less, never under 7 pt, never over 14 pt", () => {
  for (let pages = 80; pages <= 828; pages++) for (const paper of ["white", "cream"]) {
    const room = roomOf(pages, paper), pt = T().spineSize(room, PLEX), cap = pt * 70 / 72 * 0.698;
    assert(pt >= 7 && pt <= 14 && (pt * 2) % 1 === 0);
    if (pt > 7) assert(cap <= room + 1e-9, `${pages} ${paper}`);
  }
});

Deno.test("7 pt Plex capitals need 86 pages on white (84 and 85 leave 0.0037 in and 0.0014 in too little); 80 is enough on cream", () => {
  const need = (paper) => { for (let p = 1; p < 200; p++) if (roomOf(p, paper) >= 7 * 70 / 72 * 0.698 - 1e-9) return p; };
  assertEquals(need("white"), 86);
  assertEquals(need("cream"), 78);
  near(+((7 * 70 / 72 * 0.698 - roomOf(84, "white")) / 70).toFixed(4), 0.0037);
});

Deno.test("a line may break after a hyphen between letters (as CSS and Typst); not before a number, not a trailing hyphen", () => {
  const w = 0.55 * em * 7;
  assertEquals(texts(L({ text: "Low-Energy", w })), ["Low-", "Energy"]);
  assertEquals(texts(L({ text: "Low-Energy", w: 1000 })), ["Low-Energy"]);
  assertEquals(texts(L({ text: "ab -5000000", w })), ["ab ", "-500000", "0"]);
  assertEquals(texts(L({ text: "well-", w: 1000 })), ["well-"]);
});
