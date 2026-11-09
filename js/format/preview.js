/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the print preview (E13.1 Part 3, reviewed in E13.2 Part 3)
   /js/format/preview.js   (used by js/book-format.js; needs
                            js/format/typst-run.js for pdf.js)

   pdf.js 6.4.299 (pinned, checked, its own worker) draws the real PDF as a
   spread: page 1 alone on the right, then 2 and 3, 4 and 5 …
   Only the spread on screen is drawn, and the next spread is drawn ahead
   (owner, Part 3): never the whole book. A canvas that leaves those two
   spreads is emptied, so a 400-page book holds at most 4 page images.
   Quick paging waits for a 60 ms pause, and a page you paged past before
   it was drawn is skipped.
   A new PDF keeps the spread you were on (or the last one, if the book got
   shorter). The old pages stay on screen until the new ones are drawn.
   E13.2 D2 (F13): the spread fills its box (the stage's width and height, no
   inner margin) and is drawn at the screen's pixel density (at most 3), so it
   stays sharp; a resize draws it again. refit() draws it again at once (the
   stage moved, for example into the full screen view).

   const pv = kdpFormatPreview.create(stage, { onChange })
     stage     an element; the preview fills it (spread + page buttons)
     onChange({ spread, spreads, label }) after each move
   await pv.show(pdfBytes, { trim })   a new PDF (bytes are copied)
   pv.go(+1 | -1) · pv.goTo(spread) · pv.refit()
   pv.label()                → "Pages 8 and 9 of 48"
   pv.drawn()                → page numbers that hold an image now (tests)
   pv.renders                → how many pages were drawn so far (tests)
   pv.destroy()
═══════════════════════════════════════════════════ */

(function (root) {
  const PAD = 0;        // E13.2 D2: the spread fills the stage (the box around it gives the margin)
  const MAX_DPR = 3;    // sharp on every screen, with a cap on canvas memory
  const NAV_WAIT = 60;  // ms of calm after a page turn before drawing

  /** Spread k: [left, right] page numbers (null = no page). */
  function spreadPages(k, pages) {
    if (k === 0) return [null, pages >= 1 ? 1 : null];
    const l = 2 * k, r = 2 * k + 1;
    return [l <= pages ? l : null, r <= pages ? r : null];
  }
  const spreadCount = (pages) => (pages ? Math.floor(pages / 2) + 1 : 0);

  function label(k, pages) {
    const [l, r] = spreadPages(k, pages);
    if (l && r) return `Pages ${l} and ${r} of ${pages}`;
    const only = l || r;
    return only ? `Page ${only} of ${pages}` : '';
  }

  function create(stage, { onChange = () => {} } = {}) {
    let doc = null, task = null;
    let pages = 0, spread = 0, trim = { w: 6, h: 9 };
    let gen = 0;                    // a new PDF or a resize starts a new generation
    const cache = new Map();        // page number → { canvas, gen }
    const api = { renders: 0 };

    stage.innerHTML = `
      <div class="fmt-spread" data-fmt-spread>
        <div class="fmt-page is-left" data-side="0"></div><div class="fmt-page is-right" data-side="1"></div>
      </div>`;
    const spreadEl = stage.querySelector('[data-fmt-spread]');
    const slots = [...spreadEl.children];

    /** CSS height of one page that fits two pages side by side in the stage. */
    function pageSize() {
      const sw = Math.max(120, stage.clientWidth - PAD * 2);
      const sh = Math.max(160, stage.clientHeight - PAD * 2);
      const byW = (sw / 2) * (trim.h / trim.w);
      const h = Math.floor(Math.min(sh, byW));
      return { w: Math.floor(h * trim.w / trim.h), h };
    }

    /** Pages still worth drawing: this spread and the next. */
    const wanted = (n) => [...spreadPages(spread, pages), ...spreadPages(spread + 1, pages)].includes(n);

    async function draw(n, myGen) {
      const hit = cache.get(n);
      if (hit && hit.gen === myGen) return hit.canvas;
      if (!wanted(n)) return null;
      const page = await doc.getPage(n);
      if (myGen !== gen || !wanted(n)) return null;   // paged on meanwhile: skip it
      const size = pageSize();
      const dpr = Math.min(MAX_DPR, root.devicePixelRatio || 1);
      const base = page.getViewport({ scale: 1 });
      const view = page.getViewport({ scale: (size.h / base.height) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(view.width);
      canvas.height = Math.round(view.height);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      canvas.setAttribute('aria-hidden', 'true');
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: view }).promise;
      page.cleanup();
      api.renders++;
      if (myGen !== gen) { canvas.width = 0; return null; }
      cache.set(n, { canvas, gen: myGen });
      return canvas;
    }

    /** Keep only the pages of this spread and the next one. */
    function prune(keep) {
      for (const [n, v] of cache) {
        if (!keep.has(n) || v.gen !== gen) {
          if (!v.canvas.isConnected) v.canvas.width = 0;   // frees the bitmap
          cache.delete(n);
        }
      }
    }

    async function render() {
      if (!doc) return;
      const myGen = gen;
      const k = spread;
      const now = spreadPages(k, pages);
      const next = spreadPages(k + 1, pages);
      const keep = new Set([...now, ...next].filter(Boolean));
      const size = pageSize();
      const canvases = await Promise.all(now.map((n) => (n ? draw(n, myGen) : null)));
      if (myGen !== gen || k !== spread) return;
      slots.forEach((slot, i) => {
        const n = now[i];
        slot.style.width = `${size.w}px`;
        slot.style.height = `${size.h}px`;
        slot.classList.toggle('is-empty', !n);
        const old = slot.querySelector('canvas');
        if (n && canvases[i]) {
          slot.setAttribute('aria-label', `Page ${n}, ${n % 2 ? 'right-hand' : 'left-hand'}`);
          slot.setAttribute('role', 'img');
          if (old !== canvases[i]) { slot.replaceChildren(canvases[i]); if (old) old.width = 0; }
        } else {
          slot.removeAttribute('aria-label');
          slot.removeAttribute('role');
          slot.replaceChildren();
          if (old) old.width = 0;
        }
      });
      prune(keep);
      onChange({ spread, spreads: spreadCount(pages), label: label(spread, pages) });
      // Draw the next spread ahead, after this one is on screen.
      for (const n of next) if (n && myGen === gen) await draw(n, myGen).catch(() => null);
    }

    async function show(bytes, { trim: t } = {}) {
      const lib = await root.kdpTypstRun.loadPdfjs();
      if (t) trim = root.kdpFormatRules.trimSize(t);
      const newTask = lib.getDocument({ data: bytes.slice(), verbosity: 0 });
      const newDoc = await newTask.promise;
      const oldTask = task;
      task = newTask;
      doc = newDoc;
      pages = doc.numPages;
      spread = Math.min(spread, spreadCount(pages) - 1);
      gen++;
      // The old pages stay on screen until the new spread replaces them.
      await render();
      if (oldTask) oldTask.destroy().catch(() => {});
    }

    let resizeTimer = null;
    const ro = root.ResizeObserver ? new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (doc) { gen++; render(); } }, 150);
    }) : null;
    if (ro) ro.observe(stage);

    api.show = show;
    api.go = (d) => api.goTo(spread + d);
    // Quick paging (holding an arrow key): draw once the pages stop moving for a moment.
    let navTimer = null;
    api.goTo = (k) => {
      const to = Math.max(0, Math.min(spreadCount(pages) - 1, k));
      if (to === spread || !doc) return;
      spread = to;
      onChange({ spread, spreads: spreadCount(pages), label: label(spread, pages) });
      clearTimeout(navTimer);
      navTimer = setTimeout(render, NAV_WAIT);
    };
    api.refit = () => { if (doc) { gen++; render(); } };
    api.label = () => label(spread, pages);
    api.state = () => ({ spread, spreads: spreadCount(pages), pages });
    api.drawn = () => [...cache.keys()].sort((a, b) => a - b);
    api.destroy = () => {
      gen++;
      clearTimeout(navTimer);
      if (ro) ro.disconnect();
      for (const v of cache.values()) v.canvas.width = 0;
      cache.clear();
      if (task) task.destroy().catch(() => {});
      task = null;
      doc = null;
    };
    return api;
  }

  root.kdpFormatPreview = { create, spreadPages, spreadCount, label };
})(globalThis);
