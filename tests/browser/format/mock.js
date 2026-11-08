// Mock for the format suite (08 Format, E13.2). Nothing reaches Supabase.
// It answers as 0027 does: book_formats is made on the first open (insert, 23505 on a
// second one), its update checks the values 0027 checks, format_json reads it.
// Tests change globalThis.__store and globalThis.__modes.
//   __modes: formatFail (n reads of format_json fail), formatSlow (ms), saveFail (n saves fail),
//   saveSlow (ms), trimFail (the Brief trim write fails), statusFail (the Also by status read fails),
//   exportFail (export_json fails)
const U = '00000000-0000-4000-8000-000000000001';
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const FB = 'f1f1f1f1-0000-4000-8000-000000000001';   // the book of design 41
const B2 = 'f2f2f2f2-0000-4000-8000-000000000002';   // same pen name, completed
const B3 = 'f3f3f3f3-0000-4000-8000-000000000003';   // same pen name, in progress

const uid = (p, n) => `${p}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

async function setupFormat(page) {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  let seq = 0;
  const words = (n) => Array.from({ length: n }, (_, i) => ['study', 'small', 'daily', 'habit', 'focus', 'review', 'quiet', 'notes'][i % 8]).join(' ');
  const version = (content) => ({ id: uid('7', ++seq), version_no: 1, content, partial: false, word_count: content.split(/\s+/).length, source: 'manual', label: null, created_at: ago(1) });
  const sec = (position, title, extra = {}) => ({ id: uid('5', ++seq), position, title, status: 'final', needs_review: false, ai: 'draft', unsaved: false, run: null, word_target: 300,
    version: version(`${words(60)}.\n\n${words(60)}.`), ...extra });
  const chap = (position, kind, title, sections) => ({ id: uid('c', ++seq), position, kind, title, objective: kind === 'chapter' ? 'Reader can do this.' : null, needs_review: false, sections });
  const chapters = [
    chap(0, 'intro', 'Introduction', [sec(1, '')]),
    ...['Start small', 'Five minute reviews', 'Spaced practice', 'Quiet corners', 'Busy weeks'].map((t, i) => chap(i + 1, 'chapter', t, [1, 2, 3].map((n) => sec(n, `${t} part ${n}`)))),
    chap(6, 'conclusion', 'Conclusion', [sec(1, '')])
  ];
  const DEFAULTS = () => ({
    style: 'classic', parts: { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: false, also_by: false },
    contents_sections: false, chapter_label: 'chapter', drop_cap: false, recto_start: true, running_header: true, header_title: null,
    paper: 'white', isbn: null, also_by: [], created_at: now(), updated_at: now()
  });

  const store = globalThis.__store = {
    book: { id: FB, title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'Ten minutes a day', status: 'in_progress', current_step: 8, updated_at: ago(1), pen_name: 'Adnan Haroun', bio: 'A teacher of adult learners.', trim: '6x9' },
    brief: { topic_text: 'Study habits for adults', target_reader: 'Busy adult learners', reader_problem: 'No time to study', promise_draft: 'Study in ten minutes a day', trim_size: '6x9' },
    chapters,
    format: null,                    // the book_formats row (null until the first open)
    lastPdf: null,                   // { created_at, page_count } of the last Print PDF
    changed: false,
    candidates: [
      { id: B2, title: 'Worry Less Workbook', subtitle: null, status: 'completed' },
      { id: B3, title: 'Sleep Better Tonight', subtitle: 'A plan', status: 'in_progress' }
    ],
    qcRun: null,                     // { checked_at, current } for qc_mark
    writes: [], calls: [], inserts: 0, formatReads: 0,
    sections: () => chapters.flatMap((c) => c.sections)
  };

  const data = () => ({
    book: { ...copy(store.book), trim: store.brief.trim_size },
    known: { brief: copy(store.brief) },
    chapters: copy(chapters),
    now: now()
  });
  const formatJson = () => ({
    book: { id: FB, title: store.book.title, subtitle: store.book.subtitle, pen_name_id: PA, pen_name: store.book.pen_name, trim: store.brief.trim_size },
    settings: store.format ? { book_id: FB, ...copy(store.format) } : null,
    also_by_valid: store.format ? store.format.also_by.filter((id) => store.candidates.some((c) => c.id === id)) : [],
    candidates: store.candidates.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
    key: '0'.repeat(31) + '1',
    last_pdf: store.lastPdf ? copy(store.lastPdf) : null,
    changed: !!store.lastPdf && store.changed,
    now: now()
  });
  const view = () => ({
    id: FB, title: store.book.title, subtitle: store.book.subtitle, status: store.book.status, completed_at: null, current_step: store.book.current_step, updated_at: store.book.updated_at, topic_id: null,
    pen_name_id: PA, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: ago(2),
    pen_names: { id: PA, name: store.book.pen_name, voice: {} }, topics: null,
    book_briefs: { ...store.brief, book_type: 'how_to', book_type_label: null, length_range: '8-12k', target_words: null, chapter_count: 5, options: {}, updated_at: ago(2) },
    competitors: [{ count: 3 }], real_sources: [{ count: 1 }], chapters: [{ count: chapters.length }], review_chapters: [{ count: 0 }],
    positioning: { locked_at: ago(2), one_sentence: 'x', reader_promise: 'y', approach: null, lacks: null, selling_points: [], focus_tags: [], drift_flags: [], drift_checked_at: null, updated_at: ago(2) }
  });

  /** The 0027 checks a page can break. '' when the update is good. */
  function badFormat(p) {
    if ('style' in p && !['classic', 'modern', 'clean', 'warm'].includes(p.style)) return 'style';
    if ('chapter_label' in p && !['chapter', 'number', 'none'].includes(p.chapter_label)) return 'chapter_label';
    if ('paper' in p && !['white', 'cream'].includes(p.paper)) return 'paper';
    if ('parts' in p) {
      const keys = Object.keys(p.parts).sort().join();
      if (keys !== 'about,also_by,conclusion,contents,copyright,intro,title' || Object.values(p.parts).some((v) => typeof v !== 'boolean')) return 'parts';
    }
    if ('header_title' in p && p.header_title !== null && (p.header_title !== p.header_title.trim() || [...p.header_title].length < 1 || [...p.header_title].length > 80)) return 'header_title';
    if ('isbn' in p && p.isbn !== null) {
      if (!/^97[89][0-9]{10}$/.test(p.isbn)) return 'isbn';
      let s = 0; for (let i = 0; i < 13; i++) s += Number(p.isbn[i]) * (i % 2 ? 3 : 1);
      if (s % 10) return 'isbn';
    }
    if ('also_by' in p && (!Array.isArray(p.also_by) || p.also_by.length > 20 || p.also_by.some((id) => !store.candidates.some((c) => c.id === id)))) return 'also_by';
    return '';
  }

  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const wait = (ms) => page.waitForTimeout(ms);   // the run-code sandbox has no setTimeout
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
      const id = param('id') || '';
      if (id.startsWith('in.')) {
        // The Also by status line (kdp.listBookStatus).
        if (mode('statusFail')) return json(r, 500, { message: 'mock: status down' });
        const ids = id.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''));
        return json(r, 200, store.candidates.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, status: c.status })));
      }
      if (eq('id') !== FB) return json(r, 200, one ? null : []);
      return json(r, 200, one ? view() : [view()]);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      store.writes.push({ table: 'books', body: body() });
      Object.assign(store.book, body());
      return json(r, 200, [{ id: FB, current_step: store.book.current_step, updated_at: now() }]);
    }
    if (path === '/rest/v1/book_briefs' && method === 'PATCH') {
      store.writes.push({ table: 'book_briefs', body: body() });
      if (mode('trimFail')) return json(r, 500, { message: 'mock: brief down' });
      Object.assign(store.brief, body());
      return json(r, 200, [{ book_id: FB, updated_at: now() }]);
    }
    if (path === '/rest/v1/rpc/format_json') {
      store.formatReads++;
      if (mode('formatSlow')) await wait(mode('formatSlow'));
      if (mode('formatFail') > 0) { globalThis.__modes.formatFail--; return json(r, 500, { message: 'mock: format read down' }); }
      return json(r, 200, body().p_book_id === FB ? formatJson() : null);
    }
    if (path === '/rest/v1/book_formats' && method === 'POST') {
      store.inserts++;
      store.writes.push({ table: 'book_formats', insert: body() });
      if (store.format) return json(r, 409, { code: '23505', message: 'duplicate key value violates unique constraint "book_formats_pkey"', details: '' });
      store.format = DEFAULTS();
      return json(r, 201, '');
    }
    if (path === '/rest/v1/book_formats' && method === 'PATCH') {
      const p = body();
      store.writes.push({ table: 'book_formats', body: p });
      if (mode('saveSlow')) await wait(mode('saveSlow'));
      if (mode('saveFail') > 0) { globalThis.__modes.saveFail--; return json(r, 500, { message: 'mock: save down' }); }
      const bad = badFormat(p);
      if (bad) return fail(r, 400, '23514', `mock: bad format: ${bad}`);
      if (!store.format) return json(r, 200, []);
      Object.assign(store.format, copy(p), { updated_at: now() });
      return json(r, 200, [{ book_id: FB, updated_at: store.format.updated_at }]);
    }
    if (path === '/rest/v1/rpc/export_json') {
      if (mode('exportFail')) return json(r, 500, { message: 'mock: export read down' });
      return json(r, 200, data());
    }
    if (path === '/rest/v1/rpc/qc_mark') return json(r, 200, store.qcRun ? [copy(store.qcRun)] : []);
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: PA, name: store.book.pen_name, voice: {} }]);
    if (path.startsWith('/rest/v1/')) return json(r, 200, one ? null : []);
    return json(r, 404, { message: 'mock: unknown' });
  }

  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com', user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {} }, JSON.stringify(session));
}

const setup = (page) => setupFormat(page);

// Shared helpers for the format tests.
const FM = {
  url: (step = 8) => `http://127.0.0.1:5500/app/book.html?id=${FB}&step=${step}`,
  async open(page, step = 8) {
    await page.goto(FM.url(step), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-step-title]:not(:empty)', { timeout: 10000 });
    if (step === 8) await page.waitForSelector('.fmt, .fmt-root .center-state', { timeout: 10000 });
  },
  /** Wait until every 08 save is out (the save line is not "Saving…" and nothing waits). */
  async saved(page) {
    await page.waitForFunction(() => { const m = window.kdpBookSteps[8]; return m.saveState() !== 'saving' && !m.hasUnsaved(); }, null, { timeout: 5000 });
  },
  log() {
    const log = globalThis.__log = [];
    return { log, ok: (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`) };
  },
  txt: (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()),
  all: (page, sel) => page.$$eval(sel, (es) => es.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
  has: async (page, sel) => !!(await page.$(sel)),
  noScroll: (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  lastSave: () => [...globalThis.__store.writes].reverse().find((w) => w.table === 'book_formats' && w.body)
};
