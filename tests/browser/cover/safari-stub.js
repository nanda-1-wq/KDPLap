/* NicheInk · tests: the Safari pass of the 09 Cover editor (E16 Part 6, owner STOP 4).
   /tests/browser/cover/safari-stub.js   (put into app/book.html by safari-editor.mjs only, before supabase-js)

   safaridriver cannot answer requests (no route in WebDriver), so this file answers every Supabase call in the
   page itself, the way tests/browser/cover/mock.js answers them for Chrome: window.fetch is wrapped before the
   Supabase client is made; a request to the Supabase host never leaves the page. A request this stub does not
   know is refused and noted in window.__sbStub.unknown. window.__sbStub.calls lists every call.
   The book is the design fixture's (made-up words), with a current Print PDF (6 × 9, 54 pages, white). */
(function () {
  'use strict';
  const HOST = 'https://hmtxnbgfzwqawfulwwrg.supabase.co';
  const U = '00000000-0000-4000-8000-000000000001';
  const BOOK = 'c9c9c9c9-0000-4000-8000-000000000009', PEN = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const now = () => new Date().toISOString();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const S = window.__sbStub = { calls: [], unknown: [], design: null, history: [], assets: [], files: {}, saves: 0, exports: [], my: [], refused: [] };
  const book = { title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days', pen: 'Adnan Haroun', trim: '6x9', paper: 'white' };
  const pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: ago(1), current: true };
  const session = { access_token: 'stub.eyJzdWIiOiJzdHViIn0.stub', refresh_token: 'stub', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com', user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) } };
  try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', JSON.stringify(session)); } catch (e) { /* private mode */ }

  const view = () => ({
    id: BOOK, title: book.title, subtitle: book.subtitle, status: 'in_progress', completed_at: null, current_step: 9, updated_at: ago(1), topic_id: null,
    pen_name_id: PEN, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: ago(2),
    pen_names: { id: PEN, name: book.pen, voice: {} }, topics: null,
    book_briefs: { topic_text: 'Study habits for adults', target_reader: 'Busy adult learners', reader_problem: 'No time to study', promise_draft: 'Study in ten minutes a day', book_type: 'how_to', book_type_label: null, trim_size: book.trim, length_range: '8-12k', target_words: null, chapter_count: 5, options: {}, updated_at: ago(2) },
    competitors: [{ count: 3 }], real_sources: [{ count: 1 }], chapters: [{ count: 7 }], review_chapters: [{ count: 0 }],
    positioning: { locked_at: ago(2), one_sentence: 'x', reader_promise: 'y', approach: null, lacks: null, selling_points: [], focus_tags: [], drift_flags: [], drift_checked_at: null, updated_at: ago(2) }
  });
  const coverJson = () => ({
    book: { id: BOOK, title: book.title, subtitle: book.subtitle, pen_name_id: PEN, pen_name: book.pen, bio_text: null, trim: book.trim, paper: book.paper },
    fmt: { trim: book.trim, pages: 54, paper: book.paper }, pdf: copy(pdf), design: S.design ? copy(S.design) : null,
    assets: S.assets.filter((a) => S.design && S.design.layers.some((l) => l.asset === a.id)).map(copy), blurb: null, my_layouts: [],
    key: keyOf(), last: { print: lastOf('print'), image: lastOf('image'), kindle: lastOf('kindle') }, now: now()
  });
  // Part 10: cover_key as 32 hex (a hash of the design's layers, bg and fmt, as 0030's md5), the export rows, My layouts.
  function keyOf() {
    if (!S.design) return null;
    const str = JSON.stringify({ layers: S.design.layers, bg: S.design.bg, fmt: S.design.fmt });
    let out = '';
    for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b]) { let h = seed >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } out += h.toString(16).padStart(8, '0'); }
    return out;
  }
  function lastOf(kind) { const e = S.exports.filter((x) => x.kind === kind).pop(); return e ? { id: e.id, created_at: e.created_at, settings_key: e.settings_key, snapshot: {} } : null; }
  const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-0/*' };
  const json = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: H });

  async function handle(url, init) {
    const method = (init && init.method || 'GET').toUpperCase();
    const full = url.slice(HOST.length), qi = full.indexOf('?');
    const path = qi < 0 ? full : full.slice(0, qi), query = qi < 0 ? '' : full.slice(qi + 1);
    const param = (k) => { const m = query.split('&').map((x) => x.split('=')).find((x) => decodeURIComponent(x[0]) === k); return m ? decodeURIComponent(m[1]) : null; };
    const eq = (k) => (param(k) || '').replace(/^eq\./, '');
    const headers = new Headers((init && init.headers) || {});
    const one = /vnd\.pgrst\.object/.test(headers.get('accept') || '');
    const body = () => (init && typeof init.body === 'string' ? JSON.parse(init.body) : null);
    S.calls.push(`${method} ${path}`);
    if (path.startsWith('/auth/')) return json(401, { msg: 'stub: no auth calls' });
    if (path === '/rest/v1/books' && method === 'GET') return json(200, eq('id') === BOOK ? (one ? view() : [view()]) : (one ? null : []));
    if (path === '/rest/v1/books' && method === 'PATCH') return json(200, [{ id: BOOK, current_step: 9, updated_at: now() }]);
    if (path === '/rest/v1/rpc/cover_json') return json(200, body().p_book_id === BOOK ? coverJson() : null);
    if (path === '/rest/v1/cover_designs' && method === 'POST') {
      if (S.design) return json(409, { code: '23505', message: 'duplicate key' });
      const p = body();
      S.design = { book_id: BOOK, layers: p.layers || [], bg: p.bg || '#FFFFFF', fmt: p.fmt, layout: p.layout || null, last_remap: null, rev: 1, created_at: now(), updated_at: now() };
      return json(201, '');
    }
    if (path === '/rest/v1/cover_designs' && method === 'PATCH') {
      const p = body(); S.saves++;
      if (!S.design || S.design.rev !== Number(eq('rev'))) return json(200, []);
      Object.assign(S.design, copy(p), { rev: S.design.rev + 1, updated_at: now() });
      return json(200, [{ rev: S.design.rev, updated_at: S.design.updated_at }]);
    }
    if (path === '/rest/v1/cover_design_history' && method === 'POST') { S.history.push(body()); return json(201, [{ id: 'h' + S.history.length, created_at: now() }]); }
    if (path === '/rest/v1/cover_assets' && method === 'GET') return json(200, S.assets.slice().reverse().map(copy));
    if (path === '/rest/v1/cover_assets' && method === 'POST') {
      const p = body();
      if (!S.files[p.path] || p.path !== `${U}/assets/${p.id}${p.mime === 'image/png' ? '.png' : '.jpg'}` || !p.rights_at) return json(400, { code: '23514', message: 'stub: cover_assets check' });
      const row = Object.assign({ remote: null, credit: null }, p, { rights_at: now(), created_at: now() });
      S.assets.push(row);
      return json(201, [copy(row)]);
    }
    const so = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?covers\/(.+)$/);
    if (so && method === 'POST') {
      const name = decodeURIComponent(so[1]);
      let blob = init.body;
      if (blob instanceof FormData) { for (const [, v] of blob.entries()) if (v instanceof Blob) blob = v; }
      if (!(blob instanceof Blob) || !/^image\/(jpeg|png)$/.test(blob.type)) return json(415, { statusCode: '415', message: 'stub: mime' });
      S.files[name] = blob;
      return json(200, { Key: `covers/${name}`, Id: 'f' + Object.keys(S.files).length });
    }
    if (so && method === 'GET') {
      const f = S.files[decodeURIComponent(so[1])];
      return f ? new Response(f, { status: 200, headers: { 'content-type': f.type } }) : json(400, { statusCode: '404', message: 'Object not found' });
    }
    // Part 10
    if (path === '/rest/v1/rpc/cover_key') return json(200, body().p_book_id === BOOK ? keyOf() : null);
    if (path === '/rest/v1/rpc/cover_marks') return json(200, []);
    if (path === '/rest/v1/cover_exports' && method === 'POST') {
      const list = [].concat(body());
      if (list.some((p) => p.settings_key !== keyOf())) { S.refused.push('cover_stale'); return json(400, { code: 'P0001', message: 'cover_stale', details: '' }); }
      const rows = list.map((p, i) => Object.assign({ id: 'x' + (S.exports.length + i + 1), created_at: now() }, p));
      S.exports.push(...rows);
      return json(201, rows.map((x) => ({ id: x.id, kind: x.kind, created_at: x.created_at })));
    }
    if (path === '/rest/v1/cover_my_layouts' && method === 'POST') {
      const p = body(); const old = S.my.find((m) => m.from_book_id === p.from_book_id);
      const row = Object.assign(old || { id: 'm' + (S.my.length + 1) }, p, { exported_at: now() }); if (!old) S.my.push(row);
      return json(201, [{ id: row.id, exported_at: row.exported_at }]);
    }
    if (path === '/storage/v1/object/list/covers' && method === 'POST') return json(200, []);
    if (path === '/rest/v1/rpc/qc_mark') return json(200, [{ checked_at: ago(1), current: true }]);
    if (path === '/rest/v1/rpc/pdf_marks') return json(200, [{ book_id: BOOK, exported_at: pdf.created_at, page_count: 54, changed: false }]);
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(200, [{ id: PEN, name: book.pen, voice: {} }]);
    if (path.startsWith('/rest/v1/')) return json(200, one ? null : []);
    S.unknown.push(`${method} ${path}`);
    return json(404, { message: 'stub: unknown' });
  }

  const real = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url;
    if (typeof url === 'string' && url.indexOf('supabase.co') >= 0) {
      if (url.indexOf(HOST) !== 0) { S.unknown.push('HOST ' + url); return Promise.reject(new TypeError('stub: other Supabase host')); }
      return handle(url, init || (typeof input === 'object' ? { method: input.method, headers: input.headers } : undefined));
    }
    return real(input, init);
  };
  // No socket or beacon may reach Supabase either.
  const RealWS = window.WebSocket;
  window.WebSocket = function (url, p) { if (String(url).indexOf('supabase.co') >= 0) { S.unknown.push('WS ' + url); throw new Error('stub: no sockets'); } return new RealWS(url, p); };
  if (navigator.sendBeacon) { const rb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { if (String(u).indexOf('supabase.co') >= 0) { S.unknown.push('BEACON ' + u); return false; } return rb(u, d); }; }
})();
