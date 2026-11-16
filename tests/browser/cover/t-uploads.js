// E16 Part 6: uploads (plan §3 "Images", design 62's Images panel). The rights tick comes first; JPG or PNG (by
// the file's bytes) up to 10 MB and 12,000 px a side, stored as sent (a PNG keeps its transparency); the file at
// <user>/assets/<id>.jpg|png and its cover_assets row share one id; a row that fails removes its file; Paste and
// Cmd/Ctrl+V; the Uploads list, Replace, the pictures of a saved cover read back from the bucket; the missing
// picture (R13: placeholder, C15 Must fix) and the picture that did not load (Retry). Mocked: nothing leaves the page.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  const n0 = (await CV.state(page)).layers.length;

  /* The panel: Uploads is the live tab; Pixabay and Unsplash come in Part 7. */
  await page.click('[data-tool="images"]');
  await page.waitForSelector('[data-rights]');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Images'), 'the Images tool opens the Images panel');
  ok(await page.$eval('[data-tool="images"]', (b) => b.getAttribute('aria-pressed') === 'true' && !b.hasAttribute('aria-disabled')), 'Images: a live tool, pressed');
  const tabs = await page.$$eval('[role="tab"]', (a) => a.map((t) => [t.textContent, t.getAttribute('aria-selected'), t.getAttribute('aria-disabled'), t.title]));
  ok(tabs.map((t) => t[0]).join('|') === 'Uploads|Pixabay|Unsplash' && tabs[0][1] === 'true' && !tabs[0][2], `tabs: ${tabs.map((t) => t[0])}, Uploads on`);
  ok(tabs[1][2] === 'true' && tabs[1][3] === 'Comes in Part 7' && tabs[2][2] === 'true' && tabs[2][3] === 'Comes in Part 7', 'Pixabay and Unsplash: inert, "Comes in Part 7"');
  ok((await CV.txt(page, '.cv-rights')) === 'I own this picture or PDF, or I have the right to use it on a book cover I sell.', 'the rights words are the design\'s');
  ok(await page.$eval('[data-up-file]', (i) => i.disabled && i.accept === 'image/jpeg,image/png') && await page.$eval('[data-up-pdf]', (i) => i.disabled && i.accept === 'application/pdf'), 'before the tick: both file fields are off (JPG/PNG, PDF)');
  // Owner, STOP 6: the size comes from this book at 300 DPI (geo.px300), not the design's fixed 3,800 × 2,800.
  ok((await CV.txt(page, '[data-up-help]')) === 'JPG or PNG up to 10 MB, PDF up to 25 MB. A full cover for this book needs at least 3,712 × 2,775 px. You can also press Cmd+V or Ctrl+V.', `the help line, 6 × 9, 54 pages, white: ${await CV.txt(page, '[data-up-help]')}`);
  ok(await page.evaluate(() => { const g = kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt), p = kdpCover.geo.px300(g); return p.w === 3712 && p.h === 2775; }), 'the same numbers as geo.px300 (the export\'s full image size)');
  await page.waitForFunction(() => Array.isArray(window.kdpBookSteps[9]._debug().uploads));
  ok(/No pictures yet/.test(await CV.txt(page, '[data-panel]')), 'Uploads, empty: "No pictures yet…"');

  /* Rights first: an upload button, Paste and Cmd+V before the tick only say why. */
  await page.click('.cv-upbtn:first-child', { force: true });
  ok((await CV.txt(page, '.cv-uperr')) === 'Tick the rights box first, then add the picture again.', 'Upload image before the tick: the design\'s words');
  ok(await page.$eval('.cv-uperr', (n) => n.getAttribute('role') === 'alert' && !!n.querySelector('svg')), 'the error is an alert with an icon');
  await PIC.make(page, 'a', { w: 1200, h: 800, type: 'image/jpeg', name: 'desk.jpg' });
  await page.click('[data-tool="text"]');
  await PIC.paste(page, 'a');
  await page.waitForTimeout(150);
  ok((await CV.state(page)).layers.length === n0 && st.uploads.length === 0, 'paste before the tick: nothing stored or added');
  ok(await page.$eval('[data-panel]', (p) => p.getAttribute('aria-label') === 'Images') && /Tick the rights box first/.test(await CV.txt(page, '[data-panel]')), 'paste before the tick opens Images and says why');
  await page.click('[data-paste]');
  ok((await CV.txt(page, '.cv-uperr')) === 'Tick the rights box first.', 'Paste from clipboard before the tick: "Tick the rights box first."');

  /* The tick, then a JPG. */
  await page.click('[data-rights]');
  ok(await page.$eval('[data-up-file]', (i) => !i.disabled) && !(await page.$('.cv-uperr')), 'the tick turns the fields on and clears the error');
  const size = await page.evaluate(() => window.__pic.a.size);
  await PIC.pick(page, 'a');
  await PIC.idle(page);
  let s = await CV.state(page);
  const L = s.layers[s.layers.length - 1];
  ok(s.layers.length === n0 + 1 && L.type === 'image' && L.name === 'desk.jpg' && s.sel === L.id, 'the picture is added on top, selected, named after the file');
  ok(L.natW === 1200 && L.natH === 800 && Math.abs(L.w - 300) < 1e-6 && Math.abs(L.h - 200) < 1e-6, `300 px on the long side (${L.w} × ${L.h}), the design's addImage`);
  const g = await page.evaluate(() => kdpCover.geo.geo(window.kdpBookSteps[9]._debug().cover.fmt));
  ok(Math.abs(L.x + L.w / 2 - g.frontCX) < 1e-6, 'centered on the front');
  const row = st.assets[0], file = st.uploads[0];
  ok(st.assets.length === 1 && L.asset === row.id, 'one cover_assets row; the layer names it');
  ok(file && file.name === row.path && row.path === `00000000-0000-4000-8000-000000000001/assets/${row.id}.jpg`, 'file and row share one id: <user>/assets/<id>.jpg');
  ok(file.type === 'image/jpeg' && file.size === size && row.bytes === size, `stored as sent: ${size} bytes, image/jpeg`);
  const same = await page.evaluate(async (p) => { const a = new Uint8Array(await window.__pic.a.arrayBuffer()); const r = await window.kdp.downloadCoverAsset(p); const b = new Uint8Array(await r.data.arrayBuffer()); return a.length === b.length && a.every((v, i) => v === b[i]); }, row.path);
  ok(same, 'the bucket holds the very bytes picked (no new JPEG)');
  ok(row.source === 'upload' && row.mime === 'image/jpeg' && row.width === 1200 && row.height === 800 && !row.transparent && !!row.rights_at && row.origin_book_id === FIX.BOOK, 'the row: upload, image/jpeg, 1200 × 800, rights ticked, this book');
  ok(st.calls.indexOf(`POST /storage/v1/object/covers/${row.path}`) < st.calls.indexOf('POST /rest/v1/cover_assets'), 'the file first, then the row');
  await CV.settled(page, 'saved');
  ok((CV.lastSave().body.layers || []).some((l) => l.asset === row.id), 'autosave writes the layer with its asset id');
  ok(await page.$$eval('[data-uptiles] [data-add-asset]', (a) => a.length) === 1 && /1,200 × 800/.test(await CV.txt(page, '[data-uptiles]')), 'Uploads lists it with its size');
  await PIC.drawn(page);
  const tl = await page.$eval(`[data-hit="${L.id}"]`, (n) => { const r = n.getBoundingClientRect(); return [r.left + 8, r.top + 8]; });
  const px = await CV.px(page, tl[0], tl[1]);
  ok(px[0] > 150 && px[1] < 90 && px[2] < 90, `the picture is drawn on the cover (its red corner mark: ${px})`);
  ok(await page.$eval('[data-textbar]', (b) => !b.hidden && b.getAttribute('aria-label') === 'Selected image'), 'the picture bar shows: "Selected image"');

  /* A see-through PNG keeps its transparency. */
  await PIC.make(page, 'p', { w: 800, h: 800, type: 'image/png', alpha: true, name: 'cutout.png' });
  await PIC.pick(page, 'p'); await PIC.idle(page);
  const prow = st.assets[1];
  ok(prow.mime === 'image/png' && prow.transparent && prow.path.endsWith('.png') && st.uploads[1].type === 'image/png', 'a PNG: image/png, transparent, .png, stored as PNG');
  const pl = (await PIC.layers(page)).pop();
  ok(pl.transparent && pl.natW === 800, 'its layer is marked transparent (flattened at export, B2)');
  ok(await page.$eval('[data-uptiles] .cv-uptile-img.is-clear', (i) => !!i), 'its tile shows the checkerboard behind it');

  /* Refusals: kind by bytes, 10 MB, 12,000 px; nothing stored. */
  const before = st.uploads.length;
  const refuse = async (key, want, what) => {
    await PIC.pick(page, key); await PIC.idle(page);
    ok((await CV.txt(page, '.cv-uperr').catch(() => '')) === want && st.uploads.length === before, `${what}: "${want}"`);
  };
  await PIC.raw(page, 'gif', { bytes: [71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 59], name: 'photo.jpg', type: 'image/jpeg' });
  await refuse('gif', 'This file is not a JPG or PNG.', 'a GIF named photo.jpg (the bytes decide)');
  await PIC.raw(page, 'txt', { text: 'hello', name: 'notes.png', type: 'image/png' });
  await refuse('txt', 'This file is not a JPG or PNG.', 'a text file named .png');
  await PIC.make(page, 'big', { w: 200, h: 200, type: 'image/jpeg', pad: 10485760 });
  await refuse('big', 'This file is over 10 MB. Save it smaller and try again.', 'a JPG over 10 MB');
  await PIC.make(page, 'wide', { w: 12001, h: 4, type: 'image/png' });
  await refuse('wide', 'This picture is over 12,000 px on one side. Save it smaller and try again.', 'a PNG 12,001 px wide');
  await PIC.make(page, 'edge', { w: 12000, h: 4, type: 'image/png' });
  await PIC.pick(page, 'edge'); await PIC.idle(page);
  ok(st.assets.some((a) => a.width === 12000 && a.height === 4) && !(await page.$('.cv-uperr')), '12,000 px exactly: stored (0030 allows 1 to 12,000)');
  await PIC.raw(page, 'bad', { bytes: [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9], name: 'broken.jpg', type: 'image/jpeg' });
  const b2 = st.uploads.length;
  await PIC.pick(page, 'bad'); await PIC.idle(page);
  ok((await CV.txt(page, '.cv-uperr')) === 'This picture could not be opened.' && st.uploads.length === b2, 'a broken JPG: "This picture could not be opened."');

  /* An EXIF-turned phone photo: the size as drawn (the turn swaps width and height). */
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#336699'; g.fillRect(0, 0, 400, 100);
    const b = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
    const app1 = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0];
    const out = new Uint8Array(b.length + app1.length); out.set(b.subarray(0, 2)); out.set(app1, 2); out.set(b.subarray(2), 2 + app1.length);
    window.__pic.exif = new File([out], 'phone.jpg', { type: 'image/jpeg' });
  });
  await PIC.pick(page, 'exif'); await PIC.idle(page);
  const ex = st.assets[st.assets.length - 1];
  ok(ex.width === 100 && ex.height === 400, `EXIF turn 6: stored as 100 × 400 (the header says 400 × 100): ${ex.width} × ${ex.height}`);
  ok((await PIC.layers(page)).pop().natW === 100, 'its layer is upright (natW 100)');

  /* Failures: the upload, then the row (its file is removed again). */
  const nl = (await CV.state(page)).layers.length;
  globalThis.__modes.uploadFail = 1;
  await PIC.pick(page, 'a'); await PIC.idle(page);
  ok((await CV.txt(page, '.cv-uperr')) === 'The picture was not saved. Check your connection, then try again.' && (await CV.state(page)).layers.length === nl, 'storage down: the error, no layer');
  const files0 = Object.keys(st.files).length, rows0 = st.assets.length;
  globalThis.__modes.rowFail = 1;
  await PIC.pick(page, 'a'); await PIC.idle(page);
  ok(/was not saved/.test(await CV.txt(page, '.cv-uperr')) && st.assets.length === rows0 && Object.keys(st.files).length === files0, 'the row fails: its file is removed again, no layer, the error');
  ok((await CV.state(page)).layers.length === nl, 'no layer after either failure');

  /* Paste (Cmd/Ctrl+V on the cover), and the Paste button with no picture. */
  await page.click('[data-tool="text"]');
  await page.focus('[data-canvas]').catch(() => {});
  const up0 = st.uploads.length;
  const prevented = await PIC.paste(page, 'a');
  await PIC.idle(page);
  ok(prevented && st.uploads.length === up0 + 1 && (await PIC.layers(page)).pop().name === 'desk.jpg', 'Cmd+V with a picture: stored and added, named after the pasted file (the paste is taken)');
  const pasted = (await PIC.layers(page)).length;
  ok(await PIC.paste(page, null) === false && (await PIC.layers(page)).length === pasted, 'Cmd+V with only words: nothing happens');
  await PIC.ready(page);
  const inField = (await PIC.layers(page)).length;
  await page.click('[data-tool="shapes"]');
  await page.waitForSelector('[data-icon-q]');
  ok(await PIC.paste(page, 'a', '[data-icon-q]') === false && (await PIC.layers(page)).length === inField, 'a paste inside a text field is left to the field');
  await page.click('[data-tool="images"]');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['x']) }] }, configurable: true }); });
  await page.click('[data-paste]');
  await page.waitForSelector('.cv-uperr');
  ok((await CV.txt(page, '.cv-uperr')) === 'There is no picture on the clipboard.', 'Paste from clipboard with words only: "There is no picture on the clipboard."');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { read: async () => { throw new Error('denied'); } }, configurable: true }); });
  await page.click('[data-paste]');
  await page.waitForTimeout(100);
  ok((await CV.txt(page, '.cv-uperr')) === 'Paste is blocked here. Press Cmd+V or Ctrl+V on the cover instead.', 'Paste blocked by the browser: the design\'s words');
  await page.evaluate(async () => { const f = window.__pic.a; Object.defineProperty(navigator, 'clipboard', { value: { read: async () => [{ types: ['image/jpeg'], getType: async () => f }] }, configurable: true }); });
  const before2 = (await PIC.layers(page)).length;
  await page.click('[data-paste]'); await page.waitForTimeout(100); await PIC.idle(page);
  ok((await PIC.layers(page)).length === before2 + 1 && (await PIC.layers(page)).pop().name === 'pasted-image.jpg', 'Paste from clipboard with a JPG: added as pasted-image.jpg');

  /* Uploads list: newest first; a tile adds it again; Replace keeps the box. */
  const tiles = await page.$$eval('[data-add-asset]', (a) => a.map((t) => t.dataset.addAsset));
  const order = st.assets.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).map((a) => a.id);
  ok(tiles.length === st.assets.length && tiles[0] === order[0], `Uploads: ${tiles.length} tiles, newest first`);
  ok(await page.$eval('[data-add-asset]', (t) => /^Add (picture|PDF page), [\d,]+ × [\d,]+ px/.test(t.getAttribute('aria-label'))), 'a tile is labelled "Add picture, W × H px"');
  const nTile = (await PIC.layers(page)).length;
  await page.click(`[data-add-asset="${row.id}"]`);
  ok((await PIC.layers(page)).length === nTile + 1 && (await PIC.layers(page)).pop().asset === row.id, 'a tile adds that picture again');
  const target = (await PIC.layers(page)).pop();
  await page.evaluate((id) => window.kdpBookSteps[9]._debug().setLayer(id, { x: 100, y: 100, w: 200, h: 200, px: -50, py: 0, pw: 300, ph: 200 }), target.id);
  await page.click('[data-k="replace"]');
  ok(await page.$eval('[data-panel]', (p) => /Pick a picture to replace the selected one\./.test(p.innerText)), 'Replace: the panel says "Pick a picture to replace the selected one."');
  ok(await page.$eval('[data-add-asset]', (t) => /^Replace with /.test(t.getAttribute('aria-label'))), 'tiles read "Replace with …"');
  await page.click(`[data-add-asset="${prow.id}"]`);
  const rep = (await PIC.layers(page)).find((l) => l.id === target.id);
  ok(rep.asset === prow.id && rep.x === 100 && rep.w === 200 && rep.h === 200 && rep.natW === 800 && Math.abs(rep.pw - 200) < 1e-6, 'the layer keeps its box and gets the new picture, fitted (coverFit)');
  ok((await PIC.layers(page)).length === nTile + 1, 'Replace adds no layer');
  ok(!/Pick a picture to replace/.test(await CV.txt(page, '[data-panel]')), 'the replace note is gone');
  await page.click('[data-k="replace"]'); await page.click('[data-rep-cancel]');
  ok(!(await page.evaluate(() => window.kdpBookSteps[9]._debug().replaceId)), 'Cancel ends Replace');

  /* Read back: a saved cover with an upload draws it from the bucket; a removed one is missing; a lost file did not load. */
  await CV.settled(page);
  const keepAssets = st.assets.slice();
  const lastLayers = st.design.layers;
  // a missing asset (no row) and one whose file is gone
  const ghostId = '0000000a-0000-4000-8000-00000000000a';
  const lost = { ...keepAssets[0], id: '0000000b-0000-4000-8000-00000000000b', path: `00000000-0000-4000-8000-000000000001/assets/0000000b-0000-4000-8000-00000000000b.jpg` };
  st.assets.push(lost);
  const mk = (id, asset, x) => Object.assign({}, lastLayers.find((l) => l.type === 'image'), { id, asset, x, y: 60, w: 150, h: 100, px: 0, py: 0, pw: 150, ph: 100, natW: 1200, natH: 800, rot: 0, lock: false, hidden: false, noExport: false, op: 100, mask: 'none', bw: 0 });
  st.design.layers = lastLayers.concat([mk(900, ghostId, 30), mk(901, lost.id, 200)]);
  await CV.open(page);
  await PIC.drawn(page);
  const states = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return E.cover.layers.filter((l) => l.type === 'image').map((l) => [l.id, kdpCover.images.state(E, l)]); });
  ok(states.filter((x) => x[1] === 'ready').length >= 3, `saved pictures load from the bucket (${states.filter((x) => x[1] === 'ready').length} ready)`);
  ok(states.find((x) => x[0] === 900)[1] === 'missing' && states.find((x) => x[0] === 901)[1] === 'failed', 'no row → missing; the file is gone → did not load');
  ok(await page.$eval('[data-ph="900"]', (n) => /Picture missing/.test(n.innerText) && /Replace it or delete it\./.test(n.innerText) && n.classList.contains('is-missing')), 'the missing placeholder: "Picture missing. Replace it or delete it."');
  ok(await page.$eval('[data-ph="901"]', (n) => /The picture did not load/.test(n.innerText)), 'the failed placeholder: "The picture did not load"');
  ok(await page.$eval('[data-hit="900"]', (n) => /picture missing/.test(n.getAttribute('aria-label'))), 'the layer box tells a screen reader the picture is missing');
  const chip = await CV.txt(page, '[data-k="chk"]');
  ok(/to fix/.test(chip), `the missing picture is a Must fix (C15): chip "${chip}"`);
  const c15 = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.checks.run(E.cover, { missing: kdpCover.images.missing(E) }).filter((c) => c.code === 'C15'); });
  ok(c15.length === 1 && c15[0].sev === 'error' && c15[0].id === 900 && /is missing: it was removed from your uploads\. Replace it or delete it\./.test(c15[0].msg), `C15: ${c15.map((c) => c.msg)}`);
  ok(/Fix \d+ problems? before export\./.test(await CV.txt(page, '[data-next-note]')), 'the header reason counts it');
  const noC15 = await page.evaluate(() => kdpCover.checks.run(window.kdpBookSteps[9]._debug().cover).some((c) => c.code === 'C15'));
  ok(!noC15, 'without the missing list, checks.run has no C15 (the Part 1 tables do not move)');
  await page.focus('[data-hit="900"]'); await page.keyboard.press('Enter');
  ok(/Picture missing/.test(await CV.txt(page, '[data-textbar]')) && !(await page.$('[data-textbar] [data-dpi]')), 'its bar: "Picture missing" in place of the DPI badge');
  // Retry the one that did not load, once its file is back.
  st.files[lost.path] = st.files[keepAssets[0].path];
  await page.focus('[data-hit="901"]'); await page.keyboard.press('Enter');
  await page.click('[data-k="pic-retry"]');
  await PIC.drawn(page);
  ok(await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.images.state(E, E.cover.layers.find((l) => l.id === 901)); }) === 'ready' && !(await page.$('[data-ph="901"]')), 'Retry loads it; the placeholder goes');
  // Replace the missing one: the Must fix goes.
  await page.focus('[data-hit="900"]'); await page.keyboard.press('Enter');
  await page.click('[data-k="replace"]');
  await page.waitForSelector('[data-add-asset]');
  await page.click(`[data-add-asset="${row.id}"]`);
  ok(!(await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return kdpCover.checks.run(E.cover, { missing: kdpCover.images.missing(E) }).some((c) => c.code === 'C15'); })), 'after Replace: no C15');
  // One more picture in Uploads that no cover uses (for the memory check below).
  { const src = st.assets.find((a) => a.mime === 'image/jpeg' && st.files[a.path]); const nid = '0000000d-0000-4000-8000-00000000000d';
    const extra = { ...src, id: nid, path: `00000000-0000-4000-8000-000000000001/assets/${nid}.jpg`, created_at: new Date(Date.now() + 1000).toISOString() };
    st.files[extra.path] = st.files[src.path]; st.assets.push(extra); }
  // The Uploads list read fails, then Retry.
  globalThis.__modes.listFail = 1;
  await CV.open(page);
  await page.click('[data-tool="images"]');
  await page.waitForSelector('[data-up-retry]');
  ok(/We couldn’t load your uploads/.test(await CV.txt(page, '[data-panel]')), 'Uploads read fails: the error with Retry');
  await page.click('[data-up-retry]');
  await page.waitForSelector('[data-uptiles]');
  ok(await page.$$eval('[data-add-asset]', (a) => a.length) === st.assets.length, 'Retry lists them');
  // Memory: a picture only in Uploads keeps its thumbnail, not a screen copy; one on the cover keeps both.
  await page.waitForFunction(() => { const E = window.kdpBookSteps[9]._debug(); return E.uploads.filter((r) => r.path).every((r) => { const p = E.pics.get(r.id); return p && (p.st === 'listed' || p.st === 'ready' || p.st === 'failed'); }); }, null, { timeout: 20000 });
  const mem = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const used = new Set(E.cover.layers.filter((l) => l.type === 'image').map((l) => l.asset)); return E.uploads.map((r) => { const p = E.pics.get(r.id); return { used: used.has(r.id), st: p.st, src: !!p.src, thumb: !!p.thumb }; }); });
  const listOnly = mem.filter((m) => !m.used && m.st !== 'failed'), onCover = mem.filter((m) => m.used && m.st === 'ready');
  ok(listOnly.length > 0 && listOnly.every((m) => m.st === 'listed' && !m.src && m.thumb), `Uploads-only pictures: a thumbnail, no screen copy (${listOnly.length})`);
  ok(onCover.length > 0 && onCover.every((m) => m.src && m.thumb), `pictures on the cover: a screen copy and a thumbnail (${onCover.length})`);
  const lid = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); const used = new Set(E.cover.layers.map((l) => l.asset)); return E.uploads.find((r) => r.path && !used.has(r.id) && E.pics.get(r.id).st === 'listed').id; });
  await page.click(`[data-add-asset="${lid}"]`);
  await PIC.drawn(page);
  ok(await page.evaluate((id) => { const p = window.kdpBookSteps[9]._debug().pics.get(id); return p.st === 'ready' && !!p.src; }, lid), 'a tile put on the cover loads its screen copy');

  // The help line for an 8.5 × 11 book (54 pages, white): 5,212 × 3,375 px.
  st.book.trim = '8.5x11';
  st.design.fmt = { trim: '8.5x11', pages: 54, paper: 'white' };
  await CV.open(page);
  await page.click('[data-tool="images"]');
  await page.waitForSelector('[data-up-help]');
  ok((await CV.txt(page, '[data-up-help]')) === 'JPG or PNG up to 10 MB, PDF up to 25 MB. A full cover for this book needs at least 5,212 × 3,375 px. You can also press Cmd+V or Ctrl+V.', `the help line, 8.5 × 11: ${await CV.txt(page, '[data-up-help]')}`);
  st.book.trim = '6x9';

  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0, 'no CDN file went to the network');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
