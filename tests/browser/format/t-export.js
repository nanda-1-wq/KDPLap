// 42: the Export files panel, the PDF checks before download, the record, and the 08 marks (50).
// E13.2 Part 4. The engine is real (from the checked cache).
// E13.3 Part 4 (42, 42b): the EPUB row, every state, its record against the 0034 mock guard, and Q4
// (the 08 done mark stays Print PDF only).
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
  ok(r[1] === 'EPUB Kindle ebook · clickable contents Not exported yet Export', `EPUB row: ${r[1]} (E13.3 42b: never exported)`);
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

  /* Close: focus back on Export files; the 08 mark (50): the check in the rail; no note (E16: Next opens 09). */
  await page.click(`${panel} [data-close]`);
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open]'), null, { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.matches('[data-export]')), 'focus back on Export files');
  await page.waitForFunction(() => document.querySelector('[data-step="8"]').classList.contains('is-done'), null, { timeout: 3000 });
  ok(await page.$eval('[data-next-note]', (n) => n.hidden && !n.textContent), '08 done: no note (E16 Part 4: 08 is not the last step, Next opens 09)');
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
  ok((await rows())[0].includes('Print PDF needs 6 × 9, 5.5 × 8.5, 5.25 × 8, 5 × 8, 8 × 10 or 8.5 × 11 in. This book is 7 × 10 in.') && await page.$eval(`${panel} .fmt-exp-row .btn`, (b) => b.disabled), '7 × 10: why, Export off');
  ok((await rows())[1] === 'EPUB Kindle ebook · clickable contents Not exported yet Export' && !(await page.$eval(`${panel} [data-epub]`, (b) => b.disabled)), 'E13.3 7 × 10: the EPUB has no trim, its Export is on');
  await page.keyboard.press('Escape');
  st.brief.trim_size = '6x9';


  /* ── E13.3 Part 4: the EPUB row (42, 42b) ─────────────────────────── */
  await page.setViewportSize({ width: 1440, height: 1100 });
  st.lastPdf = null;            // Q4 below: no Print PDF, so 08 is not done
  st.changed = false;
  st.lastEpub = null;
  const epubRow = async () => (await rows())[1];
  const blobs = () => page.evaluate(() => window.__blobs.filter((b) => b.type === 'application/epub+zip').length);   // the print preview makes PDF blobs too
  const epubSel = `${panel} [data-epub]`;
  const focused = (sel) => page.evaluate((q) => document.activeElement && document.activeElement.matches(q), sel);
  const openEpub = async () => { await page.click('[data-export]'); await page.waitForSelector(`${panel} [data-epub], ${panel} [data-epub-record]`, { timeout: 10000 }); };
  const readEpub = () => page.evaluate(async () => {
    const b = window.__blobs.filter((x) => x.type === 'application/epub+zip').pop();
    const bytes = new Uint8Array(await b.arrayBuffer());
    const info = kdpEpubCheck.read(bytes);
    const f = (await kdp.getFormat(window.kdpBookSteps[8]._debug().fmt.book.id)).data;
    const list = kdpEpubCheck.checks(info, { expect: { title: f.book.title, subtitle: f.book.subtitle, author: f.book.pen_name, isbn: f.settings.isbn }, wellFormed: kdpEpubCheck.domWellFormed });
    return { type: b.type, first: info.entries[0].name, method: info.entries[0].method, list: list.map((c) => `${c.name}:${c.pass}`).join('|'), size: bytes.length };
  });
  const finalsE = () => st.pdfSections().map((x) => x[5]);
  await FM.open(page);
  await openEpub();
  const today = day(new Date().toISOString());

  /* Never exported (42b panel): the row, a secondary Export, the new footer line. */
  ok((await epubRow()) === 'EPUB Kindle ebook · clickable contents Not exported yet Export' && await page.$eval(epubSel, (b) => b.classList.contains('btn-secondary')), `E13.3 never exported: ${await epubRow()}`);
  ok((await FM.txt(page, `${panel} [data-epub-foot]`)) === 'The EPUB is checked before it downloads: files, contents and book details. On KDP, upload it as the eBook manuscript. Upload the Kindle cover JPG from 09 separately: the EPUB has no cover inside.', 'E13.3 the 42b footer line, word for word');
  ok((await page.$$eval(`${panel} > .dialog-inner > .fmt-hint`, (p) => p.length)) === 2, 'E13.3 two footer lines: the Print PDF one, then the EPUB one');
  ok(await page.$eval(epubSel, (b) => b.getBoundingClientRect().height >= 44), 'E13.3 EPUB Export: 44 px');

  /* Export by keyboard: the steps, Cancel, the other rows wait, then the file. */
  const nB0 = await blobs();
  const nR0 = records().length;
  globalThis.__modes.recordSlow = 1500;
  const dlE = page.waitForEvent('download', { timeout: 30000 });
  await page.focus(epubSel);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Saving the export…/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  ok((await epubRow()) === 'EPUB Saving the export… Cancel' && await page.$eval(`${panel} [role="progressbar"]`, (b) => b.getAttribute('aria-label') === 'EPUB progress' && b.getAttribute('aria-valuenow') === '90'), `E13.3 exporting: ${await epubRow()}`);
  ok(await page.$eval(`${panel} [data-pdf]`, (b) => b.disabled) && await page.$eval(`${panel} [data-docx]`, (b) => b.disabled) && (await FM.txt(page, `${panel} .fmt-exp-rows > .fmt-hint`)) === 'One file at a time. Other rows wait.', 'E13.3 one file at a time: the Print PDF and Word rows wait');
  globalThis.__modes.recordSlow = 0;
  const fileE = await dlE;
  ok(fileE.suggestedFilename() === 'micro-study-habits-for-busy-adult-learners-ebook.epub', `E13.3 file name: ${fileE.suggestedFilename()}`);
  await page.waitForSelector(`${panel} .fmt-exp-row:nth-of-type(2) .fmt-pill-ok, ${panel} .fmt-pill-ok`, { timeout: 10000 });
  const e1 = await readEpub();
  ok(e1.type === 'application/epub+zip' && e1.first === 'mimetype' && e1.method === 0, `E13.3 the Blob: ${e1.type}, mimetype first and stored (${e1.size} bytes)`);
  ok(e1.list === 'File structure:true|Contents:true|Book details:true', `E13.3 the downloaded file passes the 3 checks again: ${e1.list}`);
  // (window.__blobs is pushed once per stacked init script in a reused browser, so counts are compared as "more" or "the same".)
  ok((await blobs()) > nB0 && records().length === nR0 + 1, `E13.3 a file, one record (blobs ${nB0}→${await blobs()}, records ${nR0}→${records().length})`);
  const recE = records().pop().body;
  ok(recE.format === 'epub' && recE.include === 'final' && recE.engine === 'epub3 · e1' && recE.settings_key === st.epubKey() && !('page_count' in recE) && !('parts' in recE) && JSON.stringify(recE.versions) === JSON.stringify(finalsE()),
    `E13.3 the row sent: epub, final, epub3 · e1, today's epub_key, no page_count, no parts, the Final versions (${JSON.stringify(recE).slice(0, 160)})`);
  ok(JSON.stringify(st.lastEpub.parts) === JSON.stringify({ title: true, copyright: true, contents: true, intro: true, conclusion: true, about: false }) && st.lastEpub.snapshot.style === 'classic', `E13.3 the guard set the parts (contents on, no also_by) and the snapshot style: ${JSON.stringify(st.lastEpub.parts)}`);
  ok((await epubRow()) === `EPUB Kindle ebook · clickable contents Exported ${today} · EPUB 3 Export again` && await page.$eval(epubSel, (b) => b.classList.contains('btn-secondary')) && await page.$eval(`${panel} .fmt-pill-ok`, (p) => !!p.querySelector('svg')), `E13.3 current: ${await epubRow()}`);
  ok(await focused('[data-epub]'), 'E13.3 focus on Export again after the download');

  /* Q4: the 08 done mark stays Print PDF only. */
  await page.click(`${panel} [data-close]`);
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open]'), null, { timeout: 3000 });
  await page.waitForTimeout(300);
  const q4 = await page.evaluate(() => ({ done: document.querySelector('[data-step="8"]').classList.contains('is-done'), check: !!document.querySelector('[data-step="8"] .step-mark svg'), missing: window.kdpBookSteps[8].missing(), isDone: window.kdpBookSteps[8].isDone() }));
  ok(!q4.done && !q4.check && !q4.isDone && q4.missing === 'Export the Print PDF', `E13.3 Q4: after an EPUB, 08 is still not done (${JSON.stringify(q4)})`);

  /* Print-only changes never turn the EPUB to changed (0034 epub_key); a chapter label does. */
  Object.assign(st.format, { drop_cap: true, recto_start: false, running_header: false, header_title: 'Micro Study', paper: 'cream', isbn: '9780306406157' });
  st.brief.trim_size = '8x10';
  await FM.open(page);
  await openEpub();
  ok((await epubRow()) === `EPUB Kindle ebook · clickable contents Exported ${today} · EPUB 3 Export again`, `E13.3 drop cap, right-hand start, running header, header title, paper, ISBN and trim: the EPUB stays current (${await epubRow()})`);
  ok(st.calls.some((c) => c.endsWith('/rpc/format_json')) && !st.calls.some((c) => c.endsWith('/rpc/epub_marks')), 'E13.3 08 reads the EPUB state from format_json (no epub_marks call on 08)');
  await page.keyboard.press('Escape');
  Object.assign(st.format, { drop_cap: false, recto_start: true, running_header: true, header_title: null, paper: 'white', isbn: null });
  st.brief.trim_size = '6x9';
  st.format.chapter_label = 'number';
  await FM.open(page);
  await openEpub();
  ok((await epubRow()) === `EPUB Kindle ebook · clickable contents Changed since export. Last EPUB ${today}. Export again` && await page.$eval(`${panel} .fmt-exp-row:has([data-epub])`, (x) => x.classList.contains('is-changed') && !!x.querySelector('.fmt-exp-why svg')) && await page.$eval(epubSel, (b) => b.classList.contains('btn-primary')),
    `E13.3 changed (G2 words, the warning look, an icon, a filled Export again): ${await epubRow()}`);

  /* The book changed while the EPUB was made (a real export_stale from the guard): nothing downloads. */
  globalThis.__modes.recordSlow = 1500;
  let nB = await blobs();
  await page.click(epubSel);
  await page.waitForFunction(() => /Saving the export…/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  st.format.chapter_label = 'none';
  await page.waitForSelector(`${panel} .fmt-exp-row.is-error`, { timeout: 10000 });
  globalThis.__modes.recordSlow = 0;
  ok((await epubRow()) === 'Your book changed while the EPUB was made Make it again. Nothing was downloaded. Try again' && (await blobs()) === nB, `E13.3 export_stale: the words, nothing downloaded (${await epubRow()})`);
  ok(await page.$eval(`${panel} .fmt-exp-row.is-error`, (x) => x.getAttribute('role') === 'alert' && !!x.querySelector('svg')) && await focused('[data-epub]'), 'E13.3 stale: an alert with an icon, focus on Try again');

  /* export_epub_versions (the key is today's, the list is not): the same words, nothing downloads. */
  await page.evaluate(() => { window.__vids = kdpExportRules.versionIds; kdpExportRules.versionIds = (m) => window.__vids(m).slice(1); });
  nB = await blobs();
  await page.click(epubSel);
  await page.waitForFunction(() => /Your book changed while the EPUB was made/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  ok((await blobs()) === nB && !st.calls.slice(-3).includes('ERR'), 'E13.3 export_epub_versions: the stale words, nothing downloaded');

  /* Another guard error (export_version_not_in_book): the file downloads, the 42b row says it was not recorded. */
  await page.evaluate(() => { kdpExportRules.versionIds = (m) => ['70000000-0000-4000-8000-0000000000ff', ...window.__vids(m).slice(1)]; });
  nB = await blobs();
  let nR = records().length;
  const lastId = st.lastEpub.id;
  const dlX = page.waitForEvent('download', { timeout: 30000 });
  await page.click(epubSel);
  await dlX;
  await page.waitForSelector(`${panel} [data-epub-record]`, { timeout: 10000 });
  ok((await epubRow()) === 'EPUB Kindle ebook · clickable contents Your EPUB downloaded, but it was not recorded. Try again' && (await blobs()) > nB && records().length === nR + 1 && st.lastEpub.id === lastId, `E13.3 export_version_not_in_book: downloaded, not recorded (${await epubRow()}; blobs ${nB}→${await blobs()}, records ${nR}→${records().length}, id ${st.lastEpub.id === lastId})`);
  await page.evaluate(() => { kdpExportRules.versionIds = window.__vids; });

  /* A failed record (the server is down): the 42b row exactly, then Try again records it, no second file. */
  globalThis.__modes.recordFail = 1;
  await page.keyboard.press('Escape');
  await FM.open(page);
  await openEpub();
  const dlF = page.waitForEvent('download', { timeout: 30000 });
  await page.click(epubSel);
  await dlF;
  await page.waitForSelector(`${panel} [data-epub-record]`, { timeout: 10000 });
  const rf = await page.$eval(`${panel} .fmt-exp-row:has([data-epub-record])`, (x) => ({ cls: x.className, role: x.getAttribute('role'), icon: !!x.querySelector('.fmt-exp-why svg'), btn: x.querySelector('[data-epub-record]').className, t: x.innerText.replace(/\s+/g, ' ').trim() }));
  ok(rf.t === 'EPUB Kindle ebook · clickable contents Your EPUB downloaded, but it was not recorded. Try again' && /is-changed/.test(rf.cls) && rf.icon && /btn-primary/.test(rf.btn) && rf.role === 'alert', `E13.3 record failed: the 42b row, one line, a filled Try again (${JSON.stringify(rf)})`);
  ok(!(await FM.has(page, `${panel} .alert`)) && await focused('[data-epub-record]'), 'E13.3 record failed: no PDF note, focus on Try again');
  nB = await blobs();
  nR = records().length;
  await page.click(`${panel} [data-epub-record]`);
  await page.waitForSelector(`${panel} .fmt-exp-row:has([data-epub]) .fmt-pill-ok`, { timeout: 10000 });
  ok(records().length === nR + 1 && (await blobs()) === nB && (await epubRow()) === `EPUB Kindle ebook · clickable contents Exported ${today} · EPUB 3 Export again` && st.lastEpub.settings_key === st.epubKey(), 'E13.3 Try again: recorded, no new download, the row is current');

  /* A failed check: its name, nothing downloads, nothing is recorded. */
  await page.evaluate(() => { window.__echecks = kdpEpubCheck.checks; kdpEpubCheck.checks = () => [{ key: 'structure', name: 'File structure', pass: true }, { key: 'contents', name: 'Contents', pass: false, detail: 'mock' }, { key: 'details', name: 'Book details', pass: true }]; });
  nB = await blobs();
  nR = records().length;
  await page.click(epubSel);
  await page.waitForSelector(`${panel} .fmt-exp-row.is-error`, { timeout: 10000 });
  ok((await epubRow()) === 'The EPUB failed a check: Contents Nothing was saved. Your last EPUB is still the current one. Try again' && (await blobs()) === nB && records().length === nR, `E13.3 a failed check (42b): ${await epubRow()}`);
  await page.evaluate(() => { kdpEpubCheck.checks = window.__echecks; });

  /* The build throws (42): "EPUB could not be built". */
  await page.evaluate(() => { window.__emake = kdpEpub.make; kdpEpub.make = () => { throw new Error('mock'); }; });
  await page.click(epubSel);
  await page.waitForFunction(() => /EPUB could not be built/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  ok((await epubRow()) === 'EPUB could not be built Nothing was saved. Your last EPUB is still the current one. Try again' && (await blobs()) === nB, `E13.3 could not be built (42): ${await epubRow()}`);
  await page.evaluate(() => { kdpEpub.make = window.__emake; });

  /* The book cannot be read: the EPUB error, and the Print PDF row waits (no second error). */
  globalThis.__modes.exportFail = true;
  await page.click(epubSel);
  await page.waitForFunction(() => /couldn't read the book/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  ok((await epubRow()) === "EPUB could not be built We couldn't read the book. Check your connection, then try again. Try again" && (await page.$$eval(`${panel} .fmt-exp-row.is-error`, (x) => x.length)) === 1, `E13.3 read failed: one error, in the EPUB row (${(await rows()).join(' / ')})`);
  globalThis.__modes.exportFail = false;
  await page.click(epubSel);
  await page.waitForSelector(`${panel} .fmt-exp-row:has([data-epub]) .fmt-pill-ok`, { timeout: 10000 });
  ok(true, 'E13.3 Try again after a read failure exports');

  /* Cancel while exporting: the row comes back, nothing downloads. */
  globalThis.__modes.recordSlow = 2000;
  nB = await blobs();
  await page.click(epubSel);
  await page.waitForSelector(`${panel} [data-cancel]`, { timeout: 5000 });
  await page.click(`${panel} [data-cancel]`);
  ok(await FM.has(page, epubSel) && !(await FM.has(page, `${panel} [role="progressbar"]`)) && await focused('[data-epub]') && !(await page.$eval(`${panel} [data-pdf]`, (b) => b.disabled)), 'E13.3 Cancel: the row is back, focus on its button, the Print PDF row is on again');
  globalThis.__modes.recordSlow = 0;
  await page.waitForTimeout(2300);
  ok((await blobs()) === nB, 'E13.3 Cancel: nothing downloaded after the record');

  /* One file at a time the other way: while the Print PDF exports, the EPUB waits. */
  globalThis.__modes.recordSlow = 1500;
  const dlP = page.waitForEvent('download', { timeout: 60000 });
  await page.click(`${panel} [data-pdf]`);
  await page.waitForFunction(() => /Saving the export…/.test((document.querySelector('.fmt-exp[open] .fmt-exp-row') || {}).textContent || ''), null, { timeout: 30000 });
  ok(await page.$eval(epubSel, (b) => b.disabled), 'E13.3 while the Print PDF exports, the EPUB row waits');
  globalThis.__modes.recordSlow = 0;
  await dlP;
  await page.waitForFunction(() => !document.querySelector('.fmt-exp[open] [data-cancel]'), null, { timeout: 10000 });
  ok(!(await page.$eval(epubSel, (b) => b.disabled)), 'E13.3 after the Print PDF, the EPUB row is on again');

  /* Settings not saved yet: nothing is built. */
  await page.keyboard.press('Escape');
  globalThis.__modes.saveFail = 9;
  await page.click('.fmt-style:has(input[value="warm"])');
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'error', null, { timeout: 5000 });
  await openEpub();
  nB = await blobs();
  await page.click(epubSel);
  await page.waitForFunction(() => /not saved yet/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
  ok((await epubRow()) === 'Your settings are not saved yet Check your connection, then try again. Nothing was downloaded. Try again' && (await blobs()) === nB, `E13.3 unsaved settings: ${await epubRow()}`);
  globalThis.__modes.saveFail = 0;
  await page.keyboard.press('Escape');
  await page.click('[data-rail-toggle]').catch(() => {});
  await page.click('[data-retry-save]').catch(() => {});
  await FM.saved(page);
  await page.click('[data-rail-toggle]').catch(() => {});

  /* Blocked: nothing Final (42b). */
  const sts = st.sections().map((x) => x.status);
  st.sections().forEach((x) => { x.status = 'draft'; });
  await FM.open(page);
  await page.click('[data-export]');
  await page.waitForSelector(`${panel} .fmt-exp-why`, { timeout: 10000 });
  ok((await epubRow()) === 'EPUB Kindle ebook · clickable contents Needs at least one Final section. Export' && (await page.$$eval(`${panel} .fmt-exp-row`, (r) => r[1].querySelector('.btn').disabled)), `E13.3 blocked: ${await epubRow()}`);
  await page.keyboard.press('Escape');
  st.sections().forEach((x, i) => { x.status = sts[i]; });

  /* Before 0034: no EPUB keys in format_json = never exported, no error; an export downloads, not recorded. */
  globalThis.__modes.pre0034 = true;
  await FM.open(page);
  await openEpub();
  ok((await epubRow()) === 'EPUB Kindle ebook · clickable contents Not exported yet Export' && !(await FM.has(page, `${panel} [role="alert"]`)), `E13.3 before 0034: never exported, no error (${await epubRow()})`);
  const dl0 = page.waitForEvent('download', { timeout: 30000 });
  await page.click(epubSel);
  await dl0;
  await page.waitForSelector(`${panel} [data-epub-record]`, { timeout: 10000 });
  ok((await epubRow()) === 'EPUB Kindle ebook · clickable contents Your EPUB downloaded, but it was not recorded. Try again', 'E13.3 before 0034: the 23514 refusal downloads with the not-recorded row');
  globalThis.__modes.pre0034 = false;

  /* 900 px: the panel fits in the record-failed and changed states. */
  await page.setViewportSize({ width: 900, height: 900 });
  const fitE = await page.evaluate((sel) => { const d = document.querySelector(sel).getBoundingClientRect(); return { r: d.right, iw: innerWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; }, panel);
  ok(fitE.r <= fitE.iw && fitE.sw <= fitE.cw, `E13.3 900: the panel fits (${JSON.stringify(fitE)})`);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1100 });

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
