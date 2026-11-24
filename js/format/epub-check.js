/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: check an EPUB's bytes before a download (E13.3 Part 1, plan §5)
   /js/format/epub-check.js   (pure, no DOM unless the DOMParser checker is
                               used; needs js/cover/zip.js for the CRC;
                               tested by tests/epub-check.test.js)

   It reads back the zip we just made (a small store-only reader, CRC
   checked) and runs three checks, like the three Print PDF checks. A failed
   check: no download, "The EPUB failed a check: <name>" and Try again.

   kdpEpubCheck.read(bytes)            → { entries: [{ name, method, localExtra, crcOk, data }], files: Map(name → text) }
   kdpEpubCheck.checks(info, { expect, wellFormed }) → [{ key, name, pass, detail }]
     expect      { title, subtitle, author, isbn } from that export's format_json
                 (title: 04 Title, author: the pen name, isbn: the print ISBN or null)
     wellFormed  (name, text) → true, or a reason: a strict XML check of one file.
                 The browser passes kdpEpubCheck.domWellFormed (DOMParser); the
                 Deno tests pass a strict test-only checker.
       structure  File structure: mimetype first, stored, "application/epub+zip";
                  container.xml → the OPF; manifest = the zip's files, both ways;
                  every XML file well-formed; ids unique; fewer than 300 XHTML
                  files, each under 30 MB (Kindle Publishing Guidelines §9)
       contents   Contents: nav toc and NCX have the same entries in spine order,
                  at most 2 levels, the contents page lists them too; every link
                  lands on a file and an id; a contents link never lands on an
                  id on <body> or in hidden text (Kindle E24010); no page numbers
       details    Book details: title, subtitle and author equal 04 Title and the
                  pen name; language en; identifier and modified date; no ISBN (Q2)
   kdpEpubCheck.ok(list)               → every check passed
   kdpEpubCheck.parseXml(text)         → a small tree { name, attrs, children } (throws when broken)
   kdpEpubCheck.domWellFormed(name, text) → the browser checker
═══════════════════════════════════════════════════ */

(function (root) {
  'use strict';
  const MIMETYPE = 'application/epub+zip';
  const MAX_XHTML = 300;               // "The eBook must contain fewer than 300 HTML files."
  const MAX_XHTML_BYTES = 30 * 1024 * 1024;

  /* ── The zip ─────────────────────────────── */

  function read(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dec = new TextDecoder('utf-8', { fatal: true });
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = [];
    const files = new Map();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory');
      const method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (dv.getUint32(local, true) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
      const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(start, start + size);
      const crcOk = method === 0 && root.kdpCover.zip.crc32(data) === crc;
      entries.push({ name, method, local, localExtra: lExtraLen, crcOk, data });
      if (files.has(name)) throw new Error(`the name ${name} is used twice`);
      let text = null;
      if (method === 0) { try { text = dec.decode(data); } catch (e) { text = null; } }
      files.set(name, text);
      p += 46 + nameLen + extraLen + commentLen;
    }
    entries.sort((a, b) => a.local - b.local);
    return { entries, files };
  }

  /* ── A small XML reader (our own files) ───── */

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decode(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);?/g, (m, e) => {
      if (!m.endsWith(';')) throw new Error(`bad entity ${m}`);
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      if (!(e in ENT)) throw new Error(`unknown entity &${e};`);
      return ENT[e];
    });
  }

  /** XML text → { name, attrs, children: [element | string] }. Throws when it is not well formed. */
  function parseXml(text) {
    let i = 0;
    const s = String(text);
    const top = { name: '#doc', attrs: {}, children: [] };
    const stack = [top];
    const NAME = /^[A-Za-z_][\w.:-]*/;
    while (i < s.length) {
      if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i); if (e < 0) throw new Error('open <?'); i = e + 2; continue; }
      if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i); if (e < 0) throw new Error('open comment'); i = e + 3; continue; }
      if (s.startsWith('<![CDATA[', i)) { const e = s.indexOf(']]>', i); if (e < 0) throw new Error('open CDATA'); stack[stack.length - 1].children.push(s.slice(i + 9, e)); i = e + 3; continue; }
      if (s.startsWith('<!', i)) { const e = s.indexOf('>', i); if (e < 0) throw new Error('open <!'); i = e + 1; continue; }
      if (s.startsWith('</', i)) {
        const e = s.indexOf('>', i);
        if (e < 0) throw new Error('open end tag');
        const name = s.slice(i + 2, e).trim();
        const el = stack.pop();
        if (!el || el.name !== name || el === top) throw new Error(`</${name}> does not close <${el ? el.name : ''}>`);
        i = e + 1;
        continue;
      }
      if (s[i] === '<') {
        const m = NAME.exec(s.slice(i + 1));
        if (!m) throw new Error(`bad tag at ${i}`);
        const el = { name: m[0], attrs: {}, children: [] };
        i += 1 + m[0].length;
        for (;;) {
          const ws = /^\s*/.exec(s.slice(i))[0];
          i += ws.length;
          if (s.startsWith('/>', i)) { i += 2; stack[stack.length - 1].children.push(el); break; }
          if (s[i] === '>') { i += 1; stack[stack.length - 1].children.push(el); stack.push(el); break; }
          if (!ws) throw new Error(`bad attribute in <${el.name}>`);
          const a = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/.exec(s.slice(i));
          if (!a) throw new Error(`bad attribute in <${el.name}>`);
          if (a[1] in el.attrs) throw new Error(`attribute ${a[1]} twice in <${el.name}>`);
          el.attrs[a[1]] = decode(a[3] != null ? a[3] : a[4]);
          i += a[0].length;
        }
        continue;
      }
      const e = s.indexOf('<', i);
      const t = s.slice(i, e < 0 ? s.length : e);
      if (stack.length === 1) { if (t.trim()) throw new Error('text outside the root'); }
      else stack[stack.length - 1].children.push(decode(t));
      i = e < 0 ? s.length : e;
    }
    if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is not closed`);
    const roots = top.children.filter((c) => typeof c !== 'string');
    if (roots.length !== 1) throw new Error('not one root element');
    return roots[0];
  }

  const els = (n) => n.children.filter((c) => typeof c !== 'string');
  function* walk(n) { yield n; for (const c of els(n)) yield* walk(c); }
  const find = (n, pred) => { for (const x of walk(n)) if (pred(x)) return x; return null; };
  const all = (n, pred) => [...walk(n)].filter(pred);
  const textOf = (n) => n.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
  const label = (n) => textOf(n).replace(/\s+/g, ' ').trim();
  const types = (n) => String(n.attrs['epub:type'] || '').split(/\s+/);
  /** The elements from the root down to the one with this id, or null. */
  function pathTo(n, id, up = []) {
    const here = [...up, n];
    if (n.attrs.id === id) return here;
    for (const c of els(n)) { const p = pathTo(c, id, here); if (p) return p; }
    return null;
  }
  /** Hidden on Kindle: the hidden attribute, or display: none / visibility: hidden in a style attribute. */
  const hiddenEl = (n) => n.attrs.hidden != null || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs.style || '');

  /** "OEBPS/" + "c01.xhtml#s1" → { file: "OEBPS/c01.xhtml", id: "s1" } */
  function resolve(fromFile, href) {
    const [path, id = null] = String(href).split('#');
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/') + 1) : '';
    const parts = (path ? dir + decodeURIComponent(path) : fromFile).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
    return { file: out.join('/'), id };
  }
  const external = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href);

  /* ── The checks ──────────────────────────── */

  const fail = (key, name, detail) => ({ key, name, pass: false, detail });
  const pass = (key, name, detail) => ({ key, name, pass: true, detail });
  const NAMES = { structure: 'File structure', contents: 'Contents', details: 'Book details' };

  function structure(info, wellFormed, ctx) {
    const N = NAMES.structure;
    const first = info.entries[0];
    if (!first || first.name !== 'mimetype') return fail('structure', N, 'mimetype is not the first file');
    if (first.method !== 0 || first.localExtra !== 0) return fail('structure', N, 'mimetype is compressed or has an extra field');
    if (info.files.get('mimetype') !== MIMETYPE) return fail('structure', N, 'mimetype is not application/epub+zip');
    const bad = info.entries.find((e) => e.method !== 0 || !e.crcOk);
    if (bad) return fail('structure', N, `${bad.name}: not stored or a wrong CRC`);
    const container = info.files.get('META-INF/container.xml');
    if (container == null) return fail('structure', N, 'no META-INF/container.xml');
    // Every XML file: the strict checker, then our reader.
    const trees = new Map();
    for (const [name, text] of info.files) {
      if (!/\.(xhtml|opf|ncx|xml)$/.test(name)) continue;
      if (text == null) return fail('structure', N, `${name}: not UTF-8 text`);
      const ok = wellFormed(name, text);
      if (ok !== true) return fail('structure', N, `${name}: not well formed (${ok})`);
      try { trees.set(name, parseXml(text)); } catch (e) { return fail('structure', N, `${name}: ${e.message}`); }
    }
    const rf = find(trees.get('META-INF/container.xml'), (n) => n.name === 'rootfile');
    if (!rf || rf.attrs['media-type'] !== 'application/oebps-package+xml') return fail('structure', N, 'container.xml has no package rootfile');
    const opfName = rf.attrs['full-path'];
    const opf = trees.get(opfName);
    if (!opf || opf.name !== 'package') return fail('structure', N, `the OPF ${opfName} is missing`);
    const items = all(opf, (n) => n.name === 'item').map((n) => ({ ...n.attrs, file: resolve(opfName, n.attrs.href).file }));
    const byId = new Map(items.map((x) => [x.id, x]));
    if (byId.size !== items.length) return fail('structure', N, 'a manifest id is used twice');
    const missing = items.find((x) => !info.files.has(x.file));
    if (missing) return fail('structure', N, `${missing.file} is in the manifest, not in the zip`);
    const listed = new Set(items.map((x) => x.file));
    const extra = [...info.files.keys()].find((f) => f !== 'mimetype' && !f.startsWith('META-INF/') && f !== opfName && !listed.has(f));
    if (extra) return fail('structure', N, `${extra} is in the zip, not in the manifest`);
    const navs = items.filter((x) => String(x.properties || '').split(/\s+/).includes('nav'));
    if (navs.length !== 1) return fail('structure', N, 'not one nav document');
    const spineEl = find(opf, (n) => n.name === 'spine');
    const spine = spineEl ? els(spineEl).filter((n) => n.name === 'itemref').map((n) => byId.get(n.attrs.idref)) : [];
    if (!spine.length || spine.some((x) => !x || x.file === undefined)) return fail('structure', N, 'the spine is empty or names an unknown item');
    const ncx = spineEl && byId.get(spineEl.attrs.toc);
    if (!ncx || ncx['media-type'] !== 'application/x-dtbncx+xml') return fail('structure', N, 'the spine has no NCX');
    const xhtml = items.filter((x) => x['media-type'] === 'application/xhtml+xml');
    if (xhtml.length >= MAX_XHTML) return fail('structure', N, `${xhtml.length} XHTML files (Kindle: fewer than ${MAX_XHTML})`);
    const big = xhtml.find((x) => info.entries.find((e) => e.name === x.file).data.length >= MAX_XHTML_BYTES);
    if (big) return fail('structure', N, `${big.file} is 30 MB or more`);
    for (const x of xhtml) {
      const ids = all(trees.get(x.file), (n) => n.attrs.id != null).map((n) => n.attrs.id);
      if (new Set(ids).size !== ids.length) return fail('structure', N, `${x.file}: an id is used twice`);
    }
    Object.assign(ctx, { trees, opf, opfName, items, spine, nav: navs[0], ncx });
    return pass('structure', N, `${info.entries.length} files, ${xhtml.length} XHTML`);
  }

  function contents(info, ctx) {
    const N = NAMES.contents;
    const { trees, spine, nav, ncx, opf } = ctx;
    const navTree = trees.get(nav.file);
    const tocNav = find(navTree, (n) => n.name === 'nav' && types(n).includes('toc'));
    if (!tocNav) return fail('contents', N, 'no toc nav');
    const ncxTree = trees.get(ncx.file);
    const navMap = find(ncxTree, (n) => n.name === 'navMap');
    if (!navMap) return fail('contents', N, 'no NCX navMap');
    // Entries: [{ level, label, file, id }]
    const fromOl = (ol, level, out) => {
      for (const li of els(ol).filter((n) => n.name === 'li')) {
        const a = els(li).find((n) => n.name === 'a');
        if (!a) throw new Error('a nav entry with no link');
        out.push({ level, label: label(a), ...resolve(nav.file, a.attrs.href) });
        const sub = els(li).find((n) => n.name === 'ol');
        if (sub) fromOl(sub, level + 1, out);
      }
      return out;
    };
    const fromPoints = (parent, level, out) => {
      for (const np of els(parent).filter((n) => n.name === 'navPoint')) {
        const t = find(np, (n) => n.name === 'text');
        const c = els(np).find((n) => n.name === 'content');
        if (!t || !c) throw new Error('a navPoint with no label or link');
        out.push({ level, label: label(t), order: Number(np.attrs.playOrder), ...resolve(ncx.file, c.attrs.src) });
        fromPoints(np, level + 1, out);
      }
      return out;
    };
    let a, b;
    try {
      const ol = els(tocNav).find((n) => n.name === 'ol');
      if (!ol) return fail('contents', N, 'the toc nav has no list');
      a = fromOl(ol, 1, []);
      b = fromPoints(navMap, 1, []);
    } catch (e) { return fail('contents', N, e.message); }
    if (!a.length) return fail('contents', N, 'the contents are empty');
    if (a.some((x) => x.level > 2) || b.some((x) => x.level > 2)) return fail('contents', N, 'more than 2 levels');
    const same = (x, y) => x.length === y.length && x.every((e, i) => e.level === y[i].level && e.label === y[i].label && e.file === y[i].file && e.id === y[i].id);
    if (!same(a, b)) return fail('contents', N, 'nav and NCX entries differ');
    if (b.some((x, i) => x.order !== i + 1)) return fail('contents', N, 'NCX playOrder is not 1, 2, 3 \u2026');
    const uid = find(ncxTree, (n) => n.name === 'meta' && n.attrs.name === 'dtb:uid');
    const ident = find(opf, (n) => n.name === 'dc:identifier' && n.attrs.id === opf.attrs['unique-identifier']);
    if (!uid || !ident || uid.attrs.content !== label(ident)) return fail('contents', N, 'the NCX uid is not the book identifier');
    // The contents page (the guide's toc) lists the same entries.
    const guideToc = find(opf, (n) => n.name === 'reference' && n.attrs.type === 'toc');
    if (!guideToc) return fail('contents', N, 'no contents page in the guide');
    const pageFile = resolve(ctx.opfName, guideToc.attrs.href).file;
    const pageTree = trees.get(pageFile);
    if (!pageTree || !spine.some((x) => x.file === pageFile)) return fail('contents', N, 'the contents page is not in the spine');
    const c = all(pageTree, (n) => n.name === 'p' && /\btoc-[12]\b/.test(n.attrs.class || '')).map((p) => {
      const link = els(p).find((n) => n.name === 'a');
      return { level: /\btoc-2\b/.test(p.attrs.class) ? 2 : 1, label: link ? label(link) : '', ...resolve(pageFile, link ? link.attrs.href : '') };
    });
    if (!same(a, c)) return fail('contents', N, 'the contents page and the nav differ');
    // Spine order, and every link lands on a spine file and an id.
    const where = (e) => {
      const at = spine.findIndex((x) => x.file === e.file);
      if (at < 0) return null;
      if (!e.id) return [at, -1];
      const tree = trees.get(e.file);
      const ids = all(tree, (n) => n.attrs.id != null).map((n) => n.attrs.id);
      const k = ids.indexOf(e.id);
      return k < 0 ? null : [at, k];
    };
    // Kindle E24010: a contents entry never lands on an id on <body>, nor in hidden text,
    // and the style sheets hide nothing.
    for (const [name, text] of info.files) {
      if (name.endsWith('.css') && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(text || '')) return fail('contents', N, `${name} hides text`);
    }
    let last = [-1, -1];
    for (const e of a) {
      const w = where(e);
      if (!w) return fail('contents', N, `a contents link does not land: ${e.file}${e.id ? `#${e.id}` : ''}`);
      const chain = e.id ? pathTo(trees.get(e.file), e.id) : [trees.get(e.file)];
      if (e.id && chain[chain.length - 1].name === 'body') return fail('contents', N, `a contents link lands on the body: ${e.file}#${e.id}`);
      if (chain.some(hiddenEl)) return fail('contents', N, `a contents link lands on hidden text: ${e.file}${e.id ? `#${e.id}` : ''}`);
      if (w[0] < last[0] || (w[0] === last[0] && w[1] <= last[1])) return fail('contents', N, `out of book order: ${e.label}`);
      last = w;
    }
    for (const x of spine) {
      for (const link of all(trees.get(x.file), (n) => n.name === 'a' && n.attrs.href != null)) {
        if (external(link.attrs.href)) continue;
        if (!where(resolve(x.file, link.attrs.href))) return fail('contents', N, `a link in ${x.file} does not land: ${link.attrs.href}`);
      }
    }
    // No page numbers.
    if (find(ncxTree, (n) => n.name === 'pageList')) return fail('contents', N, 'the NCX has a page list');
    for (const [name, tree] of trees) {
      if (!name.endsWith('.xhtml')) continue;
      if (find(tree, (n) => types(n).includes('page-list') || types(n).includes('pagebreak'))) return fail('contents', N, `${name} has page numbers`);
    }
    return pass('contents', N, `${a.length} entries`);
  }

  function details(info, ctx, expect) {
    const N = NAMES.details;
    const { opf } = ctx;
    const meta = find(opf, (n) => n.name === 'metadata');
    if (!meta) return fail('details', N, 'no metadata');
    const kids = els(meta);
    const refine = (id, prop) => kids.find((n) => n.name === 'meta' && n.attrs.refines === `#${id}` && n.attrs.property === prop);
    const titles = kids.filter((n) => n.name === 'dc:title');
    const typeOf = (n) => (refine(n.attrs.id, 'title-type') || { children: [] }).children.join('');
    // Kindle E20006: more than one dc:title needs exactly one refined as title-type main.
    const mains = titles.filter((n) => typeOf(n) === 'main');
    if (mains.length !== 1 || titles.some((n) => !['main', 'subtitle'].includes(typeOf(n)))) return fail('details', N, 'not one main title (E20006)');
    const main = mains[0];
    const sub = titles.find((n) => typeOf(n) === 'subtitle');
    const want = (v) => (typeof v === 'string' ? v.trim() : '');
    const wantTitle = want(expect.title) || 'Untitled book';
    if (!main || textOf(main) !== wantTitle) return fail('details', N, 'the title is not 04 Title');
    if (titles.length !== (want(expect.subtitle) ? 2 : 1)) return fail('details', N, 'a title too many or too few');
    if (want(expect.subtitle) ? !sub || textOf(sub) !== want(expect.subtitle) : !!sub) return fail('details', N, 'the subtitle is not 04 Title');
    const creators = kids.filter((n) => n.name === 'dc:creator');
    if (want(expect.author) ? creators.length !== 1 || textOf(creators[0]) !== want(expect.author) : creators.length) return fail('details', N, 'the author is not the pen name');
    const langs = kids.filter((n) => n.name === 'dc:language');
    if (langs.length !== 1 || textOf(langs[0]) !== 'en') return fail('details', N, 'the language is not en');
    const ids = kids.filter((n) => n.name === 'dc:identifier');
    if (ids.length !== 1 || ids[0].attrs.id !== opf.attrs['unique-identifier'] || !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(textOf(ids[0]))) return fail('details', N, 'not one urn:uuid identifier');
    const mod = kids.find((n) => n.name === 'meta' && n.attrs.property === 'dcterms:modified');
    if (!mod || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(textOf(mod))) return fail('details', N, 'no modified date');
    // No ISBN (Q2): no ISBN identifier, and the print ISBN's digits are in no file.
    // The word "ISBN" in the writer's own text is allowed (a book about publishing).
    const digits = want(expect.isbn).replace(/[^0-9]/g, '');
    const isbnRe = digits.length === 13 ? new RegExp(digits.split('').join('[-\\s\u00A0]?')) : null;
    for (const [name, text] of info.files) {
      if (text == null) continue;
      if (/urn:isbn/i.test(text)) return fail('details', N, `${name} names an ISBN`);
      if (isbnRe && isbnRe.test(text)) return fail('details', N, `${name} holds the print ISBN`);
    }
    return pass('details', N, 'title, author, language, identifier');
  }

  /** The three checks, in order. A failed earlier check fails the later ones too (they need its reading). */
  function checks(info, { expect = {}, wellFormed } = {}) {
    if (typeof wellFormed !== 'function') throw new Error('epub-check: wellFormed is required');
    const ctx = {};
    const s = structure(info, wellFormed, ctx);
    if (!s.pass) return [s, fail('contents', NAMES.contents, 'not checked'), fail('details', NAMES.details, 'not checked')];
    return [s, contents(info, ctx), details(info, ctx, expect)];
  }

  const ok = (list) => list.length === 3 && list.every((c) => c.pass);

  /** The browser checker: DOMParser in XML mode. */
  function domWellFormed(name, text) {
    const type = name.endsWith('.xhtml') ? 'application/xhtml+xml' : 'application/xml';
    const doc = new DOMParser().parseFromString(text, type);
    const err = doc.getElementsByTagName('parsererror')[0];
    return err ? (err.textContent || 'parser error').slice(0, 200) : true;
  }

  root.kdpEpubCheck = { read, checks, ok, parseXml, domWellFormed, NAMES };
})(globalThis);
