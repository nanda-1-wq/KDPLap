// E13.3 STOP 4 (never in a sweep; not a check): the Books card marks next to design 50 (the BOOKS CARD
// block), with the real fonts. A card with DOCX, Print PDF and EPUB current (as 50), and a card with
// "EPUB changed". Mock data (the E11 mock). Crops go to tests/browser/shots/books/ (ignored); the built
// grid and the compare sheet go to docs/reviews/e13-3-stop4/.
globalThis.__withFonts = true;
const test = async (page) => {
  const out = globalThis.__log = [];
  const S = () => globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/books$/, 'docs/reviews/e13-3-stop4');
  const REL = 'docs/reviews/e13-3-stop4';
  const card = (id) => page.locator('.book-card', { has: page.locator(`[data-book-menu="${id}"]`) });
  const fonts = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const t1 = '2026-11-08T09:00:00Z', t2 = '2026-11-20T09:00:00Z', t3 = '2026-11-21T09:00:00Z';

  globalThis.__modes = {};
  await setupE11(page);
  S().badges = [{ book_id: E11.B1, exported_at: t1, changed: false }, { book_id: E11.B2, exported_at: t1, changed: false }];
  S().pdfMarks = [{ book_id: E11.B1, exported_at: t2, page_count: 48, changed: false }, { book_id: E11.B2, exported_at: t2, page_count: 40, changed: false }];
  S().epubMarks = [{ book_id: E11.B1, exported_at: t3, changed: false }, { book_id: E11.B2, exported_at: t1, changed: true }];
  for (const w of [1440, 900]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.stat .bar').waitFor({ timeout: 10000 });
    await page.waitForFunction((id) => document.querySelector(`[data-book-menu="${id}"]`).closest('.book-card').innerText.includes('EPUB'), E11.B1, { timeout: 5000 });
    await fonts();
    await card(E11.B1).screenshot({ path: `${SHOTS}/b50-card-current-${w}.png`, timeout: 10000 });
    await card(E11.B2).screenshot({ path: `${SHOTS}/b50-card-changed-${w}.png`, timeout: 10000 });
    await page.locator('.book-grid').screenshot({ path: `${OUT}/50-built-grid-${w}.png`, timeout: 10000 });
    out.push(`PASS ${REL}/50-built-grid-${w}.png`);
  }

  /* The sheet: the built cards on the left, design 50 on the right. */
  const base = 'http://127.0.0.1:5500';
  await page.setViewportSize({ width: 2100, height: 900 });
  await page.goto(`${base}/robots.txt`);
  const img = (b) => `<img src="${base}/tests/browser/shots/books/${b}.png">`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%}
    .sheet{display:flex;flex-direction:column;gap:20px;padding:20px;background:#F3F3F1;border:1px solid #B8B8B3}
    .row{display:flex;gap:20px;align-items:flex-start}</style>
    <figure style="width:560px"><figcaption>BUILT · Books cards: DOCX, Print PDF, EPUB current (newest: the EPUB); EPUB changed (1440, then 900)</figcaption><div class="sheet">
      <div class="row">${img('b50-card-current-1440')}</div><div class="row">${img('b50-card-changed-1440')}</div>
      <div class="row">${img('b50-card-current-900')}</div><div class="row">${img('b50-card-changed-900')}</div></div></figure>
    <figure style="width:1440px"><figcaption>DESIGN · 50-step09-ready-to-publish (BOOKS CARD, right)</figcaption><img style="border:1px solid #B8B8B3" src="${base}/design/screens/50-step09-ready-to-publish.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/50-compare.png`, fullPage: true, timeout: 30000 });
  out.push(`PASS ${REL}/50-compare.png`);
  return out.join('\n');
};
