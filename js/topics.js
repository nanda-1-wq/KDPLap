/* ═══════════════════════════════════════════════════
   KDP Lab — Topic helpers shared by Topic Lab and Topic detail
   /js/topics.js

   Load AFTER js/supabase.js. The five market checks here mirror the
   generated column topics.checks_passed (supabase/migrations/0001).
   Keep both in step. A value that is not set counts as not passed.
═══════════════════════════════════════════════════ */

(function () {
  const svg = (size, stroke, body) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const ICON = {
    check: (s = 13) => svg(s, 2.4, '<path d="M5 12l5 5 9-10"/>'),
    x: (s = 13) => svg(s, 2.4, '<path d="M6 6l12 12M18 6L6 18"/>'),
    warn: (s = 13) => svg(s, 2.2, '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>'),
    close: svg(20, 2, '<path d="M6 6l12 12M18 6L6 18"/>'),
    plus: svg(18, 2, '<path d="M12 5v14M5 12h14"/>'),
    search: svg(18, 2, '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    rename: svg(16, 2, '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
    archive: svg(16, 2, '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'),
    trash: (s = 16) => svg(s, 2, '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')
  };

  const STATUS = {
    idea: 'Idea',
    researching: 'Researching',
    validated: 'Validated',
    book_started: 'Book started',
    rejected: 'Rejected',
    archived: 'Archived'
  };

  // Functional colors always come with an icon and a word (CLAUDE.md §7).
  function statusBadge(status) {
    const icon = status === 'validated' ? ICON.check(12) : status === 'rejected' ? ICON.x(12) : '';
    return `<span class="status status-${status}">${icon}${STATUS[status] || status}</span>`;
  }

  /**
   * The five market checks for a topic row. Each item:
   *   { key, field, label, short, pass, set }
   * set = false when the value is empty (not checked yet).
   */
  function checks(t) {
    const set = (v) => v !== null && v !== undefined;
    return [
      { key: 'winning', field: 'winning_count', label: 'Winning books', short: 'winning books',
        set: set(t.winning_count), pass: set(t.winning_count) && t.winning_count >= 3 },
      { key: 'dead', field: 'dead_count', label: 'Dead books', short: 'dead books',
        set: set(t.dead_count), pass: set(t.dead_count) && t.dead_count <= 8 },
      { key: 'authority', field: 'authority_count', label: 'Authority books', short: 'authority books',
        set: set(t.authority_count), pass: set(t.authority_count) && t.authority_count <= 4 },
      { key: 'match', field: 'results_match', label: 'Results match the topic', short: 'results match',
        set: set(t.results_match), pass: t.results_match === true },
      { key: 'specific', field: 'is_specific', label: 'One problem for one person', short: 'one problem for one person',
        set: set(t.is_specific), pass: t.is_specific === true }
    ];
  }

  const passedCount = (t) => checks(t).filter((c) => c.pass).length;
  const isScored = (t) => checks(t).some((c) => c.set);

  /** Five squares, green for each passed check. Always shown next to the words "N of 5". */
  function dots(passed, large) {
    const n = Math.max(0, Math.min(5, passed || 0));
    const spans = Array.from({ length: 5 }, (_, i) => `<span${i < n ? ' class="on"' : ''}></span>`).join('');
    return `<span class="dots${large ? ' dots-lg' : ''}" aria-hidden="true">${spans}</span>`;
  }

  /** "a, b, and c" */
  function joinList(parts) {
    if (parts.length <= 1) return parts.join('');
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** "Today", "Yesterday", "Sep 20", or "Sep 20, 2025" for another year. */
  function dayText(iso) {
    const then = new Date(iso);
    const now = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(then)) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    const opts = { month: 'short', day: 'numeric' };
    if (then.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return then.toLocaleDateString('en-US', opts);
  }

  /** Newest book id of a topic, or null. */
  function newestBookId(t) {
    const books = (t.books || []).slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return books.length ? books[0].id : null;
  }

  window.kdpTopics = { ICON, STATUS, statusBadge, checks, passedCount, isScored, dots, joinList, esc, dayText, newestBookId, MAX_NAME: 200 };
})();
