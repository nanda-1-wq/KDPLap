// node tools/cover-fonts-sprite.mjs   (from the repo root; headless Chrome; fonts from the test cache)
// 09 Cover, E16 Part 2 (plan §8): img/cover-fonts.png, every catalog family's name in its own
// face, one row each in catalog order, so the font list shows 300 names without loading 300 fonts.
// Row n is at y = n × 56 px (28 CSS px at 2x); 600 px wide (300 CSS px); ink #1C1C1A on clear
// (a gray + alpha PNG: only the ink's coverage is stored).
// The face is the family's 400 file (or its lightest kept weight). A name the face cannot draw
// (a font without Latin capitals) would show boxes: the tool lists any such family.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { coverChrome, ensureServer, REPO } from '../tests/browser/cover/lib.mjs';

/** A PNG of color type 4 (gray + alpha, 8 bit): gray 0x1C everywhere, the given alpha. */
function grayAlphaPng(w, h, alpha) {
  const raw = Buffer.alloc(h * (1 + w * 2));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 2);
    raw[o] = 0;
    for (let x = 0; x < w; x++) { raw[o + 1 + x * 2] = 0x1c; raw[o + 2 + x * 2] = alpha[y * w + x]; }
  }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 4;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const ROW = 28, SCALE = 2, WIDTH = 300, SIZE = 17;
await ensureServer();
const c = await coverChrome();
try {
  await c.open();
  const r = await c.page.evaluate(async ({ ROW, SCALE, WIDTH, SIZE }) => {
    const F = kdpCover.fonts, rows = kdpCover.fontCatalog;
    const cv = document.createElement('canvas');
    cv.width = WIDTH * SCALE; cv.height = rows.length * ROW * SCALE;
    const g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    g.fillStyle = '#1C1C1A';
    g.textBaseline = 'middle';
    const lacking = [];
    for (let n = 0; n < rows.length; n++) {
      const family = rows[n][0];
      const w = Math.min(...Object.keys(rows[n][4]).map(Number));
      const face = await F.load(family, w);
      const cmap = kdpFontCmap.parse(F.bytes(face));
      if ([...family].some((ch) => ch.trim() && !cmap.has(ch.codePointAt(0)))) lacking.push(family);
      g.font = `${SIZE}px "${F.canvasName(face)}"`;
      let size = SIZE;
      while (g.measureText(family).width > WIDTH - 8 && size > 9) { size -= 0.5; g.font = `${size}px "${F.canvasName(face)}"`; }
      g.fillText(family, 4, n * ROW + ROW / 2);
    }
    // Only the alpha matters (one ink color): Node writes a gray + alpha PNG from it.
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const a = new Uint8Array(cv.width * cv.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return { b64: btoa(s), w: cv.width, h: cv.height, lacking };
  }, { ROW, SCALE, WIDTH, SIZE });
  const out = path.join(REPO, 'img/cover-fonts.png');
  fs.writeFileSync(out, grayAlphaPng(r.w, r.h, Buffer.from(r.b64, 'base64')));
  console.log(`img/cover-fonts.png ${r.w} × ${r.h} px, ${fs.statSync(out).size} bytes; names a face cannot draw: ${r.lacking.length ? r.lacking.join(', ') : 'none'}`);
} finally { await c.close(); }
