// Mock for the cover suite (09 Cover, E16 from Part 4). Nothing reaches Supabase.
// It answers as 0030 does: cover_json (book, fmt with null pages without a current Print PDF, pdf, design,
// assets, blurb, my_layouts, key, last), cover_designs insert (rev 1; 23505 on a second one) and the autosave
// update "where book_id = $1 and rev = $rev" (0 rows when the rev moved; rev + 1; the layer caps and the bg
// check as cover_designs' CHECKs), cover_design_history insert.
// Tests change globalThis.__store and globalThis.__modes.
//   __modes: coverFail (n reads of cover_json fail), coverSlow (ms), saveFail (n saves fail), saveSlow (ms),
//   otherTab (n saves find the rev moved: another tab saved), histFail (n snapshots fail), fontsDown (the font CDN)
// Fonts come from tests/browser/.cache/cover-fonts (the Part 2 cache, every file checked against its sha384 there).
const U = '00000000-0000-4000-8000-000000000001';

async function setupCover(page) {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  let seq = 0;
  const id = (p) => `${p}${String(++seq).padStart(7, '0')}-0000-4000-8000-000000000000`;

  const store = globalThis.__store = {
    book: { id: FIX.BOOK, title: FIX.title, subtitle: FIX.subtitle, status: 'in_progress', current_step: 9, updated_at: ago(1), pen_name: FIX.pen, bio: FIX.bio, trim: '6x9', paper: 'white' },
    pdf: { export_id: id('e'), page_count: FIX.fmt.pages, created_at: ago(1), current: true },   // null: no Print PDF
    design: null,                  // the cover_designs row, null before the first open
    history: [],                   // cover_design_history rows
    blurb: null,
    writes: [], calls: [], cdn: [], saves: 0, reads: 0, dialogs: []
  };
  // "Leave site?" (beforeunload while a save is out or failed) must never block the next test: note it, accept it.
  if (!page.__cvDialog) { page.__cvDialog = true; page.on('dialog', (d) => { (globalThis.__store || { dialogs: [] }).dialogs.push(d.type()); d.accept().catch(() => {}); }); }

  const fmtToday = () => ({ trim: store.book.trim, pages: store.pdf && store.pdf.current ? store.pdf.page_count : null, paper: store.book.paper });
  const coverJson = () => ({
    book: { id: FIX.BOOK, title: store.book.title, subtitle: store.book.subtitle, pen_name_id: FIX.PEN, pen_name: store.book.pen_name, bio_text: store.book.bio, trim: store.book.trim, paper: store.book.paper },
    fmt: fmtToday(),
    pdf: store.pdf ? copy(store.pdf) : null,
    design: store.design ? copy(store.design) : null,
    assets: [], blurb: store.blurb ? copy(store.blurb) : null, my_layouts: [],
    key: store.design ? 'k' + store.design.rev : null,
    last: { print: null, image: null, kindle: null },
    now: now()
  });
  const view = () => ({
    id: FIX.BOOK, title: store.book.title, subtitle: store.book.subtitle, status: store.book.status, completed_at: null, current_step: store.book.current_step, updated_at: store.book.updated_at, topic_id: null,
    pen_name_id: FIX.PEN, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: ago(2),
    pen_names: { id: FIX.PEN, name: store.book.pen_name, voice: {} }, topics: null,
    book_briefs: { topic_text: 'Study habits for adults', target_reader: 'Busy adult learners', reader_problem: 'No time to study', promise_draft: 'Study in ten minutes a day', book_type: 'how_to', book_type_label: null, trim_size: store.book.trim, length_range: '8-12k', target_words: null, chapter_count: 5, options: {}, updated_at: ago(2) },
    competitors: [{ count: 3 }], real_sources: [{ count: 1 }], chapters: [{ count: 7 }], review_chapters: [{ count: 0 }],
    positioning: { locked_at: ago(2), one_sentence: 'x', reader_promise: 'y', approach: null, lacks: null, selling_points: [], focus_tags: [], drift_flags: [], drift_checked_at: null, updated_at: ago(2) }
  });
  // cover_designs' CHECKs (0030): layers (cover_layers_ok), bg (cover_hex_ok). The byte cap is measured on the JSON
  // text here (kdpCover.model.pgBytes is the browser's exact measure; tests/limits-parity.test.js holds the parity).
  // The run-code sandbox has no TextEncoder: UTF-8 bytes by code point.
  const utf8 = (str) => { let n = 0; for (const ch of str) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  function badDesign(p) {
    if ('bg' in p && !/^#[0-9A-F]{6}$/.test(p.bg)) return 'bg';
    if ('layers' in p) {
      const L = p.layers;
      if (!Array.isArray(L) || L.length > 200) return 'layers';
      if (utf8(JSON.stringify(L)) > 524288) return 'bytes';
      for (const l of L) {
        if (!l || typeof l !== 'object' || !['number', 'string'].includes(typeof l.id) || !['text', 'image', 'shape'].includes(l.type)) return 'layer';
        if (l.type === 'text' && (typeof l.text !== 'string' || [...l.text].length > 2000)) return 'text';
      }
    }
    const extra = Object.keys(p).filter((k) => !['layers', 'bg', 'fmt', 'layout', 'last_remap'].includes(k));
    return extra.length ? 'columns ' + extra : '';
  }

  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const take = (k) => { if (mode(k) > 0) { globalThis.__modes[k]--; return true; } return false; };
  const wait = (ms) => page.waitForTimeout(ms);
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', headers: cors, body: body === undefined ? '' : JSON.stringify(body) });
  const fail = (r, status, code, message) => json(r, status, { code, message, details: '', hint: null });

  await ctx.route('https://hmtxnbgfzwqawfulwwrg.supabase.co/**', async (r) => {
    try { return await handle(r); } catch (e) { store.calls.push('ERR ' + e.stack); return r.fulfill({ status: 599, body: String(e.stack) }); }
  });
  async function handle(r) {
    const req = r.request();
    const full = req.url().replace(/^https:\/\/[^/]+/, '');
    const qi = full.indexOf('?');
    const path = qi < 0 ? full : full.slice(0, qi);
    const query = qi < 0 ? '' : full.slice(qi + 1);
    const param = (k) => { const m = query.split('&').map((x) => x.split('=')).find((x) => decodeURIComponent(x[0]) === k); return m ? decodeURIComponent(m[1]) : null; };
    const eq = (k) => (param(k) || '').replace(/^eq\./, '');
    const method = req.method();
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const body = () => JSON.parse(req.postData() || 'null');
    store.calls.push(`${method} ${path}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/books' && method === 'GET') {
      if (eq('id') !== FIX.BOOK) return json(r, 200, one ? null : []);
      return json(r, 200, one ? view() : [view()]);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      store.writes.push({ table: 'books', body: body() });
      Object.assign(store.book, body());
      return json(r, 200, [{ id: FIX.BOOK, current_step: store.book.current_step, updated_at: now() }]);
    }
    if (path === '/rest/v1/rpc/cover_json') {
      store.reads++;
      if (mode('coverSlow')) await wait(mode('coverSlow'));
      if (take('coverFail')) return json(r, 500, { message: 'mock: cover read down' });
      return json(r, 200, body().p_book_id === FIX.BOOK ? coverJson() : null);
    }
    if (path === '/rest/v1/cover_designs' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'cover_designs', insert: copy(p) });
      if (store.design) return fail(r, 409, '23505', 'duplicate key value violates unique constraint "cover_designs_pkey"');
      const bad = badDesign({ layers: p.layers, bg: p.bg }) || (p.fmt && p.fmt.pages >= 1 ? '' : 'fmt');
      if (bad) return fail(r, 400, '23514', `mock: bad design: ${bad}`);
      store.design = { book_id: FIX.BOOK, layers: p.layers || [], bg: p.bg || '#FFFFFF', fmt: p.fmt, layout: p.layout || null, last_remap: null, rev: 1, created_at: now(), updated_at: now() };
      return json(r, 201, '');
    }
    if (path === '/rest/v1/cover_designs' && method === 'PATCH') {
      const p = body();
      store.saves++;
      store.writes.push({ table: 'cover_designs', body: copy(p), rev: Number(eq('rev')) });
      if (mode('saveSlow')) await wait(mode('saveSlow'));
      if (take('saveFail')) return json(r, 500, { message: 'mock: save down' });
      if (take('otherTab') && store.design) { store.design.rev++; store.design.updated_at = now(); }
      const bad = badDesign(p);
      if (bad) return fail(r, 400, '23514', `mock: bad design: ${bad}`);
      if (!store.design || eq('book_id') !== FIX.BOOK || store.design.rev !== Number(eq('rev'))) return json(r, 200, []);
      Object.assign(store.design, copy(p), { rev: store.design.rev + 1, updated_at: now() });
      return json(r, 200, [{ rev: store.design.rev, updated_at: store.design.updated_at }]);
    }
    if (path === '/rest/v1/cover_design_history' && method === 'POST') {
      const p = body();
      if (take('histFail')) return json(r, 500, { message: 'mock: history down' });
      const row = { id: id('h'), created_at: now(), ...copy(p) };
      store.history.push(row);
      return json(r, 201, [{ id: row.id, created_at: row.created_at }]);
    }
    // The rail's 07 and 08 marks (design 58 shows them done): a current run, and a current Print PDF when there is one.
    if (path === '/rest/v1/rpc/qc_mark') return json(r, 200, [{ checked_at: ago(1), current: true }]);
    if (path === '/rest/v1/rpc/pdf_marks') return json(r, 200, store.pdf ? [{ book_id: FIX.BOOK, exported_at: store.pdf.created_at, page_count: store.pdf.page_count, changed: !store.pdf.current }] : []);
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: FIX.PEN, name: store.book.pen_name, voice: {} }]);
    if (path.startsWith('/rest/v1/')) return json(r, 200, one ? null : []);
    return json(r, 404, { message: 'mock: unknown' });
  }

  // Cover fonts: the @expo-google-fonts TTFs, jsdelivr and unpkg alike, from the checked Part 2 cache.
  const fontFile = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(@expo-google-fonts\/[^/]+)\/(.+\.ttf)$/;
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, async (r) => {
    const m = r.request().url().match(fontFile);
    if (!m) return r.fallback();
    store.cdn.push(`${m[2]}/${m[3]}`);
    if (mode('fontsDown')) return r.abort();
    return r.fulfill({ path: `${CACHE}/cover-fonts/${m[2]}/${m[3]}`, contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com', user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {} }, JSON.stringify(session));
}

const setup = (page) => setupCover(page);

// Shared helpers for the cover tests.
const CV = {
  url: (step = 9) => `http://127.0.0.1:5500/app/book.html?id=${FIX.BOOK}&step=${step}`,
  /** design: null (first open), 'empty' (a saved empty cover) or 'band' (Band + warm blurb, design 59). */
  async open(page, { design = 'keep', step = 9, ready = true } = {}) {
    const st = globalThis.__store;
    if (design === 'band') { const b = await FIX.band(page); st.design = { book_id: FIX.BOOK, layers: b.layers, bg: b.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    else if (design === 'empty') st.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { ...FIX.fmt }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    else if (design === null) st.design = null;
    await CV.quiet(page);
    await page.goto(CV.url(step), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-step-title]:not(:empty)', { timeout: 10000 });
    if (step === 9 && ready) await CV.ready(page);
  },
  /**
   * Before leaving the page: let the editor forget a save that is out or failed, so "Leave site?" never
   * opens (a beforeunload dialog blocks the playwright-cli session). t-save checks that warning itself.
   */
  async quiet(page) {
    await page.evaluate(() => { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); if (E) E.saver = null; }).catch(() => {});
  },
  /** The editor is drawn (or Locked, or an error). */
  async ready(page) {
    await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && (E.status === 'locked' || E.status === 'error' || (E.status === 'ready' && E.painted > 0)); }, null, { timeout: 20000 });
    await page.waitForTimeout(80);
  },
  state: (page) => page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return E ? { status: E.status, sel: E.sel, editing: E.editing, menu: E.menu, z: E.view.z, px: E.view.px, py: E.view.py, save: E.saveState, layers: E.cover && E.cover.layers, bg: E.cover && E.cover.bg, tpl: E.tpl, painted: E.painted } : null; }),
  /** Wait until autosave is quiet: Saved, or Not saved. */
  async settled(page, want) {
    await page.waitForFunction((w) => {
      const E = window.kdpBookSteps[9]._debug(); if (!E || !E.saver) return false;
      const quiet = E.saveState === 'failed' || (E.saveState === 'saved' && !E.saver.pending());
      return quiet && (!w || E.saveState === w);
    }, want || null, { timeout: 8000 });
  },
  /** The board point (bx, by) in page px. */
  pt: (page, bx, by) => page.evaluate(([x, y]) => { const E = window.kdpBookSteps[9]._debug(); const r = document.querySelector('[data-ws]').getBoundingClientRect(); return [r.left + E.view.px + x * E.view.z, r.top + E.view.py + y * E.view.z]; }, [bx, by]),
  /** The center of a layer's box in page px. */
  center: (page, src) => page.evaluate((s) => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.src === s || x.id === s); const el = document.querySelector(`[data-hit="${l.id}"]`); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, src),
  layer: (page, src) => page.evaluate((s) => { const E = window.kdpBookSteps[9]._debug(); return E.cover.layers.find((x) => x.src === s || x.id === s) || null; }, src),
  /** A pixel of the layer canvas (device px), as [r, g, b, a]. */
  px: (page, x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('[data-canvas]'); const r = c.getBoundingClientRect(); const d = window.devicePixelRatio || 1; return [...c.getContext('2d').getImageData(Math.round((x - r.left) * d), Math.round((y - r.top) * d), 1, 1).data]; }, [x, y]),
  log() {
    const log = globalThis.__log = [];
    return { log, ok: (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`) };
  },
  txt: (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()),
  all: (page, sel) => page.$$eval(sel, (es) => es.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
  has: async (page, sel) => !!(await page.$(sel)),
  noScroll: (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  lastSave: () => [...globalThis.__store.writes].reverse().find((w) => w.table === 'cover_designs' && w.body),
  mockErrors: () => globalThis.__store.calls.filter((c) => c.startsWith('ERR'))
};
