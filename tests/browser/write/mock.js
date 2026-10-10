const U = '00000000-0000-4000-8000-000000000001';
const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';   // approved, design 22 outline, some writing
const W2 = 'e2e2e2e2-0000-4000-8000-000000000002';   // outline not approved, no writing (gate closed)
const W3 = 'e3e3e3e3-0000-4000-8000-000000000003';   // no outline
const W4 = 'e4e4e4e4-0000-4000-8000-000000000004';   // approval removed by a 05 edit, writing exists
const W5 = 'e5e5e5e5-0000-4000-8000-000000000005';   // a draft from an older version (another tab saved)
const W6 = 'e6e6e6e6-0000-4000-8000-000000000006';   // unlocked after writing: sections "Needs review"
const W7 = 'e7e7e7e7-0000-4000-8000-000000000007';   // a 1,200-word section (scrolling)
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';

// Design 20 / 22, real length: [title, objective, [[section title, words], ...]]
const DESIGN = [
  ['Why Chair Yoga Works After 60', 'Reader can explain why seated yoga is safe for stiff joints', [['What changes in our joints after 60', 400], ['Why a chair makes yoga safer', 350], ['What 15 minutes a day can do', 350]]],
  ['Setting Up: Chair, Space, Safety', 'Reader can set up a safe spot in under 5 minutes', [['Choosing a sturdy chair with no wheels', 350], ['Clearing a safe space at home', 300], ['Five safety checks before every session', 350]]],
  ['Breathing and Posture Basics', 'Reader can sit tall and breathe with each move', [['Sitting tall without strain', 400], ['Breathing in time with a move', 400], ['A two-minute check-in to start', 300]]],
  ['Upper Body: Neck, Shoulders, Arms', 'Reader can do 6 upper-body moves, none overhead', [['Neck turns and tilts', 450], ['Shoulder rolls, both ways', 450], ['Arm circles below the shoulder', 500]]],
  ['Lower Body: Hips, Knees, Ankles', 'Reader can do 6 lower-body moves without pain', [['Seated hip openers', 450], ['Knee lifts and slow leg extensions', 500], ['Ankle circles and toe taps', 450]]],
  ['Breathing for Calm and Sleep', 'Reader can use 3 breathing patterns before bed', [['The long out-breath', 350], ['Box breathing in a chair', 350], ['A wind-down routine for the evening', 300]]],
  ['Your 4-Week Plan', 'Reader can follow the plan day by day', [['Week 1 and 2: five gentle minutes', 500], ['Week 3: ten minutes with new moves', 500], ['Week 4: your full 15-minute routine', 500]]],
  ['Staying With It', 'Reader can keep going on hard days', [['What to do on a stiff or tired day', 300], ['Tracking how you feel each week', 300], ['Moving with a friend or a group', 300]]]
];

// Design 22, 4.2 Shoulder rolls: v1 First draft, v2 Expanded, v3 Humanized (current).
const V1 = '## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness that builds up after long hours of sitting.\n\nLift your shoulders up toward your ears, then roll them back and down in a slow circle. Keep your neck long and your chin level.';
const V2 = '## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.\n\nNow lift your shoulders up toward your ears, then roll them back and down in a slow circle. This gentle yet powerful movement serves as a wonderful foundation for Keep your neck long and your chin level.';
const V3 = '## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.\n\nNow lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level. If anything pinches, make the circle smaller.\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor';
const INTRO = 'Most yoga books start on the floor. This one starts in your chair, because that is where your day already happens.';

const setup = async page => {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const minsAgo = (m) => new Date(Date.now() - m * 60e3).toISOString();
  let seq = 0;
  const uid = (p) => `${p}${String(++seq).padStart(7, '0')}-0000-4000-8000-000000000000`;
  // The 0018 word rule (same as js/word-budget.js count and md_word_count).
  const count = (md) => String(md || '').replace(/^[ \t]*(#{1,6}|[-+]|[0-9]{1,9}[.)])[ \t]+/gm, '').replace(/\*/g, '').split(/[ \t\n\r\f\v]+/).filter(Boolean).length;
  const brief = () => ({ topic_text: 'Chair yoga for seniors with stiff joints', target_reader: 'Adults over 60 with stiff knees, hips or shoulders', reader_problem: 'Floor poses hurt and classes move too fast.', promise_draft: 'After this book, the reader can follow a safe 15-minute chair routine at home.', book_type: 'beginner_guide',
    trim_size: '6x9', length_range: '8-12k', target_words: null, chapter_count: 8, options: {}, updated_at: ago(3) });
  const pos = (locked) => ({ one_sentence: 'A chair yoga guide for adults over 60 with stiff joints.', reader_promise: 'After finishing this book, you can follow a safe 15-minute chair routine at home, every day, without help.', approach: 'Seated poses.', lacks: ['Too hard'], selling_points: ['Safe'], focus_tags: [], drift_flags: [], drift_checked_at: ago(1), locked_at: locked ? ago(1) : null, updated_at: ago(1) });
  const sec = (title, words, extra = {}) => ({ id: uid('5'), position: 0, title, word_target: words, status: 'not_started', needs_review: false, current_version_id: null, ...extra });
  const chap = (kind, title, objective, sections, extra = {}) => ({ id: uid('c'), position: 0, kind, title, objective, include_examples: true, include_exercise: true, needs_review: false, unsourced: [], sections, ...extra });
  const outline = (plan) => {
    const rows = [
      chap('intro', null, null, [sec(null, 1000)]),
      ...plan.map(([t, o, s]) => chap('chapter', t, o, s.map(([st, w]) => sec(st, w)))),
      chap('conclusion', null, null, [sec(null, 700)])
    ];
    rows.forEach((c, i) => { c.position = i; c.sections.forEach((s, j) => { s.position = j + 1; }); });
    return rows;
  };
  const versions = [];   // every section_versions row (0018: insert-only)
  const drafts = {};     // section id → { content, base_version_id, saved_at }
  const addVersion = (s, content, source, extra = {}) => {
    const v = { id: uid('7'), section_id: s.id, version_no: versions.filter((x) => x.section_id === s.id).length + 1, content, word_count: count(content), source, label: null, partial: false, created_at: minsAgo(60), ...extra };
    versions.push(v);
    s.current_version_id = v.id;
    return v;
  };

  // W1: Introduction Final, 1.1 Final, 4.2 three versions (design 22), 4.1 Final.
  const w1 = outline(DESIGN);
  addVersion(w1[0].sections[0], INTRO, 'manual', { created_at: ago(2) }); w1[0].sections[0].status = 'final';
  addVersion(w1[1].sections[0], 'Our joints change as we age. Cartilage gets thinner, and a chair makes the moves safe.', 'manual', { created_at: ago(2) }); w1[1].sections[0].status = 'final';
  addVersion(w1[4].sections[0], 'Turn your head slowly to the right, then to the left. Keep your shoulders still.', 'manual', { created_at: ago(1) }); w1[4].sections[0].status = 'final';
  const s42 = w1[4].sections[1];
  addVersion(s42, V1, 'generate', { created_at: minsAgo(9 * 60) });
  addVersion(s42, V2, 'expand', { created_at: minsAgo(60) });
  addVersion(s42, V3, 'humanize', { created_at: minsAgo(2) });
  s42.status = 'draft';

  // W4: one written section, approval gone.
  const w4 = outline(DESIGN.slice(0, 3));
  addVersion(w4[1].sections[0], 'Our joints change as we age.', 'manual');
  w4[1].sections[0].status = 'draft';

  // W5: section 1.1 has v1, v2 (current, saved in another tab) and a draft from v1.
  const w5 = outline(DESIGN.slice(0, 3));
  const c11 = w5[1].sections[0];
  const v51 = addVersion(c11, 'Our joints change as we age.', 'manual', { created_at: ago(1) });
  addVersion(c11, 'Our joints change as we age. Saved in the other tab.', 'manual', { created_at: minsAgo(5) });
  c11.status = 'draft';
  drafts[c11.id] = { content: 'Our joints change as we age. Typed here, in this tab, before the other tab saved.', base_version_id: v51.id, saved_at: minsAgo(20) };
  // W5 section 1.2: a draft on top of its current version (unsaved changes, no conflict).
  const c12 = w5[1].sections[1];
  const v52 = addVersion(c12, 'A chair makes yoga safer.', 'manual', { created_at: ago(1) });
  c12.status = 'draft';
  drafts[c12.id] = { content: 'A chair makes yoga safer. It holds you steady.', base_version_id: v52.id, saved_at: minsAgo(3) };

  // W6: unlocked after writing.
  const w6 = outline(DESIGN.slice(0, 3));
  addVersion(w6[1].sections[0], 'Our joints change as we age.', 'manual');
  w6[1].sections[0].status = 'reviewed';
  w6[1].sections[0].needs_review = true;
  w6.forEach((c) => { c.needs_review = true; });

  // W7: section 1.1 holds about 1,200 words (headings, lists, paragraphs).
  const w7 = outline(DESIGN.slice(0, 2));
  const para = 'Shoulder rolls ease the stiffness that builds up after long hours of sitting. Lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**, and keep your neck long.';
  const long = Array.from({ length: 12 }, (_, i) => `## Part ${i + 1}\n\n${para}\n\n${para}\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor`).join('\n\n');
  addVersion(w7[1].sections[0], long, 'manual');
  w7[1].sections[0].status = 'draft';
  w7[1].sections[0].word_target = 1200;

  const book = (id, o) => ({ id, title: 'Chair Yoga for Seniors Over 60', subtitle: 'Gentle 15-Minute Routines', title_needs_review: false, title_examples: [], current_step: 6, updated_at: ago(2), pen_name_id: PA, series_name: null, series_number: null, outline_approved_at: null, brief: brief(), pos: pos(true), ...o });
  const store = globalThis.__store = {
    books: {
      [W1]: book(W1, { outline_approved_at: ago(1) }),
      [W2]: book(W2, {}),
      [W3]: book(W3, {}),
      [W4]: book(W4, {}),
      [W5]: book(W5, { outline_approved_at: ago(1) }),
      [W6]: book(W6, { pos: pos(false) }),
      [W7]: book(W7, { outline_approved_at: ago(1) })
    },
    outline: { [W1]: w1, [W2]: outline(DESIGN), [W3]: [], [W4]: w4, [W5]: w5, [W6]: w6, [W7]: w7 },
    versions, drafts, s42: s42.id, c11: c11.id, c12: c12.id, long: w7[1].sections[0].id, count,
    calls: [], writes: []
  };
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const delay = (ms) => page.waitForTimeout(ms);
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const ordered = (bid) => store.outline[bid].sort((a, b) => a.position - b.position);
  const sectionOf = (id) => { for (const bid of Object.keys(store.outline)) for (const c of store.outline[bid]) { const s = c.sections.find((x) => x.id === id); if (s) return { bid, c, s }; } return null; };
  const versionOf = (id) => versions.find((v) => v.id === id) || null;
  // outline_json as 0018 returns it (the words written keys).
  const outlineJson = (bid) => ordered(bid).map((c) => ({
    ...c, sections: c.sections.map((s) => {
      const v = versionOf(s.current_version_id);
      const d = drafts[s.id];
      // 0019: only versions and drafts with text count as writing.
      return { ...s, has_writing: versions.some((x) => x.section_id === s.id && x.content.trim()) || !!(d && d.content.trim()), words: v ? v.word_count : 0, version_at: v ? v.created_at : null,
        has_draft: !!d, draft_words: d ? count(d.content) : null, draft_at: d ? d.saved_at : null };
    })
  }));
  const view = (b) => ({
    id: b.id, title: b.title, subtitle: b.subtitle, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: b.pen_name_id, series_name: b.series_name, series_number: b.series_number, title_needs_review: b.title_needs_review, title_examples: b.title_examples,
    outline_approved_at: b.outline_approved_at,
    pen_names: { id: PA, name: 'Nora Hale', voice: {} }, topics: null,
    book_briefs: { ...b.brief }, competitors: [{ count: 3 }], real_sources: [{ count: 1 }],
    chapters: [{ count: store.outline[b.id].length }], review_chapters: [{ count: store.outline[b.id].filter((c) => c.needs_review).length }],
    positioning: b.pos ? { ...b.pos } : null
  });
  const fail = (r, code, message) => json(r, 400, { code, message, details: '' });

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
    if (path === '/rest/v1/rpc/outline_json') {
      if (mode('outlineError')) return json(r, 500, { message: 'mock' });
      return json(r, 200, copy(outlineJson(body().p_book_id)));
    }
    if (path === '/rest/v1/sections' && method === 'GET') {
      if (mode('sectionError')) return json(r, 500, { message: 'mock' });
      const hit = sectionOf(eq('id'));
      return json(r, 200, hit ? [{ id: hit.s.id, current_version_id: hit.s.current_version_id }] : []);
    }
    if (path === '/rest/v1/sections' && method === 'PATCH') {
      const p = body();
      store.writes.push({ table: 'sections', id: eq('id'), body: p });
      if (mode('statusError')) return json(r, 500, { message: 'mock' });
      const hit = sectionOf(eq('id'));
      if (!hit) return json(r, 200, []);
      Object.assign(hit.s, p);
      return json(r, 200, [{ id: hit.s.id, updated_at: now() }]);
    }
    if (path === '/rest/v1/section_versions' && method === 'GET') {
      if (param('id')) { const v = versionOf(eq('id')); return json(r, 200, v ? [copy(v)] : []); }
      if (mode('versionsError')) return json(r, 500, { message: 'mock' });
      const list = versions.filter((v) => v.section_id === eq('section_id')).sort((a, b) => b.version_no - a.version_no)
        .map(({ content, ...rest }) => rest);
      return json(r, 200, copy(list));
    }
    if (path === '/rest/v1/section_drafts' && method === 'GET') {
      const d = drafts[eq('section_id')];
      return json(r, 200, d ? [copy(d)] : []);
    }
    if (path === '/rest/v1/section_drafts' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'section_drafts', body: p });
      if (mode('draftDelay')) await delay(mode('draftDelay'));
      if (mode('draftError')) return json(r, 500, { message: 'mock' });
      if (!sectionOf(p.section_id)) return json(r, 403, { code: '42501', message: 'draft_owner' });
      if (p.content.length > 100000) return json(r, 400, { code: '23514', message: 'violates check constraint' });
      drafts[p.section_id] = { content: p.content, base_version_id: p.base_version_id, saved_at: now() };
      return json(r, 201, [{ section_id: p.section_id, saved_at: drafts[p.section_id].saved_at }]);
    }
    if (path === '/rest/v1/rpc/save_version') {
      const p = body();
      store.writes.push({ table: 'rpc', fn: 'save_version', body: p });
      if (mode('versionDelay')) await delay(mode('versionDelay'));
      if (mode('versionError')) return json(r, 500, { message: 'mock' });
      const hit = sectionOf(p.p_section_id);
      if (!hit) return json(r, 400, { code: 'P0002', message: 'section_not_found' });
      const s = hit.s;
      if (p.p_content.length > 100000) return fail(r, 'P0001', 'section_too_long');
      // 0019: no blank first version.
      if (!s.current_version_id && !p.p_content.trim()) return fail(r, 'P0001', 'empty_first_version');
      if (p.p_make_current) {
        if ((s.current_version_id || null) !== (p.p_base_version_id || null)) return fail(r, 'P0001', 'version_conflict');
        const curV = versionOf(s.current_version_id);
        if (curV && curV.content === p.p_content) { delete drafts[s.id]; return json(r, 200, { id: curV.id, version_no: curV.version_no, word_count: curV.word_count, created_at: curV.created_at, created: false }); }
      }
      const keep = s.current_version_id;
      const v = addVersion(s, p.p_content, 'manual', { created_at: now() });
      if (!p.p_make_current) s.current_version_id = keep;
      else if (s.status === 'not_started') s.status = 'draft';
      delete drafts[s.id];
      return json(r, 200, { id: v.id, version_no: v.version_no, word_count: v.word_count, created_at: v.created_at, created: true });
    }
    if (path === '/rest/v1/rpc/restore_version') {
      const p = body();
      store.writes.push({ table: 'rpc', fn: 'restore_version', body: p });
      if (mode('restoreError')) return json(r, 500, { message: 'mock' });
      const hit = sectionOf(p.p_section_id);
      if (!hit) return json(r, 400, { code: 'P0002', message: 'section_not_found' });
      const s = hit.s;
      if ((s.current_version_id || null) !== (p.p_base_version_id || null)) return fail(r, 'P0001', 'version_conflict');
      const old = versionOf(p.p_version_id);
      if (!old || old.section_id !== s.id) return json(r, 400, { code: 'P0002', message: 'version_not_found' });
      const curV = versionOf(s.current_version_id);
      if (drafts[s.id] && drafts[s.id].content !== (curV ? curV.content : '')) return fail(r, 'P0001', 'unsaved_draft');
      delete drafts[s.id];
      const v = addVersion(s, old.content, 'restore', { label: `Restored from v${old.version_no}`, created_at: now() });
      return json(r, 200, { id: v.id, version_no: v.version_no, word_count: v.word_count, created_at: v.created_at, created: true });
    }
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: PA, name: 'Nora Hale', voice: {} }]);
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
