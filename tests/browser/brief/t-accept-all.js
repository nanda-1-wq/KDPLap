// i5 on step 01: "Accept all" takes the suggestions without a Verify flag
// (one save), the flagged one keeps waiting; required errors go.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const area = async () => ((await page.innerText('[data-help-area]').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const settle = () => page.waitForTimeout(900);
  const help = async () => {
    await page.click('[data-help]');
    await page.waitForFunction(() => /Suggestions are ready|Nothing to change/.test((document.querySelector('[data-help-area]') || {}).innerText || ''), null, { timeout: 8000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B3}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  // Show the required errors first (leave the empty fields).
  await page.focus('#bf-target_reader'); await page.focus('#bf-reader_problem'); await page.focus('#bf-topic_text');
  ok(!(await page.$eval('#bf-target_reader-error', (e) => e.hidden)), 'required error shows before');

  // 1. Three suggestions, the promise flagged ("20").
  await help();
  ok(!!(await page.$('[data-accept-all]')), 'Accept all shows');
  ok(/^Suggestions are ready under Target reader, Reader problem and Reader promise\. Nothing changes until you accept\.$/.test((await area()).replace(/ Accept all$/, '')), `note: "${await area()}"`);
  await page.screenshot({ path: `${SHOTS}/brief-accept-all.png`, timeout: 5000 }).catch(() => {});
  const n = W().length;
  await page.click('[data-accept-all]');
  await settle();
  const w = W().slice(n);
  ok(w.length === 1 && Object.keys(w[0].body).sort().join(',') === 'reader_problem,target_reader', `one save, two fields (${w.map((x) => Object.keys(x.body)).join(' | ')})`);
  ok((await page.inputValue('#bf-target_reader')).startsWith('Adults over 60 with stiff knees') && (await page.inputValue('#bf-reader_problem')).startsWith('Most yoga books'), 'fields filled');
  ok(await page.$eval('#bf-target_reader-error', (e) => e.hidden) && await page.$eval('#bf-reader_problem-error', (e) => e.hidden), 'required errors gone');
  ok((await page.inputValue('#bf-promise_draft')) === '', 'flagged promise not taken');
  ok(/Verify: no source for 20/.test(await page.innerText('[data-suggest="promise_draft"]')), 'promise suggestion still waits with its flag');
  ok((await area()) === 'Accepted 2 suggestions. 1 with a Verify flag is still waiting below.', `note: "${await area()}"`);
  ok(await page.evaluate(() => document.activeElement.id === 'bf-target_reader'), 'focus on the first accepted field');
  ok(!(await page.isDisabled('[data-next]')), 'Next opens (required fields filled)');
  await page.click('[data-discard="promise_draft"]');
  ok((await area()) === '', 'last choice ends the note');

  // 2. Two suggestions, none flagged: Accept all takes both, the note goes.
  M.suggest = { promise_draft: 'After this book, the reader can follow a gentle seated routine at home every day.', target_reader: 'Adults over 60 with stiff joints who want a gentle routine at home.' };
  M.unsourced = {};
  await help();
  await page.click('[data-accept-all]');
  await settle();
  ok((await area()) === '' && (await page.inputValue('#bf-promise_draft')).startsWith('After this book'), 'none flagged: all taken, note gone');

  // 3. Every waiting suggestion flagged: no Accept all.
  M.suggest = { promise_draft: 'A 30-day plan for 20 minutes a day.', reader_problem: 'After 3 falls, 1 in 4 readers stop moving.' };
  M.unsourced = { promise_draft: ['30', '20'], reader_problem: ['3', '1', '4'] };
  await help();
  ok(!(await page.$('[data-accept-all]')), 'all flagged: no Accept all');
  // 4. One suggestion: no Accept all.
  M.suggest = { promise_draft: 'A gentle plan you can keep.' };
  M.unsourced = {};
  await help();
  ok(!(await page.$('[data-accept-all]')), 'one suggestion: no Accept all');
  M.suggest = null; M.unsourced = null;
  return log.join('\n');
};
