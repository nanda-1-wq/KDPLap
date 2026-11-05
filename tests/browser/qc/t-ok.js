// 55 F: Mark as OK, Undo, 23505, the errors, an issue back after a text change.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const COPY = 'Marked as OK. It stays hidden while this text stays the same.';
  const fresh = () => page.$$eval('#qc-g1 .qc-it', (r) => r.length);
  await page.setViewportSize({ width: 1440, height: 1200 });
  st.sample();
  await QC.open7(page);
  await QC.run(page);
  const items = st.writes.find((w) => w.table === 'qc_runs').body.results.items;
  const first = items.find((x) => x.g === 1);
  const total = items.length;
  const label = (await QC.txt(page, '#qc-g1 .qc-it:first-child .qc-sec'));
  const n1 = await fresh();

  // The row hides at once, before the insert answers.
  globalThis.__modes.okSlow = 400;
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForSelector('[data-justok]', { timeout: 1000 });
  ok(await fresh() === n1 - 1, 'the row hides at once');
  ok((await QC.txt(page, '[data-justok] .qc-ok-line')) === `${COPY} Undo`, `owner copy: ${await QC.txt(page, '[data-justok] .qc-ok-line')}`);
  ok((await QC.txt(page, '[data-justok] .qc-ok-was')).startsWith(`${label} · `), 'the line names the issue');
  ok(await page.$eval('[data-justok] [data-undo]', (b) => b.disabled), 'Undo waits for the save');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-justok')), 'focus stays on the row');
  globalThis.__modes.okSlow = 0;
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-undo')), 'focus moves to Undo');

  // What was sent.
  const sent = st.writes.find((w) => w.table === 'qc_dismissed').body;
  ok(sent.book_id === QB && sent.rule === first.rule && sent.issue_key === first.key && sent.section_id === first.section_id, `row sent: ${JSON.stringify(sent)}`);
  ok(sent.label === `${label} · ${first.message}` && !('user_id' in sent), `label: ${sent.label}`);

  // The verdict and the chip move, the aside lists it.
  ok((await QC.txt(page, '.qc-verdict strong')) === `Ready for Format, with ${total - 1} warnings`, 'the verdict counts one less');
  ok(new RegExp(`^1 Complete ${n1 - 1} to check$`).test(await QC.txt(page, '[data-group="1"]')), 'the chip counts one less');
  ok((await QC.txt(page, '[data-marked] .chip-label')) === 'MARKED AS OK · 1', 'aside: MARKED AS OK · 1');
  ok((await QC.txt(page, '[data-marked] .qc-note')) === 'These stay hidden on the next run. You can bring them back.', 'aside note');
  ok((await QC.txt(page, '[data-marked] .qc-it')).endsWith('Undo'), 'aside row has Undo');

  // A Mark as OK never makes the run out of date, and stays hidden on the next run.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qc-verdict', { timeout: 10000 });
  ok(await QC.has(page, '.qc-verdict') && !(await page.$('.qc-groups.is-old')), 'a reload: still current');
  ok(!(await page.$('[data-justok]')), 'a reload: the line is gone, the row stays hidden');
  ok(await fresh() === n1 - 1, 'a reload: one row less');
  await QC.run(page);
  ok((await QC.txt(page, '[data-marked] .chip-label')) === 'MARKED AS OK · 1', 'the next run keeps it hidden');

  // Undo from the aside brings it back.
  await page.click('[data-marked] [data-undo]');
  await page.waitForFunction(() => !document.querySelector('[data-marked]'), null, { timeout: 3000 });
  ok(st.dismissed.length === 0, 'Undo deletes the row');
  ok(await fresh() === n1, 'Undo: the row is back');
  ok((await QC.txt(page, '.qc-verdict strong')) === `Ready for Format, with ${total} warnings`, 'Undo: the verdict is back');

  // Undo from the inline line.
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  await page.click('[data-justok] [data-undo]');
  await page.waitForFunction(() => !document.querySelector('[data-justok]'), null, { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-ok')), 'inline Undo: focus back on Mark as OK');

  // 23505: another tab marked it first. It counts as done, and Undo works.
  globalThis.__modes.okRace = true;
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  ok(!(await page.$('.qc-row-err')), '23505 is done, not an error');
  await page.click('[data-justok] [data-undo]');
  await page.waitForFunction(() => !document.querySelector('[data-justok]'), null, { timeout: 3000 });
  ok(st.dismissed.length === 0, '23505: Undo deletes the row the other tab made');

  // An error puts the row back.
  globalThis.__modes.okFail = 1;
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForSelector('.qc-row-err', { timeout: 3000 });
  ok(await fresh() === n1, 'error: the row is back');
  ok((await QC.txt(page, '.qc-row-err')) === "We couldn't save that. Try again.", `error text: ${await QC.txt(page, '.qc-row-err')}`);
  ok(!(await page.$('[data-justok]')), 'error: no Marked as OK line');
  ok(await page.$eval('.qc-row-err', (e) => e.getAttribute('role') === 'alert'), 'error is an alert');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-ok')), 'error: focus back on Mark as OK');

  // The limit.
  globalThis.__modes.okLimit = true;
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForFunction(() => /500 issues/.test((document.querySelector('.qc-row-err') || {}).textContent || ''), null, { timeout: 3000 });
  ok((await QC.txt(page, '.qc-row-err')) === 'You marked 500 issues as OK in this book. Undo one first.', 'limit text');
  globalThis.__modes.okLimit = false;

  // A failed Undo keeps it marked.
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  globalThis.__modes.undoFail = 1;
  await page.click('[data-justok] [data-undo]');
  await page.waitForSelector('[data-justok] .qc-row-err', { timeout: 3000 });
  ok(await QC.has(page, '[data-justok]') && st.dismissed.length === 1, 'a failed Undo keeps it marked');
  await page.click('[data-justok] [data-undo]');
  await page.waitForFunction(() => !document.querySelector('[data-justok]'), null, { timeout: 3000 });

  // Marked, then the text changes: a new version gives a new key, so it comes back.
  await page.click('#qc-g1 .qc-it:first-child [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  const was = st.dismissed[0];
  const s = st.sections().find((x) => x.id === first.section_id);
  st.edit(s, s.version.content + ' A changed spot.');
  await QC.open7(page);
  await QC.run(page);
  ok(st.dismissed.includes(was), 'the old row stays in the table (R7)');
  ok(await fresh() === n1, 'the text changed: the issue is back');
  ok(!(await page.$('[data-marked]')), 'an old dismissal is not listed');

  // Mark the last open issues: the verdict turns to all pass, with the count of marks.
  const left = () => page.$$eval('[data-ok]', (b) => b.length);
  for (const g of [2, 3, 5, 7]) {
    if ((await page.$eval(`[data-group="${g}"]`, (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click(`[data-group="${g}"]`);
  }
  for (let i = 0; i < 20 && (await left()) > 0; i++) {
    const n = st.dismissed.length;
    await page.click('[data-ok]');
    for (let k = 0; k < 40 && st.dismissed.length === n; k++) await page.waitForTimeout(25);
    await page.waitForTimeout(30);
  }
  await page.waitForSelector('.qc-box.is-success', { timeout: 3000 });
  ok(/^No problems found in 30 sections\. \d+ issues are marked as OK\.$/.test(await QC.txt(page, '.qc-box.is-success .qc-sub')), `55 E with marks: ${await QC.txt(page, '.qc-box.is-success .qc-sub')}`);
  ok(/^MARKED AS OK · \d+$/.test(await QC.txt(page, '[data-marked] .chip-label')), 'the aside lists them');
  ok((await page.$$('[data-justok]')).length > 0, 'the lines stay until the page is left');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
