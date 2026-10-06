// i3 on step 04: "Pick a title", then "Add a subtitle", then nothing.
// A title with "Needs review" shows only its flag (no second reason).
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const note = () => page.$eval('[data-next-note]', (e) => (e.hidden ? '' : e.textContent));
  const st = globalThis.__store;
  const uses = () => st.writes.filter((w) => w.table === 'books' && 'title' in w.body).length;
  const use = async () => {
    const n = uses();
    await page.click('[data-use]');
    for (let i = 0; i < 50 && uses() === n; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(200);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P2}&step=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ttlTitle', { timeout: 10000 });

  ok((await reason(4)) === 'Pick a title', `no title: "${await reason(4)}"`);
  ok((await note()) === 'Not done yet: pick a title.', `note: "${await note()}"`);
  ok((await reason(3)) === '' && await page.$eval('a[data-step="3"]', (a) => a.classList.contains('is-locked')), 'locked 03: lock mark, no reason');
  ok(!(await page.isDisabled('[data-next]')), 'Next stays on for step 04');

  await page.fill('#ttlTitle', 'Chair Yoga for Seniors Over 60');
  await use();
  ok((await reason(4)) === 'Add a subtitle', `title only: "${await reason(4)}"`);
  ok((await note()) === 'Not done yet: add a subtitle.', `note: "${await note()}"`);

  await page.fill('#ttlSubtitle', 'Gentle 15-Minute Routines to Improve Balance, Flexibility, and Confidence at Home');
  await use();
  ok((await reason(4)) === '' && (await note()) === '', 'title and subtitle: no reason, no note');
  ok(await page.$eval('a[data-step="4"]', (a) => a.classList.contains('is-done')), 'step 04 done');

  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P4}&step=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ttlTitle', { timeout: 10000 });
  ok((await reason(4)) === '', 'Needs review: no extra reason line');
  ok(/Needs review/.test(await page.$eval('a[data-step="4"]', (a) => a.textContent)), 'the Needs review flag is still there');
  ok((await note()) === '', 'Needs review: no note next to Next');
  return log.join('\n');
};
