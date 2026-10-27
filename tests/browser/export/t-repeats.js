// E12 fix batch 2 (Part 2) in the Export dialog:
//   item 11 A  the same sentence (8+ words) in more than one section: a warning row like
//              "ends mid-sentence"; it never blocks, needs no tick, and the summary line is
//              neutral (no "Ready.") while it shows.
//   item 4     the Needs review note says how each mark clears.
//   item 9     source labels ("[S3]") never reach the file (.docx and .md).
// Screenshots at 1440 and 900.
// Run: tests/browser/run.sh export t-repeats.js
const test = async (page) => {
  const out = globalThis.__log = [];
  const ok = (name, cond, got) => E11.check(out, name, !!cond, got);
  const T = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
  const S1 = 'Starting is often the hardest part, and you can always do more than the minimum.';
  /** The ready book, with S1 added to the sections in `rep`, and Needs review on the ones in `review`. */
  async function open(width, rep = ['s21', 's42'], review = []) {
    globalThis.__modes = {};
    await setupE11(page);
    const data = globalThis.__store.exportData[E11.B1];
    const secs = data.chapters.flatMap((c) => c.sections);
    for (const id of rep) secs.find((s) => s.id === id).version.content += ` ${S1} [S3]`;
    for (const id of review) {
      const hit = data.chapters.find((c) => c.id === id);
      if (hit) hit.needs_review = true;
      else secs.find((s) => s.id === id).needs_review = true;
    }
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${E11.base}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.locator(`[data-book-menu="${E11.B1}"]`).waitFor({ timeout: 10000 });
    await page.locator(`[data-book-menu="${E11.B1}"]`).click();
    await page.locator('#bookMenu [data-action="export"]').click();
    await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  }
  const notes = () => page.locator('.exp-notes').innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  const summary = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('.exp-dialog .exp-crow')].find((r) => /No open Verify marks\./.test(r.textContent));
    return row ? { text: row.textContent.replace(/\s+/g, ' ').trim(), check: !!row.querySelector('.save-ok'), info: !!row.querySelector(':scope > svg') } : null;
  });
  const lastBlob = (kind) => page.evaluate(async (kind) => {
    const b = window.__blobs[window.__blobs.length - 1];
    if (kind === 'text') return b.text();
    const { unzip } = await import('/tests/lib/unzip.js');
    const files = await unzip(await b.arrayBuffer());
    return files.get('word/document.xml');
  }, kind);
  async function tallShot(name) {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: 2200 });
    await page.waitForTimeout(150);
    await page.locator('.exp-dialog').screenshot({ path: `${SHOTS}/${name}.png`, timeout: 10000 }).catch(() => out.push('shot timeout ' + name));
    await page.setViewportSize(vp);
  }
  const NOTE = '1 sentence appears in more than one section, such as “Starting is often the hardest part, and you can always do more than…” (2.1 and 4.2). Rewrite or cut the repeats in 06 Write. Each section’s Checks tab lists them.';

  // Two sections with the same sentence: one warning row, no tick, Export on, a neutral summary.
  await open(1440);
  ok('repeats: the note, its example and the sections', (await notes()).includes(NOTE), await notes());
  ok('repeats: the warning icon', await page.locator('.exp-notes .exp-crow', { hasText: 'more than one section' }).locator('.exp-warn svg').count() === 1);
  ok('repeats: no tick box (it never blocks)', await page.locator('.exp-dialog [data-exp-ack]').count() === 0);
  ok('repeats: Export is on', !(await page.locator('.exp-dialog [data-exp-go]').isDisabled()));
  const s1 = await summary();
  ok('repeats: the summary line is neutral: no "Ready.", the info icon', s1 && s1.text === 'All 10 sections are Final. No open Verify marks.' && s1.info && !s1.check, s1);
  ok('repeats: "Ready." is nowhere in the dialog', !(await T('.exp-dialog')).includes('Ready.'));
  await tallShot('t-repeats-dialog-1440');

  // The .docx has no source label; the sentence stays.
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('.exp-dialog [data-exp-go]').click();
  ok('the .docx downloads', (await dl).suggestedFilename() === 'chair-yoga-for-seniors-over-60.docx');
  await page.locator('.exp-dialog [data-exp-done]').waitFor({ timeout: 10000 });
  const xml = await lastBlob('docx');
  ok('.docx: no "[S3]", the sentence is there', !xml.includes('[S3]') && xml.includes('you can always do more than the minimum.'), xml.length);
  // And the .md.
  await page.locator('[data-exp-done]').click();
  await page.locator(`[data-book-menu="${E11.B1}"]`).click();
  await page.locator('#bookMenu [data-action="export"]').click();
  await page.locator('.exp-dialog [data-exp-go]').waitFor({ timeout: 10000 });
  await page.locator('input[value="md"]').check();
  const dl2 = page.waitForEvent('download', { timeout: 15000 });
  await page.locator('.exp-dialog [data-exp-go]').click();
  await dl2;
  await page.locator('.exp-dialog [data-exp-done]').waitFor({ timeout: 10000 });
  const md = await lastBlob('text');
  ok('.md: no "[S3]", the sentence ends the paragraph', !md.includes('[S3]') && md.includes(`${S1}\n`), md.slice(0, 80));

  // Three sections, and a section and a chapter marked Needs review: the note says how each clears.
  await open(1440, ['s21', 's42', 's31'], ['s32', 'c4']);
  ok('three: "(2.1, 3.1 and 4.2)"', (await notes()).includes('(2.1, 3.1 and 4.2).'), await notes());
  ok('needs review: section and chapter, how each clears', (await notes()).includes('Needs review: 3.2 and chapter 4. The positioning changed after it was written. Mark the section as reviewed in 06 Write. Approve the outline in 05 to clear the chapter.'), await notes());
  await open(1440, [], ['s32']);
  ok('needs review, one section: the 06 line only', (await notes()).includes('Needs review: 3.2. The positioning changed after it was written. Mark the section as reviewed in 06 Write.') && !(await notes()).includes('Approve the outline'), await notes());

  // At 900: the note wraps; no sideways scroll.
  await open(900);
  ok('900: the note shows', (await notes()).includes(NOTE), await notes());
  ok('900: no sideways scroll', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await tallShot('t-repeats-dialog-900');

  // None repeated: no note, and "Ready." again.
  await open(1440, []);
  ok('none: no repeat note', !(await notes()).includes('more than one section'), await notes());
  const s0 = await summary();
  ok('none: "Ready." with the green check', s0 && s0.text === 'Ready. All 10 sections are Final. No open Verify marks.' && s0.check && !s0.info, s0);

  return out.join('\n');
};
