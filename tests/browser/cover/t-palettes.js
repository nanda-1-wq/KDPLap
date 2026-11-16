// E16 Part 8: series colors in the Layouts panel (design 67, swapPalette): 6 palettes with 4 swatches each; a click
// maps the cover's colors (most used first) onto the palette (light colors to its light color; white and near-black
// stay); one Undo step of its own; the layout stays pressed; the same as kdpCover.palettes.swap; keyboard and Step D.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  const E = (f) => page.evaluate(f);
  await FIX.band(page);
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');

  /* The 6 tiles: name, 4 swatches in the palette's colors. */
  const pals = await page.$$eval('[data-pal]', (a) => a.map((b) => ({ name: b.getAttribute('aria-label'), title: b.title, sw: [...b.querySelectorAll('.cv-pal-sw span')].map((s) => getComputedStyle(s).backgroundColor) })));
  ok(pals.length === 6 && pals.every((p) => p.name === p.title && p.sw.length === 4), '6 palettes, each named, 4 swatches');
  ok(pals[1].name === 'Forest' && pals[1].sw.join(' ') === 'rgb(47, 74, 58) rgb(201, 162, 39) rgb(238, 242, 234) rgb(127, 168, 140)', `Forest's swatches: ${pals[1].sw.join(' ')}`);
  ok((await CV.txt(page, '.cv-pals')).replace(/\s+/g, ' ') === 'Navy and coral Forest Plum Teal Brick Charcoal', 'the names show under the swatches');

  /* Forest on Band: navy → Forest's main, the cream paper → Forest's light; white letters stay. */
  const before = await CV.state(page);
  const want = await E(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.palettes.swap(E.cover.layers, E.cover.bg, kdpCover.palettes.PALETTES[1][1]); });
  await page.click('[data-pal="1"]');
  let s = await CV.state(page);
  ok(JSON.stringify(s.layers) === JSON.stringify(want.layers) && s.bg === want.bg, 'the cover equals kdpCover.palettes.swap (the design rule)');
  ok(s.layers[0].fill === '#2F4A3A' && s.bg === '#EEF2EA', `the band ${s.layers[0].fill}, the paper ${s.bg}`);
  ok(s.layers.find((l) => l.src === 'title').color === '#FFFFFF' && s.layers.find((l) => l.src === 'blurb').color === '#3D3D39', 'white and the near-black gray stay');
  ok(s.layers.find((l) => l.src === 'subtitle').color === '#2F4A3A', 'the navy subtitle follows the band');
  ok((await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'band', 'Band stays pressed');
  ok((await page.$eval('[data-toast-host]', (h) => h.innerText.trim())) === '', 'no note (the design shows none)');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.bg === '#EEF2EA', 'saved');

  /* One Undo step, even right after (no 500 ms merge with the next change). */
  await E(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'pen'); E.setLayer(t.id, { size: 14 }); });
  await page.click('[data-k="undo"]');
  s = await CV.state(page);
  ok(s.layers.find((l) => l.src === 'pen').size === 12 && s.bg === '#EEF2EA', 'Undo after a quick change: only the change goes');
  await page.click('[data-k="undo"]');
  s = await CV.state(page);
  ok(JSON.stringify(s.layers) === JSON.stringify(before.layers) && s.bg === before.bg, 'Undo again: Band\'s own colors are back');

  /* Brick, then Teal: each maps the cover as it is. */
  await page.click('[data-pal="4"]');
  s = await CV.state(page);
  ok(s.layers[0].fill === '#7A2E2E' && s.bg === '#F7EFE6', `Brick: ${s.layers[0].fill} on ${s.bg}`);
  await page.click('[data-pal="3"]');
  s = await CV.state(page);
  ok(s.layers[0].fill === '#1D5C63' && s.bg === '#EAF4F4', `Teal after Brick: ${s.layers[0].fill} on ${s.bg}`);
  // The same palette again changes nothing (no new Undo step).
  const n = await E(() => window.kdpBookSteps[9]._debug().hist.size().past);
  await page.click('[data-pal="3"]');
  ok((await E(() => window.kdpBookSteps[9]._debug().hist.size().past)) === n, 'Teal again: nothing to change, no Undo step');

  /* An empty cover: only the background. */
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="layouts"]');
  await page.click('[data-pal="0"]');
  ok((await CV.state(page)).bg === '#FFFFFF', 'an empty white cover: white stays (it is a neutral)');

  /* Keyboard and Step D. */
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().lay.fonts === true, null, { timeout: 20000 });   // the panel is drawn again then
  await page.focus('[data-pal="2"]');
  await page.keyboard.press('Enter');
  ok((await CV.state(page)).layers[0].fill === '#3E3557', 'Enter on Plum applies it');
  const hit = await page.$$eval('[data-pal]', (a) => a.every((b) => { const r = b.getBoundingClientRect(); const af = getComputedStyle(b, '::after'); return Math.max(r.width, parseFloat(af.width)) >= 44 && Math.max(r.height, parseFloat(af.height)) >= 44; }));
  ok(hit, 'each palette has a 44 px click area');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
