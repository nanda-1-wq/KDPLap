/* ═══════════════════════════════════════════════════
   KDP Lab — Pen name ⋯ menu, Rename and Delete
   /js/pen-name-actions.js

   Load AFTER js/supabase.js and js/pen-name-common.js. The page calls
     kdpPenActions.init({ getPen, onRenamed, onDeleted })
   and renders a menu button (outside any link):
     <button data-pen-menu="<pen name id>" aria-haspopup="menu" aria-expanded="false">
   getPen(id)            → { name, isDefault } or null
   onRenamed(id, row)    → row = { id, name, updated_at }
   onDeleted(id, info)   → info = { name, wasDefault }

   Delete: books.pen_name_id is "on delete restrict", so the database refuses
   while a book uses the pen name (23503). The dialog checks first, lists the
   books, and treats a refusal calmly. A deleted default is cleared by the
   database ("on delete set null").
═══════════════════════════════════════════════════ */

(function () {
  const { ICON, esc } = kdpUi;
  const { MAX_NAME, nameError, bookTitle } = kdpPens;

  let opts = null;

  const menuButton = (id) => document.querySelector(`[data-pen-menu="${CSS.escape(id)}"]`);
  const penOf = (id) => opts.getPen(id) || { name: 'this pen name', isDefault: false };
  const bookHref = (id) => `book.html?id=${encodeURIComponent(id)}`;

  /* ── Menu ───────────────────────────────────── */

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.id = 'penMenu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  let menuBtn = null;

  const menuItems = () => [...menu.querySelectorAll('[role="menuitem"]')];

  function openMenu(btn, focusLast) {
    if (menuBtn) closeMenu(false);
    const id = btn.dataset.penMenu;
    menuBtn = btn;
    menu.dataset.penId = id;
    menu.setAttribute('aria-label', `Actions for ${penOf(id).name}`);
    menu.innerHTML = `
      <button type="button" class="menu-item" role="menuitem" tabindex="-1" data-action="rename">${ICON.rename}Rename</button>
      <div class="menu-sep" role="separator"></div>
      <button type="button" class="menu-item danger" role="menuitem" tabindex="-1" data-action="delete">${ICON.trash()}Delete</button>`;
    btn.after(menu);
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', menu.id);
    const items = menuItems();
    (focusLast ? items[items.length - 1] : items[0]).focus();
  }

  function closeMenu(returnFocus) {
    if (!menuBtn) return;
    const btn = menuBtn;
    menuBtn = null;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-controls');
    if (returnFocus && btn.isConnected) btn.focus();
  }

  function moveFocus(step) {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    items[(i + step + items.length) % items.length].focus();
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pen-menu]');
    if (btn) {
      // Never let a menu click reach the card link.
      e.preventDefault();
      e.stopPropagation();
      if (menuBtn === btn) closeMenu(true);
      else openMenu(btn, false);
      return;
    }
    const action = e.target.closest('#penMenu [data-action]');
    if (action) {
      const id = menu.dataset.penId;
      const opener = menuBtn;
      closeMenu(false);
      if (action.dataset.action === 'rename') openRename(id, opener);
      else openDelete(id, opener);
      return;
    }
    if (menuBtn && !menu.contains(e.target)) closeMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest && e.target.closest('[data-pen-menu]');
    if (btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openMenu(btn, e.key === 'ArrowUp');
      return;
    }
    if (!menuBtn || !menu.contains(e.target)) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(-1); break;
      case 'Home': e.preventDefault(); menuItems()[0].focus(); break;
      case 'End': e.preventDefault(); menuItems().slice(-1)[0].focus(); break;
      case 'Escape': e.preventDefault(); closeMenu(true); break;
      case 'Tab': closeMenu(true); break;
    }
  });

  /* ── Shared dialog parts ────────────────────── */

  function makeDialog(labelId, html) {
    const d = document.createElement('dialog');
    d.className = 'dialog dialog-sm';
    d.setAttribute('aria-labelledby', labelId);
    d.innerHTML = html;
    document.body.append(d);
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const list = [...d.querySelectorAll('button, input, a[href]')].filter((el) => !el.disabled && el.offsetParent !== null);
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

  function returnFocus(id, opener) {
    const target = (opener && opener.isConnected) ? opener : menuButton(id);
    if (target) target.focus();
  }

  function setFieldError(input, errEl, msg) {
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      errEl.innerHTML = ICON.x();
      errEl.append(msg);
      errEl.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      errEl.hidden = true;
    }
  }

  /* ── Rename ─────────────────────────────────── */

  let rn = null;

  function buildRename() {
    const d = makeDialog('pnRnTitle', `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="pnRnTitle">Rename pen name</h2>
            <p>The new name shows on every book that uses it.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="field">
          <label for="pnRnInput">Pen name</label>
          <input class="text-input" id="pnRnInput" type="text" autocomplete="off" aria-describedby="pnRnInput-error" />
          <span class="field-error" id="pnRnInput-error" hidden></span>
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
      input: d.querySelector('#pnRnInput'),
      fieldError: d.querySelector('#pnRnInput-error'),
      error: d.querySelector('[data-error]'),
      save: d.querySelector('[data-save]'),
      id: null, opener: null, busy: false
    };
    const close = () => { if (!rn.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => returnFocus(rn.id, rn.opener));
    rn.input.addEventListener('input', () => { setFieldError(rn.input, rn.fieldError, ''); rn.error.hidden = true; });
    rn.form.addEventListener('submit', onRename);
  }

  function openRename(id, opener) {
    if (!rn) buildRename();
    rn.id = id;
    rn.opener = opener;
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');
    setFieldError(rn.input, rn.fieldError, '');
    rn.error.hidden = true;
    rn.input.value = penOf(id).name;
    rn.d.showModal();
    rn.input.focus();
    rn.input.select();
  }

  async function onRename(e) {
    e.preventDefault();
    if (rn.busy) return;
    rn.error.hidden = true;
    const name = rn.input.value.trim();
    const msg = nameError(name);
    if (msg) { setFieldError(rn.input, rn.fieldError, msg); rn.input.focus(); return; }
    if (name === penOf(rn.id).name) { rn.d.close(); return; }

    rn.busy = true;
    setBusy(rn.save, true, 'Saving…', 'Save');
    let res;
    try { res = await kdp.updatePenName(rn.id, { name }); } catch (err) { res = { error: err }; }
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');

    if (!res.error) {
      opts.onRenamed(rn.id, res.data);
      rn.d.close();
      return;
    }
    if (res.error.code === '23514') setFieldError(rn.input, rn.fieldError, `Use 1 to ${MAX_NAME} characters.`);
    else if (res.error.notFound) showAlert(rn.error, 'This pen name no longer exists. Reload the page to see your pen names.');
    else showAlert(rn.error, "We couldn't rename the pen name. Check your connection, then try again.");
    rn.input.focus();
  }

  /* ── Delete ─────────────────────────────────── */

  let del = null;

  function buildDelete() {
    const d = makeDialog('pnDelTitle', `
      <form class="dialog-inner" novalidate>
        <div class="delete-head">
          <span class="delete-icon" data-icon>${ICON.trash(20)}</span>
          <h2 id="pnDelTitle"></h2>
        </div>
        <div class="alert alert-warning" data-refused hidden></div>
        <p class="delete-text" id="pnDelDesc"></p>
        <ul class="pen-book-list" data-books hidden></ul>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="button" class="btn btn-secondary" data-retry hidden>Retry</button>
          <button type="submit" class="btn btn-danger" data-delete>Delete pen name</button>
        </div>
      </form>`);
    d.setAttribute('aria-describedby', 'pnDelDesc');
    del = {
      d,
      form: d.querySelector('form'),
      icon: d.querySelector('[data-icon]'),
      title: d.querySelector('#pnDelTitle'),
      refused: d.querySelector('[data-refused]'),
      text: d.querySelector('#pnDelDesc'),
      books: d.querySelector('[data-books]'),
      error: d.querySelector('[data-error]'),
      cancel: d.querySelector('[data-close]'),
      retry: d.querySelector('[data-retry]'),
      btn: d.querySelector('[data-delete]'),
      id: null, opener: null, busy: false, load: 0
    };
    const close = () => { if (!del.busy) d.close(); };
    del.cancel.addEventListener('click', close);
    del.retry.addEventListener('click', () => checkBooks());
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { if (e.target === d) close(); });
    d.addEventListener('close', () => { del.load++; returnFocus(del.id, del.opener); });
    del.form.addEventListener('submit', onDelete);
  }

  /** Dialog states: 'checking', 'error', 'in-use', 'ready'. */
  function setDeleteState(state, books) {
    const pen = penOf(del.id);
    del.state = state;
    del.error.hidden = true;
    del.books.hidden = true;
    del.retry.hidden = state !== 'error';
    del.btn.hidden = state === 'in-use' || state === 'error';
    setBusy(del.btn, false, 'Deleting…', 'Delete pen name');
    del.btn.disabled = state !== 'ready';
    del.cancel.textContent = state === 'in-use' ? 'Close' : 'Cancel';
    del.icon.classList.toggle('neutral', state === 'in-use');
    del.icon.innerHTML = state === 'in-use' ? ICON.warn(20) : ICON.trash(20);

    if (state === 'checking') {
      del.title.textContent = `Delete “${pen.name}”?`;
      del.text.innerHTML = '<span class="spinner inline" aria-hidden="true"></span>Checking which books use this pen name…';
      return;
    }
    if (state === 'error') {
      del.title.textContent = `Delete “${pen.name}”?`;
      del.text.textContent = '';
      showAlert(del.error, "We couldn't check which books use this pen name. Check your connection, then try again.");
      return;
    }
    if (state === 'in-use') {
      const n = books.length;
      del.title.textContent = `“${pen.name}” is used by ${n} book${n === 1 ? '' : 's'}`;
      del.text.textContent = `A pen name can't be deleted while books use it. To delete it, first delete ${n === 1 ? 'this book' : 'these books'}. Changing a book's pen name comes with the Brief step.`;
      del.books.innerHTML = books.map((b) => {
        const t = bookTitle(b);
        return `<li><a href="${bookHref(b.id)}">${esc(t || 'Untitled book')}</a></li>`;
      }).join('');
      del.books.hidden = false;
      return;
    }
    // ready
    del.title.textContent = `Delete “${pen.name}”?`;
    del.text.textContent = 'No books use it. Its bio facts, bio, and voice profile will be deleted. ';
    if (pen.isDefault) del.text.append('It is your default for new books, so deleting it clears the default. ');
    const strong = document.createElement('strong');
    strong.textContent = 'This cannot be undone.';
    del.text.append(strong);
  }

  async function checkBooks() {
    const load = ++del.load;
    setDeleteState('checking');
    let res;
    try { res = await kdp.listPenNameBooks(del.id); } catch (err) { res = { error: err }; }
    if (load !== del.load || !del.d.open) return;
    if (res.error) { setDeleteState('error'); del.retry.focus(); return; }
    const books = res.data || [];
    setDeleteState(books.length ? 'in-use' : 'ready', books);
    del.cancel.focus();
  }

  function openDelete(id, opener) {
    if (!del) buildDelete();
    del.id = id;
    del.opener = opener;
    del.busy = false;
    del.refused.hidden = true;
    del.d.showModal();
    del.cancel.focus();
    checkBooks();
  }

  async function onDelete(e) {
    e.preventDefault();
    if (del.busy || del.state !== 'ready') return;
    const pen = penOf(del.id);
    del.error.hidden = true;
    del.busy = true;
    setBusy(del.btn, true, 'Deleting…', 'Delete pen name');
    let res;
    try { res = await kdp.deletePenName(del.id); } catch (err) { res = { error: err }; }
    del.busy = false;
    setBusy(del.btn, false, 'Deleting…', 'Delete pen name');

    if (!res.error) {
      const id = del.id;
      del.opener = null;
      del.d.close();
      opts.onDeleted(id, { name: pen.name, wasDefault: pen.isDefault });
      return;
    }
    if (res.error.code === '23503') {
      // A book started using it since the check. The database kept it: show which books.
      showAlert(del.refused, 'A book started using this pen name, so it was not deleted.');
      await checkBooks();
      return;
    }
    if (res.error.notFound) showAlert(del.error, 'This pen name was already deleted, or it is not yours. Reload the page to see your pen names.');
    else showAlert(del.error, "We couldn't delete the pen name. Check your connection, then try again.");
    del.btn.focus();
  }

  function init(o) { opts = o; }

  window.kdpPenActions = { init, closeMenu };
})();
