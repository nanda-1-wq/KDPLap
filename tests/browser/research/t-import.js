// i17: "Import from Amazon page" in the Add competitor form. It only fills the
// EMPTY fields; typed text is kept; missing numbers stay empty; nothing is
// saved until Add competitor. Errors keep the dialog and the text.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const M = globalThis.__modes;
  const compWrites = () => st.writes.filter((w) => w.table === 'competitors').length;
  const val = (k) => page.inputValue(`#rf-${k}`);
  const note = async () => ((await page.innerText('[data-import-note]').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const dlgMsg = async () => ((await page.innerText('#ciTitle ~ * [data-msg], dialog[open] [data-msg]').catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  const isOpen = () => page.$eval('dialog[aria-labelledby="ciTitle"]', (d) => d.open).catch(() => false);
  // Real-length paste: a product page is long (about 40,000 characters here).
  const LOW1 = 'I bought this for my father after his hip replacement. The poses are fine but the book never says which ones to skip in the first six weeks after surgery, and the photos show a young model who clearly has no stiffness at all. We returned it.';
  const LOW2 = 'The binding cracked on day three and pages started falling out. The routines themselves are short and repetitive, and there is no plan for what to do after the first month, so it ends up as the same ten minutes every day.';
  const HIGH1 = 'My shoulders feel looser after two weeks of the morning routine, and I can finally get up from the sofa without pushing on the armrest. The large print and big photos are a real help for my eyes.';
  const PAGE = ['Chair Yoga for Seniors Over 60: Gentle Seated Routines for Stiff Joints', 'by Dana Whitfield (Author)', '4.4 out of 5 stars', 'Best Sellers Rank: #45,210 in Books', LOW1, LOW2, HIGH1]
    .join('\n') + '\n' + 'Customers who viewed this item also viewed. '.repeat(880);
  const GOOD = {
    title: 'Chair Yoga for Seniors Over 60: Gentle Seated Routines for Stiff Joints, Better Balance, and Daily Calm',
    author: 'Dana Whitfield', bsr: 45210, reviews: null, rating: 4.4,
    low_reviews: [LOW1, LOW2], high_reviews: [HIGH1]
  };
  const openAdd = async () => {
    await page.click('[data-add-comp]');
    await page.waitForSelector('[data-form] [data-import]', { timeout: 5000 });
  };
  const openImport = async () => {
    await page.click('[data-import]');
    await page.waitForSelector('dialog[open] #ciText', { timeout: 5000 });
  };
  const read = async (text = PAGE) => {
    await page.fill('#ciText', text);
    await page.click('dialog[open] [data-confirm]');
  };
  const waitDone = () => page.waitForFunction(() => { const b = document.querySelector('dialog[aria-labelledby="ciTitle"]'); return !b.open || !b.querySelector('[data-confirm]').disabled; }, null, { timeout: 8000 });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:5500/app/book.html?id=${R2}&step=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-add-comp]:not([disabled])', { timeout: 10000 });

  // 1. Edit form has no Import button; Add form has it.
  await page.click('[data-edit-comp]');
  await page.waitForSelector('[data-form]');
  ok(!(await page.$('[data-form] [data-import]')), 'Edit competitor: no Import button');
  await page.click('[data-form-cancel]');
  await openAdd();
  const ib = await page.$eval('[data-import]', (b) => [b.textContent.trim(), b.getBoundingClientRect().height]);
  ok(ib[0] === 'Import from Amazon page' && ib[1] >= 44, `button text and 44 px (${ib})`);

  // 2. The author typed a title first. Open the dialog.
  await page.fill('#rf-title', 'My own working title');
  await openImport();
  ok(await page.evaluate(() => document.activeElement.id === 'ciText'), 'focus in Page text');
  const head = (await page.innerText('dialog[open] .dialog-head')).replace(/\s+/g, ' ');
  ok(/Paste one book’s Amazon page\. We fill the form for you\. Nothing is saved until you click Add competitor\./.test(head), 'dialog text');
  ok(/Uses about \$0\.01 to \$0\.04 of AI\. It counts only if it works\./.test(await page.innerText('dialog[open] .import-notes')), 'cost line');
  ok((await page.$$eval('dialog[open] .import-steps li', (l) => l.length)) === 3, 'three steps');

  // 3. Too short: field error, no call.
  await read('Too short to be a page.');
  ok(/too short to be an Amazon page/.test(await page.innerText('#ciText-error')) && st.gens.length === 0, 'too short: error, no call');
  ok(/23 \/ 60,000 characters/.test(await page.innerText('dialog[open] [data-count]')), 'character count');

  // 4. Not a product page: alert, text kept, dialog stays.
  M.cimpCode = 'not_product_page';
  await read();
  await waitDone();
  ok(await isOpen() && /does not look like one book’s Amazon page.*This try was not counted\./.test(await dlgMsg()), `not a product page: "${(await dlgMsg()).slice(0, 80)}"`);
  ok((await page.inputValue('#ciText')).length === PAGE.length && PAGE.length > 39000, `text kept (${PAGE.length})`);
  M.cimpCode = 'rate_limited';
  await page.click('dialog[open] [data-confirm]');
  await waitDone();
  ok(/Too many requests/.test(await dlgMsg()), 'rate limit message');
  M.cimpCode = null;

  // 5. Good read: fills only empty fields, nothing saved.
  M.cimp = GOOD;
  const writes = compWrites();
  await page.click('dialog[open] [data-confirm]');
  await waitDone();
  ok(!(await isOpen()), 'dialog closes');
  const g = st.gens.at(-1);
  ok(g.stage === 'competitor_import' && g.bookId === R2 && g.text === PAGE && Object.keys(g).length === 3, 'sends { stage, bookId, text } only');
  ok((await val('title')) === 'My own working title', 'typed title kept');
  ok((await val('author')) === 'Dana Whitfield' && (await val('bsr')) === '45210' && (await val('rating')) === '4.4', 'author, BSR, rating filled');
  ok((await val('reviews')) === '', 'missing review count stays empty');
  ok((await val('low_reviews')) === `${LOW1}\n\n${LOW2}` && (await val('high_reviews')) === HIGH1, 'reviews split by a blank line');
  ok(/2 reviews/.test(await page.innerText('[data-counter="low_reviews"]')), 'counter sees 2 reviews');
  ok((await note()) === 'Filled 5 fields. Kept 1 you typed. Check each field, then click Add competitor. Not on the page: review count.', `note: "${await note()}"`);
  ok(await page.evaluate(() => document.activeElement.id === 'rf-title'), 'focus on Title');
  ok(compWrites() === writes, 'nothing saved yet');
  await page.screenshot({ path: `${SHOTS}/research-import-filled.png`, fullPage: true, timeout: 5000 }).catch(() => {});

  // 6. Add competitor saves exactly the form.
  await page.fill('#rf-title', GOOD.title);
  await page.click('[data-form-save]');
  await page.waitForFunction(() => !document.querySelector('[data-form]'), null, { timeout: 5000 });
  const post = st.writes.filter((w) => w.table === 'competitors').at(-1);
  const row = post && post.body[0];
  ok(row && row.title === GOOD.title && row.bsr === 45210 && row.reviews === null && row.rating === 4.4 && row.low_reviews === `${LOW1}\n\n${LOW2}`, 'Add competitor saves the filled values');

  // 7. A book already in the list, and a page with no reviews.
  await openAdd();
  ok((await note()) === '', 'a new form has no import note');
  await openImport();
  ok((await page.inputValue('#ciText')) === '', 'after a good read the dialog starts empty');
  M.cimp = { title: 'Chair Yoga for Seniors', author: 'Author 1', bsr: null, reviews: 300, rating: null, low_reviews: [], high_reviews: [] };
  await read();
  await waitDone();
  ok((await note()) === 'Filled 3 fields. Check each field, then click Add competitor. Not on the page: BSR, rating. No reviews on the page. Paste them from the reviews page. This book is already in your list.', `note: "${await note()}"`);
  ok(!!(await page.$('[data-import-note] svg')), 'duplicate line has the warning icon');

  // 8. Import again on the same form: everything is filled now, nothing changes.
  await openImport();
  M.cimp = { ...GOOD, low_reviews: [], high_reviews: [] };
  await read();
  await waitDone();
  // BSR and rating were still empty, so they fill; title and author keep the first values;
  // the review count has a value, so "Not on the page" does not name it.
  ok((await note()) === 'Filled 2 fields. Kept 2 you typed. Check each field, then click Add competitor. No reviews on the page. Paste them from the reviews page. This book is already in your list.', `second import: "${await note()}"`);
  ok((await val('bsr')) === '45210' && (await val('reviews')) === '300', 'second import filled BSR, kept the review count');
  // Everything filled now: a third import changes nothing.
  await openImport();
  await read();
  await waitDone();
  ok(/^Nothing new to fill\. Kept \d you typed\./.test(await note()), `third import: "${await note()}"`);
  ok((await val('title')) === 'Chair Yoga for Seniors', 'title from the first import kept');
  await page.click('[data-form-cancel]');

  // 9. Cancel during the call: the reply is dropped.
  await openAdd();
  await openImport();
  M.cimp = GOOD;
  M.cimpDelay = 1500;
  await read();
  await page.waitForTimeout(200);
  ok(await page.isDisabled('dialog[open] [data-confirm]') && /Reading the page/.test(await page.innerText('dialog[open] [data-wait]')), 'busy while reading');
  await page.click('dialog[open] .dialog-foot [data-close]');
  await page.waitForTimeout(1800);
  ok(!(await isOpen()) && (await val('author')) === '' && (await note()) === '', 'cancelled: form untouched');
  M.cimpDelay = 0;
  await page.click('[data-form-cancel]');
  ok(!st.writes.some((x) => x.failed), 'no refused write');
  M.cimp = null;
  return log.join('\n');
};
