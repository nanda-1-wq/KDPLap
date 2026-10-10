/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write (designs 22, 23)
   /js/book-write.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[6]. E10.1: the editor, drafts and versions. No AI
   yet (Generate section is E10.2, the Improve menu and Checks are E10.3).

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

  /* ── Values ──────────────────────────────── */

  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const str = (v) => (typeof v === 'string' ? v : '');
  const regular = () => chapters.filter((c) => c.kind === 'chapter');
  const allSections = () => chapters.flatMap((c) => (c.sections || []).map((s) => ({ c, s })));
  const findSection = (id) => allSections().find((x) => x.s.id === id) || null;
  const numberOf = (c) => regular().indexOf(c) + 1;
  const hasWriting = (s) => !!(s.has_writing || s.current_version_id || s.has_draft);
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

  const versionName = (v) => (v.source === 'restore' && v.label ? v.label : (SOURCE_NAME[v.source] || 'Saved'));
  const dirty = () => !!cur && cur.state === 'ready' && cur.text !== cur.savedText;
  const active = () => !!els && ctx.isActive(6);

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
    Object.assign(cur, { state: 'ready', version, savedText, base, text: savedText, hasDraft: !!draft, conflict: null });
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
      if (!dirty() && !cur.hasDraft) return true;
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
    if (!cur || cur.state !== 'ready' || cur.conflict) return;
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
    if (!active() || remoteCheck || !cur || cur.state !== 'ready' || cur.conflict || cur.busy || cur.saving) return;
    const id = cur.id;
    remoteCheck = true;
    try {
      let head;
      try { head = await kdp.getSectionHead(id); } catch (err) { return; }
      if (head.error || !head.data || !cur || cur.id !== id || cur.saving || cur.conflict) return;
      const server = head.data.current_version_id || null;
      if (server !== (cur.base || null)) await adoptRemote(id, server);
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
    if (!cur || cur.state !== 'ready') return;
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
    const locked = !!cur.conflict;
    els.main.innerHTML = `
      <div class="wr-head" data-head></div>
      <div data-notes></div>
      <div class="wr-card">
        <div class="wr-tools" role="toolbar" aria-label="Formatting" aria-controls="wrEditor">
          <button type="button" class="wr-tool" data-cmd="bold" aria-label="Bold" title="Bold (Ctrl+B)"${locked ? ' disabled' : ''}>${TOOL.bold}</button>
          <button type="button" class="wr-tool" data-cmd="italic" aria-label="Italic" title="Italic (Ctrl+I)"${locked ? ' disabled' : ''}>${TOOL.italic}</button>
          <button type="button" class="wr-tool wr-tool-text" data-cmd="h2" aria-label="Heading" title="Heading"${locked ? ' disabled' : ''}>H2</button>
          <button type="button" class="wr-tool" data-cmd="list" aria-label="Bulleted list" title="Bulleted list"${locked ? ' disabled' : ''}>${TOOL.list}</button>
          <button type="button" class="wr-tool" data-cmd="clear" aria-label="Clear formatting" title="Clear formatting"${locked ? ' disabled' : ''}>${TOOL.clear}</button>
          <div class="wr-words" data-words></div>
        </div>
        <div class="wr-editor" id="wrEditor" data-editor role="textbox" aria-multiline="true" aria-labelledby="wrSecTitle"
             contenteditable="${locked ? 'false' : 'true'}" spellcheck="true" data-placeholder="Start writing this section. Generate section comes in E10.2."></div>
        <div class="wr-foot" data-foot></div>
      </div>`;
    const ed = els.main.querySelector('[data-editor]');
    ed.innerHTML = MD.toHtml(cur.text);
    ed.classList.toggle('is-empty', !cur.text);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ }
    bindEditor(ed);
    renderHead();
    renderNotes();
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
        <select class="text-input" data-status${cur.conflict ? ' disabled' : ''}>
          ${STATUSES.map(([k, l]) => `<option value="${k}"${s.status === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>`;
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
    else if (saveErr) text = 'Your latest typing is not saved yet. Use Retry in the sidebar, or Save version.';
    else if (dirty()) text = v ? `Unsaved changes since v${v.version_no}. Kept as a draft while you type.` : 'Not saved as a version yet. Kept as a draft while you type.';
    else if (v) text = `Saved as v${v.version_no} · ${relTime(v.created_at)}`;
    else text = 'Nothing written yet.';
    const can = dirty() && !cur.conflict && !cur.busy;
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
          <p class="wr-ver-meta">${isCur ? `${esc(relTime(v.created_at))} · ` : ''}${fmt(v.word_count)} words${v.partial ? ' · partial' : ''}</p>
          ${isCur ? '' : `<div class="wr-ver-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-compare="${v.id}" aria-label="Compare v${v.version_no} with the current text">Compare</button>
            <button type="button" class="btn btn-secondary btn-sm" data-restore="${v.id}" aria-label="Restore v${v.version_no}"${cur.conflict || cur.busy ? ' disabled' : ''}>Restore</button>
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
    cmp.restore.disabled = !!(cur.conflict || cur.busy);
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
    if (!cur || cur.state !== 'ready' || cur.conflict) return;
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
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && (saver.hasUnsaved() || dirty()),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
