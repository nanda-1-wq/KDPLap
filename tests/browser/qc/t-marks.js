// 51, 51b, 57: the shell for every step, and the 07 marks in the sidebar and the rail.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const LOCK = /<rect/;
  const row = (n) => page.$eval(`[data-step="${n}"]`, (a) => ({
    label: a.getAttribute('aria-label'), title: a.getAttribute('title'), cls: a.className, current: a.getAttribute('aria-current'),
    check: !!a.querySelector('.step-mark svg'), text: a.innerText.replace(/\s+/g, ' ').trim(),
    tag: !!a.querySelector('.step-flag.is-tag'), tagIcon: !!a.querySelector('.step-flag.is-tag svg'),
    dotShown: (() => { const d = a.querySelector('.step-dot'); return !!d && getComputedStyle(d).display !== 'none'; })(),
    ring: getComputedStyle(a.querySelector('.step-mark'), '::before').content !== 'none' && getComputedStyle(a.querySelector('.step-mark'), '::before').display !== 'none'
  }));
  const waitLabel = (want) => page.waitForFunction((w) => document.querySelector('[data-step="7"]').getAttribute('aria-label') === w, want, { timeout: 4000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  st.book.current_step = 6;

  /* The sidebar lists 01 to 09, in the design's groups. */
  await QC.open7(page);
  const heads = await QC.all(page, '.step-group-head .group-name, .group-row .group-name');
  ok(heads.join() === 'PLAN,PRODUCE,PACKAGE,RELEASE', `groups: ${heads}`);
  ok((await QC.all(page, '.group-row .version-tag')).join() === 'Coming in v3', 'RELEASE: Coming in v3');
  const links = await page.$$eval('a[data-step]', (a) => a.map((x) => x.dataset.step));
  ok(links.join() === '1,2,3,4,5,6,7', `links 01 to 07: ${links}`);
  const coming = await QC.all(page, '[data-coming]');
  ok(coming.join('|').replace(/ ,/g, ',') === '08 Format, Coming next|09 Cover, Coming next', `08 and 09: ${coming.join('|')}`);
  ok(await page.$$eval('[data-coming]', (r) => r.every((x) => x.tagName === 'DIV' && x.getAttribute('aria-disabled') === 'true' && x.tabIndex === -1)), '08 and 09 are not links');
  ok(LOCK.test(await page.$eval('[data-coming="9"] .step-mark', (e) => e.innerHTML)), '09 shows the lock');
  ok(!(await page.$eval('[data-coming="8"] .step-mark', (e) => e.innerHTML)), '08 shows the open circle');
  await page.$eval('[data-coming="8"]', (d) => d.click());
  ok(/step=7/.test(page.url()), 'a click on 08 does nothing');

  /* Current and not run: the dot. No sideways scroll in the sidebar. */
  let r = await row(7);
  ok(r.label === '07 Quality Control, not run' && r.current === 'step' && !r.check, `07 current, not run: ${JSON.stringify(r)}`);
  ok(await page.$eval('.book-nav', (n) => n.scrollWidth <= n.clientWidth), 'the sidebar does not scroll sideways');

  /* Run: done, with warnings. On its own screen the row shows the check (design 53). */
  st.sample();
  await QC.open7(page);
  await QC.run(page);
  await waitLabel('07 Quality Control, done');
  r = await row(7);
  ok(r.check && !r.ring && r.current === 'step', `07 current and done: the check: ${JSON.stringify(r)}`);
  ok(await QC.has(page, '.qc-verdict'), 'a run with warnings is still done');

  /* Export opens the Word / Markdown dialog. */
  await page.click('[data-export]');
  await page.waitForSelector('dialog[open]', { timeout: 5000 });
  await page.waitForFunction(() => /Word/.test(document.querySelector('dialog[open]').innerText), null, { timeout: 5000 });
  ok((await QC.txt(page, 'dialog[open]')).includes('Export book'), '07 Export: the Word / Markdown dialog');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 3000 });

  /* Back → 06: the rail with every step. */
  await page.click('[data-back]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Write', null, { timeout: 5000 });
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '06 folds to the rail');
  const rail = await page.$$eval('.book-nav [data-step], .book-nav [data-coming]', (a) => a.map((x) => { const b = x.getBoundingClientRect(); return [x.querySelector('.step-num').textContent, Math.round(b.width), Math.round(b.height), getComputedStyle(x).display]; }));
  ok(rail.length === 9 && rail.every(([, w, h, d], i) => w === 52 && h === 52 && d !== 'none' && rail[i][0] === `0${i + 1}`), `rail 01 to 09: ${JSON.stringify(rail)}`);
  const gaps = await page.$$eval('.book-nav [data-step], .book-nav [data-coming]', (a) => a.slice(1).map((x, i) => Math.round(x.getBoundingClientRect().top - a[i].getBoundingClientRect().bottom)));
  ok(gaps.every((g) => g === 8), `rail rows 8 px apart: ${gaps}`);
  ok(!(await page.$$eval('.book-nav .version-tag', (t) => t.some((x) => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().height > 0))), 'no tag in the rail');
  ok(!(await page.$$eval('.book-layout.is-rail .group-name', (t) => t.some((x) => x.getBoundingClientRect().height > 0))), 'no group names in the rail');
  ok(await page.$eval('.saved-line', (e) => e.getBoundingClientRect().bottom > e.parentElement.closest('.book-nav').getBoundingClientRect().bottom - 80), 'the save check stays at the rail bottom');
  r = await row(7);
  ok(r.label === '07 Quality Control, done' && r.title === '07 Quality Control, done' && r.check && !r.dotShown, `rail 07 done: ${JSON.stringify(r)}`);
  ok(LOCK.test(await page.$eval('[data-coming="9"] .step-mark', (e) => e.innerHTML)), 'rail 09: the lock');

  /* 2 s after 06 saves a version: out of date. A draft alone reads nothing. */
  await page.waitForSelector('[data-editor]', { timeout: 5000 });
  await page.waitForTimeout(2300);   // the read after the step opened
  const m0 = st.marks;
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' New words.');
  await page.waitForFunction(() => document.querySelector('[data-save-version]') && !document.querySelector('[data-save-version]').disabled, null, { timeout: 3000 });
  for (let i = 0; i < 80 && !st.writes.some((w) => w.table === 'section_drafts'); i++) await page.waitForTimeout(50);
  ok(st.writes.some((w) => w.table === 'section_drafts'), 'a draft was saved');
  await page.waitForTimeout(2300);
  ok(st.marks === m0, `a draft does not read the mark (${st.marks - m0})`);
  await page.click('[data-save-version]');
  for (let i = 0; i < 40 && !st.writes.some((w) => w.fn === 'save_version'); i++) await page.waitForTimeout(25);
  await page.waitForTimeout(1200);
  ok((await row(7)).label === '07 Quality Control, done', 'still done 1 s after the save');
  ok(st.marks === m0, 'no read before 2 s');
  await waitLabel('07 Quality Control, out of date');
  ok(st.marks === m0 + 1, `one read after the save (${st.marks - m0})`);
  r = await row(7);
  ok(r.title === '07 Quality Control, out of date', 'hover shows the full name');
  ok(r.dotShown && !r.check && !r.tag === false, `rail 07 out of date: amber dot: ${JSON.stringify(r)}`);
  ok(await page.$eval('.step-dot', (d) => { const b = d.getBoundingClientRect(); return getComputedStyle(d).backgroundColor === 'rgb(138, 90, 0)' && Math.round(b.width) === 8; }), 'rail dot: 8 px, --warning');
  const dotRow = await page.$eval('[data-step="7"]', (a) => { const x = a.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; });
  ok(dotRow.join() === '52,52', `the rail row stays 52 × 52: ${dotRow}`);

  /* The full sidebar on 06: tag with an icon and a word (V5). */
  await page.click('[data-rail-toggle]');
  r = await row(7);
  ok(r.tag && r.tagIcon && /Out of date/.test(r.text) && !r.dotShown, `sidebar 07 out of date: ${JSON.stringify(r)}`);
  ok(r.ring, 'sidebar 07 out of date: the open circle');
  ok(await page.$eval('.step-flag.is-tag', (t) => { const c = getComputedStyle(t); return c.color === 'rgb(138, 90, 0)' && c.backgroundColor === 'rgb(253, 243, 220)'; }), 'tag colors');
  ok(await page.$eval('[data-rail-toggle]', (b) => !b.hidden), 'the toggle is there on 06');
  await page.click('[data-rail-toggle]');

  /* 06 Next → 07 (the writer's text is saved first), Next writes current_step. */
  await page.click('[data-editor]');
  await page.keyboard.type(' More.');
  await page.waitForFunction(() => document.querySelector('[data-next]') && !document.querySelector('[data-next]').disabled, null, { timeout: 3000 });
  globalThis.__modes.versionSlow = 400;
  await page.click('[data-next]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  ok(/step=7/.test(page.url()), '06 Next opens 07');
  ok(await page.$eval('.book-nav', (n) => n.getBoundingClientRect().width > 200) && !(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail'))), '07 has the full sidebar');
  ok(await page.$eval('[data-rail-toggle]', (b) => b.hidden), 'no toggle on 07');
  await page.waitForSelector('.qc-box.is-warning', { timeout: 5000 });
  globalThis.__modes.versionSlow = 0;
  ok(st.book.current_step === 7, '06 Next writes current_step 7');
  const edits = st.writes.filter((w) => w.fn === 'save_version').length;
  ok(edits === 2, `leaving 06 saved the typed text first: ${edits}`);
  ok(/^You changed /.test(await QC.txt(page, '.qc-box.is-warning .qc-sub')), '07 sees the version 06 saved on leaving');

  /* Current and out of date: the dot, and the tag. */
  r = await row(7);
  ok(r.label === '07 Quality Control, out of date' && r.tag && !r.check, `07 current, out of date: ${JSON.stringify(r)}`);

  /* A step change reads the mark: another tab ran the checks. */
  const m1 = st.marks;
  st.runs[0].versions = st.sections().filter((s) => s.version).map((s) => s.version.id);
  await page.click('[data-step="5"]');
  await waitLabel('07 Quality Control, done');
  ok(st.marks === m1 + 1, 'one read per step change');
  r = await row(7);
  ok(r.check && r.current === null, `not current, done: ${JSON.stringify(r)}`);

  /* A failed read keeps the mark. */
  globalThis.__modes.markFail = true;
  await page.click('[data-step="4"]');
  await page.waitForTimeout(200);
  ok((await row(7)).label === '07 Quality Control, done', 'a failed read keeps the mark');
  globalThis.__modes.markFail = false;

  /* The focus stays on the row when the mark changes. */
  st.key = '0'.repeat(31) + '9';
  await page.focus('[data-step="7"]');
  await page.click('[data-step="3"]');
  await page.focus('[data-step="7"]');
  await waitLabel('07 Quality Control, out of date');
  ok(await page.evaluate(() => document.activeElement.dataset.step === '7'), 'the focus stays on 07 when its mark changes');

  /* Back from every step still works, and 01 to 05 keep their full sidebar. */
  for (const n of [1, 2, 3, 4, 5]) {
    await page.click(`[data-step="${n}"]`);
    await page.waitForFunction((t) => document.querySelector('[data-step-title]').textContent === t, ['Brief', 'Research', 'Positioning', 'Title', 'Outline'][n - 1], { timeout: 5000 });
    ok(!(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail'))), `step ${n}: full sidebar`);
  }

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
