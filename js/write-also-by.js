/* ═══════════════════════════════════════════════════
   NicheInk — Step 06 Write: the Also by page (E17 Part 5, designs 82 and 84)
   /js/write-also-by.js   (used by app/book.html, loaded before js/book-write.js)

   - "Your books in NicheInk with the pen name …": the user's other books with
     the same pen name (book_parts_json candidates + the ticked list), tick
     boxes, up/down arrow buttons on the ticked ones (44 px, gray at the ends).
   - "Books made outside NicheInk": Title (1 to 200, required), Subtitle
     (0 to 200, optional), Add book; each typed book has arrows and Remove.
   - "How it prints": "Also by {pen name}" and the titles only (B1, Q-10).
   - The print order is the ticked books, then the typed books, each in its
     own order. Every change saves the whole list in one call (set_also_by).
     Ticks that are no longer valid (the pen name changed) are hidden and
     sent back as they are, so they return if the pen name changes back.
   - 84: no other books with this pen name: plain words, the form stays.
   - Every typed title is shown as text (esc), never as HTML.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;

  const MAX = 20;          // 0035 set_also_by c_max_entries
  const TITLE_MAX = 200;   // c_max_title
  const SUB_MAX = 200;     // c_max_subtitle
  const ARROW = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d === 'up' ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'}"/></svg>`;
  const PLUS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const SPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;   // as the SQL btrim set
  const trim = (s) => String(s || '').replace(SPACE, '');

  /**
   * host: { data() → book_parts_json (or null), book() → the book row, announce(text), changed() }.
   * The list lives in data().also_by and data().candidates; this module writes both after a save.
   */
  function create(host) {
    let el = null;                                    // the mounted [data-ab] card
    let busy = false;
    let err = null;                                   // { text, retry: entries | null }
    let form = { title: '', subtitle: '', error: '' };

    const D = () => host.data() || { also_by: [], candidates: [] };
    const pen = () => {
      const b = host.book() || {};
      return String(((Array.isArray(b.pen_names) ? b.pen_names[0] : b.pen_names) || {}).name || '').trim();
    };
    const entries = () => D().also_by || [];
    const ticked = () => entries().filter((e) => e.book_id && e.valid !== false);
    const hidden = () => entries().filter((e) => e.book_id && e.valid === false);
    const typed = () => entries().filter((e) => !e.book_id);
    const candidates = () => D().candidates || [];
    const printed = () => [...ticked(), ...typed()].filter((e) => trim(e.title));
    const full = () => entries().length >= MAX;

    /** The list to send: ticked books, then the hidden old ticks, then the typed books. */
    function payload(t, ty) {
      return [
        ...t.map((e) => ({ book_id: e.book_id })),
        ...hidden().map((e) => ({ book_id: e.book_id })),
        ...ty.map((e) => ({ title: e.title, subtitle: e.subtitle || null }))
      ];
    }

    /* ── HTML ─────────────────────────────── */

    function moves(group, i, n, name) {
      const btn = (dir, off) => `<button type="button" class="btn btn-secondary wr-ab-move" data-ab-move="${dir}" data-ab-group="${group}" data-ab-i="${i}"
          aria-label="Move ${esc(name)} ${dir}"${off ? ' aria-disabled="true"' : ''}>${ARROW(dir)}</button>`;
      return `<span class="wr-ab-moves">${btn('up', i === 0)}${btn('down', i === n - 1)}</span>`;
    }

    function bookText(e) {
      const title = trim(e.title) || 'Untitled book';
      return `<span class="wr-ab-text"><span class="wr-ab-title">${esc(title)}</span>${trim(e.subtitle) ? `<span class="wr-ab-subtitle">${esc(e.subtitle)}</span>` : ''}</span>`;
    }

    function appsHtml(p) {
      const t = ticked();
      const c = candidates();
      if (!t.length && !c.length) {
        return `<div class="wr-ab-empty" data-ab-empty>
            <p class="wr-ab-empty-title">${p ? `No other books with the pen name ${esc(p)} yet.` : 'No other books with this pen name yet.'}</p>
            <p>Add a book made outside NicheInk below, or turn Also by off. While nothing is ticked, the page is left out of the files.</p></div>`;
      }
      const row = (e, on, i) => {
        const id = on ? e.book_id : e.id;
        const name = trim(e.title) || 'Untitled book';
        const stop = !on && full();
        return `<li class="wr-ab-row">
            <label class="wr-ab-tick"><input type="checkbox" data-ab-tick="${esc(id)}"${on ? ' checked' : ''}${stop ? ' aria-disabled="true" aria-describedby="wrAbFull"' : ''}>${bookText(e)}</label>
            ${on ? moves('app', i, t.length, name) : ''}</li>`;
      };
      return `<ul class="wr-ab-list" aria-labelledby="wrAbMine">${t.map((e, i) => row(e, true, i)).join('')}${c.map((e) => row(e, false, -1)).join('')}</ul>`;
    }

    function typedHtml() {
      const ty = typed();
      if (!ty.length) return '';
      return `<ul class="wr-ab-list wr-ab-typed" aria-label="Books you typed">${ty.map((e, i) => {
        const name = trim(e.title) || 'Untitled book';
        return `<li class="wr-ab-row">${bookText(e)}${moves('typed', i, ty.length, name)}
            <button type="button" class="btn btn-secondary wr-ab-remove" data-ab-remove="${i}" aria-label="Remove ${esc(name)}">Remove</button></li>`;
      }).join('')}</ul>`;
    }

    function formHtml() {
      const stop = full();
      const bad = !!form.error;
      return `<form class="wr-ab-form" data-ab-form novalidate>
          <div class="field">
            <label for="wrAbTitle">Title</label>
            <input id="wrAbTitle" class="text-input" type="text" maxlength="${TITLE_MAX}" placeholder="Book title" autocomplete="off" value="${esc(form.title)}"
              ${bad ? 'aria-invalid="true" aria-describedby="wrAbTitleErr"' : ''}>
            ${bad ? `<p class="field-error" id="wrAbTitleErr">${ICON.x(14)}<span>${esc(form.error)}</span></p>` : ''}
          </div>
          <div class="field">
            <label for="wrAbSub">Subtitle (optional)</label>
            <input id="wrAbSub" class="text-input" type="text" maxlength="${SUB_MAX}" placeholder="Subtitle" autocomplete="off" value="${esc(form.subtitle)}">
          </div>
          <div><button type="submit" class="btn btn-secondary" data-ab-add${stop ? ' aria-disabled="true" aria-describedby="wrAbFull"' : ''}>${PLUS}Add book</button></div>
        </form>`;
    }

    function previewHtml(p) {
      const rows = printed();
      return `<div class="wr-ab-paper"><div class="wr-ab-page" role="img" aria-label="${esc(rows.length ? `Print preview: Also by ${p}, ${rows.length} ${rows.length === 1 ? 'title' : 'titles'}` : 'Print preview: the page is left out')}">
          ${rows.length ? `<p class="wr-ab-ph">Also by ${esc(p)}</p><ul class="wr-ab-titles">${rows.map((e) => `<li>${esc(trim(e.title))}</li>`).join('')}</ul>`
            : '<p class="wr-ab-none">Tick a book or add one. Until then this page is left out of the files.</p>'}
        </div></div>`;
    }

    function inner() {
      const p = pen();
      return `<div class="wr-ab-main">
          <section class="wr-ab-sec">
            <h3 id="wrAbMine">${p ? `Your books in NicheInk with the pen name ${esc(p)}` : 'Your books in NicheInk with this pen name'}</h3>
            <p class="wr-ab-help">Tick the books that are published on Amazon. A completed book is not always a published one.</p>
            ${appsHtml(p)}
          </section>
          <section class="wr-ab-sec wr-ab-out">
            <h3 id="wrAbOut">Books made outside NicheInk</h3>
            <p class="wr-ab-help">Type the title exactly as it is on Amazon.</p>
            ${typedHtml()}
            ${formHtml()}
            ${full() ? `<p class="help-note wr-ab-full" id="wrAbFull">Also by lists at most ${MAX} books. Remove one to add another.</p>` : ''}
          </section>
          ${err ? `<div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">${esc(err.text)}</p>${err.retry ? '<p class="alert-text"><button type="button" class="link-btn" data-ab-retry>Try again</button></p>' : ''}</div></div>` : ''}
          <p class="sr-only" role="status" data-ab-status>${busy ? 'Saving…' : ''}</p>
        </div>
        <aside class="wr-ab-side" aria-labelledby="wrAbPrint">
          <h3 id="wrAbPrint">How it prints</h3>
          <p class="wr-ab-help">Titles only. No links.</p>
          ${previewHtml(p)}
        </aside>`;
    }

    function html() {
      return `<div class="wr-card wr-ab" data-ab${busy ? ' aria-busy="true"' : ''}>${inner()}</div>`;
    }

    /* ── Saving ───────────────────────────── */

    /** Repaints the card and puts the focus back on the same control (by selector). */
    function paint(focusSel) {
      if (!el || !document.contains(el)) return;
      const at = focusSel || null;
      el.innerHTML = inner();
      if (busy) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
      if (at) {
        const f = el.querySelector(at);
        if (f) f.focus();
      }
    }

    async function save(list, focusSel, say) {
      if (busy) return false;
      const bookId = (host.book() || {}).id;
      busy = true;
      err = null;
      paint(focusSel);
      let res;
      try { res = await kdp.parts.setAlsoBy(bookId, list); } catch (e) { res = { error: e }; }
      busy = false;
      if (res.error || !Array.isArray(res.data)) {
        const e = res.error || {};
        const m = e.message;
        if (m === 'also_by_bad' && e.details) err = { text: e.details, retry: null };
        else if (m === 'also_by_not_allowed') err = { text: 'Also by lists only your other books with the same pen name.', retry: null };
        else if (m === 'book_not_found' || e.code === 'P0002') err = { text: 'We couldn’t find this book. Reload the page.', retry: null };
        else err = { text: 'We couldn’t save the Also by list. Check your connection.', retry: list };
        paint(focusSel);
        return false;
      }
      // The books that are no longer ticked go back to the candidates (in the same place they were shown).
      const d = D();
      const nowOn = new Set(res.data.filter((e) => e.book_id).map((e) => e.book_id));
      const before = [...ticked().map((e) => ({ id: e.book_id, title: e.title, subtitle: e.subtitle })), ...candidates()];
      d.candidates = before.filter((c) => !nowOn.has(c.id));
      d.also_by = res.data;
      host.changed();
      paint(focusSel);
      if (say) host.announce(say);
      return true;
    }

    function move(group, i, dir) {
      const t = ticked().slice();
      const ty = typed().slice();
      const arr = group === 'app' ? t : ty;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const name = trim(arr[j].title) || 'Untitled book';
      save(payload(t, ty), `[data-ab-group="${group}"][data-ab-i="${j}"][data-ab-move="${dir}"]`, `${name} moved ${dir}. Now ${j + 1} of ${arr.length}.`);
    }

    function tick(id, on) {
      const t = ticked().slice();
      if (on) {
        if (full()) return;
        const c = candidates().find((x) => x.id === id);
        if (!c) return;
        t.push({ book_id: c.id, title: c.title, subtitle: c.subtitle });
      } else {
        const i = t.findIndex((e) => e.book_id === id);
        if (i < 0) return;
        t.splice(i, 1);
      }
      const name = trim(((on ? candidates().find((x) => x.id === id) : entries().find((e) => e.book_id === id)) || {}).title) || 'The book';
      save(payload(t, typed()), `[data-ab-tick="${CSS.escape(id)}"]`, on ? `${name} is in the list.` : `${name} is out of the list.`);
    }

    async function add() {
      if (busy || full()) return;
      const title = trim(form.title);
      const sub = trim(form.subtitle);
      if (!title) { form.error = 'Type the book title.'; paint('#wrAbTitle'); return; }
      if (title.length > TITLE_MAX) { form.error = `A title has at most ${TITLE_MAX} characters.`; paint('#wrAbTitle'); return; }
      form.error = '';
      const ty = [...typed(), { title, subtitle: sub ? sub.slice(0, SUB_MAX) : null }];
      const kept = { ...form };
      // Cleared at once, so a second Enter does not add the book twice; put back if the save fails.
      form = { title: '', subtitle: '', error: '' };
      const ok = await save(payload(ticked(), ty), '#wrAbTitle', `${title} is added.`);
      if (!ok) { form = kept; paint('#wrAbTitle'); }
    }

    function remove(i) {
      const ty = typed().slice();
      const gone = ty.splice(i, 1)[0];
      if (!gone) return;
      const name = trim(gone.title) || 'The book';
      // The focus goes to the next row's Remove, or the Title box when none is left.
      const next = ty.length ? `[data-ab-remove="${Math.min(i, ty.length - 1)}"]` : '#wrAbTitle';
      save(payload(ticked(), ty), next, `${name} is removed.`);
    }

    /* ── Events ───────────────────────────── */

    function onClick(e) {
      const t = e.target.closest('button, input[type="checkbox"]');
      if (!t || !el.contains(t)) return;
      if (t.matches('[data-ab-tick]')) {
        // aria-disabled (the list is full) or saving: the box does not change.
        if (busy || t.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
        tick(t.dataset.abTick, t.checked);
        return;
      }
      if (t.getAttribute('aria-disabled') === 'true' || busy) { e.preventDefault(); return; }
      if (t.dataset.abMove) { move(t.dataset.abGroup, Number(t.dataset.abI), t.dataset.abMove); return; }
      if (t.dataset.abRemove !== undefined) { remove(Number(t.dataset.abRemove)); return; }
      if (t.hasAttribute('data-ab-retry') && err && err.retry) { save(err.retry, null, 'The Also by list is saved.'); }
    }

    function onInput(e) {
      if (e.target.id === 'wrAbTitle') {
        form.title = e.target.value;
        if (form.error && trim(form.title)) {
          form.error = '';
          e.target.removeAttribute('aria-invalid');
          e.target.removeAttribute('aria-describedby');
          const m = el.querySelector('#wrAbTitleErr');
          if (m) m.remove();
        }
      } else if (e.target.id === 'wrAbSub') form.subtitle = e.target.value;
    }

    function onSubmit(e) {
      if (!e.target.matches('[data-ab-form]')) return;
      e.preventDefault();
      add();
    }

    /** After the main area is drawn: binds the card. A new book or a reload starts with an empty form. */
    function mount(node) {
      el = node;
      if (!el) return;
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('submit', onSubmit);
    }

    /** Another book or part: the typed form and errors start fresh. */
    function reset() { form = { title: '', subtitle: '', error: '' }; err = null; busy = false; }

    return { html, mount, reset, count: () => printed().length };
  }

  window.kdpWriteAlsoBy = { create, MAX, TITLE_MAX, SUB_MAX };
})();
