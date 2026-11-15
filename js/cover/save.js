/* ═══════════════════════════════════════════════════
   NicheInk · 09 Cover: autosave (E16 Part 4, plan §2 "Autosave", R11)
   /js/cover/save.js   (browser; needs js/supabase.js)

   Every change to the layers or the background saves on its own, 700 ms
   after the last change (a drag or a slider is one save). One save runs at
   a time; changes made while it runs go in the next one.
   - The row is written only while it is still at the rev this tab read
     (kdp.saveCoverDesign: "update … where rev = $rev"); the database sets
     rev + 1 and the new rev comes back.
   - 0 rows (another tab saved first, R11) and any other error: "failed".
     The change stays on screen; the bar says "Your last change was not
     saved." with Retry. Retry reads the row's rev again, then writes this
     tab's design (last write wins: one user in v2; R11 "New, your call" at
     STOP 4).
   - History (0030 cover_design_history, plan Q-5): the design as it was
     when the visit started is kept as a "visit" snapshot just before the
     visit's first save. A visit that changes nothing writes no snapshot,
     so idle visits never push real snapshots out of the 20 kept.

   const s = kdpCover.save.create({ bookId, rev, snapshot, read, onState, delay })
     snapshot: { layers, bg, fmt, layout } as loaded (for the visit snapshot)
     read(): { layers, bg } to write now
     onState(state, info): 'saved' | 'saving' | 'failed'; info = { conflict, message }
   s.changed()       a change happened: save soon
   s.flush()         save now (Promise: resolves when nothing is left to save, or it failed)
   s.retry()         after a failure
   s.state() / s.rev() / s.pending()
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});

  function create(o) {
    const delay = o.delay == null ? 700 : o.delay;
    let rev = o.rev, state = 'saved', timer = null, running = null, dirty = false, snapDone = false, conflict = false;
    const set = (st, info) => { state = st; o.onState(st, info || {}); };

    function changed() {
      dirty = true;
      if (state === 'failed') return;   // stays failed until Retry: the bar keeps saying so
      clearTimeout(timer);
      timer = setTimeout(run, delay);
      if (state !== 'saving') set('saving');
    }

    async function run() {
      clearTimeout(timer); timer = null;
      if (running) { await running; if (dirty && state !== 'failed') return run(); return; }
      if (!dirty) { if (state !== 'failed') set('saved'); return; }
      running = (async () => {
        set('saving');
        dirty = false;
        const want = o.read();
        try {
          if (!snapDone && o.snapshot) {
            // Kept even if it fails: the design itself still saves.
            const r = await root.kdp.addCoverSnapshot(o.bookId, 'visit', o.snapshot).catch((e) => ({ error: e }));
            if (!r.error) snapDone = true;
          }
          if (conflict) {
            const cur = await root.kdp.getCover(o.bookId);
            if (cur.error || !cur.data || !cur.data.design) throw cur.error || new Error('The cover could not be read.');
            rev = cur.data.design.rev;
          }
          const res = await root.kdp.saveCoverDesign(o.bookId, rev, { layers: want.layers, bg: want.bg });
          if (res.error) throw res.error;
          rev = res.data.rev;
          conflict = false;
          set(dirty ? 'saving' : 'saved');
        } catch (e) {
          dirty = true;
          if (e && e.conflict) conflict = true;
          set('failed', { conflict: !!(e && e.conflict), message: (e && e.message) || '' });
        }
      })();
      try { await running; } finally { running = null; }
      if (dirty && state !== 'failed') return run();
    }

    function flush() { if (state === 'failed') return Promise.resolve(false); return run().then(() => state === 'saved'); }
    function retry() { if (state !== 'failed') return flush(); dirty = true; set('saving'); return run(); }

    return { changed, flush, retry, state: () => state, rev: () => rev, pending: () => dirty || !!running || !!timer };
  }

  C.save = { create };
})(globalThis);
