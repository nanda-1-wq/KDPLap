/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the canvas view (E16 Part 4, plan §3 "Canvas view")
   /js/cover/view.js   (browser; needs geo, textlayout, model, render, fonts)

   The workspace of design 58: the gray area, the cover at zoom z with its
   top left at (px, py) in workspace px. Ported from the design's
   renderVals() (groupStyle, paperStyle, layerStyle, tpl, lines, handles),
   startAct/onAct/endAct, onWheel, fitView and zoomAt.

   Layers back to front:
     1. the paper (the background color) and the KDP template layer: DOM in
        board px under a scale(z) transform, as the design draws them; the
        template is never exported, its words stay as drawn (Nov 13 19:42);
     2. the cover's layers: one canvas the size of the workspace, painted by
        kdpCover.render.paint (plan Q-2: our renderer, D10), without the
        background (it is the paper below the template, as in the design);
     3. a DOM overlay in board px: one focusable box per layer (front first,
        so Tab goes front to back), the selection frame with real handle
        buttons, and the in-place text box while typing;
     4. guide lines and the snap line across the workspace (workspace px).
   Every drag is captured on the workspace element, so the overlay can be
   drawn again while it runs.

   Part 5: several layers selected (E.multi) show a dashed outline each and
   one box around them, with no handles; Shift- or Cmd-click adds or takes
   away a layer; a drag on a member moves them all (the design's gmove); a
   drag on the bare cover draws a box and selects what it touches (the
   design's marquee; on the gray it still pans). A text with free
   distortion shows 4 green corners (the design's quad handles): drag them,
   or focus one and use the arrow keys (1 px, Shift 10 px).

   const v = kdpCover.view.create(E)   E: the editor (js/cover/editor.js)
   v.el            the workspace element
   v.paint()       the canvas again (after any layer change)
   v.sync()        the overlay, the template, the guides and the canvas
   v.fit() / v.center() / v.zoomAt(f)
   kdpCover.view.quadOf(l, h)  → the 4 corners of a distorted text in its own box (the design's quadOf)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PT = 70 / 72;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /** The design's tpl: KDP template layer words and numbers from the size. */
  function templateHtml(g) {
    const lf = g.liveFront, lb = g.liveBack, mm = (x) => (x * 25.4).toFixed(2);
    const box = (cls, x, y, w, h) => `<div class="${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`;
    const trim = `${g.tw} × ${g.th} in`;
    return `
      ${box('cv-tpl-bleed', 0, 0, g.W, g.H)}
      ${box('cv-tpl-live', lb.x0, lb.y0, lb.x1 - lb.x0, lb.y1 - lb.y0)}
      ${box('cv-tpl-live', lf.x0, lf.y0, lf.x1 - lf.x0, lf.y1 - lf.y0)}
      ${box('cv-tpl-trim', g.b, g.b, g.W - 2 * g.b, g.trimH)}
      <div class="cv-tpl-fold" style="left:${g.foldL}px;height:${g.H}px"></div>
      <div class="cv-tpl-fold" style="left:${g.foldR}px;height:${g.H}px"></div>
      <div class="cv-tpl-notes" style="width:${Math.max(200, g.foldL - 60)}px">
        <div><strong>Solid black line = trim</strong><br>KDP cuts the book here.</div>
        <div><strong>Blue dashed line = spine fold</strong><br>The fold can move a little in print.</div>
        <div><strong>White = live area</strong><br>Keep text, logos and key pictures here.</div>
        <div><strong>Pink = bleed</strong><br>Fill it with your background. No text or logos here.</div>
        <div><strong>This layer never prints.</strong><br>NicheInk leaves it out of every file you export.</div>
      </div>
      <div class="cv-tpl-barcode" style="left:${g.barcode.x}px;top:${g.barcode.y}px"><strong>Barcode area</strong>2.0 × 1.2 in<br>KDP prints it here</div>
      <div class="cv-tpl-label" style="left:30px;top:${g.H - 52}px">Back cover<br>${trim}</div>
      <div class="cv-tpl-info" style="left:${lf.x0}px;top:${Math.round(g.H * 0.23)}px;width:${lf.x1 - lf.x0}px">
        <div><strong class="cv-tpl-big">Paperback cover</strong><br>Left to right</div>
        <div><strong class="cv-tpl-big">${g.tw} × ${g.th} in book</strong><br>${mm(g.tw)} × ${mm(g.th)} mm</div>
        <div><strong>Full cover ${(g.W / 70).toFixed(3)} × ${(g.H / 70).toFixed(2)} in</strong><br>${mm(g.W / 70)} × ${mm(g.H / 70)} mm</div>
        <div><strong>Spine ${g.sp.toFixed(3)} in</strong><br>${(g.sp * 25.4).toFixed(2)} mm</div>
        <div>Black and white interior<br>${g.f.pages} pages · ${g.f.paper} paper</div>
      </div>
      <div class="cv-tpl-label cv-tpl-right" style="left:${g.W - 76}px;top:${g.H - 52}px">Front cover<br>${trim}</div>
      <div class="cv-tpl-spine" style="left:${g.foldL - 1.75}px;top:${Math.round(g.H * 0.65)}px">SPINE ${g.sp.toFixed(3)} in</div>`;
  }

  // Handles (the design's H factory): text = 4 corner marks + width; image = 4 corners; shape = 8 (a line: 2 ends).
  const LABEL = { rot: 'Drag to rotate', width: 'Drag to change the width', scale: 'Drag to resize', box: 'Drag to resize' };
  const CORNER = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' };
  function handleList(l) {
    if (l.type === 'image') return [['nw', 0, 0], ['ne', 1, 0], ['sw', 0, 1], ['se', 1, 1]].map(([c, x, y]) => ({ kind: 'scale', c, x, y }));
    if (l.type === 'shape') {
      const list = l.kind === 'line' ? [['w', 0, 0.5], ['e', 1, 0.5]] : [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
      return list.map(([c, x, y]) => ({ kind: 'box', c, x, y }));
    }
    return [['nw', 0, 0], ['ne', 1, 0], ['sw', 0, 1], ['se', 1, 1]].map(([c, x, y]) => ({ kind: 'deco', c, x, y }))
      .concat([{ kind: 'width', c: 'e', x: 1, y: 0.5 }]);
  }

  /** The design's quadOf: TL, TR, BR, BL in the layer's own px (basic: top and bottom spread; free: the 4 offsets). */
  function quadOf(l, h) {
    const w = l.w, D = l.dist;
    if (D.mode === 'basic') { const t = D.top / 100 * w / 2, b = D.bottom / 100 * w / 2; return [[-t, 0], [w + t, 0], [w + b, h], [-b, h]]; }
    const q = D.q;
    return [[q[0][0], q[0][1]], [w + q[1][0], q[1][1]], [w + q[2][0], h + q[2][1]], [q[3][0], h + q[3][1]]];
  }
  const QUAD = ['top left', 'top right', 'bottom right', 'bottom left'];

  function create(E) {
    const ws = document.createElement('div');
    ws.className = 'cv-ws';
    ws.setAttribute('data-ws', '');
    ws.innerHTML = `
      <div class="cv-board" data-back><div class="cv-paper" data-paper></div><div class="cv-tpl" data-tpl aria-hidden="true"></div></div>
      <canvas class="cv-canvas" data-canvas role="img"></canvas>
      <div class="cv-board cv-front" data-front></div>
      <div class="cv-guides" data-guides aria-hidden="true"></div>
      <div class="cv-snapline" data-snapline aria-hidden="true" hidden></div>
      <div class="cv-marquee" data-marquee aria-hidden="true" hidden></div>
      <div class="cv-pop cv-tplpop" role="dialog" aria-label="KDP template layer" data-tplpop hidden></div>`;
    const back = ws.querySelector('[data-back]'), front = ws.querySelector('[data-front]');
    const paper = ws.querySelector('[data-paper]'), tpl = ws.querySelector('[data-tpl]');
    const canvas = ws.querySelector('[data-canvas]'), guides = ws.querySelector('[data-guides]');
    const snapEl = ws.querySelector('[data-snapline]'), tplPop = ws.querySelector('[data-tplpop]'), mqEl = ws.querySelector('[data-marquee]');
    let tplKey = '', drag = null, pressed = null;

    const g = () => C.geo.geo(E.cover.fmt);
    const sel = () => E.cover.layers.find((l) => l.id === E.sel) || null;

    /* ── Painting ── */
    let paintQueued = false;
    function paint() {
      if (paintQueued) return;
      paintQueued = true;
      root.requestAnimationFrame(() => { paintQueued = false; paintNow(); });
    }
    function paintNow() {
      const dpr = root.devicePixelRatio || 1;
      const w = ws.clientWidth, h = ws.clientHeight;
      if (!w || !h) return;
      const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const { z, px, py } = E.view;
      const ids = E.cover.layers.filter((l) => !l.hidden && l.id !== E.editing).map((l) => l.id);
      C.render.paint(ctx, E.cover, { scale: z * dpr, x0: -px / z, y0: -py / z, bg: false, screen: true, ids, images: () => null });
      E.painted = (E.painted || 0) + 1;
    }

    /* ── Overlay ── */
    function boardStyle() {
      const { z, px, py } = E.view, G = g();
      const t = `translate(${px}px, ${py}px) scale(${z})`;
      for (const b of [back, front]) { b.style.transform = t; b.style.width = G.W + 'px'; b.style.height = G.H + 'px'; b.style.setProperty('--z', z); }
      paper.style.background = E.cover.bg;
      const key = JSON.stringify(G.f);
      if (key !== tplKey) { tpl.innerHTML = templateHtml(G); tplKey = key; }
      tpl.hidden = !!E.tpl.hide;
      tpl.style.opacity = String(E.tpl.op / 100);
    }

    function guidesHtml() {
      const G = g(), { z, px, py } = E.view;
      const sx = (x) => px + x * z, sy = (y) => py + y * z;
      const v = (x, c) => `<div class="cv-gl cv-gl-v ${c}" style="left:${sx(x)}px"></div>`;
      const h = (y, c) => `<div class="cv-gl cv-gl-h ${c}" style="top:${sy(y)}px"></div>`;
      return [v(G.liveBack.x0, 'is-live'), v(G.liveBack.x1, 'is-live'), v(G.liveFront.x0, 'is-live'), v(G.liveFront.x1, 'is-live'),
        v(G.foldL, 'is-fold'), v(G.foldR, 'is-fold'), h(G.liveBack.y0, 'is-live'), h(G.liveBack.y1, 'is-live')].join('');
    }

    function layerBox(l) {
      const h = l.type === 'text' ? E.textH(l) : l.h;
      return `left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${h}px;transform:${l.rot ? `rotate(${l.rot}deg)` : 'none'}`;
    }

    function overlay() {
      const L = E.cover.layers, n = L.length, S = E.multi.length ? null : sel();
      const M = E.multi;
      let out = '';
      // Front first in the DOM, so Tab goes from the front-most layer back (z-index keeps the hits right).
      for (let i = n - 1; i >= 0; i--) {
        const l = L[i];
        if (l.hidden) continue;
        const name = E.layerName(l);
        const kind = l.type === 'text' ? 'Text' : l.type === 'image' ? 'Picture' : 'Shape';
        const on = (S && S.id === l.id) || M.includes(l.id);
        out += `<button type="button" class="cv-hit${on ? ' is-sel' : ''}${M.includes(l.id) ? ' is-multi' : ''}${l.lock ? ' is-locked' : ''}" data-hit="${esc(l.id)}" style="${layerBox(l)};z-index:${i + 1}"
          aria-label="${esc(`${kind}: ${name}${l.lock ? ', locked' : ''}`)}" aria-pressed="${on ? 'true' : 'false'}"></button>`;
      }
      if (M.length > 1) {
        const B = C.geo.region(g(), 'sel', L.filter((l) => M.includes(l.id) && !l.hidden).map((l) => C.model.bbox(l, E.textH)));
        if (B && Number.isFinite(B.x)) out += `<div class="cv-group" aria-hidden="true" style="left:${B.x}px;top:${B.y}px;width:${B.w}px;height:${B.h}px;z-index:${n + 5}"></div>`;
      }
      if (S && !S.hidden) {
        const hs = S.lock || E.editing === S.id ? [] : handleList(S);
        out += `<div class="cv-sel${S.lock ? ' is-locked' : ''}" data-selbox style="${layerBox(S)};z-index:${n + 5}">
          ${S.lock ? '<span class="cv-tag">Locked</span>' : ''}
          ${!S.lock && E.editing !== S.id ? '<span class="cv-rotline" aria-hidden="true"></span>' : ''}
          ${hs.map((hd) => hd.kind === 'deco'
            ? `<span class="cv-h cv-h-deco" style="left:${hd.x * 100}%;top:${hd.y * 100}%" aria-hidden="true"></span>`
            : `<button type="button" class="cv-h cv-h-${hd.kind}" data-handle="${hd.kind}" data-c="${hd.c}" style="left:${hd.x * 100}%;top:${hd.y * 100}%"
                aria-label="${esc(`${LABEL[hd.kind]}${hd.kind === 'width' ? '' : `, ${CORNER[hd.c]}`}. Arrow keys work too.`)}"></button>`).join('')}
          ${!S.lock && E.editing !== S.id ? '<button type="button" class="cv-h cv-h-rot" data-handle="rot" data-c="rot" aria-label="Drag to rotate. Arrow keys work too."></button>' : ''}
          ${S.type === 'text' && S.dist && S.dist.on && S.dist.mode === 'free' && !S.lock && E.editing !== S.id
            ? quadOf(S, E.textH(S)).map((p, i) => `<button type="button" class="cv-h cv-h-quad" data-handle="quad" data-c="${i}" style="left:${p[0]}px;top:${p[1]}px"
                aria-label="Drag this corner to distort the text, ${QUAD[i]}. Arrow keys work too."></button>`).join('') : ''}
        </div>`;
      }
      // While typing in place, the text box itself is kept: drawing the overlay again (a pan, a zoom, a window
      // resize) must not replace it, or its blur would end the typing and drop the next letters.
      const el = E.editing != null ? L.find((x) => x.id === E.editing) : null;
      const old = front.querySelector('[data-edit]');
      const kept = el && old && old.dataset.edit === String(el.id) ? old : null;
      if (el && !kept) out += `<textarea class="cv-edit" data-edit="${esc(el.id)}" aria-label="Edit text" spellcheck="true" style="${editStyle(el)};z-index:${n + 6}">${esc(el.text)}</textarea>`;
      // Drawing again must not drop the keyboard: the focused layer box or handle is focused again.
      const a = document.activeElement;
      const keep = a && front.contains(a) ? (a.dataset.hit != null ? `[data-hit="${CSS.escape(a.dataset.hit)}"]` : a.dataset.handle ? `[data-handle="${a.dataset.handle}"][data-c="${a.dataset.c}"]` : null) : null;
      if (kept) {
        for (const ch of [...front.children]) if (ch !== kept) ch.remove();
        kept.insertAdjacentHTML('beforebegin', out);
        const h = kept.style.height;
        kept.style.cssText = `${editStyle(el)};z-index:${n + 6}`;
        kept.style.height = h;
      } else front.innerHTML = out;
      if (keep) { const k = front.querySelector(keep); if (k) k.focus({ preventScroll: true }); }
      const ta = front.querySelector('[data-edit]');
      if (ta && !kept) bindEdit(ta);
    }

    function editStyle(l) {
      const f = C.fonts.face(l.font, l.weight);
      const fam = f && C.fonts.loaded(f) ? `'${C.fonts.canvasName(f)}'` : 'serif';   // single quotes: inside style="…"
      return `left:${l.x}px;top:${l.y}px;width:${l.w}px;transform:${l.rot ? `rotate(${l.rot}deg)` : 'none'};font-family:${fam};font-size:${l.size * PT}px;color:${l.color};text-align:${l.align};letter-spacing:${l.ls}em;text-transform:${l.caps ? 'uppercase' : 'none'};opacity:${l.op / 100}`;
    }

    function bindEdit(ta) {
      const fitH = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      fitH();
      ta.addEventListener('input', () => { E.setText(E.editing, ta.value); fitH(); syncSelBox(); });
      ta.addEventListener('blur', () => { if (E.editing != null) E.stopEdit(false); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); E.stopEdit(true); } });
      ta.addEventListener('pointerdown', (e) => e.stopPropagation());
      if (document.activeElement !== ta) {
        ta.focus();
        const end = () => ta.setSelectionRange(ta.value.length, ta.value.length);
        end();
      }
    }

    /** During a drag or typing: move the hit box and the frame without building them again. */
    function syncSelBox() {
      const S = sel(); if (!S) return;
      const st = layerBox(S);
      const box = front.querySelector('[data-selbox]'); if (box) box.style.cssText = `${st};z-index:${E.cover.layers.length + 5}`;
      const hit = front.querySelector(`[data-hit="${CSS.escape(String(S.id))}"]`); if (hit) { const z = hit.style.zIndex; hit.style.cssText = `${st};z-index:${z}`; }
    }

    function tplPopHtml() {
      return `
        <div class="cv-pop-head"><h2 class="cv-h2-lg">KDP template layer</h2><button type="button" class="cv-x cv-x-lg" data-tpl-close aria-label="Close">${X}</button></div>
        <label class="cv-range"><span class="cv-range-row"><span>Transparency</span><span class="cv-mono">${E.tpl.hide ? 'hidden' : E.tpl.op + '%'}</span></span>
          <input type="range" min="0" max="100" step="1" value="${E.tpl.op}" data-tpl-op></label>
        <label class="cv-check"><input type="checkbox" data-tpl-hide${E.tpl.hide ? ' checked' : ''}>Hide template layer</label>
        <p class="cv-pop-p">The template is never in your exported files. It is drawn from your trim, page count and paper, so it changes when they change.</p>`;
    }
    function syncTplPop() {
      tplPop.hidden = !E.tpl.pop;
      if (!E.tpl.pop) return;
      const focusK = document.activeElement && tplPop.contains(document.activeElement) ? [...document.activeElement.attributes].map((a) => a.name).find((n) => n.startsWith('data-tpl')) : null;
      tplPop.innerHTML = tplPopHtml();
      if (focusK) { const el = tplPop.querySelector(`[${focusK}]`); if (el) el.focus(); }
    }
    tplPop.addEventListener('pointerdown', (e) => e.stopPropagation());
    tplPop.addEventListener('input', (e) => { if (e.target.matches('[data-tpl-op]')) { E.tpl.op = Number(e.target.value); boardStyle(); const lab = tplPop.querySelector('.cv-mono'); if (lab) lab.textContent = E.tpl.hide ? 'hidden' : E.tpl.op + '%'; E.refreshBars(); } });
    tplPop.addEventListener('change', (e) => { if (e.target.matches('[data-tpl-hide]')) { E.tpl.hide = e.target.checked; boardStyle(); syncTplPop(); E.refreshBars(); } });
    tplPop.addEventListener('click', (e) => { if (e.target.closest('[data-tpl-close]')) E.toggleTpl(false); });

    function sync() {
      boardStyle();
      guides.hidden = !E.guides;
      guides.innerHTML = E.guides ? guidesHtml() : '';
      overlay();
      syncTplPop();
      const S = sel(), G = g();
      const what = E.multi.length > 1 ? `Selected: ${E.multi.length} layers.` : S ? `Selected: ${E.layerName(S)}.` : 'Nothing selected.';
      canvas.setAttribute('aria-label', `Cover, full wrap ${(G.W / 70).toFixed(3)} × ${(G.H / 70).toFixed(2)} in. ${what} Tab moves through the layers, front first.`);
      paint();
    }

    function snapLine(on) {
      snapEl.hidden = !on;
      if (on) snapEl.style.left = (E.view.px + g().frontCX * E.view.z) + 'px';
    }

    /* ── View ── */
    function fit() {
      const G = g(), ww = ws.clientWidth || 1048, wh = ws.clientHeight || 600;
      const z = Math.min(1.25, (ww - 80) / G.W, (wh - 60) / G.H);
      Object.assign(E.view, { z, px: (ww - G.W * z) / 2, py: (wh - G.H * z) / 2 });
      E.viewChanged();
    }
    /** On open: 100 % centered when it fits, else Fit (design 58 opens at 100 %, centered). */
    function center() {
      const G = g(), ww = ws.clientWidth || 1048, wh = ws.clientHeight || 600;
      const z = Math.min(1, (ww - 80) / G.W, (wh - 60) / G.H);
      Object.assign(E.view, { z, px: (ww - G.W * z) / 2, py: (wh - G.H * z) / 2 });
      E.viewChanged();
    }
    function zoomAt(f, cx, cy) {
      const v = E.view;
      if (cx == null) { cx = ws.clientWidth / 2; cy = ws.clientHeight / 2; }
      const z = Math.min(4, Math.max(0.25, v.z * f));
      Object.assign(v, { px: cx - (cx - v.px) * z / v.z, py: cy - (cy - v.py) * z / v.z, z });
      E.viewChanged();
    }

    /* ── Pointer ── */
    const local = (e) => { const r = ws.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    ws.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [mx, my] = local(e);
      if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY * 0.01), mx, my);
      else { E.view.px -= e.deltaX; E.view.py -= e.deltaY; E.viewChanged(); }
    }, { passive: false });
    // Safari pinch (trackpad): gesture events instead of ctrl + wheel.
    let gz = null;
    ws.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = E.view.z; });
    ws.addEventListener('gesturechange', (e) => {
      if (gz == null) return; e.preventDefault();
      const [mx, my] = local(e);
      zoomAt(Math.min(4, Math.max(0.25, gz * e.scale)) / E.view.z, mx, my);
    });
    ws.addEventListener('gestureend', () => { gz = null; });

    ws.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-tplpop]')) return;
      const hd = e.target.closest('[data-handle]');
      const hit = e.target.closest('[data-hit]');
      // Capture first: selecting draws the overlay again, and a pressed element that leaves the page ends the pointer.
      if (hd || hit) { try { ws.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is gone */ } }
      // A free-distortion corner belongs to the open Text effects popover: pressing it keeps the popover open.
      if (!(hd && hd.dataset.handle === 'quad')) E.closeMenus();
      if (hd) { pressed = null; startAct(e, hd.dataset.handle, sel(), hd.dataset.c, hd); return; }
      if (hit) {
        const l = E.cover.layers.find((x) => String(x.id) === hit.dataset.hit);
        if (!l) return;
        pressed = l.id;
        if (E.editing != null && E.editing !== l.id) E.stopEdit(false);
        // Shift- or Cmd-click: add or take away (the design's down with shiftKey or metaKey).
        if (e.shiftKey || e.metaKey || e.ctrlKey) { pressed = null; E.toggleSel(l.id); return; }
        if (E.multi.includes(l.id)) {
          const start = {};
          E.cover.layers.forEach((q) => { if (E.multi.includes(q.id)) start[q.id] = { x: q.x, y: q.y }; });
          startAct(e, 'gmove', l, null, null, start);
          return;
        }
        if (E.sel !== l.id || E.multi.length) E.select(l.id);
        if (l.lock) return;
        startAct(e, 'move', l);
        return;
      }
      pressed = null;
      // The gray area or the bare cover: deselect; on the cover, drag a box to select; on the gray, drag to pan.
      if (E.editing != null) E.stopEdit(false);
      if (E.sel != null || E.multi.length) E.selectIds([]);
      const [mx, my] = local(e), { z, px, py } = E.view, G = g();
      const bx = (mx - px) / z, by = (my - py) / z;
      if (bx >= 0 && by >= 0 && bx <= G.W && by <= G.H) drag = { mq: true, x0: bx, y0: by, x1: bx, y1: by };
      else { drag = { x: e.clientX, y: e.clientY, px, py }; ws.classList.add('is-panning'); }
      ws.setPointerCapture(e.pointerId);
    });

    function startAct(e, kind, l, corner, hd, start) {
      if (!l) return;
      // No preventDefault: it would stop the dblclick that starts typing (the boxes are buttons: nothing to select).
      const a = { kind, id: l.id, x: e.clientX, y: e.clientY, L0: Object.assign({}, l, { h: l.type === 'text' ? E.textH(l) : l.h }), corner, pushed: false, moved: false, start };
      if (kind === 'rot') {
        const r = (hd.closest('[data-selbox]') || hd).getBoundingClientRect();
        a.cx = r.left + r.width / 2; a.cy = r.top + r.height / 2;
      }
      E.act = a;
      try { ws.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is gone */ }
    }

    ws.addEventListener('pointermove', (e) => {
      if (drag && drag.mq) {
        const [mx, my] = local(e), { z, px, py } = E.view;
        drag.x1 = (mx - px) / z; drag.y1 = (my - py) / z;
        const x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1);
        mqEl.hidden = false;
        Object.assign(mqEl.style, { left: (px + x0 * z) + 'px', top: (py + y0 * z) + 'px', width: Math.abs(drag.x1 - drag.x0) * z + 'px', height: Math.abs(drag.y1 - drag.y0) * z + 'px' });
        return;
      }
      if (drag) { E.view.px = drag.px + e.clientX - drag.x; E.view.py = drag.py + e.clientY - drag.y; E.viewChanged(); return; }
      const a = E.act; if (!a) return;
      if (!a.moved && Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) < 2) return;
      a.moved = true;
      if (a.kind === 'gmove') {
        const z = E.view.z, dx = (e.clientX - a.x) / z, dy = (e.clientY - a.y) / z;
        E.commitLayers(E.cover.layers.map((q) => (a.start[q.id] && !q.lock ? Object.assign({}, q, { x: a.start[q.id].x + dx, y: a.start[q.id].y + dy }) : q)), a);
        overlay();
        return;
      }
      const p = actPatch(a, e.clientX, e.clientY, e);
      if (p) { E.patchLayer(a.id, p.patch, a); snapLine(p.snap); if (a.kind === 'quad') overlay(); else syncSelBox(); }
    });
    const end = () => {
      if (drag && drag.mq) {
        const d = drag; drag = null; mqEl.hidden = true;
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
        if (x1 - x0 < 2 && y1 - y0 < 2) return;   // a click on the bare cover: nothing selected
        const ids = E.cover.layers.filter((l) => { if (l.hidden) return false; const b = C.model.bbox(l, E.textH); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map((l) => l.id);
        if (ids.length) E.selectIds(ids);
        return;
      }
      if (drag) { drag = null; ws.classList.remove('is-panning'); }
      if (E.act) {
        const a = E.act; E.act = null; snapLine(false);
        if (a.moved) E.dragEnded();
      }
    };
    ws.addEventListener('pointerup', end);
    ws.addEventListener('pointercancel', end);
    ws.addEventListener('lostpointercapture', end);

    /** The design's onAct for one layer: move (front-center snap), width, box, scale, rot. */
    function actPatch(a, cx, cy) {
      const z = E.view.z, L0 = a.L0;
      const dx = (cx - a.x) / z, dy = (cy - a.y) / z;
      const r = (L0.rot || 0) * Math.PI / 180;
      const lx = dx * Math.cos(r) + dy * Math.sin(r), ly = -dx * Math.sin(r) + dy * Math.cos(r);
      const G = g();
      if (a.kind === 'move') {
        let x = L0.x + dx, snap = false;
        if (E.snap && Math.abs(x + L0.w / 2 - G.frontCX) < 6 / z) { x = G.frontCX - L0.w / 2; snap = true; }
        return { patch: { x, y: L0.y + dy }, snap };
      }
      if (a.kind === 'width') return { patch: { w: Math.max(60, L0.w + lx) } };
      if (a.kind === 'scale') {
        const c = a.corner, left = c.indexOf('w') >= 0, top = c.indexOf('n') >= 0;
        const w = Math.max(30, L0.w + (left ? -lx : lx)), f = w / L0.w, h = L0.h * f;
        return { patch: { w, h, x: left ? L0.x + L0.w - w : L0.x, y: top ? L0.y + L0.h - h : L0.y, px: L0.px * f, py: L0.py * f, pw: L0.pw * f, ph: L0.ph * f } };
      }
      if (a.kind === 'box') {
        const c = a.corner;
        let { x, y, w, h } = L0;
        if (c.length === 2) {
          const left = c.indexOf('w') >= 0, top = c.indexOf('n') >= 0;
          w = Math.max(10, L0.w + (left ? -lx : lx)); h = L0.h * w / L0.w;
          x = left ? L0.x + L0.w - w : L0.x; y = top ? L0.y + L0.h - h : L0.y;
        } else {
          if (c === 'e') w = Math.max(10, L0.w + lx);
          if (c === 'w') { w = Math.max(10, L0.w - lx); x = L0.x + L0.w - w; }
          if (c === 's') h = Math.max(10, L0.h + ly);
          if (c === 'n') { h = Math.max(10, L0.h - ly); y = L0.y + L0.h - h; }
        }
        return { patch: { x, y, w, h } };
      }
      if (a.kind === 'quad') {
        const i = Number(a.corner), q = L0.dist.q.map((p) => p.slice());
        q[i] = [L0.dist.q[i][0] + lx, L0.dist.q[i][1] + ly];
        return { patch: { dist: Object.assign({}, L0.dist, { q }) } };
      }
      if (a.kind === 'rot') {
        let deg = Math.atan2(cy - a.cy, cx - a.cx) * 180 / Math.PI + 90;
        deg = ((deg + 540) % 360) - 180;
        const near = Math.round(deg / 45) * 45;
        if (Math.abs(deg - near) < 4) deg = near;
        return { patch: { rot: Math.round(deg) } };
      }
      return null;
    }

    /* ── Keyboard on the overlay ── */
    front.addEventListener('click', (e) => {
      const hit = e.target.closest('[data-hit]');
      if (!hit || e.detail !== 0) return;   // Enter or Space on a layer box (a mouse click selected it on pointerdown)
      const l = E.cover.layers.find((x) => String(x.id) === hit.dataset.hit);
      if (!l) return;
      if (e.shiftKey) { E.toggleSel(l.id); const n = front.querySelector(`[data-hit="${CSS.escape(String(l.id))}"]`); if (n) n.focus({ preventScroll: true }); return; }
      if (E.sel === l.id && l.type === 'text' && !l.lock) E.startEdit(l.id);
      else E.select(l.id, { keepFocus: true });
    });
    // Double-click on a text types in place (the design's onDoubleClick). The pointer is captured by the workspace,
    // so the browser sends dblclick to it: the layer is the one the last press landed on.
    ws.addEventListener('dblclick', (e) => {
      const l = pressed != null && E.cover.layers.find((x) => x.id === pressed);
      if (l && l.type === 'text' && !l.lock) { e.preventDefault(); E.startEdit(l.id); }
    });
    // A handle with the keyboard: arrows resize or rotate (1 px or 1°; Shift: 10 px or 15°).
    front.addEventListener('keydown', (e) => {
      const hd = e.target.closest('[data-handle]');
      if (!hd) return;
      const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      const S = sel(); if (!S || S.lock) return;
      const kind = hd.dataset.handle, c = hd.dataset.c, n = d * (e.shiftKey ? 10 : 1);
      let patch = null;
      if (kind === 'quad') {
        const i = Number(c), q = S.dist.q.map((p) => p.slice()), k = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') q[i][0] -= k; if (e.key === 'ArrowRight') q[i][0] += k;
        if (e.key === 'ArrowUp') q[i][1] -= k; if (e.key === 'ArrowDown') q[i][1] += k;
        E.patchLayer(S.id, { dist: Object.assign({}, S.dist, { q }) }, null, { bars: false }); E.keyEdited(hd);
        return;
      }
      if (kind === 'rot') { let deg = (S.rot || 0) + d * (e.shiftKey ? 15 : 1); deg = ((deg + 540) % 360) - 180; patch = { rot: deg }; }
      else if (kind === 'width') patch = { w: Math.max(60, S.w + n) };
      else if (kind === 'scale' || (kind === 'box' && c.length === 2)) { const w = Math.max(kind === 'box' ? 10 : 30, S.w + n), f = w / S.w; patch = { w, h: S.h * f }; if (kind === 'scale') Object.assign(patch, { px: S.px * f, py: S.py * f, pw: S.pw * f, ph: S.ph * f }); }
      else if (kind === 'box') patch = c === 'n' || c === 's' ? { h: Math.max(10, S.h + n) } : { w: Math.max(10, S.w + n) };
      if (patch) { E.patchLayer(S.id, patch, null); E.keyEdited(hd); }
    });

    if (root.ResizeObserver) new root.ResizeObserver(() => { snapLine(false); E.wsResized(); }).observe(ws);

    return { el: ws, paint, sync, syncSelBox, fit, center, zoomAt, canvas, tplPop, templateHtml };
  }

  C.view = { create, templateHtml, quadOf };
})(globalThis);
