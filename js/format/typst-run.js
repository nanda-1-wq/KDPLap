/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: download, check and run the print engine (E13.1)
   /js/format/typst-run.js   (used by js/format/engine-worker.js inside the
                              worker, and by js/format/engine.js on the main
                              thread when the worker cannot make the PDF;
                              needs js/format/files.js)

   One code path for both places, so the worker and the main thread make
   the same PDF from the same sources (worker spike, Nov 4: same pages, same
   bytes).

   Downloads: our own fetch streams the body and counts the bytes (progress),
   then checks sha384 with crypto.subtle against the pinned SRI. Same safety
   as fetch(…, { integrity }), which gives no body until the end. Order:
   jsdelivr, jsdelivr again after 1 s, then unpkg. A hash mismatch skips the
   retry. A file that fails its hash is never used.
   E13.2: once jsdelivr fails both tries of a file (no answer or an HTTP
   error, not a wrong file), the next downloads here go to unpkg first and
   jsdelivr second, with no wait. Still two servers for every file. Until a
   reload; the worker and the main thread each learn it once.
   The engine module is imported from a blob URL of the checked bytes; the
   wasm and the fonts go to typst.ts as data, and loadFonts(…, { assets: false })
   stops its own font download. typst.ts fetches nothing by itself.
   typst.ts instantiates the wasm once per imported module: a new style is a
   new compiler with that style's fonts, not a second wasm compile.

   kdpTypstRun.sha384(bytes)              → "sha384-…"
   kdpTypstRun.fetchChecked(file, opts)   → { bytes, url, cdn, tries }
   kdpTypstRun.Loader()                   → { engine(onBytes), compiler(style, onBytes) }
   kdpTypstRun.compile(cc, sources, opts) → { pdf, meta, diagnostics, ms }
     throws an Error with .kind ('typst': the template or the text did not
     compile; 'run': the engine threw) and .phase ('compile', 'query', 'pdf').
   kdpTypstRun.loadPdfjs()                → pdf.js (main thread only)
═══════════════════════════════════════════════════ */

(function (root) {
  const FILES = () => root.kdpFormatFiles;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function sha384(bytes) {
    return `sha384-${b64(new Uint8Array(await crypto.subtle.digest('SHA-384', bytes)))}`;
  }

  /** Stream a URL into one Uint8Array, reporting each chunk's size. */
  async function download(url, onBytes) {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!r.body || !r.body.getReader) {
      const b = new Uint8Array(await r.arrayBuffer());
      onBytes(b.length);
      return b;
    }
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      onBytes(value.length);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  let jsdelivrDown = false;   // E13.2: jsdelivr failed both tries of one file, so unpkg goes first

  /**
   * One pinned file: jsdelivr, jsdelivr again after 1 s, then unpkg (after
   * jsdelivr failed: unpkg, then jsdelivr, no wait). Never returns bytes that
   * fail the hash.
   */
  async function fetchChecked(file, { onBytes = () => {}, retryMs = 1000 } = {}) {
    const [jsd, unpkg] = FILES().urls(file);
    const unpkgFirst = jsdelivrDown;
    const tries = unpkgFirst ? [unpkg, jsd] : [jsd, jsd, unpkg];
    const errors = [];
    for (let i = 0; i < tries.length; i++) {
      if (!unpkgFirst && i === 1) {
        if (errors[0] && errors[0].hash) continue;   // a wrong file: straight to the other CDN
        await sleep(retryMs);
      }
      // Both jsdelivr tries failed with no answer or an HTTP error: unpkg first from now on.
      if (!unpkgFirst && i === 2 && errors.length === 2 && !errors.some((x) => x.hash)) jsdelivrDown = true;
      let got = 0;
      try {
        const bytes = await download(tries[i], (n) => { got += n; onBytes(n); });
        if ((await sha384(bytes)) !== file.sri) {
          onBytes(-got);
          errors.push({ url: tries[i], hash: true });
          continue;
        }
        return { bytes, url: tries[i], cdn: tries[i] === jsd ? 'jsdelivr' : 'unpkg', tries: i + 1 };
      } catch (e) {
        onBytes(-got);
        errors.push({ url: tries[i], message: String(e && e.message) });
      }
    }
    const err = new Error(`Could not download ${file.path}`);
    err.kind = 'download';
    err.errors = errors;
    throw err;
  }

  async function importBytes(bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    try { return await import(url); } finally { URL.revokeObjectURL(url); }
  }

  /**
   * The engine and the fonts, downloaded once and kept. compiler(style) makes
   * one compiler per style (the last one is kept; a new style replaces it).
   */
  function Loader() {
    let enginePromise = null;
    const fonts = new Map();   // file path → Promise<Uint8Array>
    let current = null;        // { style, cc }
    const cdns = [];

    function engine(onBytes) {
      if (!enginePromise) {
        enginePromise = (async () => {
          const [js, wasm] = await Promise.all([
            fetchChecked(FILES().ENGINE.js, { onBytes }),
            fetchChecked(FILES().ENGINE.wasm, { onBytes })
          ]);
          cdns.push(js.cdn, wasm.cdn);
          return { mod: await importBytes(js.bytes), wasm: wasm.bytes };
        })();
        enginePromise.catch(() => { enginePromise = null; });
      }
      return enginePromise;
    }

    function font(file, onBytes) {
      if (!fonts.has(file.path)) {
        const p = fetchChecked(file, { onBytes }).then((r) => { cdns.push(r.cdn); return r.bytes; });
        p.catch(() => fonts.delete(file.path));
        fonts.set(file.path, p);
      }
      return fonts.get(file.path);
    }

    async function compiler(style, onBytes = () => {}) {
      if (current && current.style === style) return current.cc;
      const [eng, faces] = await Promise.all([
        engine(onBytes),
        Promise.all(FILES().styleFonts(style).map((f) => font(f, onBytes)))
      ]);
      const cc = eng.mod.createTypstCompiler();
      // getModule is read only the first time: the wasm is instantiated once per module.
      await cc.init({ getModule: () => eng.wasm, beforeBuild: [eng.mod.loadFonts(faces, { assets: false })] });
      eng.wasm = null;
      current = { style, cc };
      return cc;
    }

    /** Bytes the chosen style still needs (for the progress bar). */
    function pending(style) {
      let n = 0;
      if (!enginePromise) n += FILES().ENGINE.js.bytes + FILES().ENGINE.wasm.bytes;
      for (const f of FILES().styleFonts(style)) if (!fonts.has(f.path)) n += f.bytes;
      return n;
    }

    return { engine, compiler, pending, cdns };
  }

  const fail = (kind, phase, e) => {
    const err = new Error(String(e && e.message || e));
    err.kind = kind;
    err.phase = phase;
    err.name2 = e && e.name;
    return err;
  };

  /**
   * Compile /main.typ with the given sources, read the markers, export the PDF.
   * opts.testOverflowPdf: test only (tests/browser/format), throws Safari's
   * stack overflow in the PDF step, as the real one (spike, Nov 4).
   */
  async function compile(cc, sources, opts = {}) {
    for (const [path, text] of Object.entries(sources)) cc.addSource(path, text);
    let phase = 'compile';
    try {
      return await cc.runWithWorld({ mainFilePath: '/main.typ' }, async (w) => {
        const t0 = now();
        const c = await w.compile({ diagnostics: 'full' });
        const t1 = now();
        if (c.hasError) {
          const err = new Error('The book did not compile.');
          err.kind = 'typst';
          err.phase = 'compile';
          err.diagnostics = (c.diagnostics || []).map((d) => `${d.severity || 'error'}: ${d.message || d}`);
          throw err;
        }
        phase = 'query';
        const q = (selector) => w.query({ selector, field: 'value' });
        const meta = {
          lastPage: (await q('<last-page>'))[0],
          contentEnd: (await q('<content-end>'))[0],
          starts: (await q('<part-start>')).map((v) => v.page),
          ends: await q('<part-end>'),
          headings: (await q('<headings>'))[0],
          typstVersion: (await q('<typst-version>'))[0]
        };
        const t2 = now();
        phase = 'pdf';
        if (opts.testOverflowPdf) throw new RangeError('Maximum call stack size exceeded.');
        const pdf = await w.pdf({ diagnostics: 'full' });
        const t3 = now();
        const bytes = pdf.result;
        return {
          pdf: bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice(),
          meta,
          diagnostics: [...(c.diagnostics || []), ...(pdf.diagnostics || [])].map((d) => `${d.severity || 'warning'}: ${d.message || d}`),
          ms: { layout: t1 - t0, query: t2 - t1, pdf: t3 - t2, total: t3 - t0 }
        };
      });
    } catch (e) {
      if (e && e.kind === 'typst') throw e;
      throw fail('run', phase, e);
    }
  }

  let pdfjsPromise = null;
  /** pdf.js 6.4.299 with its own worker, both checked (main thread only). */
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = (async () => {
        const [js, worker] = await Promise.all([fetchChecked(FILES().PDFJS.js), fetchChecked(FILES().PDFJS.worker)]);
        const lib = await importBytes(js.bytes);
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker.bytes], { type: 'text/javascript' }));
        return lib;
      })();
      pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
  }

  root.kdpTypstRun = { sha384, fetchChecked, Loader, compile, loadPdfjs, unpkgFirst: () => jsdelivrDown };
})(globalThis);
