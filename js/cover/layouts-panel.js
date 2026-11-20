/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the Layouts panel (E16 Part 8, design 67, plan §3)
   /js/cover/layouts-panel.js   (browser; needs layouts, palettes, geo, render,
                                 images and fonts; driven by js/cover/editor.js)

   MY LAYOUTS: every export adds an entry; the last 5 of each book are kept
   (E16.2, 0032, owner choice B; was one per book, Q-3b). Each row shows the
   entry's thumbnail (cover_my_layouts.thumb), its name, the book it came from
   and the export date and time in local time ("Exported Nov 18, 10:09", owner
   Q-2, so 5 entries of one book can be told apart); a click applies it (this
   book's words, plan D2), the × removes it (its label names the time too).
   No Storage call: an entry owns no file (plan F5).
   SERIES COLORS: the 6 palettes; a click maps the cover's colors onto one
   (kdpCover.palettes.swap).
   READY LAYOUTS: 12 + Blank, authored at 6 × 9 and remapped to the book's
   size; the small covers are drawn by our renderer with this book's words.
   A layout applies at once; when it replaces layers, the note "[Layout]
   applied. Your old design is one Undo away." shows for 6 s with Undo
   (the editor's toast).

   kdpCover.layoutsPanel.html(E)          → the panel's inner HTML
   kdpCover.layoutsPanel.bind(panel, E)   → clicks (once per panel element)
   kdpCover.layoutsPanel.paint(panel, E)  → draws the ready layouts' small covers (after each html)
   kdpCover.layoutsPanel.FONTS            → the faces the 12 layouts use (loaded when the panel opens)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINI_H = 129, MY_H = 90;
  // The faces the 12 ready layouts draw with (layouts.js base()).
  const FONTS = [['Source Serif 4', 700], ['IBM Plex Sans', 400], ['IBM Plex Sans', 600], ['Bebas Neue', 400], ['Anton', 400]];
  const X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /** { day: "Nov 18", time: "10:09" } in local time (24 hours), or null for a bad date. */
  function when(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const p2 = (n) => String(n).padStart(2, '0');
    return { day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), time: `${p2(d.getHours())}:${p2(d.getMinutes())}` };
  }
  const dateText = (iso) => { const w = when(iso); return w ? `${w.day}, ${w.time}` : ''; };
  const xLabel = (m) => { const w = when(m.exported_at); return `Remove ${m.name}${w ? `, exported ${w.day} ${w.time},` : ''} from My layouts`; };

  /** The book's own words for a layout (layouts.js book = { title, subtitle, pen }). */
  const bookOf = (E) => ({ title: E.bookWords('title'), subtitle: E.bookWords('subtitle'), pen: E.bookWords('pen') });

  function myHtml(E) {
    const list = E.my || [];
    if (!list.length) return '<p class="cv-help cv-help-sm" data-my-empty>Every cover you export is saved here. Use it for your next book or a series.</p>';
    const g = C.geo.geo(E.cover.fmt), w = Math.round(MY_H * g.trimW / g.trimH);
    const rows = list.map((m) => {
      const on = E.cover.layout === 'my:' + m.id, busy = E.lay.busy === 'my:' + m.id;
      const thumb = m.thumb ? `<img class="cv-my-img" src="${esc(m.thumb)}" alt="" width="${w}" height="${MY_H}">` : `<span class="cv-my-img cv-my-none" style="width:${w}px">No picture</span>`;
      return `<div class="cv-my">
        <button type="button" class="cv-my-btn${on ? ' is-on' : ''}" data-k="my-${esc(m.id)}" data-my="${esc(m.id)}" aria-pressed="${on}"${busy ? ' aria-busy="true"' : ''}>
          ${thumb}
          <span class="cv-my-text"><span class="cv-my-name">${esc(m.name)}</span>
            <span class="cv-my-from">From ${esc(m.from_title || 'another book')}</span>
            <span class="cv-my-date cv-mono">Exported ${esc(dateText(m.exported_at))}</span></span>
        </button>
        <button type="button" class="cv-my-x" data-k="my-x-${esc(m.id)}" data-my-x="${esc(m.id)}" aria-label="${esc(xLabel(m))}" title="Remove from My layouts">${X}</button>
      </div>`;
    }).join('');
    return `<div class="cv-mys">${rows}</div>
      <p class="cv-help cv-help-sm">Your title, subtitle and pen name replace the old book's words. Your own photos come along.</p>`;
  }

  function html(E) {
    const g = C.geo.geo(E.cover.fmt), w = Math.round(MINI_H * g.trimW / g.trimH);
    const pals = C.palettes.PALETTES.map(([name, pal], i) => `<button type="button" class="cv-pal" data-k="pal-${i}" data-pal="${i}" aria-label="${esc(name)}" title="${esc(name)}">
        <span class="cv-pal-sw">${pal.map((c) => `<span style="--sw:${c}"></span>`).join('')}</span>${esc(name)}</button>`).join('');
    const tiles = C.layouts.LIST.map(([key, label, note]) => {
      const on = E.cover.layout === key, busy = E.lay.busy === key;
      return `<button type="button" class="cv-lay${on ? ' is-on' : ''}" data-k="lay-${key}" data-lay="${key}" aria-pressed="${on}"${busy ? ' aria-busy="true"' : ''}>
        <span class="cv-lay-mini" style="width:${w}px;height:${MINI_H}px"><canvas data-mini="${key}" width="${w}" height="${MINI_H}" aria-hidden="true"></canvas></span>
        <span class="cv-lay-label">${esc(label)}</span><span class="cv-lay-note">${esc(note)}</span></button>`;
    }).join('');
    const err = E.lay.err ? `<p class="cv-lay-err" role="alert"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg><span>${esc(E.lay.err)}</span></p>` : '';
    return `
      <div class="cv-cap">LAYOUTS</div>
      <p class="cv-help">Click one and it fills your cover with your title, subtitle and pen name. Changed your mind? Undo brings back what you had.</p>
      ${err}
      <div class="cv-cap cv-cap-gap">MY LAYOUTS</div>
      ${myHtml(E)}
      <div class="cv-cap cv-cap-gap">SERIES COLORS</div>
      <p class="cv-help cv-help-sm">Same design, new colors. Each book in a series gets its own look.</p>
      <div class="cv-pals">${pals}</div>
      <div class="cv-cap cv-cap-gap">READY LAYOUTS</div>
      <div class="cv-lays">${tiles}</div>
      <p class="cv-help cv-help-sm">Layouts follow your trim, page count and paper, so they still fit if those change in 08 Format.</p>`;
  }

  function bind(panel, E) {
    panel.addEventListener('click', (e) => {
      if (E.panel !== 'layouts') return;
      const x = e.target.closest('[data-my-x]');
      if (x) { E.removeMy(x.dataset.myX); return; }
      const m = e.target.closest('[data-my]');
      if (m) { E.applyMy(m.dataset.my); return; }
      const p = e.target.closest('[data-pal]');
      if (p) { E.swapPalette(Number(p.dataset.pal)); return; }
      const t = e.target.closest('[data-lay]');
      if (t) E.applyLayout(t.dataset.lay);
    });
  }

  /** The small covers: the front of each layout at the book's size, with this book's words (fonts loaded first; else blank paper). */
  function paint(panel, E) {
    const g = C.geo.geo(E.cover.fmt), dpr = root.devicePixelRatio || 1;
    const book = bookOf(E);
    for (const cv of panel.querySelectorAll('canvas[data-mini]')) {
      const key = cv.dataset.mini;
      const w = Number(cv.getAttribute('width')), h = MINI_H;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const ctx = cv.getContext('2d');
      const r = C.layouts.build(key, book, E.cover.fmt, 1, null);
      if (!E.lay.fonts) { ctx.fillStyle = r.bg; ctx.fillRect(0, 0, cv.width, cv.height); continue; }
      const s = (h * dpr) / g.trimH;
      try {
        C.render.paint(ctx, { fmt: E.cover.fmt, bg: r.bg, layers: r.layers }, { scale: s, x0: g.foldR, y0: g.b, images: (l) => C.images.source(E, l) });
      } catch (err) { ctx.fillStyle = r.bg; ctx.fillRect(0, 0, cv.width, cv.height); }
    }
  }

  C.layoutsPanel = { FONTS, MINI_H, html, bind, paint, bookOf, dateText, xLabel };
})(globalThis);
