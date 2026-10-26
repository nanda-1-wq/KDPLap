/* ═══════════════════════════════════════════════════
   KDP Lab — Export: what goes in the file (design 24b)
   /js/export-rules.js   (used by js/export-dialog.js and js/export-build.js;
                          needs js/sentences.js, js/word-budget.js and
                          js/text-checks.js for the number rule;
                          tested by tests/export-rules.test.js)

   Pure, no DOM. The data is the export_json() reply (migration 0025).

   The include rule is the same as export_badges() in 0025, so the Books
   badge is fresh right after an export (owner note, STOP 2): a section is
   in the file when its current saved version has text (text_is_blank: only
   spaces, tabs and line breaks are blank), it is Final when include is
   "final", and its chapter is a chapter, or an Introduction or Conclusion
   whose part is on. Partial versions and sections being written now are
   included the same way: their current saved version. Order: chapter
   position, then section position.

   kdpExportRules.defaults(data)          → { format, include, parts }
   kdpExportRules.available(data)         → { intro, conclusion, about } (rows to show)
   kdpExportRules.model(data, opts)       → everything the dialog and the builder need
   kdpExportRules.versionIds(model)       → the exported version ids, in order
   kdpExportRules.strip(md)               → the text without "[Verify: no source]" marks
   kdpExportRules.copyright(pen, year)    → the copyright page text (owner, 2026-10-25)
   kdpExportRules.fileName(title, format) → "chair-yoga-for-seniors-over-60.docx"
═══════════════════════════════════════════════════ */

(function (root) {
  const FLAG = '[Verify: no source]';
  const PARTS = ['title', 'copyright', 'contents', 'intro', 'conclusion', 'about'];
  // A Generate run counts as "being written" while its heartbeat is fresh (the 0020 rule, js/book-write.js RUN_FRESH).
  const RUN_FRESH = { heartbeatMs: 20000, startedMs: 160000 };
  const AI_EDITS = ['edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom'];

  const str = (v) => (typeof v === 'string' ? v : '');
  // public.text_is_blank (0019): null, '' or only spaces, tabs and line breaks.
  const isBlank = (t) => /^[ \t\n\r\f\v]*$/.test(str(t));
  const words = (md) => (root.kdpWords && root.kdpWords.count ? root.kdpWords.count(md) : (str(md).match(/\S+/g) || []).length);

  const hasKind = (data, kind) => (data.chapters || []).some((c) => c.kind === kind);

  function available(data) {
    return {
      intro: hasKind(data, 'intro'),
      conclusion: hasKind(data, 'conclusion'),
      about: !isBlank(data.book && data.book.bio)
    };
  }

  function defaults(data) {
    const a = available(data);
    return {
      format: 'docx',
      include: 'all',
      parts: { title: true, copyright: true, contents: true, intro: a.intro, conclusion: a.conclusion, about: false }
    };
  }

  /** The chapter numbers: kind "chapter" only, in outline order (as Write's labels). */
  function numbers(chapters) {
    const out = new Map();
    let n = 0;
    for (const c of chapters) if (c.kind === 'chapter') out.set(c.id, ++n);
    return out;
  }

  /** "2.1 Shoulder rolls", "Introduction", "Conclusion" (js/book-write.js sectionLabel). */
  function labelOf(c, s, idx, num) {
    if (c.kind === 'intro') return 'Introduction';
    if (c.kind === 'conclusion') return 'Conclusion';
    return `${num.get(c.id)}.${idx + 1} ${str(s.title).trim() || 'Untitled section'}`;
  }

  const partOn = (c, parts) => c.kind === 'chapter' || (c.kind === 'intro' && !!parts.intro) || (c.kind === 'conclusion' && !!parts.conclusion);

  /** The rule shared with export_badges: is this section in the file? */
  function inFile(c, s, opts) {
    const v = s.version;
    return !!v && !isBlank(v.content) && (opts.include === 'all' || s.status === 'final') && partOn(c, opts.parts || {});
  }

  function fresh(run, now) {
    if (!run) return false;
    const t = Date.parse(now);
    return t - Date.parse(run.heartbeat_at) < RUN_FRESH.heartbeatMs && t - Date.parse(run.started_at) < RUN_FRESH.startedMs;
  }

  /** Count "[Verify: no source]" anywhere (old v15 marks too: mid-word, after "1."). */
  const markCount = (md) => str(md).split(FLAG).length - 1;

  /** Claim numbers with no source and no mark: the "number" row of the Checks tab. */
  function numberCount(md, known) {
    const T = root.kdpTextChecks;
    if (!T) return 0;
    const row = T.check(md, { known }).rows.find((r) => r.code === 'number');
    return row ? row.ranges.length : 0;
  }

  /** Remove every mark, then tidy the spaces it leaves. The sentences stay. */
  function strip(md) {
    return str(md)
      .split('\n')
      .map((line) => line.replace(/[ \t]*\[Verify: no source\]/g, '').replace(/([^ \t])[ \t]{2,}/g, '$1 ').replace(/[ \t]+$/, ''))
      .join('\n');
  }

  function model(data, opts) {
    const chapters = data.chapters || [];
    const parts = { ...defaults(data).parts, ...(opts.parts || {}) };
    const o = { include: opts.include === 'final' ? 'final' : 'all', parts };
    const num = numbers(chapters);
    const known = root.kdpTextChecks ? root.kdpTextChecks.knownOf(data.known && data.known.brief, data.known && data.known.research, chapters) : '';

    const out = {
      book: data.book || {}, include: o.include, parts, format: opts.format === 'md' ? 'md' : 'docx',
      chapters: [], sections: [],
      status: { final: 0, reviewed: 0, draft: 0 },       // of the sections with text (any status), parts on
      withText: 0,
      notFinal: [],     // with text but not Final: left out under "Final only"
      noText: [],       // no saved text: always left out
      droppedChapters: [],
      needsReview: [], unsaved: [], partial: [], running: [], cut: [],
      marks: { total: 0, numbers: 0, sections: [] },
      ai: { draft: 0, edits: 0, own: 0, words: { draft: 0, edits: 0, own: 0 } },
      words: 0
    };

    for (const c of chapters) {
      if (!partOn(c, parts)) continue;
      const kept = [];
      (c.sections || []).forEach((s, i) => {
        const label = labelOf(c, s, i, num);
        const item = { id: s.id, label, title: str(s.title).trim(), status: s.status };
        const v = s.version;
        const text = !!v && !isBlank(v.content);
        if (!text) { out.noText.push(item); return; }
        out.withText++;
        if (s.status === 'final') out.status.final++;
        else if (s.status === 'reviewed') out.status.reviewed++;
        else out.status.draft++;
        if (!inFile(c, s, o)) { out.notFinal.push(item); return; }
        const sec = { ...item, version: v, content: v.content, words: words(v.content), ai: s.ai || 'none' };
        kept.push(sec);
        out.sections.push(sec);
        out.words += sec.words;
        // Notes (never blocking).
        if (s.needs_review) out.needsReview.push(item);
        if (s.unsaved) out.unsaved.push({ ...item, versionNo: v.version_no });
        if (v.partial) out.partial.push(item);
        // E12 M9: text that ends mid-sentence (a warning, never blocking; the Checks tab's rule).
        if (root.kdpTextChecks && root.kdpTextChecks.ending(v.content)) out.cut.push(item);
        if (fresh(s.run, data.now)) out.running.push({ ...item, versionNo: v.version_no });
        // Marks.
        const m = markCount(v.content), nb = numberCount(v.content, known);
        if (m || nb) out.marks.sections.push({ ...item, marks: m, numbers: nb });
        out.marks.total += m;
        out.marks.numbers += nb;
        // AI note: by section and by words.
        const kind = sec.ai === 'draft' ? 'draft' : sec.ai === 'edits' ? 'edits' : 'own';
        out.ai[kind]++;
        out.ai.words[kind] += sec.words;
      });
      if (kept.length) {
        out.chapters.push({
          id: c.id, kind: c.kind, number: c.kind === 'chapter' ? num.get(c.id) : null,
          title: str(c.title).trim(), needsReview: !!c.needs_review, sections: kept
        });
        if (c.needs_review && !out.needsReview.some((x) => x.chapter === c.id)) out.needsReview.push({ chapter: c.id, label: c.kind === 'chapter' ? `chapter ${num.get(c.id)}` : (c.kind === 'intro' ? 'the Introduction' : 'the Conclusion') });
      } else if ((c.sections || []).length) {
        out.droppedChapters.push({ id: c.id, label: c.kind === 'chapter' ? `Chapter ${num.get(c.id)}` : (c.kind === 'intro' ? 'The Introduction' : 'The Conclusion') });
      }
    }
    // Chapter numbers in the file run 1, 2, 3 over the chapters that are in it.
    let n = 0;
    for (const c of out.chapters) if (c.kind === 'chapter') c.fileNumber = ++n;
    out.openMarks = out.marks.total + out.marks.numbers;
    out.empty = out.sections.length === 0;
    return out;
  }

  const versionIds = (m) => m.sections.map((s) => s.version.id);

  function copyright(penName, year) {
    const who = str(penName).trim();
    return `Copyright © ${year}${who ? ` ${who}` : ''}. All rights reserved. No part of this book may be reproduced without written permission from the author, except for short quotes in reviews. The information in this book is for general education only. It is not medical, legal or financial advice. Talk to a qualified professional before you act on it.`;
  }

  function fileName(title, format) {
    const slug = str(title).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
    return `${slug || 'book'}.${format === 'md' ? 'md' : 'docx'}`;
  }

  root.kdpExportRules = { FLAG, PARTS, RUN_FRESH, AI_EDITS, isBlank, available, defaults, model, versionIds, strip, copyright, fileName, markCount, inFile };
})(globalThis);
