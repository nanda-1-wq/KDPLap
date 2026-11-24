/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the Kindle preview (E13.3 Part 3, plan §3)
   /js/format/kindle-preview.js   (used by js/book-format.js; needs the DOM)

   Designs 41d (the live preview) and 41e (its states). It shows the EPUB
   that kdpEpub.build() makes, never a second formatting of the text: the
   spine XHTML files, their style.css, and a small reader sheet (the reader's
   font, the text size, the screen).

   - One <iframe sandbox="allow-same-origin">, nothing more: no script ever
     runs inside it. The parent reads it (same origin) to page it and to
     answer link clicks.
   - srcdoc = every spine file's body, each in its own part that starts a
     new screen (as each spine file does on Kindle). Ids get their part's
     name in front (every chapter file has s1, s2…), and contents links point
     at them. External links lose their href, so they can never navigate the
     frame (no allow-popups either): they do nothing in the preview.
   - Paging: CSS columns, one screen wide. The parent scrolls the frame one
     screen at a time and counts screens = scroll width ÷ screen width.
   - Place (owner, STOP 3 plan): after a change (text size, a rebuild, a
     resize) the reader stays on the same part, at its start. When nothing
     changed in the layout (the frame was only moved, as Full screen does),
     the same screen comes back.
   - A rebuild draws the new frame hidden, then swaps it in, so the old
     screen stays until the new one is ready.

   kdpKindlePreview.create(host, { onChange, onEscape }) → {
     show(built, style) → Promise (the first screen of this build is shown),
     go(±1), goTo(n), size('s'|'m'|'l'), state() → { screen, screens, part, size, ready },
     label() → "Screen 3 of 96", screenOf(id), frames() (tests), destroy()
   }
═══════════════════════════════════════════════════ */

(function (root) {
  'use strict';
  const SIZES = ['s', 'm', 'l'];
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const FONT_WAIT_MS = 1200;   // the first screen waits this long at most for the reader font

  function create(host, { onChange = () => {}, onEscape = () => {} } = {}) {
    const pdoc = host.ownerDocument;
    let frame = null;          // the frame on screen
    let next = null;           // a new build being drawn, hidden
    let size = 'm';
    let style = 'classic';
    let built = null;
    let gen = 0;               // a new build: the layout signature changes
    let m = null;              // the last measure of the shown frame: { W, H, n, parts, sig }
    let screen = 0;
    let pos = null;            // where the reader is: { part, screen, sig }
    let raf = 0;
    let dead = false;

    const tok = (name, fb) => (getComputedStyle(host).getPropertyValue(name).trim() || fb);

    /** The reader sheet: the screen, the reader's font (Source Serif 4 stands in), the text size. */
    function readerCss() {
      const font = '"Source Serif 4", Georgia, serif';
      const ink = tok('--ink', 'black');
      return [
        `html { height: 100%; overflow: hidden; font-size: ${tok(`--app-kp-text-${size}`, '16px')}; }`,
        `body { height: 100%; margin: 0; padding: 0; column-width: 100vw; column-gap: 0; column-fill: auto; font-family: ${font};`,
        `  line-height: ${tok('--app-kp-leading', '1.5')}; color: ${tok('--ink-2', 'black')}; background: ${tok('--surface', 'white')}; overflow-wrap: break-word; -webkit-text-size-adjust: none; }`,
        '.kp-part { break-before: column; -webkit-column-break-before: always; }',
        '.kp-part:first-child { break-before: auto; -webkit-column-break-before: auto; }',
        `h1, h2, h3, h4, h5, h6 { break-after: avoid; -webkit-column-break-after: avoid; color: ${ink}; }`,
        // The EPUB names no font (Q3): Kindle draws "serif" headings in the reader's font (G5). Modern keeps sans-serif.
        style === 'modern' ? '' : `h1, h2, h3, h4, h5, h6, p.chapter-label, p.author { font-family: ${font}; }`,
        'a { color: inherit; text-decoration: underline; }',
        'a:not([href]) { cursor: default; }',
        `:focus-visible { outline: 2px solid ${ink}; outline-offset: 2px; }`
      ].join('\n');
    }

    /** The EPUB spine as one document: a part per file, ids and links kept working, external links inert. */
    function srcdoc(b) {
      const files = new Map(b.files.map((f) => [f.name, f.text]));
      const partOf = new Map(b.spine.map((s) => [s.href, s.id]));
      const out = pdoc.implementation.createHTMLDocument('');
      const parts = [];
      for (const sp of b.spine) {
        const x = new DOMParser().parseFromString(files.get(`OEBPS/${sp.href}`) || '', 'application/xhtml+xml');
        const body = x.getElementsByTagNameNS(XHTML, 'body')[0];
        if (!body || x.getElementsByTagName('parsererror').length) throw new Error(`kindle preview: ${sp.href} could not be read`);
        const part = out.createElement('div');
        part.className = 'kp-part';
        part.id = sp.id;
        for (const n of [...body.childNodes]) part.append(out.importNode(n, true));
        for (const el of part.querySelectorAll('[id]')) el.id = `${sp.id}--${el.id}`;
        for (const a of part.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href');
          const [file, frag] = href.split('#');
          if (/^[a-z][a-z0-9+.-]*:/i.test(href) || !partOf.has(file)) {
            a.removeAttribute('href');           // never navigates, never opens anything
            a.setAttribute('data-kp-external', '');
            continue;
          }
          a.setAttribute('href', `#${frag ? `${partOf.get(file)}--${frag}` : partOf.get(file)}`);
        }
        parts.push(part.outerHTML);
      }
      const css = files.get('OEBPS/style.css') || '';
      const fonts = pdoc.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
      return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kindle preview</title>${fonts ? `<link rel="stylesheet" href="${fonts.getAttribute('href').replace(/"/g, '&quot;')}">` : ''}
<style>${css}</style>
<style id="kp-reader">${readerCss()}</style></head><body>${parts.join('')}</body></html>`;
    }

    const docOf = (f) => { try { return f.contentDocument; } catch (e) { return null; } };
    const scroller = (d) => d.scrollingElement || d.documentElement || null;

    function measure(f) {
      const d = docOf(f);
      const w = f.contentWindow;
      if (!d || !w || !d.body) return null;
      const W = w.innerWidth, H = w.innerHeight;
      if (!W || !H) return null;   // hidden: measured again when it shows
      const se = scroller(d);
      const n = Math.max(1, Math.round(se.scrollWidth / W));
      // The screen an element starts on: its left edge in the frame plus how far the frame is scrolled now.
      const at = (el) => Math.min(n - 1, Math.max(0, Math.floor((el.getBoundingClientRect().left + se.scrollLeft + 1) / W)));
      const parts = [...d.querySelectorAll('.kp-part')].map((p) => ({ id: p.id, screen: at(p) }));
      return { W, H, n, parts, at, doc: d, sig: `${W}x${H}|${size}|${f.__kpGen}` };
    }

    const partAt = (mm, i) => { let id = mm.parts.length ? mm.parts[0].id : null; for (const p of mm.parts) if (p.screen <= i) id = p.id; return id; };

    /** Where to stand after a measure: the same screen when nothing moved, else the start of the same part. */
    function placeFor(mm) {
      if (!pos) return 0;
      if (pos.sig === mm.sig && pos.n === mm.n) return Math.min(pos.screen, mm.n - 1);
      const p = mm.parts.find((x) => x.id === pos.part);
      if (p) return p.screen;
      return Math.min(pos.screen, mm.n - 1);
    }

    function scrollTo(f, i) {
      const d = docOf(f);
      const se = d && scroller(d);
      if (se) se.scrollLeft = i * m.W;   // none while a moved frame loads again: its load places it
    }

    function goTo(i, { quiet = false } = {}) {
      if (!frame || !m) return;
      screen = Math.max(0, Math.min(m.n - 1, i));
      scrollTo(frame, screen);
      pos = { part: partAt(m, screen), screen, sig: m.sig, n: m.n };
      tabbable();
      if (!quiet) onChange(state());
    }

    /**
     * Only the links on the screen the reader sees take the Tab key. Else Tab
     * would focus the first link of the book (the contents) and the browser
     * would scroll the frame there, away from the reader's page.
     */
    function tabbable() {
      if (!placed()) return;
      for (const a of m.doc.querySelectorAll('a[href]')) a.tabIndex = m.at(a) === screen ? 0 : -1;
    }

    /** Listeners on a frame's document (again after every load: moving a frame loads it again). */
    function wire(f) {
      const d = docOf(f);
      const w = f.contentWindow;
      if (!d || !w) return;
      d.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a) return;
        e.preventDefault();
        const h = a.getAttribute('href');
        if (f !== frame || !h || h[0] !== '#' || !m) return;
        const el = d.getElementById(h.slice(1));
        if (el) goTo(m.at(el));
      });
      // The ring around the book while the focus is inside it (the arrow keys page it).
      d.addEventListener('focusin', () => f.classList.add('has-focus'));
      w.addEventListener('focus', () => f.classList.add('has-focus'));   // Tab into the frame: the document gets the focus, no element
      d.addEventListener('focusout', (e) => { if (!e.relatedTarget) f.classList.remove('has-focus'); });
      w.addEventListener('blur', () => f.classList.remove('has-focus'));
      d.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
        else if (e.key === 'Escape') onEscape(e);
      });
      // Focus moving to a link on another screen scrolls the frame: snap to that screen.
      w.addEventListener('scroll', () => {
        // Hidden (display: none) or mid-resize, the frame is laid out at another width: that is not a page turn.
        if (f !== frame || !m || w.innerWidth !== m.W) return;
        const se = scroller(d);
        const i = Math.max(0, Math.min(m.n - 1, Math.round(se.scrollLeft / m.W)));
        if (se.scrollLeft !== i * m.W) se.scrollLeft = i * m.W;
        if (i !== screen) goTo(i);
      });
    }

    /** A frame finished loading (a new build, or the same frame moved): wire it, wait for the font, place it. */
    function onLoad(f) {
      if (dead) return;
      wire(f);
      const d = docOf(f);
      const reader = d && d.getElementById('kp-reader');
      if (reader) reader.textContent = readerCss();   // the size may have changed since the srcdoc was made
      const fonts = d && d.fonts ? d.fonts.ready : Promise.resolve();
      const settle = () => {
        if (dead || !f.isConnected) return;
        if (f === next) swapIn(f);
        else if (f === frame) place();   // the same frame loaded again (moved): back to where the reader was
      };
      Promise.race([fonts, new Promise((r) => setTimeout(r, FONT_WAIT_MS))]).then(settle);
      fonts.then(() => { if (!dead && f === frame && f.isConnected) remeasure(); });
    }

    function swapIn(f) {
      const mm = measure(f);
      if (!mm) { f.__kpWaiting = true; return; }   // hidden: the resize observer comes back to it
      f.__kpWaiting = false;
      const old = frame;
      frame = f;
      next = null;
      m = mm;
      f.classList.remove('is-next');
      f.removeAttribute('aria-hidden');
      f.tabIndex = 0;
      goTo(placeFor(mm), { quiet: true });
      if (old) old.remove();
      const done = f.__kpDone;
      f.__kpDone = null;
      onChange(state());
      if (done) done(state());
    }

    /** Measure the shown frame and stand at the right screen (always scrolls: a reloaded frame starts at 0). */
    function place() {
      const mm = frame && measure(frame);
      if (!mm) return;
      m = mm;
      goTo(placeFor(mm));
    }

    /** A resize or a late font: count again only when the layout changed. */
    function remeasure() {
      if (next && next.__kpWaiting) swapIn(next);
      if (!frame) return;
      const mm = measure(frame);
      if (!mm) return;
      // Shown again with the same layout: the reader's screen, wherever the browser left the scroll while it was hidden.
      if (m && mm.sig === m.sig && mm.n === m.n) { scrollTo(frame, screen); return; }
      m = mm;
      goTo(placeFor(mm));
    }

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(remeasure);
    }) : null;
    if (ro) ro.observe(host);

    /** Show a build. The old screen stays until the new one is placed (same part, at its start). */
    function show(b, st) {
      built = b;
      style = st || 'classic';
      const f = pdoc.createElement('iframe');
      f.setAttribute('sandbox', 'allow-same-origin');
      f.className = 'kp-frame is-next';
      f.title = 'Kindle preview';
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.__kpGen = ++gen;
      f.srcdoc = srcdoc(b);
      if (next) { const n = next; next = null; if (n.__kpDone) n.__kpDone({ superseded: true }); n.remove(); }
      next = f;
      const p = new Promise((res) => { f.__kpDone = res; });
      f.addEventListener('load', () => onLoad(f));
      host.append(f);
      return p;
    }

    function go(d) { if (m) goTo(screen + d); }

    function setSize(s) {
      if (!SIZES.includes(s) || s === size) return;
      size = s;
      for (const f of [frame, next]) {
        const r = f && docOf(f) && docOf(f).getElementById('kp-reader');
        if (r) r.textContent = readerCss();
      }
      place();
    }

    /** Ready: the shown frame is the document that was measured (a moved frame loads again and is placed again). */
    const placed = () => !!(frame && m && docOf(frame) === m.doc);

    function state() {
      return { screen, screens: m ? m.n : 0, part: pos ? pos.part : null, size, ready: placed() };
    }

    const label = () => (m ? `Screen ${screen + 1} of ${m.n}` : '');

    /** The screen an element (a part, or a heading id such as "c02--s1") starts on, or -1. */
    function screenOf(id) {
      if (!placed()) return -1;
      const el = m.doc.getElementById(id);
      return el ? m.at(el) : -1;
    }

    function destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      for (const f of [frame, next]) if (f) f.remove();
      if (next && next.__kpDone) next.__kpDone({ superseded: true });
      frame = next = null;
    }

    return {
      show, go, goTo: (i) => goTo(i), size: setSize, state, label, screenOf, destroy,
      frames: () => [...host.querySelectorAll('iframe')],
      built: () => built
    };
  }

  root.kdpKindlePreview = { create, SIZES };
})(globalThis);
