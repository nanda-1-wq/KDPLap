/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: picture helpers (E16 Part 2; copied from E15)
   /js/cover/image-prep.js   (the pure part is tested by tests/cover-image-prep.test.js)

   Copied from the e15-archive tag (bc0b99b, js/cover-image.js), KDP-proven
   in E15 (owner Q-1). sniff(), jpegColor() and luma() are unchanged.
   prepare() is unchanged too; its E15 limits (kdpCoverMath.UPLOAD,
   uploadError, storedPx) are written in here because js/cover-math.js is
   not in E16.

   Not E16's rules yet (Part 6 changes them, with its own tests):
   - prepare() draws every picture on white and stores a JPEG: E16 keeps a
     PNG's transparency (plan §2 cover_assets: image/png, `transparent`);
   - prepare() caps the long side at 4,096 px: 0030 allows 12,000 px.
   The export (js/cover/export.js) uses jpegColor() on the Kindle JPG and
   sniff() on pictures; it never calls prepare().

   Pure (no DOM, also in Deno):
   kdpCover.imagePrep.sniff(bytes)      → { type, w, h, alpha } from the file's first bytes
                                          (type: 'image/jpeg' | 'image/png' | null, never from the name)
   kdpCover.imagePrep.jpegColor(bytes)  → { ok, why, channels, adobe, icc } the color rule of a JPEG we make
                                          (E15 plan §19): 3 channels, no Adobe marker, no profile or an sRGB one.
                                          why: 'gray' | 'cmyk' | 'channels' | 'adobe' | 'profile' | 'unreadable'
   kdpCover.imagePrep.luma(r, g, b)     → relative luminance (0..1) of an sRGB pixel
   kdpCover.imagePrep.ERROR_TEXT        → the message of each refusal (E15 words)
   kdpCover.imagePrep.E15               → the E15 limits prepare() uses

   Browser:
   kdpCover.imagePrep.prepare(file)     → { ok, error } or { ok, blob, width, height, bytes, flattened, scaled, source }
   kdpCover.imagePrep.decode(blob)      → ImageBitmap
═══════════════════════════════════════════════════ */

(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const ERROR_TEXT = {
    type: 'Use a JPG or PNG picture.',
    bytes: 'This file is larger than 25 MB. Use a smaller file.',
    pixels: 'This picture has more than 40 megapixels. Use a smaller one.',
    unreadable: 'We could not read this picture. Try another JPG or PNG.',
    too_big: 'The picture is still larger than 10 MB after we made it smaller. Use a simpler picture.',
    kindle_small: 'Too small for the Kindle cover. KDP needs at least 1600 × 2560 px.',
    upload: 'The picture was not saved. Check your connection, then try again.'
  };

  // E15's limits (js/cover-math.js UPLOAD, uploadError, storedPx at bc0b99b), as they were.
  const E15 = {
    UPLOAD: { types: ['image/jpeg', 'image/png'], maxBytes: 25 * 1024 * 1024, maxPixels: 40e6, maxSide: 4096, quality: 0.92, storeBytes: 10485760 },
    storedPx(px) {
      if (!px || !(px.w > 0) || !(px.h > 0)) return null;
      const long = Math.max(px.w, px.h);
      if (long <= E15.UPLOAD.maxSide) return { w: Math.round(px.w), h: Math.round(px.h), scaled: false };
      const k = E15.UPLOAD.maxSide / long;
      return { w: Math.max(1, Math.round(px.w * k)), h: Math.max(1, Math.round(px.h * k)), scaled: true };
    },
    uploadError({ type, bytes, w, h }) {
      if (!E15.UPLOAD.types.includes(type)) return 'type';
      if (!(bytes > 0) || bytes > E15.UPLOAD.maxBytes) return 'bytes';
      if (!(w > 0) || !(h > 0)) return 'unreadable';
      if (w * h > E15.UPLOAD.maxPixels) return 'pixels';
      return null;
    }
  };

  /* ── Pure ── */

  const u16 = (b, i) => (b[i] << 8) | b[i + 1];
  const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  /**
   * The kind and the pixel size of a file from its bytes (the name and the
   * browser's type are not trusted). alpha: a PNG that can hold transparency.
   * An EXIF turn swaps w and h on screen; the pixel count is the same.
   */
  function sniff(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const none = { type: null, w: 0, h: 0, alpha: false };
    if (b.length >= 26 && PNG_SIG.every((v, i) => b[i] === v)) {
      if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return { ...none, type: 'image/png' };
      const out = { type: 'image/png', w: u32(b, 16), h: u32(b, 20), alpha: b[25] === 4 || b[25] === 6 };
      // A palette or gray PNG holds transparency in a tRNS chunk, before the first IDAT.
      let i = 8;
      while (!out.alpha && i + 8 <= b.length) {
        const len = u32(b, i);
        const name = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
        if (name === 'tRNS') out.alpha = true;
        if (name === 'IDAT' || name === 'IEND') break;
        i += 12 + len;
      }
      return out;
    }
    if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }                               // fill bytes
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }   // no length
        if (m === 0xd9 || m === 0xda) break;                             // end, or the picture data
        // SOF0 to SOF15, but not DHT (C4), JPG (C8), DAC (CC): height, then width.
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'image/jpeg', w: u16(b, i + 7), h: u16(b, i + 5), alpha: false };
        i += 2 + u16(b, i + 2);
      }
      return { ...none, type: 'image/jpeg' };
    }
    return none;
  }

  const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));

  /** The text of an ICC 'desc' tag: v2 textDescriptionType ('desc'), v4 'mluc' (UTF-16, enUS first), or 'text'. */
  function iccText(p, off, size) {
    if (off < 0 || off + 12 > p.length) return '';
    const end = Math.min(p.length, off + size);
    const type = ascii(p, off, 4);
    if (type === 'desc') {
      const n = u32(p, off + 8);
      return ascii(p, off + 12, Math.max(0, Math.min(n, end - off - 12))).replace(/\0[\s\S]*$/, '');
    }
    if (type === 'text') return ascii(p, off + 8, Math.max(0, end - off - 8)).replace(/\0[\s\S]*$/, '');
    if (type === 'mluc' && off + 16 <= end) {
      const count = u32(p, off + 8);
      const rec = u32(p, off + 12) || 12;
      let pick = null;
      for (let k = 0; k < count && off + 16 + (k + 1) * rec <= end; k++) {
        const r = off + 16 + k * rec;
        const item = { lang: ascii(p, r, 4), len: u32(p, r + 4), at: off + u32(p, r + 8) };
        if (!pick || item.lang === 'enUS') pick = item;
        if (item.lang === 'enUS') break;
      }
      if (!pick || pick.at + pick.len > end) return '';
      let s = '';
      for (let i = pick.at; i + 1 < pick.at + pick.len; i += 2) s += String.fromCharCode(u16(p, i));
      return s.replace(/\0[\s\S]*$/, '');
    }
    return '';
  }

  /**
   * The color rule of a JPEG we make (owner, Nov 11, plan §19). The frame's
   * channels, an Adobe (APP14) marker, and the ICC profile: the APP2
   * "ICC_PROFILE" chunks joined in their order, its color space (header byte
   * 16) and its description. PASS: 3 channels, no Adobe marker, and no
   * profile or a profile whose color space is RGB and whose description
   * names sRGB (Chrome's canvas: ICC v4.3, "sRGB"). FAIL: gray, CMYK, any
   * other profile (Display P3, Adobe RGB, a gray or CMYK profile).
   */
  // A description that names sRGB: "sRGB", "sRGB IEC61966-2.1", "sRGB2014", "sRGB_v4_ICC_preference".
  // Not scRGB or e-sRGB (other color spaces): no letter and no hyphen right before "sRGB".
  const SRGB_NAME = /(^|[^a-z-])srgb/i;

  function jpegColor(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const out = { ok: false, why: 'unreadable', channels: null, adobe: false, icc: null };
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return out;
    const parts = [];
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) break;
      const len = u16(b, i + 2);
      const body = b.subarray(i + 4, Math.min(b.length, i + 2 + len));
      if (m === 0xee && body.length >= 5 && ascii(body, 0, 5) === 'Adobe') out.adobe = true;
      if (m === 0xe2 && body.length > 14 && ascii(body, 0, 12) === 'ICC_PROFILE\0') parts.push({ seq: body[12], data: body.subarray(14) });
      if (out.channels == null && m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && body.length >= 6) out.channels = body[5];
      i += 2 + len;
    }
    if (parts.length) {
      parts.sort((a, c) => a.seq - c.seq);
      const p = new Uint8Array(parts.reduce((n, x) => n + x.data.length, 0));
      let at = 0;
      for (const x of parts) { p.set(x.data, at); at += x.data.length; }
      const icc = { space: '', desc: '', version: '', bytes: p.length };
      if (p.length >= 132 && ascii(p, 36, 4) === 'acsp') {
        icc.space = ascii(p, 16, 4).trim();
        icc.version = `${p[8]}.${p[9] >> 4}`;
        const n = u32(p, 128);
        for (let k = 0; k < n && 132 + (k + 1) * 12 <= p.length; k++) {
          const t = 132 + k * 12;
          if (ascii(p, t, 4) === 'desc') { icc.desc = iccText(p, u32(p, t + 4), u32(p, t + 8)); break; }
        }
      }
      out.icc = icc;
    }
    const ch = out.channels;
    out.why = ch == null ? 'unreadable' : ch === 1 ? 'gray' : ch === 4 ? 'cmyk' : ch !== 3 ? 'channels'
      : out.adobe ? 'adobe'
        : out.icc && !(out.icc.space === 'RGB' && SRGB_NAME.test(out.icc.desc)) ? 'profile' : null;
    out.ok = out.why === null;
    return out;
  }

  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luma = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

  /* ── Browser ── */

  /** dom: a canvas for the page (an OffscreenCanvas cannot be shown). */
  function makeCanvas(w, h, dom = false) {
    if (!dom && root.OffscreenCanvas) return new root.OffscreenCanvas(w, h);
    const c = root.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  const toBlob = (canvas, quality) => (canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/jpeg', quality })
    : new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', quality)));

  /** An opaque 2D context: white first, so transparency is flattened on white. */
  function ctx2d(canvas) {
    const g = canvas.getContext('2d', { alpha: false });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, canvas.width, canvas.height);
    return g;
  }

  const decode = (blob) => root.createImageBitmap(blob);

  /**
   * A picked file → the copy we store. Refused before decoding: not a JPG or
   * PNG (by its bytes), over 25 MB, over 40 megapixels. Then drawn on a canvas
   * at the stored size (long side at most 4096 px) and made a JPEG (0.92; a
   * lower quality only when the file would pass the bucket's 10 MB).
   */
  async function prepare(file) {
    const m = E15;
    if (!file || !(file.size > 0)) return { ok: false, error: 'unreadable' };
    if (file.size > m.UPLOAD.maxBytes) return { ok: false, error: 'bytes' };
    let head;
    try { head = new Uint8Array(await file.arrayBuffer()); } catch (e) { return { ok: false, error: 'unreadable' }; }
    const info = sniff(head);
    const bad = m.uploadError({ type: info.type, bytes: file.size, w: info.w, h: info.h });
    if (bad) return { ok: false, error: bad };
    let bmp;
    try { bmp = await decode(new Blob([head], { type: info.type })); } catch (e) { return { ok: false, error: 'unreadable' }; }
    try {
      const size = m.storedPx({ w: bmp.width, h: bmp.height });
      const canvas = makeCanvas(size.w, size.h);
      ctx2d(canvas).drawImage(bmp, 0, 0, size.w, size.h);
      let blob = null;
      for (const q of [m.UPLOAD.quality, 0.85, 0.75]) {
        blob = await toBlob(canvas, q);
        if (blob.size <= m.UPLOAD.storeBytes) break;
      }
      canvas.width = 0;
      if (!blob || blob.size > m.UPLOAD.storeBytes) return { ok: false, error: 'too_big' };
      return { ok: true, blob, width: size.w, height: size.h, bytes: blob.size, flattened: info.alpha, scaled: size.scaled, source: { w: bmp.width, h: bmp.height, type: info.type } };
    } catch (e) {
      return { ok: false, error: 'unreadable' };
    } finally {
      if (bmp.close) bmp.close();
    }
  }

  C.imagePrep = { ERROR_TEXT, E15, sniff, jpegColor, luma, prepare, decode, makeCanvas };
})(globalThis);
