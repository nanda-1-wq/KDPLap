// D2 (owner, Nov 9; plan F13) images: 41 at 1440 next to the design and at 900 px with the 360 px column and
// the spread filling the box; the full screen view at 1440 and 900; the trim drawings with their labels under them.
// Files go to docs/reviews/e13-2-d2/. Mock data, the real engine from the cache. Not a check: never in a sweep.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2-d2');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); };
  const shot = async (name, dir = SHOTS, full = true) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full, timeout: 20000 }); };
  const crop = async (name, sel) => { await ready(); await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 20000 }); };
  const pages = () => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.build.state === 'ready' && document.querySelector('.fmt-page canvas'); }, null, { timeout: 30000 });
  const spread89 = async () => {
    for (let i = 0; i < 4; i++) await page.click('[data-fmt-next]');
    await page.waitForFunction(() => /^Pages 8 and 9/.test(document.querySelector('[data-fmt-label]').textContent), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('.fmt-page canvas').length === 2, null, { timeout: 10000 });
  };
  const todo = [];
  const later = (...a) => todo.push(a);
  async function compare(name, built, design, title) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    const imgs = [].concat(built).map((b) => `<img src="${base}/tests/browser/shots/format/${b}.png">`).join('');
    const right = design ? `<figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>` : '';
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:1440px;border:1px solid #B8B8B3}
      .row{display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap;padding:32px;background:#F3F3F1;border:1px solid #B8B8B3}.row img{border:none}</style>
      <figure><figcaption>BUILT · ${title}</figcaption>${[].concat(built).length > 1 ? `<div class="row">${imgs}</div>` : imgs}</figure>${right}`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20000 });
    log.push(`PASS ${name}.png`);
  }

  /* 41 with the design's book (as STOP 3): Classic, About on, a header title, 07 current, pages 8 and 9. */
  st.qcRun = { checked_at: '2026-11-07T10:00:00Z', current: true };
  await size(1440, 1100);
  await FM.open(page);
  st.format.parts.about = true;
  st.format.header_title = 'Micro Study Habits';
  await FM.open(page);
  await pages();
  await spread89();
  await shot('d2-41', SHOTS, false);
  later('41-format-compare', 'd2-41', '41-step08-format', 'D2: settings column 360 px, the spread fills the box, Full screen');
  await size(900, 900);
  await page.waitForTimeout(600);
  await shot('41-format-900', OUT);

  /* Full screen at 1440 × 900 and 900 × 900. */
  await size(1440, 900);
  await page.waitForTimeout(400);
  await page.click('[data-fmt-full]');
  await page.waitForSelector('dialog.fmt-full[open]');
  await page.waitForFunction(() => document.querySelectorAll('dialog.fmt-full .fmt-page canvas').length === 2, null, { timeout: 10000 });
  await shot('41-fullscreen-1440', OUT, false);
  await size(900, 900);
  await page.waitForTimeout(700);
  await shot('41-fullscreen-900', OUT, false);
  await page.keyboard.press('Escape');

  /* The trim drawings: every group A trim and an old 7 × 10 and 8.5 × 11. */
  await size(1440, 1100);
  const names = [];
  for (const t of ['6x9', '5.5x8.5', '5.25x8', '5x8', '7x10', '8.5x11']) {
    st.brief.trim_size = t;
    await FM.open(page);
    await crop(`d2-trim-${t}`, '.fmt-page-row');
    names.push(`d2-trim-${t}`);
  }
  st.brief.trim_size = '6x9';
  later('trim-labels', names, null, 'trim drawings: the label under the page shape, never inside (6×9, 5.5×8.5, 5.25×8, 5×8, 7×10, 8.5×11)');

  for (const a of todo) await compare(...a);
  ok(true, `images in ${OUT.replace(/^.*KDPLap\//, '')}`);
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
