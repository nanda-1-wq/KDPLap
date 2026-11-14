/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: read and check a PDF's bytes (E13.1)
   /js/format/pdf-check.js   (used by 08 Format before a download, and by
                              the format tests; tested by tests/pdf-check.test.js)

   Port of the E13.0 proof reader. Small on purpose: objects are found by
   "N G obj", streams are skipped by their /Length, dictionaries are read as
   text (latin1, one char per byte).

   kdpPdfCheck.read(bytes, { inflate }) → Promise<{
     version, creator, objects, objectStreams,
     pageCount: { tree, rootCount, pageObjects },   all three must agree
     pages: [{ mediaBox, cropBox, trimBox, bleedBox, artBox }],
     fonts: [{ name, subtype, embedded, file }],    one row per font descriptor or simple font
   }>
     inflate(Uint8Array) → Promise<Uint8Array>: zlib (FlateDecode), only for
     compressed object streams (Typst 0.14 writes plain objects).
   kdpPdfCheck.inflate(bytes)            → zlib inflate with DecompressionStream
   kdpPdfCheck.checks(info, { trim, pages }) → [{ key, name, pass, detail }]
     The checks before a Print PDF download (plan, Part 3 export panel):
       size     every page is the trim size, no other page boxes
       fonts    every font embedded as TrueType (FontFile2), no Type 3
       pages    the page count is even and the same in the engine and the file
   kdpPdfCheck.ok(list)                  → every check passed

   E15 (09 Cover, plan §1b, Q-a):
   kdpPdfCheck.inspect(bytes, { inflate }) → color spaces (dictionaries and
     the page and form content streams: rg/RG, g/G, k/K, cs/CS), ICC profiles,
     OutputIntents, soft masks, transparency groups, alpha below 1, /Encrypt,
     image objects (size, filter, color space). read() is unchanged.
   kdpPdfCheck.coverChecks(info, deep, { widthIn, heightIn })
     size (one page, MediaBox = the computed size to 0.001 in, no other box),
     pages (1), fonts (as checks), color (DeviceRGB only), profile (no ICC, no
     OutputIntents), transparency (none), security (no /Encrypt)
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
    const { s, objs, objectStreams } = await scan(bytes, inflate);
    return summary(s, objs, objectStreams);
  }

  /** Every object: number → { dict, stream: [start, end] | null }, objects in object streams too. */
  async function scan(bytes, inflate) {
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
      } else if (s[i] === '[' || s[i] === '/') {
        // E15: an array or a name object (for example a color space "[/ICCBased 5 0 R]").
        const end = s.indexOf('endobj', i);
        if (end > i) { dict = s.slice(i, end).trim(); i = end; }
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
    return { s, objs, objectStreams };
  }

  /** The catalog object number (classic trailer, else a cross-reference stream). */
  function rootOf(s, objs) {
    const trailers = [...s.matchAll(/trailer\s*(<<)/g)];
    let rootRef = trailers.length ? ref(s.slice(trailers.at(-1).index, dictEnd(s, trailers.at(-1).index + trailers.at(-1)[0].length - 2)), 'Root') : null;
    if (rootRef == null) {
      for (const [, o] of objs) if (isType(o.dict, 'XRef')) rootRef = ref(o.dict, 'Root');
    }
    return rootRef;
  }

  /** read()'s result from the scanned objects (unchanged since E13.1). */
  function summary(s, objs, objectStreams) {
    const rootRef = rootOf(s, objs);
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

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const PT = 72;

  function checks(info, { trim, pages }) {
    const [w, h] = String(trim).split('x').map(Number);
    const want = [0, 0, w * PT, h * PT];
    const near = (b) => Array.isArray(b) && b.length === 4 && b.every((x, i) => Math.abs(x - want[i]) < 0.01);
    const badSize = info.pages.map((p, i) => (near(p.mediaBox) ? 0 : i + 1)).filter(Boolean);
    const otherBoxes = info.pages.map((p, i) => (p.cropBox || p.trimBox || p.bleedBox || p.artBox ? i + 1 : 0)).filter(Boolean);
    const notEmbedded = info.fonts.filter((f) => !f.embedded || f.file !== 'FontFile2').map((f) => f.name || f.subtype);
    const type3 = info.fonts.filter((f) => f.subtype === 'Type3').length;
    const pc = info.pageCount;
    const counts = [pc.tree, pc.rootCount, pc.pageObjects];
    return [
      { key: 'size', name: 'Page size', pass: info.pages.length > 0 && !badSize.length && !otherBoxes.length,
        detail: badSize.length ? `pages not ${w} x ${h} in: ${badSize.slice(0, 5).join(', ')}` : otherBoxes.length ? `other page boxes on pages ${otherBoxes.slice(0, 5).join(', ')}` : `${w} x ${h} in on every page` },
      { key: 'fonts', name: 'Fonts embedded', pass: info.fonts.length > 0 && !notEmbedded.length && !type3,
        detail: notEmbedded.length ? `not embedded: ${notEmbedded.join(', ')}` : `${info.fonts.length} fonts embedded` },
      { key: 'pages', name: 'Page count', pass: counts.every((x) => x === pages) && pages % 2 === 0 && pages > 0,
        detail: `engine ${pages}, file ${counts.join('/')}` }
    ];
  }

  const ok = (list) => list.every((c) => c.pass);

  /* ── E15: the cover file (plan §1b, Q-a) ── */

  const COLOR_SPACES = ['DeviceRGB', 'DeviceGray', 'DeviceCMYK', 'ICCBased', 'CalRGB', 'CalGray', 'Lab', 'Indexed', 'Separation', 'DeviceN', 'Pattern'];
  /** Content-stream operators that set a device color: operator → color space. */
  const DEVICE_OPS = { rg: 'DeviceRGB', RG: 'DeviceRGB', g: 'DeviceGray', G: 'DeviceGray', k: 'DeviceCMYK', K: 'DeviceCMYK' };

  /** Stream bytes of an object, inflated when it is FlateDecode. */
  async function streamText(bytes, o, inflater) {
    const raw = bytes.subarray(o.stream[0], o.stream[1]);
    if (/\/Filter\s*\/FlateDecode/.test(o.dict) || /\/Filter\s*\[\s*\/FlateDecode\s*\]/.test(o.dict)) {
      if (!inflater) throw new Error('content streams need inflate');
      return latin1(await inflater(raw));
    }
    return latin1(raw);
  }

  /** Operators in a content stream, strings and hex strings removed first. */
  function contentOps(text) {
    const t = text.replace(/\((?:\\.|[^\\)])*\)/g, ' ').replace(/<[0-9A-Fa-f\s]*>/g, ' ');
    const ops = { rg: 0, RG: 0, g: 0, G: 0, k: 0, K: 0 };
    const named = new Set();
    const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
    const count = (op, n) => {
      const re = new RegExp(String.raw`(?:^|\s)(?:${NUM}\s+){${n}}${op}(?=\s|$)`, 'g');
      return (t.match(re) || []).length;
    };
    ops.rg = count('rg', 3); ops.RG = count('RG', 3);
    ops.g = count('g', 1); ops.G = count('G', 1);
    ops.k = count('k', 4); ops.K = count('K', 4);
    for (const m of t.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(cs|CS)(?=\s|$)/g)) named.add(m[1]);
    const gs = new Set([...t.matchAll(/\/([A-Za-z0-9_.+-]+)\s+gs(?=\s|$)/g)].map((m) => m[1]));
    return { ops, named: [...named], gs: [...gs] };
  }

  /**
   * Everything the cover checks need beyond read(): every color space named
   * in a dictionary or set by a page or form content stream, the ICC profile
   * streams (each with its /N: 1 gray, 3 RGB, 4 CMYK), OutputIntents, soft
   * masks, transparency groups, alpha below 1 in an ExtGState, /Encrypt, and
   * the image objects.
   * → { colorSpaces, ops, profiles: [{ obj, n }], iccProfiles, outputIntents, softMasks, transparencyGroups, alpha, encrypted, images, contentStreams }
   *   images: [{ obj, width, height, bitsPerComponent, colorSpace, profile (the ICC object it uses, or null), filter, smask, bytes, stream }]
   */
  async function inspect(bytes, { inflate: inflater = inflate } = {}) {
    const { s, objs } = await scan(bytes, inflater);
    const spaces = new Set();
    const ops = { rg: 0, RG: 0, g: 0, G: 0, k: 0, K: 0 };
    let softMasks = 0, transparencyGroups = 0, contentStreams = 0;
    // ICC profile streams: every object an /ICCBased names, and any stream that looks like one.
    const profileIds = new Set();
    const alpha = [];
    const images = [];
    // Content streams: every page's /Contents and every form XObject.
    const contents = new Set();
    for (const [, o] of objs) {
      if (isType(o.dict, 'Page')) {
        const one = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(o.dict);
        const many = /\/Contents\s*\[([^\]]*)\]/.exec(o.dict);
        if (one) contents.add(Number(one[1]));
        if (many) for (const r of many[1].matchAll(/(\d+)\s+\d+\s+R/g)) contents.add(Number(r[1]));
      }
    }
    for (const [n, o] of objs) {
      const d = o.dict;
      for (const cs of COLOR_SPACES) if (new RegExp(`/${cs}(?![A-Za-z])`).test(d)) spaces.add(cs);
      for (const m of d.matchAll(/\/ICCBased\s+(\d+)\s+\d+\s+R/g)) profileIds.add(Number(m[1]));
      if (o.stream && /\/N\s+[134]\b/.test(d) && /\/Alternate\s*\//.test(d)) profileIds.add(n);
      if (/\/SMask\s+\d+\s+\d+\s+R/.test(d)) softMasks++;
      if (/\/S\s*\/Transparency/.test(d)) transparencyGroups++;
      for (const m of d.matchAll(/\/(ca|CA)\s+(-?[\d.]+)/g)) if (Number(m[2]) < 1) alpha.push(`${m[1]} ${m[2]}`);
      if (/\/Subtype\s*\/Image/.test(d)) {
        const cs = /\/ColorSpace\s*(\/[A-Za-z]+|\d+\s+\d+\s+R|\[[^\]]*\])/.exec(d);
        const filter = /\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]*\])/.exec(d);
        // E15 (plan §19): the ICC profile object the image's color space uses, one reference deep, or null.
        const iccOf = (t) => { const r = /\/ICCBased\s+(\d+)\s+\d+\s+R/.exec(t || ''); return r ? Number(r[1]) : null; };
        const ref = cs && /^(\d+)\s+\d+\s+R$/.exec(cs[1].trim());
        const profile = !cs ? null : ref ? iccOf((objs.get(Number(ref[1])) || {}).dict) : iccOf(cs[1]);
        images.push({
          obj: n, width: num(d, 'Width'), height: num(d, 'Height'), bitsPerComponent: num(d, 'BitsPerComponent'),
          colorSpace: cs ? cs[1].replace(/\s+/g, ' ') : null, profile, filter: filter ? filter[1].replace(/\s+/g, ' ') : null,
          smask: /\/SMask\s+\d+\s+\d+\s+R/.test(d),
          bytes: o.stream ? o.stream[1] - o.stream[0] : 0, stream: o.stream
        });
      }
      if (o.stream && (contents.has(n) || /\/Subtype\s*\/Form/.test(d))) {
        contentStreams++;
        const c = contentOps(await streamText(bytes, o, inflater));
        for (const k of Object.keys(ops)) ops[k] += c.ops[k];
      }
    }
    for (const [op, space] of Object.entries(DEVICE_OPS)) if (ops[op]) spaces.add(space);
    const profiles = [...profileIds].sort((a, b) => a - b).map((id) => {
      const o = objs.get(id);
      const m = o && /\/N\s+(\d+)/.exec(o.dict);
      return { obj: id, n: m ? Number(m[1]) : null };
    });
    const outputIntents = /\/OutputIntents(?![A-Za-z])/.test(s);
    const encrypted = /\/Encrypt\s+(\d+\s+\d+\s+R|<<)/.test(s);
    return { colorSpaces: [...spaces].sort(), ops, profiles, iccProfiles: profiles.length, outputIntents, softMasks, transparencyGroups, alpha, encrypted, images, contentStreams };
  }

  const PROFILE_KIND = { 1: 'gray', 3: 'sRGB', 4: 'CMYK' };
  const profileText = (list) => list.map((p) => `ICC ${PROFILE_KIND[p.n] || '?'} (N ${p.n == null ? '?' : p.n})`).join(', ');

  /**
   * The checks before a cover download (plan §1b, owner Q-a Nov 11: option 2,
   * decided by a KDP Print Previewer test of the Typst file): one page of the
   * computed size (to 0.001 in), no other page boxes, fonts embedded, exactly
   * one color space and it is ICCBased sRGB (one /N 3 profile, as Typst 0.14.2
   * writes rgb() and passes the JPEG through), no other profile, no
   * OutputIntents, no transparency, no encryption. Fails: DeviceRGB,
   * DeviceGray, DeviceCMYK, an ICC gray or CMYK profile, a second profile,
   * a soft mask.
   *   info  read(bytes)   deep  inspect(bytes)   { widthIn, heightIn }
   */
  function coverChecks(info, deep, { widthIn, heightIn }) {
    const want = [0, 0, widthIn * PT, heightIn * PT];
    const TOL = 0.001 * PT;
    const mb = info.pages[0] && info.pages[0].mediaBox;
    const sizeOk = Array.isArray(mb) && mb.length === 4 && mb.every((x, i) => Math.abs(x - want[i]) <= TOL + 1e-9);
    const p = info.pages[0] || {};
    const other = !!(p.cropBox || p.trimBox || p.bleedBox || p.artBox);
    const pc = info.pageCount;
    const notEmbedded = info.fonts.filter((f) => !f.embedded || f.file !== 'FontFile2').map((f) => f.name || f.subtype);
    const type3 = info.fonts.filter((f) => f.subtype === 'Type3').length;
    const spaces = deep.colorSpaces;
    const profiles = deep.profiles || [];
    const oneProfile = profiles.length === 1 && profiles[0].n === 3;
    const oneSpace = spaces.length === 1 && spaces[0] === 'ICCBased' && oneProfile;
    const others = spaces.filter((x) => x !== 'ICCBased');
    const size = (x) => `${Math.round((x / PT) * 1000) / 1000}`;
    return [
      { key: 'size', name: 'Cover size', pass: info.pages.length === 1 && sizeOk && !other,
        detail: !sizeOk ? `page is ${mb ? `${size(mb[2] - mb[0])} x ${size(mb[3] - mb[1])}` : 'missing'} in, needs ${size(want[2])} x ${size(want[3])} in`
          : other ? 'other page boxes (crop or trim marks)' : `${size(want[2])} x ${size(want[3])} in` },
      { key: 'pages', name: 'One page', pass: [pc.tree, pc.rootCount, pc.pageObjects].every((x) => x === 1),
        detail: `file ${pc.tree}/${pc.rootCount}/${pc.pageObjects}` },
      { key: 'fonts', name: 'Fonts embedded', pass: info.fonts.length > 0 && !notEmbedded.length && !type3,
        detail: notEmbedded.length ? `not embedded: ${notEmbedded.join(', ')}` : `${info.fonts.length} fonts embedded` },
      { key: 'color', name: 'One color space (sRGB)', pass: oneSpace,
        detail: !spaces.length ? 'no color found' : [...others, profileText(profiles)].filter(Boolean).join(', ') || spaces.join(', ') },
      { key: 'profile', name: 'One sRGB profile', pass: oneProfile && !deep.outputIntents,
        detail: `${profiles.length ? `${profiles.length} ICC (${profileText(profiles)})` : 'no ICC profile'}${deep.outputIntents ? ', OutputIntents' : ''}` },
      { key: 'transparency', name: 'No transparency', pass: !deep.softMasks && !deep.transparencyGroups && !deep.alpha.length,
        detail: deep.softMasks || deep.transparencyGroups || deep.alpha.length
          ? `${deep.softMasks} soft masks, ${deep.transparencyGroups} groups, alpha ${deep.alpha.join(' ') || 'none'}` : 'none' },
      { key: 'security', name: 'No security', pass: !deep.encrypted, detail: deep.encrypted ? 'encrypted' : 'none' }
    ];
  }

  root.kdpPdfCheck = { read, inflate, checks, ok, inspect, coverChecks, contentOps };
})(globalThis);
