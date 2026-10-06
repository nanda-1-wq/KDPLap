// i3 on step 01: the reason replaces "N required fields left" and Next stays
// blocked until the three required fields are filled (same rule as before).
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const note = () => page.$eval('[data-next-note]', (e) => (e.hidden ? '' : e.textContent));
  const settle = () => page.waitForTimeout(1100);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B3}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-topic_text', { timeout: 10000 });

  ok((await reason(1)) === 'Fill the target reader and the reader problem', `sidebar 01: "${await reason(1)}"`);
  ok((await note()) === 'Fill the target reader and the reader problem', `note (no "Not done yet" on a blocking step): "${await note()}"`);
  ok(await page.isDisabled('[data-next]'), 'Next blocked on 01');
  ok((await reason(2)) === 'Needs 3 competitors and 1 source', `sidebar 02 with none: "${await reason(2)}"`);
  await page.screenshot({ path: `${SHOTS}/brief-missing.png`, timeout: 5000 }).catch(() => {});

  // Clearing the topic too: three fields.
  await page.fill('#bf-topic_text', '');
  ok((await note()) === 'Fill 3 required fields', `note follows typing at once: "${await note()}"`);
  await settle();
  ok((await reason(1)) === 'Fill 3 required fields', `sidebar after the save: "${await reason(1)}"`);
  await page.fill('#bf-topic_text', 'Chair yoga for seniors with stiff joints');
  await page.fill('#bf-target_reader', READER);
  ok((await note()) === 'Fill the reader problem', `one left: "${await note()}"`);
  ok(await page.isDisabled('[data-next]'), 'still blocked');
  await page.fill('#bf-reader_problem', PROBLEM);
  ok((await note()) === '' && !(await page.isDisabled('[data-next]')), 'all filled: no note, Next on');
  await settle();
  ok((await reason(1)) === '' && await page.$eval('a[data-step="1"]', (a) => a.classList.contains('is-done')), 'sidebar 01 done after the save');
  ok((await page.$eval('a[data-step="1"]', (a) => a.getBoundingClientRect().height)) === 44, 'done step is back to 44 px');

  // Next to 02: its note informs, Next stays on.
  await page.click('[data-next]');
  await page.waitForSelector('[data-add-comp]', { timeout: 10000 });
  ok((await note()) === 'Not done yet: needs 3 competitors and 1 source.' && !(await page.isDisabled('[data-next]')), `02 note: "${await note()}"`);
  return log.join('\n');
};
