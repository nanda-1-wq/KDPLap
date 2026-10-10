// Step 06 Write (E10.1): the gate, the design 22 layout, the rail, the
// manuscript list, the section head, the right panel tabs, and the states.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-gate, .wr-editor, .wr .alert, .wr-empty-pick', { timeout: 10000 });
    await page.waitForTimeout(300);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const reason = (n) => page.$eval(`a[data-step="${n}"]`, (a) => { const m = a.querySelector('[data-step-missing]'); return m ? m.textContent : ''; });
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. No outline: the gate points to 05.
  await open(W3);
  ok(/Make an outline first/.test(await txt('.wr-gate')), 'no outline: Make an outline first');
  ok(await page.$eval('.wr-gate a', (a) => a.getAttribute('href').endsWith('&step=5')), 'no outline: link to 05');
  ok(!(await page.$('.wr-editor')) && !(await page.$('.wr-ms-list')), 'no outline: no editor, no manuscript');
  ok((await reason(6)) === '', `no outline: no 06 reason ("${await reason(6)}")`);

  // 2. Outline not approved, no writing: the gate asks for approval; the link opens 05.
  await open(W2);
  ok(/Approve the outline first/.test(await txt('.wr-gate')), 'not approved: Approve the outline first');
  await page.click('.wr-gate a');
  await page.waitForSelector('.otl', { timeout: 10000 });
  ok(page.url().includes('step=5'), 'gate link opens 05');

  // 3. Approved, design 22: the rail, the manuscript list, ?section= opens 4.2.
  await open(W1, st.s42);
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), 'rail: the steps sidebar is folded on 06');
  ok(await page.$eval('[data-rail-toggle]', (b) => b.getAttribute('aria-expanded') === 'false' && b.getAttribute('aria-label') === 'Open the steps sidebar'), 'rail: toggle says Open');
  const navW = await page.$eval('.book-nav', (e) => Math.round(e.getBoundingClientRect().width));
  ok(navW === 76, `rail: 76 px wide (${navW})`);
  await page.click('[data-rail-toggle]');
  ok(!(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail'))) && await page.$eval('.book-nav', (e) => e.getBoundingClientRect().width > 200), 'rail: Open shows the full sidebar');
  await page.click('[data-rail-toggle]');
  ok(await page.$eval('.book-layout', (e) => e.classList.contains('is-rail')), 'rail: folds again');

  ok((await txt('.wr-ms-head')) === 'MANUSCRIPT 129 / 11,100', `manuscript total: "${await txt('.wr-ms-head')}"`);
  ok((await txt('.wr-ms-list > li:first-child')) === 'Introduction Final', `Introduction row: "${await txt('.wr-ms-list > li:first-child')}"`);
  ok((await txt('.wr-ms-list > li:last-child')) === 'Conclusion Not started', 'Conclusion row');
  ok(await page.$eval('[data-toggle]', (b) => /^1 · Why Chair Yoga Works After 60/.test(b.innerText.replace(/\s+/g, ' ').trim())), 'chapter rows numbered');
  const ch4 = await page.$$eval('.wr-ms-ch', (bs) => bs.map((b) => [b.innerText.replace(/\s+/g, ' ').trim(), b.getAttribute('aria-expanded')]).find(([t]) => t.startsWith('4 ·')));
  ok(ch4 && ch4[0] === '4 · Upper Body: Neck, Shoulders, Arms Draft' && ch4[1] === 'true', `chapter 4 open with Draft: ${JSON.stringify(ch4)}`);
  const secs = await page.$$eval('.wr-ms-secs:not([hidden]) .wr-ms-sec', (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
  ok(JSON.stringify(secs) === JSON.stringify(['4.1 Neck turns and tilts Final', '4.2 Shoulder rolls, both ways Draft', '4.3 Arm circles below the shoulder Not started']), `chapter 4 sections: ${JSON.stringify(secs)}`);
  ok(await page.$eval('[data-section][aria-current="true"]', (b) => b.innerText.includes('4.2')), '4.2 is current in the list');
  ok(await page.$$eval('.wr-ms-ch', (bs) => bs.filter((b) => b.getAttribute('aria-expanded') === 'true').length) === 1, 'only the open chapter is expanded');

  ok((await txt('.wr-where')) === 'Chapter 4 · Upper Body: Neck, Shoulders, Arms', `section where: "${await txt('.wr-where')}"`);
  ok((await txt('[data-sec-title]')) === '4.2 Shoulder rolls, both ways', 'section title');
  ok(await page.$eval('[data-status]', (s) => s.value) === 'draft', 'Status select: Draft');
  ok(await page.$eval('[data-editor]', (e) => e.querySelector('h2') && e.querySelector('h2').textContent === 'Shoulder rolls, both ways' && e.querySelector('strong').textContent === 'five times' && e.querySelector('em').textContent === 'chin' && e.querySelectorAll('ul li').length === 2), 'editor shows the Markdown as heading, bold, italic, list');
  ok(await page.$eval('[data-editor]', (e) => getComputedStyle(e).fontFamily.includes('Source Serif 4')), 'editor uses Source Serif 4');
  ok((await txt('[data-words]')) === '77 / 450 words', `words: "${await txt('[data-words]')}"`);
  ok(/^Saved as v3 · 2 min ago Save version$/.test(await txt('[data-foot]')), `foot: "${await txt('[data-foot]')}"`);
  ok(await page.$eval('[data-save-version]', (b) => b.disabled), 'Save version disabled with no changes');
  ok(page.url().includes(`&section=${st.s42}`), 'URL keeps the section');
  ok((await reason(6)) === '23 sections not final', `sidebar 06 reason: "${await reason(6)}"`);
  ok((await txt('[data-next-note]')) === 'Not done yet: 23 sections not final.', `Next note: "${await txt('[data-next-note]')}"`);
  ok(await page.$eval('[data-next]', (b) => b.disabled), 'Next is off on the last v1 step');

  // Right panel: Versions (design 22), Checks, Brief.
  const vers = await page.$$eval('.wr-ver', (ls) => ls.map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
  ok(vers.length === 3 && /^v3 · Humanized Current 2 min ago · 77 words$/.test(vers[0]) && /^v2 · Expanded 1 h ago 63 words Compare Restore$/.test(vers[1]) && /^v1 · First draft 9 h ago 42 words Compare Restore$/.test(vers[2]), `versions: ${JSON.stringify(vers)}`);
  ok((await txt('.wr-panel .chip-label')) === '4.2 · VERSIONS', 'versions heading 4.2');
  ok(/Nothing is overwritten\./.test(await txt('.wr-panel')), 'versions note');
  await page.click('[data-tab="checks"]');
  ok(/come in E10\.3/.test(await txt('.wr-panel')) && await page.$eval('[data-tab="checks"]', (b) => b.getAttribute('aria-selected') === 'true'), 'Checks tab: coming in E10.3');
  await page.keyboard.press('ArrowRight');
  ok(await page.$eval('[data-tab="brief"]', (b) => b.getAttribute('aria-selected') === 'true' && document.activeElement === b), 'arrow key moves to Brief');
  const brief = await txt('.wr-panel');
  ok(/CHAPTER OBJECTIVE Reader can do 6 upper-body moves, none overhead/.test(brief) && /READER Adults over 60/.test(brief) && /READER PROMISE After finishing this book/.test(brief) && /Read only/.test(brief), `Brief tab: "${brief.slice(0, 160)}"`);
  await page.click('[data-tab="versions"]');
  await page.screenshot({ path: `${SHOTS}/t1-design22.png` });

  // A chapter folds and opens.
  await page.click('.wr-ms-ch:nth-of-type(1)');
  const firstCh = await page.$eval('.wr-ms-list > li:nth-child(2) .wr-ms-ch', (b) => b.getAttribute('aria-expanded'));
  ok(firstCh === 'true' && await page.$eval('.wr-ms-list > li:nth-child(2) .wr-ms-secs', (u) => !u.hidden), 'chapter 1 opens on click');

  // 4. No ?section=: the first section that is not Final.
  await open(W1);
  ok((await txt('[data-sec-title]')) === '1.2 Why a chair makes yoga safer', `default section: "${await txt('[data-sec-title]')}"`);
  ok(/Start writing this section/.test(await page.$eval('[data-editor]', (e) => e.dataset.placeholder)) && await page.$eval('[data-editor]', (e) => e.classList.contains('is-empty')), 'empty section: placeholder');
  ok(/^Nothing written yet\. Save version$/.test(await txt('[data-foot]')), `empty foot: "${await txt('[data-foot]')}"`);
  ok(/No versions yet/.test(await txt('.wr-panel')), 'empty section: no versions yet');
  ok((await txt('[data-words]')) === '0 / 350 words', 'empty: 0 / 350 words');

  // 5. Approval removed by a 05 edit, writing exists: Write stays open with a note.
  await open(W4);
  ok(!!(await page.$('.wr-editor')), 'approval gone + writing: Write opens');
  ok(/The outline changed since you approved it\./.test(await txt('[data-notes]')), `outline changed note: "${await txt('[data-notes]')}"`);
  await page.click('[data-notes] a');
  await page.waitForSelector('.otl', { timeout: 10000 });
  ok(page.url().includes('step=5'), 'note link opens 05');

  // 6. Unlocked after writing: Needs review pills and note, sidebar flag.
  await open(W6, st.outline[W6][1].sections[0].id);
  ok(await page.$$eval('.wr-review', (p) => p.length) >= 2, 'Needs review pills (chapter and section)');
  ok(/Needs review\. This section was written before the positioning was unlocked/.test(await txt('[data-notes]')), 'Needs review note');
  ok(await page.$eval('a[data-step="6"]', (a) => !!a.querySelector('.step-flag')), 'sidebar 06 flag');
  // Two pills never squeeze the name (bug seen in the first run: one letter a line).
  const nameW = await page.$$eval('.wr-ms-name', (ns) => Math.min(...ns.filter((n) => n.offsetParent).map((n) => n.getBoundingClientRect().width)));
  ok(nameW >= 100, `manuscript names keep their width (${Math.round(nameW)} px)`);
  await page.screenshot({ path: `${SHOTS}/t1-needs-review.png` });

  // 7. Load error with Try again.
  modes.outlineError = true;
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-retry-load]', { timeout: 10000 });
  ok(/We couldn’t load the manuscript\./.test(await txt('.wr')), 'load error message');
  modes.outlineError = false;
  await page.click('[data-retry-load]');
  await page.waitForSelector('.wr-editor', { timeout: 10000 });
  ok(true, 'Try again loads');

  // 8. Section load error with Try again.
  modes.sectionError = true;
  await page.click(`[data-section="${st.outline[W1][0].sections[0].id}"]`);
  await page.waitForSelector('[data-retry-section]', { timeout: 10000 });
  ok(/We couldn’t load this section\. Your writing is safe\./.test(await txt('.wr-main')), 'section error message');
  modes.sectionError = false;
  await page.click('[data-retry-section]');
  await page.waitForSelector('.wr-editor', { timeout: 10000 });
  ok((await txt('[data-sec-title]')) === 'Introduction', 'Try again opens the Introduction');

  // 9. Narrow desktop (900 px): one column, no page scroll sideways.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll at 900 px');
  await page.screenshot({ path: `${SHOTS}/t1-900.png`, fullPage: false });
  return log.join('\n');
};
