/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: the checks chip and drawer (E16 Part 9, design 70)
   /js/cover/checks-drawer.js   (browser; the editor draws it from renderBars)

   The chip in the view bar reads "N to fix", "N to check" or "Ready"
   (kdpCover.checks.summary) and opens the drawer on the right of the cover.
   The drawer lists every item of kdpCover.checks.run (C1 to C16) with its
   tag (Must fix, Check, Tip; each with an icon and its word, CLAUDE.md §7)
   and its words. A layer's item has "Show me": the layer is selected, the
   drawer closes and the layer's box gets the focus. A fix item has its own
   button: C1 "Add it" (the book's words; when the book has none, the
   reason instead of the button, as the Text panel says it; when the layer
   is there but hidden or excluded, "Show it" puts it back: the design's
   Add it does nothing then, owner STOP 9 N1), C17 Show me and "Write
   blurb" (owner STOP 9: the layout's sample blurb), C14 "Write
   blurb" (the blurb dialog). Nothing listed (tips aside): the green
   "Ready to export." box.

   The drawer is not modal: the cover stays usable beside it. Escape closes
   it and the focus goes back to the chip.

   kdpCover.checksDrawer.html(E, items)   → the drawer's HTML (items = checks.run)
   kdpCover.checksDrawer.bind(host, E)    → clicks (close, Show me, fixes)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = {
    warn: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    info: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const TAG = { error: ['Must fix', 'is-error', I.warn], warn: ['Check', 'is-warn', I.warn], tip: ['Tip', 'is-tip', I.info] };
  const NO_WORDS = { title: 'This book has no title in 04 Title.', subtitle: 'This book has no subtitle in 04 Title.', pen: 'This book has no pen name yet.' };

  function itemHtml(E, c, i) {
    const [tag, cls, icon] = TAG[c.sev] || TAG.tip;
    let act = '';
    if (c.fix && c.fix.action === 'add') {
      // The layer is there but hidden or excluded (the design's Add it would do nothing): Show it.
      const off = E.cover.layers.find((l) => l.src === c.fix.key);
      act = off ? `<button type="button" class="cv-ck-btn" data-k="ck-${i}" data-ck-fix="${i}">Show it</button>`
        : E.bookWords(c.fix.key) ? `<button type="button" class="cv-ck-btn" data-k="ck-${i}" data-ck-fix="${i}">${esc(c.fix.label)}</button>`
        : `<p class="cv-ck-why">${esc(NO_WORDS[c.fix.key] || '')}</p>`;
    } else {
      // A layer's item: Show me; a fix: its button. C17 has both (owner, STOP 9): Show me, then Write blurb.
      const show = c.id != null ? `<button type="button" class="cv-ck-btn" data-k="ck-${i}" data-ck-show="${esc(c.id)}">Show me</button>` : '';
      const fix = c.fix ? `<button type="button" class="cv-ck-btn" data-k="ck-fix-${i}" data-ck-fix="${i}">${esc(c.fix.label)}</button>` : '';
      act = show && fix ? `<span class="cv-ck-btns">${show}${fix}</span>` : show || fix;
    }
    return `<li class="cv-ck-item" data-ck-code="${c.code}"><span class="cv-ck-tag ${cls}">${icon}${tag}</span>
      <span class="cv-ck-msg">${esc(c.msg)}</span>${act}</li>`;
  }

  function html(E, items) {
    const sum = C.checks.summary(items);
    const ok = !items.some((c) => c.sev !== 'tip');
    return `<aside class="cv-ck" id="cv-checks" aria-label="Checks" data-checks>
      <div class="cv-ck-head"><div><h2 class="cv-ck-h">Checks</h2><div class="cv-ck-sum" role="status">${esc(sum.line)}</div></div>
        <button type="button" class="cv-ck-x" data-k="ck-close" data-ck-close aria-label="Close checks">${I.x}</button></div>
      <div class="cv-ck-body" data-ck-body>
        ${ok ? `<div class="cv-ck-ok">${I.ok}<span><strong>Ready to export.</strong> Nothing KDP would reject. Look at Preview final once more before you export.</span></div>` : ''}
        ${items.length ? `<ul class="cv-ck-list">${items.map((c, i) => itemHtml(E, c, i)).join('')}</ul>` : ''}
      </div>
      <p class="cv-ck-foot">"Must fix" blocks export. "Check" and "Tip" never block. Checks run on what will print: hidden and excluded layers are skipped.</p>
    </aside>`;
  }

  function bind(host, E) {
    host.addEventListener('click', (e) => {
      if (!E.checksOpen) return;
      if (e.target.closest('[data-ck-close]')) { E.closeChecks(true); return; }
      const show = e.target.closest('[data-ck-show]');
      if (show) {
        const raw = show.getAttribute('data-ck-show');
        const l = E.cover.layers.find((x) => String(x.id) === raw);
        if (!l) return;
        E.closeChecks(false);
        E.selectIds([l.id]);
        E.showLayer(l.id);
        const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(l.id))}"]`);
        if (hit) hit.focus({ preventScroll: true });
        return;
      }
      const fx = e.target.closest('[data-ck-fix]');
      if (fx) {
        const c = E.checkItems()[Number(fx.getAttribute('data-ck-fix'))];
        if (!c || !c.fix) return;
        if (c.fix.action === 'add') {
          const off = E.cover.layers.find((l) => l.src === c.fix.key);
          E.closeChecks(false);
          if (off) {
            E.setLayer(off.id, { hidden: false, noExport: false });
            E.selectIds([off.id]); E.showLayer(off.id);
            const hit = E.root.querySelector(`[data-hit="${CSS.escape(String(off.id))}"]`);
            if (hit) hit.focus({ preventScroll: true });
          } else E.addBook(c.fix.key);
        }
        else if (c.fix.action === 'blurb') { E.closeChecks(false); E.openBlurb(E.root.querySelector('[data-k="chk"]')); }
      }
    });
  }

  C.checksDrawer = { html, bind };
})(globalThis);
