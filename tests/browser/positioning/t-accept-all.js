// i5 on step 03: "Accept all" takes every suggestion without a Verify flag,
// as normal edits (one save), and the drift check goes out of date.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const txt = async (sel) => ((await page.innerText(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const posWrites = () => st.writes.filter((w) => w.table === 'positioning');
  const waitSaved = async () => { await page.waitForTimeout(80); await page.waitForFunction(() => (document.querySelector('[data-saved-line]') || {}).dataset?.state === 'saved', null, { timeout: 5000 }); };
  const help = async () => {
    await page.click('[data-help-all]');
    await page.waitForFunction(() => /Suggestions are ready|Nothing to change/.test((document.querySelector('[data-help-area]') || {}).innerText || ''), null, { timeout: 8000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A positioning with a current drift check, so we can see Accept all clear it.
  st.books[P1].pos = { one_sentence: TXT.one, reader_promise: TXT.promise, approach: TXT.approach, lacks: TXT.lacks, selling_points: TXT.points, focus_tags: TXT.tags,
    drift_flags: [], drift_checked_at: new Date().toISOString(), locked_at: null, updated_at: new Date().toISOString() };
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${P1}&step=3`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-help-all]');
  ok((await txt('#lockNote')) === 'Ready to lock.', 'before: ready to lock (current check)');

  // 1. Six suggestions; reader_promise carries a Verify flag ("20").
  await help();
  ok(!!(await page.$('[data-help-area] [data-accept-all]')), 'Accept all shows with 5 suggestions waiting (selling points match, so none there)');
  ok((await txt('[data-help-area] .help-note')).startsWith('Suggestions are ready under'), 'the usual note stays above it');
  await page.screenshot({ path: `${SHOTS}/accept-all-before.png`, timeout: 5000 }).catch(() => {});
  const n0 = posWrites().length;
  await page.click('[data-accept-all]');
  await waitSaved();
  const w = posWrites().slice(n0);
  ok(w.length === 1, `one save for every accepted card (${w.length})`);
  const sent = w[0] ? Object.keys(w[0].body).filter((k) => k !== 'book_id').sort().join(',') : '';
  ok(sent === 'approach,focus_tags,lacks,one_sentence', `sent the four unflagged cards, not the flagged promise (${sent})`);
  ok(w[0] && w[0].body.one_sentence === LONG_ONE, 'the long one-sentence suggestion is saved whole');
  ok(!!(await page.$('[data-suggest="reader_promise"] [data-accept]')), 'the flagged reader promise still waits with its own Accept');
  ok(/Verify: no source for 20/.test(await txt('[data-suggest="reader_promise"]')), 'its Verify flag is still shown');
  ok((await txt('[data-help-area]')) === 'Accepted 4 suggestions. 1 with a Verify flag is still waiting on its card.', `note: "${await txt('[data-help-area]')}"`);
  ok(!(await page.$('[data-accept-all]')), 'Accept all is gone');
  ok(st.books[P1].pos.drift_checked_at === null, 'the database cleared the drift check (text edit)');
  ok((await txt('[data-run-drift]')) === 'Run drift check' && !(await page.isDisabled('[data-run-drift]')), 'drift panel asks for a new check');
  ok((await txt('#lockNote')) === 'Run the drift check first.', `lock reason: "${await txt('#lockNote')}"`);
  const focus = await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-card]') && document.activeElement.closest('[data-card]').dataset.card);
  ok(focus === 'one_sentence', `focus on the first accepted card (${focus})`);
  ok((await page.$eval('[data-next-note]', (e) => e.textContent)) === 'Not done yet: run the drift check.', 'Next note follows');
  await page.screenshot({ path: `${SHOTS}/accept-all-after.png`, timeout: 5000 }).catch(() => {});

  // 2. Discarding the last one ends the note.
  await page.click('[data-discard="reader_promise"]');
  ok((await txt('[data-help-area]')) === '', 'note gone after the last choice');
  ok((await txt('[data-card="reader_promise"] .posn-text')) === TXT.promise || (await txt('[data-card="reader_promise"]')).includes(TXT.promise), 'reader promise kept the author text');

  // 3. One flagged and one not; then a single suggestion (no Accept all).
  M.help = { reader_promise: 'After finishing this book, you can follow a safe 20-minute chair routine at home, every day, without help.', approach: TXT.approach + ' Every week adds one pose.' };
  await help();
  ok(!!(await page.$('[data-accept-all]')), 'two waiting, one unflagged: Accept all shows');
  await page.click('[data-accept-all]');
  await waitSaved();
  ok((await txt('[data-help-area]')) === 'Accepted 1 suggestion. 1 with a Verify flag is still waiting on its card.', `singular note: "${await txt('[data-help-area]')}"`);
  await page.click('[data-accept="reader_promise"]');
  await waitSaved();
  ok((await txt('[data-help-area]')) === '', 'single Accept of the flagged one ends the note');
  M.help = { approach: TXT.approach + ' Rest days are built in.' };
  await help();
  ok(!(await page.$('[data-accept-all]')), 'one suggestion: no Accept all');
  M.help = null;
  return log.join('\n');
};
