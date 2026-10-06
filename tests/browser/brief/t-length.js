// i2: Length keeps its range chips and adds "Custom" (one number of words,
// 2,000 to 150,000). A range and a custom target never both save.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const sorted = (o) => JSON.stringify(Object.keys(o || {}).sort().reduce((a, k) => ({ ...a, [k]: o[k] }), {}));
  const last = () => sorted((W().pop() || {}).body);
  const pressed = () => page.$$eval('[data-chips="length_range"] button[aria-pressed="true"]', (bs) => bs.map((b) => b.textContent.trim()).join(','));
  const hint = () => page.innerText('[data-pages]');
  const err = () => page.$eval('#bf-target_words-error', (e) => (e.hidden ? '' : e.textContent.trim())).catch(() => 'NO FIELD');
  const settle = () => page.waitForTimeout(1000);
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. A saved custom target: Custom pressed, the number shown, one-number estimate.
  await open(B1);
  ok((await pressed()) === 'Custom', `Custom pressed (${await pressed()})`);
  ok((await page.inputValue('#bf-target_words')) === '15000', 'field shows 15000');
  ok((await hint()) === 'About 110 pages at 6 × 9 in', `estimate: "${await hint()}"`);
  ok((await page.innerText('#bf-target_words-hint')) === 'One number, for example 15000. From 2,000 to 150,000.', 'hint text');
  ok((await page.$eval('label[for="bf-target_words"]', (l) => l.textContent)) === 'Target words', 'label');

  // 2. A range book. Custom clears the range now (one value at a time).
  await open(B2);
  ok((await pressed()) === '8K to 12K' && (await hint()) === 'About 60 to 90 pages at 6 × 9 in', `range: ${await pressed()} / ${await hint()}`);
  await page.click('[data-other="target_words"]');
  await settle();
  ok(last() === '{"length_range":null,"target_words":null}', `Custom: range cleared with the target (${last()})`);
  ok((await pressed()) === 'Custom' && (await hint()) === 'Enter a word target to see an estimate of pages.', 'empty custom: hint asks for a number');

  // 3. Typing: the estimate follows a valid number; the save sends both columns.
  await page.type('#bf-target_words', '15000');
  ok((await hint()) === 'About 110 pages at 6 × 9 in', `estimate while typing: "${await hint()}"`);
  await settle();
  ok(last() === '{"length_range":null,"target_words":15000}', `15000 saved with range null (${last()})`);
  ok(st.books[B2].brief.target_words === 15000 && st.books[B2].brief.length_range === null, 'mock row: target 15000, range null');

  // 4. Trim size changes the estimate.
  await page.click('[data-chips="trim_size"] [data-value="8.5x11"]');
  ok(/^About \d+ pages at 8\.5 × 11 in$/.test(await hint()) && (await hint()) !== 'About 110 pages at 8.5 × 11 in', `estimate at 8.5 × 11: "${await hint()}"`);
  await page.click('[data-chips="trim_size"] [data-value="6x9"]');
  await settle();

  // 5. Out of range or not whole: error on leaving, nothing saved, estimate waits.
  for (const bad of ['1999', '150001', '15000.5', '0']) {
    const n = W().length;
    await page.fill('#bf-target_words', bad);
    await page.click('#bf-topic_text');
    await settle();
    ok((await err()) === 'Use a whole number from 2,000 to 150,000.' && W().length === n, `"${bad}": error, not saved`);
    ok((await hint()) === 'Enter a word target to see an estimate of pages.', `"${bad}": no estimate`);
  }
  // 6. The edges save.
  await page.fill('#bf-target_words', '2000');
  await settle();
  ok(last() === '{"length_range":null,"target_words":2000}' && (await err()) === '', '2000 saved, error gone');
  await page.fill('#bf-target_words', '150000');
  await settle();
  ok(last() === '{"length_range":null,"target_words":150000}', '150000 saved');
  ok((await hint()) === 'About 1130 pages at 6 × 9 in', `150000 estimate: "${await hint()}"`);

  // 7. A range chip replaces the custom target.
  await page.click('[data-chips="length_range"] [data-value="12-20k"]');
  await settle();
  ok(last() === '{"length_range":"12-20k","target_words":null}', `range replaces target (${last()})`);
  ok((await pressed()) === '12K to 20K' && !(await page.$('#bf-target_words')), 'Custom closed');
  ok(st.books[B2].brief.target_words === null && st.books[B2].brief.length_range === '12-20k', 'mock row: range only');
  ok(!st.calls.some((c) => c.startsWith('ERR')) && !(await page.innerText('[data-saved-line]')).includes('rule'), 'no refused save on the way');

  // 8. Custom, type, then Custom again: closes and clears.
  await page.click('[data-other="target_words"]');
  await page.fill('#bf-target_words', '45000');
  await settle();
  await page.click('[data-other="target_words"]');
  await settle();
  ok(last() === '{"length_range":null,"target_words":null}' && (await pressed()) === '', 'Custom twice clears both');
  ok((await hint()) === 'Pick a range to see an estimate of pages.', 'hint back to the range text');

  // 9. Books page shows the custom target.
  await page.click('[data-other="target_words"]');
  await page.fill('#bf-target_words', '15000');
  await page.click('#bf-topic_text');
  await settle();
  await page.goto('http://127.0.0.1:5500/app/dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[href*="${B2}"]`, { timeout: 10000 });
  const cards = await page.innerText('main');
  ok(/Target 15,000 words/.test(cards), 'Books page: "Target 15,000 words"');
  ok(/No word target yet/.test(cards), 'a book without a target still says so');
  await page.screenshot({ path: `${SHOTS}/books-target.png`, timeout: 5000 }).catch(() => {});
  await open(B2);
  await page.locator('section[aria-labelledby="bcSize"]').screenshot({ path: `${SHOTS}/brief-length.png`, timeout: 5000 }).catch(() => {});
  return log.join('\n');
};
