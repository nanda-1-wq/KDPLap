/* ═══════════════════════════════════════════════════
   NicheInk — Step 06 Write: book parts (E17 Part 4, designs 79, 80, 80c, 81)
   /js/write-parts.js   (used by app/book.html, loaded before js/book-write.js)

   - The parts list in the manuscript: "BOOK PARTS · FRONT" above the
     Introduction, "BOOK PARTS · BACK" under the Conclusion, only parts that
     are on, in the fixed book order. Pills: Empty (dashed), Draft, Final,
     Fixed (review request page), "N books" (Also by).
   - "+ Add a book part": a menu of 8 tick rows in 2 groups (the same switch
     as 08, book_parts.enabled). Keys as the Improve menu: arrows, Home, End,
     Escape closes and focus goes back to the button, Tab closes. Turning a
     part on opens its editor (Q-P4). Turning a part off keeps its text.
   - The editor itself is js/book-write.js with a part target (risk P1).
   - Data: kdp.parts (js/supabase.js, 0035 book_parts_json). Before 0035 is
     applied the read fails as "not found": the parts stay hidden.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;

  const KINDS = ['dedication', 'epigraph', 'foreword', 'preface', 'acknowledgments', 'about_author', 'review_request', 'also_by'];
  const FRONT = ['dedication', 'epigraph', 'foreword', 'preface'];
  const NAMES = { dedication: 'Dedication', epigraph: 'Epigraph', foreword: 'Foreword', preface: 'Preface', acknowledgments: 'Acknowledgments',
    about_author: 'About the author', review_request: 'Review request page', also_by: 'Also by' };
  const SIDE = { foreword: 'by another person', review_request: 'fixed text' };
  // The gray hint inside an empty editor: what the part is and where it prints (design 80).
  const HINTS = {
    dedication: 'Write your dedication. One or two short lines is enough. It prints on its own page after the copyright page.',
    epigraph: 'Type the quote. Put the name of the person who said it on its own line under it.',
    foreword: 'Paste the foreword here. Another person writes it, about you or the book. It prints before the preface.',
    preface: 'Write why you wrote this book and who it is for. It prints before the introduction.',
    acknowledgments: 'Thank the people who helped you make this book. It prints after the conclusion.',
    about_author: 'Write a short bio with true facts only. It prints near the end of the book.'
  };
  const FIXED = ['review_request', 'also_by'];   // no text, no status, no versions (0035)
  const EPIGRAPH_MAX = 1000;                     // 0035 book_part_drafts_guard ("part_too_long")
  const PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const BOX = (on) => `<span class="wr-pm-box${on ? ' is-on' : ''}" aria-hidden="true">${on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}</span>`;

  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const isText = (kind) => !FIXED.includes(kind);
  const nameOf = (kind) => NAMES[kind] || 'Book part';
  const whereOf = (kind) => `${FRONT.includes(kind) ? 'Front of the book' : 'Back of the book'} · Book part`;

  function create(host) {
    let load = { state: 'idle' };   // idle | loading | ready | off (no 0035) | error
    let data = null;                // book_parts_json
    let menu = null;                // { el, err }
    let busy = '';                  // the kind being switched

    const list = () => (data ? data.parts : []);
    const byId = (id) => list().find((p) => p.id === id) || null;
    const byKind = (kind) => list().find((p) => p.kind === kind) || null;
    const shown = () => load.state === 'ready';
    const books = () => (data ? (data.also_by || []).filter((e) => e.valid !== false).length : 0);

    async function read(bookId) {
      if (load.state !== 'ready') load = { state: 'loading' };
      let res;
      try { res = await kdp.parts.json(bookId); } catch (err) { res = { error: err }; }
      if (res.error) {
        const e = res.error;
        // Before 0035: no function (PGRST202, 404) or no parts. The list simply has no parts.
        if (e.notFound || e.code === 'PGRST202' || e.code === '42883') { data = null; load = { state: 'off' }; }
        else if (load.state !== 'ready') load = { state: 'error' };
        return false;
      }
      data = res.data;
      data.parts = data.parts.filter((p) => p && KINDS.includes(p.kind));
      load = { state: 'ready' };
      return true;
    }

    /** A part's pill (79): Fixed, N books, Empty (dashed), Draft, Final. */
    function pill(p, words) {
      if (p.kind === 'review_request') return '<span class="wr-pill">Fixed</span>';
      if (p.kind === 'also_by') { const n = books(); return `<span class="wr-pill">${fmt(n)} ${n === 1 ? 'book' : 'books'}</span>`; }
      if (!words) return '<span class="wr-pill is-not_started">Empty</span>';
      return p.status === 'final' ? '<span class="wr-pill is-final">Final</span>' : '<span class="wr-pill">Draft</span>';
    }

    /** The FRONT or BACK group, only parts that are on. words(p): the words written now (the open draft counts). */
    function groupHtml(side, curId, words) {
      if (!shown()) return '';
      const rows = list().filter((p) => p.enabled && FRONT.includes(p.kind) === (side === 'front'));
      if (!rows.length) return '';
      return `<li class="wr-ms-group"><span class="chip-label" id="wrParts-${side}">BOOK PARTS · ${side === 'front' ? 'FRONT' : 'BACK'}</span>
          <ul class="wr-ms-secs wr-ms-parts" aria-labelledby="wrParts-${side}">${rows.map((p) => `<li>
            <button type="button" class="wr-ms-sec is-top" data-part="${p.id}"${curId === p.id ? ' aria-current="true"' : ''}>
              <span class="wr-ms-name">${esc(nameOf(p.kind))}</span><span class="wr-ms-pills">${pill(p, words(p))}</span>
            </button></li>`).join('')}</ul></li>`;
    }

    /** The button at the end of the list, or the load error with Try again. */
    function addHtml() {
      if (load.state === 'error') {
        return `<div class="alert alert-error wr-ms-err" role="alert">${ICON.x(16)}<div><p class="alert-text">We couldn’t load the book parts.</p>
            <p class="alert-text"><button type="button" class="btn btn-secondary btn-sm" data-parts-retry>Try again</button></p></div></div>`;
      }
      if (!shown()) return '';
      return `<button type="button" class="btn btn-secondary wr-ms-wide wr-ms-add" data-parts-add aria-haspopup="menu" aria-expanded="${menu ? 'true' : 'false'}" aria-controls="wrPartsMenu">${PLUS}Add a book part</button>`;
    }

    /* ── The menu (79) ─────────────────────── */

    const anchor = () => { const e = host.els(); return e ? e.ms.querySelector('[data-parts-add]') : null; };

    function rowHtml(kind) {
      const p = byKind(kind);
      if (!p) return '';
      return `<button type="button" class="wr-pm-row" role="menuitemcheckbox" aria-checked="${p.enabled}" tabindex="-1" data-pm-kind="${kind}"${busy ? ' aria-disabled="true"' : ''}>
          ${BOX(p.enabled)}<span class="wr-pm-name">${esc(nameOf(kind))}</span>${SIDE[kind] ? `<span class="wr-pm-side">${esc(SIDE[kind])}</span>` : ''}</button>`;
    }

    function menuHtml() {
      return `<div class="wr-pm-head"><strong id="wrPartsMenuTitle">Book parts</strong><p>Turn a part on or off. These are the same switches as in 08 Format.</p></div>
        <div class="wr-pm-group" role="group" aria-labelledby="wrPmFront"><div class="chip-label" id="wrPmFront">FRONT OF THE BOOK</div>${FRONT.map(rowHtml).join('')}</div>
        <div class="wr-pm-group" role="group" aria-labelledby="wrPmBack"><div class="chip-label" id="wrPmBack">BACK OF THE BOOK</div>${KINDS.filter((k) => !FRONT.includes(k)).map(rowHtml).join('')}</div>
        ${menu && menu.err ? `<p class="wr-pm-err" role="alert">${ICON.x(14)}<span>${esc(menu.err)}</span></p>` : ''}
        <p class="wr-pm-note">Turning a part off keeps its text. Title page, copyright and contents are set in 08.</p>`;
    }

    function place() {
      const a = anchor();
      if (!menu || !a) return;
      const r = a.getBoundingClientRect();
      const m = menu.el;
      const gap = 8;
      const w = m.offsetWidth, h = m.offsetHeight;
      let left = r.right + gap;
      if (left + w > window.innerWidth - gap) left = Math.max(gap, Math.min(r.left, window.innerWidth - w - gap));
      let top = Math.min(r.bottom - h, window.innerHeight - h - gap);
      if (left < r.right && left + w > r.left) top = r.top - h - gap;   // no room beside: above the button
      m.style.left = `${Math.round(left)}px`;
      m.style.top = `${Math.round(Math.max(gap, top))}px`;
    }

    function paint(focusKind) {
      if (!menu) return;
      const at = focusKind || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pmKind : null);
      menu.el.innerHTML = menuHtml();
      const items = [...menu.el.querySelectorAll('[role="menuitemcheckbox"]')];
      const i = Math.max(0, items.findIndex((b) => b.dataset.pmKind === at));
      if (items[i]) { items[i].tabIndex = 0; if (at || focusKind === undefined) items[i].focus(); }
      place();
    }

    function openMenu() {
      if (menu || !shown()) return;
      const e = host.els();
      if (!e) return;
      const el = document.createElement('div');
      el.className = 'wr-pm';
      el.id = 'wrPartsMenu';
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-labelledby', 'wrPartsMenuTitle');
      e.root.appendChild(el);
      menu = { el, err: '' };
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', place);
      const a = anchor();
      if (a) a.setAttribute('aria-expanded', 'true');
      paint(KINDS[0]);
    }

    function closeMenu(focusButton) {
      if (!menu) return;
      menu.el.remove();
      menu = null;
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', place);
      const a = anchor();
      if (a) { a.setAttribute('aria-expanded', 'false'); if (focusButton) a.focus(); }
    }

    function outside(e) {
      if (!menu || menu.el.contains(e.target)) return;
      const a = anchor();
      if (a && a.contains(e.target)) return;   // the button's own click closes it
      closeMenu(false);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
      if (e.key === 'Tab') { closeMenu(false); return; }
      const items = [...menu.el.querySelectorAll('[role="menuitemcheckbox"]')];
      const i = items.indexOf(document.activeElement);
      let j = -1;
      if (e.key === 'ArrowDown') j = (i + 1) % items.length;
      else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j < 0) return;
      e.preventDefault();
      items.forEach((b) => { b.tabIndex = -1; });
      items[j].tabIndex = 0;
      items[j].focus();
    }

    function onClick(e) {
      const b = e.target.closest('[data-pm-kind]');
      if (!b || busy) return;
      toggle(b.dataset.pmKind);
    }

    /** Ticks or unticks a part (book_parts.enabled). On: the menu closes and its editor opens (Q-P4). */
    async function toggle(kind, fromEditor) {
      const p = byKind(kind);
      if (!p || busy) return false;
      const on = !p.enabled;
      // Off while it is open: its typing becomes a version first (nothing is lost), then another place opens.
      if (!on && host.isOpen(p.id) && !(await host.leave())) return false;
      busy = kind;
      if (menu) { menu.err = ''; paint(kind); }
      let res;
      try { res = await kdp.parts.set(p.id, { enabled: on }); } catch (err) { res = { error: err }; }
      busy = '';
      if (res.error) {
        const text = `We couldn’t turn ${nameOf(kind).toLowerCase()} ${on ? 'on' : 'off'}. Try again.`;
        if (menu) { menu.err = text; paint(kind); } else host.error(text);
        return false;
      }
      p.enabled = on;
      host.changed();
      if (on) {
        closeMenu(false);
        await host.open(p.id);
        host.announce(`${nameOf(kind)} is on.`);
        return true;
      }
      if (host.isOpen(p.id)) await host.closed(p.id, fromEditor);
      if (menu) paint(kind);
      host.announce(`${nameOf(kind)} is off. Its text is kept.`);
      return true;
    }

    /* ── The part head (80, 81) and the fixed pages ── */

    /** The review request page (81): the fixed words with the title and the pen name filled in. */
    function reviewHtml(book) {
      const R = kdpExportRules.REVIEW;
      const title = String(book.title || '').trim() || 'Untitled book';
      const pen = String(((Array.isArray(book.pen_names) ? book.pen_names[0] : book.pen_names) || {}).name || '').trim();
      return `<div class="wr-card wr-fixed">
          <div class="wr-fixed-page" aria-label="Review request page, fixed text">
            <h3>${esc(R.title)}</h3>
            <p>${esc(R.thanks)} <em>${esc(title)}</em>.</p>
            <p>${esc(R.body)}</p>
            ${pen ? `<p>${esc(pen)}</p>` : ''}
          </div>
        </div>
        <p class="help-note wr-fixed-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span>The book title and the pen name fill in by themselves. The words stay fixed so the page follows Amazon’s review rules: an honest review, no rewards, no asking for a good review only.</span></p>`;
    }

    /** Also by, until its editor (design 82, E17 Part 5): the titles in the list, read only. */
    function alsoByHtml() {
      const rows = data ? (data.also_by || []).filter((e) => e.valid !== false && e.title) : [];
      return `<div class="wr-card wr-fixed"><div class="wr-fixed-page">
          ${rows.length ? `<ul class="wr-fixed-list">${rows.map((e) => `<li><em>${esc(e.title)}</em></li>`).join('')}</ul>` : '<p class="wr-soon">No books in this list yet.</p>'}
        </div></div>`;
    }

    return {
      read, shown, state: () => load.state, byId, byKind, list, isText, nameOf, whereOf, hint: (k) => HINTS[k] || '',
      groupHtml, addHtml, openMenu, closeMenu, menuOpen: () => !!menu, toggle, reviewHtml, alsoByHtml,
      EPIGRAPH_MAX
    };
  }

  window.kdpWriteParts = { create, KINDS, FRONT, NAMES };
})();
