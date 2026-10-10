// Step 06 Write (E10.1): Compare (design 23), Restore (a new version, nothing
// overwritten), Status, another tab saved (conflict on open and on save).
// 10 minutes idle: t-idle.js (fake clock).
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForSelector('.wr-ver', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const saves = () => st.writes.filter((w) => w.fn === 'save_version');
  const restores = () => st.writes.filter((w) => w.fn === 'restore_version');
  const ver = (sid, n) => st.versions.find((v) => v.section_id === sid && v.version_no === n);
  const settle = async () => {
    await page.waitForTimeout(900);
    for (let i = 0; i < 40; i++) {
      const s = await page.$eval('[data-saved-line]', (e) => e.dataset.state).catch(() => '');
      if (s !== 'saving') break;
      await page.waitForTimeout(100);
    }
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. Compare v2 Expanded → v3 Humanized (design 23).
  await open(W1, st.s42);
  await page.click(`[data-compare="${ver(st.s42, 2).id}"]`);
  await page.waitForSelector('.wr-cmp[open] del', { timeout: 5000 });
  ok((await txt('#wrCmpTitle')) === 'v2 Expanded → v3 Humanized', `compare title: "${await txt('#wrCmpTitle')}"`);
  const del = await page.$$eval('.wr-cmp-body del', (d) => d.map((x) => x.textContent).join('|'));
  const ins = await page.$$eval('.wr-cmp-body ins', (d) => d.map((x) => x.textContent).join('|'));
  ok(/This gentle yet powerful movement serves as a wonderful foundation for/.test(del), `removed words: "${del}"`);
  ok(/Do this five times\./.test(ins) && /Sit near the front of your chair/.test(ins), `added words: "${ins}"`);
  ok(!/\*\*|##/.test(await txt('.wr-cmp-body')), 'compare shows text without Markdown markers');
  ok((await txt('.wr-cmp-legend')) === 'Removed Added' && await page.$$eval('.wr-cmp-legend svg', (s) => s.length) === 2, 'legend: icon and word for each');
  ok((await txt('[data-cmp-restore]')) === 'Restore v2', 'Restore v2 in the dialog');
  await page.screenshot({ path: `${SHOTS}/t-versions-compare.png` });
  await page.click('.wr-cmp [data-close]');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.compare !== undefined), 'focus back on Compare');

  // 2. Restore v1 from the list: restore_version with the base; a new v4 "Restored from v1".
  await page.click(`[data-restore="${ver(st.s42, 1).id}"]`);
  await page.waitForFunction(() => /Saved as v4/.test(document.querySelector('[data-foot]') ? document.querySelector('[data-foot]').innerText : ''), null, { timeout: 5000 });
  const r1 = restores().pop();
  ok(r1 && r1.body.p_version_id === ver(st.s42, 1).id && r1.body.p_base_version_id === ver(st.s42, 3).id, `restore body: ${JSON.stringify(r1 && r1.body)}`);
  ok(saves().length === 0, 'no unsaved typing: no extra version before the restore');
  ok(await page.$eval('[data-editor]', (e) => !/five times/.test(e.innerText) && /Keep your neck long/.test(e.innerText)), 'editor shows the v1 text');
  await page.waitForFunction(() => document.querySelectorAll('.wr-ver').length === 4, null, { timeout: 5000 });
  const top = await txt('.wr-ver.is-current');
  ok(/^v4 · Restored from v1 Current/.test(top), `v4 current: "${top}"`);
  ok(ver(st.s42, 3).content.includes('five times') && ver(st.s42, 1).source === 'generate', 'old versions unchanged');
  ok(/Restored v1 as version 4\./.test(await txt('[data-live]')), 'announced');

  // 3. Restore with unsaved typing: the typing is saved as a version first, then the restore.
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Breathe out slowly.');
  await settle();
  const nS = saves().length, nR = restores().length;
  await page.click(`[data-restore="${ver(st.s42, 3).id}"]`);
  await page.waitForFunction(() => /Saved as v6/.test(document.querySelector('[data-foot]') ? document.querySelector('[data-foot]').innerText : ''), null, { timeout: 5000 });
  const order = st.writes.filter((w) => w.fn).slice(-2).map((w) => w.fn).join(',');
  ok(saves().length === nS + 1 && restores().length === nR + 1 && order === 'save_version,restore_version', `typing saved first: ${order}`);
  ok(ver(st.s42, 5).content.endsWith('Breathe out slowly.') && ver(st.s42, 6).label === 'Restored from v3', 'v5 is the typing, v6 the restore');

  // 4. Restore from the Compare dialog.
  await page.click(`[data-compare="${ver(st.s42, 2).id}"]`);
  await page.waitForSelector('.wr-cmp[open] [data-cmp-body] del, .wr-cmp[open] [data-cmp-body] ins', { timeout: 5000 });
  ok(/^v2 Expanded → v6 Restored from v3$/.test(await txt('#wrCmpTitle')), `compare title after restores: "${await txt('#wrCmpTitle')}"`);
  await page.click('[data-cmp-restore]');
  await page.waitForFunction(() => /Saved as v7/.test(document.querySelector('[data-foot]') ? document.querySelector('[data-foot]').innerText : ''), null, { timeout: 5000 });
  ok(ver(st.s42, 7).content === ver(st.s42, 2).content, 'restore from the dialog');

  // 5. Restore error: nothing changes, a message.
  modes.restoreError = true;
  await page.click(`[data-restore="${ver(st.s42, 1).id}"]`);
  await page.waitForTimeout(600);
  ok(/We couldn’t restore that version\. Nothing changed\./.test(await txt('[data-notes]')), 'restore error message');
  modes.restoreError = false;

  // 6. Status: saves at once; an error puts it back.
  await page.selectOption('[data-status]', 'reviewed');
  await page.waitForTimeout(400);
  const sw = st.writes.filter((w) => w.table === 'sections').pop();
  ok(sw && sw.id === st.s42 && sw.body.status === 'reviewed', 'status saved');
  ok(/4\.2 Shoulder rolls, both ways Reviewed/.test(await txt(`[data-section="${st.s42}"]`)), 'list pill follows');
  modes.statusError = true;
  await page.selectOption('[data-status]', 'final');
  await page.waitForTimeout(500);
  ok(/4\.2 Shoulder rolls, both ways Reviewed/.test(await txt(`[data-section="${st.s42}"]`)) && /We couldn’t save the status/.test(await txt('[data-notes]')), 'status error: back to Reviewed');
  modes.statusError = false;
  // Typing in a Reviewed section keeps its status (owner to confirm).
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Slowly.');
  await page.click('[data-save-version]');
  await page.waitForTimeout(600);
  ok(await page.$eval('[data-status]', (s) => s.value) === 'reviewed', 'a save keeps Reviewed');

  // 7. Another tab saved: a draft from an older version shows the choice; the editor is read only.
  await open(W5, st.c11);
  ok(/This section changed in another tab\./.test(await txt('[data-notes]')), 'conflict note on open');
  ok(await page.$eval('[data-editor]', (e) => e.getAttribute('contenteditable') === 'false' && /Typed here, in this tab/.test(e.innerText)), 'editor read only, shows the draft');
  ok(await page.$eval('[data-cmd="bold"]', (b) => b.disabled) && await page.$eval('[data-status]', (s) => s.disabled), 'toolbar and Status off');
  ok(!(await page.$('.wr-ver.is-unsaved')) && /^Choose which text to keep above\. Save version$/.test(await txt('[data-foot]')) && await page.$eval('[data-save-version]', (b) => b.disabled), 'conflict: no Save version, no Unsaved row');
  await page.screenshot({ path: `${SHOTS}/t-versions-conflict.png` });
  const v2id = ver(st.c11, 2).id;
  await page.click('[data-use-draft]');
  await page.waitForFunction(() => !document.querySelector('[data-use-draft]') && document.querySelector('[data-editor]') && document.querySelector('[data-editor]').getAttribute('contenteditable') === 'true', null, { timeout: 5000 });
  const ud = saves().pop();
  ok(ud.body.p_base_version_id === v2id && ud.body.p_make_current === true && /Typed here/.test(ud.body.p_content), 'Use my draft: saved as the newest version from v2');
  ok(/Typed here/.test(ver(st.c11, 3).content) && st.versions.find((v) => v.id === v2id).content.includes('other tab'), 'v3 is the draft, v2 kept');
  ok(/Your draft is now version 3\./.test(await txt('[data-live]')), 'announced');

  // 8. Keep saved version: the draft becomes a version that is not current.
  st.drafts[st.c11] = { content: 'Typed in a third tab, from v2.', base_version_id: v2id, saved_at: new Date().toISOString() };
  await open(W5, st.c11);
  await page.click('[data-keep-saved]');
  await page.waitForSelector('[data-editor][contenteditable="true"]', { timeout: 5000 });
  const ks = saves().pop();
  ok(ks.body.p_make_current === false && ks.body.p_base_version_id === null, 'Keep saved version: make_current false');
  ok(await page.$eval('[data-editor]', (e) => /Typed here/.test(e.innerText)), 'the saved text stays current');
  await page.waitForFunction(() => document.querySelectorAll('.wr-ver').length === 4, null, { timeout: 5000 });
  ok(/v4 · Saved/.test(await txt('.wr-vers')) && !(await page.$('.wr-ver.is-current [data-restore]')), 'v4 (the kept draft) listed, not current');

  // 9. Another tab saves while this one types: version_conflict on save → the choice.
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Typed here again.');
  await settle();
  const other = { id: 'f0000000-0000-4000-8000-0000000000aa', section_id: st.c11, version_no: 5, content: 'Saved in the other tab, later.', word_count: 6, source: 'manual', label: null, partial: false, created_at: new Date().toISOString() };
  st.versions.push(other);
  st.outline[W5][1].sections[0].current_version_id = other.id;
  await page.click('[data-save-version]');
  await page.waitForSelector('[data-use-draft]', { timeout: 5000 });
  ok(/saved in another tab\. Choose which text to keep\./.test(await txt('[data-notes]')), `save conflict note: "${await txt('[data-notes]')}"`);
  ok(st.drafts[st.c11] && st.drafts[st.c11].content.endsWith('Typed here again.'), 'the typing is on the server as a draft');

  return log.join('\n');
};
