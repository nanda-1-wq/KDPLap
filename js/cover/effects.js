/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: text effects (E16 Part 5, plan §3 "Text", design 61)
   /js/cover/effects.js   (browser; needs model, picker, render, fonts)

   The Text effects popover of the text bar, ported from the design's
   fxTiles, fxShow, fxOn, curve and distortion controls:
   - 9 styles (None, Shadow, Lift, Glow, Outline, Hollow, 3D, Echo,
     Background). A tile sets the style and its own default color.
     Each tile is drawn by our renderer (D10), so it shows what prints.
   - The controls of each style (the design's fxShow map) with the design's
     ranges (kdpCover.model.RANGE.fx); the color uses the shared picker.
   - Curve −100 to 100 (one line only); distortion basic (top and bottom
     −50 to 50) or free (4 green corners on the cover, view.js).
   - Cancel puts back { fx, curve, dist } from when the popover opened;
     OK and × keep the changes. Every change is one undo step per drag.
   - The note says what stays vector and what becomes a picture, as
     kdpCover.flatten decides (plan D1, D17).

   kdpCover.effects.html(E, l)        → the popover HTML (E.menu === 'effects')
   kdpCover.effects.bind(bar, E)      → events (delegated on the bar element)
   kdpCover.effects.paintTiles(root)  → draws the 9 tile glyphs
   kdpCover.effects.SHOW              → style → its controls
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // The design's fxShow: which controls each style has.
  const SHOW = { shadow: 'color int dist dir blur', lift: 'int dist blur', glow: 'color int blur', outline: 'color width', hollow: 'width',
    '3d': 'color depth dir', echo: 'color dist dir width', bg: 'color int pad round' };
  const LABEL = { int: 'Strength', dist: 'Distance', dir: 'Direction', blur: 'Softness', width: 'Thickness', depth: 'Depth', pad: 'Space', round: 'Roundness' };
  const KEYS = ['int', 'dist', 'dir', 'blur', 'width', 'depth', 'pad', 'round'];
  const show = (style) => (SHOW[style] || '').split(' ').filter(Boolean);
  // What stays vector and what becomes a picture, as kdpCover.flatten.fxRaster and classify decide (D1, D17).
  // The owner's words (STOP 5); t-effects checks each style against the flatten plan.
  const NOTE = 'Outline, 3D, curve, and full-strength shadows and backgrounds stay sharp text. '
    + 'Soft or light effects, glow, lift and echo become a 300 DPI picture under your text. Hollow and distortion turn the text into a 300 DPI picture.';

  function slider(k, v) {
    const r = C.model.RANGE.fx[k];
    return `<label class="cv-fx-row"><span>${LABEL[k]}</span><input type="range" min="${r[0]}" max="${r[1]}" step="1" value="${v}" data-k="fx-${k}" data-fx-k="${k}">
      <span class="cv-mono cv-fx-v" data-fx-v="${k}">${v}${k === 'dir' ? '°' : ''}</span></label>`;
  }
  function pair(key, label, v, min, max, reset) {
    return `<div class="cv-fx-pair"><span class="cv-fx-pl">${label}</span>
      <input type="range" min="${min}" max="${max}" step="1" value="${v}" data-k="${key}" data-fx-num="${key}" aria-label="${label}">
      <input type="number" class="cv-num" min="${min}" max="${max}" step="1" value="${v}" data-k="${key}-n" data-fx-num="${key}" aria-label="${label} amount">
      ${reset ? `<button type="button" class="cv-linkbtn" data-k="${key}-reset" data-fx="${key}-reset">Reset</button>` : ''}</div>`;
  }

  function html(E, l) {
    const fx = l.fx, st = fx.style, ctl = show(st), D = l.dist;
    const tiles = C.model.FX_STYLES.map(([key, label]) => `<button type="button" class="cv-fx-tile${st === key ? ' is-on' : ''}" data-k="fxs-${key}" data-fx-style="${key}" aria-pressed="${st === key}">
        <canvas class="cv-fx-glyph" width="56" height="40" data-fx-tile="${key}" aria-hidden="true"></canvas><span>${label}</span></button>`).join('');
    return `<div class="cv-pop cv-pop-fx" role="dialog" aria-label="Text effects" data-fxpop>
      <div class="cv-pop-head"><h2 class="cv-h2-lg">Text effects</h2><button type="button" class="cv-x cv-x-lg" data-k="fx-x" data-fx="ok" aria-label="Close">${X}</button></div>
      <div class="cv-fx-tiles" role="group" aria-label="Style">${tiles}</div>
      ${ctl.length ? `<div class="cv-fx-box">
        ${ctl.includes('color') ? `<div class="cv-fx-cap">Color</div><div class="cv-pk-embed" data-picker>${C.picker.html(E.pk, { cur: fx.color, embed: true })}</div>` : ''}
        ${KEYS.filter((k) => ctl.includes(k)).map((k) => slider(k, fx[k])).join('')}
      </div>` : ''}
      <div class="cv-fx-sec">
        <div class="cv-fx-head"><span>Curve</span><button type="button" class="cv-linkbtn" data-k="curve-reset" data-fx="curve-reset">Reset</button></div>
        ${pair('curve', 'Curve', l.curve, -100, 100, false)}
        <p class="cv-pop-p cv-pop-p-sm">Up arches the text, down bends it like a smile. One line only.</p>
      </div>
      <div class="cv-fx-sec">
        <label class="cv-check"><input type="checkbox" data-k="dist-on" data-fx-dist${D.on ? ' checked' : ''}>Enable distortion</label>
        ${D.on ? `<div class="cv-fx-modes" role="radiogroup" aria-label="Distortion type">
            <label class="cv-radio"><input type="radio" name="cv-distmode" value="basic" data-k="dist-basic" data-fx-mode${D.mode === 'basic' ? ' checked' : ''}>Basic</label>
            <label class="cv-radio"><input type="radio" name="cv-distmode" value="free" data-k="dist-free" data-fx-mode${D.mode === 'free' ? ' checked' : ''}>Free transform</label></div>
          ${D.mode === 'basic' ? pair('top', 'Top', D.top, -50, 50, true) + pair('bottom', 'Bottom', D.bottom, -50, 50, true)
            : `<div class="cv-fx-free"><span>Drag the 4 green corners on the cover.</span><button type="button" class="cv-linkbtn" data-k="quad-reset" data-fx="quad-reset">Reset corners</button></div>`}` : ''}
      </div>
      <p class="cv-pop-p cv-pop-p-sm">${NOTE}</p>
      <div class="cv-fx-foot"><button type="button" class="cv-btn2" data-k="fx-cancel" data-fx="cancel">Cancel</button><button type="button" class="cv-btn2 is-ink" data-k="fx-ok" data-fx="ok">OK</button></div>
    </div>`;
  }

  /** The tile glyphs: an "A" in Source Serif 4 Bold with the style's default color, by our renderer. */
  function paintTiles(el) {
    for (const cv of el.querySelectorAll('canvas[data-fx-tile]')) {
      const key = cv.dataset.fxTile, def = C.model.FX_STYLES.find((s) => s[0] === key);
      const dpr = root.devicePixelRatio || 1;
      cv.width = 56 * dpr; cv.height = 40 * dpr;
      const ctx = cv.getContext('2d');
      const l = C.model.textLayer('t', { text: 'A', x: 0, y: 0, w: 56, size: 26, font: 'Source Serif 4', weight: 700, color: '#1C1C1A', align: 'center',
        fx: Object.assign({}, C.model.FX_DEF, { style: key, color: def[2], dist: 3, blur: 3, width: 2, depth: 4, pad: 4, round: 4 }) });
      const h = C.textlayout.height(l);
      l.y = (40 - h) / 2;
      try { C.render.paint(ctx, { fmt: { trim: '6x9', pages: 54, paper: 'white' }, bg: '#FFFFFF', layers: [l] }, { scale: dpr, x0: 0, y0: 0, bg: false, screen: true, images: () => null }); }
      catch (e) { /* a tile that cannot draw stays blank; its word still names it */ }
    }
  }

  function bind(bar, E) {
    const L = () => { const l = E.selLayer(); return l && l.type === 'text' ? l : null; };
    const o = { bars: false, panel: false, overlay: false };
    const setFx = (patch, opt) => { const l = L(); if (l) E.patchLayer(l.id, { fx: Object.assign({}, l.fx, patch) }, null, opt || o); };
    const setDist = (patch, opt) => { const l = L(); if (l) E.patchLayer(l.id, { dist: Object.assign({}, l.dist, patch) }, null, opt || {}); };
    bar.addEventListener('click', (e) => {
      if (!e.target.closest('[data-fxpop]')) return;
      const t = e.target.closest('[data-fx-style], [data-fx]');
      if (!t) return;
      const l = L(); if (!l) return;
      if (t.dataset.fxStyle) {
        const key = t.dataset.fxStyle, col = C.model.FX_STYLES.find((s) => s[0] === key)[2];
        E.pickerTo('fxcolor', col);
        setFx({ style: key, color: col }, {});
        const n = bar.querySelector(`[data-fx-style="${key}"]`); if (n) n.focus({ preventScroll: true });
        return;
      }
      const a = t.dataset.fx;
      if (a === 'ok') E.fxDone(true);
      else if (a === 'cancel') E.fxDone(false);
      else if (a === 'curve-reset') E.patchLayer(l.id, { curve: 0 });
      else if (a === 'top-reset') setDist({ top: 0 });
      else if (a === 'bottom-reset') setDist({ bottom: 0 });
      else if (a === 'quad-reset') setDist({ q: [[0, 0], [0, 0], [0, 0], [0, 0]] });
    });
    bar.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.closest('[data-fxpop]')) return;
      const l = L(); if (!l) return;
      if (t.dataset.fxK) {
        const k = t.dataset.fxK, v = Number(t.value);
        setFx({ [k]: v });
        const out = bar.querySelector(`[data-fx-v="${k}"]`); if (out) out.textContent = v + (k === 'dir' ? '°' : '');
        return;
      }
      if (t.dataset.fxNum && t.type === 'range') {
        const k = t.dataset.fxNum, v = Number(t.value);
        if (k === 'curve') E.patchLayer(l.id, { curve: v }, null, o);
        else setDist({ [k]: v }, o);
        const twin = bar.querySelector(`input[type="number"][data-fx-num="${k}"]`); if (twin) twin.value = v;
      }
    });
    bar.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.closest('[data-fxpop]')) return;
      const l = L(); if (!l) return;
      if (t.dataset.fxNum && t.type === 'number') {
        const k = t.dataset.fxNum, r = k === 'curve' ? C.model.RANGE.curve : C.model.RANGE.distTB;
        const v = Math.round(Math.min(r[1], Math.max(r[0], Number(t.value) || 0)));
        if (k === 'curve') E.patchLayer(l.id, { curve: v }); else setDist({ [k]: v });
      } else if (t.matches('[data-fx-dist]')) setDist({ on: t.checked });
      else if (t.matches('[data-fx-mode]')) setDist({ mode: t.value });
      else if (t.type === 'range') E.refreshBars();   // a slider let go: the tiles and the bar again
    });
  }

  C.effects = { SHOW, NOTE, html, bind, paintTiles, show };
})(globalThis);
