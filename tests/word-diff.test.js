// deno test tests/word-diff.test.js   (from the repo root)
// Compare versions (js/word-diff.js, design 23).
import { assert, assertEquals } from "jsr:@std/assert@1";
import "../js/word-diff.js";

const D = globalThis.kdpWordDiff;
const side = (parts, op) => parts.filter((p) => p.op === "same" || p.op === op).map((p) => (op === "del" && p.op === "same" && p.old !== undefined ? p.old : p.text)).join("");
const show = (parts) => parts.map((p) => (p.op === "same" ? p.text : p.op === "del" ? `[-${p.text}-]` : `{+${p.text}+}`)).join("");

// Design 23: v2 Expanded → v3 Humanized.
const V2 = "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. This gentle yet powerful movement serves as a wonderful foundation for Keep your neck long and your chin level.";
const V3 = "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this five times. Keep your neck long and your chin level.";

Deno.test("design 23: removed and added words", () => {
  const parts = D.diff(V2, V3);
  assertEquals(show(parts),
    "Now lift your shoulders up toward your ears, then roll them back and down in a slow circle. " +
    "[-This gentle yet powerful movement serves as a wonderful foundation for -]{+Do this five times. +}" +
    "Keep your neck long and your chin level.");
});

Deno.test("each side comes back exactly", () => {
  const a = "## Title\n\nOne two three.\n\n- four\n- five\n";
  const b = "## Title\n\nOne 2 three, and more.\n\n- four\n";
  const parts = D.diff(a, b);
  assertEquals(side(parts, "del"), a);
  assertEquals(side(parts, "add"), b);
});

Deno.test("design 23 compare: a word that only gains a space after it is not a change", () => {
  const a = "Keep your chin level.";
  const b = "Keep your chin level. If anything pinches, make the circle smaller.";
  assertEquals(show(D.diff(a, b)), "Keep your chin level. {+If anything pinches, make the circle smaller.+}");
  assertEquals(side(D.diff(a, b), "del"), a);
  assertEquals(side(D.diff(a, b), "add"), b);
});

Deno.test("same text, empty sides", () => {
  assertEquals(D.diff(V3, V3), [{ op: "same", text: V3 }]);
  assertEquals(D.diff("", V3), [{ op: "add", text: V3 }]);
  assertEquals(D.diff(V3, ""), [{ op: "del", text: V3 }]);
  assertEquals(D.diff("", ""), []);
});

Deno.test("a long section (10,000 words a side) stays fast and exact", () => {
  const para = (i) => `Paragraph ${i}: lift your shoulders up toward your ears, then roll them back and down in a slow circle. Keep your neck long.\n\n`;
  const a = Array.from({ length: 450 }, (_, i) => para(i)).join("");
  const b = Array.from({ length: 450 }, (_, i) => (i % 7 ? para(i) : para(i).replace("slow", "gentle"))).join("").replace("Paragraph 0:", "Start:");
  assert(a.split(/\s+/).length > 9000);
  const t0 = performance.now();
  const parts = D.diff(a, b);
  const ms = performance.now() - t0;
  assertEquals(side(parts, "del"), a);
  assertEquals(side(parts, "add"), b);
  assert(ms < 1500, `took ${ms} ms`);
  assert(parts.some((p) => p.op === "add" && p.text.includes("gentle")));
});
