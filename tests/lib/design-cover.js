// The design oracle for E16 Part 1: runs the design's own logic
// (design/screens/58-09-cover-new.html, the <script type="text/x-dc"> class)
// headless, with a stub for the design canvas's DCLogic base class.
// Used only by tools/cover-golden.mjs (which freezes its answers into
// tests/fixtures/cover-golden.json) and by tests/cover-golden.test.js
// (which checks the frozen file still equals a fresh run). The built code
// (js/cover/*) never reads this.

const HTML = new URL("../../design/screens/58-09-cover-new.html", import.meta.url);

export function loadDesign() {
  const html = Deno.readTextFileSync(HTML);
  const m = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("design script not found");
  class DCLogic {
    constructor() { this.state = {}; }
    setState(p) { Object.assign(this.state, typeof p === "function" ? p(this.state) : p); }
  }
  return new Function("DCLogic", m[1] + "\nreturn Component;")(DCLogic);
}

/** A design instance with a clean state at a size. */
export function designAt(Component, fmt) {
  const c = new Component({});
  c.state.fmt = Object.assign({}, fmt);
  c.state.layers = [];
  c.state.nextId = 1;
  c.state.multi = [];
  c.state.sel = null;
  c.state.bgColor = "#FFFFFF";
  return c;
}

/** The design's text height without a document (bbox() with an empty hmap): characters × 0.52 em per line. */
export function designTextH(l) {
  const PT = 70 / 72;
  const lines = String(l.text).split("\n").reduce((n, t) => n + Math.max(1, Math.ceil(t.length * l.size * PT * 0.52 / l.w)), 0);
  return lines * l.size * PT * 1.15;
}

/** The design's sample book (BOOK texts), used as the fixture book. */
export const DESIGN_BOOK = {
  title: "Micro Study Habits for Busy Adult Learners",
  subtitle: "How to Keep Up With Your Course After Work, Even on Low-Energy Days",
  pen: "Adnan Haroun",
};

export const TRIMS = ["5x8", "5.25x8", "5.5x8.5", "6x9", "8x10", "8.5x11"];
export const PAGES4 = [54, 80, 120, 240];   // the design's demo page counts
export const PAPERS = ["white", "cream"];
