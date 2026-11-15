// E16 Part 5: the Tabler filled icons (plan §8, owner Q-4, D11): the set loads the first time the Shapes panel
// opens (never at page load), "Loading icons…", a failed load with Retry, the grid (cover favorites first, 48 at a
// time, Show more), search by name, category and tags, no brand logos, an icon added as a shape layer that keeps its
// name and Tabler's paths, recolored with Fill and Border, drawn, saved, and drawn again after a reload without the set.
const test = async page => {
  const { log, ok } = CV.log();
  await page.setViewportSize({ width: 1440, height: 900 });
  await CV.open(page, { design: 'empty' });
  const sel = async () => { const s = await CV.state(page); return s.layers.find((l) => l.id === s.sel); };
  const setLoaded = () => page.evaluate(() => !!window.kdpCover.iconSet);
  const scripts = () => page.$$eval('script[src*="icon-set.js"]', (a) => a.length);

  ok(!(await setLoaded()) && (await scripts()) === 0, 'the icon set is not loaded with the page');

  /* A failed load: the error and Retry. */
  let fail = true;
  await page.route('**/js/cover/icon-set.js', (r) => (fail ? r.abort() : r.continue()));
  await page.click('[data-tool="shapes"]');
  await page.waitForSelector('[data-icons-retry]', { timeout: 10000 });
  ok((await CV.txt(page, '.cv-iconerr p')) === 'We couldn’t load the icons. Check your connection, then try again.', 'a failed load: the error');
  ok(await page.$eval('.cv-iconerr', (e) => e.getAttribute('role') === 'alert'), 'the error is an alert');
  ok((await page.$$('[data-add-shape]')).length === 27, 'the shapes still work');
  fail = false;
  await page.click('[data-icons-retry]');
  await page.waitForSelector('[data-icon-grid]', { timeout: 15000 });
  ok(await setLoaded(), 'Retry loads the set');
  ok((await scripts()) === 1, 'one script tag (the failed one is gone)');
  await page.unroute('**/js/cover/icon-set.js');

  /* The grid. */
  const info = await page.evaluate(() => ({ v: kdpCover.iconSet.version, n: kdpCover.iconSet.rows.length, brand: kdpCover.iconSet.rows.filter((r) => r[1] === 'Brand' || /^brand-/.test(r[0])).length }));
  ok(info.v === '3.49.0' && info.n === 1019 && info.brand === 0, `Tabler ${info.v}, ${info.n} icons, ${info.brand} brand logos`);
  ok((await page.$eval('[data-icon-q]', (i) => i.placeholder)) === 'Search 1,019 icons', 'Search 1,019 icons');
  let names = await page.$$eval('[data-add-icon]', (a) => a.map((b) => b.dataset.addIcon));
  ok(names.length === 48, `48 icons at first (${names.length})`);
  ok(names.slice(0, 9).join(' ') === 'crown laurel-wreath-1 laurel-wreath-2 laurel-wreath-3 star heart leaf paw butterfly', `cover favorites first: ${names.slice(0, 9).join(', ')}`);
  ok(await page.$eval('[data-add-icon="laurel-wreath-1"]', (b) => b.innerText.trim() === 'Laurel wreath 1' && b.title === 'Laurel wreath 1'), 'tile label from the name');
  ok(await page.$eval('[data-add-icon="crown"] svg', (s) => s.getAttribute('fill') === 'currentColor' && s.querySelectorAll('path').length >= 1), 'tiles are ink (currentColor), no brand color');
  ok(/Show more \(971 more\)/.test(await CV.txt(page, '[data-icons-more]')), `Show more: ${await CV.txt(page, '[data-icons-more]')}`);
  await page.click('[data-icons-more]');
  ok((await page.$$('[data-add-icon]')).length === 144, 'Show more: 96 more');
  ok(/MIT licence/.test(await CV.txt(page, '[data-panel]')), 'the licence line');

  /* Search: name, category, tags; none; brands never. */
  await page.fill('[data-icon-q]', 'laurel');
  names = await page.$$eval('[data-add-icon]', (a) => a.map((b) => b.dataset.addIcon));
  ok(names.length >= 3 && names.every((n) => /laurel/.test(n)), `"laurel": ${names.join(', ')}`);
  // STOP 5 (owner): the full name shows on hover, so the cut "Laurel w…" tiles can be told apart.
  const titles = await page.$$eval('[data-add-icon]', (a) => a.map((b) => b.title));
  ok(new Set(titles).size === titles.length && titles.every((t) => /^Laurel wreath/.test(t)), `each tile's hover title is its full name: ${titles.join(', ')}`);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-icon-q]')), 'focus stays in the search');
  await page.fill('[data-icon-q]', 'animals');
  const animals = await page.$$eval('[data-add-icon]', (a) => a.length);
  ok(animals >= 3, `a category word finds icons ("animals": ${animals})`);
  await page.fill('[data-icon-q]', 'github');
  ok((await page.$$('[data-add-icon]')).length === 0 && /No icon matches "github"\./.test(await CV.txt(page, '[data-panel]')), 'no brand logo ("github"): No icon matches');
  await page.fill('[data-icon-q]', '');

  /* Add an icon: a shape layer with its name and Tabler's paths, 120 px, centered on the front. */
  await page.click('[data-add-icon="crown"]');
  let l = await sel();
  const want = await page.evaluate(() => { const E = window.kdpBookSteps[9]._debug(); return { paths: kdpCover.iconSet.rows.find((r) => r[0] === 'crown')[3], cx: kdpCover.geo.geo(E.cover.fmt).frontCX }; });
  ok(l && l.type === 'shape' && l.kind === 'icon' && l.icon === 'crown' && JSON.stringify(l.paths) === JSON.stringify(want.paths), 'Add: an icon layer with Tabler\'s paths');
  ok(l.w === 120 && l.h === 120 && Math.abs(l.x + 60 - want.cx) < 1e-9 && l.fill === '#1F3A5F' && l.fillMode === 'solid', 'Add: 120 px, centered on the front, navy fill');
  const bar = await CV.txt(page, '[data-textbar]');
  ok(/^Crown Fill Border 100%/.test(bar) && !(await CV.has(page, '[data-k="shape"]')), `the bar: the icon's name (not a menu), Fill, Border (${bar.slice(0, 30)})`);
  ok((await page.$$('[data-handle="box"]')).length === 8, '8 handles, as a shape');

  /* Drawn in its fill; recolored; gradient; border. */
  await page.waitForTimeout(150);
  const c = await CV.center(page, l.id);
  const px0 = await CV.px(page, c[0], c[1] + 10);
  ok(Math.abs(px0[0] - 0x1F) < 8 && Math.abs(px0[2] - 0x5F) < 8, `drawn in navy (${px0})`);
  await page.click('[data-k="sfill"]');
  await page.click('.cv-pop-sfill [data-hex="#7A2E2E"]');
  await page.waitForTimeout(150);
  const px1 = await CV.px(page, c[0], c[1] + 10);
  ok((await sel()).fill === '#7A2E2E' && Math.abs(px1[0] - 0x7A) < 8 && Math.abs(px1[1] - 0x2E) < 8, `recolored (${px1})`);
  await page.click('[data-fmode="grad"]');
  ok((await sel()).fillMode === 'grad', 'a gradient icon');
  await page.click('[data-fmode="solid"]');
  await page.keyboard.press('Escape');
  await page.click('[data-k="stroke"]');
  await page.$eval('[data-sk="sw"]', (r) => { r.value = 2; r.dispatchEvent(new Event('input', { bubbles: true })); });
  ok((await sel()).sw === 2, 'a border on the icon');
  await page.keyboard.press('Escape');
  // stretched: the side handle
  const hd = await page.$eval('[data-handle="box"][data-c="e"]', (h) => { const r = h.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(hd[0], hd[1]); await page.mouse.down(); await page.mouse.move(hd[0] + 60, hd[1], { steps: 4 }); await page.mouse.up();
  l = await sel();
  ok(l.w > 150 && l.h === 120, `stretched (${Math.round(l.w)} × ${l.h})`);

  /* The Layers row shows its drawing and name. */
  await page.click('[data-tool="layers"]');
  ok(await page.$eval(`[data-row="${l.id}"] .cv-lr-sh svg path`, (p) => !!p.getAttribute('d')) && (await CV.txt(page, `[data-pick="${l.id}"]`)) === 'Crown', 'Layers row: the icon\'s drawing and "Crown"');

  /* Saved; reload: drawn again without the icon set. */
  await CV.settled(page, 'saved');
  const saved = CV.lastSave().body.layers[0];
  ok(saved.kind === 'icon' && saved.icon === 'crown' && saved.paths.length === want.paths.length, 'saved with its name and paths');
  await CV.open(page);
  ok(!(await setLoaded()), 'after a reload the set is not loaded');
  l = (await CV.state(page)).layers[0];
  ok(l.kind === 'icon' && l.icon === 'crown', 'the icon layer is kept on load');
  await page.waitForTimeout(150);
  const c2 = await CV.center(page, l.id);
  const px2 = await CV.px(page, c2[0], c2[1] + 10);
  ok(Math.abs(px2[0] - 0x7A) < 8 && Math.abs(px2[1] - 0x2E) < 8, `and drawn (${px2})`);

  /* A damaged icon in the saved design is left out, never drawn as a rectangle. */
  globalThis.__store.design.layers = [Object.assign({}, saved, { id: 9, paths: ['M0 0 <script>'] }), saved];
  await CV.open(page);
  const ls = (await CV.state(page)).layers;
  ok(ls.length === 1 && ls[0].kind === 'icon', `bad path data: the layer is left out (${ls.length} left)`);
  ok(CV.mockErrors().length === 0, 'no mock errors');
  return log.join('\n');
};
