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
   kdpMarkdown.fromDomMap(node) → { md, mdOffset(node, offset), domPoint(off, side) }
                                 (E10.3, the Improve menu): the same Markdown as
                                 fromDom, and the way between a DOM selection
                                 and Markdown offsets, both directions.
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

  /* ── DOM → Markdown with a map (E10.3) ─────
     The same walk as fromDom, on "mapped strings": every Markdown character
     keeps where it came from. A position is a count of characters in the
     DOM's text, in document order (a flag pill counts as 1). Characters we
     add (markers, line breaks, escapes) come from nowhere (-1); the flag's
     characters all come from its pill. fromDomMap(root).md === fromDom(root)
     (tests/markdown-lite.test.js and the browser suite check it). */

  const NOWHERE = -1;
  const mstr = (s, o) => ({ s, o });
  const lit = (s) => mstr(s, new Array(s.length).fill(NOWHERE));
  function cat(parts) {
    const o = [];
    for (const p of parts) for (let i = 0; i < p.o.length; i++) o.push(p.o[i]);
    return mstr(parts.map((p) => p.s).join(''), o);
  }
  const mslice = (x, a, b) => mstr(x.s.slice(a, b), x.o.slice(a, b));
  /** Like String.replace with a global regex; fn(match as a mapped string, match) gives the new part. */
  function mreplace(x, re, fn) {
    const parts = [];
    let last = 0;
    for (const m of x.s.matchAll(re)) {
      parts.push(mslice(x, last, m.index));
      parts.push(fn(mslice(x, m.index, m.index + m[0].length), m));
      last = m.index + m[0].length;
    }
    if (!last) return x;
    parts.push(mslice(x, last));
    return cat(parts);
  }
  /** One character for a run, from the run's first character. */
  const one = (ch) => (m) => mstr(ch, [m.o.length ? m.o[0] : NOWHERE]);
  function msplit(x, sep) {
    const out = [];
    let at = 0;
    for (;;) {
      const i = x.s.indexOf(sep, at);
      if (i < 0) { out.push(mslice(x, at)); return out; }
      out.push(mslice(x, at, i));
      at = i + sep.length;
    }
  }
  const mjoin = (xs, sep) => cat(xs.flatMap((x, i) => (i ? [lit(sep), x] : [x])));
  const mtrim = (x) => {
    const a = x.s.length - x.s.trimStart().length;
    const b = x.s.trimEnd().length;
    return a >= b ? lit('') : mslice(x, a, b);
  };

  function fromDomMap(rootNode) {
    // Positions: each node's start and end in the DOM's text (document order).
    const span = new Map();
    const pills = new Set();
    let pos = 0;
    (function visit(n) {
      const start = pos;
      if (isText(n)) pos += String(n.nodeValue).length;
      else if (isEl(n) && typeof n.getAttribute === 'function' && n.getAttribute('data-flag')) { pills.add(n); pos += 1; }
      else kids(n).forEach(visit);
      span.set(n, { start, end: pos });
    })(rootNode);

    const textM = (n) => {
      const v = String(n.nodeValue);
      const s = span.get(n).start;
      let x = mstr(v, Array.from(v, (_c, i) => s + i));
      x = mreplace(x, / /g, (m) => mstr(' ', m.o));
      x = mreplace(x, /[\r\n\t]+/g, one(' '));
      return mreplace(x, /\*/g, (m) => mstr('\\*', [m.o[0], m.o[0]]));
    };
    function wrapM(inner, mark) {
      const m = inner.s.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!m[2]) return inner;
      const a = m[1].length, b = a + m[2].length;
      return cat([mslice(inner, 0, a), lit(mark), mslice(inner, a, b), lit(mark), mslice(inner, b)]);
    }
    function inlineM(node, bold, italic) {
      if (isText(node)) return textM(node);
      if (!isEl(node)) return lit('');
      if (pills.has(node)) return mstr(FLAG, new Array(FLAG.length).fill(span.get(node).start));
      const tag = node.nodeName.toUpperCase();
      if (DROP.has(tag)) return lit('');
      if (tag === 'BR') return lit('\n');
      const isBold = tag === 'STRONG' || tag === 'B';
      const isItalic = tag === 'EM' || tag === 'I';
      const inner = cat(kids(node).map((k) => inlineM(k, bold || isBold, italic || isItalic)));
      if (isBold && !bold) return mjoin(msplit(inner, '\n').map((l) => wrapM(l, '**')), '\n');
      if (isItalic && !italic) return mjoin(msplit(inner, '\n').map((l) => wrapM(l, '*')), '\n');
      return inner;
    }
    const linesM = (x) => msplit(x, '\n').map((l) => mtrim(mreplace(l, /\s+/g, one(' ')))).filter((l) => l.s);
    const safeM = (l) => {
      let m = l.s.match(/^(#{1,6}|[-+])(?=[ \t])/);
      if (m) return cat([lit('\\'), l]);
      m = l.s.match(/^([0-9]{1,9})([.)])(?=[ \t])/);
      if (m) return cat([mslice(l, 0, m[1].length), lit('\\'), mslice(l, m[1].length)]);
      return l;
    };
    function listItemsM(list, items) {
      for (const li of kids(list)) {
        if (!isEl(li)) {
          const t = isText(li) ? mjoin(linesM(textM(li)), ' ') : lit('');
          if (t.s) items.push(t);
          continue;
        }
        const tag = li.nodeName.toUpperCase();
        if (tag === 'UL' || tag === 'OL') { listItemsM(li, items); continue; }
        const own = kids(li).filter((k) => !(isEl(k) && /^(UL|OL)$/.test(k.nodeName.toUpperCase())));
        const t = mjoin(linesM(cat(own.map((k) => inlineM(k, false, false)))), ' ');
        if (t.s) items.push(t);
        for (const k of kids(li)) if (isEl(k) && /^(UL|OL)$/.test(k.nodeName.toUpperCase())) listItemsM(k, items);
      }
    }
    function blocksM(node, out) {
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const text = cat(run.map((n) => inlineM(n, false, false)));
        run = [];
        const ls = linesM(text);
        if (ls.length) out.push(mjoin(ls.map(safeM), '\n'));
      };
      for (const k of kids(node)) {
        const tag = isEl(k) ? k.nodeName.toUpperCase() : '';
        if (DROP.has(tag)) continue;
        if (!BLOCK.has(tag)) { run.push(k); continue; }
        flush();
        if (/^H[1-6]$/.test(tag)) {
          const t = mjoin(linesM(inlineM(k, false, false)), ' ');
          if (t.s) out.push(cat([lit('## '), t]));
        } else if (tag === 'UL' || tag === 'OL') {
          const items = [];
          listItemsM(k, items);
          let n = 0;
          if (items.length) out.push(mjoin(items.map((t) => cat([lit(tag === 'OL' ? `${++n}. ` : '- '), t])), '\n'));
        } else {
          blocksM(k, out);
        }
      }
      flush();
    }
    const out = [];
    blocksM(rootNode, out);
    // normalize(), step by step.
    let x = mjoin(out, '\n\n');
    x = mreplace(x, /\r\n?/g, one('\n'));
    x = mreplace(x, / /g, (m) => mstr(' ', m.o));
    x = mreplace(x, /[ \t]+$/gm, () => lit(''));
    x = mreplace(x, /\n{3,}/g, (m) => mstr('\n\n', m.o.slice(0, 2)));
    x = mtrim(x);
    const md = x.s, o = x.o;

    /** The DOM position of a boundary (node, offset), as the selection API gives it. */
    function posOf(node, offset) {
      for (let n = node; n && n !== rootNode; n = n.parentNode) {
        if (pills.has(n)) return offset > 0 || n !== node ? span.get(n).end : span.get(n).start;
      }
      const sp = span.get(node);
      if (!sp) return null;
      if (isText(node)) return sp.start + Math.max(0, Math.min(offset, String(node.nodeValue).length));
      const ks = kids(node);
      return offset < ks.length ? span.get(ks[offset]).start : sp.end;
    }
    /** A Markdown offset for a DOM boundary: the first character from there on. */
    function mdOffset(node, offset) {
      const p = posOf(node, offset);
      if (p === null) return null;
      for (let i = 0; i < o.length; i++) if (o[i] !== NOWHERE && o[i] >= p) return i;
      return md.length;
    }
    /** The node and offset that hold DOM position p ('start': the character at p; 'end': just after p - 1). */
    function pointAt(p, side) {
      let found = null;
      (function find(n) {
        if (found) return;
        const sp = span.get(n);
        if (!sp || p < sp.start || p > sp.end) return;
        if (pills.has(n)) {
          const parent = n.parentNode;
          const i = kids(parent).indexOf(n);
          if (side === 'start' && p === sp.start) found = { node: parent, offset: i };
          else if (side === 'end' && p === sp.end) found = { node: parent, offset: i + 1 };
          return;
        }
        if (isText(n)) {
          if (side === 'start' ? p < sp.end : p > sp.start) found = { node: n, offset: p - sp.start };
          return;
        }
        kids(n).forEach(find);
      })(rootNode);
      return found;
    }
    /** The DOM boundary for a Markdown offset. side 'start': before the first mapped character from off on;
        'end': after the last mapped character before off. */
    function domPoint(off, side) {
      if (side === 'end') {
        for (let i = Math.min(off, o.length) - 1; i >= 0; i--) {
          if (o[i] === NOWHERE) continue;
          return pointAt(o[i] + 1, 'end') || pointAt(o[i] + 1, 'start');
        }
        return { node: rootNode, offset: 0 };
      }
      for (let i = Math.max(0, off); i < o.length; i++) {
        if (o[i] === NOWHERE) continue;
        return pointAt(o[i], 'start') || pointAt(o[i], 'end');
      }
      return { node: rootNode, offset: kids(rootNode).length };
    }
    return { md, map: o, mdOffset, domPoint };
  }

  root.kdpMarkdown = { toHtml, fromDom, fromDomMap, toPlain, normalize, parse, escapeHtml, FLAG };
})(globalThis);
