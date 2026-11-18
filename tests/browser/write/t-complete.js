// Step 06 Write and the book shell, E12 fix batch 3, item 3 (design 22f, B): "Mark book as
// completed" at the end of the manuscript. Not ready: off, with only the lines that apply
// (not Final, needs review, no text, the outline). Ready: on, no confirm, Saving…, done
// ("Completed", "Marked <date>. You can still edit it.", Reopen book with focus). E16.1
// (owner, Nov 18): no step shows the "marked completed" strip (design 22f, 13 replaced).
// Errors: a network error with Retry; the server's refusal (another tab) with its reason
// and Reload. Reopen from the manuscript (an error with Retry). A status change that breaks
// the rule: the note says why.
// Screenshots at 1440 and 900 px.
// Run: tests/browser/run.sh write t-complete.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg, got) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}${cond || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`);
  let st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const off = (sel) => page.$eval(sel, (b) => b.disabled);
  const focusedAttr = () => page.evaluate(() => { const a = document.activeElement; return a ? [...a.attributes].map((x) => x.name).filter((n) => n.startsWith('data-')).join(',') : null; });
  const secs = () => st.outline[W1].flatMap((c) => c.sections);
  const calls = (table) => st.writes.filter((w) => w.table === table);
  const shots = async (name, sel) => {
    if (sel) await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-complete-${name}-1440.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}`));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);
    if (sel) await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > 900);
    await page.screenshot({ path: `${SHOTS}/t-complete-${name}-900.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-900`));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    return wide;
  };
  const open = async (step = 6) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=${step}`, { waitUntil: 'domcontentloaded' });
    if (step === 6) await page.waitForSelector('.wr-editor', { timeout: 10000 });
    else await page.waitForSelector('[data-step-title]', { timeout: 10000 });
    await page.waitForTimeout(400);
  };
  /** Every section Final, with text, nothing marked. */
  const ready = () => {
    for (const s of secs()) {
      if (!s.current_version_id) st.addVersion(s.id, `Text for ${s.title || 'this part'}, ready to publish.`, 'manual');
      s.status = 'final';
      s.needs_review = false;
    }
    st.outline[W1].forEach((c) => { c.needs_review = false; });
  };

  // ── 9. Not ready: what is left ──
  await open();
  const left = await page.$$eval('.wr-ms-left li', (l) => l.map((x) => x.innerText.trim()));
  const nf = secs().filter((s) => s.status !== 'final').length, nt = secs().filter((s) => !s.current_version_id).length;
  ok(JSON.stringify(left) === JSON.stringify([`${nf} sections are not Final yet`, `${nt} sections have no text`]), '9 only the lines that apply, in order', left);
  ok(await off('[data-complete]') && (await txt('[data-complete]')) === 'Mark book as completed', '9 the button is off');
  ok((await page.$eval('[data-complete]', (b) => b.getAttribute('aria-describedby'))) === 'wrFinWhy', '9 the list is the button\'s description');
  ok(!(await has('[data-fin] .wr-ms-why.is-ok')), '9 no "Every section is Final" line');
  await shots('9-not-ready', '[data-fin]');
  // One section marked, the outline not approved.
  secs()[3].needs_review = true;
  st.books[W1].outline_approved_at = null;
  await open();
  const left2 = await page.$$eval('.wr-ms-left li', (l) => l.map((x) => x.innerText.trim()));
  ok(left2.includes('1 section needs review') && left2[left2.length - 1] === 'Approve the outline in 05', '9 "1 section needs review" and, last, "Approve the outline in 05"', left2);
  secs()[3].needs_review = false;
  st.books[W1].outline_approved_at = new Date(Date.now() - 86400e3).toISOString();

  // ── 8, 10, 11. Ready; a network error with Retry ──
  ready();
  await open();
  ok((await txt('[data-fin] .wr-ms-why.is-ok')) === 'Every section is Final and nothing needs review.', '8 ready: the line with a check');
  ok(!(await off('[data-complete]')) && await page.$eval('[data-complete]', (b) => b.classList.contains('btn-primary')), '8 ready: the button is on (primary)');
  ok(!(await has('[data-book-strip]:not([hidden])')), '8 no strip on a book in progress');
  await shots('8-ready', '[data-fin]');
  globalThis.__modes.completeSlow = 1200;
  globalThis.__modes.completeError = 1;
  await page.click('[data-complete]');
  await page.waitForTimeout(250);
  ok((await txt('[data-complete]')) === 'Saving…' && await off('[data-complete]'), '10 Saving…, off (no confirm)');
  ok(!(await has('dialog[open]')), '10 no confirm dialog');
  await shots('10-saving', '[data-fin]');
  await page.waitForSelector('[data-fin-retry]', { timeout: 5000 });
  globalThis.__modes.completeSlow = 0;
  ok((await txt('[data-fin] .alert-error .alert-text')) === 'We couldn’t mark the book as completed. Try again.', '11 network error: the text, with Retry');
  ok((await focusedAttr()) === 'data-fin-retry', '11 focus on Retry', await focusedAttr());
  ok(st.books[W1].status !== 'completed', '11 the book stays in progress');
  await shots('11-error', '[data-fin]');

  // ── 12, 13. Retry, done ──
  await page.click('[data-fin-retry]');
  await page.waitForSelector('[data-reopen]', { timeout: 5000 });
  const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  ok(calls('complete_book').length === 2 && calls('complete_book').every((w) => w.id === W1), '12 two complete_book calls for this book');
  ok((await txt('.wr-ms-done')) === `Completed Marked ${day}. You can still edit it.`, '12 "Completed", "Marked <date>. You can still edit it." (completed_at, R3)', await txt('.wr-ms-done'));
  ok((await focusedAttr()) === 'data-reopen', '12 focus on Reopen book', await focusedAttr());
  ok((await txt('[data-live]')) === 'The book is marked completed.', '12 screen readers hear it');
  ok(!(await has('[data-book-strip]')), '13 E16.1: no strip element on the page');
  ok(await shots('12-done') === false, '12 900: no sideways scroll');
  await shots('12-foot', '[data-fin]');

  // ── 13. E16.1: no "marked completed" strip on any step; Reopen from 06 (an error, then Retry) ──
  const MARKED = 'This book is marked completed';
  for (const n of [1, 2, 3, 4, 5, 7, 8, 9]) {
    await page.click(`.step-link[data-step="${n}"]`);
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => document.body.innerText);
    ok(!t.includes(MARKED) && !(await has('[data-book-strip]')) && !(await has('[data-strip-reopen]')), `13 no strip on ${String(n).padStart(2, '0')}`);
    if (n === 1) {
      ok(st.calls.some((c) => c.startsWith('GET /rest/v1/books?select=status')), '13 a step of a completed book still reads the status again');
      await shots('13-no-strip-brief');
    }
  }
  await page.click('.step-link[data-step="6"]');
  await page.waitForSelector('[data-reopen]', { timeout: 10000 });
  ok((await txt('.wr-ms-done')) === `Completed Marked ${day}. You can still edit it.`, '13 back in 06: Completed and Reopen book stay in the foot');
  globalThis.__modes.reopenError = 1;
  await page.click('[data-reopen]');
  await page.waitForSelector('[data-fin-retry]', { timeout: 5000 });
  ok((await txt('[data-fin] .alert-error .alert-text')) === 'We couldn’t reopen the book. Try again.', '13 Reopen error in the 06 foot, with Retry', await txt('[data-fin] .alert-error'));
  await page.click('[data-fin-retry]');
  await page.waitForSelector('[data-complete]', { timeout: 5000 });
  ok(st.books[W1].status === 'in_progress' && JSON.stringify(calls('books').slice(-1)[0].body) === '{"status":"in_progress"}', '13 Retry reopens the book (status in_progress)');
  ok(!(await off('[data-complete]')), '13 in 06: Mark book as completed again');

  // ── 11. The server says no (another tab) ──
  globalThis.__modes.completeRefuse = true;
  await page.click('[data-complete]');
  await page.waitForSelector('[data-fin-reload]', { timeout: 5000 });
  ok((await txt('[data-fin] .alert-error .alert-text')) === 'The book changed in another tab. 1 section is not Final. Reload to see it.', '11 refused: the reason, then Reload', await txt('[data-fin] .alert-error'));
  await shots('11-refused', '[data-fin]');
  globalThis.__modes.completeRefuse = false;
  const statusReads = st.calls.filter((c) => c.startsWith('GET /rest/v1/books?select=status')).length;
  await page.click('[data-fin-reload]');
  await page.waitForTimeout(600);
  ok(st.calls.filter((c) => c.startsWith('GET /rest/v1/books?select=status')).length === statusReads + 1 && !(await has('[data-fin] .alert-error')), '11 Reload reads the outline and the status again; the error goes');

  // ── 12. Reopen from the manuscript ──
  await page.click('[data-complete]');
  await page.waitForSelector('[data-reopen]', { timeout: 5000 });
  await page.click('[data-reopen]');
  await page.waitForSelector('[data-complete]', { timeout: 5000 });
  ok(st.books[W1].status === 'in_progress', '12 Reopen book: in progress');
  ok((await focusedAttr()) === 'data-complete', '12 focus on Mark book as completed', await focusedAttr());
  ok((await txt('[data-live]')) === 'The book is in progress again.', '12 screen readers hear it');

  // ── 14. A status change that breaks the rule ──
  await page.click('[data-complete]');
  await page.waitForSelector('[data-reopen]', { timeout: 5000 });
  await page.selectOption('[data-status]', 'reviewed');
  await page.waitForTimeout(500);
  const note = await txt('[data-notes] .help-note');
  ok(/^Status saved\. The book is no longer marked completed, because (Introduction|\d+\.\d+) is not Final\.$/.test(note || ''), '14 the note says why, once, with no button', note);
  ok(await has('[data-complete]'), '14 the foot shows Mark book as completed');
  ok(await off('[data-complete]') && (await txt('.wr-ms-left')) === '1 section is not Final yet', '14 and it is off: "1 section is not Final yet"', await txt('.wr-ms-left'));
  await shots('14-reopened');

  return log.join('\n');
};
