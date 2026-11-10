// Owner, Nov 10 (after D3): the Ready box is below the screen, so when it has warnings ("N things to check") or
// the preview could not be updated, a chip in the preview bar, in the warning look (icon and words, a down arrow),
// scrolls to the Ready box and moves the focus there. No chip when the box is green. 44 px; 900 px. E13.2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const chip = () => page.$eval('[data-fmt-tocheck]', (c) => {
    const r = c.getBoundingClientRect(), s = getComputedStyle(c);
    return { shown: !c.hidden && r.height > 0, text: c.textContent.replace(/\s+/g, ' ').trim(), h: r.height, w: r.width, top: r.top, bottom: r.bottom,
      inBar: !!c.closest('.fmt-bar'), icons: c.querySelectorAll('svg').length, color: s.color, border: s.borderTopColor, bg: s.backgroundColor,
      warn: getComputedStyle(document.documentElement).getPropertyValue('--warning').trim(), controls: c.getAttribute('aria-controls') };
  });
  const rgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  const readyInView = () => page.evaluate(() => { const r = document.querySelector('.fmt-ready').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; });
  const focused = () => page.evaluate(() => document.activeElement === document.querySelector('[data-fmt-ready]'));
  st.qcRun = { checked_at: '2026-11-07T10:00:00Z', current: true };

  /* Green: no chip. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await FM.open(page);
  await pages();
  await page.waitForSelector('.fmt-ready .fmt-alert-ok', { timeout: 10000 });
  ok(!(await chip()).shown, 'the Ready box is green: no chip');

  /* Warnings: "N things to check", in the bar, warning look, icon and words, 44 px. */
  st.chapters[1].sections[1].status = 'draft';
  st.chapters[2].sections[0].needs_review = true;
  await FM.open(page);
  await pages();
  await page.waitForSelector('.fmt-ready .alert-warning', { timeout: 10000 });
  let c = await chip();
  ok(c.shown && c.inBar && c.text === '2 things to check' && c.controls === 'fmtReady', `warnings: the chip "${c.text}" in the preview bar`);
  ok(c.icons === 2 && c.color === rgb(c.warn) && c.border === rgb(c.warn), 'the warning look: warning icon, words, a down arrow');
  ok(c.h >= 44 && c.w >= 44, `44 px or more (${Math.round(c.w)} × ${Math.round(c.h)})`);
  ok(!(await readyInView()), 'the Ready box is below the screen');

  /* Click: scrolls to the Ready box and moves the focus there; the ring shows. */
  await page.click('[data-fmt-tocheck]');
  await page.waitForTimeout(900);
  ok(await readyInView() && await focused(), 'click: the Ready box comes into view and has the focus');
  ok(await page.$eval('[data-fmt-ready]', (b) => { const s = getComputedStyle(b); return s.outlineStyle === 'solid' && s.outlineWidth === '2px'; }), 'the focused box shows the 2 px ring');
  await page.$eval('.fmt-preview', (p) => p.scrollTo(0, 0));

  /* Keyboard: Tab to the chip, Enter. */
  await page.focus('[data-fmt-mode="kindle"]');
  await page.keyboard.press('Tab');   // the chip comes after Print / Kindle
  ok(await page.evaluate(() => document.activeElement.matches('[data-fmt-tocheck]')), 'Tab reaches the chip after Print / Kindle');
  ok(await page.$eval('[data-fmt-tocheck]', (b) => { const s = getComputedStyle(b); return s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px'; }), 'keyboard focus on the chip: 2 px ring, 2 px offset');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  ok(await readyInView() && await focused(), 'Enter does the same');
  await page.$eval('.fmt-preview', (p) => p.scrollTo(0, 0));

  /* One warning: "1 thing to check". */
  st.chapters[2].sections[0].needs_review = false;
  await FM.open(page);
  await pages();
  await page.waitForSelector('.fmt-ready .alert-warning', { timeout: 10000 });
  ok((await chip()).text === '1 thing to check', '1 thing to check');

  /* The preview could not be updated (no warnings): "Preview not updated"; Try again clears it. */
  st.chapters[1].sections[1].status = 'final';
  await FM.open(page);
  await pages();
  ok(!(await chip()).shown, 'all fixed: no chip');
  await page.evaluate(() => { const e = window.kdpBookSteps[8]._debug().engine; e.__build = e.build; e.build = () => Promise.reject(Object.assign(new Error('mock: compile failed'), { kind: 'typst' })); });
  await page.click('.fmt-style:has(input[value="modern"])');
  await page.waitForSelector('.fmt-ready .alert-error', { timeout: 10000 });
  c = await chip();
  ok(c.shown && c.text === 'Preview not updated', `a failed rebuild: the chip "${c.text}"`);
  await page.click('[data-fmt-tocheck]');
  await page.waitForTimeout(900);
  ok(await readyInView() && await focused(), 'click: the error comes into view, with the focus');
  await page.evaluate(() => { const e = window.kdpBookSteps[8]._debug().engine; e.build = e.__build; });
  await page.click('.fmt-ready .alert-error [data-fmt-retry-build]');
  await page.waitForFunction(() => !document.querySelector('.fmt-ready .alert-error') && window.kdpBookSteps[8]._debug().build.state === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(300);
  ok(!(await chip()).shown, 'Try again worked: the box is green, no chip');

  /* 900 px: the chip in the bar, 44 px, no sideways scroll; click scrolls the page to the box. */
  st.chapters[1].sections[1].status = 'draft';
  await page.setViewportSize({ width: 900, height: 900 });
  await FM.open(page);
  await pages();
  await page.waitForSelector('.fmt-ready .alert-warning', { timeout: 10000 });
  await page.$eval('.fmt-preview', (p) => window.scrollTo(0, p.getBoundingClientRect().top + window.scrollY));
  await page.waitForTimeout(400);
  c = await chip();
  const side = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  ok(c.shown && c.inBar && c.h >= 44 && c.top >= 0 && side, `900: the chip shows in the bar, 44 px, no sideways scroll (${Math.round(c.w)} × ${Math.round(c.h)})`);
  ok(!(await readyInView()), '900: the Ready box is below the screen');
  await page.click('[data-fmt-tocheck]');
  await page.waitForTimeout(900);
  ok(await readyInView() && await focused(), '900: click scrolls the page to the Ready box and moves the focus');
  st.chapters[1].sections[1].status = 'final';

  if (st.calls.some((x) => x.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((x) => x.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
