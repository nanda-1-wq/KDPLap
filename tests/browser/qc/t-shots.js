// Standing rule (plan 8.5): each design next to the built page at 1440 px, plus the built page
// at 900 px. Files go to docs/reviews/e14-3-stop3/. Mock data only: no live sign-in.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/qc$/, 'docs/reviews/e14-3-stop3');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250); };
  const shot = async (name, dir = SHOTS) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, timeout: 20000 }); };
  const crop = async (name, sel) => { await ready(); await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 20000 }); };
  const openGroups = async (...gs) => { for (const g of gs) if ((await page.$eval(`[data-group="${g}"]`, (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click(`[data-group="${g}"]`); };

  /** One image: built left, design right, both labeled. */
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

  /* 51 and 52: first visit. */
  st.dismissed = [];
  await size(1440, 820);
  await QC.open7(page);
  await shot('b51');
  await size(1440, 900);
  await shot('b52');
  await size(900, 900);
  await shot('52-first-900', OUT);

  /* 53: the sample of the design, groups 1 and 7 open. */
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
  await openGroups(1, 7);
  await shot('b53');
  await size(900, 900);
  await shot('53-results-900', OUT);

  /* 55 B and F. */
  await size(1440, 1000);
  await page.click('#qc-g1 .qc-it:last-child [data-ok]');
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; });
  await crop('c55f', '[data-justok]');
  await size(900, 900);
  await shot('55f-mark-ok-900', OUT);
  await size(1440, 1000);
  st.edit(st.section('3.2'), st.section('3.2').version.content + ' Changed today.');
  await QC.open7(page);
  await crop('c55b', '.qc-box.is-warning');
  await size(900, 900);
  await shot('55b-out-of-date-900', OUT);

  /* 55 A. */
  await size(1440, 1000);
  await QC.open7(page);
  globalThis.__modes.qcSlow = 1200;
  await page.click('[data-run]');
  await page.waitForSelector('[data-running]');
  globalThis.__modes.qcSlow = 0;
  await crop('c55a', '[data-running]');
  await size(900, 900);
  await shot('55a-running-900', OUT);
  await page.waitForFunction(() => !document.querySelector('[data-running]'), null, { timeout: 8000 });

  /* 55 E. */
  await size(1440, 1000);
  st.dismissed = [];
  st.clean();
  st.chapters.forEach((c) => c.sections.forEach((s) => { s.word_target = 300; s.version = { ...s.version, id: s.version.id }; }));
  st.brief.topic_text = 'Study habits for adults';
  st.format = null;
  for (const n of ['2.1', '2.2', '6.1', '4.1', '6.2', '3.4', '1.1']) st.edit(st.section(n), st.section('1.3').version.content.replace(/ba/g, `q${n.replace('.', '')}`));
  await QC.open7(page);
  await QC.run(page);
  await crop('c55e', '.qc-box.is-success');
  await size(900, 900);
  await shot('55e-all-pass-900', OUT);

  /* 55 C. */
  await size(1440, 1000);
  const kept = st.sections().map((s) => [s, s.version]);
  st.sections().forEach((s) => { s.version = null; });
  await QC.open7(page);
  await crop('c55c', '.qc-state-card');
  await size(900, 900);
  await shot('55c-no-text-900', OUT);
  kept.forEach(([s, v]) => { s.version = v; });

  /* 51b: the rail, on 06 (08 is not built). */
  await size(1440, 820);
  st.runs.length = 0;
  await QC.open(page, 6);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await shot('b51b');
  await size(900, 900);
  await shot('51b-rail-900', OUT);
  await size(1440, 820);
  await QC.open7(page);
  await size(900, 900);
  await shot('51-sidebar-900', OUT);

  /* 57: every mark, cropped. */
  await size(1440, 900);
  await QC.open(page, 5);
  await page.waitForTimeout(400);
  await crop('c57-sidebar-notrun', '[data-step="7"]');
  await QC.open7(page);
  await crop('c57-sidebar-current', '[data-step="7"]');
  await QC.run(page);
  await QC.open(page, 5);
  await page.waitForFunction(() => /done/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')));
  await crop('c57-sidebar-done', '[data-step="7"]');
  await QC.open(page, 6);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await page.waitForFunction(() => /done/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')));
  await crop('c57-rail-done', '[data-step="7"]');
  st.edit(st.section('3.2'), st.section('3.2').version.content + ' Changed again.');
  await QC.open(page, 6);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await page.waitForFunction(() => /out of date/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')));
  await crop('c57-rail-stale', '[data-step="7"]');
  await shot('57-rail-out-of-date-1440', OUT);
  await QC.open(page, 5);
  await page.waitForFunction(() => /out of date/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')));
  await crop('c57-sidebar-stale', '[data-step="7"]');
  await size(900, 900);
  await page.waitForTimeout(200);
  await shot('57-sidebar-out-of-date-900', OUT);
  st.runs.length = 0;
  await QC.open(page, 6);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await size(1440, 900);
  await crop('c57-rail-notrun', '[data-step="7"]');

  /* The sheets: the same parts, on the design's page. */
  const base = 'http://127.0.0.1:5500/tests/browser/shots/qc';
  const fig = (label, file) => `<div class="c"><p>${label}</p><img src="${base}/${file}.png"></div>`;
  async function sheet(name, w, h, html) {
    await size(w, h);
    await page.goto('http://127.0.0.1:5500/robots.txt');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#F3F3F1;font:500 13px system-ui,sans-serif;color:#1C1C1A}
      .g{width:${w}px;box-sizing:border-box;padding:40px;display:grid;grid-template-columns:repeat(${name === 'b57' ? 4 : 2},minmax(0,1fr));gap:24px;align-items:start}
      .c{background:#fff;border:1px solid #D9D9D5;border-radius:14px;padding:20px;min-width:0}.c p{margin:0 0 10px;color:#55554F}img{display:block;max-width:100%}</style>
      <div class="g">${html}</div>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, timeout: 20000 });
  }
  await sheet('b55', 1440, 900, [fig('A · running', 'c55a'), fig('B · out of date', 'c55b'), fig('C · no text', 'c55c'), fig('E · all pass', 'c55e'), fig('F · Mark as OK', 'c55f')].join(''));
  await sheet('b57', 1440, 620, [fig('Sidebar · not run', 'c57-sidebar-notrun'), fig('Sidebar · current', 'c57-sidebar-current'), fig('Sidebar · done', 'c57-sidebar-done'), fig('Sidebar · out of date', 'c57-sidebar-stale'),
    fig('Rail · not run', 'c57-rail-notrun'), fig('Rail · done', 'c57-rail-done'), fig('Rail · out of date', 'c57-rail-stale')].join(''));

  await compare('51-shell-sidebar-compare', 'b51', '51-shell-sidebar', '07 first visit, 1440 px');
  await compare('51b-shell-rail-compare', 'b51b', '51b-shell-rail', 'rail on 06 (08 not built), 1440 px');
  await compare('52-first-compare', 'b52', '52-step07-qc-first', '1440 px');
  await compare('53-results-compare', 'b53', '53-step07-qc-results', 'groups 1 and 7 opened by hand, 1440 px');
  await compare('55-states-compare', 'b55', '55-step07-qc-states', 'states A B C E F (D is E14.6)');
  await compare('57-marks-compare', 'b57', '57-step07-qc-marks', 'the 07 marks');
  ok(true, 'shots done');
  return log.join('\n');
};
