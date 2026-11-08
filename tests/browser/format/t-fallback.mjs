// node tests/browser/format/t-fallback.mjs   (from the repo root; real CDN, Chrome)
// 08 Format, E13.1 Part 2: the main-thread fallback, forced with the
// test-only flag (kdpFormatEngine.create({ test: { overflowPdfFor: [bookId] } }):
// the worker throws Safari's stack overflow in its PDF step for that book).
// Owner rules (Nov 4, option A), each checked:
//   1. after the crash the worker is ended; a new one starts only when a build needs it
//      (Part 3: no idle worker after a fallback; a main-thread book never starts one)
//   2. the fallback comes from the error (overflow in the PDF step), not the browser:
//      a Typst error and an overflow in another step do not fall back
//   3. the book is remembered for the session (also after a reload); other books stay in the worker
//   4. main-thread path: preview delay 1,500 ms (600 in the worker), and the caller's
//      "Updating preview" is painted (two frames) before the compile starts
// The main-thread PDF is the same file as the worker's (sha384, pages).
// Placeholder books only. Results: tests/browser/format/out/fallback.json.
import { chrome, ensureServer, save, log } from './lib.mjs';

const fails = [];
const expect = (ok, what) => { if (!ok) fails.push(what); return ok; };
const server = await ensureServer();
let R;
try {
  const c = await chrome();
  await c.open();
  R = await c.page.evaluate(async () => {
    const H = kdpFormatHarness;
    sessionStorage.clear();
    const spec = { book: { chapters: 8, sections: 3 }, style: 'classic' };
    const e = kdpFormatEngine.create({ test: { overflowPdfFor: ['book-forced'] } });
    await e.load('classic');
    const out = { browser: navigator.userAgent.match(/Chrome\/[\d.]+/)[0] };

    // The worker's PDF of the same book, under another id.
    const ref = await H.build(e, { ...spec, bookId: 'book-ref' });
    out.ref = { path: ref.path, pages: ref.pages, sha: ref.sha };

    // Watch the order: "Updating preview" painted, a frame, then the compile.
    const events = [];
    const compile = kdpTypstRun.compile;
    kdpTypstRun.compile = (...a) => { events.push('compile'); return compile(...a); };
    const onMainThread = async () => {
      events.push('updating-preview');
      document.getElementById('out').textContent = 'Updating preview';
      requestAnimationFrame(() => events.push('frame'));
    };
    let last = performance.now(), worst = 0;
    const id = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; }, 10);
    const forced = await H.build(e, { ...spec, bookId: 'book-forced' }, { onMainThread });
    clearInterval(id);
    out.forced = { path: forced.path, fellBack: forced.fellBack, pages: forced.pages, sha: forced.sha, buildMs: Math.round(forced.ms.roundTrip),
      mainThreadGapMs: Math.round(worst), checks: forced.checks.every((x) => x.pass) };
    out.events = events.slice();
    out.statsAfterFallback = { ...e.stats };
    out.workerAfterFallback = e.hasWorker();
    out.mode = { forced: e.mode('book-forced'), ref: e.mode('book-ref') };
    out.delay = { forced: e.previewDelay('book-forced'), ref: e.previewDelay('book-ref') };
    out.session = JSON.parse(sessionStorage.getItem(kdpFormatEngine.SESSION_KEY) || '[]');

    // Rule 3: the next build of that book goes straight to the main thread (no worker try, no crash).
    events.length = 0;
    const again = await H.build(e, { ...spec, bookId: 'book-forced' }, { onMainThread });
    out.again = { path: again.path, fellBack: again.fellBack, sha: again.sha, events: events.slice() };
    out.statsAfterAgain = { ...e.stats };
    out.workerAfterAgain = e.hasWorker();

    // Rule 1: the new worker builds the other book.
    const ref2 = await H.build(e, { ...spec, bookId: 'book-ref' });
    out.ref2 = { path: ref2.path, sha: ref2.sha };
    out.statsAfterRef2 = { ...e.stats };
    kdpTypstRun.compile = compile;

    // Rule 2: a Typst error is not a crash and never falls back.
    const bad = await e.buildSource({ bookId: 'book-bad', style: 'classic', mainTyp: '#let x = ' }).catch((err) => err);
    out.typstError = { kind: bad.kind, phase: bad.phase, diagnostics: (bad.diagnostics || []).length };
    out.statsAfterTypstError = { ...e.stats };
    out.modeBad = e.mode('book-bad');
    out.isOverflow = {
      pdfChrome: kdpFormatEngine.isOverflow({ phase: 'pdf', message: 'Maximum call stack size exceeded.' }),
      pdfFirefox: kdpFormatEngine.isOverflow({ phase: 'pdf', message: 'too much recursion' }),
      compileStep: kdpFormatEngine.isOverflow({ phase: 'compile', message: 'Maximum call stack size exceeded.' }),
      otherPdfError: kdpFormatEngine.isOverflow({ phase: 'pdf', message: 'unreachable executed' }),
      none: kdpFormatEngine.isOverflow(null)
    };
    e.terminate();

    // A new engine (08 opened again) for the remembered book: load and build on the main thread, no worker.
    const e2 = kdpFormatEngine.create();
    await e2.load('classic', 'book-forced');
    const third = await H.build(e2, { ...spec, bookId: 'book-forced' });
    out.reopen = { path: third.path, sha: third.sha, workerStarts: e2.stats.workerStarts, hasWorker: e2.hasWorker() };
    e2.terminate();
    return out;
  });

  // Rule 3 after a reload: the session remembers the book.
  await c.page.reload({ waitUntil: 'domcontentloaded' });
  await c.page.waitForFunction(() => globalThis.kdpFormatEngine);
  R.afterReload = await c.page.evaluate(() => { const e = kdpFormatEngine.create(); return { forced: e.mode('book-forced'), ref: e.mode('book-ref'), delay: e.previewDelay('book-forced') }; });
  R.pageErrors = c.errors;
  await c.close();
} finally {
  if (server) process.kill(-server.pid);
}

expect(R.ref.path === 'worker', 'reference build in the worker');
expect(R.forced.path === 'main' && R.forced.fellBack === true, `forced book fell back to the main thread (${R.forced.path})`);
expect(R.forced.sha === R.ref.sha && R.forced.pages === R.ref.pages, 'main-thread PDF is the same file as the worker PDF');
expect(R.forced.checks, 'main-thread PDF passes the PDF checks');
expect(R.statsAfterFallback.crashes === 1 && R.statsAfterFallback.workerStarts === 1 && R.statsAfterFallback.fallbacks === 1 && R.statsAfterFallback.mainBuilds === 1,
  `rule 1: one crash, worker ended, no new worker yet (${JSON.stringify(R.statsAfterFallback)})`);
expect(R.workerAfterFallback === false, 'Part 3: no idle worker after the fallback');
expect(JSON.stringify(R.events) === JSON.stringify(['updating-preview', 'frame', 'compile']), `rule 4: painted before the compile (${R.events})`);
expect(R.mode.forced === 'main' && R.mode.ref === 'worker', 'rule 3: only that book is on the main thread');
expect(R.delay.forced === 1500 && R.delay.ref === 600, `rule 4: preview delay 1500 / 600 (${JSON.stringify(R.delay)})`);
expect(R.session.length === 1 && R.session[0] === 'book-forced', 'rule 3: remembered in sessionStorage');
expect(R.again.path === 'main' && R.again.fellBack === false && R.again.sha === R.ref.sha, 'rule 3: the next build goes straight to the main thread');
expect(R.statsAfterAgain.crashes === 1 && R.statsAfterAgain.workerStarts === 1 && R.statsAfterAgain.mainBuilds === 2, 'rule 3: no worker try the second time');
expect(R.workerAfterAgain === false, 'Part 3: still no worker after a main-thread build');
expect(JSON.stringify(R.again.events) === JSON.stringify(['updating-preview', 'frame', 'compile']), 'rule 4: painted first on the second main-thread build too');
expect(R.ref2.path === 'worker' && R.ref2.sha === R.ref.sha && R.statsAfterRef2.workerStarts === 2, 'rule 1: a new worker starts when a worker build needs it, and builds');
expect(R.reopen.path === 'main' && R.reopen.sha === R.ref.sha && R.reopen.workerStarts === 0 && !R.reopen.hasWorker, `Part 3: a remembered book loads and builds with no worker (${JSON.stringify(R.reopen)})`);
expect(R.typstError.kind === 'typst' && R.typstError.diagnostics > 0, 'a Typst error is reported as one');
expect(R.statsAfterTypstError.crashes === 1 && R.statsAfterTypstError.fallbacks === 1 && R.modeBad === 'worker', 'rule 2: a Typst error does not restart or fall back');
expect(R.isOverflow.pdfChrome && R.isOverflow.pdfFirefox && !R.isOverflow.compileStep && !R.isOverflow.otherPdfError && !R.isOverflow.none, `rule 2: isOverflow ${JSON.stringify(R.isOverflow)}`);
expect(R.afterReload.forced === 'main' && R.afterReload.ref === 'worker' && R.afterReload.delay === 1500, 'rule 3: remembered after a reload');
expect(!R.pageErrors.length, `page errors: ${R.pageErrors.join(' | ')}`);

R.fails = fails;
const file = save('fallback.json', R);
log(fails.length ? `FAIL ${fails.length}` : 'PASS', file, `(${R.forced.buildMs} ms main-thread build, page blocked ${R.forced.mainThreadGapMs} ms)`);
for (const f of fails) console.log('FAIL', f);
process.exit(fails.length ? 1 : 0);
