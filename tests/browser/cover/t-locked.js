// E16 Part 4: design 73 (Locked: no current Print PDF), Loading, and a load error with Retry.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  /* No Print PDF: the lock card, no design row made. */
  st.pdf = null;
  await CV.open(page, { design: null });
  ok((await CV.state(page)).status === 'locked', 'no Print PDF: Locked');
  ok((await CV.txt(page, '.cv-locked-card h2')) === 'Finish 08 Format first', 'h2: Finish 08 Format first');
  ok((await CV.txt(page, '.cv-locked-p')) === 'The cover size comes from your interior: trim, page count and paper. This book has no current Print PDF yet, so the spine width is unknown.', 'the words of design 73');
  ok((await CV.txt(page, '.cv-locked-s')) === 'Your cover design is safe. When the Print PDF is ready, the cover opens again and fits the new size.', 'the small line of design 73');
  ok(!st.writes.some((w) => w.table === 'cover_designs'), 'Locked writes no design row');
  ok(!(await page.$('.cv-tools')) && !(await page.$('[data-ws]')), 'no tools and no canvas while Locked');
  ok((await CV.txt(page, '[data-next-note]')) === 'Not done yet: export the cover files.', 'header: Not done yet: export the cover files.');
  ok(await page.$eval('[data-next]', (b) => b.disabled), 'Next off');
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), 'the rail stays');
  const btn = await page.$eval('[data-open-08]', (a) => { const b = a.getBoundingClientRect(); return { h: Math.round(b.height), t: a.textContent.trim() }; });
  ok(btn.t === 'Open 08 Format' && btn.h >= 44, `Open 08 Format, ${btn.h} px high`);
  await page.click('[data-open-08]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  ok(/step=8/.test(page.url()), 'Open 08 Format opens 08');

  /* A Print PDF that is not current (trim changed in 01): Locked too. The saved design stays. */
  st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: false };
  await CV.open(page, { design: 'band' });
  ok((await CV.state(page)).status === 'locked', 'an old Print PDF: Locked');
  ok(st.design.layers.length === 5 && st.saves === 0, 'the design is kept, nothing saved');

  /* Loading (design state): the words while cover_json is slow. */
  st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
  globalThis.__modes.coverSlow = 1500;
  await CV.open(page, { ready: false });
  await page.waitForSelector('.cv-loading', { timeout: 5000 });
  ok((await CV.txt(page, '.cv-loading-t')) === 'Loading your cover…', 'Loading your cover…');
  ok((await CV.txt(page, '.cv-loading-s')) === 'Getting your book size from 08 Format, your fonts and pictures.', 'the loading line');
  ok(await page.$eval('.cv-loading', (e) => e.getAttribute('role') === 'status'), 'loading is a status');
  await CV.ready(page);
  globalThis.__modes.coverSlow = 0;
  ok((await CV.state(page)).status === 'ready', 'then the editor');

  /* A failed read: an error with Retry; Retry works. */
  globalThis.__modes.coverFail = 1;
  await CV.open(page);
  ok((await CV.state(page)).status === 'error', 'cover_json fails: the error state');
  ok(await page.$eval('.cv-root [role="alert"]', (e) => /couldn’t load the cover/.test(e.innerText)), 'We couldn’t load the cover');
  await page.click('[data-cv-retry]');
  await CV.ready(page);
  ok((await CV.state(page)).status === 'ready', 'Retry: the editor');

  /* Fonts that cannot load: an error with Retry, never a fallback face. */
  st.design = null;
  await CV.open(page, { design: 'band', ready: false });
  globalThis.__modes.fontsDown = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && E.status === 'error'; }, null, { timeout: 40000 });
  ok(/fonts of your cover/.test(await CV.txt(page, '.cv-root [role="alert"]')), 'fonts down: "We couldn’t load the fonts of your cover"');
  globalThis.__modes.fontsDown = false;
  await page.click('[data-cv-retry]');
  await CV.ready(page);
  ok((await CV.state(page)).status === 'ready', 'Retry after the fonts came back');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
