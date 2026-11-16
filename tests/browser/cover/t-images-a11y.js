// E16 Part 6: the Step D build rules (plan §3) on every Part 6 surface: the Images panel (Uploads, the PDF chooser,
// an error), the picture bar and its popovers, the crop bar and handles, the placeholders. 44 × 44 click areas, the
// 2 px ink focus ring 2 px off, UI text 12 px or more, no blue info color, keyboard reach (the rights box, the
// upload fields, the tiles, Crop by Enter, the Layers row of a picture), and the functional colors with an icon and
// a word (the DPI badge, the upload error, "Picture missing").
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  const sizes = (scope) => page.evaluate((sc) => {
    const out = [];
    for (const el of document.querySelectorAll(`${sc} button, ${sc} select, ${sc} a, ${sc} label:has(input[type="checkbox"]), ${sc} label:has(input[type="file"])`)) {
      if (!el.offsetParent || el.matches('[data-hit]') || el.closest('[data-tpl]') || el.closest('.cv-lrow:not(.cv-lrow-bg)')) continue;
      const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after');
      const aw = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.width) : 0, ah = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.height) : 0;
      out.push({ k: el.dataset.k || el.textContent.trim().slice(0, 16) || el.tagName, w: Math.max(r.width, aw), h: Math.max(r.height, ah) });
    }
    return out;
  }, scope);
  const small44 = (list) => list.filter((c) => c.w < 43.5 || c.h < 43.5).map((c) => `${c.k} ${Math.round(c.w)}×${Math.round(c.h)}`);
  const ring = () => page.evaluate(() => { const e = document.activeElement; const t = e.closest('.cv-upbtn') || e; const s = getComputedStyle(t); return s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px' && s.outlineColor === 'rgb(28, 28, 26)'; });
  const focusRing = async (sel) => { await page.focus(sel); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); return ring(); };
  const tiny = () => page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.querySelector('.cv-root'), NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) { const n = walk.currentNode, el = n.parentElement; if (!n.textContent.trim() || !el.offsetParent || el.closest('[data-tpl]') || el.closest('.sr-only')) continue; const z = el.closest('.cv-ph') ? window.kdpBookSteps[9]._debug().view.z : 1; const px = parseFloat(getComputedStyle(el).fontSize) * z; if (px < 11.95) out.push(`${n.textContent.trim().slice(0, 20)} ${px}`); }
    return out;
  });
  const blue = () => page.evaluate(() => { const out = []; for (const el of document.querySelectorAll('.cv-root *')) { if (el.closest('[data-ws]')) continue; const s = getComputedStyle(el); for (const p of ['color', 'backgroundColor', 'borderTopColor']) if (s[p] === 'rgb(46, 106, 230)') out.push(`${el.className} ${p}`); } return out; });

  /* Keyboard: Images by Tab and Enter; the rights box; the upload fields reachable once it is ticked. */
  await page.focus('[data-tool="images"]'); await page.keyboard.press('Enter');
  await page.waitForSelector('[data-rights]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Images'), 'Enter on Images opens the panel');
  ok(await focusRing('[data-rights]'), 'focus ring: the rights box');
  await page.keyboard.press('Space');
  ok(await page.$eval('[data-rights]', (i) => i.checked), 'Space ticks the rights box');
  await page.focus('[data-rights]'); await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.matches('[data-up-file]')), 'Tab goes to Upload image (the file field in its label)');
  ok(await ring(), 'Upload image shows the focus ring on its label');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.matches('[data-up-pdf]')) && await ring(), 'then Upload PDF, with its ring');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.matches('[data-paste]')) && await ring(), 'then Paste from clipboard');
  let bad = small44(await sizes('[data-panel]'));
  ok(bad.length === 0, `Images panel: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);

  /* Two uploads, an error, the PDF chooser. */
  await PIC.make(page, 'a', { w: 3000, h: 2000, type: 'image/jpeg', name: 'desk.jpg' });
  await PIC.pick(page, 'a'); await PIC.idle(page);
  await PIC.make(page, 'b', { w: 600, h: 600, type: 'image/png', alpha: true, name: 'cut.png' });
  await PIC.pick(page, 'b'); await PIC.idle(page);
  await page.evaluate((t) => { window.__pic.pdf = new File([t], 'pages.pdf', { type: 'application/pdf' }); }, PIC.pdf(2));
  await PIC.pick(page, 'pdf', 'pdf');
  await page.waitForSelector('[data-pdfbox]', { timeout: 20000 });
  await PIC.raw(page, 'gif', { bytes: [71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 59], name: 'x.jpg', type: 'image/jpeg' });
  await PIC.pick(page, 'gif');
  await page.waitForSelector('.cv-uperr');
  bad = small44(await sizes('[data-panel]'));
  ok(bad.length === 0, `Images panel with tiles, the PDF chooser and an error: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const sel of ['[data-uptiles] [data-add-asset]', '[data-pdf-page]', '[data-pdf-place]', '[data-pdf-cancel]', '[data-tool="images"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  ok(await page.$eval('.cv-uperr', (n) => n.getAttribute('role') === 'alert' && !!n.querySelector('svg') && getComputedStyle(n).color === 'rgb(180, 35, 24)'), 'the upload error: red with an icon and words, an alert');
  let t = await tiny();
  ok(t.length === 0, `Images panel text is 12 px or more${t.length ? ': ' + t.join(', ') : ''}`);
  ok((await blue()).length === 0, 'no blue in the Images panel');
  // Enter on a tile adds the picture
  const n0 = (await PIC.layers(page)).length;
  await page.focus('[data-uptiles] [data-add-asset]'); await page.keyboard.press('Enter');
  ok((await PIC.layers(page)).length === n0 + 1, 'Enter on an Uploads tile adds it');

  /* The picture bar and each popover. */
  const id = (await CV.state(page)).sel;
  bad = small44(await sizes('[data-textbar]'));
  ok(bad.length === 0, `picture bar: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const m of ['ifill', 'iadjust', 'iborder', 'imask', 'op', 'arr', 'more']) {
    await page.click(`[data-textbar] [data-k="${m}"]`);
    bad = small44(await sizes('.cv-textbar .cv-pop'));
    ok(bad.length === 0, `${m} popover: 44 × 44${bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''}`);
    t = await tiny();
    ok(t.length === 0, `${m}: text 12 px or more${t.length ? ': ' + t.join(', ') : ''}`);
    await page.keyboard.press('Escape');
    ok(await page.evaluate((m) => document.activeElement && document.activeElement.dataset.k === m, m), `Escape closes ${m}; focus back on its button`);
  }
  for (const sel of ['[data-k="replace"]', '[data-k="crop"]', '[data-k="ifill"]', '[data-k="flipH"]', '[data-k="more"]', '[data-k="del"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  ok((await blue()).length === 0, 'no blue in the picture bar');
  const dpi = await page.$eval('[data-dpi]', (b) => [!!b.querySelector('svg'), b.innerText.trim(), getComputedStyle(b).fontSize]);
  ok(dpi[0] && /DPI/.test(dpi[1]) && dpi[2] === '12px', `the DPI badge: an icon and words, 12 px (${dpi[1]})`);

  /* Crop by keyboard: Enter on the box, the bar, the handles; Escape back. */
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => window.kdpBookSteps[9]._debug().cropping) != null, 'Enter on the selected picture starts Crop');
  bad = small44(await sizes('[data-textbar]'));
  ok(bad.length === 0, `crop bar: 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  for (const sel of ['[data-crop-zoom]', '[data-k="crop-reset"]', '[data-k="crop-done"]', '[data-handle="crop"][data-c="nw"]', '[data-handle="crop"][data-c="e"]']) ok(await focusRing(sel), `focus ring: ${sel}`);
  ok(await page.$eval('[data-handle="crop"][data-c="e"]', (h) => h.tagName === 'BUTTON' && /^Drag to crop, right\./.test(h.getAttribute('aria-label'))), 'a crop bar is a labelled button');
  t = await tiny();
  ok(t.length === 0, `crop bar text 12 px or more${t.length ? ': ' + t.join(', ') : ''}`);
  await page.keyboard.press('Escape');

  /* The Layers row of a picture shows the picture; it is reachable as every row. */
  await page.click('[data-tool="layers"]');
  ok(await page.$eval(`.cv-lrow [data-pick="${id}"]`, (b) => !!b.closest('.cv-lrow').querySelector('.cv-lr-img img')), 'the Layers row of a picture shows the picture itself');
  ok(await focusRing(`[data-pick="${id}"]`), 'focus ring: the picture\'s Layers row');

  /* A missing picture: its placeholder words at 12 px or more on screen at any zoom, and "Picture missing" with an icon. */
  const ghostId = '0000000c-0000-4000-8000-00000000000c';
  await page.evaluate((a) => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.id === E.sel); E.setLayer(l.id, { asset: a }); kdpCover.images.ensure(E, Object.assign({}, l, { asset: a })); E.viewChanged(); }, ghostId);
  await page.waitForSelector('.cv-ph.is-missing');
  for (const z of [0.5, 1, 2]) {
    await page.evaluate((z) => { const E = window.kdpBookSteps[9]._debug(); E.view.z = z; E.viewChanged(); }, z);
    const ph = await page.$eval('.cv-ph.is-missing .cv-ph-t', (n) => { const r = n.getBoundingClientRect(); return parseFloat(getComputedStyle(n).fontSize) * window.kdpBookSteps[9]._debug().view.z; });
    ok(Math.abs(ph - 13) < 0.01, `zoom ${z * 100} %: the placeholder title is 13 px on screen`);
  }
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.view_.fit(); });
  ok(await page.$eval('.cv-picnote', (n) => !!n.querySelector('svg') && /Picture missing/.test(n.innerText) && getComputedStyle(n).color === 'rgb(180, 35, 24)'), 'the bar: "Picture missing", red, with an icon');
  ok(await page.$eval('.cv-ph.is-missing', (n) => !!n.querySelector('svg') && /Picture missing/.test(n.innerText)), 'the placeholder: icon and words');
  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0 && CV.mockErrors().length === 0, 'no network, no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
