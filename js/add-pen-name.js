/* ═══════════════════════════════════════════════════
   KDP Lab — Add pen name dialog (same rules as Add topic, design 10)
   /js/add-pen-name.js

   Load AFTER js/supabase.js and js/pen-name-common.js on pages in app/.
   Any element with [data-add-pen] opens it, or call kdpAddPen.open().
   "Add pen name" creates it and opens its detail page.
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, MAX_NAME, MAX_NICHE, nameError } = kdpPens;

  let dialog, els, opener = null, busy = false;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'dialog dialog-sm';
    dialog.setAttribute('aria-labelledby', 'apTitle');
    dialog.setAttribute('aria-describedby', 'apDesc');
    dialog.innerHTML = `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="apTitle">Add a pen name</h2>
            <p id="apDesc">The author name on the cover. You add bio facts and a voice next.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="field">
          <label for="apName">Pen name</label>
          <input class="text-input" id="apName" type="text" autocomplete="off" aria-describedby="apName-error" />
          <span class="field-error" id="apName-error" hidden></span>
        </div>
        <div class="field">
          <label for="apNiche">Niche focus (optional)</label>
          <input class="text-input" id="apNiche" type="text" autocomplete="off" maxlength="${MAX_NICHE}" placeholder="Example: Health and movement after 50" />
        </div>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary" data-add>Add pen name</button>
        </div>
      </form>`;
    document.body.append(dialog);

    els = {
      form: dialog.querySelector('form'),
      name: dialog.querySelector('#apName'),
      nameError: dialog.querySelector('#apName-error'),
      niche: dialog.querySelector('#apNiche'),
      error: dialog.querySelector('[data-error]'),
      add: dialog.querySelector('[data-add]')
    };

    dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    // Esc closes (native "cancel"), unless a request is running.
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // Backdrop click closes only when nothing has been typed.
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && !els.name.value.trim() && !els.niche.value.trim()) close();
    });
    dialog.addEventListener('keydown', trapFocus);
    dialog.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
    els.name.addEventListener('input', () => { setNameError(''); els.error.hidden = true; });
    els.form.addEventListener('submit', onSubmit);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const list = [...dialog.querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null);
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
    els.add.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Adding…' : 'Add pen name';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    els.error.hidden = true;
    setNameError('');
    const name = els.name.value.trim();
    const msg = nameError(name);
    if (msg) { setNameError(msg); els.name.focus(); return; }
    const niche = els.niche.value.trim();

    setBusy(true);
    let res;
    try { res = await kdp.createPenName(name, niche); } catch (err) { res = { error: err }; }
    if (!res.error && res.data) {
      location.href = `pen-name.html?id=${encodeURIComponent(res.data.id)}`;
      return;
    }
    setBusy(false);
    if (res.error && res.error.code === '23514') { setNameError(`Use 1 to ${MAX_NAME} characters.`); els.name.focus(); return; }
    showError("We couldn't add the pen name. Check your connection, then try again.");
    els.add.focus();
  }

  function open() {
    if (!dialog) build();
    opener = document.activeElement;
    setBusy(false);
    els.form.reset();
    setNameError('');
    els.error.hidden = true;
    dialog.showModal();
    els.name.focus();
  }

  function close() {
    if (busy || !dialog || !dialog.open) return;
    dialog.close();
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-add-pen]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  window.kdpAddPen = { open };
})();
