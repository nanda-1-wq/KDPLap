// E13.2b STOP 3 (never in a sweep): the 01 Brief trim chips (T10) with 8.5 × 11 chosen and its page
// estimate, next to design 14, at 1440, 900 and 390 px. Files go to docs/reviews/e13-2b-stop3/.
globalThis.__withFonts = true;
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const OUT = SHOTS.replace(/tests\/browser\/shots\/brief$/, 'docs/reviews/e13-2b-stop3');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  };
  const card = '.brief-card:has([data-chips="trim_size"])';
  await size(1440, 1000);
  await open(B2);
  await page.click('[data-chips="trim_size"] [data-value="8.5x11"]');
  await page.waitForTimeout(1000);
  await page.$eval(card, (c) => c.scrollIntoView({ block: 'start' }));
  await ready();
  await (await page.$(card)).screenshot({ path: `${SHOTS}/b-card-1440.png` });
  await page.screenshot({ path: `${OUT}/01-brief-8.5x11-1440.png` });
  log.push('PASS 01-brief-8.5x11-1440.png');
  await size(900, 900);
  await page.waitForTimeout(400);
  await page.$eval(card, (c) => c.scrollIntoView({ block: 'start' }));
  await ready();
  await (await page.$(card)).screenshot({ path: `${SHOTS}/b-card-900.png` });
  await page.screenshot({ path: `${OUT}/01-brief-8.5x11-900.png` });
  log.push('PASS 01-brief-8.5x11-900.png');
  await size(390, 844);
  await page.waitForTimeout(400);
  await ready();
  await page.screenshot({ path: `${OUT}/01-brief-390.png` });
  log.push('PASS 01-brief-390.png (the book wizard has no phone layout, before E13.2b too)');
  // Back to 6 × 9 so the mock book is as it was.
  await size(1440, 1000);
  await page.click('[data-chips="trim_size"] [data-value="6x9"]');
  await page.waitForTimeout(1000);

  const base = 'http://127.0.0.1:5500';
  await size(2960, 900);
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
    .sheet{display:flex;flex-direction:column;gap:24px;padding:32px;background:#F3F3F1;border:1px solid #B8B8B3}.sheet img{border:none}</style>
    <figure><figcaption>BUILT · 01 Size, trim, and voice: 6 chips (T10), 8.5 × 11 chosen, "About 30 to 40 pages at 8.5 × 11 in" · 1440 and 900</figcaption>
      <div class="sheet"><img src="${base}/tests/browser/shots/brief/b-card-1440.png"><img src="${base}/tests/browser/shots/brief/b-card-900.png"></div></figure>
    <figure><figcaption>DESIGN · 14-step01-brief (4 chips)</figcaption><img src="${base}/design/screens/14-step01-brief.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/01-brief-compare.png`, fullPage: true });
  ok(true, '01-brief-compare.png');
  return log.join('\n');
};
