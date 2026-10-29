// E12 fix batch 3, Books page (design 01b): the card word bar with real words
// (item 1: each section's current version against the section targets, else the
// Brief's custom target or range, bar against the low end), "Needs review" from a
// section (Q7), the "Words this month" stat (item 2, 0026 words_month: value,
// loading, error), "Reopen book" in a completed book's menu (item 3: done, error
// with Retry), and the title room on the card (R2). Screenshots at 1440 and 900.
// Run: tests/browser/run.sh books t-words.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const S = () => globalThis.__store;
  const card = (id) => page.locator('.book-card', { has: page.locator(`[data-book-menu="${id}"]`) });
  const T = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const meta = (id) => T(card(id).locator('.book-meta span').first());
  const bar = (id) => card(id).locator('.bar span').evaluate((e) => e.style.width);
  const B4 = 'b4b4b4b4-0000-4000-8000-000000000004', B5 = 'b5b5b5b5-0000-4000-8000-000000000005', B6 = 'b6b6b6b6-0000-4000-8000-000000000006', B7 = 'b7b7b7b7-0000-4000-8000-000000000007';
  const sec = (target, words, extra = {}) => ({ word_target: target, status: 'draft', needs_review: false, current: words === null ? null : { word_count: words }, ...extra });
  const row = (id, title, extra) => ({ id, title, subtitle: null, status: 'in_progress', completed_at: null, current_step: 6, updated_at: new Date(Date.now() - 7200e3).toISOString(), topic_id: 't',
    pen_names: { name: 'Sam Carter' }, book_briefs: null, chapters: [], ...extra });
  async function open(modes = {}, wait = '.stat .bar') {
    globalThis.__modes = modes;
    await setupE11(page);
    const now = new Date().toISOString();
    S().books.push(
      row(B4, "Sourdough at Home: A Beginner's Guide and a Long Subtitle for the Card", { status: 'completed', completed_at: now,
        chapters: [{ needs_review: false, sections: [sec(5000, 4820, { status: 'final' }), sec(5000, 4820, { status: 'final' })] }] }),
      row(B5, 'Desk Stretches', { chapters: [{ needs_review: false, sections: [sec(5000, 3100, { needs_review: true }), sec(5000, 3100)] }] }),
      row(B6, 'Notes on Walking', { chapters: [{ needs_review: false, sections: [sec(null, 1240), sec(null, null)] }] }),
      row(B7, 'Calm Mornings', { book_briefs: { length_range: '8-12k', target_words: null, topic_text: 'Calm' }, chapters: [{ needs_review: false, sections: [sec(null, 2300)] }] }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator(wait).first().waitFor({ timeout: 10000 });
  }

  // ── 1. The card word bar ──
  await open();
  ok('1 section targets: "4,120 of 10,000 words", bar 41%', (await meta(E11.B1)) === '4,120 of 10,000 words' && (await bar(E11.B1)) === '41%', [await meta(E11.B1), await bar(E11.B1)]);
  ok('1 Brief target, no saved words: today\'s text, empty bar', (await meta(E11.B2)) === 'Target 12,000 words' && (await bar(E11.B2)) === '0%', await meta(E11.B2));
  ok('1 Brief range, no saved words: today\'s text', (await meta(E11.B3)) === 'Target 8,000 to 12,000 words', await meta(E11.B3));
  ok('1 Brief range with words: against the low end (Q2), 29%', (await meta(B7)) === '2,300 of 8,000 to 12,000 words' && (await bar(B7)) === '29%', [await meta(B7), await bar(B7)]);
  ok('1 no target: "1,240 words · no target yet", empty bar', (await meta(B6)) === '1,240 words · no target yet' && (await bar(B6)) === '0%', await meta(B6));
  ok('1 completed: "Completed", its words, a full bar', (await T(card(B4))).includes('Completed') && (await meta(B4)) === '9,640 words' && (await bar(B4)) === '100%', await meta(B4));
  ok('1 Q7: "Needs review" from a section (no chapter mark)', (await card(B5).locator('.badge-warning').count()) === 1 && (await T(card(B5))).includes('Needs review'));
  ok('1 no badge on a book with nothing to review', (await card(E11.B1).locator('.badge-warning').count()) === 0);
  ok('1 one query for the books (no request per book)', S().calls.filter((c) => c === 'GET /rest/v1/books').length === 1, S().calls.filter((c) => c.includes('books')));

  // ── 2. Words this month ──
  const stat = page.locator('.stat').nth(1);
  ok('2 the stat: "6,480", "since Oct 1, across all books"', (await T(stat)) === 'WORDS THIS MONTH 6,480 since Oct 1, across all books', await T(stat));
  ok('2 words_month is read once', S().calls.filter((c) => c.includes('rpc/words_month')).length === 1);
  await page.locator('.stats').screenshot({ path: `${SHOTS}/t-words-stats-1440.png`, timeout: 10000 }).catch(() => out.push('shot timeout stats'));

  // ── R2. Title room: the title wraps before the ⋯ button ──
  const room = await page.evaluate((id) => {
    const btn = document.querySelector(`[data-book-menu="${id}"]`);
    const h = btn.closest('.book-card').querySelector('.book-title');
    const r = document.createRange();
    r.selectNodeContents(h);
    const right = Math.max(...[...r.getClientRects()].map((x) => x.right));
    return { pad: getComputedStyle(h).paddingRight, textRight: right, btnLeft: btn.getBoundingClientRect().left };
  }, B4);
  ok('R2 the title keeps 40 px on the right', room.pad === '40px', room);
  ok('R2 the long title text ends before the ⋯ button', room.textRight <= room.btnLeft, room);

  // ── 3. Reopen book (design 01b, 3) ──
  await page.locator(`[data-book-menu="${E11.B1}"]`).click();
  let items = (await page.locator('#bookMenu [role="menuitem"]').allInnerTexts()).map((x) => x.trim());
  ok('3 an in-progress book has no Reopen', JSON.stringify(items) === JSON.stringify(['Open', 'Rename', 'Export', 'Delete']), items);
  await page.keyboard.press('Escape');
  await page.locator(`[data-book-menu="${B4}"]`).click();
  items = (await page.locator('#bookMenu [role="menuitem"]').allInnerTexts()).map((x) => x.trim());
  ok('3 a completed book: Open, Rename, Export, Reopen book, Delete', JSON.stringify(items) === JSON.stringify(['Open', 'Rename', 'Export', 'Reopen book', 'Delete']), items);
  await page.locator('#bookMenu [data-action="reopen"]').focus();
  await page.screenshot({ path: `${SHOTS}/t-words-menu-1440.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout menu'));
  globalThis.__modes.reopenFail = 1;
  await page.locator('#bookMenu [data-action="reopen"]').click();
  await page.locator('#notice.is-error').waitFor({ timeout: 5000 });
  ok('3 error: "We couldn’t reopen the book. Try again." with Retry, as an alert', (await T(page.locator('#notice'))) === 'We couldn’t reopen the book. Try again. Retry'
    && (await page.locator('#notice').getAttribute('role')) === 'alert', await T(page.locator('#notice')));
  ok('3 error: the book stays completed', (await T(card(B4))).includes('Completed'));
  await page.screenshot({ path: `${SHOTS}/t-words-reopen-error-1440.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout err'));
  await page.locator('[data-notice-retry]').click();
  await page.locator('#notice:not(.is-error)').waitFor({ timeout: 5000 });
  ok('3 Retry: "Reopened “…”." (the page notice)', (await T(page.locator('#notice'))).startsWith('Reopened “Sourdough at Home'), await T(page.locator('#notice')));
  const w = S().writes.filter((x) => x.table === 'books');
  ok('3 two tries, each one PATCH status = in_progress (no confirm)', w.length === 2 && w.every((x) => x.id === B4 && JSON.stringify(x.body) === '{"status":"in_progress"}'), w);
  ok('3 the card shows its step and target again', (await T(card(B4))).includes('Write · 06 Write') && (await meta(B4)) === '9,640 of 10,000 words', await meta(B4));
  ok('3 focus is back on the card\'s ⋯ button', await page.evaluate((id) => document.activeElement && document.activeElement.dataset.bookMenu === id, B4));
  ok('3 the In progress count went up', (await T(page.locator('.stat').first())).startsWith('IN PROGRESS 7'), await T(page.locator('.stat').first()));
  await page.screenshot({ path: `${SHOTS}/t-words-cards-1440.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout cards'));
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(300);
  ok('900: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= 900));
  await page.screenshot({ path: `${SHOTS}/t-words-cards-900.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout 900'));

  // Reopen on the Completed tab: the card leaves the list, focus goes to the tab.
  await open();
  await page.locator('[data-filter="completed"]').click();
  await page.locator(`[data-book-menu="${B4}"]`).click();
  await page.locator('#bookMenu [data-action="reopen"]').click();
  await page.locator('#notice:not([hidden])').waitFor({ timeout: 5000 });
  ok('3 Completed tab: the card leaves, "No completed books yet.", focus on the tab', (await T(page.locator('.book-grid'))) === 'No completed books yet.'
    && await page.evaluate(() => document.activeElement && document.activeElement.dataset.filter === 'completed'));

  // ── 2. Loading and error ──
  await open({ wordsSlow: 2500 }, '.book-card .book-title');
  ok('2 loading: a skeleton in the stat', (await page.locator('.stat').nth(1).locator('.skel').count()) === 2);
  await page.locator('.stats').screenshot({ path: `${SHOTS}/t-words-stats-loading.png`, timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2800);
  await open({ wordsFail: true });
  ok('2 error: "–" and "Not available right now"; the books still show', (await T(page.locator('.stat').nth(1))) === 'WORDS THIS MONTH – Not available right now' && (await page.locator('.book-card').count()) === 7, await T(page.locator('.stat').nth(1)));
  await page.locator('.stats').screenshot({ path: `${SHOTS}/t-words-stats-error.png`, timeout: 10000 }).catch(() => {});
  return out.join('\n');
};
