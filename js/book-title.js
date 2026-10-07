/* ═══════════════════════════════════════════════════
   KDP Lab — Step 04 Title (designs 19, 21)
   /js/book-title.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[4]. js/book.js calls init() once after the book
   loads, render() each time step 04 is shown, and isDone() for the sidebar
   (done = title and subtitle set, and no "Needs review").

   - "Titles that made you click": up to 3 examples, saved to
     books.title_examples through js/autosave.js.
   - Generate / More ideas (stage title_ideas) needs a locked positioning.
     The server saves the options (title_options) and returns them; more
     ideas only add. At most 40 options per book (migration 0011).
   - Each option: star for the shortlist, "Use as my title", and Remove in
     its menu (only when not starred).
   - "Your title": a draft until "Use this title" writes books.title and
     books.subtitle. That also clears "Needs review", but only while the
     positioning is locked (0011 enforces it).
   - Checks come from our code (js/title-checks.js), never from the AI, and
     never say a title is safe or available. We don't check trademarks.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const C = kdpTitleChecks;

  // Same limits as migration 0011 and supabase/functions/generate/lib.ts.
  const MAX_EXAMPLES = 3;
  const MAX_EXAMPLE = 250;
  const MAX_OPTIONS = 40;
  const PER_CALL = 10;
  const FIRST_SHOWN = 3;

  const STAR = (filled) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`;

  let ctx = null, book = null, saver = null, els = null;
  let examples = ['', '', ''];
  let load = { state: 'idle' };          // idle | loading | ready | error
  let options = [], competitors = [];
  let ai = { state: 'idle' };            // idle | working | done | error | stopped
  let aiToken = 0;
  let showAll = false;
  let menuFor = null;                    // option id with an open menu
  let optNote = null;                    // { id, text } after a failed star or remove
  let draft = { title: '', subtitle: '' };
  let use = { state: 'idle' };           // idle | working | saved | error

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const one = (rel) => (Array.isArray(rel) ? rel[0] : rel) || null;
  const isLocked = () => { const p = one(book.positioning); return !!(p && p.locked_at); };
  const savedTitle = () => ({ title: str(book.title), subtitle: str(book.subtitle) });
  const trimmed = () => ({ title: draft.title.trim(), subtitle: draft.subtitle.trim() });
  const roomLeft = () => Math.max(0, MAX_OPTIONS - options.length);
  const fullText = (o) => (o.subtitle ? `${o.title}: ${o.subtitle}` : o.title);

  /** Newest batch first; the order does not change when you star. */
  const sorted = () => [...options].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  function fromBook(b) {
    const list = Array.isArray(b.title_examples) ? b.title_examples.filter((x) => typeof x === 'string') : [];
    return Array.from({ length: MAX_EXAMPLES }, (_, i) => list[i] || '');
  }

  /** The examples to save: trimmed, blanks dropped. */
  function read() {
    const list = examples.map((t) => t.trim()).filter(Boolean);
    if (list.some((t) => t.length > MAX_EXAMPLE)) return { error: `use ${MAX_EXAMPLE} characters or fewer per example.` };
    return list;
  }

  function onSaved(res, sent) {
    book.updated_at = res.data.updated_at;
    book.title_examples = read();
    if (sent) ctx.refresh();
  }

  function onError(res) {
    const e = res.error || {};
    if (e.notFound) { saver.reset('error'); ctx.notFound(); return true; }
    if (['23514', '42501'].includes(e.code)) {
      // Drop the edits first: re-rendering a focused field would send them again.
      saver.reset('error', 'This change breaks a Title rule, so it was not saved.');
      examples = fromBook(book);
      if (ctx.isActive(4) && els) renderExamples();
      return true;
    }
    return false;
  }

  /* ── Data ────────────────────────────────── */

  async function loadData() {
    load = { state: 'loading' };
    if (els) renderAll();
    let res;
    try { res = await kdp.getTitleData(book.id); } catch (err) { res = { error: err }; }
    if (res.error) { load = { state: 'error' }; }
    else {
      options = res.data.options || [];
      competitors = res.data.competitors || [];
      load = { state: 'ready' };
    }
    if (ctx.isActive(4) && els) renderAll();
  }

  /* ── Rendering ───────────────────────────── */

  function render(root) {
    root.innerHTML = `
      <div class="ttl">
        <div class="ttl-main">
          <section class="panel ttl-examples" aria-labelledby="ttlExTitle">
            <div>
              <h2 class="ttl-h2" id="ttlExTitle">Titles that made you click</h2>
              <p class="ttl-sub">Search your topic on Amazon as a buyer. Paste the 3 titles you would click first.</p>
            </div>
            <div class="ttl-example-list" data-examples></div>
            <div class="ttl-gen" data-gen></div>
          </section>
          <div data-options></div>
        </div>
        <aside class="ttl-side" aria-label="Shortlist and your title">
          <section class="panel ttl-panel" data-shortlist aria-labelledby="ttlShort"></section>
          <section class="panel ttl-panel" data-your aria-labelledby="ttlYour"></section>
        </aside>
      </div>`;
    els = {
      root,
      examples: root.querySelector('[data-examples]'),
      gen: root.querySelector('[data-gen]'),
      options: root.querySelector('[data-options]'),
      shortlist: root.querySelector('[data-shortlist]'),
      your: root.querySelector('[data-your]')
    };
    renderExamples();
    renderYour();
    bind(root.querySelector('.ttl'));
    if (load.state === 'idle') loadData(); else renderAll();
  }

  function renderAll() {
    if (!els) return;
    renderGen();
    renderOptions();
    renderShortlist();
    renderChecks();
  }

  function renderExamples() {
    els.examples.innerHTML = examples.map((v, i) => `
      <label class="sr-only" for="ttlEx${i}">Example title ${i + 1}</label>
      <input type="text" class="text-input" id="ttlEx${i}" data-example="${i}" maxlength="${MAX_EXAMPLE}" autocomplete="off" value="${esc(v)}" placeholder="Example title ${i + 1}">`).join('');
  }

  /** The Generate / More ideas button and the notes under it. */
  function renderGen() {
    if (!els) return;
    const working = ai.state === 'working';
    const first = options.length === 0;
    const label = first ? `Generate ${PER_CALL} options` : 'More ideas';
    let disabled = working || load.state !== 'ready' || !isLocked() || roomLeft() === 0;
    let note = '';
    if (!isLocked()) {
      note = `<p class="ttl-note is-warn">${ICON.warn(16)}<span>Lock your positioning first. Title ideas follow it. <a href="?id=${encodeURIComponent(book.id)}&step=3">Go to 03 Positioning</a></span></p>`;
    } else if (load.state === 'ready' && roomLeft() === 0) {
      note = `<p class="ttl-note">You have ${MAX_OPTIONS} options, the limit. Remove some to get more ideas.</p>`;
    } else if (load.state === 'ready' && !first && roomLeft() < PER_CALL) {
      note = `<p class="ttl-note">Room for ${roomLeft()} more. A book can have ${MAX_OPTIONS} options.</p>`;
    }
    let status = '';
    if (ai.state === 'stopped') status = '<p class="help-note" role="status">Stopped. If the AI had already finished, this call may still count.</p>';
    else if (ai.state === 'error') status = alertHtml(ai.code);
    else if (ai.state === 'done') status = `<p class="help-note" role="status">${ICON.sparkle}${ai.added} new option${ai.added === 1 ? '' : 's'} added at the top.</p>`;
    els.gen.innerHTML = `
      <button type="button" class="btn ${first ? 'btn-primary' : 'btn-secondary'}" data-generate${disabled ? ' disabled' : ''}>${ICON.sparkle}${label}</button>
      ${note}<div data-gen-status>${status}</div>`;
  }

  /** [kind, text, retry] for an error code. */
  function aiMessage(code) {
    switch (code) {
      case 'positioning_not_locked': return ['warning', 'Lock your positioning in 03 first. Title ideas follow it.', false];
      case 'options_full': return ['warning', `You have ${MAX_OPTIONS} options, the limit. Remove some to get more ideas.`, false];
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

  function renderOptions() {
    if (!els) return;
    const box = els.options;
    if (load.state === 'loading' || load.state === 'idle') {
      box.innerHTML = '<p class="sr-only" role="status">Loading title options…</p><div class="panel ttl-skel" aria-hidden="true"><div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div></div>';
      return;
    }
    if (load.state === 'error') {
      box.innerHTML = `<div class="alert alert-error" role="alert">${ICON.warn(18)}<div>
          <p class="alert-text">We couldn’t load your title options. Check your connection, then try again.</p>
          <button type="button" class="link-btn" data-reload>Try again</button></div></div>`;
      return;
    }
    const working = ai.state === 'working'
      ? `<div class="panel ttl-working" role="status">
          <div class="help-working"><span class="spinner" aria-hidden="true"></span>Writing title ideas from your locked positioning…</div>
          <div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div>
          <div><button type="button" class="btn btn-secondary" data-stop>Stop</button></div>
        </div>`
      : '';
    if (!options.length) {
      box.innerHTML = working || `<div class="ttl-empty"><p>No options yet.</p><p class="ttl-sub">${isLocked()
        ? `Generate ${PER_CALL} options, or type your own title on the right.`
        : 'Lock your positioning to get title ideas. You can type your own title on the right at any time.'}</p></div>`;
      return;
    }
    const list = sorted();
    const shown = showAll ? list : list.slice(0, FIRST_SHOWN);
    const more = list.length - shown.length;
    box.innerHTML = `
      <div class="ttl-options-head"><h2 class="ttl-h2">Options <span class="ttl-count">${options.length}</span></h2></div>
      ${working}
      <ul class="ttl-options">${shown.map(optionHtml).join('')}</ul>
      ${more > 0 ? `<button type="button" class="btn btn-secondary btn-block" data-show-more>Show ${more} more</button>` : ''}
      ${showAll && list.length > FIRST_SHOWN ? '<button type="button" class="btn btn-secondary btn-block" data-show-less>Show fewer</button>' : ''}`;
  }

  function optionHtml(o) {
    const r = C.check(o.title, o.subtitle, competitors);
    const name = esc(fullText(o));
    const chips = [
      ...(o.keywords || []).map((k) => `<span class="ttl-chip">${esc(k)}</span>`),
      ...r.warnings.map((w) => `<span class="check-badge warn">${ICON.warn()}${esc(w.text)}</span>`),
      ...(o.unsourced || []).map((n) => `<span class="check-badge warn">${ICON.warn()}Verify: no source for ${esc(n)}</span>`),
      r.over ? `<span class="check-badge fail">${ICON.x()}Over 200</span>` : ''
    ].join('');
    const menu = o.shortlisted ? '' : `
      <div class="ttl-menu-wrap">
        <button type="button" class="icon-btn" data-opt-menu="${o.id}" aria-haspopup="menu" aria-expanded="${menuFor === o.id}" aria-label="More actions for ${name}">${ICON.more}</button>
        ${menuFor === o.id ? `<div class="menu" role="menu"><button type="button" class="menu-item danger" role="menuitem" data-remove="${o.id}">${ICON.trash()}Remove</button></div>` : ''}
      </div>`;
    const note = optNote && optNote.id === o.id ? `<p class="ttl-opt-error" role="alert">${ICON.warn()}${esc(optNote.text)}</p>` : '';
    return `<li class="ttl-opt${o.shortlisted ? ' is-starred' : ''}" data-opt="${o.id}">
        <button type="button" class="ttl-star" data-star="${o.id}" aria-pressed="${!!o.shortlisted}" aria-label="${o.shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}: ${name}">${STAR(o.shortlisted)}</button>
        <div class="ttl-opt-body">
          <p class="ttl-opt-text"><strong>${esc(o.title)}${o.subtitle ? ':' : ''}</strong>${o.subtitle ? ` ${esc(o.subtitle)}` : ''}</p>
          ${o.reason ? `<p class="ttl-opt-reason"><span class="ttl-ai">AI</span>${esc(o.reason)}</p>` : ''}
          <div class="ttl-chips">${chips}<span class="ttl-len">${r.length} / ${C.MAX}</span></div>
          <div class="ttl-opt-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-use-opt="${o.id}">Use as my title</button>
            ${menu}
          </div>
          ${note}
        </div>
      </li>`;
  }

  function renderShortlist() {
    if (!els) return;
    const starred = sorted().filter((o) => o.shortlisted);
    els.shortlist.innerHTML = `
      <h2 class="ttl-label" id="ttlShort">SHORTLIST · ${starred.length}</h2>
      ${starred.length
        ? `<ul class="ttl-short">${starred.map((o) => `<li><button type="button" class="ttl-short-btn" data-use-opt="${o.id}" title="Use as my title">★ ${esc(fullText(o))}</button></li>`).join('')}</ul>`
        : '<p class="ttl-sub">Star the options you like. They show here.</p>'}`;
  }

  function renderYour() {
    const b = book;
    const series = str(b.series_name).trim()
      ? `Series: ${esc(b.series_name)}${b.series_number ? `, book ${esc(String(b.series_number))}` : ''}.`
      : 'Series (optional) is set in 01 Brief.';
    els.your.innerHTML = `
      <h2 class="ttl-h2" id="ttlYour">Your title</h2>
      <div data-review></div>
      <div class="field">
        <label for="ttlTitle">Title</label>
        <input type="text" class="text-input" id="ttlTitle" data-draft="title" maxlength="${C.MAX}" autocomplete="off" value="${esc(draft.title)}">
      </div>
      <div class="field">
        <label for="ttlSubtitle">Subtitle</label>
        <textarea class="text-input ttl-subarea" id="ttlSubtitle" data-draft="subtitle" rows="3" maxlength="${C.MAX}">${esc(draft.subtitle)}</textarea>
      </div>
      <div class="ttl-checks" data-checks aria-live="polite"></div>
      <div class="ttl-use">
        <button type="button" class="btn btn-primary" data-use>Use this title</button>
        <div data-use-status></div>
      </div>
      <p class="ttl-foot">${series} <a href="?id=${encodeURIComponent(b.id)}&step=1">Edit in 01 Brief</a></p>
      <p class="ttl-foot">Not locked. You can change the title until 10 Metadata.</p>`;
    renderChecks();
  }

  /** Counter, checks, review note and the Use button. Updated on every keystroke. */
  function renderChecks() {
    if (!els) return;
    const t = trimmed();
    const r = C.check(t.title, t.subtitle, competitors);
    const pct = Math.min(100, Math.round((r.length / C.MAX) * 100));
    const rows = t.title
      ? [...r.warnings.map((w) => `<li class="is-warn">${ICON.warn(16)}<span>${esc(w.text)}</span></li>`),
         ...r.passes.map((p) => `<li class="is-pass">${ICON.check(16)}<span>${esc(p.text)}</span></li>`)].join('')
      : '';
    els.your.querySelector('[data-checks]').innerHTML = `
      <div class="ttl-count-row"><span>Title + subtitle</span><strong class="${r.over ? 'is-over' : ''}">${r.length} / ${C.MAX}</strong></div>
      <div class="ttl-bar${r.over ? ' is-over' : ''}" aria-hidden="true"><div style="width:${r.over ? 100 : pct}%"></div></div>
      ${r.over ? `<p class="ttl-over">${ICON.x(14)}KDP allows ${C.MAX} characters. Remove ${r.over}.</p>` : ''}
      ${load.state === 'ready' ? (rows ? `<ul class="ttl-check-list">${rows}</ul>` : '') : ''}
      <p class="ttl-sub">These checks are a guide. We don’t check trademarks.</p>`;

    const review = els.your.querySelector('[data-review]');
    review.innerHTML = book.title_needs_review
      ? `<p class="ttl-note is-warn">${ICON.warn(16)}<span><strong>Needs review.</strong> The positioning was unlocked after you picked this title. ${isLocked()
        ? 'Check it, then press Use this title.'
        : 'Lock the positioning in 03 again, then press Use this title.'}</span></p>`
      : '';

    const s = savedTitle();
    const same = t.title === s.title.trim() && t.subtitle === s.subtitle.trim();
    const clears = book.title_needs_review && isLocked();
    const btn = els.your.querySelector('[data-use]');
    btn.disabled = use.state === 'working' || !t.title || r.over > 0 || (same && !clears);
    const status = els.your.querySelector('[data-use-status]');
    if (use.state === 'working') status.innerHTML = '<p class="ttl-sub" role="status"><span class="spinner inline" aria-hidden="true"></span>Saving…</p>';
    else if (use.state === 'error') status.innerHTML = `<p class="ttl-note is-error" role="alert">${ICON.warn(16)}<span>${esc(use.message)}</span></p>`;
    else if (!same && (t.title || t.subtitle)) status.innerHTML = '<p class="ttl-sub">Not used yet. Press Use this title to save it.</p>';
    else if (same && t.title && !t.subtitle) status.innerHTML = '<p class="ttl-sub">Add a subtitle to finish this step.</p>';
    else if (use.state === 'saved' && same) status.innerHTML = `<p class="ttl-note is-pass" role="status">${ICON.check(16)}<span>Title saved.</span></p>`;
    else status.innerHTML = '';
  }

  /* ── Events ──────────────────────────────── */

  function bind(root) {
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-example]')) {
        examples[Number(t.dataset.example)] = t.value;
        saver.edit('title_examples', 800);
      } else if (t.matches('[data-draft]')) {
        draft[t.dataset.draft] = t.value;
        if (use.state !== 'working') use = { state: 'idle' };
        renderChecks();
      }
    });
    root.addEventListener('focusout', (e) => {
      if (e.target.matches('[data-example]') && saver.isDirty('title_examples')) saver.flush();
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) { if (menuFor) closeMenu(false); return; }
      if (b.matches('[data-generate], [data-generate-retry]')) return generate();
      if (b.matches('[data-stop]')) return stop();
      if (b.matches('[data-reload]')) return loadData();
      if (b.matches('[data-show-more]')) { showAll = true; renderOptions(); focusOpt(sorted()[FIRST_SHOWN]); return; }
      if (b.matches('[data-show-less]')) { showAll = false; renderOptions(); els.options.querySelector('[data-show-more]').focus(); return; }
      if (b.dataset.star) return star(b.dataset.star);
      if (b.dataset.useOpt) return useOption(b.dataset.useOpt);
      if (b.dataset.optMenu) { if (menuFor === b.dataset.optMenu) closeMenu(true); else openMenu(b.dataset.optMenu); return; }
      if (b.dataset.remove) return remove(b.dataset.remove);
      if (b.matches('[data-use]')) return useTitle();
      if (menuFor) closeMenu(false);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuFor) { e.preventDefault(); closeMenu(true); }
    });
  }

  function focusOpt(o) {
    if (!o || !els) return;
    const el = els.options.querySelector(`[data-opt="${o.id}"] [data-star]`);
    if (el) el.focus();
  }

  function openMenu(id) {
    menuFor = id;
    renderOptions();
    const item = els.options.querySelector(`[data-opt="${id}"] [role="menuitem"]`);
    if (item) item.focus();
  }

  function closeMenu(refocus) {
    const id = menuFor;
    menuFor = null;
    renderOptions();
    if (refocus) { const btn = els.options.querySelector(`[data-opt-menu="${id}"]`); if (btn) btn.focus(); }
  }

  /* ── Generate (stage title_ideas) ────────── */

  async function generate() {
    if (ai.state === 'working' || !isLocked() || roomLeft() === 0) return;
    const token = ++aiToken;
    ai = { state: 'working' };
    renderGen();
    renderOptions();
    const stopBtn = els.options.querySelector('[data-stop]');
    if (stopBtn) stopBtn.focus();
    // The server reads the saved examples, so save edits first.
    if (saver.hasUnsaved()) await saver.flush();
    if (token !== aiToken) return;
    if (saver.state === 'error' && saver.hasUnsaved()) return failed('save_first');

    let res;
    try { res = await kdp.generate({ stage: 'title_ideas', bookId: book.id }); }
    catch (err) { res = { error: { code: 'network' } }; }
    if (token !== aiToken) {
      // Stopped: the reply is not shown, but saved options are real rows.
      if (res.data && Array.isArray(res.data.options)) addOptions(res.data.options);
      return;
    }
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code) return failed(code);

    const added = addOptions((res.data && res.data.options) || []);
    ai = { state: 'done', added };
    showAll = false;
    if (!ctx.isActive(4) || !els) return;
    renderAll();
    focusOpt(sorted()[0]);
  }

  /** Add saved options from the server. Returns how many were new. */
  function addOptions(rows) {
    const have = new Set(options.map((o) => o.id));
    const fresh = rows.filter((o) => o && o.id && !have.has(o.id));
    options = options.concat(fresh);
    if (els && ctx.isActive(4) && ai.state !== 'working') renderAll();
    return fresh.length;
  }

  function failed(code) {
    ai = { state: 'error', code };
    if (!els || !ctx.isActive(4)) return;
    renderGen();
    renderOptions();
    const a = els.gen.querySelector('[role="alert"]');
    if (a) a.scrollIntoView({ block: 'nearest' });
  }

  /** "N new options added" is only news until the next star, remove or use. */
  function clearDone() {
    if (ai.state !== 'done') return;
    ai = { state: 'idle' };
    renderGen();
  }

  function stop() {
    aiToken++;
    ai = { state: 'stopped' };
    renderGen();
    renderOptions();
    const g = els.gen.querySelector('[data-generate]');
    if (g && !g.disabled) g.focus();
  }

  /* ── Options: star, use, remove ──────────── */

  async function star(id) {
    const o = options.find((x) => x.id === id);
    if (!o) return;
    const on = !o.shortlisted;
    o.shortlisted = on;               // shown at once; put back on failure
    optNote = null;
    menuFor = null;
    clearDone();
    renderOptions();
    renderShortlist();
    focusStar(id);
    let res;
    try { res = await kdp.setShortlisted(id, on); } catch (err) { res = { error: err }; }
    if (!res.error) return;
    o.shortlisted = !on;
    if (res.error.notFound) options = options.filter((x) => x.id !== id);
    else optNote = { id, text: "Couldn't save the star. Try again." };
    if (!ctx.isActive(4) || !els) return;
    renderOptions();
    renderShortlist();
    focusStar(id);
  }

  function focusStar(id) {
    const el = els && els.options.querySelector(`[data-star="${id}"]`);
    if (el) el.focus();
  }

  function useOption(id) {
    const o = options.find((x) => x.id === id);
    if (!o) return;
    draft = { title: o.title, subtitle: o.subtitle || '' };
    use = { state: 'idle' };
    clearDone();
    els.your.querySelector('#ttlTitle').value = draft.title;
    els.your.querySelector('#ttlSubtitle').value = draft.subtitle;
    renderChecks();
    els.your.querySelector('#ttlTitle').focus();
  }

  async function remove(id) {
    const list = sorted();
    const at = list.findIndex((x) => x.id === id);
    menuFor = null;
    optNote = null;
    clearDone();
    let res;
    try { res = await kdp.removeTitleOption(id); } catch (err) { res = { error: err }; }
    if (res.error && !res.error.notFound) {
      optNote = { id, text: "Couldn't remove this option. Try again." };
      renderOptions();
      return;
    }
    options = options.filter((x) => x.id !== id);
    if (!ctx.isActive(4) || !els) return;
    renderAll();
    const rest = sorted();
    const next = rest[Math.min(at, rest.length - 1)];
    if (next && els.options.querySelector(`[data-opt="${next.id}"]`)) focusOpt(next);
    else els.gen.querySelector('[data-generate]').focus();
  }

  /* ── Use this title ──────────────────────── */

  async function useTitle() {
    const t = trimmed();
    const r = C.check(t.title, t.subtitle, competitors);
    if (!t.title || r.over || use.state === 'working') return;
    const clear = book.title_needs_review && isLocked();
    use = { state: 'working' };
    clearDone();
    renderChecks();
    let res;
    try { res = await kdp.useTitle(book.id, t.title, t.subtitle || null, clear); } catch (err) { res = { error: err }; }
    const e = res.error;
    if (e && e.notFound) { ctx.notFound(); return; }
    if (e) {
      use = { state: 'error', message: e.message === 'positioning_not_locked'
        ? 'Lock the positioning in 03 again, then use this title.'
        : e.code === '23514' ? 'This title breaks a rule (200 characters at most), so it was not saved.'
          : "Couldn't save the title. Check your connection, then try again." };
      renderChecks();
      return;
    }
    Object.assign(book, { title: res.data.title, subtitle: res.data.subtitle, title_needs_review: res.data.title_needs_review, updated_at: res.data.updated_at });
    draft = { title: res.data.title, subtitle: res.data.subtitle || '' };
    use = { state: 'saved' };
    ctx.refresh();
    if (ctx.isActive(4) && els) renderChecks();
  }

  /* ── Step API for js/book.js ─────────────── */

  const isDone = (b) => !!(str(b.title).trim() && str(b.subtitle).trim() && !b.title_needs_review);

  /** What step 04 still needs, or ''. "Needs review" has its own flag in the sidebar. */
  function missing() {
    if (!book || book.title_needs_review) return '';
    if (!str(book.title).trim()) return 'Pick a title';
    if (!str(book.subtitle).trim()) return 'Add a subtitle';
    return '';
  }

  function init(b, c) {
    ctx = c;
    book = b;
    examples = fromBook(b);
    draft = { title: str(b.title), subtitle: str(b.subtitle) };
    saver = kdpAutosave.create({
      read: () => read(),
      save: (fields) => kdp.updateBook(book.id, fields),
      onSaved, onError,
      render: (state, message, canRetry) => ctx.renderSave(state, message, canRetry, 4)
    });
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[4] = {
    init,
    render,
    isDone,
    missing,
    blockers: () => 0,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
