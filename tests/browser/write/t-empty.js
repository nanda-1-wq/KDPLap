// E10.1 live bug: an EMPTY v1 was saved. The exact path (found with a probe):
// open the Introduction, type one character, delete it (the draft becomes ""),
// then leave the section. The leave saved the blank text as v1, so 05 said
// "has writing" and Regenerate was blocked. Now a version is made only for a
// real change, and never a blank first version (0019 refuses it too).
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const INTRO = st.outline[W5][0].sections[0].id;
  const END = st.outline[W5][st.outline[W5].length - 1].sections[0].id;
  const saves = () => st.writes.filter((w) => w.fn === 'save_version');
  const open = async (id, section) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=6${section ? `&section=${section}` : ''}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.wr-editor', { timeout: 10000 });
    await page.waitForTimeout(400);
  };
  const txt = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
  const typeAndDelete = async () => {
    await page.click('[data-editor]');
    await page.keyboard.type('a');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(1100);
  };
  const toEnd = async () => {
    await page.click(`[data-section="${END}"]`);
    await page.waitForFunction(() => /Conclusion/.test(document.querySelector('[data-sec-title]') ? document.querySelector('[data-sec-title]').textContent : ''), null, { timeout: 5000 });
    await page.waitForTimeout(400);
  };
  await page.setViewportSize({ width: 1440, height: 960 });

  // 1. Open and leave without typing: no version, no draft.
  await open(W5);
  ok((await txt('[data-sec-title]')) === 'Introduction', 'Write opens on the Introduction (first section not Final)');
  await toEnd();
  ok(saves().length === 0 && !st.drafts[INTRO], 'open and leave, nothing typed: no version, no draft');

  // 2. The live path: type one character, delete it, leave the section.
  await open(W5, INTRO);
  await typeAndDelete();
  ok(st.drafts[INTRO] && st.drafts[INTRO].content === '', 'typed and deleted: the draft is blank (the typed "a" is not left behind)');
  ok(await page.$eval('[data-save-version]', (b) => b.disabled) && /^Nothing written yet\. Save version$/.test(await txt('[data-foot]')), `blank: Save version off, "Nothing written yet." ("${await txt('[data-foot]')}")`);
  await toEnd();
  ok(saves().length === 0, 'typed, deleted, left: NO version (this saved an empty v1 before)');
  ok(!st.versions.some((v) => v.section_id === INTRO), 'the Introduction still has no version');

  // 3. The same, then leave the step (05 in the sidebar): no version.
  await open(W5, INTRO);
  await typeAndDelete();
  await page.click('a[data-step="5"]');
  await page.waitForSelector('.otl', { timeout: 10000 });
  await page.waitForTimeout(500);
  ok(saves().length === 0, 'typed, deleted, left the step: no version');

  // 4. (05 Regenerate with a blank-only version: outline/t-blank.js. W5 has real text elsewhere.)

  // 5. Exit with nothing typed, and with typed-and-deleted: no version.
  await open(W5, INTRO);
  await page.click('.exit-link');
  await page.waitForURL(/dashboard\.html/, { timeout: 8000 });
  ok(saves().length === 0, 'Exit, nothing typed: no version');
  await open(W5, INTRO);
  await typeAndDelete();
  await page.click('.exit-link');
  await page.waitForURL(/dashboard\.html/, { timeout: 8000 });
  ok(saves().length === 0, 'Exit, typed and deleted: no version');

  // 6. Same text as the current version (typed and undone): leaving saves nothing.
  await open(W1, st.s42);
  await page.click('[data-editor]');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1100);
  await page.click(`[data-section="${st.outline[W1][0].sections[0].id}"]`);
  await page.waitForFunction(() => /Introduction/.test(document.querySelector('[data-sec-title]') ? document.querySelector('[data-sec-title]').textContent : ''), null, { timeout: 5000 });
  await page.waitForTimeout(400);
  ok(saves().length === 0 && st.versions.filter((v) => v.section_id === st.s42).length === 3, 'typed and undone in 4.2: leaving saves no version (still v3)');

  // 7. Idle (10 minutes, shortened on its own page): nothing typed, and typed-and-deleted → no version.
  await page.goto('about:blank');
  const p = await page.context().newPage();
  try {
    await p.addInitScript(() => {
      const real = window.setTimeout;
      window.__idleArmed = 0;
      window.setTimeout = (fn, ms, ...args) => {
        if (ms === 600000) { window.__idleArmed++; return real(fn, 1500, ...args); }
        return real(fn, ms, ...args);
      };
    });
    await p.setViewportSize({ width: 1440, height: 960 });
    const INTRO1 = st.outline[W4][0].sections[0].id;
    await p.goto(`http://127.0.0.1:5500/app/book.html?id=${W4}&step=6&section=${INTRO1}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.wr-editor', { timeout: 10000 });
    await p.waitForTimeout(2500);
    ok(await p.evaluate(() => window.__idleArmed === 0) && saves().length === 0, 'idle, nothing typed: no timer, no version');
    await p.click('[data-editor]');
    await p.keyboard.type('a');
    await p.waitForTimeout(900);
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(3000);
    ok(await p.evaluate(() => window.__idleArmed > 0) && saves().length === 0, 'idle after typed-and-deleted: the timer ran, no version');
  } finally {
    await p.close();
  }

  // 8. The server refuses a blank first version too (0019): the mock plays it; the page never sends one.
  ok(!st.writes.some((w) => w.fn === 'save_version' && !w.body.p_content.trim()), 'no blank save_version was ever sent');
  return log.join('\n');
};
