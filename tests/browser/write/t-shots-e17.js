// E17 STOP 3 (never in a sweep; not a check): 06 Write with the compact head and the panel toggle,
// next to designs 78 (panel hidden) and 78b (panel open, the toggle states), at 1440 and 900, real fonts.
// Mock data (the chair yoga book, section 4.1 given a long text so the 680 px column shows).
// Built images and the side-by-side sheets go to docs/reviews/e17-stop3/.
// Run: tests/browser/run.sh write t-shots-e17.js
globalThis.__withFonts = true;
globalThis.__panelFresh = true;
const test = async page => {
  const log = globalThis.__log = [];
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const OUT = SHOTS.replace(/tests\/browser\/shots\/write$/, 'docs/reviews/e17-stop3');
  const REL = 'docs/reviews/e17-stop3';
  const base = 'http://127.0.0.1:5500';
  const s41 = st.outline[W1][4].sections[0].id;
  // As design 78: every section of the chapter has text, the section is Final, several paragraphs and a heading.
  st.addVersion(st.s43, 'Lift one arm to the side, then lower it slowly. Breathe out as it comes down.', 'manual');
  st.addVersion(s41, [
    'Most neck pain at our age does not come from one big strain. It comes from many small hours spent looking down: at a phone, a book, a sink full of dishes.',
    'You do not need a gym to undo those hours. You need a sturdy chair, a few quiet minutes, and moves that ask your neck to turn the way it was built to turn.',
    '## Start with the smallest turn',
    'Sit tall with both feet flat. Turn your head slowly to the right, only as far as feels easy. Pause for one breath. Come back to the middle, then turn to the left.',
    'Keep your shoulders still and low. If you feel them rise, the turn is too big. Make it smaller, and let the breath do the work.',
    'Do five turns each way. Most people feel the first one is stiff and the fifth one is smooth. That change is the point of this section.'
  ].join('\n\n'), 'manual');
  st.sectionOf(s41).s.status = 'final';
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const open = async (section) => {
    await page.goto(`${base}/app/book.html?id=${W1}&step=6&section=${section}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('[data-panel-toggle]', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
  };
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); return name; };
  const setPanel = (on) => page.evaluate((v) => localStorage.setItem('nicheink.write.panel', v ? 'open' : 'closed'), on);
  /** A crop around the toggle (its count sticks out 7 px), on the page's own background. */
  const togCrop = async (name) => {
    const r = await page.evaluate(() => { const b = document.querySelector('[data-panel-toggle]').getBoundingClientRect(); return { x: b.left - 24, y: b.top - 16, width: b.width + 48, height: b.height + 32 }; });
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: r, timeout: 30000 });
    return name;
  };

  const built = {};
  for (const w of [1440, 900]) {
    await size(w, 900);
    await open(s41);
    await setPanel(false);
    await open(s41);
    built[`closed${w}`] = await shot(`built-78-closed-${w}`);
    await page.click('[data-panel-toggle]');
    await page.mouse.move(5, 890);
    await page.waitForTimeout(300);
    built[`open${w}`] = await shot(`built-78b-open-${w}`);
  }

  /* The toggle states of 78b: hidden no count, hidden with a count (4.2 has 1 check), open, keyboard focus. */
  await size(1440, 900);
  await setPanel(false);
  await open(s41);
  await page.mouse.move(5, 890);
  const states = [await togCrop('built-tog-hidden')];
  await open(st.s42);
  await page.mouse.move(5, 890);
  states.push(await togCrop('built-tog-count'));
  await open(s41);
  await page.click('[data-panel-toggle]');
  await page.mouse.move(5, 890);
  await page.waitForTimeout(200);
  states.push(await togCrop('built-tog-open'));
  await page.click('[data-panel-toggle]');
  await page.focus('[data-gen-chapter]');
  await page.keyboard.press('Tab');
  states.push(await togCrop('built-tog-focus'));
  await setPanel(false);

  /** One sheet: the built images on the left, the design PNG on the right, each at its own width. */
  async function compare(name, rows, design, title, width) {
    await size(width * 2 + 120, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => `${base}/${REL}/${b}.png?${Date.now()}`;
    const rowsHtml = rows.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:20px}.row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{max-width:none}</style>
      <figure style="width:${width}px"><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure style="width:${width}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  await compare('sheet-78-1440', [[built.closed1440]], '78-step06-compact-1440', '06 Write, panel hidden, 1440', 1440);
  await compare('sheet-78-900', [[built.closed900]], '78-step06-compact-900', '06 Write, panel hidden, 900', 900);
  await compare('sheet-78b-1440', [[built.open1440], states], '78b-step06-panel-open-1440', '06 Write, panel open + toggle states (hidden, count, open, focus), 1440', 1440);
  await compare('sheet-78b-900', [[built.open900], states], '78b-step06-panel-open-900', '06 Write, panel open + toggle states, 900', 900);
  return log.join('\n');
};
