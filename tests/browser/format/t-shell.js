// 41 header, 51b rail, 51 sidebar: 08 in the shell. E13.2 Part 2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const LOCK = /<rect/;
  const note = () => FM.txt(page, '[data-next-note]');
  await page.setViewportSize({ width: 1440, height: 900 });
  await FM.open(page);

  /* Header (41): Back, PACKAGE · STEP 8 OF 11, Format, Export files, the reason line, Next. */
  ok((await FM.txt(page, '[data-step-label]')) === 'PACKAGE · STEP 8 OF 11' && (await FM.txt(page, '[data-step-title]')) === 'Format', 'PACKAGE · STEP 8 OF 11, Format');
  ok((await FM.txt(page, '[data-export]')) === 'Export files', 'header: Export files');
  ok((await note()) === 'Not done yet: export the Print PDF.', 'no Print PDF: the reason line');
  const nx = await page.$eval('[data-next]', (b) => ({ dis: b.disabled, aria: b.getAttribute('aria-disabled'), tip: (b.querySelector('.tip') || {}).textContent, by: b.getAttribute('aria-describedby') }));
  ok(!nx.dis && nx.aria === 'true' && nx.tip === 'Coming next' && nx.by === 'nextNote nextTip', `Next: focusable, off, "Coming next" tip (${JSON.stringify(nx)})`);
  await page.focus('[data-next]');
  ok(await page.$eval('[data-next] .tip', (t) => getComputedStyle(t).opacity === '1'), 'the tip shows on keyboard focus');
  await page.click('[data-next]', { force: true });   // aria-disabled: Playwright would wait
  await page.waitForTimeout(200);
  ok(/step=8/.test(page.url()) && st.book.current_step === 8, 'Next does nothing');

  /* Rail (51b): 01 to 09, 08 current with the dot, 09 the lock, not a link. */
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '08 folds to the rail');
  const rail = await page.$$eval('.book-nav [data-step], .book-nav [data-coming]', (a) => a.map((x) => x.querySelector('.step-num').textContent));
  ok(rail.join() === '01,02,03,04,05,06,07,08,09', `rail 01 to 09: ${rail}`);
  ok(await page.$eval('[data-step="8"]', (a) => a.tagName === 'A' && a.getAttribute('aria-current') === 'step'), '08 is a link, the current step');
  ok(await page.$eval('[data-coming="9"]', (d) => d.tagName === 'DIV' && d.getAttribute('aria-disabled') === 'true') && LOCK.test(await page.$eval('[data-coming="9"] .step-mark', (e) => e.innerHTML)), '09: the lock, not a link');
  ok(!(await page.$('[data-coming="8"]')), 'no Coming next row for 08');
  const dims = await page.$eval('[data-step="8"]', (a) => { const b = a.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  ok(dims.join() === '52,52', `rail 08: 52 × 52 (${dims})`);

  /* The full sidebar: 08 Format with its reason, 09 Coming next, RELEASE Coming in v3. */
  await page.click('[data-rail-toggle]');
  ok((await FM.txt(page, '[data-step="8"]')).replace(/ ,/g, ',') === '08 Format, Export the Print PDF', `sidebar 08: ${await FM.txt(page, '[data-step="8"]')}`);
  ok((await FM.txt(page, '[data-coming="9"]')).replace(/ ,/g, ',') === '09 Cover, Coming next', '09 Cover, Coming next');
  ok((await FM.all(page, '.group-row .version-tag')).join() === 'Coming in v3', 'RELEASE: Coming in v3');
  await page.click('[data-rail-toggle]');

  /* A Print PDF that is current: done (check), the note says Coming next. Changed: the reason again. */
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  st.changed = false;
  await FM.open(page);
  for (let i = 0; i < 80 && (await note()) !== 'Coming next'; i++) await page.waitForTimeout(50);
  ok((await note()) === 'Coming next', `a current Print PDF: Coming next (${await note()})`);
  await page.click('[data-step="7"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  ok(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done') && !!a.querySelector('.step-mark svg')), '08 done: the check');
  st.changed = true;
  await FM.open(page);
  await page.waitForFunction(() => /changed since/.test(document.querySelector('[data-next-note]').textContent), null, { timeout: 4000 });
  ok((await note()) === 'Not done yet: changed since your last PDF. Export it again.', 'changed: the reason line');
  st.lastPdf = null;
  st.changed = false;

  /* Back opens 07; 07's Next opens 08 and writes current_step 8. */
  st.book.current_step = 7;
  await FM.open(page);
  await page.click('[data-back]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  ok(/step=7/.test(page.url()), 'Back opens 07');
  ok((await FM.txt(page, '[data-export]')) === 'Export', '07 keeps "Export"');
  ok(await page.$eval('[data-next]', (b) => !b.disabled && b.getAttribute('aria-disabled') === null && !b.querySelector('.tip')), '07: Next is on');
  await page.click('[data-next]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 5000 });
  for (let i = 0; i < 40 && st.book.current_step !== 8; i++) await page.waitForTimeout(25);
  ok(/step=8/.test(page.url()) && st.book.current_step === 8, '07 Next opens 08 and writes current_step 8');
  ok((await FM.txt(page, '[data-export]')) === 'Export files', 'back on 08: Export files');

  /* Export files opens the 08 panel (Part 4, design 42); its Word row opens the E11 dialog, whose Print PDF row points to 08. */
  await page.waitForSelector('.fmt', { timeout: 5000 });
  await page.click('[data-export]');
  await page.waitForSelector('.fmt-exp[open] [data-docx]', { timeout: 10000 });
  ok((await FM.txt(page, '.fmt-exp[open] #fmtExpTitle')) === 'Export files', 'Export files opens the 08 panel');
  await page.click('.fmt-exp[open] [data-docx]');
  await page.waitForSelector('.exp-dialog[open]', { timeout: 5000 });
  await page.waitForSelector('.exp-08', { timeout: 5000 });
  ok((await FM.txt(page, '.exp-elsewhere')) === 'Print PDF Made in 08 Format', 'E11 dialog: Print PDF, Made in 08 Format');
  ok(await page.$eval('.exp-08', (a) => /book\.html\?id=.+&step=8$/.test(a.getAttribute('href')) && a.getBoundingClientRect().height >= 44), 'the link opens step 8, 44 px');
  await page.keyboard.press('Escape');

  /* A reload keeps step 8 in the URL. */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 8000 });
  ok(/step=8/.test(page.url()), 'a reload stays on 08');

  /* 900 px: the header, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(100);
  ok(await FM.noScroll(page), '900: no sideways scroll');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
