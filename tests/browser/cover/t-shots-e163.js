// E16.3 STOP 2 compare shots (plan Item 2, owner Q2): the large view's Pixabay preview now shows the tile's thumb
// (webformatURL, 640 px), never largeImageURL, never drawn above its natural size. Shots at 1440:
//   preview-pixabay-1440.png        the STOP 7 state (F63, "green leaf"), built now; next to the approved
//                                    docs/reviews/e16-stop7/preview-pixabay-1440.png and design 63's preview state
//   63-design-preview-html-in-chrome.png  design 63's own HTML in this Chrome, its first PREVIEW opened
//   preview-photo-1440.png          a Pixabay photo ("sunrise over a desk", 640 × 427: smaller than the box)
//   preview-photo-before-1440.png   the same, with the old src (largeImageURL) put back in the page: how it was
//   preview-compare-1440.png, photo-compare-1440.png  side by side
//   preview-diff-1440.png           the pixels that differ from the approved STOP 7 shot (magenta), and the counts
// Files go to docs/reviews/e16-3/. Never in a sweep: it writes tracked images.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/cover$/, 'docs/reviews/e16-3');
  const base = 'http://127.0.0.1:5500';
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return S && !S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more)); }, null, { timeout: 10000 });
  const imgs = () => page.waitForFunction(() => [...document.querySelectorAll('[data-stockdlg] img, [data-panel] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await imgs(); await page.waitForTimeout(700); };
  const shot = async (path) => { await ready(); await page.screenshot({ path, timeout: 30000 }); };
  const blur = () => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fresh = () => { globalThis.__modes = {}; st.assets = []; st.files = {}; st.uploads = []; st.stock.calls = []; };
  const prevImg = () => page.$eval('.cv-sd-prevbox img', (i) => { const r = i.getBoundingClientRect(); return { src: i.getAttribute('src'), nw: i.naturalWidth, nh: i.naturalHeight, w: r.width, h: r.height }; });
  const big = (u) => /^https:\/\/pixabay\.com\/get\/.*_1280\./.test(u);

  /** As t-shots7 build63 (F63: Band + warm blurb, Images on Pixabay, the picker on Pixabay), No background on or off. */
  async function build63(nobg) {
    fresh();
    await CV.open(page, { design: 'band' });
    await STK.ready(page);
    await page.click('[data-tool="images"]');
    await page.click('[data-srctab="pixabay"]');
    if (nobg) await page.click('[data-stock-nobg]');
    await page.fill('[data-stock-q]', 'study desk'); await page.press('[data-stock-q]', 'Enter'); await settle();
    await page.click('[data-stock-open]'); await settle();
    await blur();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  // 1 · The STOP 7 state: F63, the first result's preview.
  await build63(true);
  await imgs();
  let net0 = st.stock.net.length;
  await page.click('[data-stock-look="1000"]'); await blur();
  await shot(`${OUT}/preview-pixabay-1440.png`);
  let p = await prevImg();
  ok(p.src === STK.results('pixabay')[0].thumb && p.nw === 640 && p.w <= p.nw, `leaf: ${p.src}, ${p.nw} × ${p.nh} natural, ${p.w} × ${p.h} drawn`);
  ok(!st.stock.net.slice(net0).some(big), `leaf: no _1280 request (${st.stock.net.slice(net0).length} picture requests)`);

  // 2 · A photo, smaller than the box: drawn at its natural size.
  await build63(false);
  await imgs();
  net0 = st.stock.net.length;
  await page.click('[data-stock-look="1009"]'); await blur();
  await shot(`${OUT}/preview-photo-1440.png`);
  p = await prevImg();
  const box = await page.$eval('.cv-sd-prevbox', (b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  ok(p.nw === 640 && p.nh === 427 && p.w === 640 && p.h === 427, `photo: drawn ${p.w} × ${p.h} in a ${box.join(' × ')} box (natural ${p.nw} × ${p.nh})`);
  ok(!st.stock.net.slice(net0).some(big), 'photo: no _1280 request');
  // How it was: the old src put back in the page (shot only; the app no longer does this).
  await page.$eval('.cv-sd-prevbox img', (i, u) => { i.src = u; }, STK.results('pixabay')[9].preview);
  await shot(`${OUT}/preview-photo-before-1440.png`);
  p = await prevImg();
  ok(p.nw === 1280 && Math.round(p.w) === 864, `before: the 1,280 px file drawn ${p.w} × ${p.h} (scaled down to the box height)`);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await CV.quiet(page);
  ok(CV.mockErrors().length === 0, 'no mock errors');

  // 3 · Design 63's own HTML in this Chrome, its first PREVIEW opened.
  await page.context().unrouteAll();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/design/screens/63-09-cover-images-pixabay.html?final=F63&clean=1`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(2500);
  await page.getByText('PREVIEW', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/63-design-preview-html-in-chrome.png`, timeout: 30000 });
  ok(await page.getByText('Add to cover', { exact: true }).count() > 0, 'design 63: its preview state is open');

  // 4 · Side by side.
  const fig = (cap, src) => `<figure><figcaption>${cap}</figcaption><img src="${base}/${src}"></figure>`;
  const side = async (file, figs) => {
    await page.setViewportSize({ width: 40 + figs.length * 1480, height: 1000 });
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;width:1440px;border:1px solid #B8B8B3}</style>${figs.join('')}`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: true, timeout: 30000 });
  };
  await side('preview-compare-1440.png', [
    fig('APPROVED · STOP 7 · the Pixabay preview (largeImageURL, 1,280 px)', 'docs/reviews/e16-stop7/preview-pixabay-1440.png'),
    fig('BUILT · E16.3 · the same preview (webformatURL, 640 px, never scaled up)', 'docs/reviews/e16-3/preview-pixabay-1440.png'),
    fig('DESIGN · 63 · its preview state (HTML in this Chrome)', 'docs/reviews/e16-3/63-design-preview-html-in-chrome.png')]);
  await side('photo-compare-1440.png', [
    fig('BEFORE · a Pixabay photo, largeImageURL (1,280 × 853, scaled to the box)', 'docs/reviews/e16-3/preview-photo-before-1440.png'),
    fig('BUILT · E16.3 · webformatURL (640 × 427, its natural size)', 'docs/reviews/e16-3/preview-photo-1440.png')]);

  // 5 · The pixels that differ from the approved STOP 7 shot: counts, boxes, and a picture (magenta = differs).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/robots.txt`);
  const diff = await page.evaluate(async ([a, b]) => {
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const W = A.naturalWidth, H = A.naturalHeight;
    const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H); };
    const da = px(A), db = px(B);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const g = out.getContext('2d'); g.globalAlpha = 0.35; g.drawImage(B, 0, 0); g.globalAlpha = 1;
    const od = g.getImageData(0, 0, W, H);
    // Regions: the preview box, the info column, and everything else (the dialog's head, the page behind it).
    const regions = { box: [200, 242, 1072, 820], info: [1084, 230, 1400, 830] };
    const where = (x, y) => Object.keys(regions).find((k) => { const r = regions[k]; return x >= r[0] && x < r[2] && y >= r[1] && y < r[3]; }) || 'rest';
    const n = { box: 0, info: 0, rest: 0 }, bb = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > 16) {
        const k = where(x, y); n[k]++;
        const r = bb[k] || (bb[k] = [x, y, x, y]); r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], y); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], y);
        od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 255; od.data[i + 3] = 255;
      }
    }
    g.putImageData(od, 0, 0);
    document.body.innerHTML = ''; document.body.style.margin = '0'; document.body.appendChild(out);
    return { W, H, n, bb };
  }, [`${base}/docs/reviews/e16-stop7/preview-pixabay-1440.png`, `${base}/docs/reviews/e16-3/preview-pixabay-1440.png`]);
  await page.screenshot({ path: `${OUT}/preview-diff-1440.png`, timeout: 30000 });
  log.push(`INFO diff vs STOP 7 (channel delta > 16): ${JSON.stringify(diff)}`);
  log.push('PASS preview-compare-1440.png, photo-compare-1440.png, preview-diff-1440.png and 4 more shots (7 files)');
  return log.join('\n');
};
