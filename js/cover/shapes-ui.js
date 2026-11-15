/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: shapes and icons (E16 Part 5, plan §3 "Shapes and
   icons", design 64)
   /js/cover/shapes-ui.js   (browser; needs shapes, model, picker, names)

   The Shapes panel: the 27 shape tiles (design shapeTiles: a click adds the
   shape in the middle of the front), then the Icons section (plan §8, owner
   Q-4, D11): the Tabler filled icons in the same 3-column tile grid, with
   search. The icon set (js/cover/icon-set.js, about 540 KB) loads the first
   time the panel opens; a saved icon layer carries its own paths, so the
   cover draws without it. The tiles are ink on paper (§7: grays in the app).

   The shape bar of design 64: shape name (Change shape), Fill (solid,
   gradient with start, end and angle, or none), Border (width, solid,
   dashed, dotted, color; "Line" for a line), opacity, flip left to right,
   the size in inches, Arrange, duplicate, lock, More (rotation, flip top to
   bottom, exclude from export) and delete. An icon's name is a label, not a
   menu: an icon does not turn into a shape.

   kdpCover.shapesUi.panelHtml(E) / barHtml(E) / bindPanel(el, E) / bindBar(el, E)
   kdpCover.shapesUi.iconRows(q)   → the icon rows for the grid (cover favorites first)
   kdpCover.shapesUi.loadIcons()   → Promise: the icon set script loaded once
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    flip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M9 7L4 17h5z"/><path d="M15 7l5 10h-5z"/></svg>',
    line: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M4 12h16"/></svg>',
    dup: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    del: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };
  // Icons a book cover reaches for first (plan §8 names the first 7); then the rest A to Z.
  const FIRST = ['crown', 'laurel-wreath-1', 'laurel-wreath-2', 'laurel-wreath-3', 'star', 'heart', 'leaf', 'paw', 'butterfly', 'feather', 'flower', 'clover',
    'sparkles', 'sparkles-2', 'sun', 'moon', 'cloud', 'book', 'bookmark', 'award', 'rosette', 'trophy', 'diamond', 'christmas-tree', 'apple', 'bulb', 'compass', 'key',
    'shield', 'mood-smile', 'ribbon-health', 'circle', 'square', 'triangle', 'hexagon', 'flame', 'droplet', 'snowflake', 'umbrella', 'music', 'file-music', 'cup',
    'coffee', 'mug', 'home', 'map-pin', 'bell', 'gift', 'cake', 'balloon', 'baby-carriage', 'school', 'brain', 'dumbbell', 'run', 'yoga', 'pray', 'cash-banknote', 'coin', 'chart-pie-2'];
  const PAGE = 48;

  /* ── Icon set: loaded once, the first time it is needed ── */
  let iconsP = null;
  function loadIcons() {
    if (C.iconSet) return Promise.resolve(C.iconSet);
    if (iconsP) return iconsP;
    iconsP = new Promise((resolve, reject) => {
      const me = document.querySelector('script[src*="js/cover/shapes.js"]');
      const s = document.createElement('script');
      s.src = me ? me.src.replace(/shapes\.js(\?.*)?$/, 'icon-set.js') : '../js/cover/icon-set.js';
      s.onload = () => (C.iconSet ? resolve(C.iconSet) : reject(new Error('icon set empty')));
      s.onerror = () => { s.remove(); reject(new Error('icon set did not load')); };
      document.head.append(s);
    });
    iconsP.catch(() => { iconsP = null; });
    return iconsP;
  }
  let ORDER = null;
  function order() {
    if (ORDER) return ORDER;
    const rows = C.iconSet.rows, by = new Map(rows.map((r) => [r[0], r]));
    const first = FIRST.filter((n) => by.has(n)).map((n) => by.get(n));
    ORDER = first.concat(rows.filter((r) => !FIRST.includes(r[0])));
    return ORDER;
  }
  function iconRows(q) {
    if (!C.iconSet) return [];
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return order();
    return order().filter((r) => { const hay = (r[0].replace(/-/g, ' ') + ' ' + r[1] + ' ' + r[2]).toLowerCase(); return words.every((w) => hay.includes(w)); });
  }

  /* ── Small drawings ── */
  function shapeSvg(kind, small) {
    const wd = ['line', 'arrow', 'ribbon', 'parallelogram', 'chevron'].includes(kind);
    const pl = { kind, w: wd ? 40 : 30, h: kind === 'line' ? 10 : wd ? 20 : kind === 'semicircle' ? 15 : 30, radius: kind === 'rounded' ? 7 : 0, points: kind === 'burst' ? 14 : 5, depth: kind === 'burst' ? 82 : 45, head: 40, thick: 22 };
    const d = C.shapes.path(pl), k = small ? 0.8 : 1;
    const att = kind === 'line' ? 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"' : 'fill="currentColor" fill-rule="evenodd"';
    return `<svg width="${Math.round((pl.w + 4) * k)}" height="${Math.round((pl.h + 4) * k)}" viewBox="-2 -2 ${pl.w + 4} ${pl.h + 4}" aria-hidden="true"><path d="${d}" ${att}/></svg>`;
  }
  const iconSvg = (paths, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths.map((d) => `<path d="${esc(d)}"/>`).join('')}</svg>`;
  /** A small drawing of a shape layer (the Layers rows): its own kind, fill and border look. */
  function layerSvg(l) {
    const w = 28, h = l.kind === 'line' ? 8 : Math.max(6, Math.min(28, 28 * l.h / Math.max(1, l.w)));
    if (l.kind === 'icon') return `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${l.paths.map((d) => `<path d="${esc(d)}" fill="${l.fillMode === 'none' ? 'none' : l.fill}" stroke="${l.fillMode === 'none' ? l.scolor : 'none'}" stroke-width="1.5"/>`).join('')}</svg>`;
    const d = C.shapes.path(Object.assign({}, l, { w, h, radius: Math.min(l.radius || 0, 6) }));
    const att = l.kind === 'line' ? `fill="none" stroke="${l.scolor}" stroke-width="2"` : `fill="${l.fillMode === 'none' ? 'none' : l.fill}" fill-rule="evenodd" stroke="${l.fillMode === 'none' ? l.scolor : 'none'}" stroke-width="1.5"`;
    return `<svg width="28" height="${Math.round(h + 4)}" viewBox="-2 -2 ${w + 4} ${h + 4}" aria-hidden="true"><path d="${d}" ${att}/></svg>`;
  }

  /* ── Panel ── */
  function panelHtml(E) {
    const st = E.icons;
    const rows = st === 'ready' ? iconRows(E.iconQ) : [];
    const shown = rows.slice(0, E.iconN);
    const count = C.iconSet ? C.iconSet.rows.length : 1019;
    return `
      <div class="cv-cap">SHAPES</div>
      <div class="cv-tiles">${C.shapes.LIST.map(([kind, label]) => `<button type="button" class="cv-tile" data-k="sh-${kind}" data-add-shape="${kind}">${shapeSvg(kind)}<span>${label}</span></button>`).join('')}</div>
      <p class="cv-help">The shape drops in the middle of the front. Use shapes for color bands, frames behind the title, badges and dividers.</p>
      <div class="cv-rule"></div>
      <div class="cv-cap">ICONS</div>
      <input type="search" class="cv-input" data-k="icon-q" data-icon-q aria-label="Search icons" placeholder="Search ${count.toLocaleString('en-US')} icons" value="${esc(E.iconQ)}">
      ${st === 'loading' ? '<p class="cv-help" role="status">Loading icons…</p>' : ''}
      ${st === 'error' ? `<div class="cv-iconerr" role="alert"><p>We couldn’t load the icons. Check your connection, then try again.</p><button type="button" class="cv-sbtn" data-k="icons-retry" data-icons-retry>Retry</button></div>` : ''}
      ${st === 'ready' ? `<div class="cv-tiles cv-tiles-icons" data-icon-grid>${shown.map((r) => `<button type="button" class="cv-tile cv-tile-icon" data-k="ic-${r[0]}" data-add-icon="${r[0]}" title="${esc(C.shapes.iconLabel(r[0]))}">${iconSvg(r[3], 26)}<span>${esc(C.shapes.iconLabel(r[0]))}</span></button>`).join('')}</div>
        ${!rows.length ? `<p class="cv-help">No icon matches "${esc(E.iconQ)}".</p>` : ''}
        ${rows.length > shown.length ? `<button type="button" class="cv-sbtn cv-more" data-k="icons-more" data-icons-more>Show more (${(rows.length - shown.length).toLocaleString('en-US')} more)</button>` : ''}` : ''}
      <p class="cv-help cv-help-sm">Tabler Icons, free to use on books you sell (MIT licence). An icon drops in the middle of the front. Recolor it with Fill and Border, like a shape.</p>
      <p class="cv-help cv-help-sm">Photos and clipart without a background are in Images, Pixabay, "No background only".</p>`;
  }

  function bindPanel(el, E) {
    el.addEventListener('click', (e) => {
      if (E.panel !== 'shapes') return;
      const s = e.target.closest('[data-add-shape]');
      if (s) { E.addShape(s.dataset.addShape); return; }
      const i = e.target.closest('[data-add-icon]');
      if (i) { const r = C.iconSet && C.iconSet.rows.find((x) => x[0] === i.dataset.addIcon); if (r) E.addIcon(r); return; }
      if (e.target.closest('[data-icons-more]')) { E.iconN += PAGE * 2; E.refreshPanel(); return; }
      if (e.target.closest('[data-icons-retry]')) E.openIcons();
    });
    el.addEventListener('input', (e) => {
      if (E.panel !== 'shapes' || !e.target.matches('[data-icon-q]')) return;
      E.iconQ = e.target.value; E.iconN = PAGE;
      E.refreshPanel();
    });
  }

  /* ── Shape bar (design 64) ── */
  const btn = (k, on, label, icon, extra) => `<button type="button" class="cv-ib${on ? ' is-on' : ''}" data-k="${k}" aria-label="${label}" aria-pressed="${on}"${extra || ''}>${icon}</button>`;
  function fillSwatch(l) {
    if (l.fillMode === 'grad') return `<span class="cv-swatch cv-swatch-grad" style="--sw:${l.fill};--sw2:${l.fill2};--ga:${l.gAngle}deg"></span>`;
    if (l.fillMode === 'none') return '<span class="cv-swatch cv-checker"></span>';
    return `<span class="cv-swatch" style="--sw:${l.fill}"></span>`;
  }
  function range(k, label, min, max, v, unit) {
    return `<label class="cv-fx-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" value="${v}" data-k="s-${k}" data-sk="${k}"><span class="cv-mono cv-fx-v" data-sv="${k}">${v}${unit || ''}</span></label>`;
  }
  function seg(list, cur, attr) {
    return `<div class="cv-seg">${list.map(([v, label]) => `<button type="button" class="cv-segb${cur === v ? ' is-on' : ''}" data-k="${attr}-${v}" data-${attr}="${v}" aria-pressed="${cur === v}">${label}</button>`).join('')}</div>`;
  }

  function barHtml(E) {
    const l = E.selLayer();
    if (!l || l.type !== 'shape' || E.multi.length > 1) return '';
    const m = E.menu, icon = l.kind === 'icon', line = l.kind === 'line';
    const name = C.names.layerName(Object.assign({}, l, { label: null }));
    const R = C.model.RANGE;
    const pk = (title) => `<div class="cv-pk-embed" data-picker>${C.picker.html(E.pk, { cur: colorFor(E, l), embed: true, title })}</div>`;
    return `
      ${icon ? `<span class="cv-shname" title="Icon">${esc(name)}</span>`
        : `<button type="button" class="cv-tb${m === 'shape' ? ' is-open' : ''}" data-k="shape" data-sact="shape" aria-expanded="${m === 'shape'}" aria-label="Shape: ${esc(name)}">${esc(name)} ▾</button>`}
      ${line ? '' : `<button type="button" class="cv-tb${m === 'sfill' ? ' is-open' : ''}" data-k="sfill" data-sact="sfill" aria-expanded="${m === 'sfill'}">${fillSwatch(l)}Fill</button>`}
      <button type="button" class="cv-tb${m === 'stroke' ? ' is-open' : ''}" data-k="stroke" data-sact="stroke" aria-expanded="${m === 'stroke'}">${l.sw > 0 || line ? `<span class="cv-strokeic" style="--sw:${l.scolor}">${I.line}</span>` : I.line}${line ? 'Line' : 'Border'}</button>
      <button type="button" class="cv-tb${m === 'opacity' ? ' is-open' : ''}" data-k="op" data-sact="opacity" aria-expanded="${m === 'opacity'}" aria-label="Opacity ${l.op}%"><span class="cv-checker" aria-hidden="true"></span>${l.op}%</button>
      ${btn('flipH', !!l.flipH, 'Flip left to right', I.flip, ' data-sact="flipH"')}
      <span class="cv-mono cv-sizetext" data-sizetext>${(l.w / 70).toFixed(2)} × ${(l.h / 70).toFixed(2)} in</span>
      <span class="cv-grow"></span>
      <button type="button" class="cv-tb${m === 'arrange' ? ' is-open' : ''}" data-k="arr" data-sact="arrange" aria-expanded="${m === 'arrange'}">Arrange ▾</button>
      <button type="button" class="cv-ib" data-k="dup" data-sact="dup" aria-label="Duplicate">${I.dup}</button>
      ${btn('lock', !!l.lock, l.lock ? 'Unlock' : 'Lock', I.lock, ' data-sact="lock"')}
      <button type="button" class="cv-ib${m === 'more' ? ' is-on' : ''}" data-k="more" data-sact="more" aria-label="More" aria-expanded="${m === 'more'}">⋯</button>
      <button type="button" class="cv-ib cv-ib-del" data-k="del" data-sact="del" aria-label="Delete">${I.del}</button>
      ${m === 'shape' && !icon ? `<div class="cv-pop cv-pop-shape" role="dialog" aria-label="Shape">
          <span class="cv-pop-cap">Change shape</span>
          <div class="cv-swapgrid">${C.shapes.LIST.map(([kind, label]) => `<button type="button" class="cv-swap${l.kind === kind ? ' is-on' : ''}" data-k="sw-${kind}" data-swap="${kind}" aria-label="${label}" aria-pressed="${l.kind === kind}" title="${label}">${shapeSvg(kind, true)}</button>`).join('')}</div>
          ${l.kind === 'rect' || l.kind === 'rounded' ? range('radius', 'Corners', R.radius[0], R.radius[1], l.radius) : ''}
          ${l.kind === 'star' || l.kind === 'burst' ? range('points', 'Points', R.points[0], R.points[1], l.points) + range('depth', 'Inner size', R.depth[0], R.depth[1], l.depth) : ''}
          ${l.kind === 'frame' || l.kind === 'ring' ? range('thick', 'Thickness', R.thick[0], R.thick[1], l.thick) : ''}
          ${l.kind === 'arrow' ? range('head', 'Arrow head', R.head[0], R.head[1], l.head) : ''}
          <p class="cv-pop-p cv-pop-p-sm">Corner handles keep the shape. Side handles stretch it.</p></div>` : ''}
      ${m === 'sfill' && !line ? `<div class="cv-pop cv-pop-sfill" role="dialog" aria-label="Fill">
          ${seg([['solid', 'Solid'], ['grad', 'Gradient'], ['none', 'No fill']], l.fillMode, 'fmode')}
          ${l.fillMode === 'grad' ? seg([['fill', 'Start color'], ['fill2', 'End color']], E.pk.target === 'fill2' ? 'fill2' : 'fill', 'gstop') : ''}
          ${l.fillMode !== 'none' ? pk() : '<p class="cv-pop-p cv-pop-p-sm">No fill: only the border shows. Add a border in Border.</p>'}
          ${l.fillMode === 'grad' ? range('gAngle', 'Angle', R.gAngle[0], R.gAngle[1], l.gAngle, '°') + '<p class="cv-pop-p cv-pop-p-sm">A gradient becomes a 300 DPI picture when you export.</p>' : ''}
        </div>` : ''}
      ${m === 'stroke' ? `<div class="cv-pop cv-pop-stroke" role="dialog" aria-label="${line ? 'Line' : 'Border'}">
          ${range('sw', 'Width', R.sw[0], R.sw[1], l.sw, ' pt')}
          ${seg([['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], l.dash, 'dash')}
          ${pk()}
        </div>` : ''}
      ${m === 'opacity' ? `<div class="cv-pop cv-pop-sop" role="dialog" aria-label="Opacity">
          <label class="cv-range"><span class="cv-range-row"><strong>Opacity</strong><span class="cv-mono" data-sv="op">${l.op}%</span></span>
          <input type="range" min="0" max="100" step="1" value="${l.op}" data-k="op-range" data-sk="op"></label>
          <p class="cv-pop-p cv-pop-p-sm">When you export, NicheInk merges see-through parts with what is under them into one flat 300 DPI picture. KDP gets a flat file.</p></div>` : ''}
      ${m === 'arrange' ? `<div class="cv-pop cv-pop-arr" role="menu" aria-label="Arrange">
          <button type="button" role="menuitem" class="cv-mi" data-k="a-front" data-sarr="front">Bring to front</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-fwd" data-sarr="forward">Bring forward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-bwd" data-sarr="backward">Send backward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-back" data-sarr="back">Send to back</button>
          <p class="cv-pop-p cv-pop-p-sm">Forward and backward jump past the next layer this one covers.</p></div>` : ''}
      ${m === 'more' ? `<div class="cv-pop cv-pop-more" role="dialog" aria-label="More">
          <div class="cv-morerow"><label class="cv-field-in">Rotation<input type="number" class="cv-num" min="-180" max="180" step="1" value="${Math.round(l.rot || 0)}" data-k="rot-n" data-srot>°</label>
            <button type="button" class="cv-linkbtn" data-k="rot-reset" data-sact="rot-reset">Reset</button></div>
          <label class="cv-check"><input type="checkbox" data-k="flipV" data-scheck="flipV"${l.flipV ? ' checked' : ''}>Flip top to bottom</label>
          <label class="cv-check"><input type="checkbox" data-k="noExport" data-scheck="noExport"${l.noExport ? ' checked' : ''}>Exclude from export</label>
          <p class="cv-pop-p cv-pop-p-sm">Use it for a reference picture you trace over. It stays on the canvas but is left out of your files.</p></div>` : ''}`;
  }

  function colorFor(E, l) { const t = E.pk.target; return t === 'fill2' ? l.fill2 : t === 'scolor' ? l.scolor : l.fill; }

  function bindBar(el, E) {
    const L = () => { const l = E.selLayer(); return l && l.type === 'shape' && E.multi.length < 2 ? l : null; };
    const quiet = { bars: false, panel: false, overlay: false };
    el.addEventListener('click', (e) => {
      const l = L(); if (!l) return;
      const b = e.target.closest('[data-sact], [data-swap], [data-fmode], [data-gstop], [data-dash], [data-sarr]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.dataset.swap) { E.patchLayer(l.id, C.shapes.swapKind(l, b.dataset.swap)); return; }
      if (b.dataset.fmode) { E.pickerTo('fill', l.fill); E.patchLayer(l.id, { fillMode: b.dataset.fmode }); return; }
      if (b.dataset.gstop) { const t = b.dataset.gstop; E.pickerTo(t, l[t]); E.refreshBars(); return; }
      if (b.dataset.dash) { E.patchLayer(l.id, { dash: b.dataset.dash }); return; }
      if (b.dataset.sarr) { E.arrange(b.dataset.sarr); return; }
      const a = b.dataset.sact;
      if (a === 'shape' || a === 'opacity' || a === 'arrange' || a === 'more') E.toggleMenu(a);
      else if (a === 'sfill') E.toggleMenu('sfill');
      else if (a === 'stroke') E.toggleMenu('stroke');
      else if (a === 'flipH') E.patchLayer(l.id, { flipH: !l.flipH });
      else if (a === 'dup') E.duplicate();
      else if (a === 'lock') E.patchLayer(l.id, { lock: !l.lock });
      else if (a === 'del') E.removeSel();
      else if (a === 'rot-reset') E.patchLayer(l.id, { rot: 0 });
    });
    el.addEventListener('input', (e) => {
      const l = L(); if (!l) return;
      const t = e.target;
      if (!t.dataset.sk) return;
      const k = t.dataset.sk, v = Number(t.value);
      E.patchLayer(l.id, { [k]: v }, null, quiet);
      const out = el.querySelector(`[data-sv="${k}"]`);
      if (out) out.textContent = v + (k === 'gAngle' ? '°' : k === 'sw' ? ' pt' : k === 'op' ? '%' : '');
      if (k === 'op') { const ob = el.querySelector('[data-k="op"]'); if (ob) { ob.lastChild.textContent = v + '%'; ob.setAttribute('aria-label', `Opacity ${v}%`); } }
    });
    el.addEventListener('change', (e) => {
      const l = L(); if (!l) return;
      const t = e.target;
      if (t.dataset.scheck) { E.patchLayer(l.id, { [t.dataset.scheck]: t.checked }); return; }
      if (t.matches('[data-srot]')) { const v = Math.round(Math.min(180, Math.max(-180, Number(t.value) || 0))); E.patchLayer(l.id, { rot: v }); return; }
      if (t.dataset.sk) E.refreshBars();   // a slider let go: the swatch and the size again
    });
  }

  C.shapesUi = { panelHtml, bindPanel, barHtml, bindBar, iconRows, loadIcons, layerSvg, shapeSvg, iconSvg, PAGE };
})(globalThis);
