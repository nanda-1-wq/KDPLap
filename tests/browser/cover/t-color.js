// E16 Part 4: the color picker (design 60): text color and the background color. Square + hue, hex,
// eyedropper, RGB and CMYK read-out, 8 presets, the last 5 (Recent).
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  await page.click('[data-k="color"]');
  await page.waitForSelector('.cv-pop-color');
  const pop = '.cv-pop-color';
  ok((await CV.txt(page, `${pop} h2`)) === 'Text color', 'Text color');
  ok(await page.$eval('[data-k="color"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'the color button: expanded');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-pk-sv]')), 'focus goes to the square');
  ok((await page.$eval('[data-pk-hex]', (i) => i.value)) === '#FFFFFF', 'hex: #FFFFFF');
  ok((await CV.txt(page, `${pop} .cv-readout`)) === 'RGB 255, 255, 255 CMYK 0 0 0 0', 'RGB 255, 255, 255 · CMYK 0 0 0 0');
  ok(/CMYK is shown for reference\. Your files stay sRGB, the color space KDP accepted\./.test(await CV.txt(page, pop)), 'the sRGB note');
  const sws = await page.$$eval(`${pop} .cv-sws [data-hex]`, (a) => a.map((b) => b.dataset.hex));
  ok(sws.join() === '#1C1C1A,#FFFFFF,#1F3A5F,#2F4A3A,#7A2E2E,#F2C14E,#E07A5F,#F2EDE4', 'the 8 presets of the design');
  ok(await page.$eval(`${pop} [data-hex="#FFFFFF"]`, (b) => b.classList.contains('is-on') && b.getAttribute('aria-pressed') === 'true'), 'the current color is marked');
  ok(!(await page.$(`${pop} .cv-recent`)), 'no Recent row before a pick');

  /* Presets: the layer, the button, Recent (newest first, 5 at most). */
  await page.click(`${pop} [data-hex="#F2C14E"]`);
  let t = await CV.layer(page, 'title');
  ok(t.color === '#F2C14E', 'a preset sets the text color');
  ok(/#F2C14E/.test(await CV.txt(page, '[data-k="color"]')), 'the bar shows #F2C14E');
  for (const h of ['#1F3A5F', '#2F4A3A', '#7A2E2E', '#E07A5F', '#F2EDE4']) await page.click(`${pop} .cv-sws [data-hex="${h}"]`);
  const rec = await page.$$eval(`${pop} .cv-recent [data-hex]`, (a) => a.map((b) => b.dataset.hex));
  ok(rec.join() === '#F2EDE4,#E07A5F,#7A2E2E,#2F4A3A,#1F3A5F', `Recent: the last 5, newest first (${rec})`);

  /* Hex: typed (3 or 6 digits); a bad one is marked and changes nothing. */
  await page.fill('[data-pk-hex]', '#2e6a5f');
  await page.press('[data-pk-hex]', 'Enter');
  ok((await CV.layer(page, 'title')).color === '#2E6A5F', 'hex typed: #2E6A5F');
  await page.fill('[data-pk-hex]', 'abc');
  await page.press('[data-pk-hex]', 'Enter');
  ok((await CV.layer(page, 'title')).color === '#AABBCC', 'three digits: #AABBCC');
  await page.fill('[data-pk-hex]', 'nope');
  await page.press('[data-pk-hex]', 'Enter');
  ok((await CV.layer(page, 'title')).color === '#AABBCC' && await page.$eval('[data-pk-hex]', (i) => i.getAttribute('aria-invalid') === 'true'), 'a bad hex: marked, nothing changes');

  /* The square: a drag picks saturation and brightness; the popover stays (drawn in place). */
  await page.click(`${pop} .cv-sws [data-hex="#E07A5F"]`);
  const sq = await page.$eval('[data-pk-sv]', (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  await page.mouse.move(sq[0] + sq[2] * 0.5, sq[1] + sq[3] * 0.5);
  await page.mouse.down();
  await page.mouse.move(sq[0] + sq[2] * 0.9, sq[1] + sq[3] * 0.1, { steps: 5 });
  const mid = await CV.layer(page, 'title');
  await page.mouse.move(sq[0] + sq[2] * 1.5, sq[1] - 40, { steps: 3 });
  await page.mouse.up();
  const end = await CV.layer(page, 'title');
  const hsv = await page.evaluate((h) => kdpCover.palettes.hexToHsv(h), end.color);
  ok(mid.color !== '#E07A5F' && hsv.sat > 0.99 && hsv.val > 0.99, `the drag picks, and clamps at the edge (${end.color})`);
  ok(!!(await page.$('.cv-pop-color')), 'the popover stays open through the drag');
  ok((await page.$eval('[data-pk-hex]', (i) => i.value)) === end.color, 'the hex follows the drag');
  // keyboard on the square: Down lowers brightness by 5 %
  await page.focus('[data-pk-sv]');
  await page.keyboard.press('ArrowDown');
  const kb = await page.evaluate((h) => kdpCover.palettes.hexToHsv(h), (await CV.layer(page, 'title')).color);
  ok(Math.abs(kb.val - 0.95) < 0.01, `ArrowDown on the square: brightness 95 % (${kb.val.toFixed(2)})`);
  // hue
  await page.fill('[data-pk-hue]', '200');
  await page.dispatchEvent('[data-pk-hue]', 'input');
  const hh = await page.evaluate((h) => kdpCover.palettes.hexToHsv(h), (await CV.layer(page, 'title')).color);
  ok(Math.abs(hh.hue - 200) <= 1, `Hue 200 (${hh.hue})`);
  // eyedropper: Chrome has EyeDropper; the button is live there
  const ed = await page.evaluate(() => [!!window.EyeDropper, document.querySelector('[data-pk-drop]').getAttribute('aria-disabled')]);
  ok(ed[0] ? ed[1] === null : ed[1] === 'true', `eyedropper: ${ed[0] ? 'live (EyeDropper API)' : 'off with the reason'}`);
  ok(await page.$eval('[data-pk-drop]', (b) => b.getAttribute('aria-label') === 'Pick a color from the screen'), 'eyedropper label');
  await page.click('[data-pk-close]');
  ok(!(await page.$('.cv-pop-color')) && await page.evaluate(() => document.activeElement.dataset.k === 'color'), 'Close: the popover goes, focus on the color button');

  /* Background color (the view bar): the paper, the swatch, the save. */
  await page.click('[data-k="bg"]');
  await page.waitForSelector('.cv-pop-bg');
  ok((await CV.txt(page, '.cv-pop-bg h2')) === 'Background color', 'Background color');
  ok(/The color fills the whole wrap, bleed included\./.test(await CV.txt(page, '.cv-pop-bg')), 'the background note');
  ok((await page.$eval('.cv-pop-bg [data-pk-hex]', (i) => i.value)) === '#F2EDE4', 'it starts at the cover\'s background');
  await page.click('.cv-pop-bg .cv-sws [data-hex="#1F3A5F"]');
  ok((await CV.state(page)).bg === '#1F3A5F', 'the cover background changes');
  ok(await page.$eval('[data-paper]', (p) => getComputedStyle(p).backgroundColor === 'rgb(31, 58, 95)'), 'the paper under the template shows it');
  ok(await page.$eval('[data-k="bg"] .cv-swatch', (s) => s.style.getPropertyValue('--sw') === '#1F3A5F'), 'the Background swatch shows it');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.bg === '#1F3A5F', 'it saves');
  await page.keyboard.press('Escape');
  ok(!(await page.$('.cv-pop-bg')), 'Esc closes the background picker');
  /* 1024: the popovers stay inside the window (placed at the design's left, then kept in the bar). */
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(200);
  const inside = () => page.$eval('.cv-pop:not(.cv-tplpop)', (p) => { const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
  await page.click('[data-k="bg"]');
  ok(await inside(), '1024: the background picker is inside the window');
  await page.keyboard.press('Escape');
  [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  await page.click('[data-k="color"]');
  ok(await inside() && await page.$eval('[data-pk-close]', (b) => b.getBoundingClientRect().right <= window.innerWidth), '1024: the text color picker and its Close are inside the window');
  await page.keyboard.press('Escape');
  for (const k of ['font', 'op', 'arr']) { await page.click(`[data-k="${k}"]`); ok(await inside(), `1024: the ${k} popover is inside the window`); await page.keyboard.press('Escape'); }
  await page.setViewportSize({ width: 1440, height: 900 });
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
