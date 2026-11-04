/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the print engine, in a module worker (E13.1)
   /js/format/engine-worker.js   (started by js/format/engine.js)

   The compile runs here, off the main thread (worker spike, Nov 4: the
   main thread is never blocked more than about 14 ms). Messages:
     in  { type: 'load', id, style }
     out { type: 'progress', id, loaded, total } … { type: 'loaded', id, ms, cdns }
     in  { type: 'build', id, style, sources, test }
     out { type: 'built', id, pdf (transferred), meta, diagnostics, ms }
     out { type: 'failed', id, kind, phase, name, message, diagnostics }
   'ready' is posted once the scripts are in; engine.js waits for it.
═══════════════════════════════════════════════════ */

await import(new URL('files.js', import.meta.url).href);
await import(new URL('typst-run.js', import.meta.url).href);

const T = globalThis.kdpTypstRun;
const loader = T.Loader();

function progress(id, total) {
  let loaded = 0;
  let last = 0;
  return (n) => {
    loaded += n;
    const t = performance.now();
    if (t - last > 80 || loaded >= total) {
      last = t;
      self.postMessage({ type: 'progress', id, loaded: Math.max(0, loaded), total });
    }
  };
}

const failed = (id, e) => self.postMessage({
  type: 'failed', id,
  kind: (e && e.kind) || 'run',
  phase: (e && e.phase) || null,
  name: (e && (e.name2 || e.name)) || null,
  message: String((e && e.message) || e),
  diagnostics: (e && e.diagnostics) || null
});

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.type === 'load') {
      const t0 = performance.now();
      await loader.compiler(m.style, progress(m.id, loader.pending(m.style)));
      self.postMessage({ type: 'loaded', id: m.id, ms: performance.now() - t0, cdns: loader.cdns });
    } else if (m.type === 'build') {
      const cc = await loader.compiler(m.style, progress(m.id, loader.pending(m.style)));
      const r = await T.compile(cc, m.sources, { testOverflowPdf: !!(m.test && m.test.overflowPdf) });
      self.postMessage({ type: 'built', id: m.id, ...r }, [r.pdf.buffer]);
    }
  } catch (e) {
    failed(m.id, e);
  }
};

self.postMessage({ type: 'ready' });
