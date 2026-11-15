// E16 STOP 5 compare shots (plan §10: P5 = 61, 64, 65, 66, plus the icons grid as its design approval, D11).
// Each final is built from the design fixture (the design's book, plan §10) in the state of the design's
// applyFinal: F61 the title with a shadow (strength 45, distance 4, softness 6) and Text effects open;
// F64 the band's rectangle with a gradient (#2E5E7E end, 135°) and its Fill open on the start color;
// F65 title, subtitle and pen name selected; F66 the Layers panel with the title's ⋮ menu at the design's
// place (x 414, y 150 of the 1440 page). Then shown next to the design PNG at 1440 (NN-compare-1440.png),
// plus the built screen at 1024 (NN-1024.png). Files go to docs/reviews/e16-stop5/.
// Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop5');
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());

  async function build(id) {
    st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
    globalThis.__modes = {};
    const b = await FIX.band(page);
    if (id === '61') b.layers = b.layers.map((l) => (l.src === 'title' ? Object.assign({}, l, { fx: Object.assign({}, l.fx, { style: 'shadow', color: '#1C1C1A', int: 45, dist: 4, blur: 6 }) }) : l));
    if (id === '64') { const sh = b.layers.find((l) => l.type === 'shape'); b.layers = b.layers.map((l) => (l.id === sh.id ? Object.assign({}, l, { fillMode: 'grad', fill2: '#2E5E7E', gAngle: 135 }) : l)); }
    st.design = { book_id: FIX.BOOK, layers: b.layers, bg: b.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await CV.open(page);
    if (id === '61') {
      const t = await CV.layer(page, 'title');
      await page.focus(`[data-hit="${t.id}"]`); await page.keyboard.press('Enter');
      await page.click('[data-k="fx"]');
    }
    if (id === '64') {
      const sh = (await CV.state(page)).layers.find((l) => l.type === 'shape');
      await page.focus(`[data-hit="${sh.id}"]`); await page.keyboard.press('Enter');
      await page.click('[data-k="sfill"]');
    }
    if (id === '65') await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.selectIds(E.cover.layers.filter((l) => ['title', 'subtitle', 'pen'].includes(l.src)).map((l) => l.id)); });
    if (id === '66') {
      await page.click('[data-tool="layers"]');
      await page.evaluate(() => {
        const E = window.kdpBookSteps[9]._debug(), R = E.root.getBoundingClientRect();
        const t = E.cover.layers.find((l) => l.src === 'title');
        E.layerMenu = { id: t.id, x: Math.round(414 - R.left), y: Math.round(150 - R.top) };
        E.refreshBars(); E.refreshPanel();
      });
    }
    if (id === 'icons') {
      await page.click('[data-tool="shapes"]'); await page.waitForSelector('[data-icon-grid]', { timeout: 15000 });
      // Three icons on the back cover: the crown as added (navy), the paw (5 paths) with a border, the sun (9 paths) as a gradient.
      for (const n of ['crown', 'paw', 'sun']) await page.click(`[data-add-icon="${n}"]`);
      await page.evaluate(() => {
        const E = window.kdpBookSteps[9]._debug(), g = kdpCover.geo.geo(E.cover.fmt), x0 = g.liveBack.x0 + 20;
        const ic = E.cover.layers.filter((l) => l.kind === 'icon');
        E.setLayer(ic[0].id, { x: x0, y: 400, w: 90, h: 90 });
        E.setLayer(ic[1].id, { x: x0 + 110, y: 400, w: 90, h: 90, fill: '#F2C14E', sw: 2, scolor: '#1C1C1A' });
        E.setLayer(ic[2].id, { x: x0 + 220, y: 400, w: 90, h: 90, fillMode: 'grad', fill: '#E07A5F', fill2: '#7A2E2E', gAngle: 135 });
        E.selectIds([ic[1].id]);
      });
      await page.evaluate(() => { const p = document.querySelector('[data-panel]'); p.scrollTop = p.querySelector('[data-icon-q]').offsetTop - 120; });
    }
    await blur();
  }

  const finals = [['61', '61-09-cover-text-effects', 'title shadow, Text effects open'], ['64', '64-09-cover-shape-fill', 'rectangle gradient, Fill open'],
    ['65', '65-09-cover-several-selected', 'title, subtitle and pen name selected'], ['66', '66-09-cover-layers-menu', 'Layers panel, the title\'s ⋮ menu']];
  for (const [id] of finals.concat([['icons']])) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await build(id);
    await shot(id === 'icons' ? `${OUT}/icons-grid-1440.png` : `${SHOTS}/b${id}-1440.png`);
    if (id === 'icons') {
      // The whole Shapes panel in one tall window: the 27 shapes, the icon search and the first 48 icons (the D11 approval).
      await page.setViewportSize({ width: 1440, height: 2700 });
      await page.waitForTimeout(300);
      await page.locator('[data-panel]').screenshot({ path: `${OUT}/icons-grid-panel.png`, timeout: 30000 });
      // A search: "laurel".
      await page.fill('[data-icon-q]', 'laurel');
      await page.waitForTimeout(200);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => { const p = document.querySelector('[data-panel]'); p.scrollTop = p.querySelector('[data-icon-q]').offsetTop - 120; });
      await shot(`${OUT}/icons-search-1440.png`);
      log.push('PASS icons-grid-1440.png, icons-grid-panel.png, icons-search-1440.png');
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    await build(id);
    await shot(`${OUT}/${id === 'icons' ? 'icons-grid' : id}-1024.png`);
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
