/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: checks (E16 Part 1)
   /js/cover/checks.js   (pure, no DOM; tested by tests/cover-checks.test.js)

   The design's checks() (design/screens/58-09-cover-new.html), on rotated
   boxes, same thresholds and words. Hidden and excluded layers are skipped.
   Severity: 'error' = Must fix (blocks export), 'warn' = check this, 'tip'.

   The 14 rules, numbered in the design's source order:
     C1  title, subtitle or pen name not on the cover            error (one item each)
     C2  text under 7 pt                                          error
     C3  spine text too close to a fold (0.0625 in)               error
     C4  spine text past the top or bottom of the spine           error
     C5  text on the spine of a book too thin for spine text      error
     C6  text crossing a spine fold                               error
     C7  text outside the safe area                               error
     C8  text closer than 0.375 in to the cut                     warn
     C9  a shape or picture stopping just short of the edge       warn
     C10 picture under 200 DPI (error) or under 300 DPI (warn)
     C11 something other than a picture in the barcode box        warn
     C12 title contrast under 4.5 : 1 on what is under it         warn
     C13 the title sits on a photo                                tip
     C14 the back cover has no text                               tip

   One planned change (D13, owner Q-9 and STOP 1): C3 and C4 measure spine
   text by its ink band (kdpCover.textlayout.inkBand): cap top to baseline
   when the layer is all capitals, else ascender to descender, not the whole
   line box. opt.spineInk = false gives the design's line-box rule.

   kdpCover.checks.run(cover, opt) → [{ code, sev, msg, id?, fix? }]
       cover = { fmt, bg, layers };  opt.textH(l) → px (default textlayout.height)
   kdpCover.checks.summary(items)  → { errors, warns, tips, chip, line }  (design chipLabel and checksSummary)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const M = 17.5;    // 0.25 in more inside the KDP line = our 0.375 in layout margin from the trim
  const BOOK_NAMES = { title: 'title', subtitle: 'subtitle', pen: 'pen name' };

  /** The ink band of a text layer as a box on the board (its rotated bounding box). */
  function inkBox(l, textH) {
    const h = textH(l), band = C.textlayout.inkBand(l);
    const cx = l.x + l.w / 2, cy = l.y + h / 2, a = (l.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    const pts = [[0, band.top], [l.w, band.top], [l.w, band.bottom], [0, band.bottom]].map(([u, v]) => {
      const dx = u - l.w / 2, dy = v - h / 2;
      return [cx + dx * co - dy * si, cy + dx * si + dy * co];
    });
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }

  function run(cover, opt) {
    const o = opt || {};
    const textH = o.textH || ((l) => C.textlayout.height(l));
    const spineInk = o.spineInk !== false;
    const Mo = C.model, P = C.palettes;
    const g = C.geo.geo(cover.fmt), layers = cover.layers || [], out = [];
    const live = [g.liveBack, g.liveFront];
    const act = layers.filter((l) => !l.hidden && !l.noExport);
    const nm = (l) => '"' + C.names.layerName(l) + '"';
    ['title', 'subtitle', 'pen'].forEach((k) => {
      if (!act.some((l) => l.src === k)) out.push({ code: 'C1', sev: 'error', msg: 'The ' + BOOK_NAMES[k] + ' is not on the cover. KDP checks that the cover matches your book details.', fix: { label: 'Add it', action: 'add', key: k } });
    });
    act.forEach((l) => {
      const b = Mo.bbox(l, textH);
      const x1 = b.x + b.w, y1 = b.y + b.h;
      if (l.type === 'text') {
        if (l.size < 7) out.push({ code: 'C2', sev: 'error', msg: nm(l) + ' is ' + l.size + ' pt. KDP needs text of at least 7 pt.', id: l.id });
        const inside = live.find((r) => b.x >= r.x0 && x1 <= r.x1 && b.y >= r.y0 && y1 <= r.y1);
        const crossSpine = b.x < g.foldR + 4.4 && x1 > g.foldL - 4.4;
        const onSpine = b.x >= g.foldL - 4.4 && x1 <= g.foldR + 4.4;
        if (crossSpine && onSpine && g.spineTextOk) {
          const k = spineInk ? inkBox(l, textH) : b, kx1 = k.x + k.w, ky1 = k.y + k.h;
          if (k.x < g.foldL + 4.375 || kx1 > g.foldR - 4.375) out.push({ code: 'C3', sev: 'error', msg: nm(l) + ' is too close to a spine fold. Keep spine text 0.0625 in inside each fold.', id: l.id });
          else if (k.y < g.liveBack.y0 || ky1 > g.liveBack.y1) out.push({ code: 'C4', sev: 'error', msg: nm(l) + ' runs past the top or bottom of the spine.', id: l.id });
        }
        else if (crossSpine && onSpine) out.push({ code: 'C5', sev: 'error', msg: nm(l) + ' is on the spine. Spine text needs at least ' + g.spineMin + ' pages on ' + g.f.paper + ' paper; this book has ' + g.f.pages + '.', id: l.id });
        else if (crossSpine) out.push({ code: 'C6', sev: 'error', msg: nm(l) + ' crosses the spine. Words over a fold can bend out of sight.', id: l.id });
        else if (!inside) out.push({ code: 'C7', sev: 'error', msg: nm(l) + ' is outside the safe area. KDP rejects text this close to the cut.', id: l.id });
        else {
          const r = inside;
          if (b.x < r.x0 + M || x1 > r.x1 - M || b.y < r.y0 + M || y1 > r.y1 - M) out.push({ code: 'C8', sev: 'warn', msg: nm(l) + ' is close to the edge. Keep it 0.375 in inside the cut so it looks safe after trimming.', id: l.id });
        }
      }
      if (l.type !== 'text' && !(b.x <= 0.5 && b.y <= 0.5 && b.w >= g.W - 1 && b.h >= g.H - 1)) {
        const sliver = (b.x > 0.5 && b.x < 13) || (b.y > 0.5 && b.y < 13) || (x1 < g.W - 0.5 && x1 > g.W - 13) || (y1 < g.H - 0.5 && y1 > g.H - 13);
        if (sliver) out.push({ code: 'C9', sev: 'warn', msg: nm(l) + ' stops just short of the edge. A thin line of background may show after the cut. Stretch it into the bleed or move it in.', id: l.id });
      }
      if (l.type === 'image') {
        const d = Mo.dpi(l);
        if (d < 200) out.push({ code: 'C10', sev: 'error', msg: nm(l) + ' is ' + d + ' DPI. It will print blurry. Use a bigger picture or make it smaller on the cover.', id: l.id });
        else if (d < 300) out.push({ code: 'C10', sev: 'warn', msg: nm(l) + ' is ' + d + ' DPI. KDP asks for 300; it may print soft.', id: l.id });
      }
      if (l.type !== 'image' && b.x < g.barcode.x + g.barcode.w && x1 > g.barcode.x && b.y < g.barcode.y + g.barcode.h && y1 > g.barcode.y) out.push({ code: 'C11', sev: 'warn', msg: nm(l) + ' sits in the barcode area. KDP prints the barcode there and will cover it.', id: l.id });
    });
    const t = act.find((l) => l.src === 'title');
    if (t) {
      const tb = Mo.bbox(t, textH);
      const under = act.filter((l) => l.id !== t.id && layers.indexOf(l) < layers.indexOf(t) && l.type !== 'text' && !['frame', 'ring', 'line'].includes(l.kind))
        .filter((l) => { const b = Mo.bbox(l, textH); return b.x <= tb.x + tb.w / 2 && b.x + b.w >= tb.x + tb.w / 2 && b.y <= tb.y + tb.h / 2 && b.y + b.h >= tb.y + tb.h / 2; }).pop();
      const back = under && under.type === 'shape' && under.fillMode === 'solid' ? under.fill : !under ? cover.bg : null;
      if (back) { const c = P.contrast(t.color, back); if (c < 4.5) out.push({ code: 'C12', sev: 'warn', msg: 'The title is hard to read in small sizes (contrast ' + c.toFixed(1) + ' : 1, aim for 4.5 : 1). Pick a darker or lighter color.', id: t.id }); }
      else if (under && under.type === 'image') out.push({ code: 'C13', sev: 'tip', msg: 'The title sits on a photo. Check it in Preview final at search-result size.', id: t.id });
    }
    if (!act.some((l) => l.type === 'text' && l.x + l.w <= g.foldL)) out.push({ code: 'C14', sev: 'tip', msg: 'The back cover has no text yet. Most buyers read the back blurb.', fix: { label: 'Write blurb', action: 'blurb' } });
    return out;
  }

  /** The design's chipLabel and checksSummary. */
  function summary(items) {
    const errors = items.filter((c) => c.sev === 'error').length, warns = items.filter((c) => c.sev === 'warn').length, tips = items.filter((c) => c.sev === 'tip').length;
    const chip = errors ? errors + ' to fix' : warns ? warns + ' to check' : 'Ready';
    const line = errors ? errors + ' must fix' + (warns ? ', ' + warns + ' to check' : '') : warns ? warns + ' to check' : 'Ready to export';
    return { errors, warns, tips, chip, line };
  }

  C.checks = { run, summary, inkBox };
})(globalThis);
