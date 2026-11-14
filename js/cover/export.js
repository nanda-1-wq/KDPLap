/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the export builders (E16 Part 2, plan §5)
   /js/cover/export.js   (browser; needs every js/cover file, js/format/files.js,
                          typst-run.js, engine.js, pdf-check.js and font-cmap.js;
                          Part 10 wires it to the Export dialog)

   The design's step list (plan §5):
   1. Print cover PDF: the flatten plan, the 300 DPI patches (opaque JPEGs,
      the canvas renderer), the Typst source (js/cover/typst.js), the engine
      (kind 'cover', only the fonts in use).
   2. KDP rule check (checkPrint): coverChecks on the bytes (size within
      0.001 in, one page, fonts embedded, exactly one sRGB ICC profile, no
      OutputIntents, transparency or security); every letter in its font
      (D9: names the font and the letter); every line's Typst width within
      0.5% of the screen's (R4); the embedded fonts are exactly the faces in
      use (no silent fallback or weight swap); no "unknown font" warning.
   3. Full image: PNG (our own writer, tile by tile, any size) or JPG (one
      canvas), 300 DPI, rounded up (D16).
   4. Kindle JPG: 1600 × 2560 from the front (kindle.plan: cut, or kFit with
      the background above and below), read back with jpegColor.
   (5. Save to My layouts and the records are Part 10.)

   kdpCover.export.prepare(cover)                 → Promise: fonts loaded, textlayout on the real metrics
   kdpCover.export.print(cover, { engine, images, quality, onStep }) →
       { pdf, plan, typst, patches: [{ path, box, bytes }], build, checks, ok, ms }
   kdpCover.export.checkPrint(pdf, cover, typst, build) → [{ key, name, pass, detail }]
   kdpCover.export.image(cover, { format: 'png' | 'jpg', images, quality }) → { bytes, w, h, ms, type }
   kdpCover.export.kindle(cover, { images }) → { bytes, w, h, color, ms }
   kdpCover.export.png(width, height, rows)       → PNG bytes; rows(y0, y1) → Promise<RGBA rows>
   kdpCover.export.PATCH_MAX                      → the largest patch canvas (bigger patches are split in strips)
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PATCH_MAX = 4096 * 4096;
  const PATCH_QUALITY = 0.95;
  const now = () => performance.now();

  async function blobBytes(canvas, type, quality) {
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type, quality })
      : await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), type, quality));
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function prepare(cover) {
    C.fonts.install();
    C.textlayout.setMeasure(C.fonts.measure);
    await C.fonts.loadAll(C.flatten.printable(cover.layers));
  }

  /** A patch bigger than one canvas is cut in strips on the same grid (seams on whole pixels). */
  function splitBox(b) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (w * h <= PATCH_MAX) return [b];
    const rows = Math.max(1, Math.floor(PATCH_MAX / w));
    const out = [];
    for (let y = b.y0; y < b.y1; y += rows) out.push({ x0: b.x0, y0: y, x1: b.x1, y1: Math.min(b.y1, y + rows) });
    return out;
  }

  async function print(cover, o) {
    const t0 = now();
    const step = o.onStep || (() => {});
    await prepare(cover);
    step('plan');
    const plan = C.flatten.plan(cover);
    // Patches: the opaque 300 DPI JPEGs.
    step('patches');
    const files = {}, split = [];
    const tp = now();
    for (const p of plan.patches) {
      let k = 0;
      for (const box of splitBox(p.box)) {
        const path = `/p/${p.n}${k ? `-${k}` : ''}.jpg`;
        k++;
        const cv = C.render.region(cover, box, { upTo: p.upTo, effectOnly: p.effectOnly, images: o.images });
        const bytes = await blobBytes(cv, 'image/jpeg', o.quality || PATCH_QUALITY);
        cv.width = 0;
        files[path] = bytes;
        split.push({ n: p.n, box, path, bytes });
      }
    }
    const patchMs = now() - tp;
    step('typst');
    const typst = C.typst.source(cover, plan, { patches: split });
    if (typst.missingFonts.length) throw Object.assign(new Error(`Font not available: ${typst.missingFonts.map((x) => x.font).join(', ')}`), { kind: 'font' });
    step('engine');
    const te = now();
    const style = C.fonts.fontSet(typst.faces);
    const build = await o.engine.buildSource({ bookId: o.bookId || 'cover', style, mainTyp: typst.mainTyp, files, kind: 'cover' });
    const engineMs = now() - te;
    step('check');
    const checks = await checkPrint(build.pdf, cover, typst, build);
    return { pdf: build.pdf, plan, typst, patches: split, build, checks, ok: checks.every((c) => c.pass), ms: { total: now() - t0, patches: patchMs, engine: engineMs } };
  }

  /** Every character a face draws (the texts of the layers set in it). */
  function charsByFace(cover) {
    const out = new Map();
    for (const l of C.flatten.printable(cover.layers)) {
      if (l.type !== 'text') continue;
      const f = C.fonts.face(l.font, l.weight);
      if (!f) continue;
      const k = `${f.family}|${f.weight}`;
      if (!out.has(k)) out.set(k, { face: f, chars: new Set() });
      const shown = l.caps ? String(l.text).toUpperCase() : String(l.text);
      for (const ch of shown) if (ch.trim()) out.get(k).chars.add(ch);
    }
    return [...out.values()];
  }

  async function checkPrint(pdf, cover, typst, build) {
    const P = root.kdpPdfCheck;
    const info = await P.read(pdf, { inflate: P.inflate });
    const deep = await P.inspect(pdf);
    const size = typst.size;
    const list = P.coverChecks(info, deep, { widthIn: size.wIn, heightIn: size.hIn });
    // D9: every letter in its font.
    const missing = [];
    for (const { face, chars } of charsByFace(cover)) {
      const bytes = C.fonts.bytes(face);
      if (!bytes) { missing.push(`${face.family}: font file not loaded`); continue; }
      const cmap = root.kdpFontCmap.parse(bytes);
      const lack = [...chars].filter((ch) => !cmap.has(ch.codePointAt(0)));
      if (lack.length) missing.push(`${face.family} ${face.weight} has no ${lack.slice(0, 8).map((ch) => `"${ch}" (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}`);
    }
    list.push({ key: 'glyphs', name: 'Every letter in its font', pass: !missing.length, detail: missing.length ? missing.join('; ') : `${charsByFace(cover).length} faces` });
    // R4: Typst widths against the screen's, 0.5%.
    const marks = (build.meta && build.meta.cover) || [];
    const byKey = new Map(marks.map((m) => [`${m.id}|${m.i}`, m.w]));
    let worst = 0, worstAt = null, absent = 0;
    for (const ln of typst.lines) {
      const w = byKey.get(`${ln.id}|${ln.i}`);
      if (w == null) { absent++; continue; }
      const d = ln.w > 0.5 ? Math.abs(w - ln.w) / ln.w : 0;
      if (d > worst) { worst = d; worstAt = `layer ${ln.id} line ${ln.i + 1}: Typst ${w.toFixed(2)} pt, screen ${ln.w.toFixed(2)} pt`; }
    }
    list.push({ key: 'widths', name: 'Line widths match the screen', pass: !absent && worst <= 0.005,
      detail: absent ? `${absent} lines not measured` : `${typst.lines.length} lines, worst ${(worst * 100).toFixed(3)}%${worstAt ? ` (${worstAt})` : ''}`, worst });
    // The embedded fonts are the faces in use: no fallback font, no weight swap.
    const want = new Set(typst.faces.map((f) => f.ps));
    const got = new Set(info.fonts.map((f) => String(f.name || '').replace(/^[A-Z]{6}\+/, '')).filter(Boolean));
    const extra = [...got].filter((x) => !want.has(x)), lackF = [...want].filter((x) => !got.has(x));
    const textLayers = typst.lines.length > 0 || C.flatten.printable(cover.layers).some((l) => l.type === 'text');
    list.push({ key: 'faces', name: 'Fonts are the ones chosen', pass: !extra.length && (!lackF.length || !textLayers),
      detail: extra.length || lackF.length ? `${extra.length ? `in the file, not chosen: ${extra.join(', ')}` : ''}${lackF.length ? ` chosen, not in the file: ${lackF.join(', ')}` : ''}`.trim() : `${got.size} fonts` });
    const warn = (build.diagnostics || []).map((d) => String(d && (d.message || d))).filter((m) => /unknown font|font family/i.test(m));
    list.push({ key: 'warnings', name: 'No font warnings', pass: !warn.length, detail: warn.length ? warn.join('; ') : 'none' });
    return list;
  }

  /* ── PNG writer (any size, row by row; zlib by CompressionStream) ── */

  function chunk(type, data) {
    const t = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(t, 4); out.set(data, 8);
    const crcIn = new Uint8Array(4 + data.length); crcIn.set(t, 0); crcIn.set(data, 4);
    dv.setUint32(8 + data.length, C.zip.crc32(crcIn));
    return out;
  }

  /**
   * rows(y0, y1) → Promise<Uint8ClampedArray> RGBA of rows y0..y1-1 (full width).
   * RGB, 8 bit, filter Up, sRGB chunk, 300 DPI (pHYs 11811 px a meter).
   */
  async function png(width, height, rows, band = 256) {
    const cs = new root.CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const outChunks = [];
    const reading = (async () => { const r = cs.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; outChunks.push(value); } })();
    let prev = new Uint8Array(width * 3);
    for (let y0 = 0; y0 < height; y0 += band) {
      const y1 = Math.min(height, y0 + band);
      const rgba = await rows(y0, y1);
      const buf = new Uint8Array((y1 - y0) * (1 + width * 3));
      for (let y = 0; y < y1 - y0; y++) {
        const o = y * (1 + width * 3);
        buf[o] = 2;   // Up
        const cur = new Uint8Array(width * 3);
        for (let x = 0; x < width; x++) {
          const s = (y * width + x) * 4;
          cur[x * 3] = rgba[s]; cur[x * 3 + 1] = rgba[s + 1]; cur[x * 3 + 2] = rgba[s + 2];
        }
        for (let i = 0; i < width * 3; i++) buf[o + 1 + i] = (cur[i] - prev[i]) & 255;
        prev = cur;
      }
      await writer.write(buf);
    }
    await writer.close();
    await reading;
    const idat = new Uint8Array(outChunks.reduce((n, c) => n + c.length, 0));
    let at = 0; for (const c of outChunks) { idat.set(c, at); at += c.length; }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width); dv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const phys = new Uint8Array(9); const pv = new DataView(phys.buffer); pv.setUint32(0, 11811); pv.setUint32(4, 11811); phys[8] = 1;
    const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('sRGB', new Uint8Array([0])), chunk('pHYs', phys)];
    for (let i = 0; i < idat.length; i += 1 << 20) parts.push(chunk('IDAT', idat.subarray(i, Math.min(idat.length, i + (1 << 20)))));
    parts.push(chunk('IEND', new Uint8Array(0)));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  async function image(cover, o) {
    const t0 = now();
    await prepare(cover);
    const g = C.geo.geo(cover.fmt), P = C.geo.px300(g), k = C.flatten.DPI / C.geo.I;
    if ((o.format || 'png') === 'png') {
      const TILE = 2048;
      // Rows come from one strip of tiles at a time: TILE rows, the full width.
      let strip = null, stripY = -1;
      const rows = async (y0, y1) => {
        const sy = Math.floor(y0 / TILE) * TILE;
        if (sy !== stripY) {
          const h = Math.min(TILE, P.h - sy);
          strip = new Uint8ClampedArray(P.w * h * 4);
          for (let x = 0; x < P.w; x += TILE) {
            const w = Math.min(TILE, P.w - x);
            const cv = C.render.canvas(w, h);
            const ctx = cv.getContext('2d', { alpha: false, willReadFrequently: true });
            C.render.paint(ctx, cover, { scale: k, x0: x / k, y0: sy / k, images: o.images });
            const d = ctx.getImageData(0, 0, w, h).data;
            for (let yy = 0; yy < h; yy++) strip.set(d.subarray(yy * w * 4, (yy + 1) * w * 4), (yy * P.w + x) * 4);
            cv.width = 0;
          }
          stripY = sy;
        }
        return strip.subarray((y0 - sy) * P.w * 4, (y1 - sy) * P.w * 4);
      };
      const bytes = await png(P.w, P.h, rows, 256);
      return { bytes, w: P.w, h: P.h, type: 'image/png', ms: now() - t0 };
    }
    // JPG: one canvas of the whole image (the canvas's own JPEG writer).
    const cv = C.render.canvas(P.w, P.h);
    const ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) throw Object.assign(new Error(`The full image (${P.w} × ${P.h} px) is larger than this browser's canvas.`), { kind: 'canvas' });
    C.render.paint(ctx, cover, { scale: k, images: o.images });
    // A browser over its canvas limit can give a blank canvas without an error: one sample proves the paint.
    const probe = ctx.getImageData(Math.floor(P.w / 2), Math.floor(P.h / 2), 1, 1).data;
    const blank = probe[3] === 0;
    const bytes = await blobBytes(cv, 'image/jpeg', o.quality || 0.92);
    cv.width = 0;
    if (blank || bytes.length < 1000) throw Object.assign(new Error(`The full image (${P.w} × ${P.h} px) did not paint in this browser.`), { kind: 'canvas' });
    return { bytes, w: P.w, h: P.h, type: 'image/jpeg', ms: now() - t0 };
  }

  async function kindle(cover, o) {
    const t0 = now();
    await prepare(cover);
    const g = C.geo.geo(cover.fmt), S = C.kindle.SIZE, kp = C.kindle.plan(g, S);
    const cv = C.render.canvas(S.w, S.h);
    const ctx = cv.getContext('2d', { alpha: false });
    ctx.fillStyle = cover.bg; ctx.fillRect(0, 0, S.w, S.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(kp.dst.x, kp.dst.y, kp.dst.w, kp.dst.h); ctx.clip();
    C.render.paint(ctx, cover, { scale: kp.scale, x0: kp.src.x - kp.dst.x / kp.scale, y0: kp.src.y - kp.dst.y / kp.scale, images: o.images });
    ctx.restore();
    const bytes = await blobBytes(cv, 'image/jpeg', o.quality || 0.92);
    cv.width = 0;
    return { bytes, w: S.w, h: S.h, mode: kp.mode, color: C.imagePrep.jpegColor(bytes), size: C.imagePrep.sniff(bytes), ms: now() - t0 };
  }

  C.export = { PATCH_MAX, PATCH_QUALITY, prepare, print, checkPrint, image, kindle, png, splitBox, charsByFace };
})(globalThis);
