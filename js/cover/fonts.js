/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: fonts (E16 Part 2, plan §8)
   /js/cover/fonts.js   (needs js/cover/font-catalog.js; the browser part needs
                         js/format/files.js and js/format/typst-run.js;
                         the pure part is tested by tests/cover-fonts.test.js)

   One place decides which file draws a text, for the canvas and for Typst
   alike (plan D5: no fake bold). A weight the family has no file for snaps
   to the nearest weight it has (heavier first when the request is 500 or
   more, lighter first under 500). The canvas gets each file under its own
   family name ("cv-<n>-<weight>"), so it can never synthesize a bold;
   Typst gets exactly the files in use and the family name written in the
   file (Typst warns but does not fail on an unknown name, and silently
   picks the nearest weight: both are guarded here and in the export check).

   Pure:
   kdpCover.fonts.families()               → [{ family, group, weights, licence }] in popularity order
   kdpCover.fonts.has(family)              → the catalog has it
   kdpCover.fonts.snap(family, weight)     → the weight that has a file (400, 600 or 700), or null (unknown family)
   kdpCover.fonts.face(family, weight)     → { family, weight, file: { pkg, path, bytes, sri }, ps, typst, typstWeight, typstStretch, cap, asc, desc } or null
                                             (typst: the family name Typst gives the file; Typst selects by it, the
                                             file's weight class and its width: "Roboto Condensed" is "Roboto" at 75%)
   kdpCover.fonts.metrics(family, weight)  → { cap, asc, desc } in em (fallback cap 0.70 when the file has none), or null
   kdpCover.fonts.used(layers)             → [face] every face the exported text layers draw (unique, sorted)
   kdpCover.fonts.fontSet(faces)           → { key, files } for kdpFormatEngine (a cover font set)
   kdpCover.fonts.canvasName(face)         → "cv-<n>-<weight>"
   kdpCover.fonts.install()                → textlayout reads the catalog's metrics (cap, ascender, descender)

   Browser:
   kdpCover.fonts.load(family, weight)     → Promise<face> the TTF fetched (jsdelivr, then unpkg, sha384 checked)
                                             and added to document.fonts; cached
   kdpCover.fonts.loadAll(layers)          → Promise<[face]> every face the layers use
   kdpCover.fonts.loaded(face)             → it is ready to draw
   kdpCover.fonts.bytes(face)              → the checked bytes (Uint8Array) or null
   kdpCover.fonts.measure                  → measure(font, weight, sizePx, text) for textlayout.setMeasure
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const FALLBACK_CAP = 0.7;
  const STRETCH = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];   // OS/2 usWidthClass 1 to 9, in %

  let index = null;   // family → { row, n }
  function idx() {
    if (index) return index;
    const rows = C.fontCatalog || [];
    index = new Map(rows.map((row, n) => [row[0], { row, n }]));
    return index;
  }

  const families = () => (C.fontCatalog || []).map((r) => ({ family: r[0], group: r[1], weights: Object.keys(r[4]).map(Number), licence: r[2] }));
  const has = (family) => idx().has(family);

  function snap(family, weight) {
    const e = idx().get(family);
    if (!e) return null;
    const ws = Object.keys(e.row[4]).map(Number).sort((a, b) => a - b);
    const w = Number(weight) || 400;
    if (ws.includes(w)) return w;
    const heavyFirst = w >= 500;
    return ws.slice().sort((a, b) => (Math.abs(a - w) - Math.abs(b - w)) || (heavyFirst ? b - a : a - b))[0];
  }

  function face(family, weight) {
    const e = idx().get(family);
    if (!e) return null;
    const w = snap(family, weight);
    const f = e.row[4][w];
    return {
      family, weight: w, n: e.n, licence: e.row[2],
      file: { pkg: e.row[3], path: f[0], bytes: f[1], sri: f[2] },
      ps: f[3], typst: f[4] || family, cap: f[5] == null ? FALLBACK_CAP : f[5], capMeasured: f[5] != null, asc: f[6], desc: f[7],
      // What Typst selects by (its family, the file's OS/2 weight and width classes): never our snapped weight.
      typstWeight: f[8] || w, typstStretch: STRETCH[(f[9] || 5) - 1] || 100
    };
  }

  function metrics(family, weight) {
    const f = face(family, weight);
    return f ? { cap: f.cap, asc: f.asc, desc: f.desc } : null;
  }

  const canvasName = (f) => `cv-${f.n}-${f.weight}`;

  /** Faces of the text layers that print (hidden and excluded layers skipped). */
  function used(layers) {
    const seen = new Map();
    for (const l of layers || []) {
      if (l.type !== 'text' || l.hidden || l.noExport || !String(l.text || '').trim()) continue;
      const f = face(l.font, l.weight);
      if (f) seen.set(`${f.family}|${f.weight}`, f);
    }
    return [...seen.values()].sort((a, b) => a.n - b.n || a.weight - b.weight);
  }

  /** The engine's font set: the key names the files, so the same set reuses the same compiler. */
  function fontSet(faces) {
    const files = faces.map((f) => f.file);
    return { key: files.map((f) => `${f.pkg}/${f.path}`).join('|') || 'none', files };
  }

  /** textlayout's ink band and spine size read the catalog (cap height, hhea ascender and descender). */
  function install() {
    if (C.textlayout && C.textlayout.setMetricsSource) C.textlayout.setMetricsSource((font, weight) => metrics(font, weight));
  }

  /* ── Browser ── */
  const state = new Map();   // canvasName → { promise, bytes, ready }

  function load(family, weight) {
    const f = face(family, weight);
    if (!f) return Promise.reject(Object.assign(new Error(`Unknown font: ${family}`), { kind: 'font' }));
    const name = canvasName(f);
    let s = state.get(name);
    if (!s) {
      s = { ready: false, bytes: null };
      s.promise = (async () => {
        const got = await root.kdpTypstRun.fetchChecked(f.file);
        const ff = new root.FontFace(name, got.bytes, { weight: '400', style: 'normal' });
        await ff.load();
        root.document.fonts.add(ff);
        s.bytes = got.bytes;
        s.ready = true;
        return f;
      })();
      s.promise.catch(() => state.delete(name));
      state.set(name, s);
    }
    return s.promise;
  }

  function loadAll(layers) {
    const want = new Map();
    for (const l of layers || []) if (l.type === 'text') { const f = face(l.font, l.weight); if (f) want.set(canvasName(f), f); }
    return Promise.all([...want.values()].map((f) => load(f.family, f.weight)));
  }

  const loaded = (f) => !!(f && state.get(canvasName(f)) && state.get(canvasName(f)).ready);
  const bytes = (f) => { const s = f && state.get(canvasName(f)); return s ? s.bytes : null; };

  let mctx = null;
  /** textlayout's measure: the real advance widths (with kerning) of the loaded file. */
  function measure(font, weight, sizePx, text) {
    const f = face(font, weight);
    if (!mctx) {
      const cv = root.OffscreenCanvas ? new root.OffscreenCanvas(8, 8) : root.document.createElement('canvas');
      mctx = cv.getContext('2d');
    }
    const fam = f && loaded(f) ? `"${canvasName(f)}"` : 'serif';
    // Measured at 100 px and scaled: widths are linear in the size, as in Typst (no hinting at small sizes).
    mctx.font = `100px ${fam}`;
    mctx.fontKerning = 'normal';
    return mctx.measureText(String(text)).width * sizePx / 100;
  }

  C.fonts = { FALLBACK_CAP, families, has, snap, face, metrics, used, fontSet, canvasName, install, load, loadAll, loaded, bytes, measure };
})(globalThis);
