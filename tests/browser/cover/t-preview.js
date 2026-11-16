// E16 Part 9: Preview final (design 69). F69 = Band + warm blurb, Preview final open. The dialog under the book head
// over the whole width (the step rail too); As printed (the trim box) and With bleed (the wrap), the sizes; Black and
// white check (a grayscale filter on the three pictures); the painting is the files' (no template, guides, selection,
// hidden or excluded layers; the count line); the Kindle picture is the Kindle JPG's painting (kindle.paint, kFit on a
// wide trim) and its words for the 3 cuts; the search-size picture; Export cover inert (Part 10); a modal: the cover's
// keys and Paste rest, Tab stays inside, Escape and Back to editing close it and focus Preview final; pictures that
// arrive later are painted; 1024; Step D.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  const band = await FIX.band(page);
  const designOf = (layers, fmt) => ({ book_id: FIX.BOOK, layers, bg: band.bg, fmt: fmt || { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const pv = () => page.evaluate(() => window.kdpBookSteps[9]._debug().pv);
  // A canvas pixel (CSS px inside the canvas) as [r, g, b].
  const px = (sel, x, y) => page.$eval(sel, (c, [x, y]) => { const d = c.width / c.getBoundingClientRect().width; return [...c.getContext('2d').getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data].slice(0, 3); }, [x, y]);
  const size = (sel) => page.$eval(sel, (c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });

  /* F69. */
  st.design = designOf(JSON.parse(JSON.stringify(band.layers)));
  await CV.open(page);
  const title = await CV.layer(page, 'title');
  await page.click(`[data-hit="${title.id}"]`);   // a selection: Preview final drops it
  await page.click('[data-k="pv"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().pv.painted > 0, null, { timeout: 10000 });
  ok(await CV.has(page, '[role="dialog"][aria-modal="true"][aria-labelledby="cv-pv-h"]'), 'Preview final: a modal dialog');
  ok((await CV.state(page)).sel == null, 'opening it drops the selection');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-pv-close')), 'the focus: Back to editing');
  const bar = await CV.all(page, '.cv-pv-bar > *');
  ok(bar.filter(Boolean).join(' | ') === 'Back to editing | Preview final | Show | As printed, cut at the trim With bleed | Black and white check | Export cover', `bar: ${bar.filter(Boolean).join(' | ')}`);
  ok(await page.$eval('[data-pv-cut="1"]', (b) => b.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-pv-cut="0"]', (b) => b.getAttribute('aria-pressed') === 'false'), 'As printed is pressed');
  ok(await page.$eval('.cv-pv-export', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Comes in Part 10'), 'Export cover: inert, Comes in Part 10');
  const dlg = await page.$eval('[data-pv]', (d) => { const r = d.getBoundingClientRect(), h = document.querySelector('[data-book-head]').getBoundingClientRect(); return { left: r.left, right: Math.round(window.innerWidth - r.right), top: Math.round(r.top - h.bottom), bottom: Math.round(window.innerHeight - r.bottom) }; });
  ok(dlg.left === 0 && dlg.right === 0 && dlg.top === 0 && dlg.bottom === 0, `under the book head, the whole width (the rail too): ${JSON.stringify(dlg)}`);
  const rail = await page.evaluate(() => { const r = document.querySelector('[data-pv]').getBoundingClientRect(); const e = document.elementFromPoint(20, r.top + 200); return !!(e && e.closest('[data-pv]')); });
  ok(rail, 'the step rail is under the dialog');
  const top = await page.evaluate(() => { const h = document.querySelector('[data-book-head]').getBoundingClientRect(); const e = document.elementFromPoint(Math.max(1, h.left / 2), h.bottom - 12); return !!(e && e.closest('[data-pv]')) || e === document.querySelector('[data-pv]'); });
  ok(top, "the rail's top beside the book head is covered too (design 69: no rail)");

  // As printed: the trim box (6 × 9 → 2 × 6 + spine) × 9 at the design's size (940 × 660 at most).
  const g = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const g = kdpCover.geo.geo(E.cover.fmt); return { W: g.W, H: g.H, b: g.b, trimH: g.trimH, foldL: g.foldL, foldR: g.foldR }; });
  // The design's rule: up to 940 × 660 px, the shape of the trim box (here the window height sets it).
  let big = await size('[data-pv-big]');
  ok(big[0] <= 940 && big[1] <= 660 && big[1] >= 600 && Math.abs(big[0] / big[1] - (g.W - 2 * g.b) / g.trimH) < 0.01, `As printed: ${big.join(' × ')} px, the trim box's shape`);
  ok(await page.$eval('[data-pv-big]', (c) => c.width === Math.round(c.getBoundingClientRect().width * devicePixelRatio)), 'sharp on this screen (device pixels)');
  // Paint: the band is navy at the front middle; the paper top left is the background (no pink bleed, no template words).
  const navy = await px('[data-pv-big]', big[0] * 0.75, big[1] * 0.5);
  ok(navy[2] > navy[0] + 30 && navy[0] < 60, `the band is drawn (navy ${navy})`);
  const corner = await px('[data-pv-big]', 4, 4), bgc = [1, 3, 5].map((i) => parseInt(band.bg.slice(i, i + 2), 16));
  ok(corner.every((v, i) => Math.abs(v - bgc[i]) <= 2), `the corner is the background ${band.bg}: no bleed pink, no template (${corner})`);
  ok((await CV.txt(page, '.cv-pv-labels')) === 'Back cover spine 0.122 in Front cover', `labels: ${await CV.txt(page, '.cv-pv-labels')}`);
  ok((await CV.txt(page, '[data-pv-note]')) === 'Everything you see here goes into your files. Template lines and guides never print.', 'the line under it');

  // With bleed: the whole wrap.
  await page.click('[data-pv-cut="0"]');
  big = await size('[data-pv-big]');
  ok(big[0] <= 940 && big[1] <= 660 && Math.abs(big[0] / big[1] - g.W / g.H) < 0.01, `With bleed: ${big.join(' × ')} px, the wrap's shape`);
  ok(await page.$eval('[data-pv-cut="0"]', (b) => b.getAttribute('aria-pressed') === 'true' && document.activeElement === b), 'With bleed is pressed and keeps the focus');
  await page.click('[data-pv-cut="1"]');

  // Black and white check: the three pictures gray (a CSS filter: canvas pixels do not change, the computed style does).
  await page.check('[data-pv-gray]');
  const gray = await page.$$eval('.cv-pv .is-gray', (a) => a.map((n) => getComputedStyle(n).filter));
  ok(gray.length === 3 && gray.every((f) => f === 'grayscale(1)'), `B/W: 3 pictures, ${[...new Set(gray)]}`);
  ok(await page.$eval('[data-pv-big]', (c) => /black and white/.test(c.getAttribute('aria-label'))), 'the cover canvas says black and white');
  await page.uncheck('[data-pv-gray]');
  ok(!(await CV.has(page, '.cv-pv .is-gray')), 'B/W off');

  // Kindle: 200 × 320 (1600 × 2560 shown at 1 : 8), the same painting as the Kindle JPG (kindle.paint).
  ok((await size('[data-pv-kindle]')).join('×') === '200×320' && (await size('[data-pv-thumb]')).join('×') === '75×120', 'Kindle 200 × 320, search size 75 × 120');
  ok((await CV.txt(page, '.cv-pv-kcard .cv-pv-khead')) === 'Kindle cover 1600 × 2560 px', 'Kindle cover · 1600 × 2560 px');
  ok((await CV.txt(page, '.cv-pv-kcard .cv-pv-p')) === 'Made from your print front: cut at the trim, then 0.19 in trimmed from each side to the Kindle shape (1 : 1.6). Keep words inside the safe area and nothing is lost.', '6 × 9: 0.19 in from each side (design 69)');
  // The same painting as the Kindle JPG: the preview calls kindle.paint with this cover and its box. (Pixels are compared
  // with a small margin: Chrome draws text in a canvas in the page with other anti-aliasing than in a detached one.)
  const same = await page.evaluate(() => {
    const E = window.kdpBookSteps[9]._debug(), K = kdpCover.kindle, calls = [], orig = K.paint;
    K.paint = function (ctx, cover, box, images) { calls.push({ cover: cover === E.cover, box: [box.w, box.h] }); return orig.apply(this, arguments); };
    try { kdpCover.preview.paint(E); } finally { K.paint = orig; }
    const a = document.querySelector('[data-pv-kindle]');
    const c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
    orig(c.getContext('2d', { alpha: false }), E.cover, { w: c.width, h: c.height }, (l) => kdpCover.images.source(E, l));
    const x = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, y = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let d = 0; for (let i = 0; i < x.length; i++) d += Math.abs(x[i] - y[i]);
    return { calls, mean: d / x.length };
  });
  const dpr = await page.evaluate(() => devicePixelRatio);
  ok(same.calls.length === 2 && same.calls.every((c) => c.cover) && same.calls[0].box.join() === [200 * dpr, 320 * dpr].join() && same.calls[1].box.join() === [75 * dpr, 120 * dpr].join(),
    `the Kindle and search pictures are kindle.paint of this cover (${JSON.stringify(same.calls)})`);
  ok(same.mean < 1.5, `the Kindle picture matches a fresh kindle.paint (mean difference ${same.mean.toFixed(3)} of 255)`);
  ok((await CV.txt(page, '.cv-pv-tcard h3')) === 'Search result size' && (await CV.txt(page, '.cv-pv-tcard .cv-pv-p')) === 'This is about how big your cover looks in Amazon search. Can you still read the title? If not, make it bigger or add more contrast.', 'Search result size and its words');
  const kn = await px('[data-pv-kindle]', 100, 120);
  ok(kn[2] > kn[0] + 30, `the Kindle band is navy (${kn})`);

  // A modal: the cover's keys rest (Delete, undo, select all); Paste rests; Tab stays inside.
  const n0 = (await CV.state(page)).layers.length;
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete');
  ok((await CV.state(page)).layers.length === n0, 'Select all + Delete do nothing while it is open');
  await page.focus('[data-pv-close]');
  const seen = new Set();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); seen.add(await page.evaluate(() => (document.activeElement.closest('[data-pv]') ? 'in' : 'out:' + (document.activeElement.dataset.k || document.activeElement.tagName)))); }
  ok(seen.size === 1 && seen.has('in'), `Tab stays inside (${[...seen]})`);
  await page.keyboard.press('Escape');
  ok(!(await CV.has(page, '[data-pv]')), 'Escape closes it');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'pv'), 'the focus goes back to Preview final');
  await page.click('[data-k="pv"]');
  await page.click('[data-pv-close]');
  ok(!(await CV.has(page, '[data-pv]')), 'Back to editing closes it');

  /* Hidden and excluded layers are not shown; the count line. */
  const L = JSON.parse(JSON.stringify(band.layers));
  L.find((l) => l.src === 'blurb').hidden = true;
  L.find((l) => l.src === 'pen').noExport = true;
  st.design = designOf(L);
  await CV.open(page);
  await page.click('[data-k="pv"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().pv.painted > 0, null, { timeout: 10000 });
  ok((await CV.txt(page, '[data-pv-note]')) === '2 layers are hidden or set to "Exclude from export", so they are not shown here. Template lines and guides never print.', `count line: ${await CV.txt(page, '[data-pv-note]')}`);
  // The back cover where the blurb was: plain background (no letters).
  const bb = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.src === 'blurb'); const g = kdpCover.geo.geo(E.cover.fmt); return { x: l.x - g.b, y: l.y - g.b, w: l.w, h: kdpCover.textlayout.height(l), W: g.W - 2 * g.b }; });
  const ink = await page.$eval('[data-pv-big]', (c, b) => { const k = c.width / b.W; const d = c.getContext('2d').getImageData(Math.round(b.x * k), Math.round(b.y * k), Math.round(b.w * k), Math.round(b.h * k)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 120) n++; return n; }, bb);
  ok(ink === 0, `the hidden blurb is not drawn (${ink} dark px)`);
  await page.keyboard.press('Escape');
  // One layer: the singular words.
  L.find((l) => l.src === 'pen').noExport = false;
  st.design = designOf(L);
  await CV.open(page);
  await page.click('[data-k="pv"]');
  ok((await CV.txt(page, '[data-pv-note]')).startsWith('1 layer is hidden or set to "Exclude from export"'), '1 layer is …');
  await page.keyboard.press('Escape');

  /* Wide trim 8.5 × 11: kFit (the background above and below), its words. 5.5 × 8.5: already the shape? */
  for (const [trim, words, mode] of [
    ['8.5x11', 'then, because this front is wide, your background color is added above and below to make the Kindle shape (1 : 1.6), so nothing is cut', 'fit'],
    ['5x8', 'already the Kindle shape (1 : 1.6), nothing is trimmed', 'cut']
  ]) {
    const fmt = { trim, pages: 54, paper: 'white' };
    st.book.trim = trim;
    const r = await page.evaluate(([fmt]) => { const b = { title: 'Micro Study Habits for Busy Adult Learners', subtitle: 'How to Keep Up With Your Course After Work, Even on Low-Energy Days', pen: 'Adnan Haroun' }; return kdpCover.layouts.build('band', b, fmt, 1, null); }, [fmt]);
    st.design = Object.assign(designOf(r.layers, fmt), { bg: '#EAD9B8' });
    await CV.open(page);
    await page.click('[data-k="pv"]');
    await page.waitForFunction(() => window.kdpBookSteps[9]._debug().pv.painted > 0, null, { timeout: 10000 });
    const p = await CV.txt(page, '.cv-pv-kcard .cv-pv-p');
    ok(p === `Made from your print front: cut at the trim, ${words}. Keep words inside the safe area and nothing is lost.`, `${trim}: ${p}`);
    const plan = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.kindle.plan(kdpCover.geo.geo(E.cover.fmt), { w: 200, h: 320 }); });
    ok(plan.mode === mode, `${trim}: kindle plan ${plan.mode}`);
    if (mode === 'fit') {
      const top = await px('[data-pv-kindle]', 100, 3);
      ok(Math.abs(top[0] - 0xEA) <= 2 && Math.abs(top[1] - 0xD9) <= 2 && Math.abs(top[2] - 0xB8) <= 2, `kFit: the background color above the front (${top})`);
    }
    await page.keyboard.press('Escape');
  }
  st.book.trim = '6x9';

  /* A picture that arrives after the dialog opened is painted then (the renderBars path). */
  // (t-uploads covers the picture store; here the repaint count rises when the store changes.)
  st.design = designOf(JSON.parse(JSON.stringify(band.layers)));
  await CV.open(page);
  await page.click('[data-k="pv"]');
  const p0 = (await pv()).painted;
  await page.evaluate(() => window.kdpBookSteps[9]._debug().refreshBars());
  ok((await pv()).painted > p0, 'a change while open paints the previews again');

  /* Step D: 44 px click areas, 12 px text or more, the ring. */
  for (const sel of ['[data-pv-close]', '[data-pv-cut="1"]', '[data-pv-cut="0"]', '.cv-pv-export']) {
    const r = await page.$eval(sel, (b) => { const a = getComputedStyle(b, '::after'); return [parseFloat(a.width), parseFloat(a.height)]; });
    ok(r[0] >= 44 && r[1] >= 44, `${sel}: click area ${r.map(Math.round).join(' × ')}`);
  }
  const lab = await page.$eval('.cv-pv-gray', (l) => Math.round(l.getBoundingClientRect().height));
  ok(lab >= 40, `Black and white check: the label is the click area (${lab} px)`);
  const fs = await page.$$eval('.cv-pv *', (a) => a.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
  ok(fs.every((f) => f >= 12), `all text 12 px or more (smallest ${Math.min(...fs)})`);
  await page.focus('[data-pv-cut="0"]');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const ring = await page.$eval('[data-pv-cut="0"]', (b) => { const c = getComputedStyle(b); return [c.outlineStyle, c.outlineWidth, c.outlineOffset]; });
  ok(ring.join(' ') === 'solid 2px 2px', `focus ring: ${ring}`);
  ok(await CV.noScroll(page), '1440: no sideways scroll');

  /* Open at 1440, then the window gets narrower: the preview follows (600 px wide at most, under the head). */
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page);
  await page.click('[data-k="pv"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().pv.painted > 0, null, { timeout: 10000 });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(300);
  const rz = await page.evaluate(() => { const c = document.querySelector('[data-pv-big]').getBoundingClientRect(), d = document.querySelector('[data-pv]').getBoundingClientRect(), h = document.querySelector('[data-book-head]').getBoundingClientRect(); return { w: Math.round(c.width), top: Math.round(d.top - h.bottom), fits: c.right <= innerWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth }; });
  ok(rz.w <= 600 && rz.top === 0 && rz.fits, `1440 → 1024 while open: the preview follows (${JSON.stringify(rz)})`);
  await page.keyboard.press('Escape');

  /* 1024 × 900: 600 px wide at most (design), the side column fits, no sideways scroll. */
  await page.setViewportSize({ width: 1024, height: 900 });
  await CV.open(page);
  await page.click('[data-k="pv"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().pv.painted > 0, null, { timeout: 10000 });
  big = await size('[data-pv-big]');
  ok(big[0] <= 600 && big[0] >= 400, `1024: the cover ${big.join(' × ')} px (600 wide at most)`);
  ok(await CV.noScroll(page) && await page.$eval('.cv-pv-side', (s) => s.getBoundingClientRect().right <= window.innerWidth), '1024: everything fits, no sideways scroll');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
