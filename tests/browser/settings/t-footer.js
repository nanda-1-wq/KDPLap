// E11 sidebar footer (design 25b, 6; owner rule 2026-10-25): the name only,
// never the email, on Books, Settings, Topic Lab and Pen Names. The Settings
// name, else the Google name (full_name, then name), else "Your account";
// the avatar letter follows. A long name stays on one line. While the name
// loads: the circle and a gray line, never the email; the next page paints
// the name at once from the per-tab copy. Screenshots of each footer.
// Run: tests/browser/run.sh settings t-footer.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const PAGES = ['dashboard', 'settings', 'topic-lab', 'pen-names'];
  const foot = async () => ({
    name: (await page.locator('.user-name').innerText()).trim(),
    letter: (await page.locator('[data-user-initial]').innerText()).trim(),
    side: (await page.locator('.sidebar').innerText()).replace(/\s+/g, ' ')
  });
  const ready = () => page.locator('.user-name:not(:has(.user-skel))').waitFor({ timeout: 8000 });
  async function visit(p, modes, settings) {
    globalThis.__modes = modes || {};
    await setupE11(page);
    if (settings) Object.assign(globalThis.__store.settings, settings);
    await page.goto(`${E11.base}/app/${p}.html`, { waitUntil: 'domcontentloaded' });
    await ready();
    return foot();
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // Each case on every page.
  const CASES = [
    ['Settings name', {}, { display_name: 'Adnan K' }, 'Adnan K', 'A', false],
    ['Google full_name', {}, { display_name: null }, 'Adnan', 'A', false],
    ['Google name only', { user: { meta: { name: 'Adnan N' } } }, { display_name: null }, 'Adnan N', 'A', false],
    ['no name anywhere', { user: { meta: {} } }, { display_name: null }, 'Your account', 'Y', true]
  ];
  for (const [label, modes, settings, name, letter, fallback] of CASES) {
    for (const p of PAGES) {
      // A fresh tab each time, so the per-tab copy does not hide what the page reads.
      await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} }).catch(() => {});
      const f = await visit(p, modes, settings);
      ok(`6 ${label} on ${p}: "${name}", letter ${letter}`, f.name === name && f.letter === letter, f);
      ok(`6 ${label} on ${p}: no email in the sidebar`, !f.side.includes('@') && !f.side.includes('example.com'), f.side);
      if (p === 'dashboard') {
        ok(`6 ${label}: fallback style ${fallback ? 'on' : 'off'}`, (await page.locator('.user-name').getAttribute('class')).includes('is-fallback') === fallback);
        await page.locator('.user-block').screenshot({ path: `${SHOTS}/footer-${label.replace(/\W+/g, '-').toLowerCase()}.png`, timeout: 8000 }).catch(() => out.push('shot timeout'));
      }
    }
  }

  // A long name: one line, "…", the full name in the title.
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  const long = 'Nora Hale-Whitmore, Gentle Movement Press';
  await visit('dashboard', {}, { display_name: long });
  const m = await page.locator('.user-name').evaluate((el) => ({ one: el.getBoundingClientRect().height < 26, cut: el.scrollWidth > el.clientWidth, ell: getComputedStyle(el).textOverflow, title: el.title }));
  ok('6 long name: one line, cut with an ellipsis, full name in title', m.one && m.cut && m.ell === 'ellipsis' && m.title === long, m);
  await page.locator('.user-block').screenshot({ path: `${SHOTS}/footer-long-name.png`, timeout: 8000 }).catch(() => {});

  // While loading: the circle and a gray line, never the email. Then the per-tab copy paints at once.
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  globalThis.__modes = { settingsSlow: 2000 };
  await setupE11(page);
  globalThis.__store.settings.display_name = 'Adnan K';
  await page.goto(`${E11.base}/app/topic-lab.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.user-skel').waitFor({ timeout: 4000 });
  const loading = await page.evaluate(() => ({ skel: !!document.querySelector('.user-name .user-skel'), circle: document.querySelector('[data-user-initial]').classList.contains('is-loading'),
    letter: document.querySelector('[data-user-initial]').textContent, side: document.querySelector('.sidebar').innerText }));
  ok('6 loading: the circle and a gray line, no email, no letter yet', loading.skel && loading.circle && loading.letter === '' && !loading.side.includes('@'), loading);
  await page.locator('.user-block').screenshot({ path: `${SHOTS}/footer-loading.png`, timeout: 8000 }).catch(() => {});
  await ready();
  ok('6 then the name', (await foot()).name === 'Adnan K');
  await page.goto(`${E11.base}/app/pen-names.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.user-name').waitFor({ timeout: 4000 });
  await page.waitForTimeout(300);
  const early = await page.evaluate(() => ({ name: document.querySelector('.user-name').textContent.trim(), skel: !!document.querySelector('.user-skel') }));
  ok('6 next page: the name at once from the per-tab copy (settings still loading)', early.name === 'Adnan K' && !early.skel, early);

  // The settings read fails: the Google name, still no email. (Let the slow read of the
  // page before finish first, or it writes the per-tab copy back after the clear.)
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  const f = await visit('dashboard', { settingsFail: true });
  ok('6 settings read failed: the Google name, no email', f.name === 'Adnan' && !f.side.includes('@'), f);
  return out.join('\n');
};
