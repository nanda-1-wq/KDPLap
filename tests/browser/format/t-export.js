// 42: the Export files panel, the PDF checks before download, the record, and the 08 marks (50).
// E13.2 Part 4. The engine is real (from the checked cache).
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const panel = '.fmt-exp[open]';
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const openPanel = async () => { await page.click('[data-export]'); await page.waitForSelector(`${panel} [data-pdf]`, { timeout: 10000 }); };
  const rows = () => page.$$eval(`${panel} .fmt-exp-row`, (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  const records = () => st.writes.filter((w) => w.table === 'book_exports');
  const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const lastBlob = () => page.evaluate(async () => {
    const b = window.__blobs[window.__blobs.length - 1];
    if (!b) return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    const info = await kdpPdfCheck.read(bytes, { inflate: kdpPdfCheck.inflate });
    return { n: window.__blobs.length, head: String.fromCharCode(...bytes.slice(0, 5)), pages: info.pageCount.tree, size: bytes.length };
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await FM.open(page);
  await pages();

  /* The panel (42): title, the book line, three rows, the footer. */
  await openPanel();
  ok((await FM.txt(page, `${panel} #fmtExpTitle`)) === 'Export files', 'title: Export files');
  ok((await FM.txt(page, `${panel} [data-sub]`)) === 'Micro Study Habits for Busy Adult Learners · 6 × 9 in · white paper', `sub: ${await FM.txt(page, `${panel} [data-sub]`)}`);
  let r = await rows();
  ok(r[0] === 'Print PDF Paperback interior · fonts embedded · even page count Export', `Print PDF row: ${r[0]}`);
  ok(r[1] === 'EPUB Kindle ebook · clickable contents Comes next', `EPUB row: ${r[1]} (owner Q1)`);
  ok(r[2] === 'Word (.docx) For editing in other tools Export', `Word row: ${r[2]}`);
  ok((await FM.txt(page, `${panel} > .dialog-inner > .fmt-hint`)) === 'Its page count sets the spine of your cover. Each PDF is checked before it downloads: page size, fonts and even count.', 'footer (F8: no "opens 09 Cover" yet)');
  ok(await page.$eval(`${panel} [data-pdf]`, (b) => b.classList.contains('btn-primary')), 'first Export is the primary button');

  /* Export: build, check, record, download. */
  const dl = page.waitForEvent('download', { timeout: 60000 });
  globalThis.__modes.recordSlow = 1500;   // hold the last step, so the exporting row can be read
  await page.click(`${panel} [data-pdf]`);
  await page.waitForFunction(() => /Saving the export…/.test((document.querySelector('.fmt-exp[open] .fmt-exp-row') || {}).textContent || ''), null, { timeout: 30000 });
  const busyRow = (await rows())[0];
  ok(busyRow === 'Print PDF Saving the export… Cancel' && await page.$eval(`${panel} [role="progressbar"]`, (b) => b.getAttribute('aria-label') === 'Print PDF progress'), `exporting: ${busyRow}`);
  ok((await FM.txt(page, `${panel} .fmt-exp-rows > .fmt-hint`)) === 'One file at a time. Other rows wait.' && await page.$eval(`${panel} [data-docx]`, (b) => b.disabled), 'one file at a time: Word waits');
  globalThis.__modes.recordSlow = 0;
  const file = await dl;
  ok(file.suggestedFilename() === 'micro-study-habits-for-busy-adult-learners-print-6x9.pdf', `file name: ${file.suggestedFilename()}`);
  await page.waitForSelector(`${panel} .fmt-pill-ok`, { timeout: 10000 });
  const rec = records().pop().body;
  const b1 = await lastBlob();
  ok(b1.head === '%PDF-' && b1.pages === rec.page_count && rec.page_count % 2 === 0, `the file is a PDF of ${b1.pages} pages, as recorded`);
  const finals = st.sections().filter((x) => x.status === 'final').map((x) => x.version.id);
  ok(rec.format === 'pdf' && rec.include === 'final' && rec.engine === 'typst 0.14.2 · t1' && rec.settings_key === '0'.repeat(31) + '1' && JSON.stringify(rec.versions) === JSON.stringify(finals), 'the row: pdf, final, the engine, the key, the Final versions');
  ok(JSON.stringify(rec.parts) === JSON.stringify({ title: true, copyright: true, contents: true, intro: true, conclusion: true, about: false }), `parts sent: ${JSON.stringify(rec.parts)}`);
  r = await rows();
  ok(r[0] === `Print PDF Paperback interior · fonts embedded · even page count Exported ${day(new Date().toISOString())} · ${rec.page_count} pages Export again`, `after: ${r[0]}`);
  ok(await page.$eval(`${panel} .fmt-pill-ok`, (p) => !!p.querySelector('svg')) && await page.$eval(`${panel} [data-pdf]`, (b) => b.classList.contains('btn-secondary')), 'the green pill with a check; Export again is secondary');
  ok((await FM.txt(page, `${panel} [data-sub]`)) === `Micro Study Habits for Busy Adult Learners · ${rec.page_count} pages · 6 × 9 in · white paper`, 'the sub line has the page count');
  ok(!(await FM.has(page, `${panel} .alert`)), 'a first PDF: no page count warning');

  /* Close: focus back on Export files; the 08 mark (50): the check in the rail, Coming next. */
  await page.click(`${panel} [data-close]`);
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open]'), null, { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.matches('[data-export]')), 'focus back on Export files');
  await page.waitForFunction(() => document.querySelector('[data-step="8"]').classList.contains('is-done'), null, { timeout: 3000 });
  ok((await FM.txt(page, '[data-next-note]')) === 'Coming next', '08 done: the note says Coming next');
  // Rule D (E14.3): on 08 itself, a current Print PDF shows the check in the rail, not the dot.
  const railMark = () => page.$eval('[data-step="8"]', (a) => ({ check: !!a.querySelector('.step-mark svg'), dot: getComputedStyle(a.querySelector('.step-mark'), '::before').display !== 'none' && getComputedStyle(a.querySelector('.step-mark'), '::before').content !== 'none', current: a.getAttribute('aria-current') }));
  let rm = await railMark();
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')) && rm.check && !rm.dot && rm.current === 'step', `rail on 08, current and done: the check, no dot (${JSON.stringify(rm)})`);
  await page.click('[data-step="7"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  ok(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done') && !!a.querySelector('.step-mark svg')), 'the sidebar shows the 08 check (from pdf_marks)');
  ok(st.calls.filter((c) => c.endsWith('/rpc/pdf_marks')).length >= 1, 'the mark is read with pdf_marks');

  /* Changed since the PDF: the row in the warning look, a filled Export again; the reason line. */
  st.changed = true;
  await FM.open(page);
  await pages();
  await page.waitForFunction(() => /changed since/.test(document.querySelector('[data-next-note]').textContent), null, { timeout: 5000 });
  rm = await railMark();
  ok(!rm.check && rm.dot, `rail on 08, changed: the dot again (${JSON.stringify(rm)})`);
  await openPanel();
  ok(await page.$eval(`${panel} .fmt-exp-row`, (x) => x.classList.contains('is-changed')) && (await rows())[0].includes('Changed since export.') && await page.$eval(`${panel} [data-pdf]`, (b) => b.classList.contains('btn-primary')), `changed: ${(await rows())[0]}`);
  ok(await page.$eval(`${panel} .fmt-exp-why svg`, () => true), 'changed: an icon and words');

  /* A different page count: "Page count changed. Your cover must be made again." */
  st.lastPdf.page_count = 12;
  const dl2 = page.waitForEvent('download', { timeout: 60000 });
  await page.click(`${panel} [data-pdf]`);
  await dl2;
  await page.waitForSelector(`${panel} .alert-warning`, { timeout: 10000 });
  const n2 = records().pop().body.page_count;
  ok((await FM.txt(page, `${panel} .alert-warning`)) === `Page count changed. Your cover must be made again. 12 pages before, ${n2} now. The spine is now ${(n2 * 0.002252).toFixed(3)} in.`, `page count changed: ${await FM.txt(page, `${panel} .alert-warning`)}`);

  /* The book changed while the PDF was made (0027 export_stale): no download. */
  globalThis.__modes.stale = 1;
  const before = (await lastBlob()).n;
  await page.click(`${panel} [data-pdf]`);
  await page.waitForSelector(`${panel} .fmt-exp-row.is-error`, { timeout: 60000 });
  ok((await rows())[0] === 'Your book changed while the PDF was made Make it again. Nothing was downloaded. Try again' && (await lastBlob()).n === before, 'stale: the message, nothing downloaded');
  ok(await page.$eval(`${panel} .fmt-exp-row.is-error`, (x) => x.getAttribute('role') === 'alert' && !!x.querySelector('svg')), 'stale: an alert with an icon');

  /* A failed record: the file still downloads, with a note and Try again. */
  globalThis.__modes.recordFail = 1;
  const dl3 = page.waitForEvent('download', { timeout: 60000 });
  await page.click(`${panel} [data-pdf]`);
  await dl3;
  await page.waitForSelector(`${panel} [data-record]`, { timeout: 10000 });
  ok((await FM.txt(page, `${panel} .alert[role="alert"]`)).startsWith("We couldn't record this export, so the 08 mark and the Books badge may be missing. Your file downloaded."), 'record failed: the file downloaded, the note');
  const n3 = records().length;
  await page.click(`${panel} [data-record]`);
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open] [data-record]'), null, { timeout: 5000 });
  ok(records().length === n3 + 1, 'Try again records the row');

  /* A failed PDF check: no download, the check's name. */
  await page.evaluate(() => { window.__checks = kdpPdfCheck.checks; kdpPdfCheck.checks = () => [{ key: 'size', name: 'Page size', pass: false, detail: 'mock' }]; });
  const before4 = (await lastBlob()).n;
  await page.click(`${panel} [data-pdf]`);
  await page.waitForSelector(`${panel} .fmt-exp-row.is-error`, { timeout: 60000 });
  ok((await rows())[0] === 'The PDF failed a check: Page size Nothing was downloaded. Try again. If it fails again, change the text style and export. Try again' && (await lastBlob()).n === before4, 'a failed check: its name, nothing downloaded');
  await page.evaluate(() => { kdpPdfCheck.checks = window.__checks; });

  /* Cancel while exporting: the row comes back. */
  globalThis.__modes.recordSlow = 3000;
  await page.click(`${panel} [data-pdf]`);
  await page.waitForSelector(`${panel} [data-cancel]`, { timeout: 5000 });
  await page.click(`${panel} [data-cancel]`);
  ok(await FM.has(page, `${panel} [data-pdf]`) && !(await FM.has(page, `${panel} [role="progressbar"]`)), 'Cancel: the row is back');
  globalThis.__modes.recordSlow = 0;
  await page.waitForTimeout(3200);

  /* Word opens the E11 dialog. */
  await page.click(`${panel} [data-docx]`);
  await page.waitForSelector('.exp-dialog[open]', { timeout: 5000 });
  ok(!(await FM.has(page, panel)) && (await FM.txt(page, '#expTitle')) === 'Export book', 'Word: the E11 dialog');
  await page.keyboard.press('Escape');

  /* Escape closes the panel; 900 px fits. */
  await page.setViewportSize({ width: 900, height: 900 });
  await openPanel();
  const fit900 = await page.evaluate((sel) => { const d = document.querySelector(sel).getBoundingClientRect(); const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}:${Math.round(e.getBoundingClientRect().right)}`); return { l: d.left, r: d.right, iw: innerWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide }; }, panel);
  ok(fit900.r <= fit900.iw && fit900.l >= 0 && fit900.sw <= fit900.cw, `900: the panel fits (${JSON.stringify(fit900)})`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open]'), null, { timeout: 3000 });
  ok(true, 'Escape closes');

  /* A trim outside group A: the row says why, Export is off. */
  st.brief.trim_size = '7x10';
  await FM.open(page);
  await openPanel().catch(() => {});
  await page.waitForSelector(`${panel} .fmt-exp-why`, { timeout: 10000 });
  ok((await rows())[0].includes('Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8 or 5 × 8 in.') && await page.$eval(`${panel} .fmt-exp-row .btn`, (b) => b.disabled), '7 × 10: why, Export off');
  await page.keyboard.press('Escape');
  st.brief.trim_size = '6x9';

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
