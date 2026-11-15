// E16 Part 5: several layers selected (design 65): Shift- and Cmd-click, a box on the cover, Cmd+A; the bar
// (count, Align ×6 to each other / front / back / spine / whole cover, Space across and down from 3, Duplicate,
// Lock all / Unlock all, Delete, Done); the dashed outlines and the group box; drag moves them all; arrows,
// Delete, Escape; undo keeps the selection.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  const st = () => CV.state(page);
  const by = async (src) => (await st()).layers.find((l) => l.src === src);
  const multi = () => page.evaluate(() => window.kdpBookSteps[9]._debug().multi.slice());
  const click = async (src, mod) => { const [x, y] = await CV.center(page, src); if (mod) await page.keyboard.down(mod); await page.mouse.click(x, y); if (mod) await page.keyboard.up(mod); };
  const ids = async (...src) => Promise.all(src.map(async (s) => (await by(s)).id));

  /* Shift-click: 2, then 3. */
  await click('title');
  await click('subtitle', 'Shift');
  let m = await multi();
  ok(m.length === 2 && (await st()).sel === null, 'Shift-click: 2 layers, no single selection');
  ok(await page.$eval('[data-textbar]', (b) => b.getAttribute('aria-label') === 'Several layers selected'), 'the several-selected bar');
  ok((await CV.txt(page, '.cv-multi-n')) === '2 layers selected', '2 layers selected');
  ok(await page.$eval('[data-k="dist-h"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Needs 3 or more layers'), 'Space across: off under 3, with the reason');
  await click('pen', 'Meta');
  m = await multi();
  ok(m.length === 3 && (await CV.txt(page, '.cv-multi-n')) === '3 layers selected', '3 layers selected (Cmd-click)');
  ok(await page.$eval('[data-k="dist-h"]', (b) => !b.hasAttribute('aria-disabled')), 'Space across: on from 3');
  const bar = await CV.txt(page, '[data-textbar]');
  ok(/^3 layers selected Align to each other ▾?.*Space across Space down Duplicate Lock all Delete Done$/.test(bar.replace(/\s+/g, ' ')) || (/Space across/.test(bar) && /Lock all/.test(bar) && /Done/.test(bar)), `bar: ${bar}`);
  const al = await page.$$eval('[data-mact="align"]', (a) => a.map((b) => b.getAttribute('aria-label')));
  ok(al.join('|') === 'Align left|Align centers left to right|Align right|Align top|Align middles top to bottom|Align bottom', 'the 6 align buttons, labelled');
  ok((await page.$$eval('[data-malign-to] option', (a) => a.map((o) => o.textContent))).join('|') === 'each other|front cover|back cover|spine|whole cover', 'to: each other, front cover, back cover, spine, whole cover');

  /* On the cover: a dashed outline each, one box around them, no handles. */
  ok((await page.$$('.cv-hit.is-multi')).length === 3 && await CV.has(page, '.cv-group') && !(await CV.has(page, '[data-handle]')), 'dashed outlines, the group box, no handles');
  ok(/Selected: 3 layers\./.test(await page.$eval('[data-canvas]', (c) => c.getAttribute('aria-label'))), 'the canvas names 3 layers');
  await click('pen', 'Meta');
  ok((await multi()).length === 2, 'Cmd-click again takes one away');
  await click('pen', 'Shift');

  /* Align: the design's alignMulti (kdpCover.model.align). */
  const three = await ids('title', 'subtitle', 'pen');
  for (const [how, to] of [['left', 'sel'], ['right', 'front'], ['hcenter', 'spine'], ['top', 'back'], ['bottom', 'cover'], ['vcenter', 'sel']]) {
    const before = (await st()).layers;
    await page.selectOption('[data-malign-to]', to);
    await page.click(`[data-mact="align"][data-v="${how}"]`);
    const after = (await st()).layers;
    const want = await page.evaluate(({ before, three, how, to }) => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.model.align(before, three, how, to, kdpCover.geo.geo(E.cover.fmt), (l) => kdpCover.textlayout.height(l)); }, { before, three, how, to });
    ok(JSON.stringify(after) === JSON.stringify(want), `Align ${how} to ${to}`);
  }
  ok((await multi()).length === 3, 'aligning keeps the selection');

  /* Space across and down: the design's distribute (kdpCover.model.distribute), on the design's places. */
  await CV.open(page, { design: 'band' });
  await page.evaluate((three) => window.kdpBookSteps[9]._debug().selectIds(three), three);
  for (const axis of ['v', 'h']) {
    const before = (await st()).layers;
    await page.click(`[data-mact="dist"][data-v="${axis}"]`);
    const want = await page.evaluate(({ before, three, axis }) => kdpCover.model.distribute(before, three, axis, (l) => kdpCover.textlayout.height(l)), { before, three, axis });
    ok(JSON.stringify((await st()).layers) === JSON.stringify(want), `Space ${axis === 'v' ? 'down' : 'across'}`);
  }
  const boxes = await page.evaluate((three) => { const E = window.kdpBookSteps[9]._debug(); return E.cover.layers.filter((l) => three.includes(l.id)).map((l) => kdpCover.model.bbox(l, (q) => kdpCover.textlayout.height(q))).sort((a, b) => a.y - b.y); }, three);
  const g1 = boxes[1].y - (boxes[0].y + boxes[0].h), g2 = boxes[2].y - (boxes[1].y + boxes[1].h);
  ok(Math.abs(g1 - g2) < 1e-6, `Space down: equal gaps (${g1.toFixed(2)}, ${g2.toFixed(2)})`);
  ok((await multi()).length === 3, 'spacing keeps the selection');
  await CV.open(page, { design: 'band' });
  await page.evaluate((three) => window.kdpBookSteps[9]._debug().selectIds(three), three);

  /* Drag one: all move; one undo step; undo keeps the selection. */
  let before = (await st()).layers;
  const [px, py] = await CV.center(page, 'subtitle');
  await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px + 20, py + 10, { steps: 5 }); await page.mouse.move(px + 40, py + 30, { steps: 5 }); await page.mouse.up();
  let after = (await st()).layers;
  const z = (await st()).z;
  const moved = three.map((id) => { const a = before.find((l) => l.id === id), b = after.find((l) => l.id === id); return [b.x - a.x, b.y - a.y]; });
  ok(moved.every((d) => Math.abs(d[0] - 40 / z) < 0.6 && Math.abs(d[1] - 30 / z) < 0.6), `drag one: all three move by the same (${moved.map((d) => d.map((n) => n.toFixed(1)).join(',')).join(' ')})`);
  ok((await multi()).length === 3, 'still 3 selected after the drag');
  await page.click('[data-k="undo"]');
  after = (await st()).layers;
  ok(three.every((id) => before.find((l) => l.id === id).x === after.find((l) => l.id === id).x), 'one Undo takes the whole drag back');
  ok((await multi()).length === 3, 'undo keeps the selection');

  /* Arrows nudge all; a locked one stays. */
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(600);   // undo joins changes less than 500 ms apart (the design's window)
  before = (await st()).layers;
  await page.keyboard.press('Shift+ArrowRight');
  after = (await st()).layers;
  ok(three.every((id) => after.find((l) => l.id === id).x === before.find((l) => l.id === id).x + 10), 'Shift + Arrow: all 10 px');

  /* Lock all / Unlock all. */
  await page.click('[data-mact="lock"]');
  ok((await st()).layers.filter((l) => three.includes(l.id)).every((l) => l.lock), 'Lock all');
  ok((await CV.txt(page, '[data-k="m-lock"]')) === 'Unlock all', 'then Unlock all');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  before = (await st()).layers;
  await page.keyboard.press('ArrowRight');
  ok(JSON.stringify((await st()).layers) === JSON.stringify(before), 'locked layers do not move');
  await page.click('[data-mact="lock"]');
  ok((await st()).layers.filter((l) => three.includes(l.id)).every((l) => !l.lock), 'Unlock all');

  /* Duplicate: copies on top, 14 px down and right, selected. */
  const n0 = (await st()).layers.length;
  await page.click('[data-mact="dup"]');
  let s = await st();
  m = await multi();
  ok(s.layers.length === n0 + 3 && m.length === 3 && m.every((id) => !three.includes(id)), 'Duplicate: 3 copies, the copies selected');
  const cp = s.layers.slice(-3), src = s.layers.filter((l) => three.includes(l.id));
  ok(cp.every((c, i) => c.x === src[i].x + 14 && c.y === src[i].y + 14 && c.src === null && c.lock === false), 'copies: 14 px down and right, not tied to the book');
  /* Delete. */
  await page.waitForTimeout(600);
  await page.click('[data-mact="del"]');
  s = await st();
  ok(s.layers.length === n0 && (await multi()).length === 0 && s.sel === null, 'Delete removes all three');
  ok(await page.$eval('[data-textbar]', (b) => b.hidden), 'no bar');
  await page.waitForTimeout(600);
  await page.click('[data-k="undo"]');
  ok((await st()).layers.length === n0 + 3, 'Undo brings them back');

  /* Done; Escape. */
  await page.evaluate((three) => window.kdpBookSteps[9]._debug().selectIds(three), three);
  await page.click('[data-mact="done"]');
  ok((await multi()).length === 0 && await page.$eval('[data-textbar]', (b) => b.hidden), 'Done ends it');
  await page.evaluate((three) => window.kdpBookSteps[9]._debug().selectIds(three), three);
  await page.mouse.move(5, 5);
  await page.focus('[data-canvas]').catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Escape');
  ok((await multi()).length === 0, 'Escape ends it');

  /* Box select on the cover; a drag on the gray pans and selects nothing. */
  await CV.open(page, { design: 'band' });
  // From the bare white under the pen name up to the subtitle: it touches the pen name and the subtitle.
  const pn = await by('pen'), sub = await by('subtitle');
  const pnH = await page.evaluate((l) => kdpCover.textlayout.height(l), pn);
  const A = [pn.x + pn.w + 4, pn.y + pnH + 10], B = [sub.x + 40, sub.y + 10];
  const a = await CV.pt(page, A[0], A[1]), b = await CV.pt(page, B[0], B[1]);
  await page.mouse.move(a[0], a[1]); await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 4 });
  ok(await page.$eval('[data-marquee]', (e) => !e.hidden && e.getBoundingClientRect().width > 10), 'the box shows while dragging');
  await page.mouse.move(b[0], b[1], { steps: 4 }); await page.mouse.up();
  m = await multi();
  const want = await page.evaluate(({ a, b }) => { const E = window.kdpBookSteps[9]._debug(); const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    return E.cover.layers.filter((l) => { const q = kdpCover.model.bbox(l, (x) => kdpCover.textlayout.height(x)); return q.x < x1 && q.x + q.w > x0 && q.y < y1 && q.y + q.h > y0; }).map((l) => l.id); }, { a: A, b: B });
  ok(m.length >= 2 && JSON.stringify(m.slice().sort()) === JSON.stringify(want.slice().sort()), `a box selects what it touches (${m.length})`);
  ok(await page.$eval('[data-marquee]', (e) => e.hidden), 'the box goes away');
  const v0 = await st();
  const gray = await page.evaluate(() => { const r = document.querySelector('[data-ws]').getBoundingClientRect(); return [r.left + 8, r.bottom - 8]; });
  await page.mouse.move(gray[0], gray[1]); await page.mouse.down(); await page.mouse.move(gray[0] + 30, gray[1] - 20, { steps: 5 }); await page.mouse.up();
  const v1 = await st();
  ok(v1.px !== v0.px && (await multi()).length === 0, 'a drag on the gray pans and selects nothing');

  /* Cmd+A: every layer that is not locked or hidden. */
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.setLayer(E.cover.layers[0].id, { lock: true }); });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Meta+a');
  m = await multi();
  ok(m.length === 4 && !m.includes((await st()).layers[0].id), `Cmd+A: the 4 unlocked layers (${m.length})`);
  /* Shift+Enter on a layer box adds it (keyboard). */
  await page.keyboard.press('Escape');
  const h1 = await by('title'), h2 = await by('pen');
  await page.focus(`[data-hit="${h1.id}"]`); await page.keyboard.press('Enter');
  await page.focus(`[data-hit="${h2.id}"]`); await page.keyboard.press('Shift+Enter');
  ok((await multi()).length === 2, 'Shift+Enter on a layer box adds it');
  await page.keyboard.press('Delete');
  ok(!(await by('title')) && !(await by('pen')), 'the Delete key deletes all selected');

  /* The caps (0030: 200 layers): an add or a duplicate past them is refused with a plain note; nothing is saved past them. */
  const many = await page.evaluate(() => Array.from({ length: 199 }, (_, i) => kdpCover.model.shapeLayer(i + 1, { x: 40 + (i % 20) * 30, y: 40 + Math.floor(i / 20) * 30, w: 20, h: 20 })));
  globalThis.__store.design.layers = many;
  await CV.open(page);
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.selectIds([E.cover.layers[0].id, E.cover.layers[1].id]); });
  await page.click('[data-mact="dup"]');
  ok((await st()).layers.length === 199, 'duplicating 2 at 199 layers: refused');
  ok(await page.$eval('[data-capnote]', (n) => !n.hidden && n.getAttribute('role') === 'status' && /The cover is full: it holds 200 layers at most\. Delete a layer, then add again\./.test(n.textContent) && !!n.querySelector('svg')), 'the note says why, with its icon');
  await page.click('[data-mact="done"]');
  await page.click('[data-tool="shapes"]');
  await page.click('[data-add-shape="rect"]');
  ok((await st()).layers.length === 200 && await page.$eval('[data-capnote]', (n) => n.hidden), 'one more fits (200); the note goes');
  await page.click('[data-add-shape="ellipse"]');
  ok((await st()).layers.length === 200 && await page.$eval('[data-capnote]', (n) => !n.hidden), 'the 201st is refused');
  await page.click('[data-cap-x]');
  ok(await page.$eval('[data-capnote]', (n) => n.hidden), '× closes the note');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.layers.length === 200, 'the save holds 200 layers');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
