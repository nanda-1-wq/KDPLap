// R2 (ultrareview 2026-10-07): the sidebar save line is shared by every step.
// A Brief save error (01) must stay, with its Retry, while 03 saves; only the
// Brief's own good save clears it.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const line = () => page.$eval('[data-saved-line]', (e) => ({ state: e.dataset.state, text: e.innerText, retry: !!e.querySelector('[data-retry-save]') }));
  const waitLine = (state) => page.waitForFunction((s) => (document.querySelector('[data-saved-line]') || {}).dataset?.state === s, state, { timeout: 8000 });
  const posWrites = () => st.writes.filter((w) => w.table === 'positioning').length;
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 01: a Brief save fails.
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-target_reader', { timeout: 10000 });
  globalThis.__modes.briefError = true;
  await page.fill('#bf-target_reader', 'Adults over 60 with stiff knees who want to move at home.');
  await page.locator('#bf-target_reader').blur();
  await waitLine('error');
  ok((await line()).retry, `01 save error with Retry: "${(await line()).text}"`);

  // 03: a card save works while the Brief error is still open.
  await page.click('a[data-step="3"]');
  await page.waitForSelector('[data-copy-gaps]', { timeout: 10000 });
  const before = posWrites();
  await page.click('[data-copy-gaps]');
  await page.waitForTimeout(1500);
  ok(posWrites() > before, `03 saved (${posWrites() - before} positioning writes)`);
  const after = await line();
  ok(after.state === 'error' && after.retry && after.text.includes("Couldn't save"), `the Brief error still shows after 03 saved: ${after.state} "${after.text}"`);

  // Retry goes to the Brief; its good save clears the error.
  globalThis.__modes.briefError = false;
  const n = st.writes.length;
  if (after.retry) {
    await page.click('[data-retry-save]');
    await waitLine('saved').catch(() => {});
  }
  const sent = st.writes.slice(n).filter((w) => w.table === 'book_briefs' && !w.failed);
  ok(sent.length === 1 && 'target_reader' in sent[0].body, `Retry sends the Brief save (${sent.length})`);
  ok((await line()).state === 'saved', `then the line shows saved: ${(await line()).state}`);

  await page.screenshot({ path: `${SHOTS}/save-owner.png`, timeout: 5000 }).catch(() => {});
  return log.join('\n');
};
