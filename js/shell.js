/* ═══════════════════════════════════════════════════
   KDP Lab — Signed-in app shell (main sidebar)
   /js/shell.js

   Load AFTER js/supabase.js. Each app page has:
     <aside class="sidebar" data-shell></aside>
   and calls:
     const user = await kdpShell.init({ active: 'books', root: '../' });
   init() guards the page (redirects to sign-in) and fills the sidebar.
   Reference: design/screens/01 and 07.
═══════════════════════════════════════════════════ */

(function () {
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    books: '<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6"/>',
    topics: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    pens: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    wordsearch: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
    sudoku: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };

  function icon(name, size = 20, stroke = 1.8) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  const MAIN = [
    { key: 'books', label: 'Books', href: 'app/dashboard.html', icon: 'books' },
    { key: 'topics', label: 'Topic Lab', href: 'app/topic-lab.html', icon: 'topics' },
    { key: 'pens', label: 'Pen Names', href: 'app/pen-names.html', icon: 'pens' }
  ];
  const TOOLS = [
    { key: 'wordsearch', label: 'Word Search', href: 'app/generators/word-search.html', icon: 'wordsearch' },
    { key: 'sudoku', label: 'Sudoku', href: 'app/generators/sudoku.html', icon: 'sudoku' }
  ];

  function navItem(item, active, root) {
    const current = item.key === active ? ' aria-current="page"' : '';
    return `<a class="nav-item" href="${root}${item.href}"${current}>${icon(item.icon)}${item.label}</a>`;
  }

  function render(el, active, root) {
    el.setAttribute('aria-label', 'Main');
    el.innerHTML = `
      <a class="sidebar-logo" href="${root}app/dashboard.html" aria-label="KDP Lab, go to Books">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path class="mark" d="M32 49C26 43.5 17 41.5 9 43V13c9-1.8 17 .6 23 7z"/><path class="mark" d="M32 49C38 43.5 47 41.5 55 43V13c-9-1.8-17 .6-23 7z"/><path class="cut" d="M32 18.5l6 11.5-6 19.5-6-19.5z"/><path class="spine" d="M32 30V46" stroke-width="2"/></svg>
        <span class="sidebar-logo-text"><span class="kdp">KDP</span><span class="lab">LAB</span></span>
      </a>
      <button type="button" class="btn btn-primary btn-block" data-new-book>${icon('plus', 18, 2)}New Book</button>
      <nav class="nav-group" aria-label="Pages">${MAIN.map((i) => navItem(i, active, root)).join('')}</nav>
      <nav class="nav-group" aria-labelledby="navToolsLabel">
        <div class="nav-label" id="navToolsLabel">KDP TOOLS</div>
        ${TOOLS.map((i) => navItem(i, active, root)).join('')}
      </nav>
      <div class="sidebar-spacer"></div>
      ${navItem({ key: 'settings', label: 'Settings', href: 'app/settings.html', icon: 'settings' }, active, root)}
      <div class="user-block">
        <div class="avatar" aria-hidden="true" data-user-initial></div>
        <div class="user-text">
          <span class="user-name" data-user-name></span>
          <span class="user-email" data-user-email></span>
        </div>
      </div>`;
  }

  /**
   * A visible but disabled action with the tooltip "Coming next".
   * aria-disabled keeps it focusable so keyboard users can read why.
   */
  function comingNextButton(innerHtml, classes) {
    return `<button type="button" class="btn ${classes} has-tip" aria-disabled="true" aria-describedby="tip-coming">
      ${innerHtml}<span class="tip" role="tooltip">Coming next</span></button>`;
  }

  function fillUser(el, user) {
    const email = user.email || '';
    const name = ((user.user_metadata && user.user_metadata.full_name) || '').trim();
    el.querySelector('[data-user-name]').textContent = name || email;
    const emailEl = el.querySelector('[data-user-email]');
    emailEl.textContent = name ? email : '';
    emailEl.hidden = !name;
    el.querySelector('[data-user-initial]').textContent = (name || email || '?').charAt(0).toUpperCase();
  }

  // One shared tooltip text for screen readers (visual tips are per button).
  function ensureTipText() {
    if (document.getElementById('tip-coming')) return;
    const s = document.createElement('span');
    s.id = 'tip-coming';
    s.className = 'sr-only';
    s.textContent = 'Coming next';
    document.body.append(s);
  }

  // Disabled "Coming next" buttons do nothing when clicked.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[aria-disabled="true"]');
    if (btn) e.preventDefault();
  });

  async function init({ active, root = '../' }) {
    // Draw the sidebar first so the layout does not jump while the session is checked.
    const el = document.querySelector('[data-shell]');
    render(el, active, root);
    if (window.kdpNewBook) kdpNewBook.setRoot(root);
    const user = await kdp.requireAuth(`${root}login.html`);
    if (!user) return null;
    fillUser(el, user);
    ensureTipText();
    return user;
  }

  window.kdpShell = { init, comingNextButton, icon };
})();
