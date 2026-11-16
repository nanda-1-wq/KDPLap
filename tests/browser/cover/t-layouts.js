// E16 Part 8: the Layouts panel's ready layouts (design 67): the panel and its words, the 13 tiles with their small
// covers (this book's words, drawn by our renderer), a layout applies at once (no question), the 6 s note with Undo
// when it replaced layers (none on an empty cover), Undo takes back only the layout (one step of its own), the
// pressed tile and cover_designs.layout, Blank, Stack with the full title (plan D15), a layout on another size
// (remapped), a picture layout's sample photo (C16, STOP 6 N2 rec), the fonts of a layout not loading.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  const E = (f) => page.evaluate(f);
  const st = () => CV.state(page);
  const toast = () => page.$eval('[data-toast-host]', (h) => h.innerText.replace(/\s+/g, ' ').trim());

  await FIX.band(page);   // built first: it opens another page, which must not happen with a save out
  /* An empty cover: the panel. */
  await CV.open(page, { design: 'empty' });
  ok(await page.$eval('[data-tool="layouts"]', (b) => !b.hasAttribute('aria-disabled') && !b.hasAttribute('data-inert')), 'the Layouts tool is live (no "Comes in Part 8")');
  await page.click('[data-tool="layouts"]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Layouts' && p.dataset.kind === 'layouts'), 'the Layouts panel opens');
  const caps = await CV.all(page, '[data-panel] .cv-cap');
  ok(JSON.stringify(caps) === JSON.stringify(['LAYOUTS', 'MY LAYOUTS', 'SERIES COLORS', 'READY LAYOUTS']), `the 4 headings: ${caps.join(', ')}`);
  ok((await CV.txt(page, '[data-panel] > .cv-help')) === 'Click one and it fills your cover with your title, subtitle and pen name. Changed your mind? Undo brings back what you had.', 'the panel words (design 67)');
  ok((await CV.txt(page, '[data-my-empty]')) === 'Every cover you export is saved here. Use it for your next book or a series.', 'no My layouts: the design words');
  ok(/Layouts follow your trim, page count and paper, so they still fit if those change in 08 Format\./.test(await CV.txt(page, '[data-panel]')), 'the last line');
  const tiles = await page.$$eval('[data-lay]', (a) => a.map((b) => [b.dataset.lay, b.querySelector('.cv-lay-label').textContent, b.querySelector('.cv-lay-note').textContent]));
  ok(tiles.length === 13 && tiles[0][0] === 'blank' && tiles[1].join('|') === 'band|Band|Title on a color band.' && tiles[12].join('|') === 'bold|Bold type|Huge title on bright color.', '13 tiles: Blank first, then the 12 (design words)');
  ok((await page.$$eval('[data-pal]', (a) => a.map((b) => b.textContent.trim()))).join('|') === 'Navy and coral|Forest|Plum|Teal|Brick|Charcoal', 'the 6 series colors');
  // The small covers: the book's shape (6 × 9 → 86 × 129), drawn once the 12 layouts' fonts are in.
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().lay.fonts === true, null, { timeout: 20000 });
  const mini = await E(() => { const c = document.querySelector('canvas[data-mini="band"]'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  ok(mini.w === 86 && mini.h === 129, `a small cover is the front at 6 × 9: ${mini.w} × ${mini.h}`);
  // Band's band is navy across the small cover, with the title in white inside it.
  const px = await E(() => { const c = document.querySelector('canvas[data-mini="band"]'), g = c.getContext('2d'); const d = window.devicePixelRatio || 1; const a = (x, y) => [...g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data]; return { band: a(4, 40), paper: a(4, 120) }; });
  ok(px.band[0] === 0x1F && px.band[1] === 0x3A && px.band[2] === 0x5F && px.paper[0] === 0xF2, `Band's small cover: navy band, cream paper (${px.band} / ${px.paper})`);
  const inked = await E(() => { const c = document.querySelector('canvas[data-mini="stack"]'), g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60) n++; return n; });
  ok(inked > 200, `Stack's small cover has its dark title letters (${inked} px)`);

  /* Apply on an empty cover: at once, no note. */
  await page.click('[data-lay="band"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.length === 5, null, { timeout: 10000 });
  let s = await st();
  ok(s.layers.map((l) => l.src || l.type).join(',') === 'shape,title,subtitle,pen,blurb' && s.bg === '#F2EDE4', 'Band fills the cover with this book\'s words');
  ok(s.layers.find((l) => l.src === 'title').text === FIX.title && s.layers.find((l) => l.src === 'pen').text === FIX.pen, 'the title and the pen name are this book\'s');
  ok(s.layers.find((l) => l.src === 'blurb').text === kdpCoverPlaceholder(), 'no blurb yet: the placeholder words');
  ok((await toast()) === '', 'an empty cover: no note');
  ok(await page.$eval('[data-lay="band"]', (b) => b.getAttribute('aria-pressed') === 'true' && b.classList.contains('is-on')), 'Band is pressed');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.layout === 'band', 'the save carries layout "band"');

  /* Apply over layers: the note with Undo for 6 s; Undo takes back only the layout. */
  await page.click('[data-lay="center"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'center', null, { timeout: 10000 });
  ok((await toast()).startsWith('Center applied. Your old design is one Undo away.'), `the note: ${await toast()}`);
  ok(await page.$eval('.cv-toast', (t) => t.getAttribute('role') === 'status') && await CV.has(page, '[data-toast-undo]'), 'the note is a status with Undo');
  s = await st();
  ok(s.layers.some((l) => l.type === 'shape' && l.kind === 'line') && s.bg === '#F2EDE4', 'Center is on the cover');
  await page.click('[data-toast-undo]');
  s = await st();
  ok(s.layers.length === 5 && s.layers[0].type === 'shape' && s.layers[0].kind !== 'line', 'Undo in the note: Band is back');
  ok((await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'band' && (await toast()) === '', 'the pressed layout is Band again; the note is gone');
  // One Undo more takes back Band itself (an empty cover): each layout is its own step.
  await page.click('[data-k="undo"]');
  ok((await st()).layers.length === 0, 'Undo once more: the empty cover (Band was one step)');
  await page.click('[data-k="redo"]');
  ok((await st()).layers.length === 5, 'Redo: Band');

  /* A change right after a layout is its own step too (the 500 ms window does not merge it). */
  await page.click('[data-lay="stack"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'stack', null, { timeout: 10000 });
  await E(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'pen'); E.setLayer(t.id, { color: '#7A2E2E' }); });
  await page.click('[data-k="undo"]');
  s = await st();
  ok(s.layers.find((l) => l.src === 'pen').color === '#E07A5F' && (await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'stack', 'a color change right after Stack undoes alone');

  /* Stack: the full title (plan D15, STOP 8): 3 words big, the other words their own line under them, then the subtitle. */
  s = await st();
  const stTitle = s.layers.find((l) => l.src === 'title'), stSub = s.layers.find((l) => l.src === 'subtitle');
  ok(stTitle.text === 'MICRO\nSTUDY\nHABITS' && stTitle.font === 'Bebas Neue', `Stack's big title: ${JSON.stringify(stTitle.text)}`);
  const stRest = s.layers.find((l) => l.src === 'titlerest');
  ok(stSub.text === FIX.subtitle, 'the subtitle is its own line, its own words');
  ok(stRest && stRest.text === 'for Busy Adult Learners' && stRest.color === stTitle.color && stRest.font === 'IBM Plex Sans' && stRest.weight === 700 && stRest.x === stTitle.x && stRest.w === stTitle.w, `the rest line: the title's color and box, Plex Sans Bold, ${stRest && stRest.size} pt`);
  const geo = await E(() => { const E = window.kdpBookSteps[9]._debug(), T = kdpCover.textlayout; const L = E.cover.layers; const t = L.find((l) => l.src === 'title'), r = L.find((l) => l.src === 'titlerest'), u = L.find((l) => l.src === 'subtitle');
    return { lines: T.lines(r).length, gapTop: r.y - (t.y + T.height(t)), gapSub: u.y - (r.y + T.height(r)), probs: kdpCover.checks.run(E.cover, { samples: true }).filter((c) => c.sev !== 'tip').length }; });
  ok(geo.lines === 1 && geo.gapTop > 0 && geo.gapSub > 0 && geo.probs === 0, `one line between the big title and the subtitle, with real fonts; no check problem (gaps ${geo.gapTop.toFixed(1)} / ${geo.gapSub.toFixed(1)} px)`);

  /* Note timer: gone after 6 s. */
  await page.click('[data-lay="corner"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'corner', null, { timeout: 10000 });
  ok((await toast()).startsWith('Corner applied.'), 'Corner: the note');
  await page.waitForTimeout(6300);
  ok((await toast()) === '', 'the note goes after 6 s');
  ok(await page.$eval('[data-lay="corner"]', (b) => b.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-lay="stack"]', (b) => b.getAttribute('aria-pressed') === 'false'), 'Corner pressed, Stack not');

  /* Blank: an empty white cover, with the note. */
  await page.click('[data-lay="blank"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'blank', null, { timeout: 10000 });
  s = await st();
  ok(s.layers.length === 0 && s.bg === '#FFFFFF' && (await toast()).startsWith('Blank applied.'), 'Blank: nothing on a white cover, with the note');
  await page.click('[data-toast-x]');
  ok((await toast()) === '', '× closes the note');
  // Any later change closes the note: its Undo is for the layout only.
  await page.click('[data-lay="band"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'band', null, { timeout: 10000 });
  ok((await toast()) === '', 'Band on the empty cover Blank left: no note');
  await page.click('[data-lay="center"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'center', null, { timeout: 10000 });
  ok((await toast()).startsWith('Center applied.'), 'Center over Band: the note');
  await E(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'pen'); E.setLayer(t.id, { size: 13 }); });
  ok((await toast()) === '', 'a change after the layout closes the note');

  /* A picture layout: the sample photo is a Must fix (C16) until replaced. */
  await page.click('[data-lay="picfull"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'picfull', null, { timeout: 10000 });
  const chk = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.checks.run(E.cover, { missing: [], samples: true }).filter((c) => c.code === 'C16').map((c) => c.msg); });
  ok(chk.length === 1 && chk[0] === '"Sample photo (replace it)" is a sample. Replace it with your own picture, or delete it.', `C16: ${chk[0]}`);
  ok(/Fix 1 problem before export\./.test(await CV.txt(page, '.next-note')) && /1 to fix/.test(await CV.txt(page, '[data-k="chk"]')), 'the header and the chip count it');
  // Without the option the pure checks keep the Part 1 rule (the 288 layout cases).
  ok((await page.evaluate(() => kdpCover.checks.run(window.kdpBookSteps[9]._debug().cover, {}).filter((c) => c.code === 'C16').length)) === 0, 'without opt.samples: no C16');

  /* The layout's words follow the book: another title. */
  globalThis.__store.book.title = 'Tiny Habits for Night Owls';
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="layouts"]');
  await page.click('[data-lay="bold"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'bold', null, { timeout: 10000 });
  s = await st();
  ok(s.layers.find((l) => l.src === 'title').text === 'TINY HABITS FOR' && s.layers.find((l) => l.src === 'titlerest').text === 'Night Owls' && s.layers.find((l) => l.src === 'subtitle').text === FIX.subtitle, 'Bold: this book\'s words; the rest line "Night Owls", the subtitle its own (D15)');
  globalThis.__store.book.title = FIX.title;

  /* Another size: a layout is remapped to 8.5 × 11, 120 pages, cream. */
  globalThis.__store.book.trim = '8.5x11'; globalThis.__store.book.paper = 'cream'; globalThis.__store.pdf.page_count = 120;
  globalThis.__store.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { trim: '8.5x11', pages: 120, paper: 'cream' }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await CV.open(page);
  await page.click('[data-tool="layouts"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().lay.fonts === true, null, { timeout: 20000 });
  const big = await E(() => { const c = document.querySelector('canvas[data-mini="band"]'); return Math.round(c.getBoundingClientRect().width); });
  ok(big === Math.round(129 * 8.5 / 11), `8.5 × 11: the small covers are wider (${big} px)`);
  await page.click('[data-lay="band"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'band', null, { timeout: 10000 });
  const fit = await E(() => { const E = window.kdpBookSteps[9]._debug(), g = kdpCover.geo.geo(E.cover.fmt), b = E.cover.layers[0]; return { x: b.x, w: b.w, foldR: g.foldR, W: g.W, probs: kdpCover.checks.run(E.cover, { samples: true }).filter((c) => c.sev === 'error').length }; });
  ok(Math.abs(fit.x - fit.foldR) < 1 && Math.abs(fit.x + fit.w - fit.W) < 1 && fit.probs === 0, `Band at 8.5 × 11: the band spans the front, no Must fix (x ${fit.x.toFixed(1)}, foldR ${fit.foldR.toFixed(1)})`);
  globalThis.__store.book.trim = '6x9'; globalThis.__store.book.paper = 'white'; globalThis.__store.pdf.page_count = FIX.fmt.pages;

  /* A layout's fonts do not load: a clear error, the cover unchanged; then it works. */
  await CV.open(page, { design: 'band' });
  globalThis.__modes.fontsDown = true;
  await page.click('[data-tool="layouts"]');
  await page.waitForTimeout(500);
  ok((await E(() => window.kdpBookSteps[9]._debug().lay.fonts)) === false, 'fonts down: the small covers stay plain paper');
  await page.click('[data-lay="stack"]');
  await page.waitForSelector('.cv-lay-err', { timeout: 10000 });
  ok((await CV.txt(page, '.cv-lay-err')) === 'We couldn’t load the fonts of this layout. Check your connection, then try again.', 'fonts down: the error words');
  ok(await page.$eval('.cv-lay-err', (e) => e.getAttribute('role') === 'alert' && !!e.querySelector('svg')), 'it is an alert with its icon');
  s = await st();
  ok(s.layers.length === 5 && (await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'band', 'the cover is unchanged');
  globalThis.__modes.fontsDown = false;
  await page.click('[data-lay="stack"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'stack', null, { timeout: 10000 });
  ok(!(await CV.has(page, '.cv-lay-err')), 'again with the fonts back: Stack applies, the error goes');

  /* Keyboard: Tab reaches the tiles; Enter applies. Step D: 44 px click areas, the focus ring. */
  await page.focus('[data-lay="framed"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'framed', null, { timeout: 10000 });
  ok(true, 'Enter on a tile applies it');
  const small = await page.$$eval('[data-panel] button, [data-toast-host] button', (a) => a.filter((b) => { const r = b.getBoundingClientRect(); const af = getComputedStyle(b, '::after'); const w = Math.max(r.width, parseFloat(af.width) || 0), h = Math.max(r.height, parseFloat(af.height) || 0); return w < 44 || h < 44; }).map((b) => b.dataset.k));
  ok(small.length === 0, `every button has a 44 px click area${small.length ? ': ' + small.join(', ') : ''}`);
  const ring = await page.$eval('[data-lay="framed"]', (b) => { b.focus(); const cs = getComputedStyle(b); return cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineOffset; });
  ok(ring === 'solid 2px 2px', `the focus ring: ${ring}`);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');

  function kdpCoverPlaceholder() { return 'Your back blurb goes here. Use Book data, Write blurb, to draft it from your book.'; }
};
