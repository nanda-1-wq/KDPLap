/* ═══════════════════════════════════════════════════
   KDP Lab — Pen name detail (designs 12 and 13)
   /js/pen-name.js

   Load AFTER supabase.js, shell.js, new-book.js, pen-name-common.js,
   pen-name-actions.js.
   URL: app/pen-name.html?id=<pen name id>

   Every edit autosaves (Saving / Saved / Couldn't save + Retry, as in E4).
   bio_text is one column with no versions in v1 (owner decision, E5).
   "Generate bio" (E6) shows the AI bio as a suggestion. It replaces the bio
   only when the user clicks Accept. "Rebuild voice from sample" comes later.
═══════════════════════════════════════════════════ */

(async function () {
  const P = kdpPens;
  const { ICON, esc } = kdpUi;

  const view = document.getElementById('view');
  const penId = new URLSearchParams(location.search).get('id');

  let user = null;
  let model = null;       // the pen name as shown, including unsaved edits
  let defaultId = null;
  let els = null;
  let saver = null;        // js/autosave.js, created once below

  const bookHref = (id) => `book.html?id=${encodeURIComponent(id)}`;

  /* ── Page states ─────────────────────────── */

  function renderLoading() {
    view.innerHTML = `<p class="sr-only" role="status">Loading the pen name…</p>
      <div class="detail-head" aria-hidden="true"><div class="skel skel-line skel-w30"></div>
        <div class="pen-title"><div class="pen-avatar lg skel"></div><div class="skel-grow"><div class="skel skel-title"></div><div class="skel skel-line skel-w40"></div></div></div></div>
      <div class="pen-detail-grid" aria-hidden="true">
        <div class="panel skel-stack"><div class="skel skel-title"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
        <div class="panel skel-stack"><div class="skel skel-title"></div><div class="skel skel-row"></div><div class="skel skel-row"></div></div>
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
            <a class="btn btn-secondary" href="pen-names.html">Back to Pen Names</a>
          </div>
        </div>
      </div>`;
    if (retry) document.getElementById('retryBtn').addEventListener('click', () => load());
  }

  /* ── Main render (once per load) ─────────── */

  const options = (key) => `<option value="">Not set</option>${P.CHOICES[key].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}`;

  function selectField(key, text) {
    return `<div class="field"><label for="v-${key}">${text}</label><select class="select select-block" id="v-${key}" data-choice="${key}">${options(key)}</select></div>`;
  }

  /** A visible but disabled AI action, with its reason as visible text. */
  function aiButton(id, text, note) {
    return `<div class="ai-action">
        <button type="button" class="btn btn-secondary" aria-disabled="true" aria-describedby="${id}-note">${ICON.sparkle}${text}</button>
        <span class="ai-note" id="${id}-note">${note}</span>
      </div>`;
  }

  function renderPage() {
    view.innerHTML = `
      <div class="detail-head">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="pen-names.html">Pen Names</a> <span aria-hidden="true">/</span> <span aria-current="page" data-crumb></span></nav>
        <div class="detail-title-row">
          <div class="pen-title">
            <div class="pen-avatar lg" aria-hidden="true" data-avatar></div>
            <div class="pen-title-text">
              <h1 data-name tabindex="-1"></h1>
              <p class="pen-meta" data-meta></p>
            </div>
          </div>
          <div class="detail-controls">
            <span class="save-state" role="status" data-save></span>
            <div class="menu-anchor">
              <button type="button" class="icon-btn menu-btn" data-pen-menu="${esc(penId)}" aria-haspopup="menu" aria-expanded="false">${ICON.more}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="pen-detail-grid">
        <div class="pen-col">
          <section class="panel pen-panel" aria-labelledby="pIdentity">
            <h2 id="pIdentity" class="panel-title">Identity</h2>
            <div class="field">
              <label for="f-name">Pen name</label>
              <input class="text-input" id="f-name" type="text" autocomplete="off" aria-describedby="f-name-error" data-name-input />
              <span class="field-error" id="f-name-error" hidden></span>
            </div>
            <div class="field">
              <label for="f-niche">Niche focus</label>
              <input class="text-input" id="f-niche" type="text" autocomplete="off" maxlength="${P.MAX_NICHE}" placeholder="Example: Health and movement after 50" data-niche />
            </div>
            <div class="pen-default-row" data-default></div>
          </section>

          <section class="panel pen-panel" aria-labelledby="pFacts">
            <div>
              <h2 id="pFacts" class="panel-title">Bio facts</h2>
              <p class="panel-hint">The AI builds the bio from these facts only. It never adds degrees, awards, or titles.</p>
            </div>
            <div class="field">
              <label for="f-background">Background</label>
              <textarea class="text-area" id="f-background" rows="2" maxlength="${P.FACT_MAX.background}" data-fact="background"></textarea>
            </div>
            <div class="field">
              <label for="f-credentials">Credentials</label>
              <input class="text-input" id="f-credentials" type="text" autocomplete="off" maxlength="${P.FACT_MAX.credentials}" placeholder="Only real ones. Leave empty if none." data-fact="credentials" />
            </div>
            <div class="field">
              <label for="f-personal">Personal details</label>
              <input class="text-input" id="f-personal" type="text" autocomplete="off" maxlength="${P.FACT_MAX.personal}" data-fact="personal" />
            </div>
            <div class="bio-box">
              <div class="field">
                <label for="f-bio" class="bio-label">Bio</label>
                <span class="field-hint" id="f-bio-hint">Write it yourself, or generate one from the facts above.</span>
                <textarea class="text-area bio-text" id="f-bio" rows="5" maxlength="${P.MAX_BIO}" aria-describedby="f-bio-hint" data-bio></textarea>
              </div>
              <div class="ai-action">
                <button type="button" class="btn btn-secondary" aria-describedby="genBio-note" data-gen-bio>${ICON.sparkle}Generate bio</button>
                <span class="ai-note" id="genBio-note">Uses only your facts. Your bio changes only if you accept.</span>
              </div>
              <div data-suggest></div>
            </div>
          </section>
        </div>

        <div class="pen-col">
          <section class="panel pen-panel" aria-labelledby="pVoice">
            <div>
              <h2 id="pVoice" class="panel-title">Voice profile</h2>
              <p class="panel-hint">Every chapter for this pen name is written in this voice.</p>
            </div>
            <div class="field">
              <span class="field-label" id="toneLabel">Tone</span>
              <div class="tone-chips" role="group" aria-labelledby="toneLabel">
                ${P.TONES.map(([k, l]) => `<button type="button" class="tone-chip" data-tone="${k}" aria-pressed="false">${l}</button>`).join('')}
              </div>
            </div>
            <div class="field-pair">
              ${selectField('reading_level', 'Reading level')}
              ${selectField('perspective', 'Perspective')}
              ${selectField('sentences', 'Sentences')}
              ${selectField('paragraphs', 'Paragraphs')}
            </div>
            <div class="field">
              <label for="f-sample">Writing sample</label>
              <span class="field-hint" id="f-sample-hint" data-words></span>
              <textarea class="text-area" id="f-sample" rows="4" maxlength="${P.MAX_SAMPLE}" aria-describedby="f-sample-hint" data-sample></textarea>
            </div>
            ${aiButton('rebuild', 'Rebuild voice from sample', 'Coming in a later task.')}
          </section>

          <section class="panel pen-panel" aria-labelledby="pBooks">
            <h2 id="pBooks" class="panel-title">Books by this pen name</h2>
            <div data-books></div>
          </section>
        </div>
      </div>`;

    els = {
      name: view.querySelector('[data-name]'),
      crumb: view.querySelector('[data-crumb]'),
      avatar: view.querySelector('[data-avatar]'),
      meta: view.querySelector('[data-meta]'),
      save: view.querySelector('[data-save]'),
      menuBtn: view.querySelector('[data-pen-menu]'),
      nameInput: view.querySelector('[data-name-input]'),
      niche: view.querySelector('[data-niche]'),
      def: view.querySelector('[data-default]'),
      bio: view.querySelector('[data-bio]'),
      sample: view.querySelector('[data-sample]'),
      words: view.querySelector('[data-words]'),
      books: view.querySelector('[data-books]'),
      genBio: view.querySelector('[data-gen-bio]'),
      suggest: view.querySelector('[data-suggest]')
    };

    // Fill inputs from the model. After this, inputs own their values.
    els.nameInput.value = model.name;
    els.niche.value = model.niche || '';
    view.querySelectorAll('[data-fact]').forEach((i) => { i.value = model.facts[i.dataset.fact]; });
    els.bio.value = model.bio_text || '';
    view.querySelectorAll('[data-choice]').forEach((s) => { s.value = model.voice[s.dataset.choice] || ''; });
    els.sample.value = model.voice.sample;

    renderHead();
    renderDefault();
    renderTones();
    renderWords();
    renderBooks();
    renderSave();
    bindEvents();
  }

  /* ── Parts that change ───────────────────── */

  function renderHead() {
    const n = model.books.length;
    els.name.textContent = model.name;
    els.crumb.textContent = model.name;
    els.avatar.textContent = P.initial(model.name);
    els.avatar.classList.toggle('is-missing', !P.bioReady(model));
    const bits = [model.niche ? esc(model.niche) : '<span class="none">Niche not set</span>', `${n} book${n === 1 ? '' : 's'}`];
    els.meta.innerHTML = bits.join(' · ') + (defaultId === penId ? ` ${P.defaultChip}` : '');
    els.menuBtn.setAttribute('aria-label', `More actions for ${model.name}`);
    document.title = `${model.name} · Pen Names · KDP Lab`;
  }

  function renderDefault(error) {
    const hadFocus = els.def.contains(document.activeElement);
    const isDefault = defaultId === penId;
    els.def.innerHTML = isDefault
      ? `<div class="pen-default-line">${P.defaultChip}<span>New books start with this pen name.</span></div>
         <button type="button" class="btn btn-secondary" data-set-default="off">Remove default</button>`
      : `<button type="button" class="btn btn-secondary" data-set-default="on">Set as default for new books</button>
         <span class="field-hint">New books start with the default pen name.</span>`;
    if (error) {
      const box = document.createElement('div');
      box.className = 'alert alert-error';
      box.setAttribute('role', 'alert');
      box.innerHTML = ICON.warn(18);
      const d = document.createElement('div');
      d.textContent = error;
      box.append(d);
      els.def.append(box);
    }
    if (hadFocus) els.def.querySelector('[data-set-default]').focus();
  }

  function renderTones() {
    view.querySelectorAll('[data-tone]').forEach((b) => b.setAttribute('aria-pressed', String(model.voice.tones.includes(b.dataset.tone))));
  }

  function renderWords() {
    const n = P.wordCount(els.sample.value);
    const w = `${n.toLocaleString('en-US')} word${n === 1 ? '' : 's'}`;
    els.words.textContent = n === 0 ? `Paste ${P.SAMPLE_ENOUGH} words or more written in this voice.`
      : n >= P.SAMPLE_ENOUGH ? `${w} · enough to learn the voice`
      : `${w} · add more to learn the voice (${P.SAMPLE_ENOUGH} or more)`;
  }

  function renderBooks() {
    const books = model.books.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    if (!books.length) {
      els.books.innerHTML = '<p class="panel-hint pen-books-empty">No books use this pen name yet. Pick it in a book’s Brief, or set it as the default for new books.</p>';
      return;
    }
    els.books.innerHTML = `<ul class="pen-books">${books.map((b) => {
      const title = P.bookTitle(b) || 'Untitled book';
      const review = (b.chapters || []).some((c) => c.needs_review);
      return `<li class="pen-book">
          <div class="cover-ph mini" aria-hidden="true">
            <div class="cover-ph-title">${esc(title)}</div><div class="cover-ph-rule"></div>
            <div class="cover-ph-pen">${esc(model.name)}</div>
          </div>
          <a class="pen-book-title" href="${bookHref(b.id)}">${esc(title)}</a>
          ${review
            ? `<span class="badge badge-warning">${ICON.warn(12)}Needs review</span>`
            : `<span class="pen-book-step">${esc(P.stepLabel(b.current_step || 1))}</span>`}
        </li>`;
    }).join('')}</ul>`;
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

  const edit = (field, delay) => saver.edit(field, delay);

  /** The value to send for a field, or { error } when it breaks a shape rule. */
  function outgoing(field) {
    switch (field) {
      case 'name': return { value: model.name };
      case 'niche': return { value: model.niche };
      case 'bio_text': return { value: model.bio_text };
      case 'bio_facts': return P.cleanFacts(model.facts);
      default: return P.cleanVoice(model.voice);
    }
  }

  // Every dirty field goes out in one update, one request at a time (js/autosave.js).
  saver = kdpAutosave.create({
    read(field) {
      const out = outgoing(field);
      return out.error ? { error: out.error } : out.value;
    },
    save: (fields) => kdp.updatePenName(penId, fields),
    onSaved(res) { model.updated_at = res.data.updated_at; },
    async onError(res) {
      if (res.error.notFound) {
        saver.reset('error');
        renderProblem('This pen name no longer exists', 'It was deleted, or it is not yours.', false);
        return true;
      }
      if (res.error.code === '23514') {
        // The database said no. Show what is really saved.
        await load('This change breaks a pen name rule, so it was not saved.');
        return true;
      }
      return false;
    },
    render: (state, message) => { if (els && els.save.isConnected) renderSave(message); }
  });
  const flush = () => saver.flush();

  /* ── Field events ────────────────────────── */

  function setNameError(msg) {
    const input = els.nameInput;
    const err = document.getElementById('f-name-error');
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

  const flushOnBlur = (el) => el.addEventListener('blur', () => { if (saver.scheduled()) flush(); });

  function bindEvents() {
    els.nameInput.addEventListener('input', () => {
      const name = els.nameInput.value.trim();
      const msg = P.nameError(name);
      setNameError(msg);
      if (msg) return;   // keep the last good name (shown in the header); nothing new to save
      if (name === model.name) return;
      model.name = name;
      renderHead();
      edit('name', 700);
    });
    flushOnBlur(els.nameInput);

    els.niche.addEventListener('input', () => {
      model.niche = els.niche.value.trim() || null;
      renderHead();
      edit('niche', 700);
    });
    flushOnBlur(els.niche);

    view.querySelectorAll('[data-fact]').forEach((input) => {
      input.addEventListener('input', () => { model.facts[input.dataset.fact] = input.value; edit('bio_facts', 800); });
      flushOnBlur(input);
    });

    els.bio.addEventListener('input', () => {
      model.bio_text = els.bio.value.trim() ? els.bio.value.trim() : null;
      renderHead();
      edit('bio_text', 800);
    });
    flushOnBlur(els.bio);

    view.querySelector('.tone-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tone]');
      if (!b) return;
      const t = b.dataset.tone;
      const tones = model.voice.tones;
      // Keep the display order of TONES whatever the click order.
      const next = tones.includes(t) ? tones.filter((x) => x !== t) : P.TONES.map(([k]) => k).filter((k) => k === t || tones.includes(k));
      if (next.length > P.MAX_TONES) return;
      model.voice.tones = next;
      renderTones();
      edit('voice', 0);
    });

    view.querySelectorAll('[data-choice]').forEach((s) => {
      s.addEventListener('change', () => { model.voice[s.dataset.choice] = s.value || null; edit('voice', 0); });
    });

    els.sample.addEventListener('input', () => { model.voice.sample = els.sample.value; renderWords(); edit('voice', 800); });
    flushOnBlur(els.sample);

    els.save.addEventListener('click', (e) => { if (e.target.closest('[data-retry-save]')) flush(); });

    els.genBio.addEventListener('click', () => generateBio());
    els.suggest.addEventListener('click', (e) => {
      if (e.target.closest('[data-accept]')) acceptBio();
      else if (e.target.closest('[data-discard]')) discardBio();
      else if (e.target.closest('[data-regen]')) generateBio();
    });

    els.def.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set-default]');
      if (b && !b.disabled) setDefault(b, b.dataset.setDefault === 'on');
    });
  }

  /* ── Generate bio (E6): a suggestion, never a silent replace ── */

  let suggestion = null;   // the generated bio waiting for Accept or Discard
  let generating = false;

  const nextMonthUtc = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** [kind, text, retry] for an error code from kdp.generate. */
  function genMessage(code) {
    switch (code) {
      case 'not_enough_facts': return ['warning', 'Add a bit more about yourself first. The AI does not invent facts.', false];
      case 'monthly_limit': return ['warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`, false];
      case 'rate_limited': return ['warning', 'Too many requests. Wait a minute, then try again.', true];
      case 'save_first': return ['error', 'Your last change is not saved yet. Use Retry next to “Couldn’t save”, then generate.', false];
      case 'network': return ['error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.', true];
      default: return ['error', 'The AI is not available right now. This try was not counted.', true];
    }
  }

  function setGenBusy(busy) {
    generating = busy;
    const b = els.genBio;
    b.disabled = busy;
    if (busy) {
      b.setAttribute('aria-busy', 'true');
      b.innerHTML = '<span class="spinner" aria-hidden="true"></span>Generating…';
    } else {
      b.removeAttribute('aria-busy');
      b.innerHTML = `${ICON.sparkle}${suggestion ? 'Generate again' : 'Generate bio'}`;
    }
  }

  function renderGenLoading() {
    els.suggest.innerHTML = `<div class="bio-suggest is-loading" role="status">
        <span class="bio-suggest-label">SUGGESTED BIO</span>
        <p class="field-hint">Writing a bio from your facts…</p>
        <div class="skel skel-line"></div><div class="skel skel-line"></div><div class="skel skel-line skel-w40"></div>
      </div>`;
  }

  function renderGenError(code, missing) {
    const [kind, text, retry] = genMessage(code);
    els.suggest.innerHTML = '';
    const box = document.createElement('div');
    box.className = `alert alert-${kind}`;
    box.setAttribute('role', 'alert');
    box.innerHTML = ICON.warn(18);
    const body = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'alert-text';
    p.textContent = text;
    body.append(p);
    if (missing) {
      const m = document.createElement('p');
      m.className = 'alert-text';
      m.textContent = missing;
      body.append(m);
    }
    if (retry) body.insertAdjacentHTML('beforeend', '<button type="button" class="link-btn" data-regen>Try again</button>');
    box.append(body);
    els.suggest.append(box);
  }

  function renderSuggestion() {
    const n = P.wordCount(suggestion);
    els.suggest.innerHTML = `<div class="bio-suggest" role="region" aria-labelledby="sugLabel">
        <div class="bio-suggest-head">
          <span class="bio-suggest-label" id="sugLabel">SUGGESTED BIO</span>
          <span class="badge badge-success">${ICON.check(13)}Uses only your facts</span>
        </div>
        <p class="bio-suggest-text" tabindex="-1" data-suggest-text></p>
        <p class="field-hint">${n} word${n === 1 ? '' : 's'}. Your current bio stays until you accept.</p>
        <div class="bio-suggest-actions">
          <button type="button" class="btn btn-primary" data-accept>${ICON.check(16)}Accept</button>
          <button type="button" class="btn btn-secondary" data-discard>Discard</button>
        </div>
      </div>`;
    els.suggest.querySelector('[data-suggest-text]').textContent = suggestion;
  }

  async function generateBio() {
    if (generating) return;
    setGenBusy(true);
    // The server reads the saved facts, so save any edits first.
    if (saver.hasUnsaved()) await flush();
    // Only a failed save that left edits behind blocks; a refused save was reloaded from the database.
    if (saver.state === 'error' && saver.hasUnsaved()) {
      setGenBusy(false);
      renderGenError('save_first');
      return;
    }

    renderGenLoading();
    let res;
    try { res = await kdp.generate({ stage: 'bio', penNameId: penId }); } catch (err) { res = { error: { code: 'network' } }; }
    const code = res.error && res.error.code;

    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') { renderProblem('This pen name no longer exists', 'It was deleted, or it is not yours.', false); return; }

    if (code) {
      setGenBusy(false);
      renderGenError(code, code === 'not_enough_facts' ? res.error.missing : '');
      return;
    }
    suggestion = res.data.bio;
    setGenBusy(false);
    renderSuggestion();
    els.suggest.querySelector('[data-suggest-text]').focus();
  }

  function acceptBio() {
    if (!suggestion) return;
    model.bio_text = suggestion;
    els.bio.value = suggestion;
    suggestion = null;
    els.suggest.innerHTML = '';
    setGenBusy(false);
    renderHead();
    edit('bio_text', 0);
    els.bio.focus();
  }

  function discardBio() {
    suggestion = null;
    els.suggest.innerHTML = '';
    setGenBusy(false);
    els.genBio.focus();
  }

  /* ── Default pen name for new books ──────── */

  async function setDefault(btn, on) {
    const text = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    let res;
    try { res = await kdp.setDefaultPenName(user.id, on ? penId : null); } catch (err) { res = { error: err }; }
    if (res.error) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = text;
      renderDefault("We couldn't change the default. Check your connection, then try again.");
      els.def.querySelector('[data-set-default]').focus();
      return;
    }
    defaultId = res.data;
    renderDefault();
    renderHead();
    els.def.querySelector('[data-set-default]').focus();
  }

  /* ── ⋯ menu: Rename, Delete (js/pen-name-actions.js) ── */

  kdpPenActions.init({
    getPen: () => (model ? { name: model.name, isDefault: defaultId === penId } : null),
    onRenamed(id, row) {
      model.name = row.name;
      model.updated_at = row.updated_at;
      saver.drop('name');
      els.nameInput.value = row.name;
      setNameError('');
      renderHead();
      saver.show(saver.hasUnsaved() ? saver.state : 'saved');
    },
    onDeleted(id, info) {
      saver.reset('idle');   // nothing left to save, so leaving does not ask
      const text = info.wasDefault
        ? `Deleted “${info.name}”. New books now start with no pen name.`
        : `Deleted “${info.name}”.`;
      try { sessionStorage.setItem('kdp.notice', text); } catch (err) { /* no notice */ }
      location.href = 'pen-names.html';
    }
  });

  /* ── Data ────────────────────────────────── */

  async function load(message) {
    if (!penId) { renderProblem('No pen name picked', 'Open a pen name from Pen Names.', false); return; }
    renderLoading();
    let pen, def;
    try {
      [pen, def] = await Promise.all([kdp.getPenName(penId), kdp.getDefaultPenNameId()]);
    } catch (err) { pen = { error: err }; }
    if (pen.error || (def && def.error)) { renderProblem("We couldn't load this pen name", 'Check your connection, then try again.', true); return; }
    if (!pen.data) { renderProblem('This pen name does not exist', 'It was deleted, or it is not yours.', false); return; }
    const d = pen.data;
    model = {
      name: d.name, niche: d.niche, bio_text: d.bio_text, updated_at: d.updated_at,
      facts: P.readFacts(d.bio_facts), voice: P.readVoice(d.voice), books: d.books || []
    };
    defaultId = def.data;
    saver.reset(message ? 'error' : 'idle', message);
    renderPage();
    if (message) renderSave(message);
  }

  /* ── Start ───────────────────────────────── */

  user = await kdpShell.init({ active: 'pens' });
  if (!user) return;
  load();
})();
