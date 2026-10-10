/* ═══════════════════════════════════════════════════
   KDP Lab — Step 05 Outline (designs 20, 21)
   /js/book-outline.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[5]. js/book.js calls init() once after the book
   loads, render() each time step 05 is shown, isDone() for the sidebar
   (done = outline approved, E9.2) and needsReview() for its flag.

   - The outline is chapters in order: the Introduction first, the chapters,
     the Conclusion last (migration 0016). Words live on sections only; a
     chapter's total is the sum of its sections (read-only, owner). The
     Introduction and the Conclusion each have one section that holds their
     words, so they show one Words box.
   - Generate / Regenerate (stage outline_ideas) needs a locked positioning
     and asks for the sections per chapter (1 to 6, default 3). The server
     saves the whole outline (replace_outline) and returns it. Regenerate
     replaces everything after a confirm, and is refused once any section
     has writing.
   - Editing: titles, objectives, Examples / Exercise, section titles and
     words save through js/autosave.js. Add chapter / Add section, Delete
     chapter / Remove section (confirm dialog), and drag or Alt + arrow
     keys to reorder chapters save at once.
   - The word budget and the code checks come from our code (js/word-budget.js,
     js/outline-checks.js), never from the AI.
   - AI check (E9.2, stage outline_check): overlapping chapters, parts of the
     reader promise no chapter covers, chapters that leave the positioning.
     The server saves the result (0017 outline_checks) with a fingerprint of
     the outline it read (js/outline-key.js). When the outline on screen has
     another fingerprint, the result is "Out of date": an edit the AI reads
     (titles, objectives, section titles, order), not words or boxes. AI
     lines and pills carry an "AI" label.
   - Approve outline (E9.2, 0017 approve_outline) marks step 05 done. It is
     allowed with warnings; the dialog lists one line per warning, and "AI
     check not run" or "AI check is out of date" as a line that is not
     counted. Any outline edit removes the approval (the server clears it;
     the screen clears it at once and reads it again after a save).
   - Chapters marked "Needs review" (unlock of 03) show a note and a pill.
     Approving clears them.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const C = kdpOutlineChecks;
  const W = kdpWords;
  const KEY = kdpOutlineKey;

  // Same limits as migration 0016 and supabase/functions/generate/lib/limits.ts.
  const MAX = { chapterTitle: 150, objective: 300, sectionTitle: 150, sectionWords: 10000 };
  const MAX_CHAPTERS = 30;
  const MAX_SECTIONS = 12;
  const PER_CHAPTER = { min: 1, max: 6, default: 3 };

  const GRIP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const INFO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const AI = '<span class="otl-ai" title="Found by the AI">AI</span>';
  const CHEVRON = (open) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}"/></svg>`;

  let ctx = null, book = null, saver = null, els = null;
  let load = { state: 'idle' };          // idle | loading | ready | error
  let chapters = [];                     // outline rows in order (js/supabase.js getOutline)
  let savedOrder = [];                   // chapter ids in the last saved order
  let orderChain = Promise.resolve();
  let expanded = new Set();
  let opened = false;                    // the first chapter opens on the first load
  let rawWords = {};                     // section id → what the Words box holds while typing
  let ai = { state: 'idle' };            // idle | working | done | error | stopped
  let aiToken = 0;
  let busy = '';                         // 'add' while Add chapter runs
  let note = null;                       // { text, retry } after a failed add, move or remove
  let lastPer = PER_CHAPTER.default;
  let drag = null;                       // { id } while a chapter is dragged
  let gen = null, del = null, appr = null;   // dialogs, built on first use
  let checkRow = null;                   // the saved AI check { findings, inputs_key, checked_at } or null
  let aiCheck = { state: 'idle' };       // idle | working | error | stopped
  let checkToken = 0;
  let approvalStale = false;             // an edit cleared the approval on screen: read it again after the save
  let approvalSeq = 0;

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const fmt = (n) => n.toLocaleString('en-US');
  const isLocked = () => { const p = one(book.positioning); return !!(p && p.locked_at); };
  const brief = () => one(book.book_briefs) || {};
  const regular = () => chapters.filter((c) => c.kind === 'chapter');
  const findChapter = (id) => chapters.find((c) => c.id === id);
  const findSection = (id) => {
    for (const c of chapters) { const s = (c.sections || []).find((x) => x.id === id); if (s) return { c, s }; }
    return null;
  };
  const numberOf = (c) => regular().indexOf(c) + 1;
  // A version or a draft (0018 has_writing); the server refuses a replace or a delete either way.
  const sectionWritten = (s) => !!(s.has_writing || s.current_version_id || s.has_draft);
  const hasWriting = () => chapters.some((c) => (c.sections || []).some(sectionWritten));
  // Chapters only: an unlock marks the Introduction and Conclusion rows too, but they have no pill.
  const reviewCount = () => regular().filter((c) => c.needs_review).length;
  const fixedName = (c) => (c.kind === 'intro' ? 'Introduction' : 'Conclusion');
  const countOf = (rel) => { const r = one(rel); return r && Number.isInteger(r.count) ? r.count : 0; };

  /* ── AI check and approval ── */

  const lockedAt = () => { const p = one(book.positioning); return p ? p.locked_at : null; };
  const checkStale = () => !!checkRow && checkRow.inputs_key !== KEY(chapters, lockedAt());
  /** The saved AI findings that still apply: the check is current and names chapters that exist. */
  function findings() {
    if (!checkRow || checkStale()) return [];
    const ids = new Set(regular().map((c) => c.id));
    return (checkRow.findings || []).filter((f) => Array.isArray(f.chapters) && f.chapters.every((id) => ids.has(id)));
  }
  /** One line for a finding: "Chapters 3 and 6 cover the same idea". */
  function findingText(f) {
    const n = f.chapters.map((id) => numberOf(findChapter(id)));
    if (f.kind === 'overlap') return `Chapters ${n[0]} and ${n[1]} cover the same idea`;
    if (f.kind === 'drift') return `Chapter ${n[0]} leaves the positioning`;
    return `No chapter covers “${f.quote}” from the reader promise`;
  }
  /** The AI pills on a chapter card. */
  function aiPillTexts(c) {
    const out = [];
    for (const f of findings()) {
      if (!f.chapters.includes(c.id)) continue;
      if (f.kind === 'overlap') out.push(`Overlaps chapter ${numberOf(findChapter(f.chapters.find((x) => x !== c.id)))}`);
      else if (f.kind === 'drift') out.push('Off the positioning');
    }
    return out;
  }
  /** Why the AI check can't run now, or ''. */
  function checkBlock() {
    if (!isLocked()) return 'Lock the positioning in 03 first.';
    if (!regular().some((c) => str(c.title).trim())) return 'Give a chapter a title first.';
    return '';
  }
  /** Why Approve can't run now, or '' (approval with warnings is allowed). */
  function approveBlock() {
    if (!isLocked()) return 'Lock the positioning in 03 first.';
    if (!regular().length) return 'Add a chapter first.';
    const n = regular().findIndex((c) => !str(c.title).trim());
    if (n >= 0) return `Chapter ${n + 1} has no title. Every chapter needs one.`;
    return '';
  }
  /** One line per open warning: the code checks, numbers with no source, then the current AI findings. */
  function warnings() {
    const out = C.check(chapters, brief()).rows.filter((r) => !r.ok).map((r) => r.text);
    regular().forEach((c) => {
      const nums = unsourcedNow(c);
      if (nums.length) out.push(`Chapter ${numberOf(c)}: verify ${nums.join(', ')} (no source)`);
    });
    return out.concat(findings().map(findingText));
  }
  /** "AI check not run" or "AI check is out of date": a line in the dialog, not a warning (owner, E9.2). */
  const aiInfo = () => (!checkRow ? 'AI check not run' : checkStale() ? 'AI check is out of date' : '');
  const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  /** The flagged numbers still in the chapter's text ("Verify: no source"). */
  function unsourcedNow(c) {
    const text = [c.title, c.objective, ...(c.sections || []).map((s) => s.title)].map(str).join('\n');
    const have = new Set((text.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,(?=\d{3}\b)/g, '')));
    return (c.unsourced || []).filter((n) => have.has(n));
  }

  /** Keep the sidebar counts in step with the outline on screen. */
  function syncBook() {
    book.chapters = [{ count: chapters.length }];
    book.review_chapters = [{ count: reviewCount() }];
  }

  /* ── Autosave: one key per field, "c|<id>|title" or "s|<id>|word_target" ── */

  function read(key) {
    const [t, id, f] = key.split('|');
    if (t === 'c') {
      const c = findChapter(id);
      if (!c) return undefined;
      if (f === 'include_examples' || f === 'include_exercise') return !!c[f];
      const v = str(c[f]).trim();
      const max = f === 'title' ? MAX.chapterTitle : MAX.objective;
      if (v.length > max) return { error: `use ${max} characters or fewer.` };
      return v || null;
    }
    const hit = findSection(id);
    if (!hit) return undefined;
    if (f === 'title') {
      const v = str(hit.s.title).trim();
      if (v.length > MAX.sectionTitle) return { error: `use ${MAX.sectionTitle} characters or fewer.` };
      return v || null;
    }
    const raw = rawWords[id] !== undefined ? String(rawWords[id]).trim() : (hit.s.word_target == null ? '' : String(hit.s.word_target));
    if (!raw) return null;
    if (!/^\d+$/.test(raw) || Number(raw) > MAX.sectionWords) return { error: `use a whole number from 0 to ${fmt(MAX.sectionWords)} words.` };
    return Number(raw);
  }

  /** Every dirty field, grouped by row: one update per chapter or section. */
  async function save(fields) {
    const rows = {};
    for (const [key, v] of Object.entries(fields)) {
      if (v === undefined) continue;   // the row was deleted meanwhile
      const [t, id, f] = key.split('|');
      (rows[`${t}|${id}`] = rows[`${t}|${id}`] || { t, id, patch: {} }).patch[f] = v;
    }
    const results = await Promise.all(Object.values(rows).map((r) =>
      (r.t === 'c' ? kdp.updateChapter(r.id, r.patch) : kdp.updateSection(r.id, r.patch)).catch((err) => ({ error: err }))));
    const failed = results.find((r) => r.error);
    if (failed) return { data: null, error: failed.error };
    const times = results.map((r) => r.data && r.data.updated_at).filter(Boolean).sort();
    return { data: { updated_at: times.pop() || null }, error: null };
  }

  function onSaved(res) {
    if (res.data.updated_at) book.updated_at = res.data.updated_at;
    ctx.refresh();
    if (approvalStale) readApproval();
  }

  /**
   * An outline edit removes the approval (0017). The screen shows it at once.
   * A field edit may end up saving the same value (typed and undone), which
   * the server ignores, so `reread` reads the approval again after the save.
   */
  function outlineChanged(reread) {
    if (!book.outline_approved_at) return;
    book.outline_approved_at = null;
    approvalStale = !!reread;
    approvalSeq++;
    ctx.refresh();
    if (active()) renderSide();
  }

  async function readApproval() {
    approvalStale = false;
    const seq = ++approvalSeq;
    let res;
    try { res = await kdp.getOutlineApproval(book.id); } catch (err) { return; }
    if (seq !== approvalSeq || res.error) return;
    if ((res.data || null) === (book.outline_approved_at || null)) return;
    book.outline_approved_at = res.data || null;
    ctx.refresh();
    if (active()) renderSide();
  }

  function onError(res) {
    const e = res.error || {};
    if (e.notFound) {
      saver.reset('error', 'This part of the outline is gone. The outline was reloaded.');
      loadData(true);
      return true;
    }
    if (['23514', '42501', 'P0001'].includes(e.code)) {
      // Drop the edits first: re-rendering a focused field would send them again.
      saver.reset('error', 'This change breaks an Outline rule, so it was not saved.');
      loadData(true);
      return true;
    }
    return false;
  }

  /** Forget the edits of a row that is about to go. */
  function dropKeys(prefixes) {
    for (const f of ['title', 'objective', 'include_examples', 'include_exercise', 'word_target']) {
      prefixes.forEach((p) => saver.drop(`${p}|${f}`));
    }
  }

  /** Before a change of structure: save the edits, or say why not. */
  async function settle() {
    if (saver.hasUnsaved()) await saver.flush();
    return !(saver.state === 'error' && saver.hasUnsaved());
  }

  /* ── Data ────────────────────────────────── */

  async function loadData(quiet) {
    if (!quiet || load.state !== 'ready') { load = { state: 'loading' }; if (active()) renderAll(); }
    const safe = (p) => p.catch((err) => ({ error: err }));
    const [res, chk] = await Promise.all([safe(kdp.getOutline(book.id)), safe(kdp.getOutlineCheck(book.id))]);
    if (res.error) {
      if (!quiet || load.state !== 'ready') load = { state: 'error' };
    } else {
      setOutline(res.data);
      // The AI check is extra: when it can't load, the outline still works.
      if (!chk.error && aiCheck.state !== 'working') checkRow = chk.data || null;
      load = { state: 'ready' };
      ctx.refresh();
    }
    if (active()) renderAll();
    if (approvalStale) readApproval();
  }

  function setOutline(rows) {
    chapters = (rows || []).map((c) => ({ ...c, sections: (c.sections || []).slice() }));
    savedOrder = regular().map((c) => c.id);
    rawWords = {};
    const first = regular()[0];
    if (!opened && first) { expanded.add(first.id); opened = true; }
    syncBook();
  }

  const active = () => !!els && ctx.isActive(5);

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    root.innerHTML = `
      <div class="otl">
        <div class="otl-main">
          <div class="otl-top" data-top></div>
          <div data-list></div>
        </div>
        <aside class="otl-side" aria-label="Word budget and outline check">
          <section class="panel otl-panel" data-budget aria-labelledby="otlBudget"></section>
          <section class="panel otl-panel" data-checks aria-labelledby="otlChecks"></section>
          <section class="panel otl-panel" data-approve-card aria-labelledby="otlApprove"></section>
        </aside>
        <p class="sr-only" aria-live="polite" data-live></p>
      </div>`;
    els = {
      root,
      top: root.querySelector('[data-top]'),
      list: root.querySelector('[data-list]'),
      budget: root.querySelector('[data-budget]'),
      checks: root.querySelector('[data-checks]'),
      approve: root.querySelector('[data-approve-card]'),
      live: root.querySelector('[data-live]')
    };
    bind(root.querySelector('.otl'));
    if (load.state === 'idle') loadData();
    else {
      renderAll();
      // Another step may have changed the outline (an unlock marks chapters): read it again.
      if (load.state === 'ready' && !saver.hasUnsaved() && ai.state !== 'working' && aiCheck.state !== 'working') loadData(true);
    }
  }

  /** Re-render, then put the focus back on the same field (by id). */
  function renderAll() {
    if (!els) return;
    const a = document.activeElement;
    const id = a && els.root.contains(a) && a.id ? a.id : null;
    const sel = id && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    renderTop();
    renderList();
    renderSide();
    if (id) {
      const el = document.getElementById(id);
      if (el && el !== document.activeElement) {
        el.focus();
        if (sel && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } }
      }
    }
  }

  function genDisabledReason() {
    if (!isLocked()) return 'locked';
    if (hasWriting()) return 'writing';
    return '';
  }

  function renderTop() {
    if (load.state !== 'ready') { els.top.innerHTML = ''; return; }
    const parts = [];
    if (chapters.length) {
      const off = ai.state === 'working' || !!genDisabledReason();
      parts.push(`<div class="otl-lead-row">
          <p class="otl-lead">Each chapter answers one question: what can the reader do after it?</p>
          <button type="button" class="btn btn-secondary" data-generate${off ? ' disabled' : ''}>${ICON.sparkle}Regenerate outline</button>
        </div>`);
      if (!isLocked()) {
        parts.push(`<p class="ttl-note is-warn">${ICON.warn(16)}<span>The positioning is unlocked. Lock it in 03 again to regenerate. You can still edit the outline. <a href="?id=${encodeURIComponent(book.id)}&step=3">Go to 03 Positioning</a></span></p>`);
      } else if (hasWriting()) {
        parts.push(`<p class="ttl-note">Some sections have writing, so the outline can’t be replaced. Edit it by hand.</p>`);
      }
      const n = reviewCount();
      if (n) {
        parts.push(`<p class="ttl-note is-warn" data-review-note>${ICON.warn(16)}<span><strong>Needs review.</strong> The positioning was unlocked after this outline was made, so ${n === 1 ? '1 chapter is' : `${n} chapters are`} marked. Check each one against the positioning.</span></p>`);
      }
    }
    parts.push(`<div data-status>${statusHtml()}</div>`);
    els.top.innerHTML = parts.join('');
  }

  function statusHtml() {
    if (ai.state === 'stopped') return '<p class="help-note" role="status">Stopped. If the AI had already finished, this call may still count.</p>';
    if (ai.state === 'error') return alertHtml(ai.code);
    if (ai.state === 'done') {
      const d = ai.done;
      return `<p class="help-note" role="status">${ICON.sparkle}<span>Outline ready: ${d.chapters} chapters, ${fmt(d.words)} words.${d.picked ? ' The AI picked the number of chapters.' : ''}${d.rescaled ? ' Word counts were scaled to your target.' : ''}</span></p>`;
    }
    if (note) {
      return `<div class="alert alert-error" role="alert">${ICON.warn(18)}<div><p class="alert-text">${esc(note.text)}</p>${note.retry ? '<button type="button" class="link-btn" data-note-retry>Try again</button>' : ''}</div></div>`;
    }
    return '';
  }

  /** [kind, text, retry] for an error code. */
  function aiMessage(code) {
    switch (code) {
      case 'positioning_not_locked': return ['warning', 'Lock your positioning in 03 first. The outline follows it.', false];
      case 'has_writing': return ['warning', 'Some sections have writing, so the outline can’t be replaced. Edit it by hand.', false];
      case 'not_enough_facts': return ['warning', 'Add a topic in 01 Brief first.', false];
      default: return kdpUi.aiMessage(code);
    }
  }

  function alertHtml(code) {
    const [kind, text, retry] = aiMessage(code);
    return `<div class="alert alert-${kind}" role="alert">${ICON.warn(18)}<div>
        <p class="alert-text">${esc(text)}</p>
        ${retry ? '<button type="button" class="link-btn" data-generate-retry>Try again</button>' : ''}
      </div></div>`;
  }

  function renderList() {
    const box = els.list;
    if (load.state === 'loading' || load.state === 'idle') {
      box.innerHTML = '<p class="sr-only" role="status">Loading the outline…</p><div class="panel ttl-skel" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div><div class="skel skel-line"></div></div>';
      return;
    }
    if (load.state === 'error') {
      box.innerHTML = `<div class="alert alert-error" role="alert">${ICON.warn(18)}<div>
          <p class="alert-text">We couldn’t load the outline. Check your connection, then try again.</p>
          <button type="button" class="link-btn" data-reload>Try again</button></div></div>`;
      return;
    }
    if (ai.state === 'working') {
      box.innerHTML = `<div class="panel ttl-working" role="status">
          <div class="help-working"><span class="spinner" aria-hidden="true"></span>Writing your outline from the locked positioning…</div>
          <div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div><div class="skel skel-line"></div>
          <div><button type="button" class="btn btn-secondary" data-stop>Stop</button></div>
        </div>`;
      return;
    }
    if (!chapters.length) {
      box.innerHTML = isLocked()
        ? `<div class="otl-empty">
            <h2 class="ttl-h2">No outline yet</h2>
            <p class="ttl-sub">Generate one from your locked positioning, or start with one chapter and build it yourself.</p>
            <div class="otl-empty-actions">
              <button type="button" class="btn btn-primary" data-generate>${ICON.sparkle}Generate outline</button>
              <button type="button" class="btn btn-secondary" data-add-chapter${busy ? ' disabled' : ''}>${ICON.plus}Add chapter</button>
            </div>
          </div>`
        : `<div class="otl-empty">
            <h2 class="ttl-h2">Lock your positioning first</h2>
            <p class="ttl-note is-warn">${ICON.warn(16)}<span>The outline is built from your locked positioning. <a href="?id=${encodeURIComponent(book.id)}&step=3">Go to 03 Positioning</a></span></p>
          </div>`;
      return;
    }
    const full = regular().length >= MAX_CHAPTERS;
    const items = chapters.map((c) => (c.kind === 'chapter' ? chapterHtml(c) : fixedHtml(c)));
    const addAt = chapters.findIndex((c) => c.kind === 'conclusion');
    const add = `<li class="otl-add-row">
        <button type="button" class="otl-add" data-add-chapter${full || busy ? ' disabled' : ''}>${busy === 'add' ? '<span class="spinner" aria-hidden="true"></span>Adding…' : `${ICON.plus}Add chapter`}</button>
        ${full ? `<p class="field-hint">A book can have ${MAX_CHAPTERS} chapters.</p>` : ''}
      </li>`;
    items.splice(addAt < 0 ? items.length : addAt, 0, add);
    box.innerHTML = `<ul class="otl-list" data-chapters>${items.join('')}</ul>`;
  }

  function pillsHtml(c, checks) {
    const pills = [];
    if (c.needs_review) pills.push(`<span class="check-badge warn">${ICON.warn()}Needs review</span>`);
    (checks.byChapter[c.id] || []).forEach((p) => pills.push(`<span class="check-badge warn">${ICON.warn()}${esc(p.text)}</span>`));
    const nums = unsourcedNow(c);
    if (nums.length) pills.push(`<span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(nums.join(', '))}</span>`);
    aiPillTexts(c).forEach((t) => pills.push(`<span class="check-badge warn">${ICON.warn()}${esc(t)} ${AI}</span>`));
    return pills.join('');
  }

  const isWarn = (c, checks) => !!(checks.byChapter[c.id] || c.needs_review || unsourcedNow(c).length || aiPillTexts(c).length);

  function chapterHtml(c) {
    const n = numberOf(c);
    const open = expanded.has(c.id);
    const checks = C.check(chapters, brief());
    const warn = isWarn(c, checks);
    const title = str(c.title).trim();
    const name = title ? `Chapter ${n}: ${title}` : `Chapter ${n}`;
    return `<li class="otl-ch${warn ? ' is-warn' : ''}" data-ch="${c.id}">
        <div class="otl-ch-head">
          <button type="button" class="otl-handle" id="otlH-${c.id}" data-handle="${c.id}" draggable="true" aria-label="Move ${esc(name)}. Use Alt and the arrow keys.">${GRIP}</button>
          <span class="otl-num" aria-hidden="true">${n}</span>
          <div class="otl-ch-text">
            <h3 class="otl-ch-title" data-head-title>${titleText(c)}</h3>
            <p class="otl-obj" data-head-obj>${objText(c)}</p>
          </div>
          <div class="otl-pills" data-pills="${c.id}">${pillsHtml(c, checks)}</div>
          <div class="otl-words"><span>Words</span><strong data-total="${c.id}">${fmt(C.chapterWords(c))}</strong></div>
          <button type="button" class="icon-btn otl-toggle" id="otlX-${c.id}" data-toggle="${c.id}" aria-expanded="${open}" aria-controls="otlB-${c.id}" aria-label="${open ? 'Close' : 'Open'} ${esc(name)}">${CHEVRON(open)}</button>
        </div>
        ${open ? bodyHtml(c, n) : ''}
      </li>`;
  }

  const titleText = (c) => (str(c.title).trim() ? esc(c.title.trim()) : '<span class="otl-untitled">Untitled chapter</span>');
  const objText = (c) => `Objective: ${str(c.objective).trim() ? esc(c.objective.trim()) : '<span class="otl-missing">No objective yet</span>'}`;

  function bodyHtml(c, n) {
    const secs = c.sections || [];
    const full = secs.length >= MAX_SECTIONS;
    return `<div class="otl-ch-body" id="otlB-${c.id}">
        <div class="otl-fields">
          <div class="field">
            <label for="otlT-${c.id}">Chapter title</label>
            <input type="text" class="text-input" id="otlT-${c.id}" data-c="${c.id}" data-f="title" maxlength="${MAX.chapterTitle}" autocomplete="off" value="${esc(str(c.title))}">
          </div>
          <div class="field">
            <label for="otlO-${c.id}">Objective</label>
            <textarea class="text-input otl-objarea" id="otlO-${c.id}" data-c="${c.id}" data-f="objective" rows="2" maxlength="${MAX.objective}" placeholder="Reader can …" aria-describedby="otlOH-${c.id}">${esc(str(c.objective))}</textarea>
            <span class="field-hint" id="otlOH-${c.id}">What can the reader do after this chapter?</span>
          </div>
        </div>
        ${secs.length ? `<ol class="otl-secs">${secs.map((s, j) => sectionHtml(s, n, j + 1)).join('')}</ol>` : '<p class="ttl-sub">No sections yet. Add one to plan the words.</p>'}
        <div class="otl-ch-foot">
          <label class="otl-check"><input type="checkbox" data-c="${c.id}" data-f="include_examples"${c.include_examples ? ' checked' : ''}>Examples</label>
          <label class="otl-check"><input type="checkbox" data-c="${c.id}" data-f="include_exercise"${c.include_exercise ? ' checked' : ''}>Exercise</label>
          <button type="button" class="btn btn-secondary btn-sm" id="otlAS-${c.id}" data-add-section="${c.id}"${full ? ' disabled' : ''}>${ICON.plus}Add section</button>
          <button type="button" class="btn btn-secondary btn-sm btn-danger-text otl-del" id="otlD-${c.id}" data-del-chapter="${c.id}">${ICON.trash()}Delete chapter</button>
        </div>
        ${full ? `<p class="field-hint">A chapter can have ${MAX_SECTIONS} sections.</p>` : ''}
      </div>`;
  }

  function wordsValue(s) {
    if (rawWords[s.id] !== undefined) return esc(String(rawWords[s.id]));
    return s.word_target == null ? '' : String(s.word_target);
  }

  function sectionHtml(s, n, j) {
    const bad = rawWords[s.id] !== undefined && typeof read(`s|${s.id}|word_target`) === 'object' && read(`s|${s.id}|word_target`) !== null;
    return `<li class="otl-sec" data-sec="${s.id}">
        <span class="otl-secnum" aria-hidden="true">${n}.${j}</span>
        <label class="sr-only" for="otlST-${s.id}">Section ${n}.${j} title</label>
        <input type="text" class="text-input otl-sec-title" id="otlST-${s.id}" data-s="${s.id}" data-f="title" maxlength="${MAX.sectionTitle}" autocomplete="off" placeholder="Section title" value="${esc(str(s.title))}">
        <label class="otl-sec-words" for="otlSW-${s.id}"><span>Words</span></label>
        <input type="text" class="text-input otl-num-input" id="otlSW-${s.id}" data-s="${s.id}" data-f="word_target" inputmode="numeric" autocomplete="off" aria-label="Words for section ${n}.${j}"${bad ? ' aria-invalid="true"' : ''} value="${wordsValue(s)}">
        <button type="button" class="icon-btn" id="otlSD-${s.id}" data-del-section="${s.id}" aria-label="Remove section ${n}.${j}">${ICON.trash()}</button>
      </li>`;
  }

  function fixedHtml(c) {
    const s = (c.sections || [])[0];
    const name = fixedName(c);
    return `<li class="otl-ch otl-fixed" data-ch="${c.id}">
        <div class="otl-ch-head">
          <span class="otl-handle-gap" aria-hidden="true"></span>
          <div class="otl-ch-text"><h3 class="otl-ch-title">${name}</h3></div>
          <div class="otl-words">
            <label for="otlW-${c.id}">Words</label>
            <input type="text" class="text-input otl-num-input" id="otlW-${c.id}" inputmode="numeric" autocomplete="off"${s ? ` data-s="${s.id}" data-f="word_target" value="${wordsValue(s)}"` : ' disabled'}>
          </div>
        </div>
      </li>`;
  }

  /* Side cards: the word budget and the checks. */

  function renderSide() {
    if (load.state !== 'ready') {
      els.budget.innerHTML = '<h2 class="ttl-label" id="otlBudget">WORD BUDGET</h2><div class="skel skel-line" aria-hidden="true"></div>';
      els.checks.innerHTML = '<h2 class="ttl-label" id="otlChecks">OUTLINE CHECK</h2>';
      els.approve.innerHTML = '';
      els.approve.hidden = true;
      return;
    }
    renderBudget();
    renderChecks();
    renderApprove();
  }

  function renderBudget() {
    const total = C.planned(chapters);
    const t = W.target(brief());
    const trim = brief().trim_size || '6x9';
    const trimText = `${trim.replace('x', ' × ')} in`;
    let bar = '', state = '', target = 'planned · no target yet';
    if (t) {
      const marks = t.max === null ? [t.min] : [t.min, t.max];
      const scale = Math.max(total, marks[marks.length - 1]) * 1.05 || 1;
      const ok = W.within(total, t);
      bar = `<div class="otl-bar" aria-hidden="true">
          <div class="otl-fill ${ok ? 'is-ok' : 'is-warn'}" style="width:${Math.min(100, (total / scale) * 100).toFixed(1)}%"></div>
          ${marks.map((m) => `<span class="otl-mark" style="left:${((m / scale) * 100).toFixed(1)}%"></span>`).join('')}
        </div>`;
      target = `planned · target ${t.label}`;
      state = ok
        ? `<p class="ttl-note is-pass">${ICON.check(16)}<span>Within the target</span></p>`
        : `<p class="ttl-note is-warn">${ICON.warn(16)}<span>${total < t.min ? 'Under the target' : 'Over the target'}</span></p>`;
    }
    const pages = total > 0 ? `≈ ${W.pages(total, trim)} pages at ${trimText}` : '';
    const marksText = t ? (t.max === null ? `mark shows ${W.short(t.min)}` : `marks show ${W.short(t.min)} and ${W.short(t.max)}`) : '';
    els.budget.innerHTML = `
      <h2 class="ttl-label" id="otlBudget">WORD BUDGET</h2>
      <p class="otl-big" data-planned>${fmt(total)}</p>
      <p class="ttl-sub">${esc(target)}</p>
      ${bar}
      ${pages || marksText ? `<p class="otl-small">${[pages, marksText].filter(Boolean).join(' · ')}</p>` : ''}
      ${t ? state : `<p class="ttl-sub">No target yet. <a href="?id=${encodeURIComponent(book.id)}&step=1">Set the length in 01 Brief</a>.</p>`}`;
  }

  function renderChecks() {
    const r = C.check(chapters, brief());
    const rows = r.rows.map((x) => (x.ok
      ? `<li class="is-pass">${ICON.check(16)}<span>${esc(x.text)}</span></li>`
      : `<li class="is-warn">${ICON.warn(16)}<span>${esc(x.text)}</span></li>`)).join('');
    els.checks.innerHTML = `
      <div class="otl-check-head"><h2 class="ttl-label" id="otlChecks" tabindex="-1">OUTLINE CHECK</h2><span class="otl-by">Checked by KDP Lab</span></div>
      ${rows ? `<ul class="ttl-check-list" data-check-list>${rows}</ul>` : '<p class="ttl-sub">Checks show here once you have chapters.</p>'}
      ${regular().length ? `<div class="otl-ai-block" role="group" data-ai-check aria-labelledby="otlAi">${aiCheckHtml()}</div>` : ''}`;
  }

  /** The AI part of the Outline check card (stage outline_check). */
  function aiCheckHtml() {
    const stale = checkStale();
    const time = checkRow && checkRow.checked_at ? `<span class="otl-by" data-ai-time>Checked ${esc(when(checkRow.checked_at))}</span>` : '';
    const head = `<div class="otl-check-head"><h3 class="ttl-label" id="otlAi" tabindex="-1">AI CHECK</h3>${time}</div>`;
    if (aiCheck.state === 'working') {
      return `${head}
        <div class="help-working" role="status"><span class="spinner" aria-hidden="true"></span>Checking the outline…</div>
        <div><button type="button" class="btn btn-secondary btn-sm" data-check-stop>Stop</button></div>`;
    }
    const parts = [head];
    if (checkRow) {
      const all = (checkRow.findings || []).filter((f) => Array.isArray(f.chapters) && f.chapters.every((id) => findChapter(id)));
      const line = (f) => `<li class="is-warn">${ICON.warn(16)}<span class="otl-ai-text"><span>${esc(findingText(f))} ${AI}</span>`
        + `<span class="otl-why">${esc(f.why)}</span>`
        + `${(f.unsourced || []).length ? `<span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(f.unsourced.join(', '))}</span>` : ''}</span></li>`;
      const pass = (t) => `<li class="is-pass">${ICON.check(16)}<span class="otl-ai-text"><span>${t} ${AI}</span></span></li>`;
      const of = (k) => all.filter((f) => f.kind === k);
      const rows = [
        of('overlap').length ? of('overlap').map(line).join('') : pass('No two chapters cover the same idea'),
        of('promise_gap').length ? of('promise_gap').map(line).join('') : pass('Covers the reader promise'),
        of('drift').length ? of('drift').map(line).join('') : pass('Every chapter follows the positioning')
      ];
      parts.push(`<ul class="ttl-check-list${stale ? ' is-stale' : ''}" data-ai-list>${rows.join('')}</ul>`);
    } else {
      parts.push('<p class="ttl-sub">Not run yet. The AI looks for chapters that cover the same idea, parts of the reader promise no chapter covers, and chapters that leave the positioning.</p>');
    }
    if (aiCheck.state === 'error') {
      const [kind, text, retry] = checkMessage(aiCheck.code);
      parts.push(`<div class="alert alert-${kind}" role="alert">${ICON.warn(18)}<div>
          <p class="alert-text">${esc(text)}</p>
          ${retry ? '<button type="button" class="link-btn" data-check-retry>Try again</button>' : ''}
        </div></div>`);
    } else if (aiCheck.state === 'stopped') {
      parts.push('<p class="help-note" role="status" data-ai-note>Stopped. If the AI had already finished, this call may still count.</p>');
    } else if (stale) {
      parts.push(`<p class="ttl-note is-warn" data-ai-note>${ICON.warn(16)}<span><strong>Out of date.</strong> The outline changed after the AI check. Check again.</span></p>`);
    }
    const block = checkBlock();
    const off = !!block || ai.state === 'working';
    parts.push(`<div class="otl-ai-actions">
        <button type="button" class="btn btn-secondary" data-check${off ? ' disabled' : ''}${block ? ' aria-describedby="otlCheckWhy"' : ''}>${ICON.sparkle}${checkRow ? 'Check again' : 'Check outline'}</button>
        ${block ? `<p class="field-hint" id="otlCheckWhy" data-check-why>${esc(block)}</p>` : ''}
      </div>`);
    return parts.join('');
  }

  /** [kind, text, retry] for an AI check error code. */
  function checkMessage(code) {
    switch (code) {
      case 'positioning_not_locked': return ['warning', 'Lock your positioning in 03 first. The check compares the outline with it.', false];
      case 'nothing_to_check': return ['warning', 'Give at least one chapter a title first.', false];
      default: return kdpUi.aiMessage(code);
    }
  }

  /** The Approve outline card (design 20). */
  function renderApprove() {
    els.approve.hidden = false;
    if (book.outline_approved_at) {
      els.approve.innerHTML = `
        <h2 class="otl-h2" id="otlApprove" tabindex="-1">Outline approved</h2>
        <p class="ttl-note is-pass" data-approved>${ICON.check(16)}<span>Approved ${esc(when(book.outline_approved_at))}. Step 05 is done.</span></p>
        <p class="ttl-sub">Any change to the outline removes the approval. Approve it again after.</p>`;
      return;
    }
    const block = approveBlock();
    const n = warnings().length;
    const text = n ? `Writing follows this structure. Fix the ${n === 1 ? '1 warning' : `${n} warnings`}, or approve anyway.` : 'Writing follows this structure.';
    const off = !!block || ai.state === 'working';
    els.approve.innerHTML = `
      <h2 class="otl-h2" id="otlApprove" tabindex="-1">Approve outline</h2>
      <p class="ttl-sub" data-approve-text>${esc(text)}</p>
      <button type="button" class="btn btn-primary otl-approve-btn" data-approve${off ? ' disabled' : ''}${block ? ' aria-describedby="otlApproveWhy"' : ''}>Approve outline</button>
      ${block ? `<p class="field-hint" id="otlApproveWhy" data-approve-why>${esc(block)}</p>` : ''}`;
  }

  /** After typing: totals, the chapter head, pills, budget and checks, without re-rendering the fields. */
  function renderDerived(c) {
    if (!els) return;
    if (c && c.kind === 'chapter') {
      const li = els.list.querySelector(`[data-ch="${c.id}"]`);
      if (li) {
        li.querySelector('[data-head-title]').innerHTML = titleText(c);
        li.querySelector('[data-head-obj]').innerHTML = objText(c);
        li.querySelector(`[data-total="${c.id}"]`).textContent = fmt(C.chapterWords(c));
      }
    }
    const checks = C.check(chapters, brief());
    regular().forEach((x) => {
      const p = els.list.querySelector(`[data-pills="${x.id}"]`);
      if (p) p.innerHTML = pillsHtml(x, checks);
      const li = els.list.querySelector(`[data-ch="${x.id}"]`);
      if (li) li.classList.toggle('is-warn', isWarn(x, checks));
    });
    renderSide();
  }

  const announce = (text) => { if (els) { els.live.textContent = ''; els.live.textContent = text; } };

  /* ── Events ──────────────────────────────── */

  function bind(root) {
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.c && t.type !== 'checkbox') {
        const c = findChapter(t.dataset.c);
        if (!c) return;
        c[t.dataset.f] = t.value;
        saver.edit(`c|${c.id}|${t.dataset.f}`, 800);
        clearDone();
        outlineChanged(true);
        renderDerived(c);
      } else if (t.dataset.s) {
        const hit = findSection(t.dataset.s);
        if (!hit) return;
        if (t.dataset.f === 'word_target') {
          rawWords[hit.s.id] = t.value;
          const v = read(`s|${hit.s.id}|word_target`);
          const bad = v !== null && typeof v === 'object';
          t.setAttribute('aria-invalid', bad ? 'true' : 'false');
          if (!bad) hit.s.word_target = v;
        } else {
          hit.s.title = t.value;
        }
        saver.edit(`s|${hit.s.id}|${t.dataset.f}`, 800);
        clearDone();
        outlineChanged(true);
        renderDerived(hit.c);
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.type !== 'checkbox' || !t.dataset.c) return;
      const c = findChapter(t.dataset.c);
      if (!c) return;
      c[t.dataset.f] = t.checked;
      saver.edit(`c|${c.id}|${t.dataset.f}`, 0);
      outlineChanged(true);
    });
    root.addEventListener('focusout', (e) => {
      const t = e.target;
      if ((t.dataset.c || t.dataset.s) && saver.hasUnsaved() && saver.scheduled()) saver.flush();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.matches('[data-generate], [data-generate-retry]')) return openGenerate();
      if (b.matches('[data-stop]')) return stop();
      if (b.matches('[data-check], [data-check-retry]')) return runCheck();
      if (b.matches('[data-check-stop]')) return stopCheck();
      if (b.matches('[data-approve]')) return openApprove();
      if (b.matches('[data-reload]')) return loadData();
      if (b.matches('[data-note-retry]')) { const r = note && note.retry; note = null; renderTop(); if (r) r(); return; }
      if (b.dataset.toggle) return toggle(b.dataset.toggle);
      if (b.matches('[data-add-chapter]')) return addChapter();
      if (b.dataset.addSection) return addSection(b.dataset.addSection);
      if (b.dataset.delChapter) return openDelete('chapter', b.dataset.delChapter);
      if (b.dataset.delSection) return openDelete('section', b.dataset.delSection);
    });
    root.addEventListener('keydown', (e) => {
      const h = e.target.closest && e.target.closest('[data-handle]');
      if (!h || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const c = findChapter(h.dataset.handle);
      const i = regular().indexOf(c);
      move(c.id, e.key === 'ArrowUp' ? i - 1 : i + 1, true);
    });

    // Drag a chapter by its handle; a line shows where it will land (design 21).
    root.addEventListener('dragstart', (e) => {
      const h = e.target.closest && e.target.closest('[data-handle]');
      if (!h) return;
      drag = { id: h.dataset.handle };
      const li = h.closest('[data-ch]');
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', drag.id);
      try { e.dataTransfer.setDragImage(li, 24, 24); } catch (err) { /* older browsers */ }
    });
    root.addEventListener('dragover', (e) => {
      if (!drag) return;
      const spot = dropSpot(e);
      clearDrop();
      if (!spot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      spot.li.classList.add(spot.after ? 'drop-after' : 'drop-before');
    });
    root.addEventListener('drop', (e) => {
      if (!drag) return;
      const spot = dropSpot(e);
      e.preventDefault();
      clearDrop();
      const id = drag.id;
      drag = null;
      if (!spot) return;
      const list = regular();
      const from = list.findIndex((c) => c.id === id);
      let to = list.findIndex((c) => c.id === spot.li.dataset.ch) + (spot.after ? 1 : 0);
      if (to > from) to -= 1;
      move(id, to, false);
    });
    root.addEventListener('dragend', () => {
      drag = null;
      clearDrop();
      els.list.querySelectorAll('.is-dragging').forEach((li) => li.classList.remove('is-dragging'));
    });
  }

  /** The chapter under the pointer and which half of it, or null (Introduction, Conclusion, gaps). */
  function dropSpot(e) {
    const li = e.target.closest && e.target.closest('.otl-ch[data-ch]');
    if (!li || li.classList.contains('otl-fixed')) return null;
    const r = li.getBoundingClientRect();
    return { li, after: e.clientY > r.top + r.height / 2 };
  }

  function clearDrop() {
    if (!els) return;
    els.list.querySelectorAll('.drop-before, .drop-after').forEach((li) => li.classList.remove('drop-before', 'drop-after'));
  }

  function toggle(id) {
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    renderList();
    const b = els.list.querySelector(`[data-toggle="${id}"]`);
    if (b) b.focus();
  }

  /** "N chapters, M words" is only news until the next edit. */
  function clearDone() {
    if (ai.state !== 'done' && ai.state !== 'stopped' && !note) return;
    if (ai.state === 'done' || ai.state === 'stopped') ai = { state: 'idle' };
    note = null;
    const s = els && els.top.querySelector('[data-status]');
    if (s) s.innerHTML = '';
  }

  /* ── Reorder ─────────────────────────────── */

  /** Move a chapter to place `to` among the chapters, then save the whole order. */
  function move(id, to, byKey) {
    const list = regular();
    const from = list.findIndex((c) => c.id === id);
    if (from < 0 || to < 0 || to >= list.length || to === from) return;
    const [c] = list.splice(from, 1);
    list.splice(to, 0, c);
    setOrder(list.map((x) => x.id));
    clearDone();
    outlineChanged(false);
    renderList();
    renderSide();
    const h = els.list.querySelector(`[data-handle="${id}"]`);
    if (byKey && h) h.focus();
    announce(`Chapter moved to position ${to + 1} of ${list.length}.`);
    saveOrder(list.map((x) => x.id));
  }

  /** Put the chapters in this order; the Introduction stays first, the Conclusion last. */
  function setOrder(ids) {
    const intro = chapters.filter((c) => c.kind === 'intro');
    const end = chapters.filter((c) => c.kind === 'conclusion');
    const byId = new Map(regular().map((c) => [c.id, c]));
    chapters = [...intro, ...ids.map((x) => byId.get(x)).filter(Boolean), ...end];
  }

  /** One order save at a time, in order. A failure puts back the last saved order. */
  function saveOrder(ids) {
    orderChain = orderChain.then(async () => {
      let res;
      try { res = await kdp.reorderChapters(book.id, ids); } catch (err) { res = { error: err }; }
      if (!res.error) { savedOrder = ids; return; }
      if (res.error.message === 'outline_changed') {
        note = { text: 'The chapters changed in another tab. The outline was reloaded.' };
        await loadData(true);
        return;
      }
      setOrder(savedOrder);
      note = { text: 'We couldn’t save the new order. Check your connection, then try again.' };
      if (active()) renderAll();
    });
  }

  /* ── Add ─────────────────────────────────── */

  async function addChapter() {
    if (busy || regular().length >= MAX_CHAPTERS) return;
    busy = 'add';
    note = null;
    clearDone();
    renderList();
    if (!(await settle())) { busy = ''; failed('save_first'); return; }
    let res;
    try { res = await kdp.addChapter(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      busy = '';
      note = res.error.message === 'outline_full'
        ? { text: `A book can have ${MAX_CHAPTERS} chapters.` }
        : { text: 'We couldn’t add a chapter. Check your connection, then try again.', retry: addChapter };
      if (active()) renderAll();
      return;
    }
    const id = res.data;
    expanded.add(id);
    let out;
    try { out = await kdp.getOutline(book.id); } catch (err) { out = { error: err }; }
    busy = '';
    if (!out.error) setOutline(out.data);
    outlineChanged(false);
    ctx.refresh();
    if (!active()) return;
    renderAll();
    const input = document.getElementById(`otlT-${id}`);
    if (input) input.focus();
    announce('Chapter added.');
  }

  async function addSection(chapterId) {
    const c = findChapter(chapterId);
    if (!c || (c.sections || []).length >= MAX_SECTIONS) return;
    clearDone();
    const pos = (c.sections || []).reduce((m, s) => Math.max(m, s.position || 0), 0) + 1;
    let res;
    try { res = await kdp.addSection(c.id, pos); } catch (err) { res = { error: err }; }
    if (res.error) {
      note = res.error.message === 'sections_full'
        ? { text: `A chapter can have ${MAX_SECTIONS} sections.` }
        : { text: 'We couldn’t add a section. Check your connection, then try again.', retry: () => addSection(chapterId) };
      if (res.error.notFound) { note = null; loadData(true); return; }
      renderTop();
      return;
    }
    c.sections.push(res.data);
    outlineChanged(false);
    if (!active()) return;
    renderList();
    renderSide();
    const input = document.getElementById(`otlST-${res.data.id}`);
    if (input) input.focus();
    announce('Section added.');
  }

  /* ── Delete chapter / Remove section ─────── */

  function buildDelete() {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', 'odTitle');
    d.setAttribute('aria-describedby', 'odDesc');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="delete-head">
          <span class="delete-icon">${ICON.trash(20)}</span>
          <h2 id="odTitle"></h2>
        </div>
        <p class="delete-text" id="odDesc"></p>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-danger" data-confirm></button>
        </div>
      </form>`;
    document.body.append(d);
    del = { d, title: d.querySelector('#odTitle'), text: d.querySelector('#odDesc'), error: d.querySelector('[data-error]'), btn: d.querySelector('[data-confirm]'), busy: false, done: false, target: null };
    const close = () => { if (!del.busy) d.close(); };
    d.querySelector('[data-close]').addEventListener('click', close);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => {
      if (del.done || !active()) return;
      const t = del.target;
      const b = document.getElementById(t.kind === 'chapter' ? `otlD-${t.id}` : `otlSD-${t.id}`);
      if (b) b.focus();
    });
    d.querySelector('form').addEventListener('submit', onDelete);
  }

  function openDelete(kind, id) {
    if (!del) buildDelete();
    let title, text, label, written;
    if (kind === 'chapter') {
      const c = findChapter(id);
      if (!c) return;
      const n = numberOf(c);
      const k = (c.sections || []).length;
      const name = str(c.title).trim() ? `“${c.title.trim()}”` : 'This chapter';
      written = (c.sections || []).some(sectionWritten);
      title = written ? `Chapter ${n} has writing` : `Delete chapter ${n}?`;
      text = written
        ? `This chapter has writing, so it can’t be deleted. ${name} keeps its sections and their text.`
        : `${k ? `${name} and its ${k === 1 ? 'section go' : `${k} sections go`}` : `${name} goes`}. Nothing is written yet, so nothing else is lost.`;
      label = 'Delete chapter';
    } else {
      const hit = findSection(id);
      if (!hit) return;
      const no = `${numberOf(hit.c)}.${hit.c.sections.indexOf(hit.s) + 1}`;
      const name = str(hit.s.title).trim() ? `“${hit.s.title.trim()}”` : 'This section';
      // A draft counts as writing, the same as a version (0018 has_writing).
      written = sectionWritten(hit.s);
      title = written ? `Section ${no} has writing` : `Remove section ${no}?`;
      text = written
        ? `This section has writing, so it can’t be deleted. ${name} keeps its text.`
        : `${name} and its word target go. Nothing is written yet, so nothing else is lost.`;
      label = 'Remove section';
    }
    del.target = { kind, id, label, written };
    // With writing there is nothing to confirm: only Close.
    del.btn.hidden = !!written;
    del.d.querySelector('[data-close]').textContent = written ? 'Close' : 'Cancel';
    del.busy = false;
    del.done = false;
    del.title.textContent = title;
    del.text.textContent = text;
    del.error.hidden = true;
    del.btn.disabled = false;
    del.btn.textContent = label;
    del.d.showModal();
    del.d.querySelector('[data-close]').focus();
  }

  async function onDelete(e) {
    e.preventDefault();
    if (del.busy || (del.target && del.target.written)) return;
    const t = del.target;
    del.busy = true;
    del.btn.disabled = true;
    del.btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${t.kind === 'chapter' ? 'Deleting…' : 'Removing…'}`;
    // Pending edits of what goes are dropped, not saved.
    if (t.kind === 'chapter') {
      const c = findChapter(t.id);
      dropKeys([`c|${t.id}`, ...((c && c.sections) || []).map((s) => `s|${s.id}`)]);
    } else {
      dropKeys([`s|${t.id}`]);
    }
    let res;
    try { res = await (t.kind === 'chapter' ? kdp.deleteChapter(t.id) : kdp.deleteSection(t.id)); } catch (err) { res = { error: err }; }
    del.busy = false;
    if (res.error && !res.error.notFound) {
      del.btn.disabled = false;
      del.btn.textContent = t.label;
      del.error.innerHTML = ICON.warn(18);
      const p = document.createElement('div');
      p.textContent = res.error.message === 'has_writing'
        ? `This ${t.kind} has writing, so it can’t be deleted.`
        : 'We couldn’t delete it. Check your connection, then try again.';
      del.error.append(p);
      del.error.hidden = false;
      return;
    }
    // Deleted now, or already gone: either way it leaves the outline.
    let focusId = null;
    if (t.kind === 'chapter') {
      const list = regular();
      const at = list.findIndex((c) => c.id === t.id);
      chapters = chapters.filter((c) => c.id !== t.id);
      savedOrder = savedOrder.filter((x) => x !== t.id);
      expanded.delete(t.id);
      const next = regular()[Math.min(at, regular().length - 1)];
      focusId = next ? `otlX-${next.id}` : null;
    } else {
      const hit = findSection(t.id);
      if (hit) {
        const at = hit.c.sections.indexOf(hit.s);
        hit.c.sections.splice(at, 1);
        const next = hit.c.sections[Math.min(at, hit.c.sections.length - 1)];
        focusId = next ? `otlST-${next.id}` : `otlAS-${hit.c.id}`;
      }
    }
    syncBook();
    outlineChanged(false);
    ctx.refresh();
    del.done = true;
    del.d.close();
    if (!active()) return;
    renderAll();
    const f = (focusId && document.getElementById(focusId)) || els.list.querySelector('[data-add-chapter]');
    if (f) f.focus();
    announce(t.kind === 'chapter' ? 'Chapter deleted.' : 'Section removed.');
  }

  /* ── Generate (stage outline_ideas) ──────── */

  function buildGenerate() {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', 'ogTitle');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head"><h2 id="ogTitle"></h2></div>
        <p class="delete-text" data-gen-text></p>
        <p class="ttl-sub" data-gen-plan></p>
        <div class="field">
          <label for="ogPer">Sections per chapter</label>
          <input type="text" class="text-input otl-num-input" id="ogPer" inputmode="numeric" autocomplete="off" aria-describedby="ogPerHint ogPerError">
          <span class="field-hint" id="ogPerHint">From ${PER_CHAPTER.min} to ${PER_CHAPTER.max}. You can add or remove sections later.</span>
          <span class="field-error" id="ogPerError" hidden></span>
        </div>
        <p class="ttl-sub">The AI reads your locked positioning, Brief, Research gaps and the competitors’ tables of contents.</p>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn" data-confirm></button>
        </div>
      </form>`;
    document.body.append(d);
    gen = { d, title: d.querySelector('#ogTitle'), text: d.querySelector('[data-gen-text]'), plan: d.querySelector('[data-gen-plan]'), per: d.querySelector('#ogPer'), err: d.querySelector('#ogPerError'), btn: d.querySelector('[data-confirm]'), started: false };
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => {
      if (gen.started || !active()) return;
      const b = els.root.querySelector('[data-generate]');
      if (b) b.focus();
    });
    d.addEventListener('click', (e) => {
      const a = e.target.closest('[data-go-brief]');
      if (!a) return;
      e.preventDefault();
      d.close();
      ctx.go(1);
    });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = gen.per.value.trim();
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!(n >= PER_CHAPTER.min && n <= PER_CHAPTER.max)) {
        gen.err.textContent = `Use a whole number from ${PER_CHAPTER.min} to ${PER_CHAPTER.max}.`;
        gen.err.hidden = false;
        gen.per.setAttribute('aria-invalid', 'true');
        gen.per.focus();
        return;
      }
      lastPer = n;
      gen.started = true;
      d.close();
      generate(n);
    });
  }

  /** What the Brief gives the AI, in one or two sentences. */
  function planText() {
    const b = brief();
    const t = W.target(b);
    const n = Number.isInteger(b.chapter_count) ? b.chapter_count : null;
    if (n && t) return `From your Brief: ${n} chapters, ${t.label} words.`;
    const parts = [];
    parts.push(n ? `From your Brief: ${n} chapters.` : 'Your Brief has no chapter count, so the AI picks 6 to 10.');
    parts.push(t ? `Length: ${t.label} words.` : 'It has no length, so the AI aims for 8K to 12K words.');
    return parts.join(' ');
  }

  function openGenerate() {
    if (ai.state === 'working' || genDisabledReason()) return;
    if (!gen) buildGenerate();
    const replace = chapters.length > 0;
    gen.started = false;
    gen.title.textContent = replace ? 'Replace the outline?' : 'Generate an outline';
    gen.text.textContent = replace
      ? 'The AI writes a new outline. Your edits to chapters and sections are lost. Nothing is written yet.'
      : 'The AI plans chapters with objectives, and sections with word counts.';
    gen.plan.innerHTML = `${esc(planText())} <a href="?id=${encodeURIComponent(book.id)}&step=1" data-go-brief>Change these in 01 Brief</a>`;
    gen.per.value = String(lastPer);
    gen.per.removeAttribute('aria-invalid');
    gen.err.hidden = true;
    gen.btn.className = `btn ${replace ? 'btn-danger' : 'btn-primary'}`;
    gen.btn.textContent = replace ? 'Replace outline' : 'Generate outline';
    gen.d.showModal();
    gen.per.focus();
    gen.per.select();
  }

  async function generate(per) {
    const token = ++aiToken;
    ai = { state: 'working' };
    note = null;
    renderAll();
    const stopBtn = els && els.list.querySelector('[data-stop]');
    if (stopBtn) stopBtn.focus();
    if (!(await settle())) { if (token === aiToken) failed('save_first'); return; }
    if (token !== aiToken) return;

    let res;
    try { res = await kdp.generate({ stage: 'outline_ideas', bookId: book.id, sectionsPerChapter: per }); }
    catch (err) { res = { error: { code: 'network' } }; }
    const rows = res.data && Array.isArray(res.data.chapters) ? res.data.chapters : null;
    if (token !== aiToken) {
      // Stopped: the reply is not shown, but the server saved the outline. Show what is saved.
      if (rows) { setOutline(rows); outlineChanged(false); ctx.refresh(); if (active() && ai.state !== 'working') renderAll(); }
      return;
    }
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code || !rows) return failed(code || 'server_error');

    expanded = new Set();
    opened = false;
    setOutline(rows);
    outlineChanged(false);   // replace_outline clears the approval
    ai = { state: 'done', done: { chapters: regular().length, words: C.planned(chapters), picked: !!res.data.aiPickedChapters, rescaled: !!res.data.rescaled } };
    ctx.refresh();
    if (!active()) return;
    renderAll();
    const s = els.top.querySelector('[data-status] [role="status"]');
    if (s) { s.setAttribute('tabindex', '-1'); s.focus(); }
  }

  function failed(code) {
    ai = { state: 'error', code };
    if (!active()) return;
    renderAll();
    const a = els.top.querySelector('[role="alert"]');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }

  function stop() {
    aiToken++;
    ai = { state: 'stopped' };
    if (!active()) return;
    renderAll();
    const g = els.root.querySelector('[data-generate]');
    if (g && !g.disabled) g.focus();
  }

  /* ── AI check (stage outline_check) ──────── */

  async function runCheck() {
    if (aiCheck.state === 'working' || checkBlock() || ai.state === 'working') return;
    const token = ++checkToken;
    aiCheck = { state: 'working' };
    renderSide();
    const stopBtn = els && els.checks.querySelector('[data-check-stop]');
    if (stopBtn) stopBtn.focus();
    // The server reads the saved outline: save the edits first.
    if (!(await settle())) { if (token === checkToken) checkFailed('save_first'); return; }
    if (token !== checkToken) return;

    let res;
    try { res = await kdp.generate({ stage: 'outline_check', bookId: book.id }); }
    catch (err) { res = { error: { code: 'network' } }; }
    const d = res.data;
    const okReply = !!(d && Array.isArray(d.findings) && typeof d.inputs_key === 'string');
    // The server saved the result either way, so show it even after Stop.
    if (okReply) checkRow = { findings: d.findings, inputs_key: d.inputs_key, checked_at: d.checked_at };
    if (token !== checkToken) { if (okReply && active() && aiCheck.state !== 'working') renderAll(); return; }
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code || !okReply) return checkFailed(code || 'server_error');

    aiCheck = { state: 'idle' };
    if (!active()) return;
    renderAll();
    const n = findings().length;
    announce(n ? `Outline checked. The AI found ${n === 1 ? '1 problem' : `${n} problems`}.` : 'Outline checked. The AI found no problems.');
    const h = document.getElementById('otlAi');
    if (h) h.focus();
  }

  function checkFailed(code) {
    aiCheck = { state: 'error', code };
    if (!active()) return;
    renderSide();
    const a = els.checks.querySelector('[role="alert"]');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }

  function stopCheck() {
    checkToken++;
    aiCheck = { state: 'stopped' };
    if (!active()) return;
    renderSide();
    const b = els.checks.querySelector('[data-check]');
    if (b && !b.disabled) b.focus();
  }

  /* ── Approve outline (design 21) ─────────── */

  function buildApprove() {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.id = 'otlApproveDialog';
    d.setAttribute('aria-labelledby', 'oaTitle');
    d.setAttribute('aria-describedby', 'oaText');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head"><h2 id="oaTitle"></h2></div>
        <ul class="ttl-check-list otl-appr-lines" data-appr-lines></ul>
        <p class="delete-text" id="oaText" data-appr-text>Any change to the outline removes the approval. Approve it again after.</p>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close></button>
          <button type="submit" class="btn btn-primary" data-confirm></button>
        </div>
      </form>`;
    document.body.append(d);
    appr = { d, title: d.querySelector('#oaTitle'), lines: d.querySelector('[data-appr-lines]'), error: d.querySelector('[data-error]'), close: d.querySelector('[data-close]'), btn: d.querySelector('[data-confirm]'), busy: false, warned: false };
    // "Fix them first": go to the checks. Cancel or Esc: back to the button.
    const close = (fix) => {
      if (appr.busy) return;
      d.close();
      if (!active()) return;
      const t = fix ? document.getElementById('otlChecks') : els.approve.querySelector('[data-approve]');
      if (t) t.focus();
    };
    appr.close.addEventListener('click', () => close(appr.warned));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); approve(); });
  }

  function openApprove() {
    if (approveBlock() || ai.state === 'working' || book.outline_approved_at) return;
    if (!appr) buildApprove();
    const list = warnings();
    const info = aiInfo();
    appr.busy = false;
    appr.warned = list.length > 0;
    appr.title.textContent = list.length ? `Approve with ${list.length === 1 ? '1 warning' : `${list.length} warnings`}?` : 'Approve outline?';
    appr.lines.innerHTML = list.map((t) => `<li class="is-warn">${ICON.warn(16)}<span>${esc(t)}</span></li>`).join('')
      + (info ? `<li class="is-info">${INFO}<span>${esc(info)}</span></li>` : '');
    appr.lines.hidden = !list.length && !info;
    appr.error.hidden = true;
    appr.close.textContent = list.length ? 'Fix them first' : 'Cancel';
    appr.btn.disabled = false;
    appr.btn.textContent = list.length ? 'Approve anyway' : 'Approve outline';
    appr.d.showModal();
    appr.close.focus();
  }

  async function approve() {
    if (appr.busy) return;
    appr.busy = true;
    appr.btn.disabled = true;
    appr.btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Approving…';
    appr.error.hidden = true;
    let res;
    if (!(await settle())) res = { error: { message: 'save_first' } };
    else {
      try { res = await kdp.approveOutline(book.id); } catch (err) { res = { error: { message: 'network' } }; }
    }
    appr.busy = false;
    if (res.error) {
      const e = res.error;
      if (e.message === 'book_not_found') { appr.d.close(); ctx.notFound(); return; }
      appr.btn.disabled = false;
      appr.btn.textContent = appr.warned ? 'Approve anyway' : 'Approve outline';
      const text = {
        positioning_not_locked: 'Lock the positioning in 03 first. The outline follows it.',
        outline_empty: 'Add at least one chapter first.',
        chapter_untitled: `Every chapter needs a title.${e.details ? ` ${e.details}` : ''}`,
        save_first: kdpUi.aiMessage('save_first')[1]
      }[e.message] || 'We couldn’t approve the outline. Check your connection, then try again.';
      appr.error.innerHTML = ICON.warn(18);
      const p = document.createElement('div');
      p.textContent = text;
      appr.error.append(p);
      appr.error.hidden = false;
      return;
    }
    approvalSeq++;   // a read of the approval started before this is out of date
    approvalStale = false;
    book.outline_approved_at = res.data;
    chapters.forEach((c) => { c.needs_review = false; });   // approving is the review (0017)
    syncBook();
    appr.d.close();
    ctx.refresh();
    if (!active()) return;
    renderAll();
    const h = document.getElementById('otlApprove');
    if (h) h.focus();
    announce('Outline approved. Step 05 is done.');
  }

  /* ── Step API for js/book.js ─────────────── */

  /** Approving the outline (E9.2) marks step 05 done. */
  const isDone = (b) => !!b.outline_approved_at;

  function missing() {
    if (!book) return '';
    const n = load.state === 'ready' ? chapters.length : countOf(book.chapters);
    if (!n) return 'Make an outline';
    return book.outline_approved_at ? '' : 'Approve the outline';
  }

  const needsReview = (b) => (load.state === 'ready' ? reviewCount() > 0 : countOf(b.review_chapters) > 0);

  function init(b, c) {
    ctx = c;
    book = b;
    saver = kdpAutosave.create({
      read,
      save,
      onSaved,
      onError,
      render: (state, message, canRetry) => ctx.renderSave(state, message, canRetry, 5)
    });
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[5] = {
    init,
    render,
    isDone,
    missing,
    needsReview,
    blockers: () => 0,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
