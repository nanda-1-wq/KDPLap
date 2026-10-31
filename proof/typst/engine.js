/* ═══════════════════════════════════════════════════
   NicheInk — E13.0 Typst proof: load the engine (throwaway)
   /proof/typst/engine.js   (used by bench.js and cases-page.js)

   Every file comes from jsdelivr at a pinned version and is fetched by our
   own code with an SRI hash (fetch(url, { integrity })). The engine and
   pdf.js are ES modules: the checked text is imported from a blob URL, so
   no module is loaded without its hash. The wasm and the fonts are handed
   to typst.ts as data; typst.ts fetches nothing by itself
   (loadFonts(…, { assets: false }) turns off its default font download).

   kdpTypstEngine.CONFIG
   kdpTypstEngine.loadEngine(marks) → a typst.ts compiler (marks gets times)
   kdpTypstEngine.compileBook(cc, mainTyp, bookTyp) → { diagnostics, meta, pdf, ms }
   kdpTypstEngine.loadPdfjs()       → pdf.js, with its worker
   kdpTypstEngine.inflate(bytes)    → zlib inflate (for pdf-check.js)
═══════════════════════════════════════════════════ */

(function (root) {
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const FONT = `${CDN}@expo-google-fonts/source-serif-4@0.4.2/`;
  const CONFIG = {
    engine: { url: `${CDN}@myriaddreamin/typst.ts@0.7.0/dist/esm/main.bundle.js`, sri: 'sha384-ti3p6Aop/bL76GOJxe8C3WL2Imx9nlAeSVcGjghEO++WVj/4Yzg38goFRlWWIick' },
    wasm: { url: `${CDN}@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm`, sri: 'sha384-YB32Rpk4pOvEGytOZweRBgdbuwNueLVpzJUQojjit/A8AveMWxDW8eT9ROz98jDo' },
    fonts: [
      { url: `${FONT}400Regular/SourceSerif4_400Regular.ttf`, sri: 'sha384-Jlt+K7yeFCc67xw3+C+XDZSmk/5NVYJzzuqiHf9FEn7EYjxW4k7CtsAY3nLz/znC' },
      { url: `${FONT}400Regular_Italic/SourceSerif4_400Regular_Italic.ttf`, sri: 'sha384-Y6peJRFDO0JNUXW9tDh0KdoPI0bCyQcAdDGWASLNjeyESYn0fIOf9Z6W0yv4t1t1' },
      { url: `${FONT}700Bold/SourceSerif4_700Bold.ttf`, sri: 'sha384-9p3FI88EsdgXkS/uWM6PZC6fR6VDQSoJbqlUcmsc7YcFUXIA7Tinsc9j1aNvj+6p' },
      { url: `${FONT}700Bold_Italic/SourceSerif4_700Bold_Italic.ttf`, sri: 'sha384-GAZZ4PPQdHyCqej4dJn6MHk8u7cfiatViSSRmye4zudmAZvlsYgcb0v7YE9gxpvj' },
    ],
    // pdf.js reads the PDF back for the checks only. It is not part of the engine.
    pdfjs: { url: `${CDN}pdfjs-dist@6.4.299/build/pdf.min.mjs`, sri: 'sha384-QCvhu/UPp22U/TNLVbQNONL82ES2yY717GAiqP9VVu37Y7+m9VPKvadGx9XlFvcp' },
    pdfjsWorker: { url: `${CDN}pdfjs-dist@6.4.299/build/pdf.worker.min.mjs`, sri: 'sha384-NfW/OTMWezITv4oaALvfH7MFLwzPxEvpySmDpoALa1mtTY8MC200l0ZNFD+SOlrM' },
  };

  async function fetchChecked(f) {
    const r = await fetch(f.url, { integrity: f.sri, mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error(`${f.url}: HTTP ${r.status}`);
    return r;
  }

  const blobUrl = async (f) => URL.createObjectURL(new Blob([await (await fetchChecked(f)).text()], { type: 'text/javascript' }));

  async function importChecked(f) {
    const url = await blobUrl(f);
    try { return await import(url); } finally { URL.revokeObjectURL(url); }
  }

  async function loadEngine(marks = {}) {
    const mark = (k) => { marks[k] = performance.now(); };
    // All three downloads start at once.
    const wasm = fetchChecked(CONFIG.wasm).then((r) => { mark('wasmFetched'); return r; });
    const fonts = Promise.all(CONFIG.fonts.map(async (f) => new Uint8Array(await (await fetchChecked(f)).arrayBuffer())))
      .then((x) => { mark('fontsReady'); return x; });
    const mod = await importChecked(CONFIG.engine);
    mark('scriptReady');
    const cc = mod.createTypstCompiler();
    await cc.init({ getModule: () => wasm, beforeBuild: [mod.loadFonts(await fonts, { assets: false })] });
    mark('compilerReady');
    return cc;
  }

  /** Compile main.typ (which imports /book.typ), read the markers, export the PDF. */
  async function compileBook(cc, mainTyp, bookTyp) {
    cc.addSource('/main.typ', mainTyp);
    if (bookTyp != null) cc.addSource('/book.typ', bookTyp);
    return cc.runWithWorld({ mainFilePath: '/main.typ' }, async (w) => {
      const t0 = performance.now();
      const c = await w.compile({ diagnostics: 'full' });
      const t1 = performance.now();
      if (c.hasError) return { error: true, diagnostics: c.diagnostics };
      const q = (selector) => w.query({ selector, field: 'value' });
      const meta = bookTyp == null ? null : {
        lastPage: (await q('<last-page>'))[0],
        contentEnd: (await q('<content-end>'))[0],
        starts: await q('<part-start>'),
        ends: await q('<part-end>'),
        headings: (await q('<headings>'))[0],
        typstVersion: (await q('<typst-version>'))[0],
      };
      const t2 = performance.now();
      const pdf = await w.pdf({ diagnostics: 'full' });
      const t3 = performance.now();
      return {
        diagnostics: [...(c.diagnostics || []), ...(pdf.diagnostics || [])],
        meta,
        pdf: pdf.result,
        ms: { layout: t1 - t0, query: t2 - t1, pdf: t3 - t2, total: t3 - t0 },
      };
    });
  }

  async function loadPdfjs() {
    const lib = await importChecked(CONFIG.pdfjs);
    lib.GlobalWorkerOptions.workerSrc = await blobUrl(CONFIG.pdfjsWorker);
    return lib;
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  root.kdpTypstEngine = { CONFIG, loadEngine, compileBook, loadPdfjs, inflate };
})(globalThis);
