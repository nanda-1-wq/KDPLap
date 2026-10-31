/* ═══════════════════════════════════════════════════
   NicheInk — E13.0 Typst proof: the bench page (throwaway)
   /proof/typst/bench.js   (bench.html; driven by run.mjs)

   bench.html?book=test-book&warm=5&checks=1
     book    a file in input/ (without .md)
     warm    recompiles after the first: the same text, then one small edit
     checks  read the PDF back with pdf.js: page count, layout, corners

   The result goes to window.__result (numbers and page numbers only, never
   book text) and the PDF to window.__pdf. Times are ms from navigation start.
═══════════════════════════════════════════════════ */

(function () {
  const E = () => globalThis.kdpTypstEngine;
  const T = () => globalThis.kdpTypst;
  const params = new URLSearchParams(location.search);
  const BOOK = params.get('book') || 'test-book';
  const WARM = Number(params.get('warm') || 0);
  const CHECKS = params.get('checks') === '1';

  const PT = 72;
  const PAGE = { w: 6 * PT, h: 9 * PT };
  const MARGIN = { inside: 0.75 * PT, outside: 0.5 * PT, top: 0.75 * PT, bottom: 0.75 * PT };
  const SPINE_PER_PAGE = 0.002252;   // inches, white paper (KDP)
  const KDP_OUTSIDE = 0.25;          // inches, no bleed (KDP minimum)

  const longTasks = [];
  let observer = null;
  try {
    observer = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(e.duration); });
    observer.observe({ type: 'longtask', buffered: true });
  } catch { /* no Long Tasks API */ }
  const drainLongTasks = async () => {
    await new Promise((r) => setTimeout(r, 0));
    if (observer) for (const e of observer.takeRecords()) longTasks.push(e.duration);
  };

  /** A 10 ms timer: the longest gap between its ticks is how long the page froze. */
  function freezeMeter() {
    let last = performance.now();
    let worst = 0;
    const id = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; }, 10);
    return () => { clearInterval(id); return Math.max(worst, performance.now() - last); };
  }

  const out = document.getElementById('out');
  const show = (o) => { out.textContent = JSON.stringify(o, null, 2); };
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const r1 = (x) => Math.round(x * 10) / 10;

  /** KDP minimum inside margin for a page count (no bleed). */
  function kdpInside(pages) {
    if (pages < 24) return { tier: 'below 24 pages', inside: null };
    if (pages <= 150) return { tier: '24-150', inside: 0.375 };
    if (pages <= 300) return { tier: '151-300', inside: 0.5 };
    if (pages <= 500) return { tier: '301-500', inside: 0.625 };
    if (pages <= 700) return { tier: '501-700', inside: 0.75 };
    if (pages <= 828) return { tier: '701-828', inside: 0.875 };
    return { tier: 'over 828', inside: null };
  }

  /** Letters and digits only, upper case: compares header text without caring about spacing. */
  const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* ── Layout checks with pdf.js ───────────── */

  async function layoutChecks(pdfjs, bytes, meta, book) {
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    const n = doc.numPages;
    const starts = meta.starts;
    const ends = meta.ends;
    const frontEnd = ends[0];
    const bodyStart = starts[0];
    const isBlank = (p) => ends.some((e) => e < p && starts.filter((s) => s > e).every((s) => s > p));
    const titles = book.chapters.map((c) => c.title);

    const fails = {};   // check → first few page numbers
    const fail = (k, p) => { (fails[k] = fails[k] || []).length < 5 && fails[k].push(p); };
    const notes = {};
    const note = (k, p) => { (notes[k] = notes[k] || []).push(p); };
    const kdpIn = kdpInside(n).inside || 0.875;
    const edges = { odd: [], even: [] };   // left edge of the text block, running pages
    const counts = { pages: n, blank: 0, front: 0, chapterFirst: 0, running: 0, headingsChecked: 0, cornersChecked: 0 };
    const canvas = document.createElement('canvas');
    const SCALE = 2;
    const CORNER = Math.round(0.2 * PT * SCALE);
    const t0 = performance.now();

    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      if (Math.abs(vp.width - PAGE.w) > 0.01 || Math.abs(vp.height - PAGE.h) > 0.01) fail('page size 6 x 9 in (pdf.js)', p);
      const items = (await page.getTextContent()).items.filter((t) => t.str.trim());
      const head = items.filter((t) => t.transform[5] > PAGE.h - MARGIN.top);
      const foot = items.filter((t) => t.transform[5] < MARGIN.bottom);
      const body = items.filter((t) => t.transform[5] >= MARGIN.bottom && t.transform[5] <= PAGE.h - MARGIN.top);
      const odd = p % 2 === 1;
      const front = p <= frontEnd;
      const blank = !front && isBlank(p);
      const first = starts.includes(p);
      // Text block: inside margin on the left of odd pages, on the right of even pages.
      const left = odd ? MARGIN.inside : MARGIN.outside;
      const right = PAGE.w - (odd ? MARGIN.outside : MARGIN.inside);
      // Typst hangs end-of-line punctuation a little into the margin (text.overhang).
      const hangs = (t) => /[.,:;!?'"’”)\]\-‐–—]$/.test(t.str.trim());
      for (const t of body) {
        const end = t.transform[4] + t.width;
        if (t.transform[4] < left - 0.5 || (end > right + 0.75 && !(hangs(t) && end <= right + 4))) {
          fail('text inside the mirrored margins (only punctuation hangs, at most 4 pt)', p);
          break;
        }
      }
      if (!front && !blank && !first && body.length) {
        const minX = Math.round(Math.min(...body.map((t) => t.transform[4])) * 10) / 10;
        edges[odd ? 'odd' : 'even'].push(minX);
        if (minX > left + 0.5) note('page has only indented lines (a list or a quote)', p);
      }
      const kdpLeft = (odd ? kdpIn : KDP_OUTSIDE) * PT;
      const kdpRight = PAGE.w - (odd ? KDP_OUTSIDE : kdpIn) * PT;
      if (items.some((t) => t.transform[4] < kdpLeft || t.transform[4] + t.width > kdpRight)) fail('all text inside the KDP minimum margins', p);
      if (front) counts.front++;
      if (blank) counts.blank++;
      if (first) counts.chapterFirst++;
      if (front || blank || first) {
        if (head.length) fail('no header on front matter, chapter first pages, blanks', p);
        if (foot.length) fail('no page number on front matter, chapter first pages, blanks', p);
        if (blank && items.length) fail('blank pages are empty', p);
        if (first && !odd) fail('chapters start on a right-hand (odd) page', p);
      } else {
        counts.running++;
        const want = String(p - bodyStart + 1);
        if (foot.map((t) => t.str).join('').trim() !== want) fail('page number = body page (body starts at 1)', p);
        else {
          const f = foot[0];
          const mid = f.transform[4] + f.width / 2;
          if (Math.abs(mid - (left + right) / 2) > 1.5) fail('page number centred', p);
        }
        const chapterIdx = starts.filter((s) => s <= p).length - 1;
        const wantHead = odd ? titles[chapterIdx] : book.title;
        if (norm(head.map((t) => t.str).join('')) !== norm(wantHead)) fail(odd ? 'header: chapter title on right-hand pages' : 'header: book title on left-hand pages', p);
        else if (odd) {
          const last = head[head.length - 1];
          if (Math.abs(last.transform[4] + last.width - right) > 1) fail('header right-aligned on right-hand pages', p);
        } else if (Math.abs(head[0].transform[4] - left) > 1) fail('header left-aligned on left-hand pages', p);
      }

      // No heading as the last line of a page (owner add 2): some body line sits below it.
      for (const h of meta.headings.filter((x) => x.level >= 2 && x.page === p)) {
        counts.headingsChecked++;
        if (body.some((t) => PAGE.h - t.transform[5] > h.y + 16)) continue;
        // Nothing follows it in its chapter (the next page is blank or a new chapter): a content gap, not layout.
        if (p === n || isBlank(p + 1) || starts.includes(p + 1)) note('heading with no text after it, at a chapter end', p);
        else fail('no heading as the last line of a page', p);
      }

      // Crop marks would draw in the corners: the four 0.2 in corner squares must be white.
      const view = page.getViewport({ scale: SCALE });
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvas, canvasContext: ctx, viewport: view }).promise;
      counts.cornersChecked++;
      for (const [x, y] of [[0, 0], [canvas.width - CORNER, 0], [0, canvas.height - CORNER], [canvas.width - CORNER, canvas.height - CORNER]]) {
        const d = ctx.getImageData(x, y, CORNER, CORNER).data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) { fail('corners white (no crop marks)', p); break; }
        }
      }
      page.cleanup();
    }
    if (!(bodyStart % 2 === 1)) fail('body page 1 is a right-hand (odd) page', bodyStart);
    // The text block's left edge: the most common edge on each side must be that side's margin.
    const mode = (a) => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; return Number(Object.keys(c).sort((x, y) => c[y] - c[x])[0]); };
    const blockEdges = {
      odd: { wantPt: MARGIN.inside, modePt: mode(edges.odd), atMargin: edges.odd.filter((x) => Math.abs(x - MARGIN.inside) <= 0.5).length, pages: edges.odd.length },
      even: { wantPt: MARGIN.outside, modePt: mode(edges.even), atMargin: edges.even.filter((x) => Math.abs(x - MARGIN.outside) <= 0.5).length, pages: edges.even.length },
    };
    if (Math.abs(blockEdges.odd.modePt - MARGIN.inside) > 0.5 || Math.abs(blockEdges.even.modePt - MARGIN.outside) > 0.5) fail('text block starts at the mirrored margin', 0);
    const checks = [
      'page size 6 x 9 in (pdf.js)', 'text block starts at the mirrored margin',
      'text inside the mirrored margins (only punctuation hangs, at most 4 pt)', 'all text inside the KDP minimum margins',
      'chapters start on a right-hand (odd) page',
      'body page 1 is a right-hand (odd) page', 'no header on front matter, chapter first pages, blanks',
      'no page number on front matter, chapter first pages, blanks', 'blank pages are empty',
      'page number = body page (body starts at 1)', 'page number centred', 'header: book title on left-hand pages',
      'header left-aligned on left-hand pages', 'header: chapter title on right-hand pages', 'header right-aligned on right-hand pages',
      'no heading as the last line of a page', 'corners white (no crop marks)',
    ];
    await task.destroy();
    return {
      pdfjsPages: n,
      counts,
      checks: checks.map((name) => ({ name, pass: !fails[name], failPages: fails[name] || [] })),
      notes,
      blockEdges,
      ms: Math.round(performance.now() - t0),
    };
  }

  /* ── Run ─────────────────────────────────── */

  async function run() {
    if (params.get('idle') === '1') {   // the memory baseline: the same page, no engine
      await new Promise((r) => setTimeout(r, 1500));
      globalThis.__result = { idle: true };
      return;
    }
    const marks = {};
    const cc = await E().loadEngine(marks);
    const [md, bookTyp] = await Promise.all([
      fetch(`input/${BOOK}.md`).then((r) => { if (!r.ok) throw new Error(`input/${BOOK}.md: HTTP ${r.status}`); return r.text(); }),
      fetch('book.typ').then((r) => r.text()),
    ]);
    const t0 = performance.now();
    const book = T().parseBook(md);
    const mainTyp = T().toTypst(book);
    const convertMs = performance.now() - t0;

    await drainLongTasks();
    longTasks.length = 0;
    const stopMeter = freezeMeter();
    const first = await E().compileBook(cc, mainTyp, bookTyp);
    marks.firstPdf = performance.now();
    const frozeFirst = stopMeter();
    if (first.error) throw new Error(`compile failed: ${first.diagnostics.map((d) => d.message || d).join('; ')}`);
    await drainLongTasks();
    const longestFirst = Math.max(0, ...longTasks);

    // Recompiles: the same text (cached), then a one-word edit in chapter 2.
    const same = [];
    const edit = [];
    const at = mainTyp.indexOf('#chapter(', mainTyp.indexOf('#chapter(') + 1);
    const lineEnd = mainTyp.indexOf('\n', at) + 1;
    for (let i = 0; i < WARM; i++) {
      same.push((await E().compileBook(cc, mainTyp, null)).ms.total);
      const edited = `${mainTyp.slice(0, lineEnd)}Edit${i} ${mainTyp.slice(lineEnd)}`;
      edit.push((await E().compileBook(cc, edited, null)).ms.total);
    }
    if (WARM) await E().compileBook(cc, mainTyp, null);   // leave the real book compiled

    const bytes = first.pdf;
    const reader = await globalThis.kdpPdfCheck.read(bytes, { inflate: E().inflate });
    const engineCount = first.meta.lastPage;
    const boxes = [...new Set(reader.pages.map((p) => JSON.stringify(p.mediaBox)))];
    const result = {
      book: BOOK,
      typstVersion: first.meta.typstVersion,
      userAgent: navigator.userAgent,
      words: md.split(/\s+/).filter(Boolean).length,
      chapters: book.chapters.length,
      marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, Math.round(v)])),
      compile: {
        convertMs: r1(convertMs),
        first: Object.fromEntries(Object.entries(first.ms).map(([k, v]) => [k, Math.round(v)])),
        sameMedian: same.length ? Math.round(median(same)) : null,
        same: same.map(Math.round),
        editMedian: edit.length ? Math.round(median(edit)) : null,
        edit: edit.map(Math.round),
        longestTaskFirstMs: Math.round(longestFirst),
        pageFrozeFirstMs: Math.round(frozeFirst),
      },
      diagnostics: first.diagnostics.map((d) => `${d.severity}: ${d.message}`),
      pages: {
        contentEnd: first.meta.contentEnd,
        padded: first.meta.lastPage !== first.meta.contentEnd,
        engine: engineCount,
        reader: reader.pageCount,
        even: engineCount % 2 === 0,
        spineIn: Math.round(engineCount * SPINE_PER_PAGE * 10000) / 10000,
        kdpInside: kdpInside(engineCount),
        frontPages: first.meta.ends[0],
        bodyStartsOnPhysicalPage: first.meta.starts[0],
      },
      pdf: {
        bytes: bytes.length,
        version: reader.version,
        creator: reader.creator,
        objectStreams: reader.objectStreams,
        mediaBoxes: boxes,
        otherBoxes: reader.pages.filter((p) => p.cropBox || p.trimBox || p.bleedBox || p.artBox).length,
        fonts: reader.fonts,
      },
    };
    if (CHECKS) {
      const pdfjs = await E().loadPdfjs();
      result.layout = await layoutChecks(pdfjs, bytes, first.meta, book);
      result.pages.pdfjs = result.layout.pdfjsPages;
    }
    result.pages.allMatch = [reader.pageCount.tree, reader.pageCount.rootCount, reader.pageCount.pageObjects, result.pages.pdfjs ?? engineCount]
      .every((x) => x === engineCount);
    globalThis.__pdf = bytes;
    globalThis.__result = result;
    show(result);
    const a = document.getElementById('download');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = `${BOOK}.pdf`;
    a.hidden = false;
  }

  run().catch((e) => {
    globalThis.__result = { error: String(e && e.stack || e) };
    show(globalThis.__result);
  });
})();
