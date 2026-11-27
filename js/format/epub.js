/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the book → EPUB 3 (E13.3 Part 1, plan §2)
   /js/format/epub.js   (pure, no DOM; needs js/markdown-lite.js,
                         js/export-rules.js, js/export-build.js (mdBody),
                         js/format-rules.js, js/format/md2typst.js
                         (chapterTitle, chapterLabel) and js/cover/zip.js;
                         tested by tests/format-epub.test.js)

   The Kindle ebook, from the same model and inputs as the Print PDF:
   kdpFormatRules.modelOf(export_json, settings) (Final sections only), the
   extras (year, Also by) and the book (title, subtitle, pen name, bio). The
   same part order as book.typ: title page → copyright → contents →
   Introduction, chapters, Conclusion → About the author → Also by.

   Files: mimetype (first, stored), META-INF/container.xml,
   OEBPS/content.opf, OEBPS/nav.xhtml (toc + landmarks, not in the spine),
   OEBPS/toc.ncx (KDP asks for it), OEBPS/style.css, and one XHTML file per
   part in the spine (each one starts a new screen on Kindle).

   Text: the md2typst grammar, read the same way (a parity test checks the
   two give the same blocks). Every character of the writer's text is
   escaped; only our own tags are added. Curly quotes follow Typst's rule
   (the same quote in print and in the EPUB), and a quote right after a
   digit stays straight, as print. Print only, never here: drop cap,
   running header, recto start, page numbers, blank pages, trim, paper,
   ISBN (Q2). No cover (Q1), no fonts (Q3).

   kdpEpub.ENGINE_ID                    → 'epub3 · e1'
   kdpEpub.build(model, settings, extras) → { files: [{ name, text }], spine, nav, meta }
     model     kdpFormatRules.modelOf(export_json, settings)
     settings  the book_formats row (kdpFormatRules.normalize)
     extras    { year, alsoBy: [{ title, subtitle }], bookId, now (ISO, the server time) }
     E17: model.bookParts adds dedication, epigraph (centered, before the contents),
     foreword, preface (after it), acknowledgments, about, review request and Also by,
     with epub:type per part. nav, NCX and contents list foreword, preface,
     acknowledgments and about only (Q-5). extras.alsoBy is then not read.
     spine     [{ id, href, title }] in reading order (the Kindle preview renders these)
     nav       [{ label, href, children: [{ label, href }] }] (nav, NCX and contents.xhtml)
     meta      { title, subtitle, author, identifier, modified }
   kdpEpub.zip(built)                   → Uint8Array (store-only zip, entries dated `modified`, UTC)
   kdpEpub.make(model, settings, extras) → Uint8Array
   kdpEpub.fileName(title)              → "chair-yoga-for-seniors-ebook.epub"
   kdpEpub.css(style)                   → style.css for a text style
   kdpEpub.blockList(md)                → [{ type, level?, html, items? }] (the parity test)
   kdpEpub.inline(line)                 → XHTML of one line (emphasis, links, curly quotes)
   kdpEpub.uuid(bookId)                 → "urn:uuid:…" (stable; the raw id is never in the file)
   kdpEpub.sha256(bytes)                → Uint8Array(32)
═══════════════════════════════════════════════════ */

(function (root) {
  'use strict';
  const ENGINE_ID = 'epub3 \u00B7 e1';

  // As md2typst: control characters are removed first (they are also our placeholders).
  const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
  // Not allowed in XML (or not wanted in a Kindle file): C1 controls, U+FFFE, U+FFFF, lone surrogates.
  const XML_BAD = /[\u0080-\u009F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

  // The md2typst grammar (js/format/md2typst.js), unchanged.
  const HEADING = /^(#{1,6})[ \t]+(.*)$/;
  const BULLET = /^[ \t]*[-+*][ \t]+(.*)$/;
  const NUMBERED = /^[ \t]*([0-9]{1,9})[.)][ \t]+(.*)$/;
  const QUOTE = /^[ \t]*>[ \t]?(.*)$/;
  const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/g;
  const SAFE_URL = /^(https?:\/\/[^\s"\\]+|mailto:[^\s"\\]+)$/i;
  // The EPUB only: a link needs a real host (https) or a real address (mailto) in the text as typed.
  // The URL parser is no help here: it reads "https:///nohost" as the host "nohost".
  const LABEL = '[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]*[\\p{L}\\p{N}])?';
  const REAL_WEB = new RegExp(`^https?://(?:[^\\s/?#@]+@)?(?:\\[[0-9A-Fa-f:.]+\\]|${LABEL}(?:\\.${LABEL})*)(?::[0-9]{1,5})?(?:[/?#]|$)`, 'iu');
  const REAL_MAIL = new RegExp(`^mailto:[^\\s@/?#]+@${LABEL}(?:\\.${LABEL})+(?:\\?|$)`, 'iu');
  const BOLD = /\*\*(?=\S)((?:[^*]|\*(?=\S)[^*]*?\S\*)*?\S)\*\*/g;
  const ITALIC = /\*(?=\S)([^*]*?\S)\*/g;
  const STAR = '\u0000';
  const B_OPEN = '\u0001', B_CLOSE = '\u0002', I_OPEN = '\u0003', I_CLOSE = '\u0004';

  const s0 = (v) => (typeof v === 'string' ? v : '');
  const clean = (s) => String(s).replace(CONTROL, '').replace(XML_BAD, '').replace(/\t/g, ' ');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const normalize = (md) => String(md || '').replace(/\r\n?/g, '\n');
  const unescapeStart = (t) => String(t).replace(/^\\(#{1,6}|[-+])/, '$1').replace(/^([0-9]{1,9})\\([.)])/, '$1$2');

  /* ── Tokens and curly quotes ─────────────── */
  // A run of text is a list of tokens: { text }, { open: 'strong'|'em'|'a', href }, { close: true }, { br: true }.
  // A close ends the most recent open tag, as "];" does in Typst, so the XHTML is always well nested.

  /** Text with STAR placeholders → tokens with bold and italic (md2typst emphasis). */
  function emphasis(t, out) {
    const s = t.replace(BOLD, (_, x) => B_OPEN + x + B_CLOSE).replace(ITALIC, (_, x) => I_OPEN + x + I_CLOSE);
    for (const p of s.split(/([\u0001-\u0004])/)) {
      if (p === B_OPEN) out.push({ open: 'strong' });
      else if (p === I_OPEN) out.push({ open: 'em' });
      else if (p === B_CLOSE || p === I_CLOSE) out.push({ close: true });
      else if (p) out.push({ text: clean(p.replace(/\u0000/g, '*')) });
    }
    return out;
  }

  /**
   * A link the EPUB can carry: https:// with a real host or mailto: with a real
   * address, as typed; then percent-encoded, and a URL that parses (EPUBCheck reads it).
   */
  function hrefOf(url) {
    if (!REAL_WEB.test(url) && !REAL_MAIL.test(url)) return null;
    const u = clean(url).replace(/%(?![0-9A-Fa-f]{2})/g, '%25')
      .replace(/[^A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]/gu, (c) => encodeURIComponent(c));
    const hash = u.indexOf('#');
    const fixed = hash < 0 ? u : u.slice(0, hash + 1) + u.slice(hash + 1).replace(/#/g, '%23');
    try {
      const p = new URL(fixed);
      if (/^https?:$/.test(p.protocol) && !p.hostname) return null;
      if (!/^(https?|mailto):$/.test(p.protocol)) return null;
    } catch (e) { return null; }
    return fixed;
  }

  /** One line → tokens (md2typst inline: links, then emphasis). */
  function lineTokens(line, out = []) {
    const s = unescapeStart(String(line).replace(CONTROL, '')).replace(/\\\*/g, STAR);
    let last = 0;
    for (const m of s.matchAll(LINK)) {
      const url = m[2].replace(/\u0000/g, '*');
      if (!SAFE_URL.test(url)) continue;
      const href = hrefOf(url);
      if (!href) continue;   // print links it; with no real host or address it stays plain text in the EPUB
      emphasis(s.slice(last, m.index), out);
      out.push({ open: 'a', href });
      emphasis(m[1], out);
      out.push({ close: true });
      last = m.index + m[0].length;
    }
    return emphasis(s.slice(last), out);
  }

  /** Plain text (a title, the copyright line) → one text token, as md2typst escapeText. */
  const plainTokens = (s) => [{ text: clean(s) }];

  const isNum = (c) => /\p{N}/u.test(c);
  const isAlpha = (c) => /\p{Alphabetic}/u.test(c);
  const isSpace = (c) => /\p{White_Space}/u.test(c);

  /**
   * Curly quotes, as Typst's smart quotes (Typst 0.14, lang en) for one
   * paragraph: an apostrophe after a letter, a prime after a number, close
   * the last open quote of the same kind, else open one. A quote right after
   * an ASCII digit in the same run of text stays straight (md2typst escapes it).
   */
  function smarten(tokens) {
    const stack = [];
    let before = ' ';
    const quote = (dbl) => {
      const top = stack.length ? stack[stack.length - 1] : null;
      if (isNum(before) && top !== dbl) return dbl ? '\u2033' : '\u2032';             // double / single prime
      if (!dbl && top !== false && isAlpha(before)) return '\u2019';                   // apostrophe
      if (top === dbl && !isSpace(before) && !'([{'.includes(before)) { stack.pop(); return dbl ? '\u201D' : '\u2019'; }
      if (stack.length < 32) stack.push(dbl);
      return dbl ? '\u201C' : '\u2018';
    };
    for (const t of tokens) {
      if (t.br) { before = '\n'; continue; }
      if (t.text == null) continue;
      const cs = Array.from(t.text);
      let out = '';
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        let o = c;
        if ((c === '"' || c === "'") && !(i > 0 && /[0-9]/.test(cs[i - 1]))) o = quote(c === '"');
        out += o;
        before = o;
      }
      t.text = out;
    }
    return tokens;
  }

  /** Tokens → XHTML (after smarten). */
  function html(tokens) {
    const stack = [];
    let out = '';
    for (const t of tokens) {
      if (t.text != null) out += esc(t.text);
      else if (t.br) out += '<br/>';
      else if (t.open) { stack.push(t.open); out += t.open === 'a' ? `<a href="${attr(t.href)}">` : `<${t.open}>`; }
      else if (t.close && stack.length) out += `</${stack.pop()}>`;
    }
    while (stack.length) out += `</${stack.pop()}>`;
    return out;
  }

  /** Tokens → the visible text (after smarten): labels in nav, NCX and the contents. */
  const plainOf = (tokens) => tokens.map((t) => (t.text != null ? t.text : t.br ? ' ' : '')).join('');

  const htmlText = (s) => html(smarten(plainTokens(s)));
  const plainText = (s) => plainOf(smarten(plainTokens(s)));

  /** One line → XHTML. */
  const inline = (line) => html(smarten(lineTokens(line)));

  /* ── Blocks ──────────────────────────────── */

  /**
   * Markdown → blocks, the md2typst blockList rules. A heading inside the text
   * is h3 or lower (h1 = chapter, h2 = section). Kindle: "headings nested
   * properly". top: the heading level above this text, 2 after a section
   * title, 1 when no section title came yet in the chapter. Under top 1 every
   * heading in the text moves up one level (h3 → h2, h4 → h3), so it never
   * jumps from h1 to h3. A heading block carries rank, the h number it got.
   */
  function blockList(md, top = 2) {
    const lines = normalize(md).split('\n');
    const out = [];
    let para = [];
    let list = null;
    let quote = null;
    const shift = top <= 1 ? 1 : 0;

    const flushPara = () => {
      if (!para.length) return;
      const toks = [];
      para.forEach((l, i) => { if (i) toks.push({ br: true }); lineTokens(l, toks); });
      out.push({ type: 'p', html: html(smarten(toks)) });
      para = [];
    };
    const flushList = () => {
      if (!list) return;
      const items = list.items.map((it) => ({ n: it.n, html: inline(it.text) }));
      let body = '';
      let next = list.type === 'ol' ? items[0].n : null;
      for (const it of items) {
        const value = list.type === 'ol' && it.n !== next ? ` value="${it.n}"` : '';
        body += `<li${value}>${it.html}</li>`;
        if (next != null) next = it.n + 1;
      }
      const start = list.type === 'ol' && items[0].n !== 1 ? ` start="${items[0].n}"` : '';
      out.push({ type: 'list', ordered: list.type === 'ol', items, html: `<${list.type}${start}>${body}</${list.type}>` });
      list = null;
    };
    const flushQuote = () => {
      if (!quote) return;
      const inner = blockList(quote.join('\n'), top);
      out.push({ type: 'quote', blocks: inner, html: `<blockquote>${render(inner)}</blockquote>` });
      quote = null;
    };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (const line of lines) {
      let m;
      if (!line.trim()) { flushAll(); continue; }
      if ((m = QUOTE.exec(line))) { flushPara(); flushList(); (quote = quote || []).push(m[1]); continue; }
      flushQuote();
      if ((m = HEADING.exec(line))) {
        flushPara(); flushList();
        if (m[2].trim()) {
          const level = m[1].length;
          const rank = Math.min(6, Math.max(3, level)) - shift;
          out.push({ type: 'h', level, rank, html: `<h${rank}>${inline(m[2].trim())}</h${rank}>` });
        }
        continue;
      }
      if ((m = BULLET.exec(line))) {
        flushPara();
        if (list && list.type !== 'ul') flushList();
        (list = list || { type: 'ul', items: [] }).items.push({ text: m[1] });
        continue;
      }
      if ((m = NUMBERED.exec(line))) {
        flushPara();
        if (list && list.type !== 'ol') flushList();
        (list = list || { type: 'ol', items: [] }).items.push({ n: Number(m[1]), text: m[2] });
        continue;
      }
      flushList();
      para.push(line.trim());
    }
    flushAll();
    return out;
  }

  /**
   * Blocks → XHTML. As print (Typst indents only a paragraph that follows a
   * paragraph): a paragraph after a heading, a list, a quote or at the start
   * gets class "first" (no indent). prev: the block type before the first one.
   */
  function render(blocks, prev = null) {
    let out = '';
    let p = prev;
    for (const b of blocks) {
      if (b.type !== 'p') out += `${b.html}\n`;
      else out += p === 'p' ? `<p>${b.html}</p>\n` : `<p class="first">${b.html}</p>\n`;
      p = b.type;
    }
    return out;
  }

  /* ── The book ────────────────────────────── */

  const T = () => root.kdpFormatTypst;
  const F = () => root.kdpFormatRules;
  const R = () => root.kdpExportRules;
  const X = () => root.kdpExportBuild;

  /** Paragraphs of a plain text (the bio): blank lines split them, a newline is a line break (md2typst plainParas). */
  const plainParas = (t) => normalize(t).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => {
      const toks = [];
      p.split('\n').forEach((l, i) => { if (i) toks.push({ br: true }); toks.push(...plainTokens(l.trim())); });
      return html(smarten(toks));
    });

  const XHTML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">';
  const page = (title, body) => `${XHTML_HEAD}
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}</body>
</html>
`;

  /** style.css for a text style. Body text keeps every Kindle default (no font, size, line height or color). */
  function css(style, { centered = false } = {}) {
    const head = style === 'modern' ? 'sans-serif' : 'serif';
    return [
      `/* NicheInk EPUB, ${ENGINE_ID}, style ${style} */`,
      'body { margin: 0; padding: 0; }',
      'p { margin-top: 0; margin-bottom: 0; text-indent: 1.2em; }',
      'p.first { text-indent: 0; }',
      `h1, h2, h3, h4, h5, h6 { font-family: ${head}; font-weight: bold; text-indent: 0; }`,
      'h1 { font-size: 1.7em; text-align: center; margin: 2.5em 0 1.2em 0; }',
      `p.chapter-label { font-family: ${head}; font-size: 0.82em; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; text-indent: 0; margin: 2.5em 0 0.4em 0; }`,
      'h1.after-label { margin-top: 0; }',
      'h2 { font-size: 1.16em; text-align: left; margin: 1.6em 0 0.8em 0; }',
      'h3 { font-size: 1.04em; font-style: italic; text-align: left; margin: 1.3em 0 0.7em 0; }',
      'h4, h5, h6 { font-size: 1em; text-align: left; margin: 1.2em 0 0.6em 0; }',
      'blockquote { margin: 0.3em 5% 0.3em 5%; }',
      'ul, ol { margin: 0.9em 0 0.9em 0; padding-left: 6%; }',
      'h1.book-title { font-size: 2em; margin: 3em 0 0 0; }',
      'p.subtitle { font-size: 1.1em; font-style: italic; text-align: center; text-indent: 0; margin-top: 1em; }',
      `p.author { font-family: ${head}; font-size: 1.1em; text-align: center; text-indent: 0; margin-top: 4em; }`,
      'p.copyright { font-size: 0.8em; text-align: left; text-indent: 0; margin-top: 3em; }',
      'p.toc-1 { text-align: left; text-indent: 0; margin-top: 0.6em; }',
      'p.toc-2 { font-size: 0.92em; text-align: left; text-indent: 0; margin-top: 0.3em; margin-left: 5%; }',
      'p.bio { text-indent: 0; margin-top: 0.75em; }',
      'p.also-by { text-align: center; text-indent: 0; margin-top: 1.1em; }',
      'span.also-sub { font-size: 0.85em; }',
      // E17: dedication and epigraph pages, only when one of them is in the file (old books keep the same style.css).
      ...(centered ? ['section.centered { text-align: center; margin-top: 30%; }', 'section.centered p { text-indent: 0; margin-top: 0.75em; }'] : []),
      ''
    ].join('\n');
  }

  /* ── SHA-256 and the identifier ──────────── */

  const PRIMES = (() => { const p = []; for (let n = 2; p.length < 64; n++) if (p.every((q) => n % q)) p.push(n); return p; })();
  const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  const K256 = PRIMES.map((p) => frac(Math.cbrt(p)));
  const H256 = PRIMES.slice(0, 8).map((p) => frac(Math.sqrt(p)));
  const ror = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(bytes) {
    const l = bytes.length;
    const n = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(n);
    m.set(bytes);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    dv.setUint32(n - 4, (l * 8) >>> 0);
    const h = H256.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < n; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        w[i] = (w[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) >>> 0;
      }
      let [a, b, c, d, e, f, g, k] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (k + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      [a, b, c, d, e, f, g, k].forEach((x, i) => { h[i] = (h[i] + x) >>> 0; });
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    h.forEach((x, i) => ov.setUint32(i * 4, x));
    return out;
  }

  /** A stable urn:uuid for the book (RFC 9562 version 8, from SHA-256). The raw book id never goes in the file. */
  function uuid(bookId) {
    const b = sha256(new TextEncoder().encode(`nicheink:epub:${s0(bookId)}`)).slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x80;
    b[8] = (b[8] & 0x3f) | 0x80;
    const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return `urn:uuid:${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }

  /** dcterms:modified: CCYY-MM-DDThh:mm:ssZ (UTC, no fraction). */
  function modifiedOf(now) {
    const d = new Date(now == null ? Date.now() : now);
    if (isNaN(d.getTime())) throw new Error('epub: bad date');
    return d.toISOString().replace(/\.[0-9]{3}Z$/, 'Z');
  }

  /* ── Build ───────────────────────────────── */

  function build(model, settings, extras = {}) {
    const st = F().normalize(settings);
    const b = model.book || {};
    if (!model.chapters || !model.chapters.length) throw new Error('epub: nothing to build');
    const title = s0(b.title).trim() || 'Untitled book';
    const subtitle = s0(b.subtitle).trim();
    const pen = s0(b.pen_name).trim();
    const parts = st.parts;
    // E17: with model.bookParts (0035), About and Also by come from the parts (Also by: titles only, Q-10);
    // without it, the old path (until 0036).
    const bp = model.bookParts;
    const part = (kind) => (bp ? bp.find((x) => x.kind === kind) : null);
    const bio = bp ? [] : parts.about ? plainParas(b.bio) : [];
    const alsoBy = bp ? (part('also_by') ? part('also_by').entries : []) : parts.also_by ? (extras.alsoBy || []).filter((x) => s0(x.title).trim()) : [];
    const identifier = uuid(extras.bookId);
    const modified = modifiedOf(extras.now);
    const year = extras.year || new Date(modified).getUTCFullYear();

    const docs = [];   // { id, href, title, text }
    const nav = [];

    // Title page (always on in 08).
    docs.push({ id: 'title-page', href: 'title.xhtml', title: plainText(title), body: `<section epub:type="titlepage">
<h1 class="book-title">${htmlText(title)}</h1>
${subtitle ? `<p class="subtitle">${htmlText(subtitle)}</p>\n` : ''}${pen ? `<p class="author">${htmlText(pen)}</p>\n` : ''}</section>
` });
    // Copyright (always on), the same text as print. Never an ISBN (Q2).
    docs.push({ id: 'copyright', href: 'copyright.xhtml', title: 'Copyright', body: `<section epub:type="copyright-page">
<p class="copyright">${htmlText(R().copyright(pen, year))}</p>
</section>
` });
    // E17: one document per part, from the part's Markdown (as a section's text).
    //   type   the epub:type, or null; title  the h1, or null (dedication, epigraph)
    //   toc    true: in nav, NCX and the contents (Q-5: foreword, preface, acknowledgments, about)
    const partDoc = (kind, href, type, { title = null, toc = false, centered = false } = {}) => {
      const p = part(kind);
      if (!p) return;
      let body = `<section${type ? ` epub:type="${type}"` : ''}${centered ? ' class="centered"' : ''}>\n`;
      if (title) body += `<h1>${htmlText(title)}</h1>\n`;
      body += render(blockList(X().mdBody(p.content), 1), title ? 'h' : null);
      body += '</section>\n';
      docs.push({ id: href.replace('.xhtml', ''), href, title: title || R().PART_TITLES[kind] || kind[0].toUpperCase() + kind.slice(1), body });
      if (toc) nav.push({ label: title, href, children: [] });
    };
    partDoc('dedication', 'dedication.xhtml', 'dedication', { centered: true });
    partDoc('epigraph', 'epigraph.xhtml', 'epigraph', { centered: true });
    // Contents: always on in the EPUB (KDP needs it). Filled below.
    const contents = { id: 'contents', href: 'contents.xhtml', title: 'Contents', body: '' };
    docs.push(contents);
    partDoc('foreword', 'foreword.xhtml', 'foreword', { title: 'Foreword', toc: true });
    partDoc('preface', 'preface.xhtml', 'preface', { title: 'Preface', toc: true });

    model.chapters.forEach((c, i) => {
      const href = `c${String(i + 1).padStart(2, '0')}.xhtml`;
      const t = T().chapterTitle(c);
      const { label, toc } = T().chapterLabel(c, st);
      const type = c.kind === 'intro' ? 'introduction' : c.kind === 'conclusion' ? 'conclusion' : 'chapter';
      const entry = { label: plainText(toc), href, children: [] };
      let body = `<section epub:type="${type}">\n`;
      if (label) body += `<p class="chapter-label">${htmlText(label)}</p>\n`;
      body += `<h1${label ? ' class="after-label"' : ''}>${htmlText(t)}</h1>\n`;
      let prev = 'h';
      let n = 0;         // section titles so far (h2); none yet \u2192 the text sits right under the h1
      for (const s of c.sections) {
        if (s.title) {
          const id = `s${++n}`;
          const toks = smarten(lineTokens(s.title));
          body += `<h2 id="${id}">${html(toks)}</h2>\n`;
          if (st.contents_sections) entry.children.push({ label: plainOf(toks), href: `${href}#${id}` });
          prev = 'h';
        }
        const blocks = blockList(X().mdBody(s.content), n ? 2 : 1);
        body += render(blocks, prev);
        if (blocks.length) prev = blocks[blocks.length - 1].type;
      }
      body += '</section>\n';
      docs.push({ id: href.replace('.xhtml', ''), href, title: plainText(t), body });
      nav.push(entry);
    });

    partDoc('acknowledgments', 'acknowledgments.xhtml', 'acknowledgments', { title: 'Acknowledgments', toc: true });
    partDoc('about_author', 'about.xhtml', null, { title: 'About the author', toc: true });
    if (part('review_request')) {
      const W = R().REVIEW;
      docs.push({ id: 'review', href: 'review.xhtml', title: W.title, body: `<section>
<h1>${htmlText(W.title)}</h1>
<p class="bio">${htmlText(W.thanks)} <em>${htmlText(title)}</em>.</p>
<p class="bio">${htmlText(W.body)}</p>
${pen ? `<p class="bio">${htmlText(pen)}</p>\n` : ''}</section>
` });
      // Not in the contents (Q-5). p.bio: no indent, 0.75em above (separate paragraphs, design 81; style.css unchanged).
    }
    if (bio.length) {
      docs.push({ id: 'about', href: 'about.xhtml', title: 'About the author', body: `<section>
<h1>About the author</h1>
${bio.map((p) => `<p class="bio">${p}</p>`).join('\n')}
</section>
` });
      nav.push({ label: 'About the author', href: 'about.xhtml', children: [] });
    }
    if (alsoBy.length) {
      const head = pen ? `Also by ${pen}` : 'Also by';
      docs.push({ id: 'also-by', href: 'also-by.xhtml', title: plainText(head), body: `<section>
<h1>${htmlText(head)}</h1>
${alsoBy.map((x) => `<p class="also-by"><em>${htmlText(s0(x.title).trim())}</em>${s0(x.subtitle).trim() ? `<br/><span class="also-sub">${htmlText(s0(x.subtitle).trim())}</span>` : ''}</p>`).join('\n')}
</section>
` });
      // Not in the contents, as print (toc: none).
    }

    // The visible contents: the same entries as nav and NCX. No page numbers.
    const tocLines = [];
    for (const e of nav) {
      tocLines.push(`<p class="toc-1"><a href="${attr(e.href)}">${esc(e.label)}</a></p>`);
      for (const k of e.children) tocLines.push(`<p class="toc-2"><a href="${attr(k.href)}">${esc(k.label)}</a></p>`);
    }
    contents.body = `<section epub:type="toc">
<h1>Contents</h1>
${tocLines.join('\n')}
</section>
`;

    const navOl = (list) => `<ol>\n${list.map((e) => `<li><a href="${attr(e.href)}">${esc(e.label)}</a>${e.children && e.children.length ? `\n${navOl(e.children)}` : ''}</li>`).join('\n')}\n</ol>`;
    const navDoc = `${XHTML_HEAD}
<head>
<meta charset="UTF-8"/>
<title>Contents</title>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Contents</h1>
${navOl(nav)}
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>Guide</h2>
<ol>
<li><a epub:type="toc" href="contents.xhtml">Contents</a></li>
</ol>
</nav>
</body>
</html>
`;

    let order = 0;
    const depth = nav.some((e) => e.children.length) ? 2 : 1;
    const point = (e) => {
      const no = ++order;
      return `<navPoint id="np${no}" playOrder="${no}"><navLabel><text>${esc(e.label)}</text></navLabel><content src="${attr(e.href)}"/>${(e.children || []).map(point).join('')}</navPoint>`;
    };
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
<head>
<meta name="dtb:uid" content="${attr(identifier)}"/>
<meta name="dtb:depth" content="${depth}"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${esc(title)}</text></docTitle>
${pen ? `<docAuthor><text>${esc(pen)}</text></docAuthor>\n` : ''}<navMap>
${nav.map(point).join('\n')}
</navMap>
</ncx>
`;

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${esc(identifier)}</dc:identifier>
<dc:title id="title">${esc(title)}</dc:title>
<meta refines="#title" property="title-type">main</meta>
${subtitle ? `<dc:title id="subtitle">${esc(subtitle)}</dc:title>\n<meta refines="#subtitle" property="title-type">subtitle</meta>\n` : ''}${pen ? `<dc:creator id="creator">${esc(pen)}</dc:creator>\n<meta refines="#creator" property="role" scheme="marc:relators">aut</meta>\n` : ''}<dc:language>en</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${docs.map((d) => `<item id="${d.id}" href="${d.href}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${docs.map((d) => `<itemref idref="${d.id}"/>`).join('\n')}
</spine>
<guide>
<reference type="toc" title="Contents" href="contents.xhtml"/>
</guide>
</package>
`;

    const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

    const files = [
      { name: 'mimetype', text: 'application/epub+zip' },
      { name: 'META-INF/container.xml', text: container },
      { name: 'OEBPS/content.opf', text: opf },
      { name: 'OEBPS/nav.xhtml', text: navDoc },
      { name: 'OEBPS/toc.ncx', text: ncx },
      { name: 'OEBPS/style.css', text: css(st.style, { centered: !!(part('dedication') || part('epigraph')) }) },
      ...docs.map((d) => ({ name: `OEBPS/${d.href}`, text: page(d.title, d.body) }))
    ];
    return {
      files,
      spine: docs.map((d) => ({ id: d.id, href: d.href, title: d.title })),
      nav,
      meta: { title, subtitle: subtitle || null, author: pen || null, identifier, modified }
    };
  }

  /** The zip: mimetype first and stored (kdpCover.zip stores every file). Entry times are the UTC time of `modified`. */
  function zip(built) {
    const d = new Date(built.meta.modified);
    const at = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    const enc = new TextEncoder();
    return root.kdpCover.zip.make(built.files.map((f) => ({ name: f.name, bytes: enc.encode(f.text) })), at);
  }

  const make = (model, settings, extras) => zip(build(model, settings, extras));

  function fileName(title) {
    const slug = s0(title).normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
    return `${slug || 'book'}-ebook.epub`;
  }

  root.kdpEpub = { ENGINE_ID, build, zip, make, fileName, css, blockList, inline, uuid, sha256, smarten, lineTokens };
})(globalThis);
