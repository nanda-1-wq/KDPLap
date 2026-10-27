// Step 06 Write, E12 fix batch 2, Part 4 (design 22e): "Ready to mark Final" in the
// Checks tab, and the owner's rule for an AI check that still holds (stillValid):
// its own Fix keeps it, your own edits keep it under 20% of the words (the meter), a
// bigger edit, a Generate, another Improve, a Restore or a plan change end it (each with
// its line). Also: Mark Final, no check yet (one Run button), Needs review and a gap in
// "things left" with Show, a failed read, and the sentences as plain text.
// Screenshots at 1440 and 900 px.
// Run: tests/browser/run.sh write t-ready.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver, .wr-panel .wr-soon', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.click('[data-tab="checks"]');
    await page.waitForSelector('.wr-panel .wr-chk', { timeout: 5000 });
    await page.waitForTimeout(500);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const block = () => txt('[data-chk-ready]');
  const state = () => page.$eval('[data-chk-ready]', (e) => e.dataset.chkReady).catch(() => null);
  const ai = () => txt('.wr-chk-group:last-child');
  const tabLabel = () => txt('[data-tab="checks"]');
  const selected = () => g(() => getSelection().toString().replace(/\s+/g, ' ').trim());
  const caretEnd = () => g(() => {
    const ed = document.querySelector('[data-editor]');
    ed.focus();
    let t = ed;
    while (t.lastElementChild && t.lastElementChild.tagName !== 'BR' && t.lastElementChild.isContentEditable) t = t.lastElementChild;
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  const keyOf = (sid) => {
    const { c, s } = st.sectionOf(sid);
    return g(([p, secs]) => window.kdpSectionCheckKey({ ...p, siblings: window.kdpSectionCheckKey.siblings(p.kind, secs, p.sid) }),
      [{ sid, versionId: s.current_version_id, kind: c.kind, chapterTitle: c.title, objective: c.objective, sectionTitle: s.title,
        lockedAt: st.books[W1].pos.locked_at, penName: 'Nora Hale', voice: st.penVoice, wordTarget: s.word_target },
       c.sections.map((x) => ({ id: x.id, title: x.title }))]);
  };
  /** A saved check of the section's current version (as the server saves it). */
  const checkNow = async (sid, findings, areas = { objective: 'issues', voice: 'issues', drift: 'pass' }) => {
    st.checks[sid] = { version_id: st.sectionOf(sid).s.current_version_id, findings, areas, words: 77, inputs_key: await keyOf(sid), checked_at: new Date().toISOString() };
  };
  /** An accepted Improve: a new current version and its used suggestion (as apply_suggestion leaves them). */
  let sugN = 0;
  const accepted = (sid, from, to, action = 'custom', selection = from) => {
    const s = st.sectionOf(sid).s;
    const cur = st.versions.find((v) => v.id === s.current_version_id).content;
    const v = st.addVersion(sid, cur.replace(from, to), action);
    const id = `5b00000${++sugN}-0000-4000-8000-000000000000`;
    st.suggestions[id] = { id, section_id: sid, action, selection, output: to, base_version_id: null, used_at: new Date().toISOString(), version_id: v.id, created_at: new Date().toISOString() };
    return v;
  };
  const shots = async (name) => {
    await page.evaluate(() => { const p = document.querySelector('[data-chk-ready]') || document.querySelector('.wr-side'); if (p) p.scrollIntoView({ block: 'center' }); });
    await page.screenshot({ path: `${SHOTS}/t-ready-${name}-1440.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}`));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    await page.evaluate(() => { const p = document.querySelector('[data-chk-ready]') || document.querySelector('.wr-side'); if (p) p.scrollIntoView({ block: 'start' }); });
    await page.screenshot({ path: `${SHOTS}/t-ready-${name}-900.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-900`));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(300);
    return sideways;
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // The section: 4.2 Shoulder rolls (design 22, v3). Its one number is in Research, so "In your text" is clean.
  st.research.sources = [{ id: 'a1000000-0000-4000-8000-000000000001', kind: 'source', body: 'In a small trial, shoulder rolls cut neck pain by 40%.', citation: 'Neck Trial, 2021', created_at: new Date().toISOString() }];
  const OBJ_Q = 'If anything pinches, make the circle smaller.';
  const OBJ = { type: 'objective', message: 'The safety note comes after the steps. Move it before the first roll.', quote: OBJ_Q };
  const VOICE = { type: 'voice', message: 'Long and formal.', quote: 'Keep your neck long and your *chin* level.' };
  const GAP = { type: 'objective', message: 'The title promises both ways, but the text never shows the forward roll.', quote: '' };
  await open(W1);
  await checkNow(st.s42, [OBJ, VOICE]);

  // 1. Almost: one major finding left (22e, 2); Show selects its quote; the tab counts it.
  await open(W1, st.s42);
  ok((await state()) === 'left' && (await block()) === '1 thing left Fix it and this section is ready. You can still mark it Final now. 1 major AI finding (objective) Show', `left: ${await block()}`);
  ok((await tabLabel()) === 'Checks 1', `tab: ${await tabLabel()}`);
  await page.click('[data-chk-ready] [data-chk-left="0"]');
  ok((await selected()) === OBJ_Q, `Show selects the quote: ${await selected()}`);

  // 2. Its Fix was accepted: the check still holds (no Out of date): Ready, "Fixed 1 of 1", no tab count (22e, 1).
  accepted(st.s42, OBJ_Q, 'Stop if anything pinches.');
  const sugs0 = st.sugReads || 0;
  await open(W1, st.s42);
  ok((st.sugReads || 0) === sugs0 + 1, 'the used suggestions are read once');
  ok((await state()) === 'ready' && (await block()) === 'Ready to mark Final No open problems. You do not need another AI check. Mark Final', `ready: ${await block()}`);
  ok(!/Out of date/.test(await ai()) && /Fixed 1 of 1 major finding/.test(await ai()), `AI check: ${await ai()}`);
  ok(/1 minor \(voice\)/.test(await ai()) && (await tabLabel()) === 'Checks', `minor folds, no count: ${await tabLabel()}`);
  ok(await has('[data-chk-ready].is-ready .wr-chk-ico.is-ok'), 'the success check icon with the words');
  ok(await shots('ready') === false, 'ready: no sideways scroll at 900 px');

  // 3. A small edit of your own: still ready, with the meter (22e, 4).
  await caretEnd();
  await page.keyboard.type(' Rest.');
  await page.waitForTimeout(800);
  ok((await state()) === 'ready', `small edit: still ${await state()}`);
  ok(/Your own edits since this check: \d+% of the words/.test(await txt('[data-chk-meter]') || ''), `meter: ${await txt('[data-chk-meter]')}`);
  ok(await shots('meter') === false, 'meter: no sideways scroll at 900 px');

  // 4. Mark Final: the status is saved, the block says Final, focus on the select.
  const n0 = st.writes.filter((w) => w.table === 'sections' && w.id === st.s42).length;
  await page.click('[data-chk-final]');
  for (let i = 0; i < 50 && st.writes.filter((w) => w.table === 'sections' && w.id === st.s42).length <= n0; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  ok(JSON.stringify(st.writes.filter((w) => w.table === 'sections' && w.id === st.s42).slice(n0).map((w) => w.body)) === JSON.stringify([{ status: 'final' }]), 'Mark Final saves { status: final }');
  ok((await state()) === 'final' && (await block()) === 'Final This section is marked Final and has no open problems.', `final: ${await block()}`);
  ok(await g(() => document.activeElement && document.activeElement.matches('[data-status]') && document.activeElement.value === 'final'), 'focus on the status select, which shows Final');
  ok((await txt('[data-live]')) === 'Marked Final.' || await g(() => /Marked Final\./.test((document.querySelector('[data-live]') || {}).textContent || '')), 'announced: Marked Final.');

  // 5. Final, then a problem: "Final, 1 thing left", the status stays (22e, 8).
  await caretEnd();
  await page.keyboard.type(' See the next section for more.');
  await page.waitForTimeout(800);
  ok((await state()) === 'final-left' && (await block()) === 'Final, 1 thing left Its status stays Final. Fix this, or set it back to Reviewed. Mentions another part of the book Show', `final-left: ${await block()}`);
  st.sectionOf(st.s42).s.status = 'draft';
  delete st.drafts[st.s42];

  // 6. A big edit of your own (20% or more): out of date, with the share (22e, 5).
  await open(W1, st.s42);
  await caretEnd();
  await page.keyboard.type(' Then slowly roll your shoulders the other way, forward and down, five more times, and notice how your upper back feels after each full and easy circle.');
  await page.waitForTimeout(900);
  ok((await state()) === 'stale' && (await block()) === 'Check again to see if it is ready The text changed too much since the last AI check.', `stale: ${await block()}`);
  ok(/Out of date\. You changed \d+% of the words since this check\. Up to 20% keeps a check\./.test(await ai()), `alert: ${(await ai()).slice(0, 140)}`);
  ok(await shots('stale') === false, 'stale: no sideways scroll at 900 px');
  delete st.drafts[st.s42];

  // 7. A Generate after the check: out of date, its own line (22e, 6).
  const cur42 = () => st.versions.find((v) => v.id === st.sectionOf(st.s42).s.current_version_id).content;
  st.addVersion(st.s42, `${cur42()}\n\nGenerate wrote this new paragraph at the end.`, 'generate');
  await open(W1, st.s42);
  ok(/Out of date\. Generate wrote text after this check\./.test(await ai()) && (await block()) === 'Check again to see if it is ready The text changed since the last AI check.', `generate: ${(await ai()).slice(0, 90)}`);

  // 8. An Improve that is not one of the check's Fixes: out of date.
  await checkNow(st.s42, [OBJ, VOICE].map((f) => ({ ...f, quote: f === OBJ ? 'Stop if anything pinches.' : f.quote })));
  accepted(st.s42, 'Generate wrote this new paragraph at the end.', 'A new paragraph, now longer and fuller than before.', 'expand');
  await open(W1, st.s42);
  ok(/Out of date\. An Improve changed the text after this check\./.test(await ai()), `improve: ${(await ai()).slice(0, 90)}`);

  // 9. A Restore after the check: out of date.
  await checkNow(st.s42, [VOICE]);
  st.addVersion(st.s42, cur42(), 'restore');
  await open(W1, st.s42);
  ok(/Out of date\. You restored another version after this check\./.test(await ai()), `restore: ${(await ai()).slice(0, 90)}`);

  // 10. The plan changed (a new word target): today's line.
  await checkNow(st.s42, [VOICE]);
  st.sectionOf(st.s42).s.word_target = 500;
  await open(W1, st.s42);
  ok(/Out of date\. The chapter, the positioning or the voice changed since this check\./.test(await ai()), `plan: ${(await ai()).slice(0, 110)}`);
  st.sectionOf(st.s42).s.word_target = 450;

  // 11. The suggestions cannot be read: the check counts as out of date (the general line), nothing breaks.
  await checkNow(st.s42, [{ ...OBJ, quote: 'Do this **five times**.' }, VOICE]);
  accepted(st.s42, 'Do this **five times**.', 'Do this five times, slowly.');
  modes.sugError = true;
  await open(W1, st.s42);
  ok(/Out of date\. The text, the chapter, the positioning or the voice changed since this check\./.test(await ai()) && (await state()) === 'stale', `read failed: ${(await ai()).slice(0, 110)}`);
  modes.sugError = false;
  await open(W1, st.s42);
  ok((await state()) === 'ready' && /Fixed 1 of 1 major finding/.test(await ai()), `read again: ${await state()}`);

  // 12. Needs review and an objective gap: "things left" in order, Show to each (22e, 7 and 9).
  await checkNow(st.s42, [GAP, VOICE], { objective: 'issues', voice: 'issues', drift: 'pass' });
  st.sectionOf(st.s42).s.needs_review = true;
  await open(W1, st.s42);
  ok((await block()) === '2 things left Fix them and this section is ready. You can still mark it Final now. Needs review: written before the positioning was unlocked Show 1 part of the objective is not covered Show', `left: ${await block()}`);
  await page.click('[data-chk-ready] [data-chk-left="0"]');
  ok(await g(() => document.activeElement && document.activeElement.matches('[data-mark-reviewed]')), 'Show on Needs review: focus on Mark as reviewed');
  await page.click('[data-chk-ready] [data-chk-left="1"]');
  ok(await g(() => document.activeElement && document.activeElement.matches('[data-chk-keep="0"]')), 'Show on the gap: focus on its Keep as is');
  ok(await shots('left') === false, 'left: no sideways scroll at 900 px');
  st.sectionOf(st.s42).s.needs_review = false;

  // 13. No check yet, clean text: "Run the AI check once", one Run button only (22e, 3).
  const CALM = 'Breathe out slowly and let your shoulders drop. Sit tall in your chair and rest your hands on your thighs. Let your jaw go soft and your tongue rest. Notice the floor under your feet and the chair under your hips. Stay here for three slow breaths, then open your eyes and look around the room.';
  st.addVersion(st.s51, CALM, 'manual');
  await open(W1, st.s51);
  ok((await state()) === 'nocheck' && (await block()) === 'Run the AI check once Your text has no issues. One AI check tells you if this section is ready. Run AI check', `nocheck: ${await block()}`);
  ok((await page.$$('.wr-chk [data-chk-run]')).length === 1, 'one Run button in the tab');
  ok(await shots('nocheck') === false, 'nocheck: no sideways scroll at 900 px');

  // 14. The sentences in the rows are plain text: no Markdown marks (here real bold); Show still selects the real text.
  st.addVersion(st.s51, `${CALM}\n\n**Another source** suggests a timer.`, 'manual');
  await open(W1, st.s51);
  const sent = await page.$$eval('[data-chk-row="source"] .wr-chk-sent', (xs) => xs.map((x) => x.textContent));
  ok(JSON.stringify(sent) === JSON.stringify(['Another source suggests a timer.']), `plain text: ${JSON.stringify(sent)}`);
  ok((await state()) === 'left' && /Source not named Show No AI check yet Run/.test(await block()), `left with no check: ${await block()}`);
  await page.click('[data-chk-row="source"] [data-chk-show]');
  ok((await selected()) === 'Another source suggests a timer.', `Show: ${await selected()}`);

  return log.join('\n');
};
