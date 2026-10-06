const U = '00000000-0000-4000-8000-000000000001';
const P1 = 'a1a1a1a1-0000-4000-8000-000000000001';   // Brief check book
const P2 = 'b2b2b2b2-0000-4000-8000-000000000002';   // locked positioning, no title yet
const P4 = 'b4b4b4b4-0000-4000-8000-000000000004';   // unlocked positioning, title marked "Needs review"
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';

// Real-length titles (design 19)
const IDEAS = [
  { title: 'Chair Yoga for Seniors Over 60', subtitle: 'Gentle 15-Minute Routines to Improve Balance, Flexibility, and Confidence at Home', reason: 'A clear age and a small time promise. The main keyword opens the title.', keywords: ['chair yoga', 'seniors'], unsourced: [] },
  { title: 'Seated Yoga Made Simple', subtitle: 'A 4-Week Plan for Seniors With Stiff Joints and Limited Mobility', reason: 'Names the exact reader and the plan, which no competitor offers.', keywords: ['seated yoga', 'limited mobility'], unsourced: [] },
  { title: 'The Complete Chair Yoga Book', subtitle: 'Everything Seniors Need to Stretch, Strengthen, and Stay Steady', reason: 'Broad promise, strong keyword.', keywords: ['chair yoga'], unsourced: [] },
  { title: 'Pain-Free Movement After 60', subtitle: 'Gentle Chair Routines for Stiff Knees, Hips, and Shoulders', reason: 'Speaks to the main fear of the reader.', keywords: ['chair exercises'], unsourced: [] },
  { title: 'Chair Yoga in 6 Weeks', subtitle: 'Free Bonus Inside: Easy Daily Stretches for Older Adults', reason: 'A short plan in the title.', keywords: ['chair yoga'], unsourced: ['6'] },
  ...Array.from({ length: 5 }, (_, i) => ({ title: `Steady Seated Practice ${['One', 'Two', 'Three', 'Four', 'Five'][i]}`, subtitle: 'Calm Daily Stretches for Older Adults at Home', reason: 'Calm and steady tone.', keywords: [], unsourced: [] }))
];

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const brief = (o) => ({ topic_text: 'Chair yoga for seniors with stiff joints', target_reader: 'Adults over 60 with stiff knees, hips or shoulders', reader_problem: 'Floor poses hurt and classes move too fast.', promise_draft: 'After this book, the reader can follow a safe 15-minute chair routine at home.', book_type: 'beginner_guide',
    trim_size: '6x9', length_range: null, chapter_count: null, options: {}, updated_at: ago(3), ...o });
  const pos = (locked) => ({ one_sentence: 'A chair yoga guide for adults over 60.', reader_promise: 'After finishing this book, you can follow a safe routine.', approach: 'Seated poses.', lacks: ['Too hard'], selling_points: ['Safe'], focus_tags: [], drift_flags: [], drift_checked_at: ago(1), locked_at: locked ? ago(1) : null, updated_at: ago(1) });
  let seq = 0;
  const store = globalThis.__store = {
    books: {
      [P1]: { id: P1, title: null, subtitle: null, title_needs_review: false, title_examples: [], current_step: 1, updated_at: ago(2), pen_name_id: null, brief: brief({}), pos: null, series_name: null, series_number: null },
      [P2]: { id: P2, title: null, subtitle: null, title_needs_review: false, title_examples: [], current_step: 4, updated_at: ago(2), pen_name_id: PA, brief: brief({}), pos: pos(true), series_name: 'Gentle Movement', series_number: 1 },
      [P4]: { id: P4, title: 'Chair Yoga Basics', subtitle: 'Seated Stretches for Seniors', title_needs_review: true, title_examples: ['Gentle Chair Yoga for Beginners: Easy Seated Stretches for Seniors'], current_step: 4, updated_at: ago(2), pen_name_id: PA, brief: brief({}), pos: pos(false), series_name: null, series_number: null }
    },
    options: { [P2]: [], [P4]: [] },
    competitors: { [P2]: [{ title: 'The Complete Chair Yoga Handbook: Seated Poses for Every Body', author: 'R. Palmer' }, { title: 'Gentle Chair Yoga for Beginners', author: 'Mara Quinn' }], [P4]: [] },
    calls: [], writes: [], gens: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const delay = (ms) => page.waitForTimeout(ms);
  const view = (b) => ({
    id: b.id, title: b.title, subtitle: b.subtitle, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: b.pen_name_id, series_name: b.series_name, series_number: b.series_number, title_needs_review: b.title_needs_review, title_examples: b.title_examples,
    pen_names: b.pen_name_id ? { id: PA, name: 'Nora Hale', voice: {} } : null, topics: null,
    book_briefs: { ...b.brief }, competitors: [{ count: 3 }], real_sources: [{ count: 1 }], positioning: b.pos ? { ...b.pos } : null
  });
  const combined = (t, s) => (t || '').length + (s == null ? 0 : 2 + s.length);
  const newOpt = (bid, t) => ({ id: `0000${String(++seq).padStart(4, '0')}-0000-4000-8000-000000000000`, ...t, shortlisted: false, created_at: new Date(Date.now() + seq).toISOString() });

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
    const method = req.method();
    const eq = (k) => (param(k) || '').replace(/^eq\./, '');
    const body = () => JSON.parse(req.postData() || 'null');
    store.calls.push(`${method} ${path}?${decodeURIComponent(query)}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/books' && method === 'GET') { const b = store.books[eq('id')]; return json(r, 200, b ? [view(b)] : []); }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      const b = store.books[eq('id')]; const p = body();
      store.writes.push({ table: 'books', body: p });
      if (mode('saveDelay')) await delay(mode('saveDelay'));
      if (!b) return json(r, 200, []);
      const next = { ...b, ...p };
      // 0011 as the mock sees it
      if ((next.title_examples || []).length > 3 || combined(next.title, next.subtitle) > 200) return json(r, 400, { code: '23514', message: 'violates check constraint' });
      if (b.title_needs_review && p.title_needs_review === false && !(b.pos && b.pos.locked_at)) return json(r, 400, { code: 'P0001', message: 'positioning_not_locked' });
      Object.assign(b, p, { updated_at: new Date().toISOString() });
      return json(r, 200, [{ id: b.id, title: b.title, subtitle: b.subtitle, title_needs_review: b.title_needs_review, updated_at: b.updated_at }]);
    }
    if (path === '/rest/v1/book_briefs' && method === 'PATCH') {
      store.writes.push({ table: 'book_briefs', body: body() });
      if (mode('briefError')) return json(r, 400, { code: '23514', message: 'violates check constraint' });
      const b = store.books[eq('book_id')]; Object.assign(b.brief, body(), { updated_at: new Date().toISOString() });
      return json(r, 200, [{ book_id: b.id, updated_at: b.brief.updated_at }]);
    }
    if (path === '/rest/v1/title_options') {
      if (method === 'GET') {
        if (mode('loadError')) return json(r, 500, { message: 'mock' });
        return json(r, 200, (store.options[eq('book_id')] || []).map((o) => ({ ...o })));
      }
      const id = eq('id');
      const bid = Object.keys(store.options).find((k) => store.options[k].some((o) => o.id === id));
      const list = bid ? store.options[bid] : [];
      const o = list.find((x) => x.id === id);
      store.writes.push({ table: 'title_options', method, id, body: method === 'PATCH' ? body() : null, filter: param('shortlisted') });
      if (method === 'PATCH') { if (mode('starError')) return json(r, 500, { message: 'mock' }); if (!o) return json(r, 200, []); o.shortlisted = body().shortlisted; return json(r, 200, [{ ...o }]); }
      if (method === 'DELETE') {
        const ok = o && !(param('shortlisted') === 'eq.false' && o.shortlisted);
        if (ok) store.options[bid] = list.filter((x) => x.id !== id);
        return json(r, 204, undefined, { 'content-range': `*/${ok ? 1 : 0}` });
      }
    }
    if (path === '/rest/v1/competitors' && method === 'GET') return json(r, 200, store.competitors[eq('book_id')] || []);
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: PA, name: 'Nora Hale', voice: {} }]);

    if (path === '/functions/v1/generate') {
      const b = body();
      store.gens.push(b);
      if (mode('genDelay')) await delay(mode('genDelay'));
      const g = mode('gen') || 'ok';
      if (g === 'network') return r.abort('failed');
      if (g !== 'ok') return json(r, { options_full: 409, positioning_not_locked: 409, rate_limited: 429, ai_unavailable: 502 }[g] || 500, { error: g });
      const book = store.books[b.bookId];
      if (b.stage === 'title_ideas') {
        if (!book.pos || !book.pos.locked_at) return json(r, 409, { error: 'positioning_not_locked' });
        const list = store.options[b.bookId];
        const room = Math.min(10, 40 - list.length);
        if (!room) return json(r, 409, { error: 'options_full' });
        const src = mode('ideas') || IDEAS;
        const added = src.slice(0, room).map((t) => newOpt(b.bookId, t));
        list.push(...added);
        return json(r, 200, { stage: 'title_ideas', options: added });
      }
      return json(r, 400, { error: 'bad_request' });
    }
    if (path.startsWith('/rest/v1/')) return json(r, 200, []);
    return json(r, 404, { message: 'mock: unknown' });
  }

  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com',
      user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {} }, JSON.stringify(session));
};
