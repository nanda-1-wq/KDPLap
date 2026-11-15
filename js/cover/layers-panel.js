/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Layers panel (E16 Part 5, plan §3 "Layers
   panel", design 66)
   /js/cover/layers-panel.js   (browser; needs names, shapes-ui)

   Rows front-most first (the design's layerRows): a grip (drag to reorder;
   with the keyboard, Arrow up and down on the grip), a type mark (T, a
   picture, the shape's own drawing), the name (the label, else the first
   words, the file name or the kind), an eye (hide: left out of the files),
   a lock and a ⋮ menu that opens to the right of the panel, above
   everything: Rename, Lock or Unlock, Hide or Show, Duplicate, Bring to
   front, Bring forward, Send backward, Send to back, Delete (red text).
   Click a row to select it; Shift- or Cmd-click for several; double-click
   the name to rename. The Background row is fixed at the bottom. No groups
   (owner: later).
   Keyboard: the name is a button (Tab reaches every row; Enter selects,
   Shift+Enter adds to the selection; arrows nudge; Delete deletes; F2 renames).

   kdpCover.layersPanel.html(E) / bind(el, E) / menuHtml(E) / bindMenu(el, E)
   kdpCover.layersPanel.reorder(layers, id, to) → the list with the layer at
   front-first row `to` (pure; the design's gUp)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    grip: '<svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.5 6.6C3.8 8.3 2 12 2 12s4 7 10 7c1.8 0 3.4-.6 4.7-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.2"/></svg>'
  };

  /** Move layer `id` so it sits at front-first row `to` (0 = front). */
  function reorder(layers, id, to) {
    const n = layers.length, from = layers.findIndex((l) => l.id === id);
    if (from < 0) return layers.slice();
    const dest = n - 1 - Math.max(0, Math.min(n - 1, to));
    if (dest === from) return layers.slice();
    const a = layers.slice(); const [it] = a.splice(from, 1); a.splice(dest, 0, it);
    return a;
  }

  function mark(l) {
    if (l.type === 'text') return '<span class="cv-lr-t" aria-hidden="true">T</span>';
    if (l.type === 'image') return '<span class="cv-lr-img" aria-hidden="true"></span>';
    return `<span class="cv-lr-sh" aria-hidden="true">${C.shapesUi.layerSvg(l)}</span>`;
  }

  function html(E) {
    const L = E.cover.layers, n = L.length;
    const rows = L.slice().reverse().map((l, di) => {
      const name = C.names.layerName(l), on = E.sel === l.id || E.multi.includes(l.id);
      const drag = E.rowDrag && E.rowDrag.id === l.id ? E.rowDrag.dy : 0;
      const kind = l.type === 'text' ? 'Text' : l.type === 'image' ? 'Picture' : 'Shape';
      return `<div role="listitem" class="cv-lrow${on ? ' is-sel' : ''}${l.hidden ? ' is-hidden' : ''}${drag ? ' is-drag' : ''}" data-row="${esc(l.id)}" data-di="${di}"${drag ? ` style="transform:translateY(${drag}px)"` : ''}>
        <button type="button" class="cv-lr-grip" data-k="grip-${esc(l.id)}" data-grip="${esc(l.id)}" aria-label="Move ${esc(name)} up or down: drag, or press the arrow keys" title="Drag to reorder">${I.grip}</button>
        ${mark(l)}
        ${E.renaming === l.id
          ? `<input type="text" class="cv-lr-in" data-k="rename-${esc(l.id)}" data-rename="${esc(l.id)}" aria-label="Layer name" value="${esc(l.label || name)}" maxlength="${C.model.CAPS.label}">`
          : `<button type="button" class="cv-lr-name" data-k="row-${esc(l.id)}" data-pick="${esc(l.id)}" aria-pressed="${on}" aria-label="${esc(`${kind}: ${name}${l.hidden ? ', hidden' : ''}${l.lock ? ', locked' : ''}`)}">${esc(name)}</button>`}
        <button type="button" class="cv-lr-b" data-k="eye-${esc(l.id)}" data-eye="${esc(l.id)}" aria-label="${l.hidden ? 'Show' : 'Hide'} ${esc(name)}" title="${l.hidden ? 'Show' : 'Hide'} ${esc(name)}">${l.hidden ? I.eyeOff : I.eye}</button>
        <button type="button" class="cv-lr-b" data-k="lk-${esc(l.id)}" data-lk="${esc(l.id)}" aria-label="${l.lock ? 'Unlock' : 'Lock'} ${esc(name)}" title="${l.lock ? 'Unlock' : 'Lock'} ${esc(name)}">${l.lock ? I.lock : I.unlock}</button>
        <button type="button" class="cv-lr-b cv-lr-more" data-k="mn-${esc(l.id)}" data-lmenu="${esc(l.id)}" aria-label="More for this layer" aria-haspopup="menu" aria-expanded="${!!E.layerMenu && E.layerMenu.id === l.id}">⋮</button>
      </div>`;
    }).join('');
    return `
      <div class="cv-lhead"><span class="cv-cap">LAYERS</span><span class="cv-mono cv-lcount">${n} layer${n === 1 ? '' : 's'}</span></div>
      ${n ? '<div class="cv-lnote">Top of the list = in front</div>' : '<p class="cv-help">Nothing on the cover yet. Add text, images or shapes, and they show here.</p>'}
      <div role="list" class="cv-lrows" aria-label="Layers, front first">${rows}
        <div class="cv-lrow cv-lrow-bg"><span class="cv-swatch" style="--sw:${E.cover.bg}" aria-hidden="true"></span><span class="cv-lr-bgname">Background</span>
          <button type="button" class="cv-sbtn" data-k="bg-color" data-bgcolor>Color</button></div>
      </div>
      <p class="cv-help cv-help-sm">Click a row to select. Shift-click for several. Double-click a name to rename. Hidden layers are left out of your files.</p>`;
  }

  /** Selection changed, the list did not: mark the rows in place (a redraw under the pointer would lose a double-click). */
  function syncSel(el, E) {
    for (const r of el.querySelectorAll('[data-row]')) {
      const on = String(E.sel) === r.dataset.row || E.multi.some((id) => String(id) === r.dataset.row);
      r.classList.toggle('is-sel', on);
      const b = r.querySelector('[data-pick]'); if (b) b.setAttribute('aria-pressed', String(on));
    }
  }

  /** The ⋮ menu: absolute in the editor root, to the right of the panel (design 66). */
  function menuHtml(E) {
    const m = E.layerMenu; if (!m) return '';
    const l = E.cover.layers.find((x) => x.id === m.id); if (!l) return '';
    return `<div class="cv-lmenu" role="menu" aria-label="${esc(C.names.layerName(l))}" data-lmenu-pop style="left:${m.x}px;top:${m.y}px">
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-rename" data-lm="rename">Rename</button>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-lock" data-lm="lock">${l.lock ? 'Unlock (now locked)' : 'Lock (now unlocked)'}</button>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-hide" data-lm="hide">${l.hidden ? 'Show' : 'Hide'}</button>
      <div class="cv-mrule" role="separator"></div>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-dup" data-lm="dup">Duplicate</button>
      <div class="cv-mrule" role="separator"></div>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-front" data-lm="front">Bring to front</button>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-fwd" data-lm="forward">Bring forward</button>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-bwd" data-lm="backward">Send backward</button>
      <button type="button" role="menuitem" class="cv-mi" data-k="lm-back" data-lm="back">Send to back</button>
      <div class="cv-mrule" role="separator"></div>
      <button type="button" role="menuitem" class="cv-mi cv-mi-del" data-k="lm-del" data-lm="del">Delete</button>
    </div>`;
  }

  function bind(el, E) {
    const id = (v) => { const l = E.cover.layers.find((x) => String(x.id) === String(v)); return l ? l.id : null; };
    el.addEventListener('click', (e) => {
      if (E.panel !== 'layers') return;
      const t = e.target;
      if (t.closest('[data-rename]')) return;
      if (t.closest('[data-bgcolor]')) { E.toggleMenu('bg'); return; }
      const eye = t.closest('[data-eye]'); if (eye) { const i = id(eye.dataset.eye); const l = E.cover.layers.find((x) => x.id === i); E.setLayer(i, { hidden: !l.hidden }); return; }
      const lk = t.closest('[data-lk]'); if (lk) { const i = id(lk.dataset.lk); const l = E.cover.layers.find((x) => x.id === i); E.setLayer(i, { lock: !l.lock }); return; }
      const mn = t.closest('[data-lmenu]'); if (mn) { E.openLayerMenu(id(mn.dataset.lmenu), mn); return; }
      if (t.closest('[data-grip]')) return;
      const row = t.closest('[data-row]'); if (!row) return;
      const i = id(row.dataset.row);
      if (e.shiftKey || e.metaKey || e.ctrlKey) E.toggleSel(i);
      else E.selectIds([i], { keepPanelFocus: t.closest('[data-pick]') ? `[data-pick="${CSS.escape(String(i))}"]` : null });
    });
    el.addEventListener('dblclick', (e) => {
      if (E.panel !== 'layers') return;
      const row = e.target.closest('[data-row]');
      if (!row || e.target.closest('[data-eye], [data-lk], [data-lmenu], [data-grip]')) return;
      E.startRename(id(row.dataset.row));
    });
    el.addEventListener('keydown', (e) => {
      if (E.panel !== 'layers') return;
      const t = e.target;
      const rn = t.closest('[data-rename]');
      if (rn) {
        if (e.key === 'Enter') { e.preventDefault(); E.endRename(rn.value, true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); E.endRename(null, true); }
        return;
      }
      const g = t.closest('[data-grip]');
      if (g && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault(); e.stopPropagation();
        const i = id(g.dataset.grip), n = E.cover.layers.length, di = n - 1 - E.cover.layers.findIndex((l) => l.id === i);
        E.commitLayers(reorder(E.cover.layers, i, di + (e.key === 'ArrowUp' ? -1 : 1)));
        const again = el.querySelector(`[data-grip="${CSS.escape(String(i))}"]`); if (again) again.focus({ preventScroll: true });
        return;
      }
      const pk = t.closest('[data-pick]');
      if (!pk) return;
      const i = id(pk.dataset.pick);
      if (e.key === 'F2') { e.preventDefault(); E.startRename(i); return; }
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); E.toggleSel(i); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d && (E.sel === i || E.multi.includes(i))) { e.preventDefault(); e.stopPropagation(); E.nudgeSel(d[0], d[1], e.shiftKey); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (E.sel === i || E.multi.includes(i))) { e.preventDefault(); e.stopPropagation(); E.removeSel(); }
    });
    el.addEventListener('focusout', (e) => {
      const rn = e.target.closest && e.target.closest('[data-rename]');
      if (rn && E.renaming != null) E.endRename(rn.value, false);
    });
    // Drag the grip to reorder (the design's gDown / gMove / gUp: one row = 50 px).
    el.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-grip]');
      if (!g || e.button !== 0 || E.panel !== 'layers') return;
      e.preventDefault();
      const i = id(g.dataset.grip), row = g.closest('[data-row]');
      E.rowDrag = { id: i, y: e.clientY, from: Number(row.dataset.di), dy: 0 };
      E.layerMenu = null;
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    });
    el.addEventListener('pointermove', (e) => {
      const r = E.rowDrag; if (!r) return;
      r.dy = e.clientY - r.y;
      const row = el.querySelector(`[data-row="${CSS.escape(String(r.id))}"]`);
      if (row) { row.style.transform = `translateY(${r.dy}px)`; row.classList.add('is-drag'); }
    });
    const up = (e) => {
      const r = E.rowDrag; if (!r) return;
      E.rowDrag = null;
      const steps = Math.round((e.clientY - r.y) / 50);
      if (steps) E.commitLayers(reorder(E.cover.layers, r.id, r.from + steps));
      else E.refreshPanel();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function bindMenu(el, E) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lm]');
      if (!b || !E.layerMenu) return;
      const i = E.layerMenu.id, a = b.dataset.lm, l = E.cover.layers.find((x) => x.id === i);
      E.closeLayerMenu(false);
      if (!l) return;
      if (a === 'rename') E.startRename(i);
      else if (a === 'lock') E.setLayer(i, { lock: !l.lock });
      else if (a === 'hide') E.setLayer(i, { hidden: !l.hidden });
      else if (a === 'dup') E.dupId(i);
      else if (a === 'del') E.removeIds([i]);
      else E.arrangeId(i, a);
    });
    el.addEventListener('keydown', (e) => {
      if (!e.target.closest('[data-lmenu-pop]')) return;
      const items = [...el.querySelectorAll('[data-lmenu-pop] [role="menuitem"]')], at = items.indexOf(document.activeElement);
      // The menu keeps its keys: an arrow here must not also nudge the selected layer.
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'].includes(e.key)) e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]; if (n) n.focus(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); E.closeLayerMenu(true); }
      if (e.key === 'Tab') E.closeLayerMenu(false);
    });
  }

  C.layersPanel = { html, bind, menuHtml, bindMenu, reorder, syncSel };
})(globalThis);
