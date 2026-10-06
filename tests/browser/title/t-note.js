const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  const status = () => txt('[data-gen-status]');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-generate]:not([disabled])', { timeout: 10000 });
  const gen = async () => {
    await page.click('[data-generate]');
    await page.waitForFunction(() => /added at the top/.test((document.querySelector('[data-gen-status]') || {}).innerText || ''), null, { timeout: 8000 });
    return status();
  };
  const ids = () => page.$$eval('.ttl-opt', (els) => els.map((e) => e.dataset.opt));

  let s = await gen();
  log.push('AFTER GENERATE 1: ' + s);
  let list = await ids();
  await page.click(`[data-star="${list[0]}"]`);
  await page.waitForTimeout(400);
  ok((await status()) === '', `star clears the note ("${await status()}")`);

  s = await gen();
  ok(/added at the top/.test(s), 'More ideas shows the note again: ' + s);
  list = await ids();
  const victim = list.find(async () => true) && (await page.$$eval('.ttl-opt:not(.is-starred)', (els) => els.map((e) => e.dataset.opt)))[0];
  await page.click(`[data-opt-menu="${victim}"]`);
  await page.click(`[data-remove="${victim}"]`);
  await page.waitForFunction((id) => !document.querySelector(`[data-opt="${id}"]`), victim, { timeout: 5000 });
  ok((await status()) === '', `remove clears the note ("${await status()}")`);

  s = await gen();
  ok(/added at the top/.test(s), 'note shown again: ' + s);
  list = await ids();
  await page.click(`.ttl-opt [data-use-opt="${list[1]}"]`);
  await page.waitForTimeout(300);
  ok((await status()) === '', `Use as my title clears the note ("${await status()}")`);

  // Typing a title by hand, then "Use this title", also clears it.
  s = await gen();
  await page.fill('#ttlTitle', 'My Own Chair Yoga Title');
  ok(/added at the top/.test(await status()), 'typing alone keeps the note');
  await page.click('[data-use]');
  await page.waitForFunction(() => /Title saved/.test((document.querySelector('[data-use-status]') || {}).innerText || ''), null, { timeout: 5000 });
  ok((await status()) === '', `Use this title clears the note ("${await status()}")`);
  ok(st.gens.length === 4, `4 generate calls (${st.gens.length})`);
  log.push('COUNT ' + await txt('.ttl-count'));
  return log.join('\n');
};
