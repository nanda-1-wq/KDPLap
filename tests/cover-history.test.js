// deno test --allow-read tests/cover-history.test.js   (from the repo root)
// E16 Part 1: undo and redo. A scripted sequence with a fake clock gives the design's stack sizes
// and states step for step; then the rules one by one (50 steps, the sliding 0.5 s window, a drag
// is one step, a new change clears redo, a size change resets).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, GOLDEN, DESIGN_BOOK, G6 } from "./lib/cover-load.js";

const H = () => K.history;

Deno.test("the design's scripted sequence: stack sizes, layers and title place equal step for step", () => {
  let t = 1000;
  const h = H().create({ now: () => t });
  const b = K.layouts.build("band", DESIGN_BOOK, G6, 1);
  let st = { layers: b.layers, bg: b.bg }, act = null;
  const set = (patch) => { h.change(st, act); st = Object.assign({}, st, patch); };
  const title = () => st.layers.find((l) => l.src === "title");
  const move = (y) => set({ layers: st.layers.map((l) => (l.src === "title" ? Object.assign({}, l, { y }) : l)) });
  const undo = () => { const v = h.undo(st); if (v) st = v; };
  const redo = () => { const v = h.redo(st); if (v) st = v; };
  const log = [];
  const step = (name, fn) => { fn(); const s = h.size(); log.push({ name, past: s.past, future: s.future, ids: st.layers.map((l) => l.id), bg: st.bg, titleY: title() ? title().y : null }); };
  step("move title", () => { t += 1000; move(200); });
  step("move again within 0.5 s", () => { t += 300; move(210); });
  step("sliding window", () => { t += 400; move(220); });
  step("bg after 0.6 s", () => { t += 600; set({ bg: "#FFFFFF" }); });
  step("drag start", () => { t += 1000; act = { pushed: false }; move(230); });
  step("drag after 0.7 s", () => { t += 700; move(240); });
  step("drag end + delete", () => { act = null; t += 1000; set({ layers: st.layers.filter((l) => l.src !== "pen") }); });
  step("undo", undo);
  step("undo", undo);
  step("redo", redo);
  step("new change clears redo", () => { t += 1000; move(300); });
  step("undo all", () => { for (let i = 0; i < 10; i++) undo(); });
  for (let i = 0; i < 55; i++) { t += 1000; move(400 + i); }
  step("after 55 more changes", () => {});
  assertEquals(log.length, GOLDEN.history.length);
  log.forEach((x, i) => assertEquals(x, GOLDEN.history[i], x.name));
});

Deno.test("at most 50 steps back", () => {
  let t = 0; const h = H().create({ now: () => (t += 1000) });
  for (let i = 0; i < 60; i++) h.change({ layers: [i], bg: "#FFFFFF" });
  assertEquals(h.size().past, 50);
  let last; for (let i = 0; i < 60; i++) { const v = h.undo({ layers: [], bg: "" }); if (v) last = v; }
  assertEquals(last.layers, [10]);
});

Deno.test("changes within 0.5 s of the last change are one step (the window slides)", () => {
  let t = 1000; const h = H().create({ now: () => t });
  h.change({ layers: [0], bg: "a" });
  for (let i = 0; i < 20; i++) { t += 400; h.change({ layers: [i + 1], bg: "a" }); }
  assertEquals(h.size().past, 1);
  t += 501; h.change({ layers: [99], bg: "a" });
  assertEquals(h.size().past, 2);
});

Deno.test("a drag that has pushed once does not push again, even after a pause", () => {
  let t = 1000; const h = H().create({ now: () => t }); const act = { pushed: false };
  h.change({ layers: [1], bg: "a" }, act); t += 2000; h.change({ layers: [2], bg: "a" }, act);
  assertEquals([h.size().past, act.pushed], [1, true]);
});

Deno.test("undo then redo returns the same objects; a new change clears redo; reset empties both", () => {
  let t = 1000; const h = H().create({ now: () => (t += 1000) });
  const a = { layers: ["a"], bg: "#111111" }, b = { layers: ["b"], bg: "#222222" };
  h.change(a);
  const back = h.undo(b);
  assertEquals(back, a);
  assertEquals(h.redo(a), b);
  assert(h.canUndo());
  h.undo(b); h.change(a);
  assertEquals(h.canRedo(), false);
  h.reset();
  assertEquals(h.size(), { past: 0, future: 0 });
  assertEquals(h.undo(a), null);
  assertEquals(h.redo(a), null);
});

Deno.test("undo keeps the selection only for layers that still exist (design restore)", () => {
  assertEquals(H().keepSelection({ layers: [{ id: 1 }, { id: 2 }] }, 2, [1, 3]), { sel: 2, multi: [1] });
  assertEquals(H().keepSelection({ layers: [{ id: 1 }] }, 5, null), { sel: null, multi: [] });
});

Deno.test("history keeps { layers, bg } only", () => {
  let t = 0; const h = H().create({ now: () => (t += 1000) });
  h.change({ layers: [], bg: "#FFFFFF", fmt: "x", sel: 3 });
  assertEquals(Object.keys(h.undo({ layers: [], bg: "" })), ["layers", "bg"]);
});
