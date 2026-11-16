// E16 Part 6: a PDF page as a picture (plan §3: PDF up to 25 MB, one page placed as a 300 DPI picture via pdf.js
// 6.4.299, already pinned). The rights tick first; a PDF by its bytes; the page count from pdf.js; the page chooser
// (design 62: name, "N pages", Page, Place page, Cancel); the page drawn at 300 DPI on white, stored as a JPEG
// (source 'pdf'), named "<file> p.<n>"; a large page drawn smaller to fit 12,000 px and 16 MP; password and broken
// files; pdf.js not loading. pdf.js comes from the format suite's checked cache (mock.js), never the network.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await PIC.ready(page, false);
  const setPdf = (key, text, name) => page.evaluate(([k, t, n]) => { window.__pic = window.__pic || {}; const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 255; window.__pic[k] = new File([b], n, { type: 'application/pdf' }); }, [key, text, name]);
  const err = async () => { await page.waitForSelector('.cv-uperr', { timeout: 5000 }).catch(() => {}); return CV.txt(page, '.cv-uperr').catch(() => ''); };
  const clear = () => page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.img.err = ''; E.refreshPanel(); });

  await setPdf('three', PIC.pdf(3), 'workbook.pdf');
  await PIC.pick(page, 'three', 'pdf');
  await page.waitForTimeout(150);
  ok((await err()) === 'Tick the rights box first.' && !(await page.$('[data-pdfbox]')), 'a PDF before the tick: "Tick the rights box first."');
  await page.click('[data-rights]');

  /* Not a PDF, over 25 MB. */
  await PIC.raw(page, 'notpdf', { text: 'hello, not a pdf', name: 'fake.pdf', type: 'application/pdf' });
  await clear(); await PIC.pick(page, 'notpdf', 'pdf'); await PIC.idle(page);
  ok((await err()) === 'This file is not a PDF.', 'a text file named .pdf: "This file is not a PDF."');
  await page.evaluate(() => { const head = new TextEncoder().encode('%PDF-1.4\n'); window.__pic.huge = new File([head, new Uint8Array(25 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' }); });
  await clear(); await PIC.pick(page, 'huge', 'pdf'); await PIC.idle(page);
  ok((await err()) === 'This PDF is over 25 MB.', 'a PDF over 25 MB: "This PDF is over 25 MB."');
  await setPdf('broken', '%PDF-1.4\nthis is not really a pdf\n%%EOF', 'broken.pdf');
  await clear(); await PIC.pick(page, 'broken', 'pdf'); await page.waitForTimeout(100); await PIC.idle(page);
  ok((await err()) === 'This PDF could not be opened.', 'a broken PDF: "This PDF could not be opened."');

  /* A 3-page PDF: the chooser. */
  await PIC.pick(page, 'three', 'pdf');
  await page.waitForSelector('[data-pdfbox]', { timeout: 20000 });
  ok(st.cdn.some((c) => c === 'pdfjs-dist@6.4.299/build/pdf.min.mjs') && st.cdn.some((c) => c === 'pdfjs-dist@6.4.299/build/pdf.worker.min.mjs'), 'pdf.js 6.4.299 and its worker load (the pinned, checked files)');
  ok((await CV.txt(page, '.cv-pdf-name')) === 'workbook.pdf' && (await CV.txt(page, '.cv-pdf-pages')) === '3 pages', 'the chooser: the file name and "3 pages" (from pdf.js)');
  ok(await page.$eval('[data-pdf-page]', (i) => i.value === '1' && i.min === '1' && i.max === '3'), 'Page: 1, from 1 to 3');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-pdf-page]')), 'focus goes to the page number');
  ok(/The page lands as a 300 DPI picture\./.test(await CV.txt(page, '[data-pdfbox]')), 'the note: "The page lands as a 300 DPI picture."');
  ok(!/stand-in/.test(await CV.txt(page, '[data-pdfbox]')), 'the design\'s stand-in sentence is gone (D0: the real page is drawn)');
  await page.fill('[data-pdf-page]', '9'); await page.dispatchEvent('[data-pdf-page]', 'change');
  ok(await page.$eval('[data-pdf-page]', (i) => i.value === '3'), 'a page past the end goes to the last page (3)');
  await page.fill('[data-pdf-page]', '0'); await page.dispatchEvent('[data-pdf-page]', 'change');
  ok(await page.$eval('[data-pdf-page]', (i) => i.value === '1'), 'page 0 goes to 1');
  await page.click('[data-pdf-cancel]');
  ok(!(await page.$('[data-pdfbox]')) && st.uploads.length === 0, 'Cancel: the chooser closes, nothing stored');

  /* Place page 2. */
  await PIC.pick(page, 'three', 'pdf');
  await page.waitForSelector('[data-pdfbox]', { timeout: 20000 });
  await page.fill('[data-pdf-page]', '2'); await page.dispatchEvent('[data-pdf-page]', 'change');
  const n0 = (await PIC.layers(page)).length;
  await page.click('[data-pdf-place]');
  await PIC.idle(page);
  const row = st.assets[0], f = st.uploads[0], L = (await PIC.layers(page)).pop();
  ok(row && row.source === 'pdf' && row.mime === 'image/jpeg' && !!row.rights_at && row.path.endsWith('.jpg'), 'stored: source pdf, image/jpeg, rights ticked');
  ok(row.width === 2550 && row.height === 3300, `a letter page at 300 DPI: 2550 × 3300 (${row.width} × ${row.height})`);
  ok(f.type === 'image/jpeg' && f.size === row.bytes && f.size < 10485760, `the JPEG in the bucket: ${f.size} bytes`);
  ok((await PIC.layers(page)).length === n0 + 1 && L.name === 'workbook.pdf p.2' && L.natW === 2550 && L.asset === row.id, 'the page is on the cover: "workbook.pdf p.2"');
  ok(!(await page.$('[data-pdfbox]')), 'the chooser closes');
  // the drawn page is page 2: its black box sits at x = 40 + 30 = 70 pt (page 1 at 40, page 3 at 100)
  const cols = await page.evaluate(async (p) => {
    const r = await window.kdp.downloadCoverAsset(p); const b = await createImageBitmap(r.data);
    const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0);
    const at = (xPt, yPt) => [...g.getImageData(Math.round(xPt * 300 / 72), Math.round((792 - yPt) * 300 / 72), 1, 1).data].slice(0, 3);
    return { box: at(75, 360), before: at(55, 360), corner: at(5, 400), band: at(300, 740) };
  }, row.path);
  ok(cols.box.every((v) => v < 40) && cols.before.every((v) => v > 215) && cols.corner.every((v) => v > 240), `page 2's own drawing (box ${cols.box}, left of it ${cols.before}, white ${cols.corner})`);
  ok(cols.band.every((v) => v > 200 && v < 230), `its gray band (${cols.band})`);
  ok(Math.round(row.width * 70 / L.pw) > 300, `its DPI on the cover is over 300 (${Math.round(row.width * 70 / L.pw)})`);

  /* A large page: drawn smaller to fit 12,000 px a side and 16 MP (Safari's canvas). */
  const big = await page.evaluate(() => [kdpCover.imagePrep.pdfScale(612, 792), kdpCover.imagePrep.pdfScale(17 * 72, 11 * 72), kdpCover.imagePrep.pdfScale(200 * 72, 10 * 72)]);
  ok(big[0].w === 2550 && big[0].h === 3300 && big[0].dpi === 300, 'pdfScale: letter at 300 DPI');
  ok(big[1].w * big[1].h <= 16000000 && big[1].dpi < 300 && big[1].dpi > 290, `pdfScale: 17 × 11 in fits 16 MP (${big[1].w} × ${big[1].h}, ${big[1].dpi} DPI)`);
  ok(big[2].w <= 12000 && big[2].dpi === 60, `pdfScale: a 200 in wide page fits 12,000 px (${big[2].w} px, ${big[2].dpi} DPI)`);

  /* A password PDF (pdf.js PasswordException) and pdf.js not loading. */
  const pw = await page.evaluate(async () => {
    const fake = { getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })), destroy: async () => {} }) };
    return kdpCover.imagePrep.pdfPage(fake, new Uint8Array(10), null);
  });
  ok(pw.ok === false && pw.error === 'pdfPassword', 'a password PDF → pdfPassword');
  ok(await page.evaluate(() => kdpCover.imagePrep.E16_TEXT.pdfPassword) === 'This PDF has a password. Save a copy without the password, then try again.', 'its words');
  await CV.open(page);
  globalThis.__modes.pdfDown = 9;
  await page.evaluate(() => { window.kdpTypstRun.loadPdfjs = () => Promise.reject(new Error('down')); });
  await PIC.ready(page);
  await setPdf('three', PIC.pdf(3), 'workbook.pdf');
  await clear(); await PIC.pick(page, 'three', 'pdf'); await page.waitForTimeout(100); await PIC.idle(page);
  ok((await err()) === 'The PDF reader did not load. Check your connection, then try again.', 'pdf.js does not load: the error');
  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0, 'no CDN file went to the network');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
