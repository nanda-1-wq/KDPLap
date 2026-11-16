// E16 Part 9: the Checks chip and drawer (design 70). F70 = Band + warm blurb, the subtitle at 6 pt and the pen name
// 30 px lower: "1 to fix", the drawer with one Must fix (C2) and Show me. The tags (Must fix, Check, Tip) each with an
// icon and a word; Show me selects the layer, closes the drawer and focuses its box; C1 "Add it" (and the reason when
// the book has no such words), C14 "Write blurb"; the green Ready box; the drawer follows changes (undo, a hidden
// layer); Escape and × close it and give the focus back to the chip; the cover stays usable beside it; Step D sizes.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  const band = await FIX.band(page);
  const designOf = (layers) => ({ book_id: FIX.BOOK, layers, bg: band.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const f70 = () => JSON.parse(JSON.stringify(band.layers)).map((l) => (l.src === 'subtitle' ? Object.assign(l, { size: 6 }) : l.src === 'pen' ? Object.assign(l, { y: l.y + 30 }) : l));
  const items = () => page.$$eval('.cv-ck-item', (a) => a.map((n) => ({ code: n.dataset.ckCode, tag: n.querySelector('.cv-ck-tag').textContent.trim(), icon: !!n.querySelector('.cv-ck-tag svg'), msg: n.querySelector('.cv-ck-msg').textContent.trim(), btn: (n.querySelector('button') || {}).textContent || null, why: (n.querySelector('.cv-ck-why') || {}).textContent || null })));

  /* F70. */
  st.design = designOf(f70());
  await CV.open(page);
  ok((await CV.txt(page, '[data-k="chk"]')) === '1 to fix', `chip: ${await CV.txt(page, '[data-k="chk"]')}`);
  ok(await page.$eval('[data-k="chk"]', (b) => b.classList.contains('is-bad') && !!b.querySelector('svg') && b.getAttribute('aria-expanded') === 'false' && b.getAttribute('aria-controls') === 'cv-checks'), 'chip: danger look with its icon, aria-expanded false, aria-controls');
  ok((await CV.txt(page, '[data-next-note]')) === 'Fix 1 problem before export.', 'header: Fix 1 problem before export.');
  await page.click('[data-k="chk"]');
  ok(await page.$eval('[data-k="chk"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'chip: aria-expanded true');
  ok(await CV.has(page, 'aside#cv-checks[aria-label="Checks"]'), 'the drawer opens');
  ok((await CV.txt(page, '.cv-ck-h')) === 'Checks' && (await CV.txt(page, '.cv-ck-sum')) === '1 must fix', `head: Checks, ${await CV.txt(page, '.cv-ck-sum')}`);
  let it = await items();
  ok(it.length === 1 && it[0].code === 'C2' && it[0].tag === 'Must fix' && it[0].icon, `one item: ${it.map((x) => x.code + ' ' + x.tag)}`);
  ok(it[0] && it[0].msg === '"How to Keep Up With Your C…" is 6 pt. KDP needs text of at least 7 pt.', `words of design 70: ${it[0] && it[0].msg}`);
  ok(it[0] && it[0].btn === 'Show me', 'Show me');
  ok((await CV.txt(page, '.cv-ck-foot')) === '"Must fix" blocks export. "Check" and "Tip" never block. Checks run on what will print: hidden and excluded layers are skipped.', 'the foot line');
  const box = await page.$eval('[data-checks]', (a) => { const r = a.getBoundingClientRect(); const ws = document.querySelector('[data-wswrap]').getBoundingClientRect(); return { w: Math.round(r.width), right: Math.round(ws.right - r.right), top: Math.round(r.top - ws.top), bottom: Math.round(ws.bottom - r.bottom) }; });
  ok(box.w === 380 && box.right === 0 && box.top === 0 && box.bottom === 0, `the drawer: 380 px on the right of the cover, under the bars (${JSON.stringify(box)})`);
  const tagc = await page.$eval('.cv-ck-tag', (t) => [getComputedStyle(t).backgroundColor, getComputedStyle(t).color]);
  ok(tagc[0] === 'rgb(253, 236, 234)' && tagc[1] === 'rgb(180, 35, 24)', `Must fix tag: ${tagc}`);
  ok(await page.$eval('[data-ck-body] .cv-ck-btn', (b) => document.activeElement === b), 'opening moves the focus to the first button in the drawer');

  // The cover stays usable beside it: a click on the cover selects.
  const sub = await CV.layer(page, 'subtitle');
  // Show me: selects the subtitle, closes the drawer, focuses its box.
  await page.click('[data-ck-show]');
  let s = await CV.state(page);
  ok(s.sel === sub.id, 'Show me selects the layer');
  ok(!(await CV.has(page, '[data-checks]')), 'Show me closes the drawer');
  ok(await page.evaluate((id) => document.activeElement && document.activeElement.dataset.hit === String(id), sub.id), "the layer's box has the focus");
  ok(await CV.has(page, '.cv-textbar:not([hidden])'), 'the text bar shows');

  // Fix it: 6 → 7 pt; the chip turns Ready? The pen name is 30 px lower: still inside. Check the result.
  await page.evaluate((id) => window.kdpBookSteps[9]._debug().setLayer(id, { size: 7 }), sub.id);
  await page.waitForTimeout(100);
  ok((await CV.txt(page, '[data-k="chk"]')) === 'Ready', `after 7 pt: ${await CV.txt(page, '[data-k="chk"]')}`);
  await page.click('[data-k="chk"]');
  ok(await CV.has(page, '.cv-ck-ok') && (await CV.txt(page, '.cv-ck-ok')) === 'Ready to export. Nothing KDP would reject. Look at Preview final once more before you export.', 'the green Ready box');
  ok(await page.$eval('.cv-ck-ok', (n) => !!n.querySelector('svg') && getComputedStyle(n).color === 'rgb(30, 122, 70)'), 'Ready: the success color with its icon');
  ok((await CV.txt(page, '.cv-ck-sum')) === 'Ready to export', 'head: Ready to export');
  // The drawer follows changes while open: undo brings the 6 pt back.
  await page.keyboard.press('Escape');
  ok(!(await CV.has(page, '[data-checks]')) && await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'chk'), 'Escape closes it; the focus goes back to the chip');
  await page.click('[data-k="chk"]');
  await page.mouse.click(...(await CV.pt(page, 30, 40)));   // the gray: the drawer stays (not modal)
  ok(await CV.has(page, '[data-checks]'), 'a click on the cover leaves the drawer open');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(150);
  it = await items();
  ok(it.length === 1 && it[0].code === 'C2', `undo: the drawer shows C2 again (${it.map((x) => x.code)})`);
  ok((await CV.txt(page, '[data-k="chk"]')) === '1 to fix', 'the chip follows');
  await page.click('[data-ck-close]');
  ok(!(await CV.has(page, '[data-checks]')) && await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'chk'), '× closes it; focus on the chip');

  // Hidden and excluded layers are skipped: hide the subtitle → C1 (the subtitle is not on the cover), no C2. The layer
  // is there, so the button is Show it (the design's Add it would do nothing): it comes back, selected.
  await page.evaluate((id) => window.kdpBookSteps[9]._debug().setLayer(id, { hidden: true }), sub.id);
  await page.click('[data-k="chk"]');
  it = await items();
  ok(it.some((x) => x.code === 'C1' && x.btn === 'Show it') && !it.some((x) => x.code === 'C2'), `hidden subtitle: C1 Show it, no C2 (${it.map((x) => x.code + ':' + x.btn)})`);
  await page.click('[data-ck-fix]');
  s = await CV.state(page);
  ok(!s.layers.find((l) => l.id === sub.id).hidden && s.sel === sub.id && !(await CV.has(page, '[data-checks]')), 'Show it: the subtitle shows again, selected, the drawer closes');
  // Deleted: C1 Add it adds the book's subtitle.
  await page.keyboard.press('Delete');
  await page.click('[data-k="chk"]');
  it = await items();
  ok(it.some((x) => x.code === 'C1' && x.btn === 'Add it'), `deleted subtitle: C1 Add it (${it.map((x) => x.code + ':' + x.btn)})`);
  await page.click('[data-ck-fix]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.filter((l) => l.src === 'subtitle').length === 1, null, { timeout: 10000 });
  s = await CV.state(page);
  ok(!(await CV.has(page, '[data-checks]')) && s.layers.find((l) => l.id === s.sel).src === 'subtitle', 'Add it: the subtitle is added and selected, the drawer closes');

  /* Several kinds at once: C1 (no pen name words: the reason, no button), C8 Check, C14 Tip with Write blurb. */
  const pen = st.book.pen_name; st.book.pen_name = '';
  const L = f70().filter((l) => l.src !== 'pen' && l.src !== 'blurb').map((l) => (l.src === 'subtitle' ? Object.assign(l, { size: 13 }) : l));
  const t0 = L.find((l) => l.src === 'title'); t0.y = 30;   // near the top cut: C8 or C7
  st.design = designOf(L);
  await CV.open(page);
  await page.click('[data-k="chk"]');
  it = await items();
  const c1 = it.find((x) => x.code === 'C1');
  ok(c1 && !c1.btn && c1.why === 'This book has no pen name yet.', `C1 with no pen name: the reason, no button (${JSON.stringify(c1)})`);
  const tip = it.find((x) => x.code === 'C14');
  ok(tip && tip.tag === 'Tip' && tip.icon && tip.btn === 'Write blurb', `C14: Tip with its icon, Write blurb (${JSON.stringify(tip)})`);
  const warn = it.find((x) => x.tag === 'Check');
  ok(!warn || warn.icon, 'a Check tag has its icon');
  ok(it[0].tag === 'Must fix', 'Must fix first (the checks order)');
  const tags = await page.$$eval('.cv-ck-tag', (a) => a.map((t) => getComputedStyle(t).fontSize));
  ok(tags.every((f) => parseFloat(f) >= 12), `tags 12 px or more (${[...new Set(tags)]})`);
  await page.click(`.cv-ck-item[data-ck-code="C14"] [data-ck-fix]`);
  await page.waitForSelector('[data-bl-text], .cv-bl-empty', { timeout: 5000 });
  ok(await CV.has(page, '[role="dialog"][aria-labelledby="cv-bl-h"]') || await CV.has(page, '.cv-bl-head'), 'Write blurb opens the blurb dialog');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'chk'), 'closing the dialog: the focus goes back to the chip');
  st.book.pen_name = pen;

  /* Owner, STOP 9: C17, the layout's sample blurb, is a Must fix with Show me and Write blurb. */
  {
    const L = JSON.parse(JSON.stringify(band.layers));
    const bl = L.find((l) => l.src === 'blurb');
    bl.text = await page.evaluate(() => kdpCover.layouts.BLURB_PLACEHOLDER);
    st.design = designOf(L);
    await CV.open(page);
    ok((await CV.txt(page, '[data-k="chk"]')) === '1 to fix' && (await CV.txt(page, '[data-next-note]')) === 'Fix 1 problem before export.', 'the sample blurb: 1 to fix, the header says so (it blocks export)');
    await page.click('[data-k="chk"]');
    it = await items();
    const c17 = it.find((x) => x.code === 'C17');
    ok(c17 && c17.tag === 'Must fix' && c17.msg === 'The back blurb is still the sample text. Write your blurb or delete it.', `C17: ${JSON.stringify(c17)}`);
    ok((await CV.all(page, '.cv-ck-item[data-ck-code="C17"] button')).join(' | ') === 'Show me | Write blurb', 'C17: Show me and Write blurb');
    const btnH = await page.$$eval('.cv-ck-item[data-ck-code="C17"] button', (a) => a.map((b) => { const r = getComputedStyle(b, '::after'); return Math.round(parseFloat(r.height)); }));
    ok(btnH.every((h) => h >= 44), `both have a 44 px click area (${btnH})`);
    await page.click('.cv-ck-item[data-ck-code="C17"] [data-ck-show]');
    ok((await CV.state(page)).sel === bl.id && !(await CV.has(page, '[data-checks]')), 'Show me: the blurb selected, the drawer closed');
    await page.click('[data-k="chk"]');
    await page.click('.cv-ck-item[data-ck-code="C17"] [data-ck-fix]');
    await page.waitForSelector('.cv-bl-head', { timeout: 5000 });
    ok(!(await CV.has(page, '[data-checks]')), 'Write blurb: the blurb dialog opens, the drawer closes');
    ok(await CV.has(page, '.cv-bl-empty') && !(await CV.has(page, '[data-bl-text]')), 'the dialog starts with no draft (the sample is not a blurb)');
    await page.keyboard.press('Escape');
    // Real words in the blurb layer: no C17, Ready.
    await page.evaluate((id) => window.kdpBookSteps[9]._debug().setLayer(id, { text: 'You signed up for the course. This book is for the nights you have twenty minutes.' }), bl.id);
    await page.waitForTimeout(100);
    ok((await CV.txt(page, '[data-k="chk"]')) === 'Ready', `real words on the back: ${await CV.txt(page, '[data-k="chk"]')}`);
    // The sample back, then deleted: no C17 either.
    await page.evaluate(([id, t]) => window.kdpBookSteps[9]._debug().setLayer(id, { text: t }), [bl.id, bl.text]);
    ok((await CV.txt(page, '[data-k="chk"]')) === '1 to fix', 'the sample back: 1 to fix');
    await page.evaluate((id) => window.kdpBookSteps[9]._debug().removeIds([id]), bl.id);
    ok(!(await page.evaluate(() => window.kdpBookSteps[9]._debug().checkItems().some((c) => c.code === 'C17'))), 'the sample deleted: no C17');
  }

  /* A missing picture (C15) and Show me on an image; the drawer redraws when it arrives (async). */
  /* Step D: every drawer button: 44 px click area, the ring. */
  st.design = designOf(f70());
  await CV.open(page);
  await page.click('[data-k="chk"]');
  for (const sel of ['[data-ck-close]', '[data-ck-show]']) {
    const r = await page.$eval(sel, (b) => { const a = getComputedStyle(b, '::after'); return [parseFloat(a.width), parseFloat(a.height)]; });
    ok(r[0] >= 44 && r[1] >= 44, `${sel}: click area ${r.map(Math.round).join(' × ')}`);
  }
  await page.focus('[data-ck-show]');
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const ring = await page.$eval('[data-ck-show]', (b) => { const c = getComputedStyle(b); return [c.outlineStyle, c.outlineWidth, c.outlineOffset]; });
  ok(ring[0] === 'solid' && ring[1] === '2px' && ring[2] === '2px', `focus ring: ${ring}`);
  ok(await page.$eval('[data-ck-close]', (b) => b.getAttribute('aria-label') === 'Close checks'), 'the × has a name');
  // Opening another menu (Background) closes nothing it should not; the chip toggles the drawer.
  await page.click('[data-k="chk"]');
  ok(!(await CV.has(page, '[data-checks]')), 'the chip again closes the drawer');
  ok(await CV.noScroll(page), 'no sideways scroll');

  /* 1024: the drawer fits, no sideways scroll. */
  await page.setViewportSize({ width: 1024, height: 900 });
  await CV.open(page);
  await page.click('[data-k="chk"]');
  ok(await CV.noScroll(page) && await page.$eval('[data-checks]', (a) => a.getBoundingClientRect().right <= window.innerWidth), '1024: the drawer fits');
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
