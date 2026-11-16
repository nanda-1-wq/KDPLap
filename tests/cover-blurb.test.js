// deno test --allow-read tests/cover-blurb.test.js   (from the repo root)
// E16 Part 8: the pure rules of the back blurb dialog (js/cover/blurb.js) and the other Part 8 rules with no DOM:
// the word count, the fit note (design F68 thresholds; too long is a warning, plan D4), the words KDP may not accept
// as whole words (plan D3), Verify: no source for the server's numbers still in the draft (plan D8), the error
// words; history.step (a layout, a palette, a blurb are each one Undo step); C16, a layout's sample photo (STOP 6
// N2 rec, only with opt.samples); the ready layouts with this book's words (Stack's full title, plan D15).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, DESIGN_BOOK, G6 } from "./lib/cover-load.js";

const B = () => K.blurb;

Deno.test("blurb: lengths, tones and the 0029 cap", () => {
  assertEquals(B().LENGTHS.map((x) => x.join("|")), ["short|Short|about 80 words", "medium|Medium|about 130 words", "long|Long|about 180 words"]);
  assertEquals(B().TONES.map((x) => x[0]), ["warm", "direct", "expert"]);
  assertEquals([B().MAX_CHARS, B().FIT.at11, B().FIT.at10], [1500, 1100, 1500]);
});

Deno.test("blurb: word count splits on spaces, as the design", () => {
  assertEquals([B().words(""), B().words("  "), B().words("One two\n\nthree"), B().words(" five-minute reviews ")], [0, 0, 3, 2]);
});

Deno.test("blurb: the fit note (design F68: under 1,100 at 11 pt, under 1,500 at 10 pt, else too long)", () => {
  assertEquals(B().fit(""), { key: "", text: "" });
  assertEquals(B().fit("   "), { key: "", text: "" });
  assertEquals(B().fit("a".repeat(1099)), { key: "at11", text: "Fits the back cover at 11 pt, above the barcode." });
  assertEquals(B().fit("a".repeat(1100)).key, "at10");
  assertEquals(B().fit("a".repeat(1499)), { key: "at10", text: "Fits at 10 pt. Shorter reads better." });
  assertEquals(B().fit("a".repeat(1500)), { key: "long", text: "Too long for the back cover. Cut it down." });
  // Measured on the trimmed text (what is saved).
  assertEquals(B().fit("  " + "a".repeat(1098) + "  ").key, "at11");
});

Deno.test("blurb: the words KDP may not accept, as whole words (D3), each once, in the design's order", () => {
  const w = (t) => B().flags(t).map((x) => x.word);
  assertEquals(w("A secure, procured plan for Amazonian frogs."), []);
  assertEquals(w("Guaranteed. It cures. Best-selling, bestsellers, #1, Amazon's store, guarantee again."), ["guarantee", "cure", "best-selling", "bestseller", "#1", "amazon"]);
  assertEquals(w("Room #12 and #10, not a ranking."), []);
  assertEquals(w("(#1)"), ["#1"]);
  assertEquals(w("##1 is a heading mark"), []);
  assertEquals(B().flags("cure").map((x) => x.text), ["\"cure\" is a health claim."]);
  assertEquals(B().flags("guarantee").map((x) => x.text), ["\"guarantee\" promises a result."]);
});

Deno.test("blurb: Verify lists the server's numbers only while they are in the draft (D8)", () => {
  assertEquals(B().verify("About 72% quit.", ["72"]), ["72"]);
  assertEquals(B().verify("About half quit.", ["72"]), []);
  assertEquals(B().verify("5,000 readers", ["5000"]), ["5000"]);
  assertEquals(B().verify("Nearly 7 out of 10 quit.", ["7 in 10"]), ["7 in 10"]);
  assertEquals(B().verify("172 pages and 720 days", ["72"]), []);   // never inside another number
  assertEquals(B().verify("anything", undefined), []);
});

Deno.test("blurb: the error words (nothing counted where nothing was counted)", () => {
  assertEquals(B().errorText({ code: "ai_unavailable" }), "The AI did not answer this time. Nothing was counted in your usage. Try again in a moment.");
  assertEquals(B().errorText({ code: "ai_stopped" }), B().errorText({ code: "ai_unavailable" }));
  assertEquals(B().errorText({ code: "not_enough_facts", missing: "bio" }), "This pen name has no bio yet. Add one in Pen Names, or turn off the author line. Nothing was counted in your usage.");
  assertEquals(B().errorText({ code: "not_enough_facts", missing: "title" }), "This book has no title yet. Add it in 04 Title first. Nothing was counted in your usage.");
  assertEquals(B().errorText({ code: "positioning_not_locked" }), "Lock your Positioning in 03 first: the blurb uses its reader and promise. Nothing was counted in your usage.");
  assertEquals(B().errorText({}), B().errorText({ code: "ai_unavailable" }));
});

Deno.test("history.step: the next change is its own step, even within 0.5 s", () => {
  let t = 1000;
  const h = K.history.create({ now: () => t });
  const s = (n) => ({ layers: [{ id: n }], bg: "#FFFFFF" });
  h.change(s(1), null); t += 100;
  h.change(s(2), null);                  // merged into the first step
  assertEquals(h.size().past, 1);
  t += 100; h.step(); h.change(s(3), null);   // a layout: its own step
  t += 100; h.step(); h.change(s(4), null);   // the change right after it: its own step too
  assertEquals(h.size().past, 3);
  assertEquals(h.undo(s(5)).layers[0].id, 4);
});

Deno.test("C16: a layout's sample photo is a Must fix, only with opt.samples (STOP 6 N2 rec)", () => {
  for (const key of ["picfull", "picband", "arch"]) {
    const b = K.layouts.build(key, DESIGN_BOOK, G6, 1);
    const cover = { fmt: G6, bg: b.bg, layers: b.layers };
    assertEquals(K.checks.run(cover).filter((c) => c.code === "C16"), [], key);
    const items = K.checks.run(cover, { samples: true }).filter((c) => c.code === "C16");
    assertEquals(items.map((c) => [c.sev, c.msg]), [["error", "\"Sample photo (replace it)\" is a sample. Replace it with your own picture, or delete it."]], key);
    assertEquals(K.checks.summary(K.checks.run(cover, { samples: true })).errors, 1, key);
  }
  // A picture with an asset, a hidden or an excluded sample: no C16.
  const b = K.layouts.build("picfull", DESIGN_BOOK, G6, 1);
  const img = b.layers.find((l) => l.type === "image");
  const run = (patch) => K.checks.run({ fmt: G6, bg: b.bg, layers: b.layers.map((l) => (l === img ? Object.assign({}, l, patch) : l)) }, { samples: true }).filter((c) => c.code === "C16").length;
  assertEquals([run({ asset: "a1" }), run({ hidden: true }), run({ noExport: true })], [0, 0, 0]);
  // C16 comes before the DPI rule for the same layer (a sample has no real size).
  const order = K.checks.run({ fmt: G6, bg: b.bg, layers: b.layers }, { samples: true }).filter((c) => c.id === img.id).map((c) => c.code);
  assertEquals(order, ["C16"]);
});

Deno.test("ready layouts with this book's words: Stack and Bold show the full title (D15)", () => {
  const book = { title: "Micro Study Habits for Busy Adult Learners", subtitle: "How to Keep Up", pen: "Adnan Haroun" };
  const st = K.layouts.build("stack", book, G6, 1);
  assertEquals(st.layers.find((l) => l.src === "title").text, "MICRO\nSTUDY\nHABITS");
  assertEquals([st.layers.find((l) => l.src === "titlerest").text, st.layers.find((l) => l.src === "subtitle").text], ["for Busy Adult Learners", "How to Keep Up"]);
  const bo = K.layouts.build("bold", { ...book, title: "Sleep Well" }, G6, 1);
  assertEquals([bo.layers.find((l) => l.src === "title").text, bo.layers.find((l) => l.src === "subtitle").text, bo.layers.some((l) => l.src === "titlerest")], ["SLEEP WELL", "How to Keep Up", false]);
  // A blurb from the book replaces the placeholder in every layout.
  for (const key of K.layouts.KEYS.filter((k) => k !== "blank")) {
    assertEquals(K.layouts.build(key, book, G6, 1, "Real words.").layers.find((l) => l.src === "blurb").text, "Real words.", key);
    assertEquals(K.layouts.build(key, book, G6, 1, null).layers.find((l) => l.src === "blurb").text, K.layouts.BLURB_PLACEHOLDER, key);
  }
});
