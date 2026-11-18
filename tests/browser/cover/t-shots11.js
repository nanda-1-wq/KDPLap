// E16.1 STOP E2: the after shots (the code as built), beside the before shots made at STOP E1 (70344c7, by the
// first version of this file; they stay in docs/reviews/e16-1/before-*.png) and the designs 75 to 77b.
// The owner's case on 919ca117: Picture band on a pink paper. Mock data only.
//   75 (redrawn from the code, owner Nov 18: no words on the cover but the barcode label) and 75b (the template
//   popover with the line notes under Hide); after: template, Pixabay panel (the topic searched) and large view,
//   snap held on the front center, on the live-area corner, a photo stretched to the bleed edge, the Layers row
//   after Replace on a typed name, no strip on 01 and 08.
// Files go to docs/reviews/e16-1/ and design/screens/ (75, 75b). Never in a sweep.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-1');
  const DES = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'design/screens');
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return !S || (!S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more))); }, null, { timeout: 10000 });
  const imgs = () => page.waitForFunction(() => [...document.querySelectorAll('[data-stockdlg] img, [data-panel] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const shot = async (path) => { await page.evaluate(() => document.fonts.ready); await imgs(); await page.waitForTimeout(600); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = []; };
  const dbg = (fn, a) => page.evaluate(([f, x]) => new Function('E', 'a', f)(window.kdpBookSteps[9]._debug(), x), [fn, a]);   // test-only: fixed test code

  async function pinkPicband() {
    fresh();
    st.book.status = 'in_progress';
    await CV.open(page, { design: 'band' });
    await STK.ready(page);
    await dbg('return E.applyLayout("picband").then(() => { E.cover = Object.assign({}, E.cover, { bg: "#F4C6D0" }); E.sel = null; E.multi = []; E.view_.sync(); });');
    await page.waitForTimeout(300);
    const x = await page.$('[data-toast-x]'); if (x) await x.click().catch(() => {});
    await blur();
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  /* 75 and 75b: the template, lines only; the notes in the popover. */
  await pinkPicband();
  ok((await CV.txt(page, '[data-tpl]')) === 'Barcode area 2.0 × 1.2 in', '75: no words on the cover but the barcode label');
  await shot(`${DES}/75-09-cover-template-top.png`);
  await shot(`${OUT}/after-template-1440.png`);
  await page.click('[data-k="tpl"]'); await page.waitForSelector('[data-tplpop]:not([hidden])'); await blur();
  await shot(`${DES}/75b-09-cover-template-notes.png`);
  await page.keyboard.press('Escape');

  /* 76, 76b: Pixabay opens with the topic searched. */
  await pinkPicband();
  globalThis.__modes.stockMany = 50;
  await page.click('[data-tool="images"]'); await page.click('[data-srctab="pixabay"]'); await page.waitForTimeout(200); await settle(); await blur();
  ok(st.stock.calls.length === 1 && st.stock.calls[0].q === 'Study habits for adults', `76: 1 call on open, the topic (${st.stock.calls.length})`);
  await shot(`${OUT}/after-pixabay-panel-1440.png`);
  await page.click('[data-stock-open]'); await settle(); await blur();
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(400); await settle();
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; });
  await shot(`${OUT}/after-pixabay-large-1440.png`);
  await page.keyboard.press('Escape');
  globalThis.__modes = {};

  /* 77, 77b: snap held, the lit guides. */
  await pinkPicband();
  const G = await page.evaluate(() => kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt));
  const z = (await CV.state(page)).z;
  const [x, y] = await CV.center(page, 'title');
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 4 * z, y + 30 * z, { steps: 6 });
  ok(await page.$eval('[data-snapline]', (l) => !l.hidden), '77: the lit guide on the front center');
  await shot(`${OUT}/after-snap-center-1440.png`);
  await page.mouse.up();
  const P = await dbg('return E.cover.layers.find((l) => l.type === "image").id;');
  await dbg('E.setLayer(a.id, { x: a.x, y: a.y }); E.select(a.id);', { id: P, x: G.liveFront.x0 + 5 / z, y: G.liveFront.y0 + 5 / z });
  await page.waitForTimeout(200);
  const c = await page.$eval(`[data-hit="${P}"]`, (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(c[0], c[1]); await page.mouse.down(); await page.mouse.move(c[0] - 2, c[1] - 2, { steps: 4 });
  ok(await page.evaluate(() => !document.querySelector('[data-snapline]').hidden && !document.querySelector('[data-snapline-h]').hidden), '77b: both guides lit on the live-area corner');
  await shot(`${OUT}/after-snap-live-1440.png`);
  await page.mouse.up();
  // A photo stretched to the bleed edge (the owner's addition): the bottom right corner to the right bleed edge.
  await dbg('const l = E.cover.layers.find((x) => x.id === a.id); E.setLayer(a.id, { x: a.W - l.w - 20 / a.z, y: a.y }); E.select(a.id);', { id: P, W: G.W, z, y: G.b + 40 });
  await page.waitForTimeout(200);
  const hd = await page.$eval('[data-handle="scale"][data-c="se"]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] + 18, hd[1], { steps: 6 });
  const l = await dbg('return E.cover.layers.find((x) => x.id === a);', P);
  ok(Math.abs(l.x + l.w - G.W) < 1e-6, 'stretched: the right edge on the bleed edge');
  await shot(`${OUT}/after-snap-bleed-1440.png`);
  await page.mouse.up();
  await CV.quiet(page);

  /* Item 4: the Layers row after Replace on a layer named "man" (typed). */
  await pinkPicband();
  await page.click('[data-tool="images"]');
  if (!(await page.$eval('[data-rights]', (e) => e.checked))) await page.click('[data-rights]');
  await PIC.make(page, 'desk', { w: 900, h: 600, name: 'desk.jpg' });
  await dbg('E.commitLayers(E.cover.layers.map((x) => (x.id === a ? Object.assign({}, x, { label: "man" }) : x))); E.select(a);', P);
  await page.waitForTimeout(600);
  await page.click('[data-k="replace"]');
  await PIC.pick(page, 'desk'); await PIC.idle(page);
  await page.click('[data-tool="layers"]'); await blur();
  ok((await CV.txt(page, `[data-row="${P}"]`)).startsWith('desk.jpg'), 'item 4: the Layers row reads the new picture');
  await shot(`${OUT}/after-replace-name-1440.png`);
  await CV.quiet(page);

  /* Item 5: no strip on 01 and 08 of a completed book. */
  st.book.status = 'completed';
  for (const n of [1, 8]) {
    await CV.open(page, { design: 'band', step: n });
    await page.waitForTimeout(700);
    ok(!(await page.evaluate(() => document.body.innerText.includes('This book is marked completed'))), `item 5: no strip on ${String(n).padStart(2, '0')}`);
    await page.screenshot({ path: `${OUT}/after-strip-${String(n).padStart(2, '0')}-1440.png` });
  }
  st.book.status = 'in_progress';
  return log.join('\n');
};
