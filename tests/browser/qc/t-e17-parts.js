// 07 Quality Control, E17 Part 8 (design 84): group 1 lists a book part that is on and empty, or on and not
// Final, after the section rows, in book order, as "Book part" with the name in bold and "Open in 06" to that
// part. No Mark as OK (Q-P3; the mock refuses it as 0035 does). The review request page and Also by never give
// an item. The verdict stays "Ready for Format, with N warnings". A part change makes the run "Out of date"
// exactly as 0035 qc_inputs_key says (every part that is on: kind, status, current version); an Also by list
// change does not. Run again: the item clears when the part is Final or turned off. Hostile part text never
// shows as HTML. Open in 06 lands on the part. Focus ring; 900 and 200% text.
// Run: tests/browser/run.sh qc t-e17-parts.js
const test = async page => {
  const { log, ok } = QC.log();
  const st = globalThis.__store;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1300 });
  st.clean();
  st.section('3.2').status = 'draft';   // one section row in group 1, so the order and Mark as OK have something to compare
  const hostile = '<img src=x onerror="window.__xss=1"> # $ @ * _ & < > " \'';
  const ver = (n, content) => ({ id: `8b000000-0000-4000-8000-00000000000${n}`, content, word_count: content.split(/\s+/).filter(Boolean).length });
  Object.assign(st.part('dedication'), { enabled: true });                                                  // on, empty
  Object.assign(st.part('foreword'), { enabled: true, status: 'final', version: ver(1, 'A short foreword.') });   // in the file
  Object.assign(st.part('about_author'), { enabled: true, status: 'draft', version: ver(2, hostile) });          // on, Draft
  Object.assign(st.part('review_request'), { enabled: true });                                               // fixed text
  Object.assign(st.part('also_by'), { enabled: true });                                                      // no book: never an item
  Object.assign(st.part('preface'), { enabled: false, version: ver(3, 'Off and kept.') });                    // off

  /** Group 1's rows, opened. */
  const rows1 = async () => {
    if (await g(() => document.querySelector('[data-group="1"]').getAttribute('aria-expanded') !== 'true')) await page.click('[data-group="1"]');
    return g(() => [...document.querySelectorAll('#qc-g1 .qc-it')].map((li) => {
      const a = li.querySelector('a.qc-lk');
      return { where: li.querySelector('.qc-sec').textContent, text: li.querySelector('.qc-tx').textContent.replace(/\s+/g, ' ').trim(),
        bold: (li.querySelector('.qc-tx b') || {}).textContent || null, link: a ? a.textContent.replace(/\s+/g, ' ').trim() : null,
        href: a ? a.getAttribute('href') : null, ok: !!li.querySelector('[data-ok]') };
    }));
  };
  const partRows = async () => (await rows1()).filter((r) => r.where === 'Book part');
  const verdict = () => QC.txt(page, '[data-verdict] strong');
  const reopen = async () => { await QC.open7(page); };

  /* ── The run: two part items, after the sections, in book order ── */
  await reopen();
  await QC.run(page);
  const sent = st.writes.filter((w) => w.table === 'qc_runs').pop().body;
  const items = sent.results.items.filter((x) => x.rule.startsWith('part_'));
  ok(JSON.stringify(items.map((x) => [x.g, x.rule, x.key, x.section_id, x.version_id, x.quote])) === JSON.stringify([
    [1, 'part_empty', `${st.part('dedication').id}|none`, null, null, ''],
    [1, 'part_not_final', `${st.part('about_author').id}|${st.part('about_author').version.id}`, null, null, '']]),
    `saved run: part_empty then part_not_final, no section, key part id first (${JSON.stringify(items.map((x) => x.key))})`);
  ok(sent.inputs_key !== st.key && /^[0-9a-f]{32}$/.test(sent.inputs_key), 'the run key holds the parts that are on (0035 qc_inputs_key)');
  let R = await rows1();
  let P = R.filter((r) => r.where === 'Book part');
  ok(JSON.stringify(P.map((r) => [r.text, r.bold])) === JSON.stringify([['Dedication is on but empty.', 'Dedication'], ['About the author is on but not Final.', 'About the author']]),
    `84: the two part rows, name in bold (${JSON.stringify(P.map((r) => r.text))})`);
  ok(R.length > P.length && R.findIndex((r) => r.where === 'Book part') === R.length - P.length, `part rows come after the section rows (${R.map((r) => r.where).join(', ')})`);
  ok(!(await partRows()).some((r) => /Review request|Also by|Foreword|Preface/.test(r.text)), 'no row for the review request page, Also by (no book), the Final foreword or the off preface');
  ok(P.every((r) => !r.ok) && R.filter((r) => r.where !== 'Book part').every((r) => r.ok), 'no Mark as OK on part rows (section rows keep theirs)');
  ok(P.every((r) => /^Open in 06: /.test(r.link)) && P[0].href === `?id=${QB}&step=6&part=${st.part('dedication').id}` && P[1].href === `?id=${QB}&step=6&part=${st.part('about_author').id}`,
    `Open in 06 goes to the part, named for screen readers (${P[0].href})`);
  ok(/^Ready for Format, with \d+ warnings?$/.test(await verdict()), `verdict: never "not ready" (${await verdict()})`);
  ok(await g(() => !window.__xss && !document.querySelector('[data-qc] img') && !document.querySelector('[data-qc]').textContent.includes('onerror')), 'hostile part text: never in 07');

  /* ── No Mark as OK on the server either (0035 qc_dismissed_rule_check; the mock mirrors it) ── */
  const refused = await g(async ([b, k]) => { const r = await kdp.dismissQcIssue({ bookId: b, sectionId: null, rule: 'part_empty', issueKey: k, label: 'Book part · Dedication is on but empty.' }); return r.error ? r.error.code || r.error.message : 'saved'; }, [QB, `${st.part('dedication').id}|none`]);
  ok(refused === '23514' && !st.dismissed.some((d) => d.rule.startsWith('part_')), `a part item cannot be marked as OK (${refused})`);

  /* ── Out of date: exactly as qc_inputs_key ── */
  // An Also by list change is not in the key: still current.
  st.alsoBy = [{ title: 'Another Book', valid: true }];
  await reopen();
  ok(!(await QC.has(page, '.qc-box.is-warning')), 'an Also by change: 07 stays current (not in qc_inputs_key)');
  // About the author becomes Final: the key changes.
  st.part('about_author').status = 'final';
  await reopen();
  const stale = await QC.txt(page, '.qc-box.is-warning');
  ok(/^Out of date/.test(stale) && /a book part/.test(stale), `a part status change: Out of date (${stale})`);
  await QC.run(page);
  P = await partRows();
  ok(JSON.stringify(P.map((r) => r.text)) === JSON.stringify(['Dedication is on but empty.']), `Run again: the Final part clears (${JSON.stringify(P.map((r) => r.text))})`);
  // A new version of a part that is on changes the key too.
  st.part('dedication').version = ver(4, 'For my teachers.');
  await reopen();
  ok(await QC.has(page, '.qc-box.is-warning'), 'a part text change (new current version): Out of date');
  await QC.run(page);
  P = await partRows();
  ok(JSON.stringify(P.map((r) => r.text)) === JSON.stringify(['Dedication is on but not Final.']), `Run again: empty becomes not Final (${JSON.stringify(P.map((r) => r.text))})`);
  // Turned off: out of date, then it clears.
  st.part('dedication').enabled = false;
  await reopen();
  ok(await QC.has(page, '.qc-box.is-warning'), 'a part turned off: Out of date');
  await QC.run(page);
  ok((await partRows()).length === 0, 'Run again: the off part clears');
  // Turned on (empty epigraph): out of date, then the item.
  st.part('epigraph').enabled = true;
  await reopen();
  ok(await QC.has(page, '.qc-box.is-warning'), 'a part turned on: Out of date');
  await QC.run(page);
  P = await partRows();
  ok(JSON.stringify(P.map((r) => r.text)) === JSON.stringify(['Epigraph is on but empty.']), `Run again: the new part shows (${JSON.stringify(P.map((r) => r.text))})`);

  /* ── Focus ring on Open in 06, then Open in 06 lands on the part ── */
  await g(() => document.querySelector('#qc-g1 a[href*="&part="]').focus());
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const ring = await g(() => { const a = document.activeElement; const s = getComputedStyle(a); return [!!a.closest('#qc-g1') && /&part=/.test(a.getAttribute('href') || ''), s.outlineStyle, s.outlineWidth, s.outlineOffset]; });
  ok(ring[0] && ring[1] !== 'none' && ring[2] === '2px' && ring[3] === '2px', `Open in 06: focus ring 2 px, offset 2 px (${JSON.stringify(ring)})`);
  globalThis.__modes.parts = 1;
  await page.click('#qc-g1 a[href*="&part="]');
  await page.waitForURL(/step=6&part=/, { timeout: 8000 });
  const landed = await page.waitForFunction(() => { const t = document.querySelector('#wrSecTitle'); return t && t.textContent === 'Epigraph' && !!document.querySelector('[data-editor]'); }, null, { timeout: 10000 }).then(() => true, () => false);
  ok(landed && (page.url().match(/[?&]part=([^&]+)/) || [])[1] === st.part('epigraph').id, `Open in 06: the epigraph opens in 06 (${page.url().split('?')[1]})`);
  globalThis.__modes.parts = 0;

  /* ── 900 and 200% text: no sideways scroll ── */
  for (const w of [1440, 900]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await reopen();
    await g(() => { document.documentElement.style.fontSize = '200%'; });
    await rows1();
    await page.waitForTimeout(200);
    ok(await QC.noScroll(page), `${w} at 200% text: no sideways scroll`);
    await g(() => { document.documentElement.style.fontSize = ''; });
  }

  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  ok(!st.calls.some((c) => c.startsWith('ERR')), `no mock errors (${st.calls.filter((c) => c.startsWith('ERR')).join(' | ')})`);
  return log.join('\n');
};
