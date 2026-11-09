// Standing rule (plan §6, E14 §8.5), Part 4: 42 (Export files panel, exporting, error) and 50 (the 08
// marks: sidebar, rail, Books card), each at 1440 next to the design, plus 900 px. Also remakes the STOP 3
// 41c compare from its crops (tests/browser/shots/format/c41c-*.png, made by t-shots3) so the warnings card
// is readable (owner, STOP 3). Run tests/browser/run.sh books t-badge.js first (the Books card picture).
// Files go to docs/reviews/e13-2-stop4/ (and 41c to e13-2-stop3/). Mock data, the real engine from the cache.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2-stop4');
  const OUT3 = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2-stop3');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const shot = async (name, dir = SHOTS, full = true) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full, timeout: 20000 }); };
  const crop = async (name, sel) => {
    await ready();
    const tag = await page.addStyleTag({ content: 'dialog::backdrop{background:transparent!important}' });
    await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 20000, omitBackground: true });
    await tag.evaluate((t) => t.remove());
  };
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const panel = '.fmt-exp[open]';

  const todo = [];   // compare() leaves the app page: the pictures are made at the end
  const later = (...a) => todo.push(a);
  /** built: picture names in shots/format (or "books/<name>"); rows: arrays of names, one row each. */
  async function compare(name, rowsOfBuilt, design, title, dir = OUT) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => `${base}/tests/browser/shots/${b.includes('/') ? b : `format/${b}`}.png`;
    const rowsHtml = rowsOfBuilt.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:24px;padding:32px;background:#F3F3F1;border:1px solid #B8B8B3}
      .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{border:none;max-width:1370px}</style>
      <figure><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, timeout: 20000 });
    log.push(`PASS ${name}.png`);
  }

  /* 42: exporting (the save held), then the panel after the export, then an error. */
  await size(1440, 1100);
  await FM.open(page);
  await pages();
  await page.click('[data-export]');
  await page.waitForSelector(`${panel} [data-pdf]`);
  globalThis.__modes.recordSlow = 4000;
  await page.click(`${panel} [data-pdf]`);
  await page.waitForFunction(() => /Saving the export/.test((document.querySelector('.fmt-exp[open] .fmt-exp-row') || {}).textContent || ''), null, { timeout: 30000 });
  await crop('e42-busy', `${panel} .fmt-exp-rows`);
  globalThis.__modes.recordSlow = 0;
  await page.waitForSelector(`${panel} .fmt-pill-ok`, { timeout: 15000 });
  await crop('e42-panel', panel);
  await size(900, 900);
  await shot('42-export-panel-900', OUT, false);
  await size(1440, 1100);
  globalThis.__modes.stale = 1;
  await page.click(`${panel} [data-pdf]`);
  await page.waitForSelector(`${panel} .fmt-exp-row.is-error`, { timeout: 60000 });
  await crop('e42-error', `${panel} .fmt-exp-row.is-error`);
  await page.keyboard.press('Escape');
  // Changed since the PDF: the warning look (as design 42's EPUB row).
  st.changed = true;
  await FM.open(page);
  await pages();
  await page.click('[data-export]');
  await page.waitForSelector(`${panel} .fmt-exp-row.is-changed`);
  await crop('e42-changed', `${panel} .fmt-exp-row.is-changed`);
  await size(900, 900);
  await shot('42-changed-900', OUT, false);
  await page.keyboard.press('Escape');
  later('42-export-panel-compare', [['e42-panel', 'e42-busy'], ['e42-changed', 'e42-error']], '42-step08-export-panel', 'Export files after an export; exporting; changed since the PDF; an error');

  /* 50: the 08 marks. Sidebar (08 check), the rail, the Books card (from books t-badge). */
  st.changed = false;
  await size(1440, 900);
  await FM.open(page, 7);
  await page.waitForFunction(() => document.querySelector('[data-step="8"]').classList.contains('is-done'), null, { timeout: 10000 });
  await crop('m50-sidebar', '.step-group:has([data-step="8"])');
  await FM.open(page);
  await crop('m50-rail', '.book-nav');
  await shot('50-marks-rail-1440', OUT, false);
  later('50-marks-compare', [['m50-sidebar', 'm50-rail'], ['books/books-pdf-marks-1440']], '50-step09-ready-to-publish', '08 marks: sidebar, rail, Books card (the 09 parts are E15)');

  /* 41c (STOP 3): the same crops, the warnings card full width so it is readable. */
  later('41c-states-compare', [['c41c-1', 'c41c-2', 'c41c-4'], ['c41c-3']], '41c-step08-engine-states', 'first visit, engine error, nothing Final; warnings (full width)', OUT3);

  for (const a of todo) await compare(...a);
  ok(true, `images in ${OUT.replace(/^.*KDPLap\//, '')}`);
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
