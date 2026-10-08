/* ═══════════════════════════════════════════════════
   KDP Lab — Step 01 Brief (designs 14 and 16)
   /js/book-brief.js   (used by app/book.html, loaded before js/book.js)

   Registers kdpBookSteps[1]. js/book.js calls init() once after the book
   loads, render() each time step 01 is shown, and isDone()/blockers() for
   the sidebar mark and the Next button.

   Writes book_briefs (topic, reader, promise, type, trim, length, chapters,
   options) and books (pen_name_id, series). Limits match migration 0007.
   Length is a range chip OR a custom word target (target_words, 0014),
   never both: the two columns always save together. Chapters: a chip, or
   "Other" with a number from 3 to 30 (0001).
   Book type: a list key, or "other" with the author's own label
   (book_type_label, 1 to 40 characters, 0015). The two save together.
   "Help me fill" (generate stage brief_help) only makes suggestions for the
   reader fields, stance and stand-out idea: each one waits for Accept or
   Discard. Nothing is replaced silently. "Accept all" takes every suggestion
   without a "Verify" flag. Series and references stay manual; "Copy from 02
   Research" adds the citations of saved sources to References (no AI).
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const { one, voiceSummary } = kdpPens;

  const MAX = {
    topic_text: 200, target_reader: 300, reader_problem: 1000, promise_draft: 1000,
    stance: 500, standout: 500, references: 2000, series_name: 200, book_type_label: 40
  };
  const REQUIRED = [
    ['topic_text', 'Enter a topic to continue.', 'the topic'],
    ['target_reader', 'Describe who this book is for to continue.', 'the target reader'],
    ['reader_problem', 'Describe the reader’s problem to continue.', 'the reader problem']
  ];
  const AI_FIELDS = [
    ['target_reader', 'Target reader'],
    ['reader_problem', 'Reader problem'],
    ['promise_draft', 'Reader promise'],
    ['stance', 'Your stance'],
    ['standout', 'Stand-out idea']
  ];
  // Same keys as the book_type check (0015) and generate lib/common.ts BOOK_TYPES. "other" is last.
  const BOOK_TYPES = [
    ['beginner_guide', 'Beginner guide'], ['how_to', 'How-to guide'], ['workbook', 'Workbook'],
    ['self_help', 'Self-help'], ['cookbook', 'Cookbook'], ['health_wellness', 'Health and wellness guide'],
    ['business_money', 'Business and money guide'], ['parenting_family', 'Parenting and family guide'],
    ['hobby_craft', 'Hobby and craft guide'], ['reference', 'Reference guide'], ['memoir', 'Memoir or personal story'],
    ['other', 'Other']
  ];
  const TRIMS = ['5x8', '5.5x8.5', '6x9', '7x10', '8.5x11'];
  // [key, chip text]. The words of each range live in js/word-budget.js (kdpWords.RANGES).
  const LENGTHS = [
    ['5-8k', '5K to 8K words'], ['8-12k', '8K to 12K'],
    ['12-20k', '12K to 20K'], ['20-30k', '20K to 30K'],
    ['30k+', '30K+']
  ];
  const CHAPTERS = [5, 6, 7, 8, 9, 10, 12];
  // "Other" ranges: chapters as in 0001, the custom word target as in 0014.
  const OTHER = {
    chapter_count: { min: 3, max: 30, chip: 'Other', label: 'Number of chapters', hint: 'From 3 to 30.', error: 'Use a whole number from 3 to 30.' },
    target_words: { min: 2000, max: 150000, chip: 'Custom', label: 'Target words', hint: 'One number, for example 15000. From 2,000 to 150,000.', error: 'Use a whole number from 2,000 to 150,000.' }
  };
  const OPTION_KEYS = ['stance', 'standout', 'references'];
  const BOOK_FIELDS = ['pen_name_id', 'series_name', 'series_number'];
  const HELP_CAPTION = 'Suggestions appear under each field. Nothing changes until you accept.';

  let ctx = null, book = null, model = null, saved = null, saver = null, els = null;
  let pens = null, pensState = 'loading';     // 'loading' | 'ready' | 'error'
  let moreOpen = false;
  const otherOpen = { chapter_count: false, target_words: false };   // "Other" / "Custom" input shown
  const shownErrors = new Set();               // required fields that show their message
  let help = { state: 'idle' };                // idle | working | done | error | stopped
  let helpToken = 0;
  let suggestions = {};                        // field → suggested text
  let unsourced = {};                          // field → numbers without a source
  let refsCopy = { state: 'idle' };            // "Copy from 02 Research": idle | working | done | none | error

  /* ── Values ──────────────────────────────── */

  const str = (v) => (typeof v === 'string' ? v : '');
  const joinWords = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
  const filled = (v) => str(v).trim().length > 0;

  function fromBook(b) {
    const br = one(b.book_briefs) || {};
    const o = br.options && typeof br.options === 'object' && !Array.isArray(br.options) ? br.options : {};
    return {
      topic_text: str(br.topic_text), target_reader: str(br.target_reader),
      reader_problem: str(br.reader_problem), promise_draft: str(br.promise_draft),
      book_type: br.book_type || '', book_type_label: str(br.book_type_label), trim_size: br.trim_size || '6x9',
      length_range: br.length_range || '', chapter_count: br.chapter_count || null,
      target_words: br.target_words == null ? '' : String(br.target_words),
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
      case 'book_type_label': return model.book_type === 'other' ? text(field) : null;
      case 'trim_size': case 'chapter_count': return model[field];
      case 'target_words': return model.target_words === '' ? null : Number(model.target_words);
      case 'series_number': return model.series_number === '' ? null : Number(model.series_number);
      default: return text(field);
    }
  }

  /**
   * Two writes, each tried on its own: the Brief row and the book row. When
   * one fails, res.saved holds the part that did save, so onError keeps it.
   */
  async function save(fields) {
    const brief = {}, bookFields = {};
    Object.keys(fields).forEach((k) => { (BOOK_FIELDS.includes(k) ? bookFields : brief)[k] = fields[k]; });
    const write = async (part, fn) => {
      if (!Object.keys(part).length) return null;
      try { return await fn(); } catch (err) { return { error: err }; }
    };
    const briefRes = await write(brief, () => kdp.updateBrief(book.id, brief));
    const bookRes = await write(bookFields, () => kdp.updateBook(book.id, bookFields));
    const ok = (r) => r && !r.error;
    const failed = [briefRes, bookRes].find((r) => r && r.error);
    if (!failed) return { data: { fields, brief: briefRes && briefRes.data, book: bookRes && bookRes.data }, error: null };
    const savedFields = { ...(ok(briefRes) ? brief : {}), ...(ok(bookRes) ? bookFields : {}) };
    return {
      error: failed.error,
      saved: { fields: savedFields, brief: ok(briefRes) ? briefRes.data : null, book: ok(bookRes) ? bookRes.data : null }
    };
  }

  /** After a good save: the saved copy, and the book object the sidebar reads. */
  function onSaved(res) {
    const { fields } = res.data;
    const br = one(book.book_briefs) || {};
    Object.keys(fields).forEach((k) => {
      if (k === 'options') OPTION_KEYS.forEach((o) => { saved[o] = str(fields.options[o]); });
      else saved[k] = fields[k] == null ? (k === 'chapter_count' ? null : '') : (['series_number', 'target_words'].includes(k) ? String(fields[k]) : fields[k]);
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
    if (e.notFound) { saver.reset('error'); ctx.notFound(); return true; }
    // One write of the two saved: keep that part, and do not send it again
    // unless it was edited while the save ran.
    const done = res.saved ? Object.keys(res.saved.fields) : [];
    if (done.length) {
      onSaved({ data: res.saved });
      done.forEach((f) => { if (JSON.stringify(read(f)) === JSON.stringify(res.saved.fields[f])) saver.drop(f); });
    }
    const failed = sent.filter((f) => !done.includes(f));
    // 23514 = a check (0007), 42501 = RLS (a pen name that is not the user's), 23503 = gone.
    if (['23514', '42501', '23503'].includes(e.code)) {
      // Error state, edits dropped (the failed fields are put back to the saved
      // values), so no Retry. Drop the edits BEFORE re-rendering: removing a
      // focused field fires focusout, which would otherwise send the refused save again.
      saver.reset('error', failed.includes('pen_name_id')
        ? 'That pen name is not available, so it was not saved.'
        : 'This change breaks a Brief rule, so it was not saved.');
      failed.forEach((f) => {
        if (f === 'options') OPTION_KEYS.forEach((o) => { model[o] = saved[o]; });
        else model[f] = saved[f];
      });
      openOthersFromModel();
      if (ctx.isActive(1)) render(ctx.content());
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

  /** What step 01 still needs: "Fill the reader problem", or ''. */
  function missing() {
    if (!model) return '';
    const left = REQUIRED.filter(([k]) => !filled(model[k])).map(([, , words]) => words);
    if (left.length > 2) return `Fill ${left.length} required fields`;
    return left.length ? `Fill ${joinWords(left)}` : '';
  }

  /** "Other" is open for a chapter count that is not a chip, "Custom" for a saved word target. */
  function openOthersFromModel() {
    otherOpen.chapter_count = model.chapter_count != null && !CHAPTERS.includes(model.chapter_count);
    otherOpen.target_words = model.target_words !== '';
  }

  function init(b, c) {
    ctx = c;
    book = b;
    model = fromBook(b);
    saved = fromBook(b);
    openOthersFromModel();
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

  /** A whole number in the "Other" range, or null. */
  function otherValue(k, raw) {
    const t = String(raw).trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= OTHER[k].min && n <= OTHER[k].max ? n : null;
  }

  function pagesHint() {
    // The same estimate as the step 05 word budget (js/word-budget.js).
    const pages = (words) => kdpWords.pages(words, model.trim_size);
    if (otherOpen.target_words) {
      // While typing, the estimate follows a valid number in the field.
      const input = els && els.root.querySelector('#bf-target_words');
      const n = otherValue('target_words', input ? input.value : model.target_words);
      return n ? `About ${pages(n)} pages at ${trimText(model.trim_size)}` : 'Enter a word target to see an estimate of pages.';
    }
    const len = kdpWords.RANGES[model.length_range];
    if (!len) return 'Pick a range to see an estimate of pages.';
    const range = len[1] ? `${pages(len[0])} to ${pages(len[1])}` : `${pages(len[0])}+`;
    return `About ${range} pages at ${trimText(model.trim_size)}`;
  }

  /** Chips; with other = 'chapter_count' or 'target_words', an "Other"/"Custom" chip at the end. */
  function chips(field, list, labelId, other) {
    const open = other ? otherOpen[other] : false;
    return `<div class="tone-chips" role="group" aria-labelledby="${labelId}" data-chips="${field}">
      ${list.map(([value, text]) => `<button type="button" class="tone-chip" data-value="${esc(value)}" aria-pressed="${!open && String(model[field]) === String(value)}">${esc(text)}</button>`).join('')}
      ${other ? `<button type="button" class="tone-chip" data-other="${other}" aria-pressed="${open}" aria-expanded="${open}" aria-controls="bo-${other}">${OTHER[other].chip}</button>` : ''}
    </div>
    ${other ? `<div id="bo-${other}" data-other-box="${other}"></div>` : ''}`;
  }

  function syncChips(group, k, other) {
    const open = other ? otherOpen[other] : false;
    group.querySelectorAll('button[data-value]').forEach((x) => {
      x.setAttribute('aria-pressed', String(!open && String(model[k]) === x.dataset.value));
    });
    const o = group.querySelector('[data-other]');
    if (o) { o.setAttribute('aria-pressed', String(open)); o.setAttribute('aria-expanded', String(open)); }
  }

  /** The number field under "Other" / "Custom" (or nothing when closed). */
  function renderOther(k) {
    const box = els && els.root.querySelector(`[data-other-box="${k}"]`);
    if (!box) return;
    if (!otherOpen[k]) { box.innerHTML = ''; return; }
    const o = OTHER[k];
    box.innerHTML = `<div class="field">
        <label for="bf-${k}">${o.label}</label>
        <span class="field-hint" id="bf-${k}-hint">${o.hint}</span>
        <input class="text-input brief-num" id="bf-${k}" type="number" min="${o.min}" max="${o.max}" step="1" inputmode="numeric" aria-describedby="bf-${k}-hint bf-${k}-error" />
        <span class="field-error" id="bf-${k}-error" hidden></span>
      </div>`;
    const input = box.querySelector('input');
    input.value = model[k] == null ? '' : String(model[k]);
    input.addEventListener('input', () => onOtherInput(k, input, false));
    input.addEventListener('blur', () => {
      onOtherInput(k, input, true);
      if (saver.isDirty(k)) saver.flush();
    });
  }

  /**
   * Typing in an "Other" field: a valid number (or empty) saves after the
   * usual delay; anything else is not saved. The error shows when the field
   * is left (so "1" on the way to "12" is not an error).
   */
  function onOtherInput(k, input, leaving) {
    const raw = input.value.trim();
    const n = otherValue(k, raw);
    const bad = input.validity.badInput || (raw !== '' && n === null);
    if (bad) {
      if (leaving) setFieldError(k, OTHER[k].error);
      if (k === 'target_words') els.pages.textContent = pagesHint();
      return;
    }
    setFieldError(k, '');
    if (k === 'chapter_count') {
      if (model.chapter_count === n) return;
      model.chapter_count = n;
      saver.edit('chapter_count', 800);
    } else {
      const next = n === null ? '' : String(n);
      els.pages.textContent = pagesHint();
      if (model.target_words === next) return;
      model.target_words = next;
      model.length_range = '';
      saver.edit('target_words', 800);
      saver.edit('length_range', 800);   // always together (0014: one value at a time)
    }
  }

  /** Pressing "Other" / "Custom": open it, or close it and clear the value. */
  function toggleOther(k, group) {
    if (otherOpen[k]) {
      otherOpen[k] = false;
      if (k === 'chapter_count') {
        if (model.chapter_count != null) { model.chapter_count = null; saver.edit('chapter_count', 0); }
      } else if (model.target_words !== '') {
        model.target_words = '';
        saver.edit('target_words', 0);
        saver.edit('length_range', 0);
      }
    } else {
      otherOpen[k] = true;
      // Custom replaces the range now (one value at a time). Other keeps the count it shows.
      if (k === 'target_words' && model.length_range) {
        model.length_range = '';
        saver.edit('length_range', 0);
        saver.edit('target_words', 0);
      }
    }
    syncChips(group, group.dataset.chips, k);
    renderOther(k);
    if (k === 'target_words') els.pages.textContent = pagesHint();
    const input = otherOpen[k] && els.root.querySelector(`#bf-${k}`);
    if (input) input.focus();
  }

  /** The "Your book type" field under the select, shown only for "Other". */
  function renderTypeOther() {
    const box = els && els.typeOther;
    if (!box) return;
    if (model.book_type !== 'other') { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="field">
        <label for="bf-book_type_label">Your book type</label>
        <span class="field-hint" id="bf-book_type_label-hint">A short name, for example Gardening guide. Up to ${MAX.book_type_label} characters.</span>
        <input class="text-input" id="bf-book_type_label" type="text" maxlength="${MAX.book_type_label}" autocomplete="off" aria-describedby="bf-book_type_label-hint" />
      </div>`;
    const input = box.querySelector('input');
    input.value = model.book_type_label;
    input.addEventListener('input', () => {
      model.book_type_label = input.value;
      saver.edit('book_type', 800);
      saver.edit('book_type_label', 800);   // always together (0015)
    });
    input.addEventListener('blur', () => {
      if (saver.isDirty('book_type_label')) saver.flush();
    });
  }

  /* ── Copy from 02 Research (References, no AI) ── */

  function renderRefsCopy() {
    const box = els && els.refsCopy;
    if (!box) return;
    const busy = refsCopy.state === 'working';
    const btn = `<div><button type="button" class="btn btn-secondary" data-refs-copy-btn${busy ? ' disabled aria-busy="true"' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span>Copying…' : 'Copy from 02 Research'}</button></div>`;
    let status = '';
    if (refsCopy.state === 'done') status = `<p class="field-hint" role="status">${esc(refsCopy.text)}</p>`;
    else if (refsCopy.state === 'none') {
      status = `<p class="field-hint" role="status">No sources in 02 Research yet. Add a source with where it comes from.
        <button type="button" class="link-btn" data-refs-open>Open 02 Research</button></p>`;
    } else if (refsCopy.state === 'error') {
      status = `<div class="alert alert-error" role="alert">${ICON.warn(18)}<div><p class="alert-text">We couldn’t load your sources.</p>
        <button type="button" class="link-btn" data-refs-retry>Try again</button></div></div>`;
    }
    box.innerHTML = btn + status;
  }

  const citations = (n) => `${n} citation${n === 1 ? '' : 's'}`;

  /**
   * Add the citations of the saved sources to References, one per line at the
   * end. A citation already on a line of the field (any case) is skipped, and
   * the author's text is never changed. Only what fits in the limit is added.
   */
  async function copyRefs() {
    if (refsCopy.state === 'working') return;
    refsCopy = { state: 'working' };
    renderRefsCopy();
    let res;
    try { res = await kdp.listSourceCitations(book.id); } catch (err) { res = { error: err }; }
    if (res.error) {
      refsCopy = { state: 'error' };
      renderRefsCopy();
      return;
    }
    const unique = [];
    const seen = new Set();
    (res.data || []).forEach((c) => {
      const t = c.replace(/\s+/g, ' ').trim();
      if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); unique.push(t); }
    });
    if (!unique.length) {
      refsCopy = { state: 'none' };
      renderRefsCopy();
      return;
    }
    const have = new Set(model.references.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
    let text = model.references.replace(/\s+$/, '');
    let added = 0, noRoom = 0;
    unique.forEach((t) => {
      if (have.has(t.toLowerCase())) return;
      const next = text.trim() ? `${text}\n${t}` : t;
      if (next.trim().length > MAX.references) { noRoom++; return; }
      text = next;
      added++;
    });
    let msg;
    if (added && noRoom) msg = `Added ${citations(added)}. ${noRoom} did not fit in ${MAX.references.toLocaleString('en-US')} characters.`;
    else if (added) msg = `Added ${citations(added)} from 02 Research.`;
    else if (noRoom) msg = `No room: ${citations(noRoom)} did not fit in ${MAX.references.toLocaleString('en-US')} characters.`;
    else msg = unique.length === 1 ? 'The citation is already in the field.' : `All ${unique.length} citations are already in the field.`;
    if (added) {
      model.references = text;
      const ta = els.root.querySelector('#bf-references');
      if (ta) ta.value = text;
      saver.edit('options', 0);
    }
    refsCopy = { state: 'done', text: msg };
    if (!ctx.isActive(1)) return;
    renderRefsCopy();
    const b = els.refsCopy.querySelector('[data-refs-copy-btn]');
    if (b) b.focus();
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
          <div data-type-other></div>
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
            ${chips('length_range', LENGTHS.map(([k, t]) => [k, t]), 'bl-length', 'target_words')}
          </div>
          <div class="field">
            <span class="field-label" id="bl-chapters">Chapters</span>
            ${chips('chapter_count', CHAPTERS.map((n) => [n, String(n)]), 'bl-chapters', 'chapter_count')}
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
            <div class="help-card" data-refs-copy></div>
          </div>
        </details>
      </div>`;

    els = {
      root,
      help: root.querySelector('[data-help]'),
      helpArea: root.querySelector('[data-help-area]'),
      pages: root.querySelector('[data-pages]'),
      pen: root.querySelector('[data-pen-field]'),
      more: root.querySelector('.brief-more'),
      typeOther: root.querySelector('[data-type-other]'),
      refsCopy: root.querySelector('[data-refs-copy]')
    };
    root.querySelectorAll('[data-field]').forEach((el) => {
      const k = el.dataset.field;
      el.value = model[k] == null ? '' : model[k];
    });
    renderOther('chapter_count');
    renderOther('target_words');
    renderTypeOther();
    renderRefsCopy();
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
      // A list type clears the "Other" label (0015: a label only with "other").
      if (model.book_type !== 'other') model.book_type_label = '';
      saver.edit('book_type', 0);
      saver.edit('book_type_label', 0);   // always together
      renderTypeOther();
      const input = model.book_type === 'other' && els.typeOther.querySelector('input');
      if (input) input.focus();
    });
    root.querySelectorAll('[data-chips]').forEach((group) => {
      const k = group.dataset.chips;
      const other = k === 'chapter_count' ? 'chapter_count' : (k === 'length_range' ? 'target_words' : null);
      group.addEventListener('click', (e) => {
        const o = e.target.closest('button[data-other]');
        if (o) { toggleOther(o.dataset.other, group); return; }
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        const raw = b.dataset.value;
        const value = k === 'chapter_count' ? Number(raw) : raw;
        if (other && otherOpen[other]) {
          // A chip closes "Other" / "Custom" and takes its place.
          otherOpen[other] = false;
          renderOther(other);
          model[k] = value;
        } else if (String(model[k]) === String(value)) {
          // Trim size always has a value. Length and chapters can be cleared by pressing the chip again.
          if (k === 'trim_size') return;
          model[k] = k === 'chapter_count' ? null : '';
        } else model[k] = value;
        syncChips(group, k, other);
        saver.edit(k, 0);
        if (k === 'length_range') {
          // A range replaces a custom target (one value at a time).
          model.target_words = '';
          saver.edit('target_words', 0);
        }
        if (k === 'trim_size' || k === 'length_range') els.pages.textContent = pagesHint();
      });
    });
    els.more.addEventListener('toggle', () => { moreOpen = els.more.open; });
    els.help.addEventListener('click', runHelp);
    els.helpArea.addEventListener('click', (e) => {
      if (e.target.closest('[data-accept-all]')) acceptAll();
      else if (e.target.closest('[data-help-stop]')) stopHelp();
      else if (e.target.closest('[data-help-retry]')) runHelp();
    });
    els.refsCopy.addEventListener('click', (e) => {
      if (e.target.closest('[data-refs-copy-btn], [data-refs-retry]')) copyRefs();
      else if (e.target.closest('[data-refs-open]')) ctx.go(2);
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

  /** [kind, text, retry] for an error code. */
  function helpMessage(code) {
    switch (code) {
      case 'no_topic': return ['warning', 'Add a topic first. The AI drafts from it.', false];
      case 'not_enough_facts': return ['warning', 'The topic is too vague to draft from. Make it more specific, then try again.', false];
      default: return kdpUi.aiMessage(code);
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
      const waiting = AI_FIELDS.filter(([k]) => suggestions[k]);
      const names = waiting.map(([, t]) => t);
      if (help.accepted && waiting.length) {
        area.innerHTML = `<p class="help-note" role="status">${ICON.warn(14)}Accepted ${help.accepted} suggestion${help.accepted === 1 ? '' : 's'}. ${waiting.length} with a Verify flag ${waiting.length === 1 ? 'is' : 'are'} still waiting below.</p>`;
        return;
      }
      const canAll = waiting.length >= 2 && waiting.some(([k]) => !(unsourced[k] || []).length);
      const note = `<p class="help-note" role="status">${names.length
        ? `${ICON.sparkle}Suggestions are ready under ${esc(kdpList(names))}. Nothing changes until you accept.`
        : 'The AI suggests what you already have. Nothing to change.'}</p>`;
      area.innerHTML = canAll
        ? `<div class="help-card">${note}<div class="bio-suggest-actions"><button type="button" class="btn btn-secondary" data-accept-all>Accept all</button></div></div>`
        : note;
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
    const nums = unsourced[k] || [];
    box.innerHTML = `<div class="bio-suggest brief-suggest" role="region" aria-labelledby="sug-${k}">
        <div class="bio-suggest-head">
          <span class="bio-suggest-label" id="sug-${k}">AI SUGGESTION</span>
        </div>
        <p class="brief-suggest-text" tabindex="-1" data-suggest-text></p>
        ${nums.length ? `<p class="posn-verify">${ICON.warn(14)}<span>Verify: no source for ${esc(joinWords(nums))}. Your Brief and the page-1 books do not have ${nums.length === 1 ? 'this number' : 'these numbers'}.</span></p>` : ''}
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
    // Only a failed save that left edits behind blocks; a refused save was already put back.
    if (saver.state === 'error' && saver.hasUnsaved()) { help = { state: 'error', code: 'save_first' }; renderHelp(); return; }
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
    const u = (res.data && res.data.unsourced) || {};
    suggestions = {};
    unsourced = {};
    AI_FIELDS.forEach(([k]) => {
      const t = str(s[k]).trim();
      if (t && t.length <= MAX[k] && t !== model[k].trim()) suggestions[k] = t;
      if (suggestions[k] && Array.isArray(u[k]) && u[k].length) unsourced[k] = u[k].map(String);
    });
    help = { state: 'done' };
    // Stance and stand-out live in More options: open it so their suggestions are seen.
    if (suggestions.stance || suggestions.standout) moreOpen = true;
    if (!ctx.isActive(1)) return;      // shown when the Brief opens again
    if (moreOpen) els.more.open = true;
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
    if (help.accepted) help = { ...help, accepted: 0 };   // back to the usual note
    delete suggestions[k];
    delete unsourced[k];
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
    saver.edit(saveKey(k), 0);
    ctx.setGate();
    afterChoice(k);
    input.focus();
  }

  function discard(k) {
    afterChoice(k);
    els.root.querySelector(`#bf-${k}`).focus();
  }

  /**
   * Accept every waiting suggestion without a "Verify: no source" flag, each
   * the same edit as its own Accept (the autosave sends them together). A
   * flagged one keeps waiting, so its flag is seen before it is taken.
   */
  function acceptAll() {
    if (help.state !== 'done') return;
    const ready = AI_FIELDS.map(([k]) => k).filter((k) => suggestions[k] && !(unsourced[k] || []).length);
    if (!ready.length) return;
    ready.forEach((k) => {
      model[k] = suggestions[k];
      els.root.querySelector(`#bf-${k}`).value = model[k];
      shownErrors.delete(k);
      showRequired(k);
      saver.edit(saveKey(k), 0);
      delete suggestions[k];
      delete unsourced[k];
      renderSuggestion(k);
    });
    ctx.setGate();
    help = AI_FIELDS.some(([k]) => suggestions[k]) ? { state: 'done', accepted: ready.length } : { state: 'idle' };
    renderHelp();
    els.root.querySelector(`#bf-${ready[0]}`).focus();
  }

  window.kdpBookSteps = window.kdpBookSteps || {};
  window.kdpBookSteps[1] = {
    init,
    render,
    isDone,
    missing,
    blockers,
    flush: () => (saver ? saver.flush() : Promise.resolve()),
    retrySave: () => saver && saver.retry(),
    hasUnsaved: () => !!saver && saver.hasUnsaved(),
    saveState: () => (saver ? saver.state : 'idle')
  };
})();
