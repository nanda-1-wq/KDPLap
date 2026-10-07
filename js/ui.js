/* ═══════════════════════════════════════════════════
   KDP Lab — UI helpers shared by every app page and step module
   /js/ui.js

   Load AFTER js/supabase.js and before any other app script.
   esc:  escape text for innerHTML.
   ICON: inline SVG icons. Functions take a size; strings have a fixed size.
   nextMonthUtc: the date the monthly AI allowance resets ("Nov 1").
   aiMessage(code): [kind, text, retry] for the AI error codes every page
     shares. Pages handle their own codes first, then fall back to this.
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
    sparkle: svg(16, 2, '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/>'),
    more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    rename: svg(16, 2, '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
    archive: svg(16, 2, '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>'),
    trash: (s = 16) => svg(s, 2, '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const nextMonthUtc = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** [kind, text, retry] for an AI error code shared by every page. */
  function aiMessage(code) {
    switch (code) {
      case 'monthly_limit': return ['warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`, false];
      case 'rate_limited': return ['warning', 'Too many requests. Wait a minute, then try again.', true];
      case 'save_first': return ['error', 'Your last change is not saved yet. Use Retry next to “Couldn’t save”, then try again.', false];
      case 'network': return ['error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.', true];
      default: return ['error', 'The AI is not available right now. This try was not counted.', true];
    }
  }

  window.kdpUi = { esc, ICON, nextMonthUtc, aiMessage };
})();
