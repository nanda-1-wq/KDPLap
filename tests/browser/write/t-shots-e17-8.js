// E17 STOP 8 (never in a sweep; not a check): the new 06 states of design 84 at 1440 and 900, next to
// 84-step07-parts-states-1440.png / -900.png: save failed (the foot), offline (the foot), loading a book part,
// and the Checks tab on a book part. Real fonts. Mock data: the chair yoga book, the Dedication part.
// Built crops and the sheets go to docs/reviews/e17-stop8/.
// Run: tests/browser/run.sh write t-shots-e17-8.js
globalThis.__withFonts = true;
globalThis.__panelFresh = true;
const test = async page => {
  const log = globalThis.__log = [];
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const OUT = SHOTS.replace(/tests\/browser\/shots\/write$/, 'docs/reviews/e17-stop8');
  const REL = 'docs/reviews/e17-stop8';
  const base = 'http://127.0.0.1:5500';
  globalThis.__modes.parts = 1;
  const part = (k) => st.partOf(W1, k);
  for (const k of ['dedication', 'about_author']) part(k).enabled = true;
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const until = async (fn, ms = 6000) => { try { await page.waitForFunction(fn, null, { timeout: ms }); return true; } catch (e) { return false; } };
  const saved = () => until(() => kdpBookSteps[6].saveState() === 'saved');
  const open = async (q) => {
    await page.goto(`${base}/app/book.html?id=${W1}&step=6${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor, .wr-fixed, .wr-ab', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(5, 890);
    await page.waitForTimeout(500);
  };
  const crop = async (sel, name) => { await page.locator(sel).first().screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); return name; };
  await page.evaluate(() => localStorage.setItem('nicheink.write.panel', 'closed')).catch(() => {});

  const built = { 1440: [], 900: [] };
  for (const w of [1440, 900]) {
    await size(w, 900);
    // Save failed: the foot.
    await open(`&part=${part('dedication').id}`);
    globalThis.__modes.partDraftError = 99;
    await page.click('[data-editor]');
    await page.keyboard.type('For my teachers, who made room for every question.');
    await until(() => !!document.querySelector('[data-foot-retry]'));
    await page.mouse.move(5, 890);
    await page.waitForTimeout(200);
    built[w].push(['Save failed (foot)', await crop('[data-foot]', `built-84-savefail-${w}`)]);
    // Offline: the foot.
    globalThis.__modes.partDraftError = 0;
    await page.click('[data-foot-retry]');
    await saved();
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
    globalThis.__modes.partDraftOffline = 1;
    await page.click('[data-editor]');
    await page.keyboard.press('End');
    await page.keyboard.type(' And my students.');
    await until(() => !!document.querySelector('[data-foot-retry]'));
    await page.mouse.move(5, 890);
    await page.waitForTimeout(200);
    built[w].push(['Offline (foot, no design)', await crop('[data-foot]', `built-84-offline-${w}`)]);
    await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
    await saved();
    // Checks tab on a part.
    await page.click('[data-panel-toggle]');
    await page.click('[data-tab="checks"]');
    await until(() => !!document.querySelector('[data-panel-kind="checks-part"]'));
    await page.mouse.move(5, 890);
    await page.waitForTimeout(200);
    built[w].push(['Checks tab on a book part', await crop('[data-panel-kind="checks-part"]', `built-84-checks-${w}`)]);
    await page.click('[data-panel-toggle]');
    // Loading a book part.
    globalThis.__modes.partTextSlow = 4000;
    await page.click(`[data-part="${part('about_author').id}"]`);
    await until(() => !!document.querySelector('[data-part-loading]'));
    await page.waitForTimeout(300);
    built[w].push(['Loading a book part', await crop('.wr-main, [data-main]', `built-84-loading-${w}`)]);
    globalThis.__modes.partTextSlow = 0;
    await until(() => !!document.querySelector('[data-editor]') && !document.querySelector('[data-part-loading]'), 8000);
    await saved();
  }

  /** One sheet: the built crops stacked on the left, the design PNG on the right. */
  async function sheet(name, list, design, width) {
    await size(width * 2 + 120, 900);
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0 0 28px}figcaption{padding:0 0 10px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .col{width:${width}px}</style>
      <div class="col">${list.map(([t, img]) => `<figure><figcaption>BUILT · ${t}</figcaption><img src="${base}/${REL}/${img}.png?${Date.now()}"></figure>`).join('')}</div>
      <div class="col"><figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure></div>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }
  await sheet('84-06-states-1440-compare', built[1440], '84-step07-parts-states-1440', 1440);
  await sheet('84-06-states-900-compare', built[900], '84-step07-parts-states-900', 900);
  return log.join('\n');
};
