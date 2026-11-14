// node tests/browser/cover/t-safari-real.mjs   (from the repo root; real Safari through safaridriver; real CDNs)
// 09 Cover, E16 Part 2: the cover engine in Safari (plan R5, R6, R4, R10), on the owner's Mac.
//   1. Canvas: the largest area Safari paints (R5); the full image JPG at the largest size
//      (8.5 × 11, 828 pages, cream: 5,796 × 3,375) and the PNG writer at the same size.
//   2. Print PDFs: Band 6 × 9, Picture full 8.5 × 11, the effects and pictures sheets: every export
//      check; Kindle JPG read back (Safari JPEGs carry no ICC: jpegColor passes "no profile").
//   3. The PDF drawn by pdf.js against Safari's renderer (mean, p99).
//   4. Our own pixel filters (R6): the pictures sheet's patch colors equal Chrome's within a few levels
//      (compared through the round-trip numbers, both near the renderer).
//   5. The 49 design-font faces: Typst width = Safari's measureText within 0.5% (R4).
//   6. The 288 layout cases + 24 Blank with Safari's real metrics.
// Results: $COVER_OUT/safari-real.json. Exit 1 on a failed check.
import { coverSafari, ensureServer, save, log } from './lib.mjs';

let pass = 0;
const fails = [];
const expect = (ok, what) => { if (ok) pass++; else fails.push(what); return ok; };
const R = { date: new Date().toISOString() };
await ensureServer();
const s = await coverSafari();
R.safari = s.version;
try {
  log('Safari', s.version);
  expect(await s.open(), 'the cover engine page opens');
  log('1. canvas');
  R.limit = await s.run('return await kdpCoverHarness.canvasLimit();');
  expect(R.limit.full85x11, 'Safari paints a 5355 × 3375 canvas');
  R.largest = await s.run(`
    const H = kdpCoverHarness, cover = H.cover({ layout: 'picfull', fmt: { trim: '8.5x11', pages: 828, paper: 'cream' } });
    const out = {};
    try { out.jpg = await H.image(cover, 'jpg'); } catch (e) { out.jpg = { error: e.message }; }
    try { out.png = await H.image(cover, 'png'); } catch (e) { out.png = { error: e.message }; }
    return out;`);
  expect(!R.largest.jpg.error && R.largest.jpg.w === 5796 && R.largest.jpg.h === 3375 && R.largest.jpg.sniff.type === 'image/jpeg', `largest JPG: ${JSON.stringify(R.largest.jpg).slice(0, 200)}`);
  expect(!R.largest.png.error && R.largest.png.w === 5796 && R.largest.png.sniff.type === 'image/png', `largest PNG: ${JSON.stringify(R.largest.png).slice(0, 200)}`);
  log('2–4. print, Kindle, round trip');
  R.covers = [];
  for (const spec of [{ layout: 'band', fmt: { trim: '6x9', pages: 54, paper: 'white' } }, { layout: 'picfull', fmt: { trim: '8.5x11', pages: 54, paper: 'white' } }, { sheet: 'effects' }, { sheet: 'photos' }, { sheet: 'shapes' }]) {
    const r = await s.run(`
      const [spec] = a;
      const H = kdpCoverHarness, cover = H.cover(spec);
      const p = await H.print(cover, { keep: true });
      const k = await H.kindle(cover);
      const rt = await H.roundTrip(H.fromB64(p.pdf), cover, 100);
      delete p.pdf; delete p.mainTyp;
      return { p, k, rt };`, [spec]);
    const id = spec.sheet || `${spec.layout} ${spec.fmt.trim}`;
    if (!expect(!r.error, `${id}: ${r.error}`)) continue;
    for (const ch of r.p.checks) expect(ch.pass, `${id}: ${ch.key} ${ch.detail}`);
    expect(r.k.color.ok && r.k.w === 1600 && r.k.h === 2560, `${id}: Kindle ${r.k.color.why}`);
    expect(r.rt.mean < 3 && r.rt.over64 < 0.01, `${id}: pdf vs renderer mean ${r.rt.mean.toFixed(2)}, over 64 ${(r.rt.over64 * 100).toFixed(2)}%`);
    R.covers.push({ id, ms: r.p.ms, bytes: r.p.bytes, path: r.p.path, patches: r.p.patches.length, patchIcc: [...new Set(r.p.patches.map((x) => x.color))], kindleIcc: r.k.color.icc ? r.k.color.icc.desc : 'none', kindleMs: Math.round(r.k.ms), rt: r.rt, worst: (r.p.checks.find((x) => x.key === 'widths') || {}).worst });
  }
  log('5. design faces');
  R.sweep = await s.run(`
    const D = ['Source Serif 4', 'EB Garamond', 'Lora', 'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Roboto Slab', 'IBM Plex Sans', 'Inter', 'Montserrat', 'Poppins', 'Raleway', 'Oswald', 'Bebas Neue', 'Abril Fatface', 'Anton', 'Pacifico', 'Dancing Script', 'Great Vibes', 'Space Mono'];
    const idx = []; let n = 0;
    kdpCover.fontCatalog.forEach((r) => Object.keys(r[4]).forEach(() => { if (D.includes(r[0])) idx.push(n); n++; }));
    const out = [];
    for (const i of idx) out.push(...await kdpCoverHarness.fontSweep(i, i + 1));
    return out;`);
  for (const f of R.sweep) {
    if (f.extra || f.stray) { expect(false, `sweep: ${JSON.stringify(f)}`); continue; }
    expect(f.embedded && !f.warn.length && f.diff != null && f.diff <= 0.005, `${f.family} ${f.weight}: embedded ${f.embedded}, diff ${f.diff}`);
  }
  R.sweepWorst = Math.max(...R.sweep.filter((f) => f.diff != null).map((f) => f.diff));
  log('6. 288 + 24 with real metrics');
  const m = await s.run('return await kdpCoverHarness.metrics288();');
  expect(m.cases.length === 288, `288 cases (${m.cases.length})`);
  R.metrics = { realProblems: m.cases.filter((x) => x.real.length).map((x) => ({ key: x.key, trim: x.trim, pages: x.pages, paper: x.paper, problems: x.real })),
    maxDy: Math.max(...m.cases.map((x) => x.dy)), linesChanged: [...new Set(m.cases.flatMap((x) => x.linesChanged.map((y) => `${x.key}: ${y}`)))] };
  for (const b of m.blank) expect(b.errors === 'C1 C1 C1' && b.warns === 0, `Blank ${b.trim} ${b.pages} ${b.paper}`);
} catch (e) {
  fails.push(`ERR ${e.message}`);
} finally {
  await s.close();
}
R.pass = pass; R.fails = fails;
const file = save('safari-real.json', R);
for (const f of fails) console.log('FAIL', f);
log(`${fails.length ? 'FAIL' : 'PASS'} ${pass} passed, ${fails.length} failed`, file);
process.exit(fails.length ? 1 : 0);
