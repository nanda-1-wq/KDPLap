// E13.2b STOP 3 (never in a sweep): Settings, Default trim size with the 6 Print PDF trims (T10), next to
// design 25, at 1440, 900 and 390 px. The select is drawn as a list box (size=6) for the picture only.
// Files go to docs/reviews/e13-2b-stop3/.
globalThis.__withFonts = true;
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const OUT = SHOTS.replace(/tests\/browser\/shots\/settings$/, 'docs/reviews/e13-2b-stop3');
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  globalThis.__modes = {};
  await setupE11(page);
  globalThis.__store.settings.default_trim = '8.5x11';
  const card = '.set-field:has(#trimSelect)';
  for (const [w, h] of [[1440, 900], [900, 900], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${E11.base}/app/settings.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#trimSelect option').nth(5).waitFor({ state: 'attached', timeout: 10000 });
    await page.$eval(card, (c) => c.scrollIntoView({ block: 'center' }));
    await ready();
    await page.screenshot({ path: `${OUT}/settings-trim-${w}.png` });
    log.push(`PASS settings-trim-${w}.png`);
    if (w === 1440) {
      await page.$eval('#trimSelect', (s) => { s.size = s.options.length; s.style.height = 'auto'; });
      await ready();
      await (await page.$(card)).screenshot({ path: `${SHOTS}/s-trim-list.png` });
    }
  }
  const base = 'http://127.0.0.1:5500';
  await page.setViewportSize({ width: 2960, height: 900 });
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
    .sheet{padding:32px;background:#F3F3F1;border:1px solid #B8B8B3}.sheet img{border:none}</style>
    <figure><figcaption>BUILT · Settings, Trim size: the 6 trims (T10) as a list, 8.5 × 11 chosen · 1440</figcaption>
      <div class="sheet"><img src="${base}/tests/browser/shots/settings/s-trim-list.png"></div>
      <img style="margin-top:24px" src="${base}/docs/reviews/e13-2b-stop3/settings-trim-1440.png"></figure>
    <figure><figcaption>DESIGN · 25-settings (4 trims)</figcaption><img src="${base}/design/screens/25-settings.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/settings-compare.png`, fullPage: true });
  ok(true, 'settings-compare.png');
  return log.join('\n');
};
