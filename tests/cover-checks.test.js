// deno test --allow-read tests/cover-checks.test.js   (from the repo root)
// E16 Part 1: the 14 checks. Port proof: one scenario per rule (and F70) gives the design's
// items word for word (design text heights, the design's line-box spine rule). Built: spine text
// made by Add spine text (cap height, owner Q-9) on every trim × page count × paper where it is on;
// the C3 / C4 capitals band (planned D13); the chip; hidden and excluded layers.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, near, chk, goldChk, designTextH, DESIGN_BOOK, TRIMS, fk, G6 } from "./lib/cover-load.js";

// D14 (owner STOP 1, N1): the C5 message names 86 pages on white, where the design says 84.
const d14 = (items) => goldChk(items).map((x) => Object.assign(x, { msg: x.msg.replace("at least 84 pages on white paper", "at least 86 pages on white paper") }));

for (const c of GOLDEN.checks) {
  Deno.test(`port: checks "${c.name}" equal the design`, () => {
    const items = K.checks.run({ fmt: c.fmt, bg: c.bg, layers: c.layers }, { textH: designTextH, spineInk: false });
    near(chk(items), d14(c.checks));
    assertEquals(items.map((x) => (x.fix ? x.fix.label : null)), c.checks.map((x) => x.fix));
    const sm = K.checks.summary(items);
    assertEquals([sm.chip, sm.line], [c.chip, c.summary], "the chip and the summary line");
  });
}

const CODES = {
  "F70 subtitle 6 pt, pen moved down": ["C2"], "text crossing the spine": ["C6"], "text outside the safe area": ["C7"], "text near the edge": ["C8"],
  "shape stops short of the edge": ["C9"], "text in the barcode box": ["C11"], "low contrast title": ["C12"], "no back text": ["C14"],
  "missing pen name, hidden title": ["C1", "C1"], "excluded subtitle": ["C1"], "text on a thin spine (54 white)": ["C5"], "photo full: dark 30": ["C13"],
  "picture 150 DPI": ["C10"], "picture 199 DPI": ["C10"], "picture 250 DPI": ["C10"], "picture 299 DPI": ["C10"], "picture 200 DPI": ["C10"],
  "spine text past the top": ["C4"]
};
Deno.test("each rule has its code (C1 to C14 in the design's source order)", () => {
  for (const c of GOLDEN.checks) {
    if (!CODES[c.name]) continue;
    const items = K.checks.run({ fmt: c.fmt, bg: c.bg, layers: c.layers }, { textH: designTextH, spineInk: false });
    for (const code of CODES[c.name]) assert(items.some((x) => x.code === code), `${c.name}: ${code} in ${items.map((x) => x.code)}`);
  }
  const all = new Set(GOLDEN.checks.flatMap((c) => K.checks.run({ fmt: c.fmt, bg: c.bg, layers: c.layers }, { textH: designTextH, spineInk: false }).map((x) => x.code)));
  assertEquals([...all].sort((a, b) => +a.slice(1) - +b.slice(1)), ["C1", "C2", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14"]);
});

Deno.test("DPI: under 200 Must fix, 200 to 299 check this, 300 fine", () => {
  const sev = (name) => K.checks.run((({ fmt, bg, layers }) => ({ fmt, bg, layers }))(GOLDEN.checks.find((c) => c.name === name)), { textH: designTextH }).filter((x) => x.code === "C10").map((x) => x.sev);
  assertEquals(sev("picture 199 DPI"), ["error"]);
  assertEquals(sev("picture 200 DPI"), ["warn"]);
  assertEquals(sev("picture 299 DPI"), ["warn"]);
  assertEquals(sev("picture 300 DPI"), []);
});

// ---- spine text (owner Q-9: size by cap height, 7 pt minimum, thresholds 80 cream / 84 white) ----
const SPINE_PAGES = [80, 84, 85, 86, 100, 120, 240];
for (const trim of TRIMS) for (const paper of ["white", "cream"]) for (const pages of SPINE_PAGES) {
  const fmt = { trim, pages, paper };
  if (!K.geo.geo(fmt).spineTextOk) continue;
  Deno.test(`built: Add spine text at ${fk(fmt)} fits: no spine problem`, () => {
    const b = K.layouts.build("band", DESIGN_BOOK, fmt, 1);
    const s = K.layouts.spineLayer(b.nextId, fmt, DESIGN_BOOK);
    assert(s.size >= 7 && s.size <= 14);
    assertEquals(K.textlayout.lines(s).length, 1, "one line");
    const items = K.checks.run({ fmt, bg: b.bg, layers: b.layers.concat([s]) }).filter((x) => x.sev !== "tip");
    assertEquals(items.map((x) => x.code), []);
    // the capitals' band is centered on the spine
    const g = K.geo.geo(fmt), ink = K.checks.inkBox(s, (l) => K.textlayout.height(l));
    near(ink.x + ink.w / 2, (g.foldL + g.foldR) / 2);
  });
}

Deno.test("every page count from the threshold (86 white, 80 cream) to 828, every trim and paper: Add spine text never gives a spine problem", () => {
  const bad = [];
  for (const trim of TRIMS) for (const paper of ["white", "cream"]) for (let pages = paper === "white" ? 86 : 80; pages <= 828; pages++) {
    const fmt = { trim, pages, paper }, s = K.layouts.spineLayer(1, fmt, DESIGN_BOOK);
    const codes = K.checks.run({ fmt, bg: "#FFFFFF", layers: [s] }).filter((x) => x.id === 1).map((x) => x.code);
    if (codes.length) bad.push(`${trim} ${pages} ${paper} ${codes.join(",")}`);
  }
  assertEquals(bad, []);
});

Deno.test("spine text is off under 80 pages cream and 86 white: no layer", () => {
  assertEquals(K.layouts.spineLayer(1, { trim: "6x9", pages: 85, paper: "white" }, DESIGN_BOOK), null);
  assertEquals(K.layouts.spineLayer(1, { trim: "6x9", pages: 79, paper: "cream" }, DESIGN_BOOK), null);
});

Deno.test("the design's own spine rule (line box, 6 pt floor) fails its own checks at 84 white and 80 cream (why D13 exists)", () => {
  for (const c of GOLDEN.spineDesign.filter((x) => x.on && x.fmt.trim === "6x9")) {
    const codes = c.checks.map((x) => x.msg);
    if ((c.fmt.paper === "white" && c.fmt.pages <= 86) || (c.fmt.paper === "cream" && c.fmt.pages <= 84)) assert(codes.some((m) => m.includes("KDP needs text of at least 7 pt")), fk(c.fmt));
  }
  const at120 = GOLDEN.spineDesign.find((x) => x.fmt.trim === "6x9" && x.fmt.pages === 120 && x.fmt.paper === "white");
  assertEquals([at120.size, at120.checks.length], [8.5, 0]);
});

Deno.test("C3 with the line box (spineInk off) flags the cap-height spine text at 120 white; the capitals band does not", () => {
  const fmt = { trim: "6x9", pages: 120, paper: "white" };
  const s = K.layouts.spineLayer(1, fmt, DESIGN_BOOK);
  assertEquals(s.size, 14);
  const L = [s];
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: L }, { spineInk: false }).filter((x) => x.id === 1).map((x) => x.code), ["C3"]);
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: L }).filter((x) => x.id === 1).map((x) => x.code), []);
});

Deno.test("owner STOP 1: spine text not all in capitals is measured ascender to descender, so lower-case tails count", () => {
  const fmt = { trim: "6x9", pages: 120, paper: "white" }, g = K.geo.geo(fmt);
  const caps = K.layouts.spineLayer(1, fmt, DESIGN_BOOK);              // 14 pt capitals: fits
  const lower = Object.assign({}, caps, { caps: false, text: "Micro Study Habits for Busy Adult Learners    Adnan Haroun" });
  const H = (l) => K.textlayout.height(l);
  const bc = K.checks.inkBox(caps, H), bl = K.checks.inkBox(lower, H);
  near(bc.w, 14 * 70 / 72 * 0.698);                                   // capitals: the cap height across the spine
  near(bl.w, 14 * 70 / 72 * (1.025 + 0.275));                         // lower case: ascender + descender across the spine
  assert(bl.w > K.model.bbox(lower).w, "taller than the 1.15 line box for this font");
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: [caps] }).filter((x) => x.id === 1).map((x) => x.code), []);
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: [lower] }).filter((x) => x.id === 1).map((x) => x.code), ["C3"]);
  // on a thick spine the lower-case line fits too
  const thick = { trim: "6x9", pages: 400, paper: "white" }, gk = K.geo.geo(thick);
  const lw = Object.assign({}, lower, { x: (gk.foldL + gk.foldR) / 2 - lower.w / 2 });
  assertEquals(K.checks.run({ fmt: thick, bg: "#FFFFFF", layers: [lw] }).filter((x) => x.id === 1).map((x) => x.code), []);
  assert(g.spineTextOk);
});

Deno.test("owner STOP 1: one-line lower-case and all-capitals bands from the font's metrics", () => {
  const base = K.model.textLayer(1, { text: "Spine", font: "IBM Plex Sans", size: 10, x: 0, y: 0, w: 400 });
  const p = 10 * 70 / 72, lh = p * 1.15, lead = (lh - 1.3 * p) / 2;
  near(K.textlayout.inkBand(base), { top: lead, bottom: lead + 1.3 * p });
  near(K.textlayout.inkBand(Object.assign({}, base, { caps: true })), { top: lead + 1.025 * p - 0.698 * p, bottom: lead + 1.025 * p });
});

Deno.test("hidden and excluded layers are skipped by every rule", () => {
  const b = K.layouts.build("band", DESIGN_BOOK, G6, 1);
  const bad = K.model.textLayer(50, { text: "Tiny", x: 2, y: 2, w: 900, size: 6 });
  const run = (extra) => K.checks.run({ fmt: G6, bg: b.bg, layers: b.layers.concat([Object.assign({}, bad, extra)]) }).filter((x) => x.id === 50);
  assert(run({}).length >= 2);
  assertEquals(run({ hidden: true }), []);
  assertEquals(run({ noExport: true }), []);
});

Deno.test("a rotated layer is checked by its rotated box", () => {
  const fmt = G6, g = K.geo.geo(fmt);
  const s = K.model.shapeLayer(1, { x: g.frontCX - 50, y: 45, w: 100, h: 20 });   // turned 90°: its box starts 5 px from the top
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: [s] }).filter((x) => x.id === 1).map((x) => x.code), []);
  const r = Object.assign({}, s, { rot: 90 });
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: [r] }).filter((x) => x.id === 1).map((x) => x.code), ["C9"]);
});

Deno.test("the chip and the summary line (design chipLabel, checksSummary)", () => {
  assertEquals(K.checks.summary([{ sev: "error" }, { sev: "error" }, { sev: "warn" }]), { errors: 2, warns: 1, tips: 0, chip: "2 to fix", line: "2 must fix, 1 to check" });
  assertEquals(K.checks.summary([{ sev: "warn" }, { sev: "tip" }]).chip, "1 to check");
  assertEquals(K.checks.summary([{ sev: "tip" }]).chip, "Ready");
  assertEquals(K.checks.summary([]).chip, "Ready");
  assertEquals(K.checks.summary([{ sev: "error" }, { sev: "warn" }, { sev: "warn" }]).line, "1 must fix, 2 to check");
  assertEquals(K.checks.summary([{ sev: "error" }]).line, "1 must fix");
  assertEquals(K.checks.summary([{ sev: "warn" }]).line, "1 to check");
  assertEquals(K.checks.summary([]).line, "Ready to export");
});

Deno.test("the back blurb tip offers Write blurb; missing items offer Add it", () => {
  const items = K.checks.run({ fmt: G6, bg: "#FFFFFF", layers: [] });
  assertEquals(items.find((x) => x.code === "C14").fix, { label: "Write blurb", action: "blurb" });
  assertEquals(items.filter((x) => x.code === "C1").map((x) => x.msg), [
    "The title is not on the cover. KDP checks that the cover matches your book details.",
    "The subtitle is not on the cover. KDP checks that the cover matches your book details.",
    "The pen name is not on the cover. KDP checks that the cover matches your book details."]);
});
