/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: stock pictures (E16 Part 7, plan §7, design 63)
   /js/cover/stock.js   (browser; needs images.js and js/supabase.js stockSearch / stockPick)

   The Pixabay and Unsplash tabs of the Images panel, the wide picker
   ("Find a picture", design 63), its preview, the credits and the stock-down
   state. Searches and picks go through the Edge Function "stock" (the keys
   live only in its Supabase secrets); the browser never fetches a provider's
   API. Result pictures show from the provider's own links while you look
   (Pixabay allows that for search results; Unsplash requires its links).
   Unsplash searches only on Search, Go or Enter until Unsplash production (owner, STOP 7, N10): a new tab or
   filter shows "Press Search to look" ("Press Go to look" in the panel). Pixabay searches by itself.

   A pick:
   - Pixabay: the server finds the picture by its id, stores a copy in your
     uploads (10 MB at most) and returns the cover_assets row.
   - Unsplash: the server sends Unsplash's download ping and returns a linked
     row (no copy, Unsplash rule 1). The screen loads it from images.unsplash.com.
   Then the picture is added to the cover (or replaces the selected one after
   Replace), as an upload would be.

   Credits: "Photo by [name] on Unsplash", both names linked with
   ?utm_source=nicheink&utm_medium=referral; Pixabay results always say they
   come from Pixabay. They show in the picker, the panel and the picture's
   More menu.

   kdpCover.stock.panelHtml(E) / bindPanel(el, E)   the small view in the Images panel
   kdpCover.stock.hostHtml(E)  / bindHost(el, E)    the wide picker over the cover
   kdpCover.stock.open(E, src) / close(E) / escape(E)
   kdpCover.stock.show(E, src)       a source's last answer for the words, or a new search
   kdpCover.stock.creditHtml(row)   the linked credit of a stock picture (or '')
   kdpCover.stock.creditText(row)   the same in plain words
   kdpCover.stock.remoteUrl(row, px) an Unsplash link sized to px on the long side (null otherwise)
   kdpCover.stock.errText(code, src, pick)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LABEL = { pixabay: 'Pixabay', unsplash: 'Unsplash' };
  const LICENSE = { pixabay: ['Pixabay License', 'https://pixabay.com/service/license-summary/'], unsplash: ['Unsplash License', 'https://unsplash.com/license'] };
  const PX_TYPES = [['all', 'Any type'], ['photo', 'Photo'], ['illustration', 'Illustration'], ['vector', 'Vector']];
  const PX_COLORS = [['any', 'Any color'], ['transparent', 'No background'], ['black', 'Black'], ['white', 'White'], ['gray', 'Gray'], ['red', 'Red'],
    ['orange', 'Orange'], ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['pink', 'Pink'], ['brown', 'Brown']];
  // Unsplash's own color filter values (D7: the design listed gray, pink and brown, which Unsplash does not have).
  const UN_COLORS = [['any', 'Any color'], ['black_and_white', 'Black and white'], ['black', 'Black'], ['white', 'White'], ['yellow', 'Yellow'],
    ['orange', 'Orange'], ['red', 'Red'], ['purple', 'Purple'], ['magenta', 'Magenta'], ['green', 'Green'], ['teal', 'Teal'], ['blue', 'Blue']];
  const UTM = 'utm_source=nicheink&utm_medium=referral';
  const Q_MAX = 100, MAX_PAGE = 20, SMALL = 6;
  // Which sources search by themselves when a tab opens or a filter changes. Unsplash: only on Search or Enter
  // until Unsplash production (owner, STOP 7, N10: the demo allows 50 calls an hour). Pixabay's cache answers are free.
  const AUTO = { pixabay: true, unsplash: false };
  const PRESS = 'Press Search to look';
  const NOTE = {
    pixabay: 'Free to use on covers you sell (Pixabay Content License). The app shows that results come from Pixabay. No logos, brands or famous people.',
    unsplash: 'Free to use on covers you sell (Unsplash License). The app shows the photographer and a link. No logos, brands or famous people.'
  };
  const FOOT = {
    pixabay: 'Results from Pixabay. Color "No background" finds PNG pictures with a see-through background. The chosen picture is saved to your uploads.',
    unsplash: 'Photos from Unsplash. Each photo shows its photographer with a link. Unsplash has very few pictures without a background.'
  };
  const I = {
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ── State (one per editor visit) ── */
  function state(E) {
    if (!E.stock) {
      E.stock = {
        src: 'pixabay', draft: '', q: '', hint: false,
        px: { type: 'all', color: 'any', editors: false, safe: true }, un: { color: 'any' },
        res: { pixabay: null, unsplash: null },   // { key, st: 'loading' | 'ok' | 'error', code, list, total, page, more, moreCode }
        open: false, prev: null, busy: null, err: ''
      };
    }
    return E.stock;
  }
  const filters = (S, src) => (src === 'pixabay' ? Object.assign({}, S.px) : Object.assign({}, S.un));
  const keyOf = (S, src) => JSON.stringify([src, S.q.toLowerCase(), filters(S, src)]);
  /** The words as the server checks them: white space folded, trimmed, 100 characters at most. */
  const clean = (v) => [...String(v || '').replace(/\s+/g, ' ').trim()].slice(0, Q_MAX).join('').trim();

  /* ── Words ── */
  function errText(code, src, pick) {
    const name = LABEL[src] || 'The picture service';
    switch (code) {
      case 'rate_limited': return pick ? 'That was a lot of pictures in one minute. Wait a moment, then try again.' : 'That was a lot of searches in one minute. Wait a moment, then try again.';
      case 'too_large': return 'This picture is too big to save (over 10 MB). Pick another one.';
      case 'bad_image': return 'This picture is not a JPG or PNG we can use. Pick another one.';
      case 'not_found': return `This picture is no longer on ${name}. Pick another one.`;
      case 'unauthorized': return 'Your session has ended. Sign in again, then try once more.';
      case 'offline': return C.offline.BLOCKED.stock;   // E16 Part 9: no call while offline (design 73b)
      case 'bad_request': case 'server_error': return pick ? 'We couldn’t add this picture. Try again in a minute.' : 'We couldn’t search right now. Try again in a minute.';
      default: return `${name} is not answering right now. Try again in a minute, or use your own uploads.`;   // design 63 (stock down)
    }
  }
  /** A link we may show: https on the provider's own site only. */
  function safeHref(u, src) {
    const host = src === 'unsplash' ? 'unsplash\\.com' : 'pixabay\\.com';
    return typeof u === 'string' && new RegExp(`^https://${host}/`).test(u) ? u : null;
  }
  const utm = (u) => u + (u.includes('?') ? '&' : '?') + UTM;
  const link = (href, text) => (href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  /** row: a cover_assets row (source + credit) or a search result (source, author, authorUrl, pageUrl). */
  function creditOf(row) {
    if (!row || (row.source !== 'pixabay' && row.source !== 'unsplash')) return null;
    const c = row.credit || row;
    return { src: row.source, author: String(c.author || ''), authorUrl: safeHref(c.authorUrl, row.source), pageUrl: safeHref(c.pageUrl, row.source) };
  }
  function creditHtml(row) {
    const c = creditOf(row);
    if (!c) return '';
    if (c.src === 'unsplash') return `Photo by ${link(c.authorUrl && utm(c.authorUrl), c.author)} on ${link(utm('https://unsplash.com/'), 'Unsplash')}`;
    return `${link(c.pageUrl, 'Pixabay')}${c.author ? `, by ${link(c.authorUrl, c.author)}` : ''}`;
  }
  function creditText(row) {
    const c = creditOf(row);
    if (!c) return '';
    return c.src === 'unsplash' ? `Photo by ${c.author} on Unsplash` : `Pixabay${c.author ? `, by ${c.author}` : ''}`;
  }
  /** The tile line: the design's "green leaf · vector" and "Photo by (photographer) · Unsplash". */
  const caption = (r) => (r.source === 'unsplash' ? `Photo by ${r.author} · Unsplash` : `${r.name} · ${r.type}`);
  /** A linked Unsplash picture at px on its long side (imgix sizes it; the link keeps Unsplash's own parameters). */
  function remoteUrl(row, px) {
    const r = row && row.remote;
    if (!r || typeof r.url !== 'string' || !/^https:\/\/images\.unsplash\.com\//.test(r.url)) return null;
    let u;
    try { u = new URL(r.url); } catch (e) { return null; }
    const w = Number(r.width) || Number(row.width) || 0, h = Number(r.height) || Number(row.height) || 0;
    u.searchParams.delete('w'); u.searchParams.delete('h');
    u.searchParams.set(w >= h ? 'w' : 'h', String(Math.max(1, Math.min(px, Math.max(w, h) || px))));
    u.searchParams.set('fit', 'max');
    return u.href;
  }

  /* ── Search and pick ── */
  async function search(E, src, more) {
    const S = state(E);
    if (!S.q) return;
    const key = keyOf(S, src);
    let r = S.res[src];
    if (more && (!r || r.key !== key || r.st !== 'ok' || r.more || r.page >= MAX_PAGE)) return;
    const page = more ? r.page + 1 : 1;
    if (more) { r.more = true; r.moreCode = null; }
    else r = S.res[src] = { key, st: 'loading', code: null, list: [], total: 0, page: 0, more: false, moreCode: null };
    // E16 Part 9: offline, no call (Pixabay and Unsplash need a connection); a later search tries again.
    if (E.offline) { r.more = false; if (more) r.moreCode = 'offline'; else { r.st = 'error'; r.code = 'offline'; } refresh(E); return; }
    refresh(E);
    let out;
    try { out = await root.kdp.stockSearch({ source: src, q: S.q, page, filters: filters(S, src) }); } catch (e) { out = { error: { code: 'network' } }; }
    if (!E.live() || S.res[src] !== r) return;
    r.more = false;
    if (out.error || !out.data || !Array.isArray(out.data.results)) {
      const code = (out.error && out.error.code) || 'server_error';
      if (more) r.moreCode = code; else { r.st = 'error'; r.code = code; }
    } else {
      r.st = 'ok'; r.page = page; r.total = Number(out.data.total) || 0;
      const have = new Set(r.list.map((x) => x.id));
      r.list = more ? r.list.concat(out.data.results.filter((x) => !have.has(x.id))) : out.data.results;
    }
    refresh(E);
  }
  /** The words in the box → a new search on the source shown (the panel tab or the picker tab). */
  function run(E, src, draft) {
    const S = state(E);
    if (draft != null) S.draft = draft;
    const q = clean(S.draft);
    S.prev = null; S.err = '';
    if (!q) { S.hint = true; refresh(E); return; }
    S.hint = false; S.q = q; S.draft = q;
    search(E, src);
  }
  /** A filter changed: search again when there are words (Unsplash waits for Search, N10). */
  function again(E, src) {
    const S = state(E);
    S.prev = null;
    if (S.q && AUTO[src]) search(E, src); else refresh(E);
  }
  /** Show a source: its last answer when it matches the words and filters, else a new search (Unsplash waits for Search, N10). */
  function show(E, src) {
    const S = state(E);
    S.src = src; S.prev = null; S.err = '';
    const r = S.res[src];
    if (AUTO[src] && S.q && (!r || r.key !== keyOf(S, src) || r.st === 'error')) search(E, src); else refresh(E);
  }
  /** Words in the box but no answer yet for them and these filters, on a source that waits for Search. */
  const waiting = (S, src) => !!S.q && !AUTO[src] && (!S.res[src] || S.res[src].key !== keyOf(S, src));
  const findItem = (E, src, id) => { const r = state(E).res[src]; return r && r.list ? r.list.find((x) => x.id === id) || null : null; };

  async function pick(E, item) {
    const S = state(E);
    if (!item || S.busy) return;
    if (E.offline) { S.err = errText('offline', item.source, true); refresh(E); return; }   // E16 Part 9
    S.busy = item.id; S.err = ''; refresh(E);
    let out;
    try { out = await root.kdp.stockPick({ source: item.source, id: item.id, bookId: E.bookId }); } catch (e) { out = { error: { code: 'network' } }; }
    if (!E.live()) return;
    S.busy = null;
    if (out.error || !out.data || !out.data.asset) { S.err = errText((out.error && out.error.code) || 'server_error', item.source, true); refresh(E); return; }
    const wasOpen = S.open;
    S.open = false; S.prev = null;
    refresh(E);
    C.images.adopt(E, out.data.asset);
    if (wasOpen) { const b = E.root.querySelector('[data-stock-open]'); if (b) b.focus({ preventScroll: true }); }
  }

  /* ── Opening and closing the wide picker ── */
  function open(E, src) {
    const S = state(E);
    S.open = true; S.src = src || S.src; S.prev = null; S.err = '';
    if (E.img) E.img.tab = S.src;
    E.menu = null;
    show(E, S.src);
    E.refreshBars();
    const n = E.root.querySelector('[data-stockdlg] [data-k="sd-q"]');
    if (n) n.focus({ preventScroll: true });
  }
  function close(E) {
    const S = state(E);
    if (!S.open) return;
    S.open = false; S.prev = null; S.err = '';
    refresh(E);
    const b = E.root.querySelector('[data-stock-open]');
    if (b) b.focus({ preventScroll: true });
  }
  /** Escape: the preview goes back to the results; otherwise the picker closes. true when it did something. */
  function escape(E) {
    const S = state(E);
    if (!S.open) return false;
    if (S.prev) { back(E, E.root.querySelector('[data-stock-host]')); return true; }
    close(E);
    return true;
  }
  function focusIn(E, sel) { const n = E.root.querySelector(`[data-stockdlg] ${sel}`); if (n) n.focus({ preventScroll: true }); return n; }
  /** Back to results: the grid where it was, the focus on the PREVIEW pill that opened the preview. */
  function back(E, el) {
    const S = state(E), id = S.prev && S.prev.id;
    S.prev = null; S.err = '';
    refresh(E);
    const b = el.querySelector('[data-sd-body]');
    if (b) b.scrollTop = S.scroll || 0;
    const n = focusIn(E, id ? `[data-stock-look="${CSS.escape(id)}"]` : '[data-sd-q]');
    if (n) n.scrollIntoView({ block: 'nearest' });
  }

  function refresh(E) {
    if (E.panel === 'images' && E.img && E.img.tab !== 'up') E.refreshPanel();
    E.refreshStock();
  }

  /* ── HTML pieces ── */
  const opts = (list, cur) => list.map(([v, label]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`).join('');
  function thumbImg(r, cls) {
    return `<img class="${cls}${r.transparent ? ' is-clear' : ''}" src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">`;
  }
  function tileLabel(E, r) {
    return `${E.replaceId != null ? 'Replace with' : 'Add'} ${r.name}, ${LABEL[r.source]}${r.transparent ? ', no background' : ''}`;
  }

  /** The small view in the Images panel (design 63's panel under the Pixabay or Unsplash tab). */
  function panelHtml(E) {
    const S = state(E), src = E.img.tab, r = S.res[src];
    const fresh = r && r.key === keyOf(S, src);
    const list = fresh && r.st === 'ok' ? r.list.slice(0, SMALL) : [];
    const busy = S.busy != null;
    let body = '';
    if (waiting(S, src)) body = `<p class="cv-help" role="status" data-stock-press>Press Go to look</p>`;   // the panel's button is Go
    else if (!S.q || !r) body = `<p class="cv-help cv-help-sm" data-stock-idle>${S.hint ? 'Type a word, then press Go.' : `Type what you need, for example: study desk. Results come from ${LABEL[src]}.`}</p>`;
    else if (r.st === 'loading' || !fresh) body = `<p class="cv-help" role="status" data-stock-loading>Searching ${LABEL[src]}…</p>`;
    else if (r.st === 'error') body = `<div class="cv-stockerr" role="alert" data-stock-down>${I.warn}<span>${esc(errText(r.code, src))}</span></div>
        <button type="button" class="cv-sbtn" data-k="stk-retry" data-stock-retry>Try again</button>`;
    else if (!list.length) body = '<p class="cv-help" data-stock-none>No pictures match. Try other words or remove a filter.</p>';
    else body = `<div class="cv-uptiles" data-stock-tiles>${list.map((x) => `<button type="button" class="cv-uptile cv-stocktile" data-k="stk-${esc(x.id)}" data-stock-add="${esc(x.id)}" aria-label="${esc(tileLabel(E, x))}"${busy ? ' aria-disabled="true"' : ''}>${thumbImg(x, 'cv-uptile-img')}<span class="cv-uptile-s cv-stock-cap">${esc(caption(x))}</span></button>`).join('')}</div>`;
    return `
      <form class="cv-stocksearch" data-stock-form role="search">
        <input type="search" class="cv-stock-q" maxlength="${Q_MAX}" aria-label="Search ${LABEL[src]}" placeholder="Search ${LABEL[src]}" value="${esc(S.draft)}" data-k="stk-q" data-stock-q>
        <button type="submit" class="cv-sbtn cv-sbtn-ink" data-k="stk-go">Go</button>
      </form>
      ${src === 'pixabay' ? `<button type="button" class="cv-nobg${S.px.color === 'transparent' ? ' is-on' : ''}" aria-pressed="${S.px.color === 'transparent'}" data-k="stk-nobg" data-stock-nobg><span class="cv-nobg-s" aria-hidden="true"></span>No background only</button>` : ''}
      ${S.err && !S.open ? `<p class="cv-uperr" role="alert">${I.warn}<span>${esc(S.err)}</span></p>` : ''}
      ${busy && !S.open ? '<p class="cv-help" role="status" data-stock-busy>Adding the picture to your uploads…</p>' : ''}
      ${body}
      <button type="button" class="cv-sbtn cv-stock-open" data-k="stk-open" data-stock-open>Open large view</button>
      <p class="cv-help cv-help-sm" data-stock-note>${esc(NOTE[src])}</p>`;
  }

  /** The wide picker (design 63): source tabs, the licence link, filters, results or one preview, the source line. */
  function hostHtml(E) {
    const S = state(E);
    if (!S.open) return '';
    const src = S.src, r = S.res[src], fresh = r && r.key === keyOf(S, src);
    const busy = S.busy != null;
    const tab = (k) => `<button type="button" role="tab" class="cv-sd-tab${k === src ? ' is-on' : ''}" aria-selected="${k === src}" data-k="sd-tab-${k}" data-sd-tab="${k}">${LABEL[k]}</button>`;
    const filtersHtml = src === 'pixabay' ? `
        <select class="cv-sd-sel" aria-label="Type" data-k="sd-type" data-sd-f="type">${opts(PX_TYPES, S.px.type)}</select>
        <select class="cv-sd-sel" aria-label="Color" data-k="sd-color" data-sd-f="color">${opts(PX_COLORS, S.px.color)}</select>
        <label class="cv-sd-check"><input type="checkbox" data-k="sd-editors" data-sd-f="editors"${S.px.editors ? ' checked' : ''}>Editors' Choice</label>
        <label class="cv-sd-check"><input type="checkbox" data-k="sd-safe" data-sd-f="safe"${S.px.safe ? ' checked' : ''}>Safe search</label>`
      : `<select class="cv-sd-sel" aria-label="Color" data-k="sd-ucolor" data-sd-f="ucolor">${opts(UN_COLORS, S.un.color)}</select>`;
    let main, count = '';
    const p = S.prev;
    if (p) {
      const inW = p.width / 300, inH = p.height / 300;
      // Can it fill the front cover with its bleed (trim + 0.125 in across, + 0.25 in down) at 300 DPI?
      const g = C.geo.geo(E.cover.fmt);
      const fills = inW >= g.tw + 0.125 && inH >= g.th + 0.25;
      main = `<div class="cv-sd-prev" data-sd-prev>
          <div class="cv-sd-prevbox${p.transparent ? ' is-clear' : ''}"><img src="${esc(p.preview)}" alt="${esc(p.name)}" referrerpolicy="no-referrer" draggable="false"></div>
          <div class="cv-sd-info">
            <h2 class="cv-sd-name">${esc(p.name)}</h2>
            <div class="cv-mono cv-sd-size">${p.width.toLocaleString('en-US')} × ${p.height.toLocaleString('en-US')} px</div>
            <div>Type: ${esc(p.transparent ? `${p.type}, no background` : p.type)}</div>
            <div>Source: ${creditHtml(p)}</div>
            <div class="cv-sd-print ${fills ? 'is-ok' : 'is-warn'}" data-sd-print>${fills ? I.ok : I.warn}<span>Sharp up to ${inW.toFixed(1)} × ${inH.toFixed(1)} in at 300 DPI${fills ? '' : '. Too small to fill the front cover sharply.'}</span></div>
            ${S.err ? `<p class="cv-uperr" role="alert">${I.warn}<span>${esc(S.err)}</span></p>` : ''}
            <span class="cv-grow"></span>
            <button type="button" class="cv-sd-big cv-sd-ink" data-k="sd-add" data-sd-add${busy ? ' aria-disabled="true"' : ''}>${busy ? 'Adding…' : E.replaceId != null ? 'Replace picture' : 'Add to cover'}</button>
            <button type="button" class="cv-sd-big" data-k="sd-back" data-sd-back>Back to results</button>
          </div></div>`;
    } else {
      let inner;
      if (waiting(S, src)) inner = `<p class="cv-sd-msg" role="status" data-stock-press>${PRESS}</p>`;
      else if (!S.q || !r) inner = `<p class="cv-sd-msg" data-stock-idle>${S.hint ? 'Type a word, then press Search.' : 'Type what you need, then press Search.'}</p>`;
      else if (r.st === 'loading' || !fresh) inner = `<p class="cv-sd-msg" role="status" data-stock-loading>Searching ${LABEL[src]}…</p>`;
      else if (r.st === 'error') inner = `<div class="cv-sd-down" role="alert" data-stock-down>${I.warn}<p>${esc(errText(r.code, src))}</p><button type="button" class="cv-sbtn" data-k="sd-retry" data-stock-retry>Try again</button></div>`;
      else if (!r.list.length) { inner = '<p class="cv-sd-msg" data-stock-none>No pictures match. Try other words or remove a filter.</p>'; count = '0 results'; }
      else {
        const moreBtn = r.list.length < r.total && r.page < MAX_PAGE
          ? `<div class="cv-sd-more">${r.moreCode ? `<p class="cv-uperr" role="alert">${I.warn}<span>${esc(errText(r.moreCode, src))}</span></p>` : ''}<button type="button" class="cv-sbtn" data-k="sd-more" data-sd-more${r.more ? ' aria-disabled="true"' : ''}>${r.more ? 'Loading more…' : 'More results'}</button></div>` : '';
        inner = `${S.err ? `<p class="cv-uperr cv-sd-err" role="alert">${I.warn}<span>${esc(S.err)}</span></p>` : ''}
          <div class="cv-sd-grid" data-sd-grid>${r.list.map((x) => `<div class="cv-sd-tile${S.busy === x.id ? ' is-busy' : ''}">
            <button type="button" class="cv-sd-add" data-k="sd-a-${esc(x.id)}" data-stock-add="${esc(x.id)}" aria-label="${esc(tileLabel(E, x))}"${busy ? ' aria-disabled="true"' : ''}>${thumbImg(x, 'cv-sd-img')}</button>
            <button type="button" class="cv-sd-look" data-k="sd-l-${esc(x.id)}" data-stock-look="${esc(x.id)}" aria-label="Preview ${esc(x.name)}">PREVIEW</button>
            <div class="cv-sd-cap">${esc(caption(x))}</div></div>`).join('')}</div>${moreBtn}`;
        count = `${r.total.toLocaleString('en-US')} ${r.total === 1 ? 'result' : 'results'}`;
      }
      main = `<div class="cv-sd-body" data-sd-body>${inner}</div>`;
    }
    if (busy) count = 'Adding the picture to your uploads…';
    return `<div class="cv-sd-wrap" data-stockdlg>
      <div class="cv-sd" role="dialog" aria-modal="true" aria-label="Find a picture">
        <div class="cv-sd-head" role="tablist" aria-label="Picture source">${tab('pixabay')}${tab('unsplash')}
          <span class="cv-grow"></span>
          <a class="cv-sd-lic" href="${LICENSE[src][1]}" target="_blank" rel="noopener" data-k="sd-lic">${LICENSE[src][0]}</a>
          <button type="button" class="cv-sd-x" aria-label="Close" data-k="sd-x" data-sd-close>${I.x}</button></div>
        <form class="cv-sd-filters" role="search" data-sd-form>
          <input type="search" class="cv-sd-q" maxlength="${Q_MAX}" aria-label="Search pictures" placeholder="Search, for example: study desk" value="${esc(S.draft)}" data-k="sd-q" data-sd-q>
          ${filtersHtml}
          <button type="submit" class="cv-sd-go" data-k="sd-go">Search</button>
        </form>
        ${main}
        <div class="cv-sd-foot"><span class="cv-mono" data-sd-count role="status">${esc(count)}</span><span>${esc(FOOT[src])}</span></div>
      </div></div>`;
  }

  /* ── Events ── */
  function bindPanel(el, E) {
    el.addEventListener('click', (e) => {
      if (E.panel !== 'images' || !E.img || E.img.tab === 'up') return;
      const S = state(E), src = E.img.tab;
      const add = e.target.closest('[data-stock-add]');
      if (add) { if (add.getAttribute('aria-disabled') !== 'true') pick(E, findItem(E, src, add.dataset.stockAdd)); return; }
      if (e.target.closest('[data-stock-nobg]')) { S.px.color = S.px.color === 'transparent' ? 'any' : 'transparent'; again(E, 'pixabay'); return; }
      if (e.target.closest('[data-stock-retry]')) { search(E, src); return; }
      if (e.target.closest('[data-stock-open]')) { open(E, src); }
    });
    el.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-stock-form]')) return;
      e.preventDefault();
      const q = e.target.querySelector('[data-stock-q]');
      run(E, E.img.tab, q ? q.value : '');
    });
    el.addEventListener('input', (e) => { if (e.target.matches('[data-stock-q]')) state(E).draft = e.target.value; });
  }

  function bindHost(el, E) {
    el.addEventListener('click', (e) => {
      const S = state(E);
      if (!S.open) return;
      // a click on the gray around the window closes it (as the design's scrim)
      if (e.target.matches('[data-stockdlg]')) { close(E); return; }
      const t = e.target.closest('[data-sd-tab], [data-sd-close], [data-stock-add], [data-stock-look], [data-sd-add], [data-sd-back], [data-stock-retry], [data-sd-more]');
      if (!t || t.getAttribute('aria-disabled') === 'true') return;
      if (t.dataset.sdTab) { if (t.dataset.sdTab !== S.src) { E.img.tab = t.dataset.sdTab; show(E, t.dataset.sdTab); focusIn(E, `[data-sd-tab="${t.dataset.sdTab}"]`); } return; }
      if (t.matches('[data-sd-close]')) { close(E); return; }
      if (t.dataset.stockAdd) { pick(E, findItem(E, S.src, t.dataset.stockAdd)); return; }
      if (t.dataset.stockLook) {
        const b = el.querySelector('[data-sd-body]'); S.scroll = b ? b.scrollTop : 0;
        S.prev = findItem(E, S.src, t.dataset.stockLook); S.err = ''; refresh(E); focusIn(E, '[data-sd-add]'); return;
      }
      if (t.matches('[data-sd-add]')) { pick(E, S.prev); return; }
      if (t.matches('[data-sd-back]')) { back(E, el); return; }
      if (t.matches('[data-stock-retry]')) { search(E, S.src); return; }
      if (t.matches('[data-sd-more]')) {
        // the first new result takes the focus (the More button goes away on the last page)
        const r = S.res[S.src], n = r && r.list ? r.list.length : 0;
        search(E, S.src, true).then(() => {
          const tile = el.querySelectorAll('[data-sd-grid] [data-stock-add]')[n];
          if (tile && (!document.activeElement || document.activeElement === document.body || document.activeElement.matches('[data-sd-more]'))) { tile.focus({ preventScroll: true }); tile.scrollIntoView({ block: 'nearest' }); }
        });
      }
    });
    el.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-sd-form]')) return;
      e.preventDefault();
      const q = e.target.querySelector('[data-sd-q]');
      run(E, state(E).src, q ? q.value : '');
    });
    el.addEventListener('input', (e) => { if (e.target.matches('[data-sd-q]')) state(E).draft = e.target.value; });
    el.addEventListener('change', (e) => {
      const S = state(E), f = e.target.dataset.sdF;
      if (!f) return;
      if (f === 'type') S.px.type = e.target.value;
      else if (f === 'color') S.px.color = e.target.value;
      else if (f === 'editors') S.px.editors = e.target.checked;
      else if (f === 'safe') S.px.safe = e.target.checked;
      else if (f === 'ucolor') S.un.color = e.target.value;
      else return;
      again(E, S.src);
    });
    // Tab stays inside the picker (it is modal).
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !state(E).open) return;
      const all = [...el.querySelectorAll('[data-stockdlg] :is(a[href], button:not([aria-disabled="true"]), input, select)')].filter((n) => n.offsetParent !== null);
      if (!all.length) return;
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  C.stock = { panelHtml, bindPanel, hostHtml, bindHost, open, close, escape, show, creditHtml, creditText, remoteUrl, errText, caption, state, clean, UTM };
})(globalThis);
