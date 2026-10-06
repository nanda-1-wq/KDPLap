// i1: Chapters keeps its chips and adds "Other" with a number from 3 to 30.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const last = () => JSON.stringify((W().pop() || {}).body);
  const pressed = () => page.$$eval('[data-chips="chapter_count"] button[aria-pressed="true"]', (bs) => bs.map((b) => b.textContent.trim()).join(','));
  const err = () => page.$eval('#bf-chapter_count-error', (e) => (e.hidden ? '' : e.textContent.trim())).catch(() => 'NO FIELD');
  const settle = async () => { await page.waitForTimeout(1000); };
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. A count that is not a chip opens with "Other" pressed and the number shown.
  await open(B1);
  ok((await pressed()) === 'Other', `11 shows as Other (${await pressed()})`);
  ok((await page.inputValue('#bf-chapter_count')) === '11', 'the field shows 11');
  ok((await page.$$('[data-chips="chapter_count"] button')).length === 8, '7 chips + Other (no extra "11" chip)');
  ok((await page.$eval('label[for="bf-chapter_count"]', (l) => l.textContent)) === 'Number of chapters', 'label');
  ok(/From 3 to 30\./.test(await page.innerText('#bf-chapter_count-hint')), 'hint');

  // 2. A chip value: Other closed. Pressing Other shows the same number, saves nothing.
  await open(B2);
  ok((await pressed()) === '8' && !(await page.$('#bf-chapter_count')), 'chip 8 pressed, no field');
  let n = W().length;
  await page.click('[data-other="chapter_count"]');
  ok((await pressed()) === 'Other' && (await page.inputValue('#bf-chapter_count')) === '8', 'Other opens with 8, chip 8 no longer pressed');
  ok(await page.evaluate(() => document.activeElement.id === 'bf-chapter_count'), 'focus moves to the field');
  ok(await page.$eval('[data-other="chapter_count"]', (b) => b.getAttribute('aria-expanded') === 'true'), 'aria-expanded true');
  await settle();
  ok(W().length === n, 'opening Other saves nothing');

  // 3. Typing "1" then "2": no error while typing, 12 saves.
  await page.fill('#bf-chapter_count', '');
  await page.type('#bf-chapter_count', '1');
  await page.waitForTimeout(300);
  ok((await err()) === '', 'no error while typing "1"');
  await page.type('#bf-chapter_count', '2');
  await settle();
  ok(last() === '{"chapter_count":12}', `12 saved (${last()})`);

  // 4. Out of range: error on leaving, nothing saved.
  for (const bad of ['2', '31', '7.5']) {
    n = W().length;
    await page.fill('#bf-chapter_count', bad);
    await page.click('#bf-topic_text');
    await settle();
    ok((await err()) === 'Use a whole number from 3 to 30.' && W().length === n, `"${bad}": error, not saved`);
    ok(await page.$eval('#bf-chapter_count', (i) => i.getAttribute('aria-invalid') === 'true'), `"${bad}": aria-invalid`);
  }
  // 5. 3 and 30 save; the error goes.
  await page.fill('#bf-chapter_count', '3');
  await settle();
  ok(last() === '{"chapter_count":3}' && (await err()) === '', '3 saved, error gone');
  await page.fill('#bf-chapter_count', '30');
  await page.click('#bf-topic_text');
  await settle();
  ok(last() === '{"chapter_count":30}' && st.books[B2].brief.chapter_count === 30, '30 saved on leaving');

  // 6. Empty: saves null, no error.
  await page.fill('#bf-chapter_count', '');
  await page.click('#bf-topic_text');
  await settle();
  ok(last() === '{"chapter_count":null}' && (await err()) === '', 'empty saves null');

  // 7. A chip closes Other and saves.
  await page.fill('#bf-chapter_count', '4');
  await settle();
  await page.click('[data-chips="chapter_count"] [data-value="6"]');
  await settle();
  ok(last() === '{"chapter_count":6}' && (await pressed()) === '6' && !(await page.$('#bf-chapter_count')), 'chip 6 closes Other and saves 6');

  // 8. Other, then Other again: closes and clears.
  await page.click('[data-other="chapter_count"]');
  await page.click('[data-other="chapter_count"]');
  await settle();
  ok(last() === '{"chapter_count":null}' && (await pressed()) === '', 'Other pressed twice clears the count');

  // 9. Reload keeps a typed count.
  await page.click('[data-other="chapter_count"]');
  await page.fill('#bf-chapter_count', '22');
  await settle();
  await open(B2);
  ok((await pressed()) === 'Other' && (await page.inputValue('#bf-chapter_count')) === '22', 'after reload: Other, 22');
  await page.locator('section[aria-labelledby="bcSize"]').screenshot({ path: `${SHOTS}/brief-chapters.png`, timeout: 5000 }).catch(() => {});
  return log.join('\n');
};
