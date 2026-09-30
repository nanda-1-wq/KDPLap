/* ═══════════════════════════════════════════════════
   KDP Lab — Autosave (shared)
   /js/autosave.js

   The save loop of the detail pages, written once: edits mark fields
   dirty, a short delay later every dirty field goes out in one save, one
   request at a time. A failed save keeps the edits for Retry, and leaving
   the page with unsaved edits asks first.

   Used by the Brief (js/book-brief.js). Follow-up after E7: switch
   js/topic.js and js/pen-name.js to it.

   const saver = kdpAutosave.create({
     read(field)         → the value to send, or { error: 'text' } to hold the save
     save(fields)        → Promise<{ data, error }>
     onSaved(res, sent)  → after a good save (sent = the field names)
     onError(res, sent)  → return true when the page handled it (then the edits are dropped)
     render(state, message, canRetry)   state: 'idle' | 'saving' | 'saved' | 'error'
   });
   saver.edit(field, delayMs) · saver.flush() · saver.retry() · saver.hasUnsaved() · saver.state
═══════════════════════════════════════════════════ */

(function () {
  function create(opts) {
    const dirty = new Set();
    let timer = null, inFlight = null, state = 'idle';

    function set(next, message) {
      state = next;
      opts.render(state, message || '', next === 'error' && dirty.size > 0);
    }

    function schedule(delay) {
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    }

    function edit(field, delay) {
      dirty.add(field);
      schedule(delay);
    }

    /** Save every dirty field in one request. Resolves when all is saved or failed. */
    async function flush() {
      clearTimeout(timer);
      timer = null;
      if (inFlight) { await inFlight; return dirty.size ? flush() : undefined; }
      if (!dirty.size) return;

      const sent = [...dirty];
      const fields = {};
      for (const f of sent) {
        const v = opts.read(f);
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.error === 'string') {
          set('error', `Couldn't save: ${v.error}`);
          return;
        }
        fields[f] = v;
      }
      dirty.clear();
      set('saving');

      inFlight = (async () => {
        try { return await opts.save(fields); } catch (err) { return { error: err }; }
      })();
      const res = await inFlight;
      inFlight = null;

      if (res.error) {
        // Keep the edits unless newer ones replaced them. Retry sends them again.
        sent.forEach((f) => dirty.add(f));
        if (opts.onError && opts.onError(res, sent)) {
          dirty.clear();
          clearTimeout(timer);
          timer = null;
          return;
        }
        set('error', "Couldn't save.");
        return;
      }

      if (opts.onSaved) opts.onSaved(res, sent);
      set(dirty.size ? 'saving' : 'saved');
      if (dirty.size && !timer) return flush();
    }

    const hasUnsaved = () => dirty.size > 0 || !!inFlight;

    window.addEventListener('beforeunload', (e) => {
      if (!hasUnsaved()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    return {
      edit,
      flush,
      retry: flush,
      hasUnsaved,
      isDirty: (field) => dirty.has(field),
      get state() { return state; }
    };
  }

  window.kdpAutosave = { create };
})();
