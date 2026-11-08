// Focus rings, 44 px targets, aria-expanded, live regions, keyboard only, and 900 px with no sideways scroll.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 1200 });
  st.sample();
  await QC.open7(page);

  /* Keyboard only: Run checks, a group, Mark as OK, Undo. */
  await page.focus('[data-run]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.qc-verdict', { timeout: 5000 });
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-verdict')), 'keyboard: Run checks ends on the verdict');
  await page.focus('[data-group="2"]');
  await page.keyboard.press('Space');
  ok(await page.$eval('[data-group="2"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'keyboard: Space opens a group');
  await page.keyboard.press('Enter');
  ok(await page.$eval('[data-group="2"]', (b) => b.getAttribute('aria-expanded') === 'false'), 'keyboard: Enter shuts it');
  ok(await page.$eval('#qc-g2', (b) => b.hidden), 'a shut group is hidden');
  ok(await page.$$eval('.qc-gb', (bs) => bs.every((b) => b.tagName === 'BUTTON' && b.getAttribute('aria-controls') && document.getElementById(b.getAttribute('aria-controls')))), 'every group points at its body');

  await page.focus('#qc-g1 [data-ok]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement && document.activeElement.hasAttribute('data-undo'), null, { timeout: 3000 });
  ok(true, 'keyboard: Mark as OK lands on Undo');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement && document.activeElement.hasAttribute('data-ok'), null, { timeout: 3000 });
  ok(true, 'keyboard: Undo lands on Mark as OK');

  /* The focus ring: 2 px ink, 2 px offset (a Tab press, so :focus-visible holds). */
  const ring = async (sel) => {
    await page.focus(sel);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    return page.evaluate(() => { const c = getComputedStyle(document.activeElement); return [c.outlineStyle, c.outlineWidth, c.outlineOffset, c.outlineColor]; });
  };
  for (const sel of ['[data-group="1"]', '#qc-g1 [data-open]', '#qc-g1 [data-ok]', '.qc-verdict [data-run]']) {
    const r = await ring(sel);
    ok(r.join() === 'solid,2px,2px,rgb(28, 28, 26)', `focus ring on ${sel}: ${r}`);
  }

  /* 44 px hit areas, same look: rows stay as tall as the design's. */
  await page.click('#qc-g1 [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; }, null, { timeout: 3000 });
  await page.click('[data-group="7"]');
  const small = await page.$$eval('[data-qc] a, [data-qc] button', (es) => es.map((e) => [e.textContent.trim().slice(0, 24), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h > 0 && h < 44));
  ok(small.length === 0, `every control is at least 44 px: ${JSON.stringify(small)}`);
  const qcRow = await page.$eval('#qc-g1 .qc-it', (e) => Math.round(e.getBoundingClientRect().height));
  ok(qcRow <= 66, `the row keeps the design's height (${qcRow} px)`);
  const nav = await page.$$eval('.book-nav a, .book-nav button', (es) => es.map((e) => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h > 0 && h < 44));
  ok(nav.length === 0, `sidebar controls: ${JSON.stringify(nav)}`);

  /* Live regions. */
  ok(await page.$eval('[data-book-content]', (e) => e.getAttribute('aria-live') === 'polite'), 'the step area is a polite live region');
  ok(await page.$eval('nav[aria-label="Book steps"]', (n) => !!n), 'the sidebar is labeled');
  ok(await page.$eval('[data-next]', (b) => b.getAttribute('aria-describedby') === 'nextNote' && !b.disabled), 'Next is on and described by its note (E13.2)');

  /* Functional colors keep an icon and a word. */
  ok(await page.$$eval('.qc-chip.is-warn, .qc-chip.is-ok', (cs) => cs.every((c) => c.querySelector('svg') && c.textContent.trim())), 'chips have an icon and a word');

  /* 900 px: no sideways scroll, in every state. The aside goes under the list (V8). */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(100);
  ok(await QC.noScroll(page), '53 at 900 px: no sideways scroll');
  const head = await page.evaluate(() => { const h = document.querySelector('.book-head'), t = document.querySelector('.book-head h1'), l = document.querySelector('[data-step-label]'); const box = h.getBoundingClientRect(); return { title: Math.round(t.getBoundingClientRect().height), label: Math.round(l.getBoundingClientRect().height), top: l.getBoundingClientRect().top - box.top, bottom: box.bottom - t.getBoundingClientRect().bottom, note: document.querySelector('[data-next-note]').getBoundingClientRect().bottom <= box.bottom }; });
  ok(head.title <= 32 && head.label <= 18 && head.top >= 0 && head.bottom >= 0 && head.note, `900 px: the head holds the name on one line: ${JSON.stringify(head)}`);
  const under = await page.evaluate(() => document.querySelector('.qc-side').getBoundingClientRect().top >= document.querySelector('.qc-main').getBoundingClientRect().bottom - 1);
  ok(under, '53 at 900 px: the aside is under the list');
  await page.evaluate(() => [...document.querySelectorAll('.qc-gb[aria-expanded="false"]')].forEach((b) => b.click()));
  await page.waitForTimeout(100);
  ok(await QC.noScroll(page), '53 at 900 px, all open: no sideways scroll');
  ok(await page.$$eval('[data-qc] *', (es) => { const w = document.querySelector('.book-content').getBoundingClientRect().right; return es.every((e) => e.getBoundingClientRect().right <= w + 1); }), '53 at 900 px: nothing past the edge');

  st.edit(st.section('3.2'), st.section('3.2').version.content + ' Changed.');
  await QC.open7(page);
  ok(await QC.noScroll(page), '55 B at 900 px: no sideways scroll');
  await QC.run(page);
  st.runs.length = 0;
  await QC.open7(page);
  ok(await QC.noScroll(page), '52 at 900 px: no sideways scroll');
  globalThis.__modes.qcSlow = 1500;
  await page.click('[data-run]');
  await page.waitForSelector('[data-running]', { timeout: 3000 });
  ok(await QC.noScroll(page), '55 A at 900 px: no sideways scroll');
  globalThis.__modes.qcSlow = 0;
  await page.waitForFunction(() => !document.querySelector('[data-running]'), null, { timeout: 5000 });

  /* The rail and the full sidebar on 06 at 900 px. */
  await page.click('[data-back]');
  await page.waitForSelector('[data-editor]', { timeout: 5000 });
  ok(await QC.noScroll(page), '06 rail at 900 px: no sideways scroll');

  /* 200% text: the page still fits (a wrapped row, never a sideways scroll). */
  await page.click('[data-step="7"]');
  await page.waitForSelector('.qc-verdict, .qc-box', { timeout: 5000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  ok(await QC.noScroll(page), '1440 px: no sideways scroll');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
