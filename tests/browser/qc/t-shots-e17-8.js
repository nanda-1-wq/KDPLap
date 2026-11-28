// E17 STOP 8 (never in a sweep; not a check): 07 group 1 with the two part items of design 84 (Dedication on
// and empty, About the author on and not Final) at 1440 and 900, next to 84-step07-parts-states-1440.png /
// -900.png. Real fonts. All sections Final, so group 1 holds the part rows only, as 84 draws it.
// Built crops and the sheets go to docs/reviews/e17-stop8/.
// Run: tests/browser/run.sh qc t-shots-e17-8.js
globalThis.__withFonts = true;
const test = async page => {
  const log = globalThis.__log = [];
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/qc$/, 'docs/reviews/e17-stop8');
  const REL = 'docs/reviews/e17-stop8';
  const base = 'http://127.0.0.1:5500';
  st.clean();
  st.part('dedication').enabled = true;
  Object.assign(st.part('about_author'), { enabled: true, status: 'draft', version: { id: '8b000000-0000-4000-8000-000000000002', content: 'Nora Hale teaches chair yoga.', word_count: 5 } });
  const built = {};
  for (const w of [1440, 900]) {
    await page.setViewportSize({ width: w, height: 1100 });
    await QC.open7(page);
    await page.evaluate(() => document.fonts.ready);
    if (!st.runs.length) await QC.run(page);
    if (await page.evaluate(() => document.querySelector('[data-group="1"]').getAttribute('aria-expanded') !== 'true')) await page.click('[data-group="1"]');
    await page.mouse.move(5, 1090);
    await page.waitForTimeout(400);
    await page.locator('[data-group="1"]').evaluate((b) => b.closest('.qc-g').scrollIntoView({ block: 'center' }));
    await page.locator('.qc-g', { has: page.locator('[data-group="1"]') }).screenshot({ path: `${OUT}/built-84-07-group1-${w}.png`, timeout: 30000 });
    built[w] = `built-84-07-group1-${w}`;
  }
  async function sheet(name, img, design, width) {
    await page.setViewportSize({ width: width * 2 + 120, height: 900 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 10px}img{display:block;max-width:100%;border:1px solid #B8B8B3}</style>
      <figure style="width:${width}px"><figcaption>BUILT · 07 group 1 with the part items</figcaption><img src="${base}/${REL}/${img}.png?${Date.now()}"></figure>
      <figure style="width:${width}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }
  await sheet('84-07-items-1440-compare', built[1440], '84-step07-parts-states-1440', 1440);
  await sheet('84-07-items-900-compare', built[900], '84-step07-parts-states-900', 900);
  return log.join('\n');
};
