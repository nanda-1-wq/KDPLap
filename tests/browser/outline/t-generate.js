// Step 05 Outline (E9.1): Generate (dialog, sections per chapter), Regenerate
// (replace confirm), Stop, errors, writing, and the "Needs review" marks.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.otl-list, .otl-empty', { timeout: 10000 });
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const titles = () => page.$$eval('.otl-list > .otl-ch:not(.otl-fixed) .otl-ch-title', (ls) => ls.map((l) => l.innerText));
  const done = () => page.waitForFunction(() => !document.querySelector('[data-stop]'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Empty book: the dialog says what the Brief gives; 1 to 6 sections, default 3.
  await open(B2);
  await page.click('[data-list] [data-generate]');
  ok((await txt('dialog[open] h2')) === 'Generate an outline', 'dialog: Generate an outline');
  ok((await txt('dialog[open] [data-gen-plan]')) === 'From your Brief: 8 chapters, 8K to 12K words. Change these in 01 Brief', `plan: ${await txt('dialog[open] [data-gen-plan]')}`);
  ok((await page.inputValue('#ogPer')) === '3', 'sections per chapter: 3');
  ok(await page.$eval('dialog[open] [data-confirm]', (b) => b.classList.contains('btn-primary') && b.textContent === 'Generate outline'), 'primary Generate outline');
  await page.fill('#ogPer', '9');
  await page.click('dialog[open] [data-confirm]');
  ok((await txt('#ogPerError')) === 'Use a whole number from 1 to 6.' && await page.$eval('#ogPer', (i) => i.getAttribute('aria-invalid') === 'true'), '9: error, dialog stays');
  ok(st.gens.length === 0, '9: no AI call');
  globalThis.__modes.genDelay = 700;
  await page.fill('#ogPer', '2');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('[data-stop]', { timeout: 3000 });
  ok(/Writing your outline from the locked positioning/.test(await txt('[data-list]')), 'working state with Stop');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-stop]')), 'focus on Stop');
  await done();
  globalThis.__modes.genDelay = 0;
  ok(JSON.stringify(st.gens.at(-1)) === JSON.stringify({ stage: 'outline_ideas', bookId: B2, sectionsPerChapter: 2 }), `request: ${JSON.stringify(st.gens.at(-1))}`);
  ok((await titles()).length === 8 && (await page.$$('.otl-ch:not(.otl-fixed):nth-child(2) .otl-sec')).length === 2, '8 chapters, 2 sections each');
  ok(/^Outline ready: 8 chapters, [\d,]+ words\.$/.test(await txt('[data-status] [role="status"]')), `status: ${await txt('[data-status] [role="status"]')}`);
  ok(await page.$eval('.otl-ch:not(.otl-fixed):nth-child(2)', (l) => !!l.querySelector('.otl-ch-body')), 'chapter 1 open');
  await page.fill('.otl-ch:not(.otl-fixed):nth-child(2) [data-f="title"]', 'Why Chair Yoga Works');
  ok(!(await txt('[data-status]')), 'the "ready" note clears on the next edit');
  await page.waitForTimeout(1200);

  // 2. Regenerate: replace confirm with a red button; the outline is replaced.
  await page.click('[data-top] [data-generate]');
  ok((await txt('dialog[open] h2')) === 'Replace the outline?', 'dialog: Replace the outline?');
  ok((await txt('dialog[open] [data-gen-text]')) === 'The AI writes a new outline. Your edits to chapters and sections are lost. Nothing is written yet.', 'replace text');
  ok(await page.$eval('dialog[open] [data-confirm]', (b) => b.classList.contains('btn-danger') && b.textContent === 'Replace outline'), 'red Replace outline');
  ok((await page.inputValue('#ogPer')) === '2', 'remembers 2');
  await page.fill('#ogPer', '3');
  await page.click('dialog[open] [data-confirm]');
  await done();
  ok((await titles())[0] === 'Why Chair Yoga Works After 60' && (await page.$$('.otl-ch:not(.otl-fixed):nth-child(2) .otl-sec')).length === 3, 'replaced: 3 sections each, edit gone');

  // 3. Stop: the message from E7; the outline the server saved still shows.
  globalThis.__modes.genDelay = 1500;
  st.books[B2].brief.chapter_count = 9;
  await page.click('[data-top] [data-generate]');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('[data-stop]', { timeout: 3000 });
  await page.click('[data-stop]');
  ok((await txt('[data-status]')) === 'Stopped. If the AI had already finished, this call may still count.', `stopped: ${await txt('[data-status]')}`);
  ok((await titles()).length === 8, 'stopped: the old outline shows for now');
  await page.waitForTimeout(2000);
  ok((await titles()).length === 9, 'then the saved outline (9 chapters) shows');
  globalThis.__modes.genDelay = 0;
  st.books[B2].brief.chapter_count = 8;

  // 4. AI error: the shared message, Try again opens the dialog again.
  globalThis.__modes.gen = 'ai_unavailable';
  await page.click('[data-top] [data-generate]');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('[data-status] [role="alert"]', { timeout: 5000 });
  ok((await txt('[data-status] .alert-text')) === 'The AI is not available right now. This try was not counted.', `error: ${await txt('[data-status] .alert-text')}`);
  ok((await titles()).length === 9, 'error: the outline is untouched');
  globalThis.__modes.gen = '';
  await page.click('[data-generate-retry]');
  ok(!!(await page.$('dialog[open]')), 'Try again opens the dialog');
  await page.click('dialog[open] [data-close]');

  // 5. No chapter count and no length in the Brief: the dialog says the AI picks.
  await open(B6);
  await page.click('[data-list] [data-generate]');
  ok((await txt('dialog[open] [data-gen-plan]')) === 'Your Brief has no chapter count, so the AI picks 6 to 10. It has no length, so the AI aims for 8K to 12K words. Change these in 01 Brief', `plan: ${await txt('dialog[open] [data-gen-plan]')}`);
  await page.click('dialog[open] [data-confirm]');
  await done();
  ok(/^Outline ready: 9 chapters, [\d,]+ words\. The AI picked the number of chapters\.$/.test(await txt('[data-status] [role="status"]')), `picked: ${await txt('[data-status] [role="status"]')}`);
  ok(/No word target yet/.test(await txt('[data-checks]')) && /No target yet\. Set the length in 01 Brief\./.test(await txt('[data-budget]')), 'no target: budget and check say so');
  ok(!(await page.$('.otl-bar')), 'no target: no bar');

  // 6. Writing in a section: Regenerate is off, with the reason.
  await open(B5);
  ok(await page.$eval('[data-top] [data-generate]', (b) => b.disabled), 'writing: Regenerate disabled');
  ok(/Some sections have writing, so the outline can’t be replaced\. Edit it by hand\./.test(await txt('[data-top]')), 'writing: reason shown');

  // 7. Unlocked after the outline: Needs review note, pills, sidebar flag; editing still works.
  await open(B4);
  await page.screenshot({ path: `${SHOTS}/t-generate-review.png`, timeout: 8000 }).catch(() => {});
  ok(/Needs review\. The positioning was unlocked after this outline was made, so 8 chapters are marked\. Check each one against the positioning\./.test(await txt('[data-review-note]')), `note: ${await txt('[data-review-note]')}`);
  ok((await page.$$eval('[data-pills]', (ps) => ps.filter((p) => /Needs review/.test(p.innerText)).length)) === 8, '8 Needs review pills');
  ok(/Needs review/.test(await txt('a[data-step="5"]')), 'sidebar 05: Needs review flag');
  ok(await page.$eval('[data-top] [data-generate]', (b) => b.disabled) && /The positioning is unlocked\. Lock it in 03 again to regenerate\. You can still edit the outline\./.test(await txt('[data-top]')), 'unlocked: Regenerate off, reason and link');
  await page.fill('.otl-ch:not(.otl-fixed):nth-child(2) .otl-sec:nth-child(1) .otl-num-input', '420');
  await page.waitForTimeout(1300);
  ok(st.writes.some((w) => w.table === 'sections' && w.body && w.body.word_target === 420), 'unlocked: edits still save');

  // 8. The sidebar flag shows before step 05 is opened (from the book row).
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B4}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[data-step="5"]', { timeout: 10000 });
  ok(/Needs review/.test(await txt('a[data-step="5"]')), 'flag on 05 from step 01');
  return log.join('\n');
};
