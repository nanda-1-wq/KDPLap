const U = '00000000-0000-4000-8000-000000000001';
const B1 = 'd1d1d1d1-0000-4000-8000-000000000001';   // chapter count 11 (not a chip), custom target 15000
const B2 = 'd2d2d2d2-0000-4000-8000-000000000002';   // chapters 8 (a chip), range 8-12k
const B3 = 'd3d3d3d3-0000-4000-8000-000000000003';   // only a topic: reader fields empty
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';

// Real-length Brief text (near the 300 / 1000 limits)
const READER = 'Adults over 60 who live alone or with a partner, have stiff knees, hips or shoulders, cannot get down on the floor, and want a gentle way to move every day at home without a class, a mat, or special gear.';
const PROBLEM = 'Most yoga books and videos assume the reader can kneel, lie on the floor, and raise both arms over the head. Readers with arthritis or a replaced hip try a few poses, feel pain or fear a fall, and give up within a week. Classes move too fast and the teacher rarely has time for one slow student. They need short seated routines, clear photos, and a plan that starts very small and grows week by week, so they can build the habit safely and see that it helps with balance, sleep, and getting out of a chair.';

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const brief = (o) => ({ topic_text: 'Chair yoga for seniors with stiff joints', target_reader: READER, reader_problem: PROBLEM, promise_draft: null, book_type: 'beginner_guide',
    trim_size: '6x9', length_range: null, target_words: null, chapter_count: null, options: {}, updated_at: ago(3), ...o });
  const store = globalThis.__store = {
    books: {
      [B1]: { id: B1, title: null, current_step: 1, updated_at: ago(2), brief: brief({ chapter_count: 11, target_words: 15000 }) },
      [B2]: { id: B2, title: null, current_step: 1, updated_at: ago(3), brief: brief({ chapter_count: 8, length_range: '8-12k' }) },
      [B3]: { id: B3, title: null, current_step: 1, updated_at: ago(4), brief: brief({ target_reader: null, reader_problem: null }) }
    },
    calls: [], writes: [], gens: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const view = (b) => ({
    id: b.id, title: b.title, subtitle: null, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: null, series_name: null, series_number: null, title_needs_review: false, title_examples: [],
    pen_names: null, topics: null, book_briefs: { ...b.brief },
    competitors: [{ count: 0 }], real_sources: [{ count: 0 }], positioning: null, chapters: []
  });

  // 0001 + 0007 + 0014, as the mock sees them.
  const LEN = { topic_text: 200, target_reader: 300, reader_problem: 1000, promise_draft: 1000 };
  function check(row) {
    for (const k of Object.keys(LEN)) { const v = row[k]; if (v != null && (!v.trim() || v.length > LEN[k])) return 'book_briefs_' + k + '_length_check'; }
    if (row.chapter_count != null && (row.chapter_count < 3 || row.chapter_count > 30)) return 'book_briefs_chapter_count_check';
    if (row.length_range != null && !['5-8k', '8-12k', '12-20k', '20-30k', '30k+'].includes(row.length_range)) return 'book_briefs_length_range_check';
    if (row.target_words != null && (!Number.isInteger(row.target_words) || row.target_words < 2000 || row.target_words > 150000)) return 'book_briefs_target_words_range_check';
    if (row.length_range != null && row.target_words != null) return 'book_briefs_length_one_value_check';
    return null;
  }

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
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const body = () => JSON.parse(req.postData() || 'null');
    store.calls.push(`${method} ${path}?${decodeURIComponent(query)}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/books' && method === 'GET') {
      if (!param('id')) return json(r, 200, Object.values(store.books).map(view));   // Books page
      const b = store.books[eq('id')];
      const rows = b ? [view(b)] : [];
      return json(r, 200, one ? (rows[0] || null) : rows);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      store.writes.push({ table: 'books', body: body() });
      const b = store.books[eq('id')];
      return json(r, 200, b ? [{ id: b.id, updated_at: new Date().toISOString() }] : []);
    }
    if (path === '/rest/v1/book_briefs' && method === 'PATCH') {
      const patch = body();
      store.writes.push({ table: 'book_briefs', body: patch });
      const b = store.books[eq('book_id')];
      if (!b) return json(r, 200, []);
      const next = { ...b.brief, ...patch };
      const bad = check(next);
      if (bad) return json(r, 400, { code: '23514', message: `new row for relation "book_briefs" violates check constraint "${bad}"` });
      next.updated_at = new Date().toISOString();
      b.brief = next;
      return json(r, 200, [{ book_id: b.id, updated_at: next.updated_at }]);
    }
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: PA, name: 'Nora Hale', voice: {} }]);

    if (path === '/functions/v1/generate') {
      const g = body();
      store.gens.push(g);
      if (g.stage === 'brief_help') {
        const suggestions = mode('suggest') || {
          target_reader: 'Adults over 60 with stiff knees, hips or shoulders who cannot get down on the floor and want a safe, gentle routine they can follow at home on their own.',
          reader_problem: 'Most yoga books assume the reader can kneel, lie down and lift both arms. Readers with arthritis try a few poses, feel pain or fear a fall, and quit within a week.',
          promise_draft: 'After this book, the reader can follow a safe 20-minute seated routine at home, every day, and get up from a chair more easily.'
        };
        const unsourced = mode('unsourced') || { promise_draft: ['20'] };
        return json(r, 200, { stage: 'brief_help', suggestions, unsourced });
      }
      return json(r, 400, { error: 'bad_request' });
    }
    if (path.startsWith('/rest/v1/')) return json(r, 200, one ? null : []);
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
