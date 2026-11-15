// E16 Part 5: text effects (design 61): the 9 styles and their controls, the effect color, curve,
// distortion basic and free (the 4 green corners on the cover, by mouse and keyboard), Cancel restores,
// OK and × keep, one undo step a drag, the vector / picture note, saved.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  const title = async () => CV.layer(page, 'title');
  const t0 = await title();
  await page.focus(`[data-hit="${t0.id}"]`); await page.keyboard.press('Enter');

  /* Open: the popover of design 61. */
  await page.click('[data-k="fx"]');
  ok(await CV.has(page, '[data-fxpop][role="dialog"][aria-label="Text effects"]'), 'Effects opens the Text effects dialog');
  ok(await page.$eval('[data-k="fx"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'Effects: aria-expanded true');
  const tiles = await page.$$eval('[data-fx-style]', (a) => a.map((b) => [b.dataset.fxStyle, b.innerText.trim(), b.getAttribute('aria-pressed')]));
  ok(tiles.map((t) => t[1]).join('|') === 'None|Shadow|Lift|Glow|Outline|Hollow|3D|Echo|Background', `9 styles: ${tiles.map((t) => t[1]).join(', ')}`);
  ok(tiles[0][2] === 'true' && tiles.slice(1).every((t) => t[2] === 'false'), 'None is on');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.fxStyle === 'none'), 'focus goes to the style that is on');
  ok(!(await CV.has(page, '.cv-fx-box')), 'None: no controls');
  const inked = await page.$$eval('canvas[data-fx-tile]', (a) => a.map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; }));
  ok(inked.length === 9 && inked.every((n) => n > 40), `each tile's "A" is drawn by the renderer (${inked.join(', ')} px)`);
  const note = await CV.txt(page, '[data-fxpop] > .cv-pop-p');
  ok(note === 'Outline, 3D, curve, and full-strength shadows and backgrounds stay sharp text. Soft or light effects, glow, lift and echo become a 300 DPI picture under your text. Hollow and distortion turn the text into a 300 DPI picture.', 'the note: the owner\'s words (STOP 5; D1, D17)');
  // STOP 5, F1: at 1440 × 900 the four shadow sliders show with no scroll (the effect color square is 70 px).
  await page.click('[data-fx-style="shadow"]');
  const fit = await page.evaluate(() => {
    const p = document.querySelector('[data-fxpop]'), pr = p.getBoundingClientRect(), sv = p.querySelector('.cv-sv');
    const rows = [...p.querySelectorAll('.cv-fx-row')].map((r) => r.getBoundingClientRect());
    return { sv: sv.getBoundingClientRect().height, scroll: p.scrollTop, inside: rows.length === 4 && rows.every((r) => r.top >= pr.top && r.bottom <= pr.bottom), bottom: pr.bottom, ih: innerHeight };
  });
  ok(fit.sv === 70 && fit.inside && fit.scroll === 0 && fit.bottom <= fit.ih, `1440 × 900: Strength, Distance, Direction, Softness all show, no scroll (square ${fit.sv} px)`);
  await page.click('[data-fx-style="none"]');
  // The note agrees with the flatten plan, style by style.
  const agree = await page.evaluate(() => {
    const F = kdpCover.flatten, M = kdpCover.model, T = (fx, o) => M.textLayer(1, Object.assign({ text: 'A', x: 0, y: 0, w: 100, size: 20, font: 'IBM Plex Sans', fx: Object.assign({}, M.FX_DEF, fx) }, o || {}));
    const cls = (fx, o) => F.classify(T(fx, o)).cls;
    return [cls({ style: 'outline' }), cls({ style: '3d' }), cls({ style: 'none' }, { curve: 40 }), cls({ style: 'shadow', int: 100, blur: 0 }), cls({ style: 'bg', int: 100 }),
      cls({ style: 'glow' }), cls({ style: 'lift' }), cls({ style: 'echo' }), cls({ style: 'shadow', int: 60, blur: 0 }), cls({ style: 'shadow', int: 100, blur: 3 }), cls({ style: 'bg', int: 60 }),
      cls({ style: 'hollow' }), cls({ style: 'none' }, { dist: { on: true, mode: 'basic', top: 10, bottom: 0, q: [[0, 0], [0, 0], [0, 0], [0, 0]] } })].join(' ');
  });
  ok(agree === 'vector vector vector vector vector effect effect effect effect effect effect raster raster', `the note matches the flatten plan (${agree})`);

  /* Each style: its own default color and the design's controls. */
  const want = { shadow: ['#1C1C1A', 'Strength Distance Direction Softness', true], lift: ['#1C1C1A', 'Strength Distance Softness', false], glow: ['#F2C14E', 'Strength Softness', true],
    // the design's markup order (Strength, Distance, Direction, Softness, Thickness, Depth, Space, Roundness): 3D shows Direction first
    outline: ['#F2C14E', 'Thickness', true], hollow: ['#1C1C1A', 'Thickness', false], '3d': ['#E07A5F', 'Direction Depth', true], echo: ['#E07A5F', 'Distance Direction Thickness', true], bg: ['#F2C14E', 'Strength Space Roundness', true] };
  for (const [k, [col, ctl, hasColor]] of Object.entries(want)) {
    await page.click(`[data-fx-style="${k}"]`);
    const l = await title();
    ok(l.fx.style === k && l.fx.color === col, `${k}: style and its color ${col} (${l.fx.style} ${l.fx.color})`);
    const rows = await page.$$eval('.cv-fx-row > span:first-child', (a) => a.map((s) => s.textContent).join(' '));
    ok(rows === ctl, `${k}: controls ${rows}`);
    ok((await CV.has(page, '.cv-fx-box [data-picker]')) === hasColor, `${k}: color picker ${hasColor ? 'shown' : 'not shown'}`);
    ok(await page.$eval(`[data-fx-style="${k}"]`, (b) => b.getAttribute('aria-pressed') === 'true'), `${k}: its tile is on`);
  }

  /* Sliders: the design's ranges; the number changes in place (the drag is not ended). */
  await page.click('[data-fx-style="shadow"]');
  const ranges = await page.$$eval('[data-fx-k]', (a) => a.map((r) => `${r.dataset.fxK} ${r.min}-${r.max}`));
  ok(ranges.join(', ') === 'int 10-100, dist 0-30, dir 0-359, blur 0-30', `shadow ranges: ${ranges.join(', ')}`);
  const node = await page.$('[data-fx-k="int"]');
  await page.$eval('[data-fx-k="int"]', (r) => { r.value = 45; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await title()).fx.int === 45, 'Strength 45');
  ok(await node.evaluate((n) => n.isConnected), 'the slider stays the same element while it moves');
  ok((await CV.txt(page, '[data-fx-v="int"]')) === '45', 'its number shows 45');
  await page.$eval('[data-fx-k="dir"]', (r) => { r.value = 120; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  ok((await title()).fx.dir === 120 && (await CV.txt(page, '[data-fx-v="dir"]')) === '120°', 'Direction 120°');
  // the effect color: a swatch, then the hex field
  await page.click('.cv-fx-box [data-hex="#7A2E2E"]');
  ok((await title()).fx.color === '#7A2E2E', 'a swatch sets the effect color');
  await page.fill('.cv-fx-box [data-pk-hex]', '2f4a3a'); await page.press('.cv-fx-box [data-pk-hex]', 'Enter');
  ok((await title()).fx.color === '#2F4A3A', 'the hex field sets the effect color');
  ok((await title()).color === '#FFFFFF', 'the text color is unchanged');

  /* Curve: range and number, Reset. */
  await page.$eval('input[type="range"][data-fx-num="curve"]', (r) => { r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await title()).curve === 40 && (await page.$eval('input[type="number"][data-fx-num="curve"]', (n) => n.value)) === '40', 'Curve 40, the number follows');
  await page.fill('input[type="number"][data-fx-num="curve"]', '-250'); await page.press('input[type="number"][data-fx-num="curve"]', 'Tab');
  ok((await title()).curve === -100, 'the number is kept in −100 to 100');
  await page.click('[data-fx="curve-reset"]');
  ok((await title()).curve === 0, 'Reset: 0');

  /* Distortion: basic. */
  await page.check('[data-fx-dist]');
  let l = await title();
  ok(l.dist.on === true && l.dist.mode === 'basic', 'Enable distortion: on, Basic');
  ok(await CV.has(page, '[role="radiogroup"][aria-label="Distortion type"]'), 'Basic or Free transform');
  await page.$eval('input[type="range"][data-fx-num="top"]', (r) => { r.value = 30; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('input[type="number"][data-fx-num="bottom"]', '-20'); await page.press('input[type="number"][data-fx-num="bottom"]', 'Tab');
  l = await title();
  ok(l.dist.top === 30 && l.dist.bottom === -20, `Top 30, Bottom −20 (${l.dist.top}, ${l.dist.bottom})`);
  await page.click('[data-fx="top-reset"]');
  ok((await title()).dist.top === 0, 'Top Reset');
  ok(!(await CV.has(page, '[data-handle="quad"]')), 'Basic: no green corners');

  /* Free: 4 labelled green corners; drag one; the popover stays open. */
  await page.check('input[data-fx-mode][value="free"]');
  ok((await title()).dist.mode === 'free', 'Free transform');
  ok((await CV.txt(page, '.cv-fx-free')).startsWith('Drag the 4 green corners on the cover.'), 'the free note');
  const qs = await page.$$eval('[data-handle="quad"]', (a) => a.map((h) => h.getAttribute('aria-label')));
  ok(qs.length === 4 && /top left/.test(qs[0]) && /bottom left/.test(qs[3]), `4 corners: ${qs.length}`);
  const hb = await page.$eval('[data-handle="quad"][data-c="1"]', (h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const z = (await CV.state(page)).z;
  await page.mouse.move(hb[0], hb[1]); await page.mouse.down();
  await page.mouse.move(hb[0] + 15, hb[1] + 10, { steps: 4 }); await page.mouse.move(hb[0] + 30, hb[1] - 20, { steps: 4 });
  await page.mouse.up();
  l = await title();
  ok(Math.abs(l.dist.q[1][0] - 30 / z) < 1.5 && Math.abs(l.dist.q[1][1] + 20 / z) < 1.5, `drag the top right corner: q ${l.dist.q[1].map((n) => n.toFixed(1))}`);
  ok(await CV.has(page, '[data-fxpop]'), 'the popover stays open while a corner is dragged');
  await page.focus('[data-handle="quad"][data-c="3"]');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowDown');
  l = await title();
  ok(l.dist.q[3][0] === -1 && l.dist.q[3][1] === 10, `the keyboard moves a corner (${l.dist.q[3]})`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.handle === 'quad'), 'focus stays on the corner');
  await page.click('[data-fx="quad-reset"]');
  ok(JSON.stringify((await title()).dist.q) === '[[0,0],[0,0],[0,0],[0,0]]', 'Reset corners');

  /* Cancel: { fx, curve, dist } from when the popover opened. */
  await page.click('[data-fx="cancel"]');
  l = await title();
  ok(!(await CV.has(page, '[data-fxpop]')), 'Cancel closes');
  ok(JSON.stringify(l.fx) === JSON.stringify(t0.fx) && l.curve === t0.curve && JSON.stringify(l.dist) === JSON.stringify(t0.dist), 'Cancel restores the effects, curve and distortion');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'fx'), 'focus back on Effects');

  /* OK keeps; × keeps; Escape keeps. Undo goes back one change at a time. */
  await page.click('[data-k="fx"]');
  await page.click('[data-fx-style="glow"]');
  await page.click('[data-fx="ok"]:not(.cv-x)');
  ok((await title()).fx.style === 'glow' && !(await CV.has(page, '[data-fxpop]')), 'OK keeps Glow');
  ok(await page.$eval('[data-k="fx"]', (b) => b.hasAttribute('data-fx-on')), 'Effects shows an effect is on');
  await page.click('[data-k="fx"]');
  await page.click('[data-fx-style="outline"]');
  await page.click('.cv-x[data-fx="ok"]');
  ok((await title()).fx.style === 'outline', '× keeps Outline');
  await page.waitForTimeout(600);   // undo joins changes less than 500 ms apart (the design's window)
  await page.click('[data-k="fx"]');
  await page.click('[data-fx-style="3d"]');
  await page.keyboard.press('Escape');
  ok((await title()).fx.style === '3d' && !(await CV.has(page, '[data-fxpop]')), 'Escape closes and keeps 3D');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'fx'), 'Escape: focus back on Effects');
  await page.click('[data-k="undo"]');
  ok((await title()).fx.style === 'outline', 'Undo: Outline again');
  await page.click('[data-k="redo"]');

  /* A slider drag is one undo step. */
  await page.click('[data-k="fx"]');
  for (const v of [3, 4, 5, 6]) await page.$eval('[data-fx-k="depth"]', (r, v) => { r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await page.waitForTimeout(50);
  await page.keyboard.press('Escape');
  ok((await title()).fx.depth === 6, 'Depth 6');
  await page.click('[data-k="undo"]');
  ok((await title()).fx.depth === t0.fx.depth, `one Undo takes the whole drag back (${(await title()).fx.depth})`);
  await page.click('[data-k="redo"]');

  /* A picture effect on screen: glow paints outside the letters; saved. */
  await page.click('[data-k="fx"]');
  await page.click('[data-fx-style="glow"]');
  await page.$eval('[data-fx-k="blur"]', (r) => { r.value = 20; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.keyboard.press('Escape');
  await CV.settled(page, 'saved');
  const saved = CV.lastSave();
  const sl = saved.body.layers.find((x) => x.src === 'title');
  ok(sl.fx.style === 'glow' && sl.fx.blur === 20 && sl.fx.color === '#F2C14E', 'the effect is saved');

  /* A small window: the popover stays inside it and scrolls; drawing it again keeps the scroll. */
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(200);
  await page.click('[data-k="fx"]');
  await page.check('[data-fx-dist]');
  const box = await page.$eval('[data-fxpop]', (p) => { const r = p.getBoundingClientRect(); return [r.bottom, innerHeight, p.scrollHeight > p.clientHeight]; });
  ok(box[0] <= box[1] && box[2], `1024 × 700: the popover ends inside the window (${Math.round(box[0])} ≤ ${box[1]}) and scrolls`);
  await page.$eval('[data-fxpop]', (p) => { p.scrollTop = p.scrollHeight; });
  const top0 = await page.$eval('[data-fxpop]', (p) => p.scrollTop);
  await page.$eval('input[type="range"][data-fx-num="top"]', (r) => { r.value = 12; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.check('input[data-fx-mode][value="free"]');
  const top1 = await page.$eval('[data-fxpop]', (p) => p.scrollTop);
  ok(top0 > 0 && Math.abs(top1 - top0) < 60, `drawn again, it keeps its scroll (${top0} → ${top1})`);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
