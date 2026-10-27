/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write: the Improve menu (E10.3, designs 22, 22b, 23)
   /js/write-improve.js   (used by js/book-write.js, loaded before it;
                           tested by tests/browser/write/t-improve.js)

   The writer selects text. A small "Improve" button shows below the end of
   the selection (and an "Improve" button sits in the toolbar for keyboard
   users). Either opens the menu. Opening it snaps the selection to whole
   sentences (js/sentences.js, the server's rule) through the editor's map
   (kdpMarkdown.fromDomMap), so Bold or Italic on a single word still work.
   The server returns a SUGGESTION, never a version: the card under the
   section head shows a word diff and notes. Accept saves typed text as a
   manual version first (when there is any), then apply_suggestion saves the
   AI text as a new version (source = the action) and the editor text is
   replaced in one undo step. Reject writes nothing.

   Limits (same as generate/lib/limits.ts IMPROVE and 0021; tests/limits-parity):
   3 to 1,500 words, Expand up to 1,000, at most 15,000 characters, a Custom
   instruction of 1 to 300 characters.

   const imp = kdpWriteImprove.create(host)   host: see book-write.js
   imp.toolbarHtml() · imp.render() · imp.refresh() · imp.onInput()
   imp.busy() (loading, open or applying) · imp.genWhy() · imp.confirmLeave()
   imp.reset() · imp.sectionId()
   imp.openFor(start, end, { ask }) (E10.4 "Fix with Improve", G5 "Fix"):
     selects that Markdown range of the section in the editor and opens the
     menu at the toolbar's Improve button. With ask (design 22d, 5): straight
     on Custom, the box pre-filled and editable; Back goes to the action menu,
     Esc closes. No AI call until the writer sends. Returns '' when the menu
     opened, else why not ('missing' when the range is gone).
   imp.offText() → Improve's own off reason as words, or ''.

   Fix major (PRODUCE G5, design 22d, 6 to 10): a queue of major findings,
   one at a time, each as a normal Custom suggestion pre-filled with the
   finding (Send / Skip / Stop, then Accept / Reject / Stop). Before each item
   our code looks for its exact quote in the text; when it is gone the item
   is skipped (no call). The editor is read only only while a call runs. No
   re-check between items.
   imp.queueStart(items) items: [{ i, type, message, quote }]; '' or why not
   imp.queue() → { sid, state, k, items } or null · imp.queueRemove(i)
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const MD = kdpMarkdown;
  const W = kdpWords;
  const S = kdpSentences;

  const LIMITS = { minWords: 3, maxWords: 1500, expandMaxWords: 1000, selectionChars: 15000, instructionChars: 300 };
  // [action, menu name, subtitle, version name (as js/book-write.js SOURCE_NAME), loading verb]
  const ACTIONS = [
    ['edit_format', 'Edit and format', 'Grammar and readability', 'Edited', 'Editing'],
    ['improve', 'Improve', 'Clearer wording, same meaning', 'Improved', 'Improving'],
    ['expand', 'Expand', 'Add detail or an example', 'Expanded', 'Expanding'],
    ['shorten', 'Shorten', 'Cut filler words', 'Shortened', 'Shortening'],
    ['humanize', 'Humanize', 'Natural reading in your voice', 'Humanized', 'Humanizing'],
    ['custom', 'Custom instruction', 'Tell the AI what to change', 'Custom edit', 'Editing']
  ];
  const ACT = Object.fromEntries(ACTIONS.map(([k, name, sub, done, doing]) => [k, { name, sub, done, doing }]));
  const HIGHLIGHT = 'kdp-improve';
  const PILL = '';   // the source flag as one token in the diff

  const svg = (size, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const SPARKLE = (s = 16) => svg(s, '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>');
  const INFO = (s = 16) => svg(s, '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  const LOCK = (s = 16) => svg(s, '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>');
  const COPY = (s = 16) => svg(s, '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>');

  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

  function create(host) {
    /**
     * The suggestion of the open section, one at a time:
     * { sid, state: 'loading' | 'review' | 'applying' | 'nochange' | 'stopped' | 'error' | 'changed',
     *   action, instruction, at, selection, sentences, body, abort, token,
     *   result: { suggestionId, text, words, flagged, notes }, error: { title, line, retry } }
     */
    let imp = null;
    let token = 0;
    /**
     * The Fix major queue of one section (design 22d):
     * { sid, state: 'item' | 'call' | 'failed' | 'end', k (the item open now), ask,
     *   items: [{ i, type, message, quote, status: 'waiting' | 'now' | 'accepted' | 'rejected'
     *            | 'skipped' | 'nochange' | 'failed' | 'notsent' | 'stopped', why,
     *            skip: '' | 'gone' (its quote is not in the text) | 'short' | 'long' }],
     *   error: { line, sub, retry, kind } ('failed', or 'end' after a refusal),
     *   end: { kind: 'done' | 'refused', midCall } }
     */
    let fq = null;
    let menu = null;          // { el, anchor, pick, custom, fix }
    let lastRange = null;     // the editor's last selection (the toolbar button uses it)
    let pointerDown = false;
    let boundEditor = null;

    const els = () => host.els();
    const cur = () => host.cur();
    const editor = () => (els() ? els().main.querySelector('[data-editor]') : null);
    const card = () => (els() ? els().main.querySelector('.wr-card') : null);
    const mine = () => !!imp && !!cur() && imp.sid === cur().id;
    const busy = () => mine() && (imp.state === 'loading' || imp.state === 'review' || imp.state === 'applying');
    /** A Fix major queue of the open section that has not ended. */
    const queueOn = () => !!fq && !!cur() && fq.sid === cur().id && fq.state !== 'end';
    /** The queue's card shows (also its end card, until Close). */
    const queueMine = () => !!fq && !!cur() && fq.sid === cur().id;
    /** The queue item the call or the open card is for. */
    const inQueue = () => queueOn() && fq.state === 'call';
    /** Why Accept waits ('' when it can go). An unlocked positioning does not stop it (the version gets Needs review). */
    const acceptWhy = () => { const w = host.why(); return w === 'positioning' || w === 'other_tab' ? '' : w; };

    /* ── Gates ─────────────────────────────── */

    /** Why Improve is off, or ''. */
    function offWhy() {
      const why = host.why();
      if (why) return why;
      if (queueOn()) return 'queue';
      if (busy()) return 'open';
      return '';
    }
    const WHY_TEXT = {
      positioning: 'Lock the positioning in 03 to use Improve.',
      gen_here: 'Wait for the section to finish writing.',
      other_tab: 'This section is being written in another tab or window.',
      conflict: 'Choose which text to keep first.',
      open: 'Accept or reject the suggestion first.',
      queue: 'Finish or stop Fix major first.',
      loading: 'Improve turns on when the section is ready.'
    };

    /* ── Selection ─────────────────────────── */

    /** The editor's selection, clipped to the editor, or null (collapsed, outside, read only). */
    function editorRange() {
      const ed = editor();
      const sel = window.getSelection();
      if (!ed || !sel || !sel.rangeCount || ed.getAttribute('contenteditable') !== 'true') return null;
      const r = sel.getRangeAt(0);
      if (r.collapsed || !r.intersectsNode(ed)) return null;
      const c = r.cloneRange();
      if (!ed.contains(c.startContainer)) c.setStart(ed, 0);
      if (!ed.contains(c.endContainer)) c.setEnd(ed, ed.childNodes.length);
      if (c.collapsed || !c.toString().trim()) return null;
      return c;
    }

    function liveRange() {
      const r = editorRange();
      if (r) { lastRange = r; return r; }
      const ed = editor();
      if (lastRange && ed && ed.contains(lastRange.startContainer) && ed.contains(lastRange.endContainer) && !lastRange.collapsed && lastRange.toString().trim()) return lastRange;
      lastRange = null;
      return null;
    }

    /** The selection as a snapped passage: { start, end, text, sentences, words } in cur.text, or null. */
    function pickOf(range) {
      const ed = editor();
      const map = MD.fromDomMap(ed);
      if (map.md !== cur().text) host.sync();
      const a = map.mdOffset(range.startContainer, range.startOffset);
      const b = map.mdOffset(range.endContainer, range.endOffset);
      if (a === null || b === null) return null;
      const snap = S.snap(map.md, a, b);
      if (!snap) return null;
      // Show the whole sentences as the selection.
      const p = map.domPoint(snap.start, 'start'), q = map.domPoint(snap.end, 'end');
      if (p && q) {
        const r = document.createRange();
        try {
          r.setStart(p.node, p.offset);
          r.setEnd(q.node, q.offset);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          lastRange = r;
        } catch (err) { /* the old selection stays */ }
      }
      return { ...snap, words: W.count(snap.text) };
    }

    /** Where the passage is now: the recorded offset, else its only exact place, else -1. */
    function locate(md) {
      if (!imp) return -1;
      const t = imp.selection;
      if (md.slice(imp.at, imp.at + t.length) === t) return imp.at;
      const i = md.indexOf(t);
      if (i < 0 || md.indexOf(t, i + 1) >= 0) return -1;
      return i;
    }

    /** The passage highlighted while loading and reviewing (CSS Custom Highlight; none without it). */
    function paint() {
      const reg = window.CSS && CSS.highlights;
      if (!reg) return;
      reg.delete(HIGHLIGHT);
      const ed = editor();
      if (!ed || typeof Highlight !== 'function') return;
      let at = -1, len = 0;
      if (busy()) { at = locate(cur().text); len = imp.selection.length; }
      else if (queueOn() && fq.state === 'item') {
        // A queue item waiting for Send: its sentences, where they are now (design 22d, 7a).
        const x = itemPick(fq.items[fq.k]);
        if (x.pick) { at = x.pick.start; len = x.pick.end - x.pick.start; }
      }
      if (at < 0) return;
      const map = MD.fromDomMap(ed);
      if (map.md !== cur().text) return;
      const p = map.domPoint(at, 'start'), q = map.domPoint(at + len, 'end');
      if (!p || !q) return;
      try {
        const r = document.createRange();
        r.setStart(p.node, p.offset);
        r.setEnd(q.node, q.offset);
        reg.set(HIGHLIGHT, new Highlight(r));
      } catch (err) { /* no highlight */ }
    }

    /* ── Trigger: toolbar button, floating button ─ */

    function toolbarHtml() {
      return `<span class="wr-tool-sep" aria-hidden="true"></span>
        <button type="button" class="wr-tool wr-imp-btn" data-imp-open aria-haspopup="menu" aria-expanded="false" disabled aria-describedby="wrImpHint">${SPARKLE()}Improve</button>`;
    }

    /** The toolbar button, the hint under the toolbar and the floating button (reveal: the selection just changed). */
    function refresh(reveal) {
      const e = els();
      if (!e) return;
      const btn = e.main.querySelector('[data-imp-open]');
      const hint = e.main.querySelector('[data-imp-hint]');
      if (!btn || !hint) return;
      const why = offWhy();
      const range = why ? null : liveRange();
      btn.disabled = !!why || !range;
      btn.innerHTML = `${why === 'positioning' ? LOCK() : SPARKLE()}Improve`;
      btn.setAttribute('aria-expanded', menu && menu.anchor === btn ? 'true' : 'false');
      let text = '';
      if (why) text = esc(WHY_TEXT[why] || WHY_TEXT.loading) + (why === 'positioning' ? ` <a href="?id=${encodeURIComponent(host.book().id)}&step=3" data-go-step="3">Go to 03</a>` : '');
      else if (!range) text = 'Select text to improve it.';
      hint.hidden = !text;
      hint.innerHTML = text ? `${why === 'positioning' ? LOCK(16) : INFO(16)}<span>${text}</span>` : '';
      if (btn.disabled) btn.setAttribute('aria-describedby', 'wrImpHint'); else btn.removeAttribute('aria-describedby');
      placeFloat(why ? null : editorRange(), !!reveal);
    }

    function clearGap() {
      const ed = editor();
      if (ed) ed.querySelectorAll('.wr-imp-gap, .wr-imp-gap-top').forEach((n) => n.classList.remove('wr-imp-gap', 'wr-imp-gap-top'));
    }

    /** The block (p, h2, li) of the editor that holds a node. */
    function blockOf(node) {
      const ed = editor();
      let n = node.nodeType === 1 ? node : node.parentNode;
      let best = null;
      for (; n && n !== ed; n = n.parentNode) if (/^(P|H[1-6]|LI|DIV)$/.test(n.nodeName)) { best = n; if (n.nodeName === 'LI') break; }
      return best;
    }

    /** Scrolling boxes around the editor (the editor itself first). */
    function scrollers(ed) {
      const out = [ed];
      for (let n = ed.parentElement; n && n !== document.body; n = n.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(n).overflowY)) out.push(n);
      }
      out.push(document.scrollingElement || document.documentElement);
      return out;
    }

    /** The part of the editor that can be seen: its box cut by every scrolling box around it and the window. */
    function viewBox(ed) {
      const r = ed.getBoundingClientRect();
      let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, document.documentElement.clientHeight);
      for (const n of scrollers(ed).slice(1, -1)) {
        const b = n.getBoundingClientRect();
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      return { top, bottom, height: Math.max(0, bottom - top), left: r.left, right: r.right };
    }

    /** Scrolls by dy, the editor first, then the boxes around it. */
    function scrollBy(ed, dy) {
      let left = dy;
      for (const n of scrollers(ed)) {
        if (Math.abs(left) < 1) return;
        const before = n.scrollTop;
        n.scrollTop = before + left;
        left -= n.scrollTop - before;
      }
    }

    /**
     * The floating button: in a gap opened under the block where the selection
     * ends (or over the block where it starts, when only that fits), so it
     * covers no words. The selected text and the button stay fully inside the
     * editor's visible box: right after the selection changes (reveal), the
     * editor scrolls to make room; when nothing fits (a selection taller than
     * the editor), the button hides and the toolbar button stays.
     */
    function placeFloat(range, reveal) {
      const c = card();
      const ed = editor();
      let f = c && c.querySelector('[data-imp-float]');
      if (!c || !ed || !range || pointerDown) {
        if (f && !(menu && menu.anchor === f)) { f.remove(); clearGap(); }
        return;
      }
      if (!f) {
        f = document.createElement('button');
        f.type = 'button';
        f.className = 'wr-imp-float';
        f.setAttribute('data-imp-float', '');
        f.setAttribute('aria-haspopup', 'menu');
        f.innerHTML = `${SPARKLE()}Improve`;
        c.append(f);
      }
      const endBlock = blockOf(range.endContainer) || ed;
      const startBlock = blockOf(range.startContainer) || ed;
      f.hidden = false;   // a hidden button measures 0 px high
      const fh = f.offsetHeight;
      const GAP = 6;
      const setGap = (block, cls) => {
        if (block.classList.contains(cls) && ed.querySelectorAll('.wr-imp-gap, .wr-imp-gap-top').length === 1) return;
        clearGap();
        if (block !== ed) block.classList.add(cls);
      };
      /** Where the button goes for one side, and how far to scroll for all of it to show (0: it fits; NaN: it cannot). */
      const measure = (side) => {
        const block = side === 'above' ? startBlock : endBlock;
        setGap(block, side === 'above' ? 'wr-imp-gap-top' : 'wr-imp-gap');
        const box = viewBox(ed);
        const sel = range.getBoundingClientRect();
        const b = block.getBoundingClientRect();
        // The gap is padding on the block (it always adds room to scroll): the button sits inside it.
        const cs = getComputedStyle(block);
        const top = side === 'above' ? b.top + parseFloat(cs.paddingTop) - GAP - fh : b.bottom - parseFloat(cs.paddingBottom) + GAP;
        // A small margin inside the visible box, so the button never touches its edge (or the hint under it).
        const lo = Math.min(sel.top, top - GAP), hi = Math.max(sel.bottom, top + fh + GAP);
        let need = 0;
        if (hi > box.bottom) need = hi - box.bottom;
        if (lo - need < box.top) need = hi - lo > box.height ? NaN : lo - box.top;
        return { side, top, need: Math.abs(need) < 1 ? 0 : need };   // sub-pixel layout: under 1 px fits
      };
      let m = null;
      const kept = ed.querySelector('.wr-imp-gap-top') ? 'above' : 'below';
      if (reveal) {
        for (const side of ['below', 'above']) { const x = measure(side); if (x.need === 0) { m = x; break; } }
        for (const side of m ? [] : ['below', 'above']) {
          const x = measure(side);
          if (Number.isNaN(x.need)) continue;
          scrollBy(ed, x.need);
          const y = measure(side);
          if (y.need === 0) { m = y; break; }
        }
        if (!m) m = measure('below');
      } else {
        m = measure(kept);
      }
      const box = viewBox(ed);
      const cBox = c.getBoundingClientRect();
      const rects = range.getClientRects();
      const endRect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      const left = Math.max(box.left - cBox.left + 8, Math.min(endRect.right - cBox.left - f.offsetWidth, box.right - cBox.left - f.offsetWidth - 8));
      f.style.top = `${m.top - cBox.top}px`;
      f.style.left = `${left}px`;
      // Never outside the editor's visible box (so never over the hint or the foot under it).
      f.hidden = m.top < box.top - 1 || m.top + fh > box.bottom + 1;
    }

    /* ── Menu ──────────────────────────────── */

    function closeMenu(focusEditor) {
      if (!menu) return;
      const m = menu;
      menu = null;
      m.el.remove();
      if (m.anchor && m.anchor.isConnected) m.anchor.setAttribute('aria-expanded', 'false');
      // The finding's Fix shows pressed only while its menu is open (22d, 5).
      if (m.fromFix && host.checksChanged) host.checksChanged();
      if (focusEditor) {
        const ed = editor();
        if (ed && ed.getAttribute('contenteditable') === 'true') {
          ed.focus();
          if (lastRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(lastRange); }
        }
      }
      refresh();
    }

    function openMenu(anchor) {
      if (offWhy()) return;
      const range = liveRange();
      if (!range) return;
      closeMenu(false);
      const pick = pickOf(range);
      const e = els();
      const el = document.createElement('div');
      el.className = 'wr-imp-menu';
      el.setAttribute('data-imp-menu', '');
      e.root.querySelector('.wr').append(el);
      menu = { el, anchor, pick, custom: false };
      anchor.setAttribute('aria-expanded', 'true');
      renderMenu();
      refresh();
    }

    /** Why an action is off for this pick, or ''. */
    function actionWhy(pick, action) {
      if (!pick || pick.words < LIMITS.minWords) return 'Select at least 3 words.';
      if (pick.words > LIMITS.maxWords) return `Select up to ${fmt(LIMITS.maxWords)} words. You selected ${fmt(pick.words)}.`;
      if (pick.text.length > LIMITS.selectionChars) return `Select less text. Up to ${fmt(LIMITS.selectionChars)} characters.`;
      if (action === 'expand' && pick.words > LIMITS.expandMaxWords) return `Select up to ${fmt(LIMITS.expandMaxWords)} words to expand.`;
      return '';
    }

    function renderMenu() {
      if (!menu) return;
      const { el, pick } = menu;
      const head = pick
        ? `<div class="wr-imp-head"><strong>${plural(pick.sentences, 'sentence', 'sentences')}</strong> · ${plural(pick.words, 'word', 'words')}</div>`
        : '<div class="wr-imp-head"><strong>0 sentences</strong> · 0 words</div>';
      if (menu.custom) {
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Custom instruction');
        el.innerHTML = `${head}
          <div class="wr-imp-field">
            <label for="wrImpAsk">What should change?</label>
            <textarea id="wrImpAsk" class="text-input" maxlength="${LIMITS.instructionChars}" rows="3" data-imp-ask aria-describedby="wrImpCount"></textarea>
            <span class="wr-imp-count" id="wrImpCount" data-imp-count>0 / ${LIMITS.instructionChars}</span>
          </div>
          <div class="wr-imp-field-actions">
            <button type="button" class="btn btn-primary btn-sm" data-imp-send disabled>${SPARKLE()}Send</button>
            <button type="button" class="btn btn-secondary btn-sm" data-imp-back>Back</button>
          </div>
          ${menu.fix ? '<p class="wr-imp-mnote">Nothing is sent until you press Send. Edit the words first if you like.</p>' : ''}`;
        const box = el.querySelector('[data-imp-ask]');
        box.value = menu.ask || '';
        countAsk();
        placeMenu();
        box.focus();
        // Fix (design 22d, 5): the cursor at the end of the finding's words.
        box.setSelectionRange(box.value.length, box.value.length);
        return;
      }
      el.setAttribute('role', 'menu');
      el.setAttribute('aria-label', 'Improve selected text');
      const all = actionWhy(pick, 'improve');
      const items = ACTIONS.map(([k, name, sub]) => {
        const why = all || actionWhy(pick, k);
        const off = !!why;
        const own = !all && off;
        return `<button type="button" class="wr-imp-mi" role="menuitem" tabindex="-1" data-imp-act="${k}"${off ? ' aria-disabled="true"' : ''}${own ? ` aria-describedby="wrImpWhy-${k}"` : ''}>
            <span class="wr-imp-mi-text"><span class="wr-imp-mi-t">${name}</span><span class="wr-imp-mi-s">${sub}</span></span></button>
          ${own ? `<div class="wr-imp-why" id="wrImpWhy-${k}">${INFO(14)}${esc(why)}</div>` : ''}`;
      }).join('');
      el.innerHTML = `${head}
        ${all ? `<div class="wr-imp-note" role="note">${INFO(16)}<span>${esc(all)}</span></div>` : ''}
        ${items}
        <div class="wr-imp-sep" role="separator"></div>
        <button type="button" class="wr-imp-mi" role="menuitem" tabindex="-1" aria-disabled="true" data-imp-image>
          <span class="wr-imp-mi-text"><span class="wr-imp-mi-t">Create image</span><span class="wr-imp-mi-s">From the selected text</span></span><span class="wr-imp-pill">v2</span></button>`;
      placeMenu();
      const items2 = [...el.querySelectorAll('[role="menuitem"]')];
      const first = items2.find((b) => b.getAttribute('aria-disabled') !== 'true') || items2[0];
      first.tabIndex = 0;
      first.focus();
    }

    function placeMenu() {
      if (!menu) return;
      const { el } = menu;
      // The floating button can hide (scrolled out of view): the toolbar button is the anchor then.
      const tool = els() && els().main.querySelector('[data-imp-open]');
      const anchor = (menu.anchor.hidden || !menu.anchor.isConnected) && tool ? tool : menu.anchor;
      const a = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const h = el.offsetHeight, w = el.offsetWidth;
      const pad = 16;
      let top = a.bottom + 6;
      if (top + h > vh - pad && a.top - 6 - h >= pad) top = a.top - 6 - h;
      top = Math.max(pad, Math.min(top, vh - pad - h));
      const left = Math.max(pad, Math.min(a.left, vw - pad - w));
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
    }

    function countAsk() {
      if (!menu || !menu.custom) return;
      const box = menu.el.querySelector('[data-imp-ask]');
      menu.ask = box.value;
      menu.el.querySelector('[data-imp-count]').textContent = `${fmt(box.value.length)} / ${LIMITS.instructionChars}`;
      menu.el.querySelector('[data-imp-send]').disabled = !box.value.trim();
    }

    function menuKey(e) {
      if (!menu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Opened by Fix, Esc closes (design 22d, 5); Back still goes to the action menu.
        if (menu.custom && !menu.fix) { menu.custom = false; renderMenu(); return; }
        closeMenu(true);
        return;
      }
      if (menu.custom) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
        return;
      }
      const items = [...menu.el.querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      let j = -1;
      if (e.key === 'ArrowDown') j = (i + 1) % items.length;
      else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      else if (e.key === 'Tab') { closeMenu(false); return; }
      if (j >= 0) {
        e.preventDefault();
        items.forEach((b) => { b.tabIndex = -1; });
        items[j].tabIndex = 0;
        items[j].focus();
      }
    }

    function pickAction(action) {
      if (!menu) return;
      const why = actionWhy(menu.pick, action);
      if (why) return;
      if (action === 'custom') { menu.custom = true; renderMenu(); return; }
      const pick = menu.pick;
      closeMenu(false);
      request(action, null, pick);
    }

    function send() {
      if (!menu || !menu.custom) return;
      const text = (menu.ask || '').trim();
      if (!text || text.length > LIMITS.instructionChars) return;
      const pick = menu.pick;
      closeMenu(false);
      request('custom', text, pick);
    }

    /* ── Request ───────────────────────────── */

    /** Asks the server for a suggestion. pick: a passage in cur.text (from the menu or a retry). */
    async function request(action, instruction, pick) {
      const c = cur();
      // A queue item sends from its own card (the queue gates the rest of Improve).
      if (!c || host.why() || busy() || (queueOn() && !inQueue()) || !pick) return;
      const ctx = S.context(c.text, pick.start, pick.end);
      const body = { stage: 'section_improve', bookId: host.book().id, sectionId: c.id, baseVersionId: c.base || null, action, selection: pick.text, before: ctx.before, after: ctx.after };
      if (action === 'custom') body.instruction = instruction;
      const my = ++token;
      const queued = inQueue();
      imp = { sid: c.id, state: 'loading', action, instruction, at: pick.start, selection: pick.text, sentences: pick.sentences, body, abort: new AbortController(), token: my, result: null, error: null, queued };
      // Fix major: the editor is read only while the call runs (design 22d, 7a; the look of Accept).
      if (queued) host.hold(1);
      after(`${ACT[action].doing} ${plural(pick.sentences, 'sentence', 'sentences')}.`);
      // G3 P9: the server checks the passage against the saved draft or version, so the
      // newest typing is saved first.
      try { await host.flush(); } catch (err) { /* the server says if the passage is missing */ }
      if (!imp || imp.token !== my || imp.state !== 'loading') return;   // cancelled meanwhile
      let res;
      try { res = await kdp.improve(body, { signal: imp.abort.signal }); } catch (err) { res = { error: { code: 'network' } }; }
      if (!imp || imp.token !== my || imp.state !== 'loading') return;   // cancelled, or another section
      imp.abort = null;
      if (queued) host.hold(0);
      if (res.error) return queued ? queueFailed(res.error) : refused(res.error);
      const d = res.data;
      if (d.unchanged) {
        imp.state = 'nochange';
        after('No changes suggested.');
        return;
      }
      imp.result = { suggestionId: d.suggestionId, text: String(d.text || ''), words: d.words || {}, flagged: d.flagged || 0, notes: d.notes || {}, at: Date.now() };
      imp.state = locate(cur().text) < 0 ? 'changed' : 'review';
      after(imp.state === 'review' ? `${ACT[action].done}: ${fmt(W.count(imp.selection))} to ${fmt(W.count(imp.result.text))} words. Accept or reject the suggestion.` : 'The selected text changed while the AI was working.');
    }

    /** A request the server refused or that failed: what the card says. */
    function refused(err) {
      const code = err.code;
      if (code === 'version_conflict') { imp = null; after(); host.adoptRemote(); return; }
      if (code === 'not_found') { imp = null; after(); host.reload(); return; }
      if (code === 'run_in_progress') host.otherRun();
      const e = errorOf(err, imp.action);
      imp.state = 'error';
      imp.error = { ...e, again: 'request' };
      after(`Improve stopped. ${e.line}`);
    }

    /** The words for a refused or failed request: { line, sub, retry, kind }. */
    function errorOf(err, action) {
      const code = err.code;
      const line = {
        ai_unavailable: 'The AI service did not respond.',
        ai_stopped: 'The AI service stopped.',
        ai_declined: 'The AI service declined this text.',
        network: 'We couldn’t reach KDP Lab. Check your connection.',
        server_error: 'Something went wrong on our side.',
        run_in_progress: 'This section is being written in another tab or window.',
        positioning_not_locked: 'Lock the positioning in 03 to use Improve.',
        outline_not_approved: 'Approve the outline in 05 to use Improve.',
        unauthorized: 'Your session ended. Sign in again, then try again.',
        selection_too_short: 'Select at least 3 words.',
        selection_not_in_text: 'We couldn’t find the selected text in your saved section. Try again.',
        selection_too_long: `Select up to ${fmt(action === 'expand' ? LIMITS.expandMaxWords : LIMITS.maxWords)} words${action === 'expand' ? ' to expand' : ''}.${err.words ? ` You selected ${fmt(err.words)}.` : ''}`,
        monthly_limit: kdpUi.aiMessage('monthly_limit')[1],
        rate_limited: kdpUi.aiMessage('rate_limited')[1]
      }[code] || 'The AI service did not respond.';
      // Failures and refusals before the call are not counted (the server writes no usage row).
      // A lost connection may have reached the server, which then counts it (G3 P8, as 05 after Stop).
      const sub = code === 'network'
        ? 'Your text is safe. If the AI had already finished, this call may still count.'
        : 'Your text is safe. This attempt was not counted in your usage.';
      const retry = !['positioning_not_locked', 'outline_not_approved', 'unauthorized', 'selection_too_short', 'selection_too_long', 'monthly_limit', 'run_in_progress'].includes(code);
      const warn = ['monthly_limit', 'rate_limited', 'run_in_progress', 'positioning_not_locked', 'outline_not_approved', 'selection_too_short', 'selection_too_long', 'selection_not_in_text'].includes(code);
      return { line, sub, retry, kind: warn ? 'warning' : 'error' };
    }

    /** Try again: the same action and passage (where it is now), the same instruction. */
    function again() {
      if (!imp) return;
      const c = cur();
      const at = locate(c.text);
      if (at < 0) { imp.state = 'changed'; after('The selected text changed.'); return; }
      const t = imp.selection;
      const old = imp;
      imp = null;
      request(old.action, old.instruction, { start: at, end: at + t.length, text: t, sentences: old.sentences, words: W.count(t) });
    }

    /** Cancel: the fetch is aborted here; the server finishes and counts the tokens (decision 4). */
    function cancel() {
      if (!imp || imp.state !== 'loading') return;
      if (imp.abort) imp.abort.abort();
      imp.abort = null;
      imp.state = 'stopped';
      after('Stopped. Your text did not change.');
    }

    function close() {
      imp = null;
      after();
      const ed = editor();
      if (ed && ed.getAttribute('contenteditable') === 'true') ed.focus();
    }

    /** Reject: nothing is written. The passage is selected again. */
    function reject() {
      if (!imp || imp.state !== 'review') return;
      // Fix major: Reject keeps the text and moves to the next item (design 22d, 7b).
      if (imp.queued && inQueue()) { imp = null; itemDone('rejected', 'Suggestion rejected. Your text did not change.'); return; }
      const at = locate(cur().text);
      const len = imp.selection.length;
      imp = null;
      after('Suggestion rejected. Your text did not change.');
      const ed = editor();
      if (!ed || at < 0) return;
      ed.focus();
      const map = MD.fromDomMap(ed);
      const p = map.domPoint(at, 'start'), q = map.domPoint(at + len, 'end');
      if (!p || !q) return;
      const r = document.createRange();
      r.setStart(p.node, p.offset);
      r.setEnd(q.node, q.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      lastRange = r;
      refresh();
    }

    async function copySuggestion() {
      if (!imp || !imp.result) return;
      let ok = false;
      try { await navigator.clipboard.writeText(imp.result.text); ok = true; } catch (err) {
        const box = els() && els().main.querySelector('[data-imp-text]');
        if (box) { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      }
      host.announce(ok ? 'The suggestion is copied.' : 'The suggestion is selected. Press Ctrl+C to copy it.');
    }

    /* ── Accept ────────────────────────────── */

    async function accept() {
      if (!imp || imp.state !== 'review' || !mine()) return;
      if (acceptWhy()) return;   // a conflict card, a run here: Accept waits
      const my = imp;
      const id = my.sid;
      // 1. The passage in the text on screen: where it was, else its only place.
      if (locate(cur().text) < 0) { my.state = 'changed'; after('The selected text changed while the AI was working.'); return; }
      my.state = 'applying';
      my.error = null;
      // The editor is read only from here to the end (no typing between the two saves).
      host.hold(1);
      after('Saving the change.');
      // 2. Typed text first, as a manual version.
      const ok = await host.saveFirst();
      if (imp !== my || !cur() || cur().id !== id) { host.hold(0); return; }
      if (!ok) { host.hold(0); my.state = 'review'; after(); return; }   // its own message shows (conflict card, save error)
      const md = cur().text;
      const at = locate(md);
      if (at < 0) { host.hold(0); my.state = 'changed'; after('The selected text changed while the AI was working.'); return; }
      const full = md.slice(0, at) + my.result.text + md.slice(at + my.selection.length);
      // 3. Autosave paused (decision A): no draft can land before apply_suggestion.
      host.hold(2);
      let res;
      try { res = await kdp.applySuggestion(my.result.suggestionId, cur().base, full); } catch (err) { res = { error: err }; }
      if (imp !== my || !cur() || cur().id !== id) { host.hold(0); return; }
      if (res.error) { host.hold(0); return applyFailed(my, res.error, full); }
      imp = null;
      host.applied(res.data, full, my.action, { at, selection: my.selection, output: my.result.text, before: md });   // releases the hold after the editor text is in
      // Fix major: the next item opens (design 22d, 7b). No re-check.
      // The save is said first: the next item's message would replace host.applied's (G5 live note 1).
      if (my.queued && inQueue()) { itemDone('accepted', 'Accepted. Saved as a new version.'); return; }
      after();
    }

    async function applyFailed(my, err, full) {
      const m = err.message || '';
      if (m === 'suggestion_used') {
        // The reply may have been lost after a good save: the section's text tells.
        let r;
        try { r = await kdp.getSectionText(my.sid); } catch (e) { r = { error: e }; }
        if (imp !== my) return;
        if (!r.error && r.data && r.data.version && r.data.version.content === full) {
          imp = null;
          host.reload();
          if (my.queued && inQueue()) { itemDone('accepted', 'The change was already saved.'); return; }
          after();
          host.announce('The change was already saved.');
          return;
        }
        my.state = 'error';
        my.error = { line: 'This suggestion was already used.', sub: 'Your text is safe. Ask again for a new suggestion.', retry: true, kind: 'warning', again: 'request' };
        after(my.error.line);
        return;
      }
      if (m === 'version_conflict' || m === 'unsaved_draft') {
        my.state = 'review';
        after();
        host.adoptRemote();
        return;
      }
      if (m === 'suggestion_mismatch') { my.state = 'changed'; after('The selected text changed while the AI was working.'); return; }
      const lines = {
        suggestion_expired: ['This suggestion is too old. Ask again.', 'Your text is safe. Suggestions last 1 hour.', 'request'],
        run_in_progress: ['This section is being written in another tab.', 'Your text is safe. Try again when it finishes.', 'accept'],
        section_not_found: ['This section was removed in 05 Outline.', 'Your other writing is safe.', null],
        section_too_long: [`This section is too long to save. Keep it under ${fmt(100000)} characters.`, 'Your text is safe.', null]
      };
      if (m === 'run_in_progress') host.otherRun();
      const [line, sub, retry] = lines[m] || ['We couldn’t save the change. Your text is safe.', '', 'accept'];
      my.state = 'error';
      my.error = { line, sub, retry: !!retry, kind: m === 'suggestion_expired' || m === 'run_in_progress' ? 'warning' : 'error', again: retry || 'request', saveError: true };
      after(line);
    }

    /* ── Fix major queue (design 22d) ──────── */

    const SKIP_WHY = {
      gone: 'Its text changed after an earlier Accept.',
      // Owner wording (G5 STOP 3).
      short: 'Under 3 words, too short to fix.',
      changed: 'The text changed while the AI was working.'
    };
    const STATUS = { waiting: 'Waiting', now: 'Now', accepted: 'Accepted', rejected: 'Rejected', skipped: 'Skipped', nochange: 'No change', failed: 'Failed', notsent: 'Not sent', stopped: 'Stopped' };
    const TYPE_NAME = { objective: 'Objective', voice: 'Voice', drift: 'Drift' };
    const SKIP = (s = 14) => svg(s, '<path d="M5 6l7 6-7 6M14 6v12"/>');

    /** An item's passage now: { pick } (its exact quote, snapped to whole sentences), or { skip, why }. */
    function itemPick(it) {
      const md = cur() ? cur().text : '';
      const at = it && it.quote ? md.indexOf(it.quote) : -1;
      const snap = at < 0 ? null : S.snap(md, at, at + it.quote.length);
      // Gone: after an Accept in this queue (22d, 8), or the writer changed it between items.
      if (!snap) return { skip: 'gone', why: fq && fq.items.some((x) => x.status === 'accepted') ? SKIP_WHY.gone : 'This text is no longer in the section.' };
      const pick = { ...snap, words: W.count(snap.text) };
      if (pick.words < LIMITS.minWords) return { skip: 'short', why: SKIP_WHY.short };
      const why = actionWhy(pick, 'custom');
      return why ? { skip: 'long', why } : { pick };
    }

    const countOf = (st) => fq.items.filter((x) => x.status === st).length;

    /** "2 accepted, 1 skipped". */
    function summary() {
      const parts = [['accepted', 'accepted'], ['rejected', 'rejected'], ['skipped', 'skipped'], ['nochange', 'with no change'], ['stopped', 'stopped'], ['notsent', 'not sent']]
        .map(([st, words]) => [countOf(st), words]).filter(([n]) => n).map(([n, words]) => `${fmt(n)} ${words}`);
      return parts.join(', ') || 'Nothing changed';
    }

    /** Starts the queue (items in text order, from the Checks tab). '' when it started, else why not. */
    function queueStart(items) {
      const why = offWhy();
      if (why) return why;
      if (!Array.isArray(items) || !items.length) return 'missing';
      if (menu) closeMenu(false);
      fq = { sid: cur().id, state: 'item', k: -1, ask: '', error: null, end: null,
        items: items.map((x) => ({ i: x.i, type: x.type, message: x.message, quote: x.quote, status: 'waiting', why: '', skip: '' })) };
      nextItem('');
      return '';
    }

    /** The open item ends; the next one opens. */
    function itemDone(status, say = '', why = '', skip = '') {
      const it = fq.items[fq.k];
      if (it) { it.status = status; it.why = why; it.skip = skip; }
      nextItem(say);
    }

    /** Opens the next waiting item whose quote is still in the text; the others are skipped with no call (22d, 8). */
    function nextItem(say) {
      const said = say ? [say] : [];
      for (;;) {
        const k = fq.items.findIndex((x) => x.status === 'waiting');
        if (k < 0) {
          fq.state = 'end';
          fq.end = { kind: 'done', midCall: false };
          fq.k = -1;
          said.push(`Fix major done. ${summary()}.`);
          after(said.join(' '));
          return;
        }
        const it = fq.items[k];
        const x = itemPick(it);
        if (x.skip) {
          it.status = 'skipped';
          it.why = x.why;
          it.skip = x.skip;
          said.push(`Item ${k + 1} skipped. ${x.why}`);
          continue;
        }
        it.status = 'now';
        Object.assign(fq, { k, state: 'item', ask: it.message.slice(0, LIMITS.instructionChars), error: null });
        said.push(`Fix ${k + 1} of ${fq.items.length}: ${it.type}.`);
        after(said.join(' '));
        return;
      }
    }

    /** Send: the item as a normal Custom request, the quote looked up again first (the writer may have typed). */
    function queueSend() {
      if (!queueOn() || fq.state !== 'item') return;
      const it = fq.items[fq.k];
      const text = (fq.ask || '').trim();
      if (!text || text.length > LIMITS.instructionChars) return;
      if (host.why() || busy()) { host.announce(WHY_TEXT[host.why()] || WHY_TEXT.loading); return; }
      const x = itemPick(it);
      if (x.skip) { itemDone('skipped', `Item ${fq.k + 1} skipped. ${x.why}`, x.why, x.skip); return; }
      fq.state = 'call';
      request('custom', text, x.pick);
    }

    /** Stop: the queue ends; accepted changes stay. A call in flight is aborted and counts (as Cancel). */
    function queueStop() {
      if (!queueOn()) return;
      if (imp && imp.queued && imp.state === 'applying') return;
      let mid = false;
      if (imp && imp.queued) {
        if (imp.state === 'loading') { if (imp.abort) imp.abort.abort(); mid = true; host.hold(0); }
        imp = null;
      }
      fq.items.forEach((x) => {
        if (x.status === 'now') x.status = mid || fq.state === 'call' ? 'stopped' : 'notsent';
        else if (x.status === 'waiting' || x.status === 'failed') x.status = 'notsent';
      });
      Object.assign(fq, { state: 'end', end: { kind: 'done', midCall: mid }, k: -1, error: null });
      after(`Fix major stopped. ${summary()}.`);
    }

    /** A queue call that failed or was refused (design 22d, 10a and 10b). */
    function queueFailed(err) {
      const code = err.code;
      imp = null;
      const e = code === 'version_conflict' ? { line: 'This section was saved in another tab.', sub: '', retry: false, kind: 'warning' }
        : code === 'not_found' ? { line: 'This section was removed in 05 Outline.', sub: '', retry: false, kind: 'warning' }
        : errorOf(err, 'custom');
      if (code === 'run_in_progress') host.otherRun();
      if (e.retry) {
        fq.items[fq.k].status = 'failed';
        Object.assign(fq, { state: 'failed', error: e });
        after(`Fix major stopped. ${e.line}`);
        return;
      }
      // No Try again (the month limit, a refusal before the call): the queue ends; nothing more is sent.
      const at = fq.k;
      fq.items.forEach((x) => { if (x.status === 'now' || x.status === 'waiting') x.status = 'notsent'; });
      Object.assign(fq, { state: 'end', end: { kind: 'refused', at }, k: -1, error: e });
      after(`Fix major stopped. ${e.line}`);
      if (code === 'version_conflict') host.adoptRemote();
      if (code === 'not_found') host.reload();
    }

    /** Try again after a failed call (10b): the same item, the same words. */
    function queueRetry() {
      if (!queueOn() || fq.state !== 'failed') return;
      fq.items[fq.k].status = 'now';
      Object.assign(fq, { state: 'item', error: null });
      queueSend();
      if (fq && fq.state === 'item') after();
    }

    /** Next item, after "The text changed" or "No changes suggested". */
    function queueNext() {
      if (!inQueue() || !imp) return;
      const st = imp.state;
      if (st !== 'changed' && st !== 'nochange') return;
      imp = null;
      if (st === 'changed') itemDone('skipped', `Item ${fq.k + 1} skipped. ${SKIP_WHY.changed}`, SKIP_WHY.changed);
      else itemDone('nochange', `Item ${fq.k + 1}: no changes suggested.`);
    }

    function queueClose() {
      if (!queueMine() || fq.state !== 'end') return;
      fq = null;
      after();
      // Close returns focus to the Checks tab (design 22d, 9).
      const tab = els() && els().side.querySelector('[data-tab="checks"]');
      if (tab) tab.focus();
    }

    /** "Keep as is" on a waiting item takes it out of the queue ("1 of 2", 22d 7a). */
    function queueRemove(i) {
      if (!queueOn()) return false;
      const j = fq.items.findIndex((x) => x.i === i && x.status === 'waiting');
      if (j < 0) return false;
      fq.items.splice(j, 1);
      if (fq.k > j) fq.k--;
      renderCard();
      return true;
    }

    function countQueueAsk(box) {
      fq.ask = box.value;
      const card = box.closest('.wr-imp');
      card.querySelector('[data-q-count]').textContent = `${fmt(box.value.length)} / ${LIMITS.instructionChars}`;
      card.querySelector('[data-q-send]').disabled = !box.value.trim();
    }

    function qlistHtml(label) {
      const rows = fq.items.map((x, j) => {
        const now = x.status === 'now' || x.status === 'failed';
        const ico = x.status === 'accepted' ? ICON.check(14) : x.status === 'skipped' ? SKIP(14) : '';
        const cls = x.status === 'accepted' ? ' is-ok' : now ? ' is-now' : '';
        return `<li${now ? ' class="is-now"' : ''} data-q-item="${j}"><span class="wr-q-n">${j + 1}</span>
          <span class="wr-q-what">${TYPE_NAME[x.type] || x.type}${x.why ? `<span class="wr-q-sub">${esc(x.why)}</span>` : ''}</span>
          <span class="wr-q-st${cls}">${ico}${STATUS[x.status]}</span></li>`;
      }).join('');
      return `<ol class="wr-q-list" aria-label="${label}">${rows}</ol>`;
    }

    function queueHtml() {
      const n = fq.items.length;
      const k = fq.k;
      const it = fq.items[k];
      const genWhy = `<p class="sr-only" id="wrImpGenWhy">${esc(genWhy2())}</p>`;
      const L = (text) => `<div class="chip-label">${esc(text)}</div>`;
      const cost = `<div class="wr-q-cost">${INFO(16)}<span>Up to ${plural(n, 'AI call', 'AI calls')}, about $0.01 to $0.02 each.</span></div>`;
      const stop = (focus) => `<button type="button" class="link-btn wr-imp-text-btn" data-q-stop${focus ? ' data-imp-focus' : ''}>Stop</button>`;
      const accepted = countOf('accepted');
      if (fq.state === 'end') {
        if (fq.end.kind === 'refused') {
          const e = fq.error;
          return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-refused">${L(`FIX MAJOR · ${fq.end.at + 1} OF ${n}`)}
            <h3 id="wrImpTitle">Fix major stopped</h3>
            <div class="alert ${e.kind === 'warning' ? 'alert-warning' : 'alert-error'}" role="alert">${e.kind === 'warning' ? ICON.warn(16) : ICON.x(16)}<div><p class="alert-text">${esc(e.line)}</p></div></div>
            ${qlistHtml('Fix major results')}
            <p>${accepted ? `${fmt(accepted)} accepted before the stop. ` : ''}The rest were not sent. This refusal was not counted.</p>
            <div class="wr-imp-actions"><button type="button" class="btn btn-secondary btn-sm" data-q-close data-imp-focus>Close</button></div></section>`;
        }
        // E12 fix batch 2 (22e): the check still holds after its own Fixes, so no new check is asked for.
        const text = accepted ? 'Each Accept saved a new version. The Checks tab shows what is left.' : 'Your text did not change.';
        return `<section class="wr-imp wr-q" role="status" aria-labelledby="wrImpTitle" data-imp-card="q-done">${L('FIX MAJOR · DONE')}
          <h3 id="wrImpTitle">${esc(summary())}</h3>
          ${qlistHtml('Fix major results')}
          <p>${text}${fq.end.midCall ? ' The tokens already used count toward your usage.' : ''}</p>
          <div class="wr-imp-actions"><button type="button" class="btn btn-secondary btn-sm" data-q-close data-imp-focus>Close</button></div></section>`;
      }
      const head = L(`FIX MAJOR · ${k + 1} OF ${n}`);
      if (fq.state === 'failed') {
        const e = fq.error;
        const keep = accepted === 1 ? ` Stop keeps item ${fq.items.findIndex((x) => x.status === 'accepted') + 1}’s change.` : accepted ? ' Stop keeps the accepted changes.' : '';
        return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-failed">${head}
          <h3 id="wrImpTitle">Fix major stopped</h3>
          <div class="alert ${e.kind === 'warning' ? 'alert-warning' : 'alert-error'}" role="alert">${e.kind === 'warning' ? ICON.warn(16) : ICON.x(16)}<div><p class="alert-text"><strong>${esc(e.line)}</strong></p>${e.sub ? `<p class="alert-text">${esc(e.sub)}</p>` : ''}</div></div>
          ${qlistHtml('Fix major queue')}
          <div class="wr-imp-actions"><button type="button" class="btn btn-primary btn-sm" data-q-retry data-imp-focus>Try again</button>${stop(false)}</div>
          <p class="wr-imp-small">Try again sends item ${k + 1} again.${keep}</p>${genWhy}</section>`;
      }
      if (fq.state === 'item') {
        const x = itemPick(it);
        const passage = x.pick ? x.pick.text : it.quote;
        return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-item">${head}${cost}
          ${qlistHtml('Fix major queue')}
          <h3 id="wrImpTitle">Fix ${k + 1} of ${n}: ${esc(it.type)}</h3>
          <div class="wr-imp-passage">${esc(MD.toPlain(passage))}</div>
          <div class="wr-imp-field wr-q-field">
            <label for="wrQAsk">What should change?</label>
            <textarea id="wrQAsk" class="text-input" maxlength="${LIMITS.instructionChars}" rows="3" data-q-ask data-imp-focus aria-describedby="wrQCount">${esc(fq.ask)}</textarea>
            <span class="wr-imp-count" id="wrQCount" data-q-count>${fmt(fq.ask.length)} / ${LIMITS.instructionChars}</span>
          </div>
          <div class="wr-imp-actions">
            <button type="button" class="btn btn-primary btn-sm" data-q-send${fq.ask.trim() ? '' : ' disabled'}>${SPARKLE()}Send</button>
            <button type="button" class="btn btn-secondary btn-sm" data-q-skip>${SKIP(16)}Skip</button>
            ${stop(false)}
          </div>
          <p class="wr-imp-small">Skip moves to the next item. Nothing is sent. Stop ends Fix major; accepted changes stay.</p>${genWhy}</section>`;
      }
      // fq.state 'call': the suggestion of the open item.
      if (!mine() || !imp.queued) return '';
      const s = imp.state;
      if (s === 'loading') {
        return `<section class="wr-imp wr-q" role="status" aria-labelledby="wrImpTitle" data-imp-card="q-loading">${head}
          ${qlistHtml('Fix major queue')}
          <div class="wr-imp-row"><span class="wr-imp-spin" aria-hidden="true"></span><h3 id="wrImpTitle">Fixing ${k + 1} of ${n}…</h3></div>
          <div class="wr-imp-passage">${esc(MD.toPlain(imp.selection))}</div>
          <p class="wr-imp-small">The editor is read only while the AI works.</p>
          <div class="wr-imp-actions">${stop(true)}</div>${genWhy}</section>`;
      }
      if (s === 'review' || s === 'applying') {
        const r = imp.result;
        const applying = s === 'applying';
        const last = !fq.items.some((x, j) => j > k && x.status === 'waiting');
        const off = applying || !!acceptWhy();
        return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-${s}">${head}
          <div class="wr-imp-head-row"><h3 id="wrImpTitle">Fix ${k + 1} of ${n}: ${fmt(W.count(imp.selection))} → ${fmt(W.count(r.text))} words</h3><span class="wr-imp-small">Just now</span></div>
          ${applying ? '<div class="wr-imp-row" role="status"><span class="wr-imp-spin" aria-hidden="true"></span><span>Saving…</span></div>' : `<div class="wr-imp-diff" tabindex="0" aria-label="Changes" data-imp-diff>${diffHtml(imp.selection, r.text)}</div>
          <div class="wr-cmp-legend"><span class="wr-leg-del">${ICON.x(12)}Removed</span><span class="wr-leg-add">${ICON.plus.replace('width="18" height="18"', 'width="12" height="12"')}Added</span></div>
          ${notesHtml()}`}
          <div class="wr-imp-actions">
            <button type="button" class="btn btn-primary btn-sm" data-imp-accept data-imp-focus${off ? ' disabled' : ''}>Accept</button>
            <button type="button" class="link-btn wr-imp-text-btn" data-imp-reject${applying ? ' disabled' : ''}>Reject</button>
            <button type="button" class="link-btn wr-imp-text-btn" data-q-stop${applying ? ' disabled' : ''}>Stop</button>
          </div>
          <p class="wr-imp-small">${applying ? 'The editor is read only for a moment.' : last ? 'Accept saves a new version. Reject keeps your text.' : `Accept saves a new version, then item ${k + 2} opens. Reject keeps your text and moves to item ${k + 2}.`}</p>
          ${genWhy}</section>`;
      }
      if (s === 'changed' || s === 'nochange') {
        const changed = s === 'changed';
        return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-${s}">${head}
          <h3 id="wrImpTitle">${changed ? 'The text changed' : 'No changes suggested'}</h3>
          ${changed ? `<div class="alert alert-warning" role="alert">${ICON.warn(16)}<p class="alert-text"><strong>Check this:</strong> the selected text changed while the AI was working, so the suggestion was not used.</p></div>` : '<p>The text already does this. Nothing was saved. This request counts toward your usage.</p>'}
          ${changed && imp.result ? `<div class="sr-only" data-imp-text>${esc(imp.result.text)}</div>` : ''}
          <div class="wr-imp-actions">
            ${changed && imp.result ? `<button type="button" class="btn btn-secondary btn-sm" data-imp-copy>${COPY()}Copy suggestion</button>` : ''}
            <button type="button" class="btn btn-primary btn-sm" data-q-next data-imp-focus>Next item</button>${stop(false)}
          </div>${genWhy}</section>`;
      }
      if (s === 'error') {
        const e = imp.error;
        return `<section class="wr-imp wr-q" aria-labelledby="wrImpTitle" data-imp-card="q-error">${head}
          <h3 id="wrImpTitle">Fix major stopped</h3>
          <div class="alert ${e.kind === 'warning' ? 'alert-warning' : 'alert-error'}" role="alert">${e.kind === 'warning' ? ICON.warn(16) : ICON.x(16)}<div><p class="alert-text"><strong>${esc(e.line)}</strong></p>${e.sub ? `<p class="alert-text">${esc(e.sub)}</p>` : ''}</div></div>
          ${qlistHtml('Fix major queue')}
          <div class="wr-imp-actions">${e.retry ? '<button type="button" class="btn btn-primary btn-sm" data-imp-retry data-imp-focus>Try again</button>' : ''}${stop(!e.retry)}</div>${genWhy}</section>`;
      }
      return '';
    }

    /* ── Cards ─────────────────────────────── */

    function label() {
      return `${ACT[imp.action].name.toUpperCase()} · ${host.label()}`;
    }

    function diffHtml(oldMd, newMd) {
      const plain = (md) => MD.toPlain(md).split(MD.FLAG).join(PILL);
      const parts = kdpWordDiff.diff(plain(oldMd), plain(newMd));
      const pill = `<span class="wr-imp-flag">${ICON.warn(12)}Verify: no source</span>`;
      const html = (t) => esc(t).replace(/\n/g, '<br>').split(PILL).join(pill);
      return parts.map((p) => (p.op === 'same' ? html(p.text) : p.op === 'del' ? `<del>${html(p.text)}</del>` : `<ins>${html(p.text)}</ins>`)).join('');
    }

    function notesHtml() {
      const r = imp.result;
      const n = r.notes || {};
      const out = [];
      const note = (title, text) => `<div class="wr-imp-n">${ICON.warn(16)}<span><strong>${title}:</strong> ${esc(text)}</span></div>`;
      if (r.flagged > 0) out.push(note('Source', `${r.flagged === 1 ? '1 claim needs' : `${fmt(r.flagged)} claims need`} a source.`));
      // The server's count only (marks in the passage minus marks in the result).
      if (n.markersLost > 0) {
        const lost = n.markersLost === 1 ? '1 source mark from the original is missing' : `${fmt(n.markersLost)} source marks from the original are missing`;
        out.push(note('Marks', `${lost}. Check that no claim lost its mark.`));
      }
      if (Array.isArray(n.newNames) && n.newNames.length) out.push(note('Names', `New names: ${n.newNames.join(', ')}. Check them.`));
      const sc = n.structureChanged;
      if (sc) {
        const parts = [];
        if (sc.headings) parts.push('a heading changed');
        if (sc.paragraphs) parts.push(`${plural(sc.paragraphs.before, 'paragraph', 'paragraphs')} became ${fmt(sc.paragraphs.after)}`);
        if (sc.listItems) parts.push(`${plural(sc.listItems.before, 'list item', 'list items')} became ${fmt(sc.listItems.after)}`);
        if (parts.length) out.push(note('Structure', `The structure changed: ${parts.join(', ')}.`));
      }
      if (!out.length) return '';
      return `<div class="wr-imp-notes" role="group" aria-labelledby="wrImpNotes"><span class="chip-label" id="wrImpNotes">CHECK BEFORE YOU ACCEPT</span>${out.join('')}</div>`;
    }

    function cardHtml() {
      if (queueMine()) return queueHtml();
      if (!mine()) return '';
      const L = `<div class="chip-label">${esc(label())}</div>`;
      // Why Generate is off (its aria-describedby). Shown in the loading card (design 22b, 7); the suggestion card only reads it out (9).
      const genWhy = `<p class="${imp.state === 'loading' ? 'wr-imp-small' : 'sr-only'}" id="wrImpGenWhy">${esc(genWhy2())}</p>`;
      switch (imp.state) {
        case 'loading': return `<section class="wr-imp" role="status" aria-labelledby="wrImpTitle" data-imp-card="loading">${L}
            <div class="wr-imp-row"><span class="wr-imp-spin" aria-hidden="true"></span><h3 id="wrImpTitle">${ACT[imp.action].doing} ${plural(imp.sentences, 'sentence', 'sentences')}…</h3></div>
            <div class="wr-imp-passage">${esc(MD.toPlain(imp.selection))}</div>
            <p class="wr-imp-small">You can keep writing. If you change these sentences, the result cannot be used.</p>
            <div class="wr-imp-actions"><button type="button" class="btn btn-secondary btn-sm" data-imp-cancel data-imp-focus>Cancel</button></div>
            ${genWhy}</section>`;
        case 'stopped': return `<section class="wr-imp" role="status" aria-labelledby="wrImpTitle" data-imp-card="stopped">${L}
            <h3 id="wrImpTitle">Stopped</h3>
            <p>Your text did not change. The tokens already used count toward your usage.</p>
            <div class="wr-imp-actions"><button type="button" class="btn btn-secondary btn-sm" data-imp-close data-imp-focus>Close</button></div></section>`;
        case 'nochange': return `<section class="wr-imp" role="status" aria-labelledby="wrImpTitle" data-imp-card="nochange">${L}
            <h3 id="wrImpTitle">No changes suggested</h3>
            <p>The text already does this. Nothing was saved. This request counts toward your usage.</p>
            <div class="wr-imp-actions"><button type="button" class="btn btn-secondary btn-sm" data-imp-close data-imp-focus>Close</button></div></section>`;
        case 'changed': return `<section class="wr-imp" aria-labelledby="wrImpTitle" data-imp-card="changed">${L}
            <h3 id="wrImpTitle">The text changed</h3>
            <div class="alert alert-warning" role="alert">${ICON.warn(16)}<p class="alert-text"><strong>Check this:</strong> the selected text changed while the AI was working, so the suggestion was not used.</p></div>
            <p class="wr-imp-small">Copy the suggestion to use it by hand, or select the text again.</p>
            ${imp.result ? `<div class="sr-only" data-imp-text>${esc(imp.result.text)}</div>` : ''}
            <div class="wr-imp-actions">
              ${imp.result ? `<button type="button" class="btn btn-secondary btn-sm" data-imp-copy data-imp-focus>${COPY()}Copy suggestion</button>` : ''}
              <button type="button" class="link-btn wr-imp-text-btn" data-imp-close${imp.result ? '' : ' data-imp-focus'}>Close</button>
            </div></section>`;
        case 'error': {
          const e = imp.error;
          const cls = e.kind === 'warning' ? 'alert-warning' : 'alert-error';
          return `<section class="wr-imp" aria-labelledby="wrImpTitle" data-imp-card="error">${L}
            <h3 id="wrImpTitle">Improve stopped</h3>
            <div class="alert ${cls}" role="alert">${e.kind === 'warning' ? ICON.warn(16) : ICON.x(16)}<div><p class="alert-text"><strong>${esc(e.line)}</strong></p>${e.sub ? `<p class="alert-text">${esc(e.sub)}</p>` : ''}</div></div>
            <div class="wr-imp-actions">
              ${e.retry ? `<button type="button" class="btn btn-primary btn-sm" data-imp-retry data-imp-focus${offWhy() && !(e.again === 'accept' && imp.result) ? ' disabled' : ''}>Try again</button>` : ''}
              <button type="button" class="link-btn wr-imp-text-btn" data-imp-close${e.retry ? '' : ' data-imp-focus'}>Close</button>
            </div></section>`;
        }
        case 'review':
        case 'applying': {
          const r = imp.result;
          const applying = imp.state === 'applying';
          const before = W.count(imp.selection), afterW = W.count(r.text);
          const off = applying || !!acceptWhy();
          const offAgain = applying || !!host.why();
          return `<section class="wr-imp" aria-labelledby="wrImpTitle" data-imp-card="${imp.state}">${L}
            <div class="wr-imp-head-row"><h3 id="wrImpTitle">${ACT[imp.action].done}: ${fmt(before)} → ${fmt(afterW)} words</h3><span class="wr-imp-small">Just now</span></div>
            ${applying ? '<div class="wr-imp-row" role="status"><span class="wr-imp-spin" aria-hidden="true"></span><span>Saving…</span></div>' : `<div class="wr-imp-diff" tabindex="0" aria-label="Changes" data-imp-diff>${diffHtml(imp.selection, r.text)}</div>
            <div class="wr-cmp-legend"><span class="wr-leg-del">${ICON.x(12)}Removed</span><span class="wr-leg-add">${ICON.plus.replace('width="18" height="18"', 'width="12" height="12"')}Added</span></div>
            ${notesHtml()}`}
            <div class="wr-imp-actions">
              <button type="button" class="btn btn-primary btn-sm" data-imp-accept data-imp-focus${off ? ' disabled' : ''}>Accept</button>
              <button type="button" class="btn btn-secondary btn-sm" data-imp-again${offAgain ? ' disabled' : ''}>${SPARKLE()}Try again</button>
              <button type="button" class="link-btn wr-imp-text-btn" data-imp-reject${applying ? ' disabled' : ''}>Reject</button>
            </div>
            <p class="wr-imp-small">${applying ? 'The editor is read only for a moment.' : 'Accept saves a new version. You can restore the old one in Versions.'}</p>
            ${applying ? '' : genWhy}</section>`;
        }
        default: return '';
      }
    }

    /** Why Generate is off because of Improve (decision 8), or ''. */
    function genWhy2() {
      if (queueOn()) return 'Finish or stop Fix major first.';
      if (!busy()) return '';
      return imp.state === 'loading' ? 'Wait for Improve to finish.' : 'Accept or reject the suggestion first.';
    }

    function renderCard() {
      const e = els();
      const box = e && e.main.querySelector('[data-imp]');
      if (!box) return;
      const had = box.contains(document.activeElement);
      box.innerHTML = cardHtml();
      const gen = e.main.querySelector('[data-generate]');
      if (gen) { if (busy() || queueOn()) gen.setAttribute('aria-describedby', 'wrImpGenWhy'); else gen.removeAttribute('aria-describedby'); }
      if (had) { const f = box.querySelector('[data-imp-focus]'); if (f) f.focus(); }
    }

    /** After a state change: the card, the gates elsewhere, the highlight, and a message. */
    function after(say) {
      host.changed();
      renderCard();
      paint();
      refresh();
      // The Checks tab follows the Fix major queue (design 22d, 7a and 8).
      if (host.checksChanged) host.checksChanged();
      if (say) host.announce(say);
      // The card's main button takes focus, unless the writer is typing in the editor.
      const f = els() && els().main.querySelector('[data-imp] [data-imp-focus]');
      const ed = editor();
      const typing = !!ed && ed.contains(document.activeElement);
      if (f && say && !typing) {
        f.focus();
        // A queue item's box: the cursor at the end of the finding's words.
        if (f.tagName === 'TEXTAREA') f.setSelectionRange(f.value.length, f.value.length);
      }
    }

    /* ── Events ────────────────────────────── */

    function bindEditor(ed) {
      if (!ed || boundEditor === ed) return;
      boundEditor = ed;
      ed.addEventListener('pointerdown', () => { pointerDown = true; placeFloat(null); });
      ed.addEventListener('scroll', () => { refresh(); if (menu) placeMenu(); }, { passive: true });
      ed.addEventListener('keydown', (e) => {
        // A keyboard way into the menu: Alt+Enter with a selection.
        if (e.key === 'Enter' && e.altKey) {
          const b = els().main.querySelector('[data-imp-open]');
          if (b && !b.disabled) { e.preventDefault(); openMenu(b); }
        }
      });
    }

    let raf = 0;
    const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!menu) refresh(true); }); };

    document.addEventListener('selectionchange', soon);
    document.addEventListener('pointerup', () => { if (pointerDown) { pointerDown = false; soon(); } });
    window.addEventListener('resize', () => { refresh(true); placeMenu(); });
    document.addEventListener('pointerdown', (e) => {
      if (!menu) return;
      if (menu.el.contains(e.target) || (menu.anchor && menu.anchor.contains(e.target))) return;
      closeMenu(false);
    }, true);
    document.addEventListener('keydown', (e) => { if (menu && menu.el.contains(e.target)) menuKey(e); });
    document.addEventListener('input', (e) => {
      if (menu && menu.custom && e.target.matches && e.target.matches('[data-imp-ask]')) countAsk();
      if (fq && e.target.matches && e.target.matches('[data-q-ask]')) countQueueAsk(e.target);
    });
    document.addEventListener('keydown', (e) => {
      if (fq && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches && e.target.matches('[data-q-ask]')) { e.preventDefault(); queueSend(); }
    });
    // The buttons keep the editor's selection.
    document.addEventListener('mousedown', (e) => { if (e.target.closest && e.target.closest('[data-imp-open], [data-imp-float]')) e.preventDefault(); });
    document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('button');
      if (!t || !els() || !els().root.contains(t)) return;
      if (t.hasAttribute('data-imp-open') || t.hasAttribute('data-imp-float')) { if (menu && menu.anchor === t) closeMenu(true); else openMenu(t); return; }
      if (t.dataset.impAct) { pickAction(t.dataset.impAct); return; }
      if (t.hasAttribute('data-imp-send')) { send(); return; }
      if (t.hasAttribute('data-imp-back')) { menu.custom = false; menu.fix = false; renderMenu(); return; }
      if (t.hasAttribute('data-imp-cancel')) { cancel(); return; }
      if (t.hasAttribute('data-imp-close')) { close(); return; }
      if (t.hasAttribute('data-imp-accept')) { accept(); return; }
      if (t.hasAttribute('data-imp-reject')) { reject(); return; }
      if (t.hasAttribute('data-imp-again')) { again(); return; }
      if (t.hasAttribute('data-imp-copy')) { copySuggestion(); return; }
      if (t.hasAttribute('data-q-send')) { queueSend(); return; }
      if (t.hasAttribute('data-q-skip')) { if (queueOn() && fq.state === 'item') itemDone('skipped', `Item ${fq.k + 1} skipped.`); return; }
      if (t.hasAttribute('data-q-stop')) { queueStop(); return; }
      if (t.hasAttribute('data-q-retry')) { queueRetry(); return; }
      if (t.hasAttribute('data-q-next')) { queueNext(); return; }
      if (t.hasAttribute('data-q-close')) { queueClose(); return; }
      if (t.hasAttribute('data-imp-retry')) {
        if (imp && imp.error && imp.error.again === 'accept' && imp.result) { imp.state = 'review'; accept(); } else again();
      }
    });

    /** Called by book-write after the main shell renders (a new editor). */
    function render() {
      if (menu && !document.contains(menu.anchor)) { menu.el.remove(); menu = null; }
      lastRange = null;
      bindEditor(editor());
      renderCard();
      paint();
      refresh();
    }

    /** Called on every edit: the passage may have moved or gone (the highlight follows, once a frame). */
    let paintRaf = 0;
    function onInput() {
      if (menu) closeMenu(false);
      clearGap();
      if (busy() || queueOn()) { cancelAnimationFrame(paintRaf); paintRaf = requestAnimationFrame(paint); }
      refresh();
    }

    /**
     * "Fix" (E10.4, G5): select md[start, end) in the editor, then open the menu (it snaps to
     * whole sentences). With ask: straight on Custom with the words in the box (design 22d, 5),
     * when Custom is on for the passage; else the action menu with its note, as before.
     */
    function openFor(start, end, { ask } = {}) {
      const why = offWhy();
      if (why) return why;
      const ed = editor();
      if (!ed || ed.getAttribute('contenteditable') !== 'true') return 'loading';
      let map = MD.fromDomMap(ed);
      if (map.md !== cur().text) { host.sync(); map = MD.fromDomMap(ed); }
      if (start < 0 || end > map.md.length || start >= end) return 'missing';
      const p = map.domPoint(start, 'start'), q = map.domPoint(end, 'end');
      if (!p || !q) return 'missing';
      closeMenu(false);
      ed.focus({ preventScroll: true });
      try {
        const r = document.createRange();
        r.setStart(p.node, p.offset);
        r.setEnd(q.node, q.offset);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        lastRange = r;
      } catch (err) { return 'missing'; }
      const block = blockOf(p.node);
      if (block && block.scrollIntoView) block.scrollIntoView({ block: 'nearest' });
      refresh(true);
      const btn = els().main.querySelector('[data-imp-open]');
      if (!btn) return 'loading';
      openMenu(btn);
      if (!menu) return 'missing';
      if (ask && !actionWhy(menu.pick, 'custom')) {
        Object.assign(menu, { custom: true, fix: true, fromFix: true, ask: String(ask).slice(0, LIMITS.instructionChars) });
        renderMenu();
      }
      return '';
    }

    async function confirmLeave() {
      if (queueOn()) {
        if (imp && imp.queued && imp.state === 'applying') return false;
        const yes = await host.confirm({ title: 'Leave and stop Fix major?', text: 'Accepted changes stay.', ok: 'Leave', cancel: 'Stay' });
        if (!yes) return false;
        if (imp && imp.queued && imp.state === 'loading') host.hold(0);
        reset();
        return true;
      }
      if (!busy()) return true;
      if (imp.state === 'applying') return false;
      const yes = await host.confirm({
        title: 'Leave without the suggestion?',
        text: 'You have a suggestion you have not applied. Leave anyway? Your text stays as it is.',
        ok: 'Leave', cancel: 'Stay'
      });
      if (!yes) return false;
      if (imp && imp.abort) imp.abort.abort();
      reset();
      return true;
    }

    function reset() {
      if (imp && imp.abort) imp.abort.abort();
      imp = null;
      fq = null;
      if (menu) { menu.el.remove(); menu = null; }
      if (window.CSS && CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
    }

    return {
      toolbarHtml,
      render,
      refresh,
      onInput,
      busy: () => busy() || queueOn(),
      genWhy: genWhy2,
      confirmLeave,
      reset,
      openFor,
      offText: () => { const w = offWhy(); return w ? (WHY_TEXT[w] || WHY_TEXT.loading) : ''; },
      sectionId: () => (imp ? imp.sid : fq ? fq.sid : null),
      queueStart,
      queueRemove,
      queue: () => (queueMine() ? fq : null),
      fixMenuOpen: () => !!(menu && menu.fromFix)
    };
  }

  window.kdpWriteImprove = { create };
})();
