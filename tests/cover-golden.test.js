// deno test --allow-read tests/cover-golden.test.js   (from the repo root)
// E16 Part 1: the frozen design answers (tests/fixtures/cover-golden.json) still equal a fresh
// run of the design's own logic (design/screens/58-09-cover-new.html). If the design file
// changes, this fails: re-run tools/cover-golden.mjs and review the diff.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildGolden, serialize } from "../tools/cover-golden.mjs";

Deno.test("cover-golden.json equals a fresh run of the design", () => {
  const fresh = serialize(buildGolden());
  const file = Deno.readTextFileSync(new URL("./fixtures/cover-golden.json", import.meta.url));
  assertEquals(file.trim(), fresh.trim());
});

Deno.test("the fixture holds the planned cases: 48 sizes, 288 layouts, 24 Blank, 144 remaps", () => {
  const g = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/cover-golden.json", import.meta.url)));
  assertEquals([g.geo.length, g.layouts.length, g.blank.length, g.remap.length], [48, 288, 24, 144]);
  assert(g.shapes.length >= 27 * 3);
  assertEquals(new Set(g.layouts.map((c) => c.key)).size, 12);
});
