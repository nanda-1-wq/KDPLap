const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, timeout: 60000, fullPage: true }).catch(() => {});
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.outerHTML || '').replace(/>[\s\S]*$/, '>') : ''; });
  const posWrites = () => st.writes.filter((w) => w.table === 'positioning');
  const waitSaved = async () => { await page.waitForTimeout(80); return waitSaved0(); };
  const waitSaved0 = () => page.waitForFunction(() => document.querySelector('[data-saved-line]') && document.querySelector('[data-saved-line]').dataset.state === 'saved', null, { timeout: 5000 });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ── Empty state
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-card="one_sentence"] textarea');
  ok((await txt('[data-step-title]')) === 'Positioning', 'title Positioning');
  ok((await txt('.posn-intro')) === 'Why should this book exist? Edit anything, then approve. Every later step follows it.', 'intro text');
  ok((await page.$$('.posn-card')).length === 6, 'six cards');
  ok(await page.isDisabled('[data-lock-btn]'), 'lock disabled when empty');
  ok((await txt('#lockNote')) === 'Add the one sentence, the reader promise, 1 line in what books lack, your approach and 1 selling point first.', 'lock reason lists every required card');
  ok(await page.isDisabled('[data-run-drift]') && (await txt('#driftNote')) === 'Write at least one card first.', 'drift disabled with nothing written');
  ok(!(await page.isDisabled('[data-next]')), 'Next free on step 03');
  ok(!(await page.$('.step-link[data-step="3"].is-done')), 'step 03 not done');
  ok(/positioning\(one_sentence,reader_promise,approach,lacks,selling_points,focus_tags,drift_flags,drift_checked_at,locked_at,updated_at\)/.test(st.calls.find((c) => c.startsWith('GET /rest/v1/books')).replace(/\s/g, '')), 'getBook embeds positioning');
  await page.waitForSelector('[data-copy-gaps]');
  ok((await txt('[data-copy-gaps]')) === 'Copy 2 gaps from Research', 'copy gaps button');
  await shot('p01-empty');

  // ── Copy gaps
  await page.click('[data-copy-gaps]');
  await waitSaved();
  const gl = await txt('[data-card="lacks"] .posn-list');
  ok(gl === 'A plan that gets harder each week Large print for aging eyes', 'gaps copied as a list ' + gl);
  const w0 = posWrites()[0];
  ok(w0.method === 'POST' && w0.onConflict === 'book_id' && JSON.stringify(w0.body) === JSON.stringify({ lacks: ['A plan that gets harder each week', 'Large print for aging eyes'], book_id: P1 }), 'first save is an upsert with lacks only');
  ok(!(await page.$('[data-copy-gaps]')), 'copy button gone');
  ok((await txt('#lockNote')).startsWith('Add the one sentence, the reader promise, your approach and 1 selling point'), 'lock reason drops lacks');

  // ── Help me draft (all cards), with Stop visible while working
  M.genDelay = 700;
  await page.click('[data-help-all]');
  await page.waitForSelector('[data-help-area] [data-help-stop]');
  ok((await active()).includes('data-help-stop'), 'focus moves to Stop');
  ok(await page.isDisabled('[data-help-all]') && await page.isDisabled('[data-card="approach"] [data-redraft]') && await page.isDisabled('[data-run-drift]'), 'AI buttons off while drafting');
  ok((await txt('[data-help-area]')).includes('Drafting from your Brief and Research'), 'working text');
  await shot('p02-drafting');
  await page.waitForSelector('[data-suggest="one_sentence"] .bio-suggest');
  M.genDelay = 0;
  ok(JSON.stringify(st.gens[0]) === JSON.stringify({ stage: 'positioning_help', bookId: P1 }), 'help sends ids only');
  ok((await active()).includes('data-suggest-text'), 'focus on first suggestion');
  ok((await txt('[data-help-area]')).includes('Suggestions are ready under one-sentence positioning, reader promise, what current books lack, your approach, key selling points and focus tags.'), 'ready note names the cards');
  ok((await txt('[data-suggest="reader_promise"] .posn-verify')) === 'Verify: no source for 20. Your Brief and Research do not have this number.', 'Verify: no source chip');
  ok(!(await page.$('[data-suggest="approach"] .posn-verify')), 'no chip where numbers are sourced');
  ok((await page.textContent('[data-card="one_sentence"] textarea')) === '' && (await page.inputValue('[data-card="one_sentence"] textarea')) === '', 'nothing replaced before Accept');
  ok((await txt('[data-suggest="lacks"] .field-hint')) === 'Accept replaces this card.', 'lacks: replaces');
  ok((await txt('[data-suggest="one_sentence"] .field-hint')) === 'Accept puts it in this card.', 'one sentence: puts it in');
  await shot('p03-suggestions');

  // Accept / Discard
  await page.click('[data-accept="one_sentence"]');
  ok((await txt('[data-card="one_sentence"] .posn-text')).startsWith('A beginner-friendly chair yoga guide for adults over 60 with stiff knees'), 'accepted long one sentence shows as text');
  ok((await active()).includes('data-edit="one_sentence"'), 'focus on Edit after accept');
  await page.click('[data-accept="reader_promise"]');
  await page.click('[data-accept="approach"]');
  await page.click('[data-accept="selling_points"]');
  await page.click('[data-discard="lacks"]');
  ok((await txt('[data-card="lacks"] .posn-list')) === 'A plan that gets harder each week Large print for aging eyes', 'discard keeps the copied gaps');
  await page.click('[data-discard="focus_tags"]');
  ok((await txt('[data-help-area]')) === '', 'note gone after the last choice');
  await waitSaved();
  ok((await txt('[data-card="selling_points"] .posn-count')) === '4', 'selling points count 4');
  ok((await txt('#lockNote')) === 'Run the drift check first.', 'lock reason: run the check');
  const saved = st.books[P1].pos;
  ok(saved.one_sentence.length > 360 && saved.one_sentence.length <= 400 && saved.selling_points.length === 4, 'saved real-length text');

  // ── Tags
  await page.fill('[data-tag-input]', 'Seated routines');
  await page.press('[data-tag-input]', 'Enter');
  const a1 = await active(); ok(a1.includes('data-tag-input'), 'focus back in tag input ' + a1);
  await page.fill('[data-tag-input]', 'seated ROUTINES ');
  await page.press('[data-tag-input]', 'Enter');
  ok((await txt('[data-tag-error]')) === 'You already have this tag.', 'duplicate tag refused');
  await page.fill('[data-tag-input]', 'Large print');
  await page.click('[data-tag-add]');
  ok((await page.$$('.posn-tag')).length === 2, 'two tags');
  await page.click('[data-tag-remove="0"]');
  ok((await txt('.posn-tags')) === 'Large print', 'tag removed');
  await waitSaved();
  ok(JSON.stringify(st.books[P1].pos.focus_tags) === '["Large print"]', 'tags saved ' + JSON.stringify(st.books[P1].pos.focus_tags));

  // ── Drift check: cards read-only while it runs
  M.genDelay = 600;
  await page.click('[data-run-drift]');
  await page.waitForSelector('.posn-drift-working');
  ok(await page.evaluate(() => document.querySelector('[data-posn-main]').inert), 'cards inert during the check');
  ok(await page.isDisabled('[data-lock-btn]') && await page.isDisabled('[data-help-all]'), 'lock and help off during the check');
  await shot('p04-checking');
  await page.waitForSelector('.posn-flag');
  M.genDelay = 0;
  ok(!(await page.evaluate(() => document.querySelector('[data-posn-main]').inert)), 'cards editable after');
  ok(JSON.stringify(st.gens[1]) === JSON.stringify({ stage: 'drift_check', bookId: P1 }), 'drift sends ids only');
  const ft = await txt('.posn-flag'); ok(ft.startsWith('Drift found AI “every day” in one-sentence positioning. Daily practice is not in your Brief or Research.'), 'flag text with AI label ' + ft);
  ok((await active()).includes('posn-flag'), 'focus on the open flag');
  ok((await txt('#lockNote')) === 'Resolve the drift check first: 1 flag is open.', 'lock: 1 flag open');
  ok(!st.writes.some((w) => w.table === 'positioning' && w.body.drift_flags), 'browser did not write the flags');
  await shot('p05-flag');

  // Keep it: reason required
  await page.click('[data-keep="d1"]');
  const a2 = await active(); ok(a2.includes('data-keep-input'), 'focus in reason ' + a2);
  await page.click('.posn-keep button[type="submit"]');
  ok((await txt('.posn-keep .field-error')) === 'Say in a few words why this belongs in the book.', 'empty reason refused');
  await page.fill('[data-keep-input]', 'Daily practice is the core of the promise to my readers.');
  await page.click('.posn-keep button[type="submit"]');
  await page.waitForSelector('.posn-flag.is-kept');
  const kw = posWrites().pop();
  ok(kw.method === 'PATCH' && JSON.stringify(Object.keys(kw.body)) === '["drift_flags"]' && kw.body.drift_flags[0].status === 'kept' && kw.body.drift_flags[0].reason === 'Daily practice is the core of the promise to my readers.', 'keep writes status and reason only');
  ok((await txt('.posn-flag-reason')) === 'Kept: Daily practice is the core of the promise to my readers.', 'kept reason shown');
  ok((await txt('#lockNote')) === 'Ready to lock.' && !(await page.isDisabled('[data-lock-btn]')), 'lock ready');
  await shot('p06-kept');

  // Undo and keep again
  await page.click('[data-undo-keep="d1"]');
  await page.waitForSelector('[data-keep="d1"]');
  ok((await txt('#lockNote')) === 'Resolve the drift check first: 1 flag is open.', 'undo reopens');
  await page.click('[data-keep="d1"]');
  await page.fill('[data-keep-input]', 'Daily practice is the core of the promise.');
  await page.press('[data-keep-input]', 'Enter');
  await page.waitForSelector('.posn-flag.is-kept');

  // ── Fix it: edit the text, the check goes out of date
  M.flags = [{ field: 'approach', quote: 'rest days for sore joints', why: 'Rest days are not in your Brief or Research.' }];
  await page.click('[data-run-drift]');
  await page.waitForSelector('[data-fix="approach"]');
  await page.click('[data-fix="approach"]');
  const a3 = await active(); ok(a3.includes('data-field="approach"'), 'Fix it opens the card editor ' + a3);
  await page.fill('[data-card="approach"] textarea', 'Every pose has a seated version and a clear photo. A 4-week plan grows from 5 to 15 minutes a day. Large, easy-to-read print throughout.');
  const ct = await txt('[data-counter="approach"]'); ok(ct === '136 / 1200', 'counter ' + ct);
  await page.click('[data-done="approach"]');
  await waitSaved();
  ok(st.books[P1].pos.drift_checked_at === null, 'text edit cleared the check (0010 rule)');
  ok((await txt('.posn-stale')) === 'Out of date. You changed the text after this check.', 'out of date note');
  ok((await txt('#lockNote')) === 'Run the drift check again first. You changed the text after it.', 'lock: run again');
  ok((await txt('[data-run-drift]')) === 'Check again', 'button says Check again');
  await shot('p07-stale');
  M.flags = [];
  await page.click('[data-run-drift]');
  await page.waitForSelector('.posn-clear');
  ok((await txt('.posn-clear')) === 'No drift found. Every line traces back to your Brief or Research.', 'no drift found');
  ok((await txt('#lockNote')) === 'Ready to lock.', 'ready again');

  // ── One card redraft: Rewriting + Stop, then an error in the card
  M.genDelay = 800;
  await page.click('[data-card="approach"] [data-redraft]');
  await page.waitForSelector('[data-card="approach"] .posn-rewriting');
  ok((await txt('[data-card="approach"] .posn-rewriting')) === 'Rewriting…', 'Rewriting…');
  ok(!!(await page.$('[data-card="one_sentence"] .posn-text')), 'other cards stay');
  await shot('p08-rewriting');
  await page.click('[data-card="approach"] [data-help-stop]');
  ok((await txt('[data-ai-note="approach"]')) === 'Stopped. If the AI had already finished, this call may still count.', 'stopped wording');
  ok((await active()).includes('data-redraft="approach"'), 'focus back on redraft');
  await page.waitForTimeout(900);
  ok(!(await page.$('[data-suggest="approach"] .bio-suggest')), 'stopped reply dropped');
  ok(JSON.stringify(st.gens[st.gens.length - 1]) === JSON.stringify({ stage: 'positioning_help', bookId: P1, field: 'approach' }), 'redraft sends the field ' + JSON.stringify(st.gens[st.gens.length - 1]));
  M.genDelay = 0;
  M.gen = 'rate_limited';
  await page.click('[data-card="approach"] [data-redraft]');
  await page.waitForSelector('[data-ai-note="approach"] .alert');
  ok((await txt('[data-ai-note="approach"] .alert')) === 'Too many requests. Wait a minute, then try again. Try again', 'rate limit in the card');
  M.gen = null;
  await page.click('[data-ai-note="approach"] [data-help-retry]');
  await page.waitForSelector('[data-suggest="approach"] .bio-suggest');
  await page.click('[data-discard="approach"]');

  // ── Lock
  await page.click('[data-lock-btn]');
  await page.waitForSelector('.posn-banner');
  const lw = posWrites().pop();
  ok(lw.method === 'PATCH' && lw.lockedFilter === 'is.null' && Object.keys(lw.body).join() === 'locked_at', 'lock: one PATCH with locked_at, only when unlocked');
  ok((await active()).includes('data-banner-title'), 'focus on the banner');
  ok((await txt('.posn-banner-title')).startsWith('Approved and locked on '), 'banner');
  ok((await page.$$('.posn-ro')).length === 6, 'six read-only cards');
  ok(!(await page.$('textarea, [data-tag-input], [data-redraft]')), 'no editors when locked');
  ok(!!(await page.$('.step-link[data-step="3"].is-locked svg rect')), 'sidebar lock on 03');
  ok((await txt('.step-link[data-step="3"] .sr-only')) === ', locked', 'sr: locked');
  await shot('p09-locked');

  // Unlock dialog with nothing built yet: one line, no "Needs review" line, no chips
  await page.click('[data-unlock]');
  await page.waitForFunction(() => document.querySelector('#ulDesc') && document.querySelector('#ulDesc').textContent !== 'Nothing is deleted.');
  ok((await txt('#ulDesc')) === 'Nothing is built on it yet. Nothing is deleted.', 'nothing built: one line ' + await txt('#ulDesc'));
  ok(!(await txt('dialog[open]')).includes('Needs review'), 'nothing built: no Needs review line');
  ok(!(await page.$('.posn-impact-list')) && await page.evaluate(() => document.querySelector('[data-impact]').hidden), 'nothing built: no chips, impact area hidden');
  await shot('p10-unlock-nothing-built', false);
  await page.keyboard.press('Escape');
  ok(!!(await page.$('.posn-banner')), 'Keep locked: still locked');

  const errs = st.calls.filter((c) => c.startsWith('ERR'));
  ok(!errs.length, 'no mock errors ' + errs.join(' | '));
  return log.join('\n');
};
