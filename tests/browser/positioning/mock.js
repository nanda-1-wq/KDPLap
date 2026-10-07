const U = '00000000-0000-4000-8000-000000000001';
const P1 = 'p1p1p1p1-0000-4000-8000-000000000001'.replace(/p/g, 'a');   // Brief + Research gaps, no positioning row
const P2 = 'b2b2b2b2-0000-4000-8000-000000000002';   // locked positioning, title, 2 chapters (1 written)
const P3 = 'b3b3b3b3-0000-4000-8000-000000000003';   // no topic in the Brief, empty positioning
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const T1 = '11111111-0000-4000-8000-000000000001';

// Real-length text (design 17 plus near-limit lines)
const TXT = {
  one: 'A beginner-friendly chair yoga guide that helps adults over 60 with stiff joints move safely every day, using short seated routines they can do at home.',
  promise: 'After finishing this book, you can follow a safe 15-minute chair routine at home, every day, without help.',
  approach: 'Every pose has a no-arms-overhead version and a clear photo. A 4-week plan grows from 5 to 15 minutes a day. Large, easy-to-read print throughout.',
  lacks: ['Poses too hard for readers with knee or hip pain', 'No versions for people who can’t raise their arms overhead', 'No plan that grows week by week'],
  points: ['Safe for stiff knees, hips, and shoulders', '15 minutes a day, no mat, no gym', 'A 4-week plan you can follow on your own', 'Large print and a photo for every pose'],
  tags: ['Limited mobility', 'Shoulder-friendly', '4-week plan', 'Large print']
};
const LONG_ONE = 'A beginner-friendly chair yoga guide for adults over 60 with stiff knees, hips or shoulders, who want to move safely every day without getting down on the floor, using short seated routines, clear photos, a no-arms-overhead version of every pose, and a gentle four-week plan they can follow at home on their own, in large print that is easy to read, with rest days built in.';

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const brief = (o) => ({ topic_text: 'Chair yoga for seniors with stiff joints', target_reader: 'Adults over 60 with stiff knees, hips or shoulders', reader_problem: 'Floor poses hurt and classes move too fast.', promise_draft: 'After this book, the reader can follow a safe 15-minute chair routine at home.', book_type: 'beginner_guide',
    trim_size: '6x9', length_range: null, chapter_count: null, options: {}, updated_at: ago(3), ...o });
  const posRow = (o) => ({ one_sentence: null, reader_promise: null, approach: null, lacks: [], selling_points: [], focus_tags: [], drift_flags: [], drift_checked_at: null, locked_at: null, updated_at: ago(1), ...o });
  const store = globalThis.__store = {
    books: {
      [P1]: { id: P1, title: null, title_needs_review: false, current_step: 3, updated_at: ago(2), topic_id: T1, pen_name_id: PA, brief: brief({}), pos: null, comps: 3, srcs: 1 },
      [P2]: { id: P2, title: 'Chair Yoga for Seniors Over 60', title_needs_review: false, current_step: 4, updated_at: ago(1), topic_id: null, pen_name_id: PA, brief: brief({}), comps: 3, srcs: 1,
        pos: posRow({ one_sentence: TXT.one, reader_promise: TXT.promise, approach: TXT.approach, lacks: TXT.lacks, selling_points: TXT.points, focus_tags: TXT.tags,
          drift_flags: [{ id: 'd1', field: 'one_sentence', quote: 'move safely every day', why: 'Daily use is not in your Brief.', status: 'kept', reason: 'Daily practice is the core of the promise.' }],
          drift_checked_at: '2026-09-26T09:00:00Z', locked_at: '2026-09-26T10:00:00Z' }) },
      [P3]: { id: P3, title: null, title_needs_review: false, current_step: 3, updated_at: ago(2), topic_id: null, pen_name_id: null, brief: brief({ topic_text: null }), pos: null, comps: 0, srcs: 0 }
    },
    gaps: { [P1]: ['A plan that gets harder each week', 'Large print for aging eyes'] },
    chapters: { [P2]: [{ id: 'c1', sections: [{ current_version_id: 'v1' }, { current_version_id: null }] }, { id: 'c2', sections: [{ current_version_id: null }] }] },
    calls: [], writes: [], gens: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const delay = (ms) => page.waitForTimeout(ms);
  const view = (b) => ({
    id: b.id, title: b.title, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: b.topic_id,
    pen_name_id: b.pen_name_id, series_name: null, series_number: null, title_needs_review: b.title_needs_review,
    pen_names: b.pen_name_id ? { id: PA, name: 'Nora Hale', voice: {} } : null,
    topics: b.topic_id ? { id: T1, name: 'Chair yoga', checks_passed: 5 } : null,
    book_briefs: { ...b.brief },
    competitors: [{ count: b.comps }],
    real_sources: [{ count: b.srcs }],
    positioning: b.pos ? { ...b.pos } : null
  });

  // Migration 0010, as the mock sees it.
  const TEXT_KEYS = ['one_sentence', 'reader_promise', 'approach', 'lacks', 'selling_points', 'focus_tags'];
  const LIM = { one_sentence: 400, reader_promise: 600, approach: 1200 };
  const LISTS = { lacks: [6, 200], selling_points: [8, 160], focus_tags: [8, 40] };
  const shapeOk = (row) => TEXT_KEYS.every((k) => {
    const v = row[k];
    if (k in LIM) return v == null || (typeof v === 'string' && v.trim() && v.length <= LIM[k]);
    return Array.isArray(v) && v.length <= LISTS[k][0] && v.every((t) => typeof t === 'string' && t.trim() && t.length <= LISTS[k][1]);
  });
  const stripFlag = (f) => JSON.stringify({ id: f.id, field: f.field, quote: f.quote, why: f.why });
  function applyPos(b, patch) {
    const old = b.pos || posRow({});
    const next = { ...old, ...patch };
    const textChanged = TEXT_KEYS.some((k) => JSON.stringify(next[k]) !== JSON.stringify(old[k]));
    if (old.locked_at) {
      if (textChanged || JSON.stringify(next.drift_flags) !== JSON.stringify(old.drift_flags)) return { error: { code: 'P0001', message: 'positioning_locked', details: 'The positioning is locked. Unlock it to edit.' } };
      next.locked_at = old.locked_at;
      return { row: next };
    }
    if ('drift_checked_at' in patch) return { error: { code: 'P0001', message: 'drift_check_server_only' } };
    if ('drift_flags' in patch) {
      const a = old.drift_flags, n = patch.drift_flags;
      if (!Array.isArray(n) || n.length !== a.length || n.some((f, i) => stripFlag(f) !== stripFlag(a[i]))) return { error: { code: 'P0001', message: 'drift_flags_server_only' } };
      if (n.some((f) => (f.status === 'kept' && !f.reason.trim()) || (f.status === 'open' && f.reason !== ''))) return { error: { code: '23514', message: 'violates check constraint' } };
    }
    if (!shapeOk(next)) return { error: { code: '23514', message: 'violates check constraint' } };
    if (textChanged) next.drift_checked_at = null;
    if (patch.locked_at) {
      const missing = [];
      ['one_sentence', 'reader_promise', 'approach'].forEach((k) => { if (!(next[k] || '').trim()) missing.push(k); });
      if (!next.lacks.length) missing.push('lacks');
      if (!next.selling_points.length) missing.push('selling_points');
      if (missing.length) return { error: { code: 'P0001', message: 'positioning_not_ready', details: `Missing: ${missing.join(', ')}.` } };
      if (!next.drift_checked_at) return { error: { code: 'P0001', message: 'positioning_not_ready', details: 'Run the drift check first.' } };
      if (next.drift_flags.some((f) => f.status === 'open')) return { error: { code: 'P0001', message: 'positioning_not_ready', details: 'Resolve the drift flags first.' } };
      next.locked_at = new Date().toISOString();
    }
    next.updated_at = new Date().toISOString();
    return { row: next };
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
      const b = store.books[eq('id')];
      return json(r, 200, b ? [view(b)] : []);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') { store.writes.push({ table: 'books', body: body() }); return json(r, 200, []); }
    // Brief saves from step 01; __modes.briefError makes them fail (500).
    if (path === '/rest/v1/book_briefs' && method === 'PATCH') {
      const b = store.books[eq('book_id')];
      store.writes.push({ table: 'book_briefs', body: body(), failed: !!mode('briefError') });
      if (mode('briefError')) return json(r, 500, { message: 'mock' });
      if (!b) return json(r, 200, []);
      b.brief = { ...b.brief, ...body(), updated_at: new Date().toISOString() };
      return json(r, 200, [{ book_id: b.id, updated_at: b.brief.updated_at }]);
    }

    if (path === '/rest/v1/positioning') {
      const b = store.books[eq('book_id')] || store.books[(body() || {}).book_id];
      if (method === 'GET') return json(r, 200, b && b.pos ? [{ ...b.pos }] : []);
      const patch = body();
      store.writes.push({ table: 'positioning', method, body: patch, onConflict: param('on_conflict'), lockedFilter: param('locked_at') });
      if (mode('saveDelay')) await delay(mode('saveDelay'));
      if (mode('posError')) { const e = mode('posError'); if (mode('posErrorOnce')) globalThis.__modes.posError = null; return json(r, e.status || 500, e.body || { message: 'mock' }); }
      if (!b) return json(r, 200, []);
      if (method === 'PATCH' && param('locked_at') === 'is.null' && b.pos && b.pos.locked_at) return json(r, 200, []);
      const clean = { ...patch };
      delete clean.book_id;
      const res = applyPos(b, clean);
      if (res.error) return json(r, 400, res.error);
      b.pos = res.row;
      b.updated_at = res.row.updated_at;
      return json(r, method === 'POST' ? 201 : 200, [{ ...b.pos }]);
    }

    if (path === '/rest/v1/rpc/unlock_positioning') {
      const bid = body().p_book_id;
      const b = store.books[bid];
      store.writes.push({ table: 'rpc/unlock_positioning', body: body() });
      if (mode('unlockDelay')) await delay(mode('unlockDelay'));
      if (mode('unlockError')) { globalThis.__modes.unlockError = null; return json(r, 500, { message: 'mock' }); }
      if (!b || !b.pos || !b.pos.locked_at) return json(r, 400, { code: 'P0002', message: 'positioning_not_locked' });
      b.pos = { ...b.pos, locked_at: null };
      const title = !!b.title;
      if (title) b.title_needs_review = true;
      const ch = store.chapters[bid] || [];
      return json(r, 200, { title, chapters: ch.length, written_chapters: ch.filter((c) => c.sections.some((s) => s.current_version_id)).length });
    }

    if (path === '/rest/v1/chapters' && method === 'GET') {
      if (mode('impactError')) return json(r, 500, { message: 'mock' });
      return json(r, 200, store.chapters[eq('book_id')] || []);
    }
    if (path === '/rest/v1/research_insights' && method === 'GET') {
      if (mode('gapsError')) return json(r, 500, { message: 'mock' });
      const g = store.gaps[eq('book_id')];
      return json(r, 200, g ? [{ gaps: g.map((text) => ({ text, from: ['Book'], edited: false })) }] : []);
    }

    if (path === '/functions/v1/generate') {
      const b = body();
      store.gens.push(b);
      if (mode('genDelay')) await delay(mode('genDelay'));
      const g = mode('gen') || 'ok';
      if (g === 'network') return r.abort('failed');
      if (g !== 'ok') {
        const status = { monthly_limit: 429, rate_limited: 429, ai_unavailable: 502, ai_stopped: 502, not_found: 404, not_enough_facts: 422, nothing_to_check: 422, positioning_locked: 409, positioning_changed: 409 }[g];
        return json(r, status, { error: g, ...(g === 'not_enough_facts' ? { missing: 'Say who the book is for.' } : {}) });
      }
      const book = store.books[b.bookId];
      if (b.stage === 'positioning_help') {
        const all = mode('help') || {
          one_sentence: LONG_ONE, reader_promise: 'After finishing this book, you can follow a safe 20-minute chair routine at home, every day, without help.',
          lacks: ['Poses too hard for knee or hip pain', 'No versions for people who can’t raise their arms'],
          approach: 'Every pose has a seated version and a clear photo. A 4-week plan grows from 5 to 15 minutes a day. Large, easy-to-read print throughout, with rest days for sore joints.',
          selling_points: TXT.points, focus_tags: ['Limited mobility', 'Large print', 'Seated routines']
        };
        const keys = b.field ? [b.field] : Object.keys(all);
        const suggestions = {};
        keys.forEach((k) => { if (all[k] !== undefined) suggestions[k] = all[k]; });
        const unsourced = {};
        if (suggestions.reader_promise && suggestions.reader_promise.includes('20-minute')) unsourced.reader_promise = ['20'];
        return json(r, 200, { stage: 'positioning_help', suggestions, unsourced });
      }
      if (b.stage === 'drift_check') {
        const raw = mode('flags') || [{ field: 'one_sentence', quote: 'every day', why: 'Daily practice is not in your Brief or Research. It may promise more than the book gives.' }];
        const prev = (book.pos && book.pos.drift_flags) || [];
        const flags = raw.map((f, i) => {
          const k = prev.find((p) => p.status === 'kept' && p.field === f.field && p.quote.toLowerCase() === f.quote.toLowerCase());
          return { id: `d${i + 1}`, field: f.field, quote: f.quote, why: f.why, status: k ? 'kept' : 'open', reason: k ? k.reason : '' };
        });
        const at = new Date().toISOString();
        book.pos = { ...book.pos, drift_flags: flags, drift_checked_at: at, updated_at: at };
        return json(r, 200, { stage: 'drift_check', flags, drift_checked_at: at, updated_at: at });
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
