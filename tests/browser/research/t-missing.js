// i3 on step 02: the sidebar and the note next to Next say what is missing.
// Same rule as before (3+ competitors, 1+ source); Next stays on.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const txt = async (sel) => ((await page.innerText(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const note = async () => (await page.$eval('[data-next-note]', (e) => (e.hidden ? '' : e.textContent)));
  const saveForm = async () => {
    await page.click('[data-form-save]');
    await page.waitForFunction(() => !document.querySelector('[data-form]'), null, { timeout: 5000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${R2}&step=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-add-comp]', { timeout: 10000 });
  await page.waitForTimeout(300);

  ok((await reason(2)) === 'Needs 2 more competitors and 1 source', `sidebar 02: "${await reason(2)}"`);
  ok((await note()) === 'Not done yet: needs 2 more competitors and 1 source.', `note: "${await note()}"`);
  ok(!(await page.isDisabled('[data-next]')), 'Next stays on for step 02');
  ok((await reason(1)) === '', 'Brief is done: no reason on 01');
  ok(/Add 5 required cards/.test(await reason(3)), `sidebar 03: "${await reason(3)}"`);
  ok((await reason(4)) === 'Pick a title', `sidebar 04: "${await reason(4)}"`);
  // E9.1: step 05 has a screen now and says what it needs; 06 has none yet.
  ok((await reason(5)) === 'Make an outline' && (await reason(6)) === '', `05 "${await reason(5)}", no reason on 06`);
  const linkText = await page.$eval('a[data-step="2"]', (a) => a.textContent.replace(/\s+/g, ' ').trim());
  ok(/Research, Needs 2 more competitors and 1 source$/.test(linkText), `the link text reads the reason with the step ("${linkText}")`);
  const h = await page.$eval('a[data-step="2"]', (a) => a.getBoundingClientRect().height);
  ok(h >= 44, `step link is at least 44 px tall (${h})`);
  await page.screenshot({ path: `${SHOTS}/research-missing.png`, timeout: 5000 }).catch(() => {});

  // A note does not count; a source does.
  await page.click('[data-add-src]');
  await page.click('[data-kind="note"]');
  await page.fill('[data-f="body"]', 'Ask Mum which poses hurt her knees, and how long she can sit without a break. She said ten minutes is fine.');
  await saveForm();
  ok((await reason(2)) === 'Needs 2 more competitors and 1 source', 'a note does not count');
  await page.click('[data-add-src]');
  await page.fill('[data-f="body"]', 'Adults 65 and older should do activities that improve balance, such as standing on one foot, about 3 days a week.');
  await page.fill('[data-f="citation"]', 'CDC, Physical Activity Guidelines for Older Adults, 2024');
  await saveForm();
  ok((await reason(2)) === 'Needs 2 more competitors', `after a source: "${await reason(2)}"`);
  ok((await note()) === 'Not done yet: needs 2 more competitors.', `note: "${await note()}"`);

  await page.click('[data-add-comp]');
  await page.fill('[data-f="title"]', 'Gentle Yoga After 60: Easy Seated Routines for Balance and Strength');
  await saveForm();
  ok((await reason(2)) === 'Needs 1 more competitor', `one to go: "${await reason(2)}"`);
  await page.click('[data-add-comp]');
  await page.fill('[data-f="title"]', 'Sit and Stretch');
  await saveForm();
  ok((await reason(2)) === '', 'done: no reason');
  ok((await note()) === '', 'done: no note');
  ok(await page.$eval('a[data-step="2"]', (a) => a.classList.contains('is-done') && !a.classList.contains('has-missing')), 'step 02 is done, normal height class');
  log.push('SIDEBAR ' + await txt('[data-book-nav] .step-group'));
  return log.join('\n');
};
