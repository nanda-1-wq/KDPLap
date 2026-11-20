// E16.2 Part 3 (plan v2 Item 1, owner Q-1: a planned difference to design 63): a Pixabay pick that answers stock_busy
// with retry_after_s (1 to 120, stock v2) shows "Pixabay is busy. Trying again in N s." in design 63's error slot
// (the large view's grid, its preview, the panel), with design 63's warning icon and style. It counts down in place,
// is announced once (role="status" keeps the first wording; the ticking number is aria-hidden), then the same pick
// runs once more by itself. A second failure shows design 63's message. Picking a picture, closing the picker or
// leaving 09 cancels the wait. stock v1 (no retry_after_s) and a bad value: today's message at once. Unsplash: no wait.
// Mocked: __modes.pickBusy (n picks answer 503 stock_busy) with __modes.pickAfter (the retry_after_s sent as it is).
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const E = (fn, arg) => page.evaluate(fn, arg);
  const picks = () => st.stock.calls.filter((c) => c.action === 'pick');
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return S && !S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more)); }, null, { timeout: 10000 });
  const search = async (sel, q) => { await page.fill(sel, q); await page.press(sel, 'Enter'); await settle(); };
  const DOWN = 'Pixabay is not answering right now. Try again in a minute, or use your own uploads.';
  const busy = (sel = '[data-stock-wait]') => page.$eval(sel, (n) => ({
    cls: n.className, role: n.getAttribute('role'), icon: !!n.querySelector(':scope > svg[aria-hidden="true"]'),
    shown: n.querySelector('[aria-hidden="true"]:not(svg)').textContent.replace(/\s+/g, ' ').trim(),
    said: n.querySelector('.sr-only').textContent, num: n.querySelector('[data-stock-wait-n]').textContent,
    color: getComputedStyle(n).color, size: getComputedStyle(n).fontSize
  }));
  const noWait = () => E(() => window.kdpBookSteps[9]._debug().stock.wait === null);
  const mode = (o) => { globalThis.__modes = Object.assign(globalThis.__modes || {}, o); };

  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  ok((await STK.ready(page)) === STK.PIXABAY.length + STK.UNSPLASH.length, 'the fixture pictures are drawn and kept by the mock');
  await E(() => { window.kdpBookSteps[9]._debug().seed = ''; });
  const n0 = (await CV.state(page)).layers.length;
  await page.click('[data-tool="images"]');
  await page.waitForSelector('[data-srctab="pixabay"]');
  await page.click('[data-srctab="pixabay"]');
  await search('[data-stock-q]', 'leaf');
  await page.click('[data-stock-open]');
  await page.waitForSelector('[data-sd-grid]');

  // Design 63's error slot, for the style compare: a stock_unavailable pick in the grid.
  mode({ pickFail: 1, pickCode: 'stock_unavailable' });
  await page.click('[data-stockdlg] [data-stock-add="1001"]'); await settle();
  const ref = await page.$eval('[data-stockdlg] .cv-sd-err', (n) => ({ cls: n.className, color: getComputedStyle(n).color, size: getComputedStyle(n).fontSize, icon: n.querySelector('svg').outerHTML }));
  ok(ref.cls === 'cv-uperr cv-sd-err', `the error slot today: ${ref.cls}`);

  /* ── 1. The grid: the line, the countdown, said once, the one automatic retry works ── */
  const c1 = picks().length;
  mode({ pickBusy: 1, pickAfter: 3 });
  await page.click('[data-stockdlg] [data-stock-add="1000"]');
  await page.waitForSelector('[data-stockdlg] [data-stock-wait]', { timeout: 10000 });
  let b = await busy('[data-stockdlg] [data-stock-wait]');
  ok(b.shown === 'Pixabay is busy. Trying again in 3 s.', `the line: "${b.shown}"`);
  ok(b.cls === ref.cls && b.color === ref.color && b.size === ref.size && b.icon, `design 63's error slot: same class (${b.cls}), color, size, the warning icon`);
  ok(await page.$eval('[data-stockdlg] [data-stock-wait] svg', (s, html) => s.outerHTML === html, ref.icon), 'the same icon as the error');
  ok(b.role === 'status' && b.said === 'Pixabay is busy. Trying again in 3 s.', `announced as a status: "${b.said}"`);
  ok(!(await CV.has(page, '[data-stockdlg] [role="alert"]')), 'the earlier error is gone (one line in the slot)');
  await page.waitForFunction(() => (document.querySelector('[data-stockdlg] [data-stock-wait-n]') || {}).textContent === '2', null, { timeout: 2500 });
  b = await busy('[data-stockdlg] [data-stock-wait]');
  ok(b.shown === 'Pixabay is busy. Trying again in 2 s.' && b.said === 'Pixabay is busy. Trying again in 3 s.', `it counts down (${b.num}); the status keeps its first words, so it is said once`);
  ok(picks().length === c1 + 1, 'no call while it counts down');
  await page.waitForFunction(() => !document.querySelector('[data-stockdlg]'), null, { timeout: 6000 });
  await settle();
  const p1 = picks().slice(c1);
  ok(p1.length === 2 && p1[0].id === '1000' && p1[1].id === '1000' && JSON.stringify(p1[0]) === JSON.stringify(p1[1]), `the same pick ran once more by itself (${p1.map((p) => p.id)})`);
  ok((await CV.state(page)).layers.length === n0 + 1 && (await noWait()), 'the retry added the picture; the picker closed as after any pick');

  /* ── 2. A second failure: design 63's message, no second wait ── */
  await page.click('[data-stock-open]'); await page.waitForSelector('[data-sd-grid]');
  const c2 = picks().length;
  mode({ pickBusy: 2, pickAfter: 1 });
  await page.click('[data-stockdlg] [data-stock-add="1002"]');
  await page.waitForSelector('[data-stockdlg] [data-stock-wait]', { timeout: 10000 });
  await page.waitForFunction(() => /not answering/.test((document.querySelector('[data-stockdlg] .cv-sd-err') || {}).textContent || ''), null, { timeout: 6000 });
  ok((await CV.txt(page, '[data-stockdlg] .cv-sd-err')) === DOWN && await page.$eval('[data-stockdlg] .cv-sd-err', (n) => n.getAttribute('role') === 'alert'), 'the retry failed too: design 63\'s message, an alert');
  await page.waitForTimeout(2500);
  ok(picks().length === c2 + 2 && (await noWait()), `one automatic retry only (${picks().length - c2} calls)`);

  /* ── 3. stock v1 (no retry_after_s) and bad values: today's message at once ── */
  for (const [label, after] of [['stock v1, no retry_after_s', undefined], ['0', 0], ['121', 121], ['2.5', 2.5], ['"20"', '20']]) {
    const c = picks().length;
    globalThis.__modes.pickAfter = after; mode({ pickBusy: 1 });
    if (after === undefined) delete globalThis.__modes.pickAfter;
    await page.click('[data-stockdlg] [data-stock-add="1003"]'); await settle();
    await page.waitForTimeout(150);
    ok((await CV.txt(page, '[data-stockdlg] .cv-sd-err')) === DOWN && !(await CV.has(page, '[data-stock-wait]')) && (await noWait()) && picks().length === c + 1, `${label}: today's message at once, no wait, one call`);
  }
  delete globalThis.__modes.pickAfter;

  /* ── 4. The preview slot ── */
  mode({ pickBusy: 1, pickAfter: 60 });
  await page.click('[data-stockdlg] [data-stock-look="1004"]');
  await page.waitForSelector('[data-sd-prev]');
  const c4 = picks().length;
  await page.click('[data-sd-add]');
  await page.waitForSelector('[data-sd-prev] [data-stock-wait]', { timeout: 10000 });
  b = await busy('[data-sd-prev] [data-stock-wait]');
  ok(b.shown === 'Pixabay is busy. Trying again in 60 s.' && b.cls === 'cv-uperr' && b.icon && b.role === 'status', `the preview: the line in its error slot (${b.cls})`);
  ok(await page.$eval('[data-sd-add]', (n) => n.getAttribute('aria-disabled') !== 'true' && n.textContent.trim() === 'Add to cover'), 'Add to cover stays on (a press picks now)');
  // Back to results: the wait goes on, now in the grid's slot.
  await page.click('[data-sd-back]');
  ok((await CV.has(page, '[data-stockdlg] .cv-sd-err[data-stock-wait]')) && !(await noWait()), 'back to the results: the line moves to the grid\'s slot, the wait goes on');

  /* ── 5. Picking another picture cancels the wait ── */
  await page.click('[data-stockdlg] [data-stock-add="1005"]');
  await page.waitForFunction(() => !document.querySelector('[data-stockdlg]'), null, { timeout: 6000 }); await settle();
  const p5 = picks().slice(c4);
  ok(p5.length === 2 && p5[1].id === '1005' && (await noWait()), `another picture: picked at once (${p5.map((p) => p.id)}), the wait is gone`);

  /* ── 6. The same picture picked again during the wait: picked now, no second call later ── */
  await page.click('[data-stock-open]'); await page.waitForSelector('[data-sd-grid]');
  const c6 = picks().length;
  mode({ pickBusy: 1, pickAfter: 2 });
  await page.click('[data-stockdlg] [data-stock-add="1006"]');
  await page.waitForSelector('[data-stockdlg] [data-stock-wait]', { timeout: 10000 });
  await page.click('[data-stockdlg] [data-stock-add="1006"]');
  await page.waitForFunction(() => !document.querySelector('[data-stockdlg]'), null, { timeout: 6000 }); await settle();
  await page.waitForTimeout(3000);
  ok(picks().length === c6 + 2 && (await noWait()), `the same picture again: one more call now, none after the countdown (${picks().length - c6})`);

  /* ── 7. Closing the picker cancels the wait (×, Escape) ── */
  for (const how of ['×', 'Escape']) {
    await page.click('[data-stock-open]'); await page.waitForSelector('[data-sd-grid]');
    const c = picks().length;
    mode({ pickBusy: 1, pickAfter: 2 });
    await page.click('[data-stockdlg] [data-stock-add="1007"]');
    await page.waitForSelector('[data-stockdlg] [data-stock-wait]', { timeout: 10000 });
    if (how === '×') await page.click('[data-sd-close]'); else await page.keyboard.press('Escape');
    await page.waitForTimeout(3000);
    ok(picks().length === c + 1 && (await noWait()) && !(await CV.has(page, '[data-stock-wait]')), `closing the picker (${how}): no retry after the countdown, no line in the panel`);
  }

  /* ── 8. The panel: the line in its error slot, the retry works ── */
  const n8 = (await CV.state(page)).layers.length, c8 = picks().length;
  mode({ pickBusy: 1, pickAfter: 2 });
  await page.click('[data-panel] [data-stock-add="1001"]');
  await page.waitForSelector('[data-panel] [data-stock-wait]', { timeout: 10000 });
  b = await busy('[data-panel] [data-stock-wait]');
  ok(b.shown === 'Pixabay is busy. Trying again in 2 s.' && b.cls === 'cv-uperr' && b.icon && b.role === 'status' && b.color === ref.color, 'the panel: the line in its error slot, the same style');
  ok(!(await CV.has(page, '[data-panel] [data-stock-busy]')), 'not "Adding the picture…" while it waits');
  await page.waitForFunction((n) => window.kdpBookSteps[9]._debug().cover.layers.length === n + 1, n8, { timeout: 6000 }); await settle();
  ok(picks().length === c8 + 2 && !(await CV.has(page, '[data-stock-wait]')) && (await noWait()), 'the panel retry added the picture');

  /* ── 9. Unsplash: stock_busy with retry_after_s is not a Pixabay wait ── */
  await page.click('[data-srctab="unsplash"]');
  await search('[data-stock-q]', 'sea');
  const c9 = picks().length;
  mode({ pickBusy: 1, pickAfter: 2 });
  await page.click('[data-panel] [data-stock-add="u3AbC"]'); await settle();
  ok((await CV.txt(page, '[data-panel] .cv-uperr')) === 'Unsplash is not answering right now. Try again in a minute, or use your own uploads.' && (await noWait()), 'Unsplash busy: its message at once, no countdown');
  await page.waitForTimeout(2500);
  ok(picks().length === c9 + 1, 'Unsplash: no automatic retry');
  await page.click('[data-srctab="pixabay"]'); await settle();

  /* ── 10. Leaving 09 cancels the wait ── */
  const c10 = picks().length;
  mode({ pickBusy: 1, pickAfter: 2 });
  await page.click('[data-panel] [data-stock-add="1002"]');
  await page.waitForSelector('[data-panel] [data-stock-wait]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('a[data-step="8"]').click());
  await page.waitForFunction(() => /step=8/.test(location.href), null, { timeout: 15000 });
  await page.waitForTimeout(3500);
  ok(picks().length === c10 + 1, `leaving 09: no retry after the countdown (${picks().length - c10} call)`);

  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
