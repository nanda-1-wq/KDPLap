/* ═══════════════════════════════════════════════════
   KDP Lab — Title checks (step 04)
   /js/title-checks.js   (used by js/book-title.js; tested by tests/title-checks.test.js)

   Our code, not the AI, checks a title + subtitle. Every result is a
   warning to look at, never a promise: we never say a title is safe,
   available or free of trademarks (we don't check trademarks).

   kdpTitleChecks.check(title, subtitle, competitors) → {
     length,            title + ": " + subtitle, as KDP counts both parts
     over,              characters over 200 (0 when it fits)
     warnings: [{ code: 'sales' | 'author' | 'close' | 'repeat', text }],
                        (repeat: words inside a hyphenated compound are not counted on their own)
     passes:   [{ code, text }]   the checks that found nothing
   }
   competitors: [{ title, author }] from step 02 Research.
═══════════════════════════════════════════════════ */

(function (root) {
  const MAX = 200;   // same as migration 0011 and supabase/functions/generate/lib.ts

  // Small words: not counted as repeats, not used to compare titles.
  const SMALL = new Set(('a an and are as at be by for from how in into is it its of on or our the to up '
    + 'with you your yours my me we what why when who over after before without').split(' '));

  // Sales claims KDP does not allow in a title. Single words match a whole
  // word only, so "Pain-Free" and "Stress-Free" (one hyphenated word) pass.
  const SALES_WORDS = new Set(['free', 'bonus', 'bestseller', 'bestsellers', 'bestselling', 'best-seller',
    'best-sellers', 'best-selling', 'sale', 'discount', 'discounted', 'cheap', 'cheapest', '#1',
    'top-rated', 'award-winning']);
  const SALES_PHRASES = ['best seller', 'best selling', 'number one', 'no. 1', 'no 1', 'top rated',
    'limited time', 'award winning', 'on sale', 'special offer'];

  const len = (t, s) => t.length + (s ? 2 + s.length : 0);

  /** Words as written, with the punctuation around them removed ("#1" and "Pain-Free" stay whole). */
  const rawWords = (s) => s.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);

  /** Lower-case words, split at anything that is not a letter or digit. */
  const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  const plain = (s) => words(s).join(' ');

  /** For repeats: a hyphenated compound ("step-by-step", "Pain-Free") stays one word. */
  const wholeWords = (s) => s.toLowerCase().split(/[^\p{L}\p{N}-]+/u).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean);

  /** For repeats: "routines" and "routine" are the same word. */
  const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

  const mainTitle = (t) => t.split(':')[0];
  const keyWords = (t) => new Set(words(mainTitle(t)).filter((w) => !SMALL.has(w)));

  function salesClaims(text) {
    const found = [];
    for (const w of rawWords(text)) {
      if (SALES_WORDS.has(w.toLowerCase()) && !found.some((f) => f.toLowerCase() === w.toLowerCase())) found.push(w);
    }
    const flat = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
    for (const p of SALES_PHRASES) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}-])${p.replace(/[.#]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}-])`, 'u');
      if (re.test(flat) && !found.some((f) => f.toLowerCase() === p)) found.push(p);
    }
    return found;
  }

  /** Full author names from the competitors that appear in the text. */
  function authorNames(text, competitors) {
    const hay = ` ${plain(text)} `;
    const found = [];
    for (const c of competitors) {
      for (const name of String(c.author || '').split(/\s*(?:,|&|\band\b)\s*/i)) {
        const n = plain(name);
        if (n.length >= 4 && n.includes(' ') && hay.includes(` ${n} `) && !found.includes(name.trim())) found.push(name.trim());
      }
    }
    return found;
  }

  /**
   * A competitor whose main title (before the colon) shares most of its
   * words with ours: Dice overlap 0.7 or more, with 2 or more shared words.
   */
  function closeTo(title, competitors) {
    const a = keyWords(title);
    if (!a.size) return null;
    let best = null, bestScore = 0;
    for (const c of competitors) {
      const b = keyWords(String(c.title || ''));
      if (!b.size) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      const score = (2 * shared) / (a.size + b.size);
      const same = plain(mainTitle(title)) === plain(mainTitle(String(c.title)));
      if ((same || (shared >= 2 && score >= 0.7)) && score > bestScore) { best = c.title; bestScore = score; }
    }
    return best;
  }

  function repeats(text) {
    const seen = new Set(), out = [];
    for (const w of wholeWords(text)) {
      if (SMALL.has(w) || /^\p{N}+$/u.test(w) || w.length < 3) continue;
      const k = stem(w);
      if (seen.has(k) && !out.includes(k)) out.push(k);
      seen.add(k);
    }
    return out;
  }

  const quote = (list) => list.map((x) => `"${x}"`).join(', ');

  function check(title, subtitle, competitors) {
    const t = String(title || '').trim();
    const s = String(subtitle || '').trim();
    const comps = Array.isArray(competitors) ? competitors : [];
    const both = s ? `${t} ${s}` : t;
    const length = t || s ? len(t, s) : 0;
    const warnings = [], passes = [];

    const sales = salesClaims(both);
    if (sales.length) warnings.push({ code: 'sales', text: `Sales claim: ${quote(sales)}` });
    else passes.push({ code: 'sales', text: 'No sales claims found' });

    const authors = authorNames(both, comps);
    if (authors.length) warnings.push({ code: 'author', text: `Competitor author: ${quote(authors)}` });
    else passes.push({ code: 'author', text: 'No competitor author names' });

    const close = t ? closeTo(t, comps) : null;
    if (close) warnings.push({ code: 'close', text: `Close to "${close}"` });
    else passes.push({ code: 'close', text: 'Not close to a competitor title' });

    const rep = repeats(both);
    if (rep.length) warnings.push({ code: 'repeat', text: `Repeated word: ${quote(rep)}` });
    else passes.push({ code: 'repeat', text: 'No word repeated' });

    return { length, over: Math.max(0, length - MAX), warnings, passes };
  }

  root.kdpTitleChecks = { MAX, check, length: len };
})(typeof window !== 'undefined' ? window : globalThis);
