/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Typst writer (E16 Part 2, plan §1)
   /js/cover/typst.js   (pure, no DOM; needs geo, textlayout, shapes, flatten,
                         fonts; tested by tests/cover-typst.test.js)

   Turns a cover and its flatten plan into the main.typ that imports
   js/cover/cover.typ (template c2). Vector text uses the same line breaks,
   widths and baselines as the canvas (kdpCover.textlayout), so a raster
   effect under vector letters lines up. Shapes become Typst curves (the
   design's shapePath() through kdpCover.shapes.typstCurve). Patches are the
   flatten plan's opaque 300 DPI JPEGs, at '/p/<n>.jpg'.

   Every color is rgb("#RRGGBB"); nothing has alpha; no gradient is written.

   kdpCover.typst.TEMPLATE                → 'c2'
   kdpCover.typst.str(s)                  → a Typst string literal
   kdpCover.typst.source(cover, plan, o)  → { mainTyp, faces, lines, patches, missingFonts }
       faces: the faces written as vector text (a text only inside a patch needs no font in the PDF)
       o.patchPath(n) (default '/p/<n>.jpg'); o.patches: [{ n, box }] when the export split big patches
       lines: [{ id, i, w (pt, ours), font, weight }] one per plain line (the fit markers' other half)
       missingFonts: text layers whose family is not in the catalog (export stops on them)
   kdpCover.typst.pageSize(fmt)           → { wIn, hIn } the PDF page (the full wrap with bleed)
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PT = 70 / 72;
  const TEMPLATE = 'c2';

  /** A Typst string literal (no markup is parsed in a string body). */
  function str(s) {
    let out = '"';
    for (const ch of String(s)) {
      const cp = ch.codePointAt(0);
      if (ch === '\\') out += '\\\\';
      else if (ch === '"') out += '\\"';
      else if (ch === '\n') out += '\\n';
      else if (ch === '\t') out += '\\t';
      else if (ch === '\r') out += '\\r';
      else if (cp < 0x20 || cp === 0x7f) out += `\\u{${cp.toString(16)}}`;
      else out += ch;
    }
    return out + '"';
  }
  const n = (v) => { const x = Math.round(v * 10000) / 10000; return String(Object.is(x, -0) ? 0 : x); };
  const col = (hex) => `rgb("${String(hex).toUpperCase()}")`;

  const pageSize = (fmt) => { const g = C.geo.geo(fmt); return { wIn: g.W / C.geo.I, hIn: g.H / C.geo.I, g }; };

  /** Baseline of the first line in the box (the CSS line box: half-leading, then the ascender). */
  function baseOf(l) {
    const TL = C.textlayout, px = l.size * PT, m = TL.metricsOf(l.font, l.weight);
    return (TL.lineH(l) - (m.asc + m.desc) * px) / 2 + m.asc * px;
  }

  /** The runs of one text layer at offset (dx, dy) with a fill and an optional stroke. */
  function textRuns(l, face, dx, dy, fill, stroke, lines, marks) {
    const TL = C.textlayout, out = [];
    const font = str(face.typst), w = face.typstWeight, size = n(l.size);
    const st = face.typstStretch !== 100 ? `, stretch: ${n(face.typstStretch)}%` : '';
    const tracking = n((l.ls || 0) * l.size);
    if (l.curve) {
      const cv = TL.curve(l), lh = TL.lineH(l), base = baseOf(l);
      for (const c of cv.list) {
        const up = c.origin === 'bottom';
        out.push(`#curve-char(${n(c.x + dx)}, ${n(c.top + dy)}, ${n(c.w)}, ${n(lh)}, ${n(base)}, ${n(c.rot)}, ${up}, ${font}, ${w}, ${size}, ${fill}, ${str(c.ch)}${stroke ? `, stroke: ${stroke}` : ''}${st})`);
      }
      return out;
    }
    const runs = C.render ? C.render.plainRuns(l) : plainRuns(l);
    runs.forEach((r, i) => {
      if (!r.s) return;
      out.push(`#run(${n(r.x + dx)}, ${n(r.y + dy)}, ${font}, ${w}, ${size}, ${fill}, ${tracking}, ${str(r.s)}${stroke ? `, stroke: ${stroke}` : ''}${st})`);
      if (marks) {
        out.push(`#fit(${str(String(l.id))}, ${i}, ${font}, ${w}, ${size}, ${tracking}, ${str(r.s)}${st})`);
        // Ours: the measured run, with letter spacing between the characters (Typst adds none after the last one; checked at STOP 2).
        const chars = Array.from(r.s).length;
        lines.push({ id: String(l.id), i, w: (TL.runW(l, r.s) - (l.ls || 0) * l.size * PT * (chars ? 1 : 0)) / PT, font: l.font, weight: face.weight });
      }
    });
    return out;
  }

  /** The same runs as render.plainRuns (kept here so the writer runs without the renderer, in Deno). */
  function plainRuns(l) {
    const TL = C.textlayout, lh = TL.lineH(l), base = baseOf(l);
    return TL.lines(l).map((ln, i) => {
      const x = l.align === 'center' ? (l.w - ln.width) / 2 : l.align === 'right' ? l.w - ln.width : 0;
      return { s: ln.text.replace(/ +$/, ''), x, y: i * lh + base };
    });
  }

  function textLayer(l, part, lines) {
    const face = C.fonts.face(l.font, l.weight);
    if (!face) return null;
    const TL = C.textlayout, h = TL.height(l), fx = l.fx || { style: 'none' };
    const body = [];
    const rad = fx.dir * Math.PI / 180, ox = Math.cos(rad) * fx.dist, oy = Math.sin(rad) * fx.dist;
    if (part === 'all') {
      if (fx.style === 'outline') body.push(...textRuns(l, face, 0, 0, col(fx.color), `(paint: ${col(fx.color)}, thickness: ${n(fx.width * 2 * 72 / 70)}pt, join: "round", cap: "round")`, lines, false));
      if (fx.style === '3d') for (let i = fx.depth; i >= 1; i--) body.push(...textRuns(l, face, Math.cos(rad) * i, Math.sin(rad) * i, col(fx.color), null, lines, false));
      if (fx.style === 'shadow') body.push(...textRuns(l, face, ox, oy, col(fx.color), null, lines, false));   // only at strength 100, softness 0 (else flattened)
      if (fx.style === 'bg') body.push(`#plate(${n(-fx.pad)}, ${n(-fx.pad * 0.5)}, ${n(l.w + 2 * fx.pad)}, ${n(h + fx.pad)}, ${n(Math.max(0, Math.min(fx.round, (l.w + 2 * fx.pad) / 2, (h + fx.pad) / 2)))}, ${col(fx.color)})`);
    }
    body.push(...textRuns(l, face, 0, 0, col(l.color), null, lines, true));
    return `#layer(${n(l.x)}, ${n(l.y)}, ${n(l.w)}, ${n(h)}, ${n(l.rot || 0)})[\n${body.map((b) => '  ' + b).join('\n')}\n]`;
  }

  function shapeLayer(l) {
    const comps = C.shapes.typstCurve(C.shapes.path(l));
    if (!comps) return '';
    const fill = l.kind === 'line' || l.fillMode === 'none' ? 'none' : col(l.fill);   // a gradient never gets here (flattened)
    let stroke = 'none';
    if (l.sw > 0) {
      const t = l.sw * PT * 72 / 70;
      const dash = l.dash === 'dash' ? `, dash: (${n(t * 3)}pt, ${n(t * 2)}pt)` : l.dash === 'dot' ? `, dash: (0pt, ${n(t * 2)}pt)` : '';
      stroke = `(paint: ${col(l.scolor)}, thickness: ${n(t)}pt, cap: "round", join: "round"${dash})`;
    }
    return `#shape-box(${n(l.x)}, ${n(l.y)}, ${n(l.w)}, ${n(l.h)}, ${n(l.rot || 0)}, ${l.flipH ? -1 : 1}, ${l.flipV ? -1 : 1})[#place(top + left, curve(fill: ${fill}, fill-rule: "even-odd", stroke: ${stroke}, ${comps}))]`;
  }

  function source(cover, plan, opt) {
    const o = opt || {};
    const { wIn, hIn } = pageSize(cover.fmt);
    const byId = new Map(plan.layers.map((l) => [l.id, l]));
    const patchPath = o.patchPath || ((k) => `/p/${k}.jpg`);
    const split = o.patches ? o.patches.reduce((m, p) => { (m[p.n] = m[p.n] || []).push(p); return m; }, {}) : null;
    const out = [
      '// NicheInk 09 Cover, written by js/cover/typst.js (template c2). Do not edit.',
      '#import "/cover.typ": *',
      `#set page(width: ${n(wIn)}in, height: ${n(hIn)}in, margin: 0pt, fill: ${col(cover.bg)})`,
      `#set text(fill: ${col('#1C1C1A')})`
    ];
    const lines = [], missingFonts = [], patches = [];
    const vectorFaces = new Map();   // only the faces written as vector text go to Typst
    for (const it of plan.items) {
      if (it.kind === 'patch') {
        const parts = split && split[it.n] ? split[it.n] : [{ n: it.n, box: it.box, path: patchPath(it.n) }];
        for (const p of parts) {
          const b = p.box;
          if (b.x1 <= b.x0 || b.y1 <= b.y0) continue;
          const path = p.path || patchPath(p.n);
          patches.push({ path, box: b });
          out.push(`#patch(${str(path)}, ${b.x0}, ${b.y0}, ${b.x1}, ${b.y1})`);
        }
        continue;
      }
      const l = byId.get(it.id);
      if (!l) continue;
      if (l.type === 'text') {
        if (!String(l.text || '').trim()) continue;
        const t = textLayer(l, it.part, lines);
        if (t == null) { missingFonts.push({ id: l.id, font: l.font }); continue; }
        const f = C.fonts.face(l.font, l.weight);
        vectorFaces.set(`${f.family}|${f.weight}`, f);
        out.push(t);
      } else if (l.type === 'shape') {
        out.push(shapeLayer(l));
      }
    }
    const faces = [...vectorFaces.values()].sort((a, b) => a.n - b.n || a.weight - b.weight);
    return { mainTyp: out.join('\n') + '\n', faces, lines, patches, missingFonts, size: { wIn, hIn } };
  }

  C.typst = { TEMPLATE, str, source, pageSize, baseOf };
})(globalThis);
