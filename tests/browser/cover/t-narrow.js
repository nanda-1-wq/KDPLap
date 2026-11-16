// E16 Part 9: window widths (designs 74 and 74b, plan §3 Width). One breakpoint source (kdpCover.narrow): 1200 px and
// up the panel beside the cover; 900 to 1199 px the panel opens over the cover when a tool is pressed (pressed again,
// a press on the cover or Escape closes it; a panel opened by the editor itself opens over the cover too), the bars
// wrap, the header's reason line and the footer's sizes hide; under 900 px the full notice over the whole window
// (the window's width, Back to Books, saved words that are true), the editor kept underneath. The STOP 5 note: at
// 1024 × 900 every Text effects slider shows without a scroll.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const narrow = () => page.evaluate(() => { const r = document.querySelector('[data-cover]'); const E = window.kdpBookSteps[9]._debug(); return { cls: r.classList.contains('cv-narrow'), open: r.classList.contains('cv-panel-open'), width: E.width, panelOpen: E.panelOpen, shown: getComputedStyle(document.querySelector('[data-panel]')).display !== 'none' }; });

  /* 1024 × 900 (design 74). */
  await page.setViewportSize({ width: 1024, height: 900 });
  await CV.open(page, { design: 'band' });
  let n = await narrow();
  ok(n.cls && n.width === 'narrow' && !n.shown, `1024: narrow, the panel closed (${JSON.stringify(n)})`);
  ok(await page.$eval('[data-next-note]', (e) => getComputedStyle(e).display === 'none' && e.textContent.length > 0), 'the reason line hides (still in the page for Next\'s description)');
  ok(await page.$eval('.cv-specs', (e) => getComputedStyle(e).display === 'none') && (await CV.txt(page, '[data-savetext]')) === '✓ Saved', 'the footer: sizes hide, ✓ Saved stays');
  ok(await CV.noScroll(page), 'no sideways scroll');
  const ws0 = await page.$eval('[data-ws]', (w) => Math.round(w.getBoundingClientRect().width));
  const right = await page.$eval('[data-tools]', (t) => Math.round(innerWidth - t.getBoundingClientRect().right));
  ok(ws0 === right, `the cover gets the width right of the tools (${ws0} px of ${right})`);
  // A tool opens the panel over the cover.
  await page.click('[data-tool="images"]');
  n = await narrow();
  ok(n.open && n.shown && n.panelOpen, 'Images: the panel opens');
  const pb = await page.$eval('[data-panel]', (p) => { const r = p.getBoundingClientRect(), t = document.querySelector('[data-tools]').getBoundingClientRect(), c = getComputedStyle(p); return { left: Math.round(r.left - t.right), top: Math.round(r.top - t.top), pos: c.position, z: c.zIndex, sh: c.boxShadow !== 'none', h: Math.round(r.height - t.height) }; });
  ok(pb.pos === 'absolute' && pb.left === 0 && pb.top === 0 && pb.h === 0 && Number(pb.z) >= 25 && pb.sh, `over the cover, beside the tools, full height, with a shadow (${JSON.stringify(pb)})`);
  ok((await page.$eval('[data-ws]', (w) => Math.round(w.getBoundingClientRect().width))) === ws0, 'the cover does not move (the panel is over it)');
  ok(await page.$eval('[data-tool="images"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'Images is pressed');
  // Another tool: the other panel, still open. The same tool again: closed.
  await page.click('[data-tool="layers"]');
  n = await narrow();
  ok(n.open && (await page.$eval('[data-panel]', (p) => p.dataset.kind)) === 'layers', 'Layers: the panel changes, stays open');
  await page.click('[data-tool="layers"]');
  ok(!(await narrow()).open, 'Layers again: closed');
  // A press on the cover closes it.
  await page.click('[data-tool="text"]');
  const wr = await page.$eval('[data-ws]', (w) => { const r = w.getBoundingClientRect(); return [r.right - 30, r.top + 30]; });
  await page.mouse.click(wr[0], wr[1]);
  ok(!(await narrow()).open, 'a press on the cover closes it');
  // Escape closes it; the focus goes to its tool.
  await page.click('[data-tool="shapes"]');
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => [document.activeElement && (document.activeElement.dataset.tool || document.activeElement.dataset.k || document.activeElement.tagName)]);
  ok(!(await narrow()).open && esc[0] === 'shapes', `Escape closes it; focus on Shapes (${JSON.stringify(await narrow())} ${esc})`);
  // A panel the editor opens (Replace a picture, Rename a layer) opens over the cover.
  await page.evaluate(() => window.kdpBookSteps[9]._debug().showPanel('layers'));
  ok((await narrow()).open, 'a panel opened by the editor (showPanel) opens over the cover');
  await page.keyboard.press('Escape');
  // Add a heading from the open Text panel: the panel stays until the cover is pressed (design).
  await page.click('[data-tool="text"]');
  const n0 = (await CV.state(page)).layers.length;
  await page.click('[data-k="add-h"], .cv-preset-h');
  await page.waitForFunction((n) => window.kdpBookSteps[9]._debug().cover.layers.length === n + 1, n0, { timeout: 10000 });
  ok((await CV.state(page)).layers.length === n0 + 1, 'the Text panel works over the cover (Add a heading)');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  /* STOP 5 note: Text effects at 1024 × 900, every style, every slider in view without a scroll. */
  await CV.open(page, { design: 'band' });
  const t = await CV.layer(page, 'title');
  await page.click(`[data-hit="${t.id}"]`);
  await page.click('[data-k="fx"]');
  const tiles = await page.$$eval('.cv-fx-tile', (a) => a.length);
  const miss = [];
  for (let i = 0; i < tiles; i++) {
    await page.click(`.cv-fx-tile >> nth=${i}`);
    await page.waitForTimeout(80);
    const r = await page.$eval('.cv-pop-fx', (p) => { const b = p.getBoundingClientRect().bottom; const box = p.querySelector('.cv-fx-box'); return box ? [...box.querySelectorAll('input[type=range]')].map((x) => Math.round(b - x.getBoundingClientRect().bottom)) : []; });
    if (r.some((d) => d < 2)) miss.push(i + ':' + r.join('/'));
  }
  ok(tiles === 9 && miss.length === 0, `1024 × 900: all ${tiles} styles show every slider without a scroll (${miss.join(' ') || 'Softness included'})`);
  const r1440 = await page.evaluate(() => getComputedStyle(document.querySelector('.cv-pop-fx')).rowGap);
  ok(r1440 === '8px', `narrow: the popover's gap is 8 px (${r1440})`);
  await page.keyboard.press('Escape');

  /* The exact edges: 1200 is wide, 1199 narrow, 900 narrow, 899 the notice. */
  for (const [w, want] of [[1200, 'wide'], [1199, 'narrow'], [900, 'narrow'], [899, 'tiny']]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => window.kdpBookSteps[9]._debug().width);
    ok(m === want, `${w} px: ${m}`);
  }

  /* Resizing keeps the editor: narrow with the panel open → 1440 (beside), → 800 (notice), → 1024 (back). */
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.click('[data-tool="layers"]');
  await page.click(`[data-hit="${t.id}"]`).catch(() => {});
  await page.evaluate((id) => window.kdpBookSteps[9]._debug().select(id), t.id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  n = await narrow();
  ok(!n.cls && n.shown && !n.panelOpen, '1440: the panel beside the cover again');
  ok(await page.$eval('[data-next-note]', (e) => getComputedStyle(e).display !== 'none'), '1440: the reason line shows');

  /* Under 900 px (design 74b). */
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForSelector('[data-tiny]', { timeout: 5000 });
  ok((await CV.txt(page, '.cv-tiny-h')) === 'This window is too narrow for the cover editor', 'the notice: its title');
  ok((await CV.txt(page, '.cv-tiny-p')) === 'The editor needs at least 900 px. This window is 800 px. Make the window wider, or open NicheInk on a computer.', 'the notice: the width in words');
  ok((await CV.txt(page, '[data-tiny-save]')) === 'Your cover is saved. Nothing is lost.', 'Your cover is saved (it is)');
  ok(await page.$eval('[data-k="tiny-books"]', (a) => a.getAttribute('href') === 'dashboard.html' && a.textContent === 'Back to Books' && a.getBoundingClientRect().height >= 44), 'Back to Books: a link to Books, 44 px');
  ok(await page.$eval('[data-tiny]', (d) => { const r = d.getBoundingClientRect(); return d.getAttribute('role') === 'alert' && r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight; }), 'over the whole window (the book head too), role alert');
  ok(await page.$eval('.book-layout', (l) => l.inert === true), 'the page under it is inert (no Tab into it)');
  ok(await page.$eval('[data-tiny] svg', (s) => s.getAttribute('aria-hidden') === 'true'), 'the icon is decoration');
  ok(await CV.noScroll(page), 'no sideways scroll');
  const nl = (await CV.state(page)).layers.length;
  await page.keyboard.press('Delete');
  ok((await CV.state(page)).layers.length === nl, 'the cover\'s keys rest under the notice');
  await page.setViewportSize({ width: 640, height: 900 });
  await page.waitForTimeout(120);
  ok((await CV.txt(page, '.cv-tiny-p')).includes('This window is 640 px.'), 'the width follows the window (640 px)');
  // Saved words are true: a save that failed, offline.
  globalThis.__modes = { saveFail: 1 };
  await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.id === id); E.setLayer(id, { x: l.x + 2 }); }, t.id);
  await CV.settled(page, 'failed');
  ok((await CV.txt(page, '[data-tiny-save]')) === 'Your last change was not saved. Make the window wider, then press Retry.', `save failed: ${await CV.txt(page, '[data-tiny-save]')}`);
  globalThis.__modes = {};
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(150);
  ok(!(await CV.has(page, '[data-tiny]')) && await page.$eval('.book-layout', (l) => l.inert === false), '1024: the notice goes, the page is live again');
  ok((await CV.state(page)).sel === t.id, 'the editor kept its state (the title still selected)');
  await page.click('[data-alert] [data-retry-save]');
  await CV.settled(page, 'saved');
  await page.context().setOffline(true);
  await page.evaluate((id) => { const E = window.kdpBookSteps[9]._debug(); const l = E.cover.layers.find((x) => x.id === id); E.setLayer(id, { x: l.x + 2 }); }, t.id);
  await page.waitForTimeout(900);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForSelector('[data-tiny]');
  ok((await CV.txt(page, '[data-tiny-save]')) === 'You are offline. Your cover is kept on this device and saves when you are back online.', 'offline: kept on this device');
  await page.context().setOffline(false);
  await CV.settled(page, 'saved');
  ok((await CV.txt(page, '[data-tiny-save]')) === 'Your cover is saved. Nothing is lost.', 'back online: saved');
  // Leaving 09 (a narrow window on another step): no notice.
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.click('[data-step="8"]');
  await page.waitForFunction(() => document.querySelector('[data-step-title]').textContent === 'Format', null, { timeout: 10000 });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(150);
  ok(!(await CV.has(page, '[data-tiny]')) && await page.$eval('.book-layout', (l) => !l.inert), 'on 08: no cover notice');
  // Opening 09 in a narrow window: the notice at once.
  await CV.open(page, { design: 'band' });
  ok(await CV.has(page, '[data-tiny]'), 'opening 09 at 800 px: the notice');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
  ok(!(await CV.has(page, '[data-tiny]')), '1440: gone');
  /* Locked (no current Print PDF) at 1024 and 800: the reason line hides at 1024, Next on screen, no sideways scroll; the
     lock card fits any width, so no notice. */
  st.pdf = null;
  for (const w of [1024, 800]) {
    await page.setViewportSize({ width: w, height: 900 });
    await CV.open(page, { design: 'band' });
    const L = await page.evaluate(() => ({ status: window.kdpBookSteps[9]._debug().status, narrow: document.querySelector('[data-cover]').classList.contains('cv-narrow'), note: getComputedStyle(document.querySelector('[data-next-note]')).display, next: (() => { const r = document.querySelector('[data-next]').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; })(), tiny: !!document.querySelector('[data-tiny]') }));
    ok(L.status === 'locked' && L.narrow && L.note === 'none' && L.next && !L.tiny && await CV.noScroll(page), `Locked at ${w}: ${JSON.stringify(L)}, no sideways scroll`);
    if (w === 1024) await page.screenshot({ path: SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop9') + '/73-locked-1024.png' });
  }
  st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true };
  // Loading at 1024: the reason line hides from the first frame.
  globalThis.__modes = { coverSlow: 1500 };
  await page.setViewportSize({ width: 1024, height: 900 });
  await CV.open(page, { ready: false });
  ok(await page.evaluate(() => { const r = document.querySelector('[data-cover]'); return !!r && r.classList.contains('cv-narrow') && window.kdpBookSteps[9]._debug().status === 'loading'; }), 'Loading at 1024: narrow too');
  await CV.ready(page);
  globalThis.__modes = {};
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
