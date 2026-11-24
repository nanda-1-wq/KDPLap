// E13.3 STOP 3 (never in a sweep; not a check): the Kindle preview next to its designs, with the real fonts.
// 41d at 1440 and 900 (the whole 08 screen), every 41e state A to F at 1440 and 900 (the preview column),
// and 41b (the device look). Mock data. Built screens and compare sheets go to docs/reviews/e13-3-stop3/;
// the crops they are made of go to tests/browser/shots/format/ (ignored).
globalThis.__withFonts = true;
const test = async page => {
  const { log, ok } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-3-stop3');
  const REL = 'docs/reviews/e13-3-stop3';
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const fonts = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const f of document.querySelectorAll('.kp-frame')) { try { await f.contentDocument.fonts.ready; } catch (e) { /* loading again */ } }
    });
    await page.waitForTimeout(500);
  };
  const kready = (t = 15000) => page.waitForFunction(() => { const x = window.kdpBookSteps[8]._debug(); return x.kb.state === 'ready' && x.kp && x.kp.state().ready; }, null, { timeout: t });
  const kindle = async () => { await page.click('[data-fmt-mode="kindle"]'); await kready(); await fonts(); };
  const at = async (id, plus = 0) => { await page.evaluate(([i, p]) => { const k = window.kdpBookSteps[8]._debug().kp; k.goTo(k.screenOf(i) + p); }, [id, plus]); await page.waitForTimeout(150); };
  const shot = async (name, full = true) => { await fonts(); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full, timeout: 30000 }); log.push(`PASS ${REL}/${name}.png`); };
  const crop = async (name, sel) => { await fonts(); await (await page.$(sel)).screenshot({ path: `${SHOTS}/${name}.png`, timeout: 30000 }); };
  const holdFirstBuild = () => page.evaluate(() => {
    const c = window.kdpKindlePreview.create;
    window.kdpKindlePreview.create = (h, o) => {
      const k = c(h, o);
      const s = k.show;
      k.show = (...a) => new Promise((r) => { window.__kpRelease = () => r(s(...a)); });
      return k;
    };
  });

  /** One sheet: the built images (rows) on the left, the design PNG on the right, each at its own width. */
  async function compare(name, rows, design, title, width) {
    const base = 'http://127.0.0.1:5500';
    await size(width * 2 + 120, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => (b.startsWith('out:') ? `${base}/${REL}/${b.slice(4)}.png` : `${base}/tests/browser/shots/format/${b}.png`);
    const rowsHtml = rows.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0;width:${width}px}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:24px;padding:20px;background:#F3F3F1;border:1px solid #B8B8B3}
      .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{border:none;max-width:${width - 40}px}</style>
      <figure><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  /* 41d at 1440 and 900: the whole 08 screen in Kindle mode on Chapter 2, as the design. */
  await size(1440, 1151);
  await FM.open(page);
  await kindle();
  await at('c03');
  await shot('41d-built-1440');
  await crop('b41b-device', '.fmt-view');
  await size(900, 1965);
  await page.waitForTimeout(600);
  await kready();
  await at('c03');
  await shot('41d-built-900');

  /* Every 41e state, at 1440 and 900: the preview column (the view, then the Ready box). */
  const states = {};
  for (const W of [1440, 900]) {
    const H = W === 1440 ? 1400 : 1700;
    const sel = W === 1440 ? '.fmt-preview' : '.fmt-view';
    const names = [];
    const take = async (n, s = sel) => { const nm = `e${n}-${W}`; await crop(nm, s); names.push(nm); };

    // A: building (first open), the skeleton and the quiet line.
    await size(W, H);
    await FM.open(page);
    await holdFirstBuild();
    await page.click('[data-fmt-mode="kindle"]');
    await page.waitForFunction(() => typeof window.__kpRelease === 'function', null, { timeout: 5000 });
    await take('A');
    await page.evaluate(() => window.__kpRelease());
    await kready();

    // B: the error box with Try again.
    await page.evaluate(() => { window.kdpEpub.build = () => { throw new Error('mock: build failed'); }; });
    await page.click('.fmt-style:has(input[value="warm"])');
    await page.waitForSelector('[data-kp-msg].is-danger:not([hidden])', { timeout: 5000 });
    await page.mouse.move(0, 0);
    await take('B');
    await FM.saved(page);
    st.format.style = 'classic';   // the Warm click was saved: the next width starts from Classic again

    // C: nothing Final.
    for (const s of st.sections()) s.status = 'draft';
    await FM.open(page);
    await page.click('[data-fmt-mode="kindle"]');
    await page.waitForSelector('[data-kp-msg]:not([hidden])', { timeout: 5000 });
    await take('C');
    for (const s of st.sections()) s.status = 'final';

    // D: a trim outside the print list (7 x 10): Kindle works.
    st.brief.trim_size = '7x10';
    await FM.open(page);
    await kindle();
    await at('c02');
    await take('D');
    st.brief.trim_size = '6x9';

    // E: the warning lines (not Final, needs review, no pen name, a store link), then the green box.
    const keep = { pen: st.book.pen_name, a: st.chapters[1].sections[1].status, b: st.chapters[2].sections[0].status, c: st.chapters[3].sections[0].needs_review, d: st.chapters[3].sections[1].version.content };
    st.chapters[1].sections[1].status = 'draft';
    st.chapters[2].sections[0].status = 'reviewed';
    st.chapters[3].sections[0].needs_review = true;
    st.book.pen_name = '';
    st.chapters[3].sections[1].version.content += '\n\nAlso on [Kobo](https://www.kobo.com/us/en/ebook/micro-study).';
    await FM.open(page);
    await kindle();
    await take('E-warn', '[data-fmt-ready]');
    st.chapters[1].sections[1].status = keep.a;
    st.chapters[2].sections[0].status = keep.b;
    st.chapters[3].sections[0].needs_review = keep.c;
    st.book.pen_name = keep.pen;
    st.chapters[3].sections[1].version.content = keep.d;
    await FM.open(page);
    await kindle();
    await take('E-ok', '[data-fmt-ready]');

    // F: Full screen, Large, on a screen with a section heading.
    await size(W, 1000);
    await page.waitForTimeout(400);
    await kready();
    await at('c03', 1);
    await page.focus('[data-fmt-full]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.kp-full[open]', { timeout: 5000 });
    await page.waitForFunction(() => { const f = document.querySelector('dialog.kp-full .kp-frame'); const dd = f && f.contentDocument; return dd && dd.readyState === 'complete' && dd.getElementById('kp-reader'); }, null, { timeout: 5000 });
    await kready();
    await page.click('dialog.kp-full [data-kp-size="l"]');
    await page.focus('dialog.kp-full [data-full-close]');
    await fonts();
    await page.screenshot({ path: `${SHOTS}/eF-${W}.png`, timeout: 30000 });
    names.push(`eF-${W}`);
    await page.keyboard.press('Escape');
    states[W] = names;
  }

  /* The sheets. */
  await compare('41d-compare-1440', [['out:41d-built-1440']], '41d-step08-kindle-live-1440', '08 Kindle mode at 1440 (Chapter 2)', 1440);
  await compare('41d-compare-900', [['out:41d-built-900']], '41d-step08-kindle-live-900', '08 Kindle mode at 900 (Chapter 2)', 900);
  const s14 = states[1440], s9 = states[900];
  await compare('41e-compare-1440', [[s14[0], s14[1]], [s14[2], s14[3]], [s14[4], s14[5]], [s14[6]]], '41e-step08-kindle-states-1440', '41e A building, B error, C nothing Final, D 7 x 10, E warnings and green, F Full screen (1440)', 1440);
  await compare('41e-compare-900', [[s9[0]], [s9[1]], [s9[2]], [s9[3]], [s9[4], s9[5]], [s9[6]]], '41e-step08-kindle-states-900', '41e A to F at 900', 900);
  await compare('41b-compare', [['b41b-device']], '41b-step08-kindle-preview', 'the device in the preview column (41b A)', 1440);
  ok(true, `images in ${REL} (the 41e crops are in tests/browser/shots/format/e*-1440.png and e*-900.png)`);
  if (st.calls.some((c) => String(c).startsWith('ERR'))) log.push('FAIL mock error: ' + st.calls.filter((c) => String(c).startsWith('ERR')).join(' | '));
  return log.join('\n');
};
