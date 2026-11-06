// Standing rule (plan 8.5), E14.6: 54 A, B, C, 55 D and 53 with group 6 open, each next to its design at 1440 px,
// each at 900 px, and the 06 manuscript head at 900 px after the fix. Files go to docs/reviews/e14-6-stop6/.
// Mock data only: no live sign-in, no AI call.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/qc$/, 'docs/reviews/e14-6-stop6');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250); };
  const shot = async (name, dir = SHOTS) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, timeout: 20000 }); };
  const dlg = 'dialog.qc-pr-dialog';
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });
  const openDialog = async () => { await page.click('[data-pr-check]'); await page.waitForSelector(`${dlg}[open]`); await until((s) => !/Reading/.test(document.querySelector(s).innerText), dlg); };
  const openGroups = async (...gs) => { for (const g of gs) if ((await page.$eval(`[data-group="${g}"]`, (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click(`[data-group="${g}"]`); };

  async function compare(name, built, design, title) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:1440px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${title}</figcaption><img src="${base}/tests/browser/shots/qc/${built}.png"></figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20000 });
  }

  /* The manuscript head after the fix: the crop and the book of the "before" shot. */
  await size(900, 900);
  await QC.open(page, 6);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await ready();
  await (await page.$('.wr-ms')).screenshot({ path: `${OUT}/06-manuscript-head-900-after.png`, timeout: 20000 });

  // The sample of design 53, a saved run, and chapters that drift.
  st.sample();
  await size(1440, 1300);
  await QC.open7(page);
  await QC.run(page);
  const items = st.runs[0].results.items;
  const under = items.find((x) => x.rule === 'under_target');
  const word = items.find((x) => x.rule === 'overused_word');
  st.dismiss(under.rule, under.key, '1.2 Start small part 2 · 384 of 900 words, under 80% of its target.', under.section_id);
  st.dismiss(word.rule, word.key, 'Whole book · "focus" is used 40 times.');
  await QC.open7(page);

  const both = async (name, wide = 1300) => {
    await size(1440, wide);
    await shot(`b${name}`);
    await size(900, 900);
    await shot(`${name}-900`, OUT);
    await size(1440, wide);
  };

  /* 54 A. */
  await size(1440, 900);
  await openDialog();
  await shot('b54a');
  await size(900, 900);
  await shot('54a-confirm-900', OUT);
  await size(1440, 900);
  await page.keyboard.press('Escape');

  /* 54 B: chapter 3 of 7. */
  modes.prHold = 3;
  st.plan[3] = { verdict: 'drifts', reason: 'The chapter turns to teens, not busy adults. Keep it on working adults.' };
  await openDialog();
  await page.click(`${dlg} [data-pr-go]`);
  await until(() => /Checking chapter 3/.test((document.querySelector('[data-pr-title]') || {}).textContent || ''));
  await size(1440, 1000);
  await shot('b54b');
  await size(900, 900);
  await shot('54b-running-900', OUT);
  await size(1440, 1000);

  /* 55 D: the AI fails on chapter 5. */
  modes.prFail = { 5: 'ai_unavailable' };
  st.plan[6] = { verdict: 'drifts', reason: 'The chapter promises a guaranteed result.', unsourced: ['90%'], quote: 'Keep your focus.', section_id: st.section('1.1').id };
  modes.prHold = 0;
  await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
  await shot('b55d');
  await size(900, 900);
  await shot('55d-failed-900', OUT);
  await size(1440, 1000);

  // Its short lines, and the network line: not drawn, in the same card.
  await page.click('[data-pr-retry]');
  await page.waitForSelector('[data-pr-result]', { timeout: 8000 });

  /* 54 C: keeps, drifts, out of date, not checked, skipped. */
  st.edit(st.section('4.1'), `${st.section('4.1').version.content}\n\nEdited after the check.`);
  const short5 = st.chapter(5).sections.map((s) => [s, s.version]);
  st.chapter(5).sections.forEach((s, i) => { if (i) s.version = null; else st.edit(s, 'Only a few words so far.'); });
  st.checks = st.checks.filter((c) => c.chapter_id !== st.chapter(5).id && c.chapter_id !== st.chapter(7).id);
  await QC.open7(page);
  await QC.run(page);
  await size(1440, 1300);
  await shot('b54c');
  await size(900, 900);
  await shot('54c-result-900', OUT);
  await size(1440, 1300);

  /* 53: group 6 open. */
  await QC.open7(page);
  await openGroups(6);
  await shot('b53g6');
  await size(900, 900);
  await shot('53-group6-900', OUT);
  await size(1440, 1300);

  /* Not drawn (V7): the skipped rows and the room warning in 54 A. */
  st.usage.tokens = 1995000;
  await openDialog();
  await size(1440, 900);
  await shot('54a-skipped-room-warning-1440', OUT);
  await page.keyboard.press('Escape');
  st.usage.tokens = 400000;
  short5.forEach(([s, v]) => { s.version = v; });

  /* 55 D short lines, one sheet at 1440 px. */
  const crops = [];
  for (const [code, name] of [['network', 'network'], ['rate_limited', 'rate'], ['monthly_limit', 'monthly'], ['positioning_not_locked', 'lock'], ['run_in_progress', 'running']]) {
    st.checks = [];
    modes.prFail = { 3: code };
    await QC.open7(page);
    await openDialog();
    await page.click(`${dlg} [data-pr-go]`);
    await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
    await ready();
    await (await page.$('[data-pr-card]')).screenshot({ path: `${SHOTS}/c55d-${name}.png`, timeout: 20000 });
    crops.push(name);
    await page.click('[data-pr-close]');
    await page.waitForSelector('[data-pr-result]');
  }
  await size(1440, 500);
  await page.goto('http://127.0.0.1:5500/robots.txt');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#F3F3F1;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}img{display:block}</style>
    ${crops.map((n) => `<img src="http://127.0.0.1:5500/tests/browser/shots/qc/c55d-${n}.png">`).join('')}`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/55d-other-errors-1440.png`, fullPage: true, timeout: 20000 });

  await compare('54a-confirm-compare', 'b54a', '54-step07-promise-check', '54 A, the dialog, 1440 px');
  await compare('54b-running-compare', 'b54b', '54-step07-promise-check', '54 B, in the promise card, 1440 px');
  await compare('54c-result-compare', 'b54c', '54-step07-promise-check', '54 C, in the promise card, 1440 px');
  await compare('55d-failed-compare', 'b55d', '55-step07-qc-states', '55 D, in the promise card, 1440 px');
  await compare('53-group6-compare', 'b53g6', '53-step07-qc-results', 'group 6 open, 1440 px');
  ok(true, 'shots done');
  return log.join('\n');
};
