// 06 opened from Quality Control (design 56, E14.4): the section, the mark, the bar, Previous and
// Next inside one group, Back with the place kept, "This spot changed", no spot, a reload, the end
// of the session, the 07 mark after a save, 900 px.
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  const spot = () => page.evaluate(() => { const h = CSS.highlights.get('qc-spot'); return h ? [...h].map((r) => r.toString()).join('|') : null; });
  const bar = () => QC.txt(page, '[data-qc-bar] .qc-wbar-text');
  const shown = () => page.$eval('[data-qc-bar]', (b) => !b.hidden);
  const editor = () => page.waitForSelector('[data-editor]', { timeout: 8000 });
  const inView = () => page.evaluate(() => {
    const r = [...CSS.highlights.get('qc-spot')][0].getBoundingClientRect();
    const b = document.querySelector('[data-editor]').getBoundingClientRect();
    return r.height > 0 && r.top >= b.top && r.bottom <= b.bottom;
  });
  const secId = (n) => st.section(n).id;
  const openGroup = async (g) => { if ((await page.$eval(`[data-group="${g}"]`, (b) => b.getAttribute('aria-expanded'))) !== 'true') await page.click(`[data-group="${g}"]`); };
  const barWaits = (re) => page.waitForFunction((s) => new RegExp(s).test(document.querySelector('[data-qc-bar]').innerText), re, { timeout: 6000 });
  const onEditor = (n) => page.waitForFunction((id) => location.search.includes(`section=${id}`) && document.querySelector('[data-editor]') && document.querySelector(`[data-section="${id}"][aria-current]`), secId(n), { timeout: 8000 });
  const marked = () => page.waitForFunction(() => CSS.highlights.has('qc-spot'), null, { timeout: 6000 });
  /** Opens the row of this issue. */
  const openRow = async (g, id, nth = 0) => { await openGroup(g); await (await page.$$(`#qc-g${g} [data-open="${id}"]`))[nth].click(); };
  const fresh = async () => { await QC.open7(page); await QC.run(page); };

  st.sample();
  await fresh();
  const items = st.runs[0].results.items;
  const web = items.find((x) => x.rule === 'web_link');
  const verify = items.find((x) => x.rule === 'verify_mark');
  const repeats = items.filter((x) => x.g === 3);

  /* The section, the mark, the bar. */
  await page.$eval('[data-group="1"]', (b) => b.click());   // Group 1 shut, 7 open: the place to come back to.
  await openRow(7, web.section_id);
  await onEditor('3.4');
  await marked();
  ok(/step=6/.test(page.url()) && page.url().includes(`section=${web.section_id}`), 'Open in 06: step 6 and the section in the address');
  ok((await QC.txt(page, '[data-sec-title]')) === '3.4 Start small part 4'.replace('Start small', 'Spaced practice'), `06 opens that section: ${await QC.txt(page, '[data-sec-title]')}`);
  ok((await spot()) === web.quote, `the spot is marked: ${await spot()}`);
  ok(await inView(), 'the page scrolled to the spot');
  ok(await page.$eval('[data-editor]', (e) => e.scrollTop > 0), 'the editor really scrolled: the spot is low in the section');
  const n7 = items.filter((x) => x.g === 7 && x.section_id).length;
  ok((await bar()) === `From Quality Control · KDP rules, issue 1 of ${n7}. ${web.message}`, `bar text: ${await bar()}`);
  ok((await page.$eval('[data-qc-bar]', (b) => b.getAttribute('role') + '|' + b.getAttribute('aria-label'))) === 'region|Quality Control issue', 'the bar is a named region');
  await page.waitForFunction(() => document.querySelector('[data-live]').textContent.includes('From Quality Control'), null, { timeout: 3000 });
  ok((await page.$eval('[data-live]', (e) => e.textContent)) === `From Quality Control · KDP rules, issue 1 of ${n7}. ${web.message}`, 'a live region says the bar text');
  ok(!(await page.$eval('[data-qc-bar]', (b) => !!b.closest('[aria-live]'))), 'the bar is outside the live content area: said once');
  ok(await page.$eval('[data-qc-prev]', (b) => b.disabled) && await page.$eval('[data-qc-next]', (b) => b.disabled), 'one issue: Previous and Next are off');
  ok((await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable'))) === 'true', 'editing works as usual under the bar');
  ok(!st.writes.some((w) => w.fn === 'save_version'), 'opening from QC saved nothing');

  /* Back: the groups, the scroll, the focus. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await page.waitForFunction((i) => document.activeElement && document.activeElement.closest(`[data-item="${i}"]`), items.indexOf(web), { timeout: 6000 });
  ok(/step=7/.test(page.url()), 'Back opens 07');
  ok((await page.$eval('[data-group="1"]', (b) => b.getAttribute('aria-expanded'))) === 'false', 'Back: a group left shut stays shut');
  ok((await page.$eval('[data-group="7"]', (b) => b.getAttribute('aria-expanded'))) === 'true', 'Back: a group left open stays open');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-open')), "Back: the focus is on that issue's Open in 06");
  ok(!(await shown()), 'Back: the bar is gone');

  /* The scroll, with a page that really scrolls. */
  await page.setViewportSize({ width: 1440, height: 500 });
  await openGroup(1);
  // The row sits in view first, so the click itself scrolls nothing.
  const y = await page.$eval(`#qc-g7 [data-open="${web.section_id}"]`, (a) => { a.scrollIntoView({ block: 'center' }); return window.scrollY; });
  ok(y > 300, `the list scrolls here: ${y}`);
  await openRow(7, web.section_id);
  await marked();
  ok((await page.evaluate(() => window.scrollY)) === 0, '06 has no page scroll, so 07 must put it back itself');
  await page.click('[data-qc-back]');
  await page.waitForFunction((i) => document.activeElement && document.activeElement.closest(`[data-item="${i}"]`), items.indexOf(web), { timeout: 6000 });
  ok((await page.evaluate(() => window.scrollY)) === y, `Back: the scroll is as left (${y})`);
  ok(await page.evaluate(() => { const r = document.activeElement.closest('[data-item]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), 'Back: the row is in view');
  await page.setViewportSize({ width: 1440, height: 900 });

  /* A Verify mark: the sentence is marked, the pill is not (design 56). */
  await QC.open7(page);
  await openRow(2, verify.section_id);
  await marked();
  ok((await spot()) === verify.quote.replace(/\s*\[Verify: no source\]$/, ''), `the sentence before the pill: ${await spot()}`);
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });

  /* Previous and Next stay in the group, and across sections. */
  await QC.open7(page);
  await openGroup(3);
  await openRow(3, repeats[0].section_id);
  await marked();
  const m = repeats.filter((x) => x.section_id).length;
  ok(m >= 2, `group 3 has ${m} issues`);
  ok((await bar()).startsWith(`From Quality Control · Repeats, issue 1 of ${m}.`), `Repeats, issue 1: ${await bar()}`);
  ok(await page.$eval('[data-qc-prev]', (b) => b.disabled), 'Previous is off at the start');
  ok(!(await page.$eval('[data-qc-next]', (b) => b.disabled)), 'Next is on');
  await page.focus('[data-qc-next]');
  for (let i = 1; i < m; i++) {
    await page.keyboard.press('Enter');
    await barWaits(`issue ${i + 1} of ${m}`);
    await page.waitForFunction((id) => document.querySelector(`[data-section="${id}"][aria-current]`) && document.querySelector('[data-editor]'), repeats[i].section_id, { timeout: 8000 });
    await marked();
    ok((await spot()) === repeats[i].quote, `Next, issue ${i + 1}: ${(await spot() || '').slice(0, 50)}`);
    ok(page.url().includes(`section=${repeats[i].section_id}`), `Next, issue ${i + 1}: the section opened`);
  }
  ok(await page.$eval('[data-qc-next]', (b) => b.disabled), 'Next is off at the end');
  ok(await page.evaluate(() => document.activeElement.hasAttribute('data-qc-prev')), 'the focus moves off a button that turned off');
  ok((await bar()).includes(`Repeats, issue ${m} of ${m}`), 'still group 3 at the end: Next never leaves the group');
  await page.click('[data-qc-prev]');
  await barWaits(`issue ${m - 1} of ${m}`);
  await page.waitForFunction((id) => location.search.includes(`section=${id}`) && document.querySelector('[data-editor]'), repeats[m - 2].section_id, { timeout: 8000 });
  await page.waitForFunction((q) => { const h = CSS.highlights.get('qc-spot'); return h && [...h][0].toString() === q; }, repeats[m - 2].quote, { timeout: 6000 });
  ok(true, 'Previous goes back');
  await page.click('[data-qc-back]');
  await page.waitForFunction((i) => document.activeElement && document.activeElement.closest(`[data-item="${i}"]`), items.indexOf(repeats[m - 2]), { timeout: 6000 });
  ok(true, 'Back after Previous: the focus is on the issue on show, not the one first opened');

  /* Two issues in one section: Next moves the mark, the section is not read again. */
  const twoRow = st.section('7.1');
  const twoOld = twoRow.version.content;
  st.edit(twoRow, `See https://one.example/a first.\n\n${twoOld}\n\nThen see https://two.example/b last.`);
  await fresh();
  const webs = st.runs[0].results.items.filter((x) => x.rule === 'web_link' && x.section_id === twoRow.id);
  ok(webs.length === 2, `two links in one section: ${webs.length}`);
  await openRow(7, twoRow.id);
  await page.waitForFunction((id) => location.search.includes(`section=${id}`) && document.querySelector('[data-editor]'), twoRow.id, { timeout: 8000 });
  await marked();
  ok((await spot()) === webs[0].quote, 'the first link is marked');
  await page.waitForSelector('.wr-vers', { timeout: 6000 });
  await page.waitForTimeout(300);
  const reads = st.calls.filter((c) => /section_versions/.test(c)).length;
  await page.click('[data-qc-next]');
  await page.waitForFunction((q) => [...CSS.highlights.get('qc-spot')][0].toString() === q, webs[1].quote, { timeout: 4000 });
  ok(st.calls.filter((c) => /section_versions/.test(c)).length === reads, 'Next in one section reads nothing');
  ok(await inView(), 'and scrolls to the next spot');
  await page.click('[data-qc-prev]');
  await page.waitForFunction((q) => [...CSS.highlights.get('qc-spot')][0].toString() === q, webs[0].quote, { timeout: 4000 });
  ok(await inView(), 'Previous scrolls back up');

  /* Back during a slow Next still counts. */
  await page.waitForFunction(() => { const e = document.querySelector('[data-editor]'); return e && e.getAttribute('contenteditable') === 'true'; });
  await page.click('[data-editor]');
  await page.keyboard.type('Typed. ');
  await page.waitForFunction(() => /Unsaved/.test(document.querySelector('[data-foot-text]').textContent));
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  ok(/step=7/.test(page.url()), 'Back with typed text works');
  twoRow.version = st.edit(twoRow, twoOld);
  await fresh();
  await openGroup(3);

  /* A leave refused: the issue stays. */
  await openRow(3, repeats[0].section_id);
  await marked();
  await page.waitForFunction(() => { const e = document.querySelector('[data-editor]'); return e && e.getAttribute('contenteditable') === 'true'; });
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' New words here.');
  globalThis.__modes.draftFail = true; globalThis.__modes.versionFail = true;
  await page.keyboard.type(' More words.');
  await page.click('[data-qc-next]');
  await page.waitForSelector('[data-main] .alert-error', { timeout: 8000 });
  ok((await bar()).includes(`issue 1 of ${m}`), 'the text cannot be saved: Next keeps the issue');
  ok(page.url().includes(`section=${repeats[0].section_id}`), 'and the section');
  globalThis.__modes.draftFail = false; globalThis.__modes.versionFail = false;

  /* Normal leave rules: typed text becomes a version before the next section opens. */
  await page.click('[data-editor]');
  await page.keyboard.type(' Saved at last.');
  await page.waitForFunction(() => /Unsaved/.test(document.querySelector('[data-foot-text]').textContent));
  const before = st.writes.filter((w) => w.fn === 'save_version').length;
  await page.click('[data-qc-next]');
  await barWaits(`issue 2 of ${m}`);
  await page.waitForFunction((id) => location.search.includes(`section=${id}`), repeats[1].section_id, { timeout: 8000 });
  ok(st.writes.filter((w) => w.fn === 'save_version').length === before + 1, 'Next: typed text becomes a version first');
  ok(/Saved at last\./.test(st.sections().find((s) => s.id === repeats[0].section_id).version.content), 'that version holds the typing');
  await page.waitForFunction(() => { const e = document.querySelector('[data-editor]'); return e && e.getAttribute('contenteditable') === 'true'; });
  ok(true, 'the next section is editable');

  /* Back while Next is still saving: the click is not lost. */
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' Slow save.');
  await page.waitForFunction(() => /Unsaved/.test(document.querySelector('[data-foot-text]').textContent));
  globalThis.__modes.versionSlow = 500;
  await page.click('[data-qc-prev]');
  await page.click('[data-qc-back]');
  await page.waitForFunction(() => /step=7/.test(location.search), null, { timeout: 6000 });
  globalThis.__modes.versionSlow = 0;
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  ok(true, 'Back during a slow Previous still opens 07');

  /* The 07 mark: a save moves it (2 s, debounced), a draft does not. */
  await fresh();
  await page.waitForFunction(() => /, done/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')));
  await openRow(3, repeats[0].section_id);
  await marked();
  ok(/, done/.test(await page.$eval('[data-step="7"]', (a) => a.getAttribute('aria-label'))), '07 is done on arrival');
  // Opening 06 reads the mark once by itself (2 s after the outline): let that pass first.
  await page.waitForTimeout(2300);
  const marks0 = st.marks;
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' A draft only.');
  await page.waitForFunction(() => /Unsaved/.test(document.querySelector('[data-foot-text]').textContent));
  for (let i = 0; i < 60 && !st.writes.some((w) => w.table === 'section_drafts' && /A draft only/.test(w.body.content)); i++) await page.waitForTimeout(50);
  const marks1 = st.marks;
  await page.waitForTimeout(2300);
  ok(st.marks === marks0 && marks1 === marks0, `a draft does not read the mark (${marks0}, ${marks1}, ${st.marks})`);
  await page.click('[data-save-version]');
  const t0 = Date.now();
  await page.waitForFunction(() => /out of date/.test(document.querySelector('[data-step="7"]').getAttribute('aria-label')), null, { timeout: 6000 });
  const waited = Date.now() - t0;
  ok(waited > 1500, `a saved version moves the mark after about 2 s (${waited} ms)`);
  ok((await shown()) && !!(await spot()), 'the save keeps the bar and the mark');
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-box.is-warning', { timeout: 6000 });
  ok(/^You changed/.test(await QC.txt(page, '.qc-box.is-warning .qc-sub')), 'Back: 07 shows Out of date');

  /* The spot found by the quote: a new version moved it. */
  await fresh();
  const moved = st.runs[0].results.items.find((x) => x.rule === 'web_link');
  const row = st.sections().find((s) => s.id === moved.section_id);
  const oldText = row.version.content;
  st.edit(row, `One new line at the top of the section.\n\n${oldText}`);
  await QC.open7(page);
  await openRow(7, moved.section_id);
  await marked();
  ok((await spot()) === moved.quote, 'a new version: the quote finds the spot');
  ok(await inView(), 'and it scrolls there');
  ok(!(await page.$eval('[data-qc-lost]', (e) => !e.hidden)), 'no "spot changed" line');

  /* Not found. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  st.edit(row, oldText.replace(moved.quote, 'Read more in the library.'));
  await QC.open7(page);
  await openRow(7, moved.section_id);
  await barWaits('This spot changed\\. It may be fixed\\.');
  ok((await spot()) === null, 'not found: no mark');
  ok((await bar()).endsWith('This spot changed. It may be fixed.'), `the bar says so: ${await bar()}`);
  await page.waitForFunction(() => /This spot changed/.test(document.querySelector('[data-live]').textContent), null, { timeout: 3000 });
  ok(true, 'the live region says it too');
  ok(await page.$eval('[data-qc-lost] svg', (e) => !!e), 'with an icon and words');
  ok(await page.$eval('[data-section][aria-current]', (e) => !!e), 'the section stays open');

  /* A draft: the same version, other words. Offsets would be wrong, the quote is right. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  st.edit(row, oldText);
  await fresh();
  const again = st.runs[0].results.items.find((x) => x.rule === 'web_link');
  st.drafts[again.section_id] = { content: `Typed first.\n\n${oldText}`, base_version_id: again.version_id, saved_at: new Date().toISOString() };
  await openRow(7, again.section_id);
  await marked();
  ok((await spot()) === again.quote, 'unsaved typing above the spot: the quote finds it');
  delete st.drafts[again.section_id];
  await page.goto('about:blank');

  /* An issue with no place in the text. */
  await QC.open7(page);
  const notFinal = st.runs[0].results.items.find((x) => x.rule === 'not_final');
  await openRow(1, notFinal.section_id);
  await barWaits('Complete, issue \\d+ of');
  await onEditor('3.2');
  await page.waitForTimeout(300);
  ok((await spot()) === null, 'no spot: no mark');
  ok(!(await page.$eval('[data-qc-lost]', (e) => !e.hidden)), 'no spot: no "spot changed" line');
  ok(page.url().includes(`section=${notFinal.section_id}`), 'no spot: the section opens');

  /* A dismissed issue is not in the session. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  const group1 = st.runs[0].results.items.filter((x) => x.g === 1 && x.section_id);
  await page.waitForSelector(`#qc-g1 [data-ok]`);
  await page.click(`[data-item="${st.runs[0].results.items.indexOf(group1[group1.length - 1])}"] [data-ok]`);
  await page.waitForFunction(() => { const b = document.querySelector('[data-justok] [data-undo]'); return b && !b.disabled; });
  await openRow(1, group1[0].section_id);
  await barWaits(`issue 1 of ${group1.length - 1}\\.`);
  ok(true, `a row marked as OK is left out: 1 of ${group1.length - 1}`);

  /* A chapter-wide issue: the chapter's first section with text. */
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  ok(await page.$('[data-justok]'), 'Back keeps the "Marked as OK" line as left');
  const ch = st.chapters[3];
  const firstEmpty = ch.sections[0];
  const keep = firstEmpty.version;
  firstEmpty.version = null;
  await QC.open(page, 6);   // 06 reads the outline with the first section empty
  await editor();
  await page.click('[data-step="7"]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await page.evaluate((c) => {
    const w = window.kdpBookSteps[6];
    w.qcSession({ group: 6, name: 'Promise', items: [{ i: 0, chapterId: c, message: 'This chapter drifts.', quote: '', spot: null }], index: 0, runId: null, scroll: 0, back: false });
    w.openSpot({ chapterId: c, spot: null, quote: '' });
    document.querySelector('[data-step="6"]').click();
  }, ch.id);
  await barWaits('Promise, issue 1 of 1');
  await page.waitForFunction((id) => location.search.includes(`section=${id}`), ch.sections[1].id, { timeout: 8000 });
  ok(true, "a chapter-wide issue opens the chapter's first section with text");
  ok((await spot()) === null, 'and marks nothing');
  firstEmpty.version = keep;

  /* A reload keeps the section, not the bar. */
  await fresh();
  const w2 = st.runs[0].results.items.find((x) => x.rule === 'web_link');
  await openRow(7, w2.section_id);
  await marked();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-editor]', { timeout: 8000 });
  await page.waitForTimeout(300);
  ok(page.url().includes(`section=${w2.section_id}`), 'a reload keeps the section');
  ok(await page.$eval(`[data-section="${w2.section_id}"]`, (b) => b.hasAttribute('aria-current')), 'that section is the open one');
  ok(!(await shown()), 'a reload drops the bar');
  ok((await spot()) === null, 'and the mark');

  /* The session ends on any other step change. */
  await QC.open7(page);
  await openRow(7, w2.section_id);
  await marked();
  await page.click('[data-step="5"]');
  await page.waitForFunction(() => /step=5/.test(location.search));
  ok(!(await shown()), 'another step: the bar goes');
  ok((await page.evaluate(() => CSS.highlights.has('qc-spot'))) === false, 'and the mark');
  await page.click('[data-step="6"]');
  await editor();
  await page.waitForTimeout(300);
  ok(!(await shown()), 'back on 06 with no bar: the session ended');

  await QC.open7(page);
  await openRow(7, w2.section_id);
  await marked();
  await page.click('[data-next]');
  await page.waitForFunction(() => /step=7/.test(location.search));
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  ok(!(await shown()), 'Next to 07 ends it too');
  await page.click('[data-back]');
  await editor();
  await page.waitForTimeout(300);
  ok(!(await shown()), 'and 06 opens with no bar');

  await QC.open7(page);
  await openRow(7, w2.section_id);
  await marked();
  await page.goBack();
  await page.waitForFunction(() => /step=7/.test(location.search));
  await page.waitForTimeout(200);
  ok(!(await shown()), "the browser's Back ends it too");

  /* A section picked by hand: the bar stays, the mark waits for its section. */
  await QC.open7(page);
  await openRow(7, w2.section_id);
  await marked();
  await page.click(`[data-section="${st.section('3.1').id}"]`);
  await page.waitForFunction((id) => location.search.includes(`section=${id}`) && document.querySelector('[data-editor]'), st.section('3.1').id);
  await page.waitForTimeout(200);
  ok(await shown(), 'another section by hand: the bar stays');
  ok((await spot()) === null, 'its text is not marked');
  await page.click(`[data-section="${w2.section_id}"]`);
  await marked();
  ok((await spot()) === w2.quote, 'back on the section: marked again');

  /* No Highlight API: the selection, as Show does. */
  await page.evaluate(() => { window.Highlight = undefined; });
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await page.waitForFunction(() => document.activeElement && document.activeElement.hasAttribute('data-open'), null, { timeout: 6000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction((q) => String(window.getSelection()) === q, w2.quote, { timeout: 6000 });
  ok(true, 'no Highlight API: the selection marks the spot');
  await page.waitForFunction(() => document.activeElement.hasAttribute('data-editor'), null, { timeout: 6000 });
  ok(true, 'and the editor has the focus');

  /* 44 px hit areas, the look of 36 px, tokens, focus ring. */
  await QC.open(page, 7);
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await openRow(7, w2.section_id);
  await marked();
  const sizes = await page.$$eval('[data-qc-bar] button', (bs) => bs.map((b) => {
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const reach = (y) => { const e = document.elementFromPoint(x, y); return e === b || b.contains(e); };
    return { h: Math.round(r.height), up: reach(r.top - 4), down: reach(r.bottom + 3), past: reach(r.top - 5) || reach(r.bottom + 4) };   // whole pixels: y to y + 1
  }));
  ok(sizes.every((z) => z.h === 36 && z.up && z.down && !z.past), `36 px look, 44 px hit area: ${JSON.stringify(sizes)}`);
  await page.focus('[data-qc-back]');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineStyle} ${c.outlineWidth} ${c.outlineOffset}`; });
  ok(ring === 'solid 2px 2px', `focus ring: ${ring}`);
  const look = await page.$eval('[data-qc-bar]', (b) => { const c = getComputedStyle(b); return `${c.backgroundColor} ${c.borderBottomColor} ${c.fontSize}`; });
  ok(look === 'rgb(248, 248, 246) rgb(217, 217, 213) 14px', `bar colors and size: ${look}`);

  /* 900 px: wraps, no sideways scroll, the mark still in view. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(200);
  ok(await QC.noScroll(page), '900 px: no sideways scroll');
  const box = await page.$eval('[data-qc-bar]', (b) => { const r = b.getBoundingClientRect(); return r.right <= document.documentElement.clientWidth; });
  ok(box, '900 px: the bar fits');
  await page.click('[data-qc-back]');
  await page.waitForSelector('.qc-groups', { timeout: 6000 });
  await page.waitForFunction(() => document.activeElement && document.activeElement.hasAttribute('data-open'), null, { timeout: 6000 });
  await page.click('[data-open]:focus');
  await marked();
  ok(await inView(), '900 px: the spot is in view');
  await page.setViewportSize({ width: 1440, height: 900 });

  return log.join('\n');
};
