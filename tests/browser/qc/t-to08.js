// E13.2: 07's ways into 08. "How to add one" opens 08 at the Copyright row (owner Q10);
// "Go to 08 Format" (55 E) opens 08.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  /* 55 E: Go to 08 Format opens 08 (focus on the step title, as the sidebar does). */
  await QC.open7(page);
  await QC.run(page);
  await page.waitForSelector('.qc-box.is-success a[data-go="8"]', { timeout: 5000 });
  await page.click('.qc-box.is-success a[data-go="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 5000 });
  ok(/step=8/.test(page.url()) && await page.evaluate(() => document.activeElement.matches('[data-step-title]')), 'Go to 08 Format opens 08, focus on the title');
  await page.waitForSelector('.fmt', { timeout: 5000 });
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '08 has the rail');


  /* The disclaimer row (design 53, group 7): How to add one → 08, the Copyright row focused. */
  st.sample();
  await QC.open7(page);
  await QC.run(page);
  await page.click('[data-group="7"]');
  await page.click('#qc-g7 a[data-focus="copyright"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 5000 });
  await page.waitForFunction(() => document.activeElement && document.activeElement.matches('[data-fmt-copyright]'), null, { timeout: 5000 });
  ok(/step=8/.test(page.url()), 'How to add one opens 08');
  ok((await QC.txt(page, '[data-fmt-copyright]')) === 'Copyright Always on', 'focus on the Copyright row: Copyright, Always on');
  ok(await page.$eval('[data-fmt-copyright]', (r) => { const b = r.getBoundingClientRect(); const s = getComputedStyle(r); return b.top >= 0 && b.bottom <= innerHeight && s.outlineStyle === 'solid'; }), 'the row is in view, with the focus ring');
  // The sample stored copyright off: 08 saves it as on (owner Q10).
  for (let i = 0; i < 40 && !st.writes.some((w) => w.table === 'book_formats' && w.body && w.body.parts); i++) await page.waitForTimeout(50);
  ok(st.format.parts && st.format.parts.copyright === true, 'a stored copyright off is saved as on');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
