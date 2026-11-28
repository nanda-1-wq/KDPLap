// Step 06 Write, E17 Part 4 (designs 79, 80, 80c, 81): book parts in the manuscript list (FRONT above
// the Introduction, BACK under the Conclusion, only parts that are on, pills Empty / Draft / Final / Fixed /
// N books), the "+ Add a book part" menu (8 tick rows, keys as the Improve menu, Escape returns focus,
// turning a part on opens its editor, off keeps its text), the part editor (the section editor with a part
// target: autosave, versions, Compare, Restore; Status Draft/Final; no Generate; words only; the gray hint;
// Checks "Book parts have no checks."), the epigraph (no Improve, the hint, 1,000 characters), the review
// request page (fixed text, Turn off), Improve on a part (part_improve; the normal error with Retry until
// Part 6), the parts load error, chapter numbers and manuscript words ignore parts, 200% text.
// Run: tests/browser/run.sh write t-e17-parts.js
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W1 = 'e1e1e1e1-0000-4000-8000-000000000001';
  const g = (fn, arg) => page.evaluate(fn, arg);
  // A predicate that throws (an element not there yet) counts as false, so the wait goes on.
  const until = async (fn, arg, ms = 4000) => { try { await page.waitForFunction(([src, a]) => { try { return (0, eval)(`(${src})`)(a); } catch (e) { return false; } }, [fn.toString(), arg], { timeout: ms }); return true; } catch (e) { return false; } };
  const part = (k) => st.partOf(W1, k);
  const open = async (q = '', w = 1440, h = 900) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-ms-list', { timeout: 10000 });
    await page.waitForSelector('.wr-editor, .wr-fixed', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
  };
  const listState = () => g(() => {
    const items = [...document.querySelectorAll('.wr-ms-list > li')];
    const text = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
    return {
      order: items.map((li) => (li.classList.contains('wr-ms-group') ? li.querySelector('.chip-label').textContent : text(li.querySelector('.wr-ms-name')))),
      parts: [...document.querySelectorAll('[data-part]')].map((b) => [text(b.querySelector('.wr-ms-name')), text(b.querySelector('.wr-pill')), b.querySelector('.wr-pill').className]),
      count: text(document.querySelector('.wr-ms-count')),
      add: !!document.querySelector('[data-parts-add]')
    };
  });
  const menu = () => g(() => {
    const m = document.querySelector('#wrPartsMenu');
    if (!m) return null;
    const a = document.querySelector('[data-parts-add]');
    return { role: m.getAttribute('role'), rows: [...m.querySelectorAll('[role="menuitemcheckbox"]')].map((b) => [b.dataset.pmKind, b.getAttribute('aria-checked'), Math.round(b.getBoundingClientRect().height)]),
      focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pmKind || null : null,
      text: m.textContent.replace(/\s+/g, ' '), expanded: a ? a.getAttribute('aria-expanded') : null,
      inside: (() => { const r = m.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; })() };
  });
  const head = () => g(() => {
    const t = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
    return { where: t('.wr-where'), title: t('#wrSecTitle'), gen: !!document.querySelector('[data-generate]'), status: [...document.querySelectorAll('[data-status] option')].map((o) => o.value),
      statusVal: (document.querySelector('[data-status]') || {}).value || null, imp: !!document.querySelector('[data-imp-open]'), hint: t('[data-quote-hint]'),
      words: t('[data-words]'), ph: (document.querySelector('[data-editor]') || { dataset: {} }).dataset.placeholder || null, url: location.search, focus: document.activeElement && document.activeElement.id };
  });
  const writes = (t) => st.writes.filter((w) => w.table === t || w.fn === t);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  /* ── Before 0035 (no parts reply): nothing new shows ── */
  await open(`&section=${st.s42}`);
  const before = await listState();
  ok(!before.add && before.parts.length === 0 && !before.order.some((x) => /BOOK PARTS/.test(x)), `no 0035: no parts, no Add button (${JSON.stringify(before.order.slice(0, 2))})`);

  /* ── 79: the list ── */
  globalThis.__modes.parts = 1;
  part('dedication').enabled = true;
  Object.assign(part('about_author'), { enabled: true });
  st.parts.versions.push({ id: '8a000000-0000-4000-8000-000000000001', part_id: part('about_author').id, version_no: 1, content: 'Nora Hale teaches chair yoga.', word_count: 5, source: 'manual', label: null, partial: false, created_at: new Date(Date.now() - 864e5).toISOString() });
  part('about_author').current_version_id = '8a000000-0000-4000-8000-000000000001';
  part('review_request').enabled = true;
  part('also_by').enabled = true;
  st.parts.alsoBy[W1] = [{ position: 1, book_id: null, title: 'Chair Yoga for Beginners', subtitle: null, valid: true }];
  await open(`&section=${st.s42}`);
  const L = await listState();
  ok(L.order[0] === 'BOOK PARTS · FRONT' && L.order[1] === 'Introduction' && L.order[L.order.length - 2] === 'Conclusion' && L.order[L.order.length - 1] === 'BOOK PARTS · BACK',
    `79: FRONT above Introduction, BACK under Conclusion (${JSON.stringify([L.order[0], L.order[1], ...L.order.slice(-2)])})`);
  ok(JSON.stringify(L.parts.map((p) => p.slice(0, 2))) === JSON.stringify([['Dedication', 'Empty'], ['About the author', 'Draft'], ['Review request page', 'Fixed'], ['Also by', '1 book']]),
    `79: only parts that are on, with their pills (${JSON.stringify(L.parts.map((p) => p.slice(0, 2)))})`);
  ok(/is-not_started/.test(L.parts[0][2]) && !/is-final|is-not_started/.test(L.parts[1][2]), '79: Empty is dashed, Draft is the outline pill');
  ok(L.count === before.count, `79: manuscript words ignore parts (${L.count} = ${before.count})`);
  ok(L.order[2].startsWith('1 ·'), `79: chapter numbers ignore parts (${L.order[2]})`);
  ok(L.add, '79: "+ Add a book part" under the list');

  /* ── 79: the menu, keys and focus ── */
  await page.focus('[data-parts-add]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#wrPartsMenu', { timeout: 3000 });
  let M = await menu();
  ok(M.role === 'menu' && M.rows.length === 8 && M.expanded === 'true', `menu: role menu, 8 tick rows, aria-expanded (${M.rows.length})`);
  ok(JSON.stringify(M.rows.map((r) => r[1])) === JSON.stringify(['true', 'false', 'false', 'false', 'false', 'true', 'true', 'true']), `menu: ticks follow enabled (${M.rows.map((r) => r[1])})`);
  ok(M.rows.every((r) => r[2] >= 44), `menu: rows at least 44 px (${[...new Set(M.rows.map((r) => r[2]))]})`);
  ok(/FRONT OF THE BOOK/.test(M.text) && /BACK OF THE BOOK/.test(M.text) && /Turning a part off keeps its text\./.test(M.text) && /by another person/.test(M.text) && /fixed text/.test(M.text), 'menu: 2 groups, the note, the side notes');
  ok(M.focus === 'dedication' && M.inside, `menu: focus on the first row, inside the window (${M.focus})`);
  await page.keyboard.press('ArrowDown');
  ok((await menu()).focus === 'epigraph', 'menu: ArrowDown');
  await page.keyboard.press('End');
  ok((await menu()).focus === 'also_by', 'menu: End');
  await page.keyboard.press('Home');
  ok((await menu()).focus === 'dedication', 'menu: Home');
  await page.keyboard.press('ArrowUp');
  ok((await menu()).focus === 'also_by', 'menu: ArrowUp wraps');
  const ring = await g(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth]; });
  ok(ring[0] === 'solid' && ring[1] === '2px', `menu: visible 2 px focus ring (${ring})`);
  await page.keyboard.press('Escape');
  ok(!(await menu()) && await g(() => document.activeElement.matches('[data-parts-add]')) && await g(() => document.querySelector('[data-parts-add]').getAttribute('aria-expanded') === 'false'), 'menu: Escape closes, focus back on the button');
  await page.keyboard.press('Space');
  await page.waitForSelector('#wrPartsMenu', { timeout: 3000 });
  await page.keyboard.press('Tab');
  ok(!(await menu()), 'menu: Space opens, Tab closes');
  await page.click('[data-parts-add]');
  await page.waitForSelector('#wrPartsMenu');
  await page.mouse.click(900, 60);
  ok(!(await menu()), 'menu: a click outside closes');

  /* ── 80c: turn the epigraph on (keyboard): its editor opens (Q-P4) ── */
  await page.focus('[data-parts-add]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#wrPartsMenu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await until(() => document.querySelector('#wrSecTitle') && document.querySelector('#wrSecTitle').textContent === 'Epigraph');
  let H = await head();
  ok(part('epigraph').enabled && writes('book_parts').some((w) => w.body.enabled === true), 'on: book_parts.enabled saved');
  ok(!(await menu()) && H.title === 'Epigraph' && H.focus === 'wrSecTitle' && /&part=/.test(H.url), `on: the menu closes, the editor opens, focus on its name, ?part= (${H.focus} ${H.url})`);
  ok(H.where === 'Front of the book · Book part' && !H.gen && JSON.stringify(H.status) === '["draft","final"]', `80: head, no Generate, Status Draft/Final (${JSON.stringify(H)})`);
  ok(!H.imp && H.hint === 'Improve is off for quotes. Use your own words or a public domain quote.', `80c: no Improve, the hint (${H.hint})`);
  ok(H.ph === 'Type the quote. Put the name of the person who said it on its own line under it.' && H.words === '0 words', `80c: the gray hint, words only (${H.words})`);
  ok((await listState()).order[0] === 'BOOK PARTS · FRONT' && (await listState()).parts[1][0] === 'Epigraph', '79: Epigraph joins the FRONT list after Dedication');

  /* ── typing, autosave, Save version, the pill ── */
  await page.click('[data-editor]');
  await page.keyboard.type('Small steps add up. Anonymous');
  await until(() => true, null, 100);
  await page.waitForTimeout(1100);
  ok(writes('book_part_drafts').length >= 1 && writes('book_part_drafts').slice(-1)[0].body.part_id === part('epigraph').id, 'autosave: the draft goes to book_part_drafts');
  ok((await listState()).parts[1][1] === 'Draft', 'pill: Empty → Draft while typing');
  await page.click('[data-save-version]');
  await until(() => /Saved as v1/.test(document.querySelector('[data-foot-text]').textContent));
  ok(writes('save_part_version').length === 1 && st.parts.versions.some((v) => v.part_id === part('epigraph').id), 'Save version: save_part_version');

  /* ── 80c: 1,000 characters ── */
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.insertText(' ' + 'x'.repeat(965));
  const len = () => g(() => window.kdpMarkdown.fromDom(document.querySelector('[data-editor]')).length);
  const l1 = await len();
  await page.keyboard.type('abcdefghij');
  const l2 = await len();
  await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'y'.repeat(60)); document.querySelector('[data-editor]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  const l3 = await len();
  await page.keyboard.press('Enter');
  const l4 = await len();
  ok(l1 === 995 && l2 === 1000 && l3 === 1000 && l4 === 1000, `80c: typing stops at 1,000 characters (${l1}, ${l2}, ${l3}, ${l4})`);
  ok(/1,000 \/ 1,000 characters/.test((await head()).words), `80c: the count shows near the limit (${(await head()).words})`);
  await page.waitForTimeout(1100);
  ok(writes('book_part_drafts').every((w) => w.body.content.length <= 1000), 'epigraph: no draft over 1,000 characters is sent');
  await page.keyboard.press('Backspace');
  ok(await len() === 999, 'epigraph: deleting still works at the limit');

  /* ── Status Draft / Final ── */
  await page.selectOption('[data-status]', 'final');
  await until(() => [...document.querySelectorAll('[data-part] .wr-pill')].some((p) => p.classList.contains('is-final')));
  await page.waitForTimeout(300);
  ok(part('epigraph').status === 'final' && (await listState()).parts[1][1] === 'Final', 'Status Final: saved, the pill is Final (ink)');
  await page.selectOption('[data-status]', 'draft');
  await page.waitForTimeout(300);
  ok(part('epigraph').status === 'draft', 'Status Draft: saved');

  /* ── 80: the panel, Versions and Checks ── */
  if (!(await g(() => getComputedStyle(document.querySelector('.wr-side')).display !== 'none'))) await page.click('[data-panel-toggle]');
  await page.click('[data-tab="versions"]');
  const vers = await g(() => document.querySelector('[data-panel]').textContent.replace(/\s+/g, ' '));
  ok(/EPIGRAPH · VERSIONS/.test(vers) && /v1/.test(vers), `Versions: the part's versions (${vers.slice(0, 60)})`);
  await page.click('[data-tab="checks"]');
  ok(/Book parts have no checks\./.test(await g(() => document.querySelector('[data-panel]').textContent)) && await g(() => document.querySelector('[data-tab="checks"]').textContent.trim() === 'Checks'), 'Checks: "Book parts have no checks.", no count');
  await page.click('[data-tab="versions"]');

  /* ── Turn off keeps its text; on again brings it back (P3) ── */
  await page.click('[data-save-version]').catch(() => {});
  await page.waitForTimeout(300);
  const textBefore = await len();
  await page.click('[data-parts-add]');
  await page.waitForSelector('#wrPartsMenu');
  await page.click('[data-pm-kind="epigraph"]');
  await until(() => !document.querySelector('[data-part]') || ![...document.querySelectorAll('[data-part] .wr-ms-name')].some((n) => n.textContent === 'Epigraph'));
  await page.waitForTimeout(300);
  ok(!part('epigraph').enabled && (await menu()) && (await menu()).rows[1][1] === 'false', 'off: saved, the menu stays open with the row unticked');
  ok((await head()).title !== 'Epigraph' && st.parts.versions.filter((v) => v.part_id === part('epigraph').id).length >= 1, `off: another place opens, the versions stay (${(await head()).title})`);
  await page.click('[data-pm-kind="epigraph"]');
  await until(() => document.querySelector('#wrSecTitle') && document.querySelector('#wrSecTitle').textContent === 'Epigraph');
  await page.waitForTimeout(300);
  ok(await len() === textBefore, `on again: the text is back (${await len()} = ${textBefore})`);

  /* ── 80: Dedication, Improve sends part_improve; the normal error with Retry ── */
  await page.click(`[data-part="${part('dedication').id}"]`);
  await until(() => document.querySelector('#wrSecTitle') && document.querySelector('#wrSecTitle').textContent === 'Dedication' && !!document.querySelector('[data-editor]'), null, 15000);
  H = await head();
  ok(H.imp && H.ph.startsWith('Write your dedication.'), `80: Improve button kept, the dedication hint (${H.ph})`);
  await page.click('[data-editor]');
  await page.keyboard.type('For my mother, who never stopped moving.');
  await g(() => { const ed = document.querySelector('[data-editor]'); const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus(); document.dispatchEvent(new Event('selectionchange')); });
  await page.waitForTimeout(300);
  await page.click('[data-imp-open]');
  await page.waitForSelector('[data-imp-menu]', { timeout: 3000 });
  await page.click('[data-imp-act="shorten"]');
  await until(() => window.__imp.requests.length === 1);
  const req = await g(() => window.__imp.requests[0].body);
  ok(req.stage === 'part_improve' && req.partId === part('dedication').id && !req.sectionId, `Improve: part_improve with the part id (${req.stage})`);
  await g(() => window.__imp.reply(500, { error: 'server_error' }));
  await until(() => /Retry|Try again/.test((document.querySelector('[data-imp-card]') || {}).textContent || ''));
  ok(/Something went wrong on our side\./.test(await g(() => document.querySelector('[data-imp-card]').textContent)), 'Improve: a server error shows the normal error with Retry');
  await page.keyboard.press('Escape');

  /* ── Compare and Restore on a part (About the author) ── */
  await page.click(`[data-part="${part('about_author').id}"]`);
  await until(() => document.querySelector('#wrSecTitle').textContent === 'About the author');
  await page.click('[data-editor]');
  await page.keyboard.press('End');
  await page.keyboard.type(' She lives in Leeds.');
  await page.click('[data-save-version]');
  await until(() => /Saved as v2/.test(document.querySelector('[data-foot-text]').textContent));
  await until(() => document.querySelector('[data-compare]'));
  await page.click('[data-compare]');
  await until(() => document.querySelector('dialog[open]') && /v1/.test(document.querySelector('dialog[open]').textContent) && !/Loading/.test(document.querySelector('dialog[open]').textContent));
  ok(await g(() => /teaches chair yoga/.test(document.querySelector('dialog[open]').textContent)), 'Compare: reads the part version');
  await page.keyboard.press('Escape');
  await page.click('[data-restore]');
  await until(() => /Saved as v3/.test(document.querySelector('[data-foot-text]').textContent));
  ok(writes('restore_part_version').length === 1 && await g(() => !/Leeds/.test(document.querySelector('[data-editor]').textContent)), 'Restore: restore_part_version, v3 is the old text');

  /* ── 81: the review request page ── */
  await page.click(`[data-part="${part('review_request').id}"]`);
  await page.waitForSelector('.wr-fixed-page');
  const R = await g(() => ({ text: document.querySelector('.wr-fixed-page').textContent.replace(/\s+/g, ' ').trim(), em: document.querySelector('.wr-fixed-page em').textContent,
    tag: (document.querySelector('.wr-fixed-tag') || {}).textContent, off: !!document.querySelector('[data-part-off]'), editor: !!document.querySelector('[data-editor]'), status: !!document.querySelector('[data-status]') }));
  ok(R.text.startsWith('A short request Thank you for reading Chair Yoga for Seniors Over 60.') && /honest review on Amazon/.test(R.text) && R.text.endsWith('Nora Hale'), `81: the fixed text, title and pen name filled in (${R.text.slice(0, 80)})`);
  ok(R.em === 'Chair Yoga for Seniors Over 60' && R.tag === 'Fixed text' && R.off && !R.editor && !R.status, '81: title in italics, "Fixed text", Turn off, no editor, no Status');
  await page.click('[data-part-off]');
  await until(() => !part('review_request').enabled && !document.querySelector(`[data-part="${part('review_request').id}"]`));
  await page.waitForTimeout(300);
  ok(!part('review_request').enabled && await g(() => document.activeElement.matches('[data-parts-add]')), '81: Turn off saves, the page leaves the list, focus on Add');

  /* ── Errors: turning on fails; the parts load fails ── */
  globalThis.__modes.partSetError = 1;
  await page.click('[data-parts-add]');
  await page.waitForSelector('#wrPartsMenu');
  await page.click('[data-pm-kind="preface"]');
  await until(() => /couldn’t turn preface on/.test((document.querySelector('#wrPartsMenu') || {}).textContent || ''));
  ok(!part('preface').enabled && /We couldn’t turn preface on\. Try again\./.test(await g(() => document.querySelector('#wrPartsMenu').textContent)), 'error: the menu says what failed; nothing changed');
  await page.keyboard.press('Escape');
  globalThis.__modes.partsError = 1;
  await open(`&section=${st.s42}`);
  ok(await g(() => /We couldn’t load the book parts\./.test(document.querySelector('.wr-ms').textContent) && !!document.querySelector('[data-parts-retry]')), 'load error: the list says so, with Try again');
  await page.click('[data-parts-retry]');
  await until(() => !!document.querySelector('[data-parts-add]'));
  ok(await g(() => !!document.querySelector('[data-parts-add]') && document.querySelectorAll('[data-part]').length > 0), 'load error: Try again loads the parts');

  /* ── ?part= opens the part on load ── */
  await open(`&part=${part('epigraph').id}`);
  ok((await head()).title === 'Epigraph', '?part=: a reload opens the same part');

  /* ── 200% text: no sideways scroll, the menu fits ── */
  for (const w of [1440, 900]) {
    await open(`&part=${part('dedication').id}`, w, 900);
    await g(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(250);
    await page.click('[data-parts-add]');
    await page.waitForSelector('#wrPartsMenu');
    const z = await g(() => ({ side: document.documentElement.scrollWidth > innerWidth + 1, menu: (() => { const r = document.querySelector('#wrPartsMenu').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; })() }));
    ok(!z.side && z.menu, `${w} at 200% text: no sideways scroll, the menu inside the window (${JSON.stringify(z)})`);
    await page.keyboard.press('Escape');
    await g(() => { document.documentElement.style.fontSize = ''; });
  }

  ok(errs.length === 0, `no page errors (${errs.join(' | ')})`);
  return log.join('\n');
};
