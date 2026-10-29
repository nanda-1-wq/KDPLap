// Rename to NicheInk (design 40): the sidebar wordmark, its label, colors and
// focus ring, "PUZZLE TOOLS", the page title, the wordmark on one line at 200%
// text; Sign in (signed out) and the landing page in light and dark, at 1440
// and 390; the root page still sends you to the landing page.
// Real fonts for this test only (the route is removed at the end).
// Run: tests/browser/run.sh books t-brand.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const T = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
  const ctx = page.context();
  // Google Fonts can be slow from the test browser: wait 8 s at most, then use the fallback font.
  const fonts = async (r) => { try { await r.fulfill({ response: await r.fetch({ timeout: 8000 }) }); } catch (e) { await r.abort().catch(() => {}); } };
  await ctx.route('**/fonts.googleapis.com/**', fonts);
  await ctx.route('**/fonts.gstatic.com/**', fonts);
  // Pages opened with ?brand=signedout see no session (the mock sets one on every page).
  await ctx.addInitScript(() => {
    if (/[?&]brand=signedout\b/.test(location.search)) { try { localStorage.removeItem('sb-hmtxnbgfzwqawfulwwrg-auth-token'); } catch (e) {} }
  });
  const ready = () => page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))])).catch(() => {});
  const shot = async (name, loc) => {
    await page.waitForTimeout(150);
    await (loc || page).screenshot({ path: `${SHOTS}/${name}.png`, fullPage: !loc, timeout: 15000 }).catch(() => out.push('shot timeout ' + name));
  };
  /** The element's width if it sits on one line, else false. */
  const oneLine = (sel) => page.evaluate((s) => {
    const e = document.querySelector(s); const r = e.getBoundingClientRect();
    return e.getClientRects().length === 1 && r.height < parseFloat(getComputedStyle(e).fontSize) * 1.6 ? Math.round(r.width) : false;
  }, sel);
  const color = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).color, sel);
  /** 40b: a 2 px margin before "Ink", no space character, so the text (and the accessible name) stays "NicheInk". */
  const gap = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return getComputedStyle(e).marginLeft === '2px' && !/\s/.test(e.parentElement.textContent); }, sel);
  const markW = (sel) => page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().width), sel);
  const NAVY = 'rgb(20, 33, 61)', BLUE = 'rgb(46, 106, 230)', WHITE = 'rgb(255, 255, 255)', LIGHT_BLUE = 'rgb(127, 166, 242)';

  try {
    // 1. Books: the sidebar.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.stat .bar').waitFor({ timeout: 10000 });
    await ready();
    const logo = page.locator('.sidebar-logo');
    ok('sidebar: the wordmark reads "NicheInk"', (await T(page.locator('.sidebar-logo-text'))) === 'NicheInk', await T(page.locator('.sidebar-logo-text')));
    ok('sidebar: the link reads "NicheInk, go to Books"', (await logo.getAttribute('aria-label')) === 'NicheInk, go to Books', await logo.getAttribute('aria-label'));
    ok('sidebar: "Niche" brand navy, "Ink" brand blue', (await color('.sidebar-logo-text .niche')) === NAVY && (await color('.sidebar-logo-text .ink')) === BLUE,
      [await color('.sidebar-logo-text .niche'), await color('.sidebar-logo-text .ink')]);
    ok('sidebar: "PUZZLE TOOLS" labels Word Search and Sudoku', (await T(page.locator('#navToolsLabel'))) === 'PUZZLE TOOLS'
      && (await T(page.locator('[aria-labelledby="navToolsLabel"]'))) === 'PUZZLE TOOLS Word Search Sudoku', await T(page.locator('[aria-labelledby="navToolsLabel"]')));
    ok('title: "Books · NicheInk"', (await page.title()) === 'Books · NicheInk', await page.title());
    const w = await oneLine('.sidebar-logo-text');
    ok('sidebar: the wordmark is one line, 19 px, nowrap', w && (await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.sidebar-logo-text')); return s.fontSize === '19px' && s.whiteSpace === 'nowrap'; })), w);
    ok('sidebar: 2 px gap before "Ink", no space character (40b)', await gap('.sidebar-logo-text .ink'));
    await shot('brand-sidebar-1440', page.locator('aside.sidebar'));
    await shot('brand-logo-sidebar', logo);
    await shot('brand-books-1440');
    await logo.focus();
    const ring = await logo.evaluate((e) => { const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineOffset}`; });
    ok('sidebar: the logo link shows the 2 px ink ring, 2 px offset', ring === 'solid 2px 2px', ring);
    await shot('brand-sidebar-focus', logo);
    // 200% text: the wordmark at 38 px in the real 260 px sidebar.
    await page.addStyleTag({ content: '.sidebar-logo-text { font-size: 38px; }' });
    const w2 = await oneLine('.sidebar-logo-text');
    const fits = await logo.evaluate((e) => e.scrollWidth <= e.clientWidth);
    const mk2 = await markW('.sidebar-logo svg');
    ok('200% text: the sidebar wordmark stays on one line and inside the link; the mark keeps 30 px', w2 && fits && mk2 === 30, { w2, fits, mk2 });
    await shot('brand-sidebar-200', page.locator('aside.sidebar'));

    // 2. Sign in, signed out: light, then dark.
    await page.goto(`${E11.base}/login.html?brand=signedout`, { waitUntil: 'domcontentloaded' });
    await page.locator('#signinForm').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('auth-checking'), null, { timeout: 5000 });
    await ready();
    ok('sign in: title "Sign in · NicheInk"', (await page.title()) === 'Sign in · NicheInk', await page.title());
    ok('sign in: wordmark "NicheInk", link "NicheInk home"', (await T(page.locator('.auth-logo-text'))) === 'NicheInk' && (await page.locator('.auth-logo').getAttribute('aria-label')) === 'NicheInk home');
    ok('sign in: "New to NicheInk? Create an account"', (await T(page.locator('.auth-switch'))) === 'New to NicheInk? Create an account', await T(page.locator('.auth-switch')));
    ok('sign in: the disclaimer names NicheInk', (await T(page.locator('.auth-legal'))) === 'KDP is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon.', await T(page.locator('.auth-legal')));
    const al = { niche: await color('.auth-logo-text .niche'), ink: await color('.auth-logo-text .ink'), line: await oneLine('.auth-logo-text') };
    ok('sign in, light: "Niche" navy, "Ink" blue, one line', al.niche === NAVY && al.ink === BLUE && al.line, al);
    ok('sign in: 2 px gap before "Ink", 19 px (40b)', (await gap('.auth-logo-text .ink')) && (await page.evaluate(() => getComputedStyle(document.querySelector('.auth-logo-text')).fontSize)) === '19px');
    await shot('brand-signin-1440');
    await shot('brand-logo-auth', page.locator('.auth-logo'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    ok('sign in 390: 19 px wordmark on one line, no sideways scroll', (await oneLine('.auth-logo-text')) && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await shot('brand-signin-390');
    await page.addStyleTag({ content: '.auth-logo-text { font-size: 38px; }' });
    const a2 = await page.evaluate(() => { const m = document.querySelector('.auth-main'); return { sw: document.documentElement.scrollWidth, fits: m.scrollWidth <= m.clientWidth }; });
    ok('200% text at 390: the auth wordmark stays on one line; the mark keeps 30 px', (await oneLine('.auth-logo-text')) && a2.sw <= 390 && a2.fits && (await markW('.auth-logo svg')) === 30, a2);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#signinForm').waitFor({ state: 'visible', timeout: 10000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    ok('sign in, dark: "Niche" white, "Ink" light blue', (await color('.auth-logo-text .niche')) === WHITE && (await color('.auth-logo-text .ink')) === LIGHT_BLUE,
      [await color('.auth-logo-text .niche'), await color('.auth-logo-text .ink')]);
    await shot('brand-signin-1440-dark');
    await page.emulateMedia({ colorScheme: 'light' });

    // 3. Landing: 1440 light and dark, then 390.
    await page.goto(`${E11.base}/landing/index.html`, { waitUntil: 'domcontentloaded' });
    await ready();
    ok('landing: title and description', (await page.title()) === 'NicheInk · An AI studio for nonfiction books'
      && (await page.locator('meta[name="description"]').getAttribute('content')) === 'NicheInk is an AI studio that helps you validate a topic, plan the book, and write nonfiction chapter by chapter, in your own voice.');
    ok('landing: wordmark, logo label', (await T(page.locator('.wordmark'))) === 'NicheInk' && (await page.locator('.brand-mark').getAttribute('aria-label')) === 'NicheInk logo');
    ok('landing: the chip reads "IN EARLY TESTING"', (await T(page.locator('.status'))) === 'IN EARLY TESTING', await T(page.locator('.status')));
    ok('landing: the new lead', (await T(page.locator('.lead'))) === 'NicheInk helps you validate a topic, plan the book, and write it chapter by chapter, in your own voice. It launches after testing on real books.');
    ok('landing: the footer and its disclaimer', (await T(page.locator('.foot'))) === '© 2026 NicheInk · Built by Adnan Kindle Direct Publishing (KDP) is a trademark of Amazon. NicheInk is independent and not affiliated with Amazon.', await T(page.locator('.foot')));
    ok('landing: the X link stays @3Desso', (await page.locator('a.cta').getAttribute('href')) === 'https://x.com/3Desso' && (await page.locator('.social a').first().getAttribute('href')) === 'https://x.com/3Desso');
    ok('landing, light: "Niche" navy, "Ink" blue, one line', (await color('.wordmark-niche')) === NAVY && (await color('.wordmark-ink')) === BLUE && (await oneLine('.wordmark')));
    ok('landing: 2 px gap before "Ink", 19 px at 1440 (40b)', (await gap('.wordmark-ink')) && (await page.evaluate(() => getComputedStyle(document.querySelector('.wordmark')).fontSize)) === '19px');
    await shot('brand-landing-1440');
    await shot('brand-logo-landing', page.locator('.brand'));
    await page.emulateMedia({ colorScheme: 'dark' });
    ok('landing, dark: "Niche" white, "Ink" light blue', (await color('.wordmark-niche')) === WHITE && (await color('.wordmark-ink')) === LIGHT_BLUE);
    await shot('brand-landing-1440-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => ({ size: getComputedStyle(document.querySelector('.wordmark')).fontSize, sw: document.documentElement.scrollWidth }));
    ok('landing 390: 18 px wordmark on one line, no sideways scroll', m.size === '18px' && m.sw <= 390 && (await oneLine('.wordmark')), m);
    await shot('brand-landing-390');
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot('brand-landing-390-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addStyleTag({ content: '.wordmark { font-size: 36px; }' });
    const z = await page.evaluate(() => {
      const top = document.querySelector('.top'), brand = document.querySelector('.brand'), social = document.querySelector('.social');
      return { sw: document.documentElement.scrollWidth, gap: Math.round(social.getBoundingClientRect().left - brand.getBoundingClientRect().right), fits: top.scrollWidth <= top.clientWidth };
    });
    ok('200% text at 390: the landing wordmark stays on one line, beside the buttons; the mark keeps 28 px', (await oneLine('.wordmark')) && z.sw <= 390 && z.fits && z.gap >= 16 && (await markW('.brand-mark')) === 28, z);
    await shot('brand-landing-390-200');

    // 4. The root page still sends you to the landing page (relative refresh).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${E11.base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/landing\/index\.html$/, { timeout: 5000 }).catch(() => {});
    ok('root: index.html redirects to landing/index.html', /\/landing\/index\.html$/.test(page.url()), page.url());
  } finally {
    // Back to Playwright's default (light). null would drop the override and follow the OS.
    await page.emulateMedia({ colorScheme: 'light' }).catch(() => {});
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
    await ctx.unroute('**/fonts.googleapis.com/**', fonts).catch(() => {});
    await ctx.unroute('**/fonts.gstatic.com/**', fonts).catch(() => {});
  }
  return out.join('\n');
};
