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

   E16 Part 9 (plan §3 States, §4, R15):
   - fmt and last_remap are written like layout: only when they changed
     since the last good save. A size remap sends layers, fmt and last_remap
     in one update; closing the size note sends last_remap with seen.
   - snapReason: the reason of that first snapshot ('visit', or 'remap' when
     the visit started with a size remap: the design as it was before it).
   - Offline (o.offline() true): no network call. The design is kept on this
     device (o.keep(design, rev), kdpCover.offline) and the state is
     'offline', not 'failed' (no red bar). Back online, retry() saves as
     usual; o.onSaved(rev) runs after every good save (the kept copy is
     cleared there).

   const s = kdpCover.save.create({ bookId, rev, snapshot, snapReason, saved, read, onState, delay, offline, keep, onSaved })
     snapshot: { layers, bg, fmt, layout } as loaded (for the first snapshot)
     saved: { layout, fmt, last_remap } as the row holds them now (default: snapshot.layout, fmt and last_remap null)
     read(): { layers, bg[, layout][, fmt][, last_remap] } to write now (layout, fmt and last_remap are sent only when
             they changed since the last good save)
     onState(state, info): 'saved' | 'saving' | 'failed' | 'offline'; info = { conflict, message }
   s.changed()       a change happened: save soon
   s.flush()         save now (Promise: resolves when nothing is left to save, it failed, or it is offline)
   s.retry()         after a failure, or when the connection is back
   s.keepNow()       offline: keep the design on this device now (the page is closing)
   o.keep returns false when nothing could be kept (storage full): the change then stays pending ("Leave site?").
   s.state() / s.rev() / s.pending()
   ═══════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  const C = (root.kdpCover = root.kdpCover || {});
  const STICKY = ['layout', 'fmt', 'last_remap'];
  const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);

  function create(o) {
    const delay = o.delay == null ? 700 : o.delay;
    let rev = o.rev, state = 'saved', timer = null, running = null, dirty = false, snapDone = false, conflict = false;
    // E16 Part 8 and 9: layout, fmt and last_remap are written only when they changed since the last good save.
    const saved = { layout: o.snapshot && o.snapshot.layout !== undefined ? o.snapshot.layout : null, fmt: null, last_remap: null };
    if (o.saved) for (const k of STICKY) if (k in o.saved) saved[k] = o.saved[k];
    const offline = () => !!(o.offline && o.offline());
    const set = (st, info) => { state = st; o.onState(st, info || {}); };
    // keptOk: the last keep wrote the design on this device (false: storage full or blocked, so it is still pending)
    let keptOk = true;
    const keep = () => { if (o.keep) keptOk = o.keep(o.read(), rev) !== false; };

    function changed() {
      dirty = true;
      if (state === 'failed') return;   // stays failed until Retry: the bar keeps saying so
      clearTimeout(timer);
      timer = setTimeout(run, delay);
      if (state !== 'saving' && !offline()) set('saving');
    }

    async function run() {
      clearTimeout(timer); timer = null;
      if (running) { await running; if (dirty && state !== 'failed' && state !== 'offline') return run(); return; }
      if (!dirty) { if (state !== 'failed' && state !== 'offline') set('saved'); return; }
      // Part 9: offline, the design is kept on this device; it saves when the connection is back.
      if (offline()) { keep(); set('offline'); return; }
      running = (async () => {
        set('saving');
        dirty = false;
        const want = o.read();
        try {
          if (!snapDone && o.snapshot) {
            // Kept even if it fails: the design itself still saves.
            const r = await root.kdp.addCoverSnapshot(o.bookId, o.snapReason || 'visit', o.snapshot).catch((e) => ({ error: e }));
            if (!r.error) snapDone = true;
          }
          if (conflict) {
            const cur = await root.kdp.getCover(o.bookId);
            if (cur.error || !cur.data || !cur.data.design) throw cur.error || new Error('The cover could not be read.');
            rev = cur.data.design.rev;
          }
          const fields = { layers: want.layers, bg: want.bg };
          for (const k of STICKY) if (want[k] !== undefined && !same(want[k], saved[k])) fields[k] = want[k];
          const res = await root.kdp.saveCoverDesign(o.bookId, rev, fields);
          if (res.error) throw res.error;
          for (const k of STICKY) if (k in fields) saved[k] = fields[k];
          rev = res.data.rev;
          conflict = false;
          if (o.onSaved) o.onSaved(rev);
          set(dirty ? 'saving' : 'saved');
        } catch (e) {
          dirty = true;
          if (e && e.conflict) conflict = true;
          // The connection went while this save was out: offline, kept on this device (not a red "Not saved").
          if (offline() && !(e && e.conflict)) { keep(); set('offline'); }
          else set('failed', { conflict: !!(e && e.conflict), message: (e && e.message) || '' });
        }
      })();
      try { await running; } finally { running = null; }
      if (dirty && state !== 'failed' && state !== 'offline') return run();
    }

    function flush() { if (state === 'failed') return Promise.resolve(false); return run().then(() => state === 'saved'); }
    function retry() {
      if (state !== 'failed' && state !== 'offline') return flush();
      if (offline()) return Promise.resolve(false);
      dirty = true; set('saving'); return run();
    }
    function keepNow() { if (dirty && offline()) { clearTimeout(timer); timer = null; keep(); set('offline'); return true; } return false; }

    // pending: something is not saved anywhere. Offline, a design kept on this device is not pending (design 73b:
    // "your changes stay on this device"), unless a change came after the last keep (its timer is still out).
    return { changed, flush, retry, keepNow, state: () => state, rev: () => rev,
      pending: () => (state === 'offline' ? !keptOk || !!timer || !!running : dirty || !!running || !!timer) };
  }

  C.save = { create };
})(globalThis);
