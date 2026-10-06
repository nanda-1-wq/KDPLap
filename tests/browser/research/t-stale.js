// i4: research insights say "Out of date" when competitors or their reviews
// change after the last Analyze. Old rows (no fingerprint) show nothing.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const b = st.books[R1];
  const stale = () => page.$('[data-insights-stale]').then((x) => !!x);
  const side = async () => ((await page.innerText('[data-insights]')) || '').replace(/\s+/g, ' ').trim();
  const open = async () => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${R1}&step=2`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-insights] .insight', { timeout: 10000 });
  };
  const saves = () => st.writes.filter((w) => w.table === 'research_insights').length;
  const analyze = async () => {
    const n = saves();
    await page.click('[data-analyze]');
    for (let i = 0; i < 80 && saves() === n; i++) await page.waitForTimeout(100);
    await page.waitForSelector('[data-analyze]', { timeout: 8000 });   // panel is idle again
  };
  const saveForm = async () => {
    await page.click('[data-form-save]');
    await page.waitForFunction(() => !document.querySelector('[data-form]'), null, { timeout: 5000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. An analysis from before 0014 has no fingerprint: nothing shows, even after an edit.
  await open();
  ok(!(await stale()), 'old row without a key: no "Out of date"');
  ok(/Analyze again/.test(await side()), 'Analyze again is there');

  // 2. Analyze saves a 16-hex key with the lines; then nothing is out of date.
  await analyze();
  const up = st.writes.filter((w) => w.table === 'research_insights').pop();
  ok(up && /^[0-9a-f]{16}$/.test(up.body.inputs_key || ''), `upsert sends inputs_key (${up && up.body.inputs_key})`);
  ok(up && up.body.analyzed_at && up.body.loves.length === 1, 'upsert still sends the lines and analyzed_at');
  ok(!(await stale()), 'right after Analyze: not out of date');
  const key1 = up.body.inputs_key;

  // 3. Reload: the key comes back from the database, still current.
  await open();
  ok(!(await stale()), 'after reload: not out of date');

  // 4. Edit the low reviews of competitor 2 (add a long paragraph).
  const c2 = b.competitors[1].id;
  await page.click(`[data-edit-comp="${c2}"]`);
  const box = page.locator('[data-f="low_reviews"]');
  await box.fill((await box.inputValue()) + '\n\nThe chair poses are good but there is nothing for people who use a wheelchair. I hoped for at least one page about that, and a short plan for the first week.');
  await saveForm();
  ok(await stale(), 'edited reviews: "Out of date" shows');
  const text = await side();
  ok(/Out of date\. Competitors or their reviews changed after this analysis\./.test(text), 'the stale line text');
  ok(/Analyze again/.test(text), 'Analyze again stays');
  await page.screenshot({ path: `${SHOTS}/research-stale.png`, timeout: 5000 }).catch(() => {});

  // 5. Analyze again clears it, with a new key.
  await analyze();
  const key2 = st.writes.filter((w) => w.table === 'research_insights').pop().body.inputs_key;
  ok(!(await stale()) && key2 !== key1, `Analyze again clears it, new key (${key2})`);

  // 6. A new competitor without reviews: the AI would not read it, so not out of date.
  await page.click('[data-add-comp]');
  await page.fill('[data-f="title"]', 'Yoga for the Office Chair: Ten Minutes a Day for Busy People');
  await saveForm();
  ok(!(await stale()), 'new competitor without reviews: not out of date');

  // 7. Pasting reviews into it changes what the AI reads.
  const c4 = b.competitors[3].id;
  await page.click(`[data-edit-comp="${c4}"]`);
  await page.fill('[data-f="high_reviews"]', 'Short, practical and kind. I do the morning routine before work and my back thanks me.\n\nThe photos are big and clear.');
  await saveForm();
  ok(await stale(), 'reviews pasted into the new competitor: out of date');
  await analyze();
  ok(!(await stale()), 'Analyze again: current');

  // 8. A title change of a reviewed competitor counts too.
  const c1 = b.competitors[0].id;
  await page.click(`[data-edit-comp="${c1}"]`);
  await page.fill('[data-f="title"]', 'Chair Yoga for Seniors: Second Edition');
  await saveForm();
  ok(await stale(), 'title change of a reviewed competitor: out of date');
  // ...and changing it back makes it current again (same inputs, same key).
  await page.click(`[data-edit-comp="${c1}"]`);
  await page.fill('[data-f="title"]', 'Chair Yoga for Seniors');
  await saveForm();
  ok(!(await stale()), 'title back as it was: current again');

  // 9. Deleting a reviewed competitor: out of date.
  await page.click(`[data-edit-comp="${c4}"]`);
  await page.click('[data-form-delete]');
  await page.click('dialog[open] [data-confirm]');
  for (let i = 0; i < 50 && b.competitors.length === 4; i++) await page.waitForTimeout(100);
  await page.waitForFunction(() => !document.querySelector('dialog[open]') && !document.querySelector('[data-form]'), null, { timeout: 5000 });
  ok(b.competitors.length === 3, 'competitor deleted');
  ok(await stale(), 'deleted a reviewed competitor: out of date');

  // 10. A line edit keeps the key (only the lines change).
  const before = b.insights.inputs_key;
  await page.click('[data-line-remove="loves:0"]');
  await page.waitForTimeout(500);
  const patch = st.writes.filter((w) => w.table === 'research_insights').pop();
  ok(patch.method === 'PATCH' && !('inputs_key' in patch.body) && b.insights.inputs_key === before, 'removing a line keeps the key');
  ok(await stale(), 'still out of date after a line edit');
  return log.join('\n');
};
