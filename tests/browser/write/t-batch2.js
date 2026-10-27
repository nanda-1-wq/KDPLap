// Step 06 Write, E12 fix batch 2 (Part 2, browser):
//   item 4   "Needs review" says how it clears: Mark as reviewed (status kept), or the
//            status Reviewed or Final (the mark goes with it); a failed save keeps the mark.
//   items 9, 10  the "Source not named" row: a label left in the text ("[S3]") and a
//            source with no name ("Another source suggests"); Show selects just the label.
//   item 11 A    "Also in another section": the other sections' saved texts are read when a
//            section opens; a sentence of 8+ words they also have shows with where; a failed
//            read shows no row.
//   item 7   a repeat is info and never counted (with the rows above, for the screenshots).
// Screenshots at 1440 and 900 px.
// Run: tests/browser/run.sh write t-batch2.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver, .wr-panel .wr-soon', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const checksTab = async () => { await page.click('[data-tab="checks"]'); await page.waitForSelector('.wr-panel .wr-chk', { timeout: 5000 }); };
  const selected = () => g(() => getSelection().toString().replace(/\s+/g, ' ').trim());
  const tabLabel = () => txt('[data-tab="checks"]');
  const rowText = (code) => txt(`[data-chk-row="${code}"]`);
  const caretEnd = () => g(() => {
    const ed = document.querySelector('[data-editor]');
    ed.focus();
    let t = ed;
    while (t.lastElementChild && t.lastElementChild.tagName !== 'BR' && t.lastElementChild.isContentEditable) t = t.lastElementChild;
    const r = document.createRange();
    r.selectNodeContents(t);
    r.collapse(false);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  });
  const caretAfter = (s) => g((s) => {
    const ed = document.querySelector('[data-editor]');
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const i = t.nodeValue.indexOf(s);
      if (i >= 0) { ed.focus(); const r = document.createRange(); r.setStart(t, i + s.length); r.collapse(true); const x = getSelection(); x.removeAllRanges(); x.addRange(r); return; }
    }
    throw new Error(`not in the editor: ${s}`);
  }, s);
  const patches = (sid) => st.writes.filter((w) => w.table === 'sections' && w.id === sid).map((w) => w.body);
  const pills = (sid) => txt(`[data-section="${sid}"] .wr-ms-pills`);
  /** Waits until the mock has seen n PATCHes of a section (the page updates before the request lands). */
  const landed = async (sid, n) => { for (let i = 0; i < 60 && patches(sid).length < n; i++) await page.waitForTimeout(100); };
  /** 1440 and 900 shots of the page; true when the page scrolls sideways at 900. */
  const shots = async (name, sel) => {
    if (sel) await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-batch2-${name}-1440.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-1440`));
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForTimeout(300);
    const sideways = await g(() => document.documentElement.scrollWidth > innerWidth);
    if (sel) await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'start' }); }, sel);
    await page.screenshot({ path: `${SHOTS}/t-batch2-${name}-900.png`, timeout: 10000 }).catch(() => log.push(`shot timeout ${name}-900`));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(300);
    return sideways;
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  /* ── Item 4: Needs review ── */

  // W6 1.1: written, Reviewed, marked by the unlock.
  await open(W6, st.w6s);
  const NOTE = 'Needs review. This section was written before the positioning was unlocked. Check it against 03 Positioning, then choose Mark as reviewed. Setting the status to Reviewed or Final also clears this mark.';
  ok((await txt('[data-review-note] .alert-text')) === NOTE, `banner: ${await txt('[data-review-note] .alert-text')}`);
  ok((await txt('[data-review-note] .wr-note-actions')) === 'Mark as reviewed Run AI check', `buttons: ${await txt('[data-review-note] .wr-note-actions')}`);
  ok(/Needs review/.test(await pills(st.w6s)), 'the section pill shows');
  ok(await shots('needs-review', '[data-review-note]') === false, 'needs review: no sideways scroll at 900 px');

  // A failed save keeps the mark, with an error.
  modes.statusError = true;
  await page.click('[data-mark-reviewed]');
  await page.waitForSelector('.wr-note.alert-error', { timeout: 5000 });
  ok((await txt('.wr-note.alert-error .alert-text')) === 'We couldn’t mark it as reviewed. Try again.', `error: ${await txt('.wr-note.alert-error .alert-text')}`);
  ok(await has('[data-review-note]') && st.sectionOf(st.w6s).s.needs_review === true, 'the mark stays after a failed save');
  modes.statusError = false;

  // Mark as reviewed: only needs_review is sent; the status stays; the banner and pills go.
  const n0 = patches(st.w6s).length;
  await page.click('[data-mark-reviewed]');
  await page.waitForFunction(() => !document.querySelector('[data-review-note]'), null, { timeout: 5000 });
  await landed(st.w6s, n0 + 1);
  ok(JSON.stringify(patches(st.w6s).slice(n0)) === JSON.stringify([{ needs_review: false }]), `request: ${JSON.stringify(patches(st.w6s).slice(n0))}`);
  ok(st.sectionOf(st.w6s).s.needs_review === false && st.sectionOf(st.w6s).s.status === 'reviewed', 'saved: no mark, status still Reviewed');
  ok(!/Needs review/.test(await pills(st.w6s)) && !/Needs review/.test(await txt('.wr-ms-ch') || ''), 'the section and chapter pills go');
  ok((await txt('[data-live]')) === 'Marked as reviewed.' || /Marked as reviewed\./.test(await g(() => (document.querySelector('[aria-live]') || {}).textContent || '')), 'announced: Marked as reviewed.');
  ok(await g(() => document.activeElement && document.activeElement.matches('[data-sec-title]')), 'focus moves to the section title');

  // The status Reviewed or Final clears it too; Draft does not; a failed save brings it back.
  st.sectionOf(st.s42).s.needs_review = true;
  st.sectionOf(st.s42).s.status = 'draft';
  await open(W1, st.s42);
  ok(await has('[data-review-note]'), '4.2: the banner shows');
  const n1 = patches(st.s42).length;
  modes.statusError = true;
  await page.selectOption('[data-status]', 'final');
  await page.waitForSelector('.wr-note.alert-error', { timeout: 5000 });
  ok(await has('[data-review-note]') && st.sectionOf(st.s42).s.needs_review === true && (await page.$eval('[data-status]', (s) => s.value)) === 'draft', 'a failed status save keeps the mark and the old status');
  modes.statusError = false;
  await page.selectOption('[data-status]', 'reviewed');
  await page.waitForFunction(() => !document.querySelector('[data-review-note]'), null, { timeout: 5000 });
  await landed(st.s42, n1 + 2);
  ok(JSON.stringify(patches(st.s42).slice(n1 + 1)) === JSON.stringify([{ status: 'reviewed', needs_review: false }]), `Reviewed clears it: ${JSON.stringify(patches(st.s42).slice(n1 + 1))}`);
  ok(st.sectionOf(st.s42).s.needs_review === false, 'saved: no mark');
  st.sectionOf(st.s42).s.needs_review = true;
  await open(W1, st.s42);
  const n2 = patches(st.s42).length;
  await page.selectOption('[data-status]', 'draft');
  await landed(st.s42, n2 + 1);
  ok(JSON.stringify(patches(st.s42).slice(n2)) === JSON.stringify([{ status: 'draft' }]) && await has('[data-review-note]'), 'Draft keeps the mark');
  await page.selectOption('[data-status]', 'final');
  await page.waitForFunction(() => !document.querySelector('[data-review-note]'), null, { timeout: 5000 });
  await landed(st.s42, n2 + 2);
  ok(JSON.stringify(patches(st.s42).slice(-1)) === JSON.stringify([{ status: 'final', needs_review: false }]), 'Final clears it');
  st.sectionOf(st.s42).s.status = 'draft';

  /* ── Items 9, 10, 11 A, 7: the Checks rows ── */

  const S1 = 'Starting is often the hardest part, and you can always do more than the minimum.';
  const s11 = st.outline[W1][1].sections[0].id, s41 = st.outline[W1][4].sections[0].id;
  st.addVersion(s11, `Our joints change as we age. ${S1}`, 'manual');
  st.addVersion(s41, `## Turns\n\nTurn your head slowly. ${S1} [S3]`, 'manual');
  const reads0 = st.textReads || 0;
  await open(W1, st.s42);
  await checksTab();
  ok((st.textReads || 0) === reads0 + 1, 'opening a section reads the other sections\' texts once');
  const read = st.calls.filter((c) => /GET \/rest\/v1\/section_versions\?select=id,content&id=in\./.test(c)).slice(-1)[0] || '';
  const v42 = st.sectionOf(st.s42).s.current_version_id;
  ok(read.includes(st.sectionOf(s11).s.current_version_id) && read.includes(st.sectionOf(s41).s.current_version_id) && !read.includes(v42), 'it asks for the other sections\' current versions, not this one');
  ok(!(await has('[data-chk-row="again"]')), 'nothing repeated yet: no row');

  // Typed: the shared sentence, a label, a source with no name, and a repeated phrase.
  await caretAfter('neck pain by 40%.');
  await page.keyboard.type(` ${S1} You can always do more. [S3] Another source suggests a timer. Lift your arms up. Then lift your arms back. Again lift your arms down.`);
  await page.waitForTimeout(800);
  ok((await rowText('again')) === `1 sentence is also in another section Rewrite it here or cut it. ${S1} Also in 1.1 and 4.1 Show`, `again row: ${await rowText('again')}`);
  await page.click('[data-chk-row="again"] [data-chk-show]');
  ok((await selected()) === S1, `Show selects the sentence: ${await selected()}`);
  ok((await rowText('source')) === 'Source not named Name the author or the title, or cut the label. You can always do more. [S3] Show Another source suggests a timer. Show', `source row: ${await rowText('source')}`);
  await page.click('[data-chk-row="source"] [data-chk-show]');
  ok((await selected()) === '[S3]', `Show selects just the label: ${await selected()}`);
  ok((await rowText('repeat')) === '"lift your arms" used 3 times Show' && !(await has('[data-chk-row="repeat"] .is-warn')), 'repeat: info');
  ok((await tabLabel()) === 'Checks 3', `tab count 3: the claim, the source row and the again row (never the repeat): "${await tabLabel()}"`);
  ok(await shots('rows', '[data-chk-row="again"]') === false, 'rows: no sideways scroll at 900 px');

  // A failed read of the other texts: no row, nothing else breaks.
  modes.textsError = true;
  await open(W1, st.s42);
  await checksTab();
  await caretAfter('neck pain by 40%.');
  await page.keyboard.type(` ${S1}`);
  await page.waitForTimeout(800);
  ok(!(await has('[data-chk-row="again"]')) && await has('[data-chk-row="number"]'), 'texts not read: no again row; the other checks still run');
  modes.textsError = false;

  return log.join('\n');
};
