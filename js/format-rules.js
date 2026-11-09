/* ═══════════════════════════════════════════════════
   NicheInk · 08 Format: the rules (E13.1)
   /js/format-rules.js   (used by js/format/md2typst.js, js/format/engine.js
                          and 08 Format; tested by tests/format-rules.test.js)

   Pure, no DOM. One source of truth for the 08 values the browser needs.
   The database checks the same values (0027): STYLES, CHAPTER_LABELS, the
   defaults and the ISBN rule are kept equal by tests/format-rules.test.js,
   which reads 0027.

   kdpFormatRules.STYLES          → ['classic', 'modern', 'clean', 'warm']
   kdpFormatRules.TRIMS           → group A, the order 08 shows them in
   kdpFormatRules.defaults()      → a book_formats row with the 0027 defaults
   kdpFormatRules.normalize(row)  → a full, valid settings object (missing or wrong values → defaults)
   kdpFormatRules.trimSize(trim)  → { w, h } in inches (group A, else 6 x 9)
   kdpFormatRules.isGroupA(trim)  → Print PDF works only for these
   kdpFormatRules.isbnClean(input) → 13 digits, or null (hyphens and spaces allowed in the input)
   kdpFormatRules.isbnOk(digits)  → as public.isbn_ok
   kdpFormatRules.kdpMargin(pages) → KDP's minimum margins (no bleed) for a page count
   kdpFormatRules.spine(pages, paper) → spine width in inches
   kdpFormatRules.modelOf(data, settings) → kdpExportRules.model, Final sections only
   kdpFormatRules.fileName(title, trim) → "chair-yoga-for-seniors-print-6x9.pdf"

   E13.2 Part 2 (the 08 settings column, design 41):
   kdpFormatRules.PART_ROWS       → the book parts in print order (always on, switches, v2b rows)
   kdpFormatRules.MARGIN          → the template's margins (js/format/book.typ), fixed in v2a
   kdpFormatRules.trimText(trim)  → "6 × 9 in"
   kdpFormatRules.marginNote(pages) → the KDP minimum line under PAGE · PRINT (pages 0: not built yet)

   E13.2 Part 3 (the preview and the Ready box, designs 41, 41c):
   kdpFormatRules.pageInfo(meta)  → { pages, blanks, content } (blanks: added to make the count even)
   kdpFormatRules.spineText(pages, paper) → "Spine 0.108 in · no spine text under 80 pages"
   kdpFormatRules.ready({ model, missing, pages, dropped }) → { warnings, finals } (never blocks)
═══════════════════════════════════════════════════ */

(function (root) {
  const STYLES = ['classic', 'modern', 'clean', 'warm'];
  const CHAPTER_LABELS = ['chapter', 'number', 'none'];
  const PAPERS = ['white', 'cream'];
  const TRIMS = ['6x9', '5.5x8.5', '5.25x8', '5x8'];
  const PART_KEYS = ['title', 'copyright', 'contents', 'intro', 'conclusion', 'about', 'also_by'];
  const ALSO_BY_MAX = 20;
  const HEADER_TITLE_MAX = 80;
  // KDP paperback spine, inches per page (no bleed).
  const SPINE_PER_PAGE = { white: 0.002252, cream: 0.0025 };
  // The template's margins (js/format/book.typ, t1), fixed in v2a.
  const MARGIN = { inside: 0.75, outside: 0.5 };
  // Book parts in the fixed print order (design 41; 51b for Introduction and Conclusion).
  // always: on, no switch. needs: shown only when the book has that chapter (owner, Nov 4).
  // later: shown off, not a switch (Notes and references: owner Q3, Nov 8).
  const PART_ROWS = [
    { key: 'title', name: 'Title page', always: true },
    { key: 'copyright', name: 'Copyright', always: true },
    { key: 'contents', name: 'Contents' },
    { key: 'front', name: 'Dedication, epigraph, foreword, preface', later: 'Write in 06 · v2b' },
    { key: 'intro', name: 'Introduction', needs: 'intro' },
    { key: 'conclusion', name: 'Conclusion', needs: 'conclusion' },
    { key: 'notes', name: 'Notes and references, at the back', later: 'Comes in v2b' },
    { key: 'about', name: 'About the author' },
    { key: 'also_by', name: 'Also by' }
  ];

  function defaults() {
    return {
      style: 'classic',
      parts: { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: false, also_by: false },
      contents_sections: false,
      chapter_label: 'chapter',
      drop_cap: false,
      recto_start: true,
      running_header: true,
      header_title: null,
      paper: 'white',
      isbn: null,
      also_by: []
    };
  }

  const bool = (v, d) => (typeof v === 'boolean' ? v : d);

  function isbnOk(p) {
    if (typeof p !== 'string' || !/^97[89][0-9]{10}$/.test(p)) return false;
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(p[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }

  /** "978-1-23456-789-7" or "978 1 …" → "9781234567897", or null when it is not a valid ISBN-13. */
  function isbnClean(input) {
    const digits = String(input == null ? '' : input).replace(/[\s-]/g, '');
    return isbnOk(digits) ? digits : null;
  }

  /** Header title: null, or 1 to 80 characters with no space at either end (the 0027 check, after a trim). */
  function headerTitle(v) {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t && [...t].length <= HEADER_TITLE_MAX ? t : null;
  }

  function normalize(row) {
    const d = defaults();
    const r = row || {};
    const parts = {};
    for (const k of PART_KEYS) parts[k] = bool(r.parts && r.parts[k], d.parts[k]);
    return {
      style: STYLES.includes(r.style) ? r.style : d.style,
      parts,
      contents_sections: bool(r.contents_sections, d.contents_sections),
      chapter_label: CHAPTER_LABELS.includes(r.chapter_label) ? r.chapter_label : d.chapter_label,
      drop_cap: bool(r.drop_cap, d.drop_cap),
      recto_start: bool(r.recto_start, d.recto_start),
      running_header: bool(r.running_header, d.running_header),
      header_title: headerTitle(r.header_title),
      paper: PAPERS.includes(r.paper) ? r.paper : d.paper,
      isbn: isbnOk(r.isbn) ? r.isbn : null,
      also_by: Array.isArray(r.also_by) ? [...new Set(r.also_by.filter((x) => typeof x === 'string'))].slice(0, ALSO_BY_MAX) : []
    };
  }

  const isGroupA = (trim) => TRIMS.includes(trim);

  function trimSize(trim) {
    const t = isGroupA(trim) ? trim : '6x9';
    const [w, h] = t.split('x').map(Number);
    return { w, h };
  }

  /** KDP minimum margins in inches, no bleed (KDP help, "Set trim size, bleed, and margins"). */
  function kdpMargin(pages) {
    const n = Number(pages) || 0;
    const outside = 0.25;
    if (n < 24) return { tier: 'under 24', inside: 0.375, outside, ok: false };
    if (n <= 150) return { tier: '24 to 150', inside: 0.375, outside, ok: true };
    if (n <= 300) return { tier: '151 to 300', inside: 0.5, outside, ok: true };
    if (n <= 500) return { tier: '301 to 500', inside: 0.625, outside, ok: true };
    if (n <= 700) return { tier: '501 to 700', inside: 0.75, outside, ok: true };
    if (n <= 828) return { tier: '701 to 828', inside: 0.875, outside, ok: true };
    return { tier: 'over 828', inside: 0.875, outside, ok: false };
  }

  const spine = (pages, paper) => Math.round((Number(pages) || 0) * SPINE_PER_PAGE[paper === 'cream' ? 'cream' : 'white'] * 10000) / 10000;

  /** The export model for the PDF: Final sections only, intro and conclusion per the format parts. */
  function modelOf(data, settings) {
    const st = normalize(settings);
    return root.kdpExportRules.model(data, {
      include: 'final', format: 'docx',
      parts: { title: st.parts.title, copyright: st.parts.copyright, contents: st.parts.contents, intro: st.parts.intro, conclusion: st.parts.conclusion, about: st.parts.about }
    });
  }

  /** "6 × 9 in" */
  const trimText = (trim) => `${String(trim || '6x9').replace('x', ' × ')} in`;

  /** The margins line under PAGE · PRINT (design 41). pages 0: the count is not known yet. */
  function marginNote(pages) {
    const n = Number(pages) || 0;
    const fixed = `We use ${MARGIN.inside} in inside and ${MARGIN.outside} in outside, mirrored.`;
    if (!n) return `KDP's minimum inside margin depends on the page count. ${fixed}`;
    if (n > 828) return `KDP prints up to 828 pages. ${fixed}`;
    const m = kdpMargin(n < 24 ? 24 : n);
    return `KDP minimum ${m.inside} in inside for ${m.tier} pages. ${fixed}`;
  }

  /** Page count chip: { pages, blanks, content }; blanks = pages added to make the count even. */
  function pageInfo(meta) {
    const pages = Number(meta && meta.lastPage) || 0;
    const end = Number(meta && meta.contentEnd) || pages;
    return { pages, blanks: Math.max(0, pages - end), content: Math.min(end, pages) };
  }

  /** "Spine 0.108 in · no spine text under 80 pages" (KDP: spine text needs 79 pages or more; we say 80, as design 41). */
  function spineText(pages, paper) {
    const w = spine(pages, paper).toFixed(3);
    return pages < 80 ? `Spine ${w} in · no spine text under 80 pages` : `Spine ${w} in`;
  }

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const EMOJI = /\p{Extended_Pictographic}/u;
  /** "an emoji" or "“✓” (U+2713)" */
  const charName = (m) => (EMOJI.test(m.char) ? 'an emoji' : `“${m.char}” (${m.code})`);

  /**
   * The Ready box (designs 41, 41c "Warnings · never block"), in this order:
   * sections not Final (left out), Final with no text, needs review (section,
   * then chapter), open Verify marks, unsaved edits, a section being written,
   * missing characters, under 24 pages, over 700 pages (margin, owner Q8),
   * over 828, Also by books dropped.
   *   model     kdpFormatRules.modelOf(…)
   *   missing   kdpFontCmap.missing(…) shape, or null (not checked yet)
   *   pages     the preview's page count, or 0 (not built yet)
   *   dropped   Also by books that are no longer valid (count)
   * → { warnings: [{ key, text, sectionId? }], finals }
   */
  function ready({ model, missing = null, pages = 0, dropped = 0 }) {
    const w = [];
    const notFinal = model.notFinal.length + model.noText.filter((s) => s.status !== 'final').length;
    const finalEmpty = model.noText.filter((s) => s.status === 'final').length;
    if (notFinal) w.push({ key: 'not-final', text: `${count(notFinal, 'section is', 'sections are')} not Final. ${notFinal === 1 ? 'It is' : 'They are'} left out.` });
    if (finalEmpty) w.push({ key: 'final-empty', text: `${count(finalEmpty, 'Final section has', 'Final sections have')} no text. ${finalEmpty === 1 ? 'It is' : 'They are'} left out.` });
    // model.needsReview holds sections ({ id, label }) and chapters ({ chapter, label: "chapter 2" }).
    const secReview = model.needsReview.filter((x) => !x.chapter);
    const chReview = model.needsReview.filter((x) => x.chapter);
    if (secReview.length) w.push({ key: 'review', text: `${count(secReview.length, 'section needs', 'sections need')} review.`, sectionId: secReview[0].id });
    if (chReview.length) w.push({ key: 'review-chapter', text: chReview.length === 1 ? `${chReview[0].label[0].toUpperCase()}${chReview[0].label.slice(1)} needs review in 05 Outline.` : `${chReview.length} chapters need review in 05 Outline.` });
    if (model.openMarks) w.push({ key: 'marks', text: `${count(model.openMarks, 'claim has', 'claims have')} no source yet (Verify). The marks are not printed.`, sectionId: model.marks.sections[0] && model.marks.sections[0].id });
    if (model.unsaved.length) w.push({ key: 'unsaved', text: `${count(model.unsaved.length, 'section has', 'sections have')} unsaved edits in 06. The PDF uses the last saved version.`, sectionId: model.unsaved[0].id });
    if (model.running.length) w.push({ key: 'running', text: `${count(model.running.length, 'section is', 'sections are')} being written now. The PDF uses the last saved version.`, sectionId: model.running[0].id });
    if (missing && missing.length) {
      const first = missing[0];
      const where = first.where[0] || '';
      const sec = model.sections.find((s) => s.label === where);
      const text = missing.length === 1
        ? `1 character is not in the font (${charName(first)}${where ? ` in ${where}` : ''}). It prints as a box.`
        : `${missing.length} characters are not in the font (${missing.slice(0, 3).map(charName).join(', ')}${missing.length > 3 ? ' and more' : ''}${where ? `, first in ${where}` : ''}). They print as a box.`;
      w.push({ key: 'chars', text, sectionId: sec ? sec.id : null });
    }
    if (pages && pages < 24) w.push({ key: 'short', text: `${pages} pages. KDP needs at least 24 pages for a paperback.` });
    if (pages > 700 && pages <= 828) w.push({ key: 'margin', text: `Over 700 pages. KDP asks for ${kdpMargin(pages).inside} in inside. This book uses ${MARGIN.inside} in.` });
    if (pages > 828) w.push({ key: 'long', text: `${pages} pages. KDP prints paperbacks up to 828 pages.` });
    if (dropped) w.push({ key: 'also-by', text: `${count(dropped, 'Also by book was', 'Also by books were')} left out. ${dropped === 1 ? 'It no longer has' : 'They no longer have'} this pen name.` });
    return { warnings: w, finals: model.sections.length };
  }

  function fileName(title, trim) {
    const slug = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
    return `${slug || 'book'}-print-${isGroupA(trim) ? trim : '6x9'}.pdf`;
  }

  root.kdpFormatRules = {
    STYLES, CHAPTER_LABELS, PAPERS, TRIMS, PART_KEYS, PART_ROWS, ALSO_BY_MAX, HEADER_TITLE_MAX, SPINE_PER_PAGE, MARGIN,
    defaults, normalize, isGroupA, trimSize, trimText, isbnOk, isbnClean, kdpMargin, spine, marginNote, modelOf, fileName,
    pageInfo, spineText, ready
  };
})(globalThis);
