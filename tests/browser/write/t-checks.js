// Step 06 Write (E10.4): the Checks tab (designs 22, 22c). The code checks
// while typing (debounced), Show, the tab count (never the words row), the AI
// check (mock.js window.__chk answers it): never run, Checking, findings with
// Fix with Improve (no AI call until an action), an objective gap with no Fix,
// pass / skipped / unclear rows, quote gone, out of date (a save, an unlock, a
// voice change), Save and check (autosave paused until the call is sent),
// errors and limits, every locked reason, under 50 and over 6,000 words,
// Research numbers, open marks, the Needs review button, a load error, and
// Final with warnings. Screenshots at 1440 and 900 px.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver, .wr-panel .wr-soon', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms });
  const checksTab = async () => { await page.click('[data-tab="checks"]'); await page.waitForSelector('.wr-panel .wr-chk', { timeout: 5000 }); };
  const chks = () => g(() => window.__chk.requests.map((r) => r.body));
  const reply = (status, body) => g(([s, b]) => window.__chk.reply(s, b), [status, body]);
  const selected = () => g(() => getSelection().toString().replace(/\s+/g, ' ').trim());
  const tabLabel = () => txt('[data-tab="checks"]');
  const rowText = (code) => txt(`[data-chk-row="${code}"]`);
  const caretEnd = () => g(() => {
    const ed = document.querySelector('[data-editor]');
    ed.focus();
    let t = ed;
    while (t.lastElementChild && t.lastElementChild.tagName !== 'BR' && t.lastElementChild.isContentEditable) t = t.lastElementChild;
    const r = document.createRange();
    r.selectNodeContents(t);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  /** Puts the caret right after the first place `s` is in the editor's text. */
  const caretAfter = (s) => g((s) => {
    const ed = document.querySelector('[data-editor]');
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const i = t.nodeValue.indexOf(s);
      if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(t, i + s.length); r.collapse(true); const x = getSelection(); x.removeAllRanges(); x.addRange(r); return; }
    }
    throw new Error(`not in the editor: ${s}`);
  }, s);
  /** The fingerprint the server would save for a section now (js/section-check-key.js, same as the function). */
  const keyOf = (sid, bid = W1) => {
    const { c, s } = st.sectionOf(sid);
    return g((p) => window.kdpSectionCheckKey(p), { versionId: s.current_version_id, kind: c.kind, chapterTitle: c.title, objective: c.objective, sectionTitle: s.title,
      lockedAt: st.books[bid].pos ? st.books[bid].pos.locked_at : null, penName: 'Nora Hale', voice: st.penVoice });
  };
  /** The server's reply (and its saved row, so a reload shows it). */
  const result = async (sid, findings, areas, bid = W1) => {
    const req = (await chks()).slice(-1)[0];
    const body = { stage: 'section_check', findings, areas, words: 77, version_id: req.baseVersionId, checked_at: new Date().toISOString(), inputs_key: await keyOf(sid, bid) };
    st.checks[sid] = { version_id: body.version_id, findings, areas, words: 77, inputs_key: body.inputs_key, checked_at: body.checked_at };
    await reply(200, body);
  };
  const shots = async (name) => {
    await page.screenshot({ path: `${SHOTS}/t-checks-${name}-1440.png` });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(250);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    await page.evaluate(() => { const p = document.querySelector('.wr-side'); if (p) p.scrollIntoView({ block: 'start' }); });
    await page.screenshot({ path: `${SHOTS}/t-checks-${name}-900.png` });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(250);
    return sideways;
  };
  const VOICE_Q = 'Keep your neck long and your *chin* level.';
  const DRIFT_Q = 'If anything pinches, make the circle smaller.';
  const FINDINGS = [
    { type: 'voice', message: 'This sentence is long and formal. Split it and speak to the reader as "you".', quote: VOICE_Q },
    { type: 'drift', message: 'This adds a promise about pain the locked positioning does not make.', quote: DRIFT_Q },
    { type: 'objective', message: 'The title promises both ways, but the text never shows the forward roll.', quote: '' }
  ];
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. Code checks on open (4.2, design 22): the 40% claim, the words row (info), the tab count.
  await open(W1, st.s42);
  ok((await tabLabel()) === 'Checks 1', `tab count 1 (the claim; never the words row): "${await tabLabel()}"`);
  // The number is aria-hidden; the tab's accessible name carries it.
  const tabName = () => page.$eval('[data-tab="checks"]', (b) => [b.getAttribute('aria-label'), b.querySelector('.count') ? b.querySelector('.count').getAttribute('aria-hidden') : null]);
  ok(JSON.stringify(await tabName()) === JSON.stringify(['Checks, 1 to review', 'true']), `accessible name: ${JSON.stringify(await tabName())}`);
  ok(await page.getByRole('tab', { name: 'Checks, 1 to review', exact: true }).count() === 1, 'found by role and name: "Checks, 1 to review"');
  await checksTab();
  ok((await txt('.wr-chk-group:first-child .chip-label')) === 'IN YOUR TEXT', 'group: IN YOUR TEXT');
  ok((await rowText('number')) === '"40%" has no source Add a source in 02 Research, or mark it. Show', `number row: "${await rowText('number')}"`);
  ok((await rowText('words')) === '77 of 450 words Under 80% of the target.', `words row: "${await rowText('words')}"`);
  ok(await page.$eval('[data-chk-row="words"] .wr-chk-ico', (i) => !i.classList.contains('is-warn')) && await page.$eval('[data-chk-row="number"] .wr-chk-ico', (i) => i.classList.contains('is-warn')),
    'the words row has the info icon, the claim the warning icon');
  await page.click('[data-chk-row="number"] [data-chk-show]');
  ok((await selected()) === 'Studies show shoulder rolls cut neck pain by 40%.', `Show selects the claim: "${await selected()}"`);
  // AI never run.
  ok(/^AI CHECK AI Checks the saved version against the chapter objective, your pen name’s voice and the locked positioning\. Run AI check$/.test(await txt('.wr-chk-group:last-child')), `never run: "${await txt('.wr-chk-group:last-child')}"`);
  ok(!(await page.$eval('[data-chk-run]', (b) => b.disabled)), 'Run AI check is on');
  const small = await g(() => [...document.querySelectorAll('.wr-panel button')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()));
  ok(small.length === 0, `every panel button is 44 px tall (Show and Check again too): ${JSON.stringify(small)}`);

  // 2. The AI check on a clean section: no save first; Checking; the result.
  const saves0 = st.writes.filter((w) => w.fn === 'save_version').length;
  await page.click('[data-chk-run]');
  await until(() => window.__chk.requests.length === 1);
  const r1 = (await chks())[0];
  const v3 = st.sectionOf(st.s42).s.current_version_id;
  ok(JSON.stringify(r1) === JSON.stringify({ stage: 'section_check', bookId: W1, sectionId: st.s42, baseVersionId: v3 }), `request: ${JSON.stringify(r1)}`);
  ok(st.writes.filter((w) => w.fn === 'save_version').length === saves0, 'nothing typed: no version first');
  ok((await txt('.wr-chk-run')) === 'Checking…' && await page.$eval('.wr-chk-run', (b) => b.disabled) && /You can keep writing\./.test(await txt('.wr-chk-group:last-child')), 'Checking: the button off, the status line');
  ok(await has('.wr-chk-group:last-child .skel'), 'Checking: skeleton rows');
  await result(st.s42, FINDINGS, { objective: 'issues', voice: 'issues', drift: 'issues' });
  await page.waitForSelector('[data-chk-finding="2"]', { timeout: 5000 });
  ok(/^AI check of v3 · just now Check again$/.test(await txt('.wr-chk-meta')), `meta: "${await txt('.wr-chk-meta')}"`);
  ok((await txt('[data-chk-finding="0"]')) === `VOICE ${FINDINGS[0].message} “Keep your neck long and your chin level.” Fix with Improve`, `voice finding, the quote as plain text: "${await txt('[data-chk-finding="0"]')}"`);
  ok((await txt('[data-chk-finding="1"] .wr-chk-type')) === 'DRIFT', 'drift finding');
  const gap = await txt('[data-chk-finding="2"]');
  ok(gap === `OBJECTIVE ${FINDINGS[2].message} MISSING FROM THE TEXT Nothing to select. Add this part yourself.` && !(await has('[data-chk-finding="2"] [data-chk-fix]')), `objective gap, no Fix, no Generate in the hint: "${gap}"`);
  ok((await tabLabel()) === 'Checks 4', `tab count = 1 claim + 3 findings: "${await tabLabel()}"`);
  ok((await tabName())[0] === 'Checks, 4 to review', `accessible name follows the count: "${(await tabName())[0]}"`);
  ok(!(await has('[data-chk-area]')), 'no pass rows when every area has issues');
  ok(await shots('result') === false, 'result: no sideways scroll at 900 px');

  // 3. Fix with Improve: the quote is selected, the Improve menu opens, no AI call.
  const imps0 = await g(() => window.__imp.requests.length);
  await page.click('[data-chk-fix="0"]');
  await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
  ok((await selected()) === 'Keep your neck long and your chin level.', `Fix selects the quote's sentence: "${await selected()}"`);
  ok(await g(() => window.__imp.requests.length) === imps0 && (await chks()).length === 1, 'no AI call until an action is picked');
  ok(await g(() => document.querySelector('[data-imp-open]').getAttribute('aria-expanded') === 'true'), 'the menu opens at the toolbar Improve button');
  await page.keyboard.press('Escape');
  ok(!(await has('[data-imp-menu]')), 'Esc closes the menu');

  // 4. Quote gone and out of date: the writer changes the quoted sentence.
  await g((q) => {
    const ed = document.querySelector('[data-editor]');
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const i = t.nodeValue.indexOf(q);
      if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + q.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; }
    }
  }, 'If anything pinches');
  await page.keyboard.type('When something hurts');
  await page.waitForTimeout(700);
  ok(/Out of date\. The text, the chapter, the positioning or the voice changed since this check\./.test(await txt('.wr-chk-group:last-child')), 'typing: Out of date');
  ok(await page.$eval('[data-chk-fix="1"]', (b) => b.disabled) && /This text is no longer in the section\./.test(await txt('[data-chk-finding="1"]')), 'quote gone: Fix off with the reason');
  ok(!(await page.$eval('[data-chk-fix="0"]', (b) => b.disabled)), 'Fix still works where the quote is still in the text');
  ok(await page.$eval('[data-chk-finding="0"]', (f) => f.classList.contains('is-old')), 'out of date findings are muted');
  ok((await tabLabel()) === 'Checks 1', `out of date findings are not counted: "${await tabLabel()}"`);
  await page.click('[data-save-version]');
  await until(() => /Saved as v4/.test((document.querySelector('[data-foot]') || {}).innerText || ''));
  await page.waitForTimeout(300);
  ok(/Out of date\./.test(await txt('.wr-chk-group:last-child')), 'saved as v4: still out of date (another version)');
  // After Save version, Generate and Improve are on again (before E10.4 they stayed off until the next redraw).
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)) && !/turns on when the section is ready/.test(await txt('[data-imp-hint]') || ''), 'after Save version: Generate on, no "Improve turns on" hint');

  // 5. Live code checks: debounced; the opener and the repeated phrase; Show. Typed into the
  // first paragraph (openers are checked in paragraphs, not list items).
  await caretAfter('neck pain by 40%.');
  await page.keyboard.type(' You sit tall. You breathe out. You roll back. Now roll your shoulders up. Then roll your shoulders back. Again roll your shoulders down.');
  ok(!(await has('[data-chk-row="opener"]')), 'right after typing: not yet (400 ms debounce)');
  await page.waitForTimeout(700);
  ok((await rowText('opener')) === '3 sentences in a row start with "You". Show', `opener row: "${await rowText('opener')}"`);
  ok((await rowText('repeat')) === '"roll your shoulders" used 3 times Show', `repeat row (3+ words): "${await rowText('repeat')}"`);
  ok((await tabLabel()) === 'Checks 3', `tab count 3 (claim, opener, repeat): "${await tabLabel()}"`);
  await page.click('[data-chk-row="opener"] [data-chk-show]');
  ok((await selected()) === 'You sit tall. You breathe out. You roll back.', `Show selects the 3 sentences: "${await selected()}"`);

  // 6. Save and check: Cancel sends nothing; Save and check saves first; the editor is read only and
  // autosave paused until the call is sent (G3 P3: typing in that window can never be lost).
  await caretEnd();
  await page.keyboard.type(' Rest.');
  await page.click('[data-chk-run]');
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 3000 });
  ok((await txt('dialog[open] #wrAskTitle')) === 'Save a version first?' && /The AI check reads the saved version\. Your typing becomes v5, then the check runs on it\./.test(await txt('dialog[open] [data-ask-text]')), `confirm: "${await txt('dialog[open] [data-ask-text]')}"`);
  ok((await txt('dialog[open] [data-ask-yes]')) === 'Save and check' && (await txt('dialog[open] [data-ask-no]')) === 'Cancel', 'buttons: Save and check, Cancel');
  const savesA = st.writes.filter((w) => w.fn === 'save_version').length;
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(300);
  ok((await chks()).length === 1 && st.writes.filter((w) => w.fn === 'save_version').length === savesA, 'Cancel: no version, no call');
  modes.versionDelay = 900;
  await page.click('[data-chk-run]');
  await page.waitForSelector('dialog[open] [data-ask-yes]', { timeout: 3000 });
  const t0 = Date.now();
  await page.click('dialog[open] [data-ask-yes]');
  await page.waitForTimeout(150);
  const edState = () => g(() => { const ed = document.querySelector('[data-editor]'); return [ed.getAttribute('contenteditable'), ed.getAttribute('aria-readonly')]; });
  ok(JSON.stringify(await edState()) === '["false","true"]', `read only while the version saves, as during Accept: ${JSON.stringify(await edState())}`);
  const shown = await g(() => document.querySelector('[data-editor]').innerText);
  await caretEnd();
  await page.keyboard.type(' Done.');
  ok(await g(() => document.querySelector('[data-editor]').innerText) === shown, 'typing while the version saves adds nothing (nothing on screen to lose)');
  await until(() => window.__chk.requests.length === 2, null, 6000);
  modes.versionDelay = 0;
  const sentAt = await g(() => window.__chk.requests[1].at);
  const r2 = (await chks())[1];
  const v5 = st.sectionOf(st.s42).s.current_version_id;
  const tl = st.timeline.filter(([, at]) => at >= t0);
  const saveAt = (tl.find(([w]) => w === 'save_version') || [])[1];
  ok(saveAt && saveAt < sentAt && r2.baseVersionId === v5, `order: save_version (v5) first, then the check on it: ${JSON.stringify(r2)}`);
  ok(!tl.some(([w, at]) => w === 'draft' && at >= saveAt && at <= sentAt), `no draft write between the save and the call (autosave paused): ${JSON.stringify(tl.map(([w, at]) => [w, at - t0]))} sent ${sentAt - t0}`);
  await until(() => document.querySelector('[data-editor]').getAttribute('contenteditable') === 'true', null, 3000);
  ok((await edState())[1] === 'false' && /You can keep writing\./.test(await txt('.wr-chk-group:last-child')), 'editable again once the call is sent ("You can keep writing")');
  // Typed after the call is sent: kept, and sent as a draft.
  await caretEnd();
  await page.keyboard.type(' Done.');
  await page.waitForTimeout(1300);
  ok(st.timeline.some(([w, at]) => w === 'draft' && at > sentAt) && /Done\.$/.test(st.drafts[st.s42] ? st.drafts[st.s42].content : ''), 'typing after the call is sent goes out as a draft');
  // Pass, skipped and unclear rows (and the result is out of date: typed after the save).
  await result(st.s42, [], { objective: 'pass', voice: 'skipped', drift: 'unclear' });
  await page.waitForSelector('[data-chk-area="objective"]', { timeout: 5000 });
  ok((await txt('[data-chk-area="objective"]')) === 'No objective problems found', 'pass row: "No objective problems found" (never "Matches")');
  ok((await txt('[data-chk-area="voice"]')) === 'Voice not checked No voice set for this pen name. Add one in Pen Names to check it.', `skipped: "${await txt('[data-chk-area="voice"]')}"`);
  ok((await txt('[data-chk-area="drift"]')) === 'Drift: the AI could not point to the text. Check again.', `unclear: "${await txt('[data-chk-area="drift"]')}"`);
  ok(!/Matches/.test(await txt('.wr-panel')), 'no "Matches" anywhere');
  ok(/Out of date\./.test(await txt('.wr-chk-group:last-child')), 'typed after the save: out of date at once');
  await page.click('[data-save-version]');
  await until(() => /Saved as v6/.test((document.querySelector('[data-foot]') || {}).innerText || ''));

  // 7. Errors: Try again sends the same body; the limits.
  await page.click('.wr-chk-alert [data-chk-run]');
  await until(() => window.__chk.requests.length === 3);
  await reply(502, { error: 'ai_unavailable' });
  await page.waitForSelector('[data-chk-retry]', { timeout: 3000 });
  ok(/The AI service did not respond\. Nothing was counted in your usage\. Try again/.test(await txt('.wr-chk-group:last-child')), 'error: the message and Try again');
  ok(await shots('error') === false, 'error: no sideways scroll at 900 px');
  await page.click('[data-chk-retry]');
  await until(() => window.__chk.requests.length === 4);
  ok(JSON.stringify((await chks())[3]) === JSON.stringify((await chks())[2]), 'Try again sends the same body');
  await reply(429, { error: 'rate_limited' });
  await page.waitForSelector('[data-chk-retry]', { timeout: 3000 });
  ok(/Too many requests\. Wait a minute, then try again\./.test(await txt('.wr-chk-group:last-child')) && await page.$eval('.wr-chk-group:last-child .alert', (a) => a.classList.contains('alert-warning')), 'rate limit: warning, Try again');
  await page.click('[data-chk-retry]');
  await until(() => window.__chk.requests.length === 5);
  await reply(429, { error: 'monthly_limit' });
  await until(() => /AI allowance/.test((document.querySelector('.wr-chk-group:last-child') || {}).innerText || ''));
  ok(!(await has('[data-chk-retry]')), 'monthly limit: no Try again');
  await page.click('.wr-chk-alert [data-chk-run]');
  await until(() => window.__chk.requests.length === 6);
  await reply(409, { error: 'run_in_progress' });
  await until(() => /being written in another tab/.test((document.querySelector('.wr-chk-group:last-child') || {}).innerText || ''));
  ok(true, 'run_in_progress from the server: the other-tab message');

  // 8. Final with warnings, and the step's state: checks never block (decision 6).
  await page.selectOption('[data-status]', 'final');
  await page.waitForTimeout(400);
  ok(st.writes.some((w) => w.table === 'sections' && w.id === st.s42 && w.body.status === 'final'), 'Final is saved while warnings show');
  ok((await txt('[data-next-note]')) === 'Not done yet: 22 sections not final.', `Final counts (23 → 22); the Next note names only sections: "${await txt('[data-next-note]')}"`);

  // 9. Out of date after an unlock and after a voice change (a reload reads the saved check).
  st.sectionOf(st.s42).s.status = 'draft';
  st.checks[st.s42].inputs_key = await keyOf(st.s42);
  st.checks[st.s42].version_id = st.sectionOf(st.s42).s.current_version_id;
  await open(W1, st.s42);
  await checksTab();
  ok(!/Out of date/.test(await txt('.wr-chk-group:last-child')), 'a reload with the same key: current');
  const lock = st.books[W1].pos.locked_at;
  st.books[W1].pos.locked_at = new Date().toISOString();
  await open(W1, st.s42);
  await checksTab();
  ok(/Out of date/.test(await txt('.wr-chk-group:last-child')), 'a new lock time (unlocked and locked again): out of date');
  st.books[W1].pos.locked_at = lock;
  st.penVoice = { tones: ['warm'], perspective: 'second' };
  await open(W1, st.s42);
  await checksTab();
  ok(/Out of date/.test(await txt('.wr-chk-group:last-child')), 'the pen name’s voice changed: out of date');
  st.penVoice = {};
  // G3 P4: a message with a number with no source shows the step 05 badge; the others none.
  const findings0 = st.checks[st.s42].findings;
  st.checks[st.s42].findings = [{ ...FINDINGS[0], message: 'Studies say 45% of readers skip this. Speak to the reader as "you".', unsourced: ['45'] }, FINDINGS[2]];
  await open(W1, st.s42);
  await checksTab();
  await page.waitForSelector('[data-chk-finding="1"]', { timeout: 5000 });
  ok((await txt('[data-chk-finding="0"] .check-badge.warn')) === 'Verify: no source for 45', `P4: the badge: "${await txt('[data-chk-finding="0"] .check-badge')}"`);
  ok(!(await has('[data-chk-finding="1"] .check-badge')), 'P4: no badge on a message without a number');
  ok(await shots('verify-badge') === false, 'P4 badge: no sideways scroll at 900 px');
  st.checks[st.s42].findings = findings0;

  // 10. Research numbers are known: no number row; with no warnings the tab shows no count.
  st.research.sources = [{ id: 'a1000000-0000-4000-8000-000000000001', kind: 'source', body: 'In a small trial, shoulder rolls cut neck pain by 40%.', citation: 'Neck Trial, 2021', created_at: new Date().toISOString() }];
  st.checks = {};
  await open(W1, st.s42);
  await checksTab();
  await page.waitForTimeout(300);
  ok(!(await has('[data-chk-row="number"]')), 'a number from Research is not flagged');
  ok((await tabLabel()) === 'Checks 2', `tab count: only the opener and the repeat (typed in 5): "${await tabLabel()}"`);
  st.research.sources = [];

  // 11. Open marks; under 50 words; over 6,000 words; an empty section.
  st.addVersion(st.s51, 'The long out-breath calms you. Most people sleep better after a week of it. [Verify: no source] Breathe out for twice as long as you breathe in.', 'manual');
  await open(W1, st.s51);
  await checksTab();
  ok((await rowText('marks')) === '1 claim needs a source Most people sleep better after a week of it. Show', `open marks: "${await rowText('marks')}"`);
  await page.click('[data-chk-row="marks"] [data-chk-show]');
  ok(/^Most people sleep better after a week of it\./.test(await selected()), `Show selects the marked sentence: "${await selected()}"`);
  ok(await page.$eval('[data-chk-run]', (b) => b.disabled) && /Write at least 50 words to run the AI check\./.test(await txt('#wrChkWhy')), 'under 50 words: off with the reason');
  st.addVersion(st.s52, Array.from({ length: 1220 }, (_, i) => `Breathe in for ${i % 4 + 1}, hold.`).join(' '), 'manual');
  await open(W1, st.s52);
  await checksTab();
  ok(await page.$eval('[data-chk-run]', (b) => b.disabled) && /The AI check reads up to 6,000 words\. This section has 6,100\./.test(await txt('#wrChkWhy')), `over 6,000: "${await txt('#wrChkWhy')}"`);
  await open(W1, st.s43);
  await checksTab();
  ok(/^IN YOUR TEXT Nothing to check yet\. Start writing this section\./.test(await txt('.wr-chk')), 'empty section: nothing to check yet');
  ok(await page.$eval('[data-chk-run]', (b) => b.disabled), 'empty section: AI check off');
  ok(JSON.stringify(await tabName()) === JSON.stringify(['Checks', null]) && (await tabLabel()) === 'Checks', `count 0: no number, the name is just "Checks": ${JSON.stringify(await tabName())}`);
  ok(await shots('empty') === false, 'empty: no sideways scroll at 900 px');

  // 12. Locked: Generate running here, another tab, a conflict, the positioning.
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length >= 1);
  await page.waitForTimeout(300);
  ok(/Wait for the section to finish writing\./.test(await txt('#wrChkWhy') || ''), `Generate here: "${await txt('#wrChkWhy')}"`);
  await g(() => window.__gen.send('start', { runId: 'a0000000-0000-4000-8000-000000000099', aim: 500, target: 500, mode: 'write', recovered: null }));
  const vg = st.addVersion(st.s43, 'Hold your arms out to the sides, just below shoulder height.', 'generate');
  await g((id) => { window.__gen.send('done', { reason: 'complete', partial: false, counted: true }); window.__gen.send('saved', { versionId: id, versionNo: 1, words: 11, current: true, partial: false, conflict: false, flagged: 0 }); window.__gen.close(); }, vg.id);
  await until(() => /Saved as v1/.test((document.querySelector('[data-foot]') || {}).innerText || ''));
  const now = Date.now();
  st.runs[st.s42] = { run_id: 'b0000000-0000-4000-8000-000000000001', state: 'running', end_reason: null, version_id: null, started_at: new Date(now - 5000).toISOString(), heartbeat_at: new Date(now - 1000).toISOString(), stop_requested_at: null, ended_at: null };
  await open(W1, st.s42);
  await checksTab();
  ok(/This section is being written in another tab or window\./.test(await txt('#wrChkWhy') || ''), `another tab: "${await txt('#wrChkWhy')}"`);
  delete st.runs[st.s42];
  await open(W5, st.c11);
  await checksTab();
  ok(/Choose which text to keep first\./.test(await txt('#wrChkWhy') || ''), `conflict: "${await txt('#wrChkWhy')}"`);
  await page.click('[data-keep-saved]');
  await page.waitForTimeout(500);
  await open(W6, st.w6s);
  await checksTab();
  ok(/Lock the positioning in 03 to run the AI check\./.test(await txt('#wrChkWhy') || '') && await has('#wrChkWhy a[data-go-step="3"]'), 'positioning not locked: the reason and a link to 03');
  // The Needs review alert's button is off with the same reason.
  ok(await page.$eval('[data-chk-review]', (b) => b.disabled) && /Lock the positioning in 03/.test(await txt('#wrChkReviewWhy')), 'Needs review button: off while unlocked');
  ok(await has('[data-chk-row]') || /IN YOUR TEXT/.test(await txt('.wr-chk')), 'code checks still run while locked');

  // 13. Needs review with a locked positioning: "Run AI check" opens the tab and runs.
  st.sectionOf(st.s42).s.needs_review = true;
  await open(W1, st.s42);
  ok(await has('.wr-note [data-chk-review]') && !(await page.$eval('[data-chk-review]', (b) => b.disabled)), 'Needs review alert: Run AI check');
  await page.click('[data-tab="versions"]');
  const n0 = (await chks()).length;
  await page.click('[data-chk-review]');
  await until((n) => window.__chk.requests.length === n + 1, n0);
  ok(await page.$eval('[data-tab="checks"]', (b) => b.getAttribute('aria-selected') === 'true'), 'it opens the Checks tab and sends the check');
  await result(st.s42, [FINDINGS[0]], { objective: 'pass', voice: 'issues', drift: 'pass' });
  await page.waitForSelector('[data-chk-area="drift"]', { timeout: 5000 });
  ok((await txt('[data-chk-area="drift"]')) === 'No drift found' && (await txt('[data-chk-area="objective"]')) === 'No objective problems found', 'pass rows');
  ok(await shots('needs-review') === false, 'needs review: no sideways scroll at 900 px');
  st.sectionOf(st.s42).s.needs_review = false;

  // 14. Fix off while a suggestion is open (Improve's own reason).
  await page.click('[data-chk-fix="0"]');
  await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
  await page.click('[data-imp-act="improve"]');
  await until(() => window.__imp.requests.length >= 1);
  const ireq = await g(() => window.__imp.requests.slice(-1)[0].body);
  st.suggestions['5a000000-0000-4000-8000-000000000001'] = { id: '5a000000-0000-4000-8000-000000000001', section_id: ireq.sectionId, action: 'improve', selection: ireq.selection, output: 'Keep your neck long and your chin level, always.', base_version_id: ireq.baseVersionId, used_at: null, created_at: new Date().toISOString() };
  await g((b) => window.__imp.reply(200, b), { stage: 'section_improve', suggestionId: '5a000000-0000-4000-8000-000000000001', action: 'improve', text: 'Keep your neck long and your chin level, always.', words: { before: 8, after: 9 }, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null } });
  await until(() => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard === 'review');
  await page.waitForTimeout(200);
  ok(await page.$eval('[data-chk-fix="0"]', (b) => b.disabled) && /Accept or reject the suggestion first\./.test(await txt('[data-chk-finding="0"]')), 'a suggestion open: Fix off with Improve’s reason');
  await page.click('[data-imp-reject]');
  await page.waitForTimeout(300);
  ok(!(await page.$eval('[data-chk-fix="0"]', (b) => b.disabled)), 'after Reject: Fix is on again');

  // 15. A load error, then Try again.
  modes.checkLoadError = true;
  await open(W1, st.s42);
  await checksTab();
  ok(/We couldn’t load the last AI check\. Try again/.test(await txt('.wr-chk-group:last-child')), 'load error: the message and Try again');
  modes.checkLoadError = false;
  await page.click('[data-chk-reload]');
  await page.waitForSelector('[data-chk-finding="0"]', { timeout: 5000 });
  ok(true, 'Try again loads the saved check');

  return log.join('\n');
};
