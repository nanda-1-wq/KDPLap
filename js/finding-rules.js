/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write: the rules of the AI check findings
   (PRODUCE gate G5, design 22d)
   /js/finding-rules.js   (used by js/write-checks.js, loaded before it;
                           tested by tests/finding-rules.test.js)

   Severity comes from the type, set by our code (owner, G4 Q1): drift and
   objective are major, voice is minor. "Keep as is" (0024 kept_findings)
   hides a finding: one with a quote on every later check with the same type
   and the exact quote; an objective gap (empty quote) only on the check it
   was kept from (owner, G5 Q2).

   kdpFindingRules.severity(type) → 'major' | 'minor'
   kdpFindingRules.sameInstant(a, b)   two timestamps from the database, to the microsecond
   kdpFindingRules.keptOf(finding, kept, checkedAt) → the kept row that hides it, or null
   kdpFindingRules.view(row, kept, text, old) → what the Checks tab shows
   kdpFindingRules.fixMajor(row, kept, text, old) → the Fix major queue
   kdpFindingRules.tabCount(warnings, view, old) → the tab count
═══════════════════════════════════════════════════ */

(function (root) {
  const TYPES = ['objective', 'voice', 'drift'];
  const SEVERITY = { objective: 'major', voice: 'minor', drift: 'major' };
  // Same number as 0024 kept_findings_guard (tests/limits-parity.test.js).
  const KEPT_MAX = 50;
  // "Fix major (N)" shows from 2 items (design 22d, 6): one item has its own Fix.
  const QUEUE_MIN = 2;

  const severity = (type) => SEVERITY[type] || 'major';

  /**
   * A timestamp as Postgres sends it ("2026-10-16T10:00:00.123456+00:00"),
   * as whole seconds and microseconds. Never through Date alone: Date keeps
   * milliseconds, Postgres keeps microseconds. null when it cannot be read.
   */
  function instant(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(String(s || '').trim());
    if (!m) return null;
    let sec = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
    if (m[8] !== 'Z') {
      const sign = m[8][0] === '-' ? -1 : 1;
      const hm = m[8].slice(1).replace(':', '');
      sec -= sign * (Number(hm.slice(0, 2)) * 3600 + Number(hm.slice(2) || 0) * 60);
    }
    return `${sec}.${(m[7] || '').padEnd(6, '0')}`;
  }

  /** The same moment: the same string, or the same seconds and microseconds. */
  function sameInstant(a, b) {
    if (a == null || b == null) return false;
    if (a === b) return true;
    const x = instant(a);
    return x !== null && x === instant(b);
  }

  /** The kept row that hides a finding of the check made at checkedAt, or null. */
  function keptOf(f, kept, checkedAt) {
    if (!f || !Array.isArray(kept)) return null;
    if (f.quote) return kept.find((k) => k.quote && k.type === f.type && k.quote === f.quote) || null;
    return kept.find((k) => !k.quote && k.type === f.type && k.message === f.message && sameInstant(k.check_at, checkedAt)) || null;
  }

  /**
   * What the Checks tab shows for a saved check:
   *   major, minor  open findings as { f, i (index in row.findings), at
   *                 (where the quote is in the text, or -1) }: in text order;
   *                 quotes not in the text, then gaps, last
   *   hidden        findings of this check hidden by a keep
   *   kept          the kept list: every kept quote, and the gaps kept from this check
   *   pass          the types that show a pass row: the AI said pass, or every
   *                 finding of that type is kept (owner, G5 STOP 1)
   *   noneOpen      nothing open and something hidden: one line "No open AI
   *                 findings" stands for the pass rows (design 22d, 12)
   */
  function view(row, kept, text, old) {
    const out = { major: [], minor: [], hidden: [], kept: [], pass: [], noneOpen: false, old: !!old };
    const list = Array.isArray(kept) ? kept : [];
    out.kept = list.filter((k) => k.quote || (row && sameInstant(k.check_at, row.checked_at)));
    if (!row) return out;
    const t = String(text || '');
    (row.findings || []).forEach((f, i) => {
      if (keptOf(f, list, row.checked_at)) { out.hidden.push({ f, i }); return; }
      const at = f.quote ? t.indexOf(f.quote) : -1;
      out[severity(f.type) === 'major' ? 'major' : 'minor'].push({ f, i, at });
    });
    const rank = (x) => (x.at >= 0 ? x.at : x.f.quote ? 1e12 : 2e12) + x.i / 100;
    out.major.sort((a, b) => rank(a) - rank(b));
    out.minor.sort((a, b) => rank(a) - rank(b));
    const open = (type) => out.major.concat(out.minor).some((x) => x.f.type === type);
    const areas = row.areas || {};
    out.pass = TYPES.filter((type) => areas[type] === 'pass' || (areas[type] === 'issues' && !open(type) && out.hidden.some((x) => x.f.type === type)));
    out.noneOpen = !out.major.length && !out.minor.length && out.hidden.length > 0;
    return out;
  }

  /**
   * The Fix major queue (design 22d, 6): major findings whose quote is in the
   * text, not kept, in a check that is not out of date; in text order.
   * The button shows only with QUEUE_MIN items or more.
   */
  function fixMajor(row, kept, text, old) {
    if (!row || old) return [];
    return view(row, kept, text, false).major.filter((x) => x.f.quote && x.at >= 0);
  }

  /** The tab count: code warnings + open major findings of a current check (owner, G5 Q1). */
  function tabCount(warnings, v, old) {
    return (warnings || 0) + (!old && v ? v.major.length : 0);
  }

  root.kdpFindingRules = { TYPES, KEPT_MAX, QUEUE_MIN, severity, instant, sameInstant, keptOf, view, fixMajor, tabCount };
})(globalThis);
