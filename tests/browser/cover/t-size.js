// E16 Part 9: the book size changed in 08 (design 72, plan §4). On open, a design laid out for another size is
// remapped (the design's remap, unchanged), saved with its new fmt and last_remap in ONE update (the 0030 CHECKs the
// mock holds), the design as it was goes into the history (reason remap, one snapshot), Undo starts again, the view
// fits; the amber note (F72 words), Show what moved, Add spine text, × (seen, saved), the header line, Next off. A
// second open does not remap again; the note stays until it is closed. Trim and paper changes; Locked when the PDF
// is not current.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  const band = await FIX.band(page);
  const designOf = (fmt, extra) => Object.assign({ book_id: FIX.BOOK, layers: JSON.parse(JSON.stringify(band.layers)), bg: band.bg, fmt: { ...fmt }, layout: 'band', last_remap: null, rev: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, extra || {});
  const designSaves = () => st.writes.filter((w) => w.table === 'cover_designs' && w.body);
  const E = () => page.evaluate(() => { const e = window.kdpBookSteps[9]._debug(); return { note: e.remapNote, fmt: e.cover.fmt, undo: e.hist.canUndo(), z: e.view.z, sel: e.sel, multi: e.multi, save: e.saveState }; });

  /* F72: 54 → 120 pages, white. */
  st.pdf.page_count = 120;
  st.design = designOf(FIX.fmt);
  st.history = []; st.writes = [];
  await CV.open(page);
  await CV.settled(page, 'saved');
  let e = await E();
  ok(e.fmt.pages === 120 && e.fmt.trim === '6x9' && e.fmt.paper === 'white', `remapped to ${JSON.stringify(e.fmt)}`);
  const saves = designSaves();
  ok(saves.length === 1, `one update after the remap (${saves.length})`);
  const b0 = saves[0] && saves[0].body;
  ok(b0 && b0.layers && JSON.stringify(b0.fmt) === JSON.stringify({ trim: '6x9', pages: 120, paper: 'white' }) && b0.last_remap && b0.last_remap.moved, 'the update holds layers, fmt and last_remap together');
  ok(b0 && JSON.stringify(Object.keys(b0.last_remap.from)) === '["trim","pages","paper"]' && b0.last_remap.from.pages === 54 && b0.last_remap.to.pages === 120 && b0.last_remap.seen === false, 'last_remap: from 54, to 120, seen false (0030 shape)');
  ok(b0 && b0.rev === undefined && saves[0].rev === 3, 'written where rev = 3 (the rev read)');
  ok(st.design.rev === 4 && JSON.stringify(st.design.fmt) === JSON.stringify({ trim: '6x9', pages: 120, paper: 'white' }), 'the row: rev 4, fmt 120');
  ok(st.history.length === 1 && st.history[0].reason === 'remap' && st.history[0].fmt.pages === 54, `one snapshot, reason remap, the design as it was (${st.history.map((h) => h.reason)})`);
  ok(!e.undo, 'Undo starts again (nothing to undo)');
  ok(CV.mockErrors().length === 0, 'the mock took the update (fmt and last_remap CHECKs)');

  // The note: design 72's words.
  const t = await CV.txt(page, '.cv-sn-b');
  ok(t === 'Your book changed in 08 Format: 54 → 120 pages. Spine 0.122 → 0.270 in. NicheInk moved your design to fit.', `note: ${t}`);
  const sub = await CV.txt(page, '.cv-sn-t > div:last-child');
  ok(sub === '4 layers moved. Check them, then export again: your old files no longer fit.', `note: ${sub} (design: 4 layers)`);
  ok(await page.$eval('[data-sizenote]', (n) => n.getAttribute('role') === 'status' && !n.hidden && !!n.querySelector('svg')), 'the note: role status, an icon');
  const lines = await page.$eval('.cv-sn-b', (b) => Math.round(b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight)));
  ok(lines <= 2, `the first line wraps in 2 lines at most at 1440 (${lines}, design 72: 2)`);
  const bg = await page.$eval('[data-sizenote]', (n) => [getComputedStyle(n).backgroundColor, getComputedStyle(n).color]);
  ok(bg[0] === 'rgb(253, 243, 220)' && bg[1] === 'rgb(92, 61, 0)', `amber: ${bg}`);
  ok(await CV.has(page, '[data-size-moved]') && await CV.has(page, '[data-size-spine]'), 'Show what moved and Add spine text (120 pages allows spine text)');
  ok((await CV.txt(page, '[data-next-note]')) === 'The book size changed: export again.', 'header: The book size changed: export again.');
  ok(await page.$eval('[data-next]', (b) => b.disabled), 'Next off');
  ok((await CV.txt(page, '.cv-specs')).includes('120 pages') && (await CV.txt(page, '.cv-specs')).includes('spine 0.270 in'), 'status bar: 120 pages, spine 0.270 in');
  ok(e.z < 1, `the view fits (zoom ${Math.round(e.z * 100)}%)`);

  // Show what moved: the moved layers selected.
  await page.click('[data-size-moved]');
  e = await E();
  ok(e.multi.length === 4 && e.sel == null, `Show what moved: ${e.multi.length} layers selected`);
  ok(await CV.has(page, '.cv-textbar:not([hidden])'), 'the several-selected bar shows');
  // Add spine text: one spine layer; the button goes.
  await page.click('[data-size-spine]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'spine'), null, { timeout: 10000 });
  ok(!(await CV.has(page, '[data-size-spine]')), 'Add spine text: the button goes when spine text is on');
  ok((await CV.state(page)).layers.filter((l) => l.src === 'spine').length === 1, 'one spine layer');
  await CV.settled(page, 'saved');

  // A second open: no remap again; the note still shows (not seen).
  const n0 = designSaves().length, h0 = st.history.length;
  await CV.open(page);
  await page.waitForTimeout(900);
  e = await E();
  ok(designSaves().length === n0 && st.history.length === h0, 'a second open does not remap again (no save, no snapshot)');
  ok(await CV.has(page, '[data-sizenote]:not([hidden])') && e.note && e.note.seen === false, 'the note shows again (not closed)');
  ok((await CV.txt(page, '.cv-sn-t > div:last-child')).startsWith('4 layers moved'), 'the same words');
  ok(!(await CV.has(page, '[data-size-spine]')), 'no Add spine text: spine text is on the cover');

  // × closes it: seen true, saved; the header line goes back.
  await page.click('[data-size-x]');
  ok(!(await CV.has(page, '[data-sizenote]:not([hidden])')), '× closes the note');
  await CV.settled(page, 'saved');
  const last = CV.lastSave();
  ok(last && last.body.last_remap && last.body.last_remap.seen === true && last.body.fmt === undefined, 'saved: last_remap seen true (fmt not sent again)');
  ok(st.design.last_remap.seen === true, 'the row: seen');
  ok((await CV.txt(page, '[data-next-note]')) !== 'The book size changed: export again.', `header after ×: ${await CV.txt(page, '[data-next-note]')}`);
  await CV.open(page);
  ok(!(await CV.has(page, '[data-sizenote]:not([hidden])')), 'closed stays closed on the next open');

  /* 120 → 54 pages: spine text stays and C5 says Must fix (plan X3, as F72 shows). */
  st.pdf.page_count = 54;
  await CV.open(page);
  await CV.settled(page, 'saved');
  ok(await CV.has(page, '[data-sizenote]:not([hidden])'), '120 → 54: the note again');
  ok(!(await CV.has(page, '[data-size-spine]')), 'no Add spine text at 54 pages');
  const chk = await page.evaluate(() => window.kdpBookSteps[9]._debug().checkItems().map((c) => c.code));
  ok(chk.includes('C5'), `the spine text stays; C5 Must fix (${chk})`);

  /* Paper white → cream (not in format_key: the PDF stays current, remap at once). */
  st.pdf.page_count = 120;
  st.design = designOf({ trim: '6x9', pages: 120, paper: 'white' });
  st.book.paper = 'cream';
  await CV.open(page);
  await CV.settled(page, 'saved');
  ok((await CV.txt(page, '.cv-sn-b')).startsWith('Your book changed in 08 Format: white → cream paper. Spine 0.270 → 0.300 in.'), `paper: ${await CV.txt(page, '.cv-sn-b')}`);
  st.book.paper = 'white';

  /* Trim 6 × 9 → 8.5 × 11 (wide): words, sizes, remap saved. */
  st.book.trim = '8.5x11';
  st.design = designOf(FIX.fmt);
  st.pdf.page_count = 54;
  await CV.open(page);
  await CV.settled(page, 'saved');
  ok((await CV.txt(page, '.cv-sn-b')).startsWith('Your book changed in 08 Format: trim 6 × 9 → 8.5 × 11 in. Spine 0.122 → 0.122 in.'), `trim: ${await CV.txt(page, '.cv-sn-b')}`);
  ok(st.design.fmt.trim === '8.5x11' && CV.mockErrors().length === 0, 'saved at 8.5 × 11');
  st.book.trim = '6x9';

  /* Nothing moved: "Nothing needed to move." and no Show what moved. */
  st.design = designOf({ trim: '6x9', pages: 54, paper: 'white' }, { layers: [] });
  st.pdf.page_count = 60;
  await CV.open(page);
  await CV.settled(page, 'saved');
  ok((await CV.txt(page, '.cv-sn-t > div:last-child')) === 'Nothing needed to move. Export again: your old files no longer fit.', 'empty cover: Nothing needed to move.');
  ok(!(await CV.has(page, '[data-size-moved]')), 'no Show what moved');

  /* The remap save fails: the note shows, Not saved with Retry; Retry writes fmt and last_remap. */
  st.design = designOf(FIX.fmt);
  st.pdf.page_count = 120;
  globalThis.__modes = { saveFail: 1 };
  await CV.open(page);
  await CV.settled(page, 'failed');
  ok(await CV.has(page, '[data-sizenote]:not([hidden])') && await CV.has(page, '[data-alert]:not([hidden])'), 'save failed: the note and the red bar');
  await page.click('[data-alert] [data-retry-save]');
  await CV.settled(page, 'saved');
  ok(st.design.fmt.pages === 120 && st.design.last_remap && st.design.last_remap.to.pages === 120, 'Retry saved fmt and last_remap');
  globalThis.__modes = {};

  /* Locked: a trim change stales the Print PDF; no remap while Locked. */
  st.design = designOf(FIX.fmt);
  st.pdf.current = false;
  const n1 = designSaves().length;
  await CV.open(page);
  ok((await CV.state(page)).status === 'locked' && designSaves().length === n1, 'no current Print PDF: Locked, no remap');
  st.pdf.current = true; st.pdf.page_count = FIX.fmt.pages;

  /* Keyboard: the note's buttons are reachable, 44 px click areas, focus ring. */
  st.design = designOf(FIX.fmt);
  st.pdf.page_count = 120;
  await CV.open(page);
  await CV.settled(page, 'saved');
  for (const sel of ['[data-size-moved]', '[data-size-spine]', '[data-size-x]']) {
    const r = await page.$eval(sel, (b) => { const a = getComputedStyle(b, '::after'); return [parseFloat(a.width), parseFloat(a.height)]; });
    ok(r[0] >= 44 && r[1] >= 44, `${sel}: click area ${r.map(Math.round).join(' × ')}`);
  }
  await page.focus('[data-size-x]');
  await page.keyboard.press('Enter');
  ok(!(await CV.has(page, '[data-sizenote]:not([hidden])')), 'Enter on × closes it');
  st.pdf.page_count = FIX.fmt.pages;
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
