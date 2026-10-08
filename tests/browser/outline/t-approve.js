// Step 05 Outline (E9.2): Approve outline. The card, the dialog with one line
// per warning ("AI check not run" is a line, not a warning), approve, step 05
// done, any outline edit removes the approval, regenerate, the disabled
// states and the errors.
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
  const lines = () => page.$$eval('dialog[open] [data-appr-lines] li', (ls) => ls.map((l) => `${l.className.replace('is-', '')}: ${l.innerText.replace(/\s+/g, ' ').trim()}`));
  const done05 = () => page.$eval('a[data-step="5"]', (a) => a.classList.contains('is-done'));
  const checking = () => page.waitForFunction(() => !document.querySelector('[data-check-stop]'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 1440, height: 1200 });

  // 1. The card (design 20): 1 code warning (chapter 8 has no objective).
  await open(B1);
  ok(/Approve outline/.test(await txt('[data-approve-card] h2')), 'card title');
  ok((await txt('[data-approve-card] [data-approve-text]')) === 'Writing follows this structure. Fix the 1 warning, or approve anyway.', `card text: ${await txt('[data-approve-card] [data-approve-text]')}`);
  ok(!(await page.$eval('[data-approve]', (b) => b.disabled)), 'Approve enabled');
  ok(!(await done05()), '05 not done');
  // Owner (E9.2): an outline that is not approved says so in the sidebar and under Next.
  const reason5 = () => page.$eval('a[data-step="5"]', (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  const nextNote = () => page.$eval('[data-next-note]', (e) => (e.hidden ? '' : e.textContent));
  ok((await reason5()) === 'Approve the outline' && (await nextNote()) === 'Not done yet: approve the outline.', `not approved: sidebar "${await reason5()}", Next "${await nextNote()}"`);

  // 2. The dialog: one line per warning, "AI check not run" as a line that is not counted.
  await page.click('[data-approve]');
  ok((await txt('dialog[open] h2')) === 'Approve with 1 warning?', `title: ${await txt('dialog[open] h2')}`);
  ok(JSON.stringify(await lines()) === JSON.stringify(['warn: Chapter 8 has no objective', 'info: AI check not run']), `lines: ${JSON.stringify(await lines())}`);
  ok((await txt('dialog[open] [data-appr-text]')) === 'Any change to the outline removes the approval. Approve it again after.', 'owner text (C)');
  ok((await txt('dialog[open] [data-close]')) === 'Fix them first' && (await txt('dialog[open] [data-confirm]')) === 'Approve anyway', 'buttons: Fix them first / Approve anyway');
  ok(await page.$eval('dialog[open] [data-confirm]', (b) => b.classList.contains('btn-primary') && !b.classList.contains('btn-danger')), 'Approve anyway is the ink button, not red');

  // 3. Fix them first: closes, focus on the Outline check card, nothing approved.
  await page.click('dialog[open] [data-close]');
  ok(!(await page.$('dialog[open]')) && await page.evaluate(() => document.activeElement && document.activeElement.id === 'otlChecks'), 'Fix them first: focus on OUTLINE CHECK');
  ok(st.approves.length === 0, 'no approve call');

  // 4. After the AI check: 4 warnings (1 code + 3 AI), no "not run" line.
  await page.click('[data-check]');
  await checking();
  ok((await txt('[data-approve-text]')) === 'Writing follows this structure. Fix the 4 warnings, or approve anyway.', `card: ${await txt('[data-approve-text]')}`);
  await page.click('[data-approve]');
  ok((await txt('dialog[open] h2')) === 'Approve with 4 warnings?', `title: ${await txt('dialog[open] h2')}`);
  ok(JSON.stringify(await lines()) === JSON.stringify(['warn: Chapter 8 has no objective', 'warn: Chapters 3 and 6 cover the same idea', 'warn: No chapter covers “without help” from the reader promise', 'warn: Chapter 8 leaves the positioning']), `lines: ${JSON.stringify(await lines())}`);

  // 5. Approve anyway: approved, step 05 done, Needs review cleared.
  globalThis.__modes.approveDelay = 500;
  await page.click('dialog[open] [data-confirm]');
  ok(/Approving/.test(await txt('dialog[open] [data-confirm]')), 'busy: Approving…');
  await page.waitForSelector('[data-approved]', { timeout: 4000 });
  globalThis.__modes.approveDelay = 0;
  ok(JSON.stringify(st.approves) === JSON.stringify([B1]), 'approve_outline called once');
  ok(/Outline approved/.test(await txt('[data-approve-card]')) && /Approved /.test(await txt('[data-approved]')), `approved card: ${await txt('[data-approve-card]')}`);
  ok(/Any change to the outline removes the approval\. Approve it again after\./.test(await txt('[data-approve-card]')), 'approved card says what an edit does');
  ok(await done05(), 'sidebar: 05 done');
  ok((await reason5()) === '' && (await nextNote()) === '', 'approved: no sidebar reason, no Next note');
  ok(!(await page.$('[data-approve]')), 'no Approve button while approved');

  // 6. A reload keeps it.
  await open(B1);
  ok(!!(await page.$('[data-approved]')) && await done05(), 'reload: still approved');

  // 7. Any edit removes the approval: at once on screen, and on the "server" after the save.
  if (!(await page.$(`${ch(8)} .otl-ch-body`))) await page.click(`${ch(8)} [data-toggle]`);
  await page.fill(`${ch(8)} [data-c][data-f="objective"]`, 'Reader can keep going on stiff or tired days');
  ok(!(await page.$('[data-approved]')) && !!(await page.$('[data-approve]')), 'edit: approval gone on screen');
  ok(!(await done05()), 'edit: 05 not done');
  ok((await reason5()) === 'Approve the outline' && (await nextNote()) === 'Not done yet: approve the outline.', 'edit: the note comes back');
  await settle();
  ok(st.books[B1].outline_approved_at === null, 'saved: cleared on the server too');

  // 8. An edit typed and undone before the save keeps the approval (the server re-read).
  await page.click('[data-check]');
  await checking();
  await page.click('[data-approve]');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('[data-approved]', { timeout: 4000 });
  const t1 = await page.inputValue(`${ch(8)} [data-c][data-f="title"]`);
  await page.fill(`${ch(8)} [data-c][data-f="title"]`, t1 + '!');
  await page.fill(`${ch(8)} [data-c][data-f="title"]`, t1);
  await settle();
  await page.waitForTimeout(300);
  ok(!!(await page.$('[data-approved]')) && await done05() && st.books[B1].outline_approved_at !== null, 'typed and undone: still approved (re-read)');

  // 9. No warnings: "Approve outline?" with Cancel / Approve outline. Out of date: a line, not a warning.
  st.books[B1].outline_approved_at = null;
  globalThis.__modes.checkOut = 'none';
  await open(B1);
  await page.click('[data-check]');
  await checking();
  ok((await txt('[data-approve-text]')) === 'Writing follows this structure.', `no warnings card: ${await txt('[data-approve-text]')}`);
  await page.click('[data-approve]');
  ok((await txt('dialog[open] h2')) === 'Approve outline?' && (await lines()).length === 0, 'no warnings: Approve outline?, no lines');
  ok((await txt('dialog[open] [data-close]')) === 'Cancel' && (await txt('dialog[open] [data-confirm]')) === 'Approve outline', 'buttons: Cancel / Approve outline');
  await page.click('dialog[open] [data-close]');
  if (!(await page.$(`${ch(2)} .otl-ch-body`))) await page.click(`${ch(2)} [data-toggle]`);
  await page.fill(`${ch(2)} [data-c][data-f="title"]`, 'Setting Up Your Chair');
  await page.click('[data-approve]');
  ok((await txt('dialog[open] h2')) === 'Approve outline?' && JSON.stringify(await lines()) === JSON.stringify(['info: AI check is out of date']), `out of date: ${JSON.stringify(await lines())}`);
  await page.click('dialog[open] [data-close]');
  await settle();
  globalThis.__modes.checkOut = '';

  // 10. Structure changes remove it: add a section, reorder, regenerate.
  const approve = async () => { await page.click('[data-approve]'); await page.click('dialog[open] [data-confirm]'); await page.waitForSelector('[data-approved]', { timeout: 4000 }); };
  await approve();
  await page.click(`${ch(2)} [data-add-section]`);
  await page.waitForTimeout(300);
  ok(!(await page.$('[data-approved]')) && st.books[B1].outline_approved_at === null, 'add section: removed');
  await page.click(`${ch(2)} .otl-sec:last-child [data-del-section]`);
  await page.click('dialog[open] [data-confirm]');
  await page.waitForTimeout(300);
  await approve();
  await page.focus(`${ch(1)} [data-handle]`);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(400);
  ok(!(await page.$('[data-approved]')) && st.books[B1].outline_approved_at === null, 'reorder: removed');
  await approve();
  await page.click('[data-top] [data-generate]');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForFunction(() => !document.querySelector('[data-stop]'), null, { timeout: 8000 });
  ok(!(await page.$('[data-approved]')) && !(await done05()), 'regenerate: removed');

  // 11. Disabled with a reason: untitled chapter, unlocked positioning, no chapters.
  await page.click('[data-list] [data-add-chapter]');
  await page.waitForTimeout(400);
  ok(await page.$eval('[data-approve]', (b) => b.disabled) && (await txt('[data-approve-why]')) === 'Chapter 9 has no title. Every chapter needs one.', `untitled: ${await txt('[data-approve-why]')}`);
  await open(B4);
  ok(await page.$eval('[data-approve]', (b) => b.disabled) && (await txt('[data-approve-why]')) === 'Lock the positioning in 03 first.', 'unlocked: disabled, says why');
  await open(B2);
  ok(await page.$eval('[data-approve]', (b) => b.disabled) && (await txt('[data-approve-why]')) === 'Add a chapter first.', 'no chapters: disabled, says why');

  // 12. Errors stay in the dialog; Approve again works.
  st.outline[B1].forEach((c) => { if (c.kind === 'chapter') c.title = c.title || 'Questions Readers Ask'; });
  await open(B1);
  globalThis.__modes.approveError = 'network';
  await page.click('[data-approve]');
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('dialog[open] [data-error]:not([hidden])', { timeout: 3000 });
  ok((await txt('dialog[open] [data-error]')) === 'We couldn’t approve the outline. Check your connection, then try again.', `network: ${await txt('dialog[open] [data-error]')}`);
  globalThis.__modes.approveError = 'chapter_untitled';
  await page.click('dialog[open] [data-confirm]');
  await page.waitForTimeout(300);
  ok((await txt('dialog[open] [data-error]')) === 'Every chapter needs a title. Chapter 9 has no title.', `untitled from the server: ${await txt('dialog[open] [data-error]')}`);
  globalThis.__modes.approveError = '';
  await page.click('dialog[open] [data-confirm]');
  await page.waitForSelector('[data-approved]', { timeout: 4000 });
  ok(await done05(), 'approved after the errors');

  // 13. Needs review (B4 relocked): approving clears the chapters' marks and the note.
  st.books[B4].pos.locked_at = new Date().toISOString();
  await open(B4);
  ok(!!(await page.$('[data-review-note]')), 'needs review note before');
  await approve();
  ok(!(await page.$('[data-review-note]')) && !(await page.$$eval('[data-pills]', (ps) => ps.some((p) => /Needs review/.test(p.innerText)))), 'approve clears Needs review on screen');
  ok(st.outline[B4].every((c) => !c.needs_review), 'and on the "server"');
  return log.join('\n');
};
