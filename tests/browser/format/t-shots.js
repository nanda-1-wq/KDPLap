// Standing rule (plan §6, E14 §8.5): each design next to the built page at 1440 px, plus the
// built page at 900 px. Part 2: 41 (settings column), 43 (Also by, trim warning), 51b (rail on 08).
// Files go to docs/reviews/e13-2-stop2/. Mock data only: no live sign-in.
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-2-stop2');
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const ready = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300); };
  const shot = async (name, dir = SHOTS, full = true) => { await ready(); await page.screenshot({ path: `${dir}/${name}.png`, fullPage: full, timeout: 20000 }); };
  // A dialog crop: the backdrop off for the picture only, so its rounded corners show the sheet.
  const crop = async (name, sel) => {
    await ready();
    const tag = await page.addStyleTag({ content: 'dialog::backdrop{background:transparent!important}' });
    await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 20000, omitBackground: true });
    await tag.evaluate((t) => t.remove());
  };

  /** One image: built left (one or more pictures in a row), design right, both labeled. */
  async function compare(name, built, design, title) {
    const base = 'http://127.0.0.1:5500';
    await size(2960, 900);
    await page.goto(`${base}/robots.txt`);
    const imgs = [].concat(built).map((b) => `<img src="${base}/tests/browser/shots/format/${b}.png">`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:1440px}figcaption{padding:0 0 12px}img{display:block;max-width:1440px;border:1px solid #B8B8B3}
      .row{display:flex;gap:24px;align-items:flex-start;padding:40px;background:#F3F3F1;border:1px solid #B8B8B3}.row img{border:none}</style>
      <figure><figcaption>BUILT · ${title}</figcaption>${[].concat(built).length > 1 ? `<div class="row">${imgs}</div>` : imgs}</figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 20000 });
    log.push(`PASS ${name}.png`);
  }

  /* The design's book: Classic, Contents on, About the author on, a header title. */
  await size(1440, 1100);
  await FM.open(page);
  st.format.parts.about = true;
  st.format.header_title = 'Micro Study Habits';
  await FM.open(page);
  await shot('b41', SHOTS, false);
  await compare('41-format-compare', 'b41', '41-step08-format', '08 Format, settings column (preview comes in Part 3)');
  await size(900, 900);
  await FM.open(page);
  await shot('41-format-900', OUT);

  /* 51b: the rail on 08 at the design's size. */
  await size(1440, 820);
  await FM.open(page);
  await shot('b51b', SHOTS, false);
  await compare('51b-rail-compare', 'b51b', '51b-shell-rail', 'rail on 08');

  /* 43: Also by (one book, status from Books) and the trim warning (a Print PDF exists). */
  st.candidates = st.candidates.slice(0, 1);
  st.lastPdf = { created_at: new Date().toISOString(), page_count: 48 };
  await size(1440, 1100);
  await FM.open(page);
  await page.click('[data-fmt-alsoby]');
  await page.waitForSelector('dialog.fmt-dialog[open]');
  await page.waitForFunction(() => document.querySelector('[data-fmt-status]').textContent !== '', null, { timeout: 3000 });
  await crop('b43a', 'dialog.fmt-dialog[open]');
  await size(900, 900);
  await shot('43-also-by-900', OUT, false);
  await page.keyboard.press('Escape');
  await size(1440, 1100);
  await page.selectOption('[data-fmt-trim]', '5.5x8.5');
  await page.waitForSelector('dialog.fmt-dialog[open]');
  await crop('b43b', 'dialog.fmt-dialog[open]');
  await size(900, 900);
  await shot('43-trim-900', OUT, false);
  await page.keyboard.press('Escape');
  await compare('43-dialogs-compare', ['b43a', 'b43b'], '43-step08-dialogs', 'Also by, trim warning (the blurb dialog is 09 Cover, E15)');

  ok(true, `images in ${OUT.replace(/^.*KDPLap\//, '')}`);
  if (st.calls.some((c) => c.startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => c.startsWith('ERR')).join(' | '));
  return log.join('\n');
};
