const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const txt = async (sel) => ((await page.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, timeout: 60000, fullPage: true }).catch(() => {});
  const active = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.outerHTML || '').replace(/>[\s\S]*$/, '>') : ''; });
  const waitSaved = async () => { await page.waitForTimeout(80); await page.waitForFunction(() => document.querySelector('[data-saved-line]') && document.querySelector('[data-saved-line]').dataset.state === 'saved', null, { timeout: 5000 }); };
  const go = async (id, step) => { await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=${step}`, { waitUntil: 'domcontentloaded' }); };
  const briefWrites = () => st.writes.filter((w) => w.table === 'book_briefs').length;
  await page.setViewportSize({ width: 1440, height: 1000 });

  // ── Brief fix: a refused save while the field has focus is sent once
  async function briefRun() {
    await go(P1, 1);
    await page.waitForSelector('#bf-target_reader');
    M.briefError = true;
    const before = briefWrites();
    await page.click('#bf-target_reader');
    await page.type('#bf-target_reader', ' and limited mobility');
    await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'error', null, { timeout: 5000 });
    await page.waitForTimeout(600);
    M.briefError = false;
    return { sent: briefWrites() - before, line: await txt('[data-saved-line]') };
  }
  await page.context().route('**/js/book-brief.js', (r) => r.fulfill({ path: `${CACHE}/old-book-brief.js`, contentType: 'application/javascript' }));
  const old = await briefRun();
  await page.context().unroute('**/js/book-brief.js');
  const now = await briefRun();
  ok(old.sent === 2, `old Brief code sends the refused save twice (${old.sent})`);
  ok(now.sent === 1 && now.line.includes('This change breaks a Brief rule, so it was not saved.'), `fixed: sent once (${now.sent}), message shown`);

  // ── Step 04, locked positioning, empty
  await go(P2, 4);
  await page.waitForSelector('[data-generate]');
  await page.waitForSelector('.ttl-empty');
  ok((await txt('[data-step-title]')) === 'Title', 'title Title');
  ok((await page.$$('[data-example]')).length === 3, '3 example inputs');
  ok((await txt('[data-generate]')) === 'Generate 10 options' && !(await page.isDisabled('[data-generate]')), 'Generate 10 options enabled');
  ok(await page.isDisabled('[data-use]'), 'Use this title disabled when empty');
  ok(!(await page.$('.step-link[data-step="4"].is-done')), 'step 04 not done');
  ok((await txt('[data-your] .ttl-foot')).startsWith('Series: Gentle Movement, book 1.'), 'series read-only from the Brief');
  ok((await txt('[data-checks]')).includes("We don’t check trademarks."), 'trademark note');

  // Examples autosave
  await page.fill('#ttlEx0', 'Gentle Chair Yoga for Beginners: Easy Seated Stretches for Seniors');
  await page.fill('#ttlEx1', 'Seated Strength After 60: Simple Chair Exercises for Balance');
  await page.locator('#ttlEx1').blur();
  await waitSaved();
  const ex = st.writes.filter((w) => w.table === 'books' && w.body.title_examples).pop();
  ok(ex && JSON.stringify(ex.body) === JSON.stringify({ title_examples: ['Gentle Chair Yoga for Beginners: Easy Seated Stretches for Seniors', 'Seated Strength After 60: Simple Chair Exercises for Balance'] }), 'examples saved, blanks dropped');

  // Generate with Stop visible
  M.genDelay = 600;
  await page.click('[data-generate]');
  await page.waitForSelector('[data-stop]');
  ok((await active()).includes('data-stop') && (await txt('.ttl-working')).includes('Writing title ideas from your locked positioning'), 'working state, focus on Stop');
  ok(await page.isDisabled('[data-generate]'), 'button off while working');
  await page.waitForSelector('.ttl-opt');
  M.genDelay = 0;
  ok(JSON.stringify(st.gens[0]) === JSON.stringify({ stage: 'title_ideas', bookId: P2 }), 'sends ids only');
  ok((await txt('.ttl-options-head')) === 'Options 10' && (await page.$$('.ttl-opt')).length === 3, '10 options, 3 shown');
  ok((await txt('[data-show-more]')) === 'Show 7 more', 'Show 7 more');
  ok((await txt('[data-gen-status]')).includes('10 new options added at the top.'), 'added note');
  ok((await txt('[data-generate]')) === 'More ideas', 'button is now More ideas');
  ok((await active()).includes('data-star'), 'focus on the first option');
  await page.click('[data-show-more]');
  const card = (t) => page.locator('.ttl-opt', { hasText: t });
  ok((await card('The Complete Chair Yoga Book').innerText()).includes('Close to "The Complete Chair Yoga Handbook: Seated Poses for Every Body"'), 'close-to-competitor warning');
  const c6 = (await card('Chair Yoga in 6 Weeks').innerText()).replace(/\s+/g, ' ');
  ok(c6.includes('Sales claim: "Free", "Bonus"') && c6.includes('Verify: no source for 6'), 'sales + verify chips ' + c6);
  ok(!(await card('Pain-Free Movement After 60').innerText()).includes('Sales claim'), 'Pain-Free passes');
  ok((await card('Chair Yoga for Seniors Over 60').innerText()).includes('113 / 200'), 'option counter 113 / 200');
  await shot('t01-options');

  // Star, then Remove (only when not starred)
  const first = await card('Chair Yoga for Seniors Over 60').getAttribute('data-opt');
  await page.click(`[data-star="${first}"]`);
  await page.waitForFunction((id) => document.querySelector(`[data-star="${id}"]`).getAttribute('aria-pressed') === 'true', first);
  ok((await txt('[data-shortlist]')).startsWith('SHORTLIST · 1 ★ Chair Yoga for Seniors Over 60: Gentle'), 'shortlist shows the star');
  ok(!(await page.$(`[data-opt="${first}"] [data-opt-menu]`)), 'starred option has no Remove menu');
  ok((await active()).includes(`data-star="${first}"`), 'focus stays on the star');
  const last = await card('Steady Seated Practice Five').getAttribute('data-opt');
  await page.click(`[data-opt-menu="${last}"]`);
  ok((await active()).includes('data-remove'), 'menu opens, focus on Remove');
  await page.click(`[data-remove="${last}"]`);
  await page.waitForFunction((id) => !document.querySelector(`[data-opt="${id}"]`), last);
  const del = st.writes.find((w) => w.method === 'DELETE');
  ok(del && del.id === last && del.filter === 'eq.false', 'DELETE only when not starred');
  ok((await txt('.ttl-options-head')) === 'Options 9', '9 options left');

  // Use as my title → counter, checks, Use this title
  await page.click(`[data-opt="${first}"] [data-use-opt]`);
  ok((await page.inputValue('#ttlTitle')) === 'Chair Yoga for Seniors Over 60' && (await active()).includes('ttlTitle'), 'option copied to Your title');
  ok((await txt('.ttl-count-row')) === 'Title + subtitle 113 / 200', 'counter 113 / 200');
  ok((await txt('.ttl-check-list')) === 'No sales claims found No competitor author names Not close to a competitor title No word repeated', 'four checks pass');
  ok((await txt('[data-use-status]')) === 'Not used yet. Press Use this title to save it.', 'not used yet note');
  await page.click('[data-use]');
  await page.waitForSelector('[data-use-status] .is-pass');
  const use1 = st.writes.filter((w) => w.table === 'books' && 'title' in w.body).pop();
  ok(JSON.stringify(use1.body) === JSON.stringify({ title: 'Chair Yoga for Seniors Over 60', subtitle: 'Gentle 15-Minute Routines to Improve Balance, Flexibility, and Confidence at Home' }), 'writes title + subtitle only');
  ok(!!(await page.$('.step-link[data-step="4"].is-done')), '04 done after Use this title');
  ok((await txt('.book-id-title')) === 'Chair Yoga for Seniors Over 60', 'sidebar shows the new title');

  // Over the limit (design 21) and a live warning
  await page.fill('#ttlSubtitle', 'Gentle 15-Minute Routines to Improve Balance, Flexibility, Strength, and Confidence at Home, With Clear Photos, Large Print, and a Simple Plan for Stiff Joints, Sore Hips, and Knees.');
  ok((await txt('.ttl-count-row')) === 'Title + subtitle 214 / 200' && (await txt('.ttl-over')) === 'KDP allows 200 characters. Remove 14.', 'over limit: 214 / 200, Remove 14');
  ok(await page.isDisabled('[data-use]'), 'Use disabled over the limit');
  await shot('t02-over-limit');
  await page.fill('#ttlTitle', 'Free Chair Yoga for Seniors');
  await page.fill('#ttlSubtitle', 'Easy Chair Routines at Home');
  ok((await txt('.ttl-check-list')).startsWith('Sales claim: "Free" Repeated word: "chair"'), 'live warnings: sales + repeat');

  // Cap: room for 2, then the limit
  st.options[P2].push(...Array.from({ length: 29 }, (_, i) => ({ id: `ffff${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`, title: `Old Option ${i}`, subtitle: null, reason: null, keywords: [], unsourced: [], shortlisted: false, created_at: '2026-09-01T00:00:00Z' })));
  await go(P2, 4);
  await page.waitForSelector('.ttl-opt');
  ok((await txt('[data-gen]')).includes('Room for 2 more. A book can have 40 options.'), 'room note at 38');
  await page.click('[data-generate]');
  await page.waitForFunction(() => document.querySelector('.ttl-options-head').innerText.includes('40'));
  ok(await page.isDisabled('[data-generate]') && (await txt('[data-gen]')).includes('You have 40 options, the limit. Remove some to get more ideas.'), 'limit reached: button off, note');
  ok((await page.inputValue('#ttlTitle')) === 'Chair Yoga for Seniors Over 60', 'draft reloads from the saved title');

  // ── Unlocked positioning + Needs review
  await go(P4, 4);
  await page.waitForSelector('.ttl-empty');
  ok((await txt('.step-link[data-step="4"]')).includes('Needs review'), 'sidebar: Needs review on 04');
  ok(await page.isDisabled('[data-generate]') && (await txt('[data-gen]')).includes('Lock your positioning first. Title ideas follow it. Go to 03 Positioning'), 'Generate off with lock note');
  ok((await txt('[data-review]')).includes('Lock the positioning in 03 again, then press Use this title.'), 'review note while unlocked');
  ok(await page.isDisabled('[data-use]'), 'same title while unlocked: nothing to save');
  await page.fill('#ttlSubtitle', 'Seated Stretches for Seniors With Stiff Joints');
  await page.click('[data-use]');
  await page.waitForSelector('[data-use-status] .is-pass');
  const use2 = st.writes.filter((w) => w.table === 'books' && 'title' in w.body).pop();
  ok(!('title_needs_review' in use2.body) && st.books[P4].title_needs_review === true, 'unlocked: saved, Needs review kept');
  ok(!(await page.$('.step-link[data-step="4"].is-done')), '04 not done while Needs review');
  await shot('t03-needs-review');
  st.books[P4].pos.locked_at = new Date().toISOString();
  await go(P4, 4);
  await page.waitForSelector('[data-review] .ttl-note');
  ok((await txt('[data-review]')).includes('Check it, then press Use this title.') && !(await page.isDisabled('[data-use]')), 'locked again: Use clears review');
  await page.click('[data-use]');
  await page.waitForFunction(() => !document.querySelector('[data-review] .ttl-note'));
  const use3 = st.writes.filter((w) => w.table === 'books' && 'title' in w.body).pop();
  ok(use3.body.title_needs_review === false && !(await txt('.step-link[data-step="4"]')).includes('Needs review'), 'review cleared, flag gone');
  ok(!!(await page.$('.step-link[data-step="4"].is-done')), '04 done after review cleared');

  // ── Errors
  M.loadError = true;
  await go(P2, 4);
  await page.waitForSelector('[data-reload]');
  ok((await txt('[data-options]')).includes('We couldn’t load your title options.'), 'load error with Try again');
  M.loadError = false;
  await page.click('[data-reload]');
  await page.waitForSelector('.ttl-opt');
  ok(true, 'Try again loads');
  return log.join('\n');
};
