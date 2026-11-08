// 55 B, C, E, the load error, the save error, qc_stale, a removed section.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 1000 });

  /* C: no text. No run is saved, Next stays as on any 07 visit. */
  const texts = st.sections().map((s) => [s, s.version]);
  st.sections().forEach((s) => { s.version = null; });
  await QC.open7(page);
  ok((await QC.txt(page, '.qc-box.is-plain strong')) === 'Nothing to check yet', '55 C title');
  ok((await QC.txt(page, '.qc-box.is-plain .qc-sub')) === 'Quality Control checks sections that have text. Write at least one section in 06 Write.', '55 C text');
  ok(!(await page.$('[data-run]')), '55 C: nothing to run');
  ok(await page.$eval('[data-next]', (b) => !b.disabled) && await page.$eval('[data-next-note]', (n) => n.hidden), '55 C: the header is the same (Next on, no note)');
  await page.click('[data-go="6"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Write', null, { timeout: 5000 });
  ok(true, 'Go to 06 Write opens 06');
  ok(!st.writes.some((w) => w.table === 'qc_runs'), '55 C: no run saved');
  texts.forEach(([s, v]) => { s.version = v; });

  /* A run with the last text gone: Run checks ends on 55 C, nothing saved. */
  await QC.open7(page);
  ok(await QC.has(page, '.qc-first'), 'text back: 52');
  const keep = st.sections().map((s) => [s, s.version]);
  st.sections().forEach((s) => { s.version = null; });
  await page.click('[data-run]');
  await page.waitForSelector('.qc-box.is-plain', { timeout: 5000 });
  ok(!st.writes.some((w) => w.table === 'qc_runs'), 'text gone during a visit: 55 C, no run saved');
  keep.forEach(([s, v]) => { s.version = v; });

  /* E: all pass. */
  await QC.open7(page);
  await QC.run(page);
  ok((await QC.txt(page, '.qc-box.is-success strong')) === 'Ready for Format', '55 E title');
  ok(await page.$eval('.qc-box.is-success strong', (e) => !!e.querySelector('svg[aria-hidden="true"]') && e.firstElementChild.tagName === 'svg'), '55 E: the success icon sits before the title (owner, STOP 6 Q3)');
  ok((await QC.txt(page, '.qc-box.is-success .qc-sub')) === 'No problems found in 30 sections.', `55 E text: ${await QC.txt(page, '.qc-box.is-success .qc-sub')}`);
  ok(await page.$eval('.qc-box.is-success a[data-go="8"]', (a) => a.textContent === 'Go to 08 Format' && a.classList.contains('btn-primary') && /[?&]step=8$/.test(a.getAttribute('href'))), 'Go to 08 Format is a live button (E13.2)');
  ok(!(await page.$('.qc-box.is-success .version-tag')), 'no Coming next tag');
  ok((await QC.all(page, '.qc-main > .qc-note'))[0] === 'Promise check not run. It is optional.', 'the promise line is a suggestion');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-verdict')), '55 E: focus on the verdict');
  const clear = await QC.all(page, '.qc-gb');
  ok(clear.filter((t) => /All clear/.test(t)).length === 6, `every free group is clear: ${JSON.stringify(clear)}`);
  ok(await page.$$eval('.qc-gb', (bs) => bs.every((b) => b.getAttribute('aria-expanded') === 'false')), 'no group opens by itself');
  await page.click('[data-group="4"]');
  ok((await QC.txt(page, '#qc-g4')) === 'No issues here.', 'an open clear group says so');

  /* B: one section changed. */
  const lastDate = new Date(st.runs[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  st.edit(st.section('3.2'), st.section('3.2').version.content + ' New words here today.');
  await QC.open7(page);
  ok((await QC.txt(page, '.qc-box.is-warning strong')) === 'Out of date', '55 B title');
  ok((await QC.txt(page, '.qc-box.is-warning .qc-sub')) === `You changed 3.2 Spaced practice part 2 after the last run on ${lastDate}. These results may be wrong.`, `55 B text: ${await QC.txt(page, '.qc-box.is-warning .qc-sub')}`);
  ok(await page.$eval('.qc-box.is-warning', (e) => e.getAttribute('role') === 'status'), '55 B is a status');
  ok(await QC.has(page, '.qc-groups.is-old'), 'old results stay, grayed');
  ok(await page.$eval('.qc-groups.is-old .qc-gt', (e) => getComputedStyle(e).color === 'rgb(117, 117, 111)'), 'grayed with --muted');
  ok(await page.$eval('.qc-box.is-warning [data-run]', (b) => b.classList.contains('btn-primary')), 'Run again is the main button');

  /* B: three sections changed. */
  st.edit(st.section('1.1'), st.section('1.1').version.content + ' More new words.');
  st.edit(st.section('6.1'), st.section('6.1').version.content + ' Even more new words.');
  await QC.open7(page);
  ok(/^You changed 1\.1 Start small part 1 and 2 more sections after the last run on /.test(await QC.txt(page, '.qc-box.is-warning .qc-sub')), `55 B many: ${await QC.txt(page, '.qc-box.is-warning .qc-sub')}`);

  /* Run again clears it. */
  await QC.run(page);
  ok(await QC.has(page, '.qc-box.is-success') && !(await page.$('.qc-groups.is-old')), 'Run again: current');

  /* B: only the inputs moved. */
  st.key = '0'.repeat(31) + '2';
  await QC.open7(page);
  ok(/^Your outline, Brief, Research, a section's status or 08 settings changed after the last run on /.test(await QC.txt(page, '.qc-box.is-warning .qc-sub')), `55 B inputs: ${await QC.txt(page, '.qc-box.is-warning .qc-sub')}`);

  /* qc_stale: nothing saved, the writer sees why, and Run again works. */
  await QC.run(page).catch(() => {});
  st.section('3.2').status = 'draft';
  st.key = '0'.repeat(31) + '3';
  await QC.open7(page);
  globalThis.__modes.stale = 1;
  const runs = st.runs.length;
  await page.click('[data-run]');
  await page.waitForSelector('.alert[role="alert"]', { timeout: 5000 });
  ok((await QC.txt(page, '.alert')) === 'Your book changed while the checks ran. Run again.', `qc_stale: ${await QC.txt(page, '.alert')}`);
  ok(st.runs.length === runs, 'qc_stale: nothing saved');
  ok(await page.$eval('[data-next]', (b) => !b.disabled), 'qc_stale: the shell is untouched (Next stays on, E13.2)');
  await QC.run(page);
  ok(!(await page.$('.alert')) && st.runs.length === runs + 1, 'qc_stale: Run again saves');

  /* Save error: results show, with Retry. */
  st.edit(st.section('3.3'), st.section('3.3').version.content + ' Words.');
  await QC.open7(page);
  globalThis.__modes.runFailN = 1;
  await page.click('[data-run]');
  await page.waitForSelector('.alert[role="alert"]', { timeout: 5000 });
  ok((await QC.txt(page, '.alert')) === "We couldn't save this run. Step 07 is not marked done. Retry", `save error: ${await QC.txt(page, '.alert')}`);
  ok(await QC.has(page, '.qc-verdict'), 'save error: the results show');
  ok(!(await page.$('.qc-groups.is-old')), 'save error: this run is not grayed');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-retry-save')), 'save error: focus on Retry');
  ok(await page.$eval('a[data-step="7"]', (a) => a.getAttribute('aria-label') === '07 Quality Control, out of date'), 'save error: 07 is not marked done');
  await page.click('[data-retry-save]');
  await page.waitForFunction(() => !document.querySelector('.alert'), null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('a[data-step="7"]').getAttribute('aria-label') === '07 Quality Control, done', null, { timeout: 5000 });
  ok(true, 'Retry saves, and 07 is done');

  /* A failed save, then the book changes: Retry says qc_stale. */
  st.edit(st.section('3.3'), st.section('3.3').version.content + ' More.');
  await QC.open7(page);
  globalThis.__modes.runFailN = 1;
  await page.click('[data-run]');
  await page.waitForSelector('[data-retry-save]', { timeout: 5000 });
  st.edit(st.section('3.3'), st.section('3.3').version.content + ' And more.');
  await page.click('[data-retry-save]');
  await page.waitForFunction(() => /changed while the checks ran/.test((document.querySelector('.alert') || {}).textContent || ''), null, { timeout: 5000 });
  ok(await QC.has(page, '.qc-box.is-warning'), 'Retry on a changed book: stale line, and 55 B');

  /* A removed section: the old row has no link. */
  await QC.run(page);
  const gone = st.section('7.4');
  const ch = st.chapters.find((c) => c.sections.includes(gone));
  st.addRun({ items: [{ g: 1, rule: 'not_final', key: `${gone.id}|${gone.version.id}`, section_id: gone.id, version_id: gone.version.id, start: null, end: null, message: 'Draft, not Final. Only Final sections go into the book in 08.', quote: '' }], more: {}, sources: [], notes: { unsaved: 0, running: 0 } }, { created_at: new Date().toISOString() });
  ch.sections = ch.sections.filter((s) => s !== gone);
  await QC.open7(page);
  const row = await QC.all(page, '#qc-g1 .qc-it');
  ok(row.length === 1 && /^Removed section Draft, not Final\./.test(row[0]) && !/Open in 06/.test(row[0]), `removed: ${JSON.stringify(row)}`);
  ok(/^Your outline, Brief, Research, a section's status or 08 settings changed/.test(await QC.txt(page, '.qc-box.is-warning .qc-sub')), 'a removed section is an outline change');
  await page.click('#qc-g1 [data-ok]');
  for (let i = 0; i < 40 && !st.writes.some((w) => w.table === 'qc_dismissed'); i++) await page.waitForTimeout(25);
  ok(st.writes.find((w) => w.table === 'qc_dismissed').body.section_id === null, 'Mark as OK on a removed section sends no section');

  /* Load error, Retry. */
  globalThis.__modes.qcFail = 1;
  await QC.open(page, 7);
  await page.waitForSelector('.state-box[role="alert"]', { timeout: 10000 });
  ok((await QC.txt(page, '.state-box h2')) === "We couldn't load Quality Control", 'load error title');
  ok((await QC.txt(page, '.state-box p')) === 'Check your connection, then try again.', 'load error text');
  ok(await page.$eval('[data-next]', (b) => !b.disabled) && await QC.has(page, '[data-step="7"]'), 'load error: the shell stays (Next stays on, E13.2)');
  await page.click('[data-reload]');
  await page.waitForSelector('.qc-box.is-warning, .qc-verdict, .qc-box.is-success', { timeout: 5000 });
  ok(true, 'Retry loads');

  /* A read error on Run checks: no state lost. */
  globalThis.__modes.qcFail = 1;
  await page.click('[data-run]');
  await page.waitForSelector('.alert-error', { timeout: 5000 });
  ok(/We couldn't read your book/.test(await QC.txt(page, '.alert-error')), 'a failed read says so');

  /* Skeleton while qc_json loads. */
  globalThis.__modes.qcSlow = 600;
  await page.goto(QC.url(7), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-qc] .skel', { timeout: 5000 });
  ok((await QC.txt(page, '[data-qc] [role="status"]')) === 'Loading Quality Control…', 'skeleton with a status line');
  globalThis.__modes.qcSlow = 0;

  /* A chapter that needs review (Q8): no section, its own link, its name on the row. */
  await QC.open7(page);
  st.chapters[3].needs_review = true;
  st.key = '0'.repeat(31) + '7';
  st.dismissed = [];
  await QC.open7(page);
  await QC.run(page);
  if ((await page.$eval('[data-group="1"]', (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click('[data-group="1"]');
  const rv = (await QC.all(page, '#qc-g1 .qc-it')).find((t) => t.startsWith('Chapter 3'));
  ok(/^Chapter 3 Chapter 3 needs review: planned before 03 Positioning changed\. Open it in 05 Outline\. Open in 05 Mark as OK$/.test(rv || ''), `chapter row: ${rv}`);
  await page.click('[data-go="5"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Outline', null, { timeout: 5000 });
  ok(true, 'Open in 05 opens 05');

  /* Another user's book: not found. */
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=c1c1c1c1-0000-4000-8000-000000000999&step=7`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.state-box', { timeout: 10000 });
  ok((await QC.txt(page, '.state-box h2')) === 'Book not found', 'not the user\'s book');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
