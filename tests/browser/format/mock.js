// Mock for the format suite (08 Format, E13.2). Nothing reaches Supabase.
// It answers as 0027 does: book_formats is made on the first open (insert, 23505 on a
// second one), its update checks the values 0027 checks, format_json reads it.
// Tests change globalThis.__store and globalThis.__modes.
//   __modes: formatFail (n reads of format_json fail), formatSlow (ms), saveFail (n saves fail),
//   saveSlow (ms), trimFail (the Brief trim write fails), statusFail (the Also by status read fails),
//   exportFail (export_json fails), marksFail (pdf_marks), recordFail (n records fail), recordSlow (ms), stale (n records
//   refused as export_stale), cdnSlowMs (the wasm waits), jsdelivrDown, cdnDown (the engine files),
//   pre0034 (E13.3: format_json has no EPUB keys, epub_marks is 404, an EPUB row is refused by the
//   0027 format check), epubMarksFail (epub_marks fails)
// E17 Part 7: book_parts as 0035. store.parts (8 rows, all off), store.alsoBy (Also by entries with "valid").
// book_parts_json, PATCH book_parts (only enabled and status, as the 0035 guard), and book_parts in
// format_json and export_json = book_parts_files (the part_file_list rule, mirrored here for the mock only).
// A switch changes format_key and epub_key (part_key_extra): the 08 mark turns "changed".
//   __modes: partSaveFail (n part saves fail), partSaveOffline (n saves fail as a network error),
//   partsReadFail (n book_parts_json reads fail), partsSlow (ms)
// E13.3 Part 4: EPUB rows follow the 0034 guard in its order (versions in the book, format_missing,
// export_epub_final, export_stale against epub_key, export_epub_versions, then the table check);
// epub_key is a real hash of the 0034 inputs, so print-only settings never change it.
// The print engine is real, from the checked cache (see the CDN route below).
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
    version: version(Array.from({ length: 5 }, () => `${words(120)}.`).join('\n\n')), ...extra });   // about 600 words: the book is about 48 pages, as the real one
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
    lastEpub: null,                  // { id, created_at, settings_key, engine, parts, snapshot } of the last EPUB (0034)
    changed: false,
    candidates: [
      { id: B2, title: 'Worry Less Workbook', subtitle: null, status: 'completed' },
      { id: B3, title: 'Sleep Better Tonight', subtitle: 'A plan', status: 'in_progress' }
    ],
    qcRun: null,                     // { checked_at, current } for qc_mark
    // E17: the 8 parts (0035 book_parts), in book order. version: { id, content, word_count } or null.
    parts: ['dedication', 'epigraph', 'foreword', 'preface', 'acknowledgments', 'about_author', 'review_request', 'also_by']
      .map((kind, i) => ({ id: uid('9', i + 1), kind, enabled: false, status: ['review_request', 'also_by'].includes(kind) ? null : 'draft', version: null })),
    alsoBy: [],                      // [{ book_id, title, subtitle, valid }] in print order
    writes: [], calls: [], inserts: 0, formatReads: 0, cdn: [],
    sections: () => chapters.flatMap((c) => c.sections)
  };

  /** 0035 part_file_list + book_parts_files: on, and Final with text, or the review request, or Also by with a valid entry. */
  const partsFiles = () => store.parts.filter((p) => p.enabled && (
    (p.status === 'final' && p.version && p.version.content.trim())
    || p.kind === 'review_request'
    || (p.kind === 'also_by' && store.alsoBy.some((e) => e.valid))))
    .map((p) => ({ kind: p.kind, version_id: p.version ? p.version.id : null, content: p.version ? p.version.content : null,
      ...(p.kind === 'also_by' ? { entries: store.alsoBy.filter((e) => e.valid).map((e) => ({ title: e.title, subtitle: e.subtitle || null })) } : {}) }));
  store.partsFiles = partsFiles;
  /** 0035 book_parts_json. */
  const partsJson = () => ({
    parts: store.parts.map((p) => ({ id: p.id, kind: p.kind, enabled: p.enabled, status: p.status, version_id: p.version ? p.version.id : null,
      version_no: p.version ? 1 : null, words: p.version ? p.version.word_count : 0, has_draft: false })),
    also_by: store.alsoBy.map((e, i) => ({ position: i + 1, book_id: e.book_id || null, title: e.title, subtitle: e.subtitle || null, valid: e.valid })),
    candidates: store.candidates.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
    now: now()
  });
  /** What the parts add to format_key and epub_key: 0035 part_key_extra ([kind, on, version in the file] for
      each new part that is on, About and Also by left out), plus the About text and Also by books in the file
      (0035 bio_md5 and also_by). An on part that is not in the file still changes the key, as in 0035. */
  const partsKey = () => {
    const files = partsFiles();
    const inFile = (k) => files.find((x) => x.kind === k);
    const extra = store.parts.filter((p) => p.enabled && !['about_author', 'also_by'].includes(p.kind))
      .map((p) => [p.kind, true, inFile(p.kind) ? inFile(p.kind).version_id : null]);
    return [extra, inFile('about_author') ? inFile('about_author').content : null, inFile('also_by') ? inFile('also_by').entries : null];
  };
  const data = () => ({
    book: { ...copy(store.book), trim: store.brief.trim_size },
    known: { brief: copy(store.brief) },
    chapters: copy(chapters),
    book_parts: partsFiles(),
    now: now()
  });
  // 0027 pdf_sections: Final, text not blank, a chapter, or the intro or conclusion when its part is on.
  const pdfSections = () => {
    const f = store.format;
    if (!f) return [];
    return chapters.filter((c) => c.kind === 'chapter' || (c.kind === 'intro' && f.parts.intro) || (c.kind === 'conclusion' && f.parts.conclusion))
      .flatMap((c) => c.sections.filter((x) => x.status === 'final' && x.version && x.version.content.trim()).map((x) => [c.id, c.kind, c.title, x.id, x.title, x.version.id]));
  };
  // A 32-hex stand-in for md5 (FNV-1a, four seeds): the same text gives the same key.
  const hash = (text) => [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }).join('');
  /** 0034 epub_key: every input that changes the EPUB, and no other. null without a format row. */
  const epubKey = () => {
    const f = store.format;
    if (!f) return null;
    const valid = f.also_by.filter((id) => store.candidates.some((c) => c.id === id));
    return hash(JSON.stringify({
      style: f.style,
      parts: { intro: f.parts.intro, conclusion: f.parts.conclusion, about: f.parts.about, also_by: f.parts.also_by },
      contents_sections: f.contents_sections,
      chapter_label: f.chapter_label,
      also_by: f.parts.also_by ? valid.map((id) => { const c = store.candidates.find((x) => x.id === id); return [c.id, c.title, c.subtitle]; }) : null,
      title: store.book.title,
      subtitle: store.book.subtitle,
      pen_name: store.book.pen_name,
      bio_md5: f.parts.about ? hash(store.book.bio || '') : null,
      sections: pdfSections(),
      ...(store.parts.some((p) => p.enabled) ? { book_parts: partsKey() } : {})
    }));
  };
  store.epubKey = epubKey;             // tests read today's key and the Final list the guard compares with
  store.pdfSections = pdfSections;
  const formatJson = () => ({
    book: { id: FB, title: store.book.title, subtitle: store.book.subtitle, pen_name_id: PA, pen_name: store.book.pen_name, trim: store.brief.trim_size },
    settings: store.format ? { book_id: FB, ...copy(store.format) } : null,
    also_by_valid: store.format ? store.format.also_by.filter((id) => store.candidates.some((c) => c.id === id)) : [],
    candidates: store.candidates.map(({ id, title, subtitle }) => ({ id, title, subtitle })),
    key: '0'.repeat(31) + '1',
    book_parts: partsFiles(),
    last_pdf: store.lastPdf ? copy(store.lastPdf) : null,
    changed: !!store.lastPdf && store.changed,
    ...(mode('pre0034') ? {} : {
      epub_key: epubKey(),
      last_epub: store.lastEpub ? { id: store.lastEpub.id, created_at: store.lastEpub.created_at, settings_key: store.lastEpub.settings_key, engine: store.lastEpub.engine } : null,
      epub_changed: store.lastEpub ? epubKey() !== store.lastEpub.settings_key : null
    }),
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
    if (path === '/rest/v1/rpc/pdf_marks') {
      if (mode('marksFail')) return json(r, 500, { message: 'mock: marks down' });
      const p = body() || {};
      if (!store.lastPdf || (p.p_book_id && p.p_book_id !== FB)) return json(r, 200, []);
      return json(r, 200, [{ book_id: FB, exported_at: store.lastPdf.created_at, page_count: store.lastPdf.page_count, changed: !!store.changed }]);
    }
    if (path === '/rest/v1/rpc/epub_marks') {
      if (mode('pre0034')) return json(r, 404, { code: 'PGRST202', message: 'Could not find the function public.epub_marks without parameters in the schema cache', details: '', hint: null });
      if (mode('epubMarksFail')) return json(r, 500, { message: 'mock: epub marks down' });
      const p = body() || {};
      if (!store.lastEpub || (p.p_book_id && p.p_book_id !== FB)) return json(r, 200, []);
      return json(r, 200, [{ book_id: FB, exported_at: store.lastEpub.created_at, changed: epubKey() !== store.lastEpub.settings_key }]);
    }
    if (path === '/rest/v1/book_exports' && method === 'POST') {
      // 0027: a PDF row needs page_count (even), settings_key (= format_key today) and engine;
      // include 'final'; versions = the Final list.
      const p = body();
      store.writes.push({ table: 'book_exports', body: p });
      if (mode('recordSlow')) await wait(mode('recordSlow'));
      if (mode('recordFail') > 0) { globalThis.__modes.recordFail--; return json(r, 500, { message: 'mock: record down' }); }
      if (mode('stale') > 0) { globalThis.__modes.stale--; return fail(r, 400, 'P0001', 'export_stale'); }
      if (p.format === 'epub') {
        // Before 0034 the format check (0027) has no 'epub'.
        if (mode('pre0034')) return fail(r, 400, '23514', 'new row for relation "book_exports" violates check constraint "book_exports_format_check"');
        // The 0034 guard, in its order. b. every version is a version of a section of this book, no repeats.
        const inBook = new Set(chapters.flatMap((c) => c.sections).filter((x) => x.version).map((x) => x.version.id));
        const v = Array.isArray(p.versions) ? p.versions : null;
        if (v && v.length && !v.includes(null) && (new Set(v).size !== v.length || v.some((id) => !inBook.has(id)))) return fail(r, 400, 'P0001', 'export_version_not_in_book');
        if (!store.format) return fail(r, 400, 'P0001', 'format_missing');
        if (p.include !== 'final') return fail(r, 400, 'P0001', 'export_epub_final');
        if (p.settings_key !== epubKey()) return fail(r, 400, 'P0001', 'export_stale');
        if (JSON.stringify(p.versions) !== JSON.stringify(pdfSections().map((x) => x[5]))) return fail(r, 400, 'P0001', 'export_epub_versions');
        // The table check runs after the trigger (book_exports_file_fields_check).
        if (p.page_count != null || !p.settings_key || !p.engine) return fail(r, 400, '23514', 'new row for relation "book_exports" violates check constraint "book_exports_file_fields_check"');
        // The guard sets parts (the format row without also_by, contents on) and the snapshot (with style).
        const parts = { ...store.format.parts, contents: true };
        delete parts.also_by;
        const snapshot = { title: store.book.title, subtitle: store.book.subtitle, pen_name: store.book.pen_name, trim: store.brief.trim_size, bio_md5: hash(store.book.bio || ''), include: 'final', parts, style: store.format.style };
        store.lastEpub = { id: uid('e', ++seq), created_at: now(), settings_key: p.settings_key, engine: p.engine, parts, snapshot };
        return json(r, 201, [{ id: store.lastEpub.id, created_at: store.lastEpub.created_at }]);
      }
      if (p.format !== 'pdf' || p.include !== 'final' || !(p.page_count % 2 === 0 && p.page_count >= 2) || !p.engine || p.settings_key !== formatJson().key) return fail(r, 400, '23514', `mock: bad pdf row ${JSON.stringify(p).slice(0, 200)}`);
      const finals = chapters.flatMap((c) => c.sections).filter((x) => x.status === 'final' && x.version && x.version.content.trim()).map((x) => x.version.id);
      if (JSON.stringify(p.versions) !== JSON.stringify(finals)) return fail(r, 400, 'P0001', 'export_pdf_versions');
      store.lastPdf = { created_at: now(), page_count: p.page_count };
      store.changed = false;
      return json(r, 201, [{ id: uid('e', ++seq), created_at: store.lastPdf.created_at, page_count: p.page_count }]);
    }
    if (path === '/rest/v1/rpc/book_parts_json') {
      if (mode('partsSlow')) await wait(mode('partsSlow'));
      if (mode('partsReadFail') > 0) { globalThis.__modes.partsReadFail--; return json(r, 500, { message: 'mock: parts read down' }); }
      return json(r, 200, body().p_book_id === FB ? partsJson() : null);
    }
    // E17: the part reads 06 makes when "Open in 06" lands on a part (kdp.parts.text).
    if (path === '/rest/v1/book_parts' && method === 'GET') {
      const row = store.parts.find((x) => x.id === eq('id'));
      const out = row ? { id: row.id, current_version_id: row.version ? row.version.id : null } : null;
      return json(r, 200, one ? out : (out ? [out] : []));
    }
    if (path === '/rest/v1/book_part_versions' && method === 'GET') {
      const row = store.parts.find((x) => x.version && (x.version.id === eq('id') || x.id === eq('part_id')));
      const v = row ? { id: row.version.id, version_no: 1, content: row.version.content, word_count: row.version.word_count, source: 'manual', label: null, partial: false, created_at: ago(1) } : null;
      return json(r, 200, one ? v : (v ? [v] : []));
    }
    if (path === '/rest/v1/book_part_drafts' && method === 'GET') return json(r, 200, one ? null : []);
    if (path === '/rest/v1/book_parts' && method === 'PATCH') {
      const p = body();
      store.writes.push({ table: 'book_parts', id: eq('id'), body: p });
      if (mode('partsSlow')) await wait(mode('partsSlow'));
      if (mode('partSaveOffline') > 0) { globalThis.__modes.partSaveOffline--; return r.abort('internetdisconnected'); }
      if (mode('partSaveFail') > 0) { globalThis.__modes.partSaveFail--; return json(r, 500, { message: 'mock: part save down' }); }
      // The 0035 guard: users change only enabled and status.
      if (Object.keys(p).some((k) => !['enabled', 'status'].includes(k))) return fail(r, 400, 'P0001', 'part_fixed_columns');
      const row = store.parts.find((x) => x.id === eq('id'));
      if (!row) return json(r, 200, []);
      const before = JSON.stringify(partsKey());
      Object.assign(row, p);
      // format_key changes with the parts (0035): the Print PDF mark turns "changed".
      if (store.lastPdf && JSON.stringify(partsKey()) !== before) store.changed = true;
      return json(r, 200, [{ id: row.id, enabled: row.enabled, status: row.status, updated_at: now() }]);
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

  // The print engine is real (E13.2 Part 3): its pinned files come from tests/browser/.cache/format
  // (run.sh checks each sha384), for jsdelivr and unpkg alike.
  const TYPES = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', ttf: 'font/ttf' };
  const engineFile = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@myriaddreamin|@expo-google-fonts)\/[^/]+|pdfjs-dist@[^/]+)\/(.+)$/;
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, async (r) => {
    const m = r.request().url().match(engineFile);
    if (!m) return r.fallback();
    const cdn = m[1].startsWith('unpkg') ? 'unpkg' : 'jsdelivr';
    store.cdn.push({ cdn, file: `${m[2]}/${m[3]}` });
    if (mode('cdnDown') || (cdn === 'jsdelivr' && mode('jsdelivrDown'))) return r.abort();
    if (mode('cdnSlowMs') && /\.wasm$/.test(m[3])) await wait(mode('cdnSlowMs'));
    const ext = (m[3].match(/\.([a-z0-9]+)$/) || [])[1];
    return r.fulfill({ path: `${CACHE}/format/${m[2]}/${m[3]}`, contentType: TYPES[ext] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' } });
  });

  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com', user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {} }, JSON.stringify(session));
  // Every downloaded file stays in window.__blobs, so a test can read the PDF back.
  await ctx.addInitScript(() => {
    window.__blobs = [];
    const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { if (b instanceof Blob && (b.type === 'application/pdf' || b.type === 'application/epub+zip')) window.__blobs.push(b); return make(b); };
  });
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
