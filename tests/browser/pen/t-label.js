// E12 H2 (owner): the voice field "Point of view in your books" with the help
// line "The bio is always third person." under the select (the selects in a
// row stay level), read by screen readers through aria-describedby. The
// option labels and the saved values do not change. Screenshots at 1440 and 900.
// Run: tests/browser/run.sh pen t-label.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const open = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${E11.base}/app/pen-name.html?id=${E11.PA}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#v-perspective').waitFor({ timeout: 10000 });
    await page.waitForTimeout(200);
  };
  await open(1440);
  const f = await page.evaluate(() => {
    const sel = document.getElementById('v-perspective');
    const field = sel.closest('.field');
    const hint = document.getElementById(sel.getAttribute('aria-describedby'));
    return {
      label: document.querySelector('label[for="v-perspective"]').textContent.trim(),
      hint: hint ? hint.textContent.trim() : null,
      order: [...field.children].map((e) => e.tagName.toLowerCase()),
      options: [...sel.options].map((o) => [o.value, o.textContent.trim()]),
      value: sel.value,
      // The selects of one row stay level: Reading level and Point of view tops match.
      level: Math.abs(sel.getBoundingClientRect().top - document.getElementById('v-reading_level').getBoundingClientRect().top),
      others: ['reading_level', 'sentences', 'paragraphs'].map((k) => document.getElementById(`v-${k}`).getAttribute('aria-describedby'))
    };
  });
  ok('the label: "Point of view in your books"', f.label === 'Point of view in your books', f.label);
  ok('the help line, linked by aria-describedby', f.hint === 'The bio is always third person.', f.hint);
  ok('the help line sits under the select', JSON.stringify(f.order) === JSON.stringify(['label', 'select', 'span']), f.order);
  ok('the options and values are the same as before', JSON.stringify(f.options) === JSON.stringify([['', 'Not set'], ['second', 'Second person (you)'], ['first', 'First person (I)'], ['third', 'Third person']]), f.options);
  ok('the saved value shows: Third person', f.value === 'third', f.value);
  ok('the selects in the row stay level', f.level < 1, f.level);
  ok('the other voice fields have no help line', f.others.every((x) => x === null), f.others);
  await page.screenshot({ path: `${SHOTS}/t-label-1440.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout 1440'));
  // The owner's live-check step: set Second person (you); the autosave sends the same voice key.
  await page.locator('#v-perspective').selectOption('second');
  await page.waitForTimeout(1500);   // the autosave's debounce, then the PATCH
  const patches = globalThis.__store.penPatches;
  const last = patches[patches.length - 1];
  ok('the save sends voice.perspective "second"', !!last && last.voice && last.voice.perspective === 'second', patches);
  await open(900);
  ok('900: no sideways scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const wrap = await page.evaluate(() => document.querySelector('label[for="v-perspective"]').getBoundingClientRect().height);
  out.push(`INFO 900: the label is ${Math.round(wrap)} px tall`);
  await page.screenshot({ path: `${SHOTS}/t-label-900.png`, fullPage: true, timeout: 10000 }).catch(() => out.push('shot timeout 900'));
  await page.locator('.pen-panel', { has: page.locator('#v-perspective') }).screenshot({ path: `${SHOTS}/t-label-900-voice.png`, timeout: 10000 }).catch(() => out.push('shot timeout 900 voice'));
  return out.join('\n');
};
