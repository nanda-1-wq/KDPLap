// E16 Part 5: the Layers panel (design 66): rows front first with the type mark and name, select, Shift-click,
// eye (hidden layers leave the cover and the files), lock, the ⋮ menu to the right of the panel (every item,
// keyboard, Escape, a click outside), rename (menu, double-click, F2; Enter, Escape, empty = the automatic name),
// drag the grip to reorder and the keyboard reorder, the fixed Background row, keyboard reach on the rows.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'empty' });
  const st = () => CV.state(page);
  const rowIds = () => page.$$eval('[data-row]', (a) => a.map((r) => r.dataset.row));
  const name = (id) => CV.txt(page, `[data-pick="${id}"]`);

  /* Empty. */
  await page.click('[data-tool="layers"]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Layers'), 'Layers opens the Layers panel');
  ok((await CV.txt(page, '.cv-lcount')) === '0 layers' && /Nothing on the cover yet\. Add text, images or shapes, and they show here\./.test(await CV.txt(page, '[data-panel]')), 'empty: 0 layers and the note');
  ok(/Background/.test(await CV.txt(page, '.cv-lrow-bg')), 'the Background row is there');

  /* The design's book: 5 rows, front first. */
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layers"]');
  let s = await st();
  ok((await CV.txt(page, '.cv-lcount')) === '5 layers' && (await CV.txt(page, '.cv-lnote')) === 'Top of the list = in front', '5 layers, "Top of the list = in front"');
  ok(JSON.stringify(await rowIds()) === JSON.stringify(s.layers.map((l) => String(l.id)).reverse()), 'rows are front first');
  const names = await page.$$eval('[data-pick]', (a) => a.map((b) => b.textContent));
  const want = await page.evaluate(() => window.kdpBookSteps[9]._debug().cover.layers.slice().reverse().map((l) => kdpCover.names.layerName(l)));
  ok(JSON.stringify(names) === JSON.stringify(want), `names: ${names.join(' | ').slice(0, 90)}`);
  ok((await page.$$('.cv-lr-t')).length === 4 && (await page.$$('.cv-lr-sh svg')).length === 1, 'type marks: T for text, the shape\'s own drawing');
  ok(await page.$eval('[role="list"].cv-lrows', (l) => l.getAttribute('aria-label') === 'Layers, front first'), 'the list is labelled');
  ok((await CV.txt(page, '[data-panel] > .cv-help')) === 'Click a row to select. Shift-click for several. Double-click a name to rename. Hidden layers are left out of your files.', 'the panel help');

  /* Select; Shift-click; the row and the cover agree. */
  const title = s.layers.find((l) => l.src === 'title'), pen = s.layers.find((l) => l.src === 'pen'), band = s.layers[0];
  await page.click(`[data-pick="${title.id}"]`);
  s = await st();
  ok(s.sel === title.id && await page.$eval(`[data-row="${title.id}"]`, (r) => r.classList.contains('is-sel')), 'click a row: selected (row and cover)');
  ok(await page.$eval('[data-textbar]', (b) => !b.hidden && b.getAttribute('aria-label') === 'Selected text'), 'the text bar shows');
  await page.click(`[data-row="${pen.id}"] .cv-lr-t`, { modifiers: ['Shift'] });
  ok((await page.evaluate(() => window.kdpBookSteps[9]._debug().multi.length)) === 2, 'Shift-click a row: 2 selected');
  ok((await page.$$('.cv-lrow.is-sel')).length === 2, 'both rows marked');
  await page.click(`[data-pick="${pen.id}"]`);
  ok((await st()).sel === pen.id, 'a plain click: that one only');

  /* Eye: hidden leaves the cover (and the files); lock. */
  await page.click(`[data-eye="${band.id}"]`);
  let l = (await st()).layers[0];
  ok(l.hidden === true && await page.$eval(`[data-row="${band.id}"]`, (r) => r.classList.contains('is-hidden')), 'eye: hidden, the row dimmed');
  ok(!(await CV.has(page, `[data-hit="${band.id}"]`)), 'a hidden layer has no box on the cover');
  ok(await page.$eval(`[data-eye="${band.id}"]`, (b) => b.getAttribute('aria-label') === 'Show Rectangle'), 'the eye says Show Rectangle');
  const printable = await page.evaluate(() => kdpCover.flatten.printable(window.kdpBookSteps[9]._debug().cover.layers).length);
  ok(printable === 4, 'a hidden layer is left out of the files');
  await page.click(`[data-eye="${band.id}"]`);
  ok(!(await st()).layers[0].hidden, 'eye again: shown');
  await page.click(`[data-lk="${band.id}"]`);
  ok((await st()).layers[0].lock === true && await page.$eval(`[data-lk="${band.id}"]`, (b) => b.getAttribute('aria-label') === 'Unlock Rectangle'), 'lock, "Unlock Rectangle"');
  await page.click(`[data-lk="${band.id}"]`);

  /* The ⋮ menu: to the right of the panel, every item, keyboard. */
  await page.click(`[data-lmenu="${title.id}"]`);
  ok(await CV.has(page, '[data-lmenu-pop][role="menu"]'), '⋮ opens the menu');
  const items = await page.$$eval('[data-lmenu-pop] [role="menuitem"]', (a) => a.map((b) => b.textContent));
  ok(items.join('|') === 'Rename|Lock (now unlocked)|Hide|Duplicate|Bring to front|Bring forward|Send backward|Send to back|Delete', `items: ${items.join(', ')}`);
  const geo = await page.evaluate((id) => { const m = document.querySelector('[data-lmenu-pop]').getBoundingClientRect(), p = document.querySelector('[data-panel]').getBoundingClientRect(), b = document.querySelector(`[data-lmenu="${id}"]`).getBoundingClientRect(); return [m.left, p.right, b.right, m.width, getComputedStyle(document.querySelector('[data-lmenu-pop] .cv-mi-del')).color]; }, title.id);
  ok(geo[0] >= geo[1] && Math.abs(geo[0] - geo[2] - 22) < 1 && geo[3] === 210, `it opens to the right of the panel (left ${Math.round(geo[0])}, panel ${Math.round(geo[1])}), 210 px`);
  ok(geo[4] === 'rgb(180, 35, 24)', 'Delete is red text');
  ok(await page.$eval(`[data-lmenu="${title.id}"]`, (b) => b.getAttribute('aria-expanded') === 'true'), '⋮ aria-expanded');
  ok(await page.evaluate(() => document.activeElement.textContent === 'Rename'), 'focus on the first item');
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => document.activeElement.textContent === 'Lock (now unlocked)'), 'Arrow down moves in the menu');
  await page.keyboard.press('Escape');
  ok(!(await CV.has(page, '[data-lmenu-pop]')) && await page.evaluate((id) => document.activeElement.dataset.lmenu === String(id), title.id), 'Escape closes, focus back on ⋮');
  await page.click(`[data-lmenu="${title.id}"]`);
  await page.mouse.click(1300, 860);
  ok(!(await CV.has(page, '[data-lmenu-pop]')), 'a click outside closes it');
  const act = async (a) => { await page.click(`[data-lmenu="${title.id}"]`); await page.click(`[data-lm="${a}"]`); };
  await act('lock');
  ok((await st()).layers.find((x) => x.id === title.id).lock, 'Lock');
  await act('lock');
  await act('hide');
  ok((await st()).layers.find((x) => x.id === title.id).hidden, 'Hide');
  await act('hide');
  await act('back');
  ok((await st()).layers[0].id === title.id, 'Send to back');
  await act('front');
  s = await st();
  ok(s.layers[s.layers.length - 1].id === title.id && (await rowIds())[0] === String(title.id), 'Bring to front: first row');
  await act('dup');
  s = await st();
  ok(s.layers.length === 6 && s.sel === s.layers[s.layers.length - 1].id && s.layers[5].x === title.x + 14, 'Duplicate: the copy selected');
  const copy = s.sel;
  await page.click(`[data-lmenu="${copy}"]`); await page.click('[data-lm="del"]');
  ok((await st()).layers.length === 5, 'Delete');

  /* Rename: the menu, Enter; Escape keeps the old; empty = the automatic name; double-click; F2. */
  await act('rename');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-rename]')), 'Rename: a text box, focused');
  await page.fill(`[data-rename="${title.id}"]`, 'Main title');
  await page.keyboard.press('Enter');
  ok((await st()).layers.find((x) => x.id === title.id).label === 'Main title' && (await name(title.id)) === 'Main title', 'Enter: renamed');
  ok(await page.evaluate((id) => document.activeElement.dataset.pick === String(id), title.id), 'focus back on the row');
  ok(/Text: Main title/.test(await page.$eval(`[data-hit="${title.id}"]`, (b) => b.getAttribute('aria-label'))), 'the cover box uses the new name');
  await page.dblclick(`[data-pick="${title.id}"]`);
  await page.fill(`[data-rename="${title.id}"]`, 'Nope');
  await page.keyboard.press('Escape');
  ok((await name(title.id)) === 'Main title', 'Escape keeps the old name');
  await page.focus(`[data-pick="${title.id}"]`); await page.keyboard.press('F2');
  await page.fill(`[data-rename="${title.id}"]`, '  ');
  await page.keyboard.press('Enter');
  const auto = await page.evaluate((id) => { const l = window.kdpBookSteps[9]._debug().cover.layers.find((x) => x.id === id); return 'label' in l ? null : kdpCover.names.layerName(l); }, title.id);
  ok(auto && auto.startsWith('Micro Study Habits') && (await name(title.id)) === auto, `an empty name: back to the automatic name (${auto})`);
  await page.dblclick(`[data-pick="${pen.id}"]`);
  await page.fill(`[data-rename="${pen.id}"]`, 'Author');
  await page.click('[data-tool="layers"]');   // a click elsewhere keeps the typed name
  ok((await st()).layers.find((x) => x.id === pen.id).label === 'Author', 'double-click renames; leaving the box keeps it');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.layers.some((x) => x.id === pen.id && x.label === 'Author'), 'names are saved');

  /* Reorder: drag the grip one row down (50 px); the keyboard on the grip. */
  s = await st();
  let rows = await rowIds();
  const g = await page.$eval(`[data-grip="${rows[0]}"]`, (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.mouse.move(g[0], g[1] + 25, { steps: 3 });
  ok(await page.$eval(`[data-row="${rows[0]}"]`, (r) => r.classList.contains('is-drag') && /translateY\(25px\)/.test(r.style.transform)), 'the row follows the pointer');
  await page.mouse.move(g[0], g[1] + 52, { steps: 3 }); await page.mouse.up();
  let r2 = await rowIds();
  ok(r2[1] === rows[0] && r2[0] === rows[1], 'drag one row down: swapped');
  await page.focus(`[data-grip="${rows[0]}"]`);
  await page.keyboard.press('ArrowUp');
  r2 = await rowIds();
  ok(r2[0] === rows[0], 'Arrow up on the grip: one row up');
  ok(await page.evaluate((id) => document.activeElement.dataset.grip === id, rows[0]), 'focus stays on the grip');
  ok(JSON.stringify((await st()).layers.map((x) => x.id)) === JSON.stringify(s.layers.map((x) => x.id)), 'back to the first order');

  /* Keyboard on a row: Enter selects, Shift+Enter adds, arrows nudge, Delete deletes. */
  await page.focus(`[data-pick="${band.id}"]`); await page.keyboard.press('Enter');
  ok((await st()).sel === band.id, 'Enter selects');
  const x0 = (await st()).layers[0].x;
  await page.keyboard.press('ArrowRight');
  ok((await st()).layers[0].x === x0 + 1, 'arrows nudge');
  await page.focus(`[data-pick="${pen.id}"]`); await page.keyboard.press('Shift+Enter');
  ok((await page.evaluate(() => window.kdpBookSteps[9]._debug().multi.length)) === 2, 'Shift+Enter adds');
  await page.keyboard.press('Delete');
  ok((await st()).layers.length === 3, 'Delete deletes the selected');

  /* Background: Color opens the background picker. */
  await page.click('[data-bgcolor]');
  ok(await CV.has(page, '[data-picker][aria-label="Background color"]'), 'Background Color: the background picker');
  await page.click('.cv-pop-bg [data-hex="#F2EDE4"]');
  ok((await st()).bg === '#F2EDE4' && await page.$eval('.cv-lrow-bg .cv-swatch', (s) => s.style.getPropertyValue('--sw') === '#F2EDE4'), 'the background changes; the row shows it');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
