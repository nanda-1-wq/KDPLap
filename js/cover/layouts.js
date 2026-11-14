/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: ready layouts, spine text, My layouts (E16 Part 1)
   /js/cover/layouts.js   (pure, no DOM; tested by tests/cover-layouts.test.js)

   The 12 ready layouts + Blank, ported from the design's layoutBase():
   authored at 6 × 9, 54 pages, white, and remapped to the book's size. The
   board numbers F = 437.25, FW = 428.75 and cx = 647.25 are the design's
   literals (they are 6 × 9 at 54 pages within 0.013 px; kept as written).

   book = { title, subtitle, pen } (the book's own words).

   Stack and Bold split the title (the design hardcodes "MICRO / STUDY /
   HABITS" for its sample book): the first 3 words in capitals are the big
   title, and the other words go in front of the subtitle, so the cover
   shows the full title (owner STOP 1, N4; planned difference D15: the
   design's Stack drops them). Bold gives the design's words exactly.

   kdpCover.layouts.LIST / KEYS / BLURB_PLACEHOLDER
   kdpCover.layouts.base(key, book, startId, blurbText) → { layers, bg, nextId } at 6 × 9 / 54 / white
   kdpCover.layouts.build(key, book, fmt, startId, blurbText, opt) → { layers, bg, nextId } at the book's size
   kdpCover.layouts.spineText(book)  → "TITLE    PEN NAME" source words (caps on the layer)
   kdpCover.layouts.spineLayer(id, fmt, book) → the Add spine text layer (cap height, 7 to 14 pt, owner Q-9), or null
   kdpCover.layouts.applyMy(entry, book, fmt, startId, blurbText, opt) → { layers, bg, nextId }
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const LIST = [['blank', 'Blank', 'Start from an empty cover.'], ['band', 'Band', 'Title on a color band.'], ['center', 'Center', 'Calm, centered type.'], ['stack', 'Stack', 'Big stacked title.'],
    ['corner', 'Corner', 'Dark cover, title top left, badge.'], ['picfull', 'Picture full', 'Photo behind everything.'], ['picband', 'Picture band', 'Photo on top, words below.'],
    ['framed', 'Framed', 'Thin frame, classic look.'], ['arch', 'Arch photo', 'Photo in an arch window.'], ['circle', 'Big circle', 'Title inside a sun circle.'],
    ['stripes', 'Stripes', 'Color stripes across the top.'], ['ribbon', 'Ribbon', 'Title on a ribbon, award seal.'], ['bold', 'Bold type', 'Huge title on bright color.']];
  const KEYS = LIST.map((x) => x[0]);
  const BLURB_PLACEHOLDER = 'Your back blurb goes here. Use Book data, Write blurb, to draft it from your book.';
  const AUTHORED = { trim: '6x9', pages: 54, paper: 'white' };

  const words = (t) => String(t || '').split(' ');
  const head3 = (t) => words(t).slice(0, 3).map((w) => w.toUpperCase());
  const rest3 = (t) => words(t).slice(3).join(' ');
  /** The title's words after the third, then the subtitle: "for Busy Adult Learners. How to Keep Up…" */
  const subWithRest = (B) => { const rest = rest3(B.title); return (rest ? rest + '. ' : '') + String(B.subtitle || ''); };
  const blurbOf = (bt) => (bt && bt.indexOf('Your back blurb goes here') < 0 ? bt : BLURB_PLACEHOLDER);

  function base(key, book, startId, blurbText) {
    const M = C.model;
    const B = book || {}, F = 437.25, FW = 428.75, cx = 647.25;
    let id = startId; const nid = () => id++;
    const T = (o) => M.textLayer(nid(), o), S = (o) => M.shapeLayer(nid(), o), I = (o) => M.imageLayer(nid(), o);
    const blurb = (color) => T({ src: 'blurb', text: blurbOf(blurbText), x: 60, y: 120, w: 310, font: 'IBM Plex Sans', size: 11, color, align: 'left' });
    const title = (o) => T(Object.assign({ src: 'title', text: String(B.title || ''), font: 'Source Serif 4', size: 34, weight: 700 }, o));
    const sub = (o) => T(Object.assign({ src: 'subtitle', text: String(B.subtitle || ''), font: 'IBM Plex Sans', size: 14 }, o));
    const pen = (o) => T(Object.assign({ src: 'pen', text: String(B.pen || ''), font: 'IBM Plex Sans', size: 12, weight: 600, caps: true, ls: 0.12 }, o));
    const at = (w) => cx - w / 2;
    let L = [], bg = '#FFFFFF';
    if (key === 'band') { bg = '#F2EDE4'; L = [S({ x: F, y: 150, w: FW, h: 210, fill: '#1F3A5F' }), title({ x: at(360), y: 175, w: 360, color: '#FFFFFF' }), sub({ x: at(330), y: 390, w: 330, color: '#1F3A5F' }), pen({ x: at(300), y: 565, w: 300, color: '#1F3A5F' }), blurb('#3D3D39')]; }
    if (key === 'center') { bg = '#F2EDE4'; L = [title({ x: at(360), y: 170, w: 360, size: 38, color: '#2F4A3A' }), S({ kind: 'line', x: at(120), y: 330, w: 120, h: 24, fillMode: 'none', sw: 2, scolor: '#2F4A3A' }), sub({ x: at(320), y: 370, w: 320, color: '#3D3D39' }), pen({ x: at(300), y: 565, w: 300, color: '#2F4A3A' }), blurb('#3D3D39')]; }
    if (key === 'stack') { bg = '#FFFFFF'; L = [S({ x: F, y: 0, w: 30, h: 648, fill: '#E07A5F' }), T({ src: 'title', text: head3(B.title).join('\n'), x: 490, y: 90, w: 330, font: 'Bebas Neue', size: 78, color: '#1C1C1A', align: 'left' }), sub({ text: subWithRest(B), x: 490, y: 400, w: 320, align: 'left', color: '#3D3D39' }), pen({ x: 490, y: 565, w: 300, align: 'left', color: '#E07A5F' }), blurb('#3D3D39')]; }
    if (key === 'corner') { bg = '#2F4A3A'; L = [title({ x: 480, y: 70, w: 330, align: 'left', color: '#F2EDE4' }), sub({ x: 480, y: 250, w: 300, align: 'left', color: '#CFE3D6' }), S({ kind: 'burst', x: 690, y: 400, w: 120, h: 120, fill: '#F2C14E', points: 14, depth: 82 }), pen({ x: 480, y: 575, w: 300, align: 'left', color: '#F2EDE4' }), blurb('#F2EDE4')]; }
    if (key === 'picfull') { bg = '#3E3557'; L = [I({ x: 0, y: 0, w: 866, h: 648, dark: 30 }), title({ x: at(360), y: 200, w: 360, color: '#FFFFFF' }), sub({ x: at(320), y: 380, w: 320, color: '#F2EDE4' }), pen({ x: at(300), y: 575, w: 300, color: '#FFFFFF' }), blurb('#FFFFFF')]; }
    if (key === 'framed') { bg = '#F2EDE4'; L = [S({ kind: 'frame', x: 472, y: 40, w: 350, h: 568, fill: '#2F4A3A', thick: 5 }), title({ x: at(300), y: 150, w: 300, size: 32, color: '#2F4A3A' }), S({ kind: 'diamond', x: cx - 9, y: 318, w: 18, h: 18, fill: '#E07A5F' }), sub({ x: at(270), y: 360, w: 270, size: 12, color: '#3D3D39' }), pen({ x: at(260), y: 530, w: 260, color: '#2F4A3A' }), blurb('#3D3D39')]; }
    if (key === 'arch') { bg = '#E9DDCB'; L = [I({ x: at(300), y: 50, w: 300, h: 330, mask: 'arch' }), title({ x: at(360), y: 400, w: 360, size: 26, color: '#3E3557' }), sub({ x: at(320), y: 495, w: 320, size: 11, color: '#55554F' }), pen({ x: at(300), y: 585, w: 300, color: '#3E3557' }), blurb('#3D3D39')]; }
    if (key === 'circle') { bg = '#1F3A5F'; L = [S({ kind: 'ellipse', x: at(310), y: 110, w: 310, h: 310, fill: '#F2C14E' }), title({ x: at(240), y: 180, w: 240, size: 26, color: '#1F3A5F' }), sub({ x: at(330), y: 450, w: 330, size: 12, color: '#DCEBF2' }), pen({ x: at(300), y: 575, w: 300, color: '#F2C14E' }), blurb('#FFFFFF')]; }
    if (key === 'stripes') { bg = '#FFFFFF'; L = [S({ x: 0, y: 0, w: 866, h: 52, fill: '#E07A5F' }), S({ x: 0, y: 52, w: 866, h: 52, fill: '#F2C14E' }), S({ x: 0, y: 104, w: 866, h: 52, fill: '#2F4A3A' }), title({ x: 480, y: 200, w: 340, size: 34, align: 'left', color: '#1C1C1A' }), sub({ x: 480, y: 400, w: 320, align: 'left', color: '#3D3D39' }), pen({ x: 480, y: 575, w: 300, align: 'left', color: '#2F4A3A' }), blurb('#3D3D39')]; }
    if (key === 'ribbon') { bg = '#F2EDE4'; L = [S({ kind: 'seal', x: 710, y: 50, w: 100, h: 100, fill: '#F2C14E' }), S({ kind: 'ribbon', x: F + 20, y: 230, w: FW - 40, h: 150, fill: '#7A2E2E' }), title({ x: at(300), y: 255, w: 300, size: 24, color: '#FFFFFF' }), sub({ x: at(320), y: 420, w: 320, size: 12, color: '#3D3D39' }), pen({ x: at(300), y: 575, w: 300, color: '#7A2E2E' }), blurb('#3D3D39')]; }
    if (key === 'bold') {
      bg = '#F2C14E'; L = [T({ src: 'title', text: head3(B.title).join(' '), x: 470, y: 60, w: 360, font: 'Anton', size: 66, color: '#1C1C1A', align: 'left' }), S({ x: 470, y: 400, w: 90, h: 10, fill: '#1C1C1A' }), T({ src: 'subtitle', text: subWithRest(B), x: 470, y: 430, w: 330, font: 'IBM Plex Sans', size: 12, color: '#1C1C1A', align: 'left' }), pen({ x: 470, y: 585, w: 300, align: 'left', color: '#1C1C1A' }), blurb('#1C1C1A')];
    }
    if (key === 'picband') { bg = '#F2EDE4'; L = [I({ x: F, y: 0, w: FW, h: 340 }), title({ x: at(360), y: 370, w: 360, size: 30, color: '#1C1C1A' }), sub({ x: at(320), y: 490, w: 320, size: 12, color: '#3D3D39' }), pen({ x: at(300), y: 585, w: 300, color: '#7A2E2E' }), blurb('#3D3D39')]; }
    return { layers: L, bg, nextId: id };
  }

  function build(key, book, fmt, startId, blurbText, opt) {
    if (key === 'blank') return { layers: [], bg: '#FFFFFF', nextId: startId };
    const b = base(key, book, startId, blurbText);
    return Object.assign(b, { layers: C.remap.remap(b.layers, C.geo.geo(AUTHORED), C.geo.geo(fmt), opt).layers });
  }

  /** The spine words: the full title and the pen name, 4 spaces apart (caps on the layer). */
  const spineText = (book) => String((book && book.title) || '') + '    ' + String((book && book.pen) || '');

  /**
   * Add spine text: one rotated line, IBM Plex Sans 600 in capitals, sized
   * by cap height to the spine minus 0.0625 in each side (7 to 14 pt), then
   * smaller (half points, not under 7 pt) while the words need a second
   * line, with the capitals' band centered on the spine. null when the book is too
   * thin for spine text (80 pages cream, 86 white).
   */
  function spineLayer(id, fmt, book) {
    const g = C.geo.geo(fmt), TL = C.textlayout;
    if (!g.spineTextOk) return null;
    const font = 'IBM Plex Sans', weight = 600;
    const room = g.spine - 2 * 0.0625 * g.I, size = TL.spineSize(room, TL.metricsOf(font, weight));
    const w = g.trimH - 2 * 0.5 * g.I;
    const L = C.model.textLayer(id, { src: 'spine', text: spineText(book), font, size, weight, caps: true, ls: 0.08, align: 'center', color: '#1C1C1A', w, x: 0, y: 0, rot: 90 });
    // one line: a long title steps down by half points until it fits the spine's length (never under 7 pt)
    while (L.size > TL.MIN_PT && TL.lines(L).length > 1) L.size -= 0.5;
    const h = TL.height(L), band = TL.inkBand(L), d = (band.top + band.bottom) / 2 - h / 2;
    // rotate(90deg): the box's own +y points to the board's −x, so the band center sits d px left of the box center
    L.x = (g.foldL + g.foldR) / 2 + d - w / 2;
    L.y = g.H / 2 - h / 2;
    return L;
  }

  /**
   * A My layout on this book: remapped from its own size, with this book's
   * title, subtitle and pen name (a title with line breaks keeps the stacked
   * form), this book's blurb, and this book's spine words (plan D2). Spine
   * text is left out when this book is too thin for it.
   */
  function applyMy(entry, book, fmt, startId, blurbText, opt) {
    const g = C.geo.geo(fmt), B = book || {};
    let id = startId;
    const L = C.remap.remap(entry.layers, C.geo.geo(entry.fmt || AUTHORED), g, opt).layers.filter((l) => l.src !== 'spine' || g.spineTextOk).map((l) => {
      const c = Object.assign({}, l, { id: id++ });
      if (c.src === 'title') c.text = /\n/.test(l.text) ? head3(B.title).join('\n') : String(B.title || '');
      else if (c.src === 'subtitle') c.text = String(B.subtitle || '');
      else if (c.src === 'pen') c.text = String(B.pen || '');
      else if (c.src === 'blurb') c.text = blurbOf(blurbText);
      else if (c.src === 'spine') c.text = spineText(B);
      return c;
    });
    return { layers: L, bg: entry.bg, nextId: id };
  }

  C.layouts = { LIST, KEYS, BLURB_PLACEHOLDER, AUTHORED, base, build, spineText, spineLayer, applyMy, head3, rest3 };
})(globalThis);
