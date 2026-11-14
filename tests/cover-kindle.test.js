// deno test --allow-read tests/cover-kindle.test.js   (from the repo root)
// E16 Part 1: the Kindle front (1600 × 2560) from the print front. Cut at the trim to 1 : 1.6,
// or, for 8 × 10 and 8.5 × 11, scaled to the width with background above and below (kFit).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, near, fk, TRIMS, PAGES4, PAPERS } from "./lib/cover-load.js";

for (const trim of TRIMS) for (const pages of PAGES4) for (const paper of PAPERS) {
  const fmt = { trim, pages, paper };
  Deno.test(`Kindle ${fk(fmt)}: fills 1600 × 2560 from the front only`, () => {
    const g = K.geo.geo(fmt), p = K.kindle.plan(g);
    assertEquals(p.mode, g.kFit ? "fit" : "cut");
    if (p.mode === "cut") {
      near([p.dst.x, p.dst.y, p.dst.w, p.dst.h, p.pad], [0, 0, 1600, 2560, 0]);
      near(p.src, { x: g.kx, y: g.b, w: g.kW, h: g.trimH });
      assert(p.src.x >= g.foldR - 1e-9 && p.src.x + p.src.w <= g.foldR + g.trimW + 1e-9, "inside the front trim");
      near((g.trimW - p.src.w) / 2 / 70, g.kCut);
    } else {
      near(p.src, { x: g.foldR, y: g.b, w: g.trimW, h: g.trimH });
      near([p.dst.x, p.dst.w], [0, 1600]);
      near(p.dst.y * 2 + p.dst.h, 2560);
      assert(p.pad > 0, "background above and below");
    }
    near(p.src.w * p.scale, p.dst.w); near(p.src.h * p.scale, p.dst.h);
  });
}

Deno.test("Kindle: 6 × 9 cuts 0.1875 in from each side; 5 × 8 is already 1 : 1.6; 8.5 × 11 adds 245 px above and below", () => {
  near(K.geo.geo({ trim: "6x9", pages: 54, paper: "white" }).kCut, 0.1875);
  assertEquals(K.kindle.plan(K.geo.geo({ trim: "5x8", pages: 54, paper: "white" })).src.w, 350);
  const p = K.kindle.plan(K.geo.geo({ trim: "8.5x11", pages: 54, paper: "white" }));
  near(p.pad, (2560 - 770 * 1600 / 595) / 2);
  assertEquals(Math.round(p.pad), 245);
});

Deno.test("Kindle plan into any box (the preview 200 × 320, the thumbnail 75 × 120)", () => {
  const g = K.geo.geo({ trim: "6x9", pages: 54, paper: "white" });
  near(K.kindle.plan(g, { w: 200, h: 320 }).dst, { x: 0, y: 0, w: 200, h: 320 });
  const f = K.geo.geo({ trim: "8x10", pages: 54, paper: "white" });
  near(K.kindle.plan(f, { w: 75, h: 120 }).dst.w, 75);
  assertEquals(K.kindle.SIZE, { w: 1600, h: 2560 });
});
