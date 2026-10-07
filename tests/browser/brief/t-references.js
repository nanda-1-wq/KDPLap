// i15 on step 01: "Copy from 02 Research" adds the citations of saved
// sources to References (no AI): one per line at the end, repeats skipped,
// the author's text kept, the 2,000 limit, no sources, error and retry.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const box = async () => ((await page.innerText('[data-refs-copy]')) || '').replace(/\s+/g, ' ').trim();
  const settle = () => page.waitForTimeout(700);
  const copy = async () => {
    await page.click('[data-refs-copy-btn]');
    await page.waitForFunction(() => { const b = document.querySelector('[data-refs-copy-btn]'); return b && !b.disabled; }, null, { timeout: 5000 });
    await settle();
  };
  const SAVED = 'Smith, J. Gentle Movement After 60. Sage Press, 2021.\nCDC, Physical Activity Guidelines for Older Adults, 2023';
  // Real-length citations (the longest live one is 73 characters; these are longer).
  const C1 = 'National Institute on Aging, Exercise and Physical Activity: Getting Fit for Life, 2022, nia.nih.gov';
  const C2 = 'Arthritis Foundation, Chair Yoga for Arthritis: A Guide to Seated Practice, arthritis.org, 2024';
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B4}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  await page.click('.brief-more summary');
  ok((await box()) === 'Copy from 02 Research', 'button under References, no status yet');
  const h = await page.$eval('[data-refs-copy-btn]', (b) => b.getBoundingClientRect().height);
  ok(h >= 44, `button at least 44 px (${h})`);

  // 1. Two new citations, one already there (other case), one repeated, one blank.
  M.cites = [C1, 'cdc, physical activity guidelines for older adults, 2023', C2, C1, '   '];
  let n = W().length;
  await copy();
  const calls = st.calls.filter((c) => c.includes('/rest/v1/research_sources?select=citation'));   // step 02 also reads its own list
  ok(calls.length === 1 && /kind=eq\.source/.test(calls[0]) && /book_id=eq\.d4d4/.test(calls[0]), `one read, kind source, this book (${calls[0]})`);
  ok((await page.inputValue('#bf-references')) === `${SAVED}\n${C1}\n${C2}`, 'added at the end, one per line, author text kept');
  ok((await box()).endsWith('Added 2 citations from 02 Research.'), `status: "${await box()}"`);
  let w = W().slice(n);
  ok(w.length === 1 && Object.keys(w[0].body).join() === 'options' && w[0].body.options.references === `${SAVED}\n${C1}\n${C2}` && w[0].body.options.stance.startsWith('Small daily steps'), 'one options save, stance kept');
  ok(st.gens.length === 0, 'no AI call');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-refs-copy-btn]')), 'focus back on the button');
  await page.screenshot({ path: `${SHOTS}/brief-references-copy.png`, timeout: 5000 }).catch(() => {});

  // 2. Again: all already there, nothing saved.
  n = W().length;
  await copy();
  ok((await box()).endsWith('All 3 citations are already in the field.'), `status: "${await box()}"`);
  ok(W().length === n, 'nothing saved');
  M.cites = [C1];
  await copy();
  ok((await box()).endsWith('The citation is already in the field.'), 'one citation: singular text');

  // 3. Near the 2,000 limit: only what fits is added.
  const filler = 'Note '.repeat(370).trim();   // 1,849 characters
  await page.fill('#bf-references', filler);
  await page.click('#bf-topic_text');
  await settle();
  M.cites = [C1, 'Short cite, 2020', C2];
  n = W().length;
  await copy();
  const v = await page.inputValue('#bf-references');
  ok(v === `${filler}\n${C1}\nShort cite, 2020` && v.length <= 2000, `fits: C1 and the short one added (${v.length})`);
  ok((await box()).endsWith('Added 2 citations. 1 did not fit in 2,000 characters.'), `status: "${await box()}"`);
  ok(W().slice(n).length === 1, 'saved once');
  await page.fill('#bf-references', 'R'.repeat(1990));
  await page.click('#bf-topic_text');
  await settle();
  M.cites = [C2];
  await copy();
  ok((await box()).endsWith('No room: 1 citation did not fit in 2,000 characters.') && (await page.inputValue('#bf-references')) === 'R'.repeat(1990), `no room (${await box()})`);

  // 4. No sources: hint with a link to 02 Research.
  M.cites = [];
  await copy();
  ok((await box()).endsWith('No sources in 02 Research yet. Add a source with where it comes from. Open 02 Research'), `none: "${await box()}"`);

  // 5. Error, then Try again.
  await page.fill('#bf-references', '');
  await page.click('#bf-topic_text');
  await settle();
  M.citesFail = true;
  await copy();
  ok(/We couldn’t load your sources\. Try again$/.test(await box()) && !!(await page.$('[data-refs-copy] .alert-error')), 'error alert with Try again');
  M.citesFail = false;
  M.cites = ['New source, 2025'];
  await page.click('[data-refs-retry]');
  await page.waitForFunction(() => /Added 1 citation/.test(document.querySelector('[data-refs-copy]').innerText), null, { timeout: 5000 });
  ok((await page.inputValue('#bf-references')) === 'New source, 2025', 'retry adds it');
  await settle();

  // 6. Empty field: no leading blank line.
  await page.fill('#bf-references', '');
  await page.click('#bf-topic_text');
  await settle();
  M.cites = [C1];
  await copy();
  ok((await page.inputValue('#bf-references')) === C1, 'empty field: just the citation');

  // 7. "Open 02 Research" goes to step 02.
  M.cites = [];
  await copy();
  await page.click('[data-refs-open]');
  await page.waitForFunction(() => /step=2/.test(location.search), null, { timeout: 5000 });
  ok(/step=2/.test(page.url()), 'link opens step 02');
  ok(!st.writes.some((x) => x.failed), 'no refused write');
  M.cites = null;
  return log.join('\n');
};
