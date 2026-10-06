const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  globalThis.__modes.ideas = [
    { title: 'Easy Chair Yoga at Home', subtitle: 'Warm, step-by-step seated routines for adults over 60, with gentler options for sore knees and shoulders', reason: 'Live option 10.', keywords: [], unsourced: [] },
    { title: 'Step-by-Step Chair Yoga', subtitle: 'A Step-by-Step Plan for Seniors', reason: 'Compound used twice.', keywords: [], unsourced: [] },
    { title: 'Sit and Stretch Yoga Plan', subtitle: 'A ready weekly plan of short chair routines', reason: 'Plain repeat.', keywords: [], unsourced: [] }
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-generate]:not([disabled])', { timeout: 10000 });
  await page.click('[data-generate]');
  await page.waitForSelector('.ttl-opt', { timeout: 8000 });
  const chips = async (t) => page.$eval(`.ttl-opt:has-text("${t}") .ttl-chips`, (e) => e.innerText.replace(/\s+/g, ' ').trim());
  const a = await chips('Easy Chair Yoga at Home'), b = await chips('Step-by-Step Chair Yoga'), c = await chips('Sit and Stretch Yoga Plan');
  ok(!/Repeated/.test(a), `option 10 (step-by-step): no repeat chip [${a}]`);
  ok(/Repeated word: "step-by-step"/.test(b), `compound used twice still warns [${b}]`);
  ok(/Repeated word: "plan"/.test(c), `plain repeat still warns [${c}]`);
  await page.click('.ttl-opt:has-text("Easy Chair Yoga at Home") [data-use-opt]');
  await page.waitForTimeout(200);
  const checks = await txt('[data-checks]');
  ok(/No word repeated/.test(checks), 'Your title panel: "No word repeated" for option 10');
  log.push('CHECKS ' + checks);
  return log.join('\n');
};
