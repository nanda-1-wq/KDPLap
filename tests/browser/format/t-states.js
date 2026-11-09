// 41c: the engine and section states. E13.2 Part 3.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const state = () => FM.txt(page, '[data-fmt-state]');
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  await page.setViewportSize({ width: 1440, height: 1100 });

  /* First visit, slow download: "Preparing the page engine" with the bar in MB on the wire. */
  globalThis.__modes.cdnSlowMs = 2500;
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state] [role="progressbar"]', { timeout: 5000 });
  const t = await state();
  ok(t.startsWith('Preparing the page engine First time only. About 10 MB. Next time it opens at once.'), `first visit: ${t}`);
  ok(/\d+\.\d of 9\.9 MB$/.test(t), `the MB line: ${t.slice(-20)}`);
  // The engine JS and the fonts are in while the wasm waits: the bar is past 0 (E13.2 progress fix).
  await page.waitForFunction(() => /^(0\.[1-9]|[1-9])/.test(document.querySelector('[data-fmt-state] .fmt-quiet').textContent), null, { timeout: 2000 });
  ok(Number(await page.$eval('[data-fmt-state] [role="progressbar"]', (b) => b.getAttribute('aria-valuenow'))) > 0, `the bar moves before the wasm is in: ${await FM.txt(page, '[data-fmt-state] .fmt-quiet')}`);
  ok(await page.$eval('[data-fmt-state] [role="progressbar"]', (b) => b.getAttribute('aria-label') === 'Engine download' && b.getAttribute('aria-valuemin') === '0' && b.getAttribute('aria-valuemax') === '100'), 'progressbar: labeled, 0 to 100');
  ok(await page.$eval('[data-fmt-state]', (s) => s.getAttribute('role') === 'status' && s.classList.contains('is-quiet')), 'first visit: a status');
  ok(await page.$eval('[data-fmt-stage]', (s) => s.hidden) && !(await FM.has(page, '.fmt-chip')), 'no pages, no chips yet');
  ok(/depends on the page count/.test(await FM.txt(page, '[data-fmt-margin]')), 'margin note before a page count: depends on the page count');
  globalThis.__modes.cdnSlowMs = 0;
  await pages();
  ok(await page.$eval('[data-fmt-state]', (s) => s.hidden), 'then the pages');

  /* Engine error (both CDNs): the alert, settings stay usable; Try again loads. */
  globalThis.__modes.cdnDown = true;
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state].is-danger', { timeout: 15000 });
  ok((await state()) === 'The page engine did not load We tried twice, from two servers. Check your connection. Your settings are saved. Try again', `engine error: ${await state()}`);
  ok(await page.$eval('[data-fmt-state]', (s) => s.getAttribute('role') === 'alert' && !!s.querySelector('svg')), 'engine error: an alert, icon and words');
  ok(st.cdn.some((c) => c.cdn === 'jsdelivr') && st.cdn.some((c) => c.cdn === 'unpkg'), 'both servers were tried');
  await page.click('.fmt-style:has(input[value="clean"])');
  await FM.saved(page);
  ok(st.format.style === 'clean', 'settings still save');
  globalThis.__modes.cdnDown = false;
  await page.click('[data-fmt-retry-engine]');
  await pages();
  ok(true, 'Try again: the pages');

  /* jsdelivr down: everything from unpkg, the pages come anyway. */
  globalThis.__modes.jsdelivrDown = true;
  st.cdn = [];
  await FM.open(page);
  await pages();
  ok(st.cdn.filter((c) => c.cdn === 'unpkg').length >= 6, 'jsdelivr down: the files from unpkg');
  globalThis.__modes.jsdelivrDown = false;

  /* A build that fails: "The preview could not be made" with Try again (not drawn; CLAUDE.md §7). */
  await page.evaluate(() => { const e = window.kdpBookSteps[8]._debug().engine; e.__build = e.build; e.build = () => Promise.reject(Object.assign(new Error('mock: compile failed'), { kind: 'typst' })); });
  await page.click('.fmt-style:has(input[value="modern"])');
  await page.waitForSelector('.fmt-ready .alert-error', { timeout: 10000 });
  ok((await FM.txt(page, '.fmt-ready .alert-error')) === 'The preview could not be updated. It shows your last good pages. Try again' && await page.$eval('.fmt-page canvas', () => true), 'a failed rebuild keeps the last pages, with Try again');
  await page.evaluate(() => { const e = window.kdpBookSteps[8]._debug().engine; e.build = e.__build; });
  await page.click('.fmt-ready .alert-error [data-fmt-retry-build]');
  await page.waitForFunction(() => !document.querySelector('.fmt-ready .alert-error') && window.kdpBookSteps[8]._debug().build.state === 'ready', null, { timeout: 30000 });
  ok(true, 'Try again rebuilds');

  /* No Final section (41c): "Nothing to format yet", no download, Go to 06 Write. */
  for (const s of st.sections()) s.status = 'draft';
  st.cdn = [];
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state]:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(500);
  ok((await state()) === 'Nothing to format yet Only Final sections go into the book. Mark sections Final in 06 Write. Go to 06 Write', `nothing Final: ${await state()}`);
  ok(st.cdn.length === 0, 'nothing Final: no engine download');
  ok(!(await FM.has(page, '.fmt-ready .alert')), 'nothing Final: no Ready box');
  await page.click('[data-fmt-state] [data-fmt-go="6"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Write', null, { timeout: 5000 });
  ok(/step=6/.test(page.url()), 'Go to 06 Write opens 06');
  for (const s of st.sections()) s.status = 'final';

  /* A trim outside group A: no preview and no download; back to 6 × 9: the pages. */
  st.brief.trim_size = '7x10';
  st.cdn = [];
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state]:not([hidden])', { timeout: 5000 });
  ok((await state()) === 'No Print PDF for 7 × 10 in The Print PDF works with 6 × 9, 5.5 × 8.5, 5.25 × 8 and 5 × 8 in. Pick one of these under Trim size. Your text does not change.', `7 × 10: ${await state()}`);
  ok(st.cdn.length === 0, '7 × 10: no engine download');
  await page.selectOption('[data-fmt-trim]', '6x9');
  await page.click('dialog [data-change]');
  await pages();
  ok(st.brief.trim_size === '6x9', 'back to 6 × 9: the engine starts and builds');

  /* A trim change inside group A rebuilds at the new size. */
  const w1 = await page.$eval('.fmt-page.is-right', (p) => p.getBoundingClientRect().width / p.getBoundingClientRect().height);
  await page.selectOption('[data-fmt-trim]', '5x8');
  await page.click('dialog [data-change]');
  await page.waitForFunction((r) => { const p = document.querySelector('.fmt-page.is-right'); const b = p && p.querySelector('canvas') && p.getBoundingClientRect(); return b && Math.abs(b.width / b.height - 0.625) < 0.01; }, w1, { timeout: 30000 });
  ok(Math.abs(w1 - 6 / 9) < 0.01, 'the pages take the new trim shape (6 × 9 → 5 × 8)');

  /* 900 px: a state fits, no sideways scroll. */
  globalThis.__modes.cdnDown = true;
  await page.setViewportSize({ width: 900, height: 900 });
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state].is-danger', { timeout: 15000 });
  ok(await FM.noScroll(page), '900: the engine error, no sideways scroll');
  globalThis.__modes.cdnDown = false;

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
