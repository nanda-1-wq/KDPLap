// E16 Part 6: the picture bar (design 62): Fill (front, back, whole, into the bleed), Adjust (brightness, contrast,
// saturation, blur, darken, black and white, sepia, Reset), Border (pt, its color from the shared picker, follows
// the mask), Mask (none, rounded, circle, arch), Opacity, flip left to right and top to bottom, More (rotation,
// exclude from export), Arrange, duplicate, lock, delete. Each change shows on the cover (pixels of our renderer)
// and is one undo step (a slider drag too).
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await PIC.ready(page);
  await PIC.make(page, 'a', { w: 3000, h: 2000, type: 'image/jpeg', name: 'desk.jpg' });
  await PIC.pick(page, 'a'); await PIC.idle(page); await PIC.drawn(page);
  const id = (await PIC.layers(page)).pop().id;
  const L = () => page.evaluate((id) => window.kdpBookSteps[9]._debug().cover.layers.find((x) => x.id === id), id);
  const set = (p) => page.evaluate(([id, p]) => window.kdpBookSteps[9]._debug().setLayer(id, p), [id, p]);
  const g = await page.evaluate(() => kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt));
  // On the back cover, away from the text: 300 × 200 at (40, 380).
  await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(), l = E.cover.layers.find((x) => x.id === id); E.setLayer(id, Object.assign({ x: 40, y: 380, w: 300, h: 200 }, kdpCover.model.coverFit(l, { w: 300, h: 200 }))); E.select(id); }, id);
  await page.click('[data-tool="text"]');
  const at = async (fx, fy) => { await page.waitForTimeout(120); const r = await page.$eval(`[data-hit="${id}"]`, (n) => { const b = n.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; }); return CV.px(page, r[0] + r[2] * fx, r[1] + r[3] * fy); };

  /* The bar: the design's order. */
  const bar = await page.$$eval('[data-textbar] > button, [data-textbar] > span', (a) => a.map((n) => n.dataset.k || n.className));
  ok(bar.join(' ').startsWith('replace crop ifill iadjust iborder imask op flipH cv-dpi'), `bar order: ${bar.slice(0, 9).join(' ')}`);
  ok(bar.slice(-6).join(' ') === 'cv-grow arr dup lock more del', `then: ${bar.slice(-6).join(' ')}`);
  const red0 = await at(0.04, 0.05);
  ok(red0[0] > 150 && red0[1] < 90, `the picture's red corner mark is top left (${red0})`);

  /* Flip left to right, then top to bottom (More). */
  await page.click('[data-k="flipH"]');
  ok((await L()).flipH && await page.$eval('[data-k="flipH"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Flip left to right: on, pressed');
  let p = await at(0.96, 0.05);
  ok(p[0] > 150 && p[1] < 90, `the red mark is now top right (${p})`);
  await page.click('[data-k="flipH"]');
  await page.click('[data-k="more"]');
  ok((await CV.txt(page, '.cv-pop-more')).includes('Rotation') && /Flip top to bottom/.test(await CV.txt(page, '.cv-pop-more')) && /Exclude from export/.test(await CV.txt(page, '.cv-pop-more')), 'More: Rotation, Flip top to bottom, Exclude from export (design 62)');
  await page.click('[data-k="flipV"]');
  p = await at(0.04, 0.95);
  ok((await L()).flipV && p[0] > 150 && p[1] < 90, `Flip top to bottom: the red mark is bottom left (${p})`);
  await page.click('[data-k="flipV"]');
  await page.fill('[data-irot]', '30'); await page.dispatchEvent('[data-irot]', 'change');
  ok((await L()).rot === 30, 'Rotation 30°');
  await page.click('[data-k="rot-reset"]');
  ok((await L()).rot === 0, 'Reset rotation');
  await page.click('[data-k="noExport"]');
  ok((await L()).noExport === true, 'Exclude from export: on');
  const pr = await page.evaluate(() => kdpCover.flatten.printable(window.kdpBookSteps[9]._debug().cover.layers).some((l) => l.type === 'image'));
  ok(!pr, 'an excluded picture is not in the printable layers');
  await page.click('[data-k="noExport"]');
  await page.keyboard.press('Escape');

  /* Adjust: the design's 5 sliders and 3 looks; a drag is one undo step; Reset. */
  await page.click('[data-k="iadjust"]');
  const rows = await page.$$eval('.cv-pop-iadjust .cv-fx-row', (a) => a.map((r) => { const i = r.querySelector('input'); return [r.firstElementChild.textContent, i.min, i.max, i.step, i.value]; }));
  ok(JSON.stringify(rows) === JSON.stringify([['Brightness', '50', '150', '1', '100'], ['Contrast', '50', '150', '1', '100'], ['Saturation', '0', '200', '1', '100'], ['Blur', '0', '10', '1', '0'], ['Darken', '0', '60', '5', '0']]), `sliders: ${rows.map((r) => r.slice(0, 3).join(' ')).join(', ')}`);
  ok((await page.$$eval('.cv-pop-iadjust [data-look]', (a) => a.map((b) => b.textContent))).join('|') === 'Normal|Black and white|Sepia', 'looks: Normal, Black and white, Sepia');
  ok(/Changes are baked into the picture when you export\./.test(await CV.txt(page, '.cv-pop-iadjust')), 'the design\'s note');
  const sky0 = await at(0.5, 0.1);
  await page.waitForTimeout(600);
  const slide = async (k, values) => { for (const v of values) await page.$eval(`[data-ik="${k}"]`, (i, v) => { i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.$eval(`[data-ik="${k}"]`, (i) => i.dispatchEvent(new Event('change', { bubbles: true }))); };
  const depth = () => page.evaluate(() => window.kdpBookSteps[9]._debug().hist.size().past);
  const d0 = await depth();
  await slide('bri', [110, 120, 130, 140]);
  ok((await L()).bri === 140 && (await CV.txt(page, '[data-iv="bri"]')) === '140', 'Brightness 140, the number follows');
  const sky1 = await at(0.5, 0.1);
  ok(sky1[0] + sky1[1] + sky1[2] > sky0[0] + sky0[1] + sky0[2] + 30, `brighter on the cover (${sky0} → ${sky1})`);
  ok((await depth()) === d0 + 1, 'a slider drag is one undo step');
  await page.waitForTimeout(600);
  await slide('dark', [30]);
  ok((await L()).dark === 30 && (await CV.txt(page, '[data-iv="dark"]')) === '30%', 'Darken 30 %');
  await page.click('[data-look="bw"]');
  let gray = await at(0.5, 0.1);
  ok((await L()).look === 'bw' && Math.abs(gray[0] - gray[1]) < 4 && Math.abs(gray[1] - gray[2]) < 4, `Black and white: gray pixels (${gray})`);
  await page.click('[data-look="sepia"]');
  const sep = await at(0.5, 0.1);
  ok((await L()).look === 'sepia' && sep[0] > sep[2] + 10, `Sepia: warm pixels (${sep})`);
  await slide('sat', [0]); await slide('con', [70]); await slide('blur', [4]);
  const l1 = await L();
  ok(l1.sat === 0 && l1.con === 70 && l1.blur === 4, 'Saturation 0, Contrast 70, Blur 4');
  await page.click('[data-k="adj-reset"]');
  const l2 = await L();
  ok(l2.bri === 100 && l2.con === 100 && l2.sat === 100 && l2.blur === 0 && l2.dark === 0 && l2.look === 'none', 'Reset: back to 100, 100, 100, 0, 0, Normal');
  const back = await at(0.5, 0.1);
  ok(Math.abs(back[0] - sky0[0]) < 3 && Math.abs(back[2] - sky0[2]) < 3, `the picture as before (${back})`);
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'iadjust'), 'Escape closes Adjust; focus back on Adjust');

  /* Border: width in pt and its color (the shared picker); it follows the mask. */
  await page.click('[data-k="iborder"]');
  ok(/The border follows the mask shape\./.test(await CV.txt(page, '.cv-pop-iborder')) && !!(await page.$('.cv-pop-iborder [data-picker]')), 'Border: width, the color picker, the design\'s note');
  await slide('bw', [8]);
  ok((await L()).bw === 8 && (await CV.txt(page, '[data-iv="bw"]')) === '8 pt', 'Width 8 pt');
  await page.fill('.cv-pop-iborder [data-pk-hex]', '#7A2E2E').catch(() => {});
  await page.dispatchEvent('.cv-pop-iborder [data-pk-hex]', 'change').catch(() => {});
  await page.waitForTimeout(80);
  ok((await L()).bcolor === '#7A2E2E', `the border color from the picker (${(await L()).bcolor})`);
  const edge = await at(0.004, 0.5);
  ok(edge[0] > 100 && edge[0] < 140 && edge[1] < 60, `the border on the cover (${edge})`);
  await page.keyboard.press('Escape');

  /* Mask: none, rounded, circle, arch; the border follows. */
  await page.click('[data-k="imask"]');
  ok((await page.$$eval('[data-mask]', (a) => a.map((b) => b.textContent.trim()))).join('|') === 'None|Rounded|Circle|Arch' && /Mask shape/.test(await CV.txt(page, '.cv-pop-imask')), 'Mask: None, Rounded, Circle, Arch');
  await set({ bw: 0 });
  const corner = async () => at(0.02, 0.03);
  const cNone = await corner();
  await page.click('[data-mask="circle"]');
  const cCircle = await corner();
  ok((await L()).mask === 'circle' && cNone[3] > 200 && cCircle.join() !== cNone.join(), `Circle: the corner is cut (${cNone} → ${cCircle})`);
  const mid = await at(0.5, 0.5);
  ok(mid[3] === 255, 'the middle still shows the picture');
  await page.click('[data-mask="arch"]');
  const aTop = await at(0.02, 0.03), aBot = await at(0.02, 0.97);
  ok((await L()).mask === 'arch' && aTop.join() !== cNone.join() && aBot[3] === 255 && aBot[0] + aBot[1] + aBot[2] < 600, `Arch: top corners cut, bottom corners kept (${aTop} / ${aBot})`);
  await set({ bw: 6, bcolor: '#1C1C1A' });
  const ring = await at(0.5, 0.01);
  ok(ring[0] < 60 && ring[1] < 60, `the border follows the arch (top middle is border: ${ring})`);
  await page.click('[data-mask="rounded"]');
  ok((await L()).mask === 'rounded', 'Rounded');
  await page.click('[data-mask="none"]');
  ok(await page.$eval('[data-mask="none"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'the chosen mask is pressed');
  await page.keyboard.press('Escape');
  await set({ bw: 0 });

  /* Opacity. */
  await page.click('[data-k="op"]');
  ok(/KDP gets a flat file\./.test(await CV.txt(page, '.cv-pop-iop')), 'Opacity: the design\'s note');
  await slide('op', [60]);
  ok((await L()).op === 60 && (await CV.txt(page, '[data-k="op"]')) === 'Opacity 60%', 'Opacity 60 %; the bar button says so');
  const see = await at(0.5, 0.5);
  ok(see[3] < 200 && see[3] > 100, `see-through on the cover (alpha ${see[3]})`);
  await page.keyboard.press('Escape');
  await set({ op: 100 });

  /* Fill: front, back, whole cover (into the bleed, unturned, the picture covering it). */
  await set({ rot: 20 });
  await page.click('[data-k="ifill"]');
  ok((await page.$$eval('[data-ifill]', (a) => a.map((b) => b.textContent))).join('|') === 'Fill front cover|Fill back cover|Fill whole cover', 'Fill: front, back, whole cover');
  ok(/Fill reaches into the bleed, so no white edge shows after the cut\./.test(await CV.txt(page, '.cv-pop-ifill')), 'the design\'s note');
  await page.click('[data-ifill="front"]');
  let f = await L();
  ok(f.x === g.foldR && f.y === 0 && Math.abs(f.w - (g.W - g.foldR)) < 1e-6 && f.h === g.H && f.rot === 0, `Fill front: x ${f.x.toFixed(2)} to the outer bleed, full height, unturned`);
  ok(Math.abs(Math.max(f.w / f.pw, f.h / f.ph) - 1) < 1e-9 && f.pw >= f.w - 1e-9 && f.ph >= f.h - 1e-9, 'the picture covers the box');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'ifill'), 'the menu closes; focus back on Fill');
  await page.click('[data-k="ifill"]'); await page.click('[data-ifill="back"]');
  f = await L();
  ok(f.x === 0 && Math.abs(f.w - g.foldL) < 1e-6 && f.h === g.H, 'Fill back: from the outer bleed to the spine fold');
  await page.click('[data-k="ifill"]'); await page.click('[data-ifill="cover"]');
  f = await L();
  ok(f.x === 0 && f.y === 0 && f.w === g.W && f.h === g.H, 'Fill whole cover: the full wrap with bleed');
  const dpiWhole = Math.round(f.natW * 70 / f.pw);
  ok((await CV.txt(page, '[data-dpi]')).startsWith(`${dpiWhole} DPI`) && /may print soft/.test(await CV.txt(page, '[data-dpi]')), `a 3,000 px picture on the whole wrap: ${await CV.txt(page, '[data-dpi]')}`);
  const c10 = await page.evaluate((id) => kdpCover.checks.run(window.kdpBookSteps[9]._debug().cover).find((c) => c.id === id && c.code === 'C10'), id);
  ok(c10 && c10.sev === 'warn', 'and C10 says check this (200 to 299 DPI)');

  /* Arrange, duplicate, lock, delete. */
  await page.click('[data-k="arr"]');
  await page.click('[data-iarr="back"]');
  ok((await CV.state(page)).layers[0].id === id, 'Send to back: the picture is first');
  await page.click('[data-k="dup"]');
  const s2 = await CV.state(page);
  const dup = s2.layers.find((l) => l.id === s2.sel);
  ok(dup && dup.id !== id && dup.asset === (await L()).asset && dup.x === 14, 'Duplicate: a copy of the same picture, 14 px over, selected');
  ok(await page.evaluate((d) => kdpCover.images.state(window.kdpBookSteps[9]._debug(), d), dup) === 'ready', 'the copy draws at once (same picture)');
  await page.click('[data-k="lock"]');
  ok((await CV.state(page)).layers.find((l) => l.id === dup.id).lock, 'Lock');
  await page.click('[data-k="lock"]');
  await page.click('[data-k="del"]');
  ok(!(await CV.state(page)).layers.some((l) => l.id === dup.id), 'Delete');
  await CV.settled(page, 'saved');
  const saved = CV.lastSave().body.layers.find((l) => l.id === id);
  ok(saved && saved.w === g.W && saved.asset, 'autosave holds the picture as on screen');
  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0 && CV.mockErrors().length === 0, 'no network, no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
