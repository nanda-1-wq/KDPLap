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

   E12 fix batch 2, items 5 and 8 (design 22e, the owner's rule of 2026-10-27):
   kdpFindingRules.isCheckFix(suggestion, findings) → a used suggestion is one of
     this check's Fixes: the passage it changed holds a finding's quote
   kdpFindingRules.changedWords(parts) → words added and removed in a kdpWordDiff.diff
   kdpFindingRules.stillValid({ planSame, steps, changed, words }) → { valid, reason, pct }:
     whether an old check still holds
   kdpFindingRules.ready({ status, needsReview, warnRows, check, view }) → { state, left }:
     the "Ready to mark Final" block
═══════════════════════════════════════════════════ */

(function (root) {
  const TYPES = ['objective', 'voice', 'drift'];
  const SEVERITY = { objective: 'major', voice: 'minor', drift: 'major' };
  // Same number as 0024 kept_findings_guard (tests/limits-parity.test.js).
  const KEPT_MAX = 50;
  // "Fix major (N)" shows from 2 items (design 22d, 6): one item has its own Fix.
  const QUEUE_MIN = 2;

  // The Improve menu's actions (0021): a version they made is an AI edit.
  const AI_EDITS = ['edit_format', 'improve', 'expand', 'shorten', 'humanize', 'custom'];
  // Your own edits since a check keep it valid while they stay under this share of its words (owner, 2026-10-27).
  const EDIT_LIMIT = 20;

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
   *   fixed         (opts.textChanged, a check that is not old) findings whose
   *                 quote is no longer in the text: fixed, neither open nor counted (22e)
   */
  function view(row, kept, text, old, opts) {
    const out = { major: [], minor: [], hidden: [], kept: [], pass: [], noneOpen: false, old: !!old, fixed: [] };
    // 22e: a still valid check of text that changed since: a finding whose quote is gone is fixed.
    const gone = !old && !!(opts && opts.textChanged);
    const list = Array.isArray(kept) ? kept : [];
    out.kept = list.filter((k) => k.quote || (row && sameInstant(k.check_at, row.checked_at)));
    if (!row) return out;
    const t = String(text || '');
    (row.findings || []).forEach((f, i) => {
      if (keptOf(f, list, row.checked_at)) { out.hidden.push({ f, i }); return; }
      const at = f.quote ? t.indexOf(f.quote) : -1;
      if (gone && f.quote && at < 0) { out.fixed.push({ f, i, at }); return; }
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

  /* ── Ready to mark Final (E12 fix batch 2, items 5 and 8, design 22e) ── */

  const flat = (v) => String(v || '').replace(/\s+/g, ' ').trim();

  /**
   * A used suggestion is one of this check's Fixes when the passage it changed
   * holds the quote of one of the check's findings (a Fix selects the quote and
   * the sentences around it), or most of that quote (a shorter selection).
   */
  function isCheckFix(sug, findings) {
    const sel = flat(sug && sug.selection);
    if (!sel) return false;
    return (findings || []).some((f) => {
      const q = flat(f && f.quote);
      return !!q && (sel.includes(q) || (q.includes(sel) && sel.length * 2 >= q.length));
    });
  }

  /** Words added and removed in a kdpWordDiff.diff result (a space change is not a word). */
  function changedWords(parts) {
    let n = 0;
    for (const p of parts || []) if (p.op === 'del' || p.op === 'add') n += (String(p.text).match(/\S+/g) || []).length;
    return n;
  }

  /**
   * Does an old AI check still hold? (owner rule, 2026-10-27; design 22e, 11)
   *   planSame  its fingerprint with the check's own version id is the saved
   *             one: only the text changed, not the chapter, positioning or voice
   *   steps     each version after the checked one, oldest first, that was
   *             current (partial ones left out): { source, fix } (fix: isCheckFix)
   *   changed   your own changed words since the check: the words changed from
   *             the checked text to the text now, less those its Fixes changed
   *   words     the checked version's words
   * A Fix of this check keeps it; your own edits keep it while they are under
   * EDIT_LIMIT % of its words; a Restore, a Generate or another AI edit ends it.
   * reason, the first that applies: 'plan', 'restore', 'generate', 'improve', 'edits'.
   */
  function stillValid(o) {
    const words = Number(o.words) || 0, changed = Math.max(0, Number(o.changed) || 0);
    const pct = words > 0 ? (changed / words) * 100 : changed > 0 ? 100 : 0;
    const steps = Array.isArray(o.steps) ? o.steps : [];
    const has = (fn) => steps.some(fn);
    let reason = null;
    if (!o.planSame) reason = 'plan';
    else if (has((x) => x.source === 'restore')) reason = 'restore';
    else if (has((x) => x.source === 'generate')) reason = 'generate';
    else if (has((x) => AI_EDITS.includes(x.source) && !x.fix)) reason = 'improve';
    else if (pct >= EDIT_LIMIT) reason = 'edits';
    return { valid: !reason, reason, pct };
  }

  /**
   * The readiness block (design 22e). check: null (no AI check yet) or its
   * validity ({ valid, reason }); view: what view() shows for it (textChanged).
   * left, in this order: Needs review, the code warnings, then no check / an
   * out of date check, or the open major findings and the open objective gaps.
   * state: 'ready' | 'left' | 'nocheck' | 'stale' | 'final' | 'final-left'.
   * Minor findings and info rows never count. Advice only: it never changes
   * the status and never blocks Final.
   */
  function ready(o) {
    const left = [];
    if (o.needsReview) left.push({ kind: 'review', text: 'Needs review: written before the positioning was unlocked' });
    for (const r of o.warnRows || []) left.push({ kind: 'code', code: r.code, text: r.text });
    if (!o.check) left.push({ kind: 'nocheck', text: 'No AI check yet' });
    else if (!o.check.valid) left.push({ kind: 'stale', text: 'The AI check is out of date' });
    else {
      const major = o.view ? o.view.major : [];
      const open = major.filter((x) => x.f.quote), gaps = major.filter((x) => !x.f.quote);
      if (open.length) left.push({ kind: 'major', i: open[0].i, text: open.length === 1 ? `1 major AI finding (${open[0].f.type})` : `${open.length} major AI findings` });
      if (gaps.length) left.push({ kind: 'gap', i: gaps[0].i, text: gaps.length === 1 ? '1 part of the objective is not covered' : `${gaps.length} parts of the objective are not covered` });
    }
    let state;
    if (o.status === 'final') state = left.length ? 'final-left' : 'final';
    else if (!left.length) state = 'ready';
    else if (left.length === 1 && left[0].kind === 'nocheck') state = 'nocheck';
    else if (left.length === 1 && left[0].kind === 'stale') state = 'stale';
    else state = 'left';
    return { state, left };
  }

  root.kdpFindingRules = { TYPES, KEPT_MAX, QUEUE_MIN, AI_EDITS, EDIT_LIMIT, severity, instant, sameInstant, keptOf, view, fixMajor, tabCount, isCheckFix, changedWords, stillValid, ready };
})(globalThis);
