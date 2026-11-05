// Mock for the qc suite (07 Quality Control, E14.3). Nothing reaches Supabase.
// It answers as 0028 does: qc_runs refuses a stale run (P0001 qc_stale) and a bad
// results shape, qc_dismissed is unique per (book, rule, issue_key) (23505).
// Tests change globalThis.__store and globalThis.__modes.
//   __modes: qcFail (n calls), qcSlow (ms), markFail, runFail ({ status, code, message }, n in runFailN),
//   runSlow (ms), stale (n saves), okFail (n calls), okLimit, okSlow (ms), undoFail (n calls), versionSlow (ms)
const U = '00000000-0000-4000-8000-000000000001';
const PA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const QB = 'c1c1c1c1-0000-4000-8000-000000000001';   // the book of design 52, 53

const SYL = ['ba', 'ko', 'li', 'mu', 'ne', 'ro', 'si', 'ta', 'vu', 'za'];
let nonce = 0;
/** A made-up word, never twice in a row: sentences of 6 words are under the repeat rule (8 words). */
const word = () => { let i = ++nonce % 9000, w = ''; for (let k = 0; k < 4; k++) { w += SYL[i % 10]; i = Math.floor(i / 10); } return w; };
const sentence = () => { const s = Array.from({ length: 6 }, word).join(' '); return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`; };
const para = (n) => Array.from({ length: n }, sentence).join(' ');
const text = (paras = 8) => Array.from({ length: paras }, () => para(8)).join('\n\n');

const uid = (p, n) => `${p}${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;

async function setupQc(page) {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  let seq = 0;
  const count = (md) => String(md || '').split(/\s+/).filter(Boolean).length;

  const version = (content) => ({ id: uid('7', ++seq), version_no: 1, content, partial: false, word_count: count(content), source: 'manual', label: null, created_at: ago(1) });
  const sec = (position, title, extra = {}) => ({ id: uid('5', ++seq), position, title, status: 'final', needs_review: false, ai: 'draft', unsaved: false, run: null, word_target: 300,
    version: version(text()), ...extra });
  const chap = (position, kind, title, sections) => ({ id: uid('c', ++seq), position, kind, title, objective: kind === 'chapter' ? 'Reader can do this.' : null, needs_review: false, include_examples: true, include_exercise: true, unsourced: [], sections });

  const chapters = [
    chap(0, 'intro', 'Introduction', [sec(1, 'Why small habits win')]),
    ...['Start small', 'Five minute reviews', 'Spaced practice', 'Quiet corners', 'Busy weeks', 'Habit stacks', 'Long term'].map((t, i) =>
      chap(i + 1, 'chapter', t, [1, 2, 3, 4].map((n) => sec(n, `${t} part ${n}`)))),
    chap(8, 'conclusion', 'Conclusion', [sec(1, 'Keep going')])
  ];

  const store = globalThis.__store = {
    book: { id: QB, title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'Ten minutes a day', status: 'in_progress', current_step: 7, updated_at: ago(1), pen_name: 'Adnan Haroun', bio: 'A teacher.', trim: '6x9' },
    brief: { topic_text: 'Study habits for adults', target_reader: 'Busy adult learners', reader_problem: 'No time to study', promise_draft: 'Study in ten minutes a day', trim_size: '6x9' },
    research: { insights: null, competitors: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }], sources: [{ kind: 'source', body: 'A review of retrieval practice.', citation: 'Roediger, H. Test-enhanced learning.' }] },
    chapters,
    format: null,
    pos: { locked_at: ago(2), one_sentence: 'Study habits for busy adults.', reader_promise: 'You can study ten minutes a day.', approach: null, lacks: null, selling_points: [], focus_tags: [] },
    key: '0'.repeat(31) + '1',
    runs: [], dismissed: [], writes: [], calls: [], drafts: {}, marks: 0, qcReads: 0, nextId: 1,
    sections: () => chapters.flatMap((c) => c.sections),
    section: (n) => {
      // "3.2" = chapter 3, section 2.
      const [c, s] = n.split('.').map(Number);
      return chapters.filter((x) => x.kind === 'chapter')[c - 1].sections[s - 1];
    },
    /** Saves new text as a new current version, as save_version does. */
    edit(sectionRow, content) { sectionRow.version = version(content); return sectionRow.version; },
    /** Every section Final and on target: 55 E. */
    clean() { for (const s of store.sections()) { s.status = 'final'; s.needs_review = false; } },
    /** The sample of design 53: 3 + 1 + 2 + 0 + 1 + 2 issues, and 2 marked as OK. */
    sample() {
      store.section('3.2').status = 'draft';
      store.section('5.1').needs_review = true;
      store.section('7.3').word_target = 900;
      store.section('1.2').word_target = 900;
      store.section('2.1').version = version(`${para(8)} Studies back this idea strongly. [Verify: no source]\n\n${text(7)}`);
      const same = 'Short daily reviews beat one long weekend session almost every time.';
      store.section('2.2').version = version(`${same} ${text()}`);
      store.section('6.1').version = version(`${same} ${text()}`);
      store.section('4.1').version = version(`Send an email to your tutor. Save each email you get. ${text()}`);
      store.section('6.2').version = version(`Send an e-mail each week. ${text()}`);
      store.section('3.4').version = version(`${text()}\n\nRead more at https://example.com/study-tips today.`);
      store.section('1.1').version = version(`Roediger found this first. ${'Keep your focus. '.repeat(40)}${text()}`);
      store.brief.topic_text = 'Study habits for better health';
      store.format = { style: 'classic', parts: { copyright: false }, chapter_label: 'number' };
    },
    /** Marks one issue as OK, as the page would have. */
    dismiss(rule, issue_key, label, section_id = null) { store.dismissed.unshift({ id: uid('d', store.nextId++), section_id, rule, issue_key, label, created_at: now() }); },
    /** An old run: the run of today's book, then its key moved. */
    addRun(results, extra = {}) {
      const r = { id: uid('e', store.nextId++), created_at: ago(1), versions: versions(), inputs_key: store.key, results, sections: 30, words: 9000, style: 'classic', ...extra };
      store.runs.unshift(r);
      return r;
    }
  };

  const versions = () => chapters.flatMap((c) => c.sections).filter((s) => s.version && s.version.content.trim()).map((s) => s.version.id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const data = () => ({
    book: copy(store.book),
    known: { brief: copy(store.brief), research: copy(store.research) },
    chapters: copy(chapters).map(({ include_examples, include_exercise, unsourced, ...c }) => c),
    now: now()
  });
  const qcJson = () => {
    const last = store.runs[0] || null;
    return {
      data: data(), versions: versions(), inputs_key: store.key, format: copy(store.format), positioning: copy(store.pos),
      last_run: last ? copy(last) : null,
      current: !!last && same(last.versions, versions()) && last.inputs_key === store.key,
      dismissed: copy(store.dismissed), promise: [], now: now()
    };
  };
  const qcMark = () => {
    const last = store.runs[0];
    return last ? [{ checked_at: last.created_at, current: same(last.versions, versions()) && last.inputs_key === store.key }] : [];
  };
  const outlineJson = () => chapters.map((c) => ({
    id: c.id, position: c.position, kind: c.kind, title: c.kind === 'chapter' ? c.title : null, objective: c.objective, needs_review: c.needs_review,
    include_examples: true, include_exercise: true, unsourced: [],
    sections: c.sections.map((s) => ({ id: s.id, position: s.position, title: c.kind === 'chapter' ? s.title : null, word_target: s.word_target, status: s.status, needs_review: s.needs_review,
      current_version_id: s.version ? s.version.id : null, has_writing: !!s.version, words: s.version ? s.version.word_count : 0, version_at: s.version ? s.version.created_at : null,
      has_draft: !!store.drafts[s.id], draft_words: null, draft_at: null }))
  }));
  const view = () => ({
    id: QB, title: store.book.title, subtitle: store.book.subtitle, status: store.book.status, completed_at: null, current_step: store.book.current_step, updated_at: store.book.updated_at, topic_id: null,
    pen_name_id: PA, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: ago(2),
    pen_names: { id: PA, name: store.book.pen_name, voice: {} }, topics: null,
    book_briefs: { ...store.brief, book_type: 'how_to', book_type_label: null, length_range: '8-12k', target_words: null, chapter_count: 7, options: {}, updated_at: ago(2) },
    competitors: [{ count: 3 }], real_sources: [{ count: 1 }], chapters: [{ count: chapters.length }], review_chapters: [{ count: 0 }], positioning: { ...store.pos, drift_flags: [], drift_checked_at: null, updated_at: ago(2) }
  });

  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const wait = (ms) => page.waitForTimeout(ms);   // the run-code sandbox has no setTimeout
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', headers: cors, body: body === undefined ? '' : JSON.stringify(body) });
  const fail = (r, status, code, message) => json(r, status, { code, message, details: '', hint: null });

  const RULES = ['not_final', 'no_text', 'needs_review', 'chapter_review', 'under_target', 'stopped_run', 'cut_off', 'verify_mark', 'number_no_source', 'source_not_named',
    'same_sentence', 'same_sentence_here', 'same_paragraph', 'overused_word', 'chapter_missing', 'section_number', 'preview', 'leftover', 'two_spellings', 'us_uk', 'web_link', 'emoji', 'missing_char', 'length', 'disclaimer'];
  /** The 0028 shape checks that a page can break. */
  function badRun(p) {
    if (!/^[0-9a-f]{32}$/.test(p.inputs_key)) return 'inputs_key';
    if (!Array.isArray(p.versions) || !p.versions.length) return 'versions';
    if (!(p.sections >= 1 && p.sections <= 2000) || !(p.words >= 0 && p.words <= 1000000)) return 'counts';
    if (!['classic', 'modern', 'clean', 'warm'].includes(p.style)) return 'style';
    const r = p.results;
    if (!r || !Array.isArray(r.items) || r.items.length > 400 || typeof r.more !== 'object' || !Array.isArray(r.sources) || typeof r.notes !== 'object') return 'results';
    for (const x of r.items) {
      if (![1, 2, 3, 4, 5, 7].includes(x.g) || !RULES.includes(x.rule) || !x.key || x.key.length > 300 || !x.message || x.message.length > 300 || typeof x.quote !== 'string') return `item ${JSON.stringify(x)}`;
    }
    return '';
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
    const eq = (k) => (param(k) || '').replace(/^eq\./, '');
    const method = req.method();
    const one = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    const body = () => JSON.parse(req.postData() || 'null');
    store.calls.push(`${method} ${path}`);
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.startsWith('/auth/')) return json(r, 401, { msg: 'mocked: no auth calls' });

    if (path === '/rest/v1/books' && method === 'GET') {
      if (eq('id') !== QB) return json(r, 200, one ? null : []);
      return json(r, 200, one ? view() : [view()]);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      store.writes.push({ table: 'books', body: body() });
      Object.assign(store.book, body());
      return json(r, 200, [{ id: QB, current_step: store.book.current_step, updated_at: now() }]);
    }
    if (path === '/rest/v1/rpc/qc_json') {
      store.qcReads++;
      if (mode('qcSlow')) await wait(mode('qcSlow'));
      if (mode('qcFail') > 0) { globalThis.__modes.qcFail--; return json(r, 500, { message: 'mock: qc read down' }); }
      return json(r, 200, body().p_book_id === QB ? qcJson() : null);
    }
    if (path === '/rest/v1/rpc/qc_mark') {
      store.marks++;
      if (mode('markFail')) return json(r, 500, { message: 'mock: mark down' });
      return json(r, 200, qcMark());
    }
    if (path === '/rest/v1/qc_runs' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'qc_runs', body: p });
      if (mode('runSlow')) await wait(mode('runSlow'));
      if (mode('runFailN') > 0) {
        globalThis.__modes.runFailN--;
        const f = mode('runFail') || { status: 500, code: '500', message: 'mock: run down' };
        return fail(r, f.status, f.code, f.message);
      }
      if (mode('stale') > 0) { globalThis.__modes.stale--; return fail(r, 400, 'P0001', 'qc_stale'); }
      const bad = badRun(p);
      if (bad) return fail(r, 400, '23514', `mock: bad run: ${bad}`);
      if (!same(p.versions, versions()) || p.inputs_key !== store.key) return fail(r, 400, 'P0001', 'qc_stale');
      const row = { ...p, id: uid('e', store.nextId++), created_at: now() };
      store.runs.unshift(row);
      store.runs.length = Math.min(store.runs.length, 5);
      return json(r, 201, [{ id: row.id, created_at: row.created_at }]);
    }
    if (path === '/rest/v1/qc_dismissed' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'qc_dismissed', body: p });
      if (mode('okSlow')) await wait(mode('okSlow'));
      if (mode('okFail') > 0) { globalThis.__modes.okFail--; return json(r, 500, { message: 'mock: dismiss down' }); }
      if (mode('okLimit')) return fail(r, 400, 'P0001', 'qc_dismissed_limit');
      if (mode('okRace')) {
        // Another tab marked it first.
        globalThis.__modes.okRace = false;
        store.dismiss(p.rule, p.issue_key, p.label, p.section_id);
      }
      if (store.dismissed.some((d) => d.rule === p.rule && d.issue_key === p.issue_key)) return json(r, 409, { code: '23505', message: 'duplicate key value violates unique constraint "qc_dismissed_issue_key"', details: '' });
      if (p.section_id && !store.sections().some((s) => s.id === p.section_id)) return fail(r, 400, 'P0001', 'qc_dismissed_section');
      const row = { id: uid('d', store.nextId++), section_id: p.section_id || null, rule: p.rule, issue_key: p.issue_key, label: p.label, created_at: now() };
      store.dismissed.unshift(row);
      return json(r, 201, [copy(row)]);
    }
    if (path === '/rest/v1/qc_dismissed' && method === 'GET') {
      const row = store.dismissed.find((d) => d.rule === eq('rule') && d.issue_key === eq('issue_key')) || null;
      return json(r, 200, one ? row : row ? [row] : []);
    }
    if (path === '/rest/v1/qc_dismissed' && method === 'DELETE') {
      store.writes.push({ table: 'qc_dismissed', del: eq('id') });
      if (mode('undoFail') > 0) { globalThis.__modes.undoFail--; return json(r, 500, { message: 'mock: undo down' }); }
      store.dismissed = store.dismissed.filter((d) => d.id !== eq('id'));
      return json(r, 204);
    }

    // 06 Write.
    if (path === '/rest/v1/rpc/outline_json') return json(r, 200, outlineJson());
    if (path === '/rest/v1/sections' && method === 'GET') {
      const s = store.sections().find((x) => x.id === eq('id'));
      const row = s ? { id: s.id, current_version_id: s.version ? s.version.id : null } : null;
      return json(r, 200, one ? row : row ? [row] : []);
    }
    if (path === '/rest/v1/section_versions' && method === 'GET') {
      if (param('id')) {
        const s = store.sections().find((x) => x.version && x.version.id === eq('id'));
        const v = s ? { ...s.version, section_id: s.id } : null;
        return json(r, 200, one ? v : v ? [v] : []);
      }
      const s = store.sections().find((x) => x.id === eq('section_id'));
      return json(r, 200, s && s.version ? [(({ content, ...v }) => ({ ...v, section_id: s.id }))(s.version)] : []);
    }
    if (path === '/rest/v1/section_drafts' && method === 'GET') {
      const d = store.drafts[eq('section_id')];
      return json(r, 200, one ? d || null : d ? [d] : []);
    }
    if (path === '/rest/v1/section_drafts' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'section_drafts', body: p });
      store.drafts[p.section_id] = { content: p.content, base_version_id: p.base_version_id, saved_at: now() };
      return json(r, 201, [{ section_id: p.section_id, saved_at: now() }]);
    }
    if (path === '/rest/v1/rpc/save_version') {
      const p = body();
      store.writes.push({ table: 'rpc', fn: 'save_version', body: p });
      if (mode('versionSlow')) await wait(mode('versionSlow'));
      const s = store.sections().find((x) => x.id === p.p_section_id);
      const v = store.edit(s, p.p_content);
      delete store.drafts[s.id];
      return json(r, 200, { id: v.id, version_no: 2, word_count: v.word_count, created_at: now(), created: true });
    }
    if (path === '/rest/v1/section_runs' && method === 'GET') return json(r, 200, one ? null : []);

    // 02 Research: the counts its sidebar mark reads.
    if (path === '/rest/v1/competitors' && method === 'GET') return json(r, 200, store.research.competitors.map((c, i) => ({ id: uid('b', i + 1), asin: null, ...c })));
    if (path === '/rest/v1/research_sources' && method === 'GET') return json(r, 200, store.research.sources.map((c, i) => ({ id: uid('a', i + 1), ...c })));

    // The Export dialog.
    if (path === '/rest/v1/rpc/export_json') return json(r, 200, data());
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

const setup = (page) => setupQc(page);

// Shared helpers for the qc tests.
const QC = {
  url: (step, extra = '') => `http://127.0.0.1:5500/app/book.html?id=${QB}&step=${step}${extra}`,
  async open(page, step = 7, extra = '') {
    await page.goto(QC.url(step, extra), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-step-title]:not(:empty)', { timeout: 10000 });
  },
  /** Open 07 and wait until the screen is past loading. */
  async open7(page) {
    await QC.open(page, 7);
    await page.waitForFunction(() => { const q = document.querySelector('[data-qc]'); return q && !q.querySelector('.skel'); }, null, { timeout: 10000 });
  },
  async run(page) {
    const n = globalThis.__store.writes.filter((w) => w.table === 'qc_runs').length;
    await page.click('[data-run]');
    for (let i = 0; i < 80 && globalThis.__store.writes.filter((w) => w.table === 'qc_runs').length === n; i++) await page.waitForTimeout(50);
    await page.waitForFunction(() => { const b = document.querySelector('[data-run]'); return !document.querySelector('[data-running]') && (!b || !b.disabled); }, null, { timeout: 5000 });
  },
  log() {
    const log = globalThis.__log = [];
    return { log, ok: (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`) };
  },
  txt: (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()),
  all: (page, sel) => page.$$eval(sel, (es) => es.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
  has: async (page, sel) => !!(await page.$(sel)),
  noScroll: (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
};
