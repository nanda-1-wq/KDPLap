// E16 STOP 10: a real-engine export in Chrome of the sample book through the app's own Export dialog (the Typst
// engine and fonts from the checked test cache; the data mocked: never a real account). Two covers:
//   1. the design's sample book: Band + the warm blurb (design 59), 6 × 9, 54 pages, white;
//   2. the same with a 5,000 × 3,400 photo on the front (the PDF then carries 300 DPI patches; the export reads the
//      stored file again at full size).
// For each: Print PDF + its KDP checks (export.checkPrint: size within 0.001 in, one page, fonts embedded, one sRGB
// ICC profile, no OutputIntents, transparency or security, every letter in its font, line widths within 0.5%, the
// chosen faces only, no font warning), the PNG (header, 3712 × 2775), the Kindle JPG (1600 × 2560, plain sRGB, read
// back), the rows. The files are saved to tests/browser/cover/out/stop10/ for the independent checks in the report
// (unzip -t, sips, file). Never in a sweep (slow, writes files).
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'tests/browser/cover/out/stop10');
  const waitPhase = (p) => page.waitForFunction((p) => { const d = document.querySelector('[data-exdlg] .cv-ex'); return d && d.dataset.exPhase === p; }, p, { timeout: 300000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  const band = await FIX.band(page);
  const R = [];
  for (const [n, photo] of [['sample', false], ['photo', true]]) {
    globalThis.__modes = {}; st.exports = []; st.my = []; st.writes = []; st.assets = []; st.files = {};
    st.design = { book_id: FIX.BOOK, layers: JSON.parse(JSON.stringify(band.layers)), bg: band.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await CV.open(page);
    if (photo) {
      await PIC.ready(page);
      await PIC.make(page, 'p', { w: 5000, h: 3400, type: 'image/jpeg', name: 'desk-sunrise.jpg', quality: 0.85 });
      await PIC.pick(page, 'p'); await PIC.idle(page); await PIC.drawn(page);
      await CV.settled(page, 'saved');
    }
    // Keep what the builders return (the dialog shows only the files).
    await page.evaluate(() => {
      const X = kdpCover.export; window.__real = {};
      if (!X.__p) { X.__p = X.print; X.__i = X.image; X.__k = X.kindle; }
      X.print = async (...a) => { const r = await X.__p(...a); window.__real.print = { ok: r.ok, checks: r.checks.map((c) => ({ key: c.key, name: c.name, pass: c.pass, detail: c.detail })), patches: r.patches.length, faces: r.typst.faces.map((f) => f.ps), ms: Math.round(r.ms.total), bytes: r.pdf.length }; return r; };
      X.image = async (...a) => { const r = await X.__i(...a); window.__real.image = { w: r.w, h: r.h, type: r.type, bytes: r.bytes.length, ms: Math.round(r.ms), sniff: kdpCover.imagePrep.sniff(r.bytes) }; return r; };
      X.kindle = async (...a) => { const r = await X.__k(...a); window.__real.kindle = { w: r.w, h: r.h, mode: r.mode, color: r.color, size: r.size, bytes: r.bytes.length, ms: Math.round(r.ms) }; return r; };
    });
    await page.click('[data-export]'); await page.waitForSelector('[data-exdlg]');
    const t0 = Date.now();
    await page.click('[data-ex-go]');
    await waitPhase('done');
    const ms = Date.now() - t0;
    const real = await page.evaluate(() => window.__real);
    for (const c of real.print.checks) ok(c.pass, `${n}: ${c.name}: ${c.detail}`);
    ok(real.image.w === 3712 && real.image.h === 2775 && real.image.sniff && real.image.sniff.type === 'image/png' && real.image.sniff.w === 3712, `${n}: PNG 3712 × 2775 (header read back)`);
    ok(real.kindle.w === 1600 && real.kindle.h === 2560 && real.kindle.size.w === 1600 && real.kindle.size.h === 2560 && real.kindle.mode === 'cut', `${n}: Kindle 1600 × 2560, cut at the trim`);
    ok(real.kindle.color && real.kindle.color.ok, `${n}: Kindle color: ${JSON.stringify(real.kindle.color)}`);
    if (photo) ok(real.print.patches > 0, `${n}: the photo goes in as ${real.print.patches} patch(es)`);
    ok(st.exports.length === 3 && st.my.length === 1, `${n}: 3 rows recorded, My layouts saved`);
    // Save the files and the zip.
    const names = await page.$$eval('[data-ex-file] .cv-ex-fn', (es) => es.map((e) => e.textContent));
    for (let i = 0; i < names.length; i++) {
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(`[data-ex-dl="${i}"]`)]);
      await d.saveAs(`${OUT}/${n}/${d.suggestedFilename()}`);
    }
    const [z] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-ex-zip]')]);
    await z.saveAs(`${OUT}/${n}/${z.suggestedFilename()}`);
    R.push({ cover: n, totalMs: ms, print: real.print, image: real.image, kindle: real.kindle, files: names });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const X = kdpCover.export; X.print = X.__p; X.image = X.__i; X.kindle = X.__k; });
    await CV.quiet(page);
  }
  log.push('RESULT ' + JSON.stringify(R));
  log.push(`INFO files in ${OUT}`);
  return log.join('\n');
};
