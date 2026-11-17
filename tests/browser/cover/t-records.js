// E16 Part 10, Uploads housekeeping (owner, STOP 6): the remove × on each Uploads tile with the "used on N covers"
// question first (N6), and the orphan-file sweep when 09 opens (N8): files under <user>/assets/ with no cover_assets
// row and older than one hour (the server's clock) are removed through the Storage API, best effort; a failed read
// removes nothing; only <uuid>.jpg|png names in that folder; once per page; never offline.
// (The cover_exports rows themselves: t-export.js, one insert per export, the guard's codes.)
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ago = (min) => new Date(Date.now() - min * 60e3).toISOString();
  const file = (p, min) => { st.files[p] = { buf: null, type: 'image/jpeg', size: 1000 }; st.fileTimes[p] = ago(min); };
  const swept = () => page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && E.sweepResult; }, null, { timeout: 15000 }).then(() => page.evaluate(() => JSON.parse(JSON.stringify(window.kdpBookSteps[9]._debug().sweepResult))));
  const lists = () => st.writes.filter((w) => w.table === 'storage.list');
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.fileTimes = {}; st.removed = []; st.writes = []; st.calls = []; st.my = []; st.otherDesigns = []; };
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ── A. The sweep ── */
  fresh();
  const A = `${U}/assets/`;
  file(A + uuid(1) + '.jpg', 120);   // an orphan, 2 h old: removed
  file(A + uuid(2) + '.png', 10);    // an orphan, 10 min old (an upload may still be adding its row): kept
  file(A + uuid(3) + '.jpg', 300);   // has its row: kept
  st.assets.push({ id: uuid(3), source: 'upload', mime: 'image/jpeg', path: A + uuid(3) + '.jpg', remote: null, width: 100, height: 100, bytes: 1000, transparent: false, rights_at: ago(300), credit: null, origin_book_id: FIX.BOOK, name: 'kept.jpg', created_at: ago(300) });
  file(A + 'notes.txt', 300);        // not a picture name: kept
  file(`${U}/${FIX.BOOK}/${uuid(4)}.jpg`, 9000);   // E15's folder (the owner's trial photo): never listed, kept
  await CV.open(page, { design: 'band' });
  let r = await swept();
  ok(!r.error && JSON.stringify(r.data.removed) === JSON.stringify([A + uuid(1) + '.jpg']), `only the old orphan is removed (${JSON.stringify(r.data && r.data.removed)})`);
  ok(st.files[A + uuid(2) + '.png'] && st.files[A + uuid(3) + '.jpg'] && st.files[A + 'notes.txt'] && st.files[`${U}/${FIX.BOOK}/${uuid(4)}.jpg`], 'the new orphan, the file with a row, a non-picture name and the E15 folder stay');
  ok(lists().length === 1 && lists()[0].body.prefix === `${U}/assets` && lists()[0].body.limit === 100, 'one folder read: <user>/assets, 100 a page');
  const order = st.calls.filter((c) => /cover_assets|list\/covers|DELETE \/storage/.test(c));
  ok(order[0] === 'GET /rest/v1/cover_assets' && order[1] === 'POST /storage/v1/object/list/covers' && order[order.length - 1] === 'DELETE /storage/v1/object/covers', `the rows first, then the folder, then one remove (${order.join(', ')})`);
  // Once per page: back to 09 from 08 without a reload, no second sweep.
  await page.evaluate(() => document.querySelector('a[data-step="8"]').click());
  await page.waitForFunction(() => /step=8/.test(location.href));
  await page.evaluate(() => document.querySelector('a[data-step="9"]').click());
  await CV.ready(page);
  await page.waitForTimeout(500);
  ok(lists().length === 1, 'once per page (08 and back: no second sweep)');
  // Pages: 230 old orphans → 3 folder reads, all removed in one call.
  fresh();
  for (let i = 0; i < 230; i++) file(A + uuid(100 + i) + '.jpg', 90);
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(!r.error && r.data.removed.length === 230 && lists().length === 3 && st.calls.filter((c) => c === 'DELETE /storage/v1/object/covers').length === 3, `230 orphans: 3 pages read, removed 100 a call (${r.data && r.data.removed.length}, ${lists().length})`);
  // At most 50 pages a visit: 5,100 orphans → 5,000 removed now, the rest at the next sweep.
  fresh();
  for (let i = 0; i < 5100; i++) file(A + uuid(10000 + i) + '.jpg', 90);
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(!r.error && lists().length === 50 && r.data.removed.length === 5000 && Object.keys(st.files).length === 100, `5,100 orphans: 50 pages read, 5,000 removed (${lists().length}, ${r.data && r.data.removed.length})`);
  // The rows cannot be read: nothing removed, the folder is not even read.
  fresh();
  file(A + uuid(1) + '.jpg', 120);
  globalThis.__modes.listFail = 1;
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(r.error && lists().length === 0 && st.removed.length === 0 && st.files[A + uuid(1) + '.jpg'], 'the rows fail: nothing read, nothing removed');
  // A folder page fails: nothing removed.
  fresh();
  file(A + uuid(1) + '.jpg', 120);
  globalThis.__modes.listFilesFail = 1;
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(r.error && st.removed.length === 0, 'the folder read fails: nothing removed');
  // 1,000 rows or more (the API may cut the list): nothing removed.
  fresh();
  file(A + uuid(1) + '.jpg', 120);
  for (let i = 0; i < 1000; i++) st.assets.push({ id: uuid(5000 + i), source: 'unsplash', mime: 'image/jpeg', path: null, remote: { url: 'https://images.unsplash.com/photo-x', width: 10, height: 10 }, width: 10, height: 10, bytes: null, transparent: false, rights_at: null, credit: null, origin_book_id: null, name: 'u', created_at: ago(5) });
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(!r.error && r.data.skipped === 'many' && lists().length === 0 && st.removed.length === 0, '1,000 rows: the sweep stays out');
  // Offline when 09 opens: no sweep.
  fresh();
  file(A + uuid(1) + '.jpg', 120);
  await CV.open(page, { step: 8 });
  await page.context().setOffline(true);
  await page.evaluate(() => document.querySelector('a[data-step="9"]').click());
  await CV.ready(page);
  await page.waitForTimeout(800);
  ok(lists().length === 0 && st.files[A + uuid(1) + '.jpg'], 'offline on open: no sweep');
  await page.context().setOffline(false);
  await CV.settled(page);

  /* ── B. The remove × ── */
  fresh();
  await CV.open(page, { design: 'band' });
  await PIC.ready(page);
  await PIC.make(page, 'a', { w: 900, h: 600, type: 'image/jpeg', name: 'desk.jpg' }); await PIC.pick(page, 'a'); await PIC.idle(page);
  await PIC.make(page, 'b', { w: 800, h: 600, type: 'image/jpeg', name: 'notebook.jpg' }); await PIC.pick(page, 'b'); await PIC.idle(page);
  await PIC.drawn(page);
  // notebook.jpg leaves the cover (it stays in Uploads).
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.filter((x) => x.type === 'image').find((x) => x.name === 'notebook.jpg'); E.removeIds([l.id]); });
  await CV.settled(page, 'saved');
  const desk = st.assets.find((a) => a.name === 'desk.jpg'), note = st.assets.find((a) => a.name === 'notebook.jpg');
  ok(desk && note, 'two pictures in Uploads');
  // desk.jpg is also on another book's cover and in one of My layouts.
  st.otherDesigns.push({ book_id: 'b0000002-0000-4000-8000-000000000002', layers: [{ id: 1, type: 'image', asset: desk.id }] });
  st.my.push({ id: 'm1', name: 'Series', from_book_id: 'b0000002-0000-4000-8000-000000000002', from_title: 'Two', fmt: { ...FIX.fmt }, bg: '#FFFFFF', layers: [{ id: 1, type: 'image', asset: desk.id }], thumb: null, exported_at: ago(60) });
  await page.click('[data-tool="layers"]'); await page.click('[data-tool="images"]');
  const xs = await page.$$eval('[data-up-x]', (b) => b.map((x) => ({ id: x.dataset.upX, label: x.getAttribute('aria-label'), title: x.title })));
  ok(xs.length === 2 && xs.some((x) => x.label === 'Remove desk.jpg from Uploads') && xs.every((x) => x.title === 'Remove from Uploads'), `a × on each tile, named (${xs.map((x) => x.label).join(' | ')})`);
  // The × is a sibling of the tile button (a button cannot hold a button) and has a 44 px click area.
  const hit = await page.$eval(`[data-up-x="${desk.id}"]`, (x) => { const b = x.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2 - 18, b.top + b.height / 2 + 18); return { inTile: !!x.closest('.cv-uptile'), hit: e === x, w: b.width }; });
  ok(!hit.inTile && hit.hit && hit.w === 24, `the × beside the tile, 24 px drawn, 44 px to press (${JSON.stringify(hit)})`);
  await page.click(`[data-up-x="${desk.id}"]`);
  await page.waitForSelector('[data-uprm-go]');
  const q = await CV.txt(page, '[data-uprm]');
  ok(q === 'Remove desk.jpg from Uploads? Used on 2 covers, this one too. Also in 1 of My layouts. Those covers will show “Picture missing” and need a new picture before you export. The file is deleted. This cannot be undone. Remove Cancel', `the question (${q})`);
  ok(await page.$eval('[data-uprm]', (e) => e.getAttribute('role') === 'alertdialog' && !!e.querySelector('.cv-uprm-w svg')), 'role alertdialog; the warning has its icon');
  ok(await page.$eval('[data-uprm-go]', (b) => getComputedStyle(b).backgroundColor === 'rgb(180, 35, 24)'), 'Remove: the filled red button (the final step)');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-uprm-go]')), 'focus: Remove');
  ok(await page.$eval(`[data-up-x="${note.id}"]`, (b) => b.getAttribute('aria-disabled') === 'true'), 'the other × is off while the question is open');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-uprm]'));
  ok(await page.evaluate((id) => document.activeElement && document.activeElement.matches(`[data-up-x="${id}"]`), desk.id), 'Escape: no question, focus back on its ×');
  ok(st.assets.length === 2, 'Escape removed nothing');
  // Remove.
  await page.click(`[data-up-x="${desk.id}"]`);
  await page.waitForSelector('[data-uprm-go]');
  await page.click('[data-uprm-go]');
  await page.waitForFunction(() => !document.querySelector('[data-uprm]'));
  ok(!st.assets.some((a) => a.id === desk.id) && !st.files[desk.path] && st.removed.includes(desk.path), 'Remove: the row, then the file (Storage API)');
  ok((await CV.txt(page, '[data-up-note]')) === 'desk.jpg was removed from Uploads.', 'the status line');
  ok((await page.$$('[data-up-x]')).length === 1 && await page.evaluate((id) => document.activeElement && document.activeElement.matches(`[data-up-x="${id}"]`), note.id), 'one tile left; focus on its ×');
  ok(await page.evaluate((id) => kdpCover.images.state(window.kdpBookSteps[9]._debug(), window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.asset === id)) === 'missing', desk.id), 'the layer on this cover: Picture missing');
  ok((await CV.txt(page, '[data-next-note]')) === 'Fix 1 problem before export.', `C15 Must fix: "Fix 1 problem before export." (${await CV.txt(page, '[data-next-note]')})`);
  // An unused picture; the count fails; the remove fails.
  await page.click(`[data-up-x="${note.id}"]`);
  await page.waitForSelector('[data-uprm-go]');
  ok((await CV.txt(page, '.cv-uprm-p')) === 'It is not used on any cover. The file is deleted. This cannot be undone.', 'unused: "It is not used on any cover."');
  ok(!(await page.$('.cv-uprm-w')), 'unused: no warning line');
  await page.click('[data-uprm-cancel]');
  globalThis.__modes.useFail = 1;
  await page.click(`[data-up-x="${note.id}"]`);
  await page.waitForSelector('[data-uprm-go]');
  ok((await CV.txt(page, '.cv-uprm-p')).startsWith('We couldn’t check which covers use this picture. If one does, it will show “Picture missing”.'), 'the count fails: it says so, Remove still offered');
  globalThis.__modes.delFail = 1;
  await page.click('[data-uprm-go]');
  await page.waitForSelector('[data-uprm] .cv-uperr');
  ok((await CV.txt(page, '[data-uprm] .cv-uperr')) === 'We couldn’t remove the picture. Check your connection, then try again.' && st.assets.some((a) => a.id === note.id), 'the remove fails: the words, the picture stays');
  await page.click('[data-uprm-go]');
  await page.waitForFunction(() => !document.querySelector('[data-uprm]'));
  ok(!st.assets.some((a) => a.id === note.id) && (await page.$$('[data-up-x]')).length === 0, 'again: removed; Uploads is empty');

  /* ── C. The age comes from the server's clock, not the device's (last: the page clock stays shifted) ── */
  fresh();
  file(A + uuid(1) + '.jpg', 30);    // 30 min old by the server's time
  file(A + uuid(2) + '.jpg', 61);    // 61 min old
  await page.addInitScript(() => { const real = Date.now; Date.now = () => real() + 3 * 3600e3; });   // the device's clock 3 h ahead
  await CV.open(page, { design: 'keep' });
  r = await swept();
  ok(!r.error && JSON.stringify(r.data.removed) === JSON.stringify([A + uuid(2) + '.jpg']) && st.files[A + uuid(1) + '.jpg'], `a device clock 3 h ahead: the 30-minute-old file stays, the 61-minute one goes (${JSON.stringify(r.data && r.data.removed)})`);

  ok(CV.mockErrors().length === 0, `no mock errors (${CV.mockErrors().join(' | ')})`);
  await CV.quiet(page);
  return log.join('\n');
};
