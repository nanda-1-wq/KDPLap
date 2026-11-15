// E16 Part 4: 09 in the shell (designs 58, 51b): header, Next, the rail and the sidebar, the first open,
// the parts drawn inert ("Comes in Part N"), the status bar, no sideways scroll.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });

  /* First open: the design row is made with today's size, empty, white; the template popover opens. */
  await CV.open(page, { design: null });
  const ins = st.writes.filter((w) => w.table === 'cover_designs' && w.insert);
  ok(ins.length === 1, `first open: one cover_designs insert (${ins.length})`);
  ok(ins[0] && JSON.stringify(ins[0].insert.fmt) === JSON.stringify(FIX.fmt) && ins[0].insert.layers.length === 0 && ins[0].insert.bg === '#FFFFFF', 'the insert: today\'s fmt, no layers, white');
  ok(st.design && st.design.rev === 1, 'the row starts at rev 1');
  ok(await page.$eval('[data-tplpop]', (p) => !p.hidden), 'a new cover opens with the KDP template popover (design 58)');
  ok(!(await page.$('[data-textbar]:not([hidden])')), 'no text bar without a selection');
  const s0 = await CV.state(page);
  ok(Math.abs(s0.z - 1) < 1e-9, `opens at 100 % (${s0.z})`);
  ok(st.history.length === 0, 'an open writes no snapshot');
  await CV.open(page);
  ok(st.writes.filter((w) => w.table === 'cover_designs' && w.insert).length === 1, 'a second open makes no second row');

  /* Header (design 58): PACKAGE · STEP 9 OF 11, Cover, Export cover (inert), the reason line, Next off. */
  ok((await CV.txt(page, '[data-step-label]')) === 'PACKAGE · STEP 9 OF 11', 'PACKAGE · STEP 9 OF 11');
  ok((await CV.txt(page, '[data-step-title]')) === 'Cover', 'the title: Cover');
  ok((await CV.txt(page, '[data-export]')) === 'Export cover', 'header: Export cover');
  ok(await page.$eval('[data-export]', (b) => b.getAttribute('aria-disabled') === 'true' && b.title === 'Comes in Part 10'), 'Export cover: inert, "Comes in Part 10"');
  await page.click('[data-export]', { force: true });
  await page.waitForTimeout(200);
  ok(!(await page.$('dialog[open]')), 'Export cover opens nothing yet');
  ok((await CV.txt(page, '[data-next-note]')) === 'Fix 3 problems before export.', `empty cover: "Fix 3 problems before export." (${await CV.txt(page, '[data-next-note]')})`);
  const nx = await page.$eval('[data-next]', (b) => ({ dis: b.disabled, title: b.title, tip: !!b.querySelector('.tip') }));
  ok(nx.dis && nx.title === '10 Metadata' && !nx.tip, `Next: off, "10 Metadata", no tip (${JSON.stringify(nx)})`);
  ok(/step=9/.test(page.url()), 'the URL keeps step=9');

  /* Rail (51b): 01 to 09 one by one, 09 a link and the current step; the sidebar: 09 Cover. */
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), '09 folds the sidebar to the rail');
  const rail = await page.$$eval('.book-nav [data-step]', (a) => a.map((x) => x.querySelector('.step-num').textContent));
  ok(rail.join() === '01,02,03,04,05,06,07,08,09', `rail 01 to 09: ${rail}`);
  ok(await page.$eval('[data-step="9"]', (a) => a.tagName === 'A' && a.getAttribute('aria-current') === 'step'), '09 is a link, the current step');
  ok(!(await page.$('[data-coming]')), 'no "Coming next" row any more');
  // STOP 4 (owner, F3; design 58): 10 open and 11 locked under 09, in the rail only, not links.
  const fut = await page.$$eval('[data-future]', (a) => a.map((x) => { const b = x.getBoundingClientRect(); return [x.dataset.future, x.tagName, x.getAttribute('aria-label'), !!x.querySelector('.step-mark svg'), Math.round(b.width), Math.round(b.height), getComputedStyle(x, null).display]; }));
  ok(fut.length === 2 && fut[0][2] === '10 Metadata, coming in v3' && fut[1][2] === '11 Publish, coming in v3', `rail: 10 Metadata, 11 Publish (${fut.map((f) => f[2])})`);
  ok(fut.every((f) => f[1] === 'DIV' && f[4] === 52 && f[5] === 52 && f[6] !== 'none'), 'not links, 52 × 52 like the other rail steps');
  ok(!fut[0][3] && fut[1][3], '10: the open circle; 11: the lock');
  ok(await page.$eval('[data-future="10"] .step-mark', (m) => getComputedStyle(m, '::before').borderTopStyle === 'solid'), '10 draws the hollow circle');
  const below = await page.evaluate(() => document.querySelector('[data-future="10"]').getBoundingClientRect().top > document.querySelector('[data-step="9"]').getBoundingClientRect().bottom);
  ok(below, '10 and 11 sit under 09');
  await page.click('[data-rail-toggle]');
  ok(await page.$$eval('[data-future]', (a) => a.every((x) => getComputedStyle(x).display === 'none')), 'the full sidebar hides 10 and 11 (RELEASE · Coming in v3)');
  ok((await CV.txt(page, '[data-step="9"]')).startsWith('09 Cover'), `sidebar: ${await CV.txt(page, '[data-step="9"]')}`);
  ok((await CV.all(page, '.group-row .version-tag')).join() === 'Coming in v3', 'RELEASE: Coming in v3');
  await page.click('[data-rail-toggle]');

  /* 08 → Next → 09 (08 is not the last step any more). */
  await CV.open(page, { step: 8, ready: false });
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  ok(await page.$eval('[data-next]', (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.querySelector('.tip')), '08: Next is on (no "Coming next" tip)');
  await page.click('[data-next]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Cover', null, { timeout: 10000 });
  await CV.ready(page);
  ok(/step=9/.test(page.url()), '08 Next opens 09');
  ok((await CV.state(page)).status === 'ready', '09 draws the editor');

  /* The tool rail: Text works; Layouts, Book data, Images, Shapes, Layers are drawn inert. */
  const tools = await page.$$eval('[data-tool]', (a) => a.map((b) => [b.dataset.tool, b.getAttribute('aria-pressed'), b.getAttribute('aria-disabled'), b.title, b.innerText.trim()]));
  ok(tools.map((t) => t[4]).join('|') === 'Layouts|Book data|Text|Images|Shapes|Layers', `tools: ${tools.map((t) => t[4])}`);
  const part = { layouts: 8, book: 8, images: 6, shapes: 5, layers: 5 };
  for (const t of tools) {
    if (t[0] === 'text') ok(t[1] === 'true' && !t[2], 'Text: on');
    else ok(t[2] === 'true' && t[3] === `Comes in Part ${part[t[0]]}`, `${t[4]}: inert, Comes in Part ${part[t[0]]}`);
  }
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Text'), 'the Text panel is open');
  await page.click('[data-tool="layouts"]', { force: true });
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Text' && /ADD A HEADING|Add a heading/.test(p.innerText)), 'an inert tool changes nothing');
  for (const [k, n] of [['blurb', 8], ['author', 8], ['chk', 9], ['pv', 9]]) {
    ok(await page.$eval(`[data-k="${k}"]`, (b, n) => b.getAttribute('aria-disabled') === 'true' && b.title === `Comes in Part ${n}`, n), `${k}: inert, Comes in Part ${n}`);
  }
  ok((await CV.txt(page, '[data-k="chk"]')) === '3 to fix', `the chip label is live: ${await CV.txt(page, '[data-k="chk"]')}`);
  await page.click('[data-k="chk"]', { force: true });
  ok(!(await page.$('[aria-label="Checks"]')), 'the chip opens no drawer yet (Part 9)');

  /* Status bar (design 58). */
  ok((await CV.txt(page, '.cv-specs')) === '6 × 9 in 54 pages white paper spine 0.122 in full 12.372 × 9.25 in', `status bar: ${await CV.txt(page, '.cv-specs')}`);
  ok((await CV.txt(page, '[data-savetext]')) === '✓ Saved', 'status bar: ✓ Saved');
  ok(await CV.noScroll(page), '1440: no sideways scroll');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  ok(await CV.noScroll(page), '1024: no sideways scroll');
  ok(await page.$eval('[data-next]', (b) => b.getBoundingClientRect().right <= window.innerWidth), '1024: Next is on screen');
  ok(await page.$eval('[data-ws]', (w) => w.clientWidth > 300 && w.clientHeight > 300), '1024: the workspace has room');
  await page.setViewportSize({ width: 1440, height: 900 });

  /* The Band cover: the reason line reads "Not done yet", the chip "Ready". */
  await CV.open(page, { design: 'band' });
  ok((await CV.txt(page, '[data-next-note]')) === 'Not done yet: export the cover files.', 'Band: "Not done yet: export the cover files."');
  ok((await CV.txt(page, '[data-k="chk"]')) === 'Ready' && await page.$eval('[data-k="chk"]', (b) => b.classList.contains('is-ok')), 'Band: the chip says Ready (success look)');
  ok((await CV.all(page, '.cv-bookrow .cv-on')).length === 3, 'Title, Subtitle, Pen name: ✓ On the cover');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
