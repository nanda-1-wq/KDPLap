/* ═══════════════════════════════════════════════════
   KDP Lab — Add topic dialog (design 10)
   /js/add-topic.js

   Load AFTER js/supabase.js and js/topics.js on pages in app/.
   Any element with [data-add-topic] opens it, or call:
     kdpAddTopic.open({ notes: 'Narrower version of: …' })
   "Add and score" creates the topic and opens its detail page.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, MAX_NAME } = kdpTopics;
  const MAX_NOTES = 5000;

  let dialog, els, opener = null, busy = false;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'dialog dialog-sm';
    dialog.setAttribute('aria-labelledby', 'atTitle');
    dialog.setAttribute('aria-describedby', 'atDesc');
    dialog.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="atTitle">Add a topic</h2>
            <p id="atDesc">Write it as one problem for one reader. You score it next.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="field">
          <label for="atName">Topic</label>
          <span class="field-hint" id="atName-hint">Example: "Chair yoga for seniors with limited mobility", not "Yoga"</span>
          <input class="text-input" id="atName" type="text" autocomplete="off" aria-describedby="atName-hint atName-error" />
          <span class="field-error" id="atName-error" hidden></span>
        </div>
        <div class="field">
          <label for="atNotes">Notes (optional)</label>
          <textarea class="text-area" id="atNotes" rows="3" maxlength="${MAX_NOTES}" placeholder="Where the idea came from, reader questions you noticed"></textarea>
        </div>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" data-add>Add and score</button>
        </div>
      </form>`;
    document.body.append(dialog);

    els = {
      form: dialog.querySelector('form'),
      name: dialog.querySelector('#atName'),
      nameError: dialog.querySelector('#atName-error'),
      notes: dialog.querySelector('#atNotes'),
      error: dialog.querySelector('[data-error]'),
      add: dialog.querySelector('[data-add]')
    };

    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    // Esc closes (native "cancel"), unless a request is running.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // Backdrop click closes only when nothing has been typed.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && !els.name.value.trim() && !els.notes.value.trim()) close();
    });
    dialog.addEventListener('keydown', trapFocus);
    dialog.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
    els.name.addEventListener('input', () => { setNameError(''); els.error.hidden = true; });
    els.form.addEventListener('submit', onSubmit);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const list = [...dialog.querySelectorAll('button, input, textarea')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function setNameError(msg) {
    if (msg) {
      els.name.setAttribute('aria-invalid', 'true');
      els.nameError.innerHTML = ICON.x();
      els.nameError.append(msg);
      els.nameError.hidden = false;
    } else {
      els.name.removeAttribute('aria-invalid');
      els.nameError.hidden = true;
    }
  }

  function showError(msg) {
    els.error.innerHTML = ICON.warn(18);
    const d = document.createElement('div');
    d.textContent = msg;
    els.error.append(d);
    els.error.hidden = false;
  }

  function setBusy(on) {
    busy = on;
    els.add.disabled = on;
    els.add.setAttribute('aria-busy', String(on));
    els.add.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Adding…' : 'Add and score';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    els.error.hidden = true;
    setNameError('');
    const name = els.name.value.trim();
    if (!name) { setNameError('Enter a topic.'); els.name.focus(); return; }
    if (name.length > MAX_NAME) { setNameError(`Use ${MAX_NAME} characters or fewer. This one has ${name.length}.`); els.name.focus(); return; }
    const notes = els.notes.value.trim();

    setBusy(true);
    let res;
    try { res = await kdp.createTopic(name, notes); } catch (err) { res = { error: err }; }
    if (!res.error && res.data) {
      location.href = `topic.html?id=${encodeURIComponent(res.data.id)}`;
      return;
    }
    setBusy(false);
    if (res.error && res.error.code === '23514') { setNameError(`Use 1 to ${MAX_NAME} characters.`); els.name.focus(); return; }
    showError("We couldn't add the topic. Check your connection, then try again.");
    els.add.focus();
  }

  function open(o = {}) {
    if (!dialog) build();
    opener = document.activeElement;
    setBusy(false);
    els.form.reset();
    setNameError('');
    els.error.hidden = true;
    els.notes.value = o.notes || '';
    dialog.showModal();
    els.name.focus();
  }

  function close() {
    if (busy || !dialog || !dialog.open) return;
    dialog.close();
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-add-topic]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  window.kdpAddTopic = { open };
})();
