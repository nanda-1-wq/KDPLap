// E16 Part 4: text (design 58 Text panel, design 59 text bar): presets, From your book, in-place editing,
// size, align, capitals, opacity, Arrange, duplicate, lock, delete, arrow nudge.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: null });
  const fcx = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.geo.geo(E.cover.fmt).frontCX; });
  const last = async () => { const s = await CV.state(page); return s.layers[s.layers.length - 1]; };

  /* Presets: 36, 20 and 12 pt, centered on the front, selected, the y step of the design. */
  const want = { heading: ['Your heading', 'Source Serif 4', 36, 700, 340], sub: ['Your subheading', 'IBM Plex Sans', 20, 600, 320], body: ['Your text', 'IBM Plex Sans', 12, 400, 300] };
  let n = 0;
  for (const k of ['heading', 'sub', 'body']) {
    await page.click(`[data-add-text="${k}"]`);
    await page.waitForFunction((c) => window.kdpBookSteps[9]._debug().cover.layers.length === c, n + 1, { timeout: 8000 });
    const l = await last(), w = want[k];
    ok(l.text === w[0] && l.font === w[1] && l.size === w[2] && l.weight === w[3] && l.w === w[4], `${k}: ${l.text}, ${l.font} ${l.weight}, ${l.size} pt, ${l.w} px`);
    ok(Math.abs(l.x + l.w / 2 - fcx) < 1e-6 && l.y === 230 + n * 18 && l.color === '#1C1C1A' && l.align === 'center', `${k}: centered on the front at y ${l.y}`);
    ok((await CV.state(page)).sel === l.id, `${k}: selected`);
    n++;
  }
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-hit]')), 'focus goes to the new layer\'s box');

  /* From your book: the book's own words; then "✓ On the cover". */
  await page.click('[data-add-book="title"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'title'), null, { timeout: 8000 });
  let t = await CV.layer(page, 'title');
  ok(t.text === FIX.title && t.font === 'Source Serif 4' && t.size === 34 && t.weight === 700 && t.y === 110 && t.w === 360, 'Add title: the 04 title, Source Serif 4 Bold 34 pt');
  await page.click('[data-add-book="pen"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'pen'), null, { timeout: 8000 });
  const pen = await CV.layer(page, 'pen');
  ok(pen.text === FIX.pen && pen.caps === true && pen.ls === 0.12 && pen.weight === 600, 'Add pen name: capitals, letter spacing 0.12, Semibold');
  const rows = await CV.all(page, '.cv-bookrow');
  ok(rows[0] === 'Title ✓ On the cover' && rows[1] === 'Subtitle Add' && rows[2] === 'Pen name ✓ On the cover', `From your book rows: ${rows.slice(0, 3).join(' | ')}`);
  ok((await CV.txt(page, '[data-next-note]')) === 'Fix 1 problem before export.', `header: Fix 1 problem before export. (${await CV.txt(page, '[data-next-note]')})`);
  await page.click('[data-add-book="subtitle"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'subtitle'), null, { timeout: 8000 });
  ok((await CV.txt(page, '[data-next-note]')) !== 'Fix 1 problem before export.', 'all three on: the reason line moves on');
  // a book without a subtitle: Add is off with the reason
  st.book.subtitle = null;
  st.design.layers = st.design.layers.filter((l) => l.src !== 'subtitle');
  await CV.open(page);
  ok(await page.$eval('[data-add-book="subtitle"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'This book has no subtitle in 04 Title.'), 'no subtitle in 04: Add off, with the reason');
  st.book.subtitle = FIX.subtitle;

  /* In place: double-click types; the canvas leaves the layer to the text box; Esc ends. */
  await CV.open(page, { design: 'band' });
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  [x, y] = await CV.center(page, 'title');
  await page.mouse.dblclick(x, y);
  await page.waitForSelector('[data-edit]', { timeout: 4000 });
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-edit]')), 'double-click: a text box, focused');
  ok(await page.$eval('[data-edit]', (e) => e.value === window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.src === 'title').text), 'the box holds the text');
  ok(!(await page.$('[data-handle]')), 'no handles while typing');
  ok(await page.$eval('[data-edit]', (e) => e.selectionStart === e.value.length), 'the caret starts at the end');
  await page.keyboard.type(' Now');
  t = await CV.layer(page, 'title');
  ok(t.text === FIX.title + ' Now', `typing changes the layer (${t.text})`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-edit]')), 'the box keeps focus while typing');
  await page.keyboard.press('Escape');
  ok(!(await page.$('[data-edit]')) && (await CV.state(page)).editing === null, 'Esc ends typing');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-hit]')), 'focus back on the layer box');
  await page.click('[data-act="edit"]');
  ok(!!(await page.$('[data-edit]')), 'the pencil button types too');
  await page.mouse.click(...(await CV.pt(page, 30, 40)));
  ok(!(await page.$('[data-edit]')) && (await CV.state(page)).sel === null, 'a click elsewhere ends typing and deselects');

  /* The text bar on the title. */
  await CV.open(page, { design: 'band' });
  [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  const bar = await CV.txt(page, '[data-textbar]');
  ok(/Source Serif 4 ▾/.test(bar) && /34 pt/.test(bar) && /#FFFFFF/.test(bar) && /Effects/.test(bar) && /100%/.test(bar) && /Arrange ▾/.test(bar), `text bar: ${bar.slice(0, 120)}`);
  ok(await page.$eval('[data-k="fx"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Comes in Part 5'), 'Effects: inert, Comes in Part 5');
  ok(await page.$eval('[data-k="ac"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Align center pressed');
  await page.click('[data-k="size-up"]');
  ok((await CV.layer(page, 'title')).size === 36, 'size + from 34: 36 (2 pt steps from 24)');
  await page.click('[data-k="size-down"]'); await page.click('[data-k="size-down"]');
  ok((await CV.layer(page, 'title')).size === 32, 'size − twice: 32');
  await page.click('[data-k="al"]');
  ok((await CV.layer(page, 'title')).align === 'left' && await page.$eval('[data-k="al"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Align left');
  await page.click('[data-k="caps"]');
  t = await CV.layer(page, 'title');
  ok(t.caps === true && t.ls === 0.12, 'Capitals on: letter spacing 0.12');
  await page.click('[data-k="caps"]');
  t = await CV.layer(page, 'title');
  ok(t.caps === false && t.ls === 0, 'Capitals off: letter spacing 0');
  await page.click('[data-k="op"]');
  ok(!!(await page.$('.cv-pop-op')), 'Opacity opens its popover');
  await page.fill('[data-act="op-range"]', '60');
  await page.dispatchEvent('[data-act="op-range"]', 'input');
  ok((await CV.layer(page, 'title')).op === 60 && /60%/.test(await CV.txt(page, '[data-k="op"]')), 'Opacity 60: the layer and the button');
  ok(/merges see-through parts/.test(await CV.txt(page, '.cv-pop-op')), 'the opacity note');
  await page.keyboard.press('Escape');
  ok(!(await page.$('.cv-pop-op')) && await page.evaluate(() => document.activeElement.dataset.k === 'op'), 'Esc closes it, focus on its button');

  /* Arrange: the title is in front of the band; Send backward jumps past the band it covers. */
  const order = async () => (await CV.state(page)).layers.map((l) => l.src || l.type);
  ok((await order()).join() === 'shape,title,subtitle,pen,blurb', `order: ${await order()}`);
  await page.click('[data-k="arr"]');
  ok((await CV.all(page, '.cv-pop-arr [role="menuitem"]')).join('|') === 'Bring to front|Bring forward|Send backward|Send to back', 'Arrange: the 4 items');
  await page.click('[data-k="a-bwd"]');
  ok((await order()).join() === 'title,shape,subtitle,pen,blurb', `Send backward: past the band (${await order()})`);
  await page.click('[data-k="arr"]'); await page.click('[data-k="a-front"]');
  ok((await order()).join() === 'shape,subtitle,pen,blurb,title', 'Bring to front');

  /* Duplicate, lock, delete. */
  const id0 = (await CV.state(page)).sel;
  await page.click('[data-k="dup"]');
  const s1 = await CV.state(page);
  const copy = s1.layers.find((l) => l.id === s1.sel);
  ok(s1.layers.length === 6 && copy.id !== id0 && copy.src === null && copy.text === FIX.title, 'Duplicate: a copy, not tied to the book, selected');
  const orig = s1.layers.find((l) => l.id === id0);
  ok(copy.x === orig.x + 14 && copy.y === orig.y + 14, 'the copy sits 14 px down and right');
  await page.click('[data-k="lock"]');
  ok((await CV.state(page)).layers.find((l) => l.id === copy.id).lock === true && !(await page.$('[data-handle]')), 'Lock: no handles');
  ok((await CV.txt(page, '.cv-tag')) === 'Locked' && await page.$eval('[data-k="lock"]', (b) => b.getAttribute('aria-label') === 'Unlock' && b.getAttribute('aria-pressed') === 'true'), 'the Locked tag; the button says Unlock');
  const before = (await CV.state(page)).layers.find((l) => l.id === copy.id);
  await page.focus(`[data-hit="${copy.id}"]`);
  await page.keyboard.press('ArrowRight');
  ok((await CV.state(page)).layers.find((l) => l.id === copy.id).x === before.x, 'a locked layer does not nudge');
  await page.click('[data-k="lock"]');
  await page.click('[data-k="del"]');
  const s2 = await CV.state(page);
  ok(s2.layers.length === 5 && !s2.layers.some((l) => l.id === copy.id) && s2.sel === null, 'Delete removes it');

  /* Keyboard: arrows nudge 1 px, Shift 10 px; Delete removes; Esc deselects. */
  const pen0 = await CV.layer(page, 'pen');
  await page.focus(`[data-hit="${pen0.id}"]`);
  await page.keyboard.press('Enter');
  ok((await CV.state(page)).sel === pen0.id, 'Enter on a layer box selects it');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  let p1 = await CV.layer(page, 'pen');
  ok(p1.x === pen0.x + 1 && p1.y === pen0.y + 1, 'arrows: 1 px');
  await page.keyboard.press('Shift+ArrowLeft');
  p1 = await CV.layer(page, 'pen');
  ok(p1.x === pen0.x - 9, 'Shift + arrow: 10 px');
  await page.keyboard.press('Escape');
  ok((await CV.state(page)).sel === null && await page.evaluate((id) => document.activeElement.dataset.hit === String(id), pen0.id), 'Esc deselects, focus stays on the box');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  ok(!(await CV.layer(page, 'pen')), 'Delete removes the selected layer');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
