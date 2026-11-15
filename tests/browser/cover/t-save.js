// E16 Part 4: autosave (plan §2, R11, design 73c): rev, one save per burst, the visit snapshot (once, only when
// something changes), Save failed (the bar, the footer, Retry), another tab saved first, leaving the page or the step.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  /* An idle visit writes nothing. */
  await CV.open(page, { design: 'band' });
  await page.waitForTimeout(1200);
  ok(st.saves === 0 && st.history.length === 0, 'an idle visit: no save, no snapshot');
  const orig = JSON.stringify(st.design.layers);

  /* A change: Saving…, then ✓ Saved; the row moves to rev 2; the body holds layers and bg only. */
  const pen = await CV.layer(page, 'pen');
  await page.focus(`[data-hit="${pen.id}"]`); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  ok((await CV.txt(page, '[data-savetext]')) === 'Saving…', 'Saving… right after the change');
  await CV.settled(page, 'saved');
  ok((await CV.txt(page, '[data-savetext]')) === '✓ Saved', '✓ Saved');
  const w = CV.lastSave();
  ok(st.saves === 1 && w.rev === 1 && Object.keys(w.body).sort().join() === 'bg,layers', `one save at rev 1, layers and bg only (${Object.keys(w.body)})`);
  ok(st.design.rev === 2 && st.design.layers.find((l) => l.src === 'pen').y === pen.y - 1, 'the row: rev 2, the pen name 1 px up');
  ok(await page.evaluate(() => window.kdpBookSteps[9]._debug().saver.rev()) === 2, 'the editor holds rev 2');
  const key = (L) => JSON.stringify(L.map((l) => [l.id, l.type, l.x, l.y, l.w, l.text || null]));
  ok(st.history.length === 1 && st.history[0].reason === 'visit' && key(st.history[0].layers) === key(JSON.parse(orig)), 'the visit snapshot: the design as it opened');
  ok(JSON.stringify(st.history[0].fmt) === JSON.stringify(FIX.fmt) && st.history[0].bg === '#F2EDE4' && st.history[0].layout === 'band', 'the snapshot keeps fmt, bg and layout');

  /* A burst of changes: one save; the snapshot is not written again. */
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  await CV.settled(page, 'saved');
  ok(st.saves === 2 && CV.lastSave().rev === 2, 'six quick nudges: one save, at rev 2');
  ok(st.history.length === 1, 'one snapshot per visit');
  ok(st.design.layers.find((l) => l.src === 'pen').x === pen.x - 6, 'the row has the last state');

  /* Save failed (design 73c): the bar, the footer, Retry (ink), the change stays on screen. */
  globalThis.__modes.saveFail = 1;
  await page.keyboard.press('ArrowDown');
  await CV.settled(page, 'failed');
  ok(await page.$eval('[data-alert]', (b) => !b.hidden && b.getAttribute('role') === 'alert'), 'the bar shows (role alert)');
  ok((await CV.txt(page, '.cv-alert-t')) === 'Your last change was not saved. It is still here on screen. Retry, and do not close this page until it says Saved.', 'the words of design 73c');
  ok((await CV.txt(page, '[data-savetext]')) === 'Not saved' && await page.$eval('[data-savetext]', (e) => e.classList.contains('is-failed')), 'the footer: Not saved');
  ok(!!(await page.$('.cv-foot-retry')) && await page.$eval('.cv-alert-btn', (b) => getComputedStyle(b).backgroundColor === 'rgb(28, 28, 26)'), 'Retry in the bar (ink) and in the footer');
  ok((await CV.layer(page, 'pen')).y === pen.y, 'the change is still on screen');
  // more changes while failed: no save goes out until Retry
  // the shell's save line (the rail and the sidebar) says so too, with Retry
  ok(await page.$eval('[data-saved-line]', (l) => l.dataset.state === 'error' && !!l.querySelector('[data-retry-save]')), 'the rail\'s save line: the error with Retry (not the green check)');
  const n0 = st.saves;
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1000);
  ok(st.saves === n0 && (await CV.state(page)).save === 'failed', 'while failed, nothing more is sent until Retry');
  const dlg = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  ok(dlg, 'leaving the page now asks first (beforeunload)');
  await page.click('.cv-alert-btn');
  await CV.settled(page, 'saved');
  ok(await page.$eval('[data-alert]', (b) => b.hidden) && (await CV.txt(page, '[data-savetext]')) === '✓ Saved', 'Retry: saved, the bar goes');
  ok(st.design.layers.find((l) => l.src === 'pen').y === pen.y + 1, 'Retry wrote the last state');
  ok(!(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })), 'saved: leaving does not ask');
  ok(await page.$eval('[data-saved-line]', (l) => l.dataset.state === 'saved'), 'the rail\'s save line: saved again');

  /* Another tab saved first (R11): 0 rows → failed; Retry reads the rev again and writes this tab's design. */
  globalThis.__modes.otherTab = 1;
  await page.keyboard.press('ArrowRight');
  await CV.settled(page, 'failed');
  ok(await page.$eval('[data-alert]', (b) => !b.hidden), 'the rev moved: Save failed');
  const reads0 = st.reads, rev0 = st.design.rev;
  await page.click('.cv-foot-retry');
  await CV.settled(page, 'saved');
  ok(st.reads === reads0 + 1 && CV.lastSave().rev === rev0, `Retry read cover_json again and wrote at the new rev ${rev0}`);
  ok(st.design.layers.find((l) => l.src === 'pen').x === pen.x - 5, 'last write wins: this tab\'s design is in the row');

  /* A failed snapshot does not stop the design from saving; it is tried again on the next save. */
  await CV.open(page, { design: 'band' });
  st.history = [];
  globalThis.__modes.histFail = 1;
  const p2 = await CV.layer(page, 'pen');
  await page.focus(`[data-hit="${p2.id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp');
  await CV.settled(page, 'saved');
  ok(st.history.length === 0 && st.design.rev === 2, 'the snapshot failed, the design saved');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowUp');
  await CV.settled(page, 'saved');
  ok(st.history.length === 1 && st.history[0].reason === 'visit', 'the next save writes the snapshot');

  /* Leaving the step saves first (the shell waits for leave()). */
  await page.keyboard.press('ArrowLeft');
  const before = st.saves;
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  await page.waitForTimeout(400);
  ok(st.saves === before + 1 && st.design.layers.find((l) => l.src === 'pen').x === p2.x - 1, 'opening 08 saves the last change at once');

  /* A save that fails while 09 is left stays in the sidebar's save line; its Retry still saves the cover. */
  await CV.open(page, { design: 'band' });
  const p3 = await CV.layer(page, 'pen');
  await page.focus(`[data-hit="${p3.id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
  globalThis.__modes.saveFail = 1;
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'error', null, { timeout: 8000 });
  ok(true, 'left with a failed save: the save line on 08 shows the error');
  await page.click('[data-saved-line] [data-retry-save]');
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'saved', null, { timeout: 8000 });
  ok(st.design.layers.find((l) => l.src === 'pen').x === p3.x + 1, 'its Retry (on 08) saved the cover change');

  /* A design over the caps is refused by the database: Save failed, not a lost change. */
  await CV.open(page, { design: 'band' });
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const t = E.cover.layers.find((l) => l.src === 'blurb'); E.patchLayer(t.id, { text: 'x'.repeat(2500) }); });
  await CV.settled(page);
  const s = await CV.state(page);
  ok(s.layers.find((l) => l.src === 'blurb').text.length === 2500 ? s.save === 'failed' : true, 'a 2,500-character text: the database refuses it, the editor says Not saved');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
