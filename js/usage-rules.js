/* ═══════════════════════════════════════════════════
   KDP Lab — AI usage this month (Settings, design 25b; the Books stat)
   /js/usage-rules.js   (used by js/settings.js and app/dashboard.html;
                         tested by tests/usage-rules.test.js)

   Pure helpers, no DOM. The numbers come from the usage_month() RPC (0025):
   counted tokens from the 1st of the month, UTC, summed on the server.

   kdpUsage.summary(u)  → { tokens, limit, shown, pct, level, resets, cost,
                            stages, left, sectionsLeft }
     shown   the number on screen: never above the limit (a last call can
             pass the limit a little).
     level   'none' (no calls) | 'ok' | 'warn' (80% or more) | 'full' (100%).
     resets  "November 1" (the 1st of next month, UTC).
     cost    dollars from PRICES, or null when a model has no price.
     stages  [{ stage, name, calls, tokens }], most tokens first: the top 5,
             then one "Other (…)" row for the rest.
     sectionsLeft  tokens left ÷ this month's average Write section call,
             rounded down; null when there was no Write section call.
   kdpUsage.costText(cost) → "About $2.10" | "Under $0.01" | "$0.00" | "No estimate"
   kdpUsage.call(row, now) → one "Last calls" row: { when, name, where, tokens, tag }
   kdpUsage.chapterEstimate(u, targets, recent) → the cost line of Generate chapter
     (E12 fix batch 2, design 23b): { calls, words, input, output, tokens, cost, left,
     over, none, resets }. Each section: the average input of this book's last Write
     calls (recent, after Live check B: the book's context grows), else this month's
     average Write call input, else WRITE_INPUT_DEFAULT; plus its word target ×
     OUT_PER_WORD output tokens.
   kdpUsage.tokensText(n) → "27,000" | "1.21M" (rounded, for the cost line)
═══════════════════════════════════════════════════ */

(function (root) {
  // Dollars per million tokens (Anthropic price list, checked for Sonnet 5.5 in G3).
  const PRICES = { 'claude-sonnet-5-5': { in: 2, out: 10 } };
  // Generate chapter (design 23b): the input of one Write call when this month has none,
  // the output tokens a word (E12: 1.54 to 1.85 measured), and Generate's words for no target.
  const WRITE_INPUT_DEFAULT = 6500;
  const OUT_PER_WORD = 1.7;
  const NO_TARGET_WORDS = 500;
  const WRITE_MODEL = 'claude-sonnet-5-5';
  const WARN_AT = 0.8;
  const TOP = 5;

  const STAGE_NAMES = {
    section_write: 'Write section', section_improve: 'Improve', section_check: 'AI check',
    outline_ideas: 'Outline ideas', outline_check: 'Outline check', title_ideas: 'Title ideas',
    positioning_help: 'Positioning help', drift_check: 'Drift check', brief_help: 'Brief help',
    review_insights: 'Review insights', amazon_import: 'Amazon import', competitor_import: 'Competitor import',
    bio: 'Pen name bio'
  };
  // The short words in the "Other (…)" row.
  const SHORT = {
    section_write: 'writing', section_improve: 'Improve', section_check: 'checks', outline_ideas: 'outline',
    outline_check: 'outline check', title_ideas: 'titles', positioning_help: 'positioning', drift_check: 'drift',
    brief_help: 'Brief', review_insights: 'reviews', amazon_import: 'Amazon import', competitor_import: 'competitors',
    bio: 'bio'
  };
  // Calls with no book: where they ran. Any other stage with no book had its book deleted.
  const NO_BOOK = { bio: 'Pen Names', amazon_import: 'Topic Lab' };

  const nameOf = (stage) => STAGE_NAMES[stage] || String(stage || 'AI call').replace(/_/g, ' ');
  const n = (v) => Number(v) || 0;

  function resetsText(iso) {
    const d = iso ? new Date(iso) : (() => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)); })();
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function costOf(byStage) {
    let dollars = 0;
    for (const r of byStage) {
      if (!n(r.input) && !n(r.output)) continue;
      const p = PRICES[r.model];
      if (!p) return null;
      dollars += (n(r.input) * p.in + n(r.output) * p.out) / 1e6;
    }
    return dollars;
  }

  function summary(u) {
    const byStage = Array.isArray(u && u.by_stage) ? u.by_stage : [];
    const tokens = n(u && u.tokens);
    const limit = n(u && u.limit);
    const shown = limit > 0 ? Math.min(tokens, limit) : tokens;
    const ratio = limit > 0 ? tokens / limit : 1;
    const pct = Math.min(100, Math.round(ratio * 100));
    const level = !byStage.length && !tokens ? 'none' : ratio >= 1 ? 'full' : ratio >= WARN_AT ? 'warn' : 'ok';

    // One row per stage (the RPC splits by model too).
    const merged = new Map();
    for (const r of byStage) {
      const m = merged.get(r.stage) || { stage: r.stage, name: nameOf(r.stage), calls: 0, tokens: 0 };
      m.calls += n(r.calls);
      m.tokens += n(r.input) + n(r.output);
      merged.set(r.stage, m);
    }
    const all = [...merged.values()].sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
    let stages = all;
    if (all.length > TOP + 1) {
      const rest = all.slice(TOP);
      stages = [...all.slice(0, TOP), {
        stage: 'other',
        name: `Other (${rest.map((r) => SHORT[r.stage] || r.name).join(', ')})`,
        calls: rest.reduce((s, r) => s + r.calls, 0),
        tokens: rest.reduce((s, r) => s + r.tokens, 0)
      }];
    }

    const left = Math.max(0, limit - tokens);
    const write = merged.get('section_write');
    const avg = write && write.calls ? write.tokens / write.calls : 0;
    return {
      tokens, limit, shown, pct, level,
      resets: resetsText(u && u.resets),
      cost: costOf(byStage),
      stages, left,
      sectionsLeft: avg > 0 ? Math.floor(left / avg) : null
    };
  }

  function chapterEstimate(u, targets, recent) {
    const list = Array.isArray(targets) ? targets : [];
    const rows = (Array.isArray(u && u.by_stage) ? u.by_stage : []).filter((r) => r.stage === 'section_write');
    const calls = rows.reduce((a, r) => a + n(r.calls), 0);
    const book = (Array.isArray(recent) ? recent : []).map(n).filter((x) => x > 0);
    const avgIn = book.length ? book.reduce((a, x) => a + x, 0) / book.length
      : calls ? rows.reduce((a, r) => a + n(r.input), 0) / calls : WRITE_INPUT_DEFAULT;
    const words = list.reduce((a, t) => a + (n(t) > 0 ? n(t) : NO_TARGET_WORDS), 0);
    const input = Math.round(avgIn * list.length);
    const output = Math.round(words * OUT_PER_WORD);
    const p = PRICES[(rows[0] && rows[0].model) || WRITE_MODEL] || PRICES[WRITE_MODEL];
    const tokens = input + output;
    const limit = n(u && u.limit), used = n(u && u.tokens);
    const left = u ? Math.max(0, limit - used) : null;
    return {
      calls: list.length, words, input, output, tokens,
      cost: (input * p.in + output * p.out) / 1e6,
      left, over: left !== null && tokens > left, none: left !== null && limit > 0 && left === 0,
      resets: resetsText(u && u.resets)
    };
  }

  /** Tokens for a short line: "27,000" (to the nearest 1,000) or "1.21M". */
  function tokensText(t) {
    const v = n(t);
    if (v >= 1e6) return `${(Math.floor(v / 1e4) / 100).toFixed(2)}M`;
    if (v >= 1000) return (Math.round(v / 1000) * 1000).toLocaleString('en-US');
    return v.toLocaleString('en-US');
  }

  function costText(cost) {
    if (cost === null || cost === undefined) return 'No estimate';
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return 'Under $0.01';
    return `About $${cost.toFixed(2)}`;
  }

  const pad = (v) => String(v).padStart(2, '0');
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  /** "Today 14:32", "Yesterday", "Oct 23" (local time). */
  function whenText(iso, now = new Date()) {
    const d = new Date(iso);
    if (sameDay(d, now)) return `Today ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (sameDay(d, y)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function call(row, now) {
    const book = row.books && (Array.isArray(row.books) ? row.books[0] : row.books);
    const where = book && book.title ? book.title : (row.book_id ? 'Untitled book' : (NO_BOOK[row.stage] || 'Deleted book'));
    return {
      when: whenText(row.created_at, now),
      name: nameOf(row.stage),
      where,
      tokens: n(row.input_tokens) + n(row.output_tokens),
      tag: !row.counted ? 'Not counted' : row.status === 'stopped' ? 'Stopped by you' : ''
    };
  }

  root.kdpUsage = { PRICES, WARN_AT, STAGE_NAMES, WRITE_INPUT_DEFAULT, OUT_PER_WORD, summary, costText, call, nameOf, resetsText, whenText, chapterEstimate, tokensText };
})(globalThis);
