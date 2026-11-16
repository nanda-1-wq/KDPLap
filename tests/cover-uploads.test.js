// deno test --allow-read tests/cover-uploads.test.js   (from the repo root)
// 09 Cover, E16 Part 6: the pure part of uploads (js/cover/image-prep.js E16 rules) and the missing-picture
// check (js/cover/checks.js C15, plan R13). The browser part (readPicture, pdfPage, the panel) runs in the
// mocked cover suite (t-uploads, t-pdf).
import { assert, assertEquals } from "jsr:@std/assert@1";
import "./lib/cover-engine-load.js";

const I = globalThis.kdpCover.imagePrep;
const K = globalThis.kdpCover;

Deno.test("uploadError16: JPG or PNG by kind, 10 MB, 12,000 px a side", () => {
  const ok = { type: "image/jpeg", bytes: 1000, w: 4000, h: 3000 };
  assertEquals(I.uploadError16(ok), null);
  assertEquals(I.uploadError16({ ...ok, type: "image/png" }), null);
  assertEquals(I.uploadError16({ ...ok, type: "image/gif" }), "type");
  assertEquals(I.uploadError16({ ...ok, type: null }), "type");
  assertEquals(I.uploadError16({ ...ok, bytes: 10485760 }), null);
  assertEquals(I.uploadError16({ ...ok, bytes: 10485761 }), "bytes");
  assertEquals(I.uploadError16({ ...ok, bytes: 0 }), "bytes");
  assertEquals(I.uploadError16({ ...ok, w: 12000, h: 12000 }), null);
  assertEquals(I.uploadError16({ ...ok, w: 12001 }), "side");
  assertEquals(I.uploadError16({ ...ok, h: 12001 }), "side");
  assertEquals(I.uploadError16({ ...ok, w: 0 }), "unreadable");
});

Deno.test("every refusal has words; the design's words where it has them", () => {
  for (const k of ["rights", "type", "bytes", "side", "unreadable", "upload", "pdfRights", "pdfType", "pdfBytes", "pdfOpen", "pdfPassword", "pdfPage", "pdfBig", "pdfEngine", "pasteNone", "pasteBlocked"]) assert(I.E16_TEXT[k] && I.E16_TEXT[k].length > 10, k);
  assertEquals(I.E16_TEXT.rights, "Tick the rights box first, then add the picture again.");
  assertEquals(I.E16_TEXT.type, "This file is not a JPG or PNG.");
  assertEquals(I.E16_TEXT.bytes, "This file is over 10 MB. Save it smaller and try again.");
  assertEquals(I.E16_TEXT.pdfBytes, "This PDF is over 25 MB.");
  for (const v of Object.values(I.E16_TEXT)) assert(!/—/.test(v), "no em dash: " + v);
});

Deno.test("fitSide: scaled down to the long side, never up", () => {
  assertEquals(I.fitSide(3000, 2000, 4096), { w: 3000, h: 2000 });
  assertEquals(I.fitSide(12000, 8000, 4096), { w: 4096, h: 2731 });
  assertEquals(I.fitSide(100, 12000, 4096), { w: 34, h: 4096 });
  assertEquals(I.fitSide(4096, 4096, 4096), { w: 4096, h: 4096 });
});

Deno.test("pdfScale: 300 DPI, lower only for 12,000 px a side or 16 MP", () => {
  assertEquals(I.pdfScale(612, 792), { k: 300 / 72, w: 2550, h: 3300, dpi: 300 });
  const a5 = I.pdfScale(420, 595);
  assertEquals([a5.w, a5.h, a5.dpi], [1750, 2479, 300]);
  const tab = I.pdfScale(17 * 72, 11 * 72);
  assert(tab.w * tab.h <= 16000000 && tab.dpi === 292, JSON.stringify(tab));
  const long = I.pdfScale(200 * 72, 10 * 72);
  assert(long.w <= 12000 && long.dpi === 60, JSON.stringify(long));
  // a full 6 x 9 cover PDF (12.372 x 9.25 in) still lands at 300 DPI
  const cov = I.pdfScale(12.372 * 72, 9.25 * 72);
  assertEquals([cov.w, cov.h, cov.dpi], [3711, 2775, 300]);
});

const fmt = { trim: "6x9", pages: 54, paper: "white" };
const pic = (id, asset, o = {}) => Object.assign(K.model.imageLayer(id, { x: 40, y: 380, w: 150, h: 100, natW: 3000, natH: 2000, asset }), o);

Deno.test("C15: a picture removed from Uploads is a Must fix, only with opt.missing", () => {
  const layers = [pic(1, "a-gone"), pic(2, "b-here"), pic(3, null)];
  const cover = { fmt, bg: "#FFFFFF", layers };
  assertEquals(K.checks.run(cover).filter((c) => c.code === "C15"), []);
  const items = K.checks.run(cover, { missing: ["a-gone"] }).filter((c) => c.code === "C15");
  assertEquals(items.length, 1);
  assertEquals(items[0].sev, "error");
  assertEquals(items[0].id, 1);
  assertEquals(items[0].msg, "\"Sample photo (replace it)\" is missing: it was removed from your uploads. Replace it or delete it.");
  // a Set works too; the missing picture gets no DPI item (C10) on top
  const s = K.checks.run(cover, { missing: new Set(["a-gone"]) });
  assertEquals(s.filter((c) => c.id === 1).map((c) => c.code).filter((c) => c === "C10" || c === "C15"), ["C15"]);
  // a hidden or excluded missing picture does not print: no C15
  for (const o of [{ hidden: true }, { noExport: true }]) {
    const c2 = { fmt, bg: "#FFFFFF", layers: [pic(1, "a-gone", o)] };
    assertEquals(K.checks.run(c2, { missing: ["a-gone"] }).filter((c) => c.code === "C15"), [], JSON.stringify(o));
  }
  // a layout's sample (asset null) is never "missing"
  assertEquals(K.checks.run({ fmt, bg: "#FFFFFF", layers: [pic(3, null)] }, { missing: ["a-gone"] }).filter((c) => c.code === "C15"), []);
});
