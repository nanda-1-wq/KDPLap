// node tests/browser/cover/t-engine-real.mjs [--quick]   (from the repo root; Chrome; CDN files from the test cache)
// 09 Cover, E16 Part 2: the cover engine for real (plan §1, §5, §8; risks R4, R5, R7, R9, R10).
//   A. 13 layouts × 6 trims × 2 papers (120 pages): Print PDF + its 11 export checks
//      (coverChecks, every letter in its font, line widths within 0.5%, the chosen faces only,
//      no font warning); the Kindle JPG (1600 × 2560, cut or kFit, jpegColor); Blank has no
//      text, so "Fonts embedded" fails by design (C1 blocks its export in the app).
//   B. Full image: PNG for every layout at 6 × 9 and 8.5 × 11; JPG at the largest size
//      (8.5 × 11, 828 pages, cream: 5,796 × 3,375 px); sizes = the 300 DPI wrap rounded up (D16).
//   C. The QA sheets (effects, pictures, shapes, spine): checks, the PDF drawn by pdf.js
//      against the renderer (mean and p99 difference), the step at patch edges.
//   D. The 288 layout cases and 24 Blank cases with real font metrics; spine text sizes.
//   E. Every catalog face: embedded as itself, no warning, Typst width = canvas width (0.5%).
//      (--quick: the 49 design-font faces only.)
//   F. Engine numbers: first build with a new font set (a fresh compiler, R9) and again;
//      the canvas area Chrome paints (R5).
// Results: $COVER_OUT/engine-real.json (default tests/browser/cover/out). Exit 1 on a failed check.
import { coverChrome, ensureServer, save, log, median } from './lib.mjs';

const quick = process.argv.includes('--quick');
let pass = 0;
const fails = [];
const expect = (ok, what) => { if (ok) pass++; else fails.push(what); return ok; };
const R = { date: new Date().toISOString() };
const TRIMS = ['5x8', '5.25x8', '5.5x8.5', '6x9', '8x10', '8.5x11'];
const PAPERS = ['white', 'cream'];
const KEYS = ['blank', 'band', 'center', 'stack', 'corner', 'picfull', 'picband', 'framed', 'arch', 'circle', 'stripes', 'ribbon', 'bold'];
const WRAP_IN = (trim, pages, paper) => { const [w, h] = trim.split('x').map(Number); const sp = pages * (paper === 'cream' ? 0.0025 : 0.002252); return { w: 0.25 + 2 * w + sp, h: h + 0.25 }; };

await ensureServer();
let c = await coverChrome();
R.chrome = c.version;
try {
  await c.open();
  /* ── A ── */
  log('A. 13 layouts × 6 trims × 2 papers');
  R.layouts = [];
  for (const key of KEYS) for (const trim of TRIMS) for (const paper of PAPERS) {
    const fmt = { trim, pages: 120, paper };
    const r = await c.page.evaluate(async ({ key, fmt }) => {
      const H = kdpCoverHarness, cover = H.cover({ layout: key, fmt });
      try { return { p: await H.print(cover), k: await H.kindle(cover) }; } catch (e) { return { error: e.message }; }
    }, { key, fmt });
    const id = `${key} ${trim} ${paper}`;
    if (!expect(!r.error, `${id}: ${r.error}`)) continue;
    for (const ch of r.p.checks) {
      if (key === 'blank' && ch.key === 'fonts') { expect(!ch.pass, `${id}: Blank has no fonts (expected)`); continue; }
      if (key === 'blank' && (ch.key === 'faces')) continue;
      expect(ch.pass, `${id}: ${ch.key} ${ch.detail}`);
    }
    const kfit = trim === '8x10' || trim === '8.5x11';
    expect(r.k.w === 1600 && r.k.h === 2560 && r.k.size.w === 1600 && r.k.size.h === 2560, `${id}: Kindle size`);
    expect(r.k.mode === (kfit ? 'fit' : 'cut'), `${id}: Kindle mode ${r.k.mode}`);
    expect(r.k.color.ok, `${id}: Kindle color ${r.k.color.why}`);
    R.layouts.push({ key, trim, paper, bytes: r.p.bytes, ms: Math.round(r.p.ms.total), patches: r.p.patches.length, patchBytes: r.p.patches.reduce((n, p) => n + p.bytes, 0),
      worst: (r.p.checks.find((x) => x.key === 'widths') || {}).worst, fonts: r.p.fonts.length, kindleMs: Math.round(r.k.ms), kindleBytes: r.k.bytes, kindleIcc: r.k.color.icc ? r.k.color.icc.desc : null });
  }
  R.layoutSummary = { cases: R.layouts.length, medianMs: median(R.layouts.map((x) => x.ms)), maxMs: Math.max(...R.layouts.map((x) => x.ms)), maxBytes: Math.max(...R.layouts.map((x) => x.bytes)),
    worstWidth: Math.max(...R.layouts.map((x) => x.worst || 0)), kindleIcc: [...new Set(R.layouts.map((x) => x.kindleIcc))] };

  /* ── B ── */
  log('B. full images');
  R.images = [];
  for (const key of KEYS) for (const trim of ['6x9', '8.5x11']) {
    const r = await c.page.evaluate(async ({ key, trim }) => {
      const H = kdpCoverHarness, cover = H.cover({ layout: key, fmt: { trim, pages: 120, paper: 'white' } });
      try { return await H.image(cover, 'png'); } catch (e) { return { error: e.message }; }
    }, { key, trim });
    const want = WRAP_IN(trim, 120, 'white');
    const W = Math.ceil(want.w * 300 - 1e-6), Hh = Math.ceil(want.h * 300 - 1e-6);
    if (!expect(!r.error, `PNG ${key} ${trim}: ${r.error}`)) continue;
    expect(r.sniff.type === 'image/png' && r.sniff.w === r.w && r.sniff.h === r.h, `PNG ${key} ${trim}: header`);
    expect(Math.abs(r.w - W) <= 1 && Math.abs(r.h - Hh) <= 1, `PNG ${key} ${trim}: ${r.w}×${r.h} vs ${W}×${Hh}`);
    R.images.push({ key, trim, w: r.w, h: r.h, ms: Math.round(r.ms), bytes: r.bytes });
  }
  const big = await c.page.evaluate(async () => {
    const H = kdpCoverHarness, cover = H.cover({ layout: 'picfull', fmt: { trim: '8.5x11', pages: 828, paper: 'cream' } });
    try { const j = await H.image(cover, 'jpg'); const p = await H.image(cover, 'png'); return { j, p }; } catch (e) { return { error: e.message }; }
  });
  if (expect(!big.error, `largest image: ${big.error}`)) {
    const L = WRAP_IN('8.5x11', 828, 'cream'), LW = Math.ceil(L.w * 300 - 1e-6), LH = Math.ceil(L.h * 300 - 1e-6);   // 19.32 × 11.25 in
    expect(big.j.sniff.type === 'image/jpeg' && big.j.w === LW && big.j.h === LH, `largest JPG ${big.j.w}×${big.j.h} vs ${LW}×${LH}`);
    expect(big.p.sniff.type === 'image/png' && big.p.w === LW && big.p.h === LH, `largest PNG ${big.p.w}×${big.p.h} vs ${LW}×${LH}`);
    R.largest = { jpg: { w: big.j.w, h: big.j.h, ms: Math.round(big.j.ms), bytes: big.j.bytes }, png: { ms: Math.round(big.p.ms), bytes: big.p.bytes } };
  }

  /* ── C ── */
  log('C. QA sheets');
  R.sheets = [];
  for (const sheet of ['effects', 'photos', 'shapes', 'spine']) {
    const r = await c.page.evaluate(async (sheet) => {
      const H = kdpCoverHarness, cover = H.cover({ sheet });
      const p = await H.print(cover, { keep: true });
      const pdf = H.fromB64(p.pdf);
      const rt = await H.roundTrip(pdf, cover, 100);
      const seams = await H.seams(pdf, cover, H.last);
      delete p.pdf; delete p.mainTyp;
      return { p, rt, seams };
    }, sheet);
    for (const ch of r.p.checks) expect(ch.pass, `${sheet}: ${ch.key} ${ch.detail}`);
    expect(r.rt.mean < 3, `${sheet}: pdf vs renderer mean ${r.rt.mean.toFixed(2)}`);
    expect(r.rt.over64 < 0.01, `${sheet}: pdf vs renderer, pixels over 64: ${(r.rt.over64 * 100).toFixed(2)}%`);
    R.sheets.push({ sheet, plan: r.p.plan, patches: r.p.patches, bytes: r.p.bytes, ms: r.p.ms, rt: r.rt, seams: r.seams });
  }

  /* ── D ── */
  log('D. 288 + 24 cases with real metrics');
  const m = await c.page.evaluate(() => kdpCoverHarness.metrics288());
  const real = m.cases.filter((x) => x.real.length), stubBad = m.cases.filter((x) => x.stub.length);
  expect(m.cases.length === 288, `288 cases (${m.cases.length})`);
  expect(stubBad.length === 0, `stub: ${stubBad.length} cases with a problem`);
  // Reported, not tuned (advisor, plan §11): a real-metrics problem is a STOP 2 finding.
  R.metrics = { cases: m.cases.length, realProblems: real.map((x) => ({ key: x.key, trim: x.trim, pages: x.pages, paper: x.paper, problems: x.real })),
    maxDy: Math.max(...m.cases.map((x) => x.dy)), linesChanged: [...new Set(m.cases.flatMap((x) => x.linesChanged.map((y) => `${x.key}: ${y}`)))],
    blank: m.blank, spine: m.spine, caps: m.caps };
  for (const b of m.blank) expect(b.errors === 'C1 C1 C1' && b.warns === 0, `Blank ${b.trim} ${b.pages} ${b.paper}: ${b.errors}`);

  /* ── E ── */
  log('E. catalog faces');
  R.sweep = [];
  const total = await c.page.evaluate(() => kdpCover.fontCatalog.reduce((n, r) => n + Object.keys(r[4]).length, 0));
  const design = await c.page.evaluate(() => {
    const D = ['Source Serif 4', 'EB Garamond', 'Lora', 'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Roboto Slab', 'IBM Plex Sans', 'Inter', 'Montserrat', 'Poppins', 'Raleway', 'Oswald', 'Bebas Neue', 'Abril Fatface', 'Anton', 'Pacifico', 'Dancing Script', 'Great Vibes', 'Space Mono'];
    const idx = []; let n = 0;
    kdpCover.fontCatalog.forEach((r) => Object.keys(r[4]).forEach(() => { if (D.includes(r[0])) idx.push(n); n++; }));
    return idx;
  });
  const ranges = quick ? design.map((i) => [i, i + 1]) : Array.from({ length: Math.ceil(total / 120) }, (_, k) => [k * 120, Math.min(total, (k + 1) * 120)]);
  for (const [a, b] of ranges) {
    if (!quick) { await c.close(); c = await coverChrome(); await c.open(); }   // a fresh page per 120 faces (memory)
    const out = await c.page.evaluate(({ a, b }) => kdpCoverHarness.fontSweep(a, b), { a, b });
    R.sweep.push(...out);
  }
  for (const f of R.sweep) {
    if (f.extra) { expect(false, `sweep batch ${f.batch}: other fonts in the file: ${f.extra.join(', ')}`); continue; }
    if (f.stray) { expect(false, `sweep batch ${f.batch}: warnings ${f.stray.join('; ')}`); continue; }
    const id = `${f.family} ${f.weight}`;
    if (!expect(!f.error, `${id}: ${f.error}`)) continue;
    expect(f.embedded, `${id}: ${f.ps} not embedded`);
    expect(!f.warn.length, `${id}: ${f.warn.join('; ')}`);
    expect(f.diff != null && f.diff <= 0.005, `${id}: Typst ${f.typstW} vs canvas ${f.canvasW}`);
  }
  R.sweepSummary = { faces: R.sweep.filter((f) => f.family).length, worst: Math.max(...R.sweep.filter((f) => f.diff != null).map((f) => f.diff)) };

  /* ── F ── */
  log('F. engine numbers, canvas limit');
  if (!quick) { await c.close(); c = await coverChrome(); await c.open(); }
  R.engine = await c.page.evaluate(async () => {
    const H = kdpCoverHarness;
    const t = async (spec) => { const cover = H.cover(spec); const t0 = performance.now(); const p = await H.print(cover); return { ms: Math.round(performance.now() - t0), engine: Math.round(p.ms.engine), fonts: p.fonts.length }; };
    const first = await t({ layout: 'band', fmt: { trim: '6x9', pages: 120, paper: 'white' } });
    const same = await t({ layout: 'band', fmt: { trim: '6x9', pages: 120, paper: 'white' } });
    const newSet = await t({ sheet: 'effects' });
    const back = await t({ layout: 'band', fmt: { trim: '6x9', pages: 120, paper: 'white' } });
    return { first, same, newSet, back, limit: await H.canvasLimit() };
  });
  expect(R.engine.limit.full85x11, 'Chrome paints a 5355 × 3375 canvas');
  expect(R.engine.limit.squareArea >= 5796 * 3375, 'Chrome paints the largest full image (5,796 × 3,375)');
} catch (e) {
  fails.push(`ERR ${e.message}`);
} finally {
  await c.close();
}
R.pass = pass; R.fails = fails;
const file = save('engine-real.json', R);
for (const f of fails) console.log('FAIL', f);
log(`${fails.length ? 'FAIL' : 'PASS'} ${pass} passed, ${fails.length} failed`, file);
process.exit(fails.length ? 1 : 0);
