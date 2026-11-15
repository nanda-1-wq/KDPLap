// node tests/browser/cover/t-icons-real.mjs   (from the repo root; Chrome; CDN files from the test cache)
// 09 Cover, E16 Part 5 (plan §8, owner Q-4): the Tabler filled icons for real.
//   A. Every icon in js/cover/icon-set.js, drawn our way (kdpCover.shapes.iconPaths: arcs as cubics,
//      each path filled on its own, non-zero, as render.js does) and the Tabler way (the browser
//      drawing Tabler's own SVG with those path strings), at 96 × 96 and stretched to 144 × 64:
//      the coverage must match (mean difference under 1 of 255, under 0.2 % of pixels off by more than 64).
//   B. The icons sheet (tests/fixtures/cover-qa.js) as a Print PDF: the export checks, and the PDF drawn
//      by pdf.js against our renderer (as t-engine-real.mjs C).
// Results: $COVER_OUT/icons-real.json (default tests/browser/cover/out). Exit 1 on a failed check.
import { coverChrome, ensureServer, save, log } from './lib.mjs';

let pass = 0;
const fails = [];
const expect = (ok, what) => { if (ok) pass++; else fails.push(what); return ok; };
const R = { date: new Date().toISOString() };

await ensureServer();
const c = await coverChrome();
R.chrome = c.version;
try {
  await c.open();
  log('A. every icon: ours vs the SVG');
  const sizes = [[96, 96], [144, 64]];
  R.icons = await c.page.evaluate(async (sizes) => {
    const C = kdpCover, out = [];
    const cov = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; const a = new Uint8Array(d.length / 4); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; };
    for (const [name, , , paths] of C.iconSet.rows) {
      const r = { name, paths: paths.length };
      for (const [w, h] of sizes) {
        const ours = document.createElement('canvas'); ours.width = w; ours.height = h;
        const ctx = ours.getContext('2d'); ctx.fillStyle = '#000';
        for (const d of C.shapes.iconPaths({ kind: 'icon', paths, w, h })) ctx.fill(new Path2D(d), 'nonzero');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 24" preserveAspectRatio="none" fill="#000">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const ref = document.createElement('canvas'); ref.width = w; ref.height = h;
        ref.getContext('2d').drawImage(img, 0, 0, w, h);
        const a = cov(ours), b = cov(ref);
        let sum = 0, over = 0, ink = 0;
        for (let i = 0; i < a.length; i++) { const dd = Math.abs(a[i] - b[i]); sum += dd; if (dd > 64) over++; if (b[i] > 127) ink++; }
        r[`${w}x${h}`] = { mean: sum / a.length, over: over / a.length, ink: ink / a.length };
      }
      out.push(r);
    }
    return out;
  }, sizes);
  for (const r of R.icons) for (const [w, h] of sizes) {
    const m = r[`${w}x${h}`];
    expect(m.ink > 0.005, `${r.name} ${w}×${h}: draws something (${(m.ink * 100).toFixed(1)} % ink)`);
    expect(m.mean < 1 && m.over < 0.002, `${r.name} ${w}×${h}: mean ${m.mean.toFixed(3)}, off by more than 64: ${(m.over * 100).toFixed(3)} %`);
  }
  R.iconSummary = { icons: R.icons.length, worstMean: Math.max(...R.icons.flatMap((r) => sizes.map(([w, h]) => r[`${w}x${h}`].mean))),
    worstOver: Math.max(...R.icons.flatMap((r) => sizes.map(([w, h]) => r[`${w}x${h}`].over))) };

  log('B. the icons sheet as a Print PDF');
  const r = await c.page.evaluate(async () => {
    const H = kdpCoverHarness, cover = H.cover({ sheet: 'icons' });
    const p = await H.print(cover, { keep: true });
    const pdf = H.fromB64(p.pdf);
    const rt = await H.roundTrip(pdf, cover, 100);
    const seams = await H.seams(pdf, cover, H.last);
    const nonZero = (p.mainTyp.match(/fill-rule: "non-zero"/g) || []).length;
    delete p.pdf; delete p.mainTyp;
    return { p, rt, seams, nonZero, icons: cover.layers.filter((l) => l.kind === 'icon').length };
  });
  for (const ch of r.p.checks) expect(ch.pass, `icons sheet: ${ch.key} ${ch.detail}`);
  expect(r.icons === 28, `icons sheet: 28 icon layers (${r.icons})`);
  expect(r.nonZero > 28, `icons sheet: non-zero curves (${r.nonZero})`);
  expect(r.rt.mean < 3, `icons sheet: pdf vs renderer mean ${r.rt.mean.toFixed(2)}`);
  expect(r.rt.over64 < 0.01, `icons sheet: pdf vs renderer, pixels over 64: ${(r.rt.over64 * 100).toFixed(2)}%`);
  R.sheet = { plan: r.p.plan, patches: r.p.patches.length, bytes: r.p.bytes, ms: r.p.ms, rt: r.rt, seams: r.seams, nonZero: r.nonZero };
} catch (e) {
  fails.push(`ERR ${e.message}`);
} finally {
  await c.close();
}
R.pass = pass; R.fails = fails;
const file = save('icons-real.json', R);
for (const f of fails.slice(0, 40)) console.log('FAIL', f);
log(`${fails.length ? 'FAIL' : 'PASS'} ${pass} passed, ${fails.length} failed`, file);
process.exit(fails.length ? 1 : 0);
