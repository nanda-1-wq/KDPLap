// E13.2b Part 3: the 01 Brief trim chips are the 6 Print PDF trims (owner Q6: 8 × 10 and 8.5 × 11 after 6 × 9).
// Click and keyboard, the save, the page estimate at both new trims (kdpWords.LARGE_FACTOR), the chip row at
// 1440 and 900 px and at 200% text (it wraps, no sideways scroll, 44 px chips). Not 390: the book wizard has
// no phone layout (the step rail keeps its width and the step gets about 110 px), before and after E13.2b.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const last = () => JSON.stringify((W().pop() || {}).body);
  const hint = () => page.innerText('[data-pages]');
  const settle = () => page.waitForTimeout(1000);
  const chip = (v) => `[data-chips="trim_size"] [data-value="${v}"]`;
  const pressed = () => page.$$eval('[data-chips="trim_size"] button[aria-pressed="true"]', (bs) => bs.map((b) => b.dataset.value).join(','));
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  };
  const row = () => page.$eval('[data-chips="trim_size"]', (g) => {
    const r = g.getBoundingClientRect();
    const cs = [...g.querySelectorAll('.tone-chip')].map((c) => c.getBoundingClientRect());
    return { n: cs.length, lines: new Set(cs.map((c) => Math.round(c.top))).size, minH: Math.min(...cs.map((c) => c.height)),
      inside: cs.every((c) => c.left >= r.left - 0.5 && c.right <= r.right + 0.5), noScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      rowW: Math.round(r.width) };
  });

  await page.setViewportSize({ width: 1440, height: 1000 });

  /* B1: a custom target of 15,000 words. */
  await open(B1);
  ok(JSON.stringify(await page.locator('[data-chips="trim_size"] .tone-chip').allInnerTexts()) === JSON.stringify(['5 × 8 in', '5.25 × 8 in', '5.5 × 8.5 in', '6 × 9 in', '8 × 10 in', '8.5 × 11 in']), 'the 6 chips, 8 × 10 and 8.5 × 11 after 6 × 9');
  await page.click(chip('8x10'));
  await settle();
  ok((await pressed()) === '8x10' && last() === '{"trim_size":"8x10"}', `click 8 × 10: pressed and saved (${last()})`);
  ok((await hint()) === 'About 60 pages at 8 × 10 in', `estimate at 8 × 10: "${await hint()}" (15,000 / 257.5 = 58.3)`);
  // Keyboard: Tab reaches the chip, Space presses it.
  await page.focus(chip('8x10'));
  await page.keyboard.press('Tab');
  ok(await page.evaluate((s) => document.activeElement === document.querySelector(s), chip('8.5x11')), 'Tab moves from 8 × 10 to 8.5 × 11');
  const ring = await page.$eval(chip('8.5x11'), (c) => { const s = getComputedStyle(c); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset}`; });
  ok(ring === 'solid 2px 2px', `focus ring on 8.5 × 11: ${ring}`);
  await page.keyboard.press('Space');
  await settle();
  ok((await pressed()) === '8.5x11' && last() === '{"trim_size":"8.5x11"}', `Space on 8.5 × 11: pressed and saved (${last()})`);
  ok((await hint()) === 'About 55 pages at 8.5 × 11 in', `estimate at 8.5 × 11: "${await hint()}" (15,000 / 282.5 = 53.1)`);

  /* B2: a range of 8K to 12K. */
  await open(B2);
  await page.click(chip('8.5x11'));
  await settle();
  ok((await hint()) === 'About 30 to 40 pages at 8.5 × 11 in', `range at 8.5 × 11: "${await hint()}"`);
  await page.click(chip('8x10'));
  await settle();
  ok((await hint()) === 'About 30 to 45 pages at 8 × 10 in', `range at 8 × 10: "${await hint()}"`);
  await page.click(chip('6x9'));
  await settle();
  ok((await hint()) === 'About 30 to 50 pages at 6 × 9 in', `back to 6 × 9: today's estimate (${await hint()})`);

  /* The chip row at 3 widths and at 200% text. */
  for (const [w, h] of [[1440, 1000], [900, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const r = await row();
    ok(r.n === 6 && r.inside && r.noScroll && r.minH >= 44, `${w}: 6 chips inside the row, ${r.lines} line(s), chips ${Math.round(r.minH)} px, no sideways scroll ${JSON.stringify(r)}`);
  }
  await page.addStyleTag({ content: '[data-chips="trim_size"] .tone-chip { font-size: calc(var(--text-sm) * 2); }' });
  await page.waitForTimeout(300);
  const big = await row();
  ok(big.n === 6 && big.inside && big.noScroll && big.lines >= 2, `900 at 200% text: the chips wrap (${big.lines} lines), none outside, no sideways scroll ${JSON.stringify(big)}`);

  if (st.calls && st.calls.some((c) => String(c).startsWith('ERR'))) log.push('FAIL mock error');
  return log.join('\n');
};
