// node tests/browser/format/t-safari.mjs   (from the repo root; real CDN, real Safari)
// 08 Format, E13.1 Part 2: the main-thread fallback for real, in Safari, no
// test flag. Safari's worker overflows its stack in the PDF step from about
// 160 pages (worker spike, Nov 4). A placeholder book of about 200 pages must:
//   - fall back to the main thread by itself (path main, fellBack), one crash,
//     the worker ended, no idle worker after it (Part 3); the next builds (the same text, a one-word edit)
//     go straight to the main thread
//   - give the same PDF as Chrome's worker (sha384, pages)
//   - get the 1,500 ms preview delay
// and a 50-page placeholder book still builds in Safari's (new) worker with the
// main thread free (longest timer gap under 50 ms).
// Needs Safari > Settings > Developer > "Allow remote automation" (the test
// starts safaridriver on port 4567). Results: tests/browser/format/out/safari.json.
import { chrome, safari, ensureServer, save, log } from './lib.mjs';

const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); return ok; };
// About 200 pages in Classic 6 x 9. Part 3 (Nov 4): 164 pages sits on the edge of Safari's
// worker limit; one run built it in the worker the first time and overflowed on the next build.
const LONG = { chapters: 40, sections: 3, seed: 2 };
const SHORT = { chapters: 8, sections: 3 };
const server = await ensureServer();
const R = { date: new Date().toISOString() };
try {
  log('Chrome: the same books in the worker (reference)');
  const c = await chrome();
  await c.open();
  R.chrome = await c.page.evaluate(async ({ LONG, SHORT }) => {
    const H = kdpFormatHarness;
    const e = H.engine();
    await e.load('classic');
    const l = await H.build(e, { book: LONG, style: 'classic', bookId: 'long' });
    const s = await H.build(e, { book: SHORT, style: 'classic', bookId: 'short' });
    return { long: { path: l.path, pages: l.pages, sha: l.sha }, short: { path: s.path, pages: s.pages, sha: s.sha } };
  }, { LONG, SHORT });
  R.chromeVersion = c.version;
  await c.close();

  log('Safari');
  const s = await safari();
  R.safariVersion = s.version;
  try {
    await s.open();
    R.safari = await s.run(`
      const [LONG, SHORT] = a;
      for (let i = 0; i < 100 && !globalThis.kdpFormatHarness; i++) await new Promise((r) => setTimeout(r, 100));
      sessionStorage.clear();
      const H = kdpFormatHarness;
      const e = H.engine();
      const meter = () => {
        let last = performance.now(), worst = 0;
        const id = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; }, 10);
        return () => { clearInterval(id); return Math.round(Math.max(worst, performance.now() - last)); };
      };
      const t0 = performance.now();
      await e.load('classic');
      const loadMs = Math.round(performance.now() - t0);
      const painted = [];
      let stop = meter();
      const l = await H.build(e, { book: LONG, style: 'classic', bookId: 'long' }, { onMainThread: async () => { painted.push('updating-preview'); } });
      const longGap = stop();
      const stats1 = { ...e.stats };
      const worker1 = e.hasWorker();
      stop = meter();
      const l2 = await H.build(e, { book: LONG, style: 'classic', bookId: 'long' });
      const longGap2 = stop();
      const stats2 = { ...e.stats };
      stop = meter();
      const l3 = await H.build(e, { book: { ...LONG, edit: 'Edit' }, style: 'classic', bookId: 'long' });
      const longGap3 = stop();
      stop = meter();
      const sh = await H.build(e, { book: SHORT, style: 'classic', bookId: 'short' });
      const shortGap = stop();
      const statsShort = { ...e.stats };
      return {
        loadMs,
        long: { path: l.path, fellBack: l.fellBack, pages: l.pages, sha: l.sha, buildMs: Math.round(l.ms.roundTrip), mainThreadGapMs: longGap, checks: l.checks.every((x) => x.pass), painted },
        longAgain: { path: l2.path, fellBack: l2.fellBack, sha: l2.sha, buildMs: Math.round(l2.ms.roundTrip), mainThreadGapMs: longGap2 },
        longEdited: { path: l3.path, pages: l3.pages, buildMs: Math.round(l3.ms.roundTrip), mainThreadGapMs: longGap3 },
        short: { path: sh.path, pages: sh.pages, sha: sh.sha, buildMs: Math.round(sh.ms.roundTrip), mainThreadGapMs: shortGap },
        stats1, worker1, stats2, statsShort, statsEnd: { ...e.stats },
        delay: { long: e.previewDelay('long'), short: e.previewDelay('short') },
        session: JSON.parse(sessionStorage.getItem(kdpFormatEngine.SESSION_KEY) || '[]')
      };`, [LONG, SHORT]);
  } finally {
    await s.close();
  }
} finally {
  if (server) process.kill(-server.pid);
}

const S = R.safari;
if (!expect(S && !S.error, `Safari run: ${S && S.error}`)) {
  console.log(JSON.stringify(R, null, 2));
  process.exit(1);
}
expect(R.chrome.long.path === 'worker' && R.chrome.long.pages >= 160, `Chrome builds the long book in its worker (${R.chrome.long.pages} pages)`);
expect(S.long.path === 'main' && S.long.fellBack === true, `Safari: the ${S.long.pages}-page book fell back to the main thread by itself (${S.long.path})`);
expect(S.long.painted.length === 1, 'Safari: "Updating preview" asked for before the main-thread build');
expect(S.long.sha === R.chrome.long.sha && S.long.pages === R.chrome.long.pages, 'Safari main thread and Chrome worker: the same PDF');
expect(S.long.checks, 'Safari: the PDF checks pass');
expect(S.stats1.crashes === 1 && S.stats1.workerStarts === 1 && S.stats1.fallbacks === 1 && S.worker1 === false, `Safari: one crash, the worker ended, no idle worker (${JSON.stringify(S.stats1)}, worker ${S.worker1})`);
expect(S.statsShort.workerStarts === 2 && S.short.path === 'worker', `Safari: a new worker starts when the short book needs one (${JSON.stringify(S.statsShort)})`);
expect(S.longAgain.path === 'main' && S.longAgain.fellBack === false && S.stats2.crashes === 1, 'Safari: the next build goes straight to the main thread');
expect(S.longEdited.path === 'main' && S.statsEnd.crashes === 1, 'Safari: after a one-word edit, still the main thread, no new crash');
expect(S.short.path === 'worker' && S.short.sha === R.chrome.short.sha && S.short.mainThreadGapMs < 50, `Safari: the 50-page book in the new worker (${S.short.path}, gap ${S.short.mainThreadGapMs} ms)`);
expect(S.delay.long === 1500 && S.delay.short === 600, 'Safari: preview delay 1500 / 600');
expect(S.session.length === 1 && S.session[0] === 'long', 'Safari: remembered for the session');

R.fails = fails;
const file = save('safari.json', R);
log(fails.length ? `FAIL ${fails.length}` : 'PASS', file);
log(`Safari ${R.safariVersion}: ${S.long.pages} pages, first build ${S.long.buildMs} ms (worker try + main thread, page blocked ${S.long.mainThreadGapMs} ms), same text again ${S.longAgain.buildMs} ms (blocked ${S.longAgain.mainThreadGapMs} ms), one-word edit ${S.longEdited.buildMs} ms (blocked ${S.longEdited.mainThreadGapMs} ms); ${S.short.pages} pages in the worker ${S.short.buildMs} ms (blocked ${S.short.mainThreadGapMs} ms)`);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
