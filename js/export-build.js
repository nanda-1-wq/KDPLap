/* ═══════════════════════════════════════════════════
   KDP Lab — Export: build the file (design 24b)
   /js/export-build.js   (used by js/export-dialog.js; needs js/markdown-lite.js
                          and js/export-rules.js; tested by tests/export-build.test.js)

   kdpExportBuild.toMarkdown(model, { year })  → the .md text
   kdpExportBuild.toDocx(model, docx, { year }) → a docx Document (docx 9.5.1, global "docx")
     Page size from the Brief (trim, inches × 1440 twips). Equal margins of
     0.75 in: docx 9.5.1 has no mirrored-margins option (owner choice 4).
     Front matter (title page, copyright, contents) is its own section with
     an empty footer: no page numbers. The body section starts on a new page
     and numbers its pages from 1 in a centered footer, from the first chapter
     (the Introduction, or Chapter 1). Every chapter starts on a new page.
     Heading 1 = a chapter ("Chapter 3: Seated twists"; Introduction and
     Conclusion have no number), Heading 2 = a section title, Heading 3 = a
     "## " heading inside the text. Contents: a linked list of the chapters
     (bookmarks + internal links, no page numbers). Georgia 11 pt, 1.15
     lines, a 0.25 in first-line indent (none right after a heading).
   The text is the section's Markdown subset (js/markdown-lite.js) with the
   "[Verify: no source]" marks removed (kdpExportRules.strip).
═══════════════════════════════════════════════════ */

(function (root) {
  const R = () => root.kdpExportRules;
  const MD = () => root.kdpMarkdown;
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const TWIPS = 1440;
  const MARGIN = Math.round(0.75 * TWIPS);

  /** "Chapter 3: Seated twists", "Introduction", "Conclusion". */
  function chapterHeading(c) {
    if (c.kind === 'intro') return c.title || 'Introduction';
    if (c.kind === 'conclusion') return c.title || 'Conclusion';
    return `Chapter ${c.fileNumber}${c.title ? `: ${c.title}` : ''}`;
  }

  const anchorOf = (c, i) => `chapter-${i + 1}`;
  const bioParas = (bio) => String(bio || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  /* ── Markdown ──────────────────────────── */

  /** A section's text: marks removed, its "## " headings one level down. */
  function mdBody(md) {
    return MD().normalize(R().strip(md)).split('\n').map((l) => (/^#{1,5}[ \t]/.test(l) ? `#${l}` : l)).join('\n');
  }

  function toMarkdown(m, { year }) {
    const b = m.book || {};
    const out = [];
    if (m.parts.title) {
      out.push(`# ${str(b.title) || 'Untitled book'}`);
      if (str(b.subtitle)) out.push(`*${str(b.subtitle)}*`);
      if (str(b.pen_name)) out.push(`by ${str(b.pen_name)}`);
    }
    if (m.parts.copyright) out.push(R().copyright(b.pen_name, year));
    if (m.parts.contents) {
      out.push('# Contents');
      const items = m.chapters.map(chapterHeading);
      if (m.parts.about && bioParas(b.bio).length) items.push('About the author');
      out.push(items.map((t) => `- ${t}`).join('\n'));
    }
    for (const c of m.chapters) {
      out.push(`# ${chapterHeading(c)}`);
      for (const s of c.sections) {
        if (s.title) out.push(`## ${s.title}`);
        const body = mdBody(s.content);
        if (body) out.push(body);
      }
    }
    if (m.parts.about) {
      const paras = bioParas(b.bio);
      if (paras.length) out.push('# About the author', ...paras);
    }
    return `${out.join('\n\n')}\n`;
  }

  /* ── DOCX ──────────────────────────────── */

  /** "\- ", "\## ", "1\. " at a line start → the plain marker (as markdown-lite). */
  const unescapeStart = (t) => String(t).replace(/^\\(#{1,6}|[-+])/, '$1').replace(/^([0-9]{1,9})\\([.)])/, '$1$2');

  /**
   * Inline Markdown → runs: { text, bold, italics }. **bold**, *italic* (also
   * inside bold), and \* for a literal star. Same patterns as markdown-lite.
   */
  function inlineRuns(text) {
    const STAR = '\u0000';
    const s = unescapeStart(text).replace(/\\\*/g, STAR);
    const out = [];
    const put = (t, bold, italics) => { if (t) out.push({ text: t.replace(/\u0000/g, '*'), bold, italics }); };
    const italic = (t, bold) => {
      let last = 0;
      for (const m of t.matchAll(/\*(?=\S)([^*]*?\S)\*/g)) {
        put(t.slice(last, m.index), bold, false);
        put(m[1], bold, true);
        last = m.index + m[0].length;
      }
      put(t.slice(last), bold, false);
    };
    let last = 0;
    for (const m of s.matchAll(/\*\*(?=\S)([^*]*?\S)\*\*/g)) {
      italic(s.slice(last, m.index), false);
      italic(m[1], true);
      last = m.index + m[0].length;
    }
    italic(s.slice(last), false);
    return out;
  }

  function toDocx(m, docx, { year }) {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber, InternalHyperlink, Bookmark, LevelFormat, SectionType } = docx;
    const b = m.book || {};
    const [w, h] = String(b.trim || '6x9').split('x').map(Number);
    const page = { size: { width: Math.round((w || 6) * TWIPS), height: Math.round((h || 9) * TWIPS) },
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 576, footer: 576, gutter: 0 } };

    const runs = (text) => inlineRuns(text).map((r) => new TextRun({ text: r.text, bold: r.bold || undefined, italics: r.italics || undefined }));
    let listNo = 0;

    /** One section's text → paragraphs. */
    function body(md) {
      const out = [];
      let first = true;   // the first paragraph after a heading has no indent
      for (const blk of MD().parse(R().strip(md))) {
        if (blk.type === 'h2') {
          out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: runs(blk.lines[0]) }));
          first = true;
        } else if (blk.type === 'p') {
          const children = [];
          blk.lines.forEach((line, i) => {
            if (i > 0) children.push(new TextRun({ break: 1 }));   // a line break inside the paragraph
            children.push(...runs(line));
          });
          out.push(new Paragraph({ style: first ? 'BodyFirst' : 'Body', children }));
          first = false;
        } else {
          const ref = blk.type === 'ol' ? 'numbers' : 'bullets';
          const instance = ++listNo;
          for (const item of blk.items) out.push(new Paragraph({ style: 'ListItem', numbering: { reference: ref, level: 0, instance }, children: runs(item) }));
          first = true;
        }
      }
      return out;
    }

    // Front matter: its own section, an empty footer, no page numbers.
    const front = [];
    const newPage = () => front.length > 0;
    if (m.parts.title) {
      front.push(new Paragraph({ style: 'TitlePageSpace', children: [] }));
      front.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(str(b.title) || 'Untitled book')] }));
      if (str(b.subtitle)) front.push(new Paragraph({ style: 'Subtitle', children: [new TextRun(str(b.subtitle))] }));
      if (str(b.pen_name)) front.push(new Paragraph({ style: 'Byline', children: [new TextRun(str(b.pen_name))] }));
    }
    if (m.parts.copyright) {
      front.push(new Paragraph({ style: 'Copyright', pageBreakBefore: newPage(), children: [new TextRun(R().copyright(b.pen_name, year))] }));
    }
    const aboutParas = m.parts.about ? bioParas(b.bio) : [];
    if (m.parts.contents) {
      front.push(new Paragraph({ style: 'ContentsHeading', pageBreakBefore: newPage(), children: [new TextRun('Contents')] }));
      m.chapters.forEach((c, i) => front.push(new Paragraph({ style: 'ContentsItem', children: [
        new InternalHyperlink({ anchor: anchorOf(c, i), children: [new TextRun({ text: chapterHeading(c), style: 'Hyperlink' })] })] })));
      if (aboutParas.length) front.push(new Paragraph({ style: 'ContentsItem', children: [
        new InternalHyperlink({ anchor: 'about-the-author', children: [new TextRun({ text: 'About the author', style: 'Hyperlink' })] })] }));
    }

    // The book: page numbers from 1, centered in the footer.
    const main = [];
    m.chapters.forEach((c, i) => {
      main.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: i > 0, keepNext: true,
        children: [new Bookmark({ id: anchorOf(c, i), children: [new TextRun(chapterHeading(c))] })] }));
      for (const s of c.sections) {
        if (s.title) main.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: runs(s.title) }));
        main.push(...body(s.content));
      }
    });
    if (aboutParas.length) {
      main.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: main.length > 0, keepNext: true,
        children: [new Bookmark({ id: 'about-the-author', children: [new TextRun('About the author')] })] }));
      aboutParas.forEach((p, i) => main.push(new Paragraph({ style: i ? 'Body' : 'BodyFirst', children: [new TextRun(p)] })));
    }

    const numberFooter = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, style: 'PageNo', children: [new TextRun({ children: [PageNumber.CURRENT] })] })] });
    const sections = [];
    if (front.length) sections.push({ properties: { page }, footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }) }, children: front });
    sections.push({
      properties: { type: SectionType.NEXT_PAGE, page: { ...page, pageNumbers: { start: 1 } } },
      footers: { default: numberFooter },
      children: main.length ? main : [new Paragraph({ children: [] })]
    });

    const SERIF = 'Georgia';
    // Title and Heading 1 to 3 are Word's built-in styles: override the library's
    // defaults (blue, not bold, Title not centered) here, never add them a second
    // time in paragraphStyles, so every style id appears once in styles.xml.
    // Georgia, black (auto), bold, single line spacing so 2-line titles don't crowd.
    const heading = (size, spacing, extra = {}) => ({
      run: { font: SERIF, size, bold: true, color: 'auto' },
      paragraph: { spacing: { line: 240, lineRule: 'auto', ...spacing }, keepNext: true, ...extra }
    });
    return new Document({
      creator: str(b.pen_name) || 'KDP Lab',
      title: str(b.title) || 'Untitled book',
      styles: {
        default: {
          document: { run: { font: SERIF, size: 22 }, paragraph: { spacing: { line: 276, before: 0, after: 0 } } },
          title: { next: 'Subtitle', ...heading(48, { after: 240 }, { alignment: AlignmentType.CENTER }) },
          heading1: { next: 'BodyFirst', ...heading(32, { before: 0, after: 360 }) },
          heading2: { next: 'BodyFirst', ...heading(26, { before: 360, after: 120 }) },
          heading3: { next: 'BodyFirst', ...heading(23, { before: 240, after: 80 }) },
          // Not used by the book, but the library gives them its blues: black (auto) too.
          heading4: { run: { font: SERIF, color: 'auto', bold: true } },
          heading5: { run: { font: SERIF, color: 'auto', bold: true } },
          heading6: { run: { font: SERIF, color: 'auto', bold: true } }
        },
        paragraphStyles: [
          { id: 'Body', name: 'Body Text', basedOn: 'Normal', quickFormat: true, paragraph: { indent: { firstLine: 360 }, spacing: { line: 276 } } },
          { id: 'BodyFirst', name: 'Body Text First', basedOn: 'Normal', quickFormat: true, paragraph: { spacing: { line: 276 } } },
          { id: 'ListItem', name: 'List Item', basedOn: 'Normal', paragraph: { spacing: { line: 276, after: 60 } } },
          { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', run: { font: SERIF, size: 28, italics: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 480 } } },
          { id: 'Byline', name: 'Byline', basedOn: 'Normal', run: { size: 26 }, paragraph: { alignment: AlignmentType.CENTER } },
          { id: 'TitlePageSpace', name: 'Title Page Space', basedOn: 'Normal', paragraph: { spacing: { before: 2880 } } },
          { id: 'Copyright', name: 'Copyright', basedOn: 'Normal', run: { size: 18 }, paragraph: { spacing: { line: 276 } } },
          { id: 'ContentsHeading', name: 'Contents Heading', basedOn: 'Normal', run: { size: 32, bold: true }, paragraph: { spacing: { after: 360 } } },
          { id: 'ContentsItem', name: 'Contents Item', basedOn: 'Normal', paragraph: { spacing: { after: 120 } } },
          { id: 'PageNo', name: 'Page Number', basedOn: 'Normal', run: { size: 18 } }
        ]
      },
      numbering: {
        config: [
          { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
          { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
        ]
      },
      sections
    });
  }

  root.kdpExportBuild = { toMarkdown, toDocx, inlineRuns, chapterHeading, mdBody };
})(globalThis);
