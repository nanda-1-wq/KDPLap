// E16 Part 8: the back blurb dialog (design 68, plan §3, D3, D4, D8): its words; the draft from the cover's blurb; Length
// and Tone; the author line tick (on with a bio; off with the reason and a Pen Names link without one); Write with AI
// sends only { stage, bookId, length, tone, authorLine } (generate v28; no prompt, no bio); "Writing from your
// book…"; the draft; Write again; the word count and the fit note (11 pt, 10 pt, too long as a warning, Put off);
// the words KDP may not accept as whole words; Verify: no source while the number is still in the draft; the AI's
// errors (nothing counted); a reply after Close is let go; Put on the back cover saves a version first (ai or manual)
// and sets the one blurb layer (or places a new one), one Undo step; a failed save keeps the dialog and the cover;
// Escape, the focus trap, the cover's keys resting, Step D.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  const st = globalThis.__store;
  const E = (f) => page.evaluate(f);
  const PH = 'Your back blurb goes here. Use Book data, Write blurb, to draft it from your book.';
  const band = await FIX.band(page);
  const withPlaceholder = () => { const b = JSON.parse(JSON.stringify(band)); b.layers.forEach((l) => { if (l.src === 'blurb') l.text = PH; }); return b; };
  const designOf = (b) => ({ book_id: FIX.BOOK, layers: b ? b.layers : [], bg: b ? b.bg : '#FFFFFF', fmt: { ...FIX.fmt }, layout: b ? 'band' : null, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const openDlg = async () => { await page.click('[data-tool="book"]'); await page.click('[data-open-blurb]'); await page.waitForSelector('[data-blurbdlg] [role="dialog"]'); };
  const text = () => page.$eval('[data-bl-text]', (t) => t.value);
  const meta = () => CV.txt(page, '[data-bl-meta]');
  const put = () => page.$eval('[data-bl-put]', (b) => ({ off: b.getAttribute('aria-disabled') === 'true', label: b.textContent.trim(), title: b.title }));

  /* The dialog on a cover with the placeholder. */
  st.design = designOf(withPlaceholder()); st.blurbs = []; st.gen = []; st.ai = null;
  await CV.open(page);
  await openDlg();
  ok(await page.$eval('[data-blurbdlg] [role="dialog"]', (d) => d.getAttribute('aria-modal') === 'true' && d.getAttribute('aria-labelledby') === 'cv-bl-h'), 'a modal dialog named by its heading');
  ok((await CV.txt(page, '.cv-bl-head')) === 'Back blurb AI drafts it from your book\'s reader and promise (03 Positioning). You edit it and decide what goes on the cover.', 'the heading and its line (the server reads the Positioning only: STOP 8 N-item)');
  ok((await CV.all(page, '.cv-bl-len')).join(' | ') === 'Short about 80 words | Medium about 130 words | Long about 180 words', 'Length: Short, Medium, Long with their words');
  ok((await CV.all(page, '[data-bl-tone]')).join(' ') === 'Warm Direct Expert', 'Tone: Warm, Direct, Expert');
  ok((await page.$$eval('.cv-bl-seg.is-on', (a) => a.map((b) => b.dataset.blLen || b.dataset.blTone))).join(',') === 'medium,warm', 'Medium and Warm to start (design)');
  ok((await CV.txt(page, '.cv-bl-author')) === 'End with one line about the author (Adnan Haroun)' && await page.$eval('[data-bl-author]', (c) => c.checked && !c.disabled), 'the author line: ticked, with the pen name');
  ok((await CV.txt(page, '.cv-bl-empty')) === 'Pick a length and tone, then press "Write with AI". Or type your own blurb here after the first draft.', 'no draft: the design words');
  ok((await CV.txt(page, '[data-bl-write]')) === 'Write with AI' && (await CV.txt(page, '.cv-bl-write .cv-bl-note')) === 'One AI call each time, counted in your usage.', 'Write with AI and its note (no cost line)');
  ok((await put()).off && (await put()).label === 'Put on the back cover', 'Put on the back cover is off with no draft');
  ok((await CV.txt(page, '.cv-bl-foot .cv-bl-note')) === 'You can change the font, size and color on the cover after.', 'the footer line');
  ok((await E(() => document.activeElement.dataset.blLen)) === 'medium', 'focus starts on the pressed length');

  /* The cover's keys rest while it is open; Tab stays inside. */
  const n0 = (await CV.state(page)).layers.length;
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Delete'); await page.keyboard.press('Meta+z');
  ok((await CV.state(page)).layers.length === n0 && (await E(() => window.kdpBookSteps[9]._debug().multi.length)) === 0, 'select all, Delete and Undo do nothing to the cover');
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  ok(await E(() => !!document.activeElement.closest('[data-blurbdlg]')), 'Tab stays in the dialog');
  await page.keyboard.press('Shift+Tab');
  ok(await E(() => !!document.activeElement.closest('[data-blurbdlg]')), 'Shift+Tab too');

  /* Short, Direct; Write with AI: only ids and choices go up; "Writing from your book…". */
  await page.click('[data-bl-len="short"]'); await page.click('[data-bl-tone="direct"]');
  ok((await page.$$eval('.cv-bl-seg.is-on', (a) => a.map((b) => b.dataset.blLen || b.dataset.blTone))).join(',') === 'short,direct', 'Short and Direct pressed');
  globalThis.__modes.genSlow = 1500;
  await page.click('[data-bl-write]');
  await page.waitForSelector('.cv-bl-wait', { timeout: 5000 });
  ok((await CV.txt(page, '.cv-bl-wait')) === 'Writing from your book…' && await page.$eval('.cv-bl-wait', (w) => w.getAttribute('role') === 'status'), 'Writing from your book… (a status)');
  ok(await page.$eval('[data-bl-write]', (b) => b.getAttribute('aria-disabled') === 'true') && (await put()).off, 'Write and Put are off while it writes');
  await page.waitForSelector('[data-bl-text]', { timeout: 10000 });
  globalThis.__modes.genSlow = 0;
  ok(JSON.stringify(st.gen[0]) === JSON.stringify({ stage: 'cover_blurb', bookId: FIX.BOOK, length: 'short', tone: 'direct', authorLine: true }), `the request: ${JSON.stringify(st.gen[0])}`);
  ok((await text()) === FIX.blurbWarm + '\n\n' + FIX.bio, 'the draft: the reply, with the author line last');
  ok((await CV.txt(page, '[data-bl-write]')) === 'Write again', 'the button reads Write again');
  ok((await meta()) === '92 words Fits the back cover at 11 pt, above the barcode.', `the count and the fit note: ${await meta()}`);
  ok(await page.$eval('.cv-bl-fit', (f) => f.classList.contains('is-ok') && !!f.querySelector('svg') && getComputedStyle(f).color === 'rgb(30, 122, 70)'), 'the fit note is the success color with its icon');
  ok(!(await put()).off, 'Put is on');
  ok((await E(() => document.activeElement.matches('[data-bl-text]'))), 'focus goes to the draft');

  /* Untick the author line: the next request says so. */
  await page.click('[data-bl-author]');
  await page.click('[data-bl-write]');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().blurb.busy, null, { timeout: 10000 });
  ok(st.gen[1].authorLine === false && (await text()) === FIX.blurbWarm, 'unticked: authorLine false, no author line');

  /* Typing: count, fit (10 pt, too long: a warning, Put off), whole-word flags, Verify while the number stays. */
  await page.fill('[data-bl-text]', 'A secure plan. It cures nothing, guaranteed. Not a bestseller, not #12, but #1 for you. Sold on Amazon.');
  ok((await meta()).startsWith('19 words Fits the back cover at 11 pt'), 'the count follows the typing');
  const fl = await CV.all(page, '[data-bl-flags] div div');
  ok(fl.join(' | ') === '"guarantee" promises a result. | "cure" is a health claim. | "bestseller" is a sales claim KDP may reject. | "#1" is a ranking claim. | "amazon" is a store name on the cover.', `the words KDP may not accept: ${fl.join(' | ')}`);
  ok(await page.$eval('[data-bl-flags]', (b) => !!b.querySelector('svg') && /Words KDP may not accept:/.test(b.textContent)), 'with the warning icon and the design words');
  await page.fill('[data-bl-text]', 'A secure plan. Section #12 shows how.');
  ok(!(await CV.has(page, '[data-bl-flags]')), '"secure" and "#12" are fine (whole words, D3)');
  const long10 = 'x'.repeat(1200);
  await page.fill('[data-bl-text]', long10);
  ok((await meta()) === '1 word Fits at 10 pt. Shorter reads better.' && !(await put()).off, '1,200 characters: 10 pt, Put on');
  await page.fill('[data-bl-text]', 'x'.repeat(1500));
  const p1 = await put();
  ok((await meta()) === '1 word Too long for the back cover. Cut it down.' && p1.off && p1.title === 'Too long for the back cover. Cut it down first.', 'too long: the note, Put off with the reason');
  ok(await page.$eval('.cv-bl-fit', (f) => f.classList.contains('is-long') && !!f.querySelector('svg') && getComputedStyle(f).color === 'rgb(138, 90, 0)'), 'too long is the warning color with its icon (D4)');
  await page.fill('[data-bl-text]', '');
  ok((await put()).off, 'an empty draft: Put off');
  ok(await CV.has(page, '[data-bl-text]'), 'the draft box stays while it is empty');

  // Verify: no source (D8): the server's unsourced numbers, while they are still in the draft.
  st.ai = { blurb: 'About 72% of adult learners quit, and 5,000 tried this plan.\n\nStart tonight.', unsourced: ['72', '5000'] };
  await page.click('[data-bl-write]');
  await page.waitForSelector('[data-bl-verify]', { timeout: 10000 });
  ok((await CV.txt(page, '[data-bl-verify]')) === 'Verify: no source. These numbers are not in your Positioning, title or subtitle: 72, 5000. Check them, or cut them.', `Verify: ${await CV.txt(page, '[data-bl-verify]')}`);
  await page.fill('[data-bl-text]', 'About half of adult learners quit, and 5,000 tried this plan.\n\nStart tonight.');
  ok((await CV.txt(page, '[data-bl-verify]')) === 'Verify: no source. This number is not in your Positioning, title or subtitle: 5000. Check it, or cut it.', 'a number cut from the draft leaves the list');
  await page.fill('[data-bl-text]', 'About half of adult learners quit.\n\nStart tonight.');
  ok(!(await CV.has(page, '[data-bl-verify]')), 'none left: no Verify box');

  /* The AI's errors: the words; the draft stays; nothing counted. */
  const cases = [['ai_unavailable', 'The AI did not answer this time. Nothing was counted in your usage. Try again in a moment.'],
    ['monthly_limit', /^You have used this month’s AI allowance\. It resets on /],
    ['rate_limited', 'Too many requests. Wait a minute, then try again.'],
    ['positioning_not_locked', 'Lock your Positioning in 03 first: the blurb uses its reader and promise. Nothing was counted in your usage.']];
  for (const [code, want] of cases) {
    globalThis.__modes.genFail = 1; globalThis.__modes.genCode = code;
    await page.click('[data-bl-write]');
    await page.waitForSelector('.cv-bl-err', { timeout: 10000 });
    const t = await CV.txt(page, '.cv-bl-err');
    ok((typeof want === 'string' ? t === want : want.test(t)) && await page.$eval('.cv-bl-err', (e) => e.getAttribute('role') === 'alert' && !!e.querySelector('svg')), `${code}: ${t}`);
  }
  ok((await text()) === 'About half of adult learners quit.\n\nStart tonight.', 'the draft is kept after errors');
  globalThis.__modes.genNet = 1;
  await page.click('[data-bl-write]');
  await page.waitForSelector('.cv-bl-err', { timeout: 10000 });
  ok((await CV.txt(page, '.cv-bl-err')) === 'We couldn’t reach NicheInk. Check your connection, then try again. This try was not counted.', 'no connection: the words');
  await page.click('[data-bl-write]');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().blurb.busy, null, { timeout: 10000 });
  ok(!(await CV.has(page, '.cv-bl-err')), 'a good try clears the error');

  /* A reply that comes after Close is let go. */
  st.ai = null;
  globalThis.__modes.genSlow = 1200;
  await page.click('[data-bl-write]');
  await page.click('[data-bl-close]');
  await page.waitForTimeout(1800);
  globalThis.__modes.genSlow = 0;
  ok(!(await CV.has(page, '[data-blurbdlg]')) && (await CV.layer(page, 'blurb')).text === PH, 'closed while writing: the reply is let go, the cover unchanged');
  ok((await E(() => document.activeElement.dataset.k)) === 'bd-blurb', 'focus back on Write blurb');

  /* Put on the back cover: the version first ('ai' as written), then the one blurb layer, one Undo step. */
  await page.click('[data-open-blurb]');
  ok(!(await CV.has(page, '[data-bl-text]')), 'the placeholder is not a draft');
  await page.click('[data-bl-write]');
  await page.waitForSelector('[data-bl-text]');
  const reply = await text();
  globalThis.__modes.blurbFail = 1;
  await page.click('[data-bl-put]');
  await page.waitForFunction(() => /couldn’t save the blurb/.test((document.querySelector('[data-blurbdlg] .cv-bl-err') || {}).textContent || ''), null, { timeout: 10000 });
  ok((await CV.txt(page, '[data-blurbdlg] .cv-bl-err')) === 'We couldn’t save the blurb. Check your connection, then try again. Your cover did not change.' && (await CV.layer(page, 'blurb')).text === PH, 'save failed: the dialog stays, the cover unchanged');
  await page.click('[data-bl-put]');
  await page.waitForSelector('[data-blurbdlg]', { state: 'detached', timeout: 10000 });
  const v = st.blurbs[st.blurbs.length - 1];
  ok(v.body === reply && v.source === 'ai', 'saved as a version, source ai (put on as written)');
  const bl = await CV.layer(page, 'blurb');
  ok(bl.text === v.body && (await CV.state(page)).layers.filter((l) => l.src === 'blurb').length === 1, 'the one blurb layer has the words');
  ok((await CV.state(page)).sel === bl.id, 'the blurb is selected');
  await page.click('[data-k="undo"]');
  ok((await CV.layer(page, 'blurb')).text === PH, 'Undo: the placeholder (one step)');
  await page.click('[data-k="redo"]');
  // Edit: the draft is the cover's blurb; an edit is saved as manual; the label says Update.
  await page.click('[data-open-blurb]');
  ok((await text()) === v.body && (await put()).label === 'Update the back cover', 'Edit blurb: the cover\'s words, "Update the back cover"');
  await page.fill('[data-bl-text]', 'My own words for the back.');
  await page.click('[data-bl-put]');
  await page.waitForSelector('[data-blurbdlg]', { state: 'detached', timeout: 10000 });
  ok(st.blurbs[st.blurbs.length - 1].source === 'manual' && (await CV.layer(page, 'blurb')).text === 'My own words for the back.', 'an edited draft is saved as manual');
  await CV.settled(page, 'saved');
  ok(JSON.stringify(CV.lastSave().body.layers.find((l) => l.src === 'blurb').text) === JSON.stringify('My own words for the back.'), 'the design saves the words');

  /* No blurb layer: a new one goes on the back cover (the layouts' place, remapped). */
  st.design = designOf(null); st.blurbs = [];
  await CV.open(page);
  await openDlg();
  await page.click('[data-bl-write]');
  await page.waitForSelector('[data-bl-text]');
  await page.click('[data-bl-put]');
  await page.waitForSelector('[data-blurbdlg]', { state: 'detached', timeout: 10000 });
  const nb = await CV.layer(page, 'blurb');
  ok(nb && nb.x === 60 && nb.y === 120 && nb.w === 310 && nb.size === 11 && nb.font === 'IBM Plex Sans', `a new blurb layer on the back (x ${nb && nb.x}, y ${nb && nb.y}, ${nb && nb.size} pt)`);
  // The newest saved version opens next time when the cover has no blurb layer.
  await page.click('[data-k="undo"]');
  await page.click('[data-open-blurb]');
  ok((await text()) === st.blurbs[0].body, 'no blurb on the cover: the dialog opens with the newest saved version');
  await page.keyboard.press('Escape');
  // A layout carries the newest saved version too, not the placeholder.
  await page.click('[data-tool="layouts"]');
  await page.click('[data-lay="center"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'center', null, { timeout: 10000 });
  ok((await CV.layer(page, 'blurb')).text === st.blurbs[0].body, 'a layout puts the newest saved blurb on the back');

  /* No bio: the tick is off with the reason and a link; the request never asks for the author line. */
  st.book.bio = null;
  st.design = designOf(withPlaceholder());
  await CV.open(page);
  await openDlg();
  ok(await page.$eval('[data-bl-author]', (c) => !c.checked && c.disabled && c.getAttribute('aria-describedby') === 'cv-bl-nobio'), 'no bio: the tick is off and disabled');
  ok((await CV.txt(page, '.cv-bl-nobio')) === 'Add a bio in Pen Names first. The author line uses only what your bio says. Open Pen Names', 'the reason');
  ok(await page.$eval('.cv-bl-nobio a', (a) => a.getAttribute('href') === `pen-name.html?id=${'aaaaaaaa-0000-4000-8000-00000000000a'}` && a.target === '_blank'), 'Open Pen Names goes to this pen name (a new tab, the draft stays)');
  await page.click('[data-bl-write]');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().blurb.busy, null, { timeout: 10000 });
  ok(st.gen[st.gen.length - 1].authorLine === false && (await text()) === FIX.blurbWarm, 'the request has authorLine false');
  st.book.bio = FIX.bio;

  /* Step D. */
  // (no bio here: the "Open Pen Names" link and the author label are measured too)
  const small = await page.$$eval('[data-blurbdlg] button, [data-blurbdlg] a, [data-blurbdlg] label', (a) => a.filter((b) => { const r = b.getBoundingClientRect(); const af = getComputedStyle(b, '::after'); return Math.max(r.width, parseFloat(af.width) || 0) < 44 || Math.max(r.height, parseFloat(af.height) || 0) < 44; }).map((b) => b.dataset.k || b.className));
  ok(small.length === 0, `every button, link and label has a 44 px click area${small.length ? ': ' + small.join(', ') : ''}`);
  const fs = await page.$$eval('[data-blurbdlg] *', (a) => a.filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < 12).length);
  ok(fs === 0, 'no text under 12 px');
  await page.focus('[data-bl-tone="direct"]'); await page.keyboard.press('Tab');
  ok((await E(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineOffset; })) === 'solid 2px 2px', 'the focus ring');
  await page.setViewportSize({ width: 1024, height: 700 });
  ok(await CV.noScroll(page) && await page.$eval('.cv-bl', (d) => d.getBoundingClientRect().bottom <= innerHeight && d.getBoundingClientRect().right <= innerWidth), '1024 × 700: the dialog fits (its body scrolls)');
  await page.click('[data-bl-close]');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
