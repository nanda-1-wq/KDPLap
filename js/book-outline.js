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
   - The word budget and the checks come from our code (js/word-budget.js,
     js/outline-checks.js), never from the AI. The AI checks and Approve
     outline come in E9.2.
   - Chapters marked "Needs review" (unlock of 03) show a note and a pill.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const C = kdpOutlineChecks;
  const W = kdpWords;

  // Same limits as migration 0016 and supabase/functions/generate/lib/limits.ts.
  const MAX = { chapterTitle: 150, objective: 300, sectionTitle: 150, sectionWords: 10000 };
  const MAX_CHAPTERS = 30;
  const MAX_SECTIONS = 12;
  const PER_CHAPTER = { min: 1, max: 6, default: 3 };

  const GRIP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
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
  let gen = null, del = null;            // dialogs, built on first use

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
  const hasWriting = () => chapters.some((c) => (c.sections || []).some((s) => s.current_version_id));
  // Chapters only: an unlock marks the Introduction and Conclusion rows too, but they have no pill.
  const reviewCount = () => regular().filter((c) => c.needs_review).length;
  const fixedName = (c) => (c.kind === 'intro' ? 'Introduction' : 'Conclusion');
  const countOf = (rel) => { const r = one(rel); return r && Number.isInteger(r.count) ? r.count : 0; };

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
    let res;
    try { res = await kdp.getOutline(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      if (!quiet || load.state !== 'ready') load = { state: 'error' };
    } else {
      setOutline(res.data);
      load = { state: 'ready' };
      ctx.refresh();
    }
    if (active()) renderAll();
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
        </aside>
        <p class="sr-only" aria-live="polite" data-live></p>
      </div>`;
    els = {
      root,
      top: root.querySelector('[data-top]'),
      list: root.querySelector('[data-list]'),
      budget: root.querySelector('[data-budget]'),
      checks: root.querySelector('[data-checks]'),
      live: root.querySelector('[data-live]')
    };
    bind(root.querySelector('.otl'));
    if (load.state === 'idle') loadData();
    else {
      renderAll();
      // Another step may have changed the outline (an unlock marks chapters): read it again.
      if (load.state === 'ready' && !saver.hasUnsaved() && ai.state !== 'working') loadData(true);
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
    return pills.join('');
  }

  function chapterHtml(c) {
    const n = numberOf(c);
    const open = expanded.has(c.id);
    const checks = C.check(chapters, brief());
    const warn = !!(checks.byChapter[c.id] || c.needs_review || unsourcedNow(c).length);
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
      return;
    }
    renderBudget();
    renderChecks();
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
      <div class="otl-check-head"><h2 class="ttl-label" id="otlChecks">OUTLINE CHECK</h2><span class="otl-by">Checked by KDP Lab</span></div>
      ${rows ? `<ul class="ttl-check-list" data-check-list>${rows}</ul>` : '<p class="ttl-sub">Checks show here once you have chapters.</p>'}`;
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
      if (li) li.classList.toggle('is-warn', !!(checks.byChapter[x.id] || x.needs_review || unsourcedNow(x).length));
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
    let title, text, label;
    if (kind === 'chapter') {
      const c = findChapter(id);
      if (!c) return;
      const n = numberOf(c);
      const k = (c.sections || []).length;
      title = `Delete chapter ${n}?`;
      const name = str(c.title).trim() ? `“${c.title.trim()}”` : 'This chapter';
      text = `${k ? `${name} and its ${k === 1 ? 'section go' : `${k} sections go`}` : `${name} goes`}. Nothing is written yet, so nothing else is lost.`;
      label = 'Delete chapter';
    } else {
      const hit = findSection(id);
      if (!hit) return;
      const no = `${numberOf(hit.c)}.${hit.c.sections.indexOf(hit.s) + 1}`;
      title = `Remove section ${no}?`;
      text = `${str(hit.s.title).trim() ? `“${hit.s.title.trim()}”` : 'This section'} and its word target go. Nothing is written yet, so nothing else is lost.`;
      label = 'Remove section';
    }
    del.target = { kind, id, label };
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
    if (del.busy) return;
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
      if (rows) { setOutline(rows); ctx.refresh(); if (active() && ai.state !== 'working') renderAll(); }
      return;
    }
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code || !rows) return failed(code || 'server_error');

    expanded = new Set();
    opened = false;
    setOutline(rows);
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

  /* ── Step API for js/book.js ─────────────── */

  /** Approving the outline (E9.2) marks step 05 done. */
  const isDone = (b) => !!b.outline_approved_at;

  function missing() {
    if (!book) return '';
    const n = load.state === 'ready' ? chapters.length : countOf(book.chapters);
    return n ? '' : 'Make an outline';
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
