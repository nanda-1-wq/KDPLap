/* ═══════════════════════════════════════════════════
   KDP Lab — Topic Lab list (design 08, row hover design 13)
   /js/topic-lab.js

   Load AFTER supabase.js, shell.js, new-book.js, topics.js, add-topic.js.
═══════════════════════════════════════════════════ */

(async function () {
  const { ICON, esc } = kdpUi;
  const { STATUS, statusBadge, isScored, dots, dayText, newestBookId } = kdpTopics;

  const view = document.getElementById('view');
  const notice = document.getElementById('notice');
  const addBtn = document.getElementById('addTopicBtn');
  addBtn.innerHTML = `${ICON.plus}Add topic`;

  // "All" leaves out archived topics; they have their own tab.
  const FILTERS = [
    ['all', 'All'], ['idea', 'Ideas'], ['researching', 'Researching'], ['validated', 'Validated'],
    ['book_started', 'Book started'], ['rejected', 'Rejected'], ['archived', 'Archived']
  ];

  let topics = [];
  let filter = 'all';
  let query = '';
  let els = null;   // toolbar and table parts while the list is shown

  const topicHref = (id) => `topic.html?id=${encodeURIComponent(id)}`;
  const bookHref = (id) => `book.html?id=${encodeURIComponent(id)}`;

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

  /* ── Rows ────────────────────────────────── */

  function nextAction(t) {
    const small = 'btn btn-sm';
    switch (t.status) {
      case 'idea': return `<a class="${small} btn-secondary" href="${topicHref(t.id)}">Score it</a>`;
      case 'researching': return `<a class="${small} btn-secondary" href="${topicHref(t.id)}">Continue</a>`;
      case 'validated': return `<button type="button" class="${small} btn-primary" data-start="${esc(t.id)}">Start book</button>`;
      case 'book_started': {
        const bookId = newestBookId(t);
        if (bookId) return `<a class="${small} btn-secondary" href="${bookHref(bookId)}">Open book</a>`;
        return `<a class="${small} btn-secondary" href="${topicHref(t.id)}">View</a>`;
      }
      default: return `<a class="${small} btn-secondary" href="${topicHref(t.id)}">View</a>`;
    }
  }

  function rowHtml(t) {
    const checksCell = !isScored(t)
      ? '<span class="muted-text">Not scored</span>'
      : `<span class="checks-cell">${dots(t.checks_passed, true)}<span>${t.checks_passed} of 5</span></span>`;
    return `
      <tr>
        <th scope="row"><a class="topic-link" href="${topicHref(t.id)}">${esc(t.name)}</a></th>
        <td>${statusBadge(t.status)}</td>
        <td>${checksCell}</td>
        <td class="num-cell">${t.excitement ? `${t.excitement} / 10` : '<span aria-label="Not set">—</span>'}</td>
        <td class="date-cell">${esc(dayText(t.updated_at))}</td>
        <td class="next-cell">${nextAction(t)}</td>
      </tr>`;
  }

  const inTab = (t, key) => (key === 'all' ? t.status !== 'archived' : t.status === key);
  const matches = (t) => inTab(t, filter) && (!query || t.name.toLowerCase().includes(query));

  /* ── Rendering ───────────────────────────── */

  function renderShell() {
    addBtn.hidden = false;
    view.innerHTML = `
      <div class="toolbar">
        <div class="tabs" role="group" aria-label="Filter topics by status" data-tabs></div>
        <label class="search">
          ${ICON.search}
          <input type="search" id="search" placeholder="Search topics" aria-label="Search topics" autocomplete="off" />
        </label>
      </div>
      <div class="alert alert-error" data-error role="alert" hidden></div>
      <div data-list></div>`;
    els = {
      tabs: view.querySelector('[data-tabs]'),
      search: view.querySelector('#search'),
      error: view.querySelector('[data-error]'),
      list: view.querySelector('[data-list]')
    };
    els.search.value = query;
    els.search.addEventListener('input', () => {
      query = els.search.value.trim().toLowerCase();
      renderList();
    });
  }

  function renderList() {
    const count = (key) => topics.filter((t) => inTab(t, key)).length;
    els.tabs.innerHTML = FILTERS.map(([key, label]) =>
      `<button type="button" class="tab" data-filter="${key}" aria-pressed="${filter === key}">${label} <span class="count">${count(key)}</span></button>`).join('');

    const shown = topics.filter(matches);
    if (!shown.length) {
      const label = FILTERS.find(([k]) => k === filter)[1].toLowerCase();
      els.list.innerHTML = query
        ? `<p class="inline-note">No topics match “${esc(query)}”. <button type="button" class="link-btn" data-clear>Clear search</button></p>`
        : `<p class="inline-note">No ${filter === 'all' ? '' : `${label} `}topics yet.${filter === 'all' ? ' Archived topics are in the Archived tab.' : ''}</p>`;
      return;
    }
    els.list.innerHTML = `
      <div class="table-card">
        <table class="topic-table">
          <caption class="sr-only">Your topics${filter === 'all' ? '' : `, ${STATUS[filter] || ''}`}</caption>
          <thead><tr>
            <th scope="col">TOPIC</th><th scope="col">STATUS</th><th scope="col">MARKET CHECKS</th>
            <th scope="col">EXCITEMENT</th><th scope="col">UPDATED</th><th scope="col" class="next-cell">NEXT</th>
          </tr></thead>
          <tbody>${shown.map(rowHtml).join('')}</tbody>
        </table>
      </div>`;
  }

  function renderLoading() {
    addBtn.hidden = true;
    const row = `<tr aria-hidden="true"><th><div class="skel skel-line skel-w70"></div></th><td><div class="skel skel-pill-sm"></div></td>
      <td><div class="skel skel-line skel-w60"></div></td><td><div class="skel skel-line skel-w40"></div></td>
      <td><div class="skel skel-line skel-w60"></div></td><td class="next-cell"><div class="skel skel-btn"></div></td></tr>`;
    view.innerHTML = `<p class="sr-only" role="status">Loading your topics…</p>
      <div class="table-card"><table class="topic-table"><tbody>${row}${row}${row}${row}</tbody></table></div>`;
  }

  function renderEmpty() {
    addBtn.hidden = true;
    els = null;
    view.innerHTML = `
      <div class="center-state">
        <div class="state-box">
          <div class="state-icon" aria-hidden="true">${kdpShell.icon('topics', 26)}</div>
          <h2>No topics yet</h2>
          <p>Add a book idea, then check it against Amazon page 1. Topics that pass all 5 market checks are ready to become books.</p>
          <div class="state-actions">
            <button type="button" class="btn btn-primary" data-add-topic>${ICON.plus}Add topic</button>
          </div>
        </div>
      </div>`;
  }

  function renderError() {
    addBtn.hidden = true;
    els = null;
    view.innerHTML = `
      <div class="center-state">
        <div class="state-box" role="alert">
          <div class="state-icon danger" aria-hidden="true">${ICON.warn(26)}</div>
          <h2>We couldn't load your topics</h2>
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
    let res;
    try { res = await kdp.listTopics(); } catch (e) { res = { error: e }; }
    if (res.error) { renderError(); return; }
    topics = res.data || [];
    if (!topics.length) { renderEmpty(); return; }
    renderShell();
    renderList();
  }

  function showRowError(msg) {
    els.error.innerHTML = ICON.warn(18);
    const d = document.createElement('div');
    d.textContent = msg;
    els.error.append(d);
    els.error.hidden = false;
  }

  async function startBook(btn) {
    const id = btn.dataset.start;
    els.error.hidden = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>Starting…';
    let res;
    try { res = await kdp.createBook(id, null); } catch (e) { res = { error: e }; }
    if (!res.error && res.data) { location.href = bookHref(res.data); return; }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.textContent = 'Start book';
    const t = topics.find((x) => x.id === id);
    if (res.error && res.error.code === '42501') {
      showRowError(`“${t ? t.name : 'This topic'}” is no longer validated. Reload the page to see its status.`);
    } else {
      showRowError("We couldn't start the book. Check your connection, then try again.");
    }
    btn.focus();
  }

  /* ── Events ──────────────────────────────── */

  view.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-filter]');
    if (tab) {
      filter = tab.dataset.filter;
      renderList();
      els.tabs.querySelector(`[data-filter="${filter}"]`).focus();
      return;
    }
    if (e.target.closest('[data-clear]')) {
      els.search.value = '';
      query = '';
      renderList();
      els.search.focus();
      return;
    }
    const start = e.target.closest('[data-start]');
    if (start && !start.disabled) startBook(start);
  });

  /* ── Start ───────────────────────────────── */

  const user = await kdpShell.init({ active: 'topics' });
  if (!user) return;
  load();
})();
