// Step 05 Outline (E9.1): the states, the design 20 outline, editing and saving,
// the word budget and the code checks.
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
  const writes = (table) => st.writes.filter((w) => w.table === table && !w.method);
  // Past the 800 ms autosave delay, then until the save is back.
  const settle = async () => {
    await page.waitForTimeout(900);
    for (let i = 0; i < 40; i++) {
      const s = await page.$eval('[data-saved-line]', (e) => e.dataset.state).catch(() => '');
      if (s !== 'saving') break;
      await page.waitForTimeout(100);
    }
  };
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const checkRows = () => page.$$eval('[data-check-list] li', (ls) => ls.map((l) => `${l.className.replace('is-', '')}: ${l.innerText.trim()}`));
  const ch = (n) => `.otl-ch:not(.otl-fixed):nth-child(${n + 1})`;   // +1: the Introduction comes first
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Unlocked, no outline: a clear note and a link to 03, no Generate.
  await open(B3);
  ok(/Lock your positioning first/.test(await txt('[data-list]')), 'unlocked: lock note');
  ok(await page.$eval('[data-list] a', (a) => a.getAttribute('href').endsWith('&step=3')), 'unlocked: link to 03');
  ok(!(await page.$('[data-generate]')) && !(await page.$('[data-add-chapter]')), 'unlocked: no Generate, no Add chapter');
  ok((await reason(5)) === 'Make an outline', `sidebar reason: "${await reason(5)}"`);

  // 2. Locked, no outline: empty state with Generate and Add chapter.
  await open(B2);
  ok(/No outline yet/.test(await txt('[data-list]')), 'empty: No outline yet');
  ok(!!(await page.$('[data-list] [data-generate].btn-primary')) && !!(await page.$('[data-list] [data-add-chapter]')), 'empty: Generate and Add chapter');
  ok((await txt('[data-checks]')) === 'OUTLINE CHECK Checked by KDP Lab Checks show here once you have chapters.', `empty checks: "${await txt('[data-checks]')}"`);

  // 3. Design 20.
  await open(B1);
  await page.screenshot({ path: `${SHOTS}/t1-design20.png`, fullPage: true, timeout: 8000 }).catch(() => {});
  const rows = await page.$$eval('.otl-list > .otl-ch', (ls) => ls.map((l) => l.querySelector('.otl-ch-title').innerText));
  ok(rows.length === 10 && rows[0] === 'Introduction' && rows[9] === 'Conclusion' && rows[1] === 'Why Chair Yoga Works After 60', `10 rows in order (${rows.length})`);
  ok((await page.$$eval('.otl-list > .otl-ch', (ls) => ls.map((l) => l.nextElementSibling && l.nextElementSibling.classList.contains('otl-add-row')))).indexOf(true) === 8, 'Add chapter sits before the Conclusion');
  ok(await page.$eval(ch(1), (l) => !!l.querySelector('.otl-ch-body')), 'chapter 1 open on first load');
  ok(await page.$eval(ch(2), (l) => !l.querySelector('.otl-ch-body')), 'chapter 2 closed');
  ok((await txt(`${ch(1)} [data-total]`)) === '1,100' && (await txt(`${ch(4)} [data-total]`)) === '1,400', 'chapter totals follow sections (1,100 / 1,400)');
  ok(!(await page.$(`${ch(1)} .otl-ch-head input`)), 'chapter Words is a read-only total');
  ok(await page.$eval('.otl-fixed:first-child input', (i) => i.value === '1000'), 'Introduction keeps a Words box (1000)');
  ok((await txt('[data-planned]')) === '11,100', `planned 11,100 (${await txt('[data-planned]')})`);
  ok(/planned · target 8K to 12K/.test(await txt('[data-budget]')), 'target 8K to 12K');
  ok(/≈ 45 pages at 6 × 9 in · marks show 8K and 12K/.test(await txt('[data-budget]')), `pages line: ${await txt('[data-budget] .otl-small')}`);
  ok(/Within the target/.test(await txt('[data-budget]')) && !!(await page.$('.otl-fill.is-ok')), 'within the target: green bar, icon and word');
  ok((await page.$$('.otl-mark')).length === 2, 'two marks');
  const c1 = await checkRows();
  ok(JSON.stringify(c1) === JSON.stringify(['pass: Within the word target', 'warn: Chapter 8 has no objective', 'pass: Every chapter has a title', 'pass: Every chapter has a section', 'pass: Every section has a word target', 'pass: 8 chapters, as in your Brief']), `checks: ${JSON.stringify(c1)}`);
  ok(/No objective/.test(await txt(`${ch(8)} [data-pills]`)) && await page.$eval(ch(8), (l) => l.classList.contains('is-warn')), 'chapter 8: No objective pill, warning border');
  ok(/Objective: No objective yet/.test(await txt(`${ch(8)} [data-head-obj]`)), 'chapter 8: "No objective yet"');
  ok((await reason(5)) === 'Approve the outline', `sidebar: "Approve the outline" once there is an outline (E9.2 owner): "${await reason(5)}"`);

  // 4. Words: the chapter total, budget and checks follow; the section saves.
  await page.fill(`${ch(1)} .otl-sec:nth-child(1) .otl-num-input`, '900');
  ok((await txt(`${ch(1)} [data-total]`)) === '1,600' && (await txt('[data-planned]')) === '11,600', 'typing 900: total 1,600, planned 11,600');
  await settle();
  const w = writes('sections').at(-1);
  ok(w && JSON.stringify(w.body) === '{"word_target":900}', `section saved: ${JSON.stringify(w && w.body)}`);

  // 5. A bad number: marked, held, never sent; a good one saves.
  const n5 = writes('sections').length;
  await page.fill(`${ch(1)} .otl-sec:nth-child(2) .otl-num-input`, '20000');
  await settle();
  ok(await page.$eval(`${ch(1)} .otl-sec:nth-child(2) .otl-num-input`, (i) => i.getAttribute('aria-invalid') === 'true'), '20000: marked invalid');
  ok(/Couldn't save: use a whole number from 0 to 10,000 words\./.test(await txt('[data-saved-line]')), `20000: sidebar says why (${await txt('[data-saved-line]')})`);
  ok(writes('sections').length === n5, '20000: nothing sent');
  await page.fill(`${ch(1)} .otl-sec:nth-child(2) .otl-num-input`, '500');
  await settle();
  ok(writes('sections').length === n5 + 1 && writes('sections').at(-1).body.word_target === 500, '500 saved');

  // 6. Title edit: head updates while typing; blank saves null and shows Untitled + a check.
  await page.fill(`#otlT-${await page.$eval(ch(1), (l) => l.dataset.ch)}`, 'Why Seated Yoga Works After 60');
  ok((await txt(`${ch(1)} [data-head-title]`)) === 'Why Seated Yoga Works After 60', 'head title follows typing');
  await settle();
  ok(writes('chapters').at(-1).body.title === 'Why Seated Yoga Works After 60', 'title saved');
  await page.fill(`${ch(1)} [data-f="title"]`, '   ');
  await settle();
  ok(writes('chapters').at(-1).body.title === null, 'blank title saves null');
  ok((await txt(`${ch(1)} [data-head-title]`)) === 'Untitled chapter', 'blank: Untitled chapter');
  ok((await checkRows()).includes('warn: Chapter 1 has no title'), 'check: Chapter 1 has no title');
  await page.fill(`${ch(1)} [data-f="title"]`, 'Why Chair Yoga Works After 60');
  await settle();

  // 7. An objective for chapter 8 clears its pill and the check.
  await page.click(`${ch(8)} [data-toggle]`);
  ok(await page.$eval(ch(8), (l) => !!l.querySelector('.otl-ch-body')) && await page.$eval(`${ch(8)} [data-toggle]`, (b) => b.getAttribute('aria-expanded') === 'true'), 'chapter 8 opens');
  await page.fill(`${ch(8)} [data-f="objective"]`, 'Reader can keep going on stiff or tired days');
  ok(!/No objective/.test(await txt(`${ch(8)} [data-pills]`) || '') && await page.$eval(ch(8), (l) => !l.classList.contains('is-warn')), 'pill gone, border back to gray');
  ok((await checkRows())[1] === 'pass: Every chapter has an objective', 'check: every chapter has an objective');
  await settle();
  ok(writes('chapters').at(-1).body.objective === 'Reader can keep going on stiff or tired days', 'objective saved');

  // 8. Examples off saves at once.
  await page.click(`${ch(8)} [data-f="include_examples"]`);
  await settle();
  ok(JSON.stringify(writes('chapters').at(-1).body) === '{"include_examples":false}', `Examples off: ${JSON.stringify(writes('chapters').at(-1).body)}`);

  // 9. Introduction words: the budget follows (11,100 + 500 + 150 from steps 4 and 5, + 200 here).
  await page.fill('.otl-fixed:first-child input', '1200');
  ok((await txt('[data-planned]')) === '11,950', `Introduction 1200: planned ${await txt('[data-planned]')}`);
  await settle();

  // 10. Over the target: warning bar, word and check.
  await page.click(`${ch(4)} [data-toggle]`);
  await page.fill(`${ch(4)} .otl-sec:nth-child(1) .otl-num-input`, '1450');
  ok((await txt('[data-planned]')) === '12,950', `planned 12,950 (${await txt('[data-planned]')})`);
  ok(/Over the target/.test(await txt('[data-budget]')) && !!(await page.$('.otl-fill.is-warn')), 'over: warning bar with icon and word');
  ok((await checkRows())[0] === 'warn: 950 words over the target (8K to 12K)', `over check: ${(await checkRows())[0]}`);
  await settle();

  // 11. A reload shows what was saved.
  await open(B1);
  ok((await txt('[data-planned]')) === '12,950', `after reload: planned ${await txt('[data-planned]')}`);
  ok((await txt(`${ch(8)} [data-head-obj]`)) === 'Objective: Reader can keep going on stiff or tired days', 'after reload: objective kept');

  // 12. A failed save keeps the edit and offers Retry; Retry saves it.
  globalThis.__modes.saveError = true;
  await page.fill(`${ch(1)} .otl-sec:nth-child(3) .otl-num-input`, '400');
  await settle();
  ok(/Couldn't save\./.test(await txt('[data-saved-line]')) && !!(await page.$('[data-retry-save]')), 'save error: Retry shown');
  globalThis.__modes.saveError = false;
  await page.click('[data-retry-save]');
  await settle();
  ok(writes('sections').at(-1).body.word_target === 400 && (await page.$eval('[data-saved-line]', (e) => e.dataset.state)) === 'saved', 'Retry saved 400');
  return log.join('\n');
};
