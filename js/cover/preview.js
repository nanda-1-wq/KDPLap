/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: Preview final (E16 Part 9, design 69, plan §3)
   /js/cover/preview.js   (browser; needs render, kindle, geo, names, images)

   A full view of what the files will hold, over the editor (below the book
   head, the step rail too, as design 69):
   - Show "As printed, cut at the trim" (the trim box) or "With bleed" (the
     whole wrap); "Black and white check" draws the three pictures gray;
   - the cover painted by our renderer without the KDP template, guides,
     the selection, hidden layers and layers set to "Exclude from export"
     (render.paint without screen: the same layers as the files), with the
     line "Everything you see here goes into your files." or the count of
     the layers left out;
   - Kindle cover 1600 × 2560: kdpCover.kindle.paint, the painting the
     Kindle JPG uses (kFit for wide trims), with the cut in words;
   - Search result size: the Kindle front at 75 × 120 px.
   Export cover in its bar is inert until the export dialog lands (Part 10).

   It is a modal dialog: the cover's keys and Paste rest, Tab stays inside,
   Escape and Back to editing close it and the focus goes back to the
   Preview final button.

   kdpCover.preview.hostHtml(E)  → the dialog's HTML ('' when closed)
   kdpCover.preview.paint(E)     → paints the three canvases (again when pictures arrive)
   kdpCover.preview.bind(host, E)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BACK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
  const KW = 200, KH = 320, TW = 75, TH = 120;

  function leftOutText(layers) {
    const n = layers.filter((l) => l.hidden || l.noExport).length;
    return n ? n + (n === 1 ? ' layer is' : ' layers are') + ' hidden or set to "Exclude from export", so they are not shown here.' : 'Everything you see here goes into your files.';
  }

  function hostHtml(E) {
    const P = E.pv;
    if (!P || !P.open) return '';
    const g = C.geo.geo(E.cover.fmt), L = C.names.labels(g);
    const gray = P.gray ? ' is-gray' : '';
    return `<div class="cv-pv" role="dialog" aria-modal="true" aria-labelledby="cv-pv-h" data-pv>
      <div class="cv-pv-bar">
        <button type="button" class="cv-pv-back" data-k="pv-back" data-pv-close>${BACK}Back to editing</button>
        <h2 class="cv-pv-h" id="cv-pv-h">Preview final</h2>
        <span class="cv-pv-show" id="cv-pv-show">Show</span>
        <span class="cv-pv-seg" role="group" aria-labelledby="cv-pv-show">
          <button type="button" class="cv-pv-tb${P.cut ? ' is-on' : ''}" data-k="pv-cut" data-pv-cut="1" aria-pressed="${P.cut}">As printed, cut at the trim</button>
          <button type="button" class="cv-pv-tb${P.cut ? '' : ' is-on'}" data-k="pv-bleed" data-pv-cut="0" aria-pressed="${!P.cut}">With bleed</button>
        </span>
        <label class="cv-pv-gray"><input type="checkbox" data-k="pv-gray" data-pv-gray${P.gray ? ' checked' : ''}>Black and white check</label>
        <span class="cv-grow"></span>
        <button type="button" class="cv-pv-export" data-k="pv-export" aria-disabled="true" title="Comes in Part 10" data-inert="10">${DOWN}Export cover</button>
      </div>
      <div class="cv-pv-body">
        <div class="cv-pv-stage" data-pv-stage>
          <div class="cv-pv-big${gray}" data-pv-bigbox><canvas data-pv-big role="img" aria-label="${P.cut ? 'The cover as printed, cut at the trim' : 'The cover with bleed'}${P.gray ? ', in black and white' : ''}"></canvas></div>
          <div class="cv-pv-labels"><span>Back cover</span><span>${esc(L.spine)}</span><span>Front cover</span></div>
          <p class="cv-pv-note" data-pv-note>${esc(leftOutText(E.cover.layers))} Template lines and guides never print.</p>
        </div>
        <div class="cv-pv-side">
          <section class="cv-pv-card cv-pv-kcard" aria-labelledby="cv-pv-kh">
            <div class="cv-pv-khead"><h3 class="cv-pv-h3" id="cv-pv-kh">Kindle cover</h3><span class="cv-mono cv-pv-px">1600 × 2560 px</span></div>
            <div class="cv-pv-kindle${gray}"><canvas data-pv-kindle width="${KW}" height="${KH}" role="img" aria-label="The Kindle cover, made from your print front"></canvas></div>
            <p class="cv-pv-p">Made from your print front: cut at the trim, ${esc(C.names.kindleCut(g))}. Keep words inside the safe area and nothing is lost.</p>
          </section>
          <section class="cv-pv-card cv-pv-tcard" aria-labelledby="cv-pv-th">
            <div class="cv-pv-thumb${gray}"><canvas data-pv-thumb width="${TW}" height="${TH}" role="img" aria-label="Your cover at search result size"></canvas></div>
            <div class="cv-pv-tt"><h3 class="cv-pv-h3" id="cv-pv-th">Search result size</h3><p class="cv-pv-p">This is about how big your cover looks in Amazon search. Can you still read the title? If not, make it bigger or add more contrast.</p></div>
          </section>
        </div>
      </div>
    </div>`;
  }

  function sized(cv, w, h) {
    const d = root.devicePixelRatio || 1;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const W = Math.max(1, Math.round(w * d)), H = Math.max(1, Math.round(h * d));
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    return d;
  }

  function paint(E) {
    const host = E.root.querySelector('[data-pv]');
    if (!host || !E.pv || !E.pv.open) return;
    const cover = E.cover, g = C.geo.geo(cover.fmt), images = (l) => C.images.source(E, l);
    const cut = E.pv.cut;
    const W2 = cut ? g.W - 2 * g.b : g.W, H2 = cut ? g.trimH : g.H, o = cut ? g.b : 0;
    // The design's size: up to 940 × 660 px (600 wide under 1200 px), smaller when the window is.
    const stage = host.querySelector('[data-pv-stage]');
    const below = [...stage.children].filter((n) => !n.hasAttribute('data-pv-bigbox')).reduce((s, n) => s + n.offsetHeight + 12, 0);
    const maxW = Math.min(root.innerWidth < 1200 ? 600 : 940, stage.clientWidth), maxH = Math.min(660, stage.clientHeight - below);
    const k = Math.max(0.05, Math.min(maxW / W2, maxH / H2));
    const big = host.querySelector('[data-pv-big]');
    const d = sized(big, W2 * k, H2 * k);
    const ctx = big.getContext('2d', { alpha: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    C.render.paint(ctx, cover, { scale: k * d, x0: o, y0: o, images });
    for (const [sel, w, h] of [['[data-pv-kindle]', KW, KH], ['[data-pv-thumb]', TW, TH]]) {
      const cv = host.querySelector(sel);
      const dd = sized(cv, w, h);
      const c2 = cv.getContext('2d', { alpha: false });
      c2.setTransform(1, 0, 0, 1, 0, 0);
      C.kindle.paint(c2, cover, { w: w * dd, h: h * dd }, images);
    }
    E.pv.painted = (E.pv.painted || 0) + 1;
  }

  function bind(host, E) {
    host.addEventListener('click', (e) => {
      if (!E.pv || !E.pv.open) return;
      if (e.target.closest('[data-pv-close]')) { E.closePreview(); return; }
      const c = e.target.closest('[data-pv-cut]');
      if (c) { E.pv.cut = c.getAttribute('data-pv-cut') === '1'; E.refreshPreview(); }
    });
    host.addEventListener('change', (e) => {
      if (e.target.matches('[data-pv-gray]')) { E.pv.gray = e.target.checked; E.refreshPreview(); }
    });
    // A modal dialog: Tab and Shift+Tab stay inside.
    host.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !E.pv || !E.pv.open) return;
      const f = [...host.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }

  C.preview = { hostHtml, paint, bind, leftOutText };
})(globalThis);
