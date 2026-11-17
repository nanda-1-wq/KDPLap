// E13.2b STOP 3 (never in a sweep): 08 at 8 × 10 and 8.5 × 11 next to design 41, at 1440, 900 and 390 px,
// and the live texts T1 to T7, T9 to T11 once each. A long 8.5 × 11 book on cream (over KDP's 550 pages)
// shows T5 and T7 on the real screen. Files go to docs/reviews/e13-2b-stop3/. Mock data, the real engine.
// To show the trim list (T10) the select is drawn as a list box (size=6) for the picture only.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2b-stop3');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const shot = async (name, full = false) => { await ready(); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 30000 }); log.push(`PASS ${name}.png`); };
  const crop = async (name, sel, dir = SHOTS) => { await ready(); await (await page.$(sel)).screenshot({ path: `${dir}/${name}.png`, timeout: 20000 }); };
  const pages = (t = 30000) => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: t });
  const todo = [];
  async function compare(name, rowsOfBuilt, design, title) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => `${base}/tests/browser/shots/format/${b}.png`;
    const rowsHtml = rowsOfBuilt.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:24px;padding:32px;background:#F3F3F1;border:1px solid #B8B8B3}
      .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{border:none;max-width:1370px}</style>
      <figure><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20000 });
    log.push(`PASS ${name}.png`);
  }
  const asList = () => page.$eval('[data-fmt-trim]', (s) => { s.size = s.options.length; s.style.height = 'auto'; });

  /* 1. 8.5 × 11, white, at 1440: the whole screen; the PAGE · PRINT group (T4, T10 as a list, T11). */
  st.brief.trim_size = '8.5x11';
  st.format = null;
  await size(1440, 1000);
  await FM.open(page);
  await pages();
  await shot('08-8.5x11-1440');
  await crop('p-85-page', '.fmt-group:has([data-fmt-trim])');
  await asList();
  await crop('p-85-list', '.fmt-group:has([data-fmt-trim])');
  /* 2. Cream on 8.5 × 11: the cream note (T9). */
  await FM.open(page);
  await pages();
  await page.selectOption('[data-fmt-select="paper"]', 'cream');
  await FM.saved(page);
  await crop('p-85-cream', '.fmt-group:has([data-fmt-trim])');
  await page.selectOption('[data-fmt-select="paper"]', 'white');
  await FM.saved(page);
  /* 3. 900 and 390. */
  await size(900, 900);
  await page.waitForTimeout(600);
  await shot('08-8.5x11-900');
  await size(390, 844);
  await page.waitForTimeout(600);
  await shot('08-8.5x11-390');

  /* 4. 8 × 10 at 1440: the drawing and the margin note (T4, T11). */
  st.brief.trim_size = '8x10';
  st.format = null;
  await size(1440, 1000);
  await FM.open(page);
  await pages();
  await shot('08-8x10-1440');
  await crop('p-810-page', '.fmt-group:has([data-fmt-trim])');

  /* 5. An old 7 × 10: T2 (the preview state), T3 (the field note), T1 (the export row). */
  st.brief.trim_size = '7x10';
  st.format = null;
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state]:not([hidden])', { timeout: 10000 });
  await crop('p-710-state', '[data-fmt-state]');
  await crop('p-710-field', '.fmt-group:has([data-fmt-trim])');
  await page.click('[data-export]');
  await page.waitForSelector('.fmt-exp[open] .fmt-exp-why', { timeout: 10000 });
  await crop('p-710-export', '.fmt-exp[open] .fmt-exp-row');
  await page.keyboard.press('Escape');

  /* 6. A long 8.5 × 11 book on cream: over KDP's 550 pages (T5 margin note, T7 Ready box) and T9. */
  const chapters = st.chapters;
  let n = 0;
  for (const c of chapters.filter((x) => x.kind === 'chapter')) {
    const base = c.sections[0];
    for (let i = 0; i < 85; i++) {
      n++;
      c.sections.push({ ...JSON.parse(JSON.stringify(base)), id: `5${String(9000000 + n).padStart(7, '0')}-0000-4000-8000-0000000000aa`, position: c.sections.length + 1, title: `${c.title} more ${i + 1}`,
        version: { ...base.version, id: `7${String(9000000 + n).padStart(7, '0')}-0000-4000-8000-0000000000aa` } });
    }
  }
  st.brief.trim_size = '8.5x11';
  st.format = null;
  await FM.open(page);
  await page.selectOption('[data-fmt-select="paper"]', 'cream');
  await FM.saved(page);
  await pages(240000);
  const pg = await page.evaluate(() => window.kdpBookSteps[8]._debug().build.pages);
  ok(pg > 550, `the long book has ${pg} pages (over 550)`);
  await page.waitForTimeout(800);
  await crop('p-long-page', '.fmt-group:has([data-fmt-trim])');
  await crop('p-long-ready', '.fmt-ready');
  const t5 = await FM.txt(page, '[data-fmt-margin]');
  const t7 = await FM.txt(page, '.fmt-ready');
  ok(t5 === 'KDP prints up to 550 pages at 8.5 × 11 in on cream paper. We use 1.25 in inside and 1.75 in outside, mirrored.', `T5: "${t5}"`);
  ok(t7.includes(`${pg} pages. KDP prints up to 550 pages at 8.5 × 11 in on cream paper.`), `T7 in the Ready box: "${t7.slice(0, 160)}…"`);

  todo.push(['08-8.5x11-compare', [['p-85-page', 'p-85-list', 'p-85-cream'], ['p-810-page']], '41-step08-format',
    '08 PAGE · PRINT at 8.5 × 11 (T4, T11), the 6 trims as a list (T10), cream (T9); 8 × 10 (T4, T11)']);
  todo.push(['08-texts-compare', [['p-710-state'], ['p-710-field', 'p-710-export'], ['p-long-page', 'p-long-ready']], '41-step08-format',
    '7 × 10: T2 state, T3 note, T1 export row; long 8.5 × 11 book on cream: T5 margin note, T7 Ready box, T9']);
  for (const a of todo) await compare(...a);
  ok(true, `images in ${OUT.replace(/^.*KDPLap\//, '')}`);
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
