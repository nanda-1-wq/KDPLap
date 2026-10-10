// Step 06 Write (E10.2): how a Generate can end besides complete and Stop.
// The server timed out (Failed card, not counted, Try again), the save failed
// (text kept read only, Copy text), the stream was lost (the run row is read),
// a conflict at save, refusals before the stream (version_conflict, limits,
// AI unavailable), a failed save first, a blank draft, and leaving mid-stream.
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
  const g = (fn, arg) => page.evaluate(fn, arg);
  const send = (event, data) => g(([e, d]) => window.__gen.send(e, d), [event, data]);
  const reqs = () => g(() => window.__gen.requests.length);
  const writes = (fn) => st.writes.filter((w) => w.fn === fn);
  const until = (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms });
  const RUN = 'a0000000-0000-4000-8000-000000000002';
  const start = async (n) => {
    await page.click('[data-generate]');
    await until((k) => window.__gen.requests.length === k, n);
    await send('start', { runId: RUN, aim: 380, target: 450, mode: 'continue', recovered: null });
  };
  /** Ends any run still open, so no "Leave site?" prompt stops the next page load. */
  const finish = async () => {
    await send('done', { reason: 'user_stop', partial: true, counted: true });
    await send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
    await g(() => window.__gen.close());
    await page.waitForTimeout(300);
  };
  await page.setViewportSize({ width: 1440, height: 960 });
  const cur42 = () => st.sectionOf(st.s42).s.current_version_id;

  // 1. Soft deadline: design 23 Failed, not counted, the partial in Versions; Try again sends a new request.
  await open(W1, st.s42);
  await start(1);
  await send('text', { t: 'Next, reverse the direction: up, forward, and down.' });
  const p1 = st.addVersion(st.s42, 'Next, reverse the direction: up, forward, and down.', 'generate', { partial: true, label: 'Continued' });
  const keep = cur42();
  st.sectionOf(st.s42).s.current_version_id = st.versions.filter((v) => v.section_id === st.s42 && !v.partial).pop().id;
  await send('done', { reason: 'timeout', partial: true, counted: false });
  await send('saved', { versionId: p1.id, versionNo: p1.version_no, words: 9, current: false, partial: true, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('#wrFailTitle'));
  const fail = await txt('[data-gen]');
  ok(/^FAILED Generation stopped/.test(fail), `failed card: "${fail}"`);
  ok(fail.includes('The AI service did not respond in time. Your text and versions are safe. This attempt was not counted in your usage.'), 'the alert: not counted');
  ok(fail.includes(`The 9 words written so far are saved in Versions as v${p1.version_no}.`), 'the partial is named');
  ok(await page.$eval('[data-gen-retry]', (b) => b.classList.contains('btn-primary')) && !!(await page.$('[data-gen-keep]')) && (await txt('[data-gen-discard]')) === 'Discard', 'Try again (primary), Keep partial text, Discard');
  ok(await page.$eval('.wr-out .alert svg', () => true).catch(() => false) && await page.$eval('.wr-out-label svg', () => true).catch(() => false), 'icon and word on the failure');
  await page.screenshot({ path: `${SHOTS}/t-gen-failed.png` });
  await page.click('[data-gen-retry]');
  await until(() => window.__gen.requests.length === 2);
  ok(true, 'Try again sends a new request');
  // 2. An AI error with no text: "Nothing was written."
  await send('start', { runId: RUN, aim: 380, target: 450, mode: 'continue', recovered: null });
  await send('done', { reason: 'ai_error', partial: true, counted: false });
  await send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('#wrFailTitle'));
  ok(/The AI service stopped\..*Nothing was written\./.test(await txt('[data-gen]')) && !(await page.$('[data-gen-keep]')), `ai_error, no text: "${await txt('[data-gen]')}"`);

  // 3. The save failed: the text stays on screen, read only, with Copy text; nothing counted (answer 9).
  await page.click('[data-gen-retry]');
  await until(() => window.__gen.requests.length === 3);
  await send('start', { runId: RUN, aim: 380, target: 450, mode: 'continue', recovered: null });
  await send('text', { t: 'Keep your breath slow as you roll.' });
  await send('done', { reason: 'complete', partial: false, counted: true });
  await send('error', { error: 'save_failed' });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('[data-gen-copy]'));
  ok(/We couldn’t save the new text\. Nothing was counted\./.test(await txt('[data-gen]')), 'save failed: the message');
  ok((await txt('[data-stream]')) === 'NEW TEXT · NOT SAVED Keep your breath slow as you roll.' && await page.$eval('[data-stream]', (e) => !e.isContentEditable), `the text stays on screen, read only: "${await txt('[data-stream]')}"`);
  ok(await page.$eval('[data-stream]', (e) => { const r = e.getBoundingClientRect(); const c = e.closest('.wr-card').getBoundingClientRect(); return r.height > 40 && r.top < c.bottom; }), 'the kept text is visible, not squeezed');
  ok(await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable') === 'true'), 'the section can be edited again');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5500' }).catch(() => {});
  await page.click('[data-gen-copy]');
  await page.waitForTimeout(200);
  const clip = await g(() => navigator.clipboard.readText()).catch(() => null);
  ok(clip === 'Keep your breath slow as you roll.' || /selected/.test(await txt('[data-live]')), `Copy text: ${JSON.stringify(clip)} / "${await txt('[data-live]')}"`);
  await page.screenshot({ path: `${SHOTS}/t-gen-save-failed.png` });
  await page.click('[data-gen-close]');
  ok((await txt('[data-stream]')) === '' || await page.$eval('[data-stream]', (e) => e.hidden), 'Close hides the kept text');

  // 4. Conflict at save: another tab saved while the AI wrote.
  await start(4);
  await send('text', { t: 'More text.' });
  const p4 = st.addVersion(st.s42, 'More text.', 'generate', { label: 'Continued' });
  await send('done', { reason: 'complete', partial: false, counted: true });
  await send('saved', { versionId: p4.id, versionNo: p4.version_no, words: 2, current: false, partial: false, conflict: true, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => /saved in another tab while the AI was writing/.test(document.querySelector('[data-gen]').innerText));
  ok((await txt('[data-gen]')).includes(`The new text is saved in Versions as v${p4.version_no}.`), `conflict at save: "${await txt('[data-gen]')}"`);

  // 5. The stream is lost: Write reads the run row; the server saved the partial and counted it.
  await page.click('[data-gen-close]');
  await start(5);
  await send('text', { t: 'Lost after this.' });
  await until(() => /Lost after this/.test(document.querySelector('[data-stream]').innerText));
  const p5 = st.addVersion(st.s42, 'Lost after this.', 'generate', { partial: true, label: 'Continued' });
  st.runs[st.s42] = { run_id: RUN, state: 'ended', end_reason: 'disconnect', version_id: p5.id, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), stop_requested_at: null, ended_at: new Date().toISOString() };
  await g(() => window.__gen.fail());
  await until(() => /The connection was lost/.test(document.querySelector('[data-gen]').innerText), null, 8000);
  ok(/The connection was lost\. The text written so far is saved in Versions\. The tokens used so far count toward your usage\./.test(await txt('[data-gen]')), `lost: "${await txt('[data-gen]')}"`);
  ok(st.calls.some((c) => c.startsWith('GET /rest/v1/section_runs')), 'the run row was read');
  await page.click('[data-gen-close]');
  delete st.runs[st.s42];

  // 6. Refusals before the stream: nothing streamed, the right message.
  for (const [status, body, re] of [
    [429, { error: 'monthly_limit' }, /You have used this month’s AI allowance/],
    [429, { error: 'rate_limited' }, /Too many requests\. Wait a minute, then try again\./],
    [502, { error: 'ai_unavailable' }, /The AI service did not answer\. This try was not counted\./],
    [409, { error: 'outline_not_approved' }, /Approve the outline in 05 to generate\./]
  ]) {
    await g((r) => { window.__gen.refuse = r; }, { status, body });
    const n = await reqs();
    await page.click('[data-generate]');
    await until((k) => window.__gen.requests.length === k, n + 1);
    await page.waitForTimeout(300);
    ok(re.test(await txt('[data-gen]')) && (await txt('[data-stream]') || '') === '', `${body.error}: "${await txt('[data-gen]')}"`);
    ok(await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable') === 'true'), `${body.error}: editable again`);
  }
  await page.click('[data-gen-close]');

  // 7. version_conflict (another tab saved, nothing typed here): the newest text loads, nothing streamed.
  const other = st.addVersion(st.s42, 'Saved in the other tab just now.', 'manual');
  await g(() => { window.__gen.refuse = { status: 409, body: { error: 'version_conflict' } }; });
  await page.click('[data-generate]');
  await until(() => /updated in another tab/.test(document.querySelector('[data-live]').innerText));
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim() === 'Saved in the other tab just now.') && cur42() === other.id, 'version_conflict: the newest text is shown');

  // 8. The save first fails: Generate stops there, nothing is sent.
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Typed.');
  modes.versionError = true;
  const n8 = await reqs();
  await page.click('[data-generate]');
  await page.waitForTimeout(1500);
  ok((await reqs()) === n8 && /We couldn’t save a version/.test(await txt('[data-notes]')), `save error first: no request; "${await txt('[data-notes]')}"`);
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)) && await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable') === 'true'), 'editable, Generate on again');
  modes.versionError = false;

  // 9. Type then delete in an empty section: the blank draft makes no version; base null.
  await open(W1, st.s51);
  await page.click('[data-editor]');
  await page.keyboard.type('x');
  await page.waitForTimeout(1100);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1100);
  const sv9 = writes('save_version').length;
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length === 1);
  const b9 = await g(() => window.__gen.requests[0].body);
  ok(writes('save_version').length === sv9 && b9.baseVersionId === null, `blank draft: no version, base null (${JSON.stringify(b9)})`);
  await send('start', { runId: RUN, aim: 400, target: 400, mode: 'write', recovered: null });

  // 10. Leaving mid-stream asks first: another section, another step, Exit, closing the tab.
  await page.click(`[data-section="${st.s52}"]`);
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 5000 });
  ok((await txt('dialog[open] #wrAskTitle')) === 'Writing is in progress' && (await txt('dialog[open] [data-ask-yes]')) === 'Stop and leave' && (await txt('dialog[open] [data-ask-no]')) === 'Keep writing', 'section switch asks first');
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(200);
  ok(new URL(page.url()).searchParams.get('section') === st.s51 && !!(await page.$('[data-gen-stop]')), 'Keep writing: still here, still writing');
  await page.click('a[data-step="5"]');
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 5000 });
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(200);
  ok(new URL(page.url()).searchParams.get('step') === '6' && !!(await page.$('.wr-editor')), 'step change asks; Keep writing stays on 06');
  await page.click('.exit-link');
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 5000 });
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(200);
  ok(/book\.html/.test(page.url()), 'Exit asks; Keep writing stays');
  const prevented = await g(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  ok(prevented, 'closing the tab while writing: the browser asks');
  // Stop and leave: the stop call, then it waits for "saved", then opens the other section.
  await page.click(`[data-section="${st.s52}"]`);
  await page.waitForSelector('dialog[open] [data-ask-yes]');
  await page.click('dialog[open] [data-ask-yes]');
  for (let i = 0; i < 30 && !writes('request_section_stop').some((w) => w.body.p_run_id === RUN); i++) await page.waitForTimeout(100);
  ok(writes('request_section_stop').some((w) => w.body.p_run_id === RUN), 'Stop and leave: the stop call');
  await page.waitForTimeout(300);
  ok(new URL(page.url()).searchParams.get('section') === st.s51, 'it waits for the save before leaving');
  await finish();
  await until((s) => new URL(location.href).searchParams.get('section') === s, st.s52);
  ok(true, 'then it opens the other section');
  const after = await g(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  ok(!after, 'nothing running: no prompt');

  return log.join('\n') + `\nCALLS ${st.calls.filter((c) => c.startsWith('ERR')).join(' | ')}`;
};
