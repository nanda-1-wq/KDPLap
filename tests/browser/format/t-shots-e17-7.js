// E17 STOP 7 (never in a sweep; not a check): the 08 BOOK PARTS rows and the Ready box next to design 83, with
// the real fonts, at 1440 and 900. The state is the design's: Dedication on and empty, About the author a Draft,
// Review request on, Also by with 1 book, Contents, Introduction and Conclusion on. Extra built states (no design):
// the Kindle Ready box and a switch that failed to save. Mock data. Compare sheets go to docs/reviews/e17-stop7/;
// the crops they are made of go to tests/browser/shots/format/ (ignored).
globalThis.__withFonts = true;
const test = async page => {
  const { log } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e17-stop7');
  const REL = 'docs/reviews/e17-stop7';
  const part = (k) => st.parts.find((p) => p.kind === k);
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const fonts = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const crop = async (name, sel) => { await fonts(); await page.locator(sel).first().screenshot({ path: `${SHOTS}/${name}.png`, timeout: 30000 }); return name; };

  /** One sheet: the built images (rows) on the left, the design PNG on the right. */
  async function compare(name, rows, design, title, width, designWidth = width) {
    const base = 'http://127.0.0.1:5500';
    await size(width + designWidth + 120, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => `${base}/tests/browser/shots/format/${b}.png`;
    const rowsHtml = rows.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:20px;padding:20px;background:#F3F3F1;border:1px solid #B8B8B3}
      .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{border:none}</style>
      <figure style="width:${width}px"><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure style="width:${designWidth}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  // The design's state.
  Object.assign(part('dedication'), { enabled: true, status: 'draft', version: null });
  Object.assign(part('about_author'), { enabled: true, status: 'draft', version: { id: '9e000000-0000-4000-8000-000000000003', content: 'Nora teaches adults to study.', word_count: 5 } });
  Object.assign(part('review_request'), { enabled: true });
  Object.assign(part('also_by'), { enabled: true });
  st.alsoBy = [{ book_id: st.candidates[0].id, title: 'Worry Less Workbook', valid: true }];

  async function states(w) {
    const out = {};
    await size(w, 1200);
    await FM.open(page);
    await page.waitForSelector('[data-fmt-bp-row="dedication"]', { timeout: 10000 });
    await page.waitForSelector('[data-fmt-ready] [data-fmt-parts-ready]', { timeout: 30000 });
    out.rows = await crop(`e17-7-rows-${w}`, 'fieldset.fmt-parts');
    out.ready = await crop(`e17-7-ready-${w}`, '[data-fmt-ready]');
    await page.click('[data-fmt-mode="kindle"]');
    await page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.kb.state === 'ready'; }, null, { timeout: 20000 });
    await page.waitForSelector('[data-fmt-ready] [data-fmt-parts-ready]', { timeout: 10000 });
    out.kindle = await crop(`e17-7-kindle-ready-${w}`, '[data-fmt-ready]');
    await page.click('[data-fmt-mode="print"]');
    globalThis.__modes.partSaveFail = 1;
    await page.click('[data-fmt-bp-row="acknowledgments"] .fmt-bp-name');
    await page.waitForSelector('#fmtBpErr-acknowledgments', { timeout: 5000 });
    await page.mouse.move(0, 0);
    out.failed = await crop(`e17-7-failed-${w}`, 'fieldset.fmt-parts');
    globalThis.__modes.partSaveFail = 0;
    return out;
  }

  const a = await states(1440);
  const b = await states(900);
  await compare('83-1440-compare', [[a.rows, a.ready], [a.kindle], [a.failed]], '83-step08-parts-rows-1440', '08 BOOK PARTS and Ready box, 1440 (row 2: Kindle Ready box; row 3: save failed)', 1440);
  await compare('83-900-compare', [[b.rows], [b.ready], [b.kindle], [b.failed]], '83-step08-parts-rows-900', '08 BOOK PARTS and Ready box, 900 (then: Kindle Ready box; save failed)', 900);
  return log.join('\n');
};
