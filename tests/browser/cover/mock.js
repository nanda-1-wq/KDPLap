// Mock for the cover suite (09 Cover, E16 from Part 4). Nothing reaches Supabase.
// It answers as 0030 does: cover_json (book, fmt with null pages without a current Print PDF, pdf, design,
// assets, blurb, my_layouts, key, last), cover_designs insert (rev 1; 23505 on a second one) and the autosave
// update "where book_id = $1 and rev = $rev" (0 rows when the rev moved; rev + 1; the layer caps and the bg
// check as cover_designs' CHECKs), cover_design_history insert.
// Tests change globalThis.__store and globalThis.__modes.
//   __modes: coverFail (n reads of cover_json fail), coverSlow (ms), saveFail (n saves fail), saveSlow (ms),
//   otherTab (n saves find the rev moved: another tab saved), histFail (n snapshots fail), fontsDown (the font CDN)
// Part 6: cover_assets (select own, insert with 0030's CHECKs: path <user>/assets/<id>.jpg|png, mime, bytes ≤ 10 MB,
// 1 to 12,000 px, transparent only for PNG, rights for upload and pdf) and the bucket "covers" (upload: the 0030 path
// rule and JPEG/PNG only; download). store.assets = rows, store.files = { path: { bytes (base64), type } }.
//   __modes: uploadFail, rowFail, listFail, downloadFail (n calls fail), uploadSlow (ms), pdfDown (pdf.js does not load)
// Part 7: the Edge Function "stock" (search and pick, as supabase/functions/stock answers: the results of
// fixture-stock.js, a Pixabay pick stores a copy in the bucket and a cover_assets row, an Unsplash pick a linked row),
// the providers' picture links (pixabay.com/get, images.unsplash.com: the bytes fixture-stock.js drew in the page) and
// cover_assets.name (0031: 1 to 200 characters; the database names a row without one by its source).
// store.stock = { calls: [{ action, source, ... }], net: [urls] }, store.stockFiles = { 'pixabay/<id>': { buf, type } }.
//   __modes: stockFail / pickFail (n calls answer stockCode / pickCode, default stock_unavailable), stockNet (n calls
//   do not reach the function), stockSlow / pickSlow (ms), stockMany (Pixabay answers 30 results: 2 pages of 24),
//   picDown (n picture links fail)
// pdf.js 6.4.299 comes from tests/browser/.cache/format (the format suite's checked cache), never the network.
// Fonts come from tests/browser/.cache/cover-fonts (the Part 2 cache, every file checked against its sha384 there).
const U = '00000000-0000-4000-8000-000000000001';

async function setupCover(page) {
  const ctx = page.context();
  await ctx.unrouteAll();
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const now = () => new Date().toISOString();
  const copy = (x) => JSON.parse(JSON.stringify(x));
  let seq = 0;
  const id = (p) => `${p}${String(++seq).padStart(7, '0')}-0000-4000-8000-000000000000`;

  const store = globalThis.__store = {
    book: { id: FIX.BOOK, title: FIX.title, subtitle: FIX.subtitle, status: 'in_progress', current_step: 9, updated_at: ago(1), pen_name: FIX.pen, bio: FIX.bio, trim: '6x9', paper: 'white' },
    pdf: { export_id: id('e'), page_count: FIX.fmt.pages, created_at: ago(1), current: true },   // null: no Print PDF
    design: null,                  // the cover_designs row, null before the first open
    history: [],                   // cover_design_history rows
    blurb: null,
    assets: [], files: {}, uploads: [], stock: { calls: [], net: [] }, stockFiles: {},
    writes: [], calls: [], cdn: [], saves: 0, reads: 0, dialogs: []
  };
  // "Leave site?" (beforeunload while a save is out or failed) must never block the next test: note it, accept it.
  if (!page.__cvDialog) { page.__cvDialog = true; page.on('dialog', (d) => { (globalThis.__store || { dialogs: [] }).dialogs.push(d.type()); d.accept().catch(() => {}); }); }

  const fmtToday = () => ({ trim: store.book.trim, pages: store.pdf && store.pdf.current ? store.pdf.page_count : null, paper: store.book.paper });
  const coverJson = () => ({
    book: { id: FIX.BOOK, title: store.book.title, subtitle: store.book.subtitle, pen_name_id: FIX.PEN, pen_name: store.book.pen_name, bio_text: store.book.bio, trim: store.book.trim, paper: store.book.paper },
    fmt: fmtToday(),
    pdf: store.pdf ? copy(store.pdf) : null,
    design: store.design ? copy(store.design) : null,
    assets: store.assets.filter((a) => store.design && store.design.layers.some((l) => l.type === 'image' && l.asset === a.id)).map(copy), blurb: store.blurb ? copy(store.blurb) : null, my_layouts: [],
    key: store.design ? 'k' + store.design.rev : null,
    last: { print: null, image: null, kindle: null },
    now: now()
  });
  const view = () => ({
    id: FIX.BOOK, title: store.book.title, subtitle: store.book.subtitle, status: store.book.status, completed_at: null, current_step: store.book.current_step, updated_at: store.book.updated_at, topic_id: null,
    pen_name_id: FIX.PEN, series_name: null, series_number: null, title_needs_review: false, title_examples: [], outline_approved_at: ago(2),
    pen_names: { id: FIX.PEN, name: store.book.pen_name, voice: {} }, topics: null,
    book_briefs: { topic_text: 'Study habits for adults', target_reader: 'Busy adult learners', reader_problem: 'No time to study', promise_draft: 'Study in ten minutes a day', book_type: 'how_to', book_type_label: null, trim_size: store.book.trim, length_range: '8-12k', target_words: null, chapter_count: 5, options: {}, updated_at: ago(2) },
    competitors: [{ count: 3 }], real_sources: [{ count: 1 }], chapters: [{ count: 7 }], review_chapters: [{ count: 0 }],
    positioning: { locked_at: ago(2), one_sentence: 'x', reader_promise: 'y', approach: null, lacks: null, selling_points: [], focus_tags: [], drift_flags: [], drift_checked_at: null, updated_at: ago(2) }
  });
  // cover_designs' CHECKs (0030): layers (cover_layers_ok), bg (cover_hex_ok). The byte cap is measured on the JSON
  // text here (kdpCover.model.pgBytes is the browser's exact measure; tests/limits-parity.test.js holds the parity).
  // The run-code sandbox has no TextEncoder: UTF-8 bytes by code point.
  const utf8 = (str) => { let n = 0; for (const ch of str) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
  function badDesign(p) {
    if ('bg' in p && !/^#[0-9A-F]{6}$/.test(p.bg)) return 'bg';
    if ('layers' in p) {
      const L = p.layers;
      if (!Array.isArray(L) || L.length > 200) return 'layers';
      if (utf8(JSON.stringify(L)) > 524288) return 'bytes';
      for (const l of L) {
        if (!l || typeof l !== 'object' || !['number', 'string'].includes(typeof l.id) || !['text', 'image', 'shape'].includes(l.type)) return 'layer';
        if (l.type === 'text' && (typeof l.text !== 'string' || [...l.text].length > 2000)) return 'text';
      }
    }
    const extra = Object.keys(p).filter((k) => !['layers', 'bg', 'fmt', 'layout', 'last_remap'].includes(k));
    return extra.length ? 'columns ' + extra : '';
  }

  // cover_assets' CHECKs (0030 §5), as the database would refuse a row.
  function badAsset(p) {
    const extra = Object.keys(p).filter((k) => !['id', 'source', 'mime', 'path', 'remote', 'width', 'height', 'bytes', 'transparent', 'credit', 'origin_book_id', 'rights_at', 'name'].includes(k));
    if (extra.length) return 'columns ' + extra;
    if (p.name != null && (typeof p.name !== 'string' || [...p.name.trim()].length > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(p.name))) return 'name';
    if (!['upload', 'pdf', 'pixabay', 'unsplash'].includes(p.source)) return 'source';
    if (!['image/jpeg', 'image/png'].includes(p.mime)) return 'mime';
    if (p.source !== 'unsplash' && p.path !== `${U}/assets/${p.id}${p.mime === 'image/png' ? '.png' : '.jpg'}`) return 'path';
    if (!(p.width >= 1 && p.width <= 12000 && p.height >= 1 && p.height <= 12000) || !Number.isInteger(p.width) || !Number.isInteger(p.height)) return 'px';
    if (p.source !== 'unsplash' && !(p.bytes >= 1 && p.bytes <= 10485760)) return 'bytes';
    if (p.transparent && p.mime !== 'image/png') return 'transparent';
    if (['upload', 'pdf'].includes(p.source) && !p.rights_at) return 'rights';
    if (p.path && !store.files[p.path]) return 'no file';
    return '';
  }

  // 0031 cover_assets_guard: trimmed; blank or missing → a plain word by source.
  const plainName = (p) => (p.name && p.name.trim()) || ({ pdf: 'PDF page', pixabay: 'Pixabay picture', unsplash: 'Unsplash photo' }[p.source] || 'Picture');

  // Part 7: the stock function's answers (supabase/functions/stock/lib.ts ERROR_STATUS).
  const STOCK_STATUS = { bad_request: 400, unauthorized: 401, not_found: 404, too_large: 422, bad_image: 422, rate_limited: 429, server_error: 500, stock_unavailable: 502, not_configured: 503, stock_busy: 503 };
  function stockList(p) {
    let list = STK.results(p.source);
    if (p.source === 'pixabay' && mode('stockMany')) {
      list = Array.from({ length: 30 }, (_, j) => { const b = list[j % list.length]; const nid = String(2000 + j); return { ...b, id: nid, thumb: b.thumb.replace(/g\d+_/, `g${nid}_`), preview: b.preview.replace(/g\d+_/, `g${nid}_`) }; });
    }
    if (/nothing/i.test(p.q || '')) return [];
    const f = p.filters || {};
    if (p.source === 'pixabay') {
      if (f.color === 'transparent') list = list.filter((x) => x.transparent);
      if (f.type && f.type !== 'all') list = list.filter((x) => x.type === f.type);
    }
    return list;
  }
  /** A pick, as the function does it: a Pixabay copy in the bucket + row; an Unsplash linked row. */
  function stockPick(p) {
    const base = (pid) => (Number(pid) >= 2000 ? String(1000 + ((Number(pid) - 2000) % STK.PIXABAY.length)) : pid);
    const item = STK.results(p.source).find((x) => x.id === (p.source === 'pixabay' ? base(String(p.id)) : p.id));
    if (!item) return { code: 'not_found' };
    const aid = id('a');
    const credit = { id: p.source === 'pixabay' ? Number(p.id) : p.id, author: item.author, authorUrl: item.authorUrl, pageUrl: item.pageUrl };
    let row;
    if (p.source === 'pixabay') {
      const f = store.stockFiles[`pixabay/${item.id}`];
      if (!f) return { code: 'stock_unavailable' };
      const mime = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const path = `${U}/assets/${aid}.${mime === 'image/png' ? 'png' : 'jpg'}`;
      store.files[path] = { buf: f.buf, type: mime, size: f.buf.length };
      row = { id: aid, source: 'pixabay', mime, path, remote: null, width: item.width, height: item.height, bytes: f.buf.length, transparent: item.transparent };
    } else {
      row = { id: aid, source: 'unsplash', mime: 'image/jpeg', path: null, remote: { url: STK.raw(item.id), width: item.width, height: item.height }, width: item.width, height: item.height, bytes: null, transparent: false };
    }
    Object.assign(row, { rights_at: null, credit, origin_book_id: p.bookId || null, name: item.name, created_at: now() });
    store.assets.push(row);
    return { row };
  }

  globalThis.__modes = globalThis.__modes || {};
  const mode = (k) => globalThis.__modes[k];
  const take = (k) => { if (mode(k) > 0) { globalThis.__modes[k]--; return true; } return false; };
  const wait = (ms) => page.waitForTimeout(ms);
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
      if (eq('id') !== FIX.BOOK) return json(r, 200, one ? null : []);
      return json(r, 200, one ? view() : [view()]);
    }
    if (path === '/rest/v1/books' && method === 'PATCH') {
      store.writes.push({ table: 'books', body: body() });
      Object.assign(store.book, body());
      return json(r, 200, [{ id: FIX.BOOK, current_step: store.book.current_step, updated_at: now() }]);
    }
    if (path === '/rest/v1/rpc/cover_json') {
      store.reads++;
      if (mode('coverSlow')) await wait(mode('coverSlow'));
      if (take('coverFail')) return json(r, 500, { message: 'mock: cover read down' });
      return json(r, 200, body().p_book_id === FIX.BOOK ? coverJson() : null);
    }
    if (path === '/rest/v1/cover_designs' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'cover_designs', insert: copy(p) });
      if (store.design) return fail(r, 409, '23505', 'duplicate key value violates unique constraint "cover_designs_pkey"');
      const bad = badDesign({ layers: p.layers, bg: p.bg }) || (p.fmt && p.fmt.pages >= 1 ? '' : 'fmt');
      if (bad) return fail(r, 400, '23514', `mock: bad design: ${bad}`);
      store.design = { book_id: FIX.BOOK, layers: p.layers || [], bg: p.bg || '#FFFFFF', fmt: p.fmt, layout: p.layout || null, last_remap: null, rev: 1, created_at: now(), updated_at: now() };
      return json(r, 201, '');
    }
    if (path === '/rest/v1/cover_designs' && method === 'PATCH') {
      const p = body();
      store.saves++;
      store.writes.push({ table: 'cover_designs', body: copy(p), rev: Number(eq('rev')) });
      if (mode('saveSlow')) await wait(mode('saveSlow'));
      if (take('saveFail')) return json(r, 500, { message: 'mock: save down' });
      if (take('otherTab') && store.design) { store.design.rev++; store.design.updated_at = now(); }
      const bad = badDesign(p);
      if (bad) return fail(r, 400, '23514', `mock: bad design: ${bad}`);
      if (!store.design || eq('book_id') !== FIX.BOOK || store.design.rev !== Number(eq('rev'))) return json(r, 200, []);
      Object.assign(store.design, copy(p), { rev: store.design.rev + 1, updated_at: now() });
      return json(r, 200, [{ rev: store.design.rev, updated_at: store.design.updated_at }]);
    }
    if (path === '/rest/v1/cover_design_history' && method === 'POST') {
      const p = body();
      if (take('histFail')) return json(r, 500, { message: 'mock: history down' });
      const row = { id: id('h'), created_at: now(), ...copy(p) };
      store.history.push(row);
      return json(r, 201, [{ id: row.id, created_at: row.created_at }]);
    }
    // Part 6: pictures (0030 cover_assets and the bucket "covers").
    if (path === '/rest/v1/cover_assets' && method === 'GET') {
      if (take('listFail')) return json(r, 500, { message: 'mock: assets down' });
      return json(r, 200, store.assets.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(copy));
    }
    if (path === '/rest/v1/cover_assets' && method === 'POST') {
      const p = body();
      store.writes.push({ table: 'cover_assets', insert: copy(p) });
      if (take('rowFail')) return json(r, 500, { message: 'mock: asset row down' });
      const bad = badAsset(p);
      if (bad) return fail(r, 400, '23514', `mock: cover_assets check: ${bad}`);
      const row = { id: p.id || id('a'), source: p.source, mime: p.mime, path: p.path, remote: p.remote || null, width: p.width, height: p.height, bytes: p.bytes, transparent: !!p.transparent,
        rights_at: p.rights_at ? now() : null, credit: p.credit || null, origin_book_id: p.origin_book_id || null, name: plainName(p), created_at: now() };
      store.assets.push(row);
      return json(r, 201, [copy(row)]);
    }
    const so = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?covers\/(.+)$/);
    if (so && method === 'POST') {
      const name = decodeURIComponent(so[1]);
      if (mode('uploadSlow')) await wait(mode('uploadSlow'));
      if (take('uploadFail')) return json(r, 500, { statusCode: '500', error: 'mock', message: 'mock: storage down' });
      // supabase-js sends a Blob as multipart form data: the file part carries the Blob's own type (as Storage reads it).
      let buf = req.postDataBuffer();
      let type = (req.headers()['content-type'] || '').split(';')[0];
      if (type === 'multipart/form-data') {
        const bd = '--' + (req.headers()['content-type'].match(/boundary=([^;]+)/) || [])[1];
        let at = buf.indexOf(bd), file = null;
        while (at >= 0) {
          const next = buf.indexOf(bd, at + bd.length);
          if (next < 0) break;
          const part = buf.subarray(at + bd.length + 2, next - 2);
          const he = part.indexOf('\r\n\r\n');
          const head = part.subarray(0, he).toString('latin1');
          if (/filename=/.test(head)) file = { type: ((head.match(/content-type:\s*([^\r\n;]+)/i) || [])[1] || '').trim(), buf: part.subarray(he + 4) };
          at = next;
        }
        if (!file) return json(r, 400, { statusCode: '400', error: 'mock', message: 'no file part' });
        buf = file.buf; type = file.type;
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/.test(name) || !name.startsWith(U + '/'))
        return json(r, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (!['image/jpeg', 'image/png'].includes(type)) return json(r, 415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
      if (buf.length > 10485760) return json(r, 413, { statusCode: '413', error: 'Payload too large', message: 'too large' });
      if (store.files[name]) return json(r, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      store.files[name] = { buf, type, size: buf.length };
      store.uploads.push({ name, type, size: buf.length });
      return json(r, 200, { Key: `covers/${name}`, Id: id('f') });
    }
    if (so && method === 'GET') {
      const name = decodeURIComponent(so[1]);
      if (take('downloadFail')) return json(r, 500, { statusCode: '500', error: 'mock', message: 'mock: storage down' });
      if (!store.files[name]) return json(r, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const f = store.files[name];
      return r.fulfill({ status: 200, contentType: f.type, headers: cors, body: f.buf });
    }
    if (path === '/storage/v1/object/covers' && method === 'DELETE') {
      const p = body() || {};
      const gone = (p.prefixes || []).filter((n) => store.files[n]);
      for (const n of gone) delete store.files[n];
      return json(r, 200, gone.map((n) => ({ name: n })));
    }
    // Part 7: the Edge Function "stock".
    if (path === '/functions/v1/stock' && method === 'POST') {
      const p = body();
      store.stock.calls.push(copy(p));
      if (take('stockNet')) return r.abort();
      if (p.action === 'search') {
        if (mode('stockSlow')) await wait(mode('stockSlow'));
        if (take('stockFail')) { const c = mode('stockCode') || 'stock_unavailable'; return json(r, STOCK_STATUS[c], { error: c }); }
        const all = stockList(p), page = p.page || 1;
        return json(r, 200, { source: p.source, q: p.q, page, perPage: 24, total: all.length, results: all.slice((page - 1) * 24, page * 24), cached: false });
      }
      if (p.action === 'pick') {
        if (mode('pickSlow')) await wait(mode('pickSlow'));
        if (take('pickFail')) { const c = mode('pickCode') || 'stock_unavailable'; return json(r, STOCK_STATUS[c], { error: c }); }
        const out = stockPick(p);
        if (out.code) return json(r, STOCK_STATUS[out.code], { error: out.code });
        return json(r, 200, { asset: copy(out.row) });
      }
      return json(r, 400, { error: 'bad_request' });
    }
    // The rail's 07 and 08 marks (design 58 shows them done): a current run, and a current Print PDF when there is one.
    if (path === '/rest/v1/rpc/qc_mark') return json(r, 200, [{ checked_at: ago(1), current: true }]);
    if (path === '/rest/v1/rpc/pdf_marks') return json(r, 200, store.pdf ? [{ book_id: FIX.BOOK, exported_at: store.pdf.created_at, page_count: store.pdf.page_count, changed: !store.pdf.current }] : []);
    if (path === '/rest/v1/pen_names' && method === 'GET') return json(r, 200, [{ id: FIX.PEN, name: store.book.pen_name, voice: {} }]);
    if (path.startsWith('/rest/v1/')) return json(r, 200, one ? null : []);
    return json(r, 404, { message: 'mock: unknown' });
  }

  // Cover fonts: the @expo-google-fonts TTFs, jsdelivr and unpkg alike, from the checked Part 2 cache.
  const fontFile = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(@expo-google-fonts\/[^/]+)\/(.+\.ttf)$/;
  const pdfFile = /^https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(pdfjs-dist@6\.4\.299)\/(build\/pdf(?:\.worker)?\.min\.mjs)$/;
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, async (r) => {
    const pm = r.request().url().match(pdfFile);
    if (pm) {
      store.cdn.push(`${pm[2]}/${pm[3]}`);
      if (mode('pdfDown')) return r.abort();
      return r.fulfill({ path: `${CACHE}/format/${pm[2]}/${pm[3]}`, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    }
    const m = r.request().url().match(fontFile);
    if (!m) { store.cdn.push('NET ' + r.request().url()); return r.fallback(); }
    store.cdn.push(`${m[2]}/${m[3]}`);
    if (mode('fontsDown')) return r.abort();
    return r.fulfill({ path: `${CACHE}/cover-fonts/${m[2]}/${m[3]}`, contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' } });
  });
  // Part 7: fixture-stock.js posts the pictures it drew; the providers' links serve them back.
  await ctx.route('https://stock-files.test/**', (r) => {
    const req = r.request();
    const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    store.stockFiles[req.url().replace('https://stock-files.test/', '')] = { buf: req.postDataBuffer(), type: (req.headers()['content-type'] || '').split(';')[0] };
    return r.fulfill({ status: 200, headers: h, body: 'ok' });
  });
  await ctx.route(/^https:\/\/(pixabay\.com\/get|images\.unsplash\.com)\//, (r) => {
    const url = r.request().url();
    store.stock.net.push(url);
    if (take('picDown')) return r.fulfill({ status: 503, body: 'down' });
    let key = null;
    const pm = url.match(/^https:\/\/pixabay\.com\/get\/g(\d+)_/);
    if (pm) { const n = Number(pm[1]); key = `pixabay/${n >= 2000 ? 1000 + ((n - 2000) % STK.PIXABAY.length) : n}`; }
    const um = url.match(/^https:\/\/images\.unsplash\.com\/photo-([A-Za-z0-9_-]+)/);
    if (um) key = `unsplash/${um[1]}`;
    const f = key && store.stockFiles[key];
    if (!f) return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
    return r.fulfill({ status: 200, contentType: f.type, headers: { 'access-control-allow-origin': '*' }, body: f.buf });
  });
  await ctx.route('**/supabase-js@2.49.4/dist/umd/supabase.js', (r) => r.fulfill({ path: `${CACHE}/supabase-2.49.4.js`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  if (!globalThis.__withFonts) await ctx.route('**/fonts.googleapis.com/**', (r) => r.abort());
  const session = {
    access_token: 'mock.eyJzdWIiOiJtb2NrIn0.mock', refresh_token: 'mock', token_type: 'bearer',
    expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: { id: U, aud: 'authenticated', role: 'authenticated', email: 'adnan@example.com', user_metadata: { full_name: 'Adnan' }, app_metadata: {}, created_at: ago(30) }
  };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-hmtxnbgfzwqawfulwwrg-auth-token', s); } catch (e) {} }, JSON.stringify(session));
}

const setup = (page) => setupCover(page);

// Shared helpers for the cover tests.
const CV = {
  url: (step = 9) => `http://127.0.0.1:5500/app/book.html?id=${FIX.BOOK}&step=${step}`,
  /** design: null (first open), 'empty' (a saved empty cover) or 'band' (Band + warm blurb, design 59). */
  async open(page, { design = 'keep', step = 9, ready = true } = {}) {
    const st = globalThis.__store;
    if (design === 'band') { const b = await FIX.band(page); st.design = { book_id: FIX.BOOK, layers: b.layers, bg: b.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
    else if (design === 'empty') st.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { ...FIX.fmt }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    else if (design === null) st.design = null;
    await CV.quiet(page);
    await page.goto(CV.url(step), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-step-title]:not(:empty)', { timeout: 10000 });
    if (step === 9 && ready) await CV.ready(page);
  },
  /**
   * Before leaving the page: let the editor forget a save that is out or failed, so "Leave site?" never
   * opens (a beforeunload dialog blocks the playwright-cli session). t-save checks that warning itself.
   */
  async quiet(page) {
    await page.evaluate(() => { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); if (E) E.saver = null; }).catch(() => {});
  },
  /** The editor is drawn (or Locked, or an error). */
  async ready(page) {
    await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && (E.status === 'locked' || E.status === 'error' || (E.status === 'ready' && E.painted > 0)); }, null, { timeout: 20000 });
    await page.waitForTimeout(80);
  },
  state: (page) => page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return E ? { status: E.status, sel: E.sel, editing: E.editing, menu: E.menu, z: E.view.z, px: E.view.px, py: E.view.py, save: E.saveState, layers: E.cover && E.cover.layers, bg: E.cover && E.cover.bg, tpl: E.tpl, painted: E.painted } : null; }),
  /** Wait until autosave is quiet: Saved, or Not saved. */
  async settled(page, want) {
    await page.waitForFunction((w) => {
      const E = window.kdpBookSteps[9]._debug(); if (!E || !E.saver) return false;
      const quiet = E.saveState === 'failed' || (E.saveState === 'saved' && !E.saver.pending());
      return quiet && (!w || E.saveState === w);
    }, want || null, { timeout: 8000 });
  },
  /** The board point (bx, by) in page px. */
  pt: (page, bx, by) => page.evaluate(([x, y]) => { const E = window.kdpBookSteps[9]._debug(); const r = document.querySelector('[data-ws]').getBoundingClientRect(); return [r.left + E.view.px + x * E.view.z, r.top + E.view.py + y * E.view.z]; }, [bx, by]),
  /** The center of a layer's box in page px. */
  center: (page, src) => page.evaluate((s) => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.src === s || x.id === s); const el = document.querySelector(`[data-hit="${l.id}"]`); const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, src),
  layer: (page, src) => page.evaluate((s) => { const E = window.kdpBookSteps[9]._debug(); return E.cover.layers.find((x) => x.src === s || x.id === s) || null; }, src),
  /** A pixel of the layer canvas (device px), as [r, g, b, a]. */
  px: (page, x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('[data-canvas]'); const r = c.getBoundingClientRect(); const d = window.devicePixelRatio || 1; return [...c.getContext('2d').getImageData(Math.round((x - r.left) * d), Math.round((y - r.top) * d), 1, 1).data]; }, [x, y]),
  log() {
    const log = globalThis.__log = [];
    return { log, ok: (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`) };
  },
  txt: (page, sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()),
  all: (page, sel) => page.$$eval(sel, (es) => es.map((e) => e.innerText.replace(/\s+/g, ' ').trim())),
  has: async (page, sel) => !!(await page.$(sel)),
  noScroll: (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  lastSave: () => [...globalThis.__store.writes].reverse().find((w) => w.table === 'cover_designs' && w.body),
  mockErrors: () => globalThis.__store.calls.filter((c) => c.startsWith('ERR'))
};
