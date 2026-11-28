/* ═══════════════════════════════════════════════════
   KDP Lab — Step 06 Write (designs 22, 23)
   /js/book-write.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[6]. E10.1: the editor, drafts and versions.
   E10.2: Generate section (streamed, js/write-generate.js). E10.3: the
   Improve menu (js/write-improve.js; the gates and the Accept hooks are
   under "Improve" below). E10.4: the Checks tab (js/write-checks.js).

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
   - Improve (E10.3): one suggestion at a time. Generate is off while it
     loads or is open (decision 8); Improve is off while Generate runs, a
     conflict card is open, or the positioning is not locked. Accept saves
     typed text as a manual version first, pauses autosave, then saves the
     AI text through apply_suggestion (one undo step in the editor).
   - Checks (E10.4): code checks on the text while you type (free) and one
     AI check of the saved version on a button (Save and check first when
     typed; autosave paused until the call is sent). The tab shows a count
     (never the words row). Advice only: never blocks Final or Next.
   - E12 fix batch 3 (design 22f): "Mark all as reviewed" for the book (the
     box under the manuscript bar) and for one chapter (the first row of an
     open chapter), the same rule as the section's own Mark as reviewed, in
     one save after a confirm with the count. Chapter marks clear only by
     approving the outline (a gray line says so). "Mark book as completed"
     at the end of the manuscript (0026 complete_book checks the rule again),
     and "Reopen book" on a completed book. A status change here that breaks
     the rule reopens the book on the server (0026); a note says why.
   - Opened from 07 (E14.4, design 56, js/write-qc.js): openSpot names the
     section and the spot, a QC bar sits above the columns until the step
     changes. The editor is rebuilt often, so the mark is put back each time.
   - E17 Part 4 (designs 79, 80, 80c, 81, js/write-parts.js): book parts in the
     list (FRONT above the Introduction, BACK under the Conclusion) and the
     "+ Add a book part" menu. A part opens in this same editor with a part
     target (cur.type 'part'): autosave, versions, Compare, Restore and the
     conflict card go through T(type) (risk P1). No Generate, no checks, no
     word target; the epigraph has no Improve and stops at 1,000 characters.
     The review request page is fixed text. Parts never count in the
     manuscript words, the chapter numbers or 06 done.
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
    shorten: 'Shortened', humanize: 'Humanized', custom: 'Custom edit', restore: 'Restored', bio_copy: 'Copied from pen name' };
  // A run in another tab is fresh while its heartbeat is newer than 20 s and it started under 160 s ago (0020).
  const RUN_FRESH = { heartbeatMs: 20000, startedMs: 160000 };
  const SPARKLE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>';

  const CHEVRON = (open) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;
  const CHECKS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 13l4 4 9-10"/><path d="M11 16l1 1 9-10"/></svg>';
  const BOOK_DONE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M9 11l2 2 4-4"/></svg>';
  const REOPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>';
  // E17 N1 (design 78b): the panel toggle's icon, a box with its right column.
  const PANEL_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15"/></svg>';
  const PANEL_KEY = 'nicheink.write.panel';   // "open" or "closed", on this computer
  const INFO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const COPY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
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
  let panelOpen = false;              // E17 N1: the right panel, hidden by default (read in init)
  let note = null;                    // { kind, text, retry } above the editor
  let idleTimer = null;
  let cmp = null;                     // the Compare dialog
  let ask = null;                     // the confirm dialog (rule B, leave while writing)
  let P = null;                       // E17: the book parts (js/write-parts.js)
  let AB = null;                      // E17 Part 5: the Also by page (js/write-also-by.js)
  let wantPart = null;                // ?part= from the first URL
  let G = null;                       // Generate (js/write-generate.js)
  let imp = null;                     // the Improve menu (js/write-improve.js)
  let chk = null;                     // the Checks tab (js/write-checks.js)
  let Q = null;                       // opened from 07: the QC bar and the spot (js/write-qc.js)
  let holdDrafts = false;             // Accept: autosave paused (decision A)
  let review = { busy: null, err: null, done: '' };   // Mark all as reviewed: busy 'book' | chapter id; err { scope, ids }
  let reviewTimer = null;
  let fin = { busy: '', err: null };   // Mark book as completed / Reopen: busy 'complete' | 'reopen'; err { kind, of, text }

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

  // E17 (risk P1): the open target is a section or a book part (cur.type). Every data seam
  // (autosave, versions, Compare, Restore, save, the head check) goes through T(type).
  const isPart = () => !!cur && cur.type === 'part';
  const sec = () => (cur && cur.type !== 'part' ? cur : null);   // what Generate, Checks and the QC bar see
  const noun = () => (isPart() ? 'part' : 'section');
  const partOf = () => (isPart() ? P.byId(cur.id) : null);
  const epigraph = () => isPart() && cur.kind === 'epigraph';
  const textMax = () => (epigraph() ? P.EPIGRAPH_MAX : MAX_CHARS);
  const T = (type) => (type === 'part'
    ? { text: (id) => kdp.parts.text(id), head: (id) => kdp.parts.head(id), versions: (id) => kdp.parts.versions(id), version: (id) => kdp.parts.version(id),
      saveDraft: (id, c, b) => kdp.parts.saveDraft(id, c, b), saveVersion: (id, c, b, m) => kdp.parts.saveVersion(id, c, b, m), restore: (id, v, b) => kdp.parts.restore(id, v, b) }
    : { text: (id) => kdp.getSectionText(id), head: (id) => kdp.getSectionHead(id), versions: (id) => kdp.getVersions(id), version: (id) => kdp.getVersion(id),
      saveDraft: (id, c, b) => kdp.saveDraft(id, c, b), saveVersion: (id, c, b, m) => kdp.saveVersion(id, c, b, m), restore: (id, v, b) => kdp.restoreVersion(id, v, b) });
  /** "&section=<id>" or "&part=<id>" for the address. */
  const query = () => (cur ? `&${isPart() ? 'part' : 'section'}=${encodeURIComponent(cur.id)}` : '');
  /** A part's words now: the open one counts its typing, else its draft, else its version. */
  function partWords(p) {
    if (cur && cur.id === p.id && cur.state === 'ready') return curWords();
    if (p.draft_words != null) return p.draft_words;
    return p.words || (p.has_draft ? 1 : 0);
  }

  /** The open section's words, counted once per text (typing reads it in several places, G2 P2). */
  let counted = { text: null, n: 0 };
  function curWords() {
    if (counted.text !== cur.text) counted = { text: cur.text, n: W.count(cur.text) };
    return counted.n;
  }

  /** Words written in a section: the draft when it is newer than the current version (owner, E10). */
  function sectionWords(s) {
    if (cur && cur.id === s.id && cur.state === 'ready') return curWords();
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
  const genBusy = () => G.busy();
  const locked = () => !!cur && (!!cur.conflict || cur.busy === 'apply' || cur.busy === 'copy' || G.busyOn(cur.id));

  /* ── Autosave: the draft ─────────────────── */

  function read() {
    if (!cur || cur.state !== 'ready' || cur.conflict) return undefined;
    if (cur.fixed) return undefined;
    if (cur.text.length > textMax()) return { error: epigraph() ? `an epigraph holds at most ${fmt(P.EPIGRAPH_MAX)} characters.` : `this ${noun()} is too long. Keep it under ${fmt(MAX_CHARS)} characters.` };
    return { type: cur.type, id: cur.id, content: cur.text, base: cur.base };
  }

  async function save(fields) {
    const d = fields.draft;
    if (!d) return { data: {}, error: null };
    // Accept is saving: no draft may land between save_version and apply_suggestion (decision A).
    // The text it holds is already in the manual version Accept saved first.
    if (holdDrafts) return { data: {}, error: null };
    const res = await T(d.type).saveDraft(d.id, d.content, d.base);
    if (res.error) return res;
    return { data: { ...res.data, sent: d }, error: null };
  }

  function onSaved(res) {
    const d = res.data.sent;
    if (!d) return;
    if (d.type === 'part') {
      const p = P.byId(d.id);
      if (p) Object.assign(p, { has_draft: true, draft_words: W.count(d.content) });
    } else {
      const hit = findSection(d.id);
      if (hit) Object.assign(hit.s, { has_draft: true, has_writing: true, draft_words: W.count(d.content), draft_at: res.data.saved_at || new Date().toISOString() });
    }
    if (cur && cur.id === d.id) cur.hasDraft = true;
    ctx.refresh({ draft: true });
    if (active()) { renderManuscript(); renderFoot(); }
  }

  function onError(res) {
    const e = res.error || {};
    if (e.notFound || e.code === '42501' || e.code === '23503') {
      // The section is gone (deleted in 05) or no longer the caller's.
      saver.reset('error', `This ${noun()} is gone. The manuscript was reloaded.`);
      loadOutline(true);
      return true;
    }
    return false;
  }

  /* ── Data ────────────────────────────────── */

  async function loadOutline(quiet) {
    if (!quiet || load.state !== 'ready') { load = { state: 'loading' }; if (active()) renderAll(); }
    let res;
    // E17: the parts are read with the outline (P.read never throws; before 0035 they stay hidden).
    try { [res] = await Promise.all([kdp.getOutline(book.id), P.read(book.id)]); } catch (err) { res = { error: err }; }
    if (res.error) {
      if (!quiet || load.state !== 'ready') load = { state: 'error' };
      if (active()) renderAll();
      return;
    }
    chapters = (res.data || []).map((c) => ({ ...c, sections: (c.sections || []).slice() }));
    load = { state: 'ready' };
    ctx.refresh();
    if (!active()) return;
    if (cur && !isPart() && !findSection(cur.id)) {
      note = { kind: 'warning', text: 'The section you had open was removed in 05 Outline. Your other writing is safe.' };
      cur = null;
    }
    // A part turned off in another tab or in 08: it closes; its text is kept.
    if (isPart() && P.state() !== 'error' && !(P.byId(cur.id) || {}).enabled && !dirty() && !saver.hasUnsaved()) {
      note = { kind: 'info', text: 'The book part you had open was turned off. Its text is kept.' };
      cur = null;
    }
    // 07 "Open in 06" may ask for another section than the open one.
    if (wantSection && !findSection(wantSection)) wantSection = null;
    if (wantPart && !(P.byId(wantPart) || {}).enabled) wantPart = null;
    if (wantPart && !wantSection && !cur && gateOpen()) {
      const id = wantPart;
      wantPart = null;
      openTarget('part', id, { quiet: true });
      return;
    }
    if ((!cur || wantSection) && gateOpen()) {
      const pick = firstSection();
      // Only 07 "Open in 06" gets here with a section open: the normal leave rules apply.
      if (pick && cur) { await moveToSection(pick); return; }
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
  const openSection = (id, opts) => openTarget('section', id, opts);

  /** E17: a section or a book part (type 'part') in the same editor. */
  async function openTarget(type, id, opts = {}) {
    const token = ++sectionToken;
    clearIdle();
    G.dropOther(id);   // an old section's result card
    if (imp.sectionId() && imp.sectionId() !== id) imp.reset();
    const hit = type === 'section' ? findSection(id) : null;
    const part = type === 'part' ? P.byId(id) : null;
    if (hit) open.add(hit.c.id);
    cur = { type, id, kind: part ? part.kind : null, state: 'loading', versions: null, versionsState: 'idle' };
    if (!opts.keepNote) note = null;
    if (active()) {
      renderAll();
      history.replaceState(history.state, '', `?id=${encodeURIComponent(book.id)}&step=6${query()}`);
    }
    // The review request page and Also by have no text, no status and no versions (0035).
    if (part && !P.isText(part.kind)) {
      if (part.kind === 'also_by') AB.reset();
      Object.assign(cur, { state: 'ready', fixed: true, version: null, savedText: '', base: null, text: '', hasDraft: false, conflict: null, otherRun: false, versions: [], versionsState: 'ready' });
      if (active()) renderAll();
      return;
    }
    let res;
    try { res = await T(type).text(id); } catch (err) { res = { error: err }; }
    if (token !== sectionToken) return;
    if (res.error) {
      if (res.error.notFound) {
        cur = null;
        note = { kind: 'warning', text: type === 'part' ? 'We couldn’t find this book part. Your other writing is safe.' : 'This section was removed in 05 Outline.' };
        loadOutline(true);
        return;
      }
      cur.state = 'error';
      if (active()) renderAll();
      return;
    }
    const { version, draft } = res.data;
    // E17 (80b): About the author opened for the first time (no version, nothing typed): the pen name bio
    // becomes v1, with no dialog. No bio: the editor opens empty with the 84 note.
    if (part && part.kind === 'about_author' && !version && !draft && !opts.noCopy) {
      let c;
      try { c = await kdp.parts.copyBioToAbout(book.id, null); } catch (err) { c = { error: err }; }
      if (token !== sectionToken) return;
      if (!c.error || c.error.message === 'version_conflict') {
        await openTarget(type, id, { ...opts, noCopy: true, keepNote: true });
        if (!c.error && cur && cur.id === id && cur.version) announce(`Copied the pen name bio as version ${cur.version.version_no}.`);
        return;
      }
      if (c.error.message === 'bio_empty') cur.noBio = true;
      else note = { kind: 'warning', text: 'We couldn’t copy the pen name bio. You can write About the author here, or try Copy from pen name again.' };
    }
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
    if (part) Object.assign(part, { version_id: base, words: version ? version.word_count : 0, has_draft: !!draft, draft_words: draft ? W.count(draft.content) : null });
    if (!part) Q.arrive(id);
    if (active()) renderAll();
    loadVersions();
    if (!part) { G.loadRun(); chk.open(id); }
    if (dirty()) armIdle();
  }

  async function loadVersions() {
    if (!cur || cur.state !== 'ready' || cur.fixed) return;
    const id = cur.id;
    cur.versionsState = 'loading';
    if (active()) renderSide();
    let res;
    try { res = await T(cur.type).versions(id); } catch (err) { res = { error: err }; }
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
    if (!cur || cur.state !== 'ready' || cur.conflict || cur.fixed) return true;
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
      try { res = await T(cur.type).saveVersion(id, sent, cur.base); } catch (err) { res = { error: err }; }
      if (!cur || cur.id !== id) return true;
      if (res.error) {
        const m = res.error.message;
        if (m === 'version_conflict') {
          // Another tab saved. The text on screen stays; the choice shows once (the conflict card).
          await adoptRemote(id, null);
          return draftOk;
        }
        if (m === 'section_too_long') note = { kind: 'error', text: `This section is too long to save. Keep it under ${fmt(MAX_CHARS)} characters.` };
        else if (m === 'part_too_long') note = { kind: 'error', text: epigraph() ? `An epigraph holds at most ${fmt(P.EPIGRAPH_MAX)} characters. Your text is kept as a draft.` : `This part is too long to save. Your text is kept as a draft.` };
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
      const hit = isPart() ? null : findSection(id);
      if (hit) {
        Object.assign(hit.s, { current_version_id: v.id, has_writing: true, has_draft: false, draft_words: null, draft_at: null, words: v.word_count, version_at: v.created_at });
        if (hit.s.status === 'not_started') hit.s.status = 'draft';
      }
      const p = partOf();
      if (p) Object.assign(p, { version_id: v.id, words: v.word_count, has_draft: false, draft_words: null });
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
    try { return await run; } finally {
      if (cur) {
        cur.saving = null;
        // The head was drawn while saving (Generate, Improve and Checks off): draw it again (E10.4 fix).
        if (active() && cur.state === 'ready') { renderHead(); imp.refresh(); }
      }
    }
  }

  async function restore(versionId) {
    if (!cur || cur.state !== 'ready' || cur.conflict || genBusy()) return;
    const ok = await makeVersion('restore');
    if (!ok) return;
    const id = cur.id, type = cur.type;
    cur.busy = 'restore';
    renderFoot();
    let res;
    try { res = await T(type).restore(id, versionId, cur.base); } catch (err) { res = { error: err }; }
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
    await openTarget(type, id, { keepNote: false });
    announce(`Restored ${from ? `v${from.version_no}` : 'the version'} as version ${res.data.version_no}.`);
  }

  const penName = () => String((one(book.pen_names) || {}).name || '').trim();

  /**
   * E17 (80b): "Copy from pen name again". With text on screen, the dialog asks first (Cancel /
   * Replace text, not red: nothing is lost). The typing goes to the server as a draft, then
   * copy_bio_to_about keeps it as a version and makes the bio the new current version.
   * The focus comes back to the button.
   */
  async function copyBio() {
    if (!cur || cur.kind !== 'about_author' || cur.state !== 'ready' || cur.conflict || cur.busy || locked()) return;
    const id = cur.id;
    const focusBack = () => { const b = els && els.main.querySelector('[data-copy-bio]'); if (b) b.focus(); };
    if (cur.text.trim()) {
      const pen = penName();
      const yes = await confirmDialog({
        title: 'Replace your About the author text?',
        html: pen ? `This puts the current bio of the pen name <strong>${esc(pen)}</strong> in place of the text you have here.` : 'This puts the current bio of the pen name in place of the text you have here.',
        note: 'Your text now is kept as a version, so you can restore it later.',
        ok: 'Replace text', cancel: 'Cancel'
      });
      if (!yes || !cur || cur.id !== id) { focusBack(); return; }
    }
    const had = !!cur.text.trim();
    clearIdle();
    cur.busy = 'copy';
    if (active()) {
      renderHead();
      renderFoot();
      const ed = els.main.querySelector('[data-editor]');
      if (ed) { ed.setAttribute('contenteditable', 'false'); ed.setAttribute('aria-readonly', 'true'); }
    }
    if (saver.hasUnsaved()) await saver.flush();
    if (!cur || cur.id !== id) return;
    if (saver.state === 'error' && saver.hasUnsaved()) {
      cur.busy = '';
      note = { kind: 'error', text: 'Your text is not saved yet, so the bio was not copied. Check your connection and try again.' };
      if (active()) renderMainShell();
      focusBack();
      return;
    }
    let res;
    try { res = await kdp.parts.copyBioToAbout(book.id, cur.base); } catch (err) { res = { error: err }; }
    if (!cur || cur.id !== id) return;
    cur.busy = '';
    if (res.error) {
      const m = res.error.message;
      if (m === 'version_conflict') { await adoptRemote(id, null); focusBack(); return; }
      if (m === 'bio_empty') { cur.noBio = true; note = null; }
      else note = { kind: 'error', text: 'We couldn’t copy the pen name bio. Your text is safe. Try again.' };
      if (active()) renderMainShell();
      focusBack();
      return;
    }
    await openTarget('part', id, { keepNote: false, noCopy: true });
    // created false: the current version already was the bio (0035); typed text still became a version.
    const made = !(res.data && res.data.created === false);
    announce(had ? `Copied the pen name bio${made ? ` as version ${res.data.version_no}` : ''}. Your earlier text is kept as a version.` : (made ? `Copied the pen name bio as version ${res.data.version_no}.` : 'The text is already the pen name bio.'));
    focusBack();
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
    const what = noun();
    if (!dirty() && !cur.hasDraft && !saver.hasUnsaved()) {
      await openTarget(cur.type, id, { keepNote: true });
      announce(`This ${what} was updated in another tab. The newest text is shown.`);
      return;
    }
    let base = serverBase;
    if (base === null) {
      let head;
      try { head = await T(cur.type).head(id); } catch (err) { head = { error: err }; }
      if (head.error || !head.data) { note = { kind: 'error', text: `This ${what} was saved in another tab, and we couldn’t read it. Your text is still here. Try again in a moment.` }; renderNotes(); return; }
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
    if (!active() || remoteCheck || !cur || cur.state !== 'ready' || cur.fixed || cur.conflict || cur.busy || cur.saving || genBusy()) return;
    const id = cur.id;
    remoteCheck = true;
    try {
      let head;
      try { head = await T(cur.type).head(id); } catch (err) { return; }
      if (head.error || !head.data || !cur || cur.id !== id || cur.saving || cur.conflict) return;
      const server = head.data.current_version_id || null;
      if (server !== (cur.base || null)) await adoptRemote(id, server);
      if (!genBusy() && !isPart()) G.loadRun();
    } finally {
      remoteCheck = false;
    }
  }

  /** "Use my draft" or "Keep saved version" after another tab saved. */
  async function resolveConflict(useDraft) {
    if (!cur || !cur.conflict) return;
    const id = cur.id, type = cur.type, what = noun();
    cur.busy = 'conflict';
    renderNotes();
    let res;
    try {
      res = useDraft
        ? await T(type).saveVersion(id, cur.conflict.content, cur.base)
        : await T(type).saveVersion(id, cur.conflict.content, null, false);
    } catch (err) { res = { error: err }; }
    if (!cur || cur.id !== id) return;
    cur.busy = '';
    if (res.error) {
      note = { kind: 'error', text: res.error.message === 'version_conflict'
        ? `This ${what} was saved again in another tab. Reload to see it.`
        : 'We couldn’t save your choice. Your draft is still kept.' };
      if (active()) renderNotes();
      return;
    }
    const msg = useDraft ? `Your draft is now version ${res.data.version_no}.` : `Your draft was kept as version ${res.data.version_no}. The saved text stays current.`;
    await loadOutline(true);
    await openTarget(type, id);
    announce(msg);
  }

  /** Saves the section status (the select, and Mark Final in Checks, 22e). True when it is saved. */
  async function setStatus(value) {
    if (!cur || cur.state !== 'ready' || locked()) return false;
    if (isPart()) return setPartStatus(value);
    const hit = findSection(cur.id);
    if (!hit) return false;
    if (hit.s.status === value) return true;
    const before = hit.s.status, review = hit.s.needs_review;
    // Reviewed or Final is the review: the "Needs review" mark goes too (E12 fix batch 2, item 4).
    const clears = review && (value === 'reviewed' || value === 'final');
    hit.s.status = value;
    if (clears) hit.s.needs_review = false;
    ctx.refresh();
    renderManuscript();
    if (clears) renderNotes();
    let res;
    try { res = await kdp.updateSection(hit.s.id, clears ? { status: value, needs_review: false } : { status: value }); } catch (err) { res = { error: err }; }
    if (res.error) {
      hit.s.status = before;
      hit.s.needs_review = review;
      note = { kind: 'error', text: 'We couldn’t save the status. Try again.' };
      ctx.refresh();
      if (active()) { renderManuscript(); renderHead(); renderNotes(); chk.refresh(); }
      return false;
    }
    if (res.data && res.data.updated_at) book.updated_at = res.data.updated_at;
    // 0026: a section that leaves Final reopens a completed book on the server (design 22f, 14).
    if (book.status === 'completed' && before === 'final' && value !== 'final') {
      ctx.setStatus({ status: 'in_progress', completed_at: null });
      note = { kind: 'info', text: `Status saved. The book is no longer marked completed, because ${sectionLabel(hit.c, hit.s).split(' ')[0]} is not Final.` };
      if (active()) { renderManuscript(); renderNotes(); }
    }
    ctx.refresh();
    if (active()) chk.refresh();
    return true;
  }

  /** E17 (design 80): a book part is Draft or Final. Only Final text goes into the files. 06 done ignores parts. */
  async function setPartStatus(value) {
    const p = partOf();
    if (!p || cur.fixed || (value !== 'draft' && value !== 'final')) return false;
    if (p.status === value) return true;
    const before = p.status;
    p.status = value;
    renderManuscript();
    let res;
    try { res = await kdp.parts.set(p.id, { status: value }); } catch (err) { res = { error: err }; }
    if (res.error) {
      p.status = before;
      note = { kind: 'error', text: 'We couldn’t save the status. Try again.' };
      if (active()) { renderManuscript(); renderHead(); renderNotes(); }
      return false;
    }
    ctx.refresh();
    if (active()) announce(`Status saved: ${value === 'final' ? 'Final' : 'Draft'}.`);
    return true;
  }

  /** "Mark as reviewed" (E12 fix batch 2, item 4): clears the section's "Needs review" mark; the status stays. */
  async function markReviewed() {
    if (!cur || cur.state !== 'ready' || locked()) return;
    const hit = findSection(cur.id);
    if (!hit || !hit.s.needs_review || hit.s.marking) return;
    hit.s.marking = true;
    renderNotes();
    let res;
    try { res = await kdp.updateSection(hit.s.id, { needs_review: false }); } catch (err) { res = { error: err }; }
    hit.s.marking = false;
    if (res.error) {
      note = { kind: 'error', text: 'We couldn’t mark it as reviewed. Try again.' };
      if (active()) renderNotes();
      return;
    }
    hit.s.needs_review = false;
    if (res.data && res.data.updated_at) book.updated_at = res.data.updated_at;
    ctx.refresh();
    if (!active()) return;
    renderManuscript();
    renderNotes();
    chk.refresh();
    announce('Marked as reviewed.');
    const h = els.root.querySelector('[data-sec-title]');
    if (h) h.focus();
  }

  /* ── Mark all as reviewed, Mark book as completed (E12 fix batch 3, design 22f) ── */

  const marked = (list) => list.filter((x) => x.s.needs_review);
  const chapterMarks = () => chapters.filter((c) => c.needs_review).length;
  /** Off while the AI writes or an Improve suggestion is applied (today's locked() rule), or a section is being marked. */
  const reviewOff = () => G.busy() || (!!cur && cur.busy === 'apply') || allSections().some((x) => x.s.marking);
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const listWords = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const shortLabel = (c, s) => (c.kind === 'chapter' ? `${numberOf(c)}.${c.sections.indexOf(s) + 1}` : sectionLabel(c, s));

  /** scope: 'book' or a chapter id. A confirm with the count first (states 2, 3). */
  async function markAllReviewed(scope) {
    if (review.busy || reviewOff()) return;
    const list = marked(scope === 'book' ? allSections() : allSections().filter((x) => x.c.id === scope));
    if (!list.length) return;
    const n = list.length;
    const ok = `Mark ${fmt(n)} as reviewed`;
    const how = 'Check them against 03 Positioning first. Their status stays the same.';
    let yes;
    if (scope === 'book') {
      const rows = list.slice(0, 8).map((x) => (x.c.kind === 'chapter' ? [shortLabel(x.c, x.s), str(x.s.title).trim() || 'Untitled section'] : ['', shortLabel(x.c, x.s)]));
      yes = await confirmDialog({ title: `Mark ${plural(n, 'section', 'sections')} as reviewed?`, text: how, list: rows, more: n > 8 ? `and ${fmt(n - 8)} more` : '', ok, cancel: 'Cancel', focusOk: true });
    } else {
      const c = list[0].c;
      yes = await confirmDialog({ title: `Mark ${plural(n, 'section', 'sections')} in chapter ${numberOf(c)} as reviewed?`,
        text: `“${str(c.title).trim() || 'Untitled chapter'}”: ${listWords(list.map((x) => shortLabel(x.c, x.s)))}. ${how}`, ok, cancel: 'Cancel', focusOk: true });
    }
    if (yes) saveReviewed(scope, [...new Set(list.map((x) => x.c.id))]);
  }

  /** One save for all of them (all or none). The count is what the server changed. */
  async function saveReviewed(scope, ids) {
    review = { busy: scope, err: null, done: '' };
    renderManuscript();
    renderNotes();
    let res;
    try { res = await kdp.markSectionsReviewed(ids); } catch (err) { res = { error: err }; }
    if (res.error) {
      review = { busy: null, err: { scope, ids }, done: '' };
      if (active()) { renderManuscript(); renderNotes(); const b = els.ms.querySelector('[data-review-retry]'); if (b) b.focus(); }
      return;
    }
    // No section of these chapters is marked now (another tab may have cleared some first).
    allSections().filter((x) => ids.includes(x.c.id)).forEach((x) => { x.s.needs_review = false; });
    const n = res.data.length;
    if (res.data[0] && res.data[0].updated_at) book.updated_at = res.data[0].updated_at;
    review = { busy: null, err: null, done: n ? `Marked ${plural(n, 'section', 'sections')} as reviewed.` : 'These sections were already marked as reviewed.' };
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(() => { review.done = ''; if (active()) renderManuscript(); }, 8000);
    ctx.refresh();
    if (!active()) return;
    renderManuscript();
    renderNotes();
    chk.refresh();
    announce(review.done);
    const first = els.ms.querySelector('[data-section]');
    if (first) first.focus();
  }

  /** What is left before the book can be marked completed (state 9), in order. [] = ready. */
  function completeLeft() {
    const list = allSections();
    if (!list.length) return ['The book has no sections yet'];
    const left = [];
    const notFinal = list.filter((x) => x.s.status !== 'final').length;
    const rev = marked(list).length;
    const noText = list.filter((x) => !x.s.current_version_id || !(x.s.words > 0)).length;
    if (notFinal) left.push(plural(notFinal, 'section is not Final yet', 'sections are not Final yet'));
    if (rev) left.push(plural(rev, 'section needs review', 'sections need review'));
    if (noText) left.push(plural(noText, 'section has no text', 'sections have no text'));
    if (!book.outline_approved_at || chapterMarks()) left.push('Approve the outline in 05');
    return left;
  }

  async function completeBook() {
    if (fin.busy || completeLeft().length || G.busy()) return;
    fin = { busy: 'complete', err: null };
    renderManuscript();
    let res;
    try { res = await kdp.completeBook(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      const e = res.error;
      // The server checks the same rule (0026): another tab changed the book.
      fin = { busy: '', err: e.code === 'P0001' || e.code === 'P0002'
        ? { kind: 'refused', text: `The book changed in another tab. ${e.details || 'It is not ready yet.'} Reload to see it.` }
        : { kind: 'net', of: 'complete', text: 'We couldn’t mark the book as completed. Try again.' } };
      if (active()) { renderManuscript(); focusFin(); }
      return;
    }
    fin = { busy: '', err: null };
    ctx.setStatus({ status: 'completed', completed_at: res.data });
    if (!active()) return;
    renderManuscript();
    announce('The book is marked completed.');
    const b = els.ms.querySelector('[data-reopen]');
    if (b) b.focus();
  }

  async function reopenBook() {
    if (fin.busy) return;
    fin = { busy: 'reopen', err: null };
    renderManuscript();
    let res;
    try { res = await kdp.reopenBook(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      fin = { busy: '', err: { kind: 'net', of: 'reopen', text: 'We couldn’t reopen the book. Try again.' } };
      if (active()) { renderManuscript(); focusFin(); }
      return;
    }
    fin = { busy: '', err: null };
    ctx.setStatus({ status: res.data.status, completed_at: res.data.completed_at, updated_at: res.data.updated_at });
    if (!active()) return;
    renderManuscript();
    announce('The book is in progress again.');
    const b = els.ms.querySelector('[data-complete]');
    if (b && !b.disabled) b.focus();
  }

  /** Reload after a refusal: the outline and the book's status from the server. */
  async function reloadFin() {
    fin = { busy: '', err: null };
    await Promise.all([loadOutline(true), ctx.reloadStatus()]);
    if (active()) renderManuscript();
  }

  function focusFin() {
    const b = els.ms.querySelector('[data-fin-retry], [data-fin-reload]');
    if (b) b.focus();
  }

  /**
   * Leaving the section: a version first. Stays when the text could not be saved at all.
   * Resolves true when the section is the open one.
   */
  const moveToSection = (id) => moveTo('section', id);

  async function moveTo(type, id) {
    if (cur && cur.id === id && cur.state === 'ready') return true;
    if (!(await confirmLeave())) return false;
    const ok = await makeVersion('leave');
    if (!ok) {
      note = { kind: 'error', text: 'Your text is not saved yet. Use Retry next to “Couldn’t save”, then open another section.' };
      renderNotes();
      return false;
    }
    await openTarget(type, id);
    return true;
  }

  async function selectSection(id, type = 'section') {
    if (cur && cur.id === id && cur.state === 'ready') return;
    if (!(await moveTo(type, id))) return;
    const h = els && els.root.querySelector('[data-sec-title]');
    if (h) h.focus();
  }

  /* ── Generate (E10.2, js/write-generate.js) ── */

  const posLocked = () => !!(one(book.positioning) || {}).locked_at;

  /** A small confirm dialog. Resolves true for the main button. */
  function confirmDialog({ title, text, html, note: extra, ok, cancel, list, more, focusOk }) {
    if (!ask) {
      const d = document.createElement('dialog');
      d.className = 'dialog dialog-sm';
      d.setAttribute('aria-labelledby', 'wrAskTitle');
      d.innerHTML = `
        <div class="dialog-inner">
          <div class="dialog-head"><h2 id="wrAskTitle"></h2><p data-ask-text></p><p data-ask-note hidden></p></div>
          <ol class="wr-ask-list" data-ask-list hidden></ol>
          <div class="dialog-foot">
            <button type="button" class="btn btn-secondary" data-ask-no></button>
            <button type="button" class="btn btn-primary" data-ask-yes></button>
          </div>
        </div>`;
      document.body.append(d);
      ask = { d, resolve: null, back: null, pending: null };
      const finish = (v) => { const r = ask.resolve; ask.resolve = null; if (d.open) d.close(); if (r) r(v); };
      d.querySelector('[data-ask-yes]').addEventListener('click', () => finish(true));
      d.querySelector('[data-ask-no]').addEventListener('click', () => finish(false));
      d.addEventListener('close', () => {
        if (ask.resolve) { const r = ask.resolve; ask.resolve = null; r(false); }
        if (ask.back && document.contains(ask.back)) ask.back.focus();
      });
    }
    // Already open (a second Back or Exit while it asks): the same question, the same answer.
    if (ask.pending) return ask.pending;
    ask.d.querySelector('#wrAskTitle').textContent = title;
    // html: built by the caller with esc() on every value (E17 80b: the pen name in bold).
    if (html !== undefined) ask.d.querySelector('[data-ask-text]').innerHTML = html;
    else ask.d.querySelector('[data-ask-text]').textContent = text;
    const nt = ask.d.querySelector('[data-ask-note]');
    nt.hidden = !extra;
    nt.textContent = extra || '';
    ask.d.querySelector('.dialog-head').classList.toggle('is-stack', html !== undefined || !!extra);   // 80b: title over the words
    ask.d.querySelector('[data-ask-yes]').textContent = ok;
    ask.d.querySelector('[data-ask-no]').textContent = cancel;
    // Mark all as reviewed (22f, 2): the sections that will change.
    const ol = ask.d.querySelector('[data-ask-list]');
    ol.hidden = !list;
    ol.innerHTML = list ? list.map(([n, t]) => `<li><span class="wr-ask-n">${esc(n)}</span><span>${esc(t)}</span></li>`).join('') + (more ? `<li class="wr-ask-more">${esc(more)}</li>` : '') : '';
    ask.back = document.activeElement;
    ask.pending = new Promise((resolve) => {
      ask.resolve = (v) => { ask.pending = null; resolve(v); };
      ask.d.showModal();
      ask.d.querySelector(focusOk ? '[data-ask-yes]' : '[data-ask-no]').focus();
    });
    return ask.pending;
  }

  /**
   * Leaving the section, the step or the page while Improve waits or the AI
   * writes: ask first (write-improve.js, then write-generate.js).
   */
  async function confirmLeave() {
    if (!(await imp.confirmLeave())) return false;
    return G.leave();
  }

  /* ── Improve (E10.3) ─────────────────────── */

  /** Why Improve is off for the open section ('' when it can run). The suggestion's own state is in write-improve.js. */
  function improveWhy() {
    if (!cur || cur.state !== 'ready') return 'loading';
    // E17 (80c): never Improve on the epigraph (a quote), also from a shortcut.
    if (epigraph()) return 'quote';
    if (cur.conflict) return 'conflict';
    if (G.busyOn(cur.id)) return 'gen_here';
    if (cur.otherRun) return 'other_tab';
    if ((cur.busy && cur.busy !== 'apply') || cur.saving) return 'loading';
    if (!posLocked()) return 'positioning';
    return '';
  }

  /**
   * Accept, level 1: the editor is read only (typing is not taken in).
   * Level 2: autosave is paused too. 0: back to normal.
   */
  function hold(level) {
    if (!cur) { holdDrafts = false; return; }
    if (level) cur.busy = 'apply';
    else if (cur.busy === 'apply') cur.busy = '';
    holdDrafts = level === 2;
    const ed = els && els.main.querySelector('[data-editor]');
    if (ed) {
      const ro = locked();
      ed.setAttribute('contenteditable', ro ? 'false' : 'true');
      ed.setAttribute('aria-readonly', String(ro));
    }
    if (!level) { renderHead(); renderFoot(); }
  }

  /**
   * Accept, step 2: typed text (or a section with no version yet) becomes a manual version first.
   * typing (E10.4 Save and check): typing during the save is allowed; the check reads the saved version.
   */
  async function improveSaveFirst(typing) {
    if (!cur || cur.state !== 'ready') return false;
    if (saver.hasUnsaved()) await saver.flush();
    if (!dirty() && cur.base) return true;
    const id = cur.id;
    const ok = await makeVersion('improve');
    return ok && !!cur && cur.id === id && !cur.conflict && !(note && note.retry === 'version') && (typing || !dirty()) && !!cur.base;
  }

  /**
   * The passage replaced in the editor as one undo step: when the passage and
   * the new text each fit on one line (the usual case), only that range is
   * replaced with inline HTML. Chrome's insertHTML merges block HTML into the
   * block around it, so anything else (or a result that reads back different)
   * sets the editor HTML directly: undo is lost for that step; the text is
   * right either way (plan §7).
   */
  function replacePassage(ed, full, edit) {
    const LINE_MARK = /^(#{1,6} |[-+] |[0-9]{1,9}[.)] )/;
    let ok = false;
    const oldLine = edit && edit.selection, newLine = edit && edit.output;
    if (edit && !/\n/.test(oldLine) && !/\n/.test(newLine)) {
      const m1 = oldLine.match(LINE_MARK), m2 = newLine.match(LINE_MARK);
      if ((m1 ? m1[0] : '') === (m2 ? m2[0] : '')) {
        const skip = m1 ? m1[0].length : 0;
        const rest = newLine.slice(skip);
        const inner = LINE_MARK.test(rest) ? '' : MD.toHtml(rest).replace(/^<p>|<\/p>$/g, '');
        const map = MD.fromDomMap(ed);
        const p = map.domPoint(edit.at + skip, 'start'), q = map.domPoint(edit.at + oldLine.length, 'end');
        if (inner && map.md === edit.before && p && q && !/^<(h2|ul|ol)>/.test(inner)) {
          try {
            ed.focus();
            const r = document.createRange();
            r.setStart(p.node, p.offset);
            r.setEnd(q.node, q.offset);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
            // The pill's icon is an <svg>, which Chrome inserts as a block (it splits the
            // paragraph): the pills go in without it and get it right after.
            const icon = (inner.match(/<svg[\s\S]*?<\/svg>/) || [''])[0];
            ok = document.execCommand('insertHTML', false, inner.replace(/<svg[\s\S]*?<\/svg>/g, ''));
            ed.querySelectorAll('.md-flag').forEach((f) => { if (!f.querySelector('svg')) f.insertAdjacentHTML('afterbegin', icon); });
            ok = ok && MD.fromDom(ed) === full;
          } catch (err) { ok = false; }
        }
      }
    }
    if (!ok) ed.innerHTML = MD.toHtml(full);
    ed.classList.toggle('is-empty', !full);
    return ok;
  }

  /** Accept, the end: the new version is current; the editor text is replaced (one undo step when it can be). */
  function improveApplied(v, full, action, edit) {
    const id = cur.id;
    const source = v.source || action;
    cur.base = v.id;
    cur.savedText = full;
    cur.hasDraft = false;
    cur.version = { id: v.id, version_no: v.version_no, word_count: v.word_count, created_at: v.created_at, content: full, source };
    const hit = isPart() ? null : findSection(id);
    if (hit) {
      Object.assign(hit.s, { current_version_id: v.id, has_writing: true, has_draft: false, draft_words: null, draft_at: null, words: v.word_count, version_at: v.created_at });
      if (hit.s.status === 'not_started') hit.s.status = 'draft';
    }
    const p = partOf();
    if (p) Object.assign(p, { version_id: v.id, words: v.word_count, has_draft: false, draft_words: null });
    const ed = els && els.main.querySelector('[data-editor]');
    if (ed) {
      ed.setAttribute('contenteditable', 'true');
      replacePassage(ed, full, edit);
    }
    hold(0);
    cur.text = ed ? MD.fromDom(ed) : full;
    if (saver.hasUnsaved() || saver.state === 'error') saver.reset('saved');
    ctx.refresh();
    if (active()) { renderManuscript(); renderHead(); renderNotes(); renderWords(); renderFoot(); renderManuscriptCount(); }
    loadVersions();
    announce(`Saved as version ${v.version_no} · ${SOURCE_NAME[source] || 'Saved'}.`);
  }

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    if (P) P.closeMenu(false);
    root.innerHTML = `
      <div class="wr">
        <nav class="wr-ms" aria-label="Manuscript" data-ms></nav>
        <div class="wr-main" data-main></div>
        <aside class="wr-side" id="wrSide" aria-label="Versions, checks and Brief" data-side></aside>
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
    Q.render();
    // The number check knows the Research sources (as the server's rule): read on each step open.
    chk.loadResearch();
    if (load.state === 'idle' || load.state === 'error') { loadOutline(); return; }
    renderAll();
    if (load.state !== 'ready') return;
    // The step's address has no section yet. A reload keeps it, also when the section is not read again below.
    if (cur) history.replaceState(history.state, '', `?id=${encodeURIComponent(book.id)}&step=6${query()}`);
    // Back from another step: the outline may have changed there (05 edits, an unlock in 03).
    loadOutline(true).then(() => {
      if (active() && cur && cur.state === 'ready' && !dirty() && !saver.hasUnsaved()) openTarget(cur.type, cur.id, { keepNote: true });
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
    wr.classList.toggle('is-panel-off', !panelOpen);
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
    const curId = cur ? cur.id : null;
    const rows = P.groupHtml('front', curId, partWords) + chapters.map((c) => {
      if (c.kind !== 'chapter') {
        const s = c.sections[0];
        return s ? `<li>${sectionBtn(c, s, true)}</li>` : '';
      }
      const isOpen = open.has(c.id);
      const toReview = (c.sections || []).filter((s) => s.needs_review).length;
      const review = toReview > 0;
      return `<li>
          <button type="button" class="wr-ms-ch" data-toggle="${c.id}" aria-expanded="${isOpen}" aria-controls="wrCh-${c.id}">
            <span class="wr-ms-name">${esc(chapterLabel(c))}</span>
            <span class="wr-ms-pills">${review ? reviewPill() : ''}${pill(chapterStatus(c))}<span class="wr-ms-chev">${CHEVRON(isOpen)}</span></span>
          </button>
          <ul class="wr-ms-secs" id="wrCh-${c.id}"${isOpen ? '' : ' hidden'}>
            ${toReview ? chapterReviewHtml(c, toReview) : ''}
            ${(c.sections || []).map((s) => `<li>${sectionBtn(c, s, false)}</li>`).join('')}
          </ul>
        </li>`;
    }).join('') + P.groupHtml('back', curId, partWords);
    els.ms.innerHTML = `
      <div class="wr-ms-head">
        <span class="chip-label">MANUSCRIPT</span>
        <span class="wr-ms-count"><strong>${fmt(total)}</strong> / ${fmt(planned)}</span>
      </div>
      <div class="wr-bar" role="img" aria-label="${fmt(total)} of ${fmt(planned)} planned words"><span style="width: ${pct}%"></span></div>
      ${reviewHtml()}
      <ul class="wr-ms-list">${rows}</ul>
      ${P.addHtml()}
      ${finHtml()}`;
  }

  const spin = '<span class="spinner" aria-hidden="true"></span>Saving…';

  /** The box under the bar (22f, 1, 4 to 7, 6b): sections to review, the chapter marks line, the error, the done note. */
  function reviewHtml() {
    const list = marked(allSections());
    const chs = chapterMarks();
    const done = review.done ? `<p class="help-note wr-ms-done-note" role="status">${ICON.check(16)}<span>${esc(review.done)}</span></p>` : '';
    if (!list.length && !chs && !review.err) return done;
    const off = reviewOff();
    const box = [];
    if (list.length) {
      box.push(`<p class="wr-ms-review-line">${ICON.warn(16)}<strong>${plural(list.length, 'section needs review', 'sections need review')}</strong></p>`);
      box.push(`<button type="button" class="btn btn-secondary btn-sm wr-ms-wide" data-review-all${off || review.busy ? ' disabled' : ''}${off ? ' aria-describedby="wrReviewWhy"' : ''}>${review.busy === 'book' ? spin : `${CHECKS}Mark all as reviewed`}</button>`);
      if (off) box.push(`<p class="wr-ms-why" id="wrReviewWhy">${INFO}<span>Wait for the section to finish writing.</span></p>`);
    } else if (chs) {
      box.push(`<p class="wr-ms-review-line">${ICON.warn(16)}<strong>${plural(chs, 'chapter needs review', 'chapters need review')}</strong></p>`);
    }
    if (chs) box.push(`<p class="wr-ms-why">${INFO}<span>Approve the outline in 05 to clear the chapter marks.</span></p>`);
    if (review.err) {
      box.push(`<div class="alert alert-error wr-ms-err" role="alert">${ICON.x(16)}<div><p class="alert-text">We couldn’t mark them as reviewed. Nothing was changed.</p>
          <p class="alert-text"><button type="button" class="btn btn-secondary btn-sm" data-review-retry${review.busy ? ' disabled' : ''}>Retry</button></p></div></div>`);
    }
    return `${done}<div class="wr-ms-review" data-review-box>${box.join('')}</div>`;
  }

  /** The first row of an open chapter with sections to review (22f, 1). */
  function chapterReviewHtml(c, n) {
    const off = reviewOff() || !!review.busy;
    return `<li class="wr-ms-ch-review"><button type="button" class="btn btn-secondary btn-sm" data-review-chapter="${c.id}"${off ? ' disabled' : ''}>${review.busy === c.id ? spin : `${CHECKS}Mark chapter as reviewed (${fmt(n)})`}</button></li>`;
  }

  /** The foot of the manuscript (22f, 8 to 12): Mark book as completed, or Completed with Reopen. */
  function finHtml() {
    const e = fin.err;
    const err = !e ? '' : `<div class="alert alert-error wr-ms-err" role="alert">${ICON.x(16)}<div><p class="alert-text">${esc(e.text)}</p>
        <p class="alert-text">${e.kind === 'refused' ? '<button type="button" class="btn btn-secondary btn-sm" data-fin-reload>Reload</button>' : '<button type="button" class="btn btn-secondary btn-sm" data-fin-retry>Retry</button>'}</p></div></div>`;
    if (book.status === 'completed') {
      const at = book.completed_at ? new Date(book.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `<div class="wr-ms-foot" data-fin>
          <p class="wr-ms-done">${ICON.check(16)}<span><strong>Completed</strong><span class="wr-ms-sub">${at ? `Marked ${esc(at)}. ` : ''}You can still edit it.</span></span></p>
          <button type="button" class="btn btn-secondary wr-ms-wide" data-reopen${fin.busy ? ' disabled' : ''}>${fin.busy === 'reopen' ? spin : `${REOPEN}Reopen book`}</button>
          ${err}
        </div>`;
    }
    const left = completeLeft();
    const gen = !left.length && G.busy();
    const off = !!left.length || gen || !!fin.busy;
    const why = left.length
      ? `<ul class="wr-ms-left" id="wrFinWhy" aria-label="Left before the book is completed">${left.map((t) => `<li><span class="wr-ms-dot" aria-hidden="true"></span><span>${esc(t)}</span></li>`).join('')}</ul>`
      : gen ? `<p class="wr-ms-why" id="wrFinWhy">${INFO}<span>Wait for the section to finish writing.</span></p>`
        : `<p class="wr-ms-why is-ok">${ICON.check(16)}<span>Every section is Final and nothing needs review.</span></p>`;
    return `<div class="wr-ms-foot" data-fin>
        ${left.length ? '' : why}
        <button type="button" class="btn ${left.length ? 'btn-secondary' : 'btn-primary'} wr-ms-wide" data-complete${off ? ' disabled' : ''}${left.length || gen ? ' aria-describedby="wrFinWhy"' : ''}>${fin.busy === 'complete' ? spin : `${BOOK_DONE}Mark book as completed`}</button>
        ${left.length ? why : ''}
        ${err}
      </div>`;
  }

  function sectionBtn(c, s, top) {
    const current = cur && cur.id === s.id ? ' aria-current="true"' : '';
    return `<button type="button" class="wr-ms-sec${top ? ' is-top' : ''}" data-section="${s.id}"${current}>
        <span class="wr-ms-name">${esc(sectionLabel(c, s))}</span>
        <span class="wr-ms-pills">${s.needs_review ? reviewPill() : ''}${G && G.writingNow(s.id) ? '<span class="wr-pill is-writing">Writing…</span>' : pill(s.status)}</span>
      </button>`;
  }

  function renderMainShell() {
    if (!els) return;
    if (!cur) {
      els.main.innerHTML = `<div class="wr-top">${toggleHtml()}</div><div data-notes></div><p class="wr-empty-pick">Pick a section in the manuscript list to start writing.</p>`;
      renderNotes();
      return;
    }
    if (cur.state === 'loading') {
      // E17 (84): a book part shows gray lines and the words, then the editor.
      els.main.innerHTML = isPart()
        ? `<div class="wr-top">${toggleHtml()}</div><div class="wr-skel wr-skel-part" data-part-loading><div aria-hidden="true"><div class="skel skel-line skel-w40"></div><div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w70"></div></div><p class="wr-skel-note" role="status">Loading the book part…</p></div>`
        : `<div class="wr-top">${toggleHtml()}</div><div class="wr-skel" aria-hidden="true"><div class="skel skel-title"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div><p class="sr-only" role="status">Loading the ${noun()}…</p>`;
      return;
    }
    if (cur.state === 'error') {
      els.main.innerHTML = `<div class="wr-top">${toggleHtml()}</div><div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn’t load this ${noun()}. Your writing is safe.</p><p class="alert-text"><button type="button" class="link-btn" data-retry-section>Try again</button></p></div></div>`;
      return;
    }
    // E17 (81): the review request page and Also by show a page, not an editor.
    if (cur.fixed) {
      els.main.innerHTML = `<div class="wr-top"><div class="wr-head" data-head></div>${toggleHtml()}</div><div data-notes></div>${cur.kind === 'review_request' ? P.reviewHtml(book) : AB.html()}`;
      if (cur.kind === 'also_by') AB.mount(els.main.querySelector('[data-ab]'));   // 82 (Part 5)
      renderHead();
      renderNotes();
      return;
    }
    if (isPart()) { renderPartShell(); return; }
    const ro = locked();
    const writing = G.busyOn(cur.id);
    const kept = G.keptOn(cur.id);
    els.main.innerHTML = `
      <div class="wr-top"><div class="wr-head" data-head></div>${toggleHtml()}</div>
      <div data-notes></div>
      <div data-gen></div>
      <div data-imp></div>
      <div class="wr-card${writing ? ' is-writing' : ''}${kept ? ' is-kept' : ''}">
        <div class="wr-tools" role="toolbar" aria-label="Formatting" aria-controls="wrEditor">
          <button type="button" class="wr-tool" data-cmd="bold" aria-label="Bold" title="Bold (Ctrl+B)"${ro ? ' disabled' : ''}>${TOOL.bold}</button>
          <button type="button" class="wr-tool" data-cmd="italic" aria-label="Italic" title="Italic (Ctrl+I)"${ro ? ' disabled' : ''}>${TOOL.italic}</button>
          <button type="button" class="wr-tool wr-tool-text" data-cmd="h2" aria-label="Heading" title="Heading"${ro ? ' disabled' : ''}>H2</button>
          <button type="button" class="wr-tool" data-cmd="list" aria-label="Bulleted list" title="Bulleted list"${ro ? ' disabled' : ''}>${TOOL.list}</button>
          <button type="button" class="wr-tool" data-cmd="clear" aria-label="Clear formatting" title="Clear formatting"${ro ? ' disabled' : ''}>${TOOL.clear}</button>
          ${imp.toolbarHtml()}
          <span class="wr-imp-hint" id="wrImpHint" data-imp-hint hidden></span>
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
    G.render();
    G.renderStream();
    renderWords();
    renderFoot();
    imp.render();
    Q.paint();
  }

  /**
   * E17 (designs 80, 80c): a book part in the section's card. The same tools and Improve
   * (the epigraph has none: a hint says why), words only, a gray hint in an empty editor.
   * No Generate, no stream, no QC mark.
   */
  function renderPartShell() {
    const ro = locked();
    const quote = epigraph();
    const tool = (cmd, label, title, body, cls = '') => `<button type="button" class="wr-tool${cls}" data-cmd="${cmd}" aria-label="${label}" title="${title}"${ro ? ' disabled' : ''}>${body}</button>`;
    els.main.innerHTML = `
      <div class="wr-top"><div class="wr-head" data-head></div>${toggleHtml()}</div>
      <div data-notes></div>
      <div data-imp></div>
      <div class="wr-card">
        <div class="wr-tools" role="toolbar" aria-label="Formatting" aria-controls="wrEditor">
          ${tool('bold', 'Bold', 'Bold (Ctrl+B)', TOOL.bold)}${tool('italic', 'Italic', 'Italic (Ctrl+I)', TOOL.italic)}${tool('h2', 'Heading', 'Heading', 'H2', ' wr-tool-text')}${tool('list', 'Bulleted list', 'Bulleted list', TOOL.list)}${tool('clear', 'Clear formatting', 'Clear formatting', TOOL.clear)}
          ${quote ? `<span class="wr-tool-sep" aria-hidden="true"></span><span class="wr-imp-hint" id="wrImpHint" data-quote-hint>${INFO}<span>Improve is off for quotes. Use your own words or a public domain quote.</span></span>` : `${imp.toolbarHtml()}<span class="wr-imp-hint" id="wrImpHint" data-imp-hint hidden></span>`}
          <div class="wr-words" data-words></div>
        </div>
        <div class="wr-editor" id="wrEditor" data-editor role="textbox" aria-multiline="true" aria-labelledby="wrSecTitle"${quote ? ' aria-describedby="wrImpHint"' : ''}
             contenteditable="${ro ? 'false' : 'true'}" spellcheck="true" aria-readonly="${ro}" data-placeholder="${esc(P.hint(cur.kind))}"></div>
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
    if (!quote) imp.render();
  }

  /** Generate section, and in a chapter Generate chapter (design 23b; E17 N2: in the head row, design 78). */
  function genButtons() {
    const one = `<button type="button" class="btn btn-secondary wr-gen-btn" data-generate${G.block() ? ' disabled' : ''}>${SPARKLE}Generate section</button>`;
    const chap = G.chapterButton();
    return chap ? `<div class="wr-gen-btns">${one}${chap}</div>` : one;
  }

  /* ── E17 N1: the right panel toggle (designs 78, 78b) ── */

  function readPanel() {
    try { return localStorage.getItem(PANEL_KEY) === 'open'; } catch (e) { return false; }   // blocked: closed
  }

  function toggleText(n) {
    const base = 'Show versions, checks and Brief';
    return n ? `${base}, ${fmt(n)} ${n === 1 ? 'check' : 'checks'} to look at` : base;
  }

  /** The amber count shows only while the panel is hidden (accepted exception, Q-P1). */
  function toggleCount() {
    if (panelOpen || !cur || cur.state !== 'ready') return 0;
    return chk.count();
  }

  function toggleHtml() {
    const n = toggleCount();
    const label = esc(toggleText(n));
    return `<button type="button" class="wr-tog" data-panel-toggle aria-controls="wrSide" aria-pressed="${panelOpen}" aria-label="${label}" title="${label}">${PANEL_ICON}${n ? `<span class="wr-tog-count" aria-hidden="true" data-tog-count>${fmt(n)}</span>` : ''}</button>`;
  }

  /** The toggle in place (keeps its focus): pressed look, name, count. */
  function paintToggle() {
    const b = els && els.main.querySelector('[data-panel-toggle]');
    if (!b) return;
    const n = toggleCount();
    const label = toggleText(n);
    b.setAttribute('aria-pressed', String(panelOpen));
    b.setAttribute('aria-label', label);
    b.title = label;
    let c = b.querySelector('[data-tog-count]');
    if (!n) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('span'); c.className = 'wr-tog-count'; c.setAttribute('aria-hidden', 'true'); c.dataset.togCount = ''; b.append(c); }
    c.textContent = fmt(n);
  }

  function setPanel(on) {
    panelOpen = !!on;
    try { localStorage.setItem(PANEL_KEY, panelOpen ? 'open' : 'closed'); } catch (e) { /* blocked: kept for this visit only */ }
    const wr = els && els.root.querySelector('.wr');
    if (wr) wr.classList.toggle('is-panel-off', !panelOpen);
    paintToggle();
  }

  function renderHead() {
    const box = els && els.main.querySelector('[data-head]');
    if (!box || !cur) return;
    if (isPart()) { renderPartHead(box); return; }
    const hit = findSection(cur.id);
    if (!hit) return;
    const { c, s } = hit;
    const where = c.kind === 'chapter' ? `Chapter ${numberOf(c)} · ${esc(str(c.title).trim() || 'Untitled chapter')}` : (c.kind === 'intro' ? 'Front of the book' : 'End of the book');
    box.innerHTML = `
      <div class="wr-head-text">
        <div class="wr-where">${where}</div>
        <h2 id="wrSecTitle" tabindex="-1" data-sec-title>${esc(sectionLabel(c, s))}</h2>
      </div>
      <div class="wr-head-ctl">
        <label class="wr-status">
          <span>Status</span>
          <select class="text-input" data-status${locked() ? ' disabled' : ''}>
            ${STATUSES.map(([k, l]) => `<option value="${k}"${s.status === k ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        ${genButtons()}
      </div>
      ${G.chapterLine()}`;
    // The hint of design 22: under the target, with text, nothing running.
    const hint = els.main.querySelector('[data-hint]');
    if (hint) {
      const t = s.word_target || 0;
      hint.hidden = !!G.block() || !cur.text.trim() || (t > 0 && curWords() >= t) || G.on(cur.id);
    }
    // The Checks panel follows the same gates (Generate, conflicts, a suggestion open).
    chk.refresh();
    paintToggle();
  }

  /** E17 (80, 81): "Front of the book · Book part", the name, then Status (Draft, Final) or "Fixed text" and Turn off. */
  function renderPartHead(box) {
    const p = partOf();
    if (!p) return;
    const tag = cur.kind === 'review_request' ? 'Fixed text' : (cur.kind === 'also_by' ? 'Prints when 1 or more books are ticked' : '');
    // 80b: About the author copies the pen name bio again (the dialog asks first when there is text).
    const copy = cur.kind === 'about_author'
      ? `<button type="button" class="btn btn-secondary wr-copy-bio" data-copy-bio${cur.busy || locked() || cur.state !== 'ready' ? ' disabled' : ''}>${cur.busy === 'copy' ? '<span class="spinner" aria-hidden="true"></span>Copying…' : `${COPY}Copy from pen name again`}</button>`
      : '';
    const ctl = cur.fixed
      ? `${tag ? `<span class="wr-tag wr-fixed-tag">${tag}</span>` : ''}<button type="button" class="btn btn-secondary" data-part-off>Turn off</button>`
      : `${copy}<label class="wr-status"><span>Status</span><select class="text-input" data-status${locked() ? ' disabled' : ''}>
          ${[['draft', 'Draft'], ['final', 'Final']].map(([k, l]) => `<option value="${k}"${(p.status || 'draft') === k ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>`;
    box.innerHTML = `
      <div class="wr-head-text">
        <div class="wr-where">${esc(P.whereOf(p.kind))}</div>
        <h2 id="wrSecTitle" tabindex="-1" data-sec-title>${esc(P.nameOf(p.kind))}</h2>
      </div>
      <div class="wr-head-ctl">${ctl}</div>`;
    paintToggle();
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
      const [off, offText] = chk.aiWhy();
      const why = off && off !== 'checking' ? offText : '';
      // E12 fix batch 2, item 4: say how the mark clears (Mark as reviewed, or Reviewed or Final as the status).
      const marking = hit.s.marking;
      parts.push(`<div class="alert alert-warning wr-note" data-review-note>${ICON.warn(16)}<div><p class="alert-text"><strong>Needs review.</strong> This section was written before the positioning was unlocked. Check it against 03 Positioning, then choose Mark as reviewed. Setting the status to Reviewed or Final also clears this mark.</p>
          <div class="wr-note-actions"><button type="button" class="btn btn-secondary btn-sm" data-mark-reviewed${marking || locked() ? ' disabled' : ''}>${marking ? '<span class="spinner" aria-hidden="true"></span>Saving…' : 'Mark as reviewed'}</button><button type="button" class="btn btn-secondary btn-sm" data-chk-review${off ? ` disabled${why ? ' aria-describedby="wrChkReviewWhy"' : ''}` : ''}>${SPARKLE}Run AI check</button></div>
          ${why ? `<p class="alert-text wr-chk-small" id="wrChkReviewWhy">${esc(why)}</p>` : ''}</div></div>`);
    }
    if (cur && cur.conflict) {
      const busy = cur.busy === 'conflict';
      parts.push(`<div class="alert alert-warning wr-note" role="alert">${ICON.warn(16)}<div>
          <p class="alert-text"><strong>This ${noun()} changed in another tab.</strong> Your typed text (${fmt(W.count(cur.conflict.content))} words, ${esc(relTime(cur.conflict.at))}) is kept as a draft. Choose which text to keep. Nothing is lost.</p>
          <div class="wr-note-actions">
            <button type="button" class="btn btn-primary btn-sm" data-use-draft${busy ? ' disabled' : ''}>Use my draft</button>
            <button type="button" class="btn btn-secondary btn-sm" data-keep-saved${busy ? ' disabled' : ''}>Keep saved version</button>
          </div></div></div>`);
    }
    // E17 (84): About the author and the pen name has no bio yet. Plain words, one next step.
    if (cur && cur.noBio && cur.kind === 'about_author') {
      const pid = (one(book.pen_names) || {}).id || book.pen_name_id;
      const href = pid ? `pen-name.html?id=${encodeURIComponent(pid)}` : 'pen-names.html';
      parts.push(`<div class="wr-card wr-nobio" data-no-bio role="status"><p class="wr-nobio-title">This pen name has no bio yet.</p>
          <p class="wr-nobio-text">Write one in Pen Names, then copy it here. Or write About the author here directly.</p>
          <p><a class="btn btn-secondary" href="${href}">Open Pen Names</a></p></div>`);
    }
    if (note && note.kind === 'info') {
      // E12 fix batch 3 (22f, 14): said once, gray, no button.
      parts.push(`<p class="help-note wr-note" role="status">${INFO}<span>${esc(note.text)}</span></p>`);
    } else if (note) {
      const cls = note.kind === 'error' ? 'alert-error' : 'alert-warning';
      parts.push(`<div class="alert ${cls} wr-note" role="alert">${ICON.warn(16)}<div><p class="alert-text">${esc(note.text)}</p>${note.retry ? '<p class="alert-text"><button type="button" class="link-btn" data-retry-version>Try again</button></p>' : ''}</div></div>`);
    }
    box.innerHTML = parts.join('');
  }

  function renderWords() {
    const box = els && els.main.querySelector('[data-words]');
    if (!box || !cur || cur.state !== 'ready') return;
    const hit = isPart() ? null : findSection(cur.id);
    const n = curWords();
    const t = hit ? hit.s.word_target || 0 : 0;
    // E17 (80): a part has no word target. Near the epigraph's limit the characters show too (80c).
    if (epigraph() && cur.text.length >= P.EPIGRAPH_MAX - 100) {
      box.innerHTML = `<span>${fmt(n)} words · ${fmt(cur.text.length)} / ${fmt(P.EPIGRAPH_MAX)} characters</span>`;
      return;
    }
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
    const can = dirty() && !blankFirst() && !cur.conflict && !cur.busy && !genBusy();
    const saveBtn = `<button type="button" class="btn btn-secondary btn-sm" data-save-version${can ? '' : ' disabled'}>Save version</button>`;
    // E17 (84): save failed. Red icon and word, Retry, and the text stays on screen (sections and parts alike).
    // Offline: the same, and the 'online' event sends it again by itself (init).
    if (saveErr && !cur.conflict && !G.busyOn(cur.id)) {
      const off = navigator.onLine === false;
      box.innerHTML = `<span class="wr-foot-err"><span class="wr-foot-text is-error" data-foot-text>${ICON.warn(16)}${off ? 'Not saved. You are offline.' : 'Not saved. Check your connection.'}</span>
        <button type="button" class="btn btn-secondary btn-sm" data-foot-retry>Retry</button></span>${saveBtn}
        <p class="wr-foot-under" data-foot-under>Your text stays on screen. The app tries again when you are back online.</p>`;
      return;
    }
    if (cur.conflict) text = 'Choose which text to keep above.';
    else if (G.busyOn(cur.id)) text = 'The editor is read only while the AI writes.';
    else if (dirty()) text = v ? `Unsaved changes since v${v.version_no}. Kept as a draft while you type.` : 'Not saved as a version yet. Kept as a draft while you type.';
    else if (v && v.source === 'bio_copy') text = penName() ? `Saved as v${v.version_no} · copied from the pen name ${penName()}` : `Saved as v${v.version_no} · copied from the pen name`;
    else if (v) text = `Saved as v${v.version_no} · ${relTime(v.created_at)}`;
    else text = 'Nothing written yet.';
    box.innerHTML = `<span class="wr-foot-text" data-foot-text>${esc(text)}</span>${saveBtn}`;
  }

  /* ── Right panel ─────────────────────────── */

  function renderSide() {
    if (!els || load.state !== 'ready' || !gateOpen()) return;
    const tabBtn = (k, label, aria) => `<button type="button" class="tab" role="tab" id="wrTab-${k}" aria-controls="wrPanel" aria-selected="${tab === k}" tabindex="${tab === k ? 0 : -1}" data-tab="${k}"${aria ? ` aria-label="${aria}"` : ''}>${label}</button>`;
    // The Checks count: code warnings + AI findings of a current check, never the words row (decision 6).
    // The number is hidden from screen readers; the tab's name says it ("Checks, 4 to review").
    const n = isPart() ? 0 : chk.count();
    els.side.innerHTML = `
      <div class="tabs wr-tabs" role="tablist" aria-label="Section tools">
        ${tabBtn('versions', 'Versions')}${tabBtn('checks', n ? `Checks <span class="count" aria-hidden="true">${n}</span>` : 'Checks', n ? `Checks, ${n} to review` : 'Checks')}${tabBtn('brief', 'Brief')}
      </div>
      <div class="wr-panel" id="wrPanel" role="tabpanel" aria-labelledby="wrTab-${tab}" data-panel data-panel-kind="${tab}"></div>`;
    const panel = els.side.querySelector('[data-panel]');
    if (tab === 'versions') panel.innerHTML = versionsHtml();
    else if (tab === 'checks' && isPart()) {
      // E17 (80): no checks on book parts. Its own kind, so the Checks module never draws here.
      panel.dataset.panelKind = 'checks-part';
      panel.innerHTML = '<div class="chip-label">CHECKS</div><p class="wr-soon wr-soon-title">Book parts have no checks.</p>'
        + '<p class="wr-soon">AI checks are for chapters. 07 Quality Control still tells you when a part is on but empty or not Final.</p>';
    } else if (tab === 'checks') panel.innerHTML = chk.panelHtml();
    else panel.innerHTML = briefHtml();
    paintToggle();
  }

  function versionsHtml() {
    if (!cur || cur.state !== 'ready') return '<p class="wr-soon">Open a section to see its versions.</p>';
    const hit = isPart() ? null : findSection(cur.id);
    const head = `<div class="chip-label">${esc(isPart() ? P.nameOf(cur.kind).toUpperCase() : hit ? sectionLabel(hit.c, hit.s).split(' ')[0].toUpperCase() : '')} · VERSIONS</div>`;
    if (cur.fixed) return `${head}<p class="wr-soon">This page has no text of its own, so it has no versions.</p>`;
    if (cur.versionsState === 'loading' && !cur.versions) return `${head}<div class="wr-skel" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div></div>`;
    if (cur.versionsState === 'error') return `${head}<div class="alert alert-error" role="alert">${ICON.warn(16)}<div><p class="alert-text">We couldn’t load the versions.</p><p class="alert-text"><button type="button" class="link-btn" data-retry-versions>Try again</button></p></div></div>`;
    const list = cur.versions || [];
    const items = [];
    if (dirty() && !cur.conflict) {
      items.push(`<li class="wr-ver is-unsaved"><div class="wr-ver-top"><strong>Unsaved changes</strong><span>${fmt(curWords())} words</span></div>
        <p class="wr-ver-meta">A draft. It becomes a version when you save, leave the ${noun()}, or after 10 minutes.</p></li>`);
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
    try { res = await T(cur.type).version(versionId); } catch (err) { res = { error: err }; }
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
      if (t.hasAttribute('data-panel-toggle')) { setPanel(!panelOpen); return; }
      if (els.side.contains(t) && chk.handleClick(t)) return;
      if (t.hasAttribute('data-mark-reviewed')) { markReviewed(); return; }
      // E12 fix batch 3 (design 22f).
      if (t.hasAttribute('data-review-all')) { markAllReviewed('book'); return; }
      if (t.dataset.reviewChapter) { markAllReviewed(t.dataset.reviewChapter); return; }
      if (t.hasAttribute('data-review-retry') && review.err) { saveReviewed(review.err.scope, review.err.ids); return; }
      if (t.hasAttribute('data-complete')) { completeBook(); return; }
      if (t.hasAttribute('data-reopen')) { reopenBook(); return; }
      if (t.hasAttribute('data-fin-retry') && fin.err) { if (fin.err.of === 'reopen') reopenBook(); else completeBook(); return; }
      if (t.hasAttribute('data-fin-reload')) { reloadFin(); return; }
      if (t.hasAttribute('data-chk-review')) {
        tab = 'checks';
        if (!panelOpen) setPanel(true);   // E17 N1: the check runs in the panel, so it shows
        renderSide();
        chk.run();
        return;
      }
      if (t.dataset.toggle) {
        const id = t.dataset.toggle;
        if (open.has(id)) open.delete(id); else open.add(id);
        renderManuscript();
        const b = els.ms.querySelector(`[data-toggle="${id}"]`);
        if (b) b.focus();
        return;
      }
      if (t.dataset.section) { selectSection(t.dataset.section); return; }
      // E17 (79, 81): a book part, the Add menu, Turn off, the parts load error.
      if (t.dataset.part) { selectSection(t.dataset.part, 'part'); return; }
      if (t.hasAttribute('data-parts-add')) { if (P.menuOpen()) P.closeMenu(true); else P.openMenu(); return; }
      if (t.hasAttribute('data-part-off') && isPart()) { P.toggle(cur.kind, true); return; }
      if (t.hasAttribute('data-copy-bio') && isPart()) { copyBio(); return; }
      if (t.hasAttribute('data-parts-retry')) { P.read(book.id).then(() => { if (active()) renderManuscript(); }); return; }
      if (t.hasAttribute('data-foot-retry')) { if (saver) saver.retry(); return; }   // E17 (84)
      if (t.hasAttribute('data-retry-load')) { loadOutline(); return; }
      if (t.hasAttribute('data-retry-section')) { openTarget(cur.type, cur.id); return; }
      if (t.hasAttribute('data-retry-versions')) { loadVersions(); return; }
      if (t.hasAttribute('data-retry-version')) { note = null; renderNotes(); makeVersion('button'); return; }
      if (t.hasAttribute('data-save-version')) { makeVersion('button'); return; }
      if (G.handleClick(t)) return;
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
    // E17 N1 (design 78b): Escape while focus is in the panel hides it; focus goes back to the toggle.
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !panelOpen || !els.side.contains(e.target)) return;
      e.preventDefault();
      setPanel(false);
      const b = els.main.querySelector('[data-panel-toggle]');
      if (b) b.focus();
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
      const fit = room(text);
      if (fit) document.execCommand('insertText', false, fit);
    });
    // E17 (80c): the epigraph stops taking text at 1,000 characters (0035 refuses longer drafts).
    ed.addEventListener('beforeinput', (e) => {
      if (!epigraph() || !/^insert/.test(e.inputType) || e.inputType === 'insertFromPaste') return;
      if (e.inputType === 'insertText' && e.data && room(e.data) === e.data) return;
      if (e.inputType !== 'insertText' && room('\n\n').length === 2) return;
      e.preventDefault();
      full();
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

  /** E17 (80c): the part of `text` that still fits in the epigraph (all of it elsewhere). */
  function room(text) {
    if (!epigraph()) return text;
    const ed = els.main.querySelector('[data-editor]');
    const sel = window.getSelection();
    const picked = sel && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.toString().length : 0;
    const left = P.EPIGRAPH_MAX - (MD.fromDom(ed).length - picked);
    return left > 0 ? text.slice(0, left) : '';
  }

  /** Said once when the epigraph is full. */
  function full() {
    announce(`An epigraph holds at most ${fmt(P.EPIGRAPH_MAX)} characters.`);
    renderWords();
  }

  function onInput() {
    if (!cur || cur.state !== 'ready' || locked()) return;
    const ed = els.main.querySelector('[data-editor]');
    let md = MD.fromDom(ed);
    // The last guard (an input that got past beforeinput, as a drop or an undo): the text goes back.
    if (epigraph() && md.length > P.EPIGRAPH_MAX) {
      ed.innerHTML = MD.toHtml(cur.text);
      const end = document.createRange();
      end.selectNodeContents(ed);
      end.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(end);
      md = MD.fromDom(ed);
      full();
    }
    ed.classList.toggle('is-empty', !md);
    if (md === cur.text) return;
    cur.text = md;
    imp.onInput();
    if (!isPart()) chk.onInput();
    saver.edit('draft', 800);
    armIdle();
    renderWords();
    renderFoot();
    if (isPart()) renderPartPill(); else renderManuscriptCount();
    if (tab === 'versions') renderUnsavedRow();
  }

  /** Typing in a part: its pill may change between Empty and Draft (the list is drawn again only then). */
  function renderPartPill() {
    const b = els.ms.querySelector(`[data-part="${cur.id}"] .wr-ms-pills`);
    if (b && !b.querySelector('.is-not_started') !== !!curWords()) renderManuscript();
  }

  /**
   * Typing with the Versions tab open (G2 P2): only the words in the "Unsaved
   * changes" row change, so only they are written. When the row must appear or
   * go, the whole panel renders as before. The Checks count in the tab follows
   * 400 ms after typing stops (chk.onInput), not on every key.
   */
  function renderUnsavedRow() {
    const row = els.side.querySelector('[data-panel-kind="versions"] .wr-vers > .wr-ver.is-unsaved');
    if (!row || !dirty() || cur.conflict) { renderSide(); return; }
    row.querySelector('.wr-ver-top > span').textContent = `${fmt(curWords())} words`;
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

  /** The section of a QC issue: its own, or the chapter's first section with text (a chapter-wide issue). */
  function qcSection(x) {
    if (x.sectionId) return x.sectionId;
    const c = chapters.find((y) => y.id === x.chapterId);
    const list = (c && c.sections) || [];
    const s = list.find(hasWriting) || list[0];
    return s ? s.id : null;
  }

  /** 07 "Open in 06": this section opens with the step, with its spot marked. */
  function openSpot(x) {
    const id = Q.setSpot(x);
    wantSection = cur && cur.id === id ? null : id;
  }

  function init(b, c) {
    ctx = c;
    book = b;
    panelOpen = readPanel();
    // E17 (risk P1): Generate, Checks and the QC bar work on sections only: a part is "nothing open" to them.
    P = kdpWriteParts.create({
      els: () => els,
      isOpen: (id) => !!cur && cur.id === id,
      leave: () => makeVersion('leave'),
      changed: () => { ctx.refresh(); if (active()) renderManuscript(); },
      // Turned on: its editor opens at once (Q-P4), with the focus on its name.
      open: async (id) => {
        if (!(await moveTo('part', id))) return;
        const h = els && els.root.querySelector('[data-sec-title]');
        if (h) h.focus();
      },
      // The open part was turned off: the first section opens (the text stays on the server).
      closed: async (id, fromEditor) => {
        cur = null;
        note = null;
        const pick = load.state === 'ready' && gateOpen() ? firstSection() : null;
        if (pick) await openSection(pick); else if (active()) renderAll();
        if (fromEditor && els) { const b = els.ms.querySelector('[data-parts-add]') || els.root.querySelector('[data-sec-title]'); if (b) b.focus(); }
      },
      error: (text) => { note = { kind: 'error', text }; if (active()) renderNotes(); },
      announce
    });
    AB = kdpWriteAlsoBy.create({
      data: () => P.raw(),
      book: () => book,
      announce,
      changed: () => { ctx.refresh(); if (active()) renderManuscript(); }
    });
    Q = kdpWriteQc.create({
      els: () => els,
      cur: sec,
      active,
      editor: () => (els ? els.main.querySelector('[data-editor]') : null),
      announce,
      sectionOf: qcSection,
      moveTo: moveToSection,
      go: (n) => ctx.go(n)
    });
    imp = kdpWriteImprove.create({
      els: () => els,
      cur: () => cur,
      book: () => book,
      label: () => { if (isPart()) return P.nameOf(cur.kind); const hit = cur && findSection(cur.id); return hit ? sectionLabel(hit.c, hit.s).split(' ')[0] : ''; },
      why: improveWhy,
      changed: () => { if (active() && cur && cur.state === 'ready') { renderHead(); G.render(); renderFoot(); } },
      sync: onInput,
      saveFirst: improveSaveFirst,
      // G3 P9: unsaved typing goes out as the draft before an Improve call (nothing is sent when nothing is unsaved).
      flush: async () => { if (saver && saver.hasUnsaved()) await saver.flush(); },
      hold,
      applied: improveApplied,
      adoptRemote: () => (cur ? adoptRemote(cur.id, null) : undefined),
      // E17 Part 6: a part opens as a part (openSection would look for a section with its id).
      reload: () => (cur ? openTarget(cur.type, cur.id, { keepNote: true }) : undefined),
      noun,
      otherRun: () => { if (cur) { cur.otherRun = true; if (active()) { renderHead(); G.render(); imp.refresh(); } } },
      confirm: confirmDialog,
      // G5: the Checks tab follows Improve (Fix off while a suggestion is open, the Fix major queue).
      // The Needs review alert's Run AI check is off while a Fix major queue runs (G5 live note 3).
      checksChanged: () => { if (chk) chk.refresh(); if (active()) renderNotes(); },
      announce
    });
    chk = kdpWriteChecks.create({
      els: () => els,
      paintToggle: () => paintToggle(),
      cur: sec,
      book: () => book,
      chapters: () => chapters,
      findSection,
      // 22e: Mark Final saves the status as the select does; off when the select is.
      // The select shows the new status (the writer did not change it there).
      setStatus: async (v) => { const ok = await setStatus(v); if (ok && active()) renderHead(); return ok; },
      statusLocked: () => !cur || cur.state !== 'ready' || locked(),
      // "2.3", "Introduction" or "Conclusion" (the Checks tab's "Also in", fix batch 2).
      number: (c, s) => (c.kind === 'chapter' ? `${numberOf(c)}.${c.sections.indexOf(s) + 1}` : c.kind === 'intro' ? 'Introduction' : 'Conclusion'),
      dirty,
      active,
      why: improveWhy,
      posLocked,
      relTime,
      imp: () => imp,
      confirm: confirmDialog,
      // Extra fix A: no draft write from "Save and check" until the check call is sent.
      // G3 P3: the editor is read only for that window too (hold 2, as Accept), so
      // nothing typed can be lost if the tab closes before the draft is sent.
      pauseDrafts: (on) => {
        hold(on ? 2 : 0);
        // Typing during the pause was not sent as a draft: send it now.
        if (!on && dirty() && saver) saver.edit('draft', 800);
      },
      saveFirst: () => improveSaveFirst(true),
      adoptRemote: () => (cur ? adoptRemote(cur.id, null) : undefined),
      announce
    });
    G = kdpWriteGenerate.create({
      els: () => els,
      cur: sec,
      book: () => book,
      imp: () => imp,
      note: () => note,
      setNote: (n) => { note = n; renderNotes(); },
      runFresh: RUN_FRESH,
      maxChars: MAX_CHARS,
      findSection,
      sectionLabel,
      // Generate chapter (E12 fix batch 2, design 23b).
      sectionWords,
      chapterNumber: (c) => numberOf(c),
      chapterById: (id) => chapters.find((c) => c.id === id) || null,
      active,
      announce,
      posLocked,
      confirm: confirmDialog,
      makeVersion,
      openSection,
      loadVersions,
      loadOutline,
      adoptRemote,
      clearIdle,
      refresh: () => ctx.refresh(),
      renderHead,
      renderMainShell,
      renderSide,
      renderManuscript
    });
    wantSection = new URLSearchParams(location.search).get('section');
    wantPart = wantSection ? null : new URLSearchParams(location.search).get('part');
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
    // E17 (84): back online after a failed save: send it again ("The app tries again when you are back online").
    window.addEventListener('online', () => { if (saver && saver.state === 'error' && saver.hasUnsaved()) saver.retry(); else if (active()) renderFoot(); });
    window.addEventListener('offline', () => { if (active()) renderFoot(); });
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
    leave: () => { Q.end(); return makeVersion('leave'); },
    /** Another step, Back/Forward or Exit while the AI writes: ask first (E10.2). Resolves false to stay. */
    confirmLeave: () => confirmLeave(),
    /** "&section=<id>" for the open section (book.js puts the address back after a cancelled Back). */
    sectionQuery: () => query(),
    /** 07 "Open in 06": the session first, then the spot, then ctx.go(6). */
    qcSession: (s) => Q.start(s),
    openSpot,
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && (saver.hasUnsaved() || dirty()),
    saveState: () => (saver ? saver.state : 'idle'),
    /** The book's status changed outside this step (the shell's Reopen, a fresh read): redraw the foot. */
    statusChanged: () => { if (active() && load.state === 'ready' && gateOpen()) renderManuscript(); }
  };
})();
