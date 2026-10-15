/* ═══════════════════════════════════════════════════
   KDP Lab — Section check fingerprint (step 06 Checks tab, E10.4)
   /js/section-check-key.js   (used by js/write-checks.js;
                               tested by tests/section-check-key.test.js)

   kdpSectionCheckKey({ versionId, kind, chapterTitle, objective, sectionTitle,
                        lockedAt, penName, voice, wordTarget, siblings }) → 16 hex
   kdpSectionCheckKey.siblings(kind, sections, ownId) → ['1 Title', ...]

   A short fingerprint (a plain hash, not a security feature) of what the AI
   section check reads besides the Brief and Research: the version id, the
   chapter's kind, title and objective, the section title, the positioning
   lock time, the pen name and its voice fields as stored (tones, reading
   level, perspective, sentences, paragraphs, sample), and (G3 P10) the word
   target and the chapter's other sections as the prompt lists them
   ("<n> <title>", chapters only). The generate function
   saves the same key with each check (supabase/functions/generate/lib/
   section_check.ts sectionCheckKey); when the key of what is on screen
   differs, the check is "Out of date". The hash is js/outline-key.js's.
═══════════════════════════════════════════════════ */

(function (root) {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  function keyHash(s) {
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

  /** The voice fields in a fixed order, as stored (not labels). */
  function voiceParts(raw) {
    const j = obj(raw);
    const tones = Array.isArray(j.tones) ? j.tones.filter((t) => typeof t === 'string').map((t) => t.trim()).join(',') : '';
    return [tones, text(j.reading_level), text(j.perspective), text(j.sentences), text(j.paragraphs), text(j.sample)];
  }

  /** The chapter's other sections as "<n> <title>" in order (chapters only), as the prompt's <other_sections>. */
  function siblingParts(kind, sections, ownId) {
    if (kind !== 'chapter') return [];
    return (sections || []).map((s, j) => ({ s, j })).filter(({ s }) => s.id !== ownId).map(({ s, j }) => `${j + 1} ${text(s.title)}`);
  }

  function sectionCheckKey(p) {
    const target = typeof p.wordTarget === 'number' && p.wordTarget > 0 ? String(p.wordTarget) : '';
    return keyHash([
      p.versionId, p.kind, text(p.chapterTitle), text(p.objective), text(p.sectionTitle), text(p.lockedAt), text(p.penName), ...voiceParts(p.voice),
      target, (p.siblings || []).map(text).join('\u0002')
    ].join('\u0001'));
  }

  sectionCheckKey.siblings = siblingParts;
  root.kdpSectionCheckKey = sectionCheckKey;
})(globalThis);
