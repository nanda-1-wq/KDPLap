// 43: the trim warning. E13.2 Part 2. (E17 Part 7: the Also by dialog went; 06 edits Also by, design 82.)
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const open = () => page.waitForSelector('dialog.fmt-dialog[open]', { timeout: 5000 });
  const closed = () => page.waitForFunction(() => !document.querySelector('dialog.fmt-dialog'), null, { timeout: 3000 });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await FM.open(page);

  /* E17 Part 7: the 08 Also by dialog is gone (06 edits Also by, design 82). */
  ok(!(await FM.has(page, '[data-fmt-alsoby]')), 'no Also by dialog link in 08 (E17)');

  /* Trim, no Print PDF yet: the dialog without the yellow box (owner Q5). Keep changes nothing. */
  await page.selectOption('[data-fmt-trim]', '5.5x8.5');
  await open();
  ok(await page.$eval('dialog', (d) => d.getAttribute('role') === 'alertdialog'), 'trim: an alert dialog');
  ok((await FM.txt(page, '#fmtDlgTitle')) === 'Change trim to 5.5 × 8.5 in?', 'title: Change trim to 5.5 × 8.5 in?');
  ok(!(await FM.has(page, 'dialog .alert-warning')), 'no Print PDF yet: no cover warning');
  ok((await FM.txt(page, 'dialog .fmt-dlg-text')) === 'Your text does not change. The Brief updates too, so every step uses one trim size.', 'the Brief note');
  ok((await FM.all(page, 'dialog .dialog-foot .btn')).join('|') === 'Keep 6 × 9 in|Change trim', 'buttons: Keep 6 × 9 in, Change trim');
  ok(await page.$eval('[data-fmt-trim]', (s) => s.value === '6x9'), 'the select stays on 6 × 9 while asking');
  await page.click('dialog [data-close]');
  await closed();
  ok(st.brief.trim_size === '6x9' && !st.writes.some((w) => w.table === 'book_briefs'), 'Keep: nothing changes');
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-trim]')), 'focus back on the trim select');

  /* A Print PDF exists: the yellow box. A failed write shows an error and keeps the dialog. */
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  await FM.open(page);
  await page.selectOption('[data-fmt-trim]', '5x8');
  await open();
  ok((await FM.txt(page, 'dialog .alert-warning')) === 'Your cover will be Out of date. The page count and spine change. Export the Print PDF and the cover again.'
    && await page.$eval('dialog .alert-warning svg', () => true), 'with a Print PDF: the cover warning, icon and words');
  globalThis.__modes.trimFail = true;
  await page.click('dialog [data-change]');
  await page.waitForFunction(() => !document.querySelector('dialog [data-err]').hidden, null, { timeout: 3000 });
  ok((await FM.txt(page, 'dialog [data-err]')) === "We couldn't change the trim. Check your connection, then try again." && st.brief.trim_size === '6x9', 'a failed write: the error, the trim stays');
  globalThis.__modes.trimFail = false;

  /* Change trim: the Brief takes it (one source of truth), the drawing follows. */
  await page.click('dialog [data-change]');
  await closed();
  ok(st.brief.trim_size === '5x8' && JSON.stringify(st.writes.filter((w) => w.table === 'book_briefs').pop().body) === '{"trim_size":"5x8"}', 'Change trim writes book_briefs.trim_size');
  ok(await page.$eval('[data-fmt-trim]', (s) => s.value === '5x8') && (await FM.txt(page, '.fmt-trim-pic')) === '5×8', 'the select and the drawing show 5 × 8');
  await page.click('[data-step="1"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Brief', null, { timeout: 5000 });
  await page.waitForSelector('[data-chips="trim_size"]', { timeout: 5000 });
  ok(await page.$eval('[data-chips="trim_size"] [data-value="5x8"]', (c) => c.getAttribute('aria-pressed') === 'true' || c.getAttribute('aria-checked') === 'true' || c.classList.contains('is-on')), '01 Brief shows the new trim');
  ok((await FM.all(page, '[data-chips="trim_size"] .tone-chip')).join('|') === '5 × 8 in|5.25 × 8 in|5.5 × 8.5 in|6 × 9 in|8 × 10 in|8.5 × 11 in', 'Brief chips: the 6 Print PDF trims (E13.2b)');

  /* A trim outside group A (old 7 × 10): an extra choice and the Print PDF note. */
  st.brief.trim_size = '7x10';
  await FM.open(page);
  ok((await page.$$eval('[data-fmt-trim] option', (o) => o.map((x) => x.textContent))).join() === '6 × 9 in,5.5 × 8.5 in,5.25 × 8 in,5 × 8 in,8 × 10 in,8.5 × 11 in,7 × 10 in' && await page.$eval('[data-fmt-trim]', (s) => s.value === '7x10'), '7 × 10: an extra choice, chosen');
  ok((await FM.txt(page, '.fmt-trim-off')) === 'Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8, 5 × 8, 8 × 10 or 8.5 × 11 in. Pick one of these.' && await page.$eval('.fmt-trim-off svg', () => true), '7 × 10: the note with an icon');

  /* 900 px: the trim dialog fits, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.selectOption('[data-fmt-trim]', '6x9');
  await open();
  ok(await page.$eval('dialog', (d) => d.getBoundingClientRect().right <= innerWidth && d.getBoundingClientRect().left >= 0) && await FM.noScroll(page), '900: the trim dialog fits');
  await page.keyboard.press('Escape');
  await closed();

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
