// Step 06 Write, E12 fix batch 2, Part 5 (design 23b): Generate chapter. The button in
// the head (option A) and its line; none on the Introduction; the confirm with the
// sections, the skipped one and the cost line (this month's average Write input +
// targets × 1.7, Sonnet prices); the limit warning and no tokens left; running (the
// queue, the open section follows it, everything else off); a section written, the next
// one starts; Stop (the stopped section stays empty, "Generate the rest"); done; a
// failure with "Try again from"; the month limit; leaving while it runs.
// Screenshots at 1440 and 900 px.
// Run: tests/browser/run.sh write t-chapter.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForTimeout(500);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const until = (fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms });
  const send = (event, data) => g(([e, d]) => window.__gen.send(e, d), [event, data]);
  const reqs = () => g(() => window.__gen.requests.map((r) => r.body));
  const card = () => txt('[data-chap]');
  const cardState = () => page.$eval('[data-chap]', (e) => e.dataset.chap).catch(() => null);
  const RUN = (n) => `c0000000-0000-4000-8000-00000000000${n}`;
  /** The server writes a section to the end: a current version, then done and saved. */
  const finish = async (sid, text, n) => {
    const v = st.addVersion(sid, text, 'generate');
    st.sectionOf(sid).s.status = 'draft';
    await send('done', { reason: 'complete', partial: false, counted: true });
    await send('saved', { versionId: v.id, versionNo: v.version_no, words: st.count(text), current: true, partial: false, conflict: false, flagged: 0 });
    await g(() => window.__gen.close());
    return v;
  };
  const shots = async (name, sel = '[data-chap]') => {
    await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-chapter-${name}-1440.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}`));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-chapter-${name}-900.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-900`));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(300);
    return sideways;
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // Chapter 2 "Setting Up" (three empty sections); 2.3 gets text, so it is skipped.
  const ch2 = st.outline[W1][2];
  const [s21, s22, s23] = ch2.sections.map((x) => x.id);
  st.addVersion(s23, 'Five safety checks come before every session. Check the chair, the floor and your shoes.', 'manual');
  st.sectionOf(s23).s.status = 'draft';

  // 1. The button in the head (1A) and its line; the Introduction has none (7).
  await open(W1, st.outline[W1][0].sections[0].id);
  ok(!(await has('[data-gen-chapter]')), 'Introduction: no Generate chapter button');
  await open(W1, s21);
  ok((await txt('[data-gen-chapter]')) === 'Generate chapter' && !(await page.$eval('[data-gen-chapter]', (b) => b.disabled)), 'chapter 2: Generate chapter is on');
  ok((await txt('#wrChapLine')) === 'Writes the 2 sections of this chapter that have no text, in order.', `line: ${await txt('#wrChapLine')}`);
  ok((await page.$eval('[data-gen-chapter]', (b) => b.getBoundingClientRect().height)) >= 44 && await page.$eval('[data-gen-chapter]', (b) => b.getAttribute('aria-describedby') === 'wrChapLine'), '44 px, described by its line');
  ok(await shots('button', '[data-head]') === false, 'button: no sideways scroll at 900 px');

  // 2. The confirm: the sections, the skipped one, the cost line (2); Cancel sends nothing.
  await page.click('[data-gen-chapter]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  const dlg = await txt('dialog[open]');
  ok(/^Generate chapter 2\? The AI writes the empty sections of “Setting Up: Chair, Space, Safety”, one at a time, in order\. Each one is saved as a new version\. You can stop at any time\./.test(dlg), `dialog: ${dlg.slice(0, 160)}`);
  ok(/2\.1 Choosing a sturdy chair with no wheels 350 words 2\.2 Clearing a safe space at home 300 words 2\.3 Five safety checks before every session Has text, so it is skipped\. Skipped/.test(dlg), `rows: ${dlg}`);
  // 2 sections: 2 × 8,400 input (this month's average) + 650 words × 1.7 output = 17,905 tokens; $0.0337 + $0.0111.
  ok((await txt('dialog[open] .wr-chap-cost')) === '2 AI calls, about 650 words. About $0.04 and 18,000 tokens. You have 1.21M tokens left this month.', `cost: ${await txt('dialog[open] .wr-chap-cost')}`);
  ok((await txt('dialog[open] [data-chap-go]')) === 'Generate 2 sections' && await g(() => document.activeElement && document.activeElement.matches('[data-chap-go]')), 'Generate 2 sections, focused');
  ok(await shots('confirm', 'dialog[open]') === false, 'confirm: no sideways scroll at 900 px');
  await page.click('dialog[open] [data-chap-cancel]');
  ok(!(await has('dialog[open]')) && (await reqs()).length === 0, 'Cancel: closed, no AI call');

  // 2b. Near the limit: the warning, Generate still on. No tokens left: off, with the reset date.
  st.usage = { resets: '2026-11-01T00:00:00+00:00', limit: 2000000, tokens: 1990000, by_stage: [] };
  await page.click('[data-gen-chapter]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  ok(/This may pass your monthly AI allowance\. You have about 10,000 tokens left\. Writing stops at the limit, and the sections written so far stay\./.test(await txt('dialog[open] .wr-chap-alert')), `near: ${await txt('dialog[open] .wr-chap-alert')}`);
  ok((await txt('dialog[open] .wr-chap-cost')) === '2 AI calls, about 650 words. About $0.04 and 14,000 tokens.', `near cost (6,500 a call with no Write call yet): ${await txt('dialog[open] .wr-chap-cost')}`);
  ok(await shots('near', 'dialog[open]') === false, 'near: no sideways scroll at 900 px');
  await page.click('dialog[open] [data-chap-cancel]');
  st.usage = { resets: '2026-11-01T00:00:00+00:00', limit: 2000000, tokens: 2000000, by_stage: [] };
  await page.click('[data-gen-chapter]');
  await until(() => !!document.querySelector('dialog[open] .wr-chap-alert'));
  ok((await txt('dialog[open] .wr-chap-alert')) === 'You have used this month’s AI allowance. It resets on November 1.' && await page.$eval('dialog[open] [data-chap-go]', (b) => b.disabled), 'no tokens left: the allowance line, Generate off');
  await page.click('dialog[open] [data-chap-cancel]');
  delete st.usage;

  // 3. Running: 1 of 2; the open section follows the queue; the editor, Generate section and Generate chapter are off.
  await page.click('[data-gen-chapter]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  await page.click('dialog[open] [data-chap-go]');
  await until(() => window.__gen.requests.length === 1);
  ok(JSON.stringify((await reqs())[0]) === JSON.stringify({ stage: 'section_write', bookId: W1, sectionId: s21, baseVersionId: null }), `request 1: ${JSON.stringify((await reqs())[0])}`);
  st.runs[s21] = { run_id: RUN(1), state: 'running', end_reason: null, version_id: null, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), stop_requested_at: null, ended_at: null };
  await send('start', { runId: RUN(1), aim: 350, target: 350, mode: 'write', recovered: null });
  await send('text', { t: 'Pick a chair with four legs, a flat seat and no wheels. ' });
  await until(() => /Pick a chair/.test((document.querySelector('[data-stream]') || {}).innerText || ''));
  ok((await cardState()) === 'run' && /^GENERATE CHAPTER · 1 OF 2 2\.1 Choosing a sturdy chair with no wheels Writing now 2\.2 Clearing a safe space at home Waiting Writing 2\.1 Choosing a sturdy chair with no wheels ≈ 12 \/ 350 words Stop/.test(await card()), `running: ${await card()}`);
  const off = await g(() => ({
    editor: document.querySelector('[data-editor]').getAttribute('contenteditable'),
    gen: document.querySelector('[data-generate]').disabled, chap: document.querySelector('[data-gen-chapter]').disabled,
    line: document.querySelector('#wrChapLine').innerText.trim()
  }));
  ok(off.editor === 'false' && off.gen && off.chap && off.line === 'Wait for the section to finish writing.', `everything else off: ${JSON.stringify(off)}`);
  ok((await txt(`[data-section="${s21}"] .wr-ms-pills`)) === 'Writing…' && (await txt(`[data-section="${s22}"] .wr-ms-pills`)) === 'Not started', 'the manuscript list shows which section is being written');
  ok(await shots('running') === false, 'running: no sideways scroll at 900 px');

  // 4. 2.1 written: the next one starts by itself, the open section follows.
  await finish(s21, 'Pick a chair with four legs, a flat seat and no wheels. Keep it against a wall.', 1);
  delete st.runs[s21];
  await until(() => window.__gen.requests.length === 2);
  ok((await reqs())[1].sectionId === s22 && await g((id) => location.search.includes(id), s22), '2.2 starts, and it is the open section');
  await until(() => /2\.1 Choosing a sturdy chair with no wheels Written · \d+ words/.test((document.querySelector('[data-chap]') || {}).innerText.replace(/\s+/g, ' ')));
  ok(/GENERATE CHAPTER · 2 OF 2/.test(await card()), `2 of 2: ${await card()}`);

  // 5. Stop during 2.2: it stops; the stopped section stays empty, so "Generate the rest (1)".
  st.runs[s22] = { run_id: RUN(2), state: 'running', end_reason: null, version_id: null, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), stop_requested_at: null, ended_at: null };
  await send('start', { runId: RUN(2), aim: 300, target: 300, mode: 'write', recovered: null });
  await send('text', { t: 'Clear a space as wide as your arms. ' });
  await until(() => /Clear a space/.test((document.querySelector('[data-stream]') || {}).innerText || ''));
  await page.click('[data-chap-stop]');
  for (let i = 0; i < 30 && !st.writes.some((w) => w.fn === 'request_section_stop'); i++) await page.waitForTimeout(100);
  ok(st.writes.filter((w) => w.fn === 'request_section_stop').map((w) => w.body.p_run_id).join() === RUN(2), 'Stop asks the server to stop the run (not an AI call)');
  const p22 = st.addVersion(s22, 'Clear a space as wide as your arms.', 'generate', { partial: true });
  st.sectionOf(s22).s.current_version_id = null;   // a partial is not current
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: p22.id, versionNo: p22.version_no, words: 8, current: false, partial: true, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  delete st.runs[s22];
  await until(() => !!document.querySelector('[data-chap="stopped"]'));
  ok(/^GENERATE CHAPTER · STOPPED Writing stopped Writing stopped\. The 8 words written so far are saved in Versions as v1\. They are not in your section yet\. The tokens used so far count toward your usage\. 2\.1 Choosing a sturdy chair with no wheels \d+ words 2\.2 Clearing a safe space at home Partial text in Versions Stopped Generate the rest \(1\) Close$/.test(await card()), `stopped: ${await card()}`);
  ok((await reqs()).length === 2, 'nothing else was sent');
  ok(await shots('stopped') === false, 'stopped: no sideways scroll at 900 px');

  // 6. Generate the rest: a new confirm with 2.2 only; then done (4).
  await page.click('[data-chap-rest]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  ok((await txt('dialog[open] [data-chap-go]')) === 'Generate 1 section' && /2\.2 Clearing a safe space at home 300 words/.test(await txt('dialog[open]')), 'the rest: 2.2 only');
  await page.click('dialog[open] [data-chap-go]');
  await until(() => window.__gen.requests.length === 3);
  await send('start', { runId: RUN(3), aim: 300, target: 300, mode: 'write', recovered: null });
  await send('text', { t: 'Clear a space as wide as your arms. ' });
  await finish(s22, 'Clear a space as wide as your arms. Move rugs and cords out of the way.', 3);
  await until(() => !!document.querySelector('[data-chap="done"]'));
  const w22 = st.count('Clear a space as wide as your arms. Move rugs and cords out of the way.');
  ok((await card()) === `GENERATE CHAPTER · DONE Chapter 2 is written 2.2 Clearing a safe space at home ${w22} words 1 section, ${w22} words. Each is a new version with the status Draft. Next, read each one and run its AI check. Close`, `done: ${await card()}`);
  ok(await g(() => document.activeElement && document.activeElement.matches('[data-chap-close]')), 'focus on Close');
  ok(await shots('done') === false, 'done: no sideways scroll at 900 px');
  await page.click('[data-chap-close]');
  ok(!(await has('[data-chap]')) && await page.$eval('[data-gen-chapter]', (b) => b.disabled) && (await txt('#wrChapLine')) === 'Every section in this chapter has text.', 'Close: the card goes; the chapter is full, so the button is off with the reason');

  // 7. A failure: "Try again from 3.1" goes on without a new confirm.
  const ch3 = st.outline[W1][3];
  const [s31, s32] = ch3.sections.map((x) => x.id);
  await open(W1, s31);
  await page.click('[data-gen-chapter]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  await g(() => { window.__gen.refuse = { status: 502, body: { error: 'ai_unavailable' } }; });
  await page.click('dialog[open] [data-chap-go]');
  await until(() => !!document.querySelector('[data-chap="failed"]'));
  ok(/^GENERATE CHAPTER · 1 OF 3 Writing stopped .+ 3\.1 Sitting tall without strain Failed 3\.2 Breathing in time with a move Waiting 3\.3 A two-minute check-in to start Waiting Try again from 3\.1 Stop$/.test(await card()), `failed: ${await card()}`);
  ok(await page.$eval('[data-chap] .alert', (a) => a.classList.contains('alert-error')) && await shots('failed') === false, 'an error alert; no sideways scroll at 900 px');
  const n7 = (await reqs()).length;
  await page.click('[data-chap-retry]');
  await until((n) => window.__gen.requests.length === n + 1, n7);
  ok((await reqs())[n7].sectionId === s31 && !(await has('dialog[open]')), 'Try again sends 3.1 again, with no new confirm');
  await send('start', { runId: RUN(4), aim: 400, target: 400, mode: 'write', recovered: null });
  await finish(s31, 'Sit tall on the front half of the seat.', 4);
  await until((n) => window.__gen.requests.length === n + 2, n7);
  ok((await reqs())[n7 + 1].sectionId === s32, 'then 3.2');

  // 8. Leaving while it runs: "Stop and leave?" with the queue's line; Keep writing stays.
  await send('start', { runId: RUN(5), aim: 400, target: 400, mode: 'write', recovered: null });
  await send('text', { t: 'Breathe in as you lift. ' });
  await page.click(`[data-section="${st.outline[W1][0].sections[0].id}"]`);   // the Introduction (always shown)
  await page.waitForSelector('dialog[open]', { timeout: 5000 });
  ok(/Stop and leave\? The text written so far in 3\.2 is saved in Versions\. 3\.3 is not written\./.test(await txt('dialog[open]')), `leave: ${await txt('dialog[open]')}`);
  ok(await shots('leave', 'dialog[open]') === false, 'leave: no sideways scroll at 900 px');
  await page.click('dialog[open] [data-ask-no]');
  ok(!(await has('dialog[open]')) && (await cardState()) === 'run' && await g((id) => location.search.includes(id), s32), 'Keep writing: still running on 3.2');
  await page.click('[data-chap-stop]');
  const p32 = st.addVersion(s32, 'Breathe in as you lift.', 'generate', { partial: true });
  st.sectionOf(s32).s.current_version_id = null;
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: p32.id, versionNo: p32.version_no, words: 5, current: false, partial: true, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('[data-chap="stopped"]'));
  ok(/3\.3 A two-minute check-in to start Not written/.test(await card()), 'stopped: 3.3 not written');
  await page.click('[data-chap-close]');

  // 9. The month limit: the server refuses before any AI call; no Try again (6b).
  const ch5 = st.outline[W1][5];
  await open(W1, ch5.sections[0].id);
  await page.click('[data-gen-chapter]');
  await page.waitForSelector('dialog[open] [data-chap-go]:not([disabled])', { timeout: 5000 });
  await g(() => { window.__gen.refuse = { status: 429, body: { error: 'monthly_limit' } }; });
  await page.click('dialog[open] [data-chap-go]');
  await until(() => !!document.querySelector('[data-chap="limit"]'));
  ok(/^GENERATE CHAPTER · 1 OF 3 Writing stopped You have used this month’s AI allowance\. It resets on \w+ 1\. The server refused 5\.1 before any AI call\. This refusal was not counted\. 5\.1 .+ Not sent 5\.2 .+ Not sent 5\.3 .+ Not sent Close$/.test(await card()), `limit: ${await card()}`);
  ok(!(await has('[data-chap-retry]')), 'no Try again');

  return log.join('\n');
};
