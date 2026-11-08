// node tests/browser/format/t-engine-real.mjs   (from the repo root; real CDN, Chrome)
// 08 Format, E13.1 Part 2: the print engine for real, in headless Chrome.
//   1. cold first visit (empty profile): engine + Classic, then each other style
//      (fonts not yet downloaded): bytes on the wire and decoded per file and family
//   2. compile times: first build, the same again, after a one-word edit
//   3. next visits (same profile, Chrome restarted, 3 times): engine ready, style switch
//   4. main thread during a worker build of the 164-page placeholder (longest timer gap)
//   5. every pinned file on jsdelivr and on unpkg: same sha384 and size as files.js
//   6. the 5-font test: missing characters of a test text per face (cmap)
//   7. each style on each group A trim: PDF checks (size, fonts embedded as
//      FontFile2, only the style's families, no Type 3, page count), the 17
//      layout checks, words per page and characters per line; words per page of
//      the 4 styles within 10% on every trim; two option sets per style
//   8. the converter cases and 300 fuzz strings, printed and read back
// Placeholder books only. Results: tests/browser/format/out/engine-real.json.
// Exit code 1 when a check fails. Needs tests/browser/serve.py (started if down).
import { createRequire } from 'node:module';
import { chrome, ensureServer, save, log, median } from './lib.mjs';

createRequire(import.meta.url)('../../../js/format/files.js');
// Decoded size of each file = the bytes files.js pins (checked by the hash on every load).
const DECODED = new Map(globalThis.kdpFormatFiles.all().flatMap((f) => globalThis.kdpFormatFiles.urls(f).map((u) => [u, f.bytes])));

const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); return ok; };
const R = { date: new Date().toISOString() };
const BOOK = { chapters: 8, sections: 3 };
const LONG = { chapters: 30, sections: 3, seed: 2 };   // 164 pages in Classic 6 x 9 (Safari's worker limit is about 160)
const STYLES = ['classic', 'modern', 'clean', 'warm'];
const TRIMS = ['6x9', '5.5x8.5', '5.25x8', '5x8'];
const FAMILY_RE = { classic: [/EBGaramond/], modern: [/SourceSerif4/, /SourceSans3/], clean: [/Literata/], warm: [/Lora/] };
const FAMILY = { classic: ['eb-garamond'], modern: ['source-serif-4', 'source-sans-3'], clean: ['literata'], warm: ['lora'] };

const kindOf = (u) => (/typst\.ts@/.test(u) ? 'engine js' : /\.wasm$/.test(u) ? 'engine wasm'
  : /eb-garamond/.test(u) ? 'eb-garamond' : /source-serif-4/.test(u) ? 'source-serif-4' : /source-sans-3/.test(u) ? 'source-sans-3'
    : /literata/.test(u) ? 'literata' : /lora/.test(u) ? 'lora' : /pdfjs-dist/.test(u) ? 'pdf.js' : 'other');
function sizes(net) {
  const by = {};
  for (const r of net) {
    const k = kindOf(r.url);
    by[k] = by[k] || { files: 0, wire: 0, decoded: 0, fromCache: 0 };
    by[k].files++;
    by[k].wire += r.wire;
    by[k].decoded += DECODED.get(r.url) || r.decoded;
    if (r.cache) by[k].fromCache++;
  }
  return by;
}

const server = await ensureServer();
try {
  // ── 1 and 2. Cold first visit ──
  log('cold profile');
  const cold = await chrome();
  R.chrome = cold.version;
  await cold.open();
  cold.resetNet();
  const first = await cold.page.evaluate(async (BOOK) => {
    const H = kdpFormatHarness;
    const e = H.engine();
    const t0 = performance.now();
    await e.load('classic');
    const ready = performance.now() - t0;
    const a = await H.build(e, { book: BOOK, style: 'classic' });
    const b = await H.build(e, { book: BOOK, style: 'classic' });
    const c = await H.build(e, { book: { ...BOOK, edit: 'Edit' }, style: 'classic' });
    return { readyMs: ready, firstBuild: a.ms, sameAgain: b.ms, afterEdit: c.ms, pages: a.pages, path: a.path };
  }, BOOK);
  R.cold = { engineAndClassicReadyMs: Math.round(first.readyMs), sizes: sizes(cold.allNet()) };
  R.compile = { book: `placeholder ${BOOK.chapters} x ${BOOK.sections}`, pages: first.pages, path: first.path,
    firstBuild: Math.round(first.firstBuild.roundTrip), sameAgain: Math.round(first.sameAgain.roundTrip), afterOneWordEdit: Math.round(first.afterEdit.roundTrip),
    phases: Object.fromEntries(Object.entries(first.firstBuild).map(([k, v]) => [k, Math.round(v)])) };
  expect(first.path === 'worker', 'cold build ran in the worker');
  expect(R.cold.sizes['engine wasm'] && R.cold.sizes['engine wasm'].files === 1 && R.cold.sizes['eb-garamond'].files === 4, `cold load counted (${JSON.stringify(R.cold.sizes)})`);
  R.coldSwitch = {};
  for (const style of STYLES.slice(1)) {
    cold.resetNet();
    const s = await cold.page.evaluate(async ({ style, BOOK }) => {
      const H = kdpFormatHarness;
      const t0 = performance.now();
      await H.engine().load(style);
      const ready = performance.now() - t0;
      const b = await H.build(H.engine(), { book: BOOK, style });
      return { ready, build: b.ms.roundTrip };
    }, { style, BOOK });
    R.coldSwitch[style] = { loadMs: Math.round(s.ready), buildMs: Math.round(s.build), totalMs: Math.round(s.ready + s.build), sizes: sizes(cold.allNet()) };
  }
  R.families = {};
  const all = { ...R.cold.sizes, ...Object.fromEntries(Object.values(R.coldSwitch).flatMap((x) => Object.entries(x.sizes))) };
  for (const k of ['engine js', 'engine wasm', 'eb-garamond', 'source-serif-4', 'source-sans-3', 'literata', 'lora']) R.families[k] = all[k];
  await cold.close(true);

  // ── 3. Next visits: the same profile, Chrome restarted ──
  R.cached = [];
  for (let i = 0; i < 3; i++) {
    log('cached visit', i + 1);
    const c = await chrome({ profile: cold.profile });
    await c.open();
    c.resetNet();
    const r = await c.page.evaluate(async (BOOK) => {
      const H = kdpFormatHarness;
      const e = H.engine();
      const t0 = performance.now();
      await e.load('classic');
      const ready = performance.now() - t0;
      await H.build(e, { book: BOOK, style: 'classic' });
      const t1 = performance.now();
      await e.load('modern');
      const b = await H.build(e, { book: BOOK, style: 'modern' });
      const sw = performance.now() - t1;
      return { ready, switchMs: sw, switchBuild: b.ms.roundTrip };
    }, BOOK);
    const net = c.allNet();
    R.cached.push({ readyMs: Math.round(r.ready), styleSwitchMs: Math.round(r.switchMs), switchBuildMs: Math.round(r.switchBuild),
      requests: net.length, fromCache: net.filter((x) => x.cache).length, wireBytes: net.reduce((s, x) => s + x.wire, 0) });
    await c.close(true);
  }
  R.cachedMedian = { readyMs: median(R.cached.map((x) => x.readyMs)), styleSwitchMs: median(R.cached.map((x) => x.styleSwitchMs)) };

  // ── 4 to 8 on one warm page ──
  const w = await chrome({ profile: cold.profile });
  await w.open();

  log('main thread during a worker build');
  R.worker = await w.page.evaluate(async (LONG) => {
    const H = kdpFormatHarness;
    const e = H.engine();
    await e.load('classic');
    // The export model is made before (08 has it already); the window is engine.build only:
    // main.typ (on the main thread), the worker's compile, the PDF coming back.
    const bk = H.book({ book: LONG, style: 'classic' });
    const tc = performance.now();
    kdpFormatTypst.mainTyp(bk.model, bk.settings, bk.extras);
    const convertMs = performance.now() - tc;
    await new Promise((r) => setTimeout(r, 50));
    let last = performance.now(), worst = 0;
    const id = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; }, 10);
    const t0 = performance.now();
    const b = await e.build({ bookId: bk.bookId, model: bk.model, settings: bk.settings, extras: bk.extras });
    const buildMs = performance.now() - t0;
    clearInterval(id);
    return { pages: b.pages, path: b.path, words: bk.model.words, buildMs: Math.round(buildMs), convertMs: Math.round(convertMs),
      longestMainThreadGapMs: Math.round(Math.max(worst, performance.now() - last)) };
  }, LONG);
  expect(R.worker.path === 'worker' && R.worker.longestMainThreadGapMs < 50, `worker build: path ${R.worker.path}, main thread gap ${R.worker.longestMainThreadGapMs} ms`);

  log('SRI on both CDNs');
  R.sri = await w.page.evaluate(() => kdpFormatHarness.sriBoth());
  for (const r of R.sri) expect(r.jsdelivr && r.unpkg, `SRI and size on both CDNs: ${r.file}`);

  log('missing characters per family');
  R.missing = {};
  for (const fam of ['eb-garamond', 'source-serif-4', 'source-sans-3', 'literata', 'lora']) {
    R.missing[fam] = await w.page.evaluate((f) => kdpFormatHarness.missing(f), fam);
  }

  log('styles x trims');
  R.builds = [];
  const OPTIONS = {
    'all on': { settings: { drop_cap: true, contents_sections: true, chapter_label: 'number', isbn: '9780306406157',
      header_title: 'A Very Long Header Title That Will Never Fit On One Small Line Of The Page',
      parts: { title: true, copyright: true, contents: true, intro: true, conclusion: true, about: true, also_by: true } },
    alsoBy: [{ title: 'Another Placeholder Book', subtitle: 'With a Subtitle' }, { title: 'A Third Book', subtitle: null }] },
    'quiet': { settings: { recto_start: false, running_header: false, chapter_label: 'none' } }
  };
  const runs = [];
  for (const style of STYLES) for (const trim of TRIMS) runs.push({ style, trim, name: 'default' });
  for (const style of STYLES) for (const [name, o] of Object.entries(OPTIONS)) runs.push({ style, trim: '6x9', name, ...o });
  for (const run of runs) {
    const r = await w.page.evaluate(async (run) => {
      const H = kdpFormatHarness;
      const e = H.engine();
      await e.load(run.style);
      const b = await H.build(e, { book: { chapters: 8, sections: 3 }, style: run.style, trim: run.trim, settings: run.settings || {}, alsoBy: run.alsoBy || [] });
      const l = await H.layout(b);
      return {
        pages: b.pages, words: b.words, ms: Math.round(b.ms.roundTrip), diagnostics: b.diagnostics,
        checks: b.checks.map((c) => ({ key: c.key, pass: c.pass, detail: c.detail })),
        fonts: b.info.fonts.map((f) => ({ name: f.name, file: f.file, subtype: f.subtype })),
        layoutPassed: l.checks.filter((c) => c.pass).length, layoutTotal: l.checks.length,
        layoutFailed: l.checks.filter((c) => !c.pass).map((c) => `${c.name} (pages ${c.failPages.join(', ')})`),
        notes: Object.keys(l.notes), metrics: l.metrics, front: l.counts.front, blank: l.counts.blank
      };
    }, run);
    const row = { style: run.style, trim: run.trim, options: run.name, ...r };
    R.builds.push(row);
    const tag = `${run.style} ${run.trim} ${run.name}`;
    expect(r.checks.every((c) => c.pass), `${tag}: PDF checks ${r.checks.filter((c) => !c.pass).map((c) => c.detail).join('; ')}`);
    expect(r.layoutPassed === 17, `${tag}: layout ${r.layoutFailed.join('; ')}`);
    expect(r.fonts.every((f) => f.file === 'FontFile2' && FAMILY_RE[run.style].some((re) => re.test(f.name))), `${tag}: fonts ${r.fonts.map((f) => f.name).join(', ')}`);
    expect(FAMILY_RE[run.style].every((re) => r.fonts.some((f) => re.test(f.name))), `${tag}: every family of the style is embedded`);
    expect(r.diagnostics.length === 0, `${tag}: Typst warnings ${r.diagnostics.join('; ')}`);
    log(tag, r.pages, 'pages', `${r.layoutPassed}/17`, r.metrics.wordsPerPage, 'words/page');
  }
  R.wordsPerPageSpread = {};
  for (const trim of TRIMS) {
    const wpp = STYLES.map((s) => R.builds.find((b) => b.style === s && b.trim === trim && b.options === 'default').metrics.wordsPerPage);
    const spread = Math.round((Math.max(...wpp) / Math.min(...wpp) - 1) * 1000) / 10;
    R.wordsPerPageSpread[trim] = { wordsPerPage: Object.fromEntries(STYLES.map((s, i) => [s, wpp[i]])), spreadPercent: spread };
    expect(spread <= 10, `${trim}: words per page differ by ${spread}% between styles`);
  }

  log('converter cases');
  R.cases = await w.page.evaluate(() => kdpFormatHarness.cases(kdpFormatHarness.engine()));
  expect(!R.cases.error && R.cases.casesPassed === R.cases.casesTotal && R.cases.fuzzPassed === R.cases.fuzzTotal, `converter cases: ${JSON.stringify(R.cases.failed || R.cases.error)}`);
  R.pageErrors = w.errors;
  expect(!w.errors.length && !cold.errors.length, `page errors: ${[...cold.errors, ...w.errors].join(' | ')}`);
  await w.close();
} finally {
  if (server) process.kill(-server.pid);
}

R.fails = fails;
const file = save('engine-real.json', R);
log(fails.length ? `FAIL ${fails.length}` : 'PASS', file);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
