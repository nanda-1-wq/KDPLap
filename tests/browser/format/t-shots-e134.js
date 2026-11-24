// E13.3 STOP 4 (never in a sweep; not a check): the Export files panel with the EPUB row next to its
// designs, with the real fonts. 42 (the panel: Print PDF exported, EPUB changed; the states: Print PDF
// exporting, EPUB could not be built) and 42b (the panel with EPUB never exported and the new footer; the
// EPUB row states: current, changed, exporting, failed a check, downloaded but not recorded, blocked), at
// 1440 and 900. Mock data. Built images and compare sheets go to docs/reviews/e13-3-stop4/; the crops
// they are made of go to tests/browser/shots/format/ (ignored).
globalThis.__withFonts = true;
const test = async page => {
  const { log } = FM.log();
  const st = globalThis.__store;
  const OUT = SHOTS.replace(/tests\/browser\/shots\/format$/, 'docs/reviews/e13-3-stop4');
  const REL = 'docs/reviews/e13-3-stop4';
  const panel = '.fmt-exp[open]';
  const size = (w, h) => page.setViewportSize({ width: w, height: h });
  const fonts = async () => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };
  const epubRow = () => page.locator(`${panel} .fmt-exp-row`).nth(1);
  const crop = async (name, loc) => { await fonts(); await loc.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 30000 }); return name; };
  const ago = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const openPanel = async () => {
    await page.click('[data-export]');
    await page.waitForFunction(() => { const r = document.querySelectorAll('.fmt-exp[open] .fmt-exp-row'); return r.length >= 3 && !/Reading the book/.test(r[0].textContent); }, null, { timeout: 15000 });
  };
  const closePanel = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.fmt-exp[open]'), null, { timeout: 5000 }); };
  const fresh = async () => { await FM.open(page); await page.waitForSelector('.fmt', { timeout: 10000 }); };
  const epubAt = (key, days = 3) => ({ id: 'e0000000-0000-4000-8000-0000000000e1', created_at: ago(days), settings_key: key, engine: 'epub3 · e1', parts: {}, snapshot: {} });
  const textOf = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

  /** One sheet: the built images (rows) on the left, the design PNG on the right, each at its own width. */
  async function compare(name, rows, design, title, width, designWidth = width) {
    const base = 'http://127.0.0.1:5500';
    await size(width + designWidth + 120, 900);
    await page.goto(`${base}/robots.txt`);
    const src = (b) => `${base}/tests/browser/shots/format/${b}.png`;
    const rowsHtml = rows.map((row) => `<div class="row">${row.map((b) => `<img src="${src(b)}">`).join('')}</div>`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:20px;background:#fff;font:600 22px system-ui,sans-serif;color:#1C1C1A;display:flex;gap:40px;align-items:flex-start}
      figure{margin:0}figcaption{padding:0 0 12px}img{display:block;max-width:100%;border:1px solid #B8B8B3}
      .sheet{display:flex;flex-direction:column;gap:20px;padding:20px;background:#F3F3F1;border:1px solid #B8B8B3}
      .row{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.row img{border:none}</style>
      <figure style="width:${width}px"><figcaption>BUILT · ${title}</figcaption><div class="sheet">${rowsHtml}</div></figure>
      <figure style="width:${designWidth}px"><figcaption>DESIGN · ${design}</figcaption><img src="${base}/design/screens/${design}.png"></figure>`);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, timeout: 30000 });
    log.push(`PASS ${REL}/${name}.png`);
  }

  async function states(w) {
    const out = {};
    await size(w, 1100);
    // The Print PDF is exported and current in every 42b image (as the design).
    st.lastPdf = { created_at: ago(3), page_count: 48 };
    st.changed = false;

    /* 42b panel: EPUB never exported, the two footer lines. */
    st.lastEpub = null;
    await fresh();
    await openPanel();
    out.panelNever = await crop(`b42b-panel-never-${w}`, page.locator(`${panel} .dialog-inner`));
    await closePanel();

    /* Current. */
    st.lastEpub = epubAt(st.epubKey());
    await fresh();
    await openPanel();
    out.current = await crop(`b42b-current-${w}`, epubRow());

    /* Changed (the chapter label changed after the export) and the 42 panel with it. */
    await closePanel();
    st.lastEpub = epubAt('0'.repeat(32));
    await fresh();
    await openPanel();
    out.changed = await crop(`b42b-changed-${w}`, epubRow());
    out.panel42 = await crop(`b42-panel-${w}`, page.locator(`${panel} .dialog-inner`));

    /* Exporting (held at the record step), and the Print PDF exporting (42). */
    globalThis.__modes.recordSlow = 4000;
    await page.click(`${panel} [data-epub]`);
    await page.waitForFunction(() => /Saving the export…/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
    out.exporting = await crop(`b42b-exporting-${w}`, epubRow());
    out.exportingHint = await crop(`b42b-exporting-panel-${w}`, page.locator(`${panel} .dialog-inner`));
    await page.click(`${panel} [data-cancel]`);
    await page.waitForTimeout(4300);
    await page.click(`${panel} [data-pdf]`);
    await page.waitForFunction(() => /Saving the export…/.test(document.querySelector('.fmt-exp[open] .fmt-exp-row').textContent), null, { timeout: 60000 });
    out.pdfExporting = await crop(`b42-pdf-exporting-${w}`, page.locator(`${panel} .fmt-exp-row`).first());
    await page.click(`${panel} [data-cancel]`);
    globalThis.__modes.recordSlow = 0;
    await page.waitForTimeout(4300);

    /* Failed a check (Contents). */
    await page.evaluate(() => { window.__echecks = kdpEpubCheck.checks; kdpEpubCheck.checks = () => [{ key: 'structure', name: 'File structure', pass: true }, { key: 'contents', name: 'Contents', pass: false }, { key: 'details', name: 'Book details', pass: true }]; });
    await page.click(`${panel} [data-epub]`);
    await page.waitForFunction(() => /failed a check/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
    out.check = await crop(`b42b-check-${w}`, epubRow());
    await page.evaluate(() => { kdpEpubCheck.checks = window.__echecks; });

    /* Could not be built (42). */
    await page.evaluate(() => { window.__emake = kdpEpub.make; kdpEpub.make = () => { throw new Error('shots'); }; });
    await page.click(`${panel} [data-epub]`);
    await page.waitForFunction(() => /could not be built/.test(document.querySelectorAll('.fmt-exp[open] .fmt-exp-row')[1].textContent), null, { timeout: 10000 });
    out.built = await crop(`b42-epub-error-${w}`, epubRow());
    await page.evaluate(() => { kdpEpub.make = window.__emake; });

    /* Downloaded, record failed. */
    globalThis.__modes.recordFail = 1;
    await page.click(`${panel} [data-epub]`);
    await page.waitForSelector(`${panel} [data-epub-record]`, { timeout: 10000 });
    out.record = await crop(`b42b-record-${w}`, epubRow());
    await closePanel();

    /* Blocked: nothing Final. */
    const sts = st.sections().map((x) => x.status);
    st.sections().forEach((x) => { x.status = 'draft'; });
    await fresh();
    await openPanel();
    out.blocked = await crop(`b42b-blocked-${w}`, epubRow());
    log.push(`PASS blocked row at ${w}: ${await textOf(epubRow())}`);
    await closePanel();
    st.sections().forEach((x, i) => { x.status = sts[i]; });
    return out;
  }

  const a = await states(1440);
  const b = await states(900);

  /* The sheets. */
  await compare('42-compare-1440', [[a.panel42], [a.pdfExporting], [a.built]], '42-step08-export-panel', '42 the panel (Print PDF exported, EPUB changed: G2 words); Print PDF exporting; EPUB could not be built (1440)', 760, 1440);
  await compare('42b-compare-1440', [[a.panelNever], [a.current], [a.changed], [a.exporting], [a.exportingHint], [a.check], [a.record], [a.blocked]], '42b-step08-epub-states-1440', '42b the panel (EPUB never exported, the new footer); current; changed; exporting; the panel while exporting; failed a check; record failed; blocked (1440)', 760, 1440);
  await compare('42b-compare-900', [[b.panelNever], [b.current], [b.changed], [b.exporting], [b.check], [b.record], [b.blocked]], '42b-step08-epub-states-900', '42b at 900: the same states', 760, 900);
  await compare('42-compare-900', [[b.panel42], [b.pdfExporting], [b.built]], '42-step08-export-panel', '42 at 900 (the design is drawn at 1440 only)', 760, 1440);
  return log.join('\n');
};
