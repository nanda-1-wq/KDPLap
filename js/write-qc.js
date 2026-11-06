/* ═══════════════════════════════════════════════════
   NicheInk · Step 06 opened from Quality Control (design 56, plan section 6.1)
   /js/write-qc.js   (used by js/book-write.js; needs js/markdown-lite.js)

   "Open in 06" on 07 starts a QC session: one group, its open issues that open
   in 06, and an index. While it lasts, a bar sits above the 06 columns
   (data-qc-bar in app/book.html, outside the live content area, so it is said
   once) and the issue's place in the text is marked.

   The mark: the CSS Custom Highlight API, ::highlight(qc-spot) (V4). Where the
   API is missing, the selection, as "Show" does. Offsets hold when the editor
   shows the very version the run read. Otherwise the quote is searched, and the
   place nearest the old one wins. Not found: "This spot changed. It may be
   fixed." An issue with no place in the text marks nothing.

   The bar never edits text. Editing works as usual under it. Previous and Next
   stay inside the group (Q13) and follow 06's own leave and save rules, so a
   refused leave keeps the issue. The session ends on any step change (the
   step's leave()). A reload keeps the section, through ?section=, not the bar.

   js/book-qc.js owns the session object and reads it back: index for the row to
   focus, back = true while Back to Quality Control opens 07.

   kdpWriteQc.create(host) → { start, setSpot, arrive, paint, render, end, on }
     host: els, cur, active, editor, announce, sectionOf(item), moveTo(id), go(n)
═══════════════════════════════════════════════════ */

(function () {
  const NAME = 'qc-spot';
  const CHANGED = 'This spot changed. It may be fixed.';

  const icon = (size, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const WARN = (s) => icon(s, '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>');
  const CHEV = icon(14, '<path d="M15 6l-6 6 6 6"/>');

  /** The offset of quote nearest to near, or -1. */
  function nearest(md, quote, near) {
    let best = -1;
    for (let i = md.indexOf(quote); i >= 0; i = md.indexOf(quote, i + 1)) {
      if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
    }
    return best;
  }

  /** Scrolls the boxes around the range (the page too on a phone), only when it is out of view. */
  function reveal(range, from) {
    const rect = () => range.getClientRects()[0] || range.getBoundingClientRect();
    for (let n = from; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o !== 'auto' && o !== 'scroll') || n.scrollHeight <= n.clientHeight) continue;
      const box = n.getBoundingClientRect(), r = rect();
      if (r.top < box.top || r.bottom > box.bottom) n.scrollTop += r.top - box.top - box.height / 3;
    }
    const r = rect();
    if (r.top < 0 || r.bottom > window.innerHeight) window.scrollBy(0, r.top - window.innerHeight / 3);
  }

  function create(host) {
    let s = null;        // the session (from js/book-qc.js)
    let spot = null;     // the issue on show: { sectionId, start, end, versionId, quote }
    let fresh = false;   // the next paint scrolls to it
    let lost = false;    // it was looked for and not found
    let moving = null;   // Previous or Next is on its way: the leave, then the section
    let said = '';       // what the live region said last

    const barEl = () => document.querySelector('[data-qc-bar]');
    const marks = () => (window.CSS && CSS.highlights) || null;
    const clearMark = () => { const m = marks(); if (m) m.delete(NAME); };
    const item = () => s.items[s.index];

    function spotOf(x) {
      const p = x.spot || {};
      return { sectionId: host.sectionOf(x), start: p.start == null ? null : p.start, end: p.end == null ? null : p.end, versionId: p.versionId || null, quote: x.quote || '' };
    }

    function setSpot(x) {
      spot = spotOf(x);
      fresh = true;
      lost = false;
      return spot.sectionId;
    }

    /** Where the spot is in the editor's Markdown today, or null. */
    function find(map, c, x) {
      const sameText = x.versionId === c.base && c.text === c.savedText;
      if (sameText && x.start != null && map.md.startsWith(x.quote, x.start)) return { start: x.start, end: x.end };
      if (!x.quote) return null;
      const at = nearest(map.md, x.quote, x.start || 0);
      return at < 0 ? null : { start: at, end: at + x.quote.length };
    }

    /** The mark stops before a "Verify" pill (design 56): the sentence, not the pill. */
    function beforePill(md, at) {
      const t = md.slice(at.start, at.end).trimEnd();
      const words = t.endsWith(kdpMarkdown.FLAG) ? t.slice(0, -kdpMarkdown.FLAG.length).trimEnd() : '';
      return words ? { start: at.start, end: at.start + words.length } : at;
    }

    function rangeOf(ed, c, x) {
      const map = kdpMarkdown.fromDomMap(ed);
      const found = find(map, c, x);
      const at = found && beforePill(map.md, found);
      const p = at && map.domPoint(at.start, 'start'), q = at && map.domPoint(at.end, 'end');
      if (!p || !q) return null;
      try {
        const r = document.createRange();
        r.setStart(p.node, p.offset);
        r.setEnd(q.node, q.offset);
        return r;
      } catch (err) { return null; }
    }

    function show(range, ed, scroll) {
      if (window.Highlight && marks()) marks().set(NAME, new window.Highlight(range));
      else if (scroll) {
        // No Highlight API (R4): the selection, as "Show" does. Only on arrival: it takes the focus.
        ed.focus({ preventScroll: true });
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    /** The editor was built, or the issue changed: mark the spot again. Scrolls once per arrival. */
    function paint() {
      clearMark();
      lost = false;
      const c = host.cur();
      const here = !!s && !!spot && !!c && c.state === 'ready' && c.id === spot.sectionId;
      const ed = here ? host.editor() : null;
      if (ed) {
        const scroll = fresh;
        fresh = false;
        if (spot.start != null || spot.quote) {
          const range = rangeOf(ed, c, spot);
          if (range) {
            show(range, ed, scroll);
            if (scroll) reveal(range, ed);
          } else lost = true;
        }
        const row = scroll && host.els().ms.querySelector('[aria-current="true"]');
        if (row) row.scrollIntoView({ block: 'nearest' });
      }
      render();
      if (ed) {
        const line = barText();
        if (line !== said) host.announce(said = line);
      }
    }

    const whereText = () => `From Quality Control · ${s.name}, issue ${s.index + 1} of ${s.items.length}.`;
    const barText = () => `${whereText()} ${item().message}${lost ? ` ${CHANGED}` : ''}`;

    function build(b) {
      b.innerHTML = `
        <span class="qc-wbar-icon">${WARN(18)}</span>
        <p class="qc-wbar-text"><strong data-qc-where></strong> <span data-qc-msg></span><span class="qc-wbar-lost" data-qc-lost hidden>${WARN(14)}<span>${CHANGED}</span></span></p>
        <div class="qc-wbar-btns">
          <button type="button" class="btn btn-secondary qc-wbar-btn" data-qc-prev>Previous issue</button>
          <button type="button" class="btn btn-secondary qc-wbar-btn" data-qc-next>Next issue</button>
          <button type="button" class="btn btn-primary qc-wbar-btn" data-qc-back>${CHEV}Back to Quality Control</button>
        </div>`;
      b.addEventListener('click', onClick);
    }

    /** The bar: shown on 06 while a session lasts. */
    function render() {
      const b = barEl();
      if (!b) return;
      b.hidden = !s || !host.active();
      if (b.hidden) return;
      if (!b.firstElementChild) build(b);
      b.querySelector('[data-qc-where]').textContent = whereText();
      b.querySelector('[data-qc-msg]').textContent = item().message;
      b.querySelector('[data-qc-lost]').hidden = !lost;
      b.querySelector('[data-qc-prev]').disabled = s.index === 0;
      b.querySelector('[data-qc-next]').disabled = s.index >= s.items.length - 1;
    }

    /** Previous or Next. A leave refused (Stay, or the text could not be saved) keeps the issue. */
    async function move(by, btn) {
      const to = s.index + by;
      if (moving || !s.items[to]) return;
      const was = { index: s.index, spot };
      s.index = to;
      const id = setSpot(item());
      render();
      moving = host.moveTo(id).catch(() => false);
      const ok = await moving;
      moving = null;
      if (!s) return;
      if (!ok) {
        s.index = was.index;
        spot = was.spot;
        fresh = false;
      }
      paint();
      if (btn.disabled) {
        const b = barEl();
        (b.querySelector('[data-qc-prev]:not(:disabled), [data-qc-next]:not(:disabled)') || b.querySelector('[data-qc-back]')).focus();
      }
    }

    /** Back to Quality Control: 07 reads back, then the leave ends the session. */
    async function back() {
      if (moving) await moving;   // a click during a slow save still counts
      if (!s) return;
      const was = s;
      was.back = true;
      try { await host.go(7); } finally { was.back = false; }
    }

    function onClick(e) {
      const t = e.target.closest('button');
      if (!t || t.disabled || !s) return;
      if (t.matches('[data-qc-prev]')) move(-1, t);
      else if (t.matches('[data-qc-next]')) move(1, t);
      else if (t.matches('[data-qc-back]')) back();
    }

    return {
      /** 07 "Open in 06": the group, its issues, the index, then the issue on show. */
      start(session) { s = session; said = ''; },
      setSpot,
      /** A section finished opening: its editor is new, so the spot scrolls into view again. */
      arrive(id) { if (s && spot && spot.sectionId === id) fresh = true; },
      paint,
      render,
      end() {
        s = null;
        spot = null;
        fresh = false;
        lost = false;
        clearMark();
        render();
      },
      on: () => !!s
    };
  }

  window.kdpWriteQc = { create };
})();
