// i14 on step 01: Help me fill also suggests stance and stand-out idea.
// More options opens; Accept saves them through options and keeps
// references; Verify on stand-out; Accept all skips the flagged one;
// series and references never get suggestions.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const area = async () => ((await page.innerText('[data-help-area]').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const settle = () => page.waitForTimeout(900);
  const help = async () => {
    await page.click('[data-help]');
    await page.waitForFunction(() => /Suggestions are ready|Nothing to change/.test((document.querySelector('[data-help-area]') || {}).innerText || ''), null, { timeout: 8000 });
  };
  // Real-length: stance and stand-out near the 500 limit.
  const STANCE = 'Gentle movement done every day does more for stiff joints than hard workouts done once a week. Readers over 60 should never push through pain, and a chair is not a lesser choice than a mat: it is the safest way to build the habit, the strength and the balance that keep them independent. Progress means moving a little more each week, at their own pace, with rest days that are part of the plan rather than a sign of failure. Comfort and safety come first, and confidence follows from small wins.';
  const STANDOUT = 'Every pose in the book is done sitting down or holding the back of a chair, with a version for readers who cannot lift their arms above the shoulder. A four-week plan starts at five minutes and grows slowly, and each routine is shown in large photos with short steps in large print, so a reader can follow along without glasses, a video, or a teacher, and can stop and start again on any day without losing their place.';
  const FIVE = {
    target_reader: 'Adults over 60 with stiff knees, hips or shoulders who want a gentle routine at home.',
    reader_problem: 'Floor poses hurt, and classes move too fast for them.',
    promise_draft: 'After this book, the reader can follow a gentle seated routine every day.',
    stance: STANCE.slice(0, 500),
    standout: STANDOUT.slice(0, 500)
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Five suggestions on a book with saved references and series (B4).
  M.suggest = FIVE;
  M.unsourced = {};
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B4}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  ok(!(await page.$eval('.brief-more', (d) => d.open)), 'More options starts closed');
  await help();
  ok(await page.$eval('.brief-more', (d) => d.open), 'More options opens for stance and stand-out');
  ok((await area()).startsWith('Suggestions are ready under Target reader, Reader problem, Reader promise, Your stance and Stand-out idea. Nothing changes until you accept.'), `note: "${await area()}"`);
  const stanceBox = (await page.innerText('[data-suggest="stance"]')).replace(/\s+/g, ' ');
  ok(/AI SUGGESTION/.test(stanceBox) && stanceBox.includes(FIVE.stance.slice(0, 80)), 'stance suggestion under Your stance');
  ok(/Accept replaces your text\./.test(stanceBox), 'stance has text: "Accept replaces your text."');
  ok(/Accept puts it in the field\./.test(await page.innerText('[data-suggest="standout"]')), 'stand-out empty: "Accept puts it in the field."');
  ok((await page.innerText('[data-suggest="references"]')) === '' && !(await page.$('[data-suggest="series_name"] .bio-suggest')), 'no suggestion for references or series');
  await page.screenshot({ path: `${SHOTS}/brief-help-more.png`, fullPage: true, timeout: 5000 }).catch(() => {});

  // 2. Accept stance: one options save, references kept.
  let n = W().length;
  await page.click('[data-accept="stance"]');
  await settle();
  let w = W().slice(n);
  ok(w.length === 1 && Object.keys(w[0].body).join() === 'options', `one options save (${w.map((x) => Object.keys(x.body))})`);
  const o = w[0] && w[0].body.options;
  ok(o && o.stance === FIVE.stance && o.references.startsWith('Smith, J. Gentle Movement') && !('standout' in o), 'options: new stance, references kept, no stand-out yet');
  ok((await page.inputValue('#bf-stance')) === FIVE.stance, 'field shows the stance');
  ok(await page.evaluate(() => document.activeElement.id === 'bf-stance'), 'focus on Your stance');
  ok(st.books[B4].brief.book_type_label === 'Gardening guide', 'book type untouched');

  // 3. Discard stand-out: nothing saved, field still empty.
  n = W().length;
  await page.click('[data-discard="standout"]');
  await settle();
  ok(W().length === n && (await page.inputValue('#bf-standout')) === '', 'discard saves nothing');

  // 4. Stand-out with a Verify flag; Accept all takes the rest, skips it.
  M.suggest = { ...FIVE, stance: 'Slow and steady wins for stiff joints.', standout: 'A 6-week plan with 40 poses.' };
  M.unsourced = { standout: ['6', '40'] };
  await help();
  ok(/Verify: no source for 6 and 40\./.test(await page.innerText('[data-suggest="standout"]')), 'stand-out shows its Verify flag');
  n = W().length;
  await page.click('[data-accept-all]');
  await settle();
  w = W().slice(n);
  const keys = w.flatMap((x) => Object.keys(x.body)).sort().join(',');
  ok(w.length === 1 && keys === 'options,promise_draft,reader_problem,target_reader', `one save: reader fields + options (${keys})`);
  const o2 = w[0] && w[0].body.options;
  ok(o2 && o2.stance === 'Slow and steady wins for stiff joints.' && !o2.standout && o2.references.includes('CDC'), 'options: stance taken, flagged stand-out not, references kept');
  ok((await area()) === 'Accepted 4 suggestions. 1 with a Verify flag is still waiting below.', `note: "${await area()}"`);
  ok(/A 6-week plan with 40 poses/.test(await page.innerText('[data-suggest="standout"]')), 'flagged stand-out still waits');
  await page.click('[data-accept="standout"]');
  await settle();
  ok(st.books[B4].brief.options.standout === 'A 6-week plan with 40 poses.' && st.books[B4].brief.options.stance === 'Slow and steady wins for stiff joints.', 'its own Accept takes it, stance kept');
  ok((await area()) === '', 'note gone after the last choice');

  // 5. Same as the saved text: no suggestion shown, and More options stays as the user left it.
  M.suggest = { stance: 'Slow and steady wins for stiff joints.' };
  M.unsourced = {};
  await help();
  ok((await area()) === 'The AI suggests what you already have. Nothing to change.', 'same text: nothing to change');

  // 6. Old server reply (three fields): no stance box, More options not forced open.
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${B3}&step=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bf-topic_text', { timeout: 10000 });
  M.suggest = { target_reader: FIVE.target_reader, reader_problem: FIVE.reader_problem, promise_draft: FIVE.promise_draft };
  await help();
  ok(!(await page.$eval('.brief-more', (d) => d.open)) && (await page.innerText('[data-suggest="stance"]')) === '', 'three-field reply: More options stays closed');
  await page.click('[data-accept-all]');
  await settle();
  ok(!st.writes.some((x) => x.failed), 'no refused write');
  M.suggest = null; M.unsourced = null;
  return log.join('\n');
};
