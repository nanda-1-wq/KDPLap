/* ═══════════════════════════════════════════════════
   KDP Lab — Topic detail (designs 09 and 13)
   /js/topic.js

   Load AFTER supabase.js, shell.js, new-book.js, topics.js, add-topic.js,
   topic-import.js.
   URL: app/topic.html?id=<topic id>

   Every edit autosaves. Status rules (CLAUDE.md §6, migration 0004):
   - 'validated' needs 5 of 5 market checks. The database enforces it.
   - An edit that makes a check fail moves a validated topic to 'researching'.
   - The first score moves an idea to 'researching'.
   - 'book_started' is set by create_book and reset by a trigger only.
   Each count shows where it came from (migration 0006): "Imported · date"
   or "Manual · edited date". The database sets both; editing an imported
   count makes it Manual. "Import from Amazon page" is js/topic-import.js.
═══════════════════════════════════════════════════ */

(async function () {
  const { ICON, esc } = kdpUi;
  const {
    STATUS, statusBadge, checks, passedCount, isScored, joinList, dayText, newestBookId,
    RULE_TEXT, countsAs, sourceText, MAX_NAME
  } = kdpTopics;

  const view = document.getElementById('view');
  const topicId = new URLSearchParams(location.search).get('id');

  const MAX_COUNT = 999;
  const MAX_SEARCHES = 100000000;
  const SCORE_FIELDS = ['winning_count', 'dead_count', 'authority_count', 'results_match', 'is_specific'];
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
  // Statuses a person can pick. 'book_started' is never picked by hand.
  const PICKABLE = ['idea', 'researching', 'validated', 'rejected', 'archived'];

  const COUNT_ROWS = [
    { key: 'winning', field: 'winning_count', hint: RULE_TEXT.winning },
    { key: 'dead', field: 'dead_count', hint: RULE_TEXT.dead },
    { key: 'authority', field: 'authority_count', hint: RULE_TEXT.authority }
  ];
  const TOGGLE_ROWS = [
    { key: 'match', field: 'results_match', hint: 'Page 1 shows books about this exact topic.' },
    { key: 'specific', field: 'is_specific', hint: 'The topic is specific, not broad.' }
  ];

  let model = null;       // the topic as shown, including unsaved edits
  let els = null;
  let saver = null;        // js/autosave.js, created once below
  let demoted = false;

  const bookHref = (id) => `book.html?id=${encodeURIComponent(id)}`;
  const label = (key) => checks({}).find((c) => c.key === key).label;

  /* ── Page states ─────────────────────────── */

  function renderLoading() {
    view.innerHTML = `<p class="sr-only" role="status">Loading the topic…</p>
      <div class="detail-head" aria-hidden="true"><div class="skel skel-line skel-w30"></div><div class="skel skel-title"></div></div>
      <div class="detail-grid" aria-hidden="true">
        <div class="panel skel-stack"><div class="skel skel-title"></div><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
        <div class="panel skel-stack"><div class="skel skel-line skel-w30"></div><div class="skel skel-title"></div><div class="skel skel-bar"></div></div>
      </div>`;
  }

  function renderProblem(title, text, retry) {
    view.innerHTML = `
      <div class="center-state">
        <div class="state-box" role="alert">
          <div class="state-icon danger" aria-hidden="true">${ICON.warn(26)}</div>
          <h2>${title}</h2>
          <p>${text}</p>
          <div class="state-actions">
            ${retry ? '<button type="button" class="btn btn-primary" id="retryBtn">Retry</button>' : ''}
            <a class="btn btn-secondary" href="topic-lab.html">Back to Topic Lab</a>
          </div>
        </div>
      </div>`;
    if (retry) document.getElementById('retryBtn').addEventListener('click', load);
  }

  /* ── Main render (once per load) ─────────── */

  function countRow(r, last) {
    const id = `f-${r.key}`;
    return `
      <div class="check-row${last ? ' last' : ''}" data-row="${r.key}">
        <div class="check-text">
          <label class="check-label" for="${id}">${label(r.key)}</label>
          <span class="check-hint" id="${id}-hint">${r.hint}</span>
          <span class="check-source" id="${id}-source" data-source></span>
          <span class="check-note" id="${id}-note" data-note></span>
          <span class="field-error" id="${id}-error" hidden></span>
        </div>
        <input class="text-input count-input" id="${id}" type="number" inputmode="numeric" min="0" max="${MAX_COUNT}" step="1"
          data-count="${r.field}" aria-describedby="${id}-hint ${id}-source ${id}-note ${id}-error" />
        <span class="check-result" data-badge></span>
      </div>`;
  }

  function toggleRow(r) {
    const id = `f-${r.key}`;
    return `
      <div class="check-row" data-row="${r.key}">
        <div class="check-text">
          <span class="check-label" id="${id}-label">${label(r.key)}</span>
          <span class="check-hint" id="${id}-hint">${r.hint}</span>
        </div>
        <div class="yesno" role="group" aria-labelledby="${id}-label" aria-describedby="${id}-hint" data-toggle="${r.field}">
          <button type="button" data-value="true" aria-pressed="false">Yes</button><button type="button" data-value="false" aria-pressed="false">No</button>
        </div>
        <span class="check-result" data-badge></span>
      </div>`;
  }

  function slider(key, text, hint) {
    const id = `f-${key}`;
    return `
      <div class="slider-field">
        <div class="slider-top"><label for="${id}">${text}</label><strong data-out="${key}"></strong></div>
        <input class="range" id="${id}" type="range" min="1" max="10" step="1" data-range="${key}" aria-describedby="${id}-hint" />
        <span class="check-hint" id="${id}-hint">${hint}</span>
      </div>`;
  }

  function renderPage() {
    view.innerHTML = `
      <div class="detail-head">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="topic-lab.html">Topic Lab</a> <span aria-hidden="true">/</span> <span aria-current="page" data-crumb></span></nav>
        <div class="detail-title-row">
          <h1 data-name tabindex="-1"></h1>
          <div class="detail-controls">
            <span class="save-state" role="status" data-save></span>
            <div class="status-control" data-status></div>
            <div class="menu-anchor">
              <button type="button" class="icon-btn menu-btn" data-menu-btn aria-haspopup="menu" aria-expanded="false">${ICON.more}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="main-col">
        <section class="panel" aria-labelledby="p1">
          <div class="panel-head">
            <div>
              <h2 id="p1" class="panel-title">Amazon page-1 data</h2>
              <p class="panel-hint" data-search-hint></p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-import>Import from Amazon page</button>
          </div>
          ${COUNT_ROWS.map((r) => countRow(r)).join('')}
          ${TOGGLE_ROWS.map(toggleRow).join('')}
          <div class="check-row last">
            <div class="check-text">
              <label class="check-label" for="f-searches">Monthly searches <span class="optional">(optional)</span></label>
              <span class="check-hint" id="f-searches-hint">From a keyword tool. 3,000+ is a bonus signal.</span>
              <span class="field-error" id="f-searches-error" hidden></span>
            </div>
            <input class="text-input count-input" id="f-searches" type="number" inputmode="numeric" min="0" max="${MAX_SEARCHES}" step="1"
              placeholder="—" data-count="monthly_searches" aria-describedby="f-searches-hint f-searches-error" />
            <span></span>
          </div>
        </section>
        <section class="panel page-books" aria-labelledby="pb" data-page-books hidden></section>
        </div>

        <div class="side-col">
          <section class="panel result-card" aria-labelledby="res" data-result></section>
          <section class="panel judgment" aria-labelledby="fit">
            <h2 id="fit" class="panel-title-sm">Your judgment</h2>
            ${slider('excitement', 'Excitement', 'Breaks ties between topics that pass.')}
            ${slider('author_fit', 'Author fit', 'Can you write this well?')}
            <div class="field">
              <label for="f-notes">Notes</label>
              <textarea class="text-area" id="f-notes" rows="3" maxlength="5000" data-notes></textarea>
            </div>
          </section>
        </div>
      </div>`;

    els = {
      name: view.querySelector('[data-name]'),
      crumb: view.querySelector('[data-crumb]'),
      save: view.querySelector('[data-save]'),
      status: view.querySelector('[data-status]'),
      menuBtn: view.querySelector('[data-menu-btn]'),
      searchHint: view.querySelector('[data-search-hint]'),
      result: view.querySelector('[data-result]'),
      notes: view.querySelector('[data-notes]'),
      pageBooks: view.querySelector('[data-page-books]')
    };

    // Fill inputs from the model. After this, inputs own their values.
    view.querySelectorAll('[data-count]').forEach((input) => {
      const v = model[input.dataset.count];
      input.value = v === null || v === undefined ? '' : String(v);
    });
    view.querySelectorAll('[data-range]').forEach((input) => {
      const v = model[input.dataset.range];
      input.value = v ? String(v) : '5';
    });
    els.notes.value = model.notes || '';

    renderName();
    renderToggles();
    renderSliders();
    renderChecks();
    renderStatus();
    renderResult();
    renderPageBooks();
    renderSave();
    bindEvents();
  }

  /* ── Parts that change ───────────────────── */

  function renderName() {
    els.name.textContent = model.name;
    els.crumb.textContent = model.name;
    document.title = `${model.name} · Topic Lab · KDP Lab`;
    els.searchHint.textContent = `Search "${model.name.toLowerCase()}" in a private window. Count page 1 only.`;
    els.menuBtn.setAttribute('aria-label', `More actions for ${model.name}`);
  }

  function renderToggles() {
    view.querySelectorAll('[data-toggle]').forEach((group) => {
      const v = model[group.dataset.toggle];
      group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(v === (b.dataset.value === 'true'))));
    });
  }

  function renderSliders() {
    view.querySelectorAll('[data-range]').forEach((input) => {
      const key = input.dataset.range;
      const v = model[key];
      const out = view.querySelector(`[data-out="${key}"]`);
      out.textContent = v ? `${v} / 10` : '— / 10';
      input.classList.toggle('is-unset', !v);
      // Fill up to the knob: 1 is the start of the track, 10 the end.
      input.style.setProperty('--fill', v ? `${((v - 1) / 9) * 100}%` : '0%');
      input.setAttribute('aria-valuetext', v ? `${v} out of 10` : 'Not set');
    });
  }

  function checkBadge(c) {
    if (!c.set) return '<span class="check-badge todo">Not set</span>';
    return c.pass
      ? `<span class="check-badge pass">${ICON.check()}Pass</span>`
      : `<span class="check-badge fail">${ICON.x()}Fail</span>`;
  }

  function countNote(c) {
    if (!c.set || c.pass) return '';
    const n = model[c.field];
    if (c.key === 'winning') return `${n} found, ${3 - n} short`;
    if (c.key === 'dead') return `${n} found, ${n - 8} too many`;
    return `${n} found, ${n - 4} too many`;
  }

  function renderChecks() {
    checks(model).forEach((c) => {
      const row = view.querySelector(`[data-row="${c.key}"]`);
      row.querySelector('[data-badge]').innerHTML = checkBadge(c);
      const note = row.querySelector('[data-note]');
      if (note) note.textContent = countNote(c);
      const source = row.querySelector('[data-source]');
      if (source) source.textContent = sourceText(model, c.key);
      const input = row.querySelector('[data-count]');
      // Red border for a failing count, as design 09 shows. A typing error uses aria-invalid instead.
      if (input) input.classList.toggle('is-failing', c.set && !c.pass);
    });
  }

  function renderStatus() {
    if (model.status === 'book_started') {
      els.status.innerHTML = `<span class="status-label">Status</span>${statusBadge('book_started')}`;
      return;
    }
    const five = passedCount(model) === 5;
    const options = PICKABLE.map((s) => {
      const off = s === 'validated' && !five;
      return `<option value="${s}"${s === model.status ? ' selected' : ''}${off ? ' disabled' : ''}>${STATUS[s]}${off ? ' (needs 5 of 5)' : ''}</option>`;
    }).join('');
    const current = els.status.querySelector('select');
    const hadFocus = current && document.activeElement === current;
    els.status.innerHTML = `<label class="status-label" for="statusSel">Status</label><select class="select" id="statusSel" data-status-select>${options}</select>`;
    if (hadFocus) els.status.querySelector('select').focus();
  }

  function failText(c) {
    const n = model[c.field];
    switch (c.key) {
      case 'winning': return n === 0 ? 'no winning books' : `only ${n} winning book${n === 1 ? '' : 's'}`;
      case 'dead': return `${n} low-traction books`;
      case 'authority': return `${n} authority books`;
      case 'match': return 'page 1 does not match the topic';
      default: return 'the topic is too broad';
    }
  }

  /** Rule-based summary: which checks fail, which are not checked yet. */
  function summary() {
    const cs = checks(model);
    const fails = cs.filter((c) => c.set && !c.pass);
    const todo = cs.filter((c) => !c.set);
    const parts = [];
    if (fails.length) {
      const text = `${WORDS[fails.length]} check${fails.length === 1 ? ' fails' : 's fail'}: ${joinList(fails.map(failText))}.`;
      parts.push(text.charAt(0).toUpperCase() + text.slice(1));
    }
    if (todo.length) parts.push(`Still to check: ${joinList(todo.map((c) => c.short))}.`);
    if (fails.length) parts.push('Try a narrower angle as a new idea.');
    return parts.join(' ');
  }

  function bars() {
    const spans = checks(model).map((c) => `<span class="${c.pass ? 'pass' : c.set ? 'fail' : ''}"></span>`).join('');
    return `<div class="result-bars" aria-hidden="true">${spans}</div>`;
  }

  function renderResult() {
    const passed = passedCount(model);
    const s = model.status;
    let badge, body = '', actions = '';
    const reasonId = 'validateReason';
    const notPassing = checks(model).filter((c) => !c.pass).map((c) => c.short);
    const validateBtn = passed === 5
      ? '<button type="button" class="btn btn-primary btn-block" data-action="validate">Mark validated</button>'
      : `<button type="button" class="btn btn-secondary btn-block" aria-disabled="true" aria-describedby="${reasonId}">Mark validated</button>
         <p class="reason" id="${reasonId}">Needs 5 of 5. Not passing: ${esc(joinList(notPassing))}.</p>`;
    const rejectBtn = '<button type="button" class="btn btn-secondary btn-block btn-danger-text" data-action="reject">Reject topic</button>';

    if (s === 'book_started') {
      badge = statusBadge('book_started');
      body = '<p class="result-text">A book is in progress on this topic.</p>';
      const bookId = newestBookId(model);
      if (bookId) actions = `<a class="btn btn-primary btn-block" href="${bookHref(bookId)}">Open book</a>`;
    } else if (s === 'validated') {
      badge = `<span class="check-badge pass">${ICON.check()}Ready to write</span>`;
      actions = '<button type="button" class="btn btn-primary btn-block" data-action="start">Start book</button>';
    } else if (s === 'rejected') {
      badge = `<span class="check-badge fail">${ICON.x()}Rejected</span>`;
      body = `<p class="result-text">${esc(summary() || 'You rejected this topic.')}</p>`;
      actions = '<button type="button" class="btn btn-secondary btn-block" data-action="archive">Move to archive</button>';
    } else if (s === 'archived') {
      badge = '<span class="check-badge todo">Archived</span>';
      body = '<p class="result-text">This topic is archived. Change its status to work on it again.</p>';
    } else if (passed === 5) {
      badge = `<span class="check-badge pass">${ICON.check()}All checks pass</span>`;
      body = '<p class="result-text">Mark it validated to start a book from it.</p>';
      actions = validateBtn + rejectBtn;
    } else if (!isScored(model)) {
      badge = '<span class="check-badge todo">Not scored</span>';
      body = '<p class="result-text">Fill in the page-1 data to see the result.</p>';
      actions = validateBtn + rejectBtn;
    } else {
      badge = `<span class="check-badge warn">${ICON.warn()}Needs work</span>`;
      body = `<p class="result-text">${esc(summary())}</p>`;
      actions = `<button type="button" class="btn btn-primary btn-block" data-action="narrower">${ICON.plus}Save narrower topic as new idea</button>`
        + validateBtn + rejectBtn;
    }

    const demotedNote = demoted
      ? `<div class="alert alert-warning">${ICON.warn(18)}<div>A check now fails, so this topic is back to Researching.</div></div>`
      : '';
    const hadFocus = els.result.contains(document.activeElement);
    els.result.innerHTML = `
      <div class="result-top"><span class="chip-label">RESULT</span>${badge}</div>
      <h2 id="res" class="result-title" tabindex="-1">${passed} of 5 market checks</h2>
      ${bars()}
      ${demotedNote}
      ${body}
      <div class="alert alert-error" data-start-error role="alert" hidden></div>
      ${actions}`;
    // The focused button may be gone: keep focus inside the card.
    if (hadFocus) els.result.querySelector('#res').focus();
  }

  /** The saved page-1 books of the last import, with "Import again". Hidden before any import. */
  function renderPageBooks() {
    const books = model.topic_page_books || [];
    els.pageBooks.hidden = !books.length;
    if (!books.length) { els.pageBooks.innerHTML = ''; return; }
    const used = books.filter((b) => b.included).length;
    const fmt = (v) => (v === null || v === undefined ? '<span class="muted-text">Not in page</span>' : Number(v).toLocaleString('en-US'));
    const tags = { winning: 'Winning', dead: 'Low-traction', authority: 'Authority' };
    const as = (b) => {
      if (!b.included) return '<span class="muted-text">Not used</span>';
      const list = countsAs(b);
      if (list.length) return list.map((k) => `<span class="tag">${tags[k]}</span>`).join(' ');
      if (b.bsr === null || b.reviews === null) return '<span class="muted-text">Not counted</span>';
      return '<span class="muted-text">—</span>';
    };
    const rows = books.map((b) => `
      <tr class="${b.included ? '' : 'is-off'}">
        <td class="book-col">
          <span class="import-book title-clamp" title="${esc(b.title)}">${esc(b.title)}</span>
          <span class="import-author">${b.author ? esc(b.author) : 'Author not in page'}${b.sponsored ? ' <span class="tag">Sponsored</span>' : ''}</span>
        </td>
        <td class="num-col">${fmt(b.bsr)}</td>
        <td class="num-col">${fmt(b.reviews)}</td>
        <td class="num-col">${b.rating === null ? '—' : Number(b.rating).toFixed(1)}</td>
        <td>${as(b)}</td>
      </tr>`).join('');
    els.pageBooks.innerHTML = `
      <div class="panel-head">
        <div>
          <h2 id="pb" class="panel-title">Page 1 books</h2>
          <p class="panel-hint">Imported ${esc(dayText(books[0].created_at))}. ${books.length} book${books.length === 1 ? '' : 's'}, ${used} used for the counts.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-import>Import again</button>
      </div>
      <div class="import-table-wrap is-flat" tabindex="0" role="region" aria-label="Saved page 1 books">
        <table class="import-table">
          <thead>
            <tr>
              <th scope="col">BOOK</th>
              <th scope="col" class="num-col">BSR</th>
              <th scope="col" class="num-col">REVIEWS</th>
              <th scope="col" class="num-col">RATING</th>
              <th scope="col">COUNTS AS</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderSave(message) {
    const el = els.save;
    const saveState = saver.state;
    if (saveState === 'saving') el.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    else if (saveState === 'saved') el.innerHTML = `<span class="save-ok">${ICON.check(14)}</span>Saved`;
    else if (saveState === 'error') {
      el.innerHTML = `<span class="save-error">${ICON.warn(14)}<span></span></span>${saver.hasUnsaved() ? '<button type="button" class="link-btn" data-retry-save>Retry</button>' : ''}`;
      el.querySelector('.save-error span').textContent = message || "Couldn't save.";
    } else el.textContent = '';
    el.dataset.state = saveState;
  }

  /* ── Autosave ────────────────────────────── */

  /** Record an edit, apply the status rules, and schedule a save. */
  function edit(field, value, delay) {
    model[field] = value;
    const marks = [field];
    // The database marks an edited count Manual (0006). Show it now; the save returns the real values.
    const key = COUNT_ROWS.find((r) => r.field === field)?.key;
    if (key) {
      model[`${key}_source`] = value === null ? null : 'manual';
      model[`${key}_set_at`] = value === null ? null : new Date().toISOString();
    }
    const passed = passedCount(model);
    if (model.status === 'validated' && passed < 5) {
      model.status = 'researching';
      marks.push('status');
      demoted = true;
    } else if (model.status === 'idea' && SCORE_FIELDS.includes(field) && isScored(model)) {
      model.status = 'researching';
      marks.push('status');
    }
    renderChecks();
    renderStatus();
    renderResult();
    marks.forEach((f) => saver.edit(f, delay));
  }

  // Every dirty field goes out in one update, one request at a time (js/autosave.js).
  saver = kdpAutosave.create({
    read: (field) => model[field],
    save: (fields) => kdp.updateTopic(topicId, fields),
    onSaved(res) {
      model.checks_passed = res.data.checks_passed;
      model.updated_at = res.data.updated_at;
      // Sources and dates come from the database, unless a newer edit of that count is waiting.
      COUNT_ROWS.forEach((r) => {
        if (saver.isDirty(r.field)) return;
        model[`${r.key}_source`] = res.data[`${r.key}_source`];
        model[`${r.key}_set_at`] = res.data[`${r.key}_set_at`];
      });
      renderChecks();
      if (!saver.isDirty('status')) model.status = res.data.status;
      renderStatus();
      renderResult();
    },
    async onError(res) {
      if (res.error.notFound) {
        saver.reset('error');
        renderProblem('This topic no longer exists', 'It was deleted, or it is not yours.', false);
        return true;
      }
      if (res.error.code === '23514') {
        // The database said no, e.g. validated below 5 checks. Show what is really saved.
        await load("This change breaks a topic rule, so it was not saved. A validated topic needs 5 of 5 market checks.");
        return true;
      }
      return false;
    },
    render: (state, message) => { if (els && els.save.isConnected) renderSave(message); }
  });
  const flush = () => saver.flush();

  /* ── Field events ────────────────────────── */

  function setFieldError(input, msg) {
    const err = document.getElementById(`${input.id}-error`);
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

  /** '' is "not set" (null). Otherwise a whole number from 0 to max. undefined = invalid. */
  function readCount(input) {
    const max = Number(input.max);
    if (input.validity.badInput) { setFieldError(input, 'Enter a whole number.'); return undefined; }
    const raw = input.value.trim();
    if (raw === '') { setFieldError(input, ''); return null; }
    const n = Number(raw);
    if (n < 0) { setFieldError(input, 'Enter 0 or more.'); return undefined; }
    if (!Number.isInteger(n)) { setFieldError(input, 'Enter a whole number.'); return undefined; }
    if (n > max) { setFieldError(input, `Use ${max.toLocaleString('en-US')} or less.`); return undefined; }
    setFieldError(input, '');
    return n;
  }

  function bindEvents() {
    // The grid is rebuilt on every renderPage, so this listener is never doubled.
    view.querySelector('.detail-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-import]');
      if (b) openImport(b);
    });

    view.querySelectorAll('[data-count]').forEach((input) => {
      input.addEventListener('input', () => {
        const v = readCount(input);
        if (v !== undefined && v !== model[input.dataset.count]) edit(input.dataset.count, v, 700);
      });
      input.addEventListener('blur', () => { if (saver.scheduled()) flush(); });
    });

    view.querySelectorAll('[data-toggle]').forEach((group) => {
      group.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const v = b.dataset.value === 'true';
        if (model[group.dataset.toggle] === v) return;
        model[group.dataset.toggle] = v;
        renderToggles();
        edit(group.dataset.toggle, v, 0);
      });
    });

    view.querySelectorAll('[data-range]').forEach((input) => {
      const key = input.dataset.range;
      input.addEventListener('input', () => { model[key] = Number(input.value); renderSliders(); });
      input.addEventListener('change', () => edit(key, Number(input.value), 300));
    });

    els.notes.addEventListener('input', () => edit('notes', els.notes.value.trim() ? els.notes.value : null, 800));
    els.notes.addEventListener('blur', () => { if (saver.scheduled()) flush(); });

    els.status.addEventListener('change', (e) => {
      if (!e.target.matches('[data-status-select]')) return;
      setStatus(e.target.value);
    });

    els.save.addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) flush(); });

    els.result.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const a = b.dataset.action;
      if (a === 'validate') setStatus('validated');
      else if (a === 'reject') setStatus('rejected');
      else if (a === 'archive') setStatus('archived');
      else if (a === 'narrower') kdpAddTopic.open({ notes: `Narrower version of: ${model.name}` });
      else if (a === 'start') startBook(b);
    });

    els.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuOpen()) closeMenu(true); else openMenu(false);
    });
    els.menuBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(e.key === 'ArrowUp'); }
    });
  }

  function setStatus(status) {
    if (status === model.status) return;
    if (status === 'validated' && passedCount(model) < 5) { renderStatus(); return; }
    model.status = status;
    demoted = false;
    renderStatus();
    renderResult();
    saver.edit('status', 0);
  }

  /* ── Import from Amazon page ─────────────── */

  function openImport(btn) {
    kdpTopicImport.open({
      getTopic: () => model,
      returnFocus: btn,
      // Pending autosave first. True when nothing is left unsaved.
      beforeSave: async () => { await flush(); return !saver.hasUnsaved() && saver.state !== 'error'; },
      onSaved: (row, books) => {
        const keep = { books: model.books };
        model = { ...model, ...row, ...keep, topic_page_books: books };
        demoted = false;
        saver.reset('saved');
        renderPage();
        const title = view.querySelector('#p1');
        title.setAttribute('tabindex', '-1');
        title.focus();
      }
    });
  }

  /* ── Start book ──────────────────────────── */

  async function startBook(btn) {
    const errBox = els.result.querySelector('[data-start-error]');
    errBox.hidden = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Starting…';
    await flush();   // the book reads the saved topic
    let res = { error: saver.hasUnsaved() ? new Error('unsaved') : null };
    if (!res.error) {
      try { res = await kdp.createBook(topicId, null); } catch (err) { res = { error: err }; }
    }
    if (!res.error && res.data) { location.href = bookHref(res.data); return; }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Start book';
    errBox.innerHTML = ICON.warn(18);
    const d = document.createElement('div');
    d.textContent = res.error.code === '42501'
      ? 'This topic is no longer validated. Reload the page to see its status.'
      : "We couldn't start the book. Check your connection, then try again.";
    errBox.append(d);
    errBox.hidden = false;
    btn.focus();
  }

  /* ── ⋯ menu: Rename, Archive, Delete ─────── */

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.id = 'topicMenu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const menuOpen = () => !menu.hidden;
  const menuItems = () => [...menu.querySelectorAll('[role="menuitem"]')];

  function openMenu(focusLast) {
    menu.setAttribute('aria-label', `Actions for ${model.name}`);
    menu.innerHTML = `
      <button type="button" class="menu-item" role="menuitem" tabindex="-1" data-menu="rename">${ICON.rename}Rename</button>
      ${model.status === 'archived' ? '' : `<button type="button" class="menu-item" role="menuitem" tabindex="-1" data-menu="archive">${ICON.archive}Archive</button>`}
      <div class="menu-sep" role="separator"></div>
      <button type="button" class="menu-item danger" role="menuitem" tabindex="-1" data-menu="delete">${ICON.trash()}Delete topic</button>`;
    els.menuBtn.after(menu);
    menu.hidden = false;
    els.menuBtn.setAttribute('aria-expanded', 'true');
    els.menuBtn.setAttribute('aria-controls', menu.id);
    const items = menuItems();
    (focusLast ? items[items.length - 1] : items[0]).focus();
  }

  function closeMenu(returnFocus) {
    if (!menuOpen()) return;
    menu.hidden = true;
    els.menuBtn.setAttribute('aria-expanded', 'false');
    els.menuBtn.removeAttribute('aria-controls');
    if (returnFocus) els.menuBtn.focus();
  }

  function moveFocus(step) {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    items[(i + step + items.length) % items.length].focus();
  }

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    e.stopPropagation();
    closeMenu(false);
    if (item.dataset.menu === 'rename') openRename();
    else if (item.dataset.menu === 'archive') { setStatus('archived'); els.menuBtn.focus(); }
    else openDelete();
  });
  menu.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(-1); break;
      case 'Home': e.preventDefault(); menuItems()[0].focus(); break;
      case 'End': e.preventDefault(); menuItems().slice(-1)[0].focus(); break;
      case 'Escape': e.preventDefault(); closeMenu(true); break;
      case 'Tab': closeMenu(true); break;
    }
  });
  document.addEventListener('click', (e) => { if (menuOpen() && !menu.contains(e.target)) closeMenu(false); });

  /* ── Shared dialog parts ─────────────────── */

  function makeDialog(labelId, html) {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', labelId);
    d.innerHTML = html;
    document.body.append(d);
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const list = [...d.querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return d;
  }

  function showAlert(el, msg) {
    el.innerHTML = ICON.warn(18);
    const div = document.createElement('div');
    div.textContent = msg;
    el.append(div);
    el.hidden = false;
  }

  function setBusy(btn, on, busyLabel, text) {
    btn.disabled = on;
    btn.setAttribute('aria-busy', String(on));
    btn.innerHTML = on ? `<span class="spinner" aria-hidden="true"></span>${busyLabel}` : text;
  }

  /* ── Rename (E3.4 pattern) ───────────────── */

  let rn = null;

  function buildRename() {
    const d = makeDialog('rnTitle', `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="rnTitle">Rename topic</h2>
            <p>Write it as one problem for one reader.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="field">
          <label for="rnInput">Topic</label>
          <input class="text-input" id="rnInput" type="text" autocomplete="off" aria-describedby="rnInput-error" />
          <span class="field-error" id="rnInput-error" hidden></span>
        </div>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" data-save>Save</button>
        </div>
      </form>`);
    rn = {
      d,
      form: d.querySelector('form'),
      input: d.querySelector('#rnInput'),
      error: d.querySelector('[data-error]'),
      save: d.querySelector('[data-save]'),
      busy: false
    };
    const close = () => { if (!rn.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => { if (els && els.menuBtn.isConnected) els.menuBtn.focus(); });
    rn.input.addEventListener('input', () => { setFieldError(rn.input, ''); rn.error.hidden = true; });
    rn.form.addEventListener('submit', onRename);
  }

  function openRename() {
    if (!rn) buildRename();
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');
    setFieldError(rn.input, '');
    rn.error.hidden = true;
    rn.input.value = model.name;
    rn.d.showModal();
    rn.input.focus();
    rn.input.select();
  }

  async function onRename(e) {
    e.preventDefault();
    if (rn.busy) return;
    rn.error.hidden = true;
    setFieldError(rn.input, '');
    const name = rn.input.value.trim();
    if (!name) { setFieldError(rn.input, 'Enter a topic.'); rn.input.focus(); return; }
    if (name.length > MAX_NAME) { setFieldError(rn.input, `Use ${MAX_NAME} characters or fewer. This one has ${name.length}.`); rn.input.focus(); return; }
    if (name === model.name) { rn.d.close(); return; }

    rn.busy = true;
    setBusy(rn.save, true, 'Saving…', 'Save');
    let res;
    try { res = await kdp.updateTopic(topicId, { name }); } catch (err) { res = { error: err }; }
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');

    if (!res.error) {
      model.name = res.data.name;
      model.updated_at = res.data.updated_at;
      renderName();
      saver.show('saved');
      rn.d.close();
      return;
    }
    const err = res.error;
    if (err.code === '23514') setFieldError(rn.input, `Use 1 to ${MAX_NAME} characters.`);
    else if (err.notFound) showAlert(rn.error, 'This topic no longer exists. Go back to Topic Lab to see your topics.');
    else showAlert(rn.error, "We couldn't rename the topic. Check your connection, then try again.");
    rn.input.focus();
  }

  /* ── Delete ──────────────────────────────── */

  let del = null;

  function buildDelete() {
    const d = makeDialog('delTitle', `
      <form class="dialog-inner" novalidate>
        <div class="delete-head">
          <span class="delete-icon">${ICON.trash(20)}</span>
          <h2 id="delTitle"></h2>
        </div>
        <p class="delete-text" id="delDesc"></p>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-danger" data-delete>Delete topic</button>
        </div>
      </form>`);
    d.setAttribute('aria-describedby', 'delDesc');
    del = {
      d,
      form: d.querySelector('form'),
      title: d.querySelector('#delTitle'),
      text: d.querySelector('#delDesc'),
      error: d.querySelector('[data-error]'),
      btn: d.querySelector('[data-delete]'),
      busy: false
    };
    const close = () => { if (!del.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { if (e.target === d) close(); });
    d.addEventListener('close', () => { if (els && els.menuBtn.isConnected) els.menuBtn.focus(); });
    del.form.addEventListener('submit', onDelete);
  }

  function openDelete() {
    if (!del) buildDelete();
    del.busy = false;
    del.error.hidden = true;
    del.title.textContent = `Delete "${model.name}"?`;
    const n = (model.books || []).length;
    const books = n === 0 ? 'Its market check data and notes will be deleted.'
      : `Its market check data and notes will be deleted. Its ${n === 1 ? 'book stays' : `${n} books stay`}. On the Books page, ${n === 1 ? 'it shows' : 'they show'} "Unvalidated topic".`;
    del.text.textContent = `${books} `;
    const strong = document.createElement('strong');
    strong.textContent = 'This cannot be undone.';
    del.text.append(strong);
    setBusy(del.btn, false, 'Deleting…', 'Delete topic');
    del.d.showModal();
    // Safe default: focus Cancel, not the destructive button.
    del.d.querySelector('.dialog-foot [data-close]').focus();
  }

  async function onDelete(e) {
    e.preventDefault();
    if (del.busy) return;
    del.error.hidden = true;
    del.busy = true;
    setBusy(del.btn, true, 'Deleting…', 'Delete topic');
    let res;
    try { res = await kdp.deleteTopic(topicId); } catch (err) { res = { error: err }; }
    del.busy = false;
    setBusy(del.btn, false, 'Deleting…', 'Delete topic');
    if (!res.error) {
      saver.reset('idle');   // nothing left to save, so leaving does not ask
      try { sessionStorage.setItem('kdp.notice', `Deleted “${model.name}”.`); } catch (err) { /* no notice */ }
      location.href = 'topic-lab.html';
      return;
    }
    if (res.error.notFound) showAlert(del.error, 'This topic was already deleted, or it is not yours. Go back to Topic Lab to see your topics.');
    else showAlert(del.error, "We couldn't delete the topic. Check your connection, then try again.");
    del.btn.focus();
  }

  /* ── Data ────────────────────────────────── */

  async function load(message) {
    if (!topicId) { renderProblem('No topic picked', 'Open a topic from Topic Lab.', false); return; }
    renderLoading();
    let res;
    try { res = await kdp.getTopic(topicId); } catch (err) { res = { error: err }; }
    if (res.error) { renderProblem("We couldn't load this topic", 'Check your connection, then try again.', true); return; }
    if (!res.data) { renderProblem('This topic does not exist', 'It was deleted, or it is not yours.', false); return; }
    model = res.data;
    demoted = false;
    saver.reset(message ? 'error' : 'idle', message);
    renderPage();
    if (message) renderSave(message);
  }

  /* ── Start ───────────────────────────────── */

  const user = await kdpShell.init({ active: 'topics' });
  if (!user) return;
  load();
})();
