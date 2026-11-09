// Standing rule (plan §6, E14 §8.5), Part 3: 41 (the whole screen with the preview and the Ready box),
// 41b (Kindle), 41c (engine and section states), each at 1440 next to the design, plus 900 px.
// Files go to docs/reviews/e13-2-stop3/. Mock data, the real engine from the checked cache.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2-stop3');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const shot = async (name, dir = SHOTS, full = true) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full, timeout: 20000 }); };
  const crop = async (name, sel) => { await ready(); await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 20000 }); };
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });

  const todo = [];   // compare() leaves the app page: the pictures are made at the end
  const later = (...a) => todo.push(a);
  async function compare(name, built, design, title) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    const list = [].concat(built);
    const imgs = list.map((b) => `<img src="${base}/tests/browser/shots/format/${b}.png">`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:1440px;border:1px solid #B8B8B3}
      .row{display:grid;grid-template-columns:repeat(${Math.min(list.length, 4)},minmax(0,1fr));gap:20px;align-items:start;padding:40px;background:#F3F3F1;border:1px solid #B8B8B3}.row img{max-width:100%;border:none}</style>
      <figure><figcaption>BUILT · ${title}</figcaption>${list.length > 1 ? `<div class="row">${imgs}</div>` : imgs}</figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20000 });
    log.push(`PASS ${name}.png`);
  }

  /* 41c first visit: first in the run, while the engine file is not in the browser cache yet. */
  await size(1440, 1100);
  globalThis.__modes.cdnSlowMs = 6000;
  await FM.open(page);
  await page.waitForFunction(() => { const b = document.querySelector('[data-fmt-state] [role="progressbar"]'); return b && Number(b.getAttribute('aria-valuenow')) > 0; }, null, { timeout: 5000 });
  await crop('c41c-1', '[data-fmt-state]');
  globalThis.__modes.cdnSlowMs = 0;

  /* 41: the design's book, on the spread of pages 8 and 9, 07 current. */
  st.qcRun = { checked_at: '2026-11-07T10:00:00Z', current: true };
  await size(1440, 1100);
  await FM.open(page);
  st.format.parts.about = true;
  st.format.header_title = 'Micro Study Habits';
  await FM.open(page);
  await pages();
  for (let i = 0; i < 4; i++) await page.click('[data-fmt-next]');
  await page.waitForFunction(() => document.querySelector('[data-fmt-label]').textContent.startsWith('Pages 8 and 9'), null, { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('.fmt-page canvas').length === 2, null, { timeout: 10000 });
  await shot('b41-full', SHOTS, false);
  later('41-format-compare', 'b41-full', '41-step08-format', '08 Format with the preview and the Ready box');
  await size(900, 900);
  await page.waitForTimeout(500);
  await shot('41-format-900', OUT);

  /* 41b: Kindle. */
  await size(1440, 1100);
  await page.waitForTimeout(400);
  await page.click('[data-fmt-mode="kindle"]');
  await crop('b41b', '.fmt-preview');
  later('41b-kindle-compare', 'b41b', '41b-step08-kindle-preview', 'Kindle (preview comes with the EPUB, owner Q1)');
  await size(900, 900);
  await shot('41b-kindle-900', OUT);
  await page.click('[data-fmt-mode="print"]');

  /* 41c: first visit, engine error, warnings, nothing Final. */
  await size(1440, 1100);
  globalThis.__modes.cdnDown = true;
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state].is-danger', { timeout: 15000 });
  await crop('c41c-2', '[data-fmt-state]');
  await size(900, 900);
  await shot('41c-engine-error-900', OUT);
  globalThis.__modes.cdnDown = false;
  await size(1440, 1100);
  st.chapters[1].sections[1].status = 'draft';
  st.chapters[2].sections[0].status = 'draft';
  st.chapters[2].sections[1].needs_review = true;
  st.chapters[3].sections[2].version.content += ' A small win 😀 today.';
  await FM.open(page);
  await pages();
  await crop('c41c-3', '.fmt-ready');
  await size(900, 900);
  await shot('41c-warnings-900', OUT);
  await size(1440, 1100);
  for (const s of st.sections()) s.status = 'draft';
  await FM.open(page);
  await page.waitForSelector('[data-fmt-state]:not([hidden])', { timeout: 5000 });
  await crop('c41c-4', '[data-fmt-state]');
  await size(900, 900);
  await shot('41c-nothing-900', OUT);
  later('41c-states-compare', ['c41c-1', 'c41c-2', 'c41c-3', 'c41c-4'], '41c-step08-engine-states', 'first visit, engine error, warnings, nothing Final');

  for (const a of todo) await compare(...a);
  ok(true, `images in ${OUT.replace(/^.*KDPLap\//, '')}`);
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
