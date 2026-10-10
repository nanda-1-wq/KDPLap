const U = '00000000-0000-4000-8000-000000000001';
const B1 = 'c1c1c1c1-0000-4000-8000-000000000001';   // locked, design 20 outline (8 chapters, 11,100 words)
const B2 = 'c2c2c2c2-0000-4000-8000-000000000002';   // locked, no outline yet
const B3 = 'c3c3c3c3-0000-4000-8000-000000000003';   // unlocked, no outline
const B4 = 'c4c4c4c4-0000-4000-8000-000000000004';   // unlocked after the outline: chapters "Needs review"
const B5 = 'c5c5c5c5-0000-4000-8000-000000000005';   // locked, one section has writing
const B6 = 'c6c6c6c6-0000-4000-8000-000000000006';   // locked, no outline, Brief has no chapter count and no length
const B7 = 'c7c7c7c7-0000-4000-8000-000000000007';   // locked, the only version is blank (the E10.1 live bug): not writing (0019)
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';

// Design 20, real length: [title, objective, [[section title, words], ...]]
const DESIGN = [
  ['Why Chair Yoga Works After 60', 'Reader can explain why seated yoga is safe for stiff joints', [['What changes in our joints after 60', 400], ['Why a chair makes yoga safer', 350], ['What 15 minutes a day can do', 350]]],
  ['Setting Up: Your Chair, Space, and Safety Checks', 'Reader can set up a safe spot in under 5 minutes', [['Choosing a sturdy chair with no wheels', 350], ['Clearing a safe space at home', 300], ['Five safety checks before every session', 350]]],
  ['Breathing and Posture Basics', 'Reader can sit tall and breathe with each move', [['Sitting tall without strain', 400], ['Breathing in time with a move', 400], ['A two-minute check-in to start', 300]]],
  ['Upper Body: Neck, Shoulders, and Arms', 'Reader can do 6 upper-body moves, none overhead', [['Gentle neck turns and tilts', 450], ['Shoulder rolls and seated wings', 450], ['Arm moves that stay below the shoulders', 500]]],
  ['Lower Body: Hips, Knees, and Ankles', 'Reader can do 6 lower-body moves without pain', [['Seated hip openers', 450], ['Knee lifts and slow leg extensions', 500], ['Ankle circles and toe taps', 450]]],
  ['Breathing for Calm and Better Sleep', 'Reader can use 3 breathing patterns before bed', [['The long out-breath', 350], ['Box breathing in a chair', 350], ['A wind-down routine for the evening', 300]]],
  ['Your 4-Week Plan: From 5 to 15 Minutes', 'Reader can follow the plan day by day', [['Week 1 and 2: five gentle minutes', 500], ['Week 3: ten minutes with new moves', 500], ['Week 4: your full 15-minute routine', 500]]],
  ['Staying With It', null, [['What to do on a stiff or tired day', 300], ['Tracking how you feel each week', 300], ['Moving with a friend or a group', 300]]]
];
// The outline fingerprint, copied from js/outline-key.js (tests/outline-key.test.js
// proves the browser and the server agree; the mock plays the server here).
const keyOf = (rows, lockedAt) => {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const parts = [text(lockedAt)];
  for (const c of rows) if (c.kind === 'chapter') parts.push([c.id, text(c.title), text(c.objective), ...(c.sections || []).map((s) => `${s.id}\u0003${text(s.title)}`)].join('\u0001'));
  const s = parts.join('\u0002');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
};
// A real-length AI outline check (E9.2) for the design 20 outline: [kind, chapter numbers, quote, why].
const CHECK = [
  ['overlap', [3, 6], '', 'Both chapters teach seated breathing, so the reader meets the same moves twice and the book feels padded.'],
  ['promise_gap', [], 'without help', 'No chapter shows how to start and adjust the routine alone, which the reader promise says the reader can do.'],
  ['drift', [8], '', 'Moving with a friend or a group is a new angle. The Brief and the research are about safe routines at home.']
];

// What the AI "writes" in the mock: the same plan, new words.
const AI_DESIGN = DESIGN.map(([t, o, s], i) => [t, o || 'Reader can keep going on hard days', s.map(([st, w]) => [st, w + (i % 2 ? 50 : 0)])]);

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  let seq = 0;
  const uid = (p) => `${p}${String(++seq).padStart(7, '0')}-0000-4000-8000-000000000000`;
  const brief = (o) => ({ topic_text: 'Chair yoga for seniors with stiff joints', target_reader: 'Adults over 60 with stiff knees, hips or shoulders', reader_problem: 'Floor poses hurt and classes move too fast.', promise_draft: 'After this book, the reader can follow a safe 15-minute chair routine at home.', book_type: 'beginner_guide',
    trim_size: '6x9', length_range: '8-12k', target_words: null, chapter_count: 8, options: {}, updated_at: ago(3), ...o });
  const pos = (locked) => ({ one_sentence: 'A chair yoga guide for adults over 60.', reader_promise: 'After finishing this book, you can follow a safe 15-minute chair routine at home, every day, without help.', approach: 'Seated poses.', lacks: ['Too hard'], selling_points: ['Safe'], focus_tags: [], drift_flags: [], drift_checked_at: ago(1), locked_at: locked ? ago(1) : null, updated_at: ago(1) });
  const sec = (title, words, extra = {}) => ({ id: uid('5'), position: 0, title, word_target: words, status: 'not_started', needs_review: false, current_version_id: null, ...extra });
  const chap = (kind, title, objective, sections, extra = {}) => ({ id: uid('c'), position: 0, kind, title, objective, include_examples: true, include_exercise: true, needs_review: false, unsourced: [], sections, ...extra });
  const outline = (plan, extra = {}) => {
    const rows = [
      chap('intro', null, null, [sec(null, 1000)]),
      ...plan.map(([t, o, s]) => chap('chapter', t, o, s.map(([st, w]) => sec(st, w)), extra)),
      chap('conclusion', null, null, [sec(null, 700)])
    ];
    rows.forEach((c, i) => { c.position = i; c.sections.forEach((s, j) => { s.position = j + 1; }); });
    return rows;
  };
  const written = outline(DESIGN);
  written[1].sections[0].current_version_id = uid('7');
  // 0019: the Introduction's only version is blank, so has_writing is false.
  const blankOnly = outline(DESIGN);
  Object.assign(blankOnly[0].sections[0], { current_version_id: uid('7'), has_writing: false });
  // E10.1: a section with only a draft (0018 has_writing) counts as writing too.
  Object.assign(written[2].sections[1], { has_draft: true, has_writing: true });
  const book = (id, o) => ({ id, title: 'Chair Yoga for Seniors Over 60', subtitle: 'Gentle 15-Minute Routines', title_needs_review: false, title_examples: [], current_step: 5, updated_at: ago(2), pen_name_id: PA, series_name: null, series_number: null, outline_approved_at: null, ...o });
  const store = globalThis.__store = {
    books: {
      [B1]: book(B1, { brief: brief({}), pos: pos(true) }),
      [B2]: book(B2, { brief: brief({}), pos: pos(true) }),
      [B3]: book(B3, { brief: brief({}), pos: pos(false) }),
      [B4]: book(B4, { brief: brief({}), pos: pos(false) }),
      [B5]: book(B5, { brief: brief({}), pos: pos(true) }),
      [B6]: book(B6, { brief: brief({ length_range: null, chapter_count: null }), pos: pos(true) }),
      [B7]: book(B7, { brief: brief({}), pos: pos(true) })
    },
    outline: { [B1]: outline(DESIGN), [B2]: [], [B3]: [], [B4]: outline(DESIGN).map((c) => ({ ...c, needs_review: true })) /* unlock marks every row, Introduction and Conclusion too */, [B5]: written, [B6]: [], [B7]: blankOnly },
    checks: {},   // book id → the saved outline check row (0017, written by the "server" only)
    calls: [], writes: [], gens: [], approves: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const delay = (ms) => page.waitForTimeout(ms);
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const ordered = (bid) => store.outline[bid].sort((a, b) => a.position - b.position);
  const view = (b) => ({
    id: b.id, title: b.title, subtitle: b.subtitle, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: b.pen_name_id, series_name: b.series_name, series_number: b.series_number, title_needs_review: b.title_needs_review, title_examples: b.title_examples,
    outline_approved_at: b.outline_approved_at,
    pen_names: { id: PA, name: 'Nora Hale', voice: {} }, topics: null,
    book_briefs: { ...b.brief }, competitors: [{ count: 3 }], real_sources: [{ count: 1 }],
    chapters: [{ count: store.outline[b.id].length }], review_chapters: [{ count: store.outline[b.id].filter((c) => c.needs_review).length }],
    positioning: b.pos ? { ...b.pos } : null
  });
  const chapterOf = (id) => { for (const bid of Object.keys(store.outline)) { const c = store.outline[bid].find((x) => x.id === id); if (c) return { bid, c }; } return null; };
  const sectionOf = (id) => { for (const bid of Object.keys(store.outline)) for (const c of store.outline[bid]) { const s = c.sections.find((x) => x.id === id); if (s) return { bid, c, s }; } return null; };
  // The server's has_writing when the row has it (0019: text only), else any version or draft.
  const isWritten = (s) => (typeof s.has_writing === 'boolean' ? s.has_writing : !!(s.current_version_id || s.has_draft));
  const hasVersion = (c) => c.sections.some(isWritten);
  // 0017: an outline edit clears the approval (the mock plays the trigger).
  const unapprove = (bid) => { if (bid && store.books[bid]) store.books[bid].outline_approved_at = null; };

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
    if (path === '/rest/v1/books' && method === 'PATCH') { const b = store.books[eq('id')]; Object.assign(b, body(), { updated_at: now() }); return json(r, 200, [{ id: b.id, updated_at: b.updated_at }]); }

    if (path === '/rest/v1/rpc/outline_json') {
      if (mode('loadError')) return json(r, 500, { message: 'mock' });
      return json(r, 200, copy(ordered(body().p_book_id)));
    }
    if (path === '/rest/v1/chapters' && method === 'PATCH') {
      const p = body();
      store.writes.push({ table: 'chapters', id: eq('id'), body: p });
      if (mode('saveDelay')) await delay(mode('saveDelay'));
      if (mode('saveError')) return json(r, 500, { message: 'mock' });
      const hit = chapterOf(eq('id'));
      if (!hit) return json(r, 200, []);
      if ((p.title != null && (p.title.length > 150 || !p.title.trim())) || (p.objective != null && p.objective.length > 300)) return json(r, 400, { code: '23514', message: 'violates check constraint' });
      if (('title' in p && p.title !== hit.c.title) || ('objective' in p && p.objective !== hit.c.objective)) hit.c.unsourced = [];
      if (['title', 'objective', 'include_examples', 'include_exercise'].some((k) => k in p && p[k] !== hit.c[k])) unapprove(hit.bid);
      Object.assign(hit.c, p, { updated_at: now() });
      return json(r, 200, [{ id: hit.c.id, updated_at: hit.c.updated_at }]);
    }
    if (path === '/rest/v1/sections' && method === 'PATCH') {
      const p = body();
      store.writes.push({ table: 'sections', id: eq('id'), body: p });
      if (mode('saveDelay')) await delay(mode('saveDelay'));
      if (mode('saveError')) return json(r, 500, { message: 'mock' });
      const hit = sectionOf(eq('id'));
      if (!hit) return json(r, 200, []);
      if (p.word_target != null && (p.word_target < 0 || p.word_target > 10000)) return json(r, 400, { code: '23514', message: 'violates check constraint' });
      if (['title', 'word_target'].some((k) => k in p && p[k] !== hit.s[k])) unapprove(hit.bid);
      Object.assign(hit.s, p, { updated_at: now() });
      return json(r, 200, [{ id: hit.s.id, updated_at: hit.s.updated_at }]);
    }
    if (path === '/rest/v1/sections' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'sections', method, body: p });
      const hit = chapterOf(p.chapter_id);
      if (!hit) return json(r, 403, { code: '42501', message: 'rls' });
      if (hit.c.sections.length >= (hit.c.kind === 'chapter' ? 12 : 1)) return json(r, 400, { code: 'P0001', message: 'sections_full' });
      const s = sec(null, null, { position: p.position });
      hit.c.sections.push(s);
      unapprove(hit.bid);
      return json(r, 201, [copy(s)]);
    }
    if ((path === '/rest/v1/chapters' || path === '/rest/v1/sections') && method === 'DELETE') {
      const id = eq('id');
      store.writes.push({ table: path.split('/').pop(), method, id });
      if (mode('deleteError')) return json(r, 500, { message: 'mock' });
      if (path.endsWith('chapters')) {
        const hit = chapterOf(id);
        if (hit && hasVersion(hit.c)) return json(r, 400, { code: 'P0001', message: 'has_writing' });
        if (hit) { store.outline[hit.bid] = store.outline[hit.bid].filter((c) => c.id !== id); unapprove(hit.bid); }
        return json(r, 204, undefined, { 'content-range': `*/${hit ? 1 : 0}` });
      }
      const hit = sectionOf(id);
      if (hit && isWritten(hit.s)) return json(r, 400, { code: 'P0001', message: 'has_writing' });
      if (hit) { hit.c.sections = hit.c.sections.filter((s) => s.id !== id); unapprove(hit.bid); }
      return json(r, 204, undefined, { 'content-range': `*/${hit ? 1 : 0}` });
    }
    if (path === '/rest/v1/rpc/add_chapter') {
      const bid = body().p_book_id;
      store.writes.push({ table: 'rpc', fn: 'add_chapter', bid });
      const list = ordered(bid);
      if (list.filter((c) => c.kind === 'chapter').length >= 30) return json(r, 400, { code: 'P0001', message: 'outline_full' });
      if (!list.length) {
        list.push(chap('intro', null, null, [sec(null, null, { position: 1 })], { position: 0 }));
        list.push(chap('conclusion', null, null, [sec(null, null, { position: 1 })], { position: 2 }));
      }
      const end = list.find((c) => c.kind === 'conclusion');
      const at = end ? end.position : list.length;
      if (end) end.position += 1;
      const c = chap('chapter', null, null, [sec(null, null, { position: 1 })], { position: at });
      list.push(c);
      unapprove(bid);
      return json(r, 200, c.id);
    }
    if (path === '/rest/v1/rpc/reorder_chapters') {
      const p = body();
      store.writes.push({ table: 'rpc', fn: 'reorder_chapters', ids: p.p_ids });
      if (mode('reorderError')) return json(r, 500, { message: 'mock' });
      const list = ordered(p.p_book_id);
      const before = list.map((c) => c.position).join();
      list.forEach((c) => { c.position = c.kind === 'intro' ? 0 : c.kind === 'conclusion' ? p.p_ids.length + 1 : p.p_ids.indexOf(c.id) + 1; });
      if (before !== list.map((c) => c.position).join()) unapprove(p.p_book_id);
      return json(r, 200, null);
    }
    if (path === '/rest/v1/outline_checks' && method === 'GET') {
      if (mode('checkLoadError')) return json(r, 500, { message: 'mock' });
      const row = store.checks[eq('book_id')];
      return json(r, 200, row ? [copy(row)] : []);
    }
    if (path === '/rest/v1/rpc/approve_outline') {
      const bid = body().p_book_id;
      store.approves.push(bid);
      if (mode('approveDelay')) await delay(mode('approveDelay'));
      if (mode('approveError') === 'network') return r.abort('failed');
      if (mode('approveError')) return json(r, 400, { code: 'P0001', message: mode('approveError'), details: 'Chapter 9 has no title.' });
      const bk = store.books[bid];
      if (!bk) return json(r, 400, { code: 'P0002', message: 'book_not_found' });
      if (!bk.pos || !bk.pos.locked_at) return json(r, 400, { code: 'P0001', message: 'positioning_not_locked' });
      const chs = ordered(bid).filter((c) => c.kind === 'chapter');
      if (!chs.length) return json(r, 400, { code: 'P0001', message: 'outline_empty' });
      const n = chs.findIndex((c) => !c.title || !c.title.trim());
      if (n >= 0) return json(r, 400, { code: 'P0001', message: 'chapter_untitled', details: `Chapter ${n + 1} has no title.` });
      store.outline[bid].forEach((c) => { c.needs_review = false; });
      bk.outline_approved_at = now();
      return json(r, 200, bk.outline_approved_at);
    }
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: PA, name: 'Nora Hale', voice: {} }]);

    if (path === '/functions/v1/generate') {
      const b = body();
      store.gens.push(b);
      if (mode('genDelay')) await delay(mode('genDelay'));
      const g = mode('gen') || 'ok';
      if (g === 'network') return r.abort('failed');
      if (g !== 'ok') return json(r, { has_writing: 409, positioning_not_locked: 409, rate_limited: 429, ai_unavailable: 502 }[g] || 500, { error: g });
      const bk = store.books[b.bookId];
      if (b.stage === 'outline_check') {
        if (!bk.pos || !bk.pos.locked_at) return json(r, 409, { error: 'positioning_not_locked' });
        const rows = ordered(b.bookId);
        const chs = rows.filter((c) => c.kind === 'chapter');
        if (!chs.some((c) => c.title && c.title.trim())) return json(r, 422, { error: 'nothing_to_check' });
        // The key of the outline the "server" read when the call started.
        const key = keyOf(rows, bk.pos.locked_at);
        if (mode('checkDelay')) await delay(mode('checkDelay'));
        const plan = mode('checkOut') === 'none' ? [] : CHECK;
        const findings = plan.filter(([, n]) => n.every((x) => x <= chs.length))
          .map(([kind, n, quote, why]) => ({ kind, chapters: n.map((x) => chs[x - 1].id), quote, why, unsourced: mode('checkUnsourced') && kind === 'drift' ? ['40'] : [] }));
        store.checks[b.bookId] = { findings, inputs_key: key, checked_at: now() };
        return json(r, 200, { stage: 'outline_check', findings: copy(findings), ...copy(store.checks[b.bookId]) });
      }
      if (b.stage === 'outline_ideas') {
        if (!bk.pos || !bk.pos.locked_at) return json(r, 409, { error: 'positioning_not_locked' });
        if (store.outline[b.bookId].some(hasVersion)) return json(r, 409, { error: 'has_writing' });
        const n = bk.brief.chapter_count || 9;
        const plan = Array.from({ length: n }, (_, i) => AI_DESIGN[i % AI_DESIGN.length]).map(([t, o, s], i) => [i < 8 ? t : `${t} ${i + 1}`, o, s.slice(0, b.sectionsPerChapter)]);
        store.outline[b.bookId] = outline(plan);
        bk.outline_approved_at = null;
        return json(r, 200, { stage: 'outline_ideas', chapters: copy(ordered(b.bookId)), rescaled: !!mode('rescaled'), target: { min: 8000, max: 12000, aim: 10000, source: 'range' }, aiPickedChapters: !bk.brief.chapter_count });
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
