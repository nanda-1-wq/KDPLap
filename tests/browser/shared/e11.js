// Shared mock for the E11 suites (settings, export, books): the Books page,
// Settings, the book page (01 Brief) and the Export dialog. Nothing reaches
// Supabase. run.sh puts this file first when a suite's mock.js starts with
// "// shared: e11". Tests change globalThis.__store and globalThis.__modes.
//   __modes: user ({ meta, providers }), settingsFail, settingsSlow (ms),
//   settingsPatchFail ({ status, code }), patchSlow (ms), pensNone, usage (the RPC reply),
//   usageFail, usageSlow (ms), callsFail, badgesFail, exportFail (n calls),
//   exportSlow (ms), recordFail, docxFail, docxSlow (ms), recoverFail ({ status })
const U = '00000000-0000-4000-8000-000000000001';
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const PB = 'aaaaaaaa-0000-4000-8000-00000000000b';
const B1 = 'b1b1b1b1-0000-4000-8000-000000000001';   // Chair Yoga for Seniors Over 60 (export: ready)
const B2 = 'b2b2b2b2-0000-4000-8000-000000000002';   // Budget Smart for College Students
const B3 = 'b3b3b3b3-0000-4000-8000-000000000003';   // Sleep Better After 50 (no text)

const PARA = (topic, n) => Array.from({ length: n }, (_, i) => `${topic} step ${i + 1} keeps the body moving with care. Breathe in slowly, then breathe out as you settle into the chair.`).join(' ');
const ver = (id, content, extra = {}) => ({ id, version_no: 3, content, partial: false, word_count: 0, ...extra });
const sec = (id, position, title, status, content, extra = {}) => ({ id, position, title, status, needs_review: false, ai: 'none', unsaved: false, run: null,
  version: content === null ? null : ver(`v-${id}`, content, extra.version || {}), ...extra.section });

/** export_json replies. kind: ready | warn | final | running | empty. */
function exportData(kind, now = new Date().toISOString()) {
  const book = { id: B1, title: 'Chair Yoga for Seniors Over 60', subtitle: 'Gentle moves for every day', pen_name: 'Nora Hale', bio: 'Nora Hale teaches gentle chair yoga to adults over 60.', trim: '6x9' };
  const known = { brief: { topic_text: 'Chair yoga for seniors' }, research: { insights: null, competitors: [{ title: 'Chair Yoga Basics' }], sources: [{ kind: 'source', body: 'A 2020 study of 300 adults over 60.', citation: 'Smith 2020' }] } };
  const ch = (id, kind, position, title, sections, extra = {}) => ({ id, kind, position, title, objective: null, needs_review: false, sections, ...extra });
  const f = (s) => ({ ...s, ai: s.ai === 'none' ? 'draft' : s.ai });
  const ready = [
    ch('c0', 'intro', 1, 'Introduction', [f(sec('s01', 1, 'Why chair yoga', 'final', PARA('Intro', 6)))]),
    ch('c1', 'chapter', 2, 'Getting started', [f(sec('s11', 1, 'Your chair', 'final', `## Pick a chair\n\n${PARA('Chair', 8)}\n\n- Firm seat\n- Flat feet`)), sec('s12', 2, 'Breathing', 'final', PARA('Breath', 7))]),
    ch('c2', 'chapter', 3, 'Shoulders', [f(sec('s21', 1, 'Shoulder rolls', 'final', PARA('Roll', 9))), { ...sec('s22', 2, 'Neck stretches', 'final', PARA('Neck', 6)), ai: 'edits' }]),
    ch('c3', 'chapter', 4, 'Seated twists', [f(sec('s31', 1, 'Twist one', 'final', PARA('Twist', 8))), f(sec('s32', 2, 'Twist two', 'final', PARA('Turn', 7)))]),
    ch('c4', 'chapter', 5, 'Breathing while you stretch', [f(sec('s41', 1, 'Slow breaths', 'final', PARA('Slow', 6))), f(sec('s42', 2, 'Counting', 'final', PARA('Count', 5)))]),
    ch('c9', 'conclusion', 6, 'Conclusion', [{ ...sec('s91', 1, 'Keep going', 'final', PARA('End', 5)), ai: 'edits' }])
  ];
  if (kind === 'ready') return { book, known, chapters: ready, now };
  const clone = JSON.parse(JSON.stringify(ready));
  const find = (id) => clone.flatMap((c) => c.sections).find((s) => s.id === id);
  if (kind === 'warn' || kind === 'final') {
    find('s21').version.content = 'Roll your shoulders back. [Verify: no source] Then forward. [Verify: no source]';
    find('s41').version.content = 'Breathe in for four. [Verify: no source] Out for six.';
    find('s31').version.content = 'In 2019, 45 percent of readers said twists helped their backs.';
    find('s12').status = 'draft';
    find('s22').status = 'draft';
    find('s32').status = 'reviewed';
    find('s12').unsaved = true;
    find('s12').version.version_no = 6;
    find('s11').version.partial = true;
    clone[4].needs_review = true;
    clone.splice(5, 0, ch('c5', 'chapter', 6, 'Standing with support', [sec('s51', 1, 'Hold the chair', 'draft', null), sec('s52', 2, 'Stand tall', 'draft', null), sec('s53', 3, 'Sit down', 'draft', null)]));
    if (kind === 'final') { find('s41').status = 'draft'; find('s42').status = 'reviewed'; }
    return { book, known, chapters: clone, now };
  }
  if (kind === 'running') {
    const t = Date.parse(now);
    find('s31').run = { started_at: new Date(t - 30000).toISOString(), heartbeat_at: new Date(t - 3000).toISOString() };
    find('s31').version.version_no = 4;
    return { book, known, chapters: clone, now };
  }
  if (kind === 'empty') {
    return { book: { ...book, id: B3, title: 'Sleep Better After 50' }, known, now,
      chapters: clone.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, version: null })) })) };
  }
  throw new Error('exportData: ' + kind);
}

async function setupE11(page) {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const store = globalThis.__store = {
    settings: { user_id: U, display_name: null, default_trim: '6x9', default_pen_name_id: PA, language: 'en', monthly_token_limit: 2000000 },
    pens: [{ id: PA, name: 'Nora Hale', voice: {} }, { id: PB, name: 'Sam Carter', voice: {} }],
    books: [
      { id: B1, title: 'Chair Yoga for Seniors Over 60', subtitle: null, status: 'in_progress', current_step: 6, updated_at: ago(1), topic_id: 't1',
        pen_names: { name: 'Nora Hale' }, book_briefs: { length_range: null, target_words: 10000, topic_text: 'Chair yoga' }, chapters: [{ word_target: 10000, needs_review: false }] },
      { id: B2, title: 'Budget Smart for College Students', subtitle: null, status: 'in_progress', current_step: 6, updated_at: ago(3), topic_id: 't2',
        pen_names: { name: 'Sam Carter' }, book_briefs: { length_range: null, target_words: 12000, topic_text: 'Budget' }, chapters: [{ word_target: 12000, needs_review: false }] },
      { id: B3, title: 'Sleep Better After 50', subtitle: null, status: 'in_progress', current_step: 2, updated_at: ago(5), topic_id: 't3',
        pen_names: { name: 'Nora Hale' }, book_briefs: { length_range: '8-12k', target_words: null, topic_text: 'Sleep' }, chapters: [] }
    ],
    usage: { month_start: '2026-10-01T00:00:00+00:00', resets: '2026-11-01T00:00:00+00:00', limit: 2000000, tokens: 412380, by_stage: [
      { stage: 'section_write', model: 'claude-sonnet-5-5', calls: 38, input: 160000, output: 108400 },
      { stage: 'section_improve', model: 'claude-sonnet-5-5', calls: 41, input: 40000, output: 21200 },
      { stage: 'section_check', model: 'claude-sonnet-5-5', calls: 22, input: 30000, output: 9800 },
      { stage: 'outline_ideas', model: 'claude-sonnet-5-5', calls: 3, input: 10000, output: 8900 },
      { stage: 'title_ideas', model: 'claude-sonnet-5-5', calls: 4, input: 8000, output: 4600 },
      { stage: 'positioning_help', model: 'claude-sonnet-5-5', calls: 5, input: 5000, output: 1000 },
      { stage: 'brief_help', model: 'claude-sonnet-5-5', calls: 3, input: 3000, output: 480 },
      { stage: 'drift_check', model: 'claude-sonnet-5-5', calls: 1, input: 1000, output: 0 }] },
    lastCalls: null,
    badges: [],
    exportData: { [B1]: exportData('ready'), [B2]: exportData('warn'), [B3]: exportData('empty') },
    exports: [], writes: [], recovers: [], calls: []
  };
  const at = (mins) => new Date(Date.now() - mins * 60000).toISOString();
  store.lastCalls = [
    { id: 9, stage: 'section_write', model: 'claude-sonnet-5-5', input_tokens: 4000, output_tokens: 2840, status: 'ok', counted: true, created_at: at(28), book_id: B1, books: { title: 'Chair Yoga for Seniors Over 60' } },
    { id: 8, stage: 'section_check', model: 'claude-sonnet-5-5', input_tokens: 2400, output_tokens: 510, status: 'ok', counted: true, created_at: at(40), book_id: B1, books: { title: 'Chair Yoga for Seniors Over 60' } },
    { id: 7, stage: 'section_improve', model: 'claude-sonnet-5-5', input_tokens: 1200, output_tokens: 320, status: 'stopped', counted: true, created_at: at(55), book_id: B1, books: { title: 'Chair Yoga for Seniors Over 60' } },
    { id: 6, stage: 'section_write', model: 'claude-sonnet-5-5', input_tokens: 3000, output_tokens: 100, status: 'failed', counted: false, created_at: at(60 * 26), book_id: B2, books: { title: 'Budget Smart for College Students' } },
    { id: 5, stage: 'bio', model: 'claude-sonnet-5-5', input_tokens: 900, output_tokens: 240, status: 'ok', counted: true, created_at: at(60 * 72), book_id: null, books: null }
  ];
  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const wait = (ms) => page.waitForTimeout(ms);   // the run-code sandbox has no setTimeout
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body, headers = {}) => r.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const bookView = (b) => ({
    id: b.id, title: b.title, subtitle: null, status: 'in_progress', current_step: b.current_step, updated_at: b.updated_at, topic_id: null,
    pen_name_id: PA, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: null,
    pen_names: { id: PA, name: 'Nora Hale', voice: {} }, topics: null,
    book_briefs: { topic_text: 'Chair yoga for seniors', target_reader: 'Adults over 60 who want to move safely at home.', reader_problem: 'Most yoga books assume the reader can get down on the floor.',
      promise_draft: null, book_type: 'beginner_guide', book_type_label: null, trim_size: '6x9', length_range: null, target_words: 10000, chapter_count: null, options: {}, updated_at: b.updated_at },
    competitors: [{ count: 0 }], real_sources: [{ count: 0 }], chapters: [{ count: 0 }], review_chapters: [{ count: 0 }], positioning: null
  });

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
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const body = () => JSON.parse(req.postData() || 'null');
    store.calls.push(`${method} ${path}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (path === '/auth/v1/recover' && method === 'POST') {
      store.recovers.push({ ...body(), url: full });
      const f = mode('recoverFail');
      if (f) return json(r, f.status, { code: f.status, msg: f.status === 429 ? 'email rate limit exceeded' : 'mock: down', error_code: f.status === 429 ? 'over_email_send_rate_limit' : 'unexpected' });
      return json(r, 200, {});
    }
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/user_settings') {
      if (method === 'GET') {
        if (mode('settingsSlow')) await wait(mode('settingsSlow'));
        if (mode('settingsFail')) return json(r, 500, { message: 'mock: settings down' });
        return json(r, 200, one ? store.settings : [store.settings]);
      }
      if (method === 'PATCH') {
        const patch = body();
        store.writes.push({ table: 'user_settings', body: patch });
        if (mode('patchSlow')) await wait(mode('patchSlow'));
        const f = mode('settingsPatchFail');
        if (f) return json(r, f.status, { code: f.code, message: 'mock: refused' });
        const name = patch.display_name;
        if (name !== undefined && name !== null && (name.length < 1 || name.length > 60 || name !== name.trim())) {
          return json(r, 400, { code: '23514', message: 'new row for relation "user_settings" violates check constraint "user_settings_display_name_check"' });
        }
        Object.assign(store.settings, patch);
        return json(r, 200, [store.settings]);
      }
    }
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, mode('pensNone') ? [] : store.pens);
    if (path === '/rest/v1/books' && method === 'GET') {
      const id = (param('id') || '').replace(/^eq\./, '');
      if (!id) return json(r, 200, store.books);
      const b = store.books.find((x) => x.id === id);
      return json(r, 200, one ? (b ? bookView(b) : null) : (b ? [bookView(b)] : []));
    }
    if (path === '/rest/v1/rpc/usage_month') {
      if (mode('usageSlow')) await wait(mode('usageSlow'));
      if (mode('usageFail')) return json(r, 500, { message: 'mock: usage down' });
      return json(r, 200, mode('usage') || store.usage);
    }
    if (path === '/rest/v1/ai_usage' && method === 'GET') {
      if (mode('callsFail')) return json(r, 500, { message: 'mock: calls down' });
      const u = mode('usage') || store.usage;
      return json(r, 200, u.by_stage.length ? store.lastCalls : []);
    }
    if (path === '/rest/v1/rpc/export_badges') {
      if (mode('badgesFail')) return json(r, 500, { message: 'mock: badges down' });
      return json(r, 200, store.badges);
    }
    if (path === '/rest/v1/rpc/export_json') {
      if (mode('exportSlow')) await wait(mode('exportSlow'));
      if (mode('exportFail') > 0) { globalThis.__modes.exportFail--; return json(r, 500, { message: 'mock: export read down' }); }
      const d = store.exportData[body().p_book_id];
      return json(r, 200, d ? { ...d, now: new Date().toISOString() } : null);
    }
    if (path === '/rest/v1/book_exports' && method === 'POST') {
      const row = body();
      store.exports.push(row);
      if (mode('recordFail')) return json(r, 500, { message: 'mock: record down' });
      const created_at = new Date().toISOString();
      if (row.format === 'docx') store.badges = [...store.badges.filter((x) => x.book_id !== row.book_id), { book_id: row.book_id, exported_at: created_at, changed: false }];
      return json(r, 201, [{ id: 'e' + store.exports.length, created_at }]);
    }
    if (path.startsWith('/rest/v1/')) return json(r, 200, one ? null : []);
    return json(r, 404, { message: 'mock: unknown' });
  }

  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('**/npm/docx@9.5.1/dist/index.iife.js', async (r) => {
    if (mode('docxSlow')) await wait(mode('docxSlow'));
    if (mode('docxFail')) return r.abort();
    return r.fulfill({ path: `${CACHE}/docx-9.5.1.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const u = mode('user') || {};
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com',
      user_metadata: u.meta || { full_name: 'Adnan' }, app_metadata: { provider: 'email', providers: u.providers || ['email'] }, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => {
    try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {}
    // Keep every Blob the page downloads, so a test can open the file.
    window.__blobs = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__blobs.push(b); return orig.call(URL, b); };
  }, JSON.stringify(session));
}

// Shared helpers for E11 tests.
const E11 = {
  U, PA, PB, B1, B2, B3, exportData,
  base: 'http://localhost:5500',
  log: (out) => (line) => out.push(line),
  async shot(page, name, out, w) {
    if (w) await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, timeout: 10000, mask: [page.locator('[data-email]')] }).catch(() => out.push('shot timeout ' + name));
  },
  /** PASS/FAIL line. */
  check(out, name, ok, got) { out.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  got: ${JSON.stringify(got)}`}`); return ok; }
};
