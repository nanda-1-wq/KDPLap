// E16 STOP 8 compare shots (plan §10: P8 = 67, 68), plus the Part 8 surfaces no final shows (their design approval,
// as at STOP 5 to 7): the ready layouts' small covers, Stack with the full title (plan D15) on the cover, a picture
// layout's sample photo (C16), Book data with spine text (120 pages), the blurb dialog's states (no draft, writing,
// Verify and the words KDP may not accept, too long, the AI failed, no bio).
// 67 = design applyFinal F67: Band + warm blurb, the Layouts panel, My layouts with the design's sample (Band, navy,
// from Deep Focus for Night Students (example), Oct 30). 68 = F68: Band with the blurb placeholder, the Book data
// panel, the blurb dialog with the warm blurb and the author line (Medium, Warm, the tick on, Write again).
// Files go to docs/reviews/e16-stop8/. Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop8');
  const ready = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && (E.panel !== 'layouts' || E.lay.fonts) && [...document.querySelectorAll('[data-panel] img')].every((i) => i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
  };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const my = await FIX.my(page);
  const band = await FIX.band(page);
  const placeholderBand = () => { const b = JSON.parse(JSON.stringify(band)); b.layers.forEach((l) => { if (l.src === 'blurb') l.text = 'Your back blurb goes here. Use Book data, Write blurb, to draft it from your book.'; }); return b; };
  const designOf = (b, fmt) => ({ book_id: FIX.BOOK, layers: b.layers, bg: b.bg, fmt: fmt || { ...FIX.fmt }, layout: 'band', last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

  /** F67: Band + warm blurb; the Layouts panel; My layouts with the sample. */
  async function build67() {
    globalThis.__modes = {}; st.my = [my];
    await CV.open(page, { design: 'band' });
    await page.click('[data-tool="layouts"]');
    await blur();
  }
  /** F68: Band, the blurb placeholder; Book data; the dialog with the warm blurb and the author line. */
  async function build68() {
    globalThis.__modes = {}; st.my = []; st.ai = null;
    st.design = designOf(placeholderBand());
    await CV.open(page);
    await page.click('[data-tool="book"]');
    await page.click('[data-open-blurb]');
    await page.click('[data-bl-write]');
    await page.waitForSelector('[data-bl-text]', { timeout: 10000 });
    await blur();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await build67();
  ok(await CV.has(page, `[data-my="${my.id}"] img`) && (await page.$eval('[data-lay="band"]', (b) => b.getAttribute('aria-pressed'))) === 'true', '67: My layouts row, Band pressed');
  await shot(`${SHOTS}/b67-1440.png`);
  await page.setViewportSize({ width: 1024, height: 900 });
  await build67();
  await shot(`${OUT}/67-1024.png`);
  ok(await CV.noScroll(page), '67 at 1024: no sideways scroll');

  await page.setViewportSize({ width: 1440, height: 900 });
  await build68();
  ok((await page.$eval('[data-bl-text]', (t) => t.value)) === FIX.blurbWarm + '\n\n' + FIX.bio, '68: the warm blurb and the author line in the draft');
  ok(/^92 words/.test(await CV.txt(page, '.cv-bl-count')), `68: ${await CV.txt(page, '.cv-bl-count')}`);
  await shot(`${SHOTS}/b68-1440.png`);
  await page.setViewportSize({ width: 1024, height: 900 });
  await build68();
  await shot(`${OUT}/68-1024.png`);
  ok(await CV.noScroll(page), '68 at 1024: no sideways scroll');

  /* The Part 8 surfaces at 1440. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await build67();
  await page.$eval('[data-panel]', (p) => { p.scrollTop = p.scrollHeight; });
  await shot(`${OUT}/layouts-ready-1440.png`);
  // Stack on the cover: the full title (D15), the note.
  await page.click('[data-lay="stack"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'stack', null, { timeout: 10000 });
  await blur();
  await shot(`${OUT}/stack-d15-1440.png`);
  // Picture full: the sample photo is a Must fix (C16, STOP 6 N2 rec).
  await page.click('[data-toast-x]');
  await page.click('[data-lay="picfull"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'picfull', null, { timeout: 10000 });
  await page.click('[data-toast-x]'); await blur();
  await shot(`${OUT}/picfull-sample-c16-1440.png`);
  // Series colors: Forest on Band.
  await page.click('[data-lay="band"]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layout === 'band', null, { timeout: 10000 });
  await page.click('[data-toast-x]');
  await page.click('[data-pal="1"]'); await blur();
  await shot(`${OUT}/series-forest-1440.png`);

  // Book data at 120 pages: spine text can be added; then it is on.
  st.pdf.page_count = 120;
  st.design = designOf(band, { trim: '6x9', pages: 120, paper: 'white' });
  await CV.open(page);
  await page.click('[data-tool="book"]'); await blur();
  await shot(`${OUT}/bookdata-spine-1440.png`);
  await page.click('[data-add-spine]');
  await page.waitForFunction(() => window.kdpBookSteps[9]._debug().cover.layers.some((l) => l.src === 'spine'), null, { timeout: 10000 });
  await blur();
  await shot(`${OUT}/bookdata-spine-on-1440.png`);
  st.pdf.page_count = FIX.fmt.pages;

  // The blurb dialog: no draft yet; writing; Verify and the words KDP may not accept; too long; the AI failed; no bio.
  st.design = designOf(placeholderBand());
  await CV.open(page);
  await page.click('[data-tool="book"]');
  await page.click('[data-open-blurb]'); await blur();
  await shot(`${OUT}/blurb-empty-1440.png`);
  globalThis.__modes.genSlow = 4000;
  await page.click('[data-bl-write]');
  await page.waitForSelector('.cv-bl-wait', { timeout: 5000 });
  await blur();
  await page.screenshot({ path: `${OUT}/blurb-writing-1440.png`, timeout: 30000 });
  await page.waitForSelector('[data-bl-text]', { timeout: 15000 });
  globalThis.__modes.genSlow = 0;
  st.ai = { blurb: 'You signed up for the course. About 72% of adult learners quit in the first month.\n\nThis book is the cure for missed study nights. It is not a bestseller trick, and it is not sold only on Amazon: it is a plan.', unsourced: ['72'] };
  await page.click('[data-bl-write]');
  await page.waitForSelector('[data-bl-verify]', { timeout: 10000 });
  await blur();
  await shot(`${OUT}/blurb-verify-flags-1440.png`);
  await page.fill('[data-bl-text]', (FIX.blurbWarm + '\n\n').repeat(3).trim());
  await blur();
  await shot(`${OUT}/blurb-too-long-1440.png`);
  globalThis.__modes.genFail = 1;
  await page.click('[data-bl-write]');
  await page.waitForSelector('.cv-bl-err', { timeout: 10000 });
  await blur();
  await shot(`${OUT}/blurb-ai-failed-1440.png`);
  await page.click('[data-bl-close]');
  const bio = st.book.bio; st.book.bio = null;
  await CV.open(page);
  await page.click('[data-tool="book"]');
  await page.click('[data-open-blurb]'); await blur();
  await shot(`${OUT}/blurb-no-bio-1440.png`);
  st.book.bio = bio;
  await page.click('[data-bl-close]');
  await CV.quiet(page);

  // The design's own HTML in this Chrome (as at STOP 5 to 7).
  await page.context().unrouteAll();
  for (const [n, file] of [['67', '67-09-cover-layouts'], ['68', '68-09-cover-book-data-blurb']]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/design/screens/${file}.html?final=F${n}&clean=1`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${n}-design-html-in-chrome.png`, timeout: 30000 });
  }

  // Side by side: built (1440 × 900) | design (2880 × 1800, shown at 1440).
  const base = 'http://127.0.0.1:5500';
  for (const [n, file, what] of [['67', '67-09-cover-layouts', 'Layouts: My layouts, series colors, ready layouts'], ['68', '68-09-cover-book-data-blurb', 'Book data and the back blurb dialog']]) {
    await page.setViewportSize({ width: 2960, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${n} · ${what}</figcaption><img src="${base}/tests/browser/shots/cover/b${n}-1440.png"></figure>
      <figure><figcaption>DESIGN · ${file}</figcaption><img src="${base}/design/screens/${file}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${n}-compare-1440.png`, fullPage: true, timeout: 30000 });
  }
  log.push('PASS 67-compare-1440.png, 68-compare-1440.png and 16 more shots (18 files)');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
