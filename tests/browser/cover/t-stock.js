// E16 Part 7: stock pictures (plan §7, design 63). The Pixabay and Unsplash tabs of the Images panel (search, Go,
// No background only, every Pixabay result and 6 Unsplash results with the source in each line, Open large view,
// the licence note; E16.1: here the book has no seed words, t-stock-browse.js checks the topic search); the wide picker
// (tabs, licence link, filters, results, PREVIEW, Add to cover, Back to results, More results, the source line);
// picks (Pixabay: a copy in Uploads; Unsplash: a linked picture, loaded from images.unsplash.com), Replace from a
// stock tab, the credits (picker, panel, the picture's More menu, utm links), stock down and the other errors,
// keyboard (Escape, focus, the cover's keys rest), and the Step D rules in the picker.
// Mocked: the stock function, Pixabay and Unsplash are the mock and fixture-stock.js; nothing leaves the page.
const test = async page => {
  const { log, ok } = CV.log();
  const st = globalThis.__store;
  const E = (fn, arg) => page.evaluate(fn, arg);
  const calls = () => st.stock.calls;
  const last = () => st.stock.calls[st.stock.calls.length - 1];
  const sdOpen = () => CV.has(page, '[data-stockdlg]');
  const settle = () => page.waitForFunction(() => { const S = window.kdpBookSteps[9]._debug().stock; return S && !S.busy && !Object.values(S.res).some((r) => r && (r.st === 'loading' || r.more)); }, null, { timeout: 10000 });
  const search = async (sel, q) => { await page.fill(sel, q); await page.press(sel, 'Enter'); await settle(); };
  // Step D (the Part 6 rule: buttons, selects, links and check box labels have a 44 × 44 px click area)
  const sizes = (scope) => page.evaluate((sc) => {
    const out = [];
    for (const el of document.querySelectorAll(`${sc} button, ${sc} select, ${sc} a, ${sc} label:has(input[type="checkbox"])`)) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect(), a = getComputedStyle(el, '::after');
      const aw = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.width) : 0, ah = a.content !== 'none' && a.position === 'absolute' ? parseFloat(a.height) : 0;
      out.push({ k: el.dataset.k || el.textContent.trim().slice(0, 16) || el.tagName, w: Math.max(r.width, aw), h: Math.max(r.height, ah) });
    }
    return out;
  }, scope);
  const small44 = (list) => list.filter((c) => c.w < 43.5 || c.h < 43.5).map((c) => `${c.k} ${Math.round(c.w)}×${Math.round(c.h)}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'band' });
  ok((await STK.ready(page)) === STK.PIXABAY.length + STK.UNSPLASH.length, 'the fixture pictures are drawn and kept by the mock');
  // E16.1: a book with no topic and no title: Pixabay opens empty, as before (t-stock-browse.js: the seeded search).
  await page.evaluate(() => { window.kdpBookSteps[9]._debug().seed = ''; });
  const n0 = (await CV.state(page)).layers.length;

  /* ── The panel's Pixabay tab ── */
  await page.click('[data-tool="images"]');
  await page.waitForSelector('[data-srctab="pixabay"]');
  await page.click('[data-srctab="pixabay"]');
  const tabs = await page.$$eval('.cv-srctab', (a) => a.map((t) => [t.textContent, t.getAttribute('aria-selected')]));
  ok(tabs.map((t) => t.join(':')).join('|') === 'Uploads:false|Pixabay:true|Unsplash:false', `the Pixabay tab is selected: ${tabs.map((t) => t.join(':'))}`);
  ok(!(await CV.has(page, '[data-rights]')) && !(await CV.has(page, '[data-up-file]')), 'no rights box or upload buttons under a stock tab (the rights tick is for your own files)');
  ok(await page.$eval('[data-stock-q]', (i) => i.placeholder === 'Search Pixabay' && i.getAttribute('aria-label') === 'Search Pixabay' && i.maxLength === 100), 'the search box: "Search Pixabay", 100 characters at most');
  ok((await CV.txt(page, '[data-k="stk-go"]')) === 'Go' && (await CV.txt(page, '[data-stock-open]')) === 'Open large view', 'Go and Open large view (the design\'s words)');
  ok(await page.$eval('[data-stock-nobg]', (b) => b.textContent.trim() === 'No background only' && b.getAttribute('aria-pressed') === 'false'), '"No background only", not pressed');
  ok((await CV.txt(page, '[data-stock-note]')) === 'Free to use on covers you sell (Pixabay Content License). The app shows that results come from Pixabay. No logos, brands or famous people.', 'the Pixabay note is the design\'s');
  ok(/Results come from Pixabay/.test(await CV.txt(page, '[data-stock-idle]')), 'before a search: what to type, and that results come from Pixabay');
  await page.click('[data-k="stk-go"]');
  ok((await CV.txt(page, '[data-stock-idle]')) === 'Type a word, then press Go.' && calls().length === 0, 'Go with no words: a hint, no call');
  await search('[data-stock-q]', '  green \t leaf  ');
  ok(JSON.stringify(last()) === JSON.stringify({ action: 'search', source: 'pixabay', q: 'green leaf', page: 1, filters: { type: 'all', color: 'any', editors: false, safe: true } }),
    `the call: ${JSON.stringify(last())} (words folded, safe search on)`);
  let caps = await CV.all(page, '[data-stock-tiles] .cv-stock-cap');
  ok(caps.length === STK.PIXABAY.length && caps[0] === 'green leaf · vector' && caps[1] === 'coffee cup · illustration', `E16.1: every Pixabay result in the panel (${caps.length}), "name · type": ${caps.slice(0, 2)}`);
  ok(await page.$eval('[data-stock-add="1000"]', (b) => b.getAttribute('aria-label') === 'Add green leaf, Pixabay, no background' && !!b.querySelector('img.is-clear')), 'a tile: "Add green leaf, Pixabay, no background", on the checkerboard');
  ok(await page.$eval('[data-stock-add="1000"] img', (i) => i.src === 'https://pixabay.com/get/g1000_640.png' && i.referrerPolicy === 'no-referrer'), 'the thumbnail is Pixabay\'s own search-result link (no referrer)');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-stock-tiles] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 });
  ok(true, 'the thumbnails load');
  await page.click('[data-stock-nobg]');
  await settle();
  ok(last().filters.color === 'transparent' && await page.$eval('[data-stock-nobg]', (b) => b.getAttribute('aria-pressed') === 'true' && b.classList.contains('is-on')), 'No background only: pressed, searches with color "transparent"');

  /* ── The Unsplash tab: it waits for Go or Enter until Unsplash production (owner, STOP 7, N10) ── */
  let nCalls = calls().length;
  await page.click('[data-srctab="unsplash"]');
  await page.waitForTimeout(300);
  ok(calls().length === nCalls && (await CV.txt(page, '[data-stock-press]')) === 'Press Go to look' && !(await CV.has(page, '[data-stock-tiles]')),
    'N10: opening Unsplash with words in the box calls nothing and says "Press Go to look"');
  ok(await page.$eval('[data-stock-q]', (i) => i.value === 'green leaf'), 'the words stay in the box');
  await page.click('[data-k="stk-go"]'); await settle();
  ok(calls().length === nCalls + 1 && JSON.stringify(last()) === JSON.stringify({ action: 'search', source: 'unsplash', q: 'green leaf', page: 1, filters: { color: 'any' } }),
    `Go searches Unsplash once: ${JSON.stringify(last())}`);
  ok(!(await CV.has(page, '[data-stock-nobg]')) && await page.$eval('[data-stock-q]', (i) => i.placeholder === 'Search Unsplash'), 'Unsplash: "Search Unsplash", no "No background only"');
  caps = await CV.all(page, '[data-stock-tiles] .cv-stock-cap');
  ok(caps.length === 6 && caps[0] === 'Photo by Mara Lind · Unsplash', `Unsplash lines name the photographer: ${caps[0]}`);
  ok((await CV.txt(page, '[data-stock-note]')) === 'Free to use on covers you sell (Unsplash License). The app shows the photographer and a link. No logos, brands or famous people.', 'the Unsplash note is the design\'s');
  await page.click('[data-srctab="pixabay"]');
  ok(calls().length === nCalls + 1 && (await CV.all(page, '[data-stock-tiles] .cv-stock-cap')).length === (await page.evaluate(() => window.kdpBookSteps[9]._debug().stock.res.pixabay.list.length)), 'back to Pixabay: the answer it had, no new call');

  /* ── The wide picker ── */
  await page.click('[data-stock-open]');
  await page.waitForSelector('[data-stockdlg]');
  ok(await page.$eval('.cv-sd', (d) => d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && d.getAttribute('aria-label') === 'Find a picture'), 'Open large view: a modal dialog "Find a picture"');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-sd-q]')), 'focus goes to its search box');
  ok(await page.$eval('[data-sd-q]', (i) => i.value === 'green leaf' && i.placeholder === 'Search, for example: study desk'), 'the box keeps the words; the design\'s placeholder');
  ok(await page.$$eval('[data-sd-tab]', (a) => a.map((t) => t.textContent + ':' + t.getAttribute('aria-selected')).join('|')) === 'Pixabay:true|Unsplash:false', 'tabs Pixabay (on) and Unsplash');
  ok(await page.$eval('.cv-sd-lic', (a) => a.textContent === 'Pixabay License' && a.href === 'https://pixabay.com/service/license-summary/' && a.target === '_blank' && a.rel === 'noopener'), 'the Pixabay License link');
  ok(await page.$$eval('[data-sd-f="type"] option', (o) => o.map((x) => x.textContent).join('|')) === 'Any type|Photo|Illustration|Vector', 'Type: Any type, Photo, Illustration, Vector');
  ok(await page.$$eval('[data-sd-f="color"] option', (o) => o.map((x) => x.textContent).join('|')) === 'Any color|No background|Black|White|Gray|Red|Orange|Yellow|Green|Blue|Pink|Brown', 'Color: the design\'s 12 (No background second)');
  ok(await page.$eval('[data-sd-f="color"]', (s) => s.value === 'transparent') && await page.$eval('[data-sd-f="safe"]', (c) => c.checked) && !(await page.$eval('[data-sd-f="editors"]', (c) => c.checked)), 'it keeps No background; Safe search on, Editors\' Choice off');
  ok(await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === 9, '9 results in the grid (the see-through ones)');
  ok(await page.$eval('[data-sd-grid]', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length === 6), '6 a row at 1440');
  ok((await CV.txt(page, '[data-sd-count]')) === '9 results', `the count: ${await CV.txt(page, '[data-sd-count]')}`);
  ok((await CV.txt(page, '.cv-sd-foot')).endsWith('Results from Pixabay. Color "No background" finds PNG pictures with a see-through background. The chosen picture is saved to your uploads.'), 'the source line is the design\'s');
  ok(await page.$$eval('[data-stock-look]', (a) => a.every((b) => b.textContent === 'PREVIEW')), 'each result has its PREVIEW pill');
  await page.selectOption('[data-sd-f="type"]', 'vector'); await settle();
  ok(last().filters.type === 'vector' && await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === 5, 'Type Vector: searched again, 5 results');
  await page.click('[data-sd-f="editors"]'); await settle();
  ok(last().filters.editors === true, 'Editors\' Choice: searched again with editors true');
  await page.click('[data-sd-f="safe"]'); await settle();
  ok(last().filters.safe === false, 'Safe search off: searched again with safe false');
  await page.click('[data-sd-f="safe"]'); await page.click('[data-sd-f="editors"]'); await page.selectOption('[data-sd-f="type"]', 'all'); await settle();

  /* Unsplash in the picker: its own colors (D7), its licence; it searches only on Search or Enter (N10). */
  nCalls = calls().length;
  await page.click('[data-sd-tab="unsplash"]'); await settle();
  ok(calls().length === nCalls && await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === STK.UNSPLASH.length, 'the Unsplash tab shows the answer it has for these words, no new call');
  ok(await page.$$eval('[data-sd-tab]', (a) => a[1].getAttribute('aria-selected') === 'true') && await page.$eval('.cv-sd-lic', (a) => a.textContent === 'Unsplash License' && a.href === 'https://unsplash.com/license'), 'the Unsplash tab and the Unsplash License link');
  ok(await page.$$eval('[data-sd-f="ucolor"] option', (o) => o.map((x) => x.value).join(',')) === 'any,black_and_white,black,white,yellow,orange,red,purple,magenta,green,teal,blue', 'Unsplash colors are Unsplash\'s own (D7: no No background, gray, pink or brown)');
  ok(!(await CV.has(page, '[data-sd-f="type"]')) && !(await CV.has(page, '[data-sd-f="safe"]')), 'no Type or Safe search on Unsplash (content_filter is always high on the server)');
  ok((await CV.txt(page, '.cv-sd-foot')).endsWith('Photos from Unsplash. Each photo shows its photographer with a link. Unsplash has very few pictures without a background.'), 'the Unsplash source line');
  nCalls = calls().length;
  await page.selectOption('[data-sd-f="ucolor"]', 'teal');
  await page.waitForTimeout(300);
  ok(calls().length === nCalls && (await CV.txt(page, '[data-stockdlg] [data-stock-press]')) === 'Press Search to look' && !(await CV.has(page, '[data-sd-grid]')) && (await CV.txt(page, '[data-sd-count]')) === '',
    'N10: a new Unsplash color calls nothing; the large view says "Press Search to look" (no count)');
  ok(await page.$eval('[data-stockdlg] [data-stock-press]', (n) => n.getAttribute('role') === 'status') && (await CV.txt(page, '[data-panel] [data-stock-press]')) === 'Press Go to look',
    'the words are a status line; the panel under it says "Press Go to look" (its button is Go)');
  await page.click('[data-k="sd-go"]'); await settle();
  ok(calls().length === nCalls + 1 && JSON.stringify(last().filters) === '{"color":"teal"}', 'Search sends Unsplash color teal as it is, one call');
  await page.selectOption('[data-sd-f="ucolor"]', 'any');
  await page.press('[data-sd-q]', 'Enter'); await settle();
  ok(calls().length === nCalls + 2 && last().filters.color === 'any' && await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === STK.UNSPLASH.length, 'Enter in the box searches too');
  ok((await E(() => window.kdpBookSteps[9]._debug().img.tab)) === 'unsplash', 'the panel follows the picker\'s tab');

  /* Preview, Unsplash: credit with utm links, sharp enough for the front. */
  await page.click('[data-stock-look="u1AbC"]');
  await page.waitForSelector('[data-sd-prev]');
  ok((await CV.txt(page, '.cv-sd-name')) === 'calm sea' && (await CV.txt(page, '.cv-sd-size')) === '5,760 × 3,840 px', 'the preview: name and size in px');
  ok(/Type: photo/.test(await CV.txt(page, '.cv-sd-info')) && /Source: Photo by Bo Kim on Unsplash/.test(await CV.txt(page, '.cv-sd-info')), '"Type: photo", "Source: Photo by Bo Kim on Unsplash"');
  const links = await page.$$eval('.cv-sd-info a', (a) => a.map((x) => [x.textContent, x.href, x.target, x.rel]));
  ok(links.length === 2 && links[0][0] === 'Bo Kim' && links[0][1] === 'https://unsplash.com/@bo?utm_source=nicheink&utm_medium=referral'
    && links[1][0] === 'Unsplash' && links[1][1] === 'https://unsplash.com/?utm_source=nicheink&utm_medium=referral' && links.every((l) => l[2] === '_blank' && l[3] === 'noopener'),
    `both names link with the utm words: ${links.map((l) => l[1])}`);
  ok(await page.$eval('[data-sd-print]', (n) => n.classList.contains('is-ok') && !!n.querySelector('svg') && n.textContent === 'Sharp up to 19.2 × 12.8 in at 300 DPI'), `"Sharp up to 19.2 × 12.8 in at 300 DPI", ok with an icon`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-sd-add]')) && (await CV.txt(page, '[data-sd-add]')) === 'Add to cover', 'focus on "Add to cover"');
  await page.keyboard.press('Escape');
  ok(!(await CV.has(page, '[data-sd-prev]')) && await sdOpen() && await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-stock-look]')), 'Escape in the preview: back to the results, focus on a PREVIEW pill');

  /* Preview, Pixabay: the 1,280 px file is honest about its size. */
  await page.click('[data-sd-tab="pixabay"]'); await settle();
  await page.click('[data-stock-look="1000"]');
  ok((await CV.txt(page, '.cv-sd-size')) === '1,280 × 1,280 px' && /Type: vector, no background/.test(await CV.txt(page, '.cv-sd-info')), 'Pixabay preview: the size a pick stores, "vector, no background"');
  ok(/Source: Pixabay, by Ann Lee/.test(await CV.txt(page, '.cv-sd-info')) && await page.$$eval('.cv-sd-info a', (a) => a[0].href.startsWith('https://pixabay.com/') && a[1].href === 'https://pixabay.com/users/ann-lee-42/'), '"Source: Pixabay, by Ann Lee", links to Pixabay');
  ok(await page.$eval('[data-sd-print]', (n) => n.classList.contains('is-warn') && !!n.querySelector('svg') && n.textContent === 'Sharp up to 4.3 × 4.3 in at 300 DPI. Too small to fill the front cover sharply.'), 'too small for the 6 × 9 front: amber, with an icon and words');
  await page.click('[data-sd-back]');
  ok(!(await CV.has(page, '[data-sd-prev]')) && await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-stock-look="1000"]')), 'Back to results: focus back on that PREVIEW pill');

  /* Keyboard: the cover's keys rest in the picker; Tab stays inside; Escape closes and gives focus back. */
  const textId = (await CV.state(page)).layers.find((l) => l.type === 'text').id;
  await E((id) => window.kdpBookSteps[9]._debug().select(id), textId);
  const x0 = (await CV.layer(page, textId)).x;
  await page.focus('[data-stock-look="1000"]');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Delete'); await page.keyboard.press('Meta+a');
  ok((await CV.layer(page, textId)) && (await CV.layer(page, textId)).x === x0 && (await CV.state(page)).sel === textId, 'arrows, Delete and Cmd+A in the picker do not touch the cover');
  await page.focus('[data-sd-close]');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => !!document.activeElement.closest('[data-stockdlg]')), 'Tab from the last control stays in the picker');
  await page.keyboard.press('Escape');
  ok(!(await sdOpen()) && (await CV.state(page)).sel === textId && await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-stock-open]')),
    'Escape closes the picker (the selection stays) and focus returns to Open large view');
  await page.click('[data-stock-open]');
  const wrap = await page.$eval('[data-stockdlg]', (n) => { const r = n.getBoundingClientRect(); return [r.left + 10, r.bottom - 10]; });
  await page.mouse.click(wrap[0], wrap[1]);   // the gray around the window (its 24 px edge)
  ok(!(await sdOpen()), 'a click on the gray closes it');
  await E(() => window.kdpBookSteps[9]._debug().select(null));

  /* ── Pick: Pixabay ── */
  await page.click('[data-stock-open]');
  const up0 = st.uploads.length, files0 = Object.keys(st.files).length, assets0 = st.assets.length;
  globalThis.__modes.pickSlow = 400;
  await page.click('[data-stockdlg] [data-stock-add="1003"]');
  await page.waitForTimeout(120);
  ok((await CV.txt(page, '[data-sd-count]')) === 'Adding the picture to your uploads…' && await page.$$eval('[data-stock-add]', (a) => a.every((b) => b.getAttribute('aria-disabled') === 'true')), 'while it is added: the line says so, the tiles wait');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().stock.busy, null, { timeout: 10000 });
  globalThis.__modes.pickSlow = 0;
  ok(JSON.stringify(last()) === JSON.stringify({ action: 'pick', source: 'pixabay', id: '1003', bookId: FIX.BOOK }), `the pick sends the id only: ${JSON.stringify(last())}`);
  ok(!(await sdOpen()), 'the picker closes after the pick');
  let s = await CV.state(page);
  let L = s.layers[s.layers.length - 1];
  const prow = st.assets[st.assets.length - 1];
  ok(s.layers.length === n0 + 1 && L.type === 'image' && L.name === 'light bulb' && L.asset === prow.id && s.sel === L.id, 'the picture is on the cover, selected, named "light bulb"');
  ok(L.natW === 1280 && L.natH === 1280 && L.transparent === true && Math.abs(L.w - 300) < 1e-6, 'its size is the stored file\'s (1,280 × 1,280), see-through, 300 px on the long side');
  ok(st.assets.length === assets0 + 1 && Object.keys(st.files).length === files0 + 1 && st.files[prow.path] && prow.path === `00000000-0000-4000-8000-000000000001/assets/${prow.id}.png`, 'a copy in your uploads: <user>/assets/<id>.png');
  ok(st.uploads.length === up0, 'the browser uploaded nothing itself (the function stored it)');
  await page.waitForFunction((id) => { const E = window.kdpBookSteps[9]._debug(); const p = E.pics.get(id); return p && p.st === 'ready'; }, prow.id, { timeout: 10000 });
  ok(true, 'the picture loads from your bucket');
  ok(await page.$eval('[data-srctab="pixabay"]', (t) => t.getAttribute('aria-selected') === 'true'), 'the panel stays on the Pixabay tab');
  await page.click('[data-srctab="up"]');
  await page.waitForSelector(`[data-add-asset="${prow.id}"]`);
  ok(await page.$eval(`[data-add-asset="${prow.id}"]`, (t) => t.getAttribute('aria-label') === 'Add light bulb (Pixabay), 1,280 × 1,280 px, see-through' && t.querySelector('.cv-uptile-src').textContent === 'Pixabay'),
    'Uploads lists it first: "Add light bulb (Pixabay), …", marked Pixabay');
  ok((await page.$$eval('[data-add-asset]', (a) => a.map((t) => t.dataset.addAsset)))[0] === prow.id, 'newest first');
  await page.click('[data-k="more"]');
  ok((await CV.txt(page, '[data-credit]')) === 'Pixabay, by Ann Lee' && await page.$$eval('[data-credit] a', (a) => a.length === 2 && a.every((x) => x.href.startsWith('https://pixabay.com/') && x.target === '_blank')), 'More: "Pixabay, by Ann Lee", linked');
  await page.keyboard.press('Escape');

  /* ── Pick: Unsplash (linked, never copied) ── */
  await page.click('[data-srctab="unsplash"]'); await settle();
  const files1 = Object.keys(st.files).length;
  st.stock.net.length = 0;
  await page.click('[data-stock-add="u2AbC"]');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().stock.busy, null, { timeout: 10000 });
  s = await CV.state(page);
  L = s.layers[s.layers.length - 1];
  const urow = st.assets[st.assets.length - 1];
  ok(urow.source === 'unsplash' && urow.path === null && urow.remote.url === 'https://images.unsplash.com/photo-u2AbC?ixid=t' && Object.keys(st.files).length === files1, 'an Unsplash pick: a linked row, no copy in the bucket');
  ok(L.asset === urow.id && L.name === 'forest path' && L.natW === 6720 && L.natH === 4480 && s.sel === L.id, 'on the cover: "forest path", 6,720 × 4,480');
  await page.waitForFunction((id) => { const p = window.kdpBookSteps[9]._debug().pics.get(id); return p && p.st === 'ready'; }, urow.id, { timeout: 10000 });
  const fetched = st.stock.net.filter((u) => u.startsWith('https://images.unsplash.com/photo-u2AbC'));
  ok(fetched.some((u) => /[?&]ixid=t(&|$)/.test(u) && /[?&]w=4096(&|$)/.test(u) && /[?&]fit=max/.test(u)), `the screen copy comes from Unsplash's link at 4,096 px, its ixid kept: ${fetched[0]}`);
  ok(await page.$eval('[data-dpi]', (b) => /DPI/.test(b.textContent)), 'the DPI badge reads the full size');
  await page.click('[data-k="more"]');
  const ul = await page.$$eval('[data-credit] a', (a) => a.map((x) => [x.textContent, x.href]));
  const mbad = small44(await sizes('.cv-textbar .cv-pop'));
  ok(!mbad.length, `More with the credit: 44 × 44${mbad.length ? ': ' + mbad.join(', ') : ''}`);
  ok((await CV.txt(page, '[data-credit]')) === 'Photo by Ana Ruiz on Unsplash' && ul.length === 2 && ul[0][1] === 'https://unsplash.com/@ana?utm_source=nicheink&utm_medium=referral' && ul[1][1] === 'https://unsplash.com/?utm_source=nicheink&utm_medium=referral',
    `More: "Photo by Ana Ruiz on Unsplash", both linked with utm: ${ul.map((x) => x[1])}`);
  await page.keyboard.press('Escape');

  /* ── Replace from a stock tab ── */
  await page.click('[data-iact="replace"]');
  ok(await CV.has(page, '[data-rep-cancel]') && /Pick a picture to replace the selected one/.test(await CV.txt(page, '[data-panel]')), 'Replace: the panel says what to do, on the stock tab too');
  ok(await page.$eval('[data-stock-add="u0AbC"]', (b) => b.getAttribute('aria-label').startsWith('Replace with warm abstract')), 'tiles say "Replace with …"');
  const box = { x: L.x, y: L.y, w: L.w };
  await page.waitForTimeout(600);   // undo merges changes under 500 ms apart (Part 5)
  await page.click('[data-stock-add="u0AbC"]');
  await page.waitForFunction(() => !window.kdpBookSteps[9]._debug().stock.busy, null, { timeout: 10000 });
  s = await CV.state(page);
  const R = s.layers.find((l) => l.id === L.id);
  ok(s.layers.length === n0 + 2 && R && R.name === 'warm abstract' && R.asset === st.assets[st.assets.length - 1].id && R.x === box.x && R.y === box.y && R.w === box.w, 'the same layer, the new picture, the box kept');
  ok(!(await CV.has(page, '[data-rep-cancel]')), 'Replace is done');

  /* ── Undo: the layer goes, the picture stays in Uploads ── */
  const assetsNow = st.assets.length;
  await page.waitForTimeout(600);
  await page.focus(`[data-hit="${L.id}"]`);
  await page.keyboard.press('Meta+z');
  ok((await CV.state(page)).layers.find((l) => l.id === L.id).name === 'forest path' && st.assets.length === assetsNow, 'undo puts the old picture back; Uploads keeps both');

  /* ── More results ── */
  globalThis.__modes.stockMany = 1;
  await page.click('[data-srctab="pixabay"]');
  await page.click('[data-stock-open]');
  await page.selectOption('[data-sd-f="color"]', 'any'); await settle();
  await search('[data-sd-q]', 'study desk');
  // E16.1: the end of the 24 is near in the large view, so page 2 loads by itself (t-stock-browse.js: the details).
  await page.$eval('[data-sd-body]', (b) => { b.scrollTop = b.scrollHeight; });
  await page.waitForFunction(() => document.querySelectorAll('[data-sd-grid] .cv-sd-tile').length === 30, null, { timeout: 8000 }).catch(() => {});
  await settle();
  ok(last().page === 2 && await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === 30 && !(await CV.has(page, '[data-sd-more]')) && (await CV.txt(page, '[data-sd-count]')) === '30 results', 'page 2 loads at the end: 30 of 30, no More button');
  ok(await page.$eval('[data-sd-body]', (b) => b.scrollTop > 0), 'the grid kept its scroll place over the redraw');
  await page.$eval('[data-stockdlg] [data-stock-look="2028"]', (b) => b.scrollIntoView({ block: 'center' }));
  const top0 = await page.$eval('[data-sd-body]', (b) => b.scrollTop);
  await page.click('[data-stockdlg] [data-stock-look="2028"]');
  await page.click('[data-sd-back]');
  ok(Math.abs((await page.$eval('[data-sd-body]', (b) => b.scrollTop)) - top0) <= 1 && await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-stock-look="2028"]')),
    `Back to results: the grid where it was (${top0} px down), the focus on that PREVIEW pill`);
  globalThis.__modes.stockMany = 0;
  // the picker's words are what the panel shows too
  await page.keyboard.press('Escape');
  ok((await page.$eval('[data-stock-q]', (i) => i.value)) === 'study desk', 'the panel\'s box has the picker\'s words');

  /* ── No results ── */
  await search('[data-stock-q]', 'nothing at all');
  ok((await CV.txt(page, '[data-stock-none]')) === 'No pictures match. Try other words or remove a filter.', 'no results: the design\'s words (panel)');
  await page.click('[data-stock-open]');
  ok((await CV.txt(page, '[data-stock-none]')) === 'No pictures match. Try other words or remove a filter.' && (await CV.txt(page, '[data-sd-count]')) === '0 results', 'no results: the design\'s words (large view), 0 results');
  await page.keyboard.press('Escape');

  /* ── Stock down and the other errors ── */
  for (const [code, words] of [['stock_unavailable', 'Pixabay is not answering right now. Try again in a minute, or use your own uploads.'],
    ['not_configured', 'Pixabay is not answering right now. Try again in a minute, or use your own uploads.'],
    ['stock_busy', 'Pixabay is not answering right now. Try again in a minute, or use your own uploads.'],
    ['rate_limited', 'That was a lot of searches in one minute. Wait a moment, then try again.']]) {
    globalThis.__modes.stockFail = 1; globalThis.__modes.stockCode = code;
    await search('[data-stock-q]', 'leaf ' + code);
    ok((await CV.txt(page, '[data-stock-down]')) === words && await page.$eval('[data-stock-down]', (n) => n.getAttribute('role') === 'alert' && !!n.querySelector('svg')), `${code} (panel): "${words}", an alert with an icon`);
  }
  await page.click('[data-stock-retry]'); await settle();
  ok((await CV.all(page, '[data-stock-tiles] .cv-stock-cap')).length === (await page.evaluate(() => window.kdpBookSteps[9]._debug().stock.res.pixabay.list.length)) && !(await CV.has(page, '[data-stock-down]')), 'Try again: the results come back');
  globalThis.__modes.stockNet = 1;
  await search('[data-stock-q]', 'leaf net');
  ok((await CV.txt(page, '[data-stock-down]')) === 'Pixabay is not answering right now. Try again in a minute, or use your own uploads.', 'the function out of reach: the stock-down words');
  await page.click('[data-srctab="unsplash"]');
  await page.click('[data-stock-open]');
  globalThis.__modes.stockFail = 1; globalThis.__modes.stockCode = 'not_configured';
  await search('[data-sd-q]', 'sea down');
  ok((await CV.txt(page, '.cv-sd-down p')) === 'Unsplash is not answering right now. Try again in a minute, or use your own uploads.' && await page.$eval('[data-stock-down]', (n) => n.getAttribute('role') === 'alert' && !!n.querySelector('svg')),
    'stock down in the large view (Unsplash, no key set): the design\'s words, an alert with an icon');
  await page.click('[data-stockdlg] [data-stock-retry]'); await settle();
  ok(await page.$$eval('[data-sd-grid] .cv-sd-tile', (a) => a.length) === STK.UNSPLASH.length, 'Try again in the large view: the results');
  const layersBefore = (await CV.state(page)).layers.length;
  for (const [code, words] of [['too_large', 'This picture is too big to save (over 10 MB). Pick another one.'], ['not_found', 'This picture is no longer on Unsplash. Pick another one.'],
    ['stock_busy', 'Unsplash is not answering right now. Try again in a minute, or use your own uploads.'], ['rate_limited', 'That was a lot of pictures in one minute. Wait a moment, then try again.']]) {
    globalThis.__modes.pickFail = 1; globalThis.__modes.pickCode = code;
    await page.click('[data-stockdlg] [data-stock-add="u3AbC"]');
    await settle();
    ok(await sdOpen() && (await CV.txt(page, '.cv-sd-err')) === words && (await CV.state(page)).layers.length === layersBefore, `pick ${code}: "${words}", the picker stays, nothing added`);
  }
  await page.click('[data-stock-look="u3AbC"]');
  globalThis.__modes.pickFail = 1; globalThis.__modes.pickCode = 'bad_image';
  await page.click('[data-sd-add]'); await settle();
  ok((await CV.txt(page, '.cv-sd-info .cv-uperr')) === 'This picture is not a JPG or PNG we can use. Pick another one.', 'a failed pick from the preview says why there');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  /* ── Step D (the Part 6 rule: buttons, selects, links and check box labels have a 44 × 44 px click area) ── */
  for (const tab of ['pixabay', 'unsplash']) {
    await page.click(`[data-srctab="${tab}"]`); await settle();
    if (tab === 'unsplash') { await page.click('[data-k="stk-go"]'); await settle(); }   // N10: Unsplash waits for Go
    const list = await sizes('[data-panel]'), bad = small44(list);
    ok(list.length >= 8 && !bad.length, `panel, ${tab} tab: ${list.length} controls with 44 × 44${bad.length ? ': ' + bad.join(', ') : ''}`);
  }
  for (const tab of ['pixabay', 'unsplash']) {
    await page.click(`[data-srctab="${tab}"]`); await settle();
    await page.click('[data-stock-open]'); await settle();
    const list = await sizes('[data-stockdlg]'), bad = small44(list);
    ok(list.length > 10 && !bad.length, `picker, ${tab}: ${list.length} controls with 44 × 44 (selects 44 px tall)${bad.length ? ': ' + bad.slice(0, 4).join(', ') : ''}`);
    if (tab === 'pixabay') {
      await page.click('[data-stock-look="1000"]');
      const pv = await sizes('[data-stockdlg]'), pbad = small44(pv);
      ok(pv.length > 10 && !pbad.length, `preview (with its 2 credit links): 44 × 44${pbad.length ? ': ' + pbad.join(', ') : ''}`);
      await page.click('[data-sd-back]');
    }
    await page.keyboard.press('Escape');
  }
  await page.click('[data-stock-open]'); await settle();
  const fonts = await page.$$eval('[data-stockdlg] *', (ns) => ns.filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
  ok(fonts.length && Math.min(...fonts) >= 12, `UI text 12 px or more (smallest ${Math.min(...fonts)})`);
  await page.focus('[data-sd-tab="pixabay"]');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return [c.outlineStyle, c.outlineWidth, c.outlineOffset, c.outlineColor]; });
  ok(ring.join(' ') === 'solid 2px 2px rgb(28, 28, 26)', `the focus ring: 2 px ink, 2 px off (${ring})`);
  await page.keyboard.press('Escape');

  /* ── At 1024 px: no sideways scroll, 4 a row (E16 Part 9: under 1200 px the panel opens over the cover from its tool) ── */
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.click('[data-tool="images"]');
  await page.click('[data-stock-open]');
  await settle();
  ok(await CV.noScroll(page) && await page.$eval('[data-sd-grid]', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length === 4), 'at 1024: no sideways scroll, 4 results a row');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  ok(st.cdn.filter((c) => c.startsWith('NET ')).length === 0, 'no request left the mock');
  ok(st.stock.calls.every((c) => !Object.values(c).some((v) => typeof v === 'string' && /^https?:/.test(v))), 'the browser never sends a link to the stock function');
  ok(CV.mockErrors().length === 0, 'no mock errors');
  await CV.quiet(page);
  return log.join('\n');
};
