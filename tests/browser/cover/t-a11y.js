// E16 Part 4: the Step D build rules (plan §3) and keyboard reach with a canvas renderer.
// - every control: a 44 × 44 px click area (the 36 px look keeps an ::after), a 2 px ink focus ring 2 px off;
// - UI text 12 px or more (the KDP template notes on the cover are drawing, 9 to 11 px, and are left out);
// - no blue info color in the UI (the canvas-only --cv-* colors are on the cover and its handles only);
// - Tab reaches every layer (front first), Enter selects, Enter again types, the handles are labelled buttons.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);

  /* Click areas: each control's box or its ::after is at least 44 × 44 (at zoom 1 for the overlay). */
  const areas = async (scope) => page.evaluate((sc) => {
    const bad = [];
    for (const el of document.querySelectorAll(`${sc} button, ${sc} select, ${sc} a, ${sc} label:has(input[type="checkbox"])`)) {
      // The layer boxes are the cover's drawing (a 12 px pen name is 12 px high); Tab and Enter reach them all.
      if (!el.offsetParent || el.closest('[data-tpl]') || el.matches('[data-hit]')) continue;
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      const aw = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.width) : 0, ah = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.height) : 0;
      // a select has no ::after: its own box counts
      const w = Math.max(r.width, aw), h = Math.max(r.height, ah);
      if (w < 43.5 || h < 43.5) bad.push(`${el.dataset.k || el.dataset.hex || el.dataset.font || el.textContent.trim().slice(0, 16) || el.tagName} ${Math.round(w)}×${Math.round(h)}`);
    }
    return bad;
  }, scope);
  let bad = await areas('.cv-root');
  ok(bad.length === 0, `editor: every control has a 44 × 44 click area${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const m of ['font', 'color', 'op', 'arr']) {
    await page.click(`[data-k="${m}"]`);
    bad = await areas('.cv-textbar .cv-pop');
    ok(bad.length === 0, `${m} popover: 44 × 44 click areas${bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''}`);
    await page.keyboard.press('Escape');
  }
  await page.click('[data-k="tpl"]');
  bad = await areas('[data-tplpop]');
  ok(bad.length === 0, `template popover: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  await page.click('[data-tpl-close]');
  [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  const hs = await page.evaluate(() => [...document.querySelectorAll('[data-handle]')].map((h) => { const a = getComputedStyle(h, '::after'); const z = window.kdpBookSteps[9]._debug().view.z; return [h.dataset.handle, parseFloat(a.width) * z, parseFloat(a.height) * z]; }));
  ok(hs.length === 2 && hs.every((h) => h[1] >= 43.5 && h[2] >= 43.5), `text handles: 44 × 44 on screen (${hs.map((h) => h[0] + ' ' + Math.round(h[1])).join(', ')})`);

  /* Focus ring: 2 px ink, 2 px off (bar buttons, inputs, the layer boxes scaled by zoom). */
  for (const sel of ['[data-k="undo"]', '[data-k="fit"]', '[data-k="font"]', '[data-k="caps"]', '[data-tool="text"]', '[data-add-text="heading"]', '[data-k="weight"]']) {
    await page.focus(sel);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const f = await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return [e.dataset.k || e.dataset.tool || e.dataset.addText, s.outlineStyle, s.outlineWidth, s.outlineOffset, s.outlineColor]; });
    ok(f[1] === 'solid' && f[2] === '2px' && f[3] === '2px' && f[4] === 'rgb(28, 28, 26)', `focus ring ${f[0]}: ${f.slice(1).join(' ')}`);
  }

  /* UI text 12 px or more (the template drawing left out). */
  const small = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector('.cv-root'), NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const n = walk.currentNode, el = n.parentElement;
      if (!n.textContent.trim() || !el.offsetParent || el.closest('[data-tpl]') || el.closest('.sr-only')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) out.push(`${n.textContent.trim().slice(0, 20)} ${px}`);
    }
    return out;
  });
  ok(small.length === 0, `UI text is 12 px or more${small.length ? ': ' + small.join(', ') : ''}`);
  const notes = await page.$$eval('.cv-tpl-notes > div, .cv-tpl-barcode, .cv-tpl-label', (a) => a.length);
  ok(notes === 8, `the template drawing (5 notes, barcode, 2 labels) is the only small text (${notes})`);

  /* No blue info color: UI text and borders outside the cover stay ink, gray and the functional colors. */
  const blue = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.cv-root *')) {
      if (el.closest('[data-ws]')) continue;
      const s = getComputedStyle(el);
      for (const p of ['color', 'backgroundColor', 'borderTopColor']) if (s[p] === 'rgb(46, 106, 230)') out.push(`${el.className} ${p}`);
    }
    return out;
  });
  ok(blue.length === 0, `no blue in the UI${blue.length ? ': ' + blue.slice(0, 4).join(', ') : ''}`);

  /* Keyboard reach: Tab from the view bar's last control reaches the layer boxes, front first. */
  await page.mouse.click(...(await CV.pt(page, 30, 40)));
  const order = await page.$$eval('[data-hit]', (a) => a.map((b) => b.getAttribute('aria-label')));
  const layers = (await CV.state(page)).layers;
  ok(order.length === 5 && order[0].startsWith('Text: You signed up') && order[4].startsWith('Shape:'), `layer boxes front first: ${order.map((o) => o.split(':')[0]).join(', ')}`);
  ok(order[1] === `Text: ${(await page.evaluate((l) => kdpCover.names.layerName(l), layers[3]))}`, 'the names come from the Layers rule (kdpCover.names.layerName)');
  await page.focus('[data-k="pv"]');
  await page.keyboard.press('Tab');
  let a = await page.evaluate(() => [document.activeElement.dataset.hit, document.activeElement.getAttribute('aria-label')]);
  ok(a[0] === String(layers[4].id), `Tab after the view bar: the front layer (${a[1]})`);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  a = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  ok(/^Shape:/.test(a), `four more Tabs: the band at the back (${a})`);
  await page.keyboard.press('Enter');
  ok((await CV.state(page)).sel === layers[0].id, 'Enter selects it');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-hit]')), 'focus stays on its box');
  await page.keyboard.press('Tab');
  a = await page.evaluate(() => [document.activeElement.dataset.handle, document.activeElement.getAttribute('aria-label')]);
  ok(a[0] === 'box' && /Drag to resize, top left\. Arrow keys work too\./.test(a[1]), `the next Tab: a labelled handle (${a[1]})`);
  const w0 = (await CV.state(page)).layers[0];
  await page.keyboard.press('ArrowRight');
  const w1 = (await CV.state(page)).layers[0];
  ok(w1.w === w0.w + 1 && Math.abs(w1.w / w1.h - w0.w / w0.h) < 1e-9, 'arrows on a corner handle: 1 px, the shape kept');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.handle === 'box'), 'focus stays on the handle');
  // the rotate handle
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  a = await page.evaluate(() => document.activeElement.dataset.handle);
  ok(a === 'rot', `then the rotate handle (${a})`);
  await page.keyboard.press('Shift+ArrowRight');
  ok((await CV.state(page)).layers[0].rot === 15, 'Shift + arrow on rotate: 15°');
  // a text: Enter selects, Enter again types
  const pen = layers.find((l) => l.src === 'pen');
  await page.focus(`[data-hit="${pen.id}"]`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-edit]')), 'Enter twice on a text: typing in place');
  await page.keyboard.press('Escape');
  const lab = await page.$eval('[data-canvas]', (c) => [c.getAttribute('role'), c.getAttribute('aria-label')]);
  ok(lab[0] === 'img' && /^Cover, full wrap 12\.372 × 9\.25 in\. Selected: ADNAN HAROUN|Selected: Adnan Haroun/.test(lab[1]), `the canvas: role img, names the selection (${lab[1].slice(0, 70)})`);
  ok(await page.$eval('.cv-tools', (n) => n.getAttribute('aria-label') === 'Cover tools') && await page.$eval('[data-viewbar]', (n) => n.getAttribute('role') === 'toolbar' && n.getAttribute('aria-label') === 'Cover view') && await page.$eval('[data-textbar]', (n) => n.getAttribute('role') === 'toolbar' && n.getAttribute('aria-label') === 'Selected text'), 'landmarks: Cover tools, the Cover view and Selected text toolbars');
  ok(await page.$eval('[data-savetext]', (n) => n.getAttribute('role') === 'status'), 'the save line is a status');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
