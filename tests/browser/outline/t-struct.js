// Step 05 Outline (E9.1): add and remove sections, delete and add chapters
// (confirm dialogs), reorder by keyboard and by drag, and the errors.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.otl-list, .otl-empty', { timeout: 10000 });
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const titles = () => page.$$eval('.otl-list > .otl-ch:not(.otl-fixed) .otl-ch-title', (ls) => ls.map((l) => l.innerText));
  const nums = () => page.$$eval('.otl-list > .otl-ch:not(.otl-fixed) .otl-num', (ls) => ls.map((l) => l.innerText).join(','));
  const rpc = (fn) => st.writes.filter((w) => w.fn === fn);
  const focusedId = () => page.evaluate(() => document.activeElement && document.activeElement.id);
  const ch = (n) => `.otl-ch:not(.otl-fixed):nth-child(${n + 1})`;
  const wait = (ms = 300) => page.waitForTimeout(ms);
  const T = ['Why Chair Yoga Works After 60', 'Setting Up: Your Chair, Space, and Safety Checks', 'Breathing and Posture Basics', 'Upper Body: Neck, Shoulders, and Arms', 'Lower Body: Hips, Knees, and Ankles', 'Breathing for Calm and Better Sleep', 'Your 4-Week Plan: From 5 to 15 Minutes', 'Staying With It'];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(B1);

  // 1. Add section: a new row 1.4, focused, saved at position 4.
  await page.click(`${ch(1)} [data-add-section]`);
  await wait();
  ok((await page.$$(`${ch(1)} .otl-sec`)).length === 4 && (await txt(`${ch(1)} .otl-sec:nth-child(4) .otl-secnum`)) === '1.4', 'section 1.4 added');
  ok(/^otlST-/.test(await focusedId()), 'its title field has the focus');
  const ins = st.writes.filter((w) => w.table === 'sections' && w.method === 'POST').at(-1);
  ok(ins && ins.body.position === 4, `inserted at position 4 (${ins && ins.body.position})`);
  ok((await page.$eval('[data-check-list]', (l) => l.innerText)).includes('1 section has no word target'), 'check: the new section has no word target');

  // 2. Remove section: confirm dialog, then gone; Cancel first keeps it.
  await page.click(`${ch(1)} .otl-sec:nth-child(4) [data-del-section]`);
  ok((await txt('dialog[open] h2')) === 'Remove section 1.4?', `dialog: ${await txt('dialog[open] h2')}`);
  ok((await txt('dialog[open] .delete-text')) === 'This section and its word target go. Nothing is written yet, so nothing else is lost.', `text: ${await txt('dialog[open] .delete-text')}`);
  ok(await page.$eval('dialog[open] [data-confirm]', (b) => b.classList.contains('btn-danger') && b.textContent === 'Remove section'), 'filled red button at the final step');
  await page.click('dialog[open] [data-close]');
  ok(!(await page.$('dialog[open]')) && (await page.$$(`${ch(1)} .otl-sec`)).length === 4, 'Cancel keeps it');
  await page.click(`${ch(1)} .otl-sec:nth-child(4) [data-del-section]`);
  await page.click('dialog[open] [data-confirm]');
  await wait();
  ok((await page.$$(`${ch(1)} .otl-sec`)).length === 3, 'removed');
  ok(st.writes.some((w) => w.table === 'sections' && w.method === 'DELETE'), 'DELETE sent');
  ok(/^otlST-/.test(await focusedId()), 'focus moves to a section title');

  // 3. Delete chapter 2: names it and its sections; the rest renumbers.
  await page.click(`${ch(2)} [data-toggle]`);
  await page.click(`${ch(2)} [data-del-chapter]`);
  ok((await txt('dialog[open] h2')) === 'Delete chapter 2?', 'dialog: Delete chapter 2?');
  ok((await txt('dialog[open] .delete-text')) === '“Setting Up: Your Chair, Space, and Safety Checks” and its 3 sections go. Nothing is written yet, so nothing else is lost.', `text: ${await txt('dialog[open] .delete-text')}`);
  await page.click('dialog[open] [data-confirm]');
  await wait();
  ok(JSON.stringify(await titles()) === JSON.stringify([T[0], ...T.slice(2)]), 'chapter 2 gone');
  ok((await nums()) === '1,2,3,4,5,6,7', `renumbered: ${await nums()}`);
  ok((await txt('[data-planned]')) === '10,100', `planned 10,100 (${await txt('[data-planned]')})`);
  ok((await page.$eval('[data-check-list]', (l) => l.innerText)).includes('7 chapters. Your Brief says 8.'), 'check: 7 chapters, Brief says 8');
  ok(/^otlX-/.test(await focusedId()), 'focus on the next chapter');

  // 4. Add chapter: before the Conclusion, open, title field focused; Untitled.
  await page.click('[data-add-chapter]');
  await page.waitForFunction(() => document.querySelectorAll('.otl-list > .otl-ch:not(.otl-fixed)').length === 8, null, { timeout: 5000 });
  await wait();
  ok((await titles()).at(-1) === 'Untitled chapter', 'new chapter 8: Untitled chapter');
  ok(await page.$eval('.otl-list > .otl-ch:last-child', (l) => l.classList.contains('otl-fixed')), 'the Conclusion stays last');
  ok(/^otlT-/.test(await focusedId()), 'new chapter title field focused');
  ok(rpc('add_chapter').length === 1, 'add_chapter called once');
  await page.keyboard.type('Your Next Steps');
  ok((await titles()).at(-1) === 'Your Next Steps', 'typing names it');
  await page.waitForTimeout(1200);

  // 5. Keyboard: Alt + Up on chapter 3's handle makes it chapter 2; saved; announced.
  const before = await titles();
  await page.focus(`${ch(3)} [data-handle]`);
  await page.keyboard.press('Alt+ArrowUp');
  await wait();
  const after = await titles();
  ok(after[1] === before[2] && after[2] === before[1], `moved up: ${after[1]}`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-handle]')), 'focus stays on the handle');
  ok((await txt('[data-live]')) === 'Chapter moved to position 2 of 8.', `announced: ${await txt('[data-live]')}`);
  const r1 = rpc('reorder_chapters').at(-1);
  ok(r1 && r1.ids.length === 8, 'reorder_chapters sent all 8 ids');
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');   // already first: nothing
  await wait();
  ok((await titles())[0] === before[2], 'Alt+Up to the top');
  ok(rpc('reorder_chapters').length === 2, 'no save for a move past the top');
  await open(B1);
  ok((await titles())[0] === before[2], 'order kept after reload');

  // 6. Drag chapter 1 onto the lower half of chapter 3: it lands after it.
  const t0 = await titles();
  const src = await page.$(`${ch(1)} [data-handle]`);
  const dst = await page.$(ch(3));
  const sb = await src.boundingBox(); const db = await dst.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(db.x + db.width / 2, db.y + db.height * 0.5 + 10, { steps: 8 });
  await page.mouse.move(db.x + db.width / 2, db.y + db.height * 0.75, { steps: 4 });
  ok(await page.$eval(ch(3), (l) => l.classList.contains('drop-after')), 'drop line under chapter 3');
  await page.screenshot({ path: `${SHOTS}/t-struct-drag.png`, timeout: 8000 }).catch(() => {});
  await page.mouse.up();
  await wait();
  const t1 = await titles();
  ok(t1[0] === t0[1] && t1[1] === t0[2] && t1[2] === t0[0], `dragged: ${t1.slice(0, 3).join(' | ')}`);
  ok(!(await page.$('.drop-before, .drop-after, .is-dragging')), 'no drop line left');

  // 7. A failed order save puts the order back and says so.
  globalThis.__modes.reorderError = true;
  const t2 = await titles();
  await page.focus(`${ch(2)} [data-handle]`);
  await page.keyboard.press('Alt+ArrowDown');
  await wait(600);
  ok(JSON.stringify(await titles()) === JSON.stringify(t2), 'order put back');
  ok(/We couldn’t save the new order/.test(await txt('[data-status]')), 'error says so');
  globalThis.__modes.reorderError = false;

  // 8. A chapter with writing cannot be deleted: the dialog says why.
  await open(B5);
  await page.click(`${ch(1)} [data-del-chapter]`);
  await page.click('dialog[open] [data-confirm]');
  await wait();
  ok((await txt('dialog[open] [data-error]')) === 'This chapter has writing, so it can’t be deleted.', `writing: ${await txt('dialog[open] [data-error]')}`);
  await page.click('dialog[open] [data-close]');
  ok((await titles()).length === 8, 'still 8 chapters');

  // 9. Add chapter on an empty book: Introduction, chapter, Conclusion.
  await open(B2);
  await page.click('[data-list] [data-add-chapter]');
  await page.waitForSelector('.otl-list', { timeout: 5000 });
  await wait();
  const rows = await page.$$eval('.otl-list > .otl-ch .otl-ch-title', (ls) => ls.map((l) => l.innerText));
  ok(JSON.stringify(rows) === JSON.stringify(['Introduction', 'Untitled chapter', 'Conclusion']), `empty book: ${JSON.stringify(rows)}`);
  ok((await txt('[data-planned]')) === '0', 'planned 0');
  ok(/No title/.test(await txt(`${ch(1)} [data-pills]`)) && /No objective/.test(await txt(`${ch(1)} [data-pills]`)), 'pills: No objective, No title');
  return log.join('\n');
};
