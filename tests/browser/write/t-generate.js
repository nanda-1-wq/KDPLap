// Step 06 Write (E10.2): Generate section. The page's fetch answers
// /functions/v1/generate with a stream this test drives (mock.js, window.__gen).
// Here: the request, saving first, read only while writing, the progress line,
// the source pill, Stop (at the first token, before any text, mid-text), Keep
// partial text, Discard, a double click, rule B, another tab, the positioning.
// Failures, lost streams and leaving mid-stream: t-gen-ends.js.
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
  const requests = () => g(() => window.__gen.requests.map((r) => r.body));
  const writes = (fn) => st.writes.filter((w) => w.fn === fn);
  const until = (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms });
  const RUN = 'a0000000-0000-4000-8000-0000000000r1'.replace('r1', '01');
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. An empty section, nothing typed: no save first; the request; read only while writing.
  await open(W1, st.s43);
  ok((await txt('[data-generate]')) === 'Generate section' && !(await page.$eval('[data-generate]', (b) => b.disabled)), 'Generate section is on');
  ok(await page.$eval('[data-hint]', (h) => h.hidden), 'no "generate the rest" hint in an empty section');
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length === 1);
  const req1 = (await g(() => window.__gen.requests[0]));
  ok(JSON.stringify(req1.body) === JSON.stringify({ stage: 'section_write', bookId: W1, sectionId: st.s43, baseVersionId: null }), `request: ${JSON.stringify(req1.body)}`);
  ok(/^Bearer /.test(req1.headers.Authorization) && typeof req1.headers.apikey === 'string' && req1.headers.apikey.length > 20, 'the user JWT and the anon key are sent');
  ok(writes('save_version').length === 0, 'nothing typed: no version before Generate');
  await send('start', { runId: RUN, aim: 500, target: 500, mode: 'write', recovered: null });
  await send('text', { t: 'Hold your arms out to the sides, just below shoulder height. ' });
  await until(() => /Hold your arms out/.test((document.querySelector('[data-stream]') || {}).innerText || ''));
  ok((await txt('#wrGenTitle')) === 'Writing 4.3 Arm circles below the shoulder', `title: "${await txt('#wrGenTitle')}"`);
  ok(/^≈ 11 \/ 500 words$/.test(await txt('[data-gen-count]')), `progress: "${await txt('[data-gen-count]')}"`);
  ok(await page.$eval('[data-stream] .wr-cursor', () => true).catch(() => false), 'a cursor after the streamed text');
  const ro = await g(() => ({
    editor: document.querySelector('[data-editor]').getAttribute('contenteditable'),
    tools: [...document.querySelectorAll('[data-cmd]')].every((b) => b.disabled),
    status: document.querySelector('[data-status]').disabled,
    save: document.querySelector('[data-save-version]').disabled,
    gen: document.querySelector('[data-generate]').disabled,
    stop: !!document.querySelector('[data-gen-stop]') && !document.querySelector('[data-gen-stop]').disabled
  }));
  ok(ro.editor === 'false' && ro.tools && ro.status && ro.save && ro.gen && ro.stop, `read only while writing: ${JSON.stringify(ro)}`);
  ok((await page.$eval('[data-gen-stop]', (b) => b.getBoundingClientRect().height)) >= 44, 'Stop is at least 44 px');
  await send('text', { t: 'Studies show arm circles cut shoulder pain by 30%. [Verify: no source]' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/t-generate-writing-1440.png` });
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/t-generate-writing-900.png` });
  await page.setViewportSize({ width: 1440, height: 960 });
  // The server saves v1 (current) and says so.
  const full1 = 'Hold your arms out to the sides, just below shoulder height. Studies show arm circles cut shoulder pain by 30%. [Verify: no source]';
  const v1 = st.addVersion(st.s43, full1, 'generate');
  st.sectionOf(st.s43).s.status = 'draft';
  await send('done', { reason: 'complete', partial: false, counted: true });
  await send('saved', { versionId: v1.id, versionNo: 1, words: 18, current: true, partial: false, conflict: false, flagged: 1 });
  await g(() => window.__gen.close());
  await until(() => /Saved as v1/.test((document.querySelector('[data-foot]') || {}).innerText || ''));
  ok(await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable') === 'true' && /Hold your arms out/.test(e.innerText)), 'the saved text is in the editor, editable again');
  ok((await txt('[data-editor] .md-flag')) === 'Verify: no source' && (await txt('[data-editor] .md-unsourced')) === 'Studies show arm circles cut shoulder pain by 30%.', 'the pill and the underlined sentence');
  ok(await page.$eval('[data-editor] .md-flag svg', () => true).catch(() => false), 'the pill has an icon');
  ok(/1 claim needs a source\. Check the marked sentences\./.test(await txt('[data-gen]')), `flagged note: "${await txt('[data-gen]')}"`);
  ok(/Draft/.test(await txt(`[data-section="${st.s43}"]`)), 'manuscript: 4.3 is Draft');
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)), 'Generate is on again');
  ok(/^v1 · First draft Current/.test(await txt('.wr-ver.is-current')), `Versions: "${await txt('.wr-ver.is-current')}"`);
  await page.screenshot({ path: `${SHOTS}/t-generate-done.png` });
  // The pill round-trips: typing keeps the flag in the stored text.
  await page.click('[data-editor] p');
  await page.keyboard.press('End');
  await page.keyboard.type(' Ok.');
  await page.waitForTimeout(1200);
  const d43 = st.drafts[st.s43];
  ok(d43 && d43.content.includes('30%. [Verify: no source] Ok.'), `draft keeps the flag: ${JSON.stringify(d43 && d43.content)}`);

  // 2. Typed text: saved as a version first, then Generate from it (rule: nothing typed is lost).
  await open(W1, st.s42);
  ok(!(await page.$eval('[data-hint]', (h) => h.hidden)) && (await txt('[data-hint]')) === 'Keep writing, or generate the rest of this section.', 'hint under the target');
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Breathe out.');
  const before = writes('save_version').length;
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length === 1);
  const sv = writes('save_version').slice(before);
  const cur42 = st.sectionOf(st.s42).s.current_version_id;
  ok(sv.length === 1 && /Breathe out\./.test(sv[0].body.p_content), 'one manual version first');
  ok((await requests())[0].baseVersionId === cur42, 'Generate sends the new version as its base');
  // 3. Stop mid-text: the stop call, "Stopping…", no more text shown.
  await send('start', { runId: RUN, aim: 380, target: 450, mode: 'continue', recovered: null });
  await send('text', { t: 'Next, reverse the direction. ' });
  await until(() => /reverse the direction/.test(document.querySelector('[data-stream]').innerText));
  await page.click('[data-gen-stop]');
  await until(() => document.querySelector('[data-gen-stop]') && document.querySelector('[data-gen-stop]').disabled);
  for (let i = 0; i < 30 && !writes('request_section_stop').length; i++) await page.waitForTimeout(100);
  ok(writes('request_section_stop').length === 1 && writes('request_section_stop')[0].body.p_run_id === RUN, 'Stop calls request_section_stop with the run id');
  ok((await txt('#wrGenTitle')) === 'Stopping and saving…' && (await txt('[data-gen-stop]')) === 'Stopping…', 'Stopping…');
  await send('text', { t: 'Late text after Stop. ' });
  await page.waitForTimeout(200);
  ok(!/Late text/.test(await txt('[data-stream]') || ''), 'no more text after Stop');
  const p5 = st.addVersion(st.s42, 'Next, reverse the direction.', 'generate', { partial: true, label: 'Continued' });
  st.sectionOf(st.s42).s.current_version_id = cur42;      // a partial is not current
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: p5.id, versionNo: p5.version_no, words: 4, current: false, partial: true, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => /Writing stopped\./.test((document.querySelector('[data-gen]') || {}).innerText || ''));
  const card = await txt('[data-gen]');
  ok(card.includes(`The 4 words written so far are saved in Versions as v${p5.version_no}. They are not in your section yet. The tokens used so far count toward your usage.`), `stopped card: "${card}"`);
  ok(await page.$eval('[data-editor]', (e) => /Breathe out\./.test(e.innerText) && !/reverse the direction/.test(e.innerText)), 'the editor still shows the section text');
  ok(await page.$eval('[data-gen-keep]', (b) => b.classList.contains('btn-primary')) && (await txt('[data-gen-discard]')) === 'Discard', 'Keep partial text (primary) and Discard');
  await page.waitForSelector('.wr-tag', { timeout: 5000 }).catch(() => {});
  ok((await txt(`.wr-ver:not(.is-current) .wr-tag`)) === 'Partial', 'Versions: the partial has a "Partial" tag');
  await page.screenshot({ path: `${SHOTS}/t-generate-stopped.png` });
  // 4. Discard: nothing is written; the partial stays in Versions.
  const w0 = st.writes.length;
  await page.click('[data-gen-discard]');
  await page.waitForTimeout(300);
  ok(st.writes.length === w0 && st.sectionOf(st.s42).s.current_version_id === cur42, 'Discard writes nothing; the current version is unchanged');
  ok((await txt('[data-gen]')) === '' && /The partial text stays in Versions/.test(await txt('[data-live]')), 'card closed, announced');
  ok(await page.$eval('[data-generate]', (b) => document.activeElement === b), 'focus back on Generate');

  // 5. Stop right after the first token, then Keep partial text: a restore with the partial id.
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length === 2);
  await send('start', { runId: RUN, aim: 380, target: 450, mode: 'continue', recovered: { versionNo: 3 } });
  await until(() => /earlier try/.test(document.querySelector('[data-gen]').innerText)).catch(() => {});
  ok(/Text from an earlier try that stopped is saved in Versions as v3\./.test(await txt('[data-gen]')), 'rule A: the recovered run is named');
  await send('text', { t: 'Now' });
  await until(() => /Now/.test(document.querySelector('[data-stream]').innerText));
  await page.click('[data-gen-stop]');
  const p6 = st.addVersion(st.s42, 'Now', 'generate', { partial: true, label: 'Continued' });
  st.sectionOf(st.s42).s.current_version_id = cur42;
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: p6.id, versionNo: p6.version_no, words: 1, current: false, partial: true, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('[data-gen-keep]'));
  ok(/The 1 word written so far is saved in Versions/.test(await txt('[data-gen]')), `one word: "${await txt('[data-gen]')}"`);
  await page.click('[data-gen-keep]');
  await until(() => /Kept the partial text/.test(document.querySelector('[data-live]').innerText));
  const rv = writes('restore_version').pop();
  ok(rv && rv.body.p_version_id === p6.id && rv.body.p_base_version_id === cur42, `restore body: ${JSON.stringify(rv && rv.body)}`);
  await page.waitForTimeout(400);
  ok(/^v\d+ · Kept partial text from v\d+ Current/.test(await txt('.wr-ver.is-current')), `kept label: "${await txt('.wr-ver.is-current')}"`);
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim() === 'Now'), 'the partial text is now the section text');

  // 6. Stop before any text: "Nothing was saved."
  await page.click('[data-generate]');
  await until(() => window.__gen.requests.length === 3);
  await send('start', { runId: RUN, aim: 449, target: 450, mode: 'continue', recovered: null });
  await page.click('[data-gen-stop]');
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => /before any text/.test((document.querySelector('[data-gen]') || {}).innerText || ''));
  ok(/Writing stopped before any text\. Nothing was saved\./.test(await txt('[data-gen]')) && !(await page.$('[data-gen-keep]')), 'stop before any text: nothing saved, no Keep');
  await page.click('[data-gen-close]');

  // 7. A double click sends one request.
  await page.dblclick('[data-generate]');
  await page.waitForTimeout(400);
  ok((await requests()).length === 4, `double click: ${(await requests()).length - 3} request(s)`);
  await send('start', { runId: RUN, aim: 449, target: 450, mode: 'continue', recovered: null });
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('[data-gen-close]'));
  await page.click('[data-gen-close]');

  // 8. Rule B: at the target, Generate asks first; Cancel sends nothing; "Write more" sends more: true.
  st.sectionOf(st.s42).s.word_target = 1;
  await open(W1, st.s42);
  ok(await page.$eval('[data-hint]', (h) => h.hidden), 'no hint at the target');
  await page.click('[data-generate]');
  await page.waitForSelector('dialog[open] #wrAskTitle', { timeout: 5000 });
  ok((await txt('dialog[open] [data-ask-text]')) === 'This section has 1 of 1 words. Write more anyway?', `rule B: "${await txt('dialog[open] [data-ask-text]')}"`);
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(200);
  ok((await requests()).length === 0, 'Cancel: no request');
  await page.click('[data-generate]');
  await page.waitForSelector('dialog[open] [data-ask-yes]');
  await page.click('dialog[open] [data-ask-yes]');
  await until(() => window.__gen.requests.length === 1);
  ok((await requests())[0].more === true, 'Write more sends more: true');
  await send('start', { runId: RUN, aim: 300, target: 1, mode: 'continue', recovered: null });
  ok(/^≈ 0 \/ 300 words$/.test(await txt('[data-gen-count]')), 'more: 300 words aimed');
  await send('done', { reason: 'user_stop', partial: true, counted: true });
  await send('saved', { versionId: null, versionNo: null, words: 0, current: false, partial: false, conflict: false, flagged: 0 });
  await g(() => window.__gen.close());
  await until(() => !!document.querySelector('[data-gen-close]'));
  await page.click('[data-gen-close]');
  st.sectionOf(st.s42).s.word_target = 450;
  // The server's own count (target_reached) asks the same way.
  await open(W1, st.s42);
  await g(() => { window.__gen.refuse = { status: 422, body: { error: 'target_reached', words: 452, target: 450 } }; });
  await page.click('[data-generate]');
  await page.waitForSelector('dialog[open] [data-ask-text]', { timeout: 5000 });
  ok((await txt('dialog[open] [data-ask-text]')) === 'This section has 452 of 450 words. Write more anyway?', `target_reached from the server asks with its numbers: "${await txt('dialog[open] [data-ask-text]')}"`);
  await page.click('dialog[open] [data-ask-no]');

  // 9. Another tab is writing this section: Generate is off with the note; Check again clears it.
  st.runs[st.s52] = { run_id: 'b0000000-0000-4000-8000-000000000002', state: 'running', end_reason: null, version_id: null, started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), stop_requested_at: null, ended_at: null };
  await open(W1, st.s52);
  ok(await page.$eval('[data-generate]', (b) => b.disabled) && /This section is being written in another tab or window\./.test(await txt('[data-gen]')), 'other tab: off, with the note');
  st.runs[st.s52].state = 'ended';
  st.runs[st.s52].ended_at = new Date().toISOString();
  await page.click('[data-run-check]');
  await page.waitForTimeout(400);
  ok(!(await page.$eval('[data-generate]', (b) => b.disabled)) && (await txt('[data-gen]')) === '', 'Check again: on');
  // The server says run_in_progress (the race): the same note.
  await g(() => { window.__gen.refuse = { status: 409, body: { error: 'run_in_progress' } }; });
  await page.click('[data-generate]');
  await page.waitForTimeout(500);
  ok(await page.$eval('[data-generate]', (b) => b.disabled) && /being written in another tab/.test(await txt('[data-gen]')), '409 run_in_progress: the same note');

  // 10. Positioning not locked: off, with the way to lock it.
  await open(W6, st.w6s);
  ok(await page.$eval('[data-generate]', (b) => b.disabled) && /Generate section needs the positioning locked\. Lock it in 03\./.test(await txt('[data-gen]')), 'positioning not locked: off, with a link to 03');

  return log.join('\n') + `\nCALLS ${st.calls.filter((c) => c.startsWith('ERR')).join(' | ')}`;
};
