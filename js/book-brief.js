/* ═══════════════════════════════════════════════════
   KDP Lab — Step 01 Brief (designs 14 and 16)
   /js/book-brief.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[1]. js/book.js calls init() once after the book
   loads, render() each time step 01 is shown, and isDone()/blockers() for
   the sidebar mark and the Next button.

   Writes book_briefs (topic, reader, promise, type, trim, length, chapters,
   options) and books (pen_name_id, series). Limits match migration 0007.
   "Help me fill" (generate stage brief_help) only makes suggestions: each
   one waits for Accept or Discard. Nothing is replaced silently.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc, one, voiceSummary } = kdpPens;

  const MAX = {
    topic_text: 200, target_reader: 300, reader_problem: 1000, promise_draft: 1000,
    stance: 500, standout: 500, references: 2000, series_name: 200
  };
  const REQUIRED = [
    ['topic_text', 'Enter a topic to continue.'],
    ['target_reader', 'Describe who this book is for to continue.'],
    ['reader_problem', 'Describe the reader’s problem to continue.']
  ];
  const AI_FIELDS = [
    ['target_reader', 'Target reader'],
    ['reader_problem', 'Reader problem'],
    ['promise_draft', 'Reader promise']
  ];
  // Same keys as the book_type check (0001) and lib.ts BOOK_TYPES.
  const BOOK_TYPES = [
    ['beginner_guide', 'Beginner guide'], ['how_to', 'How-to guide'], ['workbook', 'Workbook'],
    ['self_help', 'Self-help'], ['cookbook', 'Cookbook']
  ];
  const TRIMS = ['5x8', '5.5x8.5', '6x9', '7x10', '8.5x11'];
  // [key, chip text, low words, high words or null]
  const LENGTHS = [
    ['5-8k', '5K to 8K words', 5000, 8000], ['8-12k', '8K to 12K', 8000, 12000],
    ['12-20k', '12K to 20K', 12000, 20000], ['20-30k', '20K to 30K', 20000, 30000],
    ['30k+', '30K+', 30000, null]
  ];
  const CHAPTERS = [5, 6, 7, 8, 9, 10, 12];
  const OPTION_KEYS = ['stance', 'standout', 'references'];
  const BOOK_FIELDS = ['pen_name_id', 'series_name', 'series_number'];
  const HELP_CAPTION = 'Suggestions appear under each field. Nothing changes until you accept.';

  let ctx = null, book = null, model = null, saved = null, saver = null, els = null;
  let pens = null, pensState = 'loading';     // 'loading' | 'ready' | 'error'
  let moreOpen = false;
  const shownErrors = new Set();               // required fields that show their message
  let help = { state: 'idle' };                // idle | working | done | error | stopped
  let helpToken = 0;
  let suggestions = {};                        // field → suggested text

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const filled = (v) => str(v).trim().length > 0;

  function fromBook(b) {
    const br = one(b.book_briefs) || {};
    const o = br.options && typeof br.options === 'object' && !Array.isArray(br.options) ? br.options : {};
    return {
      topic_text: str(br.topic_text), target_reader: str(br.target_reader),
      reader_problem: str(br.reader_problem), promise_draft: str(br.promise_draft),
      book_type: br.book_type || '', trim_size: br.trim_size || '6x9',
      length_range: br.length_range || '', chapter_count: br.chapter_count || null,
      stance: str(o.stance), standout: str(o.standout), references: str(o.references),
      pen_name_id: b.pen_name_id || '', series_name: str(b.series_name),
      series_number: b.series_number == null ? '' : String(b.series_number)
    };
  }

  /** The value to save for a dirty field. Empty text is null. */
  function read(field) {
    const text = (k) => {
      const t = model[k].trim();
      if (t.length > MAX[k]) return { error: `use ${MAX[k]} characters or fewer.` };
      return t || null;
    };
    switch (field) {
      case 'options': {
        const o = {};
        for (const k of OPTION_KEYS) {
          const t = model[k].trim();
          if (t.length > MAX[k]) return { error: `use ${MAX[k]} characters or fewer.` };
          if (t) o[k] = t;
        }
        return o;
      }
      case 'book_type': case 'length_range': case 'pen_name_id': return model[field] || null;
      case 'trim_size': case 'chapter_count': return model[field];
      case 'series_number': return model.series_number === '' ? null : Number(model.series_number);
      default: return text(field);
    }
  }

  async function save(fields) {
    const brief = {}, bookFields = {};
    Object.keys(fields).forEach((k) => { (BOOK_FIELDS.includes(k) ? bookFields : brief)[k] = fields[k]; });
    let briefRes = null, bookRes = null;
    if (Object.keys(brief).length) {
      briefRes = await kdp.updateBrief(book.id, brief);
      if (briefRes.error) return briefRes;
    }
    if (Object.keys(bookFields).length) {
      bookRes = await kdp.updateBook(book.id, bookFields);
      if (bookRes.error) return bookRes;
    }
    return { data: { fields, brief: briefRes && briefRes.data, book: bookRes && bookRes.data }, error: null };
  }

  /** After a good save: the saved copy, and the book object the sidebar reads. */
  function onSaved(res) {
    const { fields } = res.data;
    const br = one(book.book_briefs) || {};
    Object.keys(fields).forEach((k) => {
      if (k === 'options') OPTION_KEYS.forEach((o) => { saved[o] = str(fields.options[o]); });
      else saved[k] = fields[k] == null ? (k === 'chapter_count' ? null : '') : (k === 'series_number' ? String(fields[k]) : fields[k]);
      if (BOOK_FIELDS.includes(k)) book[k] = fields[k];
      else br[k] = fields[k];
    });
    if (res.data.brief) br.updated_at = res.data.brief.updated_at;
    if (res.data.book) book.updated_at = res.data.book.updated_at;
    book.book_briefs = br;
    if ('pen_name_id' in fields) {
      const p = (pens || []).find((x) => x.id === fields.pen_name_id);
      book.pen_names = p ? { id: p.id, name: p.name, voice: p.voice } : null;
    }
    ctx.refresh();
  }

  function onError(res, sent) {
    const e = res.error || {};
    if (e.notFound) { ctx.notFound(); return true; }
    // 23514 = a check (0007), 42501 = RLS (a pen name that is not the user's), 23503 = gone.
    if (['23514', '42501', '23503'].includes(e.code)) {
      sent.forEach((f) => {
        if (f === 'options') OPTION_KEYS.forEach((o) => { model[o] = saved[o]; });
        else model[f] = saved[f];
      });
      if (ctx.isActive(1)) render(ctx.content());
      ctx.renderSave('error', sent.includes('pen_name_id')
        ? 'That pen name is not available, so it was not saved.'
        : 'This change breaks a Brief rule, so it was not saved.', false);
      return true;
    }
    return false;
  }

  /* ── Step API for js/book.js ─────────────── */

  const isDone = (b) => {
    const s = fromBook(b);
    return REQUIRED.every(([k]) => filled(s[k]));
  };
  const blockers = () => REQUIRED.filter(([k]) => !filled(model[k])).length;

  function init(b, c) {
    ctx = c;
    book = b;
    model = fromBook(b);
    saved = fromBook(b);
    saver = kdpAutosave.create({ read, save, onSaved, onError, render: ctx.renderSave });
    loadPens();
  }

  async function loadPens() {
    pensState = 'loading';
    if (els) renderPen();
    let res;
    try { res = await kdp.listPenNameOptions(); } catch (err) { res = { error: err }; }
    if (res.error) { pensState = 'error'; if (els) renderPen(); return; }
    pens = res.data || [];
    pensState = 'ready';
    if (els) renderPen();
  }

  /* ── Rendering ───────────────────────────── */

  const trimText = (t) => `${t.replace('x', ' × ')} in`;

  function pagesHint() {
    const len = LENGTHS.find(([k]) => k === model.length_range);
    if (!len) return 'Pick a range to see an estimate of pages.';
    // About 133 words a page at 6 × 9 in (headings, lists, white space), scaled by page area.
    const [w, h] = model.trim_size.split('x').map(Number);
    const perPage = 133 * (w * h) / 54;
    const pages = (words) => Math.max(10, Math.round(words / perPage / 10) * 10);
    const range = len[3] ? `${pages(len[2])} to ${pages(len[3])}` : `${pages(len[2])}+`;
    return `About ${range} pages at ${trimText(model.trim_size)}`;
  }

  function chips(field, list, labelId) {
    return `<div class="tone-chips" role="group" aria-labelledby="${labelId}" data-chips="${field}">
      ${list.map(([value, text]) => `<button type="button" class="tone-chip" data-value="${esc(value)}" aria-pressed="${String(model[field]) === String(value)}">${esc(text)}</button>`).join('')}
    </div>`;
  }

  function textField({ key, label, required, hint, area, rows = 2 }) {
    const req = required ? ' <span class="field-optional">(required)</span>' : '';
    const hintHtml = hint ? `<span class="field-hint" id="bf-${key}-hint">${hint}</span>` : '';
    const described = [hint ? `bf-${key}-hint` : '', `bf-${key}-error`].filter(Boolean).join(' ');
    const control = area
      ? `<textarea class="text-area" id="bf-${key}" rows="${rows}" maxlength="${MAX[key]}" data-field="${key}" aria-describedby="${described}"${required ? ' aria-required="true"' : ''}></textarea>`
      : `<input class="text-input" id="bf-${key}" type="text" maxlength="${MAX[key]}" autocomplete="off" data-field="${key}" aria-describedby="${described}"${required ? ' aria-required="true"' : ''} />`;
    return `<div class="field">
        <label for="bf-${key}">${label}${req}</label>
        ${hintHtml}
        ${control}
        <span class="field-error" id="bf-${key}-error" hidden></span>
        <div data-suggest="${key}"></div>
      </div>`;
  }

  function topicSource() {
    const t = one(book.topics);
    if (book.topic_id && t) {
      const n = Number(t.checks_passed) || 0;
      const badge = n >= 5
        ? `<span class="badge badge-success">${ICON.check(12)}${n} of 5 market checks</span>`
        : `<span class="badge badge-warning">${ICON.warn(12)}${n} of 5 market checks</span>`;
      return `<span class="brief-source">From Topic Lab ${badge}
        <a class="link-btn" href="topic.html?id=${encodeURIComponent(t.id)}">Open topic</a></span>`;
    }
    return `<span class="brief-source"><span class="badge badge-warning">${ICON.warn(12)}Unvalidated topic</span>
      Not checked in Topic Lab. <a class="link-btn" href="topic-lab.html">Go to Topic Lab</a></span>`;
  }

  function render(root) {
    root.innerHTML = `
      <div class="brief">
        <div class="brief-intro">
          <p>Describe the book in plain words. Every later step reads from this brief.</p>
          <button type="button" class="btn btn-secondary" data-help>${ICON.sparkle}Help me fill this</button>
        </div>
        <div data-help-area></div>

        <section class="panel brief-card" aria-labelledby="bcBook">
          <h2 class="panel-title" id="bcBook">The book</h2>
          <div class="field">
            <label for="bf-topic_text">Topic <span class="field-optional">(required)</span></label>
            ${topicSource()}
            <input class="text-input" id="bf-topic_text" type="text" maxlength="${MAX.topic_text}" autocomplete="off" data-field="topic_text" aria-describedby="bf-topic_text-error" aria-required="true" />
            <span class="field-error" id="bf-topic_text-error" hidden></span>
          </div>
          <div class="field">
            <label for="bf-book_type">Book type</label>
            <select class="select select-block" id="bf-book_type" data-field="book_type">
              <option value="">Not set</option>
              ${BOOK_TYPES.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}
            </select>
          </div>
        </section>

        <section class="panel brief-card" aria-labelledby="bcReader">
          <h2 class="panel-title" id="bcReader">The reader</h2>
          ${textField({ key: 'target_reader', label: 'Target reader', required: true })}
          ${textField({ key: 'reader_problem', label: 'Reader problem', required: true, area: true })}
          ${textField({ key: 'promise_draft', label: 'Reader promise', hint: 'Draft only. You finalize it in 03 Positioning.', area: true })}
        </section>

        <section class="panel brief-card" aria-labelledby="bcSize">
          <h2 class="panel-title" id="bcSize">Size, trim, and voice</h2>
          <div class="field">
            <span class="field-label" id="bl-trim">Trim size</span>
            <span class="field-hint">You can change it later in 08 Format.</span>
            ${chips('trim_size', (TRIMS.includes(model.trim_size) ? TRIMS : [...TRIMS, model.trim_size]).map((t) => [t, trimText(t)]), 'bl-trim')}
          </div>
          <div class="field">
            <span class="field-label" id="bl-length">Length</span>
            <span class="field-hint" data-pages></span>
            ${chips('length_range', LENGTHS.map(([k, t]) => [k, t]), 'bl-length')}
          </div>
          <div class="field">
            <span class="field-label" id="bl-chapters">Chapters</span>
            ${chips('chapter_count', (CHAPTERS.includes(model.chapter_count) || !model.chapter_count ? CHAPTERS : [...CHAPTERS, model.chapter_count].sort((a, b) => a - b)).map((n) => [n, String(n)]), 'bl-chapters')}
          </div>
          <div class="field" data-pen-field></div>
        </section>

        <details class="panel brief-more"${moreOpen ? ' open' : ''}>
          <summary>More options <span class="brief-more-hint">· stance, stand-out idea, series, references</span></summary>
          <div class="brief-more-body">
            ${textField({ key: 'stance', label: 'Your stance', hint: 'What you believe about this topic that shapes the advice.', area: true })}
            ${textField({ key: 'standout', label: 'Stand-out idea', hint: 'The one thing that makes this book different.', area: true })}
            <div class="brief-series">
              ${textField({ key: 'series_name', label: 'Series name' })}
              <div class="field">
                <label for="bf-series_number">Book number</label>
                <input class="text-input" id="bf-series_number" type="number" min="1" max="999" step="1" inputmode="numeric" data-field="series_number" aria-describedby="bf-series_number-error" />
                <span class="field-error" id="bf-series_number-error" hidden></span>
              </div>
            </div>
            ${textField({ key: 'references', label: 'References', hint: 'Books, people, or methods you want to mention. Facts still come from 02 Research.', area: true, rows: 3 })}
          </div>
        </details>
      </div>`;

    els = {
      root,
      help: root.querySelector('[data-help]'),
      helpArea: root.querySelector('[data-help-area]'),
      pages: root.querySelector('[data-pages]'),
      pen: root.querySelector('[data-pen-field]'),
      more: root.querySelector('.brief-more')
    };
    root.querySelectorAll('[data-field]').forEach((el) => {
      const k = el.dataset.field;
      el.value = model[k] == null ? '' : model[k];
    });
    els.pages.textContent = pagesHint();
    shownErrors.forEach((k) => showRequired(k));
    renderPen();
    renderHelp();
    AI_FIELDS.forEach(([k]) => renderSuggestion(k));
    bind(root);
    ctx.setGate();
  }

  function renderPen() {
    if (!els) return;
    const box = els.pen;
    const current = book.pen_name_id ? one(book.pen_names) : null;
    if (pensState === 'loading') {
      box.innerHTML = `<label for="bf-pen">Pen name</label>
        <select class="select select-block" id="bf-pen" disabled><option>Loading pen names…</option></select>`;
      return;
    }
    if (pensState === 'error') {
      box.innerHTML = `<span class="field-label">Pen name</span>
        <div class="alert alert-error" role="alert">${ICON.warn(18)}<div><p class="alert-text">We couldn’t load your pen names.</p>
        <button type="button" class="link-btn" data-pen-retry>Try again</button></div></div>`;
      box.querySelector('[data-pen-retry]').addEventListener('click', loadPens);
      return;
    }
    const list = [...pens];
    if (model.pen_name_id && !list.some((p) => p.id === model.pen_name_id) && current) list.push(current);
    const sel = list.find((p) => p.id === model.pen_name_id) || null;
    const voice = sel ? voiceSummary(sel.voice) : '';
    const hint = sel
      ? (voice ? `Voice from ${esc(sel.name)}’s profile: ${esc(voice)}` : `${esc(sel.name)}’s profile has no voice yet.`)
      : 'The author name on the cover. Pick one or add a new one.';
    box.innerHTML = `
      <label for="bf-pen">Pen name</label>
      <span class="field-hint" id="bf-pen-hint">${hint}</span>
      <div class="brief-pen-row">
        <select class="select select-block" id="bf-pen" aria-describedby="bf-pen-hint">
          <option value="">No pen name</option>
          ${list.map((p) => `<option value="${esc(p.id)}"${p.id === model.pen_name_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
        <button type="button" class="link-btn" data-add-pen-here>${ICON.plus}Add pen name</button>
      </div>`;
    box.querySelector('#bf-pen').addEventListener('change', (e) => {
      model.pen_name_id = e.target.value;
      saver.edit('pen_name_id', 0);
      renderPenHint();
    });
    box.querySelector('[data-add-pen-here]').addEventListener('click', () => {
      kdpAddPen.open({
        onCreated(p) {
          pens.push({ id: p.id, name: p.name, voice: {} });
          pens.sort((a, b) => a.name.localeCompare(b.name));
          model.pen_name_id = p.id;
          saver.edit('pen_name_id', 0);
          renderPen();
          const s = box.querySelector('#bf-pen');
          if (s) setTimeout(() => s.focus(), 0);   // after the dialog gives focus back
        }
      });
    });
  }

  function renderPenHint() {
    // Re-render keeps the select in step with the hint; focus stays on the select.
    renderPen();
    const s = els.pen.querySelector('#bf-pen');
    if (s) s.focus();
  }

  /* ── Required fields ─────────────────────── */

  function showRequired(k) {
    const input = els && els.root.querySelector(`#bf-${k}`);
    const err = els && els.root.querySelector(`#bf-${k}-error`);
    if (!input || !err) return;
    const msg = (REQUIRED.find(([f]) => f === k) || [])[1];
    if (msg && shownErrors.has(k) && !filled(model[k])) {
      input.setAttribute('aria-invalid', 'true');
      err.innerHTML = ICON.x();
      err.append(msg);
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
    }
  }

  function setFieldError(k, msg) {
    const input = els.root.querySelector(`#bf-${k}`);
    const err = els.root.querySelector(`#bf-${k}-error`);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      err.innerHTML = ICON.x();
      err.append(msg);
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
    }
  }

  /* ── Events ──────────────────────────────── */

  const saveKey = (k) => (OPTION_KEYS.includes(k) ? 'options' : k);

  function bind(root) {
    root.querySelectorAll('input[data-field], textarea[data-field]').forEach((el) => {
      const k = el.dataset.field;
      el.addEventListener('input', () => {
        if (k === 'series_number') return onSeriesNumber(el);
        model[k] = el.value;
        if (filled(model[k])) { shownErrors.delete(k); showRequired(k); }
        saver.edit(saveKey(k), 800);
        ctx.setGate();
        if (k === 'topic_text') ctx.refresh();
      });
      // Leaving a field saves it now.
      el.addEventListener('blur', () => {
        if (REQUIRED.some(([f]) => f === k) && !filled(model[k])) { shownErrors.add(k); showRequired(k); }
        if (saver.isDirty(saveKey(k))) saver.flush();
      });
    });
    root.querySelector('#bf-book_type').addEventListener('change', (e) => {
      model.book_type = e.target.value;
      saver.edit('book_type', 0);
    });
    root.querySelectorAll('[data-chips]').forEach((group) => {
      const k = group.dataset.chips;
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        const raw = b.dataset.value;
        const value = k === 'chapter_count' ? Number(raw) : raw;
        // Trim size always has a value. Length and chapters can be cleared by pressing the chip again.
        if (String(model[k]) === String(value)) {
          if (k === 'trim_size') return;
          model[k] = k === 'chapter_count' ? null : '';
        } else model[k] = value;
        group.querySelectorAll('button[data-value]').forEach((x) => {
          x.setAttribute('aria-pressed', String(String(model[k]) === x.dataset.value));
        });
        if (k === 'trim_size' || k === 'length_range') els.pages.textContent = pagesHint();
        saver.edit(k, 0);
      });
    });
    els.more.addEventListener('toggle', () => { moreOpen = els.more.open; });
    els.help.addEventListener('click', runHelp);
    els.helpArea.addEventListener('click', (e) => {
      if (e.target.closest('[data-help-stop]')) stopHelp();
      else if (e.target.closest('[data-help-retry]')) runHelp();
    });
    // On .brief, not root: root is the shared step area and outlives this render.
    root.querySelector('.brief').addEventListener('click', (e) => {
      const a = e.target.closest('[data-accept]');
      if (a) { accept(a.dataset.accept); return; }
      const d = e.target.closest('[data-discard]');
      if (d) discard(d.dataset.discard);
    });
  }

  function onSeriesNumber(el) {
    const raw = el.value.trim();
    if (el.validity.badInput) { setFieldError('series_number', 'Enter a whole number.'); return; }
    const n = Number(raw);
    if (raw !== '' && (!Number.isInteger(n) || n < 1 || n > 999)) { setFieldError('series_number', 'Use a whole number from 1 to 999.'); return; }
    setFieldError('series_number', '');
    model.series_number = raw === '' ? '' : String(n);
    saver.edit('series_number', 800);
  }

  /* ── Help me fill (stage brief_help) ─────── */

  const nextMonthUtc = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** [kind, text, retry] for an error code. */
  function helpMessage(code) {
    switch (code) {
      case 'no_topic': return ['warning', 'Add a topic first. The AI drafts from it.', false];
      case 'not_enough_facts': return ['warning', 'The topic is too vague to draft from. Make it more specific, then try again.', false];
      case 'monthly_limit': return ['warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`, false];
      case 'rate_limited': return ['warning', 'Too many requests. Wait a minute, then try again.', true];
      case 'save_first': return ['error', 'Your last change is not saved yet. Use Retry next to “Couldn’t save”, then try again.', false];
      case 'network': return ['error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.', true];
      default: return ['error', 'The AI is not available right now. This try was not counted.', true];
    }
  }

  function renderHelp() {
    if (!els) return;
    const busy = help.state === 'working';
    els.help.disabled = busy;
    if (busy) els.help.setAttribute('aria-busy', 'true'); else els.help.removeAttribute('aria-busy');
    const area = els.helpArea;
    if (help.state === 'working') {
      area.innerHTML = `<div class="panel help-card" role="status">
          <div class="help-working"><span class="spinner" aria-hidden="true"></span>Drafting from your topic…</div>
          <div class="skel skel-line"></div><div class="skel skel-line skel-w60"></div><div class="skel skel-line skel-w40"></div>
          <p class="field-hint">${HELP_CAPTION}</p>
          <div><button type="button" class="btn btn-secondary" data-help-stop>Stop</button></div>
        </div>`;
    } else if (help.state === 'stopped') {
      area.innerHTML = `<p class="help-note" role="status">Stopped. If the AI had already finished, this call may still count.</p>`;
    } else if (help.state === 'error') {
      const [kind, text, retry] = helpMessage(help.code);
      area.innerHTML = '';
      const box = document.createElement('div');
      box.className = `alert alert-${kind}`;
      box.setAttribute('role', 'alert');
      box.innerHTML = ICON.warn(18);
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.className = 'alert-text';
      p.textContent = text;
      body.append(p);
      if (help.missing) {
        const m = document.createElement('p');
        m.className = 'alert-text';
        m.textContent = help.missing;
        body.append(m);
      }
      if (retry) body.insertAdjacentHTML('beforeend', '<button type="button" class="link-btn" data-help-retry>Try again</button>');
      box.append(body);
      area.append(box);
    } else if (help.state === 'done') {
      const names = AI_FIELDS.filter(([k]) => suggestions[k]).map(([, t]) => t);
      area.innerHTML = `<p class="help-note" role="status">${names.length
        ? `${ICON.sparkle}Suggestions are ready under ${esc(kdpList(names))}. Nothing changes until you accept.`
        : 'The AI suggests what you already have. Nothing to change.'}</p>`;
    } else area.innerHTML = '';
  }

  const kdpList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

  function renderSuggestion(k) {
    if (!els) return;
    const box = els.root.querySelector(`[data-suggest="${k}"]`);
    if (!box) return;
    const text = suggestions[k];
    if (!text) { box.innerHTML = ''; return; }
    const replaces = filled(model[k]) ? 'Accept replaces your text.' : 'Accept puts it in the field.';
    box.innerHTML = `<div class="bio-suggest brief-suggest" role="region" aria-labelledby="sug-${k}">
        <div class="bio-suggest-head">
          <span class="bio-suggest-label" id="sug-${k}">AI SUGGESTION</span>
        </div>
        <p class="brief-suggest-text" tabindex="-1" data-suggest-text></p>
        <p class="field-hint">${replaces}</p>
        <div class="bio-suggest-actions">
          <button type="button" class="btn btn-primary" data-accept="${k}">${ICON.check(16)}Accept</button>
          <button type="button" class="btn btn-secondary" data-discard="${k}">Discard</button>
        </div>
      </div>`;
    box.querySelector('[data-suggest-text]').textContent = text;
  }

  async function runHelp() {
    if (help.state === 'working') return;
    const token = ++helpToken;
    help = { state: 'working' };
    renderHelp();
    // The server reads the saved Brief, so save any edits first.
    if (saver.hasUnsaved()) await saver.flush();
    if (token !== helpToken) return;
    if (saver.state === 'error') { help = { state: 'error', code: 'save_first' }; renderHelp(); return; }
    if (!filled(saved.topic_text)) {
      help = { state: 'error', code: 'no_topic' };
      renderHelp();
      shownErrors.add('topic_text');
      showRequired('topic_text');
      return;
    }

    let res;
    try { res = await kdp.generate({ stage: 'brief_help', bookId: book.id }); } catch (err) { res = { error: { code: 'network' } }; }
    if (token !== helpToken) return;   // stopped: the reply is dropped
    const code = res.error && res.error.code;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { ctx.notFound(); return; }
    if (code) {
      help = { state: 'error', code, missing: code === 'not_enough_facts' ? res.error.missing : '' };
      renderHelp();
      return;
    }

    const s = (res.data && res.data.suggestions) || {};
    suggestions = {};
    AI_FIELDS.forEach(([k]) => {
      const t = str(s[k]).trim();
      if (t && t.length <= MAX[k] && t !== model[k].trim()) suggestions[k] = t;
    });
    help = { state: 'done' };
    if (!ctx.isActive(1)) return;      // shown when the Brief opens again
    renderHelp();
    AI_FIELDS.forEach(([k]) => renderSuggestion(k));
    const first = AI_FIELDS.find(([k]) => suggestions[k]);
    if (first) els.root.querySelector(`[data-suggest="${first[0]}"] [data-suggest-text]`).focus();
  }

  function stopHelp() {
    helpToken++;
    help = { state: 'stopped' };
    renderHelp();
    els.help.focus();
  }

  function afterChoice(k) {
    delete suggestions[k];
    renderSuggestion(k);
    // The note names the fields still waiting; with none left it goes away.
    if (!AI_FIELDS.some(([f]) => suggestions[f])) help = { state: 'idle' };
    renderHelp();
  }

  function accept(k) {
    if (!suggestions[k]) return;
    model[k] = suggestions[k];
    const input = els.root.querySelector(`#bf-${k}`);
    input.value = model[k];
    shownErrors.delete(k);
    showRequired(k);
    saver.edit(k, 0);
    ctx.setGate();
    afterChoice(k);
    input.focus();
  }

  function discard(k) {
    afterChoice(k);
    els.root.querySelector(`#bf-${k}`).focus();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[1] = {
    init,
    render,
    isDone,
    blockers,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved()
  };
})();
