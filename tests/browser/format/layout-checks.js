/* ═══════════════════════════════════════════════════
   NicheInk · tests: the 17 print layout checks (E13.1)
   /tests/browser/format/layout-checks.js   (engine.html; used by
                                             t-engine-real.mjs)

   Port of the E13.0 bench checks (proof/typst/bench.js), for any group A
   trim and the 08 settings. Reads the PDF back with pdf.js, page by page.
   Also measures words per page and characters per line on full text pages.

   kdpLayoutChecks.run(pdfjs, bytes, { meta, trim, titles, bookTitle, settings, corners })
     → { pdfjsPages, counts, checks: [{ name, pass, failPages }], notes, blockEdges, metrics, ms }
     titles: the title on each part's first page, in order (chapters, About, Also by).
═══════════════════════════════════════════════════ */

(function (root) {
  const PT = 72;
  const MARGIN = { inside: 0.75 * PT, outside: 0.5 * PT, top: 0.75 * PT, bottom: 0.75 * PT };
  const KDP_OUTSIDE = 0.25;
  const NAMES = [
    'page size equals the trim (pdf.js)', 'text block starts at the mirrored margin',
    'text inside the mirrored margins (only punctuation hangs, at most 4 pt)', 'all text inside the KDP minimum margins',
    'chapters start on a right-hand (odd) page', 'body page 1 is a right-hand (odd) page',
    'no header on front matter, chapter first pages, blanks', 'no page number on front matter, chapter first pages, blanks',
    'blank pages are empty', 'page number = body page (body starts at 1)', 'page number centred',
    'header: header title on left-hand pages', 'header left-aligned on left-hand pages',
    'header: chapter title on right-hand pages', 'header right-aligned on right-hand pages',
    'no heading as the last line of a page', 'corners white (no crop marks)'
  ];

  /** Letters and digits only, upper case: compares header text without caring about spacing. */
  const norm = (s) => String(s).normalize('NFKD').toUpperCase().replace(/[^A-Z0-9]/g, '');
  /** The header matches the title, or a start of it cut with "…". */
  const headerMatches = (got, want) => {
    const g = String(got).trim();
    if (g.endsWith('…')) return norm(g).length > 0 && norm(want).startsWith(norm(g)) || g === '…';
    return norm(g) === norm(want);
  };

  async function run(pdfjs, bytes, { meta, trim, titles, bookTitle, settings = {}, corners = true }) {
    const [tw, th] = String(trim).split('x').map(Number);
    const PAGE = { w: tw * PT, h: th * PT };
    const running = settings.running_header !== false;
    const recto = settings.recto_start !== false;
    const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
    const doc = await task.promise;
    const n = doc.numPages;
    const starts = meta.starts;
    const ends = meta.ends;
    const frontEnd = ends[0];
    const bodyStart = starts[0];
    const isBlank = (p) => ends.some((e) => e < p && starts.filter((s) => s > e).every((s) => s > p));
    const kdp = root.kdpFormatRules.kdpMargin(n);

    const fails = {};
    const fail = (k, p) => { (fails[k] = fails[k] || []).length < 5 && fails[k].push(p); };
    const notes = {};
    const note = (k, p) => { (notes[k] = notes[k] || []).push(p); };
    const edges = { odd: [], even: [] };
    const counts = { pages: n, blank: 0, front: 0, chapterFirst: 0, running: 0, headingsChecked: 0, cornersChecked: 0 };
    const wordsPerPage = [];
    const charsPerLine = [];
    const canvas = document.createElement('canvas');
    const SCALE = 2;
    const CORNER = Math.round(0.2 * PT * SCALE);
    const t0 = performance.now();

    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      if (Math.abs(vp.width - PAGE.w) > 0.01 || Math.abs(vp.height - PAGE.h) > 0.01) fail(NAMES[0], p);
      const items = (await page.getTextContent()).items.filter((t) => t.str.trim());
      const head = items.filter((t) => t.transform[5] > PAGE.h - MARGIN.top);
      const foot = items.filter((t) => t.transform[5] < MARGIN.bottom);
      const body = items.filter((t) => t.transform[5] >= MARGIN.bottom && t.transform[5] <= PAGE.h - MARGIN.top);
      const odd = p % 2 === 1;
      const front = p <= frontEnd;
      const blank = !front && isBlank(p);
      const first = starts.includes(p);
      const left = odd ? MARGIN.inside : MARGIN.outside;
      const right = PAGE.w - (odd ? MARGIN.outside : MARGIN.inside);
      const hangs = (t) => /[.,:;!?'"’”)\]\-‐–—]$/.test(t.str.trim());
      for (const t of body) {
        const end = t.transform[4] + t.width;
        if (t.transform[4] < left - 0.5 || (end > right + 0.75 && !(hangs(t) && end <= right + 4))) { fail(NAMES[2], p); break; }
      }
      if (!front && !blank && !first && body.length) {
        const minX = Math.round(Math.min(...body.map((t) => t.transform[4])) * 10) / 10;
        edges[odd ? 'odd' : 'even'].push(minX);
        if (minX > left + 0.5) note('page has only indented lines (a list or a quote)', p);
      }
      const kdpLeft = (odd ? kdp.inside : KDP_OUTSIDE) * PT;
      const kdpRight = PAGE.w - (odd ? KDP_OUTSIDE : kdp.inside) * PT;
      if (items.some((t) => t.transform[4] < kdpLeft || t.transform[4] + t.width > kdpRight)) fail(NAMES[3], p);
      if (front) counts.front++;
      if (blank) counts.blank++;
      if (first) counts.chapterFirst++;
      if (front || blank || first) {
        if (head.length) fail(NAMES[6], p);
        if (foot.length) fail(NAMES[7], p);
        if (blank && items.length) fail(NAMES[8], p);
        if (first && !odd && recto) fail(NAMES[4], p);
      } else {
        counts.running++;
        const want = String(p - bodyStart + 1);
        if (foot.map((t) => t.str).join('').trim() !== want) fail(NAMES[9], p);
        else {
          const f = foot[0];
          if (Math.abs(f.transform[4] + f.width / 2 - (left + right) / 2) > 1.5) fail(NAMES[10], p);
        }
        if (!running) {
          if (head.length) fail(odd ? NAMES[13] : NAMES[11], p);
        } else {
          const idx = starts.filter((s) => s <= p).length - 1;
          const wantHead = odd ? titles[idx] : (settings.header_title || bookTitle);
          if (!headerMatches(head.map((t) => t.str).join(''), wantHead)) fail(odd ? NAMES[13] : NAMES[11], p);
          else if (odd) {
            const last = head[head.length - 1];
            if (Math.abs(last.transform[4] + last.width - right) > 1) fail(NAMES[14], p);
          } else if (Math.abs(head[0].transform[4] - left) > 1) fail(NAMES[12], p);
        }
        // Metrics on full text pages: words per page, characters per justified line.
        const lines = new Map();
        for (const t of body) {
          const y = Math.round(t.transform[5]);
          const l = lines.get(y) || { text: '', x0: Infinity, x1: -Infinity };
          l.text += t.str;
          l.x0 = Math.min(l.x0, t.transform[4]);
          l.x1 = Math.max(l.x1, t.transform[4] + t.width);
          lines.set(y, l);
        }
        const full = [...lines.values()].filter((l) => l.x1 - l.x0 > (right - left) * 0.97);
        if (full.length >= 15) {
          wordsPerPage.push(body.map((t) => t.str).join(' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length);
          for (const l of full) charsPerLine.push(l.text.length);
        }
      }
      for (const h of meta.headings.filter((x) => x.level >= 2 && x.page === p)) {
        counts.headingsChecked++;
        if (body.some((t) => PAGE.h - t.transform[5] > h.y + 16)) continue;
        if (p === n || isBlank(p + 1) || starts.includes(p + 1)) note('heading with no text after it, at a chapter end', p);
        else fail(NAMES[15], p);
      }
      if (corners) {
        const view = page.getViewport({ scale: SCALE });
        canvas.width = Math.ceil(view.width);
        canvas.height = Math.ceil(view.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        await page.render({ canvas, canvasContext: ctx, viewport: view }).promise;
        counts.cornersChecked++;
        for (const [x, y] of [[0, 0], [canvas.width - CORNER, 0], [0, canvas.height - CORNER], [canvas.width - CORNER, canvas.height - CORNER]]) {
          const d = ctx.getImageData(x, y, CORNER, CORNER).data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) { fail(NAMES[16], p); break; }
          }
        }
      }
      page.cleanup();
    }
    if (bodyStart % 2 !== 1) fail(NAMES[5], bodyStart);
    const mode = (a) => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; return Number(Object.keys(c).sort((x, y) => c[y] - c[x])[0]); };
    const blockEdges = {
      odd: { wantPt: MARGIN.inside, modePt: mode(edges.odd), pages: edges.odd.length },
      even: { wantPt: MARGIN.outside, modePt: mode(edges.even), pages: edges.even.length }
    };
    if (Math.abs(blockEdges.odd.modePt - MARGIN.inside) > 0.5 || Math.abs(blockEdges.even.modePt - MARGIN.outside) > 0.5) fail(NAMES[1], 0);
    await task.destroy();
    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
    return {
      pdfjsPages: n,
      counts,
      checks: NAMES.map((name) => ({ name, pass: !fails[name], failPages: fails[name] || [] })),
      notes,
      blockEdges,
      metrics: { wordsPerPage: median(wordsPerPage), charsPerLine: median(charsPerLine), fullPages: wordsPerPage.length },
      ms: Math.round(performance.now() - t0)
    };
  }

  root.kdpLayoutChecks = { run, NAMES };
})(globalThis);
