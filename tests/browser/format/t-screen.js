// 41 (settings column), 51b (32 px rows): what 08 shows and saves. E13.2 Part 2.
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 1100 });

  /* First open: the row is made with the defaults (one insert), then read. */
  await FM.open(page);
  ok(st.inserts === 1 && !!st.format, `first open makes the book_formats row (${st.inserts} insert)`);
  ok(await FM.has(page, '.fmt-settings') && await FM.has(page, '.fmt-preview'), 'two columns: settings and preview');
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '08 folds the sidebar to the rail');

  /* TEXT STYLE: 4 cards in order, Classic chosen, font names (Modern: Source Serif 4, owner Q4). */
  const cards = await FM.all(page, '.fmt-style');
  ok(cards.join('|') === 'Classic EB Garamond|Modern Source Serif 4|Clean Literata|Warm Lora', `style cards: ${cards.join('|')}`);
  ok(await page.$eval('.fmt-style.is-on input', (i) => i.value === 'classic' && i.checked), 'Classic is chosen by default');
  ok(await page.$$eval('.fmt-style img', (im) => im.map((i) => i.getAttribute('src')).join() === 'format/style-classic.png,format/style-modern.png,format/style-clean.png,format/style-warm.png'), 'each card shows its sample image');
  ok(await page.$$eval('.fmt-style-font', (f) => f.every((x) => x.getBoundingClientRect().height < 20)), 'font names on one line');
  ok((await FM.txt(page, '.fmt-group .fmt-hint')) === 'Changing style can change the page count.', 'style hint');
  ok((await page.$$eval('[data-fmt-select="chapter_label"] option', (o) => o.map((x) => x.textContent))).join() === 'Chapter 2,2,None', 'chapter label: Chapter 2, 2, None');

  /* BOOK PARTS in the fixed order (41; Introduction and Conclusion when the book has them). */
  const rows = await page.$$eval('.fmt-parts > .fmt-row', (r) => r.map((x) => x.firstElementChild ? x.firstElementChild.textContent.trim() : x.textContent.trim()));
  ok(rows.join('|') === 'Title page|Copyright|Contents|Show sections too|Kindle: always on (KDP needs it)|Dedication, epigraph, foreword, preface|Introduction|Conclusion|Notes and references, at the back|About the author|Also by', `parts: ${rows.join('|')}`);
  ok((await FM.all(page, '.fmt-parts .fmt-quiet')).slice(0, 2).join() === 'Always on,Always on', 'Title page and Copyright: Always on');
  ok((await FM.all(page, '.fmt-later')).join('|') === 'Write in 06 · v2b|Comes in v2b', 'v2b tags: Write in 06 · v2b, Comes in v2b');
  ok(await page.$eval('.fmt-row.is-later input[type="checkbox"]', (i) => i.disabled && !i.checked), 'Notes and references: off and disabled (owner Q3)');
  ok((await FM.txt(page, '#fmtIsbnNote')) === 'Add it when KDP gives it, then export again.', 'ISBN note');
  ok((await FM.txt(page, '[data-fmt-alsoby]')) === 'Choose books (0)', 'Also by: Choose books (0)');

  /* 32 px rows, the whole row is the click area (51b, CLAUDE.md §7 exception). */
  const heights = await page.$$eval('.fmt-parts > label.fmt-row', (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)));
  ok(heights.every((h) => h === 32), `switch rows are 32 px: ${heights}`);
  await page.click('.fmt-parts label.fmt-row:has([data-fmt-part="about"]) > span');
  ok(await page.$eval('[data-fmt-part="about"]', (i) => i.checked), 'a click on the row label ticks the box');
  await FM.saved(page);
  ok(st.format.parts.about === true, 'About the author saved');
  await page.click('.fmt-parts label.fmt-row:has([data-fmt-part="about"]) > span');
  await FM.saved(page);

  /* PAGE · PRINT */
  ok((await page.$$eval('[data-fmt-trim] option', (o) => o.map((x) => x.textContent))).join() === '6 × 9 in,5.5 × 8.5 in,5.25 × 8 in,5 × 8 in', 'trim: group A, 6 × 9 first');
  ok(await page.$eval('[data-fmt-trim]', (s) => s.value === '6x9'), 'trim from the Brief');
  ok((await page.$$eval('[data-fmt-select="paper"] option', (o) => o.map((x) => x.textContent))).join() === 'White,Cream', 'paper: White, Cream');
  ok((await page.$eval('.fmt-trim-pic', (e) => e.getAttribute('aria-label'))) === 'Trim drawing, 6 by 9 inches' && (await FM.txt(page, '.fmt-trim-pic')) === '6×9', 'trim drawing');
  ok((await page.$eval('[data-fmt-header]', (i) => i.placeholder)) === st.book.title, 'header title: the book title as placeholder');
  ok((await FM.txt(page, '#fmtHeaderHint')) === 'Long titles are cut with "…".', 'header title hint');
  ok(/We use 0\.75 in inside and 0\.5 in outside, mirrored\.$/.test(await FM.txt(page, '[data-fmt-margin]')), 'margin note');

  /* Each control saves its 0027 field. */
  const save = async (fn, field, want) => {
    const n = st.writes.length;
    await fn();
    await FM.saved(page);
    const w = st.writes.slice(n).filter((x) => x.table === 'book_formats' && x.body);
    ok(w.length >= 1 && JSON.stringify(w[w.length - 1].body[field]) === JSON.stringify(want) && JSON.stringify(st.format[field]) === JSON.stringify(want), `saves ${field} = ${JSON.stringify(want)} (${JSON.stringify(w.map((x) => x.body))})`);
  };
  await save(() => page.click('.fmt-style:has(input[value="modern"])'), 'style', 'modern');
  ok(await page.$eval('.fmt-style.is-on input', (i) => i.value === 'modern'), 'the chosen card moves');
  await save(() => page.selectOption('[data-fmt-select="chapter_label"]', 'number'), 'chapter_label', 'number');
  await save(() => page.click('label.fmt-row:has([data-fmt-flag="drop_cap"])'), 'drop_cap', true);
  await save(() => page.click('label.fmt-row:has([data-fmt-flag="contents_sections"])'), 'contents_sections', true);
  await save(() => page.click('label.fmt-row:has([data-fmt-part="contents"])'), 'parts', { title: true, copyright: true, contents: false, intro: true, conclusion: true, about: false, also_by: false });
  ok(await page.$eval('[data-fmt-flag="contents_sections"]', (i) => i.disabled), 'Contents off: Show sections too is off');
  await page.click('label.fmt-row:has([data-fmt-part="contents"])');
  await FM.saved(page);
  await save(() => page.click('label.fmt-row:has([data-fmt-part="intro"])'), 'parts', { title: true, copyright: true, contents: true, intro: false, conclusion: true, about: false, also_by: false });
  await save(() => page.selectOption('[data-fmt-select="paper"]', 'cream'), 'paper', 'cream');
  await save(() => page.click('label.fmt-row:has([data-fmt-flag="recto_start"])'), 'recto_start', false);
  await save(() => page.click('label.fmt-row:has([data-fmt-flag="running_header"])'), 'running_header', false);
  ok(await page.$eval('[data-fmt-header]', (i) => i.disabled), 'running header off: the header title is off');
  await page.click('label.fmt-row:has([data-fmt-flag="running_header"])');
  await FM.saved(page);
  await save(async () => { await page.fill('[data-fmt-header]', '  Micro Study Habits  '); }, 'header_title', 'Micro Study Habits');
  await save(async () => { await page.fill('[data-fmt-header]', ''); }, 'header_title', null);

  /* ISBN: hyphens and spaces fine, saved as 13 digits; a wrong one shows an error and is not saved. */
  await save(async () => { await page.fill('[data-fmt-isbn]', '978-0-306-40615-7'); await page.locator('[data-fmt-isbn]').blur(); }, 'isbn', '9780306406157');
  const before = st.writes.length;
  await page.fill('[data-fmt-isbn]', '978 0 306 40615 8');
  await page.locator('[data-fmt-isbn]').blur();
  await page.waitForTimeout(900);
  ok(!(await page.$eval('[data-fmt-isbn-err]', (e) => e.hidden)) && (await FM.txt(page, '[data-fmt-isbn-err]')) === 'Use a 13-digit ISBN that starts with 978 or 979. Hyphens and spaces are fine.', 'a wrong check digit: the error');
  ok(await page.$eval('[data-fmt-isbn]', (i) => i.getAttribute('aria-invalid') === 'true'), 'ISBN marked invalid');
  ok(!st.writes.slice(before).some((w) => w.table === 'book_formats' && w.body && 'isbn' in w.body) && st.format.isbn === '9780306406157', 'a wrong ISBN is not saved; the last good one stays');
  await save(async () => { await page.fill('[data-fmt-isbn]', ''); await page.locator('[data-fmt-isbn]').blur(); }, 'isbn', null);
  ok(await page.$eval('[data-fmt-isbn-err]', (e) => e.hidden), 'cleared: no error');

  /* A reload shows what was saved. */
  await FM.open(page);
  ok(st.inserts === 1, 'the second open makes no new row');
  ok(await page.$eval('.fmt-style.is-on input', (i) => i.value === 'modern') && await page.$eval('[data-fmt-select="paper"]', (s) => s.value === 'cream')
    && !(await page.$eval('[data-fmt-part="intro"]', (i) => i.checked)), 'a reload shows the saved settings');

  /* Title page and Copyright are always on: a stored false is saved as on (owner Q10). */
  st.format.parts.copyright = false;
  await FM.open(page);
  await FM.saved(page);
  ok(st.format.parts.copyright === true && FM.lastSave().body.parts.copyright === true, 'copyright off in the row: saved as on');

  /* A book without an Introduction or a Conclusion: no switch for them. */
  const intro = st.chapters.shift();
  const concl = st.chapters.pop();
  await FM.open(page);
  const rows2 = await page.$$eval('.fmt-parts > .fmt-row', (r) => r.map((x) => x.firstElementChild ? x.firstElementChild.textContent.trim() : ''));
  ok(!rows2.includes('Introduction') && !rows2.includes('Conclusion'), 'no Introduction or Conclusion row when the book has none');
  st.chapters.unshift(intro);
  st.chapters.push(concl);

  /* About the author on, the pen name has no bio: a note. */
  st.book.bio = '';
  st.format.parts.about = true;
  await FM.open(page);
  ok((await FM.txt(page, '.fmt-hint-row')) === 'Your pen name has no bio yet, so this page is left out.', 'no bio: the About the author note');
  st.book.bio = 'A teacher of adult learners.';
  st.format.parts.about = false;

  /* No other book with this pen name: no Choose books link. */
  const cands = st.candidates;
  st.candidates = [];
  await FM.open(page);
  ok(!(await FM.has(page, '[data-fmt-alsoby]')) && (await FM.all(page, '.fmt-parts .fmt-quiet')).includes('No other books with this pen name'), 'no other books: a quiet line');
  st.candidates = cands;

  /* Kindle (41b): a quiet state until the EPUB (owner Q1). Print brings back the stage. */
  await FM.open(page);
  await page.click('[data-fmt-mode="kindle"]');
  ok(await page.$eval('[data-fmt-mode="kindle"]', (b) => b.getAttribute('aria-pressed') === 'true') && (await FM.txt(page, '.fmt-state strong')) === 'Kindle preview comes with the EPUB.', 'Kindle: Kindle preview comes with the EPUB.');
  await page.click('[data-fmt-mode="print"]');
  ok(await page.$eval('[data-fmt-mode="print"]', (b) => b.getAttribute('aria-pressed') === 'true') && !(await page.$eval('[data-fmt-state]', (b) => !b.hidden && /Kindle/.test(b.textContent))), 'Print again: the Kindle state is gone');

  /* Load error, then Retry. */
  globalThis.__modes.formatFail = 1;   // the open's read (since Part 4 the 08 mark reads pdf_marks)
  await FM.open(page);
  ok((await FM.txt(page, '.fmt-root .state-box h2')) === "We couldn't load 08 Format" && await FM.has(page, '.fmt-root [role="alert"]'), 'load error: the message');
  await page.click('[data-fmt-retry-load]');
  await page.waitForSelector('.fmt', { timeout: 5000 });
  ok(true, 'Retry loads 08');

  /* Save error: the shared save line with Retry; Retry saves. */
  globalThis.__modes.saveFail = 1;
  await page.click('.fmt-style:has(input[value="warm"])');
  await page.waitForFunction(() => document.querySelector('[data-saved-line]').dataset.state === 'error', null, { timeout: 5000 });
  ok(await FM.has(page, '[data-retry-save]'), 'save error: Retry in the save line');
  await page.click('[data-rail-toggle]');
  await page.click('[data-retry-save]');
  await FM.saved(page);
  ok(st.format.style === 'warm', 'Retry saves');
  await page.click('[data-rail-toggle]');

  /* Keyboard: focus ring on a style card and a row box; no sideways scroll. */
  await page.focus('.fmt-style input[value="warm"]');
  await page.keyboard.press('ArrowLeft');
  await FM.saved(page);
  ok(st.format.style === 'clean' && await page.$eval('.fmt-style.is-on input', (i) => i.value === 'clean' && document.activeElement === i), 'arrow keys move between the style cards and save');
  ok(await page.$eval('.fmt-style.is-on', (c) => { const s = getComputedStyle(c); return s.outlineStyle === 'solid' && s.outlineWidth === '2px' && s.outlineOffset === '2px'; }), 'the focused card shows the 2 px ring, 2 px offset');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.focus('[data-fmt-part="about"]');
  await page.keyboard.press('Space');
  ok(await page.$eval('[data-fmt-part="about"]', (i) => i.checked), 'Space ticks a row box');
  await FM.saved(page);
  ok(st.format.parts.about === true, 'the Space tick saved');
  ok(await FM.noScroll(page), '1440: no sideways scroll');

  /* 900 px: one column, no sideways scroll. */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(100);
  const cols = await page.$eval('.fmt', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  ok(cols === 1, `900: one column (${cols})`);
  ok(await FM.noScroll(page), '900: no sideways scroll');

  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
