// Standing rule (plan 8.5), E14.4: the built 06-from-QC page at 1440 px next to design 56's PNG, the
// built page at 900 px, and "This spot changed". Files go to docs/reviews/e14-4-stop4/. Mock data only.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/qc$/, 'docs/reviews/e14-4-stop4');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(350); };
  const shot = async (name, dir = SHOTS) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, timeout: 20000 }); };
  const openVerify = async () => {
    await QC.open7(page);
    if ((await page.$eval('[data-group="2"]', (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click('[data-group="2"]');
    await page.click('#qc-g2 [data-open]');
    await page.waitForSelector('[data-qc-bar]:not([hidden])');
    await page.waitForFunction(() => document.querySelector('[data-editor]'), null, { timeout: 8000 });
  };

  st.sample();
  await size(1440, 900);
  await QC.open7(page);
  await QC.run(page);
  await openVerify();
  await page.waitForFunction(() => CSS.highlights.has('qc-spot'), null, { timeout: 6000 });
  await shot('b56');
  /* The mark, close up, for V4. */
  await ready();
  const box = await page.evaluate(() => { const r = [...CSS.highlights.get('qc-spot')][0].getClientRects()[0]; return { x: r.x - 8, y: r.y - 6, width: r.width + 150, height: r.height + 12 }; });
  await page.screenshot({ path: `${SHOTS}/spot-close.png`, clip: box, timeout: 20000 });

  /* 900 px: opened at this width, so the page scrolls for this layout. */
  await size(900, 900);
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await openVerify();
  await page.waitForFunction(() => CSS.highlights.has('qc-spot'), null, { timeout: 6000 });
  await shot('56-from-qc-900', OUT);
  await size(1440, 900);

  /* The spot changed. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  const x = st.runs[0].results.items.find((i) => i.rule === 'verify_mark');
  const row = st.sections().find((s) => s.id === x.section_id);
  st.edit(row, row.version.content.replace(x.quote, 'The writer fixed this sentence.'));
  await openVerify();
  await page.waitForFunction(() => /This spot changed/.test(document.querySelector('[data-qc-bar]').innerText), null, { timeout: 6000 });
  await shot('56-spot-changed-1440', OUT);
  await size(900, 900);
  await shot('56-spot-changed-900', OUT);

  const base = 'http://127.0.0.1:5500';
  await size(2960, 900);
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:1440px;border:1px solid #B8B8B3}</style>
    <figure><figcaption>BUILT · 06 from QC, 1440 px</figcaption><img src="${base}/tests/browser/shots/qc/b56.png"></figure>
    <figure><figcaption>DESIGN · 56-step06-write-from-qc</figcaption><img src="${base}/design/screens/56-step06-write-from-qc.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/56-from-qc-compare.png`, fullPage: true, timeout: 20000 });
  await size(1200, 300);
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><style>body{margin:12px;background:#fff}img{zoom:4;image-rendering:pixelated}</style><img src="${base}/tests/browser/shots/qc/spot-close.png">`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/56-spot-close-up.png`, timeout: 20000 });
  ok(true, 'shots done');
  return log.join('\n');
};
