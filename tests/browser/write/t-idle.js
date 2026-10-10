// Step 06 Write (E10.1): 10 minutes idle with unsaved changes makes a version
// (owner, E10). Playwright's fake clock belongs to the whole browser context
// and upset the next tests, so this page gets its own setTimeout instead: a
// 10-minute timer (600,000 ms exactly) runs after 1.5 s; every other timer is real.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const SID = st.outline[W1][3].sections[0].id;
  // Only this section's saves; the shared page is parked so an earlier test's page sends nothing.
  const saves = () => st.writes.filter((w) => w.fn === 'save_version' && w.body.p_section_id === SID);
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
    await p.goto(`http://127.0.0.1:5500/app/book.html?id=${W1}&step=6&section=${SID}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.wr-editor', { timeout: 10000 });
    await p.click('[data-editor]');
    await p.keyboard.type('Sit tall without strain.');
    await p.waitForTimeout(1000);
    ok(!!st.drafts[SID], 'the draft is saved after 800 ms');
    ok(await p.evaluate(() => window.__idleArmed > 0), 'typing arms the 10-minute timer');
    ok(saves().length === 0, 'no version before the 10 minutes');
    await p.waitForTimeout(1500);
    ok(saves().length === 1 && saves()[0].body.p_content === 'Sit tall without strain.', 'a version after 10 minutes idle');
    const armed = await p.evaluate(() => window.__idleArmed);
    await p.waitForTimeout(2000);
    ok(saves().length === 1 && await p.evaluate((n) => window.__idleArmed === n, armed), 'no new version or timer while nothing changes');
  } finally {
    await p.close();
  }
  return log.join('\n');
};
