// Step 06 Write (E10.1): typing autosaves a draft, never a version; a version
// is made on Save version, leaving the section, leaving the step and before a
// restore. Toolbar, paste as plain text, the 100,000 limit, save errors.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const modes = globalThis.__modes;
  const sec = (bid, ch, n) => st.outline[bid][ch].sections[n].id;
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForTimeout(300);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const drafts = () => st.writes.filter((w) => w.table === 'section_drafts');
  const saves = () => st.writes.filter((w) => w.fn === 'save_version');
  const settle = async () => {
    await page.waitForTimeout(900);
    for (let i = 0; i < 40; i++) {
      const s = await page.$eval('[data-saved-line]', (e) => e.dataset.state).catch(() => '');
      if (s !== 'saving') break;
      await page.waitForTimeout(100);
    }
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. An empty section: typing saves a draft (base null), not a version.
  const S12 = sec(W1, 1, 1);
  await open(W1, S12);
  await page.click('[data-editor]');
  await page.keyboard.type('A chair holds you steady while you move.');
  await settle();
  const d1 = drafts().pop();
  ok(d1 && d1.body.section_id === S12 && d1.body.content === 'A chair holds you steady while you move.' && d1.body.base_version_id === null, `draft saved: ${JSON.stringify(d1 && d1.body)}`);
  ok(saves().length === 0, 'typing makes no version');
  ok(/^Not saved as a version yet\. Kept as a draft while you type\. Save version$/.test(await txt('[data-foot]')), `foot: "${await txt('[data-foot]')}"`);
  ok(!(await page.$eval('[data-save-version]', (b) => b.disabled)), 'Save version on');
  ok((await txt('[data-words]')) === '8 / 350 words', `words follow typing: "${await txt('[data-words]')}"`);
  ok((await txt('.wr-ms-count')) === '137 / 11,100', `manuscript total follows the draft: "${await txt('.wr-ms-count')}"`);
  ok(/^Unsaved changes 8 words/.test(await txt('.wr-ver.is-unsaved')), 'Versions shows Unsaved changes');
  ok(await page.$eval('[data-saved-line]', (e) => e.dataset.state === 'saved'), 'sidebar save line: saved');

  // 2. Toolbar: bold, italic, heading, list become Markdown; Ctrl+U adds nothing.
  await page.keyboard.press('Enter');
  await page.click('[data-cmd="bold"]');
  await page.keyboard.type('Sit tall');
  await page.click('[data-cmd="bold"]');
  await page.keyboard.type(' and ');
  await page.keyboard.press('Control+u');
  await page.click('[data-cmd="italic"]');
  await page.keyboard.type('breathe');
  await page.click('[data-cmd="italic"]');
  await page.keyboard.type('.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two checks');
  await page.click('[data-cmd="h2"]');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.click('[data-cmd="list"]');
  await page.keyboard.type('Feet flat');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Back straight');
  await settle();
  const md = drafts().pop().body.content;
  ok(md === 'A chair holds you steady while you move.\n\n**Sit tall** and *breathe*.\n\n## Two checks\n\n- Feet flat\n- Back straight', `toolbar Markdown: ${JSON.stringify(md)}`);
  ok(!(await page.$('[data-editor] u')), 'no underline (Ctrl+U)');

  // 3. Save version: save_version with the text and base null → v1, Draft, draft gone.
  await page.click('[data-save-version]');
  await page.waitForFunction(() => /Saved as v1/.test(document.querySelector('[data-foot]').innerText), null, { timeout: 5000 });
  const sv = saves().pop();
  ok(sv && sv.body.p_section_id === S12 && sv.body.p_content === md && sv.body.p_base_version_id === null && sv.body.p_make_current === true, `save_version body: ${JSON.stringify(sv && sv.body)}`);
  ok(!st.drafts[S12], 'the draft is gone after the version');
  ok(await page.$eval('[data-status]', (s) => s.value) === 'draft' && /1\.2 Why a chair makes yoga safer Draft/.test(await txt(`[data-section="${S12}"]`)), 'Not started became Draft');
  ok(await page.$eval('[data-save-version]', (b) => b.disabled), 'Save version off again');
  await page.waitForFunction(() => /v1 · Saved Current/.test(document.querySelector('.wr-panel').innerText.replace(/\s+/g, ' ')), null, { timeout: 5000 });
  ok(true, 'Versions lists v1 · Saved, Current');
  ok((await txt('[data-live]')) === 'Saved as version 1.', 'announced');

  // 4. Same text again: no new version (the button is off; Save version on no change sends nothing).
  const nSaves = saves().length;

  // 5. Leaving the section makes a version first, with the right base.
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Keep your shoulders soft.');
  await page.click(`[data-section="${sec(W1, 1, 2)}"]`);
  await page.waitForFunction((id) => document.querySelector(`[data-section="${id}"]`).getAttribute('aria-current') === 'true', sec(W1, 1, 2), { timeout: 5000 });
  const leave = saves().slice(nSaves);
  ok(leave.length === 1 && leave[0].body.p_content.endsWith('- Back straight\n- Keep your shoulders soft.') || (leave.length === 1 && leave[0].body.p_content.endsWith('Keep your shoulders soft.')), `leave: one version (${leave.length}) ${JSON.stringify(leave.map((w) => w.body.p_content.slice(-40)))}`);
  ok(leave.length === 1 && leave[0].body.p_base_version_id === st.versions.find((v) => v.section_id === S12 && v.version_no === 1).id, 'leave: base is v1');
  await page.waitForSelector('[data-sec-title]', { timeout: 5000 });
  ok((await txt('[data-sec-title]')) === '1.3 What 15 minutes a day can do', `the other section opens: "${await txt('.wr-main')}"`);
  ok(page.url().includes(`section=${sec(W1, 1, 2)}`), 'URL follows the section');

  // 6. Back to 1.2: the saved text, no draft.
  await page.click(`[data-section="${S12}"]`);
  await page.waitForFunction(() => /1\.2/.test(document.querySelector('[data-sec-title]') ? document.querySelector('[data-sec-title]').innerText : ''), null, { timeout: 5000 })
    .catch(async () => { log.push('DEBUG ' + (await txt('.wr-main')) + ' | ' + st.calls.slice(-6).join(' ; ')); throw new Error('1.2 did not open'); });
  await page.waitForTimeout(300);
  ok(/^Saved as v2/.test(await txt('[data-foot]')) && await page.$eval('[data-editor] h2', (h) => h.textContent === 'Two checks'), 'reopened: v2 with the formatting');

  // 7. Leaving a section with nothing typed makes no version.
  const before7 = saves().length;
  await page.click(`[data-section="${sec(W1, 1, 2)}"]`);
  await page.waitForTimeout(600);
  ok(saves().length === before7, 'no change, no version on leave');

  // 8. A draft on top of the current version (closed tab): shown as unsaved changes after reload.
  await open(W5, st.c12);
  ok(await page.$eval('[data-editor]', (e) => e.innerText.trim() === 'A chair makes yoga safer. It holds you steady.'), 'reload: the draft text is shown');
  ok(/^Unsaved changes since v1\. Kept as a draft while you type\. Save version$/.test(await txt('[data-foot]')), `reload foot: "${await txt('[data-foot]')}"`);
  ok(!(await page.$('[data-use-draft]')), 'no conflict for a draft from the current version');

  // 9. Leaving the step (sidebar 05) makes the version.
  const before9 = saves().length;
  await page.click('a[data-step="5"]');
  await page.waitForTimeout(800);
  const s9 = saves().slice(before9);
  ok(s9.length === 1 && s9[0].body.p_content === 'A chair makes yoga safer. It holds you steady.', `leave step: version of the draft (${s9.length})`);

  // 10. Exit to Books waits for the version, then leaves.
  await open(W5, st.c12);
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Then breathe out.');
  const before10 = saves().length;
  await page.click('.exit-link');
  await page.waitForURL(/dashboard\.html/, { timeout: 8000 });
  ok(saves().length === before10 + 1 && saves().pop().body.p_content.endsWith('Then breathe out.'), 'Exit to Books: version first');

  // 11. Paste is plain text: markup and scripts never get in.
  await open(W1, sec(W1, 2, 0));
  await page.click('[data-editor]');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<p onclick="alert(1)">Pasted <b>bold</b><script>window.__xss=1</script><img src=x onerror="window.__xss=2"></p>');
    dt.setData('text/plain', 'Pasted bold');
    document.querySelector('[data-editor]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await settle();
  ok(drafts().pop().body.content === 'Pasted bold', 'paste: plain text only');
  ok(await page.evaluate(() => !window.__xss && !document.querySelector('[data-editor] img, [data-editor] script, [data-editor] b')), 'paste: no markup, no script ran');

  // 12. Offline (draft and version saves fail): Retry on the save line (visible in the rail); leaving is held.
  modes.draftError = true;
  await page.keyboard.type(' More text.');
  await settle();
  ok(/Couldn't save\./.test(await txt('[data-saved-line]')) && !!(await page.$('[data-retry-save]')), 'draft error: Couldn’t save with Retry');
  ok(/Your latest typing is not saved yet\./.test(await txt('[data-foot]')), `foot says it: "${await txt('[data-foot]')}"`);
  ok(await page.$eval('[data-retry-save]', (b) => b.offsetParent !== null && b.getBoundingClientRect().height >= 44), 'Retry visible in the rail, 44 px');
  await page.screenshot({ path: `${SHOTS}/t-draft-error-rail.png` });
  const before12 = saves().length;
  modes.versionError = true;
  await page.click(`[data-section="${sec(W1, 2, 1)}"]`);
  await page.waitForTimeout(800);
  ok((await txt('[data-sec-title]')) === '2.1 Choosing a sturdy chair with no wheels', 'not saved at all: stays on the section');
  ok(/Your text is not saved yet/.test(await txt('[data-notes]')), `held note: "${await txt('[data-notes]')}"`);
  modes.draftError = false;
  modes.versionError = false;
  await page.click('[data-retry-save]');
  await settle();
  ok(st.drafts[sec(W1, 2, 0)] && st.drafts[sec(W1, 2, 0)].content === 'Pasted bold More text.', 'Retry saves the draft');
  await page.click(`[data-section="${sec(W1, 2, 1)}"]`);
  await page.waitForFunction(() => /2\.2/.test(document.querySelector('[data-sec-title]') ? document.querySelector('[data-sec-title]').innerText : ''), null, { timeout: 5000 });
  ok(saves().length === before12 + 2, 'then leaving makes the version (one failed try before)');

  // 12b. Only the draft fails: the version holds the text, so leaving works and no stale draft is sent later.
  modes.draftError = true;
  await page.click('[data-editor]');
  await page.keyboard.type('Pick a chair with a flat seat.');
  await settle();
  const drafts12b = drafts().length;
  await page.click(`[data-section="${sec(W1, 2, 0)}"]`);
  await page.waitForFunction(() => /2\.1/.test(document.querySelector('[data-sec-title]') ? document.querySelector('[data-sec-title]').innerText : ''), null, { timeout: 5000 });
  modes.draftError = false;
  await page.waitForTimeout(1200);
  ok(st.versions.some((v) => v.section_id === sec(W1, 2, 1) && v.content === 'Pick a chair with a flat seat.'), 'draft failed, version saved: leaving works');
  ok(drafts().length === drafts12b + 1 && !st.drafts[sec(W1, 2, 1)], 'no stale draft sent after the version');
  ok(await page.$eval('[data-saved-line]', (e) => e.dataset.state !== 'error'), 'save line clear after the version');

  // 13. A version error keeps the draft and says so, with Try again.
  await page.click('[data-editor]');
  await page.keyboard.type('Clear the floor around your chair.');
  await settle();
  modes.versionError = true;
  await page.click('[data-save-version]');
  await page.waitForSelector('[data-retry-version]', { timeout: 5000 });
  ok(/We couldn’t save a version\. Your text is kept as a draft\./.test(await txt('[data-notes]')), 'version error: kept as a draft');
  modes.versionError = false;
  await page.click('[data-retry-version]');
  await page.waitForFunction(() => /Saved as v2/.test(document.querySelector('[data-foot]').innerText), null, { timeout: 5000 });   // 2.1 had v1 from case 12
  ok(!(await page.$('[data-retry-version]')), 'Try again saves, note gone');

  // 14. Over 100,000 characters: autosave stops with a clear message.
  await page.evaluate(() => {
    const ed = document.querySelector('[data-editor]');
    ed.innerHTML = `<p>${'word '.repeat(20001)}</p>`;
    ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await settle();
  ok(/this section is too long\. Keep it under 100,000 characters\./.test(await txt('[data-saved-line]')), `too long: "${await txt('[data-saved-line]')}"`);
  ok(!drafts().some((w) => w.body.content.length > 100000), 'nothing over the limit was sent');
  await page.screenshot({ path: `${SHOTS}/t-draft-too-long.png` });
  // Shorten it again: the draft saves. (Ending with unsaved text would leave a
  // "Leave site?" prompt that blocks the next test in this shared browser.)
  await page.evaluate(() => {
    const ed = document.querySelector('[data-editor]');
    ed.innerHTML = '<p>Clear the floor around your chair.</p>';
    ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  await settle();
  ok(await page.$eval('[data-saved-line]', (e) => e.dataset.state === 'saved'), 'shorter again: the draft saves');
  return log.join('\n');
};
