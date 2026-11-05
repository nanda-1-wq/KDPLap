// Design 52: the first visit to 07, and the shell around it.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await QC.open7(page);

  ok((await QC.txt(page, '[data-step-label]')) === 'PRODUCE · STEP 7 OF 11', 'head label');
  ok((await QC.txt(page, '[data-step-title]')) === 'Quality Control', 'head title');
  ok(/^Quality Control · Micro Study Habits/.test(await page.title()), `tab title: ${await page.title()}`);
  ok((await QC.txt(page, '.qc-first .chip-label')) === 'CHECK THE WHOLE BOOK', 'label');
  ok((await QC.txt(page, '.qc-first h2')) === 'Find problems before you format the book', 'heading');
  const list = await QC.all(page, '.qc-list li');
  ok(list.length === 8 && /^1 Complete\./.test(list[0]) && /^6 Promise\..*AI · paid$/.test(list[5]) && /^8 Result\./.test(list[7]), `the 8 parts: ${JSON.stringify(list)}`);
  ok((await QC.txt(page, '.qc-run .qc-note')) === 'Free. About 2 seconds. Runs groups 1 to 5 and 7.', 'free note');
  ok((await QC.txt(page, '[data-run]')) === 'Run checks', 'Run checks');

  // Group 6 is drawn; its button is off until E14.6.
  ok(await page.$eval('.qc-promise-wide button', (b) => b.disabled && b.textContent === 'Check the promise'), 'promise button is off');
  ok((await QC.txt(page, '.qc-promise-wide .qc-note')) === 'Comes in the next part', 'promise: Comes in the next part');

  const side = await QC.all(page, '.qc-side .qc-fact');
  ok(side.length === 4 && side[0].startsWith('Never blocks.') && side[3].startsWith('Step 07 is done'), `Good to know: ${JSON.stringify(side)}`);

  // Header: Back, Export, Next (Coming next until 08 lands, V9). No reason line.
  ok(await page.$eval('[data-next]', (b) => b.disabled), 'Next is off');
  ok((await QC.txt(page, '[data-next-note]')) === 'Coming next', 'Next says Coming next');
  ok(await page.$eval('[data-back]', (b) => !b.disabled), 'Back is on');
  ok(!(await page.$('a[data-step="7"] [data-step-missing]')), 'no "Not done yet" under 07');

  // Nothing was saved and the reload keeps the step.
  ok(st.writes.length === 0, 'a visit saves nothing');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qc-first', { timeout: 10000 });
  ok(/step=7/.test(page.url()), 'a reload keeps step 7');

  // A step above 07 falls back to 01, as a bad step did before.
  await page.goto(QC.url(8), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Brief', null, { timeout: 10000 });
  ok(/step=1/.test(page.url()), 'step=8 has no screen yet: 01 opens');
  return log.join('\n');
};
