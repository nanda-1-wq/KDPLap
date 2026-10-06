/* ═══════════════════════════════════════════════════
   KDP Lab — Book card menu, Rename and Delete (designs 06 and 07)
   /js/book-actions.js

   Load AFTER js/supabase.js and js/ui.js. The page calls kdpBookActions.init({...})
   and renders a menu button inside each card:
     <button data-book-menu="<book id>" aria-haspopup="menu" aria-expanded="false">
   The button must sit outside the card's link (no nested interactive elements).
═══════════════════════════════════════════════════ */

(function () {
  const MAX_TITLE = 200;
  const CONFIRM_WORD = 'DELETE';

  const svg = (size, stroke, body) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    open: svg(16, 2, '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    rename: svg(16, 2, '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>'),
    trash: (size) => svg(size, 2, '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    warn: svg(18, 2, '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>'),
    x: svg(13, 2.4, '<path d="M6 6l12 12M18 6L6 18"/>'),
    close: svg(20, 2, '<path d="M6 6l12 12M18 6L6 18"/>')
  };

  let opts = null;

  const { esc } = kdpUi;
  const menuButton = (id) => document.querySelector(`[data-book-menu="${CSS.escape(id)}"]`);
  const titleOf = (id) => opts.getTitle(id) || 'Untitled book';

  /* ── Card menu (design 07) ──────────────────── */

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.id = 'bookMenu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  let menuBtn = null;   // the ⋯ button of the open menu

  const menuItems = () => [...menu.querySelectorAll('[role="menuitem"]')];

  function openMenu(btn, focusLast) {
    if (menuBtn) closeMenu(false);
    const id = btn.dataset.bookMenu;
    menuBtn = btn;
    menu.dataset.bookId = id;
    menu.setAttribute('aria-label', `Actions for ${titleOf(id)}`);
    menu.innerHTML = `
      <a class="menu-item" role="menuitem" tabindex="-1" href="${esc(opts.bookHref(id))}">${ICON.open}Open</a>
      <button type="button" class="menu-item" role="menuitem" tabindex="-1" data-action="rename">${ICON.rename}Rename</button>
      <div class="menu-sep" role="separator"></div>
      <button type="button" class="menu-item danger" role="menuitem" tabindex="-1" data-action="delete">${ICON.trash(16)}Delete</button>`;
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
    const btn = e.target.closest('[data-book-menu]');
    if (btn) {
      // Never let a menu click reach the card link.
      e.preventDefault();
      e.stopPropagation();
      if (menuBtn === btn) closeMenu(true);
      else openMenu(btn, false);
      return;
    }
    const action = e.target.closest('.menu [data-action]');
    if (action) {
      const id = menu.dataset.bookId;
      const opener = menuBtn;
      closeMenu(false);
      if (action.dataset.action === 'rename') openRename(id, opener);
      else openDelete(id, opener);
      return;
    }
    // Click outside closes. Focus stays where the click put it.
    if (menuBtn && !menu.contains(e.target)) closeMenu(false);
  });

  document.addEventListener('keydown', (e) => {
    const btn = e.target.closest && e.target.closest('[data-book-menu]');
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
      // Tab leaves the menu: close it and let Tab move on from the ⋯ button.
      case 'Tab': closeMenu(true); break;
      // Space activates links too, like buttons.
      case ' ': e.preventDefault(); e.target.click(); break;
    }
  });

  /* ── Shared dialog parts ────────────────────── */

  function makeDialog(className, labelId, html) {
    const d = document.createElement('dialog');
    d.className = className;
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
    el.innerHTML = ICON.warn;
    const div = document.createElement('div');
    div.textContent = msg;
    el.append(div);
    el.hidden = false;
  }

  function setBusy(btn, on, busyLabel, label) {
    btn.disabled = on;
    btn.setAttribute('aria-busy', String(on));
    btn.innerHTML = on ? `<span class="spinner" aria-hidden="true"></span>${busyLabel}` : label;
  }

  /** Focus back on the book's ⋯ button, even if the card was re-rendered. */
  function returnFocus(id, opener) {
    const target = (opener && opener.isConnected) ? opener : menuButton(id);
    if (target) target.focus();
  }

  /* ── Rename ─────────────────────────────────── */

  let rn = null;

  function buildRename() {
    const d = makeDialog('dialog dialog-sm', 'rnTitle', `
      <form class="dialog-inner" novalidate>
        <div class="dialog-head">
          <div>
            <h2 id="rnTitle">Rename book</h2>
            <p>This is the working title. You can change it again in step 04.</p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="field">
          <label for="rnInput">Working title</label>
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
      fieldError: d.querySelector('#rnInput-error'),
      error: d.querySelector('[data-error]'),
      save: d.querySelector('[data-save]'),
      id: null, opener: null, busy: false
    };
    const close = () => { if (!rn.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('close', () => returnFocus(rn.id, rn.opener));
    rn.input.addEventListener('input', () => { setFieldError(''); rn.error.hidden = true; });
    rn.form.addEventListener('submit', onRename);
  }

  function setFieldError(msg) {
    if (msg) {
      rn.input.setAttribute('aria-invalid', 'true');
      rn.fieldError.innerHTML = ICON.x;
      rn.fieldError.append(msg);
      rn.fieldError.hidden = false;
    } else {
      rn.input.removeAttribute('aria-invalid');
      rn.fieldError.hidden = true;
    }
  }

  function openRename(id, opener) {
    if (!rn) buildRename();
    rn.id = id;
    rn.opener = opener;
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');
    setFieldError('');
    rn.error.hidden = true;
    rn.input.value = opts.getTitle(id) || '';
    rn.d.showModal();
    rn.input.focus();
    rn.input.select();
  }

  async function onRename(e) {
    e.preventDefault();
    if (rn.busy) return;
    rn.error.hidden = true;
    setFieldError('');
    const title = rn.input.value.trim();
    if (!title) { setFieldError('Enter a title for the book.'); rn.input.focus(); return; }
    if (title.length > MAX_TITLE) { setFieldError(`Use ${MAX_TITLE} characters or fewer. This one has ${title.length}.`); rn.input.focus(); return; }
    if (title === (opts.getTitle(rn.id) || '')) { rn.d.close(); return; }

    rn.busy = true;
    setBusy(rn.save, true, 'Saving…', 'Save');
    let res;
    try { res = await kdp.renameBook(rn.id, title); } catch (err) { res = { error: err }; }
    rn.busy = false;
    setBusy(rn.save, false, 'Saving…', 'Save');

    if (!res.error) {
      opts.onRenamed(rn.id, res.data);
      rn.d.close();
      return;
    }
    const err = res.error;
    if (err.code === '23514') setFieldError(`Use 1 to ${MAX_TITLE} characters.`);
    else if (err.notFound) showAlert(rn.error, 'This book no longer exists. Reload the page to see your books.');
    else showAlert(rn.error, "We couldn't rename the book. Check your connection, then try again.");
    // Save was disabled while busy, so focus may have left the dialog.
    rn.input.focus();
  }

  /* ── Delete (design 06) ─────────────────────── */

  let del = null;

  function buildDelete() {
    const d = makeDialog('dialog dialog-sm', 'delTitle', `
      <form class="dialog-inner" novalidate>
        <div class="delete-head">
          <span class="delete-icon">${ICON.trash(20)}</span>
          <h2 id="delTitle"></h2>
        </div>
        <div class="delete-text" id="delDesc" aria-live="polite"></div>
        <div class="field">
          <label for="delInput">Type ${CONFIRM_WORD} to confirm</label>
          <input class="text-input" id="delInput" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
        </div>
        <div class="alert alert-error" data-error role="alert" hidden></div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn btn-danger" data-delete disabled>Delete book</button>
        </div>
      </form>`);
    d.setAttribute('aria-describedby', 'delDesc');
    del = {
      d,
      form: d.querySelector('form'),
      title: d.querySelector('#delTitle'),
      text: d.querySelector('#delDesc'),
      input: d.querySelector('#delInput'),
      error: d.querySelector('[data-error]'),
      btn: d.querySelector('[data-delete]'),
      id: null, opener: null, busy: false, deleted: false, load: 0
    };
    const close = () => { if (!del.busy) d.close(); };
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { if (e.target === d && !del.input.value) close(); });
    // After a delete the page moves focus itself (the card is gone).
    d.addEventListener('close', () => { if (!del.deleted) returnFocus(del.id, del.opener); });
    del.input.addEventListener('input', syncConfirm);
    del.form.addEventListener('submit', onDelete);
  }

  function syncConfirm() {
    if (!del.busy) del.btn.disabled = del.input.value.trim() !== CONFIRM_WORD;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /**
   * Everything the delete removes, one line each. With counts, only the parts
   * that exist; without them (counts failed), every part with no numbers.
   */
  function deleteList(c) {
    if (!c) {
      return ['The Brief', 'Competitors', 'Research notes', 'Review insights', 'Positioning', 'Title ideas', 'Chapters and their versions'];
    }
    const lines = ['The Brief'];
    if (c.competitors) lines.push(plural(c.competitors, 'competitor'));
    if (c.research) lines.push(plural(c.research, 'research note'));
    if (c.insights) lines.push('Review insights');
    if (c.positioning) lines.push('Positioning');
    if (c.titles) lines.push(plural(c.titles, 'title idea'));
    if (c.chapters) lines.push(c.versions ? `${plural(c.chapters, 'chapter')} and ${plural(c.versions, 'version')}` : plural(c.chapters, 'chapter'));
    return lines;
  }

  function setText(lines) {
    const intro = document.createElement('p');
    intro.textContent = 'This deletes the book and:';
    const list = document.createElement('ul');
    list.className = 'delete-list';
    lines.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      list.append(li);
    });
    const kept = document.createElement('p');
    kept.textContent = 'Your topic and pen name are kept. ';
    const strong = document.createElement('strong');
    strong.textContent = 'This cannot be undone.';
    kept.append(strong);
    del.text.replaceChildren(intro, list, kept);
  }

  async function loadCounts(id) {
    const ticket = ++del.load;
    del.text.textContent = 'Checking what this book contains…';
    let res;
    try { res = await kdp.getBookCounts(id); } catch (err) { res = { error: err }; }
    if (ticket !== del.load || !del.d.open) return;
    setText(deleteList(res.error ? null : res.data));
  }

  function openDelete(id, opener) {
    if (!del) buildDelete();
    del.id = id;
    del.opener = opener;
    del.busy = false;
    del.deleted = false;
    del.title.textContent = `Delete "${titleOf(id)}"?`;
    del.input.value = '';
    del.error.hidden = true;
    setBusy(del.btn, false, 'Deleting…', 'Delete book');
    syncConfirm();
    del.d.showModal();
    del.input.focus();
    loadCounts(id);
  }

  async function onDelete(e) {
    e.preventDefault();
    if (del.busy || del.input.value.trim() !== CONFIRM_WORD) return;
    del.error.hidden = true;
    del.busy = true;
    del.input.readOnly = true;
    setBusy(del.btn, true, 'Deleting…', 'Delete book');
    let res;
    try { res = await kdp.deleteBook(del.id); } catch (err) { res = { error: err }; }
    del.busy = false;
    del.input.readOnly = false;
    setBusy(del.btn, false, 'Deleting…', 'Delete book');
    syncConfirm();

    if (!res.error) {
      const title = titleOf(del.id);
      del.deleted = true;
      del.d.close();
      opts.onDeleted(del.id, title);
      return;
    }
    if (res.error.notFound) showAlert(del.error, 'This book was already deleted, or it is not yours. Reload the page to see your books.');
    else showAlert(del.error, "We couldn't delete the book. Check your connection, then try again.");
    del.btn.focus();
  }

  /* ── Public ─────────────────────────────────── */

  window.kdpBookActions = {
    /**
     * getTitle(id)          working title shown in the menu and dialogs
     * bookHref(id)          link for "Open"
     * onRenamed(id, row)    row = { id, title, updated_at }
     * onDeleted(id, title)  the page removes the card and moves focus
     */
    init(o) { opts = o; },
    closeMenu
  };
})();
