/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: colors and series palettes (E16 Part 1)
   /js/cover/palettes.js   (pure, no DOM; tested by tests/cover-palettes.test.js)

   Ported from the design: PALETTES, NEUTRAL, swapPalette(), lum(),
   contrast(), hexToRgb(), rgbToHex(), hsvToHex(), hexToHsv(), and the
   picker's CMYK read-out and recent list.

   kdpCover.palettes.swap(layers, bg, pal) → { layers, bg }: the cover's colors, most used first,
       go onto the 4-color palette (light ones to the light color); white and near-black stay
   kdpCover.palettes.lum(hex) / contrast(a, b) / hexToRgb / rgbToHex / hsvToHex / hexToHsv / cmyk(hex) / recent(list, hex)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  const PALETTES = [['Navy and coral', ['#1F3A5F', '#E07A5F', '#F2EDE4', '#F2C14E']], ['Forest', ['#2F4A3A', '#C9A227', '#EEF2EA', '#7FA88C']], ['Plum', ['#3E3557', '#E59A6B', '#F3EEF5', '#B5596A']],
    ['Teal', ['#1D5C63', '#F2A65A', '#EAF4F4', '#7BC4C4']], ['Brick', ['#7A2E2E', '#E0B15A', '#F7EFE6', '#B86B52']], ['Charcoal', ['#2B2B28', '#9A9A94', '#F3F3F1', '#5C5C57']]];
  const NEUTRAL = ['#FFFFFF', '#1C1C1A', '#3D3D39', '#55554F', '#000000'];
  const RECENT_MAX = 5;

  const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  function hsvToHex(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
  }
  function hexToHsv(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { hue: Math.round((h * 60 + 360) % 360), sat: max ? d / max : 0, val: max };
  }
  const lum = (hex) => hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** The picker's read-out: "C M Y K" in whole percent (design). */
  function cmyk(hex) {
    const [r, g, b] = hexToRgb(hex), k = 1 - Math.max(r, g, b) / 255;
    const cm = (c) => (k >= 1 ? 0 : Math.round(((1 - c / 255 - k) / (1 - k)) * 100));
    return [cm(r), cm(g), cm(b), Math.round(k * 100)];
  }
  const recent = (list, hex) => [hex].concat((list || []).filter((c) => c !== hex)).slice(0, RECENT_MAX);

  function swap(layers, bg, pal) {
    const count = {};
    const bump = (c, n) => { if (!c) return; c = c.toUpperCase(); if (NEUTRAL.includes(c)) return; count[c] = (count[c] || 0) + n; };
    bump(bg, 3);
    layers.forEach((l) => {
      if (l.type === 'shape') { bump(l.fill, 2); if (l.fillMode === 'grad') bump(l.fill2, 1); if (l.sw) bump(l.scolor, 1); }
      if (l.type === 'text') { bump(l.color, 1); if (l.fx && l.fx.style !== 'none') bump(l.fx.color, 1); }
      if (l.type === 'image' && l.bw) bump(l.bcolor, 1);
    });
    const order = Object.keys(count).sort((a, b) => count[b] - count[a]);
    const map = {}; let k = 0; const darkSlots = [0, 1, 3];
    order.forEach((c) => { map[c] = lum(c) > 0.55 ? pal[2] : pal[darkSlots[k++ % 3]]; });
    const m = (c) => (c && map[c.toUpperCase()]) || c;
    return {
      bg: m(bg),
      layers: layers.map((l) => {
        const c = Object.assign({}, l);
        if (c.type === 'shape') { c.fill = m(c.fill); c.fill2 = m(c.fill2); c.scolor = m(c.scolor); }
        if (c.type === 'text') { c.color = m(c.color); if (c.fx) c.fx = Object.assign({}, c.fx, { color: m(c.fx.color) }); }
        if (c.type === 'image') c.bcolor = m(c.bcolor);
        return c;
      })
    };
  }

  C.palettes = { PALETTES, NEUTRAL, RECENT_MAX, hexToRgb, rgbToHex, hsvToHex, hexToHsv, lum, contrast, cmyk, recent, swap };
})(globalThis);
