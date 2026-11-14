/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: names and labels (E16 Part 1)
   /js/cover/names.js   (pure, no DOM; tested by tests/cover-names.test.js)

   kdpCover.names.layerName(l)        → the Layers row and Checks name (design layerName)
   kdpCover.names.slug(title)         → "micro-study-habits-for-busy-adult-learners"
   kdpCover.names.files(title, fmt)   → { pdf, png, jpg, kindle } file names (plan §5)
   kdpCover.names.labels(g)           → the size texts the design shows (footer, template, export)
   kdpCover.names.kindleCut(g)        → the Preview final line about the Kindle cut
   kdpCover.names.spineNote(g)        → the Book data spine line
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  function layerName(l) {
    if (l.label) return l.label;
    if (l.type === 'text') { const t = String(l.text).replace(/\s+/g, ' ').trim(); return t.length > 26 ? t.slice(0, 26) + '…' : t || 'Text'; }
    if (l.type === 'image') return l.name || 'Picture';
    const sh = C.shapes.LIST.find((x) => x[0] === l.kind); return sh ? sh[1] : 'Shape';
  }

  /** As 08's file name slug (js/format-rules.js fileName): ASCII, lower case, hyphens, 80 characters. */
  function slug(title) {
    const s = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
    return s || 'book';
  }

  /** <title-slug>_<trim>_<pages>p_<paper>_cover.pdf|png|jpg and …_kindle.jpg */
  function files(title, fmt) {
    const f = C.geo.normalizeFmt(fmt);
    const base = slug(title) + '_' + f.trim + '_' + f.pages + 'p_' + f.paper;
    return { base, pdf: base + '_cover.pdf', png: base + '_cover.png', jpg: base + '_cover.jpg', kindle: base + '_kindle.jpg' };
  }

  const mm = (x) => (x * 25.4).toFixed(2);

  /** The design's size texts, word for word. */
  function labels(g) {
    const W = g.W / 70, H = g.H / 70, px = C.geo.px300(g);
    return {
      trim: g.tw + ' × ' + g.th + ' in', pages: g.f.pages + ' pages', paper: g.f.paper + ' paper', spine: 'spine ' + g.sp.toFixed(3) + ' in',
      full: 'full ' + W.toFixed(3) + ' × ' + H.toFixed(2) + ' in',
      line: g.tw + ' × ' + g.th + ' in · ' + g.f.pages + ' pages · ' + g.f.paper + ' paper · spine ' + g.sp.toFixed(3) + ' in',
      wrap: W.toFixed(3) + ' × ' + H.toFixed(2) + ' in',
      px: px.w + ' × ' + px.h + ' px',
      fullText: 'Full cover ' + W.toFixed(3) + ' × ' + H.toFixed(2) + ' in', fullMm: mm(W) + ' × ' + mm(H) + ' mm',
      spineText: 'Spine ' + g.sp.toFixed(3) + ' in', spineMm: (g.sp * 25.4).toFixed(2) + ' mm', spineCaps: 'SPINE ' + g.sp.toFixed(3) + ' in'
    };
  }

  function kindleCut(g) {
    return g.kFit ? 'then, because this front is wide, your background color is added above and below to make the Kindle shape (1 : 1.6), so nothing is cut'
      : g.kCut > 0.004 ? 'then ' + g.kCut.toFixed(2) + ' in trimmed from each side to the Kindle shape (1 : 1.6)' : 'already the Kindle shape (1 : 1.6), nothing is trimmed';
  }

  function spineNote(g) {
    return g.spineTextOk ? 'On for this book: ' + g.f.pages + ' pages gives a ' + g.sp.toFixed(3) + ' in spine.'
      : 'Off for this book. It has ' + g.f.pages + ' pages; on ' + g.f.paper + ' paper spine text starts at ' + g.spineMin + ' pages so it never runs off the spine.';
  }

  C.names = { layerName, slug, files, labels, kindleCut, spineNote };
})(globalThis);
