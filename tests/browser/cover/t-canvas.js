// E16 Part 4: the canvas view (design 58): the KDP template layer, guides, zoom and pan, select, move with the
// front-center snap, width, rotate (45° snap), shape handles, deselect, the canvas renderer's pixels.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: null });

  /* The KDP template layer (E16.1, design 75): lines and the barcode box only, above the layers; never painted on
     the layer canvas. Its line notes are in the popover (t-tpl.js checks the rest). */
  const tpl = await page.$eval('[data-tpl]', (t) => t.innerText.replace(/\s+/g, ' ').trim());
  ok(tpl === 'Barcode area 2.0 × 1.2 in', `template: only the barcode label on the cover ("${tpl}")`);
  const pop = await page.$eval('[data-tplpop]', (t) => t.innerText.replace(/\s+/g, ' ').trim());
  for (const w of ['Solid black line = trim', 'Outside the black line = bleed', 'Blue dashed line = spine fold', 'Green dotted line = live area', 'This layer never prints.']) {
    ok(pop.includes(w), `popover note: "${w}"`);
  }
  ok(await page.$eval('[data-tpl]', (t) => t.getAttribute('aria-hidden') === 'true'), 'the template is drawing (aria-hidden)');
  const blank = await CV.px(page, ...(await CV.pt(page, 4, 4)));
  ok(blank[3] === 0, `the layer canvas has nothing in the bleed (${blank})`);
  await page.fill('[data-tpl-op]', '40');
  await page.dispatchEvent('[data-tpl-op]', 'input');
  ok(await page.$eval('[data-tpl]', (t) => t.style.opacity === '0.4'), 'Transparency 40: the template at 0.4');
  ok((await CV.txt(page, '[data-k="tpl"]')) === 'KDP template · 40%', 'the bar: KDP template · 40%');
  await page.check('[data-tpl-hide]');
  ok(await page.$eval('[data-tpl]', (t) => t.hidden) && (await CV.txt(page, '[data-k="tpl"]')) === 'KDP template · hidden', 'Hide: gone, "hidden"');
  await page.uncheck('[data-tpl-hide]');
  await page.click('[data-tpl-close]');
  ok(await page.$eval('[data-tplpop]', (p) => p.hidden), 'Close shuts the popover');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'tpl'), 'focus back on the template button');
  await page.click('[data-k="tpl"]');
  ok(await page.$eval('[data-tplpop]', (p) => !p.hidden) && await page.$eval('[data-k="tpl"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'the button opens it again (aria-expanded)');
  await page.keyboard.press('Escape');
  ok(await page.$eval('[data-tplpop]', (p) => p.hidden), 'Esc in the popover shuts it');

  /* Guide lines: 4 live-area verticals, 2 folds, 2 horizontals; off and on. */
  ok((await page.$$('.cv-gl.is-live')).length === 6 && (await page.$$('.cv-gl.is-fold')).length === 2, '8 guide lines (6 live, 2 folds)');
  await page.uncheck('[data-k="guides"]');
  ok((await page.$$('.cv-gl')).length === 0, 'Guide lines off');
  await page.check('[data-k="guides"]');
  ok((await page.$$('.cv-gl')).length === 8, 'Guide lines on');

  /* Zoom: − and +, the label, Fit, ctrl + wheel at the pointer, wheel pans, drag the gray area pans. */
  const z = async () => (await CV.state(page)).z;
  await page.click('[data-k="zin"]');
  ok(Math.abs((await z()) - 1.25) < 1e-6 && (await CV.txt(page, '.cv-zoom')) === '125%', 'zoom in: 125%');
  await page.click('[data-k="zout"]'); await page.click('[data-k="zout"]');
  ok(Math.abs((await z()) - 0.8) < 1e-6 && (await CV.txt(page, '.cv-zoom')) === '80%', 'zoom out twice: 80%');
  for (let i = 0; i < 12; i++) await page.click('[data-k="zout"]');
  ok(Math.abs((await z()) - 0.25) < 1e-6, 'zoom stops at 25%');
  await page.click('[data-k="fit"]');
  const fz = await page.evaluate(() => { const w = document.querySelector('[data-ws]'); const E = window.kdpBookSteps[9]._debug(); const g = kdpCover.geo.geo(E.cover.fmt); return [E.view.z, Math.min(1.25, (w.clientWidth - 80) / g.W, (w.clientHeight - 60) / g.H), E.view.px, (w.clientWidth - g.W * E.view.z) / 2]; });
  ok(Math.abs(fz[0] - fz[1]) < 1e-9 && Math.abs(fz[2] - fz[3]) < 1e-6, `Fit: the design's fitView (${fz[0].toFixed(3)})`);
  const before = await CV.state(page);
  const [cx, cy] = await CV.pt(page, 400, 300);
  await page.mouse.move(cx, cy);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -50); await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  const after = await CV.state(page);
  const [cx2, cy2] = await CV.pt(page, 400, 300);
  ok(after.z > before.z && Math.abs(cx2 - cx) < 1 && Math.abs(cy2 - cy) < 1, 'ctrl + wheel zooms at the pointer (the point stays put)');
  await page.mouse.wheel(30, 40);
  await page.waitForTimeout(100);
  const pan = await CV.state(page);
  ok(Math.abs(pan.px - (after.px - 30)) < 0.5 && Math.abs(pan.py - (after.py - 40)) < 0.5, 'wheel pans');
  await page.click('[data-k="fit"]');
  const pan2 = await CV.state(page);
  pan.px = pan2.px; pan.py = pan2.py;
  const wr = await page.$eval('[data-ws]', (w) => { const b = w.getBoundingClientRect(); return [b.left + 6, b.top + 6]; });
  await page.mouse.move(wr[0], wr[1]); await page.mouse.down(); await page.mouse.move(wr[0] + 50, wr[1] + 20, { steps: 4 }); await page.mouse.up();
  const dragged = await CV.state(page);
  ok(Math.abs(dragged.px - (pan.px + 50)) < 0.5 && Math.abs(dragged.py - (pan.py + 20)) < 0.5, 'drag on the gray pans');
  ok(st.saves === 0, 'zoom and pan save nothing');

  /* Band: select the title, its handles; move; snap; width; rotate. */
  await CV.open(page, { design: 'band' });
  const t0 = await CV.layer(page, 'title');
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  let s = await CV.state(page);
  ok(s.sel === t0.id, 'click selects the title');
  ok((await page.$$('[data-selbox] .cv-h-deco')).length === 4 && !!(await page.$('[data-handle="width"]')) && !!(await page.$('[data-handle="rot"]')), 'text: 4 corner marks, a width handle, a rotate handle');
  ok(await page.$eval(`[data-hit="${t0.id}"]`, (b) => b.getAttribute('aria-pressed') === 'true'), 'the layer box says pressed');
  ok(/Selected: Micro Study Habits/.test(await page.$eval('[data-canvas]', (c) => c.getAttribute('aria-label'))), 'the canvas label names the selection');
  // move by 40, 30 board px (snap off: the title is centered on the front, so it would stay snapped).
  // The text bar pushed the workspace down: read the title's place again.
  await page.uncheck('[data-k="snap"]');
  [x, y] = await CV.center(page, 'title');
  const z1 = (await CV.state(page)).z;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40 * z1, y + 30 * z1, { steps: 6 }); await page.mouse.up();
  let t1 = await CV.layer(page, 'title');
  ok(Math.abs(t1.x - (t0.x + 40)) < 0.6 && Math.abs(t1.y - (t0.y + 30)) < 0.6, `drag moves it (${(t1.x - t0.x).toFixed(1)}, ${(t1.y - t0.y).toFixed(1)})`);
  // snap on: within 6 px/zoom of the front center, the center snaps and the magenta line shows
  await page.check('[data-k="snap"]');
  [x, y] = await CV.center(page, 'title');
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 37 * z1, y, { steps: 6 });
  const line = await page.$eval('[data-snapline]', (l) => !l.hidden);
  await page.mouse.up();
  t1 = await CV.layer(page, 'title');
  const fcx = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.geo.geo(E.cover.fmt).frontCX; });
  ok(line && Math.abs(t1.x + t1.w / 2 - fcx) < 1e-6, 'snap: the center lands on the front center, with the snap line');
  ok(await page.$eval('[data-snapline]', (l) => l.hidden), 'the snap line goes when the drag ends');
  // width: min 60
  const wh = await page.$eval('[data-handle="width"]', (h) => { const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(wh[0], wh[1]); await page.mouse.down(); await page.mouse.move(wh[0] - 40 * z1, wh[1], { steps: 5 }); await page.mouse.up();
  let t2 = await CV.layer(page, 'title');
  ok(Math.abs(t2.w - (t1.w - 40)) < 0.6, `width handle: 40 px narrower (${t2.w.toFixed(1)})`);
  const wh2 = await page.$eval('[data-handle="width"]', (h) => { const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(wh2[0], wh2[1]); await page.mouse.down(); await page.mouse.move(wh2[0] - 900, wh2[1], { steps: 5 }); await page.mouse.up();
  ok((await CV.layer(page, 'title')).w === 60, 'width stops at 60 px');
  // rotate: 45° snap within 4°
  const rh = await page.$eval('[data-handle="rot"]', (h) => { const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  const box = await page.$eval('[data-selbox]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const R = 120, at = (deg) => [box[0] + R * Math.sin(deg * Math.PI / 180), box[1] - R * Math.cos(deg * Math.PI / 180)];
  await page.mouse.move(rh[0], rh[1]); await page.mouse.down();
  await page.mouse.move(...at(20), { steps: 4 });
  ok((await CV.layer(page, 'title')).rot === 20, 'rotate: 20°');
  await page.mouse.move(...at(43), { steps: 3 });
  ok((await CV.layer(page, 'title')).rot === 45, 'rotate: 43° snaps to 45°');
  await page.mouse.move(...at(-88), { steps: 6 });
  ok((await CV.layer(page, 'title')).rot === -90, 'rotate: −88° snaps to −90°');
  await page.mouse.up();
  ok(await page.$eval(`[data-hit="${t0.id}"]`, (b) => /rotate\(-90deg\)/.test(b.style.transform)), 'the layer box turns with it');

  /* The band shape: 8 round handles; a corner keeps the shape, a side stretches it. */
  await CV.open(page, { design: 'band' });
  const sh0 = (await CV.state(page)).layers.find((l) => l.type === 'shape');
  const sp = await CV.pt(page, sh0.x + 30, sh0.y + sh0.h - 20);
  await page.mouse.click(...sp);
  ok((await CV.state(page)).sel === sh0.id, 'click on the band selects the shape');
  ok((await page.$$('[data-handle="box"]')).length === 8, 'shape: 8 handles');
  const z2 = (await CV.state(page)).z;
  const sH = await page.$eval('[data-handle="box"][data-c="s"]', (h) => { const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(...sH); await page.mouse.down(); await page.mouse.move(sH[0], sH[1] + 20 * z2, { steps: 4 }); await page.mouse.up();
  let sh1 = (await CV.state(page)).layers.find((l) => l.type === 'shape');
  ok(Math.abs(sh1.h - (sh0.h + 20)) < 0.6 && sh1.w === sh0.w, 'the bottom handle stretches the height only');
  const seH = await page.$eval('[data-handle="box"][data-c="se"]', (h) => { const b = h.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await page.mouse.move(...seH); await page.mouse.down(); await page.mouse.move(seH[0] - 50 * z2, seH[1], { steps: 4 }); await page.mouse.up();
  const sh2 = (await CV.state(page)).layers.find((l) => l.type === 'shape');
  ok(Math.abs(sh2.w / sh2.h - sh1.w / sh1.h) < 1e-6 && sh2.w < sh1.w, 'a corner keeps the shape');

  /* Click on the bare cover or the gray: nothing selected. */
  await page.mouse.click(...(await CV.pt(page, 30, 40)));
  ok((await CV.state(page)).sel === null, 'click on the bare cover deselects');
  ok(!(await page.$('[data-selbox]')) && !(await page.$('[data-textbar]:not([hidden])')), 'no frame, no text bar');

  /* Pixels: the renderer drew the white title on the navy band, and the band itself. */
  const tl = await CV.layer(page, 'title');
  const bandPx = await CV.px(page, ...(await CV.pt(page, sh2.x + 6, sh2.y + 6)));
  ok(bandPx[3] === 255 && bandPx[2] > bandPx[0] && bandPx[0] < 60, `the band is navy (${bandPx})`);
  const lines = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); return kdpCover.textlayout.lines(t).length; });
  // One pass in the page: 40 samples across the title's first line.
  const white = await page.evaluate((t) => {
    const E = window.kdpBookSteps[9]._debug(), c = document.querySelector('[data-canvas]'), d = window.devicePixelRatio || 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const bx = t.x + 20 + i * (t.w - 40) / 40, by = t.y + 18;
      const p = g.getImageData(Math.round((E.view.px + bx * E.view.z) * d), Math.round((E.view.py + by * E.view.z) * d), 1, 1).data;
      if (p[0] > 220 && p[1] > 220 && p[2] > 220) n++;
    }
    return n;
  }, tl);
  ok(white >= 3 && lines >= 1, `the title's letters are on the canvas (${white} white samples)`);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
