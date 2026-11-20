// E16 Part 10: the Export dialog (plan §5, designs 71, 71b, 73d) with the real engine (the Typst files from the test
// cache): ready (the 3 options, the design's words), blocked (Must fix, offline), the steps with Stop (Stop, ×, Escape,
// leaving 09: nothing recorded), done (the files with their real sizes, Download, Download all (.zip), the KDP lines),
// the header "Done: cover files exported." and Next on (from the data on open too), export failed (the engine, the
// canvas size on a device that cannot paint the JPG, the KDP checks, the guard's codes, another tab, a picture, the
// connection, an unsaved change), My layouts (one per book, replaced; a failure there leaves the files recorded),
// the size note closed by an export, Preview final's Export cover.
// Downloads are saved to tests/browser/shots/cover/dl/ (ignored by git) for `unzip -t` at STOP 10.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const TITLE_SLUG = 'micro-study-habits-for-busy-adult-learners_6x9_54p_white';
  const DL = SHOTS + '/dl';
  const dlg = '[data-exdlg]';
  const phase = () => page.$eval(`${dlg} .cv-ex`, (d) => d.dataset.exPhase).catch(() => null);
  const waitPhase = (p) => page.waitForFunction((p) => { const d = document.querySelector('[data-exdlg] .cv-ex'); return d && d.dataset.exPhase === p; }, p, { timeout: 120000 });
  const gone = () => page.waitForFunction(() => !document.querySelector('[data-exdlg]'), null, { timeout: 10000 });
  const openEx = async () => { await page.click('[data-export]'); await page.waitForSelector(dlg); };
  const hold = (k) => page.evaluate((k) => { window.__held = null; window.__rel = null; kdpCover.exportDialog.test.hold = (s) => (s === k ? new Promise((r) => { window.__held = s; window.__rel = r; }) : null); }, k);
  const held = (k) => page.waitForFunction((k) => window.__held === k, k, { timeout: 60000 });
  const release = () => page.evaluate(() => { kdpCover.exportDialog.test.hold = null; if (window.__rel) window.__rel(); });
  const failAt = (k, err) => page.evaluate(([k, err]) => { kdpCover.exportDialog.test.fail = (s) => (s === k ? Object.assign(new Error(err.message || 'x'), err) : null); }, [k, err]);
  const noFail = () => page.evaluate(() => { kdpCover.exportDialog.test.fail = null; kdpCover.exportDialog.test.hold = null; });
  const recs = () => st.writes.filter((w) => w.table === 'cover_exports');
  const note = () => CV.txt(page, '[data-next-note]');
  const nextOn = () => page.$eval('[data-next]', (b) => !b.disabled);
  const fresh = async (opts = {}) => {
    globalThis.__modes = {};
    st.exports = []; st.my = []; st.history = []; st.writes = []; st.calls = []; st.keyReads = 0;
    st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
    st.book.trim = '6x9'; st.book.paper = 'white';
    await CV.open(page, { design: opts.design || 'band' });
    await noFail();
  };
  const run = async () => { await page.click('[data-ex-go]'); };

  await page.setViewportSize({ width: 1440, height: 900 });

  /* ── A. Ready (design 71) ── */
  await fresh();
  ok((await note()) === 'Not done yet: export the cover files.' && !(await nextOn()), 'before: "Not done yet: export the cover files.", Next off');
  await openEx();
  ok((await phase()) === 'ready', 'Export cover opens the dialog (ready)');
  ok((await CV.txt(page, '#cv-ex-h')) === 'Export cover', 'title: Export cover');
  ok((await CV.txt(page, '#cv-ex-sub')) === '6 × 9 in · 54 pages · white paper · spine 0.122 in', `sub line (${await CV.txt(page, '#cv-ex-sub')})`);
  const opts = await CV.all(page, `${dlg} .cv-ex-opt`);
  ok(opts[0] === 'Print cover PDF (always included) For KDP Paperback. Full wrap 12.372 × 9.25 in with bleed. Fonts embedded, see-through parts flattened, one sRGB color space. No template lines.', `Print PDF words (${opts[0]})`);
  ok(opts[1] === 'Full cover image The same wrap as a picture, 300 DPI (3712 × 2775 px). For your records, ads or a print shop. PNG, best quality JPG, smaller file', `full image words (${opts[1]})`);
  ok(opts[2] === 'Kindle front cover For KDP eBook. JPG, 1600 × 2560 px, made from your print front. Turn it off if this book has no eBook.', 'Kindle words');
  ok((await CV.txt(page, `${dlg} .cv-ex-my`)) === 'This design is also saved to Layouts, My layouts (the last 5 of each book), so you can reuse it for your next book or a series.', 'the My layouts line (0032, Q-10: the last 5 of each book)');
  ok(await page.$eval(`${dlg} .is-fixed input`, (i) => i.checked && i.disabled), 'Print PDF: ticked and fixed');
  ok(await page.$eval('[data-ex-img]', (i) => i.checked) && await page.$eval('[data-ex-kindle]', (i) => i.checked), 'full image and Kindle: on by default');
  ok(await page.$eval('[data-ex-fmt="png"]', (b) => b.getAttribute('aria-pressed') === 'true') && await page.$eval('[data-ex-fmt="jpg"]', (b) => b.getAttribute('aria-pressed') === 'false'), 'PNG pressed by default');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ex-img]')), 'focus: the first option');
  ok(await page.$eval(dlg, (w) => { const r = w.getBoundingClientRect(); return r.top === 0 && r.left === 0 && r.width === innerWidth && r.height === innerHeight; }), 'the gray covers the whole page (header too)');
  ok(await page.$eval(`${dlg} .cv-ex`, (d) => d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true'), 'role dialog, aria-modal');
  // Tab stays inside.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => !!document.activeElement.closest('[data-exdlg]')), 'Tab stays inside the dialog');
  await page.click('[data-ex-fmt="jpg"]');
  ok(await page.$eval('[data-ex-fmt="jpg"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'JPG, smaller file: pressed');
  await page.click('label.cv-ex-box:has([data-ex-img])');
  ok(await page.$eval('[data-ex-fmt="png"]', (b) => b.getAttribute('aria-disabled') === 'true'), 'full image off: the file types are off');
  await page.click('label.cv-ex-box:has([data-ex-img])'); await page.click('[data-ex-fmt="png"]');
  await page.click('[data-ex-close]'); await gone();
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-export]')), '× closes; focus back on Export cover');
  await openEx(); await page.keyboard.press('Escape'); await gone();
  ok(true, 'Escape closes');
  await openEx(); await page.mouse.click(30, 450); await gone();
  ok(true, 'a click on the gray closes');
  await openEx(); await page.click('[data-k="ex-cancel"]'); await gone();
  ok(recs().length === 0 && st.keyReads === 0, 'Cancel: nothing read, nothing recorded');

  /* ── B. Blocked: Must fix, offline ── */
  await fresh({ design: 'empty' });
  await openEx();
  ok((await CV.txt(page, '[data-ex-blocked] strong')) === '3 problems must be fixed first', `blocked: "3 problems must be fixed first" (${await CV.txt(page, '[data-ex-blocked] strong')})`);
  ok((await CV.all(page, '[data-ex-blocked] .cv-ex-li')).length === 3, 'the 3 Must fixes listed');
  ok(await page.$eval('[data-ex-blocked]', (e) => e.getAttribute('role') === 'alert' && !!e.querySelector('svg')), 'the red box: role alert, with its icon');
  ok(await page.$eval('[data-ex-go]', (b) => b.getAttribute('aria-disabled') === 'true'), 'Export is off');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ex-checks]')), 'focus: Open Checks');
  await page.click('[data-ex-go]', { force: true }); await page.waitForTimeout(300);
  ok((await phase()) === 'ready' && st.keyReads === 0, 'a press on Export does nothing');
  await page.click('[data-ex-checks]'); await gone();
  ok(await page.evaluate(() => window.kdpBookSteps[9]._debug().checksOpen), 'Open Checks: the dialog closes, the Checks drawer opens');
  await page.keyboard.press('Escape');
  await fresh();
  await page.context().setOffline(true);
  await page.waitForSelector('[data-offbar]:not([hidden])');
  await openEx();
  ok((await CV.txt(page, '[data-ex-blocked] strong')) === 'You are offline. Export needs a connection.', 'offline: "You are offline. Export needs a connection."');
  ok(await page.$eval('[data-ex-go]', (b) => b.getAttribute('aria-disabled') === 'true') && !(await page.$('[data-ex-checks]')), 'offline: Export off, no Open Checks');
  await page.context().setOffline(false);
  await page.waitForFunction(() => !document.querySelector('[data-ex-blocked]'));
  ok(await page.$eval('[data-ex-go]', (b) => !b.hasAttribute('aria-disabled')), 'back online: the dialog opens up again');
  await page.click('[data-ex-close]'); await gone();
  await CV.settled(page);

  /* ── C. Busy and Stop: nothing recorded ── */
  for (const [at, how] of [['image', 'Stop'], ['kindle', 'Escape'], ['check', '×']]) {
    await fresh();
    await openEx(); await hold(at); await run(); await held(at);
    if (at === 'image') {
      const steps = (await CV.all(page, '[data-ex-step]')).map((t) => t.replace(/ ,/g, ','));
      ok(JSON.stringify(steps) === JSON.stringify(['Building the print cover PDF (12.372 × 9.25 in, bleed included), done', 'Checking it against KDP rules, done', 'Making the full cover image (PNG, 300 DPI), working', 'Making the Kindle front cover (JPG, 1600 × 2560 px)', 'Saving this design to My layouts']), `the design's 5 steps (${JSON.stringify(steps)})`);
      ok(await page.$eval('[data-ex-step="print"]', (e) => e.classList.contains('is-done')) && await page.$eval('[data-ex-step="image"]', (e) => e.classList.contains('is-now')), 'dots: done, done, now, to do');
      ok((await CV.txt(page, `${dlg} .cv-ex-note`)) === 'You can keep this window open. It takes under a minute.', 'the busy line');
      ok(await page.$eval('[data-ex-steps]', (e) => e.getAttribute('role') === 'status'), 'steps: role status');
      ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ex-stop]')), 'focus: Stop');
    }
    if (how === 'Stop') await page.click('[data-ex-stop]'); else if (how === 'Escape') await page.keyboard.press('Escape'); else await page.click('[data-k="ex-x"]');
    await gone();
    await release();
    await page.waitForTimeout(1500);
    ok(recs().length === 0 && st.my.length === 0 && !st.history.some((h) => h.reason === 'export'), `${how} at ${at}: nothing recorded, no My layout, no snapshot`);
    ok((await note()) === 'Not done yet: export the cover files.' && !(await nextOn()), `${how}: not done, Next off`);
  }
  // Leaving 09 while it runs: nothing recorded.
  await fresh();
  await openEx(); await hold('kindle'); await run(); await held('kindle');
  await page.evaluate(() => document.querySelector('a[data-step="8"]').click());
  await page.waitForFunction(() => /step=8/.test(location.href), null, { timeout: 15000 });
  await release(); await page.waitForTimeout(1500);
  ok(recs().length === 0 && st.my.length === 0, 'leaving 09 during the export: nothing recorded');

  /* ── D. Done (design 71b): PNG + Kindle ── */
  await fresh();
  const key0 = await page.evaluate(() => window.kdpBookSteps[9]._debug().data.key);
  await openEx(); await run(); await waitPhase('done');
  ok((await CV.txt(page, '[data-ex-done]')) === 'Your cover files are ready. The design is saved to My layouts.', 'done: "Your cover files are ready. The design is saved to My layouts."');
  ok(await page.$eval('[data-ex-done]', (e) => !!e.querySelector('svg') && e.getAttribute('role') === 'status'), 'the green line: its icon, role status');
  const files = await page.$$eval('[data-ex-file]', (es) => es.map((e) => ({ kind: e.dataset.exFile, name: e.querySelector('.cv-ex-fn').textContent, what: e.querySelector('.cv-ex-fw').textContent })));
  ok(files.map((f) => f.name).join(' ') === `${TITLE_SLUG}_cover.pdf ${TITLE_SLUG}_cover.png ${TITLE_SLUG}_kindle.jpg`, `file names (${files.map((f) => f.name).join(' ')})`);
  ok(/^Paperback cover for KDP, full wrap with bleed, fonts embedded, one sRGB color space · \d+(\.\d)? (KB|MB)$/.test(files[0].what), `PDF line + real size (${files[0].what})`);
  ok(/^The same full cover as an image, 300 DPI \(3712 × 2775 px\) · \d+(\.\d)? (KB|MB)$/.test(files[1].what), `PNG line + real size (${files[1].what})`);
  ok(/^Kindle eBook cover, 1600 × 2560 px, made from your front · \d+(\.\d)? (KB|MB)$/.test(files[2].what), `Kindle line + real size (${files[2].what})`);
  ok((await CV.txt(page, '[data-ex-kdp]')) === 'Where they go on KDP Paperback: Content, Cover, "Upload a cover you already have", then the PDF. Kindle eBook: Content, Kindle eBook Cover, "Upload your cover file", then the JPG. Check it in the KDP Previewer before you publish.', 'the KDP lines');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ex-dl="0"]')), 'focus: the first Download');
  // Records: one insert, 3 rows, today's key.
  const ins = recs();
  ok(ins.length === 1 && ins[0].insert.length === 3, `one insert of 3 rows (${ins.length})`);
  const pr = ins[0].insert.find((x) => x.kind === 'print'), ir = ins[0].insert.find((x) => x.kind === 'image'), kr = ins[0].insert.find((x) => x.kind === 'kindle');
  ok(pr && pr.width_in === 12.3716 && pr.height_in === 9.25 && pr.spine_in === 0.1216 && pr.settings_key === key0 && /^data:image\/jpeg;base64,/.test(pr.thumb) && pr.thumb.length <= 20000, `print row: 12.3716 × 9.25, spine 0.1216, the key, a thumb of ${pr && pr.thumb.length} characters`);
  ok(pr && pr.engine === 'typst 0.14.2 · c2' && ir.engine === 'browser canvas' && kr.engine === 'browser canvas', `engine names: ${pr && pr.engine}, ${ir && ir.engine}`);
  ok(ir && ir.width_px === 3712 && ir.height_px === 2775 && ir.thumb === undefined && kr && kr.width_px === 1600 && kr.height_px === 2560, 'image row 3712 × 2775, kindle row 1600 × 2560');
  ok(st.exports.length === 3, 'the mock kept 3 rows (the guard passed)');
  ok(st.my.length === 1 && st.my[0].name === 'Band' && st.my[0].from_book_id === FIX.BOOK && st.my[0].from_title === FIX.title && st.my[0].thumb === pr.thumb, `My layouts: one entry "Band" from this book (${st.my.map((m) => m.name)})`);
  const up = st.writes.find((w) => w.table === 'cover_my_layouts' && w.insert);
  ok(up && !up.onConflict && !/merge-duplicates/.test(up.prefer), `(0032) saved as a plain insert, no on_conflict (${up && up.onConflict}, ${up && up.prefer})`);
  ok(JSON.stringify(st.my[0].layers) === await page.evaluate(() => JSON.stringify(window.kdpBookSteps[9]._debug().cover.layers)), 'the entry holds the design as exported');
  ok(st.history.some((h) => h.reason === 'export'), 'a history snapshot, reason export');
  ok((await note()) === 'Done: cover files exported.' && await nextOn(), 'header: "Done: cover files exported.", Next on');
  // Downloads.
  for (const [i, f] of files.entries()) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-ex-dl="${i}"]`)]);
    ok(d.suggestedFilename() === f.name, `Download ${f.kind}: ${d.suggestedFilename()}`);
    await d.saveAs(`${DL}/${d.suggestedFilename()}`);
  }
  const [z] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-ex-zip]')]);
  ok(z.suggestedFilename() === `${TITLE_SLUG}_cover_files.zip`, `Download all: ${z.suggestedFilename()}`);
  await z.saveAs(`${DL}/${z.suggestedFilename()}`);
  log.push(`INFO downloads saved to ${DL}`);
  await page.click('[data-k="ex-done"]'); await gone();
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-export]')), 'Done closes; focus on Export cover');
  // Next is on: 10 is a v3 step (its tip), a press stays on 09 and does not move current_step.
  const nx = await page.$eval('[data-next]', (b) => ({ tip: (b.querySelector('.tip') || {}).textContent, desc: b.getAttribute('aria-describedby') }));
  ok(nx.tip === '10 Metadata comes in v3' && nx.desc === 'nextNote nextTip', `Next's tip: "10 Metadata comes in v3" (${JSON.stringify(nx)})`);
  await page.click('[data-next]'); await page.waitForTimeout(400);
  ok(/step=9/.test(page.url()) && !st.writes.some((w) => w.table === 'books' && w.body && w.body.current_step === 10), 'Next stays on 09 and keeps current_step');
  // The Layouts panel lists the new entry.
  await page.click('[data-tool="layouts"]');
  ok((await CV.all(page, '[data-panel] .cv-my-name')).some((t) => /Band/.test(t)) || (await CV.txt(page, '[data-panel]')).includes('Band'), 'Layouts, My layouts: the new entry is listed');
  // (0032) A second export adds a second entry for this book (up to 5 per book), listed first.
  const first = st.my[0].id;
  await openEx(); await run(); await waitPhase('done');
  ok(st.my.length === 2 && st.my.some((m) => m.id === first) && recs().length === 2, '(0032) export again: a second My layout for this book (the first kept), a second insert');
  ok((await page.evaluate(() => window.kdpBookSteps[9]._debug().my.map((m) => m.id))).join() === [st.my[1].id, first].join(), '(0032) the panel list: the new entry first, the first one kept');
  await page.keyboard.press('Escape'); await gone();

  /* ── E. Done from the data; any change turns it off; Undo back on ── */
  await CV.open(page, { design: 'keep' });
  ok((await note()) === 'Done: cover files exported.' && await nextOn(), 'reopened: "Done" and Next on from the last print export (its key is today\'s)');
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.setLayer(t.id, { x: t.x + 5 }); });
  await page.waitForTimeout(200);
  ok((await note()) === 'Not done yet: export the cover files.' && !(await nextOn()), 'a change: "Not done yet", Next off');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(300);
  ok((await note()) === 'Done: cover files exported.' && await nextOn(), 'Undo back to the exported design: Done again');
  await CV.settled(page);
  // The rail mark of 09 on another step (cover_marks).
  await page.evaluate(() => document.querySelector('a[data-step="8"]').click());
  await page.waitForFunction(() => /step=8/.test(location.href), null, { timeout: 15000 });
  ok(await page.$eval('a[data-step="9"]', (a) => a.classList.contains('is-done')), 'on 08: the 09 row is done');
  // The book size changed: not done; an export closes the size note (last_remap.seen).
  st.pdf.page_count = 120;
  await CV.open(page, { design: 'keep' });
  await CV.settled(page, 'saved');
  ok((await note()) === 'The book size changed: export again.' && !(await nextOn()), 'size changed: "The book size changed: export again.", Next off');
  await openEx(); await run(); await waitPhase('done');
  await page.keyboard.press('Escape'); await gone();
  await CV.settled(page, 'saved');
  ok(!(await page.$eval('[data-sizenote]', (e) => !e.hidden)) && st.design.last_remap && st.design.last_remap.seen === true, 'the export closes the size note (last_remap.seen saved)');
  ok((await note()) === 'Done: cover files exported.', 'then: Done');
  st.pdf.page_count = 54;

  /* ── F. JPG, Kindle off; image off ── */
  await fresh();
  await openEx(); await page.click('[data-ex-fmt="jpg"]'); await page.click('label.cv-ex-opt:has([data-ex-kindle])');
  await hold('save'); await run(); await held('save');
  ok((await CV.all(page, '[data-ex-step]')).length === 4 && (await CV.txt(page, '[data-ex-step="image"]')).startsWith('Making the full cover image (JPG, 300 DPI)'), 'JPG, no Kindle: 4 steps, "(JPG, 300 DPI)"');
  await release(); await waitPhase('done');
  ok(JSON.stringify(recs()[0].insert.map((x) => x.kind)) === '["print","image"]', 'rows: print, image');
  ok((await CV.all(page, '[data-ex-file] .cv-ex-fn')).join(' ') === `${TITLE_SLUG}_cover.pdf ${TITLE_SLUG}_cover.jpg`, 'files: the PDF and the JPG');
  ok(!(await CV.txt(page, '[data-ex-kdp]')).includes('Kindle'), 'the KDP lines leave out Kindle');
  await page.keyboard.press('Escape'); await gone();
  await openEx();
  ok(await page.$eval('[data-ex-fmt="jpg"]', (b) => b.getAttribute('aria-pressed') === 'true') && !(await page.$eval('[data-ex-kindle]', (i) => i.checked)), 'the choices stay for this visit');
  await page.click('label.cv-ex-box:has([data-ex-img])'); await run(); await waitPhase('done');
  ok(JSON.stringify(recs()[1].insert.map((x) => x.kind)) === '["print"]', 'image and Kindle off: one row, print');
  await page.keyboard.press('Escape'); await gone();

  /* ── G. Export failed (design 73d) and Try again ── */
  const failed = async () => { await waitPhase('failed'); return CV.txt(page, '[data-ex-failed]'); };
  // The engine did not start (its files do not load): the design's words.
  await fresh();
  globalThis.__modes.engineDown = true;
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); if (E.exEngine) { E.exEngine.terminate(); E.exEngine = null; } });
  await openEx(); await run();
  const t73d = await failed();
  ok(t73d === 'Export stopped. The PDF engine did not start, so nothing was made and nothing was saved. Check your connection and try again. If it happens again, reload the page.', `engine down: design 73d's words (${t73d})`);
  ok(await page.$eval('[data-ex-failed]', (e) => e.getAttribute('role') === 'alert' && !!e.querySelector('svg')), 'the red box: role alert, its icon');
  ok((await CV.all(page, `${dlg} .cv-ex-foot button`)).join('|') === 'Close|Try again', 'Close and Try again');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-ex-retry]')), 'focus: Try again');
  ok(recs().length === 0 && st.my.length === 0, 'nothing recorded');
  globalThis.__modes.engineDown = false;
  await page.click('[data-ex-retry]'); await waitPhase('done');
  ok(recs().length === 1, 'Try again: done');
  await page.keyboard.press('Escape'); await gone();
  // The full image as one JPG on a device that cannot paint it (iPad, owner STOP 2).
  await fresh();
  await openEx(); await page.click('[data-ex-fmt="jpg"]');
  await failAt('image', { kind: 'canvas', message: 'The full image (3712 × 2775 px) is larger than this browser\'s canvas.' });
  await run();
  const tc = await failed();
  ok(tc === 'Export stopped. This device cannot paint the full image as one JPG (3712 × 2775 px is more than its browser can draw at once), so nothing was saved. Pick "PNG, best quality", which is made in parts, and try again, or export on a computer.', `canvas: the size and what to do (${tc})`);
  ok(recs().length === 0, 'canvas: nothing recorded');
  await noFail(); await page.keyboard.press('Escape'); await gone();
  // A KDP check fails: listed.
  await fresh();
  await page.evaluate(() => { const C = kdpCover, orig = C.export.print; C.export.__orig = orig; C.export.print = async (...a) => { const r = await orig(...a); r.checks.find((c) => c.key === 'glyphs').pass = false; r.checks.find((c) => c.key === 'glyphs').detail = 'Abril Fatface 400 has no "ā" (U+0101)'; r.ok = false; return r; }; });
  await openEx(); await run();
  const tk = await failed();
  ok(tk.startsWith('Export stopped. The print PDF did not pass the KDP checks, so nothing was saved.') && tk.includes('• Every letter in its font: Abril Fatface 400 has no "ā" (U+0101)'), `KDP checks: the check and its detail (${tk})`);
  ok(recs().length === 0, 'checks: nothing recorded');
  await page.evaluate(() => { kdpCover.export.print = kdpCover.export.__orig; });
  await page.keyboard.press('Escape'); await gone();
  // The guard refuses (another tab saved first): cover_stale; nothing kept, no My layout.
  await fresh();
  globalThis.__modes.recCode = 'cover_stale';
  await openEx(); await run();
  ok((await failed()) === 'Export stopped. Your cover changed in another tab while the files were made, so nothing was saved. Export again.', 'cover_stale: its words');
  ok(st.exports.length === 0 && st.my.length === 0, 'cover_stale: no rows, no My layout');
  await page.click('[data-ex-retry]'); await waitPhase('done');
  ok(st.exports.length === 3, 'Try again: done');
  await page.keyboard.press('Escape'); await gone();
  // Another tab changes the design during the export: the second key read differs (no insert at all).
  await fresh();
  globalThis.__modes.keyHook = (n) => { if (n === 1) { st.design.layers = st.design.layers.map((l) => (l.src === 'title' ? Object.assign({}, l, { x: l.x + 3 }) : l)); st.design.rev++; } };
  await openEx(); await run();
  ok((await failed()).includes('Your cover changed in another tab') && recs().length === 0, 'the key changed during the export: stopped before any insert');
  globalThis.__modes.keyHook = null;
  await page.click('[data-ex-close]'); await gone(); await CV.quiet(page);
  // Another tab saved a newer design before this export (this tab has no change of its own): its layers are old.
  await fresh();
  st.design.layers = st.design.layers.map((l) => (l.src === 'title' ? Object.assign({}, l, { x: l.x + 4 }) : l)); st.design.rev++;
  await openEx(); await run();
  ok((await failed()) === 'Export stopped. Your cover was changed in another tab, so nothing was exported. Reload this page to see the newest version, then export again.', 'another tab saved first: its words');
  ok(recs().length === 0 && st.my.length === 0 && st.keyReads === 0, 'another tab: no rows, no My layout, stopped before the build');
  await page.keyboard.press('Escape'); await gone(); await CV.quiet(page);
  // cover_rights, cover_resized, cover_pdf_missing: their words.
  for (const [code, want] of [['cover_rights', 'A picture on your cover has no rights tick'], ['cover_resized', 'The book size changed in 08 Format'], ['cover_pdf_missing', 'Your Print PDF in 08 Format is not current']]) {
    await fresh();
    globalThis.__modes.recCode = code;
    await openEx(); await run();
    ok((await failed()).includes(want) && st.exports.length === 0, `${code}: "${want}…", nothing kept`);
    await page.keyboard.press('Escape'); await gone();
  }
  // The rows could not be sent (the server is down): nothing kept.
  await fresh();
  globalThis.__modes.recFail = 1;
  await openEx(); await run();
  ok((await failed()) === 'Export stopped. The files were made, but we couldn’t record them, so nothing was saved. Check your connection, then try again.', 'records down: its words');
  ok(st.exports.length === 0 && st.my.length === 0, 'records down: nothing kept, no My layout');
  await page.keyboard.press('Escape'); await gone();
  // The connection goes during the export.
  await fresh();
  await openEx(); await hold('kindle'); await run(); await held('kindle');
  await page.context().setOffline(true);
  await release();
  ok((await failed()) === 'Export stopped. The connection went, so nothing was saved. Try again when you are back online.', 'offline during the export: its words');
  ok(recs().length === 0, 'offline during: nothing recorded');
  await page.context().setOffline(false);
  await page.keyboard.press('Escape'); await gone();
  await CV.settled(page);
  // A change that could not be saved: nothing exported.
  await fresh();
  globalThis.__modes.saveFail = 9;
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'title'); E.setLayer(t.id, { x: t.x + 2 }); });
  await CV.settled(page, 'failed');
  await openEx(); await run();
  ok((await failed()) === 'Export stopped. Your latest change is not saved yet, so nothing was exported. Check your connection, then try again.' && st.keyReads === 0, 'unsaved change: its words, no key read');
  await page.keyboard.press('Escape'); await gone();
  globalThis.__modes.saveFail = 0;
  await page.evaluate(() => window.kdpBookSteps[9].retrySave());
  await CV.settled(page, 'saved');
  // My layouts fails after the rows are in: the files stay recorded and the dialog says so.
  await fresh();
  globalThis.__modes.myUpFail = 1;
  await openEx(); await run(); await waitPhase('done');
  ok((await CV.txt(page, '[data-ex-done]')) === 'Your cover files are ready.' && (await CV.txt(page, '[data-ex-myerr]')) === 'Your files are ready, but this design was not saved to My layouts. Check your connection, then export again to save it.', 'My layouts down: files ready, the note');
  ok(st.exports.length === 3 && st.my.length === 0 && (await note()) === 'Done: cover files exported.', 'My layouts down: the rows are in, Done');
  await page.keyboard.press('Escape'); await gone();
  // My layouts full (100, this book has fewer than 5): its own words.
  await fresh();
  for (let i = 0; i < 100; i++) st.my.push({ id: `m${i}`, name: 'Old', from_book_id: `b${i}`, from_title: 'Old', fmt: { ...FIX.fmt }, bg: '#FFFFFF', layers: [], thumb: null, exported_at: '2026-10-01T00:00:00.000Z' });
  await openEx(); await run(); await waitPhase('done');
  ok((await CV.txt(page, '[data-ex-myerr]')).startsWith('Your files are ready, but My layouts is full (100 layouts)'), 'My layouts full: its words');
  await page.keyboard.press('Escape'); await gone();

  /* ── H. A picture: read at full size; one that does not load stops the export ── */
  await fresh();
  await PIC.ready(page);
  await PIC.make(page, 'p', { w: 5000, h: 3400, type: 'image/jpeg', name: 'desk.jpg', quality: 0.8 });
  await PIC.pick(page, 'p'); await PIC.idle(page); await PIC.drawn(page);
  await CV.settled(page, 'saved');
  const dl0 = st.calls.filter((c) => /^GET \/storage\/v1\/object\/(authenticated\/)?covers\//.test(c)).length;
  globalThis.__modes.downloadFail = 3;
  await openEx(); await run();
  ok((await failed()) === 'Export stopped. A picture on your cover did not load (desk.jpg), so nothing was saved. Check your connection and try again.', 'a picture that does not load: its name, nothing saved');
  ok(recs().length === 0, 'picture: nothing recorded');
  globalThis.__modes.downloadFail = 0;
  await page.click('[data-ex-retry]'); await waitPhase('done');
  const dl1 = st.calls.filter((c) => /^GET \/storage\/v1\/object\/(authenticated\/)?covers\//.test(c)).length;
  ok(dl1 > dl0, `the export reads the stored file again at full size (${dl1 - dl0} reads)`);
  const used = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return E.pics.get(E.cover.layers.find((l) => l.type === 'image').asset).src.width; });
  ok(used === 4096, `the screen keeps its 4,096 px copy (${used})`);
  await page.keyboard.press('Escape'); await gone();

  /* ── I. Preview final's Export cover ── */
  await fresh();
  await page.click('[data-k="pv"]');
  await page.click('[data-pv-export]');
  await page.waitForSelector(dlg);
  ok(!(await page.evaluate(() => window.kdpBookSteps[9]._debug().pv.open)), 'Preview final closes, the dialog opens');
  await page.keyboard.press('Escape'); await gone();
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-export]')), 'closing: focus on the header Export cover');

  // Locked (no Print PDF): the header button opens nothing.
  st.pdf = null;
  await CV.open(page, { design: 'keep' });
  await page.click('[data-export]'); await page.waitForTimeout(300);
  ok(!(await page.$(dlg)), 'Locked: Export cover opens nothing');

  ok(CV.mockErrors().length === 0, `no mock errors (${CV.mockErrors().join(' | ')})`);
  await CV.quiet(page);
  return log.join('\n');
};
