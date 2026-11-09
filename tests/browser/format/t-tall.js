// D3 (owner, Nov 9; plan F13): on 08 the preview bar and the gray area take the whole visible height of
// the screen, so the spread is as big as the window allows (1440 × 900 and 900 px); the Ready box sits under
// the gray area and the page scrolls to it; the header reason line stays. E13.2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const m = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const col = r('.fmt-preview'), stage = r('.fmt-wrap [data-fmt-stage]'), bar = r('.fmt-bar'), wrap = r('.fmt-wrap'), ready = r('.fmt-ready'), pg = r('.fmt-page.is-right');
    const pad = parseFloat(getComputedStyle(document.querySelector('.fmt-preview')).paddingBottom);
    return { vh: innerHeight, vw: innerWidth, colTop: col.top, colBottom: col.bottom, barTop: bar.top, barBottom: bar.bottom, wrapTop: wrap.top, wrapBottom: wrap.bottom, wrapH: wrap.height,
      readyTop: ready.top, readyBottom: ready.bottom, readyH: ready.height, pad, pageW: pg.width, pageH: pg.height, stageW: stage.width, stageH: stage.height,
      scroller: document.querySelector('.fmt-preview').scrollHeight > document.querySelector('.fmt-preview').clientHeight,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });

  /* 1440 × 900: the gray area runs from under the bar to the bottom of the column (less its padding). */
  st.qcRun = { checked_at: '2026-11-07T10:00:00Z', current: true };
  await page.setViewportSize({ width: 1440, height: 900 });
  await FM.open(page);
  await pages();
  await page.waitForTimeout(500);
  let a = await m();
  ok(Math.abs(a.wrapBottom - (a.colBottom - a.pad)) <= 1.5 && Math.abs(a.colBottom - a.vh) <= 1, `1440 × 900: the gray area reaches the bottom of the screen (ends at ${Math.round(a.wrapBottom)} of ${a.vh}, column padding ${a.pad})`);
  ok(a.wrapTop > a.barBottom && a.wrapTop - a.barBottom <= 16, `the gray area starts right under the preview bar (${Math.round(a.wrapTop - a.barBottom)} px gap)`);
  ok(a.readyH > 0 && a.readyTop >= a.vh, `the Ready box is under the gray area, below the screen (top ${Math.round(a.readyTop)})`);
  ok(Math.abs(a.pageH - a.stageH) <= 2 || Math.abs(2 * a.pageW - a.stageW) <= 2, `the spread fills its box: a page is ${Math.round(a.pageW)} × ${Math.round(a.pageH)} in ${Math.round(a.stageW)} × ${Math.round(a.stageH)}`);
  ok(a.scroller && !a.sideways, 'the preview column scrolls (no sideways scroll)');
  const readyText = await page.$eval('.fmt-ready', (r) => r.textContent.replace(/\s+/g, ' ').trim());
  ok(/^Ready to export\./.test(readyText), `the Ready box is there: "${readyText.slice(0, 60)}…"`);

  /* Scrolling the column brings the Ready box into view; the bar and the head stay as they are. */
  const head = await page.$eval('.book-head', (h) => ({ h: h.getBoundingClientRect().height, note: (h.querySelector('[data-next-note]') || {}).textContent || '' }));
  await page.$eval('.fmt-preview', (p) => p.scrollTo(0, p.scrollHeight));
  await page.waitForTimeout(300);
  const b = await m();
  ok(b.readyBottom <= b.vh + 0.5 && b.readyTop >= b.colTop, `scrolled: the Ready box shows (${Math.round(b.readyTop)} to ${Math.round(b.readyBottom)})`);
  const head2 = await page.$eval('.book-head', (h) => ({ h: h.getBoundingClientRect().height, note: (h.querySelector('[data-next-note]') || {}).textContent || '' }));
  ok(head2.h === head.h && head2.note === head.note && head.h === 80, `the head and its reason line stay (${head.h} px, "${head.note.trim()}")`);
  ok(Math.abs(b.pageW - a.pageW) < 0.5, 'scrolling does not redraw the spread at another size');
  await page.$eval('.fmt-preview', (p) => p.scrollTo(0, 0));

  /* A change in the Ready box (warnings) does not shrink the spread. */
  const before = a.pageH;
  st.chapters[2].sections[0].status = 'draft';
  await FM.open(page);
  await pages();
  await page.waitForSelector('.fmt-ready .alert-warning', { timeout: 10000 });
  await page.waitForTimeout(500);
  a = await m();
  ok(Math.abs(a.pageH - before) < 1 && Math.abs(a.wrapBottom - (a.colBottom - a.pad)) <= 1.5, `with warnings in the Ready box the spread keeps its size (${Math.round(a.pageH)} vs ${Math.round(before)})`);
  st.chapters[2].sections[0].status = 'final';

  /* 1440 × 1100: still the whole height. */
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(600);
  a = await m();
  ok(Math.abs(a.wrapBottom - (a.colBottom - a.pad)) <= 1.5 && a.pageH > before + 20 && (Math.abs(a.pageH - a.stageH) <= 2 || Math.abs(2 * a.pageW - a.stageW) <= 2), `1440 × 1100: the gray area fills the taller screen, a bigger spread up to the box's width (${Math.round(a.pageW)} × ${Math.round(a.pageH)} in ${Math.round(a.stageW)} × ${Math.round(a.stageH)})`);

  /* 900 × 900: one column; scrolled to the bar, the gray area fills the rest of the screen; the Ready box under it. */
  await page.setViewportSize({ width: 900, height: 900 });
  await FM.open(page);
  await pages();
  await page.waitForTimeout(500);
  await page.$eval('.fmt-preview', (p) => window.scrollTo(0, p.getBoundingClientRect().top + window.scrollY));
  await page.waitForTimeout(500);
  a = await m();
  ok(a.colTop > -1 && a.colTop < 1 && Math.abs(a.wrapBottom - (a.vh - a.pad)) <= 1.5, `900: scrolled to the preview, the gray area ends at the bottom of the screen (${Math.round(a.wrapBottom)} of ${a.vh})`);
  ok(a.readyTop >= a.vh && a.readyH > 0, `900: the Ready box is under it (top ${Math.round(a.readyTop)})`);
  ok(!a.sideways, '900: no sideways scroll');
  await page.$eval('.fmt-ready', (r) => r.scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(300);
  a = await m();
  ok(a.readyBottom <= a.vh + 0.5 && a.readyTop >= 0, '900: the page scrolls to the Ready box');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
