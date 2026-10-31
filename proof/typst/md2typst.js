/* ═══════════════════════════════════════════════════
   NicheInk — E13.0 Typst proof: Markdown → Typst (throwaway, never merged)
   /proof/typst/md2typst.js   (used by bench.js and cases.html;
                               tested by md2typst.test.js)

   The input is the book's Markdown export (js/export-build.js toMarkdown):
     "# Title", "*subtitle*", "by Name", the copyright paragraph,
     "# Contents" and its list, then "# Chapter …" with "## section" and
     "### a heading inside the text", and "# About the author".
   Section text is the app's subset (js/markdown-lite.js): paragraphs,
   headings, "- " and "1. " lists, **bold**, *italic*, \* for a literal star,
   "\- ", "\## ", "1\. " for a line that only looks like a marker. A single
   newline inside a paragraph is a line break (as in the DOCX export).
   Also read here: "> " quotes and [text](https://…) links.

   Safety rule: every character of the writer's text is printed as text.
   Each Typst markup character gets a backslash (Typst prints "\x" as "x").
   We add only our own calls (#strong, #emph, #link, #quote, #linebreak),
   and each one ends with ";" so the text after it ("." or "(") can never
   continue the call. Quotes stay unescaped, so Typst prints curly quotes,
   except right after a digit, where Typst would print a prime.

   kdpTypst.escapeText(s)   → Typst markup that prints s as typed
   kdpTypst.str(s)          → a Typst string literal
   kdpTypst.inline(line)    → one line: emphasis, links, escaped text
   kdpTypst.blocks(md)      → Typst markup for a piece of Markdown
   kdpTypst.parseBook(md)   → { title, subtitle, author, copyright, chapters: [{ title, kind, body }] }
   kdpTypst.toTypst(book)   → the main.typ source (imports /book.typ)
═══════════════════════════════════════════════════ */

(function (root) {
  // Characters Typst reads as markup somewhere in text mode.
  const SPECIAL = /[\\#$*_`<>@\[\]~=\-+\/]/g;
  const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

  const HEADING = /^(#{1,6})[ \t]+(.*)$/;
  const BULLET = /^[ \t]*[-+*][ \t]+(.*)$/;
  const NUMBERED = /^[ \t]*([0-9]{1,9})[.)][ \t]+(.*)$/;
  const QUOTE = /^[ \t]*>[ \t]?(.*)$/;
  const LINK = /\[([^\]\n]+)\]\(([^()\s]+)\)/g;
  const SAFE_URL = /^(https?:\/\/[^\s"\\]+|mailto:[^\s"\\]+)$/i;
  // As the editor (js/markdown-lite.js toHtml): bold first, then italic over
  // the result. Bold may also hold one *italic* span ("**a *b* c**"), which
  // the editor shows with literal stars.
  const BOLD = /\*\*(?=\S)((?:[^*]|\*(?=\S)[^*]*?\S\*)*?\S)\*\*/g;
  const ITALIC = /\*(?=\S)([^*]*?\S)\*/g;
  // Placeholders. CONTROL removes them from the writer's text first.
  const STAR = '\u0000';
  const B_OPEN = '\u0001', B_CLOSE = '\u0002', I_OPEN = '\u0003', I_CLOSE = '\u0004';
  const MARK = { [B_OPEN]: '#strong[', [I_OPEN]: '#emph[', [B_CLOSE]: '];', [I_CLOSE]: '];' };

  /** Plain text → Typst markup that prints it as typed. */
  function escapeText(s) {
    return String(s)
      .replace(CONTROL, '')
      .replace(/\t/g, ' ')
      .replace(SPECIAL, (c) => `\\${c}`)
      // "1." can start a numbered list and "..." becomes an ellipsis.
      .replace(/(?<=[0-9.])\.|\.(?=\.)/g, '\\.')
      // After a digit Typst prints a prime (5' → 5′), which is wrong for "the 1990's".
      .replace(/(?<=[0-9])['"]/g, (c) => `\\${c}`);
  }

  /** A Typst string literal. */
  function str(s) {
    return `"${String(s).replace(CONTROL, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ')}"`;
  }

  /** "\- ", "\## ", "1\. " at a line start → the plain marker (as export-build.js). */
  const unescapeStart = (t) => String(t).replace(/^\\(#{1,6}|[-+])/, '$1').replace(/^([0-9]{1,9})\\([.)])/, '$1$2');

  /**
   * Text with STAR placeholders → escaped markup with bold and italic.
   * Every open mark comes before its own close, so the brackets always pair up.
   */
  function emphasis(t) {
    const s = t.replace(BOLD, (_, x) => B_OPEN + x + B_CLOSE).replace(ITALIC, (_, x) => I_OPEN + x + I_CLOSE);
    return s.split(/([\u0001-\u0004])/).map((p) => MARK[p] || escapeText(p.replace(/\u0000/g, '*'))).join('');
  }

  /** One line of text → Typst markup. */
  function inline(line) {
    const s = unescapeStart(String(line).replace(CONTROL, '')).replace(/\\\*/g, STAR);
    let out = '';
    let last = 0;
    for (const m of s.matchAll(LINK)) {
      const url = m[2].replace(/\u0000/g, '*');
      if (!SAFE_URL.test(url)) continue;   // not a web or mail link: stays plain text
      out += emphasis(s.slice(last, m.index)) + `#link(${str(url)})[${emphasis(m[1])}];`;
      last = m.index + m[0].length;
    }
    return out + emphasis(s.slice(last));
  }

  const normalize = (md) => String(md || '').replace(/\r\n?/g, '\n');

  /** Markdown → Typst markup. Blocks are separated by a blank line. */
  function blocks(md) {
    const lines = normalize(md).split('\n');
    const out = [];
    let para = [];
    let list = null;   // { type: 'ul' | 'ol', items: [] }
    let quote = null;  // lines

    const flushPara = () => { if (para.length) out.push(para.map(inline).join('#linebreak();')); para = []; };
    const flushList = () => {
      if (!list) return;
      out.push(list.items.map((it) => (list.type === 'ul' ? `- ${inline(it.text)}` : `${it.n}. ${inline(it.text)}`)).join('\n'));
      list = null;
    };
    const flushQuote = () => {
      if (!quote) return;
      out.push(`#quote(block: true)[\n${blocks(quote.join('\n'))}\n];`);
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
        if (m[2].trim()) out.push(`${'='.repeat(m[1].length)} ${inline(m[2].trim())}`);
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
    return out.join('\n\n');
  }

  /* ── The book export ─────────────────────── */

  /** Split the export into its parts. The "# Contents" list is dropped: Typst builds its own. */
  function parseBook(md) {
    const lines = normalize(md).split('\n');
    const chunks = [];
    let cur = null;
    for (const line of lines) {
      const m = /^#[ \t]+(.*)$/.exec(line);
      if (m) { cur = { title: m[1].trim(), lines: [] }; chunks.push(cur); continue; }
      if (cur) cur.lines.push(line);
    }
    const book = { title: '', subtitle: '', author: '', copyright: '', chapters: [] };
    let start = 0;
    const paras = (c) => c.lines.join('\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (chunks.length) {
      const first = chunks[0];
      const ps = paras(first);
      const isTitle = (chunks[1] && /^contents$/i.test(chunks[1].title)) || ps.some((p) => /^by\s|^copyright/i.test(p));
      if (isTitle) {
        book.title = first.title;
        const rest = [];
        for (const p of ps) {
          if (!book.subtitle && /^\*[^*].*\*$/s.test(p)) book.subtitle = p.slice(1, -1).trim();
          else if (!book.author && /^by\s+/i.test(p)) book.author = p.replace(/^by\s+/i, '').trim();
          else rest.push(p);
        }
        book.copyright = rest.join('\n\n');
        start = 1;
      }
    }
    for (const c of chunks.slice(start)) {
      if (/^contents$/i.test(c.title)) continue;
      const kind = /^about the author$/i.test(c.title) ? 'about'
        : /^introduction$/i.test(c.title) ? 'intro'
        : /^conclusion$/i.test(c.title) ? 'conclusion' : 'chapter';
      book.chapters.push({ title: c.title, kind, body: c.lines.join('\n').trim() });
    }
    if (!book.title) book.title = 'Untitled book';
    return book;
  }

  /** The book → main.typ. The look lives in /book.typ. */
  function toTypst(book) {
    const opt = (v) => (v ? str(v) : 'none');
    const out = [
      '#import "/book.typ": book, chapter',
      '#show: book.with(',
      `  title: ${str(book.title)},`,
      `  subtitle: ${opt(book.subtitle)},`,
      `  author: ${opt(book.author)},`,
      `  copyright: [\n${blocks(book.copyright)}\n],`,
      ')',
    ];
    for (const c of book.chapters) out.push('', `#chapter(${str(c.title)})[`, blocks(c.body), ']');
    return `${out.join('\n')}\n`;
  }

  root.kdpTypst = { escapeText, str, inline, blocks, parseBook, toTypst };
})(globalThis);
