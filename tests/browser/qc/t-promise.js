// The promise check (designs 54, 55 D, group 6 of 53, E14.6): 54 A cost, skipped list, monthly room, Esc and the
// focus trap; 54 B progress and Stop; 54 C chips and counts; Check again; Mark as OK and Undo on a drift; Open in 06
// from a drift; 55 D for every error; a lost connection with a fresh qc_json read. Generate is the mock (v26's rules).
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  await page.setViewportSize({ width: 1440, height: 1000 });

  const dlg = 'dialog.qc-pr-dialog';
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 });
  const posts = () => st.posts.length;
  const openDialog = async () => { await page.click('[data-pr-check]'); await page.waitForSelector(`${dlg}[open]`); await until((s) => !/Reading/.test(document.querySelector(s).innerText), dlg); };
  const facts = () => page.$$eval(`${dlg} .qc-pr-facts div`, (ds) => ds.map((d) => d.innerText.replace(/\s+/g, ' ').trim()));
  const go = async () => { await page.click(`${dlg} [data-pr-go]`); };
  const finished = () => page.waitForSelector('[data-pr-result]', { timeout: 8000 });
  const chips = () => page.$$eval('[data-pr-row]', (rs) => rs.map((r) => r.querySelector('.qc-chip').innerText.trim()));
  const rowOf = (n) => `[data-pr-row="${st.chapter(n).id}"]`;
  const reset = () => { st.checks = []; st.plan = {}; st.posts.length = 0; st.dismissed = []; globalThis.__modes.prFail = {}; };
  const open = async () => { await QC.open7(page); };

  /* The card on the first visit: cost on the button (52). */
  await open();
  ok(/^Check the promise · about \$0\.\d\d$/.test(await QC.txt(page, '.qc-promise-wide [data-pr-check]')), 'design 52: the cost is on the button');
  await QC.run(page);
  const cardText = await QC.txt(page, '[data-pr-card]');
  ok(/^6 · PROMISE CHECK · AI Checks each of the 7 chapters against your locked promise\. One call per chapter\. Check the promise About \$0\.\d\d\. You confirm before it runs\.$/.test(cardText), `53 card: ${cardText}`);
  ok(!/next part/i.test(await page.evaluate(() => document.body.innerText)), 'no "next part" anywhere');
  ok((await QC.txt(page, '[data-group="6"] .qc-chips')) === 'Not run · AI, paid', 'group 6 chip before any check');

  /* 54 A: every chapter, the cost, the room. */
  await page.click('[data-pr-check]');
  await page.waitForSelector(`${dlg}[open]`);
  await until((s) => !/Reading/.test(document.querySelector(s).innerText), dlg);
  const f = await facts();
  ok(f[0] === 'Chapters 7' && f[1] === 'AI calls 7, one per chapter', `54 A chapters and calls: ${f}`);
  ok(/^Estimated cost about \$0\.\d\d$/.test(f[2]), `54 A cost: ${f[2]}`);
  ok(f[3] === 'Room this month 1.60M tokens left', `54 A room: ${f[3]}`);
  ok((await QC.txt(page, `${dlg} h2`)) === 'Check the promise?', '54 A title');
  ok((await QC.txt(page, `${dlg} .qc-lead`)) === "The AI compares each chapter with your locked promise and the chapter's objective from 05 Outline.", '54 A lead');
  ok((await QC.txt(page, `${dlg} .qc-note`)) === 'Counts in your AI usage in Settings. Chapters with no text are skipped.', '54 A note');
  ok((await QC.txt(page, `${dlg} [data-pr-go]`)) === 'Check 7 chapters', '54 A button');
  ok(!(await page.$(`${dlg} .alert`)), 'no room warning with room left');
  ok(!(await QC.txt(page, `${dlg} [data-pr-skips]`)), 'nothing skipped');
  ok(posts() === 0, 'nothing runs before the confirm');

  /* Focus trap and Esc. */
  const focused = () => page.evaluate(() => document.activeElement.dataset.prGo !== undefined ? 'go' : document.activeElement.dataset.prCancel !== undefined ? 'cancel' : document.activeElement.tagName);
  ok((await focused()) === 'cancel', 'a paid action never has the first focus: Cancel has it');
  await page.keyboard.press('Tab');
  ok((await focused()) === 'go', 'Tab from Cancel wraps to the first button');
  await page.keyboard.press('Shift+Tab');
  ok((await focused()) === 'cancel', 'Shift+Tab wraps to the last button');
  await page.keyboard.press('Escape');
  await until((s) => !document.querySelector(s).open, dlg);
  ok(posts() === 0, 'Esc is Cancel: nothing ran');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-check')), 'focus goes back to Check the promise');
  await openDialog();
  await page.click(`${dlg} [data-pr-cancel]`);
  ok(!(await page.$(`${dlg}[open]`)) && posts() === 0, 'Cancel closes it');

  /* The monthly room warning, the limit reached, and a failed read. */
  st.usage.tokens = 1985000;
  await openDialog();
  ok(/^This may pass your monthly AI allowance\. It needs about [\d,]+ tokens\. You have about 15,000 left\. It resets on December 1\.$/.test(await QC.txt(page, `${dlg} .alert`)), `room warning: ${await QC.txt(page, `${dlg} .alert`)}`);
  ok(await page.$eval(`${dlg} [data-pr-go]`, (b) => !b.disabled), 'the warning does not block');
  await page.keyboard.press('Escape');
  st.usage.tokens = 2000000;
  await openDialog();
  ok(/^You have used this month's AI allowance\. It resets on December 1\.$/.test(await QC.txt(page, `${dlg} .alert`)), 'no room: the line');
  ok(await page.$eval(`${dlg} [data-pr-go]`, (b) => b.disabled), 'no room: the button is off');
  await page.keyboard.press('Escape');
  st.usage.tokens = 400000;
  modes.usageFail = true;
  await openDialog();
  ok((await facts())[3] === "Room this month We couldn't read it", 'usage read failed: said so');
  ok(await page.$eval(`${dlg} [data-pr-go]`, (b) => !b.disabled), 'a failed usage read does not block: the server still has the limit');
  await page.keyboard.press('Escape');
  modes.usageFail = false;

  /* 54 B: one at a time, progress, Stop. */
  modes.prHold = 2;
  st.plan[3] = { verdict: 'drifts', reason: 'The chapter turns to teens, not busy adults.' };
  await openDialog();
  await go();
  await page.waitForSelector('[data-pr-stop]');
  await until(() => /Checking chapter 2 of 7/.test(document.querySelector('[data-pr-title]').textContent));
  const b = await QC.all(page, '[data-pr-rows] .qc-pr-row');
  ok(b.length === 7 && b[0] === '1 Start small Done' && b[1] === '2 Five minute reviews Checking…' && b[2] === '3 Spaced practice Waiting', `54 B rows: ${JSON.stringify(b.slice(0, 3))}`);
  ok(await page.$eval('[data-pr-rows] .qc-pr-row:nth-child(3) .qc-pr-name', (e) => e.classList.contains('is-wait')), 'a waiting chapter is gray');
  ok(await page.$eval('[role="progressbar"]', (e) => e.getAttribute('aria-valuenow') === '14' && e.getAttribute('aria-label') === 'Promise check progress'), 'progressbar');
  ok((await QC.txt(page, '[data-pr-card] .qc-note')) === 'You can open other steps. Finished chapters are saved.', '54 B note (owner, STOP 6 Q4)');
  ok(posts() === 2, 'one chapter at a time');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-stop')), 'the focus is on Stop');

  // The loop lives in the page: another step opens, and the run goes on.
  await page.click('[data-step="5"]');
  await page.waitForFunction(() => /STEP 5/.test(document.querySelector('[data-step-label]').textContent));
  modes.prHold = 3;
  for (let i = 0; i < 60 && posts() < 3; i++) await page.waitForTimeout(25);
  ok(posts() === 3, 'the run goes on on another step');
  await page.click('[data-step="7"]');
  await page.waitForSelector('[data-pr-stop]');
  ok(/Checking chapter 3 of 7/.test(await QC.txt(page, '[data-pr-title]')), 'back on 07: the run shows where it is');

  // Stop ends it after the chapter in flight.
  await page.click('[data-pr-stop]');
  ok(await page.$eval('[data-pr-stop]', (x) => x.disabled && x.textContent === 'Stopping…'), 'Stop: Stopping…');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-title')), 'the focus moves off the disabled button');
  const stoppedAt = posts();
  modes.prHold = 0;
  await finished();
  ok(posts() === stoppedAt, 'nothing starts after Stop');

  /* 54 C after Stop: 2 keep, 1 drifts, 4 not checked. */
  ok((await QC.txt(page, '[data-pr-result]')) === '2 of 3 chapters keep the promise.', `54 C banner: ${await QC.txt(page, '[data-pr-result]')}`);
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-result')), 'the focus moves to the result');
  ok((await chips()).join() === 'Keeps it,Keeps it,Drifts,Not checked,Not checked,Not checked,Not checked', `54 C chips: ${await chips()}`);
  ok(/^"The chapter turns to teens, not busy adults\."$/.test(await QC.txt(page, `${rowOf(3)} .qc-pr-why`)), '54 C: the reason, in quotes');
  ok((await QC.txt(page, `${rowOf(3)} .qc-pr-acts`)) === 'Open in 06 Mark as OK', '54 C: the two actions');
  ok(/^The book result comes from the chapter results\./.test(await QC.txt(page, '[data-pr-card] .is-result + .qc-note')), '54 C note');
  ok(/^Check the promise About \$0\.\d\d\. You confirm before it runs\.$/.test(await QC.txt(page, '[data-pr-card] .qc-off')), 'the chapters left can still be checked');
  await page.click('[data-group="6"]');
  ok((await QC.txt(page, '[data-group="6"] .qc-chips')) === '1 to check 4 not checked', `group 6 chips: ${await QC.txt(page, '[data-group="6"] .qc-chips')}`);
  const g6 = await QC.all(page, '#qc-g6 .qc-it');
  ok(g6.length === 1 && g6[0] === 'Chapter 3 The chapter turns to teens, not busy adults. Open in 06 Mark as OK', `group 6 row: ${g6}`);
  ok(/with 1 warning|warnings/.test(await QC.txt(page, '[data-verdict]')), 'the drift counts in the verdict');

  /* Skipped: current, no text, too short, too long. */
  const c5 = st.chapter(5);
  const kept = c5.sections.map((s) => s.version);
  c5.sections.forEach((s) => { s.version = null; });
  const c6 = st.chapter(6);
  const kept6 = c6.sections.map((s) => s.version);
  c6.sections.forEach((s, i) => { s.version = i ? null : st.edit(s, 'Only a few words here.'); });
  const c7 = st.chapter(7);
  const kept7 = c7.sections.map((s) => s.version);
  st.edit(c7.sections[0], Array.from({ length: 6100 }, (_, i) => `w${i}`).join(' '));
  await open();
  await openDialog();
  ok((await facts())[0] === 'Chapters 1', `only chapter 4 is left: ${await facts()}`);
  const skips = await QC.all(page, `${dlg} .qc-pr-skips li`);
  ok(skips.join('|') === '3 chapters are up to date and are skipped|Chapter 5 No text|Chapter 6 Under 50 words|Chapter 7 Over 6,000 words', `54 A skipped: ${skips.join('|')}`);
  ok((await QC.txt(page, `${dlg} [data-pr-go]`)) === 'Check 1 chapter', 'one chapter: singular');
  await page.keyboard.press('Escape');
  ok((await chips()).join() === 'Keeps it,Keeps it,Drifts,Not checked,Skipped,Skipped,Skipped', `C shows Skipped: ${await chips()}`);
  ok((await QC.txt(page, `${rowOf(6)} .qc-pr-why`)) === 'Under 50 words', 'C says why');
  c5.sections.forEach((s, i) => { s.version = kept[i]; });
  c6.sections.forEach((s, i) => { s.version = kept6[i]; });
  c7.sections.forEach((s, i) => { s.version = kept7[i]; });

  /* Mark as OK on a drift: the row, the side list, the verdict, Undo. */
  await open();
  if ((await page.$eval('[data-group="6"]', (x) => x.getAttribute('aria-expanded'))) !== 'true') await page.click('[data-group="6"]');
  const key = `${st.chapter(3).id}|${st.checks.find((c) => c.chapter_id === st.chapter(3).id).inputs_key}`;
  await page.click('#qc-g6 .qc-it [data-ok]');
  await until(() => { const u = document.querySelector('[data-justok] [data-undo]'); return u && !u.disabled; });
  const wrote = st.writes.filter((w) => w.table === 'qc_dismissed').pop().body;
  ok(wrote.rule === 'promise_drift' && wrote.issue_key === key, `key is chapter|inputs_key: ${wrote.issue_key}`);
  ok(wrote.section_id === null && wrote.label === 'Chapter 3 · The chapter turns to teens, not busy adults.', `label: ${wrote.label}`);
  ok(/^Marked as OK\. It stays hidden/.test((await QC.txt(page, '[data-justok] .qc-ok-line'))), 'the 55 F line');
  ok((await QC.txt(page, '[data-marked] .chip-label')) === 'MARKED AS OK · 1', 'the side list counts it');
  ok(/Marked as OK\. Undo$/.test(await QC.txt(page, `${rowOf(3)} .qc-pr-acts`)), 'the card says so too');
  await page.click('[data-justok] [data-undo]');
  await until(() => !document.querySelector('[data-justok]') && !document.querySelector('[data-marked]'));
  ok(st.dismissed.length === 0, 'Undo removes it');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-ok')), 'Undo: focus on Mark as OK');

  // From the card.
  await page.click(`${rowOf(3)} [data-pr-ok]`);
  await until((s) => { const u = document.querySelector(`${s} [data-undo]`); return u && !u.disabled; }, rowOf(3));
  ok(st.dismissed.length === 1 && st.dismissed[0].rule === 'promise_drift', 'Mark as OK from the card');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-undo')), 'the focus moves to Undo');
  await open();
  ok((await QC.all(page, '#qc-g6 .qc-it')).length === 0, 'after a reload it stays hidden');
  await page.click(`${rowOf(3)} [data-undo]`);
  await until(() => document.querySelector('[data-pr-ok]'));
  ok(st.dismissed.length === 0, 'Undo from the card');

  /* The same drift after an edit: Out of date, Check again, a new key. */
  st.plan[3] = { verdict: 'drifts', reason: 'Still about teens, with 90% more homework.', unsourced: ['90%'], quote: 'Spaced drift sentence stays here.', section_id: st.section('3.2').id };
  st.dismiss('promise_drift', key, 'Chapter 3 · old');
  st.edit(st.section('3.2'), `${st.section('3.2').version.content}\n\nSpaced drift sentence stays here.`);
  await open();
  ok((await chips())[2] === 'Out of date', `an edited chapter is Out of date: ${await chips()}`);
  ok(/^Check again · (about|under) \$0\.\d\d$/.test(await QC.txt(page, `${rowOf(3)} [data-pr-again]`)), `Check again shows its cost: ${await QC.txt(page, `${rowOf(3)} [data-pr-again]`)}`);
  ok(!(await page.$(`${rowOf(1)} [data-pr-again]`)), 'no Check again on a current chapter');
  ok(!(await page.$(`${rowOf(4)} [data-pr-again]`)), 'no Check again on a chapter never tried');
  ok((await QC.txt(page, '[data-pr-result]')) === '2 of 2 chapters keep the promise.', 'M counts current results only');
  ok((await page.$eval('[data-pr-result]', (e) => e.classList.contains('is-ok'))), 'all current keep: the success banner, with its icon and words');
  const before = posts();
  await page.click(`${rowOf(3)} [data-pr-again]`);
  await finished();
  ok(posts() === before + 1 && st.posts[st.posts.length - 1].chapterId === st.chapter(3).id, 'Check again checks one chapter, with no dialog');
  ok(JSON.stringify(st.posts[st.posts.length - 1]) === JSON.stringify({ stage: 'promise_check', bookId: QB, chapterId: st.chapter(3).id }), 'the body is { stage, bookId, chapterId }, nothing else');
  ok((await chips())[2] === 'Drifts', 'a new key: the drift is back, its old Mark as OK does not hide it');
  ok(/Verify: no source for 90%/.test(await QC.txt(page, `${rowOf(3)} .qc-pr-why`)), '54 C: Verify on an unsourced number');
  ok(/Verify: no source for 90%/.test(await QC.txt(page, '#qc-g6 .qc-it')), 'group 6: Verify too');

  /* Open in 06: to the quote, the bar says Promise. */
  if ((await page.$eval('[data-group="6"]', (x) => x.getAttribute('aria-expanded'))) !== 'true') await page.click('[data-group="6"]');
  await page.click('#qc-g6 .qc-it [data-open]');
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await until(() => !document.querySelector('[data-qc-bar]').hidden);
  ok(/^From Quality Control · Promise, issue 1 of 1\. Still about teens/.test(await QC.txt(page, '[data-qc-bar] .qc-wbar-text')), `the bar: ${await QC.txt(page, '[data-qc-bar] .qc-wbar-text')}`);
  await until(() => CSS.highlights.get('qc-spot'));
  const mark = await page.evaluate(() => [...CSS.highlights.get('qc-spot')].map((r) => r.toString()).join(''));
  ok(mark === 'Spaced drift sentence stays here.', `the spot: ${mark}`);
  ok(page.url().includes(`section=${st.section('3.2').id}`), 'the section of the quote');
  await page.click('[data-qc-back]');
  await page.waitForSelector('#qc-g6 .qc-it');
  await until(() => document.activeElement && document.activeElement.hasAttribute('data-open'));
  ok(true, 'Back: focus on the row\'s link');

  /* Open in 06 with no quote: the chapter's first section with text. From the card, on a fresh page (06 never opened). */
  st.plan[2] = { verdict: 'drifts', reason: 'The chapter leaves its objective.' };
  const first = st.chapter(2).sections[0];
  const firstText = first.version;
  first.version = null;
  await open();
  await page.click(`${rowOf(2)} [data-pr-again]`);
  await finished();
  await open();
  await page.click(`${rowOf(2)} [data-pr-open]`);
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await until(() => !document.querySelector('[data-qc-bar]').hidden);
  ok(page.url().includes(`section=${st.section('2.2').id}`), `no quote: the first section with text: ${page.url().slice(-60)}`);
  ok(/Promise, issue 1 of 2\. The chapter leaves its objective\.$/.test(await QC.txt(page, '[data-qc-bar] .qc-wbar-text')), `no quote: no "spot changed": ${await QC.txt(page, '[data-qc-bar] .qc-wbar-text')}`);
  ok(!(await page.evaluate(() => CSS.highlights.get('qc-spot'))), 'no quote: nothing is marked');
  await page.click('[data-qc-next]');
  await until((id) => location.search.includes(id), st.section('3.2').id);
  ok(true, 'Next moves to the other drift');
  await page.click('[data-qc-back]');
  await page.waitForSelector('[data-pr-row]');
  await until(() => document.activeElement && document.activeElement.hasAttribute('data-pr-open'));
  ok(await page.evaluate((id) => document.activeElement.dataset.prOpen === id, st.chapter(3).id), 'Back from the card: focus on that chapter in the card');
  first.version = firstText;

  /* 55 D, every error. */
  reset();
  await open();
  await QC.run(page);
  const fail = async (n, code) => {
    modes.prFail = { [n]: code };
    st.checks = [];
    st.posts.length = 0;
    await open();
    await openDialog();
    await go();
    await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
  };
  await fail(5, 'ai_unavailable');
  ok((await QC.txt(page, '[data-pr-fail] strong')) === 'The AI did not answer for chapter 5.', '55 D title');
  ok((await QC.txt(page, '[data-pr-fail] .qc-sub')) === 'Chapters 1 to 4 are saved. This attempt was not counted in your usage.', '55 D words');
  ok((await QC.all(page, '[data-pr-fail] button')).join() === 'Try chapter 5 again,Close', '55 D buttons');
  ok(await page.$eval('[data-pr-fail]', (e) => e.getAttribute('role') === 'alert' && e.classList.contains('is-danger')), '55 D is an alert');
  ok(await page.$eval('[data-pr-fail] strong', (e) => !!e.querySelector('svg[aria-hidden="true"]') && e.firstElementChild.tagName === 'svg'), '55 D: the warning icon sits before the title (owner, STOP 6 Q3)');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-retry')), 'the focus is on Try again');
  ok(posts() === 5, 'the run stops at the failure');
  await page.click('[data-pr-retry]');
  await finished();
  ok(st.posts.map((p) => p.chapterId === st.chapter(5).id).filter(Boolean).length === 2 && posts() === 8, 'Try again: chapter 5 again, then the chapters left');
  ok((await QC.txt(page, '[data-pr-result]')) === '7 of 7 chapters keep the promise.', 'then the result');

  await fail(1, 'ai_declined');
  ok((await QC.txt(page, '[data-pr-fail] .qc-sub')) === 'This attempt was not counted in your usage.', 'nothing saved yet: no saved line');
  await page.click('[data-pr-close]');
  await page.waitForSelector('[data-pr-result]');
  ok((await chips())[0] === 'Not checked', 'Close: the chapter is Not checked');
  ok(!!(await page.$(`${rowOf(1)} [data-pr-again]`)), 'a failed chapter has Check again');
  ok(!(await page.$(`${rowOf(2)} [data-pr-again]`)), 'a chapter that was only waiting does not');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-pr-result')), 'Close: the focus moves to the result');

  for (const [code, line] of [
    ['ai_stopped', 'The AI did not answer for chapter 3.'], ['server_error', 'The AI did not answer for chapter 3.'],
    ['rate_limited', 'Too many requests. Wait a minute, then try again.'], ['monthly_limit', /^You have used this month’s AI allowance\. It resets on /],
    ['positioning_not_locked', 'Lock 03 Positioning to check the promise.'], ['run_in_progress', 'Chapter 3 is being written in 06. Wait for it to finish.']
  ]) {
    await fail(3, code);
    const t = await QC.txt(page, '[data-pr-fail] strong');
    ok(line instanceof RegExp ? line.test(t) : t === line, `${code}: ${t}`);
    if (!/^The AI/.test(t)) {
      ok((await QC.txt(page, '[data-pr-fail] .qc-sub')) === 'Chapters 1 and 2 are saved.', `${code}: what is saved`);
      ok((await QC.all(page, '[data-pr-fail] button')).join() === 'Try again,Close', `${code}: Try again, Close`);
      ok(await page.$eval('[data-pr-fail]', (e) => e.classList.contains('is-warning') && !!e.querySelector('svg')), `${code}: a warning, with its icon`);
    }
    await page.click('[data-pr-close]');
    await page.waitForSelector('[data-pr-result]');
  }

  /* A chapter changed after the confirm: refused for free, skipped, the run goes on. */
  for (const code of ['check_too_short', 'check_too_long', 'nothing_to_check']) {
    modes.prFail = { 2: code };
    st.checks = [];
    st.posts.length = 0;
    await open();
    await openDialog();
    await go();
    await finished();
    ok(posts() === 7, `${code}: the run goes on`);
    ok(!(await page.$('[data-pr-fail]')), `${code}: no failure shown`);
    ok((await chips())[1] === 'Not checked', `${code}: the chapter is not checked`);
  }

  /* A lost connection, the server did not save: the fresh read, then Try again pays for it once. */
  const reads = () => st.qcReads;
  modes.prFail = { 3: 'network' };
  st.checks = [];
  st.posts.length = 0;
  await open();
  await openDialog();
  await go();
  let at = reads();
  await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
  ok((await QC.txt(page, '[data-pr-fail] strong')) === 'We lost the connection during chapter 3.', '55 D network title');
  ok((await QC.txt(page, '[data-pr-fail] .qc-sub')) === 'Finished chapters are saved.', '55 D network words');
  ok((await QC.all(page, '[data-pr-fail] button')).join() === 'Try again,Close', '55 D network buttons');
  ok(await page.$eval('[data-pr-fail] strong', (e) => !!e.querySelector('svg')), '55 D network: the warning icon too');
  ok(reads() === at + 1, `the failure reads qc_json again: ${reads() - at}`);
  await page.click('[data-pr-retry]');
  await finished();
  ok(st.posts.filter((p) => p.chapterId === st.chapter(3).id).length === 2 && posts() === 8, 'not saved: Try again checks chapter 3 again, then the rest');

  /* The server saved it: the read shows it, and it is never paid for twice. */
  modes.prFail = { 3: 'saved' };
  st.checks = [];
  st.posts.length = 0;
  await open();
  await openDialog();
  await go();
  await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
  await page.click('[data-pr-retry]');
  await finished();
  ok(st.posts.filter((p) => p.chapterId === st.chapter(3).id).length === 1 && posts() === 7, `saved: chapter 3 is not sent twice: ${posts()}`);
  ok((await QC.txt(page, '[data-pr-result]')) === '7 of 7 chapters keep the promise.', 'saved: every chapter counts');

  /* The last chapter was saved: nothing is left to try. */
  modes.prFail = { 7: 'saved' };
  st.checks = [];
  st.posts.length = 0;
  await open();
  await openDialog();
  await go();
  await finished();
  ok(!(await page.$('[data-pr-fail]')) && posts() === 7, 'saved on the last chapter: the result, no failure');

  /* The read fails too: no paid call until a read works. */
  modes.prFail = { 3: 'network' };
  st.checks = [];
  st.posts.length = 0;
  await open();
  await openDialog();
  // The read after the failure fails, and so does the one Try again makes.
  modes.qcFail = 2;
  await go();
  await page.waitForSelector('[data-pr-fail]', { timeout: 8000 });
  const sent = posts();
  await page.click('[data-pr-retry]');
  await until(() => document.querySelector('[data-pr-retry]') && !document.querySelector('[data-pr-retry]').disabled);
  ok(posts() === sent, 'offline: Try again sends nothing');
  ok((await QC.txt(page, '[data-pr-fail] strong')) === 'We lost the connection during chapter 3.', 'offline: the same line');
  await page.click('[data-pr-retry]');
  await finished();
  ok(posts() === 8, 'back online: the read, then the chapters left');

  /* Stop stays stopped: the chapter in flight fails, and nothing goes on from it. */
  for (const code of ['ai_unavailable', 'network']) {
    st.checks = [];
    st.posts.length = 0;
    modes.prFail = { 2: code };
    modes.prHold = 2;
    await open();
    await openDialog();
    await go();
    await page.waitForSelector('[data-pr-stop]');
    for (let i = 0; i < 80 && posts() < 2; i++) await page.waitForTimeout(25);
    await page.click('[data-pr-stop]');
    modes.prHold = 0;
    await finished();
    ok(!(await page.$('[data-pr-fail]')) && posts() === 2, `${code} after Stop: no 55 D, nothing more sent`);
    ok((await chips())[1] === 'Not checked' && !!(await page.$(`${rowOf(2)} [data-pr-again]`)), `${code} after Stop: the chapter can be checked again`);
  }
  st.checks = [];
  st.posts.length = 0;
  await open();
  await openDialog();
  await go();
  await finished();

  /* The live area says the title, not the list, on each chapter. */
  st.edit(st.section('2.1'), st.section('2.1').version.content + ' Live.');
  st.edit(st.section('3.1'), st.section('3.1').version.content + ' Live.');
  await open();
  modes.prHold = 2;
  await openDialog();
  await go();
  await page.waitForSelector('[data-pr-stop]');
  ok(await page.$eval('[data-pr-rows]', (e) => e.getAttribute('aria-live') === 'off'), 'the rows are not read out again on each chapter');
  modes.prHold = 0;
  await finished();

  /* 44 px hit areas (V1), and the promise line under 55 E. */
  st.plan[2] = { verdict: 'drifts', reason: 'A drift for the sizes.' };
  st.edit(st.section('2.1'), st.section('2.1').version.content + ' New.');
  await open();
  const tall = (sel) => page.$$eval(sel, (es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
  ok((await tall('[data-pr-card] [data-pr-again]')).every((h) => h >= 44), `Check again is 44 px: ${await tall('[data-pr-card] [data-pr-again]')}`);
  await page.click(`${rowOf(2)} [data-pr-again]`);
  await finished();
  const heights = [...await tall('[data-pr-card] .qc-lk'), ...await tall('[data-pr-card] .qc-lk2')];
  ok(heights.length >= 2 && heights.every((h) => h >= 44), `row links are 44 px: ${heights}`);
  await page.click(`${rowOf(2)} [data-pr-ok]`);
  await until((s) => { const u = document.querySelector(`${s} [data-undo]`); return u && !u.disabled; }, rowOf(2));
  ok((await tall(`${rowOf(2)} [data-undo]`)).every((h) => h >= 44), 'Undo is 44 px');
  await open();
  ok(await page.evaluate(() => !/Promise check not run/.test(document.body.innerText)), 'after a check, "Promise check not run" is gone');
  st.dismissed = [];

  /* Off: nothing to check, not locked. */
  ok(!(await page.$('[data-pr-check]')), 'every chapter is current: no Check the promise');
  st.pos.locked_at = null;
  await open();
  ok((await chips()).every((c) => c === 'Out of date'), 'unlocked: every chapter is Out of date');
  ok(!(await page.$('[data-pr-again]')) && !(await page.$('[data-pr-check]')), 'unlocked: no paid button at all');
  st.checks = [];
  await open();
  ok((await QC.txt(page, '[data-pr-card] .qc-note')) === 'Lock 03 Positioning to check the promise.', 'locked state line');
  ok(await page.$eval('[data-pr-card] button', (b) => b.disabled), 'locked: the button is off');
  st.pos.locked_at = new Date(Date.now() - 86400e3).toISOString();
  const texts = st.chapters.filter((c) => c.kind === 'chapter').map((c) => c.sections.map((s) => [s, s.version]));
  texts.flat().forEach(([s]) => { s.version = null; });
  await open();
  ok((await QC.txt(page, '[data-pr-card] .qc-note')) === 'No chapter has text yet.', 'only the Introduction has text: the line');
  texts.flat().forEach(([s, v]) => { s.version = v; });

  /* 900 px: no sideways scroll in any state. */
  await page.setViewportSize({ width: 900, height: 900 });
  await open();
  await openDialog();
  ok(await page.$eval(dlg, (d) => d.getBoundingClientRect().right <= innerWidth), '900 px: 54 A fits');
  modes.prHold = 2;
  await go();
  await page.waitForSelector('[data-pr-stop]');
  ok(await QC.noScroll(page), '900 px: 54 B no sideways scroll');
  modes.prHold = 0;
  await finished();
  ok(await QC.noScroll(page), '900 px: 54 C no sideways scroll');
  return log.join('\n');
};
