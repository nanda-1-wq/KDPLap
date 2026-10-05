/* ═══════════════════════════════════════════════════
   KDP Lab — Step 03 Positioning (designs 17, 18, 21)
   /js/book-positioning.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[3]. js/book.js calls init() once after the book
   loads, render() each time step 03 is shown, and isDone() for the sidebar
   (done = locked; the sidebar shows a lock).

   Six cards (one sentence, reader promise, what books lack, approach,
   selling points, focus tags) save to public.positioning through
   js/autosave.js. Limits match migration 0010.
   - "Help me draft" (stage positioning_help) drafts every card; the redraft
     button on a card drafts only that card. Each suggestion waits for
     Accept or Discard. Nothing is replaced silently.
   - Drift check (stage drift_check) runs on the SAVED text. The server saves
     the flags; the browser may only keep a flag with a reason (or undo it).
     Any text edit makes the check out of date.
   - Approve and lock needs the required cards, a current check and no open
     flag. The database checks the same (0010). Locked = read-only (design 18).
   - Unlock goes through unlock_positioning(): title, outline and written
     chapters get "Needs review". Nothing is deleted.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpPens;

  // Same limits as migration 0010 and supabase/functions/generate/lib.ts.
  const MAX = { one_sentence: 400, reader_promise: 600, approach: 1200 };
  const LIST_MAX = { lacks: { items: 6, chars: 200 }, selling_points: { items: 8, chars: 160 }, focus_tags: { items: 8, chars: 40 } };
  const MAX_REASON = 200;
  const FIELDS = ['one_sentence', 'reader_promise', 'lacks', 'approach', 'selling_points', 'focus_tags'];
  const TEXTS = ['one_sentence', 'reader_promise', 'approach'];
  const CARDS = {
    one_sentence: { title: 'One-sentence positioning', source: 'Built from Brief + Research gaps', rows: 3, big: true },
    reader_promise: { title: 'Reader promise', source: 'Finalized from your Brief draft', rows: 3 },
    lacks: { title: 'What current books lack', source: 'From 02 Research · gaps', list: 'ul', item: 'Line', add: 'Add line' },
    approach: { title: 'Your approach', source: 'How this book fills the gaps', rows: 4 },
    selling_points: { title: 'Key selling points', list: 'ol', item: 'Point', add: 'Add point', count: true },
    focus_tags: { title: 'Focus tags', tags: true }
  };
  // Required to lock (0010). [field, words for the lock panel]
  const NEEDED = [
    ['one_sentence', 'the one sentence'], ['reader_promise', 'the reader promise'],
    ['lacks', '1 line in what books lack'], ['approach', 'your approach'], ['selling_points', '1 selling point']
  ];
  const HELP_CAPTION = 'Suggestions appear under each card. Nothing changes until you accept.';
  const LOCK_ICON = (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  const REDO_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v5h-5"/></svg>';

  let ctx = null, book = null, pos = null, model = null, saver = null, els = null;
  const editing = new Set();                 // cards in edit mode
  let ai = { state: 'idle', field: null };   // positioning_help: idle | working | done | error | stopped
  let aiToken = 0;
  let suggestions = {};                      // field → text or list
  let unsourced = {};                        // field → numbers without a source
  let drift = { state: 'idle' };             // idle | working | error
  let lock = { state: 'idle' };              // idle | working | error
  let keeping = null;                        // { id, text, state, message } while giving a reason
  let flagError = '';                        // an undo that did not save
  let driftHadText = false;                  // what the drift panel last showed: any card text
  let gaps = null, gapsState = 'idle';       // Research gaps for "Copy gaps"

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const isList = (k) => k in LIST_MAX;
  const clean = (k) => (isList(k) ? model[k].map((t) => t.trim()).filter(Boolean) : model[k].trim());
  const has = (k) => clean(k).length > 0;
  const flags = () => (pos && Array.isArray(pos.drift_flags) ? pos.drift_flags : []);
  const isLocked = () => !!(pos && pos.locked_at);
  const busy = () => ai.state === 'working' || drift.state === 'working' || lock.state === 'working';
  const joinWords = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

  function fromRow(r) {
    return {
      one_sentence: str(r && r.one_sentence), reader_promise: str(r && r.reader_promise), approach: str(r && r.approach),
      lacks: list(r && r.lacks), selling_points: list(r && r.selling_points), focus_tags: list(r && r.focus_tags)
    };
  }

  /** The value to save for a dirty field. Empty text is null; lists drop blank lines. */
  function read(k) {
    if (isList(k)) {
      const items = clean(k);
      const max = LIST_MAX[k];
      if (items.length > max.items) return { error: `use ${max.items} lines or fewer.` };
      if (items.some((t) => t.length > max.chars)) return { error: `use ${max.chars} characters or fewer per line.` };
      return items;
    }
    const t = model[k].trim();
    if (t.length > MAX[k]) return { error: `use ${MAX[k]} characters or fewer.` };
    return t || null;
  }

  function setPos(row) {
    pos = row;
    book.positioning = row;
  }

  function onSaved(res) {
    // The row comes back whole: a text edit may have cleared the drift check.
    const before = pos ? pos.drift_checked_at : null;
    setPos(res.data);
    ctx.refresh();
    if (!els) return;
    // Also when the first card text arrives or the last goes: the button turns on or off.
    if (before !== pos.drift_checked_at || driftHadText !== FIELDS.some(has)) renderDrift();
    renderLock();
  }

  async function onError(res, sent) {
    const e = res.error || {};
    if (e.notFound) { saver.reset('error'); ctx.notFound(); return true; }
    // Drop the edits BEFORE re-rendering: removing a focused field fires
    // focusout, which would otherwise send the refused save again.
    if (e.message === 'positioning_locked') {
      saver.reset('error', 'This positioning is locked, so the change was not saved.');
      await reload();
      return true;
    }
    // 23514 = a check (0010), 42501 = RLS, 23503 = the book is gone.
    if (['23514', '42501', '23503'].includes(e.code)) {
      saver.reset('error', 'This change breaks a Positioning rule, so it was not saved.');
      const back = fromRow(pos);
      sent.forEach((k) => { model[k] = back[k]; });
      if (ctx.isActive(3)) render(ctx.content());
      return true;
    }
    return false;
  }

  /** Load the row again (after a lock race or a refused save). Unsaved edits are dropped. */
  async function reload() {
    let res;
    try { res = await kdp.getPositioning(book.id); } catch (err) { res = { error: err }; }
    if (res.error) return false;
    setPos(res.data);
    model = fromRow(pos);
    editing.clear();
    ctx.refresh();
    if (ctx.isActive(3)) render(ctx.content());
    return true;
  }

  /* ── Step API for js/book.js ─────────────── */

  const isDone = (b) => { const p = one(b.positioning); return !!(p && p.locked_at); };

  function init(b, c) {
    ctx = c;
    book = b;
    setPos(one(b.positioning));
    model = fromRow(pos);
    saver = kdpAutosave.create({
      read, save: (fields) => kdp.savePositioning(book.id, fields), onSaved, onError,
      render: (state, message, canRetry) => { ctx.renderSave(state, message, canRetry, 3); if (els) renderLock(); }
    });
  }

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    els = null;
    if (isLocked()) { renderLocked(root); return; }
    root.innerHTML = `
      <div class="posn">
        <div class="posn-main" data-posn-main>
          <p class="posn-intro">Why should this book exist? Edit anything, then approve. Every later step follows it.</p>
          ${FIELDS.map((k) => `<section class="panel posn-card" data-card="${k}" aria-labelledby="pc-${k}"></section>`).join('')}
        </div>
        <aside class="posn-side" aria-label="Drift check and approval">
          <section class="panel posn-panel" data-drift aria-labelledby="driftTitle"></section>
          <section class="panel posn-panel" data-lock-panel aria-labelledby="lockTitle">
            <div class="posn-lock-top" data-lock-top></div>
            <button type="button" class="btn btn-secondary btn-block" data-help-all>${ICON.sparkle}Help me draft</button>
            <div data-help-area></div>
          </section>
        </aside>
      </div>`;
    els = {
      root,
      main: root.querySelector('[data-posn-main]'),
      drift: root.querySelector('[data-drift]'),
      lock: root.querySelector('[data-lock-panel]'),
      lockTop: root.querySelector('[data-lock-top]'),
      helpAll: root.querySelector('[data-help-all]')
    };
    FIELDS.forEach(renderCard);
    renderSide();
    renderAiNote();
    bind(root.querySelector('.posn'));
    ctx.setGate();
  }

  function renderSide() {
    if (!els) return;
    renderDrift();
    renderLock();
    // The cards stay read-only while the drift check reads the saved text.
    els.main.inert = drift.state === 'working';
  }

  /* Cards */

  const isEditing = (k) => editing.has(k) || (!CARDS[k].tags && !has(k));

  function cardHead(k) {
    const c = CARDS[k];
    const working = ai.state === 'working' && ai.field === k;
    const n = c.count ? ` <span class="posn-count">${clean(k).length}</span>` : '';
    let actions = '';
    if (working) {
      actions = '<span class="posn-rewriting" role="status"><span class="spinner" aria-hidden="true"></span>Rewriting…</span>';
    } else {
      const b = busy() ? ' disabled' : '';
      if (!c.tags && !isEditing(k)) actions += `<button type="button" class="icon-btn posn-icon" data-edit="${k}" aria-label="Edit ${c.title.toLowerCase()}">${ICON.rename}</button>`;
      if (!c.tags && editing.has(k) && has(k)) actions += `<button type="button" class="btn btn-secondary btn-sm" data-done="${k}">Done</button>`;
      if (k === 'selling_points' && !isEditing(k)) {
        const full = clean(k).length >= LIST_MAX[k].items;
        actions += `<button type="button" class="btn btn-secondary" data-add="${k}"${full ? ' disabled' : ''}>${ICON.plus}Add point</button>`;
      }
      actions += `<button type="button" class="icon-btn posn-icon" data-redraft="${k}" aria-label="Redraft ${c.title.toLowerCase()} with AI"${b}>${REDO_ICON}</button>`;
    }
    return `<div class="posn-card-head">
        <div class="posn-card-name">
          <h2 class="posn-card-title" id="pc-${k}">${c.title}${n}</h2>
          ${c.source ? `<p class="posn-card-source"><span class="posn-dot" aria-hidden="true"></span>${c.source}</p>` : ''}
        </div>
        <div class="posn-card-actions">${actions}</div>
      </div>`;
  }

  function cardBody(k) {
    const c = CARDS[k];
    if (ai.state === 'working' && ai.field === k) {
      return `<div class="posn-skel" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w70"></div><div class="skel skel-line skel-w40"></div></div>
        <p class="field-hint posn-skel-note">Other cards stay as they are.</p>
        <div><button type="button" class="btn btn-secondary" data-help-stop>Stop</button></div>`;
    }
    if (c.tags) return tagsBody();
    if (isList(k)) {
      if (!isEditing(k)) {
        return `<${c.list} class="posn-list">${clean(k).map((t) => `<li>${esc(t)}</li>`).join('')}</${c.list}>`;
      }
      return (k === 'lacks' && !has(k) ? gapsBlock() : '') + listEditor(k);
    }
    if (!isEditing(k)) return `<p class="posn-text${c.big ? ' is-big' : ''}">${esc(model[k].trim())}</p>`;
    return `<textarea class="text-area posn-area${c.big ? ' is-big' : ''}" id="pf-${k}" rows="${c.rows}" maxlength="${MAX[k]}" data-field="${k}" aria-labelledby="pc-${k}" aria-describedby="pf-${k}-count"></textarea>
      <span class="field-hint posn-counter" id="pf-${k}-count" data-counter="${k}"></span>`;
  }

  function listEditor(k) {
    const c = CARDS[k];
    const max = LIST_MAX[k];
    const items = model[k].length ? model[k] : [''];
    const full = model[k].length >= max.items;
    return `<ul class="posn-edit-list" aria-labelledby="pc-${k}">
        ${items.map((t, i) => `<li class="posn-edit-row">
          <input class="text-input" type="text" maxlength="${max.chars}" autocomplete="off" data-item="${k}" data-index="${i}" aria-label="${c.item} ${i + 1}" value="${esc(t)}" />
          <button type="button" class="icon-btn" data-remove="${k}" data-index="${i}" aria-label="Remove ${c.item.toLowerCase()} ${i + 1}">${ICON.x(16)}</button>
        </li>`).join('')}
      </ul>
      <div class="posn-add-row">
        <button type="button" class="btn btn-secondary" data-add="${k}"${full ? ' disabled' : ''}>${ICON.plus}${c.add}</button>
        <span class="field-hint">Up to ${max.items} ${c.item.toLowerCase()}s, ${max.chars} characters each.</span>
      </div>`;
  }

  /** Lacks is empty: start from the Research gaps (a one-time copy). */
  function gapsBlock() {
    if (gapsState === 'idle') loadGaps();
    if (gapsState === 'loading') return '<p class="field-hint posn-gaps" role="status"><span class="spinner inline" aria-hidden="true"></span> Looking for gaps in 02 Research…</p>';
    if (gapsState === 'error') return '<p class="field-hint posn-gaps">We couldn’t load the Research gaps. <button type="button" class="link-btn" data-gaps-retry>Try again</button></p>';
    if (!gaps.length) return '<p class="field-hint posn-gaps">No gaps yet. Analyze reviews in 02 Research to get a starting list, or write your own.</p>';
    const n = Math.min(gaps.length, LIST_MAX.lacks.items);
    return `<div class="posn-gaps">
        <button type="button" class="btn btn-secondary" data-copy-gaps>Copy ${n} gap${n === 1 ? '' : 's'} from Research</button>
        <span class="field-hint">You can edit them after.</span>
      </div>`;
  }

  async function loadGaps() {
    gapsState = 'loading';
    let res;
    try { res = await kdp.getResearchGaps(book.id); } catch (err) { res = { error: err }; }
    if (res.error) gapsState = 'error';
    else { gaps = res.data; gapsState = 'ready'; }
    if (els && !has('lacks')) renderCard('lacks');
  }

  function tagsBody() {
    const tags = model.focus_tags;
    const full = tags.length >= LIST_MAX.focus_tags.items;
    return `${tags.length ? `<ul class="posn-tags" aria-labelledby="pc-focus_tags">
        ${tags.map((t, i) => `<li class="posn-tag"><span>${esc(t)}</span><button type="button" class="posn-tag-x" data-tag-remove="${i}" aria-label="Remove tag ${esc(t)}">${ICON.x(14)}</button></li>`).join('')}
      </ul>` : ''}
      <div class="posn-tag-add">
        <input class="text-input posn-tag-input" type="text" maxlength="${LIST_MAX.focus_tags.chars}" autocomplete="off" placeholder="Add tag" data-tag-input aria-label="Add a focus tag" aria-describedby="tagHint tagError"${full ? ' disabled' : ''} />
        <button type="button" class="btn btn-secondary" data-tag-add${full ? ' disabled' : ''}>Add</button>
      </div>
      <span class="field-hint" id="tagHint">Optional. Up to 8 tags. Press Enter to add.</span>
      <span class="field-error" id="tagError" data-tag-error hidden></span>`;
  }

  function renderCard(k) {
    if (!els) return;
    const box = els.main.querySelector(`[data-card="${k}"]`);
    box.innerHTML = `${cardHead(k)}<div class="posn-card-body">${cardBody(k)}</div><div data-ai-note="${k}"></div><div data-suggest="${k}"></div>`;
    const area = box.querySelector('textarea[data-field]');
    if (area) { area.value = model[k]; updateCounter(k); }
    renderSuggestion(k);
    if (ai.field === k) renderAiNote();
  }

  function updateCounter(k) {
    const el = els && els.main.querySelector(`[data-counter="${k}"]`);
    if (el) el.textContent = `${model[k].length} / ${MAX[k]}`;
  }

  /** Buttons that start an AI call or a lock are off while one runs. */
  function syncBusy() {
    if (!els) return;
    els.root.querySelectorAll('[data-redraft]').forEach((b) => { b.disabled = busy(); });
    renderSide();
  }

  /* Suggestions */

  function renderSuggestion(k) {
    const box = els && els.main.querySelector(`[data-suggest="${k}"]`);
    if (!box) return;
    const s = suggestions[k];
    if (s === undefined) { box.innerHTML = ''; return; }
    const c = CARDS[k];
    const replaces = has(k) ? 'Accept replaces this card.' : 'Accept puts it in this card.';
    const body = Array.isArray(s)
      ? `<${c.list || 'ul'} class="posn-list posn-suggest-list" tabindex="-1" data-suggest-text>${s.map((t) => `<li>${esc(t)}</li>`).join('')}</${c.list || 'ul'}>`
      : `<p class="brief-suggest-text" tabindex="-1" data-suggest-text>${esc(s)}</p>`;
    const nums = unsourced[k] || [];
    box.innerHTML = `<div class="bio-suggest brief-suggest" role="region" aria-labelledby="sug-${k}">
        <div class="bio-suggest-head"><span class="bio-suggest-label" id="sug-${k}">AI SUGGESTION</span></div>
        ${body}
        ${nums.length ? `<p class="posn-verify">${ICON.warn(14)}<span>Verify: no source for ${esc(joinWords(nums))}. Your Brief and Research do not have ${nums.length === 1 ? 'this number' : 'these numbers'}.</span></p>` : ''}
        <p class="field-hint">${replaces}</p>
        <div class="bio-suggest-actions">
          <button type="button" class="btn btn-primary" data-accept="${k}">${ICON.check(16)}Accept</button>
          <button type="button" class="btn btn-secondary" data-discard="${k}">Discard</button>
        </div>
      </div>`;
  }

  /* Side: drift check */

  function flagHtml(f) {
    const name = CARDS[f.field] ? CARDS[f.field].title : f.field;
    const k = keeping && keeping.id === f.id ? keeping : null;
    let foot;
    if (k) {
      foot = `<form class="posn-keep" data-keep-form="${esc(f.id)}" novalidate>
          <label for="keep-${esc(f.id)}">Why keep it?</label>
          <input class="text-input" id="keep-${esc(f.id)}" type="text" maxlength="${MAX_REASON}" autocomplete="off" data-keep-input aria-describedby="keep-${esc(f.id)}-err" value="${esc(k.text)}" />
          <span class="field-error" id="keep-${esc(f.id)}-err"${k.message ? '' : ' hidden'}>${k.message ? ICON.x() + esc(k.message) : ''}</span>
          <div class="posn-flag-actions">
            <button type="submit" class="btn btn-primary"${k.state === 'saving' ? ' disabled aria-busy="true"' : ''}>${k.state === 'saving' ? '<span class="spinner" aria-hidden="true"></span>Saving…' : 'Keep it'}</button>
            <button type="button" class="btn btn-secondary" data-keep-cancel${k.state === 'saving' ? ' disabled' : ''}>Cancel</button>
          </div>
        </form>`;
    } else if (f.status === 'kept') {
      foot = `<p class="posn-flag-reason"><span class="posn-flag-kept">${ICON.check(13)}Kept:</span> ${esc(f.reason)}</p>
        <div class="posn-flag-actions"><button type="button" class="btn btn-secondary" data-undo-keep="${esc(f.id)}">Undo keep</button></div>`;
    } else {
      foot = `<div class="posn-flag-actions">
          <button type="button" class="btn btn-secondary" data-keep="${esc(f.id)}">Keep it</button>
          <button type="button" class="btn btn-primary" data-fix="${esc(f.field)}">Fix it</button>
        </div>`;
    }
    return `<li class="posn-flag${f.status === 'kept' ? ' is-kept' : ''}" data-flag="${esc(f.id)}" tabindex="-1">
        <div class="posn-flag-head">${f.status === 'kept' ? ICON.check(14) : ICON.warn(14)}<span class="posn-flag-title">${f.status === 'kept' ? 'Kept on purpose' : 'Drift found'}</span><span class="posn-ai" title="Found by the AI">AI</span></div>
        <p class="posn-flag-text">“${esc(f.quote)}” in ${esc(name.toLowerCase())}. ${esc(f.why)}</p>
        ${foot}
      </li>`;
  }

  function renderDrift() {
    const box = els.drift;
    const typing = document.activeElement && box.contains(document.activeElement) && document.activeElement.matches('[data-keep-input]');
    const list = flags();
    const checked = !!(pos && pos.drift_checked_at);
    const open = list.filter((f) => f.status === 'open').length;
    const anyText = FIELDS.some(has);
    driftHadText = anyText;
    let html = '<h2 class="posn-side-label" id="driftTitle" tabindex="-1">DRIFT CHECK</h2>';
    if (drift.state === 'working') {
      html += `<div class="posn-drift-working" role="status"><span class="spinner" aria-hidden="true"></span>Checking against your Brief and Research…</div>
        <p class="field-hint">The cards are read-only until the check ends.</p>`;
      box.innerHTML = html;
      return;
    }
    if (drift.state === 'error') html += alertHtml(drift.code, 'data-drift-retry');
    if (flagError) html += `<div class="alert alert-error" role="alert">${ICON.warn(18)}<p class="alert-text">${esc(flagError)}</p></div>`;
    if (!checked && !list.length) {
      html += '<p class="posn-side-text">Compare this positioning with your Brief and Research before you lock it. The AI flags new angles, audiences, promises or claims they don’t support.</p>';
    } else if (!checked) {
      html += `<p class="posn-stale">${ICON.warn(14)}<span>Out of date. You changed the text after this check.</span></p>`;
    }
    if (list.length) html += `<ul class="posn-flags">${list.map(flagHtml).join('')}</ul>`;
    if (checked && !open) {
      html += list.length
        ? '<p class="posn-side-note">Every other line traces back to your Brief or Research.</p>'
        : `<p class="posn-clear">${ICON.check(14)}<span>No drift found. Every line traces back to your Brief or Research.</span></p>`;
    }
    const label = checked || list.length ? 'Check again' : 'Run drift check';
    html += `<button type="button" class="btn btn-secondary btn-block" data-run-drift${busy() || !anyText ? ' disabled' : ''} aria-describedby="driftNote">${label}</button>
      <p class="field-hint" id="driftNote">${anyText ? (checked ? `Last check ${esc(when(pos.drift_checked_at))}.` : 'Uses one AI call.') : 'Write at least one card first.'}</p>`;
    box.innerHTML = html;
    const input = box.querySelector('[data-keep-input]');
    if (typing && input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }

  function when(iso) {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  /* Side: approve and lock, help me draft */

  function lockReason() {
    const missing = NEEDED.filter(([k]) => !has(k)).map(([, t]) => t);
    if (missing.length) return `Add ${joinWords(missing)} first.`;
    if (saver.state === 'error' && saver.hasUnsaved()) return 'Your last change is not saved. Use Retry first.';
    if (saver.hasUnsaved()) return 'Saving your last change…';
    if (!pos || !pos.drift_checked_at) {
      return flags().length ? 'Run the drift check again first. You changed the text after it.' : 'Run the drift check first.';
    }
    const open = flags().filter((f) => f.status === 'open').length;
    if (open) return `Resolve the drift check first: ${open} flag${open === 1 ? ' is' : 's are'} open.`;
    return '';
  }

  function renderLock() {
    if (!els) return;
    const reason = lockReason();
    const working = lock.state === 'working';
    const off = !!reason || busy();
    let html = `<h2 class="posn-side-title" id="lockTitle">Approve and lock</h2>
      <p class="posn-side-text">Title, Outline, and every chapter will follow this positioning. You can unlock later, and steps built on it get a "Needs review" mark.</p>
      <button type="button" class="btn btn-primary btn-block" data-lock-btn${off ? ' disabled' : ''}${working ? ' aria-busy="true"' : ''} aria-describedby="lockNote">
        ${working ? '<span class="spinner" aria-hidden="true"></span>Locking…' : `${LOCK_ICON()}Approve and lock`}</button>
      <p class="posn-side-note" id="lockNote" aria-live="polite">${esc(reason || (working ? '' : 'Ready to lock.'))}</p>`;
    if (lock.state === 'error') html += `<div class="alert alert-error" role="alert">${ICON.warn(18)}<p class="alert-text">${esc(lock.message)}</p></div>`;
    const hadFocus = els.lockTop.contains(document.activeElement);
    els.lockTop.innerHTML = html;
    if (hadFocus) els.lockTop.querySelector('[data-lock-btn]').focus();
    els.helpAll.disabled = busy();
  }

  /* AI messages */

  const nextMonthUtc = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** [kind, text, retry] for an error code. */
  function aiMessage(code) {
    switch (code) {
      case 'no_topic': return ['warning', 'Add a topic in 01 Brief first. The AI drafts from it.', false];
      case 'not_enough_facts': return ['warning', 'The Brief is too thin to draft from. Add the reader and their problem in 01 Brief, then try again.', false];
      case 'nothing_to_check': return ['warning', 'Write at least one card before you run the drift check.', false];
      case 'positioning_changed': return ['warning', 'The text changed while the check ran, so nothing was saved. Run it again. This try was not counted.', true];
      case 'positioning_locked': return ['warning', 'This positioning is locked. Unlock it to change it.', false];
      case 'monthly_limit': return ['warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`, false];
      case 'rate_limited': return ['warning', 'Too many requests. Wait a minute, then try again.', true];
      case 'save_first': return ['error', 'Your last change is not saved yet. Use Retry next to “Couldn’t save”, then try again.', false];
      case 'network': return ['error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.', true];
      default: return ['error', 'The AI is not available right now. This try was not counted.', true];
    }
  }

  function alertHtml(code, retryAttr, missing) {
    const [kind, text, retry] = aiMessage(code);
    return `<div class="alert alert-${kind}" role="alert">${ICON.warn(18)}<div>
        <p class="alert-text">${esc(text)}</p>
        ${missing ? `<p class="alert-text">${esc(missing)}</p>` : ''}
        ${retry ? `<button type="button" class="link-btn" ${retryAttr}>Try again</button>` : ''}
      </div></div>`;
  }

  /** The help status: in the lock panel for "Help me draft", in the card for one card. */
  function renderAiNote() {
    if (!els) return;
    const area = ai.field === null ? els.lock.querySelector('[data-help-area]') : els.main.querySelector(`[data-ai-note="${ai.field}"]`);
    if (!area) return;
    if (ai.state === 'working' && ai.field === null) {
      area.innerHTML = `<div class="help-card posn-help-card" role="status">
          <div class="help-working"><span class="spinner" aria-hidden="true"></span>Drafting from your Brief and Research…</div>
          <div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div>
          <p class="field-hint">${HELP_CAPTION}</p>
          <div><button type="button" class="btn btn-secondary" data-help-stop>Stop</button></div>
        </div>`;
    } else if (ai.state === 'stopped') {
      area.innerHTML = '<p class="help-note" role="status">Stopped. If the AI had already finished, this call may still count.</p>';
    } else if (ai.state === 'error') {
      area.innerHTML = alertHtml(ai.code, 'data-help-retry', ai.missing);
    } else if (ai.state === 'done') {
      const names = FIELDS.filter((k) => suggestions[k] !== undefined).map((k) => CARDS[k].title.toLowerCase());
      area.innerHTML = `<p class="help-note" role="status">${names.length
        ? `${ICON.sparkle}${ai.field === null ? `Suggestions are ready under ${esc(joinWords(names))}.` : 'A suggestion is ready below.'} Nothing changes until you accept.`
        : 'The AI suggests what you already have. Nothing to change.'}</p>`;
    } else area.innerHTML = '';
  }

  function clearAiNote() {
    if (!els) return;
    const areas = [els.lock.querySelector('[data-help-area]'), ...els.main.querySelectorAll('[data-ai-note]')];
    areas.forEach((a) => { if (a) a.innerHTML = ''; });
  }

  /* ── Events ──────────────────────────────── */

  function bind(root) {
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('textarea[data-field]')) {
        const k = t.dataset.field;
        model[k] = t.value;
        editing.add(k);
        updateCounter(k);
        saver.edit(k, 800);
        renderLock();
      } else if (t.matches('input[data-item]')) {
        const k = t.dataset.item;
        model[k][Number(t.dataset.index)] = t.value;
        editing.add(k);
        saver.edit(k, 800);
        renderLock();
      } else if (t.matches('[data-tag-input]')) {
        setTagError('');
      } else if (t.matches('[data-keep-input]') && keeping) {
        keeping.text = t.value;
      }
    });
    // Leaving a field saves it now.
    root.addEventListener('focusout', (e) => {
      const t = e.target;
      const k = t.dataset && (t.dataset.field || t.dataset.item);
      if (k && saver.isDirty(k)) saver.flush();
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-tag-input]') && e.key === 'Enter') { e.preventDefault(); addTag(); }
      if (e.target.matches('input[data-item]') && e.key === 'Enter') { e.preventDefault(); addLine(e.target.dataset.item); }
    });
    root.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-keep-form]');
      if (form) { e.preventDefault(); saveKeep(form.dataset.keepForm); }
    });
    root.addEventListener('click', (e) => {
      const on = (sel) => e.target.closest(sel);
      let b;
      if ((b = on('[data-edit]'))) startEdit(b.dataset.edit);
      else if ((b = on('[data-done]'))) doneEdit(b.dataset.done);
      else if ((b = on('[data-add]'))) addLine(b.dataset.add);
      else if ((b = on('[data-remove]'))) removeLine(b.dataset.remove, Number(b.dataset.index));
      else if (on('[data-copy-gaps]')) copyGaps();
      else if (on('[data-gaps-retry]')) { gapsState = 'idle'; renderCard('lacks'); }
      else if (on('[data-tag-add]')) addTag();
      else if ((b = on('[data-tag-remove]'))) removeTag(Number(b.dataset.tagRemove));
      else if ((b = on('[data-redraft]'))) runHelp(b.dataset.redraft);
      else if (on('[data-help-all]')) runHelp(null);
      else if (on('[data-help-stop]')) stopHelp();
      else if (on('[data-help-retry]')) runHelp(ai.field);
      else if ((b = on('[data-accept]'))) accept(b.dataset.accept);
      else if ((b = on('[data-discard]'))) discard(b.dataset.discard);
      else if (on('[data-run-drift]') || on('[data-drift-retry]')) runDrift();
      else if ((b = on('[data-keep]'))) startKeep(b.dataset.keep);
      else if (on('[data-keep-cancel]')) cancelKeep();
      else if ((b = on('[data-undo-keep]'))) setFlag(b.dataset.undoKeep, 'open', '');
      else if ((b = on('[data-fix]'))) fixIt(b.dataset.fix);
      else if (on('[data-lock-btn]')) doLock();
    });
  }

  function focusCard(k) {
    const box = els.main.querySelector(`[data-card="${k}"]`);
    const target = box.querySelector('textarea, input[data-item], [data-tag-input]:not([disabled]), [data-edit]');
    (target || box.querySelector('h2')).focus();
    box.scrollIntoView({ block: 'nearest' });
  }

  function startEdit(k) {
    editing.add(k);
    renderCard(k);
    focusCard(k);
  }

  function doneEdit(k) {
    if (isList(k)) model[k] = clean(k);
    editing.delete(k);
    if (saver.isDirty(k)) saver.flush();
    renderCard(k);
    const edit = els.main.querySelector(`[data-card="${k}"] [data-edit]`);
    if (edit) edit.focus();
  }

  function addLine(k) {
    if (model[k].length >= LIST_MAX[k].items) return;
    if (!model[k].length) model[k].push('');   // the empty editor showed one blank line
    model[k].push('');
    editing.add(k);
    renderCard(k);
    const inputs = els.main.querySelectorAll(`[data-card="${k}"] input[data-item]`);
    inputs[inputs.length - 1].focus();
  }

  function removeLine(k, i) {
    model[k].splice(i, 1);
    editing.add(k);
    saver.edit(k, 0);
    renderCard(k);
    renderLock();
    const inputs = els.main.querySelectorAll(`[data-card="${k}"] input[data-item]`);
    (inputs[Math.min(i, inputs.length - 1)] || els.main.querySelector(`[data-card="${k}"] [data-add]`)).focus();
  }

  function copyGaps() {
    if (!gaps || !gaps.length || has('lacks')) return;
    model.lacks = gaps.slice(0, LIST_MAX.lacks.items).map((t) => t.slice(0, LIST_MAX.lacks.chars));
    editing.delete('lacks');
    saver.edit('lacks', 0);
    renderCard('lacks');
    renderLock();
    els.main.querySelector('[data-card="lacks"] [data-edit]').focus();
  }

  function setTagError(msg) {
    const el = els && els.main.querySelector('[data-tag-error]');
    const input = els && els.main.querySelector('[data-tag-input]');
    if (!el) return;
    if (msg) { el.innerHTML = ICON.x(); el.append(msg); el.hidden = false; input.setAttribute('aria-invalid', 'true'); }
    else { el.hidden = true; input.removeAttribute('aria-invalid'); }
  }

  function addTag() {
    const input = els.main.querySelector('[data-tag-input]');
    const t = input.value.trim();
    if (!t) return;
    if (model.focus_tags.length >= LIST_MAX.focus_tags.items) { setTagError('You have 8 tags. Remove one first.'); return; }
    if (model.focus_tags.some((x) => x.trim().toLowerCase() === t.toLowerCase())) { setTagError('You already have this tag.'); return; }
    model.focus_tags.push(t);
    saver.edit('focus_tags', 0);
    renderCard('focus_tags');
    const next = els.main.querySelector('[data-tag-input]');
    if (!next.disabled) next.focus(); else els.main.querySelector('[data-tag-remove]').focus();
  }

  function removeTag(i) {
    model.focus_tags.splice(i, 1);
    saver.edit('focus_tags', 0);
    renderCard('focus_tags');
    const xs = els.main.querySelectorAll('[data-tag-remove]');
    (xs[Math.min(i, xs.length - 1)] || els.main.querySelector('[data-tag-input]')).focus();
  }

  /* ── Help me draft (stage positioning_help) ─ */

  async function runHelp(field) {
    if (busy()) return;
    const token = ++aiToken;
    clearAiNote();
    ai = { state: 'working', field };
    if (field) renderCard(field);
    syncBusy();
    renderAiNote();
    const stop = field ? els.main.querySelector(`[data-card="${field}"] [data-help-stop]`) : els.lock.querySelector('[data-help-stop]');
    if (stop) stop.focus();
    // The server reads the saved text, so save any edits first.
    if (saver.hasUnsaved()) await saver.flush();
    if (token !== aiToken) return;
    if (saver.state === 'error' && saver.hasUnsaved()) return helpFailed(field, 'save_first');
    const brief = one(book.book_briefs);
    if (!brief || !str(brief.topic_text).trim()) return helpFailed(field, 'no_topic');

    let res;
    try { res = await kdp.generate(field ? { stage: 'positioning_help', bookId: book.id, field } : { stage: 'positioning_help', bookId: book.id }); }
    catch (err) { res = { error: { code: 'network' } }; }
    if (token !== aiToken) return;   // stopped: the reply is dropped
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code === 'positioning_locked') { ai = { state: 'idle', field: null }; await reload(); return; }
    if (code) return helpFailed(field, code, code === 'not_enough_facts' ? res.error.missing : '');

    const s = (res.data && res.data.suggestions) || {};
    const u = (res.data && res.data.unsourced) || {};
    (field ? [field] : FIELDS).forEach((k) => {
      delete suggestions[k];
      delete unsourced[k];
      const v = s[k];
      if (isList(k)) {
        const items = list(v).map((t) => t.trim()).filter((t) => t && t.length <= LIST_MAX[k].chars).slice(0, LIST_MAX[k].items);
        if (items.length && items.join('\n') !== clean(k).join('\n')) suggestions[k] = items;
      } else {
        const t = str(v).trim();
        if (t && t.length <= MAX[k] && t !== model[k].trim()) suggestions[k] = t;
      }
      if (suggestions[k] !== undefined && Array.isArray(u[k]) && u[k].length) unsourced[k] = u[k].map(String);
    });
    ai = { state: 'done', field };
    if (!ctx.isActive(3) || !els) return;   // shown when the step opens again
    if (field) renderCard(field); else FIELDS.forEach(renderSuggestion);
    syncBusy();
    renderAiNote();
    const first = FIELDS.find((k) => suggestions[k] !== undefined && (!field || k === field));
    if (first) els.main.querySelector(`[data-suggest="${first}"] [data-suggest-text]`).focus();
  }

  function helpFailed(field, code, missing = '') {
    ai = { state: 'error', field, code, missing };
    if (!els) return;
    if (field) renderCard(field);
    syncBusy();
    renderAiNote();
  }

  function stopHelp() {
    const field = ai.field;
    aiToken++;
    ai = { state: 'stopped', field };
    if (field) renderCard(field);
    syncBusy();
    renderAiNote();
    const back = field ? els.main.querySelector(`[data-card="${field}"] [data-redraft]`) : els.lock.querySelector('[data-help-all]');
    if (back) back.focus();
  }

  function afterChoice(k) {
    delete suggestions[k];
    delete unsourced[k];
    if (!FIELDS.some((f) => suggestions[f] !== undefined) && ai.state === 'done') {
      ai = { state: 'idle', field: null };
      clearAiNote();
    } else renderAiNote();
  }

  function accept(k) {
    const s = suggestions[k];
    if (s === undefined) return;
    model[k] = Array.isArray(s) ? [...s] : s;
    editing.delete(k);
    saver.edit(k, 0);
    afterChoice(k);
    renderCard(k);
    renderLock();
    const edit = els.main.querySelector(`[data-card="${k}"] [data-edit]`);
    (edit || els.main.querySelector(`[data-card="${k}"] h2`)).focus();
  }

  function discard(k) {
    afterChoice(k);
    renderSuggestion(k);
    focusCard(k);
  }

  /* ── Drift check (stage drift_check) ───────── */

  async function runDrift() {
    if (busy()) return;
    drift = { state: 'working' };
    keeping = null;
    syncBusy();
    els.drift.querySelector('#driftTitle').focus();
    if (saver.hasUnsaved()) await saver.flush();
    if (saver.state === 'error' && saver.hasUnsaved()) { driftFailed('save_first'); return; }

    let res;
    try { res = await kdp.generate({ stage: 'drift_check', bookId: book.id }); } catch (err) { res = { error: { code: 'network' } }; }
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code === 'positioning_locked') { drift = { state: 'idle' }; await reload(); return; }
    if (code) { driftFailed(code); return; }

    const d = res.data || {};
    // The server saved these; keep the local row in step with it.
    setPos({ ...pos, drift_flags: Array.isArray(d.flags) ? d.flags : [], drift_checked_at: d.drift_checked_at, updated_at: d.updated_at || pos.updated_at });
    drift = { state: 'idle' };
    ctx.refresh();
    if (!ctx.isActive(3) || !els) return;
    syncBusy();
    const firstOpen = els.drift.querySelector('.posn-flag:not(.is-kept)');
    (firstOpen || els.drift.querySelector('#driftTitle')).focus();
  }

  function driftFailed(code) {
    drift = { state: 'error', code };
    if (!els) return;
    syncBusy();
    els.drift.querySelector('#driftTitle').focus();
  }

  function startKeep(id) {
    keeping = { id, text: '', state: 'idle', message: '' };
    renderDrift();
    els.drift.querySelector('[data-keep-input]').focus();
  }

  function cancelKeep() {
    const id = keeping && keeping.id;
    keeping = null;
    renderDrift();
    const b = id && els.drift.querySelector(`[data-flag="${CSS.escape(id)}"] [data-keep]`);
    if (b) b.focus();
  }

  async function saveKeep(id) {
    const input = els.drift.querySelector('[data-keep-input]');
    const reason = input.value.trim();
    if (!reason) {
      keeping = { id, text: input.value, state: 'idle', message: 'Say in a few words why this belongs in the book.' };
      renderDrift();
      const again = els.drift.querySelector('[data-keep-input]');
      again.setAttribute('aria-invalid', 'true');
      again.focus();
      return;
    }
    keeping = { id, text: reason, state: 'saving', message: '' };
    renderDrift();
    await setFlag(id, 'kept', reason);
  }

  /** Keep a flag with a reason, or undo that. Only status and reason change (0010). */
  async function setFlag(id, status, reason) {
    const next = flags().map((f) => (f.id === id ? { ...f, status, reason } : f));
    let res;
    try { res = await kdp.saveDriftFlags(book.id, next); } catch (err) { res = { error: err }; }
    if (res.error) {
      const m = res.error.message;
      if (m === 'positioning_locked' || m === 'drift_flags_server_only' || res.error.notFound) { keeping = null; await reload(); return; }
      if (status === 'kept') keeping = { id, text: reason, state: 'idle', message: 'We couldn’t save this. Check your connection, then try again.' };
      else flagError = 'We couldn’t undo that. Check your connection, then try again.';
      renderSide();
      return;
    }
    setPos(res.data);
    keeping = null;
    flagError = '';
    ctx.refresh();
    renderSide();
    const flag = els.drift.querySelector(`[data-flag="${CSS.escape(id)}"]`);
    if (flag) flag.focus();
  }

  function fixIt(k) {
    if (!CARDS[k]) return;
    if (!CARDS[k].tags) editing.add(k);
    renderCard(k);
    focusCard(k);
  }

  /* ── Approve and lock ────────────────────── */

  async function doLock() {
    if (busy() || lockReason()) return;
    lock = { state: 'working' };
    syncBusy();
    if (saver.hasUnsaved()) await saver.flush();
    let res;
    try { res = await kdp.lockPositioning(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      const e = res.error;
      // The database says why (0010); field names in "Missing: …" are not for the reader.
      const detail = e.message !== 'positioning_not_ready' ? ' Check your connection, then try again.'
        : (String(e.details || '').startsWith('Missing') ? ' Fill in the required cards first.' : ` ${e.details || ''}`);
      lock = { state: 'error', message: `We couldn’t lock it.${detail}` };
      if (e.message === 'positioning_not_ready') await reload();
      syncBusy();
      return;
    }
    lock = { state: 'idle' };
    if (!res.data) { await reload(); return; }   // already locked elsewhere
    setPos(res.data);
    editing.clear();
    suggestions = {};
    unsourced = {};
    ai = { state: 'idle', field: null };
    ctx.refresh();
    render(ctx.content());
    ctx.content().querySelector('[data-banner-title]').focus();
  }

  /* ── Locked view (design 18) ─────────────── */

  function renderLocked(root) {
    const date = new Date(pos.locked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const v = fromRow(pos);
    const block = (k) => {
      const c = CARDS[k];
      let body;
      if (c.tags) body = v.focus_tags.length ? `<ul class="posn-tags is-static">${v.focus_tags.map((t) => `<li class="posn-tag">${esc(t)}</li>`).join('')}</ul>` : '<p class="posn-text muted-text">No tags.</p>';
      else if (isList(k)) body = `<${c.list} class="posn-list">${v[k].map((t) => `<li>${esc(t)}</li>`).join('')}</${c.list}>`;
      else body = `<p class="posn-text${c.big ? ' is-big' : ''}">${esc(v[k])}</p>`;
      return `<section class="panel posn-ro" aria-labelledby="pr-${k}"><h2 class="posn-ro-label" id="pr-${k}">${c.title.toUpperCase()}</h2>${body}</section>`;
    };
    root.innerHTML = `
      <div class="posn is-locked">
        <div class="posn-banner">
          <span class="posn-banner-icon">${LOCK_ICON(18)}</span>
          <div class="posn-banner-text">
            <h2 class="posn-banner-title" tabindex="-1" data-banner-title>Approved and locked on ${esc(date)}</h2>
            <p>Title, Outline, and chapters follow this version.</p>
          </div>
          <button type="button" class="btn posn-banner-btn" data-unlock>Unlock to edit</button>
        </div>
        ${FIELDS.map(block).join('')}
      </div>`;
    root.querySelector('[data-unlock]').addEventListener('click', (e) => openUnlock(e.currentTarget));
    ctx.setGate();
  }

  /* ── Unlock dialog (design 21) ───────────── */

  let ul = null;

  function buildUnlock() {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', 'ulTitle');
    d.setAttribute('aria-describedby', 'ulDesc');
    d.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head"><div>
          <h2 id="ulTitle">Unlock positioning?</h2>
          <p id="ulDesc">Nothing is deleted.</p>
        </div></div>
        <div class="posn-impact" data-impact aria-live="polite"></div>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Keep locked</button>
          <button type="submit" class="btn btn-primary" data-go>Unlock</button>
        </div>
      </form>`;
    document.body.append(d);
    ul = { d, desc: d.querySelector('#ulDesc'), impact: d.querySelector('[data-impact]'), error: d.querySelector('[data-error]'), go: d.querySelector('[data-go]'), busy: false, opener: null, done: false, load: 0 };
    const close = () => { if (!ul.busy) d.close(); };
    d.querySelector('[data-close]').addEventListener('click', close);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { if (e.target === d) close(); });
    d.addEventListener('close', () => { if (!ul.done && ul.opener && ul.opener.isConnected) ul.opener.focus(); });
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [...d.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); doUnlock(); });
    ul.impact.addEventListener('click', (e) => { if (e.target.closest('[data-impact-retry]')) loadImpact(); });
  }

  function openUnlock(opener) {
    if (!ul) buildUnlock();
    ul.opener = opener;
    ul.done = false;
    ul.error.hidden = true;
    setUnlockBusy(false);
    ul.d.showModal();
    ul.d.querySelector('[data-close]').focus();
    loadImpact();
  }

  async function loadImpact() {
    const token = ++ul.load;
    // The "Needs review" line shows only when something gets the mark.
    ul.desc.textContent = 'Nothing is deleted.';
    ul.impact.hidden = false;
    ul.impact.innerHTML = '<p class="field-hint" role="status"><span class="spinner inline" aria-hidden="true"></span> Checking what is built on it…</p>';
    let res;
    try { res = await kdp.getUnlockImpact(book.id); } catch (err) { res = { error: err }; }
    if (token !== ul.load) return;
    if (res.error) {
      ul.impact.innerHTML = '<p class="field-hint">We couldn’t check the later steps. You can still unlock. <button type="button" class="link-btn" data-impact-retry>Try again</button></p>';
      return;
    }
    const chips = [];
    if (book.title) chips.push('04 Title');
    if (res.data.chapters) chips.push('05 Outline');
    if (res.data.written) chips.push(`${res.data.written} written chapter${res.data.written === 1 ? '' : 's'}`);
    ul.desc.textContent = chips.length
      ? 'These get a "Needs review" mark. Nothing is deleted.'
      : 'Nothing is built on it yet. Nothing is deleted.';
    ul.impact.innerHTML = chips.length
      ? `<ul class="posn-impact-list">${chips.map((t) => `<li class="badge badge-warning">${ICON.warn(12)}${esc(t)}</li>`).join('')}</ul>`
      : '';
    ul.impact.hidden = !chips.length;
  }

  function setUnlockBusy(on) {
    ul.busy = on;
    ul.go.disabled = on;
    ul.go.setAttribute('aria-busy', String(on));
    ul.go.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Unlocking…' : 'Unlock';
    ul.d.querySelector('[data-close]').disabled = on;
  }

  async function doUnlock() {
    if (ul.busy) return;
    setUnlockBusy(true);
    ul.error.hidden = true;
    let res;
    try { res = await kdp.unlockPositioning(book.id); } catch (err) { res = { error: err }; }
    setUnlockBusy(false);
    if (res.error) {
      if (res.error.code === 'P0002') {   // not locked any more (another tab)
        ul.done = true;
        ul.d.close();
        await reload();
        return;
      }
      ul.error.innerHTML = ICON.warn(18);
      const p = document.createElement('p');
      p.className = 'alert-text';
      p.textContent = 'We couldn’t unlock it. Check your connection, then try again.';
      ul.error.append(p);
      ul.error.hidden = false;
      return;
    }
    const r = res.data || {};
    if (r.title) book.title_needs_review = true;
    setPos({ ...pos, locked_at: null });
    ul.done = true;
    ul.d.close();
    ctx.refresh();
    render(ctx.content());
    ctx.content().querySelector('.posn-intro').setAttribute('tabindex', '-1');
    ctx.content().querySelector('.posn-intro').focus();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[3] = {
    init,
    render,
    isDone,
    doneMark: 'lock',
    blockers: () => 0,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
