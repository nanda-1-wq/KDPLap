// deno test --allow-read tests/cover-names.test.js   (from the repo root)
// E16 Part 1: file names (plan §5: <title-slug>_<trim>_<pages>p_<paper>_cover.pdf|png|jpg and _kindle.jpg).
// The design hardcodes "micro-study-habits" (plan X14); the build makes the slug from the real title, as 08 does.
import { assertEquals } from "jsr:@std/assert@1";
import { K, DESIGN_BOOK } from "./lib/cover-load.js";

Deno.test("file names from the title and the size", () => {
  assertEquals(K.names.files(DESIGN_BOOK.title, { trim: "6x9", pages: 54, paper: "white" }), {
    base: "micro-study-habits-for-busy-adult-learners_6x9_54p_white",
    pdf: "micro-study-habits-for-busy-adult-learners_6x9_54p_white_cover.pdf",
    png: "micro-study-habits-for-busy-adult-learners_6x9_54p_white_cover.png",
    jpg: "micro-study-habits-for-busy-adult-learners_6x9_54p_white_cover.jpg",
    kindle: "micro-study-habits-for-busy-adult-learners_6x9_54p_white_kindle.jpg"
  });
  assertEquals(K.names.files("Chair Yoga", { trim: "8.5x11", pages: 120, paper: "cream" }).pdf, "chair-yoga_8.5x11_120p_cream_cover.pdf");
});

Deno.test("the slug matches 08's rule (accents dropped, 80 characters, never empty)", () => {
  assertEquals(K.names.slug("Café Crème: Ünïcode!"), "cafe-creme-unicode");
  assertEquals(K.names.slug("   "), "book");
  assertEquals(K.names.slug(null), "book");
  assertEquals(K.names.slug("a".repeat(79) + " b"), "a".repeat(79));
  const fr = globalThis.kdpFormatRules.fileName("Café Crème: Ünïcode!", "6x9");
  assertEquals(fr, K.names.slug("Café Crème: Ünïcode!") + "-print-6x9.pdf");
});

Deno.test("file names use the safe size (an unknown trim is 6 × 9)", () => {
  assertEquals(K.names.files("T", { trim: "9x12", pages: 54.4, paper: "x" }).base, "t_6x9_54p_white");
});
