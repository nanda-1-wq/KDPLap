// E16.1 item 4 (owner, Nov 18: "Replace keeps the old layer name ("man")"). A picture layer is replaced through
// every path: a new file upload, an Uploads tile, a PDF page, a Pixabay pick (named from its tags), an Unsplash
// pick. Each path runs twice: on a layer named by its picture, and on a layer with a name typed in Layers
// (label "man"). After each Replace the layer's name is the new picture's: the Layers row, the editor's
// layerName (the picture bar, More and the checks drawer all read kdpCover.names.layerName). One Undo brings the
// old picture and its old name back. Replace adds no layer.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = [];
  await CV.open(page, { design: 'band' });
  await STK.ready(page);
  await page.evaluate(() => window.kdpBookSteps[9]._debug().applyLayout('picband'));
  await page.waitForTimeout(200);
  await PIC.ready(page);   // Images, rights ticked
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return !S || (!S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more))); }, null, { timeout: 10000 });
  const setPdf = (key, text, name) => page.evaluate(([k, t, n]) => { window.__pic = window.__pic || {}; const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 255; window.__pic[k] = new File([b], n, { type: 'application/pdf' }); }, [key, text, name]);
  await PIC.make(page, 'man', { w: 800, h: 600, name: 'man.jpg' });
  await PIC.make(page, 'desk', { w: 900, h: 600, name: 'desk.jpg' });
  await PIC.make(page, 'lamp', { w: 600, h: 900, name: 'lamp.jpg' });
  await setPdf('wb', PIC.pdf(2), 'workbook.pdf');

  const pic = () => page.evaluate(() => window.kdpBookSteps[9]._debug().cover.layers.find((l) => l.type === 'image'));
  const names = (id) => page.evaluate((id) => {
    const E = window.kdpBookSteps[9]._debug(), l = E.cover.layers.find((x) => x.id === id);
    return { name: l.name, label: l.label || null, shown: E.layerName(l), names: kdpCover.names.layerName(l), n: E.cover.layers.length };
  }, id);
  /** The Layers row of the layer: its name as shown. */
  const row = async (id) => {
    await page.click('[data-tool="layers"]');
    const t = await page.$eval(`[data-row="${id}"]`, (r) => r.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    await page.click('[data-tool="images"]');
    return t;
  };
  const startReplace = async (id) => {
    await page.evaluate((id) => window.kdpBookSteps[9]._debug().select(id), id);
    await page.waitForSelector('[data-k="replace"]', { timeout: 5000 });
    await page.click('[data-k="replace"]');
    await page.waitForFunction(() => window.kdpBookSteps[9]._debug().replaceId != null, null, { timeout: 5000 });
  };

  /** The paths: each does a Replace on the selected layer and returns the new picture's name. */
  const PATHS = {
    async upload() { await page.click('[data-srctab="up"]').catch(() => {}); await PIC.pick(page, 'desk'); await PIC.idle(page); return 'desk.jpg'; },
    async tile() {
      await page.click('[data-srctab="up"]').catch(() => {});
      const r = st.assets.find((a) => a.name === 'lamp.jpg');
      await page.waitForSelector(`[data-add-asset="${r.id}"]`, { timeout: 5000 });
      await page.click(`[data-add-asset="${r.id}"]`);
      return 'lamp.jpg';
    },
    async pdf() {
      await page.click('[data-srctab="up"]').catch(() => {});
      await PIC.pick(page, 'wb', 'pdf');
      await page.waitForSelector('[data-pdfbox]', { timeout: 20000 });
      await page.fill('[data-pdf-page]', '2'); await page.dispatchEvent('[data-pdf-page]', 'change');
      await page.click('[data-pdf-place]'); await PIC.idle(page);
      return 'workbook.pdf p.2';
    },
    async pixabay() {
      await page.click('[data-srctab="pixabay"]'); await settle();
      if (!(await page.$('[data-stock-add="1003"]'))) { await page.fill('[data-stock-q]', 'man'); await page.press('[data-stock-q]', 'Enter'); await settle(); }
      await page.click('[data-stock-add="1003"]');
      await page.waitForFunction(() => window.kdpBookSteps[9]._debug().replaceId == null && !window.kdpBookSteps[9]._debug().stock.busy, null, { timeout: 10000 });
      return 'light bulb';
    },
    async unsplash() {
      await page.click('[data-srctab="unsplash"]');
      if (!(await page.$('[data-stock-add="u2AbC"]'))) { await page.fill('[data-stock-q]', 'man'); await page.click('[data-k="stk-go"]'); await settle(); }
      await page.click('[data-stock-add="u2AbC"]');
      await page.waitForFunction(() => window.kdpBookSteps[9]._debug().replaceId == null && !window.kdpBookSteps[9]._debug().stock.busy, null, { timeout: 10000 });
      return null;   // Unsplash names a pick from its photo: read from the row
    }
  };

  // The first picture: a file named man.jpg replaces the layout's sample (the owner's "man").
  let L = await pic();
  await startReplace(L.id);
  await PIC.pick(page, 'man'); await PIC.idle(page);
  let nm = await names(L.id);
  ok(nm.name === 'man.jpg' && nm.shown === 'man.jpg', `the sample replaced by man.jpg: "${nm.shown}"`);
  // lamp.jpg in Uploads for the tile path.
  await page.evaluate(() => { window.kdpBookSteps[9]._debug().sel = null; });
  await PIC.pick(page, 'lamp'); await PIC.idle(page);
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const last = E.cover.layers[E.cover.layers.length - 1]; E.removeIds([last.id]); });
  L = await pic();
  const n0 = (await names(L.id)).n;

  for (const typed of [false, true]) {
    for (const [key, run] of Object.entries(PATHS)) {
      const before = await names(L.id);
      if (typed) await page.evaluate((id) => window.kdpBookSteps[9]._debug().commitLayers(window.kdpBookSteps[9]._debug().cover.layers.map((x) => (x.id === id ? Object.assign({}, x, { label: 'man' }) : x))), L.id);
      const old = await names(L.id);
      ok(!typed || old.shown === 'man', `${key}${typed ? ' (typed name)' : ''}: before Replace the layer reads "${old.shown}"`);
      await startReplace(L.id);
      let want = await run();
      const after = await names(L.id);
      if (want == null) { const cur = await pic(); const r = st.assets.find((a) => a.id === cur.asset); want = r && r.name; }
      const shownRow = await row(L.id);
      const tag = `${key}${typed ? ' (typed name "man")' : ''}`;
      ok(after.name === want, `${tag}: the layer's picture name is the new one ("${after.name}", want "${want}")`);
      ok(after.shown === want && after.names === want && !after.label, `${tag}: the name shown is the new picture's ("${after.shown}"), no typed name left`);
      ok(shownRow.includes(want) && !/\bman\b/.test(shownRow.replace(want, '')), `${tag}: the Layers row reads "${shownRow}"`);
      ok(after.n === n0, `${tag}: Replace adds no layer (${after.n})`);
      // One Undo: the old picture and its old name.
      await page.click('[data-vb="undo"]');
      await page.waitForTimeout(150);
      const back = await names(L.id);
      ok(back.shown === old.shown, `${tag}: one Undo brings back "${old.shown}" (got "${back.shown}")`);
      await page.click('[data-vb="redo"]');
      await page.waitForTimeout(150);
      if (typed) await page.evaluate((id) => window.kdpBookSteps[9]._debug().commitLayers(window.kdpBookSteps[9]._debug().cover.layers.map((x) => { if (x.id !== id) return x; const y = Object.assign({}, x); delete y.label; return y; })), L.id);
      void before;
    }
  }
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
