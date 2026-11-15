// E16 Part 4: undo and redo (plan §3, design rule): 50 steps of { layers, bg }, a drag or a slider is one step
// (500 ms window), Cmd/Ctrl+Z, Shift+Cmd+Z, Ctrl+Y, the buttons; an undo saves too.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  const dis = (k) => page.$eval(`[data-k="${k}"]`, (b) => b.getAttribute('aria-disabled') === 'true');
  ok(await dis('undo') && await dis('redo'), 'nothing to undo or redo on open');
  const t0 = await CV.layer(page, 'title');

  /* One drag = one step. */
  let [x, y] = await CV.center(page, 'title');
  await page.mouse.click(x, y);
  [x, y] = await CV.center(page, 'title');
  await page.uncheck('[data-k="snap"]');
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x + i * 6, y + i * 3); await page.waitForTimeout(80); }
  await page.mouse.up();
  const t1 = await CV.layer(page, 'title');
  ok(t1.x !== t0.x, 'the drag moved the title');
  ok(!(await dis('undo')) && await dis('redo'), 'Undo turns on');
  await page.click('[data-k="undo"]');
  let t = await CV.layer(page, 'title');
  ok(t.x === t0.x && t.y === t0.y, 'one Undo takes the whole drag back');
  ok(await dis('undo') && !(await dis('redo')), 'Redo turns on');
  await page.click('[data-k="redo"]');
  t = await CV.layer(page, 'title');
  ok(t.x === t1.x && t.y === t1.y, 'Redo puts it back');

  /* Keys. */
  await page.mouse.click(...(await CV.pt(page, 30, 40)));
  await page.keyboard.press('ControlOrMeta+z');
  ok((await CV.layer(page, 'title')).x === t0.x, 'Cmd/Ctrl+Z undoes');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  ok((await CV.layer(page, 'title')).x === t1.x, 'Shift+Cmd/Ctrl+Z redoes');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Control+y');
  ok((await CV.layer(page, 'title')).x === t1.x, 'Ctrl+Y redoes');

  /* Separate changes (over 500 ms apart) are separate steps; a new change clears Redo. */
  const id = t1.id;
  await page.focus(`[data-hit="${id}"]`); await page.keyboard.press('Enter');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight']) { await page.keyboard.press(k); await page.waitForTimeout(560); }
  t = await CV.layer(page, 'title');
  ok(t.x === t1.x + 3, 'three nudges');
  await page.keyboard.press('ControlOrMeta+z');
  ok((await CV.layer(page, 'title')).x === t1.x + 2, 'Undo takes one nudge back');
  await page.keyboard.press('ArrowDown');
  ok(await dis('redo'), 'a new change clears Redo');
  // fast nudges (within 500 ms of each other) are one step
  await page.waitForTimeout(560);
  const tb = await CV.layer(page, 'title');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ControlOrMeta+z');
  ok((await CV.layer(page, 'title')).x === tb.x, 'five quick nudges undo as one');

  /* The background is in the history. */
  await page.waitForTimeout(560);
  await page.click('[data-k="bg"]');
  await page.click('.cv-pop-bg .cv-sws [data-hex="#FFFFFF"]');
  ok((await CV.state(page)).bg === '#FFFFFF', 'background white');
  await page.keyboard.press('Escape');
  await page.click('[data-k="undo"]');
  ok((await CV.state(page)).bg === '#F2EDE4', 'Undo brings the cream background back');

  /* An added layer, undone: the selection goes with it. A deleted layer comes back. */
  await page.waitForTimeout(560);
  await page.click('[data-add-text="heading"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.length === 6, null, { timeout: 8000 });
  await page.click('[data-k="undo"]');
  let s = await CV.state(page);
  ok(s.layers.length === 5 && s.sel === null, 'Undo removes the new heading and its selection');
  await page.waitForTimeout(560);
  const pen = await CV.layer(page, 'pen');
  await page.focus(`[data-hit="${pen.id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('Delete');
  ok(!(await CV.layer(page, 'pen')), 'pen name deleted');
  await page.keyboard.press('ControlOrMeta+z');
  ok(!!(await CV.layer(page, 'pen')), 'Undo brings it back');

  /* 50 steps at most. */
  // 60 steps straight into the history (each more than 500 ms apart is too slow for a test: a fresh history
  // with no window shows the cap; the window itself is checked above).
  const size = await page.evaluate(() => {
    let t = 0;
    const h = kdpCover.history.create({ now: () => (t += 600) });
    for (let i = 0; i < 60; i++) h.change({ layers: [i], bg: '#FFFFFF' }, null);
    return h.size().past;
  });
  ok(size === 50, `history keeps at most 50 (${size})`);

  /* An undo is saved like any change. */
  await CV.settled(page, 'saved');
  const before = globalThis.__store.saves;
  await page.waitForTimeout(560);
  await page.keyboard.press('ControlOrMeta+z');
  await CV.settled(page, 'saved');
  ok(globalThis.__store.saves > before, 'Undo saves');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
