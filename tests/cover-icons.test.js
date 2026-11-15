// deno test --allow-read tests/cover-icons.test.js   (from the repo root)
// 09 Cover, E16 Part 5 (plan §8, owner Q-4): the Tabler filled icons as shape layers.
// The set is pinned (tools/cover-icons.mjs --check rebuilds it from the npm tarball);
// a layer keeps its name and Tabler's own path strings; each path is filled on its own,
// non-zero; arcs become cubics before the stretch, so a stretched icon stays exact.
// tests/browser/cover/t-icons-real.mjs compares every icon with the browser's own SVG
// drawing and compiles icon covers with the real engine.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { K, G6, withCatalog } from "./lib/cover-engine-load.js";
import "../js/cover/icon-set.js";

const S = K.shapes, M = K.model, SET = K.iconSet;
const row = (name) => SET.rows.find((r) => r[0] === name);
const icon = (name, o) => M.shapeLayer(7, Object.assign({}, S.iconDefaults(row(name), K.geo.geo(G6)), o || {}));

Deno.test("the set: Tabler 3.49.0 filled, 1,019 icons, no Brand logos, the plan's examples present", () => {
  assertEquals(SET.version, "3.49.0");
  assertEquals(SET.rows.length, 1019);
  assert(SET.rows.every((r) => r[1] !== "Brand" && !/^brand-/.test(r[0])));
  for (const n of ["crown", "paw", "butterfly", "leaf", "laurel-wreath-1", "star", "heart"]) assert(row(n), n);
  assertEquals(new Set(SET.rows.map((r) => r[0])).size, SET.rows.length);
});

Deno.test("the set: every icon's paths are safe path data within the caps", () => {
  const bad = SET.rows.filter((r) => !S.iconPathsOk(r[3])).map((r) => r[0]);
  assertEquals(bad, []);
  assert(SET.rows.every((r) => /^[a-z0-9-]{1,64}$/.test(r[0])));
});

Deno.test("iconPathsOk: refuses empty, too many, too long, odd characters and broken data", () => {
  const d = row("crown")[3][0];
  assertEquals(S.iconPathsOk([d]), true);
  for (const bad of [[], "M0 0", [""], [d + "<script>"], ["M0 0 L1 1 X"], ["5 5"], Array(17).fill("M0 0h1"), ["M" + "1 ".repeat(2100)], Array(4).fill("M0 0" + " l1 1".repeat(380)), [42]]) {
    assertEquals(S.iconPathsOk(bad), false, JSON.stringify(bad).slice(0, 40));
  }
});

Deno.test("iconPaths: one absolute path per Tabler path, no arcs left, at 24 px the same points", () => {
  for (const r of SET.rows) {
    const l = { kind: "icon", paths: r[3], w: 24, h: 24 };
    const out = S.iconPaths(l);
    assertEquals(out.length, r[3].length, r[0]);
    for (const d of out) assert(!/[AaHhVvSsTtmlcqz]/.test(d), r[0]);
  }
  // A path without arcs keeps its end points exactly (rounded to 0.001 px).
  const d = "M3 4l5 0c1 1 2 2 3 3h2v6z";
  const [a] = S.iconPaths({ kind: "icon", paths: [d], w: 24, h: 24 });
  assertEquals(a, "M3 4 L8 4 C9 5 10 6 11 7 L13 7 L13 13 Z");
});

Deno.test("iconPaths: a stretched icon scales each axis (arcs as cubics first)", () => {
  const base = S.parse(S.iconPaths({ kind: "icon", paths: row("heart")[3], w: 24, h: 24 }).join(" "));
  const wide = S.parse(S.iconPaths({ kind: "icon", paths: row("heart")[3], w: 240, h: 96 }).join(" "));
  assertEquals(wide.length, base.length);
  wide.forEach((s, i) => s.pts.forEach((p, j) => {
    assert(Math.abs(p[0] - base[i].pts[j][0] * 10) < 0.02 && Math.abs(p[1] - base[i].pts[j][1] * 4) < 0.02, `${i}.${j}`);
  }));
});

Deno.test("path(icon) = its paths joined; a bad icon draws nothing", () => {
  const l = icon("paw");
  assertEquals(S.path(l), S.iconPaths(l).join(" "));
  assertEquals(S.path({ kind: "icon", paths: ["M0 0 X"], w: 10, h: 10 }), "");
});

Deno.test("iconDefaults: 120 px square, centered on the front, solid navy, no border; label from the name", () => {
  const g = K.geo.geo(G6), L = S.iconDefaults(row("laurel-wreath-1"), g);
  assertEquals([L.kind, L.icon, L.w, L.h, L.fillMode, L.fill, L.sw], ["icon", "laurel-wreath-1", 120, 120, "solid", "#1F3A5F", 0]);
  assert(Math.abs(L.x + 60 - g.frontCX) < 1e-9 && Math.abs(L.y + 60 - g.H / 2) < 1e-9);
  assertEquals(S.iconLabel("laurel-wreath-1"), "Laurel wreath 1");
  assertEquals(K.names.layerName(icon("laurel-wreath-1")), "Laurel wreath 1");
  assertEquals(K.names.layerName(Object.assign(icon("crown"), { label: "My crown" })), "My crown");
});

Deno.test("normalize: an icon keeps its name and paths; bad data drops the layer, never a rectangle", () => {
  const ok = M.normalizeLayer(icon("crown", { fillMode: "grad", fill2: "#2E5E7E" }));
  assertEquals([ok.kind, ok.icon, ok.paths, ok.fillMode], ["icon", "crown", row("crown")[3], "grad"]);
  assertEquals(M.normalizeLayer(icon("crown", { paths: ["M0 0 X"] })), null);
  assertEquals(M.normalizeLayer(icon("crown", { icon: "Crown!" })), null);
  assertEquals(M.normalizeLayer(icon("crown", { paths: "M0 0h1" })), null);
  // A plain shape drops icon fields it should not carry.
  const r = M.normalizeLayer(Object.assign(M.shapeLayer(3, { x: 1, y: 1, w: 10, h: 10 }), { icon: "crown", paths: ["M0 0h1"] }));
  assertEquals([r.kind, "icon" in r, "paths" in r], ["rect", false, false]);
  const c = M.normalize({ fmt: G6, bg: "#FFFFFF", layers: [icon("star"), icon("x", { paths: [] })] });
  assertEquals(c.layers.map((l) => l.icon), ["star"]);
});

Deno.test("typst: an icon is one non-zero curve per path, no arc, its color; even-odd stays for shapes", () => {
  const l = icon("butterfly", { x: 600, y: 200, w: 140, h: 90, fill: "#7A2E2E", sw: 2, scolor: "#1C1C1A" });
  const c = { fmt: G6, bg: "#FFFFFF", layers: [l, M.shapeLayer(8, { kind: "frame", x: 500, y: 100, w: 200, h: 100 })] };
  const s = withCatalog(() => K.typst.source(c, K.flatten.plan(c)));
  const curves = s.mainTyp.match(/curve\(fill: rgb\("#7A2E2E"\), fill-rule: "non-zero", stroke: \(paint: rgb\("#1C1C1A"\)/g) || [];
  assertEquals(curves.length, row("butterfly")[3].length);
  assert(/fill-rule: "even-odd"/.test(s.mainTyp));
  assert(!/curve\.arc|fill-rule: "nonzero"/.test(s.mainTyp));
});

Deno.test("flatten: a gradient icon is a picture (as a gradient shape); a solid icon stays vector", () => {
  const c = { fmt: G6, bg: "#FFFFFF", layers: [icon("leaf", { id: 1 }), Object.assign(icon("leaf"), { id: 2, fillMode: "grad" })] };
  const p = K.flatten.plan(c);
  const cls = (id) => K.flatten.classify(c.layers.find((l) => l.id === id)).cls;
  assertEquals([cls(1), cls(2)], ["vector", "raster"]);
  assert(p.items.some((it) => it.kind === "patch"));
});

Deno.test("caps: 150 of the longest icon fit the 512 KB layer cap check (fits() reports the bytes)", () => {
  const big = SET.rows.reduce((a, r) => (r[3].join("").length > a[3].join("").length ? r : a));
  const layers = Array.from({ length: 150 }, (_, i) => Object.assign(icon(big[0]), { id: i + 1 }));
  const f = M.fits({ layers });
  assert(f.ok && f.bytes < M.CAPS.bytes, String(f.bytes));
});
