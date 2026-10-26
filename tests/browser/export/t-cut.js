// E12 M9 (owner decision 4): the Export dialog's note for sections whose text
// ends mid-sentence. A warning like "Needs review": it never blocks, needs no
// tick, and the download still works. "Final only" leaves out a section that
// is not in the file, and its note with it. Screenshots at 1440 and 900.
// Run: tests/browser/run.sh export t-cut.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const T = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  const NOTE = '2.1 and 4.2 end mid-sentence. Finish or cut the last sentence before you publish.';
  /** The ready book with 2.1 and 4.2 cut off, as a stopped Generate leaves them. */
  async function open(width, cut = ['s21', 's42']) {
    globalThis.__modes = {};
    await setupE11(page);
    const secs = globalThis.__store.exportData[E11.B1].chapters.flatMap((c) => c.sections);
    for (const id of cut) secs.find((s) => s.id === id).version.content += ' Then roll them forward and';
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-book-menu="${E11.B1}"]`).waitFor({ timeout: 10000 });
    await page.locator(`[data-book-menu="${E11.B1}"]`).click();
    await page.locator('#bookMenu [data-action="export"]').click();
    await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  }
  const notes = () => page.locator('.exp-notes').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  async function tallShot(name) {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: 2200 });
    await page.waitForTimeout(150);
    await page.locator('.exp-dialog').screenshot({ path: `${SHOTS}/${name}.png`, timeout: 10000 }).catch(() => out.push('shot timeout ' + name));
    await page.setViewportSize(vp);
  }

  // Two sections cut: one warning row with both, the warning icon, no tick, Export on.
  await open(1440);
  ok('cut: the note names both sections', (await notes()).includes(NOTE), await notes());
  ok('cut: the warning icon, like Needs review', await page.locator('.exp-notes .exp-crow', { hasText: 'mid-sentence' }).locator('.exp-warn svg').count() === 1);
  ok('cut: no tick box (it never blocks)', await page.locator('.exp-dialog [data-exp-ack]').count() === 0);
  ok('cut: Export is on, with the Ready line', !(await page.locator('.exp-dialog [data-exp-go]').isDisabled()) && (await T('.exp-dialog')).includes('Ready.'));
  await tallShot('t-cut-dialog-1440');
  // The download still works.
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('.exp-dialog [data-exp-go]').click();
  const file = (await dl).suggestedFilename();
  ok('cut: the .docx downloads', file === 'chair-yoga-for-seniors-over-60.docx', file);

  // Final only: 4.2 is a Draft, so it is not in the file and not in the note.
  await open(1440);
  globalThis.__store.exportData[E11.B1].chapters.flatMap((c) => c.sections).find((s) => s.id === 's42').status = 'draft';
  await page.locator('.exp-dialog [data-exp-close], .exp-dialog [data-exp-cancel]').first().click();
  await page.locator(`[data-book-menu="${E11.B1}"]`).click();
  await page.locator('#bookMenu [data-action="export"]').click();
  await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  await page.locator('#expInclude').selectOption('final');
  await page.waitForTimeout(150);
  ok('final only: only 2.1, in the singular', (await notes()).includes('2.1 ends mid-sentence. Finish or cut the last sentence before you publish.') && !(await notes()).includes('4.2'), await notes());

  // One section cut, at 900: the singular; no sideways scroll.
  await open(900, ['s21']);
  ok('900: one section, "ends"', (await notes()).includes('2.1 ends mid-sentence.'), await notes());
  ok('900: no sideways scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await tallShot('t-cut-dialog-900');
  await open(900);
  await tallShot('t-cut-dialog-two-900');

  // None cut: no note.
  await open(1440, []);
  ok('none cut: no mid-sentence note', !(await notes()).includes('mid-sentence'), await notes());

  return out.join('\n');
};
