/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Book data panel (E16 Part 8, design 68 left, plan §3)
   /js/cover/bookdata.js   (browser; needs geo, names, layouts; driven by
                            js/cover/editor.js)

   The words KDP checks come from the book (04 Title and Pen Names), not free
   typing: Add all to the cover; per row Add, or "✓ On the cover" (selects the
   layer); the Back blurb card (Write blurb / Edit blurb opens the blurb
   dialog, js/cover/blurb.js); the spine text box (Add spine text when the
   book is thick enough: 80 pages on cream, 86 on white, plan D14); trim,
   pages and paper, spine.

   kdpCover.bookData.html(E) / bind(panel, E)
   kdpCover.bookData.realBlurb(layers) → the blurb layer with real words (not the placeholder), or null
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The words when the book has none (the Text panel's words, text.js).
  const ROWS = [['title', 'Title', 'This book has no title in 04 Title.'], ['subtitle', 'Subtitle', 'This book has no subtitle in 04 Title.'], ['pen', 'Pen name', 'This book has no pen name yet.']];
  const OK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const realBlurb = (layers) => layers.find((l) => l.src === 'blurb' && l.text && l.text.indexOf('Your back blurb goes here') < 0) || null;
  const has = (E, k) => E.cover.layers.some((l) => l.src === k);

  function html(E) {
    const g = C.geo.geo(E.cover.fmt), L = C.names.labels(g);
    const missing = ROWS.filter(([k]) => !has(E, k) && E.bookWords(k));
    const rows = ROWS.map(([k, label, none]) => {
      const words = E.bookWords(k), on = has(E, k);
      const act = on ? `<button type="button" class="cv-bd-on" data-k="bd-find-${k}" data-bd-find="${k}" title="Select it on the cover">${OK}On the cover</button>`
        : `<button type="button" class="cv-sbtn cv-bd-add" data-k="bd-add-${k}" data-add-book="${k}"${words ? '' : ` aria-disabled="true" title="${esc(none)}"`}>Add</button>`;
      return `<div class="cv-bd-card"><div class="cv-bd-head"><span class="cv-bd-label">${label}</span>${act}</div>
        <div class="cv-bd-val${words ? '' : ' is-none'}">${esc(words || none)}</div></div>`;
    }).join('');
    const bl = realBlurb(E.cover.layers);
    const blurbText = bl ? bl.text.slice(0, 140) + (bl.text.length > 140 ? '…' : '') : '';
    const spineOn = has(E, 'spine');
    const spineNote = g.spineTextOk ? `On for this book: ${g.f.pages} pages gives a ${g.sp.toFixed(3)} in spine.`
      : `Off for this book. It has ${g.f.pages} pages; on ${g.f.paper} paper spine text starts at ${g.spineMin} pages so it never runs off the spine.`;
    return `
      <div class="cv-cap">BOOK DATA</div>
      <p class="cv-help">The words KDP checks must match your book details exactly, so they come from your book, not free typing.</p>
      ${missing.length ? '<button type="button" class="cv-bd-all" data-k="bd-all" data-bd-all>Add all to the cover</button>' : ''}
      ${rows}
      <div class="cv-bd-card"><div class="cv-bd-head"><span class="cv-bd-label">Back blurb</span>
        <button type="button" class="cv-sbtn" data-k="bd-blurb" data-open-blurb>${bl ? 'Edit blurb' : 'Write blurb'}</button></div>
        ${bl ? `<div class="cv-bd-blurb">${esc(blurbText)}</div>` : '<div class="cv-bd-val is-none">Not written yet. AI drafts it from your book; you edit and approve.</div>'}</div>
      <div class="cv-bd-spine"><span class="cv-bd-label">SPINE TEXT</span><span>${esc(spineNote)}</span>
        ${g.spineTextOk && !spineOn ? '<button type="button" class="cv-sbtn cv-bd-spinebtn" data-k="bd-spine" data-add-spine>Add spine text</button>' : ''}
        ${spineOn ? `<span class="cv-on">${OK}Spine text is on the cover.</span>` : ''}</div>
      <div class="cv-bd-specs"><span>Trim</span><span>${esc(L.trim)}</span><span>Pages</span><span>${g.f.pages}, ${esc(g.f.paper)} paper</span><span>Spine</span><span>${esc(L.spine)}</span></div>
      <p class="cv-help cv-help-sm">Change words in 04 Title and Pen Names. Change trim, pages or paper in 08 Format; the cover redraws to match.</p>`;
  }

  function bind(panel, E) {
    panel.addEventListener('click', (e) => {
      if (E.panel !== 'book') return;
      if (e.target.closest('[data-bd-all]')) { E.addAllBook(); return; }
      const f = e.target.closest('[data-bd-find]');
      if (f) { const l = E.cover.layers.find((x) => x.src === f.dataset.bdFind); if (l) E.selectIds([l.id]); return; }
      if (e.target.closest('[data-open-blurb]')) { E.openBlurb(e.target.closest('[data-open-blurb]')); return; }
      if (e.target.closest('[data-add-spine]')) { E.addSpine(); return; }
      // Add per row: text.js's handler ([data-add-book]) adds it, for every panel.
    });
  }

  C.bookData = { html, bind, realBlurb };
})(globalThis);
