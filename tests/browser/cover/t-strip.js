// Owner, Nov 17: on 09 Cover a completed book shows no "This book is marked completed" strip (design 22f, 13).
// The strip pushed the editor down; designs 58 to 74b have none. 01 to 08 keep it (here: 08; format/t-strip.js too).
// The editor of a completed book must sit exactly where an in-progress book's does, at 1440, 1200 and 900 wide.
// Under 900 px the notice (design 74b) still shows. Shots (git-ignored) at 1440 and 900 for the design 58 compare.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const strip = () => page.$eval('[data-book-strip]', (e) => ({ hidden: e.hidden, html: e.innerHTML.trim(), h: Math.round(e.getBoundingClientRect().height) }));
  /** The editor's boxes: the root, the tools, the left panel, the view toolbar, the canvas area. */
  const boxes = () => page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.width || b.height ? [Math.round(b.top), Math.round(b.height)] : 'none'; };
    return { root: r('.cv-root'), tools: r('[data-tools]'), panel: r('[data-panel]'), viewbar: r('[data-viewbar]'), canvas: r('[data-wswrap]'),
      bottom: Math.round(document.querySelector('.cv-root').getBoundingClientRect().bottom), win: innerHeight,
      scroll: document.documentElement.scrollHeight <= document.documentElement.clientHeight };
  });
  const widths = [1440, 1200, 900];

  /* The same book in progress: the reference boxes. */
  const ref = {};
  st.book.status = 'in_progress';
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await CV.open(page, { design: 'band' });
    ref[w] = await boxes();
  }

  /* Completed: no strip on 09, the editor in the same place, nothing scrolls. */
  st.book.status = 'completed';
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await CV.open(page, { design: 'band' });
    await page.waitForTimeout(300);                       // readStatus() runs after a completed book opens
    const s = await strip();
    ok(s.hidden && s.html === '' && s.h === 0, `${w}: no strip on 09 (${JSON.stringify(s)})`);
    const b = await boxes();
    ok(JSON.stringify(b) === JSON.stringify(ref[w]), `${w}: root, tools, panel, toolbar and canvas match the in-progress book ${JSON.stringify(b)}`);
    ok(b.bottom === b.win && b.scroll, `${w}: the editor ends at the window bottom (${b.bottom} of ${b.win}), no page scroll`);
    ok(b.root[0] === b.viewbar[0], `${w}: the toolbar is at the top of the editor (${b.viewbar[0]})`);
    if (w === 1440) await page.screenshot({ path: `${SHOTS}/strip-09-completed-1440.png` });
    if (w === 900) await page.screenshot({ path: `${SHOTS}/strip-09-completed-900.png` });
  }

  /* Under 900 px: the notice of design 74b, still no strip. */
  await page.setViewportSize({ width: 899, height: 900 });
  await page.waitForSelector('[data-tiny]', { timeout: 5000 });
  ok((await CV.txt(page, '.cv-tiny-h')) === 'This window is too narrow for the cover editor', '899: the too-narrow notice');
  ok((await strip()).hidden, '899: no strip');

  /* 08 keeps the strip; back on 09 it goes again (renderStrip runs on each step change). */
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.ready(page);
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  const s8 = await strip();
  ok(!s8.hidden && s8.h > 0, `08: the strip shows (${s8.h} px)`);
  ok((await CV.txt(page, '[data-book-strip]')) === 'This book is marked completed. You can still edit it. A new version keeps it completed. Reopen book', '08: the strip words and Reopen book');
  await page.click('[data-step="9"]');
  await CV.ready(page);
  ok((await strip()).hidden, '08 → 09: the strip hides again');

  st.book.status = 'in_progress';
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
