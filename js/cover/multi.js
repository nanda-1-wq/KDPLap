/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: several layers selected (E16 Part 5, plan §3
   "Several selected", design 65)
   /js/cover/multi.js   (browser for the bar; dupMany is pure)

   The bar of design 65: "N layers selected", Align (left, centers left to
   right, right, top, middles top to bottom, bottom) "to" each other, the
   front cover, the back cover, the spine or the whole cover (the design's
   regionBox, kdpCover.geo.region), Space across and Space down (3 or more
   layers), Duplicate, Lock all or Unlock all, Delete and Done.
   Select several: Shift- or Cmd-click on the cover or in the Layers panel,
   a box dragged on the cover, Cmd+A (view.js, editor.js).

   kdpCover.multi.barHtml(E) / bind(el, E)
   kdpCover.multi.dupMany(layers, ids, nextId) → { layers, ids } (the design's multiDup:
       the copies go on top, 14 px down and right, unlocked, not tied to the book)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const ALIGN = [['left', 'Align left', 'M4 3v18M8 7h12v4H8zM8 13h7v4H8z'], ['hcenter', 'Align centers left to right', 'M12 3v18M6 7h12v4H6zM8 13h8v4H8z'], ['right', 'Align right', 'M20 3v18M4 7h12v4H4zM9 13h7v4H9z'],
    ['top', 'Align top', 'M3 4h18M7 8v12h4V8zM13 8v7h4V8z'], ['vcenter', 'Align middles top to bottom', 'M3 12h18M7 6v12h4V6zM13 8v8h4V8z'], ['bottom', 'Align bottom', 'M3 20h18M7 4v12h4V4zM13 9v7h4V9z']];
  const TO = [['sel', 'each other'], ['front', 'front cover'], ['back', 'back cover'], ['spine', 'spine'], ['cover', 'whole cover']];
  const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const DIST_H = svg('M4 4v16M20 4v16M9 8h6v8H9z'), DIST_V = svg('M4 4h16M4 20h16M8 9h8v6H8z');

  function dupMany(layers, ids, nextId) {
    let id = nextId; const copies = [];
    layers.forEach((l) => { if (ids.includes(l.id)) copies.push(Object.assign({}, l, { id: id++, src: null, lock: false, x: l.x + 14, y: l.y + 14 })); });
    return { layers: layers.concat(copies), ids: copies.map((c) => c.id) };
  }

  function barHtml(E) {
    const ids = E.multi;
    if (ids.length < 2) return '';
    const sel = E.cover.layers.filter((l) => ids.includes(l.id));
    const allLocked = sel.length > 0 && sel.every((l) => l.lock);
    const few = ids.length < 3;
    const off = few ? ' aria-disabled="true" title="Needs 3 or more layers"' : '';
    return `
      <span class="cv-multi-n" role="status">${ids.length} layers selected</span>
      <span class="cv-multi-al">Align</span>
      ${ALIGN.map(([k, label, d]) => `<button type="button" class="cv-ib" data-k="al-${k}" data-mact="align" data-v="${k}" aria-label="${label}" title="${label}">${svg(d)}</button>`).join('')}
      <label class="cv-multi-to">to<span class="cv-selwrap"><select class="cv-select" data-k="align-to" data-malign-to aria-label="Align to">
        ${TO.map(([v, label]) => `<option value="${v}"${E.alignTo === v ? ' selected' : ''}>${label}</option>`).join('')}</select></span></label>
      <span class="cv-sep" aria-hidden="true"></span>
      <button type="button" class="cv-tb" data-k="dist-h" data-mact="dist" data-v="h"${off}>${DIST_H}Space across</button>
      <button type="button" class="cv-tb" data-k="dist-v" data-mact="dist" data-v="v"${off}>${DIST_V}Space down</button>
      <span class="cv-grow"></span>
      <button type="button" class="cv-tb" data-k="m-dup" data-mact="dup">Duplicate</button>
      <button type="button" class="cv-tb" data-k="m-lock" data-mact="lock">${allLocked ? 'Unlock all' : 'Lock all'}</button>
      <button type="button" class="cv-tb cv-tb-del" data-k="m-del" data-mact="del">Delete</button>
      <button type="button" class="cv-tb is-ink" data-k="m-done" data-mact="done">Done</button>`;
  }

  function bind(el, E) {
    el.addEventListener('click', (e) => {
      if (E.multi.length < 2) return;
      const b = e.target.closest('[data-mact]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const a = b.dataset.mact, ids = E.multi.slice();
      const g = C.geo.geo(E.cover.fmt);
      if (a === 'align') E.commitLayers(C.model.align(E.cover.layers, ids, b.dataset.v, E.alignTo, g, E.textH));
      else if (a === 'dist') E.commitLayers(C.model.distribute(E.cover.layers, ids, b.dataset.v, E.textH));
      else if (a === 'dup') { const r = dupMany(E.cover.layers, ids, C.model.nextId(E.cover.layers)); if (E.commitLayers(r.layers)) E.selectIds(r.ids); }
      else if (a === 'lock') {
        const all = E.cover.layers.filter((l) => ids.includes(l.id)).every((l) => l.lock);
        E.commitLayers(E.cover.layers.map((l) => (ids.includes(l.id) ? Object.assign({}, l, { lock: !all }) : l)));
      } else if (a === 'del') E.removeIds(ids);
      else if (a === 'done') E.selectIds([]);
    });
    el.addEventListener('change', (e) => {
      if (E.multi.length < 2 || !e.target.matches('[data-malign-to]')) return;
      E.alignTo = e.target.value;
    });
  }

  C.multi = { ALIGN, TO, barHtml, bind, dupMany };
})(globalThis);
