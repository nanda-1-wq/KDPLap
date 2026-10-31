/* ═══════════════════════════════════════════════════
   NicheInk — E13.0 Typst proof: read a PDF's bytes (throwaway)
   /proof/typst/pdf-check.js   (used by bench.js in Chrome and run.mjs in Node)

   kdpPdfCheck.read(bytes, { inflate }) → Promise<{
     version, creator, objects, objectStreams,
     pageCount: { tree, rootCount, pageObjects },   all three must agree
     pages: [{ mediaBox, cropBox, trimBox, bleedBox, artBox }],
     fonts: [{ name, subtype, embedded, file }],    one row per font descriptor or simple font
   }>
   inflate(Uint8Array) → Promise<Uint8Array>: zlib (FlateDecode). Only used for
   compressed object streams; Typst 0.14 writes plain objects.

   Small on purpose: objects are found by "N G obj", streams are skipped by
   their /Length, dictionaries are read as text (latin1, one char per byte).
═══════════════════════════════════════════════════ */

(function (root) {
  const latin1 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  };

  /** "<< … >>" starting at i (balanced, strings and hex skipped) → end index after ">>". */
  function dictEnd(s, i) {
    let depth = 0;
    while (i < s.length) {
      if (s.startsWith('<<', i)) { depth++; i += 2; continue; }
      if (s.startsWith('>>', i)) { depth--; i += 2; if (!depth) return i; continue; }
      if (s[i] === '(') {   // literal string, nested parens, backslash escapes
        let d = 0;
        for (; i < s.length; i++) {
          if (s[i] === '\\') { i++; continue; }
          if (s[i] === '(') d++;
          else if (s[i] === ')' && !--d) { i++; break; }
        }
        continue;
      }
      i++;
    }
    return i;
  }

  const ref = (dict, key) => {
    const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
    return m ? Number(m[1]) : null;
  };
  const num = (dict, key) => {
    const m = new RegExp(`/${key}\\s+(-?\\d+)`).exec(dict);
    return m ? Number(m[1]) : null;
  };
  const box = (dict, key) => {
    const m = new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`).exec(dict);
    return m ? m[1].trim().split(/\s+/).map(Number) : null;
  };
  const name = (dict, key) => {
    const m = new RegExp(`/${key}\\s*/([^\\s/<>\\[\\]()]+)`).exec(dict);
    return m ? m[1] : null;
  };
  const isType = (dict, t) => new RegExp(`/Type\\s*/${t}(?![A-Za-z])`).test(dict);

  async function read(bytes, { inflate } = {}) {
    const s = latin1(bytes);
    const objs = new Map();   // number → { dict, stream: [start, end] | null }
    const OBJ = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = OBJ.exec(s))) {
      let i = m.index + m[0].length;
      while (/\s/.test(s[i])) i++;
      let dict = '';
      if (s.startsWith('<<', i)) {
        const end = dictEnd(s, i);
        dict = s.slice(i, end);
        i = end;
      }
      let stream = null;
      const sm = /^\s*stream\r?\n/.exec(s.slice(i, i + 20));
      if (sm) {
        const start = i + sm[0].length;
        const len = num(dict, 'Length');
        const end = len != null && !/\/Length\s+\d+\s+\d+\s+R/.test(dict) ? start + len : s.indexOf('endstream', start);
        stream = [start, end];
        i = end;
      }
      objs.set(Number(m[1]), { dict, stream });
      OBJ.lastIndex = i;
    }

    // Compressed object streams (PDF 1.5+): objects inside a /Type /ObjStm.
    let objectStreams = 0;
    for (const [, o] of [...objs]) {
      if (!isType(o.dict, 'ObjStm') || !o.stream) continue;
      objectStreams++;
      if (!inflate) throw new Error('object streams need inflate');
      const data = latin1(await inflate(bytes.subarray(o.stream[0], o.stream[1])));
      const n = num(o.dict, 'N');
      const first = num(o.dict, 'First');
      const head = data.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < n; k++) {
        const start = first + head[2 * k + 1];
        const end = k + 1 < n ? first + head[2 * k + 3] : data.length;
        const text = data.slice(start, end).trim();
        if (!objs.has(head[2 * k])) objs.set(head[2 * k], { dict: text.startsWith('<<') ? text.slice(0, dictEnd(text, 0)) : text, stream: null });
      }
    }

    const trailers = [...s.matchAll(/trailer\s*(<<)/g)];
    let rootRef = trailers.length ? ref(s.slice(trailers.at(-1).index, dictEnd(s, trailers.at(-1).index + trailers.at(-1)[0].length - 2)), 'Root') : null;
    if (rootRef == null) {   // cross-reference stream instead of a trailer
      for (const [, o] of objs) if (isType(o.dict, 'XRef')) rootRef = ref(o.dict, 'Root');
    }
    const catalog = objs.get(rootRef);
    const pagesRef = catalog ? ref(catalog.dict, 'Pages') : null;
    const rootPages = objs.get(pagesRef);

    // Walk the page tree in order; boxes are inherited.
    const pages = [];
    const KEYS = ['MediaBox', 'CropBox', 'TrimBox', 'BleedBox', 'ArtBox'];
    const walk = (n, inherited, seen) => {
      const o = objs.get(n);
      if (!o || seen.has(n)) return;
      seen.add(n);
      const own = { ...inherited };
      for (const k of KEYS) { const b = box(o.dict, k); if (b) own[k] = b; }
      if (isType(o.dict, 'Pages')) {
        const kids = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict);
        for (const k of kids ? kids[1].matchAll(/(\d+)\s+\d+\s+R/g) : []) walk(Number(k[1]), own, seen);
      } else if (isType(o.dict, 'Page')) {
        pages.push({ mediaBox: own.MediaBox || null, cropBox: own.CropBox || null, trimBox: own.TrimBox || null, bleedBox: own.BleedBox || null, artBox: own.ArtBox || null });
      }
    };
    if (pagesRef != null) walk(pagesRef, {}, new Set());

    let pageObjects = 0;
    const fonts = [];
    for (const [, o] of objs) {
      if (isType(o.dict, 'Page')) pageObjects++;
      if (isType(o.dict, 'FontDescriptor')) {
        const file = ['FontFile', 'FontFile2', 'FontFile3'].find((k) => ref(o.dict, k) != null) || null;
        fonts.push({ name: name(o.dict, 'FontName'), subtype: 'descriptor', embedded: !!file, file });
      } else if (isType(o.dict, 'Font')) {
        const sub = name(o.dict, 'Subtype');
        // Type0 fonts embed through their descendant's descriptor; Type3 fonts draw their own glyphs.
        if (sub !== 'Type0' && sub !== 'Type3' && ref(o.dict, 'FontDescriptor') == null) {
          fonts.push({ name: name(o.dict, 'BaseFont'), subtype: sub, embedded: false, file: null });
        } else if (sub === 'Type3') {
          fonts.push({ name: name(o.dict, 'Name') || 'Type3', subtype: sub, embedded: true, file: 'Type3' });
        }
      }
    }
    const info = /\/Creator\s*\(([^)]*)\)/.exec(s);
    return {
      version: (/^%PDF-(\d\.\d)/.exec(s) || [])[1] || null,
      creator: info ? info[1] : null,
      objects: objs.size,
      objectStreams,
      pageCount: { tree: pages.length, rootCount: rootPages ? num(rootPages.dict, 'Count') : null, pageObjects },
      pages,
      fonts,
    };
  }

  root.kdpPdfCheck = { read };
})(globalThis);
