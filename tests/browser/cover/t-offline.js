// E16 Part 9: offline (design 73b, plan §3 States, R15). F73b = Band + warm blurb, offline. The amber bar with the
// design's words; the footer "Offline · kept on this device" (an icon and the words); changes are kept on this device
// (localStorage, the base rev) and never sent; no red bar; nothing pending (no "Leave site?"); AI and Pixabay are
// blocked with plain words and make no call; back online the design saves and the kept copy goes. The next open
// (R15): a kept copy whose base rev is the row's rev is the newest (it opens and saves); a row saved after the copy
// wins (the copy goes into the history first). A save that is out when the connection goes ends offline, not failed.
// Leaving 09 offline: the saver saves when the connection is back.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  const band = await FIX.band(page);
  const ctx = page.context();
  const U = '00000000-0000-4000-8000-000000000001';
  const KEY = `nicheink.cover.v1.${U}.${FIX.BOOK}`;
  const kept = () => page.evaluate((k) => { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }, KEY);
  const E = () => page.evaluate(() => { const e = window.kdpBookSteps[9]._debug(); return { save: e.saveState, off: e.offline, pending: e.saver.pending(), rev: e.saver.rev() }; });
  const move = async (dx) => { const t = await CV.layer(page, 'title'); await page.evaluate(([id, x]) => window.kdpBookSteps[9]._debug().setLayer(id, { x }), [t.id, t.x + dx]); return t.x + dx; };

  /* F73b. */
  // A copy left on this device by an earlier run would rightly win on open (R15): clear it, then open clean.
  await page.goto('http://127.0.0.1:5500/robots.txt');
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await CV.open(page, { design: 'band' });
  const saves0 = st.saves;
  await ctx.setOffline(true);
  await page.waitForSelector('[data-offbar]:not([hidden])', { timeout: 5000 });
  ok((await CV.txt(page, '[data-offbar]')) === 'You are offline. Keep working: your changes stay on this device and save when you are back online. Export, AI and Pixabay or Unsplash need a connection.', 'the bar: design 73b words');
  ok(await page.$eval('[data-offbar]', (n) => n.getAttribute('role') === 'status' && !!n.querySelector('svg') && n.querySelector('strong').textContent === 'You are offline.'), 'the bar: role status, an icon, "You are offline." in bold');
  ok((await CV.txt(page, '[data-savetext]')) === 'Offline · kept on this device', 'the footer says offline at once (design 73b, before any change)');
  const col = await page.$eval('[data-offbar]', (n) => [getComputedStyle(n).backgroundColor, getComputedStyle(n).color]);
  ok(col[0] === 'rgb(253, 243, 220)' && col[1] === 'rgb(92, 61, 0)', `amber: ${col}`);
  // A change: kept on this device, not sent.
  const x1 = await move(14);
  await page.waitForTimeout(1000);
  let e = await E();
  ok(e.save === 'offline' && st.saves === saves0, `offline: no save call (state ${e.save}, saves ${st.saves - saves0})`);
  ok((await CV.txt(page, '[data-savetext]')) === 'Offline · kept on this device' && await page.$eval('[data-savetext]', (n) => n.classList.contains('is-offline') && !!n.querySelector('svg') && getComputedStyle(n).color === 'rgb(138, 90, 0)'), 'footer: Offline · kept on this device (warning color, an icon)');
  let k = await kept();
  ok(k && k.baseRev === 1 && k.layers.find((l) => l.src === 'title').x === x1 && k.bg === band.bg && k.fmt && k.fmt.pages === 54, `kept on this device: base rev ${k && k.baseRev}, the change in it`);
  ok(!(await CV.has(page, '[data-alert]:not([hidden])')), 'no red "Not saved" bar');
  ok(!e.pending, 'nothing pending once kept (no "Leave site?")');
  ok((await CV.txt(page, '[data-next-note]')) === 'Not done yet: export the cover files.', 'header: Not done yet (design 73b)');
  // A second change is kept too.
  const x2 = await move(6);
  await page.waitForTimeout(1000);
  k = await kept();
  ok(k.layers.find((l) => l.src === 'title').x === x2 && st.saves === saves0, 'a second change: kept, not sent');

  // AI: no call, plain words.
  const gen0 = st.gen.length;
  await page.click('[data-tool="book"]');
  await page.click('[data-open-blurb]');
  await page.click('[data-bl-write]');
  ok((await CV.txt(page, '.cv-bl-err')) === 'You are offline. Writing with AI needs a connection.' && st.gen.length === gen0, 'Write with AI: "You are offline. Writing with AI needs a connection.", no call');
  await page.click('[data-bl-close]');
  // Pixabay: no call, plain words.
  const calls0 = st.stock.calls.length;
  await page.click('[data-tool="images"]');
  await page.click('[data-srctab="pixabay"]');
  await page.fill('[data-stock-q]', 'green leaf');
  await page.click('[data-k="stk-go"]');
  ok((await CV.txt(page, '[data-stock-down]')) === 'You are offline. Pixabay and Unsplash need a connection.' && st.stock.calls.length === calls0, 'Pixabay search: "You are offline. Pixabay and Unsplash need a connection.", no call');

  // Back online: the design saves; the kept copy goes; the bar goes.
  await ctx.setOffline(false);
  await CV.settled(page, 'saved');
  ok(st.saves > saves0 && st.design.layers.find((l) => l.src === 'title').x === x2, 'back online: saved, with the last change');
  ok(!(await kept()), 'the kept copy is cleared after the save');
  ok(!(await CV.has(page, '[data-offbar]:not([hidden])')) && (await CV.txt(page, '[data-savetext]')) === '✓ Saved', 'the bar goes; ✓ Saved');
  // Pixabay works again (Try again).
  await page.click('[data-stock-retry]');
  await page.waitForTimeout(300);
  ok(st.stock.calls.length === calls0 + 1, 'online again: Try again searches');

  /* R15: a copy kept on this device whose base rev is the row's rev is the newest: it opens and saves. */
  st.design = { book_id: FIX.BOOK, layers: JSON.parse(JSON.stringify(band.layers)), bg: band.bg, fmt: { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const copyLayers = JSON.parse(JSON.stringify(band.layers)); copyLayers.find((l) => l.src === 'title').x += 33;
  await page.evaluate(([U, B, layers, bg]) => kdpCover.offline.write(U, B, { layers, bg: '#EAD9B8', layout: 'band', fmt: { trim: '6x9', pages: 54, paper: 'white' }, last_remap: null }, 5), [U, FIX.BOOK, copyLayers, band.bg]);
  const h0 = st.history.length;
  await CV.open(page);
  await CV.settled(page, 'saved');
  ok(st.design.bg === '#EAD9B8' && st.design.layers.find((l) => l.src === 'title').x === copyLayers.find((l) => l.src === 'title').x && st.design.rev === 6, 'base rev 5 = row rev 5: the kept copy opens and saves (rev 6)');
  ok(!(await kept()), 'and is cleared');
  ok(st.history.length === h0 + 1 && st.history[h0].reason === 'visit' && st.history[h0].bg === band.bg, 'the row as it was is the visit snapshot');

  /* R15: the row was saved after the copy (rev 7 > base 6) and is newer in time too (another device saved later): the row
     wins with no question; the copy goes into the history first. */
  const later = () => new Date(Date.now() + 60000).toISOString();
  const writeCopy = (bg, base) => page.evaluate(([U, B, layers, bg, base]) => kdpCover.offline.write(U, B, { layers, bg, layout: 'band', fmt: { trim: '6x9', pages: 54, paper: 'white' }, last_remap: null }, base), [U, FIX.BOOK, copyLayers, bg, base]);
  st.design.rev = 7; st.design.bg = '#FFFFFF';
  await writeCopy('#123456', 6);
  st.design.updated_at = later();
  const h1 = st.history.length;
  await CV.open(page);
  await page.waitForTimeout(500);
  ok(!(await CV.has(page, '[data-kept-ask]')) && (await CV.state(page)).bg === '#FFFFFF', 'row rev 7 > base 6 and the row is newer in time: the row opens, no question');
  ok(st.history.length === h1 + 1 && st.history[h1].bg === '#123456' && st.history[h1].reason === 'visit', 'the kept copy went into the history (reason visit)');
  ok(!(await kept()), 'then it is cleared');
  // The history snapshot fails: the copy stays on this device.
  await writeCopy('#123456', 2);
  st.design.updated_at = later();
  globalThis.__modes = { histFail: 1 };
  await CV.open(page);
  await page.waitForTimeout(500);
  ok(!!(await kept()), 'the snapshot failed: the kept copy stays (never dropped unsaved)');
  globalThis.__modes = {};
  await page.evaluate((k) => localStorage.removeItem(k), KEY);

  /* Owner, STOP 9 (N3): the row's rev is higher but the copy is newer in time (a save whose reply was lost, then more
     changes): the editor asks. */
  const ask = async () => {
    await CV.open(page, { ready: false });
    await page.waitForSelector('[data-kept-ask]', { timeout: 10000 });
  };
  st.design.rev = 9; st.design.bg = '#FFFFFF'; st.design.updated_at = new Date(Date.now() - 60000).toISOString();
  await writeCopy('#ABCDEF', 8);
  const at = (await kept()).at;
  const when = new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  await ask();
  ok((await CV.txt(page, '#cv-kept-p')) === `You have changes on this device from ${when} that were not saved. Keep them, or use the saved version?`, `the question, the owner's words: ${await CV.txt(page, '#cv-kept-p')}`);
  ok(await page.$eval('[data-kept-ask]', (c) => c.getAttribute('role') === 'alertdialog' && c.getAttribute('aria-labelledby') === 'cv-kept-h' && !!c.querySelector('svg')), 'an alertdialog with its title and an icon');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-kept-keep')), 'the focus: Keep them');
  ok((await CV.all(page, '[data-kept-ask] button')).join(' | ') === 'Keep them | Use the saved version', 'Keep them | Use the saved version');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-kept-keep')), 'Tab stays on the two buttons');
  const sz = await page.$$eval('[data-kept-ask] button', (a) => a.map((b) => Math.round(b.getBoundingClientRect().height)));
  ok(sz.every((h) => h >= 44), `44 px buttons (${sz})`);
  ok(st.saves >= 0 && (await CV.state(page)).status === 'ask', 'nothing opens or saves before the choice');
  const s0 = st.saves, h2 = st.history.length;
  // Keep them: the copy is saved as the row; the row as it was goes into the history.
  await page.click('[data-kept-keep]');
  await CV.ready(page);
  await CV.settled(page, 'saved');
  ok(st.design.bg === '#ABCDEF' && st.design.rev === 10 && st.saves > s0, 'Keep them: the device copy is saved as the row (rev 10)');
  ok(st.history.length === h2 + 1 && st.history[h2].bg === '#FFFFFF' && st.history[h2].reason === 'visit', 'the saved version as it was is in the history');
  ok(!(await kept()), 'the device copy is cleared after the save');
  // Use the saved version: the row stays; the device copy goes into the history, then it is cleared.
  st.design.bg = '#FFFFFF'; st.design.rev = 12; st.design.updated_at = new Date(Date.now() - 60000).toISOString();
  await writeCopy('#FEDCBA', 11);
  const s1 = st.saves, h3 = st.history.length;
  await ask();
  await page.click('[data-kept-saved]');
  await CV.ready(page);
  await page.waitForTimeout(400);
  ok((await CV.state(page)).bg === '#FFFFFF' && st.design.bg === '#FFFFFF' && st.saves === s1, 'Use the saved version: the saved row opens, nothing is written over it');
  ok(st.history.length === h3 + 1 && st.history[h3].bg === '#FEDCBA' && st.history[h3].reason === 'visit', 'the device copy is in the history (no silent loss)');
  ok(!(await kept()), 'then the device copy is cleared');
  // Use the saved version with the history down: the device copy stays (and the question comes again next time).
  await writeCopy('#FEDCBA', 11);
  globalThis.__modes = { histFail: 1 };
  await ask();
  await page.click('[data-kept-saved]');
  await CV.ready(page);
  await page.waitForTimeout(400);
  ok(!!(await kept()), 'the history could not be written: the device copy stays');
  globalThis.__modes = {};
  await ask();
  ok(true, 'the next open asks again');
  await page.click('[data-kept-saved]');
  await CV.ready(page);
  await page.waitForTimeout(400);
  ok(!(await kept()), 'then, with the history back: cleared');
  // Narrow window: the question fits (no notice; it is one card).
  await writeCopy('#FEDCBA', 11);
  await page.setViewportSize({ width: 800, height: 900 });
  await ask();
  ok(!(await CV.has(page, '[data-tiny]')) && await CV.noScroll(page), 'at 800 px: the question, no notice, no sideways scroll');
  await page.click('[data-kept-saved]');
  await CV.ready(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);

  /* A save that is out when the connection goes: offline (kept), not "Not saved". */
  await CV.open(page, { design: 'band' });
  globalThis.__modes = { saveSlow: 1200, saveFail: 1 };
  await move(5);
  await page.waitForTimeout(850);   // the save is out
  await ctx.setOffline(true);
  await page.waitForTimeout(1500);
  e = await E();
  ok(e.save === 'offline' && !!(await kept()) && !(await CV.has(page, '[data-alert]:not([hidden])')), `the save failed while offline: ${e.save}, kept, no red bar`);
  globalThis.__modes = {};
  await ctx.setOffline(false);
  await CV.settled(page, 'saved');
  ok(!(await kept()), 'back online: saved, the copy cleared');

  /* Leaving 09 offline: the saver saves when the connection is back. */
  await ctx.setOffline(true);
  const x3 = await move(9);
  await page.waitForTimeout(1000);
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  ok(st.design.layers.find((l) => l.src === 'title').x !== x3 && !!(await kept()), 'left 09 offline: kept on this device, not sent');
  await ctx.setOffline(false);
  await page.waitForTimeout(1500);
  ok(st.design.layers.find((l) => l.src === 'title').x === x3 && !(await kept()), 'back online on another step: saved, the copy cleared');

  /* Storage blocked or full: offline still works (nothing kept; the footer still says offline). */
  await CV.open(page, { design: 'band' });
  await page.evaluate(() => { Storage.prototype.__set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('QuotaExceededError'); }; });
  await ctx.setOffline(true);
  await move(3);
  await page.waitForTimeout(1000);
  ok((await E()).save === 'offline' && await page.evaluate(() => window.kdpBookSteps[9]._debug().keptOk === false), 'storage full: no crash, the editor knows nothing was kept');
  ok((await CV.txt(page, '[data-savetext]')) === 'Offline · not kept: this browser’s storage is full', `storage full: the footer says so (${await CV.txt(page, '[data-savetext]')})`);
  ok((await E()).pending === true, 'storage full: the change stays pending (the "Leave site?" warning stays on)');
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForSelector('[data-tiny]');
  ok((await CV.txt(page, '[data-tiny-save]')) === 'You are offline and this browser could not keep your last change. Keep this page open until you are back online.', 'storage full: the notice does not say kept');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype.__set; });
  await ctx.setOffline(false);
  await CV.settled(page, 'saved');
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
