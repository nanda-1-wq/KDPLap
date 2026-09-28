/* ═══════════════════════════════════════════════════
   KDP Lab — Pen Names list (design 11)
   /js/pen-names.js

   Load AFTER supabase.js, shell.js, new-book.js, pen-name-common.js,
   add-pen-name.js, pen-name-actions.js.
═══════════════════════════════════════════════════ */

(async function () {
  const { ICON, esc, voiceSummary, bioReady, initial, bioBadge, defaultChip } = kdpPens;

  const view = document.getElementById('view');
  const notice = document.getElementById('notice');
  const addBtn = document.getElementById('addPenBtn');
  addBtn.innerHTML = `${ICON.plus}New pen name`;

  let pens = [];
  let defaultId = null;

  const penHref = (id) => `pen-name.html?id=${encodeURIComponent(id)}`;
  const bookCount = (p) => (p.books && p.books[0] && p.books[0].count) || 0;
  const sortPens = () => pens.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  /* ── Notice (also carries "Deleted …" over from the detail page) ── */

  let noticeTimer = null;
  function showNotice(text) {
    notice.innerHTML = ICON.check(16);
    notice.append(text);
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000);
  }
  try {
    const carried = sessionStorage.getItem('kdp.notice');
    if (carried) { sessionStorage.removeItem('kdp.notice'); showNotice(carried); }
  } catch (e) { /* storage blocked: no notice */ }

  /* ── Rendering ───────────────────────────── */

  function cardHtml(p) {
    const n = bookCount(p);
    const voice = voiceSummary(p.voice);
    const isDefault = p.id === defaultId;
    return `
      <article class="pen-card">
        <div class="pen-card-head">
          <div class="pen-avatar${bioReady(p) ? '' : ' is-missing'}" aria-hidden="true">${esc(initial(p.name))}</div>
          <div class="pen-card-id">
            <h2 class="pen-card-name"><a href="${penHref(p.id)}">${esc(p.name)}</a></h2>
            <span class="pen-niche${p.niche ? '' : ' none'}">${esc(p.niche || 'Niche not set')}</span>
          </div>
        </div>
        <div class="pen-voice-block">
          <span class="chip-label">VOICE</span>
          <p class="pen-voice${voice ? '' : ' none'}">${esc(voice || 'No voice profile yet')}</p>
        </div>
        <div class="pen-foot">
          <span>${n} book${n === 1 ? '' : 's'}</span>
          <span class="pen-foot-tags">${isDefault ? defaultChip : ''}${bioBadge(p)}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="icon-btn card-menu-btn" data-pen-menu="${esc(p.id)}"
            aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(p.name)}">${ICON.more}</button>
        </div>
      </article>`;
  }

  function renderList() {
    kdpPenActions.closeMenu(false);
    addBtn.hidden = false;
    view.innerHTML = `<div class="pen-grid">${pens.map(cardHtml).join('')}</div>`;
  }

  function renderLoading() {
    addBtn.hidden = true;
    const card = `<div class="pen-card" aria-hidden="true">
        <div class="pen-card-head"><div class="pen-avatar skel"></div><div class="pen-card-id skel-grow"><div class="skel skel-title"></div><div class="skel skel-line skel-w40"></div></div></div>
        <div class="skel skel-line skel-w30"></div><div class="skel skel-line"></div>
        <div class="pen-foot"><div class="skel skel-line skel-w30"></div><div class="skel skel-pill-sm"></div></div>
      </div>`;
    view.innerHTML = `<p class="sr-only" role="status">Loading your pen names…</p><div class="pen-grid">${card}${card}${card}</div>`;
  }

  function renderEmpty() {
    addBtn.hidden = true;
    view.innerHTML = `
      <div class="center-state">
        <div class="state-box">
          <div class="state-icon" aria-hidden="true">${kdpShell.icon('pens', 26)}</div>
          <h2>No pen names yet</h2>
          <p>A pen name is the author on the cover. Add one with a few real facts for the bio and a voice for your chapters.</p>
          <div class="state-actions">
            <button type="button" class="btn btn-primary" data-add-pen>${ICON.plus}New pen name</button>
          </div>
        </div>
      </div>`;
  }

  function renderError() {
    addBtn.hidden = true;
    view.innerHTML = `
      <div class="center-state">
        <div class="state-box" role="alert">
          <div class="state-icon danger" aria-hidden="true">${ICON.warn(26)}</div>
          <h2>We couldn't load your pen names</h2>
          <p>Check your connection, then try again.</p>
          <div class="state-actions">
            <button type="button" class="btn btn-primary" id="retryBtn">Retry</button>
          </div>
        </div>
      </div>`;
    document.getElementById('retryBtn').addEventListener('click', load);
  }

  /* ── Data ────────────────────────────────── */

  async function load() {
    renderLoading();
    let list, def;
    try {
      [list, def] = await Promise.all([kdp.listPenNames(), kdp.getDefaultPenNameId()]);
    } catch (e) { list = { error: e }; }
    if (list.error || (def && def.error)) { renderError(); return; }
    pens = list.data || [];
    defaultId = def.data;
    if (!pens.length) { renderEmpty(); return; }
    sortPens();
    renderList();
  }

  kdpPenActions.init({
    getPen(id) {
      const p = pens.find((x) => x.id === id);
      return p ? { name: p.name, isDefault: p.id === defaultId } : null;
    },
    onRenamed(id, row) {
      const p = pens.find((x) => x.id === id);
      if (!p) return;
      p.name = row.name;
      p.updated_at = row.updated_at;
      sortPens();
      renderList();
    },
    onDeleted(id, info) {
      pens = pens.filter((x) => x.id !== id);
      if (info.wasDefault) defaultId = null;
      if (pens.length) renderList(); else renderEmpty();
      showNotice(info.wasDefault
        ? `Deleted “${info.name}”. New books now start with no pen name.`
        : `Deleted “${info.name}”.`);
      const next = pens.length ? addBtn : view.querySelector('[data-add-pen]');
      if (next) next.focus();
    }
  });

  /* ── Start ───────────────────────────────── */

  const user = await kdpShell.init({ active: 'pens' });
  if (!user) return;
  load();
})();
