// deno test --allow-read tests/cover-image-prep.test.js   (from the repo root)
// 09 Cover, E16 Part 2: the picture helpers copied from E15 (js/cover/image-prep.js; owner Q-1).
// The E15 tests of the pure part, unchanged (tests/cover-image.test.js at e15-archive): the kind and
// the pixel size of a file come from its bytes (never its name); the color rule of the JPEGs we make
// (jpegColor, E15 plan §19) on hand-made profiles; luminance. The E15 dark-layer test is gone (E16 has
// no dark layer: darken is per picture, drawn by js/cover/render.js). prepare() runs in the browser.
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import "./lib/cover-engine-load.js";

const I = globalThis.kdpCover.imagePrep;
const P = globalThis.kdpCover.palettes;

const be16 = (n) => [(n >> 8) & 255, n & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const seg = (marker, body) => [0xff, marker, ...be16(body.length + 2), ...body];
/** A JPEG header: SOI, optional segments, a frame (SOF marker) of w x h with n channels. */
const jpeg = (w, h, { sof = 0xc0, before = [], channels = 3 } = {}) => new Uint8Array([
  0xff, 0xd8, ...before, ...seg(sof, [8, ...be16(h), ...be16(w), channels, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]), 0xff, 0xda, 0, 2, 0xff, 0xd9
]);
const chunk = (name, body) => [...be32(body.length), ...[...name].map((c) => c.charCodeAt(0)), ...body, 0, 0, 0, 0];
const png = (w, h, colorType, extra = []) => new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [...be32(w), ...be32(h), 8, colorType, 0, 0, 0]), ...extra, ...chunk("IDAT", [0]), ...chunk("IEND", [])
]);

Deno.test("sniff: a baseline and a progressive JPEG give the kind and the pixel size", () => {
  assertEquals(I.sniff(jpeg(1838, 2775)), { type: "image/jpeg", w: 1838, h: 2775, alpha: false });
  assertEquals(I.sniff(jpeg(1200, 1800, { sof: 0xc2 })), { type: "image/jpeg", w: 1200, h: 1800, alpha: false });
  // A CMYK JPEG (4 channels) is still a JPEG: the canvas makes it RGB.
  assertEquals(I.sniff(jpeg(600, 900, { channels: 4 })).type, "image/jpeg");
});

Deno.test("sniff: EXIF, JFIF, a table and fill bytes before the frame are skipped", () => {
  const app0 = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exif = seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...Array(300).fill(0xc0)]);   // bytes that look like a frame marker, inside EXIF
  const dht = seg(0xc4, Array(20).fill(1));
  assertEquals(I.sniff(jpeg(4000, 6000, { before: [...app0, ...exif, 0xff, ...dht] })), { type: "image/jpeg", w: 4000, h: 6000, alpha: false });
});

Deno.test("sniff: a PNG gives its size and whether it can hold transparency", () => {
  assertEquals(I.sniff(png(1838, 2775, 2)), { type: "image/png", w: 1838, h: 2775, alpha: false });   // RGB
  assertEquals(I.sniff(png(800, 1200, 6)).alpha, true);                                                // RGBA
  assertEquals(I.sniff(png(800, 1200, 4)).alpha, true);                                                // gray + alpha
  assertEquals(I.sniff(png(800, 1200, 3)).alpha, false);                                               // palette
  assertEquals(I.sniff(png(800, 1200, 3, chunk("tRNS", [0, 255]))).alpha, true);                       // palette with tRNS
  assertEquals(I.sniff(png(70000, 70000, 2)).w, 70000);                                                // 32-bit sizes
});

Deno.test("sniff: the name does not count; other files and cut files have no kind or no size", () => {
  const none = { type: null, w: 0, h: 0, alpha: false };
  assertEquals(I.sniff(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), none);
  assertEquals(I.sniff(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0])), none);       // GIF
  assertEquals(I.sniff(new TextEncoder().encode("RIFF....WEBPVP8 ")), none);                           // WebP
  assertEquals(I.sniff(new Uint8Array(0)), none);
  assertEquals(I.sniff(null), none);
  // A JPEG cut before its frame: a JPEG with no size (refused as unreadable).
  assertEquals(I.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0])), { type: "image/jpeg", w: 0, h: 0, alpha: false });
  assertEquals(I.sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(20).fill(0)])), { type: "image/png", w: 0, h: 0, alpha: false });
  // With the upload rule: each is refused with its own reason.
  const why = (bytes, size) => { const s = I.sniff(bytes); return I.E15.uploadError({ type: s.type, bytes: size, w: s.w, h: s.h }); };
  assertEquals(why(new TextEncoder().encode("<svg/>"), 100), "type");
  assertEquals(why(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), 100), "unreadable");
  assertEquals(why(jpeg(8000, 5001), 100), "pixels");
  assertEquals(why(jpeg(1838, 2775), 26 * 1024 * 1024), "bytes");
  assertEquals(why(jpeg(1838, 2775), 100), null);
});

/* ── jpegColor (owner, Nov 11, plan §19) ── */

const asc = (t) => [...t].map((c) => c.charCodeAt(0));
const u16be = (t) => [...t].flatMap((c) => be16(c.charCodeAt(0)));
/** A small ICC profile: the header (color space, version, 'acsp') and one 'desc' tag of type mluc (v4), desc (v2) or text. */
function icc({ space = "RGB ", desc = "sRGB", type = "mluc", version = [4, 0x30], acsp = true, tags = true } = {}) {
  const body = type === "mluc" ? [...asc("mluc"), 0, 0, 0, 0, ...be32(1), ...be32(12), ...asc("enUS"), ...be32(desc.length * 2), ...be32(28), ...u16be(desc)]
    : type === "desc" ? [...asc("desc"), 0, 0, 0, 0, ...be32(desc.length + 1), ...asc(desc), 0, ...Array(78).fill(0)]
    : [...asc("text"), 0, 0, 0, 0, ...asc(desc), 0];
  const head = Array(128).fill(0);
  const total = 128 + 4 + 12 + body.length;
  head.splice(0, 4, ...be32(total));
  head[8] = version[0]; head[9] = version[1];
  head.splice(12, 4, ...asc("mntr"));
  head.splice(16, 4, ...asc(space));
  head.splice(20, 4, ...asc("XYZ "));
  if (acsp) head.splice(36, 4, ...asc("acsp"));
  return tags ? [...head, ...be32(1), ...asc("desc"), ...be32(144), ...be32(body.length), ...body] : [...head, ...be32(0)];
}
/** APP2 "ICC_PROFILE" segments: the profile in n chunks; order: the sequence numbers in the file's order. */
const app2 = (profile, n = 1, order = null) => {
  const size = Math.ceil(profile.length / n);
  const chunks = Array.from({ length: n }, (_, k) => seg(0xe2, [...asc("ICC_PROFILE"), 0, k + 1, n, ...profile.slice(k * size, (k + 1) * size)]));
  return (order || chunks.map((_, k) => k)).flatMap((k) => chunks[k]);
};
const adobe = seg(0xee, [...asc("Adobe"), 0, 100, 0, 0, 0, 0, 2]);
const color = (opts) => { const c = I.jpegColor(jpeg(64, 96, opts)); return [c.ok, c.why]; };

Deno.test("jpegColor: no profile, or an sRGB profile (Chrome's v4 mluc, a v2 desc, a text tag), passes", () => {
  assertEquals(I.jpegColor(jpeg(64, 96)), { ok: true, why: null, channels: 3, adobe: false, icc: null });
  // Chrome 157's canvas writes ICC v4.3, color space RGB, description "sRGB" (an mluc tag).
  const chrome = I.jpegColor(jpeg(64, 96, { before: app2(icc()) }));
  assertEquals([chrome.ok, chrome.why, chrome.icc.space, chrome.icc.desc, chrome.icc.version], [true, null, "RGB", "sRGB", "4.3"]);
  const hp = I.jpegColor(jpeg(64, 96, { before: app2(icc({ type: "desc", desc: "sRGB IEC61966-2.1", version: [2, 0x10] })) }));
  assertEquals([hp.ok, hp.icc.desc, hp.icc.version], [true, "sRGB IEC61966-2.1", "2.1"]);
  assertEquals(color({ before: app2(icc({ type: "text", desc: "sRGB built-in" })) }), [true, null]);
  // Real sRGB profile names with a digit or an underscore after "sRGB" (ICC's sRGB2014, the v4 preference profile).
  assertEquals(color({ before: app2(icc({ desc: "sRGB2014" })) }), [true, null]);
  assertEquals(color({ before: app2(icc({ desc: "sRGB_v4_ICC_preference" })) }), [true, null]);
  assertEquals(color({ before: app2(icc({ type: "desc", desc: "Apple sRGB" })) }), [true, null]);
  // A profile split over three APP2 chunks, in the file out of order: joined by sequence number.
  const split = I.jpegColor(jpeg(64, 96, { before: app2(icc({ type: "desc", desc: "sRGB IEC61966-2.1" }), 3, [2, 0, 1]) }));
  assertEquals([split.ok, split.icc.desc, split.icc.bytes], [true, "sRGB IEC61966-2.1", icc({ type: "desc", desc: "sRGB IEC61966-2.1" }).length]);
  // A JFIF segment and a progressive frame change nothing.
  assertEquals(color({ sof: 0xc2, before: [...seg(0xe0, [...asc("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...app2(icc())] }), [true, null]);
});

Deno.test("jpegColor: gray, CMYK, an Adobe marker and any other profile fail, each with its reason", () => {
  assertEquals(color({ channels: 1 }), [false, "gray"]);
  assertEquals(color({ channels: 1, before: app2(icc({ space: "GRAY", desc: "Generic Gray Gamma 2.2 Profile", type: "desc" })) }), [false, "gray"]);
  assertEquals(color({ channels: 4 }), [false, "cmyk"]);
  assertEquals(color({ channels: 4, before: [...adobe, ...app2(icc({ space: "CMYK", desc: "Generic CMYK Profile", type: "desc" }))] }), [false, "cmyk"]);
  assertEquals(color({ channels: 2 }), [false, "channels"]);
  assertEquals(color({ before: adobe }), [false, "adobe"]);
  // Other RGB profiles: the description decides (the color space RGB alone is not enough).
  assertEquals(color({ before: app2(icc({ desc: "Display P3" })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ type: "desc", desc: "Adobe RGB (1998)", version: [2, 0x10] })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ desc: "scRGB" })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ desc: "e-sRGB" })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ desc: "NotsRGB" })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ desc: "ProPhoto RGB" })) }), [false, "profile"]);
  // Named sRGB but not an RGB profile, or a profile we cannot read: fails.
  assertEquals(color({ before: app2(icc({ space: "CMYK" })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ tags: false })) }), [false, "profile"]);
  assertEquals(color({ before: app2(icc({ acsp: false })) }), [false, "profile"]);
  assertEquals(color({ before: seg(0xe2, [...asc("ICC_PROFILE"), 0, 1, 1, 1, 2, 3]) }), [false, "profile"]);
  // An APP2 that is not a profile (for example MPF) is not a profile.
  assertEquals(color({ before: seg(0xe2, [...asc("MPF"), 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) }), [true, null]);
});

Deno.test("jpegColor: not a JPEG, or a JPEG cut before its frame, is unreadable", () => {
  for (const bytes of [new Uint8Array(0), null, png(10, 10, 2), new TextEncoder().encode("not a picture"), new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0])]) {
    const c = I.jpegColor(bytes);
    assertEquals([c.ok, c.why], [false, "unreadable"]);
  }
});

Deno.test("luma: the same relative luminance as the 09 palettes (contrast check)", () => {
  for (const hex of ["#000000", "#FFFFFF", "#1F3A5F", "#F2C14E", "#8C9A8E"]) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assertAlmostEquals(I.luma(r, g, b), P.lum(hex), 1e-9);
  }
});

Deno.test("every refusal has a message, in plain words with no dash", () => {
  for (const k of ["type", "bytes", "pixels", "unreadable", "too_big", "kindle_small", "upload"]) {
    assert(typeof I.ERROR_TEXT[k] === "string" && I.ERROR_TEXT[k].length > 10 && !/[—–]/.test(I.ERROR_TEXT[k]), k);
  }
});

Deno.test("prepare keeps E15's limits until Part 6 (25 MB, 40 MP, 4,096 px stored, JPEG 0.92, 10 MB)", () => {
  assertEquals(I.E15.UPLOAD, { types: ["image/jpeg", "image/png"], maxBytes: 25 * 1024 * 1024, maxPixels: 40e6, maxSide: 4096, quality: 0.92, storeBytes: 10485760 });
  assertEquals(I.E15.storedPx({ w: 6000, h: 4000 }), { w: 4096, h: 2731, scaled: true });
  assertEquals(I.E15.uploadError({ type: "image/gif", bytes: 10, w: 1, h: 1 }), "type");
  assertEquals(I.E15.uploadError({ type: "image/png", bytes: 10, w: 8000, h: 6000 }), "pixels");
});
