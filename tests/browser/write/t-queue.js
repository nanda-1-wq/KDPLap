// Step 06 Write (PRODUCE G5, design 22d, 6 to 10b): the Fix major queue. The N rule
// and the cost line, the button off with Improve's reason, an item as Custom
// pre-filled (Send / Skip / Stop), Keep as is on a waiting item, the editor
// read only only while a call runs, the suggestion (Accept / Reject / Stop), an
// item whose quote is gone after an earlier Accept (skipped, no call), an item
// under 3 words (skipped), no changes suggested, a lost connection and Try
// again, too many requests, the month limit, Stop before Send, during the call
// and on the suggestion, the end card and Close, and leaving the section.
// Screenshots at 1440 and 900 px.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
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
  const ai = () => txt('.wr-chk-group:last-child');
  const card = () => g(() => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard || null);
  const cardIs = (name) => until((n) => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard === n, name);
  const live = () => txt('[data-live]');
  const imps = () => g(() => window.__imp.requests.length);
  const lastReq = () => g(() => window.__imp.requests.slice(-1)[0].body);
  const rows = () => g(() => [...document.querySelectorAll('.wr-q-list li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()));
  const edState = () => g(() => document.querySelector('[data-editor]').getAttribute('contenteditable'));
  const focused = () => g(() => { const a = document.activeElement; return a ? [...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => x.name).join(' ') : ''; });
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const S = st.s42;
  const keyOf = (sid) => {
    const { c, s } = st.sectionOf(sid);
    return g(([p, secs]) => window.kdpSectionCheckKey({ ...p, siblings: window.kdpSectionCheckKey.siblings(p.kind, secs, p.sid) }),
      [{ sid, versionId: s.current_version_id, kind: c.kind, chapterTitle: c.title, objective: c.objective, sectionTitle: s.title,
        lockedAt: st.books[W1].pos.locked_at, penName: 'Nora Hale', voice: st.penVoice, wordTarget: s.word_target },
       c.sections.map((x) => ({ id: x.id, title: x.title }))]);
  };
  const seed = async (findings, areas = { objective: 'issues', voice: 'issues', drift: 'issues' }) => {
    st.checks[S] = { version_id: st.sectionOf(S).s.current_version_id, findings, areas, words: 77, inputs_key: await keyOf(S), checked_at: '2026-10-16T10:00:00.123456+00:00' };
  };
  let sg = 0;
  /** The server's suggestion for the last request (and its 0021 row, so Accept can apply it). */
  const suggest = async (text) => {
    const req = await lastReq();
    const id = `5c000000-0000-4000-8000-${String(++sg).padStart(12, '0')}`;
    st.suggestions[id] = { id, section_id: req.sectionId, action: 'custom', selection: req.selection, output: text, base_version_id: req.baseVersionId, used_at: null, created_at: new Date().toISOString() };
    await g((b) => window.__imp.reply(200, b), { stage: 'section_improve', suggestionId: id, action: 'custom', text, words: { before: 0, after: 0 }, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null } });
  };
  const shots = async (name) => {
    await page.screenshot({ path: `${SHOTS}/t-queue-${name}-1440.png` });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(250);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    await page.evaluate(() => { const p = document.querySelector('[data-imp]'); if (p) p.scrollIntoView({ block: 'start' }); });
    await page.screenshot({ path: `${SHOTS}/t-queue-${name}-900.png` });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(250);
    return sideways;
  };

  // 4.2 with a short paragraph ("Rest now.": 2 words).
  const TEXT = '## Shoulder rolls, both ways\n\nShoulder rolls ease the stiffness that builds up after long hours of sitting. Studies show shoulder rolls cut neck pain by 40%.\n\nNow lift your shoulders up toward your ears, then roll them back and down in a slow circle. Do this **five times**. Keep your neck long and your *chin* level. If anything pinches, make the circle smaller.\n\nRest now.\n\n- Sit near the front of your chair\n- Keep both feet flat on the floor';
  st.addVersion(S, TEXT, 'manual');
  // keyOf runs in the page: load the app once first (a fresh session starts on about:blank).
  await open(W1, S);
  const OBJ_Q = 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle.';
  const F = [
    { type: 'voice', message: 'This sentence is long and formal.', quote: 'Keep your neck long and your *chin* level.' },
    { type: 'objective', message: 'The title promises both ways, but the forward roll has no count. Say how many times.', quote: OBJ_Q },
    { type: 'objective', message: 'This part is about neck turns, which 4.1 covers.', quote: 'roll them back and down in a slow circle' },
    { type: 'drift', message: 'Weight loss is not in the Brief or the locked positioning. Cut it, or tie it to moving safely.', quote: 'If anything pinches, make the circle smaller.' },
    { type: 'objective', message: 'Say how long to rest.', quote: 'Rest now.' },
    { type: 'objective', message: 'The safety note comes after the steps. Move it before the first roll.', quote: 'Sit near the front of your chair' },
    { type: 'objective', message: 'The text never shows the forward roll.', quote: '' }
  ];
  await seed(F);
  await page.setViewportSize({ width: 1440, height: 960 });

  // ── 6. "Fix major (5)" and the cost line ──
  await open(W1, S);
  await checksTab();
  ok((await txt('[data-chk-fixmajor]')) === 'Fix major (5)', `N = major with a quote in the text, not a gap: "${await txt('[data-chk-fixmajor]')}"`);
  ok((await txt('.wr-chk-cost')) === 'Up to 5 AI calls, about $0.01 to $0.02 each.' && await page.$eval('[data-chk-fixmajor]', (b) => b.getAttribute('aria-describedby')) === 'wrChkCost', 'the cost line, read with the button');
  ok((await txt('[data-tab="checks"]')) === 'Checks 7', `count: the claim + 6 major (gap too), no minor: "${await txt('[data-tab="checks"]')}"`);
  ok(await shots('button') === false, 'button: no sideways scroll at 900 px');
  // Off with Improve's own reason while a suggestion is open.
  await page.click('[data-chk-fold="minor"]');
  await page.click('[data-chk-fix="0"]');
  await page.waitForSelector('[data-imp-send]', { timeout: 3000 });
  await page.click('[data-imp-send]');
  await until(() => window.__imp.requests.length === 1);
  await suggest('Keep your neck long and your chin level, always.');
  await cardIs('review');
  await page.waitForTimeout(200);
  ok(await page.$eval('[data-chk-fixmajor]', (b) => b.disabled) && (await txt('#wrChkFixWhy')) === 'Accept or reject the suggestion first.', 'a suggestion open: Fix major off, with Improve\'s reason');
  await page.click('[data-imp-reject]');
  await page.waitForTimeout(300);
  ok(!(await page.$eval('[data-chk-fixmajor]', (b) => b.disabled)), 'after Reject: on again');

  // ── 7a. The queue starts: item 1 as Custom, pre-filled ──
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  ok(await imps() === 1, 'starting sends nothing');
  ok((await txt('.wr-q .chip-label')) === 'FIX MAJOR · 1 OF 5' && (await txt('.wr-q-cost')) === 'Up to 5 AI calls, about $0.01 to $0.02 each.', 'label and cost line');
  ok(JSON.stringify(await rows()) === JSON.stringify(['1 Objective Now', '2 Objective Waiting', '3 Drift Waiting', '4 Objective Waiting', '5 Objective Waiting']), `queue in text order: ${JSON.stringify(await rows())}`);
  ok((await txt('#wrImpTitle')) === 'Fix 1 of 5: objective' && (await txt('.wr-q .wr-imp-passage')) === OBJ_Q, 'title and passage');
  const ask = () => g(() => { const b = document.querySelector('[data-q-ask]'); return { v: b.value, at: b.selectionStart, focus: document.activeElement === b, n: document.querySelector('[data-q-count]').innerText }; });
  const a1 = await ask();
  ok(a1.v === F[1].message && a1.focus && a1.at === F[1].message.length && a1.n === `${F[1].message.length} / 300`, `pre-filled, focused, cursor at the end: ${JSON.stringify(a1)}`);
  ok((await txt('.wr-q .wr-imp-actions')) === 'Send Skip Stop' && (await txt('.wr-q .wr-imp-small')) === 'Skip moves to the next item. Nothing is sent. Stop ends Fix major; accepted changes stay.', 'Send, Skip, Stop and the line under them');
  ok(await g(() => !!(window.CSS && CSS.highlights && CSS.highlights.has('kdp-improve'))), 'the passage is highlighted in the editor');
  ok((await edState()) === 'true', 'between calls the editor is editable');
  ok(/^AI CHECK AI Fixing 1 of 5/.test(await ai()) && await has('[data-chk-finding="1"].is-now .wr-chk-now'), 'panel: "Fixing 1 of 5", the item marked "Fixing now"');
  ok(await page.$eval('[data-chk-fix="3"]', (b) => b.disabled) && /Finish or stop Fix major first\./.test(await txt('[data-chk-finding="3"]')), 'waiting items: Fix off, "Finish or stop Fix major first."');
  ok(!(await has('.wr-chk-alert')) && !(await has('[data-chk-fixmajor]')), 'no Out of date, no Fix major button while it runs');
  ok(await page.$eval('[data-generate]', (b) => b.disabled) && /Finish or stop Fix major first\./.test(await txt('[data-imp-hint]')), 'Generate and Improve wait for the queue');
  ok(await shots('item') === false, 'item: no sideways scroll at 900 px');
  // Keep as is on a waiting item takes it out ("1 of 4").
  await page.click('[data-chk-keep="5"]');
  await until(() => (document.querySelector('.wr-q .chip-label') || {}).innerText === 'FIX MAJOR · 1 OF 4');
  ok((await rows()).length === 4 && st.writes.some((w) => w.table === 'kept_findings' && w.body && w.body.quote === F[5].quote), 'Keep as is on item 5: saved, out of the queue ("1 of 4")');

  // Send: one Custom request with the edited words; read only while it runs.
  await page.click('[data-q-ask]');
  await page.keyboard.press('End');
  await page.keyboard.type(' Use one count.');
  await page.click('[data-q-send]');
  await until(() => window.__imp.requests.length === 2);
  const r1 = await lastReq();
  ok(r1.action === 'custom' && r1.instruction === `${F[1].message} Use one count.` && r1.selection === OBJ_Q, `the request: ${JSON.stringify({ action: r1.action, instruction: r1.instruction, selection: r1.selection })}`);
  await cardIs('q-loading');
  ok((await edState()) === 'false' && (await txt('#wrImpTitle')) === 'Fixing 1 of 4…', 'while the call runs: the editor read only, "Fixing 1 of 4…"');
  await suggest('Lift your shoulders up, then roll them back and down five times.');
  await cardIs('q-review');
  ok((await edState()) === 'true', 'the reply is in: editable again');

  // ── 7b. The suggestion: Accept / Reject / Stop ──
  ok((await txt('#wrImpTitle')) === 'Fix 1 of 4: 18 → 12 words' && await has('.wr-q [data-imp-diff] del') && await has('.wr-q [data-imp-diff] ins'), `title and diff: "${await txt('#wrImpTitle')}"`);
  ok(await has('.wr-q [data-imp-accept]') && await has('.wr-q [data-imp-reject]') && await has('.wr-q [data-q-stop]') && !(await has('.wr-q [data-imp-again]')), 'Accept, Reject, Stop; no Try again');
  ok((await txt('.wr-q p.wr-imp-small')) === 'Accept saves a new version, then item 2 opens. Reject keeps your text and moves to item 2.', 'the line under the buttons');
  ok(await shots('suggestion') === false, 'suggestion: no sideways scroll at 900 px');

  // ── 8. Accept: item 2's quote was in item 1's passage, so it is skipped with no call ──
  await page.click('[data-imp-accept]');
  await cardIs('q-item');
  ok(st.writes.filter((w) => w.fn === 'apply_suggestion').length === 1 && await imps() === 2, 'Accept saved a version; nothing sent for item 2');
  ok(JSON.stringify(await rows()) === JSON.stringify(['1 Objective Accepted', '2 Objective Its text changed after an earlier Accept. Skipped', '3 Drift Now', '4 Objective Waiting']), `queue: ${JSON.stringify(await rows())}`);
  ok((await txt('.wr-q .chip-label')) === 'FIX MAJOR · 3 OF 4' && (await txt('#wrImpTitle')) === 'Fix 3 of 4: drift', 'item 3 opens');
  ok((await live()) === 'Accepted. Saved as a new version. Item 2 skipped. Its text changed after an earlier Accept. Fix 3 of 4: drift.', `screen reader: the save first, then the skip and the next item: "${await live()}"`);
  ok(/Fixing 3 of 4/.test(await ai()) && await page.$eval('[data-chk-finding="2"]', (f) => f.classList.contains('is-old')) && /This text is no longer in the section\./.test(await txt('[data-chk-finding="2"]')), 'panel: item 2 muted, "This text is no longer in the section."');
  ok(!(await has('[data-chk-finding="1"]')) && await has('[data-chk-finding="3"].is-now') && !(await has('.wr-chk-alert')), 'panel: item 1 (accepted) gone, item 3 now, no Out of date yet');
  ok(await shots('skipped') === false, 'skipped: no sideways scroll at 900 px');
  // The editor is editable between items.
  await g(() => { const ed = document.querySelector('[data-editor]'); const li = ed.querySelector('li:last-child'); const r = document.createRange(); r.selectNodeContents(li); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus(); });
  await page.keyboard.type(' today');
  ok(/Keep both feet flat on the floor today/.test(await g(() => document.querySelector('[data-editor]').innerText)), 'typing between items works');

  // ── 10b. A lost connection: Try again / Stop ──
  await page.click('[data-q-send]');
  await until(() => window.__imp.requests.length === 3);
  await g(() => window.__imp.fail());
  await cardIs('q-failed');
  ok((await txt('.wr-q .alert')) === 'We couldn’t reach NicheInk. Check your connection. Your text is safe. If the AI had already finished, this call may still count.', `network: "${await txt('.wr-q .alert')}"`);
  ok((await rows())[2] === '3 Drift Failed' && (await txt('.wr-q p.wr-imp-small')) === 'Try again sends item 3 again. Stop keeps item 1’s change.', `item 3 Failed; "${await txt('.wr-q .wr-imp-small')}"`);
  ok((await edState()) === 'true' && (await focused()) === 'data-q-retry data-imp-focus', 'editable; focus on Try again');
  ok(await shots('network') === false, 'network: no sideways scroll at 900 px');
  const r3 = await lastReq();
  await page.click('[data-q-retry]');
  await until(() => window.__imp.requests.length === 4);
  const r4 = await lastReq();
  ok(r4.instruction === r3.instruction && r4.selection === r3.selection, 'Try again sends the same item and words');
  await g(() => window.__imp.reply(429, { error: 'rate_limited' }));
  await cardIs('q-failed');
  ok(/Too many requests\. Wait a minute, then try again\./.test(await txt('.wr-q .alert')) && await has('[data-q-retry]'), 'too many requests: Try again');
  await page.click('[data-q-retry]');
  await until(() => window.__imp.requests.length === 5);
  await g(() => window.__imp.reply(200, { stage: 'section_improve', action: 'custom', unchanged: true }));
  await cardIs('q-nochange');
  ok((await txt('#wrImpTitle')) === 'No changes suggested' && await has('[data-q-next]'), 'no changes suggested: Next item');
  await page.click('[data-q-next]');

  // ── 9. Item 4 is under 3 words: skipped; the queue is done ──
  await cardIs('q-done');
  ok((await rows())[3] === '4 Objective Under 3 words, too short to fix. Skipped', `short item: "${(await rows())[3]}"`);
  ok((await live()) === 'Item 3: no changes suggested. Item 4 skipped. Under 3 words, too short to fix. Fix major done. 1 accepted, 2 skipped, 1 with no change.', `screen reader: "${await live()}"`);
  ok((await txt('.wr-q .chip-label')) === 'FIX MAJOR · DONE' && (await txt('#wrImpTitle')) === '1 accepted, 2 skipped, 1 with no change', `done: "${await txt('#wrImpTitle')}"`);
  ok(/Each Accept saved a new version\. The Checks tab shows what is left\./.test(await txt('.wr-q')) && (await focused()) === 'data-q-close data-imp-focus', 'the line, focus on Close');
  // E12 fix batch 2 (22e, the owner's rule): the accepted item was this check's own Fix, so the check still holds.
  ok(!/Out of date/.test(await ai()) && /Fixed \d+ of \d+ major findings/.test(await ai()), `panel: the check still holds, "Fixed N of M": "${(await ai()).slice(0, 140)}"`);
  // The open findings show as they are (not muted); the fixed one is not listed; the minor fold was opened in 6.
  ok((await txt('.wr-chk-fold')) === '1 minor (voice) Hide' && await g(() => document.querySelectorAll('[data-chk-finding].is-old').length) === 0, `panel: open findings, the minor fold: "${await txt('.wr-chk-fold')}"`);
  const listed = await g(() => document.querySelectorAll('[data-chk-finding]').length);
  await page.click('[data-chk-fold="minor"]');
  ok(await g(() => document.querySelectorAll('[data-chk-finding]').length) === listed - 1, 'Hide: the minor finding folds away');
  ok(await g(() => window.__chk.requests.length) === 0, 'no check ran by itself');
  ok(await shots('done') === false, 'done: no sideways scroll at 900 px');
  await page.click('[data-q-close]');
  ok(!(await card()) && await g(() => document.activeElement && document.activeElement.dataset.tab === 'checks'), 'Close: the card goes, focus on the Checks tab');

  // ── 10a. The month limit: no Try again; the rest not sent ──
  const TEXT2 = st.sectionOf(S).s.current_version_id && st.versions.find((v) => v.id === st.sectionOf(S).s.current_version_id).content;
  const G = [
    { type: 'drift', message: 'Weight loss is not in the Brief.', quote: 'If anything pinches, make the circle smaller.' },
    { type: 'objective', message: 'Move the safety note first.', quote: 'Sit near the front of your chair' },
    { type: 'objective', message: 'Say why both feet stay down.', quote: 'Keep both feet flat on the floor' }
  ];
  ok(G.every((f) => TEXT2.includes(f.quote)), 'the new findings quote the saved text');
  // The words typed between items are a draft: the new check reads the saved version.
  delete st.drafts[S];
  // Item 5 ("Sit near the front of your chair") was kept above; a new start for these checks.
  st.kept[S] = [];
  const fresh = async () => { await seed(G, { objective: 'issues', voice: 'pass', drift: 'issues' }); await open(W1, S); await checksTab(); await page.click('[data-chk-fixmajor]'); await cardIs('q-item'); };
  await fresh();
  const n0 = await imps();
  await page.click('[data-q-send]');
  await until((n) => window.__imp.requests.length === n + 1, n0);
  await g(() => window.__imp.reply(429, { error: 'monthly_limit' }));
  await cardIs('q-refused');
  ok((await txt('.wr-q .chip-label')) === 'FIX MAJOR · 1 OF 3' && (await txt('#wrImpTitle')) === 'Fix major stopped' && /AI allowance/.test(await txt('.wr-q .alert')), 'month limit: stopped, the allowance line');
  ok(JSON.stringify(await rows()) === JSON.stringify(['1 Drift Not sent', '2 Objective Not sent', '3 Objective Not sent']) && /The rest were not sent\. This refusal was not counted\./.test(await txt('.wr-q')), `the rest not sent: ${JSON.stringify(await rows())}`);
  ok(!(await has('[data-q-retry]')) && await has('[data-q-close]'), 'no Try again; Close');
  ok(await shots('month-limit') === false, 'month limit: no sideways scroll at 900 px');
  await page.click('[data-q-close]');

  // ── Stop: before Send, during the call (it counts), on the suggestion ──
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  await page.click('[data-q-skip]');
  await cardIs('q-item');
  ok((await rows())[0] === '1 Drift Skipped' && (await live()) === 'Item 1 skipped. Fix 2 of 3: objective.', 'Skip: nothing sent, the next item');
  await page.click('[data-q-stop]');
  await cardIs('q-done');
  ok((await txt('#wrImpTitle')) === '1 skipped, 2 not sent' && /Your text did not change\./.test(await txt('.wr-q')), `Stop before Send: "${await txt('#wrImpTitle')}"`);
  await page.click('[data-q-close]');
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  const n1 = await imps();
  await page.click('[data-q-send]');
  await until((n) => window.__imp.requests.length === n + 1, n1);
  await cardIs('q-loading');
  const ab0 = await g(() => window.__imp.aborted);
  await page.click('[data-q-stop]');
  await cardIs('q-done');
  ok(await g(() => window.__imp.aborted) === ab0 + 1 && (await txt('#wrImpTitle')) === '1 stopped, 2 not sent' && /The tokens already used count toward your usage\./.test(await txt('.wr-q')), 'Stop during the call: aborted, it counts');
  ok((await edState()) === 'true', 'Stop during the call: editable again');
  await page.click('[data-q-close]');
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  await page.click('[data-q-send]');
  await until((n) => window.__imp.requests.length === n + 2, n1);
  await suggest('If anything hurts, stop.');
  await cardIs('q-review');
  await page.click('.wr-q [data-q-stop]');
  await cardIs('q-done');
  ok((await txt('#wrImpTitle')) === '1 stopped, 2 not sent' && st.writes.filter((w) => w.fn === 'apply_suggestion').length === 1, 'Stop on the suggestion: nothing applied');
  await page.click('[data-q-close]');

  // ── While the queue runs, no AI check can start (G5 live note 3) ──
  st.sectionOf(S).s.needs_review = true;
  await fresh();
  ok(await page.$eval('[data-chk-review]', (b) => b.disabled) && (await txt('#wrChkReviewWhy')) === 'Finish or stop Fix major first.', `Needs review: Run AI check off with the reason: "${await txt('#wrChkReviewWhy')}"`);
  ok(!(await has('.wr-chk-group:last-child [data-chk-run]:not([disabled])')), 'the panel offers no Check again');
  await page.click('[data-q-stop]');
  await cardIs('q-done');
  ok(!(await page.$eval('[data-chk-review]', (b) => b.disabled)) && !(await has('#wrChkReviewWhy')) && await has('.wr-chk-meta [data-chk-run]'), 'the queue ended: Run AI check and Check again on');
  await page.click('[data-q-close]');
  st.sectionOf(S).s.needs_review = false;
  await open(W1, S);
  await checksTab();

  // ── Leaving the section while the queue runs ──
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  await page.click(`[data-section="${st.s43}"]`);
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 3000 });
  ok((await txt('dialog[open] #wrAskTitle')) === 'Leave and stop Fix major?' && (await txt('dialog[open] [data-ask-text]')) === 'Accepted changes stay.', 'the leave confirm (owner wording)');
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(300);
  ok((await card()) === 'q-item', 'Stay: the queue goes on');
  await page.click(`[data-section="${st.s43}"]`);
  await page.waitForSelector('dialog[open] [data-ask-yes]', { timeout: 3000 });
  await page.click('dialog[open] [data-ask-yes]');
  await until((id) => document.querySelector(`[data-section="${id}"]`).getAttribute('aria-current') === 'true', st.s43);
  await page.waitForTimeout(300);
  ok(!(await card()), 'Leave: the queue is gone');
  await page.click(`[data-section="${S}"]`);
  await until((id) => document.querySelector(`[data-section="${id}"]`).getAttribute('aria-current') === 'true', S);
  await page.waitForTimeout(500);
  ok(!(await card()) && !(await page.$eval('[data-generate]', (b) => b.disabled)), 'back on 4.2: no queue, Generate on');

  // ── The writer changes a waiting item's text between items (nothing accepted yet) ──
  await checksTab();
  await page.click('[data-chk-fixmajor]');
  await cardIs('q-item');
  await g((q) => {
    const ed = document.querySelector('[data-editor]');
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const i = t.nodeValue.indexOf(q);
      if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + q.length); const x = getSelection(); x.removeAllRanges(); x.addRange(r); return; }
    }
  }, 'Sit near the front of your chair');
  await page.keyboard.type('Sit up tall');
  await page.click('[data-q-skip]');
  await cardIs('q-item');
  ok((await rows())[1] === '2 Objective This text is no longer in the section. Skipped' && (await txt('#wrImpTitle')) === 'Fix 3 of 3: objective', `quote changed by the writer: "${(await rows())[1]}"`);
  ok((await live()) === 'Item 1 skipped. Item 2 skipped. This text is no longer in the section. Fix 3 of 3: objective.', `screen reader: "${await live()}"`);
  await page.click('[data-q-stop]');

  return log.join('\n');
};
