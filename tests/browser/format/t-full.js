// D2 (owner, Nov 9; plan F13): the spread fills the preview box, sharp, on resize too; "Full screen" shows the
// spread over the whole window (Previous / Next, arrow keys, Esc and Close, focus kept inside and given back,
// 44 px targets), drawing only the visible spread and the next one, as the box does. E13.2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const fit = (scope) => page.evaluate((sc) => {
    const stage = document.querySelector(`${sc} [data-fmt-stage]`).getBoundingClientRect();
    const p = document.querySelector(`${sc} .fmt-page.is-right`).getBoundingClientRect();
    const c = document.querySelector(`${sc} .fmt-page.is-right canvas`);
    return { sw: stage.width, sh: stage.height, pw: p.width, ph: p.height, density: c.width / parseFloat(c.style.width), dpr: Math.min(3, devicePixelRatio) };
  }, scope);
  const fills = (f) => Math.abs(2 * f.pw - f.sw) <= 2 || Math.abs(f.ph - f.sh) <= 2;
  const drawn = () => page.evaluate(() => window.kdpBookSteps[8]._debug().pv.drawn());
  const label = (sc) => page.$eval(`${sc} [data-fmt-label]`, (l) => l.textContent);
  await page.setViewportSize({ width: 1440, height: 1100 });

  /* Before the pages: Full screen is off. */
  globalThis.__modes.cdnSlowMs = 1500;
  await FM.open(page);
  ok(await page.$eval('[data-fmt-full]', (b) => b.disabled && b.textContent.trim() === 'Full screen'), 'Full screen is off until there are pages');
  globalThis.__modes.cdnSlowMs = 0;
  await pages();
  ok(await page.$eval('[data-fmt-full]', (b) => !b.disabled && b.getBoundingClientRect().height >= 44 && b.getAttribute('aria-haspopup') === 'dialog'), 'then on, 44 px, opens a dialog');

  /* The spread fills the box (its width or its height), at the screen's density. */
  let f = await fit('.fmt-wrap');
  ok(fills(f), `the spread fills the box (${Math.round(2 * f.pw)} × ${Math.round(f.ph)} in ${Math.round(f.sw)} × ${Math.round(f.sh)})`);
  ok(Math.abs(f.density - f.dpr) < 0.02, `sharp: canvas pixels = CSS pixels × ${f.dpr} (${f.density.toFixed(2)})`);
  await page.click('[data-fmt-next]');
  await page.waitForFunction(() => document.querySelectorAll('.fmt-wrap .fmt-page canvas').length === 2, null, { timeout: 5000 });
  f = await fit('.fmt-wrap');
  ok(fills(f), 'pages 2 and 3 fill the box too');

  /* A resize draws it again at the new size. */
  const before = f;
  await page.setViewportSize({ width: 1200, height: 900 });
  // Before the redraw (150 ms after a resize) the old, wider spread must not push the page sideways.
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector('.fmt-wrap').scrollWidth <= document.querySelector('.fmt-wrap').clientWidth), 'right after a resize: no sideways scroll while the spread waits to redraw');
  await page.waitForFunction((w) => Math.abs(document.querySelector('.fmt-wrap .fmt-page.is-right').getBoundingClientRect().width - w) > 10, before.pw, { timeout: 5000 });
  await page.waitForTimeout(400);
  f = await fit('.fmt-wrap');
  ok(fills(f) && Math.abs(f.density - f.dpr) < 0.02, `after a resize: fills again, still sharp (${Math.round(f.pw)} px wide, was ${Math.round(before.pw)})`);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(500);

  /* Full screen: a modal dialog, focus on Close, the same spread, bigger. */
  const inBox = await fit('.fmt-wrap');
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]', { timeout: 3000 });
  await page.waitForFunction(() => document.querySelectorAll('dialog.fmt-full .fmt-page canvas').length === 2, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  ok(await page.$eval('dialog.fmt-full', (d) => d.matches(':modal') && d.getAttribute('aria-labelledby') === 'fmtFullTitle' && document.getElementById('fmtFullTitle').textContent === 'Print preview'), 'a modal dialog, named "Print preview"');
  ok(await page.evaluate(() => document.activeElement.matches('dialog.fmt-full [data-full-close]')), 'focus on Close');
  const big = await fit('dialog.fmt-full');
  ok(fills(big) && big.pw > inBox.pw * 1.2, `full screen: the spread fills the window area, bigger (${Math.round(big.pw)} vs ${Math.round(inBox.pw)} px a page)`);
  ok((await label('dialog.fmt-full')) === (await label('.fmt-nav:not(.fmt-full-nav)')) && /^Pages 2 and 3 of \d+$/.test(await label('dialog.fmt-full')), 'the same spread as the box');
  ok(await page.$$eval('dialog.fmt-full button', (b) => b.every((x) => x.getBoundingClientRect().height >= 44 && x.getBoundingClientRect().width >= 44)), 'every button 44 px or more');
  ok(await page.evaluate(() => !document.querySelector('.fmt-wrap [data-fmt-stage]')), 'the stage moved into the view (one preview, one PDF)');

  /* Previous / Next and the arrow keys; only the visible spread and the next are kept. */
  await page.click('dialog.fmt-full [data-fmt-next]');
  await page.waitForFunction(() => /^Pages 4 and 5/.test(document.querySelector('dialog.fmt-full [data-fmt-label]').textContent), null, { timeout: 3000 });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => /^Pages 6 and 7/.test(document.querySelector('dialog.fmt-full [data-fmt-label]').textContent), null, { timeout: 3000 });
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => /^Pages 4 and 5/.test(document.querySelector('dialog.fmt-full [data-fmt-label]').textContent), null, { timeout: 3000 });
  await page.waitForTimeout(500);
  const d = await drawn();
  ok(d.length <= 4 && d.every((n) => n >= 4 && n <= 7), `Next, ArrowRight, ArrowLeft; drawn pages kept: ${d}`);
  await page.click('dialog.fmt-full [data-fmt-prev]');
  await page.waitForFunction(() => /^Pages 2 and 3/.test(document.querySelector('dialog.fmt-full [data-fmt-label]').textContent), null, { timeout: 3000 });
  ok(true, 'Previous');

  /* Focus stays inside: Tab and Shift+Tab never reach the page behind. */
  let inside = true;
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('dialog.fmt-full') || document.activeElement === document.body); }
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); inside = inside && await page.evaluate(() => !!document.activeElement.closest('dialog.fmt-full') || document.activeElement === document.body); }
  ok(inside, 'Tab and Shift+Tab stay in the view');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => { const b = document.activeElement; const s = getComputedStyle(b); return !!b.closest('dialog.fmt-full') && b.tagName === 'BUTTON' && s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px'; }), 'the keyboard focus shows the 2 px ring, 2 px offset');

  /* Esc closes: the stage goes back, the spread stays, focus back on Full screen. */
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-full]') && !!document.querySelector('.fmt-wrap [data-fmt-stage]')), 'Esc: closed, the stage is back, focus on Full screen');
  ok(/^Pages 2 and 3/.test(await label('.fmt-nav')) && fills(await fit('.fmt-wrap')), 'the same spread, fitted to the box again');

  /* Close button. */
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]', { timeout: 3000 });
  await page.click('dialog.fmt-full [data-full-close]');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-full]')), 'Close: closed, focus back');

  /* A rebuild while full screen: the new pages show there. */
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]', { timeout: 3000 });
  const ms = await page.evaluate(() => JSON.stringify(window.kdpBookSteps[8]._debug().build.ms));
  await page.evaluate(() => { const i = document.querySelector('.fmt-style input[value="warm"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction((m) => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && JSON.stringify(x.build.ms) !== m; }, ms, { timeout: 30000 });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelectorAll('dialog.fmt-full .fmt-page canvas').length >= 1), 'a rebuild while open shows in the view');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full'), null, { timeout: 3000 });

  /* Kindle: no Full screen. */
  await page.click('[data-fmt-mode="kindle"]');
  ok(await page.$eval('[data-fmt-full]', (b) => b.disabled), 'Kindle: Full screen is off');
  await page.click('[data-fmt-mode="print"]');

  /* 900 px: the view fits the window, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(400);
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]', { timeout: 3000 });
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => { const d = document.querySelector('dialog.fmt-full').getBoundingClientRect(); return { fit: d.right <= innerWidth + 0.5 && d.bottom <= innerHeight + 0.5, scroll: document.querySelector('dialog.fmt-full').scrollWidth <= document.querySelector('dialog.fmt-full').clientWidth }; });
  ok(v.fit && v.scroll && fills(await fit('dialog.fmt-full')), `900: the view fits, the spread fills it (${JSON.stringify(v)})`);
  await page.keyboard.press('Escape');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
