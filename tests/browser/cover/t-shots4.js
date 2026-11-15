// E16 STOP 4 compare shots (plan §10: P4 = 58, 59, 60, 73, 73c). Each final is built from the design fixture
// (the design's book, plan §10) in the same state as the design's ?final= step, then shown next to the design PNG
// at 1440 (NN-compare-1440.png), plus the built screen at 1024 (NN-1024.png). Files go to docs/reviews/e16-stop4/.
// Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop4');
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600); };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };

  /** The state of one final (design applyFinal), at the current window size. */
  async function build(id) {
    st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
    globalThis.__modes = {};
    if (id === '58') { await CV.open(page, { design: null }); return; }   // a new cover: the template popover opens
    if (id === '73') { st.pdf = null; await CV.open(page, { design: 'band' }); return; }
    await CV.open(page, { design: 'band' });
    if (id === '73c') {
      globalThis.__modes.saveFail = 99;
      const pen = await CV.layer(page, 'pen');
      await page.focus(`[data-hit="${pen.id}"]`); await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');   // a change that does not move it
      await CV.settled(page, 'failed');
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      return;
    }
    const t = await CV.layer(page, 'title');
    await page.focus(`[data-hit="${t.id}"]`); await page.keyboard.press('Enter');
    if (id === '59') await page.click('[data-k="font"]');
    if (id === '60') await page.click('[data-k="color"]');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
  }

  const finals = [['58', '58-09-cover-new', 'new cover, the KDP template layer popover'], ['59', '59-09-cover-text-fonts', 'title selected, the font list'],
    ['60', '60-09-cover-text-color', 'title selected, text color'], ['73', '73-09-cover-locked', 'Locked: no current Print PDF'], ['73c', '73c-09-cover-save-failed', 'Save failed']];
  for (const [id] of finals) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await build(id);
    await shot(`${SHOTS}/b${id}-1440.png`);
    await page.setViewportSize({ width: 1024, height: 900 });
    await build(id);
    await shot(`${OUT}/${id}-1024.png`);
    ok(await CV.noScroll(page), `${id} at 1024: no sideways scroll`);
    log.push(`PASS ${id}-1024.png`);
  }
  await CV.quiet(page);

  // Side by side: built (1440 × 900) | design (2880 × 1800, shown at 1440).
  const base = 'http://127.0.0.1:5500';
  for (const [id, design, title] of finals) {
    await page.setViewportSize({ width: 2960, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${id} · ${title}</figcaption><img src="${base}/tests/browser/shots/cover/b${id}-1440.png"></figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${id}-compare-1440.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${id}-compare-1440.png`);
  }
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
