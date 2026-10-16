// Step 06 Write (PRODUCE G5, design 22d): severity, the minor fold, Keep as is
// and Undo, kept across a new check, an objective gap kept for its own check
// only (check_at sent exactly as the database wrote it, to the microsecond),
// "No open AI findings", Fix opening Custom pre-filled (editable, Back, Esc,
// nothing sent until Send), the out-of-date fold, Keep errors and a kept-list
// load error. States 1, 2, 3a, 3b, 4, 5, 9 (the fold), 11 and 12.
// Screenshots at 1440 and 900 px.
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
  const ai = () => txt('.wr-chk-group:last-child');
  const tabLabel = () => txt('[data-tab="checks"]');
  const live = () => txt('[data-live]');
  const focused = () => g(() => { const a = document.activeElement; return a ? [...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `${x.name}=${x.value}`).join(' ') : ''; });
  const keptPosts = () => st.writes.filter((w) => w.table === 'kept_findings' && w.body);
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const S = st.s42;
  const keyOf = (sid) => {
    const { c, s } = st.sectionOf(sid);
    return g(([p, secs]) => window.kdpSectionCheckKey({ ...p, siblings: window.kdpSectionCheckKey.siblings(p.kind, secs, p.sid) }),
      [{ sid, versionId: s.current_version_id, kind: c.kind, chapterTitle: c.title, objective: c.objective, sectionTitle: s.title,
        lockedAt: st.books[W1].pos.locked_at, penName: 'Nora Hale', voice: st.penVoice, wordTarget: s.word_target },
       c.sections.map((x) => ({ id: x.id, title: x.title }))]);
  };
  /** A saved check of the current version (what a reload reads). */
  const seed = async (sid, findings, areas, checkedAt) => {
    st.checks[sid] = { version_id: st.sectionOf(sid).s.current_version_id, findings, areas, words: 77, inputs_key: await keyOf(sid), checked_at: checkedAt };
  };
  /** Check again: the server's reply, with its own checked_at (the database's string). */
  const checkAgain = async (sid, findings, areas, checkedAt) => {
    const n0 = await g(() => window.__chk.requests.length);
    await page.click('.wr-chk-meta [data-chk-run], .wr-chk-alert [data-chk-run], [data-chk-run]');
    await until((n) => window.__chk.requests.length === n + 1, n0);
    const body = { stage: 'section_check', findings, areas, words: 77, version_id: st.sectionOf(sid).s.current_version_id, checked_at: checkedAt, inputs_key: await keyOf(sid) };
    st.checks[sid] = { version_id: body.version_id, findings, areas, words: 77, inputs_key: body.inputs_key, checked_at: checkedAt };
    await g((b) => window.__chk.reply(200, b), body);
    await page.waitForTimeout(400);
  };
  const shots = async (name) => {
    await page.screenshot({ path: `${SHOTS}/t-fix-${name}-1440.png` });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(250);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    await page.evaluate(() => { const p = document.querySelector('.wr-side'); if (p) p.scrollIntoView({ block: 'start' }); });
    await page.screenshot({ path: `${SHOTS}/t-fix-${name}-900.png` });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(250);
    return sideways;
  };
  const smallButtons = () => g(() => [...document.querySelectorAll('.wr-panel button')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()));

  // Quotes from 4.2 (design 22, v3), exact Markdown.
  const DRIFT_Q = 'If anything pinches, make the circle smaller.';
  const VOICE_Q = 'Keep your neck long and your *chin* level.';
  const VOICE2_Q = 'Shoulder rolls ease the stiffness that builds up after long hours of sitting.';
  const OBJ_Q = 'Now lift your shoulders up toward your ears, then roll them back and down in a slow circle.';
  const DRIFT = { type: 'drift', message: 'This adds a promise about pain the locked positioning does not make. Cut it, or tie it to moving safely.', quote: DRIFT_Q };
  const VOICE = { type: 'voice', message: 'This sentence is long and formal. Split it and speak to the reader as "you".', quote: VOICE_Q };
  const VOICE2 = { type: 'voice', message: '"Stiffness" sounds clinical next to your warm, plain voice.', quote: VOICE2_Q };
  const OBJ = { type: 'objective', message: 'The title promises both ways, but the forward roll has no count. Say how many times.', quote: OBJ_Q };
  const GAP1 = { type: 'objective', message: 'The title promises both ways, but the text never shows the forward roll.', quote: '' };
  const GAP2 = { type: 'objective', message: 'The section never says how long to rest between rolls.', quote: '' };
  // Postgres keeps microseconds; Date would keep .123 only.
  const T1 = '2026-10-16T10:00:00.123456+00:00';
  const T2 = '2026-10-16T11:22:33.654321+00:00';
  const T3 = '2026-10-16T11:22:33.654322+00:00';   // 1 microsecond after T2
  await page.setViewportSize({ width: 1440, height: 960 });
  // keyOf runs in the page: load the app once first (a fresh session starts on about:blank).
  await open(W1, S);

  // ── 1. Mixed results, minor folded (22d, 1) ──
  await seed(S, [VOICE, DRIFT, VOICE2], { objective: 'pass', voice: 'issues', drift: 'issues' }, T1);
  await open(W1, S);
  ok((await tabLabel()) === 'Checks 2', `count: the claim + 1 major; minor never counts (Q1): "${await tabLabel()}"`);
  await checksTab();
  const order = await g(() => [...document.querySelectorAll('.wr-chk-group:last-child > *')].map((e) => e.dataset.chkFinding != null ? `f${e.dataset.chkFinding}` : e.dataset.chkArea ? `area:${e.dataset.chkArea}` : e.className.split(' ')[0]));
  ok(JSON.stringify(order) === JSON.stringify(['wr-chk-head', 'wr-chk-meta', 'f1', 'area:objective', 'wr-chk-fold', 'wr-chk-help']), `order: major, pass row, minor fold, help: ${JSON.stringify(order)}`);
  ok((await txt('[data-chk-finding="1"]')) === `Drift · Major ${DRIFT.message} “${DRIFT_Q}” Fix Keep as is`, `drift: "${await txt('[data-chk-finding="1"]')}"`);
  ok(await page.$eval('[data-chk-fix="1"]', (b) => b.getAttribute('aria-label')) === 'Fix with AI: drift', 'Fix is named "Fix with AI: drift" for screen readers');
  ok((await txt('.wr-chk-fold')) === '2 minor (voice) Show' && await page.$eval('[data-chk-fold="minor"]', (b) => b.getAttribute('aria-expanded')) === 'false', 'fold row: "2 minor (voice) · Show", closed');
  ok(!(await has('[data-chk-finding="0"]')) && !(await has('[data-chk-finding="2"]')), 'minor findings hidden while folded');
  ok((await txt('.wr-chk-help-last')) === 'Checks are advice, not a score. They never block Final or Next.', 'the help line');
  ok(!(await has('[data-chk-fixmajor]')), 'one major with a quote: no Fix major (22d, 6)');
  ok((await smallButtons()).length === 0, `every panel button is 44 px tall: ${JSON.stringify(await smallButtons())}`);
  ok(await shots('mixed') === false, 'mixed: no sideways scroll at 900 px');

  // ── 2. Minor shown; the choice is kept per section while the page is open (22d, 2) ──
  await page.click('[data-chk-fold="minor"]');
  ok(await page.$eval('[data-chk-fold="minor"]', (b) => [b.getAttribute('aria-expanded'), b.innerText].join(' ')) === 'true Hide', 'Show → Hide, expanded');
  ok((await focused()) === 'data-chk-fold=minor', 'focus stays on the fold button');
  ok((await txt('[data-chk-finding="0"] .wr-chk-type')) === 'Voice · Minor' && await page.$eval('[data-chk-finding="0"] .wr-chk-type', (t) => t.classList.contains('is-minor')), 'minor: "Voice · Minor" with the gray info icon');
  const minorOrder = await g(() => [...document.querySelectorAll('[data-chk-finding]')].map((e) => e.dataset.chkFinding));
  ok(JSON.stringify(minorOrder) === '["1","2","0"]', `minor in text order after the fold: ${JSON.stringify(minorOrder)}`);
  ok(await g(() => getComputedStyle(document.querySelector('[data-chk-finding="0"] .wr-chk-type svg')).color !== getComputedStyle(document.querySelector('[data-chk-finding="1"] .wr-chk-type svg')).color), 'minor icon gray, major icon the warning color');
  await page.click(`[data-section="${st.s43}"]`);
  await until((id) => document.querySelector(`[data-section="${id}"]`).getAttribute('aria-current') === 'true', st.s43);
  await page.waitForTimeout(300);
  await page.click(`[data-section="${S}"]`);
  await until((id) => document.querySelector(`[data-section="${id}"]`).getAttribute('aria-current') === 'true', S);
  await page.waitForTimeout(500);
  await checksTab();
  ok(await page.$eval('[data-chk-fold="minor"]', (b) => b.getAttribute('aria-expanded')) === 'true', 'back on 4.2: minor still shown (kept per section while the page is open)');
  ok(await shots('minor-shown') === false, 'minor shown: no sideways scroll at 900 px');
  await page.click('[data-chk-fold="minor"]');

  // ── 3a. Keep as is: a save, not an AI call (22d, 3a) ──
  const imps0 = await g(() => window.__imp.requests.length);
  const chks0 = await g(() => window.__chk.requests.length);
  await page.click('[data-chk-keep="1"]');
  await until(() => !document.querySelector('[data-chk-finding="1"]'));
  await page.waitForTimeout(200);
  const post1 = keptPosts().slice(-1)[0].body;
  ok(JSON.stringify(post1) === JSON.stringify({ section_id: S, type: 'drift', message: DRIFT.message, quote: DRIFT_Q, check_at: null }), `the save: ${JSON.stringify(post1)}`);
  ok(await g(() => window.__imp.requests.length) === imps0 && await g(() => window.__chk.requests.length) === chks0, 'no AI call');
  ok((await txt('[data-chk-area="drift"]')) === 'No drift found' && (await txt('[data-chk-area="objective"]')) === 'No objective problems found', 'pass rows: objective, and drift (every drift kept; owner, G5 STOP 1)');
  ok(/No drift found 2 minor \(voice\) Show 1 kept Show Checks are advice/.test(await ai()), `kept row "1 kept · Show" after the pass rows: ${await ai()}`);
  ok((await focused()) === 'data-chk-fold=kept', `focus moves to "1 kept · Show": ${await focused()}`);
  ok((await live()) === 'Kept. It stays hidden on later checks.', `screen reader: "${await live()}"`);
  ok((await tabLabel()) === 'Checks 1', `count drops to 1: "${await tabLabel()}"`);

  // ── 3b. Kept list with Undo (22d, 3b) ──
  await page.click('[data-chk-fold="kept"]');
  ok((await txt('.wr-chk-kept')) === `KEPT: HIDDEN ON LATER CHECKS Drift · Major ${DRIFT.message} “${DRIFT_Q}” Kept today Undo`, `kept list: "${await txt('.wr-chk-kept')}"`);
  ok(await page.$eval('.wr-chk-kept [data-chk-undo]', (b) => b.getAttribute('aria-label')) === 'Undo keep: drift', 'Undo is named "Undo keep: drift"');
  ok((await smallButtons()).length === 0, `kept list buttons are 44 px tall: ${JSON.stringify(await smallButtons())}`);
  ok(await shots('kept-list') === false, 'kept list: no sideways scroll at 900 px');
  await page.click('.wr-chk-kept [data-chk-undo]');
  await page.waitForSelector('[data-chk-finding="1"]', { timeout: 5000 });
  ok(st.writes.some((w) => w.table === 'kept_findings' && w.del) && !(await has('.wr-chk-kept')) && !(await has('[data-chk-fold="kept"]')), 'Undo deletes the row; the kept row goes');
  ok((await tabLabel()) === 'Checks 2' && !(await has('[data-chk-area="drift"]')), 'Undo puts the finding back in its place and in the count');
  ok((await focused()) === 'data-chk-keep=1' && (await live()) === 'Keep undone. The finding is back.', `focus on the finding's Keep as is; "${await live()}"`);

  // ── Keep errors: a failed save hides nothing; the cap; already kept in another tab ──
  modes.keepError = true;
  await page.click('[data-chk-keep="1"]');
  await page.waitForSelector('[data-chk-finding="1"] .wr-chk-err', { timeout: 5000 });
  ok((await txt('[data-chk-finding="1"] .wr-chk-err')) === 'We couldn’t save this. Try again.' && await page.$eval('[data-chk-finding="1"] .wr-chk-err', (p) => p.getAttribute('role')) === 'alert', 'save error: the message on the finding, nothing hidden');
  modes.keepError = false;
  modes.keptLimit = true;
  await page.click('[data-chk-keep="1"]');
  await until(() => /Undo one/.test((document.querySelector('[data-chk-finding="1"] .wr-chk-err') || {}).innerText || ''));
  ok((await txt('[data-chk-finding="1"] .wr-chk-err')) === 'You have kept 50 findings in this section. Undo one to keep another.', 'the 50 cap: its message');
  modes.keptLimit = false;
  st.kept[S] = [{ id: '9a000000-0000-4000-8000-000000000001', type: 'drift', message: 'Kept in another tab.', quote: DRIFT_Q, check_at: null, created_at: new Date().toISOString() }];
  await page.click('[data-chk-keep="1"]');
  await until(() => !document.querySelector('[data-chk-finding="1"]'));
  ok((await live()) === 'Kept. It stays hidden on later checks.' && /1 kept/.test(await ai()), 'already kept in another tab (23505): read as kept, the list read again');

  // ── 4. After Check again: the same quote stays hidden; the new finding shows (22d, 4) ──
  await checkAgain(S, [{ ...DRIFT, message: 'Reworded by the AI this time.' }, OBJ], { objective: 'issues', voice: 'pass', drift: 'issues' }, T1.replace('10:00', '10:05'));
  ok(!(await has('[data-chk-finding="0"]')) && (await txt('[data-chk-finding="1"]')) === `Objective · Major ${OBJ.message} “${OBJ_Q.replace(/\*/g, '')}” Fix Keep as is`, 'the kept drift (same type and quote) is hidden; the new objective shows');
  ok((await txt('[data-chk-area="drift"]')) === 'No drift found' && (await txt('[data-chk-area="voice"]')) === 'No voice problems found', 'a drift found only in kept items: "No drift found"');
  ok(!/\bNew\b/.test(await ai()) && /1 kept (Show|Hide)/.test(await ai()), `no "New" tag; "1 kept · Show": ${await ai()}`);
  ok((await tabLabel()) === 'Checks 2', `count: claim + objective: "${await tabLabel()}"`);
  ok(/^AI check of v3 · /.test(await txt('.wr-chk-meta')) && /Check again$/.test(await txt('.wr-chk-meta')), 'meta with Check again');

  // ── 5. Fix: Custom open, pre-filled, editable; nothing sent until Send (22d, 5) ──
  await page.click('[data-chk-fix="1"]');
  await page.waitForSelector('[data-imp-menu][role="dialog"] [data-imp-ask]', { timeout: 3000 });
  const box = () => g(() => { const b = document.querySelector('[data-imp-ask]'); return { v: b.value, at: b.selectionStart, focus: document.activeElement === b, n: document.querySelector('[data-imp-count]').innerText }; });
  const b1 = await box();
  ok(b1.v === OBJ.message && b1.focus && b1.at === OBJ.message.length && b1.n === `${OBJ.message.length} / 300`, `pre-filled, focused, the cursor at the end, the count: ${JSON.stringify(b1)}`);
  ok((await txt('.wr-imp-mnote')) === 'Nothing is sent until you press Send. Edit the words first if you like.', 'the note under the box');
  ok(await page.$eval('[data-chk-fix="1"]', (b) => b.classList.contains('is-pressed') && b.getAttribute('aria-expanded') === 'true'), 'the finding\'s Fix shows pressed while its box is open');
  ok((await txt('.wr-imp-head')) === '1 sentence · 18 words', `menu head: "${await txt('.wr-imp-head')}"`);
  ok(!(await page.$eval('[data-imp-send]', (b) => b.disabled)), 'Send is on');
  await page.keyboard.type(' Keep it short.');
  await page.click('[data-imp-back]');
  await page.waitForSelector('[data-imp-menu][role="menu"]', { timeout: 3000 });
  ok(await has('[data-imp-act="improve"]'), 'Back goes to the action menu');
  await page.click('[data-imp-act="custom"]');
  await page.waitForSelector('[data-imp-ask]', { timeout: 3000 });
  ok((await box()).v === `${OBJ.message} Keep it short.`, 'Custom again: the edited words are kept');
  await page.keyboard.press('Escape');
  ok(await has('[data-imp-menu][role="menu"]'), 'opened from the action menu: Esc goes back (22b)');
  await page.keyboard.press('Escape');
  ok(!(await has('[data-imp-menu]')) && await g(() => window.__imp.requests.length) === imps0, 'closed; nothing sent');
  await page.click('[data-chk-fix="1"]');
  await page.waitForSelector('[data-imp-ask]', { timeout: 3000 });
  await page.keyboard.press('Escape');
  ok(!(await has('[data-imp-menu]')), 'opened by Fix: Esc closes (22d, 5)');
  ok(await page.$eval('[data-chk-fix="1"]', (b) => !b.classList.contains('is-pressed') && b.getAttribute('aria-expanded') === 'false'), 'closed: Fix no longer pressed');
  await page.click('[data-chk-fix="1"]');
  await page.waitForSelector('[data-imp-ask]', { timeout: 3000 });
  await page.keyboard.type(' Say five times.');
  ok(await shots('fix-custom') === false, 'Fix: no sideways scroll at 900 px');
  await page.click('[data-imp-send]');
  await until((n) => window.__imp.requests.length === n + 1, imps0);
  const ireq = await g(() => window.__imp.requests.slice(-1)[0].body);
  ok(ireq.action === 'custom' && ireq.instruction === `${OBJ.message} Say five times.` && ireq.selection === OBJ_Q, `Send: one Custom request with the edited words: ${JSON.stringify({ action: ireq.action, instruction: ireq.instruction, selection: ireq.selection })}`);
  await g(() => window.__imp.reply(200, { stage: 'section_improve', suggestionId: '5b000000-0000-4000-8000-000000000001', action: 'custom', text: 'Lift your shoulders, then roll them back and down five times.', words: { before: 18, after: 11 }, flagged: 0, notes: { markersLost: 0, newNames: [], structureChanged: null } }));
  await until(() => (document.querySelector('[data-imp-card]') || {}).dataset?.impCard === 'review');
  ok(/^CUSTOM INSTRUCTION · /.test(await txt('.wr-imp .chip-label')), 'the usual suggestion card');
  await page.click('[data-imp-reject]');
  await page.waitForTimeout(300);
  ok(await g(() => window.__chk.requests.length) === chks0 + 1, 'no re-check after the suggestion');

  // ── 11. An objective gap kept for this check only; check_at sent exactly as read (22d, 11) ──
  await checkAgain(S, [GAP1, GAP2, OBJ], { objective: 'issues', voice: 'pass', drift: 'pass' }, T2);
  ok((await txt('[data-chk-finding="0"]')) === `Objective · Major ${GAP1.message} Missing from the text Nothing to select. Add this part yourself. Keep as is` && !(await has('[data-chk-fix="0"]')), 'a gap: no Fix, Keep as is');
  await page.click('[data-chk-keep="0"]');
  await until(() => !document.querySelector('[data-chk-finding="0"]'));
  const post2 = keptPosts().slice(-1)[0].body;
  ok(post2.check_at === T2 && post2.quote === '' && post2.message === GAP1.message, `check_at is the database's string, microseconds kept: ${post2.check_at}`);
  ok(post2.check_at !== new Date(T2).toISOString(), 'not rebuilt with Date (that would end in .654Z)');
  ok((await live()) === 'Kept for this check only.', `screen reader: "${await live()}"`);
  if (await page.$eval('[data-chk-fold="kept"]', (b) => b.getAttribute('aria-expanded')) !== 'true') await page.click('[data-chk-fold="kept"]');
  const gapItem = await g(() => [...document.querySelectorAll('.wr-chk-kept-item')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).find((t) => /forward roll/.test(t)));
  ok(gapItem === `Objective · Major ${GAP1.message} Missing from the text For this check only Undo`, `kept gap: "${gapItem}"`);
  ok(/2 kept/.test(await ai()), 'two kept: the drift quote and the gap');
  ok(await shots('gap-kept') === false, 'gap kept: no sideways scroll at 900 px');
  // The same gap on a check 1 microsecond later comes back: kept for one check only.
  await checkAgain(S, [GAP1, OBJ], { objective: 'issues', voice: 'pass', drift: 'pass' }, T3);
  ok(await has('[data-chk-finding="0"]') && /1 kept/.test(await ai()), 'a new check (1 microsecond later): the gap is back; the kept list holds only the quote');
  // A gap whose check was replaced in another tab: the server refuses it.
  st.checks[S].checked_at = T1;
  await page.click('[data-chk-keep="0"]');
  await page.waitForSelector('[data-chk-finding="0"] .wr-chk-err', { timeout: 5000 });
  ok((await txt('[data-chk-finding="0"] .wr-chk-err')) === 'This check was replaced. Check again, then keep it.', 'a replaced check: its message');
  st.checks[S].checked_at = T3;

  // ── 12. Every finding kept: one line, not the pass rows (22d, 12) ──
  await seed(S, [DRIFT], { objective: 'pass', voice: 'pass', drift: 'issues' }, T1);
  await open(W1, S);
  await checksTab();
  ok((await txt('[data-chk-area="none"]')) === 'No open AI findings' && !(await has('[data-chk-area="objective"]')) && !(await has('[data-chk-area="drift"]')), '"No open AI findings" stands for the pass rows');
  ok(/1 kept Show/.test(await ai()) && (await tabLabel()) === 'Checks 1', `kept row; no AI count: "${await tabLabel()}"`);
  ok(await shots('all-kept') === false, 'all kept: no sideways scroll at 900 px');

  // ── 9. Out of date: the first major shows muted, the rest fold (owner, G5 STOP 1) ──
  st.kept[S] = [];
  await seed(S, [VOICE, DRIFT, OBJ, VOICE2, GAP1], { objective: 'issues', voice: 'issues', drift: 'issues' }, T1);
  st.checks[S].inputs_key = '0000000000000000';
  await open(W1, S);
  await checksTab();
  ok(/^AI CHECK AI Out of date\./.test(await ai()) && !(await has('.wr-chk-meta [data-chk-run]')), 'out of date: Check again only in the alert');
  const oldF = await g(() => [...document.querySelectorAll('[data-chk-finding]')].map((e) => [e.dataset.chkFinding, e.classList.contains('is-old')]));
  ok(JSON.stringify(oldF) === '[["2",true]]', `the first major (text order), muted: ${JSON.stringify(oldF)}`);
  ok((await txt('.wr-chk-fold')) === '2 more major, 2 minor (voice) Show', `fold: "${await txt('.wr-chk-fold')}"`);
  await page.click('[data-chk-fold="minor"]');
  ok((await g(() => document.querySelectorAll('[data-chk-finding].is-old').length)) === 5, 'Show: all five, muted');
  ok((await tabLabel()) === 'Checks 1' && !(await has('[data-chk-fixmajor]')), 'out of date: not counted, no Fix major');

  // ── A kept-list load error: findings show as open, with Try again ──
  st.kept[S] = [{ id: '9b000000-0000-4000-8000-000000000001', type: 'drift', message: DRIFT.message, quote: DRIFT_Q, check_at: null, created_at: new Date(Date.now() - 86400e3).toISOString() }];
  await seed(S, [DRIFT, OBJ], { objective: 'issues', voice: 'pass', drift: 'issues' }, T1);
  modes.keptLoadError = true;
  await open(W1, S);
  await checksTab();
  ok(/We couldn’t load the kept findings\. They show as open for now\. Try again/.test(await ai()) && await has('[data-chk-finding="0"]'), 'load error: the alert, the kept drift shows');
  modes.keptLoadError = false;
  await page.click('[data-chk-kept-reload]');
  await until(() => !document.querySelector('[data-chk-finding="0"]'));
  await page.click('[data-chk-fold="kept"]');
  ok(/Kept yesterday Undo/.test(await txt('.wr-chk-kept')), `Try again: hidden again; "Kept yesterday": "${await txt('.wr-chk-kept')}"`);

  // ── Undo of a minor finding while the minor row is folded: focus on that row's Show (G5 live note 2) ──
  st.kept[S] = [];
  await seed(S, [VOICE, VOICE2, DRIFT], { objective: 'pass', voice: 'issues', drift: 'issues' }, T1);
  await open(W1, S);
  await checksTab();
  await page.click('[data-chk-fold="minor"]');
  await page.click('[data-chk-keep="0"]');
  await until(() => !document.querySelector('[data-chk-finding="0"]'));
  await page.click('[data-chk-fold="minor"]');
  ok((await txt('.wr-chk-fold')) === '1 minor (voice) Show', `minor folded again: "${await txt('.wr-chk-fold')}"`);
  if (await page.$eval('[data-chk-fold="kept"]', (b) => b.getAttribute('aria-expanded')) !== 'true') await page.click('[data-chk-fold="kept"]');
  await page.click('.wr-chk-kept [data-chk-undo]');
  await until(() => !document.querySelector('.wr-chk-kept'));
  await page.waitForTimeout(200);
  ok((await focused()) === 'data-chk-fold=minor' && (await txt('.wr-chk-fold')) === '2 minor (voice) Show', `Undo with minor folded: focus on its Show: ${await focused()}`);

  return log.join('\n');
};
