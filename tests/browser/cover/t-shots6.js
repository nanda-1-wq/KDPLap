// E16 STOP 6 compare shots (plan §10: P6 = 62), plus the Part 6 surfaces no final shows (as the icons grid at STOP 5):
// the Uploads panel, the picture bar and each of its popovers, the PDF page chooser, an upload error, the
// placeholders (loading, did not load, missing) and the DPI badges. Built from the design fixture (the design's book)
// with pictures made in the page (fixture-pictures.js). 62 = design applyFinal F62: Picture band + warm blurb, the
// picture selected and cropping. Files go to docs/reviews/e16-stop6/. Never in a sweep: it rewrites tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-stop6');
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fresh = () => { st.pdf = { export_id: 'e0000001-0000-4000-8000-000000000000', page_count: 54, created_at: new Date().toISOString(), current: true }; globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; };
  async function picband() {
    await FIX.band(page);
    return page.evaluate(({ book, fmt, blurb }) => { const r = kdpCover.layouts.build('picband', book, fmt, 1, blurb); return { layers: r.layers, bg: r.bg }; }, { book: { title: FIX.title, subtitle: FIX.subtitle, pen: FIX.pen }, fmt: FIX.fmt, blurb: FIX.blurbWarm });
  }
  const setDesign = (b, layout) => { st.design = { book_id: FIX.BOOK, layers: b.layers, bg: b.bg, fmt: { ...FIX.fmt }, layout, last_remap: null, rev: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; };

  async function build62() {
    fresh();
    setDesign(await picband(), 'picband');
    await CV.open(page);
    const im = (await CV.state(page)).layers.find((l) => l.type === 'image');
    await page.focus(`[data-hit="${im.id}"]`); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await blur();
  }
  /** Band + 3 uploads (a photo, a see-through PNG, a small photo), the first one on the front, selected. */
  async function buildUploads() {
    fresh();
    setDesign(await FIX.band(page), 'band');
    await CV.open(page);
    await PIC.ready(page);
    await PIC.make(page, 's', { w: 900, h: 600, type: 'image/jpeg', name: 'notebook.jpg' }); await PIC.pick(page, 's'); await PIC.idle(page);
    await PIC.make(page, 'c', { w: 1200, h: 1200, type: 'image/png', alpha: true, name: 'leaf-cutout.png' }); await PIC.pick(page, 'c'); await PIC.idle(page);
    await PIC.make(page, 'p', { w: 6000, h: 4000, type: 'image/jpeg', name: 'desk-sunrise.jpg', quality: 0.8 }); await PIC.pick(page, 'p'); await PIC.idle(page);
    await page.evaluate(() => {
      const E = window.kdpBookSteps[9]._debug(), g = kdpCover.geo.geo(E.cover.fmt);
      const im = E.cover.layers.filter((l) => l.type === 'image');
      E.commitLayers(E.cover.layers.filter((l) => l.type !== 'image' || l.id === im[2].id));
      const p = E.cover.layers.find((l) => l.id === im[2].id);
      // on the back cover, under the blurb and clear of the barcode box, so no text is covered
      E.setLayer(p.id, Object.assign({ x: 40, y: 350, w: 270, h: 180 }, kdpCover.model.coverFit(p, { w: 270, h: 180 })));
      E.select(p.id);
    });
    await PIC.drawn(page);
  }

  // 62 at 1440 and 1024
  await page.setViewportSize({ width: 1440, height: 900 });
  await build62();
  await shot(`${SHOTS}/b62-1440.png`);
  await page.setViewportSize({ width: 1024, height: 900 });
  await build62();
  await shot(`${OUT}/62-1024.png`);
  ok(await CV.noScroll(page), '62 at 1024: no sideways scroll');

  // The Uploads panel and the picture bar
  await page.setViewportSize({ width: 1440, height: 900 });
  await buildUploads();
  await blur();
  await shot(`${OUT}/images-uploads-1440.png`);
  for (const [k, file, setup] of [
    ['ifill', 'pop-fill'], ['iadjust', 'pop-adjust', { bri: 110, con: 105, sat: 80, dark: 20 }], ['iborder', 'pop-border', { bw: 6, bcolor: '#7A2E2E' }],
    ['imask', 'pop-mask', { mask: 'arch' }], ['op', 'pop-opacity', { op: 80 }], ['more', 'pop-more']]) {
    const keep = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return JSON.parse(JSON.stringify(E.cover.layers.find((l) => l.id === E.sel))); });
    if (setup) await page.evaluate((p) => { const E = window.kdpBookSteps[9]._debug(); E.setLayer(E.sel, p); }, setup);
    await page.click(`.cv-textbar [data-k="${k}"]`);
    await blur();
    await shot(`${OUT}/${file}-1440.png`);
    await page.keyboard.press('Escape').catch(() => {});
    // each popover shot starts from the same picture (the next shot does not carry this one's change)
    await page.evaluate((k) => { const E = window.kdpBookSteps[9]._debug(); E.menu = null; E.setLayer(k.id, k); E.refreshBars(); }, keep);
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.waitForTimeout(300);
  await blur();
  await shot(`${OUT}/images-uploads-1024.png`);
  ok(await CV.noScroll(page), 'Uploads and the picture bar at 1024: no sideways scroll');
  await page.setViewportSize({ width: 1440, height: 900 });

  // The PDF page chooser
  await page.evaluate((t) => { window.__pic = window.__pic || {}; window.__pic.pdf = new File([t], 'workbook-pages.pdf', { type: 'application/pdf' }); }, PIC.pdf(3));
  await PIC.pick(page, 'pdf', 'pdf');
  await page.waitForSelector('[data-pdfbox]', { timeout: 20000 });
  await blur();
  await shot(`${OUT}/pdf-chooser-1440.png`);
  await page.click('[data-pdf-cancel]');

  // An upload error (a GIF named .jpg)
  await PIC.raw(page, 'gif', { bytes: [71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 59], name: 'photo.jpg', type: 'image/jpeg' });
  await PIC.pick(page, 'gif');
  await page.waitForSelector('.cv-uperr');
  await blur();
  await shot(`${OUT}/upload-error-1440.png`);

  // Placeholders and DPI badges: a missing picture (selected), one that did not load, one loading, a soft and a low one.
  fresh();
  const b = await FIX.band(page);
  await page.evaluate(() => 0);
  const mk = (id, asset, x, y, natW, natH, name) => ({ id, type: 'image', name, asset, natW, natH, transparent: false, x, y, w: 150, h: 100, px: 0, py: 0, pw: 150, ph: 100, flipH: false, flipV: false, bri: 100, con: 100, sat: 100, blur: 0, dark: 0, look: 'none', bw: 0, bcolor: '#1C1C1A', mask: 'none', rot: 0, op: 100, lock: false, noExport: false });
  const A = (n) => `0000000${n}-0000-4000-8000-0000000000a${n}`;
  st.files[`00000000-0000-4000-8000-000000000001/assets/${A(2)}.jpg`] = undefined;
  st.assets.push({ id: A(2), source: 'upload', mime: 'image/jpeg', path: `00000000-0000-4000-8000-000000000001/assets/${A(2)}.jpg`, remote: null, width: 3000, height: 2000, bytes: 1000, transparent: false, rights_at: new Date().toISOString(), credit: null, origin_book_id: FIX.BOOK, created_at: new Date().toISOString() });
  b.layers = b.layers.concat([mk(90, A(1), 40, 80, 3000, 2000, 'old-photo.jpg'), mk(91, A(2), 210, 80, 3000, 2000, 'beach.jpg'), mk(92, null, 40, 200, 600, 400, 'Sample photo (replace it)'), mk(93, null, 210, 200, 300, 200, 'Sample photo (replace it)')]);
  setDesign(b, 'band');
  await CV.open(page);
  await PIC.drawn(page);
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.select(90); });
  await blur();
  await shot(`${OUT}/placeholders-1440.png`);
  await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); E.select(92); });
  await blur();
  await shot(`${OUT}/dpi-soft-1440.png`);
  await CV.quiet(page);

  // The design's own HTML in this Chrome (as at STOP 5): it breaks the title as the build does (D19).
  await page.context().unrouteAll();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5500/design/screens/62-09-cover-image-crop.html?final=F62&clean=1', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/62-design-html-in-chrome.png`, timeout: 30000 });

  // Side by side: built (1440 × 900) | design (2880 × 1800, shown at 1440).
  const base = 'http://127.0.0.1:5500';
  await page.setViewportSize({ width: 2960, height: 1000 });
  await page.goto(`${base}/robots.txt`);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
    figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>
    <figure><figcaption>BUILT · 62 · Picture band, the picture cropping</figcaption><img src="${base}/tests/browser/shots/cover/b62-1440.png"></figure>
    <figure><figcaption>DESIGN · 62-09-cover-image-crop</figcaption><img src="${base}/design/screens/62-09-cover-image-crop.png"></figure>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/62-compare-1440.png`, fullPage: true, timeout: 30000 });
  log.push('PASS 62-compare-1440.png and 14 more shots (15 files)');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
