// E16 Part 4 (and Part 5's surfaces at the end): the Step D build rules (plan §3) and keyboard reach with a canvas renderer.
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
  const notes = await page.$$eval('[data-tpl] *', (a) => a.filter((e) => e.textContent.trim() && !e.children.length).length);
  ok(notes === 1, `the template drawing (E16.1: the barcode label only) is the only small text (${notes})`);

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

  /* ── Part 5: the same rules on effects, shapes and icons, several selected, Layers. ── */
  const sizes = (scope) => page.evaluate((sc) => {
    const out = [];
    for (const el of document.querySelectorAll(`${sc} button, ${sc} select, ${sc} a, ${sc} label:has(input[type="checkbox"]), ${sc} label:has(input[type="radio"])`)) {
      if (!el.offsetParent || el.matches('[data-hit]') || el.closest('[data-tpl]')) continue;
      const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after');
      const aw = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.width) : 0, ah = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.height) : 0;
      out.push({ k: el.dataset.k || el.textContent.trim().slice(0, 16) || el.tagName, w: Math.max(r.width, aw), h: Math.max(r.height, ah), row: !!el.closest('.cv-lrow:not(.cv-lrow-bg)') });
    }
    return out;
  }, scope);
  const small44 = (list) => list.filter((c) => c.w < 43.5 || c.h < 43.5).map((c) => `${c.k} ${Math.round(c.w)}×${Math.round(c.h)}`);
  const focusRing = async (sel) => {
    await page.focus(sel);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    return page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px' && s.outlineColor === 'rgb(28, 28, 26)'; });
  };
  // Text effects (with the color, distortion basic, then free).
  await CV.open(page, { design: 'band' });
  const T = await CV.layer(page, 'title');
  await page.focus(`[data-hit="${T.id}"]`); await page.keyboard.press('Enter');
  await page.click('[data-k="fx"]');
  await page.click('[data-fx-style="shadow"]');
  await page.check('[data-fx-dist]');
  bad = small44(await sizes('[data-fxpop]'));
  ok(bad.length === 0, `Text effects: 44 × 44 click areas${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const sel of ['[data-fx-style="shadow"]', '[data-k="fx-int"]', '[data-k="curve-n"]', '[data-k="fx-cancel"]', '[data-k="dist-on"]']) ok(await focusRing(sel), `Text effects focus ring: ${sel}`);
  await page.check('input[data-fx-mode][value="free"]');
  const qa = await page.evaluate(() => [...document.querySelectorAll('[data-handle="quad"]')].map((h) => { const a = getComputedStyle(h, '::after'), z = window.kdpBookSteps[9]._debug().view.z; return [parseFloat(a.width) * z, parseFloat(a.height) * z]; }));
  ok(qa.length === 4 && qa.every((q) => q[0] >= 43.5 && q[1] >= 43.5), `green corners: 44 × 44 on screen (${qa.map((q) => Math.round(q[0])).join(', ')})`);
  await page.keyboard.press('Escape');
  // Shape bar and its popovers; the Shapes panel and the icons.
  await page.click('[data-tool="shapes"]');
  await page.waitForSelector('[data-icon-grid]', { timeout: 15000 });
  bad = small44(await sizes('[data-panel]'));
  ok(bad.length === 0, `Shapes panel (shapes and icons): 44 × 44${bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''}`);
  await page.click('[data-add-shape="star"]');
  bad = small44(await sizes('[data-textbar]'));
  ok(bad.length === 0, `shape bar: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const m of ['shape', 'sfill', 'stroke', 'op', 'arr', 'more']) {
    await page.click(`[data-k="${m}"]`);
    if (m === 'sfill') await page.click('[data-fmode="grad"]');
    bad = small44(await sizes('.cv-textbar .cv-pop'));
    ok(bad.length === 0, `${m} popover: 44 × 44${bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''}`);
    await page.keyboard.press('Escape');
  }
  for (const sel of ['[data-k="shape"]', '[data-k="sfill"]', '[data-k="flipH"]', '[data-k="more"]', '[data-k="ic-crown"]', '[data-k="sh-rect"]', '[data-k="icon-q"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  // Several selected.
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.selectIds(E.cover.layers.filter((l) => l.type === 'text').map((l) => l.id)); });
  bad = small44(await sizes('[data-textbar]'));
  ok(bad.length === 0, `several-selected bar: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const sel of ['[data-k="al-left"]', '[data-k="align-to"]', '[data-k="dist-h"]', '[data-k="m-done"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  // Layers panel and its menu. The row buttons are the design's 14 to 28 px marks in a 240 px panel: their
  // click areas are 44 px high and as wide as the row allows (grip 22, eye, lock and ⋮ 34), with no overlap.
  // That is the one Step D exception of Part 5, listed at STOP 5 as "New, your call".
  await page.click('[data-tool="layers"]');
  const lay = await sizes('[data-panel]');
  bad = small44(lay.filter((c) => !c.row));
  ok(bad.length === 0, `Layers panel outside the rows: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  const rowB = lay.filter((c) => c.row);
  ok(rowB.length > 0 && rowB.every((c) => c.h >= 43.5 && (c.w >= 43.5 || c.w >= 21.5)), `row buttons: 44 px high; widths ${[...new Set(rowB.map((c) => Math.round(c.w)))].join(', ')} (the exception above)`);
  const overlap = await page.evaluate(() => {
    const out = [];
    for (const r of document.querySelectorAll('.cv-lrow:not(.cv-lrow-bg)')) {
      const bs = [...r.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(), a = getComputedStyle(b, '::after'); const w = Math.max(q.width, parseFloat(a.width) || 0); const cx = q.left + q.width / 2; return [cx - w / 2, cx + w / 2]; });
      for (let i = 1; i < bs.length; i++) if (bs[i][0] < bs[i - 1][1] - 0.5) out.push(i);
    }
    return out.length;
  });
  ok(overlap === 0, 'row click areas never overlap');
  const rid = (await CV.state(page)).layers[0].id;
  await page.click(`[data-lmenu="${rid}"]`);
  bad = small44(await sizes('[data-lmenu-pop]'));
  ok(bad.length === 0, `⋮ menu: 44 px items${bad.length ? ': ' + bad.join(', ') : ''}`);
  await page.keyboard.press('Escape');
  for (const sel of [`[data-pick="${rid}"]`, `[data-grip="${rid}"]`, `[data-eye="${rid}"]`, `[data-lmenu="${rid}"]`, '[data-bgcolor]', '[data-tool="layers"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  // Small text and blue, with every Part 5 surface drawn once more.
  await page.focus(`[data-pick="${rid}"]`); await page.keyboard.press('Enter');
  const tiny = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector('.cv-root'), NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) { const n = walk.currentNode, el = n.parentElement; if (!n.textContent.trim() || !el.offsetParent || el.closest('[data-tpl]') || el.closest('.sr-only')) continue; const px = parseFloat(getComputedStyle(el).fontSize); if (px < 12) out.push(`${n.textContent.trim().slice(0, 20)} ${px}`); }
    return out;
  });
  ok(tiny.length === 0, `Part 5 UI text is 12 px or more${tiny.length ? ': ' + tiny.join(', ') : ''}`);
  const blue5 = await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.cv-root *')) { if (el.closest('[data-ws]')) continue; const s = getComputedStyle(el); for (const p of ['color', 'backgroundColor', 'borderTopColor']) if (s[p] === 'rgb(46, 106, 230)') out.push(`${el.className} ${p}`); } return out; });
  ok(blue5.length === 0, `no blue in the Part 5 UI${blue5.length ? ': ' + blue5.slice(0, 4).join(', ') : ''}`);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
