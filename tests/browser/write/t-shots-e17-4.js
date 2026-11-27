// E17 STOP 4 (never in a sweep; not a check): 06 Write with book parts, next to designs 79 (the list and the
// Add menu), 80 (Dedication, empty), 80c (Epigraph, empty) and 81 (review request page), at 1440 and 900,
// real fonts, the panel hidden. Mock data: the chair yoga book with Dedication, About the author (Draft),
// the review request page and Also by (1 book) on, as the designs' example state.
// Built images and the side-by-side sheets go to docs/reviews/e17-stop4/.
// Run: tests/browser/run.sh write t-shots-e17-4.js
globalThis.__withFonts = true;
globalThis.__panelFresh = true;
const test = async page => {
  const log = globalThis.__log = [];
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const OUT = SHOTS.replace(/tests\/browser\/shots\/write$/, 'docs/reviews/e17-stop4');
  const REL = 'docs/reviews/e17-stop4';
  const base = 'http://127.0.0.1:5500';
  globalThis.__modes.parts = 1;
  const part = (k) => st.partOf(W1, k);
  for (const k of ['dedication', 'about_author', 'review_request', 'also_by']) part(k).enabled = true;
  st.parts.versions.push({ id: '8a000000-0000-4000-8000-000000000001', part_id: part('about_author').id, version_no: 1, content: 'Nora Hale teaches chair yoga.', word_count: 5, source: 'manual', label: null, partial: false, created_at: new Date().toISOString() });
  part('about_author').current_version_id = '8a000000-0000-4000-8000-000000000001';
  st.parts.alsoBy[W1] = [{ position: 1, book_id: null, title: 'Chair Yoga for Beginners', subtitle: null, valid: true }];
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const open = async (q) => {
    await page.goto(`${base}/app/book.html?id=${W1}&step=6${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor, .wr-fixed', { timeout: 10000 });
    await page.waitForSelector('[data-parts-add]', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(5, 890);
    await page.waitForTimeout(500);
  };
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); return name; };
  await page.evaluate(() => localStorage.setItem('nicheink.write.panel', 'closed')).catch(() => {});

  const built = {};
  for (const w of [1440, 900]) {
    await size(w, 900);
    // 79: a section open, the menu open from the keyboard (focus on its first row).
    await open(`&section=${st.outline[W1][1].sections[0].id}`);
    await page.focus('[data-parts-add]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#wrPartsMenu');
    await page.waitForTimeout(200);
    built[`79-${w}`] = await shot(`built-79-${w}`);
    await page.keyboard.press('Escape');
    // 80: Dedication, empty.
    await open(`&part=${part('dedication').id}`);
    built[`80-${w}`] = await shot(`built-80-${w}`);
    // 81: the review request page.
    await open(`&part=${part('review_request').id}`);
    built[`81-${w}`] = await shot(`built-81-${w}`);
  }
  // 80c: Epigraph on, empty.
  part('epigraph').enabled = true;
  for (const w of [1440, 900]) {
    await size(w, 900);
    await open(`&part=${part('epigraph').id}`);
    built[`80c-${w}`] = await shot(`built-80c-${w}`);
  }

  /** One sheet: the built image on the left, the design PNG on the right, each at its own width. */
  async function compare(name, img, design, title, width) {
    await size(width * 2 + 120, 900);
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}</style>
      <figure style="width:${width}px"><figcaption>BUILT · ${title}</figcaption><img src="${base}/${REL}/${img}.png?${Date.now()}"></figure>
      <figure style="width:${width}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  const D = { 79: '79-step06-parts-list', 80: '80-step06-part-editor', '80c': '80c-step06-epigraph', 81: '81-step06-review-request' };
  const T = { 79: 'parts list + Add menu', 80: 'Dedication, empty', '80c': 'Epigraph, empty', 81: 'review request page' };
  for (const k of ['79', '80', '80c', '81']) {
    for (const w of [1440, 900]) await compare(`sheet-${k}-${w}`, built[`${k}-${w}`], `${D[k]}-${w}`, `06 ${T[k]}, ${w}`, w);
  }
  return log.join('\n');
};
