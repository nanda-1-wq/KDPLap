// Step 06 Write: fixes after the E10.1 live check (STOP 2).
//  2. The conflict choice shows once (on open, on save, on restore).
//  3. The page itself never scrolls: the manuscript list, the editor text and the
//     right panel scroll on their own, full height (design 22), at 1440 and 900 px.
//  4. Back in the tab (focus / visibilitychange): a newer version saved in another
//     tab shows the choice at once, and the text on screen stays.
// (Fix 1, the 05 Remove dialog for a draft-only section, is in outline/t-struct.js.)
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const cards = () => page.$$eval('[data-notes] .wr-note', (n) => n.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  const saves = () => st.writes.filter((w) => w.fn === 'save_version');
  const settle = async () => {
    await page.waitForTimeout(900);
    for (let i = 0; i < 40; i++) {
      const s = await page.$eval('[data-saved-line]', (e) => e.dataset.state).catch(() => '');
      if (s !== 'saving') break;
      await page.waitForTimeout(100);
    }
  };
  /** A version saved by "another tab": the store changes behind this page's back. */
  const otherTab = (sid, content) => {
    const no = st.versions.filter((v) => v.section_id === sid).length + 1;
    const v = { id: `f${String(no).padStart(7, '0')}-1111-4000-8000-${sid.slice(-12)}`, section_id: sid, version_no: no, content, word_count: st.count(content), source: 'manual', label: null, partial: false, created_at: new Date().toISOString() };
    st.versions.push(v);
    for (const bid of Object.keys(st.outline)) for (const c of st.outline[bid]) for (const s of c.sections) if (s.id === sid) s.current_version_id = v.id;
    return v;
  };
  /** Layout facts for the Write page. */
  const layout = () => page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY, bg: getComputedStyle(e).backgroundColor }; };
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth,
      ms: r('.wr-ms'), main: r('.wr-main'), side: r('.wr-side'), editor: r('.wr-editor'), head: r('.book-head')
    };
  });
  const scrollsOnItsOwn = async (sel) => {
    const before = await page.evaluate(() => window.scrollY);
    await page.hover(sel);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const r = await page.evaluate((s) => ({ el: document.querySelector(s).scrollTop, win: window.scrollY }), sel);
    return r.el > 0 && r.win === before && r.win === 0;
  };

  // 2. The conflict choice shows once.
  await page.setViewportSize({ width: 1440, height: 960 });
  await open(W5, st.c11);
  let c = await cards();
  ok(c.length === 1 && /^This section changed in another tab\./.test(c[0]), `on open: one card (${c.length})`);
  ok((await page.$$('[data-use-draft]')).length === 1 && (await page.$$('[data-keep-saved]')).length === 1, 'on open: one pair of buttons');

  // On save: type, another tab saves, Save version → one card, the text stays.
  await open(W1, st.s42);
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Typed before the other tab saved.');
  await settle();
  otherTab(st.s42, 'Saved in the other tab while this one typed.');
  await page.click('[data-save-version]');
  await page.waitForSelector('[data-use-draft]', { timeout: 5000 });
  c = await cards();
  ok(c.length === 1 && /^This section changed in another tab\./.test(c[0]), `on save: one card (${JSON.stringify(c)})`);
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim().endsWith('Typed before the other tab saved.') && e.getAttribute('contenteditable') === 'false'), 'on save: the text on screen stays, read only');
  await page.click('[data-use-draft]');
  await page.waitForSelector('[data-editor][contenteditable="true"]', { timeout: 5000 });
  const last = saves().pop();
  ok(/Typed before the other tab saved\.$/.test(last.body.p_content) && last.body.p_base_version_id === st.versions.find((v) => v.content === 'Saved in the other tab while this one typed.').id, 'Use my draft: saved on top of the other tab\'s version');
  ok((await cards()).length === 0, 'after the choice: no card');

  // On restore: another tab saves, Restore → one card, no second warning.
  await page.waitForSelector('[data-restore]', { timeout: 5000 });
  otherTab(st.s42, 'Saved in the other tab before the restore.');
  await page.click('[data-restore]');
  await page.waitForTimeout(800);
  c = await cards();
  ok(c.length <= 1 && !c.some((x) => /then restore again/.test(x)), `on restore: at most one card (${JSON.stringify(c)})`);
  ok(/Saved in the other tab before the restore\./.test(await page.$eval('[data-editor]', (e) => e.innerText)) || c.length === 1, 'on restore with nothing typed: the newest text loads');

  // 3. Layout: no page scroll; each column scrolls on its own, full height.
  for (const [w, h] of [[1440, 960], [900, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await open(W7, st.long);
    const words = Number((await txt('[data-words]')).split(' ')[0].replace(/,/g, ''));
    ok(words >= 1100, `${w}: a long section (${words} words)`);
    const L = await layout();
    ok(L.docH <= L.vh && L.docW <= L.vw, `${w}: the page does not scroll (${L.docW}×${L.docH} in ${L.vw}×${L.vh})`);
    ok(L.editor.sh > L.editor.ch && L.editor.oy === 'auto', `${w}: the editor text scrolls inside (${L.editor.sh} > ${L.editor.ch})`);
    ok(L.ms.oy === 'auto' && L.side.oy === 'auto' && L.main.bottom <= L.vh, `${w}: list and panel have their own scroll`);
    ok(L.ms.top === L.head.bottom && L.ms.bottom === L.vh, `${w}: the list column is full height (${L.ms.top}..${L.ms.bottom}, head ends ${L.head.bottom})`);
    ok(L.side.bottom === L.vh, `${w}: the right panel reaches the bottom (${L.side.bottom})`);
    ok(await scrollsOnItsOwn('.wr-editor'), `${w}: wheel over the editor scrolls only the editor`);
    // Open every chapter so the list is longer than its column.
    for (const b of await page.$$('.wr-ms-ch[aria-expanded="false"]')) await b.click();
    ok(await scrollsOnItsOwn('.wr-ms') || (await page.$eval('.wr-ms', (e) => e.scrollHeight <= e.clientHeight)), `${w}: the list scrolls on its own (or fits)`);
    await page.screenshot({ path: `${SHOTS}/t-fixes-layout-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  // 4a. Focus with typing on screen: another tab saved → the choice at once, the text stays.
  await open(W1, st.outline[W1][2].sections[2].id);
  await page.click('[data-editor]');
  await page.keyboard.type('Five safety checks, typed in this tab.');
  await settle();
  const sid = st.outline[W1][2].sections[2].id;
  const before = st.writes.length;
  otherTab(sid, 'Saved in another tab meanwhile.');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('[data-use-draft]', { timeout: 5000 });
  c = await cards();
  ok(c.length === 1 && /This section changed in another tab\./.test(c[0]), 'focus: the choice shows at once, once');
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim() === 'Five safety checks, typed in this tab.'), 'focus: the text on screen stays');
  ok(st.drafts[sid] && st.drafts[sid].content === 'Five safety checks, typed in this tab.', 'focus: the typing is kept on the server as a draft');
  ok(!st.writes.slice(before).some((w) => w.fn === 'save_version'), 'focus: no version is saved over the other tab');
  await page.click('[data-keep-saved]');
  await page.waitForSelector('[data-editor][contenteditable="true"]', { timeout: 5000 });
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim() === 'Saved in another tab meanwhile.'), 'Keep saved version: the other tab\'s text is current');
  ok(st.versions.some((v) => v.section_id === sid && v.content === 'Five safety checks, typed in this tab.'), 'Keep saved version: our typing is kept as a version');

  // 4b. visibilitychange with nothing typed: the newest text simply loads.
  otherTab(sid, 'Saved again in the other tab.');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => /Saved again in the other tab\./.test(document.querySelector('[data-editor]') ? document.querySelector('[data-editor]').innerText : ''), null, { timeout: 5000 });
  ok((await cards()).length === 0 && /updated in another tab/.test(await txt('[data-live]')), 'visible again, nothing typed: newest text, no card, announced');

  // 4c. Focus with nothing new: no reload, no card.
  const reads = st.calls.filter((x) => x.includes('/section_drafts')).length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(600);
  ok((await cards()).length === 0 && st.calls.filter((x) => x.includes('/section_drafts')).length === reads, 'focus, nothing new: nothing happens');
  return log.join('\n');
};
