/* ═══════════════════════════════════════════════════
   NicheInk · tests: the in-page side of the real-engine tests (E13.1)
   /tests/browser/format/harness.js   (engine.html; driven by
                                       t-engine-real.mjs, t-fallback.mjs,
                                       t-safari.mjs, make-style-samples.mjs)

   Results are numbers, names and page numbers only (placeholder books).

   kdpFormatHarness.engine(opts)          → one engine for the page (kdpFormatEngine.create)
   kdpFormatHarness.book({ book, style, trim, settings, alsoBy, bookId })
                                          → { data, model, settings, extras, titles }
   kdpFormatHarness.build(engine, spec)   → { pdf, pages, path, fellBack, ms, sha, info, checks, diagnostics }
   kdpFormatHarness.layout(spec, result)  → the 17 checks (layout-checks.js)
   kdpFormatHarness.sriBoth()             → every pinned file from jsdelivr and from unpkg, hashed
   kdpFormatHarness.missing(family)       → characters of TEST_TEXT each face of a family lacks
   kdpFormatHarness.glyphParity(style)    → E13.2: the 07 table equals the real fonts' cmaps
   kdpFormatHarness.cases()               → the converter cases and 300 fuzz strings, printed and read back
   kdpFormatHarness.b64(bytes)
═══════════════════════════════════════════════════ */

(function (root) {
  const H = {};
  // ASCII, accents, curly quotes, dashes, ellipsis, €, ½, ©, an emoji (plan, 5-font test).
  H.TEST_TEXT = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') +
    'àáâäãåæçèéêëìíîïñòóôöõøœùúûüýÿßÀÉÖÜÇÑ' + '‘’“”' + '–—‐' + '…' + '€½©' + '😀';

  let eng = null;
  H.engine = (opts) => (eng = eng || root.kdpFormatEngine.create(opts || {}));

  H.book = ({ book = {}, style = 'classic', trim = '6x9', settings = {}, alsoBy = [], bookId = null } = {}) => {
    const data = root.kdpPlaceholderBook.make(book);
    data.book.trim = trim;
    if (bookId) data.book.id = bookId;
    const st = root.kdpFormatRules.normalize({ ...root.kdpFormatRules.defaults(), ...settings, style });
    const model = root.kdpFormatRules.modelOf(data, st);
    const extras = { year: 2026, trim, alsoBy };
    const titles = [...model.chapters.map((c) => root.kdpFormatTypst.chapterTitle(c)),
      ...(st.parts.about && data.book.bio ? ['About the author'] : []),
      ...(st.parts.also_by && alsoBy.length ? [`Also by ${data.book.pen_name}`] : [])];
    return { data, model, settings: st, extras, titles, trim, bookId: data.book.id };
  };

  H.b64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  H.build = async (engine, spec, extra = {}) => {
    const b = H.book(spec);
    const t0 = performance.now();
    const r = await engine.build({ bookId: b.bookId, model: b.model, settings: b.settings, extras: b.extras, ...extra });
    const roundTrip = performance.now() - t0;
    const info = await root.kdpPdfCheck.read(r.pdf, { inflate: root.kdpPdfCheck.inflate });
    return {
      book: b, pdf: r.pdf, pages: r.pages, path: r.path, fellBack: r.fellBack, diagnostics: r.diagnostics,
      ms: { ...r.ms, roundTrip }, bytes: r.pdf.length, sha: await root.kdpTypstRun.sha384(r.pdf), info,
      checks: root.kdpPdfCheck.checks(info, { trim: b.trim, pages: r.pages }), meta: r.meta, words: b.model.words
    };
  };

  H.layout = async (built) => {
    const pdfjs = await root.kdpTypstRun.loadPdfjs();
    const b = built.book;
    return root.kdpLayoutChecks.run(pdfjs, built.pdf, { meta: built.meta, trim: b.trim, titles: b.titles, bookTitle: b.data.book.title, settings: b.settings });
  };

  H.sriBoth = async () => {
    const F = root.kdpFormatFiles;
    const rows = [];
    for (const f of F.all()) {
      const row = { file: `${f.pkg}/${f.path}` };
      for (const [i, url] of F.urls(f).entries()) {
        const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
        const bytes = new Uint8Array(await r.arrayBuffer());
        row[i ? 'unpkg' : 'jsdelivr'] = (await root.kdpTypstRun.sha384(bytes)) === f.sri && bytes.length === f.bytes;
      }
      rows.push(row);
    }
    return rows;
  };

  H.missing = async (family) => {
    const out = {};
    for (const f of root.kdpFormatFiles.FONTS[family]) {
      const { bytes } = await root.kdpTypstRun.fetchChecked(f);
      const cmap = root.kdpFontCmap.parse(bytes);
      out[f.face] = { format: cmap.format, missing: [...H.TEST_TEXT].filter((ch) => ch !== ' ' && !cmap.has(ch.codePointAt(0))) };
    }
    return out;
  };

  /**
   * E13.2: 07 and 08 agree on missing characters. For one style, every code
   * point of the test text and of the ranges below: the 07 table
   * (kdpQcGlyphs.has) equals "every face has it" read from the real font
   * files with font-cmap. tools/qc-glyphs.mjs --check compares every code point.
   */
  const PARITY_RANGES = [[0x20, 0x24F], [0x2000, 0x21FF], [0x1F600, 0x1F64F]];
  H.glyphParity = async (style) => {
    const cmaps = [];
    for (const f of root.kdpFormatFiles.styleFonts(style)) cmaps.push(root.kdpFontCmap.parse((await root.kdpTypstRun.fetchChecked(f)).bytes));
    const cps = new Set([...H.TEST_TEXT].map((ch) => ch.codePointAt(0)));
    for (const [a, b] of PARITY_RANGES) for (let cp = a; cp <= b; cp++) cps.add(cp);
    const differ = [];
    for (const cp of cps) {
      const real = cmaps.every((m) => m.has(cp));
      if (real !== root.kdpQcGlyphs.has(style, cp)) differ.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
    return { style, faces: cmaps.length, checked: cps.size, differ };
  };

  /** E13.0 cases-page.js: one case per page, read back with pdf.js. */
  H.cases = async (engine) => {
    const T = root.kdpFormatTypst;
    const flat = (s) => String(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, '');
    const cases = root.kdpTypstCases;
    const fuzz = root.kdpTypstFuzz(13, 300);
    const pages = [...cases.map((c) => T.blocks(c.md)), ...fuzz.map((s) => T.escapeText(s))];
    const src = ['#set page(width: 5in, height: auto, margin: 0.4in)', '#set text(font: "Source Serif 4", size: 11pt, hyphenate: false)',
      '#set par(justify: false)', pages.join('\n\n#pagebreak()\n\n')].join('\n');
    await engine.load('modern');
    const res = await engine.buildSource({ bookId: 'cases', style: 'modern', mainTyp: src }).catch((e) => ({ error: e }));
    if (res.error) return { error: `${res.error.message} ${(res.error.diagnostics || []).join('; ')}` };
    const pdfjs = await root.kdpTypstRun.loadPdfjs();
    const task = pdfjs.getDocument({ data: res.pdf.slice(), verbosity: 0, fontExtraProperties: true });
    const doc = await task.promise;
    const rows = [];
    for (let i = 0; i < pages.length; i++) {
      const page = await doc.getPage(i + 1);
      await page.getOperatorList();
      const items = (await page.getTextContent()).items.filter((t) => t.str.length);
      const runs = items.map((t) => ({ str: t.str, font: (page.commonObjs.get(t.fontName) || {}).name || t.fontName }));
      const text = runs.map((r) => r.str).join('');
      const c = i < cases.length ? cases[i] : { name: `fuzz ${i - cases.length + 1}`, text: fuzz[i - cases.length], fuzz: true };
      const why = [];
      if (c.text != null && flat(text) !== flat(c.text)) why.push('text');
      const has = (word, re) => runs.some((r) => r.str.includes(word) && re.test(r.font));
      if (c.bold && !has(c.bold, /Bold/)) why.push('bold');
      if (c.italic && !has(c.italic, /Italic/)) why.push('italic');
      if (c.plain && runs.some((r) => !/-Regular$/.test(r.font))) why.push('plain');
      if (c.link) {
        const links = (await page.getAnnotations()).filter((a) => a.subtype === 'Link').map((a) => a.url || a.unsafeUrl);
        if (!links.some((u) => String(u).replace(/\/$/, '') === c.link)) why.push('link');
      }
      rows.push({ name: c.name, fuzz: !!c.fuzz, pass: !why.length, why });
      page.cleanup();
    }
    const numPages = doc.numPages;
    await task.destroy();
    const named = rows.filter((r) => !r.fuzz), fz = rows.filter((r) => r.fuzz);
    return { casesPassed: named.filter((r) => r.pass).length, casesTotal: named.length, fuzzPassed: fz.filter((r) => r.pass).length,
      fuzzTotal: fz.length, failed: rows.filter((r) => !r.pass).slice(0, 10).map((r) => `${r.name}: ${r.why}`), pages: numPages };
  };

  root.kdpFormatHarness = H;
})(globalThis);
