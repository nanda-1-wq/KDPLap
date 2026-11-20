// E16 Part 8: My layouts in the Layouts panel (design 67, Q-3, Q-3b, plan D2): the list from cover_json (newest export
// first, without layers), each row's thumbnail, name, "From …" and export date; a click reads the layers and applies
// them with this book's title, subtitle and pen name, this book's blurb and spine words, remapped to this book's size;
// the note; the × removes the row (and a failure says so); a read failure says so and changes nothing; an empty list.
// E16.2 (0032, owner Q-2): up to 5 entries per book, the date line with the local time ("Exported Nov 18, 10:09"), the
// × label with the time, the 6th export drops the book's oldest only (other books and null books stay), no Storage call.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  const st = globalThis.__store;
  const E = (f) => page.evaluate(f);
  const toast = () => page.$eval('[data-toast-host]', (h) => h.innerText.replace(/\s+/g, ' ').trim());
  const my = await FIX.my(page);
  // The expected date line, from the page's own clock (local time, 24 hours).
  const when = (iso) => page.evaluate((iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return { day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), time: `${p(d.getHours())}:${p(d.getMinutes())}` }; }, iso);
  const w1 = await when(my.exported_at), w2 = await when('2026-09-02T10:00:00.000Z');
  const older = Object.assign(JSON.parse(JSON.stringify(my)), { id: 'c6c6c6c6-0000-4000-8000-00000000006c', name: 'Corner, my series', from_title: 'Night Notes', exported_at: '2026-09-02T10:00:00.000Z', thumb: null, from_book_id: 'e5e5e5e5-0000-4000-8000-0000000000e5' });
  older.layers = older.layers.map((l) => (l.src === 'title' ? Object.assign({}, l, { text: 'NIGHT\nNOTES' }) : l));
  await FIX.band(page);

  /* The list: newest export first, thumbnail, name, From, date. */
  st.my = [older, my];
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  const rows = await page.$$eval('[data-my]', (a) => a.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  ok(rows.length === 2 && rows[0] === `Band, navy From Deep Focus for Night Students (example) Exported ${w1.day}, ${w1.time}` && rows[1] === `No picture Corner, my series From Night Notes Exported ${w2.day}, ${w2.time}`, `rows (E16.2: date and local time): ${rows.join(' | ')}`);
  const img = await page.$eval(`[data-my="${my.id}"] img`, (i) => ({ w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, ok: i.complete && i.naturalWidth > 0, src: i.src.slice(0, 22) }));
  ok(img.ok && Math.round(img.h) === 90 && Math.round(img.w) === 60 && img.src === 'data:image/jpeg;base64', `the thumbnail: ${Math.round(img.w)} × ${Math.round(img.h)}, ${img.src}`);
  ok((await CV.txt(page, `[data-my="${older.id}"] .cv-my-none`)) === 'No picture', 'a row with no thumbnail says so');
  ok((await CV.txt(page, '.cv-mys + .cv-help')) === 'Your title, subtitle and pen name replace the old book\'s words. Your own photos come along.', 'the line under the list');
  const xl = await page.$eval(`[data-my-x="${my.id}"]`, (b) => [b.getAttribute('aria-label'), b.title]);
  ok(xl[0] === `Remove Band, navy, exported ${w1.day} ${w1.time}, from My layouts` && xl[1] === 'Remove from My layouts', `the × is labelled with the time (E16.2): ${xl[0]}`);
  // cover_json lists them without layers.
  ok((await E(() => window.kdpBookSteps[9]._debug().my.every((m) => !('layers' in m)))), 'the list holds no layers');

  /* Apply: the layers are read, this book's words go in. */
  const calls0 = st.calls.length;
  await page.click(`[data-my="${my.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, my.id, { timeout: 10000 });
  ok(st.calls.slice(calls0).includes('GET /rest/v1/cover_my_layouts'), 'a click reads the layout\'s layers');
  let s = await CV.state(page);
  ok(s.layers.find((l) => l.src === 'title').text === FIX.title && s.layers.find((l) => l.src === 'subtitle').text === FIX.subtitle && s.layers.find((l) => l.src === 'pen').text === FIX.pen, 'this book\'s title, subtitle and pen name, not "Deep Focus"');
  ok(s.layers.find((l) => l.src === 'blurb').text === FIX.blurbWarm, 'this book\'s blurb (the one on its cover)');
  ok(s.bg === my.bg && s.layers.length === my.layers.length, 'the layout\'s background and layers');
  ok((await toast()) === '"Band, navy" applied with this book’s title, subtitle and pen name. Undo brings back what you had. Undo ×', `the note: ${await toast()}`);
  ok(await page.$eval(`[data-my="${my.id}"]`, (b) => b.getAttribute('aria-pressed') === 'true'), 'the row is pressed');
  await CV.settled(page, 'saved');
  ok(CV.lastSave().body.layout === 'my:' + my.id, `the save carries layout "my:<id>"`);
  await page.click('[data-toast-undo]');
  ok((await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'band', 'Undo: back to Band');

  /* A stacked title keeps its stacked form with this book's first 3 words. */
  await page.click(`[data-my="${older.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, older.id, { timeout: 10000 });
  ok((await CV.layer(page, 'title')).text === 'MICRO\nSTUDY\nHABITS', 'a stacked title: this book\'s first 3 words, stacked');

  /* Another size: the layout made at 6 × 9, 54 pages is remapped to 8 × 10 at 120 pages; spine words are this book's (D2). */
  const withSpine = JSON.parse(JSON.stringify(my));
  withSpine.id = 'a1a1a1a1-0000-4000-8000-0000000000a1';
  withSpine.layers.push({ ...withSpine.layers.find((l) => l.src === 'pen'), id: 99, src: 'spine', text: 'DEEP FOCUS FOR NIGHT STUDENTS    ADNAN HAROUN', rot: 90, x: 300, y: 300, w: 560, size: 9 });
  st.my = [withSpine];
  st.book.trim = '8x10'; st.pdf.page_count = 120;
  st.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { trim: '8x10', pages: 120, paper: 'white' }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await CV.open(page);
  await page.click('[data-tool="layouts"]');
  await page.click(`[data-my="${withSpine.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, withSpine.id, { timeout: 10000 });
  const r = await E(() => { const E = window.kdpBookSteps[9]._debug(), g = kdpCover.geo.geo(E.cover.fmt); const b = E.cover.layers[0], sp = E.cover.layers.find((l) => l.src === 'spine'); return { bx: b.x, bw: b.w, foldR: g.foldR, W: g.W, sp: sp && sp.text }; });
  ok(Math.abs(r.bx - r.foldR) < 1 && Math.abs(r.bx + r.bw - r.W) < 1, `8 × 10: the band spans this book's front (x ${r.bx.toFixed(1)} = foldR ${r.foldR.toFixed(1)})`);
  ok(r.sp === `${FIX.title}    ${FIX.pen}`, `the spine words are this book's (D2): ${r.sp}`);
  // This book too thin for spine text: the layout's spine layer is left out.
  st.book.trim = '6x9'; st.pdf.page_count = 54;
  st.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { ...FIX.fmt }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await CV.open(page);
  await page.click('[data-tool="layouts"]');
  await page.click(`[data-my="${withSpine.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, withSpine.id, { timeout: 10000 });
  s = await CV.state(page);
  ok(!s.layers.some((l) => l.src === 'spine') && s.layers.length === my.layers.length, '54 pages: no spine text from the layout');
  ok((await toast()) === '"Band, navy" applied with this book’s title, subtitle and pen name. Undo ×', 'on an empty cover the note has no "Undo brings back" words');

  /* A read failure: the words, nothing changed. */
  st.my = [my];
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  globalThis.__modes.myFail = 1;
  await page.click(`[data-my="${my.id}"]`);
  await page.waitForSelector('.cv-lay-err', { timeout: 10000 });
  ok((await CV.txt(page, '.cv-lay-err')) === 'We couldn’t open this layout. Check your connection, then try again.', 'read failed: the words');
  ok((await E(() => window.kdpBookSteps[9]._debug().cover.layout)) === 'band' && (await CV.state(page)).layers.length === 5, 'the cover is unchanged');

  /* Remove: × removes the row at once; a failure says so and keeps it. */
  globalThis.__modes.myDelFail = 1;
  await page.click(`[data-my-x="${my.id}"]`);
  await page.waitForFunction(() => /couldn’t remove/.test((document.querySelector('.cv-lay-err') || {}).textContent || ''), null, { timeout: 10000 });
  ok((await CV.txt(page, '.cv-lay-err')) === 'We couldn’t remove this layout. Check your connection, then try again.' && await CV.has(page, `[data-my="${my.id}"]`), 'remove failed: the words, the row stays');
  await page.click(`[data-my-x="${my.id}"]`);
  await page.waitForSelector('[data-my-empty]', { timeout: 10000 });
  ok(st.my.length === 0 && st.writes.some((w) => w.table === 'cover_my_layouts' && w.del === my.id), '× removes it (cover_my_layouts delete by id)');
  ok(!(await CV.has(page, '.cv-lay-err')) && (await CV.txt(page, '[data-my-empty]')) === 'Every cover you export is saved here. Use it for your next book or a series.', 'the list is empty: the design words');
  ok((await E(() => document.activeElement && document.activeElement.dataset.lay)) === 'blank', 'focus goes to the first ready layout');
  ok((await CV.state(page)).layers.length === 5, 'removing a My layout leaves the cover alone');

  /* "Your own photos come along": a My layout's photo in Uploads loads; one removed from Uploads is a Must fix (C15),
     with the Images panel never opened. */
  st.my = []; st.assets = []; st.files = {};
  await CV.open(page, { design: 'empty' });
  await PIC.make(page, 'p', { w: 1600, h: 1200 });
  await PIC.ready(page);
  await PIC.pick(page, 'p');
  await PIC.idle(page);
  const photo = st.assets[st.assets.length - 1];
  ok(!!(photo && st.files[photo.path]), 'a photo in Uploads');
  const withPhoto = (id, asset) => {
    const m = JSON.parse(JSON.stringify(my)); m.id = id; m.name = 'Photo ' + id.slice(0, 2);
    m.layers.splice(1, 0, { ...my.layers[0], id: 50, type: 'image', name: 'Desk photo', asset, natW: 1600, natH: 1200, x: 470, y: 380, w: 300, h: 160, px: 0, py: 0, pw: 300, ph: 225, kind: undefined, fill: undefined });
    return m;
  };
  const pm = withPhoto('d1d1d1d1-0000-4000-8000-0000000000d1', photo.id), gm = withPhoto('d2d2d2d2-0000-4000-8000-0000000000d2', 'a9a9a9a9-0000-4000-8000-0000000000a9');
  st.my = [pm, gm];
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="layouts"]');
  await page.click(`[data-my="${pm.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, pm.id, { timeout: 10000 });
  await PIC.drawn(page);
  const ps = await E(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.type === 'image'); return [kdpCover.images.state(E, l), kdpCover.checks.run(E.cover, { missing: kdpCover.images.missing(E), samples: true }).filter((c) => c.code === 'C15').length]; });
  ok(ps[0] === 'ready' && ps[1] === 0, `the photo in Uploads is drawn (${ps[0]}), no C15`);
  await page.click(`[data-my="${gm.id}"]`);
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, gm.id, { timeout: 10000 });
  await PIC.drawn(page);
  const gs = await E(() => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.type === 'image'); return [kdpCover.images.state(E, l), kdpCover.checks.run(E.cover, { missing: kdpCover.images.missing(E), samples: true }).filter((c) => c.code === 'C15').map((c) => c.msg)]; });
  ok(gs[0] === 'missing' && gs[1].length === 1 && /"Desk photo" is missing/.test(gs[1][0]), `a photo gone from Uploads: ${gs[0]}, C15`);
  st.assets = []; st.files = {};

  /* A long name: the note wraps inside the editor at 1024, Undo and × stay in view. */
  const longMy = JSON.parse(JSON.stringify(my)); longMy.id = 'f0f0f0f0-0000-4000-8000-0000000000f0'; longMy.name = 'Band, navy, for the whole Study After Work series, second edition';
  st.my = [longMy];
  await page.setViewportSize({ width: 1024, height: 900 });
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  await page.click(`[data-my="${longMy.id}"]`);
  await page.waitForSelector('.cv-toast', { timeout: 10000 });
  const tb = await E(() => { const R = document.querySelector('.cv-root').getBoundingClientRect(); const t = document.querySelector('.cv-toast').getBoundingClientRect(); const u = document.querySelector('[data-toast-undo]').getBoundingClientRect(), x = document.querySelector('[data-toast-x]').getBoundingClientRect(); return t.left >= R.left && t.right <= R.right && u.right <= R.right && x.right <= R.right && x.right <= innerWidth; });
  ok(tb && await CV.noScroll(page), 'a 64-character name at 1024: the note, Undo and × stay inside the editor');
  await page.setViewportSize({ width: 1440, height: 900 });

  /* E16.2 (0032): 5 entries of one book, told apart by time; the 6th export drops that book's oldest only. */
  const at = (h, m) => page.evaluate(([h, m]) => new Date(2026, 10, 18, h, m).toISOString(), [h, m]);   // Nov 18, local time
  const five = [];
  for (const [i, [h, m]] of [[9, 5], [9, 41], [10, 9], [11, 30], [14, 2]].entries()) {
    five.push(Object.assign(JSON.parse(JSON.stringify(my)), { id: `e${i}e${i}e${i}e${i}-0000-4000-8000-00000000000${i}`, name: 'Picture band', from_book_id: FIX.BOOK, from_title: FIX.title, exported_at: await at(h, m) }));
  }
  const other = Object.assign(JSON.parse(JSON.stringify(older)), { exported_at: await at(8, 0) });                          // another book
  const orphan = Object.assign(JSON.parse(JSON.stringify(my)), { id: 'f9f9f9f9-0000-4000-8000-0000000000f9', name: 'From a deleted book', from_book_id: null, from_title: null, exported_at: await at(7, 0) });
  st.my = five.concat([other, orphan]); st.myTrimmed = [];
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  const dates = await CV.all(page, '[data-panel] .cv-my-date');
  ok(dates.slice(0, 5).join(' | ') === 'Exported Nov 18, 14:02 | Exported Nov 18, 11:30 | Exported Nov 18, 10:09 | Exported Nov 18, 09:41 | Exported Nov 18, 09:05', `5 of one book, newest first, each with its time: ${dates.slice(0, 5).join(' | ')}`);
  const x10 = await page.$eval(`[data-my-x="${five[2].id}"]`, (b) => b.getAttribute('aria-label'));
  ok(x10 === 'Remove Picture band, exported Nov 18 10:09, from My layouts', `the × names the time: ${x10}`);
  ok((await page.$$('[data-panel] [data-my]')).length === 7, 'all 7 entries listed (5 + another book + a deleted book)');
  // The 6th export of this book: the save (a plain insert) and the list update, as the export dialog does them.
  const c0 = st.calls.length, w0 = st.writes.length;
  const sixth = await E(async () => {
    const E = window.kdpBookSteps[9]._debug(), c = E.cover;
    const res = await kdp.saveMyLayout({ bookId: E.bookId, name: 'Picture band', fromTitle: 'six', fmt: c.fmt, bg: c.bg, layers: c.layers, thumb: null });
    E.myChanged({ id: res.data.id, name: 'Picture band', from_book_id: E.bookId, from_title: 'six', fmt: c.fmt, bg: c.bg, thumb: null, exported_at: res.data.exported_at });
    return { id: res.data.id, err: res.error && res.error.message };
  });
  ok(!sixth.err && !!sixth.id, `the 6th entry is saved (${sixth.err || sixth.id})`);
  const mine = st.my.filter((m) => m.from_book_id === FIX.BOOK);
  ok(mine.length === 5 && !mine.some((m) => m.id === five[0].id) && st.myTrimmed.join() === five[0].id, `the database keeps 5 of this book; the oldest (09:05) went (${st.myTrimmed})`);
  ok(st.my.some((m) => m.id === other.id) && st.my.some((m) => m.id === orphan.id) && st.my.length === 7, 'another book\'s entry and a deleted book\'s entry stay');
  const list = await E(() => window.kdpBookSteps[9]._debug().my.map((m) => m.id));
  ok(list.join() === [sixth.id, five[4].id, five[3].id, five[2].id, five[1].id, other.id, orphan.id].join(), `the panel list in the database's order: the new one first, 09:05 gone, the others kept (${list.length})`);
  ok((await page.$$('[data-panel] [data-my]')).length === 7 && !(await CV.has(page, `[data-my="${five[0].id}"]`)), 'the panel shows 7 rows, without the oldest');
  ok(!st.calls.slice(c0).some((c) => /\/storage\/v1\//.test(c)) && !st.writes.slice(w0).some((w) => w.table === 'cover_my_layouts' && w.del), `the trim makes no Storage call and no delete from the browser (${st.calls.slice(c0).join(', ')})`);
  // The × makes no Storage call either.
  const c1 = st.calls.length;
  await page.click(`[data-my-x="${five[2].id}"]`);
  await page.waitForFunction((id) => !document.querySelector(`[data-my="${id}"]`), five[2].id, { timeout: 10000 });
  const xc = st.calls.slice(c1);
  ok(xc.length === 1 && xc[0] === 'DELETE /rest/v1/cover_my_layouts', `the × deletes the row only, no Storage call (${xc.join(', ')})`);
  // A 6th of a book that has 5, while the list was read before: the local list never shows more than 5 of one book.
  await E(() => { const E = window.kdpBookSteps[9]._debug(); const b = E.my.find((m) => m.from_book_id === E.bookId); for (let i = 0; i < 3; i++) E.myChanged(Object.assign({}, b, { id: `z${i}z${i}z${i}z${i}-0000-4000-8000-00000000000${i}`, exported_at: new Date(Date.now() + i * 1000).toISOString() })); });
  const per = await E(() => { const E = window.kdpBookSteps[9]._debug(); return [E.my.filter((m) => m.from_book_id === E.bookId).length, E.my.length]; });
  ok(per[0] === 5 && per[1] === 7, `myChanged trims the local list to 5 for this book (${per})`);

  /* Step D on the rows. */
  st.my = [my];
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().lay.fonts === true, null, { timeout: 20000 });   // the panel is drawn again then
  const x = await page.$eval(`[data-my-x="${my.id}"]`, (b) => { const a = getComputedStyle(b, '::after'); return [parseFloat(a.width), parseFloat(a.height)]; });
  ok(x[0] >= 44 && x[1] >= 44, `the × has a 44 px click area (${x})`);
  await page.focus(`[data-my="${my.id}"]`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => window.kdpBookSteps[9]._debug().cover.layout === 'my:' + id, my.id, { timeout: 10000 });
  ok(true, 'Enter on a row applies it');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
