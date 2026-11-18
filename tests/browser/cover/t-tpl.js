// E16.1 item 1 (design 75, owner Nov 18): the KDP template layer is drawn ABOVE the layers, lines only.
// No pink bleed band, no white live area (they hid the background); the trim line, the 2 folds, the dotted
// live-area line and the see-through barcode box with "Barcode area 2.0 × 1.2 in" are the only marks. No other
// words on the cover (no size block, no line notes, no cover or spine labels): the notes are in the "KDP
// template layer" popover, under "Hide template layer". Clicks still reach the layers through it; it follows
// zoom and pan; Transparency and Hide work; it is never painted on the layer canvas.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await page.evaluate(async () => {
    const E = window.kdpBookSteps[9]._debug();
    await E.applyLayout('picband');
    E.cover = Object.assign({}, E.cover, { bg: '#F4C6D0' });
    E.view_.sync();
  });
  await page.waitForTimeout(200);

  /* Order: paper, layer canvas, template, overlay. */
  const order = await page.evaluate(() => [...document.querySelector('[data-ws]').children].map((c) => c.matches('[data-back]') ? 'paper' : c.matches('[data-canvas]') ? 'canvas' : c.matches('[data-tplboard]') ? 'tpl' : c.matches('[data-front]') ? 'front' : c.className.split(' ')[0]));
  ok(order.indexOf('paper') < order.indexOf('canvas') && order.indexOf('canvas') < order.indexOf('tpl') && order.indexOf('tpl') < order.indexOf('front'), `paper → layers → template → overlay (${order.join(', ')})`);
  ok(await page.$eval('[data-ws] [data-back] [data-tpl]', () => true).catch(() => false) === false, 'the template is no longer under the layers');
  ok(await page.$eval('[data-tplboard]', (b) => getComputedStyle(b).pointerEvents === 'none' && getComputedStyle(b.firstElementChild).pointerEvents === 'none'), 'the template takes no clicks');

  /* Lines only: no fill but the barcode wash; no pink anywhere. */
  const fills = await page.$$eval('[data-tpl] > div', (a) => a.map((d) => [d.className, getComputedStyle(d).backgroundColor]));
  const filled = fills.filter(([, c]) => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
  ok(filled.length === 1 && filled[0][0] === 'cv-tpl-barcode', `only the barcode box has a fill (${JSON.stringify(filled)})`);
  const alpha = Number((filled[0][1].match(/rgba\([^)]*,\s*([\d.]+)\)/) || [])[1]);
  ok(alpha > 0 && alpha < 1, `the barcode fill is see-through (alpha ${alpha})`);
  ok(fills.every(([c]) => !/bleed/.test(c)) && !(await page.$('.cv-tpl-bleed')), 'no pink bleed band');
  const kinds = fills.map(([c]) => c).sort().join(',');
  ok(kinds === 'cv-tpl-barcode,cv-tpl-fold,cv-tpl-fold,cv-tpl-live,cv-tpl-live,cv-tpl-trim', `the marks: trim, 2 folds, 2 live areas, barcode (${kinds})`);
  ok(await page.$$eval('.cv-tpl-live', (a) => a.every((d) => getComputedStyle(d).borderTopStyle === 'dotted')), 'the live area is a dotted line');
  ok((await CV.txt(page, '[data-tpl]')) === 'Barcode area 2.0 × 1.2 in', 'no words on the cover but the barcode label');

  /* The paper shows through: a pixel in the bleed and one in the back live area are the background color. */
  const shotPx = async (bx, by) => {
    const [x, y] = await CV.pt(page, bx, by);
    const buf = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
    return page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); }, buf.toString('base64'));
  };
  const G = await page.evaluate(() => kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt));
  const near = (p, q) => p.every((v, i) => Math.abs(v - q[i]) <= 3);
  const pink = [0xF4, 0xC6, 0xD0];
  const pBleed = await shotPx(G.b / 2, G.H / 2), pLive = await shotPx(G.liveBack.x0 + 20, G.H - G.b - 140);
  ok(near(pBleed, pink), `the bleed shows the background (${pBleed})`);
  ok(near(pLive, pink), `the back live area shows the background, no white (${pLive})`);

  /* Clicks reach the layers through the template: the title, then the barcode area over a picture-less back. */
  const [tx, ty] = await CV.center(page, 'title');
  await page.mouse.click(tx, ty);
  const sel = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.id === E.sel); return l && l.src; });
  ok(sel === 'title', `a click on the title selects it through the template (${sel})`);

  /* It follows zoom and pan with the paper. */
  await page.click('[data-k="zin"]'); await page.waitForTimeout(100);
  const same = await page.evaluate(() => document.querySelector('[data-tplboard]').style.transform === document.querySelector('[data-ws] [data-back]').style.transform);
  ok(same, 'zoom: the template board moves with the paper');
  await page.click('[data-k="fit"]').catch(() => {});

  /* The popover: notes under Hide; Transparency and Hide still work. */
  await page.click('[data-k="tpl"]');
  await page.waitForSelector('[data-tplpop]:not([hidden])');
  const pop = await page.evaluate(() => {
    const p = document.querySelector('[data-tplpop]');
    const hide = p.querySelector('[data-tpl-hide]').closest('label'), list = p.querySelector('.cv-tplnotes');
    return { after: !!(hide.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING), notes: [...list.querySelectorAll('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()), px: Math.min(...[...list.querySelectorAll('li')].map((li) => parseFloat(getComputedStyle(li).fontSize))), fits: p.getBoundingClientRect().bottom <= innerHeight };
  });
  ok(pop.after, 'the notes come under "Hide template layer"');
  ok(pop.notes.length === 5 && pop.notes[0].startsWith('Solid black line = trim') && pop.notes[1].startsWith('Outside the black line = bleed') && pop.notes[2].startsWith('Blue dashed line = spine fold') && pop.notes[3].startsWith('Green dotted line = live area') && pop.notes[4].startsWith('This layer never prints.'), `5 notes in order: ${JSON.stringify(pop.notes)}`);
  ok(pop.px >= 12, `the notes are UI text, 12 px or more (${pop.px})`);
  ok(pop.fits, 'the popover fits the window at 1440 × 900');
  await page.fill('[data-tpl-op]', '30'); await page.dispatchEvent('[data-tpl-op]', 'input');
  ok(await page.$eval('[data-tpl]', (t) => t.style.opacity === '0.3'), 'Transparency 30: the template at 0.3');
  await page.check('[data-tpl-hide]');
  ok(await page.$eval('[data-tpl]', (t) => t.hidden), 'Hide: the template is gone');
  await page.uncheck('[data-tpl-hide]');
  await page.fill('[data-tpl-op]', '100'); await page.dispatchEvent('[data-tpl-op]', 'input');
  await page.keyboard.press('Escape');

  /* Never on the layer canvas: with every layer hidden, the canvas is empty where the template draws. */
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.commitLayers(E.cover.layers.map((l) => Object.assign({}, l, { hidden: true }))); });
  await page.waitForTimeout(150);
  const trimPx = await CV.px(page, ...(await CV.pt(page, G.b + 0.5, G.H / 2)));
  const barPx = await CV.px(page, ...(await CV.pt(page, G.barcode.x + 20, G.barcode.y + 20)));
  ok(trimPx[3] === 0 && barPx[3] === 0, `the layer canvas has no template marks (${trimPx} / ${barPx})`);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  void st;
  return log.join('\n');
};
