// E11 Settings (design 25b): states 1, 2a to 2d, 3a to 3c, 4a, 4b, 5 and 7,
// Change password (sent, refused, hidden for Google only) and a failed
// settings read. Screenshots at 1440 and 900.
// Run: tests/browser/run.sh settings t-settings.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const S = () => globalThis.__store;
  const text = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  const sidebar = () => text('.sidebar');
  const writes = () => S().writes.map((w) => w.body);
  async function open(modes = {}, width = 1440) {
    globalThis.__modes = modes;
    await setupE11(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${E11.base}/app/settings.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#nameInput').waitFor({ timeout: 10000 });
  }
  /** Wait until the mock has more than n writes, then until the save line says Saved again. */
  async function saved(n, sel) {
    for (let i = 0; i < 60 && S().writes.length <= n; i++) await page.waitForTimeout(100);
    await page.locator(`${sel}[data-state="saved"]`).waitFor({ timeout: 4000 });
    await page.waitForTimeout(50);
  }
  const usageReady = () => page.locator('[data-usage-body]:not([aria-busy])').waitFor({ timeout: 10000 });

  /* ── 1. The page ── */
  await open();
  await usageReady();
  await page.locator('.user-name:not(:has(.user-skel))').waitFor({ timeout: 5000 });
  ok('1 footer: the name only', (await text('.user-name')) === 'Adnan' && (await text('[data-user-initial]')) === 'A', await text('.user-block'));
  ok('1 the email never shows in the sidebar', !(await sidebar()).includes('@'), await sidebar());
  ok('1 email: on this page, read only', (await text('[data-email]')) === 'adnan@example.com' && (await page.locator('.set-v .ro-tag').first().innerText()) === 'Read only');
  ok('1 name field: empty, the Google name as placeholder and in the help', (await page.locator('#nameInput').inputValue()) === ''
    && (await page.locator('#nameInput').getAttribute('placeholder')) === 'Adnan' && (await text('#nameHelp')) === 'Empty. The sidebar shows your Google name, "Adnan".');
  ok('1 usage: 412,380 of 2,000,000 tokens, 21%, resets November 1 (UTC)',
    (await text('.set-big')) === '412,380 of 2,000,000 tokens 21%' && (await text('[data-resets]')) === 'Resets November 1 (UTC)', await text('.set-big'));
  ok('1 bar: 21% for screen readers', (await page.locator('.set-bar').getAttribute('aria-label')) === "21% of this month's AI allowance used");
  ok('1 cost estimate and the read-only limit', (await text('.set-stats')).includes('About $2.06') && (await text('.set-stats')).includes('Set by NicheInk. Read only.'), await text('.set-stats'));
  const stages = await page.locator('table[aria-label="By stage this month"] tbody tr').allInnerTexts();
  ok('1 by stage: top 5 and Other (positioning, Brief, drift)', stages.length === 6 && stages[0].replace(/\s+/g, ' ').startsWith('Write section 38 268,400')
    && stages[5].replace(/\s+/g, ' ').startsWith('Other (positioning, Brief, drift) 9 10,480'), stages);
  const calls = await page.locator('table[aria-label="Last calls"] tbody tr').allInnerTexts();
  ok('5 last calls: 5 rows, Stopped by you, Not counted, Pen Names', calls.length === 5 && /Stopped by you/.test(calls[2]) && /Not counted/.test(calls[3]) && /Pen Names/.test(calls[4]), calls);
  ok('5 a not-counted call: number struck, named for screen readers', (await page.locator('td.num.dim').getAttribute('aria-label')) === '3,100, not counted');
  ok('1 defaults: pen name Nora Hale, trim 6 × 9 in, English read only', (await page.locator('#penSelect').inputValue()) === E11.PA
    && (await page.locator('#trimSelect').inputValue()) === '6x9' && (await text('#trimSelect option:checked')) === '6 × 9 in' && (await text('.set-card:nth-of-type(2) .set-row')).includes('English'));
  ok('1 no Delete account (v1)', (await page.locator('text=Delete account').count()) === 0);
  ok('1 one settings read for the sidebar and the page', S().calls.filter((c) => c === 'GET /rest/v1/user_settings').length === 1, S().calls);
  await E11.shot(page, 'settings-1440', out);
  await E11.shot(page, 'settings-900', out, 900);
  ok('1 no sideways scroll at 900', await page.evaluate(() => document.documentElement.scrollWidth <= 900), await page.evaluate(() => document.documentElement.scrollWidth));
  const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a, main select, main input')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 43.5).map((e) => e.outerHTML.slice(0, 60)));
  ok('1 every control is 44 px', small.length === 0, small);
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ── 2a, 2c, 2b, 2d: the name ── */
  globalThis.__modes.patchSlow = 700;
  await page.locator('#nameInput').fill('Adnan K');
  ok('2a count 7 / 60', (await text('[data-name-count]')) === '7 / 60');
  await page.locator('[data-name-save][data-state="saving"]').waitFor({ timeout: 3000 });
  ok('2a saving: "Saving…"', (await text('[data-name-save]')) === 'Saving…');
  ok('2a the sidebar keeps the old name until the save is done', (await text('.user-name')) === 'Adnan');
  await page.locator('[data-name-save][data-state="saved"]').waitFor({ timeout: 4000 });
  ok('2a saved: "Saved", the sidebar shows the new name', (await text('[data-name-save]')) === 'Saved' && (await text('.user-name')) === 'Adnan K');
  ok('2a sent display_name "Adnan K"', JSON.stringify(writes().pop()) === '{"display_name":"Adnan K"}', writes());
  ok('2a the per-tab copy has the name', (await page.evaluate((u) => sessionStorage.getItem(`kdp-name:${u}`), E11.U)).includes('Adnan K'));
  globalThis.__modes.patchSlow = 0;

  const before = S().writes.length;
  await page.locator('#nameInput').fill('Adnan, author of gentle movement books for people over sixty!');
  await page.waitForTimeout(1200);
  ok('2b too long: an error, 61 / 60, nothing saved', (await text('#nameError')) === 'Error: use 60 characters or fewer.' && (await text('[data-name-count]')) === '61 / 60'
    && (await page.locator('[data-name-count]').getAttribute('class')).includes('is-over') && S().writes.length === before, [await text('#nameError'), S().writes.length - before]);
  ok('2b the field is marked invalid; the text is not cut', (await page.locator('#nameInput').getAttribute('aria-invalid')) === 'true' && (await page.locator('#nameInput').inputValue()).length === 61);
  ok('2b the sidebar keeps the last good name', (await text('.user-name')) === 'Adnan K');
  let n = S().writes.length;
  await page.locator('#nameInput').fill('   ');
  await saved(n, '[data-name-save]');
  ok('2c empty: saves null, the help names the fallback', writes().pop().display_name === null && (await text('#nameHelp')) === 'Empty. The sidebar shows your Google name, "Adnan".', writes());
  ok('2c the sidebar shows the Google name again', (await text('.user-name')) === 'Adnan');

  globalThis.__modes.settingsPatchFail = { status: 503, code: 'XX000' };
  await page.locator('#nameInput').fill('Adnan K');
  await page.locator('[data-name-save][data-state="error"]').waitFor({ timeout: 4000 });
  ok('2d save error: "Couldn\'t save." and Retry', (await text('[data-name-save]')) === "Couldn't save.Retry" || (await text('[data-name-save]')) === "Couldn't save. Retry", await text('[data-name-save]'));
  globalThis.__modes.settingsPatchFail = null;
  n = S().writes.length;
  await page.locator('[data-name-save] [data-retry-save]').click();
  await saved(n, '[data-name-save]');
  ok('2d Retry saves', (await text('.user-name')) === 'Adnan K' && S().settings.display_name === 'Adnan K');

  /* ── Defaults ── */
  n = S().writes.length;
  await page.locator('#penSelect').selectOption(E11.PB);
  await saved(n, '[data-pen-save]');
  ok('7 pen name saved at once, "Saved" next to it', S().settings.default_pen_name_id === E11.PB && (await text('[data-pen-save]')) === 'Saved' && (await text('[data-trim-save]')) === '');
  n = S().writes.length;
  await page.locator('#penSelect').selectOption('');
  await saved(n, '[data-pen-save]');
  ok('7 None saves null', S().settings.default_pen_name_id === null);
  n = S().writes.length;
  await page.locator('#trimSelect').selectOption('5x8');
  await saved(n, '[data-trim-save]');
  ok('trim size saved (new books only)', S().settings.default_trim === '5x8' && (await text('#trimHelp')).includes("Change a book's size in its Brief."));
  ok('the trim list: the Brief\'s five sizes', JSON.stringify(await page.locator('#trimSelect option').allInnerTexts()) === JSON.stringify(['5 × 8 in', '5.5 × 8.5 in', '6 × 9 in', '7 × 10 in', '8.5 × 11 in']));

  /* ── Change password ── */
  await page.locator('[data-password]').click();
  await page.locator('[data-password-note]:not([hidden])').waitFor({ timeout: 4000 });
  const rec = S().recovers.pop();
  ok('password: the reset email to the user, back to /reset-password.html', rec && rec.email === 'adnan@example.com' && /redirect_to=[^&]*%2Freset-password\.html/.test(rec.url) && !/app%2Freset-password/.test(rec.url), rec);
  ok('password: "We sent a reset link to your email."', (await text('[data-password-note]')) === 'We sent a reset link to your email.');
  globalThis.__modes.recoverFail = { status: 429 };
  await page.locator('[data-password]').click();
  await page.waitForFunction(() => /2 reset emails/.test(document.querySelector('[data-password-note]').textContent), null, { timeout: 4000 });
  ok('password: refused by the hourly limit', (await text('[data-password-note]')) === 'You can ask for 2 reset emails an hour. Try again later.');

  /* ── 7. No pen names ── */
  await open({ pensNone: true });
  await page.locator('#penSelect[disabled]').waitFor({ timeout: 5000 });
  ok('7 no pen names: None, disabled, "Add a pen name"', (await text('[data-pen-label]')) === 'Pen name · no pen names yet' && (await text('[data-pen-link]')) === 'Add a pen name'
    && (await page.locator('[data-pen-link]').getAttribute('href')) === 'pen-names.html');

  /* ── Google only: no password row ── */
  await open({ user: { meta: { full_name: 'Adnan G', avatar_url: 'x' }, providers: ['google'] } });
  await page.locator('.user-name:not(:has(.user-skel))').waitFor({ timeout: 5000 });
  ok('Google only: no Change password', await page.locator('[data-password-row]').isHidden());

  /* ── 3a, 3b, 3c ── */
  await open({ usageSlow: 1500 });
  ok('3a loading: a skeleton, busy', (await page.locator('[data-usage-body][aria-busy="true"] .skel').count()) >= 4);
  await usageReady();
  ok('3a then the numbers', (await text('.set-big-n')) === '412,380');

  await open({ usageFail: true });
  await page.locator('[data-usage-retry]').waitFor({ timeout: 5000 });
  ok('3b error with Try again, only in the usage card', (await text('[data-usage-body] .alert')).startsWith("Error: we couldn't load your usage.") && await page.locator('#nameInput').isEnabled());
  ok('3b focus is not stolen on load', await page.evaluate(() => !document.activeElement || !document.activeElement.matches('[data-usage-retry]')));
  await E11.shot(page, 'settings-3b-error', out);
  globalThis.__modes.usageFail = false;
  await page.locator('[data-usage-retry]').click();
  await usageReady();
  await page.locator('.set-big-n').waitFor({ timeout: 5000 });
  ok('3b Try again loads the card and moves focus to its title', (await text('.set-big-n')) === '412,380' && await page.evaluate(() => document.activeElement.id === 'useTitle'));

  await open({ usage: { month_start: '2026-10-01T00:00:00+00:00', resets: '2026-11-01T00:00:00+00:00', limit: 2000000, tokens: 0, by_stage: [] } });
  await usageReady();
  ok('3c no calls: 0 of 2,000,000, 0%, the empty line, no tables', (await text('.set-big')) === '0 of 2,000,000 tokens 0%'
    && (await text('.set-empty')).startsWith('No AI calls this month yet.') && (await page.locator('.set-table').count()) === 0);

  /* ── 4a, 4b ── */
  const big = (tokens) => ({ month_start: '2026-10-01T00:00:00+00:00', resets: '2026-11-01T00:00:00+00:00', limit: 2000000, tokens,
    by_stage: [{ stage: 'section_write', model: 'claude-sonnet-5-5', calls: 200, input: 900000, output: 540000 }, { stage: 'section_improve', model: 'claude-sonnet-5-5', calls: 100, input: tokens - 1440000 - 100, output: 100 }] });
  await open({ usage: big(1702450) });
  await usageReady();
  ok('4a warning at 85%: tokens left and roughly N sections', (await text('[data-usage-body] .alert-warning')) === 'Warning: 85% used. About 297,550 tokens are left, roughly 41 more sections. AI stops at the limit until November 1.', await text('[data-usage-body] .alert-warning'));
  await E11.shot(page, 'settings-4a-85', out);
  await open({ usage: big(2004000) });
  await usageReady();
  ok('4b at the limit: 2,000,000 shown, 100%, AI paused', (await text('.set-big')) === '2,000,000 of 2,000,000 tokens 100%'
    && (await text('[data-usage-body] .alert-warning')) === 'AI is paused until November 1. Your writing is safe. You can still write, edit and export.', await text('.set-big'));

  /* ── 5. Last calls fail on their own ── */
  await open({ callsFail: true });
  await usageReady();
  ok('5 last calls down: a short line, the rest of the card stays', (await text('[data-calls-error]')) === 'Last calls are not available right now.' && (await text('.set-big-n')) === '412,380');

  /* ── The settings read fails ── */
  await open({ settingsFail: true });
  await page.locator('[data-account-error]:not([hidden])').waitFor({ timeout: 5000 });
  await page.locator('.user-name:not(:has(.user-skel))').waitFor({ timeout: 5000 });
  ok('settings down: an error, the fields off, the sidebar shows the Google name', await page.locator('#nameInput').isDisabled() && (await text('.user-name')) === 'Adnan' && !(await sidebar()).includes('@'));

  return out.join('\n');
};
