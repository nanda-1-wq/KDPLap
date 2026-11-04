/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: which characters a font has (E13.1)
   /js/format/font-cmap.js   (used by 08 Format's Ready box and the format
                              tests; tested by tests/font-cmap.test.js)

   Reads a TrueType font's cmap table (format 12 first, then format 4).
   A character the chosen style's fonts lack prints as an empty box in the
   PDF (E13.0 found emoji print as .notdef), so 08 lists every such
   character with where it is.

   kdpFontCmap.parse(bytes)          → { format, has(codePoint) }   throws on a font with no usable cmap
   kdpFontCmap.collect(model, extras) → Map(char → { kind: 'body' | 'head', where: [label] })
     Every character the PDF will print: section text (marks removed), section
     and chapter titles, the book's title, subtitle, pen name, bio, copyright
     line, Also by titles, and the characters Typst adds itself (curly quotes,
     ellipsis, hyphen, dot leader). Spaces and control characters are skipped.
   kdpFontCmap.missing(collected, { body: [face], head: [face] })
     → [{ char, code: "U+1F600", faces: [name], where: [label] }]
     face = { name, cmap }. Body text is checked against every body face
     (regular, italic, bold, bold italic); titles against the head faces too.
═══════════════════════════════════════════════════ */

(function (root) {
  function parse(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const u16 = (o) => dv.getUint16(o);
    const u32 = (o) => dv.getUint32(o);
    const numTables = u16(4);
    let cmap = -1;
    for (let i = 0; i < numTables; i++) {
      const r = 12 + i * 16;
      if (String.fromCharCode(u8[r], u8[r + 1], u8[r + 2], u8[r + 3]) === 'cmap') cmap = u32(r + 8);
    }
    if (cmap < 0) throw new Error('no cmap table');
    const subs = [];
    for (let i = 0, n = u16(cmap + 2); i < n; i++) {
      const r = cmap + 4 + i * 8;
      const off = cmap + u32(r + 4);
      subs.push({ platform: u16(r), encoding: u16(r + 2), off, format: u16(off) });
    }
    const unicode = (s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10));
    const f12 = subs.find((s) => unicode(s) && s.format === 12);
    if (f12) {
      const groups = [];
      for (let i = 0, n = u32(f12.off + 12); i < n; i++) {
        const g = f12.off + 16 + i * 12;
        groups.push([u32(g), u32(g + 4), u32(g + 8)]);
      }
      return {
        format: 12,
        has(cp) {
          let lo = 0, hi = groups.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const [a, b, glyph] = groups[mid];
            if (cp < a) hi = mid - 1;
            else if (cp > b) lo = mid + 1;
            else return glyph + (cp - a) !== 0;
          }
          return false;
        }
      };
    }
    const f4 = subs.find((s) => unicode(s) && s.format === 4);
    if (!f4) throw new Error('no Unicode cmap (format 4 or 12)');
    const o = f4.off;
    const segs = u16(o + 6) / 2;
    const ends = o + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
    return {
      format: 4,
      has(cp) {
        if (cp > 0xFFFF) return false;
        for (let i = 0; i < segs; i++) {
          if (u16(ends + i * 2) < cp) continue;
          const start = u16(starts + i * 2);
          if (start > cp) return false;
          const delta = dv.getInt16(deltas + i * 2);
          const ro = u16(ranges + i * 2);
          if (!ro) return ((cp + delta) & 0xFFFF) !== 0;
          const at = ranges + i * 2 + ro + (cp - start) * 2;
          if (at + 1 >= u8.length) return false;
          const g = u16(at);
          return g !== 0 && ((g + delta) & 0xFFFF) !== 0;
        }
        return false;
      }
    };
  }

  // Characters Typst prints that the writer may not have typed.
  const TYPST_ADDS = '‘’“”…‐-.0123456789';
  const SKIP = /[\s\u0000-\u001F\u007F​-‍⁠﻿]/u;

  function collect(model, extras = {}) {
    const R = root.kdpExportRules;
    const out = new Map();
    const add = (text, kind, label) => {
      for (const ch of String(text || '')) {
        if (SKIP.test(ch)) continue;
        let e = out.get(ch);
        if (!e) { e = { kind, where: [] }; out.set(ch, e); }
        if (kind === 'head') e.kind = 'head';
        if (label && !e.where.includes(label) && e.where.length < 20) e.where.push(label);
      }
    };
    const b = model.book || {};
    add(b.title, 'head', 'Book title');
    add(b.subtitle, 'body', 'Subtitle');
    add(b.pen_name, 'head', 'Pen name');
    if (extras.about) add(b.bio, 'body', 'About the author');
    if (extras.copyright) add(extras.copyright, 'body', 'Copyright page');
    for (const x of extras.alsoBy || []) { add(x.title, 'body', 'Also by'); add(x.subtitle, 'body', 'Also by'); }
    if (extras.headerTitle) add(extras.headerTitle, 'head', 'Header title');
    for (const c of model.chapters || []) {
      add(c.title, 'head', c.kind === 'chapter' ? `Chapter ${c.fileNumber}` : (c.kind === 'intro' ? 'Introduction' : 'Conclusion'));
      for (const s of c.sections) {
        add(s.title, 'head', s.label);
        add(R ? R.strip(s.content) : s.content, 'body', s.label);
      }
    }
    add(TYPST_ADDS, 'body', null);
    return out;
  }

  const code = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

  function missing(collected, { body = [], head = [] }) {
    const out = [];
    for (const [ch, e] of collected) {
      const cp = ch.codePointAt(0);
      const faces = (e.kind === 'head' ? [...body, ...head] : body).filter((f) => !f.cmap.has(cp)).map((f) => f.name);
      if (faces.length) out.push({ char: ch, code: code(ch), faces: [...new Set(faces)], where: e.where });
    }
    return out.sort((a, b) => a.char.codePointAt(0) - b.char.codePointAt(0));
  }

  root.kdpFontCmap = { parse, collect, missing, TYPST_ADDS };
})(globalThis);
