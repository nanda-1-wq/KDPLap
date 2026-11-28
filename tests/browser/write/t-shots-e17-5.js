// E17 STOP 5 (never in a sweep; not a check): 06 Write next to designs 80b (About the author, copied from
// the pen name, with the "Replace your About the author text?" dialog open), 82 (Also by, one book ticked)
// at 1440 and 900, and the two 06 states of 84 (the pen name has no bio; Also by with no other books).
// Real fonts, the panel hidden. Mock data: the chair yoga book, pen name Nora Hale.
// Built images and the side-by-side sheets go to docs/reviews/e17-stop5/.
// Run: tests/browser/run.sh write t-shots-e17-5.js
globalThis.__withFonts = true;
globalThis.__panelFresh = true;
const test = async page => {
  const log = globalThis.__log = [];
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const OUT = SHOTS.replace(/tests\/browser\/shots\/write$/, 'docs/reviews/e17-stop5');
  const REL = 'docs/reviews/e17-stop5';
  const base = 'http://127.0.0.1:5500';
  globalThis.__modes.parts = 1;
  const part = (k) => st.partOf(W1, k);
  for (const k of ['dedication', 'about_author', 'review_request', 'also_by']) part(k).enabled = true;
  const BIO = 'Nora Hale is a writer who teaches chair yoga to adults over 60. Her focus is on gentle, practical movement for everyday life. She trained as a physical therapy assistant and has led classes at her local community center for twelve years. She lives in Ohio with her two dogs.';
  st.penBio = BIO;
  const A = 'b0b0b0b0-0000-4000-8000-00000000000a';
  st.parts.others[W1] = [{ id: A, title: 'Sleep Better After 60', subtitle: 'Simple Evening Habits for Adults Who Are Tired of Lying Awake' }];
  st.parts.alsoBy[W1] = [{ position: 1, book_id: A, title: 'Sleep Better After 60', subtitle: 'Simple Evening Habits for Adults Who Are Tired of Lying Awake', valid: true }];
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const open = async (q) => {
    await page.goto(`${base}/app/book.html?id=${W1}&step=6${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor, .wr-fixed, .wr-ab', { timeout: 10000 });
    await page.waitForSelector('[data-parts-add]', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(5, 890);
    await page.waitForTimeout(600);
  };
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }); return name; };
  await page.evaluate(() => localStorage.setItem('nicheink.write.panel', 'closed')).catch(() => {});

  const built = {};
  for (const w of [1440, 900]) {
    await size(w, 900);
    // 80b: the first open copies the bio (v1); then "Copy from pen name again" opens the dialog.
    await open(`&part=${part('about_author').id}`);
    await page.waitForFunction(() => document.querySelector('[data-editor]') && document.querySelector('[data-editor]').textContent.includes('Nora Hale'), null, { timeout: 5000 });
    await page.focus('[data-copy-bio]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    await page.waitForTimeout(300);
    built[`80b-${w}`] = await shot(`built-80b-${w}`);
    await page.keyboard.press('Escape');
    // 82: Also by, one book ticked.
    await open(`&part=${part('also_by').id}`);
    built[`82-${w}`] = await shot(`built-82-${w}`);
  }
  // 84: the pen name has no bio (About with no version yet), and Also by with no other books.
  st.penBio = '';
  const ab = part('about_author');
  st.parts.versions = st.parts.versions.filter((v) => v.part_id !== ab.id);
  ab.current_version_id = null;
  delete st.parts.drafts[ab.id];
  st.parts.others[W1] = [];
  st.parts.alsoBy[W1] = [];
  await size(1440, 900);
  await open(`&part=${ab.id}`);
  await page.waitForSelector('[data-no-bio]');
  built['84-nobio'] = await shot('built-84-nobio-1440');
  await open(`&part=${part('also_by').id}`);
  built['84-nobooks'] = await shot('built-84-nobooks-1440');

  /** One sheet: the built image on the left, the design PNG on the right, each at its own width. */
  async function compare(name, img, design, title, width, dWidth = width) {
    await size(width + dWidth + 120, 900);
    await page.goto(`${base}/robots.txt`);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}</style>
      <figure style="width:${width}px"><figcaption>BUILT · ${title}</figcaption><img src="${base}/${REL}/${img}.png?${Date.now()}"></figure>
      <figure style="width:${dWidth}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  for (const w of [1440, 900]) {
    await compare(`sheet-80b-${w}`, built[`80b-${w}`], `80b-step06-about-author-${w}`, `06 About the author, Replace dialog, ${w}`, w);
    await compare(`sheet-82-${w}`, built[`82-${w}`], `82-step06-also-by-${w}`, `06 Also by, ${w}`, w);
  }
  await compare('sheet-84-nobio', built['84-nobio'], '84-step07-parts-states-1440', '06 About the author, pen name has no bio', 1440);
  await compare('sheet-84-nobooks', built['84-nobooks'], '84-step07-parts-states-1440', '06 Also by, no other books', 1440);
  return log.join('\n');
};
