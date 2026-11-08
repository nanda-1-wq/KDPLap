/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the print engine, main-thread side (E13.1)
   /js/format/engine.js   (used by 08 Format, later by 09 Cover; needs
                           js/format/files.js, js/format/md2typst.js and
                           their helpers; loads js/format/typst-run.js
                           itself when the main thread must build)

   The engine runs in a module worker (engine-worker.js). Safari's worker
   has a small stack: from about 160 pages its PDF step overflows (worker
   spike, Nov 4). Owner rules for that case (Nov 4, option A):
   1. After a worker crash, that worker is ended and a new one is started,
      only when a build needs it (Part 3: no idle worker after a fallback).
   2. The fallback is chosen by the error (a stack overflow in the PDF step),
      never by the browser name.
   3. The book is remembered for the session (sessionStorage): its next
      builds go straight to the main thread.
   4. On the main-thread path the preview waits 1,500 ms after the last
      change (600 ms in the worker), and the caller's "Updating preview" is
      painted before the build (onMainThread, then two frames).

   const engine = kdpFormatEngine.create({ onProgress, test })
     onProgress({ loaded, total })   bytes still to download for the style
     test                            test only: { overflowPdfFor: [bookId] }
   engine.load(style, bookId)        → { ms, cdns }   engine and the style's fonts, ready
                                     (a book on the main thread loads there, no worker)
   engine.build({ bookId, style, model, settings, extras, onMainThread })
                                     → { pdf, pages, meta, diagnostics, ms, path, fellBack }
   engine.buildSource({ bookId, style, mainTyp, onMainThread })  (the same, from Typst source)
   engine.mode(bookId)               → 'worker' | 'main'
   engine.previewDelay(bookId)       → 600 | 1500 (ms)
   engine.stats                      → { workerStarts, crashes, fallbacks, mainBuilds }
   engine.hasWorker()                → a worker is alive now
   engine.terminate()
   kdpFormatEngine.isOverflow(err)   → the fallback rule (2)
═══════════════════════════════════════════════════ */

(function (root) {
  const SCRIPT = (root.document && root.document.currentScript && root.document.currentScript.src) || '';
  const BASE = new URL('./', SCRIPT || root.location.href);
  const PREVIEW_DELAY = { worker: 600, main: 1500 };
  const SESSION_KEY = 'nicheink-format-main-thread';
  const OVERFLOW = /maximum call stack size exceeded|too much recursion|stack overflow/i;

  /** Rule 2: a stack overflow in the PDF step. */
  const isOverflow = (e) => !!e && e.phase === 'pdf' && OVERFLOW.test(String(e.message));

  /* ── Rule 3: books that build on the main thread, this session ── */
  function readSession() {
    try { return JSON.parse(root.sessionStorage.getItem(SESSION_KEY) || '[]'); } catch { return []; }
  }
  const mainBooks = new Set(readSession().filter((x) => typeof x === 'string'));
  function remember(bookId) {
    if (!bookId) return;
    mainBooks.add(bookId);
    try { root.sessionStorage.setItem(SESSION_KEY, JSON.stringify([...mainBooks])); } catch { /* private mode: memory only */ }
  }

  /** Two animation frames (the "Updating preview" state is on screen), or 100 ms in a hidden tab. */
  const painted = () => new Promise((resolve) => {
    let done = false;
    const end = () => { if (!done) { done = true; resolve(); } };
    setTimeout(end, 100);
    if (root.requestAnimationFrame) root.requestAnimationFrame(() => root.requestAnimationFrame(end));
  });

  /* ── Our own Typst files (same origin, no CDN) ── */
  let templates = null;
  function templateSources() {
    if (!templates) {
      const get = (name) => fetch(new URL(name, BASE)).then((r) => {
        if (!r.ok) throw Object.assign(new Error(`${name}: HTTP ${r.status}`), { kind: 'download' });
        return r.text();
      });
      templates = Promise.all([get('book.typ'), get('droplet.typ')])
        .then(([book, droplet]) => ({ '/book.typ': book, '/droplet.typ': droplet }));
      templates.catch(() => { templates = null; });
    }
    return templates;
  }

  function create({ onProgress = () => {}, test = null } = {}) {
    const stats = { workerStarts: 0, crashes: 0, fallbacks: 0, mainBuilds: 0 };
    let worker = null;
    let ready = null;
    let seq = 0;
    let style = null;
    const pending = new Map();   // id → { resolve, reject }
    let main = null;             // the main-thread Loader, made on first need

    function rejectAll(err) {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    }

    function startWorker() {
      stats.workerStarts++;
      const w = new Worker(new URL('engine-worker.js', BASE), { type: 'module' });
      worker = w;
      ready = new Promise((resolve, reject) => {
        w.addEventListener('message', function first(ev) {
          if (ev.data && ev.data.type === 'ready') { w.removeEventListener('message', first); resolve(); }
        });
        w.addEventListener('error', (ev) => reject(Object.assign(new Error(ev.message || 'The print engine did not start.'), { kind: 'crash' })), { once: true });
      });
      ready.catch(() => {});
      w.addEventListener('message', (ev) => {
        const m = ev.data || {};
        const p = pending.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { onProgress({ loaded: m.loaded, total: m.total }); return; }
        pending.delete(m.id);
        if (m.type === 'failed') {
          p.reject(Object.assign(new Error(m.message), { kind: m.kind, phase: m.phase, name2: m.name, diagnostics: m.diagnostics }));
        } else {
          p.resolve(m);
        }
      });
      // An uncaught error or a dead worker (out of memory): every call fails as a crash.
      w.addEventListener('error', (ev) => {
        if (worker !== w) return;
        rejectAll(Object.assign(new Error(ev.message || 'The print engine stopped.'), { kind: 'crash' }));
      });
    }

    /**
     * Rule 1: end the worker. The new one starts only when a build needs it
     * (Part 3, owner): after a fallback the book builds on the main thread,
     * and an idle worker would keep its 260 to 460 MB in Safari for nothing.
     */
    function restartWorker() {
      stats.crashes++;
      const old = worker;
      worker = null;
      ready = null;
      if (old) old.terminate();
      rejectAll(Object.assign(new Error('The print engine stopped.'), { kind: 'crash' }));
    }

    async function call(msg, transfer) {
      if (!worker) startWorker();
      await ready;
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ ...msg, id }, transfer || []);
      });
    }

    /**
     * The engine and the style's fonts, ready to build. A book remembered on
     * the main thread (rule 3) loads there: no worker is started for it.
     */
    async function load(st, bookId) {
      style = st;
      if (bookId && mainBooks.has(bookId)) {
        const t0 = performance.now();
        const loader = await mainLoader();
        const total = loader.pending(st);
        let loaded = 0;
        await loader.compiler(st, (n) => { loaded += n; onProgress({ loaded: Math.max(0, loaded), total }); });
        return { ms: performance.now() - t0, cdns: loader.cdns.slice() };
      }
      const r = await call({ type: 'load', style: st });
      return { ms: r.ms, cdns: r.cdns };
    }

    async function mainLoader() {
      if (!root.kdpTypstRun) await import(new URL('typst-run.js', BASE).href);
      if (!main) main = root.kdpTypstRun.Loader();
      return main;
    }

    /** True while a worker is alive (the test for "no idle worker after a fallback"). */
    const hasWorker = () => !!worker;

    async function buildMain(st, sources, onMainThread) {
      if (onMainThread) await onMainThread();
      await painted();
      stats.mainBuilds++;
      const loader = await mainLoader();
      const total = loader.pending(st);
      let loaded = 0;
      const cc = await loader.compiler(st, (n) => { loaded += n; onProgress({ loaded: Math.max(0, loaded), total }); });
      return root.kdpTypstRun.compile(cc, sources, {});
    }

    const shape = (r, path, fellBack) => ({
      pdf: r.pdf, pages: r.meta.lastPage, meta: r.meta, diagnostics: r.diagnostics, ms: r.ms, path, fellBack
    });

    async function buildSource({ bookId, style: st, mainTyp, onMainThread }) {
      style = st;
      const sources = { ...(await templateSources()), '/main.typ': mainTyp };
      if (mainBooks.has(bookId)) return shape(await buildMain(st, sources, onMainThread), 'main', false);
      const overflowPdf = !!(test && Array.isArray(test.overflowPdfFor) && test.overflowPdfFor.includes(bookId));
      try {
        const r = await call({ type: 'build', style: st, sources, test: overflowPdf ? { overflowPdf: true } : null });
        return shape(r, 'worker', false);
      } catch (e) {
        // A Typst error is the book or the template, not a crash: the worker is fine.
        if (e.kind !== 'typst' && e.kind !== 'download') restartWorker();
        if (!isOverflow(e)) throw e;
        stats.fallbacks++;
        remember(bookId);
        return shape(await buildMain(st, sources, onMainThread), 'main', true);
      }
    }

    function build({ bookId, style: st, model, settings, extras, onMainThread }) {
      const mainTyp = root.kdpFormatTypst.mainTyp(model, settings, extras);
      return buildSource({ bookId, style: st || root.kdpFormatRules.normalize(settings).style, mainTyp, onMainThread });
    }

    const mode = (bookId) => (mainBooks.has(bookId) ? 'main' : 'worker');

    return {
      load, build, buildSource, mode, hasWorker,
      previewDelay: (bookId) => PREVIEW_DELAY[mode(bookId)],
      stats,
      terminate() {
        if (worker) worker.terminate();
        worker = null;
        rejectAll(Object.assign(new Error('The print engine was closed.'), { kind: 'closed' }));
        main = null;
      }
    };
  }

  root.kdpFormatEngine = { create, isOverflow, PREVIEW_DELAY, SESSION_KEY };
})(globalThis);
