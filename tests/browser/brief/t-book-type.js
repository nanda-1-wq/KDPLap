// i13 on step 01: the book type list, "Other" with its own label (1 to 40),
// both columns saved together, reload, a list type clears the label.
const test = async page => {
  const log = globalThis.__log = [];
  const ok = (cond, msg) => log.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  const st = globalThis.__store;
  const W = () => st.writes.filter((w) => w.table === 'book_briefs');
  const settle = () => page.waitForTimeout(1100);
  const open = async (id) => {
    await page.goto(`http://127.0.0.1:5500/app/book.html?id=${id}&step=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bf-book_type', { timeout: 10000 });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. The list: Not set, the 11 types, Other last.
  await open(B2);
  const opts = await page.$$eval('#bf-book_type option', (o) => o.map((x) => [x.value, x.textContent]));
  ok(opts.length === 13 && opts[0][0] === '' && opts[0][1] === 'Not set', `13 options, first Not set (${opts.length})`);
  ok(opts.some(([k, t]) => k === 'health_wellness' && t === 'Health and wellness guide'), 'Health and wellness guide is there');
  ok(JSON.stringify(opts.at(-1)) === '["other","Other"]', 'Other is last');
  ok(await page.inputValue('#bf-book_type') === 'beginner_guide', 'saved type is selected');
  ok(!(await page.$('#bf-book_type_label')), 'no label field for a list type');

  // 2. Pick Other: the field shows and gets focus; type and pick save together.
  let n = W().length;
  await page.selectOption('#bf-book_type', 'other');
  await page.waitForSelector('#bf-book_type_label', { timeout: 3000 });
  ok(await page.evaluate(() => document.activeElement.id === 'bf-book_type_label'), 'focus moves to Your book type');
  ok(/A short name, for example Gardening guide\. Up to 40 characters\./.test(await page.innerText('[data-type-other]')), 'hint text');
  ok(await page.getAttribute('#bf-book_type_label', 'maxlength') === '40', 'maxlength 40');
  await settle();
  let w = W().slice(n);
  ok(w.length === 1 && w[0].body.book_type === 'other' && w[0].body.book_type_label === null, `Other alone saves other + null label (${JSON.stringify(w.map((x) => x.body))})`);

  n = W().length;
  const label = 'Seated fitness and gentle mobility guide';   // exactly 40
  await page.type('#bf-book_type_label', label + ' and more', { delay: 5 });
  ok((await page.inputValue('#bf-book_type_label')) === label, 'typing stops at 40 characters');
  await settle();
  w = W().slice(n);
  const last = w.at(-1);
  ok(last && last.body.book_type === 'other' && last.body.book_type_label === label, `label saves with the type (${JSON.stringify(last && last.body)})`);
  ok(!w.some((x) => x.failed) && st.books[B2].brief.book_type_label === label, 'stored');

  // 3. Clearing the label saves null (no error).
  n = W().length;
  await page.fill('#bf-book_type_label', '   ');
  await page.click('#bf-topic_text');
  await settle();
  ok(W().slice(n).at(-1)?.body.book_type_label === null && st.books[B2].brief.book_type === 'other', 'blank label saves null, type stays other');
  await page.fill('#bf-book_type_label', 'Gardening guide');
  await page.click('#bf-topic_text');
  await settle();

  // 4. Reload keeps Other and the label.
  await open(B2);
  ok(await page.inputValue('#bf-book_type') === 'other' && await page.inputValue('#bf-book_type_label') === 'Gardening guide', 'reload: Other + label');

  // 5. A list type hides the field and clears the label in the same save.
  n = W().length;
  await page.selectOption('#bf-book_type', 'memoir');
  await settle();
  w = W().slice(n);
  ok(w.length === 1 && w[0].body.book_type === 'memoir' && w[0].body.book_type_label === null, `memoir + null label in one save (${JSON.stringify(w.map((x) => x.body))})`);
  ok(!(await page.$('#bf-book_type_label')), 'field hidden');
  ok(st.books[B2].brief.book_type_label === null, 'label cleared in the store');

  // 6. Back to Other: empty field (the old label is gone).
  await page.selectOption('#bf-book_type', 'other');
  await page.waitForSelector('#bf-book_type_label');
  ok((await page.inputValue('#bf-book_type_label')) === '', 'Other again starts empty');
  await page.selectOption('#bf-book_type', '');
  await settle();
  ok(st.books[B2].brief.book_type === null && st.books[B2].brief.book_type_label === null, 'Not set saves null + null');

  // 7. A book saved as Other loads with its label.
  await open(B4);
  ok(await page.inputValue('#bf-book_type') === 'other' && await page.inputValue('#bf-book_type_label') === 'Gardening guide', 'B4 loads Other + label');
  await page.screenshot({ path: `${SHOTS}/brief-book-type-other.png`, timeout: 5000 }).catch(() => {});
  ok(!st.writes.some((x) => x.failed), 'no refused write');
  return log.join('\n');
};
