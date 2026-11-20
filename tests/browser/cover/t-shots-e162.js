// E16.2 STOP 3 compare shots (plan v2 Part 3): the busy line (owner Q-1, a planned difference to design 63) next to
// design 63, and My layouts with 5 entries of one book (owner Q-2, the time on the date line, a planned difference to
// design 67) next to design 67. Also: the busy line in the preview and in the panel, design 63's message after the
// automatic retry fails, and the export dialog's line (Q-10).
// Files go to docs/reviews/e16-2/. Never in a sweep: it writes tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-2');
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return S && !S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more)); }, null, { timeout: 10000 });
  const imgs = () => page.waitForFunction(() => [...document.querySelectorAll('[data-stockdlg] img, [data-panel] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const ready = async () => {
    await page.evaluate(() => document.fonts.ready); await imgs();
    await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E && (E.panel !== 'layouts' || E.lay.fonts); }, null, { timeout: 20000 });
    await page.waitForTimeout(700);
  };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = []; };
  // Stop the countdown on its number, so the shot shows "20 s" (the stock v2 default with no header).
  const freeze = () => page.evaluate(() => { const S = window.kdpBookSteps[9]._debug().stock; if (S.wait) clearInterval(S.wait.t); });

  /** As F63 (Band + warm blurb, Images on Pixabay, the picker on Pixabay with No background), then a busy pick. */
  async function build63busy() {
    fresh();
    await CV.open(page, { design: 'band' });
    await STK.ready(page);
    await page.click('[data-tool="images"]');
    await page.click('[data-srctab="pixabay"]');
    await page.click('[data-stock-nobg]');
    await page.fill('[data-stock-q]', 'study desk'); await page.press('[data-stock-q]', 'Enter'); await settle();
    await page.click('[data-stock-open]'); await settle();
    globalThis.__modes.pickBusy = 1; globalThis.__modes.pickAfter = 20;
    await page.click('[data-stockdlg] [data-stock-add="1000"]');
    await page.waitForSelector('[data-stockdlg] [data-stock-wait]', { timeout: 10000 });
    await freeze(); await blur();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await build63busy();
  ok((await CV.txt(page, '[data-stockdlg] [data-stock-wait] [aria-hidden="true"]:not(svg)')) === 'Pixabay is busy. Trying again in 20 s.', '63 busy: the line in the grid\'s error slot');
  await shot(`${SHOTS}/b63busy-1440.png`);
  await page.screenshot({ path: `${OUT}/63-busy-grid-1440.png`, timeout: 30000 });
  // The preview's slot.
  await page.click('[data-stockdlg] [data-stock-look="1001"]'); await page.waitForSelector('[data-sd-prev] [data-stock-wait]'); await blur();
  await shot(`${OUT}/63-busy-preview-1440.png`);
  // The panel's slot (the picker closed cancels; a new busy pick from the panel).
  await page.click('[data-sd-close]');
  globalThis.__modes.pickBusy = 1; globalThis.__modes.pickAfter = 20;
  await page.click('[data-panel] [data-stock-add="1002"]');
  await page.waitForSelector('[data-panel] [data-stock-wait]', { timeout: 10000 });
  await freeze(); await blur();
  await shot(`${OUT}/63-busy-panel-1440.png`);
  // The automatic retry fails too: design 63's message.
  await page.evaluate(() => { const S = window.kdpBookSteps[9]._debug().stock; S.wait = null; });
  fresh();
  await CV.open(page, { design: 'band' });
  await STK.ready(page);
  await page.click('[data-tool="images"]'); await page.click('[data-srctab="pixabay"]'); await page.click('[data-stock-nobg]');
  await page.fill('[data-stock-q]', 'study desk'); await page.press('[data-stock-q]', 'Enter'); await settle();
  await page.click('[data-stock-open]'); await settle();
  globalThis.__modes.pickBusy = 2; globalThis.__modes.pickAfter = 1;
  await page.click('[data-stockdlg] [data-stock-add="1000"]');
  await page.waitForFunction(() => /not answering/.test((document.querySelector('[data-stockdlg] .cv-sd-err') || {}).textContent || ''), null, { timeout: 8000 });
  await blur();
  await shot(`${OUT}/63-retry-failed-1440.png`);

  /** As F67 (Band + warm blurb, the Layouts panel), with 5 entries of the design's book, Nov 18 at 5 times. */
  const my = await FIX.my(page);
  const at = (h, m) => page.evaluate(([h, m]) => new Date(2026, 10, 18, h, m).toISOString(), [h, m]);
  const five = [];
  for (const [i, [h, m]] of [[14, 2], [11, 30], [10, 9], [9, 41], [9, 5]].entries()) {
    five.push(Object.assign(JSON.parse(JSON.stringify(my)), { id: `c${i}c${i}c${i}c${i}-0000-4000-8000-00000000000${i}`, exported_at: await at(h, m) }));
  }
  fresh(); st.my = five;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  await page.click('[data-tool="layouts"]'); await blur();
  const dates = await CV.all(page, '[data-panel] .cv-my-date');
  ok(dates.length === 5 && dates[2] === 'Exported Nov 18, 10:09', `67: 5 entries, ${dates.join(' | ')}`);
  await shot(`${SHOTS}/b67five-1440.png`);
  // The whole list (the panel scrolled to My layouts' end).
  await page.$eval('[data-panel]', (p) => { const l = p.querySelector('.cv-mys'); p.scrollTop = l.offsetTop + l.offsetHeight - p.clientHeight + 60; });
  await shot(`${OUT}/67-five-scrolled-1440.png`);

  // The export dialog's line (Q-10).
  st.my = [];
  await CV.open(page, { design: 'band' });
  await page.click('[data-export]');
  await page.waitForSelector('.cv-ex-my', { timeout: 15000 }); await blur();
  await shot(`${OUT}/export-line-q10-1440.png`);
  await page.keyboard.press('Escape');

  // Side by side: built (1440 × 900) | design (2880 × 1800, shown at 1440).
  await page.context().unrouteAll();
  const base = 'http://127.0.0.1:5500';
  for (const [n, b, file, what] of [['63', 'b63busy', '63-09-cover-images-pixabay', 'the busy line in the error slot (Q-1)'], ['67', 'b67five', '67-09-cover-layouts', 'My layouts, 5 entries of one book, date and time (Q-2)']]) {
    await page.setViewportSize({ width: 2960, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>
      <figure><figcaption>BUILT · ${n} · ${what}</figcaption><img src="${base}/tests/browser/shots/cover/${b}-1440.png"></figure>
      <figure><figcaption>DESIGN · ${file}</figcaption><img src="${base}/design/screens/${file}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${n}-compare-1440.png`, fullPage: true, timeout: 30000 });
  }
  log.push('PASS 63-compare-1440.png, 67-compare-1440.png and 6 more shots (8 files)');
  return log.join('\n');
};
