// E16 STOP 9 compare shots (plan §10: P9 = 69, 70, 72, 73b, 74, 74b), as the design's applyFinal cases build them:
// 69 = F69 Band + warm blurb, Preview final open. 70 = F70: the subtitle at 6 pt, the pen name 30 px lower, the Checks
// drawer open. 72 = F72: Band + blurb laid out at 54 pages, the book now 120 pages (the remap and its note). 73b = F73b:
// offline. 74 = F74: 1024 × 900, the Images panel (Uploads) open over the cover. 74b = F74b: 800 × 900, the notice.
// Plus the Part 9 states no final shows (their design approval, as at STOP 5 to 8): the drawer with every kind of item,
// With bleed and the black and white check, a wide trim's Kindle (kFit), the size note with spine text on, the offline
// footer after a change, Text effects at 1024 (the STOP 5 note), the notice when offline.
// Files go to docs/reviews/e16-stop9/. Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop9');
  const ready = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const m = window.kdpBookSteps && window.kdpBookSteps[9]; const E = m && m._debug(); return !E || E.status !== 'ready' || ((!E.pv.open || E.pv.painted > 0) && [...document.querySelectorAll('[data-panel] img')].every((i) => i.complete && i.naturalWidth > 0)); }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
  };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const band = await FIX.band(page);
  const designOf = (layers, fmt) => ({ book_id: FIX.BOOK, layers, bg: band.bg, fmt: fmt || { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const fresh = () => { globalThis.__modes = {}; st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true }; st.book.trim = '6x9'; st.book.paper = 'white'; };
  const f70 = () => JSON.parse(JSON.stringify(band.layers)).map((l) => (l.src === 'subtitle' ? Object.assign(l, { size: 6 }) : l.src === 'pen' ? Object.assign(l, { y: l.y + 30 }) : l));

  const build = {
    async 69() { fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers))); await CV.open(page); await page.click('[data-k="pv"]'); await blur(); },
    async 70() { fresh(); st.design = designOf(f70()); await CV.open(page); await page.click('[data-k="chk"]'); await blur(); },
    async 72() { fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers))); st.pdf.page_count = 120; await CV.open(page); await CV.settled(page, 'saved'); await blur(); },
    async '73b'() { fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers))); await CV.open(page); await page.context().setOffline(true); await page.waitForSelector('[data-offbar]:not([hidden])'); await blur(); },
    async 74() { fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers))); await CV.open(page); await page.click('[data-tool="images"]'); await blur(); },
    async '74b'() { fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers))); await CV.open(page); await page.waitForSelector('[data-tiny]'); await blur(); }
  };

  // Two pictures in Uploads for 74 (design: a 6,000 × 4,000 photo and a 1,600 × 1,067 one), made in the page; none on the cover.
  fresh(); st.assets = []; st.files = {}; st.uploads = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  st.design = designOf(JSON.parse(JSON.stringify(band.layers)));
  await CV.open(page);
  await PIC.ready(page);
  await PIC.make(page, 's', { w: 1600, h: 1067, type: 'image/jpeg', name: 'notebook.jpg' }); await PIC.pick(page, 's'); await PIC.idle(page);
  await PIC.make(page, 'p', { w: 6000, h: 4000, type: 'image/jpeg', name: 'desk-sunrise.jpg', quality: 0.8 }); await PIC.pick(page, 'p'); await PIC.idle(page);
  await CV.settled(page, 'saved');
  ok(st.assets.length === 2, `two pictures in Uploads (${st.assets.length})`);

  // The finals at 1440 (built) and 1024; 74 at 1024, 74b at 800.
  const sizes = { 69: [[1440, 'b'], [1024, '']], 70: [[1440, 'b'], [1024, '']], 72: [[1440, 'b'], [1024, '']], '73b': [[1440, 'b'], [1024, '']], 74: [[1024, 'b']], '74b': [[800, 'b']] };
  for (const n of ['69', '70', '72', '73b', '74', '74b']) {
    for (const [w, kind] of sizes[n]) {
      await page.setViewportSize({ width: w, height: 900 });
      await build[n]();
      if (kind === 'b') await shot(`${SHOTS}/b${n}-${w}.png`); else await shot(`${OUT}/${n}-${w}.png`);
      ok(await CV.noScroll(page), `${n} at ${w}: no sideways scroll`);
      if (n === '73b') { await page.context().setOffline(false); await CV.settled(page); }
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  /* The Part 9 states no final shows, at 1440. */
  await page.setViewportSize({ width: 1440, height: 900 });
  // The drawer with every kind: Must fix (a missing pen name: the reason, no button; a hidden subtitle: Show it), Check, Tip.
  fresh();
  {
    const pen = st.book.pen_name; st.book.pen_name = '';
    const L = JSON.parse(JSON.stringify(band.layers)).filter((l) => l.src !== 'pen' && l.src !== 'blurb');
    L.find((l) => l.src === 'subtitle').hidden = true;
    L.find((l) => l.src === 'title').y = 34;
    st.design = designOf(L);
    await CV.open(page);
    await page.click('[data-k="chk"]'); await blur();
    await shot(`${OUT}/checks-kinds-1440.png`);
    st.book.pen_name = pen;
  }
  // Ready.
  fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers)));
  await CV.open(page); await page.click('[data-k="chk"]'); await blur();
  await shot(`${OUT}/checks-ready-1440.png`);
  // Preview final: With bleed + black and white.
  await page.keyboard.press('Escape');
  await page.click('[data-k="pv"]'); await page.click('[data-pv-cut="0"]'); await page.check('[data-pv-gray]'); await blur();
  await shot(`${OUT}/preview-bleed-bw-1440.png`);
  await page.keyboard.press('Escape');
  // Preview final at 8.5 × 11: kFit (the background above and below the Kindle front).
  fresh(); st.book.trim = '8.5x11';
  {
    const r = await page.evaluate(([b]) => kdpCover.layouts.build('band', b, { trim: '8.5x11', pages: 54, paper: 'white' }, 1, null), [{ title: FIX.title, subtitle: FIX.subtitle, pen: FIX.pen }]);
    st.design = Object.assign(designOf(r.layers, { trim: '8.5x11', pages: 54, paper: 'white' }), { bg: r.bg });
  }
  await CV.open(page); await page.click('[data-k="pv"]'); await blur();
  await shot(`${OUT}/preview-kfit-8.5x11-1440.png`);
  await page.keyboard.press('Escape');
  // The size note after Add spine text; then the trim change words.
  await build[72]();
  await page.click('[data-size-spine]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'spine'), null, { timeout: 10000 });
  await blur();
  await shot(`${OUT}/size-spine-on-1440.png`);
  await page.click('[data-size-moved]'); await blur();
  await shot(`${OUT}/size-show-moved-1440.png`);
  // Offline after a change: the footer "Offline · kept on this device".
  await build['73b']();
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.setLayer(t.id, { x: t.x + 1 }); });
  await page.waitForTimeout(1000);
  await shot(`${OUT}/offline-kept-1440.png`);
  // The notice while offline (its saved words), at 800.
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForSelector('[data-tiny]');
  await shot(`${OUT}/74b-offline-800.png`);
  await page.context().setOffline(false);
  await CV.settled(page, 'saved');
  // Text effects at 1024 (the STOP 5 note): Shadow, Softness in view.
  await page.setViewportSize({ width: 1024, height: 900 });
  fresh(); st.design = designOf(JSON.parse(JSON.stringify(band.layers)));
  await CV.open(page);
  const t = await CV.layer(page, 'title');
  await page.click(`[data-hit="${t.id}"]`);
  await page.click('[data-k="fx"]');
  await page.click('.cv-fx-tile >> nth=1');
  await blur();
  await shot(`${OUT}/effects-shadow-1024.png`);
  await page.keyboard.press('Escape');
  await CV.quiet(page);

  // The design's own HTML in this Chrome (as at STOP 5 to 8).
  const FILES = { 69: '69-09-cover-preview-final', 70: '70-09-cover-checks', 72: '72-09-cover-size-changed', '73b': '73b-09-cover-offline', 74: '74-09-cover-window-1024', '74b': '74b-09-cover-too-narrow' };
  await page.context().unrouteAll();
  for (const n of Object.keys(FILES)) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/design/screens/${FILES[n]}.html?final=F${n}&clean=1`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${n}-design-html-in-chrome.png`, timeout: 30000 });
  }

  // Side by side: built | design (the design PNGs are 2× the window: 2880 × 1800, 2048 × 1800 for 74, 1600 × 1800 for 74b).
  const base = 'http://127.0.0.1:5500';
  const WHAT = { 69: 'Preview final', 70: 'Checks', 72: 'The book size changed', '73b': 'Offline', 74: 'Window 1024 px, Images panel over the cover', '74b': 'Window 800 px, too narrow' };
  const W = { 69: 1440, 70: 1440, 72: 1440, '73b': 1440, 74: 1024, '74b': 800 };
  for (const n of Object.keys(FILES)) {
    const w = W[n];
    await page.setViewportSize({ width: 2 * w + 80, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:${w}px}figcaption{padding:0 0 12px}img{display:block;width:${w}px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${n} · ${WHAT[n]}</figcaption><img src="${base}/tests/browser/shots/cover/b${n}-${w}.png"></figure>
      <figure><figcaption>DESIGN · ${FILES[n]}</figcaption><img src="${base}/design/screens/${FILES[n]}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${n}-compare-${w}.png`, fullPage: true, timeout: 30000 });
  }
  log.push('PASS 6 compares, 4 shots at 1024, 6 design HTML shots and 10 state shots');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
