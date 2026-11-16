/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the book size changed (E16 Part 9, design 72, plan §4)
   /js/cover/resize-note.js   (browser; the editor runs the remap on open)

   On every open of 09 the editor compares the size the design is laid out
   for (cover_designs.fmt) with today's size (cover_json.fmt: the Brief trim,
   the current Print PDF's pages, the paper). When they differ it runs the
   design's remap unchanged (kdpCover.remap.changeFormat), saves the layers,
   the new fmt and last_remap in one update (the design as it was goes into
   the history first, reason "remap"), starts Undo again and fits the view.

   This file draws the amber note (design 72, F72 words, kdpCover.remap):
   - "Your book changed in 08 Format: … NicheInk moved your design to fit."
     and "N layers moved. Check them, then export again: …";
   - Show what moved (selects the moved layers that are still there);
   - Add spine text, when the new size allows spine text and there is none;
   - × closes it (last_remap.seen = true, saved). Otherwise it stays on every
     open until the next export (Part 10 sets seen).
   While it shows, the header line reads "The book size changed: export again."

   kdpCover.resizeNote.pending(E)  → the note's data (last_remap) while it shows, else null
   kdpCover.resizeNote.html(E)     → the note's inner HTML ('' when none)
   kdpCover.resizeNote.bind(el, E)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>';
  const X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /** A note in the shape 0030 checks ({from, to, moved[], spineFrom, spineTo}) that is not closed yet. */
  function pending(E) {
    const n = E && E.remapNote;
    return n && !n.seen && n.from && n.to && Array.isArray(n.moved) ? n : null;
  }

  function html(E) {
    const n = pending(E);
    if (!n) return '';
    const moved = n.moved.filter((id) => E.cover.layers.some((l) => l.id === id));
    const spine = C.remap.spineNew(n, E.cover.layers);
    return `${INFO}<div class="cv-sn-t"><div class="cv-sn-b">${esc(C.remap.noteText(n))}</div><div>${esc(C.remap.noteSub(n))}</div></div>
      ${moved.length ? '<button type="button" class="cv-sn-btn" data-k="size-moved" data-size-moved>Show what moved</button>' : ''}
      ${spine ? '<button type="button" class="cv-sn-btn is-ink" data-k="size-spine" data-size-spine>Add spine text</button>' : ''}
      <button type="button" class="cv-sn-x" data-k="size-x" data-size-x aria-label="Close the size note">${X}</button>`;
  }

  function bind(el, E) {
    el.addEventListener('click', (e) => {
      const n = pending(E); if (!n) return;
      if (e.target.closest('[data-size-moved]')) {
        const ids = n.moved.filter((id) => E.cover.layers.some((l) => l.id === id));
        if (ids.length) { E.selectIds(ids); E.showLayer(ids); }
      } else if (e.target.closest('[data-size-spine]')) E.addSpine();
      else if (e.target.closest('[data-size-x]')) E.closeSizeNote();
    });
  }

  C.resizeNote = { pending, html, bind };
})(globalThis);
