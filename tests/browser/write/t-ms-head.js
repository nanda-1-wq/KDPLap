// Step 06 Write: the manuscript head (E14.6). At 900 px "MANUSCRIPT" and the word count
// touched ("MANUSCRIPT11,692 /"). They keep a gap, and the count wraps as one piece.
// At 1440 px the head stays on one line, as before.
// Run: tests/browser/run.sh write t-ms-head.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);

  const head = () => page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const h = box(document.querySelector('.wr-ms-head'));
    const a = box(document.querySelector('.wr-ms-head .chip-label'));
    const b = box(document.querySelector('.wr-ms-count'));
    const pad = parseFloat(getComputedStyle(document.querySelector('.wr-ms-head')).paddingRight);
    return { wide: h.width, right: h.right - pad, left: h.left, aRight: a.right, bLeft: b.left, bRight: b.right, aTop: a.top, aBottom: a.bottom, bTop: b.top, lines: document.querySelector('.wr-ms-count').getClientRects().length, gap: getComputedStyle(document.querySelector('.wr-ms-head')).columnGap };
  });
  const open = async (w) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('http://127.0.0.1:5500/app/book.html?id=e1e1e1e1-0000-4000-8000-000000000001&step=6', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-ms-count', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
  };

  await open(1440);
  const wide = await head();
  ok(wide.aBottom > wide.bTop, `1440 px: one line (label ${wide.aTop} to ${wide.aBottom}, count top ${wide.bTop})`);
  ok(Math.round(wide.bRight) === Math.round(wide.right), '1440 px: the count stays at the right edge');
  ok(wide.bLeft - wide.aRight >= 12, `1440 px: gap ${wide.bLeft - wide.aRight}`);
  // Exactly as before: the column is the same, pixel for pixel, with and without the fix.
  const after = await (await page.$('.wr-ms')).screenshot();
  const old = await page.addStyleTag({ content: '.wr-ms-head { flex-wrap: nowrap; gap: 0; } .wr-ms-count { white-space: normal; }' });
  const before = await (await page.$('.wr-ms')).screenshot();
  await old.evaluate((e) => e.remove());
  ok(after.equals(before), `1440 px: same pixels as before the fix (${after.length} bytes)`);

  await open(900);
  const n = await head();
  const sameLine = n.aBottom > n.bTop;
  ok(n.gap === '12px', `900 px: the head has its gap: ${n.gap}`);
  ok(!sameLine || n.bLeft - n.aRight >= 12, `900 px: label and count do not touch (${n.aRight}, ${n.bLeft})`);
  ok(n.bRight <= n.right + 0.5, `900 px: the count stays inside the head (${n.bRight}, ${n.right})`);
  ok(n.lines === 1, '900 px: the count wraps as one piece');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '900 px: no sideways scroll');

  // A long count on the narrow column: it moves under the label, it never runs into it.
  await page.evaluate(() => { document.querySelector('.wr-ms-count').innerHTML = '<strong>111,692</strong> / 120,000'; });
  const long = await head();
  ok(long.bTop >= long.aBottom - 1 || long.bLeft - long.aRight >= 12, `900 px: a long count wraps cleanly (${long.aBottom}, ${long.bTop})`);
  ok(long.bRight <= long.right + 0.5, '900 px: a long count stays inside');
  ok(long.lines === 1, '900 px: a long count is one line');
  return log.join('\n');
};
