/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write (designs 22, 23)
   /js/book-write.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[6]. E10.1: the editor, drafts and versions.
   E10.2: Generate section (streamed, see "Generate" below). The Improve
   menu and Checks are E10.3.

   - Write opens when the outline is approved, OR any section already has
     writing (owner, E10). When an edit in 05 removed the approval later,
     writing goes on with the note "The outline changed since you approved it."
   - A section's text is a small Markdown subset (js/markdown-lite.js). The
     editor shows it as HTML and reads it back from its DOM, so pasted
     markup never gets in.
   - Typing autosaves a DRAFT (0018 section_drafts, js/autosave.js, 800 ms).
     A draft never changes a version. A new manual version (save_version) is
     made on "Save version", when you leave the section (another section,
     another step, Exit), after 10 minutes idle with unsaved changes, and
     before a restore, so nothing typed is lost (owner, E10). Closing the
     page keeps the draft; the next open shows "Unsaved changes".
   - A draft started from a version that is no longer current means another
     tab saved meanwhile. The section then asks: "Use my draft" (saved as the
     newest version) or "Keep saved version" (the draft is kept as a version
     that is not current). Nothing typed is lost. The same choice shows when
     a save meets a newer version, and when the tab gets focus again and the
     section's current version changed (adoptRemote, checkRemote).
   - Versions tab: every version, newest first, with Compare (word diff,
     js/word-diff.js) and Restore (a new version; nothing is overwritten).
   - Words written count a draft when it is newer than the current version.
   - Step 06 is done when every section is Final.
   - Generate section (E10.2): typed text is saved as a version first, then
     the server writes the section (or the rest of it) and streams the text.
     The editor is read only while it writes. The server saves the result:
     a full run is the new current version; Stop, a lost connection or a
     failure keeps the text so far as a partial version in Versions, which
     the writer can keep (a restore) or leave there. At or past the section's
     word target, Generate asks first (rule B). A run in another tab turns
     Generate off here. "[Verify: no source]" shows as a pill.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const MD = kdpMarkdown;
  const W = kdpWords;

  // Same limit as migration 0018 and supabase/functions/generate/lib/limits.ts.
  const MAX_CHARS = 100000;
  const IDLE_MS = 10 * 60 * 1000;   // 10 minutes idle with unsaved changes → a version (owner, E10)
  const STATUSES = [['not_started', 'Not started'], ['draft', 'Draft'], ['reviewed', 'Reviewed'], ['final', 'Final']];
  const RANK = { not_started: 0, draft: 1, reviewed: 2, final: 3 };
  // What a version's source says in the list (the AI sources arrive in E10.2 and E10.3).
  const SOURCE_NAME = { manual: 'Saved', generate: 'First draft', edit_format: 'Edited', improve: 'Improved', expand: 'Expanded',
    shorten: 'Shortened', humanize: 'Humanized', custom: 'Custom edit', restore: 'Restored' };
  // A run in another tab is fresh while its heartbeat is newer than 20 s and it started under 160 s ago (0020).
  const RUN_FRESH = { heartbeatMs: 20000, startedMs: 160000 };
  const STOP_WAIT_MS = 10000;          // Stop: wait this long for "saved", then read the run row
  const LOST_POLL_MS = 1000;           // a lost stream: read the run row every second…
  const LOST_POLL_TRIES = 15;          // …for at most 15 s
  const SPARKLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';

  const CHEVRON = (open) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
  const INFO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const TOOL = {
    bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>',
    italic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 5h-4M14 19h-4M14 5l-4 14"/></svg>',
    list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
    clear: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5h12M12 5l-3 14M4 20l16-16"/></svg>'
  };

  let ctx = null, book = null, saver = null, els = null;
  let load = { state: 'idle' };       // idle | loading | ready | error (the outline)
  let chapters = [];                  // outline_json rows in order
  let wantSection = null;             // ?section= from the first URL
  let cur = null;                     // the open section (see openSection)
  let sectionToken = 0;
  let open = new Set();               // chapter ids shown open in the manuscript list
  let tab = 'versions';               // versions | checks | brief
  let note = null;                    // { kind, text, retry } above the editor
  let idleTimer = null;
  let cmp = null;                     // the Compare dialog
  let ask = null;                     // the confirm dialog (rule B, leave while writing)
  /**
   * Generate (E10.2), one at a time:
   * { id, label, phase: 'saving' | 'writing' | 'stopping' | 'ended', runId, aim, target,
   *   text, done, saved, serverError, abort, recovered, outcome }.
   * outcome (phase 'ended'): what the card under the head shows until it is closed.
   */
  let gen = null;

  /* ── Values ──────────────────────────────── */

  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const str = (v) => (typeof v === 'string' ? v : '');
  const regular = () => chapters.filter((c) => c.kind === 'chapter');
  const allSections = () => chapters.flatMap((c) => (c.sections || []).map((s) => ({ c, s })));
  const findSection = (id) => allSections().find((x) => x.s.id === id) || null;
  const numberOf = (c) => regular().indexOf(c) + 1;
  // The server's has_writing (0019: non-blank versions or drafts) when it is there.
  const hasWriting = (s) => (typeof s.has_writing === 'boolean' ? s.has_writing : !!(s.current_version_id || s.has_draft));
  const anyWriting = () => allSections().some((x) => hasWriting(x.s));
  const gateOpen = () => !!book.outline_approved_at || anyWriting();

  /** Words written in a section: the draft when it is newer than the current version (owner, E10). */
  function sectionWords(s) {
    if (cur && cur.id === s.id && cur.state === 'ready') return W.count(cur.text);
    if (s.has_draft && (!s.version_at || (s.draft_at && s.draft_at > s.version_at))) return s.draft_words || 0;
    return s.words || 0;
  }

  /** "4.2 Shoulder rolls", "Introduction", "Conclusion". */
  function sectionLabel(c, s) {
    if (c.kind === 'intro') return 'Introduction';
    if (c.kind === 'conclusion') return 'Conclusion';
    const n = `${numberOf(c)}.${c.sections.indexOf(s) + 1}`;
    return `${n} ${str(s.title).trim() || 'Untitled section'}`;
  }

  const chapterLabel = (c) => `${numberOf(c)} · ${str(c.title).trim() || 'Untitled chapter'}`;

  /** A chapter's status: Final when all are, else the lowest; started work counts as Draft. */
  function chapterStatus(c) {
    const st = (c.sections || []).map((s) => s.status);
    if (!st.length) return 'not_started';
    const low = st.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
    if (low === 'not_started' && st.some((x) => x !== 'not_started')) return 'draft';
    return low;
  }

  function relTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 12) return `${hours} h ago`;
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** Blank text in a section with no version yet: nothing to save as a version. */
  const blankFirst = () => !!cur && !cur.base && !cur.text.trim();
  const versionName = (v) => ((v.source === 'restore' || v.source === 'generate') && v.label ? v.label : (SOURCE_NAME[v.source] || 'Saved'));
  const dirty = () => !!cur && cur.state === 'ready' && cur.text !== cur.savedText;
  const active = () => !!els && ctx.isActive(6);
  /** Generate is saving first, writing or stopping: the section is read only. */
  const genBusy = () => !!gen && gen.phase !== 'ended';
  const locked = () => !!cur && (!!cur.conflict || (genBusy() && gen.id === cur.id));

  /* ── Autosave: the draft ─────────────────── */

  function read() {
    if (!cur || cur.state !== 'ready' || cur.conflict) return undefined;
    if (cur.text.length > MAX_CHARS) return { error: `this section is too long. Keep it under ${fmt(MAX_CHARS)} characters.` };
    return { sectionId: cur.id, content: cur.text, base: cur.base };
  }

  async function save(fields) {
    const d = fields.draft;
    if (!d) return { data: {}, error: null };
    const res = await kdp.saveDraft(d.sectionId, d.content, d.base);
    if (res.error) return res;
    return { data: { ...res.data, sent: d }, error: null };
  }

  function onSaved(res) {
    const d = res.data.sent;
    if (!d) return;
    const hit = findSection(d.sectionId);
    if (hit) Object.assign(hit.s, { has_draft: true, has_writing: true, draft_words: W.count(d.content), draft_at: res.data.saved_at || new Date().toISOString() });
    if (cur && cur.id === d.sectionId) cur.hasDraft = true;
    ctx.refresh();
    if (active()) { renderManuscript(); renderFoot(); }
  }

  function onError(res) {
    const e = res.error || {};
    if (e.notFound || e.code === '42501' || e.code === '23503') {
      // The section is gone (deleted in 05) or no longer the caller's.
      saver.reset('error', 'This section is gone. The manuscript was reloaded.');
      loadOutline(true);
      return true;
    }
    return false;
  }

  /* ── Data ────────────────────────────────── */

  async function loadOutline(quiet) {
    if (!quiet || load.state !== 'ready') { load = { state: 'loading' }; if (active()) renderAll(); }
    let res;
    try { res = await kdp.getOutline(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      if (!quiet || load.state !== 'ready') load = { state: 'error' };
      if (active()) renderAll();
      return;
    }
    chapters = (res.data || []).map((c) => ({ ...c, sections: (c.sections || []).slice() }));
    load = { state: 'ready' };
    ctx.refresh();
    if (!active()) return;
    if (cur && !findSection(cur.id)) {
      note = { kind: 'warning', text: 'The section you had open was removed in 05 Outline. Your other writing is safe.' };
      cur = null;
    }
    if (!cur && gateOpen()) {
      const pick = firstSection();
      if (pick) { openSection(pick, { quiet: true }); return; }
    }
    renderAll();
  }

  /** ?section= when it exists, else the first section that is not Final, else the first. */
  function firstSection() {
    const list = allSections();
    if (!list.length) return null;
    if (wantSection && findSection(wantSection)) { const w = wantSection; wantSection = null; return w; }
    const notFinal = list.find((x) => x.s.status !== 'final');
    return (notFinal || list[0]).s.id;
  }

  /**
   * Opens a section: its current version and its draft. A draft from the
   * current version (or with the same text) is shown as unsaved changes; a
   * draft from another version is a conflict (another tab saved).
   */
  async function openSection(id, opts = {}) {
    const token = ++sectionToken;
    clearIdle();
    if (gen && gen.id !== id && !genBusy()) gen = null;   // an old section's result card
    const hit = findSection(id);
    if (hit) open.add(hit.c.id);
    cur = { id, state: 'loading', versions: null, versionsState: 'idle' };
    if (!opts.keepNote) note = null;
    if (active()) {
      renderAll();
      history.replaceState(history.state, '', `?id=${encodeURIComponent(book.id)}&step=6&section=${encodeURIComponent(id)}`);
    }
    let res;
    try { res = await kdp.getSectionText(id); } catch (err) { res = { error: err }; }
    if (token !== sectionToken) return;
    if (res.error) {
      if (res.error.notFound) { cur = null; note = { kind: 'warning', text: 'This section was removed in 05 Outline.' }; loadOutline(true); return; }
      cur.state = 'error';
      if (active()) renderAll();
      return;
    }
    const { version, draft } = res.data;
    const savedText = version ? version.content : '';
    const base = version ? version.id : null;
    Object.assign(cur, { state: 'ready', version, savedText, base, text: savedText, hasDraft: !!draft, conflict: null, otherRun: false });
    if (draft) {
      if ((draft.base_version_id || null) === base || draft.content === savedText) cur.text = draft.content;
      else {
        // Shown read only until the writer chooses; nothing is sent meanwhile.
        cur.conflict = { content: draft.content, base: draft.base_version_id || null, at: draft.saved_at };
        cur.text = draft.content;
      }
    }
    if (hit) Object.assign(hit.s, { current_version_id: base, words: version ? version.word_count : 0, version_at: version ? version.created_at : null });
    if (active()) renderAll();
    loadVersions();
    loadRun();
    if (dirty()) armIdle();
  }

  async function loadVersions() {
    if (!cur || cur.state !== 'ready') return;
    const id = cur.id;
    cur.versionsState = 'loading';
    if (active()) renderSide();
    let res;
    try { res = await kdp.getVersions(id); } catch (err) { res = { error: err }; }
    if (!cur || cur.id !== id) return;
    if (res.error) cur.versionsState = 'error';
    else { cur.versions = res.data; cur.versionsState = 'ready'; }
    if (active()) renderSide();
  }

  /* ── Versions ────────────────────────────── */

  function clearIdle() { clearTimeout(idleTimer); idleTimer = null; }
  function armIdle() {
    clearIdle();
    idleTimer = setTimeout(() => { if (dirty()) makeVersion('idle'); }, IDLE_MS);
  }

  /**
   * Saves the text as a new manual version, after the draft is saved. Resolves
   * true when nothing typed is left only in the browser (saved as a version,
   * or at least as a draft), false when the text could not be saved at all.
   */
  async function makeVersion(reason) {
    if (!cur || cur.state !== 'ready' || cur.conflict) return true;
    if (cur.saving) return cur.saving;
    const run = (async () => {
      clearIdle();
      if (saver.hasUnsaved()) await saver.flush();
      const draftOk = !(saver.state === 'error' && saver.hasUnsaved());
      // Only real changes become a version: never the same text as the current
      // version, and never a blank first version (a typed-and-deleted character
      // once saved an empty v1 on leave; 0019 refuses it on the server too).
      if (!dirty() || blankFirst()) return true;
      const sent = cur.text;
      const id = cur.id;
      let res;
      try { res = await kdp.saveVersion(id, sent, cur.base); } catch (err) { res = { error: err }; }
      if (!cur || cur.id !== id) return true;
      if (res.error) {
        const m = res.error.message;
        if (m === 'version_conflict') {
          // Another tab saved. The text on screen stays; the choice shows once (the conflict card).
          await adoptRemote(id, null);
          return draftOk;
        }
        if (m === 'section_too_long') note = { kind: 'error', text: `This section is too long to save. Keep it under ${fmt(MAX_CHARS)} characters.` };
        else if (res.error.notFound || res.error.code === 'P0002') { loadOutline(true); return draftOk; }
        else note = { kind: 'error', text: draftOk ? 'We couldn’t save a version. Your text is kept as a draft.' : 'We couldn’t save your text. Check your connection.', retry: 'version' };
        if (active()) renderNotes();
        return draftOk;
      }
      const v = res.data;
      cur.base = v.id;
      cur.savedText = sent;
      cur.hasDraft = false;
      cur.version = { id: v.id, version_no: v.version_no, word_count: v.word_count, created_at: v.created_at, content: sent };
      const hit = findSection(id);
      if (hit) {
        Object.assign(hit.s, { current_version_id: v.id, has_writing: true, has_draft: false, draft_words: null, draft_at: null, words: v.word_count, version_at: v.created_at });
        if (hit.s.status === 'not_started') hit.s.status = 'draft';
      }
      if (note && note.retry === 'version') note = null;
      // Typed while saving: the server deleted the draft, so send it again from the new version.
      // Otherwise the version holds the text: a draft save still waiting (after an error) is dropped,
      // or it would come back later as a draft from an old version.
      if (cur.text !== sent) saver.edit('draft', 0);
      else if (saver.hasUnsaved() || saver.state === 'error') saver.reset('saved');
      ctx.refresh();
      if (active()) {
        renderManuscript(); renderHead(); renderNotes(); renderFoot();
        if (v.created && reason === 'button') announce(`Saved as version ${v.version_no}.`);
      }
      if (v.created) loadVersions();
      return true;
    })();
    cur.saving = run;
    try { return await run; } finally { if (cur) cur.saving = null; }
  }

  async function restore(versionId) {
    if (!cur || cur.state !== 'ready' || cur.conflict || genBusy()) return;
    const ok = await makeVersion('restore');
    if (!ok) return;
    const id = cur.id;
    cur.busy = 'restore';
    renderFoot();
    let res;
    try { res = await kdp.restoreVersion(id, versionId, cur.base); } catch (err) { res = { error: err }; }
    if (!cur || cur.id !== id) return;
    cur.busy = '';
    if (res.error) {
      if (res.error.message === 'version_conflict') {
        await adoptRemote(id, null);
        return;
      } else {
        note = { kind: 'error', text: 'We couldn’t restore that version. Nothing changed.', retry: null };
      }
      if (active()) renderNotes();
      return;
    }
    const from = (cur.versions || []).find((v) => v.id === versionId);
    await openSection(id, { keepNote: false });
    announce(`Restored ${from ? `v${from.version_no}` : 'the version'} as version ${res.data.version_no}.`);
  }

  /**
   * Another tab saved a newer version (seen on save, restore, or when this tab
   * gets focus again). Nothing on screen is lost: with no typing of our own
   * the newest text simply loads; otherwise our text is kept (as a draft on
   * the server when it can be saved) and the conflict card asks which to keep.
   * serverBase: the server's current version id, or null to read it now.
   */
  async function adoptRemote(id, serverBase) {
    if (!cur || cur.id !== id || cur.state !== 'ready' || cur.conflict) return;
    if (!dirty() && !cur.hasDraft && !saver.hasUnsaved()) {
      await openSection(id, { keepNote: true });
      announce('This section was updated in another tab. The newest text is shown.');
      return;
    }
    let base = serverBase;
    if (base === null) {
      let head;
      try { head = await kdp.getSectionHead(id); } catch (err) { head = { error: err }; }
      if (head.error || !head.data) { note = { kind: 'error', text: 'This section was saved in another tab, and we couldn’t read it. Your text is still here. Try again in a moment.' }; renderNotes(); return; }
      base = head.data.current_version_id || null;
    }
    // Our typing goes to the server first, still from our old version, so a reload shows the same choice.
    if (saver.hasUnsaved()) await saver.flush();
    if (!cur || cur.id !== id) return;
    clearIdle();
    cur.conflict = { content: cur.text, base: cur.base, at: new Date().toISOString() };
    cur.base = base;
    if (note && note.retry === 'version') note = null;
    if (active()) { renderMainShell(); renderSide(); }
    loadVersions();
  }

  let remoteCheck = false;
  /** On focus: did another tab save a newer version of the open section? */
  async function checkRemote() {
    if (!active() || remoteCheck || !cur || cur.state !== 'ready' || cur.conflict || cur.busy || cur.saving || genBusy()) return;
    const id = cur.id;
    remoteCheck = true;
    try {
      let head;
      try { head = await kdp.getSectionHead(id); } catch (err) { return; }
      if (head.error || !head.data || !cur || cur.id !== id || cur.saving || cur.conflict) return;
      const server = head.data.current_version_id || null;
      if (server !== (cur.base || null)) await adoptRemote(id, server);
      if (!genBusy()) loadRun();
    } finally {
      remoteCheck = false;
    }
  }

  /** "Use my draft" or "Keep saved version" after another tab saved. */
  async function resolveConflict(useDraft) {
    if (!cur || !cur.conflict) return;
    const id = cur.id;
    cur.busy = 'conflict';
    renderNotes();
    let res;
    try {
      res = useDraft
        ? await kdp.saveVersion(id, cur.conflict.content, cur.base)
        : await kdp.saveVersion(id, cur.conflict.content, null, false);
    } catch (err) { res = { error: err }; }
    if (!cur || cur.id !== id) return;
    cur.busy = '';
    if (res.error) {
      note = { kind: 'error', text: res.error.message === 'version_conflict'
        ? 'This section was saved again in another tab. Reload to see it.'
        : 'We couldn’t save your choice. Your draft is still kept.' };
      if (active()) renderNotes();
      return;
    }
    const msg = useDraft ? `Your draft is now version ${res.data.version_no}.` : `Your draft was kept as version ${res.data.version_no}. The saved text stays current.`;
    await loadOutline(true);
    await openSection(id);
    announce(msg);
  }

  async function setStatus(value) {
    if (!cur || cur.state !== 'ready' || locked()) return;
    const hit = findSection(cur.id);
    if (!hit || hit.s.status === value) return;
    const before = hit.s.status;
    hit.s.status = value;
    ctx.refresh();
    renderManuscript();
    let res;
    try { res = await kdp.updateSection(hit.s.id, { status: value }); } catch (err) { res = { error: err }; }
    if (res.error) {
      hit.s.status = before;
      note = { kind: 'error', text: 'We couldn’t save the status. Try again.' };
      ctx.refresh();
      if (active()) { renderManuscript(); renderHead(); renderNotes(); }
      return;
    }
    if (res.data && res.data.updated_at) book.updated_at = res.data.updated_at;
    ctx.refresh();
  }

  /** Leaving the section: a version first. Stays when the text could not be saved at all. */
  async function selectSection(id) {
    if (cur && cur.id === id && cur.state === 'ready') return;
    if (!(await confirmLeave())) return;
    const ok = await makeVersion('leave');
    if (!ok) {
      note = { kind: 'error', text: 'Your text is not saved yet. Use Retry next to “Couldn’t save”, then open another section.' };
      renderNotes();
      return;
    }
    await openSection(id);
    const h = els && els.root.querySelector('[data-sec-title]');
    if (h) h.focus();
  }

  /* ── Generate (E10.2) ────────────────────── */

  const runFresh = (r) => r.state === 'running'
    && Date.now() - Date.parse(r.heartbeat_at) < RUN_FRESH.heartbeatMs
    && Date.now() - Date.parse(r.started_at) < RUN_FRESH.startedMs;

  /** The section's last run: a fresh one from another tab turns Generate off here. */
  async function loadRun() {
    if (!cur || cur.state !== 'ready') return;
    const id = cur.id;
    let res;
    try { res = await kdp.getSectionRun(id); } catch (err) { return; }
    if (!cur || cur.id !== id || res.error) return;
    const r = res.data;
    const mine = !!(gen && gen.runId && r && r.run_id === gen.runId);
    cur.otherRun = !!r && !mine && runFresh(r);
    if (active()) { renderHead(); renderGen(); }
  }

  const posLocked = () => !!(one(book.positioning) || {}).locked_at;

  /** Why Generate is off for the open section, or '' when it can run. */
  function genBlock() {
    if (!cur || cur.state !== 'ready') return 'loading';
    if (genBusy()) return 'busy';
    if (cur.conflict) return 'conflict';
    if (cur.busy || cur.saving) return 'busy';
    if (!posLocked()) return 'positioning';
    if (cur.otherRun) return 'other_tab';
    return '';
  }

  /** Section words and target, for rule B and the progress line. */
  function targetOf() {
    const hit = cur && findSection(cur.id);
    return hit && hit.s.word_target > 0 ? hit.s.word_target : null;
  }

  /**
   * Generate section. more: the writer said "Write more anyway" (rule B).
   * Typed text becomes a version first (0019 rules), so the server writes
   * from what is on screen and nothing typed is lost.
   */
  async function generate(more) {
    if (genBlock()) return;
    const id = cur.id;
    const hit = findSection(id);
    const target = targetOf();
    const have = W.count(cur.text);
    if (!more && target && have >= target) {
      if (await confirmMore(have, target)) generate(true);
      return;
    }
    gen = { id, label: hit ? sectionLabel(hit.c, hit.s) : '', phase: 'saving', runId: null, aim: null, target, text: '', done: null, saved: null, serverError: null, abort: null, recovered: null, outcome: null, stopTimer: null };
    clearIdle();
    renderGenShell();
    announce('Saving your text first.');
    const ok = await makeVersion('generate');
    if (!gen || gen.id !== id) return;
    if (!ok || !cur || cur.id !== id || cur.conflict || (note && note.retry === 'version')) {
      // The save failed or another tab saved: its own message shows; nothing is sent.
      gen = null;
      if (active()) renderGenShell();
      return;
    }
    gen.phase = 'writing';
    gen.abort = new AbortController();
    renderGenShell();
    announce(`Writing ${gen.label}.`);
    const input = { stage: 'section_write', bookId: book.id, sectionId: id, baseVersionId: cur.base || null };
    if (more) input.more = true;
    let res;
    try {
      res = await kdp.generateStream(input, { onEvent: onGenEvent, signal: gen.abort.signal });
    } catch (err) {
      res = { error: { code: 'network', streamed: false } };
    }
    if (!gen || gen.id !== id) return;
    clearTimeout(gen.stopTimer);
    await endGen(res);
  }

  function onGenEvent(e) {
    if (!gen || gen.phase === 'ended') return;
    const d = e.data || {};
    if (e.event === 'start') {
      gen.runId = d.runId || null;
      gen.aim = Number.isInteger(d.aim) ? d.aim : null;
      gen.target = Number.isInteger(d.target) ? d.target : gen.target;
      gen.recovered = d.recovered && Number.isInteger(d.recovered.versionNo) ? d.recovered.versionNo : null;
      renderGen();
    } else if (e.event === 'text' && typeof d.t === 'string') {
      // Stopping: no more text is shown (the server keeps what it had).
      if (gen.phase !== 'writing') return;
      gen.text += d.t;
      renderStream();
    } else if (e.event === 'done') gen.done = d;
    else if (e.event === 'saved') gen.saved = d;
    else if (e.event === 'error') gen.serverError = typeof d.error === 'string' ? d.error : 'server_error';
  }

  /** Stop: ask the server (not an AI call); it saves the text so far. */
  async function stopGen() {
    if (!gen || gen.phase !== 'writing') return;
    gen.phase = 'stopping';
    renderGen();
    renderStream();
    announce('Stopping and saving.');
    const g = gen;
    // No "saved" in time: close the stream (the server treats it like Stop) and read the run row.
    g.stopTimer = setTimeout(() => { if (g.abort) g.abort.abort(); }, STOP_WAIT_MS);
    if (!g.runId) { g.abort.abort(); return; }
    let res;
    try { res = await kdp.requestSectionStop(g.runId); } catch (err) { res = { error: err }; }
    if (res.error && g.abort) g.abort.abort();
  }

  /** After the stream: what happened, from the server's events (or the run row when the stream was lost). */
  async function endGen(res) {
    const g = gen;
    const id = g.id;
    if (!g.runId && res.error && res.error.code === 'aborted') {
      // Stopped before the server said which run this is: it may have started, and it saves
      // whatever it wrote. Without the run id the row can't be told from an older run's.
      g.phase = 'ended';
      g.outcome = { kind: 'lost_unknown' };
      return afterRun(g);
    }
    if (res.error && !res.error.streamed && !g.runId) {
      // Refused before any AI call: nothing was written or counted.
      g.phase = 'ended';
      return refused(res.error);
    }
    if (!g.saved && !g.serverError) {
      // The stream broke or was closed. The run goes on on the server: read its row.
      g.phase = 'stopping';
      renderGen();
      const run = g.runId ? await pollRun(id, g.runId) : null;
      if (!gen || gen !== g) return;
      g.phase = 'ended';
      if (run && run.state === 'ended') {
        const counted = run.end_reason === 'user_stop' || run.end_reason === 'disconnect';
        g.outcome = { kind: run.version_id ? 'lost_saved' : 'lost_none', counted, reason: run.end_reason };
        if (run.version_id && run.end_reason === 'complete') g.outcome.kind = 'lost_complete';
      } else g.outcome = { kind: 'lost_unknown' };
      return afterRun(g);
    }
    g.phase = 'ended';
    if (g.serverError) {
      g.outcome = { kind: g.serverError === 'save_failed' ? 'save_failed' : 'interrupted' };
      return afterRun(g);
    }
    const done = g.done || { reason: 'ai_error' };
    const sv = g.saved;
    const words = Number.isInteger(sv.words) ? sv.words : W.count(g.text);
    if (done.reason === 'complete') {
      g.outcome = sv.conflict || !sv.current
        ? { kind: 'conflict', versionNo: sv.versionNo }
        : { kind: 'done', versionNo: sv.versionNo, flagged: sv.flagged || 0 };
    } else if (done.reason === 'user_stop' || done.reason === 'disconnect') {
      g.outcome = { kind: 'stopped', versionId: sv.versionId, versionNo: sv.versionNo, words };
    } else {
      g.outcome = { kind: 'failed', reason: done.reason, versionId: sv.versionId, versionNo: sv.versionNo, words };
    }
    return afterRun(g);
  }

  /** Reads the run row until it has ended (the server saves after a lost stream). */
  async function pollRun(id, runId) {
    for (let i = 0; i < LOST_POLL_TRIES; i++) {
      await new Promise((r) => setTimeout(r, LOST_POLL_MS));
      let res;
      try { res = await kdp.getSectionRun(id); } catch (err) { continue; }
      if (res.error || !res.data) continue;
      if (res.data.run_id !== runId) return null;
      if (res.data.state === 'ended') return res.data;
    }
    return null;
  }

  /** The section after a run: the new current text when there is one, the versions, the card. */
  async function afterRun(g) {
    const id = g.id;
    const o = g.outcome;
    const hit = findSection(id);
    const newCurrent = o.kind === 'done' || o.kind === 'lost_complete';
    if (newCurrent && hit && hit.s.status === 'not_started') hit.s.status = 'draft';
    if (newCurrent || (o.kind !== 'save_failed' && o.kind !== 'lost_unknown')) {
      if (hit) Object.assign(hit.s, { has_writing: true });
    }
    if (!cur || cur.id !== id) { gen = null; return; }
    if (newCurrent) {
      await openSection(id, { keepNote: true });
      if (!gen || gen !== g) return;
    } else {
      loadVersions();
    }
    ctx.refresh();
    if (active()) { renderManuscript(); renderMainShell(); renderSide(); }
    announce(outcomeText(o).replace(/<[^>]+>/g, ''));
    const focus = els && els.main.querySelector('[data-gen] [data-gen-focus]');
    if (focus) focus.focus();
  }

  /** A refusal before the stream: a message (and the right next step). */
  async function refused(err) {
    const code = err.code;
    const id = gen.id;
    if (code === 'target_reached') {
      gen = null;
      renderGenShell();
      if (await confirmMore(err.words || 0, err.target || targetOf() || 0)) generate(true);
      return;
    }
    if (code === 'version_conflict') { gen = null; renderGenShell(); await adoptRemote(id, null); return; }
    if (code === 'run_in_progress') { gen = null; if (cur && cur.id === id) cur.otherRun = true; renderGenShell(); return; }
    if (code === 'not_found') { gen = null; loadOutline(true); return; }
    if (code === 'unsaved_draft') { gen = null; await openSection(id, { keepNote: true }); note = { kind: 'warning', text: 'This section has typing that is not saved as a version yet, maybe from another tab. Save it as a version, then generate.' }; renderNotes(); return; }
    gen.outcome = { kind: 'refused', code };
    renderGenShell();
    announce(outcomeText(gen.outcome).replace(/<[^>]+>/g, ''));
  }

  /** Keep partial text: a restore of the partial version (0018, label "Kept partial text from vN"). */
  async function keepPartial() {
    if (!gen || !gen.outcome || !gen.outcome.versionId || !cur || cur.id !== gen.id) return;
    const o = gen.outcome;
    o.busy = true;
    renderGen();
    let res;
    try { res = await kdp.restoreVersion(cur.id, o.versionId, cur.base); } catch (err) { res = { error: err }; }
    if (!cur || !gen || gen.outcome !== o) return;
    o.busy = false;
    if (res.error) {
      if (res.error.message === 'version_conflict') { gen = null; await adoptRemote(cur.id, null); return; }
      o.error = 'We couldn’t keep the partial text. It is still in Versions.';
      renderGen();
      return;
    }
    gen = null;
    const hit = findSection(cur.id);
    if (hit && hit.s.status === 'not_started') hit.s.status = 'draft';
    await openSection(cur.id, { keepNote: true });
    announce(`Kept the partial text from v${o.versionNo}. It is now version ${res.data.version_no}.`);
  }

  /** Discard: nothing is written. The partial stays in Versions. */
  function discardPartial() {
    gen = null;
    renderGenShell();
    announce('The partial text stays in Versions. Your section did not change.');
    const b = els && els.main.querySelector('[data-generate]');
    if (b && !b.disabled) b.focus();
  }

  async function copyGenText() {
    if (!gen) return;
    const box = els && els.main.querySelector('[data-stream]');
    let ok = false;
    try { await navigator.clipboard.writeText(gen.text); ok = true; } catch (err) {
      // No clipboard permission: select the text so the writer can copy it.
      if (box) { const r = document.createRange(); r.selectNodeContents(box); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
    announce(ok ? 'The text is copied.' : 'The text is selected. Press Ctrl+C to copy it.');
  }

  /** A small confirm dialog. Resolves true for the main button. */
  function confirmDialog({ title, text, ok, cancel }) {
    if (!ask) {
      const d = document.createElement('dialog');
      d.className = 'dialog dialog-sm';
      d.setAttribute('aria-labelledby', 'wrAskTitle');
      d.innerHTML = `
        <div class="dialog-inner">
          <div class="dialog-head"><h2 id="wrAskTitle"></h2><p data-ask-text></p></div>
          <div class="dialog-foot">
            <button type="button" class="btn btn-secondary" data-ask-no></button>
            <button type="button" class="btn btn-primary" data-ask-yes></button>
          </div>
        </div>`;
      document.body.append(d);
      ask = { d, resolve: null, back: null };
      const finish = (v) => { const r = ask.resolve; ask.resolve = null; if (d.open) d.close(); if (r) r(v); };
      d.querySelector('[data-ask-yes]').addEventListener('click', () => finish(true));
      d.querySelector('[data-ask-no]').addEventListener('click', () => finish(false));
      d.addEventListener('close', () => {
        if (ask.resolve) { const r = ask.resolve; ask.resolve = null; r(false); }
        if (ask.back && document.contains(ask.back)) ask.back.focus();
      });
    }
    ask.d.querySelector('#wrAskTitle').textContent = title;
    ask.d.querySelector('[data-ask-text]').textContent = text;
    ask.d.querySelector('[data-ask-yes]').textContent = ok;
    ask.d.querySelector('[data-ask-no]').textContent = cancel;
    ask.back = document.activeElement;
    return new Promise((resolve) => {
      ask.resolve = resolve;
      ask.d.showModal();
      ask.d.querySelector('[data-ask-no]').focus();
    });
  }

  /** Rule B (owner, E10.2): at or past the target, ask before writing more. */
  const confirmMore = (have, target) => confirmDialog({
    title: 'Write more anyway?',
    text: `This section has ${fmt(have)} of ${fmt(target)} words. Write more anyway?`,
    ok: 'Write more', cancel: 'Cancel'
  });

  /**
   * Leaving the section, the step or the page while the AI writes: ask first.
   * Stop and leave waits for the save (at most STOP_WAIT_MS and the poll).
   */
  async function confirmLeave() {
    if (!genBusy()) return true;
    if (gen.phase === 'saving') return false;
    const yes = await confirmDialog({
      title: 'Writing is in progress',
      text: 'Stop and leave? The text written so far is saved in Versions.',
      ok: 'Stop and leave', cancel: 'Keep writing'
    });
    if (!yes) return false;
    const g = gen;
    if (g.phase === 'writing') stopGen();
    await new Promise((resolve) => {
      const wait = () => (!gen || gen !== g || g.phase === 'ended' ? resolve() : setTimeout(wait, 100));
      wait();
    });
    return true;
  }

  /** The card's text for an outcome (HTML; the numbers come from the server). */
  function outcomeText(o) {
    const v = (n) => (Number.isInteger(n) ? `v${n}` : 'a new version');
    const w = (n) => `${fmt(n)} word${n === 1 ? '' : 's'}`;
    const are = (n) => (n === 1 ? 'is' : 'are');
    switch (o.kind) {
      case 'done': return o.flagged
        ? `Saved as ${v(o.versionNo)}. ${o.flagged === 1 ? '1 claim needs' : `${o.flagged} claims need`} a source. Check the marked sentences.`
        : `Saved as ${v(o.versionNo)}.`;
      case 'conflict': return `This section was saved in another tab while the AI was writing. The new text is saved in Versions as ${v(o.versionNo)}.`;
      case 'stopped': return o.versionId
        ? `Writing stopped. The ${w(o.words)} written so far ${are(o.words)} saved in Versions as ${v(o.versionNo)}. They are not in your section yet. The tokens used so far count toward your usage.`
        : 'Writing stopped before any text. Nothing was saved. The tokens used so far count toward your usage.';
      case 'failed': return o.versionId
        ? `Your text and versions are safe. This attempt was not counted in your usage. The ${w(o.words)} written so far ${are(o.words)} saved in Versions as ${v(o.versionNo)}.`
        : 'Your text and versions are safe. This attempt was not counted in your usage. Nothing was written.';
      case 'save_failed': return 'We couldn’t save the new text. Nothing was counted. The text is below. Copy it if you want to keep it.';
      case 'interrupted': return 'Writing was interrupted on the server. The text so far is saved in Versions.';
      case 'lost_complete': return 'The connection was lost, but the AI finished. The new text is your current version.';
      case 'lost_saved': return `The connection was lost. The text written so far is saved in Versions.${o.counted ? ' The tokens used so far count toward your usage.' : ' This attempt was not counted.'}`;
      case 'lost_none': return 'The connection was lost before any text. Nothing was saved.';
      case 'lost_unknown': return 'The connection was lost. Anything the AI wrote will be in Versions in a minute. Check again soon.';
      case 'refused': return refusedText(o.code);
      default: return '';
    }
  }

  function refusedText(code) {
    switch (code) {
      case 'positioning_not_locked': return 'Lock the positioning in 03 to generate.';
      case 'outline_not_approved': return 'Approve the outline in 05 to generate.';
      case 'not_enough_facts': return 'The Brief needs a topic before the AI can write. Fill it in 01 Brief.';
      case 'section_too_long': return `This section is close to the ${fmt(MAX_CHARS)} character limit. Shorten it or split it before you generate more.`;
      case 'unauthorized': return 'Your session ended. Sign in again, then try again.';
      case 'ai_unavailable': return 'The AI service did not answer. This try was not counted. Try again in a moment.';
      default: return kdpUi.aiMessage(code)[1];
    }
  }

  /** The failure line of design 23. */
  function failLine(reason) {
    switch (reason) {
      case 'timeout': return 'The AI service did not respond in time.';
      case 'max_tokens': return 'The AI reached the most it can write in one go.';
      case 'too_long': return 'The section reached its length limit.';
      case 'refusal': return 'The AI declined to write this section.';
      default: return 'The AI service stopped.';
    }
  }

  /** The Generate slot: the running panel (design 23 Generating), a result card, or why Generate is off. */
  function renderGen() {
    const box = els && els.main.querySelector('[data-gen]');
    if (!box || !cur) return;
    const mine = gen && gen.id === cur.id;
    if (mine && gen.phase !== 'ended') { box.innerHTML = runningHtml(); return; }
    if (mine && gen.outcome) { box.innerHTML = outcomeHtml(gen.outcome); return; }
    const why = genBlock();
    if (why === 'positioning') box.innerHTML = `<p class="help-note wr-note">${INFO}<span>Generate section needs the positioning locked. <a href="?id=${encodeURIComponent(book.id)}&step=3" data-go-step="3">Lock it in 03</a>.</span></p>`;
    else if (why === 'other_tab') box.innerHTML = `<p class="help-note wr-note" role="status">${INFO}<span>This section is being written in another tab or window. <button type="button" class="link-btn" data-run-check>Check again</button></span></p>`;
    else box.innerHTML = '';
  }

  function runningHtml() {
    const n = W.count(gen.text);
    const goal = gen.aim;
    const pct = goal ? Math.min(100, Math.round((n / goal) * 100)) : 0;
    const stopping = gen.phase === 'stopping';
    const title = gen.phase === 'saving' ? 'Saving your text first…' : stopping ? 'Stopping and saving…' : `Writing ${esc(gen.label)}`;
    const count = goal ? `≈ ${fmt(n)} / ${fmt(goal)} words` : `≈ ${fmt(n)} words`;
    return `<section class="wr-gen" aria-labelledby="wrGenTitle">
        <div class="chip-label">GENERATING</div>
        <h3 id="wrGenTitle">${title}</h3>
        ${gen.recovered ? `<p class="wr-gen-meta">Text from an earlier try that stopped is saved in Versions as v${gen.recovered}.</p>` : ''}
        <div class="wr-gen-row">
          ${goal ? `<span class="wr-bar wr-gen-bar" aria-hidden="true"><span style="width: ${pct}%"></span></span>` : ''}
          <span class="wr-gen-count" data-gen-count>${count}</span>
        </div>
        ${gen.phase === 'saving' ? '' : `<button type="button" class="btn btn-secondary wr-gen-stop" data-gen-stop${stopping ? ' disabled' : ''}>${stopping ? 'Stopping…' : 'Stop'}</button>`}
      </section>`;
  }

  function outcomeHtml(o) {
    const text = outcomeText(o);
    const close = '<button type="button" class="link-btn" data-gen-close data-gen-focus>Close</button>';
    if (o.kind === 'done') {
      if (!o.flagged) return '';
      return `<div class="alert alert-warning wr-note" role="status">${ICON.warn(16)}<div><p class="alert-text">${text}</p><p class="alert-text">${close}</p></div></div>`;
    }
    if (o.kind === 'stopped' && o.versionId) {
      return `<div class="wr-out" role="status"><p>${text}</p>
          ${o.error ? `<p class="wr-out-err">${ICON.warn(14)}${esc(o.error)}</p>` : ''}
          <div class="wr-note-actions">
            <button type="button" class="btn btn-primary btn-sm" data-gen-keep data-gen-focus${o.busy ? ' disabled' : ''}>Keep partial text</button>
            <button type="button" class="btn btn-secondary btn-sm" data-gen-discard${o.busy ? ' disabled' : ''}>Discard</button>
          </div></div>`;
    }
    if (o.kind === 'failed') {
      return `<section class="wr-out" aria-labelledby="wrFailTitle">
          <div class="chip-label wr-out-label">${ICON.x(12)}FAILED</div>
          <h3 id="wrFailTitle">Generation stopped</h3>
          <div class="alert alert-error" role="alert">${ICON.x(16)}<p class="alert-text"><strong>${esc(failLine(o.reason))}</strong> ${text}</p></div>
          ${o.error ? `<p class="wr-out-err">${ICON.warn(14)}${esc(o.error)}</p>` : ''}
          <div class="wr-note-actions">
            <button type="button" class="btn btn-primary btn-sm" data-gen-retry data-gen-focus${genBlock() ? ' disabled' : ''}>Try again</button>
            ${o.versionId ? `<button type="button" class="btn btn-secondary btn-sm" data-gen-keep${o.busy ? ' disabled' : ''}>Keep partial text</button>
            <button type="button" class="link-btn" data-gen-discard>Discard</button>` : ''}
          </div></section>`;
    }
    if (o.kind === 'save_failed') {
      return `<div class="alert alert-error wr-note" role="alert">${ICON.warn(16)}<div><p class="alert-text">${text}</p>
          <div class="wr-note-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-gen-copy data-gen-focus>Copy text</button>
            <button type="button" class="btn btn-secondary btn-sm" data-gen-retry${genBlock() ? ' disabled' : ''}>Try again</button>
            <button type="button" class="link-btn" data-gen-close>Close</button>
          </div></div></div>`;
    }
    const warn = o.kind === 'refused' && !['positioning_not_locked', 'outline_not_approved', 'not_enough_facts', 'section_too_long'].includes(o.code);
    const retry = o.kind === 'refused' ? (warn && !['monthly_limit', 'unauthorized'].includes(o.code)) : o.kind !== 'lost_complete';
    const cls = o.kind === 'refused' && !warn ? 'alert-warning' : (o.kind === 'conflict' || o.kind === 'stopped' || o.kind.startsWith('lost') || o.kind === 'interrupted') ? 'alert-warning' : 'alert-error';
    return `<div class="alert ${cls} wr-note" role="${cls === 'alert-error' ? 'alert' : 'status'}">${ICON.warn(16)}<div><p class="alert-text">${text}</p>
        <p class="alert-text">${retry ? `<button type="button" class="link-btn" data-gen-retry${genBlock() ? ' disabled' : ''}>Try again</button> · ` : ''}${close}</p></div></div>`;
  }

  /** The streamed text under the section's text, with a cursor (read only). Kept after a failed save. */
  function renderStream() {
    const box = els && els.main.querySelector('[data-stream]');
    if (!box || !cur) return;
    const mine = gen && gen.id === cur.id;
    const show = mine && (gen.phase === 'writing' || gen.phase === 'stopping' || (gen.outcome && gen.outcome.kind === 'save_failed'));
    box.hidden = !show || (!gen.text && gen.phase !== 'writing');
    if (box.hidden) { box.innerHTML = ''; return; }
    // Follow the new text while the writer is at the bottom; never pull them back when they scrolled up.
    const card = box.closest('.wr-card');
    const follow = !!card && card.scrollHeight - card.scrollTop - card.clientHeight < 80;
    const keptLabel = gen.outcome && gen.outcome.kind === 'save_failed' ? '<div class="chip-label wr-stream-label">NEW TEXT · NOT SAVED</div>' : '';
    box.innerHTML = keptLabel + MD.toHtml(gen.text) + (gen.phase === 'writing' ? '<span class="wr-cursor" aria-hidden="true"></span>' : '');
    if (follow && gen.phase === 'writing') card.scrollTop = card.scrollHeight;
    const count = els.main.querySelector('[data-gen-count]');
    if (count && gen.phase === 'writing') {
      const n = W.count(gen.text);
      count.textContent = gen.aim ? `≈ ${fmt(n)} / ${fmt(gen.aim)} words` : `≈ ${fmt(n)} words`;
      const bar = els.main.querySelector('.wr-gen-bar span');
      if (bar && gen.aim) bar.style.width = `${Math.min(100, Math.round((n / gen.aim) * 100))}%`;
    }
  }

  /** Phase changes: the editor's read-only state, the head, the foot and the panels. */
  function renderGenShell() {
    if (!active() || !cur || cur.state !== 'ready') return;
    renderMainShell();
    renderSide();
  }

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    root.innerHTML = `
      <div class="wr">
        <nav class="wr-ms" aria-label="Manuscript" data-ms></nav>
        <div class="wr-main" data-main></div>
        <aside class="wr-side" aria-label="Versions, checks and Brief" data-side></aside>
        <p class="sr-only" aria-live="polite" data-live></p>
      </div>`;
    els = {
      root,
      ms: root.querySelector('[data-ms]'),
      main: root.querySelector('[data-main]'),
      side: root.querySelector('[data-side]'),
      live: root.querySelector('[data-live]')
    };
    bind(root.querySelector('.wr'));
    if (load.state === 'idle' || load.state === 'error') { loadOutline(); return; }
    renderAll();
    if (load.state !== 'ready') return;
    // Back from another step: the outline may have changed there (05 edits, an unlock in 03).
    loadOutline(true).then(() => {
      if (active() && cur && cur.state === 'ready' && !dirty() && !saver.hasUnsaved()) openSection(cur.id, { keepNote: true });
    });
  }

  function announce(text) {
    if (els) els.live.textContent = text;
  }

  function renderAll() {
    if (!els) return;
    const wr = els.root.querySelector('.wr');
    if (load.state !== 'ready') {
      wr.classList.add('is-single');
      els.ms.innerHTML = '';
      els.side.innerHTML = '';
      els.main.innerHTML = load.state === 'error'
        ? `<div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn’t load the manuscript.</p><p class="alert-text"><button type="button" class="link-btn" data-retry-load>Try again</button></p></div></div>`
        : `<div class="wr-skel" aria-hidden="true"><div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div><p class="sr-only" role="status">Loading the manuscript…</p>`;
      return;
    }
    if (!gateOpen()) {
      wr.classList.add('is-single');
      els.ms.innerHTML = '';
      els.side.innerHTML = '';
      const none = !regular().length;
      els.main.innerHTML = `
        <div class="wr-gate">
          <div class="chip-label">STEP 06 · WRITE</div>
          <h2>${none ? 'Make an outline first' : 'Approve the outline first'}</h2>
          <p>${none ? 'You write the book one section at a time. The sections come from 05 Outline.' : 'Write opens once the outline is approved. You can still change the outline later.'}</p>
          <a class="btn btn-primary" href="?id=${encodeURIComponent(book.id)}&step=5" data-go-step="5">Go to 05 Outline</a>
        </div>`;
      return;
    }
    wr.classList.remove('is-single');
    renderManuscript();
    renderMainShell();
    renderSide();
  }

  function pill(status) {
    const label = (STATUSES.find(([k]) => k === status) || STATUSES[0])[1];
    return `<span class="wr-pill is-${status}">${label}</span>`;
  }
  const reviewPill = () => `<span class="wr-review">${ICON.warn(12)}Needs review</span>`;

  function renderManuscript() {
    if (!els || load.state !== 'ready' || !gateOpen()) return;
    const total = allSections().reduce((a, x) => a + sectionWords(x.s), 0);
    const planned = allSections().reduce((a, x) => a + (x.s.word_target || 0), 0);
    const pct = planned ? Math.min(100, Math.round((total / planned) * 100)) : 0;
    const rows = chapters.map((c) => {
      if (c.kind !== 'chapter') {
        const s = c.sections[0];
        return s ? `<li>${sectionBtn(c, s, true)}</li>` : '';
      }
      const isOpen = open.has(c.id);
      const review = (c.sections || []).some((s) => s.needs_review);
      return `<li>
          <button type="button" class="wr-ms-ch" data-toggle="${c.id}" aria-expanded="${isOpen}" aria-controls="wrCh-${c.id}">
            <span class="wr-ms-name">${esc(chapterLabel(c))}</span>
            <span class="wr-ms-pills">${review ? reviewPill() : ''}${pill(chapterStatus(c))}<span class="wr-ms-chev">${CHEVRON(isOpen)}</span></span>
          </button>
          <ul class="wr-ms-secs" id="wrCh-${c.id}"${isOpen ? '' : ' hidden'}>
            ${(c.sections || []).map((s) => `<li>${sectionBtn(c, s, false)}</li>`).join('')}
          </ul>
        </li>`;
    }).join('');
    els.ms.innerHTML = `
      <div class="wr-ms-head">
        <span class="chip-label">MANUSCRIPT</span>
        <span class="wr-ms-count"><strong>${fmt(total)}</strong> / ${fmt(planned)}</span>
      </div>
      <div class="wr-bar" role="img" aria-label="${fmt(total)} of ${fmt(planned)} planned words"><span style="width: ${pct}%"></span></div>
      <ul class="wr-ms-list">${rows}</ul>`;
  }

  function sectionBtn(c, s, top) {
    const current = cur && cur.id === s.id ? ' aria-current="true"' : '';
    return `<button type="button" class="wr-ms-sec${top ? ' is-top' : ''}" data-section="${s.id}"${current}>
        <span class="wr-ms-name">${esc(sectionLabel(c, s))}</span>
        <span class="wr-ms-pills">${s.needs_review ? reviewPill() : ''}${pill(s.status)}</span>
      </button>`;
  }

  function renderMainShell() {
    if (!els) return;
    if (!cur) {
      els.main.innerHTML = `<div data-notes></div><p class="wr-empty-pick">Pick a section in the manuscript list to start writing.</p>`;
      renderNotes();
      return;
    }
    if (cur.state === 'loading') {
      els.main.innerHTML = `<div class="wr-skel" aria-hidden="true"><div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div><p class="sr-only" role="status">Loading the section…</p>`;
      return;
    }
    if (cur.state === 'error') {
      els.main.innerHTML = `<div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn’t load this section. Your writing is safe.</p><p class="alert-text"><button type="button" class="link-btn" data-retry-section>Try again</button></p></div></div>`;
      return;
    }
    const ro = locked();
    const writing = !!gen && gen.id === cur.id && genBusy();
    const kept = !!gen && gen.id === cur.id && !!gen.outcome && gen.outcome.kind === 'save_failed';
    els.main.innerHTML = `
      <div class="wr-head" data-head></div>
      <div data-notes></div>
      <div data-gen></div>
      <div class="wr-card${writing ? ' is-writing' : ''}${kept ? ' is-kept' : ''}">
        <div class="wr-tools" role="toolbar" aria-label="Formatting" aria-controls="wrEditor">
          <button type="button" class="wr-tool" data-cmd="bold" aria-label="Bold" title="Bold (Ctrl+B)"${ro ? ' disabled' : ''}>${TOOL.bold}</button>
          <button type="button" class="wr-tool" data-cmd="italic" aria-label="Italic" title="Italic (Ctrl+I)"${ro ? ' disabled' : ''}>${TOOL.italic}</button>
          <button type="button" class="wr-tool wr-tool-text" data-cmd="h2" aria-label="Heading" title="Heading"${ro ? ' disabled' : ''}>H2</button>
          <button type="button" class="wr-tool" data-cmd="list" aria-label="Bulleted list" title="Bulleted list"${ro ? ' disabled' : ''}>${TOOL.list}</button>
          <button type="button" class="wr-tool" data-cmd="clear" aria-label="Clear formatting" title="Clear formatting"${ro ? ' disabled' : ''}>${TOOL.clear}</button>
          <div class="wr-words" data-words></div>
        </div>
        <div class="wr-editor" id="wrEditor" data-editor role="textbox" aria-multiline="true" aria-labelledby="wrSecTitle"
             contenteditable="${ro ? 'false' : 'true'}" spellcheck="true" aria-readonly="${ro}" data-placeholder="Start writing this section, or use Generate section."></div>
        <div class="wr-stream" data-stream hidden></div>
        <p class="wr-hint" data-hint hidden>Keep writing, or generate the rest of this section.</p>
        <div class="wr-foot" data-foot></div>
      </div>`;
    const ed = els.main.querySelector('[data-editor]');
    ed.innerHTML = MD.toHtml(cur.text);
    ed.classList.toggle('is-empty', !cur.text);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }
    bindEditor(ed);
    renderHead();
    renderNotes();
    renderGen();
    renderStream();
    renderWords();
    renderFoot();
  }

  function renderHead() {
    const box = els && els.main.querySelector('[data-head]');
    if (!box || !cur) return;
    const hit = findSection(cur.id);
    if (!hit) return;
    const { c, s } = hit;
    const where = c.kind === 'chapter' ? `Chapter ${numberOf(c)} · ${esc(str(c.title).trim() || 'Untitled chapter')}` : (c.kind === 'intro' ? 'Front of the book' : 'End of the book');
    box.innerHTML = `
      <div class="wr-head-text">
        <div class="wr-where">${where}</div>
        <h2 id="wrSecTitle" tabindex="-1" data-sec-title>${esc(sectionLabel(c, s))}</h2>
      </div>
      <label class="wr-status">
        <span>Status</span>
        <select class="text-input" data-status${locked() ? ' disabled' : ''}>
          ${STATUSES.map(([k, l]) => `<option value="${k}"${s.status === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="btn btn-secondary wr-gen-btn" data-generate${genBlock() ? ' disabled' : ''}>${SPARKLE}Generate section</button>`;
    // The hint of design 22: under the target, with text, nothing running.
    const hint = els.main.querySelector('[data-hint]');
    if (hint) {
      const t = s.word_target || 0;
      hint.hidden = !!genBlock() || !cur.text.trim() || (t > 0 && W.count(cur.text) >= t) || !!(gen && gen.id === cur.id);
    }
  }

  function renderNotes() {
    const box = els && els.main.querySelector('[data-notes]');
    if (!box) return;
    const parts = [];
    if (load.state === 'ready' && !book.outline_approved_at && anyWriting()) {
      parts.push(`<p class="help-note wr-note" role="status">${INFO}<span>The outline changed since you approved it. <a href="?id=${encodeURIComponent(book.id)}&step=5" data-go-step="5">Approve it again in 05</a> when you are ready.</span></p>`);
    }
    const hit = cur && findSection(cur.id);
    if (hit && hit.s.needs_review) {
      parts.push(`<div class="alert alert-warning wr-note">${ICON.warn(16)}<div><p class="alert-text"><strong>Needs review.</strong> This section was written before the positioning was unlocked. Check it against 03 Positioning, then set its status.</p></div></div>`);
    }
    if (cur && cur.conflict) {
      const busy = cur.busy === 'conflict';
      parts.push(`<div class="alert alert-warning wr-note" role="alert">${ICON.warn(16)}<div>
          <p class="alert-text"><strong>This section changed in another tab.</strong> Your typed text (${fmt(W.count(cur.conflict.content))} words, ${esc(relTime(cur.conflict.at))}) is kept as a draft. Choose which text to keep. Nothing is lost.</p>
          <div class="wr-note-actions">
            <button type="button" class="btn btn-primary btn-sm" data-use-draft${busy ? ' disabled' : ''}>Use my draft</button>
            <button type="button" class="btn btn-secondary btn-sm" data-keep-saved${busy ? ' disabled' : ''}>Keep saved version</button>
          </div></div></div>`);
    }
    if (note) {
      const cls = note.kind === 'error' ? 'alert-error' : 'alert-warning';
      parts.push(`<div class="alert ${cls} wr-note" role="alert">${ICON.warn(16)}<div><p class="alert-text">${esc(note.text)}</p>${note.retry ? '<p class="alert-text"><button type="button" class="link-btn" data-retry-version>Try again</button></p>' : ''}</div></div>`);
    }
    box.innerHTML = parts.join('');
  }

  function renderWords() {
    const box = els && els.main.querySelector('[data-words]');
    if (!box || !cur || cur.state !== 'ready') return;
    const hit = findSection(cur.id);
    const n = W.count(cur.text);
    const t = hit ? hit.s.word_target || 0 : 0;
    const pct = t ? Math.min(100, Math.round((n / t) * 100)) : 0;
    box.innerHTML = t
      ? `<span class="wr-bar wr-bar-sm" aria-hidden="true"><span style="width: ${pct}%"></span></span><span>${fmt(n)} / ${fmt(t)} words</span>`
      : `<span>${fmt(n)} words</span>`;
  }

  function renderFoot() {
    const box = els && els.main.querySelector('[data-foot]');
    if (!box || !cur || cur.state !== 'ready') return;
    const v = cur.version;
    let text;
    const saveErr = saver && saver.state === 'error' && saver.hasUnsaved();
    if (cur.conflict) text = 'Choose which text to keep above.';
    else if (genBusy() && gen.id === cur.id) text = 'The editor is read only while the AI writes.';
    else if (saveErr) text = 'Your latest typing is not saved yet. Use Retry in the sidebar, or Save version.';
    else if (dirty()) text = v ? `Unsaved changes since v${v.version_no}. Kept as a draft while you type.` : 'Not saved as a version yet. Kept as a draft while you type.';
    else if (v) text = `Saved as v${v.version_no} · ${relTime(v.created_at)}`;
    else text = 'Nothing written yet.';
    const can = dirty() && !blankFirst() && !cur.conflict && !cur.busy && !genBusy();
    box.innerHTML = `<span class="wr-foot-text${saveErr ? ' is-error' : ''}" data-foot-text>${saveErr ? ICON.warn(14) : ''}${esc(text)}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-save-version${can ? '' : ' disabled'}>Save version</button>`;
  }

  /* ── Right panel ─────────────────────────── */

  function renderSide() {
    if (!els || load.state !== 'ready' || !gateOpen()) return;
    const tabBtn = (k, label) => `<button type="button" class="tab" role="tab" id="wrTab-${k}" aria-controls="wrPanel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}" data-tab="${k}">${label}</button>`;
    els.side.innerHTML = `
      <div class="tabs wr-tabs" role="tablist" aria-label="Section tools">
        ${tabBtn('versions', 'Versions')}${tabBtn('checks', 'Checks')}${tabBtn('brief', 'Brief')}
      </div>
      <div class="wr-panel" id="wrPanel" role="tabpanel" aria-labelledby="wrTab-${tab}" data-panel></div>`;
    const panel = els.side.querySelector('[data-panel]');
    if (tab === 'versions') panel.innerHTML = versionsHtml();
    else if (tab === 'checks') panel.innerHTML = `<div class="chip-label">CHECKS</div><p class="wr-soon">Checks for sources, repeated words, the chapter objective and the pen name's voice come in E10.3.</p>`;
    else panel.innerHTML = briefHtml();
  }

  function versionsHtml() {
    if (!cur || cur.state !== 'ready') return '<p class="wr-soon">Open a section to see its versions.</p>';
    const hit = findSection(cur.id);
    const head = `<div class="chip-label">${esc(hit ? sectionLabel(hit.c, hit.s).split(' ')[0].toUpperCase() : '')} · VERSIONS</div>`;
    if (cur.versionsState === 'loading' && !cur.versions) return `${head}<div class="wr-skel" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div>`;
    if (cur.versionsState === 'error') return `${head}<div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn’t load the versions.</p><p class="alert-text"><button type="button" class="link-btn" data-retry-versions>Try again</button></p></div></div>`;
    const list = cur.versions || [];
    const items = [];
    if (dirty() && !cur.conflict) {
      items.push(`<li class="wr-ver is-unsaved"><div class="wr-ver-top"><strong>Unsaved changes</strong><span>${fmt(W.count(cur.text))} words</span></div>
        <p class="wr-ver-meta">A draft. It becomes a version when you save, leave the section, or after 10 minutes.</p></li>`);
    }
    for (const v of list) {
      const isCur = v.id === cur.base;
      items.push(`<li class="wr-ver${isCur ? ' is-current' : ''}">
          <div class="wr-ver-top"><strong>v${v.version_no} · ${esc(versionName(v))}</strong><span>${isCur ? 'Current' : esc(relTime(v.created_at))}</span></div>
          <p class="wr-ver-meta">${isCur ? `${esc(relTime(v.created_at))} · ` : ''}${fmt(v.word_count)} words${v.partial ? ' <span class="wr-tag">Partial</span>' : ''}</p>
          ${isCur ? '' : `<div class="wr-ver-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-compare="${v.id}" aria-label="Compare v${v.version_no} with the current text">Compare</button>
            <button type="button" class="btn btn-secondary btn-sm" data-restore="${v.id}" aria-label="Restore v${v.version_no}"${cur.conflict || cur.busy || genBusy() ? ' disabled' : ''}>Restore</button>
          </div>`}
        </li>`);
    }
    const body = items.length ? `<ul class="wr-vers">${items.join('')}</ul>` : '<p class="wr-soon">No versions yet. Your first save makes v1.</p>';
    return `${head}${body}<p class="wr-ver-note">Every save and every AI action makes a new version. Nothing is overwritten.</p>`;
  }

  function briefHtml() {
    const brief = one(book.book_briefs) || {};
    const pos = one(book.positioning) || {};
    const hit = cur && findSection(cur.id);
    const line = (label, value) => `<div class="wr-brief-row"><div class="chip-label">${label}</div><p>${value ? esc(value) : '<span class="wr-empty">Not filled in yet.</span>'}</p></div>`;
    return `
      ${hit && hit.c.kind === 'chapter' ? line('CHAPTER OBJECTIVE', str(hit.c.objective).trim()) : ''}
      ${line('READER', str(brief.target_reader).trim())}
      ${line('THEIR PROBLEM', str(brief.reader_problem).trim())}
      ${line('READER PROMISE', str(pos.reader_promise).trim() || str(brief.promise_draft).trim())}
      ${line('POSITIONING', str(pos.one_sentence).trim())}
      <p class="wr-ver-note">Read only. Change these in 01 Brief, 03 Positioning or 05 Outline.</p>`;
  }

  /* ── Compare dialog (design 23) ──────────── */

  function buildCompare() {
    const d = document.createElement('dialog');
    d.className = 'dialog wr-cmp';
    d.setAttribute('aria-labelledby', 'wrCmpTitle');
    d.innerHTML = `
      <div class="dialog-inner">
        <div class="wr-cmp-head">
          <div><div class="chip-label">COMPARE VERSIONS</div><h2 id="wrCmpTitle"></h2></div>
          <button type="button" class="btn btn-secondary btn-sm" data-cmp-restore></button>
        </div>
        <div class="wr-cmp-body" data-cmp-body tabindex="0" aria-label="Changes"></div>
        <div class="wr-cmp-legend"><span class="wr-leg-del">${ICON.x(12)}Removed</span><span class="wr-leg-add">${ICON.plus.replace('width="18" height="18"', 'width="12" height="12"')}Added</span></div>
        <div class="dialog-foot"><button type="button" class="btn btn-secondary" data-close>Close</button></div>
      </div>`;
    document.body.append(d);
    cmp = { d, title: d.querySelector('#wrCmpTitle'), body: d.querySelector('[data-cmp-body]'), restore: d.querySelector('[data-cmp-restore]'), id: null, back: null };
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    cmp.restore.addEventListener('click', () => { const id = cmp.id; d.close(); restore(id); });
    d.addEventListener('close', () => { if (cmp.back && document.contains(cmp.back)) cmp.back.focus(); });
  }

  async function openCompare(versionId, back) {
    if (!cur || cur.state !== 'ready') return;
    const v = (cur.versions || []).find((x) => x.id === versionId);
    if (!v) return;
    if (!cmp) buildCompare();
    cmp.id = versionId;
    cmp.back = back;
    const curV = (cur.versions || []).find((x) => x.id === cur.base);
    const right = dirty() ? 'Unsaved text' : (curV ? `v${curV.version_no} ${versionName(curV)}` : 'Current text');
    cmp.title.textContent = `v${v.version_no} ${versionName(v)} → ${right}`;
    cmp.restore.textContent = `Restore v${v.version_no}`;
    cmp.restore.disabled = !!(cur.conflict || cur.busy || genBusy());
    cmp.body.innerHTML = '<p class="sr-only" role="status">Loading…</p><div class="skel skel-line"></div>';
    cmp.d.showModal();
    let res;
    try { res = await kdp.getVersion(versionId); } catch (err) { res = { error: err }; }
    if (cmp.id !== versionId) return;
    if (res.error || !res.data) {
      cmp.body.innerHTML = `<div class="alert alert-error" role="alert">${ICON.warn(16)}<p class="alert-text">We couldn’t load v${v.version_no}. Close and try again.</p></div>`;
      return;
    }
    const parts = kdpWordDiff.diff(MD.toPlain(res.data.content), MD.toPlain(cur.text));
    const html = (t) => esc(t).replace(/\n/g, '<br>');
    cmp.body.innerHTML = parts.length
      ? parts.map((p) => (p.op === 'same' ? html(p.text) : p.op === 'del' ? `<del>${html(p.text)}</del>` : `<ins>${html(p.text)}</ins>`)).join('')
      : '<p class="wr-soon">Both versions are empty.</p>';
    if (!parts.some((p) => p.op !== 'same')) cmp.body.insertAdjacentHTML('afterbegin', '<p class="wr-soon">No changes: the texts are the same.</p>');
  }

  /* ── Events ──────────────────────────────── */

  function bind(root) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t || !root.contains(t)) return;
      if (t.dataset.goStep) { e.preventDefault(); ctx.go(Number(t.dataset.goStep)); return; }
      if (t.dataset.toggle) {
        const id = t.dataset.toggle;
        if (open.has(id)) open.delete(id); else open.add(id);
        renderManuscript();
        const b = els.ms.querySelector(`[data-toggle="${id}"]`);
        if (b) b.focus();
        return;
      }
      if (t.dataset.section) { selectSection(t.dataset.section); return; }
      if (t.hasAttribute('data-retry-load')) { loadOutline(); return; }
      if (t.hasAttribute('data-retry-section')) { openSection(cur.id); return; }
      if (t.hasAttribute('data-retry-versions')) { loadVersions(); return; }
      if (t.hasAttribute('data-retry-version')) { note = null; renderNotes(); makeVersion('button'); return; }
      if (t.hasAttribute('data-save-version')) { makeVersion('button'); return; }
      if (t.hasAttribute('data-generate') || t.hasAttribute('data-gen-retry')) { if (gen && gen.phase === 'ended') gen = null; generate(false); return; }
      if (t.hasAttribute('data-gen-stop')) { stopGen(); return; }
      if (t.hasAttribute('data-gen-keep')) { keepPartial(); return; }
      if (t.hasAttribute('data-gen-discard')) { discardPartial(); return; }
      if (t.hasAttribute('data-gen-copy')) { copyGenText(); return; }
      if (t.hasAttribute('data-gen-close')) { gen = null; renderGenShell(); const b = els.main.querySelector('[data-generate]'); if (b && !b.disabled) b.focus(); return; }
      if (t.hasAttribute('data-run-check')) { loadRun(); return; }
      if (t.hasAttribute('data-use-draft')) { resolveConflict(true); return; }
      if (t.hasAttribute('data-keep-saved')) { resolveConflict(false); return; }
      if (t.dataset.tab) { tab = t.dataset.tab; renderSide(); const b = els.side.querySelector(`[data-tab="${tab}"]`); if (b) b.focus(); return; }
      if (t.dataset.compare) { openCompare(t.dataset.compare, t); return; }
      if (t.dataset.restore) { restore(t.dataset.restore); return; }
      if (t.dataset.cmd) { format(t.dataset.cmd); }
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-status]')) setStatus(e.target.value);
    });
    // Arrow keys move between the tabs (WAI-ARIA tabs pattern).
    root.addEventListener('keydown', (e) => {
      const t = e.target.closest('[data-tab]');
      if (!t || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const keys = ['versions', 'checks', 'brief'];
      tab = keys[(keys.indexOf(t.dataset.tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
      renderSide();
      els.side.querySelector(`[data-tab="${tab}"]`).focus();
      e.preventDefault();
    });
    // Toolbar buttons keep the editor's selection.
    root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-cmd]')) e.preventDefault(); });
  }

  function bindEditor(ed) {
    ed.addEventListener('input', onInput);
    ed.addEventListener('paste', (e) => {
      // Plain text only: pasted markup never reaches the stored text.
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    ed.addEventListener('drop', (e) => {
      e.preventDefault();
      const text = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      if (text) document.execCommand('insertText', false, text);
    });
    ed.addEventListener('keydown', (e) => {
      // No underline (owner, E10): Ctrl+U does nothing.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) e.preventDefault();
    });
  }

  function onInput() {
    if (!cur || cur.state !== 'ready' || locked()) return;
    const ed = els.main.querySelector('[data-editor]');
    const md = MD.fromDom(ed);
    ed.classList.toggle('is-empty', !md);
    if (md === cur.text) return;
    cur.text = md;
    saver.edit('draft', 800);
    armIdle();
    renderWords();
    renderFoot();
    renderManuscriptCount();
    if (tab === 'versions') renderSide();
  }

  /** Only the words-written line, so typing does not rebuild the list. */
  function renderManuscriptCount() {
    const el = els && els.ms.querySelector('.wr-ms-count');
    if (!el) return;
    const total = allSections().reduce((a, x) => a + sectionWords(x.s), 0);
    const planned = allSections().reduce((a, x) => a + (x.s.word_target || 0), 0);
    el.innerHTML = `<strong>${fmt(total)}</strong> / ${fmt(planned)}`;
    const bar = els.ms.querySelector('.wr-bar span');
    if (bar) bar.style.width = `${planned ? Math.min(100, Math.round((total / planned) * 100)) : 0}%`;
  }

  function format(cmd) {
    const ed = els.main.querySelector('[data-editor]');
    if (!ed || ed.getAttribute('contenteditable') !== 'true') return;
    ed.focus();
    if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
    else if (cmd === 'h2') {
      const inH2 = document.queryCommandValue('formatBlock').toLowerCase() === 'h2';
      document.execCommand('formatBlock', false, inH2 ? 'p' : 'h2');
    } else if (cmd === 'list') document.execCommand('insertUnorderedList');
    else if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p'); }
    onInput();
  }

  /* ── Step API for js/book.js ─────────────── */

  /** Done when every section is Final (owner to confirm, E10.1). */
  function isDone() {
    if (load.state !== 'ready') return false;
    const list = allSections();
    return list.length > 0 && list.every((x) => x.s.status === 'final');
  }

  function missing() {
    if (load.state !== 'ready' || !gateOpen()) return '';
    const n = allSections().filter((x) => x.s.status !== 'final').length;
    return n ? `${n} section${n === 1 ? '' : 's'} not final` : '';
  }

  const needsReview = () => load.state === 'ready' && allSections().some((x) => x.s.needs_review);

  function init(b, c) {
    ctx = c;
    book = b;
    wantSection = new URLSearchParams(location.search).get('section');
    saver = kdpAutosave.create({
      read,
      save,
      onSaved,
      onError,
      render: (state, message, canRetry) => {
        ctx.renderSave(state, message, canRetry, 6);
        if (active()) renderFoot();
      }
    });
    // The sidebar shows 06 done and "Needs review" without a visit first.
    loadOutline(true);
    // Back in this tab: another tab may have saved the open section meanwhile.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkRemote(); });
    window.addEventListener('focus', checkRemote);
    // Closing the tab while the AI writes: the browser's own "Leave site?" prompt.
    // If the writer leaves anyway, the server treats it like Stop (answer 4).
    window.addEventListener('beforeunload', (e) => {
      if (!genBusy()) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[6] = {
    init,
    render,
    isDone,
    missing,
    needsReview,
    blockers: () => 0,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    /** Leaving the step or the page: the typed text becomes a version (owner, E10). */
    leave: () => makeVersion('leave'),
    /** Another step, Back/Forward or Exit while the AI writes: ask first (E10.2). Resolves false to stay. */
    confirmLeave: () => confirmLeave(),
    /** "&section=<id>" for the open section (book.js puts the address back after a cancelled Back). */
    sectionQuery: () => (cur ? `&section=${encodeURIComponent(cur.id)}` : ''),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && (saver.hasUnsaved() || dirty()),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
