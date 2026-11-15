/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: text (E16 Part 4, plan §3 "Text")
   /js/cover/text.js   (browser; needs model, fonts, font-catalog, picker)

   The Text panel (design 58: presets 36, 20 and 12 pt, "From your book"),
   the text bar of design 59 (Edit, font, weight, size, color, align,
   capitals, Effects, opacity, Arrange, duplicate, lock, delete) and its
   popovers: the font list (design 59), text color (design 60, the shared
   picker), opacity and Arrange.
   - Font list: search and the groups All, Serif, Sans, Display, Script,
     Mono. The design's 20 fonts come first in the design's order, then the
     other catalog families by popularity (plan D5: about 300). Each name is
     drawn from img/cover-fonts.png (row n = catalog row n, 28 px), so the
     list loads no fonts; a font loads when it is picked.
   - Weight: only the weights the family has a file for (plan D5).
   - Effects (Part 5): the Text effects popover of design 61 (js/cover/effects.js).

   kdpCover.text.panelHtml(E) / barHtml(E) / bindPanel(el, E) / bindBar(el, E)
   kdpCover.text.fontRows(q, cat)   → [{ family, group, row }] for the list
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    pen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>',
    center: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>',
    fx: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20L14 10"/><path d="M15 3v3M18.5 4.5l-2 2M21 9h-3M12 6h-3M18.5 13.5l-2-2"/></svg>',
    dup: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    del: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
  };
  const WEIGHT = { 400: 'Regular', 600: 'Semibold', 700: 'Bold' };
  const CATS = ['All', 'Serif', 'Sans', 'Display', 'Script', 'Mono'];
  const inert = (part) => ` aria-disabled="true" title="Comes in Part ${part}" data-inert="${part}"`;

  /* ── Font list ── */
  let ORDER = null;
  function order() {
    if (ORDER) return ORDER;
    const cat = C.fontCatalog || [];
    const idx = new Map(cat.map((r, i) => [r[0], i]));
    const first = C.model.FONTS.map((f) => f[0]).filter((f) => idx.has(f));
    const rest = cat.map((r) => r[0]).filter((f) => !first.includes(f));
    ORDER = first.concat(rest).map((f) => ({ family: f, group: cat[idx.get(f)][1], row: idx.get(f) }));
    return ORDER;
  }
  function fontRows(q, cat) {
    const s = String(q || '').trim().toLowerCase();
    return order().filter((r) => (cat === 'All' || r.group === cat) && (!s || r.family.toLowerCase().includes(s)));
  }

  /* ── Text panel (design 58) ── */
  function bookRow(E, key, label) {
    const on = E.cover.layers.some((l) => l.src === key);
    const words = E.bookWords(key);
    if (on) return `<div class="cv-bookrow"><span>${label}</span><span class="cv-on">✓ On the cover</span></div>`;
    const why = key === 'subtitle' ? 'This book has no subtitle in 04 Title.' : key === 'pen' ? 'This book has no pen name yet.' : 'This book has no title in 04 Title.';
    return `<div class="cv-bookrow"><span>${label}</span><button type="button" class="cv-sbtn" data-k="add-${key}" data-add-book="${key}"${words ? '' : ` aria-disabled="true" title="${why}"`}>Add</button></div>`;
  }
  function panelHtml(E) {
    return `
      <div class="cv-cap">TEXT</div>
      <button type="button" class="cv-preset cv-preset-h" data-k="add-heading" data-add-text="heading">Add a heading</button>
      <button type="button" class="cv-preset cv-preset-s" data-k="add-sub" data-add-text="sub">Add a subheading</button>
      <button type="button" class="cv-preset cv-preset-b" data-k="add-body" data-add-text="body">Add body text</button>
      <p class="cv-help">The text drops in the middle of the front. Drag it anywhere. Double-click to type. Shift-click or drag a box on the cover to select several. Pick a font, size and color in the bar above the cover.</p>
      <div class="cv-rule"></div>
      <div class="cv-cap">FROM YOUR BOOK</div>
      <div class="cv-bookrows">
        ${bookRow(E, 'title', 'Title')}${bookRow(E, 'subtitle', 'Subtitle')}${bookRow(E, 'pen', 'Pen name')}
        <div class="cv-bookrow"><span>Back blurb</span><button type="button" class="cv-sbtn" data-k="blurb"${inert(8)}>Write blurb</button></div>
        <div class="cv-bookrow"><span>Author line</span><button type="button" class="cv-sbtn" data-k="author"${inert(8)}>Add</button></div>
      </div>
      <p class="cv-help cv-help-sm">Words come from 04 Title and Pen Names. Change them there.</p>`;
  }
  function bindPanel(el, E) {
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-add-text]');
      if (t) { E.addText(t.dataset.addText); return; }
      const b = e.target.closest('[data-add-book]');
      if (b && b.getAttribute('aria-disabled') !== 'true') E.addBook(b.dataset.addBook);
    });
  }

  /* ── Text bar (design 59) ── */
  function barHtml(E) {
    const l = E.selLayer();
    if (!l || l.type !== 'text') return '';
    const fam = C.fonts.families().find((f) => f.family === l.font);
    const weights = fam ? fam.weights : [400];
    // The font button shows the name in its own face (design 59), regular when that file is loaded, else the layer's face.
    const reg = C.fonts.face(l.font, C.fonts.snap(l.font, 400) || l.weight), face = reg && C.fonts.loaded(reg) ? reg : C.fonts.face(l.font, l.weight);
    const ffam = face && C.fonts.loaded(face) ? `'${C.fonts.canvasName(face)}'` : 'inherit';   // single quotes: it goes inside style="…"
    const m = E.menu;
    const btn = (k, on, label, icon, extra) => `<button type="button" class="cv-ib${on ? ' is-on' : ''}" data-k="${k}" aria-label="${label}" aria-pressed="${on}"${extra || ''}>${icon}</button>`;
    return `
      <button type="button" class="cv-ib cv-ib-edit" data-k="edit" data-act="edit" aria-label="Edit text" title="Edit text (or double-click the text)">${I.pen}</button>
      <button type="button" class="cv-fontbtn${m === 'fonts' ? ' is-open' : ''}" data-k="font" data-act="fonts" aria-expanded="${m === 'fonts'}" aria-label="Font: ${esc(l.font)}" style="font-family:${ffam}">${esc(l.font)} ▾</button>
      ${E.fontBusy ? `<span class="cv-status" role="status">Loading ${esc(E.fontBusy)}…</span>` : ''}
      ${E.fontErr ? `<span class="cv-status is-error" role="alert">${esc(E.fontErr)}</span>` : ''}
      <span class="cv-selwrap"><select class="cv-select" data-k="weight" data-act="weight" aria-label="Weight">
        ${weights.map((w) => `<option value="${w}"${w === l.weight ? ' selected' : ''}>${WEIGHT[w] || w}</option>`).join('')}
      </select></span>
      <span class="cv-size"><button type="button" class="cv-size-b cv-size-l" data-k="size-down" data-act="size-down" aria-label="Smaller">−</button><span class="cv-size-v" aria-live="polite">${l.size} pt</span><button type="button" class="cv-size-b cv-size-r" data-k="size-up" data-act="size-up" aria-label="Bigger">+</button></span>
      <button type="button" class="cv-tb${m === 'color' ? ' is-open' : ''}" data-k="color" data-act="color" aria-expanded="${m === 'color'}" aria-label="Text color ${l.color}"><span class="cv-swatch" style="--sw:${l.color}"></span><span class="cv-mono">${l.color}</span></button>
      <span class="cv-sep" aria-hidden="true"></span>
      ${btn('al', l.align === 'left', 'Align left', I.left, ' data-act="align" data-v="left"')}
      ${btn('ac', l.align === 'center', 'Align center', I.center, ' data-act="align" data-v="center"')}
      ${btn('ar', l.align === 'right', 'Align right', I.right, ' data-act="align" data-v="right"')}
      ${btn('caps', !!l.caps, 'Capitals', 'AA', ' data-act="caps"')}
      <button type="button" class="cv-tb${m === 'effects' ? ' is-open' : ''}" data-k="fx" data-act="effects" aria-expanded="${m === 'effects'}"${l.fx.style !== 'none' || l.curve || l.dist.on ? ' data-fx-on' : ''}>${I.fx}Effects</button>
      <span class="cv-grow"></span>
      <button type="button" class="cv-tb${m === 'opacity' ? ' is-open' : ''}" data-k="op" data-act="opacity" aria-expanded="${m === 'opacity'}" aria-label="Opacity ${l.op}%"><span class="cv-checker" aria-hidden="true"></span>${l.op}%</button>
      <button type="button" class="cv-tb${m === 'arrange' ? ' is-open' : ''}" data-k="arr" data-act="arrange" aria-expanded="${m === 'arrange'}">Arrange ▾</button>
      <button type="button" class="cv-ib" data-k="dup" data-act="dup" aria-label="Duplicate">${I.dup}</button>
      ${btn('lock', !!l.lock, l.lock ? 'Unlock' : 'Lock', I.lock, ' data-act="lock"')}
      <button type="button" class="cv-ib cv-ib-del" data-k="del" data-act="del" aria-label="Delete">${I.del}</button>
      ${m === 'fonts' ? fontsHtml(E, l) : ''}
      ${m === 'effects' ? C.effects.html(E, l) : ''}
      ${m === 'color' ? `<div class="cv-pop cv-pop-color" role="dialog" aria-label="Text color" data-picker>${C.picker.html(E.pk, { title: 'Text color', cur: l.color })}</div>` : ''}
      ${m === 'opacity' ? `<div class="cv-pop cv-pop-op" role="dialog" aria-label="Opacity">
          <label class="cv-range"><span class="cv-range-row"><strong>Opacity</strong><span class="cv-mono">${l.op}%</span></span>
          <input type="range" min="0" max="100" step="1" value="${l.op}" data-k="op-range" data-act="op-range"></label>
          <p class="cv-pop-p cv-pop-p-sm">When you export, NicheInk merges see-through parts with what is under them into one flat 300 DPI picture. KDP gets a flat file.</p></div>` : ''}
      ${m === 'arrange' ? `<div class="cv-pop cv-pop-arr" role="menu" aria-label="Arrange">
          <button type="button" role="menuitem" class="cv-mi" data-k="a-front" data-act="arr" data-v="front">Bring to front</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-fwd" data-act="arr" data-v="forward">Bring forward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-bwd" data-act="arr" data-v="backward">Send backward</button>
          <button type="button" role="menuitem" class="cv-mi" data-k="a-back" data-act="arr" data-v="back">Send to back</button>
          <p class="cv-pop-p cv-pop-p-sm">Forward and backward jump past the next layer this one covers.</p></div>` : ''}`;
  }

  function fontsHtml(E, l) {
    const rows = fontRows(E.fontQ, E.cat);
    return `<div class="cv-pop cv-pop-fonts" role="dialog" aria-label="Fonts">
      <input type="search" class="cv-input" data-k="font-q" data-font-q aria-label="Search fonts" placeholder="Search ${C.fontCatalog.length} free fonts" value="${esc(E.fontQ)}">
      <div class="cv-chips">${CATS.map((c) => `<button type="button" class="cv-chip${E.cat === c ? ' is-on' : ''}" data-k="cat-${c}" data-cat="${c}" aria-pressed="${E.cat === c}">${c}</button>`).join('')}</div>
      <div class="cv-fontlist" data-fontlist>${rows.length ? rows.map((r) => `<button type="button" class="cv-font${r.family === l.font ? ' is-on' : ''}" data-k="f-${esc(r.family)}" data-font="${esc(r.family)}" aria-pressed="${r.family === l.font}">
          <span class="cv-font-name" style="--row:${r.row}" aria-hidden="true"></span><span class="sr-only">${esc(r.family)}</span><span class="cv-font-cat">${r.group}</span></button>`).join('')
        : `<p class="cv-help">No font matches "${esc(E.fontQ)}".</p>`}</div>
      <p class="cv-pop-p cv-pop-p-sm">Free for commercial use (OFL or Apache). A font loads only when you pick it. The print file embeds only the fonts you use.</p>
    </div>`;
  }

  function bindBar(el, E) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act], [data-font], [data-cat]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      if (b.dataset.font) { E.pickFont(b.dataset.font); return; }
      if (b.dataset.cat) { E.cat = b.dataset.cat; E.refreshBars(); return; }
      const l = E.selLayer(); if (!l) return;
      const a = b.dataset.act;
      if (a === 'edit') E.startEdit(l.id);
      else if (a === 'fonts' || a === 'color' || a === 'opacity' || a === 'arrange' || a === 'effects') E.toggleMenu(a);
      else if (a === 'size-down' || a === 'size-up') E.patchLayer(l.id, { size: C.model.sizeStep(l.size, a === 'size-up' ? 1 : -1) });
      else if (a === 'align') E.patchLayer(l.id, { align: b.dataset.v });
      else if (a === 'caps') E.patchLayer(l.id, { caps: !l.caps, ls: !l.caps ? 0.12 : 0 });
      else if (a === 'arr') E.arrange(b.dataset.v);
      else if (a === 'dup') E.duplicate();
      else if (a === 'lock') E.patchLayer(l.id, { lock: !l.lock });
      else if (a === 'del') E.removeSel();
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-act="weight"]')) { const l = E.selLayer(); if (l) E.pickFont(l.font, Number(e.target.value)); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.matches('[data-font-q]')) {
        E.fontQ = e.target.value;
        const list = el.querySelector('[data-fontlist]');
        const tmp = document.createElement('div');
        tmp.innerHTML = fontsHtml(E, E.selLayer());
        list.replaceWith(tmp.querySelector('[data-fontlist]'));
      }
      if (e.target.matches('[data-act="op-range"]')) {
        const l = E.selLayer(); if (!l) return;
        E.patchLayer(l.id, { op: Number(e.target.value) }, null, { bars: false });
        const pop = e.target.closest('.cv-pop'); if (pop) pop.querySelector('.cv-mono').textContent = e.target.value + '%';
        const ob = el.querySelector('[data-k="op"]'); if (ob) { ob.lastChild.textContent = e.target.value + '%'; ob.setAttribute('aria-label', `Opacity ${e.target.value}%`); }
      }
    });
  }

  C.text = { panelHtml, barHtml, bindPanel, bindBar, fontRows, WEIGHT };
})(globalThis);
