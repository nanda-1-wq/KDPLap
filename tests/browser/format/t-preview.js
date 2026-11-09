// 41: the print preview (the real engine from the checked cache), the chips, the margin note
// with the KDP minimum for the page count, the Ready box and its 07 line. E13.2 Part 3.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const D = () => page.evaluate(() => { const x = window.kdpBookSteps[8]._debug(); return { eng: x.eng.state, build: x.build.state, pages: x.build.pages, info: x.build.info, drawn: x.pv ? x.pv.drawn() : [], engine: !!x.engine, worker: x.engine ? x.engine.hasWorker() : false }; });
  const pages = async () => { await page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && x.pv && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 }); return D(); };
  const marginOf = (n) => page.evaluate((p) => kdpFormatRules.marginNote(p), n);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await FM.open(page);

  /* The engine loads when 08 opens, builds, and draws the real pages (design 41). */
  let d = await pages();
  ok(d.eng === 'ready' && d.pages >= 24 && d.pages % 2 === 0, `the engine built ${d.pages} pages (even)`);
  const files = st.cdn.map((c) => c.file);
  ok(files.some((f) => /\.wasm$/.test(f)) && files.filter((f) => /eb-garamond/.test(f)).length === 4, `downloaded: the engine and Classic's 4 fonts (${files.length} files)`);
  ok(!files.some((f) => /lora|literata|source-sans|source-serif/.test(f)), 'only the chosen style\'s fonts');

  /* Chips: "<n> pages · made even (<n-1> + 1 blank)" or "<n> pages", and the spine. */
  const chips = await FM.all(page, '.fmt-chip');
  const want0 = d.info.blanks ? `${d.pages} pages · made even (${d.info.content} + ${d.info.blanks} blank)` : `${d.pages} pages`;
  const spine = (d.pages * 0.002252).toFixed(3);
  ok(chips[0] === want0, `page chip: ${chips[0]}`);
  ok(chips[1] === `Spine ${spine} in · no spine text under 80 pages`, `spine chip: ${chips[1]}`);

  /* The margin note: the KDP minimum for this page count (owner, STOP 3). */
  const note = await FM.txt(page, '[data-fmt-margin]');
  ok(note === await marginOf(d.pages) && /^KDP minimum 0\.375 in inside for 24 to 150 pages\. We use 0\.75 in inside and 0\.5 in outside, mirrored\.$/.test(note), `margin note for ${d.pages} pages: ${note}`);

  /* The spread: page 1 alone on the right, then 2 and 3. Prev off at the start. */
  ok((await FM.txt(page, '[data-fmt-label]')) === `Page 1 of ${d.pages}`, 'Page 1 of N');
  ok(await page.$eval('[data-fmt-prev]', (b) => b.disabled) && await page.$eval('[data-fmt-next]', (b) => !b.disabled), 'Previous off, Next on');
  ok(await page.$eval('.fmt-page.is-right', (p) => p.getAttribute('aria-label') === 'Page 1, right-hand' && p.getAttribute('role') === 'img'), 'page 1: the right-hand page, labeled');
  ok(await page.$$eval('.fmt-nav-btn', (b) => b.every((x) => x.getBoundingClientRect().height >= 44 && x.getAttribute('aria-label'))), 'page buttons: 44 px, labeled');
  await page.click('[data-fmt-next]');
  await page.waitForFunction(() => document.querySelector('[data-fmt-label]').textContent.startsWith('Pages 2 and 3'), null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('.fmt-page canvas').length === 2, null, { timeout: 5000 });
  ok(true, 'Next: pages 2 and 3');
  await page.focus('[data-fmt-next]');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-fmt-label]').textContent.startsWith('Pages 4 and 5'), null, { timeout: 5000 });
  ok(true, 'ArrowRight turns the page');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[data-fmt-label]').textContent.startsWith('Pages 2 and 3'), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  d = await D();
  ok(d.drawn.every((n) => n >= 2 && n <= 5) && d.drawn.length <= 4, `only this spread and the next are kept: ${d.drawn}`);

  /* A change rebuilds: "Updating preview" over the old pages, then the new ones; the spread stays. */
  const before = d.pages;
  await page.click('.fmt-style:has(input[value="warm"])');
  await page.waitForFunction(() => !document.querySelector('[data-fmt-updating]').hidden, null, { timeout: 3000 });
  ok(await page.$eval('[data-fmt-wrap]', (w) => w.classList.contains('is-updating')) && (await FM.txt(page, '[data-fmt-updating]')) === 'Updating preview', 'Updating preview, old pages dimmed');
  await page.waitForFunction(() => document.querySelector('[data-fmt-updating]').hidden, null, { timeout: 30000 });
  d = await pages();
  ok(st.cdn.filter((c) => /lora/.test(c.file)).length === 4, 'Warm: its 4 fonts downloaded once');
  ok((await FM.txt(page, '[data-fmt-label]')).startsWith('Pages 2 and 3'), 'the spread stays after a rebuild');
  ok(await FM.txt(page, '[data-fmt-margin]') === await marginOf(d.pages), `margin note follows the new count (${before} → ${d.pages})`);

  /* Paper is not in the interior: no rebuild, only the spine chip changes. */
  const builds = await page.evaluate(() => window.kdpBookSteps[8]._debug().build.ms);
  await page.selectOption('[data-fmt-select="paper"]', 'cream');
  await page.waitForTimeout(900);
  ok(await page.$eval('[data-fmt-updating]', (u) => u.hidden), 'paper: no rebuild');
  ok((await FM.all(page, '.fmt-chip'))[1] === `Spine ${(d.pages * 0.0025).toFixed(3)} in · no spine text under 80 pages`, 'cream: the spine chip changes');
  ok(JSON.stringify(builds) === JSON.stringify(await page.evaluate(() => window.kdpBookSteps[8]._debug().build.ms)), 'the same build');

  /* Ready (design 41): green, with the 07 line. */
  ok((await FM.txt(page, '.fmt-alert-ok')).startsWith('Ready to export. All 17 sections Final. No characters missing from the font.'), 'Ready to export, all Final');
  ok(await page.$eval('.fmt-alert-ok', (a) => !!a.querySelector('svg') && a.getAttribute('role') === 'status'), 'the green box: icon and words, a status');
  ok((await FM.txt(page, '.fmt-alert-ok .fmt-qc-line')) === '07 Quality Control has not run yet. Run it', '07 not run: Run it');

  /* The 07 line: current and out of date (read on a step change). */
  st.qcRun = { checked_at: '2026-11-07T10:00:00Z', current: true };
  await page.click('[data-step="7"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  await page.click('[data-step="8"]');
  await pages();
  await page.waitForFunction(() => /ran on/.test(document.querySelector('.fmt-qc-line').textContent), null, { timeout: 5000 });
  ok((await FM.txt(page, '.fmt-qc-line')) === '07 Quality Control ran on Nov 7 and is current. See results', '07 current: ran on Nov 7, See results');
  st.qcRun.current = false;
  await page.click('[data-step="7"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => /out of date/.test((document.querySelector('.fmt-qc-line') || {}).textContent || ''), null, { timeout: 20000 });
  ok((await FM.txt(page, '.fmt-qc-line')) === '07 Quality Control is out of date. Run it again', '07 out of date: Run it again');
  await page.click('.fmt-qc-line a');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Quality Control', null, { timeout: 5000 });
  ok(/step=7/.test(page.url()), 'the 07 link opens 07');

  /* Leaving 08 ends the engine and its worker. */
  d = await D();
  ok(!d.engine && !d.worker, 'leaving 08 ends the engine');

  /* Warnings (41c): never block. One link to the first section in 06. */
  st.chapters[1].sections[1].status = 'draft';
  st.chapters[2].sections[0].needs_review = true;
  st.chapters[3].sections[2].version.content += ' A small win 😀 today.';
  await FM.open(page);
  await pages();
  const warn = await FM.txt(page, '.fmt-ready .alert-warning');
  ok(warn.startsWith('3 things to check') && warn.includes('1 section is not Final. It is left out.') && warn.includes('1 section needs review.')
    && /1 character is not in the font \(an emoji in [^)]+\)\. It prints as a box\./.test(warn), `warnings: ${warn}`);
  ok(await page.$eval('.fmt-ready .alert-warning', (a) => !!a.querySelector('svg') && a.getAttribute('role') === 'status'), 'warnings: icon and words');
  const href = await page.$eval('.fmt-ready-link', (a) => a.getAttribute('href'));
  ok((await FM.txt(page, '.fmt-ready-link')) === 'Show in 06 Write' && href.includes('step=6&section=' + st.chapters[2].sections[0].id), `Show in 06 Write opens the first section: ${href}`);
  ok((await FM.all(page, '.fmt-ready > .fmt-note'))[0] === 'You can still export.', 'You can still export.');
  ok(!(await FM.has(page, '.fmt-alert-ok')), 'no green box with warnings');
  st.chapters[1].sections[1].status = 'final';
  st.chapters[2].sections[0].needs_review = false;
  st.chapters[3].sections[2].version.content = st.chapters[3].sections[2].version.content.replace(' A small win 😀 today.', '');

  /* Kindle (41b): the state, no chips; Print brings back the same pages with no rebuild. */
  await FM.open(page);
  d = await pages();
  const ms = await page.evaluate(() => window.kdpBookSteps[8]._debug().build.ms);
  await page.click('[data-fmt-mode="kindle"]');
  ok((await FM.txt(page, '[data-fmt-state] .fmt-state-title')) === 'Kindle preview comes with the EPUB.' && await page.$eval('[data-fmt-stage]', (s) => s.hidden) && !(await FM.has(page, '.fmt-chip')), 'Kindle: the state, no pages, no chips');
  await page.click('[data-fmt-mode="print"]');
  ok(!(await page.$eval('[data-fmt-stage]', (s) => s.hidden)) && (await FM.all(page, '.fmt-chip')).length === 2 && JSON.stringify(ms) === JSON.stringify(await page.evaluate(() => window.kdpBookSteps[8]._debug().build.ms)), 'Print: the pages again, no rebuild');

  /* 900 px: the preview under the settings, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(300);
  ok(await FM.noScroll(page), '900: no sideways scroll');
  ok(await page.$eval('.fmt-preview', (p) => p.getBoundingClientRect().top > document.querySelector('.fmt-settings').getBoundingClientRect().top + 100), '900: the preview is under the settings');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
