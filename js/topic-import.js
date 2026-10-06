/* ═══════════════════════════════════════════════════
   KDP Lab — Import from Amazon page (E6.5)
   /js/topic-import.js

   Load AFTER supabase.js and topics.js. Used by js/topic.js:
     kdpTopicImport.open({ getTopic, beforeSave, onSaved, returnFocus })

   Steps: paste → analyzing → review → (confirm) → save.
   The AI only copies books out of the pasted text (Edge Function
   "generate", stage amazon_import). Our rules (kdpTopics.countsAs) make
   the counts, live in the browser and again in save_topic_import (0006).
   Nothing is saved until "Save counts to topic".
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const { RULE_TEXT, checks, countsAs, countData, bookCounts, sourceText } = kdpTopics;

  const MIN_CHARS = 200;
  const MAX_CHARS = 60000;       // same caps as the Edge Function
  const MAX_BSR = 100000000;     // same caps as migration 0006
  const MAX_REVIEWS = 10000000;
  const KEYS = ['winning', 'dead', 'authority'];
  const NAMES = { winning: 'Winning books', dead: 'Low-traction books', authority: 'Authority books' };
  const TAGS = { winning: 'Winning', dead: 'Low-traction', authority: 'Authority' };

  const fmt = (n) => Number(n).toLocaleString('en-US');

  let d = null;          // the <dialog>
  let body = null;       // step content
  let opts = null;
  let state = null;      // { topicId, step, text, books, replaceManual }
  let run = 0;           // ignores a late reply after Cancel
  let busy = false;

  /* ── Dialog shell ────────────────────────── */

  function build() {
    d = document.createElement('dialog');
    d.className = 'dialog dialog-lg';
    d.setAttribute('aria-labelledby', 'impTitle');
    d.innerHTML = '<div class="dialog-inner" data-body></div>';
    document.body.append(d);
    body = d.querySelector('[data-body]');

    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => { if (opts && opts.returnFocus && opts.returnFocus.isConnected) opts.returnFocus.focus(); });
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const list = [...d.querySelectorAll('button, input, textarea')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    d.addEventListener('click', onClick);
    d.addEventListener('input', onInput);
    d.addEventListener('change', onChange);
  }

  function close() {
    if (busy && state.step !== 'paste') return;   // saving: wait
    run += 1;                                    // a pending analysis is ignored
    busy = false;
    d.close();
  }

  const head = (title, text) => `
    <div class="dialog-head">
      <div>
        <h2 id="impTitle" tabindex="-1">${title}</h2>
        <p>${text}</p>
      </div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Close">${ICON.close}</button>
    </div>`;

  function alertBox(kind, text, extra) {
    return `<div class="alert alert-${kind}" role="alert">${ICON.warn(18)}<div><p class="alert-text">${esc(text)}</p>${extra || ''}</div></div>`;
  }

  /* ── Step 1: paste ───────────────────────── */

  function renderPaste(message) {
    const topic = opts.getTopic();
    body.innerHTML = `
      ${head('Import from Amazon page', 'Paste page 1 of your Amazon search. We list the books and count the market checks for you.')}
      <ol class="import-steps">
        <li>Search Amazon for “${esc(topic.name)}”. Stay on page 1.</li>
        <li>Turn on a BSR extension, like DS Amazon Quick View, so each book shows its BSR.</li>
        <li>Select the whole page with Cmd+A, then copy it with Cmd+C. On Windows, use Ctrl+A and Ctrl+C.</li>
      </ol>
      <div class="field">
        <label for="impText">Page text</label>
        <textarea class="text-area import-paste" id="impText" rows="8" spellcheck="false"
          placeholder="Paste the page here" aria-describedby="impCount impText-error"></textarea>
        <div class="import-paste-meta">
          <span class="field-hint" id="impCount" data-char-count></span>
          <span class="field-error" id="impText-error" hidden></span>
        </div>
      </div>
      <ul class="import-notes">
        <li>Nothing is fetched from Amazon. Only the text you paste is read.</li>
        <li>Uses about $0.05 of AI. It counts only if it works.</li>
      </ul>
      <p class="import-wait" data-wait role="status" hidden><span class="spinner inline" aria-hidden="true"></span>Reading the page. This can take up to a minute.</p>
      <div data-msg>${message || ''}</div>
      <div class="dialog-foot">
        <button type="button" class="btn btn-secondary" data-act="close">Cancel</button>
        <button type="button" class="btn btn-primary" data-act="analyze">Analyze page</button>
      </div>`;
    const ta = body.querySelector('#impText');
    ta.value = state.text;
    updateCount();
    ta.focus();
  }

  function updateCount() {
    const ta = body.querySelector('#impText');
    const n = ta.value.length;
    body.querySelector('[data-char-count]').textContent = `${fmt(n)} / ${fmt(MAX_CHARS)} characters`;
  }

  function pasteError(text) {
    const ta = body.querySelector('#impText');
    const err = body.querySelector('#impText-error');
    if (text) {
      ta.setAttribute('aria-invalid', 'true');
      err.innerHTML = ICON.x();
      err.append(text);
      err.hidden = false;
    } else {
      ta.removeAttribute('aria-invalid');
      err.hidden = true;
    }
  }

  const nextMonthUtc = () => {
    const t = new Date();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };

  /** Message HTML for an error code from kdp.generate. */
  function analyzeMessage(code) {
    switch (code) {
      case 'not_amazon_page':
        return alertBox('warning', 'This does not look like an Amazon search page with books. Copy page 1 of the search results, then paste it again. This try was not counted.');
      case 'monthly_limit':
        return alertBox('warning', `You have used this month’s AI allowance. It resets on ${nextMonthUtc()}.`);
      case 'rate_limited':
        return alertBox('warning', 'Too many requests. Wait a minute, then try again.');
      case 'bad_request':
        return alertBox('error', `Paste between ${fmt(MIN_CHARS)} and ${fmt(MAX_CHARS)} characters, then try again.`);
      case 'network':
        return alertBox('error', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted.');
      default:
        return alertBox('error', 'The AI is not available right now. Try again in a moment. This try was not counted.');
    }
  }

  async function analyze() {
    if (busy) return;
    const ta = body.querySelector('#impText');
    state.text = ta.value;
    const len = state.text.trim().length;
    body.querySelector('[data-msg]').innerHTML = '';
    if (len < MIN_CHARS) { pasteError('Paste the whole page. This text is too short to be an Amazon page.'); ta.focus(); return; }
    if (state.text.length > MAX_CHARS) { pasteError(`This is too long. Paste page 1 only, up to ${fmt(MAX_CHARS)} characters.`); ta.focus(); return; }
    pasteError('');

    busy = true;
    const mine = ++run;
    const btn = body.querySelector('[data-act="analyze"]');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Analyzing…';
    ta.readOnly = true;
    body.querySelector('[data-wait]').hidden = false;

    let res;
    try {
      res = await kdp.generate({ stage: 'amazon_import', topicId: state.topicId, text: state.text });
    } catch (err) {
      res = { error: { code: 'network' } };
    }
    if (mine !== run) return;    // closed meanwhile
    busy = false;

    const code = res.error ? res.error.code : null;
    if (code === 'unauthorized') { location.replace('../login.html'); return; }
    if (code === 'not_found') {
      renderPaste(alertBox('error', 'This topic no longer exists. Go back to Topic Lab to see your topics.'));
      return;
    }
    if (code || !res.data || !Array.isArray(res.data.books)) {
      renderPaste(analyzeMessage(code || 'ai_unavailable'));
      body.querySelector('[data-act="analyze"]').focus();
      return;
    }

    // Sponsored rows start with Use off. Missing numbers stay null and can be typed in.
    const whole = (v) => (Number.isInteger(v) ? v : null);
    state.books = res.data.books.map((b) => ({
      title: String(b.title),
      author: typeof b.author === 'string' ? b.author : null,
      bsr: whole(b.bsr),
      reviews: whole(b.reviews),
      rating: typeof b.rating === 'number' ? b.rating : null,
      sponsored: b.sponsored === true,
      included: b.sponsored !== true,
      bsrMissing: !Number.isInteger(b.bsr),
      reviewsMissing: !Number.isInteger(b.reviews)
    }));
    state.step = 'review';
    renderReview();
  }

  /* ── Step 2: review ──────────────────────── */

  function renderReview() {
    const n = state.books.length;
    const anyBsr = state.books.some((b) => !b.bsrMissing);
    body.innerHTML = `
      ${head('Check the books', `We found ${n} book${n === 1 ? '' : 's'} on page 1. Our rules make the counts, not the AI. Untick a book to leave it out, or type a missing number.`)}
      ${anyBsr ? '' : alertBox('warning', 'No book on this page shows a BSR, so nothing can be counted yet. Turn on a BSR extension, reload the Amazon page, and copy it again. Or type the BSRs below.',
        '<button type="button" class="link-btn" data-act="back">Paste again</button>')}
      <div class="import-cards" data-cards aria-live="polite"></div>
      <div data-missing></div>
      <div class="import-table-wrap" tabindex="0" role="region" aria-label="Page 1 books">
        <table class="import-table">
          <thead>
            <tr>
              <th scope="col" class="use-col">USE</th>
              <th scope="col">BOOK</th>
              <th scope="col" class="num-col">BSR</th>
              <th scope="col" class="num-col">REVIEWS</th>
              <th scope="col" class="num-col">RATING</th>
              <th scope="col">COUNTS AS</th>
            </tr>
          </thead>
          <tbody>${state.books.map(row).join('')}</tbody>
        </table>
      </div>
      <div data-msg></div>
      <div class="dialog-foot">
        <button type="button" class="btn btn-secondary" data-act="back">Back</button>
        <button type="button" class="btn btn-primary" data-act="save">Save counts to topic</button>
      </div>`;
    renderCounts();
    body.querySelector('#impTitle').focus();
  }

  function numCell(b, i, field) {
    const missing = field === 'bsr' ? b.bsrMissing : b.reviewsMissing;
    const v = b[field];
    if (!missing) return `<td class="num-col">${fmt(v)}</td>`;
    const label = `${field === 'bsr' ? 'BSR' : 'Reviews'} for “${b.title}”`;
    return `<td class="num-col"><input class="text-input import-num" type="text" inputmode="numeric" autocomplete="off"
      data-num="${field}" data-i="${i}" placeholder="Not in page" aria-label="${esc(label)}" value="${v === null ? '' : v}" /></td>`;
  }

  function row(b, i) {
    return `
      <tr data-row="${i}" class="${b.included ? '' : 'is-off'}">
        <td class="use-col"><label class="import-use"><input type="checkbox" data-use="${i}"${b.included ? ' checked' : ''}
          aria-label="${esc(`Use “${b.title}”`)}" /></label></td>
        <td class="book-col">
          <span class="import-book title-clamp" title="${esc(b.title)}">${esc(b.title)}</span>
          <span class="import-author">${b.author ? esc(b.author) : 'Author not in page'}${b.sponsored ? ' <span class="tag">Sponsored</span>' : ''}</span>
        </td>
        ${numCell(b, i, 'bsr')}
        ${numCell(b, i, 'reviews')}
        <td class="num-col">${b.rating === null ? '—' : b.rating.toFixed(1)}</td>
        <td data-as>${asText(b)}</td>
      </tr>`;
  }

  function asText(b) {
    if (!b.included) return '<span class="muted-text">Not used</span>';
    const as = countsAs(b);
    if (as.length) return as.map((k) => `<span class="tag">${TAGS[k]}</span>`).join(' ');
    if (b.bsr === null || b.reviews === null) return '<span class="muted-text">Not counted</span>';
    return '<span class="muted-text">—</span>';
  }

  function renderCounts() {
    const counts = bookCounts(state.books);
    const cs = checks(counts);
    const data = countData(state.books);
    body.querySelector('[data-cards]').innerHTML = KEYS.map((k) => {
      const c = cs.find((x) => x.key === k);
      // With no data for a count, 0 would read as a pass. Show no result instead.
      const badge = !data[k]
        ? '<span class="check-badge todo">No data</span>'
        : c.pass
        ? `<span class="check-badge pass">${ICON.check()}Pass</span>`
        : `<span class="check-badge fail">${ICON.x()}Fail</span>`;
      return `
        <div class="import-card">
          <div class="import-card-top"><span class="import-card-name">${NAMES[k]}</span>${badge}</div>
          <span class="import-card-num">${counts[`${k}_count`]}</span>
          <span class="check-hint">${RULE_TEXT[k]}</span>
        </div>`;
    }).join('');

    const missing = state.books.filter((b) => b.included && (b.bsr === null || b.reviews === null)).length;
    const anyBsr = state.books.some((b) => !b.bsrMissing);
    body.querySelector('[data-missing]').innerHTML = missing && anyBsr
      ? `<div class="alert alert-warning">${ICON.warn(18)}<div><p class="alert-text">${missing} book${missing === 1 ? ' is' : 's are'} missing a BSR or a review count. They show “Not in page”. Without a BSR, a book can still count as authority, but not as winning or low-traction. Type the missing number to count ${missing === 1 ? 'it' : 'them'} fully.</p></div></div>`
      : '';
  }

  function refreshRow(i) {
    const b = state.books[i];
    const tr = body.querySelector(`[data-row="${i}"]`);
    tr.classList.toggle('is-off', !b.included);
    tr.querySelector('[data-as]').innerHTML = asText(b);
    renderCounts();
  }

  /** '' → null. A whole number in range, else undefined (invalid). */
  function readNum(input, max, min) {
    const raw = input.value.replace(/[,\s]/g, '');
    if (raw === '') return null;
    if (!/^\d+$/.test(raw)) return undefined;
    const n = Number(raw);
    return n >= min && n <= max ? n : undefined;
  }

  /* ── Step 3: confirm replace ─────────────── */

  function hasCounts(t) {
    return KEYS.some((k) => t[`${k}_count`] !== null && t[`${k}_count`] !== undefined);
  }

  function renderConfirm() {
    const t = opts.getTopic();
    const counts = bookCounts(state.books);
    const set = (k) => t[`${k}_count`] !== null && t[`${k}_count`] !== undefined;
    const imported = KEYS.filter((k) => set(k) && t[`${k}_source`] !== 'manual');
    const manual = KEYS.filter((k) => set(k) && t[`${k}_source`] === 'manual');
    const line = (k, to) => `<li><strong>${NAMES[k]}</strong>: ${t[`${k}_count`]} → ${to}</li>`;

    body.innerHTML = `
      ${head('Replace the counts?', 'This topic already has market check counts. The saved page 1 books are replaced.')}
      ${imported.length ? `
        <div class="import-confirm-block">
          <p class="import-confirm-label">Imported counts are replaced:</p>
          <ul class="import-confirm-list">${imported.map((k) => line(k, counts[`${k}_count`])).join('')}</ul>
        </div>` : ''}
      ${manual.length ? `
        <div class="import-confirm-block">
          <p class="import-confirm-label">You typed these counts yourself. They stay as they are:</p>
          <ul class="import-confirm-list">${manual.map((k) => `<li><strong>${NAMES[k]}</strong>: ${t[`${k}_count`]} <span class="muted-text">(${esc(sourceText(t, k))})</span></li>`).join('')}</ul>
          <label class="import-check">
            <input type="checkbox" data-replace-manual${state.replaceManual ? ' checked' : ''} />
            <span>Also replace my manual counts</span>
          </label>
          <p class="field-hint" data-manual-hint></p>
        </div>` : ''}
      <div data-msg></div>
      <div class="dialog-foot">
        <button type="button" class="btn btn-secondary" data-act="review">Back</button>
        <button type="button" class="btn btn-primary" data-act="commit">Save counts</button>
      </div>`;
    manualHint();
    body.querySelector('#impTitle').focus();
  }

  function manualHint() {
    const el = body.querySelector('[data-manual-hint]');
    if (!el) return;
    const t = opts.getTopic();
    const counts = bookCounts(state.books);
    const manual = KEYS.filter((k) => t[`${k}_source`] === 'manual' && t[`${k}_count`] !== null);
    el.textContent = state.replaceManual
      ? `New values: ${manual.map((k) => `${NAMES[k]} ${counts[`${k}_count`]}`).join(', ')}.`
      : '';
    el.hidden = !state.replaceManual;
  }

  /* ── Save ────────────────────────────────── */

  async function save() {
    if (busy) return;
    const t = opts.getTopic();
    // Winning and low-traction need data, or a 0 would be saved as a pass.
    if (state.step === 'review' && !countData(state.books).dead) {
      body.querySelector('[data-msg]').innerHTML = alertBox('error', 'Winning and low-traction books can’t be counted yet. Use at least one book that has a BSR and a review count, or type the missing numbers.');
      body.querySelector('[data-act="save"]').focus();
      return;
    }
    if (state.step === 'review' && hasCounts(t)) {
      state.step = 'confirm';
      renderConfirm();
      return;
    }

    busy = true;
    const btn = body.querySelector('[data-act="commit"], [data-act="save"]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Saving…';
    const msg = body.querySelector('[data-msg]');
    msg.innerHTML = '';

    const done = (html) => {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label;
      msg.innerHTML = html;
      btn.focus();
    };

    // Pending autosave first, so the counts we keep or replace are the saved ones.
    if (!(await opts.beforeSave())) {
      done(alertBox('error', 'Your last change on this page is not saved yet. Close this, use Retry next to “Couldn’t save”, then save the import.'));
      return;
    }

    const books = state.books.map((b) => ({
      title: b.title, author: b.author, bsr: b.bsr, reviews: b.reviews,
      rating: b.rating, sponsored: b.sponsored, included: b.included
    }));
    let res;
    try { res = await kdp.saveTopicImport(state.topicId, books, state.replaceManual); } catch (err) { res = { error: err }; }

    if (res.error || !res.data) {
      const code = res.error && res.error.code;
      if (code === 'P0002') done(alertBox('error', 'This topic no longer exists. Go back to Topic Lab to see your topics.'));
      else if (code === '22023') done(alertBox('error', 'Some book data is not valid. Check the numbers, then try again. Nothing was saved.'));
      else done(alertBox('error', 'We couldn’t save. Check your connection, then try again. Nothing was saved.'));
      return;
    }

    busy = false;
    const saved = books.map((b, i) => ({ ...b, position: i + 1, created_at: new Date().toISOString() }));
    const topicId = state.topicId;
    state = fresh(topicId);
    d.close();
    opts.onSaved(res.data, saved);
  }

  /* ── Events ──────────────────────────────── */

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'close') close();
    else if (act === 'analyze') analyze();
    else if (act === 'back') { state.step = 'paste'; renderPaste(); }
    else if (act === 'review') { state.step = 'review'; renderReview(); }
    else if (act === 'save' || act === 'commit') save();
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'impText') {
      updateCount();
      pasteError('');
      return;
    }
    if (t.matches('[data-num]')) {
      const i = Number(t.dataset.i);
      const field = t.dataset.num;
      const v = field === 'bsr' ? readNum(t, MAX_BSR, 1) : readNum(t, MAX_REVIEWS, 0);
      if (v === undefined) {
        t.setAttribute('aria-invalid', 'true');
        state.books[i][field] = null;
      } else {
        t.removeAttribute('aria-invalid');
        state.books[i][field] = v;
      }
      refreshRow(i);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-use]')) {
      const i = Number(t.dataset.use);
      state.books[i].included = t.checked;
      refreshRow(i);
    } else if (t.matches('[data-replace-manual]')) {
      state.replaceManual = t.checked;
      manualHint();
    }
  }

  /* ── Open ────────────────────────────────── */

  const fresh = (topicId) => ({ topicId, step: 'paste', text: '', books: [], replaceManual: false });

  /**
   * getTopic(): the topic as shown (id, name, counts, sources).
   * beforeSave(): resolves true when the page has nothing unsaved.
   * onSaved(row, books): the saved topic row and page-1 books.
   * A review that was not saved is still there when the dialog opens again.
   */
  function open(o) {
    opts = o;
    if (!d) build();
    const topic = o.getTopic();
    if (!state || state.topicId !== topic.id) state = fresh(topic.id);
    busy = false;
    if (state.step === 'confirm') state.step = 'review';
    d.showModal();
    if (state.step === 'review') renderReview(); else renderPaste();
  }

  window.kdpTopicImport = { open };
})();
