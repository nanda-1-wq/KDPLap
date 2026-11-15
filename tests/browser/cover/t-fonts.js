// E16 Part 4: the font list (design 59, plan §3, D5): 300 families, the design's 20 first, groups, search,
// names from the sprite, a font loads on pick (Loading…), real weights only, a font that cannot load.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  await page.click('[data-k="font"]');
  await page.waitForSelector('.cv-pop-fonts');
  const DESIGN20 = ['Source Serif 4', 'EB Garamond', 'Lora', 'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Roboto Slab', 'IBM Plex Sans', 'Inter', 'Montserrat', 'Poppins', 'Raleway', 'Oswald', 'Bebas Neue', 'Abril Fatface', 'Anton', 'Pacifico', 'Dancing Script', 'Great Vibes', 'Space Mono'];
  const names = () => page.$$eval('[data-font]', (a) => a.map((b) => b.dataset.font));
  let list = await names();
  ok(list.length === 300, `All: 300 families (${list.length})`);
  ok(list.slice(0, 20).join('|') === DESIGN20.join('|'), 'the design\'s 20 come first, in the design\'s order');
  ok(new Set(list).size === 300, 'no family twice');
  ok(await page.$eval('[data-font-q]', (i) => i.placeholder === 'Search 300 free fonts' && document.activeElement === i), 'the search box: "Search 300 free fonts", focused');
  ok((await CV.all(page, '.cv-chip')).join() === 'All,Serif,Sans,Display,Script,Mono', 'groups: All, Serif, Sans, Display, Script, Mono');
  ok(await page.$eval('[data-font="Source Serif 4"]', (b) => b.classList.contains('is-on') && b.getAttribute('aria-pressed') === 'true'), 'the layer\'s font is marked');
  ok(/Free for commercial use \(OFL or Apache\)/.test(await CV.txt(page, '.cv-pop-fonts')), 'the licence note');
  // names come from the sprite: row = the catalog row, 28 px
  const sprite = await page.evaluate(() => {
    const out = [];
    for (const f of ['Roboto', 'Lora', 'Anton', 'Space Mono']) {
      const el = document.querySelector(`[data-font="${f}"] .cv-font-name`), cs = getComputedStyle(el);
      const row = kdpCover.fontCatalog.findIndex((r) => r[0] === f);
      out.push([f, cs.backgroundImage.includes('img/cover-fonts.png'), cs.backgroundPositionY, row, el.parentElement.querySelector('.sr-only').textContent]);
    }
    return out;
  });
  for (const [f, img, pos, row, sr] of sprite) ok(img && pos === `${-row * 28}px` && sr === f, `${f}: sprite row ${row} (${pos}), its name for screen readers`);
  ok(st.cdn.length === 3, `the open list loads no font files (${st.cdn.length}: the three in use)`);
  let total = 0;
  for (const c of ['Serif', 'Sans', 'Display', 'Script', 'Mono']) {
    await page.click(`[data-cat="${c}"]`);
    const n = (await names()).length;
    total += n;
    const groups = await page.$$eval('.cv-font-cat', (a) => [...new Set(a.map((e) => e.textContent))]);
    ok(groups.join() === c && n > 0, `${c}: ${n}, all ${c}`);
  }
  ok(total === 300, `the groups add up to 300 (${total})`);
  await page.click('[data-cat="All"]');
  await page.fill('[data-font-q]', 'garamond');
  list = await names();
  ok(list.includes('EB Garamond') && list.every((f) => /garamond/i.test(f)), `search "garamond": ${list.join(', ')}`);
  ok(await page.evaluate(() => document.activeElement.matches('[data-font-q]')), 'the search box keeps focus while typing');
  await page.fill('[data-font-q]', 'zzqx');
  ok(/No font matches "zzqx"/.test(await CV.txt(page, '.cv-pop-fonts')), 'no match: the words say so');
  await page.fill('[data-font-q]', 'lora');

  /* Pick Lora: Loading Lora…, the file is fetched once, then the layer draws in it; Bold stays Bold. */
  globalThis.__modes.slowFont = true;
  await page.click('[data-font="Lora"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.src === 'title').font === 'Lora', null, { timeout: 10000 });
  let t = await CV.layer(page, 'title');
  ok(t.weight === 700, 'Lora Bold (the family has 700)');
  ok(st.cdn.some((f) => /lora@.*\/700Bold\/Lora_700Bold\.ttf$/.test(f)), 'the Lora Bold file came from the CDN (cache)');
  ok(await page.evaluate(() => { const l = window.kdpBookSteps[9]._debug().cover.layers.find((x) => x.src === 'title'); return kdpCover.fonts.loaded(kdpCover.fonts.face(l.font, l.weight)); }), 'the face is loaded before the layer changes');
  const fb = await page.$eval('[data-k="font"]', (b) => [b.innerText.trim(), b.style.fontFamily]);
  ok(/Lora ▾/.test(fb[0]) && /cv-\d+-700/.test(fb[1]), `the font button shows Lora in its own face (${fb})`);
  ok(!(await page.$('.cv-status')), 'Loading… is gone once it is in');

  /* Weights: only the files the family has (D5). Bebas Neue and Anton have 400 only. */
  let opts = await page.$$eval('[data-k="weight"] option', (o) => o.map((x) => x.value + ':' + x.textContent));
  ok(opts.join() === '400:Regular,600:Semibold,700:Bold', `Lora weights: ${opts}`);
  await page.selectOption('[data-k="weight"]', '400');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.src === 'title').weight === 400, null, { timeout: 10000 });
  ok(true, 'Weight Regular: 400');
  if (!(await page.$('.cv-pop-fonts'))) await page.click('[data-k="font"]');
  await page.fill('[data-font-q]', 'anton');
  await page.click('[data-font="Anton"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.src === 'title').font === 'Anton', null, { timeout: 10000 });
  t = await CV.layer(page, 'title');
  opts = await page.$$eval('[data-k="weight"] option', (o) => o.map((x) => x.value));
  ok(t.weight === 400 && opts.join() === '400', `Anton: one weight, Regular (${opts})`);
  const fams = await page.evaluate(() => kdpCover.fonts.families().filter((f) => !f.weights.includes(700)).length);
  ok(fams > 0, `${fams} families have no Bold file, so they offer no Bold`);

  /* A font that cannot load: the words say so, the layer keeps its font. */
  globalThis.__modes.fontsDown = true;
  if (!(await page.$('.cv-pop-fonts'))) await page.click('[data-k="font"]');
  await page.fill('[data-font-q]', 'pacifico');
  await page.click('[data-font="Pacifico"]');
  await page.waitForSelector('.cv-status', { timeout: 5000 });
  ok(/Loading Pacifico…/.test(await CV.txt(page, '.cv-status')), 'Loading Pacifico…');
  await page.waitForSelector('.cv-status.is-error', { timeout: 40000 });
  ok((await CV.txt(page, '.cv-status.is-error')) === 'Could not load Pacifico. Check your connection and try again.', 'the error words, role alert');
  ok((await CV.layer(page, 'title')).font === 'Anton', 'the layer keeps Anton');
  globalThis.__modes.fontsDown = false;
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
