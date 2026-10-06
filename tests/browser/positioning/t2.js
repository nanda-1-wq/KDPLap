const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  const shot = (n, full = true) => page.screenshot({ path: `${SHOTS}/${n}.png`, timeout: 60000, fullPage: full }).catch(() => {});
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.outerHTML || '').replace(/>[\s\S]*$/, '>') : ''; });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ── Locked book (design 18)
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.posn-banner');
  ok((await txt('.posn-banner-title')) === 'Approved and locked on Sep 26', 'banner date');
  ok((await txt('.posn-banner-text p')) === 'Title, Outline, and chapters follow this version.', 'banner text');
  const labels = await page.$$eval('.posn-ro-label', (els) => els.map((e) => e.textContent));
  ok(labels.join('|') === 'ONE-SENTENCE POSITIONING|READER PROMISE|WHAT CURRENT BOOKS LACK|YOUR APPROACH|KEY SELLING POINTS|FOCUS TAGS', 'all six fields read-only');
  ok((await page.$$('.posn-ro .posn-list li')).length === 7 && (await page.$$('.posn-tag')).length === 4, 'lists and tags shown');
  ok(!(await page.$('textarea, input, [data-redraft], [data-lock-btn]')), 'nothing editable');
  ok(!!(await page.$('.step-link[data-step="3"].is-locked')) && (await txt('.group-count')) === '2 of 4 done', 'sidebar lock, 2 of 4 done (mock research not done) ' + await txt('.group-count') + ' ' + await page.innerHTML('.step-link[data-step="3"]'));
  ok(!(await page.$('.step-flag')), 'no needs review yet');
  await shot('q01-locked', false);

  // Unlock dialog: impact chips, Keep locked
  await page.click('[data-unlock]');
  await page.waitForSelector('.posn-impact-list');
  ok((await txt('#ulTitle')) === 'Unlock positioning?', 'dialog title');
  ok((await txt('#ulDesc')) === 'These get a "Needs review" mark. Nothing is deleted.', 'dialog text');
  ok((await page.$$eval('.posn-impact-list li', (els) => els.map((e) => e.textContent.trim()))).join('|') === '04 Title|05 Outline|1 written chapter', 'chips: title, outline, 1 written chapter');
  ok((await active()).includes('data-close'), 'focus on Keep locked');
  await shot('q02-unlock-dialog', false);
  await page.keyboard.press('Escape');
  ok((await active()).includes('data-unlock'), 'Escape: focus back on Unlock to edit');
  ok(!st.writes.some((w) => w.table === 'rpc/unlock_positioning'), 'nothing sent on Keep locked');

  // Unlock error, then unlock
  M.unlockError = true;
  await page.click('[data-unlock]');
  await page.waitForSelector('.posn-impact-list');
  await page.click('[data-go]');
  await page.waitForSelector('dialog [data-error]:not([hidden])');
  ok((await txt('dialog [data-error]')) === 'We couldn’t unlock it. Check your connection, then try again.', 'unlock error in dialog');
  M.unlockDelay = 400;
  await page.click('[data-go]');
  await page.waitForSelector('[data-go][aria-busy="true"]');
  ok(await page.isDisabled('[data-close]'), 'Keep locked off while unlocking');
  await page.waitForSelector('.posn-intro');
  M.unlockDelay = 0;
  const uw = st.writes.filter((w) => w.table === 'rpc/unlock_positioning').pop();
  ok(JSON.stringify(uw.body) === JSON.stringify({ p_book_id: P2 }), 'rpc body');
  ok((await active()).includes('posn-intro'), 'focus on the intro after unlock');
  ok((await txt('.step-link[data-step="4"] .step-flag')) === 'Needs review', 'step 04 shows Needs review');
  ok(!(await page.$('.step-link[data-step="3"].is-locked')) && (await txt('.group-count')) === '1 of 4 done', 'step 03 not done after unlock ' + await txt('.group-count'));
  ok((await txt('.posn-flag')).includes('Kept on purpose'), 'kept flag still shown');
  ok((await txt('#lockNote')) === 'Ready to lock.', 'check still current: text did not change');
  await shot('q03-unlocked', false);

  // Lock refused by the server (race), message from the reason
  M.posError = { status: 400, body: { code: 'P0001', message: 'positioning_not_ready', details: 'Resolve the drift flags first.' } };
  M.posErrorOnce = true;
  await page.click('[data-lock-btn]');
  await page.waitForSelector('[data-lock-top] .alert');
  ok((await txt('[data-lock-top] .alert')) === 'We couldn’t lock it. Resolve the drift flags first.', 'server reason shown');
  M.posErrorOnce = false;

  // Drift errors
  for (const [g, msg] of [
    ['positioning_changed', 'The text changed while the check ran, so nothing was saved. Run it again. This try was not counted. Try again'],
    ['monthly_limit', 'You have used this month’s AI allowance. It resets on'],
    ['network', 'We couldn’t reach KDP Lab. Check your connection, then try again. This try was not counted. Try again']
  ]) {
    M.gen = g;
    await page.click('[data-run-drift]');
    await page.waitForSelector('[data-drift] .alert');
    ok((await txt('[data-drift] .alert')).startsWith(msg), `drift ${g}`);
  }
  await shot('q04-drift-error', false);
  M.gen = null;

  // Locked elsewhere: an edit is refused and the page reloads the locked row
  await page.click('[data-edit="reader_promise"]');
  st.books[P2].pos.locked_at = '2026-09-30T08:00:00Z';
  await page.fill('[data-card="reader_promise"] textarea', 'After finishing this book, you can follow a safe chair routine at home.');
  await page.waitForSelector('.posn-banner', { timeout: 5000 });
  ok((await txt('[data-saved-line]')).includes('This positioning is locked, so the change was not saved.'), 'locked elsewhere: message, locked view ' + await txt('[data-saved-line]'));
  ok(st.books[P2].pos.reader_promise.startsWith('After finishing this book, you can follow a safe 15-minute'), 'text unchanged');

  // A rule the database refuses (23514): the value goes back
  st.books[P2].pos.locked_at = null;
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-card="approach"] [data-edit]');
  M.posError = { status: 400, body: { code: '23514', message: 'violates check constraint' } };
  M.posErrorOnce = true;
  await page.click('[data-edit="approach"]');
  await page.fill('[data-card="approach"] textarea', 'Short.');
  await page.click('[data-done="approach"]');
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'error');
  ok((await txt('[data-saved-line]')).includes('This change breaks a Positioning rule, so it was not saved.'), '23514 message');
  ok((await txt('[data-card="approach"] .posn-text')).startsWith('Every pose has a no-arms-overhead version'), 'value put back');

  // ── No topic in the Brief: help says so, no call
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P3}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-help-all]');
  const before = st.gens.length;
  await page.click('[data-help-all]');
  await page.waitForSelector('[data-help-area] .alert');
  ok((await txt('[data-help-area] .alert')) === 'Add a topic in 01 Brief first. The AI drafts from it.', 'no topic message');
  ok(st.gens.length === before, 'no call without a topic');
  await page.waitForSelector('.posn-gaps');
  ok((await txt('.posn-gaps')) === 'No gaps yet. Analyze reviews in 02 Research to get a starting list, or write your own.', 'no gaps note');

  // Gaps load error
  M.gapsError = true;
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-gaps-retry]');
  M.gapsError = false;
  await page.click('[data-gaps-retry]');
  await page.waitForSelector('[data-copy-gaps]');
  ok(true, 'gaps retry works');

  // Lists: add/remove lines, limit
  await page.fill('[data-card="selling_points"] input[data-item]', 'Safe for stiff knees');
  for (let i = 0; i < 7; i++) await page.click('[data-card="selling_points"] [data-add]');
  ok((await page.$$('[data-card="selling_points"] input[data-item]')).length === 8 && await page.isDisabled('[data-card="selling_points"] [data-add]'), '8 points max, Add off');
  await page.click('[data-card="selling_points"] [data-remove="selling_points"][data-index="7"]');
  ok((await page.$$('[data-card="selling_points"] input[data-item]')).length === 7, 'remove a line');
  await page.click('[data-done="selling_points"]');
  await page.waitForTimeout(150);
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'saved');
  ok(JSON.stringify(st.books[P1].pos.selling_points) === '["Safe for stiff knees"]', 'blank lines not saved');
  ok((await txt('[data-card="selling_points"] .posn-count')) === '1', 'count 1');

  // ── Narrow desktop: one column
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.posn-card');
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.posn')).gridTemplateColumns.split(' ').length);
  ok(cols === 1, 'one column at 1000 px');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no page side scroll at 1000 px');
  await shot('q05-narrow');

  const errs = st.calls.filter((c) => c.startsWith('ERR'));
  ok(!errs.length, 'no mock errors ' + errs.join(' | '));
  return log.join('\n');
};
