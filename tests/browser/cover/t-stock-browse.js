// E16.1 item 2 (designs 76, 76b, owner Nov 18): Pixabay shows pictures when its tab opens and loads more on scroll.
// The seed words: the Brief's topic, else the Topic Lab topic, else the book title, else none (the empty state).
// One search on open, once per visit (a cleared box does not search again). The panel shows every result in its own
// scroll box and keeps its scroll over a redraw; the end of the panel and of the large view loads the next page:
// one page at a time, at least 3 s apart, to the total; an error stops it (More results retries); offline: no call.
// Unsplash is unchanged (N10): no call on open, no end to watch, 6 in the panel.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const calls = () => st.stock.calls;
  const last = () => st.stock.calls[st.stock.calls.length - 1];
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return !S || (!S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more))); }, null, { timeout: 10000 });
  const tiles = (sel = '[data-stock-tiles] [data-stock-add]') => page.$$eval(sel, (a) => a.length);
  const endPanel = () => page.$eval('[data-stock-scroll]', (b) => { b.scrollTop = b.scrollHeight; return b.scrollTop; });
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = []; };
  async function openPix() {
    await page.click('[data-tool="images"]');
    await page.waitForSelector('[data-srctab="pixabay"]');
    await page.click('[data-srctab="pixabay"]');
    await page.waitForTimeout(150); await settle();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const title0 = st.book.title;

  /* ── The seed words ── */
  const CASES = [
    ['the Brief topic', { topicText: 'Study habits for adults', topicName: 'Night study', title: title0 }, 'Study habits for adults'],
    ['no Brief topic: the Topic Lab topic', { topicText: '', topicName: 'Night  study ', title: title0 }, 'Night study'],
    ['no topic: the book title', { topicText: '', topicName: null, title: title0 }, title0],
    ['no topic, no title: nothing', { topicText: '', topicName: null, title: '' }, null]
  ];
  for (const [name, b, want] of CASES) {
    fresh();
    Object.assign(st.book, b);
    await CV.open(page, { design: 'band' });
    await STK.ready(page);
    await openPix();
    if (want) {
      ok(calls().length === 1 && last().q === want && last().page === 1 && last().source === 'pixabay', `${name}: 1 call on open, "${last() && last().q}"`);
      ok((await page.$eval('[data-stock-q]', (i) => i.value)) === want && (await tiles()) > 0, `${name}: the words in the box, the pictures shown`);
    } else {
      ok(calls().length === 0 && await CV.has(page, '[data-stock-idle]'), `${name}: no call, the empty state`);
    }
  }
  Object.assign(st.book, { topicText: undefined, topicName: null, title: title0 });

  /* ── Once per visit; the topic line ── */
  fresh();
  await CV.open(page, { design: 'band' });
  await STK.ready(page);
  await openPix();
  ok((await CV.txt(page, '[data-stock-topic]')) === 'Pictures for your topic. Change the words to look for something else.', 'the topic line under the box');
  await page.fill('[data-stock-q]', ''); await page.click('[data-k="stk-go"]');
  await page.click('[data-srctab="up"]'); await page.click('[data-srctab="pixabay"]'); await page.waitForTimeout(200);
  ok(calls().length === 1, `a cleared box, another tab and back: no new search (${calls().length} call)`);
  await page.fill('[data-stock-q]', 'leaf'); await page.press('[data-stock-q]', 'Enter'); await settle();
  ok(!(await CV.has(page, '[data-stock-topic]')), 'other words: no topic line');

  /* ── The panel: every result in its box; the end loads the next page, 3 s apart, to the total ── */
  fresh();
  globalThis.__modes.stockMany = 50;
  await CV.open(page, { design: 'band' });
  await STK.ready(page);
  await openPix();
  ok(calls().length === 1 && (await tiles()) === 24, `open: 1 call, 24 pictures in the panel (${await tiles()})`);
  const box = await page.$eval('[data-stock-scroll]', (b) => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), sh: b.scrollHeight, ov: getComputedStyle(b).overflowY }; });
  ok(box.ov === 'auto' && box.sh > box.h && box.h <= 430, `the results scroll in their own box (${box.h} px of ${box.sh})`);
  ok(await CV.has(page, '[data-stock-scroll] [data-stock-end]') && (await CV.txt(page, '[data-stock-scroll] [data-stock-end]')) === 'More results', 'the end of the box: watched, with More results for the keyboard');
  globalThis.__modes.stockSlow = 600;
  const t1 = Date.now();
  await endPanel();
  await page.waitForSelector('[data-stock-loadmore]', { timeout: 3000 });
  ok((await CV.txt(page, '[data-stock-loadmore]')) === 'Loading more…' && calls().length === 2 && last().page === 2, 'scrolled to the end: "Loading more…", 1 call for page 2');
  await page.waitForTimeout(200); await endPanel();
  ok(calls().length === 2, 'no second call while one is loading');
  await settle();
  const keptTop = await page.$eval('[data-stock-scroll]', (b) => b.scrollTop);
  ok((await tiles()) === 48 && keptTop > 0, `page 2 in: 48 pictures, the box kept its scroll (${keptTop} px)`);
  globalThis.__modes.stockSlow = 0;
  await endPanel();
  await page.waitForTimeout(800);
  ok(calls().length === 2, 'the end again within 3 s: no call yet');
  const t3 = await (async () => { const s = Date.now(); while (calls().length < 3 && Date.now() - s < 6000) await page.waitForTimeout(100); return Date.now(); })();
  await settle();
  ok(calls().length === 3 && last().page === 3 && t3 - t1 >= 3000, `page 3 after the 3 s gap (${t3 - t1} ms after page 2)`);
  ok((await tiles()) === 50 && !(await CV.has(page, '[data-stock-scroll] [data-stock-end]')), 'all 50: no end left, no more calls');
  await endPanel(); await page.waitForTimeout(3500);
  ok(calls().length === 3, 'at the total: nothing more is asked');

  /* ── The large view: the same answer (no call); new words load their page 2 at the end ── */
  await page.click('[data-stock-open]'); await settle();
  ok(calls().length === 3 && (await tiles('[data-sd-grid] [data-stock-add]')) === 50, 'the large view: the 50 already loaded, no call');
  await page.fill('[data-sd-q]', 'study desk'); await page.press('[data-sd-q]', 'Enter'); await settle();
  ok(calls().length === 4 && last().q === 'study desk' && last().page === 1, 'new words: 1 call');
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; });
  const s5 = Date.now();
  while (calls().length < 5 && Date.now() - s5 < 6000) await page.waitForTimeout(100);
  await settle();
  ok(calls().length === 5 && last().page === 2 && (await tiles('[data-sd-grid] [data-stock-add]')) === 48, 'the end of the large view: page 2 (48)');
  ok(!(await CV.has(page, '[data-stockdlg] [data-stock-loadmore]')), 'loaded: no "Loading more…" left');

  /* ── An error stops it; More results retries ── */
  globalThis.__modes.stockFail = 1; globalThis.__modes.stockCode = 'rate_limited';
  await page.waitForTimeout(3100);
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(500); await settle();
  ok(calls().length === 6 && (await CV.txt(page, '[data-stockdlg] [data-stock-end] .cv-uperr')) === 'That was a lot of searches in one minute. Wait a moment, then try again.', 'a failed page: the reason and More results');
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = 0; b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(3500);
  ok(calls().length === 6, 'after an error it does not ask again by itself');
  await page.click('[data-sd-more]'); await settle();
  ok(calls().length === 7 && last().page === 3 && (await tiles('[data-sd-grid] [data-stock-add]')) === 50, 'More results retries: page 3, all 50');
  await page.keyboard.press('Escape');

  /* ── Offline: no call ── */
  fresh();
  globalThis.__modes.stockMany = 50;
  await CV.open(page, { design: 'band' });
  await STK.ready(page);
  await openPix();
  await page.evaluate(() => { window.kdpBookSteps[9]._debug().offline = true; });
  await endPanel(); await page.waitForTimeout(3500);
  ok(calls().length === 1, `offline: the end asks nothing (${calls().length} call)`);
  await page.evaluate(() => { window.kdpBookSteps[9]._debug().offline = false; });

  /* ── Unsplash: unchanged ── */
  await page.click('[data-srctab="unsplash"]'); await page.waitForTimeout(300);
  ok(calls().length === 1 && (await CV.txt(page, '[data-stock-press]')) === 'Press Go to look', 'Unsplash: no call on open (N10)');
  await page.click('[data-k="stk-go"]'); await settle();
  ok(calls().length === 2 && (await tiles()) === 6 && !(await CV.has(page, '[data-stock-end]')), 'Unsplash: 1 call on Go, 6 in the panel, no end to watch');
  await page.click('[data-stock-open]'); await settle();
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; }); await page.waitForTimeout(3500);
  ok(calls().length === 2 && !(await CV.has(page, '[data-stockdlg] [data-stock-end]')), 'Unsplash large view: scrolling asks nothing');
  await page.keyboard.press('Escape');

  globalThis.__modes = {};
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
