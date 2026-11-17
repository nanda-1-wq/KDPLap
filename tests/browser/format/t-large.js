// E13.2b Part 3: 08 at 8 × 10 and 8.5 × 11 (layout A, STOP 1). The select, the margin note with the
// trim's margins (T4) before and after the preview, the cream note (T9) on and off, the Ready box with the
// trim and paper, the preview spread at 1440 and 900 and in full screen, the export row on.
// Mock data, the real engine from the cache.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const fit = (scope) => page.evaluate((sc) => {
    const stage = document.querySelector(`${sc} [data-fmt-stage]`).getBoundingClientRect();
    const p = document.querySelector(`${sc} .fmt-page.is-right`).getBoundingClientRect();
    return { sw: stage.width, sh: stage.height, pw: p.width, ph: p.height, ratio: p.width / p.height };
  }, scope);
  const fills = (f) => Math.abs(2 * f.pw - f.sw) <= 2 || Math.abs(f.ph - f.sh) <= 2;
  const inside = (f) => 2 * f.pw <= f.sw + 2 && f.ph <= f.sh + 2;
  const note = () => FM.txt(page, '[data-fmt-margin]');
  const paperNote = () => page.$eval('[data-fmt-paper-note]', (n) => ({ hidden: n.hidden, shown: n.offsetParent !== null, text: n.textContent.trim(),
    described: document.querySelector('[data-fmt-select="paper"]').getAttribute('aria-describedby') === n.id }));
  const T9 = "KDP's Expanded Distribution needs white paper at this size.";
  const LARGE = { '8x10': { m: 'We use 1.125 in inside and 1.375 in outside, mirrored.', ratio: 0.8 }, '8.5x11': { m: 'We use 1.25 in inside and 1.75 in outside, mirrored.', ratio: 8.5 / 11 } };

  await page.setViewportSize({ width: 1440, height: 1100 });
  for (const [trim, want] of Object.entries(LARGE)) {
    st.brief.trim_size = trim;
    st.format = null;
    await FM.open(page);
    ok(await page.$eval('[data-fmt-trim]', (s, t) => s.value === t && s.options.length === 6, trim), `${trim}: the select shows it among the 6 trims (no extra choice)`);
    ok(!(await FM.has(page, '.fmt-trim-off')), `${trim}: no "Print PDF needs" note`);
    await pages();
    const n = await note();
    ok(n === `KDP minimum 0.375 in inside for 24 to 150 pages. ${want.m}`, `${trim}: T4 margin note with the real page count: "${n}"`);
    let f = await fit('.fmt-wrap');
    ok(fills(f) && inside(f) && Math.abs(f.ratio - want.ratio) < 0.01, `${trim}: 1440: the spread fills its box and keeps the page shape (${Math.round(2 * f.pw)} × ${Math.round(f.ph)} in ${Math.round(f.sw)} × ${Math.round(f.sh)}, ${f.ratio.toFixed(3)})`);
    const ready = await page.$eval('.fmt-ready', (r) => r.textContent.replace(/\s+/g, ' ').trim());
    ok(/^Ready to export\./.test(ready), `${trim}: the Ready box: "${ready.slice(0, 50)}…"`);
    // The cream note: off on white, on with cream (no rebuild), off again on white.
    let p = await paperNote();
    ok(p.hidden && !p.shown && p.described && p.text === T9, `${trim}: white paper: no cream note (${JSON.stringify(p)})`);
    await page.evaluate(() => { window.__b = window.kdpBookSteps[8]._debug().build; });
    await page.selectOption('[data-fmt-select="paper"]', 'cream');
    await FM.saved(page);
    p = await paperNote();
    ok(!p.hidden && p.shown && p.text === T9, `${trim}: cream paper: T9 "${p.text}"`);
    ok(FM.lastSave().body.paper === 'cream', `${trim}: cream is saved`);
    ok((await note()) === `KDP minimum 0.375 in inside for 24 to 150 pages. ${want.m}`, `${trim}: cream: the margin note stays (well under the limit)`);
    await page.waitForTimeout(1600);   // past the preview delay
    ok(await page.evaluate(() => window.kdpBookSteps[8]._debug().build === window.__b && window.__b.state === 'ready'), `${trim}: cream: no rebuild (paper is not in the interior)`);
    await page.selectOption('[data-fmt-select="paper"]', 'white');
    await FM.saved(page);
    p = await paperNote();
    ok(p.hidden && !p.shown, `${trim}: back to white: the cream note goes`);
    // The export row is on: no "why" line, Export is a button you can press.
    ok(!(await FM.has(page, '.fmt-exp-why')), `${trim}: no blocked line on the page`);
  }

  /* 8.5 × 11 at 900 px and in full screen: the wider spread fits, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(600);
  let f = await fit('.fmt-wrap');
  ok(fills(f) && inside(f) && await FM.noScroll(page), `8.5x11: 900: the spread fits its box, no sideways scroll (${Math.round(2 * f.pw)} × ${Math.round(f.ph)} in ${Math.round(f.sw)} × ${Math.round(f.sh)})`);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.waitForTimeout(400);
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]', { timeout: 3000 });
  await page.waitForFunction(() => document.querySelectorAll('dialog.fmt-full .fmt-page canvas').length >= 1, null, { timeout: 5000 });
  await page.waitForTimeout(400);
  f = await fit('dialog.fmt-full');
  ok(fills(f) && inside(f) && Math.abs(f.ratio - 8.5 / 11) < 0.01, `8.5x11: full screen: the spread fills the stage (${Math.round(2 * f.pw)} × ${Math.round(f.ph)} in ${Math.round(f.sw)} × ${Math.round(f.sh)})`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.fmt-full[open]'), null, { timeout: 3000 });

  /* A group A trim on cream: no cream note (Expanded Distribution takes cream there). */
  st.brief.trim_size = '6x9';
  st.format = null;
  await FM.open(page);
  await page.selectOption('[data-fmt-select="paper"]', 'cream');
  await FM.saved(page);
  const p6 = await paperNote();
  ok(p6.hidden && !p6.shown, '6x9 on cream: no cream note');
  ok((await note()).endsWith('We use 0.75 in inside and 0.5 in outside, mirrored.'), `6x9: the margin note keeps today's margins: "${await note()}"`);

  st.brief.trim_size = '6x9';
  st.format = null;
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
