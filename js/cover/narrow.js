/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: window width (E16 Part 9, designs 74 and 74b, plan §3 Width)
   /js/cover/narrow.js   (browser; the editor and css/cover.css use it)

   One breakpoint source for 09 (the design's isWide / isNarrow / isTiny):
   - 1200 px and up ("wide"): the panel beside the cover;
   - 900 to 1199 px ("narrow", design 74): the panel opens over the cover
     when a tool is pressed (pressed again, or a press on the cover, closes
     it); the bars wrap; the header's reason line and the footer's size
     details hide. The root gets the class cv-narrow (the CSS reads it, so
     the width rule lives here only, not in media queries).
   - under 900 px ("tiny", design 74b): the full notice over the whole
     window (the book head too), with the window's width and Back to Books.
     The editor stays underneath with its state; it comes back when the
     window is wider. The notice says the cover is saved only when it is.

   kdpCover.narrow.mode(width)   → 'wide' | 'narrow' | 'tiny'
   kdpCover.narrow.WIDE / TINY   → 1200 / 900
   kdpCover.narrow.noticeHtml(width, saveState) → the notice (design 74b)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const WIDE = 1200, TINY = 900;
  const mode = (w) => (w >= WIDE ? 'wide' : w >= TINY ? 'narrow' : 'tiny');
  const ICON = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 10.5h3M15 10.5h3M9 9l-3 1.5L9 12M15 9l3 1.5L15 12"/></svg>';

  /** saveState: the autosave's state. "Saved" only when it is; offline and not saved say so (design words otherwise). */
  function noticeHtml(width, saveState) {
    const kept = saveState === 'saved' ? 'Your cover is saved. Nothing is lost.'
      : saveState === 'offline' ? 'You are offline. Your cover is kept on this device and saves when you are back online.'
      : saveState === 'lost' ? 'You are offline and this browser could not keep your last change. Keep this page open until you are back online.'
      : saveState === 'failed' ? 'Your last change was not saved. Make the window wider, then press Retry.'
      : 'Your cover is saving. Nothing is lost.';
    return `<div class="cv-tiny" role="alert" data-tiny>
      <div class="cv-tiny-box">${ICON}
        <h2 class="cv-tiny-h">This window is too narrow for the cover editor</h2>
        <p class="cv-tiny-p">The editor needs at least ${TINY} px. This window is ${Math.round(width)} px. Make the window wider, or open NicheInk on a computer.</p>
        <p class="cv-tiny-s" data-tiny-save>${kept}</p>
        <a class="cv-tiny-btn" href="dashboard.html" data-k="tiny-books">Back to Books</a>
      </div></div>`;
  }

  C.narrow = { WIDE, TINY, mode, noticeHtml };
})(globalThis);
