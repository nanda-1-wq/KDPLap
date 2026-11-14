/* ═══════════════════════════════════════════════════
   NicheInk · tests: the in-page side of the 09 Cover real-engine tests (E16 Part 2)
   /tests/browser/cover/harness.js   (engine.html; driven by t-engine-real.mjs,
                                      t-safari-real.mjs, t-metrics-real.mjs, qa-files.mjs)

   kdpCoverHarness.ready
   kdpCoverHarness.engine()                 → one print engine for the page
   kdpCoverHarness.photo(seed, w, h)        → a canvas: a synthetic photo (sky, sun, hills, grain), the same for a seed
   kdpCoverHarness.cutout(seed, w, h)       → a canvas with transparency (a flower on nothing): a transparent PNG
   kdpCoverHarness.images(l)                → the picture of an image layer ("photo:<n>", "cutout:<n>", or by id)
   kdpCoverHarness.cover(spec)              → a normalized cover: { sheet } or { layout } with { fmt }
   kdpCoverHarness.print(cover)             → the export print result, small (checks, numbers, b64 PDF)
   kdpCoverHarness.image(cover, format)     → { b64, w, h, ms, type }
   kdpCoverHarness.kindle(cover)            → { b64, w, h, color, mode, ms }
   kdpCoverHarness.roundTrip(pdf, cover, dpi) → the PDF drawn by pdf.js against the renderer: mean and p99 difference
   kdpCoverHarness.canvasLimit()            → the largest canvas area this browser paints (binary search)
   kdpCoverHarness.b64(bytes) / fromB64(s)
═══════════════════════════════════════════════════ */
(function (root) {
  const C = root.kdpCover;
  const H = {};

  H.b64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  H.fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  let eng = null;
  H.engine = () => (eng = eng || root.kdpFormatEngine.create({}));

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const cache = new Map();
  H.photo = (seed, w = 4800, h = 3200) => {
    const key = `photo:${seed}:${w}x${h}`;
    if (cache.has(key)) return cache.get(key);
    const r = rng(seed * 7919 + 1);
    const cv = C.render.canvas(w, h);
    const g = cv.getContext('2d', { alpha: false });
    const hue = Math.floor(r() * 360);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, `hsl(${hue}, 55%, 35%)`); sky.addColorStop(0.6, `hsl(${(hue + 30) % 360}, 70%, 70%)`); sky.addColorStop(1, `hsl(${(hue + 50) % 360}, 80%, 82%)`);
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = `hsla(${(hue + 50) % 360}, 90%, 92%, 0.9)`;
    g.beginPath(); g.arc(w * (0.2 + r() * 0.6), h * (0.25 + r() * 0.2), h * 0.09, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) {
      const y0 = h * (0.5 + k * 0.12);
      g.fillStyle = `hsl(${(hue + 160 + k * 12) % 360}, ${35 + k * 8}%, ${40 - k * 8}%)`;
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 48) g.lineTo(x, y0 + Math.sin(x / w * (3 + k) * Math.PI + r() * 0.4 + k) * h * 0.05 + (r() - 0.5) * h * 0.01);
      g.lineTo(w, h); g.closePath(); g.fill();
    }
    // Grain: realistic for JPEG sizes.
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    cache.set(key, cv);
    return cv;
  };
  H.cutout = (seed, w = 1200, h = 1200) => {
    const key = `cutout:${seed}:${w}x${h}`;
    if (cache.has(key)) return cache.get(key);
    const cv = C.render.canvas(w, h);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    for (let k = 0; k < 8; k++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = `hsla(${(seed * 37 + k * 12) % 360}, 80%, 60%, 0.85)`;
      g.beginPath(); g.ellipse(0, -h * 0.22, w * 0.09, h * 0.2, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#F2C14E'; g.beginPath(); g.arc(0, 0, w * 0.1, 0, Math.PI * 2); g.fill();
    cache.set(key, cv);
    return cv;
  };
  H.images = (l) => {
    const a = String(l.asset || '');
    const m = /^(photo|cutout):(\d+)$/.exec(a);
    if (m && m[1] === 'cutout') return H.cutout(Number(m[2]));
    return H.photo(m ? Number(m[2]) : Number(l.id) || 1);
  };

  H.cover = (spec) => {
    const raw = spec.sheet ? root.kdpCoverQa.sheet(spec.sheet, spec.fmt) : root.kdpCoverQa.layout(spec.layout, spec.fmt);
    return C.model.normalize(raw);
  };

  H.print = async (cover, opt = {}) => {
    const r = await C.export.print(cover, { engine: H.engine(), images: H.images, bookId: opt.bookId });
    const out = {
      ok: r.ok, checks: r.checks.map((c) => ({ key: c.key, pass: c.pass, detail: c.detail, worst: c.worst })),
      ms: r.ms, bytes: r.pdf.length, path: r.build.path, fonts: r.typst.faces.map((f) => `${f.family} ${f.weight}`),
      patches: r.patches.map((p) => ({ path: p.path, box: p.box, bytes: p.bytes.length, color: C.imagePrep.jpegColor(p.bytes).why || 'ok' })),
      plan: r.plan.items.map((it) => (it.kind === 'patch' ? `P${it.n}${it.effectOnly != null ? 'e' : ''}[${it.holds.length}]` : `${it.id}${it.part === 'letters' ? 'L' : ''}`)).join(' '),
      lines: r.typst.lines.length, typstBytes: r.typst.mainTyp.length,
      sha: await root.kdpTypstRun.sha384(r.pdf)
    };
    if (opt.keep) { out.pdf = H.b64(r.pdf); out.mainTyp = r.typst.mainTyp; }
    H.last = r;
    return out;
  };
  H.image = async (cover, format, opt = {}) => {
    const r = await C.export.image(cover, { format, images: H.images });
    const head = C.imagePrep.sniff(r.bytes);
    return { w: r.w, h: r.h, ms: r.ms, type: r.type, bytes: r.bytes.length, sniff: head, b64: opt.keep ? H.b64(r.bytes) : null };
  };
  H.kindle = async (cover, opt = {}) => {
    const r = await C.export.kindle(cover, { images: H.images });
    return { w: r.w, h: r.h, ms: r.ms, mode: r.mode, color: r.color, size: r.size, bytes: r.bytes.length, b64: opt.keep ? H.b64(r.bytes) : null };
  };

  /**
   * The PDF as pdf.js draws it, against the renderer's own picture, both at dpi
   * (default 100). The difference per pixel (0..255, the largest of R, G, B):
   * mean, p99, share over 64. Also the step at the patch edges: the mean
   * difference in a 2 px band just inside and just outside each patch box,
   * between the PDF and itself (a JPEG background next to a vector one).
   */
  H.roundTrip = async (pdfBytes, cover, dpi = 100) => {
    const pdfjs = await root.kdpTypstRun.loadPdfjs();
    const doc = await pdfjs.getDocument({ data: pdfBytes.slice(), isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const a = document.createElement('canvas'); a.width = Math.round(vp.width); a.height = Math.round(vp.height);
    await page.render({ canvasContext: a.getContext('2d'), viewport: vp, background: 'rgb(255,255,255)' }).promise;
    const b = C.render.canvas(a.width, a.height);
    C.render.paint(b.getContext('2d', { alpha: false }), cover, { scale: dpi / 70, images: H.images });
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, db = b.getContext('2d').getImageData(0, 0, a.width, a.height).data;
    const hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      hist[d]++; sum += d;
    }
    const n = da.length / 4;
    let acc = 0, p99 = 0;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= n * 0.99) { p99 = k; break; } }
    let over = 0; for (let k = 65; k < 256; k++) over += hist[k];
    if (doc.destroy) await doc.destroy(); else if (doc.cleanup) await doc.cleanup();
    return { w: a.width, h: a.height, mean: sum / n, p99, over64: over / n };
  };

  /**
   * The patch-edge step: the PDF drawn by pdf.js at 300 DPI around each patch; along every edge
   * that is not a page edge, the color difference between the pixel 2 px inside and 2 px outside.
   * Median and 90th percentile per patch (an edge crossing other content counts that content too,
   * so the median is the seam on plain background).
   */
  H.seams = async (pdfBytes, cover, result) => {
    const pdfjs = await root.kdpTypstRun.loadPdfjs();
    const doc = await pdfjs.getDocument({ data: pdfBytes.slice(), isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const P = C.geo.px300(C.geo.geo(cover.fmt));
    const out = [];
    for (const p of result.patches.slice(0, 8)) {
      const b = p.box, pad = 6;
      const w = Math.min(b.x1 - b.x0 + 2 * pad, 2400), h = Math.min(b.y1 - b.y0 + 2 * pad, 2400);
      const vp = page.getViewport({ scale: 300 / 72, offsetX: -(b.x0 - pad), offsetY: -(b.y0 - pad) });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, background: 'rgb(255,255,255)' }).promise;
      const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
      const at = (x, y) => (y * w + x) * 4;
      const diff = (x1, y1, x2, y2) => { const i = at(x1, y1), o = at(x2, y2); return Math.max(Math.abs(d[i] - d[o]), Math.abs(d[i + 1] - d[o + 1]), Math.abs(d[i + 2] - d[o + 2])); };
      const s = [];
      const iw = Math.min(w - pad, pad + b.x1 - b.x0), ih = Math.min(h - pad, pad + b.y1 - b.y0);
      if (b.y0 > 0) for (let x = pad + 3; x < iw - 3; x += 2) s.push(diff(x, pad + 2, x, pad - 3));
      if (b.y1 < P.h && ih + 3 < h) for (let x = pad + 3; x < iw - 3; x += 2) s.push(diff(x, ih - 3, x, ih + 2));
      if (b.x0 > 0) for (let y = pad + 3; y < ih - 3; y += 2) s.push(diff(pad + 2, y, pad - 3, y));
      if (b.x1 < P.w && iw + 3 < w) for (let y = pad + 3; y < ih - 3; y += 2) s.push(diff(iw - 3, y, iw + 2, y));
      s.sort((x, y) => x - y);
      out.push({ path: p.path, samples: s.length, median: s.length ? s[s.length >> 1] : null, p90: s.length ? s[Math.floor(s.length * 0.9)] : null });
    }
    if (doc.destroy) await doc.destroy();
    return out;
  };

  /** The largest square canvas this browser really paints (doubling, then a binary search on the side). */
  H.canvasLimit = async () => {
    const paints = (w, h) => {
      try {
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        if (!g) return false;
        g.fillStyle = '#FF0000'; g.fillRect(w - 2, h - 2, 2, 2);
        const p = g.getImageData(w - 1, h - 1, 1, 1).data;
        cv.width = 0;
        return p[0] === 255 && p[3] === 255;
      } catch (e) { return false; }
    };
    const res = { full85x11: paints(5355, 3375), wrap8x10: paints(5055, 3075) };
    let lo = 1024, hi = 32768;
    while (hi - lo > 64) { const mid = Math.floor((lo + hi) / 2); if (paints(mid, mid)) lo = mid; else hi = mid; }
    res.squareSide = lo; res.squareArea = lo * lo;
    let wlo = 1024, whi = 65536;
    while (whi - wlo > 64) { const mid = Math.floor((wlo + whi) / 2); if (paints(mid, 64)) wlo = mid; else whi = mid; }
    res.maxWidth = wlo;
    return res;
  };


  /**
   * The 288 layout cases (12 layouts × 6 trims × 54/120 pages × 2 papers) and the 24 Blank
   * cases, built and checked twice: with the stub widths (Part 1) and with the real fonts
   * (ctx.measureText on the pinned files, the catalog's metrics). Also the spine text by cap
   * height with the real metrics, from each paper's threshold.
   */
  H.metrics288 = async () => {
    const TL = C.textlayout, K = C;
    const book = root.kdpCoverQa.BOOK;
    const trims = K.geo.TRIMS, pagesList = [54, 120], papers = ['white', 'cream'];
    const keys = K.layouts.KEYS.filter((k) => k !== 'blank');
    const build = (key, fmt) => K.layouts.build(key, book, fmt, 1);
    // Stub first (no catalog metrics, no real widths): the Part 1 numbers.
    TL.setMeasure(null); TL.setMetricsSource(null);
    const stub = new Map();
    for (const key of keys) for (const trim of trims) for (const pages of pagesList) for (const paper of papers) {
      const fmt = { trim, pages, paper }, b = build(key, fmt);
      stub.set(`${key}|${trim}|${pages}|${paper}`, { b, items: K.checks.run({ fmt, bg: b.bg, layers: b.layers }) });
    }
    // Real fonts.
    const all = new Set();
    for (const key of keys) for (const l of build(key, { trim: '6x9', pages: 120, paper: 'white' }).layers) if (l.type === 'text') all.add(`${l.font}|${l.weight}`);
    all.add('IBM Plex Sans|600');
    await Promise.all([...all].map((x) => { const [f, w] = x.split('|'); return K.fonts.load(f, Number(w)); }));
    K.fonts.install(); TL.setMeasure(K.fonts.measure);
    const cases = [];
    for (const key of keys) for (const trim of trims) for (const pages of pagesList) for (const paper of papers) {
      const fmt = { trim, pages, paper }, b = build(key, fmt);
      const items = K.checks.run({ fmt, bg: b.bg, layers: b.layers });
      const st = stub.get(`${key}|${trim}|${pages}|${paper}`);
      let dy = 0, linesChanged = [];
      b.layers.forEach((l, i) => {
        const o = st.b.layers[i];
        if (!o) return;
        dy = Math.max(dy, Math.abs(l.y - o.y));
        if (l.type === 'text') { const a = TL.lines(l).length, z = (TL.setMeasure(null), TL.lines(o).length); TL.setMeasure(K.fonts.measure); if (a !== z) linesChanged.push(`${l.src || l.id}: ${z}→${a}`); }
      });
      cases.push({ key, trim, pages, paper,
        real: items.filter((x) => x.sev !== 'tip').map((x) => `${x.code} ${x.sev} ${x.msg}`),
        stub: st.items.filter((x) => x.sev !== 'tip').map((x) => `${x.code} ${x.sev} ${x.msg}`), dy, linesChanged });
    }
    const blank = [];
    for (const trim of trims) for (const pages of pagesList) for (const paper of papers) {
      const items = K.checks.run({ fmt: { trim, pages, paper }, bg: '#FFFFFF', layers: [] });
      blank.push({ trim, pages, paper, errors: items.filter((x) => x.sev === 'error').map((x) => x.code).join(' '), warns: items.filter((x) => x.sev === 'warn').length });
    }
    // Spine text with the real metrics: one line, the size, and the checks, from the threshold.
    const spine = [];
    for (const trim of trims) for (const paper of papers) for (const pages of [K.geo.SPINE_MIN[paper], 100, 120, 240, 828]) {
      const fmt = { trim, pages, paper };
      const b = build('band', fmt), sp = K.layouts.spineLayer(1000, fmt, book);
      if (!sp) { spine.push({ trim, paper, pages, size: null }); continue; }
      const items = K.checks.run({ fmt, bg: b.bg, layers: b.layers.concat([sp]) });
      spine.push({ trim, paper, pages, size: sp.size, lines: TL.lines(sp).length, problems: items.filter((x) => x.sev !== 'tip').map((x) => `${x.code} ${x.msg}`) });
    }
    return { cases, blank, spine, caps: { plex600: K.fonts.metrics('IBM Plex Sans', 600) } };
  };

  /**
   * Every catalog face (or a slice): Typst sets "Hamburgefonstiv" in it; the PDF must embed exactly
   * that face (its PostScript name), with no font warning, and Typst's width must equal the
   * canvas's measureText width within 0.5%.
   */
  H.fontSweep = async (from, to) => {
    const rows = C.fontCatalog;
    const faces = [];
    rows.forEach((r) => Object.keys(r[4]).forEach((w) => faces.push([r[0], Number(w)])));
    const slice = faces.slice(from, to);
    const out = [];
    const BATCH = 24;
    for (let i = 0; i < slice.length; i += BATCH) {
      const part = slice.slice(i, i + BATCH);
      const fs = await Promise.all(part.map(([f, w]) => C.fonts.load(f, w)));
      const lines = ['#import "/cover.typ": *', '#set page(width: 8in, height: 20in, margin: 0pt, fill: rgb("#FFFFFF"))', '#set text(fill: rgb("#1C1C1A"))'];
      const words = [];
      fs.forEach((f, k) => {
        const cmap = kdpFontCmap.parse(C.fonts.bytes(f));
        const word = [...'Hamburgefonstiv'].filter((ch) => cmap.has(ch.codePointAt(0))).join('') || 'H';
        words.push(word);
        const st = f.typstStretch !== 100 ? `, stretch: ${f.typstStretch}%` : '';
        lines.push(`#run(10, ${30 + k * 40}, ${C.typst.str(f.typst)}, ${f.typstWeight}, 20, rgb("#1C1C1A"), 0, ${C.typst.str(word)}${st})`);
        lines.push(`#fit(${C.typst.str(String(k))}, 0, ${C.typst.str(f.typst)}, ${f.typstWeight}, 20, 0, ${C.typst.str(word)}${st})`);
      });
      let b;
      try {
        b = await H.engine().buildSource({ bookId: 'sweep', style: C.fonts.fontSet(fs), mainTyp: lines.join('\n') + '\n', kind: 'cover' });
      } catch (e) { part.forEach(([f, w]) => out.push({ family: f, weight: w, error: e.message })); continue; }
      const info = await root.kdpPdfCheck.read(b.pdf, { inflate: root.kdpPdfCheck.inflate });
      const names = info.fonts.map((x) => String(x.name || '').replace(/^[A-Z]{6}\+/, ''));
      const warn = (b.diagnostics || []).map((d) => String(d.message || d));
      const marks = new Map((b.meta.cover || []).map((m) => [m.id, m.w]));
      fs.forEach((f, k) => {
        const canvasW = C.fonts.measure(f.family, f.weight, 20 * 70 / 72, words[k]) * 72 / 70;
        const typstW = marks.get(String(k));
        out.push({ family: f.family, weight: f.weight, ps: f.ps, embedded: names.includes(f.ps), canvasW, typstW, diff: typstW ? Math.abs(typstW - canvasW) / typstW : null,
          warn: warn.filter((m) => m.toLowerCase().includes(`font family: ${f.typst.toLowerCase()}`)) });
      });
      const extra = names.filter((n) => !fs.some((f) => f.ps === n));
      if (extra.length) out.push({ batch: i, extra });
      const stray = warn.filter((m) => !fs.some((f) => m.toLowerCase().includes(`font family: ${f.typst.toLowerCase()}`)));
      if (stray.length) out.push({ batch: i, stray });
    }
    return out;
  };

  H.ready = true;
  root.kdpCoverHarness = H;
})(globalThis);
