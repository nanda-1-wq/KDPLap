// E16 STOP 7 compare shots (plan §10: P7 = 63), plus the Part 7 surfaces no final shows (their design approval, as
// at STOP 5 and 6): the panel's Pixabay and Unsplash tabs, the Unsplash picker, both previews, stock down (panel and
// large view), no results, a pick's credit in More, Uploads with stock pictures. Built from the design fixture (the
// design's book) and fixture-stock.js (the design's own sample pictures as results). 63 = design applyFinal F63:
// Band + warm blurb, Images panel on Pixabay, the picker open on Pixabay with "No background".
// Files go to docs/reviews/e16-stop7/. Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop7');
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return S && !S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more)); }, null, { timeout: 10000 });
  const imgs = () => page.waitForFunction(() => [...document.querySelectorAll('[data-stockdlg] img, [data-panel] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await imgs(); await page.waitForTimeout(700); };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = []; };

  /** F63: Band + warm blurb; Images on Pixabay; the picker open on Pixabay, color No background, 9 results. */
  async function build63() {
    fresh();
    await CV.open(page, { design: 'band' });
    await STK.ready(page);
    await page.click('[data-tool="images"]');
    await page.click('[data-srctab="pixabay"]');
    await page.click('[data-stock-nobg]');
    await page.fill('[data-stock-q]', 'study desk'); await page.press('[data-stock-q]', 'Enter'); await settle();
    await page.click('[data-stock-open]'); await settle();
    await blur();
  }

  // 63 at 1440 and 1024
  await page.setViewportSize({ width: 1440, height: 900 });
  await build63();
  ok(await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === 9, '63: 9 results in the picker');
  await shot(`${SHOTS}/b63-1440.png`);
  await page.setViewportSize({ width: 1024, height: 900 });
  await build63();
  await shot(`${OUT}/63-1024.png`);
  ok(await CV.noScroll(page), '63 at 1024: no sideways scroll');

  // The Part 7 surfaces at 1440
  await page.setViewportSize({ width: 1440, height: 900 });
  await build63();
  await page.keyboard.press('Escape'); await blur();
  await shot(`${OUT}/panel-pixabay-1440.png`);
  await page.click('[data-srctab="unsplash"]'); await settle(); await blur();
  await shot(`${OUT}/unsplash-press-go-1440.png`);   // N10: Unsplash waits for Go
  await page.click('[data-k="stk-go"]'); await settle(); await blur();
  await shot(`${OUT}/panel-unsplash-1440.png`);
  await page.click('[data-stock-open]'); await settle(); await blur();
  await shot(`${OUT}/picker-unsplash-1440.png`);
  await page.selectOption('[data-sd-f="ucolor"]', 'teal'); await blur();
  await shot(`${OUT}/unsplash-press-search-1440.png`);   // N10: a filter change waits for Search
  await page.click('[data-k="sd-go"]'); await settle();
  await page.selectOption('[data-sd-f="ucolor"]', 'any');
  await page.click('[data-k="sd-go"]'); await settle(); await blur();
  await page.click('[data-stock-look="u1AbC"]'); await blur();
  await shot(`${OUT}/preview-unsplash-1440.png`);
  await page.click('[data-sd-back]');
  await page.click('[data-sd-tab="pixabay"]'); await settle();
  await page.click('[data-stock-look="1000"]'); await blur();
  await shot(`${OUT}/preview-pixabay-1440.png`);
  await page.click('[data-sd-back]');
  globalThis.__modes.stockFail = 1; globalThis.__modes.stockCode = 'stock_unavailable';
  await page.fill('[data-sd-q]', 'study lamp'); await page.press('[data-sd-q]', 'Enter'); await settle(); await blur();
  await shot(`${OUT}/stock-down-large-1440.png`);
  await page.keyboard.press('Escape');
  await blur();
  await shot(`${OUT}/stock-down-panel-1440.png`);
  await page.click('[data-stock-open]');
  await page.fill('[data-sd-q]', 'nothing at all'); await page.press('[data-sd-q]', 'Enter'); await settle(); await blur();
  await shot(`${OUT}/no-results-1440.png`);
  await page.keyboard.press('Escape');

  // A pick from each source; Uploads lists both; the Unsplash photo's credit in More.
  await page.fill('[data-stock-q]', 'study desk'); await page.press('[data-stock-q]', 'Enter'); await settle();
  await page.click('[data-stock-add="1003"]'); await settle();
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(), l = E.selLayer(); E.setLayer(l.id, { x: 600, y: 440, w: 90, h: 90, pw: 90, ph: 90, px: 0, py: 0 }); });   // on the front, between the subtitle and the pen name
  await page.waitForTimeout(600);
  await page.click('[data-srctab="unsplash"]'); await settle();
  await page.click('[data-k="stk-go"]'); await settle();
  await page.click('[data-stock-add="u2AbC"]'); await settle();
  await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return [...E.pics.values()].filter((p) => p.st === 'ready').length >= 2; }, null, { timeout: 15000 });
  // on the back cover, under the blurb, so no text is covered
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(), l = E.selLayer(); E.setLayer(l.id, Object.assign({ x: 40, y: 350, w: 270, h: 180 }, kdpCover.model.coverFit(l, { w: 270, h: 180 }))); E.select(l.id); });
  await page.click('[data-srctab="up"]');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-uptiles] img')].length >= 2, null, { timeout: 15000 });
  await page.click('[data-k="more"]'); await blur();
  ok(/Photo by Ana Ruiz on Unsplash/.test(await CV.txt(page, '[data-credit]')), 'More shows the Unsplash credit');
  await shot(`${OUT}/uploads-credit-1440.png`);
  await page.keyboard.press('Escape');
  await CV.quiet(page);

  // The design's own HTML in this Chrome (as at STOP 5 and 6).
  await page.context().unrouteAll();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5500/design/screens/63-09-cover-images-pixabay.html?final=F63&clean=1', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/63-design-html-in-chrome.png`, timeout: 30000 });

  // Side by side: built (1440 × 900) | design (2880 × 1800, shown at 1440).
  const base = 'http://127.0.0.1:5500';
  await page.setViewportSize({ width: 2960, height: 1000 });
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>
    <figure><figcaption>BUILT · 63 · Images, Pixabay, the large view with No background</figcaption><img src="${base}/tests/browser/shots/cover/b63-1440.png"></figure>
    <figure><figcaption>DESIGN · 63-09-cover-images-pixabay</figcaption><img src="${base}/design/screens/63-09-cover-images-pixabay.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/63-compare-1440.png`, fullPage: true, timeout: 30000 });
  log.push('PASS 63-compare-1440.png and 13 more shots (14 files)');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
