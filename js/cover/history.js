/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: undo and redo (E16 Part 1)
   /js/cover/history.js   (pure, no DOM; tested by tests/cover-history.test.js)

   The design's rule: keep up to 50 earlier versions of { layers, bg }.
   Changes within half a second of the last change (a slider, a drag) count
   as one step; the window slides with every change. A drag that has pushed
   once never pushes again until it ends. Undo and redo reset the window.
   A size change starts the history again (reset).

   const h = kdpCover.history.create({ limit, windowMs, now })
   h.change(prev, act)  call with the state BEFORE a change to layers or bg; act = the running drag ({ pushed }) or null
   h.undo(cur) → the state to show, or null      h.redo(cur) → the state to show, or null
   h.canUndo() / h.canRedo() / h.reset() / h.size()
   kdpCover.history.keepSelection(snap, sel, multi) → { sel, multi } that still exist (design restore)
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  function create(opt) {
    const o = opt || {};
    const limit = o.limit || 50, windowMs = o.windowMs == null ? 500 : o.windowMs, now = o.now || (() => Date.now());
    let past = [], future = [], lastPush = 0;
    const snap = (s) => ({ layers: s.layers, bg: s.bg });
    return {
      change(prev, act) {
        const t = now();
        if (t - lastPush > windowMs && !(act && act.pushed)) {
          past.push(snap(prev));
          if (past.length > limit) past.shift();
          future = [];
          if (act) act.pushed = true;
        }
        lastPush = t;
      },
      undo(cur) {
        if (!past.length) return null;
        future.push(snap(cur)); lastPush = 0;
        return past.pop();
      },
      redo(cur) {
        if (!future.length) return null;
        past.push(snap(cur)); lastPush = 0;
        return future.pop();
      },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      reset() { past = []; future = []; lastPush = 0; },
      size: () => ({ past: past.length, future: future.length })
    };
  }

  function keepSelection(s, sel, multi) {
    const ids = s.layers.map((l) => l.id);
    return { sel: ids.includes(sel) ? sel : null, multi: (multi || []).filter((id) => ids.includes(id)) };
  }

  C.history = { create, keepSelection };
})(globalThis);
