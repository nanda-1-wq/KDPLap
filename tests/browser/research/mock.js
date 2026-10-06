const U = '00000000-0000-4000-8000-000000000001';
const R1 = 'c1c1c1c1-0000-4000-8000-000000000001';   // 3 reviewed competitors, 1 source, an insights row from before 0014 (no key)
const R2 = 'c2c2c2c2-0000-4000-8000-000000000002';   // 1 competitor, no source, no insights

// Real-length reviews: several paragraphs (one review per paragraph).
const LOW = (t) => [
  `I bought ${t} for my mother, who is 72 and has bad knees. Half of the poses still ask her to get down on the floor, which she cannot do. The pictures are tiny and the print is small, so she had to ask me to read it to her.`,
  'The routines jump from easy to hard with nothing in between. There is no plan for the first weeks, so we gave up after a few days. I wanted something that grows slowly.',
  'Too much talk about the history of yoga and not enough simple steps. I skipped the first sixty pages.'
].join('\n\n');
const HIGH = (t) => [
  `${t} finally gave me a routine I can do from my kitchen chair. My shoulders feel looser after two weeks and I sleep better.`,
  'Clear photos, calm voice, and every pose has a version for people who cannot lift their arms over their head. My physical therapist liked it too.'
].join('\n\n');
const comp = (i, title, o = {}) => ({
  id: `0000000${i}-cccc-4000-8000-00000000000${i}`, title, author: `Author ${i}`, bsr: 12000 * i, reviews: 300 * i, rating: 4.3, toc: 'Part 1 Getting started\nPart 2 Seated poses\nPart 3 A daily routine',
  low_reviews: LOW(title), high_reviews: HIGH(title), is_authority: 300 * i >= 500, created_at: `2026-10-0${i}T10:00:00Z`, ...o
});

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const brief = { topic_text: 'Chair yoga for seniors with stiff joints', target_reader: 'Adults over 60 with stiff knees, hips or shoulders', reader_problem: 'Floor poses hurt and classes move too fast.', promise_draft: null, book_type: 'beginner_guide',
    trim_size: '6x9', length_range: null, target_words: null, chapter_count: null, options: {}, updated_at: ago(3) };
  const store = globalThis.__store = {
    books: {
      [R1]: { id: R1, current_step: 2, updated_at: ago(2),
        competitors: [comp(1, 'Chair Yoga for Seniors'), comp(2, 'Gentle Yoga After 60'), comp(3, 'Sit and Stretch')],
        sources: [{ id: 's1', kind: 'source', body: 'Adults 65 and older should do balance activities 3 days a week.', citation: 'CDC, Physical Activity Guidelines, 2024', created_at: ago(2) }],
        insights: { loves: [{ text: 'Every pose has a seated version', from: ['Chair Yoga for Seniors'], edited: false }], hates: [{ text: 'Floor poses that older readers cannot do', from: ['Gentle Yoga After 60'], edited: false }], gaps: [{ text: 'A plan that grows week by week', from: ['Sit and Stretch'], edited: false }],
          analyzed_at: ago(1), inputs_key: null, updated_at: ago(1) } },
      [R2]: { id: R2, current_step: 2, updated_at: ago(2), competitors: [comp(1, 'Chair Yoga for Seniors', { low_reviews: null, high_reviews: null })], sources: [], insights: null }
    },
    calls: [], writes: [], gens: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const view = (b) => ({
    id: b.id, title: null, subtitle: null, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: null, series_name: null, series_number: null, title_needs_review: false, title_examples: [],
    pen_names: null, topics: null, book_briefs: { ...brief },
    competitors: [{ count: b.competitors.length }],
    real_sources: [{ count: b.sources.filter((s) => s.kind === 'source').length }],
    positioning: null
  });
  const bookOfComp = (id) => Object.values(store.books).find((b) => b.competitors.some((c) => c.id === id));
  let n = 10;

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
    const out = (r2, status, rows) => json(r2, status, one ? (rows[0] || null) : rows);
    store.calls.push(`${method} ${path}?${decodeURIComponent(query)}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/books' && method === 'GET') {
      const b = store.books[eq('id')];
      return out(r, 200, b ? [view(b)] : []);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') { store.writes.push({ table: 'books', body: body() }); return json(r, 200, []); }

    if (path === '/rest/v1/competitors') {
      if (method === 'GET') { const b = store.books[eq('book_id')]; return json(r, 200, b ? b.competitors.map((c) => ({ ...c })) : []); }
      if (method === 'POST') {
        const rows = [].concat(body());
        const b = store.books[rows[0].book_id];
        store.writes.push({ table: 'competitors', method, body: rows });
        const made = rows.map((x) => { const c = { ...comp(9, ''), ...x, id: `00000000-dddd-4000-8000-0000000000${n++}`, created_at: new Date().toISOString() }; delete c.book_id; return c; });
        made.forEach((c) => { c.is_authority = (c.reviews || 0) >= 500; });
        b.competitors.push(...made);
        return out(r, 201, made.map((c) => ({ ...c })));
      }
      const id = eq('id');
      const b = bookOfComp(id);
      if (method === 'PATCH') {
        store.writes.push({ table: 'competitors', method, id, body: body() });
        if (!b) return json(r, 200, []);
        const c = b.competitors.find((x) => x.id === id);
        Object.assign(c, body());
        return json(r, 200, [{ ...c }]);
      }
      if (method === 'DELETE') {
        store.writes.push({ table: 'competitors', method, id });
        if (!b) return json(r, 200, [], { 'content-range': '*/0' });
        b.competitors = b.competitors.filter((x) => x.id !== id);
        return json(r, 200, [], { 'content-range': '*/1' });
      }
    }

    if (path === '/rest/v1/research_sources') {
      if (method === 'GET') { const b = store.books[eq('book_id')]; return json(r, 200, b ? b.sources.map((s) => ({ ...s })) : []); }
      if (method === 'POST') {
        const x = body();
        const b = store.books[x.book_id];
        store.writes.push({ table: 'research_sources', method, body: x });
        const s = { id: `s${n++}`, kind: x.kind, body: x.body, citation: x.citation || null, created_at: new Date().toISOString() };
        b.sources.push(s);
        return out(r, 201, [{ ...s }]);
      }
    }

    if (path === '/rest/v1/research_insights') {
      if (method === 'GET') { const b = store.books[eq('book_id')]; return out(r, 200, b && b.insights ? [{ ...b.insights }] : []); }
      const x = body();
      const b = store.books[x.book_id || eq('book_id')];
      store.writes.push({ table: 'research_insights', method, body: x });
      if (x.inputs_key != null && !/^[0-9a-f]{8,32}$/.test(x.inputs_key)) return json(r, 400, { code: '23514', message: 'violates check constraint "research_insights_inputs_key_format_check"' });
      const next = { ...(b.insights || {}), ...x, updated_at: new Date().toISOString() };
      delete next.book_id;
      b.insights = next;
      return json(r, method === 'POST' ? 201 : 200, [{ ...next }]);
    }

    if (path === '/functions/v1/generate') {
      const g = body();
      store.gens.push(g);
      const b = store.books[g.bookId];
      if (g.stage === 'review_insights') {
        const reviewed = b.competitors.filter((c) => (c.low_reviews || '').trim() || (c.high_reviews || '').trim());
        if (reviewed.length < 3) return json(r, 422, { error: 'not_enough_books', have: reviewed.length });
        const t = reviewed.map((c) => c.title);
        return json(r, 200, { stage: 'review_insights', analyzed_at: new Date().toISOString(), insights: {
          loves: [{ text: 'Every pose has a seated version and a clear photo', from: [t[0], t[1]] }],
          hates: [{ text: 'Floor poses that readers with bad knees cannot do', from: [t[0]] }],
          gaps: [{ text: 'A plan that grows slowly, week by week', from: [t[1], t[2]] }] } });
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
