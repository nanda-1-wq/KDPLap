// node tests/browser/format/t-cdn.mjs   (from the repo root; real unpkg, Chrome)
// 08 Format, E13.1 Part 2: where the engine's files come from when jsdelivr fails.
//   1. jsdelivr down: every file from unpkg after one retry (about 1 s later)
//   2. jsdelivr serves a wrong font file: its hash fails, it is never used,
//      the file comes from unpkg with no retry wait
//   3. both CDNs down: load fails with kind "download" (08 shows the engine error with Retry)
// Playwright routes the CDN requests (routing also turns the HTTP cache off).
// Results: tests/browser/format/out/cdn.json.
import { chrome, ensureServer, save, log } from './lib.mjs';

const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); return ok; };
const R = {};
const server = await ensureServer();
const load = (page) => page.evaluate(async () => {
  const e = kdpFormatEngine.create();
  const t0 = performance.now();
  try {
    const r = await e.load('classic');
    const b = await kdpFormatHarness.build(e, { book: { chapters: 2, sections: 2 }, style: 'classic' });
    return { ok: true, ms: Math.round(performance.now() - t0), cdns: r.cdns, pages: b.pages, checks: b.checks.every((x) => x.pass) };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t0), kind: err.kind, message: err.message };
  } finally { e.terminate(); }
});

try {
  log('jsdelivr down');
  {
    const c = await chrome();
    let jsd = 0;
    await c.page.route('https://cdn.jsdelivr.net/**', (route) => { jsd++; return route.abort('connectionrefused'); });
    await c.open();
    R.jsdelivrDown = { ...(await load(c.page)), jsdelivrTries: jsd };
    await c.close();
  }
  expect(R.jsdelivrDown.ok && R.jsdelivrDown.cdns.length === 6 && R.jsdelivrDown.cdns.every((x) => x === 'unpkg') && R.jsdelivrDown.checks,
    `jsdelivr down: all from unpkg (${JSON.stringify(R.jsdelivrDown)})`);
  expect(R.jsdelivrDown.jsdelivrTries === 12, `jsdelivr tried twice per file (${R.jsdelivrDown.jsdelivrTries} of 12)`);

  log('a wrong file on jsdelivr');
  {
    const c = await chrome();
    let wrong = 0;
    await c.page.route('https://cdn.jsdelivr.net/npm/@expo-google-fonts/**', (route) => { wrong++; return route.fulfill({ status: 200, contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from('not the font') }); });
    await c.open();
    R.wrongFile = { ...(await load(c.page)), jsdelivrFontTries: wrong };
    await c.close();
  }
  expect(R.wrongFile.ok && R.wrongFile.cdns.filter((x) => x === 'unpkg').length === 4 && R.wrongFile.cdns.filter((x) => x === 'jsdelivr').length === 2,
    `wrong font on jsdelivr: fonts from unpkg, engine from jsdelivr (${JSON.stringify(R.wrongFile.cdns)})`);
  expect(R.wrongFile.jsdelivrFontTries === 4, `a hash failure is not retried (${R.wrongFile.jsdelivrFontTries} tries for 4 fonts)`);

  log('both CDNs down');
  {
    const c = await chrome();
    await c.page.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, (route) => route.abort('connectionrefused'));
    await c.open();
    R.bothDown = await load(c.page);
    await c.close();
  }
  expect(!R.bothDown.ok && R.bothDown.kind === 'download', `both down: a download error (${JSON.stringify(R.bothDown)})`);
} finally {
  if (server) process.kill(-server.pid);
}

R.fails = fails;
const file = save('cdn.json', R);
log(fails.length ? `FAIL ${fails.length}` : 'PASS', file, `(jsdelivr down: ready and built in ${R.jsdelivrDown.ms} ms; both down: error after ${R.bothDown.ms} ms)`);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
