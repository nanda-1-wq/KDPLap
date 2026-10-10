/* ═══════════════════════════════════════════════════
   KDP Lab — Section text format (E10.1)
   /js/markdown-lite.js   (used by js/book-write.js;
                           tested by tests/markdown-lite.test.js)

   A section's writing is stored as a small Markdown subset (owner, E10):
     paragraphs (a blank line between them), "## " headings, "- " bullets,
     "1. " numbered items, **bold** and *italic*. No underline.
   A literal * is stored as \*. A paragraph line that starts like a marker
   ("- ", "## ", "1. ") is stored with the marker escaped ("\- ", "1\. ").

   kdpMarkdown.toHtml(md)      → HTML for the editor. Everything is escaped
                                 first; only our own tags are added.
   kdpMarkdown.fromDom(node)   → Markdown from the editor's DOM. Only an
                                 allowlist is read (p, div, h1..h6, ul, ol, li,
                                 strong, b, em, i, br); any other element is
                                 read as its text, script and style are
                                 dropped. So pasted HTML cannot add markup.
   kdpMarkdown.toPlain(md)     → the text without markers (Compare versions).

   The source flag (E10.2): "[Verify: no source]" after a sentence is stored
   in the text. toHtml shows it as a pill (icon and words, not editable) and
   underlines the sentence before it; fromDom reads the pill back as the flag.
   Deleting the pill deletes the flag.
   kdpMarkdown.normalize(md)   → \r\n to \n, no trailing spaces, at most one
                                 blank line between blocks, trimmed.
═══════════════════════════════════════════════════ */

(function (root) {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  const HEADING = /^#{1,6}[ \t]+(.*)$/;
  const BULLET = /^[ \t]*[-+*][ \t]+(.*)$/;
  const NUMBERED = /^[ \t]*[0-9]{1,9}[.)][ \t]+(.*)$/;

  function normalize(md) {
    return String(md || '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Blocks: { type: 'h2' | 'p', lines } or { type: 'ul' | 'ol', items }. */
  function parse(md) {
    const blocks = [];
    let cur = null;
    const close = () => { cur = null; };
    for (const line of normalize(md).split('\n')) {
      if (!line.trim()) { close(); continue; }
      let m;
      if ((m = line.match(HEADING))) {
        close();
        blocks.push({ type: 'h2', lines: [m[1]] });
      } else if ((m = line.match(BULLET)) && !/^\*\*/.test(line.trim())) {
        if (!cur || cur.type !== 'ul') { cur = { type: 'ul', items: [] }; blocks.push(cur); }
        cur.items.push(m[1]);
      } else if ((m = line.match(NUMBERED))) {
        if (!cur || cur.type !== 'ol') { cur = { type: 'ol', items: [] }; blocks.push(cur); }
        cur.items.push(m[1]);
      } else {
        if (!cur || cur.type !== 'p') { cur = { type: 'p', lines: [] }; blocks.push(cur); }
        cur.lines.push(line);
      }
    }
    return blocks;
  }

  /** "\- ", "\## ", "1\. " at the start of a paragraph line → the plain marker text. */
  const unescapeStart = (t) => String(t).replace(/^\\(#{1,6}|[-+])/, '$1').replace(/^([0-9]{1,9})\\([.)])/, '$1$2');

  const FLAG = '[Verify: no source]';
  const FLAG_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>';
  const FLAG_HTML = `<span class="md-flag" contenteditable="false" data-flag="1">${FLAG_ICON}Verify: no source</span>`;

  /**
   * The flag as a pill; the sentence before it underlined. The sentence starts
   * after the last ". ", "! " or "? " before the flag. It is underlined only
   * when it holds no markup of its own, so tags always nest.
   */
  function flags(html) {
    const parts = html.split(FLAG);
    if (parts.length === 1) return html;
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      let seg = parts[i];
      if (i < parts.length - 1) {
        const m = seg.match(/^([\s\S]*[.!?]["”’)]*\s)?([^<>]*?\S)(\s*)$/);
        if (m && !/^\s*$/.test(m[2])) seg = `${m[1] || ''}<span class="md-unsourced">${m[2]}</span>${m[3]}`;
        out += seg + FLAG_HTML;
      } else out += seg;
    }
    return out;
  }

  /** Inline Markdown → HTML. Escapes first; \* stays a literal star. */
  function inline(text) {
    const STAR = '\u0000';
    let s = escapeHtml(unescapeStart(text).replace(/\\\*/g, STAR));
    s = s.replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>');
    return flags(s.replace(/\u0000/g, '*'));
  }

  function toHtml(md) {
    return parse(md).map((b) => {
      if (b.type === 'h2') return `<h2>${inline(b.lines[0])}</h2>`;
      if (b.type === 'p') return `<p>${b.lines.map(inline).join('<br>')}</p>`;
      return `<${b.type}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${b.type}>`;
    }).join('');
  }

  function toPlain(md) {
    return parse(md).map((b) => {
      const strip = (t) => unescapeStart(t).replace(/\\\*/g, '\u0000').replace(/\*/g, '').replace(/\u0000/g, '*');
      if (b.type === 'ul' || b.type === 'ol') return b.items.map(strip).join('\n');
      return b.lines.map(strip).join('\n');
    }).join('\n\n');
  }

  /* ── DOM → Markdown ──────────────────────── */

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'PRE']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS']);
  const isEl = (n) => n && n.nodeType === 1;
  const isText = (n) => n && n.nodeType === 3;
  const kids = (n) => Array.from(n.childNodes || []);

  /** Text as stored: no line breaks, NBSP as a space, a literal * escaped. */
  const textOf = (s) => String(s).replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\*/g, '\\*');

  /** Wraps inner text in a marker, keeping edge spaces outside ("** bold**" is not bold). */
  function wrap(inner, mark) {
    const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2]) return inner;
    return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
  }

  /** One inline run → Markdown. bold / italic: already inside one (no double markers). */
  function inlineMd(node, bold, italic) {
    if (isText(node)) return textOf(node.nodeValue);
    if (!isEl(node)) return '';
    // The source flag pill (E10.2): read back as the flag, whatever is inside it.
    if (typeof node.getAttribute === 'function' && node.getAttribute('data-flag')) return FLAG;
    const tag = node.nodeName.toUpperCase();
    if (DROP.has(tag)) return '';
    if (tag === 'BR') return '\n';
    const isBold = tag === 'STRONG' || tag === 'B';
    const isItalic = tag === 'EM' || tag === 'I';
    const inner = kids(node).map((k) => inlineMd(k, bold || isBold, italic || isItalic)).join('');
    if (isBold && !bold) return inner.split('\n').map((l) => wrap(l, '**')).join('\n');
    if (isItalic && !italic) return inner.split('\n').map((l) => wrap(l, '*')).join('\n');
    return inner;
  }

  /** Inline text of a block: lines trimmed, empty lines dropped. */
  const lines = (s) => s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  /** A paragraph line that would read as a marker gets it escaped: "\- ", "\## ", "1\. ". */
  function safeLine(l) {
    return l.replace(/^(#{1,6}|[-+])(?=[ \t])/, '\\$1').replace(/^([0-9]{1,9})([.)])(?=[ \t])/, '$1\\$2');
  }

  function blocksOf(node, out) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const text = run.map((n) => inlineMd(n, false, false)).join('');
      run = [];
      const ls = lines(text);
      if (ls.length) out.push(ls.map(safeLine).join('\n'));
    };
    for (const k of kids(node)) {
      const tag = isEl(k) ? k.nodeName.toUpperCase() : '';
      if (DROP.has(tag)) continue;
      if (!BLOCK.has(tag)) { run.push(k); continue; }
      flush();
      if (/^H[1-6]$/.test(tag)) {
        const t = lines(inlineMd(k, false, false)).join(' ');
        if (t) out.push(`## ${t}`);
      } else if (tag === 'UL' || tag === 'OL') {
        const items = [];
        listItems(k, items);
        let n = 0;
        if (items.length) out.push(items.map((t) => (tag === 'OL' ? `${++n}. ${t}` : `- ${t}`)).join('\n'));
      } else {
        blocksOf(k, out);
      }
    }
    flush();
  }

  /** List items, nested lists flattened in order. */
  function listItems(list, items) {
    for (const li of kids(list)) {
      if (!isEl(li)) {
        const t = isText(li) ? lines(textOf(li.nodeValue)).join(' ') : '';
        if (t) items.push(t);
        continue;
      }
      const tag = li.nodeName.toUpperCase();
      if (tag === 'UL' || tag === 'OL') { listItems(li, items); continue; }
      const own = kids(li).filter((k) => !(isEl(k) && /^(UL|OL)$/.test(k.nodeName.toUpperCase())));
      const t = lines(own.map((k) => inlineMd(k, false, false)).join('')).join(' ');
      if (t) items.push(t);
      for (const k of kids(li)) if (isEl(k) && /^(UL|OL)$/.test(k.nodeName.toUpperCase())) listItems(k, items);
    }
  }

  function fromDom(node) {
    const out = [];
    blocksOf(node, out);
    return normalize(out.join('\n\n'));
  }

  root.kdpMarkdown = { toHtml, fromDom, toPlain, normalize, parse, escapeHtml, FLAG };
})(globalThis);
