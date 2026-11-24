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
  // E16 Part 4: 08 is not the last step any more: Next is on and opens 09 (the 09 suite checks 09 itself).
  const nx = await page.$eval('[data-next]', (b) => ({ dis: b.disabled, aria: b.getAttribute('aria-disabled'), tip: !!b.querySelector('.tip'), by: b.getAttribute('aria-describedby') }));
  ok(!nx.dis && nx.aria === null && !nx.tip && nx.by === 'nextNote', `Next: on, no "Coming next" tip (${JSON.stringify(nx)})`);
  // E13.3 Q4: a current EPUB and no Print PDF: the header, the rail and the sidebar are unchanged (08 = Print PDF only).
  st.lastEpub = { id: 'e0000000-0000-4000-8000-0000000000e1', created_at: new Date().toISOString(), settings_key: st.epubKey(), engine: 'epub3 · e1', parts: {}, snapshot: {} };
  await FM.open(page);
  await page.waitForFunction(() => /Print PDF/.test(document.querySelector('[data-next-note]').textContent), null, { timeout: 5000 });
  const q4 = await page.evaluate(() => ({ note: document.querySelector('[data-next-note]').textContent.trim(), done: document.querySelector('[data-step="8"]').classList.contains('is-done'), check: !!document.querySelector('[data-step="8"] .step-mark svg'), typeOk: typeof kdpEpubCheck === 'object' && typeof kdpEpubCheck.domWellFormed === 'function' }));
  ok(q4.note === 'Not done yet: export the Print PDF.' && !q4.done && !q4.check, `E13.3 Q4: a current EPUB does not make 08 done (${JSON.stringify(q4)})`);
  ok(q4.typeOk, 'E13.3 book.html loads js/format/epub-check.js');
  st.lastEpub = null;
  await FM.open(page);

  /* Rail (51b): 01 to 09, 08 current with the dot, 09 the lock, not a link. */
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '08 folds to the rail');
  const rail = await page.$$eval('.book-nav [data-step]', (a) => a.map((x) => x.querySelector('.step-num').textContent));
  ok(rail.join() === '01,02,03,04,05,06,07,08,09', `rail 01 to 09, all links (E16 Part 4): ${rail}`);
  ok(await page.$eval('[data-step="8"]', (a) => a.tagName === 'A' && a.getAttribute('aria-current') === 'step'), '08 is a link, the current step');
  const s9 = await page.$eval('[data-step="9"]', (a) => [a.tagName, a.querySelector('.step-mark').innerHTML]);
  ok(s9[0] === 'A' && !LOCK.test(s9[1]), '09: a link, no lock (E16 Part 4)');
  ok(!(await page.$('[data-coming]')), 'no Coming next row');
  const dims = await page.$eval('[data-step="8"]', (a) => { const b = a.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  ok(dims.join() === '52,52', `rail 08: 52 × 52 (${dims})`);

  /* The full sidebar: 08 Format with its reason, 09 Cover, RELEASE Coming in v3. */
  await page.click('[data-rail-toggle]');
  ok((await FM.txt(page, '[data-step="8"]')).replace(/ ,/g, ',') === '08 Format, Export the Print PDF', `sidebar 08: ${await FM.txt(page, '[data-step="8"]')}`);
  ok((await FM.txt(page, '[data-step="9"]')).startsWith('09 Cover'), `09 Cover (${await FM.txt(page, '[data-step="9"]')})`);
  ok((await FM.all(page, '.group-row .version-tag')).join() === 'Coming in v3', 'RELEASE: Coming in v3');
  await page.click('[data-rail-toggle]');

  /* A Print PDF that is current: done (check), no note (E16: Next opens 09). Changed: the reason again. */
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  st.changed = false;
  await FM.open(page);
  for (let i = 0; i < 80 && (await note()) !== ''; i++) await page.waitForTimeout(50);
  ok((await note()) === '' && await page.$eval('[data-next-note]', (n) => n.hidden), `a current Print PDF: no note (${await note()})`);
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
  ok((await FM.all(page, '.exp-elsewhere')).join('|') === 'Print PDF Made in 08 Format|EPUB Made in 08 Format' && await page.$eval('.exp-08-epub', (a) => /book\.html\?id=.+&step=8$/.test(a.getAttribute('href')) && a.getBoundingClientRect().height >= 44), 'E13.3 E11 dialog: EPUB, Made in 08 Format, a 44 px link to step 8');
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
