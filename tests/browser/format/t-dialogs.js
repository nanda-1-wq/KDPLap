// 43: the Also by dialog and the trim warning. E13.2 Part 2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const open = () => page.waitForSelector('dialog.fmt-dialog[open]', { timeout: 5000 });
  const closed = () => page.waitForFunction(() => !document.querySelector('dialog.fmt-dialog'), null, { timeout: 3000 });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await FM.open(page);

  /* Also by: the pen name, the note, each book with its status from Books (owner Q6). */
  await page.click('[data-fmt-alsoby]');
  await open();
  ok((await FM.txt(page, '#fmtDlgTitle')) === 'Also by Adnan Haroun', 'title: Also by <pen name>');
  ok((await FM.txt(page, 'dialog .fmt-dlg-text')) === 'Tick only books that are live on Amazon. Completed in NicheInk does not mean published.', 'the live on Amazon note');
  await page.waitForFunction(() => document.querySelector('[data-fmt-status]').textContent !== '', null, { timeout: 3000 });
  ok((await FM.all(page, 'dialog .fmt-pick')).join('|') === 'Worry Less Workbook Completed|Sleep Better Tonight In progress', `books with status: ${(await FM.all(page, 'dialog .fmt-pick')).join('|')}`);
  ok((await FM.txt(page, 'dialog .fmt-hint')) === 'None ticked: the Also by page is left out.', 'none ticked note');
  ok(await page.$$eval('dialog .fmt-pick input', (i) => i.every((x) => !x.checked)), 'none ticked by default');
  ok(await page.$eval('dialog', (d) => d.getAttribute('aria-labelledby') === 'fmtDlgTitle'), 'the dialog is named by its title');
  ok(await page.$$eval('dialog .fmt-pick', (r) => r.every((x) => x.getBoundingClientRect().height >= 44)), 'book rows are at least 44 px');

  /* Tick the second, then the first: print order = the order they were ticked into the list. */
  await page.click('dialog .fmt-pick:nth-child(3)');
  await page.click('dialog [data-save]');
  await closed();
  await FM.saved(page);
  ok(JSON.stringify(st.format.also_by) === JSON.stringify([st.candidates[1].id]) && st.format.parts.also_by === true, 'Save: also_by and the part on');
  ok((await FM.txt(page, '[data-fmt-alsoby]')) === 'Choose books (1)', 'the link counts: Choose books (1)');
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-alsoby]')), 'focus back on the link');
  await page.click('[data-fmt-alsoby]');
  await open();
  await page.click('dialog .fmt-pick:nth-child(2)');
  await page.click('dialog [data-save]');
  await closed();
  await FM.saved(page);
  ok(JSON.stringify(st.format.also_by) === JSON.stringify([st.candidates[1].id, st.candidates[0].id]), 'a new tick goes after the books already ticked');

  /* Cancel and Escape change nothing. */
  await page.click('[data-fmt-alsoby]');
  await open();
  await page.click('dialog .fmt-pick:nth-child(2)');
  await page.click('dialog .dialog-foot [data-close]');
  await closed();
  ok(st.format.also_by.length === 2, 'Cancel keeps the books');
  await page.click('[data-fmt-alsoby]');
  await open();
  await page.keyboard.press('Escape');
  await closed();
  ok(st.format.also_by.length === 2 && await page.evaluate(() => document.activeElement.matches('[data-fmt-alsoby]')), 'Escape closes, focus back');

  /* Untick all: the part goes off. */
  await page.click('[data-fmt-alsoby]');
  await open();
  for (const i of await page.$$('dialog .fmt-pick input:checked')) await i.click();
  await page.click('dialog [data-save]');
  await closed();
  await FM.saved(page);
  ok(st.format.also_by.length === 0 && st.format.parts.also_by === false, 'none ticked: the part is off');

  /* A failed status read: the books still show, with no status line. */
  globalThis.__modes.statusFail = true;
  await page.click('[data-fmt-alsoby]');
  await open();
  await page.waitForTimeout(300);
  ok((await FM.all(page, 'dialog .fmt-pick')).join('|') === 'Worry Less Workbook|Sleep Better Tonight', 'status read failed: titles only');
  await page.keyboard.press('Escape');
  await closed();
  globalThis.__modes.statusFail = false;

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
  ok((await FM.all(page, '[data-chips="trim_size"] .tone-chip')).join('|') === '5 × 8 in|5.25 × 8 in|5.5 × 8.5 in|6 × 9 in', 'Brief chips: group A');

  /* A trim outside group A (old 7 × 10): an extra choice and the Print PDF note. */
  st.brief.trim_size = '7x10';
  await FM.open(page);
  ok((await page.$$eval('[data-fmt-trim] option', (o) => o.map((x) => x.textContent))).join() === '6 × 9 in,5.5 × 8.5 in,5.25 × 8 in,5 × 8 in,7 × 10 in' && await page.$eval('[data-fmt-trim]', (s) => s.value === '7x10'), '7 × 10: an extra choice, chosen');
  ok((await FM.txt(page, '.fmt-trim-off')) === 'Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8 or 5 × 8 in. Pick one of these.' && await page.$eval('.fmt-trim-off svg', () => true), '7 × 10: the note with an icon');

  /* 900 px: both dialogs fit, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.click('[data-fmt-alsoby]');
  await open();
  ok(await page.$eval('dialog', (d) => d.getBoundingClientRect().right <= innerWidth && d.getBoundingClientRect().left >= 0) && await FM.noScroll(page), '900: the Also by dialog fits');
  await page.keyboard.press('Escape');
  await closed();

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
