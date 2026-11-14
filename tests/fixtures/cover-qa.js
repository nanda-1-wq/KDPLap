/* ═══════════════════════════════════════════════════
   NicheInk · tests: the 09 Cover QA covers (E16 Part 2)
   /tests/fixtures/cover-qa.js   (loaded by tests/browser/cover/engine.html,
                                  tests/cover-flatten.test.js and tests/cover-typst.test.js)

   Covers that each isolate one KDP risk, so a KDP Previewer fail points at
   one thing (plan R7, R10). Book: the design's sample book. Size: 6 × 9,
   54 pages, white (the page count of the E15 QA files), unless named.
   Pictures are synthetic (tests/browser/cover/harness.js draws them):
   "photo:<seed>" and "cutout:<seed>" (a transparent PNG).

   kdpCoverQa.BOOK
   kdpCoverQa.sheet(key, fmt) → { fmt, bg, layers, layout } for 'effects', 'photos', 'shapes', 'spine'
   kdpCoverQa.layout(key, fmt) → a ready layout on the design book (asset 'photo:<id>' on its pictures)
   kdpCoverQa.SHEETS
═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const BOOK = { title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days', pen: 'Adnan Haroun' };
  const BLURB = 'You want to finish your course, but work takes your best hours. This book shows you how to study in ten-minute blocks, keep notes that stay useful, and plan a week you can actually keep. Each chapter ends with one small habit to try tomorrow.';
  const SHEETS = ['effects', 'photos', 'shapes', 'spine'];

  const K = () => root.kdpCover;
  const FX = (o) => Object.assign({ style: 'none', color: '#1C1C1A', int: 60, dist: 6, dir: 45, blur: 6, width: 2, depth: 6, pad: 8, round: 6 }, o);

  function sheet(key, fmtIn) {
    const C = K(), M = C.model;
    const fmt = fmtIn || { trim: '6x9', pages: key === 'spine' ? 120 : 54, paper: 'white' };
    const g = C.geo.geo(fmt);
    const back = (x) => g.b + x, front = (x) => g.foldR + x;
    let id = 1;
    const T = (o) => M.textLayer(id++, Object.assign({ w: 180, size: 20, font: 'Source Serif 4', weight: 700, color: '#1C1C1A', align: 'center' }, o));
    const S = (o) => M.shapeLayer(id++, o);
    const I = (o) => M.imageLayer(id++, Object.assign({ natW: 4800, natH: 3200 }, o));
    const layers = [];
    let bg = '#FFFFFF';
    if (key === 'effects') {
      bg = '#F2EDE4';
      const cells = [
        ['None', {}, 'Source Serif 4', 700],
        ['Shadow soft', { style: 'shadow' }, 'Montserrat', 600],
        ['Shadow hard', { style: 'shadow', int: 100, blur: 0, dist: 3, color: '#7A2E2E' }, 'Oswald', 600],
        ['Lift', { style: 'lift' }, 'Playfair Display', 700],
        ['Glow', { style: 'glow', color: '#F2C14E', blur: 8 }, 'Inter', 600],
        ['Outline', { style: 'outline', color: '#F2C14E', width: 2 }, 'Bebas Neue', 400],
        ['Hollow', { style: 'hollow', width: 1.5 }, 'Anton', 400],
        ['3D', { style: '3d', color: '#E07A5F', depth: 5 }, 'Poppins', 700],
        ['Echo', { style: 'echo', color: '#E07A5F', width: 2 }, 'Raleway', 700],
        ['Background soft', { style: 'bg', color: '#F2C14E', int: 60 }, 'IBM Plex Sans', 600],
        ['Background solid', { style: 'bg', color: '#1F3A5F', int: 100 }, 'IBM Plex Sans', 600, '#FFFFFF'],
        ['Curved up', null, 'Lora', 700],
        ['Curved down', null, 'Merriweather', 700],
        ['Distort basic', null, 'Roboto Slab', 700],
        ['Distort free', null, 'Libre Baskerville', 700],
        ['Opacity 50', null, 'Dancing Script', 700]
      ];
      cells.forEach(([label, fx, font, weight, color], i) => {
        const col = i % 2, row = Math.floor(i / 2) % 4, panel = i < 8 ? back : front;
        const x = panel(36 + col * 186), y = 40 + row * 74;
        const o = { text: label, x, y, font, weight, color: color || '#1C1C1A' };
        if (fx) o.fx = FX(fx);
        if (label === 'Curved up') o.curve = 60;
        if (label === 'Curved down') o.curve = -45;
        if (label === 'Distort basic') o.dist = { on: true, mode: 'basic', top: -30, bottom: 20, q: [[0, 0], [0, 0], [0, 0], [0, 0]] };
        if (label === 'Distort free') o.dist = { on: true, mode: 'free', top: 0, bottom: 0, q: [[10, -6], [-14, 8], [6, 10], [-8, -4]] };
        if (label === 'Opacity 50') { o.op = 50; o.size = 26; }
        layers.push(T(o));
      });
      // Under the grid: letter spacing, a turned text with a soft shadow, a script face, and a blurb.
      layers.push(T({ text: 'Spaced capitals', caps: true, ls: 0.12, x: front(36), y: 350, w: 360, size: 16, font: 'IBM Plex Sans', weight: 600 }));
      layers.push(T({ text: 'Turned 12 degrees', rot: -12, x: front(60), y: 400, w: 300, size: 22, font: 'Source Serif 4', weight: 700, fx: FX({ style: 'shadow', int: 70, blur: 4, dist: 4 }) }));
      layers.push(T({ text: 'Great Vibes script', x: front(36), y: 470, w: 360, size: 30, font: 'Great Vibes', weight: 400, color: '#2F4A3A' }));
      layers.push(T({ text: 'Space Mono 700', x: front(36), y: 540, w: 360, size: 14, font: 'Space Mono', weight: 700 }));
      layers.push(T({ text: BLURB, x: back(36), y: 350, w: 340, size: 11, font: 'IBM Plex Sans', weight: 400, align: 'left' }));
    } else if (key === 'photos') {
      bg = '#FFFFFF';
      // Back: a full-bleed picture with darken, white words on it (vector letters on a patch).
      layers.push(I({ asset: 'photo:11', x: 0, y: 0, w: g.foldL, h: g.H, dark: 35 }));
      layers.push(T({ text: BLURB, x: back(36), y: 90, w: 340, size: 11, font: 'IBM Plex Sans', weight: 400, color: '#FFFFFF', align: 'left' }));
      layers.push(T({ text: 'Pictures sheet', x: back(36), y: 40, w: 340, size: 20, color: '#FFFFFF' }));
      // Front: arch mask with a border; a title with a soft shadow over it (an effect patch on a picture patch).
      layers.push(I({ asset: 'photo:12', x: front(60), y: 40, w: 300, h: 300, mask: 'arch', bw: 3, bcolor: '#1F3A5F' }));
      layers.push(T({ text: 'Arch, border, shadow', x: front(60), y: 250, w: 300, size: 24, color: '#FFFFFF', fx: FX({ style: 'shadow', int: 80, blur: 6, dist: 3 }) }));
      layers.push(I({ asset: 'photo:13', x: front(36), y: 360, w: 120, h: 120, mask: 'circle', look: 'sepia' }));
      layers.push(I({ asset: 'photo:14', x: front(170), y: 360, w: 100, h: 120, mask: 'rounded', look: 'bw', blur: 2 }));
      layers.push(S({ kind: 'rect', x: front(290), y: 360, w: 95, h: 120, fill: '#7A2E2E' }));
      layers.push(I({ asset: 'photo:15', x: front(300), y: 380, w: 80, h: 80, op: 60, rot: 10 }));
      layers.push(I({ asset: 'photo:16', x: front(36), y: 500, w: 120, h: 80, flipH: true, con: 130, sat: 160, bri: 110 }));
      layers.push(S({ kind: 'rect', x: front(170), y: 500, w: 215, h: 90, fillMode: 'grad', fill: '#1F3A5F', fill2: '#E07A5F', gAngle: 90 }));
      layers.push(I({ asset: 'cutout:17', transparent: true, natW: 1200, natH: 1200, x: front(230), y: 505, w: 80, h: 80 }));
      layers.push(T({ text: 'Cutout PNG on a gradient', x: front(170), y: 590, w: 215, size: 9, font: 'IBM Plex Sans', weight: 600 }));
    } else if (key === 'shapes') {
      bg = '#FFFFFF';
      const kinds = C.shapes.KINDS;
      kinds.forEach((kind, i) => {
        const panel = i < 14 ? back : front, j = i % 14, col = j % 3, row = Math.floor(j / 3);
        const o = Object.assign(C.shapes.defaults(kind, g), { kind, x: panel(36 + col * 125), y: 40 + row * 105, w: 100, h: kind === 'line' ? 10 : 80 });
        if (i % 4 === 1) Object.assign(o, { fillMode: 'grad', fill: '#1F3A5F', fill2: '#F2C14E', gAngle: 45 * (i % 8) });
        if (i % 5 === 2) Object.assign(o, { sw: 3, scolor: '#1C1C1A', dash: 'dash' });
        if (i % 5 === 3) Object.assign(o, { sw: 3, scolor: '#E07A5F', dash: 'dot' });
        if (i % 6 === 4) Object.assign(o, { flipH: true, rot: 15 });
        if (i % 9 === 5) o.op = 70;
        if (kind === 'line') Object.assign(o, { sw: 4, scolor: '#1C1C1A', fillMode: 'none' });
        layers.push(S(o));
      });
      layers.push(T({ text: 'Shapes sheet', x: front(36), y: 560, w: 360, size: 18 }));
    } else if (key === 'spine') {
      // 120 pages: spine text by cap height (Q-9), the full title and pen name on one line.
      const b = C.layouts.build('band', BOOK, fmt, 1, BLURB, {});
      const sp = C.layouts.spineLayer(1000, fmt, BOOK);
      return { fmt, bg: b.bg, layers: b.layers.concat(sp ? [sp] : []), layout: 'band' };
    }
    return { fmt, bg, layers, layout: null };
  }

  function layout(key, fmt) {
    const C = K();
    const b = C.layouts.build(key, BOOK, fmt, 1, BLURB, {});
    const layers = b.layers.map((l) => (l.type === 'image' ? Object.assign({}, l, { asset: `photo:${l.id}` }) : l));
    return { fmt, bg: b.bg, layers, layout: key };
  }

  root.kdpCoverQa = { BOOK, BLURB, SHEETS, sheet, layout };
})(globalThis);
