// i3 on step 03: the reason follows the lock rules, in the lock panel's order:
// required cards, then the drift check, then open flags, then "Approve and lock".
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const note = () => page.$eval('[data-next-note]', (e) => (e.hidden ? '' : e.textContent));
  const waitSaved = async () => { await page.waitForTimeout(80); await page.waitForFunction(() => (document.querySelector('[data-saved-line]') || {}).dataset?.state === 'saved', null, { timeout: 5000 }); };
  const both = async (want, msg) => {
    const r = await reason(3), n = await note();
    ok(r === want && n === (want ? `Not done yet: ${want.charAt(0).toLowerCase()}${want.slice(1)}.` : ''), `${msg}: sidebar "${r}", note "${n}"`);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-copy-gaps]');

  await both('Add 5 required cards', 'empty');
  ok(!(await page.isDisabled('[data-next]')), 'Next stays on');
  await page.click('[data-copy-gaps]');
  await waitSaved();
  await both('Add 4 required cards', 'after copying gaps');

  await page.click('[data-help-all]');
  await page.waitForSelector('[data-accept="reader_promise"]', { timeout: 8000 });
  await page.click('[data-accept="reader_promise"]');
  await page.click('[data-accept="selling_points"]');
  await waitSaved();
  await both('Add the one sentence and your approach', 'two cards left');
  await page.click('[data-accept="approach"]');
  await waitSaved();
  await both('Add the one sentence', 'one card left');
  await page.click('[data-accept="one_sentence"]');
  await waitSaved();
  await both('Run the drift check', 'all cards, no check');

  await page.click('[data-run-drift]');
  await page.waitForSelector('[data-keep="d1"]', { timeout: 8000 });
  await both('Resolve 1 drift flag', 'one open flag');
  await page.click('[data-keep="d1"]');
  await page.fill('[data-keep-input]', 'Daily practice is the core of the promise.');
  await page.click('[data-keep-form] button[type="submit"]');
  await page.waitForSelector('[data-undo-keep="d1"]', { timeout: 5000 });
  await both('Approve and lock', 'flag kept');

  await page.click('[data-lock-btn]');
  await page.waitForSelector('[data-banner-title]', { timeout: 5000 });
  await both('', 'locked');
  ok(await page.$eval('a[data-step="3"]', (a) => a.classList.contains('is-locked') && !a.classList.contains('has-missing')), 'lock mark, no reason line');
  return log.join('\n');
};
