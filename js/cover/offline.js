/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: offline (E16 Part 9, design 73b, plan §3 States, R15)
   /js/cover/offline.js   (browser; the editor and save.js use it)

   While the browser is offline the editor keeps working:
   - the amber bar (design 73b) and the footer "Offline · kept on this device";
   - every change is kept on this device (localStorage) by the autosave
     (save.js keep), never sent;
   - export, AI and Pixabay or Unsplash are blocked with plain words
     (they need a connection);
   - back online, the autosave saves the design as usual and the kept copy
     is cleared after a save that returned a rev.

   The kept copy (one per user and book) holds the design and the rev it
   was based on. On the next open (plan R15, "the newest rev wins"):
   - the copy's base rev is the row's rev or later: nothing was saved since,
     so the copy is the newest: the editor opens it and saves it;
   - the row's rev is higher and the copy is newer in time than the row
     (owner, STOP 9 N3; the likeliest case: a save whose reply was lost,
     then more changes): the editor asks "You have changes on this device
     from [time] that were not saved. Keep them, or use the saved
     version?". Keep them saves the copy as the row (the row as it was is
     the visit snapshot); Use the saved version puts the copy into the
     history (reason "visit") and clears it;
   - the row's rev is higher and the row is newer in time (another tab or
     device saved later): the row wins; the copy goes into the history
     first (reason "visit"), then it is cleared. Never silently lost.

   kdpCover.offline.isOffline()                  → true when the browser says it has no connection
   kdpCover.offline.key(userId, bookId)          → the localStorage key
   kdpCover.offline.read(userId, bookId)         → the kept copy or null
   kdpCover.offline.write(userId, bookId, design, rev) → true when kept (false: storage full or blocked)
   kdpCover.offline.clear(userId, bookId)
   kdpCover.offline.settle(copy, design)         → 'local' (the copy is newer), 'server' or null (no copy)
   kdpCover.offline.newerInTime(copy, design)    → the copy was kept after the row's updated_at (N3: ask)
   kdpCover.offline.barHtml()                    → the amber bar (design 73b)
   kdpCover.offline.BLOCKED                      → the words for what needs a connection
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const PREFIX = 'nicheink.cover.v1.';
  const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/></svg>';
  const BLOCKED = {
    export: 'You are offline. Export needs a connection.',
    ai: 'You are offline. Writing with AI needs a connection.',
    stock: 'You are offline. Pixabay and Unsplash need a connection.'
  };

  const isOffline = () => !!(root.navigator && root.navigator.onLine === false);
  const key = (userId, bookId) => PREFIX + (userId || 'me') + '.' + bookId;

  function read(userId, bookId) {
    try {
      const raw = root.localStorage.getItem(key(userId, bookId));
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || c.bookId !== bookId || !Array.isArray(c.layers) || typeof c.bg !== 'string' || !Number.isFinite(c.baseRev)) return null;
      return c;
    } catch (e) { return null; }
  }
  function write(userId, bookId, d, rev) {
    const c = { v: 1, bookId, baseRev: rev, layers: d.layers, bg: d.bg, at: new Date().toISOString() };
    for (const k of ['layout', 'fmt', 'last_remap']) if (d[k] !== undefined) c[k] = d[k];
    try { root.localStorage.setItem(key(userId, bookId), JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  function clear(userId, bookId) { try { root.localStorage.removeItem(key(userId, bookId)); } catch (e) { /* storage blocked */ } }

  /** R15: the newest rev wins. */
  function settle(copy, design) {
    if (!copy || !design) return null;
    return copy.baseRev >= design.rev ? 'local' : 'server';
  }
  /** Owner STOP 9 (N3): the copy was kept after the row was saved (this device's clock against the row's updated_at). */
  function newerInTime(copy, design) {
    const a = Date.parse(copy && copy.at), b = Date.parse(design && design.updated_at);
    return Number.isFinite(a) && (!Number.isFinite(b) || a > b);
  }

  function barHtml() {
    return `${ICON}<span><strong>You are offline.</strong> Keep working: your changes stay on this device and save when you are back online. Export, AI and Pixabay or Unsplash need a connection.</span>`;
  }

  C.offline = { PREFIX, BLOCKED, ICON, isOffline, key, read, write, clear, settle, newerInTime, barHtml };
})(globalThis);
