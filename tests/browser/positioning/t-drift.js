const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  const waitSaved = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => document.querySelector('[data-saved-line]') && document.querySelector('[data-saved-line]').dataset.state === 'saved', null, { timeout: 8000 }); };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Empty positioning: Help me draft, accept every card. Returns the drift button state.
  async function run() {
    st.books[P1].pos = null;
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-run-drift]');
    const before = { off: await page.$eval('[data-run-drift]', (b) => b.disabled), note: await txt('#driftNote') };
    await page.click('[data-help-all]');
    await page.waitForSelector('[data-accept="one_sentence"]', { timeout: 8000 });
    for (const k of ['one_sentence', 'reader_promise', 'lacks', 'approach', 'selling_points', 'focus_tags']) {
      if (await page.$(`[data-accept="${k}"]`)) await page.click(`[data-accept="${k}"]`);
    }
    await waitSaved();
    await page.waitForTimeout(300);
    return { before, off: await page.$eval('[data-run-drift]', (b) => b.disabled), note: await txt('#driftNote'), lock: await txt('#lockNote') };
  }

  await page.context().route('**/js/book-positioning.js', (r) => r.fulfill({ path: `${CACHE}/old-book-positioning.js`, contentType: 'application/javascript' }));
  const old = await run();
  await page.context().unroute('**/js/book-positioning.js');
  ok(old.off && old.note === 'Write at least one card first.', `old code (HEAD) shows the bug: button off, "${old.note}"`);

  const now = await run();
  ok(now.before.off && now.before.note === 'Write at least one card first.', 'new code: empty book starts with the button off');
  ok(!now.off && now.note === 'Uses one AI call.', `new code: after Accept the button is on, "${now.note}"`);
  log.push('LOCKNOTE ' + now.lock);

  // Clearing the only text turns it off again (same check, other way)
  st.books[P1].pos = null;
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-run-drift]');
  await page.click('[data-card="one_sentence"] [data-edit], [data-card="one_sentence"] textarea').catch(() => {});
  const ta = '[data-card="one_sentence"] textarea';
  await page.waitForSelector(ta, { timeout: 5000 });
  await page.fill(ta, 'A short chair yoga line.');
  await page.click('[data-card="approach"] h2');
  await waitSaved(); await page.waitForTimeout(300);
  const typed = await page.$eval('[data-run-drift]', (b) => b.disabled);
  await page.fill(ta, '');
  await page.click('[data-card="approach"] h2');
  await waitSaved(); await page.waitForTimeout(300);
  const cleared = await page.$eval('[data-run-drift]', (b) => b.disabled);
  ok(!typed && cleared, `typed text turns it on (${!typed}), clearing it turns it off (${cleared})`);
  ok(st.gens.filter((g) => g.stage === 'drift_check').length === 0, 'no drift call made');
  return log.join('\n');
};
