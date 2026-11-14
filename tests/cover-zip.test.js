// deno test --allow-read tests/cover-zip.test.js   (from the repo root)
// 09 Cover, E16 Part 2: the store-only zip writer and CRC-32 (js/cover/zip.js, plan §5 "Download all").
// Read back with a small reader here (central directory, CRC checked) and compared byte by byte.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { K } from "./lib/cover-engine-load.js";
const Z = K.zip, enc = new TextEncoder();

/** A reader for stored entries, from the central directory: name → bytes (CRC checked). */
function unzip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength), dec = new TextDecoder();
  const end = z.length - 22;
  assertEquals(dv.getUint32(end, true), 0x06054b50);
  const n = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out = {};
  for (let i = 0; i < n; i++) {
    assertEquals(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(z.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), data = z.subarray(off + 30 + lnl, off + 30 + lnl + size);
    assertEquals(Z.crc32(data), crc, name);
    out[name] = data;
    p += 46 + nl;
  }
  return out;
}


Deno.test("crc32: the standard check values", () => {
  assertEquals(Z.crc32(enc.encode("123456789")), 0xcbf43926);
  assertEquals(Z.crc32(new Uint8Array(0)), 0);
  assertEquals(Z.crc32(enc.encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
  const a = enc.encode("12345"), b = enc.encode("6789");
  assertEquals(Z.crc32(b, Z.crc32(a)), 0xcbf43926);   // carried on across parts
});

Deno.test("make: three cover files read back with names, sizes and bytes; stored, UTF-8 names", async () => {
  const pdf = enc.encode("%PDF-1.7 cover"), png = new Uint8Array(5000).map((_, i) => i % 251), jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const files = [{ name: "micro-study-habits_6x9_54p_white_cover.pdf", bytes: pdf }, { name: "micro-study-habits_6x9_54p_white_cover.png", bytes: png }, { name: "café_kindle.jpg", bytes: jpg }];
  const z = Z.make(files, new Date(2026, 10, 14, 9, 30, 10));
  const back = unzip(z);
  assertEquals(Object.keys(back).sort(), files.map((f) => f.name).sort());
  for (const f of files) assertEquals(back[f.name], f.bytes);
  const dv = new DataView(z.buffer);
  assertEquals(dv.getUint32(0, true), 0x04034b50);
  assertEquals(dv.getUint16(6, true), 0x0800);                 // UTF-8 names
  assertEquals(dv.getUint16(8, true), 0);                      // stored
  assertEquals(dv.getUint16(12, true), ((2026 - 1980) << 9) | (11 << 5) | 14);
  assertEquals(dv.getUint16(10, true), (9 << 11) | (30 << 5) | 5);
  assertEquals(z.length, files.reduce((n, f) => n + 30 + 46 + 2 * enc.encode(f.name).length + f.bytes.length, 22));
});

Deno.test("make: an empty file, and refusals for a repeated or empty name", async () => {
  const back = unzip(Z.make([{ name: "empty.txt", bytes: new Uint8Array(0) }]));
  assertEquals(back["empty.txt"].length, 0);
  assertThrows(() => Z.make([{ name: "a", bytes: new Uint8Array(1) }, { name: "a", bytes: new Uint8Array(1) }]));
  assertThrows(() => Z.make([{ name: "", bytes: new Uint8Array(1) }]));
  assert(Z.make([]).length === 22);
});
