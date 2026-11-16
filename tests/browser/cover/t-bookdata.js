// E16 Part 8: the Book data panel (design 68 left): its words, Add all to the cover (the missing ones, selected
// together), per row Add or "✓ On the cover" (selects the layer), a book with no subtitle, the Back blurb card
// (Write blurb / Edit blurb, the start of the words), spine text (off under 86 pages on white, Add spine text at 120:
// the full title and the pen name, plan D13), trim, pages and spine, the Text panel's Back blurb and Author line rows.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  const st = globalThis.__store;
  const E = (f) => page.evaluate(f);
  const srcs = async () => (await CV.state(page)).layers.map((l) => l.src || l.type);
  await FIX.band(page);

  /* An empty cover. */
  await CV.open(page, { design: 'empty' });
  ok(await page.$eval('[data-tool="book"]', (b) => !b.hasAttribute('aria-disabled')), 'the Book data tool is live');
  await page.click('[data-tool="book"]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Book data'), 'the Book data panel opens');
  ok((await CV.txt(page, '[data-panel] > .cv-help')) === 'The words KDP checks must match your book details exactly, so they come from your book, not free typing.', 'the panel words (design 68)');
  const cards = await CV.all(page, '.cv-bd-card');
  ok(cards[0] === 'Title Add Micro Study Habits for Busy Adult Learners' && cards[1] === 'Subtitle Add ' + FIX.subtitle && cards[2] === 'Pen name Add Adnan Haroun', `the 3 rows: ${cards.slice(0, 3).join(' | ').slice(0, 120)}…`);
  ok(cards[3] === 'Back blurb Write blurb Not written yet. AI drafts it from your book; you edit and approve.', `the Back blurb card: ${cards[3]}`);
  ok((await CV.txt(page, '.cv-bd-spine')) === 'SPINE TEXT Off for this book. It has 54 pages; on white paper spine text starts at 86 pages so it never runs off the spine.', 'spine text: off at 54 pages on white (86, plan D14)');
  ok((await CV.txt(page, '.cv-bd-specs')) === 'Trim 6 × 9 in Pages 54, white paper Spine spine 0.122 in', 'trim, pages, spine');
  ok(/Change words in 04 Title and Pen Names\. Change trim, pages or paper in 08 Format; the cover redraws to match\./.test(await CV.txt(page, '[data-panel]')), 'the last line');

  /* Add one row: ✓ On the cover; then Add all adds the other two, selected together. */
  await page.click('[data-add-book="subtitle"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.length === 1, null, { timeout: 10000 });
  ok((await CV.all(page, '.cv-bd-card .cv-bd-head'))[1] === 'Subtitle On the cover', 'Subtitle: On the cover');
  await page.waitForTimeout(600);   // a change within 500 ms of the last joins its Undo step (history.js)
  ok(await page.$eval('[data-bd-find="subtitle"] svg', () => true) && await page.$eval('[data-bd-find="subtitle"]', (b) => getComputedStyle(b).color === 'rgb(30, 122, 70)'), 'it is the success color, with its ✓ icon');
  await page.click('[data-bd-all]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.length === 3, null, { timeout: 10000 });
  ok((await srcs()).join(',') === 'subtitle,title,pen', 'Add all: the title and the pen name are added');
  ok((await E(() => window.kdpBookSteps[9]._debug().multi.length)) === 2, 'the two new ones are selected together (design)');
  ok(!(await CV.has(page, '[data-bd-all]')), 'all on the cover: no Add all button');
  ok((await CV.layer(page, 'pen')).caps === true && (await CV.layer(page, 'title')).font === 'Source Serif 4', 'the book styles (design addBook)');
  // ✓ On the cover selects that layer.
  await page.click('[data-bd-find="title"]');
  const t = await CV.layer(page, 'title');
  ok((await CV.state(page)).sel === t.id, '✓ On the cover selects the title');
  // One Undo takes back Add all.
  await page.click('[data-k="undo"]');
  ok((await srcs()).join(',') === 'subtitle', 'Undo: Add all was one step');

  /* A book with no subtitle: the row says so, Add is off, Add all skips it. */
  st.book.subtitle = null;
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="book"]');
  ok((await CV.all(page, '.cv-bd-card'))[1] === 'Subtitle Add This book has no subtitle in 04 Title.', 'no subtitle: the row says so');
  ok(await page.$eval('[data-add-book="subtitle"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'This book has no subtitle in 04 Title.'), 'its Add is off, with the reason');
  await page.click('[data-bd-all]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.length === 2, null, { timeout: 10000 });
  ok((await srcs()).join(',') === 'title,pen', 'Add all: the title and the pen name only');
  st.book.subtitle = FIX.subtitle;

  /* The Back blurb card follows the blurb on the cover. */
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="book"]');
  const card = (await CV.all(page, '.cv-bd-card'))[3];
  ok(card === 'Back blurb Edit blurb ' + FIX.blurbWarm.slice(0, 140).replace(/\s+/g, ' ') + '…', `a blurb on the cover: Edit blurb and its first 140 characters: ${card.slice(0, 60)}…`);
  ok(cards.length === 4, '4 cards');

  /* Spine text at 120 pages: Add spine text; then on. */
  st.pdf.page_count = 120;
  st.design = { book_id: FIX.BOOK, layers: [], bg: '#FFFFFF', fmt: { trim: '6x9', pages: 120, paper: 'white' }, layout: null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await CV.open(page);
  await page.click('[data-tool="book"]');
  ok((await CV.txt(page, '.cv-bd-spine')) === 'SPINE TEXT On for this book: 120 pages gives a 0.270 in spine. Add spine text', 'spine text: on at 120 pages, with Add spine text');
  await page.click('[data-add-spine]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'spine'), null, { timeout: 10000 });
  const sp = await CV.layer(page, 'spine');
  const want = await E(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.layouts.spineLayer(sp0(), E.cover.fmt, { title: E.bookWords('title'), subtitle: E.bookWords('subtitle'), pen: E.bookWords('pen') }); function sp0() { return E.cover.layers.find((l) => l.src === 'spine').id; } });
  ok(JSON.stringify(sp) === JSON.stringify(want), 'the spine layer is kdpCover.layouts.spineLayer (cap height, one line, plan D13)');
  ok(sp.text === `${FIX.title}    ${FIX.pen}` && sp.rot === 90 && sp.caps === true && sp.size >= 7, `the full title and the pen name, in capitals, ${sp.size} pt`);
  ok((await CV.txt(page, '.cv-bd-spine')) === 'SPINE TEXT On for this book: 120 pages gives a 0.270 in spine. Spine text is on the cover.', 'then: Spine text is on the cover');
  ok((await CV.state(page)).sel === sp.id, 'the spine text is selected');
  const chk = await E(() => kdpCover.checks.run(window.kdpBookSteps[9]._debug().cover, { samples: true }).filter((c) => /^C[345]$/.test(c.code)));
  ok(chk.length === 0, 'no spine check problem (C3 to C5)');
  st.pdf.page_count = FIX.fmt.pages;

  /* The Text panel: Back blurb opens the dialog; Author line opens it with the author line ticked. */
  await CV.open(page, { design: 'empty' });
  ok(await page.$eval('[data-k="blurb"]', (b) => !b.hasAttribute('aria-disabled') && b.textContent === 'Write blurb'), 'Text panel: Write blurb is live');
  await page.click('[data-k="blurb"]');
  ok(await CV.has(page, '[data-blurbdlg] [role="dialog"]'), 'Write blurb opens the blurb dialog');
  await page.keyboard.press('Escape');
  ok(!(await CV.has(page, '[data-blurbdlg]')) && (await E(() => document.activeElement.dataset.k)) === 'blurb', 'Escape closes it; focus back on Write blurb');
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.blurb.author = false; });
  await page.click('[data-k="author"]');
  ok(await page.$eval('[data-bl-author]', (c) => c.checked), 'Author line, Add: the dialog opens with the author line ticked');
  await page.click('[data-bl-close]');
  st.book.bio = '  ';
  await CV.open(page, { design: 'empty' });
  ok(await page.$eval('[data-k="author"]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Add a bio in Pen Names first.'), 'no bio: Author line, Add is off with the reason');
  st.book.bio = FIX.bio;

  /* Step D. */
  await CV.open(page, { design: 'empty' });
  await page.click('[data-tool="book"]');
  const small = await page.$$eval('[data-panel] button', (a) => a.filter((b) => { const r = b.getBoundingClientRect(); const af = getComputedStyle(b, '::after'); return Math.max(r.width, parseFloat(af.width) || 0) < 44 || Math.max(r.height, parseFloat(af.height) || 0) < 44; }).map((b) => b.dataset.k));
  ok(small.length === 0, `every button has a 44 px click area${small.length ? ': ' + small.join(', ') : ''}`);
  const fs = await page.$$eval('[data-panel] *', (a) => a.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12).length);
  ok(fs === 0, 'no text under 12 px');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
