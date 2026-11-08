/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the book → Typst source (E13.1)
   /js/format/md2typst.js   (used by js/format/engine.js and 08 Format;
                             needs js/markdown-lite.js, js/export-rules.js,
                             js/export-build.js (mdBody) and js/format-rules.js;
                             tested by tests/format-typst.test.js)

   Port of the E13.0 proof converter. Section text is the app's Markdown
   subset (js/markdown-lite.js): paragraphs, headings, "- " and "1. " lists,
   **bold**, *italic*, \* for a literal star, "\- ", "\## ", "1\. " for a line
   that only looks like a marker. A single newline inside a paragraph is a line
   break (as in the DOCX export). Also read: "> " quotes and [text](https://…).

   Safety rule: every character of the writer's text is printed as text.
   Each Typst markup character gets a backslash (Typst prints "\x" as "x").
   We add only our own calls (#strong, #emph, #link, #quote, #linebreak,
   #drop), and each one ends with ";" so the text after it ("." or "(") can
   never continue the call. Quotes stay unescaped, so Typst prints curly
   quotes, except right after a digit, where Typst would print a prime.
   Titles go in as markup (curly quotes) and as Typst strings (the header).

   kdpFormatTypst.escapeText(s)  → Typst markup that prints s as typed
   kdpFormatTypst.str(s)         → a Typst string literal
   kdpFormatTypst.inline(line)   → one line: emphasis, links, escaped text
   kdpFormatTypst.blockList(md)  → [{ type: 'p'|'h'|'list'|'quote', typst }]
   kdpFormatTypst.blocks(md)     → Typst markup for a piece of Markdown
   kdpFormatTypst.chapterLabel(c, settings) → { label, toc } (strings, or null)
   kdpFormatTypst.mainTyp(model, settings, extras) → the main.typ source
     model     kdpExportRules.model(export_json, { include: 'final', parts })
     settings  the book_formats row (kdpFormatRules.normalize)
     extras    { year, trim, alsoBy: [{ title, subtitle }] }
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
  // the result. Bold may also hold one *italic* span ("**a *b* c**").
  const BOLD = /\*\*(?=\S)((?:[^*]|\*(?=\S)[^*]*?\S\*)*?\S)\*\*/g;
  const ITALIC = /\*(?=\S)([^*]*?\S)\*/g;
  // Placeholders. CONTROL removes them from the writer's text first.
  const STAR = '\u0000';
  const B_OPEN = '\u0001', B_CLOSE = '\u0002', I_OPEN = '\u0003', I_CLOSE = '\u0004';
  const MARK = { [B_OPEN]: '#strong[', [I_OPEN]: '#emph[', [B_CLOSE]: '];', [I_CLOSE]: '];' };

  const s0 = (v) => (typeof v === 'string' ? v : '');

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

  /** Text with STAR placeholders → escaped markup with bold and italic. */
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

  /** Markdown → a list of Typst blocks. Blocks are separated by a blank line. */
  function blockList(md) {
    const lines = normalize(md).split('\n');
    const out = [];
    let para = [];
    let list = null;   // { type: 'ul' | 'ol', items: [] }
    let quote = null;  // lines

    const flushPara = () => { if (para.length) out.push({ type: 'p', typst: para.map(inline).join('#linebreak();') }); para = []; };
    const flushList = () => {
      if (!list) return;
      out.push({ type: 'list', typst: list.items.map((it) => (list.type === 'ul' ? `- ${inline(it.text)}` : `${it.n}. ${inline(it.text)}`)).join('\n') });
      list = null;
    };
    const flushQuote = () => {
      if (!quote) return;
      out.push({ type: 'quote', typst: `#quote(block: true)[\n${blocks(quote.join('\n'))}\n];` });
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
        if (m[2].trim()) out.push({ type: 'h', typst: `${'='.repeat(m[1].length)} ${inline(m[2].trim())}` });
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

  /** Markdown → Typst markup. */
  const blocks = (md) => blockList(md).map((b) => b.typst).join('\n\n');

  /* ── The book ─────────────────────────────── */

  const R = () => root.kdpExportRules;
  const X = () => root.kdpExportBuild;
  const F = () => root.kdpFormatRules;
  const markup = (s) => `[${escapeText(s)}]`;
  const optStr = (s) => (s0(s).trim() ? str(s0(s).trim()) : 'none');
  const optMarkup = (s) => (s0(s).trim() ? markup(s0(s).trim()) : 'none');

  /** The chapter's title as printed: its own title, or "Introduction", "Conclusion", "Chapter 3". */
  function chapterTitle(c) {
    if (c.kind === 'intro') return c.title || 'Introduction';
    if (c.kind === 'conclusion') return c.title || 'Conclusion';
    return c.title || `Chapter ${c.fileNumber}`;
  }

  /** Label above the title and the contents line, per the chapter label setting. */
  function chapterLabel(c, settings) {
    const title = chapterTitle(c);
    if (c.kind !== 'chapter' || !c.title) return { label: null, toc: title };
    const n = c.fileNumber;
    if (settings.chapter_label === 'number') return { label: String(n), toc: `${n}. ${title}` };
    if (settings.chapter_label === 'none') return { label: null, toc: title };
    return { label: `Chapter ${n}`, toc: `Chapter ${n}: ${title}` };
  }

  /** Paragraphs of a plain text (bio): blank lines split them, a newline is a line break. */
  const plainParas = (t) => normalize(t).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.split('\n').map((l) => escapeText(l.trim())).join('#linebreak();'));

  function chapterBody(c, settings) {
    const out = [];
    let first = true;
    let dropped = false;
    for (const s of c.sections) {
      if (s.title) out.push(`== ${inline(s.title)}`);
      for (const b of blockList(X().mdBody(s.content))) {
        // The drop cap: the chapter's first block, when it is a paragraph (after the first section title).
        // The paragraph right after it keeps its first-line indent (after-drop).
        if (first && settings.drop_cap && b.type === 'p') { out.push(`#drop[${b.typst}];`); dropped = true; }
        else if (dropped && b.type === 'p') { out.push(`#after-drop[${b.typst}];`); dropped = false; }
        else { out.push(b.typst); dropped = false; }
        first = false;
      }
    }
    return out.join('\n\n');
  }

  function mainTyp(model, settings, extras = {}) {
    const st = F().normalize(settings);
    const b = model.book || {};
    const title = s0(b.title).trim() || 'Untitled book';
    const pen = s0(b.pen_name).trim();
    const trim = F().trimSize(extras.trim || b.trim);
    const parts = st.parts;
    const recto = st.recto_start ? 'true' : 'false';
    const bio = parts.about ? plainParas(b.bio) : [];
    const alsoBy = parts.also_by ? (extras.alsoBy || []).filter((x) => s0(x.title).trim()) : [];
    const out = [
      '#import "/book.typ": book, chapter, drop, after-drop',
      '#show: book.with(',
      `  style: ${str(st.style)},`,
      `  trim: (w: ${trim.w}, h: ${trim.h}),`,
      `  title: ${markup(title)},`,
      `  plain-title: ${str(title)},`,
      `  subtitle: ${optMarkup(b.subtitle)},`,
      `  author: ${pen ? markup(pen) : 'none'}, plain-author: ${pen ? str(pen) : 'none'},`,
      `  copyright: [${escapeText(R().copyright(pen, extras.year || new Date().getFullYear()))}],`,
      `  isbn: ${st.isbn ? str(st.isbn) : 'none'},`,
      `  title-page: ${parts.title}, copyright-page: ${parts.copyright}, contents-page: ${parts.contents},`,
      `  contents-sections: ${st.contents_sections},`,
      `  running-header: ${st.running_header}, header-title: ${optStr(st.header_title)},`,
      `  about: ${bio.length ? `[\n${bio.join('\n\n')}\n]` : 'none'}, about-recto: ${recto},`,
      `  also-by: (${alsoBy.map((x) => `(title: ${markup(s0(x.title).trim())}, subtitle: ${optMarkup(x.subtitle)})`).join(', ')}${alsoBy.length === 1 ? ',' : ''}),`,
      `  also-by-title: ${markup(pen ? `Also by ${pen}` : 'Also by')}, also-by-plain: ${str(pen ? `Also by ${pen}` : 'Also by')},`,
      ')',
    ];
    for (const c of model.chapters) {
      const t = chapterTitle(c);
      const { label, toc } = chapterLabel(c, st);
      out.push('', `#chapter(label: ${label ? str(label) : 'none'}, title: ${markup(t)}, plain: ${str(t)}, toc: ${markup(toc)}, recto: ${recto})[`,
        chapterBody(c, st), ']');
    }
    return `${out.join('\n')}\n`;
  }

  root.kdpFormatTypst = { escapeText, str, inline, blockList, blocks, chapterTitle, chapterLabel, mainTyp };
})(globalThis);
