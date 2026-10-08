/* ═══════════════════════════════════════════════════
   KDP Lab — Outline checks (step 05)
   /js/outline-checks.js   (used by js/book-outline.js; tested by tests/outline-checks.test.js)

   What our code can check about an outline, never the AI. Overlaps and the
   reader promise need the AI (E9.2, labeled AI).

   kdpOutlineChecks.chapterWords(chapter) → the sum of its sections' word targets
   kdpOutlineChecks.planned(chapters)     → the whole book, Introduction and Conclusion included
   kdpOutlineChecks.check(chapters, brief) → {
     rows: [{ code, ok, text }]   for the Outline check card, in this order:
       words (the Brief target), objective, title, sections, words0, count (only
       when the Brief has a chapter count)
     byChapter: { [chapter id]: [{ code, text }] }   pills on a chapter card
     warnings: the number of rows that are not ok
   }
   chapters: rows as js/supabase.js getOutline returns them, in order, each
   with kind 'intro' | 'chapter' | 'conclusion' and its sections.
   brief: the book_briefs row (length_range, target_words, chapter_count).
═══════════════════════════════════════════════════ */

(function (root) {
  const W = root.kdpWords;
  const blank = (v) => typeof v !== 'string' || !v.trim();
  const words = (s) => (Number.isInteger(s.word_target) ? s.word_target : 0);
  const chapterWords = (c) => (c.sections || []).reduce((n, s) => n + words(s), 0);
  const planned = (list) => list.reduce((n, c) => n + chapterWords(c), 0);
  const fmt = (n) => n.toLocaleString('en-US');

  /** "Chapter 8", "Chapters 7 and 8", "Chapters 1, 2, 3 and 8". */
  function chapterList(nums) {
    if (nums.length === 1) return `Chapter ${nums[0]}`;
    return `Chapters ${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`;
  }
  const has = (nums) => (nums.length === 1 ? 'has' : 'have');

  function check(list, brief) {
    const chapters = list.filter((c) => c.kind === 'chapter');
    const byChapter = {};
    const rows = [];
    if (!chapters.length) return { rows, byChapter, warnings: 0 };
    const pill = (c, code, text) => { (byChapter[c.id] = byChapter[c.id] || []).push({ code, text }); };

    const total = planned(list);
    const t = W.target(brief);
    if (!t) rows.push({ code: 'words', ok: false, text: 'No word target yet. Set the length in 01 Brief.' });
    else if (W.within(total, t)) rows.push({ code: 'words', ok: true, text: 'Within the word target' });
    else if (total < t.min) rows.push({ code: 'words', ok: false, text: `${fmt(t.min - total)} words under the target (${t.label})` });
    else rows.push({ code: 'words', ok: false, text: `${fmt(total - t.max)} words over the target (${t.label})` });

    const noObjective = [], noTitle = [], noSections = [];
    let zero = 0;
    chapters.forEach((c, i) => {
      if (blank(c.objective)) { noObjective.push(i + 1); pill(c, 'objective', 'No objective'); }
      if (blank(c.title)) { noTitle.push(i + 1); pill(c, 'title', 'No title'); }
      if (!(c.sections || []).length) { noSections.push(i + 1); pill(c, 'sections', 'No sections'); }
      zero += (c.sections || []).filter((s) => words(s) === 0).length;
    });
    rows.push(noObjective.length
      ? { code: 'objective', ok: false, text: `${chapterList(noObjective)} ${has(noObjective)} no objective` }
      : { code: 'objective', ok: true, text: 'Every chapter has an objective' });
    rows.push(noTitle.length
      ? { code: 'title', ok: false, text: `${chapterList(noTitle)} ${has(noTitle)} no title` }
      : { code: 'title', ok: true, text: 'Every chapter has a title' });
    rows.push(noSections.length
      ? { code: 'sections', ok: false, text: `${chapterList(noSections)} ${has(noSections)} no sections` }
      : { code: 'sections', ok: true, text: 'Every chapter has a section' });
    rows.push(zero
      ? { code: 'words0', ok: false, text: zero === 1 ? '1 section has no word target' : `${zero} sections have no word target` }
      : { code: 'words0', ok: true, text: 'Every section has a word target' });

    const want = brief && Number.isInteger(brief.chapter_count) ? brief.chapter_count : null;
    if (want) {
      rows.push(chapters.length === want
        ? { code: 'count', ok: true, text: `${want} chapters, as in your Brief` }
        : { code: 'count', ok: false, text: `${chapters.length} chapters. Your Brief says ${want}.` });
    }
    return { rows, byChapter, warnings: rows.filter((r) => !r.ok).length };
  }

  root.kdpOutlineChecks = { chapterWords, planned, check };
})(globalThis);
