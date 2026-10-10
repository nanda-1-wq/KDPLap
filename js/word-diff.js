/* ═══════════════════════════════════════════════════
   KDP Lab — Compare versions (E10.1, design 23)
   /js/word-diff.js   (used by js/book-write.js; tested by tests/word-diff.test.js)

   kdpWordDiff.diff(oldText, newText) → [{ op: 'same' | 'del' | 'add', text, old? }]
   Word by word: a word keeps the spaces after it, and two words match when
   they differ only in those spaces ("level." and "level. "). A 'same' part
   holds the new side's text, and in `old` the old side's text when that
   differs, so joining one side's parts gives that side's text back
   exactly. The common start and end are matched first; the middle uses a
   longest-common-subsequence table.
   When the middle is too long for that (WORD_LIMIT words a side), it is
   compared paragraph by paragraph instead, so a 10,000-word section stays
   fast in the browser.
═══════════════════════════════════════════════════ */

(function (root) {
  const WORD_LIMIT = 2500;

  /** Words with their trailing whitespace; leading whitespace is its own token. */
  const words = (s) => String(s || '').match(/^\s+|\S+\s*/g) || [];
  /** Paragraphs with their trailing blank lines. */
  const paras = (s) => String(s || '').match(/^\s+|[\s\S]+?(?:\n\s*\n\s*|$)/g)?.filter(Boolean) || [];

  /** Merges neighbours with the same op. old: the old side's text of a 'same' part. */
  function push(out, op, text, old) {
    if (!text && !old) return;
    const last = out[out.length - 1];
    if (last && last.op === op) {
      if (op === 'same') last.old = (last.old !== undefined ? last.old : last.text) + (old !== undefined ? old : text);
      last.text += text;
      if (last.old === last.text) delete last.old;
    } else {
      const part = { op, text };
      if (op === 'same' && old !== undefined && old !== text) part.old = old;
      out.push(part);
    }
  }

  const same = (x, y) => x === y || x.trimEnd() === y.trimEnd();

  /** LCS diff of two token lists (the caller keeps them small). */
  function lcs(a, b, out) {
    const n = a.length, m = b.length;
    const W = m + 1;
    const T = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        T[i * W + j] = same(a[i], b[j]) ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (same(a[i], b[j])) { push(out, 'same', b[j], a[i]); i++; j++; }
      else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) { push(out, 'del', a[i]); i++; }
      else { push(out, 'add', b[j]); j++; }
    }
    while (i < n) push(out, 'del', a[i++]);
    while (j < m) push(out, 'add', b[j++]);
  }

  /** Common start and end first, then the middle with fn. */
  function trimmed(a, b, out, fn) {
    let s = 0;
    while (s < a.length && s < b.length && same(a[s], b[s])) s++;
    let e = 0;
    while (e < a.length - s && e < b.length - s && same(a[a.length - 1 - e], b[b.length - 1 - e])) e++;
    for (let k = 0; k < s; k++) push(out, 'same', b[k], a[k]);
    fn(a.slice(s, a.length - e), b.slice(s, b.length - e), out);
    for (let k = 0; k < e; k++) push(out, 'same', b[b.length - e + k], a[a.length - e + k]);
  }

  function diff(oldText, newText) {
    const out = [];
    const a = words(oldText), b = words(newText);
    trimmed(a, b, out, (x, y, o) => {
      if (x.length <= WORD_LIMIT && y.length <= WORD_LIMIT) { lcs(x, y, o); return; }
      // Too long for a word table: whole paragraphs instead.
      const pa = paras(x.join('')), pb = paras(y.join(''));
      if (pa.length <= WORD_LIMIT && pb.length <= WORD_LIMIT) {
        trimmed(pa, pb, o, (p, q, oo) => lcs(p, q, oo));
      } else {
        push(o, 'del', x.join(''));
        push(o, 'add', y.join(''));
      }
    });
    return out;
  }

  root.kdpWordDiff = { diff, WORD_LIMIT };
})(globalThis);
