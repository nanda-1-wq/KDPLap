/* ═══════════════════════════════════════════════════
   NicheInk · 07 Quality Control: the promise check fingerprint (E14.2)
   /js/qc-promise-key.js   (used by js/qc-rules.js; needs js/section-check-key.js
                            and js/export-rules.js; tested by
                            tests/qc-promise-key.test.js)

   kdpQcPromiseKey({ versionIds, chapterTitle, objective, lockedAt }) → 16 hex
   kdpQcPromiseKey.versionIds(chapter) → the version ids of its sections with
     text, in order. chapter is a chapter of export_json.
   kdpQcPromiseKey.ofChapter(chapter, positioning) → the key of a chapter today.
   kdpQcPromiseKey.LIMITS → the server's PROMISE limits (lib/limits.ts, 0028),
     read by tests/limits-parity.test.js. js/qc-promise.js (E14.6) uses them.

   A short fingerprint (a plain hash, not a security feature) of what the
   promise check reads. The generate function saves the same key in
   book_checks.inputs_key (lib/promise_check.ts promiseKey, E14.5, plan 4.9);
   when the key of what is on screen differs, the chapter is "Out of date".
   tests/fixtures/qc-promise-key.json holds fixed values both twins must give.
═══════════════════════════════════════════════════ */

(function (root) {
  const LIMITS = { minWords: 50, maxWords: 6000, reasonChars: 300, quoteChars: 300 };
  const text = (v) => (typeof v === 'string' ? v.trim() : '');

  function promiseKey(p) {
    return root.kdpSectionCheckKey.hash([
      (p.versionIds || []).join('\u0002'), text(p.chapterTitle), text(p.objective), text(p.lockedAt)
    ].join('\u0001'));
  }

  promiseKey.versionIds = (chapter) => ((chapter && chapter.sections) || [])
    .filter((s) => s.version && !root.kdpExportRules.isBlank(s.version.content))
    .map((s) => s.version.id);

  promiseKey.ofChapter = (chapter, positioning) => promiseKey({
    versionIds: promiseKey.versionIds(chapter),
    chapterTitle: chapter && chapter.title,
    objective: chapter && chapter.objective,
    lockedAt: positioning && positioning.locked_at
  });

  promiseKey.LIMITS = LIMITS;

  root.kdpQcPromiseKey = promiseKey;
})(globalThis);
