/* ═══════════════════════════════════════════════════
   KDP Lab — Outline fingerprint (step 05, E9.2)
   /js/outline-key.js   (used by js/book-outline.js; tested by tests/outline-key.test.js)

   kdpOutlineKey(chapters, lockedAt) → 16 hex

   A short fingerprint (a plain hash, not a security feature) of what the AI
   outline check reads: the chapters in order with their ids, titles and
   objectives, each chapter's sections in order with their ids and titles,
   and the positioning lock time. Words, the Examples and Exercise boxes and
   the "Needs review" marks are left out: the AI does not judge them (owner,
   E9.2). The generate function saves the same key with each check
   (supabase/functions/generate/lib/outline_check.ts outlineKey); when the
   key of the outline on screen differs, the check is "Out of date".
═══════════════════════════════════════════════════ */

(function (root) {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');

  function outlineKey(rows, lockedAt) {
    const parts = [text(lockedAt)];
    for (const c of rows || []) {
      if (c.kind !== 'chapter') continue;
      parts.push([c.id, text(c.title), text(c.objective), ...(c.sections || []).map((s) => `${s.id}\u0003${text(s.title)}`)].join('\u0001'));
    }
    const s = parts.join('\u0002');
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
    return hex(h1) + hex(h2);
  }

  root.kdpOutlineKey = outlineKey;
})(globalThis);
