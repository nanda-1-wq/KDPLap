// Step 05 Outline (E9.2): the AI outline check. Not run, checking with Stop,
// findings with AI labels and pills, "Out of date" after an edit the AI reads
// (not after words or boxes), an edit during the check, reload, errors, Stop,
// and the disabled states.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.otl [data-list] > :not(.sr-only)', { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('.otl [data-list] .ttl-skel'), null, { timeout: 10000 });
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const settle = async () => {
    await page.waitForTimeout(900);
    for (let i = 0; i < 40; i++) {
      const s = await page.$eval('[data-saved-line]', (e) => e.dataset.state).catch(() => '');
      if (s !== 'saving') break;
      await page.waitForTimeout(100);
    }
  };
  const ch = (n) => `.otl-ch:not(.otl-fixed):nth-child(${n + 1})`;
  const aiRows = () => page.$$eval('[data-ai-list] li', (ls) => ls.map((l) => `${l.className.replace('is-', '')}: ${l.innerText.replace(/\s+/g, ' ').trim()}`));
  const aiPills = () => page.$$eval('[data-pills]', (ps) => ps.map((p) => [...p.querySelectorAll('.check-badge')].filter((b) => b.querySelector('.otl-ai')).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  const checking = () => page.waitForFunction(() => !document.querySelector('[data-check-stop]'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 1440, height: 1200 });

  // 1. Not run yet: a short note and "Check outline"; no AI pills.
  await open(B1);
  ok(/AI CHECK/.test(await txt('[data-ai-check]')) && /Not run yet/.test(await txt('[data-ai-check]')), `not run: ${await txt('[data-ai-check]')}`);
  ok((await txt('[data-check]')) === 'Check outline', 'button: Check outline');
  ok((await aiPills()).every((p) => !p), 'no AI pills');

  // 2. Check: the working state with Stop, then the findings with AI labels.
  globalThis.__modes.checkDelay = 700;
  await page.click('[data-check]');
  await page.waitForSelector('[data-check-stop]', { timeout: 3000 });
  ok(/Checking the outline/.test(await txt('[data-ai-check]')), 'working: Checking the outline…');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-check-stop]')), 'focus on Stop');
  await checking();
  globalThis.__modes.checkDelay = 0;
  ok(JSON.stringify(st.gens.at(-1)) === JSON.stringify({ stage: 'outline_check', bookId: B1 }), `request: ${JSON.stringify(st.gens.at(-1))}`);
  const rows = await aiRows();
  ok(rows.length === 3, `3 AI lines: ${JSON.stringify(rows)}`);
  ok(/^warn: Chapters 3 and 6 cover the same idea AI Both chapters teach seated breathing/.test(rows[0]), `overlap line: ${rows[0]}`);
  ok(/^warn: No chapter covers “without help” from the reader promise AI No chapter shows/.test(rows[1]), `promise line: ${rows[1]}`);
  ok(/^warn: Chapter 8 leaves the positioning AI Moving with a friend/.test(rows[2]), `drift line: ${rows[2]}`);
  ok(/^Checked /.test(await txt('[data-ai-time]')), `time: ${await txt('[data-ai-time]')}`);
  ok((await txt('[data-check]')) === 'Check again', 'button: Check again');
  const pills = await aiPills();
  ok(pills[2] === 'Overlaps chapter 6 AI' && pills[5] === 'Overlaps chapter 3 AI' && pills[7] === 'Off the positioning AI', `pills: ${JSON.stringify(pills)}`);
  ok(await page.$eval(ch(3), (l) => l.classList.contains('is-warn')) && !(await page.$eval(ch(1), (l) => l.classList.contains('is-warn'))), 'chapter 3 card has the warning border, chapter 1 not');
  ok((await page.$$('[data-checks] .otl-by')).length >= 1 && /Checked by KDP Lab/.test(await txt('[data-checks]')), 'code checks keep "Checked by KDP Lab"');

  // 3. Words and the Examples box do not make it out of date (owner answer A).
  await page.click(`${ch(1)} [data-toggle]`).catch(() => {});
  if (!(await page.$(`${ch(1)} .otl-ch-body`))) await page.click(`${ch(1)} [data-toggle]`);
  await page.fill(`${ch(1)} .otl-sec:nth-child(1) [data-f="word_target"]`, '450');
  await page.click(`${ch(1)} [data-f="include_examples"]`);
  await settle();
  ok(!(await txt('[data-ai-note]')) && (await aiRows()).length === 3 && (await aiPills())[2] === 'Overlaps chapter 6 AI', 'words and Examples: still current');

  // 4. A title edit makes it out of date: lines grey, pills gone. Undoing the edit makes it current again.
  const t1 = await page.inputValue(`${ch(1)} [data-c][data-f="title"]`);
  await page.fill(`${ch(1)} [data-c][data-f="title"]`, 'Why Chair Yoga Is Safe After 60');
  ok(/Out of date\. The outline changed after the AI check\. Check again\./.test(await txt('[data-ai-note]')), `out of date: ${await txt('[data-ai-note]')}`);
  ok(await page.$eval('[data-ai-list]', (l) => l.classList.contains('is-stale')), 'old lines shown grey');
  ok((await aiPills()).every((p) => !p), 'out of date: AI pills hidden');
  await page.fill(`${ch(1)} [data-c][data-f="title"]`, t1);
  ok(!(await txt('[data-ai-note]')) && (await aiPills())[2] === 'Overlaps chapter 6 AI', 'title back: current again (a fingerprint, not a flag)');
  await settle();

  // 5. Each kind of edit the AI reads: objective, section title, reorder.
  const stale = async () => /Out of date/.test(await txt('[data-ai-note]') || '');
  const obj = await page.inputValue(`${ch(1)} [data-c][data-f="objective"]`);
  await page.fill(`${ch(1)} [data-c][data-f="objective"]`, obj + ' at home');
  ok(await stale(), 'objective edit: out of date');
  await page.fill(`${ch(1)} [data-c][data-f="objective"]`, obj);
  const sec = await page.inputValue(`${ch(1)} .otl-sec:nth-child(1) [data-f="title"]`);
  await page.fill(`${ch(1)} .otl-sec:nth-child(1) [data-f="title"]`, sec + ' and why');
  ok(await stale(), 'section title edit: out of date');
  await page.fill(`${ch(1)} .otl-sec:nth-child(1) [data-f="title"]`, sec);
  ok(!(await stale()), 'both undone: current');
  await settle();
  await page.focus(`${ch(1)} [data-handle]`);
  await page.keyboard.press('Alt+ArrowDown');
  ok(await stale(), 'reorder: out of date');
  await page.waitForTimeout(500);

  // 6. Check again with no problems: three pass lines.
  globalThis.__modes.checkOut = 'none';
  await page.click('[data-check]');
  await checking();
  ok(JSON.stringify(await aiRows()) === JSON.stringify(['pass: No two chapters cover the same idea AI', 'pass: Covers the reader promise AI', 'pass: Every chapter follows the positioning AI']), `no problems: ${JSON.stringify(await aiRows())}`);
  ok(!(await stale()), 'current after the check');

  // 7. Reload: the saved result reads back, still current.
  await open(B1);
  ok((await aiRows()).length === 3 && !(await stale()) && /^Checked /.test(await txt('[data-ai-time]')), 'reload: saved result, current');

  // 8. An edit made while the check runs: the result shows out of date at once.
  globalThis.__modes.checkOut = '';
  globalThis.__modes.checkDelay = 1200;
  await page.click('[data-check]');
  await page.waitForSelector('[data-check-stop]', { timeout: 3000 });
  if (!(await page.$(`${ch(2)} .otl-ch-body`))) await page.click(`${ch(2)} [data-toggle]`);
  await page.fill(`${ch(2)} [data-c][data-f="title"]`, 'Setting Up Your Chair');
  await checking();
  globalThis.__modes.checkDelay = 0;
  ok(await stale() && (await aiRows()).length === 3, 'edit during the check: result shown, out of date');
  await settle();

  // 9. Errors: the message and Try again; Try again runs it.
  globalThis.__modes.gen = 'ai_unavailable';
  await page.click('[data-check]');
  await page.waitForSelector('[data-ai-check] [role="alert"]', { timeout: 3000 });
  ok(/The AI is not available right now\. This try was not counted\./.test(await txt('[data-ai-check] [role="alert"]')), 'error message');
  globalThis.__modes.gen = 'ok';
  await page.click('[data-check-retry]');
  await checking();
  ok(!(await page.$('[data-ai-check] [role="alert"]')) && !(await stale()), 'Try again: checked, current');

  // 10. Stop: the E7 wording; the late result still shows (the server saved it).
  globalThis.__modes.checkOut = 'none';
  globalThis.__modes.checkDelay = 1200;
  await page.click('[data-check]');
  await page.waitForSelector('[data-check-stop]', { timeout: 3000 });
  await page.click('[data-check-stop]');
  ok((await txt('[data-ai-note]')) === 'Stopped. If the AI had already finished, this call may still count.', `stopped: ${await txt('[data-ai-note]')}`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-check]')), 'focus back on Check');
  await page.waitForTimeout(1500);
  globalThis.__modes.checkDelay = 0;
  ok((await aiRows())[0] === 'pass: No two chapters cover the same idea AI', 'late result shows');

  // 11. A Verify flag on a number in the AI text.
  globalThis.__modes.checkOut = '';
  globalThis.__modes.checkUnsourced = true;
  await page.click('[data-check]');
  await checking();
  ok(/Verify: no source for 40/.test((await aiRows())[2]), `verify: ${(await aiRows())[2]}`);
  globalThis.__modes.checkUnsourced = false;

  // 12. Disabled: unlocked positioning, and an empty book has no AI part.
  await open(B4);
  ok(await page.$eval('[data-check]', (b) => b.disabled) && (await txt('[data-check-why]')) === 'Lock the positioning in 03 first.', 'unlocked: Check disabled, says why');
  await open(B2);
  ok(!(await page.$('[data-ai-check]')), 'no chapters: no AI check part');

  // 13. positioning_not_locked from the server (another tab unlocked it).
  await open(B1);
  globalThis.__modes.gen = 'positioning_not_locked';
  await page.click('[data-check]');
  await page.waitForSelector('[data-ai-check] [role="alert"]', { timeout: 3000 });
  ok(/Lock your positioning in 03 first/.test(await txt('[data-ai-check] [role="alert"]')) && !(await page.$('[data-check-retry]')), 'not locked: message, no Try again');
  globalThis.__modes.gen = 'ok';
  return log.join('\n');
};
