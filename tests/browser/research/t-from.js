// i16: insights "From" lines show short titles (about 40 characters) with
// the full title in a tooltip and for screen readers.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${R3}&step=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-insights] .insight', { timeout: 10000 });
  // What is seen: the meta text without the screen-reader copies.
  const metas = await page.$$eval('[data-insights] .insight-meta', (m) => m.map((x) => {
    const c = x.cloneNode(true);
    c.querySelectorAll('.sr-only').forEach((s) => s.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }));
  const love = await page.$eval('[data-list="loves"] .insight-meta', (m) => ({
    shown: [...m.querySelectorAll('[aria-hidden="true"]')].map((x) => x.textContent),
    tips: [...m.querySelectorAll('[title]')].map((x) => x.getAttribute('title')),
    sr: [...m.querySelectorAll('.sr-only')].map((x) => x.textContent),
    text: m.textContent.replace(/\s+/g, ' ').trim()
  }));
  ok(love.shown.length === 2, `two long titles are cut (${love.shown.length})`);
  ok(love.shown.every((t) => t.endsWith('…') && t.length <= 41), `cut to about 40 with … (${love.shown.map((t) => t.length)})`);
  ok(love.shown[0] === 'Chair Yoga for Seniors Over 60: Gentle…', `cut at a word, no trailing colon or comma ("${love.shown[0]}")`);
  ok(love.tips[0] === LONG1 && love.tips[1] === LONG2 && LONG2.length === 300, 'tooltips have the full titles (one at 300)');
  ok(love.sr[0] === LONG1 && love.sr[1] === LONG2, 'screen readers get the full titles');
  ok(/Sit and Stretch$/.test(metas[0]) && !love.tips.includes(SHORT), 'a short title shows in full, no tooltip');
  ok(/^AIFrom Chair Yoga for Seniors Over 60: Gentle…, Sit and Stretch: The Complete Large…, Sit and Stretch$/.test(metas[0]), `visible line: "${metas[0]}"`);
  ok(/^EDITEDFrom Sit and Stretch: The Complete Large…$/.test(metas[1]), `edited line keeps its from list: "${metas[1]}"`);
  const box = await page.$eval('[data-list="loves"] .insight-meta', (m) => [m.scrollWidth, m.clientWidth]);
  ok(box[0] <= box[1] + 1, `meta line does not overflow (${box})`);
  await page.screenshot({ path: `${SHOTS}/research-from-short.png`, timeout: 5000 }).catch(() => {});
  return log.join('\n');
};
