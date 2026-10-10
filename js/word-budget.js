/* ═══════════════════════════════════════════════════
   KDP Lab — Words and pages (shared)
   /js/word-budget.js   (used by js/book-brief.js and js/book-outline.js;
                         tested by tests/outline-checks.test.js)

   One place for the page estimate and the Brief length ranges, so step 01
   and step 05 always show the same numbers (owner, E9).

   kdpWords.WORDS_PER_PAGE   about 250 words a page at 6 × 9 in
   kdpWords.RANGES           Brief length_range key → [low, high or null]
   kdpWords.pages(words, trim)   page estimate, nearest 5, at least 10 ("6x9" etc.)
   kdpWords.target(brief)    the Brief's word target, or null:
     { kind: 'range' | 'custom', min, max (null for 30K+), label }
     A custom target counts as met within 10% either side.
   kdpWords.within(words, target) → true | false (null target: false)
   kdpWords.short(n)         8000 → "8K", 12500 → "12.5K"
   kdpWords.count(md)        words in a section's Markdown text (E10.1). Same
     rule as md_word_count in migration 0018, which sets the saved count:
     markers at the start of a line (# to ######, -, +, 1. or 1)) and every *
     are not words; the rest is split on ASCII whitespace.
═══════════════════════════════════════════════════ */

(function (root) {
  // About 250 words a page at 6 × 9 in, scaled by page area (owner, E9).
  const WORDS_PER_PAGE = 250;
  const BASE_AREA = 6 * 9;

  // Same keys as migration 0001 (book_briefs.length_range) and the server
  // (supabase/functions/generate/lib/limits.ts LENGTH_RANGES).
  const RANGES = { '5-8k': [5000, 8000], '8-12k': [8000, 12000], '12-20k': [12000, 20000], '20-30k': [20000, 30000], '30k+': [30000, null] };

  /** Pages at a trim size: at least 10, rounded to the nearest 5 (owner, E9). */
  function pages(words, trim) {
    const [w, h] = String(trim || '6x9').split('x').map(Number);
    const perPage = WORDS_PER_PAGE * ((w * h) || BASE_AREA) / BASE_AREA;
    return Math.max(10, Math.round(words / perPage / 5) * 5);
  }

  function short(n) {
    if (n < 1000) return String(n);
    const k = Math.round(n / 100) / 10;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }

  /** The Brief's word target (a range OR a custom number, 0014), or null. */
  function target(brief) {
    const b = brief || {};
    const r = b.length_range && Object.prototype.hasOwnProperty.call(RANGES, b.length_range) ? RANGES[b.length_range] : null;
    if (r) return { kind: 'range', min: r[0], max: r[1], label: r[1] ? `${short(r[0])} to ${short(r[1])}` : `${short(r[0])}+` };
    const t = Number(b.target_words);
    if (Number.isInteger(t) && t > 0) return { kind: 'custom', min: Math.round(t * 0.9), max: Math.round(t * 1.1), aim: t, label: t.toLocaleString('en-US') };
    return null;
  }

  const within = (words, t) => !!t && words >= t.min && (t.max === null || words <= t.max);

  // ASCII whitespace only, like Postgres [ \t\n\r\f\v] (0018 md_word_count).
  const MARKER = /^[ \t]*(#{1,6}|[-+]|[0-9]{1,9}[.)])[ \t]+/gm;
  // The source flag is not words (0020 md_word_count, owner E10.2 answer 7).
  const FLAG = /\[Verify: no source\]/g;
  function count(md) {
    const t = String(md || '').replace(FLAG, ' ').replace(MARKER, '').replace(/\*/g, '');
    return t.split(/[ \t\n\r\f\v]+/).filter(Boolean).length;
  }

  root.kdpWords = { WORDS_PER_PAGE, RANGES, pages, target, within, short, count };
})(globalThis);
