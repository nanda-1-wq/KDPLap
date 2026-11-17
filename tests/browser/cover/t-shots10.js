// E16 STOP 10 compare shots (plan E16-10 row: 71, 71b, 73d), as the design's applyFinal cases build them:
// 71 = the dialog ready (design final F71b), 71b = done (final F71), 73d = export failed, the engine did not start
// (final F73d). Each at 1440 (beside the design PNG) and 1024. The cover is Band + the warm blurb (design 59).
// Plus the Part 10 states no final shows: blocked by Must fix, blocked offline, the steps (busy), the canvas
// message (iPad), a KDP check failed, My layouts full, the header Done with Next's tip, the remove question.
// Files go to docs/reviews/e16-stop10/. Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop10');
  const dlg = '[data-exdlg]';
  const ready = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); return !E || E.status !== 'ready' || [...document.querySelectorAll('[data-panel] img')].every((i) => i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
  };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const waitPhase = (p) => page.waitForFunction((p) => { const d = document.querySelector('[data-exdlg] .cv-ex'); return d && d.dataset.exPhase === p; }, p, { timeout: 120000 });
  const band = await FIX.band(page);
  const blurbL = () => JSON.parse(JSON.stringify(band.layers));
  const designOf = (layers) => ({ book_id: FIX.BOOK, layers, bg: band.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const fresh = async (layers) => {
    globalThis.__modes = {}; st.exports = []; st.my = []; st.history = [];
    st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
    st.design = designOf(layers || blurbL());
    await CV.open(page);
    await page.evaluate(() => { kdpCover.exportDialog.test.hold = null; kdpCover.exportDialog.test.fail = null; });
  };
  const openEx = async () => { await page.click('[data-export]'); await page.waitForSelector(dlg); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());

  const build = {
    async 71() { await fresh(); await openEx(); await blur(); },
    async '71b'() { await fresh(); await openEx(); await page.click('[data-ex-go]'); await waitPhase('done'); await blur(); },
    async '73d'() { await fresh(); globalThis.__modes.engineDown = true; await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); if (E.exEngine) { E.exEngine.terminate(); E.exEngine = null; } }); await openEx(); await page.click('[data-ex-go]'); await waitPhase('failed'); await blur(); }
  };
  for (const n of ['71', '71b', '73d']) {
    for (const w of [1440, 1024]) {
      await page.setViewportSize({ width: w, height: 900 });
      await build[n]();
      await shot(w === 1440 ? `${SHOTS}/b${n}-1440.png` : `${OUT}/${n}-1024.png`);
      ok(await CV.noScroll(page), `${n} at ${w}: no sideways scroll`);
      ok(await page.$eval(`${dlg} .cv-ex`, (d) => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), `${n} at ${w}: the dialog fits the window`);
      await page.keyboard.press('Escape').catch(() => {});
      globalThis.__modes.engineDown = false;
    }
  }

  /* The Part 10 states no final shows, at 1440. */
  await page.setViewportSize({ width: 1440, height: 900 });
  // Blocked: Must fix (the pen name and the subtitle off the cover).
  await fresh(blurbL().filter((l) => l.src !== 'pen' && l.src !== 'subtitle'));
  await openEx(); await blur();
  await shot(`${OUT}/blocked-mustfix-1440.png`);
  await page.keyboard.press('Escape');
  // Blocked: offline.
  await fresh();
  await page.context().setOffline(true);
  await page.waitForSelector('[data-offbar]:not([hidden])');
  await openEx(); await blur();
  await shot(`${OUT}/blocked-offline-1440.png`);
  await page.keyboard.press('Escape');
  await page.context().setOffline(false);
  await CV.settled(page);
  // Busy: the steps, held at the full image.
  await fresh();
  await openEx();
  await page.evaluate(() => { kdpCover.exportDialog.test.hold = (s) => (s === 'image' ? new Promise((r) => { window.__held = s; window.__rel = r; }) : null); });
  await page.click('[data-ex-go]');
  await page.waitForFunction(() => window.__held === 'image', null, { timeout: 60000 });
  await blur();
  await shot(`${OUT}/busy-steps-1440.png`);
  await page.click('[data-ex-stop]');
  await page.evaluate(() => { kdpCover.exportDialog.test.hold = null; window.__rel(); });
  await page.waitForTimeout(800);
  // The canvas message (a device that cannot paint the full JPG: iPad, owner STOP 2).
  await fresh();
  await openEx(); await page.click('[data-ex-fmt="jpg"]');
  await page.evaluate(() => { kdpCover.exportDialog.test.fail = (s) => (s === 'image' ? Object.assign(new Error('The full image (3712 × 2775 px) is larger than this browser\'s canvas.'), { kind: 'canvas' }) : null); });
  await page.click('[data-ex-go]'); await waitPhase('failed'); await blur();
  await shot(`${OUT}/failed-canvas-ipad-1440.png`);
  await page.keyboard.press('Escape');
  // A KDP check failed (a letter missing from its font).
  await fresh();
  await page.evaluate(() => { const C = kdpCover, orig = C.export.print; C.export.__orig = orig; C.export.print = async (...a) => { const r = await orig(...a); const g = r.checks.find((c) => c.key === 'glyphs'); g.pass = false; g.detail = 'Abril Fatface 400 has no "ā" (U+0101)'; r.ok = false; return r; }; });
  await openEx(); await page.click('[data-ex-go]'); await waitPhase('failed'); await blur();
  await shot(`${OUT}/failed-checks-1440.png`);
  await page.evaluate(() => { kdpCover.export.print = kdpCover.export.__orig; });
  await page.keyboard.press('Escape');
  // My layouts full: the files are ready, the note says the layout was not saved.
  await fresh();
  for (let i = 0; i < 100; i++) st.my.push({ id: `m${i}`, name: 'Old', from_book_id: `b${i}`, from_title: 'Old', fmt: { ...FIX.fmt }, bg: '#FFFFFF', layers: [], thumb: null, exported_at: '2026-10-01T00:00:00.000Z' });
  await openEx(); await page.click('[data-ex-go]'); await waitPhase('done'); await blur();
  await shot(`${OUT}/done-mylayouts-full-1440.png`);
  await page.keyboard.press('Escape');
  // The header after an export: "Done: cover files exported.", Next on, its tip on focus.
  await page.focus('[data-next]');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await shot(`${OUT}/header-done-next-tip-1440.png`);
  // Done at 1024 with Kindle off and JPG (the KDP lines without Kindle).
  await page.setViewportSize({ width: 1024, height: 900 });
  await fresh();
  await openEx(); await page.click('[data-ex-fmt="jpg"]'); await page.click('label.cv-ex-opt:has([data-ex-kindle])');
  await page.click('[data-ex-go]'); await waitPhase('done'); await blur();
  await shot(`${OUT}/done-jpg-no-kindle-1024.png`);
  await page.keyboard.press('Escape');
  // The remove question in Uploads (a picture used on this cover and on another book's).
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh();
  st.assets = []; st.files = {}; st.otherDesigns = [];
  await PIC.ready(page);
  await PIC.make(page, 'p', { w: 3000, h: 2000, type: 'image/jpeg', name: 'desk-sunrise.jpg', quality: 0.8 }); await PIC.pick(page, 'p'); await PIC.idle(page);
  await PIC.make(page, 's', { w: 1600, h: 1067, type: 'image/jpeg', name: 'notebook.jpg' }); await PIC.pick(page, 's'); await PIC.idle(page);
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.filter((x) => x.type === 'image').find((x) => x.name === 'notebook.jpg'); E.removeIds([l.id]); });
  await PIC.drawn(page); await CV.settled(page, 'saved');
  const desk = st.assets.find((a) => a.name === 'desk-sunrise.jpg');
  st.otherDesigns.push({ book_id: 'b0000002-0000-4000-8000-000000000002', layers: [{ id: 1, type: 'image', asset: desk.id }] });
  await page.click(`[data-up-x="${desk.id}"]`); await page.waitForSelector('[data-uprm-go]');
  await shot(`${OUT}/uploads-remove-question-1440.png`);
  await page.click('[data-uprm-cancel]');
  await CV.quiet(page);

  // The design's own HTML in this Chrome (as at STOP 5 to 9).
  const FILES = { 71: ['71-09-cover-export-ready', 'F71b'], '71b': ['71b-09-cover-export-done', 'F71'], '73d': ['73d-09-cover-export-failed', 'F73d'] };
  await page.context().unrouteAll();
  for (const n of Object.keys(FILES)) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/design/screens/${FILES[n][0]}.html?final=${FILES[n][1]}&clean=1`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${n}-design-html-in-chrome.png`, timeout: 30000 });
  }

  // Side by side: built | design (the design PNGs are 2× the window: 2880 × 1800).
  const base = 'http://127.0.0.1:5500';
  const WHAT = { 71: 'Export cover, ready', '71b': 'Export cover, done', '73d': 'Export failed (the engine did not start)' };
  for (const n of Object.keys(FILES)) {
    const w = 1440;
    await page.setViewportSize({ width: 2 * w + 80, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:${w}px}figcaption{padding:0 0 12px}img{display:block;width:${w}px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${n} · ${WHAT[n]}</figcaption><img src="${base}/tests/browser/shots/cover/b${n}-${w}.png"></figure>
      <figure><figcaption>DESIGN · ${FILES[n][0]}</figcaption><img src="${base}/design/screens/${FILES[n][0]}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${n}-compare-${w}.png`, fullPage: true, timeout: 30000 });
  }
  log.push('PASS 3 compares, 3 shots at 1024, 3 design HTML shots and 9 state shots');
  return log.join('\n');
};
