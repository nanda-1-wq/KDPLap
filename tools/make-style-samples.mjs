// node tools/make-style-samples.mjs   (from the repo root; real CDN, Chrome; run once)
// 08 Format, E13.1: the four style card images in app/format/.
// typst.ts cannot write PNG or SVG, so (owner, Nov 4): the print engine builds
// a short PDF per style, and pdf.js renders page 1 in Chrome. The sample text
// is "Aa", as on the final artboard ("Final · 08 Format": each style card shows
// "Aa" in its face at 24 px): Classic EB Garamond Regular, Modern Source Sans 3
// Bold (the artboard's 600; we load 400 and 700), Clean Literata Regular, Warm
// Lora Italic. Never text from a book.
// Output: app/format/style-<style>.png, 96 x 64 px (2x of 48 x 32 CSS px),
// ink #1C1C1A (--ink) on a transparent ground, under 15 KB each.
import fs from 'node:fs';
import path from 'node:path';
import { chrome, ensureServer, REPO, log } from '../tests/browser/format/lib.mjs';

const SAMPLES = {
  classic: { font: 'EB Garamond', weight: 'regular', style: 'normal' },
  modern: { font: 'Source Sans 3', weight: 'bold', style: 'normal' },
  clean: { font: 'Literata', weight: 'regular', style: 'normal' },
  warm: { font: 'Lora', weight: 'regular', style: 'italic' }
};
const INK = [0x1C, 0x1C, 0x1A];
const MAX_BYTES = 15 * 1024;
const DIR = path.join(REPO, 'app', 'format');

const server = await ensureServer();
const c = await chrome();
try {
  await c.open();
  fs.mkdirSync(DIR, { recursive: true });
  for (const [style, s] of Object.entries(SAMPLES)) {
    const src = [
      '#set page(width: 48pt, height: 32pt, margin: 0pt)',
      `#set text(font: "${s.font}", size: 24pt, weight: "${s.weight}", style: "${s.style}", lang: "en")`,
      '#align(center + horizon)[Aa]'
    ].join('\n');
    const b64 = await c.page.evaluate(async ({ style, src, INK }) => {
      const e = kdpFormatHarness.engine();
      await e.load(style);
      const r = await e.buildSource({ bookId: `sample-${style}`, style, mainTyp: src });
      if (r.diagnostics.length) throw new Error(r.diagnostics.join('; '));
      const pdfjs = await kdpTypstRun.loadPdfjs();
      const task = pdfjs.getDocument({ data: r.pdf.slice(), verbosity: 0 });
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      // Black on white → ink with the coverage as alpha, so the card's own ground shows through.
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const a = 255 - Math.round((img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3);
        img.data[i] = INK[0]; img.data[i + 1] = INK[1]; img.data[i + 2] = INK[2]; img.data[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
      await task.destroy();
      return canvas.toDataURL('image/png').split(',')[1];
    }, { style, src, INK });
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_BYTES) throw new Error(`${style}: ${bytes.length} bytes, over 15 KB`);
    const file = path.join(DIR, `style-${style}.png`);
    fs.writeFileSync(file, bytes);
    log(path.relative(REPO, file), bytes.length, 'bytes', `(${bytes.readUInt32BE(16)} x ${bytes.readUInt32BE(20)} px)`);
  }
} finally {
  await c.close();
  if (server) process.kill(-server.pid);
}
