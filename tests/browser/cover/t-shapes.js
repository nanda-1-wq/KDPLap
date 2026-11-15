// E16 Part 5: shapes (design 64): the Shapes panel (27 tiles, the design's addShape), the shape bar (Change shape
// with the per-shape settings, Fill solid / gradient / none with start, end and angle, Border width, dash and
// color, Line for a line, opacity, flip, size, Arrange, duplicate, lock, More: rotation, flip top to bottom,
// exclude from export, delete), saved and drawn.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'empty' });
  const last = async () => { const s = await CV.state(page); return s.layers[s.layers.length - 1]; };
  const sel = async () => { const s = await CV.state(page); return s.layers.find((l) => l.id === s.sel); };

  /* The panel. */
  await page.click('[data-tool="shapes"]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Shapes'), 'Shapes opens the Shapes panel');
  ok(await page.$eval('[data-tool="shapes"]', (b) => b.getAttribute('aria-pressed') === 'true' && b.classList.contains('is-on')), 'the Shapes tool is on');
  const tiles = await page.$$eval('[data-add-shape]', (a) => a.map((b) => b.innerText.trim()));
  ok(tiles.length === 27 && tiles.join('|') === 'Rectangle|Rounded|Circle|Half circle|Triangle|Diamond|Pentagon|Hexagon|Octagon|Slant|Trapezoid|Heart|Star|Badge|Seal|Shield|Moon|Cloud|Frame|Ring|Speech|Plus|Cross|Chevron|Arrow|Ribbon|Line', `27 tiles in the design order: ${tiles.length}`);
  ok((await CV.txt(page, '[data-panel] .cv-help')) === 'The shape drops in the middle of the front. Use shapes for color bands, frames behind the title, badges and dividers.', 'the panel help');

  /* Every tile adds the design's shape, centered on the front, selected. */
  const kinds = await page.$$eval('[data-add-shape]', (a) => a.map((b) => b.dataset.addShape));
  let bad = [];
  for (const k of kinds) {
    await page.click(`[data-add-shape="${k}"]`);
    const l = await last();
    const want = await page.evaluate((k) => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.shapes.defaults(k, kdpCover.geo.geo(E.cover.fmt)); }, k);
    const same = ['kind', 'x', 'y', 'w', 'h', 'fillMode', 'fill', 'sw', 'radius', 'points', 'depth'].every((f) => l[f] === want[f]);
    if (!same || (await CV.state(page)).sel !== l.id) bad.push(k);
  }
  ok(bad.length === 0, `each tile adds its shape with the design's fields, selected${bad.length ? ': ' + bad.join(', ') : ''}`);
  ok((await CV.state(page)).layers.length === 27, '27 layers');
  ok(await page.$eval('[data-textbar]', (b) => !b.hidden && b.getAttribute('aria-label') === 'Selected shape'), 'the shape bar shows');

  /* A rectangle: the bar of design 64. */
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="shapes"]');
  await page.click('[data-add-shape="rect"]');
  let bar = await CV.txt(page, '[data-textbar]');
  ok(/^Rectangle ▾ Fill Border 100% /.test(bar) && /2\.29 × 2\.29 in/.test(bar) && /Arrange ▾/.test(bar), `shape bar: ${bar}`);
  const labels = await page.$$eval('[data-textbar] [aria-label]', (a) => a.map((b) => b.getAttribute('aria-label')));
  ok(['Shape: Rectangle', 'Opacity 100%', 'Flip left to right', 'Duplicate', 'Lock', 'More', 'Delete'].every((x) => labels.includes(x)), `labels: ${labels.join(', ')}`);

  /* Change shape: 27 small tiles, the design's swap, and the settings of each kind. */
  await page.click('[data-k="shape"]');
  ok((await page.$$('[data-swap]')).length === 27, 'Change shape: 27 tiles');
  ok((await CV.txt(page, '.cv-pop-shape .cv-pop-p')) === 'Corner handles keep the shape. Side handles stretch it.', 'the shape note');
  ok((await page.$$eval('.cv-pop-shape [data-sk]', (a) => a.map((r) => r.dataset.sk))).join() === 'radius', 'Rectangle: Corners');
  await page.$eval('[data-sk="radius"]', (r) => { r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await sel()).radius === 30 && (await CV.txt(page, '[data-sv="radius"]')) === '30', 'Corners 30');
  for (const [k, sk] of [['star', 'points,depth'], ['frame', 'thick'], ['arrow', 'head'], ['heart', '']]) {
    await page.click(`[data-swap="${k}"]`);
    const l = await sel();
    ok(l.kind === k, `swap to ${k}`);
    ok((await page.$$eval('.cv-pop-shape [data-sk]', (a) => a.map((r) => r.dataset.sk))).join() === sk, `${k}: settings ${sk || 'none'}`);
  }
  await page.click('[data-swap="star"]');
  let l = await sel();
  ok(l.points === 5 && l.depth === 45, 'Star: 5 points, inner 45 (the design swap)');
  await page.$eval('[data-sk="points"]', (r) => { r.value = 8; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  ok((await sel()).points === 8, 'Points 8');
  await page.click('[data-swap="rect"]');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'shape'), 'Escape: focus back on the shape button');

  /* Fill. */
  await page.click('[data-k="sfill"]');
  ok((await page.$$eval('[data-fmode]', (a) => a.map((b) => b.innerText.trim()))).join('|') === 'Solid|Gradient|No fill', 'Fill: Solid, Gradient, No fill');
  ok(await CV.has(page, '.cv-pop-sfill [data-picker]'), 'Solid: the picker');
  await page.click('.cv-pop-sfill [data-hex="#7A2E2E"]');
  ok((await sel()).fill === '#7A2E2E', 'a swatch sets the fill');
  ok(await page.$eval('[data-k="sfill"] .cv-swatch', (s) => s.style.getPropertyValue('--sw') === '#7A2E2E'), 'the Fill button shows it');
  await page.click('[data-fmode="grad"]');
  l = await sel();
  ok(l.fillMode === 'grad', 'Gradient');
  ok((await page.$$eval('[data-gstop]', (a) => a.map((b) => [b.innerText.trim(), b.getAttribute('aria-pressed')]))).join() === 'Start color,true,End color,false', 'Start color on, End color');
  await page.click('[data-gstop="fill2"]');
  await page.click('.cv-pop-sfill [data-hex="#F2C14E"]');
  l = await sel();
  ok(l.fill2 === '#F2C14E' && l.fill === '#7A2E2E', 'End color sets fill2 only');
  await page.click('[data-gstop="fill"]');
  await page.fill('.cv-pop-sfill [data-pk-hex]', '#2E5E7E'); await page.press('.cv-pop-sfill [data-pk-hex]', 'Enter');
  ok((await sel()).fill === '#2E5E7E', 'Start color by hex');
  await page.$eval('[data-sk="gAngle"]', (r) => { r.value = 135; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await sel()).gAngle === 135 && (await CV.txt(page, '[data-sv="gAngle"]')) === '135°', 'Angle 135°');
  ok(/300 DPI picture/.test(await CV.txt(page, '.cv-pop-sfill')), 'the gradient note');
  await page.click('[data-fmode="none"]');
  ok((await sel()).fillMode === 'none' && !(await CV.has(page, '.cv-pop-sfill [data-picker]')), 'No fill: no picker');
  await page.click('[data-fmode="solid"]');
  await page.keyboard.press('Escape');

  /* Border. */
  await page.click('[data-k="stroke"]');
  ok(await page.$eval('.cv-pop-stroke', (p) => p.getAttribute('aria-label') === 'Border'), 'Border dialog');
  await page.$eval('[data-sk="sw"]', (r) => { r.value = 6; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await sel()).sw === 6 && (await CV.txt(page, '[data-sv="sw"]')) === '6 pt', 'Width 6 pt');
  ok((await page.$$eval('[data-dash]', (a) => a.map((b) => b.innerText.trim()))).join('|') === 'Solid|Dashed|Dotted', 'Solid, Dashed, Dotted');
  await page.click('[data-dash="dash"]');
  ok((await sel()).dash === 'dash', 'Dashed');
  await page.click('.cv-pop-stroke [data-hex="#E07A5F"]');
  ok((await sel()).scolor === '#E07A5F' && (await sel()).fill === '#2E5E7E', 'a swatch sets the border color only');
  await page.focus('.cv-pop-stroke [data-hex="#2F4A3A"]'); await page.keyboard.press('Enter');
  ok((await sel()).scolor === '#2F4A3A' && await page.evaluate(() => document.activeElement && document.activeElement.dataset.hex === '#2F4A3A'), 'a swatch picked with the keyboard keeps the focus');
  await page.keyboard.press('Escape');

  /* Opacity, flip, size, More. */
  await page.click('[data-k="op"]');
  await page.$eval('[data-sk="op"]', (r) => { r.value = 70; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await sel()).op === 70 && (await page.$eval('[data-k="op"]', (b) => b.getAttribute('aria-label'))) === 'Opacity 70%', 'Opacity 70%');
  await page.keyboard.press('Escape');
  await page.click('[data-k="flipH"]');
  ok((await sel()).flipH === true && await page.$eval('[data-k="flipH"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Flip left to right');
  await page.click('[data-k="more"]');
  ok((await CV.txt(page, '.cv-pop-more')).includes('Exclude from export') && (await CV.txt(page, '.cv-pop-more')).includes('Flip top to bottom'), 'More: rotation, flip top to bottom, exclude from export');
  await page.fill('[data-srot]', '30'); await page.press('[data-srot]', 'Tab');
  ok((await sel()).rot === 30, 'Rotation 30°');
  await page.click('[data-sact="rot-reset"]');
  ok((await sel()).rot === 0, 'Rotation Reset');
  await page.check('[data-scheck="flipV"]');
  await page.check('[data-scheck="noExport"]');
  l = await sel();
  ok(l.flipV === true && l.noExport === true, 'flip top to bottom; excluded from export');
  await page.keyboard.press('Escape');

  /* Size text follows a resize (side handle stretches). */
  const hd = await page.$eval('[data-handle="box"][data-c="e"]', (h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] + 70, hd[1], { steps: 5 }); await page.mouse.up();
  l = await sel();
  const z = (await CV.state(page)).z;
  ok(Math.abs(l.w - (160 + 70 / z)) < 1 && l.h === 160, `the side handle stretches (${l.w.toFixed(1)} × ${l.h})`);
  ok((await CV.txt(page, '[data-sizetext]')) === `${(l.w / 70).toFixed(2)} × 2.29 in`, `size text: ${await CV.txt(page, '[data-sizetext]')}`);

  /* Arrange, duplicate, lock, delete. */
  await page.click('[data-k="dup"]');
  let s = await CV.state(page);
  ok(s.layers.length === 2 && s.sel === s.layers[1].id && s.layers[1].x === s.layers[0].x + 14, 'Duplicate: the copy 14 px down and right, selected');
  await page.click('[data-k="arr"]'); await page.click('[data-sarr="back"]');
  s = await CV.state(page);
  ok(s.layers[0].id === s.sel, 'Send to back');
  await page.click('[data-k="lock"]');
  ok((await sel()).lock === true && !(await CV.has(page, '[data-handle]')), 'Lock: no handles');
  await page.click('[data-k="lock"]');
  await page.click('[data-k="del"]');
  ok((await CV.state(page)).layers.length === 1, 'Delete');

  /* A line: no Fill; "Line". */
  await page.click('[data-add-shape="line"]');
  bar = await CV.txt(page, '[data-textbar]');
  ok(!(await CV.has(page, '[data-k="sfill"]')) && /Line ▾ Line 100%/.test(bar), `line bar: ${bar.slice(0, 40)}`);
  ok((await page.$$('[data-handle="box"]')).length === 2, 'a line has 2 ends');

  /* Drawn on the canvas; saved. */
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="shapes"]');
  await page.click('[data-add-shape="ellipse"]');
  await page.waitForTimeout(150);   // the canvas paints on the next frame
  const c = await CV.center(page, (await last()).id);
  const px = await CV.px(page, c[0], c[1]);
  ok(Math.abs(px[0] - 0x1F) < 6 && Math.abs(px[1] - 0x3A) < 6 && Math.abs(px[2] - 0x5F) < 6 && px[3] === 255, `the circle is drawn in its fill (${px})`);
  await CV.settled(page, 'saved');
  const saved = CV.lastSave().body.layers;
  ok(saved.length === 1 && saved[0].kind === 'ellipse' && saved[0].fill === '#1F3A5F', 'saved');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
