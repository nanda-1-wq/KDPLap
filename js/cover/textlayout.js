/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: text layout (E16 Part 1)
   /js/cover/textlayout.js   (pure, no DOM; tested by tests/cover-textlayout.test.js)

   One line breaker for the screen, the checks, the size remap, the handles
   and (Part 2) the Typst writer. It replaces the design's offsetHeight and
   its estimate (plan §1). Text has no stored height: it always comes from here.

   Widths come from measure(font, weight, sizePx, text) → px. In the browser
   Part 4 sets it to ctx.measureText on the loaded TTF. Until then (and in
   Deno tests) the stub gives every character 0.55 em, as the design's
   charW() does without a document. The stub is NOT real font metrics.

   As the design's CSS: line height 1.15, letter spacing ls em after every
   character, white-space pre-wrap (spaces kept, a line breaks at a space,
   trailing spaces hang), a break after a hyphen between letters, overflow-
   wrap break-word (a word longer than the box breaks between characters),
   capitals by toUpperCase.

   kdpCover.textlayout.setMeasure(fn) / measure / stubMeasure
   kdpCover.textlayout.lines(l)      → [{ text, width }]
   kdpCover.textlayout.height(l)     → px (a curved line: line + sag, as the design's curve box)
   kdpCover.textlayout.curve(l)      → { list: [{ ch, x, top, w, rot }], height }   (design curveChars)
   kdpCover.textlayout.metricsOf(font, weight) → { cap, asc, desc } in em
   kdpCover.textlayout.inkBand(l)    → { top, bottom } px from the box top: cap top to baseline (caps on), else ascender to descender
   kdpCover.textlayout.spineSize(roomPx, m) → pt: capitals fill the room, 7 to 14 pt, half-point steps (owner Q-9)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const PT = 70 / 72;
  const LINE = 1.15;
  const MIN_PT = 7;     // KDP: no text under 7 pt
  const SPINE_MAX_PT = 14;

  // Vertical metrics in em, read from the pinned TTF (OS/2 sCapHeight, hhea ascender and descender).
  // IBM Plex Sans 600: @expo-google-fonts/ibm-plex-sans@0.4.1 600SemiBold/IBMPlexSans_600SemiBold.ttf,
  // sha256 659f916ce1922bd4fecac7cd5f26018817a2946327a5dd00169c8bab14ae2c58: unitsPerEm 1000,
  // sCapHeight 698, hhea 1025 / -275. Part 2's font catalog adds every family.
  const METRICS = {
    'IBM Plex Sans': { cap: 0.698, asc: 1.025, desc: 0.275 }
  };
  // A family without measured metrics yet: a common sans shape (used only until Part 2's catalog).
  const FALLBACK = { cap: 0.7, asc: 1.0, desc: 0.25 };

  const stubMeasure = (font, weight, sizePx, text) => Array.from(String(text)).length * 0.55 * sizePx;
  let measureFn = stubMeasure;
  const setMeasure = (fn) => { measureFn = typeof fn === 'function' ? fn : stubMeasure; };
  const measure = (font, weight, sizePx, text) => measureFn(font, weight, sizePx, text);

  const shown = (l) => (l.caps ? String(l.text).toUpperCase() : String(l.text));
  const px = (l) => l.size * PT;
  const lineH = (l) => px(l) * LINE;

  /** Width of a run, with letter spacing after every character (CSS letter-spacing). */
  function runW(l, s) {
    if (!s) return 0;
    const p = px(l);
    return measure(l.font, l.weight, p, s) + (l.ls || 0) * p * Array.from(s).length;
  }

  /** Break one paragraph (no \n) into lines that fit w. */
  function breakPara(l, para, w) {
    const out = [];
    if (para === '') return [{ text: '', width: 0 }];
    // break chances: after spaces (they hang) and after a hyphen between letters ("Low-|Energy"), as CSS and Typst
    const parts = para.split(/( +)/).filter((x) => x !== '').flatMap((x) => (/^ +$/.test(x) ? [x] : x.split(/(?<=[^\s-]-)(?=\p{L})/u)));
    let cur = '';
    const push = (t) => out.push({ text: t, width: runW(l, t.replace(/ +$/, '')) });
    for (const part of parts) {
      if (/^ +$/.test(part)) { cur += part; continue; }        // spaces hang at the line end
      const next = cur + part;
      if (runW(l, next.replace(/ +$/, '')) <= w + 1e-9) { cur = next; continue; }
      if (cur.trim() !== '') push(cur);                         // only-space starts are dropped at a break
      cur = '';
      if (runW(l, part) <= w + 1e-9) { cur = part; continue; }
      // break-word: a word longer than the box breaks between characters
      let piece = '';
      for (const ch of Array.from(part)) {
        if (piece && runW(l, piece + ch) > w + 1e-9) { push(piece); piece = ch; }
        else piece += ch;
      }
      cur = piece;
    }
    if (cur !== '' || !out.length) push(cur);
    return out;
  }

  function lines(l) {
    const w = Math.max(1, Number(l.w) || 1);
    return shown(l).split('\n').reduce((acc, para) => acc.concat(breakPara(l, para, w)), []);
  }

  /** The design's curveChars(): characters on an arc. curve > 0 arches up. */
  function curve(l) {
    const txt = shown(l).replace(/\n/g, ' ');
    const chars = Array.from(txt), ws = chars.map((ch) => runW(l, ch));
    const tw = ws.reduce((x, y) => x + y, 0) || 1;
    const theta = Math.abs(l.curve) / 100 * Math.PI, R = tw / theta, up = l.curve > 0;
    const lh = lineH(l), sag = R * (1 - Math.cos(Math.min(theta, Math.PI) / 2));
    let acc = 0;
    const list = chars.map((ch, i) => {
      const sPos = acc + ws[i] / 2 - tw / 2; acc += ws[i];
      const phi = sPos / R, x = l.w / 2 + R * Math.sin(phi), drop = R * (1 - Math.cos(phi));
      return { ch, x: x - ws[i] / 2, top: up ? drop : sag - drop, w: ws[i], rot: up ? phi : -phi, origin: up ? 'bottom' : 'top' };
    });
    return { list, height: lh + sag };
  }

  function height(l) {
    if (l.curve) return curve(l).height;
    return lines(l).length * lineH(l);
  }

  const metricsOf = (font) => METRICS[font] || FALLBACK;

  /**
   * The ink band from the box top (CSS line box: half-leading, then the
   * ascender, the baseline, the descender). All capitals (caps on): from the
   * first line's cap top to the last line's baseline. Otherwise from the
   * first line's ascender to the last line's descender, so lower-case tails
   * count (owner, STOP 1). A curved line keeps its whole box.
   */
  function inkBand(l) {
    const h = height(l);
    if (l.curve) return { top: 0, bottom: h };
    const m = metricsOf(l.font, l.weight), p = px(l), lh = lineH(l), n = lines(l).length;
    const lead = (lh - (m.asc + m.desc) * p) / 2;                // half-leading (negative when the font is taller than 1.15)
    const base = lead + m.asc * p;                               // baseline from the line top
    if (l.caps) return { top: base - m.cap * p, bottom: (n - 1) * lh + base };
    return { top: lead, bottom: (n - 1) * lh + base + m.desc * p };
  }

  /** Spine text size: the capitals fill the room (spine minus 0.0625 in each side), 7 to 14 pt, half-point steps. */
  function spineSize(roomPx, m) {
    const roomPt = roomPx / PT;
    const fit = Math.floor(roomPt / (m || FALLBACK).cap * 2) / 2;
    return Math.max(MIN_PT, Math.min(SPINE_MAX_PT, fit));
  }

  C.textlayout = { PT, LINE, MIN_PT, SPINE_MAX_PT, METRICS, FALLBACK, stubMeasure, setMeasure, measure, lines, height, curve, metricsOf, inkBand, spineSize, lineH, runW };
})(globalThis);
