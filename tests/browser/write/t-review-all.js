// Step 06 Write, E12 fix batch 3, item 4 (design 22f, A): "Mark all as reviewed" for one
// chapter (the first row of an open chapter) and for the whole book (the box under the
// manuscript bar). The same rule as the section's own Mark as reviewed: only needs_review
// goes, the status stays. A confirm with the count (Cancel changes nothing), one update for
// all (chapter_id=in.(…), needs_review=eq.true), Saving…, an error with Retry, the done note
// with the count the server returned, focus. Chapter marks (R1): the gray "Approve the
// outline in 05" line, and the box stays when only chapter marks are left (6b). More than
// 8 sections: the first 8 and "and N more". Screenshots at 1440 and 900 px.
// Run: tests/browser/run.sh write t-review-all.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg, got) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}${cond || got === undefined ? '' : `  got: ${JSON.stringify(got)}`}`);
  const st = globalThis.__store;
  const W6 = 'e6e6e6e6-0000-4000-8000-000000000006';
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const shown = (sel) => page.$$eval(sel, (l) => l.filter((e) => e.offsetParent !== null).length);
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.section || a.dataset.reviewChapter || [...a.attributes].map((x) => x.name).filter((n) => n.startsWith('data-')).join(',') || a.tagName) : null; });
  const chs = () => st.outline[W6].slice().sort((a, b) => a.position - b.position);
  const secs = () => chs().flatMap((c) => c.sections);
  const bulk = () => st.writes.filter((w) => w.table === 'sections' && w.bulk);
  const shots = async (name, sel) => {
    if (sel) await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-review-all-${name}-1440.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}`));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > 900);
    await page.screenshot({ path: `${SHOTS}/t-review-all-${name}-900.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-900`));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
    return wide;
  };
  /** W6 with text in the Introduction, 1.1 to 1.3 and 2.1, 2.2; those 6 marked "Needs review". */
  const prepare = (chapterMarks) => {
    const c = chs();
    const marked = [c[0].sections[0], ...c[1].sections, c[2].sections[0], c[2].sections[1]];
    for (const s of marked) {
      if (!s.current_version_id) st.addVersion(s.id, `Text for ${s.title || 'the introduction'}. It has a few words.`, 'manual');
      s.needs_review = true;
      if (s.status === 'not_started') s.status = 'draft';
    }
    c.forEach((x) => { x.needs_review = chapterMarks; });
    return marked;
  };
  const open = async (section) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W6}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForTimeout(400);
  };
  const dialog = async () => { await page.waitForSelector('dialog[open] [data-ask-yes]', { timeout: 5000 }); return { title: await txt('dialog[open] h2'), text: await txt('dialog[open] [data-ask-text]'), list: await page.$$eval('dialog[open] [data-ask-list]:not([hidden]) li', (l) => l.map((x) => x.innerText.replace(/\s+/g, ' ').trim())) }; };

  // ── 1. The buttons (no chapter marks) ──
  const marked = prepare(false);
  const s11 = chs()[1].sections[0].id, c1 = chs()[1].id, c2 = chs()[2].id;
  const statusBefore = secs().map((s) => s.status);
  await open(s11);
  ok((await txt('[data-review-box] .wr-ms-review-line')) === '6 sections need review', '1 the box: "6 sections need review"', await txt('[data-review-box]'));
  ok((await txt('[data-review-all]')) === 'Mark all as reviewed' && !(await page.$eval('[data-review-all]', (b) => b.disabled)), '1 the book button is on');
  ok(!(await txt('[data-review-box] .wr-ms-why')), '1 no chapter marks: no gray line');
  ok((await txt(`[data-review-chapter="${c1}"]`)) === 'Mark chapter as reviewed (3)', '1 the open chapter: "Mark chapter as reviewed (3)" as its first row',
    await txt(`[data-review-chapter="${c1}"]`));
  ok(await page.$eval(`[data-review-chapter="${c1}"]`, (b) => b.closest('ul').firstElementChild === b.closest('li')), '1 the chapter button is the first row of the list');
  ok((await shown(`[data-review-chapter="${c2}"]`)) === 0, '1 a closed chapter shows no button');
  ok((await shown('[data-review-chapter]')) === 1, '1 the Introduction keeps its own button (no chapter row)');
  ok(await shots('1-buttons') === false, '1 900: no sideways scroll');

  // ── 3. Chapter: confirm, Cancel ──
  await page.click(`[data-review-chapter="${c1}"]`);
  let d = await dialog();
  ok(d.title === 'Mark 3 sections in chapter 1 as reviewed?', '3 title with the count and the chapter', d.title);
  ok(/^“.+”: 1\.1, 1\.2 and 1\.3\. Check them against 03 Positioning first\. Their status stays the same\.$/.test(d.text), '3 the text names 1.1, 1.2 and 1.3', d.text);
  ok(d.list.length === 0, '3 no list for a chapter');
  ok((await txt('dialog[open] [data-ask-yes]')) === 'Mark 3 as reviewed' && await page.evaluate(() => document.activeElement.hasAttribute('data-ask-yes')), '3 the main button "Mark 3 as reviewed" has focus');
  await shots('3-chapter-confirm');
  await page.click('dialog[open] [data-ask-no]');
  await page.waitForTimeout(200);
  ok(bulk().length === 0 && secs().filter((s) => s.needs_review).length === 6, '3 Cancel: nothing sent, the marks stay');
  ok((await focused()) === c1, '3 Cancel: focus back on the chapter button', await focused());

  // ── 4, 6. Chapter: Saving…, done ──
  globalThis.__modes.reviewSlow = 1200;
  await page.click(`[data-review-chapter="${c1}"]`);
  await dialog();
  await page.click('dialog[open] [data-ask-yes]');
  await page.waitForTimeout(250);
  ok((await txt(`[data-review-chapter="${c1}"]`)) === 'Saving…' && await page.$eval(`[data-review-chapter="${c1}"]`, (b) => b.disabled), '4 Saving… on the chapter button, off');
  ok(await page.$eval('[data-review-all]', (b) => b.disabled), '4 the book button is off meanwhile');
  await shots('4-saving');
  await page.waitForSelector('.wr-ms-done-note', { timeout: 5000 });
  globalThis.__modes.reviewSlow = 0;
  const b1 = bulk()[0];
  ok(bulk().length === 1 && JSON.stringify(b1.bulk) === JSON.stringify([c1]) && b1.filter === 'eq.true' && JSON.stringify(b1.body) === '{"needs_review":false}', '4 one update: chapter_id=in.(chapter 1), needs_review=eq.true, only needs_review', b1);
  ok(chs()[1].sections.every((s) => !s.needs_review), '6 chapter 1 is clear on the server');
  ok(JSON.stringify(secs().map((s) => s.status)) === JSON.stringify(statusBefore), '6 every status stays the same');
  ok((await txt('.wr-ms-done-note')) === 'Marked 3 sections as reviewed.', '6 the note: "Marked 3 sections as reviewed."', await txt('.wr-ms-done-note'));
  ok((await txt('[data-review-box] .wr-ms-review-line')) === '3 sections need review', '6 the box now says 3');
  ok((await shown('[data-review-chapter]')) === 0 && !(await has(`[data-review-chapter="${c1}"]`)), '6 the chapter button is gone');
  ok(!(await has('[data-review-note]')), '6 the open section\'s "Needs review" alert is gone');
  ok((await focused()) === secs()[0].id, '6 focus on the manuscript\'s first section', await focused());
  ok((await txt('[data-live]')) === 'Marked 3 sections as reviewed.', '6 screen readers hear the note');

  // ── 2, 5. Book: confirm with the list, an error with Retry, then done ──
  await page.click('[data-review-all]');
  d = await dialog();
  ok(d.title === 'Mark 3 sections as reviewed?', '2 the book title with the count', d.title);
  ok(d.text === 'Check them against 03 Positioning first. Their status stays the same.', '2 the text', d.text);
  ok(JSON.stringify(d.list) === JSON.stringify(['Introduction', `2.1 ${chs()[2].sections[0].title}`, `2.2 ${chs()[2].sections[1].title}`]), '2 the list: Introduction, 2.1, 2.2', d.list);
  await shots('2-book-confirm');
  globalThis.__modes.reviewError = 1;
  await page.click('dialog[open] [data-ask-yes]');
  await page.waitForSelector('[data-review-retry]', { timeout: 5000 });
  ok((await txt('.wr-ms-review .alert-error .alert-text')) === 'We couldn’t mark them as reviewed. Nothing was changed.', '5 error: "We couldn’t mark them as reviewed. Nothing was changed."');
  ok((await focused()) === 'data-review-retry', '5 focus on Retry', await focused());
  ok(secs().filter((s) => s.needs_review).length === 3 && (await txt('[data-review-box] .wr-ms-review-line')) === '3 sections need review', '5 the marks stay');
  await shots('5-error');
  await page.click('[data-review-retry]');
  await page.waitForSelector('.wr-ms-done-note', { timeout: 5000 });
  const b2 = bulk().slice(-1)[0];
  ok(bulk().length === 3 && JSON.stringify(b2.bulk.slice().sort()) === JSON.stringify([chs()[0].id, c2].sort()), '5 Retry sends the same update again, with no new confirm (Introduction and chapter 2)', b2);
  ok(secs().every((s) => !s.needs_review), '6 every section is clear');
  ok(!(await has('[data-review-box]')), '6 no chapter marks: the box is gone');
  ok((await txt('.wr-ms-done-note')) === 'Marked 3 sections as reviewed.', '6 the done note');
  ok(!(await page.$$eval('.wr-review', (l) => l.length)), '6 no "Needs review" pill left in the manuscript');
  ok(!(await txt('.step-link[data-step="6"] .step-flag')), '6 the sidebar has no "Needs review" on 06');
  await shots('6-done');
  await page.waitForTimeout(8300);
  ok(!(await has('.wr-ms-done-note')), '6 the note goes after 8 seconds');

  // ── 6b, R1. Chapter marks left; more than 8 sections ──
  await setup(page);
  const st2 = globalThis.__store;
  const c = st2.outline[W6].slice().sort((a, b) => a.position - b.position);
  const many = c.flatMap((x) => x.sections).slice(0, 10);
  many.forEach((s) => { if (!s.current_version_id) st2.addVersion(s.id, 'Some text here.', 'manual'); s.needs_review = true; if (s.status === 'not_started') s.status = 'draft'; });
  c.forEach((x) => { x.needs_review = true; });
  await open(many[1].id);
  ok((await txt('[data-review-box] .wr-ms-review-line')) === '10 sections need review', 'R1 10 sections need review');
  ok((await txt('[data-review-box] .wr-ms-why')) === 'Approve the outline in 05 to clear the chapter marks.', 'R1 chapter marks: the gray line, with no button of its own');
  await shots('r1-chapter-line');
  await page.click('[data-review-all]');
  d = await dialog();
  ok(d.list.length === 9 && d.list[8] === 'and 2 more', '2 more than 8: the first 8, then "and 2 more"', d.list);
  await page.click('dialog[open] [data-ask-yes]');
  await page.waitForSelector('.wr-ms-done-note', { timeout: 5000 });
  ok((await txt('[data-review-box] .wr-ms-review-line')) === '5 chapters need review', '6b the box stays: "5 chapters need review"', await txt('[data-review-box]'));
  ok((await txt('[data-review-box] .wr-ms-why')) === 'Approve the outline in 05 to clear the chapter marks.' && !(await has('[data-review-all]')), '6b only the gray line, no button');
  ok(!(await page.$$eval('.wr-review', (l) => l.length)), '6b the chapter rows follow their sections (no pill)');
  ok((await txt('.wr-ms-done-note')) === 'Marked 10 sections as reviewed.', '6b the done note says 10');
  await shots('6b-chapter-marks-left');

  // Another tab cleared some first: the note uses the server's count.
  await setup(page);
  const st3 = globalThis.__store;
  const c3 = st3.outline[W6].slice().sort((a, b) => a.position - b.position);
  c3.forEach((x) => { x.needs_review = false; });
  const two = c3[1].sections.slice(0, 2);
  two.forEach((s) => { if (!s.current_version_id) st3.addVersion(s.id, 'Some text here.', 'manual'); s.needs_review = true; });
  await open(two[0].id);
  two[1].needs_review = false;   // cleared in another tab after this page loaded
  await page.click('[data-review-all]');
  await dialog();
  await page.click('dialog[open] [data-ask-yes]');
  await page.waitForSelector('.wr-ms-done-note', { timeout: 5000 });
  ok((await txt('.wr-ms-done-note')) === 'Marked 1 section as reviewed.', '6 the count is what the server changed (1, not 2)', await txt('.wr-ms-done-note'));
  ok(!(await has('[data-review-box]')), '6 and the box is gone');

  // ── 7. Off while the AI writes (W1: the positioning is locked, so Generate runs) ──
  await setup(page);
  const st4 = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const w1 = st4.outline[W1].slice().sort((a, b) => a.position - b.position);
  const s43 = w1[4].sections[2];
  w1[4].sections[1].needs_review = true;   // 4.2 has text (design 22)
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6&section=${s43.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wr-editor', { timeout: 10000 });
  await page.waitForTimeout(400);
  ok(!(await page.$eval('[data-review-all]', (b) => b.disabled)), '7 before: Mark all as reviewed is on');
  await page.click('[data-generate]');
  for (let i = 0; i < 50 && !(await page.evaluate(() => window.__gen.requests.length)); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(200);
  ok(await page.$eval('[data-review-all]', (b) => b.disabled), '7 while 4.3 is written: the book button is off');
  ok((await txt('#wrReviewWhy')) === 'Wait for the section to finish writing.' && (await page.$eval('[data-review-all]', (b) => b.getAttribute('aria-describedby'))) === 'wrReviewWhy', '7 with the reason as its description');
  ok(await page.$eval(`[data-review-chapter="${w1[4].id}"]`, (b) => b.disabled), '7 the chapter button is off too');
  await shots('7-off', '[data-review-box]');
  await page.evaluate(() => window.__gen.fail());
  await page.waitForTimeout(800);
  ok(!(await page.$eval('[data-review-all]', (b) => b.disabled)), '7 after the run: on again');
  return log.join('\n');
};
