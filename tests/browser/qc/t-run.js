// 52 → 55 A → 53: the run, the row sent, the results.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 1300 });
  st.sample();
  st.dismiss('under_target', 'x|y', 'never matches');
  await QC.open7(page);

  // Under 300 ms: no running state at all (no flash, no fake wait).
  await page.evaluate(() => {
    window.__sawRunning = false;
    new MutationObserver(() => { if (document.querySelector('[data-running]')) window.__sawRunning = true; })
      .observe(document.querySelector('[data-qc]'), { childList: true, subtree: true });
  });
  await QC.run(page);
  ok(!(await page.evaluate(() => window.__sawRunning)), 'a fast run shows no running state');

  // The row sent.
  const sent = st.writes.find((w) => w.table === 'qc_runs').body;
  const today = st.sections().filter((s) => s.version).map((s) => s.version.id);
  ok(JSON.stringify(sent.versions) === JSON.stringify(today), 'versions: today\'s list, in book order');
  ok(sent.inputs_key === st.key, 'inputs_key: from qc_json');
  ok(sent.book_id === QB && !('user_id' in sent), 'book_id sent, user_id left to the default');
  ok(Object.keys(sent.results).sort().join() === 'items,more,notes,sources', `results keys: ${Object.keys(sent.results)}`);
  ok(sent.sections === today.length && sent.words > 8000 && sent.style === 'classic', `counts: ${sent.sections}, ${sent.words}, ${sent.style}`);
  ok(sent.results.items.every((x) => x.g !== 6), 'no group 6 item in a free run');

  // 53.
  const issues = sent.results.items.length;
  ok((await QC.txt(page, '.qc-verdict strong')).startsWith(`Ready for Format, with ${issues} warning`), `verdict: ${await QC.txt(page, '.qc-verdict strong')}`);
  const sub = await QC.txt(page, '.qc-verdict-text span');
  ok(new RegExp(`^Checked ${today.length} sections with text · [A-Z][a-z]{2} \\d+, \\d+:\\d\\d [AP]M · Warnings never block 08\\.$`).test(sub), `verdict line: ${sub}`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-verdict')), 'focus moves to the verdict');
  ok(await page.$eval('.qc-verdict', (e) => e.getAttribute('role') === 'status'), 'verdict is a status');

  const rows = await QC.all(page, '.qc-gb');
  ok(rows.length === 7, `7 groups: ${JSON.stringify(rows)}`);
  const by = (g) => rows.find((r) => r.startsWith(`${g} `)) || '';
  ok(/^1 Complete \d+ to check$/.test(by(1)), `group 1: ${by(1)}`);
  ok(/^2 Sources 1 Verify mark left 1 source named$/.test(by(2)), `group 2: ${by(2)}`);
  ok(/^3 Repeats \d+ to check$/.test(by(3)), `group 3: ${by(3)}`);
  ok(/^4 Pointers All clear$/.test(by(4)), `group 4: ${by(4)}`);
  ok(/^5 Consistency 1 to check$/.test(by(5)), `group 5: ${by(5)}`);
  ok(/^6 Promise Not run · AI, paid$/.test(by(6)), `group 6: ${by(6)}`);
  ok(/^7 KDP rules \d+ to check$/.test(by(7)), `group 7: ${by(7)}`);

  // The first group with issues opens (V6); the others stay shut.
  const open = await page.$$eval('.qc-gb', (bs) => bs.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.dataset.group));
  ok(open.join() === '1', `first group with issues opens: ${open}`);
  const r1 = await QC.all(page, '#qc-g1 .qc-it');
  ok(r1.some((t) => /^3\.2 Spaced practice part 2 Draft, not Final\. Only Final sections go into the book in 08\. Open in 06 Mark as OK$/.test(t)), `row 3.2: ${JSON.stringify(r1)}`);
  ok(r1.some((t) => /^5\.1 .* Needs review: written before 03 Positioning changed\./.test(t)), 'row 5.1 needs review');
  ok(r1.some((t) => /^7\.3 .*under 80% of its target\./.test(t)), 'row 7.3 under target');

  // A group opens on click, and the choice stays through a run.
  await page.click('[data-group="7"]');
  ok(await page.$eval('[data-group="7"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'group 7 opens');
  ok(await page.evaluate(() => document.activeElement.dataset.group === '7'), 'focus stays on the group');
  const kdp = await QC.all(page, '#qc-g7 .qc-it');
  ok(kdp.some((t) => /A web link in print text\. Paperback readers cannot click it\. Open in 06 Mark as OK$/.test(t)), `web link row: ${JSON.stringify(kdp)}`);
  ok(kdp.some((t) => /^Whole book The topic is close to health, and the book has no disclaimer\. How to add one Coming next Mark as OK$/.test(t)), 'disclaimer row: How to add one, Coming next (V9)');
  ok(!(await page.$('#qc-g7 a[data-how]')), 'How to add one is not a link yet');
  ok(/^3\.4 /.test(kdp[0]) && /^Whole book/.test(kdp[1]), 'book-wide rows come after the sections (design 53)');
  await page.click('[data-group="1"]');
  await page.click('.qc-verdict [data-run]');
  await page.waitForFunction(() => !document.querySelector('[data-running]') && document.querySelector('.qc-verdict [data-run]') && !document.querySelector('.qc-verdict [data-run]').disabled, null, { timeout: 5000 });
  const kept = await page.$$eval('.qc-gb', (bs) => bs.filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.dataset.group));
  ok(kept.join() === '7', `the choices stay: ${kept}`);
  await page.click('[data-group="1"]');

  // Group 6 and the promise card: drawn, off.
  await page.click('[data-group="6"]');
  ok((await QC.txt(page, '#qc-g6')) === 'Comes in the next part.', 'group 6: Comes in the next part.');
  ok(await page.$eval('.qc-side .qc-side-card button', (b) => b.disabled), 'promise card button is off');
  ok(/Checks each of the 7 chapters against your locked promise\./.test(await QC.txt(page, '.qc-side .qc-side-card')), 'promise card counts chapters');
  ok((await QC.all(page, '.qc-side .is-soft .chip-label'))[0] === 'SOURCES NAMED IN THE TEXT', 'sources note');
  ok(/^Approximate\. Built from source names/.test(await QC.txt(page, '.qc-side .is-soft .qc-note')), 'sources note text');
  ok(!(await page.$('[data-marked]')), 'a dismissal that matches nothing is not listed');

  // Open in 06 selects the section. The spot and the QC bar come in E14.4.
  await page.click('#qc-g1 .qc-it:first-child [data-open]');
  await page.waitForFunction(() => document.querySelector('[data-sec-title]') && document.querySelector('[data-editor]'), null, { timeout: 5000 });
  ok((await QC.txt(page, '[data-step-label]')) === 'PRODUCE · STEP 6 OF 11', 'Open in 06 goes to 06');
  const first = sent.results.items[0];
  const want = st.sections().find((s) => s.id === first.section_id);
  ok(page.url().includes(`section=${want.id}`), 'the URL holds the section');
  ok((await QC.txt(page, '[data-sec-title]')).includes(want.title), `section title: ${await QC.txt(page, '[data-sec-title]')}`);

  // Back in 07 the run is still there, and another section opens from a section already open.
  await page.click('[data-step="7"]');
  await page.waitForSelector('.qc-verdict');
  ok(await page.$eval('[data-group="1"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'back in 07: the groups are as left');
  await page.click('#qc-g1 .qc-it:nth-child(2) [data-open]');
  const second = sent.results.items[1];
  const other = st.sections().find((s) => s.id === second.section_id);
  await page.waitForFunction((id) => location.search.includes(id), other.id, { timeout: 5000 });
  await page.waitForFunction((t) => { const e = document.querySelector('[data-sec-title]'); return e && e.textContent.includes(t); }, other.title, { timeout: 5000 });
  ok(true, 'Open in 06 moves to another section');

  // The note: QC reads saved text. Slow read: 55 A shows, past 300 ms.
  await page.click('[data-step="7"]');
  await page.waitForSelector('.qc-verdict');
  st.section('2.3').unsaved = true;
  st.section('2.4').run = { started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() };
  globalThis.__modes.qcSlow = 900;
  const at = Date.now();
  await page.click('.qc-verdict [data-run]');
  await page.waitForTimeout(150);
  ok(!(await page.$('[data-running]')), '55 A: not yet at 150 ms');
  await page.waitForSelector('[data-running]', { timeout: 1000 });
  ok(Date.now() - at >= 290, `55 A: after 300 ms (${Date.now() - at} ms)`);
  ok((await QC.txt(page, '[data-running] [data-run-title]')) === 'Checking 30 sections', `running title: ${await QC.txt(page, '[data-running] [data-run-title]')}`);
  ok((await QC.txt(page, '[data-running] [data-run-text]')) === 'Reading your book…', 'running text during the read');
  ok(await page.$eval('[data-running]', (e) => e.getAttribute('role') === 'status'), 'running is a status');
  globalThis.__modes.qcSlow = 0;
  await page.waitForSelector('.qc-verdict', { timeout: 5000 });
  ok((await QC.txt(page, '[data-qc-note]')) === 'QC checked saved text. 1 section has unsaved changes and 1 section is being written.', `note: ${await QC.txt(page, '[data-qc-note]')}`);

  // Leaving during a run: it still saves, and the mark follows.
  globalThis.__modes.runSlow = 500;
  const n = st.runs.length;
  await page.click('.qc-verdict [data-run]');
  await page.waitForTimeout(100);
  await page.click('[data-step="5"]');
  for (let i = 0; i < 40 && st.runs.length === n; i++) await page.waitForTimeout(50);
  globalThis.__modes.runSlow = 0;
  ok(st.runs.length === n + 1, 'a run keeps going after leaving the step');

  // Caps: "and N more".
  st.addRun({ items: [{ g: 1, rule: 'not_final', key: 'a|b', section_id: null, version_id: null, start: null, end: null, message: 'One row.', quote: '' }], more: { 1: 12 }, sources: [], notes: { unsaved: 0, running: 0 } }, { created_at: new Date().toISOString() });
  await page.click('[data-step="7"]');
  await page.waitForSelector('.qc-verdict');
  ok((await QC.txt(page, '.qc-verdict strong')) === 'Ready for Format, with 13 warnings', 'verdict counts the rest');
  await page.click('[data-group="1"]');
  if ((await page.$eval('[data-group="1"]', (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click('[data-group="1"]');
  ok((await QC.txt(page, '#qc-g1 .qc-more')) === 'and 12 more', '"and 12 more"');
  ok(/13 to check/.test(await QC.txt(page, '[data-group="1"]')), 'chip counts the rest');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
