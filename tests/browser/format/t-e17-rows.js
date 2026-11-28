// E17 Part 7 (design 83): the 08 BOOK PARTS rows (book_parts.enabled, the same switch as the 06 menu), the
// pills, Open in 06, the Ready box warning (book_parts_files = part_file_list, never a JS rule), the Kindle
// preview with parts, the switch states (saving, failed + Retry, offline, parts read error), the 08 done mark,
// hostile part text, 32 px rows, focus ring, 200% text.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const part = (k) => st.parts.find((p) => p.kind === k);
  const HOSTILE = '<img src=x onerror="window.__xss=1"> # $ @ * _ & < > " \'';
  const ver = (n, content, words) => ({ id: `9e000000-0000-4000-8000-00000000000${n}`, content, word_count: words });
  const dbg = () => g(() => { const x = window.kdpBookSteps[8]._debug(); return { bp: x.bp.state, save: x.bpSave }; });
  const rowsReady = () => page.waitForSelector('[data-fmt-bp-row="dedication"]', { timeout: 10000 });
  const quiet = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return !Object.keys(x.bpSave).some((k) => x.bpSave[k].state === 'saving'); }, null, { timeout: 8000 });
  const partWrites = () => st.writes.filter((w) => w.table === 'book_parts');
  // innerText reads the sr-only ": Name" after "Open in 06" with a space before it.
  const tidy = (t) => t.replace(/ :/g, ':');
  const side = (k) => page.$eval(`[data-fmt-bp-row="${k}"] .fmt-bp-side`, (e) => e.innerText.replace(/\s+/g, ' ').trim().replace(/ :/g, ':'));

  /* The book: dedication Final (hostile text), foreword Draft, preface on but empty, about Final, review request
     on, Also by on with one valid book and one gone. Epigraph and acknowledgments off. A Print PDF exists. */
  Object.assign(part('dedication'), { enabled: true, status: 'final', version: ver(1, HOSTILE, 9) });
  Object.assign(part('foreword'), { enabled: true, status: 'draft', version: ver(2, 'A short foreword draft.', 4) });
  Object.assign(part('preface'), { enabled: true, status: 'draft', version: null });
  Object.assign(part('about_author'), { enabled: true, status: 'final', version: ver(3, 'Nora teaches adults to study.', 5) });
  Object.assign(part('review_request'), { enabled: true });
  Object.assign(part('also_by'), { enabled: true });
  st.alsoBy = [{ book_id: st.candidates[0].id, title: 'Worry Less Workbook', valid: true }, { book_id: null, title: 'An old book', valid: false }];
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  st.changed = false;
  await page.setViewportSize({ width: 1440, height: 1100 });

  /* Loading: 08 waits for the parts read with its loading state, then shows the rows. */
  globalThis.__modes.partsSlow = 2500;
  await page.goto(FM.url(8), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-step-title]:not(:empty)', { timeout: 10000 });
  await page.waitForSelector('.fmt-loading', { timeout: 5000 });
  ok((await FM.txt(page, '.fmt-loading')) === 'Loading 08 Format…' && !(await FM.has(page, '[data-fmt-bp-row]')), 'loading: the 08 loading state, no rows yet');
  await rowsReady();
  globalThis.__modes.partsSlow = 0;
  ok(true, 'the rows show after the parts read');

  /* 1 · Rows in the fixed order (83), each switch = book_parts.enabled. */
  const order = await page.$$eval('[data-fmt-bp-row]', (r) => r.map((x) => x.dataset.fmtBpRow));
  ok(order.join() === 'dedication,epigraph,foreword,preface,acknowledgments,about_author,review_request,also_by', `part rows in order: ${order}`);
  const boxes = await page.$$eval('[data-fmt-bp]', (b) => b.map((x) => [x.dataset.fmtBp, x.checked]));
  ok(boxes.every(([k, on]) => on === part(k).enabled), `every switch shows book_parts.enabled (${JSON.stringify(boxes)})`);
  ok((await side('dedication')) === 'Open in 06: Dedication', `Final: no pill, Open in 06 (${await side('dedication')})`);
  ok((await FM.txt(page, '[data-fmt-bp-row="foreword"] .fmt-pill')) === 'Draft', 'Draft pill');
  ok((await FM.txt(page, '[data-fmt-bp-row="preface"] .fmt-pill.is-empty')) === 'Empty', 'Empty pill (dashed)');
  ok((await FM.txt(page, '[data-fmt-bp-row="review_request"] .fmt-tag')) === 'Fixed text' && !(await FM.has(page, '[data-fmt-bp-row="review_request"] a')), 'Review request: Fixed text, no Open in 06');
  ok((await FM.txt(page, '[data-fmt-bp-row="also_by"] .fmt-bp-books')) === '1 book', 'Also by: 1 book (the valid ones)');
  ok((await side('epigraph')) === '' && (await side('acknowledgments')) === '', 'off: no pill, no link');
  const hrefs = await page.$$eval('.fmt-bp-open', (a) => a.map((x) => [x.dataset.fmtOpenPart, x.getAttribute('href')]));
  ok(hrefs.every(([k, h]) => h === `book.html?id=${FB}&step=6&part=${part(k).id}`) && hrefs.length === 5, `Open in 06 links to step 6 with the part (${hrefs.length})`);
  ok(!(await page.$('[data-fmt-bp-row="notes"]')) && (await FM.all(page, '.fmt-parts > .fmt-row:has(.fmt-tag)')).some((t) => t === 'Notes and references Comes later'), 'Notes and references: Comes later, no switch');
  const hs = await page.$$eval('[data-fmt-bp-row]', (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(hs.every((h) => h === 32), `part rows are 32 px (${hs})`);

  /* 2 · Ready box: the parts left out (book_parts_files), with Open in 06. Never blocks export. */
  const box = '[data-fmt-ready] [data-fmt-parts-ready]';
  ok((await FM.txt(page, `${box} strong`)) === '2 book parts are not ready.', 'Ready box: 2 book parts are not ready.');
  ok((await FM.txt(page, box)).includes('They are left out of the files until they are Final.') && await page.$eval(`${box}`, (b) => b.classList.contains('alert-warning') && !!b.querySelector('svg')), 'amber box with icon and words');
  const lines = (await FM.all(page, `${box} .fmt-parts-line`)).map(tidy).join('|');
  ok(lines === 'Foreword is a Draft. Open in 06: Foreword|Preface is on but empty. Open in 06: Preface', `lines: ${lines}`);
  ok(await page.$$eval(`${box} [data-fmt-open-part]`, (a, ids) => a.every((x) => x.getAttribute('href').endsWith(`&part=${ids[x.dataset.fmtOpenPart]}`)), Object.fromEntries(st.parts.map((p) => [p.kind, p.id]))), 'box links open the right part');
  ok((await FM.txt(page, '[data-fmt-ready] .fmt-parts-note')) === 'A warning only: you can still export. Chapters and sections follow the same Final rule as today.', 'the under note (83)');
  await page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready'; }, null, { timeout: 30000 });
  await page.click('[data-export]');
  await page.waitForSelector('.fmt-exp[open] [data-pdf]', { timeout: 10000 });
  ok(await page.$eval('.fmt-exp[open] [data-pdf]', (b) => !b.disabled) && await page.$eval('.fmt-exp[open] [data-epub]', (b) => !b.disabled), 'export is not blocked: Print PDF and EPUB buttons work');
  await page.keyboard.press('Escape');
  ok(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done')), 'the 08 done mark: from the Print PDF only (still done with parts not ready)');

  /* Hostile part text is text, never HTML (08 and the Kindle frame). */
  ok(!(await page.$('img[onerror]')) && await g(() => !window.__xss), '08: no hostile element');

  /* 3 · Kindle preview: the parts in the file are screens, the Draft and empty ones are not. */
  await page.click('[data-fmt-mode="kindle"]');
  await page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.kb.state === 'ready' && x.kp && x.kp.state().ready; }, null, { timeout: 15000 });
  const kp = await g(() => {
    const f = window.kdpBookSteps[8]._debug().kp.frames().find((x) => !x.classList.contains('is-next')) || window.kdpBookSteps[8]._debug().kp.frames()[0];
    const d = f.contentDocument;
    const ded = d.getElementById('dedication');
    return { ids: [...d.querySelectorAll('.kp-part')].map((p) => p.id), img: d.querySelectorAll('img[onerror]').length, xss: !!f.contentWindow.__xss, ded: ded ? ded.textContent : '' };
  });
  ok(['dedication', 'about', 'review', 'also-by'].every((i) => kp.ids.includes(i)), `Kindle: the parts in the file are in the preview (${kp.ids.join()})`);
  ok(!kp.ids.includes('foreword') && !kp.ids.includes('preface') && !kp.ids.includes('epigraph'), 'Kindle: the Draft foreword, the empty preface and the off epigraph are left out');
  // The EPUB turns straight quotes into curly ones (book typography), so only the rest is compared as typed.
  ok(kp.img === 0 && !kp.xss && kp.ded.includes('<img src=x onerror=') && kp.ded.includes('# $ @ * _ & < >'), `Kindle: the hostile dedication shows as text (${JSON.stringify(kp.ded.trim().slice(0, 60))})`);
  ok((await FM.all(page, '[data-fmt-parts-ready]')).filter(Boolean).some((t) => t.startsWith('2 book parts are not ready.')), 'Kindle: the same parts warning');
  await page.click('[data-fmt-mode="print"]');

  /* 5 · A switch writes book_parts.enabled only; a part in the file marks the Print PDF changed. */
  const n0 = partWrites().length;
  await page.click('[data-fmt-bp-row="epigraph"] .fmt-bp-name');
  await quiet();
  await page.waitForSelector('[data-fmt-bp-row="epigraph"] .fmt-pill', { timeout: 5000 });
  const w1 = partWrites().slice(n0);
  ok(w1.length === 1 && w1[0].id === part('epigraph').id && JSON.stringify(w1[0].body) === '{"enabled":true}' && part('epigraph').enabled, `epigraph on: one write, {enabled:true} (${JSON.stringify(w1)})`);
  ok((await FM.txt(page, `${box} strong`)) === '3 book parts are not ready.' && (await FM.txt(page, '[data-fmt-bp-row="epigraph"] .fmt-pill')) === 'Empty', 'epigraph on, empty: Empty pill, the box counts 3');
  // Design 83 ("Changed mark"): turning a part on or off marks the Print PDF changed, in the file or not (0035 part_key_extra).
  await page.waitForFunction(() => !document.querySelector('[data-step="8"]').classList.contains('is-done'), null, { timeout: 5000 }).catch(() => {});
  ok(st.changed && !(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done'))), 'epigraph on (not in the file): the Print PDF reads changed (83: turning a part on or off)');
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  st.changed = false;
  await FM.open(page);
  await rowsReady();
  ok(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done')), 'a new Print PDF: 08 done again (the mark is the Print PDF only)');
  await page.click('[data-fmt-bp-row="dedication"] .fmt-bp-name');
  await quiet();
  await page.waitForFunction(() => !document.querySelector('[data-fmt-bp="dedication"]').checked && !document.querySelector('[data-fmt-bp-row="dedication"] a'), null, { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('[data-step="8"]').classList.contains('is-done'), null, { timeout: 5000 }).catch(() => {});
  ok(st.changed && !part('dedication').enabled && !(await page.$eval('[data-step="8"]', (a) => a.classList.contains('is-done'))), 'dedication (in the file) off: the Print PDF is changed, 08 not done');
  ok(st.epubKey() && st.partsFiles().every((f) => f.kind !== 'dedication'), 'the files leave the dedication out');
  await page.click('[data-fmt-bp-row="dedication"] .fmt-bp-name');
  await quiet();
  await page.waitForSelector('[data-fmt-bp-row="dedication"] a', { timeout: 5000 });
  ok(partWrites().every((w) => JSON.stringify(Object.keys(w.body)) === '["enabled"]'), `every part write is {enabled} only (${partWrites().length})`);

  /* The 06 menu shows the same state (one source of truth). */
  await FM.open(page, 6);
  await page.waitForSelector('[data-parts-add]', { timeout: 10000 });
  await page.click('[data-parts-add]');
  await page.waitForSelector('#wrPartsMenu [data-pm-kind]', { timeout: 5000 });
  const menu = await page.$$eval('#wrPartsMenu [data-pm-kind]', (r) => r.map((x) => [x.dataset.pmKind, x.getAttribute('aria-checked') === 'true']));
  ok(menu.length === 8 && menu.every(([k, on]) => on === part(k).enabled), `06 menu = 08 switches (${JSON.stringify(menu)})`);
  await page.keyboard.press('Escape');

  /* Open in 06 lands on that part. */
  await FM.open(page);
  await rowsReady();
  await page.click('[data-fmt-bp-row="foreword"] .fmt-bp-open');
  await page.waitForURL(/step=6&part=/, { timeout: 10000 });
  await page.waitForSelector(`[data-part="${part('foreword').id}"][aria-current="true"]`, { timeout: 10000 });
  ok(page.url().endsWith(`&step=6&part=${part('foreword').id}`), 'Open in 06: step 06 with the foreword open');
  await FM.open(page);
  await rowsReady();
  await page.click(`${box} [data-fmt-open-part="preface"]`);
  await page.waitForSelector(`[data-part="${part('preface').id}"][aria-current="true"]`, { timeout: 10000 });
  ok(true, 'the Ready box link lands on the preface');

  /* Save failed: the box goes back, a red line (icon + words) with Retry; Retry saves. Offline says so. */
  await FM.open(page);
  await rowsReady();
  globalThis.__modes.partSaveFail = 1;
  await page.click('[data-fmt-bp-row="acknowledgments"] .fmt-bp-name');
  await page.waitForSelector('#fmtBpErr-acknowledgments', { timeout: 5000 });
  ok(!(await page.$eval('[data-fmt-bp="acknowledgments"]', (i) => i.checked)) && !part('acknowledgments').enabled, 'save failed: the switch goes back, nothing saved');
  ok((await FM.txt(page, '#fmtBpErr-acknowledgments')) === 'Not saved. Retry' && await page.$eval('#fmtBpErr-acknowledgments', (e) => e.classList.contains('field-error') && !!e.querySelector('svg') && e.getAttribute('role') === 'alert'), 'red line: icon, Not saved., Retry');
  ok(await page.$eval('[data-fmt-bp="acknowledgments"]', (i) => i.getAttribute('aria-describedby') === 'fmtBpErr-acknowledgments'), 'the switch is described by the error');
  ok(await page.$eval('[data-fmt-bp-retry]', (b) => b.getBoundingClientRect().height >= 44), `Retry is 44 px or more (${await page.$eval('[data-fmt-bp-retry]', (b) => b.getBoundingClientRect().height)})`);
  await page.click('[data-fmt-bp-retry="acknowledgments"]');
  await quiet();
  await page.waitForFunction(() => document.querySelector('[data-fmt-bp="acknowledgments"]').checked && !document.querySelector('#fmtBpErr-acknowledgments'), null, { timeout: 5000 });
  ok(part('acknowledgments').enabled, 'Retry saves');
  globalThis.__modes.partSaveOffline = 1;
  await page.click('[data-fmt-bp-row="acknowledgments"] .fmt-bp-name');
  await page.waitForSelector('#fmtBpErr-acknowledgments', { timeout: 5000 });
  ok((await FM.txt(page, '#fmtBpErr-acknowledgments')) === 'You are offline. Not saved. Retry' && part('acknowledgments').enabled, 'offline: You are offline. Not saved.');
  await page.click('[data-fmt-bp-retry="acknowledgments"]');
  await quiet();
  await page.waitForFunction(() => !document.querySelector('[data-fmt-bp="acknowledgments"]').checked && !document.querySelector('#fmtBpErr-acknowledgments'), null, { timeout: 5000 });
  ok(!part('acknowledgments').enabled, 'Retry after offline saves');

  /* The parts read fails: an inline line with Retry; the rest of 08 works. */
  globalThis.__modes.partsReadFail = 2;   // the shell reads book_parts_json once (the 06 rail), then 08
  await FM.open(page);
  await page.waitForSelector('[data-fmt-bp-reload]', { timeout: 10000 });
  ok((await FM.txt(page, '.fmt-parts')).includes('Book parts could not load.') && await FM.has(page, '.fmt-style') && !(await FM.has(page, '[data-fmt-bp-row]')), 'parts read failed: the line and Retry, 08 still works');
  await page.click('[data-fmt-bp-reload]');
  await rowsReady();
  ok(!(await FM.has(page, '[data-fmt-bp-reload]')), 'Retry loads the rows');

  /* Focus ring on Open in 06; the keyboard ticks a part switch. */
  await page.focus('[data-fmt-bp="foreword"]');
  await page.keyboard.press('Shift+Tab');
  ok(await g(() => { const a = document.activeElement; const s = getComputedStyle(a); return a.matches('.fmt-bp-open') && s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px'; }), 'Open in 06: the 2 px ring, 2 px offset');
  await page.focus('[data-fmt-bp="epigraph"]');
  await page.keyboard.press('Space');
  await quiet();
  await page.waitForFunction(() => !document.querySelector('[data-fmt-bp="epigraph"]').checked, null, { timeout: 5000 });
  ok(!part('epigraph').enabled && await g(() => document.activeElement && document.activeElement.matches('[data-fmt-bp="epigraph"]')), 'Space turns a part off; focus stays on its switch');

  /* 900 and 200% text: no sideways scroll. */
  for (const w of [1440, 900]) {
    await page.setViewportSize({ width: w, height: 900 });
    await g(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(200);
    ok(await FM.noScroll(page) && await page.$eval('.fmt-settings', (c) => c.scrollWidth <= c.clientWidth + 1), `${w} at 200% text: no sideways scroll`);
    await g(() => { document.documentElement.style.fontSize = ''; });
  }

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
