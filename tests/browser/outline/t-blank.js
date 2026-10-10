// E10.1 live bug: the Introduction's only version was blank (an empty v1), and
// 05 blocked Regenerate ("Some sections have writing"). With 0019 a blank
// version is not writing (has_writing false), so Regenerate works.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B7}&step=5`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.otl [data-generate]', { timeout: 10000 });
  await page.waitForTimeout(300);
  ok(!!st.outline[B7][0].sections[0].current_version_id, 'setup: the Introduction has a (blank) current version');
  ok(await page.$eval('[data-generate]', (b) => !b.disabled), 'Regenerate outline is on');
  ok(!/Some sections have writing/.test(await txt('.otl')), 'no "Some sections have writing" note');
  await page.click('[data-generate]');
  await page.waitForSelector('dialog[open]', { timeout: 5000 });
  ok(/Replace the outline\?/.test(await txt('dialog[open]')), 'the Replace dialog opens');
  await page.click('dialog[open] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 10000 });
  await page.waitForTimeout(800);
  const gen = st.gens.filter((g) => g.stage === 'outline_ideas');
  ok(gen.length === 1 && !/Some sections have writing/.test(await txt('.otl')), `Regenerate ran (${gen.length} call), not refused`);
  // Real writing still blocks (B5: a version with text).
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B5}&step=5`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.otl [data-generate]', { timeout: 10000 });
  ok(await page.$eval('[data-generate]', (b) => b.disabled), 'a section with text still blocks Regenerate');
  return log.join('\n');
};
